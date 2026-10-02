import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { PlanApiCall } from "@smartshop/shared";
import { createAgentSession, getAgentSession, getMarketingAsset, sendAgentMessage } from "../api";
import { GoogleCallTrace } from "./GoogleCallTrace";

const VIDEO_WAIT_MS = 15 * 60 * 1000;
const POLL_MS = 8_000;

type AssetKind = "IMAGE" | "VIDEO";
type AssetStatus = "GENERATING" | "REVIEW" | "FAILED";

export function AdminMarketingPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [trace, setTrace] = useState<PlanApiCall[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [assetKind, setAssetKind] = useState<AssetKind | null>(null);
  const [assetStatus, setAssetStatus] = useState<AssetStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createAgentSession("marketing")
      .then((session) => setSessionId(session.sessionId))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not start marketing");
      });
  }, []);

  useEffect(() => {
    if (!sessionId || !assetId || assetKind !== "VIDEO" || assetStatus !== "GENERATING") {
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > VIDEO_WAIT_MS) {
        setAssetStatus("FAILED");
        setNotice("The video took longer than 15 minutes. No video was saved.");
        window.clearInterval(timer);
        return;
      }
      void getAgentSession(sessionId)
        .then((detail) => {
          const latest = [...detail.messages].reverse().find((message) => message.assetId === assetId);
          if (!latest?.assetStatus || latest.assetStatus === "GENERATING") {
            return;
          }
          setAssetStatus(latest.assetStatus);
          setNotice(latest.text);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [sessionId, assetId, assetKind, assetStatus]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !sessionId || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setDraft("");
    try {
      const turn = await sendAgentMessage(sessionId, text);
      setTrace(turn.trace ?? []);
      setNotice(turn.reply);
      setAssetId(turn.assetId ?? null);
      setAssetKind(turn.assetKind ?? null);
      setAssetStatus(turn.assetStatus ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send that guidance");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="plan-page">
        <div className="plan-chat">
          <header className="hero">
            <h1>Marketing</h1>
            <p className="lede">
              Ask for a catalogue still or a short video. Name a product, for example “image of Ceramic Mug on a wood table”
              or “video of Ceramic Mug”. Nothing here is published to the store.
            </p>
          </header>
          {error ? <p className="flash error">{error}</p> : null}
          {notice ? <p className="plan-notice">{notice}</p> : null}
          <form onSubmit={(event) => void onSubmit(event)}>
            <label>
              Guidance
              <input
                value={draft}
                maxLength={500}
                placeholder="video of Ceramic Mug"
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!sessionId || busy || draft.trim().length === 0}>
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
        </div>
        <div className="plan-map-wrap">
          {assetId && assetKind && assetStatus === "REVIEW" ? (
            <MarketingPreview assetId={assetId} kind={assetKind} />
          ) : assetStatus === "GENERATING" ? (
            <p className="muted">Generating the video. This page checks until it is ready.</p>
          ) : (
            <p className="muted">A still or video appears here after it is ready for review.</p>
          )}
        </div>
      </section>
      <GoogleCallTrace
        summary="How this marketing asset was requested"
        intro="Image turns call Gemini generateContent. Video turns start Veo predictLongRunning and finish in the background. Keys are omitted, and the video trace records the operation name rather than the file bytes."
        calls={trace}
      />
    </>
  );
}

function MarketingPreview({ assetId, kind }: { assetId: string; kind: AssetKind }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    getMarketingAsset(assetId)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load the marketing asset");
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [assetId]);

  if (error) {
    return <p className="flash error">{error}</p>;
  }
  if (!src) {
    return <p className="muted">{kind === "VIDEO" ? "Loading video…" : "Loading image…"}</p>;
  }
  if (kind === "VIDEO") {
    return <video className="plan-asset" controls src={src} />;
  }
  return <img className="plan-asset" alt="Generated catalogue image" src={src} />;
}
