import {
  gmvPacePercent,
  resolveDashboardTargetCents,
  type DashboardSpec,
  type MetricsSummary,
} from "@smartshop/shared";
import { formatCents } from "../../../money";
import type { GeneratedBoardProps } from "../boardTypes";
import { EMPTY_ORDERS_COPY, isEmptyOrdersWindow } from "../emptyWindow";
import { kpiLabel } from "../labels";
import { kpiValue } from "../kpiValues";
import styles from "./Board.module.css";

export const isCustomBoard = true;

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Live numbers come from GET /v1/admin/metrics/{summary,products,stock} (integer cents, USD). */
function stockouts(stock: GeneratedBoardProps["stock"]) {
  return stock.filter((row) => row.stockQty === 0);
}

function moneyOrZero(cents: number): string {
  return cents === 0 ? "$0.00" : formatCents(cents);
}

function PaceRing({
  spec,
  summary,
}: {
  spec: DashboardSpec;
  summary: MetricsSummary;
}) {
  const target = resolveDashboardTargetCents(spec, summary);
  const pace = gmvPacePercent(summary.gmvCents, target);
  const ratio = target <= 0 ? 0 : Math.min(1, summary.gmvCents / target);
  const dash = RING_CIRCUMFERENCE * (1 - ratio);
  const label = pace === null ? "unavailable" : `${pace}`;
  return (
    <figure className={styles.ring}>
      <svg viewBox="0 0 108 108" role="img" aria-label={`GMV pace ${label} percent of target`}>
        <circle className={styles.ringTrack} cx="54" cy="54" r={RING_RADIUS} />
        <circle
          className={styles.ringFill}
          cx="54"
          cy="54"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dash}
        />
      </svg>
      <figcaption className={styles.ringCaption}>
        <strong>{pace === null ? "—" : `${pace}%`}</strong>
        <span>of {target > 0 ? formatCents(target) : "target"}</span>
      </figcaption>
    </figure>
  );
}

function DailyGmv({ rows }: { rows: MetricsSummary["gmvByDay"] }) {
  const peak = rows.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  if (isEmptyOrdersWindow(peak, rows.length)) {
    return <p className={styles.note}>{EMPTY_ORDERS_COPY}</p>;
  }
  return (
    <ol className={styles.horizon} aria-label="Daily GMV">
      {rows.map((row) => {
        const height = Math.max(2, Math.round((row.gmvCents / peak) * 72));
        return (
          <li key={row.date} title={`${row.date}: ${moneyOrZero(row.gmvCents)}`}>
            <span style={{ height: `${height}px` }} />
          </li>
        );
      })}
    </ol>
  );
}

export function GeneratedBoard({
  spec,
  summary,
  products,
  stock,
  badge,
}: {
  spec: DashboardSpec;
  summary: MetricsSummary;
  products: Array<{ productId: string; name: string; units: number; gmvCents: number }>;
  stock: Array<{ productId: string; name: string; stockQty: number }>;
  badge: string;
}): JSX.Element {
  const zeros = stockouts(stock);
  const peakGmv = products.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  const target = resolveDashboardTargetCents(spec, summary);
  const railIds = spec.kpis.filter((id) => id !== "targetPace");

  return (
    <section className={styles.board} data-layout={spec.layout} data-theme={spec.theme}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            {badge} · last {summary.windowDays} days
          </p>
          <h2 className={styles.title}>{spec.title}</h2>
          <p className={styles.gmv}>{moneyOrZero(summary.gmvCents)}</p>
          <p className={styles.targetHint}>
            vs {target > 0 ? formatCents(target) : "target"} GMV target
          </p>
        </div>
        {spec.kpis.includes("targetPace") ? <PaceRing spec={spec} summary={summary} /> : null}
      </header>
      {railIds.length > 0 ? (
        <div className={styles.rail}>
          {railIds.map((id) => (
            <article key={id} className={styles.kpi}>
              <strong>{kpiValue(id, spec, summary, zeros.length)}</strong>
              <span>{kpiLabel(id)}</span>
            </article>
          ))}
        </div>
      ) : null}
      {spec.unavailable.includes("viewToOrder") ? (
        <p className={styles.note}>
          View-to-order conversion is not available (no page-view events in v1).
        </p>
      ) : null}
      <div className={styles.grid}>
        {spec.charts.includes("gmvByDay") ? (
          <section className={styles.panel}>
            <h3 className={styles.heading}>Daily GMV</h3>
            <DailyGmv rows={summary.gmvByDay} />
          </section>
        ) : null}
        {spec.charts.includes("topProducts") ? (
          <section className={styles.panel}>
            <h3 className={styles.heading}>Product lanes</h3>
            {products.length === 0 ? (
              <p className={styles.note}>{EMPTY_ORDERS_COPY}</p>
            ) : (
              <ol className={styles.lanes} aria-label="Top products">
                {products.map((row) => (
                  <li key={row.productId}>
                    <span>{row.name}</span>
                    <b>{moneyOrZero(row.gmvCents)}</b>
                    <i
                      className={styles.laneBar}
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
      </div>
      {spec.kpis.includes("stockouts") ? (
        <section className={styles.panel}>
          <h3 className={styles.heading}>Stockout radar</h3>
          {zeros.length === 0 ? (
            <p className={styles.note}>No SKUs at zero stock</p>
          ) : (
            <ul className={styles.chips} aria-label="Stockouts">
              {zeros.map((row) => (
                <li key={row.productId} className={styles.chip}>
                  {row.name}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {spec.charts.includes("deliveryMix") ? (
        <p className={styles.mix}>
          Delivery mix: STANDARD {summary.delivery.STANDARD} · EXPRESS {summary.delivery.EXPRESS}
        </p>
      ) : null}
      {spec.charts.includes("premium") ? (
        <p className={styles.mix}>
          Premium customers {summary.premiumUserCount}/{summary.userCount}. Premium orders{" "}
          {summary.premiumOrderCount}/{summary.orderCount}.
        </p>
      ) : null}
    </section>
  );
}
