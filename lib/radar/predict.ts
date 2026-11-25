/**
 * Crystal Ball's likelihood and timing: how likely a company is to hire a fractional in a given
 * function next, and when. Pure: no state, no network, so the radar, the back-test
 * (scripts/backtest-crystal.mts) and the checks (scripts/test-predict.mts) run it as it is.
 *
 * Source: Revenue Nomad research, 2026 (fractional hiring by revenue stage: the stage-by-role
 * propensity matrix, sixteen transition rules with probability ranges and typical gaps, the
 * buyer mix by company type, and the predictive signals). The research's numbers are modeled
 * priors, not measured rates, so they are a starting point: Merlin's own seat records move them
 * (a Beta prior worth PRIOR_WEIGHT observations, posterior mean used, see posterior).
 *
 *   P(next = B | last seat A, stage, ownership)
 *     a transition rule that matches the stage, the ownership type and A, and names B: its midpoint
 *     (times B's share when the rule names several seats, "sales leader or CMO");
 *     else the propensity matrix as a fallback: REPEAT_RATE (a company coming back for another seat)
 *     spread over the functions by their share at that stage, A left out.
 *   Ownership unknown: the types blended by the research's buyer mix (BUYER_MIX).
 *   Stage unknown: the six stages blended evenly.
 *   timing(t): how strong the signal is t months after A started, from the rule's gap window.
 *   band: High, Medium or Low from the final score, never a percentage.
 */
import { GTM_FUNCTIONS } from "../tableFields";

/* ---------- stages and ownership ---------- */

/** Revenue Nomad's revenue stages (RN_REVENUE), the stage bands the research uses. */
export const STAGES = ["Pre-revenue", "Under $1M", "$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M+"] as const;
export type Stage = (typeof STAGES)[number];
export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);
const [PRE, U1, S1_5, S5_20, S20_50, S50] = STAGES;

/** Ownership as the rules read it. The company fact's values (OWNERSHIP_TYPES) map onto these. */
export type Owner = "vc" | "boot" | "pe" | "family" | "public" | "nonprofit";
export const OWNERS: Owner[] = ["vc", "boot", "pe", "family", "public", "nonprofit"];
export const OWNER_OF: Record<string, Owner> = { "VC-backed": "vc", Bootstrapped: "boot", "PE-backed": "pe", "Family-owned": "family", Public: "public", "Non-profit": "nonprofit" };
/** The company fact's value as an Owner, or null for Unknown (nothing on file). */
export const ownerOf = (v: string | null | undefined): Owner | null => (v ? OWNER_OF[v] ?? null : null);

/**
 * Unknown ownership: the research's buyer mix of fractional postings (early-stage VC 36%,
 * growth-stage VC 11%, bootstrapped 13%, non-profit 7%, PE-backed 2%, public 1%), normalized over
 * these. Family-owned is not in the mix, so it weighs nothing here.
 */
export const BUYER_MIX: Record<Owner, number> = (() => {
  const raw: Record<Owner, number> = { vc: 36 + 11, boot: 13, nonprofit: 7, pe: 2, public: 1, family: 0 };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  return Object.fromEntries(OWNERS.map((o) => [o, raw[o] / sum])) as Record<Owner, number>;
})();

/* ---------- the propensity matrix (fallback prior) ---------- */

/** The research's role families. */
type Family = "finance" | "marketing" | "engineering" | "sales" | "operations" | "people" | "product" | "revops" | "dataAi" | "security" | "legal" | "cs" | "other";

/**
 * Each family's share of a stage's fractional seats, in percent, in STAGES order (the research's
 * stage-by-role propensity matrix, as given: modeled priors).
 */
export const PROPENSITY: Record<Family, readonly number[]> = {
  finance: [12, 16, 20, 18, 20, 22],
  marketing: [15, 20, 20, 18, 15, 12],
  engineering: [30, 22, 13, 12, 8, 8],
  sales: [5, 10, 13, 10, 10, 10],
  operations: [5, 7, 10, 12, 12, 15],
  people: [3, 3, 6, 10, 10, 10],
  product: [10, 7, 4, 3, 2, 1],
  revops: [0, 2, 5, 6, 6, 4],
  dataAi: [8, 5, 3, 3, 5, 7],
  security: [0, 1, 2, 3, 5, 6],
  legal: [5, 3, 2, 3, 4, 4],
  cs: [0, 1, 1, 2, 3, 2],
  other: [7, 3, 1, 0, 0, 1],
};

/**
 * Research role families on Merlin's functions, with the share of the family each one takes.
 * One-to-one where the names agree. The splits are judgment calls, marked:
 */
export const FAMILY_FUNCTIONS: Record<Family, Record<string, number>> = {
  finance: { Finance: 1 },
  // Judgment: the family spans CMO, demand gen, brand and PMM; Merlin files growth leads and product marketing apart.
  marketing: { Marketing: 0.75, Growth: 0.15, "Product Marketing": 0.1 },
  engineering: { Technology: 1 },
  // Judgment: partnership and channel leads sit on the sales side of the research's "sales leadership".
  sales: { Sales: 0.85, Partnerships: 0.15 },
  // Judgment: chiefs of staff and EOS integrators are often titled as executives on Merlin.
  operations: { Operations: 0.85, Executive: 0.15 },
  people: { People: 1 },
  product: { Product: 1 },
  revops: { RevOps: 1 },
  // Judgment: a Chief AI Officer or data lead files as AI GTM when the work is go-to-market, as Technology when it is not; half each.
  dataAi: { "AI GTM": 0.5, Technology: 0.5 },
  // A CISO is a Technology seat on Merlin (lib/tableFields.ts functionOf).
  security: { Technology: 1 },
  legal: { Legal: 1 },
  cs: { "Customer Success": 1 },
  // Judgment: the research's "Other" is enablement, a fractional CEO, design and project managers.
  other: { Enablement: 0.4, Executive: 0.3, Other: 0.3 },
};

/** A pair the matrix puts at 0% still happens now and then: never quite zero. */
const PROPENSITY_FLOOR = 0.005;

/** A function's share of a stage's fractional seats (0..1), from the matrix. Stage unknown: the six stages evenly. */
export function propensity(fn: string, stage: Stage | null): number {
  const at = (i: number) => {
    let p = 0;
    for (const [fam, split] of Object.entries(FAMILY_FUNCTIONS) as [Family, Record<string, number>][]) p += ((PROPENSITY[fam][i] ?? 0) / 100) * (split[fn] ?? 0);
    return Math.max(PROPENSITY_FLOOR, p);
  };
  if (stage) return at(STAGES.indexOf(stage));
  return STAGES.reduce((sum, _s, i) => sum + at(i), 0) / STAGES.length;
}

/**
 * How often a company comes back for another fractional seat, "usually for a different function"
 * (the research: 24% of postings come from repeat clients). Spread over the functions by their
 * share, it is the chance of a pair no rule names.
 */
export const REPEAT_RATE = 0.24;
/** The window used when no rule names the pair: the research's "existing seat passes 6 to 9 months, a second seat follows within 0 to 6". */
export const FALLBACK_GAP: Gap = [3, 12];

/** "2025-06" or "2025": the earliest and latest month index it can mean (a year alone is any of its months). Null when it isn't one. */
export function monthSpan(v: string | null | undefined): { from: number; to: number } | null {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  if (m[2]) {
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return { from: y * 12 + mo - 1, to: y * 12 + mo - 1 };
  }
  return { from: y * 12, to: y * 12 + 11 };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar 2026", or "2025" for a year alone. */
export const monthWords = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? `${MONTH_NAMES[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}` : v.slice(0, 4));

/* ---------- the transition rules ---------- */

/** Months from the last seat's start to the next one: [earliest, latest] of the typical gap. */
export type Gap = readonly [number, number];

export interface Rule {
  /** The research's rule number. */
  n: number;
  stages: readonly Stage[];
  /** "any": every ownership type. Otherwise the types it holds for. */
  owners: "any" | readonly Owner[];
  /** The last fractional seat's function: Merlin functions, "gtm" (any GTM seat), "any" (any leadership seat), "none" (no fractional seat yet). */
  from: readonly string[] | "gtm" | "any" | "none";
  /** The next seat, with its share when the rule names several ("sales leader or CMO"). */
  to: Record<string, number>;
  /** The research's estimated probability, low and high. The midpoint is used. */
  p: readonly [number, number];
  gap: Gap;
  /** One short line from the research's evidence. */
  why: string;
  /** Holds only when this is also true of the company. */
  needs?: "headcount" | "b2b" | "founderLed";
  /** Same function before and after: never a cross-function prediction (kept for the record). */
  same?: boolean;
  /** Needs a fact Merlin has no way to read yet (years into a PE hold). Never used. */
  inactive?: boolean;
}

const VC: Owner[] = ["vc"];
// Judgment: the research's "bootstrapped or founder-owned" includes family-owned companies.
const BOOT: Owner[] = ["boot", "family"];
const PE: Owner[] = ["pe"];
const MKT = ["Marketing", "Growth"];

/**
 * The research's sixteen transition rules. Role families map to functions as FAMILY_FUNCTIONS says
 * ("CTO or engineering lead" is Technology, "CRO or VP Sales" is Sales, "marketing ops" is RevOps,
 * "CISO" is Technology, "recruiting or TA" is People, "GC" is Legal). Where a rule names two seats
 * ("A or B"), each gets an even share unless noted.
 */
export const RULES: readonly Rule[] = [
  // Judgment: "marketing or growth lead" splits 70/30 between Marketing and Growth.
  { n: 1, stages: [PRE, U1], owners: VC, from: ["Technology"], to: { Marketing: 0.7, Growth: 0.3 }, p: [0.35, 0.45], gap: [3, 9], why: "engineering, then marketing, are the top early-stage VC seats" },
  { n: 2, stages: [U1], owners: VC, from: MKT, to: { Finance: 1 }, p: [0.25, 0.35], gap: [3, 6], why: "finance comes in ahead of a priced round" },
  { n: 3, stages: [S1_5], owners: "any", from: ["Finance"], to: { Finance: 1 }, p: [0.4, 0.5], gap: [0, 3], why: "a controller makes the CFO's work pay off", same: true },
  { n: 4, stages: [S1_5], owners: BOOT, from: ["Finance"], to: { Sales: 0.5, Marketing: 0.5 }, p: [0.3, 0.4], gap: [3, 9], why: "a CFO's pricing and margin work shows the growth gap" },
  { n: 5, stages: [S1_5], owners: "any", from: MKT, to: { Sales: 1 }, p: [0.2, 0.3], gap: [4, 9], why: "marketing pipeline shows where founder-led selling stalls" },
  { n: 6, stages: [S1_5, S5_20], owners: "any", from: ["Sales"], to: { RevOps: 1 }, p: [0.35, 0.45], gap: [1, 4], why: "a sales playbook needs the CRM and forecasting work" },
  // Judgment: "recruiting or TA, then sales enablement" splits 60/40 between People and Enablement.
  { n: 7, stages: [S5_20], owners: "any", from: ["Sales"], to: { People: 0.6, Enablement: 0.4 }, p: [0.25, 0.35], gap: [2, 6], why: "a rebuilt playbook leads to hiring reps" },
  { n: 8, stages: [S5_20], owners: "any", from: MKT, to: { RevOps: 1 }, p: [0.25, 0.35], gap: [3, 6], why: "revenue that can't be traced to programs needs marketing ops" },
  { n: 9, stages: [S5_20], owners: "any", from: "gtm", to: { People: 1 }, p: [0.25, 0.35], gap: [3, 12], why: "fractional HR comes in at 25 to 50 people", needs: "headcount" },
  { n: 10, stages: [S5_20], owners: "any", from: ["Finance", ...MKT], to: { Operations: 1 }, p: [0.15, 0.25], gap: [6, 12], why: "founder-led companies add an integrator", needs: "founderLed" },
  { n: 11, stages: [S1_5, S5_20], owners: "any", from: ["Technology", "Sales"], to: { Technology: 1 }, p: [0.15, 0.25], gap: [1, 3], why: "the first enterprise security review needs a CISO", needs: "b2b" },
  { n: 12, stages: [S5_20, S20_50], owners: "any", from: ["Finance"], to: { Legal: 1 }, p: [0.1, 0.2], gap: [3, 12], why: "fundraising, deals and contract volume bring in a GC" },
  { n: 13, stages: STAGES, owners: PE, from: "none", to: { Finance: 1 }, p: [0.5, 0.65], gap: [0, 3], why: "sponsors replace the CFO early in most deals" },
  { n: 14, stages: STAGES, owners: PE, from: ["Finance"], to: { Sales: 1 / 3, Marketing: 1 / 3, People: 1 / 3 }, p: [0.3, 0.4], gap: [3, 12], why: "PE playbooks add a CRO, CMO or CHRO in the first 100 days" },
  // Judgment: an AI or data lead splits evenly between AI GTM and Technology (see FAMILY_FUNCTIONS).
  { n: 15, stages: [S20_50, S50], owners: "any", from: "any", to: { "AI GTM": 0.5, Technology: 0.5 }, p: [0.1, 0.2], gap: [3, 12], why: "AI-titled fractional seats are rising" },
  { n: 16, stages: STAGES, owners: PE, from: "any", to: { Finance: 1 }, p: [0.3, 0.4], gap: [12, 18], why: "an exit-focused CFO comes in before a sale", inactive: true },
];

/** What a rule's conditions read about a company, when known. */
export interface CompanyFacts {
  employees?: string | null;
  businessModel?: string | null;
}

const fromMatches = (r: Rule, from: string | null) =>
  r.from === "none" ? from === null : from === null ? false : r.from === "any" ? true : r.from === "gtm" ? GTM_FUNCTIONS.includes(from) : r.from.includes(from);
const needsHold = (r: Rule, owner: Owner, co: CompanyFacts) => {
  switch (r.needs) {
    case undefined:
      return true;
    // Passing 25 to 50 people: the 11–50 and 51–200 bands (unknown counts, the rule is still a prior).
    case "headcount":
      return !co.employees || co.employees === "11–50" || co.employees === "51–200";
    // Selling to businesses (unknown counts).
    case "b2b":
      return co.businessModel !== "B2C";
    // Judgment: founder-led means not PE-backed, public or a non-profit.
    case "founderLed":
      return owner === "vc" || owner === "boot" || owner === "family";
  }
};

/** The rules that hold for a stage, an ownership type and a last seat (null: no fractional seat yet). */
export function rulesFor(stage: Stage, owner: Owner, from: string | null, co: CompanyFacts = {}): Rule[] {
  return RULES.filter((r) => !r.inactive && r.stages.includes(stage) && (r.owners === "any" || r.owners.includes(owner)) && fromMatches(r, from) && needsHold(r, owner, co));
}

/** One prior: the probability, its window, and the rule behind it (null: the propensity matrix). */
export interface Prior {
  p: number;
  gap: Gap;
  rule: Rule | null;
}

const mid = (r: Rule) => (r.p[0] + r.p[1]) / 2;

/** The prior for one stage and ownership type. */
function priorAt(from: string | null, to: string, stage: Stage, owner: Owner, co: CompanyFacts): Prior {
  let best: Prior | null = null;
  for (const r of rulesFor(stage, owner, from, co)) {
    const share = r.to[to];
    if (!share || r.same || from === to) continue;
    const p = mid(r) * share;
    if (!best || p > best.p) best = { p, gap: r.gap, rule: r };
  }
  if (best) return best;
  const left = from ? 1 - propensity(from, stage) : 1;
  return { p: (REPEAT_RATE * propensity(to, stage)) / Math.max(0.2, left), gap: FALLBACK_GAP, rule: null };
}

/**
 * P(the next fractional seat is `to` | the last one was `from`), before Merlin's own data. Stage
 * null: the stages evenly. Owner null (Unknown): the types by BUYER_MIX. The window and the rule are
 * the ones that carry the most of the blend.
 */
export function prior(from: string | null, to: string, stage: Stage | null, owner: Owner | null, co: CompanyFacts = {}): Prior {
  const stages: [Stage, number][] = stage ? [[stage, 1]] : STAGES.map((s) => [s, 1 / STAGES.length]);
  const owners: [Owner, number][] = owner ? [[owner, 1]] : OWNERS.filter((o) => BUYER_MIX[o] > 0).map((o) => [o, BUYER_MIX[o]]);
  let p = 0;
  let lead: { w: number; x: Prior } | null = null;
  for (const [s, ws] of stages)
    for (const [o, wo] of owners) {
      const x = priorAt(from, to, s, o, co);
      const w = ws * wo;
      p += w * x.p;
      const carry = w * x.p * (x.rule ? 1 : 0.5);
      if (!lead || carry > lead.w) lead = { w: carry, x };
    }
  return { p, gap: lead!.x.gap, rule: lead!.x.rule };
}

/* ---------- Merlin's own data ---------- */

/** Pseudo-observations the research's prior is worth against Merlin's counts. */
export const PRIOR_WEIGHT = 20;

/** Observed transitions A -> B, by stage band ("all" pools every stage, and seats with no stage on file). Counts only. */
export interface TransitionCounts {
  byStage: Record<string, Record<string, Record<string, number>>>;
  /** Transitions counted, and companies they came from. */
  total: number;
  companies: number;
}
export const emptyCounts = (): TransitionCounts => ({ byStage: {}, total: 0, companies: 0 });

/** One fractional or interim leadership seat, as the counting reads it. `ym`: its start ("2025-03", or a year). `stage`: revenue at its start, else the company's band. */
export interface SeatPoint {
  companyId: string;
  fn: string;
  ym: string;
  stage: Stage | null;
}

/** "2025-03" -> months since year 0; a year alone is its first month. */
export const monthIndex = (ym: string): number | null => {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(ym);
  return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0) : null;
};

/**
 * Count A -> B per company: seats ordered by start month, and for each seat A the next seat in a
 * different function that starts after it. Filed under B's stage (the stage when the company made
 * the next hire) and under "all". `before` (a month index): only seats that started before it.
 */
export function countTransitions(seats: SeatPoint[], before = Infinity): TransitionCounts {
  const out = emptyCounts();
  const by = new Map<string, { fn: string; m: number; stage: Stage | null }[]>();
  for (const x of seats) {
    const m = monthIndex(x.ym);
    if (m === null || m >= before) continue;
    const l = by.get(x.companyId) ?? [];
    l.push({ fn: x.fn, m, stage: x.stage });
    by.set(x.companyId, l);
  }
  const bump = (stage: string, a: string, b: string) => {
    const s = (out.byStage[stage] ??= {});
    const r = (s[a] ??= {});
    r[b] = (r[b] ?? 0) + 1;
  };
  for (const list of by.values()) {
    list.sort((a, b) => a.m - b.m || a.fn.localeCompare(b.fn));
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const first = list.find((x) => x.fn !== a.fn && x.m > a.m);
      if (!first) continue;
      // Two seats in other functions that start in the same month (a co-hire) both come next.
      const next = new Map<string, Stage | null>();
      for (const x of list) if (x.m === first.m && x.fn !== a.fn && !next.has(x.fn)) next.set(x.fn, x.stage);
      any = true;
      for (const [fn, stage] of next) {
        out.total++;
        bump("all", a.fn, fn);
        if (stage) bump(stage, a.fn, fn);
      }
    }
    if (any) out.companies++;
  }
  return out;
}

/** Transitions seen at other stages count this much toward a stage's estimate (a stage with few of its own still learns from the rest). */
export const OTHER_STAGES_WEIGHT = 0.5;

/**
 * The posterior mean of P(A -> B) at a stage: the prior as a Beta worth PRIOR_WEIGHT observations,
 * updated with the transitions out of A counted there (k of n went to B). Most stages have few
 * transitions of their own, so the ones counted at other stages come in first at
 * OTHER_STAGES_WEIGHT each (the stage's own then update that). Stage null: every count, whole.
 */
export function posterior(p0: number, counts: TransitionCounts | null | undefined, from: string | null, to: string, stage: Stage | null): number {
  if (!counts || !from) return p0;
  const kn = (row: Record<string, number> | undefined) => ({ k: row?.[to] ?? 0, n: Object.values(row ?? {}).reduce((a, b) => a + b, 0) });
  const all = kn(counts.byStage.all?.[from]);
  const beta = (p: number, k: number, n: number, w = 1) => (p * PRIOR_WEIGHT + w * k) / (PRIOR_WEIGHT + w * n);
  if (!stage) return beta(p0, all.k, all.n);
  const own = kn(counts.byStage[stage]?.[from]);
  const p1 = beta(p0, Math.max(0, all.k - own.k), Math.max(0, all.n - own.n), OTHER_STAGES_WEIGHT);
  return beta(p1, own.k, own.n);
}

/** The model's answer for one pair: the probability after Merlin's data, and the window and rule behind it. */
export interface Likelihood extends Prior {
  prior: number;
}
export function likelihood(from: string | null, to: string, stage: Stage | null, owner: Owner | null, co: CompanyFacts = {}, counts?: TransitionCounts | null): Likelihood {
  const pr = prior(from, to, stage, owner, co);
  return { ...pr, prior: pr.p, p: posterior(pr.p, counts, from, to, stage) };
}

/* ---------- timing ---------- */

/** Strength while the window hasn't opened yet: it rises from here to 1 at the window's start. */
export const TIMING_RISE_FROM = 0.4;
/** Strength once the window has passed (after a 3-month decay): low, not zero. */
export const TIMING_TAIL = 0.15;
/** After the window, the tail lasts this long (counted from the seat's start, or the window's end plus 6 when later). */
export const TIMING_TAIL_MONTHS = 12;

/**
 * How strong a signal is `t` months after the seat (or the event) it reads: a trapezoid over the
 * rule's gap window. It rises into the window, is 1 inside it, falls over 3 months after it, then
 * stays low (TIMING_TAIL) until TIMING_TAIL_MONTHS, and is 0 after that.
 */
export function timing(t: number, gap: Gap): number {
  const [a, b] = gap;
  if (!Number.isFinite(t) || t < 0) t = 0;
  if (t < a) return TIMING_RISE_FROM + (1 - TIMING_RISE_FROM) * (t / a);
  if (t <= b) return 1;
  if (t <= b + 3) return 1 - (1 - TIMING_TAIL) * ((t - b) / 3);
  return t <= Math.max(TIMING_TAIL_MONTHS, b + 6) ? TIMING_TAIL : 0;
}

/** Every month a hire's window can open at (the rules' and the fallback's earliest, above 0): where a re-surfaced hire is looked for. */
export const GAP_STARTS: readonly number[] = [...new Set([...RULES.filter((r) => !r.inactive).map((r) => r.gap[0]), FALLBACK_GAP[0]])].filter((a) => a > 0).sort((a, b) => a - b);

/** A stable number for a string (FNV-1a, 32 bits): the same day for the same seat on every run, on every server. */
export function stableHash(v: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A day inside month index `k` (months since year 0), at 00:00 UTC: the first without a `salt`,
 * else a day spread over the month by a stable hash of it (the company and seat), so a month's
 * calendar signals arrive a few each day instead of all on the 1st. Still inside month k: the
 * timing curve, which counts whole months, reads the same on any day of it.
 */
export function dayInMonthMs(k: number, salt?: string): number {
  const y = Math.floor(k / 12);
  const mo = k - y * 12;
  if (!salt) return Date.UTC(y, mo, 1);
  const days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return Date.UTC(y, mo, 1 + (stableHash(`${salt}:${k}`) % days));
}

/**
 * When the window `a` months after a hire's start month opens: a day in that month (UTC), the
 * first without a `salt`, else spread by the seat (dayInMonthMs). Signals and scoring pass the
 * seat's internal id, so both read the same day.
 */
export function windowOpensMs(ym: string, a: number, salt?: string): number {
  const m = monthIndex(ym);
  if (m === null) return NaN;
  return dayInMonthMs(m + a, salt);
}

/* ---------- functions with thin priors ---------- */

/**
 * A function the research's rules seldom name as the next seat (Growth, Customer Success,
 * Partnerships, AI GTM, Product…) has a small likelihood from every hire before it, so its
 * members got no adjacent signal at all, or only Low ones. Its likelihood is read against the
 * best its own priors ever reach: lifted by THIN_REF over that ceiling, at most THIN_MAX_LIFT
 * times, and never past Medium on the lift alone (a lifted score stays under HIGH_AT).
 */
export const THIN_REF = 0.05;
export const THIN_MAX_LIFT = 4;
const ceilingMemo = new Map<string, number>();
/** The highest prior any other function's hire gives `fn` (stage and ownership unknown). */
export function priorCeiling(fn: string): number {
  let c = ceilingMemo.get(fn);
  if (c === undefined) {
    c = 0;
    for (const from of Object.values(FAMILY_FUNCTIONS).flatMap((x) => Object.keys(x))) if (from !== fn) c = Math.max(c, prior(from, fn, null, null).p);
    ceilingMemo.set(fn, c);
  }
  return c;
}
/** How much `fn`'s likelihoods are lifted: 1 for a function the rules name often, up to THIN_MAX_LIFT. */
export const thinLift = (fn: string) => Math.min(THIN_MAX_LIFT, Math.max(1, THIN_REF / Math.max(1e-6, priorCeiling(fn))));

/* ---------- bands ---------- */

export type Band = "High" | "Medium" | "Low";
/** A score at or over this is High, and over MEDIUM_AT Medium. Low stays off the email (it is still on the page). */
export const HIGH_AT = 0.25;
export const MEDIUM_AT = 0.1;
export const bandOf = (score: number): Band => (score >= HIGH_AT ? "High" : score >= MEDIUM_AT ? "Medium" : "Low");
/** Scores under this are noise: not even on the page. */
export const SCORE_FLOOR = 0.015;

/* ---------- the signals that are not a hire ---------- */

/**
 * What a signal other than a hire predicts, per function: its probability and window. From the
 * research's predictive signals; the probabilities for "Medium" and "Strong" signals are judgment
 * calls (the research gives a strength, not a rate).
 */
export const SIGNAL_PRIORS: Record<string, Record<string, { p: number; gap: Gap; why: string }>> = {
  // "Founder still the only seller; first 2-3 AE job posts": a fractional sales leader, then RevOps (Medium, 3-9 months).
  "sales-build": {
    Sales: { p: 0.35, gap: [3, 9], why: "a fractional Sales leader usually follows" },
    RevOps: { p: 0.2, gap: [4, 12], why: "RevOps usually follows the first sales hires" },
  },
  // "Job posts for SDRs or AEs rising": recruiting, enablement, RevOps (Medium, 1-6 months).
  "sales-jump": {
    Sales: { p: 0.3, gap: [3, 9], why: "a fractional Sales leader usually follows" },
    RevOps: { p: 0.2, gap: [1, 6], why: "RevOps usually follows a sales hiring push" },
    People: { p: 0.15, gap: [1, 6], why: "recruiting help usually follows a sales hiring push" },
    Enablement: { p: 0.15, gap: [1, 6], why: "enablement usually follows a sales hiring push" },
  },
  // "CFO, VP Sales or CMO departure": interim or fractional cover for that seat (Strong, 0-2 months).
  departure: { "*": { p: 0.55, gap: [0, 2], why: "interim or fractional cover usually follows" } },
  // "Priced funding round": CFO or FP&A, then CMO and a sales leader (Strong, 0-6 months).
  funding: {
    Finance: { p: 0.35, gap: [0, 6], why: "finance usually follows a round" },
    Marketing: { p: 0.3, gap: [0, 6], why: "marketing usually follows a round" },
    Sales: { p: 0.3, gap: [0, 6], why: "a sales leader usually follows a round" },
  },
};

/* ---------- calendar signals: a seat's tenure, and hiring again after one ended ---------- */

/**
 * How long fractional seats last, from Merlin's ended seats (the owner's sheet, 2026: ended
 * fractional seats last a median 12 months, an average 19). An active seat reaching one of these
 * marks is at the point where seats like it usually end, so its function may come up again there
 * (a replacement): a signal for members in that function, said to be based on typical tenure.
 * Judgment on p: about half of seats have ended by the median; a company whose seat ends hires
 * again in about a quarter of cases (REPEAT_RATE), usually in another function, so a replacement
 * in the same one within the next half year is put under a fifth, and lower again at the average.
 */
export const TENURE_MARKS = [12, 19] as const;
export type TenureMark = (typeof TENURE_MARKS)[number];
export const TENURE_PRIOR: Record<TenureMark, { p: number; gap: Gap; words: string }> = {
  12: { p: 0.18, gap: [0, 6], words: "ended fractional seats last a median 12 months" },
  19: { p: 0.12, gap: [0, 6], words: "the average ended fractional seat lasted 19 months" },
};
/** Past this many months in, an active seat's tenure says nothing more (its standing state stops). */
export const TENURE_UNTIL = 24;

/**
 * A company whose fractional seat ended between these many months ago has hired fractionals
 * before: past the first, a signal for that function and the functions the rules say follow it.
 */
export const REHIRE_MONTHS: Gap = [3, 24];
/**
 * The same function again after an ended seat. Judgment: repeat clients are about a quarter of
 * fractional postings (REPEAT_RATE) and "usually for a different function", so the same function
 * gets under that.
 */
export const REHIRE_SAME_P = 0.15;
/** A function the transition rules name after the ended seat's: the rule's likelihood times this (the seat is over, its window measured from its start mostly gone). */
export const REHIRE_NEXT_SHARE = 0.5;

/* ---------- signals read from the company's website, career feed and size ---------- */

/**
 * A new full-time leader on the company's own team page (read OK both times): what it predicts for
 * other functions. Judgment, from the owner's rule ("a new CRO often brings in RevOps or
 * enablement help") and rules 6 and 8's pairs (a sales leader then RevOps, marketing then
 * marketing ops), discounted because the new leader is full-time, not a fractional seat. A new
 * leader in the member's own function lowers the odds instead (match.ts: a full-time leader known).
 */
export const ARRIVAL_PRIORS: Record<string, Record<string, { p: number; gap: Gap; why: string }>> = {
  Sales: {
    RevOps: { p: 0.25, gap: [0, 6], why: "RevOps help often follows a new sales leader" },
    Enablement: { p: 0.15, gap: [0, 6], why: "enablement help often follows a new sales leader" },
  },
  Marketing: { RevOps: { p: 0.15, gap: [0, 6], why: "marketing ops help often follows a new marketing leader" } },
};

/**
 * Full-time hiring in a function (the career feed's counts rose: lib/table.ts noteTeamHires): a
 * fractional leader above the new team, or senior fractional help beside it. Judgment: the
 * research gives this only for sales ("first 2-3 AE job posts", SIGNAL_PRIORS "sales-build"); the
 * other functions get a smaller prior, and a full-time leader of the function known there keeps it
 * on the page only.
 */
export const TEAM_PRIORS: Record<string, { p: number; gap: Gap; why: string }> = {
  Marketing: { p: 0.2, gap: [0, 6], why: "a marketing team being hired can need fractional marketing leadership or senior help" },
  Technology: { p: 0.15, gap: [0, 6], why: "an engineering team being hired can need fractional technology leadership" },
  Finance: { p: 0.2, gap: [0, 6], why: "a finance team being hired can need fractional finance leadership" },
  People: { p: 0.2, gap: [0, 6], why: "a recruiting push can need fractional people leadership" },
  "Customer Success": { p: 0.2, gap: [0, 6], why: "a customer success team being hired can need fractional CS leadership" },
};
/** The functions the career feeds count full-time hires in, besides sales (sales-build). */
export const TEAM_FUNCTIONS = Object.keys(TEAM_PRIORS);

/**
 * The company's size band rose (State.headcount, read the day it changed). Rule 9: "fractional HR
 * comes in at 25 to 50 people" (p 0.25-0.35). Into 51–200 it has just passed 50: the rule's
 * midpoint, soon. Into 11–50 it is on the way to 25: less, and later.
 */
export const HEADCOUNT_PRIORS: Record<string, Record<string, { p: number; gap: Gap; why: string }>> = {
  "11–50": { People: { p: 0.1, gap: [0, 12], why: "fractional HR usually comes in at 25 to 50 people" } },
  "51–200": { People: { p: 0.3, gap: [0, 6], why: "fractional HR usually comes in at 25 to 50 people" } },
};
/** Bands in order, to tell a rise from a fall. */
export const SIZE_BANDS = ["1–10", "11–50", "51–200", "201–500", "501–1,000", "1,001+"];

/**
 * A leadership gap (a state): the company's own team page (read OK, in the last KNOWN_DAYS) shows
 * no leader in a function, no fractional seat in it is on file, and at its revenue stage the
 * research's propensity matrix gives the function at least GAP_MIN_SHARE of fractional seats.
 * Scored at that share (a prior, judgment: the matrix is a share of seats, not a rate), never High.
 */
export const GAP_FUNCTIONS = ["Finance", "Marketing", "Sales", "Technology", "Operations", "People"];
export const GAP_MIN_SHARE = 0.1;
/** Stages a missing leader is read at: with revenue, from $1M. */
export const GAP_STAGES: readonly Stage[] = [S1_5, S5_20, S20_50, S50];
/** Sizes it is read at: not a company of ten or fewer. */
export const GAP_MIN_BAND = "11–50";

/* ---------- words ---------- */

const LEAD: Record<string, string> = { Sales: "CRO", Marketing: "CMO", Finance: "CFO", Technology: "CTO", Operations: "COO", People: "Head of People", Product: "CPO", Legal: "GC" };
/** "CMO", "RevOps leader": how a fractional leadership seat in a function reads in a line. */
export const leadWord = (fn: string) => LEAD[fn] ?? `${fn} leader`;
/** "this month", "1 month ago", "5 months ago". */
export const agoWords = (months: number) => (months <= 0 ? "this month" : months === 1 ? "1 month ago" : `${months} months ago`);
/** A rule's window in words. Internal (checks and comments): never in a member-facing line, see noWindow. */
export const gapWords = (g: Gap) => (g[0] <= 0 ? `within ${g[1]} months` : `in ${g[0]}–${g[1]} months`);
/**
 * A why-now line without a predicted window ("usually follows in 3–9 months" reads "usually
 * follows"): the window still weighs the score, but a member never sees it (owner, 2026-11-25:
 * Merlin has no validated outcome data, so a timeline would be false precision). Also cleans lines
 * kept from before.
 */
export const noWindow = (line: string) =>
  line
    .replace(/ (?:within \d+ months?|in \d+(?:–|-| to )\d+ months)(?=$| ·|[.,;])/g, "")
    .replace(/the usual \d+(?:–|-| to )\d+ month window/g, "the usual window");

/** After a window closes, a hire still says something for this many months (timing's fall); past that it says nothing on a card. */
export const WINDOW_GRACE = 3;
/** The window has passed: more months since the hire than its window's end. */
export const windowPassed = (months: number, gap: Gap) => months > gap[1];
/** Too long past the window for a card at all. */
export const windowGone = (months: number, gap: Gap) => months > gap[1] + WINDOW_GRACE;

/**
 * The why-now line for an adjacent hire: "Fractional CMO hired 5 months ago · Sales usually follows
 * in 4–9 months". Once the window has passed it says so ("… · the usual 3–12 month window for
 * Sales has passed"), never "16 months ago, can follow in 3–12".
 */
export function hireWhyNow(from: string, to: string, months: number, l: Pick<Likelihood, "gap" | "rule">): string {
  const lead = `Fractional ${leadWord(from)} hired ${agoWords(months)}`;
  if (windowPassed(months, l.gap)) return `${lead} · the usual window for ${to} has passed`;
  return l.rule ? `${lead} · ${to} usually follows` : `${lead} · ${to} can follow`;
}
