// Revenue Nomad fit score. Direct port of seed/fit-score.reference.js (handoff seed/fit-score.js).
// Out of 100. Skills and role 35, experience 30, budget 15, hours 20.
// Screening answers are not scored yet: answersScore() is the hook and always returns 0.

export interface Brief {
  cat: string;
  kw: string[];
  /** Budget in operator pay terms: what an operator's own rate is compared with. */
  rmin: number;
  rmax: number;
  hmin: number;
  hlabel: string;
  /** When set, reasons quote rates and budget in client dollars (pay grossed up by the fee). */
  clientBudgetMax?: number;
}

/**
 * One rate rule for the whole platform. Operators always enter and see what they are
 * paid. Clients always see the all-in rate: pay plus Revenue Nomad's standard 25% fee.
 */
export const PAY_SHARE = 0.75;
export const round5 = (x: number) => Math.round(x / 5) * 5;
export function clientRate(pay: number | null | undefined): number | null {
  return pay == null ? null : round5(pay / PAY_SHARE);
}
/** What a client sees for an operator's rate. */
export function allInLabel(pay: number | null | undefined): string {
  return pay == null ? "No rate listed" : `$${clientRate(pay)}/hr all-in`;
}
export function payFromBudget(budget: number): number {
  return round5(budget * PAY_SHARE);
}

export interface FitInput {
  cat: string;
  role?: string;
  allTags?: string[];
  allIndustries?: string[];
  eng?: number;
  rate: number | null;
  hrs?: number | null;
}

export interface FitResult {
  fit: number;
  parts: [number, number, number, number];
  tier: "strong" | "possible" | "weak";
  plus: string;
  minus: string;
}

export const FIT_PARTS: { label: string; max: number }[] = [
  { label: "Skills and role", max: 35 },
  { label: "Experience", max: 30 },
  { label: "Budget", max: 15 },
  { label: "Hours", max: 20 },
];

const SEAT_CATEGORIES: [RegExp, string][] = [
  [/rev(enue)?\s*op|revops|sales operations/i, "Revenue Operations"],
  [/enablement/i, "Sales Enablement"],
  [/customer success|\bcs\b|retention/i, "Customer Success & Growth"],
  [/marketing|cmo|demand gen/i, "Marketing"],
  [/partner/i, "Partnerships"],
  [/\bai\b/i, "AI GTM"],
  [/account executive|\bae\b|seller/i, "Sellers"],
  [/sales|cro|revenue officer/i, "Sales Leadership"],
];

const PRESET_KEYWORDS: Record<string, string[]> = {
  "Sales Leadership": ["playbook", "sales process", "hiring", "onboarding", "coaching", "hubspot", "forecast", "pipeline", "outbound", "discovery", "meddic", "abm"],
  "Revenue Operations": ["hubspot", "crm", "forecast", "pipeline", "revops", "revenue operations", "reporting", "dashboard", "comp", "territor", "sales process", "salesforce"],
};

export function seatCategory(title: string): string {
  for (const [re, cat] of SEAT_CATEGORIES) if (re.test(title)) return cat;
  return "Sales Leadership";
}

/** The function a seat matches on: the buyer's pick when there is one, else read from the title. */
export function seatOf(p: { title: string; category?: string | null }): string {
  return p.category || seatCategory(p.title || "");
}

export interface BriefSource {
  title: string;
  /** The seat's function, picked from the eight role categories. Falls back to reading the title. */
  category?: string | null;
  origin: "buyer" | "revenue_nomad";
  mustHaves?: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  operatorRate?: number | null;
  hoursPerMonthMin: number;
  hoursPerMonthMax: number;
}

export function briefFromProject(p: BriefSource): Brief {
  const cat = seatOf(p);
  const kw = PRESET_KEYWORDS[cat] || (p.mustHaves || []).map((m) => m.toLowerCase());
  // Revenue Nomad projects pay a fixed operator rate, so anyone at or under it is inside budget (gap C9).
  const rn = p.origin === "revenue_nomad";
  // A buyer's budget is client dollars; operator rates are pay. Compare like with like.
  const rmin = rn ? 0 : p.budgetMin != null ? payFromBudget(p.budgetMin) : 0;
  const rmax = rn ? p.operatorRate ?? 0 : p.budgetMax != null ? payFromBudget(p.budgetMax) : 0;
  return { cat, kw, rmin, rmax, hmin: p.hoursPerMonthMin, hlabel: `${p.hoursPerMonthMin}-${p.hoursPerMonthMax}`, clientBudgetMax: rn || p.budgetMax == null ? undefined : p.budgetMax };
}

export function fitScore(
  op: FitInput,
  brief: Brief,
  overrides: { rate?: number | null; hoursPerMonth?: number | null } = {},
): FitResult {
  const rate = overrides.rate ?? op.rate;
  const hrs = overrides.hoursPerMonth ?? op.hrs ?? 0;
  const tags = op.allTags || [];
  const tl = tags.join(" | ").toLowerCase();
  const role = op.role || "";
  let sk: number;
  let roleMatch: boolean;
  if (brief.cat === "Revenue Operations") {
    sk = op.cat === "Revenue Operations" ? 20 : op.cat === "Sales Leadership" && /VP|Chief|Head/.test(role) ? 12 : 6;
    if (/Revenue Operations|RevOps|Sales Operations/.test(role)) sk += 5;
    roleMatch = op.cat === "Revenue Operations";
  } else if (brief.cat === "Sales Leadership") {
    sk =
      op.cat === "Sales Leadership" && /VP|Chief|Head|Director/.test(role)
        ? 22
        : op.cat === "Sales Leadership"
          ? 14
          : ["Sales Enablement", "Sellers"].includes(op.cat)
            ? 10
            : 6;
    roleMatch = op.cat === "Sales Leadership";
  } else {
    sk = op.cat === brief.cat ? 20 : 6;
    roleMatch = op.cat === brief.cat;
  }
  const hits = brief.kw.filter((k) => tl.includes(k));
  sk = Math.min(35, sk + 2 * hits.length);

  const inds = (op.allIndustries || []).map((i) => i.toLowerCase());
  let ex =
    6 +
    Math.min(tags.length, 25) * 0.4 +
    Math.min(op.eng || 0, 4) * 1.5 +
    (inds.includes("saas") ? 3 : 0) +
    (inds.includes("health care") ? 2 : 0);
  ex = Math.min(30, pyRound(ex));

  const bu =
    rate == null ? 8 : rate >= brief.rmin && rate <= brief.rmax ? 15 : rate < brief.rmin ? 13 : rate <= brief.rmax * 1.2 ? 8 : 3;
  const hm = brief.hmin;
  const hr = hrs >= hm ? 20 : hrs >= hm * 0.75 ? 12 : hrs >= hm * 0.5 ? 6 : 3;

  const plus: string[] = [];
  const minus: string[] = [];
  if (roleMatch) plus.push(`${role} matches the seat`);
  if (tl.includes("hubspot")) plus.push("HubSpot on their profile");
  else if (hits.length) plus.push(`${hits.length} skills match the brief`);
  if (inds.includes("saas")) plus.push("B2B SaaS experience");
  if (hrs >= hm) plus.push(`${hrs} hrs a month open`);
  const shown = (r: number) => (brief.clientBudgetMax != null ? clientRate(r)! : r);
  const cap = brief.clientBudgetMax ?? brief.rmax;
  if (rate != null && rate <= brief.rmax) plus.push(`$${shown(rate)}/hr is inside budget`);
  if (!plus.length) plus.push(tags.length ? `${tags.length} skills on profile` : "Available now");
  if (hrs < hm) minus.push(`${hrs} hrs a month open, seat needs ${brief.hlabel}`);
  if (rate == null) minus.push("No rate on profile");
  else if (rate > brief.rmax) minus.push(`$${shown(rate)}/hr is over the $${cap} budget`);
  if (!roleMatch)
    minus.push(
      `${role || op.cat} profile, not ${brief.cat === "Revenue Operations" ? "RevOps" : brief.cat === "Sales Leadership" ? "VP of Sales" : brief.cat}`,
    );

  const parts: [number, number, number, number] = [sk, ex, bu, hr];
  const fit = parts.reduce((a, b) => a + b, 0);
  return {
    fit,
    parts,
    tier: tierOf(fit),
    plus: plus.slice(0, 2).join(". "),
    minus: minus.slice(0, 2).join(". "),
  };
}

/** Hook for scoring screening answers later. Not scored in this build (gap C4). */
export function answersScore(_answers: string[]): number {
  return 0;
}

export function tierOf(fit: number): "strong" | "possible" | "weak" {
  return fit >= 85 ? "strong" : fit >= 70 ? "possible" : "weak";
}

export const TIER_LABEL: Record<string, string> = { strong: "Strong fit", possible: "Possible fit", weak: "Weak fit" };

// Python round() is banker's rounding. Kept so seeded numbers match exactly.
function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}
