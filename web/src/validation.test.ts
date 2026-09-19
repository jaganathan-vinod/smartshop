import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { passwordPolicyIssues } from "./validation";

describe("passwordPolicyIssues", () => {
  it("accepts a Cognito-compliant password", () => {
    assert.deepEqual(passwordPolicyIssues("Coffee12"), []);
  });

  it("lists missing rules", () => {
    assert.ok(passwordPolicyIssues("short").includes("at least 8 characters"));
    assert.ok(passwordPolicyIssues("alllowercase1").includes("an uppercase letter"));
  });
});
