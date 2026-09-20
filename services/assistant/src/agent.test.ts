import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeJwtSub, converseMessagesFromHistory } from "./agent.js";

describe("decodeJwtSub", () => {
  it("reads sub from a JWT payload", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "user-sub-12345" }),
      "utf8",
    ).toString("base64url");
    const token = `header.${payload}.sig`;
    assert.equal(decodeJwtSub(`Bearer ${token}`), "user-sub-12345");
  });

  it("rejects a missing token", () => {
    assert.equal(decodeJwtSub(undefined), null);
  });

  it("reads the first Authorization value when Node gives an array", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "user-sub-12345" }),
      "utf8",
    ).toString("base64url");
    const token = `header.${payload}.sig`;
    assert.equal(decodeJwtSub([`Bearer ${token}`]), "user-sub-12345");
  });
});

describe("converseMessagesFromHistory", () => {
  it("drops a leading assistant greeting so Converse starts on user", () => {
    const messages = converseMessagesFromHistory([
      { role: "assistant", text: "Hello" },
      { role: "user", text: "mechanical keyboard" },
      { role: "assistant", text: "Here is a mechanical keyboard" },
    ]);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages.length, 2);
  });
});
