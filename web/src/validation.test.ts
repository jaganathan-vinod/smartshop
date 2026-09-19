import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cognitoErrorMessage,
  isAlreadyAuthenticated,
  isNetworkFailure,
  isUsernameTaken,
  passwordPolicyIssues,
} from "./validation";

describe("passwordPolicyIssues", () => {
  it("accepts a Cognito-compliant password", () => {
    assert.deepEqual(passwordPolicyIssues("Coffee12"), []);
  });

  it("lists missing rules", () => {
    assert.ok(passwordPolicyIssues("short").includes("at least 8 characters"));
    assert.ok(passwordPolicyIssues("alllowercase1").includes("an uppercase letter"));
  });
});

describe("cognitoErrorMessage", () => {
  it("tells an existing user to sign in", () => {
    assert.match(
      cognitoErrorMessage({ name: "UsernameExistsException" }),
      /already exists/i,
    );
  });

  it("maps an already-signed-in Cognito error", () => {
    assert.equal(
      cognitoErrorMessage({ name: "UserAlreadyAuthenticatedException" }),
      "You are already signed in.",
    );
    assert.equal(isAlreadyAuthenticated({ name: "UserAlreadyAuthenticatedException" }), true);
    assert.equal(
      isAlreadyAuthenticated(new Error("There is already a signed in user.")),
      true,
    );
    assert.equal(isUsernameTaken({ name: "UsernameExistsException" }), true);
  });

  it("does not treat a missing ID token as a wrong password", () => {
    assert.equal(
      cognitoErrorMessage(new Error("Sign-in session is not ready. Try again.")),
      "Sign-in session is not ready. Try again.",
    );
  });

  it("maps browser Failed to fetch to a reachable-API message", () => {
    const failed = new TypeError("Failed to fetch");
    assert.equal(isNetworkFailure(failed), true);
    assert.equal(
      cognitoErrorMessage(failed),
      "Signed in, but SmartShop could not be reached. Try again.",
    );
    const wrapped = Object.assign(new Error("Could not reach SmartShop. Try again."), {
      name: "ApiRequestError",
      code: "NETWORK_ERROR",
    });
    assert.equal(isNetworkFailure(wrapped), true);
    assert.equal(
      cognitoErrorMessage(wrapped),
      "Signed in, but SmartShop could not be reached. Try again.",
    );
  });
});
