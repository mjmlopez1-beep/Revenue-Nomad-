/**
 * Client-side read model for the Merlin app: per-company derived info, rows for the
 * three record types, filters (with facet counts), views and sorting. Pure functions only.
 *
 * Locked fields are never filtered by value, only by availability: "known" means the cell is
 * locked (someone added it) or visible.
 */
import type { Cell, CompanyRec, EngagementRec, Friendly, Icp, Me, PersonRec } from "@/lib/tableTypes";
import {
  BUSINESS_MODELS, ENGAGEMENT_TYPES, FRACTIONAL_TYPES, FUNCTIONS, HIRE_REASONS, PRICING_MODELS, RELATIONSHIPS, RN_DEAL_SIZES, RN_EMPLOYEES, RN_INDUSTRIES,
  RN_MOTIONS, RN_REVENUE, RN_SALES_CYCLES, SOURCE_LABEL, type Entity,
  REFERRAL_BONUS, INDUSTRY_GROUPS, industryWords, PERSON_BUNDLE,
} from "@/lib/tableFields";
import { normalizeHq } from "@/lib/geo";

export type RecordType = "companies" | "engagements" | "people";
export type Tab = "all" | "repeat" | "hiring" | "following" | "unlocked" | "needs";
export type SortKey = "best" | "fit" | "newest" | "name" | "engagements" | "start" | "employees" | "revenue" | "fn" | "title" | "hq";

/** `hint` is the tab's one line of explanation (its tooltip). */
export const TABS: { key: Tab; label: string; hint?: string }[] = [
  { key: "all", label: "All" },
  { key: "repeat", label: "Repeat hirers", hint: "Companies with 2 or more fractional hires on file, or hires in 2 or more functions. Open roles don't count as hires." },
  { key: "hiring", label: "Hiring now" },
  { key: "following", label: "Following" },
  { key: "unlocked", label: "Unlocked" },
];
export const SORTS: { key: SortKey; label: string }[] = [
  { key: "best", label: "Best fit for you" },
  { key: "fit", label: "Most fractional-friendly" },
  { key: "newest", label: "Recently updated" },
  { key: "name", label: "Company name" },
  { key: "engagements", label: "Most seats" },
  { key: "start", label: "Latest start" },
  { key: "fn", label: "Function" },
  { key: "title", label: "Title" },
  { key: "employees", label: "Most employees" },
  { key: "revenue", label: "Most revenue" },
  { key: "hq", label: "HQ" },
];
/** The sorts that mean something for each list: a seat sorts by its own start and function, a person by their title. */
const SORTS_BY_TYPE: Record<RecordType, SortKey[]> = {
  companies: ["best", "fit", "newest", "name", "engagements", "start", "employees", "revenue", "hq"],
  engagements: ["best", "fit", "newest", "name", "start", "fn", "employees", "revenue"],
  people: ["best", "fit", "newest", "name", "title", "hq"],
};
export const sortsFor = (t: RecordType) => SORTS.filter((s) => SORTS_BY_TYPE[t].includes(s.key));
/** A sort the list can't use (Most seats, carried over to People) reads as Best fit there. */
export const sortFor = (t: RecordType, s: SortKey): SortKey => (SORTS_BY_TYPE[t].includes(s) ? s : "fit");
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
   * identity also buys the role, posting and rate of each open role there, and an open role's
   * role, posting and rate are one purchase, so the length is what Unlock all costs.
   */
  locked: FactRef[];
  unlockedByMe: boolean;
  /** Hidden company only: industry, size and region, shown in place of the name's subline. */
  teaser: string;
  /** What search reads on a company row: its name, domain and what the member can see there. */
  hay: string;
  /** The company's About text (lowercase), when the member can see it. Matched by word start. */
  aboutHay: string;
  /** The company's name and domain alone (search ranks these matches first). */
  nameHay: string;
}

const informative = (e: EngagementRec) => Object.values(e.cells).filter(known).length;

/** Engagement facts that cost a credit (status and hours per week are free). Same list as the gated fields in lib/tableFields.ts. */
export const ENG_GATED = ["role", "operator", "end", "sourced", "rate", "posting"];
/** The member paid a credit to see this value. A free value (an open role's title, a posting, our records' system facts) never counts. */
const isUnlocked = (c?: Cell) => !!c && c.s === "value" && !!c.paid;
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

/**
 * Locked facts on one record, one entry per purchase. A person's name and title are one purchase,
 * so only the first of them still locked is in the list.
 */
export function lockedOf(entity: Entity, id: string, cells: Record<string, Cell>): FactRef[] {
  const lead = entity === "contact" ? personLead(cells) : null;
  return Object.entries(cells)
    .filter(([field, c]) => c.s === "locked" && !(entity === "contact" && PERSON_BUNDLE.includes(field) && field !== lead))
    .map(([field]) => ({ entity, id, field }));
}

/** The one lock that spends for a person's name and title: the first of the two still locked. */
export const personLead = (cells: Record<string, Cell>) => PERSON_BUNDLE.find((f) => cells[f]?.s === "locked") ?? null;
/** Both a person's name and title are locked: one lock opens the two, so its label says "name and title". */
export const personBothLocked = (cells: Record<string, Cell>) => PERSON_BUNDLE.every((f) => cells[f]?.s === "locked");
/** What the lock on a person's name or title says it opens: "name and title" while both are locked. */
export const personNoun = (cells: Record<string, Cell>, field: string) => (PERSON_BUNDLE.includes(field) && personBothLocked(cells) ? "name and title" : undefined);

/**
 * An open role for the purpose of buying it: its role, its posting and its posted rate are one
 * purchase (and at a hidden company, Unlock company buys all three). A role the scan follows is
 * open until it closes.
 */
export const isOpenRole = (e: EngagementRec) => (e.opened ? !e.closed : isOpenSeat(e));
/** What one credit opens on an open role, together. Same list as BUNDLE_FIELDS in lib/table.ts. */
export const OPEN_ROLE_BUNDLE = ["posting", "rate"];
/** The one lock that spends for an open role: the first of its role, posting and rate still locked. */
export const bundleLead = (e: EngagementRec) => OPEN_ROLE_BUNDLE.find((f) => e.cells[f]?.s === "locked") ?? null;
/** An open role nobody holds yet: it has no start, end, why hired or how sourced. */
export const isUnheldOpenRole = (e: EngagementRec) => isOpenRole(e) && (!e.cells.operator || e.cells.operator.s === "empty");
/** Facts an open role nobody holds can't have yet. Shown as a quiet dash, never "+ Add". */
export const NOT_YET_ON_OPEN_ROLE = ["start", "end", "reason", "sourced"];

/**
 * Why a locked fact in a list row or card is not its own paying control, or null when it is. At
 * a hidden company the row spends only through Unlock company (which also buys the role, the
 * posting and the posted rate of its open roles); its other locks are unlocked in the record. On
 * an open role the role, posting and rate are one purchase, so only the first lock spends.
 */
export function coverOf(i: CoInfo, e: EngagementRec | null | undefined, field: string): string | null {
  if (i.c.hidden) {
    if (e && isOpenRole(e) && OPEN_ROLE_BUNDLE.includes(field))
      return "Comes with the company. Unlock the company for 1 credit and you see its name, the job posting and the posted rate.";
    return "Open the record to unlock this.";
  }
  if (e && isOpenRole(e) && OPEN_ROLE_BUNDLE.includes(field) && bundleLead(e) !== field) return "Comes with this open role. One credit opens the job posting and the posted rate.";
  return null;
}

/**
 * Why a person's locked fact in a list row or card is not its own paying control, or null when it
 * is: the rules of coverOf, and a person's title comes with their name (one credit opens both),
 * so while both are locked only the name's lock spends and the title is a quiet lock.
 */
export function personCoverOf(i: CoInfo, e: EngagementRec | null | undefined, p: PersonRec, field: string): string | null {
  const base = coverOf(i, e, field);
  if (base) return base;
  if (PERSON_BUNDLE.includes(field) && p.cells[field]?.s === "locked" && personLead(p.cells) !== field) return "Comes with the name. One credit opens the name and the title.";
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
 * Locked facts on one seat and its people, one entry per purchase. An open role's role, posting
 * and rate are one purchase: only the first of them still locked is in the list.
 */
export function lockedInEngagement(e: EngagementRec): FactRef[] {
  let own = lockedOf("engagement", e.id, e.cells);
  const lead = isOpenRole(e) ? bundleLead(e) : null;
  if (lead) own = own.filter((t) => t.field === lead || !OPEN_ROLE_BUNDLE.includes(t.field));
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
 * A fractional hire on file: any seat, whatever its source (a member's story, a published
 * engagement, a seat seen on LinkedIn), unless its type says it was full-time. Not an open role,
 * and not a job posting that came down with nobody in the seat.
 */
export const isHire = (e: EngagementRec) => {
  if (isOpenRole(e)) return false;
  if (e.source === "Demand scan" && !known(e.cells.operator)) return false;
  const type = shown(e.cells.type);
  return !type || FRACTIONAL_TYPES.includes(type);
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
  // credit also opens the role, the posting and the posted rate of each open role there.
  const coLocked = lockedOf("company", c.id, c.cells).filter((t) => !(c.hidden && ["website", "linkedin", "about"].includes(t.field)));
  const engLocked = engs.flatMap((e) => {
    const all = lockedInEngagement(e);
    return c.hidden && isOpenRole(e) ? all.filter((t) => !(t.entity === "engagement" && OPEN_ROLE_BUNDLE.includes(t.field))) : all;
  });
  const locked = [
    ...(c.hidden ? [{ entity: "company" as const, id: c.id, field: "identity" }] : []),
    ...coLocked,
    ...engLocked,
    ...c.people.flatMap((p) => lockedOf("contact", p.id, p.cells)),
  ];
  const personGated = ["name", "title", "email", "phone", "linkedin"];
  const unlockedByMe =
    !!c.unlocked || engs.some(engUnlocked) || people.some(({ p }) => personGated.some((g) => p.cells[g] && isUnlocked(p.cells[g])));
  // A locked company has no name to search (the server sends a placeholder).
  const nameHay = c.hidden ? "" : [c.name, domain ?? ""].join(" ").toLowerCase();
  const parts: string[] = [nameHay, ...fns, ...textOf(c.cells)];
  for (const e of engs) parts.push(...textOf(e.cells));
  for (const { p } of people) parts.push(...textOf(p.cells));
  const teaser = c.hidden
    ? [shown(c.cells.industry), shown(c.cells.employees) && `${shown(c.cells.employees)} employees`, shown(c.cells.hq)].filter(Boolean).join(" · ")
    : "";
  return { c, domain, fns, fnState: { hired, hiring, story }, people, latest, engs, locked, unlockedByMe, teaser, hay: parts.join(" ").toLowerCase(), nameHay, aboutHay: (c.cells.about?.s === "value" ? c.cells.about.v : "").toLowerCase() };
}

/**
 * The seat a company card leads with, for this member. A locked company: its open role. Otherwise
 * a seat in the member's own function (one with its holder on file first), then any seat with a
 * holder on file, then the latest seat. So a card reads "Sales seat, held by [locked]" for a VP
 * Sales rather than a nameless research seat in another function.
 */
export function cardSeat(i: CoInfo, fn: string | null): EngagementRec | null {
  if (i.c.hidden) return i.engs.find(isOpenRole) ?? i.latest;
  const holder = (e: EngagementRec) => !!e.yours || known(e.cells.operator);
  const mineFn = namedFn(fn);
  const mine = mineFn ? i.engs.filter((e) => fnOfSeat(e) === mineFn) : [];
  return mine.find(holder) ?? mine[0] ?? i.engs.find(holder) ?? i.latest;
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
export function fitTier(f: Friendly, engs: number, closedPosting = false): { label: string; cls: string } {
  if (f.open) return { label: "Hiring now", cls: "t-hiring" };
  if (f.fractional >= 2 || f.functions.length >= 2) return { label: "Repeat hirer", cls: "t-repeat" };
  if (f.recent) return { label: "Recent seat", cls: "t-recent" };
  if (f.fractional) return { label: "Past seat", cls: "t-past" };
  // They went looking for a fractional, but nobody is on file in the seat: not a hire, and not a story.
  if (closedPosting) return { label: "Posting closed", cls: "t-past" };
  if (engs > 0) return { label: "Full-time only", cls: "t-story" };
  return { label: "No seats", cls: "t-none" };
}

/** A job posting the scan followed that came down with nobody named in the seat. */
export const isClosedPosting = (e: EngagementRec) => !!e.closed && e.source === "Demand scan" && !known(e.cells.operator);
/** The latest such posting at a company, or null. */
export function lastClosedPosting(i: CoInfo): EngagementRec | null {
  let best: EngagementRec | null = null;
  for (const e of i.engs) if (isClosedPosting(e) && (!best || (e.closedAt ?? e.closed ?? "") > (best.closedAt ?? best.closed ?? ""))) best = e;
  return best;
}
/** "Dec 8", in the viewer's time zone (the year when it isn't this year). */
const shortDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });

/** One line on why a company scores the way it does. */
export function fitReason(i: CoInfo): string {
  const f = i.c.friendly;
  const seats = f.fractional;
  const fns = f.functions.length;
  const bits: string[] = [];
  if (seats) bits.push(`${seats} fractional seat${seats > 1 ? "s" : ""}${fns > 1 ? ` across ${fns} functions` : fns === 1 ? ` in ${f.functions[0]}` : ""}`);
  if (f.open) bits.push(`${f.open} open role${f.open > 1 ? "s" : ""} now`);
  if (!bits.length) {
    const closed = lastClosedPosting(i);
    if (closed) {
      const on = closed.closedAt ? new Date(closed.closedAt) : closed.closed ? dayOf(closed.closed) : null;
      return `A job posting here came down${on ? ` on ${shortDay(on)}` : ""}. Nobody is on file in the seat.`;
    }
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
  /** Countries (CompanyRec.country), and US states or regions under them. */
  country: string[];
  region: string[];
  /** Narrow to the member's Ideal Fractional Profile (Me.icp). The pill over the table, not a chip. */
  icp: boolean;
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
  country: [],
  region: [],
  icp: false,
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
  | "relationship"
  | "country"
  | "region";
/** Lists whose options come from the records (HQ, country, region), not from a pick list. */
type OpenList = "hq" | "country" | "region";

/** A function a label can name: "Executive" and "Other" are catch-alls, so a sentence says "your function" instead. */
export const namedFn = (fn: string | null) => (fn && fn !== "Other" && fn !== "Executive" ? fn : null);
/** The "No fractional Sales yet" filter as the member reads it, in the sidebar and on its chip. */
export const notMineLabel = (fn: string | null) => (namedFn(fn) ? `No fractional ${fn} yet` : "No fractional in your function yet");

export const TOGGLE_LABEL: Record<ToggleKey, string> = {
  rateKnown: "Rate on file",
  contactKnown: "Hiring contact on file",
  notMine: "No fractional in your function yet",
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
  country: "Country",
  region: "Region",
};
export const FIT_STEPS = [0, 20, 40, 60, 80];
/** Followed roles by where they stand: the posting is still up, or it came down. */
export const ROLE_STATES = ["Open now", "Closed"];
export const hasRoleDates = (i: CoInfo) => i.engs.some((e) => !!e.opened || isOpenRole(e));
/** A YYYY-MM-DD day as a local date, so the day shown is the day stored. */
export const dayOf = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
/** Days between the first day a posting was seen and the day it came down (at least 1). */
export const daysListed = (opened: string, closed: string) => Math.max(1, Math.round((dayOf(closed).getTime() - dayOf(opened).getTime()) / 86_400_000));

export const LIST_OPTIONS: Record<Exclude<ListKey, OpenList>, string[]> = {
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
  // One option per label: Revenue Nomad's research covers people (Clay) and seats (Seat scan) alike.
  source: Object.keys(SOURCE_LABEL).filter((k, i, all) => all.findIndex((x) => SOURCE_LABEL[x] === SOURCE_LABEL[k]) === i),
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

/** An old address's tab key to today's: "friendly" was the tab Repeat hirers replaced, and "needs" (Needs facts, gone) opens All. */
export const tabOf = (v: string | null): Tab | null => (v === "friendly" ? "repeat" : v === "needs" ? "all" : TABS.find((x) => x.key === v)?.key ?? null);

/**
 * A repeat hirer: 2 or more fractional hires on file, or fractional hires in 2 or more
 * functions. Only hires count (Friendly.fractional and .functions leave out open roles and
 * postings), so an open role alone never makes one.
 */
export function repeatHirer(i: CoInfo) {
  const f = i.c.friendly;
  return f.fractional >= 2 || f.functions.length >= 2;
}

/** Fractional friendly (an open role, or a fit tier of Medium or better). The MCP fractional_friendly filter still uses it. */
export function friendlyCo(i: CoInfo) {
  return i.c.friendly.open > 0 || i.c.friendly.tier === "High" || i.c.friendly.tier === "Medium";
}

const personUnlocked = (p: PersonRec) => ["name", "email", "phone", "linkedin"].some((f) => isUnlocked(p.cells[f]));

export function tabTest(tab: Tab, r: Row): boolean {
  const i = r.i;
  switch (tab) {
    case "repeat":
      return repeatHirer(i);
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
  // The About text is long prose, so a word there counts only from its start ("pharma" finds "pharmaceutical", "one" does not find "phone").
  // One pattern per word, made once for every row.
  const starts = toks.map((t) => new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  return (r) => {
    const h = hayOf(r);
    const about = r.i.aboutHay;
    return toks.every((t, n) => h.includes(t) || (!!about && starts[n].test(about)));
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
      // Open now is the Hiring now view's own test: one definition of open, so the chip and the
      // view always agree. Closed: a role the scan followed came down.
      if (opt === "Closed") return (r) => (r.p ? r.i.engs : engsOf(r)).some((e) => !!e.closed);
      return (r) => tabTest("hiring", r);
    case "source": {
      const same = (src: string) => src === opt || (!!SOURCE_LABEL[src] && SOURCE_LABEL[src] === SOURCE_LABEL[opt]);
      return (r) => (r.p ? same(r.p.source) : engsOf(r).some((e) => same(e.source)));
    }
    case "relationship":
      return (r) => peopleOf(r).some((p) => shown(p.cells.relationship) === opt);
    case "country": {
      const k = countryKey(opt);
      return (r) => {
        const c = countryOf(r.i.c);
        return !!c && countryKey(c) === k;
      };
    }
    case "region": {
      const k = opt.toLowerCase();
      return (r) => regionOf(r.i.c)?.toLowerCase() === k;
    }
  }
}

/**
 * The values a row has for a list whose options match by equality (what optionTest compares
 * against), so the facet counts read each row once instead of once per option. Null for the
 * lists optionTest matches another way (HQ by place, role state, source by label).
 */
const BY_VALUE = new Set<ListKey>(["industry", "employees", "revenue", "businessModel", "motion", "dealSize", "salesCycle", "reason", "pricing", "type", "fn", "relationship"]);
function valuesOf(key: ListKey, r: Row): (string | null)[] | null {
  switch (key) {
    case "industry":
    case "employees":
    case "revenue":
    case "businessModel":
    case "motion":
    case "dealSize":
    case "salesCycle":
      return [shown(r.i.c.cells[key])];
    case "reason":
    case "pricing":
      return (r.p ? r.i.engs : engsOf(r)).map((e) => shown(e.cells[key]));
    case "type":
      return (r.p ? r.i.engs : engsOf(r)).map((e) => shown(e.cells.type));
    case "fn":
      return r.e ? [shown(r.e.cells.function)] : r.i.fns;
    case "relationship":
      return peopleOf(r).map((p) => shown(p.cells.relationship));
    default:
      return null;
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
        // A company with an open role in the member's function is hiring that seat now, so it is not "no seat yet".
        // Nor is one where a member story or a closed posting names the function: its chip shows on the row.
        const s = r.i.fnState;
        return !!me.function && s.hired.length > 0 && !s.hired.includes(me.function) && !s.hiring.includes(me.function) && !s.story.includes(me.function);
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
const LISTS: ListKey[] = ["industry", "employees", "revenue", "hq", "country", "region", "businessModel", "motion", "dealSize", "salesCycle", "fn", "type", "reason", "pricing", "roleState", "source", "relationship"];

/** The member's own lists (what they follow, what they paid for): the Ideal Fractional Profile never narrows them. */
export const ICP_FREE_TABS: Tab[] = ["following", "unlocked"];
/** The Ideal Fractional Profile narrows this list: its pill is on, it names something, and the view is not one of the member's own lists. */
export const icpApplies = (f: Pick<Filters, "icp">, tab: Tab, me: Pick<Me, "icp">) => f.icp && !icpEmpty(me.icp) && !ICP_FREE_TABS.includes(tab);

function clauses(f: Filters, tab: Tab, q: string, me: Me): Clause[] {
  const out: Clause[] = [];
  if (tab !== "all") out.push({ group: "tab", test: (r) => tabTest(tab, r) });
  // A fractional firm (agency, marketplace) is not a client: a guard, should a record ever carry firm.
  out.push({ group: "firms", test: (r) => !isFirm(r.i.c) });
  // The member's Ideal Fractional Profile, while its pill is on (never on Following or Unlocked).
  const icp = icpApplies(f, tab, me) ? me.icp : null;
  if (icp) {
    const t = icpTest(icp);
    out.push({ group: "icp", test: (r) => t(r.i.c) });
  }
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

/** Every clause failed by more than one group: no single group lifted makes the row pass. */
const MANY = "\u0000many";
/**
 * Which clause group a row fails: null when it passes them all, the group when it fails only that
 * one, MANY otherwise. Worked out once per row, so counting each group with its own selection
 * lifted (the facets) never runs the same test twice.
 */
const failsOf = (r: Row, cs: Clause[]): string | null => {
  let bad: string | null = null;
  for (const c of cs) {
    if (c.group === bad || c.test(r)) continue;
    if (bad !== null) return MANY;
    bad = c.group;
  }
  return bad;
};

export interface Facets {
  toggles: Record<ToggleKey, number>;
  lists: Record<ListKey, Record<string, number>>;
  fit: Record<number, number>;
  /** What each view lists with these filters. Following and Unlocked are counted without the Ideal Fractional Profile, like their lists. */
  tabs: Record<Tab, number>;
  /** Hiring now rows with an open role in the member's own function: what Hiring now lists, alone, until "Show all functions". */
  hiringMine: number;
  /** Rows the other filters let through with the ideal client lifted ("Show everyone"). */
  everyone: number;
}

/** Filtered rows plus counts for every filter option (each group counted with its own selection lifted). */
export function applyFilters(rows: Row[], f: Filters, tab: Tab, q: string, me: Me): { rows: Row[]; facets: Facets };
/** `rowsOnly`: just the rows, no facet counts (the search counts of the other lists need only how many). */
export function applyFilters(rows: Row[], f: Filters, tab: Tab, q: string, me: Me, rowsOnly: true): { rows: Row[] };
export function applyFilters(rows: Row[], f: Filters, tab: Tab, q: string, me: Me, rowsOnly = false): { rows: Row[]; facets?: Facets } {
  const cs = clauses(f, tab, q, me);
  if (rowsOnly) return { rows: rows.filter((r) => failsOf(r, cs) === null) };
  const fails = new Map<Row, string | null>();
  for (const r of rows) fails.set(r, failsOf(r, cs));
  /** The row passes every clause, leaving out the group `except`. */
  const pass = (r: Row, _cs: Clause[], except?: string) => {
    const bad = fails.get(r)!;
    return bad === null || bad === except;
  };
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
    if (k === "hq" || k === "country" || k === "region") {
      // Region counts only under the countries picked (a state means something inside its country).
      const inCountry = k === "region" && f.country.length ? f.country.map((c) => optionTest("country", c)) : null;
      for (const r of base) {
        if (inCountry && !inCountry.some((t) => t(r))) continue;
        const v = k === "hq" ? shown(r.i.c.cells.hq) : k === "country" ? countryOf(r.i.c) : regionOf(r.i.c);
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
    } else if (BY_VALUE.has(k)) {
      // Each row once: every option it has counts one (the same as optionTest per option).
      const n = new Map<string, number>(LIST_OPTIONS[k as keyof typeof LIST_OPTIONS].map((o) => [o, 0]));
      for (const r of base) {
        const vs = valuesOf(k, r)!;
        for (const v of vs.length === 1 ? vs : new Set(vs)) if (v !== null && n.has(v)) n.set(v, n.get(v)! + 1);
      }
      for (const [o, c] of n) counts[o] = c;
    } else {
      for (const opt of LIST_OPTIONS[k as keyof typeof LIST_OPTIONS]) {
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
  // Each view is counted the way its own list filters: the profile narrows every view but the member's own lists.
  const withIcp = clauses({ ...f, icp: !!f.icp }, "all", q, me);
  const noIcp = withIcp.filter((c) => c.group !== "icp");
  const tabBase = rows.filter((r) => failsOf(r, withIcp) === null);
  const ownBase = noIcp.length === withIcp.length ? tabBase : rows.filter((r) => failsOf(r, noIcp) === null);
  const tabs = {} as Record<Tab, number>;
  // Following counts companies on every list: following one company with five seats reads 1, not 5.
  for (const t of TABS) {
    const base = ICP_FREE_TABS.includes(t.key) ? ownBase : tabBase;
    tabs[t.key] = t.key === "all" ? base.length : t.key === "following" ? new Set(base.filter((r) => tabTest(t.key, r)).map((r) => r.i.c.id)).size : base.filter((r) => tabTest(t.key, r)).length;
  }
  const mineFn = namedFn(me.function);
  const hiringMine = mineFn ? tabBase.filter((r) => tabTest("hiring", r) && rowOpenFns(r).includes(mineFn)).length : 0;
  let everyone = 0;
  for (const r of rows) if (pass(r, cs, "icp")) everyone++;
  return { rows: result, facets: { toggles, lists, fit, tabs, hiringMine, everyone } };
}

export function activeCount(f: Filters): number {
  let n = 0;
  for (const k of TOGGLES) if (f[k]) n++;
  for (const k of LISTS) n += f[k].length;
  if (f.fitMin) n++;
  return n;
}

/** No filters, keeping the Ideal Fractional Profile pill as it is (Clear all clears filters, not who the member hunts). */
export const clearedFilters = (f: Filters): Filters => ({ ...EMPTY_FILTERS, icp: f.icp });

/** Removable chips for the active filters. */
export function activeChips(f: Filters): { id: string; label: string; clear: (f: Filters) => Filters }[] {
  const out: { id: string; label: string; clear: (f: Filters) => Filters }[] = [];
  for (const k of TOGGLES) if (f[k]) out.push({ id: k, label: TOGGLE_LABEL[k], clear: (x) => ({ ...x, [k]: false }) });
  // A whole industry group picked reads as one chip ("Industry Software (all)") that clears all of it.
  const grouped = new Set<string>();
  for (const g of INDUSTRY_GROUPS)
    if (g.values.every((v) => f.industry.includes(v))) {
      g.values.forEach((v) => grouped.add(v));
      out.push({ id: `industry:${g.label}`, label: `${LIST_LABEL.industry} ${g.label}`, clear: (x) => ({ ...x, industry: x.industry.filter((y) => !g.values.includes(y)) }) });
    }
  for (const k of LISTS)
    for (const v of f[k])
      if (!(k === "industry" && grouped.has(v)))
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
export interface SortCtx {
  /** Who is looking: "Best fit for you" reads their ideal client and function. Without it, Best fit sorts as Most fractional-friendly. */
  me?: Pick<Me, "icp" | "function"> | null;
  /** Hiring now: open roles in this function first, and Recently updated reads as newest open role. */
  fnFirst?: string | null;
}
export function sortRows(rows: Row[], sort: SortKey, needsFirst = false, q = "", ctx: SortCtx = {}): Row[] {
  const sorted = sortBy(rows, sort, needsFirst, ctx);
  return q.trim() ? rankByQuery(sorted, q) : sorted;
}
function sortBy(rows: Row[], sort: SortKey, needsFirst: boolean, ctx: SortCtx = {}): Row[] {
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
  // A to Z on a free fact the row shows. Rows without it go last.
  const text = (get: (r: Row) => string | null) => (a: Row, b: Row) => {
    const x = get(a);
    const y = get(b);
    return x && y ? x.localeCompare(y) : x ? -1 : y ? 1 : 0;
  };
  const byFn = text((r) => shown((r.e ?? r.i.latest)?.cells.function));
  const byTitle = text((r) => (r.p ? shown(r.p.cells.title) : null));
  const byHq = text((r) => shown(r.i.c.cells.hq));
  // The last tie breaks on the row's own id, never its name: unlocking a hidden company changes its
  // name, and the row must not move while its record is open (only the Name sort reads names).
  const byKey = (a: Row, b: Row) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  // Best fit, worked out once per company for this sort.
  // Confirmed matches of the ideal client first, maybes (a part not on file) after, then the rest. Best fit inside each.
  const fitMemo = new Map<CoInfo, number>();
  const me = ctx.me;
  const TIER: Record<IcpMatch, number> = { match: 2000, maybe: 1000, no: 0 };
  const best = (r: Row) => {
    let v = fitMemo.get(r.i);
    if (v === undefined) {
      const b = me ? bestFit(r.i, me) : null;
      v = b ? b.score + (b.match ? TIER[b.match] : 0) : 0;
      fitMemo.set(r.i, v);
    }
    return v;
  };
  // A seat (and a person tied to one) in the member's own function leads, then a fractional or
  // interim seat ahead of a full-time one. Company rows have no seat of their own: 0.
  const myFn = me ? namedFn(me.function) : null;
  const seatTier = (r: Row) => {
    if (!r.e || !me) return 0;
    const ty = shown(r.e.cells.type);
    return (myFn && shown(r.e.cells.function) === myFn ? 2 : 0) + (ty && FRACTIONAL_TYPES.includes(ty) ? 1 : 0);
  };
  const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
    best: (a, b) => seatTier(b) - seatTier(a) || best(b) - best(a) || score(b) - score(a) || b.i.c.engagements.length - a.i.c.engagements.length || start(b).localeCompare(start(a)) || byKey(a, b),
    fit: (a, b) => score(b) - score(a) || b.i.c.engagements.length - a.i.c.engagements.length || start(b).localeCompare(start(a)) || byKey(a, b),
    newest: (a, b) => updated(b).localeCompare(updated(a)) || start(b).localeCompare(start(a)) || score(b) - score(a) || byKey(a, b),
    name: (a, b) => byName(a, b) || start(b).localeCompare(start(a)) || byKey(a, b),
    engagements: (a, b) => b.i.c.engagements.length - a.i.c.engagements.length || score(b) - score(a) || byKey(a, b),
    start: (a, b) => start(b).localeCompare(start(a)) || score(b) - score(a) || byKey(a, b),
    employees: (a, b) => emp(b) - emp(a) || score(b) - score(a) || byKey(a, b),
    revenue: (a, b) => rev(b) - rev(a) || score(b) - score(a) || byKey(a, b),
    fn: (a, b) => byFn(a, b) || start(b).localeCompare(start(a)) || byKey(a, b),
    title: (a, b) => byTitle(a, b) || score(b) - score(a) || byKey(a, b),
    hq: (a, b) => byHq(a, b) || score(b) - score(a) || byKey(a, b),
  };
  let by = cmp[sort];
  const fn = ctx.fnFirst;
  if (fn) {
    // Hiring now: the member's function first, then the newest open role (posted day when the board gives one, else first seen).
    const mine = (r: Row) => (rowOpenFns(r).includes(fn) ? 1 : 0);
    const then = sort === "newest" ? (a: Row, b: Row) => openedOn(b).localeCompare(openedOn(a)) || cmp.newest(a, b) : cmp[sort];
    by = (a, b) => mine(b) - mine(a) || then(a, b);
  }
  return [...rows].sort(needsFirst ? (a, b) => b.i.c.facts.missing - a.i.c.facts.missing || by(a, b) : by);
}

/* ---------- who the member hunts: ideal client, firms, countries, best fit ---------- */

/**
 * The company fields the data clean adds (CompanyRec.country and .region, lib/geo.ts). `firm` is
 * a guard only: fractional firms are removed from the data (lib/firmRemoval.ts), so no record
 * carries it today, and a record that ever did would stay out of the lists.
 */
type CoPlace = { country?: string | null; region?: string | null; firm?: boolean };
/** A fractional firm, agency or marketplace: not a client. Never suggested, and out of the lists unless asked for. */
export const isFirm = (c: CompanyRec) => !!(c as CoPlace).firm;

/** "US", "USA" and "United States" are one country. */
export const countryKey = (v: string) => {
  const k = v.trim().toLowerCase().replace(/\./g, "");
  return k === "us" || k === "usa" || k === "united states of america" ? "united states" : k === "uk" ? "united kingdom" : k;
};
/** The country as the app spells it: "United States" for every spelling of it. */
export const countryName = (v: string) => (countryKey(v) === "united states" ? "United States" : countryKey(v) === "united kingdom" ? "United Kingdom" : v.trim());
/** Short, for the pill: "US", "UK", else the name. */
export const countryShort = (v: string) => (countryKey(v) === "united states" ? "US" : countryKey(v) === "united kingdom" ? "UK" : countryName(v));

/**
 * Where a company is. The server sends CompanyRec.country and .region (null when the HQ names no
 * place), and those are the answer. Only a record without the fields (an older server, a test
 * fixture) reads the HQ itself, the same way the server does (lib/geo.ts normalizeHq).
 */
function placeOf(c: CompanyRec): { country: string | null; region: string | null } {
  const x = c as CoPlace;
  const hasCountry = x.country !== undefined;
  const hasRegion = x.region !== undefined;
  let country = x.country ? countryName(x.country) : null;
  let region = x.region ?? null;
  if (!hasCountry || !hasRegion) {
    const hq = shown(c.cells.hq);
    const g = hq ? normalizeHq(hq) : null;
    if (!hasCountry) country = g?.country ? countryName(g.country) : null;
    if (!hasRegion) region = g?.region ?? null;
  }
  return { country, region };
}
const placeMemo = new WeakMap<CompanyRec, { country: string | null; region: string | null }>();
const placeFor = (c: CompanyRec) => {
  let p = placeMemo.get(c);
  if (!p) {
    p = placeOf(c);
    placeMemo.set(c, p);
  }
  return p;
};
export const countryOf = (c: CompanyRec): string | null => placeFor(c).country;
export const regionOf = (c: CompanyRec): string | null => placeFor(c).region;

// Industries match by name, case aside (the standard list names each one once).
const industryKey = (v: string) => v.trim().toLowerCase();

export const icpEmpty = (icp: Icp | null | undefined) => !icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length);

/** Which parts of the ideal client a company matches: true, false, or null when its record doesn't say. */
export function icpParts(icp: Icp, c: CompanyRec) {
  const ind = shown(c.cells.industry);
  const emp = shown(c.cells.employees);
  const rev = shown(c.cells.revenue);
  const ctry = countryOf(c);
  const inds = new Set(icp.industries.map(industryKey));
  return {
    industry: icp.industries.length ? (ind ? inds.has(industryKey(ind)) : null) : undefined,
    employees: icp.employees.length ? (emp ? icp.employees.includes(emp) : null) : undefined,
    revenue: icp.revenue.length ? (rev ? icp.revenue.includes(rev) : null) : undefined,
    country: icp.countries.length ? (ctry ? icp.countries.some((x) => countryKey(x) === countryKey(ctry)) : null) : undefined,
  };
}

/**
 * The ideal client as a filter (the owner's call): a known value that conflicts leaves a company
 * out, and at least one part the profile asks for (industry, size, revenue or country) has to be
 * on file and match. A company we know nothing the profile asks about is never a match, so a
 * profile of "US only" doesn't let in every company whose country isn't on file. One with some
 * part not on file is a maybe and stays, after the confirmed matches in "Best fit for you"
 * (icpMatch), with a line on what isn't on file.
 */
export function icpTest(icp: Icp): (c: CompanyRec) => boolean {
  return (c) => {
    const p = icpParts(icp, c);
    if (p.industry === false || p.employees === false || p.revenue === false || p.country === false) return false;
    return [p.industry, p.employees, p.revenue, p.country].includes(true);
  };
}

/** How a company stands against the ideal client: every part it asks for on file and matching, some part not on file, or a known part that conflicts. */
export type IcpMatch = "match" | "maybe" | "no";
export function icpMatch(icp: Icp | null | undefined, c: CompanyRec): IcpMatch | null {
  if (icpEmpty(icp)) return null;
  const v = Object.values(icpParts(icp!, c)).filter((x) => x !== undefined);
  return v.includes(false) ? "no" : v.includes(null) ? "maybe" : "match";
}

const UNKNOWN_WORD = { industry: "industry", employees: "size", revenue: "revenue", country: "country" } as const;
/** What a maybe is missing, as one line: "Size not on file", "Size and revenue not on file". Null when nothing the ideal client asks for is missing. */
export function icpUnknown(icp: Icp | null | undefined, c: CompanyRec): string | null {
  if (icpEmpty(icp)) return null;
  const p = icpParts(icp!, c);
  if (Object.values(p).includes(false)) return null;
  const miss = (Object.keys(UNKNOWN_WORD) as (keyof typeof UNKNOWN_WORD)[]).filter((k) => p[k] === null).map((k) => UNKNOWN_WORD[k]);
  if (!miss.length) return null;
  const words = miss.length === 1 ? miss[0] : `${miss.slice(0, -1).join(", ")} and ${miss[miss.length - 1]}`;
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} not on file`;
}

export { industryWords } from "@/lib/tableFields";

/** Bands in their list's order, runs joined: ["11–50", "51–200"] reads "11–200", ["$20M–$50M", "$50M+"] reads "$20M+". */
export function bandRange(list: string[], picked: string[]): string {
  const at = picked.map((v) => list.indexOf(v)).filter((n) => n >= 0).sort((a, b) => a - b);
  const ends = (v: string): [string | null, string | null] | null => {
    const u = v.match(/^Under (.+)$/);
    if (u) return [null, u[1]];
    const plus = v.match(/^(.+)\+$/);
    if (plus) return [plus[1], null];
    const two = v.split("–");
    return two.length === 2 ? [two[0], two[1]] : null;
  };
  const runs: number[][] = [];
  for (const n of at) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === n - 1 && ends(list[n]) && ends(list[run[0]])) run.push(n);
    else runs.push([n]);
  }
  return runs
    .map((run) => {
      if (run.length === 1) return list[run[0]];
      const lo = ends(list[run[0]])![0];
      const hi = ends(list[run[run.length - 1]])![1];
      return lo === null ? `Under ${hi}` : hi === null ? `${lo}+` : `${lo}–${hi}`;
    })
    .join(", ");
}

/** "Software · 11–200 · $5M–$20M · US", the pill over the table. Empty when the member named nothing. */
export function icpLabel(icp: Icp | null | undefined): string {
  if (!icp) return "";
  return [
    industryWords(icp.industries).join(", "),
    bandRange(RN_EMPLOYEES, icp.employees),
    bandRange(RN_REVENUE, icp.revenue),
    icp.countries.map(countryShort).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The functions of a row's open roles: the seat's own, or every open role at the company. */
function rowOpenFns(r: Row): string[] {
  const engs = r.e ? [r.e] : r.i.engs;
  return engs.filter(isOpenRole).map((e) => shown(e.cells.function)).filter((x): x is string => !!x);
}
/** When a row's newest open role opened: the day the board says it was posted, else the day we first saw it. */
function openedOn(r: Row): string {
  let best = "";
  for (const e of r.e ? [r.e] : r.i.engs) {
    if (!isOpenRole(e)) continue;
    const d = e.posted ?? e.opened ?? "";
    if (d > best) best = d;
  }
  return best;
}
/** The day to show on an open role ("Open since Nov 6"): posted when the board says, else first seen. */
export const openSince = (e: EngagementRec): string | null => e.posted ?? e.opened ?? null;

/** Hiring now, split by the member's function: theirs, then the rest. */
export function splitByFn(rows: Row[], fn: string | null): { mine: Row[]; others: Row[] } {
  if (!fn) return { mine: rows, others: [] };
  const mine: Row[] = [];
  const others: Row[] = [];
  for (const r of rows) (rowOpenFns(r).includes(fn) ? mine : others).push(r);
  return { mine, others };
}

/**
 * New this week, the way the server counts View.scan.mine7: an open role the last clean scan still
 * listed, first seen in the last 7 days and, when the board gives a date, posted in the last 14.
 */
export function newThisWeek(e: EngagementRec, now = Date.now()): boolean {
  if (!isOpenRole(e) || e.unseen) return false;
  const first = Date.parse(e.openedAt ?? (e.opened ? `${e.opened}T00:00:00Z` : ""));
  if (!Number.isFinite(first) || now - first >= 7 * 86_400_000) return false;
  const posted = Date.parse(e.posted ? `${e.posted}T00:00:00Z` : "");
  return !Number.isFinite(posted) || now - posted <= 14 * 86_400_000;
}

/** Open roles new this week (newThisWeek), in the member's function and in the others. `keep` narrows the companies (the Ideal Fractional Profile). */
export function rolesThisWeek(infos: CoInfo[], fn: string | null, keep: (i: CoInfo) => boolean = () => true): { mine: number; others: number } {
  const now = Date.now();
  let mine = 0;
  let others = 0;
  for (const i of infos) {
    if (!keep(i)) continue;
    for (const e of i.engs) {
      if (!newThisWeek(e, now)) continue;
      if (fn && shown(e.cells.function) === fn) mine++;
      else others++;
    }
  }
  return { mine, others };
}

/**
 * "Best fit for you": a company that matches the member's ideal client and has a gap in their
 * function (no seat in it yet, fractionals hired in others, hires lately) ranks first. `reason`
 * is the one line under the name: "Software · 51–200 · $5M–$20M · hired Sales in 2025 · no
 * Marketing seat".
 */
export function bestFit(i: CoInfo, me: Pick<Me, "icp" | "function">): { score: number; reason: string; match: IcpMatch | null } {
  const c = i.c;
  if (isFirm(c)) return { score: -100, reason: "A fractional firm", match: "no" };
  const match = icpMatch(me.icp, c);
  const fn = namedFn(me.function);
  const icp = me.icp;
  let score = 0;
  const bits: string[] = [];
  if (icp) {
    const p = icpParts(icp, c);
    // A part that clearly doesn't match counts twice what a match does: the ideal client leads the order.
    const weigh = (m: boolean | null | undefined, w: number) => (m === true ? w : m === false ? -2 * w : 0);
    score += weigh(p.industry, 3) + weigh(p.employees, 2) + weigh(p.revenue, 2) + weigh(p.country, 1);
  }
  // What the company is, from its free facts (a hidden company shows these too).
  for (const f of ["industry", "employees", "revenue"]) {
    const v = shown(c.cells[f]);
    if (v) bits.push(v);
  }
  const { hired, hiring } = i.fnState;
  // The latest fractional hire in another function, by its start year.
  let lastOther: { fn: string; year: string } | null = null;
  for (const e of i.engs) {
    const f = shown(e.cells.function);
    if (!f || f === me.function || !isHire(e)) continue;
    const y = (shown(e.cells.start) ?? "").slice(0, 4);
    if (!lastOther || y > lastOther.year) lastOther = { fn: f, year: y };
  }
  const others = hired.filter((f) => f !== me.function);
  score += Math.min(3, others.length);
  if (i.c.friendly.recent > 0) score += 2;
  if (lastOther) bits.push(lastOther.year ? `hired ${lastOther.fn} in ${lastOther.year}` : `hired ${lastOther.fn}`);
  if (fn && hiring.includes(fn)) {
    score += 5;
    bits.push(`hiring ${fn} now`);
  } else if (fn && !hired.includes(fn) && others.length) {
    score += 4;
    bits.push(`no ${fn} seat`);
  } else if (fn && hired.includes(fn)) score -= 1;
  // A maybe says what isn't on file, so the member sees why it sits under the confirmed matches.
  const unknown = match === "maybe" ? icpUnknown(me.icp, c) : null;
  if (unknown) bits.push(unknown);
  return { score, reason: bits.join(" · "), match };
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

/**
 * Facts still empty on a seat. `priv` holds the seats whose rate the member shared for the
 * benchmarks only. An Active seat has no end month yet, so its end is not missing (Your seats
 * doesn't ask for it either).
 */
const seatMissing = (e: EngagementRec, priv: Set<string | null>) =>
  SEAT_ASK.filter((f) => e.cells[f]?.s === "empty" && !(f === "rate" && priv.has(e.id)) && !(f === "end" && shown(e.cells.status) === "Active"));
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

/**
 * Open roles in a function new this week (newThisWeek), and how many of their companies are still
 * hidden. `keep` narrows the companies the way the Hiring now list does (the Ideal Fractional
 * Profile, no fractional firms), so the next-move card counts what "See open roles" shows.
 */
export function newRolesFor(infos: CoInfo[], fn: string | null, keep: (i: CoInfo) => boolean = () => true): { roles: number; hidden: number } {
  if (!fn) return { roles: 0, hidden: 0 };
  const now = Date.now();
  let roles = 0;
  let hidden = 0;
  for (const i of infos) {
    if (!keep(i)) continue;
    const n = i.engs.filter((e) => newThisWeek(e, now) && shown(e.cells.function) === fn).length;
    if (!n) continue;
    roles += n;
    if (i.c.hidden) hidden++;
  }
  return { roles, hidden };
}


/* ---------- Get started ---------- */

export interface CheckStep {
  /** "seat" was "give" (any first fact) before step 2 asked for a seat: a new key, so an old tick in this browser doesn't carry over. */
  key: "unlock" | "seat" | "invite";
  done: boolean;
  label: string;
  hint: string;
}

/**
 * The three Get started steps and the "Fill in your seats" nudge. Step 1 ticks only once the
 * member paid to see who held a seat (or, looking for roles, a hidden company). Step 2 is "Add a
 * seat you held" and ticks only when a seat is on file under their name (one they added or
 * claimed, or one we matched to them): a company fact or a rate shared for the benchmarks never
 * ticks it, and its label never changes. A step in `stuck` (done before, in this browser) stays
 * done. Once step 2 is done and their seats still miss facts, the nudge takes step 2's place in
 * the strip, so it never holds more than three items.
 */
export function checkSteps(
  me: Pick<Me, "goal" | "added" | "unlocked" | "holdersUnlocked" | "companiesUnlocked" | "invited" | "invitesPaid">,
  o: { seatsHeld: number; seatsLeft: number; earn: number; stuck?: Set<string> },
): { steps: CheckStep[]; nudge: { label: string; hint: string } | null } {
  const paid = me.invitesPaid ?? 0;
  const holders = me.holdersUnlocked ?? me.unlocked;
  const companies = me.companiesUnlocked ?? 0;
  const roles = me.goal === "roles";
  const left = o.seatsLeft;
  const raw: CheckStep[] = [
    { key: "unlock", done: roles ? holders + companies > 0 : holders > 0, label: roles ? "See who is hiring" : "See who held a seat", hint: "costs 1 credit" },
    { key: "seat", done: o.seatsHeld > 0, label: "Add a seat you held", hint: "earns 1 credit" },
    // Done once an invitee's first fact paid the bonus, not when they merely joined.
    { key: "invite", done: paid > 0, label: me.invited > paid ? `Invite a fractional, ${me.invited} joined` : "Invite a fractional", hint: `${REFERRAL_BONUS} credits each` },
  ];
  const steps = raw.map((x) => ({ ...x, done: x.done || !!o.stuck?.has(x.key) }));
  const nudge =
    o.seatsHeld > 0 && left > 0 && steps[1].done
      ? { label: "Fill in your seats", hint: o.earn >= left ? `${left} left, 1 credit each` : o.earn > 0 ? `${left} left, earns up to ${o.earn}` : `${left} left to fill` }
      : null;
  return { steps, nudge };
}

/* ---------- saved views ---------- */

/** The filters with the ideal client written out (a saved view keeps what it showed, whatever the member's clients are later). */
export function withIcpSpelled(f: Filters, icp: Icp | null | undefined): Filters {
  if (!f.icp || icpEmpty(icp)) return { ...f, icp: false };
  const add = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  return { ...f, icp: false, industry: add(f.industry, icp!.industries), employees: add(f.employees, icp!.employees), revenue: add(f.revenue, icp!.revenue), country: add(f.country, icp!.countries.map(countryName)) };
}

/** What a saved view matches in the weekly email (open roles, by free facts). */
export function criteriaOf(f: Filters, hireFn: string | null) {
  const fns = f.fn.length ? f.fn : hireFn ? [hireFn] : [];
  return {
    ...(fns.length === 1 ? { function: fns[0] } : fns.length ? { functions: fns } : {}),
    ...(f.industry.length ? { industry: f.industry } : {}),
    ...(f.employees.length ? { employees: f.employees } : {}),
    ...(f.revenue.length ? { revenue: f.revenue } : {}),
    ...(f.country.length ? { country: f.country } : {}),
    ...(f.hq.length === 1 ? { hq: f.hq[0] } : {}),
  };
}

/**
 * A name for a view from what it shows: "Marketing roles at Software companies, $5M–$20M". The
 * shortcuts that make the view say so too ("no fractional Marketing yet"). `myFn` names the
 * member's function for that one.
 */
export function viewName(f: Filters, tab: Tab, type: RecordType, hireFn: string | null = null, myFn: string | null = null): string {
  const fns = f.fn.length ? f.fn : hireFn ? [hireFn] : [];
  const roles = tab === "hiring" || type === "engagements" || fns.length > 0;
  const subject = fns.length ? `${fns.join(" or ")} ${tab === "hiring" ? "roles" : "seats"}` : tab === "hiring" ? "Open roles" : type === "people" ? "People" : roles ? "Seats" : "Companies";
  const inds = industryWords(f.industry).map((x) => x.replace(" (all)", ""));
  const ind = inds.length ? `${inds.join(" or ")} companies` : "";
  const head = ind ? (subject === "Companies" ? ind : `${subject} at ${ind}`) : subject;
  const tabWord = tab === "repeat" ? "repeat hirers" : tab === "following" ? "companies you follow" : "";
  const parts = [
    tabWord && !ind && subject === "Companies" ? tabWord.charAt(0).toUpperCase() + tabWord.slice(1) : tabWord ? `${head} among ${tabWord}` : head,
    bandRange(RN_REVENUE, f.revenue),
    f.employees.length ? `${bandRange(RN_EMPLOYEES, f.employees)} employees` : "",
    f.country.length ? `in ${f.country.map(countryShort).join(" or ")}` : "",
    f.region.length ? f.region.join(" or ") : "",
    f.hq.length ? `in ${f.hq.join(" or ")}` : "",
    f.notMine ? notMineLabel(myFn).replace(/^No/, "no") : "",
    f.fractionalNamed ? "seat holder on file" : "",
  ].filter(Boolean);
  return parts.join(", ").slice(0, 100);
}
