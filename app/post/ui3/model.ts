/**
 * What the new design's pages say about a company, from facts the app already has. Nothing here is
 * invented: no odds, no percentages, no timelines.
 *
 *   fitFor       how a company stands for the member, in two separate things. Fits your practice:
 *                the criteria of their ideal client it matches, out of the ones its record answers
 *                (a fact not on file is left out, never a miss), with a band in words. Buying
 *                signals: past fractional hires, a hire in their function, a repeat hirer, hiring
 *                now. The member's own client is never scored (Me.clients).
 *   openRole     the open role to show (the member's function first): its title, when it was
 *                listed, and the rate only when the posting gave one and the member can see it.
 *   coName       a company's name, or "Locked company" (Free describes, never names, a locked one).
 *   relBand      a relationship band (Strong, Good, Fading, Cold) only where the app derives one
 *                (mail and calendar, messages on Merlin); null otherwise, and nothing is shown.
 */
import type { ClientMark, IcpKey, Me } from "@/lib/tableTypes";
import { ICP_FACT, ICP_KEYS, ICP_WORDS, fitBand, fitOrder, practiceFit, type FitBand } from "@/lib/idealClient";
import type { Warmth } from "@/lib/google/types";
import { coFitFacts, isOpenSeat, namedFn, openSince, regionOf, repeatHirer, shown, type CoInfo } from "../model";
import type { EngagementRec } from "@/lib/tableTypes";
import type { RadarRow } from "@/lib/radar/types";
import type { WarmRow, WarmView } from "@/lib/paths/types";

export type TraitKey = IcpKey;
export type SignalKey = "fractional" | "yourFn" | "repeat" | "hiringNow";
export interface Trait {
  key: TraitKey;
  label: string;
  /** Matched. False for a miss and for a fact not on file: `unknown` tells the two apart. */
  on: boolean;
  /** The company's record doesn't say: "Not on file", left out of the count, never a miss. */
  unknown?: boolean;
  /** The company's value, or "Not on file". */
  value: string;
  /** The company fact to add when it isn't on file (GROUPS company field). */
  fact?: string;
}
/** A buying signal: a fact about the company's hiring, shown beside the fit and never counted in it. */
export interface Signal {
  key: SignalKey;
  label: string;
  on: boolean;
  value: string;
}
export type { FitBand } from "@/lib/idealClient";
/**
 * How a company stands for the member, in two separate things:
 *   Fits your practice   `n` of `of`: criteria of their ideal client matched, out of the ones this
 *                        company's record answers. `traits` lists every criterion the ideal client
 *                        has (matched, not matched, or not on file).
 *   Buying signals       `signals`: hires fractionals, hired your function, repeat hirer, hiring now.
 * `client`: the company is the member's own client, so it is not scored at all (n and of are 0).
 */
export interface Fit {
  n: number;
  of: number;
  /** Criteria the ideal client has at all (`of` plus the ones not on file). */
  asked: number;
  traits: Trait[];
  signals: Signal[];
  band: FitBand;
  /** For ordering only, never shown. */
  order: number;
  client: ClientMark | null;
}
/** Kept for the pages that still import the older name. */
export type Fit7 = Fit;

export const TRAIT_WORDS: Record<TraitKey, string> = Object.fromEntries(ICP_KEYS.map((k) => [k, ICP_WORDS[k].label])) as Record<TraitKey, string>;
export const SIGNAL_WORDS: Record<SignalKey, string> = { fractional: "Hires fractionals", yourFn: "Hired your function", repeat: "Repeat hirer", hiringNow: "Hiring now" };
export const NOT_ON_FILE = "Not on file";
export const ADD_WHAT_YOU_KNOW = "Add what you know";
/** The Fit header's tooltip: what the count is, what it leaves out, and what it is not. */
export const FIT_TIP = "Fits your practice: how many criteria of your ideal client this company matches, out of the ones on file for it (industry, who it sells to, customer size, business model, sales motion, revenue, size, deal size, sales cycle, country). A fact not on file is left out, never counted against it. Buying signals such as past fractional hires are shown apart. It is not a chance of winning.";
/** The one line under a fit list. */
export const FIT_FOOT = "Counts criteria of your ideal client matched, from facts on file. A fact not on file is left out. It is not a chance of winning.";

/** The band for a count of known criteria (lib/idealClient.ts fitBand). */
export const bandOf = (n: number, of: number): FitBand => fitBand(n, of);
/** The fit ring's class: forest for Strong, gold for Good, quiet below. */
export const fitCls = (band: FitBand | string | undefined) => (band === "Strong opportunity" ? "" : band === "Good opportunity" ? " mid" : " low");
export const isStrong = (f: Pick<Fit, "band" | "client">) => !f.client && f.band === "Strong opportunity";
/** Good or better: the bar a company clears to count as a fit. */
export const isGoodFit = (f: Pick<Fit, "band" | "client">) => !f.client && f.band !== "Worth watching";
/** "It fits your practice.", by band. */
export const fitSentence = (f: Pick<Fit, "band" | "of">) => (!f.of ? "Not enough is on file to say how it fits your practice." : f.band === "Strong opportunity" ? "It fits your practice." : f.band === "Good opportunity" ? "It mostly fits your practice." : "It sits outside your sweet spot.");
/** "4 of 5 on file match", or what to say with nothing to count. */
export const fitCount = (f: Pick<Fit, "n" | "of" | "asked">) => (f.of ? `${f.n} of ${f.of} on file match` : f.asked ? "Nothing on file to compare yet" : "Set your ideal client to see fit");

/** The member's own client at this company, or null (Me.clients, by the company's public id). */
export const clientAt = (me: Pick<Me, "clients">, companyId: string): ClientMark | null => (me.clients ?? []).find((c) => c.id === companyId) ?? null;

/** The buying signals: facts about the company's fractional hiring, apart from fit. */
export function buyingSignals(i: CoInfo, me: Pick<Me, "function">): Signal[] {
  const fn = namedFn(me.function ?? null);
  const f = i.c.friendly;
  const open = i.engs.filter((e) => (e.opened ? !e.closed : isOpenSeat(e)));
  const mineOpen = !!fn && open.some((e) => shown(e.cells.function) === fn);
  return [
    { key: "fractional", label: SIGNAL_WORDS.fractional, on: f.fractional > 0 || !!f.services, value: f.fractional ? `${f.fractional} fractional ${f.fractional === 1 ? "hire" : "hires"} on file` : f.services ? "A fractional service on file" : "None on file" },
    { key: "yourFn", label: SIGNAL_WORDS.yourFn, on: !!fn && i.fnState.hired.includes(fn), value: !fn ? "Set your function" : i.fnState.hired.includes(fn) ? `Hired fractional ${fn}` : `No ${fn} hire on file` },
    { key: "repeat", label: SIGNAL_WORDS.repeat, on: repeatHirer(i), value: repeatHirer(i) ? "2 or more fractional hires" : "Not yet" },
    { key: "hiringNow", label: SIGNAL_WORDS.hiringNow, on: open.length > 0, value: mineOpen ? `An open ${fn} role` : open.length ? `${open.length === 1 ? "An open role" : `${open.length} open roles`} on file` : "No open role on file" },
  ];
}

/**
 * A company against the member's ideal client (what they chose and what their clients have in
 * common, Me.icp). Their own client is never scored.
 */
export function fitFor(i: CoInfo, me: Pick<Me, "icp" | "function" | "clients">): Fit {
  const signals = buyingSignals(i, me);
  const client = clientAt(me, i.c.id);
  if (client) return { n: 0, of: 0, asked: 0, traits: [], signals, band: "Worth watching", order: -1, client };
  const facts = coFitFacts(i.c);
  const p = practiceFit(me.icp, facts);
  const traits: Trait[] = ICP_KEYS.filter((k) => p.parts[k] !== undefined).map((k) => {
    const unknown = p.parts[k] === null;
    return { key: k, label: TRAIT_WORDS[k], on: p.parts[k] === true, ...(unknown ? { unknown: true, fact: ICP_FACT[k] } : {}), value: unknown ? NOT_ON_FILE : (facts[k] ?? []).join(", ") };
  });
  return { n: p.matched, of: p.known, asked: p.asked, traits, signals, band: p.band, order: fitOrder(p), client: null };
}
/** The older name, kept so nothing that reads a fit breaks: the same split fit. */
export const fit7 = fitFor;

/** A company's name as the member may see it. */
export const coName = (i: CoInfo) => (i.c.hidden ? i.c.shownName ?? "Locked company" : i.c.name);
/**
 * A company's title where a name would go: its name, or for a locked one its free facts ("A Fintech
 * company"), never a bare "Locked company" (Free describes a locked company by what it may see).
 */
export function coTitle(i: CoInfo): string {
  if (!i.c.hidden) return i.c.name;
  if (i.c.shownName) return i.c.shownName;
  const ind = shown(i.c.cells.industry);
  return ind ? `${/^[AEIOU]/i.test(ind) ? "An" : "A"} ${ind} company` : "A locked company";
}
/** A locked company's other free facts: "11–50 people · $5M–$20M · Austin, TX" (each once). Empty when open. */
export function coFacts(i: CoInfo): string {
  if (!i.c.hidden) return "";
  const size = shown(i.c.cells.employees);
  const hq = shown(i.c.cells.hq) ?? regionOf(i.c);
  return [...new Set([size ? `${size} people` : null, shown(i.c.cells.revenue), hq].filter((x): x is string => !!x))].join(" · ");
}

const ROLE_LINE = /^\s*(new open role|open role|role posted)\b/i;
/**
 * Crystal Ball as the purple, predicted feed: its rows without the posted roles. A posted role is
 * confirmed demand, shown in gold as Hiring now (Target Companies, the company, My Network), never
 * here; a row left with no other signal is not in the feed at all.
 */
export function predicted<R extends Pick<RadarRow, "kinds" | "lines" | "notes" | "sigs" | "h">>(rows: readonly R[]): R[] {
  const out: R[] = [];
  for (const r of rows) {
    if (!r.kinds.includes("role")) {
      out.push(r);
      continue;
    }
    const kinds = r.kinds.filter((k) => k !== "role");
    if (!kinds.length) continue;
    // The role's own lines: by its signals where the row has them (they come strongest first, not in the lines' order), else by their words.
    const roleLines = new Set((r.sigs ?? []).filter((g) => g.kind === "role").map((g) => g.line));
    const keep = r.lines.map((l) => !roleLines.has(l) && !ROLE_LINE.test(l));
    const lines = r.lines.filter((_, n) => keep[n]);
    if (!lines.length) continue;
    const { h: _h, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    out.push({ ...(rest as R), kinds, lines, ...(r.notes ? { notes: r.notes.filter((_, n) => keep[n]) } : {}), ...(r.sigs ? { sigs: r.sigs.filter((g) => g.kind !== "role") } : {}) });
  }
  return out;
}

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

/* ---------- Warm paths: one list, one count, one ask ---------- */

/** A warm way in: through someone the member knows or a fellow fractional, not a cold note to the company. */
export const isWarm = (w: WarmRow | null | undefined): w is WarmRow => !!w && !!w.via && w.src !== "direct";
/** The one word for a warm way in, from its route type (lib/paths routeTypeOf): Direct connection with nobody in between, Warm intro only through someone. */
export const routeTypeWord = (w: Pick<WarmRow, "direct" | "wayType">): "Direct connection" | "Warm intro" => (w.wayType === "Direct connection" || (w.wayType == null && w.direct) ? "Direct connection" : "Warm intro");

const ODDS_RANK: Record<string, number> = { High: 2, Medium: 1, Low: 0 };
/**
 * The warm paths the member can act on, best first: the one list behind the nav's count, Home's
 * "warm ways in" and Your next move, My Network's next move and Warm Paths' picker. A locked
 * company's way in is counted apart (lockedWarm), never in this count while the list leaves it out.
 * Companies that need the member come first: an open role, then Crystal Ball's odds, then fit,
 * then how warm the way in is (never a route into a company with no sign of needing them ahead of one that has).
 */
export function warmList(v: WarmView | null | undefined): WarmRow[] {
  return (v?.rows ?? [])
    .filter((r) => isWarm(r) && !r.locked && !!r.name)
    .sort((a, b) => Number(b.hiringNow) - Number(a.hiringNow) || (ODDS_RANK[b.odds] ?? 0) - (ODDS_RANK[a.odds] ?? 0) || b.fit - a.fit || (b.best ?? 0) - (a.best ?? 0) || a.rank - b.rank);
}
/** Ways in at companies still locked for the member: a count, said apart ("open the company to see who"). */
export const lockedWarm = (v: WarmView | null | undefined) => (v?.rows ?? []).filter((r) => isWarm(r) && (r.locked || !r.name)).length;

/**
 * The ask on a way in, by who the first person is: someone in between gets "Request an intro"; the
 * person the member already knows who decides gets "Discuss opportunity" (they are hiring) or
 * "Reconnect", never an intro to themself; a cold note is "Write to" them.
 */
export function askOf(w: Pick<WarmRow, "direct" | "hiringNow" | "src">, first?: string | null): { k: "intro" | "discuss" | "reconnect" | "write"; l: string } {
  if (!w.direct) return { k: "intro", l: first ? `Request an intro from ${first}` : "Request an intro" };
  if (w.src === "direct") return { k: "write", l: first ? `Write to ${first}` : "Write to them" };
  return w.hiringNow ? { k: "discuss", l: "Discuss opportunity" } : { k: "reconnect", l: "Reconnect" };
}

