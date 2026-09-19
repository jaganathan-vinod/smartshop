import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { JWT_PROTECTED_METHODS } from "./jwt-proxy-methods";

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
});
