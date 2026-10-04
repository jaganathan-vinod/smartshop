import { A2uiSurface, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { A2uiMessage } from "@smartshop/shared";
import { MessageProcessor, type ActionPayload, type SurfaceModel } from "@a2ui/web_core/v0_9";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const processor = useMemo(
    () =>
      new MessageProcessor([smartshopCatalog], (action: ActionPayload) => {
        const context = Object.keys(action.context).length > 0 ? ` ${JSON.stringify(action.context)}` : "";
        const text = action.userMessage?.trim() || `${action.name}${context}`;
        onActionRef.current(text.slice(0, 1000));
      }),
    [],
  );

  useEffect(() => {
    const created = processor.onSurfaceCreated((surface) => setSurfaceId(surface.id));
    try {
      processor.processMessages(messages as unknown as Parameters<MessageProcessor["processMessages"]>[0]);
      setFailed(processor.getSurfaces().size === 0);
    } catch {
      setFailed(true);
    }
    return () => created.unsubscribe();
  }, [messages, processor]);

  const surface = surfaceId ? processor.getSurface(surfaceId) : undefined;
  if (failed || !surface) {
    return failed ? <p>{fallback}</p> : null;
  }
  return (
    <div className="gcp-surface">
      <A2uiSurface surface={surface as SurfaceModel<ReactComponentImplementation>} />
    </div>
  );
}
