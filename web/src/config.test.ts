import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assistantInvokeUrl, type AppConfig } from "./config";

describe("assistantInvokeUrl", () => {
  const base: AppConfig = {
    apiUrl: "https://api.example",
    userPoolId: "pool",
    userPoolClientId: "client",
    region: "ap-southeast-1",
  };

  it("keeps required config keys working without a runtime arn", () => {
    assert.equal(assistantInvokeUrl(base), undefined);
  });

  it("prefers an explicit runtime URL", () => {
    assert.equal(
      assistantInvokeUrl({ ...base, assistantRuntimeUrl: "http://localhost:8080/invocations/" }),
      "http://localhost:8080/invocations",
    );
  });
});
