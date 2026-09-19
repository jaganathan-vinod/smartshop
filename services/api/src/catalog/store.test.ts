import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORY_INDEX_NAME, categoryIndexQueryInput } from "./store.js";

describe("categoryIndexQueryInput", () => {
  it("queries the existing category GSI by exact category", () => {
    assert.deepEqual(categoryIndexQueryInput("products-table", "electronics"), {
      TableName: "products-table",
      IndexName: CATEGORY_INDEX_NAME,
      KeyConditionExpression: "category = :category",
      ExpressionAttributeValues: {
        ":category": "electronics",
      },
    });
    assert.equal(CATEGORY_INDEX_NAME, "category-index");
  });
});
