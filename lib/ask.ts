/**
 * Ask Merlin, as rules (BUILD_PLAN F4). Words become a page, a record type, filters, a sort and
 * columns, shown in the normal interface and always editable. Pure: no Node imports, no network,
 * so it runs in the browser on every key and scripts/test-ask.mts checks it.
 *
 *   ask(text, vocab) -> AskPlan { page, kind, filters, sort, cols, company, chips, explain, unknown, where, cost }
 *
 * Rules, in the order they read the words:
 *   1. A website ("brightloop.io") is a company to look up (the find_company rules: exact name or
 *      website, free, up to 25 new companies a day). So is the rest of the sentence after "get me
 *      into", "a way into", "who do I know at", "look up": the member typed a full name, and Merlin
 *      passes it on as typed. Merlin never guesses a company from a part of a name: any other word
 *      it doesn't know is listed back in `unknown`, never read as a name.
 *   2. Numbers: company size ("11 to 500 people", "under 200 employees"), revenue ("$5M to $50M",
 *      "a $20M company"), and a window ("in the last 90 days", "this quarter", "lately").
 *   3. Phrases: intents (what should I charge, how do credits work, draft a proposal from a call,
 *      who needs a follow-up, Crystal Ball) and signals (hiring now, a seat ended, repeat hirer,
 *      no fractional Sales yet, a new leader, you follow it, you opened it, in your pipeline, a way in).
 *   4. Words from the lists: functions and titles (CRO, CMO, CFO), industries, places, sales
 *      motions, what to list (people, seats, open roles, fractionals), a sort, a column.
 *   5. Everything left that isn't a small word ("the", "with") goes back in `unknown`.
 *
 * The optional AI path (POST /api/ask, only with RN_AI_DRAFTS=1, the member's consent and their
 * allowance) returns the same raw shape and goes through the same cleaner (cleanAskPlan), so its
 * chips, words and limits are the rules' own.
 */
import { FUNCTIONS, INDUSTRY_GROUPS, RN_EMPLOYEES, RN_INDUSTRIES, RN_MOTIONS, RN_REVENUE, RELATIONSHIPS } from "./tableFields";
import { COUNTRIES_FIRST, REGIONS } from "./geo";

/* ---------- the plan ---------- */

/** Where an answer lands. `find` is Find (a list to build); the rest are pages that exist today. */
export const ASK_PAGES = ["find", "hiring", "radar", "rates", "credits", "warm", "lookup", "proposals", "pipeline"] as const;
export type AskPage = (typeof ASK_PAGES)[number];
/** What Find lists (its kind switcher). */
export const ASK_KINDS = ["companies", "people", "seats", "roles", "fractionals"] as const;
export type AskKind = (typeof ASK_KINDS)[number];
/** The table's sorts (app/post/model.ts SortKey) Ask can set. */
export const ASK_SORTS = ["best", "fit", "newest", "hired", "employees", "revenue", "name"] as const;
export type AskSort = (typeof ASK_SORTS)[number];
/** Columns Ask can add (the workbench's column ids; the merge maps them in app/post/workbench/columns.ts). */
export const ASK_COLS = ["wayIn", "decisionMaker", "email", "rate", "holder"] as const;
export type AskCol = (typeof ASK_COLS)[number];

/** Filters with the table's own key names (app/post/model.ts Filters), so the app spreads them over EMPTY_FILTERS. */
export interface AskFilters {
  fn?: string[];
  industry?: string[];
  employees?: string[];
  revenue?: string[];
  country?: string[];
  region?: string[];
  motion?: string[];
  relationship?: string[];
  hiredFn?: string[];
  hiredWithin?: number;
  endedWithin?: number;
  notMine?: boolean;
  icp?: boolean;
  repeatHirer?: boolean;
  hiringNow?: boolean;
  newLeader?: boolean;
  followed?: boolean;
  opened?: boolean;
  inPipeline?: boolean;
  wayIn?: boolean;
  rateKnown?: boolean;
  emailKnown?: boolean;
}

/** One thing Ask set, as a chip the member can take off (withoutChip). */
export interface AskChip {
  id: string;
  label: string;
}

export interface AskPlan {
  page: AskPage;
  kind: AskKind;
  filters: AskFilters;
  sort: AskSort | null;
  cols: AskCol[];
  /** A company named in full, or a website, for the find_company rules. Never a guess. */
  company: string | null;
  /** What it set, one chip each, in the order read. `explain` is their words. */
  chips: AskChip[];
  explain: string[];
  /** Words it did not understand, in the member's spelling, in order. */
  unknown: string[];
  /** "Find, with 2 filters set": where this lands, for "Where this lands: …". */
  where: string;
  /** What it costs to look: always free here (spending is asked for where it happens). */
  cost: string;
  /** The text was read by Merlin's AI (RN_AI_DRAFTS), not the rules. */
  ai?: boolean;
}

/** What the rules need to know about the member. */
export interface AskVocab {
  /** Their function (Me.function): "what should I charge" and "no fractional X yet" read it. */
  myFn?: string | null;
  /** They have an ideal client (Me.icp not empty): "my ideal client" sets the pill. */
  hasIcp?: boolean;
}

/* ---------- words ---------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[‐-―−]/g, "-");

/** Small words that carry no filter: never listed back as unknown. */
const SMALL = new Set(
  (
    "a an the of for and or with without that which who whom whose are is was were be been being am me show find list get give see i i'm im my mine " +
    "us we our you your to in at on by from as any all some just right now please can could would should will do does did there their them " +
    "they it its this these those than then into about over via per each every what where when how companies company firms firm businesses " +
    "business orgs organizations organisations clients client fractional leader leaders lead head of like want looking look need needs " +
    "currently also more most really very new kind sort type ones one already still recently both either has have had having hire hires " +
    "hiring hired seat seats role roles someone anyone people person employees staff team teams size sized between from today tomorrow"
  ).split(" "),
);

/** A token and where it came from (to give unknown words back in the member's spelling). */
interface Tok {
  t: string;
  raw: string;
  used: boolean;
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  // Money with its unit stays one token ("$5m", "$1.5b"); "11-500" and "11–500" read as "11 to 500".
  const prepared = text
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/(\d[kmb]?)\s*[-–]\s*(\$?\d)/gi, "$1 to $2")
    .replace(/\$\s*(\d+(?:\.\d+)?)\s*(million|mil|mm|m)\b/gi, (_m, n: string) => `$${n}m`)
    .replace(/\$\s*(\d+(?:\.\d+)?)\s*(billion|bn|b)\b/gi, (_m, n: string) => `$${n}b`)
    .replace(/\$\s*(\d+(?:\.\d+)?)\s*(thousand|k)\b/gi, (_m, n: string) => `$${n}k`);
  for (const raw of prepared.split(/\s+/)) {
    const clean = raw.replace(/^[^\w$+]+|[^\w$+%]+$/g, "");
    if (!clean) continue;
    // "fractional's", "today's": the 's goes.
    const t = norm(clean).replace(/'s$/, "").replace(/'/g, "");
    if (!t) continue;
    // A hyphenated word reads as its parts ("e-commerce" stays one: see the industry words).
    if (t.includes("-") && !/^e-commerce$|^k-12$|^go-to-market$/.test(t)) {
      for (const part of t.split("-").filter(Boolean)) out.push({ t: part, raw: part, used: false });
      continue;
    }
    out.push({ t: t === "e-commerce" ? "ecommerce" : t === "go-to-market" ? "go to market" : t, raw: clean, used: false });
  }
  // "go to market" was one token: split it back into words.
  return out.flatMap((x) => (x.t.includes(" ") ? x.t.split(" ").map((w) => ({ t: w, raw: w, used: false })) : [x]));
}

/** Find a phrase (words in order) at position i among the unused tokens. */
const at = (toks: Tok[], i: number, words: string[]) => words.every((w, k) => toks[i + k] && !toks[i + k].used && toks[i + k].t === w);

/** Every match of any phrase, longest first, marking the tokens used. Calls `hit` with the phrase index and where it starts. */
function take(toks: Tok[], phrases: string[][], hit: (which: number, start: number, len: number) => void) {
  const order = phrases.map((p, k) => [p, k] as const).sort((a, b) => b[0].length - a[0].length);
  for (const [p, k] of order)
    for (let i = 0; i + p.length <= toks.length; i++)
      if (at(toks, i, p)) {
        for (let j = 0; j < p.length; j++) toks[i + j].used = true;
        hit(k, i, p.length);
      }
}

const words = (s: string) => norm(s).replace(/[^a-z0-9$+ ]/g, " ").split(/\s+/).filter(Boolean);

/* ---------- vocabulary ---------- */

const SOFTWARE = INDUSTRY_GROUPS[0].values;
const IND = (xs: string[]) => xs.filter((x) => RN_INDUSTRIES.includes(x));
/** Industry words: an alias and the industries it picks. Every industry's own name reads too. */
const INDUSTRY_WORDS: [string, string[]][] = ([
  ["saas", SOFTWARE], ["software", SOFTWARE], ["b2b software", SOFTWARE], ["b2b saas", SOFTWARE], ["tech", SOFTWARE],
  ["enterprise software", ["Enterprise Software"]], ["smb software", ["SMB Software"]], ["developer tools", ["Developer Tools"]], ["devtools", ["Developer Tools"]], ["dev tools", ["Developer Tools"]],
  ["fintech", ["Fintech"]], ["payments", ["Payments & Fintech Infrastructure"]], ["edtech", ["EdTech"]], ["education", ["Education"]],
  ["health care", ["Health Care"]], ["healthcare", ["Health Care"]], ["health tech", ["Health Care"]], ["healthtech", ["Health Care"]], ["clinics", ["Healthcare Providers & Health Systems"]],
  ["biotech", ["Pharma & Biotech"]], ["pharma", ["Pharma & Biotech"]], ["life sciences", ["Pharma & Biotech"]], ["medtech", ["Medical Devices & Diagnostics"]], ["medical devices", ["Medical Devices & Diagnostics"]],
  ["insurance", ["Insurance & Health Plans"]], ["insurtech", ["Insurance & Health Plans"]], ["ecommerce", ["E-Commerce"]], ["e commerce", ["E-Commerce"]],
  ["d2c", ["E-Commerce & D2C"]], ["dtc", ["E-Commerce & D2C"]], ["direct to consumer", ["E-Commerce & D2C"]], ["marketplace", ["Marketplace"]], ["marketplaces", ["Marketplace"]],
  ["ai", ["Deep Tech / AI"]], ["deep tech", ["Deep Tech / AI"]], ["media", ["Media & Content", "Digital Media & Publishing"]], ["cybersecurity", ["Cybersecurity"]], ["cyber", ["Cybersecurity"]], ["security", ["Cybersecurity"]],
  ["hardware", ["Hardware / IoT"]], ["iot", ["Hardware / IoT"]], ["climate", ["Climate / Clean Tech"]], ["cleantech", ["Climate / Clean Tech"]], ["clean tech", ["Climate / Clean Tech"]],
  ["logistics", ["Freight & Trucking", "Warehousing & Fulfillment"]], ["freight", ["Freight & Trucking"]], ["trucking", ["Freight & Trucking"]], ["supply chain", ["Procurement & Supply Chain Leaders"]],
  ["manufacturing", ["Industrial Manufacturing", "Precision & Contract Manufacturing"]], ["automation", ["Industrial Automation & IoT"]], ["real estate", ["Commercial Real Estate", "Residential Real Estate"]],
  ["professional services", ["Professional Services"]], ["consulting", ["Consulting & Advisory"]], ["staffing", ["Staffing & Recruiting"]], ["recruiting", ["Staffing & Recruiting"]],
  ["retail", ["Brick & Mortar Retail"]], ["cpg", ["Consumer Goods & CPG (Non-Food)", "Food & Beverage CPG"]], ["consumer goods", ["Consumer Goods & CPG (Non-Food)"]], ["restaurants", ["Restaurants"]],
  ["hospitality", ["Hotels & Resorts"]], ["hotels", ["Hotels & Resorts"]], ["travel", ["Travel & Tourism"]], ["nonprofit", ["Nonprofit & Associations"]], ["nonprofits", ["Nonprofit & Associations"]], ["non profit", ["Nonprofit & Associations"]],
  ["government", ["Federal Government", "State & Local Government"]], ["govtech", ["State & Local Government"]], ["telecom", ["Telecommunications & Connectivity"]], ["it services", ["IT Services"]], ["msp", ["IT Services"]],
  ["data", ["Data & Analytics"]], ["analytics", ["Data & Analytics"]], ["gaming", ["Gaming & Interactive Entertainment"]], ["energy", ["Renewable Energy & Cleantech", "Oil & Gas", "Utilities (Electric, Gas, Water)"]],
  ["banking", ["Banking & Credit Unions"]], ["banks", ["Banking & Credit Unions"]], ["wealth management", ["Wealth Management & Advisory"]], ["accounting", ["Accounting & Tax"]], ["law firms", ["Law Firms & Legal Departments"]],
  ["construction", ["General Contractors & Builders"]], ["aerospace", ["Aerospace & Defense"]], ["defense", ["Aerospace & Defense"]], ["automotive", ["Automotive"]], ["fitness", ["Fitness & Wellness"]], ["wellness", ["Fitness & Wellness"]],
  ["agriculture", ["Farming & Agribusiness"]], ["agtech", ["AgTech & Food Innovation"]], ["k-12", ["K-12 Schools & Districts"]], ["k12", ["K-12 Schools & Districts"]], ["schools", ["K-12 Schools & Districts"]], ["higher ed", ["Higher Education"]], ["universities", ["Higher Education"]],
  ...RN_INDUSTRIES.map((x): [string, string[]] => [words(x).join(" "), [x]]),
] as [string, string[]][]).map(([w, xs]) => [w, IND(xs)] as [string, string[]]).filter(([, xs]) => xs.length > 0);

/** Function words: titles and names, and the function they mean. */
const FUNCTION_WORDS: [string, string][] = (
  [
    ["sales", "Sales"], ["cro", "Sales"], ["cros", "Sales"], ["vp sales", "Sales"], ["vp of sales", "Sales"], ["head of sales", "Sales"], ["chief revenue officer", "Sales"], ["revenue leader", "Sales"], ["sales leader", "Sales"], ["sales leaders", "Sales"],
    ["marketing", "Marketing"], ["cmo", "Marketing"], ["cmos", "Marketing"], ["vp marketing", "Marketing"], ["vp of marketing", "Marketing"], ["head of marketing", "Marketing"], ["demand gen", "Marketing"],
    ["revops", "RevOps"], ["rev ops", "RevOps"], ["revenue operations", "RevOps"], ["sales ops", "RevOps"], ["sales operations", "RevOps"],
    ["customer success", "Customer Success"], ["cs leader", "Customer Success"], ["head of customer success", "Customer Success"],
    ["partnerships", "Partnerships"], ["alliances", "Partnerships"], ["growth", "Growth"], ["product marketing", "Product Marketing"], ["pmm", "Product Marketing"],
    ["enablement", "Enablement"], ["sales enablement", "Enablement"], ["ai gtm", "AI GTM"], ["ai go to market", "AI GTM"],
    ["technology", "Technology"], ["cto", "Technology"], ["ctos", "Technology"], ["engineering", "Technology"],
    ["finance", "Finance"], ["cfo", "Finance"], ["cfos", "Finance"], ["controller", "Finance"], ["fpa", "Finance"], ["fp and a", "Finance"],
    ["operations", "Operations"], ["ops", "Operations"], ["coo", "Operations"], ["coos", "Operations"],
    ["hr", "People"], ["chro", "People"], ["people ops", "People"], ["product", "Product"], ["cpo", "Product"], ["head of product", "Product"], ["legal", "Legal"], ["general counsel", "Legal"],
  ] as [string, string][]
).filter(([, f]) => FUNCTIONS.includes(f));

const MOTION_WORDS: [string, string][] = (
  [["plg", "PLG"], ["product led", "PLG"], ["product led growth", "PLG"], ["inside sales", "Inside sales"], ["enterprise sales", "Enterprise sales"], ["channel", "Channel"], ["channel sales", "Channel"]] as [string, string][]
).filter(([, m]) => RN_MOTIONS.includes(m));

const COUNTRY_WORDS: [string, string][] = [
  ["us", "United States"], ["usa", "United States"], ["u s", "United States"], ["united states", "United States"], ["america", "United States"], ["american", "United States"], ["us based", "United States"],
  ["uk", "United Kingdom"], ["britain", "United Kingdom"], ["british", "United Kingdom"], ["england", "United Kingdom"], ["canadian", "Canada"],
  ...COUNTRIES_FIRST.slice(0, 20).map((c): [string, string] => [words(c).join(" "), c]),
];
const US_REGIONS = REGIONS["United States"] ?? [];
const REGION_WORDS: [string, string][] = US_REGIONS.map((r) => [words(r).join(" "), r]);

/* ---------- numbers ---------- */

/** Employee bands as numbers (RN_EMPLOYEES order). */
const EMP_BANDS: [number, number][] = [[1, 10], [11, 50], [51, 200], [201, 500], [501, 1000], [1001, Infinity]];
/** Revenue bands in $M (RN_REVENUE order: Pre-revenue, Under $1M, $1M–$5M, $5M–$20M, $20M–$50M, $50M+). */
const REV_BANDS: [number, number][] = [[0, 0], [0, 1], [1, 5], [5, 20], [20, 50], [50, Infinity]];

/** Bands a range overlaps: [lo, hi) for revenue, [lo, hi] for people. */
function bandsFor(list: readonly string[], bands: [number, number][], lo: number, hi: number, money: boolean): string[] {
  return list.filter((_, k) => {
    const [a, b] = bands[k];
    if (money && k === 0) return false; // Pre-revenue only when asked for by name.
    return money ? a < hi && b > lo : a <= hi && b >= lo;
  });
}

const moneyOf = (t: string): number | null => {
  const m = /^\$(\d+(?:\.\d+)?)(k|m|b)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "b" ? n * 1000 : m[2] === "k" ? n / 1000 : m[2] === "m" ? n : n >= 1000 ? n / 1_000_000 : n;
};
const numOf = (t: string): number | null => (/^\d+\+?$/.test(t) ? Number(t.replace("+", "")) : null);

const UNDER = ["under", "below", "less", "fewer", "up", "max", "maximum", "smaller"];
const OVER = ["over", "above", "more", "greater", "min", "minimum", "bigger", "larger", "at"];
const PEOPLE_UNIT = new Set(["people", "employees", "employee", "staff", "person", "headcount", "fte", "ftes"]);

/* ---------- reading ---------- */

/** The raw shape both paths produce, before the cleaner. */
export interface AskRaw {
  page?: unknown;
  kind?: unknown;
  filters?: unknown;
  sort?: unknown;
  cols?: unknown;
  company?: unknown;
  unknown?: unknown;
}

/** Read the member's words by the rules. Never throws; an empty text is an empty plan. */
export function ask(text: string, vocab: AskVocab = {}): AskPlan {
  return cleanAskPlan(readRules(String(text ?? "").slice(0, 600), vocab), vocab);
}

function readRules(text: string, vocab: AskVocab): AskRaw {
  const f: AskFilters = {};
  let page: AskPage | null = null;
  let kind: AskKind | null = null;
  let sort: AskSort | null = null;
  const cols: AskCol[] = [];
  let company: string | null = null;
  const unknown: string[] = [];
  const add = <K extends keyof AskFilters>(k: K, vs: string[]) => {
    const cur = (f[k] as string[] | undefined) ?? [];
    (f as Record<string, unknown>)[k] = [...new Set([...cur, ...vs])];
  };

  // 1. A website is a company to look up, as typed.
  const site = /(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?:\/\S*)?/i.exec(text);
  let rest = text;
  if (site && !/^\d+(\.\d+)?$/.test(site[1]) && !/^\$/.test(site[0])) {
    company = site[1].toLowerCase();
    rest = text.slice(0, site.index) + " " + text.slice(site.index + site[0].length);
  }

  // The rest of the sentence after these is a company named in full: passed on as typed, never guessed.
  const INTO = /\b(?:get (?:me )?in(?:to)?|a way in(?:to| to)?|ways? into|way in at|intro(?:duction)? to|introduce me to|who do i know at|who i know at|anyone (?:i know )?at|look up|lookup|find the company|open the company)\s+(.+)$/i;
  const into = INTO.exec(rest);
  if (into) {
    const name = into[1].replace(/[?.!]+\s*$/, "").replace(/^(?:the company\s+)/i, "").trim();
    const verb = into[0].slice(0, into[0].length - into[1].length).toLowerCase();
    if (name && !company) {
      // Only text that reads as a name: no list words of ours inside it ("into software companies" is a filter, not a name).
      const ws = words(name);
      const ours = ws.some((w) => w === "companies" || w === "company" || INDUSTRY_WORDS.some(([iw]) => iw === w) || FUNCTION_WORDS.some(([fw]) => fw === w));
      if (!ours) {
        company = name.slice(0, 100);
        page = /look ?up|find the company|open the company/.test(verb) ? "lookup" : "warm";
        rest = rest.slice(0, into.index);
      }
    } else if (company) page = /look ?up|find the company|open the company/.test(verb) ? "lookup" : "warm";
  }

  const toks = tokenize(rest);
  const T = (i: number) => (toks[i] && !toks[i].used ? toks[i].t : null);
  const use = (...is: number[]) => is.forEach((i) => toks[i] && (toks[i].used = true));

  // 2. Numbers: size, revenue, a window.
  let windowMonths: number | null = null;
  let windowWords = "";
  for (let i = 0; i < toks.length; i++) {
    const t = T(i);
    if (t === null) continue;
    // A window: "in the last 90 days", "past 6 months", "last quarter", "this year", "lately".
    if ((t === "last" || t === "past") && T(i + 1) !== null) {
      const n = numOf(T(i + 1)!);
      const unit = n !== null ? T(i + 2) : T(i + 1);
      const units: Record<string, number> = { day: 1 / 30, days: 1 / 30, week: 0.25, weeks: 0.25, month: 1, months: 1, quarter: 3, quarters: 3, year: 12, years: 12 };
      if (unit && unit in units) {
        windowMonths = Math.max(1, Math.round((n ?? 1) * units[unit]));
        windowWords = [t, T(i + 1), n !== null ? T(i + 2) : null].filter(Boolean).join(" ");
        use(i, i + 1, ...(n !== null ? [i + 2] : []));
        if (T(i - 1) === "the") use(i - 1);
        if (T(i - 2) === "in" || T(i - 2) === "within" || T(i - 2) === "over") use(i - 2);
        if (T(i - 1) === "in" || T(i - 1) === "within") use(i - 1);
        continue;
      }
    }
    if (t === "this" && (T(i + 1) === "quarter" || T(i + 1) === "year" || T(i + 1) === "month")) {
      windowMonths = T(i + 1) === "quarter" ? 3 : T(i + 1) === "year" ? 12 : 1;
      windowWords = `this ${T(i + 1)}`;
      use(i, i + 1);
      continue;
    }
    if (t === "lately" || t === "recently") {
      windowMonths ??= 3;
      windowWords ||= toks[i].raw;
      use(i);
      continue;
    }
    // Revenue: "$5m to $50m", "under $10m", "over $50m", "$20m" (the band it falls in). "in revenue", "arr" go with it.
    const m = moneyOf(t);
    if (m !== null) {
      let lo = m;
      let hi = m === 0 ? 0.001 : m * 1.0001;
      let span = [i];
      const prev = T(i - 1);
      const m2 = T(i + 1) === "to" || T(i + 1) === "and" ? moneyOf(T(i + 2) ?? "") ?? (numOf(T(i + 2) ?? "") !== null && /m$|b$/.test(t) ? moneyOf(`$${T(i + 2)}${t.slice(-1)}`) : null) : null;
      if (m2 !== null) {
        hi = m2;
        span = [i, i + 1, i + 2];
      } else if (prev && UNDER.includes(prev)) {
        lo = 0;
        hi = m;
        span = [i - 1, i];
        if (T(i - 2) === "less" || T(i - 2) === "up") span.push(i - 2);
      } else if (prev && OVER.includes(prev)) {
        lo = m;
        hi = Infinity;
        span = [i - 1, i];
      } else if (prev === "than" && (T(i - 2) === "less" || T(i - 2) === "more")) {
        if (T(i - 2) === "less") (lo = 0), (hi = m);
        else (lo = m), (hi = Infinity);
        span = [i - 2, i - 1, i];
      } else if (prev === "between" || prev === "from") span = [i - 1, i];
      const bands = bandsFor(RN_REVENUE, REV_BANDS, lo, hi, true);
      if (bands.length) {
        add("revenue", bands);
        use(...span);
        // "in revenue", "of annual revenue", "ARR" go with it.
        let end = Math.max(...span) + 1;
        if ((T(end) === "in" || T(end) === "of") && ["revenue", "arr", "annual"].includes(T(end + 1) ?? "")) use(end++);
        if (T(end) === "annual") use(end++);
        if (T(end) === "revenue" || T(end) === "arr") use(end);
      }
      continue;
    }
    // Company size: "11 to 500 people", "under 200 employees", "500+ people", "50 people".
    const n = numOf(t);
    if (n !== null) {
      const plus = t.endsWith("+");
      let j = i + 1;
      let lo = n;
      let hi = plus ? Infinity : n;
      const span = [i];
      if ((T(j) === "to" || T(j) === "and") && numOf(T(j + 1) ?? "") !== null) {
        hi = numOf(T(j + 1)!)!;
        span.push(j, j + 1);
        j += 2;
      }
      if (T(j) && PEOPLE_UNIT.has(T(j)!)) {
        span.push(j);
        const prev = T(i - 1);
        if (prev && UNDER.includes(prev)) (lo = 1), span.push(i - 1);
        else if (prev && OVER.includes(prev)) (lo = n + 1), (hi = Infinity), span.push(i - 1);
        else if (prev === "than" && (T(i - 2) === "less" || T(i - 2) === "fewer" || T(i - 2) === "more")) {
          if (T(i - 2) === "more") (lo = n + 1), (hi = Infinity);
          else lo = 1;
          span.push(i - 1, i - 2);
        }
        const bands = bandsFor(RN_EMPLOYEES, EMP_BANDS, lo, hi, false);
        if (bands.length) {
          add("employees", bands);
          use(...span);
        }
      }
    }
  }

  // 3. Phrases: intents first, then signals.
  const P = (s: string) => s.split(" ");
  let ended = false;
  let hired = false;
  let hiringIntent = false;
  take(toks, ["what should i charge", "what to charge", "how much should i charge", "how much to charge", "what do fractionals charge", "rate benchmarks", "benchmarks", "my rate", "rates"].map(P), () => (page ??= "rates"));
  take(toks, ["how do credits work", "how credits work", "credits", "credit", "my balance"].map(P), () => (page ??= "credits"));
  take(toks, ["draft a proposal", "write a proposal", "start a proposal", "proposal from", "a proposal", "proposal", "proposals", "today call", "my call", "the call", "a call", "call"].map(P), () => (page ??= "proposals"));
  take(toks, ["who needs a follow up", "needs a follow up", "follow up", "follow ups", "followup", "followups", "who to follow up with"].map(P), () => (page ??= "pipeline"));
  take(toks, ["crystal ball", "likely to hire", "likely to need", "hire next", "hiring next", "next to hire"].map(P), () => (page ??= "radar"));

  // "no fractional Sales leader yet": the member's own function only (the table's "No fractional Sales yet").
  for (let i = 0; i < toks.length; i++) {
    if (!(T(i) === "no" || T(i) === "without")) continue;
    let j = i + 1;
    if (T(j) === "a") j++;
    if (T(j) === "fractional") j++;
    let fnHit: string | null = null;
    let len = 0;
    for (const [w, fn] of [...FUNCTION_WORDS].sort((a, b) => b[0].split(" ").length - a[0].split(" ").length)) {
      const ws = w.split(" ");
      if (at(toks, j, ws)) {
        fnHit = fn;
        len = ws.length;
        break;
      }
    }
    if (!fnHit) continue;
    let k = j + len;
    if (T(k) === "leader" || T(k) === "lead" || T(k) === "seat") k++;
    const yet = T(k) === "yet";
    if (!yet && T(i) !== "without") continue;
    const span = Array.from({ length: k - i + (yet ? 1 : 0) }, (_, x) => i + x);
    if (vocab.myFn && fnHit === vocab.myFn) {
      f.notMine = true;
      use(...span);
    } else {
      // Another function than theirs: Find has no filter for that yet. Said back as one phrase.
      unknown.push(span.map((x) => toks[x].raw).join(" "));
      use(...span);
    }
  }

  take(toks, ["seat ended", "seats ended", "seat that ended", "seats that ended", "ended", "just left", "left", "lost a fractional", "lost their", "lost its", "lost", "between fractionals", "seat end", "seat ending", "ending"].map(P), (k) => {
    ended = true;
    if (k === 1 || k === 3) kind ??= "seats";
  });
  take(toks, ["repeat hirer", "repeat hirers", "repeat hiring", "hires again and again", "hire fractionals again"].map(P), () => (f.repeatHirer = true));
  take(toks, ["hiring again"].map(P), () => ((f.hiringNow = true), (hiringIntent = true)));
  take(toks, ["who is hiring", "who's hiring", "whos hiring", "is hiring", "are hiring", "hiring now", "hiring right now", "hiring a fractional", "open role", "open roles", "posted a role", "job posting", "job postings", "open jobs", "jobs", "postings", "roles open", "hiring"].map(P), (k) => {
    f.hiringNow = true;
    hiringIntent = true;
    if (k >= 5 && k <= 6) kind ??= "roles";
  });
  take(toks, ["new ceo", "new coo", "new cro", "new cmo", "new cfo", "new leader", "new leaders", "new executive", "new exec", "new decision maker", "new leadership"].map(P), () => (f.newLeader = true));
  take(toks, ["show me who i know there", "who i know there", "who do i know there", "and who i know", "show who i know"].map(P), () => cols.push("wayIn"));
  take(toks, ["i know someone", "know someone", "i know someone there", "someone i know", "i can reach", "i already have a way into", "i have a way in", "have a way in", "a way in", "way in", "ways in", "warm intro", "warm path", "warm paths", "warm"].map(P), () => (f.wayIn = true));
  take(toks, ["i follow", "you follow", "following", "followed", "that i follow"].map(P), () => (f.followed = true));
  take(toks, ["i opened", "i have opened", "ive opened", "opened", "unlocked", "i unlocked"].map(P), () => (f.opened = true));
  take(toks, ["in my pipeline", "in the pipeline", "in pipeline", "on my pipeline"].map(P), () => (f.inPipeline = true));
  take(toks, ["my ideal client", "my ideal clients", "ideal client", "fit my ideal client", "fits my ideal client", "my kind of company", "my kind of companies", "my market", "my profile", "fit me", "like my clients"].map(P), () => (f.icp = true));
  take(toks, ["hired a fractional", "hired fractional", "had a fractional", "have a fractional", "has a fractional", "used a fractional", "brought in a fractional", "hired a", "hired"].map(P), () => (hired = true));
  take(toks, ["rate on file", "with a rate", "rates on file", "posted rate"].map(P), () => (f.rateKnown = true));
  take(toks, ["email on file", "with an email", "with emails", "emails"].map(P), () => cols.push("email"));
  take(toks, ["decision makers", "decision maker", "deciders", "decider", "who decides", "who hires", "buyers", "ceos", "founders", "ceo", "founder"].map(P), (k) => {
    kind ??= "people";
    if (k <= 5) add("relationship", RELATIONSHIPS.includes("Decision maker") ? ["Decision maker"] : []);
  });
  take(toks, ["with decision makers", "and who decides", "with the decider", "with deciders"].map(P), () => cols.push("decisionMaker"));
  take(toks, ["who held the seat", "who held it", "seat holder", "seat holders"].map(P), () => cols.push("holder"));

  // 4. List words: what to list, sorts, functions, industries, places, motions.
  take(toks, ["fractionals", "other fractionals", "fellow fractionals", "fractional peers", "peers"].map(P), () => (kind ??= "fractionals"));
  take(toks, ["people", "contacts", "persons"].map(P), () => (kind ??= "people"));
  take(toks, ["seats", "past seats", "engagements"].map(P), () => (kind ??= "seats"));
  take(toks, ["roles", "open positions", "positions"].map(P), () => (kind ??= "roles"));
  take(toks, ["newest first", "most recent", "newest", "latest", "recent first"].map(P), () => (sort ??= hired ? "hired" : "newest"));
  take(toks, ["biggest", "largest", "most employees", "by size"].map(P), () => (sort ??= "employees"));
  take(toks, ["most revenue", "highest revenue", "by revenue"].map(P), () => (sort ??= "revenue"));
  take(toks, ["best fit", "best fit first", "best match"].map(P), () => (sort ??= "best"));
  take(toks, ["most fractional friendly", "fractional friendly"].map(P), () => (sort ??= "fit"));
  take(toks, ["a to z", "alphabetical", "by name"].map(P), () => (sort ??= "name"));

  // Motions before functions: "product led" is a motion, not Product. "Sales led" and "founder led" have no filter yet.
  take(toks, MOTION_WORDS.map(([w]) => P(w)), (k) => add("motion", [MOTION_WORDS[k][1]]));
  take(toks, ["sales led", "founder led"].map(P), (k) => unknown.push(k === 0 ? "sales led" : "founder led"));
  const fns: string[] = [];
  take(toks, FUNCTION_WORDS.map(([w]) => P(w)), (k) => fns.push(FUNCTION_WORDS[k][1]));
  take(toks, INDUSTRY_WORDS.map(([w]) => P(w)), (k) => add("industry", INDUSTRY_WORDS[k][1]));
  take(toks, REGION_WORDS.map(([w]) => P(w)), (k) => {
    add("region", [REGION_WORDS[k][1]]);
    add("country", ["United States"]);
  });
  take(toks, COUNTRY_WORDS.map(([w]) => P(w)), (k) => add("country", [COUNTRY_WORDS[k][1]]));
  take(toks, ["pre revenue", "prerevenue"].map(P), () => add("revenue", [RN_REVENUE[0]]));
  take(toks, ["small", "startup", "startups", "early stage"].map(P), () => add("employees", RN_EMPLOYEES.slice(0, 3)));
  take(toks, ["mid size", "midsize", "mid market", "midmarket"].map(P), () => add("employees", RN_EMPLOYEES.slice(2, 5)));
  take(toks, ["enterprise", "large"].map(P), () => add("employees", RN_EMPLOYEES.slice(4)));

  // The functions read in context: a hire, an ended seat, or a seat or open role in it.
  const fnList = [...new Set(fns)];
  if (fnList.length) {
    if (hired && !ended) add("hiredFn", fnList);
    else add("fn", fnList);
  }
  if (ended) f.endedWithin = windowMonths ?? 3;
  else if (hired && windowMonths) {
    f.hiredFn ??= [];
    f.hiredWithin = windowMonths;
  } else if (windowMonths) unknown.push(windowWords || "that window");
  // "Hired a fractional" with no function and no window is every company with a hire on file: said back, not set.
  if (hired && !f.hiredFn && !ended) unknown.push("hired a fractional");
  void hiringIntent;

  // 5. Whatever is left.
  for (const t of toks) if (!t.used && !SMALL.has(t.t) && !/^\d+$/.test(t.t)) unknown.push(t.raw);

  // Where it lands. (Set inside the phrase callbacks: read through a cast so TypeScript doesn't narrow it to null.)
  page = page as AskPage | null;
  if (!page) {
    if (kind === "roles" || (f.hiringNow && !hasMore(f, ["fn", "hiringNow", "icp"]) && !kind)) page = "hiring";
    else page = "find";
  }
  if (page === "hiring") kind = "roles";
  if (page === "rates" && !f.fn && vocab.myFn && FUNCTIONS.includes(vocab.myFn)) f.fn = [vocab.myFn];
  if (company && page !== "warm" && page !== "lookup") page = "lookup";
  return { page, kind: kind ?? "companies", filters: f, sort, cols, company, unknown };
}

/** Any filter set beyond these keys. */
const hasMore = (f: AskFilters, keys: (keyof AskFilters)[]) => Object.entries(f).some(([k, v]) => !keys.includes(k as keyof AskFilters) && v !== undefined && v !== false && !(Array.isArray(v) && !v.length) && v !== 0);

/* ---------- the cleaner: both paths ---------- */

const pick = (list: readonly string[], v: unknown) => (typeof v === "string" ? list.find((x) => x.toLowerCase() === v.trim().toLowerCase()) ?? null : null);
const picks = (list: readonly string[], v: unknown, max = 40) => [...new Set((Array.isArray(v) ? v : []).slice(0, max).map((x) => pick(list, x)).filter((x): x is string => !!x))];
const months = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
/** Plain text from the member or the AI: no control characters or angle brackets, trimmed and cut. */
const plain = (v: unknown, len: number) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, len);

const BOOL_KEYS = ["notMine", "icp", "repeatHirer", "hiringNow", "newLeader", "followed", "opened", "inPipeline", "wayIn", "rateKnown", "emailKnown"] as const;

const BOOL_LABEL: Record<(typeof BOOL_KEYS)[number], (v: AskVocab) => string> = {
  notMine: (v) => (v.myFn ? `No fractional ${v.myFn} yet` : "No fractional in your function yet"),
  icp: () => "Fits your ideal client",
  repeatHirer: () => "Repeat hirer",
  hiringNow: () => "Hiring a fractional now",
  newLeader: () => "New leader this year",
  followed: () => "You follow it",
  opened: () => "You opened it",
  inPipeline: () => "In your pipeline",
  wayIn: () => "You have a way in",
  rateKnown: () => "Rate on file",
  emailKnown: () => "Email on file",
};
const SORT_LABEL: Record<AskSort, string> = { best: "Best fit for you", fit: "Most fractional friendly", newest: "Newest first", hired: "Most recent hire", employees: "Most employees", revenue: "Most revenue", name: "Company name" };
const COL_LABEL: Record<AskCol, string> = { wayIn: "Your way in", decisionMaker: "Decision makers", email: "Work email", rate: "Rate paid", holder: "Who held the seat" };
const KIND_LABEL: Record<AskKind, string> = { companies: "Companies", people: "People", seats: "Seats", roles: "Open roles", fractionals: "Fractionals" };
const PAGE_LABEL: Record<AskPage, string> = { find: "Find", hiring: "Hiring now", radar: "Crystal Ball", rates: "Rate benchmarks", credits: "Credits and usage", warm: "Warm paths", lookup: "Look up a company", proposals: "Proposals", pipeline: "Your pipeline" };

/** "$5M–$20M" and "$20M–$50M" read as "$5M to $50M"; one band as itself. */
function bandWords(list: readonly string[], picked: string[], unit = ""): string {
  const idx = picked.map((p) => list.indexOf(p)).filter((k) => k >= 0).sort((a, b) => a - b);
  if (!idx.length) return "";
  const run = idx.every((k, n) => n === 0 || k === idx[n - 1] + 1);
  if (!run || idx.length === 1) return idx.map((k) => list[k]).join(", ") + unit;
  const lo = list[idx[0]].split(/–|\+/)[0];
  const hiPart = list[idx[idx.length - 1]];
  const hi = hiPart.includes("–") ? hiPart.split("–")[1] : hiPart.endsWith("+") ? "" : hiPart;
  if (!hi) return `${lo} or more${unit}`;
  if (/^Under /.test(lo)) return `${lo.replace(/^Under /, "Under ")}${unit}`.replace(/Under (\$\d+M)/, `Under ${hi}`);
  return `${lo} to ${hi}${unit}`;
}

/** The chips a plan's filters make, in a steady order, with their words. */
function chipsOf(p: Omit<AskPlan, "chips" | "explain" | "where" | "cost">, vocab: AskVocab): AskChip[] {
  const out: AskChip[] = [];
  const f = p.filters;
  if (p.company) out.push({ id: "company", label: p.page === "warm" ? `Ways into ${p.company}` : `Look up ${p.company}` });
  if (p.kind !== "companies" && p.page === "find") out.push({ id: "kind", label: `List: ${KIND_LABEL[p.kind]}` });
  if (f.fn?.length) out.push({ id: "fn", label: `Function: ${f.fn.join(" or ")}` });
  if (f.hiredFn) out.push({ id: "hired", label: `Hired a fractional ${f.hiredFn.length ? `${f.hiredFn.join(" or ")} ` : ""}leader${f.hiredWithin ? ` in the last ${f.hiredWithin} months` : ""}` });
  if (f.endedWithin) out.push({ id: "endedWithin", label: f.endedWithin === 3 ? "A seat ended in the last 90 days" : `A seat ended in the last ${f.endedWithin} months` });
  if (f.industry?.length) {
    const soft = SOFTWARE.every((x) => f.industry!.includes(x));
    const rest = f.industry.filter((x) => !(soft && SOFTWARE.includes(x)));
    out.push({ id: "industry", label: `Industry: ${[...(soft ? ["Software (all)"] : []), ...rest].join(", ")}` });
  }
  if (f.employees?.length) out.push({ id: "employees", label: `Size: ${bandWords(RN_EMPLOYEES, f.employees, " people").replace(/–/g, " to ")}` });
  if (f.revenue?.length) out.push({ id: "revenue", label: `Revenue: ${bandWords(RN_REVENUE, f.revenue).replace(/–/g, " to ")}` });
  if (f.region?.length) out.push({ id: "region", label: `In: ${f.region.join(" or ")}` });
  else if (f.country?.length) out.push({ id: "country", label: `In: ${f.country.join(" or ")}` });
  if (f.motion?.length) out.push({ id: "motion", label: `Sales motion: ${f.motion.join(" or ")}` });
  if (f.relationship?.length) out.push({ id: "relationship", label: `${f.relationship.join(" or ")}s` });
  for (const k of BOOL_KEYS) if (f[k]) out.push({ id: k, label: BOOL_LABEL[k](vocab) });
  if (p.sort) out.push({ id: "sort", label: `Sorted: ${SORT_LABEL[p.sort]}` });
  for (const c of p.cols) out.push({ id: `col:${c}`, label: `Column: ${COL_LABEL[c]}` });
  return out;
}

/** Where it lands, in a few words: "Find, with 2 filters set", "Hiring now, filtered to Sales". */
function whereOf(p: Omit<AskPlan, "where" | "cost" | "explain">): string {
  const nf = p.chips.filter((c) => !c.id.startsWith("col:") && c.id !== "sort" && c.id !== "kind" && c.id !== "company").length;
  switch (p.page) {
    case "find":
      return nf ? `Find, ${KIND_LABEL[p.kind].toLowerCase()}, with ${nf === 1 ? "1 filter" : `${nf} filters`} set` : `Find, ${KIND_LABEL[p.kind].toLowerCase()}`;
    case "hiring":
      return p.filters.fn?.length ? `Hiring now, filtered to ${p.filters.fn.join(" or ")}` : "Hiring now";
    case "rates":
      return p.filters.fn?.length ? `Rate benchmarks, set to ${p.filters.fn.join(" or ")}` : "Rate benchmarks";
    case "warm":
      return p.company ? `Warm paths, for ${p.company}` : "Warm paths";
    case "lookup":
      return p.company ? `Find, looking up ${p.company}` : "Find, looking up a company";
    case "pipeline":
      return "Your pipeline, follow-ups due first";
    case "proposals":
      return "Proposals, a new one from a call";
    default:
      return PAGE_LABEL[p.page];
  }
}

const COST: Record<AskPage, string> = {
  find: "Free to look. Nothing is spent until you choose.",
  hiring: "Free to look",
  radar: "Free to look. These companies open free on the trial and Pro.",
  rates: "Free",
  credits: "Free",
  warm: "Free",
  lookup: "Looking one up is free, up to 25 new companies a day",
  proposals: "Drafting uses your allowance, only when you start it",
  pipeline: "Free",
};

/**
 * Any raw plan (the rules', or the AI path's JSON) to a clean plan: pages, kinds, sorts and columns
 * from our lists only, list values in their list's spelling (anything else dropped), numbers in
 * range, and the chips and words built here, never taken from the raw answer.
 */
export function cleanAskPlan(raw: AskRaw | null | undefined, vocab: AskVocab = {}, ai = false): AskPlan {
  const r = raw && typeof raw === "object" ? raw : {};
  const rf = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const f: AskFilters = {};
  const lists: [keyof AskFilters, readonly string[]][] = [
    ["fn", FUNCTIONS], ["industry", RN_INDUSTRIES], ["employees", RN_EMPLOYEES], ["revenue", RN_REVENUE], ["country", COUNTRIES_FIRST], ["region", US_REGIONS],
    ["motion", RN_MOTIONS], ["relationship", RELATIONSHIPS], ["hiredFn", FUNCTIONS],
  ];
  for (const [k, list] of lists) {
    const v = picks(list, rf[k]);
    if (v.length) (f as Record<string, unknown>)[k] = list === RN_EMPLOYEES || list === RN_REVENUE ? list.filter((x) => v.includes(x)) : v;
  }
  // "Hired a fractional" with no function and no window says nothing: kept only with one of them.
  if (Array.isArray(rf.hiredFn) && rf.hiredFn.length === 0 && months(rf.hiredWithin, 240)) f.hiredFn = [];
  if (f.hiredFn && months(rf.hiredWithin, 240)) f.hiredWithin = months(rf.hiredWithin, 240);
  if (months(rf.endedWithin, 24)) f.endedWithin = months(rf.endedWithin, 24);
  for (const k of BOOL_KEYS) if (rf[k] === true) f[k] = true;
  // "No fractional X yet" means the member's own function; without one, it can't be read.
  if (f.notMine && !vocab.myFn) delete f.notMine;
  if (f.icp && vocab.hasIcp === false) delete f.icp;
  const page = (ASK_PAGES as readonly string[]).includes(String(r.page)) ? (r.page as AskPage) : "find";
  const kind = (ASK_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as AskKind) : "companies";
  const sort = (ASK_SORTS as readonly string[]).includes(String(r.sort)) ? (r.sort as AskSort) : null;
  const cols = [...new Set((Array.isArray(r.cols) ? r.cols : []).filter((c): c is AskCol => (ASK_COLS as readonly string[]).includes(String(c))))];
  const companyText = plain(r.company, 100);
  const company = companyText.length >= 2 ? companyText : null;
  const unknown = [...new Set((Array.isArray(r.unknown) ? r.unknown : []).map((w) => plain(w, 40)).filter(Boolean))].slice(0, 20);
  const base = { page: company && page !== "warm" && page !== "lookup" ? ("lookup" as AskPage) : !company && (page === "warm" || page === "lookup") ? (page === "warm" ? "warm" : "find") : page, kind, filters: f, sort, cols, company, unknown, ...(ai ? { ai: true } : {}) };
  const chips = chipsOf(base, vocab);
  const withChips = { ...base, chips };
  return { ...withChips, explain: chips.map((c) => c.label), where: whereOf(withChips), cost: COST[base.page] };
}

/** The plan without one of its chips (the member took it off). The rest stays as it was. */
export function withoutChip(p: AskPlan, id: string, vocab: AskVocab = {}): AskPlan {
  const f: AskFilters = { ...p.filters };
  let { sort, kind, company, page } = p;
  let cols = p.cols;
  if (id === "company") (company = null), (page = "find");
  else if (id === "kind") kind = "companies";
  else if (id === "sort") sort = null;
  else if (id.startsWith("col:")) cols = cols.filter((c) => `col:${c}` !== id);
  else if (id === "hired") (delete f.hiredFn, delete f.hiredWithin);
  else if (id === "region") (delete f.region, f.country?.length === 1 && f.country[0] === "United States" && delete f.country);
  else delete (f as Record<string, unknown>)[id];
  return cleanAskPlan({ page, kind, filters: f, sort, cols, company, unknown: p.unknown }, vocab, !!p.ai);
}

/** Nothing to act on: no chip and no company. */
export const emptyPlan = (p: AskPlan) => !p.chips.length && !p.company && p.page === "find";
