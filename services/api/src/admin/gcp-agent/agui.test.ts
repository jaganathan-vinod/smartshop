import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { A2uiMessage } from "@smartshop/shared";
import { setAguiTokenVerifierForTests, verifyAdminBearer, AguiAuthError } from "./agui-auth.js";
import { writeAguiRun } from "./agui-run.js";
import {
  createNdjsonReader,
  createTranslateState,
  finishTranslation,
  translateAdkEvent,
  type AguiEvent,
} from "./agui.js";
import { buildA2ui } from "./surface.js";

const surface = buildA2ui("Poster ready.", "main", {
  assetId: "asset_889f315b5590",
  kind: "image",
  status: "REVIEW",
});

describe("ag-ui translation", () => {
  it("streams a growing answer as one message", () => {
    const state = createTranslateState();
    const first = translateAdkEvent({ content: { parts: [{ text: "The drive" }], role: "model" } }, state, "run-1");
    const second = translateAdkEvent(
      { content: { parts: [{ text: "The drive is 12 minutes." }], role: "model" } },
      state,
      "run-1",
    );
    const duplicate = translateAdkEvent(
      { content: { parts: [{ text: "The drive is 12 minutes." }], role: "model" } },
      state,
      "run-1",
    );
    assert.equal(first[0]?.type, "TEXT_MESSAGE_START");
    assert.equal(first[1]?.delta, "The drive");
    assert.equal(second[0]?.delta, " is 12 minutes.");
    assert.equal(duplicate.length, 0);
    const done = finishTranslation(state, "run-1");
    assert.equal(done.at(-1)?.type, "TEXT_MESSAGE_END");
  });

  it("shows a specialist step and an asset card", () => {
    const state = createTranslateState();
    const step = translateAdkEvent(
      {
        content: {
          parts: [{ functionCall: { name: "transfer_to_agent", args: { agent_name: "delivery_agent" } } }],
        },
      },
      state,
      "run-2",
    );
    assert.equal(step[0]?.stepName, "Asking the delivery agent");
    const answer = translateAdkEvent(
      { author: "delivery_agent", content: { parts: [{ text: "The drive is 12 minutes." }] } },
      state,
      "run-2",
    );
    assert.equal(answer[0]?.type, "STEP_FINISHED");
    const card = translateAdkEvent(
      {
        content: {
          parts: [{ functionResponse: { name: "present_to_operator", response: { a2ui: surface } } }],
        },
      },
      state,
      "run-2",
    );
    assert.equal(card[0]?.type, "ACTIVITY_SNAPSHOT");
    assert.equal(card[0]?.activityType, "a2ui");
    const messages = activityMessages(card[0]);
    assert.equal(messages.some((item) => JSON.stringify(item).includes("Asset")), true);
  });

  it("adds approve and reject actions after the inventory agent", () => {
    const state = createTranslateState();
    translateAdkEvent(
      {
        content: {
          parts: [{ function_call: { name: "transfer_to_agent", args: { agent_name: "inventory_agent" } } }],
        },
      },
      state,
      "run-3",
    );
    const text = "The store should reorder rice.";
    translateAdkEvent({ content: { parts: [{ text }] } }, state, "run-3");
    const done = finishTranslation(state, "run-3");
    const activity = done.find((event) => event.type === "ACTIVITY_SNAPSHOT");
    const encoded = JSON.stringify(activity);
    assert.match(encoded, /Approve the stock proposal/);
    assert.match(encoded, /Reject the stock proposal/);
  });

  it("reads a stream that arrives in pieces", () => {
    const reader = createNdjsonReader();
    assert.deepEqual(reader.push('{"text":"Hel'), []);
    assert.deepEqual(reader.push('lo"}\n{"text":"next"}'), [{ text: "Hello" }]);
    assert.deepEqual(reader.flush(), [{ text: "next" }]);
  });

  it("writes a run and keeps an existing session", async () => {
    const chunks: string[] = [];
    let created = false;
    await writeAguiRun({
      body: {
        threadId: "client-thread",
        runId: "run-4",
        messages: [{ role: "user", content: "How long is the drive?" }],
      },
      userId: "user-1",
      existingSession: "session-1",
      write: (chunk) => chunks.push(chunk),
      createSession: async () => {
        created = true;
        return "created";
      },
      streamEvents: async function* () {
        yield { content: { parts: [{ text: "The drive is 12 minutes." }] } };
      },
    });
    const events = chunks.map((chunk) => JSON.parse(chunk.replace(/^data: /, "").trim()) as { type: string; threadId?: string });
    assert.equal(created, false);
    assert.equal(events[0]?.type, "RUN_STARTED");
    assert.equal(events[0]?.threadId, "session-1");
    assert.equal(events.at(-1)?.type, "RUN_FINISHED");
  });

  it("opens a session when the chat is new", async () => {
    const chunks: string[] = [];
    await writeAguiRun({
      body: { threadId: "new", runId: "run-5", messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] },
      userId: "user-1",
      write: (chunk) => chunks.push(chunk),
      createSession: async () => "session-9",
      streamEvents: async function* () {
        yield { content: { parts: [{ text: "Hello from the coordinator." }] } };
      },
    });
    const first = JSON.parse(chunks[0]?.replace(/^data: /, "").trim() ?? "{}") as { threadId?: string };
    assert.equal(first.threadId, "session-9");
  });

  it("rejects a question with no text", async () => {
    const chunks: string[] = [];
    await writeAguiRun({
      body: { threadId: "new", messages: [] },
      userId: "user-1",
      write: (chunk) => chunks.push(chunk),
    });
    assert.match(chunks[0] ?? "", /Enter a question/);
  });
});

describe("ag-ui auth", () => {
  it("requires an admin token", async () => {
    setAguiTokenVerifierForTests(null);
    await assert.rejects(() => verifyAdminBearer(undefined), (error: unknown) => {
      assert.ok(error instanceof AguiAuthError);
      assert.equal(error.status, 401);
      return true;
    });
    setAguiTokenVerifierForTests(async () => ({ sub: "user-1", groups: ["shopper"] }));
    await assert.rejects(() => verifyAdminBearer("Bearer token"), (error: unknown) => {
      assert.ok(error instanceof AguiAuthError);
      assert.equal(error.status, 403);
      return true;
    });
    setAguiTokenVerifierForTests(async () => ({ sub: "user-1", groups: ["admin"] }));
    const claims = await verifyAdminBearer("Bearer token");
    assert.equal(claims.sub, "user-1");
    setAguiTokenVerifierForTests(null);
  });
});

function activityMessages(event: AguiEvent | undefined): A2uiMessage[] {
  const content = event?.content;
  if (!content || typeof content !== "object" || !("messages" in content)) {
    return [];
  }
  const messages = content.messages;
  return Array.isArray(messages) ? (messages as A2uiMessage[]) : [];
}
