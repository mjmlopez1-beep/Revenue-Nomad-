import { fmtMonth } from "../ui/shared";
import type { ClaimPage } from "@/lib/table";

/**
 * The claim page's line for the seat: "Fractional VP Sales at Acme since Mar 2024". While the
 * company is locked it reads "at a company that's hiring now, since Mar 2024": the comma keeps
 * "since" with the seat, not the hiring. A seat that ended reads "2023 to 2025" (or "from 2023",
 * "until 2025" with only one of them on file).
 */
export function seatLine(seat: NonNullable<ClaimPage["seat"]>): string {
  const what = seat.role || (seat.fn ? `A fractional ${seat.fn} seat` : "A fractional seat");
  const where = seat.company ? seat.company : "a company that's hiring now";
  const span = seat.start && seat.end ? `${fmtMonth(seat.start)} to ${fmtMonth(seat.end)}` : seat.start ? `from ${fmtMonth(seat.start)}` : seat.end ? `until ${fmtMonth(seat.end)}` : "";
  const when = seat.ended ? span : seat.start ? `since ${fmtMonth(seat.start)}` : "";
  return `${what} at ${where}${when ? `${seat.company ? "" : ","} ${when}` : ""}`;
}
