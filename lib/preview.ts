/**
 * "Try it" on the landing page: what a signed-out visitor sees for one function, and optionally
 * one industry and one country. Counts, a small table of rows, and one example record for the hero.
 *
 * The table: up to PREVIEW_ROWS rows for one tab (all, hiring now, no fractional in this function
 * yet). Only the first PREVIEW_NAMED rows carry their company. The rest come with `company: null`
 * and `blur: true`, and the page draws a blurred made-up name from the row's opaque seed. Their
 * titles are scrubbed of the company the way kept-back open roles are, so nothing past row
 * PREVIEW_NAMED names a company. `total` says how many rows the tab has in all.
 *
 * What leaves here is a closed list of fields (PreviewRow, PreviewExample): company facts
 * (name, domain, logo domain, industry, size, revenue band, country), role titles, functions and
 * dates. Never a person (seat holder, hiring contact or member), an email, a phone, a LinkedIn
 * profile, a job posting link or a seat's rate. A seat says only that its holder is on file, and
 * whether they are a Revenue Nomad member. A role title with a link or an address in it is
 * replaced by a plain "Fractional <function> role".
 *
 * PREVIEW_SHOWS_OPEN_ROLE_COMPANIES decides whether a company with an open role is named here.
 * In the app such a company is hidden until a member unlocks it.
 *
 * Answers are kept in memory for a few minutes per (function, industry, country), and rebuilt
 * when the signed-out build changes (lib/table.ts previewCompanies).
 */
import { previewCompanies, type PreviewCompany } from "./table";
import { FUNCTIONS, INDUSTRY_GROUPS, RN_EMPLOYEES, RN_INDUSTRIES } from "./tableFields";
import { titleWithout } from "./scan/clean";
import { countryName, countryOf, deriveAll, isFirm, isHire, isOpenRole, known, repeatHirer, shown, type CoInfo } from "@/app/post/model";
import type { EngagementRec } from "./tableTypes";

/**
 * Signed-out visitors see the companies behind open roles: name, domain and logo, on the
 * landing page's Try it rows and its example record. Flip this to false to lock them again on
 * the homepage: open-role rows then come without a company ("Company unlocks with 1 credit"),
 * their titles lose the company's name and site, and the example record is a company with no
 * open role. The app itself keeps hiding these companies from members until they unlock one.
 */
export const PREVIEW_SHOWS_OPEN_ROLE_COMPANIES = true;

/**
 * The flag as this server runs it. RN_PREVIEW_OPEN_ROLE_COMPANIES=0 or 1 overrides it only on a
 * test server (RN_SCAN_TEST=1, as scripts/test-all.sh starts them), so both ways can be tested.
 * Production never reads it.
 */
export function showsOpenRoleCompanies(): boolean {
  const o = process.env.RN_PREVIEW_OPEN_ROLE_COMPANIES;
  if (process.env.RN_SCAN_TEST === "1" && (o === "0" || o === "1")) return o === "1";
  return PREVIEW_SHOWS_OPEN_ROLE_COMPANIES;
}

/** The most rows one answer carries. */
export const PREVIEW_ROWS = 25;
/** Rows that name their company; the rest are blurred on the page and carry no company. */
export const PREVIEW_NAMED = 10;
/** The tabs over the table: everything in this function, open roles only, or companies with no fractional in it yet. */
export const PREVIEW_VIEWS = ["all", "hiring", "notyet"] as const;
export type PreviewView = (typeof PREVIEW_VIEWS)[number];
/** A country or an industry shows in the pickers once this many companies are on file there. */
const OPTION_MIN = 3;
/** How long one answer is reused (the source is rebuilt at least hourly on its own). */
const ANSWER_FRESH = 5 * 60 * 1000;
const ANSWER_MAX = 400;

/** Functions a visitor can pick: every function on the table except "Other". */
export const PREVIEW_FUNCTIONS = FUNCTIONS.filter((f) => f !== "Other");

/** The company on a row or the example: its free facts. */
export interface PreviewCompanyOut {
  name: string;
  /** The website's domain, else the logo's. */
  domain: string | null;
  /** The domain the table draws the logo from (CompanyRec.iconDomain), else `domain`. */
  logo: string | null;
}

export interface PreviewRow {
  /** Opaque and stable per company (an HMAC of the internal id). A key for the page, nothing more. */
  seed: string;
  /**
   * "open": an open role now. "hired": a seat in this function that a fractional held.
   * "notyet": a company that hired fractionals in other functions and none in this one.
   */
  kind: "open" | "hired" | "notyet";
  /** Null for a row past PREVIEW_NAMED (`blur`), and for an open role while PREVIEW_SHOWS_OPEN_ROLE_COMPANIES is off. */
  company: PreviewCompanyOut | null;
  /** A row past PREVIEW_NAMED: the page blurs a made-up name from `seed`. Never the company. */
  blur?: boolean;
  /**
   * The open role's title, "Fractional <function> seat" for a past seat (a past seat's own title
   * is a locked fact), or "Hired fractional <functions>" for a company with none in this function yet.
   */
  title: string;
  function: string;
  /** Open role: the ISO day it was posted (or first seen). Past seat: its start month (YYYY-MM), when known. Not yet: its latest seat's start month. */
  when: string | null;
  industry: string | null;
  employees: string | null;
  revenue: string | null;
  country: string | null;
  /** A past seat whose seat holder is on file (behind a lock in the app). Never who it is. */
  holder?: boolean;
}

/** One real company record for the hero: a past seat with its holder on file, and an open role when there is one. */
export interface PreviewExample {
  company: PreviewCompanyOut & { industry: string | null; employees: string | null; revenue: string | null; country: string | null };
  open: { title: string; function: string; when: string | null } | null;
  /** The seat holder is on file. `rnMember`: they are a Revenue Nomad member. Never who. */
  seat: { function: string; start: string | null; rnMember: boolean };
}

export interface PreviewAnswer {
  fn: string;
  /** The tab the rows are for. */
  view: PreviewView;
  /** Rows the tab has in all (the answer carries the first PREVIEW_ROWS). */
  total: number;
  industry: string | null;
  country: string | null;
  counts: {
    /** Companies that hired a fractional in this function. */
    hired: number;
    /** Companies that hired fractionals in other functions and none in this one (nor hiring one now). */
    notYet: number;
    /** Companies with an open role in this function now. */
    hiring: number;
    /** Of `hired`, the companies where the fractional who held a seat in this function is on file. */
    holders: number;
    /** Companies with 2 or more fractional hires, or hires in 2 or more functions. */
    repeat: number;
    /** Companies that hired any fractional. */
    anyHire: number;
  };
  /** The first PREVIEW_NAMED name their company, the rest are `blur` rows. */
  rows: PreviewRow[];
  /** The hero's example record, the same for every function. Null when nothing on file fits. */
  example: PreviewExample | null;
  /** PREVIEW_SHOWS_OPEN_ROLE_COMPANIES as this server runs it. */
  openRoleCompanies: boolean;
  /** What the pickers offer (industries and countries with enough companies on file). */
  options: { functions: string[]; industries: string[]; countries: string[] };
}

export class PreviewError extends Error {}

interface Source {
  version: object;
  infos: { i: CoInfo; p: PreviewCompany }[];
  options: PreviewAnswer["options"];
  example: PreviewExample | null;
  open: boolean;
}
let source: Source | null = null;
const answers = new Map<string, { at: number; a: PreviewAnswer }>();

const fnOf = (e: EngagementRec) => shown(e.cells.function);
const countryOfInfo = (i: CoInfo) => {
  const c = countryOf(i.c);
  return c ? countryName(c) : null;
};
const companyOut = (i: CoInfo): PreviewCompanyOut => ({ name: i.c.name, domain: i.domain ?? null, logo: i.c.iconDomain ?? i.domain ?? null });
const newestOpen = (es: EngagementRec[]) => [...es].sort((a, b) => (b.posted ?? b.opened ?? "").localeCompare(a.posted ?? a.opened ?? ""))[0];
const monthOf = (v: string | null) => (v && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : null);
/** Bigger companies read as better known: 0 for unknown, up to 6. */
const sizeRank = (v: string | null) => (v ? RN_EMPLOYEES.indexOf(v) + 1 : 0);
/** A seat that started in the last three years makes the best example, then the last six. */
const recency = (month: string | null) => {
  const age = month ? new Date().getUTCFullYear() - Number(month.slice(0, 4)) : 99;
  return age <= 3 ? 16 : age <= 6 ? 6 : 0;
};

/** A role title as the posting has it, unless it carries a link or an email address. */
function cleanTitle(raw: string, fn: string): string {
  const t = raw.trim();
  if (!t || t.length > 90) return `Fractional ${fn} role`;
  if (/https?:|www\.|@/i.test(t)) return `Fractional ${fn} role`;
  return t;
}

/** A title with no trace of the company: its name, its site's name, or a domain of its own (open-role companies kept back). */
function safeTitle(raw: string, p: PreviewCompany, fn: string): string {
  const fallback = `Fractional ${fn} role`;
  const t = titleWithout(raw, p.name, p.site, fallback).trim();
  const low = t.toLowerCase();
  const name = p.name.toLowerCase().trim();
  const host = (p.site ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const label = host.split(".")[0];
  if (name.length >= 3 && low.includes(name)) return fallback;
  if (label.length >= 4 && low.includes(label)) return fallback;
  // A domain of any kind could be the company's own.
  if (/\b[a-z0-9-]+\.(com|io|co|ai|net|org|app|dev)\b/i.test(t)) return fallback;
  return cleanTitle(t, fn);
}

function roleTitle(role: EngagementRec, p: PreviewCompany, fn: string, open: boolean): string {
  if (role.cells.role?.s !== "value" || role.cells.role.system) return `Fractional ${fn} role`;
  return open ? cleanTitle(role.cells.role.v, fn) : safeTitle(role.cells.role.v, p, fn);
}

/**
 * The hero's example: a company with a logo, its industry and size on file, a past seat whose
 * holder is on file (a Revenue Nomad member first), and, while open-role companies are shown, an
 * open role in another function. The best known (biggest, most seats) of those.
 */
function pickExample(infos: Source["infos"], open: boolean): PreviewExample | null {
  let best: { score: number; x: PreviewExample } | null = null;
  for (const { i, p } of infos) {
    if (!i.domain || !shown(i.c.cells.industry)) continue;
    const roles = i.engs.filter(isOpenRole);
    if (roles.length && !open) continue;
    const seats = i.engs.filter((e) => isHire(e) && known(e.cells.operator) && fnOf(e));
    if (!seats.length) continue;
    const role = roles.length ? newestOpen(roles) : null;
    const roleFn = role ? fnOf(role) : null;
    const seat = [...seats].sort((a, b) => Number(p.rnHolders.has(b.id)) - Number(p.rnHolders.has(a.id)) || Number(fnOf(b) !== roleFn) - Number(fnOf(a) !== roleFn) || (shown(b.cells.start) ?? "").localeCompare(shown(a.cells.start) ?? ""))[0];
    const employees = shown(i.c.cells.employees);
    const roleT = role && roleFn ? roleTitle(role, p, roleFn, true) : null;
    const score =
      (role && roleFn && roleT && !/^Fractional \S+ role$/.test(roleT) ? 40 : 0) +
      (p.rnHolders.has(seat.id) ? 20 : 0) +
      (fnOf(seat) !== roleFn ? 6 : 0) +
      Math.min(sizeRank(employees), 5) * 3 +
      (shown(i.c.cells.revenue) ? 2 : 0) +
      (countryOfInfo(i) ? 2 : 0) +
      recency(monthOf(shown(seat.cells.start))) +
      Math.min(i.engs.length, 6);
    if (best && score <= best.score) continue;
    best = {
      score,
      x: {
        company: { ...companyOut(i), industry: shown(i.c.cells.industry), employees, revenue: shown(i.c.cells.revenue), country: countryOfInfo(i) },
        open: role && roleFn && roleT ? { title: roleT, function: roleFn, when: role.posted ?? role.opened ?? null } : null,
        seat: { function: fnOf(seat)!, start: monthOf(shown(seat.cells.start)), rnMember: p.rnHolders.has(seat.id) },
      },
    };
  }
  return best?.x ?? null;
}

async function sourceNow(): Promise<Source> {
  const { list, version } = await previewCompanies();
  const open = showsOpenRoleCompanies();
  if (source && source.version === version && source.open === open) return source;
  const clients = list.filter((p) => !isFirm(p.rec));
  const infos = deriveAll(clients.map((p) => p.rec)).map((i, n) => ({ i, p: clients[n] }));
  const ind = new Map<string, number>();
  const ctry = new Map<string, number>();
  for (const { i } of infos) {
    const x = shown(i.c.cells.industry);
    if (x) ind.set(x, (ind.get(x) ?? 0) + 1);
    const c = countryOf(i.c);
    if (c) ctry.set(countryName(c), (ctry.get(countryName(c)) ?? 0) + 1);
  }
  const groups = INDUSTRY_GROUPS.filter((g) => g.values.some((v) => (ind.get(v) ?? 0) > 0)).map((g) => g.label);
  const industries = [...groups, ...RN_INDUSTRIES.filter((x) => (ind.get(x) ?? 0) >= OPTION_MIN)];
  const countries = [...ctry.entries()].filter(([, n]) => n >= OPTION_MIN).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  source = { version, infos, options: { functions: PREVIEW_FUNCTIONS, industries, countries }, example: pickExample(infos, open), open };
  answers.clear();
  return source;
}

/** A query value checked against its list. Empty means any. Anything else not on the list is refused. */
function pick(raw: string | null | undefined, list: readonly string[], what: string): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const hit = list.find((x) => x.toLowerCase() === v.toLowerCase());
  if (!hit) throw new PreviewError(`Pick ${what} from the list.`);
  return hit;
}

/** The preview for one function (and optionally one industry and one country). Throws PreviewError on a value not on its list. */
export async function preview(q: { fn?: string | null; industry?: string | null; country?: string | null; view?: string | null }): Promise<PreviewAnswer> {
  const src = await sourceNow();
  const fn = pick(q.fn, PREVIEW_FUNCTIONS, "a function") ?? "Sales";
  const industry = pick(q.industry, src.options.industries, "an industry");
  const country = pick(q.country, src.options.countries, "a country");
  const view = (pick(q.view, PREVIEW_VIEWS, "a tab") ?? "all") as PreviewView;
  const key = `${fn}|${industry ?? ""}|${country ?? ""}|${view}`;
  const hit = answers.get(key);
  if (hit && Date.now() - hit.at < ANSWER_FRESH) return hit.a;

  const group = industry ? INDUSTRY_GROUPS.find((g) => g.label === industry)?.values ?? [industry] : null;
  const inScope = src.infos.filter(({ i }) => {
    if (group && !group.includes(shown(i.c.cells.industry) ?? "")) return false;
    if (country && countryOfInfo(i) !== country) return false;
    return true;
  });

  const counts = { hired: 0, notYet: 0, hiring: 0, holders: 0, repeat: 0, anyHire: 0 };
  const open: { row: PreviewRow; at: string; p: PreviewCompany; raw: string | null }[] = [];
  const past: { row: PreviewRow; at: string; rich: number }[] = [];
  const notYet: { row: PreviewRow; at: string; rich: number }[] = [];
  for (const { i, p } of inScope) {
    const { hired, hiring } = i.fnState;
    const openHere = i.engs.filter((e) => isOpenRole(e) && fnOf(e) === fn);
    const seats = i.engs.filter((e) => isHire(e) && fnOf(e) === fn);
    const held = seats.filter((e) => known(e.cells.operator));
    if (hired.includes(fn)) counts.hired++;
    if (hired.includes(fn) && held.length) counts.holders++;
    if (hired.length) counts.anyHire++;
    const none = hired.length > 0 && !hired.includes(fn) && !hiring.includes(fn) && !openHere.length;
    if (none) counts.notYet++;
    if (openHere.length) counts.hiring++;
    if (repeatHirer(i)) counts.repeat++;
    // A company with any open role is hidden in the app, so it is kept back here too while the flag is off.
    const named = src.open || !i.engs.some(isOpenRole);
    const base = {
      seed: p.seed,
      function: fn,
      company: named ? companyOut(i) : null,
      industry: shown(i.c.cells.industry),
      employees: shown(i.c.cells.employees),
      revenue: shown(i.c.cells.revenue),
      country: countryOfInfo(i),
    };
    const rich0 = (base.company?.logo ? 3 : 0) + Number(!!base.industry) + Number(!!base.employees) + Number(!!base.country);
    if (none) {
      if (view !== "notyet") continue;
      const others = hired.filter((f) => f !== "Other");
      const list = others.length ? (others.length > 2 ? `${others.slice(0, 2).join(", ")} and more` : others.join(" and ")) : "other functions";
      const last = i.engs.filter(isHire).map((e) => shown(e.cells.start) ?? "").sort().pop() || null;
      notYet.push({ row: { ...base, kind: "notyet", title: `Hired fractional ${list}`, when: monthOf(last) }, at: last ?? "", rich: rich0 + Math.min(others.length, 3) });
      continue;
    }
    if (view === "notyet") continue;
    // One row per company: its newest open role in this function, else its latest seat in it.
    const role = newestOpen(openHere);
    if (role) {
      const when = role.posted ?? role.opened ?? null;
      const raw = role.cells.role?.s === "value" && !role.cells.role.system ? role.cells.role.v : null;
      open.push({ row: { ...base, kind: "open", title: roleTitle(role, p, fn, src.open), when }, at: when ?? "", p, raw });
      continue;
    }
    if (view === "hiring") continue;
    const seat = held[0] ?? seats[0];
    if (seat) {
      const start = shown(seat.cells.start);
      const row: PreviewRow = { ...base, kind: "hired", title: `Fractional ${fn} seat`, when: monthOf(start), holder: known(seat.cells.operator) };
      // The rows that say the most first: a named company with a logo, a seat holder on file, then industry, size and country filled in.
      const rich = (row.company?.logo ? 3 : 0) + (row.holder ? 4 : 0) + Number(!!row.industry) + Number(!!row.employees) + Number(!!row.country) + Number(!!row.when);
      past.push({ row, at: start ?? "", rich });
    }
  }
  open.sort((a, b) => b.at.localeCompare(a.at));
  past.sort((a, b) => b.rich - a.rich || b.at.localeCompare(a.at));
  notYet.sort((a, b) => b.rich - a.rich || b.at.localeCompare(a.at));
  const all: { row: PreviewRow; p?: PreviewCompany; raw?: string | null }[] = view === "notyet" ? notYet : [...open, ...past];
  const rows = all.slice(0, PREVIEW_ROWS).map((x, n): PreviewRow => {
    if (n < PREVIEW_NAMED) return x.row;
    // Past the named rows: no company, and an open role's title loses any trace of it.
    const title = x.row.kind === "open" && x.p && x.raw ? safeTitle(x.raw, x.p, fn) : x.row.title;
    return { ...x.row, company: null, blur: true, title };
  });

  const a: PreviewAnswer = { fn, view, total: all.length, industry, country, counts, rows, example: src.example, openRoleCompanies: src.open, options: src.options };
  if (answers.size >= ANSWER_MAX) answers.clear();
  answers.set(key, { at: Date.now(), a });
  return a;
}
