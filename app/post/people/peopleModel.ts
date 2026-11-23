/**
 * The People page's rows (People.dc.html), as pure functions so scripts/test-people.mts reads them
 * as the page does: the four views (Decision makers, Hired a fractional, People I know, All), the
 * member's own people merged in (lib/paths knownView), the filter chips, the sorts, the fill rates
 * of the member's own columns, and the first visit's example rows.
 *
 * A row is the table's own person row (model.ts rowsFor "people": a record on Merlin, its locks
 * the server's), or one of the member's own people at a company on Merlin that Merlin holds no
 * record of ("own" rows: their own words, nothing to unlock). Nothing here reads a name the
 * record's cell doesn't hold.
 */
import type { Cell } from "@/lib/tableTypes";
import type { KnownPersonView } from "@/lib/paths/types";
import { example, type Example } from "../examples";
import type { CoInfo, Row } from "../model";

export type PeopleView = "dm" | "hired" | "known" | "all";
export const PEOPLE_VIEWS: { key: PeopleView; label: string }[] = [
  { key: "dm", label: "Decision makers" },
  { key: "hired", label: "Hired a fractional" },
  { key: "known", label: "People I know" },
  { key: "all", label: "All" },
];
/** Their part in hiring a fractional: hired the seat or managed it (free facts). */
export const HIRED_RELS = ["Hiring for the seat", "Reported to"];

export type Chip = "warm" | "email" | "nopipe" | "s1" | "s2" | "s3" | "aside";
export const CHIPS: { key: Chip; label: string }[] = [
  { key: "warm", label: "Strong or good" },
  { key: "email", label: "Email on file" },
  { key: "nopipe", label: "Not in pipeline" },
  { key: "s1", label: "1 to 50 people" },
  { key: "s2", label: "51 to 200 people" },
  { key: "s3", label: "201 or more people" },
  { key: "aside", label: "Set aside" },
];

export const PEOPLE_SORTS = ["best way in first", "last touch", "name, A to Z"] as const;

/** A row of the People page: the table's own row, and the member's own entry for them when there is one. */
export interface PeopleRow extends Row {
  /** How the member knows them (their own), or null. */
  k: KnownPersonView | null;
  /** One of the member's own people that Merlin holds no record of. */
  own?: boolean;
}

const val = (c: Cell | undefined) => (c?.s === "value" && c.v ? c.v : null);
export const relOf = (r: Row) => (r.p ? val(r.p.cells.relationship) : null);
/** The name the member may see: the record's own cell, or the member's own words for their own row. */
export const nameOf = (r: PeopleRow) => (r.own ? r.k?.name ?? null : r.p ? val(r.p.cells.name) : null);
export const titleOf = (r: PeopleRow) => (r.own ? r.k?.title ?? null : r.p ? val(r.p.cells.title) : null);

/** The member's own people at companies on Merlin with no record there (or whose record isn't in this list), as rows. */
export function ownRows(known: readonly KnownPersonView[], byId: ReadonlyMap<string, CoInfo>, records: ReadonlySet<string>): PeopleRow[] {
  const out: PeopleRow[] = [];
  for (const k of known) {
    if (!k.company || (k.record && records.has(k.record))) continue;
    const i = byId.get(k.company);
    if (!i) continue;
    out.push({ key: `own:${k.key}`, i, k, own: true });
  }
  return out;
}

/** The table's person rows with the member's own entry for each (by the record it matched). */
export function withKnown(rows: readonly Row[], byRecord: ReadonlyMap<string, KnownPersonView>): PeopleRow[] {
  return rows.map((r) => ({ ...r, k: (r.p && byRecord.get(r.p.id)) || null }));
}

const WARM = { Hot: 4, Warm: 3, Fading: 2, Cold: 1 } as const;
/** Known, not set aside. */
export const knows = (r: PeopleRow) => !!r.k && !r.k.away;
const strongOrGood = (r: PeopleRow) => knows(r) && (r.k!.warmth === "Hot" || r.k!.warmth === "Warm");

/** In this view (the chip "Set aside" lists only the people set aside, in any view). */
export function inView(r: PeopleRow, view: PeopleView, aside: boolean): boolean {
  if (aside) return !!r.k?.away;
  if (r.k?.away) return false;
  if (view === "known") return knows(r);
  if (r.own) return view === "all";
  if (view === "dm") return relOf(r) === "Decision maker";
  if (view === "hired") return HIRED_RELS.includes(relOf(r) ?? "");
  return true;
}

/** The company's size group by its employees band ("11–50" is 1, "51–200" 2, larger 3), or 0 when not on file. */
export function sizeOf(i: CoInfo): 0 | 1 | 2 | 3 {
  const v = val(i.c.cells.employees);
  const n = v ? Number((/\d[\d,]*/.exec(v)?.[0] ?? "").replace(/,/g, "")) : NaN;
  if (!Number.isFinite(n)) return 0;
  return n <= 50 ? 1 : n <= 200 ? 2 : 3;
}

export interface ChipCtx {
  /** The companies (public ids) in the member's pipeline. */
  pipe: ReadonlySet<string>;
}
export function passesChips(r: PeopleRow, on: ReadonlySet<Chip>, cx: ChipCtx): boolean {
  if (on.has("warm") && !strongOrGood(r)) return false;
  if (on.has("email") && !(r.own ? !!r.k?.email : r.p?.cells.email && r.p.cells.email.s !== "empty")) return false;
  if (on.has("nopipe") && cx.pipe.has(r.i.c.id)) return false;
  const sizes = (["s1", "s2", "s3"] as const).filter((s) => on.has(s));
  if (sizes.length && !sizes.some((s) => sizeOf(r.i) === Number(s.slice(1)))) return false;
  return true;
}

/** What the search box reads: a name and title only where the member can see them, the company only when open. */
export function hayOf(r: PeopleRow): string {
  const open = !r.i.c.hidden;
  return [nameOf(r), titleOf(r), open ? r.i.c.name : null, relOf(r), r.i.teaser].filter(Boolean).join(" ").toLowerCase();
}

/**
 * The sorts: best way in first (how warm the member is with them, then a way in at their company,
 * then a name they can see), the last touch (newest first, never touched last), a name A to Z
 * (names they can't see last).
 */
export function sortPeople(rows: PeopleRow[], sort: number, ways: (companyId: string) => number): PeopleRow[] {
  const score = (r: PeopleRow) => (knows(r) ? WARM[(r.k!.warmth ?? "Cold") as keyof typeof WARM] * 10 + 2 : 0) + (ways(r.i.c.id) > 0 ? 5 : 0) + (nameOf(r) ? 1 : 0);
  const last = (r: PeopleRow) => (knows(r) && r.k!.last ? Date.parse(`${r.k!.last}T12:00:00Z`) : -Infinity);
  const nm = (r: PeopleRow) => (nameOf(r) ?? "~").toLowerCase();
  const out = rows.map((r, k) => ({ r, k }));
  out.sort((a, b) => {
    if (sort === 1) return last(b.r) - last(a.r) || a.k - b.k;
    if (sort === 2) return nm(a.r) < nm(b.r) ? -1 : nm(a.r) > nm(b.r) ? 1 : a.k - b.k;
    return score(b.r) - score(a.r) || a.k - b.k;
  });
  return out.map((x) => x.r);
}

/** How many of the rows in view count for one of the member's own columns. */
export function ownFill(col: "know" | "last" | "pipe", rows: readonly PeopleRow[], pipe: ReadonlySet<string>): { filled: number; of: number; pct: number } {
  const test = col === "know" ? knows : col === "last" ? (r: PeopleRow) => knows(r) && !!r.k!.last : (r: PeopleRow) => pipe.has(r.i.c.id);
  const filled = rows.filter(test).length;
  return { filled, of: rows.length, pct: rows.length ? Math.round((100 * filled) / rows.length) : 0 };
}

/* ---------- the first visit's examples (People I know before any source is in) ---------- */

export interface ExamplePerson {
  name: string;
  title: string;
  seat: string;
  rel: string;
  warm: "Strong" | "Good" | "Fading" | "Cold";
  why: string;
  last: string;
  lastKind: string;
}
/** Made up, never a record: drawn with the Example label, never counted, never sent. */
export const EXAMPLE_PEOPLE: readonly Example<ExamplePerson>[] = [
  example({ name: "Riley Chen", title: "CEO", seat: "Had a Fractional VP Sales", rel: "Decision maker", warm: "Strong", why: "6 meetings since March", last: "2 weeks ago", lastKind: "Meeting" }),
  example({ name: "Morgan Diaz", title: "COO", seat: "Open role: Fractional CRO", rel: "Hiring for the seat", warm: "Good", why: "Emails both ways", last: "Last month", lastKind: "Email" }),
  example({ name: "Casey Holt", title: "Founder", seat: "Had a Fractional CMO", rel: "Decision maker", warm: "Fading", why: "1 meeting last year", last: "Oct 2025", lastKind: "Meeting" }),
  example({ name: "Jamie Okoro", title: "VP Sales", seat: "No seat on file yet", rel: "", warm: "Cold", why: "A saved contact only", last: "None yet", lastKind: "" }),
];
