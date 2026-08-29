import type { Database, EditionAsset } from "./types";
import { isoWeek, monthKey, withinDays } from "./time";

/**
 * Dual gating (spec §3.2): recency gates for perishable demand data (drives
 * the habit), credit gates for durable benchmark data (drives depth).
 */

/** Most recent contribution of any kind — powers the 7-day Demand Feed gate. */
export function lastContributionAt(db: Database, operatorId: string): string | null {
  let latest: string | null = null;
  const bump = (iso: string | null | undefined) => {
    if (iso && (!latest || iso > latest)) latest = iso;
  };
  for (const p of db.pulseResponses) if (p.operatorId === operatorId) bump(p.at);
  for (const c of db.clients)
    if (c.operatorId === operatorId) {
      bump(c.confirmedAt);
      bump(c.lastRefreshedAt);
      bump(c.debrief?.at);
    }
  for (const d of db.deals) if (d.operatorId === operatorId) bump(d.at);
  for (const s of db.signals) if (s.operatorId === operatorId) bump(s.at);
  for (const cp of db.capacityPulses) if (cp.operatorId === operatorId) bump(cp.at);
  for (const r of db.toolReviews) if (r.operatorId === operatorId) bump(r.at);
  for (const a of db.questionAnswers) if (a.operatorId === operatorId) bump(a.at);
  return latest;
}

/** Demand Feed detail: contributed anything in the last N days (default 7). */
export function feedActive(db: Database, operatorId: string, now: Date = new Date()): boolean {
  return withinDays(lastContributionAt(db, operatorId), db.config.gates.feedRecencyDays, now);
}

/** Demand Index current week: you can't read the index without being in it. */
export function pulsedThisWeek(db: Database, operatorId: string, now: Date = new Date()): boolean {
  const wk = isoWeek(now);
  return db.pulseResponses.some((p) => p.operatorId === operatorId && p.week === wk);
}

/** Any credit-earning contribution inside the edition month → flagship free. */
export function contributedThisEdition(db: Database, operatorId: string, edition: string): boolean {
  return db.credits.some(
    (e) =>
      e.operatorId === operatorId &&
      e.amount > 0 &&
      e.action !== "insider_monthly" &&
      e.action !== "admin_adjustment" &&
      monthKey(new Date(e.at)) === edition
  );
}

/**
 * Does the operator have this edition asset unlocked?
 * Unlocks are per-edition and expire when the edition closes (spec §2.3).
 * Insider includes the full edition (spec §5).
 */
export function hasUnlock(db: Database, operatorId: string, edition: string, asset: EditionAsset): boolean {
  const op = db.operators.find((o) => o.id === operatorId);
  if (op?.insider) return true;
  const owns = (a: EditionAsset) =>
    db.unlocks.some((u) => u.operatorId === operatorId && u.edition === edition && u.asset === a);
  if (owns("full_edition")) return true;
  if (asset === "retainers_by_function") {
    // Flagship: free with any contribution this cycle.
    if (db.config.gates.flagshipFreeWithContribution && contributedThisEdition(db, operatorId, edition))
      return true;
  }
  return owns(asset);
}
