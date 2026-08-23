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
  // Event signals from the daily universe diff — these are what make the
  // queue move day to day. Weighted above their standing counterparts.
  "started-hiring": { weight: 0.65, halfLifeDays: 30 },
  "headcount-jump": { weight: 0.6, halfLifeDays: 90 },
  "positioning-shift": {
    weight: 0.35,
    roleWeights: { Marketing: 0.7, "AI GTM": 0.45 },
    halfLifeDays: 120,
  },
  "newly-launched": { weight: 0.5, halfLifeDays: 60 },
  // Role-specific cross-function gap read off the company's own careers
  // board — e.g. "scaling GTM hiring with no ops role posted" (RevOps R5),
  // "AI in the pitch, no AI roles posted" (AI GTM A1, the spec's
  // highest-precision Tier 1/2 signal).
  "function-gap": {
    weight: 0.7,
    roleWeights: { "AI GTM": 0.85 },
    halfLifeDays: 60,
  },
  // A new sales/marketing leader in seat rebuilds ops, enablement, and the
  // CS interface in their first quarter (spec R4/E3).
  "leader-appointed": {
    weight: 0.5,
    roleWeights: { "Revenue Operations": 0.75, "Sales Enablement": 0.7, "Customer Success": 0.55 },
    halfLifeDays: 90,
  },
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
  "started-hiring": "Started hiring",
  "headcount-jump": "Headcount jump",
  "positioning-shift": "Repositioned",
  "newly-launched": "Just launched",
  "function-gap": "Function gap",
  "leader-appointed": "New leader",
};

/**
 * Which signal types are meaningful per role category. Anything not listed
 * is dropped for that role — a Sales Leadership queue should never carry
 * content-gap noise, and an AI GTM queue shouldn't fill with generic
 * sales-team signals.
 */
export const ALLOWED_SIGNALS: Record<OperatorRole, SignalType[]> = {
  "Sales Leadership": ["departure", "leadership-gap", "team-without-leader", "funding", "hiring-role", "actively-hiring", "early-inflection", "started-hiring", "headcount-jump", "newly-launched", "function-gap"],
  Marketing: ["departure", "leadership-gap", "team-without-leader", "funding", "hiring-role", "content-gap", "actively-hiring", "early-inflection", "started-hiring", "headcount-jump", "positioning-shift", "newly-launched", "function-gap"],
  "Revenue Operations": ["departure", "leadership-gap", "funding", "hiring-role", "actively-hiring", "started-hiring", "headcount-jump", "function-gap", "leader-appointed"],
  "Sales Enablement": ["departure", "leadership-gap", "funding", "hiring-role", "actively-hiring", "started-hiring", "headcount-jump", "function-gap", "leader-appointed"],
  "Customer Success": ["departure", "leadership-gap", "team-without-leader", "funding", "hiring-role", "actively-hiring", "started-hiring", "headcount-jump", "function-gap", "leader-appointed", "early-inflection"],
  "AI GTM": ["departure", "funding", "hiring-role", "ai-native", "content-gap", "actively-hiring", "early-inflection", "started-hiring", "positioning-shift", "newly-launched", "function-gap"],
  Partnerships: ["departure", "leadership-gap", "funding", "hiring-role", "actively-hiring", "started-hiring", "headcount-jump", "function-gap"],
  Sellers: ["leadership-gap", "team-without-leader", "funding", "hiring-role", "actively-hiring", "started-hiring", "headcount-jump", "newly-launched", "function-gap", "departure"],
};

/**
 * Team-size window where each role category is most buyable — a 12-person
 * seed startup needs a fractional sales leader, not a RevOps function; a
 * 60-person Series B is the reverse. Companies inside the window get a fit
 * bonus, so candidate ORDERING differs by role, not just weights.
 */
export const TEAM_SWEETSPOT: Record<OperatorRole, [number, number]> = {
  "Sales Leadership": [8, 80],
  Marketing: [8, 80],
  "Revenue Operations": [20, 150],
  "Sales Enablement": [25, 200],
  "Customer Success": [20, 150],
  "AI GTM": [10, 120],
  Partnerships: [25, 200],
  Sellers: [10, 100],
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
