import { A2uiSurface, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { A2uiMessage } from "@smartshop/shared";
import { MessageProcessor, type ActionPayload, type SurfaceModel } from "@a2ui/web_core/v0_9";
import { useEffect, useRef, useState } from "react";
import { smartshopCatalog } from "./smartshopCatalog";

export function AgentSurface({
  messages,
  fallback,
  onAction,
}: {
  messages: A2uiMessage[];
  fallback: string;
  onAction: (text: string) => void;
}) {
  const [surfaceId, setSurfaceId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [processor, setProcessor] = useState<MessageProcessor | null>(null);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    const next = new MessageProcessor([smartshopCatalog], (action: ActionPayload) => {
      const context = Object.keys(action.context).length > 0 ? ` ${JSON.stringify(action.context)}` : "";
      const text = action.userMessage?.trim() || `${action.name}${context}`;
      onActionRef.current(text.slice(0, 1000));
    });
    const created = next.onSurfaceCreated((surface) => setSurfaceId(surface.id));
    try {
      next.processMessages(messages as unknown as Parameters<MessageProcessor["processMessages"]>[0]);
      setFailed(next.getSurfaces().size === 0);
      setProcessor(next);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      setFailed(true);
      setProcessor(null);
    }
    return () => created.unsubscribe();
  }, [messages]);

  const surface = surfaceId && processor ? processor.getSurface(surfaceId) : undefined;
  if (failed || !surface) {
    if (!failed) {
      return null;
    }
    return <p>{fallback || "The card could not be shown."}</p>;
  }
  return (
    <div className="gcp-surface">
      <A2uiSurface surface={surface as SurfaceModel<ReactComponentImplementation>} />
    </div>
  );
}
