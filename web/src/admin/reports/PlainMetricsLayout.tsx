import type { MetricsSummary } from "@smartshop/shared";
import { formatCents } from "../../money";
import type { HtmlReportProduct, HtmlReportStock } from "./fillTemplate";

export function PlainMetricsLayout({
  summary,
  products,
  stock,
  badge,
}: {
  summary: MetricsSummary;
  products: HtmlReportProduct[];
  stock: HtmlReportStock[];
  badge: string;
}) {
  return (
    <section className="report-board" aria-label="Live metrics">
      <div className="report-board-head">
        <h2>Live metrics</h2>
        <span className="muted">{badge}</span>
      </div>
      <div className="report-kpis">
        <div className="report-kpi">
          <span>GMV</span>
          <strong>{formatCents(summary.gmvCents)}</strong>
        </div>
        <div className="report-kpi">
          <span>Orders</span>
          <strong>{summary.orderCount}</strong>
        </div>
        <div className="report-kpi">
          <span>AOV</span>
          <strong>{formatCents(summary.aovCents)}</strong>
        </div>
        <div className="report-kpi">
          <span>Standard</span>
          <strong>{summary.delivery.STANDARD}</strong>
        </div>
        <div className="report-kpi">
          <span>Express</span>
          <strong>{summary.delivery.EXPRESS}</strong>
        </div>
      </div>
      <table className="report-table">
        <caption>Top products</caption>
        <tbody>
          {products.length > 0 ? (
            products.map((row) => (
              <tr key={row.productId}>
                <td>{row.name}</td>
                <td>{row.units}</td>
                <td>{formatCents(row.gmvCents)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td>No orders in this window</td>
            </tr>
          )}
        </tbody>
      </table>
      <table className="report-table">
        <caption>Stockouts</caption>
        <tbody>
          {stock.length > 0 ? (
            stock.map((row) => (
              <tr key={row.productId}>
                <td>{row.name}</td>
                <td>{row.stockQty}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td>No active SKUs at zero</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
