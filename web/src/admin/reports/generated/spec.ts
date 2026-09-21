import { dashboardSpecSchema, type DashboardSpec } from "@smartshop/shared";
import raw from "./dashboard.spec.json";

export const MONTHLY_WINDOW_DAYS = 30;

export const MONTHLY_PULSE_SPEC: DashboardSpec = dashboardSpecSchema.parse(raw);
