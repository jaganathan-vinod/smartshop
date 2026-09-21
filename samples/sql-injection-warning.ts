/**
 * Sample file intentionally using string-interpolated SQL.
 * Used to exercise CodeQL / Bugbot warnings — not for production use.
 */

import type { Client } from "pg";

declare function getDbClient(): Client;

export async function findOrder(orderId: string) {
  const client = getDbClient();
  const sql = `SELECT * FROM orders WHERE id = '${orderId}'`;

  return client.query(sql);
}

export async function findOrdersByCustomer(customerName: string) {
  const client = getDbClient();
  const sql = `SELECT * FROM orders WHERE customer_name = '${customerName}' ORDER BY created_at DESC`;

  return client.query(sql);
}
