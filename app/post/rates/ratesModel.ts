/**
 * Rate benchmarks in the new look (rates/RatesPage.tsx, Rates.dc.html), as pure functions: which
 * tab an address opens, the member's own rates placed against the market, and the questions
 * "What should I charge" offers. The figures are the server's (View.benchmarks, lib/table.ts
 * rateStat) read through chargeModel.ts, so every floor and rounding is as on the old page: a
 * median at 5 people (20 with Rate Index data), the middle half at 10, nothing below a floor.
 */
import type { BenchRate, Benchmarks, Icp } from "@/lib/tableTypes";
import { FUNCTIONS, RN_REVENUE } from "@/lib/tableFields";
import { readRate } from "@/lib/rates";
import {
  pickGroup,
  type Band,
  type GroupFig,
  type RateKind,
} from "../chargeModel";

export const RATE_TABS = ["fn", "size", "seats"] as const;
export type RateTab = (typeof RATE_TABS)[number];
export const RATE_TAB_LABEL: Record<RateTab, string> = {
  fn: "By function",
  size: "By company size",
  seats: "Seats with a rate",
};

/** ?p=rates opens By function; ?p=rates&tab=size (or seats, function) names one. */
export function rateTabOf(search: string): RateTab {
  const t = new URLSearchParams(search).get("tab");
  const alias: Record<string, RateTab> = {
    function: "fn",
    fn: "fn",
    size: "size",
    revenue: "size",
    seats: "seats",
    seat: "seats",
  };
  return (t && alias[t]) || "fn";
}

/** One of the member's own rates, placed in its group. Only they are sent these. */
export interface MyRate {
  id: string;
  /** A rate shared privately (removable, takes its credit back), or the rate on a seat of theirs (edited on the seat). */
  source: "private" | "seat";
  fn: string;
  kind: RateKind;
  amount: number;
  /** The company of the seat it is about, when there is one ("one of your seats" when that company is locked). */
  at: string | null;
  engagementId: string | null;
  /** The group it is placed in: the seat's client size when that has a figure, else the function across every size. */
  group: GroupFig | null;
}

/**
 * Every rate of the member's: the ones shared privately (Me.benchRates), then the ones on their own
 * seats (read as the server reads them, lib/rates.ts). A private rate tied to a seat replaces that
 * seat's own rate in the list, as it does in the figures.
 */
export function myRates(
  b: Benchmarks | undefined,
  benchRates: BenchRate[],
  seats: {
    company: string;
    engagementId: string;
    fn: string | null;
    rate: string | null;
    pricing: string | null;
    revenue: string | null;
  }[],
): MyRate[] {
  const seatOf = new Map(seats.map((s) => [s.engagementId, s]));
  const place = (
    fn: string,
    kind: RateKind,
    revenue: string | null,
  ): GroupFig | null => {
    if (!b) return null;
    const band: Band =
      revenue && RN_REVENUE.includes(revenue) && !b.limited ? revenue : "All";
    return pickGroup(b, fn, band, kind).shown;
  };
  const out: MyRate[] = [];
  for (const r of benchRates) {
    const s = r.engagementId ? seatOf.get(r.engagementId) : undefined;
    out.push({
      id: r.id,
      source: "private",
      fn: r.function,
      kind: r.kind,
      amount: r.amount,
      at: s?.company ?? null,
      engagementId: r.engagementId,
      group: place(r.function, r.kind, s?.revenue ?? null),
    });
  }
  const shared = new Set(benchRates.map((r) => r.engagementId).filter(Boolean));
  for (const s of seats) {
    if (
      !s.rate ||
      !s.fn ||
      !FUNCTIONS.includes(s.fn) ||
      shared.has(s.engagementId)
    )
      continue;
    const r = readRate(s.rate, s.pricing);
    if (!r) continue;
    out.push({
      id: `seat:${s.engagementId}`,
      source: "seat",
      fn: s.fn,
      kind: r.kind,
      amount: r.amount,
      at: s.company,
      engagementId: s.engagementId,
      group: place(s.fn, r.kind, s.revenue),
    });
  }
  return out;
}

/** A question "What should I charge" offers: its words, and the text it asks. */
export interface AskChip {
  id: string;
  label: string;
  text: string;
}

/**
 * The questions to start from: the member's ideal client (its revenue), up to two of their own
 * seats' companies they can see (with that company's revenue), their function at any client, and
 * by the hour. Never a company they can't see.
 */
export function askChips(
  fn: string | null,
  icp: Icp | null | undefined,
  seatCos: { name: string; revenue: string | null }[],
): AskChip[] {
  const out: AskChip[] = [];
  const f = fn && FUNCTIONS.includes(fn) ? fn : null;
  const rev = icp?.revenue?.find((r) => RN_REVENUE.includes(r));
  if (rev)
    out.push({
      id: "icp",
      label: `Your ideal client, ${rev}, 2 days a week`,
      text: `${f ?? ""} ${rev} 2 days a week`.trim(),
    });
  const seen = new Set<string>();
  for (const c of seatCos) {
    if (
      out.length >= 3 ||
      seen.has(c.name) ||
      !c.revenue ||
      !RN_REVENUE.includes(c.revenue)
    )
      continue;
    seen.add(c.name);
    out.push({
      id: `co:${c.name}`,
      label: `${c.name}, 2 days a week`,
      text: `${c.name} 2 days a week`,
    });
  }
  out.push({
    id: "mine",
    label: f ? `${f}, any client` : "My function, any client",
    text: f ?? "",
  });
  out.push({
    id: "hour",
    label: "By the hour",
    text: `${f ?? ""} by the hour`.trim(),
  });
  return out;
}
