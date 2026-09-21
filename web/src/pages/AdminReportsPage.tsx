import { useEffect, useState } from "react";
import {
  DEFAULT_DASHBOARD_SPEC,
  resolveDashboardWindowDays,
  type DashboardSpec,
  type MetricsSummary,
  type ReportJob,
} from "@smartshop/shared";
import { ApiRequestError } from "../api";
import {
  approveReportJob,
  createReportJob,
  getAdminMetricsProducts,
  getAdminMetricsStock,
  getAdminMetricsSummary,
  getPublishedReport,
  getReportJob,
  refineReportJob,
} from "../api";
import { GeneratedBoard, isCustomBoard } from "../admin/reports/generated/Board";
import { ReportBoard } from "../admin/reports/ReportBoard";

type ProductRow = { productId: string; name: string; units: number; gmvCents: number };
type StockRow = { productId: string; name: string; stockQty: number };

export function AdminReportsPage() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [published, setPublished] = useState<ReportJob | null>(null);
  const [job, setJob] = useState<ReportJob | null>(null);
  const [prompt, setPrompt] = useState(
    "Weekly executive view: GMV vs a $12k target, top products, stockouts. Board-ready.",
  );
  const [refine, setRefine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spec: DashboardSpec = job?.previewSpec ?? published?.previewSpec ?? DEFAULT_DASHBOARD_SPEC;
  const windowDays = resolveDashboardWindowDays(spec);
  const badge =
    job?.status === "preview_ready"
      ? "Preview — not live until Approve"
      : published
        ? "Live published layout"
        : "Default layout (nothing approved yet)";

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAdminMetricsSummary(windowDays),
      getAdminMetricsProducts(windowDays),
      getAdminMetricsStock(),
    ])
      .then(([nextSummary, nextProducts, nextStock]) => {
        if (!cancelled) {
          setSummary(nextSummary);
          setProducts(nextProducts.products);
          setStock(nextStock.items);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load metrics");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  useEffect(() => {
    let cancelled = false;
    getPublishedReport()
      .then((live) => {
        if (!cancelled) {
          setPublished(live);
        }
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiRequestError && caught.status === 404) {
          return;
        }
        if (!cancelled && caught instanceof Error) {
          setError(caught.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (job?.status !== "running" || !job.jobId) {
      return;
    }
    const timer = window.setInterval(() => {
      getReportJob(job.jobId)
        .then(setJob)
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : "Could not poll job");
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job?.status, job?.jobId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setJob(await createReportJob(prompt));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start Cursor agent");
    } finally {
      setBusy(false);
    }
  }

  async function sendRefine() {
    if (!job) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setJob(await refineReportJob(job.jobId, refine));
      setRefine("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refine");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!job) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const publishedJob = await approveReportJob(job.jobId);
      setJob(publishedJob);
      setPublished(publishedJob);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  const Board = isCustomBoard ? GeneratedBoard : ReportBoard;

  return (
    <section className="report-page">
      <h1>Executive reports</h1>
      <p className="muted">
        Live numbers come from orders, catalogue, and users. Generate uses a Cursor cloud agent.
        Approve publishes the layout; the agent never deploys AWS.
      </p>
      {error ? <p className="flash error">{error}</p> : null}
      {summary ? (
        <Board spec={spec} summary={summary} products={products} stock={stock} badge={badge} />
      ) : error ? null : (
        <p className="muted">Loading metrics…</p>
      )}
      {summary ? (
        <form
          className="report-prompt"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <label>
            Dashboard prompt
            <textarea
              rows={4}
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || prompt.trim().length < 8}>
            Generate preview
          </button>
        </form>
      ) : null}
      {job ? (
        <p className="muted">
          Job {job.jobId} · {job.status}
          {job.agentId ? ` · agent ${job.agentId}` : ""}
          {job.previewUrl ? (
            <>
              {" · "}
              <a href={job.previewUrl} target="_blank" rel="noreferrer">
                Cursor agent
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {job && (job.status === "preview_ready" || job.status === "error") ? (
        <form
          className="report-prompt"
          onSubmit={(event) => {
            event.preventDefault();
            void sendRefine();
          }}
        >
          <label>
            Refine (same agent)
            <textarea
              rows={3}
              value={refine}
              disabled={busy}
              onChange={(event) => setRefine(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || refine.trim().length < 4}>
            Rebuild preview
          </button>
        </form>
      ) : null}
      {job?.status === "preview_ready" ? (
        <p>
          <button type="button" disabled={busy} onClick={() => void approve()}>
            Approve and publish layout
          </button>
        </p>
      ) : null}
    </section>
  );
}
