import type { GeneratedBoardProps } from "./boardTypes";
import { DashboardPanel } from "./DashboardPanel";
import { PulseBoard } from "./PulseBoard";

function layoutOf(spec: GeneratedBoardProps["spec"]) {
  if (spec.layout === "pulse" || spec.layout === "command") {
    return spec.layout;
  }
  return "executive" as const;
}

export function ReportBoard(props: GeneratedBoardProps) {
  const layout = layoutOf(props.spec);
  switch (layout) {
    case "pulse":
    case "command":
      return <PulseBoard {...props} />;
    case "executive":
      return <DashboardPanel {...props} />;
    default: {
      const _never: never = layout;
      return _never;
    }
  }
}
