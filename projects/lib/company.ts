// Buyer company profile on the platform's standard picklists, and the "company fit"
// signal it drives: how closely an operator's track record matches this buyer's
// industry, deal size, sales cycle, stage, CRM and motion. Only dimensions the
// operator's profile actually covers count; missing data is never a penalty.

import type { Operator } from "./types";
import { OPERATORS } from "./data";

export interface BuyerProfile {
  industries: string[];
  employees: string;
  revenue: string;
  stage: string;
  acv: string;
  salesCycle: string;
  motions: string[];
  segments: string[];
  crm: string;
}

type Opt = [value: string, label: string];

// The same enums as the operator profile and the prospect engine.
export const EMPLOYEE_SIZES: Opt[] = [
  ["1_10", "1–10"],
  ["11_50", "11–50"],
  ["51_200", "51–200"],
  ["201_500", "201–500"],
  ["501_1000", "501–1,000"],
  ["1001_plus", "1,001+"],
];
export const REVENUE_SIZES: Opt[] = [
  ["pre_revenue", "Pre-revenue"],
  ["under_1m", "Under $1M"],
  ["1m_5m", "$1M–$5M"],
  ["5m_20m", "$5M–$20M"],
  ["20m_50m", "$20M–$50M"],
  ["50m_plus", "$50M+"],
];
export const STAGES: Opt[] = [
  ["pre_seed", "Pre-seed"],
  ["seed", "Seed"],
  ["series_a", "Series A"],
  ["series_b", "Series B"],
  ["series_c_plus", "Series C+"],
  ["growth", "Growth"],
];
export const ACV_BANDS: Opt[] = [
  ["under_15k", "Under $15K"],
  ["15k_50k", "$15K–$50K"],
  ["50k_150k", "$50K–$150K"],
  ["150k_plus", "$150K+"],
];
export const SALES_CYCLES: Opt[] = [
  ["lt5d", "Under 5 days"],
  ["5_30d", "5–30 days"],
  ["30_90d", "30–90 days"],
  ["3_6m", "3–6 months"],
  ["6_12m", "6–12 months"],
  ["12m_plus", "12+ months"],
];
export const MOTIONS: Opt[] = [
  ["plg", "PLG"],
  ["plg_to_sales", "PLG to sales"],
  ["inside_sales", "Inside sales"],
  ["enterprise_sales", "Enterprise sales"],
  ["channel", "Channel"],
];
export const SEGMENTS: Opt[] = [
  ["smb", "SMB"],
  ["mid_market", "Mid-market"],
  ["enterprise", "Enterprise"],
];
export const CRMS: Opt[] = [
  ["salesforce", "Salesforce"],
  ["hubspot", "HubSpot"],
  ["pipedrive", "Pipedrive"],
  ["zoho", "Zoho"],
  ["netsuite", "NetSuite"],
  ["other", "Other"],
];
/** Industries as operators list them on revenuenomad.com, most common first. */
export const INDUSTRIES: string[] = (() => {
  const m = new Map<string, number>();
  for (const o of OPERATORS) for (const i of o.allIndustries || []) m.set(i, (m.get(i) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([i]) => i);
})();

export const label = (opts: Opt[], v: string) => opts.find((o) => o[0] === v)?.[1] || v;

const DEFAULTS: Record<string, BuyerProfile> = {
  "buyer-northwind": { industries: ["Health Care", "Saas"], employees: "51_200", revenue: "5m_20m", stage: "series_b", acv: "15k_50k", salesCycle: "30_90d", motions: ["inside_sales"], segments: ["mid_market"], crm: "hubspot" },
  "buyer-kitebase": { industries: ["Developer Tools", "Saas"], employees: "11_50", revenue: "1m_5m", stage: "series_a", acv: "under_15k", salesCycle: "5_30d", motions: ["plg", "plg_to_sales"], segments: ["smb", "mid_market"], crm: "hubspot" },
};

export function defaultBuyerProfile(buyerId: string): BuyerProfile {
  return DEFAULTS[buyerId] || { industries: [], employees: "", revenue: "", stage: "", acv: "", salesCycle: "", motions: [], segments: [], crm: "" };
}

export function profileCompleteness(p: BuyerProfile): number {
  const filled = [p.industries.length, p.employees, p.revenue, p.stage, p.acv, p.salesCycle, p.motions.length, p.segments.length, p.crm].filter(Boolean).length;
  return Math.round((filled / 9) * 100);
}

// ---------------------------------------------------------------- company fit

type Details = Record<string, unknown>;

function details(op: Operator): Details {
  return ((op as Operator & { roleDetails?: Details }).roleDetails || {}) as Details;
}

function acvBandOf(n: number): string {
  return n < 15000 ? "under_15k" : n < 50000 ? "15k_50k" : n < 150000 ? "50k_150k" : "150k_plus";
}

const CYCLE_TEXT: Record<string, RegExp> = {
  lt5d: /<\s*5 days/i,
  "5_30d": /5\s*-\s*30 days/i,
  "30_90d": /30\s*-\s*90 days/i,
  "3_6m": /3\s*-\s*6 months/i,
  "6_12m": /6\s*-\s*12 months/i,
  "12m_plus": /12\s*\+\s*months|12_plus_months/i,
};

const MOTION_TEXT: Record<string, RegExp> = {
  plg: /\bplg\b|product.led|low_touch/,
  plg_to_sales: /plg\s*(→|->|to)\s*sales|founder-led sales exit|plg.*sales bridge/,
  inside_sales: /inside|inbound|outbound|\bsdr\b|smb motion|mid-market motion|low_touch/,
  enterprise_sales: /enterprise|high_touch/,
  channel: /channel|reseller/,
};
const MOTION_ANY = new RegExp(Object.values(MOTION_TEXT).map((r) => r.source).join("|"));

export interface CompanyFit {
  level: "strong" | "some" | "low" | "unknown";
  label: string;
  matched: string[];
  missed: string[];
  known: number;
}

export function companyFit(op: Operator, bp: BuyerProfile | null | undefined): CompanyFit {
  if (!bp) return { level: "unknown", label: "Set up your company profile", matched: [], missed: [], known: 0 };
  const d = details(op);
  const matched: string[] = [];
  const missed: string[] = [];
  const check = (known: boolean, ok: boolean, yes: string, no: string) => {
    if (!known) return;
    (ok ? matched : missed).push(ok ? yes : no);
  };
  // Industry: from the operator's listed industries.
  if (bp.industries.length) {
    const inds = (op.allIndustries || []).map((i) => i.toLowerCase());
    const hit = bp.industries.find((i) => inds.includes(i.toLowerCase()));
    check(inds.length > 0, !!hit, `${hit} experience`, `No ${bp.industries[0]} experience listed`);
  }
  // ACV: average deal size they've sold or led.
  if (bp.acv) {
    const raw = d.average_deal_size_range ?? d.avg_deal_size_acv ?? d.average_deal_size;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (raw != null && raw !== "" && !isNaN(n)) {
      const band = acvBandOf(n);
      const order = ACV_BANDS.map((b) => b[0]);
      const near = Math.abs(order.indexOf(band) - order.indexOf(bp.acv)) <= 1;
      check(true, near, `Sold ${label(ACV_BANDS, band)} deals`, `Usually sells ${label(ACV_BANDS, band)} deals`);
    }
  }
  // Sales cycle
  if (bp.salesCycle) {
    const txt = [d.sales_cycle_range, d.sales_cycle_experience].filter(Boolean).join(", ");
    const days = Number(d.avg_sales_cycle_days);
    if (txt) check(true, CYCLE_TEXT[bp.salesCycle].test(txt), `Works ${label(SALES_CYCLES, bp.salesCycle).toLowerCase()} cycles`, `Cycles of ${txt.split(",")[0].trim()}`);
    else if (!isNaN(days) && days > 0) {
      const b = days < 5 ? "lt5d" : days <= 30 ? "5_30d" : days <= 90 ? "30_90d" : days <= 180 ? "3_6m" : days <= 365 ? "6_12m" : "12m_plus";
      check(true, b === bp.salesCycle, `Works ${label(SALES_CYCLES, bp.salesCycle).toLowerCase()} cycles`, `Average cycle ${days} days`);
    }
  }
  // Stage
  if (bp.stage) {
    const stages = ([] as unknown[]).concat(d.revenue_stages_thrived_in ?? []).map(String);
    const order = STAGES.map((x) => x[0]);
    const near = stages.find((x) => Math.abs(order.indexOf(x) - order.indexOf(bp.stage)) <= 1);
    if (stages.length) check(true, !!near, `Thrived at ${label(STAGES, near || bp.stage)}`, `Thrived at ${stages.map((x) => label(STAGES, x)).join(", ")}`);
  }
  // CRM
  if (bp.crm && bp.crm !== "other") {
    const crm = [d.primary_crm, ...([] as unknown[]).concat(d.primary_crm_platforms ?? [])].filter(Boolean).join(", ").toLowerCase();
    if (crm) check(true, crm.includes(bp.crm), `Runs ${label(CRMS, bp.crm)}`, `Mostly ${String(d.primary_crm || crm.split(",")[0]).trim()}`);
  }
  // GTM motion: from the motions on their skills and any motion specialty they list.
  if (bp.motions.length) {
    const tl = [...(op.allTags || []), String(d.motion_specialty || ""), ...([] as unknown[]).concat(d.motion_focus ?? []).map(String)].join(" | ").toLowerCase();
    const hit = bp.motions.find((m) => MOTION_TEXT[m].test(tl));
    if (MOTION_ANY.test(tl)) check(true, !!hit, `${label(MOTIONS, hit || bp.motions[0])} motion`, `No ${label(MOTIONS, bp.motions[0])} motion listed`);
  }
  // Segment and company size, where the operator lists them
  if (bp.segments.length && d.segment_specialty) {
    const seg = ([] as unknown[]).concat(d.segment_specialty).map(String);
    check(true, bp.segments.some((x) => seg.includes(x)), `${label(SEGMENTS, bp.segments[0])} specialist`, `Focus on ${seg.map((x) => label(SEGMENTS, x)).join(", ")}`);
  }
  const known = matched.length + missed.length;
  if (!known) return { level: "unknown", label: "Not enough profile data", matched, missed, known };
  const share = matched.length / known;
  const level = known >= 2 && share >= 0.67 ? "strong" : share >= 0.34 ? "some" : "low";
  return { level, label: level === "strong" ? "Strong company fit" : level === "some" ? "Some company fit" : "Low company fit", matched, missed, known };
}
