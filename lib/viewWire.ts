/**
 * The member's table on the wire. Most cells are empty (nothing on file yet), and with a few
 * thousand companies those `{ s: "empty" }` stubs, and the `mine: false, ver: 0, iv: false` every
 * other cell carries, are a third of the answer. GET /api/table?compact=1 leaves them out
 * (packView) and the page puts them back as soon as it reads the answer (unpackView), so every
 * component sees exactly the view the server built. Shared by server and
 * client (no Node imports). Without ?compact=1 the answer is the full view, as before.
 */
import { ALL_FIELDS, type Entity } from "./tableFields";
import type { Cell, CompanyRec, EngagementRec, PersonRec, View } from "./tableTypes";

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

/** The view without its empty cells. New objects: the view passed in is left as it was. */
export function packView(v: View): View {
  const person = (p: PersonRec): PersonRec => ({ ...p, cells: drop(p.cells) });
  const seat = (e: EngagementRec): EngagementRec => ({ ...e, cells: drop(e.cells), people: e.people.map(person) });
  const company = (c: CompanyRec): CompanyRec => ({ ...c, cells: drop(c.cells), engagements: c.engagements.map(seat), people: c.people.map(person) });
  return { ...v, companies: v.companies.map(company), packed: true } as View;
}

/** A packed view with its empty cells back, in place (it was just parsed). A full view comes back as it is. */
export function unpackView(v: View): View {
  if (!(v as View & { packed?: boolean }).packed) return v;
  delete (v as View & { packed?: boolean }).packed;
  for (const c of v.companies) {
    c.cells = fill("company", c.cells);
    for (const p of c.people) p.cells = fill("contact", p.cells);
    for (const e of c.engagements) {
      e.cells = fill("engagement", e.cells);
      for (const p of e.people) p.cells = fill("contact", p.cells);
    }
  }
  return v;
}
