import type { ListProductsQuery, Product } from "@smartshop/shared";

export const CATEGORIES = [
  {
    slug: "electronics",
    label: "Electronics",
    blurb: "Keyboards, hubs and more",
  },
  {
    slug: "home",
    label: "Home",
    blurb: "Mugs, lamps and living",
  },
  {
    slug: "apparel",
    label: "Apparel",
    blurb: "Comfort for everyday",
  },
  {
    slug: "stationery",
    label: "Stationery",
    blurb: "Notebooks and pens",
  },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const DEAL_MAX_CENTS = 2500;
export const HERO_PRODUCT_ID = "prod-mech-keyboard";
export const HERO_SLIDE_IDS = [
  "prod-mech-keyboard",
  "prod-usbc-hub",
  "prod-wireless-mouse",
  "prod-desk-lamp",
] as const;
export const FEATURED_PICK_IDS = [
  "prod-mech-keyboard",
  "prod-usbc-hub",
  "prod-wireless-mouse",
] as const;
export const DEAL_FEATURE_IDS = [
  "prod-running-socks",
  "prod-ceramic-mug",
  "prod-notebook-set",
  "prod-canvas-tote",
] as const;

export type ProductSocialProof = {
  rating: number;
  reviewCount: number;
};

export type HeroHighlight = {
  icon: "bolt" | "grid" | "gem";
  label: string;
};

const SOCIAL_PROOF: Record<string, ProductSocialProof> = {
  "prod-running-socks": { rating: 4.8, reviewCount: 124 },
  "prod-ceramic-mug": { rating: 4.6, reviewCount: 89 },
  "prod-notebook-set": { rating: 4.7, reviewCount: 56 },
  "prod-canvas-tote": { rating: 4.5, reviewCount: 72 },
  "prod-mech-keyboard": { rating: 4.8, reviewCount: 210 },
  "prod-usbc-hub": { rating: 4.6, reviewCount: 128 },
  "prod-wireless-mouse": { rating: 4.6, reviewCount: 95 },
  "prod-gel-pens": { rating: 4.4, reviewCount: 61 },
  "prod-desk-lamp": { rating: 4.7, reviewCount: 84 },
  "prod-cotton-tee": { rating: 4.5, reviewCount: 103 },
  "prod-water-bottle": { rating: 4.6, reviewCount: 77 },
  "prod-kettle": { rating: 4.7, reviewCount: 58 },
};

const HERO_HIGHLIGHTS: Record<string, HeroHighlight[]> = {
  "prod-mech-keyboard": [
    { icon: "bolt", label: "Hot-swap switches" },
    { icon: "grid", label: "Compact 75% layout" },
    { icon: "gem", label: "Premium build quality" },
  ],
  "prod-usbc-hub": [
    { icon: "grid", label: "7-in-1 ports" },
    { icon: "bolt", label: "HDMI output" },
    { icon: "gem", label: "SD card reader" },
  ],
  "prod-wireless-mouse": [
    { icon: "bolt", label: "Quiet click" },
    { icon: "grid", label: "Bluetooth" },
    { icon: "gem", label: "All-day comfort" },
  ],
  "prod-desk-lamp": [
    { icon: "bolt", label: "Dimmable LED" },
    { icon: "grid", label: "USB-C charging" },
    { icon: "gem", label: "Desk-ready build" },
  ],
};

function hashSeed(value: string): number {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function orderByIds(products: Product[], ids: readonly string[]): Product[] {
  const byId = new Map(products.map((product) => [product.productId, product]));
  return ids.flatMap((id) => {
    const match = byId.get(id);
    return match ? [match] : [];
  });
}

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
  const featured = orderByIds(products, DEAL_FEATURE_IDS);
  if (featured.length > 0) {
    return featured;
  }
  return products
    .filter((product) => product.unitPriceCents <= DEAL_MAX_CENTS)
    .sort((left, right) => left.unitPriceCents - right.unitPriceCents);
}

export function featuredPicks(products: Product[]): Product[] {
  const featured = orderByIds(products, FEATURED_PICK_IDS);
  if (featured.length > 0) {
    return featured;
  }
  return productsInCategory(products, "electronics");
}

export function productSocialProof(product: Product): ProductSocialProof {
  const known = SOCIAL_PROOF[product.productId];
  if (known) {
    return known;
  }
  const seed = hashSeed(product.productId);
  return {
    rating: 4.3 + (seed % 6) / 10,
    reviewCount: 40 + (seed % 90),
  };
}

export function dealCompareAtCents(product: Product): number | undefined {
  if (product.productId === "prod-running-socks") {
    return 1199;
  }
  if (product.unitPriceCents > 900) {
    return undefined;
  }
  return Math.ceil(product.unitPriceCents / 0.8 / 100) * 100 - 1;
}

export function heroHighlights(product: Product): HeroHighlight[] {
  return (
    HERO_HIGHLIGHTS[product.productId] ?? [
      { icon: "bolt", label: "Everyday essential" },
      { icon: "grid", label: "Ready to ship" },
      { icon: "gem", label: "Quality build" },
    ]
  );
}

export function heroSlides(products: Product[]): Product[] {
  const featured = orderByIds(products, HERO_SLIDE_IDS);
  if (featured.length > 0) {
    return featured;
  }
  return products.slice(0, 4);
}

export function dailyEssentials(products: Product[]): Product[] {
  return products.filter(
    (product) => product.category === "home" || product.category === "stationery",
  );
}

export function heroProduct(products: Product[]): Product | undefined {
  return products.find((product) => product.productId === HERO_PRODUCT_ID) ?? products[0];
}
