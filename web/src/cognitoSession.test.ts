import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sameCognitoLogin } from "./cognitoSession";

describe("sameCognitoLogin", () => {
  it("matches email loginId when username is a Cognito UUID", () => {
    assert.equal(
      sameCognitoLogin(
        { username: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", signInDetails: { loginId: "a@example.com" } },
        "a@example.com",
      ),
      true,
    );
  });

  it("does not reuse another user’s leftover session", () => {
    assert.equal(
      sameCognitoLogin(
        { username: "other@example.com", signInDetails: { loginId: "other@example.com" } },
        "a@example.com",
      ),
      false,
    );
  });
});
