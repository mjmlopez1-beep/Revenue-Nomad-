/**
 * Your three moves today (Home): for each of up to three companies from the member's Crystal Ball,
 * the company, the best way in, and one thing to do about it. The note Merlin drafts for a move is
 * lib/moveNote.ts.
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
 * The way in, best first: (a) someone the member knows there (their own network, or their own
 * contact who holds a seat there), (b) the buyer on file: a decision maker, or the exec who hired
 * or managed the fractional (a seat's "Hiring for the seat" and "Reported to"), (c) the fractional
 * who held a seat, (d) an open role in the member's function, (e) nothing on file yet. With nobody
 * who decides on file, a move also carries where to look for them (findBuyer: a LinkedIn people
 * search and the company's own site, links out, nothing read from them).
 *
 * Pure: no I/O and relative imports only (lib/table.ts's side and the app both load it).
 */
import type { CompanyRec, EngagementRec, Icp, PersonRec } from "./tableTypes";
import type { RadarBand, RadarRow } from "./radar/types";
import { isDecisionMaker, type Warmth } from "./google/types";
import { firstOf } from "./partners";
import { shortName } from "./fractionalsCore";

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
  /**
   * They came from the member's Google account (Calendar, Contacts or Gmail are among their
   * sources), not only from what the member's own Claude saved. Merlin shows them to the member in
   * the app, and never passes them on through the connector (lib/mcp/tools.ts todaysMoves), as
   * my_network never lists people.
   */
  google: boolean;
  /**
   * They hold (or held) a seat here: a person in the member's own contacts whose name (first and
   * last, with a fractional title or a title in the seat's function) or email (a member's) matches
   * a seat holder the member can see by name (lib/google seatMatches). The seat's public id.
   */
  seat?: { id: string; fn: string | null; now: boolean };
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
  /** Connected: how many warm paths Your network lists (companies they know that are likely to hire them), for Home's link to them. */
  warm?: number;
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
      kind: "buyer";
      /** The person's public id, for its unlocks ("contact" name, email). */
      personId: string;
      /** The seat they are on, or null for a decision maker at the company. */
      seatId: string | null;
      /** "Hiring for the seat", "Reported to", "Decision maker", or null (a person at the company with none). Free. */
      rel: string | null;
      /** Their seat's function and role, where the member can see them. */
      fn: string | null;
      seatRole: string | null;
      /** Name and title: one purchase. Null while it is locked. */
      name: string | null;
      title: string | null;
      /** Their email: the address once the member unlocked it, "locked" (1 credit, after the name), or null (none on file). */
      email: string | "locked" | null;
      /** What a note to them may say about the company: free facts only. */
      ctx: BuyerCtx;
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
  | "seePosting"
  /** The buyer's name and title are locked: 1 credit, as on the record. */
  | "seeBuyer"
  /** Write to the buyer: a drafted note in the member's voice. */
  | "buyer"
  /** Nobody who decides is on file: look for them (findBuyer), then add them. */
  | "find";

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
  /** Nobody who decides is on file, at a company the member can see: where to look for them. */
  find?: FindBuyer | null;
}

/** Free facts a note to the buyer may use to say why now ("When a SaaS company is past $5M and has a fractional CMO…"). */
export interface BuyerCtx {
  industry: string | null;
  revenue: string | null;
  /** A fractional seat they hired, as the member can see it: the role ("Fractional CMO"), else the function. */
  hired: { role: string | null; fn: string | null } | null;
  /** No fractional seat in the member's function is on file. */
  gap: boolean;
  /** Their team page was read and names nobody in the member's function (lib/leaders: only then may a note say "no Sales leader yet"). */
  noLeader: boolean;
}

/** "Find who runs Sales at Acme": a LinkedIn people search and the company's own site. Links out only. */
export interface FindBuyer {
  /** The member's function, or null ("Find who decides at Acme"). */
  fn: string | null;
  label: string;
  linkedin: string;
  /** Their team page when the leaders read found one, else their website. Null without a website. */
  site: { href: string; label: string } | null;
}

const cellV = (c: { s: string; v?: string } | undefined): string | null => (c && c.s === "value" && typeof c.v === "string" && c.v ? c.v : null);
const flat = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
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
 * 2 months ago · RevOps usually follows") without the band, else its line. These
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
  // A member on Merlin shows by first name and last initial until they choose (lib/memberName.ts): the
  // seat holder's own record on the seat, with the full name the member unlocked, is still them.
  if (/^\S+ \S\.$/.test(name.trim()))
    for (const p of people) {
      const n = cellV(p.cells.name);
      const m = cellV(p.cells.email);
      if (n && m && cellV(p.cells.relationship) === "Seat holder" && nameKey(shortName(n)) === k) return m;
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

/* ---------- the buyer ---------- */

/** The relationships that make someone on a seat a buyer: who hired the fractional, a decision maker, who they reported to. Best first. */
export const BUYER_RELS = ["Hiring for the seat", "Decision maker", "Reported to"] as const;
const BUYER_RANK: Record<string, number> = { "Hiring for the seat": 0, "Decision maker": 1, "Reported to": 2 };

/** A decision maker on file: the person, and the seat they are on (null at the company). */
export interface BuyerOnFile {
  p: PersonRec;
  e: EngagementRec | null;
  rel: string | null;
}

/**
 * Someone on file who decides: a person at the company (the record's "Decision makers") with a
 * buyer relationship or none, or a person on a seat marked Hiring for the seat, Reported to or
 * Decision maker. Only someone with a name on file (shown, or locked behind its credit).
 */
export function isBuyer(p: PersonRec, onSeat: boolean): boolean {
  const n = p.cells.name;
  if (!n || (n.s !== "value" && n.s !== "locked")) return false;
  const rel = cellV(p.cells.relationship);
  if (rel) return (BUYER_RELS as readonly string[]).includes(rel);
  return !onSeat && p.cells.relationship?.s !== "locked";
}

/**
 * Every decision maker on file at the company: its own people first, then the hirers on its
 * seats. `others`: leave out the member's own seats (their own client is not a way in).
 */
export function buyersOf(c: Pick<CompanyRec, "people" | "engagements">, opts: { others?: boolean } = {}): BuyerOnFile[] {
  const out: BuyerOnFile[] = [];
  const seen = new Set<string>();
  const push = (p: PersonRec, e: EngagementRec | null) => {
    if (seen.has(p.id) || !isBuyer(p, !!e)) return;
    seen.add(p.id);
    out.push({ p, e, rel: cellV(p.cells.relationship) });
  };
  for (const p of c.people) push(p, null);
  for (const e of c.engagements) if (!(opts.others && e.yours)) for (const p of e.people) push(p, e);
  return out;
}

/** The buyer to reach first: one the member can see by name, then who hired the seat, then a seat in the member's function, then a title that decides. */
export function bestBuyer(c: Pick<CompanyRec, "people" | "engagements">, fn: string | null | undefined): BuyerOnFile | null {
  const all = buyersOf(c, { others: true });
  if (!all.length) return null;
  const rank = (b: BuyerOnFile) =>
    (b.p.cells.name?.s === "value" ? 0 : 1000) +
    (BUYER_RANK[b.rel ?? ""] ?? 1) * 100 +
    (b.e && fn && cellV(b.e.cells.function) === fn ? 0 : 10) +
    (isDecisionMaker(cellV(b.p.cells.title)) ? 0 : 1);
  return all.map((b, k) => ({ b, k })).sort((x, y) => rank(x.b) - rank(y.b) || x.k - y.k)[0].b;
}

/** What a note to the buyer may say about the company: free facts its record shows the member. */
export function buyerCtx(c: CompanyRec, me: Pick<MoveMe, "function">, seat: EngagementRec | null): BuyerCtx {
  const fn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  const hiredSeat = (e: EngagementRec) => !e.yours && !openRoleSeat(e) && !!cellV(e.cells.function) && cellV(e.cells.function) !== fn;
  const e = seat && hiredSeat(seat) ? seat : (c.engagements.filter(hiredSeat).sort((a, b) => (cellV(b.cells.start) ?? "").localeCompare(cellV(a.cells.start) ?? ""))[0] ?? null);
  const leads = c.leads;
  return {
    industry: cellV(c.cells.industry),
    revenue: cellV(c.cells.revenue),
    hired: e ? { role: cellV(e.cells.role), fn: cellV(e.cells.function) } : null,
    gap: !!fn && !(c.friendly?.functions ?? []).includes(fn),
    noLeader: !!fn && !!leads?.teamAt && !leads.fns.some((l) => l.fn === fn),
  };
}

function buyerWay(b: BuyerOnFile, c: CompanyRec, me: MoveMe): Extract<Way, { kind: "buyer" }> {
  const em = b.p.cells.email;
  return {
    kind: "buyer",
    personId: b.p.id,
    seatId: b.e?.id ?? null,
    rel: b.rel,
    fn: b.e ? cellV(b.e.cells.function) : null,
    seatRole: b.e ? cellV(b.e.cells.role) : null,
    name: cellV(b.p.cells.name),
    title: cellV(b.p.cells.title),
    email: em?.s === "value" && em.v ? em.v : em?.s === "locked" ? "locked" : null,
    ctx: buyerCtx(c, me, b.e),
  };
}

/** "their fractional CRO", "their fractional Marketing leader", from the seat's role the member can see, else its function. */
export function hiredWords(role: string | null | undefined, fn: string | null | undefined): string {
  const r = flat(role).replace(/\s*[([{].*$/, "");
  if (r && r.length <= 40 && !/\d{2,}/.test(r)) return `their fractional ${r.replace(/^(fractional|interim|part-time)\s+/i, "")}`;
  return fn && fn !== "Other" ? `their fractional ${fn} leader` : "their fractional";
}

/** Who they are to the company: "hired their fractional CRO", "managed their fractional Marketing leader", "a decision maker there". */
export function buyerWhat(w: Pick<Extract<Way, { kind: "buyer" }>, "rel" | "fn" | "seatRole">): string {
  if (w.rel === "Hiring for the seat") return `hired ${hiredWords(w.seatRole, w.fn)}`;
  if (w.rel === "Reported to") return `managed ${hiredWords(w.seatRole, w.fn)}`;
  return "a decision maker there";
}

/* ---------- where to look when nobody who decides is on file ---------- */

/** Titles of who runs each function, for the LinkedIn search. */
const RUNS: Record<string, string[]> = {
  Sales: ["CRO", "VP Sales", "Head of Sales"],
  Marketing: ["CMO", "VP Marketing", "Head of Marketing"],
  RevOps: ["VP Revenue Operations", "Head of RevOps", "CRO"],
  "Customer Success": ["Chief Customer Officer", "VP Customer Success", "Head of Customer Success"],
  Partnerships: ["VP Partnerships", "Head of Partnerships"],
  Growth: ["VP Growth", "Head of Growth", "CMO"],
  "Product Marketing": ["VP Product Marketing", "Head of Product Marketing", "CMO"],
  Enablement: ["Head of Enablement", "VP Sales", "CRO"],
  "AI GTM": ["CRO", "VP Sales", "Head of Growth"],
  Technology: ["CTO", "VP Engineering"],
  Finance: ["CFO", "VP Finance"],
  Operations: ["COO", "VP Operations"],
  People: ["Chief People Officer", "VP People", "Head of People"],
  Product: ["CPO", "VP Product", "Head of Product"],
  Legal: ["General Counsel"],
};
const quoted = (v: string) => (/\s/.test(v) ? `"${v.replace(/"/g, "")}"` : v);

/** A LinkedIn people search for who runs `fn` at the company: its name and the titles, as keywords. A link out; nothing is read back. */
export function linkedInPeopleSearch(company: string, fn: string | null): string {
  const titles = [...(fn && RUNS[fn] ? RUNS[fn] : []), "Founder", "CEO"];
  const q = `${quoted(flat(company))} (${titles.map(quoted).join(" OR ")})`;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;
}

/** A website as an https link, or null when it isn't a plain web address. */
function siteLink(raw: string | null | undefined): string | null {
  const v = flat(raw);
  if (!v || /[\s<>"'`\\]/.test(v)) return null;
  const full = /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/\//, "")}`;
  try {
    const u = new URL(full);
    return (u.protocol === "https:" || u.protocol === "http:") && /\.[a-z]{2,}$/i.test(u.hostname) && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Nobody who decides is on file at a company the member can see: "Find who runs Sales at Acme",
 * a LinkedIn people search by the company's name and the titles, and their team page (when the
 * leaders read found one) or their website. Null at a locked company, or once a buyer is on file.
 */
export function findBuyer(c: CompanyRec, me: Pick<MoveMe, "function">): FindBuyer | null {
  if (c.hidden || !flat(c.name) || bestBuyer(c, me.function)) return null;
  const fn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  const team = siteLink(c.leads?.fns.find((l) => l.how === "team page" && l.url)?.url);
  const web = siteLink(cellV(c.cells.website));
  return {
    fn,
    label: fn ? `Find who runs ${fn} at ${flat(c.name)}` : `Find who decides at ${flat(c.name)}`,
    linkedin: linkedInPeopleSearch(c.name, fn),
    site: team ? { href: team, label: "Their team page" } : web ? { href: web, label: "Their website" } : null,
  };
}

/** The best way in at this company for this member. */
export function wayIn(c: CompanyRec, row: RadarRow, know: KnowPerson | undefined, me: MoveMe): Way {
  if (know && !c.hidden) return { kind: "know", person: know };
  const buyer = bestBuyer(c, me.function);
  if (buyer) return buyerWay(buyer, c, me);
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
 * in on file (the buyer, the fractional who held a seat, or an open role to reply to), then one with nothing.
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
  const find = way.kind === "know" || way.kind === "buyer" ? null : findBuyer(c, me);
  const base = { id: c.id, name: c.hidden ? row.name ?? null : c.name, hidden: !!c.hidden, facts: moveFacts(c), hiring, open: role ? roleWay(role) : null, band: row.band ?? null, why: moveWhy(row), way, find };
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
  const roleMove = (to: string | null): Move | null => {
    if (!role) return null;
    const r = roleWay(role);
    if (r.posting === "locked") return { ...base, do: "seePosting", title: "Reply to the open role", line: `See the posting first. Then your note${to ? ` to ${to}` : ""} is ready to send with it.` };
    return { ...base, do: "reply", title: "Reply to the open role", line: `Apply through the posting. Your note${to ? ` to ${to}` : ""} is drafted to go with it.` };
  };
  if (way.kind === "know") {
    const p = way.person;
    const first = firstOf(p.name);
    if (role) return { ...base, do: "reply", title: "Reply to the open role", line: `Apply through the posting, and let ${first} know you did.` };
    // Their own contact holds a seat here: they know how the company buys.
    if (p.seat) return { ...base, do: "message", title: `Message ${first}`, line: `${knowSeatLine(p)} Ask who decides${fnWord ? ` on ${fnWord}` : ""} there.` };
    // Without a title on file nobody can say they aren't the buyer: write to them.
    if (p.dm || !p.title) return { ...base, do: "message", title: `Message ${first}`, line: "A short note you can edit. You send it from your own email." };
    return { ...base, do: "intro", title: `Ask ${first} for an intro`, line: `${first} isn't the buyer on file, but knows the team. Ask for an introduction${fnWord ? ` to whoever owns ${fnWord}` : ""}.` };
  }
  if (way.kind === "buyer") {
    const who = way.rel === "Hiring for the seat" ? "who hired them" : "who decides";
    if (!way.name) {
      // An open role in their function leads; the buyer's own unlock stays beside it on the way in.
      const r = roleMove(null);
      if (r) return r;
      return {
        ...base,
        do: "seeBuyer",
        title: `See ${who}`,
        line: `1 credit shows their name and title${way.email === "locked" ? ", and their email is 1 more" : ""}. Your note is drafted for you then.`,
      };
    }
    const first = firstOf(way.name);
    const r = roleMove(first);
    if (r) return r;
    const what = `${first}${way.title ? `, ${way.title},` : ""} ${buyerWhat(way)}.`;
    const reach =
      way.email === "locked"
        ? "Their email is 1 credit on the record. The note is ready either way."
        : way.email
          ? "A short note to their email on file. You send it from your own mail."
          : "No email on file. Copy the note and send it where you reach them.";
    return { ...base, do: "buyer", title: `Write to ${first}`, line: `${what} ${reach}` };
  }
  if (way.kind === "holder") {
    const seat = way.fn && way.fn !== "Other" ? `their ${way.fn} seat` : "a seat there";
    // Said only from what is on file: nobody who hired them is (a buyer would be the way in), and Merlin reaches them only when they're a member or have a claim link.
    const nobody = "Nobody who hired them is on file yet.";
    if (!way.name) return { ...base, do: "seeHolder", title: "See who held the seat", line: `1 credit shows who held it. ${nobody}` };
    const first = firstOf(way.name);
    if (way.member) return { ...base, do: "holderMessage", title: "Message the seat holder", line: `${first} held ${seat} and is on Merlin. Ask how the work came about.` };
    if (way.invite) return { ...base, do: "holderInvite", title: "Invite them to connect", line: `${first} held ${seat} and isn't on Merlin yet. Your note carries their claim link.` };
    return { ...base, do: "record", title: "Open the company", line: `${first} held ${seat} and isn't on Merlin yet. ${nobody}` };
  }
  if (way.kind === "role") {
    if (way.posting === "locked") return { ...base, do: "seePosting", title: "Reply to the open role", line: "See the posting first. Then your note is ready to send with it." };
    return { ...base, do: "reply", title: "Reply to the open role", line: "Apply through the posting. Your note is drafted to go with it." };
  }
  if (find) return { ...base, do: "find", title: fnWord ? `Find who runs ${fnWord}` : "Find who decides", line: "Nobody who decides is on file yet. Look them up, then add them here and earn a credit." };
  return { ...base, do: "record", title: "Open the company", line: "See its seats and who decides, then add who you know." };
}

/**
 * A note to one decision maker on the record (its "Your way in"): the buyer's move, without the
 * day's ranking. `row`: the company's Crystal Ball row when the member has one, else nothing
 * happened that a note can say, and "why now" is what the record shows.
 */
export function buyerNoteMove(c: CompanyRec, b: BuyerOnFile, me: MoveMe, row: RadarRow = { id: c.id, kinds: [], lines: [] }): Move {
  const way = buyerWay(b, c, me);
  const fn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  const h = way.ctx.hired;
  const why = moveWhy(row) || (h && way.ctx.gap && fn ? `They hired ${hiredWords(h.role, h.fn).replace(/^their /, "a ")} and have no fractional ${fn} seat on file.` : "");
  return { id: c.id, name: c.hidden ? null : c.name, hidden: !!c.hidden, facts: moveFacts(c), hiring: false, open: null, band: row.band ?? null, why, way, do: "buyer", title: "", line: "", find: null };
}

/** The hiring team an open role went to, when nobody there is on file: "Follow up with the hiring team at …". */
export const HIRING_TEAM = "hiring team";

/**
 * What a sent move tells Your pipeline (Mark as sent, or the note used: the "sent" move op and
 * pipeline.sent): the channel, who it went to as the move shows them, and whether it asked for an
 * intro. Someone they know (with whether they came from the member's Google account), the seat
 * holder, the buyer (named only once the member unlocked their name and title), and a reply to an
 * open role with nobody on file its hiring team. Nothing the member can't see.
 */
export function moveSent(m: Pick<Move, "way" | "do">): { channel: "email" | "merlin" | "intro"; to: { name?: string | null; role?: string | null; google?: boolean }; intro?: boolean } {
  const w = m.way;
  const to =
    w.kind === "know"
      ? { name: w.person.name, role: w.person.title, google: w.person.google }
      : w.kind === "holder"
        ? { name: w.name, role: w.role ?? (w.fn ? `fractional ${w.fn} lead` : null) }
        : w.kind === "buyer"
          ? { name: w.name, role: w.name ? w.title : null }
          : w.kind === "role"
            ? { role: HIRING_TEAM }
            : {};
  if (m.do === "intro") return { channel: "intro", to, intro: true };
  return { channel: m.do === "holderMessage" && w.kind === "holder" && w.member ? "merlin" : "email", to };
}

/** "You know Pat (Hot), who holds their Marketing seat." */
export function knowSeatLine(p: Pick<KnowPerson, "name" | "warmth" | "seat">): string {
  const s = p.seat;
  const seat = s?.fn && s.fn !== "Other" ? `their ${s.fn} seat` : "a seat there";
  return `You know ${firstOf(p.name)} (${p.warmth}), who ${s && !s.now ? "held" : "holds"} ${seat}.`;
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

/**
 * Who to show from a company of the member's network: a decision maker who isn't cold first, then
 * their own contact who holds a seat there (not cold), then the warmest. Only someone with a name.
 */
export function knowFrom(
  people: {
    name: string | null;
    title: string | null;
    email: string | null;
    warmth: Warmth;
    last: string | null;
    meetings: number;
    emails: number;
    dm: boolean;
    src: readonly string[];
    seat?: { id: string; fn: string | null; now: boolean } | null;
  }[],
): KnowPerson | undefined {
  const named = people.filter((p) => !!p.name && !!p.name.trim());
  const p = named.find((x) => x.dm && x.warmth !== "Cold") ?? named.find((x) => !!x.seat && x.warmth !== "Cold") ?? named[0];
  if (!p) return undefined;
  return {
    name: p.name!.trim(),
    title: p.title ?? null,
    email: p.email ?? null,
    warmth: p.warmth,
    last: p.last ?? null,
    meetings: p.meetings ?? 0,
    emails: p.emails ?? 0,
    dm: !!p.dm,
    google: fromGoogle(p.src),
    ...(p.seat ? { seat: { id: p.seat.id, fn: p.seat.fn ?? null, now: !!p.seat.now } } : {}),
  };
}

/** The sources that are the member's Google account (lib/google NetSource). What their own Claude saved ("claude") is not one. */
const GOOGLE_SOURCES = new Set(["calendar", "contacts", "gmail"]);
/** Any of a person's sources is the member's Google account. No source on file counts as Google's: the careful reading. */
export const fromGoogle = (src: readonly string[] | null | undefined) => !src || !src.length || src.some((s) => GOOGLE_SOURCES.has(s));

/**
 * A move's words without the person in them, for where the person may not be passed on (the
 * connector, for someone from the member's Google account): "Message Dana" reads "Message the
 * person you know there". A move with no person in its words comes back as it is.
 */
export function moveWithoutPerson(m: Pick<Move, "do" | "way" | "title" | "line">, me: Pick<MoveMe, "function">): { title: string; line: string } {
  if (m.way.kind !== "know") return { title: m.title, line: m.line };
  const fn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  if (m.do === "reply") return { title: "Reply to the open role", line: "Apply through the posting, and let the person you know there know you did." };
  if (m.do === "intro")
    return { title: "Ask the person you know there for an intro", line: `They aren't the buyer on file, but know the team. Ask for an introduction${fn ? ` to whoever owns ${fn}` : ""}.` };
  if (m.do === "message") return { title: "Message the person you know there", line: "A short note you can edit. You send it from your own email." };
  return { title: m.title, line: m.line };
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
