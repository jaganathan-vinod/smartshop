import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeAguiRun } from "./agui-run.js";
import { appendStoredCalls, needsMarketingDetail, storedCallMatches, traceFromEvents } from "./trace.js";

describe("agent run log", () => {
  it("records the coordinator request, the specialist call, and the Google API", () => {
    const entries = traceFromEvents(
      [
        { author: "user", content: { role: "user", parts: [{ text: "How long is the drive?" }] } },
        {
          author: "coordinator",
          content: {
            parts: [{ functionCall: { name: "transfer_to_agent", args: { agent_name: "delivery_agent" } } }],
          },
        },
        {
          author: "delivery_agent",
          content: {
            parts: [
              { functionCall: { id: "g1", name: "geocode_address", args: { address: "Orchard", key: "secret" } } },
              { functionResponse: { id: "g1", name: "geocode_address", response: { lat: 1.3, lng: 103.8 } } },
              { text: "The drive is 12 minutes." },
            ],
          },
        },
      ],
      "session-1",
    );
    assert.equal(entries[0]?.name, "Vertex AI Agent Engine streamQuery");
    assert.deepEqual(entries[0]?.input, { sessionId: "session-1", message: "How long is the drive?" });
    assert.equal(entries[1]?.kind, "coordinator_input");
    assert.equal(entries[2]?.kind, "agent_call");
    assert.equal(entries[2]?.name, "delivery_agent");
    const geocode = entries.find((entry) => entry.name === "Google Maps Geocoding");
    assert.equal(geocode?.kind, "google_api");
    assert.deepEqual(geocode?.input, { address: "Orchard", key: "••••" });
    assert.deepEqual(geocode?.output, { lat: 1.3, lng: 103.8 });
    assert.equal(entries.at(-1)?.output, "The drive is 12 minutes.");
  });

  it("shows the Gemini request when the marketing handoff itself is empty", () => {
    const prompt = "A striking technical advertisement poster featuring a mechanical keyboard";
    const entries = traceFromEvents([
      { author: "user", content: { role: "user", parts: [{ text: prompt }] } },
      {
        author: "coordinator",
        content: {
          parts: [
            { functionCall: { name: "transfer_to_agent", args: { agent_name: "marketing_agent" } } },
            { functionResponse: { name: "transfer_to_agent", response: { result: null } } },
          ],
        },
      },
      {
        author: "marketing_agent",
        content: {
          parts: [
            {
              text: `The image is ready.\nTRACE ${JSON.stringify({
                actor: "marketing_agent",
                api: "Vertex AI Gemini generateContent",
                service: "https://aiplatform.googleapis.com/generateContent",
                input: { guidance: prompt },
                output: { httpStatus: 200, assetId: "asset_889f315b5590" },
              })}`,
            },
          ],
        },
      },
    ]);
    const gemini = entries.find((entry) => entry.name === "Vertex AI Gemini generateContent");
    assert.equal(gemini?.kind, "google_api");
    assert.equal(gemini?.actor, "marketing_agent");
    assert.deepEqual(gemini?.output, { httpStatus: 200, assetId: "asset_889f315b5590" });
    assert.equal(entries.some((entry) => entry.kind === "output" && entry.output === "The image is ready."), true);
  });

  it("streams the same rows into the chat log", async () => {
    const chunks: string[] = [];
    await writeAguiRun({
      body: { threadId: "session-1", runId: "run-log", messages: [{ role: "user", content: "How long is the drive?" }] },
      userId: "user-1",
      existingSession: "session-1",
      write: (chunk) => chunks.push(chunk),
      streamEvents: async function* () {
        yield {
          author: "coordinator",
          content: {
            parts: [{ functionCall: { name: "transfer_to_agent", args: { agent_name: "delivery_agent" } } }],
          },
        };
        yield { author: "delivery_agent", content: { parts: [{ text: "The drive is 12 minutes." }] } };
      },
    });
    const events = chunks.map((chunk) => JSON.parse(chunk.replace(/^data: /, "").trim()) as { type: string; name?: string; value?: { name?: string } });
    const trace = events.filter((event) => event.type === "CUSTOM" && event.name === "smartshop.trace");
    assert.equal(trace[0]?.value?.name, "Vertex AI Agent Engine streamQuery");
    assert.equal(trace.some((event) => event.value?.name === "delivery_agent"), true);
    assert.equal(events.at(-1)?.type, "RUN_FINISHED");
  });

  it("attaches a stored Gemini call when the handoff output is empty", async () => {
    const prompt = "A striking technical advertisement poster featuring a mechanical keyboard";
    const chunks: string[] = [];
    await writeAguiRun({
      body: { threadId: "session-1", runId: "run-image", messages: [{ role: "user", content: prompt }] },
      userId: "user-1",
      existingSession: "session-1",
      write: (chunk) => chunks.push(chunk),
      loadMarketingTraces: async () => [
        {
          actor: "marketing_agent",
          api: "Vertex AI Gemini generateContent",
          service: "https://aiplatform.googleapis.com/generateContent",
          input: { guidance: prompt, body: { contents: [{ parts: [{ text: prompt }] }] } },
          output: { httpStatus: 200, hasImage: true, assetId: "asset_889f315b5590" },
        },
        {
          actor: "marketing_agent",
          api: "Cloud Storage objects.insert",
          service: "https://storage.googleapis.com/upload/storage/v1/b/smartshop-marketing/o",
          input: { name: "campaigns/asset_889f315b5590.png", contentType: "image/png" },
          output: { gcsUri: "gs://smartshop-marketing/campaigns/asset_889f315b5590.png", bytes: 1200 },
        },
      ],
      streamEvents: async function* () {
        yield {
          author: "coordinator",
          content: {
            parts: [
              { functionCall: { name: "transfer_to_agent", args: { agent_name: "marketing_agent" } } },
              { functionResponse: { name: "transfer_to_agent", response: { result: null } } },
            ],
          },
        };
      },
    });
    const names = chunks
      .map((chunk) => JSON.parse(chunk.replace(/^data: /, "").trim()) as { type?: string; name?: string; value?: { name?: string } })
      .filter((event) => event.type === "CUSTOM" && event.name === "smartshop.trace")
      .map((event) => event.value?.name);
    assert.equal(names.includes("Vertex AI Gemini generateContent"), true);
    assert.equal(names.includes("Cloud Storage objects.insert"), true);
    const base = traceFromEvents([
      { author: "user", content: { role: "user", parts: [{ text: prompt }] } },
      {
        content: {
          parts: [
            { functionCall: { name: "transfer_to_agent", args: { agent_name: "marketing_agent" } } },
            { functionResponse: { name: "transfer_to_agent", response: { result: null } } },
          ],
        },
      },
    ]);
    assert.equal(needsMarketingDetail(base), true);
    assert.equal(
      storedCallMatches({ input: { guidance: prompt } }, [prompt]),
      true,
    );
    assert.equal(appendStoredCalls(base, [{ api: "Vertex AI Gemini generateContent", input: { guidance: prompt } }]).some((entry) => entry.name === "Vertex AI Gemini generateContent"), true);
  });
});
