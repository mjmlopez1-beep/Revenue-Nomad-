/**
 * Find open fractional GTM roles for the weekly scan, on top of the job crawler's sources and
 * scoring (lib/crawler). The scan stores what this returns as open roles, hides those companies
 * until a member unlocks them, and closes a role when its posting stops showing up.
 *
 * What gets through:
 *  - listings only, never discussion threads
 *  - the crawler's bar: score at least MIN_SCORE and a real fractional signal
 *  - GTM seats only: a fractional CFO or CTO posting is left out even when it mentions sales
 *  - posted in the last 60 days (postings with no date are kept)
 *  - a real, named company, so no "Confidential", no "A Series B startup", no job boards and no
 *    recruiters posting for a client they do not name
 * One role per company and title, at most MAX_ROLES, newest first. A source that fails or
 * hangs is reported with its error and never fails the scan.
 */
import type { JobFunction, RawJob } from "../types";
import type { ScanCollectResult, ScanRole, ScanSourceResult } from "../scanTypes";
import { ENGAGEMENT_TYPES, FUNCTIONS, functionOf } from "../tableFields";
import { MIN_SCORE, scoreJob, type ScoredTags } from "../crawler/score";
import * as remotive from "../crawler/sources/remotive";
import * as remoteok from "../crawler/sources/remoteok";
import * as weworkremotely from "../crawler/sources/weworkremotely";
import * as greenhouse from "../crawler/sources/greenhouse";
import * as fractionaljobs from "./sources/fractionaljobs";
import { cleanCompany, cleanTitle, companyDomain, isRealCompany, plain, roleKey } from "./clean";

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

export type SkipReason = "discussion" | "bar" | "full-time" | "not-gtm" | "stale" | "company" | "title";

const DAY = 24 * 3600 * 1000;

/* ---------- the fractional signal ---------- */

const TITLE_SIGNAL = /\b(?:fractional|interim|advis(?:or|ory|er)s?|part[\s-]?time|contract(?:or)?|freelance|consult(?:ant|ing))\b/i;
/** Full-time tells, the same ones the crawler's scorer subtracts for. */
const FULL_TIME =
  /\bfull[\s-]?time\b|\bfte\b|\b(?:401k|401\(k\)|health insurance|dental|vision insurance|paid time off|parental leave|equity package|stock options|annual salary|base salary)\b|\bpto\b/i;
/** Wording that says the role itself is fractional, not just that the word appears somewhere. */
const ROLE_IS_FRACTIONAL =
  /\b(?:fractional|interim|part[\s-]?time)\s+(?:role|position|engagement|basis|capacity|opportunity|contract|hire|leader|leadership|executive|exec|c[a-z]o|chief|vp|vice president|head|director|advisor|consultant)\b|\b(?:seeking|hiring|looking for|searching for|in search of|needs?|wants?)\s+an?\s+(?:[\w-]+\s+){0,2}(?:fractional|interim|part[\s-]?time)\b|\bthis (?:is an?|role is|position is)\s+(?:fractional|interim|part[\s-]?time)\b/i;

/* ---------- function and type ---------- */

/**
 * Titles for seats outside GTM. A fractional CFO posting that mentions the sales team clears the
 * crawler's bar, so the title has the last word: one of these with no GTM word in it is left out.
 */
const NON_GTM_TITLE =
  /\b(?:cfo|cto|cio|ciso|coo|chro|cpo|clo|chief (?:financial|technology|technical|information|operating|operations|people|product|legal|medical|data|security|compliance|human resources|of staff)|finance|financial|fp&a|accounting|accountant|controller|bookkeep\w*|tax|audit\w*|payroll|treasury|engineer\w*|developer|programmer|architect|devops|software|data (?:scientist|engineer|analyst)|machine learning|it (?:manager|director|support|lead)|cyber\w*|security|hr|human resources|people|recruit\w*|talent|legal|counsel|attorney|lawyer|paralegal|compliance|product (?:manager|management|owner|lead|designer|design|director)|head of product|vp(?: of)? product|designer|ux|ui|creative director|art director|operations|supply chain|procurement|logistics|project manager|program manager|scrum|medical|clinical|nurse|physician|scientist|scientific|regulatory|lab|research(?:er)?|teacher|tutor|instructor|assistant|admin(?:istrator)?|office manager|editor|video|photograph\w*)\b/i;

/** The title itself names a GTM function. The body is not consulted. */
function gtmByTitle(title: string): boolean {
  if (AI_GTM.test(title)) return true;
  const fn = functionOf(title);
  if (fn && fn !== "Executive") return true;
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
};
const AI_GTM = /\b(?:ai|genai|gen ai)\b.*\b(?:gtm|go[\s-]?to[\s-]?market)\b|\b(?:gtm|go[\s-]?to[\s-]?market)\b.*\b(?:ai|genai)\b|\bgtm engineer/i;
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

/** Fractional, Interim or Advisory from the wording, Project for contract or project wording. The title decides before the body. */
export function roleType(title: string, text: string): string {
  for (const hay of [title, text]) {
    for (const [type, re] of TYPE_WORDING) if (re.test(hay) && ENGAGEMENT_TYPES.includes(type)) return type;
  }
  return "Fractional";
}

/* ---------- rate and hours ---------- */

const MONEY = String.raw`[$€£]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s?k?`;
const MONTHLY_RATE = new RegExp(`${MONEY}(?:\\s*(?:[-–—]|to)\\s*(?:${MONEY}|\\d{1,3}(?:,\\d{3})*\\s?k?))?\\s*(?:\\/\\s*|per\\s+|a\\s+)(?:month|mo)\\b`, "i");

/** "$150 - $200 /hour" -> "$150–$200/hr". */
function tidyRate(raw: string): string {
  return plain(raw)
    .replace(/\s*[-–—]\s*(?=[$€£\d])/g, "–")
    .replace(/\s*(?:\/|\bper\b|\ban?\b)\s*(?=(?:hour|hr|month|mo|week|wk|day|year|yr)\b)/gi, "/")
    .replace(/\/hours?\b/gi, "/hr")
    .replace(/\/months?\b/gi, "/mo")
    .slice(0, 60)
    .trim();
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

/** Turn one raw posting into a role, or say why it was left out. */
export function screenJob(raw: ScanRawJob, now = Date.now()): { role: ScanRole; skip?: undefined } | { role?: undefined; skip: SkipReason } {
  if ((raw.kind || "listing") !== "listing") return { skip: "discussion" };

  const rawTitle = plain(raw.title);
  const body = plain(raw.description);
  const text = `${rawTitle} ${body}`;

  // The crawler's bar.
  const tags = scoreJob(raw);
  if (tags.score < MIN_SCORE || !tags.isFractional) return { skip: "bar" };

  // When the only signal is a word somewhere in the body ("you'll manage fractional contractors"),
  // the body has to say the role itself is fractional, and carry no full-time tells.
  const hours = roleHours(raw, tags);
  const rate = roleRate(raw, tags, text);
  const structured = (hours != null && hours <= 32) || (rate != null && /\/hr\b/.test(rate));
  if (!raw.fractionalBoard && !TITLE_SIGNAL.test(rawTitle) && !structured && (FULL_TIME.test(text) || !ROLE_IS_FRACTIONAL.test(body))) {
    return { skip: "full-time" };
  }

  if (!gtmByTitle(rawTitle) && NON_GTM_TITLE.test(rawTitle)) return { skip: "not-gtm" };

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
      type: roleType(rawTitle, body), // the raw title, since cleaning drops notes like "(Contract)"
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
 * Run the scan. `roles` is capped at MAX_ROLES. `seenKeys` has the key of every role that passed,
 * including any past the cap, so whoever closes roles can tell "no longer posted" from "did not
 * fit this week". A source with an `error` was not read at all: its roles are unknown, not gone.
 */
export async function collectOpenRoles(
  opts: { sources?: ScanSource[]; now?: number; timeoutMs?: number; max?: number } = {}
): Promise<ScanCollectResult & { seenKeys: string[] }> {
  const sources = opts.sources ?? SCAN_SOURCES;
  const now = opts.now ?? Date.now();
  const timeoutMs = opts.timeoutMs ?? SOURCE_TIMEOUT_MS;

  const settled = await Promise.allSettled(sources.map((src) => withTimeout(Promise.resolve().then(() => src.fetchJobs()), timeoutMs)));

  const kept: ScanRole[] = [];
  const results: ScanSourceResult[] = settled.map((res, i) => {
    const source = sources[i].name;
    if (res.status === "rejected") return { source, fetched: 0, matched: 0, error: errorText(res.reason) };
    const raws = Array.isArray(res.value) ? res.value : [];
    const roles = raws.map((raw) => screenSafely(raw, now)).filter((r): r is ScanRole => r !== null);
    kept.push(...roles);
    return { source, fetched: raws.length, matched: roles.length };
  });

  const all = newestFirst(dedupeRoles(kept));
  return { roles: all.slice(0, opts.max ?? MAX_ROLES), sources: results, seenKeys: all.map((r) => r.key) };
}
