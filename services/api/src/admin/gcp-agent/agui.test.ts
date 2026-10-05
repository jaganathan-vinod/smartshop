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
import { isStorePlanQuestion } from "./plan-intent.js";
import { buildA2ui } from "./surface.js";

const surface = buildA2ui("Poster ready.", "main", {
  assetId: "asset_889f315b5590",
  kind: "image",
  status: "REVIEW",
});

describe("ag-ui translation", () => {
  it("treats a candidate store question as planning and leaves the agent list alone", () => {
    assert.equal(isStorePlanQuestion("Plan a store at 391 Orchard Rd, Singapore"), true);
    assert.equal(isStorePlanQuestion("competitors near 391 Orchard Rd"), true);
    assert.equal(isStorePlanQuestion("what are the agents available"), false);
    assert.equal(isStorePlanQuestion("Drive time from 750 Market St to 1 Market St"), false);
  });

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

  it("hides trace payloads and keeps the image card", () => {
    const state = createTranslateState();
    const trace = JSON.stringify({
      api: "Vertex AI Gemini generateContent",
      input: { guidance: "A stylish image showcasing socks. Not a video." },
      output: { assetId: "asset_8741a17229ba", hasImage: true },
    });
    const text = `The asset is waiting for review. ASSET asset_8741a17229ba image REVIEW TRACE ${trace}`;
    const videoCard = buildA2ui("ignored", "main", { assetId: "asset_8741a17229ba", kind: "video", status: "REVIEW" });
    const events = translateAdkEvent(
      {
        author: "marketing_agent",
        content: {
          parts: [
            { text },
            { functionResponse: { name: "present_to_operator", response: { a2ui: videoCard, summary: text } } },
          ],
        },
      },
      state,
      "run-socks",
    );
    const deltas = events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta);
    assert.deepEqual(deltas, ["The asset is waiting for review."]);
    const activity = events.find((event) => event.type === "ACTIVITY_SNAPSHOT");
    assert.match(JSON.stringify(activity), /"kind":"image"/);
    assert.equal(JSON.stringify(activity).includes("TRACE"), false);
  });

  it("ignores an asset line copied onto a drive-time answer", () => {
    const state = createTranslateState();
    translateAdkEvent(
      {
        content: {
          parts: [{ functionCall: { name: "transfer_to_agent", args: { agent_name: "delivery_agent" } } }],
        },
      },
      state,
      "run-copied",
    );
    const copied = buildA2ui("The drive is 9 minutes.", "main", {
      assetId: "asset_8741a17229ba",
      kind: "image",
      status: "REVIEW",
    });
    const events = translateAdkEvent(
      {
        author: "coordinator",
        content: {
          parts: [
            { text: "The drive is 9 minutes.\nASSET asset_8741a17229ba image REVIEW" },
            { functionResponse: { name: "present_to_operator", response: { a2ui: copied } } },
          ],
        },
      },
      state,
      "run-copied",
    );
    assert.equal(events.some((event) => event.type === "ACTIVITY_SNAPSHOT"), false);
    assert.equal(events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta).join(""), "The drive is 9 minutes.");
  });

  it("does not pin an older video on a drive-time answer", () => {
    const state = createTranslateState();
    const stale = buildA2ui("The drive time is 9 minutes.", "main", {
      assetId: "asset_8741a17229ba",
      kind: "video",
      status: "REVIEW",
    });
    const events = translateAdkEvent(
      {
        content: {
          parts: [
            { text: "The drive time from 750 Market St to 1 Market St is 9 minutes and 6 seconds (1.7 km). A nearby grocer is the Ferry Building." },
            { functionResponse: { name: "present_to_operator", response: { a2ui: stale } } },
          ],
        },
      },
      state,
      "run-drive",
    );
    assert.equal(events.some((event) => event.type === "ACTIVITY_SNAPSHOT"), false);
    assert.equal(
      events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta).join(""),
      "The drive time from 750 Market St to 1 Market St is 9 minutes and 6 seconds (1.7 km). A nearby grocer is the Ferry Building.",
    );
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
      {
        author: "marketing_agent",
        content: { parts: [{ text: "The asset is waiting for review.\nASSET asset_889f315b5590 image REVIEW" }] },
      },
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

  it("shows an image card from the tool result when the reply omits the asset line", () => {
    const state = createTranslateState();
    translateAdkEvent(
      {
        author: "marketing_agent",
        content: {
          parts: [
            {
              functionResponse: {
                name: "create_campaign_image",
                response: {
                  assetId: "asset_889f315b5590",
                  status: "REVIEW",
                  gcsUri: "gs://smartshop-marketing/campaigns/asset_889f315b5590.png",
                },
              },
            },
          ],
        },
      },
      state,
      "run-asset",
    );
    translateAdkEvent(
      { content: { parts: [{ text: "Your coffee mug campaign image is ready and waiting for review!" }] } },
      state,
      "run-asset",
    );
    const done = finishTranslation(state, "run-asset");
    const activity = done.find((event) => event.type === "ACTIVITY_SNAPSHOT");
    assert.match(JSON.stringify(activity), /asset_889f315b5590/);
    assert.match(JSON.stringify(activity), /"component":"Asset"/);
  });

  it("shows the newest stored image when the reply says it is ready", async () => {
    const chunks: string[] = [];
    await writeAguiRun({
      body: {
        threadId: "new",
        runId: "run-stored",
        messages: [{ role: "user", content: "Create a coffee mug image" }],
      },
      userId: "user-1",
      write: (chunk) => chunks.push(chunk),
      createSession: async () => "session-stored",
      loadStoredAsset: async (prefer) => {
        assert.equal(prefer, "image");
        return { assetId: "asset_889f315b5590", kind: "image", status: "REVIEW" };
      },
      streamEvents: async function* () {
        yield { content: { parts: [{ text: "Your coffee mug campaign image is ready and waiting for review!" }] } };
      },
    });
    const events = chunks.map((chunk) => JSON.parse(chunk.replace(/^data: /, "").trim()) as AguiEvent);
    const activity = events.find((event) => event.type === "ACTIVITY_SNAPSHOT");
    assert.match(JSON.stringify(activity), /asset_889f315b5590/);
    assert.match(JSON.stringify(activity), /"component":"Asset"/);
  });

  it("does not attach a stored image to a list of agents", async () => {
    const chunks: string[] = [];
    const reply = [
      "I can route your questions to these specialists:",
      "marketing_agent: Creates social-campaign stills and short videos for review.",
      "standards_agent: Answers from approved Drive files and Cloud Storage manuals, with citations.",
    ].join("\n");
    await writeAguiRun({
      body: {
        threadId: "new",
        runId: "run-roster",
        messages: [{ role: "user", content: "what are the agents available" }],
      },
      userId: "user-1",
      write: (chunk) => chunks.push(chunk),
      createSession: async () => "session-roster",
      loadStoredAsset: async () => {
        throw new Error("a roster should not load a stored file");
      },
      streamEvents: async function* () {
        yield { content: { parts: [{ text: reply }] } };
      },
    });
    const events = chunks.map((chunk) => JSON.parse(chunk.replace(/^data: /, "").trim()) as AguiEvent);
    assert.equal(events.some((event) => event.type === "ACTIVITY_SNAPSHOT"), false);
  });

  it("shows the earlier image when the operator asks where it is", async () => {
    const chunks: string[] = [];
    await writeAguiRun({
      body: {
        threadId: "session-1",
        runId: "run-see",
        messages: [{ role: "user", content: "where can I see the image?" }],
      },
      userId: "user-1",
      existingSession: "session-1",
      priorAsset: { assetId: "asset_889f315b5590", kind: "image", status: "REVIEW" },
      write: (chunk) => chunks.push(chunk),
      streamEvents: async function* () {
        yield { content: { parts: [{ text: "The image is waiting for review." }] } };
      },
    });
    const events = chunks.map((chunk) => JSON.parse(chunk.replace(/^data: /, "").trim()) as AguiEvent);
    const activity = events.find((event) => event.type === "ACTIVITY_SNAPSHOT");
    assert.match(JSON.stringify(activity), /asset_889f315b5590/);
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
    const text = "I have proposed the change of +10 units to product 'prod-ceramic-mug'. This change is awaiting approval.";
    translateAdkEvent({ content: { parts: [{ text }] } }, state, "run-3");
    const done = finishTranslation(state, "run-3");
    const activity = done.find((event) => event.type === "ACTIVITY_SNAPSHOT");
    const encoded = JSON.stringify(activity);
    assert.match(encoded, /Approve adding 10 units to prod-ceramic-mug/);
    assert.match(encoded, /Reject adding 10 units to prod-ceramic-mug/);
    assert.equal(encoded.includes(text), false);
  });

  it("does not ask for approval when inventory still needs the product", () => {
    const state = createTranslateState();
    translateAdkEvent(
      {
        content: {
          parts: [{ functionCall: { name: "transfer_to_agent", args: { agent_name: "inventory_agent" } } }],
        },
      },
      state,
      "run-ask",
    );
    translateAdkEvent(
      { content: { parts: [{ text: "I can do that. What is the product ID and by how much should the stock change?" }] } },
      state,
      "run-ask",
    );
    const done = finishTranslation(state, "run-ask");
    assert.equal(done.some((event) => event.type === "ACTIVITY_SNAPSHOT"), false);
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

  it("draws a store plan in the chat without calling the coordinator", async () => {
    const chunks: string[] = [];
    const route = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { subject_kind: "CURRENT_STORE", subject_name: "Orchard" },
          geometry: { type: "LineString", coordinates: [[103.8, 1.3], [103.9, 1.4]] },
        },
      ],
    });
    await writeAguiRun({
      body: {
        threadId: "new",
        runId: "run-plan",
        messages: [{ role: "user", content: "Plan a store at 391 Orchard Rd, Singapore" }],
      },
      userId: "user-1",
      write: (chunk) => chunks.push(chunk),
      createSession: async () => "session-plan",
      streamEvents: async function* () {
        throw new Error("planning should not call the coordinator");
      },
      planStore: async (text) => {
        assert.equal(text, "391 Orchard Rd, Singapore");
        return {
        reply: "Candidate 391 Orchard Rd, Singapore. Nearest current store: Orchard, 1.2 km, about 4 min.",
        choices: [
          {
            id: "store-0",
            subjectKind: "CURRENT_STORE",
            subjectName: "Orchard",
            distanceMeters: 1200,
            durationSeconds: 240,
            routeGeojson: route,
          },
        ],
        trace: [
          {
            label: "Geocode candidate",
            api: "GEOCODE",
            method: "GET",
            url: "https://maps.googleapis.com/maps/api/geocode/json",
            status: 200,
            request: "{}",
            response: "{}",
          },
        ],
        };
      },
    });
    const events = chunks.map((chunk) => JSON.parse(chunk.replace(/^data: /, "").trim()) as AguiEvent);
    const text = events.find((event) => event.type === "TEXT_MESSAGE_CONTENT");
    const activity = events.find((event) => event.type === "ACTIVITY_SNAPSHOT");
    const trace = events.find((event) => event.type === "CUSTOM" && JSON.stringify(event.value).includes("Maps Geocoding"));
    assert.match(String(text?.delta), /Nearest current store: Orchard/);
    assert.match(JSON.stringify(activity), /"component":"Plan"/);
    assert.match(JSON.stringify(activity), /Orchard/);
    assert.ok(trace);
    assert.equal(events.some((event) => event.type === "RUN_FINISHED"), true);
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
