import { useEffect, useState } from "react";
import type { ListProductsQuery, Product } from "@smartshop/shared";
import { listProducts } from "./api";

export function useCatalogProducts(query: ListProductsQuery = {}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = query.q ?? "";
  const category = query.category ?? "";
  const limit = query.limit;

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    setError(null);
    listProducts({
      q: q || undefined,
      category: category || undefined,
      limit,
    })
      .then((result) => {
        if (!cancelled) {
          setProducts(result.products);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load products");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [q, category, limit]);

  return { products, error };
}
