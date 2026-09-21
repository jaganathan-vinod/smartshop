import type { DashboardSpec, MetricsSummary } from "@smartshop/shared";

export type ReportProductRow = {
  productId: string;
  name: string;
  units: number;
  gmvCents: number;
};

export type ReportStockRow = {
  productId: string;
  name: string;
  stockQty: number;
};

export type GeneratedBoardProps = {
  spec: DashboardSpec;
  summary: MetricsSummary;
  products: ReportProductRow[];
  stock: ReportStockRow[];
  badge: string;
};
