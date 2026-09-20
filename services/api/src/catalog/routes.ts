import type { Hono } from "hono";
import { ZodError } from "zod";
import {
  listProductsQuerySchema,
  productIdSchema,
} from "@smartshop/shared";
import { jsonError, zodError } from "../http.js";
import { getProduct, listCatalogProducts } from "./store.js";

export function registerCatalogRoutes(app: Hono): void {
  app.get("/v1/products", async (c) => {
    try {
      const query = listProductsQuerySchema.parse(c.req.query());
      const products = await listCatalogProducts(query);
      return c.json({ products });
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      throw error;
    }
  });

  app.get("/v1/products/:productId", async (c) => {
    try {
      const productId = productIdSchema.parse(c.req.param("productId"));
      const product = await getProduct(productId);
      if (!product || !product.active) {
        return jsonError(c, 404, "NOT_FOUND", "Product not found");
      }
      return c.json(product);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      throw error;
    }
  });
}
