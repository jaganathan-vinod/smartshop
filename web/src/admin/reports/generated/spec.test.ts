import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dashboardSpecSchema } from "@smartshop/shared";
import { MONTHLY_PULSE_SPEC, MONTHLY_WINDOW_DAYS } from "./spec";
import raw from "./dashboard.spec.json";

describe("monthly pulse spec", () => {
  it("binds the $14k monthly target without inventing GMV", () => {
    const spec = dashboardSpecSchema.parse(raw);
    assert.equal(spec.title, "Monthly GMV pulse");
    assert.equal(spec.gmvTargetCents, 1_400_000);
    assert.equal(MONTHLY_WINDOW_DAYS, 30);
    assert.deepEqual(spec.kpis, ["gmv", "targetPace", "orderCount", "aov", "stockouts"]);
    assert.deepEqual(spec.charts, ["gmvByDay", "topProducts"]);
    assert.ok(spec.unavailable.includes("viewToOrder"));
    assert.equal(MONTHLY_PULSE_SPEC.gmvTargetCents, 1_400_000);
  });
});
