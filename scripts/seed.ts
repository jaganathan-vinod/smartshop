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

function photo(id: string): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&h=800&q=80`;
}

const seedInput: Array<Omit<Product, "nameLower" | "createdAt" | "updatedAt" | "currency" | "active">> = [
  {
    productId: "prod-wireless-mouse",
    name: "Wireless Mouse",
    description: "Quiet click Bluetooth mouse for daily work.",
    category: "electronics",
    unitPriceCents: 2499,
    stockQty: 40,
    imageUrl: photo("photo-1527864550417-7fd91fc51a46"),
  },
  {
    productId: "prod-usbc-hub",
    name: "USB-C Hub",
    description: "7-in-1 hub with HDMI and SD card reader.",
    category: "electronics",
    unitPriceCents: 3999,
    stockQty: 25,
    imageUrl: photo("photo-1625948515291-69613efd103f"),
  },
  {
    productId: "prod-mech-keyboard",
    name: "Mechanical Keyboard",
    description: "Compact 75% keyboard with hot-swap switches.",
    category: "electronics",
    unitPriceCents: 8999,
    stockQty: 18,
    imageUrl: photo("photo-1511467687858-23d96c32e4ae"),
  },
  {
    productId: "prod-ceramic-mug",
    name: "Ceramic Mug",
    description: "12 oz matte mug. Dishwasher safe.",
    category: "home",
    unitPriceCents: 1299,
    stockQty: 80,
    imageUrl: photo("photo-1514228742587-6b1558fcca3d"),
  },
  {
    productId: "prod-kettle",
    name: "Pour-Over Kettle",
    description: "Gooseneck kettle for pour-over coffee.",
    category: "home",
    unitPriceCents: 4599,
    stockQty: 22,
    imageUrl: photo("photo-1495474472287-4d71bcdd2085"),
  },
  {
    productId: "prod-desk-lamp",
    name: "Desk Lamp",
    description: "Dimmable LED lamp with USB-C charging port.",
    category: "home",
    unitPriceCents: 3299,
    stockQty: 30,
    imageUrl: photo("photo-1513506003901-1e6a229e2d15"),
  },
  {
    productId: "prod-water-bottle",
    name: "Water Bottle",
    description: "Insulated 750 ml stainless bottle.",
    category: "home",
    unitPriceCents: 2199,
    stockQty: 50,
    imageUrl: photo("photo-1602143407151-7111542de6e8"),
  },
  {
    productId: "prod-cotton-tee",
    name: "Cotton T-Shirt",
    description: "Heavyweight unisex tee.",
    category: "apparel",
    unitPriceCents: 1999,
    stockQty: 60,
    imageUrl: photo("photo-1521572163474-6864f9cf17ab"),
  },
  {
    productId: "prod-running-socks",
    name: "Running Socks",
    description: "Cushioned crew socks, pack of three.",
    category: "apparel",
    unitPriceCents: 899,
    stockQty: 90,
    imageUrl: photo("photo-1586350977771-b3b0abd50c82"),
  },
  {
    productId: "prod-canvas-tote",
    name: "Canvas Tote",
    description: "Everyday tote with inner pocket.",
    category: "apparel",
    unitPriceCents: 1599,
    stockQty: 45,
    imageUrl: photo("photo-1544816155-12df9643f363"),
  },
  {
    productId: "prod-notebook-set",
    name: "Notebook Set",
    description: "Two A5 dotted notebooks.",
    category: "stationery",
    unitPriceCents: 1499,
    stockQty: 70,
    imageUrl: photo("photo-1531346878377-a5be20888e57"),
  },
  {
    productId: "prod-gel-pens",
    name: "Gel Pen Pack",
    description: "Fine-point gel pens, pack of ten.",
    category: "stationery",
    unitPriceCents: 699,
    stockQty: 120,
    imageUrl: photo("photo-1455390582262-044cdead277a"),
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
