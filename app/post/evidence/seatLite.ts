/**
 * A seat of the member's as Evidence Bank reads it (evidenceModel.ts SeatLite): the company's free
 * facts (industry, size, revenue, sales motion), the seat's title, dates, hours and why they hired.
 * These prefill a draft case; the member checks them, and changes them on the seat in Seats.
 */
import { shown, type SeatInfo } from "../model";
import { whenWords } from "../seatsPage/seatsModel";
import type { SeatLite } from "./evidenceModel";

export function seatLiteOf(s: SeatInfo): SeatLite {
  const { i, e } = s;
  const fn = shown(e.cells.function);
  const hours = shown(e.cells.hours);
  return {
    id: e.id,
    companyId: i.c.id,
    company: i.c.hidden ? "" : i.c.name,
    hidden: !!i.c.hidden,
    industry: shown(i.c.cells.industry) ?? "",
    size: shown(i.c.cells.employees) ?? "",
    revenue: shown(i.c.cells.revenue) ?? "",
    motion: shown(i.c.cells.motion) ?? "",
    role: shown(e.cells.role) ?? (fn ? `Fractional ${fn}` : "Fractional"),
    dates: whenWords(e) ?? "",
    hours: hours ? (/\d$/.test(hours) ? `${hours} hours a week` : hours) : "",
    why: shown(e.cells.reason) ?? "",
  };
}
