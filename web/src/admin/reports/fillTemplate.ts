import { gmvPacePercent, type MetricsSummary } from "@smartshop/shared";
import { formatCents } from "../../money";

export type HtmlReportProduct = {
  productId: string;
  name: string;
  units: number;
  gmvCents: number;
};

export type HtmlReportStock = {
  productId: string;
  name: string;
  stockQty: number;
};

export type HtmlReportFillInput = {
  summary: MetricsSummary;
  products: HtmlReportProduct[];
  stock: HtmlReportStock[];
};

const EM_DASH = "—";

const CENT_KEYS = new Set(["gmvCents", "aovCents", "gmvTargetCents"]);

const EMPTY_WHEN_NULL = new Set([
  "summary.gmvPacePercent",
  "summary.deliveryStandardSharePercent",
  "summary.deliveryExpressSharePercent",
  "summary.premiumOrderSharePercent",
]);

type Row = Record<string, unknown>;

const OPEN_AT = /^{{\s*#each\s+([^{}]+?)\s*}}/;
const CLOSE_AT = /^{{\s*\/each\s*}}/;
const SCALAR_AT = /^{{\s*([^{}#/][^{}]*?)\s*}}/;

export function fillHtmlTemplate(template: string, input: HtmlReportFillInput): string {
  return fillRange(template, metricsRoot(input), null);
}

function metricsRoot(input: HtmlReportFillInput): Row {
  const deliveryTotal = input.summary.delivery.STANDARD + input.summary.delivery.EXPRESS;
  return {
    summary: {
      ...input.summary,
      gmvPacePercent: gmvPacePercent(input.summary.gmvCents, input.summary.gmvTargetCents ?? 0),
      deliveryStandardSharePercent: share(input.summary.delivery.STANDARD, deliveryTotal),
      deliveryExpressSharePercent: share(input.summary.delivery.EXPRESS, deliveryTotal),
      premiumOrderSharePercent: share(input.summary.premiumOrderCount, input.summary.orderCount),
    },
    products: input.products,
    stock: input.stock,
  };
}

function share(part: number, whole: number): number | null {
  if (whole <= 0) {
    return null;
  }
  return Math.round((part / whole) * 100);
}

function fillRange(source: string, root: Row, row: Row | null): string {
  let cursor = 0;
  let out = "";
  while (cursor < source.length) {
    const next = findToken(source, cursor);
    if (!next) {
      out += source.slice(cursor);
      break;
    }
    out += source.slice(cursor, next.index);
    if (next.kind === "each") {
      const opened = OPEN_AT.exec(source.slice(next.index));
      if (!opened) {
        out += source.slice(next.index);
        break;
      }
      const innerStart = next.index + opened[0].length;
      const close = findClose(source, innerStart);
      if (!close) {
        out += source.slice(next.index);
        break;
      }
      const inner = source.slice(innerStart, close.index);
      const list = resolveList(opened[1].trim(), root);
      if (!list) {
        out += EM_DASH;
      } else {
        for (const item of list) {
          const itemRow =
            item != null && typeof item === "object" && !Array.isArray(item) ? (item as Row) : {};
          out += fillRange(inner, root, itemRow);
        }
      }
      cursor = close.end;
      continue;
    }
    const scalar = SCALAR_AT.exec(source.slice(next.index));
    if (!scalar) {
      out += source.slice(next.index);
      break;
    }
    out += escapeHtml(formatToken(scalar[1].trim(), root, row));
    cursor = next.index + scalar[0].length;
  }
  return out;
}

function findToken(
  source: string,
  from: number,
): { kind: "each" | "scalar"; index: number } | null {
  let index = from;
  while (index < source.length) {
    const at = source.indexOf("{{", index);
    if (at < 0) {
      return null;
    }
    const slice = source.slice(at);
    if (OPEN_AT.test(slice)) {
      return { kind: "each", index: at };
    }
    if (SCALAR_AT.test(slice)) {
      return { kind: "scalar", index: at };
    }
    index = at + 2;
  }
  return null;
}

function findClose(source: string, from: number): { index: number; end: number } | null {
  let index = from;
  while (index < source.length) {
    const at = source.indexOf("{{", index);
    if (at < 0) {
      return null;
    }
    const match = CLOSE_AT.exec(source.slice(at));
    if (match) {
      return { index: at, end: at + match[0].length };
    }
    index = at + 2;
  }
  return null;
}

function resolveList(path: string, root: Row): unknown[] | null {
  const value = walk(path, root);
  if (!Array.isArray(value)) {
    return null;
  }
  return value;
}

function formatToken(token: string, root: Row, row: Row | null): string {
  const value =
    !token.includes(".") && row && Object.prototype.hasOwnProperty.call(row, token)
      ? row[token]
      : walk(token, root);
  if (value == null) {
    return EMPTY_WHEN_NULL.has(token) ? "" : EM_DASH;
  }
  if (typeof value === "number") {
    const key = token.includes(".") ? token.slice(token.lastIndexOf(".") + 1) : token;
    if (CENT_KEYS.has(key)) {
      return formatCents(value);
    }
    if (token.endsWith("Percent")) {
      return `${value}%`;
    }
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return EM_DASH;
}

function walk(path: string, root: Row): unknown {
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    const record = current as Row;
    if (!Object.prototype.hasOwnProperty.call(record, part)) {
      return undefined;
    }
    current = record[part];
  }
  return current;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
