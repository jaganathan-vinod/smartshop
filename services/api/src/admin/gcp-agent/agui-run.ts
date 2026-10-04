import { createCoordinatorSession, GcpAgentError, openCoordinatorStream } from "./query.js";
import {
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
    const state = createTranslateState();
    const stream = options.streamEvents ?? coordinatorEvents;
    for await (const chunk of stream(options.userId, sessionId, input.text)) {
      for (const event of translateAdkEvent(chunk, state, runId)) {
        writeEvent(event);
      }
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
