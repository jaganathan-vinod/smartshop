import type { ListProductsQuery, Product } from "@smartshop/shared";

export const CATEGORIES = [
  {
    slug: "electronics",
    label: "Electronics",
    blurb: "Keyboards, hubs, and daily desk gear.",
  },
  {
    slug: "home",
    label: "Home",
    blurb: "Mugs, kettles, lamps, and bottles.",
  },
  {
    slug: "apparel",
    label: "Apparel",
    blurb: "Tees, socks, and totes.",
  },
  {
    slug: "stationery",
    label: "Stationery",
    blurb: "Notebooks and pens.",
  },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const DEAL_MAX_CENTS = 2500;
export const HERO_PRODUCT_ID = "prod-mech-keyboard";

export function categoryPath(slug: string): string {
  return `/c/${encodeURIComponent(slug)}`;
}

export function formatCategoryLabel(slug: string): string {
  const known = CATEGORIES.find((category) => category.slug === slug);
  if (known) {
    return known.label;
  }
  return slug
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function productsListPath(query: ListProductsQuery = {}): string {
  const params = new URLSearchParams();
  const q = query.q?.trim();
  const category = query.category?.trim();
  if (q) {
    params.set("q", q);
  }
  if (category) {
    params.set("category", category);
  }
  if (query.limit) {
    params.set("limit", String(query.limit));
  }
  return params.size ? `/v1/products?${params.toString()}` : "/v1/products";
}

export function firstProductInCategory(
  products: Product[],
  slug: string,
): Product | undefined {
  return products.find((product) => product.category === slug);
}

export function productsInCategory(products: Product[], slug: string): Product[] {
  return products.filter((product) => product.category === slug);
}

export function dealProducts(products: Product[]): Product[] {
  return products
    .filter((product) => product.unitPriceCents <= DEAL_MAX_CENTS)
    .sort((left, right) => left.unitPriceCents - right.unitPriceCents);
}

export function featuredPicks(products: Product[]): Product[] {
  return productsInCategory(products, "electronics");
}

export function dailyEssentials(products: Product[]): Product[] {
  return products.filter(
    (product) => product.category === "home" || product.category === "stationery",
  );
}

export function heroProduct(products: Product[]): Product | undefined {
  return products.find((product) => product.productId === HERO_PRODUCT_ID) ?? products[0];
}
