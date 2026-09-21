import type { DashboardSpec, MetricsSummary } from "@smartshop/shared";
import { formatCents } from "../../money";
import { kpiLabel } from "./labels";

type ProductRow = { productId: string; name: string; units: number; gmvCents: number };
type StockRow = { productId: string; name: string; stockQty: number };

function kpiValue(
  id: DashboardSpec["kpis"][number],
  summary: MetricsSummary,
  stockCount: number,
): string {
  switch (id) {
    case "gmv":
      return formatCents(summary.gmvCents);
    case "orderCount":
      return String(summary.orderCount);
    case "aov":
      return formatCents(summary.aovCents);
    case "targetPace": {
      const target = summary.gmvTargetCents ?? 0;
      if (target <= 0) {
        return "—";
      }
      return `${Math.round((summary.gmvCents / target) * 100)}%`;
    }
    case "stockouts":
      return String(stockCount);
    case "premiumShare":
      if (summary.orderCount === 0) {
        return "0%";
      }
      return `${Math.round((summary.premiumOrderCount / summary.orderCount) * 100)}%`;
    default: {
      const _never: never = id;
      return _never;
    }
  }
}

export function DashboardPanel({
  spec,
  summary,
  products,
  stock,
  badge,
}: {
  spec: DashboardSpec;
  summary: MetricsSummary;
  products: ProductRow[];
  stock: StockRow[];
  badge: string;
}) {
  return (
    <section className="report-board">
      <header className="report-board-head">
        <h2>{spec.title}</h2>
        <p className="muted">{badge}</p>
      </header>
      <div className="report-kpis">
        {spec.kpis.map((id) => (
          <article key={id} className="report-kpi">
            <strong>{kpiValue(id, summary, stock.length)}</strong>
            <span>{kpiLabel(id)}</span>
          </article>
        ))}
      </div>
      {spec.unavailable.includes("viewToOrder") ? (
        <p className="muted">View-to-order conversion is not available (no page-view events in v1).</p>
      ) : null}
      {spec.charts.includes("gmvByDay") ? (
        <table className="report-table">
          <caption>GMV by day (USD cents shown as currency)</caption>
          <thead>
            <tr>
              <th>Day</th>
              <th>GMV</th>
              <th>Orders</th>
            </tr>
          </thead>
          <tbody>
            {summary.gmvByDay.map((row) => (
              <tr key={row.date}>
                <td>{row.date}</td>
                <td>{formatCents(row.gmvCents)}</td>
                <td>{row.orderCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {spec.charts.includes("topProducts") ? (
        <table className="report-table">
          <caption>Top products by merchandise GMV</caption>
          <thead>
            <tr>
              <th>Product</th>
              <th>Units</th>
              <th>GMV</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={3}>No orders in this window</td>
              </tr>
            ) : (
              products.map((row) => (
                <tr key={row.productId}>
                  <td>{row.name}</td>
                  <td>{row.units}</td>
                  <td>{formatCents(row.gmvCents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}
      {spec.charts.includes("deliveryMix") ? (
        <p>
          Delivery mix: STANDARD {summary.delivery.STANDARD} · EXPRESS {summary.delivery.EXPRESS}
        </p>
      ) : null}
      {spec.charts.includes("premium") ? (
        <p>
          Premium customers {summary.premiumUserCount}/{summary.userCount}. Premium orders{" "}
          {summary.premiumOrderCount}/{summary.orderCount}.
        </p>
      ) : null}
    </section>
  );
}
