import { lazy, Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { PlanApiCall, PlanChoice } from "@smartshop/shared";
import { createAgentSession, sendAgentMessage } from "../api";
import { loadConfig } from "../config";
import { GoogleCallTrace } from "./GoogleCallTrace";

const PlanMap = lazy(() => import("./PlanMap").then((module) => ({ default: module.PlanMap })));

type PlanView = {
  address: string;
  choices: PlanChoice[];
  selectedId: string;
};

export function AdminPlanningPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [fallbackGeojson, setFallbackGeojson] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [trace, setTrace] = useState<PlanApiCall[]>([]);
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
    setDraft("");
    try {
      const turn = await sendAgentMessage(sessionId, text);
      const choices = turn.choices ?? [];
      const first = choices[0];
      setTrace(turn.trace ?? []);
      if (first) {
        setNotice(null);
        setFallbackGeojson(null);
        setPlan({ address: text, choices, selectedId: first.id });
      } else {
        setPlan(null);
        setFallbackGeojson(turn.routeGeojson ?? null);
        setNotice(turn.reply);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not plan that address");
    } finally {
      setBusy(false);
    }
  }

  const selected = plan?.choices.find((choice) => choice.id === plan.selectedId) ?? plan?.choices[0];
  const ownStore = plan?.choices.find((choice) => choice.subjectKind === "CURRENT_STORE");
  const competitors = plan?.choices.filter((choice) => choice.subjectKind === "COMPETITOR") ?? [];

  return (
    <>
    <section className="plan-page">
      <div className="plan-chat">
        <header className="hero">
          <h1>Store planning</h1>
          <p className="lede">
            The map opens on the nearest SmartShop store. Choose a competitor to draw that route instead.
          </p>
        </header>
        {error ? <p className="flash error">{error}</p> : null}
        {plan ? <p className="muted">Candidate {plan.address}</p> : null}
        {notice ? <p className="plan-notice">{notice}</p> : null}
        {ownStore ? (
          <div className="plan-group">
            <h2>Our store</h2>
            <ChoiceButton
              choice={ownStore}
              selected={selected?.id === ownStore.id}
              onSelect={() => setPlan((current) => (current ? { ...current, selectedId: ownStore.id } : current))}
            />
          </div>
        ) : null}
        {competitors.length > 0 ? (
          <div className="plan-group">
            <h2>Competitors</h2>
            <ul className="plan-choices">
              {competitors.map((choice) => (
                <li key={choice.id}>
                  <ChoiceButton
                    choice={choice}
                    selected={selected?.id === choice.id}
                    onSelect={() =>
                      setPlan((current) => (current ? { ...current, selectedId: choice.id } : current))
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
        {selected ? (
          <Suspense fallback={<p className="muted">Loading map…</p>}>
            <p className="muted plan-map-caption">{selected.subjectName}</p>
            <PlanMap mapsKey={mapsKey} routeGeojson={selected.routeGeojson} />
          </Suspense>
        ) : fallbackGeojson ? (
          <Suspense fallback={<p className="muted">Loading map…</p>}>
            <PlanMap mapsKey={mapsKey} routeGeojson={fallbackGeojson} />
          </Suspense>
        ) : (
          <p className="muted">A map appears after a plan has driving routes.</p>
        )}
      </div>
    </section>
    <GoogleCallTrace
      summary="How this plan was computed"
      intro="Geocoding turns the address into a point. Places searchNearby finds grocery competitors within 3 km. Routes computeRoutes then drives from each SmartShop store and each competitor to that point. The API key is omitted."
      calls={trace}
    />
    </>
  );
}

function ChoiceButton({
  choice,
  selected,
  onSelect,
}: {
  choice: PlanChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  const km = (choice.distanceMeters / 1000).toFixed(1);
  const minutes = Math.max(1, Math.round(choice.durationSeconds / 60));
  return (
    <button
      type="button"
      className={selected ? "plan-choice is-selected" : "plan-choice"}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span>{choice.subjectName}</span>
      <span>
        {km} km · {minutes} min
      </span>
    </button>
  );
}
