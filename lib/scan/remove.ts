/**
 * Take back roles an older, looser screen let in. The weekly scan used to take some full-time
 * jobs for fractional work (a "trusted advisor" line, "3 days a week in our office", an hourly
 * pay band). When a board still lists such a posting and the current screen leaves it out, the
 * role the scan added is removed from the table: it was never an open fractional role, so it does
 * not become a closed one either. Every paid unlock of it is given back, and so is an unlock of
 * its hidden company when it was the only open role there. A company the scan added that holds
 * nothing else goes too.
 *
 * The same pass takes off open roles the scan added that fail the seniority bar (lib/seniority.ts):
 * outside GTM and below Director, such as a "School Staffing Coordinator" an earlier screen let
 * in. Their unlocks are paid back the same way (the ledger says "a role we took off the list").
 *
 * Only seats the scan itself added are touched. Roles from our records (the seed), open roles a
 * member added that the scan took over, and a role a member has taken as their own seat stay.
 * Called by applyScan in lib/table.ts, inside its write.
 */
import type { State } from "../table";
import type { ScanScreenedOut } from "../scanTypes";

interface Ctx {
  /** Keys of roles the scan followed and saw listed this run as fractional work. They stay. */
  seen: Set<string>;
  /** The followed role for a posting link, as applyScan keys it. */
  keyOfUrl: (url: string) => string | undefined;
  /** Company of every engagement on the table (seed and added), and of every person. */
  engagementCompany: Map<string, { companyId: string }>;
  contactCompany: Map<string, { companyId: string }>;
  /** Companies in the seed. They are never removed. */
  seedCompanies: Set<string>;
  /** The engagement is an open role now (applyScan's own test). Never called for a removed one. */
  isOpen: (engagementId: string) => boolean;
  /** The role fails the seniority bar: outside GTM and below Director (keepsNonGtm on its live title and function). */
  offBar?: (engagementId: string) => boolean;
  now: string;
}

const ownedBy = (k: string, ids: Set<string>) => ids.has(k.slice(0, k.lastIndexOf(".")));

/** A member took the seat as their own (the same claim that closes a role). They keep it. */
const takenByMember = (s: State, engagementId: string) => {
  const op = s.values[`${engagementId}.operator`];
  return !!(op && op.status !== "removed" && op.memberId && op.memberId === op.by && !(s.notMine[op.memberId] ?? []).includes(engagementId));
};

/**
 * Remove scan-added roles that `screenedOut` lists, and open scan-added roles that fail the
 * seniority bar (`ctx.offBar`). Returns the engagement ids removed, how many of them for the bar,
 * and the unlocks paid back.
 */
export function removeScreenedOut(s: State, screenedOut: unknown, ctx: Ctx): { removed: Set<string>; belowBar: number; refunded: number } {
  const roles = s.scan.roles;
  const removed = new Set<string>();
  const list = (Array.isArray(screenedOut) ? screenedOut : []).slice(0, 10_000) as Partial<ScanScreenedOut>[];
  const addedByScan = new Set(s.engagements.filter((e) => e.by === "scan").map((e) => e.id));

  for (const x of list) {
    const key = typeof x?.key === "string" ? x.key.slice(0, 200) : "";
    const k = key && roles[key] ? key : typeof x?.url === "string" && x.url ? ctx.keyOfUrl(x.url) : undefined;
    if (!k || !roles[k] || ctx.seen.has(k)) continue; // listed somewhere else as fractional work this run
    const r = roles[k];
    if (r.source === "seed" || !addedByScan.has(r.engagementId)) continue;
    if (takenByMember(s, r.engagementId)) continue; // a member who took the seat as their own keeps it
    removed.add(r.engagementId);
  }
  // Open roles the scan added that fail the seniority bar, listed this run or not.
  const offBar = new Set<string>();
  if (ctx.offBar) {
    for (const r of Object.values(roles)) {
      const id = r.engagementId;
      if (removed.has(id) || r.closedAt || r.source === "seed" || !addedByScan.has(id) || takenByMember(s, id)) continue;
      if (!ctx.isOpen(id) || !ctx.offBar(id)) continue;
      removed.add(id);
      offBar.add(id);
    }
  }
  if (!removed.size) return { removed, belowBar: 0, refunded: 0 };

  // The followed tracks go first, so no open-role test below counts them.
  for (const [k, r] of Object.entries(roles)) if (removed.has(r.engagementId)) delete roles[k];

  // Refs whose paid unlocks come back: every fact of the role, and its company's identity when no open role is left there.
  const companies = new Set([...removed].map((id) => ctx.engagementCompany.get(id)?.companyId).filter((c): c is string => !!c));
  const engsOf = (co: string) => [...ctx.engagementCompany.entries()].filter(([id, e]) => e.companyId === co && !removed.has(id)).map(([id]) => id);
  const refundIds = new Set(removed);
  const identity = new Set<string>();
  for (const co of companies) if (!engsOf(co).some(ctx.isOpen)) identity.add(`${co}.identity`);
  // The ledger's reason: "offbar" for a role the seniority bar took off, and for its company when every role removed there was one.
  const offBarCo = new Set([...companies].filter((co) => [...removed].every((id) => ctx.engagementCompany.get(id)?.companyId !== co || offBar.has(id))));
  const whyOf = (ref: string): "offbar" | "removed" =>
    ownedBy(ref, offBar) || (identity.has(ref) && offBarCo.has(ref.slice(0, ref.lastIndexOf(".")))) ? "offbar" : "removed";

  // A purchase settled when two listings of the role were merged (a "duplicate" refund, mergeDuplicateRoles in lib/table.ts) is not paid back again.
  const settled = new Map<string, number>();
  for (const x of s.ledger) if (x.reason === "refund" && x.why === "duplicate") settled.set(`${x.memberId}|${x.ref}`, (settled.get(`${x.memberId}|${x.ref}`) ?? 0) + x.delta);
  let refunded = 0;
  for (const l of [...s.ledger]) {
    if (l.reason !== "unlock" || l.delta >= 0 || !(ownedBy(l.ref, refundIds) || identity.has(l.ref))) continue;
    if (s.ledger.some((x) => x.reason === "refund" && x.why !== "duplicate" && x.memberId === l.memberId && x.ref === l.ref && x.at >= l.at)) continue; // already paid back
    const left = settled.get(`${l.memberId}|${l.ref}`) ?? 0;
    if (left >= -l.delta) {
      settled.set(`${l.memberId}|${l.ref}`, left + l.delta);
      continue;
    }
    s.ledger.push({ memberId: l.memberId, delta: -l.delta, reason: "refund", ref: l.ref, at: ctx.now, why: whyOf(l.ref) });
    refunded++;
  }
  for (const k of identity) delete s.unlocks[k];

  // The role's record and every fact on it.
  s.engagements = s.engagements.filter((e) => !removed.has(e.id));
  for (const bag of [s.values, s.unlocks, s.verifications] as Record<string, unknown>[]) for (const k of Object.keys(bag)) if (ownedBy(k, removed)) delete bag[k];
  for (const p of s.contacts) {
    if (!p.engagementId || !removed.has(p.engagementId)) continue;
    p.companyId ??= ctx.engagementCompany.get(p.engagementId)?.companyId; // a person stays, on the company
    p.engagementId = null;
  }
  for (const b of s.benchRates) if (b.engagementId && removed.has(b.engagementId)) b.engagementId = null; // still counts in the medians
  if (s.roleClaims) s.roleClaims = s.roleClaims.filter((c) => !removed.has(c.engagementId));
  for (const [m, ids] of Object.entries(s.notMine)) if (ids.some((id) => removed.has(id))) s.notMine[m] = ids.filter((id) => !removed.has(id));

  // A company the scan added that now holds nothing: no other seat, no person, no fact a member added.
  const gone = new Set<string>();
  for (const co of companies) {
    if (ctx.seedCompanies.has(co) || !s.companies.some((c) => c.id === co && c.by === "scan")) continue;
    if (engsOf(co).length || s.contacts.some((p) => p.companyId === co) || [...ctx.contactCompany.values()].some((p) => p.companyId === co)) continue;
    if (Object.entries(s.values).some(([k, v]) => k.startsWith(`${co}.`) && v.by !== "scan" && v.by !== "seed")) continue;
    gone.add(co);
  }
  if (gone.size) {
    s.companies = s.companies.filter((c) => !gone.has(c.id));
    for (const bag of [s.values, s.unlocks, s.verifications] as Record<string, unknown>[]) for (const k of Object.keys(bag)) if (ownedBy(k, gone)) delete bag[k];
    for (const [m, ids] of Object.entries(s.follows)) if (ids.some((id) => gone.has(id))) s.follows[m] = ids.filter((id) => !gone.has(id));
  }
  return { removed, belowBar: offBar.size, refunded };
}
