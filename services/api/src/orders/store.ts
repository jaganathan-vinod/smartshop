import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import {
  orderSchema,
  type CreateOrderRequest,
  type Order,
} from "@smartshop/shared";
import { loadCheckoutCart } from "../cart/store.js";
import { docClient } from "../db.js";
import {
  cartsTableName,
  orderNumbersTableName,
  ordersTableName,
  productsTableName,
} from "../env.js";
import { getUser } from "../identity/store.js";
import { computeQuote } from "../pricing/engine.js";
import { formatOrderNumber, hashOrderRequest } from "./number.js";

const ORDER_SK_PREFIX = "ORDER#";
const IDEMP_SK_PREFIX = "IDEMP#";
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export class OrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

type IdempotencyRecord = {
  userId: string;
  sk: string;
  requestHash: string;
  linkedOrderId: string;
  createdAt: string;
  expiresAt: number;
};

export async function confirmOrder(
  userId: string,
  body: CreateOrderRequest,
  idempotencyKey?: string,
): Promise<Order> {
  const requestHash = hashOrderRequest(body);
  if (idempotencyKey) {
    const existing = await getIdempotency(userId, idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new OrderError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was reused with a different request",
        );
      }
      const replayed = await getOrderForUser(userId, existing.linkedOrderId);
      if (!replayed) {
        throw new Error("Idempotency record is missing its order");
      }
      return replayed;
    }
  }

  let checkout;
  try {
    checkout = await loadCheckoutCart(userId);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "NOT_FOUND") {
      const productId =
        "productId" in error && typeof error.productId === "string"
          ? error.productId
          : undefined;
      throw new OrderError(
        "PRODUCT_UNAVAILABLE",
        "A cart product is no longer available",
        { productId },
      );
    }
    throw error;
  }

  const user = await getUser(userId);
  const quote = computeQuote(
    checkout.lines,
    user?.isPremium ?? false,
    body.deliveryMethod,
  );
  const createdAtDate = new Date();
  const createdAt = createdAtDate.toISOString();
  const sequence = await allocateOrderNumber();
  const order: Order = orderSchema.parse({
    orderId: `ord_${crypto.randomUUID().replaceAll("-", "")}`,
    orderNumber: formatOrderNumber(createdAtDate, sequence),
    status: "CONFIRMED",
    deliveryMethod: body.deliveryMethod,
    items: quote.items,
    breakdown: quote.breakdown,
    isPremiumAtPurchase: quote.isPremium,
    createdAt,
  });

  try {
    await writeConfirmTransaction({
      userId,
      order,
      cartRecords: checkout.records,
      idempotencyKey,
      requestHash,
    });
  } catch (error) {
    if (idempotencyKey && isIdempotencyRace(error)) {
      const raced = await getIdempotency(userId, idempotencyKey);
      if (raced?.requestHash === requestHash) {
        const replayed = await getOrderForUser(userId, raced.linkedOrderId);
        if (replayed) {
          return replayed;
        }
      }
      if (raced && raced.requestHash !== requestHash) {
        throw new OrderError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was reused with a different request",
        );
      }
    }
    const stockProductId = insufficientStockProductId(error);
    if (stockProductId) {
      throw new OrderError("INSUFFICIENT_STOCK", "Not enough stock", {
        productId: stockProductId,
      });
    }
    if (isCartChanged(error)) {
      throw new OrderError("CART_CHANGED", "Cart changed during checkout");
    }
    throw error;
  }

  return order;
}

export function orderBelongsToCaller(
  ownerUserId: unknown,
  callerUserId: string,
): boolean {
  return typeof ownerUserId === "string" && ownerUserId === callerUserId;
}

export async function listOrders(userId: string): Promise<Order[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: ordersTableName(),
      KeyConditionExpression: "userId = :u AND begins_with(sk, :p)",
      ExpressionAttributeValues: {
        ":u": userId,
        ":p": ORDER_SK_PREFIX,
      },
      ScanIndexForward: false,
    }),
  );
  return (result.Items ?? [])
    .map((item) => orderSchema.safeParse(item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);
}

export async function getOrderForUser(
  userId: string,
  orderId: string,
): Promise<Order | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: ordersTableName(),
      IndexName: "orderId-index",
      KeyConditionExpression: "orderId = :id",
      ExpressionAttributeValues: { ":id": orderId },
      Limit: 2,
    }),
  );
  const match = (result.Items ?? []).find((item) =>
    orderBelongsToCaller(item.userId, userId),
  );
  if (!match) {
    return null;
  }
  const parsed = orderSchema.safeParse(match);
  return parsed.success ? parsed.data : null;
}

async function allocateOrderNumber(): Promise<number> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: orderNumbersTableName(),
      Key: { pk: "COUNTER" },
      UpdateExpression: "ADD lastValue :one",
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  const lastValue = result.Attributes?.lastValue;
  if (typeof lastValue !== "number") {
    throw new Error("Order number counter did not return lastValue");
  }
  return lastValue;
}

async function getIdempotency(
  userId: string,
  key: string,
): Promise<IdempotencyRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: ordersTableName(),
      Key: { userId, sk: `${IDEMP_SK_PREFIX}${key}` },
    }),
  );
  const item = result.Item;
  if (!item) {
    return null;
  }
  if (typeof item.expiresAt === "number" && item.expiresAt <= unixSeconds()) {
    return null;
  }
  if (
    typeof item.requestHash !== "string" ||
    typeof item.linkedOrderId !== "string" ||
    typeof item.createdAt !== "string"
  ) {
    return null;
  }
  return {
    userId,
    sk: String(item.sk),
    requestHash: item.requestHash,
    linkedOrderId: item.linkedOrderId,
    createdAt: item.createdAt,
    expiresAt: Number(item.expiresAt),
  };
}

async function writeConfirmTransaction(input: {
  userId: string;
  order: Order;
  cartRecords: { productId: string; quantity: number }[];
  idempotencyKey?: string;
  requestHash: string;
}): Promise<void> {
  const createdAt = input.order.createdAt;
  const transactItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = [];

  const stockIndexes: { index: number; productId: string }[] = [];
  const cartIndexes: number[] = [];
  let idempotencyIndex: number | undefined;

  for (const line of input.order.items) {
    stockIndexes.push({ index: transactItems.length, productId: line.productId });
    transactItems.push({
      Update: {
        TableName: productsTableName(),
        Key: { productId: line.productId },
        UpdateExpression: "SET stockQty = stockQty - :qty, updatedAt = :u",
        ConditionExpression: "stockQty >= :qty AND #active = :true",
        ExpressionAttributeNames: { "#active": "active" },
        ExpressionAttributeValues: {
          ":qty": line.quantity,
          ":u": createdAt,
          ":true": true,
        },
      },
    });
  }

  transactItems.push({
    Put: {
      TableName: ordersTableName(),
      Item: {
        userId: input.userId,
        sk: `${ORDER_SK_PREFIX}${createdAt}#${input.order.orderId}`,
        ...input.order,
      },
      ConditionExpression: "attribute_not_exists(sk)",
    },
  });

  for (const record of input.cartRecords) {
    cartIndexes.push(transactItems.length);
    transactItems.push({
      Delete: {
        TableName: cartsTableName(),
        Key: { userId: input.userId, productId: record.productId },
        ConditionExpression: "quantity = :q",
        ExpressionAttributeValues: { ":q": record.quantity },
      },
    });
  }

  if (input.idempotencyKey) {
    idempotencyIndex = transactItems.length;
    const now = unixSeconds();
    transactItems.push({
      Put: {
        TableName: ordersTableName(),
        Item: {
          userId: input.userId,
          sk: `${IDEMP_SK_PREFIX}${input.idempotencyKey}`,
          requestHash: input.requestHash,
          linkedOrderId: input.order.orderId,
          createdAt,
          expiresAt: now + IDEMPOTENCY_TTL_SECONDS,
        },
        ConditionExpression: "attribute_not_exists(sk)",
      },
    });
  }

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: transactItems,
      }),
    );
  } catch (error) {
    annotateCanceled(error, { stockIndexes, cartIndexes, idempotencyIndex });
    throw error;
  }
}

function annotateCanceled(
  error: unknown,
  meta: {
    stockIndexes: { index: number; productId: string }[];
    cartIndexes: number[];
    idempotencyIndex?: number;
  },
): void {
  const reasons = cancellationReasons(error);
  if (!reasons) {
    return;
  }
  for (let index = 0; index < reasons.length; index += 1) {
    if (reasons[index]?.Code !== "ConditionalCheckFailed") {
      continue;
    }
    const stock = meta.stockIndexes.find((entry) => entry.index === index);
    if (stock) {
      (error as { insufficientStockProductId?: string }).insufficientStockProductId =
        stock.productId;
    }
    if (meta.cartIndexes.includes(index)) {
      (error as { cartChanged?: boolean }).cartChanged = true;
    }
    if (index === meta.idempotencyIndex) {
      (error as { idempotencyRace?: boolean }).idempotencyRace = true;
    }
  }
}

function cancellationReasons(
  error: unknown,
): { Code?: string }[] | undefined {
  if (error instanceof TransactionCanceledException) {
    return error.CancellationReasons;
  }
  if (
    error &&
    typeof error === "object" &&
    "CancellationReasons" in error &&
    Array.isArray(error.CancellationReasons)
  ) {
    return error.CancellationReasons as { Code?: string }[];
  }
  return undefined;
}

function insufficientStockProductId(error: unknown): string | undefined {
  if (error && typeof error === "object" && "insufficientStockProductId" in error) {
    const productId = error.insufficientStockProductId;
    return typeof productId === "string" ? productId : undefined;
  }
  return undefined;
}

function isCartChanged(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "cartChanged" in error && error.cartChanged);
}

function isIdempotencyRace(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "idempotencyRace" in error && error.idempotencyRace,
  );
}

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
