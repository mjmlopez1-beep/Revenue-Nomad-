/**
 * The company page's own rules, pure so they can be tested without a page: the seats timeline,
 * a column's "N of M" on file, the tabs and their counts, the stage words, and the next move.
 * Nothing here spends or names: it reads the record as the member's table already has it
 * (CoInfo), so a locked company's name, website and people never reach it.
 */
import type { Cell, EngagementRec } from "@/lib/tableTypes";
import { STAGE_WORDS, type PipelineRec, type Stage } from "@/lib/pipeline";
import { isOpenSeat, shown, type CoInfo } from "../model";

/* ---------- the tabs ---------- */

export const TABS = ["overview", "seats", "people", "ways", "roles", "notes", "deal"] as const;
export type TabKey = (typeof TABS)[number];
export const TAB_NAME: Record<TabKey, string> = { overview: "Overview", seats: "Seats", people: "People", ways: "Ways in", roles: "Open roles", notes: "Notes and activity", deal: "Deal" };

/** A role still open: the scan follows it and it has not closed, or it is marked Open role. */
export const isOpenRole = (e: EngagementRec) => (e.opened ? !e.closed : isOpenSeat(e));
/** A role the scan listed, open or closed since: the Open roles tab lists these. */
export const isListedRole = (e: EngagementRec) => !!e.opened || isOpenSeat(e);

/** Everyone on file here: the company's people, then the people on its seats. */
export const peopleOf = (i: CoInfo) => i.people;

/** The tab a record opens at: a seat's (Seats, or Open roles for a listed role), a person's (People), else Overview. */
export function tabFor(i: CoInfo, focus: string | null): TabKey {
  if (!focus) return "overview";
  const e = i.engs.find((x) => x.id === focus);
  if (e) return isListedRole(e) && !e.yours ? "roles" : "seats";
  if (i.people.some(({ p }) => p.id === focus)) return "people";
  return "overview";
}

/* ---------- "N of M" on file ---------- */

/** A cell counts as on file when it holds a value or a lock (a lock is a value on file the member hasn't opened). */
export const onFile = (c: Cell | undefined) => !!c && (c.s === "value" || c.s === "locked");
/** "3 of 4": how many of these cells are on file. */
export function fillOf(cells: (Cell | undefined)[]): string {
  return `${cells.filter(onFile).length} of ${cells.length}`;
}
/** "5 of 7 filled": how many of a company's facts are on file. */
export const filledOf = (cells: Record<string, Cell>, fields: string[]) => `${fields.filter((f) => onFile(cells[f])).length} of ${fields.length} filled`;

/* ---------- the seats timeline ---------- */

/** A month on file as a number of months since year 0 ("2024-02" is 2024*12+1), or the year alone ("2024"). */
export function monthOf(v: string | null | undefined): { m: number; yearOnly: boolean } | null {
  if (!v) return null;
  const ym = /^(\d{4})-(\d{2})/.exec(v);
  if (ym) return { m: Number(ym[1]) * 12 + Number(ym[2]) - 1, yearOnly: false };
  const y = /^(\d{4})$/.exec(v.trim());
  if (y) return { m: Number(y[1]) * 12, yearOnly: true };
  return null;
}

export interface Bar {
  id: string;
  /** "Finance · Fractional CFO", or the function alone while the role is locked. */
  label: string;
  /** "Mar 2026, still going", "Jan 2024 to Feb 2025", "Jun 2022, end locked". */
  when: string;
  /** Where it starts and how wide, as a share of the timeline (0 to 1). */
  left: number;
  width: number;
  kind: "going" | "ended" | "endLocked" | "open" | "year";
}

const ONGOING = /^(ongoing|present|now|current)$/i;

/**
 * The seats on a timeline from the first year on file to this year. A seat's bar runs from its
 * start month to its end month, or to now while it is still going. Never a guessed month: a seat
 * with a year only is drawn as that whole year, faint ("year"); a seat whose end is still locked
 * is a short dashed mark at its start ("endLocked"), not a bar of a length nobody has paid to see;
 * a seat with no start is left out. An open role is a mark at the day it was listed.
 */
export function timelineOf(i: CoInfo, nowMs = Date.now(), fmt: (m: string) => string = (m) => m): { years: number[]; bars: Bar[] } {
  const now = new Date(nowMs);
  const nowM = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const rows = i.engs
    .map((e) => {
      const listed = isListedRole(e) && !!e.opened;
      const start = monthOf(listed ? e.opened : shown(e.cells.start));
      return { e, start, listed };
    })
    .filter((r): r is { e: EngagementRec; start: { m: number; yearOnly: boolean }; listed: boolean } => !!r.start && r.start.m <= nowM + 1);
  if (!rows.length) return { years: [], bars: [] };
  const first = Math.min(...rows.map((r) => Math.floor(r.start.m / 12)));
  const last = now.getUTCFullYear();
  // At least three years, so a seat that started this year still reads against the ones before.
  const y0 = Math.min(Math.max(first, last - 9), last - 2);
  const years = Array.from({ length: last - y0 + 1 }, (_, k) => y0 + k);
  const span = years.length * 12;
  const at = (m: number) => Math.max(0, Math.min(1, (m - y0 * 12) / span));
  const bars = rows
    .sort((a, b) => b.start.m - a.start.m)
    .map(({ e, start, listed }): Bar => {
      const fn = shown(e.cells.function);
      const role = shown(e.cells.role);
      const label = [fn, role ?? (listed ? "open role" : null)].filter(Boolean).join(" · ") || "A fractional seat";
      const startWords = listed ? `Listed ${fmt(e.opened!.slice(0, 7))}` : fmt(shown(e.cells.start)!);
      if (listed && isOpenRole(e)) return { id: e.id, label, when: startWords, left: at(start.m), width: Math.max(0.012, 1 / span), kind: "open" };
      const endCell = e.cells.end;
      const status = shown(e.cells.status);
      const endV = shown(endCell);
      const going = (!!endV && ONGOING.test(endV)) || (!endV && endCell?.s !== "locked" && status !== "Ended" && !listed);
      if (start.yearOnly) return { id: e.id, label, when: going ? `${startWords}, still going` : `${startWords}`, left: at(start.m), width: 12 / span, kind: "year" };
      if (going) return { id: e.id, label, when: `${startWords}, still going`, left: at(start.m), width: Math.max(1 / span, at(nowM + 1) - at(start.m)), kind: "going" };
      const end = monthOf(endV);
      if (end && !end.yearOnly && end.m >= start.m) return { id: e.id, label, when: `${startWords} to ${fmt(endV!)}`, left: at(start.m), width: Math.max(1 / span, at(end.m + 1) - at(start.m)), kind: "ended" };
      // The end is locked, missing, or a year only: a mark at the start, never a guessed length.
      return { id: e.id, label, when: endCell?.s === "locked" ? `${startWords}, end locked` : `${startWords}, ended`, left: at(start.m), width: 1 / span, kind: "endLocked" };
    });
  return { years, bars };
}

/* ---------- the deal ---------- */

/** The stages the Deal tab offers, in order (Merlin's own words, lib/pipeline.ts). Went quiet is Merlin's to set. */
export const DEAL_STAGES = ["reach", "sent", "replied", "meeting", "proposal", "won"] as const;
export const stageWord = (s: Stage | null | undefined) => (s ? STAGE_WORDS[s] : "Not in your pipeline");
/** The member's deal at a company: the open one there, else the latest. */
export function dealOf(entries: PipelineRec[] | undefined, companyId: string): PipelineRec | null {
  const all = (entries ?? []).filter((e) => e.company === companyId);
  return all.find((e) => ["reach", "sent", "replied", "meeting", "proposal"].includes(e.stage)) ?? all[0] ?? null;
}

/** The header's primary action by the deal's stage: what to do next there. */
export type Prim = { label: string; go: "ways" | "proposals" | "seat" | "pipeline" | "add" };
export function primaryFor(stage: Stage | null): Prim {
  switch (stage) {
    case null:
      return { label: "Add to pipeline", go: "add" };
    case "reach":
      return { label: "Draft a note", go: "ways" };
    case "sent":
      return { label: "See your way in", go: "ways" };
    case "replied":
    case "meeting":
      return { label: "Start a proposal", go: "proposals" };
    case "proposal":
      return { label: "Open your proposals", go: "proposals" };
    case "won":
      return { label: "Add it as your seat", go: "seat" };
    default:
      return { label: "See your pipeline", go: "pipeline" };
  }
}

/* ---------- the next move ---------- */

export interface NextMoveCard {
  title: string;
  body: string;
  steps?: string[];
  /** What its button does, and says. */
  go?: Prim["go"] | "open" | "add-fact";
  btn?: string;
  due?: boolean;
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * The one next step with this company, by what the member has here. Locked: open it (free on the
 * trial). Then their deal's own next step when there is one, else the warmest way in on file: a
 * fellow fractional who held a seat here and is on Merlin (free to message), a decision maker they
 * can see, else Add it to your pipeline.
 */
export function nextMoveOf(i: CoInfo, deal: PipelineRec | null, o: { freeOpen: boolean; due?: string | null }): NextMoveCard {
  const c = i.c;
  if (c.hidden)
    return {
      title: "Open this company",
      body: o.freeOpen ? "It is free for you today. The button is at the top of this page. Then:" : "The button is at the top of this page. Then:",
      steps: ["See who held each seat, at no charge.", "Message the fractional who held a seat here, or draft a note to who decides.", "Add it to your pipeline and Merlin tracks the deal."],
      go: "open",
    };
  if (deal && deal.stage !== "lost" && deal.stage !== "notnow" && deal.stage !== "quiet") {
    const p = primaryFor(deal.stage);
    const due = !!o.due;
    return { title: deal.next ? deal.next.replace(/\.$/, "") : p.label, body: [deal.how, o.due].filter(Boolean).join(". ") || `It is at ${STAGE_WORDS[deal.stage]} in your pipeline.`, go: p.go, btn: p.label, due };
  }
  if (deal) return { title: "Keep following them", body: "Merlin tells you when a seat ends, a role opens or a new leader joins here. That is the moment to come back.", go: "pipeline", btn: "See your pipeline" };
  const member = i.engs.find((e) => !e.yours && e.cells.operator?.s === "value" && !!e.cells.operator.member && !e.cells.operator.member.you);
  if (member && member.cells.operator?.s === "value") {
    const n = member.cells.operator.v;
    const fn = shown(member.cells.function);
    return { title: `Message ${n}`, body: `${first(n)} held their ${fn ? `${fn} ` : ""}seat and is on Merlin. A fractional who worked there is the warmest way in, and messaging is free.`, go: "ways", btn: `Write to ${first(n)}` };
  }
  const buyer = i.people.find(({ p }) => p.cells.name?.s === "value" && ["Decision maker", "Hiring for the seat", "Reported to"].includes(shown(p.cells.relationship) ?? ""));
  if (buyer && buyer.p.cells.name?.s === "value") {
    const n = buyer.p.cells.name.v;
    const t = shown(buyer.p.cells.title);
    const rel = (shown(buyer.p.cells.relationship) ?? "Decision maker").toLowerCase();
    return { title: `Reach out to ${n}`, body: `${t ? `${t}, ` : ""}${rel} here. Merlin drafts the note in your voice and you send it from your own mail.`, go: "ways", btn: `Draft a note to ${first(n)}` };
  }
  return { title: "Add it to your pipeline", body: "Then Merlin moves the stage as you reach out, talk and send a proposal.", go: "add", btn: "Add to pipeline" };
}
