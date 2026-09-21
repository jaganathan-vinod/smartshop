import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupsFromIdToken, tokenHasAdminGroup } from "./cognitoSession";

function tokenWithPayload(payload: Record<string, unknown>): string {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `hdr.${json}.sig`;
}

describe("admin group from ID token", () => {
  it("reads cognito:groups array", () => {
    const token = tokenWithPayload({ sub: "admin-1", "cognito:groups": ["admin"] });
    assert.deepEqual(groupsFromIdToken(token), ["admin"]);
    assert.equal(tokenHasAdminGroup(token), true);
  });

  it("does not treat a customer token as admin", () => {
    const token = tokenWithPayload({ sub: "user-a" });
    assert.equal(tokenHasAdminGroup(token), false);
  });
});
