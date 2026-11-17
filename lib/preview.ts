/**
 * "Try it" on the landing page: what a signed-out visitor sees for one function, and optionally
 * one industry and one country. Counts, and a few sample rows built only from free facts.
 *
 * What leaves here is a closed list of fields (PreviewRow). It never carries a company's name,
 * website, LinkedIn, logo or About, a person, a seat holder, a hiring contact, a job posting, a
 * seat's rate or any other locked fact. A role title is scrubbed of the company's name and site
 * first (titleWithout), and dropped for a plain "Fractional <function> role" if any trace is left.
 * Each row has an opaque `seed` (an HMAC of the internal id, not the public id) so the page can
 * draw the same blurred made-up name the app draws for a locked company.
 *
 * Answers are kept in memory for a few minutes per (function, industry, country), and rebuilt
 * when the signed-out build changes (lib/table.ts previewCompanies).
 */
import { previewCompanies, type PreviewCompany } from "./table";
import { FUNCTIONS, INDUSTRY_GROUPS, RN_INDUSTRIES } from "./tableFields";
import { titleWithout } from "./scan/clean";
import { countryName, countryOf, deriveAll, isFirm, isHire, isOpenRole, known, repeatHirer, shown, type CoInfo } from "@/app/post/model";
import type { EngagementRec } from "./tableTypes";

/** The most sample rows one answer carries. */
export const PREVIEW_ROWS = 6;
/** A country or an industry shows in the pickers once this many companies are on file there. */
const OPTION_MIN = 3;
/** How long one answer is reused (the source is rebuilt at least hourly on its own). */
const ANSWER_FRESH = 5 * 60 * 1000;
const ANSWER_MAX = 400;

/** Functions a visitor can pick: every function on the table except "Other". */
export const PREVIEW_FUNCTIONS = FUNCTIONS.filter((f) => f !== "Other");

export interface PreviewRow {
  /** Opaque, stable per company. For the blurred made-up name only. */
  seed: string;
  /** "open": an open role now. "hired": a seat in this function that a fractional held. */
  kind: "open" | "hired";
  /** The open role's title without the company in it, or "Fractional <function> seat" for a past seat. */
  title: string;
  function: string;
  /** Open role: the ISO day it was posted (or first seen). Past seat: its start month (YYYY-MM), when known. */
  when: string | null;
  industry: string | null;
  employees: string | null;
  country: string | null;
  /** A past seat whose seat holder is on file (behind a lock in the app). Never who it is. */
  holder?: boolean;
}

export interface PreviewAnswer {
  fn: string;
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
  rows: PreviewRow[];
  /** What the pickers offer (industries and countries with enough companies on file). */
  options: { functions: string[]; industries: string[]; countries: string[] };
}

export class PreviewError extends Error {}

interface Source {
  version: object;
  infos: { i: CoInfo; p: PreviewCompany }[];
  options: PreviewAnswer["options"];
}
let source: Source | null = null;
const answers = new Map<string, { at: number; a: PreviewAnswer }>();

async function sourceNow(): Promise<Source> {
  const { list, version } = await previewCompanies();
  if (source && source.version === version) return source;
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
  source = { version, infos, options: { functions: PREVIEW_FUNCTIONS, industries, countries } };
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

const fnOf = (e: EngagementRec) => shown(e.cells.function);

/** A title with no trace of the company: its name, its site's name, or a domain of its own. */
function safeTitle(raw: string, p: PreviewCompany, fn: string): string {
  const fallback = `Fractional ${fn} role`;
  const t = titleWithout(raw, p.name, p.site, fallback).trim();
  const low = t.toLowerCase();
  const name = p.name.toLowerCase().trim();
  const host = (p.site ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const label = host.split(".")[0];
  if (!t || t.length > 90) return fallback;
  if (name.length >= 3 && low.includes(name)) return fallback;
  if (label.length >= 4 && low.includes(label)) return fallback;
  // A domain or a link of any kind has no place in a title.
  if (/https?:|www\.|\b[a-z0-9-]+\.(com|io|co|ai|net|org|app|dev)\b/i.test(t)) return fallback;
  return t;
}

/** The preview for one function (and optionally one industry and one country). Throws PreviewError on a value not on its list. */
export async function preview(q: { fn?: string | null; industry?: string | null; country?: string | null }): Promise<PreviewAnswer> {
  const src = await sourceNow();
  const fn = pick(q.fn, PREVIEW_FUNCTIONS, "a function") ?? "Sales";
  const industry = pick(q.industry, src.options.industries, "an industry");
  const country = pick(q.country, src.options.countries, "a country");
  const key = `${fn}|${industry ?? ""}|${country ?? ""}`;
  const hit = answers.get(key);
  if (hit && Date.now() - hit.at < ANSWER_FRESH) return hit.a;

  const group = industry ? INDUSTRY_GROUPS.find((g) => g.label === industry)?.values ?? [industry] : null;
  const inScope = src.infos.filter(({ i }) => {
    if (group && !group.includes(shown(i.c.cells.industry) ?? "")) return false;
    if (country) {
      const c = countryOf(i.c);
      if (!c || countryName(c) !== country) return false;
    }
    return true;
  });

  const counts = { hired: 0, notYet: 0, hiring: 0, holders: 0, repeat: 0, anyHire: 0 };
  const open: { row: PreviewRow; at: string }[] = [];
  const past: { row: PreviewRow; at: string; rich: number }[] = [];
  for (const { i, p } of inScope) {
    const { hired, hiring } = i.fnState;
    const openHere = i.engs.filter((e) => isOpenRole(e) && fnOf(e) === fn);
    const seats = i.engs.filter((e) => isHire(e) && fnOf(e) === fn);
    const held = seats.filter((e) => known(e.cells.operator));
    if (hired.includes(fn)) counts.hired++;
    if (hired.includes(fn) && held.length) counts.holders++;
    if (hired.length) counts.anyHire++;
    if (hired.length && !hired.includes(fn) && !hiring.includes(fn) && !openHere.length) counts.notYet++;
    if (openHere.length) counts.hiring++;
    if (repeatHirer(i)) counts.repeat++;
    const base = {
      seed: p.seed,
      function: fn,
      industry: shown(i.c.cells.industry),
      employees: shown(i.c.cells.employees),
      country: (() => {
        const c = countryOf(i.c);
        return c ? countryName(c) : null;
      })(),
    };
    // One row per company: its newest open role in this function, else its latest seat in it.
    const role = [...openHere].sort((a, b) => (b.posted ?? b.opened ?? "").localeCompare(a.posted ?? a.opened ?? ""))[0];
    if (role) {
      const title = role.cells.role?.s === "value" && !role.cells.role.system ? safeTitle(role.cells.role.v, p, fn) : `Fractional ${fn} role`;
      const when = role.posted ?? role.opened ?? null;
      open.push({ row: { ...base, kind: "open", title, when }, at: when ?? "" });
      continue;
    }
    const seat = held[0] ?? seats[0];
    if (seat) {
      const start = shown(seat.cells.start);
      const row: PreviewRow = { ...base, kind: "hired", title: `Fractional ${fn} seat`, when: start && /^\d{4}-\d{2}/.test(start) ? start.slice(0, 7) : null, holder: known(seat.cells.operator) };
      // The rows that say the most first: a seat holder on file, then industry, size and country filled in.
      const rich = (row.holder ? 4 : 0) + Number(!!row.industry) + Number(!!row.employees) + Number(!!row.country) + Number(!!row.when);
      past.push({ row, at: start ?? "", rich });
    }
  }
  open.sort((a, b) => b.at.localeCompare(a.at));
  past.sort((a, b) => b.rich - a.rich || b.at.localeCompare(a.at));
  const rows = [...open, ...past].slice(0, PREVIEW_ROWS).map((x) => x.row);

  const a: PreviewAnswer = { fn, industry, country, counts, rows, options: src.options };
  if (answers.size >= ANSWER_MAX) answers.clear();
  answers.set(key, { at: Date.now(), a });
  return a;
}
