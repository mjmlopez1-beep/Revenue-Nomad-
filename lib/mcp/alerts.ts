/**
 * Saved searches ("alerts") for open roles, kept on the member (State.connector.alerts).
 * Pure functions, no Node imports: the weekly email (lib/table.ts digestList) and the
 * connector's tools (lib/mcp/tools.ts) match roles with the same rules.
 *
 * An alert matches an open role by free facts only (the seat's function and the company's
 * industry, size, revenue and HQ), never by a locked one, so a match never gives away a
 * locked value or a hidden company.
 */
import { FUNCTIONS, LEGACY_VALUES, RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, currentValue } from "../tableFields";
import { inPlace, placeFilter } from "../geo";

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
  createdAt: string;
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

/** Dashes, case and spacing aside: "$5m-$20m" is "$5M–$20M", "software" is "Software". */
const squash = (v: string) => v.toLowerCase().replace(/[‐-―−-]/g, "-").replace(/\s+/g, "").replace(/,/g, "");

/** The list's own spelling of what was typed, or null when it isn't on the list. */
export function pickFrom(list: readonly string[], raw: unknown): string | null {
  const want = squash(String(raw ?? ""));
  if (!want) return null;
  const hit = list.find((x) => squash(x) === want);
  if (hit) return hit;
  // An older label ("SaaS", "< $1M") reads as the current one, when that one is on this list.
  for (const field of ["industry", "revenue"]) {
    const now = currentValue(field, String(raw ?? "").trim());
    if (list.includes(now)) return now;
    for (const [old, cur] of Object.entries(LEGACY_VALUES[field] ?? {})) if (squash(old) === want && list.includes(cur)) return cur;
  }
  return null;
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

/** Whether an open role matches a saved search. */
export function alertMatches(a: SavedSearch, r: RoleFacts): boolean {
  if (a.function && r.function !== a.function) return false;
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

/** A readable name for what an alert looks for: "Fractional Marketing roles at SaaS companies, $5M–$20M". */
export function describeAlert(a: Omit<SavedSearch, "id" | "name" | "createdAt">): string {
  const what = `${a.function ? `Fractional ${a.function}` : "Fractional"} roles`;
  const where = [a.industry?.length ? `${a.industry.join(" or ")} companies` : "", a.fractionalFriendly ? "that hired fractionals before" : ""].filter(Boolean).join(" ");
  const size = [a.revenue?.length ? a.revenue.join(" or ") : "", a.employees?.length ? `${a.employees.join(" or ")} employees` : "", a.hq ? `in ${a.hq}` : ""].filter(Boolean);
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
  const industry = list("industry", raw.industry, RN_INDUSTRIES);
  const employees = list("employees", raw.employees, RN_EMPLOYEES);
  const revenue = list("revenue", raw.revenue, RN_REVENUE);
  return {
    criteria: {
      ...(fn ? { function: fn } : {}),
      ...(industry ? { industry } : {}),
      ...(employees ? { employees } : {}),
      ...(revenue ? { revenue } : {}),
      ...(hq ? { hq } : {}),
      ...(raw.fractional_friendly === true ? { fractionalFriendly: true } : {}),
    },
    problems,
  };
}
