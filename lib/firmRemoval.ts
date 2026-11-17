/**
 * Fractional firms, agencies, talent marketplaces, staffing firms and placeholders like
 * "Contractor" (lib/firms.ts) are not clients, so they are not on Merlin at all.
 *
 *  - cleanSeed: drops them, with their seats and people, from the private seed (and tidies the
 *    seed's labels and places). Run by scripts/clean-intel-seed.mts, add-seat-scan.mjs and the
 *    seed builder. Their ids go in `seed.removedFirms`, so a running table can clean up after them.
 *  - purgeFirms: on load, removes from the state every firm a member or the scan added, and
 *    whatever the state still holds about a firm the seed dropped: facts, unlocks, follows, seats
 *    and people. Every paid unlock there is given back. The count is logged.
 *  - A firm where a member holds a seat (they picked themselves as its seat holder, or claimed
 *    it) is never removed this way: it stays and is listed for an admin to review (firmReview).
 *
 * The weekly scan never adds a firm and a member's Add of one is refused (lib/table.ts).
 */
import { firmReason, isNotFirm } from "./firms";
import { normalizeHq } from "./geo";
import { STANDARD_FIELDS, toStandard } from "./industryMap";
import type { Seed, State } from "./table";

export interface RemovedFirms {
  companies: { id: string; name: string }[];
  /** Seats, with the company each was at. */
  engagements: { id: string; companyId: string }[];
  contacts: string[];
}
/** A firm kept because a member holds a seat there, for an admin to look at. */
export interface FirmReview {
  companyId: string;
  name: string;
  reason: string;
  at: string;
}

const SEAT_SCAN = "Seat scan";
/** Seat sources a member stands behind: a seat they published, or their story. Their company is never dropped from the seed. */
const MEMBER_SOURCES = new Set(["Published engagement", "Member success story"]);

/* ---------- the seed ---------- */

export interface CleanStats {
  /** Values moved to their standard value, by field. */
  remapped: Record<string, number>;
  /** Values nothing maps (left empty), by field and value. */
  unmapped: Record<string, Record<string, number>>;
  places: number;
  removed: { companies: number; seats: number; people: number; names: { name: string; reason: string }[]; reasons: Record<string, number> };
  kept: { name: string; reason: string }[];
}

/**
 * Tidy a seed in place: older labels take the current one, each HQ gets its country and region
 * fields, and firms go (a firm where a member published a seat or a story stays, listed in
 * `seed.firmReview`). Safe to run again.
 */
export function cleanSeed(seed: Seed): CleanStats {
  const stats: CleanStats = { remapped: {}, unmapped: {}, places: 0, removed: { companies: 0, seats: 0, people: 0, names: [], reasons: {} }, kept: [] };
  // Industry, employees and revenue: the standard value, or nothing (lib/industryMap.ts).
  const standard = (field: string, v: string, context = ""): string | null => {
    // Our records hold the earlier 28 tags: the company's name and About pick the closest value today.
    const std = toStandard(field, v, context, true);
    if (std === v) return v;
    if (std) stats.remapped[field] = (stats.remapped[field] ?? 0) + 1;
    else ((stats.unmapped[field] ??= {})[v] = (stats.unmapped[field][v] ?? 0) + 1);
    return std;
  };
  for (const r of [...seed.companies, ...seed.engagements]) {
    for (const k of STANDARD_FIELDS) {
      const v = r.fields[k];
      if (!v) continue;
      const std = standard(k, v, `${r.fields.name ?? ""} ${r.fields.about ?? ""}`);
      if (std) r.fields[k] = std;
      else delete r.fields[k];
    }
  }
  for (const x of seed.rateIndex ?? []) if (x.revenue) x.revenue = standard("revenue", x.revenue);
  for (const c of seed.companies) {
    delete c.fields.firm;
    const geo = normalizeHq(c.fields.hq);
    if (geo.country) {
      c.fields.country = geo.country;
      if (geo.region) c.fields.region = geo.region;
      else delete c.fields.region;
      stats.places++;
    } else {
      delete c.fields.country;
      delete c.fields.region;
    }
  }

  const engsAt = new Map<string, Seed["engagements"]>();
  for (const e of seed.engagements) engsAt.set(e.companyId, [...(engsAt.get(e.companyId) ?? []), e]);
  const drop = new Set<string>();
  const review: FirmReview[] = [];
  for (const c of seed.companies) {
    const engs = engsAt.get(c.id) ?? [];
    const why = firmReason({
      name: c.fields.name ?? "",
      about: c.fields.about,
      employees: c.fields.employees,
      holders: engs.map((e) => e.fields.operator).filter(Boolean),
      listedBy: engs.filter((e) => e.fields.source === SEAT_SCAN).length,
    });
    if (!why) continue;
    if (engs.some((e) => MEMBER_SOURCES.has(e.fields.source) && e.fields.operator)) {
      stats.kept.push({ name: c.fields.name ?? "", reason: `${why}, kept: a member published a seat or a story there` });
      review.push({ companyId: c.id, name: c.fields.name ?? "", reason: why, at: seed.builtAt });
      continue;
    }
    drop.add(c.id);
    stats.removed.names.push({ name: c.fields.name ?? "", reason: why });
    stats.removed.reasons[why] = (stats.removed.reasons[why] ?? 0) + 1;
  }
  const removed: RemovedFirms = seed.removedFirms ?? { companies: [], engagements: [], contacts: [] };
  const dropEngs = new Set(seed.engagements.filter((e) => drop.has(e.companyId)).map((e) => e.id));
  const dropPeople = (seed.contacts ?? []).filter((p) => (p.companyId && drop.has(p.companyId)) || (p.engagementId && dropEngs.has(p.engagementId)));
  for (const c of seed.companies) if (drop.has(c.id)) removed.companies.push({ id: c.id, name: c.fields.name ?? "" });
  removed.engagements.push(...seed.engagements.filter((e) => dropEngs.has(e.id)).map((e) => ({ id: e.id, companyId: e.companyId })));
  removed.contacts.push(...dropPeople.map((p) => p.id));
  stats.removed.companies = drop.size;
  stats.removed.seats = dropEngs.size;
  stats.removed.people = dropPeople.length;
  seed.companies = seed.companies.filter((c) => !drop.has(c.id));
  seed.engagements = seed.engagements.filter((e) => !dropEngs.has(e.id));
  if (seed.contacts) {
    const gone = new Set(dropPeople.map((p) => p.id));
    seed.contacts = seed.contacts.filter((p) => !gone.has(p.id));
  }
  if (removed.companies.length) seed.removedFirms = removed;
  if (review.length) seed.firmReview = review;
  else delete seed.firmReview;
  return stats;
}

/* ---------- a running table ---------- */

/** Seed companies the rules call firms that no member's seat in the seed stands behind (an admin added a name after the seed was built). */
const seedFirmCache = new WeakMap<Seed, Map<string, { reason: string; engagements: string[] }>>();
export function seedFirmIds(seed: Seed): Map<string, { reason: string; engagements: string[] }> {
  let out = seedFirmCache.get(seed);
  if (out) return out;
  out = new Map();
  const engsAt = new Map<string, Seed["engagements"]>();
  for (const e of seed.engagements) engsAt.set(e.companyId, [...(engsAt.get(e.companyId) ?? []), e]);
  for (const c of seed.companies) {
    const engs = engsAt.get(c.id) ?? [];
    if (engs.some((e) => MEMBER_SOURCES.has(e.fields.source) && e.fields.operator)) continue;
    const why = firmReason({
      name: c.fields.name ?? "",
      about: c.fields.about,
      employees: c.fields.employees,
      holders: engs.map((e) => e.fields.operator).filter(Boolean),
      listedBy: engs.filter((e) => e.fields.source === SEAT_SCAN).length,
    });
    if (why) out.set(c.id, { reason: why, engagements: engs.map((e) => e.id) });
  }
  seedFirmCache.set(seed, out);
  return out;
}

/** A member holds one of these seats on the state: they picked themselves as its seat holder, or claimed it. */
export function memberHoldsSeat(s: State, engagementIds: Iterable<string>): boolean {
  for (const id of engagementIds) {
    const op = s.values[`${id}.operator`];
    if (op && op.status !== "removed" && op.memberId && op.memberId === op.by) return true;
    if ((s.seatClaims ?? []).some((c) => c.engagementId === id)) return true;
  }
  return false;
}

/** Why a company named this (with what the state knows about it) is a firm, or null. For the weekly scan and for Add. */
export const companyFirm = (name: string, about?: string | null) => (isNotFirm(name) ? null : firmReason({ name, about }));

export interface PurgeStats {
  companies: number;
  seats: number;
  people: number;
  facts: number;
  refunds: number;
  reviewed: number;
  names: string[];
}

/**
 * Take every firm off the state (see the top of this file). Changes `s` in place and returns
 * what went. Safe to run on every load: once a firm is gone there is nothing left to remove.
 */
export function purgeFirms(seed: Seed, s: State, now: string): PurgeStats {
  const stats: PurgeStats = { companies: 0, seats: 0, people: 0, facts: 0, refunds: 0, reviewed: 0, names: [] };
  const seedEngsAt = new Map<string, string[]>();
  for (const e of seed.engagements) seedEngsAt.set(e.companyId, [...(seedEngsAt.get(e.companyId) ?? []), e.id]);
  const stateEngsAt = new Map<string, string[]>();
  for (const e of s.engagements) stateEngsAt.set(e.companyId, [...(stateEngsAt.get(e.companyId) ?? []), e.id]);
  const live = (id: string, f: string) => {
    const v = s.values[`${id}.${f}`];
    return v && v.status === "live" ? v.value : null;
  };

  /** Candidates: company id -> its name, why, and the seed seats it had. */
  const cands = new Map<string, { name: string; reason: string; seedEngs: string[]; inSeed: boolean }>();
  const removedEngsAt = new Map<string, string[]>();
  for (const e of seed.removedFirms?.engagements ?? []) removedEngsAt.set(e.companyId, [...(removedEngsAt.get(e.companyId) ?? []), e.id]);
  for (const c of seed.removedFirms?.companies ?? []) cands.set(c.id, { name: c.name, reason: "dropped from the seed", seedEngs: removedEngsAt.get(c.id) ?? [], inSeed: false });
  for (const [id, x] of seedFirmIds(seed)) cands.set(id, { name: seed.companies.find((c) => c.id === id)?.fields.name ?? "", reason: x.reason, seedEngs: x.engagements, inSeed: true });
  for (const c of s.companies) {
    if (cands.has(c.id) || c.by === "review") continue;
    const engs = stateEngsAt.get(c.id) ?? [];
    const why = isNotFirm(c.name)
      ? null
      : firmReason({
          name: c.name,
          about: live(c.id, "about"),
          employees: live(c.id, "employees"),
          holders: engs.map((e) => live(e, "operator")).filter((x): x is string => !!x),
        });
    if (why) cands.set(c.id, { name: c.name, reason: why, seedEngs: [], inSeed: false });
  }
  if (!cands.size) return stats;

  const review = (s.firmReview ??= []);
  const drop = new Set<string>();
  for (const [id, c] of cands) {
    const engs = [...(stateEngsAt.get(id) ?? []), ...c.seedEngs];
    if (memberHoldsSeat(s, engs)) {
      // A member's own seat is never taken away here. An admin decides.
      if (!review.some((r) => r.companyId === id)) {
        review.push({ companyId: id, name: c.name, reason: c.reason, at: now });
        stats.reviewed++;
      }
      // A firm the seed dropped comes back as an added company, so the member's seat still has a home.
      if (!c.inSeed && !s.companies.some((x) => x.id === id) && !seed.companies.some((x) => x.id === id))
        s.companies.push({ id, name: c.name, by: "review", at: now });
      continue;
    }
    drop.add(id);
  }
  if (!drop.size) return stats;

  const engIds = new Set<string>();
  for (const id of drop) for (const e of [...(stateEngsAt.get(id) ?? []), ...(cands.get(id)?.seedEngs ?? [])]) engIds.add(e);
  const personIds = new Set<string>(seed.removedFirms?.contacts ?? []);
  for (const p of s.contacts) if ((p.companyId && drop.has(p.companyId)) || (p.engagementId && engIds.has(p.engagementId))) personIds.add(p.id);
  for (const p of seed.contacts ?? []) if ((p.companyId && drop.has(p.companyId)) || (p.engagementId && engIds.has(p.engagementId))) personIds.add(p.id);
  const ids = new Set<string>([...drop, ...engIds, ...personIds]);
  const owner = (k: string) => k.slice(0, k.lastIndexOf("."));

  // Every paid unlock there comes back (the facts, and "Unlock company").
  for (const l of [...s.ledger]) {
    if (l.reason !== "unlock" || l.delta >= 0 || !ids.has(owner(l.ref))) continue;
    if (s.ledger.some((x) => x.reason === "refund" && x.memberId === l.memberId && x.ref === l.ref && x.at >= l.at)) continue;
    s.ledger.push({ memberId: l.memberId, delta: -l.delta, reason: "refund", ref: l.ref, at: now, why: "removed" });
    stats.refunds++;
  }
  const stateCos = new Set(s.companies.map((c) => c.id));
  const before = { companies: s.companies.length, seats: s.engagements.length, people: s.contacts.length };
  /** Companies the state held anything about (so something was really removed). */
  const touched = new Set<string>();
  const companyOf = (id: string) => (drop.has(id) ? id : null) ?? s.engagements.find((e) => e.id === id)?.companyId ?? null;
  for (const k of Object.keys(s.values)) if (ids.has(owner(k))) (touched.add(companyOf(owner(k)) ?? ""), delete s.values[k], stats.facts++);
  for (const bag of [s.unlocks, s.verifications] as Record<string, unknown>[]) for (const k of Object.keys(bag)) if (ids.has(owner(k))) (touched.add(companyOf(owner(k)) ?? ""), delete bag[k]);
  for (const [m, list] of Object.entries(s.follows))
    if (list.some((id) => drop.has(id))) {
      for (const id of list) if (drop.has(id)) touched.add(id);
      s.follows[m] = list.filter((id) => !drop.has(id));
    }
  for (const e of s.engagements) if (drop.has(e.companyId)) touched.add(e.companyId);
  s.companies = s.companies.filter((c) => !drop.has(c.id));
  s.engagements = s.engagements.filter((e) => !engIds.has(e.id) && !drop.has(e.companyId));
  s.contacts = s.contacts.filter((p) => !personIds.has(p.id));
  for (const [k, r] of Object.entries(s.scan.roles)) if (engIds.has(r.engagementId) || drop.has(r.companyId)) (touched.add(r.companyId), delete s.scan.roles[k]);
  if (s.roleClaims) s.roleClaims = s.roleClaims.filter((c) => !engIds.has(c.engagementId));
  if (s.seatClaims) s.seatClaims = s.seatClaims.filter((c) => !engIds.has(c.engagementId));
  for (const [m, list] of Object.entries(s.notMine)) if (list.some((id) => engIds.has(id))) s.notMine[m] = list.filter((id) => !engIds.has(id));
  for (const b of s.benchRates) if (b.engagementId && engIds.has(b.engagementId)) b.engagementId = null; // still counts in the medians
  stats.companies = before.companies - s.companies.length;
  stats.seats = before.seats - s.engagements.length;
  stats.people = before.people - s.contacts.length;
  for (const id of drop) if (stateCos.has(id) || touched.has(id)) stats.names.push(cands.get(id)!.name);
  return stats;
}
