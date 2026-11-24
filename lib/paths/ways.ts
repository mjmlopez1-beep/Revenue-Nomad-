/**
 * Your way into a company, on the server: a company's routes (You, each person in between, the
 * person who decides), each link rated and the route estimated (lib/paths/rank.ts), and the plan
 * the member goes with (lib/paths/plan.ts), for
 *   - Your way into <company> (wayInOf): one recommended route, the others to compare, the plan;
 *   - Where you can get in (getInOf): every company that fits the member, placed by its best route
 *     and its odds of hiring;
 *   - Home's move and the pipeline's route line (planLinesOf);
 *   - the connector's ways_in (lib/mcp/ways.ts), with its own naming rule.
 *
 * Reads only what Smart ways in already reads (lib/paths/index.ts): the member's own Google network
 * (counts and dates, never a message, a subject or a meeting's title), their own LinkedIn file, their
 * messages on Merlin (when and how many, never what was said), and Merlin's shared seats, leaders and
 * members. Names follow today's rules: the person the member knows as their own list has them; the
 * person on the other side, a leader or who decides only where the member can see that name (a seat
 * holder they unlocked or one in the Fractionals directory, a person they paid for, at a company they
 * can see), and a seat holder's name from public profiles only at a United States company outside
 * California; a company only where the member can see it, else its facts and its id, with its routes
 * behind "Open this company to see your routes". What is kept is the plan (hop ids, never a name).
 */
import { createHash, randomBytes } from "node:crypto";
import { ActionError, tableInternals as T, type Member, type Seed, type State } from "../table";
import { crystalRowsOf } from "../radar";
import type { RadarSentRow } from "../radar/types";
import { companyFacts } from "../radar/signals";
import { icpIsEmpty, inIcp } from "../radar/match";
import { oddsFor, ownSeatTest } from "../google/odds";
import type { HireOdds } from "../google/types";
import { alertMatches, type SavedSearch } from "../mcp/alerts";
import * as P from "../pipeline";
import { peerPicks } from "../peers";
import { PATH_RAW, personOfContact, type Contact, type WLeader, type WSeat, type World } from "./find";
import { factsOf, foundFor, pathsOn, shownName, who, type Found } from "./index";
import { worldOf } from "./world";
import {
  EST, HOW_ESTIMATED, betweenWords, compareRoutes, estRaw, estWords, evidenceWords, fitLevel, freshOf, initialsOf, isHigh, linkStrength, bandOf, mapPoint, monthDay, oddsFallback, oddsIdx, placeAxis, roundEst, splitLine, spreadBox, strongestOf, timeWords, companyScore,
  type Evidence, type OddsBand, type PathBand, type Split, type Zone,
} from "./rank";
import { networkOn } from "../google/types";
import * as Plan from "./plan";
import { lockedMatchesHidden } from "./types";
import {
  GETIN_MAX, ROUTES_MAX, WAY_SOURCE_WORDS,
  type GetInRow, type GetInView, type WarmLine, type WarmRow, type WarmView, type WaySource, type PathView, type PlanLine, type PlanView, type RouteAct, type RouteLink, type RouteNode, type RouteNote, type RouteStepView, type RouteView, type WayInView,
} from "./types";

type G = ReturnType<typeof T.graph>;
type WithRoutes = State & { routes?: Plan.RoutesState; routeStats?: Plan.RouteStats };
const yearOfIdx = (idx: number | null | undefined) => (idx === null || idx === undefined ? null : Math.floor(idx / 12));
const HIRE_RELS = new Set(["Hiring for the seat", "Reported to"]);
const DAY = 86_400_000;

/** Everything one member's answers read, built once a call. */
interface Cx {
  seed: Seed;
  s: State;
  m: Member;
  f: Found;
  w: World;
  g: G;
  idx: ReturnType<typeof T.memberIndex>;
  tracks: ReturnType<typeof T.tracksOf>;
  nowMs: number;
  fn: string | null;
  mySeats: WSeat[];
  /** Seat id -> who hired for it or managed it (leaders on file). */
  seatLeaders: Map<string, WLeader[]>;
  /** Internal company id -> the member's seat there (the latest), for "your client". */
  myCompanies: Map<string, WSeat>;
  /** Member id -> a conversation the member has with them (the member's own). */
  convWith: Map<string, string>;
  /** Members in the Fractionals directory (member id). */
  directory: Set<string>;
  /** Company id -> its seats (internal ids). */
  engsAt: Map<string, string[]>;
}

function cxOf(seed: Seed, s: State, m: Member, nowMs: number): Cx {
  const f = foundFor(seed, s, m, nowMs);
  const w = worldOf(seed, s, nowMs);
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const mySeats = f.me.person ? (w.persons.get(f.me.person)?.seats ?? []).map((id) => w.seats.get(id)!).filter(Boolean) : [];
  const myCompanies = new Map<string, WSeat>();
  for (const x of mySeats) {
    const was = myCompanies.get(x.companyId);
    if (!was || (x.to ?? 0) > (was.to ?? 0) || x.active) myCompanies.set(x.companyId, x);
  }
  const seatLeaders = new Map<string, WLeader[]>();
  for (const list of w.leadersAt.values())
    for (const l of list)
      if (l.seat && l.rel && HIRE_RELS.has(l.rel)) {
        const a = seatLeaders.get(l.seat) ?? [];
        a.push(l);
        seatLeaders.set(l.seat, a);
      }
  const convWith = new Map<string, string>();
  for (const cv of s.conversations ?? []) {
    if (cv.a !== m.id && cv.b !== m.id) continue;
    if (cv.blockedBy) continue;
    const other = cv.a === m.id ? cv.b : cv.a;
    if (!convWith.has(other)) convWith.set(other, cv.id);
  }
  const directory = new Set<string>();
  for (const p of w.persons.values()) if (p.member && p.shown) directory.add(p.member);
  const engsAt = new Map<string, string[]>();
  for (const e of g.engagements.values()) {
    const l = engsAt.get(e.companyId);
    if (l) l.push(e.id);
    else engsAt.set(e.companyId, [e.id]);
  }
  return { seed, s, m, f, w, g, idx, tracks: T.tracksOf(seed, s), nowMs, fn: f.me.words.fn, mySeats, seatLeaders, myCompanies, convWith, directory, engsAt };
}

/* ---------- names, as the member may see them ---------- */

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
/** A step's title after "Next: ": a verb or "their ..." goes lower case ("Next: ask Casey for an intro"), a name keeps its capital ("Next: Casey introduces you to Rita"). */
const lcStep = (x: string) => (/^(Ask|Send|Meet|Write|Their|Whoever|You)\b/.test(x) ? lc(x) : x);
const companyLabel = (cx: Cx, id: string) => (cx.f.me.visible(id) ? (cx.g.companies.get(id)?.name ?? null) : null);

/**
 * Names from public profiles show only at a company in the United States. California is judged by
 * the person (lib/california.ts): the importers never name a person whose own location is
 * California. Until the names already on file have been checked again against that rule
 * (add-seat-names.mjs, add-past-seats.mjs --names), a company based in California also keeps its
 * public names hidden here, as before, so nothing that was hidden starts to show.
 */
function publicNameOk(cx: Cx, companyId: string): boolean {
  const geo = T.geoOf(cx.g.companies.get(companyId), cx.s);
  return geo.country === "United States" && geo.region !== "California";
}

/** A seat holder's name and role, only when the member can see them (and a public-profile name only where it may show). */
function holderOf(cx: Cx, seatId: string | undefined | null): { name: string | null; role: string | null } {
  const e = seatId ? cx.g.engagements.get(seatId) : undefined;
  if (!e || !cx.f.me.visible(e.companyId)) return { name: null, role: null };
  const vis = (k: string) => T.cellOf(cx.s, cx.m, e, "engagement", k, cx.idx).s === "value";
  const op = T.cellOf(cx.s, cx.m, e, "engagement", "operator", cx.idx);
  if (op.s !== "value") return { name: null, role: null };
  if (T.valueOf(e, cx.s, "operator")?.pub && !publicNameOk(cx, e.companyId)) return { name: null, role: null };
  // A holder who hides their name on their seats is never named here.
  if (T.holderNameHidden(cx.s, e)) return { name: null, role: vis("role") ? (T.live(e, cx.s, "role") ?? null) : null };
  // The name as the seat shows it to this member: a member on Merlin the way they chose (lib/memberName.ts).
  return { name: shownName(op.v) || null, role: vis("role") ? (T.live(e, cx.s, "role") ?? null) : null };
}

/** A person on file (a leader, who hired for a seat): their name and title only when the member can see them. */
function personOf(cx: Cx, id: string | undefined | null): { name: string | null; title: string | null } {
  const p = id ? cx.g.contacts.get(id) : undefined;
  if (!p || !cx.f.me.visible(p.companyId)) return { name: null, title: null };
  const vis = (k: string) => T.cellOf(cx.s, cx.m, p, "contact", k, cx.idx).s === "value";
  return { name: vis("name") ? shownName(T.live(p, cx.s, "name") ?? "") || null : null, title: vis("title") ? (T.live(p, cx.s, "title") ?? null) : null };
}

const fnSeat = (fn: string | null | undefined) => (fn && fn !== "Other" ? `fractional ${fn}` : "fractional");

/* ---------- who decides ---------- */

interface Decider {
  id: string;
  name: string | null;
  title: string | null;
  /** Fractional seats they hired for or managed, on file. */
  hired: number;
}

function deciderOfSeat(cx: Cx, seatId: string | null | undefined): Decider | null {
  if (!seatId) return null;
  const l = (cx.seatLeaders.get(seatId) ?? [])[0];
  if (!l) return null;
  const p = personOf(cx, l.id);
  return { id: l.id, ...p, hired: hiredBy(cx, l.id) };
}
/** Fractional seats a leader hired for or managed: the seats with them on file, or with the same person (their name key) at the same company. */
const hiredBy = (cx: Cx, leaderId: string) => {
  const me = [...cx.w.leadersAt.values()].flat().find((x) => x.id === leaderId);
  const same = (x: WLeader) => x.id === leaderId || (!!me?.nameKey && x.nameKey === me.nameKey && x.companyId === me.companyId);
  let n = 0;
  for (const list of cx.seatLeaders.values()) if (list.some(same)) n++;
  return n;
};
/** The company's decider: who hired the most fractionals there, else a decision maker on file. */
function deciderAt(cx: Cx, companyId: string): Decider | null {
  const leaders = cx.w.leadersAt.get(companyId) ?? [];
  const ranked = leaders
    .filter((x) => x.rel === "Decision maker" || (x.rel && HIRE_RELS.has(x.rel)))
    .map((l) => ({ l, n: hiredBy(cx, l.id) }))
    .sort((a, b) => b.n - a.n || Number(b.l.rel === "Decision maker") - Number(a.l.rel === "Decision maker") || a.l.id.localeCompare(b.l.id));
  const top = ranked[0];
  if (!top) return null;
  return { id: top.l.id, ...personOf(cx, top.l.id), hired: top.n };
}

/** The last node: who decides, named as the member may see them, or the company. */
function targetNode(cx: Cx, companyId: string, d: Decider | null): { node: RouteNode; first: string; phrase: string } {
  if (d) {
    if (d.name) return { node: { role: "target", label: d.name, sub: `${d.title ? `${d.title} · ` : ""}decides`, initials: initialsOf(d.name) }, first: firstOf(d.name), phrase: firstOf(d.name) };
    const what = d.title ? `Their ${d.title}` : "Their decision maker";
    return { node: { role: "target", label: what, sub: "Decides · their name opens on the record", initials: "?", locked: true }, first: lc(what), phrase: lc(what) };
  }
  const name = companyLabel(cx, companyId);
  return { node: { role: "target", label: name ?? "This company", sub: "Whoever decides there", initials: name ? initialsOf(name) : "?", company: true, ...(name ? {} : { locked: true }) }, first: "whoever decides", phrase: `whoever decides at ${name ?? "the company"}` };
}

/* ---------- the evidence of each link ---------- */

/** You to the person you know: what you share. */
function youEvidence(cx: Cx, c: Contact | null, directory: string | null, bridge: string | null | undefined): { ev: Evidence[]; at: string | null } {
  const ev: Evidence[] = [];
  let at: string | null = null;
  const together = (pc: string | null) => {
    if (!pc) return;
    for (const id of cx.w.persons.get(pc)?.seats ?? []) {
      const a = cx.w.seats.get(id);
      if (!a) continue;
      for (const b of cx.mySeats) {
        if (a.companyId !== b.companyId || a.from === null || b.from === null || a.to === null || b.to === null) continue;
        if (a.from <= b.to && b.from <= a.to) {
          ev.push({ kind: "together", active: a.active && b.active, endYear: a.active && b.active ? null : yearOfIdx(Math.min(a.to, b.to)) });
          at ??= companyLabel(cx, a.companyId);
        }
      }
    }
  };
  if (!c) {
    // A peer in the Fractionals directory: you share a client (going while both of you are still there).
    const theirs = directory ? (cx.w.persons.get(directory)?.seats ?? []).map((id) => cx.w.seats.get(id)).filter((x) => x && x.companyId === bridge) : [];
    const mine = cx.mySeats.filter((x) => x.companyId === bridge);
    together(directory);
    ev.push({ kind: "peer", shared: { active: theirs.some((x) => x!.active) && mine.some((x) => x.active), year: null } });
    return { ev, at };
  }
  if ((c.meetings ?? 0) > 0 || (c.emails ?? 0) > 0) ev.push({ kind: "met", meetings: c.meetings ?? 0, emails: c.emails ?? 0, both: c.both, last: c.lastMet ?? null });
  // Saved in their Google contacts or their own contacts file, never met.
  else if (c.src.includes("google") || c.src.includes("csv")) ev.push({ kind: "contact" });
  if (c.msgCount) ev.push({ kind: "messages", count: c.msgCount, last: c.msgLast ?? null });
  if (c.member) ev.push({ kind: "peer" });
  // From the member's own LinkedIn export: messages each way (never the words), a vouch, or an invitation still pending.
  if (c.liMsg) ev.push({ kind: "limsg", count: c.liMsg.sent + c.liMsg.received, both: c.liMsg.sent > 0 && c.liMsg.received > 0, last: c.liMsg.last });
  if (c.vouch) ev.push({ kind: "vouch", rec: /[rR]/.test(c.vouch), theirs: /[re]/.test(c.vouch) });
  if (c.invited) ev.push({ kind: "invited", out: c.invited.out });
  else if (c.src.includes("linkedin")) ev.push({ kind: "linkedin", since: c.connected });
  together(personOfContact(cx.w, c));
  if (c.companyId && cx.myCompanies.has(c.companyId)) {
    const x = cx.myCompanies.get(c.companyId)!;
    ev.push({ kind: "client", active: x.active, endYear: x.active ? null : yearOfIdx(x.to) });
    at ??= companyLabel(cx, c.companyId);
  }
  // Warmth from the member's own Claude with no counts: what it says, never above Good.
  if (!ev.length && c.warmth) ev.push({ kind: "met", meetings: c.warmth === "Hot" || c.warmth === "Warm" ? 1 : 0, emails: 0, last: c.warmth === "Hot" || c.warmth === "Warm" ? new Date(cx.nowMs).toISOString().slice(0, 10) : null });
  return { ev, at };
}

interface Link {
  ev: Evidence[];
  at: string | null;
}
const linkOf = (cx: Cx, l: Link): RouteLink => {
  const strength = linkStrength(l.ev, cx.nowMs);
  const top = strongestOf(l.ev, cx.nowMs);
  return { band: bandOf(strength), strength: Math.round(strength * 100) / 100, words: top ? evidenceWords(top, cx.nowMs, l.at) : evidenceWords({ kind: "none" }, cx.nowMs) };
};
const seatEv = (x: WSeat | undefined): Evidence => ({ kind: "seat", active: !!x?.active, endYear: x && !x.active ? yearOfIdx(x.to) : null });
const reportedEv = (x: WSeat | undefined): Evidence => ({ kind: "reported", active: !!x?.active, endYear: x && !x.active ? yearOfIdx(x.to) : null });

/** The kind of way in, as a card says it. */
function kindWords(c: Contact | null, ev: Evidence[], nowMs: number, kind: PathView["kind"]): string {
  if (!c) return "A peer on Merlin";
  const top = strongestOf(ev, nowMs);
  if (top?.kind === "client") return "A former client";
  if (top?.kind === "together") return "Someone you worked with";
  if (c.member) return kind === "seat" ? "A peer who held the seat" : "A peer on Merlin";
  if (top?.kind === "linkedin" || top?.kind === "limsg" || top?.kind === "vouch" || top?.kind === "invited") return "From your LinkedIn";
  return "Through someone you know";
}

/* ---------- the company's hiring signals ---------- */

interface Signals {
  openRole: string | null;
  recentHire: boolean;
  hiredN: number;
  /** 0 (not in any of the member's lists) to 3. */
  fit: number;
}
const RECENT_HIRE_MONTHS = 18;
function signalsAt(cx: Cx, id: string, fit: number): Signals {
  const own = ownSeatTest(cx.seed, cx.s, cx.m);
  const engs = (cx.engsAt.get(id) ?? []).map((x) => cx.g.engagements.get(x)!).filter((e) => e && !own(e));
  const open = engs.filter((e) => T.isOpenRole(e, cx.s, cx.tracks));
  const openMine = open.find((e) => cx.fn && T.fnOf(e, cx.s) === cx.fn) ?? open[0] ?? null;
  const held = engs.filter((e) => !T.isOpenRole(e, cx.s, cx.tracks) && !!T.live(e, cx.s, "operator"));
  const nowIdx = cx.w.nowIdx;
  const recentHire = held.some((e) => {
    const st = /^(\d{4})-(\d{2})/.exec(T.live(e, cx.s, "start") ?? "");
    return !!st && nowIdx - (Number(st[1]) * 12 + Number(st[2]) - 1) <= RECENT_HIRE_MONTHS;
  });
  const fnOpen = openMine ? T.fnOf(openMine, cx.s) : null;
  return { openRole: openMine ? `Open ${fnOpen && fnOpen !== "Other" ? `${fnOpen} ` : "fractional "}role` : null, recentHire, hiredN: held.length, fit };
}

/* ---------- a route ---------- */

/** A route with what the server keeps of it: its shape for the plan, where it came from, and what orders it. */
export interface Built {
  view: RouteView;
  shape: Plan.RouteShape;
  raw: number;
  tie: number;
  /** Per node after You: where the name came from (the connector names only Merlin's own). */
  srcs: ("google" | "linkedin" | "csv" | "merlin")[][];
  /** The first person is a member (or in the directory). */
  firstMember: boolean;
  /** Where its first link comes from. */
  src: WaySource;
  /** Act for the ask and the person's email, from the member's own list. */
  act: RouteAct;
  email: string | null;
  note: { subject: string; body: string } | null;
}

const hash = (x: string) => createHash("sha256").update(x).digest("hex").slice(0, 16);

interface Draft {
  kind: string;
  nodes: RouteNode[];
  links: RouteLink[];
  /** What each link rests on (its strongest evidence) and the company it was at, for the why line. */
  tops: { e: Evidence | null; at: string | null }[];
  decides: boolean;
  /** First names (or phrases) for the words: each person in between, then the last person. */
  firsts: string[];
  targetFirst: string;
  /** Hop keys (internal), for the ids. */
  keys: string[];
  srcs: ("google" | "linkedin" | "csv" | "merlin")[][];
  act: RouteAct;
  email: string | null;
  note: { subject: string; body: string } | null;
  tie: number;
  /** What the decider hired before, for the why line. */
  hired: number;
  /** Where the first link comes from. */
  src: WaySource;
  /** The member the first person is, if one (internal id). */
  member?: string | null;
}

/** One way in the finder found, as a route. */
function draftOf(cx: Cx, p: PathView, companyId: string): Draft | null {
  const raw = PATH_RAW.get(p);
  if (!raw) return null;
  const parts = raw.parts;
  const c = raw.contact;
  const you: RouteNode = { role: "you", label: "You", sub: cx.f.me.words.as ? cx.f.me.words.as.charAt(0).toUpperCase() + cx.f.me.words.as.slice(1) : null, initials: "You" };
  const viaSrc: ("google" | "linkedin" | "csv" | "merlin")[] = c ? [...(c.src.includes("google") ? (["google"] as const) : []), ...(c.src.includes("linkedin") ? (["linkedin"] as const) : []), ...(c.src.includes("csv") ? (["csv"] as const) : []), ...(c.member || c.src.includes("messages") ? (["merlin"] as const) : [])] : ["merlin"];
  const y = youEvidence(cx, c, raw.directory?.key ?? null, parts.bridgeId);
  const nodes: RouteNode[] = [you];
  const links: RouteLink[] = [];
  const tops: Draft["tops"] = [];
  const pushLink = (l: Link) => {
    links.push(linkOf(cx, l));
    tops.push({ e: strongestOf(l.ev, cx.nowMs), at: l.at });
  };
  const firsts: string[] = [];
  const keys: string[] = [c ? `c:${c.key}` : `d:${raw.directory?.key ?? p.via.name}`];
  const srcs: Draft["srcs"] = [];
  const via: RouteNode = { role: "person", label: p.via.name, sub: p.via.title, initials: initialsOf(p.via.name) };
  let decides = false;
  let targetFirst = "whoever decides";
  let hired = 0;
  const finish = (d: Decider | null, last: Evidence | null) => {
    const t = targetNode(cx, companyId, d);
    if (last) pushLink({ ev: [last], at: null });
    nodes.push(t.node);
    srcs.push(["merlin"]);
    keys.push(d ? `l:${d.id}` : `co:${companyId}`);
    decides = !!d;
    targetFirst = t.first;
    hired = d?.hired ?? 0;
  };
  const viaIsTarget = (sub: string) => {
    // The person the member knows decides there: a note straight to them.
    nodes.push({ ...via, role: "target", sub });
    srcs.push(viaSrc);
    pushLink(y);
    decides = true;
    targetFirst = firstOf(p.via.name);
  };
  const addVia = (sub: string | null) => {
    nodes.push({ ...via, sub: sub ?? via.sub });
    srcs.push(viaSrc);
    pushLink(y);
    firsts.push(firstOf(p.via.name));
  };
  switch (parts.kind) {
    case "leads":
      viaIsTarget(`${p.via.title ?? "A leader"} · decides`);
      break;
    case "hired": {
      const fnWords = fnSeat(parts.fn);
      viaIsTarget(`${p.via.title ? `${p.via.title} · ` : ""}${parts.rel === "Reported to" ? `managed their ${fnWords} lead` : `hired their ${fnWords} lead`}`);
      hired = 1;
      break;
    }
    case "works": {
      addVia(p.via.title ? `${p.via.title} there` : "Works there");
      const d = deciderAt(cx, companyId);
      finish(d, d ? { kind: "colleague" } : { kind: "works" });
      break;
    }
    case "seat":
    case "client": {
      const x = parts.ownSeat ? cx.w.seats.get(parts.ownSeat) : undefined;
      addVia(parts.kind === "client" ? `Peer on Merlin · ${x?.active ? "holds" : "held"} their ${fnSeat(parts.fn)} seat` : `${x?.active ? "Holds" : "Held"} their ${fnSeat(parts.fn)} seat`);
      const d = deciderOfSeat(cx, parts.ownSeat);
      finish(d, d ? reportedEv(x) : seatEv(x));
      break;
    }
    default: {
      // Through someone the member knows to someone who holds or held a seat there (or one of its leaders).
      addVia(null);
      if (parts.leader) {
        const l = personOf(cx, parts.leaderId);
        const d: Decider = { id: parts.leaderId ?? "leader", name: l.name, title: l.title, hired: parts.leaderId ? hiredBy(cx, parts.leaderId) : 0 };
        pushLink({ ev: [{ kind: "leaderElsewhere" }], at: parts.bridge ?? null });
        const t = targetNode(cx, companyId, d);
        nodes.push(t.node);
        srcs.push(["merlin"]);
        keys.push(`l:${d.id}`);
        decides = true;
        targetFirst = t.first;
        hired = d.hired;
        break;
      }
      const x = parts.otherSeat ? cx.w.seats.get(parts.otherSeat) : undefined;
      const h = holderOf(cx, parts.otherSeat);
      const what = x?.active ? `Their ${fnSeat(parts.fn)} lead` : `Held their ${fnSeat(parts.fn)} seat${parts.tYear ? `, ${parts.tYear}` : ""}`;
      nodes.push({ role: "person", label: h.name ?? what, sub: h.name ? (h.role ? `${what} · ${h.role}` : what) : null, initials: h.name ? initialsOf(h.name) : "?", ...(h.name ? {} : { locked: true }) });
      srcs.push(["merlin"]);
      keys.push(`p:${x?.person ?? parts.otherSeat}`);
      firsts.push(h.name ? firstOf(h.name) : lc(what));
      const mid: Evidence =
        parts.kind === "overlap"
          ? { kind: "together", active: parts.year === null && parts.togetherEnd == null, endYear: parts.togetherEnd ?? parts.year ?? null }
          : parts.kind === "colleague"
            ? { kind: "colleague" }
            : { kind: "sameplace", year: parts.year ?? null };
      pushLink({ ev: [mid], at: parts.bridge ?? null });
      const d = deciderOfSeat(cx, parts.otherSeat);
      finish(d, d ? reportedEv(x) : seatEv(x));
    }
  }
  const memberId = c?.member ?? raw.directory?.member ?? null;
  const conversation = memberId ? (c?.conv ?? cx.convWith.get(memberId) ?? null) : null;
  const f1 = firstOf(p.via.name);
  let act: RouteAct = { kind: "note", first: f1 };
  if (memberId && (conversation || cx.directory.has(memberId))) act = { kind: "message", member: T.pubId(memberId), first: f1, conversation };
  else if (parts.kind === "seat" && parts.ownSeat && !memberId) act = { kind: "invite", seat: T.pubId(parts.ownSeat), first: f1 };
  const src: WaySource = !c
    ? "fellow"
    : c.src.includes("google")
      ? "google"
      : c.msgCount
        ? "messages"
        : c.src.includes("linkedin")
          ? "linkedin"
          : c.src.includes("csv")
            ? "csv"
            : c.member
              ? "messages"
              : "seat";
  return { kind: kindWords(c, y.ev, cx.nowMs, p.kind), nodes, links, tops, decides, firsts, targetFirst, keys, srcs, act, email: p.via.email, note: p.note, tie: p.score / 100, hired, src, member: memberId };
}

/** Write to who decides yourself: a note out of the blue. Only when someone who decides is on file. */
function directDraft(cx: Cx, companyId: string): Draft | null {
  const d = deciderAt(cx, companyId);
  if (!d) return null;
  const t = targetNode(cx, companyId, d);
  const you: RouteNode = { role: "you", label: "You", sub: null, initials: "You" };
  return {
    kind: "Write to them yourself",
    nodes: [you, t.node],
    links: [linkOf(cx, { ev: [{ kind: "none" }], at: null })],
    tops: [{ e: { kind: "none" }, at: null }],
    decides: true,
    firsts: [],
    targetFirst: t.first,
    keys: [`l:${d.id}`],
    srcs: [["merlin"]],
    act: { kind: "note", first: t.first },
    email: null,
    note: null,
    tie: 0,
    hired: d.hired,
    src: "direct",
  };
}

/**
 * Through a fellow fractional who holds or held a seat there and is in the Fractionals directory
 * (free to every member), whom the member hasn't met: what Merlin sees before the member brings in
 * anyone they know. One route a person (their latest seat there), never the member themself, never
 * someone already on another route here, never a fractional who hides their name on their seats. At
 * a company the member can't see, the person is unnamed (its routes open with the company).
 */
function fellowDrafts(cx: Cx, companyId: string, taken: Set<string>): Draft[] {
  const out: Draft[] = [];
  const bestOf = new Map<string, WSeat>();
  for (const x of cx.w.seatsAt.get(companyId) ?? []) {
    const p = cx.w.persons.get(x.person);
    if (!p?.member || !p.shown || p.member === cx.m.id || x.person === cx.f.me.person || taken.has(p.member)) continue;
    const was = bestOf.get(p.key);
    if (!was || (x.active && !was.active) || (x.active === was.active && (x.to ?? 0) > (was.to ?? 0))) bestOf.set(p.key, x);
  }
  const visible = cx.f.me.visible(companyId);
  const coName = companyLabel(cx, companyId);
  const sign = firstOf(cx.m.name);
  const as = cx.f.me.words.as || "a fractional leader";
  for (const [key, x] of bestOf) {
    const p = cx.w.persons.get(key)!;
    const e = cx.g.engagements.get(x.id);
    if (e && T.holderNameHidden(cx.s, e)) continue;
    const h = visible ? holderOf(cx, x.id) : { name: null, role: null };
    if (visible && !h.name) continue;
    const name = h.name;
    const fnW = fnSeat(x.fn);
    const you: RouteNode = { role: "you", label: "You", sub: null, initials: "You" };
    const via: RouteNode = { role: "person", label: name ?? "A fellow fractional", sub: `${x.active ? "Holds" : "Held"} their ${fnW} seat`, initials: name ? initialsOf(name) : "?", ...(name ? {} : { locked: true }) };
    const first = name ? firstOf(name) : "the fellow fractional";
    const d = deciderOfSeat(cx, x.id);
    const t = targetNode(cx, companyId, d);
    const l1: Link = { ev: [{ kind: "peer" }], at: null };
    const l2: Link = { ev: [d ? reportedEv(x) : seatEv(x)], at: null };
    const links = [linkOf(cx, l1), linkOf(cx, l2)];
    const co = coName ?? "the company";
    out.push({
      kind: "A fellow fractional on Merlin",
      nodes: [you, via, t.node],
      links,
      tops: [l1, l2].map((l) => ({ e: strongestOf(l.ev, cx.nowMs), at: l.at })),
      decides: !!d,
      firsts: [first],
      targetFirst: t.first,
      keys: [`d:${key}`, d ? `l:${d.id}` : `co:${companyId}`],
      srcs: [["merlin"], ["merlin"]],
      act: { kind: "message", member: T.pubId(p.member!), first, conversation: cx.convWith.get(p.member!) ?? null },
      email: null,
      note: {
        subject: `${co}: a question from a fellow fractional`,
        body: `Hi ${first},\n\nI saw on Merlin that you ${x.active ? "hold" : "held"} the ${fnW} seat at ${co}. I'm ${as}, and ${co} looks like a company I could help. Would you be open to 15 minutes on how they work${d ? `, or an intro to ${t.first} if it fits` : ""}?\n\nThanks either way,\n${sign}`,
      },
      tie: 0,
      hired: d?.hired ?? 0,
      src: "fellow",
      member: p.member,
    });
  }
  return out;
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const nudgeDay = (nowMs: number) => P.shortDay(Plan.businessDaysAfter(nowMs, Plan.NUDGE_BUSINESS_DAYS));

/** One link as a clause: what the two share, in plain words. `a` is "you" for the member's own link. */
function clause(a: string, b: string, e: Evidence | null, at: string | null, nowMs: number): string {
  const pair = a === "you" ? `you and ${b}` : `${a} and ${b}`;
  const where = at ? ` at ${at}` : "";
  if (!e) return `${pair} know each other`;
  switch (e.kind) {
    case "met":
      if (e.meetings) return `${pair} have met ${e.meetings === 1 ? "once" : `${e.meetings} times`}${e.last ? `, most recently ${monthDay(e.last, nowMs)}` : ""}`;
      if (e.emails) return `${pair} have traded ${e.emails} ${e.emails === 1 ? "email" : "emails"}`;
      return `${b} is in your contacts`;
    case "messages":
      return `${pair} talk on Merlin (${e.count} ${e.count === 1 ? "message" : "messages"}${e.last ? `, the last ${monthDay(e.last, nowMs)}` : ""})`;
    case "client":
      return e.active ? `${b} is your client${where}` : `${b} was your client${where}${e.endYear ? ` until ${e.endYear}` : ""}`;
    case "together":
      return e.active ? `${pair} work together${where}` : `${pair} worked together${where}${e.endYear ? ` until ${e.endYear}` : ""}`;
    case "peer":
      return `${b} is a peer on Merlin`;
    case "linkedin":
      return `${pair} are connected on your LinkedIn but haven't met`;
    case "limsg":
      return `${pair} have traded ${e.count} ${e.count === 1 ? "message" : "messages"} on LinkedIn${e.last ? `, the last ${monthDay(e.last, nowMs)}` : ""}`;
    case "vouch":
      return e.rec ? (e.theirs ? `${b} recommended you on LinkedIn` : `you recommended ${b} on LinkedIn`) : e.theirs ? `${b} endorsed you on LinkedIn` : `you endorsed ${b} on LinkedIn`;
    case "invited":
      return `${pair} aren't connected yet: an invitation is waiting on LinkedIn`;
    case "contact":
      return `${b} is in your contacts, but you haven't met`;
    case "colleague":
      return `${pair} work together${where}`;
    case "sameplace":
      return `${pair} were both${where || " at the same company"}${e.year ? ` in ${e.year}` : ""}`;
    case "leaderElsewhere":
      return `${a} worked${where || " in the same place"} with one of their leaders`;
    case "reported":
      return e.active ? `${a} reports to ${b}` : `${a} reported to ${b}${e.endYear ? ` until ${e.endYear}` : ""}`;
    case "seat":
      return e.active ? `${a} holds a fractional seat there` : `${a} held a fractional seat there${e.endYear ? ` until ${e.endYear}` : ""}`;
    case "works":
      return `${a} works there`;
    case "none":
      return `${b} doesn't know you yet`;
  }
}

/** The why line: what each link rests on, the hand-offs, who decides, why now. Two or three sentences. */
function whyOf(d: Draft, sig: Signals, nowMs: number): string {
  const between = d.nodes.length - 2;
  const t = d.targetFirst;
  if (between === 0 && d.tops[0]?.e?.kind === "none")
    return `Nobody in between, so it's quick. But ${t} doesn't know you, so it leans on timing${sig.openRole ? `: the ${lc(sig.openRole).replace(/^open /, "")} is open now` : ""}.`;
  const names = [...d.firsts, t];
  const parts: string[] = [];
  for (let k = 0; k < d.links.length; k++) {
    // The last link of a route that doesn't reach who decides is said in the second sentence.
    if (!d.decides && k === d.links.length - 1 && k > 0) continue;
    parts.push(clause(k === 0 ? "you" : names[k - 1], names[k], d.tops[k]?.e ?? null, d.tops[k]?.at ?? null, nowMs));
  }
  const first = `${cap(parts[0])}.${parts.length > 1 ? ` ${cap(parts.slice(1).join(", and "))}.` : ""}`;
  const second = d.decides
    ? `${cap(t)} decides on fractional hires${d.hired >= 2 ? `, and has hired ${d.hired} before` : d.hired === 1 ? ", and has hired one before" : ""}.`
    : `Nobody who decides is on file yet, so ${d.firsts[d.firsts.length - 1] ?? "they"} would pass you on.`;
  return `${first}${between >= 2 ? ` It takes ${between === 2 ? "one more hand-off" : `${between - 1} more hand-offs`}.` : ""} ${second}`;
}

function stepsOfDraft(cx: Cx, d: Draft, companyName: string | null, sig: Signals): RouteStepView[] {
  const between = d.nodes.length - 2;
  const t = d.targetFirst;
  const T0 = cap(t);
  const co = companyName ?? "the company";
  const out: RouteStepView[] = [];
  const voice = cx.f.me.words;
  const sign = firstOf(cx.m.name);
  const nudge = (to: string): RouteNote => ({
    to,
    subject: `Following up on ${co}`,
    body: `Hi ${to}, just checking in on my note about ${co}. Happy to send two lines you can forward if that makes it easier. Thanks either way.\n\n${sign}`,
    email: null,
  });
  if (between === 0) {
    const direct = d.links[0]?.words === "You have never met";
    const body = direct
      ? `Hi ${t.startsWith("their") || t.startsWith("whoever") ? "there" : t}, I saw ${co} ${sig.openRole ? `is hiring for a ${lc(sig.openRole).replace(/^open /, "")}` : "has worked with fractional leaders before"}. I'm ${voice.as || "a fractional leader"}${voice.clients ? ` and I help ${voice.clients}` : ""}. Worth 20 minutes to see if I can help?\n\n${sign}`
      : d.note?.body ?? "";
    const note: RouteNote = { to: T0, subject: direct ? `A fractional ${cx.fn ? `${cx.fn} leader` : "leader"} for ${co}` : (d.note?.subject ?? `About ${co}`), body, email: direct ? null : d.email };
    out.push({
      n: 1, kind: "ask", who: "Your move", title: `Send ${t} a short note`, detail: direct ? "Built around why now. Sent from your own email." : "You know each other. Keep it short and specific.",
      note, nudge: null, act: d.act.kind === "message" ? d.act : { kind: "note", first: T0 }, primary: d.act.kind === "message" ? `Send to ${T0} on Merlin` : "Open in Gmail with the note", alt: "Edit the note", cant: null,
    });
    out.push({ n: 2, kind: "wait", who: `Waiting on ${T0}`, title: `${T0} replies`, detail: `Sent today. Merlin suggests one follow-up on ${nudgeDay(cx.nowMs)}.`, note: null, nudge: nudge(T0), act: null, primary: `${T0} replied`, alt: "No reply yet", cant: "No reply after the follow-up" });
    out.push({ n: 3, kind: "meet", who: "Your move", title: `Meet ${t}`, detail: "Pick a time that works.", note: null, nudge: null, act: null, primary: "Meeting booked", alt: "Open in Gmail", cant: null });
    return out;
  }
  const A = d.firsts[0];
  const B = d.firsts[1] ?? t;
  out.push({
    n: 1, kind: "ask", who: "Your move", title: `Ask ${A} for an intro${between >= 2 ? ` to ${B}` : ""}`, detail: `Short and easy to say yes to. ${A} can forward it as is.`,
    note: d.note ? { to: A, subject: d.note.subject, body: d.note.body, email: d.email } : null, nudge: null, act: d.act,
    primary: d.act.kind === "message" ? `Send to ${A} on Merlin` : d.act.kind === "invite" ? `Invite ${A} to connect` : "Open in Gmail with the note", alt: "Edit the note", cant: null,
  });
  for (let k = 0; k < between; k++) {
    const who = d.firsts[k];
    const next = d.firsts[k + 1] ?? t;
    out.push({
      n: k + 2, kind: "wait", who: `Waiting on ${cap(who)}`, title: k === 0 ? `${cap(who)} introduces you to ${next}` : `${cap(who)} brings you to ${next}`,
      detail: k === 0 ? `Sent today. Merlin checks back with you on ${nudgeDay(cx.nowMs)}.` : `${cap(d.firsts[k - 1])} introduced you. ${cap(who)} can raise you with ${next}.`,
      note: null, nudge: nudge(cap(who)), act: null, primary: `${cap(who)} made the intro`, alt: "No reply yet", cant: k === 0 ? `${cap(who)} can't help` : `${cap(who)} can't help`,
    });
  }
  out.push({ n: between + 2, kind: "meet", who: "Your move", title: `Meet ${t}`, detail: `${T0} replied to the intro. Pick a time that works.`, note: null, nudge: null, act: null, primary: "Meeting booked", alt: "Open in Gmail", cant: null });
  return out;
}

function howOf(d: Draft): string[] {
  const between = d.nodes.length - 2;
  const t = d.targetFirst;
  if (between === 0) return [`You send ${t} a short note`, `${cap(t)} replies`, `You meet ${t}`];
  const out = [`You ask ${d.firsts[0]} for an intro${between >= 2 ? ` to ${d.firsts[1]}` : ""}`];
  for (let k = 0; k < between; k++) out.push(k === 0 ? `${cap(d.firsts[k])} introduces you to ${d.firsts[k + 1] ?? t}` : `${cap(d.firsts[k])} brings you to ${d.firsts[k + 1] ?? t}`);
  out.push(`You meet ${t}`);
  return out;
}

/** Where a link after the first rests: Merlin's seats, or the people on file. */
function linkFrom(e: Evidence | null): string {
  if (!e) return WAY_SOURCE_WORDS.direct;
  if (e.kind === "seat" || e.kind === "reported" || e.kind === "together" || e.kind === "client") return WAY_SOURCE_WORDS.seat;
  if (e.kind === "none") return "No link yet";
  return WAY_SOURCE_WORDS.direct;
}

function build(cx: Cx, companyId: string, d: Draft, sig: Signals): Built {
  const between = d.nodes.length - 2;
  const raw = estRaw({ links: d.links.map((l) => l.strength), handoffs: between, decides: d.decides, openRole: !!sig.openRole, recentHire: sig.recentHire, fit: sig.fit });
  const est = roundEst(raw);
  const name = companyLabel(cx, companyId);
  const tNode = d.nodes[d.nodes.length - 1];
  const hops = d.keys.map((k) => `h${hash(`${cx.m.id}|${k}`)}`);
  const id = `r${hash(`${cx.m.id}|${companyId}|${hops.join(",")}`)}`;
  const src = [...new Set(d.srcs.flat().filter((x): x is "google" | "linkedin" | "csv" => x === "google" || x === "linkedin" || x === "csv"))];
  const short = between === 0 ? `Write to ${d.targetFirst}` : `${cap(d.firsts[0])}'s route`;
  const links = d.links.map((l, k) => ({ ...l, from: k === 0 ? WAY_SOURCE_WORDS[d.src] : linkFrom(d.tops[k]?.e ?? null) }));
  const view: RouteView = {
    id,
    short,
    title: between === 0 ? `Write to ${tNode.locked ? d.targetFirst : tNode.label} yourself` : `Go through ${d.nodes[1].label}`,
    kind: d.kind,
    nodes: d.nodes,
    links,
    chain: d.nodes.map((n, k) => (k === d.nodes.length - 1 && n.sub && !n.company && !n.locked ? `${n.label}, ${n.sub.replace(/ · decides$/, "").replace(/^decides$/, "")}`.replace(/, $/, "") : n.label)).join(" → "),
    between,
    decides: d.decides,
    est,
    time: timeWords(d.links.map((l) => l.band), between),
    why: whyOf(d, sig, cx.nowMs),
    how: howOf(d),
    steps: stepsOfDraft(cx, d, name, sig),
    because: "",
    fresh: freshOf(d.tops.map((t) => t.e), cx.nowMs),
    src: d.src,
  };
  return {
    view,
    shape: { id, hops, between, links: d.links.map((l) => l.band), decides: d.decides, est, ...(src.length ? { src } : {}) },
    raw,
    tie: d.tie,
    srcs: d.srcs,
    firstMember: d.act.kind === "message",
    src: d.src,
    act: d.act,
    email: d.email,
    note: d.note,
  };
}

/** The decision card's line for each route, by where it stands among the others. */
function becauseOf(list: Built[]): void {
  list.forEach((b, k) => {
    const v = b.view;
    const weakest = v.links.reduce((a, l) => Math.min(a, l.strength), 1);
    v.because =
      k === 0
        ? `The best Est. success of your routes to ${(() => {
            const t = v.nodes[v.nodes.length - 1];
            return t.locked || t.company ? lc(t.label) : t.label;
          })()}.`
        : v.between === 0
          ? "Fastest to try. Worth it if you want an answer this week."
          : weakest >= 0.8
            ? "Every link is strong, so the intro arrives with a real recommendation."
            : `${estWords(v.est)}, with ${betweenWords(v.between).toLowerCase()} in between.`;
  });
}

/** Every route into a company, best first (the highest Est. success), the member's own plan's route kept even when it falls out of the top. */
export function routesAt(cx: Cx, companyId: string, fit: number): { all: Built[]; sig: Signals } {
  const sig = signalsAt(cx, companyId, fit);
  const x = cx.f.byCompany.get(companyId);
  const drafts: Draft[] = [];
  for (const p of x?.paths ?? []) {
    const d = draftOf(cx, p, companyId);
    if (d) drafts.push(d);
  }
  // Fellow fractionals who held a seat there, whom the member hasn't met (not already on a route here).
  const taken = new Set<string>(drafts.map((d) => d.member).filter((x): x is string => !!x));
  drafts.push(...fellowDrafts(cx, companyId, taken));
  // The direct note, unless the member already knows who decides (a route straight to them is there).
  const direct = directDraft(cx, companyId);
  if (direct) drafts.push(direct);
  const seen = new Set<string>();
  const all: Built[] = [];
  for (const d of drafts) {
    const b = build(cx, companyId, d, sig);
    if (seen.has(b.view.id)) continue;
    // A note straight to who decides, when a route already ends there with nobody in between, is the same route.
    if (d === direct && all.some((o) => o.view.between === 0 && o.shape.hops[o.shape.hops.length - 1] === b.shape.hops[0])) continue;
    seen.add(b.view.id);
    all.push(b);
  }
  all.sort((a, b) => compareRoutes({ raw: a.raw, handoffs: a.view.between, decides: a.view.decides, tie: a.tie }, { raw: b.raw, handoffs: b.view.between, decides: b.view.decides, tie: b.tie }));
  becauseOf(all);
  return { all, sig };
}

/* ---------- fit and odds ---------- */

interface Lists {
  rows: Map<string, RadarSentRow>;
  views: SavedSearch[];
  icp: import("../tableTypes").Icp | null;
}
function listsOf(cx: Cx): Lists {
  let rows = new Map<string, RadarSentRow>();
  try {
    rows = crystalRowsOf(cx.seed, cx.s, cx.m, cx.nowMs);
  } catch {
    /* no Crystal Ball yet */
  }
  const views = (cx.s.connector?.alerts?.[cx.m.id] ?? []) as SavedSearch[];
  const prof = cx.s.profiles[cx.m.id] ?? {};
  const icp = prof.icp && !icpIsEmpty(prof.icp) ? prof.icp : null;
  return { rows, views, icp };
}

function viewOf(cx: Cx, L: Lists, id: string): string | null {
  if (!L.views.length) return null;
  const c = cx.g.companies.get(id);
  if (!c) return null;
  const engs = (cx.engsAt.get(id) ?? []).map((x) => cx.g.engagements.get(x)!).filter(Boolean);
  const s = cx.s;
  const facts = { industry: T.live(c, s, "industry"), employees: T.live(c, s, "employees"), revenue: T.live(c, s, "revenue"), hq: T.live(c, s, "hq"), ...T.geoOf(c, s) };
  const past = engs.filter((e) => !!T.live(e, s, "operator")).length;
  for (const v of L.views) {
    const { hiredFn, hiredWithin: _w, ...rest } = v; // eslint-disable-line @typescript-eslint/no-unused-vars
    const plain: SavedSearch = { ...rest, ...(hiredFn?.length ? { functions: hiredFn } : {}) };
    const fns = engs.length ? engs.map((e) => T.fnOf(e, s)) : [null];
    if (fns.some((fn) => alertMatches(plain, { function: fn, ...facts, pastHires: past }))) return v.name;
  }
  return null;
}

function fitOfCo(cx: Cx, L: Lists, id: string): { ball: boolean; view: string | null; profile: boolean } {
  const ball = L.rows.has(id);
  const view = viewOf(cx, L, id);
  let profile = false;
  if (L.icp) {
    const cf = companyFacts(cx.g, cx.s, id);
    profile = !!cf && inIcp(L.icp, cf);
  }
  return { ball, view, profile };
}
const tagsOf = (x: { ball: boolean; view: string | null; profile: boolean }) => [x.ball ? "In your Crystal Ball" : null, x.view ? `Saved view: ${x.view}` : null, x.profile ? "Your profile" : null].filter((t): t is string => !!t);
const fitNum = (x: { ball: boolean; view: string | null; profile: boolean }) => (x.ball || x.view || x.profile ? fitLevel({ ball: x.ball, view: !!x.view, profile: x.profile }) : 0);

interface OddsX {
  band: OddsBand;
  score: number;
  why: string;
}
function oddsOf(cx: Cx, L: Lists, ids: string[]): Map<string, OddsX> {
  const out = new Map<string, OddsX>();
  const live: Map<string, HireOdds> = cx.fn ? oddsFor(cx.seed, cx.s, ids, cx.fn, cx.nowMs, L.icp, cx.m) : new Map();
  const own = ownSeatTest(cx.seed, cx.s, cx.m);
  for (const id of ids) {
    const o = live.get(id);
    if (o) {
      out.set(id, { band: o.band, score: o.score, why: o.why });
      continue;
    }
    const engs = (cx.engsAt.get(id) ?? []).map((x) => cx.g.engagements.get(x)!).filter((e) => e && !own(e));
    const open = engs.some((e) => T.isOpenRole(e, cx.s, cx.tracks));
    const held = engs.filter((e) => !T.isOpenRole(e, cx.s, cx.tracks) && !!T.live(e, cx.s, "operator"));
    const band = oddsFallback({ openRole: open, pastHires: held.length, fnsHired: new Set(held.map((e) => T.fnOf(e, cx.s))).size });
    out.set(id, { band, score: band === "High" ? 0.6 : band === "Medium" ? 0.3 : 0.05, why: open ? "An open fractional role now" : held.length >= 2 ? "Hired fractionals before" : "No hiring sign on Merlin yet" });
  }
  return out;
}

const NO_SIGN = /^(No hiring sign|Has a fractional)/;
const whyNow = (o: OddsX) => (NO_SIGN.test(o.why) ? null : `${o.why.split(" · ")[0]}.`);

/* ---------- the plan, in words ---------- */

const plans = (s: State) => ((s as WithRoutes).routes ??= {});
const planAt = (s: State, memberId: string, companyId: string): Plan.RoutePlan | undefined => (s as WithRoutes).routes?.[memberId]?.[companyId];

function whenWords(at: string, nowMs: number): string {
  const d = at.slice(0, 10);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === new Date(nowMs - DAY).toISOString().slice(0, 10)) return "Yesterday";
  return monthDay(d, nowMs);
}

/** One log line in words, with the names of the route it happened on as the member may see them now. */
function logWords(l: Plan.PlanLog, byId: Map<string, RouteView>, est: number): string {
  const r = byId.get(l.r);
  const people = r ? r.nodes.slice(1).map((n) => (n.locked ? lc(n.label) : n.label.split(" ")[0])) : [];
  const at = (k: number) => people[k] ?? "them";
  const last = people[people.length - 1] ?? "them";
  const between = r?.between ?? 1;
  const step = l.step ?? 1;
  switch (l.k) {
    case "chose":
      return r ? `Chose ${r.short} (${estWords(r.est || est).toLowerCase()})` : "Chose a route";
    case "switched":
      return r ? `Switched to ${r.short}` : "Switched route";
    case "planb":
      return r ? `Plan B: ${r.short}` : "Moved to plan B";
    case "sent":
      return between === 0 ? `Note sent to ${last}` : `Asked ${at(0)} for an intro`;
    case "intro":
      return between === 0 ? `${cap(last)} replied` : `${cap(at(step - 2))} introduced you to ${at(step - 1)}`;
    case "noreply":
      return `No reply yet from ${between === 0 ? last : at(Math.max(0, step - 2))}. Nudge drafted`;
    case "nudged":
      return `Nudged ${between === 0 ? last : at(Math.max(0, step - 2))}`;
    case "cant":
      return between === 0 ? `No reply from ${last} after the follow-up` : `${cap(at(Math.max(0, step - 2)))} couldn't help`;
    case "booked":
      return `Meeting with ${last} booked`;
  }
}

function planViewOf(p: Plan.RoutePlan, all: Built[], nowMs: number): PlanView {
  const byId = new Map(all.map((b) => [b.view.id, b.view]));
  const cur = byId.get(p.route) ?? null;
  const b = p.planB ? byId.get(p.planB) ?? null : null;
  const from = p.fromCant ? byId.get(p.fromCant) ?? null : null;
  const t = cur ? cur.nodes[cur.nodes.length - 1] : null;
  const tWord = t ? (t.locked ? lc(t.label) : t.label.split(" ")[0]) : "them";
  const extra = b && cur ? (b.between > cur.between ? ", one more hand-off" : b.between < cur.between ? ", fewer hand-offs" : "") : "";
  let switchedWhy: string | null = null;
  if (p.fromCant && cur) {
    const fromWho = from ? (from.between === 0 ? `${from.nodes[1].label.split(" ")[0]} didn't reply.` : `${from.nodes[1].label.split(" ")[0]} couldn't help this time.`) : "That route stalled.";
    switchedWhy = `${fromWho} ${cur.short} is the next best way to ${tWord}, so it's picked for you.`;
  }
  return {
    route: p.route,
    current: cur,
    step: Math.min(p.step, p.steps + 1),
    steps: p.steps,
    done: Plan.isDone(p),
    decision: `${cur?.short ?? "Your route"} · chosen ${whenWords(p.at, nowMs).toLowerCase()}`,
    because: cur?.because ?? "",
    planB: b ? `${b.short}: ${estWords(b.est).toLowerCase()}${extra}.` : null,
    planBId: b?.id ?? null,
    nudge: p.nudge ?? null,
    nudgeDue: Plan.nudgeDue(p, nowMs),
    switchedWhy,
    log: p.log.map((l) => ({ when: whenWords(l.at, nowMs), what: logWords(l, byId, p.est) })),
  };
}

/* ---------- the answers ---------- */

function wayInFor(cx: Cx, id: string): { view: WayInView; all: Built[] } {
  const L = listsOf(cx);
  const fit = fitOfCo(cx, L, id);
  const name = companyLabel(cx, id);
  const { all, sig } = routesAt(cx, id, fitNum(fit));
  const d = deciderAt(cx, id);
  const plan = planAt(cx.s, cx.m.id, id);
  const locked = !name;
  // The plan's route stays on the page even when it isn't in the top few.
  let shown = all.slice(0, ROUTES_MAX);
  if (plan && !shown.some((b) => b.view.id === plan.route)) {
    const mine = all.find((b) => b.view.id === plan.route);
    if (mine) shown = [...shown.slice(0, ROUTES_MAX - 1), mine];
  }
  return {
    all,
    view: {
      on: true,
      id: T.pubId(id),
      name,
      locked,
      facts: factsOf(cx.seed, cx.s, id),
      decider: d ? `${d.name ?? (d.title ? `Their ${d.title}` : "Their decision maker")}${d.name && d.title ? `, ${d.title}` : ""}, decides` : null,
      hired: sig.hiredN ? `Hired ${sig.hiredN} ${sig.hiredN === 1 ? "fractional" : "fractionals"} before` : null,
      openRole: sig.openRole,
      // A locked company: its routes open with it ("Open this company to see your routes").
      routes: locked ? [] : shown.map((b) => b.view),
      hidden: locked ? 0 : Math.max(0, all.length - shown.length),
      plan: plan && !locked ? planViewOf(plan, all, cx.nowMs) : null,
      explain: HOW_ESTIMATED,
      following: (cx.s.follows?.[cx.m.id] ?? []).includes(id),
      peers: 0,
      fn: cx.fn,
    },
  };
}

/** One company's way in (internal id), for the signed-in member. */
export function wayInOf(seed: Seed, s: State, m: Member, id: string, nowMs = Date.now()): WayInView {
  return wayInFor(cxOf(seed, s, m, nowMs), id).view;
}

/** Every route into a company (internal id), best first, with what the server keeps: for the connector and the checks. */
export function routesOf(seed: Seed, s: State, m: Member, id: string, nowMs = Date.now()): Built[] {
  const cx = cxOf(seed, s, m, nowMs);
  const L = listsOf(cx);
  return routesAt(cx, id, fitNum(fitOfCo(cx, L, id))).all;
}

const viaWords = (v: RouteView | undefined): string | null => {
  if (!v) return null;
  const people = v.nodes.slice(1);
  if (v.between === 0) return `Write to ${people[0].label}`;
  return `Through ${people[0].label}, then ${people[1].locked ? lc(people[1].label) : people[1].label}`;
};

/** One company that fits the member, with its routes and odds: what Where you can get in and Warm paths are both built from. */
interface Core {
  id: string;
  name: string | null;
  fit: { ball: boolean; view: string | null; profile: boolean };
  lvl: 1 | 2 | 3;
  odds: OddsX;
  sig: Signals;
  routes: Built[];
  top: Built | undefined;
}

/** Every company that fits the member (their Crystal Ball, a saved view, their profile), never their own clients. */
function coresOf(cx: Cx, L: Lists): Core[] {
  const own = ownSeatTest(cx.seed, cx.s, cx.m);
  const held = new Set([...cx.g.engagements.values()].filter(own).map((e) => e.companyId));
  const fits = new Map<string, { ball: boolean; view: string | null; profile: boolean }>();
  for (const id of cx.g.companies.keys()) {
    if (held.has(id) || cx.f.me.clients.has(id)) continue;
    const fit = fitOfCo(cx, L, id);
    if (fit.ball || fit.view || fit.profile) fits.set(id, fit);
  }
  const odds = oddsOf(cx, L, [...fits.keys()]);
  const out: Core[] = [];
  for (const [id, fit] of fits) {
    const { all: routes, sig } = routesAt(cx, id, fitNum(fit));
    out.push({ id, name: companyLabel(cx, id), fit, lvl: fitLevel({ ball: fit.ball, view: !!fit.view, profile: fit.profile }), odds: odds.get(id)!, sig, routes, top: routes[0] });
  }
  return out;
}

/** A way in's fine value along the map: its unrounded estimate (5 to 85), or -1 with no route. */
const wayFine = (b: Built | undefined) => (b ? Math.max(EST.min, Math.min(EST.max, b.raw * 100)) : -1);
/** The zone of a company from the two lines: fits (or likely hires) above, a warmer way in to the right. */
const zoneBy = (high: boolean, warm: boolean): Zone => (high ? (warm ? "go" : "find") : warm ? "warm" : "watch");
/**
 * The companies the map draws: the best of each quadrant first (so no quadrant is empty because the
 * others ranked higher), then the best of the rest, up to `max`. The member's plans always show.
 */
function balanced<T extends { zone: Zone; plan: boolean }>(ranked: T[], max: number): Set<T> {
  const per = Math.floor(max / 4);
  const on = new Set<T>(ranked.filter((r) => r.plan).slice(0, max));
  const n: Record<Zone, number> = { go: 0, find: 0, warm: 0, watch: 0 };
  for (const r of on) n[r.zone]++;
  for (const r of ranked) if (on.size < max && !on.has(r) && n[r.zone] < per) on.add(r), n[r.zone]++;
  for (const r of ranked) if (on.size < max && !on.has(r)) on.add(r);
  return on;
}
const zeros = (): Record<Zone, number> => ({ go: 0, find: 0, warm: 0, watch: 0 });

const memo = new WeakMap<State, Map<string, GetInView>>();

/**
 * Where you can get in (the old look): every company that fits the member, estimated and placed by
 * their best way in (across) and how likely they hire (up). The middle line across is placed from
 * the data (rank.ts splitLine), not fixed at 35%, and the map draws the best of each quadrant first,
 * so a member without contacts of their own still sees all four. Their own clients never show.
 */
export function getInOf(seed: Seed, s: State, m: Member, nowMs = Date.now()): GetInView {
  let per = memo.get(s);
  if (!per) memo.set(s, (per = new Map()));
  const k = `${m.id}:${new Date(nowMs).toISOString().slice(0, 10)}:${lockedMatchesHidden() ? "h" : "s"}`;
  const hit = per.get(k);
  if (hit) return hit;
  const cx = cxOf(seed, s, m, nowMs);
  const L = listsOf(cx);
  const cores = coresOf(cx, L);
  const sp = splitLine(cores.map((c) => c.top?.view.est ?? null), cores.map((c) => wayFine(c.top)));
  const xs = placeAxis(cores.map((c) => c.top?.view.est ?? null), cores.map((c) => wayFine(c.top)), sp, { lo0: 8, none: 6 });
  const all: (GetInRow & { r: number; ty: number })[] = [];
  const countsAll = zeros();
  const viewN = new Map<string, number>();
  let ball = 0;
  let profile = 0;
  const mine = (s as WithRoutes).routes?.[m.id] ?? {};
  cores.forEach((c, i) => {
    const best = c.top ? c.top.view.est : null;
    const warm = isHigh(sp, best, wayFine(c.top));
    const zone = zoneBy(c.odds.band !== "Low", warm);
    countsAll[zone]++;
    if (c.fit.ball) ball++;
    if (c.fit.profile) profile++;
    if (c.fit.view) viewN.set(c.fit.view, (viewN.get(c.fit.view) ?? 0) + 1);
    const ty = Math.min(1, c.odds.score / 0.6);
    all.push({
      id: T.pubId(c.id),
      name: c.name,
      facts: factsOf(seed, s, c.id),
      tags: tagsOf(c.fit),
      fit: c.lvl,
      odds: c.odds.band,
      hiringNow: !!c.sig.openRole,
      zone,
      best,
      via: c.name ? viaWords(c.top?.view) : null,
      band: c.top ? c.top.view.links[0].band : null,
      x: xs[i],
      y: mapPoint(best, c.odds.band, ty).y,
      why: whyNow(c.odds),
      plan: !!mine[c.id],
      locked: !c.name,
      r: companyScore(best, c.odds.band, c.lvl, c.top?.tie ?? 0),
      ty,
    });
  });
  all.sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
  const on = balanced(all, GETIN_MAX);
  const shown = all.filter((x) => on.has(x));
  const counts = zeros();
  for (const x of shown) counts[x.zone]++;
  const boxOf = (x: { x: number; y: number; best: number | null }): [number, number, number, number] => [x.best === null ? 3 : x.x >= 50 ? 54 : 12, x.best === null ? 9 : x.x >= 50 ? 94 : 46, x.y >= 50 ? 54 : 6, x.y >= 50 ? 94 : 46];
  const placed = spreadBox(shown.map((x) => ({ id: x.id, x: x.x, y: x.y, box: boxOf(x) })));
  const at = new Map(placed.map((p) => [p.id, p]));
  const view: GetInView = {
    on: true,
    fn: cx.fn,
    rows: shown.map(({ r: _r, ty: _y, ...x }) => ({ ...x, x: at.get(x.id)!.x, y: at.get(x.id)!.y })), // eslint-disable-line @typescript-eslint/no-unused-vars
    counts,
    countsAll,
    total: cores.length,
    ball,
    views: [...viewN].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    profile,
    lockedWays: cx.f.lockedWays.size,
  };
  if (per.size > 500) per.clear();
  per.set(k, view);
  return view;
}

/* ---------- Warm paths ---------- */

/** Companies the map draws, and the most the list holds. */
export const WARM_MAP_MAX = 36;
export const WARM_MAX = 300;
const FIT_TRAITS = ["function", "industry", "size", "revenue", "a hiring signal"] as const;

/**
 * How well a company fits the member, from five traits Merlin can check: it hired fractionals in
 * the member's function (or has a role open in it), its industry, size and revenue are in their
 * ideal client, and a hiring signal (a role open now, a fractional hired in the last 18 months, or
 * high odds in their Crystal Ball). A trait the member's profile doesn't ask about never counts.
 */
function fitTraits(cx: Cx, L: Lists, id: string, sig: Signals, odds: OddsX): string[] {
  const out: string[] = [];
  if (cx.fn) {
    const engs = (cx.engsAt.get(id) ?? []).map((x) => cx.g.engagements.get(x)!).filter(Boolean);
    if (engs.some((e) => T.fnOf(e, cx.s) === cx.fn)) out.push(FIT_TRAITS[0]);
  }
  const cf = L.icp ? companyFacts(cx.g, cx.s, id) : null;
  if (L.icp && cf) {
    const key = (v: string) => v.trim().toLowerCase();
    if (cf.industry && L.icp.industries.map(key).includes(key(cf.industry))) out.push(FIT_TRAITS[1]);
    if (cf.employees && L.icp.employees.includes(cf.employees)) out.push(FIT_TRAITS[2]);
    if (cf.revenue && L.icp.revenue.includes(cf.revenue)) out.push(FIT_TRAITS[3]);
  }
  if (sig.openRole || sig.recentHire || odds.band === "High") out.push(FIT_TRAITS[4]);
  return out;
}

const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** The member's ideal client in a line: "Sales, in Software and Fintech, with 51-200 people". */
function icpWords(cx: Cx, L: Lists): string | null {
  const parts: string[] = [];
  if (cx.fn) parts.push(cx.fn);
  if (L.icp?.industries.length) parts.push(`in ${listWords(L.icp.industries.slice(0, 5))}`);
  if (L.icp?.employees.length) parts.push(`with ${listWords(L.icp.employees.slice(0, 4))} people`);
  if (L.icp?.revenue.length) parts.push(`at ${listWords(L.icp.revenue.slice(0, 3))} revenue`);
  return parts.length ? parts.join(", ") : null;
}

/** The words for where a line sits. */
const fitLineWords = (sp: Split): WarmLine => ({ at: sp.at, words: sp.at !== null ? `Fit ${sp.at} of 5 or more` : sp.fineAt === Infinity ? "Every company here fits about the same" : "The better fitting half" });
const wayLineWords = (sp: Split): WarmLine => ({ at: sp.at, words: sp.at !== null ? `Est. success ${sp.at}% or more` : sp.fineAt === Infinity ? "No way in yet" : "Your warmer half of these ways in" });

const warmMemo = new WeakMap<State, Map<string, WarmView>>();

/**
 * Warm paths (the new look): every company that fits the member, placed by how well it fits them
 * (up, fit of 5 with its odds as the tie-break) and how strong their best way in is (across, by Est.
 * success). Both middle lines are placed from these companies (rank.ts splitLine), and the map
 * draws the best few of each quadrant, so the marks spread across all four; the list holds them
 * all, best first. Names follow the same rules as Your way in; a locked company is its facts.
 */
export function warmOf(seed: Seed, s: State, m: Member, nowMs = Date.now()): WarmView {
  let per = warmMemo.get(s);
  if (!per) warmMemo.set(s, (per = new Map()));
  const k = `${m.id}:${new Date(nowMs).toISOString().slice(0, 10)}:${lockedMatchesHidden() ? "h" : "s"}:${networkOn() ? "g" : "-"}`;
  const hit = per.get(k);
  if (hit) return hit;
  const cx = cxOf(seed, s, m, nowMs);
  const L = listsOf(cx);
  const cores = coresOf(cx, L);
  const traits = cores.map((c) => fitTraits(cx, L, c.id, c.sig, c.odds));
  const fitC = traits.map((t) => t.length);
  const fitF = cores.map((c, i) => fitC[i] + Math.min(1, c.odds.score / 0.6) * 0.9);
  // The best route, as Your way in recommends it. A cold note to who decides (Write to them yourself) is the weakest way in, and says so.
  const tops = cores.map((c) => c.top);
  const wayC = tops.map((t) => t?.view.est ?? null);
  const wayF = tops.map((t) => wayFine(t));
  const spFit = splitLine(fitC, fitF);
  const spWay = splitLine(wayC, wayF);
  // The quadrants' names sit in the corners: the marks keep clear of them (up 16 to 84).
  const xs = placeAxis(wayC, wayF, spWay, { lo: [16, 44], hi: [57, 93], none: 6 });
  const ys = placeAxis(fitC, fitF, spFit, { lo: [20, 43], hi: [57, 80] });
  const mine = (s as WithRoutes).routes?.[m.id] ?? {};
  const countsAll = zeros();
  const bySource: WarmView["bySource"] = {};
  const listN = new Map<string, number>();
  let ball = 0;
  const rows: (WarmRow & { score: number })[] = cores.map((c, i) => {
    const top = tops[i];
    const high = isHigh(spFit, fitC[i], fitF[i]);
    const warm = isHigh(spWay, wayC[i], wayF[i]);
    const zone = zoneBy(high, warm);
    countsAll[zone]++;
    if (top) bySource[top.src] = (bySource[top.src] ?? 0) + 1;
    if (c.fit.ball) ball++;
    if (c.fit.view) listN.set(c.fit.view, (listN.get(c.fit.view) ?? 0) + 1);
    const visible = !!c.name;
    const p1 = top?.view.nodes[1];
    const via = !top
      ? null
      : !visible
        ? top.src === "fellow"
          ? "Through a fellow fractional"
          : top.src === "direct"
            ? "A cold note to who decides"
            : "A way in. Open it to see who"
        : top.view.between === 0
          ? top.src === "direct"
            ? `A cold note to ${p1!.locked ? lc(p1!.label) : p1!.label}`
            : `You know ${p1!.label}`
          : `Through ${p1!.locked ? lc(p1!.label) : p1!.label}`;
    const people = visible
      ? c.routes
          .slice(0, ROUTES_MAX)
          .filter((r) => r.view.nodes[1] && !r.view.nodes[1].locked && !r.view.nodes[1].company && r.src !== "direct")
          .map((r) => ({ key: `p${hash(`${m.id}|${r.shape.hops[0]}`)}`, name: r.view.nodes[1].label, sub: r.view.nodes[1].sub, band: r.view.links[0].band }))
      : [];
    const fresh = top?.view.fresh ?? null;
    return {
      id: T.pubId(c.id),
      name: c.name,
      facts: factsOf(seed, s, c.id),
      locked: !visible,
      fit: fitC[i],
      fitWords: traits[i],
      odds: c.odds.band,
      hiringNow: !!c.sig.openRole,
      ball: c.fit.ball,
      list: c.fit.view,
      best: top ? top.view.est : null,
      band: top ? top.view.links[0].band : null,
      src: top ? top.src : null,
      via,
      person: top && top.src !== "direct" && people[0] ? people[0] : null,
      people,
      fresh,
      zone,
      x: xs[i],
      y: ys[i],
      onMap: false,
      plan: !!mine[c.id],
      rank: 0,
      score: (top ? top.raw * 100 : 0) + (high ? 30 : 0) + fitF[i] * 4 + oddsIdx(c.odds.band) * 3 + (c.sig.openRole ? 4 : 0),
    };
  });
  rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const kept = rows.slice(0, WARM_MAX);
  kept.forEach((r, k2) => (r.rank = k2 + 1));
  const on = balanced(kept, WARM_MAP_MAX);
  const counts = zeros();
  const boxOf = (r: WarmRow): [number, number, number, number] => [r.best === null ? 3 : r.x >= 50 ? 55 : 14, r.best === null ? 9 : r.x >= 50 ? 95 : 46, r.y >= 50 ? 55 : 19, r.y >= 50 ? 81 : 45];
  const placed = spreadBox(kept.filter((r) => on.has(r)).map((r) => ({ id: r.id, x: r.x, y: r.y, box: boxOf(r) })), 7.5);
  const at = new Map(placed.map((p) => [p.id, p]));
  for (const r of kept)
    if (on.has(r)) {
      r.onMap = true;
      counts[r.zone]++;
      r.x = at.get(r.id)!.x;
      r.y = at.get(r.id)!.y;
    }
  const ways = wayC.filter((x): x is number => x !== null);
  const paths = (s as State & { paths?: Record<string, { linkedin?: unknown; csv?: unknown }> }).paths?.[m.id];
  const view: WarmView = {
    on: true,
    fn: cx.fn,
    rows: kept.map(({ score: _s, ...r }) => r), // eslint-disable-line @typescript-eslint/no-unused-vars
    counts,
    countsAll,
    total: cores.length,
    lines: { fit: fitLineWords(spFit), way: wayLineWords(spWay) },
    warmest: ways.length ? Math.max(...ways) : null,
    bySource,
    own: { google: networkOn() && !!s.network?.[m.id]?.google, linkedin: !!paths?.linkedin, csv: !!paths?.csv },
    conversations: cx.convWith.size,
    directory: cx.directory.size,
    lockedWays: cx.f.lockedWays.size,
    icp: icpWords(cx, L),
    ball,
    lists: [...listN].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
  };
  if (per.size > 500) per.clear();
  per.set(k, view);
  return view;
}

/** The member's plans, for Home's move and the pipeline's route line: the ones still going first, the nudge due first of all. */
export function planLinesOf(seed: Seed, s: State, m: Member, nowMs = Date.now()): PlanLine[] {
  const mine = (s as WithRoutes).routes?.[m.id];
  if (!mine) return [];
  const cx = cxOf(seed, s, m, nowMs);
  const L = listsOf(cx);
  const out: PlanLine[] = [];
  for (const [id, p] of Object.entries(mine)) {
    if (!cx.g.companies.has(id)) continue;
    const name = companyLabel(cx, id);
    if (!name) continue;
    const { all } = routesAt(cx, id, fitNum(fitOfCo(cx, L, id)));
    const v = planViewOf(p, all, nowMs);
    const r = v.current;
    if (!r) continue;
    const people = r.nodes.slice(1).map((n) => (n.locked ? lc(n.label) : n.label.split(" ")[0]));
    const st = r.steps[Math.min(p.step, p.steps) - 1];
    const actor = Plan.actorOf(r, p.step);
    const whoNow = "person" in actor ? cap(people[actor.person] ?? "them") : null;
    const waiting = st?.kind === "wait";
    const since = p.log.length ? P.shortDay(p.log[p.log.length - 1].at.slice(0, 10)) : P.shortDay(p.at.slice(0, 10));
    const marks = r.nodes.slice(1).map((_, k) => (p.step > k + 1 || v.done ? "done" : p.step === k + 1 ? "now" : "next")) as PlanLine["marks"];
    const nudgeOn = p.nudge ? P.shortDay(p.nudge) : null;
    out.push({
      company: T.pubId(id),
      name,
      short: r.short,
      via: `via ${people.join(" → ")}`,
      step: Math.min(p.step, p.steps),
      steps: p.steps,
      done: v.done,
      move: v.done ? `Meeting with ${people[people.length - 1]} booked` : waiting && p.nudge ? `Check in with ${whoNow}` : st ? st.title : r.title,
      line: v.done
        ? "Every step is done. Next: the proposal."
        : waiting
          ? p.nudge
            ? `You asked ${whoNow} ${daysAgo(lastSent(p) ?? p.at, nowMs)}. No reply yet. A short nudge is drafted.`
            : `Waiting on ${whoNow}. Merlin checks back with you on ${nudgeOn ?? P.shortDay(Plan.businessDaysAfter(Date.parse(p.log[p.log.length - 1]?.at ?? p.at), Plan.NUDGE_BUSINESS_DAYS))}.`
          : st?.detail ?? "",
      nudgeDue: v.nudgeDue,
      since: v.done ? `All ${p.steps} steps done` : `Step ${Math.min(p.step, p.steps)} of ${p.steps}${waiting ? ` · waiting on ${whoNow} since ${since}` : ""}`,
      next: v.done ? "Next: the proposal" : waiting ? (nudgeOn ? `Next: nudge ${whoNow}, ${nudgeOn}` : `Next: ${lcStep(st.title)}`) : `Next: ${lcStep(st?.title ?? r.title)}`,
      marks,
      now: v.done ? null : st ?? null,
      updatedAt: p.log[p.log.length - 1]?.at ?? p.at,
    });
  }
  // Still going first; a nudge due, then a nudge drafted, then the latest.
  const nudged = (x: PlanLine) => (x.nudgeDue ? 2 : x.now?.kind === "wait" && /nudge is drafted/.test(x.line) ? 1 : 0);
  return out.sort((a, b) => Number(a.done) - Number(b.done) || nudged(b) - nudged(a) || b.updatedAt.localeCompare(a.updatedAt));
}
const lastSent = (p: Plan.RoutePlan) => {
  for (let k = p.log.length - 1; k >= 0; k--) if (p.log[k].k === "sent") return p.log[k].at;
  return null;
};
const daysAgo = (at: string, nowMs: number) => {
  const d = Math.max(0, Math.round((nowMs - Date.parse(at)) / DAY));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/* ---------- what the member does: go, a step's answer, switch ---------- */

export type WayOp = { do: "go"; route: string } | { do: "step"; step: number; answer: Plan.StepOp } | { do: "drop" };

const internalOf = (seed: Seed, s: State, pub: unknown): string | null => {
  const p = typeof pub === "string" ? pub.slice(0, 80) : "";
  if (!p) return null;
  for (const id of T.graph(seed, s).companies.keys()) if (T.pubId(id) === p) return id;
  return null;
};

/**
 * Do one thing on the member's plan at a company, and answer with the page as it is after it. The
 * routes are worked out from the committed state before the write (the page's ids are checked
 * against them, never trusted), and the write is one T.mutate. Go with creates or updates the
 * company's pipeline deal with the route on it (lib/pipeline.ts routeEntry: a new one waits at To
 * reach out until the first step goes out). A step's answer is
 * recorded with its outcome, and the outcome counted anonymously (State.routeStats). The member's
 * ask through a drafted note goes into the pipeline as the existing rule has it (a note used is
 * Sent); a message or an invite on Merlin moves it when it goes out. Nothing is sent from here.
 */
export async function wayAct(token: string | null, pub: unknown, op: WayOp, nowMs = Date.now()): Promise<{ view: WayInView; message: string }> {
  if (!pathsOn()) throw new ActionError("Ways in aren't on for Merlin yet.");
  const w = await who(token);
  if (!w) throw new ActionError("You're signed out. Sign in again.");
  const id = internalOf(w.seed, w.s, pub);
  if (!id) throw new ActionError("That company isn't on Merlin anymore.");
  const cx = cxOf(w.seed, w.s, w.m, nowMs);
  if (!cx.f.me.visible(id)) throw new ActionError("Open this company first. Then you can pick a route.");
  const L = listsOf(cx);
  const { all } = routesAt(cx, id, fitNum(fitOfCo(cx, L, id)));
  const byId = new Map(all.map((b) => [b.view.id, b]));
  const next = (not: string[]) => all.find((b) => !not.includes(b.view.id)) ?? null;
  let message = "";
  await T.mutate((s) => {
    const mine = (plans(s)[w.m.id] ??= {});
    const had = mine[id];
    const stats = ((s as WithRoutes).routeStats ??= {});
    if (op.do === "go") {
      const r = byId.get(String(op.route ?? ""));
      if (!r) throw new ActionError("That route isn't there anymore. Here are your routes as they are now.");
      if (!had && Object.keys(mine).length >= Plan.PLAN_LIMITS.plans) throw new ActionError(`That's ${Plan.PLAN_LIMITS.plans} plans, the most at once. Drop one you're done with first.`);
      const b = next([r.view.id]);
      const res = Plan.go(had, r.shape, b?.view.id ?? null, nowMs);
      mine[id] = res.plan;
      const log = ((s.pipeline ??= {})[w.m.id] ??= P.emptyPipeline());
      // A new deal waits at To reach out until the first step goes out (lib/pipeline.ts routeEntry); an open one takes the route.
      const deal = P.routeEntry(log, { id: `pl${randomBytes(8).toString("hex")}`, companyId: id, channel: r.act.kind === "message" ? "merlin" : r.view.between === 0 ? "email" : "intro", source: "record", nowMs }).entry;
      const where = deal.stage === "reach" ? "It's in your pipeline at To reach out." : "It's on your deal in your pipeline.";
      message = res.switched ? `Switched to ${r.view.short}. Step 1: ${lc(r.view.steps[0].title)}.` : res.changed ? `Going with ${r.view.short}. ${where} Nothing is sent until you send it.` : `You're on ${r.view.short}.`;
      return;
    }
    if (op.do === "drop") {
      if (had) delete mine[id];
      if (!Object.keys(mine).length) delete plans(s)[w.m.id];
      message = "Plan dropped. Your deal stays in your pipeline.";
      return;
    }
    if (!had) throw new ActionError("Pick a route first.");
    const r = byId.get(had.route);
    if (!r) throw new ActionError("The people on this route changed. Pick a route again.");
    if (!Plan.isStepOp(op.answer)) throw new ActionError("That didn't go through. Refresh the page and try again.");
    const at = had.step;
    const res = Plan.answer(had, r.view, op.answer, Math.round(Number(op.step)), nowMs);
    if (!res.ok) throw new ActionError(res.refused ?? "That didn't go through.");
    if (res.outcome) {
      const link = r.view.links[Math.min(r.view.links.length - 1, Math.max(0, at - 1))]?.band ?? null;
      Plan.countOutcome(stats, Plan.statKey({ between: r.view.between, link, decides: r.view.decides, est: had.est }), res.outcome);
    }
    // The member's own ask went out (their click: the drafted note opened, or their message or invite on Merlin): the deal is Sent, the pipeline's own rule.
    if (op.answer === "sent") {
      const log = ((s.pipeline ??= {})[w.m.id] ??= P.emptyPipeline());
      const src = r.srcs[0] ?? [];
      const person = r.view.nodes[1];
      const channel: P.Channel = r.act.kind === "message" || r.act.kind === "invite" ? "merlin" : r.view.between === 0 ? "email" : "intro";
      P.openEntry(log, { id: `pl${randomBytes(8).toString("hex")}`, companyId: id, channel, to: person.locked || person.company ? {} : { name: person.label, ...(src.includes("google") ? { google: true } : {}) }, source: "record", via: r.act.kind === "note" ? "note" : "message", nowMs });
    }
    if (res.planB) {
      const b = had.planB ? byId.get(had.planB) ?? null : next([had.route]);
      const after = b ? next([had.route, b.view.id]) : null;
      if (Plan.takePlanB(had, b?.shape ?? null, after?.view.id ?? null, nowMs)) message = `Plan B: ${b!.view.short}. Go with it when you're ready.`;
      else message = "Noted. Pick another route, or ask a peer who knows them.";
      return;
    }
    message =
      op.answer === "sent"
        ? `Step ${at} done. Merlin checks back with you on ${P.shortDay(Plan.businessDaysAfter(nowMs, Plan.NUDGE_BUSINESS_DAYS))}.`
        : op.answer === "noreply"
          ? `Got it. Merlin drafted a short nudge for you to send on ${P.shortDay(had.nudge!)}, and reminds you then.`
          : op.answer === "nudged"
            ? "Nudge logged."
            : op.answer === "booked"
              ? "Meeting booked. Your pipeline moves to Meeting when it's on your calendar."
              : `Step ${at} done.`;
  });
  const w2 = (await who(token))!;
  return { view: wayInOf(w2.seed, w2.s, w2.m, id, nowMs), message };
}

/* ---------- for the route ---------- */

/** GET /api/paths?way=<public id>. { on: false } with RN_PATHS off; null signed out; { none: true } for no such company. */
export async function wayIn(token: string | null, pub: unknown, nowMs = Date.now()): Promise<WayInView | { on: false } | { none: true } | null> {
  if (!pathsOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  const id = internalOf(w.seed, w.s, pub);
  if (!id) return { none: true };
  const v = wayInOf(w.seed, w.s, w.m, id, nowMs);
  // How many peers serve companies like this one (Pass it to a peer's own picks): a count only.
  if (!v.locked)
    try {
      const picks = await peerPicks(token, v.id, null);
      v.peers = picks?.picks.length ?? 0;
    } catch {
      /* peers off: no count */
    }
  return v;
}

/** GET /api/paths?map=1. */
export async function getInView(token: string | null, nowMs = Date.now()): Promise<GetInView | { on: false } | null> {
  if (!pathsOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  return getInOf(w.seed, w.s, w.m, nowMs);
}

/** GET /api/paths?warm=1. */
export async function warmView(token: string | null, nowMs = Date.now()): Promise<WarmView | { on: false } | null> {
  if (!pathsOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  return warmOf(w.seed, w.s, w.m, nowMs);
}

/** GET /api/paths?plans=1. */
export async function planLines(token: string | null, nowMs = Date.now()): Promise<{ plans: PlanLine[] } | { on: false } | null> {
  if (!pathsOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  return { plans: planLinesOf(w.seed, w.s, w.m, nowMs) };
}

export { internalOf as companyInternalOf };
export type { PathBand };
