import {
  confirmOrderArgsSchema,
  getOrderArgsSchema,
  getProductArgsSchema,
  getQuoteArgsSchema,
  productIdSchema,
  removeCartItemArgsSchema,
  searchProductsArgsSchema,
  setDeliveryArgsSchema,
  stripForgedUserId,
  type AssistantToolName,
} from "@smartshop/shared";
import { deleteCartItem, getCartLines, upsertCartItem } from "../cart/store.js";
import { getProduct, listCatalogProducts } from "../catalog/store.js";
import { getUser } from "../identity/store.js";
import { confirmOrder, getOrderForUser, listOrders, OrderError } from "../orders/store.js";
import { computeQuote, PricingError } from "../pricing/engine.js";
import { ensureConversation, putConversation } from "./conversations.js";

export class AssistantToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AssistantToolError";
  }
}

export type DispatchInput = {
  userId: string;
  conversationId: string;
  tool: AssistantToolName;
  args: Record<string, unknown>;
  userConfirmed: boolean;
};

function publicProduct(product: {
  productId: string;
  name: string;
  description: string;
  category: string;
  unitPriceCents: number;
  currency: string;
  stockQty: number;
  imageUrl: string;
}) {
  return {
    productId: product.productId,
    name: product.name,
    description: product.description,
    category: product.category,
    unitPriceCents: product.unitPriceCents,
    currency: product.currency,
    stockQty: product.stockQty,
    imageUrl: product.imageUrl,
  };
}

export function resolveUpsertProductId(
  requested: unknown,
  offered: string[] | undefined,
): string | undefined {
  const offeredIds = offered ?? [];
  const parsed =
    typeof requested === "string" ? productIdSchema.safeParse(requested.trim()) : undefined;
  const requestedId = parsed?.success ? parsed.data : undefined;
  if (requestedId && offeredIds.includes(requestedId)) {
    return requestedId;
  }
  if (offeredIds.length === 1) {
    return offeredIds[0];
  }
  return requestedId;
}

async function rememberOfferedProducts(
  userId: string,
  conversationId: string,
  productIds: string[],
): Promise<void> {
  const conversation = await ensureConversation(userId, conversationId);
  conversation.lastOfferedProductIds = productIds;
  conversation.updatedAt = new Date().toISOString();
  await putConversation(conversation);
}

export async function dispatchAssistantTool(input: DispatchInput): Promise<unknown> {
  const args = stripForgedUserId(input.args);
  switch (input.tool) {
    case "search_products": {
      const parsed = searchProductsArgsSchema.parse(args);
      const products = await listCatalogProducts(parsed);
      await rememberOfferedProducts(
        input.userId,
        input.conversationId,
        products.map((product) => product.productId),
      );
      return { products: products.map(publicProduct) };
    }
    case "get_product": {
      const parsed = getProductArgsSchema.parse(args);
      const product = await getProduct(parsed.productId);
      if (!product || !product.active) {
        throw new AssistantToolError("NOT_FOUND", "Product not found");
      }
      await rememberOfferedProducts(input.userId, input.conversationId, [product.productId]);
      return { product: publicProduct(product) };
    }
    case "get_cart": {
      return { items: await getCartLines(input.userId) };
    }
    case "upsert_cart_item": {
      const conversation = await ensureConversation(input.userId, input.conversationId);
      const quantity =
        typeof args.quantity === "number" && Number.isInteger(args.quantity) && args.quantity >= 1
          ? args.quantity
          : 1;
      const offered = conversation.lastOfferedProductIds ?? [];
      let productId = resolveUpsertProductId(args.productId, offered);
      if (!productId) {
        throw new AssistantToolError(
          "PRODUCT_REQUIRED",
          "Search or name a catalogue product before adding to the cart",
        );
      }
      try {
        await upsertCartItem(input.userId, productId, quantity);
      } catch (error) {
        const missing =
          error instanceof Error && "code" in error && error.code === "NOT_FOUND";
        if (missing && offered.length === 1 && offered[0] !== productId) {
          await upsertCartItem(input.userId, offered[0], quantity);
        } else if (missing) {
          throw new AssistantToolError("NOT_FOUND", "Product not found");
        } else {
          throw error;
        }
      }
      return { items: await getCartLines(input.userId) };
    }
    case "remove_cart_item": {
      const parsed = removeCartItemArgsSchema.parse(args);
      await deleteCartItem(input.userId, parsed.productId);
      return { items: await getCartLines(input.userId) };
    }
    case "set_delivery": {
      const parsed = setDeliveryArgsSchema.parse(args);
      const conversation = await ensureConversation(input.userId, input.conversationId);
      conversation.pendingDeliveryMethod = parsed.deliveryMethod;
      conversation.updatedAt = new Date().toISOString();
      await putConversation(conversation);
      return { deliveryMethod: parsed.deliveryMethod };
    }
    case "get_quote": {
      const parsed = getQuoteArgsSchema.parse(args);
      const conversation = await ensureConversation(input.userId, input.conversationId);
      const deliveryMethod =
        parsed.deliveryMethod ?? conversation.pendingDeliveryMethod;
      if (!deliveryMethod) {
        throw new AssistantToolError(
          "DELIVERY_REQUIRED",
          "Choose STANDARD or EXPRESS delivery before quoting",
        );
      }
      const items = await getCartLines(input.userId);
      const user = await getUser(input.userId);
      const quote = computeQuote(items, user?.isPremium ?? false, deliveryMethod);
      conversation.pendingDeliveryMethod = deliveryMethod;
      conversation.quotePresentedAt = new Date().toISOString();
      conversation.lastQuoteBreakdown = quote.breakdown;
      conversation.updatedAt = conversation.quotePresentedAt;
      await putConversation(conversation);
      return quote;
    }
    case "confirm_order": {
      const parsed = confirmOrderArgsSchema.parse(args);
      if (!input.userConfirmed) {
        throw new AssistantToolError(
          "CONFIRM_REQUIRED",
          "Customer must explicitly confirm after a quote",
        );
      }
      const conversation = await ensureConversation(input.userId, input.conversationId);
      if (!conversation.quotePresentedAt) {
        throw new AssistantToolError(
          "QUOTE_REQUIRED",
          "Present a quote before confirming an order",
        );
      }
      const deliveryMethod =
        parsed.deliveryMethod ?? conversation.pendingDeliveryMethod;
      if (!deliveryMethod) {
        throw new AssistantToolError(
          "DELIVERY_REQUIRED",
          "Choose STANDARD or EXPRESS delivery before confirming",
        );
      }
      try {
        const order = await confirmOrder(
          input.userId,
          { deliveryMethod, confirm: true },
          input.conversationId,
        );
        conversation.quotePresentedAt = undefined;
        conversation.lastQuoteBreakdown = undefined;
        conversation.updatedAt = new Date().toISOString();
        await putConversation(conversation);
        return order;
      } catch (error) {
        if (error instanceof PricingError && error.code === "CART_EMPTY") {
          throw new AssistantToolError("CART_EMPTY", error.message);
        }
        if (error instanceof OrderError) {
          throw new AssistantToolError(error.code, error.message, error.details);
        }
        throw error;
      }
    }
    case "list_orders": {
      return { orders: await listOrders(input.userId) };
    }
    case "get_order": {
      const parsed = getOrderArgsSchema.parse(args);
      const order = await getOrderForUser(input.userId, parsed.orderId);
      if (!order) {
        throw new AssistantToolError("NOT_FOUND", "Order not found");
      }
      return order;
    }
    default: {
      const _never: never = input.tool;
      throw new AssistantToolError("UNKNOWN_TOOL", `Unsupported tool ${_never}`);
    }
  }
}
