/** Client-side view of GET /api/state (locked detail never reaches the client). */

export interface Cell {
  key: string;
  label: string;
  n: number;
  median: number;
  p25: number;
  p75: number;
}

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

export interface IndexSnap {
  week: string;
  byFunc: Record<string, number>;
  total: number;
  respondents: number;
}

export interface ClientRow {
  id: string;
  clientName: string;
  rnPlaced: boolean;
  status: "active" | "ended" | "past";
  confirmed: boolean;
  verified: boolean;
  prefill: Actuals | null;
  actuals: Actuals | null;
  refreshDue: boolean;
  debriefed: boolean;
  moderation: "ok" | "held" | null;
}

export interface Actuals {
  actualMonthly: number;
  hoursPerMonth: number;
  stage: string;
  industry: string;
  scopeArea: string;
  source: string;
  pricingModel: string;
  vsList: string;
}

export interface Panel {
  unlocked: boolean;
  cost: number;
  label: string;
  data: unknown;
}

export interface State {
  operator: {
    id: string;
    name: string;
    funcLabel: string;
    listMonthlyRate: number;
    foundingFifty: boolean;
    insider: boolean;
    follows: string[];
    statedCapacityHours: number | null;
  } | null;
  credits: {
    balance: number;
    streakWeeks: number;
    streakNeeded: number;
    multiplierActive: boolean;
    multiplier: number;
    recent: { amount: number; note: string; at: string }[];
  };
  status: { tier: string; contributionsThisQuarter: number; insiderThreshold: number };
  gates: { feedActive: boolean; feedRecencyDays: number; lastContributionAt: string | null; pulsedThisWeek: boolean };
  daily: {
    teasers: string[];
    feed: {
      signals: { segment: string; type: string; timing: string; strength: string; at: string; named: boolean }[];
      intake: { segment: string; stage: string; status: string; at: string }[];
    } | null;
    tape: TapeRow[];
  };
  weekly: {
    week: string;
    pulse: { answered: boolean; band: string | null; credits: number };
    index: {
      current: IndexSnap | null;
      currentLocked: boolean;
      trend: IndexSnap[] | null;
      trendLocked: boolean;
      trendCost: number;
    };
    tape: TapeRow[];
    question: { id: string; question: string; options: string[]; credits: number; answered: boolean } | null;
    lastWeekQuestion: { question: string; result: { label: string; share: number }[] | null } | null;
  };
  monthly: {
    edition: string;
    verifiedShare: number;
    contributedThisEdition: boolean;
    panels: Record<string, Panel>;
    fullEditionCost: number;
    fullEditionUnlocked: boolean;
  };
  contribute: {
    clients: ClientRow[];
    earn: Record<string, number>;
    pastCount: number;
    pastCap: number;
    dealsThisWeek: number;
    dealsWeeklyCap: number;
    signalsThisMonth: number;
    signalsMonthlyCap: number;
    capacityAnswered: boolean;
    toolReviewCount: number;
    toolReviewCap: number;
    launchBonusActive: boolean;
    signalCashBounty: number;
  };
  percentile: {
    percentile: number;
    funcLabel: string;
    stageLabel: string | null;
    yourRealization: number;
    cohortN: number;
  } | null;
  mySignals: { id: string; segment: string; status: string; bountyPaid: boolean; at: string }[];
}

export async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, ...json };
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
