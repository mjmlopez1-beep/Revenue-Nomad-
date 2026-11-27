/**
 * The ideal client that learns, and the fit read against it. Pure: no state, no I/O.
 *
 *   An ideal client is two parts kept apart: what the member chose (onboarding, Settings: `stated`,
 *   never changed here) and what their own clients have in common (`learned`: each client's facts
 *   as of when the member worked there, else today's). A learned value says which clients it came
 *   from, and one the member dropped stays dropped (IcpDropped) however often it is learned again.
 *
 *   Fit against it ("Fits your practice") counts only what is known: a criterion the ideal client
 *   has and the company's record answers is matched or not; one the record doesn't answer is "Not on
 *   file", left out of the count and never a miss. The band is a word from the share of known
 *   criteria matched. No percentage is ever shown.
 *
 *   A member's own client is never scored: clientWords says "Your client since Feb 2025" or "Past
 *   client, 2022" where a fit would be.
 */
import { BUSINESS_MODELS, CUSTOMER_SIZES, RN_DEAL_SIZES, RN_EMPLOYEES, RN_INDUSTRIES, RN_MOTIONS, RN_REVENUE, RN_SALES_CYCLES } from "./tableFields";
import type { Icp, IcpDropped, IcpKey, IcpLearned, LearnedValue } from "./tableTypes";

export const ICP_KEYS: readonly IcpKey[] = ["industries", "sellsTo", "customerSize", "businessModel", "motion", "revenue", "employees", "dealSize", "salesCycle", "countries"];
/** The criteria added with the richer fit: optional on a saved ideal client. */
export const ICP_NEW_KEYS: readonly IcpKey[] = ["sellsTo", "customerSize", "businessModel", "motion", "dealSize", "salesCycle"];
/** "Sales-led" is Inside or Enterprise sales (an Evidence Bank case says it this way). */
export const SALES_LED = "Sales-led";
/** The pick list behind each criterion (countries are free text, spelled as the records spell them). */
export const ICP_OPTIONS: Record<IcpKey, readonly string[] | null> = {
  industries: RN_INDUSTRIES,
  sellsTo: RN_INDUSTRIES,
  customerSize: CUSTOMER_SIZES,
  businessModel: BUSINESS_MODELS,
  motion: [...RN_MOTIONS, SALES_LED],
  revenue: RN_REVENUE,
  employees: RN_EMPLOYEES,
  dealSize: RN_DEAL_SIZES,
  salesCycle: RN_SALES_CYCLES,
  countries: null,
};
/** Each criterion as a label, and inside a sentence. */
export const ICP_WORDS: Record<IcpKey, { label: string; say: string }> = {
  industries: { label: "Industry", say: "industry" },
  sellsTo: { label: "Sells to", say: "who it sells to" },
  customerSize: { label: "Customer size", say: "customer size" },
  businessModel: { label: "Business model", say: "business model" },
  motion: { label: "Sales motion", say: "sales motion" },
  revenue: { label: "Revenue", say: "revenue" },
  employees: { label: "Size", say: "size" },
  dealSize: { label: "Deal size", say: "deal size" },
  salesCycle: { label: "Sales cycle", say: "sales cycle" },
  countries: { label: "Country", say: "country" },
};
/** The company fact each criterion reads (GROUPS company fields; the country comes from the HQ). */
export const ICP_FACT: Record<IcpKey, string> = {
  industries: "industry",
  sellsTo: "sellsTo",
  customerSize: "customerSize",
  businessModel: "businessModel",
  motion: "motion",
  revenue: "revenue",
  employees: "employees",
  dealSize: "dealSize",
  salesCycle: "salesCycle",
  countries: "hq",
};

export const icpList = (icp: Icp | null | undefined, k: IcpKey): string[] => (icp ? (icp[k] ?? []) : []);
/** Nothing named at all. */
export const icpIsBlank = (icp: Icp | null | undefined) => !icp || ICP_KEYS.every((k) => !icpList(icp, k).length);
export const EMPTY_ICP: Icp = { industries: [], employees: [], revenue: [], countries: [] };

const lower = (v: string) => v.trim().toLowerCase();
export const countryKey = (v: string) => {
  const k = lower(v).replace(/\./g, "");
  return k === "us" || k === "usa" || k === "united states of america" ? "united states" : k === "uk" ? "united kingdom" : k;
};
const keyOf = (k: IcpKey) => (k === "countries" ? countryKey : lower);

/** A company's facts as the criteria read them: each a list (Sells to holds up to three), empty when not on file. */
export type FitFacts = Partial<Record<IcpKey, string[]>>;

/**
 * One wanted value against one the company has. A B2C ideal client matches a D2C company (D2C is a
 * kind of B2C, never the other way round), and "Sales-led" is Inside or Enterprise sales, read
 * either way round.
 */
function sameValue(k: IcpKey, want: string, have: string): boolean {
  const f = keyOf(k);
  if (f(want) === f(have)) return true;
  if (k === "businessModel") return want === "B2C" && have === "D2C";
  if (k === "motion") {
    const led = ["Inside sales", "Enterprise sales"];
    return (want === SALES_LED && led.includes(have)) || (have === SALES_LED && led.includes(want));
  }
  return false;
}

/** One criterion: undefined when the ideal client doesn't have it, null when the company's record doesn't say, else matched or not. */
export function criterion(k: IcpKey, want: readonly string[], have: readonly string[] | null | undefined): boolean | null | undefined {
  if (!want.length) return undefined;
  if (!have || !have.length) return null;
  return want.some((w) => have.some((h) => sameValue(k, w, h)));
}

export type FitParts = Record<IcpKey, boolean | null | undefined>;
export function fitParts(icp: Icp | null | undefined, facts: FitFacts): FitParts {
  const out = {} as FitParts;
  for (const k of ICP_KEYS) out[k] = criterion(k, icpList(icp, k), facts[k]);
  return out;
}

export type FitBand = "Strong opportunity" | "Good opportunity" | "Worth watching";
/**
 * The band, from the share of known criteria matched (never shown as a number): Strong when at
 * least three in four match and three or more are known, Good from half, else Worth watching.
 * Nothing known is Worth watching: there is nothing to go on yet.
 */
export function fitBand(matched: number, known: number): FitBand {
  if (known <= 0) return "Worth watching";
  if (matched * 4 >= known * 3 && known >= 3) return "Strong opportunity";
  return matched * 2 >= known ? "Good opportunity" : "Worth watching";
}
export const BAND_RANK: Record<FitBand, number> = { "Strong opportunity": 2, "Good opportunity": 1, "Worth watching": 0 };

export interface PracticeFit {
  /** Criteria matched, of the `known` ones. */
  matched: number;
  /** Criteria the ideal client has that this company's record answers. */
  known: number;
  /** Criteria the ideal client has at all. */
  asked: number;
  /** The asked criteria the record doesn't answer: "Not on file". */
  unknown: IcpKey[];
  band: FitBand;
  parts: FitParts;
}
export function practiceFit(icp: Icp | null | undefined, facts: FitFacts): PracticeFit {
  const parts = fitParts(icp, facts);
  const asked = ICP_KEYS.filter((k) => parts[k] !== undefined);
  const unknown = asked.filter((k) => parts[k] === null);
  const matched = asked.filter((k) => parts[k] === true).length;
  const known = asked.length - unknown.length;
  return { matched, known, asked: asked.length, unknown, band: fitBand(matched, known), parts };
}
/** For ordering only (never shown): the band first, then how many criteria match, then fewer misses. */
export const fitOrder = (f: Pick<PracticeFit, "matched" | "known" | "band">) => BAND_RANK[f.band] * 10_000 + f.matched * 100 - (f.known - f.matched);

/* ---------- learning from the member's own clients ---------- */

/** One client of the member's: a seat held, a won deal, or an Evidence Bank case. */
export interface ClientFacts {
  /** The company's internal id, when it is a company on file. */
  companyId: string | null;
  name: string;
  /** Still their client. */
  current: boolean;
  /** YYYY or YYYY-MM, when known. */
  start: string | null;
  end: string | null;
  /** The facts as of when the member worked there (revenue and employees then, else today's). */
  facts: FitFacts;
}

/** A value as its pick list spells it, or null when it isn't one (learning never invents a value). */
function standard(k: IcpKey, v: string): string | null {
  const list = ICP_OPTIONS[k];
  const t = v.trim();
  if (!t) return null;
  if (!list) return t;
  return list.find((o) => lower(o) === lower(t)) ?? null;
}

/**
 * What the clients have in common: every fact on file at each client, most common first, each with
 * the clients it came from. A value the member dropped is left out.
 */
export function learnIcp(clients: readonly ClientFacts[], dropped: IcpDropped | null | undefined = null): IcpLearned {
  const out: IcpLearned = {};
  for (const k of ICP_KEYS) {
    const off = new Set((dropped?.[k] ?? []).map(keyOf(k)));
    const by = new Map<string, LearnedValue>();
    for (const c of clients) {
      for (const raw of c.facts[k] ?? []) {
        const v = standard(k, raw);
        if (!v || off.has(keyOf(k)(v))) continue;
        const id = keyOf(k)(v);
        const row = by.get(id) ?? { v, from: [] };
        if (c.name && !row.from.includes(c.name)) row.from.push(c.name);
        by.set(id, row);
      }
    }
    const rows = [...by.values()].sort((a, b) => b.from.length - a.from.length);
    if (rows.length) out[k] = rows;
  }
  return out;
}

/** The ideal client as fit reads it: what the member chose, and what was learned, together. Null when neither says anything. */
export function idealIcp(stated: Icp | null | undefined, learned: IcpLearned | null | undefined): Icp | null {
  const out: Icp = { ...EMPTY_ICP };
  for (const k of ICP_KEYS) {
    const f = keyOf(k);
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of [...icpList(stated, k), ...(learned?.[k] ?? []).map((x) => x.v)]) {
      if (seen.has(f(v))) continue;
      seen.add(f(v));
      list.push(v);
    }
    if (list.length || !ICP_NEW_KEYS.includes(k)) out[k] = list;
  }
  return icpIsBlank(out) ? null : out;
}

/** The learned profile alone (Lookalikes: "clients like my past clients"). */
export const learnedIcp = (learned: IcpLearned | null | undefined): Icp | null => idealIcp(null, learned);

/** Where a value of the ideal client comes from: "You chose", "From Clarus, Trialbee", or both. */
export function sourceWords(stated: boolean, from: readonly string[] | undefined): string {
  const names = from?.length ? `From ${from.slice(0, 3).join(", ")}${from.length > 3 ? ` and ${from.length - 3} more` : ""}` : "";
  return stated ? (names ? `You chose · ${names}` : "You chose") : names || "From your clients";
}

/** A dropped value added to the list, or taken back out of it. */
export function dropValue(dropped: IcpDropped | null | undefined, k: IcpKey, v: string, on = true): IcpDropped {
  const f = keyOf(k);
  const out: IcpDropped = { ...(dropped ?? {}) };
  const list = (out[k] ?? []).filter((x) => f(x) !== f(v));
  if (on) list.push(v);
  if (list.length) out[k] = list.slice(-60);
  else delete out[k];
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2025-02" reads "Feb 2025", "2022" reads "2022". Null when it isn't a month or a year. */
export function monthYear(v: string | null | undefined): string | null {
  const m = (v ?? "").match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  const mo = m[2] ? MONTHS[Number(m[2]) - 1] : null;
  return mo ? `${mo} ${m[1]}` : m[1];
}
/** "Your client since Feb 2025", "Your client", "Past client, 2022", "Past client". */
export function clientWords(c: Pick<ClientFacts, "current" | "start" | "end">): string {
  if (c.current) {
    const since = monthYear(c.start);
    return since ? `Your client since ${since}` : "Your client";
  }
  const year = (c.end && /^\d{4}/.test(c.end) ? c.end : c.start)?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? `Past client, ${year}` : "Past client";
}

/** An ideal client from anything saved or sent: every list cleaned to its pick list, the new ones left out when empty. */
export function cleanNewCriteria(r: Record<string, unknown>): Partial<Icp> {
  const out: Partial<Icp> = {};
  for (const k of ICP_NEW_KEYS) {
    const list = ICP_OPTIONS[k]!;
    const raw = Array.isArray(r[k]) ? (r[k] as unknown[]) : [];
    const picks = [...new Set(raw.slice(0, 40).map((x) => (typeof x === "string" ? standard(k, x) : null)).filter((x): x is string => !!x))];
    const kept = list.filter((o) => picks.includes(o));
    if (kept.length) out[k] = k === "sellsTo" ? kept.slice(0, 12) : kept;
  }
  return out;
}
