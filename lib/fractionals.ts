/**
 * Fractionals (the app's page "fractionals", app/post/Fractionals.tsx): one record per fractional,
 * as the signed-in viewer may see it. GET /api/table?fractionals=1 (FractionalsView) and
 * ?fractionals=home (FractionalsHome, Home's one quiet line).
 *
 * Who is in it (lib/table.ts personIndex, lib/fractionalsCore.ts groupSeats): a member who holds or
 * held fractional seats, and a seat holder named on a seat who isn't a member yet (names come from
 * public profiles on US seats only, as the seat files give them). A member's seats are one record,
 * then seats that share a one-way person key, else each named seat is its own. Unnamed seats make
 * no record.
 *
 * What the viewer sees of each:
 *  - a member who said "Show me in the Fractionals directory": their full name, title, seats and the
 *    clients they state, free (and their own line and city, Profile.headline and city). One who said
 *    no, or hides their name on their seats, is left out entirely (no row, no count). One who hasn't
 *    chosen shows by first name and last initial (as Referral partners did), unless the viewer sees one of their seats.
 *  - someone not on Merlin yet: their full name, free (PEERS_FREE: fellow fractionals never cost a
 *    credit), with the role of each seat whose company the viewer can see. Names taken off with
 *    Remove my name, outside the US or unverified past RN_UNVERIFIED_NAMES_UNTIL are never on file.
 *  - always free: function and level (read from their titles), how many seats now and past, and
 *    the clients they serve (a member's stated ones, else read from their seats' companies' free
 *    facts, "From their seats"). Their seats go out as public ids: the page draws each from its own
 *    table, so a locked company there shows only its free facts.
 * Never a person key, a source id, an email, or a member's Google network.
 */
import { cardCases } from "./evidenceWire";
import { claimToken } from "./claimToken";
import { fractionalInternals as F, inviteCode, loadSeed, normName, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "./table";
import { clientsFromIcp, clientsFromSeats, clientsLine, fitsIcp, levelOf, levelRank, shortName, type ClientCo, type Clients, type Level } from "./fractionalsCore";
import { PEERS_FREE, functionOf } from "./tableFields";
import { crystalCompanyIds } from "./radar";
import type { FractionalRec, FractionalsHome, FractionalsView } from "./tableTypes";

/** What is the same for every viewer, built once per state: each record's seats in order, function and level, clients from seats. */
interface Base {
  gi: number;
  rid: string;
  member: Member | null;
  /** The member has signed in: on Merlin. */
  on: boolean;
  seats: string[];
  current: Set<string>;
  fn: string | null;
  level: Level | null;
  fns: string[];
  /** The newest current seat's role, else the newest seat's (the stored value: shown only when the viewer sees it). */
  leadSeat: string;
  cos: ClientCo[];
  fromSeats: Clients;
  /** The name on file (a member's own name, else the newest seat's). */
  name: string;
  joinedAt: string | null;
}

const bases = new WeakMap<object, Base[]>();

const isCurrent = (s: State, e: Parameters<typeof T.live>[0]) => {
  const status = T.live(e, s, "status");
  const end = T.live(e, s, "end");
  if (status === "Ended") return false;
  if (status === "Active") return true;
  return !end || end === "Ongoing";
};

function baseOf(seed: Seed, s: State): Base[] {
  const g = F.viewGraph(seed, s);
  const p = F.personIndex(g, s);
  const hit = bases.get(p);
  if (hit) return hit;
  const idx = T.memberIndex(seed, s);
  const joined = new Map(s.members.map((m) => [m.id, m.at]));
  const out: Base[] = [];
  p.groups.forEach((gr, gi) => {
    const engs = gr.seats.map((id) => g.engagements.get(id)!).filter(Boolean);
    if (!engs.length) return;
    const current = new Set(engs.filter((e) => isCurrent(s, e)).map((e) => e.id));
    const start = (id: string) => T.live(g.engagements.get(id), s, "start") ?? "";
    const ordered = [...engs].sort((a, b) => Number(current.has(b.id)) - Number(current.has(a.id)) || start(b.id).localeCompare(start(a.id))).map((e) => e.id);
    // Function and level: the most senior of their current seats, else of all.
    const lead = ordered
      .map((id) => {
        const e = g.engagements.get(id)!;
        const role = T.live(e, s, "role");
        return { id, level: levelOf(role), fn: T.fnOf(e, s) ?? functionOf(role), now: current.has(id) };
      })
      .sort((a, b) => Number(b.now) - Number(a.now) || levelRank(a.level) - levelRank(b.level));
    const member = gr.member ? idx.byId.get(gr.member) ?? null : null;
    const fns = [...new Set(lead.map((x) => x.fn).filter((x): x is string => !!x && x !== "Other"))];
    const prof = member ? s.profiles[member.id] : undefined;
    const fn = lead.find((x) => x.fn && x.fn !== "Other")?.fn ?? (member ? prof?.function ?? functionOf(prof?.title || member.title) : null) ?? null;
    const level = lead[0]?.level ?? (member ? levelOf(prof?.title || member.title) : null);
    const cos: ClientCo[] = engs.map((e) => {
      const c = g.companies.get(e.companyId);
      return { industry: T.live(c, s, "industry"), employees: T.live(c, s, "employees"), revenue: T.live(c, s, "revenue"), country: T.geoOf(c, s).country };
    });
    out.push({
      gi,
      rid: gr.rid,
      member,
      on: !!member && T.signedIn(s, idx, member.id),
      seats: ordered,
      current,
      fn,
      level,
      fns,
      leadSeat: ordered[0],
      cos,
      fromSeats: clientsFromSeats(cos),
      name: member?.name ?? T.live(g.engagements.get(ordered[0]), s, "operator") ?? "",
      joinedAt: member ? joined.get(member.id) ?? null : null,
    });
  });
  // Kept for the committed state only: a draft changes in place.
  if (s === F.stateNow()) bases.set(p, out);
  return out;
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

/** Out of the directory: they said no, or turned Referral partners off, or closed their account (State.closures). */
/** A member who hides their name on their seats is out of it too: the directory is names and seats. */
const hiddenMember = (s: State, id: string) =>
  !!s.closures?.[id] || !!s.profiles[id]?.nameHidden || s.profiles[id]?.fractionals === false || (s.profiles[id]?.fractionals === undefined && !!s.profiles[id]?.partnersOff);

/** The viewer's Crystal Ball companies (internal ids, every day it keeps). Empty when it can't be read. */
function ballOf(seed: Seed, s: State, me: Member, nowMs: number): Set<string> {
  try {
    return crystalCompanyIds(seed, s, me, nowMs);
  } catch {
    return new Set();
  }
}

/** Every record as `me` may see it. */
function recordsFor(seed: Seed, s: State, me: Member, nowMs = Date.now()): FractionalRec[] {
  const g = F.viewGraph(seed, s);
  const idx = T.memberIndex(seed, s);
  const base = baseOf(seed, s);
  const icp = s.profiles[me.id]?.icp ?? null;
  const known = F.knownCompanies(g, s, idx, me);
  const ball = ballOf(seed, s, me, nowMs);
  const code = inviteCode(me.id);
  const myInvites = new Map((s.seatInvites ?? []).filter((x) => x.by === me.id).map((x) => [x.engagementId, x.at] as const));
  const blocks = (a: string, b: string) => (s.blocks?.[a] ?? []).includes(b);
  const lastWith = new Map<string, { id: string; at: string }>();
  for (const c of s.conversations ?? []) {
    const other = c.a === me.id ? c.b : c.b === me.id ? c.a : null;
    if (!other) continue;
    const at = c.messages[c.messages.length - 1]?.at ?? c.createdAt;
    if (!lastWith.has(other) || lastWith.get(other)!.at < at) lastWith.set(other, { id: c.id, at });
  }
  // A closed account is nobody on Merlin (lib/table.ts memberIndex leaves it out): its seats never show it by name here either.
  const closedNames = new Set([...seed.members, ...s.members].filter((m) => s.closures?.[m.id]).map((m) => normName(m.name)).filter(Boolean));
  // Companies in common: the viewer's own seats' companies, their pipeline, their Crystal Ball.
  const mine = base.find((b) => b.member?.id === me.id);
  const mySeatCos = new Set((mine?.seats ?? []).map((id) => g.engagements.get(id)?.companyId).filter((x): x is string => !!x));
  const myPipe = new Set((s.pipeline?.[me.id]?.entries ?? []).map((e) => e.companyId));
  // One fractional, one profile: a research record that is a member on Merlin (lib/table.ts foundOf) is
  // their card, never a second one. A member with a card of their own keeps it and the research record
  // is left out; a member with none is shown by the research record's seats, as their own card, named
  // the way they chose. Either way they are asked "Are these yours?" (Me.foundSeats).
  const found = F.foundOf(seed, s, g);
  const ownCard = new Set(base.filter((b) => b.member).map((b) => b.member!.id));
  const out: FractionalRec[] = [];
  for (const b0 of base) {
    const fm = !b0.member ? found.get(b0.gi) : undefined;
    if (fm && ownCard.has(fm)) continue;
    const fmm = fm ? idx.byId.get(fm) : undefined;
    if (fm && !fmm) continue;
    const b = fmm ? { ...b0, member: fmm, on: T.signedIn(s, idx, fmm.id), joinedAt: s.members.find((m) => m.id === fmm.id)?.at ?? null } : b0;
    if (fmm) ownCard.add(fmm.id);
    const you = b.member?.id === me.id;
    if (!you && closedNames.size && closedNames.has(normName(b.name ?? ""))) continue;
    // Out of the directory (said no, Referral partners off before choosing, Hide my name on my seats) or a block either way:
    // left out entirely, no row, no count. Who held their seats still shows on a company, locked at 1 credit (lib/tableFields.ts seatNameWho).
    if (b.member && !you && b.on && (hiddenMember(s, b.member.id) || blocks(b.member.id, me.id) || blocks(me.id, b.member.id))) continue;
    const engs = b.seats.map((id) => g.engagements.get(id)!);
    const bought = !you && b.seats.some((id) => F.boughtSeat(s, me.id, g, id));
    // A name the viewer can see on one of their seats (bought, free, or their own) opens the record.
    const seesName = you || engs.some((e) => T.cellOf(s, me, e, "engagement", "operator", idx).s === "value");
    const prof = b.member ? s.profiles[b.member.id] : undefined;
    const optedIn = !!b.member && b.on && prof?.fractionals === true;
    // Fellow fractionals are free (PEERS_FREE): someone not on Merlin yet shows by full name to every member. A member on Merlin who hasn't chosen still shows short.
    const full = you || optedIn || seesName || (PEERS_FREE && !(b.on && !!b.member));
    // A member on Merlin who hasn't chosen: first name and last initial.
    const short = !full && b.on && !!b.member && prof?.fractionals === undefined;
    // A member on Merlin is named the way they chose (lib/memberName.ts: full only when they show in the directory,
    // else first name and last initial), whoever looks and whatever seat of theirs the viewer sees. Their own card, in full.
    const asMember = !!b.member && b.on;
    const name = !(full || short) ? null : asMember ? T.memberNameFor(s, b.member!, me.id) : you ? b.name : full ? b.name : shortName(b.name);
    const stated = b.member && (optedIn || you || short) ? clientsFromIcp(prof?.icp) : null;
    const clients = stated ?? (b.cos.some((c) => c.industry || c.employees || c.revenue || c.country) ? b.fromSeats : null);
    // The title: a member's own (they said it), else their newest seat's role once the viewer sees it.
    const ownTitle = b.member && (full || short) ? (prof?.title || (b.member.title === "Member" ? "" : b.member.title) || "").trim() : "";
    // The newest seat whose role the viewer sees (a seat at a locked company keeps its role locked until the company opens).
    const roleCell = full ? b.seats.map((id) => T.cellOf(s, me, g.engagements.get(id), "engagement", "role", idx)).find((c) => c.s === "value") ?? null : null;
    const title = ownTitle || (roleCell?.s === "value" ? roleCell.v : "");
    const rec: FractionalRec = {
      id: b.rid,
      ...(name ? { name, first: name.split(/\s+/)[0], initials: initialsOf(name) } : {}),
      onMerlin: b.on,
      ...(b.on && b.joinedAt ? { since: b.joinedAt } : {}),
      ...(you ? { you: true } : {}),
      ...(you && hiddenMember(s, me.id) ? { hidden: true } : {}),
      ...(!name ? { locked: true } : {}),
      ...(bought ? { unlocked: true } : {}),
      ...(title ? { title } : {}),
      fn: b.fn,
      level: b.level,
      fns: b.fns,
      seats: engs.map((e) => ({ id: T.pubId(e.id), co: T.pubId(e.companyId), now: b.current.has(e.id) })),
      now: b.current.size,
      past: b.seats.length - b.current.size,
      clients: clients ? { ...clients, line: clientsLine(clients) } : null,
      fits: fitsIcp(icp, stated, b.cos),
    };
    // "Serves 2 companies in your Crystal Ball": counted from the seats the record already lists; named only where the viewer sees the company's name.
    if (!you && ball.size) {
      const cos = new Map<string, boolean>();
      for (const e of engs) if (ball.has(e.companyId)) cos.set(e.companyId, (cos.get(e.companyId) ?? false) || b.current.has(e.id));
      if (cos.size)
        rec.ball = {
          n: cos.size,
          now: [...cos.values()].some(Boolean),
          names: [...cos.keys()]
            .filter((id) => known.has(id))
            .map((id) => g.companies.get(id)?.name ?? "")
            .filter(Boolean),
        };
    }
    if (b.member && b.on && !you) {
      rec.memberId = T.pubId(b.member.id);
      const conv = lastWith.get(b.member.id);
      if (conv) rec.conversationId = conv.id;
      rec.leads = prof?.leadsOff ? "off" : "open";
    }
    // Their card: one line about them and where they are based, while they are in the directory (and on the viewer's own).
    if (b.member && (you || optedIn)) {
      if (prof?.headline) rec.headline = prof.headline;
      if (prof?.city) rec.city = prof.city;
    }
    // Companies in common, from the seats this record lists: both held a seat there, else the viewer's pipeline, else their Crystal Ball.
    if (!you) {
      const cos = [...new Set(engs.map((e) => e.companyId))];
      for (const [why, set] of [["seat", mySeatCos], ["pipeline", myPipe], ["ball", ball]] as const) {
        const hit = cos.filter((id) => set.has(id));
        if (!hit.length) continue;
        const names = hit.filter((id) => known.has(id)).map((id) => g.companies.get(id)?.name ?? "").filter(Boolean);
        rec.common = { names: names.slice(0, 4), locked: hit.length - names.length, why };
        break;
      }
    }
    // Not on Merlin yet, and the viewer sees who it is: Invite to connect, by a seat whose company they can see (the link names it).
    if (!b.on && full && !you)
      for (const e of engs) {
        if (!known.has(e.companyId)) continue;
        const sees = T.cellOf(s, me, e, "engagement", "operator", idx).s === "value";
        if (!F.invitable(s, idx, me, e, sees)) continue;
        const t = claimToken(e.id);
        if (!t) break;
        const at = myInvites.get(e.id) ?? [...myInvites.entries()].find(([id]) => b.seats.includes(id))?.[1];
        rec.invite = { path: `/claim/${t}?ref=${encodeURIComponent(code)}`, seat: T.pubId(e.id), ...(at ? { at } : {}) };
        break;
      }
    out.push(rec);
  }
  return out;
}

/** GET /api/table?fractionals=1 for a signed-in member (null signed out). */
export async function fractionalsView(token: string | null): Promise<FractionalsView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const prof = s.profiles[me.id] ?? {};
  const fn = prof.function ?? functionOf(prof.title || me.title);
  const records = recordsFor(seed, s, me);
  withCases(seed, s, me, records);
  return { records, fn: fn && fn !== "Other" ? fn : null, shown: prof.fractionals ?? (prof.partnersOff ? false : null) };
}

/**
 * Evidence Bank cases a member chose to show on their card (lib/evidenceWire.ts cardCases, lib/evidence cardFor's cardIn: ready,
 * "Show on my card" on, the client hidden unless named, while they have Close). On a member's
 * record when they are in the directory, and on the viewer's own record.
 */
function withCases(seed: Seed, s: State, me: Member, records: FractionalRec[]): void {
  const byPub = new Map([...seed.members, ...s.members].map((m) => [T.pubId(m.id), m.id] as const));
  for (const r of records) {
    const owner = r.you ? me.id : r.memberId ? byPub.get(r.memberId) : undefined;
    if (!owner || (!r.you && s.profiles[owner]?.fractionals !== true)) continue;
    const cases = cardCases(s, owner);
    if (cases.length) r.cases = cases;
  }
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Home's quiet line: members in the directory who joined in the last 7 days and serve companies
 * like the viewer's (their Ideal Fractional Profile). Nothing without a profile.
 */
export async function fractionalsHome(token: string | null, nowMs = Date.now()): Promise<FractionalsHome | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const icp = s.profiles[me.id]?.icp;
  if (!icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length)) return { n: 0, initials: [] };
  const fresh = recordsFor(seed, s, me).filter((r) => r.onMerlin && !r.you && r.fits && r.since && nowMs - Date.parse(r.since) < WEEK);
  return { n: fresh.length, initials: fresh.filter((r) => r.initials).slice(0, 3).map((r) => r.initials!) };
}

/** The directory's records as `me` may see them, for Peers (lib/peers.ts), which builds its sections on the same locks. */
export const fractionalRecords = (seed: Seed, s: State, me: Member, nowMs = Date.now()) => recordsFor(seed, s, me, nowMs);
