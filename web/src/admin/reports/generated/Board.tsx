import type { GeneratedBoardProps } from "../boardTypes";
import { ReportBoard } from "../ReportBoard";

export const isCustomBoard = false;

export function GeneratedBoard(props: GeneratedBoardProps) {
  return <ReportBoard {...props} />;
}
