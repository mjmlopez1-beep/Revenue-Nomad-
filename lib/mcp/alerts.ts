/**
 * Saved searches ("alerts") for open roles, kept on the member (State.connector.alerts).
 * Pure functions, no Node imports: the weekly email (lib/table.ts digestList) and the
 * connector's tools (lib/mcp/tools.ts) match roles with the same rules.
 *
 * An alert matches an open role by free facts only (the seat's function and the company's
 * industry, size, revenue and HQ), never by a locked one, so a match never gives away a
 * locked value or a hidden company.
 */
import { FUNCTIONS, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, industryWords, standardIndustries } from "../tableFields";
import { toStandard } from "../industryMap";
import { inPlace, placeFilter } from "../geo";
import { cleanWindow, fnLeader, followsHires, windowPhrase } from "../hired";

export interface SavedSearch {
  id: string;
  /** What the member called it, or a name made from the criteria. */
  name: string;
  function?: string;
  industry?: string[];
  employees?: string[];
  revenue?: string[];
  /** A place: every word must be in the company's HQ ("Texas", "Austin, TX"). */
  hq?: string;
  /** Only companies with past fractional hires on file. */
  fractionalFriendly?: boolean;
  /** Any of these functions (a view saved in the app can name several). `function` is the one-function form. */
  functions?: string[];
  /** Countries (CompanyRec.country). A company with no country on file still matches. */
  country?: string[];
  createdAt: string;
  /**
   * A view saved in the app ("Save this view"): the table's place as its address query (view,
   * list, sort, search and filters), so the app opens it as saved. Left out on a search saved
   * through the connector, which the app opens from its criteria.
   */
  place?: string;
  /** "Email me new matches each week". Left out means on (the connector's saved searches always were). */
  email?: boolean;
  /**
   * A view that follows hires ("Recently hired", lib/hired.ts): companies that hired a fractional
   * in these functions (none: any) with a start in the last `hiredWithin` months (0: any time). It
   * matches new hires, never open roles: lib/hireAlerts.ts reads it from its place.
   */
  hiredFn?: string[];
  hiredWithin?: number;
}

/** The free facts of one open role that an alert reads. */
export interface RoleFacts {
  function: string | null;
  industry: string | null;
  employees: string | null;
  revenue: string | null;
  /** The HQ as the member sees it (a hidden company shows its region only). */
  hq: string | null;
  /** Fractional hires on file at the company (Friendly.fractional). */
  pastHires: number;
  /** The country and region the HQ names (CompanyRec.country, .region), when known. */
  country?: string | null;
  region?: string | null;
}

/** Saved searches a member can keep. */
export const ALERT_MAX = 20;

/** Dashes, case and spacing aside: "$5m-$20m" is "$5M–$20M", "saas" is "SaaS". */
const squash = (v: string) => v.toLowerCase().replace(/[‐-―−-]/g, "-").replace(/\s+/g, "").replace(/,/g, "");

/** The list's own spelling of what was typed, or null when it isn't on the list. */
export function pickFrom(list: readonly string[], raw: unknown): string | null {
  const want = squash(String(raw ?? ""));
  if (!want) return null;
  const hit = list.find((x) => squash(x) === want);
  if (hit) return hit;
  // Industry, employees and revenue read as their closest standard value ("< $1M", "51-200", "Software Development").
  const field = list === RN_INDUSTRIES ? "industry" : list === RN_REVENUE ? "revenue" : list === RN_EMPLOYEES ? "employees" : null;
  const std = field ? toStandard(field, raw) : null;
  return std && list.includes(std) ? std : null;
}

const US: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa", ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi", mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire",
  nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
  ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
  wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia",
};
const ALIAS: Record<string, string> = { us: "united states", usa: "united states", uk: "united kingdom" };
/** A place as words, with a US state's two letters spelled out ("Austin, TX" -> austin texas). */
export function placeWords(v: string): string[] {
  const out: string[] = [];
  for (const part of v.toLowerCase().split(",").map((p) => p.trim()).filter(Boolean)) {
    const own = (m: Record<string, string>) => (Object.prototype.hasOwnProperty.call(m, part) ? m[part] : undefined);
    const spelled = own(ALIAS) ?? (part.length === 2 ? own(US) : undefined) ?? part;
    out.push(...spelled.split(/[\s.]+/).filter(Boolean));
  }
  return out;
}

/** Whether an open role matches a saved search. A view that follows hires matches new hires instead (lib/hireAlerts.ts), never an open role. */
export function alertMatches(a: SavedSearch, r: RoleFacts): boolean {
  if (followsHires(a)) return false;
  if (a.function && r.function !== a.function) return false;
  if (a.functions?.length && !(r.function && a.functions.includes(r.function))) return false;
  if (a.country?.length && r.country && !a.country.some((c) => sameCountry(c, r.country!))) return false;
  if (a.industry?.length && !(r.industry && a.industry.includes(r.industry))) return false;
  if (a.employees?.length && !(r.employees && a.employees.includes(r.employees))) return false;
  if (a.revenue?.length && !(r.revenue && a.revenue.includes(r.revenue))) return false;
  if (a.fractionalFriendly && r.pastHires < 1) return false;
  if (a.hq) {
    // A country or a region ("United States", "UK", "Texas") matches every HQ in it, however that HQ was typed.
    const place = placeFilter(a.hq);
    if (place && (r.country || r.region)) return inPlace({ country: r.country ?? null, region: r.region ?? null }, place);
    const want = placeWords(a.hq);
    const have = new Set(placeWords(r.hq ?? ""));
    if (!want.length || !want.every((w) => have.has(w))) return false;
  }
  return true;
}

/** "US", "USA" and "United States" are one country, case aside. */
export const countryKey = (v: string) => {
  const k = v.trim().toLowerCase().replace(/\./g, "");
  return k === "us" || k === "usa" || k === "united states of america" ? "united states" : k === "uk" ? "united kingdom" : k;
};
export const sameCountry = (a: string, b: string) => countryKey(a) === countryKey(b);

/** A readable name for what an alert looks for: "Fractional Marketing roles at SaaS companies, $5M–$20M". */
export function describeAlert(a: Omit<SavedSearch, "id" | "name" | "createdAt">): string {
  // A view that follows hires reads as the table's sentence: "Companies that hired a fractional Finance leader in the last 6 months".
  if (followsHires(a)) {
    const inds = industryWords(a.industry ?? []).map((x) => x.replace(" (all)", ""));
    return [`Companies that hired ${fnLeader(a.hiredFn ?? [])} ${windowPhrase(a.hiredWithin ?? 0)}`, inds.length ? `${inds.join(" or ")} companies` : ""].filter(Boolean).join(", ");
  }
  const fns = a.function ? [a.function] : a.functions ?? [];
  const what = `${fns.length ? `Fractional ${fns.join(" or ")}` : "Fractional"} roles`;
  const inds = industryWords(a.industry ?? []).map((x) => x.replace(" (all)", ""));
  const where = [inds.length ? `${inds.join(" or ")} companies` : "", a.fractionalFriendly ? "that hired fractionals before" : ""].filter(Boolean).join(" ");
  const size = [
    a.revenue?.length ? a.revenue.join(" or ") : "",
    a.employees?.length ? `${a.employees.join(" or ")} employees` : "",
    a.hq ? `in ${a.hq}` : "",
    a.country?.length ? `in ${a.country.join(" or ")}` : "",
  ].filter(Boolean);
  return [`${what}${where ? ` at ${where}` : ""}`, ...size].join(", ");
}

/** The criteria from loose input: list values in their list's spelling. Returns what didn't read, for an honest error. */
export function cleanCriteria(raw: {
  function?: unknown;
  industry?: unknown;
  employees?: unknown;
  revenue?: unknown;
  hq?: unknown;
  fractional_friendly?: unknown;
  functions?: unknown;
  country?: unknown;
  /** Recently hired: the functions (a list) and the window in months (0 or left out: any time). */
  hiredFn?: unknown;
  hiredWithin?: unknown;
}): { criteria: Omit<SavedSearch, "id" | "name" | "createdAt">; problems: string[] } {
  const problems: string[] = [];
  const list = (key: string, values: unknown, options: readonly string[]) => {
    const arr = (Array.isArray(values) ? values : values === undefined || values === null || values === "" ? [] : [values]).slice(0, 10);
    const out: string[] = [];
    for (const v of arr) {
      const p = pickFrom(options, v);
      if (p) out.push(p);
      else problems.push(`${key} "${String(v).slice(0, 40)}" isn't one of: ${options.join(", ")}`);
    }
    return out.length ? [...new Set(out)] : undefined;
  };
  let fn: string | undefined;
  if (raw.function !== undefined && raw.function !== null && raw.function !== "") {
    fn = pickFrom(FUNCTIONS, raw.function) ?? undefined;
    if (!fn) problems.push(`function "${String(raw.function).slice(0, 40)}" isn't one of: ${FUNCTIONS.join(", ")}`);
  }
  const hq = typeof raw.hq === "string" && raw.hq.trim() ? raw.hq.trim().slice(0, 60) : undefined;
  // "Software" (the old label) reads as every Software industry, as an ideal client does.
  const rawInd = Array.isArray(raw.industry) ? raw.industry : raw.industry === undefined || raw.industry === null || raw.industry === "" ? [] : [raw.industry];
  const industry = list("industry", rawInd.flatMap((v) => (/^\s*software(\s*\(all\))?\s*$/i.test(String(v ?? "")) ? standardIndustries([v]) : [v])), RN_INDUSTRIES);
  const employees = list("employees", raw.employees, RN_EMPLOYEES);
  const revenue = list("revenue", raw.revenue, RN_REVENUE);
  const functions = list("function", raw.functions, FUNCTIONS);
  // Countries are free text from the company records: cleaned, never matched against a list.
  const country = (Array.isArray(raw.country) ? raw.country : [])
    .map((v) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 12);
  const hiredFn = list("hired function", raw.hiredFn, FUNCTIONS);
  const hiredWithin = cleanWindow(raw.hiredWithin);
  return {
    criteria: {
      ...(fn ? { function: fn } : {}),
      ...(industry ? { industry } : {}),
      ...(employees ? { employees } : {}),
      ...(revenue ? { revenue } : {}),
      ...(hq ? { hq } : {}),
      ...(raw.fractional_friendly === true ? { fractionalFriendly: true } : {}),
      ...(functions && !fn ? (functions.length === 1 ? { function: functions[0] } : { functions }) : {}),
      ...(country.length ? { country: [...new Set(country)] } : {}),
      ...(hiredFn || hiredWithin ? { hiredFn: hiredFn ?? [], hiredWithin } : {}),
    },
    problems,
  };
}
