/**
 * Field definitions for Trading Post. Shared by server and client (no Node imports).
 *
 * Three linked records: a company, the fractional engagements at that company, and
 * the people there (decision makers at the company, or people tied to one engagement:
 * who the fractional reported to, worked with, or who is hiring for the seat).
 * Each value is stored once on its own record and shows everywhere it applies.
 *
 * Free fields describe the company and the shape of the work (function, type, start),
 * so the free view is useful on its own. Locked fields are the intel people trade for:
 * the exact role, status, end date, who held the seat, rate, hours, the posting, and
 * people's names and contact details. Adding a missing fact earns 1 credit (max
 * EARN_CAP per rolling 24 hours); unlocking a locked fact someone else added costs 1.
 */
export type Entity = "company" | "engagement" | "contact";
export type FieldKind = "text" | "url" | "email" | "phone" | "month" | "monthOrOngoing" | "number" | "choice";

/** Revenue Nomad standard industry tags (the Talent Signup form's list). */
export const RN_INDUSTRIES = [
  "Agriculture", "Arts", "Construction", "Consumer Goods", "Corporate Services", "Design", "Education",
  "Energy & Mining", "Entertainment", "Finance", "Financial Services", "Hardware & Networking", "Health Care",
  "Legal", "Manufacturing", "Media & Communications", "Nonprofit", "Public Administration", "Public Safety",
  "Real Estate", "Recreation & Travel", "Retail", "SaaS", "Software", "Software & IT Services",
  "Transportation & Logistics", "Web Development Service", "Wellness & Fitness",
];
/** Revenue Nomad standard revenue stage buckets. */
export const RN_REVENUE = ["Pre-revenue", "Under $1M", "$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M+"];
/** Values stored under an older label, mapped to the current one when data loads. */
export const LEGACY_VALUES: Record<string, Record<string, string>> = { revenue: { "< $1M": "Under $1M" } };

/* Revenue Nomad's standard pick lists (same as the platform's buyer profile), so the data lines up. */
export const RN_DEAL_SIZES = ["Under $15K", "$15K–$50K", "$50K–$150K", "$150K+"];
export const RN_SALES_CYCLES = ["Under 5 days", "5–30 days", "30–90 days", "3–6 months", "6–12 months", "12+ months"];
export const RN_MOTIONS = ["PLG", "PLG to sales", "Inside sales", "Enterprise sales", "Channel"];
export const BUSINESS_MODELS = ["B2B", "B2C", "B2B2C"];

/** How the client found the fractional for this seat. */
export const SOURCED_VIA = ["Referral", "Investor intro", "Former colleague", "Inbound", "Platform or marketplace", "Recruiter", "Cold outreach"];
/** What the client hired the fractional to do. */
export const HIRE_REASONS = [
  "Build the first sales motion",
  "Scale an existing team",
  "Replace a departed leader",
  "Fix RevOps or the GTM stack",
  "Launch a new market or product",
  "Turn around missed targets",
  "Prepare for a raise",
];
/** How the seat was paid. Rate benchmarks group by it. */
export const PRICING_MODELS = ["Monthly retainer", "Hourly", "Project fee", "Equity and cash"];
/** Revenue Nomad standard employee count buckets. */
export const RN_EMPLOYEES = ["1–10", "11–50", "51–200", "201–500", "501–1,000", "1,001+"];
/** GTM functions (role categories). Free to see, so members can filter by function without unlocking the role. */
export const FUNCTIONS = [
  "Sales", "Marketing", "RevOps", "Customer Success", "Partnerships", "Growth", "Product Marketing", "Enablement", "Executive", "Other",
];
/** How a person relates to the company or to the fractional who worked there. */
export const RELATIONSHIPS = ["Decision maker", "Reported to", "Reported to me", "Worked with", "Hiring for the seat"];
export const ENGAGEMENT_TYPES = ["Fractional", "Interim", "Advisory", "Project", "Full-time"];
/** Engagement types that count as fractional work (for the fractional-friendly signal). */
export const FRACTIONAL_TYPES = ["Fractional", "Interim", "Advisory", "Project"];
export const STATUSES = ["Open role", "Active", "Ended"];

/** What a company with an active open role is called until the member unlocks it (1 credit). */
export const HIDDEN_COMPANY = "Hidden company";

/** Max credits a member can earn in any rolling 24 hours: fills, invite and confirmation bonuses together. Bonuses past it are held and paid as room opens. */
export const EARN_CAP = 25;
/** Credits for inviting a fellow fractional, paid to both once the new member adds their first fact. */
export const REFERRAL_BONUS = 10;
/** Paid invites per member per 30 days. */
export const REFERRAL_LIMIT = 5;

export interface FieldDef {
  key: string;
  label: string;
  /** Shorter label for table headers. */
  short?: string;
  kind: FieldKind;
  gated: boolean;
  /** Set when the record is created; not fillable in a cell. */
  identity?: boolean;
  /** Set by the system (e.g. where a record came from); shown, never filled. */
  system?: boolean;
  options?: string[];
  placeholder?: string;
  /** One line shown in tooltips and the add form. */
  hint?: string;
}

export interface GroupDef {
  entity: Entity;
  label: string;
  fields: FieldDef[];
}

export const GROUPS: GroupDef[] = [
  {
    entity: "company",
    label: "Company",
    fields: [
      { key: "name", label: "Company", kind: "text", gated: false, identity: true },
      { key: "website", label: "Website", kind: "url", gated: false, placeholder: "acme.com" },
      { key: "industry", label: "Industry", kind: "choice", gated: false, options: RN_INDUSTRIES },
      { key: "employees", label: "Employees", kind: "choice", gated: false, options: RN_EMPLOYEES },
      { key: "revenue", label: "Revenue", kind: "choice", gated: false, options: RN_REVENUE },
      { key: "hq", label: "HQ", kind: "text", gated: false, placeholder: "Chicago, IL" },
      { key: "linkedin", label: "LinkedIn", kind: "url", gated: false, placeholder: "linkedin.com/company/…" },
      { key: "about", label: "About", kind: "text", gated: false, system: true },
      { key: "businessModel", label: "Business model", kind: "choice", gated: false, options: BUSINESS_MODELS },
      { key: "motion", label: "Sales motion", kind: "choice", gated: false, options: RN_MOTIONS },
      { key: "dealSize", label: "Average deal size", short: "Deal size", kind: "choice", gated: false, options: RN_DEAL_SIZES },
      { key: "salesCycle", label: "Average sales cycle", short: "Sales cycle", kind: "choice", gated: false, options: RN_SALES_CYCLES },
    ],
  },
  {
    entity: "engagement",
    label: "Fractional engagement",
    fields: [
      { key: "source", label: "Source", kind: "text", gated: false, system: true },
      { key: "function", label: "Function", kind: "choice", gated: false, options: FUNCTIONS, hint: "The GTM function of the seat" },
      { key: "role", label: "Role", kind: "text", gated: true, placeholder: "Fractional VP Sales", hint: "The exact title of the seat" },
      { key: "type", label: "Type", kind: "choice", gated: false, options: ENGAGEMENT_TYPES },
      { key: "status", label: "Status", kind: "choice", gated: true, options: STATUSES },
      {
        key: "operator",
        label: "Seat holder",
        kind: "text",
        gated: true,
        placeholder: "First and last name",
        hint: "The person's first and last name, like Jane Smith. If they're a member, pick them from the list.",
      },
      { key: "start", label: "Start", kind: "month", gated: false },
      { key: "end", label: "End", kind: "monthOrOngoing", gated: true },
      { key: "reason", label: "Why they hired", short: "Why hired", kind: "choice", gated: false, options: HIRE_REASONS, hint: "What the fractional was brought in to do" },
      { key: "sourced", label: "How it was sourced", short: "Sourced via", kind: "choice", gated: true, options: SOURCED_VIA, hint: "How the client found the fractional" },
      { key: "pricing", label: "Pricing model", short: "Pricing", kind: "choice", gated: false, options: PRICING_MODELS },
      { key: "rate", label: "Rate", kind: "text", gated: true, placeholder: "$8k/mo" },
      { key: "hours", label: "Hours per week", short: "Hrs/wk", kind: "number", gated: true, placeholder: "15" },
      { key: "posting", label: "Job posting", short: "Posting", kind: "url", gated: true, placeholder: "Link to the job post" },
      { key: "revenue", label: "Revenue at the time", short: "Revenue then", kind: "choice", gated: false, options: RN_REVENUE },
      { key: "employees", label: "Employees at the time", short: "Employees then", kind: "choice", gated: false, options: RN_EMPLOYEES },
    ],
  },
  {
    entity: "contact",
    label: "Person",
    fields: [
      { key: "name", label: "Name", kind: "text", gated: true, placeholder: "Jane Doe" },
      { key: "title", label: "Title", kind: "text", gated: false, placeholder: "CEO" },
      { key: "relationship", label: "Relationship", kind: "choice", gated: false, options: RELATIONSHIPS },
      { key: "email", label: "Email", kind: "email", gated: true, placeholder: "jane@acme.com" },
      { key: "phone", label: "Phone", kind: "phone", gated: true, placeholder: "+1 555 010 0000" },
      { key: "linkedin", label: "LinkedIn", kind: "url", gated: true, placeholder: "linkedin.com/in/…" },
    ],
  },
];

export const ALL_FIELDS = GROUPS.flatMap((g) => g.fields.map((f) => ({ entity: g.entity, f, col: `${g.entity}.${f.key}` })));
/** Fields a member can fill (identity and system fields are never filled). */
export const FILLABLE = ALL_FIELDS.filter((x) => !x.f.identity && !x.f.system);

/** Where a record came from. */
export const SOURCES = ["Published engagement", "Member success story", "Demand scan", "Member added", "Clay"] as const;
/** Plain labels for sources in the UI. */
export const SOURCE_LABEL: Record<string, string> = {
  "Published engagement": "Member engagement",
  "Member success story": "Member story",
  "Demand scan": "Open role",
  "Member added": "Member added",
  Clay: "Clay",
};

const FIELD_BY_KEY = new Map<string, FieldDef>(ALL_FIELDS.map((x) => [`${x.entity}.${x.f.key}`, x.f]));
export const fieldDef = (entity: string, key: string): FieldDef | undefined => FIELD_BY_KEY.get(`${entity}.${key}`);

/**
 * Control and bidi-override characters (they can visually reverse nearby text), removed
 * from anything a member types. Line breaks and tabs become spaces first.
 */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;
export const stripInvisible = (raw: unknown) =>
  String(raw ?? "").normalize("NFC").replace(/[\t\n\r\v\f]/g, " ").replace(INVISIBLE, "");

const RATE_RE =
  /[$€£]|\d\s*k\b|\/\s*(hr|h|hour|day|wk|week|mo|month|yr|year|project)\b|\bper\b|\b(hourly|daily|weekly|monthly|annual|retainer|project|usd|eur|gbp)\b/i;

/** Best-guess GTM function from a role title ("Fractional VP Sales" -> "Sales"). */
export function functionOf(role: string | null | undefined): string | null {
  const r = ` ${String(role ?? "").toLowerCase()} `;
  if (!r.trim()) return null;
  const rules: [RegExp, string][] = [
    [/rev ?ops|revenue operations|sales operations|sales ops|marketing operations|gtm operations|operations analyst/, "RevOps"],
    [/enablement|training/, "Enablement"],
    [/product marketing|\bpmm\b/, "Product Marketing"],
    [/partner|alliances|channel|business development|\bbd\b|\bbdr\b/, "Partnerships"],
    [/customer success|\bcs\b|account management|client success|customer experience|\bcx\b|onboarding|support|renewals/, "Customer Success"],
    [/growth|demand gen|acquisition/, "Growth"],
    [/marketing|\bcmo\b|brand|content|communications|\bpr\b/, "Marketing"],
    [/sales|\bcro\b|revenue|account executive|\bae\b|\bsdr\b|commercial|go-to-market|\bgtm\b/, "Sales"],
    [/\bceo\b|\bcoo\b|president|general manager|\bgm\b|founder|managing director|chief of staff|\bcfo\b/, "Executive"],
  ];
  for (const [re, fn] of rules) if (re.test(r)) return fn;
  return null;
}

/** Map a raw employee count to the Revenue Nomad bucket. */
export function employeesBucket(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n <= 10) return "1–10";
  if (n <= 50) return "11–50";
  if (n <= 200) return "51–200";
  if (n <= 500) return "201–500";
  if (n <= 1000) return "501–1,000";
  return "1,001+";
}

/** Normalize and validate a value for a field. Returns the clean value or an error message. */
/** A person's first and last name: two or more words of letters (with ' - . allowed), no digits or emails. */
export const PERSON_NAME_RE = /^(?=.{3,60}$)\p{L}[\p{L}'’.-]*(?: \p{L}[\p{L}'’.-]*)+$/u;

export function cleanValue(f: FieldDef, raw: unknown): { value?: string; error?: string } {
  const v = stripInvisible(raw).trim().replace(/\s+/g, " ").slice(0, 200);
  if (!v) return { error: `${f.label} is empty.` };
  switch (f.kind) {
    case "url": {
      const u = v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
      return /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(u) ? { value: u } : { error: "That doesn't look like a web address." };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? { value: v.toLowerCase() } : { error: "That doesn't look like an email." };
    case "phone":
      return v.replace(/\D/g, "").length >= 7 ? { value: v } : { error: "That doesn't look like a phone number." };
    case "month":
    case "monthOrOngoing": {
      if (f.kind === "monthOrOngoing" && /^ongoing$/i.test(v)) return { value: "Ongoing" };
      if (!/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(v)) return { error: f.kind === "month" ? "Use a month (YYYY-MM)." : "Pick an end month, or Ongoing." };
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      if (Number(v.slice(0, 4)) < 1970 || (v.length === 4 ? v > thisMonth.slice(0, 4) : v > thisMonth)) return { error: "That date is in the future." };
      return { value: v };
    }
    case "number":
      return /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 80 ? { value: v } : { error: "Use hours per week between 1 and 80." };
    case "choice":
      return f.options?.includes(v) ? { value: v } : { error: "Pick one of the options." };
    default:
      if (f.key === "rate" && !(/\d/.test(v) && RATE_RE.test(v))) return { error: "Use a rate like $8k/mo or $150/hr." };
      if (f.key === "operator" && !PERSON_NAME_RE.test(v)) return { error: "Use their first and last name, like Jane Smith." };
      return v.length >= 2 ? { value: v } : { error: "Too short." };
  }
}
