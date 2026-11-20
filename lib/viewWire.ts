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
  /**
   * What the page needs besides to draw the app before the full view (app/Root.tsx makes a View of
   * this answer until it lands): the credits a new member starts with (View.stats.starter),
   * whether email is on (View.email), the help addresses (View.contact) and the table's version.
   */
  starter?: number;
  email?: boolean;
  contact?: View["contact"];
  version?: string;
}

/** The cells the view sends for each record: every field but the identity ones (see fullView in lib/table.ts). */
const KEYS: Record<Entity, string[]> = {
  company: ALL_FIELDS.filter((x) => x.entity === "company" && !x.f.identity).map((x) => x.f.key),
  engagement: ALL_FIELDS.filter((x) => x.entity === "engagement" && !x.f.identity).map((x) => x.f.key),
  contact: ALL_FIELDS.filter((x) => x.entity === "contact" && !x.f.identity).map((x) => x.f.key),
};

/*
 * On the wire a cell leaves out what most cells say: mine false, no confirmations, not confirmed
 * by me, and a fact from our own records says so as `r: 1` (`from: "records"` is on most of the
 * seed's cells). A company's About that loads with its record (the table's marker, ABOUT_LATER in
 * lib/table.ts) is `{ s: "value", lazy: true }`.
 */
type Wire = Record<string, unknown>;
const isAboutLater = (c: Wire) => c.s === "value" && c.system === true && c.lazy === true && c.v === "" && c.ver === 0 && Object.keys(c).length === 5;
/** A cell without the values every cell has unless said otherwise. */
const slim = (c: Cell): Cell => {
  const x = c as unknown as Wire;
  if (c.s === "value" && !c.system) {
    const { mine, ver, iv, from, ...rest } = x;
    // `from` is the first key after iv where the server writes it (cellOf), so whole() can put it back there.
    return { ...rest, ...(from === "records" ? { r: 1 } : from !== undefined ? { from } : {}), ...(mine ? { mine } : {}), ...(ver ? { ver } : {}), ...(iv ? { iv } : {}) } as unknown as Cell;
  }
  if (c.s === "locked") {
    const { ver, from, ...rest } = x;
    return { ...rest, ...(ver ? { ver } : {}), ...(from === "records" ? { r: 1 } : from !== undefined ? { from } : {}) } as unknown as Cell;
  }
  if (isAboutLater(x)) return { s: "value", lazy: true } as unknown as Cell;
  return c;
};
/** That cell whole again, its keys in the order the server writes them. */
const whole = (c: Cell): Cell => {
  const x = c as unknown as Wire;
  if (c.s === "value" && x.lazy === true && !("v" in x)) return { s: "value", v: "", ver: 0, system: true, lazy: true };
  if (c.s === "value" && !c.system) {
    const { s, v, mine, ver, iv, r, from, ...rest } = x;
    return { s, v, mine: mine ?? false, ver: ver ?? 0, iv: iv ?? false, ...(r === 1 ? { from: "records" } : from !== undefined ? { from } : {}), ...rest } as unknown as Cell;
  }
  if (c.s === "locked") {
    const { s, ver, r, from, ...rest } = x;
    return { s, ver: ver ?? 0, ...(r === 1 ? { from: "records" } : from !== undefined ? { from } : {}), ...rest } as unknown as Cell;
  }
  return c;
};
const drop = (cells: Record<string, Cell>) => {
  const out: Record<string, Cell> = {};
  for (const k in cells) if (cells[k].s !== "empty") out[k] = slim(cells[k]);
  return out;
};
/** The cells again in the order the server builds them (KEYS), with the empty ones back. */
const fill = (entity: Entity, cells: Record<string, Cell>, dflt?: Record<string, Cell>) => {
  const out: Record<string, Cell> = {};
  for (const k of KEYS[entity]) out[k] = cells[k] ? whole(cells[k]) : (dflt?.[k] ?? { s: "empty" });
  for (const k in cells) if (!(k in out)) out[k] = whole(cells[k]);
  return out;
};

/**
 * A seat's source cell says what the seat's `source` says ({ s: "value", v: source, ver: 0,
 * system: true }) on nearly every seat: on the wire it is left out, and an empty one is sent as
 * it is so it can't be taken for that.
 */
const sourceCell = (source: string): Cell => ({ s: "value", v: source, ver: 0, system: true });
const isSourceCell = (c: Cell | undefined, source: string) => {
  const x = c as unknown as Wire | undefined;
  return !!x && !!source && x.s === "value" && x.v === source && x.ver === 0 && x.system === true && Object.keys(x).length === 4;
};

/**
 * The values most records have, which the wire leaves out: no logo domain, no region, nobody on
 * file, not followed, never changed, not the member's; a seat not verified, not theirs, never
 * changed. unpackCompany and unpackSeat put them back where the server writes them (fullView in
 * lib/table.ts: a company's id, name, hidden, iconDomain, cells, friendly, country, region,
 * engagements, people, following, facts, updatedAt, mine, then the rest; a seat's id, source,
 * verified, cells, people, updatedAt, yours, then the rest).
 */
const CO_DEFAULT: Wire = { iconDomain: null, region: null, people: [], following: false, updatedAt: null, mine: false };
const ENG_DEFAULT: Wire = { verified: false, people: [], updatedAt: null, yours: false };
const isDefault = (v: unknown, d: unknown) => v === d || (Array.isArray(v) && Array.isArray(d) && !v.length && !d.length);
/** `x` without its keys that hold their default. */
const lean = (x: Wire, dflt: Wire): Wire => {
  const out: Wire = {};
  for (const k in x) if (!(k in dflt) || !isDefault(x[k], dflt[k])) out[k] = x[k];
  return out;
};

const packPerson = (p: PersonRec): PersonRec => ({ ...p, cells: drop(p.cells) });
const packSeat = (e: EngagementRec): EngagementRec => {
  const cells = drop(e.cells);
  if (isSourceCell(e.cells.source, e.source)) delete cells.source;
  else if (e.cells.source?.s === "empty") cells.source = { s: "empty" };
  return lean({ ...e, cells, people: e.people.map(packPerson) } as unknown as Wire, ENG_DEFAULT) as unknown as EngagementRec;
};
/** One company in its wire form (a new object). GET ?today=1 sends its few companies this way. */
export const packCompany = (c: CompanyRec): CompanyRec =>
  lean({ ...c, cells: drop(c.cells), engagements: c.engagements.map(packSeat), people: c.people.map(packPerson) } as unknown as Wire, CO_DEFAULT) as unknown as CompanyRec;

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

const unpackPerson = (p: PersonRec): PersonRec => ({ ...p, cells: fill("contact", p.cells) });
const unpackSeat = (w: EngagementRec): EngagementRec => {
  const x = w as unknown as Wire;
  const yours = x.yours ?? false;
  // In the order the server writes a seat, written out: this runs for every seat on every load.
  const cells = fill("engagement", w.cells, w.source ? { source: sourceCell(w.source) } : undefined);
  // The seat holder's own "Who introduced you" (not a table field, so not in KEYS): theirs alone, empty until they add it.
  if (yours && !cells.introducedBy) cells.introducedBy = { s: "empty" };
  const e: Wire = { id: x.id, source: x.source, verified: x.verified ?? false, cells, people: w.people ? w.people.map(unpackPerson) : [], updatedAt: "updatedAt" in x ? x.updatedAt : null, yours };
  for (const k in x) if (!(k in e)) e[k] = x[k];
  return e as unknown as EngagementRec;
};
/** A packed company whole again, as the server built it (a new object). */
export function unpackCompany(w: CompanyRec): CompanyRec {
  const x = w as unknown as Wire;
  // In the order the server writes a company, written out: this runs for every company on every load.
  const c: Wire = {
    id: x.id, name: x.name, hidden: x.hidden, iconDomain: "iconDomain" in x ? x.iconDomain : null, cells: fill("company", w.cells), friendly: x.friendly, country: x.country,
    region: "region" in x ? x.region : null, engagements: w.engagements.map(unpackSeat), people: w.people ? w.people.map(unpackPerson) : [], following: x.following ?? false, facts: x.facts,
    updatedAt: "updatedAt" in x ? x.updatedAt : null, mine: x.mine ?? false,
  };
  for (const k in x) if (!(k in c)) c[k] = x[k];
  return c as unknown as CompanyRec;
}

/** A packed view whole again, in place (it was just parsed). A full view comes back as it is. */
export function unpackView(v: View): View {
  if (!(v as View & { packed?: boolean }).packed) return v;
  delete (v as View & { packed?: boolean }).packed;
  v.companies = v.companies.map(unpackCompany);
  return v;
}
