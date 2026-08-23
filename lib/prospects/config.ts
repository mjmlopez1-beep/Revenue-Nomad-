import type { OperatorRole, SignalType } from "../types";

/**
 * Signal registry — config, not code (Match Engine spec §7). Weights follow
 * the spec's §4 role-family tables for the signals detectable from Tier 1/2
 * sources (YC directory, job boards, news, web checks). Tier 3 (people-graph)
 * signals like verified departures-without-backfill land when that data
 * source is added; the news-based departure signal is the Tier 1 proxy.
 *
 * - `weight`: 0–1 contribution to the noisy-OR timing score.
 * - `roleWeights`: per-role-family overrides (a content gap matters far more
 *   to a Marketing operator than to a Sales Leadership one).
 * - `halfLifeDays`: decay rate; null = standing condition (decay 1.0 but a
 *   deliberately lower ceiling weight, per spec §5.1 — "they have never had
 *   a sales leader" is true every day and must not outrank "their VP left
 *   last week").
 */
export interface SignalConfig {
  weight: number;
  roleWeights?: Partial<Record<OperatorRole, number>>;
  halfLifeDays: number | null;
}

export const SIGNAL_CONFIG: Record<SignalType, SignalConfig> = {
  departure: { weight: 0.85, halfLifeDays: 75 },
  "leadership-gap": { weight: 0.8, halfLifeDays: 45 },
  "team-without-leader": { weight: 0.75, halfLifeDays: null },
  funding: { weight: 0.6, halfLifeDays: 120 },
  "hiring-role": { weight: 0.55, halfLifeDays: 60 },
  "content-gap": {
    weight: 0.25,
    roleWeights: { Marketing: 0.75, "AI GTM": 0.35 },
    halfLifeDays: 120,
  },
  "ai-native": {
    weight: 0.15,
    roleWeights: { "AI GTM": 0.7 },
    halfLifeDays: 90,
  },
  "actively-hiring": { weight: 0.45, halfLifeDays: null },
  "early-inflection": { weight: 0.55, halfLifeDays: null },
};

/** Human-readable chip labels for the UI (no emoji — enterprise surface). */
export const SIGNAL_LABELS: Record<SignalType, string> = {
  departure: "Departure",
  "leadership-gap": "Leadership gap",
  "team-without-leader": "Team w/o leader",
  funding: "Funding",
  "hiring-role": "Open GTM roles",
  "content-gap": "Content gap",
  "ai-native": "AI native",
  "actively-hiring": "Hiring",
  "early-inflection": "Early stage",
};

/** Queue rules (spec §5.3). */
export const QUEUE = {
  minComposite: 40, // tune after live data; spec suggests 45
  maxNewPerScan: 25,
};

export function signalWeight(type: SignalType, role: OperatorRole): number {
  const cfg = SIGNAL_CONFIG[type];
  return cfg.roleWeights?.[role] ?? cfg.weight;
}

/** decay = 0.5 ^ (days_since_detected / half_life); standing signals don't decay. */
export function signalDecay(type: SignalType, detectedOn: string | undefined, now: number): number {
  const cfg = SIGNAL_CONFIG[type];
  if (cfg.halfLifeDays === null || !detectedOn) return 1;
  const days = Math.max(0, (now - new Date(detectedOn).getTime()) / 86400000);
  return Math.pow(0.5, days / cfg.halfLifeDays);
}
