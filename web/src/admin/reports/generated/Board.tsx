import {
  gmvPacePercent,
  resolveDashboardTargetCents,
  type DashboardSpec,
} from "@smartshop/shared";
import { formatCents } from "../../../money";
import type { GeneratedBoardProps } from "../boardTypes";
import { EMPTY_ORDERS_COPY, isEmptyOrdersWindow } from "../emptyWindow";
import { kpiLabel } from "../labels";
import { kpiValue } from "../kpiValues";
import styles from "./Board.module.css";

export const isCustomBoard = true;

const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function themeClass(theme: DashboardSpec["theme"]): string {
  switch (theme) {
    case "navy":
      return "";
    case "store":
      return styles.store;
    default: {
      const _never: never = theme;
      return _never;
    }
  }
}

function stockouts(stock: GeneratedBoardProps["stock"]) {
  return stock.filter((row) => row.stockQty === 0);
}

function usd(cents: number): string {
  return cents === 0 ? "$0.00" : formatCents(cents);
}

function dayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isKeyboardSku(name: string): boolean {
  return name.toLowerCase().includes("keyboard");
}

function PaceRadar({
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
  const ticks = Array.from({ length: 24 }, (_, index) => index);
  return (
    <figure className={styles.radar}>
      <svg viewBox="0 0 140 140" role="img" aria-label={`GMV pace ${pace ?? "unavailable"} percent of target`}>
        <circle cx="70" cy="70" r="58" fill="none" stroke="currentColor" strokeOpacity="0.12" />
        <circle cx="70" cy="70" r="34" fill="none" stroke="currentColor" strokeOpacity="0.1" />
        {ticks.map((tick) => {
          const angle = (tick / 24) * Math.PI * 2 - Math.PI / 2;
          const inner = tick % 6 === 0 ? 54 : 56;
          return (
            <line
              key={tick}
              x1={70 + Math.cos(angle) * inner}
              y1={70 + Math.sin(angle) * inner}
              x2={70 + Math.cos(angle) * 60}
              y2={70 + Math.sin(angle) * 60}
              stroke="currentColor"
              strokeOpacity={tick % 6 === 0 ? 0.45 : 0.22}
            />
          );
        })}
        <circle
          cx="70"
          cy="70"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="8"
        />
        <circle
          cx="70"
          cy="70"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dash}
          transform="rotate(-90 70 70)"
        />
        <g className={styles.sweep}>
          <path d="M70 70 L70 18" stroke="var(--cyan)" strokeWidth="1.5" strokeOpacity="0.7" />
          <circle cx="70" cy="18" r="2.4" fill="var(--cyan)" />
        </g>
      </svg>
      <figcaption>
        <strong>{pace === null ? "—" : `${pace}%`}</strong>
        <span>of {target > 0 ? formatCents(target) : "target"}</span>
      </figcaption>
    </figure>
  );
}

function DailyHorizon({ rows }: { rows: GeneratedBoardProps["summary"]["gmvByDay"] }) {
  const peak = rows.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  if (isEmptyOrdersWindow(peak, rows.length)) {
    return <p className={styles.muted}>{EMPTY_ORDERS_COPY}</p>;
  }
  return (
    <ol className={styles.horizon} aria-label="Daily GMV from GET /v1/admin/metrics/summary">
      {rows.map((row) => {
        const height = Math.max(4, Math.round((row.gmvCents / peak) * 92));
        return (
          <li key={row.date} title={`${row.date}: ${usd(row.gmvCents)} · ${row.orderCount} orders`}>
            <span className={styles.bar} style={{ height: `${height}px` }} />
            <span className={styles.barValue}>{usd(row.gmvCents)}</span>
            <span className={styles.barDay}>{dayLabel(row.date)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function GeneratedBoard({ spec, summary, products, stock, badge }: GeneratedBoardProps) {
  const zeros = stockouts(stock);
  const target = resolveDashboardTargetCents(spec, summary);
  const pace = gmvPacePercent(summary.gmvCents, target);
  const ratio = target <= 0 ? 0 : Math.min(1, summary.gmvCents / target);
  const peakGmv = products.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  const windowLabel = `${spec.windowDays}-day window`;

  return (
    <section className={`${styles.board} ${themeClass(spec.theme)}`}>
      <div className={styles.inner}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.live}>Command feed</span>
              <span>{badge}</span>
              <span>{windowLabel}</span>
              <span>USD cents · GET /v1/admin/metrics/*</span>
            </p>
            <h2 className={styles.title}>{spec.title}</h2>
            <p className={styles.gmv}>{usd(summary.gmvCents)}</p>
            <p className={styles.targetMeta}>
              {target > 0
                ? `${pace === null ? "—" : `${pace}%`} of ${formatCents(target)} GMV target`
                : "No GMV target configured"}
              {` · ${summary.orderCount} orders`}
            </p>
            {target > 0 ? (
              <div className={styles.track} aria-hidden="true">
                <i className={styles.fill} style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
            ) : null}
          </div>
          {spec.kpis.includes("targetPace") ? <PaceRadar spec={spec} summary={summary} /> : null}
        </header>

        <div className={styles.rail}>
          {spec.kpis
            .filter((id) => id !== "targetPace")
            .map((id) => (
              <article key={id} className={styles.keycap}>
                <strong>{kpiValue(id, spec, summary, zeros.length)}</strong>
                <span>{kpiLabel(id)}</span>
              </article>
            ))}
        </div>

        {spec.unavailable.includes("viewToOrder") ? (
          <p className={styles.note}>
            View-to-order conversion is not available (no page-view events in v1).
          </p>
        ) : null}

        <div className={styles.grid}>
          {spec.charts.includes("gmvByDay") ? (
            <section className={styles.panel}>
              <h3>Daily GMV bars</h3>
              <DailyHorizon rows={summary.gmvByDay} />
            </section>
          ) : null}

          <div>
            {spec.charts.includes("topProducts") ? (
              <section className={styles.panel}>
                <h3>Product lanes</h3>
                {products.length === 0 ? (
                  <p className={styles.muted}>{EMPTY_ORDERS_COPY}</p>
                ) : (
                  <ol className={styles.lanes} aria-label="Top products from GET /v1/admin/metrics/products">
                    {products.map((row, index) => (
                      <li
                        key={row.productId}
                        className={isKeyboardSku(row.name) ? styles.heroProduct : undefined}
                      >
                        <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
                        <span className={styles.laneName}>{row.name}</span>
                        <b className={styles.laneGmv}>{usd(row.gmvCents)}</b>
                        <span className={styles.travel}>
                          <i
                            style={{
                              width:
                                peakGmv > 0
                                  ? `${Math.max(8, (row.gmvCents / peakGmv) * 100)}%`
                                  : "8%",
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
              <section className={styles.panel} style={{ marginTop: spec.charts.includes("topProducts") ? "1rem" : 0 }}>
                <h3>Stockout chips</h3>
                {zeros.length === 0 ? (
                  <p className={styles.muted}>No SKUs at zero stock</p>
                ) : (
                  <ul className={styles.chips} aria-label="Zero-stock SKUs from GET /v1/admin/metrics/stock">
                    {zeros.map((row) => (
                      <li key={row.productId}>{row.name}</li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        </div>

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
      </div>
    </section>
  );
}
