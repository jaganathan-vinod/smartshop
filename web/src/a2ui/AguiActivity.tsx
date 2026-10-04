import type { AbstractAgent, Message } from "@ag-ui/client";
import type { A2uiMessage } from "@smartshop/shared";
import { AgentSurface } from "./AgentSurface";

export function AguiActivity({
  content,
  agent,
}: {
  activityType: string;
  content: { messages: Record<string, unknown>[] };
  message: Message;
  agent: AbstractAgent | undefined;
}) {
  return (
    <AgentSurface
      messages={content.messages as A2uiMessage[]}
      fallback=""
      onAction={(text) => {
        if (!agent) {
          return;
        }
        agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
        void agent.runAgent();
      }}
    />
  );
}
