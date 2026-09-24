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
  const track = spec.theme === "navy" ? "#2a4a5c" : "#d5ddd7";
  const fill = spec.theme === "navy" ? "#c9a227" : "#3d9b80";
  return (
    <figure className={styles.ring}>
      <svg viewBox="0 0 108 108" role="img" aria-label={`GMV pace ${pace ?? "unavailable"} percent of target`}>
        <circle cx="54" cy="54" r={RING_RADIUS} fill="none" stroke={track} strokeWidth="8" />
        <circle
          cx="54"
          cy="54"
          r={RING_RADIUS}
          fill="none"
          stroke={fill}
          strokeWidth="8"
          strokeLinecap="round"
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
    return <p className={styles.muted}>{EMPTY_ORDERS_COPY}</p>;
  }
  return (
    <ol className={styles.horizon} aria-label="Daily GMV">
      {rows.map((row) => {
        const height = Math.max(2, Math.round((row.gmvCents / peak) * 76));
        return (
          <li key={row.date} title={`${row.date}: ${moneyOrZero(row.gmvCents)}`}>
            <span className={styles.bar} style={{ height: `${height}px` }} />
          </li>
        );
      })}
    </ol>
  );
}

export function GeneratedBoard(props: {
  spec: DashboardSpec;
  summary: MetricsSummary;
  products: Array<{ productId: string; name: string; units: number; gmvCents: number }>;
  stock: Array<{ productId: string; name: string; stockQty: number }>;
  badge: string;
}): JSX.Element {
  const { spec, summary, products, stock, badge } = props;
  const zeros = stockouts(stock);
  const theme = spec.theme === "navy" ? styles.navy : "";
  const peakGmv = products.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  const windowLabel = spec.windowDays === 30 ? "30-day window" : "7-day window";

  return (
    <section className={`${styles.board} ${theme}`.trim()}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            {badge} · {windowLabel}
          </p>
          <h2 className={styles.title}>{spec.title}</h2>
          <p className={styles.gmv}>{moneyOrZero(summary.gmvCents)}</p>
        </div>
        {spec.kpis.includes("targetPace") ? <PaceRing spec={spec} summary={summary} /> : null}
      </header>
      <div className={styles.rail}>
        {spec.kpis
          .filter((id) => id !== "targetPace")
          .map((id) => (
            <article key={id} className={styles.kpi}>
              <strong>{kpiValue(id, spec, summary, zeros.length)}</strong>
              <span>{kpiLabel(id)}</span>
            </article>
          ))}
      </div>
      {spec.unavailable.includes("viewToOrder") ? (
        <p className={styles.muted}>View-to-order conversion is not available (no page-view events in v1).</p>
      ) : null}
      {spec.charts.includes("gmvByDay") ? (
        <section className={styles.section}>
          <h3>Daily GMV</h3>
          <DailyGmv rows={summary.gmvByDay} />
        </section>
      ) : null}
      {spec.charts.includes("topProducts") ? (
        <section className={styles.section}>
          <h3>Product lanes</h3>
          {products.length === 0 ? (
            <p className={styles.muted}>{EMPTY_ORDERS_COPY}</p>
          ) : (
            <ol className={styles.lanes}>
              {products.map((row) => (
                <li key={row.productId}>
                  <span>{row.name}</span>
                  <b>{moneyOrZero(row.gmvCents)}</b>
                  <span className={styles.laneFill}>
                    <i
                      style={{
                        width: peakGmv > 0 ? `${Math.max(8, (row.gmvCents / peakGmv) * 100)}%` : "8%",
                      }}
                    />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
      {spec.kpis.includes("stockouts") ? (
        <section className={styles.section}>
          <h3>Stockout radar</h3>
          {zeros.length === 0 ? (
            <p className={styles.muted}>No SKUs at zero stock</p>
          ) : (
            <ul className={styles.chips}>
              {zeros.map((row) => (
                <li key={row.productId}>{row.name}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {spec.charts.includes("deliveryMix") ? (
        <p className={styles.muted}>
          Delivery mix: STANDARD {summary.delivery.STANDARD} · EXPRESS {summary.delivery.EXPRESS}
        </p>
      ) : null}
      {spec.charts.includes("premium") ? (
        <p className={styles.muted}>
          Premium customers {summary.premiumUserCount}/{summary.userCount}. Premium orders{" "}
          {summary.premiumOrderCount}/{summary.orderCount}.
        </p>
      ) : null}
    </section>
  );
}
