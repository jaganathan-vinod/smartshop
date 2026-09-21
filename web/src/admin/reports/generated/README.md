Cursor cloud agents write `dashboard.spec.json` and `Board.tsx` here.

The fenced JSON spec is required: it drives instant preview in the existing SPA (`layout`, `theme`, `windowDays`, `gmvTargetCents`, plus widgets). Approve stores that spec; it does not deploy AWS.

Also overwrite `Board.tsx` with a self-contained board (inline styles or a CSS module in this folder only). It must export:

```ts
export const isCustomBoard = true;
export function GeneratedBoard(props: {
  spec: DashboardSpec;
  summary: MetricsSummary;
  products: Array<{ productId: string; name: string; units: number; gmvCents: number }>;
  stock: Array<{ productId: string; name: string; stockQty: number }>;
  badge: string;
}): JSX.Element;
```

Bind widgets to `GET /v1/admin/metrics/*` (integer cents, USD). Do not invent GMV. Empty windows render `$0.00` or `No orders in this window`.

Do not edit `web/src/styles.css`, cart, checkout, orders, AgentCore, assistant tools, JWT authorizers, or infra. CloudFront shows a custom board only after this file is on the branch you deploy with `isCustomBoard = true`.
