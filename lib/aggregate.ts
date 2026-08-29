import type {
  Database,
  ClientEngagement,
  DemandIndexSnapshot,
  Func,
  DealSource,
  PulseBand,
} from "./types";
import {
  FUNC_LABELS,
  STAGE_LABELS,
  INDUSTRY_LABELS,
  SOURCE_LABELS,
  PRICING_LABELS,
  PULSE_MIDPOINT,
  BAND_LABELS,
} from "./config";
import { isoWeek, lastWeeks, monthKey } from "./time";

/**
 * Aggregation engine. Anonymization rules (spec §1) are enforced HERE, once,
 * so no surface can leak: cells with fewer than `minCellOperators` distinct
 * operators are suppressed, all central tendencies are medians, and verified
 * rows weight 2x (weighted median).
 */

/* ---------- statistics ---------- */

interface WPoint {
  value: number;
  weight: number;
  operatorId: string;
}

export function weightedQuantile(points: WPoint[], q: number): number | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, p) => s + p.weight, 0);
  let cum = 0;
  for (const p of sorted) {
    cum += p.weight;
    if (cum >= total * q) return p.value;
  }
  return sorted[sorted.length - 1].value;
}

export interface Cell {
  key: string;
  label: string;
  /** Distinct operators in the cell — the suppression unit. */
  n: number;
  median: number;
  p25: number;
  p75: number;
}

function toCell(key: string, label: string, points: WPoint[], minCell: number): Cell | null {
  const ops = new Set(points.map((p) => p.operatorId));
  if (ops.size < minCell) return null;
  return {
    key,
    label,
    n: ops.size,
    median: weightedQuantile(points, 0.5)!,
    p25: weightedQuantile(points, 0.25)!,
    p75: weightedQuantile(points, 0.75)!,
  };
}

/* ---------- engagement rows ---------- */

/** Rows eligible for aggregation: entered actuals, not held in moderation. */
export function eligibleEngagements(db: Database): ClientEngagement[] {
  return db.clients.filter((c) => c.actuals && c.moderation !== "held");
}

function weightOf(db: Database, c: ClientEngagement): number {
  return c.verified ? db.config.verification.verifiedWeight : 1;
}

function funcOf(db: Database, c: ClientEngagement): Func | null {
  return db.operators.find((o) => o.id === c.operatorId)?.func ?? null;
}

/* ---------- monthly edition panels ---------- */

export function retainerPanel(db: Database, dim: "func" | "stage" | "industry"): Cell[] {
  const groups = new Map<string, WPoint[]>();
  for (const c of eligibleEngagements(db)) {
    const a = c.actuals!;
    const key = dim === "func" ? funcOf(db, c) : dim === "stage" ? a.stage : a.industry;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ value: a.actualMonthly, weight: weightOf(db, c), operatorId: c.operatorId });
  }
  const labels = dim === "func" ? FUNC_LABELS : dim === "stage" ? STAGE_LABELS : INDUSTRY_LABELS;
  const cells: Cell[] = [];
  for (const [key, pts] of groups) {
    const cell = toCell(key, labels[key] ?? key, pts, db.config.verification.minCellOperators);
    if (cell) cells.push(cell);
  }
  return cells.sort((a, b) => b.median - a.median);
}

/**
 * Realization rate — the marquee (spec §0). Actual billed vs profile list
 * rate. Only computable because RN holds both sides. Percentage, by function.
 */
export function realizationPanel(db: Database, dim: "func" | "stage" | "industry" = "func"): Cell[] {
  const groups = new Map<string, WPoint[]>();
  for (const c of eligibleEngagements(db)) {
    const a = c.actuals!;
    const op = db.operators.find((o) => o.id === c.operatorId);
    if (!op || op.listMonthlyRate <= 0) continue;
    const rate = (a.actualMonthly / op.listMonthlyRate) * 100;
    if (!isFinite(rate) || rate <= 0 || rate > 300) continue;
    const key = dim === "func" ? op.func : dim === "stage" ? a.stage : a.industry;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ value: rate, weight: weightOf(db, c), operatorId: c.operatorId });
  }
  const labels = dim === "func" ? FUNC_LABELS : dim === "stage" ? STAGE_LABELS : INDUSTRY_LABELS;
  const cells: Cell[] = [];
  for (const [key, pts] of groups) {
    const cell = toCell(key, labels[key] ?? key, pts, db.config.verification.minCellOperators);
    if (cell) cells.push(cell);
  }
  return cells.sort((a, b) => b.median - a.median);
}

export interface WinRateRow {
  source: DealSource;
  label: string;
  n: number;
  winRate: number;
  medianCycleWeeks: number;
}

export function winRatePanel(db: Database): WinRateRow[] {
  const bySource = new Map<DealSource, { ops: Set<string>; won: number; total: number; cycles: WPoint[] }>();
  for (const d of db.deals) {
    if (d.moderation === "held") continue;
    if (!bySource.has(d.source)) bySource.set(d.source, { ops: new Set(), won: 0, total: 0, cycles: [] });
    const g = bySource.get(d.source)!;
    g.ops.add(d.operatorId);
    g.total++;
    if (d.outcome === "won") g.won++;
    g.cycles.push({ value: d.cycleWeeks, weight: d.verified ? db.config.verification.verifiedWeight : 1, operatorId: d.operatorId });
  }
  const rows: WinRateRow[] = [];
  for (const [source, g] of bySource) {
    if (g.ops.size < db.config.verification.minCellOperators) continue;
    rows.push({
      source,
      label: SOURCE_LABELS[source] ?? source,
      n: g.ops.size,
      winRate: Math.round((g.won / g.total) * 100),
      medianCycleWeeks: weightedQuantile(g.cycles, 0.5) ?? 0,
    });
  }
  return rows.sort((a, b) => b.winRate - a.winRate);
}

export interface ShareRow {
  key: string;
  label: string;
  share: number; // 0..100
  n: number;
}

export function pricingModelPanel(db: Database): { models: ShareRow[]; discounting: ShareRow[] } {
  const rows = eligibleEngagements(db);
  const share = (pick: (c: ClientEngagement) => string, labels: Record<string, string>): ShareRow[] => {
    const groups = new Map<string, Set<string>>();
    for (const c of rows) {
      const k = pick(c);
      if (!groups.has(k)) groups.set(k, new Set());
      groups.get(k)!.add(c.operatorId);
    }
    const totalOps = new Set(rows.map((c) => c.operatorId)).size;
    const out: ShareRow[] = [];
    for (const [key, ops] of groups) {
      if (ops.size < db.config.verification.minCellOperators) continue;
      out.push({ key, label: labels[key] ?? key, share: Math.round((ops.size / Math.max(1, totalOps)) * 100), n: ops.size });
    }
    return out.sort((a, b) => b.share - a.share);
  };
  return {
    models: share((c) => c.actuals!.pricingModel, PRICING_LABELS),
    discounting: share((c) => c.actuals!.vsList, {
      at_list: "Billing at list",
      below_list: "Discounted below list",
      above_list: "Above list",
    }),
  };
}

export interface UtilizationPanel {
  medianUtilization: number | null; // % of stated capacity actually billed
  n: number;
  renewalOutcomes: ShareRow[];
  churnReasons: string[];
  medianEngagementMonths: number | null;
}

export function utilizationPanel(db: Database): UtilizationPanel {
  const minCell = db.config.verification.minCellOperators;
  // Utilization: billed hours vs stated capacity, per operator.
  const utils: WPoint[] = [];
  for (const op of db.operators) {
    if (!op.statedCapacityHours || op.statedCapacityHours <= 0) continue;
    const hours = db.clients
      .filter((c) => c.operatorId === op.id && c.status === "active" && c.actuals)
      .reduce((s, c) => s + c.actuals!.hoursPerMonth, 0);
    if (hours <= 0) continue;
    utils.push({ value: Math.min(150, (hours / op.statedCapacityHours) * 100), weight: 1, operatorId: op.id });
  }
  // Renewal / churn from debriefs.
  const debriefed = db.clients.filter((c) => c.debrief);
  const outcomes = new Map<string, Set<string>>();
  for (const c of debriefed) {
    const k = c.debrief!.outcome;
    if (!outcomes.has(k)) outcomes.set(k, new Set());
    outcomes.get(k)!.add(c.operatorId);
  }
  const totalOps = new Set(debriefed.map((c) => c.operatorId)).size;
  const renewalOutcomes: ShareRow[] = [];
  for (const [key, ops] of outcomes) {
    if (ops.size < minCell) continue;
    renewalOutcomes.push({
      key,
      label: key[0].toUpperCase() + key.slice(1),
      share: Math.round((ops.size / Math.max(1, totalOps)) * 100),
      n: ops.size,
    });
  }
  // Churn reasons: anonymous free text, only when enough distinct operators churned.
  const churned = debriefed.filter((c) => c.debrief!.outcome === "churned" && c.debrief!.reason);
  const churnOps = new Set(churned.map((c) => c.operatorId));
  const churnReasons = churnOps.size >= minCell ? churned.map((c) => c.debrief!.reason).slice(0, 12) : [];
  // Engagement length (ended engagements).
  const lengths: WPoint[] = db.clients
    .filter((c) => c.endedAt)
    .map((c) => ({
      value: Math.max(0.5, (new Date(c.endedAt!).getTime() - new Date(c.startedAt).getTime()) / (30.44 * 86400000)),
      weight: 1,
      operatorId: c.operatorId,
    }));
  return {
    medianUtilization: utils.length >= minCell ? Math.round(weightedQuantile(utils, 0.5)!) : null,
    n: utils.length,
    renewalOutcomes: renewalOutcomes.sort((a, b) => b.share - a.share),
    churnReasons,
    medianEngagementMonths:
      lengths.length >= minCell ? Math.round(weightedQuantile(lengths, 0.5)! * 10) / 10 : null,
  };
}

/** Share of this edition's aggregate rows verified against Bill.com invoices. */
export function verifiedShare(db: Database): number {
  const rows = eligibleEngagements(db);
  if (rows.length === 0) return 0;
  return Math.round((rows.filter((c) => c.verified).length / rows.length) * 100);
}

/* ---------- demand index (weekly) ---------- */

export function computeIndexSnapshot(db: Database, week: string): DemandIndexSnapshot {
  const byFunc: Partial<Record<Func, number>> = {};
  let total = 0;
  let respondents = 0;
  for (const p of db.pulseResponses) {
    if (p.week !== week) continue;
    const op = db.operators.find((o) => o.id === p.operatorId);
    if (!op) continue;
    respondents++;
    const mid = PULSE_MIDPOINT[p.band] ?? 0;
    byFunc[op.func] = (byFunc[op.func] ?? 0) + mid;
    total += mid;
  }
  for (const k of Object.keys(byFunc) as Func[]) byFunc[k] = Math.round(byFunc[k]!);
  return { week, byFunc, total: Math.round(total), respondents, computedAt: new Date().toISOString() };
}

/** Recompute and persist the current week's snapshot; return 12-week trend. */
export function indexTrend(db: Database, weeks = 12, now: Date = new Date()): DemandIndexSnapshot[] {
  const keys = lastWeeks(weeks, now);
  const out: DemandIndexSnapshot[] = [];
  for (const wk of keys) {
    let snap = db.demandIndexSnapshots.find((s) => s.week === wk);
    // Current week is always live-recomputed; history is frozen snapshots.
    if (!snap || wk === isoWeek(now)) {
      snap = computeIndexSnapshot(db, wk);
      const i = db.demandIndexSnapshots.findIndex((s) => s.week === wk);
      if (i >= 0) db.demandIndexSnapshots[i] = snap;
      else db.demandIndexSnapshots.push(snap);
    }
    out.push(snap);
  }
  return out;
}

/* ---------- weekly tape ---------- */

export interface TapeRow {
  outcome: "won" | "lost";
  func: string;
  stage: string;
  band: string;
  source: string;
  cycleWeeks: number;
  verified: boolean;
  week: string;
}

/** Anonymized deal rows — no operator, no company, ever. */
export function tapeRows(db: Database, weeks: string[]): TapeRow[] {
  return db.deals
    .filter((d) => weeks.includes(d.week) && d.moderation !== "held")
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .map((d) => ({
      outcome: d.outcome,
      func: FUNC_LABELS[d.func] ?? d.func,
      stage: STAGE_LABELS[d.stage] ?? d.stage,
      band: BAND_LABELS[d.retainerBand] ?? d.retainerBand,
      source: SOURCE_LABELS[d.source] ?? d.source,
      cycleWeeks: d.cycleWeeks,
      verified: d.verified,
      week: d.week,
    }));
}

/* ---------- percentile card (private, personal) ---------- */

export interface PercentileCard {
  percentile: number;
  func: Func;
  funcLabel: string;
  stage: string | null;
  stageLabel: string | null;
  yourRealization: number;
  cohortN: number;
}

/** "Your realized rate is P58 for fractional CMOs at Series A." */
export function percentileCard(db: Database, operatorId: string): PercentileCard | null {
  const op = db.operators.find((o) => o.id === operatorId);
  if (!op || op.listMonthlyRate <= 0) return null;
  const mine = db.clients.filter((c) => c.operatorId === operatorId && c.actuals && c.status === "active");
  if (mine.length === 0) return null;
  const myRate =
    (mine.reduce((s, c) => s + c.actuals!.actualMonthly, 0) / mine.length / op.listMonthlyRate) * 100;
  // Cohort: same function; stage narrows when the operator's modal stage has depth.
  const stageCounts = new Map<string, number>();
  for (const c of mine) stageCounts.set(c.actuals!.stage, (stageCounts.get(c.actuals!.stage) ?? 0) + 1);
  const myStage = [...stageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const cohort: { operatorId: string; rate: number }[] = [];
  const byOp = new Map<string, number[]>();
  for (const c of eligibleEngagements(db)) {
    const other = db.operators.find((o) => o.id === c.operatorId);
    if (!other || other.func !== op.func || other.listMonthlyRate <= 0) continue;
    if (myStage && c.actuals!.stage !== myStage) continue;
    if (!byOp.has(other.id)) byOp.set(other.id, []);
    byOp.get(other.id)!.push((c.actuals!.actualMonthly / other.listMonthlyRate) * 100);
  }
  for (const [id, rates] of byOp)
    cohort.push({ operatorId: id, rate: rates.reduce((s, r) => s + r, 0) / rates.length });
  const useStage = cohort.length >= db.config.verification.minCellOperators ? myStage : null;
  let pool = cohort;
  if (!useStage) {
    // Fall back to function-only cohort.
    const wide = new Map<string, number[]>();
    for (const c of eligibleEngagements(db)) {
      const other = db.operators.find((o) => o.id === c.operatorId);
      if (!other || other.func !== op.func || other.listMonthlyRate <= 0) continue;
      if (!wide.has(other.id)) wide.set(other.id, []);
      wide.get(other.id)!.push((c.actuals!.actualMonthly / other.listMonthlyRate) * 100);
    }
    pool = [...wide.entries()].map(([id, rates]) => ({
      operatorId: id,
      rate: rates.reduce((s, r) => s + r, 0) / rates.length,
    }));
  }
  if (pool.length < db.config.verification.minCellOperators) return null;
  const below = pool.filter((p) => p.rate < myRate).length;
  return {
    percentile: Math.round((below / pool.length) * 100),
    func: op.func,
    funcLabel: FUNC_LABELS[op.func],
    stage: useStage,
    stageLabel: useStage ? STAGE_LABELS[useStage] : null,
    yourRealization: Math.round(myRate),
    cohortN: pool.length,
  };
}

/* ---------- plausibility (spec §6) ---------- */

export function plausibleActuals(db: Database, actualMonthly: number): boolean {
  const v = db.config.verification;
  return actualMonthly >= v.retainerMin && actualMonthly <= v.retainerMax;
}

export function plausibleCycle(db: Database, cycleWeeks: number): boolean {
  return cycleWeeks > 0 && cycleWeeks <= db.config.verification.cycleMaxWeeks;
}

/* ---------- headline teasers (public, no detail) ---------- */

export function publicTeasers(db: Database, now: Date = new Date()): string[] {
  const wk = isoWeek(now);
  const teasers: string[] = [];
  const signalsThisWeek = db.signals.filter((s) => isoWeek(new Date(s.at)) === wk).length;
  if (signalsThisWeek > 0) teasers.push(`${signalsThisWeek} new buyer signal${signalsThisWeek === 1 ? "" : "s"} in the network this week`);
  const deals = db.deals.filter((d) => d.week === wk).length;
  if (deals > 0) teasers.push(`${deals} deal${deals === 1 ? "" : "s"} logged this week`);
  const real = realizationPanel(db, "func");
  if (real.length > 0)
    teasers.push(`${real[0].label} operators collect ${Math.round(real[0].median)}% of their list rate. Do you?`);
  const snap = computeIndexSnapshot(db, wk);
  if (snap.respondents >= db.config.verification.minCellOperators)
    teasers.push(`Nomad Demand Index this week: ${snap.total} active buyer conversations`);
  return teasers;
}

export function currentEdition(now: Date = new Date()): string {
  return monthKey(now);
}
