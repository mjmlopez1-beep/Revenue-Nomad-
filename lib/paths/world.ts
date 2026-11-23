/**
 * What Merlin knows that a way in can go through (World, lib/paths/find.ts), built from the
 * table once per state: every named seat with its dates and the person it belongs to (one person
 * across companies through Merlin's own links, lib/table.ts personIndex: a member's seats, then the
 * private person key of a seat holder's seats, which never leaves this file's caller), the people
 * on file at each company (leaders, decision makers, who hired for a seat), and the operators
 * (lib/paths/operators.ts).
 *
 * Shared facts only: nothing here comes from any member's own contacts, so no member's network
 * ever changes what another member's paths are built from.
 */
import { fractionalInternals as F, tableInternals as T, type Seed, type State } from "../table";
import { makeDirectory, type Directory } from "../google/compute";
import { monthIdx, type WCompany, type WLeader, type WPerson, type WSeat, type World } from "./find";
import { nameCo, personKey, slugOf } from "./match";
import { operatorsOf } from "./operators";
import { californian } from "../california";

const memo = new WeakMap<State, { month: number; w: World }>();

const nowMonth = (nowMs: number) => {
  const d = new Date(nowMs);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
};

export function worldOf(seed: Seed, s: State, nowMs = Date.now()): World {
  const month = nowMonth(nowMs);
  const hit = memo.get(s);
  if (hit && hit.month === month) return hit.w;
  const g = F.viewGraph(seed, s);
  const idx = F.personIndex(g, s);
  const ops = operatorsOf(seed, s);
  const shownName = new Map(ops.filter((o) => o.memberId && o.directory).map((o) => [o.memberId!, o.name]));

  const companies = new Map<string, WCompany>();
  for (const c of g.companies.values()) companies.set(c.id, { id: c.id, name: c.name, kind: T.live(c, s, "industry") });

  const seats = new Map<string, WSeat>();
  const seatsAt = new Map<string, WSeat[]>();
  const persons = new Map<string, WPerson>();
  const personByNameCo = new Map<string, string[]>();
  const personOfMember = new Map<string, string>();
  idx.groups.forEach((gr, gi) => {
    const key = `p${gi}`;
    const person: WPerson = { key, member: gr.member, seats: [], shown: gr.member ? (shownName.get(gr.member) ?? null) : null };
    for (const id of gr.seats) {
      const e = g.engagements.get(id);
      if (!e || !companies.has(e.companyId)) continue;
      const status = T.live(e, s, "status");
      const end = T.live(e, s, "end");
      const from = monthIdx(T.live(e, s, "start"));
      const active = status === "Active" || (end ?? "").toLowerCase() === "ongoing";
      const to = active ? month : (monthIdx(end) ?? from);
      const seat: WSeat = { id, companyId: e.companyId, fn: T.fnOf(e, s), from, to, active, person: key };
      seats.set(id, seat);
      push(seatsAt, e.companyId, seat);
      person.seats.push(id);
      const nk = personKey(T.live(e, s, "operator"));
      if (nk) {
        const k = nameCo(nk, e.companyId);
        const l = personByNameCo.get(k);
        if (!l) personByNameCo.set(k, [key]);
        else if (!l.includes(key)) l.push(key);
      }
    }
    if (!person.seats.length) return;
    persons.set(key, person);
    if (gr.member) personOfMember.set(gr.member, key);
  });

  const leadersAt = new Map<string, WLeader[]>();
  const leadersBySlug = new Map<string, WLeader[]>();
  const leaderByNameCo = new Map<string, WLeader[]>();
  // A profile link that belongs to someone in California by their own location (lib/california.ts): never matched by it.
  const caSlugs = new Set<string>();
  for (const p of g.contacts.values()) {
    if (!companies.has(p.companyId)) continue;
    const nameKey = personKey(T.live(p, s, "name"));
    const slug = slugOf(T.live(p, s, "linkedin"));
    if (!nameKey && !slug) continue;
    const l: WLeader = { id: p.id, companyId: p.companyId, nameKey, slug, rel: T.live(p, s, "relationship"), seat: p.engagementId ?? null };
    push(leadersAt, p.companyId, l);
    if (slug && placeCalifornian(p.seedFields)) caSlugs.add(slug);
    else if (slug) push(leadersBySlug, slug, l);
    if (nameKey) push(leaderByNameCo, nameCo(nameKey, p.companyId), l);
  }

  const memberByEmail = new Map<string, string>();
  const twice = new Set<string>();
  for (const o of ops)
    for (const e of o.emails) {
      if (!o.memberId) continue;
      if (memberByEmail.has(e) && memberByEmail.get(e) !== o.memberId) twice.add(e);
      memberByEmail.set(e, o.memberId);
    }
  for (const e of twice) memberByEmail.delete(e);

  // A member's own LinkedIn profile, when the operator list has one: their profile link is theirs alone.
  const memberBySlug = new Map<string, string>();
  const twiceSlug = new Set<string>();
  for (const o of ops) {
    if (!o.memberId || !o.linkedin) continue;
    if (californian({ location: (s.profiles[o.memberId] as { city?: string } | undefined)?.city })) {
      caSlugs.add(o.linkedin);
      continue;
    }
    if (memberBySlug.has(o.linkedin) && memberBySlug.get(o.linkedin) !== o.memberId) twiceSlug.add(o.linkedin);
    memberBySlug.set(o.linkedin, o.memberId);
  }
  for (const x of twiceSlug) memberBySlug.delete(x);
  for (const x of caSlugs) {
    leadersBySlug.delete(x);
    memberBySlug.delete(x);
  }

  const w: World = { nowIdx: month, companies, seats, seatsAt, persons, personByNameCo, personOfMember, memberByEmail, memberBySlug, leadersAt, leadersBySlug, leaderByNameCo, caSlugs };
  memo.set(s, { month, w });
  return w;
}

/**
 * A person record says they are in California by their own location: a location their record
 * carries ("San Diego, CA"), or a yes an import kept. Records rarely carry one; unknown is no.
 */
export const placeCalifornian = (f: Record<string, string> | undefined) => californian({ location: f?.location, california: f?.california === "true" || f?.california === "yes" });

const dirs = new WeakMap<State, Directory>();
/** Companies on Merlin by website and exact name, for matching a contact's company. */
export function directoryOf(seed: Seed, s: State): Directory {
  let d = dirs.get(s);
  if (!d) {
    const g = F.viewGraph(seed, s);
    d = makeDirectory([...g.companies.values()].map((c) => ({ id: c.id, website: T.live(c, s, "website"), name: c.name })));
    dirs.set(s, d);
  }
  return d;
}
