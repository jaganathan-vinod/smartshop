import { formatCents } from "../../money";
import type { GeneratedBoardProps } from "./boardTypes";
import { EMPTY_ORDERS_COPY, isEmptyOrdersWindow } from "./emptyWindow";
import { kpiLabel } from "./labels";
import { kpiValue } from "./kpiValues";

export function DashboardPanel({ spec, summary, products, stock, badge }: GeneratedBoardProps) {
  const stockCount = stock.filter((row) => row.stockQty === 0).length;
  return (
    <section className="report-board">
      <header className="report-board-head">
        <h2>{spec.title}</h2>
        <p className="muted">{badge}</p>
      </header>
      <div className="report-kpis">
        {spec.kpis.map((id) => (
          <article key={id} className="report-kpi">
            <strong>{kpiValue(id, spec, summary, stockCount)}</strong>
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
            {isEmptyOrdersWindow(summary.gmvCents, summary.gmvByDay.length) ? (
              <tr>
                <td colSpan={3}>{EMPTY_ORDERS_COPY}</td>
              </tr>
            ) : (
              summary.gmvByDay.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.gmvCents === 0 ? "$0.00" : formatCents(row.gmvCents)}</td>
                  <td>{row.orderCount}</td>
                </tr>
              ))
            )}
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
                <td colSpan={3}>{EMPTY_ORDERS_COPY}</td>
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
