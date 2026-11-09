/**
 * The 2-minute Revenue Health Check: pillars, questions, answers, stage weights and fix-first lines.
 * Approved by the founder on 2026-11-09 from docs/specs/revenue-health-check.md. Edit copy here only.
 */

export const pillars = [
  "gtm_design",
  "revenue_technology",
  "revenue_insights",
  "data_foundations",
  "operating_rhythm",
  "team_enablement",
  "ai",
] as const;
export type Pillar = (typeof pillars)[number];

export const pillarLabel: Record<Pillar, string> = {
  gtm_design: "GTM Design",
  revenue_technology: "Revenue Technology",
  revenue_insights: "Revenue Insights",
  data_foundations: "Data Foundations",
  operating_rhythm: "Operating Rhythm",
  team_enablement: "Team Enablement",
  ai: "AI",
};

/** The Diagnostic's four maturity levels. Answer A maps to 4, D to 1. */
export const levels = [
  { level: 4, name: "Optimized", summary: "Systematic, data-driven, continuously improved, and survives a change in people." },
  { level: 3, name: "Performing", summary: "Documented, adopted by most of the team, measured and reviewed on a cadence." },
  { level: 2, name: "Foundational", summary: "The basics exist, partly documented or partly adopted. Nobody inspects it." },
  { level: 1, name: "Ad Hoc", summary: "Undocumented and person-dependent. Happens only when someone makes it happen." },
] as const;
export type Level = 1 | 2 | 3 | 4;

export type Question = { pillar: Pillar; text: string; answers: [string, string, string, string] };

/** One question per pillar, answers ordered Optimized (4) to Ad Hoc (1). */
export const questions: Question[] = [
  {
    pillar: "gtm_design",
    text: "Could you name, specifically, what is broken in your revenue function today?",
    answers: ["Yes - and we know how to fix it", "Yes - but not how to fix it", "We have theories, not evidence", "Honestly, no"],
  },
  {
    pillar: "revenue_technology",
    text: "Does your CRM show every deal, stage and next step the way the team actually works?",
    answers: [
      "Yes, and the team lives in it",
      "Mostly; a few teams keep their own lists",
      "It exists, but it is behind reality",
      "The real pipeline is in people's heads and spreadsheets",
    ],
  },
  {
    pillar: "revenue_insights",
    text: "When the board asks for the forecast, how does the answer hold up?",
    answers: [
      "One number, inspected deal by deal, and it lands",
      "One number, but it moves most weeks",
      "Several numbers depending on who you ask",
      "We do not have a forecast we would defend",
    ],
  },
  {
    pillar: "data_foundations",
    text: "Could a new hire trust the data in your systems on day one?",
    answers: [
      "Yes; owners, definitions and hygiene are documented and checked",
      "Mostly; the basics are documented but nobody inspects",
      "Some of it; you have to know who to ask",
      "No; we clean it up before every board meeting",
    ],
  },
  {
    pillar: "operating_rhythm",
    text: "Does the revenue team run the same way every week?",
    answers: [
      "Yes; a fixed cadence of pipeline, forecast and deal reviews, with owners",
      "Mostly; meetings happen, follow-through varies",
      "Sometimes; it depends on who is driving that month",
      "No; we react to whatever is loudest",
    ],
  },
  {
    pillar: "team_enablement",
    text: "How does a new seller get to full productivity?",
    answers: [
      "A documented playbook, onboarding plan and coaching cadence; ramp time is measured",
      "A playbook exists; coaching depends on the manager",
      "They shadow whoever is available",
      "They figure it out or they leave",
    ],
  },
  {
    pillar: "ai",
    text: "Where is AI taking work off your sellers today?",
    answers: [
      "In the workflow, measured, and scaling (research, follow-up, notes, forecasting)",
      "A few pilots with early time savings",
      "Individuals use tools on their own; nothing shared",
      "Nowhere yet",
    ],
  },
];

/** Standard fields (single-select variants of the product rules' revenueRange and employeeRange). */
export const revenueRanges = [
  { value: "pre_revenue", label: "Pre-revenue" },
  { value: "under_1m", label: "Under $1M" },
  { value: "1m_5m", label: "$1M - $5M" },
  { value: "5m_20m", label: "$5M - $20M" },
  { value: "20m_50m", label: "$20M - $50M" },
  { value: "50m_plus", label: "$50M+" },
] as const;
export type RevenueRange = (typeof revenueRanges)[number]["value"];

export const employeeRanges = [
  { value: "1_10", label: "1 - 10" },
  { value: "11_50", label: "11 - 50" },
  { value: "51_200", label: "51 - 200" },
  { value: "201_500", label: "201 - 500" },
  { value: "501_1000", label: "501 - 1,000" },
  { value: "1001_plus", label: "1,000+" },
] as const;
export type EmployeeRange = (typeof employeeRanges)[number]["value"];

/**
 * Stage weights: how much lift fixing a pillar creates at each revenue stage (spec, approved draft).
 * Pre-revenue and Under $1M share a column.
 */
export const stageWeights: Record<Pillar, Record<RevenueRange, number>> = {
  gtm_design: { pre_revenue: 1.5, under_1m: 1.5, "1m_5m": 1.5, "5m_20m": 1.2, "20m_50m": 1.0, "50m_plus": 0.9 },
  revenue_technology: { pre_revenue: 0.8, under_1m: 0.8, "1m_5m": 1.0, "5m_20m": 1.2, "20m_50m": 1.1, "50m_plus": 1.0 },
  revenue_insights: { pre_revenue: 0.7, under_1m: 0.7, "1m_5m": 0.9, "5m_20m": 1.2, "20m_50m": 1.5, "50m_plus": 1.5 },
  data_foundations: { pre_revenue: 0.7, under_1m: 0.7, "1m_5m": 0.9, "5m_20m": 1.3, "20m_50m": 1.5, "50m_plus": 1.5 },
  operating_rhythm: { pre_revenue: 1.3, under_1m: 1.3, "1m_5m": 1.4, "5m_20m": 1.2, "20m_50m": 1.0, "50m_plus": 0.9 },
  team_enablement: { pre_revenue: 0.8, under_1m: 0.8, "1m_5m": 1.1, "5m_20m": 1.3, "20m_50m": 1.2, "50m_plus": 1.0 },
  ai: { pre_revenue: 0.6, under_1m: 0.6, "1m_5m": 0.7, "5m_20m": 0.9, "20m_50m": 1.1, "50m_plus": 1.3 },
};

/** Shown under each "fix first" pillar. */
export const fixFirstLine: Record<Pillar, string> = {
  gtm_design:
    "Companies at your stage usually fix this by defining the motion first: roles, stages and a comp plan the whole team can see. The Diagnostic's GTM Design workstream does this in the first month.",
  revenue_technology: "The fix is rarely a new tool. It is making the CRM match how the team sells, then retiring the side lists.",
  revenue_insights: "One forecast, inspected deal by deal on a weekly call, replaces the number that moves.",
  data_foundations:
    "Stage definitions, field owners and a hygiene check turn the CRM into something a board or a diligence team can read.",
  operating_rhythm: "A fixed weekly cadence with owners is the cheapest fix on this list and the one the others depend on.",
  team_enablement: "A playbook and a coaching cadence make ramp time something you measure, not guess.",
  ai: "Two use cases in the seller workflow, measured, then scaled. Time back per seller is the number to watch.",
};
