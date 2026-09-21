import { z } from "zod";
import { deliveryMethodSchema } from "./delivery.js";
import { productIdSchema } from "./product.js";
import { orderIdSchema } from "./order.js";

export const USER_ID_HEADER = "x-smartshop-user-id";
export const USER_CONFIRMED_HEADER = "x-smartshop-user-confirmed";

export const assistantToolNameSchema = z.enum([
  "search_products",
  "get_product",
  "get_cart",
  "upsert_cart_item",
  "remove_cart_item",
  "set_delivery",
  "get_quote",
  "confirm_order",
  "list_orders",
  "get_order",
]);

export type AssistantToolName = z.infer<typeof assistantToolNameSchema>;

export const conversationIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, "Invalid conversation id");

export const assistantToolRequestSchema = z.object({
  conversationId: conversationIdSchema,
  tool: assistantToolNameSchema,
  args: z.record(z.unknown()).optional().default({}),
});

export type AssistantToolRequest = z.infer<typeof assistantToolRequestSchema>;

export function stripForgedUserId(args: Record<string, unknown>): Record<string, unknown> {
  const { userId: _ignored, ...rest } = args;
  return rest;
}

export const searchProductsArgsSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const getProductArgsSchema = z.object({
  productId: productIdSchema,
});

export const upsertCartItemArgsSchema = z.object({
  productId: productIdSchema,
  quantity: z.number().int().min(1),
});

export const removeCartItemArgsSchema = z.object({
  productId: productIdSchema,
});

export const setDeliveryArgsSchema = z.object({
  deliveryMethod: deliveryMethodSchema,
});

export const getQuoteArgsSchema = z.object({
  deliveryMethod: deliveryMethodSchema.optional(),
});

export const confirmOrderArgsSchema = z.object({
  confirm: z.literal(true),
  deliveryMethod: deliveryMethodSchema.optional(),
});

export const getOrderArgsSchema = z.object({
  orderId: orderIdSchema,
});

const EXPLICIT_YES =
  /^(yes|yep|yeah|ok yes|okay yes|confirm|confirmed|confirm order|place it|place the order|place order|yes[,.]?\s*place it|yes[,.]?\s*place the order|yes[,.]?\s*place order|yes[,.]?\s*order|yes[,.]?\s*confirm(?:\s+(?:the\s+)?order)?)$/i;

export function isExplicitConfirm(message: string): boolean {
  const normalized = message.trim().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }
  if (/sounds good|looks good|great|thanks|ok$|okay$/i.test(normalized) && !/^yes/i.test(normalized)) {
    return false;
  }
  return EXPLICIT_YES.test(normalized);
}

export function stripModelThinking(text: string): string {
  return text
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<\/?thinking\b[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function visibleAssistantText(text: string): string {
  let visible = stripModelThinking(text);
  if (/\b(subtotal|delivery|total)\b/i.test(visible) && visible.includes(" - ")) {
    visible = visible.replace(/\s+-\s+/g, "\n");
  }
  return visible.replace(/(?<![Ww]hat)\s+(Would you like\b)/g, "\n\n$1").trim();
}

export function assistantParagraphs(text: string): string[] {
  return visibleAssistantText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export type AssistantContentBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export function assistantContentBlocks(text: string): AssistantContentBlock[] {
  const blocks: AssistantContentBlock[] = [];
  for (const line of assistantParagraphs(text)) {
    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") {
        last.items.push(listMatch[1]);
      } else {
        blocks.push({ type: "ul", items: [listMatch[1]] });
      }
      continue;
    }
    blocks.push({ type: "p", text: line });
  }
  return blocks;
}

export function assistantInlineParts(text: string): { text: string; bold?: boolean }[] {
  const parts: { text: string; bold?: boolean }[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start) });
    }
    parts.push({ text: match[1], bold: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor) });
  }
  return parts.length ? parts : [{ text }];
}

export function assistantAsksToConfirm(text: string): boolean {
  return /would you like to (?:place|confirm|proceed)|place this order|confirm this order|proceed with (?:the |this )?order/i.test(
    visibleAssistantText(text),
  );
}

export function assistantAsksToAddToCart(text: string): boolean {
  return /add (?:it |this |them )?(?:to )?(?:your |the )?cart/i.test(visibleAssistantText(text));
}

export const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(4000),
});

export type ChatTurn = z.infer<typeof chatTurnSchema>;

export const assistantInvokeRequestSchema = z.object({
  conversationId: conversationIdSchema.optional(),
  message: z.string().max(8000).optional(),
  imageObjectKey: z.string().min(1).max(512).optional(),
  history: z.array(chatTurnSchema).max(16).optional(),
});

export type AssistantInvokeRequest = z.infer<typeof assistantInvokeRequestSchema>;

export const assistantInvokeResponseSchema = z.object({
  conversationId: conversationIdSchema,
  reply: z.string(),
  toolsUsed: z.array(assistantToolNameSchema),
  orderNumber: z.string().optional(),
});

export type AssistantInvokeResponse = z.infer<typeof assistantInvokeResponseSchema>;
