/**
 * The new look's page that takes the table's place for a list (shell/pages.tsx), pure so the tests
 * read it: Companies is the workbench (companies2), Seats the Seats page (seats2). Hiring now (seats
 * on the table's "hiring" view) and People stay the table until their own pages exist.
 */
import type { RecordType, Tab } from "../model";

export type TableSlot = "companies2" | "seats2";

export function tableSlotOf(t: RecordType, tab: Tab): TableSlot | null {
  if (t === "companies") return "companies2";
  if (t === "engagements" && tab !== "hiring") return "seats2";
  return null;
}
