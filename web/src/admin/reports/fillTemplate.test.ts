import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MetricsSummary } from "@smartshop/shared";
import { fillHtmlTemplate } from "./fillTemplate.js";

const summary: MetricsSummary = {
  currency: "USD",
  windowDays: 7,
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-09-08T00:00:00.000Z",
  gmvCents: 8409,
  orderCount: 2,
  aovCents: 4205,
  gmvTargetCents: 0,
  gmvByDay: [{ date: "2026-09-01", gmvCents: 8409, orderCount: 2 }],
  delivery: { STANDARD: 1, EXPRESS: 1 },
  premiumOrderCount: 1,
  premiumUserCount: 1,
  userCount: 4,
  unavailable: ["viewToOrder"],
};

describe("fillHtmlTemplate", () => {
  it("formats cents and escapes product names", () => {
    const html = fillHtmlTemplate(
      "<p>{{summary.gmvCents}}</p><ul>{{#each products}}<li>{{name}}</li>{{/each}}</ul>",
      {
        summary,
        products: [{ productId: "p1", name: "A < B", units: 2, gmvCents: 1000 }],
        stock: [],
      },
    );
    assert.equal(html, "<p>$84.09</p><ul><li>A &lt; B</li></ul>");
  });

  it("renders an em dash for an unknown path and nothing for an empty repeat", () => {
    const html = fillHtmlTemplate("{{summary.nope}}{{#each stock}}<li>{{name}}</li>{{/each}}", {
      summary,
      products: [],
      stock: [],
    });
    assert.equal(html, "—");
  });

  it("leaves pace empty when the target is zero and shows a delivery share", () => {
    const html = fillHtmlTemplate(
      "{{summary.gmvPacePercent}}|{{summary.deliveryStandardSharePercent}}|{{summary.delivery.STANDARD}}",
      { summary, products: [], stock: [] },
    );
    assert.equal(html, "|50%|1");
  });
});
