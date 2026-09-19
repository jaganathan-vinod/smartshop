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
