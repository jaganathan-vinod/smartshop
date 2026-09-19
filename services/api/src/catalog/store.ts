import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import {
  createProductRequestSchema,
  patchProductRequestSchema,
  productSchema,
  replaceProductRequestSchema,
  type CreateProductRequest,
  type PatchProductRequest,
  type Product,
} from "@smartshop/shared";
import { docClient } from "../db.js";
import { productsTableName } from "../env.js";

function nowIso(): string {
  return new Date().toISOString();
}

function newProductId(): string {
  return `prod_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function listAllProducts(): Promise<Product[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: productsTableName() }),
  );
  return (result.Items ?? [])
    .map((item) => productSchema.safeParse(item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);
}

export async function getProduct(productId: string): Promise<Product | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: productsTableName(),
      Key: { productId },
    }),
  );
  if (!result.Item) {
    return null;
  }
  const parsed = productSchema.safeParse(result.Item);
  return parsed.success ? parsed.data : null;
}

export async function createProduct(input: CreateProductRequest): Promise<Product> {
  const body = createProductRequestSchema.parse(input);
  const timestamp = nowIso();
  const product = productSchema.parse({
    productId: newProductId(),
    name: body.name,
    nameLower: body.name.toLowerCase(),
    description: body.description,
    category: body.category,
    unitPriceCents: body.unitPriceCents,
    currency: "USD",
    stockQty: body.stockQty,
    imageUrl: body.imageUrl,
    active: body.active,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await docClient.send(
    new PutCommand({
      TableName: productsTableName(),
      Item: product,
    }),
  );
  return product;
}

export async function replaceProduct(
  productId: string,
  input: CreateProductRequest,
): Promise<Product | null> {
  const existing = await getProduct(productId);
  if (!existing) {
    return null;
  }
  const body = replaceProductRequestSchema.parse(input);
  const product = productSchema.parse({
    ...existing,
    name: body.name,
    nameLower: body.name.toLowerCase(),
    description: body.description,
    category: body.category,
    unitPriceCents: body.unitPriceCents,
    stockQty: body.stockQty,
    imageUrl: body.imageUrl,
    active: body.active,
    updatedAt: nowIso(),
  });
  await docClient.send(
    new PutCommand({
      TableName: productsTableName(),
      Item: product,
    }),
  );
  return product;
}

export async function patchProduct(
  productId: string,
  input: PatchProductRequest,
): Promise<Product | null> {
  const existing = await getProduct(productId);
  if (!existing) {
    return null;
  }
  const body = patchProductRequestSchema.parse(input);
  const name = body.name ?? existing.name;
  const product = productSchema.parse({
    ...existing,
    name,
    nameLower: name.toLowerCase(),
    description: body.description ?? existing.description,
    category: body.category ?? existing.category,
    unitPriceCents: body.unitPriceCents ?? existing.unitPriceCents,
    stockQty: body.stockQty ?? existing.stockQty,
    imageUrl: body.imageUrl ?? existing.imageUrl,
    active: body.active ?? existing.active,
    updatedAt: nowIso(),
  });
  await docClient.send(
    new PutCommand({
      TableName: productsTableName(),
      Item: product,
    }),
  );
  return product;
}
