/**
 * Peers, the server's half (lib/peersCore.ts has the rules, the words and what the app gets):
 *
 *   GET /api/table?peers=1            PeersView: the Peers page (peersView)
 *   GET /api/table?peers=home         PeersHome: Home's From your peers (peersHome)
 *   GET /api/table?peers=picks&c=ID[&role=ID][&for=team]   PeerPicks: who to pass a company to, or team up with (peerPicks)
 *   POST { action: { type: "peer.*" } }   performPeer
 *
 * The sections of the Peers page, for the signed-in member only:
 *  - Fractionals you already know: members and seat holders matched to the member's OWN LinkedIn
 *    import, Google contacts (RN_GOOGLE) and conversations (lib/paths contactsOf, matched precisely
 *    as Smart ways in matches them). Built from that member's sources alone and sent to them alone.
 *    A seat holder not on Merlin is named there by the name in the member's own contact, never by a
 *    name Merlin holds that the member hasn't unlocked.
 *  - Peers who serve your kind of clients: members in complementary functions, ranked by the
 *    member's Crystal Ball companies they hold seats at and by their kind of client.
 *  - Your circle (or the one Merlin proposes), and the leads and teams between the member and peers.
 *
 * Privacy, every answer: only members who have signed in, never one who is out of the directory
 * (said no, or hides their name on their seats: the directory's own rule; unless the two already
 * talk), never a block either way, never an email address. A member with Open to leads off is never
 * offered for a lead, and a pass to them is refused. A peer's seats
 * are the seats the directory already shows the member (lib/fractionals.ts, with its locks), and a
 * company is named only where the member can see its name. A member's Google or LinkedIn contacts
 * are never read for anyone else. The one thing a peer can open for another is the lead they pass:
 * that company (and its open roles' postings) opens for the member it went to, free (giftCompany).
 */
import { randomBytes } from "crypto";
import { publicBase } from "./links";
import { ActionError, fractionalInternals as F, isAdmin, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "./table";
import { HIDDEN_COMPANY, functionOf } from "./tableFields";
import { fractionalRecords } from "./fractionals";
import { crystalCompanyIds } from "./radar";
import { contactsOf } from "./paths";
import { personOfContact } from "./paths/find";
import { worldOf } from "./paths/world";
import { networkOn } from "./google/types";
import { MAIL, emailEnabled, escHtml, footerNote, mailButton, mailH, mailP, mailShell, oneLine, sendEmail } from "./email";
import { NOTIFICATIONS_PATH, emailLinker } from "./emailIn";
import { settingsLink } from "./messages";
import { STAGE_WORDS, emptyPipeline, entryAt, isOpen, openEntry, openLead } from "./pipeline";
import type { StoredConversation } from "./messageState";
import type { Action, ActionResult, FractionalRec } from "./tableTypes";
import {
  CIRCLE_MAX, CIRCLE_POSTS_DAILY, DRAFT_MAX, KNOWN_WORDS, NOTE_MAX, PASS_CREDIT, PASS_DAILY, PASS_FROM, POST_MAX, SECTION_MAX, TEAMS_OPEN, TEAM_DAILY,
  agoWords, circleFit, circleName, cleanText, complements, emptyPeers, firstOf, leadLine, monthOf, overlapOf, passMessage, promptFor, teamDraft, teamMessage, threadWords,
  type Circle, type CircleOffer, type CircleRec, type ClientShape, type KnownFrom, type LeadPass, type LeadRec, type PassFrom, type PeerPick, type PeerPicks, type PeerRec,
  type PeersHome, type PeersState, type PeersView, type TeamRec, type TeamUp, type ThreadState,
} from "./peersCore";

const DAY = 86_400_000;
const SIGNED_OUT = "You're signed out. Sign in again to see your peers.";
const NOT_TAKING = "They're not taking leads right now.";
const newId = (p: string) => `${p}${randomBytes(8).toString("hex")}`;
const peersOf = (s: State): PeersState => (s.peers ??= emptyPeers());

/* ---------- reading members ---------- */

type Ctx = ReturnType<typeof ctxOf>;

/** What every answer here reads, once per call: the graph, the members, the viewer's locks and their directory. */
function ctxOf(seed: Seed, s: State, me: Member, nowMs: number) {
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const p = s.peers ?? emptyPeers();
  const hiddenCo = (companyId: string) => T.identityHidden(g, s, idx, tracks, me, companyId);
  const blocked = (a: string, b: string) => (s.blocks?.[a] ?? []).includes(b);
  const mutedBy = (who: string, of: string) => (p.mutes[who] ?? []).includes(of);
  const prof = (id: string) => s.profiles[id] ?? {};
  const fnOfMember = (id: string): string | null => {
    const m = idx.byId.get(id);
    const pr = prof(id);
    const f = pr.function ?? functionOf(pr.title || m?.title);
    return f && f !== "Other" ? f : null;
  };
  const titleOf = (id: string) => {
    const m = idx.byId.get(id);
    return (prof(id).title || (m?.title === "Member" ? "" : m?.title) || "").trim();
  };
  const shapeOf = (id: string): ClientShape | null => {
    const icp = prof(id).icp;
    return icp && (icp.industries.length || icp.employees.length) ? { industries: icp.industries, employees: icp.employees } : null;
  };
  /**
   * Out of the directory, by the directory's own rule (lib/fractionals.ts hiddenMember): they said no,
   * turned Referral partners off before choosing, hide their name on their seats, or closed their account.
   */
  const hidden = (id: string) =>
    !!s.closures?.[id] || !!prof(id).nameHidden || prof(id).fractionals === false || (prof(id).fractionals === undefined && !!prof(id).partnersOff);
  /** Turned Open to leads off on their card: nobody can pass them a company. */
  const leadsOff = (id: string) => !!prof(id).leadsOff;
  // The conversations between the viewer and each member, newest last message first.
  const convWith = new Map<string, StoredConversation>();
  const lastAt = (c: StoredConversation) => c.messages[c.messages.length - 1]?.at ?? c.createdAt;
  for (const c of s.conversations ?? []) {
    const other = c.a === me.id ? c.b : c.b === me.id ? c.a : null;
    if (!other) continue;
    const had = convWith.get(other);
    if (!had || lastAt(had) < lastAt(c)) convWith.set(other, c);
  }
  /** The two already work together: a conversation, a lead passed, a team. */
  /** Worked together for real: a lead passed either way, or a team. (A conversation alone is only "You've messaged".) */
  const workedWith = (id: string) => p.passes.some((x) => (x.by === me.id && x.to === id) || (x.to === me.id && x.by === id)) || p.teams.some((t) => (t.by === me.id && t.with === id) || (t.with === me.id && t.by === id));
  const related = (id: string) => convWith.has(id) || workedWith(id);
  /**
   * A member the viewer can see as a peer: signed in, not them, not an admin (Revenue Nomad staff),
   * no block either way, and in the directory unless the two already work together.
   */
  const peerOk = (id: string) => id !== me.id && idx.byId.has(id) && !isAdmin(idx.byId.get(id)!) && T.signedIn(s, idx, id) && !blocked(id, me.id) && !blocked(me.id, id) && (!hidden(id) || related(id));
  /**
   * The name the viewer sees: the way the member chose to show to other members (lib/memberName.ts,
   * one rule with the directory, the seats and Messages): in full only when they show in the
   * directory, else first name and last initial, or hidden.
   */
  const nameOf = (id: string) => T.memberNameById(seed, s, id, me.id);
  const companyKind = (companyId: string) => {
    const c = g.companies.get(companyId);
    if (!c) return null;
    // "SaaS company of 51–200 people": read after "a" ("a SaaS company of 51–200 people"), and never the name.
    const ind = T.live(c, s, "industry");
    const emp = T.live(c, s, "employees");
    return ind ? `${ind} company${emp ? ` of ${emp} people` : ""}` : emp ? `company of ${emp} people` : null;
  };
  const companyName = (companyId: string) => (g.companies.has(companyId) && !hiddenCo(companyId) ? g.companies.get(companyId)!.name : null);
  const pubCompany = new Map<string, string>();
  for (const id of g.companies.keys()) pubCompany.set(T.pubId(id), id);
  const pubSeat = new Map<string, string>();
  for (const id of g.engagements.keys()) pubSeat.set(T.pubId(id), id);
  const memberByPub = new Map(idx.all.map((m) => [T.pubId(m.id), m] as const));
  return { seed, s, me, nowMs, g, idx, tracks, p, hiddenCo, blocked, mutedBy, prof, fnOfMember, titleOf, shapeOf, hidden, leadsOff, convWith, related, workedWith, peerOk, nameOf, companyKind, companyName, pubCompany, pubSeat, memberByPub, lastAt };
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((c) => /\p{L}/u.test(c))
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Where the viewer's latest conversation with a member stands. */
function threadOf(x: Ctx, otherId: string): PeerRec["thread"] | undefined {
  const c = x.convWith.get(otherId);
  if (!c) return undefined;
  const msgs = c.messages.filter((m) => !m.removed);
  const last = msgs[msgs.length - 1];
  if (!last) return undefined;
  const side = c.a === x.me.id ? "a" : "b";
  const read = c.readAt[side] ?? "";
  let state: ThreadState;
  if (last.by === x.me.id) state = "you";
  else if (last.at > read) state = "unread";
  else state = msgs.some((m) => m.by === x.me.id && m.at < last.at) ? "replied" : "them";
  return { id: c.id, state, at: last.at, words: threadWords(state, last.at, x.nowMs) };
}

/** An open role's function, title and posted rate as the viewer sees them. */
function roleOf(x: Ctx, roleId: string | undefined, viewer: Member = x.me): { fn: string | null; title: string | null; rate: string | null } | null {
  const e = roleId ? x.g.engagements.get(roleId) : undefined;
  if (!e) return null;
  const cell = (k: string) => {
    const c = T.cellOf(x.s, viewer, e, "engagement", k, x.idx);
    return c.s === "value" ? c.v : null;
  };
  const fn = T.fnOf(e, x.s) ?? functionOf(T.live(e, x.s, "role"));
  return { fn: fn && fn !== "Other" ? fn : null, title: cell("role"), rate: cell("rate") };
}

/** The open roles at a company (internal ids). */
const openRolesAt = (x: Ctx, companyId: string) => [...x.g.engagements.values()].filter((e) => e.companyId === companyId && T.isOpenRole(e, x.s, x.tracks));

/** A peer card. `rec`: their directory record as the viewer may see it, when they have one. */
function peerCard(x: Ctx, memberId: string | null, rec: FractionalRec | undefined, known?: { name: string; from: KnownFrom[]; why: string }): PeerRec {
  const name = memberId ? x.nameOf(memberId) : known?.name ?? rec?.name ?? "A fractional";
  const fn = memberId ? x.fnOfMember(memberId) ?? rec?.fn ?? null : rec?.fn ?? null;
  // What they're working on: their current seats as the directory shows them to the viewer (its locks), the company named only when the viewer can see it.
  const working = memberId && x.hidden(memberId) && !rec
    ? []
    : (rec?.seats ?? [])
        .filter((st) => st.now)
        .slice(0, 3)
        .map((st) => {
          const coId = x.pubCompany.get(st.co) ?? "";
          const seatId = x.pubSeat.get(st.id);
          const e = seatId ? x.g.engagements.get(seatId) : undefined;
          const role = e ? T.cellOf(x.s, x.me, e, "engagement", "role", x.idx) : null;
          const f = e ? T.fnOf(e, x.s) : null;
          return { co: st.co, name: x.companyName(coId), kind: x.companyKind(coId), role: role?.s === "value" ? role.v : f ? `Fractional ${f}` : null };
        });
  // Companies both know: their seats at companies the viewer knows by name.
  const both = [...new Set((rec?.seats ?? []).map((st) => x.companyName(x.pubCompany.get(st.co) ?? "")).filter((n): n is string => !!n))].slice(0, 4);
  const card: PeerRec = {
    id: memberId ? T.pubId(memberId) : rec?.id ?? "",
    ...(memberId ? { memberId: T.pubId(memberId) } : {}),
    name,
    first: firstOf(name),
    initials: initialsOf(name),
    title: memberId ? x.titleOf(memberId) || rec?.title || "" : rec?.title ?? "",
    fn,
    level: rec?.level ?? null,
    onMerlin: !!memberId,
    working,
    both,
    ...(known ? { known: { from: known.from, why: known.why } } : {}),
  };
  if (memberId) {
    const t = threadOf(x, memberId);
    if (t) card.thread = t;
    if (x.mutedBy(x.me.id, memberId)) card.muted = true;
    const toThem = x.p.passes.filter((q) => q.by === x.me.id && q.to === memberId).length;
    const fromThem = x.p.passes.filter((q) => q.to === x.me.id && q.by === memberId).length;
    if (toThem || fromThem) card.passed = { toThem, fromThem };
    const teams = x.p.teams.filter((t) => t.status === "active" && ((t.by === x.me.id && t.with === memberId) || (t.with === x.me.id && t.by === memberId))).map((t) => t.id);
    if (teams.length) card.teams = teams;
  } else if (rec?.invite) card.invite = rec.invite;
  return card;
}

/* ---------- leads and teams as the viewer sees them ---------- */

function leadRec(x: Ctx, q: LeadPass): LeadRec {
  const toMe = q.to === x.me.id;
  const otherId = toMe ? q.by : q.to;
  // Named the way they chose to show to other members (lib/memberName.ts), as everywhere.
  const otherName = x.nameOf(otherId);
  const name = x.companyName(q.companyId);
  const role = roleOf(x, q.roleId);
  const entry = q.entryId ? x.s.pipeline?.[q.to]?.entries.find((e) => e.id === q.entryId) : undefined;
  const seen = x.p.seen[x.me.id] ?? "";
  return {
    id: q.id,
    side: toMe ? "to-you" : "from-you",
    who: { id: T.pubId(otherId), name: otherName, first: firstOf(otherName) },
    company: T.pubId(q.companyId),
    name,
    kind: x.companyKind(q.companyId),
    role: role?.fn ?? null,
    rate: role?.rate ?? null,
    line: toMe ? leadLine({ from: otherName, company: name ?? x.companyKind(q.companyId) ?? "a company", role: role?.fn, rate: role?.rate }) : `You passed ${name ?? "a company"} to ${firstOf(otherName)}`,
    note: q.note,
    from: q.from,
    at: q.at,
    status: q.status,
    ...(q.answeredAt ? { answeredAt: q.answeredAt } : {}),
    // The peer's deal there, for the passer: only whether it was won (never its stage, notes or who they wrote to).
    ...(entry?.stage === "won" ? { won: true } : {}),
    // The recipient's own deal: its stage, To reach out until their note goes out. Never shown to the passer.
    ...(toMe && entry ? { stage: STAGE_WORDS[entry.stage] } : {}),
    ...(q.conversationId ? { conversationId: q.conversationId } : {}),
    ...(!toMe && q.paid ? { credited: PASS_CREDIT } : {}),
    ...((toMe ? q.status === "new" : q.status === "taken") && (q.answeredAt ?? q.at) > seen ? { fresh: true } : {}),
  };
}

function teamRec(x: Ctx, t: TeamUp): TeamRec {
  const invited = t.by === x.me.id;
  const otherId = invited ? t.with : t.by;
  const otherName = x.nameOf(otherId);
  const stageAt = (memberId: string) => {
    const e = entryAt(x.s.pipeline?.[memberId], t.companyId);
    return e ? STAGE_WORDS[e.stage] : null;
  };
  const seen = x.p.seen[x.me.id] ?? "";
  return {
    id: t.id,
    company: T.pubId(t.companyId),
    name: x.companyName(t.companyId),
    kind: x.companyKind(t.companyId),
    status: t.status,
    invited,
    with: { id: T.pubId(otherId), name: otherName, first: firstOf(otherName), title: x.titleOf(otherId), fn: x.fnOfMember(otherId) },
    me: { fn: x.fnOfMember(x.me.id) },
    at: t.at,
    conversationId: t.conversationId,
    draft: t.draft ? { text: t.draft.text, by: t.draft.by === x.me.id ? "you" : "them", at: t.draft.at } : null,
    // A team shares where each side's deal at this company stands (the stage only, never notes or who they wrote to).
    stages: { you: stageAt(x.me.id), them: t.status === "active" ? stageAt(otherId) : null },
    ...(t.left ? { left: t.left.by === x.me.id ? ("you" as const) : ("them" as const) } : {}),
    ...(!invited && t.status === "invited" && t.at > seen ? { fresh: true } : {}),
  };
}

/* ---------- circles ---------- */

const circleOfMember = (p: PeersState, id: string) => p.circles.find((c) => c.members.some((m) => m.id === id)) ?? null;

function circleRec(x: Ctx, c: Circle, recs: FractionalRec[]): CircleRec {
  const month = monthOf(x.nowMs);
  const prev = monthOf(Date.parse(`${month}-01T00:00:00Z`) - DAY);
  const ids = c.members.map((m) => m.id);
  const members = ids
    .filter((id) => x.idx.byId.has(id))
    .map((id) => {
      const n = x.nameOf(id);
      return { id: T.pubId(id), name: n, first: firstOf(n), initials: initialsOf(n), title: x.titleOf(id), fn: x.fnOfMember(id), ...(id === x.me.id ? { you: true } : {}) };
    });
  const muted = new Set(x.p.mutes[x.me.id] ?? []);
  const visible = c.posts.filter((p) => (p.month === month || p.month === prev) && !muted.has(p.by) && !x.blocked(x.me.id, p.by) && !x.blocked(p.by, x.me.id));
  const read = c.readAt[x.me.id] ?? "";
  const posts = visible.map((p) => {
    const n = x.nameOf(p.by);
    return { id: p.id, mine: p.by === x.me.id, who: { name: n, first: firstOf(n), initials: initialsOf(n) }, at: p.at, text: p.removed ? "" : p.text, ...(p.removed ? { removed: true } : {}) };
  });
  // The viewer's own Crystal Ball companies where someone in the circle holds or held a seat, as the directory shows those seats to the viewer.
  const ball = ballOf(x);
  const ways = new Map<string, { who: string[]; now: boolean }>();
  for (const id of ids) {
    if (id === x.me.id) continue;
    const rec = recs.find((r) => r.memberId === T.pubId(id));
    for (const st of rec?.seats ?? []) {
      const co = x.pubCompany.get(st.co);
      if (!co || !ball.has(co)) continue;
      const w = ways.get(co) ?? { who: [], now: false };
      const first = firstOf(x.idx.byId.get(id)?.name ?? "");
      if (!w.who.includes(first)) w.who.push(first);
      w.now ||= st.now;
      ways.set(co, w);
    }
  }
  return {
    id: c.id,
    name: c.name,
    members,
    size: members.length,
    forming: members.length < 6,
    month,
    prompt: promptFor(month),
    posts,
    unread: visible.filter((p) => p.by !== x.me.id && p.at > read).length,
    ways: [...ways.entries()].slice(0, 20).map(([co, w]) => ({ company: T.pubId(co), name: x.companyName(co), kind: x.companyKind(co), who: w.who, now: w.now })),
  };
}

/** The viewer's Crystal Ball companies (internal ids, every day it keeps). Empty when it can't be read. */
function ballOf(x: Ctx): Set<string> {
  try {
    return crystalCompanyIds(x.seed, x.s, x.me, x.nowMs);
  } catch {
    return new Set();
  }
}

/** "Join a circle": the best circle with room for the viewer, else a new one around their kind of client. */
function offerFor(x: Ctx): CircleOffer {
  const mine = { fn: x.fnOfMember(x.me.id), shape: x.shapeOf(x.me.id) };
  let best: { c: Circle; score: number } | null = null;
  for (const c of x.p.circles) {
    const live = c.members.filter((m) => x.idx.byId.has(m.id));
    if (!live.length || live.some((m) => x.blocked(m.id, x.me.id) || x.blocked(x.me.id, m.id))) continue;
    const score = circleFit({ size: live.length, fns: live.map((m) => x.fnOfMember(m.id) ?? "").filter(Boolean), shape: { industries: c.industries, employees: c.employees } }, mine);
    if (score === null || score < 2) continue;
    if (!best || score > best.score) best = { c, score };
  }
  if (best) {
    const live = best.c.members.filter((m) => x.idx.byId.has(m.id));
    const fns = live.map((m) => x.fnOfMember(m.id)).filter(Boolean);
    return {
      id: best.c.id,
      name: best.c.name,
      // A member out of the directory is counted, never named, to someone not in the circle yet.
      members: live.filter((m) => !x.hidden(m.id)).map((m) => ({ first: firstOf(x.idx.byId.get(m.id)!.name), fn: x.fnOfMember(m.id) })),
      size: live.length,
      why: `${live.length} ${live.length === 1 ? "fractional" : "fractionals"} in ${fns.length ? [...new Set(fns)].slice(0, 3).join(", ") : "other functions"}, serving clients like yours.`,
    };
  }
  const shape = mine.shape ?? { industries: [], employees: [] };
  return { id: null, name: circleName(shape), members: [], size: 0, why: "No circle fits yet. Start one, and Merlin suggests it to fractionals in other functions who serve the same clients." };
}

/* ---------- the views ---------- */

function viewOf(seed: Seed, s: State, me: Member, nowMs: number): PeersView {
  const x = ctxOf(seed, s, me, nowMs);
  const recs = fractionalRecords(seed, s, me, nowMs);
  const byMember = new Map(recs.filter((r) => r.memberId).map((r) => [r.memberId!, r] as const));
  const byRid = new Map(recs.map((r) => [r.id, r] as const));
  const myFn = x.fnOfMember(me.id);

  // Fractionals you already know: the viewer's own LinkedIn, Google contacts and conversations, matched as Smart ways in matches them.
  const know: PeerRec[] = [];
  const seenIds = new Set<string>();
  let contacts: ReturnType<typeof contactsOf>["contacts"] = [];
  try {
    contacts = contactsOf(seed, s, me, nowMs).contacts;
  } catch {
    contacts = [];
  }
  const w = contacts.length ? worldOf(seed, s, nowMs) : null;
  const groups = F.personIndex(F.viewGraph(seed, s), s).groups;
  for (const c of contacts) {
    let memberId = c.member && c.member !== me.id ? c.member : null;
    let rec: FractionalRec | undefined;
    if (!memberId && w) {
      const person = personOfContact(w, c);
      const gr = person ? groups[Number(person.slice(1))] : undefined;
      if (gr?.member && gr.member !== me.id) memberId = gr.member;
      else if (gr && !gr.member) rec = byRid.get(gr.rid);
    }
    if (memberId) {
      if (!x.peerOk(memberId) || seenIds.has(memberId)) continue;
      seenIds.add(memberId);
      know.push(peerCard(x, memberId, byMember.get(T.pubId(memberId)), { name: x.nameOf(memberId), from: c.src as KnownFrom[], why: c.why }));
    } else if (rec && !seenIds.has(rec.id)) {
      seenIds.add(rec.id);
      // Not on Merlin yet: named by the viewer's own contact, never by a name Merlin holds that they haven't unlocked.
      know.push(peerCard(x, null, rec, { name: c.name, from: c.src as KnownFrom[], why: c.why }));
    }
  }
  const knowOrder = (r: PeerRec) => (r.onMerlin ? 0 : 1) + (r.known?.from.includes("messages") ? 0 : 0.5);
  know.sort((a, b) => knowOrder(a) - knowOrder(b) || a.name.localeCompare(b.name));

  // Peers who serve your kind of clients: members in complementary functions, the viewer's Crystal Ball and kind of client first.
  const shape = x.shapeOf(me.id);
  const serveScored: { r: PeerRec; score: number }[] = [];
  for (const m of x.idx.all) {
    if (seenIds.has(m.id) || !x.peerOk(m.id) || x.hidden(m.id)) continue;
    const fn = x.fnOfMember(m.id);
    if (!complements(myFn, fn)) continue;
    const rec = byMember.get(T.pubId(m.id));
    const ball = rec?.ball?.n ?? 0;
    const overlap = overlapOf(shape, x.shapeOf(m.id));
    const score = ball * 4 + (rec?.fits ? 3 : 0) + overlap + (rec?.now ? 1 : 0) + (x.related(m.id) ? 1 : 0);
    const card = peerCard(x, m.id, rec);
    card.why = ball
      ? `Serves ${ball} ${ball === 1 ? "company" : "companies"} in your Crystal Ball`
      : rec?.fits || overlap
        ? `Works with clients like yours${rec?.clients?.line ? `: ${rec.clients.line}` : ""}`
        : fn
          ? `A ${fn} fractional`
          : "A fractional on Merlin";
    serveScored.push({ r: card, score });
  }
  serveScored.sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));

  const inbox = x.p.passes.filter((q) => q.to === me.id && !x.blocked(me.id, q.by)).map((q) => leadRec(x, q)).sort((a, b) => b.at.localeCompare(a.at));
  const sent = x.p.passes.filter((q) => q.by === me.id).map((q) => leadRec(x, q)).sort((a, b) => b.at.localeCompare(a.at));
  const teams = x.p.teams
    .filter((t) => (t.by === me.id || t.with === me.id) && t.status !== "declined" && !(t.status === "ended" && nowMs - Date.parse(t.left?.at ?? t.at) > 30 * DAY))
    .map((t) => teamRec(x, t))
    .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || b.at.localeCompare(a.at));
  const circle = circleOfMember(x.p, me.id);
  const n = s.network?.[me.id];
  const knowShown = know.slice(0, SECTION_MAX);
  // Members this view shows only because the two already work together, though they keep out of the
  // directory (or hide their name): the Fractionals page never lists them (an owner default).
  const unlisted = [...new Set([...knowShown.map((r) => r.memberId), ...inbox.map((l) => l.who.id), ...sent.map((l) => l.who.id), ...teams.map((t) => t.with.id)])].filter(
    (pid): pid is string => !!pid && ((m) => !!m && x.hidden(m.id))(x.memberByPub.get(pid)),
  );
  return {
    fn: myFn,
    know: knowShown,
    serve: serveScored.slice(0, SECTION_MAX).map((x) => x.r),
    inbox,
    sent,
    teams,
    circle: circle ? circleRec(x, circle, recs) : null,
    offer: circle ? null : offerFor(x),
    passesLeft: Math.max(0, PASS_DAILY - x.p.passes.filter((q) => q.by === me.id && nowMs - Date.parse(q.at) < DAY).length),
    everyone: recs.filter((r) => !r.you).length,
    sources: { linkedin: !!(s as State & { paths?: Record<string, { linkedin?: unknown }> }).paths?.[me.id]?.linkedin, google: networkOn() && !!n?.google },
    muted: (x.p.mutes[me.id] ?? []).filter((id) => x.idx.byId.has(id)).map((id) => ({ id: T.pubId(id), name: x.nameOf(id) })),
    ...(unlisted.length ? { unlisted } : {}),
  };
}

/** GET ?peers=1. Null when signed out. */
export async function peersView(token: string | null, nowMs = Date.now()): Promise<PeersView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  return me ? viewOf(seed, s, me, nowMs) : null;
}

function homeOf(seed: Seed, s: State, me: Member, nowMs: number): PeersHome {
  const x = ctxOf(seed, s, me, nowMs);
  const seen = x.p.seen[me.id] ?? "";
  // Leads passed to the member they haven't answered, and leads of theirs a peer took since they last looked.
  const leads = x.p.passes
    .filter((q) => (q.to === me.id && q.status === "new" && !x.blocked(me.id, q.by)) || (q.by === me.id && q.status === "taken" && (q.answeredAt ?? "") > seen))
    .map((q) => leadRec(x, q))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  const teams = x.p.teams.filter((t) => t.with === me.id && t.status === "invited").map((t) => teamRec(x, t)).slice(0, 3);
  const c = circleOfMember(x.p, me.id);
  let circle: PeersHome["circle"] = null;
  if (c) {
    const muted = new Set(x.p.mutes[me.id] ?? []);
    const read = c.readAt[me.id] ?? "";
    const fresh = c.posts.filter((p) => p.by !== me.id && p.at > read && !p.removed && !muted.has(p.by));
    const last = fresh[fresh.length - 1];
    if (fresh.length) circle = { id: c.id, name: c.name, unread: fresh.length, latest: last ? { first: firstOf(x.idx.byId.get(last.by)?.name ?? ""), text: oneLine(last.text).slice(0, 160) } : null, prompt: promptFor(monthOf(nowMs)) };
  }
  return { leads, teams, circle };
}

/** GET ?peers=home: Home's From your peers. Null when signed out. */
export async function peersHome(token: string | null, nowMs = Date.now()): Promise<PeersHome | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  return me ? homeOf(seed, s, me, nowMs) : null;
}

/* ---------- who to pass a company to, or team up with ---------- */

function picksOf(seed: Seed, s: State, me: Member, companyPub: string, rolePub: string | null, forTeam: boolean, nowMs: number): PeerPicks | null {
  const x = ctxOf(seed, s, me, nowMs);
  const companyId = x.pubCompany.get(companyPub);
  if (!companyId) return null;
  const roles = openRolesAt(x, companyId);
  const roleId = rolePub ? x.pubSeat.get(rolePub) : undefined;
  const role = roleId && roles.some((e) => e.id === roleId) ? roleOf(x, roleId) : null;
  const myFn = x.fnOfMember(me.id);
  // The function the company needs: the open role's, else its first open role's, else the viewer's own (Crystal Ball read it as needing the viewer's function).
  const firstRole = roles.map((e) => roleOf(x, e.id)).find((r) => r?.fn);
  const needs = role?.fn ?? firstRole?.fn ?? myFn;
  const c = x.g.companies.get(companyId)!;
  const industry = T.live(c, s, "industry");
  const employees = T.live(c, s, "employees");
  const recs = fractionalRecords(seed, s, me, nowMs);
  const byMember = new Map(recs.filter((r) => r.memberId).map((r) => [r.memberId!, r] as const));
  const picks: (PeerPick & { score: number })[] = [];
  for (const m of x.idx.all) {
    if (!x.peerOk(m.id) || x.mutedBy(m.id, me.id)) continue;
    // Open to leads off: never offered for a lead (a team-up is still theirs to answer).
    if (!forTeam && x.leadsOff(m.id)) continue;
    const fn = x.fnOfMember(m.id);
    const icp = x.prof(m.id).icp;
    const fits = (!!industry && !!icp?.industries.includes(industry)) || (!!employees && !!icp?.employees.includes(employees));
    const best = forTeam ? complements(myFn, fn) : !!needs && fn === needs;
    const rec = byMember.get(T.pubId(m.id));
    const score = (best ? 10 : 0) + (fits ? 3 : 0) + (x.related(m.id) ? 2 : 0) + (rec?.now ? 1 : 0);
    if (!best && !fits && !x.related(m.id)) continue;
    const name = x.nameOf(m.id);
    const passed = x.p.passes.some((q) => q.by === me.id && q.to === m.id && q.companyId === companyId);
    const teamed = x.p.teams.some((t) => t.companyId === companyId && (t.status === "active" || t.status === "invited") && ((t.by === me.id && t.with === m.id) || (t.with === me.id && t.by === m.id)));
    picks.push({
      id: T.pubId(m.id),
      name,
      first: firstOf(name),
      initials: initialsOf(name),
      title: x.titleOf(m.id),
      fn,
      why: best ? (forTeam ? `A ${fn} fractional to pitch with` : `A ${fn} fractional`) + (fits ? ", serves clients like this one" : "") : fits ? "Serves clients like this one" : x.workedWith(m.id) ? "You already work together" : "You've messaged",
      best,
      ...(passed ? { passed: true } : {}),
      ...(teamed ? { teamed: true } : {}),
      score,
    });
  }
  picks.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return {
    company: companyPub,
    name: x.companyName(companyId),
    needs,
    role: role && roleId ? { id: T.pubId(roleId), fn: role.fn, title: role.title, rate: role.rate } : null,
    roles: roles.map((e) => {
      const r = roleOf(x, e.id);
      return { id: T.pubId(e.id), fn: r?.fn ?? null, title: r?.title ?? null };
    }),
    picks: picks.slice(0, 12).map(({ score: _score, ...p }) => p), // eslint-disable-line @typescript-eslint/no-unused-vars
    passesLeft: Math.max(0, PASS_DAILY - x.p.passes.filter((q) => q.by === me.id && nowMs - Date.parse(q.at) < DAY).length),
  };
}

/** GET ?peers=picks&c=ID[&role=ID][&for=team]. Null when signed out or the company isn't on Merlin. */
export async function peerPicks(token: string | null, companyPub: string, rolePub: string | null, forTeam = false, nowMs = Date.now()): Promise<PeerPicks | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  return me ? picksOf(seed, s, me, companyPub, rolePub, forTeam, nowMs) : null;
}

/* ---------- the emails ---------- */

const why = "You get these when a peer passes you a lead or asks you to team up. Turn them off in Notifications on Merlin.";
const from = "Merlin is a data exchange for fractional operators, from Revenue Nomad.";

/** "Ana passed you Acme: open Sales role, posted $9k/mo", with her note and a link that signs the peer in. Never an email address. */
export function leadEmail(o: { line: string; first: string; note: string; link: string; settingsUrl?: string }) {
  const line = oneLine(o.line).slice(0, 160);
  const first = oneLine(o.first).slice(0, 40) || "A peer";
  const note = oneLine(o.note).slice(0, 400);
  const link = oneLine(o.link);
  const settings = oneLine(o.settingsUrl);
  const subject = line;
  const lead = `${first} thought of you. It's free to open, a gift from a peer: no credits.`;
  const foot = footerNote();
  const text = [line, "", lead, ...(note ? ["", note] : []), "", "See it and take it into your pipeline with this link. It signs you in once and works for 7 days.", link, "", "--", why, ...(settings ? ["Notifications", settings] : []), from, ...(foot ? [foot] : [])].join("\n");
  const body = [
    mailH(escHtml(line)),
    mailP(escHtml(lead), "margin-bottom:24px;"),
    ...(note ? [`<p style="margin:0 0 24px;padding:12px 16px;border-left:3px solid ${MAIL.volt};background:${MAIL.page};font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.ink}">${escHtml(note)}</p>`] : []),
    mailButton(link, "See the lead", "margin:0 0 16px"),
  ].join("\n");
  const html = mailShell({ title: subject, preheader: lead, body, link, footer: [escHtml(why), settingsLink(settings), escHtml(from), foot ? escHtml(foot) : ""] });
  return { subject, text, html };
}

/** "Ana wants to team up on Acme". `company` as the invitee may see it. */
export function teamEmail(o: { first: string; company: string; pair: string; note: string; link: string; settingsUrl?: string }) {
  const first = oneLine(o.first).slice(0, 40) || "A peer";
  const company = oneLine(o.company).slice(0, 80) || "a company";
  const note = oneLine(o.note).slice(0, 400);
  const link = oneLine(o.link);
  const settings = oneLine(o.settingsUrl);
  const subject = `${first} wants to team up on ${company}`;
  const lead = `${o.pair} You'd share a thread, a note draft and the proposal.`;
  const foot = footerNote();
  const text = [subject, "", lead, ...(note ? ["", note] : []), "", "Say yes or not now with this link. It signs you in once and works for 7 days.", link, "", "--", why, ...(settings ? ["Notifications", settings] : []), from, ...(foot ? [foot] : [])].join("\n");
  const body = [
    mailH(escHtml(subject)),
    mailP(escHtml(lead), "margin-bottom:24px;"),
    ...(note ? [`<p style="margin:0 0 24px;padding:12px 16px;border-left:3px solid ${MAIL.volt};background:${MAIL.page};font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.ink}">${escHtml(note)}</p>`] : []),
    mailButton(link, "Open the team space", "margin:0 0 16px"),
  ].join("\n");
  const html = mailShell({ title: subject, preheader: lead, body, link, footer: [escHtml(why), settingsLink(settings), escHtml(from), foot ? escHtml(foot) : ""] });
  return { subject, text, html };
}

/* ---------- the actions ---------- */

type PeerAction = Extract<Action, { type: `peer.${string}` }>;
type Mail = { to: string; subject: string; text: string; html: string };

/** The pair's conversation about no seat (kind partners), made when there is none. */
function pairThread(s: State, a: string, b: string, nowIso: string): StoredConversation {
  s.conversations ??= [];
  const had = s.conversations.find((c) => c.kind === "partners" && ((c.a === a && c.b === b) || (c.a === b && c.b === a)));
  if (had) return had;
  const c: StoredConversation = { id: newId("cv"), a, b, about: { companyId: "", engagementId: "" }, kind: "partners", messages: [], readAt: {}, status: "open", createdAt: nowIso };
  s.conversations.push(c);
  return c;
}

/** A message from `by` in `c`, read by them now. A conversation they closed opens again; one the other side closed or blocked refuses. */
function writeIn(c: StoredConversation, by: string, text: string, nowIso: string) {
  if (c.blockedBy && c.blockedBy !== by) throw new ActionError(NOT_TAKING);
  if (c.status === "closed") {
    if (c.closedBy !== by) throw new ActionError(NOT_TAKING);
    c.status = "open";
    delete c.closedBy;
  }
  c.messages.push({ id: newId("m"), by, at: nowIso, text });
  c.readAt[c.a === by ? "a" : "b"] = nowIso;
}

export async function performPeer(token: string | null, raw: Action, origin?: string): Promise<ActionResult> {
  const a = raw as PeerAction;
  const base = (publicBase() || origin || "").replace(/\/$/, "");
  const out = await T.mutate((s, seed): { message: string; mail?: Mail; convId?: string; me: string } => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError(SIGNED_OUT);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const p = peersOf(s);
    const x = ctxOf(seed, s, me, nowMs);
    const peer = (pub: unknown) => {
      const m = x.memberByPub.get(String(pub ?? ""));
      if (!m || m.id === me.id) throw new ActionError(m ? "That's you." : "That member isn't on Merlin anymore.");
      return m;
    };
    const company = (pub: unknown) => {
      const id = x.pubCompany.get(String(pub ?? ""));
      if (!id) throw new ActionError("That company isn't on Merlin anymore.");
      return id;
    };
    const emailOk = (id: string) => emailEnabled() && !!x.idx.byId.get(id)?.email && !s.profiles[id]?.peerEmailOff;
    const link = (id: string, to: string) => emailLinker(seed, s, id, base, nowMs)(to);
    switch (a.type) {
      case "peer.pass": {
        const them = peer(a.memberId);
        const coId = company(a.companyId);
        const first = firstOf(them.name);
        if (x.hiddenCo(coId)) throw new ActionError("Open the company first. Then you can pass it to someone great.");
        if (!x.peerOk(them.id)) throw new ActionError(`${first} isn't in Peers right now.`);
        if (x.mutedBy(them.id, me.id) || x.leadsOff(them.id)) throw new ActionError(NOT_TAKING);
        if (p.passes.some((q) => q.by === me.id && q.to === them.id && q.companyId === coId && q.status === "new")) throw new ActionError(`You passed this one to ${first} already.`);
        if (p.passes.filter((q) => q.by === me.id && nowMs - Date.parse(q.at) < DAY).length >= PASS_DAILY) throw new ActionError(`You can pass ${PASS_DAILY} leads a day. Pass more tomorrow.`);
        const roleId = a.roleId ? x.pubSeat.get(String(a.roleId)) : undefined;
        if (a.roleId && (!roleId || !openRolesAt(x, coId).some((e) => e.id === roleId))) throw new ActionError("That role isn't open anymore.");
        const note = cleanText(a.note, NOTE_MAX);
        const fromWhere: PassFrom = PASS_FROM.includes(a.from as PassFrom) ? (a.from as PassFrom) : roleId ? "role" : "record";
        // The gift: the company opens for them alone, free and outside their limits, with its open roles' postings.
        const opened = T.identityHidden(x.g, s, x.idx, x.tracks, them, coId);
        if (opened) T.giftCompany(x.g, s, x.tracks, them.id, coId);
        // Written as the passer sees the role (they chose to share it): the name is theirs to give, and it opens for the peer.
        const role = roleOf(x, roleId);
        const name = x.g.companies.get(coId)!.name;
        const c = pairThread(s, me.id, them.id, now);
        writeIn(c, me.id, passMessage({ from: me.name, company: name, role: role?.fn, rate: role?.rate, note }), now);
        const q: LeadPass = { id: newId("lp"), by: me.id, to: them.id, companyId: coId, ...(roleId ? { roleId } : {}), from: fromWhere, note, at: now, status: "new", ...(opened ? { opened: true } : {}), conversationId: c.id };
        p.passes.push(q);
        const line = leadLine({ from: me.name, company: name, role: role?.fn, rate: role?.rate });
        const mail = emailOk(them.id)
          ? { to: them.email, ...leadEmail({ line, first: firstOf(me.name), note, link: link(them.id, `/?p=peers&lead=${q.id}`), settingsUrl: link(them.id, NOTIFICATIONS_PATH) }) }
          : undefined;
        return { message: `Passed to ${first}. It opens free for them, and you earn ${PASS_CREDIT} credits if they take it.`, mail, convId: c.id, me: me.id };
      }
      case "peer.answer": {
        const q = p.passes.find((y) => y.id === String(a.id ?? "") && y.to === me.id);
        if (!q) throw new ActionError("That lead isn't there anymore.");
        if (q.status !== "new") return { message: q.status === "taken" ? "It's in your pipeline already." : "You passed on this one.", me: me.id };
        const by = x.idx.byId.get(q.by);
        const first = firstOf(by?.name ?? "They");
        q.answeredAt = now;
        if (!a.take) {
          q.status = "declined";
          return { message: `Got it. ${first} sees you passed on it.`, me: me.id };
        }
        q.status = "taken";
        const log = ((s.pipeline ??= {})[me.id] ??= emptyPipeline());
        const had = entryAt(log, q.companyId);
        if (had && (isOpen(had.stage) || had.stage === "quiet")) {
          had.lead ??= { passId: q.id, by: q.by };
          had.log.push({ at: now, text: `${first} passed you this lead` });
          q.entryId = had.id;
        } else {
          // A peer's lead lands at To reach out: nothing went out from the member yet. Their note moves it to Sent (openEntry).
          const { entry } = openLead(log, { id: newId("pl"), companyId: q.companyId, nowMs, lead: { passId: q.id, by: q.by }, ...(q.conversationId ? { conversationId: q.conversationId } : {}) });
          entry.log.push({ at: now, text: `${first} passed you this lead` });
          q.entryId = entry.id;
        }
        // The passer's credits: once per peer and company, within their daily earning cap (the rest is held and paid later).
        let credited = false;
        if (by && !p.passes.some((y) => y !== q && y.paid && y.by === q.by && y.to === q.to && y.companyId === q.companyId)) {
          T.releaseHeld(s, by.id, now);
          T.grant(s, by.id, PASS_CREDIT, "peer", `${q.id}.peer`, now);
          q.paid = true;
          credited = true;
        }
        return { message: `In your pipeline.${credited ? ` ${first} earns ${PASS_CREDIT} credits for thinking of you.` : ""}`, me: me.id };
      }
      case "peer.mute": {
        const them = peer(a.memberId);
        const list = new Set(p.mutes[me.id] ?? []);
        if (a.on === false) list.delete(them.id);
        else list.add(them.id);
        p.mutes[me.id] = [...list];
        return { message: a.on === false ? `Unmuted ${firstOf(them.name)}.` : `Muted ${firstOf(them.name)}. Their leads, team-ups and circle posts won't reach you.`, me: me.id };
      }
      case "peer.team": {
        const them = peer(a.memberId);
        const coId = company(a.companyId);
        const first = firstOf(them.name);
        if (x.hiddenCo(coId)) throw new ActionError("Open the company first. Then you can team up on it.");
        if (!x.peerOk(them.id)) throw new ActionError(`${first} isn't in Peers right now.`);
        if (x.mutedBy(them.id, me.id)) throw new ActionError("They're not taking team-ups right now.");
        const pair = (t: TeamUp) => (t.by === me.id && t.with === them.id) || (t.by === them.id && t.with === me.id);
        if (p.teams.some((t) => t.companyId === coId && pair(t) && (t.status === "invited" || t.status === "active"))) throw new ActionError(`You and ${first} are on this one already.`);
        if (p.teams.filter((t) => t.by === me.id && nowMs - Date.parse(t.at) < DAY).length >= TEAM_DAILY) throw new ActionError(`You can ask ${TEAM_DAILY} peers a day to team up. Ask more tomorrow.`);
        if (p.teams.filter((t) => t.status === "active" && (t.by === me.id || t.with === me.id)).length >= TEAMS_OPEN) throw new ActionError(`You're on ${TEAMS_OPEN} teams, which is the limit. Leave one first.`);
        // The invitee sees the company as they may: named only when they can see it, else by its free facts.
        const theirName = T.identityHidden(x.g, s, x.idx, x.tracks, them, coId) ? (x.companyKind(coId) ? `a ${x.companyKind(coId)}` : "a company") : x.g.companies.get(coId)!.name;
        const note = cleanText(a.note, NOTE_MAX);
        const myFn = x.fnOfMember(me.id);
        const theirFn = x.fnOfMember(them.id);
        const c: StoredConversation = { id: newId("cv"), a: me.id, b: them.id, about: { companyId: coId, engagementId: "" }, kind: "team", messages: [], readAt: {}, status: "open", createdAt: now };
        const t: TeamUp = { id: newId("tm"), companyId: coId, by: me.id, with: them.id, status: "invited", at: now, conversationId: c.id, draft: null };
        c.teamId = t.id;
        (s.conversations ??= []).push(c);
        writeIn(c, me.id, teamMessage({ from: me.name, company: theirName, myFn, theirFn, note }), now);
        p.teams.push(t);
        const pairWords = myFn && theirFn ? `A ${myFn} and ${theirFn} pitch, together.` : "Two fractionals, one pitch.";
        const mail = emailOk(them.id)
          ? { to: them.email, ...teamEmail({ first: firstOf(me.name), company: theirName, pair: pairWords, note, link: link(them.id, `/?p=peers&team=${t.id}`), settingsUrl: link(them.id, NOTIFICATIONS_PATH) }) }
          : undefined;
        return { message: `Asked ${first} to team up. You'll both see it in Peers and Messages.`, mail, convId: c.id, me: me.id };
      }
      case "peer.teamAnswer": {
        const t = p.teams.find((y) => y.id === String(a.id ?? "") && y.with === me.id);
        if (!t) throw new ActionError("That team-up isn't there anymore.");
        if (t.status !== "invited") return { message: t.status === "active" ? "You're on this team already." : "That team-up is closed.", me: me.id };
        const by = x.idx.byId.get(t.by);
        const first = firstOf(by?.name ?? "They");
        t.answeredAt = now;
        const c = (s.conversations ?? []).find((y) => y.id === t.conversationId);
        if (!a.join) {
          t.status = "declined";
          if (c && c.status === "open") Object.assign(c, { status: "closed", closedBy: me.id });
          return { message: `Not now. ${first} sees that you'd rather not team up on this one.`, me: me.id };
        }
        t.status = "active";
        t.draft = { text: teamDraft({ company: x.companyName(t.companyId) ?? "your company", a: { first: firstOf(by?.name ?? ""), fn: x.fnOfMember(t.by) }, b: { first: firstOf(me.name), fn: x.fnOfMember(me.id) } }), by: t.by, at: now };
        // Both pipelines hold the company, marked "Teamed with …".
        for (const [mid, otherId] of [[t.by, t.with], [t.with, t.by]] as const) {
          const log = ((s.pipeline ??= {})[mid] ??= emptyPipeline());
          const other = firstOf(x.idx.byId.get(otherId)?.name ?? "a peer");
          const had = entryAt(log, t.companyId);
          if (had && (isOpen(had.stage) || had.stage === "quiet")) had.log.push({ at: now, text: `Teamed up with ${other}` });
          else openEntry(log, { id: newId("pl"), companyId: t.companyId, channel: "intro", to: {}, source: "peer", via: "message", nowMs, conversationId: t.conversationId }).entry.log.push({ at: now, text: `Teamed up with ${other}` });
        }
        return { message: `You and ${first} are a team on this one. Your shared thread and note draft are in Peers.`, me: me.id };
      }
      case "peer.teamLeave": {
        const t = p.teams.find((y) => y.id === String(a.id ?? "") && (y.by === me.id || y.with === me.id));
        if (!t) throw new ActionError("That team isn't there anymore.");
        if (t.status === "ended" || t.status === "declined") return { message: "This team is closed.", me: me.id };
        t.status = t.status === "invited" ? "declined" : "ended";
        t.left = { by: me.id, at: now };
        const c = (s.conversations ?? []).find((y) => y.id === t.conversationId);
        if (c && c.status === "open") Object.assign(c, { status: "closed", closedBy: me.id });
        const other = firstOf(x.idx.byId.get(t.by === me.id ? t.with : t.by)?.name ?? "They");
        return { message: `You left the team. ${other} keeps their own deal there.`, me: me.id };
      }
      case "peer.teamDraft": {
        const t = p.teams.find((y) => y.id === String(a.id ?? "") && (y.by === me.id || y.with === me.id));
        if (!t || t.status !== "active") throw new ActionError("That team isn't active anymore.");
        const text = cleanText(a.text, DRAFT_MAX);
        if (!text) throw new ActionError("Write the note first.");
        t.draft = { text, by: me.id, at: now };
        return { message: "Saved. Your teammate sees it too.", me: me.id };
      }
      case "peer.circleJoin": {
        if (circleOfMember(p, me.id)) throw new ActionError("You're in a circle already. Leave it first to join another.");
        const offer = offerFor(x);
        const want = a.circleId === null || a.circleId === undefined ? null : String(a.circleId);
        if (want) {
          const c = p.circles.find((y) => y.id === want);
          if (!c || offer.id !== want) throw new ActionError("That circle is full or no longer fits. Here's the one that does now.");
          c.members.push({ id: me.id, at: now });
          c.readAt[me.id] = now;
          return { message: `You're in ${c.name}. Say hello in this month's thread.`, me: me.id };
        }
        const shape = x.shapeOf(me.id) ?? { industries: [], employees: [] };
        const c: Circle = { id: newId("ci"), name: circleName(shape), at: now, members: [{ id: me.id, at: now }], industries: shape.industries.slice(0, 4), employees: shape.employees.slice(0, 3), posts: [], readAt: { [me.id]: now } };
        p.circles.push(c);
        return { message: `You started ${c.name}. Merlin suggests it to fractionals in other functions who serve the same clients, up to ${CIRCLE_MAX}.`, me: me.id };
      }
      case "peer.circleLeave": {
        const c = circleOfMember(p, me.id);
        if (!c) return { message: "You're not in a circle.", me: me.id };
        c.members = c.members.filter((m) => m.id !== me.id);
        delete c.readAt[me.id];
        return { message: `You left ${c.name}.`, me: me.id };
      }
      case "peer.circlePost": {
        const c = circleOfMember(p, me.id);
        if (!c) throw new ActionError("Join a circle first.");
        const text = cleanText(a.text, POST_MAX);
        if (!text) throw new ActionError("Write something first.");
        if (c.posts.filter((y) => y.by === me.id && nowMs - Date.parse(y.at) < DAY).length >= CIRCLE_POSTS_DAILY) throw new ActionError(`That's ${CIRCLE_POSTS_DAILY} posts today, which is the limit.`);
        c.posts.push({ id: newId("cp"), by: me.id, at: now, month: monthOf(nowMs), text });
        if (c.posts.length > 2000) c.posts.splice(0, c.posts.length - 2000);
        c.readAt[me.id] = now;
        return { message: "Posted to your circle.", me: me.id };
      }
      case "peer.circleRead": {
        const c = circleOfMember(p, me.id);
        if (c) c.readAt[me.id] = now;
        return { message: "", me: me.id };
      }
      case "peer.seen": {
        p.seen[me.id] = now;
        return { message: "", me: me.id };
      }
      default:
        throw new ActionError("That isn't something Merlin can do yet. Reload the page and try again.");
    }
  });
  if (out.mail) {
    const m = out.mail;
    void sendEmail(m.to, m.subject, m.text, m.html).catch((e) => console.error("peer email failed", e));
  }
  // Slack or a webhook for the peer, as a message alert (lib/notify).
  if (out.convId) {
    const id = out.convId;
    void import("./notify/events").then((n) => n.afterMessage(id)).catch((e) => console.error("peer alert failed", e));
  }
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s)!;
  return { message: out.message, peers: viewOf(seed, s, me, Date.now()) };
}

/** What the connector says about a lead (lib/mcp/peers.ts): never a locked company's name, never anyone's contacts. */
export const lockedCompanyWords = (rec: { name: string | null; kind: string | null }) => rec.name ?? (rec.kind ? `a locked ${rec.kind}` : HIDDEN_COMPANY);
export { agoWords, KNOWN_WORDS };
