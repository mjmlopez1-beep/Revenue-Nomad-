/**
 * The member's table on the wire. Most cells are empty (nothing on file yet), and with a few
 * thousand companies those `{ s: "empty" }` stubs, and the `mine: false, ver: 0, iv: false` every
 * other cell carries, are a third of the answer. GET /api/table?compact=1 leaves them out
 * (packView) and the page puts them back as soon as it reads the answer (unpackView), so every
 * component sees exactly the view the server built. Shared by server and
 * client (no Node imports). Without ?compact=1 the answer is the full view, as before.
 */
import { ALL_FIELDS, type Entity } from "./tableFields";
import type { Cell, CompanyRec, EngagementRec, Me, PersonRec, PlanView, View } from "./tableTypes";
import type { RadarRow } from "./radar/types";

/**
 * GET /api/table?today=1[&since=ISO]: what Today draws before the full view arrives, a few KB
 * (under 20). The same sign-in as the view (401 signed out), and the same locks: the radar rows
 * are radarView's own (a company named only where the member's table names it, Trial and Pro
 * aside), and `companies` are the rows' records exactly as the member's table builds them.
 */
export interface TodayView {
  /** The member, as the view's `me`. */
  me: Me;
  /** Their plan, only while billing is live (me.plan). */
  plan?: PlanView;
  /** The free company of the day is still left (me.freeCompany). */
  freeCompany: boolean;
  radar: {
    /** The day shown (the latest day with companies, as Crystal Ball opens on), and the member's function. */
    day: string;
    fn: string | null;
    /** The day's top 4, ranked, the same shape as GET ?radar=1's rows. */
    rows: RadarRow[];
    /** How many companies that day has in all. */
    newCount: number;
    /** The radar is on, and has the function and profile it needs (RadarView.on and ready). Empty rows and not ready: Today falls back to the table. */
    on: boolean;
    ready: boolean;
  };
  /** Asked with &since=ISO (the previous visit): companies new in Crystal Ball, open roles opened in their function, follows with news. */
  since?: { radar: number; roles: number; follows: number; sinceIso: string };
  /**
   * The rows' companies, packed as the view packs them (unpackCompany puts the empty cells back;
   * fetchToday in app/ui/shared.tsx does): free facts, seats, who held them and the unlocks, as
   * the table shows them. Some are left off when they would take the answer past its size.
   */
  companies: CompanyRec[];
}

/** The cells the view sends for each record: every field but the identity ones (see fullView in lib/table.ts). */
const KEYS: Record<Entity, string[]> = {
  company: ALL_FIELDS.filter((x) => x.entity === "company" && !x.f.identity).map((x) => x.f.key),
  engagement: ALL_FIELDS.filter((x) => x.entity === "engagement" && !x.f.identity).map((x) => x.f.key),
  contact: ALL_FIELDS.filter((x) => x.entity === "contact" && !x.f.identity).map((x) => x.f.key),
};

/** A cell without the values every cell has unless said otherwise (mine false, no confirmations, not confirmed by me). */
const slim = (c: Cell): Cell => {
  if (c.s === "value" && !c.system) {
    const { mine, ver, iv, ...rest } = c;
    return { ...rest, ...(mine ? { mine } : {}), ...(ver ? { ver } : {}), ...(iv ? { iv } : {}) } as Cell;
  }
  if (c.s === "locked" && !c.ver) {
    const { ver: _v, ...rest } = c;
    return rest as Cell;
  }
  return c;
};
/** That cell whole again, its keys in the order the server writes them. */
const whole = (c: Cell): Cell => {
  if (c.s === "value" && !c.system) {
    const { s, v, mine, ver, iv, ...rest } = c;
    return { s, v, mine: mine ?? false, ver: ver ?? 0, iv: iv ?? false, ...rest };
  }
  if (c.s === "locked") {
    const { s, ver, ...rest } = c;
    return { s, ver: ver ?? 0, ...rest };
  }
  return c;
};
const drop = (cells: Record<string, Cell>) => {
  const out: Record<string, Cell> = {};
  for (const k in cells) if (cells[k].s !== "empty") out[k] = slim(cells[k]);
  return out;
};
/** The cells again in the order the server builds them (KEYS), with the empty ones back. */
const fill = (entity: Entity, cells: Record<string, Cell>) => {
  const out: Record<string, Cell> = {};
  for (const k of KEYS[entity]) out[k] = cells[k] ? whole(cells[k]) : { s: "empty" };
  for (const k in cells) if (!(k in out)) out[k] = whole(cells[k]);
  return out;
};

const packPerson = (p: PersonRec): PersonRec => ({ ...p, cells: drop(p.cells) });
const packSeat = (e: EngagementRec): EngagementRec => ({ ...e, cells: drop(e.cells), people: e.people.map(packPerson) });
/** One company without its empty cells (a new object). GET ?today=1 sends its few companies this way. */
export const packCompany = (c: CompanyRec): CompanyRec => ({ ...c, cells: drop(c.cells), engagements: c.engagements.map(packSeat), people: c.people.map(packPerson) });

/** The view without its empty cells. New objects: the view passed in is left as it was. */
export function packView(v: View): View {
  return { ...v, companies: v.companies.map(packCompany), packed: true } as View;
}

/**
 * Each company's packed JSON, kept with the record. Members' tables share most of their records
 * (lib/table.ts memberView), and a record is never changed once built, so each is turned into
 * JSON once for every member who gets it.
 */
const packedJson = new WeakMap<CompanyRec, string>();
/** Where the companies go in packedViewJson: the key with a value nothing else in a view holds (made up per process). */
const SLOT = `\u0000companies:${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}\u0000`;
/** JSON.stringify(packView(v)), byte for byte, from each company's kept JSON. Server side. */
export function packedViewJson(v: View): string {
  const parts = v.companies.map((c) => {
    let j = packedJson.get(c);
    if (j === undefined) packedJson.set(c, (j = JSON.stringify(packCompany(c))));
    return j;
  });
  const head = JSON.stringify({ ...v, companies: SLOT, packed: true });
  // The key with that value, unescaped: inside a string its quotes would be escaped, so this is the companies key itself.
  const slot = `"companies":${JSON.stringify(SLOT)}`;
  const at = head.indexOf(slot);
  return `${head.slice(0, at)}"companies":[${parts.join(",")}]${head.slice(at + slot.length)}`;
}

/** A packed company with its empty cells back, in place (it was just parsed). */
export function unpackCompany(c: CompanyRec): CompanyRec {
  c.cells = fill("company", c.cells);
  for (const p of c.people) p.cells = fill("contact", p.cells);
  for (const e of c.engagements) {
    e.cells = fill("engagement", e.cells);
    // The seat holder's own "Who introduced you" (not a table field, so not in KEYS): theirs alone, empty until they add it.
    if (e.yours && !e.cells.introducedBy) e.cells.introducedBy = { s: "empty" };
    for (const p of e.people) p.cells = fill("contact", p.cells);
  }
  return c;
}

/** A packed view with its empty cells back, in place (it was just parsed). A full view comes back as it is. */
export function unpackView(v: View): View {
  if (!(v as View & { packed?: boolean }).packed) return v;
  delete (v as View & { packed?: boolean }).packed;
  for (const c of v.companies) unpackCompany(c);
  return v;
}
