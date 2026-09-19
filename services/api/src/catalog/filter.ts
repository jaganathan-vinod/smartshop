import type { ListProductsQuery, Product } from "@smartshop/shared";

const DEFAULT_LIMIT = 50;

export function filterProducts(
  products: Product[],
  query: ListProductsQuery,
): Product[] {
  const needle = query.q?.trim().toLowerCase();
  const category = query.category?.trim();
  const limit = query.limit ?? DEFAULT_LIMIT;

  return products
    .filter((product) => product.active)
    .filter((product) => (needle ? product.nameLower.includes(needle) : true))
    .filter((product) => (category ? product.category === category : true))
    .slice(0, limit);
}
