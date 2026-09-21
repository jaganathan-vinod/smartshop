import {
  gmvPacePercent,
  resolveDashboardTargetCents,
  type DashboardSpec,
  type MetricsSummary,
} from "@smartshop/shared";
import { formatCents } from "../../money";

export function kpiValue(
  id: DashboardSpec["kpis"][number],
  spec: DashboardSpec,
  summary: MetricsSummary,
  stockCount: number,
): string {
  switch (id) {
    case "gmv":
      return formatCents(summary.gmvCents);
    case "orderCount":
      return String(summary.orderCount);
    case "aov":
      return formatCents(summary.aovCents);
    case "targetPace": {
      const pace = gmvPacePercent(summary.gmvCents, resolveDashboardTargetCents(spec, summary));
      return pace === null ? "—" : `${pace}%`;
    }
    case "stockouts":
      return String(stockCount);
    case "premiumShare":
      if (summary.orderCount === 0) {
        return "0%";
      }
      return `${Math.round((summary.premiumOrderCount / summary.orderCount) * 100)}%`;
    default: {
      const _never: never = id;
      return _never;
    }
  }
}
