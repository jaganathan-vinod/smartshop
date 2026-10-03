import { useState } from "react";
import type { FormEvent } from "react";
import { askGcpAgent } from "../api";

type ChatLine = {
  role: "user" | "agent";
  text: string;
};

export function AdminGcpAgentsPage() {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setDraft("");
    setLines((current) => [...current, { role: "user", text }]);
    try {
      const turn = await askGcpAgent(text, sessionId);
      setSessionId(turn.sessionId);
      setLines((current) => [...current, { role: "agent", text: turn.reply }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The agent did not answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="plan-chat gcp-agents">
      <header className="hero">
        <h1>Agents-GCP</h1>
        <p className="lede">
          Ask the operations coordinator. It sends the question to the delivery, insights, inventory, standards, or marketing agent.
        </p>
      </header>
      {error ? <p className="flash error">{error}</p> : null}
      <div className="gcp-thread">
        {lines.length === 0 ? <p className="muted">Your questions and the agent replies appear here.</p> : null}
        {lines.map((line, index) => (
          <p key={`${line.role}-${index}`} className={line.role === "user" ? "gcp-user" : "gcp-agent"}>
            {line.text}
          </p>
        ))}
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          Question
          <input
            value={draft}
            maxLength={1000}
            placeholder="How long is the drive to the nearest store?"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || draft.trim().length === 0}>
          {busy ? "Asking…" : "Send"}
        </button>
      </form>
    </section>
  );
}
