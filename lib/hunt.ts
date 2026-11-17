/**
 * Who a member hunts: their ideal client (Profile.icp) and their saved views. Pure functions,
 * no Node imports, so lib/table.ts calls them from inside its write queue.
 *
 * Saved views live in the same store as the Claude connector's saved searches
 * (State.connector.alerts, lib/mcp/alerts.ts), so the app and the connector list the same views
 * and the weekly email (lib/table.ts digestList) matches both the same way.
 */
import { RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, stripInvisible } from "./tableFields";
import type { Icp, SavedViewCriteria, SavedViewRec } from "./tableTypes";
import { ALERT_MAX, cleanCriteria, describeAlert, pickFrom, type SavedSearch } from "./mcp/alerts";

/** Problems the member can fix, as the app shows them. */
export class HuntError extends Error {}

const textList = (raw: unknown, max: number, len: number) =>
  [...new Set((Array.isArray(raw) ? raw : []).map((v) => stripInvisible(String(v ?? "")).replace(/[<>]/g, "").trim().slice(0, len)).filter(Boolean))].slice(0, max);

/**
 * An ideal client from loose input. Pick-list values come back in their list's spelling and
 * anything not on the list is dropped (a list can change under a saved answer). Null clears it.
 */
export function cleanIcp(raw: unknown): Icp | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") throw new HuntError("Pick your clients from the lists.");
  const r = raw as Record<string, unknown>;
  const pick = (v: unknown, list: readonly string[]) =>
    [...new Set((Array.isArray(v) ? v : []).slice(0, 40).map((x) => pickFrom(list, x)).filter((x): x is string => !!x))];
  return {
    industries: pick(r.industries, RN_INDUSTRIES),
    employees: pick(r.employees, RN_EMPLOYEES),
    revenue: pick(r.revenue, RN_REVENUE),
    countries: textList(r.countries, 12, 60),
  };
}

/** The views as the app gets them (Me.savedViews). */
export function savedViewsOut(list: SavedSearch[] | undefined): SavedViewRec[] {
  return (list ?? []).map((a) => {
    const { id, name, createdAt, place, email, ...criteria } = a;
    return { id, name, createdAt, place: place ?? null, email: email !== false, criteria: criteria as SavedViewCriteria };
  });
}

/** One savedView action on a member's list. Returns the new list and what to say. */
export function savedViewAction(
  list: SavedSearch[],
  a: { op: string; id?: string; name?: string; place?: string; criteria?: SavedViewCriteria; email?: boolean; on?: boolean },
  newId: () => string,
  now: string,
): { list: SavedSearch[]; message: string; id?: string } {
  if (a.op === "delete") {
    const next = list.filter((x) => x.id !== a.id);
    if (next.length === list.length) throw new HuntError("That saved view is gone already.");
    return { list: next, message: "Removed that saved view." };
  }
  if (a.op === "email") {
    const at = list.findIndex((x) => x.id === a.id);
    if (at < 0) throw new HuntError("That saved view is gone already.");
    const next = [...list];
    next[at] = { ...next[at], email: a.on !== false };
    return {
      list: next,
      id: a.id,
      message: a.on !== false ? "We'll email you new matches each week." : "No more weekly email for this view. It stays saved.",
    };
  }
  if (a.op !== "save") throw new HuntError("Save, delete or email.");
  if (list.length >= ALERT_MAX) throw new HuntError(`You have ${ALERT_MAX} saved views, which is the most. Remove one first.`);
  const c = a.criteria ?? {};
  const { criteria, problems } = cleanCriteria({
    function: c.function,
    functions: c.functions,
    industry: c.industry,
    employees: c.employees,
    revenue: c.revenue,
    hq: c.hq,
    country: c.country,
    fractional_friendly: c.fractionalFriendly,
  });
  if (problems.length) throw new HuntError("Some of these filters aren't on our lists any more. Change them and save again.");
  // The place is the app's own address query: kept as text, never read by the server.
  const place = typeof a.place === "string" ? a.place.replace(/[\u0000-\u001f<>"]/g, "").replace(/^\?/, "").slice(0, 1500) : "";
  const name = stripInvisible(String(a.name ?? "")).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 100) || describeAlert(criteria);
  const id = newId();
  const saved: SavedSearch = { id, name, ...criteria, createdAt: now, place, ...(a.email === false ? { email: false } : {}) };
  return { list: [...list, saved], id, message: a.email === false ? `Saved "${name}".` : `Saved "${name}". New matches come in your weekly email.` };
}
