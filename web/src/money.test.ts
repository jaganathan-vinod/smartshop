import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCents } from "./money";

describe("formatCents", () => {
  it("formats USD from integer cents", () => {
    assert.equal(formatCents(10499), "$104.99");
    assert.equal(formatCents(0), "$0.00");
  });
});
