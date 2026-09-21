import type { DashboardSpec } from "@smartshop/shared";

export function kpiLabel(id: DashboardSpec["kpis"][number]): string {
  switch (id) {
    case "gmv":
      return "GMV this window";
    case "orderCount":
      return "Orders";
    case "aov":
      return "Average order";
    case "targetPace":
      return "vs GMV target";
    case "stockouts":
      return "SKUs at zero stock";
    case "premiumShare":
      return "Premium orders";
    default: {
      const _never: never = id;
      return _never;
    }
  }
}
