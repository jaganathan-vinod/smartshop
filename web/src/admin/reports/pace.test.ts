import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gmvPacePercent, resolveDashboardTargetCents } from "@smartshop/shared";
import { EMPTY_ORDERS_COPY, isEmptyOrdersWindow } from "./emptyWindow";
import { kpiValue } from "./kpiValues";

const summary = {
  currency: "USD" as const,
  windowDays: 30,
  from: "2026-08-22T00:00:00.000Z",
  to: "2026-09-21T00:00:00.000Z",
  gmvCents: 700_000,
  orderCount: 0,
  aovCents: 0,
  gmvTargetCents: 1_200_000,
  gmvByDay: [],
  delivery: { STANDARD: 0, EXPRESS: 0 },
  premiumOrderCount: 0,
  premiumUserCount: 0,
  userCount: 0,
  unavailable: ["viewToOrder"],
};

describe("dashboard pace visuals", () => {
  it("uses spec GMV target for the pace ring percent", () => {
    const spec = {
      title: "Monthly GMV pulse",
      kpis: ["targetPace" as const],
      charts: [],
      unavailable: ["viewToOrder"],
      gmvTargetCents: 1_400_000,
      layout: "pulse" as const,
      theme: "navy" as const,
      windowDays: 30 as const,
    };
    assert.equal(resolveDashboardTargetCents(spec, summary), 1_400_000);
    assert.equal(gmvPacePercent(summary.gmvCents, 1_400_000), 50);
    assert.equal(kpiValue("targetPace", spec, summary, 0), "50%");
  });

  it("shows a dash when there is no target", () => {
    assert.equal(gmvPacePercent(100, 0), null);
    const spec = {
      title: "Empty",
      kpis: ["gmv" as const],
      charts: ["gmvByDay" as const],
      unavailable: [],
      layout: "pulse" as const,
      theme: "store" as const,
      windowDays: 7 as const,
    };
    assert.equal(kpiValue("gmv", spec, { ...summary, gmvCents: 0 }, 0), "$0.00");
    assert.equal(isEmptyOrdersWindow(0, 0), true);
    assert.equal(isEmptyOrdersWindow(0, 7), true);
    assert.equal(isEmptyOrdersWindow(500, 7), false);
    assert.equal(EMPTY_ORDERS_COPY, "No orders in this window");
  });
});
