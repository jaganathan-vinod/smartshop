import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { productIdSchema, type CartLine } from "@smartshop/shared";
import { getProduct } from "../catalog/store.js";
import { docClient } from "../db.js";
import { cartsTableName } from "../env.js";

const cartRecordSchema = z.object({
  userId: z.string().min(1),
  productId: productIdSchema,
  quantity: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});

export type CartRecord = z.infer<typeof cartRecordSchema>;

export async function listCartRecords(userId: string): Promise<CartRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: cartsTableName(),
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    }),
  );
  return (result.Items ?? [])
    .map((item) => cartRecordSchema.safeParse(item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);
}

export async function loadCheckoutCart(
  userId: string,
): Promise<{ records: CartRecord[]; lines: CartLine[] }> {
  const records = await listCartRecords(userId);
  const lines: CartLine[] = [];
  for (const record of records) {
    const product = await getProduct(record.productId);
    if (!product || !product.active) {
      throw Object.assign(new Error("NOT_FOUND"), {
        code: "NOT_FOUND",
        productId: record.productId,
      });
    }
    lines.push({
      productId: product.productId,
      name: product.name,
      quantity: record.quantity,
      unitPriceCents: product.unitPriceCents,
    });
  }
  return { records, lines };
}

export async function getCheckoutLines(userId: string): Promise<CartLine[]> {
  return (await loadCheckoutCart(userId)).lines;
}

export async function getCartLines(userId: string): Promise<CartLine[]> {
  const records = await listCartRecords(userId);
  const lines: CartLine[] = [];
  for (const record of records) {
    const product = await getProduct(record.productId);
    if (!product || !product.active) {
      continue;
    }
    lines.push({
      productId: product.productId,
      name: product.name,
      quantity: record.quantity,
      unitPriceCents: product.unitPriceCents,
    });
  }
  return lines;
}

export async function upsertCartItem(
  userId: string,
  productId: string,
  quantity: number,
): Promise<CartRecord> {
  const product = await getProduct(productId);
  if (!product || !product.active) {
    throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
  }
  const record: CartRecord = {
    userId,
    productId,
    quantity,
    updatedAt: new Date().toISOString(),
  };
  await docClient.send(
    new PutCommand({
      TableName: cartsTableName(),
      Item: record,
    }),
  );
  return record;
}

export async function deleteCartItem(
  userId: string,
  productId: string,
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: cartsTableName(),
      Key: { userId, productId },
    }),
  );
}
