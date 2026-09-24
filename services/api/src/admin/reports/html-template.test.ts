import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acceptHtmlReply, cloudRunTouchedGit, sanitizeHtmlTemplate } from "./html-template.js";

const SAMPLE = "<section><h1>Report</h1><p>{{summary.gmvCents}}</p></section>";

describe("html report template", () => {
  it("accepts one fenced HTML document", () => {
    const accepted = acceptHtmlReply({
      resultText: `working\n\`\`\`html\n${SAMPLE}\n\`\`\`\n`,
    });
    assert.deepEqual(accepted, { html: SAMPLE });
  });

  it("rejects zero or two HTML fences", () => {
    assert.equal("error" in acceptHtmlReply({ resultText: "no fence" }), true);
    const two = acceptHtmlReply({
      resultText: "```html\n<p>a</p>\n```\n```html\n<p>b</p>\n```",
    });
    assert.equal("error" in two && two.error.includes("more than one"), true);
  });

  it("rejects a run that reports a branch or pull request", () => {
    assert.equal(cloudRunTouchedGit({ branches: [{ branch: "cursor/report" }] }), true);
    const accepted = acceptHtmlReply({
      resultText: `\`\`\`html\n${SAMPLE}\n\`\`\``,
      git: { branches: [{ prUrl: "https://github.com/example/pull/1" }] },
    });
    assert.deepEqual(accepted, { error: "Cloud agent edited the repository" });
  });

  it("strips script, handlers, and javascript urls", () => {
    const raw = `<section onclick="steal()"><p>Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a></section>`;
    const cleaned = sanitizeHtmlTemplate(raw);
    assert.equal("html" in cleaned, true);
    if ("html" in cleaned) {
      assert.equal(cleaned.html.includes("script"), false);
      assert.equal(cleaned.html.includes("onclick"), false);
      assert.equal(cleaned.html.includes("javascript:"), false);
      assert.equal(cleaned.html.includes("<p>Hi</p>"), true);
    }
  });

  it("rejects a template that is still dangerous after the strip", () => {
    const cleaned = sanitizeHtmlTemplate(`<section><script`);
    assert.equal("error" in cleaned, true);
  });
});
