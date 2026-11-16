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
export type SortKey = "fit" | "newest" | "name" | "engagements" | "start" | "employees" | "revenue";

export const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "friendly", label: "Fractional friendly" },
  { key: "hiring", label: "Hiring now" },
  { key: "following", label: "Following" },
  { key: "unlocked", label: "Unlocked" },
  { key: "needs", label: "Needs facts" },
];
export const SORTS: { key: SortKey; label: string }[] = [
  { key: "fit", label: "Best fit" },
  { key: "newest", label: "Recently updated" },
  { key: "name", label: "Name" },
  { key: "engagements", label: "Most seats" },
  { key: "start", label: "Latest start" },
  { key: "employees", label: "Most employees" },
  { key: "revenue", label: "Most revenue" },
];
export const RECORD_TYPES: { key: RecordType; label: string }[] = [
  { key: "companies", label: "Companies" },
  { key: "engagements", label: "Seats" },
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
  /** GTM functions with a seat on file here (visible function values), open roles included. */
  fns: string[];
  /**
   * The same functions by what is on file for them: `hired` a fractional seat (or a seat a member
   * added), `hiring` an open role and nothing else yet, `story` only member stories mention it.
   */
  fnState: { hired: string[]; hiring: string[]; story: string[] };
  /** Company-level people, then people tied to an engagement. */
  people: { p: PersonRec; e: EngagementRec | null }[];
  /** The most recent, most informative engagement. */
  latest: EngagementRec | null;
  /** Engagements newest first. */
  engs: EngagementRec[];
  /**
   * Every locked fact at the company (for Unlock all), one entry per purchase: a hidden company's
   * identity also buys the role and posting of each open role there, and an open role's role and
   * posting are one purchase, so the length is what Unlock all costs.
   */
  locked: FactRef[];
  unlockedByMe: boolean;
  /** Hidden company only: industry, size and region, shown in place of the name's subline. */
  teaser: string;
  /** What search reads on a company row: its name, domain and what the member can see there. */
  hay: string;
  /** The company's name and domain alone (search ranks these matches first). */
  nameHay: string;
}

const informative = (e: EngagementRec) => Object.values(e.cells).filter(known).length;

/** Engagement facts that cost a credit (status and hours per week are free). Same list as the gated fields in lib/tableFields.ts. */
export const ENG_GATED = ["role", "operator", "end", "sourced", "rate", "posting"];
const isUnlocked = (c?: Cell) => !!c && c.s === "value" && !c.mine && !c.system;
/**
 * The member spent a credit on this engagement. Their own seat is free to them, and the posting of
 * a role that closed is free for everyone (the link no longer leads to a job), so neither counts.
 */
const engUnlocked = (e: EngagementRec) => !e.yours && ENG_GATED.some((f) => !(f === "posting" && e.closed) && isUnlocked(e.cells[f]));
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

/**
 * An open role for the purpose of buying it: its role and its posting are one purchase (and at a
 * hidden company, Unlock company buys both). A role the scan follows is open until it closes.
 */
export const isOpenRole = (e: EngagementRec) => (e.opened ? !e.closed : isOpenSeat(e));
/** An open role nobody holds yet: it has no start, end, why hired or how sourced. */
export const isUnheldOpenRole = (e: EngagementRec) => isOpenRole(e) && (!e.cells.operator || e.cells.operator.s === "empty");
/** Facts an open role nobody holds can't have yet. Shown as a quiet dash, never "+ Add". */
export const NOT_YET_ON_OPEN_ROLE = ["start", "end", "reason", "sourced"];

/**
 * Why a locked fact in a list row or card is not its own paying control, or null when it is. At
 * a hidden company the row spends only through Unlock company (which also buys the role and the
 * posting of its open roles); its other locks are unlocked in the record. On an open role the
 * posting comes with the role (one purchase), so only the role's lock spends.
 */
export function coverOf(i: CoInfo, e: EngagementRec | null | undefined, field: string): string | null {
  if (i.c.hidden) {
    if (e && isOpenRole(e) && (field === "role" || field === "posting")) return "Comes with the company. Unlock the company for 1 credit and you see its name, the role and the job posting.";
    return "Open the record to unlock this.";
  }
  if (e && field === "posting" && isOpenRole(e) && e.cells.role?.s === "locked") return "Comes with the role. One credit opens the role and its job posting.";
  return null;
}

/** Days a posting was listed, from the first time a scan saw it to the time it came down (at least 1). */
export function listedDays(e: EngagementRec): number {
  const a = e.openedAt ? new Date(e.openedAt) : e.opened ? dayOf(e.opened) : null;
  const b = e.closedAt ? new Date(e.closedAt) : e.closed ? dayOf(e.closed) : null;
  if (!a || !b) return 1;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/**
 * Locked facts on one seat and its people, one entry per purchase. An open role's role and
 * posting are one purchase: the posting is left out while the role is in the list.
 */
export function lockedInEngagement(e: EngagementRec): FactRef[] {
  let own = lockedOf("engagement", e.id, e.cells);
  if (isOpenRole(e) && own.some((t) => t.field === "role")) own = own.filter((t) => t.field !== "posting");
  return [...own, ...e.people.flatMap((p) => lockedOf("contact", p.id, p.cells))];
}

/** Visible text of a cell map, leaving out links and long prose (search should match what a row shows). */
const SEARCH_SKIP = new Set(["website", "linkedin", "about", "posting", "email", "phone", "source"]);
const textOf = (cells: Record<string, Cell>) => Object.entries(cells).flatMap(([k, c]) => (c.s === "value" && !SEARCH_SKIP.has(k) ? [c.v] : []));

/** Domain of a website value ("https://www.acme.com/x" -> "acme.com"). */
const hostOf = (v: string) => v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();

/** A seat's function, when the member can see it. */
const fnOfSeat = (e: EngagementRec) => shown(e.cells.function);
/**
 * A fractional hire on file: a seat a member published or added (whatever its type), or one of a
 * fractional type. Not an open role, and not a job posting that came down with nobody in the seat.
 */
export const isHire = (e: EngagementRec) => {
  if (isOpenRole(e)) return false;
  if (e.source === "Demand scan" && !known(e.cells.operator)) return false;
  const type = shown(e.cells.type);
  return e.source === "Member added" || e.source === "Published engagement" || (!!type && FRACTIONAL_TYPES.includes(type));
};

function infoOf(c: CompanyRec): CoInfo {
  const website = shown(c.cells.website);
  const domain = website ? hostOf(website) : c.iconDomain;
  const engs = engagementsNewest(c);
  const f = c.friendly;
  // What is on file for each function. The server sends open-role functions apart (friendly.hiring)
  // from this round on. Until then they are in friendly.functions, and a seat's own cells tell them apart.
  const openFns = new Set(engs.filter(isOpenRole).map(fnOfSeat).filter((x): x is string => !!x));
  const heldFns = new Set(engs.filter(isHire).map(fnOfSeat).filter((x): x is string => !!x));
  const hired: string[] = [];
  for (const fn of f.functions) if (!hired.includes(fn) && (f.hiring || heldFns.has(fn) || !openFns.has(fn))) hired.push(fn);
  // A seat a member added counts as a hire whatever its type (the server counts it from this round on).
  for (const fn of heldFns) if (!hired.includes(fn)) hired.push(fn);
  const hiring = (f.hiring ?? [...openFns]).filter((fn) => !hired.includes(fn));
  const story: string[] = [];
  for (const e of engs) {
    const fn = fnOfSeat(e);
    if (fn && !hired.includes(fn) && !hiring.includes(fn) && !story.includes(fn)) story.push(fn);
  }
  const fns = [...hired, ...hiring, ...story];
  const people = [...c.people.map((p) => ({ p, e: null })), ...engs.flatMap((e) => e.people.map((p) => ({ p, e })))];
  const latest =
    engs.find((e) => startOf(e)) ??
    [...engs].sort((a, b) => informative(b) - informative(a))[0] ??
    null;
  // A hidden company's website, LinkedIn and About are one unlock: the company itself. That
  // credit also opens the role and the posting of each open role there.
  const coLocked = lockedOf("company", c.id, c.cells).filter((t) => !(c.hidden && ["website", "linkedin", "about"].includes(t.field)));
  const engLocked = engs.flatMap((e) => {
    const all = lockedInEngagement(e);
    return c.hidden && isOpenRole(e) ? all.filter((t) => !(t.entity === "engagement" && (t.field === "role" || t.field === "posting"))) : all;
  });
  const locked = [
    ...(c.hidden ? [{ entity: "company" as const, id: c.id, field: "identity" }] : []),
    ...coLocked,
    ...engLocked,
    ...c.people.flatMap((p) => lockedOf("contact", p.id, p.cells)),
  ];
  const personGated = ["name", "email", "phone", "linkedin"];
  const unlockedByMe =
    !!c.unlocked || engs.some(engUnlocked) || people.some(({ p }) => personGated.some((g) => p.cells[g] && isUnlocked(p.cells[g])));
  const nameHay = [c.name, domain ?? ""].join(" ").toLowerCase();
  const parts: string[] = [nameHay, ...fns, ...textOf(c.cells)];
  for (const e of engs) parts.push(...textOf(e.cells));
  for (const { p } of people) parts.push(...textOf(p.cells));
  const teaser = c.hidden
    ? [shown(c.cells.industry), shown(c.cells.employees) && `${shown(c.cells.employees)} employees`, shown(c.cells.hq)].filter(Boolean).join(" · ")
    : "";
  return { c, domain, fns, fnState: { hired, hiring, story }, people, latest, engs, locked, unlockedByMe, teaser, hay: parts.join(" ").toLowerCase(), nameHay };
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

/** An open role: nobody holds the seat yet. A followed role whose posting came down is no longer one. */
export const isOpenSeat = (e: EngagementRec) => !e.closed && (e.source === "Demand scan" || shown(e.cells.status) === "Open role");

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

/**
 * A plain label for how fractional friendly a company is (the score still sorts). Every tier
 * is an outline chip. The solid ember "Hiring now" chip is the record header's alone (see Fit).
 */
export function fitTier(f: Friendly, engs: number): { label: string; cls: string } {
  if (f.open) return { label: "Hiring now", cls: "t-hiring" };
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
    if (n) return `${n} member stor${n > 1 ? "ies mention" : "y mentions"} them. Add the seat and the score goes up.`;
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
  /** Roles the weekly scan follows: open now, or closed. */
  roleState: string[];
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
  roleState: [],
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
  | "roleState"
  | "source"
  | "relationship";

/** A function a label can name: "Executive" and "Other" are catch-alls, so a sentence says "your function" instead. */
export const namedFn = (fn: string | null) => (fn && fn !== "Other" && fn !== "Executive" ? fn : null);
/** The "No Sales seat yet" filter as the member reads it, in the sidebar and on its chip. */
export const notMineLabel = (fn: string | null) => (namedFn(fn) ? `No ${fn} seat yet` : "No seat in your function yet");

export const TOGGLE_LABEL: Record<ToggleKey, string> = {
  rateKnown: "Rate on file",
  contactKnown: "Hiring contact on file",
  notMine: "No seat in your function yet",
  statusKnown: "Status on file",
  fractionalNamed: "Seat holder on file",
  emailKnown: "Email on file",
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
  reason: "Why they hired",
  pricing: "Pricing",
  roleState: "Open roles",
  fn: "Function",
  type: "Type",
  source: "Source",
  relationship: "Relationship",
};
export const FIT_STEPS = [0, 20, 40, 60, 80];
/** Followed roles by where they stand: the posting is still up, or it came down. */
export const ROLE_STATES = ["Open now", "Closed"];
export const hasRoleDates = (i: CoInfo) => i.engs.some((e) => !!e.opened);
/** A YYYY-MM-DD day as a local date, so the day shown is the day stored. */
export const dayOf = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
/** Days between the first day a posting was seen and the day it came down (at least 1). */
export const daysListed = (opened: string, closed: string) => Math.max(1, Math.round((dayOf(closed).getTime() - dayOf(opened).getTime()) / 86_400_000));

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
  roleState: ROLE_STATES,
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

const personUnlocked = (p: PersonRec) => ["name", "email", "phone", "linkedin"].some((f) => isUnlocked(p.cells[f]));

export function tabTest(tab: Tab, r: Row): boolean {
  const i = r.i;
  switch (tab) {
    case "friendly":
      return friendlyCo(i);
    case "hiring":
      // A seat row (and a person tied to a seat) is in Hiring now when that seat is an open role.
      if (r.e) return isOpenRole(r.e);
      return i.c.friendly.open > 0;
    case "following":
      return i.c.following;
    case "unlocked":
      if (r.p) return personUnlocked(r.p);
      if (r.e) return engUnlocked(r.e) || r.e.people.some(personUnlocked);
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

/**
 * What a search box holds, as words to match. A pasted address loses its https://, www. and
 * path ("https://www.acme.com/about" -> "acme.com").
 */
export function searchWords(q: string): string[] {
  let s = q.toLowerCase().trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#]\S*)?$/);
  if (url && (/^(https?:\/\/|www\.)/.test(s) || /[/?#]/.test(s))) s = url[1];
  else s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return s.split(/\s+/).filter(Boolean);
}

/**
 * What a row shows, for search: the company's name and domain, then that row's own values. A
 * company row also reads its functions, its company facts and what the member can see on its
 * seats and people. Links, emails, phones and the About text are left out.
 */
const rowHay = new WeakMap<Row, string>();
export function hayOf(r: Row): string {
  if (!r.e && !r.p) return r.i.hay;
  let h = rowHay.get(r);
  if (h === undefined) {
    // The company's industry too: the no-results line says search reads companies, functions and industries.
    const parts = [r.i.nameHay, shown(r.i.c.cells.industry) ?? ""];
    if (r.p) parts.push(...textOf(r.p.cells));
    else if (r.e) {
      parts.push(...textOf(r.e.cells));
      for (const p of r.e.people) parts.push(...textOf(p.cells));
    }
    h = parts.join(" ").toLowerCase();
    rowHay.set(r, h);
  }
  return h;
}

export function searchTest(q: string): Test | null {
  const toks = searchWords(q);
  if (!toks.length) return null;
  return (r) => {
    const h = hayOf(r);
    return toks.every((t) => h.includes(t));
  };
}

/** While searching, rows whose company name or domain matches come first (the order is otherwise kept). */
export function rankByQuery(rows: Row[], q: string): Row[] {
  const toks = searchWords(q);
  if (!toks.length) return rows;
  const hit = (r: Row) => (toks.every((t) => r.i.nameHay.includes(t)) ? 0 : 1);
  return rows.map((r, n) => ({ r, n, k: hit(r) })).sort((a, b) => a.k - b.k || a.n - b.n).map((x) => x.r);
}

/* ---------- HQ by place ---------- */

const US_STATES: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado", ct: "connecticut", de: "delaware",
  fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa", ks: "kansas", ky: "kentucky",
  la: "louisiana", me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi", mo: "missouri",
  mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey", nm: "new mexico", ny: "new york",
  nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania", ri: "rhode island",
  sc: "south carolina", sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
  wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia",
};
const COUNTRY_ALIAS: Record<string, string> = { us: "united states", usa: "united states", "u.s.": "united states", "u.s.a.": "united states", uk: "united kingdom" };
/**
 * An HQ as the words of its place, with state codes spelled out: "Venice , Ca" and "Los Angeles,
 * CA" both read "... california". A two-letter part counts as a state only when it stands alone
 * between commas, so "LA" inside "LA Metro" stays as it is.
 */
export function placeWords(v: string): string[] {
  const parts = v.toLowerCase().split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const own = (m: Record<string, string>) => (Object.prototype.hasOwnProperty.call(m, p) ? m[p] : undefined);
    const spelled = own(COUNTRY_ALIAS) ?? (p.length === 2 ? own(US_STATES) : undefined) ?? p;
    out.push(...spelled.split(/[\s.]+/).filter(Boolean));
  }
  return out;
}
const placeCache = new Map<string, Set<string>>();
const placeSet = (v: string) => {
  let s = placeCache.get(v);
  if (!s) {
    s = new Set(placeWords(v));
    placeCache.set(v, s);
  }
  return s;
};
/** An HQ filter: every word of the place the member asked for is in the company's HQ ("california" catches "San Diego, CA"). */
function hqTest(opt: string): Test {
  const want = placeWords(opt);
  return (r) => {
    const v = shown(r.i.c.cells.hq);
    if (!v || !want.length) return false;
    const have = placeSet(v);
    return want.every((w) => have.has(w));
  };
}

/** Tests for one option of a list filter (used for facet counts too). */
export function optionTest(key: ListKey, opt: string): Test {
  switch (key) {
    case "hq":
      return hqTest(opt);
    case "industry":
    case "employees":
    case "revenue":
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
    case "roleState":
      // Open now: the posting was listed at the last clean scan of its board. A role the last scan
      // did not see is still open on file, but in neither chip.
      return (r) => (r.p ? r.i.engs : engsOf(r)).some((e) => !!e.opened && (opt === "Closed" ? !!e.closed : !e.closed && !e.unseen));
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
      // They hired fractionals in other functions, and none in the member's own.
      return (r) => {
        const h = r.i.fnState.hired;
        return !!me.function && h.length > 0 && !h.includes(me.function);
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
const LISTS: ListKey[] = ["industry", "employees", "revenue", "hq", "businessModel", "motion", "dealSize", "salesCycle", "fn", "type", "reason", "pricing", "roleState", "source", "relationship"];

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
        label: k === "roleState" ? (v === "Closed" ? "Role closed" : "Role open now") : `${LIST_LABEL[k]} ${k === "source" ? SOURCE_LABEL[v] ?? v : v}`,
        clear: (x) => ({ ...x, [k]: x[k].filter((y) => y !== v) }),
      });
  if (f.fitMin) out.push({ id: "fit", label: `Fit ${f.fitMin}+`, clear: (x) => ({ ...x, fitMin: 0 }) });
  return out;
}

/* ---------- sorting ---------- */

/**
 * Sort rows. With needsFirst, the rows missing the most facts come first (the Needs facts view).
 * With a search query, rows whose company name or domain matches come first.
 */
export function sortRows(rows: Row[], sort: SortKey, needsFirst = false, q = ""): Row[] {
  const sorted = sortBy(rows, sort, needsFirst);
  return q.trim() ? rankByQuery(sorted, q) : sorted;
}
function sortBy(rows: Row[], sort: SortKey, needsFirst: boolean): Row[] {
  const byName = (a: Row, b: Row) => a.i.c.name.localeCompare(b.i.c.name);
  const score = (r: Row) => r.i.c.friendly.score;
  const updated = (r: Row) => (r.p ? r.i.c.updatedAt : r.e ? r.e.updatedAt ?? r.i.c.updatedAt : r.i.c.updatedAt) ?? "";
  const start = (r: Row) => shown((r.e ?? r.i.latest)?.cells.start) ?? "";
  // A band by its place on the list (bands go up), unknown last.
  const band = (list: string[], f: string) => (r: Row) => {
    const n = list.indexOf(shown(r.i.c.cells[f]) ?? "");
    return n < 0 ? -1 : n;
  };
  const emp = band(RN_EMPLOYEES, "employees");
  const rev = band(RN_REVENUE, "revenue");
  const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
    fit: (a, b) => score(b) - score(a) || b.i.c.engagements.length - a.i.c.engagements.length || start(b).localeCompare(start(a)) || byName(a, b),
    newest: (a, b) => updated(b).localeCompare(updated(a)) || start(b).localeCompare(start(a)) || score(b) - score(a) || byName(a, b),
    name: (a, b) => byName(a, b) || start(b).localeCompare(start(a)),
    engagements: (a, b) => b.i.c.engagements.length - a.i.c.engagements.length || score(b) - score(a) || byName(a, b),
    start: (a, b) => start(b).localeCompare(start(a)) || score(b) - score(a) || byName(a, b),
    employees: (a, b) => emp(b) - emp(a) || score(b) - score(a) || byName(a, b),
    revenue: (a, b) => rev(b) - rev(a) || score(b) - score(a) || byName(a, b),
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
export const seatMissingCount = (e: EngagementRec, me: Me) => seatMissing(e, new Set(me.benchRates.map((b) => b.engagementId))).length;

/** The seats the viewer holds (EngagementRec.yours) and what is still missing on each. */
export function mySeats(infos: CoInfo[], me: Me): SeatInfo[] {
  const priv = new Set(me.benchRates.map((b) => b.engagementId));
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
