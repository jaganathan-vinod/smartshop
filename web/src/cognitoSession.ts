import { ensureAmplify } from "./amplify";
import { isAlreadyAuthenticated } from "./validation";

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
    if (current.username.toLowerCase() === username.toLowerCase()) {
      return { isSignedIn: true, nextStep: { signInStep: "DONE" as const } };
    }
    await signOut();
  } catch {
    // No local Cognito session yet.
  }
  try {
    return await signIn({ username, password });
  } catch (error) {
    if (!isAlreadyAuthenticated(error)) {
      throw error;
    }
    await signOut();
    return signIn({ username, password });
  }
}
