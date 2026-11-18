/**
 * Find open fractional GTM roles for the weekly scan, on top of the job crawler's sources and
 * scoring (lib/crawler). The scan stores what this returns as open roles, hides those companies
 * until a member unlocks them, and closes a role when its posting stops showing up.
 *
 * What gets through:
 *  - listings only, never discussion threads
 *  - work that is itself fractional, interim, freelance or contract: the title says so (or names
 *    an advisor seat), the board lists only fractional work, or a sentence in the body says the
 *    role itself is, with no full-time tell in the posting (workSignal in lib/crawler/score.ts).
 *    Remote, "trusted advisor", "consultative", part-time, days or hours a week, an hourly rate
 *    and "contract" about customers never count on their own.
 *  - GTM seats at any level, and seats outside GTM (a fractional CFO, CTO or Head of People) at
 *    Director and above only: a title outside GTM below Director ("School Staffing Coordinator")
 *    is left out even when its posting mentions sales
 *  - posted in the last 60 days (postings with no date are kept)
 *  - a real, named company, so no "Confidential", no "A Series B startup", no job boards and no
 *    recruiters posting for a client they do not name
 * One role per company and title, at most MAX_ROLES, newest first. A source that fails or
 * hangs is reported with its error and never fails the scan.
 */
import type { JobFunction, RawJob } from "../types";
import type { ScanCollectResult, ScanRole, ScanScreenedOut, ScanSourceResult } from "../scanTypes";
import { ENGAGEMENT_TYPES, FUNCTIONS, cut, functionOf } from "../tableFields";
import { scoreJob, workSignal, type ScoredTags, type WorkSignal } from "../crawler/score";
import * as remotive from "../crawler/sources/remotive";
import * as remoteok from "../crawler/sources/remoteok";
import * as weworkremotely from "../crawler/sources/weworkremotely";
import * as greenhouse from "../crawler/sources/greenhouse";
import * as fractionaljobs from "./sources/fractionaljobs";
import { cleanCompany, cleanTitle, companyDomain, isRealCompany, plain, roleKey } from "./clean";
import { isDirectorPlus, isGtmFunction, keepsNonGtm } from "../seniority";

/** A raw posting, plus facts a board gives as fields of their own instead of in the text. */
export interface ScanRawJob extends RawJob {
  /** The board only lists fractional work, so every listing on it carries the signal. */
  fractionalBoard?: boolean;
  /** A link the board labels as the company's own website. */
  companyUrl?: string;
  /** Rate as posted. */
  rate?: string;
  hoursPerWeek?: number;
  /** The board's own function label for the listing ("Sales", "Marketing"). */
  functionHint?: string;
}

export interface ScanSource {
  name: string;
  fetchJobs: () => Promise<ScanRawJob[]>;
}

/**
 * Boards that carry listings. Hacker News and Reddit are left out: they only return discussion
 * threads, which the scan never uses. Greenhouse reads the boards named in RN_GREENHOUSE_BOARDS.
 */
export const SCAN_SOURCES: ScanSource[] = [fractionaljobs, remotive, remoteok, weworkremotely, greenhouse];

export const MAX_ROLES = 60;
export const STALE_DAYS = 60;
/** How long one source gets before the scan moves on without it. Each request inside has its own 15 second limit. */
export const SOURCE_TIMEOUT_MS = 25_000;

/**
 * bar: no GTM function anywhere in the posting. full-time: the work is not fractional, interim,
 * freelance or contract (see workSignal). not-gtm: the title names a seat outside GTM.
 * seniority: outside GTM and below Director (lib/seniority.ts), such as a "Staffing Coordinator"
 * whose posting mentions sales.
 */
export type SkipReason = "discussion" | "bar" | "full-time" | "not-gtm" | "seniority" | "stale" | "company" | "title";

const DAY = 24 * 3600 * 1000;

/* ---------- the fractional signal ---------- */

/**
 * The work itself is fractional, interim, freelance or contract, and which type that makes it.
 * The title decides first. A fractional-only board's listing counts unless it is a 38+ hour week.
 * Otherwise a sentence in the body has to say the role itself is, with no full-time tell.
 */
export function workOf(raw: Pick<ScanRawJob, "title" | "description" | "fractionalBoard" | "hoursPerWeek">): WorkSignal | { type: "Fractional"; where: "board" } | null {
  const title = plain(raw.title);
  const signal = workSignal(title, String(raw.description ?? ""));
  if (signal?.where === "title") return signal;
  if (raw.fractionalBoard) return raw.hoursPerWeek != null && raw.hoursPerWeek >= 38 ? null : signal ?? { type: "Fractional", where: "board" };
  return signal;
}

/* ---------- function and type ---------- */

/**
 * Titles for seats outside GTM. A fractional CFO posting that mentions the sales team clears the
 * crawler's bar, so the title has the last word: one of these with no GTM word in it is left out.
 */
const NON_GTM_TITLE =
  /\b(?:cfo|cto|cio|ciso|coo|chro|cpo|clo|chief (?:financial|technology|technical|information|operating|operations|people|product|legal|medical|data|security|compliance|human resources|of staff)|finance|financial|fp&a|accounting|accountant|controller|bookkeep\w*|tax|audit\w*|payroll|treasury|engineer\w*|developer|programmer|architect|devops|software|data (?:scientist|engineer|analyst)|machine learning|it (?:manager|director|support|lead)|cyber\w*|security|hr|human resources|people|recruit\w*|talent|legal|counsel|attorney|lawyer|paralegal|compliance|product (?:manager|management|owner|lead|designer|design|director)|head of product|vp(?: of)? product|designer|ux|ui|creative director|art director|operations|supply chain|procurement|logistics|project manager|program manager|scrum|medical|clinical|nurse|physician|scientist|scientific|regulatory|lab|research(?:er)?|teacher|tutor|instructor|assistant|admin(?:istrator)?|office manager|editor|video|photograph\w*)\b/i;

/** The title itself names a GTM function (a CFO or CTO title names one outside GTM). The body is not consulted. */
export function gtmByTitle(title: string): boolean {
  if (AI_GTM.test(title)) return true;
  if (isGtmFunction(functionOf(title))) return true;
  return scoreJob({ title, company: "", url: "", source: "" }).functions.length > 0;
}

/** The crawler's tags, mapped to the table's functions. "GTM Leadership" is tried last. */
const TAG_FUNCTION: Record<JobFunction, string> = {
  Sales: "Sales",
  Marketing: "Marketing",
  RevOps: "RevOps",
  Growth: "Growth",
  Partnerships: "Partnerships",
  "Customer Success": "Customer Success",
  "GTM Leadership": "Sales",
};
/** Board labels that are not already one of the table's functions. */
const HINT_FUNCTION: Record<string, string> = {
  "sales leadership": "Sales",
  "business development": "Partnerships",
  "revenue operations": "RevOps",
  "sales operations": "RevOps",
  "marketing operations": "RevOps",
  "customer success & growth": "Customer Success",
  "account management": "Customer Success",
  "sales enablement": "Enablement",
  "demand generation": "Growth",
  "go-to-market": "Sales",
  gtm: "Sales",
  // Boards' labels for seats outside GTM.
  engineering: "Technology",
  tech: "Technology",
  it: "Technology",
  accounting: "Finance",
  "finance & accounting": "Finance",
  hr: "People",
  "human resources": "People",
  "people & culture": "People",
  "people operations": "People",
  ops: "Operations",
  "product management": "Product",
};
const AI_GTM = /\b(?:ai|genai|gen ai)\b.*\b(?:gtm|go[\s-]?to[\s-]?market)\b|\b(?:gtm|go[\s-]?to[\s-]?market)\b.*\b(?:ai|genai)\b|\bgtm engineer/i;
/** A function the table has (FUNCTIONS): a GTM one, or one outside GTM for a seat at Director and above. */
const known = (fn: string | null | undefined) => (fn && FUNCTIONS.includes(fn) ? fn : null);

export function roleFunction(title: string, tags: Pick<ScoredTags, "functions">, hint?: string): string | null {
  if (AI_GTM.test(title) && known("AI GTM")) return "AI GTM";
  const fromTitle = known(functionOf(title));
  if (fromTitle) return fromTitle;
  if (hint) {
    const h = hint.trim();
    const fromHint = known(FUNCTIONS.find((f) => f.toLowerCase() === h.toLowerCase())) ?? known(HINT_FUNCTION[h.toLowerCase()]) ?? known(functionOf(h));
    if (fromHint && fromHint !== "Other") return fromHint;
  }
  const specific = tags.functions.find((t) => t !== "GTM Leadership") ?? tags.functions[0];
  return specific ? known(TAG_FUNCTION[specific]) : null;
}

const TYPE_WORDING: [string, RegExp][] = [
  ["Fractional", /\bfractional\b/i],
  ["Interim", /\binterim\b/i],
  ["Advisory", /\badvis(?:or|ory|er)s?\b/i],
  ["Project", /\b(?:contract(?:or)?|project(?:[\s-]based)?|freelance|consult(?:ant|ing)|1099)\b/i],
];

/** In a body, advisor and consulting words describe the job ("a trusted advisor to customers"), so only these set the type. */
const BODY_TYPE_WORDING = TYPE_WORDING.filter(([type]) => type !== "Advisory").map(([type, re]): [string, RegExp] =>
  type === "Project" ? [type, /\b(?:contract(?:or)?|project(?:[\s-]based)?|freelance|1099)\b/i] : [type, re]
);

/**
 * Fractional, Interim or Advisory, or Project for freelance and contract work. What says the work
 * is fractional decides (workSignal: the title first, then a body sentence about the role), then
 * the title's wording, then the body's. Advisor and consulting words in a body never set it.
 */
export function roleType(title: string, text: string): string {
  const signal = workSignal(title, text);
  if (signal && ENGAGEMENT_TYPES.includes(signal.type)) return signal.type;
  for (const [hay, wording] of [[title, TYPE_WORDING], [text, BODY_TYPE_WORDING]] as const) {
    for (const [type, re] of wording) if (re.test(hay) && ENGAGEMENT_TYPES.includes(type)) return type;
  }
  return "Fractional";
}

/* ---------- rate and hours ---------- */

const MONEY = String.raw`[$€£]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s?k?`;
const MONTHLY_RATE = new RegExp(`${MONEY}(?:\\s*(?:[-–—]|to)\\s*(?:${MONEY}|\\d{1,3}(?:,\\d{3})*\\s?k?))?\\s*(?:\\/\\s*|per\\s+|a\\s+)(?:month|mo)\\b`, "i");

/** "$150 - $200 /hour" -> "$150–$200/hr". */
function tidyRate(raw: string): string {
  const tidied = plain(raw)
    .replace(/\s*[-–—]\s*(?=[$€£\d])/g, "–")
    .replace(/\s*(?:\/|\bper\b|\ban?\b)\s*(?=(?:hour|hr|month|mo|week|wk|day|year|yr)\b)/gi, "/")
    .replace(/\/hours?\b/gi, "/hr")
    .replace(/\/months?\b/gi, "/mo");
  return cut(tidied, 60).trim();
}

/** The rate as posted, when one is stated with a currency: the board's own field, the crawler's hourly tag, or a monthly retainer in the text. */
export function roleRate(raw: ScanRawJob, tags: Pick<ScoredTags, "rate">, text: string): string | null {
  const stated = (v: string | undefined | null) => !!v && /[$€£]\s?\d/.test(v);
  if (stated(raw.rate)) return tidyRate(raw.rate!);
  if (stated(tags.rate)) return tidyRate(tags.rate!);
  const monthly = text.match(MONTHLY_RATE);
  if (monthly) return tidyRate(monthly[0]);
  if (stated(raw.salary) && /\/\s*(?:hr|hour|mo|month)\b|\bper (?:hour|month)\b|\bhourly\b|\bmonthly\b/i.test(raw.salary!)) return tidyRate(raw.salary!);
  return null;
}

/** Hours a week: the board's own field, or the crawler's commitment tag ("15 hrs/wk", "10–20 hrs/wk", "2 days/wk"). */
export function roleHours(raw: ScanRawJob, tags: Pick<ScoredTags, "commitment">): number | null {
  const ok = (n: number) => (Number.isFinite(n) && n >= 1 && n <= 80 ? Math.round(n) : null);
  if (raw.hoursPerWeek != null) return ok(raw.hoursPerWeek);
  const c = tags.commitment ?? "";
  const days = c.match(/^(\d)\s*days?\/wk$/);
  if (days) return ok(Number(days[1]) * 8);
  const hrs = c.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*hrs?\/wk$/);
  if (hrs) return ok(hrs[2] ? (Number(hrs[1]) + Number(hrs[2])) / 2 : Number(hrs[1]));
  return null;
}

/* ---------- one posting ---------- */

/**
 * Turn one raw posting into a role, or say why it was left out. A posting left out because the
 * work is not fractional ("full-time") carries its key when it has one, so the scan can take
 * back a role an older, looser screen let in (see applyScan).
 */
export function screenJob(
  raw: ScanRawJob,
  now = Date.now()
): { role: ScanRole; skip?: undefined } | { role?: undefined; skip: SkipReason; key?: string } {
  if ((raw.kind || "listing") !== "listing") return { skip: "discussion" };

  const rawTitle = plain(raw.title);
  const body = plain(raw.description);
  const text = `${rawTitle} ${body}`;

  // The work itself has to be fractional, interim, freelance or contract.
  const work = workOf(raw);
  if (!work) {
    const company = cleanCompany(raw.company);
    const key = roleKey(company, cleanTitle(raw.title, company));
    return key.startsWith("::") || key.endsWith("::") ? { skip: "full-time" } : { skip: "full-time", key };
  }

  // And in a GTM function: the title names one, or the posting talks about one and the title is not a seat outside GTM.
  const tags = scoreJob(raw);
  // A Director-and-above seat outside GTM (Fractional CFO, Interim Head of People) is welcome too:
  // the owner opened the table to every function at that level.
  const senior = isDirectorPlus(rawTitle);
  if (!gtmByTitle(rawTitle) && !senior && tags.functions.length === 0) return { skip: "bar" };
  if (!gtmByTitle(rawTitle) && !senior && NON_GTM_TITLE.test(rawTitle)) return { skip: "not-gtm" };
  // Outside GTM, only Director and above (lib/seniority.ts).
  if (!keepsNonGtm(rawTitle, roleFunction(rawTitle, tags, raw.functionHint))) return { skip: "seniority" };

  const hours = roleHours(raw, tags);
  const rate = roleRate(raw, tags, text);

  let postedAt: string | null = null;
  const t = raw.postedAt ? new Date(raw.postedAt).getTime() : NaN;
  if (!Number.isNaN(t)) {
    if (now - t > STALE_DAYS * DAY) return { skip: "stale" };
    if (t <= now + DAY) postedAt = new Date(t).toISOString(); // a date in the future is a bad date
  }

  const company = cleanCompany(raw.company);
  const title = cleanTitle(raw.title, company);
  if (!isRealCompany(company, { text: body, source: raw.source, title })) return { skip: "company" };
  const key = roleKey(company, title);
  if (title.length < 3 || key.endsWith("::")) return { skip: "title" };

  return {
    role: {
      key,
      company,
      domain: companyDomain(company, { companyUrl: raw.companyUrl, url: raw.url, text: String(raw.description ?? "") }),
      title,
      function: roleFunction(title, tags, raw.functionHint),
      // From the raw title, since cleaning drops notes like "(Contract)".
      type: work.where === "board" ? roleType(rawTitle, body) : work.type,
      url: raw.url,
      source: raw.source,
      postedAt,
      rate,
      hoursPerWeek: hours,
    },
  };
}

/* ---------- many postings ---------- */

const detail = (r: ScanRole) => [r.domain, r.rate, r.hoursPerWeek, r.postedAt, r.function].filter((v) => v != null).length;
const posted = (r: ScanRole) => (r.postedAt ? Date.parse(r.postedAt) : 0);

/**
 * One role per key. The posting with the most detail wins (then the newest), and takes any
 * fact it lacks from the others, since they describe the same seat.
 */
export function dedupeRoles(roles: ScanRole[]): ScanRole[] {
  const byKey = new Map<string, ScanRole[]>();
  for (const r of roles) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  return [...byKey.values()].map((group) => {
    const [best, ...rest] = [...group].sort((a, b) => detail(b) - detail(a) || posted(b) - posted(a));
    const merged = { ...best };
    for (const other of rest) {
      merged.domain ??= other.domain;
      merged.rate ??= other.rate;
      merged.hoursPerWeek ??= other.hoursPerWeek;
      merged.postedAt ??= other.postedAt;
      merged.function ??= other.function;
    }
    return merged;
  });
}

/** Newest first. Postings with no date go last, and more detail breaks a tie. */
const newestFirst = (roles: ScanRole[]) => [...roles].sort((a, b) => posted(b) - posted(a) || detail(b) - detail(a) || a.key.localeCompare(b.key));

/** screenJob for input that may be malformed: one bad posting is skipped, the rest of the board still counts. */
function screenSafely(raw: ScanRawJob, now: number): ScanRole | null {
  try {
    return screenJob(raw, now).role ?? null;
  } catch {
    return null;
  }
}

/** Screen raw postings from any number of boards: filter, dedupe, sort newest first and cap. */
export function rolesFromRaw(raws: ScanRawJob[], now = Date.now(), max = MAX_ROLES): ScanRole[] {
  const kept = raws.map((raw) => screenSafely(raw, now)).filter((r): r is ScanRole => r !== null);
  return newestFirst(dedupeRoles(kept)).slice(0, max);
}

/* ---------- the scan ---------- */

function errorText(e: unknown): string {
  if (!(e instanceof Error)) return String(e).slice(0, 200);
  if (e.name === "AbortError") return "Timed out";
  const cause = (e as { cause?: { code?: string; message?: string } }).cause;
  const why = cause?.code || cause?.message;
  return (why && !e.message.includes(why) ? `${e.message} (${why})` : e.message).slice(0, 200);
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${Math.round(ms / 1000)} seconds`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * Run the scan. `roles` is capped at MAX_ROLES. `all` has every role that passed, newest first,
 * including any past the cap: that is what applyScan gets, so a role still posted is never taken
 * for gone because it did not fit this week (applyScan caps only the roles it newly opens).
 * `seenKeys` is the keys of `all`. A source with an `error` was not read at all: its roles are
 * unknown, not gone. `screenedOut` is every listing a board answered with that was left out
 * because the work is not fractional, so applyScan can take back a role an older screen let in.
 */
export async function collectOpenRoles(
  opts: { sources?: ScanSource[]; now?: number; timeoutMs?: number; max?: number } = {}
): Promise<ScanCollectResult & { all: ScanRole[]; seenKeys: string[] }> {
  const sources = opts.sources ?? SCAN_SOURCES;
  const now = opts.now ?? Date.now();
  const timeoutMs = opts.timeoutMs ?? SOURCE_TIMEOUT_MS;

  const settled = await Promise.allSettled(sources.map((src) => withTimeout(Promise.resolve().then(() => src.fetchJobs()), timeoutMs)));

  const kept: ScanRole[] = [];
  const screenedOut: ScanScreenedOut[] = [];
  const results: ScanSourceResult[] = settled.map((res, i) => {
    const source = sources[i].name;
    if (res.status === "rejected") return { source, fetched: 0, matched: 0, error: errorText(res.reason) };
    const raws = Array.isArray(res.value) ? res.value : [];
    let matched = 0;
    for (const raw of raws) {
      let out: ReturnType<typeof screenJob> | null = null;
      try {
        out = screenJob(raw, now);
      } catch {
        continue; // one bad posting is skipped, the rest of the board still counts
      }
      if (out.role) {
        kept.push(out.role);
        matched++;
      } else if (out.skip === "full-time" && out.key) screenedOut.push({ key: out.key, url: String(raw.url ?? ""), source: String(raw.source || source) });
    }
    return { source, fetched: raws.length, matched };
  });

  const all = newestFirst(dedupeRoles(kept));
  return { roles: all.slice(0, opts.max ?? MAX_ROLES), all, sources: results, seenKeys: all.map((r) => r.key), screenedOut };
}
