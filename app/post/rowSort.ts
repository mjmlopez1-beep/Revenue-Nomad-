/**
 * How each column of the company, seat and people lists sorts when its header is clicked
 * (app/ui/sortable.tsx): the value the row shows there, or null when it is blank, locked or hidden,
 * so a sort never reads what the member can't see and locks go last. Keyed by the column ids of
 * the workbench (workbench/columns.ts) and the old tables (Tables.tsx HEAD), which share them.
 * Pure: scripts/test-sort.mts reads it as the tables do.
 */
import type { Cell, EngagementRec } from "@/lib/tableTypes";
import { RN_EMPLOYEES, RN_REVENUE, SOURCE_LABEL } from "@/lib/tableFields";
import type { SortCol, SortKind, SortVal } from "@/app/ui/sortable";
import { hireOfRow, isOpenRole, type HireCtx, type Row } from "./model";
import { deciderOf } from "./workbench/columns";
import { closestOf } from "./workbench/closest";

const val = (c: Cell | undefined): string | null => (c && c.s === "value" && c.v.trim() ? c.v : null);
/** The seat a row speaks for: its own (a seat or a person tied to one), else the company's latest. */
const seatOf = (r: Row): EngagementRec | null => r.e ?? r.i.latest ?? null;
/** The open role a Hiring now row shows: its own, else the company's first open role. */
const openOf = (r: Row): EngagementRec | null => (r.e && isOpenRole(r.e) ? r.e : r.i.engs.find(isOpenRole) ?? null);
/** A band by its place on its list (bands go up); off the list, null. */
const band = (list: readonly string[], v: string | null) => {
  const n = v ? list.indexOf(v) : -1;
  return n < 0 ? null : n;
};
const co = (f: string) => (r: Row) => val(r.i.c.cells[f]);
const seat = (f: string) => (r: Row) => {
  const e = seatOf(r);
  return e ? val(e.cells[f]) : null;
};
/** A locked company's name never sorts; the Crystal Ball's free name for it does, as it shows there. */
const companyName = (r: Row): string | null => (r.i.c.hidden ? r.i.c.shownName ?? null : r.i.c.name || null);
const MATCH_RANK: Record<string, number> = { Same: 3, Close: 2, Different: 1 };

export interface RowSortCtx {
  /** Recently hired: the hire each row matched, in these functions and window. */
  hire?: HireCtx | null;
}

/** The sort of each column id: its kind and the value it shows. */
export function rowSortSpec(id: string, ctx: RowSortCtx = {}): { kind: SortKind; get: (r: Row) => SortVal } | null {
  switch (id) {
    case "company":
    case "name": // a list's name column: a person's name on People, else the company
      return { kind: "text", get: (r) => (id === "name" && r.p ? val(r.p.cells.name) : companyName(r)) };
    case "heldBy":
    case "operator":
      return {
        kind: "text",
        get: (r) => {
          const e = seatOf(r);
          return e ? val(e.cells.operator) ?? (e.yours ? "You" : null) : null;
        },
      };
    case "seat": // the latest seat: when it started (or since when its role is open)
      return {
        kind: "date",
        get: (r) => {
          const e = r.i.latest;
          return e ? val(e.cells.start) ?? e.opened ?? null : null;
        },
      };
    case "hire": // Recently hired: the matched hire's start month
      return {
        kind: "date",
        get: (r) => {
          const e = hireOfRow(r, ctx.hire?.fns ?? [], ctx.hire?.within ?? 0);
          return e ? val(e.cells.start) : null;
        },
      };
    case "hireHeldBy": // Recently hired: who held the matched hire's seat (else the latest seat's, as the row shows)
    case "hireRate":
      return {
        kind: id === "hireRate" ? "money" : "text",
        get: (r) => {
          const e = hireOfRow(r, ctx.hire?.fns ?? [], ctx.hire?.within ?? 0) ?? r.i.latest;
          if (!e) return null;
          return id === "hireRate" ? val(e.cells.rate) : val(e.cells.operator) ?? (e.yours ? "You" : null);
        },
      };
    case "openRole":
    case "listed": // an open role: the day it was posted, else first seen
      return {
        kind: "date",
        get: (r) => {
          const e = openOf(r);
          return e ? e.posted ?? e.opened ?? null : null;
        },
      };
    case "fns":
      return { kind: "number", get: (r) => (r.i.fns.length ? r.i.fns.length : null) };
    case "employees":
      return { kind: "number", get: (r) => band(RN_EMPLOYEES, val(r.i.c.cells.employees)) };
    case "revenue":
      return { kind: "number", get: (r) => band(RN_REVENUE, val(r.i.c.cells.revenue)) };
    case "history":
      return { kind: "number", get: (r) => (r.i.c.engagements.length ? r.i.c.friendly.score : null) };
    case "industry":
    case "hq":
    case "motion":
    case "ownership":
    case "businessModel":
    case "dealSize":
      return { kind: "text", get: co(id) };
    case "rate":
      return { kind: "money", get: seat("rate") };
    case "postedRate":
      return { kind: "money", get: (r) => val(openOf(r)?.cells.rate) };
    case "postedHours":
      return { kind: "number", get: (r) => val(openOf(r)?.cells.hours) };
    case "openFn":
      return { kind: "text", get: (r) => val(openOf(r)?.cells.function) };
    case "openType":
      return { kind: "text", get: (r) => val(openOf(r)?.cells.type) };
    case "hours":
      return { kind: "number", get: seat("hours") };
    case "start":
    case "end":
      return { kind: "date", get: seat(id) };
    case "function":
    case "fn":
      return { kind: "text", get: seat("function") };
    case "role":
    case "type":
    case "status":
    case "reason":
    case "posting":
      return { kind: "text", get: seat(id) };
    case "source":
      return {
        kind: "text",
        get: (r) => {
          const s = seatOf(r)?.source;
          return s ? SOURCE_LABEL[s] ?? s : null;
        },
      };
    case "decider":
      return { kind: "text", get: (r) => val(deciderOf(r.i)?.p.cells.name) };
    case "email":
    case "phone":
    case "linkedin":
    case "relationship":
    case "title":
      // A person's own (People), else the company's decision maker's.
      return { kind: "text", get: (r) => val((r.p ?? deciderOf(r.i)?.p)?.cells[id]) };
    case "evidence":
      return {
        kind: "number",
        get: (r) => {
          const c = closestOf(r.i.c.id);
          return c ? MATCH_RANK[c.label] ?? null : null;
        },
      };
    default:
      return null;
  }
}

/** Sort columns for these ids (ids with no sort are left out), with each header's label. */
export function rowSortCols(cols: readonly { id: string; label: string }[], ctx: RowSortCtx = {}): SortCol<Row>[] {
  const out: SortCol<Row>[] = [];
  for (const c of cols) {
    const s = rowSortSpec(c.id, ctx);
    if (s) out.push({ key: c.id, label: c.label, ...s });
  }
  return out;
}
