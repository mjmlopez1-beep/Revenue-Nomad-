/**
 * Your three moves today (Home): for each of up to three companies from the member's Crystal Ball,
 * the company, the best way in, and one thing to do about it. And the note Merlin drafts for it.
 *
 * Everything here is worked out from what the member can already see, and nothing else:
 *   - the Crystal Ball row (lib/radar RadarRow: its lines and band never name a company, and carry
 *     the name only where the member's plan shows it there),
 *   - the company's record exactly as their table builds it (CompanyRec: a locked cell is "locked"
 *     here too, so a locked name, seat holder, posting or rate can't reach a move or a note),
 *   - the person they know there from their own network (lib/google NetPersonView), when they have one.
 * The server picks the three (lib/movesView.ts) and sends each as a MoveWire; the page builds what
 * it shows from the wire and the record it has (buildMove), so opening a company or a seat holder
 * changes the move at once. The connector's todays_moves reads the same functions.
 *
 * The way in, best first: (a) someone the member knows there, (b) the fractional who held a seat,
 * (c) an open role in the member's function, (d) nothing on file yet.
 *
 * Pure: no I/O and relative imports only (lib/table.ts's side and the app both load it).
 */
import type { CompanyRec, EngagementRec, Icp, PersonRec } from "./tableTypes";
import type { RadarBand, RadarKind, RadarRow } from "./radar/types";
import type { Warmth } from "./google/types";
import { clientKinds, firstOf, myWords, seatWords } from "./partners";
import { NEUTRAL_VOICE, asSentence, expandContractions, phraseSlot, styleOf, type VoiceFormality, type VoiceProfile, type VoiceStyle } from "./voice";

/* ---------- what the server sends ---------- */

/** Someone the member knows at the company, from their own network. Theirs alone. */
export interface KnowPerson {
  name: string;
  title: string | null;
  /** Their address, from the member's own contacts or calendar. Null when the network has none. */
  email: string | null;
  warmth: Warmth;
  /** YYYY-MM-DD of the last touch, or null. */
  last: string | null;
  meetings: number;
  emails: number;
  /** The title reads like a decision maker's (lib/google isDecisionMaker, the one flag). */
  dm: boolean;
}

/** One move as the server sends it: the company, its Crystal Ball row, and who the member knows there. */
export interface MoveWire {
  /** The company's public id, as the member's table has it. */
  id: string;
  row: RadarRow;
  know?: KnowPerson;
}

/** GET ?today=1's `moves`, and the answer to the "move" action. */
export interface MovesWire {
  list: MoveWire[];
  /** Moves the member marked done this calendar month (UTC). */
  month: number;
  /** The Google connector: off for everyone, on and not connected by this member, or connected. */
  google: "off" | "connect" | "on";
}

/** How many moves Home shows, and how many of the day's companies are looked at to pick them. */
export const MOVES_MAX = 3;
export const MOVE_CANDIDATES = 24;
/** Snooze hides a company for this long; Done for this long (then Crystal Ball may bring it back). */
export const SNOOZE_DAYS = 7;
export const DONE_DAYS = 30;

/** What a member did with their moves (State.moves[memberId]). Company ids are internal. */
export interface MoveLog {
  /** Company -> when the move there was marked done (ISO). */
  done: Record<string, string>;
  /** Company -> hidden until (ISO). */
  snoozed: Record<string, string>;
  /** "2026-11" -> moves done that month. */
  months: Record<string, number>;
}

/* ---------- the member, as much of them as a move needs ---------- */

export interface MoveMe {
  name: string;
  title?: string | null;
  function: string | null;
  before?: string[];
  icp?: Icp | null;
  crystal?: "all" | "one" | "used";
}

/* ---------- a move, as it is shown ---------- */

export type Way =
  | { kind: "know"; person: KnowPerson }
  | {
      kind: "holder";
      seatId: string;
      fn: string | null;
      /** The role the member can see, else null. */
      role: string | null;
      /** Named only when the member can see who held it. */
      name: string | null;
      /** A member on Merlin now (Message), or not yet with a claim link (Invite to connect). */
      member: boolean;
      invite: { path: string; at?: string } | null;
      /** Their address, only when a person on file there has their name and the member unlocked the email. */
      email: string | null;
    }
  | {
      kind: "role";
      seatId: string;
      /** The role's title when the member can see it, else "Fractional Sales". */
      title: string;
      fn: string | null;
      /** ISO day it was posted or first seen. */
      since: string | null;
      /** The posting's link when the member can see it; "locked" when it costs its credit. */
      posting: string | "locked" | null;
    }
  | { kind: "none" };

export type MoveDo =
  /** A locked company: opens as it does from Crystal Ball (by plan), or with the usual unlock. */
  | "open"
  /** A company the member can see, with nothing to draft: its record. */
  | "record"
  | "message"
  | "intro"
  | "reply"
  | "holderMessage"
  | "holderInvite"
  /** Who held the seat is locked: 1 credit, as on the record. */
  | "seeHolder"
  /** The posting is locked: its credit, as on the record. */
  | "seePosting";

export interface Move {
  id: string;
  /** The name where the member may see it (their table's, or Crystal Ball's on Trial and Pro), else null. */
  name: string | null;
  /** Locked in the member's table. */
  hidden: boolean;
  /** "Industrial automation · 51–200 · Pittsburgh, PA", from the free facts. */
  facts: string;
  hiring: boolean;
  /** The open role in the member's function, when there is one (its posting, for "Open the posting"). */
  open: Extract<Way, { kind: "role" }> | null;
  band: RadarBand | null;
  /** What happened and why now. */
  why: string;
  way: Way;
  do: MoveDo;
  /** "Message Dana". */
  title: string;
  /** One sentence under it. */
  line: string;
}

const cellV = (c: { s: string; v?: string } | undefined): string | null => (c && c.s === "value" && typeof c.v === "string" && c.v ? c.v : null);
const flat = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const lowerFirst = (v: string) => (/^[A-Z][a-z]/.test(v) ? v.charAt(0).toLowerCase() + v.slice(1) : v);
const upperFirst = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const stop = (v: string) => (/[.!?…]$/.test(v) ? v : `${v}.`);

/** An open role nobody holds yet (app/post/model.ts isOpenRole, kept the same). */
export const openRoleSeat = (e: EngagementRec) => (e.opened ? !e.closed : !e.closed && (e.source === "Demand scan" || cellV(e.cells.status) === "Open role"));

/** The company's free facts in one line. */
export function moveFacts(c: CompanyRec): string {
  const emp = cellV(c.cells.employees);
  return [cellV(c.cells.industry), emp, cellV(c.cells.hq) ?? c.region ?? c.country ?? null].filter(Boolean).join(" · ");
}

/**
 * What happened and why now, from the Crystal Ball row: its note ("Medium · Fractional CRO hired
 * 2 months ago · RevOps usually follows in 1–4 months") without the band, else its line. These
 * never name the company or a person (lib/radar/present.ts).
 */
export function moveWhy(row: RadarRow): string {
  const note = flat(row.notes?.[0]);
  const parts = (note ? note.split(" · ").slice(1) : flat(row.lines[0]).split(" · ")).map((x) => x.trim()).filter(Boolean);
  return parts.map((x) => stop(upperFirst(x))).join(" ");
}

const nameKey = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
/** Their email, when a person on file here has the seat holder's name and the member can see that email (Drawer.tsx emailOnFile). */
function emailOnFile(people: PersonRec[], name: string): string | null {
  const k = nameKey(name);
  for (const p of people) {
    const n = cellV(p.cells.name);
    const m = cellV(p.cells.email);
    if (n && m && nameKey(n) === k) return m;
  }
  return null;
}

/** A seat someone held whose holder is on file (named for the member, or locked): the fractional way in. Never the member's own. */
function holderSeat(c: CompanyRec, me: MoveMe): EngagementRec | null {
  const held = c.engagements.filter((e) => {
    const op = e.cells.operator as { s: string; member?: { you?: boolean } } | undefined;
    return !e.yours && !openRoleSeat(e) && !!op && (op.s === "locked" || op.s === "value") && !op.member?.you;
  });
  if (!held.length) return null;
  const before = new Set(me.before ?? []);
  const rank = (e: EngagementRec) => {
    const op = e.cells.operator as { s: string; member?: unknown };
    // Someone they can write to today, then a name, then a lock.
    const reach = op.s === "value" ? (op.member ? 0 : e.invite ? 1 : 2) : 3;
    return reach * 2 + (before.has(cellV(e.cells.function) ?? "") ? 0 : 1);
  };
  return held
    .map((e, k) => ({ e, k }))
    .sort((a, b) => rank(a.e) - rank(b.e) || (cellV(b.e.cells.start) ?? "").localeCompare(cellV(a.e.cells.start) ?? "") || a.k - b.k)[0].e;
}

/** An open role in the member's function (any open role when Crystal Ball's signal is one and none names the function). */
function openRole(c: CompanyRec, row: RadarRow, me: MoveMe): EngagementRec | null {
  const open = c.engagements.filter((e) => openRoleSeat(e) && !e.unseen && !e.yours);
  const mine = me.function ? open.filter((e) => cellV(e.cells.function) === me.function) : [];
  return mine[0] ?? (row.kinds.includes("role") ? open[0] ?? null : null);
}

/** The best way in at this company for this member. */
export function wayIn(c: CompanyRec, row: RadarRow, know: KnowPerson | undefined, me: MoveMe): Way {
  if (know && !c.hidden) return { kind: "know", person: know };
  const seat = holderSeat(c, me);
  if (seat) {
    const op = seat.cells.operator as { s: string; v?: string; member?: unknown };
    const name = op.s === "value" ? flat(op.v) || null : null;
    return {
      kind: "holder",
      seatId: seat.id,
      fn: cellV(seat.cells.function),
      role: cellV(seat.cells.role),
      name,
      member: !!name && !!op.member,
      invite: name && !op.member && seat.invite ? seat.invite : null,
      email: name ? emailOnFile([...seat.people, ...c.people], name) : null,
    };
  }
  const role = openRole(c, row, me);
  if (role) return roleWay(role);
  return { kind: "none" };
}

function roleWay(e: EngagementRec): Extract<Way, { kind: "role" }> {
  const fn = cellV(e.cells.function);
  const p = e.cells.posting as { s: string; v?: string } | undefined;
  return {
    kind: "role",
    seatId: e.id,
    title: cellV(e.cells.role) ?? (fn && fn !== "Other" ? `Fractional ${fn}` : "A fractional role"),
    fn,
    since: e.posted ?? e.opened ?? null,
    posting: p?.s === "value" && p.v ? p.v : p?.s === "locked" ? "locked" : null,
  };
}

/**
 * How good a way in is, for picking the three: someone they know leads, then a company with a way
 * in on file (the fractional who held a seat, or an open role to reply to), then one with nothing.
 */
export const wayRank = (w: Way) => (w.kind === "know" ? 0 : w.kind === "none" ? 2 : 1);
const BAND_RANK: Record<RadarBand, number> = { High: 0, Medium: 1, Low: 2 };

/**
 * One move, from the member's own record of the company, its Crystal Ball row and who they know
 * there. Every name in it is one the record or the row shows this member.
 */
export function buildMove(c: CompanyRec, row: RadarRow, know: KnowPerson | undefined, me: MoveMe): Move {
  const way = wayIn(c, row, know, me);
  const role = openRole(c, row, me);
  const hiring = !!role;
  const base = { id: c.id, name: c.hidden ? row.name ?? null : c.name, hidden: !!c.hidden, facts: moveFacts(c), hiring, open: role ? roleWay(role) : null, band: row.band ?? null, why: moveWhy(row), way };
  const fnWord = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  if (c.hidden) {
    const line =
      me.crystal === "all"
        ? `Free from your Crystal Ball. Its name, website and open roles open with it.`
        : me.crystal === "one"
          ? `Your one free Crystal Ball company today. It opens with everything on it.`
          : me.crystal === "used"
            ? `Your free Crystal Ball company for today is used.`
            : `Open it to see its name, its website and who to reach.`;
    return { ...base, do: "open", title: "Open the company", line };
  }
  if (way.kind === "know") {
    const first = firstOf(way.person.name);
    if (role) return { ...base, do: "reply", title: "Reply to the open role", line: `Apply through the posting, and let ${first} know you did.` };
    // Without a title on file nobody can say they aren't the buyer: write to them.
    if (way.person.dm || !way.person.title) return { ...base, do: "message", title: `Message ${first}`, line: "A short note you can edit. You send it from your own email." };
    return { ...base, do: "intro", title: `Ask ${first} for an intro`, line: `${first} isn't the buyer on file, but knows the team. Ask for an introduction${fnWord ? ` to whoever owns ${fnWord}` : ""}.` };
  }
  if (way.kind === "holder") {
    const seat = way.fn ? `their ${way.fn} seat` : "a seat there";
    if (!way.name) return { ...base, do: "seeHolder", title: "See who held the seat", line: "Then message them on Merlin, or invite them to connect." };
    const first = firstOf(way.name);
    if (way.member) return { ...base, do: "holderMessage", title: "Message the seat holder", line: `${first} held ${seat} and is on Merlin. Ask how the work came about.` };
    if (way.invite) return { ...base, do: "holderInvite", title: "Invite them to connect", line: `${first} held ${seat} and isn't on Merlin yet. Your note carries their claim link.` };
    return { ...base, do: "record", title: "Open the company", line: `${first} held ${seat}. The record has who hired them.` };
  }
  if (way.kind === "role") {
    if (way.posting === "locked") return { ...base, do: "seePosting", title: "Reply to the open role", line: "See the posting first. Then your note is ready to send with it." };
    return { ...base, do: "reply", title: "Reply to the open role", line: "Apply through the posting. Your note is drafted to go with it." };
  }
  return { ...base, do: "record", title: "Open the company", line: "See its seats and who decides, then add who you know." };
}

/** A candidate: one company of the day with the member's record of it. */
export interface MoveCandidate {
  row: RadarRow;
  rec: CompanyRec;
  know?: KnowPerson;
}

/**
 * The moves for today, best first: different companies, the ones with a way in ahead of the ones
 * without (someone they know, then a seat holder or an open role, then nothing), then by how likely
 * (the band), then in Crystal Ball's own order.
 */
export function pickMoves(cands: MoveCandidate[], me: MoveMe, max = MOVES_MAX): { move: Move; wire: MoveWire }[] {
  const seen = new Set<string>();
  const built = cands
    .filter((x) => (seen.has(x.rec.id) ? false : (seen.add(x.rec.id), true)))
    .map((x, k) => ({ k, move: buildMove(x.rec, x.row, x.know, me), wire: { id: x.rec.id, row: x.row, ...(x.know && !x.rec.hidden ? { know: x.know } : {}) } as MoveWire }));
  built.sort((a, b) => wayRank(a.move.way) - wayRank(b.move.way) || BAND_RANK[a.move.band ?? "Low"] - BAND_RANK[b.move.band ?? "Low"] || a.k - b.k);
  return built.slice(0, max).map(({ move, wire }) => ({ move, wire }));
}

/** Who to show from a company of the member's network: a decision maker who isn't cold first, then the warmest. Only someone with a name. */
export function knowFrom(
  people: { name: string | null; title: string | null; email: string | null; warmth: Warmth; last: string | null; meetings: number; emails: number; dm: boolean }[],
): KnowPerson | undefined {
  const named = people.filter((p) => !!p.name && !!p.name.trim());
  const p = named.find((x) => x.dm && x.warmth !== "Cold") ?? named[0];
  if (!p) return undefined;
  return { name: p.name!.trim(), title: p.title ?? null, email: p.email ?? null, warmth: p.warmth, last: p.last ?? null, meetings: p.meetings ?? 0, emails: p.emails ?? 0, dm: !!p.dm };
}

/* ---------- words for the way in ---------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "in March", "Nov 5" (the last 30 days), "in March 2025" (another year). Null when there is no date. */
export function lastMetWords(last: string | null, nowMs = Date.now()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(last ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12) return null;
  const at = Date.UTC(y, mo - 1, d, 12);
  const now = new Date(nowMs);
  if (at > nowMs) return null;
  if (nowMs - at <= 30 * 86_400_000) return `${SHORT[mo - 1]} ${d}`;
  return y === now.getUTCFullYear() ? `in ${MONTHS[mo - 1]}` : `in ${MONTHS[mo - 1]} ${y}`;
}
/** The month alone, for a note: "March", or "March last year". Null within the last 30 days (too recent to say "it's been since"). */
export function sinceMonth(last: string | null, nowMs = Date.now()): string | null {
  const w = lastMetWords(last, nowMs);
  if (!w || !w.startsWith("in ")) return null;
  const now = new Date(nowMs).getUTCFullYear();
  return w.slice(3).replace(new RegExp(` ${now - 1}$`), " last year");
}

/** "Last met in March · 4 meetings", "Last email Nov 5 · 12 emails", or "From your contacts". */
export function knowLine(p: KnowPerson, nowMs = Date.now()): string {
  const when = lastMetWords(p.last, nowMs);
  const n = p.meetings ? `${p.meetings} ${p.meetings === 1 ? "meeting" : "meetings"}` : p.emails ? `${p.emails} ${p.emails === 1 ? "email" : "emails"}` : "";
  const head = when ? `${p.meetings || !p.emails ? "Last met" : "Last email"} ${when}` : "";
  return [head, n].filter(Boolean).join(" · ") || "From your contacts";
}

/** "Posted 2 days ago", from the day a role was posted or first seen. */
export function postedWords(day: string | null, nowMs = Date.now()): string | null {
  const at = Date.parse(`${(day ?? "").slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(at)) return null;
  const days = Math.max(0, Math.round((nowMs - at) / 86_400_000));
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 45) return `Posted ${days} days ago`;
  const months = Math.round(days / 30.44);
  return `Posted ${months} ${months === 1 ? "month" : "months"} ago`;
}

/** The locked seat holder's line: "The fractional who held their Marketing seat is on file". */
export const holderOnFile = (fn: string | null) => `The fractional who held their ${fn && fn !== "Other" ? `${fn} ` : ""}seat is on file`;

/* ---------- the drafted note ---------- */

export type NoteKind = "know" | "intro" | "holderMessage" | "holderInvite" | "role" | "roleCold";

/** Every fact a note may use. Each one is on the member's own screen already. */
export interface NoteFacts {
  kind: NoteKind;
  /** The company's name: a note is only drafted for a company the member can see. */
  company: string;
  /** Who it goes to, when it goes to someone. */
  to: { name: string; email: string | null; from: "your own contacts" | "unlocked on Merlin" | null } | null;
  /** "March": the month they last met, when it was more than a month ago. */
  since: string | null;
  /** What happened there, as a clause after "I saw": "Larkfield Robotics hired a fractional CRO 2 months ago". */
  saw: string | null;
  /** The member: their first name, full name, "a fractional RevOps leader", their function, the kind of clients they want. */
  me: { first: string; name: string; as: string; fn: string | null; clients: string | null };
  /** "the fractional CMO seat", for a seat holder. */
  seat: string | null;
  /** The open role's title, for a reply. */
  role: string | null;
  /** The seat's claim link with the member's invite code, for an invite to connect. */
  link: string | null;
}

/** A role's title as a note may say it: no bracket, no rate, no company after "at". */
export function safeRole(title: string | null | undefined): string | null {
  const t = flat(title)
    .replace(/\s*[([{].*$/, "")
    .split(/\s+(?:at|@)\s+|\s[|–—-]\s|,/i)[0]
    .replace(/[$€£]\s?[\d.,]+\s?[kKmM]?(\s?(\/|per|a)\s?\w+)?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t && !/\d{2,}/.test(t) ? t.slice(0, 60) : null;
}

/**
 * What happened, as a clause a note can say after "I saw", from the row's first line (which never
 * carries a name) and the company's name. Money raised is said without the amount.
 */
export function sawClause(row: RadarRow, company: string): string | null {
  const kind: RadarKind | undefined = row.kinds[0];
  const head = flat(row.lines[0]).split(" · ")[0];
  if (!kind || !head) return null;
  switch (kind) {
    case "adjacent":
      return `${company} ${lowerFirst(head)}`;
    case "role": {
      const t = safeRole(head.replace(/^New open role:\s*/i, ""));
      return t ? `${company} posted an open ${t} role` : `${company} posted an open fractional role`;
    }
    case "seat":
      return `${lowerFirst(head)} at ${company}`;
    case "funding":
      return `${company} just raised a round`;
    case "sales-build":
      return `${company} ${lowerFirst(head)}`;
    case "departure":
      return `${company} ${lowerFirst(head)}`;
  }
  return null;
}

/** The facts for a move's note, or null when the move has nothing to draft (a locked company, a locked seat holder). */
export function noteFacts(m: Move, row: RadarRow, me: MoveMe, origin = "", nowMs = Date.now()): NoteFacts | null {
  if (m.hidden || !m.name) return null;
  const kind: NoteKind | null =
    m.do === "message" ? "know" : m.do === "intro" ? "intro" : m.do === "holderMessage" ? "holderMessage" : m.do === "holderInvite" ? "holderInvite" : m.do === "reply" ? (m.way.kind === "know" ? "role" : "roleCold") : null;
  if (!kind) return null;
  const meFacts = { first: firstOf(me.name), name: flat(me.name), as: myWords(me.title, me.function), fn: me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null, clients: clientKinds(me.icp) };
  const base = { kind, company: m.name, since: null as string | null, saw: sawClause(row, m.name), me: meFacts, seat: null as string | null, role: null as string | null, link: null as string | null };
  if (m.way.kind === "know") {
    const p = m.way.person;
    return { ...base, to: { name: p.name, email: p.email, from: p.email ? "your own contacts" : null }, since: sinceMonth(p.last, nowMs), role: kind === "role" ? safeRole(m.open?.title) : null };
  }
  if (m.way.kind === "holder" && m.way.name) {
    const link = kind === "holderInvite" && m.way.invite ? `${origin}${m.way.invite.path}` : null;
    return { ...base, to: { name: m.way.name, email: m.way.email, from: m.way.email ? "unlocked on Merlin" : null }, seat: seatWords(m.way.role, m.way.fn), link };
  }
  if (m.way.kind === "role") return { ...base, to: null, role: safeRole(m.way.title) };
  return null;
}

type Tone = Record<VoiceFormality, string>;
/** A template: five sentences in order, and the three a short note keeps. */
interface Template {
  subject: string;
  sentences: Tone[];
  short: [number, number, number];
  /** A paragraph that always closes the note, whatever its length (the claim link). */
  tail?: string;
}

function template(f: NoteFacts): Template {
  const co = f.company;
  const me = f.me.as;
  const fn = f.me.fn;
  const since: Tone = f.since
    ? { casual: `It's been a minute since ${f.since}.`, neutral: `It's been since ${f.since}, which is too long.`, formal: `It's been some time since we last spoke in ${f.since}.` }
    : { casual: "It's been a minute.", neutral: "It's been a little while.", formal: "It's been some time since we last spoke." };
  const saw: Tone = f.saw
    ? { casual: `Saw ${f.saw}.`, neutral: `I saw ${f.saw}.`, formal: `I noticed that ${f.saw}.` }
    : { casual: `${co} came up for me this week.`, neutral: `${co} came up for me this week.`, formal: `${co} came to my attention this week.` };
  switch (f.kind) {
    case "know":
      return {
        subject: fn ? `Catching up, and a thought on ${fn}` : "Catching up",
        sentences: [
          since,
          saw,
          fn
            ? {
                casual: `That's usually when ${fn} starts needing an owner, and that's what I do as ${me}.`,
                neutral: `That's usually when ${fn} starts to need an owner, which is the work I do as ${me}.`,
                formal: `In my experience that's when ${fn} begins to need an owner, which is the work I do as ${me}.`,
              }
            : {
                casual: `That's usually when a team needs an extra pair of senior hands, and that's what I do as ${me}.`,
                neutral: `That's usually when a team needs senior help for a while, which is the work I do as ${me}.`,
                formal: `In my experience that's when a team needs senior help for a time, which is the work I do as ${me}.`,
              },
          {
            casual: "No pitch. Happy to share what I'd look at in the first 30 days.",
            neutral: "No pitch, but I'd be glad to share what I'd look at in the first 30 days.",
            formal: "I'd be glad to share what I'd review in the first 30 days, with no obligation.",
          },
          { casual: "Up for 20 minutes next week?", neutral: "Worth 20 minutes next week?", formal: "Would you have 20 minutes next week?" },
        ],
        short: [1, 2, 4],
      };
    case "intro":
      return {
        subject: `An introduction at ${co}?`,
        sentences: [
          since,
          saw,
          {
            casual: `I work with teams like that as ${me}, and I'd love to meet whoever owns ${fn ?? "that"} there.`,
            neutral: `I work with teams like that as ${me}, and I'd like to meet whoever owns ${fn ?? "that"} there.`,
            formal: `I work with comparable teams as ${me}, and I'd value meeting whoever is responsible for ${fn ?? "that"} there.`,
          },
          { casual: "You know the team way better than I do.", neutral: "You know the team far better than I do.", formal: "You know the team far better than I do." },
          {
            casual: "Open to making an intro if I send a short note you can forward?",
            neutral: "Would you be open to an introduction if I send a short note you can forward?",
            formal: "Would you be willing to introduce me if I send a short note you can forward?",
          },
        ],
        short: [1, 2, 4],
      };
    case "holderMessage":
    case "holderInvite": {
      const seat = f.seat ?? "a fractional seat";
      const kinds = f.me.clients ?? "similar companies";
      return {
        subject: `Your seat at ${co}`,
        sentences: [
          { casual: `Saw you held ${seat} at ${co}.`, neutral: `I saw you held ${seat} at ${co}.`, formal: `I noticed that you held ${seat} at ${co}.` },
          { casual: `I'm ${me} working with ${kinds}.`, neutral: `I'm ${me} and I work with ${kinds}.`, formal: `I'm ${me} and I work with ${kinds}.` },
          {
            casual: `I'm looking at ${co}${fn ? ` for ${fn} work` : ""}, and you know how they buy.`,
            neutral: `I'm looking at ${co}${fn ? ` for ${fn} work` : ""}, and you know how they buy.`,
            formal: `I'm considering ${co}${fn ? ` for ${fn} work` : ""}, and you know how they buy.`,
          },
          {
            casual: "I'd love ten minutes on how the seat came about, and I'm happy to send referrals your way.",
            neutral: "I'd value ten minutes on how the seat came about, and I'm glad to send referrals your way.",
            formal: "I'd value ten minutes on how the seat came about, and I'd be glad to send referrals your way.",
          },
          { casual: "Up for swapping notes?", neutral: "Open to swapping notes and referrals?", formal: "Would you be open to comparing notes?" },
        ],
        short: [0, 1, 4],
        ...(f.kind === "holderInvite" && f.link ? { tail: `Your seat is on Merlin, a data exchange for fractional operators. Claim it with this link and we're connected there.\n${f.link}` } : {}),
      };
    }
    case "role": {
      const role = f.role ? `an open ${f.role} role` : `an open fractional${fn ? ` ${fn}` : ""} role`;
      return {
        subject: f.role ? `The ${f.role} role at ${co}` : `The open role at ${co}`,
        sentences: [
          since,
          { casual: `Saw ${co} posted ${role}.`, neutral: `I saw ${co} posted ${role}.`, formal: `I noticed that ${co} posted ${role}.` },
          {
            casual: `That's what I do as ${me}, so I've applied through the posting.`,
            neutral: `That's the work I do as ${me}, so I've applied through the posting.`,
            formal: `That's the work I do as ${me}, and I've applied through the posting.`,
          },
          { casual: "Wanted you to hear it from me first.", neutral: "I wanted you to hear it from me, not from the pile.", formal: "I wanted you to hear it from me directly." },
          {
            casual: "Could you point me to whoever's running the search?",
            neutral: "Could you point me to whoever is running the search?",
            formal: "Would you be able to point me to whoever is leading the search?",
          },
        ],
        short: [1, 2, 4],
      };
    }
    case "roleCold": {
      const role = f.role ? `the open ${f.role} role` : `the open fractional${fn ? ` ${fn}` : ""} role`;
      return {
        subject: f.role ? `The ${f.role} role at ${co}` : `The open role at ${co}`,
        sentences: [
          { casual: `I'm writing about ${role} at ${co}.`, neutral: `I'm writing about ${role} at ${co}.`, formal: `I'm writing regarding ${role} at ${co}.` },
          {
            casual: `I'm ${me}, and this is the work I do${f.me.clients ? ` for ${f.me.clients}` : ""}.`,
            neutral: `I'm ${me}, and this is the work I do${f.me.clients ? ` for ${f.me.clients}` : ""}.`,
            formal: `I'm ${me}, and this is the work I do${f.me.clients ? ` for ${f.me.clients}` : ""}.`,
          },
          {
            casual: "I'd start with a short working session on what the first 90 days should cover.",
            neutral: "I'd start with a short working session on what the first 90 days should cover.",
            formal: "I'd propose starting with a short working session on what the first 90 days should cover.",
          },
          {
            casual: "I work part-time by design, so you get senior judgment without a full-time hire.",
            neutral: "I work part-time by design, so you get senior judgment without a full-time hire.",
            formal: "I work part-time by design, which gives you senior judgment without a full-time hire.",
          },
          { casual: "Could we find 20 minutes this week?", neutral: "Could we find 20 minutes this week?", formal: "Would you have 20 minutes this week?" },
        ],
        short: [0, 1, 4],
      };
    }
  }
}

export interface NoteDraft {
  kind: NoteKind;
  subject: string;
  body: string;
  /** Who it goes to: the address only when the member already has it. */
  to: NoteFacts["to"];
  /** The style it was written in came from the member's saved voice. */
  voiced: boolean;
}

const SMALLTALK: Tone = { casual: "Hope you're doing well.", neutral: "Hope you're well.", formal: "I hope this finds you well." };

/**
 * The note for a move, written from its template in the member's voice (lib/voice.ts): their
 * greeting and sign-off, three sentences or five, their tone, with or without contractions, an
 * exclamation mark or an emoji where they use them, small talk first when they do, and at most one
 * of their stock phrases where it fits. With no voice saved it is the plain template.
 */
export function draftNote(f: NoteFacts, voice?: VoiceProfile | VoiceStyle | null): NoteDraft {
  const v = voice ? styleOf(voice) : NEUTRAL_VOICE;
  const t = template(f);
  const tone = v.formality;
  const fix = (x: string) => (v.contractions ? x : expandContractions(x));
  const picked = (v.length === "short" ? t.short.map((k) => t.sentences[k]) : t.sentences).map((x) => fix(x[tone]));
  // Paragraphs: the opening pair, the middle, and the ask on a line of its own.
  const ask = picked[picked.length - 1];
  const paras = picked.length === 3 ? [`${picked[0]} ${picked[1]}`, ask] : [`${picked[0]} ${picked[1]}`, `${picked[2]} ${picked[3]}`, ask];
  // At most one stock phrase: their own small talk when they open with it, else their closing line.
  const openPhrase = v.opener === "smalltalk" ? v.phrases.find((p) => phraseSlot(p) === "open") : undefined;
  const closePhrase = openPhrase ? undefined : v.phrases.find((p) => phraseSlot(p) === "close");
  const bang = v.exclamations === "sometimes";
  const lines: string[] = [];
  const first = f.to ? firstOf(f.to.name) : null;
  if (v.greeting !== "none") lines.push(first ? v.greeting.replace("{first}", first) : v.greeting === "Hey {first}," ? "Hey there," : v.greeting === "Hi {first}," ? "Hi there," : "Hello,");
  let banged = false;
  if (v.opener === "smalltalk") {
    let s = openPhrase ? asSentence(openPhrase) : fix(SMALLTALK[tone]);
    if (bang && s.endsWith(".")) (s = `${s.slice(0, -1)}!`), (banged = true);
    paras[0] = `${s} ${paras[0]}`;
  }
  if (v.emoji) paras[paras.length - 1] = `${paras[paras.length - 1]} 🙂`;
  lines.push(...paras);
  if (t.tail) lines.push(v.contractions ? t.tail : t.tail.replace("we're connected", "we are connected"));
  if (closePhrase) lines.push(asSentence(closePhrase));
  let signoff: string = v.signoff === "none" ? "" : v.signoff;
  if (bang && !banged) {
    // One exclamation mark, where they'd put it: on their thanks.
    if (signoff === "Thanks,") signoff = "Thanks!";
    else if (!closePhrase || !/!$/.test(closePhrase)) lines.push(tone === "formal" ? "Thank you!" : "Thanks!");
  }
  const name = v.name === "none" ? "" : v.name === "full" ? f.me.name : f.me.first;
  const sign = [signoff, name].filter(Boolean).join("\n");
  if (sign) lines.push(sign);
  return { kind: f.kind, subject: t.subject, body: lines.join("\n\n"), to: f.to, voiced: !!voice };
}

/** The sentences a note's own template wrote (its greeting, sign-off, small talk, claim link and stock phrase aside): 3 or 5. */
export function templateSentences(f: NoteFacts, voice?: VoiceProfile | VoiceStyle | null): string[] {
  const v = voice ? styleOf(voice) : NEUTRAL_VOICE;
  const t = template(f);
  const fix = (x: string) => (v.contractions ? x : expandContractions(x));
  return (v.length === "short" ? t.short.map((k) => t.sentences[k]) : t.sentences).map((x) => fix(x[v.formality]));
}

/* ---------- sending it: the member's own mail ---------- */

/** An address worth putting in a link (one address, nothing else). */
const ADDRESS = /^[^\s<>"',;:()[\]\\@]+@[^\s<>"',;:()[\]\\@]+\.[^\s<>"',;:()[\]\\@]+$/;
const addr = (to: string | null | undefined) => (to && ADDRESS.test(to.trim()) ? to.trim() : "");

/** A mailto: link with the subject and the body. The address only when the member already has it; otherwise To is left empty. */
export function mailtoLink(to: string | null | undefined, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(addr(to))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
/** The same as a Gmail compose window (a link the member opens: no Google permission is asked for). */
export function gmailLink(to: string | null | undefined, subject: string, body: string): string {
  const a = addr(to);
  return `https://mail.google.com/mail/?view=cm&fs=1${a ? `&to=${encodeURIComponent(a)}` : ""}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* ---------- the move log ---------- */

export const emptyMoveLog = (): MoveLog => ({ done: {}, snoozed: {}, months: {} });
const DAY = 86_400_000;

/** The companies hidden from today's moves right now: snoozed and not yet back, or done in the last DONE_DAYS. */
export function movesHidden(log: MoveLog | undefined, nowMs: number): Set<string> {
  const out = new Set<string>();
  if (!log) return out;
  for (const [id, until] of Object.entries(log.snoozed ?? {})) if (Date.parse(until) > nowMs) out.add(id);
  for (const [id, at] of Object.entries(log.done ?? {})) if (nowMs - Date.parse(at) < DONE_DAYS * DAY) out.add(id);
  return out;
}
/** Moves done this calendar month (UTC). */
export const movesThisMonth = (log: MoveLog | undefined, nowMs: number) => Math.max(0, log?.months?.[new Date(nowMs).toISOString().slice(0, 7)] ?? 0);

/** Record one thing a member did with a move, in place. Forgets what has run out, and months older than a year. */
export function logMove(log: MoveLog, companyId: string, op: "done" | "snooze" | "undo", nowMs: number): void {
  const now = new Date(nowMs).toISOString();
  for (const [id, until] of Object.entries(log.snoozed)) if (!(Date.parse(until) > nowMs)) delete log.snoozed[id];
  for (const [id, at] of Object.entries(log.done)) if (!(nowMs - Date.parse(at) < DONE_DAYS * DAY)) delete log.done[id];
  const keep = new Date(nowMs - 366 * DAY).toISOString().slice(0, 7);
  for (const k of Object.keys(log.months)) if (k < keep) delete log.months[k];
  if (op === "snooze") {
    log.snoozed[companyId] = new Date(nowMs + SNOOZE_DAYS * DAY).toISOString();
    return;
  }
  if (op === "done") {
    // Marked done twice counts once.
    if (!log.done[companyId]) log.months[now.slice(0, 7)] = (log.months[now.slice(0, 7)] ?? 0) + 1;
    log.done[companyId] = now;
    delete log.snoozed[companyId];
    return;
  }
  const was = log.done[companyId];
  if (was) {
    const k = was.slice(0, 7);
    if (log.months[k]) log.months[k] = Math.max(0, log.months[k] - 1);
    if (!log.months[k]) delete log.months[k];
    delete log.done[companyId];
  }
  delete log.snoozed[companyId];
}
