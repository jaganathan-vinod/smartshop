import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DASHBOARD_SPEC,
  dashboardSpecSchema,
  gmvPacePercent,
  parseDashboardSpecFromText,
  resolveDashboardTargetCents,
  resolveDashboardWindowDays,
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

  it("parses pulse layout, navy theme, 30-day window, and a custom GMV target", () => {
    const spec = parseDashboardSpecFromText(`
\`\`\`json
{"title":"Monthly GMV pulse","kpis":["gmv","targetPace","orderCount","aov","stockouts"],"charts":["gmvByDay","topProducts"],"unavailable":["viewToOrder"],"gmvTargetCents":140000000,"layout":"pulse","theme":"navy","windowDays":30}
\`\`\`
`);
    assert.equal(spec?.layout, "pulse");
    assert.equal(spec?.theme, "navy");
    assert.equal(spec?.windowDays, 30);
    assert.equal(spec?.gmvTargetCents, 140_000_000);
    assert.equal(resolveDashboardWindowDays(spec!), 30);
    assert.equal(resolveDashboardTargetCents(spec!, { gmvTargetCents: 1_200_000 }), 140_000_000);
    assert.equal(gmvPacePercent(70_000_000, 140_000_000), 50);
  });

  it("defaults layout, theme, and window when the agent omits them", () => {
    const spec = dashboardSpecSchema.parse({
      title: "Board view",
      kpis: ["gmv"],
      charts: [],
    });
    assert.equal(spec.layout, "executive");
    assert.equal(spec.theme, "store");
    assert.equal(spec.windowDays, 7);
    assert.equal(resolveDashboardWindowDays(spec), 7);
    assert.equal(gmvPacePercent(100, 0), null);
  });

  it("returns null when the model invents unknown widgets", () => {
    assert.equal(
      parseDashboardSpecFromText('{"title":"x","kpis":["sessionConversion"],"charts":[]}'),
      null,
    );
  });
});
