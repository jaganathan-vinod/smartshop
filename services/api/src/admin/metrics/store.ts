import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { orderSchema, userProfileSchema, type Order, type UserProfile } from "@smartshop/shared";
import { listAllProducts } from "../../catalog/store.js";
import { docClient } from "../../db.js";
import { ordersTableName, usersTableName } from "../../env.js";
import { computeMetrics, stockoutRows, topProductsFromOrders, windowStartIso } from "./compute.js";

const ORDER_SK_PREFIX = "ORDER#";

async function scanAll<T>(
  tableName: string,
  parse: (item: Record<string, unknown>) => T | null,
): Promise<T[]> {
  const items: T[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const raw of result.Items ?? []) {
      const parsed = parse(raw as Record<string, unknown>);
      if (parsed) {
        items.push(parsed);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return items;
}

export async function listAllOrders(): Promise<Order[]> {
  return scanAll(ordersTableName(), (item) => {
    const sk = item.sk;
    if (typeof sk !== "string" || !sk.startsWith(ORDER_SK_PREFIX)) {
      return null;
    }
    const parsed = orderSchema.safeParse(item);
    return parsed.success ? parsed.data : null;
  });
}

export async function listAllUsers(): Promise<UserProfile[]> {
  return scanAll(usersTableName(), (item) => {
    const parsed = userProfileSchema.safeParse(item);
    return parsed.success ? parsed.data : null;
  });
}

export async function loadAdminMetrics(days: number) {
  const now = new Date();
  const from = windowStartIso(now, days);
  const [orders, products, users] = await Promise.all([
    listAllOrders(),
    listAllProducts(),
    listAllUsers(),
  ]);
  const inWindow = orders.filter((order) => order.createdAt >= from);
  return {
    summary: computeMetrics({ orders, products, users, now, days }),
    products: topProductsFromOrders(inWindow),
    stock: stockoutRows(products),
  };
}
