import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { productSchema, type Product } from "@smartshop/shared";

const REGION = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? "ap-southeast-1";

function tableNameFromOutputs(): string | undefined {
  const outputsPath = resolve(process.cwd(), "cdk-outputs.json");
  if (!existsSync(outputsPath)) {
    return undefined;
  }
  const json = JSON.parse(readFileSync(outputsPath, "utf8")) as Record<
    string,
    Record<string, string>
  >;
  const stack = json.SmartShopStack ?? Object.values(json)[0];
  return stack?.ProductsTableName;
}

const tableName = process.env.PRODUCTS_TABLE_NAME || tableNameFromOutputs();

if (!tableName) {
  console.error(
    "Set PRODUCTS_TABLE_NAME or deploy first so cdk-outputs.json contains ProductsTableName.",
  );
  process.exit(1);
}

const now = new Date().toISOString();

const seedInput: Array<Omit<Product, "nameLower" | "createdAt" | "updatedAt" | "currency" | "active">> = [
  {
    productId: "prod-wireless-mouse",
    name: "Wireless Mouse",
    description: "Quiet click Bluetooth mouse for daily work.",
    category: "electronics",
    unitPriceCents: 2499,
    stockQty: 40,
    imageUrl: "https://placehold.co/400x400?text=Mouse",
  },
  {
    productId: "prod-usbc-hub",
    name: "USB-C Hub",
    description: "7-in-1 hub with HDMI and SD card reader.",
    category: "electronics",
    unitPriceCents: 3999,
    stockQty: 25,
    imageUrl: "https://placehold.co/400x400?text=Hub",
  },
  {
    productId: "prod-mech-keyboard",
    name: "Mechanical Keyboard",
    description: "Compact 75% keyboard with hot-swap switches.",
    category: "electronics",
    unitPriceCents: 8999,
    stockQty: 18,
    imageUrl: "https://placehold.co/400x400?text=Keyboard",
  },
  {
    productId: "prod-ceramic-mug",
    name: "Ceramic Mug",
    description: "12 oz matte mug. Dishwasher safe.",
    category: "home",
    unitPriceCents: 1299,
    stockQty: 80,
    imageUrl: "https://placehold.co/400x400?text=Mug",
  },
  {
    productId: "prod-kettle",
    name: "Pour-Over Kettle",
    description: "Gooseneck kettle for pour-over coffee.",
    category: "home",
    unitPriceCents: 4599,
    stockQty: 22,
    imageUrl: "https://placehold.co/400x400?text=Kettle",
  },
  {
    productId: "prod-desk-lamp",
    name: "Desk Lamp",
    description: "Dimmable LED lamp with USB-C charging port.",
    category: "home",
    unitPriceCents: 3299,
    stockQty: 30,
    imageUrl: "https://placehold.co/400x400?text=Lamp",
  },
  {
    productId: "prod-water-bottle",
    name: "Water Bottle",
    description: "Insulated 750 ml stainless bottle.",
    category: "home",
    unitPriceCents: 2199,
    stockQty: 50,
    imageUrl: "https://placehold.co/400x400?text=Bottle",
  },
  {
    productId: "prod-cotton-tee",
    name: "Cotton T-Shirt",
    description: "Heavyweight unisex tee.",
    category: "apparel",
    unitPriceCents: 1999,
    stockQty: 60,
    imageUrl: "https://placehold.co/400x400?text=Tee",
  },
  {
    productId: "prod-running-socks",
    name: "Running Socks",
    description: "Cushioned crew socks, pack of three.",
    category: "apparel",
    unitPriceCents: 899,
    stockQty: 90,
    imageUrl: "https://placehold.co/400x400?text=Socks",
  },
  {
    productId: "prod-canvas-tote",
    name: "Canvas Tote",
    description: "Everyday tote with inner pocket.",
    category: "apparel",
    unitPriceCents: 1599,
    stockQty: 45,
    imageUrl: "https://placehold.co/400x400?text=Tote",
  },
  {
    productId: "prod-notebook-set",
    name: "Notebook Set",
    description: "Two A5 dotted notebooks.",
    category: "stationery",
    unitPriceCents: 1499,
    stockQty: 70,
    imageUrl: "https://placehold.co/400x400?text=Notebook",
  },
  {
    productId: "prod-gel-pens",
    name: "Gel Pen Pack",
    description: "Fine-point gel pens, pack of ten.",
    category: "stationery",
    unitPriceCents: 699,
    stockQty: 120,
    imageUrl: "https://placehold.co/400x400?text=Pens",
  },
];

const products: Product[] = seedInput.map((item) =>
  productSchema.parse({
    ...item,
    nameLower: item.name.toLowerCase(),
    currency: "USD",
    active: true,
    createdAt: now,
    updatedAt: now,
  }),
);

async function main() {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  for (const product of products) {
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: product,
      }),
    );
  }

  const categories = new Set(products.map((p) => p.category));
  console.log(
    `Seeded ${products.length} products into ${tableName} (${categories.size} categories). Re-run is idempotent.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
