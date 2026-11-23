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
import type { EngagementRec, Me, PersonRec } from "@/lib/tableTypes";
import { COMPANY_PRICE, COMPANY_PRICE_SAY, PERSON_BUNDLE } from "@/lib/tableFields";
import { checkSteps, icpEmpty, shown, type CheckStep, type CoInfo, type FactRef, type Row } from "./model";
import { CRYSTAL_FREE_TODAY, yourFeature } from "@/lib/radar/types";

/** Get started's hint on Trial and Pro: every company in their Crystal Ball opens free. */
export const CRYSTAL_ALL_FREE = `Free in ${yourFeature}`;

/** A seat holder the member can pay to see: a locked holder, on a seat that isn't theirs, at a company they can see. */
export const lockedHolder = (i: CoInfo, e: EngagementRec) => !i.c.hidden && !e.yours && e.cells.operator?.s === "locked";
/** A person whose name and title the member can pay to see, at a company they can see (a locked company's people open after it). */
export const lockedPerson = (i: CoInfo, p: PersonRec) => !i.c.hidden && PERSON_BUNDLE.some((f) => p.cells[f]?.s === "locked");

/** What step 1 can point at in the member's whole table. */
export type StepOne = "holder" | "person" | "company" | "none";

/**
 * A seat holder if any is locked at a company the member can see, else a person's name and title
 * there, else a locked company (every company is locked until the member unlocks it, and its seat
 * holders open after it), else nothing (the step is left out).
 */
export function stepOneKind(infos: CoInfo[]): StepOne {
  let person = false;
  let company = false;
  for (const i of infos) {
    if (i.c.hidden) {
      company = true;
      continue;
    }
    for (const e of i.engs) if (lockedHolder(i, e)) return "holder";
    if (!person && i.people.some(({ p }) => lockedPerson(i, p))) person = true;
  }
  return person ? "person" : company ? "company" : "none";
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

/* ---------- the steps, with a goalpost that stays put ---------- */

/** What a Get started step or the next-step nudge runs. */
export type StepAction = "unlock" | "seats" | "fillSeats" | "holder" | "invite" | "note" | "connect";

/** Get started's three steps (activation): open a company, send a first note, bring your network in. */
export const STEP_LABELS = { unlock: "Open a company", note: "Send your first note", network: "Connect Google" } as const;
export const NOTE_HINT = "a note drafted for you on Home";
export const NETWORK_HINT = "or upload your LinkedIn connections";

/**
 * Get started as the app shows it: Open a company · Send your first note · Connect Google (or
 * upload LinkedIn), "1 of 3" on Home. Step 1 ticks on any company opened (or a seat holder seen,
 * which needs one) and never turns into another step once done; step 2 on a first note out (a deal
 * at Sent in their pipeline, an invite or a conversation: Me.started.note); step 3 on Google
 * connected or LinkedIn connections uploaded (Me.started.network), left out while Your network
 * isn't on. `next` is the one thing to do now, for the nudge slot: the first step not done, then
 * "Fill in your seats" and "Find your seats" (the earn prompts, kept outside the steps), then nothing.
 */
export function startSteps(
  me: Pick<Me, "goal" | "added" | "unlocked" | "holdersUnlocked" | "companiesUnlocked" | "invited" | "invitesPaid"> & Partial<Pick<Me, "freeCompany" | "unlocksLeft" | "crystal" | "proOpens" | "started">>,
  o: { seatsHeld: number; seatsLeft: number; earn: number; stuck?: Set<string>; seen?: boolean; stepOne?: StepOne },
): { steps: CheckStep[]; next: { label: string; hint: string; action: StepAction } | null } {
  const base = checkSteps(me, { ...o, stepOne: "holder" });
  const holders = me.holdersUnlocked ?? 0;
  const opened = holders + (me.companiesUnlocked ?? 0) > 0 || !!o.seen || !!o.stuck?.has("unlock");
  const free = me.proOpens ? me.proOpens.left > 0 : !!me.freeCompany && (me.unlocksLeft ?? Infinity) >= COMPANY_PRICE;
  // On Free (billing live) the free one a day is Crystal Ball's: the step says so, and opens Crystal Ball (TradingPost stepOne).
  // On Trial and Pro companies open free: the step says that first, and opens Crystal Ball too.
  const one: CheckStep = {
    key: "unlock",
    done: opened,
    label: STEP_LABELS.unlock,
    hint: me.crystal === "all" ? CRYSTAL_ALL_FREE : free ? (me.proOpens ? "free on your plan" : "1 free company today") : me.crystal === "one" ? CRYSTAL_FREE_TODAY : `costs ${COMPANY_PRICE_SAY}`,
  };
  const note: CheckStep = { key: "note", done: !!me.started?.note || !!o.stuck?.has("note"), label: STEP_LABELS.note, hint: NOTE_HINT };
  const network: CheckStep = { key: "network", done: !!me.started?.network || !!o.stuck?.has("network"), label: STEP_LABELS.network, hint: NETWORK_HINT };
  // Every company is open already and none was opened: nothing for step 1 to point at, so it is left out. So is step 3 while Your network is off.
  const steps = [...(!opened && o.stepOne === "none" ? [] : [one]), note, ...(me.started?.networkOff ? [] : [network])];
  const act: Record<CheckStep["key"], StepAction> = { unlock: "unlock", seat: "seats", invite: "invite", note: "note", network: "connect" };
  const up = steps.find((x) => !x.done);
  if (up) return { steps, next: { label: up.label, hint: up.hint, action: act[up.key] } };
  // Every step done: the earn prompts (fill in the seats on file, else find one).
  const fill = base.nudge ? { ...base.nudge, action: "fillSeats" as const } : null;
  const seats = o.seatsHeld === 0 ? { label: "Find your seats", hint: "up to ~12 credits a seat", action: "seats" as const } : null;
  return { steps, next: fill ?? seats };
}

/* ---------- the new look's six steps (RN_UI2, BUILD_PLAN F6) ---------- */

/** The six steps' keys, in order. */
export const SIX_KEYS = ["icp", "seat", "network", "open", "alert", "evidence"] as const;
export type SixKey = (typeof SIX_KEYS)[number];
/**
 * Evidence Bank (step 6) is built (Stage 5). It is a Close feature (owner decision): the step is
 * shown only to members with Close or the Close trial (SixInput.close); everyone else counts 5 steps.
 * Done once one of the member's cases is ready (SixInput.evidenceReady).
 */
export const EVIDENCE_ON = true;

export interface SixStep {
  key: SixKey;
  /** Its number among the six (1 to 6), kept when a step is left out. */
  n: number;
  label: string;
  /** What it takes, and what it gives back. */
  takes: string;
  gives: string;
  /** About how long it takes. */
  time: string;
  /** Its button. */
  go: string;
  /** A short note beside it ("Earns credits", "Free on the trial"), or none. */
  pill?: string;
  pillKind?: "earn" | "free";
  done: boolean;
}
export interface SixSteps {
  steps: SixStep[];
  /** How many are done, of how many are shown. */
  done: number;
  of: number;
  /** The first not done (the card's "Next: …"), or null when every step is. */
  next: SixStep | null;
  /** Minutes left, from each step's time. */
  minutes: number;
}

/** What the six steps read. Every one is derived from what the member has: nothing new is stored. */
export interface SixInput {
  me: Pick<Me, "icp" | "holdersUnlocked" | "companiesUnlocked" | "savedViews" | "started" | "crystal" | "proOpens" | "freeCompany" | "unlocksLeft">;
  /** Seats the member held (EngagementRec.yours, model.ts mySeats). */
  seatsHeld: number;
  /** A seat holder or a person they paid to see (holderSeen, personSeen): a company was open for it. */
  seen?: boolean;
  /** Steps done before in this browser stay done (a refund never takes a tick back). */
  stuck?: Set<string>;
  /** The member has Close or the Close trial (or billing is off): step 6, Evidence Bank, is theirs. */
  close?: boolean;
  /** Evidence Bank is built (EVIDENCE_ON; the tests pass it). */
  evidence?: boolean;
  /** The member's Evidence Bank cases that are ready (GET /api/evidence/closest): step 6 is done at one. */
  evidenceReady?: number;
}

const MIN = { icp: 2, seat: 5, network: 3, open: 1, alert: 1, evidence: 10 } as const;

/** A saved list with an alert on: its weekly email, or (F5) its alert switched on. */
export const alertOn = (v: { email?: boolean; alert?: { on?: boolean } }) => (v.alert ? !!v.alert.on : !!v.email);

/**
 * Getting started's six steps (BRIEF "The six steps"), each ticked from the member's own state:
 * 1 an ideal client on file (Profile.icp), 2 a seat they held, 3 Google, their LinkedIn
 * connections file or a contacts CSV brought in (Me.started.network; each works on its own, so it is
 * left out only when Google is off and the files are too: Me.started.networkOff without filesOn), 4 a company opened (a company or a seat holder unlocked, a Crystal Ball open
 * included), 5 a saved list with its alert on, 6 an evidence case ready (Close only: left out
 * without it). Example rows are never counted: nothing here reads a list's rows.
 */
export function sixSteps(x: SixInput): SixSteps {
  const { me } = x;
  const icpOn = !icpEmpty(me.icp);
  const opened = (me.holdersUnlocked ?? 0) + (me.companiesUnlocked ?? 0) > 0 || !!x.seen;
  const free = me.crystal === "all" || (me.proOpens ? me.proOpens.left > 0 : !!me.freeCompany && (me.unlocksLeft ?? Infinity) >= COMPANY_PRICE);
  const stuck = (k: SixKey) => !!x.stuck?.has(`six:${k}`);
  const all: SixStep[] = [
    { key: "icp", n: 1, label: "Say who your ideal client is", takes: "The function you sell, the industries and the company sizes.", gives: "Find, Crystal Ball and every list start tuned to these companies.", time: "2 minutes", go: icpOn ? "Change it" : "Set it", done: icpOn },
    { key: "seat", n: 2, label: "Add the seats you have held", takes: "The company, your role and the dates. The rate and hours if you want to share them.", gives: "1 credit for each fact Merlin does not have, up to 25 a day. Each seat becomes a way in.", time: "5 minutes", go: "Add your seats", pill: "Earns credits", pillKind: "earn", done: x.seatsHeld > 0 },
    { key: "network", n: 3, label: "Bring in who you know", takes: "Google contacts, your LinkedIn connections file or a contacts CSV. Merlin reads names and companies, never message text.", gives: "Warm paths: who can get you into which company.", time: "3 minutes", go: "Bring them in", done: !!me.started?.network },
    { key: "open", n: 4, label: "Open your first company", takes: "One click on a company in your list.", gives: "Its name, its website and who held the seat. It stays open for you.", time: "1 minute", go: "Go to Companies", ...(free ? { pill: me.proOpens ? "Free on your plan" : "Free today", pillKind: "free" as const } : {}), done: opened },
    { key: "alert", n: 5, label: "Save a list with an alert", takes: "Save a list and keep its email on.", gives: "Merlin watches the list and tells you when a company on it starts hiring.", time: "1 minute", go: "Go to your lists", done: (me.savedViews ?? []).some(alertOn) },
    { key: "evidence", n: 6, label: "Write your first evidence case", takes: "The problem, what you did, and the numbers before and after. The client name stays hidden unless you show it.", gives: "It fills the Proof part of every proposal you send.", time: "10 minutes", go: "Go to Evidence Bank", done: (x.evidenceReady ?? 0) > 0 },
  ];
  const steps = all
    .filter((s) => (s.key !== "evidence" || ((x.evidence ?? EVIDENCE_ON) && !!x.close)) && (s.key !== "network" || !me.started?.networkOff || !!me.started?.filesOn || s.done))
    .map((s) => (stuck(s.key) ? { ...s, done: true } : s));
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? null;
  return { steps, done, of: steps.length, next, minutes: steps.filter((s) => !s.done).reduce((n, s) => n + MIN[s.key], 0) };
}

/** The rail card's line: "2 of 5 done". */
export const sixLine = (s: Pick<SixSteps, "done" | "of">) => `${s.done} of ${s.of} done`;
