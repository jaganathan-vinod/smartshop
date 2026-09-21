import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DASHBOARD_SPEC,
  dashboardSpecSchema,
  parseDashboardSpecFromText,
} from "./reports.js";

describe("dashboard spec", () => {
  it("accepts the default executive layout", () => {
    assert.equal(dashboardSpecSchema.parse(DEFAULT_DASHBOARD_SPEC).title, "Weekly executive");
    assert.ok(DEFAULT_DASHBOARD_SPEC.unavailable.includes("viewToOrder"));
  });

  it("parses a spec from agent markdown", () => {
    const spec = parseDashboardSpecFromText(`
Here is the layout.

\`\`\`json
{"title":"Board view","kpis":["gmv","stockouts"],"charts":["topProducts"],"unavailable":["viewToOrder"]}
\`\`\`
`);
    assert.equal(spec?.title, "Board view");
    assert.deepEqual(spec?.kpis, ["gmv", "stockouts"]);
  });

  it("returns null when the model invents unknown widgets", () => {
    assert.equal(
      parseDashboardSpecFromText('{"title":"x","kpis":["sessionConversion"],"charts":[]}'),
      null,
    );
  });
});
