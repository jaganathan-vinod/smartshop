import { latestStoredAsset, loadStoredMarketingTraces, type StoredAssetKind } from "./assets.js";
import { visibleReply, type CampaignAsset } from "./surface.js";
import { latestSessionAsset } from "./sessions.js";
import { createCoordinatorSession, GcpAgentError, openCoordinatorStream } from "./query.js";
import {
  appendStoredCalls,
  coordinatorPrompts,
  liveTraceFromEvent,
  needsMarketingDetail,
  openingTrace,
  traceEventName,
} from "./trace.js";
import {
  asksToSeeAsset,
  createNdjsonReader,
  createTranslateState,
  encodeSse,
  finishTranslation,
  runInput,
  translateAdkEvent,
  type AguiEvent,
} from "./agui.js";

export async function writeAguiRun(options: {
  body: unknown;
  userId: string;
  write: (chunk: string) => void;
  existingSession?: string;
  createSession?: (userId: string) => Promise<string>;
  streamEvents?: (userId: string, sessionId: string, text: string) => AsyncIterable<unknown>;
  priorAsset?: CampaignAsset;
  loadPriorAsset?: (userId: string, sessionId: string) => Promise<CampaignAsset | undefined>;
  loadStoredAsset?: (prefer: StoredAssetKind) => Promise<CampaignAsset | undefined>;
  loadMarketingTraces?: (prompts: string[], assetIds: string[]) => Promise<unknown[]>;
}): Promise<void> {
  const input = runInput(options.body);
  const runId = input?.runId ?? crypto.randomUUID();
  const writeEvent = (event: AguiEvent) => options.write(encodeSse(event));
  if (!input?.text) {
    writeEvent({ type: "RUN_ERROR", message: "Enter a question." });
    return;
  }
  try {
    const sessionId =
      options.existingSession ?? (await (options.createSession ?? createCoordinatorSession)(options.userId));
    writeEvent({ type: "RUN_STARTED", threadId: sessionId, runId });
    for (const entry of openingTrace(sessionId, input.text)) {
      writeEvent({ type: "CUSTOM", name: traceEventName(), value: entry });
    }
    const state = createTranslateState();
    if (asksToSeeAsset(input.text)) {
      state.fallbackAsset = await rememberedAsset(options, sessionId);
    }
    const stream = options.streamEvents ?? coordinatorEvents;
    const liveEntries = [...openingTrace(sessionId, input.text)];
    for await (const chunk of stream(options.userId, sessionId, input.text)) {
      for (const entry of liveTraceFromEvent(chunk)) {
        liveEntries.push(entry);
        writeEvent({ type: "CUSTOM", name: traceEventName(), value: entry });
      }
      for (const event of translateAdkEvent(chunk, state, runId)) {
        writeEvent(event);
      }
    }
    if (needsMarketingDetail(liveEntries)) {
      try {
        const calls = await (options.loadMarketingTraces ?? loadStoredMarketingTraces)(coordinatorPrompts(liveEntries), []);
        for (const entry of appendStoredCalls([], calls)) {
          writeEvent({ type: "CUSTOM", name: traceEventName(), value: entry });
        }
      } catch {
        // The specialist handoff is still shown when the stored call log cannot be read.
      }
    }
    if (!state.asset && !state.fallbackAsset && wantsStoredFile(input.text, state.lastText)) {
      state.fallbackAsset = await storedAsset(options, `${input.text}\n${state.lastText}`);
    }
    for (const event of finishTranslation(state, runId)) {
      writeEvent(event);
    }
    if (!state.lastText && !state.activitySent) {
      writeEvent({ type: "RUN_ERROR", message: "The agent returned no answer" });
      return;
    }
    writeEvent({ type: "RUN_FINISHED", threadId: sessionId, runId });
  } catch (error) {
    const message = error instanceof GcpAgentError ? error.message : "The agent did not answer";
    writeEvent({ type: "RUN_ERROR", message });
  }
}

function wantsStoredFile(question: string, reply: string): boolean {
  if (asksToSeeAsset(question)) {
    return true;
  }
  const visible = visibleReply(reply);
  const mentionsFile = /\b(image|images|video|videos|poster|picture|photo|clip|still|stills)\b/i.test(visible);
  const fileIsReady = /\b(ready|generating|created|waiting)\b/i.test(visible);
  return mentionsFile && fileIsReady;
}

function preferredKind(text: string): StoredAssetKind {
  const cleaned = text.replace(/\b(?:not|no)\s+(?:a\s+)?videos?\b/gi, " ");
  const image = /\b(image|images|poster|picture|photo|still|stills)\b/i.test(cleaned);
  const video = /\b(video|videos|clip|clips)\b/i.test(cleaned);
  if (image && !video) {
    return "image";
  }
  if (video && !image) {
    return "video";
  }
  return "either";
}

async function storedAsset(
  options: { loadStoredAsset?: (prefer: StoredAssetKind) => Promise<CampaignAsset | undefined> },
  text: string,
): Promise<CampaignAsset | undefined> {
  try {
    return await (options.loadStoredAsset ?? latestStoredAsset)(preferredKind(text));
  } catch {
    return undefined;
  }
}

async function rememberedAsset(
  options: {
    userId: string;
    existingSession?: string;
    priorAsset?: CampaignAsset;
    loadPriorAsset?: (userId: string, sessionId: string) => Promise<CampaignAsset | undefined>;
  },
  sessionId: string,
): Promise<CampaignAsset | undefined> {
  if (options.priorAsset) {
    return options.priorAsset;
  }
  if (!options.existingSession) {
    return undefined;
  }
  try {
    return await (options.loadPriorAsset ?? latestSessionAsset)(options.userId, sessionId);
  } catch {
    return undefined;
  }
}

async function* coordinatorEvents(userId: string, sessionId: string, text: string): AsyncIterable<unknown> {
  const response = await openCoordinatorStream(userId, sessionId, text);
  if (!response.body) {
    throw new GcpAgentError("The agent returned no answer");
  }
  yield* readJsonEvents(response.body);
}

export async function* readJsonEvents(body: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createNdjsonReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        yield event;
      }
    }
    for (const event of parser.flush()) {
      yield event;
    }
  } finally {
    reader.releaseLock();
  }
}
