import { useEffect, useMemo, useState } from "react";
import type { HtmlReportJob, HtmlReportWindowDays, MetricsSummary } from "@smartshop/shared";
import { ApiRequestError } from "../api";
import {
  approveHtmlReportJob,
  createHtmlReportJob,
  getAdminMetricsProducts,
  getAdminMetricsStock,
  getAdminMetricsSummary,
  getHtmlReportJob,
  getPublishedHtmlReport,
  refineHtmlReportJob,
} from "../api";
import { fillHtmlTemplate, type HtmlReportProduct, type HtmlReportStock } from "../admin/reports/fillTemplate";
import { PlainMetricsLayout } from "../admin/reports/PlainMetricsLayout";
import { ReportHtmlFrame } from "../admin/reports/ReportHtmlFrame";

const METRIC_CHIPS = ["summary", "products", "stock", "delivery", "premium"] as const;

export function AdminReportsV2Page() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [products, setProducts] = useState<HtmlReportProduct[]>([]);
  const [stock, setStock] = useState<HtmlReportStock[]>([]);
  const [published, setPublished] = useState<HtmlReportJob | null>(null);
  const [job, setJob] = useState<HtmlReportJob | null>(null);
  const [windowDays, setWindowDays] = useState<HtmlReportWindowDays>(7);
  const [prompt, setPrompt] = useState(
    "Monthly stock and delivery mix, print-friendly, with a dark header.",
  );
  const [refine, setRefine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const running = job?.status === "running";
  const previewReady = job?.status === "preview_ready";
  const template =
    previewReady || job?.status === "approved"
      ? job?.templateHtml
      : running
        ? undefined
        : published?.templateHtml;
  const filled = useMemo(() => {
    if (!template || !summary) {
      return null;
    }
    return fillHtmlTemplate(template, { summary, products, stock });
  }, [template, summary, products, stock]);

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
    getPublishedHtmlReport()
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
    if (!running || !job?.jobId) {
      return;
    }
    const jobId = job.jobId;
    const timer = window.setInterval(() => {
      getHtmlReportJob(jobId)
        .then(setJob)
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : "Could not poll job");
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [running, job?.jobId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setJob(await createHtmlReportJob(prompt, windowDays));
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
      setJob(await refineHtmlReportJob(job.jobId, refine, windowDays));
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
      const approved = await approveHtmlReportJob(job.jobId);
      setJob(approved);
      setPublished(approved.templateHtml ? { ...approved, jobId: "published-html", status: "published" } : approved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  const showPlain = !filled || running || job?.status === "error";
  const frameTitle = previewReady ? "Report preview" : "Approved report";

  return (
    <section className="report-page">
      <h1>HTML reports</h1>
      <p className="muted">
        The cloud agent returns an HTML template. This page fills it with live metrics. Approve
        stores the template. The agent does not edit or commit the repo.
      </p>
      <div className="report-v2-chips" aria-label="Available metrics">
        {METRIC_CHIPS.map((chip) => (
          <span key={chip} className="report-v2-chip">
            {chip}
          </span>
        ))}
      </div>
      <div className="report-v2-window" role="group" aria-label="Metric window">
        <button
          type="button"
          aria-pressed={windowDays === 7}
          onClick={() => setWindowDays(7)}
        >
          7 days
        </button>
        <button
          type="button"
          aria-pressed={windowDays === 30}
          onClick={() => setWindowDays(30)}
        >
          30 days
        </button>
      </div>
      {error ? <p className="flash error">{error}</p> : null}
      {job?.status === "error" && job.errorMessage ? (
        <p className="flash error">{job.errorMessage}</p>
      ) : null}
      {summary && showPlain ? (
        <PlainMetricsLayout
          summary={summary}
          products={products}
          stock={stock}
          badge={running ? "Generating template" : "Shop metrics"}
        />
      ) : null}
      {!summary && !error ? <p className="muted">Loading metrics…</p> : null}
      {filled && !running ? <ReportHtmlFrame title={frameTitle} html={filled} /> : null}
      <form
        className="report-prompt"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <label>
          Report prompt
          <textarea
            rows={4}
            value={prompt}
            disabled={busy || running}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || running || prompt.trim().length < 8}>
          Generate preview
        </button>
      </form>
      {job ? (
        <p className="muted">
          Job {job.jobId} · {job.status}
          {job.agentId ? ` · agent ${job.agentId}` : ""}
        </p>
      ) : null}
      {previewReady ? (
        <form
          className="report-prompt"
          onSubmit={(event) => {
            event.preventDefault();
            void sendRefine();
          }}
        >
          <label>
            Refine
            <textarea
              rows={3}
              value={refine}
              disabled={busy}
              onChange={(event) => setRefine(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || refine.trim().length < 4}>
            Refine preview
          </button>
          <button type="button" disabled={busy} onClick={() => void approve()}>
            Approve template
          </button>
        </form>
      ) : null}
    </section>
  );
}
