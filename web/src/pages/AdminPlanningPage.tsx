import { lazy, Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createAgentSession, sendAgentMessage } from "../api";
import { loadConfig } from "../config";

const PlanMap = lazy(() => import("./PlanMap").then((module) => ({ default: module.PlanMap })));

type ChatLine = { role: "user" | "agent"; text: string };

export function AdminPlanningPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [routeGeojson, setRouteGeojson] = useState<string | null>(null);
  const [mapsKey, setMapsKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadConfig()
      .then((config) => setMapsKey(config.mapsBrowserKey))
      .catch(() => setMapsKey(""));
    createAgentSession()
      .then((session) => setSessionId(session.sessionId))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not start planning");
      });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !sessionId || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setLines((current) => [...current, { role: "user", text }]);
    setDraft("");
    try {
      const turn = await sendAgentMessage(sessionId, text);
      setLines((current) => [...current, { role: "agent", text: turn.reply }]);
      if (turn.routeGeojson) {
        setRouteGeojson(turn.routeGeojson);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not plan that address");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="plan-page">
      <div className="plan-chat">
        <header className="hero">
          <h1>Store planning</h1>
          <p className="lede">
            Ask for a candidate address. The reply compares current stores and nearby competitors by drive time.
          </p>
        </header>
        {error ? <p className="flash error">{error}</p> : null}
        <ol className="plan-log">
          {lines.map((line, index) => (
            <li key={`${line.role}-${index}`} className={line.role}>
              {line.text}
            </li>
          ))}
        </ol>
        <form onSubmit={(event) => void onSubmit(event)}>
          <label>
            Candidate address
            <input
              value={draft}
              maxLength={500}
              placeholder="391 Orchard Rd, Singapore"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button type="submit" disabled={!sessionId || busy || draft.trim().length === 0}>
            {busy ? "Planning…" : "Send"}
          </button>
        </form>
      </div>
      <div className="plan-map-wrap">
        {routeGeojson ? (
          <Suspense fallback={<p className="muted">Loading map…</p>}>
            <PlanMap mapsKey={mapsKey} routeGeojson={routeGeojson} />
          </Suspense>
        ) : (
          <p className="muted">A map appears after a plan has driving routes.</p>
        )}
      </div>
    </section>
  );
}
