import type {
  CartLine,
  DeliveryMethod,
  MeResponse,
  Order,
  Product,
  QuoteResponse,
} from "@smartshop/shared";
import { loadConfig } from "./config";
import { requireIdToken } from "./cognitoSession";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function authHeaders(extra?: HeadersInit, authenticate = true): Promise<Headers> {
  const headers = new Headers(extra);
  if (authenticate) {
    headers.set("Authorization", `Bearer ${await requireIdToken()}`);
  }
  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticate = true,
): Promise<T> {
  const config = await loadConfig();
  const headers = await authHeaders(init.headers, authenticate);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const errorBody = body as {
      error?: { code?: string; message?: string; details?: unknown };
      message?: string;
    } | null;
    throw new ApiRequestError(
      response.status,
      errorBody?.error?.code ?? "HTTP_ERROR",
      errorBody?.error?.message ?? errorBody?.message ?? response.statusText,
      errorBody?.error?.details,
    );
  }
  return body as T;
}

export function listProducts(query?: string): Promise<{ products: Product[] }> {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return request(`/v1/products${suffix}`, {}, false);
}

export function getProduct(productId: string): Promise<Product> {
  return request(`/v1/products/${encodeURIComponent(productId)}`, {}, false);
}

export function getMe(): Promise<MeResponse> {
  return request("/v1/me");
}

export function getCart(): Promise<{ items: CartLine[] }> {
  return request("/v1/cart");
}

export function upsertCartItem(
  productId: string,
  quantity: number,
): Promise<{ items: CartLine[] }> {
  return request("/v1/cart/items", {
    method: "PUT",
    body: JSON.stringify({ productId, quantity }),
  });
}

export function patchCartItem(
  productId: string,
  quantity: number,
): Promise<{ items: CartLine[] }> {
  return request(`/v1/cart/items/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
}

export function deleteCartItem(productId: string): Promise<{ items: CartLine[] }> {
  return request(`/v1/cart/items/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
}

export function createQuote(deliveryMethod: DeliveryMethod): Promise<QuoteResponse> {
  return request("/v1/quotes", {
    method: "POST",
    body: JSON.stringify({ deliveryMethod }),
  });
}

export function createOrder(
  deliveryMethod: DeliveryMethod,
  idempotencyKey: string,
): Promise<Order> {
  return request("/v1/orders", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ deliveryMethod, confirm: true }),
  });
}

export function listOrders(): Promise<{ orders: Order[] }> {
  return request("/v1/orders");
}

export function getOrder(orderId: string): Promise<Order> {
  return request(`/v1/orders/${encodeURIComponent(orderId)}`);
}
