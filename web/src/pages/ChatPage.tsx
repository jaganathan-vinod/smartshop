import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  assistantAsksToAddToCart,
  assistantAsksToConfirm,
  assistantContentBlocks,
  assistantInlineParts,
  visibleAssistantText,
  type AssistantToolName,
} from "@smartshop/shared";
import { ApiRequestError } from "../api";
import {
  invokeAssistant,
  newConversationId,
  newRuntimeSessionId,
  requestAssistantUpload,
} from "../assistant";
import { useAuth } from "../auth";
import { assistantInvokeUrl, loadConfig } from "../config";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  orderNumber?: string;
  toolsUsed?: string[];
};

const CART_TOOLS = new Set<AssistantToolName>(["upsert_cart_item", "remove_cart_item"]);
const STARTERS = ["Find a keyboard", "What's in my cart?", "Quote delivery"];

function userInitial(name: string | undefined): string {
  const match = name?.trim().match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "Y";
}

function InlineCopy({ text }: { text: string }) {
  return (
    <>
      {assistantInlineParts(text).map((part, index) =>
        part.bold ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>,
      )}
    </>
  );
}

function AssistantCopy({ text }: { text: string }) {
  return (
    <>
      {assistantContentBlocks(text).map((block, index) =>
        block.type === "ul" ? (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <InlineCopy text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <InlineCopy text={block.text} />
          </p>
        ),
      )}
    </>
  );
}

export function ChatPage() {
  const { user } = useAuth();
  const conversationId = useMemo(() => newConversationId(), []);
  const sessionId = useMemo(() => newRuntimeSessionId(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "I can find products, add them to your cart, quote delivery, and place the order — same cart and prices as checkout.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeReady, setRuntimeReady] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const showConfirm =
    Boolean(lastAssistant && assistantAsksToConfirm(lastAssistant.text) && !lastAssistant.orderNumber);
  const showAddToCart = Boolean(
    lastAssistant && assistantAsksToAddToCart(lastAssistant.text) && !showConfirm,
  );
  const showStarters = messages.length === 1 && !busy;

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then((config) => {
        if (!cancelled) {
          setRuntimeReady(Boolean(assistantInvokeUrl(config)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const log = logRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages, busy]);

  function resizeComposer() {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  function historyForModel() {
    return messages
      .map((message) => ({
        role: message.role,
        text: visibleAssistantText(message.text).slice(0, 1500),
      }))
      .filter((turn) => turn.text.length > 0)
      .slice(-12);
  }

  async function send(message: string, imageObjectKey?: string) {
    const trimmed = message.trim();
    if ((!trimmed && !imageObjectKey) || busy) {
      return;
    }
    const history = historyForModel();
    setBusy(true);
    setError(null);
    setDraft("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed || "Photo attached" },
    ]);
    try {
      const reply = await invokeAssistant({
        conversationId,
        sessionId,
        message: trimmed || undefined,
        imageObjectKey,
        history,
      });
      if (reply.toolsUsed?.some((tool) => CART_TOOLS.has(tool as AssistantToolName))) {
        window.dispatchEvent(new Event("smartshop:cart-changed"));
      }
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: reply.reply,
          orderNumber: reply.orderNumber,
          toolsUsed: reply.toolsUsed,
        },
      ]);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Could not reach the assistant");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function onImage(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { uploadUrl, objectKey } = await requestAssistantUpload();
      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      await send(draft || "What product is in this photo?", objectKey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload image");
      setBusy(false);
    }
  }

  return (
    <section className="chat-app">
      <header className="chat-head">
        <span className="chat-face chat-face-assistant" aria-hidden="true">
          SS
        </span>
        <div>
          <h1>Shop assistant</h1>
          <p>Same cart and prices as checkout</p>
        </div>
        <Link className="chat-head-link" to="/cart">
          Cart
        </Link>
      </header>
      {runtimeReady === false ? (
        <p className="chat-banner muted">
          Assistant runtime URL is not in config yet. Deploy Phase 5 CDK, or set
          VITE_ASSISTANT_RUNTIME_URL for a local agent on port 8080.
        </p>
      ) : null}
      <ol className="chat-log" ref={logRef} aria-live="polite">
        {messages.map((message, index) => (
          <li key={`${message.role}-${index}`} className={`chat-row chat-row-${message.role}`}>
            <span className={`chat-face chat-face-${message.role}`} aria-hidden="true">
              {message.role === "assistant" ? "SS" : userInitial(user?.displayName)}
            </span>
            <div className={`chat-bubble chat-bubble-${message.role}`}>
              {message.role === "assistant" ? (
                <AssistantCopy text={message.text} />
              ) : (
                <p>{message.text}</p>
              )}
              {message.orderNumber ? (
                <p className="chat-order">
                  Order <strong>{message.orderNumber}</strong>
                  {" · "}
                  <Link to="/orders">View orders</Link>
                </p>
              ) : null}
            </div>
          </li>
        ))}
        {busy ? (
          <li className="chat-row chat-row-assistant">
            <span className="chat-face chat-face-assistant" aria-hidden="true">
              SS
            </span>
            <div className="chat-bubble chat-bubble-assistant chat-typing" aria-label="Assistant is typing">
              <span />
              <span />
              <span />
            </div>
          </li>
        ) : null}
      </ol>
      {error ? <p className="chat-banner flash error">{error}</p> : null}
      <div className="chat-dock">
        {showStarters ? (
          <div className="chat-chips" aria-label="Suggested prompts">
            {STARTERS.map((prompt) => (
              <button key={prompt} type="button" className="chat-chip" onClick={() => void send(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        {showAddToCart ? (
          <div className="chat-chips">
            <button
              type="button"
              className="chat-chip chat-chip-confirm"
              disabled={busy}
              onClick={() => void send("yes, add it to my cart")}
            >
              Add to cart
            </button>
          </div>
        ) : null}
        {showConfirm ? (
          <div className="chat-chips">
            <button
              type="button"
              className="chat-chip chat-chip-confirm"
              disabled={busy}
              onClick={() => void send("yes, place it")}
            >
              Confirm order
            </button>
          </div>
        ) : null}
        <form
          className="chat-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <button
            type="button"
            className="chat-icon"
            disabled={busy}
            aria-label="Attach a photo"
            onClick={() => fileRef.current?.click()}
          >
            Photo
          </button>
          <label className="chat-field">
            <span className="sr-only">Message</span>
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              placeholder="Ask to find, add, quote, or order"
              disabled={busy}
              onChange={(event) => {
                setDraft(event.target.value);
                resizeComposer();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
            />
          </label>
          <button className="chat-send" type="submit" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
        <p className="chat-hint">Same cart as checkout. Place order still needs an explicit yes after a quote.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              void onImage(file);
            }
          }}
        />
      </div>
    </section>
  );
}
