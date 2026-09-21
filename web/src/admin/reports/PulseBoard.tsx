import {
  gmvPacePercent,
  resolveDashboardTargetCents,
  type DashboardSpec,
} from "@smartshop/shared";
import { formatCents } from "../../money";
import type { GeneratedBoardProps } from "./boardTypes";
import { EMPTY_ORDERS_COPY, isEmptyOrdersWindow } from "./emptyWindow";
import { kpiLabel } from "./labels";
import { kpiValue } from "./kpiValues";

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function stockouts(stock: GeneratedBoardProps["stock"]) {
  return stock.filter((row) => row.stockQty === 0);
}

function PaceRing({
  spec,
  summary,
}: {
  spec: DashboardSpec;
  summary: GeneratedBoardProps["summary"];
}) {
  const target = resolveDashboardTargetCents(spec, summary);
  const pace = gmvPacePercent(summary.gmvCents, target);
  const ratio = target <= 0 ? 0 : Math.min(1, summary.gmvCents / target);
  const dash = RING_CIRCUMFERENCE * (1 - ratio);
  return (
    <figure className="pulse-ring">
      <svg viewBox="0 0 108 108" role="img" aria-label={`GMV pace ${pace ?? "unavailable"} percent of target`}>
        <circle className="pulse-ring-track" cx="54" cy="54" r={RING_RADIUS} />
        <circle
          className="pulse-ring-fill"
          cx="54"
          cy="54"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dash}
        />
      </svg>
      <figcaption>
        <strong>{pace === null ? "—" : `${pace}%`}</strong>
        <span>of {target > 0 ? formatCents(target) : "target"}</span>
      </figcaption>
    </figure>
  );
}

function Horizon({
  rows,
}: {
  rows: GeneratedBoardProps["summary"]["gmvByDay"];
}) {
  const peak = rows.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  if (isEmptyOrdersWindow(peak, rows.length)) {
    return <p className="muted">{EMPTY_ORDERS_COPY}</p>;
  }
  return (
    <ol className="pulse-horizon" aria-label="Daily GMV">
      {rows.map((row) => {
        const height = Math.max(2, Math.round((row.gmvCents / peak) * 72));
        return (
          <li key={row.date} title={`${row.date}: ${formatCents(row.gmvCents)}`}>
            <span style={{ height: `${height}px` }} />
          </li>
        );
      })}
    </ol>
  );
}

export function PulseBoard({ spec, summary, products, stock, badge }: GeneratedBoardProps) {
  const zeros = stockouts(stock);
  const theme = spec.theme === "navy" ? "navy" : "store";
  const layout = spec.layout === "command" ? "command" : "pulse";
  const peakGmv = products.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  return (
    <section className={`pulse-board${layout === "command" ? " command-board" : ""} is-${theme} is-${layout}`}>
      <header className="pulse-hero">
        <div>
          <p className="muted">{badge}</p>
          <h2>{spec.title}</h2>
          <p className="pulse-gmv">
            {summary.gmvCents === 0 ? "$0.00" : formatCents(summary.gmvCents)}
          </p>
        </div>
        {spec.kpis.includes("targetPace") ? <PaceRing spec={spec} summary={summary} /> : null}
      </header>
      <div className="pulse-rail">
        {spec.kpis
          .filter((id) => id !== "targetPace")
          .map((id) => (
            <article key={id} className="pulse-kpi">
              <strong>{kpiValue(id, spec, summary, zeros.length)}</strong>
              <span>{kpiLabel(id)}</span>
            </article>
          ))}
      </div>
      {spec.unavailable.includes("viewToOrder") ? (
        <p className="muted">View-to-order conversion is not available (no page-view events in v1).</p>
      ) : null}
      {spec.charts.includes("gmvByDay") ? (
        <section>
          <h3>Daily GMV</h3>
          <Horizon rows={summary.gmvByDay} />
        </section>
      ) : null}
      {spec.charts.includes("topProducts") ? (
        <section>
          <h3>Product lanes</h3>
          {products.length === 0 ? (
            <p className="muted">{EMPTY_ORDERS_COPY}</p>
          ) : (
            <ol className="pulse-lanes">
              {products.map((row) => (
                <li key={row.productId}>
                  <span>{row.name}</span>
                  <b>{formatCents(row.gmvCents)}</b>
                  <i
                    style={{
                      width: peakGmv > 0 ? `${Math.max(8, (row.gmvCents / peakGmv) * 100)}%` : "8%",
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
      {spec.kpis.includes("stockouts") ? (
        <section>
          <h3>Stockout radar</h3>
          {zeros.length === 0 ? (
            <p className="muted">No SKUs at zero stock</p>
          ) : (
            <ul className="pulse-chips">
              {zeros.map((row) => (
                <li key={row.productId}>{row.name}</li>
              ))}
            </ul>
          )}
        </section>
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
