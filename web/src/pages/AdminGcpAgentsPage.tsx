import { HttpAgent, type Message } from "@ag-ui/client";
import { CopilotChat, CopilotKit } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import {
  gcpAgentSessionIdSchema,
  gcpAgentTraceEntrySchema,
  SMARTSHOP_AGUI_ACTIVITY,
  type A2uiMessage,
  type GcpAgentChatMessage,
  type GcpAgentSessionSummary,
  type GcpAgentTraceEntry,
} from "@smartshop/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { AguiActivity } from "../a2ui/AguiActivity";
import { getGcpAgentSession, listGcpAgentSessions } from "../api";
import { requireIdToken } from "../cognitoSession";
import { loadConfig } from "../config";

const activitySchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())),
});

const activityRenderers = [
  {
    activityType: SMARTSHOP_AGUI_ACTIVITY,
    content: activitySchema,
    render: AguiActivity,
  },
];

export function AdminGcpAgentsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const sessionId = validSessionId(params.sessionId);
  const [sessions, setSessions] = useState<GcpAgentSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | undefined>();
  const [configReady, setConfigReady] = useState(false);
  const [chatKey, setChatKey] = useState(() => sessionId ?? `new-${Date.now()}`);
  const createdHere = useRef<string | undefined>(undefined);
  const [listVersion, setListVersion] = useState(0);
  const [trace, setTrace] = useState<GcpAgentTraceEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then((config) => {
        if (!cancelled) {
          setStreamUrl(config.aguiStreamUrl);
          setConfigReady(true);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setConfigReady(true);
          setError(caught instanceof Error ? caught.message : "The assistant could not be loaded");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  }, [listVersion]);

  useEffect(() => {
    if (!sessionId || sessionId === createdHere.current) {
      return;
    }
    setChatKey(sessionId);
  }, [sessionId]);

  function startNew() {
    createdHere.current = undefined;
    setTrace([]);
    setChatKey(`new-${Date.now()}`);
    navigate("/admin/agents-gcp");
  }

  return (
    <section className="gcp-shell">
      <aside className="gcp-sessions">
        <button type="button" onClick={startNew}>
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
            marketing agent. A store plan, or the fastest delivery to a place, draws the map in this chat.
          </p>
        </header>
        {params.sessionId && !sessionId ? <p className="flash error">That chat link is not valid.</p> : null}
        {error ? <p className="flash error">{error}</p> : null}
        {!configReady ? <p className="muted">Loading the assistant…</p> : null}
        {configReady && streamUrl ? (
          <GcpAssistant
            key={chatKey}
            streamUrl={streamUrl}
            sessionId={chatKey.startsWith("new-") ? undefined : chatKey}
            onSession={(id) => {
              createdHere.current = id;
              if (id !== sessionId) {
                navigate(`/admin/agents-gcp/${id}`, { replace: true });
              }
            }}
            onFinished={() => setListVersion((current) => current + 1)}
            onRunError={(message) => setError(message)}
            onTraceAppend={(entry) => setTrace((current) => [...current, entry])}
            onTraceReplace={setTrace}
          />
        ) : null}
        {configReady && !streamUrl ? <p className="muted">The assistant stream is not configured yet.</p> : null}
        <AgentLog entries={trace} />
      </div>
    </section>
  );
}

function GcpAssistant({
  streamUrl,
  sessionId,
  onSession,
  onFinished,
  onRunError,
  onTraceAppend,
  onTraceReplace,
}: {
  streamUrl: string;
  sessionId: string | undefined;
  onSession: (sessionId: string) => void;
  onFinished: () => void;
  onRunError: (message: string) => void;
  onTraceAppend: (entry: GcpAgentTraceEntry) => void;
  onTraceReplace: (entries: GcpAgentTraceEntry[]) => void;
}) {
  const boundSession = useRef(sessionId);
  const agent = useMemo(
    () =>
      new HttpAgent({
        url: streamUrl,
        threadId: boundSession.current ?? "new",
        fetch: async (url, init) => {
          const headers = new Headers(init.headers);
          headers.set("Authorization", `Bearer ${await requireIdToken()}`);
          if (boundSession.current) {
            headers.set("x-smartshop-session", boundSession.current);
          }
          return fetch(url, { ...init, headers });
        },
      }),
    [streamUrl],
  );
  const onSessionRef = useRef(onSession);
  const onFinishedRef = useRef(onFinished);
  const onRunErrorRef = useRef(onRunError);
  const onTraceAppendRef = useRef(onTraceAppend);
  const onTraceReplaceRef = useRef(onTraceReplace);
  onSessionRef.current = onSession;
  onFinishedRef.current = onFinished;
  onRunErrorRef.current = onRunError;
  onTraceAppendRef.current = onTraceAppend;
  onTraceReplaceRef.current = onTraceReplace;

  useEffect(() => {
    const pending = { sessionId: undefined as string | undefined };
    const adopt = () => {
      if (!pending.sessionId) {
        return;
      }
      boundSession.current = pending.sessionId;
      agent.threadId = pending.sessionId;
      onSessionRef.current(pending.sessionId);
      pending.sessionId = undefined;
    };
    const subscription = agent.subscribe({
      onRunStartedEvent({ event }) {
        if (event.threadId && event.threadId !== "new") {
          pending.sessionId = event.threadId;
        }
      },
      onRunFinishedEvent() {
        adopt();
        onFinishedRef.current();
        const id = boundSession.current;
        if (!id) {
          return;
        }
        getGcpAgentSession(id)
          .then((detail) => {
            const next = detail.trace ?? [];
            if (next.length > 0) {
              onTraceReplaceRef.current(next);
            }
          })
          .catch(() => undefined);
      },
      onCustomEvent({ event }) {
        if (event.name !== "smartshop.trace") {
          return;
        }
        const parsed = gcpAgentTraceEntrySchema.safeParse(event.value);
        if (parsed.success) {
          onTraceAppendRef.current(parsed.data);
        }
      },
      onRunErrorEvent({ event }) {
        adopt();
        onRunErrorRef.current(event.message);
      },
    });
    return () => subscription.unsubscribe();
  }, [agent]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    let cancelled = false;
    getGcpAgentSession(sessionId)
      .then((detail) => {
        if (cancelled) {
          return;
        }
        onTraceReplaceRef.current(detail.trace ?? []);
        if (detail.messages.length > 0 && agent.messages.length === 0) {
          agent.setMessages(historyMessages(detail.messages));
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          onRunErrorRef.current(caught instanceof Error ? caught.message : "That chat could not be loaded");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agent, sessionId]);

  return (
    <div className="gcp-chat">
      <CopilotKit
        selfManagedAgents={{ default: agent }}
        renderActivityMessages={activityRenderers}
        enableInspector={false}
      >
        <CopilotChat
          labels={{ chatInputPlaceholder: "How long is the drive to the nearest store?" }}
        />
      </CopilotKit>
    </div>
  );
}

function historyMessages(messages: GcpAgentChatMessage[]): Message[] {
  const next: Message[] = [];
  messages.forEach((message, index) => {
    if (message.role === "user") {
      next.push({ id: `history-user-${index}`, role: "user", content: message.text });
      return;
    }
    next.push({ id: `history-agent-${index}`, role: "assistant", content: message.text });
    if (interactiveSurface(message.a2ui)) {
      next.push({
        id: `history-card-${index}`,
        role: "activity",
        activityType: SMARTSHOP_AGUI_ACTIVITY,
        content: { messages: message.a2ui },
      });
    }
  });
  return next;
}

function interactiveSurface(messages: A2uiMessage[]): boolean {
  return messages.some((message) => {
    const update = message.updateComponents;
    if (!update || typeof update !== "object" || !("components" in update)) {
      return false;
    }
    const components = update.components;
    if (!Array.isArray(components)) {
      return false;
    }
    return components.some((component) => {
      if (!component || typeof component !== "object" || !("component" in component)) {
        return false;
      }
      return (
        component.component === "Asset" ||
        component.component === "Button" ||
        component.component === "Card" ||
        component.component === "Plan"
      );
    });
  });
}

function AgentLog({ entries }: { entries: GcpAgentTraceEntry[] }) {
  return (
    <section className="gcp-log" aria-label="Agent log">
      <h2>Run log</h2>
      <p className="muted">
        What was sent to the coordinator, which specialist it called, and each Google API input and output.
      </p>
      {entries.length === 0 ? <p className="muted">No calls yet.</p> : null}
      <ol>
        {entries.map((entry, index) => (
          <li key={`${entry.kind}-${entry.name}-${index}`}>
            <div className="gcp-log-title">
              <span>{kindLabel(entry.kind)}</span>
              <strong>{entry.name}</strong>
              <small>{entry.actor}</small>
            </div>
            {entry.detail ? <code>{entry.detail}</code> : null}
            {entry.input !== undefined ? (
              <div>
                <span>Input</span>
                <pre>{formatValue(entry.input)}</pre>
              </div>
            ) : null}
            {entry.output !== undefined ? (
              <div>
                <span>Output</span>
                <pre>{formatValue(entry.output)}</pre>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function kindLabel(kind: GcpAgentTraceEntry["kind"]): string {
  switch (kind) {
    case "coordinator_input":
      return "Sent to coordinator";
    case "agent_call":
      return "Specialist";
    case "google_api":
      return "Google API";
    case "tool":
      return "Tool";
    case "output":
      return "Output";
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
