import type { GcpAgentChatMessage, GcpAgentSessionSummary } from "@smartshop/shared";
import { gcpAgentSessionIdSchema } from "@smartshop/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { AgentSurface } from "../a2ui/AgentSurface";
import { askGcpAgent, listGcpAgentSessions, getGcpAgentSession } from "../api";

export function AdminGcpAgentsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const sessionId = validSessionId(params.sessionId);
  const [sessions, setSessions] = useState<GcpAgentSessionSummary[]>([]);
  const [messages, setMessages] = useState<GcpAgentChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const skipLoad = useRef("");

  useEffect(() => {
    let cancelled = false;
    listGcpAgentSessions()
      .then((body) => {
        if (!cancelled) {
          setSessions(body.sessions);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Chats could not be loaded");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!params.sessionId) {
      setMessages([]);
      return;
    }
    if (!sessionId) {
      setError("That chat link is not valid.");
      setMessages([]);
      return;
    }
    if (skipLoad.current === sessionId) {
      skipLoad.current = "";
      return;
    }
    let cancelled = false;
    setLoading(true);
    getGcpAgentSession(sessionId)
      .then((detail) => {
        if (!cancelled && detail.messages.length > 0) {
          setMessages(detail.messages);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "That chat could not be loaded");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.sessionId, sessionId]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) {
        return;
      }
      setBusy(true);
      setError(null);
      setDraft("");
      setMessages((current) => [...current, { role: "user", text: trimmed, a2ui: [] }]);
      try {
        const turn = await askGcpAgent(trimmed, sessionId);
        setMessages((current) => [
          ...current,
          { role: "agent", text: turn.reply, a2ui: turn.a2ui ?? [] },
        ]);
        if (turn.sessionId !== sessionId) {
          skipLoad.current = turn.sessionId;
          navigate(`/admin/agents-gcp/${turn.sessionId}`, { replace: true });
        }
        const listed = await listGcpAgentSessions();
        setSessions(listed.sessions);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The agent did not answer");
      } finally {
        setBusy(false);
      }
    },
    [busy, navigate, sessionId],
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <section className="gcp-shell">
      <aside className="gcp-sessions">
        <button type="button" onClick={() => navigate("/admin/agents-gcp")}>
          New chat
        </button>
        {sessions.length === 0 ? <p className="muted">No chats yet.</p> : null}
        <nav>
          {sessions.map((session) => (
            <NavLink
              key={session.sessionId}
              to={`/admin/agents-gcp/${session.sessionId}`}
              className={({ isActive }) => (isActive ? "gcp-session is-active" : "gcp-session")}
            >
              <span>{session.title}</span>
              {session.updatedAt ? <small>{formatWhen(session.updatedAt)}</small> : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="gcp-main">
        <header className="hero">
          <h1>Agents-GCP</h1>
          <p className="lede">
            Ask the operations coordinator. It sends the question to the delivery, insights, inventory, standards, or
            marketing agent.
          </p>
        </header>
        {error ? <p className="flash error">{error}</p> : null}
        <div className="gcp-thread">
          {loading ? <p className="muted">Loading this chat…</p> : null}
          {!loading && messages.length === 0 ? <p className="muted">Your questions and the agent replies appear here.</p> : null}
          {messages.map((message, index) => {
            const a2ui = message.a2ui ?? [];
            return (
              <article key={`${message.role}-${index}`} className={message.role === "user" ? "gcp-user" : "gcp-agent"}>
                {message.role === "user" || a2ui.length === 0 ? <p>{message.text}</p> : null}
                {message.role === "agent" && a2ui.length > 0 ? (
                  <AgentSurface messages={a2ui} fallback={message.text} onAction={(text) => void send(text)} />
                ) : null}
              </article>
            );
          })}
        </div>
        <form onSubmit={onSubmit}>
          <label>
            Question
            <textarea
              value={draft}
              maxLength={1000}
              rows={3}
              placeholder="How long is the drive to the nearest store?"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || draft.trim().length === 0}>
            {busy ? "Asking…" : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}

function validSessionId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = gcpAgentSessionIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function formatWhen(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "";
  }
  return new Date(parsed).toLocaleString();
}
