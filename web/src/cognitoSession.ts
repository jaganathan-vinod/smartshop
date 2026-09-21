import { ensureAmplify } from "./amplify";
import { isAlreadyAuthenticated } from "./validation";

type CognitoUser = {
  username: string;
  signInDetails?: { loginId?: string };
};

export function sameCognitoLogin(current: CognitoUser, username: string): boolean {
  const needle = username.trim().toLowerCase();
  return (
    current.username.toLowerCase() === needle ||
    current.signInDetails?.loginId?.toLowerCase() === needle
  );
}

export async function getIdToken(forceRefresh = false): Promise<string | undefined> {
  await ensureAmplify();
  const { fetchAuthSession } = await import("aws-amplify/auth");
  const session = await fetchAuthSession({ forceRefresh });
  return session.tokens?.idToken?.toString();
}

export async function getAccessToken(forceRefresh = false): Promise<string | undefined> {
  await ensureAmplify();
  const { fetchAuthSession } = await import("aws-amplify/auth");
  const session = await fetchAuthSession({ forceRefresh });
  return session.tokens?.accessToken?.toString();
}

export async function requireAssistantToken(): Promise<string> {
  const access = await getAccessToken(false);
  if (access) {
    return access;
  }
  return requireIdToken();
}

export async function requireIdToken(): Promise<string> {
  const existing = await getIdToken(false);
  if (existing) {
    return existing;
  }
  const refreshed = await getIdToken(true);
  if (refreshed) {
    return refreshed;
  }
  throw new Error("Sign-in session is not ready. Try again.");
}

export function groupsFromIdToken(token: string): string[] {
  const parts = token.split(".");
  if (parts.length < 2) {
    return [];
  }
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(padded)) as { "cognito:groups"?: unknown };
    const groups = json["cognito:groups"];
    if (Array.isArray(groups)) {
      return groups.filter((item): item is string => typeof item === "string");
    }
    if (typeof groups === "string" && groups.length > 0) {
      return groups.split(",").map((part) => part.trim()).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

export function tokenHasAdminGroup(token: string | undefined): boolean {
  return Boolean(token && groupsFromIdToken(token).includes("admin"));
}

export async function signOutIfNeeded(): Promise<void> {
  await ensureAmplify();
  const { getCurrentUser, signOut } = await import("aws-amplify/auth");
  try {
    await getCurrentUser();
    await signOut();
  } catch {
    // No local Cognito session yet.
  }
}

export async function signInWithPassword(username: string, password: string) {
  await ensureAmplify();
  const { getCurrentUser, signIn, signOut } = await import("aws-amplify/auth");
  try {
    const current = await getCurrentUser();
    if (sameCognitoLogin(current, username) && (await getIdToken())) {
      return { isSignedIn: true, nextStep: { signInStep: "DONE" as const } };
    }
    await signOut();
  } catch {
    // No local Cognito session yet.
  }
  try {
    const result = await signIn({ username, password });
    if (result.isSignedIn) {
      await requireIdToken();
    }
    return result;
  } catch (error) {
    if (!isAlreadyAuthenticated(error)) {
      throw error;
    }
    await signOut();
    const result = await signIn({ username, password });
    if (result.isSignedIn) {
      await requireIdToken();
    }
    return result;
  }
}
