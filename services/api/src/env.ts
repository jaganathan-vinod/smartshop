export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export function productsTableName(): string {
  return requireEnv("PRODUCTS_TABLE");
}

export function usersTableName(): string {
  return requireEnv("USERS_TABLE");
}

export function cartsTableName(): string {
  return requireEnv("CARTS_TABLE");
}

export function ordersTableName(): string {
  return requireEnv("ORDERS_TABLE");
}

export function orderNumbersTableName(): string {
  return requireEnv("ORDER_NUMBERS_TABLE");
}

export function conversationsTableName(): string {
  return requireEnv("CONVERSATIONS_TABLE");
}

export function assistantUploadsBucket(): string | undefined {
  return process.env.ASSISTANT_UPLOADS_BUCKET;
}
