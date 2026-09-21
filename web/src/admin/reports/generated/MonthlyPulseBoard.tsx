import { useEffect, useState } from "react";
import type { DashboardSpec, MetricsSummary } from "@smartshop/shared";
import {
  getAdminMetricsProducts,
  getAdminMetricsStock,
  getAdminMetricsSummary,
} from "../../../api";
import { formatCents } from "../../../money";
import { kpiLabel } from "../labels";
import styles from "./MonthlyPulseBoard.module.css";
import { MONTHLY_PULSE_SPEC, MONTHLY_WINDOW_DAYS } from "./spec";

type ProductRow = { productId: string; name: string; units: number; gmvCents: number };
type StockRow = { productId: string; name: string; stockQty: number };

function kpiValue(
  id: DashboardSpec["kpis"][number],
  summary: MetricsSummary,
  stockCount: number,
  targetCents: number,
): string {
  switch (id) {
    case "gmv":
      return formatCents(summary.gmvCents);
    case "orderCount":
      return String(summary.orderCount);
    case "aov":
      return formatCents(summary.aovCents);
    case "targetPace": {
      if (targetCents <= 0) {
        return "—";
      }
      return `${Math.round((summary.gmvCents / targetCents) * 100)}%`;
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

function PaceRing({ gmvCents, targetCents }: { gmvCents: number; targetCents: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const ratio = targetCents <= 0 ? 0 : Math.min(gmvCents / targetCents, 1);
  return (
    <div className={styles.ringWrap}>
      <svg className={styles.ringSvg} viewBox="0 0 100 100" aria-hidden="true">
        <circle className={styles.ringTrack} cx="50" cy="50" r={radius} />
        <circle
          className={styles.ringValue}
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={`${circumference * ratio} ${circumference}`}
        />
      </svg>
      <div className={styles.ringLabel}>
        <strong>{targetCents <= 0 ? "—" : `${Math.round(ratio * 100)}%`}</strong>
        <span>of {formatCents(targetCents)}</span>
      </div>
    </div>
  );
}

function GmvHorizon({ rows }: { rows: MetricsSummary["gmvByDay"] }) {
  const peak = rows.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  return (
    <div>
      <p className={styles.caption}>
        Daily merchandise GMV from GET /v1/admin/metrics/summary (last {MONTHLY_WINDOW_DAYS}{" "}
        days)
      </p>
      {rows.length === 0 ? (
        <p className={styles.empty}>No daily GMV in this window</p>
      ) : (
        <div className={styles.horizon} role="img" aria-label="GMV by day">
          {rows.map((row) => {
            const height = peak <= 0 ? 0 : (row.gmvCents / peak) * 100;
            return (
              <div
                key={row.date}
                className={styles.bar}
                style={{ height: `${height}%` }}
                title={`${row.date}: ${formatCents(row.gmvCents)} · ${row.orderCount} orders`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopProductLanes({ products }: { products: ProductRow[] }) {
  const peak = products.reduce((max, row) => Math.max(max, row.gmvCents), 0);
  return (
    <div>
      <p className={styles.caption}>Top products from GET /v1/admin/metrics/products</p>
      {products.length === 0 ? (
        <p className={styles.empty}>No orders in this window</p>
      ) : (
        <div className={styles.lanes}>
          {products.map((row) => {
            const width = peak <= 0 ? 0 : (row.gmvCents / peak) * 100;
            return (
              <article key={row.productId} className={styles.lane}>
                <span className={styles.laneName}>{row.name}</span>
                <span className={styles.laneMeta}>
                  {row.units} · {formatCents(row.gmvCents)}
                </span>
                <div className={styles.laneTrack}>
                  <div className={styles.laneFill} style={{ width: `${width}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StockRadar({ stock }: { stock: StockRow[] }) {
  return (
    <div>
      <p className={styles.caption}>Stockouts from GET /v1/admin/metrics/stock</p>
      {stock.length === 0 ? (
        <p className={styles.ok}>No SKUs at zero stock</p>
      ) : (
        <div className={styles.stock}>
          {stock.map((row) => (
            <span key={row.productId} className={styles.chip}>
              {row.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MonthlyPulseBoard({ badge }: { badge: string }) {
  const spec = MONTHLY_PULSE_SPEC;
  const targetCents = spec.gmvTargetCents ?? 0;
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAdminMetricsSummary(MONTHLY_WINDOW_DAYS),
      getAdminMetricsProducts(MONTHLY_WINDOW_DAYS),
      getAdminMetricsStock(),
    ])
      .then(([nextSummary, nextProducts, nextStock]) => {
        if (cancelled) {
          return;
        }
        setSummary(nextSummary);
        setProducts(nextProducts.products);
        setStock(nextStock.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load metrics");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className={styles.board}>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className={styles.board}>
        <p className={styles.empty}>Loading live metrics…</p>
      </section>
    );
  }

  const railKpis = spec.kpis.filter((id) => id !== "gmv" && id !== "targetPace");

  return (
    <section className={styles.board}>
      <header className={styles.head}>
        <h2>{spec.title}</h2>
        <p className={styles.badge}>{badge}</p>
      </header>
      <div className={styles.hero}>
        <PaceRing gmvCents={summary.gmvCents} targetCents={targetCents} />
        <div>
          {spec.kpis.includes("gmv") ? (
            <article className={styles.kpi}>
              <strong>{formatCents(summary.gmvCents)}</strong>
              <span>{kpiLabel("gmv")}</span>
            </article>
          ) : null}
          <div className={styles.kpis}>
            {railKpis.map((id) => (
              <article key={id} className={styles.kpi}>
                <strong>{kpiValue(id, summary, stock.length, targetCents)}</strong>
                <span>{kpiLabel(id)}</span>
              </article>
            ))}
          </div>
        </div>
      </div>
      {spec.charts.includes("gmvByDay") ? <GmvHorizon rows={summary.gmvByDay} /> : null}
      {spec.charts.includes("topProducts") ? <TopProductLanes products={products} /> : null}
      {spec.kpis.includes("stockouts") ? <StockRadar stock={stock} /> : null}
      {spec.charts.includes("deliveryMix") ? (
        <p className={styles.caption}>
          Delivery mix from GET /v1/admin/metrics/delivery: STANDARD {summary.delivery.STANDARD} ·
          EXPRESS {summary.delivery.EXPRESS}
        </p>
      ) : null}
      {spec.charts.includes("premium") ? (
        <p className={styles.caption}>
          Premium from GET /v1/admin/metrics/premium: {summary.premiumUserCount}/{summary.userCount}{" "}
          customers · {summary.premiumOrderCount}/{summary.orderCount} orders
        </p>
      ) : null}
      {spec.unavailable.includes("viewToOrder") ? (
        <p className={styles.note}>
          View-to-order conversion is not available (no page-view events in v1).
        </p>
      ) : null}
    </section>
  );
}
