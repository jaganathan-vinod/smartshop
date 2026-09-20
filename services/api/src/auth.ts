import { AsyncLocalStorage } from "node:async_hooks";
import type { LambdaContext, LambdaEvent } from "hono/aws-lambda";

export type JwtClaims = {
  sub: string;
  email?: string;
  name?: string;
  groups: string[];
};

type RequestStore = {
  claims: JwtClaims | null;
  requestId: string;
};

const storage = new AsyncLocalStorage<RequestStore>();

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

function emailLike(value: string | undefined): string | undefined {
  return value && value.includes("@") ? value : undefined;
}

export function parseGroups(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseGroups(parsed);
    } catch {
      return [value];
    }
  }
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function fromRecord(claims: Record<string, unknown>): JwtClaims | null {
  const sub = asString(claims.sub);
  if (!sub) {
    return null;
  }
  return {
    sub,
    email: asString(claims.email) ?? emailLike(asString(claims["cognito:username"])),
    name: asString(claims.name) ?? asString(claims.given_name),
    groups: parseGroups(claims["cognito:groups"]),
  };
}

export function claimsFromEvent(event: LambdaEvent): JwtClaims | null {
  const requestContext = "requestContext" in event ? event.requestContext : undefined;
  if (!requestContext || typeof requestContext !== "object") {
    return null;
  }

  const authorizer = "authorizer" in requestContext ? requestContext.authorizer : undefined;
  if (!authorizer || typeof authorizer !== "object") {
    return null;
  }

  if ("jwt" in authorizer && authorizer.jwt && typeof authorizer.jwt === "object") {
    const jwt = authorizer.jwt as { claims?: Record<string, unknown> };
    if (jwt.claims) {
      return fromRecord(jwt.claims);
    }
  }

  if ("claims" in authorizer && authorizer.claims && typeof authorizer.claims === "object") {
    return fromRecord(authorizer.claims as Record<string, unknown>);
  }

  return null;
}

export function runWithClaims<T>(
  claims: JwtClaims | null,
  fn: () => T,
): T {
  return storage.run(
    { claims, requestId: currentRequestId() ?? "test" },
    fn,
  );
}

export function currentClaims(): JwtClaims | null {
  return storage.getStore()?.claims ?? null;
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function requireUser(): JwtClaims {
  const claims = currentClaims();
  if (!claims) {
    throw Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" });
  }
  return claims;
}

export function requireAdmin(): JwtClaims {
  const claims = requireUser();
  if (!claims.groups.includes("admin")) {
    throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
  }
  return claims;
}

export type AwsHandler = (
  event: LambdaEvent,
  context?: LambdaContext,
) => Promise<unknown>;

export function withClaims(handler: AwsHandler): AwsHandler {
  return async (event, context) => {
    const requestId =
      context &&
      typeof context === "object" &&
      "awsRequestId" in context &&
      typeof context.awsRequestId === "string"
        ? context.awsRequestId
        : crypto.randomUUID();
    return storage.run(
      { claims: claimsFromEvent(event), requestId },
      () => handler(event, context),
    );
  };
}
