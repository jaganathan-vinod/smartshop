import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chatPaneVisible,
  chatRedirectPath,
  isAuthRoute,
  isChatRoute,
  storeLocationKey,
} from "./chatPaths";

describe("chat pane paths", () => {
  it("treats login, signup, and confirm as auth routes", () => {
    assert.equal(isAuthRoute("/login"), true);
    assert.equal(isAuthRoute("/signup"), true);
    assert.equal(isAuthRoute("/confirm"), true);
    assert.equal(isAuthRoute("/cart"), false);
  });

  it("does not remember auth or /chat as the store page", () => {
    assert.equal(storeLocationKey("/login"), null);
    assert.equal(storeLocationKey("/chat"), null);
    assert.equal(storeLocationKey("/products/kb-01"), "/products/kb-01");
    assert.equal(storeLocationKey("/", "?q=keyboard"), "/?q=keyboard");
  });

  it("sends /chat back to the last store page", () => {
    assert.equal(chatRedirectPath("/products/kb-01"), "/products/kb-01");
    assert.equal(chatRedirectPath(""), "/");
  });

  it("hides the pane on auth pages even when open", () => {
    assert.equal(isChatRoute("/chat"), true);
    assert.equal(
      chatPaneVisible({ open: true, signedIn: true, pathname: "/products/kb-01" }),
      true,
    );
    assert.equal(chatPaneVisible({ open: true, signedIn: true, pathname: "/login" }), false);
    assert.equal(chatPaneVisible({ open: true, signedIn: false, pathname: "/" }), false);
    assert.equal(chatPaneVisible({ open: false, signedIn: true, pathname: "/" }), false);
  });
});
