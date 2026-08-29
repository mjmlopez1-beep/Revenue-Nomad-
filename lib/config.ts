import type { EconomyConfig } from "./types";

/**
 * Default economy values from spec v1.1 §3.1/§3.2 and §5. Every number here is
 * admin-editable at runtime (/admin → Economy) — these are only first-boot
 * defaults. Retunes never require a deploy.
 */
export const DEFAULT_CONFIG: EconomyConfig = {
  earn: {
    engagementActuals: 20,
    confirmPrefill: 10,
    quarterlyRefresh: 10,
    pastEngagement: 15,
    pastEngagementCap: 5,
    pastEngagementLaunchBonus: 5,
    launchWindowDays: 30,
    weeklyPulse: 5,
    dealLog: 15,
    dealLogWhy: 5,
    dealLogWeeklyCap: 2,
    debrief: 20,
    debriefBonus: 5,
    buyerSignal: 40,
    buyerSignalNamed: 10,
    buyerSignalMonthlyCap: 3,
    signalCashBounty: 250,
    capacityPulse: 5,
    toolReview: 10,
    toolReviewSpend: 5,
    toolReviewCap: 10,
    depthLayer: 10,
    referral: 50,
  },
  spend: {
    index_trend: 20,
    retainers_by_function: 0, // flagship: free with any contribution this cycle
    retainers_by_stage: 25,
    retainers_by_industry: 25,
    realization_rate: 40,
    win_rate_by_source: 40,
    pricing_models: 35,
    utilization_renewal: 30,
    full_edition: 75,
  },
  gates: {
    feedRecencyDays: 7,
    flagshipFreeWithContribution: true,
  },
  streak: { weeks: 4, multiplier: 1.25 },
  insider: { monthlyCredits: 100, priceMonthly: 49, priceYearly: 490 },
  status: { insiderContributionsPerQuarter: 8 },
  verification: {
    verifiedWeight: 2,
    minCellOperators: 5,
    retainerMin: 1000,
    retainerMax: 40000,
    cycleMaxWeeks: 52,
  },
  launchDate: "2026-08-24",
};

export const FUNC_LABELS: Record<string, string> = {
  cmo: "Fractional CMO",
  cro: "Fractional CRO",
  vp_sales: "Fractional VP Sales",
  vp_marketing: "Fractional VP Marketing",
  revops: "Fractional RevOps",
  growth: "Fractional Growth",
  sdr_leader: "Fractional SDR Leader",
};

export const STAGE_LABELS: Record<string, string> = {
  pre_seed: "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c_plus: "Series C+",
};

export const INDUSTRY_LABELS: Record<string, string> = {
  b2b_saas: "B2B SaaS",
  fintech: "Fintech",
  healthtech: "Healthtech",
  devtools: "DevTools",
  cybersecurity: "Cybersecurity",
  ai_ml: "AI/ML",
  ecommerce: "E-commerce",
  services: "Services",
};

export const SCOPE_LABELS: Record<string, string> = {
  full_gtm: "Full GTM",
  sales_leadership: "Sales leadership",
  marketing_leadership: "Marketing leadership",
  pipeline_gen: "Pipeline generation",
  revops_systems: "RevOps & systems",
  pricing_packaging: "Pricing & packaging",
  hiring_enablement: "Hiring & enablement",
};

export const SOURCE_LABELS: Record<string, string> = {
  rn: "Revenue Nomad",
  referral: "Referral",
  inbound: "Inbound",
  outbound: "Outbound",
  community: "Community",
  past_client: "Past client",
};

export const BAND_LABELS: Record<string, string> = {
  under_3k: "<$3k",
  "3k_6k": "$3–6k",
  "6k_10k": "$6–10k",
  "10k_15k": "$10–15k",
  "15k_plus": "$15k+",
};

export const PRICING_LABELS: Record<string, string> = {
  monthly_retainer: "Monthly retainer",
  day_rate: "Day rate",
  hourly: "Hourly",
  project: "Project",
  retainer_plus_equity: "Retainer + equity",
};

export const ASSET_LABELS: Record<string, string> = {
  index_trend: "Demand Index, 12-week trend",
  retainers_by_function: "Actual retainers by function",
  retainers_by_stage: "Actual retainers by stage",
  retainers_by_industry: "Actual retainers by industry",
  realization_rate: "Realization rate (actual vs list)",
  win_rate_by_source: "Win rate by deal source",
  pricing_models: "Pricing models & discounting",
  utilization_renewal: "Utilization & renewal",
  full_edition: "Full edition",
};

/** Pulse band midpoints used to estimate active conversations for the Demand Index. */
export const PULSE_MIDPOINT: Record<string, number> = {
  "0": 0,
  "1_2": 1.5,
  "3_5": 4,
  "6_plus": 7,
};
