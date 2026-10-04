import { CognitoJwtVerifier } from "aws-jwt-verify";
import { parseGroups, type JwtClaims } from "../../auth.js";
import { resolveAdminGroups } from "../groups.js";

export class AguiAuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AguiAuthError";
    this.status = status;
  }
}

type TokenVerifier = (token: string) => Promise<JwtClaims>;

let verifierOverride: TokenVerifier | null = null;
let cached: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

export function setAguiTokenVerifierForTests(verifier: TokenVerifier | null): void {
  verifierOverride = verifier;
  cached = undefined;
}

export async function verifyAdminBearer(authorization: string | undefined): Promise<JwtClaims> {
  const token = bearer(authorization);
  if (!token) {
    throw new AguiAuthError(401, "Sign in required");
  }
  const claims = verifierOverride ? await verifierOverride(token) : await verifyIdToken(token);
  const groups = await resolveAdminGroups(claims);
  if (!groups.includes("admin")) {
    throw new AguiAuthError(403, "Admin role required");
  }
  return { ...claims, groups };
}

function bearer(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

async function verifyIdToken(token: string): Promise<JwtClaims> {
  const userPoolId = process.env.USER_POOL_ID?.trim();
  const clientId = process.env.USER_POOL_CLIENT_ID?.trim();
  if (!userPoolId || !clientId) {
    throw new AguiAuthError(401, "Sign in required");
  }
  if (!cached) {
    cached = CognitoJwtVerifier.create({ userPoolId, tokenUse: "id", clientId });
  }
  try {
    const payload = await cached.verify(token);
    return claimsFromPayload(payload);
  } catch {
    throw new AguiAuthError(401, "Sign in required");
  }
}

function claimsFromPayload(payload: Record<string, unknown>): JwtClaims {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    throw new AguiAuthError(401, "Sign in required");
  }
  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    username: typeof payload["cognito:username"] === "string" ? payload["cognito:username"] : undefined,
    groups: parseGroups(payload["cognito:groups"]),
  };
}
