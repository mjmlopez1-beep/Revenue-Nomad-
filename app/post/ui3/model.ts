/**
 * What the new design's pages say about a company, from facts the app already has. Nothing here is
 * invented: no odds, no percentages, no timelines.
 *
 *   fit7         how a company fits the member: seven traits matched or not, each from a real fact
 *                (the four parts of their ideal client, past fractional hires, a hire in their own
 *                function, a repeat hirer). A part of the ideal client the member hasn't set, or a
 *                fact not on file, is not matched. Bands: Strong 6 or 7, Good 4 or 5, Worth watching.
 *   openRole     the open role to show (the member's function first): its title, when it was
 *                listed, and the rate only when the posting gave one and the member can see it.
 *   coName       a company's name, or "Locked company" (Free describes, never names, a locked one).
 *   relBand      a relationship band (Strong, Good, Fading, Cold) only where the app derives one
 *                (mail and calendar, messages on Merlin); null otherwise, and nothing is shown.
 */
import type { Me } from "@/lib/tableTypes";
import type { Warmth } from "@/lib/google/types";
import { icpParts, isOpenSeat, namedFn, openSince, regionOf, repeatHirer, shown, type CoInfo } from "../model";
import type { EngagementRec } from "@/lib/tableTypes";

export type TraitKey = "industry" | "size" | "revenue" | "country" | "fractional" | "yourFn" | "repeat";
export interface Trait {
  key: TraitKey;
  label: string;
  on: boolean;
  /** The company's value, or why it doesn't count ("Not set in your ideal client", "Not on file"). */
  value: string;
}
export type FitBand = "Strong opportunity" | "Good opportunity" | "Worth watching";
export interface Fit7 {
  n: number;
  traits: Trait[];
  band: FitBand;
}

export const TRAIT_WORDS: Record<TraitKey, string> = {
  industry: "Industry",
  size: "Size",
  revenue: "Revenue",
  country: "Country",
  fractional: "Hires fractionals",
  yourFn: "Hired your function",
  repeat: "Repeat hirer",
};
/** The Fit header's tooltip: what the seven traits are, and what the count is not. */
export const FIT_TIP = "Traits matched out of 7, from facts on file: industry, size, revenue and country against your ideal client, past fractional hires, a fractional hire in your function, and repeat hiring. It is not a chance of winning.";

export const bandOf = (n: number): FitBand => (n >= 6 ? "Strong opportunity" : n >= 4 ? "Good opportunity" : "Worth watching");
/** The fit ring's class: forest at 6 or 7, gold at 4 or 5, quiet below. */
export const fitCls = (n: number) => (n >= 6 ? "" : n >= 4 ? " mid" : " low");

export function fit7(i: CoInfo, me: Pick<Me, "icp" | "function">): Fit7 {
  const c = i.c;
  const p = me.icp ? icpParts(me.icp, c) : { industry: undefined, employees: undefined, revenue: undefined, country: undefined };
  const fn = namedFn(me.function ?? null);
  const f = c.friendly;
  const val = (v: boolean | null | undefined, fact: string | null) => (v === undefined ? "Not set in your ideal client" : v === null ? "Not on file" : fact ?? "On file");
  const traits: Trait[] = [
    { key: "industry", label: TRAIT_WORDS.industry, on: p.industry === true, value: val(p.industry, shown(c.cells.industry)) },
    { key: "size", label: TRAIT_WORDS.size, on: p.employees === true, value: val(p.employees, shown(c.cells.employees)) },
    { key: "revenue", label: TRAIT_WORDS.revenue, on: p.revenue === true, value: val(p.revenue, shown(c.cells.revenue)) },
    { key: "country", label: TRAIT_WORDS.country, on: p.country === true, value: val(p.country, c.country ?? null) },
    { key: "fractional", label: TRAIT_WORDS.fractional, on: f.fractional > 0 || !!f.services, value: f.fractional ? `${f.fractional} fractional ${f.fractional === 1 ? "hire" : "hires"} on file` : f.services ? "A fractional service on file" : "None on file" },
    { key: "yourFn", label: TRAIT_WORDS.yourFn, on: !!fn && i.fnState.hired.includes(fn), value: !fn ? "Set your function" : i.fnState.hired.includes(fn) ? `Hired fractional ${fn}` : `No ${fn} hire on file` },
    { key: "repeat", label: TRAIT_WORDS.repeat, on: repeatHirer(i), value: repeatHirer(i) ? "2 or more fractional hires" : "Not yet" },
  ];
  const n = traits.filter((t) => t.on).length;
  return { n, traits, band: bandOf(n) };
}

/** A company's name as the member may see it. */
export const coName = (i: CoInfo) => (i.c.hidden ? i.c.shownName ?? "Locked company" : i.c.name);
/** "Industry · City": the strongest line under a name. A locked company says its free facts instead. */
export function coLine(i: CoInfo): string {
  if (i.c.hidden) return i.teaser || "Details open with the company";
  const ind = shown(i.c.cells.industry);
  const hq = shown(i.c.cells.hq);
  const city = hq ? hq.split(",")[0].trim() : regionOf(i.c);
  return [ind, city].filter(Boolean).join(" · ") || "Details not on file";
}

const DAY = 86_400_000;
export function agoWords(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(t)) return null;
  const d = Math.max(0, Math.floor((now - t) / DAY));
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "1 week ago";
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} ${d < 730 ? "year" : "years"} ago`;
}
/** Listed in the last seven days. */
export const freshIso = (iso: string | null | undefined, now = Date.now()) => {
  const t = iso ? Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso) : NaN;
  return Number.isFinite(t) && now - t <= 7 * DAY;
};

export interface OpenRole {
  e: EngagementRec;
  /** The role's title when the member can see it, else its function ("Fractional RevOps role"). */
  title: string;
  /** "3 days ago". */
  ago: string | null;
  fresh: boolean;
  /** The posted rate, only when the posting gave one and the member sees it. */
  rate: string | null;
  mine: boolean;
}
const isOpen = (e: EngagementRec) => (e.opened ? !e.closed : isOpenSeat(e));
export function openRole(i: CoInfo, myFn: string | null): OpenRole | null {
  const fn = namedFn(myFn);
  const open = i.engs.filter(isOpen);
  if (!open.length) return null;
  const mineFirst = [...open].sort((a, b) => Number(shown(b.cells.function) === fn) - Number(shown(a.cells.function) === fn) || String(openSince(b) ?? "").localeCompare(String(openSince(a) ?? "")));
  const e = mineFirst[0];
  const f = shown(e.cells.function);
  const role = shown(e.cells.role);
  const since = openSince(e);
  const rate = e.cells.rate && e.cells.rate.s === "value" ? e.cells.rate.v : null;
  return { e, title: role ?? (f ? `Fractional ${f} role` : "An open fractional role"), ago: agoWords(since), fresh: freshIso(since), rate, mine: !!fn && f === fn };
}

/** A relationship band, only where the app derives one (Warmth from mail, calendar or messages). */
export type RelBand = "Strong" | "Good" | "Fading" | "Cold";
export const relOfWarmth = (w: Warmth | null | undefined): RelBand | null => (w === "Hot" ? "Strong" : w === "Warm" ? "Good" : w === "Fading" ? "Fading" : w === "Cold" ? "Cold" : null);
export const relCls = (b: RelBand) => b.toLowerCase();

/** "Mara Svensson" to "MS". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
/** A soft tint for an avatar, steady for a name. */
const TINTS = ["#f1dccb", "#dfe8f6", "#e5f0e8", "#efe4f7", "#f7ecc9", "#f6dfe3", "#dcefee"];
export const tintOf = (name: string) => TINTS[[...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % TINTS.length];

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export const NUM_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
/** "Eight", or "14" past twelve. */
export const numWord = (n: number) => NUM_WORDS[n] ?? n.toLocaleString("en-US");
