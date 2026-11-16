/**
 * Client-side read model for the Trading Post app: per-company derived info, rows for the
 * three record types, filters (with facet counts), views and sorting. Pure functions only.
 *
 * Locked fields are never filtered by value, only by availability: "known" means the cell is
 * locked (someone added it) or visible.
 */
import type { Cell, CompanyRec, EngagementRec, Friendly, Me, PersonRec } from "@/lib/tableTypes";
import {
  BUSINESS_MODELS, ENGAGEMENT_TYPES, FRACTIONAL_TYPES, FUNCTIONS, HIRE_REASONS, PRICING_MODELS, RELATIONSHIPS, RN_DEAL_SIZES, RN_EMPLOYEES, RN_INDUSTRIES,
  RN_MOTIONS, RN_REVENUE, RN_SALES_CYCLES, SOURCE_LABEL, type Entity,
} from "@/lib/tableFields";

export type RecordType = "companies" | "engagements" | "people";
export type Tab = "all" | "friendly" | "hiring" | "following" | "unlocked" | "needs";
export type SortKey = "fit" | "newest" | "name" | "engagements";

export const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "friendly", label: "Fractional friendly" },
  { key: "hiring", label: "Hiring now" },
  { key: "following", label: "Following" },
  { key: "unlocked", label: "Unlocked by me" },
  { key: "needs", label: "Needs facts" },
];
export const SORTS: { key: SortKey; label: string }[] = [
  { key: "fit", label: "Fit" },
  { key: "newest", label: "Newest intel" },
  { key: "name", label: "Name" },
  { key: "engagements", label: "Most engagements" },
];
export const RECORD_TYPES: { key: RecordType; label: string }[] = [
  { key: "companies", label: "Companies" },
  { key: "engagements", label: "Engagements" },
  { key: "people", label: "People" },
];

/* ---------- cells ---------- */

export const known = (c: Cell | undefined) => !!c && (c.s === "locked" || c.s === "value");
export const shown = (c: Cell | undefined): string | null => (c && c.s === "value" ? c.v : null);
export const cellKey = (id: string, field: string) => `${id}.${field}`;
export interface FactRef {
  entity: Entity;
  id: string;
  field: string;
}

/* ---------- derived company info ---------- */

export interface CoInfo {
  c: CompanyRec;
  /** Domain to show (the website, else the logo domain). */
  domain: string | null;
  /** GTM functions with a seat on file here (visible function values). */
  fns: string[];
  /** Company-level people, then people tied to an engagement. */
  people: { p: PersonRec; e: EngagementRec | null }[];
  /** The most recent, most informative engagement. */
  latest: EngagementRec | null;
  /** Engagements newest first. */
  engs: EngagementRec[];
  /** Every locked fact at the company (for Unlock all). */
  locked: FactRef[];
  unlockedByMe: boolean;
  /** Hidden company only: industry, size and region, shown in place of the name's subline. */
  teaser: string;
  hay: string;
}

const informative = (e: EngagementRec) => Object.values(e.cells).filter(known).length;
const startOf = (e: EngagementRec) => shown(e.cells.start) ?? "";

export function engagementsNewest(c: CompanyRec): EngagementRec[] {
  return [...c.engagements].sort((a, b) => {
    const sa = startOf(a);
    const sb = startOf(b);
    if (sa !== sb) return sb.localeCompare(sa);
    const ua = a.updatedAt ?? "";
    const ub = b.updatedAt ?? "";
    if (ua !== ub) return ub.localeCompare(ua);
    return informative(b) - informative(a);
  });
}

export function lockedOf(entity: Entity, id: string, cells: Record<string, Cell>): FactRef[] {
  return Object.entries(cells)
    .filter(([, c]) => c.s === "locked")
    .map(([field]) => ({ entity, id, field }));
}

export function lockedInEngagement(e: EngagementRec): FactRef[] {
  return [...lockedOf("engagement", e.id, e.cells), ...e.people.flatMap((p) => lockedOf("contact", p.id, p.cells))];
}

function infoOf(c: CompanyRec): CoInfo {
  const website = shown(c.cells.website);
  const domain = website ? website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : c.iconDomain;
  const engs = engagementsNewest(c);
  const fns: string[] = [];
  for (const fn of c.friendly.functions) if (!fns.includes(fn)) fns.push(fn);
  for (const e of engs) {
    const fn = shown(e.cells.function);
    if (fn && !fns.includes(fn)) fns.push(fn);
  }
  const people = [...c.people.map((p) => ({ p, e: null })), ...engs.flatMap((e) => e.people.map((p) => ({ p, e })))];
  const latest =
    engs.find((e) => startOf(e)) ??
    [...engs].sort((a, b) => informative(b) - informative(a))[0] ??
    null;
  // A hidden company's website, LinkedIn and About are one unlock: the company itself.
  const coLocked = lockedOf("company", c.id, c.cells).filter((t) => !(c.hidden && ["website", "linkedin", "about"].includes(t.field)));
  const locked = [
    ...(c.hidden ? [{ entity: "company" as const, id: c.id, field: "identity" }] : []),
    ...coLocked,
    ...engs.flatMap(lockedInEngagement),
    ...c.people.flatMap((p) => lockedOf("contact", p.id, p.cells)),
  ];
  const isUnlocked = (cell: Cell) => cell.s === "value" && !cell.mine && !cell.system;
  const gatedFields = ["role", "status", "operator", "end", "sourced", "rate", "hours", "posting"];
  const personGated = ["name", "email", "phone", "linkedin"];
  const unlockedByMe =
    engs.some((e) => gatedFields.some((f) => e.cells[f] && isUnlocked(e.cells[f]))) ||
    people.some(({ p }) => personGated.some((f) => p.cells[f] && isUnlocked(p.cells[f])));
  const parts: string[] = [c.name, domain ?? "", ...fns];
  for (const cell of Object.values(c.cells)) if (cell.s === "value") parts.push(cell.v);
  for (const e of engs) {
    parts.push(SOURCE_LABEL[e.source] ?? e.source);
    for (const cell of Object.values(e.cells)) if (cell.s === "value") parts.push(cell.v);
  }
  for (const { p } of people) for (const cell of Object.values(p.cells)) if (cell.s === "value") parts.push(cell.v);
  const teaser = c.hidden
    ? [shown(c.cells.industry), shown(c.cells.employees) && `${shown(c.cells.employees)} employees`, shown(c.cells.hq)].filter(Boolean).join(" · ")
    : "";
  return { c, domain, fns, people, latest, engs, locked, unlockedByMe, teaser, hay: parts.join(" ").toLowerCase() };
}

/** Derived info per company object. A patched view keeps unchanged companies, so their info (and rows) keep identity too. */
const infoCache = new WeakMap<CompanyRec, CoInfo>();
export function deriveAll(companies: CompanyRec[]): CoInfo[] {
  return companies.map((c) => {
    let i = infoCache.get(c);
    if (!i) {
      i = infoOf(c);
      infoCache.set(c, i);
    }
    return i;
  });
}

/** An open role: nobody holds the seat yet. */
export const isOpenSeat = (e: EngagementRec) => e.source === "Demand scan" || shown(e.cells.status) === "Open role";

/**
 * Fractional seats (open roles included) that started in the last two years. The server sends
 * this as friendly.recent; until it does, it is worked out here from the free start and type.
 */
export function recentSeats(i: CoInfo): number {
  if (typeof i.c.friendly.recent === "number") return i.c.friendly.recent;
  const cutoff = Date.now() - 2 * 365 * 86_400_000;
  return i.engs.filter((e) => {
    const start = shown(e.cells.start);
    if (!start || Date.parse(`${start}-01`) < cutoff) return false;
    const type = shown(e.cells.type);
    return isOpenSeat(e) || e.source === "Published engagement" || (!!type && FRACTIONAL_TYPES.includes(type));
  }).length;
}

/** A plain label for how fractional friendly a company is (the score still sorts). */
export function fitTier(f: Friendly, engs: number): { label: string; cls: string } {
  if (f.open) return { label: "Hiring", cls: "chip-ember" };
  if (f.fractional >= 2 || f.functions.length >= 2) return { label: "Repeat hirer", cls: "t-repeat" };
  if (f.recent) return { label: "Recent seat", cls: "t-recent" };
  if (f.fractional) return { label: "Past seat", cls: "t-past" };
  if (engs > 0) return { label: "Story only", cls: "t-story" };
  return { label: "No seats", cls: "t-none" };
}

/** One line on why a company scores the way it does. */
export function fitReason(i: CoInfo): string {
  const f = i.c.friendly;
  const seats = f.fractional;
  const fns = f.functions.length;
  const bits: string[] = [];
  if (seats) bits.push(`${seats} fractional seat${seats > 1 ? "s" : ""}${fns > 1 ? ` across ${fns} functions` : fns === 1 ? ` in ${f.functions[0]}` : ""}`);
  if (f.open) bits.push(`${f.open} open role${f.open > 1 ? "s" : ""} now`);
  if (!bits.length) {
    const n = i.c.engagements.length;
    if (n) return `${n} member stor${n > 1 ? "ies" : "y"} on file. Add the seat details to raise the score.`;
    return "No seats on file yet.";
  }
  return bits.join(", ");
}

/* ---------- filters ---------- */

export interface Filters {
  rateKnown: boolean;
  contactKnown: boolean;
  notMine: boolean;
  industry: string[];
  employees: string[];
  revenue: string[];
  hq: string[];
  businessModel: string[];
  motion: string[];
  dealSize: string[];
  salesCycle: string[];
  reason: string[];
  pricing: string[];
  fitMin: number;
  fn: string[];
  type: string[];
  statusKnown: boolean;
  source: string[];
  fractionalNamed: boolean;
  emailKnown: boolean;
  relationship: string[];
}

export const EMPTY_FILTERS: Filters = {
  rateKnown: false,
  contactKnown: false,
  notMine: false,
  industry: [],
  employees: [],
  revenue: [],
  hq: [],
  businessModel: [],
  motion: [],
  dealSize: [],
  salesCycle: [],
  reason: [],
  pricing: [],
  fitMin: 0,
  fn: [],
  type: [],
  statusKnown: false,
  source: [],
  fractionalNamed: false,
  emailKnown: false,
  relationship: [],
};

export type ToggleKey = "rateKnown" | "contactKnown" | "notMine" | "statusKnown" | "fractionalNamed" | "emailKnown";
export type ListKey =
  | "industry"
  | "employees"
  | "revenue"
  | "hq"
  | "businessModel"
  | "motion"
  | "dealSize"
  | "salesCycle"
  | "fn"
  | "type"
  | "reason"
  | "pricing"
  | "source"
  | "relationship";

export const TOGGLE_LABEL: Record<ToggleKey, string> = {
  rateKnown: "Rate known",
  contactKnown: "Contact known",
  notMine: "No seat in my function yet",
  statusKnown: "Status known",
  fractionalNamed: "Seat holder named",
  emailKnown: "Email known",
};
export const LIST_LABEL: Record<ListKey, string> = {
  industry: "Industry",
  employees: "Employees",
  revenue: "Revenue",
  hq: "HQ",
  businessModel: "Business model",
  motion: "Sales motion",
  dealSize: "Deal size",
  salesCycle: "Sales cycle",
  reason: "Why hired",
  pricing: "Pricing",
  fn: "Function",
  type: "Type",
  source: "Source",
  relationship: "Relationship",
};
export const FIT_STEPS = [0, 20, 40, 60, 80];

export const LIST_OPTIONS: Record<Exclude<ListKey, "hq">, string[]> = {
  industry: RN_INDUSTRIES,
  employees: RN_EMPLOYEES,
  revenue: RN_REVENUE,
  businessModel: BUSINESS_MODELS,
  motion: RN_MOTIONS,
  dealSize: RN_DEAL_SIZES,
  salesCycle: RN_SALES_CYCLES,
  reason: HIRE_REASONS,
  pricing: PRICING_MODELS,
  fn: FUNCTIONS,
  type: ENGAGEMENT_TYPES,
  source: Object.keys(SOURCE_LABEL),
  relationship: RELATIONSHIPS,
};

/** A row of the current record type. */
export interface Row {
  key: string;
  i: CoInfo;
  e?: EngagementRec | null;
  p?: PersonRec;
}

const rowCache: Record<RecordType, WeakMap<CoInfo, Row[]>> = { companies: new WeakMap(), engagements: new WeakMap(), people: new WeakMap() };
export function rowsFor(type: RecordType, infos: CoInfo[]): Row[] {
  const cache = rowCache[type];
  return infos.flatMap((i) => {
    let rs = cache.get(i);
    if (!rs) {
      rs =
        type === "companies"
          ? [{ key: i.c.id, i }]
          : type === "engagements"
            ? i.engs.map((e) => ({ key: e.id, i, e }))
            : i.people.map(({ p, e }) => ({ key: p.id, i, e, p }));
      cache.set(i, rs);
    }
    return rs;
  });
}

const engsOf = (r: Row) => (r.e ? [r.e] : r.p ? [] : r.i.engs);
const peopleOf = (r: Row) => (r.p ? [r.p] : r.e ? r.e.people : r.i.people.map((x) => x.p));
const personKnown = (p: PersonRec) => ["name", "email", "phone", "linkedin"].some((f) => known(p.cells[f]));

export function friendlyCo(i: CoInfo) {
  return i.c.friendly.open > 0 || i.c.friendly.tier === "High" || i.c.friendly.tier === "Medium";
}

const isUnlocked = (c?: Cell) => !!c && c.s === "value" && !c.mine && !c.system;
const personUnlocked = (p: PersonRec) => ["name", "email", "phone", "linkedin"].some((f) => isUnlocked(p.cells[f]));

export function tabTest(tab: Tab, r: Row): boolean {
  const i = r.i;
  switch (tab) {
    case "friendly":
      return friendlyCo(i);
    case "hiring":
      return i.c.friendly.open > 0;
    case "following":
      return i.c.following;
    case "unlocked":
      if (r.p) return personUnlocked(r.p);
      if (r.e) return ["role", "status", "operator", "end", "sourced", "rate", "hours", "posting"].some((f) => isUnlocked(r.e!.cells[f])) || r.e.people.some(personUnlocked);
      return i.unlockedByMe;
    case "needs":
      return COMPANY_FILL.some((f) => i.c.cells[f]?.s === "empty");
    default:
      return true;
  }
}

type Test = (r: Row) => boolean;
interface Clause {
  group: string;
  test: Test;
}

export function searchTest(q: string): Test | null {
  const toks = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  // Engagement and people values are part of the company haystack.
  return (r) => toks.every((t) => r.i.hay.includes(t));
}

/** Tests for one option of a list filter (used for facet counts too). */
export function optionTest(key: ListKey, opt: string): Test {
  switch (key) {
    case "industry":
    case "employees":
    case "revenue":
    case "hq":
    case "businessModel":
    case "motion":
    case "dealSize":
    case "salesCycle":
      return (r) => shown(r.i.c.cells[key]) === opt;
    case "reason":
    case "pricing":
      return (r) => (r.p ? r.i.engs : engsOf(r)).some((e) => shown(e.cells[key]) === opt);
    case "fn":
      return (r) => (r.e ? shown(r.e.cells.function) === opt : r.p ? r.i.fns.includes(opt) : r.i.fns.includes(opt));
    case "type":
      return (r) => (r.p ? r.i.engs : engsOf(r)).some((e) => shown(e.cells.type) === opt);
    case "source":
      return (r) => (r.p ? r.p.source === opt : engsOf(r).some((e) => e.source === opt));
    case "relationship":
      return (r) => peopleOf(r).some((p) => shown(p.cells.relationship) === opt);
  }
}

export function toggleTest(key: ToggleKey, me: Me): Test {
  switch (key) {
    case "rateKnown":
      return (r) => (r.p ? r.i.engs : engsOf(r)).some((e) => known(e.cells.rate));
    case "contactKnown":
      return (r) => peopleOf(r).some(personKnown);
    case "notMine":
      return (r) => {
        const f = r.i.c.friendly;
        return !!me.function && f.functions.length > 0 && !f.functions.includes(me.function) && (f.fractional > 0 || f.open > 0);
      };
    case "statusKnown":
      return (r) => (r.p ? r.i.engs : engsOf(r)).some((e) => known(e.cells.status));
    case "fractionalNamed":
      return (r) => (r.p ? r.i.engs : engsOf(r)).some((e) => known(e.cells.operator));
    case "emailKnown":
      return (r) => peopleOf(r).some((p) => known(p.cells.email));
  }
}

const TOGGLES: ToggleKey[] = ["rateKnown", "contactKnown", "notMine", "statusKnown", "fractionalNamed", "emailKnown"];
const LISTS: ListKey[] = ["industry", "employees", "revenue", "hq", "businessModel", "motion", "dealSize", "salesCycle", "fn", "type", "reason", "pricing", "source", "relationship"];

function clauses(f: Filters, tab: Tab, q: string, me: Me): Clause[] {
  const out: Clause[] = [];
  if (tab !== "all") out.push({ group: "tab", test: (r) => tabTest(tab, r) });
  const st = searchTest(q);
  if (st) out.push({ group: "search", test: st });
  for (const k of TOGGLES) if (f[k]) out.push({ group: k, test: toggleTest(k, me) });
  for (const k of LISTS) {
    const sel = f[k];
    if (sel.length) {
      const tests = sel.map((o) => optionTest(k, o));
      out.push({ group: k, test: (r) => tests.some((t) => t(r)) });
    }
  }
  if (f.fitMin > 0) out.push({ group: "fitMin", test: (r) => r.i.c.friendly.score >= f.fitMin });
  return out;
}

const pass = (r: Row, cs: Clause[], except?: string) => cs.every((c) => c.group === except || c.test(r));

export interface Facets {
  toggles: Record<ToggleKey, number>;
  lists: Record<ListKey, Record<string, number>>;
  fit: Record<number, number>;
  tabs: Record<Tab, number>;
}

/** Filtered rows plus counts for every filter option (each group counted with its own selection lifted). */
export function applyFilters(rows: Row[], f: Filters, tab: Tab, q: string, me: Me): { rows: Row[]; facets: Facets } {
  const cs = clauses(f, tab, q, me);
  const result = rows.filter((r) => pass(r, cs));
  const toggles = {} as Record<ToggleKey, number>;
  for (const k of TOGGLES) {
    const t = toggleTest(k, me);
    let n = 0;
    for (const r of rows) if (pass(r, cs, k) && t(r)) n++;
    toggles[k] = n;
  }
  const lists = {} as Record<ListKey, Record<string, number>>;
  for (const k of LISTS) {
    const base = rows.filter((r) => pass(r, cs, k));
    const counts: Record<string, number> = {};
    if (k === "hq") {
      for (const r of base) {
        const v = shown(r.i.c.cells.hq);
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
    } else {
      for (const opt of LIST_OPTIONS[k]) {
        const t = optionTest(k, opt);
        let n = 0;
        for (const r of base) if (t(r)) n++;
        counts[opt] = n;
      }
    }
    lists[k] = counts;
  }
  const fitBase = rows.filter((r) => pass(r, cs, "fitMin"));
  const fit: Record<number, number> = {};
  for (const s of FIT_STEPS) fit[s] = fitBase.filter((r) => r.i.c.friendly.score >= s).length;
  const tabBase = rows.filter((r) => pass(r, cs, "tab"));
  const tabs = {} as Record<Tab, number>;
  for (const t of TABS) tabs[t.key] = t.key === "all" ? tabBase.length : tabBase.filter((r) => tabTest(t.key, r)).length;
  return { rows: result, facets: { toggles, lists, fit, tabs } };
}

export function activeCount(f: Filters): number {
  let n = 0;
  for (const k of TOGGLES) if (f[k]) n++;
  for (const k of LISTS) n += f[k].length;
  if (f.fitMin) n++;
  return n;
}

/** Removable chips for the active filters. */
export function activeChips(f: Filters): { id: string; label: string; clear: (f: Filters) => Filters }[] {
  const out: { id: string; label: string; clear: (f: Filters) => Filters }[] = [];
  for (const k of TOGGLES) if (f[k]) out.push({ id: k, label: TOGGLE_LABEL[k], clear: (x) => ({ ...x, [k]: false }) });
  for (const k of LISTS)
    for (const v of f[k])
      out.push({
        id: `${k}:${v}`,
        label: `${LIST_LABEL[k]} ${k === "source" ? SOURCE_LABEL[v] ?? v : v}`,
        clear: (x) => ({ ...x, [k]: x[k].filter((y) => y !== v) }),
      });
  if (f.fitMin) out.push({ id: "fit", label: `Fit ${f.fitMin}+`, clear: (x) => ({ ...x, fitMin: 0 }) });
  return out;
}

/* ---------- sorting ---------- */

/** Sort rows. With needsFirst, the rows missing the most facts come first (the Needs facts view). */
export function sortRows(rows: Row[], sort: SortKey, needsFirst = false): Row[] {
  const byName = (a: Row, b: Row) => a.i.c.name.localeCompare(b.i.c.name);
  const score = (r: Row) => r.i.c.friendly.score;
  const updated = (r: Row) => (r.p ? r.i.c.updatedAt : r.e ? r.e.updatedAt ?? r.i.c.updatedAt : r.i.c.updatedAt) ?? "";
  const start = (r: Row) => shown((r.e ?? r.i.latest)?.cells.start) ?? "";
  const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
    fit: (a, b) => score(b) - score(a) || b.i.c.engagements.length - a.i.c.engagements.length || start(b).localeCompare(start(a)) || byName(a, b),
    newest: (a, b) => updated(b).localeCompare(updated(a)) || start(b).localeCompare(start(a)) || score(b) - score(a) || byName(a, b),
    name: (a, b) => byName(a, b) || start(b).localeCompare(start(a)),
    engagements: (a, b) => b.i.c.engagements.length - a.i.c.engagements.length || score(b) - score(a) || byName(a, b),
  };
  const by = cmp[sort];
  return [...rows].sort(needsFirst ? (a, b) => b.i.c.facts.missing - a.i.c.facts.missing || by(a, b) : by);
}

/* ---------- facts to add ---------- */

export const COMPANY_FILL = ["website", "industry", "employees", "revenue", "hq", "linkedin"];
export const ENG_FIELDS = ["role", "status", "operator", "start", "end", "reason", "sourced", "pricing", "rate", "hours", "posting", "revenue", "employees"];
/** How the company sells (Revenue Nomad's standard lists), shown as its own block. */
export const COMPANY_GTM = ["businessModel", "motion", "dealSize", "salesCycle"];

/* ---------- your seats ---------- */

/** What a seat holder is asked for on their own seat, in the order the Your seats page asks. */
export const SEAT_ASK = ["function", "role", "type", "status", "start", "end", "reason", "sourced", "pricing", "rate", "hours", "revenue", "employees"];

export interface SeatInfo {
  i: CoInfo;
  e: EngagementRec;
  /** Facts still empty on the seat (the rate is not missing once it was shared for the benchmarks only). */
  missing: string[];
  /** Empty "How they sell" facts at the company, listed under the member's first seat there. */
  coMissing: string[];
}

/** Facts still empty on a seat. `priv` holds the seats whose rate the member shared for the benchmarks only. */
const seatMissing = (e: EngagementRec, priv: Set<string | null>) => SEAT_ASK.filter((f) => e.cells[f]?.s === "empty" && !(f === "rate" && priv.has(e.id)));
/** How many facts the member can still add on one of their own seats. */
export const seatMissingCount = (e: EngagementRec, me: Me) => seatMissing(e, new Set((me.benchRates ?? []).map((b) => b.engagementId))).length;

/** The seats the viewer holds (EngagementRec.yours) and what is still missing on each. */
export function mySeats(infos: CoInfo[], me: Me): SeatInfo[] {
  const priv = new Set((me.benchRates ?? []).map((b) => b.engagementId));
  const out: SeatInfo[] = [];
  for (const i of infos) {
    let first = true;
    for (const e of i.engs) {
      if (!e.yours) continue;
      const missing = seatMissing(e, priv);
      const coMissing = first && !i.c.hidden ? COMPANY_GTM.filter((f) => i.c.cells[f]?.s === "empty") : [];
      first = false;
      out.push({ i, e, missing, coMissing });
    }
  }
  return out;
}

/** Facts a member can still add across their seats. */
export const seatsMissing = (seats: SeatInfo[]) => seats.reduce((n, s) => n + s.missing.length + s.coMissing.length, 0);

/** Open roles in a function first seen in the last 7 days, and how many of their companies are still hidden. */
export function newRolesFor(infos: CoInfo[], fn: string | null): { roles: number; hidden: number } {
  if (!fn) return { roles: 0, hidden: 0 };
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  let roles = 0;
  let hidden = 0;
  for (const i of infos) {
    const n = i.engs.filter((e) => !!e.opened && !e.closed && e.opened >= since && shown(e.cells.function) === fn).length;
    if (!n) continue;
    roles += n;
    if (i.c.hidden) hidden++;
  }
  return { roles, hidden };
}
