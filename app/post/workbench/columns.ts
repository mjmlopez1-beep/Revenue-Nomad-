/**
 * The workbench's column registry: every column each list can show, with its label, whether it is
 * free or costs a credit a row (and what must open first), and how a row counts toward its fill
 * rate. Pure: no React, so scripts/test-workbench.mts reads it as the table does. How each column
 * draws is in cells.tsx, keyed by the same ids.
 *
 * Prices and bundles come from lib/tableFields.ts (COMPANY_PRICE, PERSON_BUNDLE, SEAT_BUNDLE) and
 * the field lists in app/post/model.ts, so a column never states a price the server doesn't charge.
 *
 * Fill rate (the line under each heading): over the rows in view, the share whose cell is on file.
 * A lock counts as on file (Merlin has the fact, the member hasn't opened it), so a column reads
 * "100%" before anything is spent. A column can count something narrower and say so in its word:
 * the Company column counts the companies open to the member ("40% open").
 */
import { COMPANY_PRICE } from "@/lib/tableFields";
import type { Cell, EngagementRec, PersonRec } from "@/lib/tableTypes";
import type { CoInfo, FactRef, RecordType, Row, SortKey } from "../model";

/** A row's cell for a column: on file and shown, on file and locked, or not on file. */
export type Fill = "value" | "locked" | "empty";

export interface ColumnDef {
  id: string;
  type: RecordType;
  label: string;
  /** Free to see, or the credits one row costs to open (the cell's own lock). */
  cost: "free" | number;
  /** What must open before this column's lock can (said in the column picker and the run's drill-in). */
  needs?: string;
  /** Always shown, first (the Company column). */
  fixed?: boolean;
  /** Shown on a list before the member picks columns. */
  def?: boolean;
  /** The fill rate's word: "open", "named", "on file". */
  word: string;
  /** "known" (default): a value or a lock counts. "value": only what the member sees counts (Company: open). */
  counts?: "known" | "value";
  fill: (r: Row) => Fill;
  /** The header's sort, where the list has one. */
  sort?: SortKey;
  /** One line under the label in the column picker, and the header's tooltip. */
  tip?: string;
  /** The grid track: "minmax(140px, 1fr)". */
  width: string;
  num?: boolean;
}

const of = (c: Cell | undefined): Fill => (!c || c.s === "empty" ? "empty" : c.s === "locked" ? "locked" : "value");

/**
 * The decision maker a company row shows: the person on file marked Decision maker, else the first
 * person on file (Tables.tsx PeopleCell draws the same one).
 */
export function deciderOf(i: CoInfo): { p: PersonRec; e: EngagementRec | null } | null {
  if (!i.people.length) return null;
  return i.people.find(({ p }) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker") ?? i.people[0];
}

/** The seat a company row shows: the latest one. */
const latest = (r: Row) => r.i.latest;

const co = (field: string, label: string, width: string, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  id: field,
  type: "companies",
  label,
  cost: "free",
  word: "on file",
  fill: (r) => of(r.i.c.cells[field]),
  width,
  ...extra,
});

export const COMPANY_COLUMNS: ColumnDef[] = [
  {
    id: "company",
    type: "companies",
    label: "Company",
    cost: COMPANY_PRICE,
    fixed: true,
    def: true,
    word: "open",
    counts: "value",
    fill: (r) => (r.i.c.hidden ? "locked" : "value"),
    sort: "name",
    tip: "Its name, website and job postings open with the company. Free on the trial and Pro, up to 15 a day.",
    width: "minmax(230px, 1.6fr)",
  },
  {
    id: "heldBy",
    type: "companies",
    label: "Held by",
    cost: "free",
    def: true,
    word: "named",
    needs: "Opens with the company",
    fill: (r) => {
      const e = latest(r);
      if (!e) return "empty";
      if (e.yours) return "value";
      return of(e.cells.operator);
    },
    tip: "The fractional who held the latest seat. Free to see once the company is open.",
    width: "minmax(140px, 0.9fr)",
  },
  {
    id: "seat",
    type: "companies",
    label: "Latest seat",
    cost: "free",
    def: true,
    word: "on file",
    fill: (r) => (latest(r) ? "value" : "empty"),
    sort: "start",
    width: "minmax(150px, 1fr)",
  },
  {
    id: "fns",
    type: "companies",
    label: "Functions hired",
    cost: "free",
    def: true,
    word: "on file",
    fill: (r) => (r.i.fns.length ? "value" : "empty"),
    tip: "The functions this company hired a fractional for, 3 at most, then how many more.",
    width: "minmax(170px, 1.1fr)",
  },
  co("industry", "Industry", "minmax(120px, 0.8fr)", { def: true }),
  co("employees", "Employees", "minmax(96px, 0.6fr)", { def: true, sort: "employees", num: true }),
  co("revenue", "Revenue", "minmax(96px, 0.6fr)", { sort: "revenue", num: true }),
  co("hq", "HQ", "minmax(110px, 0.7fr)", { def: true, sort: "hq" }),
  {
    id: "history",
    type: "companies",
    label: "History",
    cost: "free",
    def: true,
    word: "on file",
    fill: (r) => (r.i.c.engagements.length ? "value" : "empty"),
    sort: "fit",
    tip: "How often this company hires fractionals (not how well it fits you).",
    width: "minmax(120px, 0.7fr)",
  },
  {
    id: "rate",
    type: "companies",
    label: "Rate paid",
    cost: 1,
    needs: "Opens after the company",
    word: "on file",
    fill: (r) => {
      const e = latest(r);
      return e ? of(e.cells.rate) : "empty";
    },
    tip: "What the latest seat paid, where a member shared it. 1 credit a row.",
    width: "minmax(110px, 0.7fr)",
    num: true,
  },
  {
    id: "decider",
    type: "companies",
    label: "Decision maker",
    cost: 1,
    needs: "Opens after the company",
    word: "on file",
    fill: (r) => {
      const d = deciderOf(r.i);
      return d ? (d.p.cells.name?.s === "empty" ? "empty" : of(d.p.cells.name)) : "empty";
    },
    tip: "The name and title of who hires, one purchase for both. 1 credit a row.",
    width: "minmax(160px, 1fr)",
  },
  {
    id: "email",
    type: "companies",
    label: "Work email",
    cost: 1,
    needs: "Opens after the decision maker's name",
    word: "on file",
    fill: (r) => {
      const d = deciderOf(r.i);
      return d ? of(d.p.cells.email) : "empty";
    },
    tip: "The decision maker's email. 1 credit a row, once you see their name.",
    width: "minmax(170px, 1fr)",
  },
  co("motion", "Sales motion", "minmax(120px, 0.8fr)"),
  co("ownership", "Ownership", "minmax(110px, 0.7fr)"),
  co("businessModel", "Business model", "minmax(100px, 0.6fr)"),
  co("dealSize", "Deal size", "minmax(100px, 0.6fr)"),
];

const eng = (field: string, label: string, width: string, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  id: field,
  type: "engagements",
  label,
  cost: "free",
  word: "on file",
  fill: (r) => (r.e ? of(r.e.cells[field]) : "empty"),
  width,
  ...extra,
});

export const SEAT_COLUMNS: ColumnDef[] = [
  { ...COMPANY_COLUMNS[0], type: "engagements" },
  eng("function", "Function", "minmax(110px, 0.7fr)", { def: true, sort: "fn" }),
  eng("role", "Role", "minmax(150px, 1fr)", { def: true, cost: 1, needs: "Comes with who held it" }),
  eng("type", "Type", "minmax(90px, 0.6fr)", { def: true }),
  eng("status", "Status", "minmax(100px, 0.6fr)", { def: true }),
  eng("operator", "Held by", "minmax(140px, 0.9fr)", { def: true, cost: 1, needs: "Opens with the company", word: "named", tip: "Free once the company is open." }),
  eng("start", "Start", "minmax(90px, 0.6fr)", { def: true, sort: "start" }),
  eng("end", "End", "minmax(90px, 0.6fr)", { def: true, cost: 1, needs: "A dated end on a seat that ended" }),
  eng("rate", "Rate", "minmax(100px, 0.6fr)", { def: true, cost: 1, needs: "Opens after the company", num: true }),
  eng("hours", "Hours a week", "minmax(90px, 0.6fr)", { num: true }),
  eng("posting", "Job posting", "minmax(120px, 0.7fr)", { cost: 1 }),
];

const person = (field: string, label: string, width: string, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  id: field,
  type: "people",
  label,
  cost: "free",
  word: "on file",
  fill: (r) => (r.p ? of(r.p.cells[field]) : "empty"),
  width,
  ...extra,
});

/**
 * People (People.dc.html). "How you know them", "Last touch" and "In pipeline" are the member's own
 * (their sources and their pipeline, read by the People page, people/People.tsx, which fills them and
 * their fill rates); here they count nothing, and only that page shows them by default.
 */
const own = (id: string, label: string, width: string, word: string, tip: string): ColumnDef => ({ id, type: "people", label, cost: "free", word, fill: () => "empty", width, tip });
export const PEOPLE_COLUMNS: ColumnDef[] = [
  { ...COMPANY_COLUMNS[0], type: "people" },
  person("name", "Name and title", "minmax(240px, 1.5fr)", { def: true, cost: 1, needs: "Opens after the company", sort: "title", tip: "1 credit shows a name and title together. Email, phone and public profile open after that, 1 credit each." }),
  person("relationship", "Relationship", "minmax(134px, 0.8fr)", { def: true, tip: "Their part in hiring the fractional. Free to see." }),
  own("know", "How you know them", "minmax(160px, 1.1fr)", "matched", "From your own contacts, calendar, connections file and CSV. Only you see this."),
  person("email", "Email", "minmax(150px, 1fr)", { def: true, cost: 1, needs: "Opens after the name", tip: "1 credit, once you can see the name." }),
  person("phone", "Phone", "minmax(124px, 0.7fr)", { def: true, cost: 1, needs: "Opens after the name", tip: "1 credit, once you can see the name." }),
  person("linkedin", "Public profile", "minmax(124px, 0.7fr)", { def: true, cost: 1, needs: "Opens after the name", tip: "A link to their public profile. 1 credit, once you can see the name." }),
  own("last", "Last touch", "minmax(100px, 0.6fr)", "in touch", "The last meeting, email or message Merlin can see. It never reads what was said."),
  own("pipe", "In pipeline", "minmax(124px, 0.7fr)", "in pipeline", "The stage of the deal with their company."),
];

export const COLUMNS: Record<RecordType, ColumnDef[]> = { companies: COMPANY_COLUMNS, engagements: SEAT_COLUMNS, people: PEOPLE_COLUMNS };

/**
 * Ask Merlin's column words (lib/ask.ts ASK_COLS) as the companies columns they show. "Your way in"
 * (wayIn) has no column here yet: the ways in come from Warm paths (lib/paths), not from the rows
 * the table holds, so it is left out and Ask's chip for it sets nothing on this table.
 */
export const ASK_COLUMN: Record<string, string | null> = { decisionMaker: "decider", email: "email", rate: "rate", holder: "heldBy", wayIn: null };
/** The companies columns for Ask's column words, in order, each once; words with no column are left out. */
export function askColumns(cols: readonly string[]): string[] {
  return [...new Set(cols.map((c) => ASK_COLUMN[c] ?? null).filter((c): c is string => !!c && COMPANY_COLUMNS.some((x) => x.id === c)))];
}

export const columnOf = (type: RecordType, id: string): ColumnDef | undefined => COLUMNS[type].find((c) => c.id === id);
/** The columns a list shows before the member picks. */
export const defaultCols = (type: RecordType): string[] => COLUMNS[type].filter((c) => c.def).map((c) => c.id);

/**
 * The columns to show, in the registry's order: the fixed ones, then what was picked. Ids the
 * registry doesn't know (an old address, another list's column) are left out.
 */
export function visibleColumns(type: RecordType, picked: readonly string[] | null | undefined): ColumnDef[] {
  const want = new Set(picked ?? defaultCols(type));
  return COLUMNS[type].filter((c) => c.fixed || want.has(c.id));
}

/** "8 of 15 columns". */
export const columnCount = (type: RecordType, shown: number) => `${shown} of ${COLUMNS[type].length} columns`;

/**
 * One column's fill rate over the rows in view: how many count, of how many, and the percent
 * (rounded to a whole number). No rows: 0 of 0, 0 percent.
 */
export function fillRate(col: Pick<ColumnDef, "fill" | "counts">, rows: readonly Row[]): { filled: number; of: number; pct: number } {
  let filled = 0;
  for (const r of rows) {
    const f = col.fill(r);
    if (f === "value" || (f === "locked" && col.counts !== "value")) filled++;
  }
  return { filled, of: rows.length, pct: rows.length ? Math.round((100 * filled) / rows.length) : 0 };
}

/** The words under a heading: "100% on file", "40% open". */
export const fillWords = (col: Pick<ColumnDef, "fill" | "counts" | "word">, rows: readonly Row[]) => `${fillRate(col, rows).pct}% ${col.word}`;

/** The cost words in the column picker and the Tools list: "Free", "1 / row", "2 / row". */
export const costWords = (cost: ColumnDef["cost"]) => (cost === "free" ? "Free" : `${cost} / row`);

/**
 * What one row needs bought for a column to show (the Tools run's items), or why it can't be:
 *   "skip"   nothing to buy: it shows already, or there is nothing on file to buy (never charged);
 *   "wait"   something must open first (the company, or the person's name);
 *   a fact   the one lock that opens it (one purchase).
 */
export function rowNeed(colId: string, r: Row): FactRef | "skip" | "wait" {
  const i = r.i;
  if (colId === "company") return i.c.hidden ? { entity: "company", id: i.c.id, field: "identity" } : "skip";
  // A person's row (People): the name and title are one purchase; the email, phone and public profile open after it.
  const p = r.p;
  if (p && colId === "name") {
    const lead = (["name", "title"] as const).find((f) => p.cells[f]?.s === "locked");
    if (!lead) return "skip";
    return i.c.hidden ? "wait" : { entity: "contact", id: p.id, field: lead };
  }
  if (p && (colId === "email" || colId === "phone" || colId === "linkedin")) {
    if (p.cells[colId]?.s !== "locked") return "skip";
    if (i.c.hidden || p.cells.name?.s === "locked" || p.cells.title?.s === "locked") return "wait";
    return { entity: "contact", id: p.id, field: colId };
  }
  if (colId === "decider") {
    const d = deciderOf(i);
    if (!d) return "skip";
    const lead = (["name", "title"] as const).find((f) => d.p.cells[f]?.s === "locked");
    if (!lead) return "skip";
    return i.c.hidden ? "wait" : { entity: "contact", id: d.p.id, field: lead };
  }
  if (colId === "email") {
    const d = deciderOf(i);
    if (!d || d.p.cells.email?.s !== "locked") return "skip";
    if (i.c.hidden || d.p.cells.name?.s === "locked" || d.p.cells.title?.s === "locked") return "wait";
    return { entity: "contact", id: d.p.id, field: "email" };
  }
  if (colId === "rate") {
    const e = i.latest;
    if (!e || e.cells.rate?.s !== "locked") return "skip";
    return i.c.hidden ? "wait" : { entity: "engagement", id: e.id, field: "rate" };
  }
  return "skip";
}
