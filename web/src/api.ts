import type {
  CartLine,
  DeliveryMethod,
  HtmlReportJob,
  ListProductsQuery,
  MeResponse,
  MetricsSummary,
  Order,
  Product,
  QuoteResponse,
  ReportJob,
} from "@smartshop/shared";
import { productsListPath } from "./catalog";
import { loadConfig } from "./config";
import { requireIdToken } from "./cognitoSession";
import { isNetworkFailure } from "./validation";

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
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new ApiRequestError(0, "NETWORK_ERROR", "Could not reach SmartShop. Try again.");
    }
    throw error;
  }
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

export function listProducts(query?: ListProductsQuery): Promise<{ products: Product[] }> {
  return request(productsListPath(query), {}, false);
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

export function getAdminMetricsSummary(days = 7): Promise<MetricsSummary> {
  return request(`/v1/admin/metrics/summary?days=${days}`);
}

export function getAdminMetricsProducts(days = 7): Promise<{
  products: Array<{ productId: string; name: string; units: number; gmvCents: number }>;
}> {
  return request(`/v1/admin/metrics/products?days=${days}`);
}

export function getAdminMetricsStock(): Promise<{
  items: Array<{ productId: string; name: string; stockQty: number }>;
}> {
  return request("/v1/admin/metrics/stock");
}

export function createReportJob(prompt: string): Promise<ReportJob> {
  return request("/v1/admin/reports/jobs", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function getReportJob(jobId: string): Promise<ReportJob> {
  return request(`/v1/admin/reports/jobs/${encodeURIComponent(jobId)}`);
}

export function refineReportJob(jobId: string, prompt: string): Promise<ReportJob> {
  return request(`/v1/admin/reports/jobs/${encodeURIComponent(jobId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function approveReportJob(jobId: string): Promise<ReportJob> {
  return request(`/v1/admin/reports/jobs/${encodeURIComponent(jobId)}/approve`, {
    method: "POST",
  });
}

export function getPublishedReport(): Promise<ReportJob> {
  return request("/v1/admin/reports/published");
}

export function createHtmlReportJob(
  prompt: string,
  windowDays: 7 | 30,
): Promise<HtmlReportJob> {
  return request("/v1/admin/reports/v2/jobs", {
    method: "POST",
    body: JSON.stringify({ prompt, windowDays }),
  });
}

export function getHtmlReportJob(jobId: string): Promise<HtmlReportJob> {
  return request(`/v1/admin/reports/v2/jobs/${encodeURIComponent(jobId)}`);
}

export function refineHtmlReportJob(
  jobId: string,
  prompt: string,
  windowDays: 7 | 30,
): Promise<HtmlReportJob> {
  return request(`/v1/admin/reports/v2/jobs/${encodeURIComponent(jobId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ prompt, windowDays }),
  });
}

export function approveHtmlReportJob(jobId: string): Promise<HtmlReportJob> {
  return request(`/v1/admin/reports/v2/jobs/${encodeURIComponent(jobId)}/approve`, {
    method: "POST",
  });
}

export function getPublishedHtmlReport(): Promise<HtmlReportJob> {
  return request("/v1/admin/reports/v2/published");
}
