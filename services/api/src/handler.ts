import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import type { HealthResponse } from "@smartshop/shared";
import { apiError } from "@smartshop/shared";

const app = new Hono();

app.get("/v1/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    service: "smartshop",
    time: new Date().toISOString(),
  };
  return c.json(body);
});

app.notFound((c) =>
  c.json(apiError("NOT_FOUND", "Route not found"), 404),
);

export const handler = handle(app);
