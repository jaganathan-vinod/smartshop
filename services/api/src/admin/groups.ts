import {
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import type { JwtClaims } from "../auth.js";
import { logJson } from "../log.js";

const TTL_MS = 60_000;
const cache = new Map<string, { groups: string[]; expiresAt: number }>();

type GroupLookup = (claims: JwtClaims) => Promise<string[]>;

let lookupOverride: GroupLookup | null = null;
let client: CognitoIdentityProviderClient | undefined;

export function setAdminGroupLookupForTests(lookup: GroupLookup | null): void {
  lookupOverride = lookup;
  cache.clear();
}

function cognitoClient(): CognitoIdentityProviderClient {
  if (!client) {
    client = new CognitoIdentityProviderClient({});
  }
  return client;
}

async function listGroupsForUsername(userPoolId: string, username: string): Promise<string[]> {
  const result = await cognitoClient().send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    }),
  );
  return (result.Groups ?? [])
    .map((group) => group.GroupName)
    .filter((name): name is string => Boolean(name));
}

async function fetchGroups(claims: JwtClaims): Promise<string[]> {
  if (lookupOverride) {
    return lookupOverride(claims);
  }
  const userPoolId = process.env.USER_POOL_ID?.trim();
  if (!userPoolId) {
    return claims.groups;
  }
  const candidates = [claims.username, claims.email, claims.sub].filter(
    (value): value is string => Boolean(value),
  );
  let lastError: unknown;
  for (const username of candidates) {
    try {
      return await listGroupsForUsername(userPoolId, username);
    } catch (error) {
      lastError = error;
    }
  }
  logJson({
    msg: "admin-group-lookup-failed",
    userId: claims.sub,
    error: lastError instanceof Error ? lastError.name : "unknown",
  });
  return claims.groups;
}

export async function resolveAdminGroups(claims: JwtClaims): Promise<string[]> {
  if (claims.groups.length > 0) {
    return claims.groups;
  }
  const cached = cache.get(claims.sub);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.groups;
  }
  const groups = await fetchGroups(claims);
  cache.set(claims.sub, { groups, expiresAt: Date.now() + TTL_MS });
  return groups;
}
