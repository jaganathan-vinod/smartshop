import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { deliveryMethodSchema, type DeliveryMethod, type PriceBreakdown } from "@smartshop/shared";
import { docClient } from "../db.js";
import { conversationsTableName } from "../env.js";

export type ConversationRecord = {
  userId: string;
  sk: string;
  conversationId: string;
  pendingDeliveryMethod?: DeliveryMethod;
  quotePresentedAt?: string;
  lastQuoteBreakdown?: PriceBreakdown;
  lastOfferedProductIds?: string[];
  updatedAt: string;
};

export function conversationSk(conversationId: string): string {
  return `CONV#${conversationId}`;
}

export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: conversationsTableName(),
      Key: { userId, sk: conversationSk(conversationId) },
    }),
  );
  if (!result.Item) {
    return null;
  }
  const pending = result.Item.pendingDeliveryMethod;
  return {
    userId,
    sk: conversationSk(conversationId),
    conversationId,
    pendingDeliveryMethod: deliveryMethodSchema.safeParse(pending).success
      ? deliveryMethodSchema.parse(pending)
      : undefined,
    quotePresentedAt:
      typeof result.Item.quotePresentedAt === "string"
        ? result.Item.quotePresentedAt
        : undefined,
    lastQuoteBreakdown: result.Item.lastQuoteBreakdown as PriceBreakdown | undefined,
    lastOfferedProductIds: Array.isArray(result.Item.lastOfferedProductIds)
      ? result.Item.lastOfferedProductIds.filter(
          (item: unknown): item is string => typeof item === "string" && item.length > 0,
        )
      : undefined,
    updatedAt:
      typeof result.Item.updatedAt === "string"
        ? result.Item.updatedAt
        : new Date().toISOString(),
  };
}

export async function putConversation(record: ConversationRecord): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: conversationsTableName(),
      Item: record,
    }),
  );
}

export async function ensureConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationRecord> {
  const existing = await getConversation(userId, conversationId);
  if (existing) {
    return existing;
  }
  const created: ConversationRecord = {
    userId,
    sk: conversationSk(conversationId),
    conversationId,
    updatedAt: new Date().toISOString(),
  };
  await putConversation(created);
  return created;
}
