import type { PlanApiCall } from "@smartshop/shared";

export function GoogleCallTrace({
  summary,
  intro,
  calls,
}: {
  summary: string;
  intro: string;
  calls: PlanApiCall[];
}) {
  if (calls.length === 0) {
    return null;
  }
  return (
    <details className="plan-trace">
      <summary>{summary}</summary>
      <p className="muted">{intro}</p>
      {calls.map((call, index) => (
        <details key={`${call.api}-${index}`} className="plan-trace-call">
          <summary>
            {call.label} · HTTP {call.status}
          </summary>
          <p>
            <code>
              {call.method} {call.url}
            </code>
          </p>
          <h3>Request</h3>
          <pre>{call.request}</pre>
          <h3>Response</h3>
          <pre>{call.response}</pre>
        </details>
      ))}
    </details>
  );
}

export function apiCallsFromDetails(details: unknown): PlanApiCall[] {
  if (!Array.isArray(details)) {
    return [];
  }
  return details.filter(
    (item): item is PlanApiCall =>
      typeof item === "object" &&
      item !== null &&
      "label" in item &&
      "request" in item &&
      "response" in item &&
      "url" in item,
  );
}
