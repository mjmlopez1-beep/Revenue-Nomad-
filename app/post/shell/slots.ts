/**
 * The new look's page that takes the table's place for a list (shell/pages.tsx), pure so the tests
 * read it: Companies is the workbench (companies2), People the People page (people2), Seats the
 * Seats page (seats2), and Hiring now (seats on the table's "hiring" view) its own page
 * (hiring2, hiring/HiringNow.tsx, Signals / Hiring now). Every old Hiring now address
 * (?v=hiring, with t=seats or none) is still the table's place, so it lands there.
 */
import type { RecordType, Tab } from "../model";

export type TableSlot = "companies2" | "people2" | "seats2" | "hiring2";

export function tableSlotOf(t: RecordType, tab: Tab): TableSlot | null {
  if (t === "companies") return "companies2";
  if (t === "people") return "people2";
  if (t === "engagements") return tab === "hiring" ? "hiring2" : "seats2";
  return null;
}
