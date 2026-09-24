import { HTML_TEMPLATE_MAX_BYTES } from "@smartshop/shared";

const FENCED_HTML = /```html\s*([\s\S]*?)```/gi;

const STRIP_PATTERNS: RegExp[] = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*>[\s\S]*$/gi,
  /<script\b[^>]*\/?>/gi,
  /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
  /<iframe\b[^>]*\/?>/gi,
  /<object\b[^>]*>[\s\S]*?<\/object>/gi,
  /<object\b[^>]*\/?>/gi,
  /<embed\b[^>]*\/?>/gi,
  /<link\b[^>]*\/?>/gi,
  /<base\b[^>]*\/?>/gi,
  /<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh\b[^>]*>/gi,
  /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi,
  /<foreignObject\b[^>]*\/?>/gi,
];

const EVENT_HANDLER = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

const JS_URL_QUOTED = /\s(?:href|src|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\1/gi;

const JS_URL_BARE = /\s(?:href|src|xlink:href)\s*=\s*javascript:[^\s>]*/gi;

export type HtmlGitInfo = {
  branches?: Array<{ prUrl?: string; branch?: string }>;
};

export function cloudRunTouchedGit(git: HtmlGitInfo | undefined): boolean {
  return (git?.branches ?? []).some((branch) => Boolean(branch.prUrl));
}

export function acceptHtmlReply(input: {
  resultText?: string;
  git?: HtmlGitInfo;
}): { html: string } | { error: string } {
  if (cloudRunTouchedGit(input.git)) {
    return { error: "Cloud agent edited the repository" };
  }
  if (!input.resultText) {
    return { error: "Agent reply did not contain one HTML document" };
  }
  const extracted = extractSingleHtml(input.resultText);
  if ("error" in extracted) {
    return extracted;
  }
  return sanitizeHtmlTemplate(extracted.html);
}

function extractSingleHtml(text: string): { html: string } | { error: string } {
  const blocks = [...text.matchAll(FENCED_HTML)].map((match) => match[1]?.trim() ?? "");
  if (blocks.length === 0) {
    return { error: "Agent reply did not contain one HTML document" };
  }
  if (blocks.length > 1) {
    return { error: "Agent reply contained more than one HTML document" };
  }
  const html = blocks[0];
  if (!html) {
    return { error: "Agent reply did not contain one HTML document" };
  }
  return { html };
}

export function sanitizeHtmlTemplate(html: string): { html: string } | { error: string } {
  if (byteLength(html) > HTML_TEMPLATE_MAX_BYTES) {
    return { error: "Template exceeds 300 KB" };
  }
  let current = html;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = stripDangerousMarkup(current);
    if (next === current) {
      break;
    }
    current = next;
  }
  if (stillDangerous(current)) {
    return { error: "Template still contains script or handlers" };
  }
  if (byteLength(current) > HTML_TEMPLATE_MAX_BYTES) {
    return { error: "Template exceeds 300 KB" };
  }
  return { html: current };
}

function stripDangerousMarkup(html: string): string {
  let current = html;
  for (const pattern of STRIP_PATTERNS) {
    pattern.lastIndex = 0;
    current = current.replace(pattern, "");
  }
  EVENT_HANDLER.lastIndex = 0;
  current = current.replace(EVENT_HANDLER, "");
  JS_URL_QUOTED.lastIndex = 0;
  current = current.replace(JS_URL_QUOTED, "");
  JS_URL_BARE.lastIndex = 0;
  current = current.replace(JS_URL_BARE, "");
  return current;
}

function stillDangerous(html: string): boolean {
  return (
    /<script\b/i.test(html) ||
    /<iframe\b/i.test(html) ||
    /<object\b/i.test(html) ||
    /<embed\b/i.test(html) ||
    /<link\b/i.test(html) ||
    /<base\b/i.test(html) ||
    /<foreignObject\b/i.test(html) ||
    /<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh\b/i.test(html) ||
    /\son[a-z]+\s*=/i.test(html) ||
    /javascript\s*:/i.test(html)
  );
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
