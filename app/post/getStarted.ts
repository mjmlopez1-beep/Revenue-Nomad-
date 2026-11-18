/**
 * Get started, step 1: what "See who held a seat" points at. Pure, so scripts/test-model.mts
 * checks it with no browser.
 *
 * The step sells the best fact on Merlin, a named fractional who held a seat. So it points at a
 * locked seat holder and nothing else: never a role, a rate or an end month, which a credit
 * often buys on a seat nobody is named on. It looks at every seat of every row (a company's
 * latest seat is usually a research seat with nobody named, while an older one has its holder on
 * file). With no seat holder locked anywhere in the member's table, the step says what it points
 * at instead: a person's name and title, or nothing at all (stepOneKind).
 */
import type { EngagementRec, PersonRec } from "@/lib/tableTypes";
import { PERSON_BUNDLE } from "@/lib/tableFields";
import { shown, type CoInfo, type FactRef, type Row } from "./model";

/** A seat holder the member can pay to see: a locked holder, on a seat that isn't theirs, at a company they can see. */
export const lockedHolder = (i: CoInfo, e: EngagementRec) => !i.c.hidden && !e.yours && e.cells.operator?.s === "locked";
/** A person whose name and title the member can pay to see, at a company they can see (a locked company's people open after it). */
export const lockedPerson = (i: CoInfo, p: PersonRec) => !i.c.hidden && PERSON_BUNDLE.some((f) => p.cells[f]?.s === "locked");

/** What step 1 can point at in the member's whole table. */
export type StepOne = "holder" | "person" | "none";

/** A seat holder if any is locked anywhere, else a person's name and title, else nothing (the step is left out). */
export function stepOneKind(infos: CoInfo[]): StepOne {
  let person = false;
  for (const i of infos) {
    if (i.c.hidden) continue;
    for (const e of i.engs) if (lockedHolder(i, e)) return "holder";
    if (!person && i.people.some(({ p }) => lockedPerson(i, p))) person = true;
  }
  return person ? "person" : "none";
}

/**
 * The member paid to see a seat holder, as the table shows it (the holder's cell is a value they
 * paid for). Ticks step 1 whichever lock bought it: a seat holder and the seat's role are one
 * purchase, so the credit may have gone through the role's lock.
 */
export function holderSeen(infos: CoInfo[]): boolean {
  for (const i of infos)
    for (const e of i.engs) {
      const c = e.cells.operator;
      if (!e.yours && c?.s === "value" && c.paid) return true;
    }
  return false;
}
/** The member paid to see a person's name and title somewhere. */
export function personSeen(infos: CoInfo[]): boolean {
  for (const i of infos)
    for (const { p } of i.people)
      if (PERSON_BUNDLE.some((f) => {
        const c = p.cells[f];
        return c?.s === "value" && !!c.paid;
      }))
        return true;
  return false;
}

/** Where step 1 points: the lock, its company, the row it is on (null: not in the list on screen), and the record card to open at. */
export interface StepTarget {
  t: FactRef;
  i: CoInfo;
  row: Row | null;
  /** The row's place in the list (-1 when the row is not in it). */
  idx: number;
  /** The seat or person the record opens at, when the lock is not on screen. */
  focus: string | null;
}

/** The seats a row stands for: a seat row its own seat, a company or a person row every seat at the company. */
const seatsOf = (r: Row): EngagementRec[] => (r.p ? r.i.engs : r.e ? [r.e] : r.i.engs);
/** The people a row stands for: a person row its person, a seat row the people on it, a company row everyone there. */
const peopleOf = (r: Row): PersonRec[] => (r.p ? [r.p] : r.e ? r.e.people : r.i.people.map((x) => x.p));

/**
 * The locked seat holder step 1 points at. Followed companies first, then seats in the member's
 * function, then the list's own order (and inside a row, the seat the row shows first, `shownSeat`).
 * The list on screen first; with no locked holder in it, the member's whole table (`infos`), where
 * the target has no row and its record opens instead.
 */
export function holderTarget(rows: Row[], infos: CoInfo[], fn: string | null, shownSeat: (r: Row) => EngagementRec | null | undefined = () => null): StepTarget | null {
  const pick = (list: Row[], inList: boolean): StepTarget | null => {
    let best: StepTarget | null = null;
    let bestKey: number[] = [];
    for (let idx = 0; idx < list.length; idx++) {
      const r = list[idx];
      const lead = shownSeat(r);
      const seats = seatsOf(r);
      const ordered = lead && seats.includes(lead) ? [lead, ...seats.filter((e) => e !== lead)] : seats;
      for (let k = 0; k < ordered.length; k++) {
        const e = ordered[k];
        if (!lockedHolder(r.i, e)) continue;
        const key = [r.i.c.following ? 0 : 1, fn && shown(e.cells.function) === fn ? 0 : 1, idx, k];
        if (best && !less(key, bestKey)) continue;
        best = { t: { entity: "engagement", id: e.id, field: "operator" }, i: r.i, row: inList ? r : null, idx: inList ? idx : -1, focus: e.id };
        bestKey = key;
      }
    }
    return best;
  };
  return pick(rows, true) ?? pick(infos.map((i) => ({ key: i.c.id, i })), false);
}

/**
 * With no seat holder locked anywhere: a person's name and title (one purchase), the same way.
 * Followed companies first, then the list's order, then the whole table.
 */
export function personTarget(rows: Row[], infos: CoInfo[]): StepTarget | null {
  const pick = (list: Row[], inList: boolean): StepTarget | null => {
    let best: StepTarget | null = null;
    let bestKey: number[] = [];
    for (let idx = 0; idx < list.length; idx++) {
      const r = list[idx];
      const people = peopleOf(r);
      for (let k = 0; k < people.length; k++) {
        const p = people[k];
        if (!lockedPerson(r.i, p)) continue;
        const key = [r.i.c.following ? 0 : 1, idx, k];
        if (best && !less(key, bestKey)) continue;
        const field = PERSON_BUNDLE.find((f) => p.cells[f]?.s === "locked")!;
        best = { t: { entity: "contact", id: p.id, field }, i: r.i, row: inList ? r : null, idx: inList ? idx : -1, focus: p.id };
        bestKey = key;
      }
    }
    return best;
  };
  return pick(rows, true) ?? pick(infos.map((i) => ({ key: i.c.id, i })), false);
}

/** Compare two rank keys, first difference wins. */
function less(a: number[], b: number[]): boolean {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
  return false;
}

/**
 * Set (sessionStorage) when a member finishes onboarding without an Ideal Fractional Profile:
 * the table doesn't ask them for one again in the same visit, so the first records sit higher.
 */
export const ICP_SKIPPED = "tp_icp_skipped";

/**
 * The cells that buy the same thing as a target's lock, for finding it on screen: a seat holder
 * and the seat's role are one purchase (either lock may be the one that spends), and so are a
 * person's name and title.
 */
export function sameBuy(t: FactRef): string[] {
  if (t.entity === "engagement" && t.field === "operator") return ["operator", "role"].map((f) => `${t.id}.${f}`);
  if (t.entity === "contact" && PERSON_BUNDLE.includes(t.field)) return [t.field, ...PERSON_BUNDLE.filter((f) => f !== t.field)].map((f) => `${t.id}.${f}`);
  return [`${t.id}.${t.field}`];
}
