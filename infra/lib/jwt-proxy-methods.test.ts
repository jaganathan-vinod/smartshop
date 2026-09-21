import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { JWT_PROTECTED_METHODS, INTERNAL_ASSISTANT_TOOLS_PATH } from "./jwt-proxy-methods";

describe("JWT_PROTECTED_METHODS", () => {
  it("covers CRUD verbs without OPTIONS or ANY so CORS preflight stays public", () => {
    assert.deepEqual(JWT_PROTECTED_METHODS, [
      HttpMethod.GET,
      HttpMethod.POST,
      HttpMethod.PUT,
      HttpMethod.PATCH,
      HttpMethod.DELETE,
    ]);
    assert.equal(JWT_PROTECTED_METHODS.includes(HttpMethod.OPTIONS), false);
    assert.equal(JWT_PROTECTED_METHODS.includes(HttpMethod.ANY), false);
  });

  it("keeps internal assistant tools off the JWT catch-all path name", () => {
    assert.equal(INTERNAL_ASSISTANT_TOOLS_PATH, "/v1/internal/assistant/tools");
    assert.equal(INTERNAL_ASSISTANT_TOOLS_PATH.includes("{proxy+}"), false);
  });
});
