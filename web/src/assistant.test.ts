import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assistantAsksToAddToCart,
  assistantAsksToConfirm,
  assistantContentBlocks,
  assistantInlineParts,
  assistantParagraphs,
  stripModelThinking,
  visibleAssistantText,
} from "@smartshop/shared";
import { assistantFailureMessage, normalizeAssistantResponse } from "./assistant";

describe("assistantFailureMessage", () => {
  it("uses nested error.message when present", () => {
    assert.equal(
      assistantFailureMessage(401, { error: { message: "Missing Authentication Token" } }),
      "Missing Authentication Token",
    );
  });

  it("uses AWS top-level message for RuntimeClientError", () => {
    assert.equal(
      assistantFailureMessage(424, { message: "container returned 401" }, "RuntimeClientError"),
      "Assistant runtime error: container returned 401",
    );
  });
});

describe("normalizeAssistantResponse", () => {
  it("reads the agent JSON reply", () => {
    const body = normalizeAssistantResponse({
      conversationId: "conv-abc12345",
      reply: "I found a keyboard",
      toolsUsed: ["search_products"],
    });
    assert.equal(body?.reply, "I found a keyboard");
    assert.deepEqual(body?.toolsUsed, ["search_products"]);
  });

  it("unwraps a string response envelope", () => {
    const body = normalizeAssistantResponse({
      response: JSON.stringify({
        conversationId: "conv-abc12345",
        reply: "Added to cart",
        toolsUsed: [],
      }),
    });
    assert.equal(body?.reply, "Added to cart");
  });
});

describe("assistant display text", () => {
  it("strips thinking tags from Nova replies", () => {
    assert.equal(
      stripModelThinking(
        "<thinking>I have the quote.</thinking> The current quote for your cart is $94.98.",
      ),
      "The current quote for your cart is $94.98.",
    );
  });

  it("breaks quote lines and detects a confirm prompt", () => {
    const raw =
      "The current quote for your cart with STANDARD delivery is: - Subtotal: $89.99 - Delivery: $4.99 - Total: $94.98 Would you like to place this order?";
    assert.equal(assistantAsksToConfirm(raw), true);
    assert.deepEqual(assistantParagraphs(raw), [
      "The current quote for your cart with STANDARD delivery is:",
      "Subtotal: $89.99",
      "Delivery: $4.99",
      "Total: $94.98",
      "Would you like to place this order?",
    ]);
    assert.equal(visibleAssistantText("<thinking>hide me</thinking> Hello"), "Hello");
  });

  it("does not split What would you like", () => {
    assert.deepEqual(
      assistantParagraphs("What would you like to add to your cart? Please provide the product name or ID."),
      ["What would you like to add to your cart? Please provide the product name or ID."],
    );
  });

  it("renders product markdown as blocks and inline bold", () => {
    const blocks = assistantContentBlocks(
      "Here is a mechanical keyboard from our catalogue:\n**Mechanical Keyboard**\n- Price: $89.99\n- Compact 75% keyboard with hot-swap switches.\nWould you like to add it to your cart?",
    );
    assert.deepEqual(blocks[1], { type: "p", text: "**Mechanical Keyboard**" });
    assert.equal(blocks[2]?.type, "ul");
    assert.equal(assistantAsksToAddToCart("Would you like to add it to your cart?"), true);
    assert.deepEqual(assistantInlineParts("**Mechanical Keyboard**"), [
      { text: "Mechanical Keyboard", bold: true },
    ]);
  });
});
