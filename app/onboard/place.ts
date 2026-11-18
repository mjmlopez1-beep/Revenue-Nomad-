/**
 * Where onboarding's saved views open. The open roles one ("Also show open <function> roles"):
 * Hiring now on seats, in the member's function, with the Ideal Fractional Profile pill on
 * (alertView in suggest.ts names it and gives its email criteria), and the place it had before the
 * pill, with the profile spelled out as hard filters, which opened empty: lib/table.ts moves views
 * saved that way when the state loads. And the member's first view, which the table opens on.
 * No imports, so the server reads this file as it is, wherever it runs from.
 */

/** The parts of an Ideal Fractional Profile this reads (Icp in lib/tableTypes.ts). */
export interface ProfileParts {
  industries: string[];
  employees: string[];
  revenue: string[];
  countries: string[];
}

/** The member's function as the view filters on it. The catch-alls don't read as one ("Other roles"). */
export const viewFunction = (fn: string | null | undefined) => (fn && fn !== "Other" && fn !== "Executive" ? fn : null);
const parts = (icp: ProfileParts | null | undefined) => ({
  industries: icp?.industries ?? [],
  employees: icp?.employees ?? [],
  revenue: icp?.revenue ?? [],
  countries: icp?.countries ?? [],
});
const hasProfile = (icp: ProfileParts | null | undefined) => {
  const p = parts(icp);
  return !!(p.industries.length || p.employees.length || p.revenue.length || p.countries.length);
};
/** "US", "USA" and "United States" are one country, spelled the app's way (countryName in app/post/model.ts). */
const countryName = (v: string) => {
  const k = v.trim().toLowerCase().replace(/\./g, "");
  return k === "us" || k === "usa" || k === "united states of america" || k === "united states" ? "United States" : k === "uk" || k === "united kingdom" ? "United Kingdom" : v.trim();
};

/** Hiring now on seats with these filters, written the way the table writes a place (encodeFilters in app/post/TradingPost.tsx). */
const hiringPlace = (filters: string[]) => {
  const q = new URLSearchParams();
  q.set("v", "hiring");
  q.set("t", "seats");
  q.set("f", filters.join("~") || "-");
  return q.toString();
};

/** The view's place: the function as its one hard filter, and the profile as the pill. */
export function onboardingPlace(fn: string | null | undefined, icp: ProfileParts | null | undefined): string {
  const f = viewFunction(fn);
  return hiringPlace([...(f ? [`fn:${f}`] : []), ...(hasProfile(icp) ? ["icp"] : [])]);
}

/** The place the view had before: the profile spelled out as hard Industry, Employees, Revenue and Country filters, in the table's order. */
function spelledPlace(fn: string | null | undefined, icp: ProfileParts): string {
  const f = viewFunction(fn);
  const p = parts(icp);
  const list = (key: string, xs: string[]) => (xs.length ? [`${key}:${[...new Set(xs)].join("|")}`] : []);
  return hiringPlace([...list("industry", p.industries), ...list("employees", p.employees), ...list("revenue", p.revenue), ...(f ? [`fn:${f}`] : []), ...list("country", p.countries.map(countryName))]);
}

/**
 * The member's first view (Me.firstView, the saved view onboarding made) while it is still saved:
 * its place, which the table opens on when the address names none. Null otherwise, and for a
 * member from before the first view (their onboarding answer, Me.goal, still decides).
 */
export function firstViewPlace(me: { firstView?: string | null; savedViews?: { id: string; place: string | null }[] | null }): string | null {
  const id = me.firstView;
  if (!id) return null;
  return me.savedViews?.find((v) => v.id === id)?.place || null;
}

/**
 * A saved view onboarding made before the pill: the place it should have now, when `place` is
 * exactly the old form for this member's function and profile. Null otherwise (nothing to change).
 */
export function pillPlace(place: string | null | undefined, fn: string | null | undefined, icp: ProfileParts | null | undefined): string | null {
  if (!place || !icp || !hasProfile(icp)) return null;
  const old = spelledPlace(fn, icp);
  const now = onboardingPlace(fn, icp);
  return place === old && old !== now ? now : null;
}
