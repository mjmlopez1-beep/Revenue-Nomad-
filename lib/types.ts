/**
 * The Nomad Benchmark — data model (spec v1.1).
 *
 * The JSON store mirrors the Postgres schema named in §7 of the spec
 * (`clients`, `pulse_responses`, `demand_index_snapshots`,
 * `billcom_reconciliations`) so the v1.5 migration is a table-per-array move.
 */

export type Func =
  | "cmo"
  | "cro"
  | "vp_sales"
  | "vp_marketing"
  | "revops"
  | "growth"
  | "sdr_leader";

export type Stage = "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus";

export type Industry =
  | "b2b_saas"
  | "fintech"
  | "healthtech"
  | "devtools"
  | "cybersecurity"
  | "ai_ml"
  | "ecommerce"
  | "services";

export type ScopeArea =
  | "full_gtm"
  | "sales_leadership"
  | "marketing_leadership"
  | "pipeline_gen"
  | "revops_systems"
  | "pricing_packaging"
  | "hiring_enablement";

export type DealSource = "rn" | "referral" | "inbound" | "outbound" | "community" | "past_client";

export type PricingModel = "monthly_retainer" | "day_rate" | "hourly" | "project" | "retainer_plus_equity";

/** A followable segment for daily signal alerts: fixed list (decided in §10). */
export interface Segment {
  func?: Func;
  industry?: Industry;
  stage?: Stage;
}

/* ---------- operators ---------- */

export interface Operator {
  id: string;
  name: string;
  email: string;
  func: Func;
  /** Profile rate card — RN already holds this. Never asked for again. */
  listMonthlyRate: number;
  listHourlyRate: number;
  foundingFifty: boolean;
  insider: boolean;
  /** Segments followed for daily signal alerts (max 1 push/day). */
  follows: Segment[];
  joinedAt: string;
  /** Stated monthly capacity in hours (from monthly capacity pulse). */
  statedCapacityHours: number | null;
  takingClients: boolean | null;
}

/* ---------- clients (engagement-level actuals; per-client census) ---------- */

export interface EngagementActuals {
  actualMonthly: number;
  hoursPerMonth: number;
  stage: Stage;
  industry: Industry;
  scopeArea: ScopeArea;
  source: DealSource;
  pricingModel: PricingModel;
  /** Operator confirms actual-vs-list relationship ("at list", "discounted", "above list"). */
  vsList: "at_list" | "below_list" | "above_list";
}

export interface Debrief {
  outcome: "renewed" | "expanded" | "completed" | "churned";
  reason: string;
  at: string;
}

export interface ClientEngagement {
  id: string;
  operatorId: string;
  /** Operator-facing label only. Never exposed in any aggregate or tape row. */
  clientName: string;
  rnPlaced: boolean;
  status: "active" | "ended" | "past";
  /** RN-placed rows arrive pre-filled from Bill.com records; operator confirms in one tap. */
  prefill: EngagementActuals | null;
  actuals: EngagementActuals | null;
  confirmedAt: string | null;
  /** Verified = reconciled against a Bill.com invoice (or confirmed pre-fill). */
  verified: boolean;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  debrief: Debrief | null;
  /** Quarterly refresh clock (per-client census pattern). */
  refreshDueAt: string;
  lastRefreshedAt: string | null;
  /** Plausibility-flagged rows are excluded from aggregates until cleared. */
  moderation: "ok" | "held" | null;
}

/* ---------- weekly pulse & demand index ---------- */

export type PulseBand = "0" | "1_2" | "3_5" | "6_plus";

export interface PulseResponse {
  id: string;
  operatorId: string;
  /** ISO week key, e.g. "2026-W35". */
  week: string;
  band: PulseBand;
  via: "app" | "email";
  at: string;
}

export interface DemandIndexSnapshot {
  week: string;
  /** Estimated active buyer conversations, by function (band midpoints summed). */
  byFunc: Partial<Record<Func, number>>;
  total: number;
  respondents: number;
  computedAt: string;
}

/* ---------- deals, signals, capacity, reviews, questions ---------- */

export interface DealLog {
  id: string;
  operatorId: string;
  outcome: "won" | "lost";
  source: DealSource;
  competitor: string | null;
  cycleWeeks: number;
  retainerBand: RetainerBand;
  func: Func;
  stage: Stage;
  why: string | null;
  week: string;
  at: string;
  /** RN-sourced deals are cross-checked against RN records. */
  verified: boolean;
  moderation: "ok" | "held" | null;
}

export type RetainerBand = "under_3k" | "3k_6k" | "6k_10k" | "10k_15k" | "15k_plus";

export type SignalStatus = "new" | "qualifying" | "intro_made" | "converted" | "dead";

export interface BuyerSignal {
  id: string;
  operatorId: string;
  segment: Segment;
  signalType: "hiring_intent" | "budget_opened" | "exec_departure" | "asked_for_intro" | "expansion" | "other";
  timing: "now" | "this_quarter" | "exploring";
  strength: "strong" | "medium" | "weak";
  /** Named company earns +10; only admin ever sees the name. */
  companyName: string | null;
  note: string;
  status: SignalStatus;
  bountyPaid: boolean;
  at: string;
  statusLog: { status: SignalStatus; at: string; note?: string }[];
}

export interface CapacityPulse {
  id: string;
  operatorId: string;
  /** Month key, e.g. "2026-08". */
  month: string;
  hoursFree: number;
  takingClients: boolean;
  at: string;
}

export interface ToolReview {
  id: string;
  operatorId: string;
  tool: string;
  rating: number; // 1..5
  monthlySpend: number | null;
  note: string;
  at: string;
}

export interface QuestionOfWeek {
  id: string;
  week: string;
  question: string;
  options: string[];
  credits: number;
  /** Last week's result shown in the Tape Drop. */
}

export interface QuestionAnswer {
  id: string;
  operatorId: string;
  questionId: string;
  option: number;
  at: string;
}

/* ---------- economy: credits, unlocks ---------- */

export type EarnAction =
  | "engagement_actuals"
  | "engagement_confirm_prefill"
  | "engagement_refresh"
  | "past_engagement"
  | "weekly_pulse"
  | "deal_log"
  | "deal_log_why"
  | "debrief"
  | "debrief_bonus"
  | "buyer_signal"
  | "buyer_signal_named"
  | "capacity_pulse"
  | "tool_review"
  | "tool_review_spend"
  | "question_of_week"
  | "depth_layer"
  | "referral"
  | "insider_monthly"
  | "streak_multiplier"
  | "admin_adjustment";

export interface CreditEntry {
  id: string;
  operatorId: string;
  action: EarnAction | "spend";
  /** Positive = earn, negative = spend. */
  amount: number;
  /** What this entry paid for / was paid by (client id, deal id, asset key…). */
  ref: string;
  note: string;
  at: string;
  /** Question-of-week credits expire; null = never. */
  expiresAt: string | null;
}

export type EditionAsset =
  | "index_trend"
  | "retainers_by_function"
  | "retainers_by_stage"
  | "retainers_by_industry"
  | "realization_rate"
  | "win_rate_by_source"
  | "pricing_models"
  | "utilization_renewal"
  | "full_edition";

export interface Unlock {
  id: string;
  operatorId: string;
  /** Edition month key — unlocks expire when the edition closes. */
  edition: string;
  asset: EditionAsset;
  cost: number;
  at: string;
}

/* ---------- verification (Bill.com reconciliation) ---------- */

export interface BillcomReconciliation {
  id: string;
  uploadedAt: string;
  uploadedBy: string;
  month: string;
  rows: number;
  matched: number;
  flagged: number;
  detail: {
    clientId: string;
    invoiceAmount: number;
    reportedAmount: number;
    result: "verified" | "mismatch" | "no_report";
  }[];
}

/* ---------- economy config (admin-retunable, no deploys) ---------- */

export interface EconomyConfig {
  earn: {
    engagementActuals: number;
    confirmPrefill: number;
    quarterlyRefresh: number;
    pastEngagement: number;
    pastEngagementCap: number;
    /** Launch-window bonus on past engagements (decided in §10: yes, expiring). */
    pastEngagementLaunchBonus: number;
    launchWindowDays: number;
    weeklyPulse: number;
    dealLog: number;
    dealLogWhy: number;
    dealLogWeeklyCap: number;
    debrief: number;
    debriefBonus: number;
    buyerSignal: number;
    buyerSignalNamed: number;
    buyerSignalMonthlyCap: number;
    signalCashBounty: number;
    capacityPulse: number;
    toolReview: number;
    toolReviewSpend: number;
    toolReviewCap: number;
    depthLayer: number;
    referral: number;
  };
  spend: Record<EditionAsset, number>;
  gates: {
    /** Demand Feed detail requires a contribution within N days. */
    feedRecencyDays: number;
    /** Flagship panel free with any contribution this cycle. */
    flagshipFreeWithContribution: boolean;
  };
  streak: { weeks: number; multiplier: number };
  insider: { monthlyCredits: number; priceMonthly: number; priceYearly: number };
  status: { insiderContributionsPerQuarter: number };
  verification: {
    verifiedWeight: number;
    minCellOperators: number;
    retainerMin: number;
    retainerMax: number;
    cycleMaxWeeks: number;
  };
  launchDate: string;
}

/* ---------- database ---------- */

export interface Database {
  operators: Operator[];
  clients: ClientEngagement[];
  pulseResponses: PulseResponse[];
  demandIndexSnapshots: DemandIndexSnapshot[];
  deals: DealLog[];
  signals: BuyerSignal[];
  capacityPulses: CapacityPulse[];
  toolReviews: ToolReview[];
  questions: QuestionOfWeek[];
  questionAnswers: QuestionAnswer[];
  credits: CreditEntry[];
  unlocks: Unlock[];
  billcomReconciliations: BillcomReconciliation[];
  config: EconomyConfig;
  meta: { seededAt: string | null };
}
