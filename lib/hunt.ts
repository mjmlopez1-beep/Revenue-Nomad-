/**
 * Who a member hunts: their Ideal Fractional Profile (Profile.icp, the companies they want as clients) and their saved views. Pure functions,
 * no Node imports, so lib/table.ts calls them from inside its write queue.
 *
 * Saved views live in the same store as the Claude connector's saved searches
 * (State.connector.alerts, lib/mcp/alerts.ts), so the app and the connector list the same views
 * and the weekly email (lib/table.ts digestList) matches both the same way.
 */
import { RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE, standardIndustries, stripInvisible } from "./tableFields";
import type { Icp, SavedViewCriteria, SavedViewRec } from "./tableTypes";
import { ALERT_EVERY, ALERT_MAX, alertOf, cleanCriteria, cleanListFields, cleanTriggers, countryKey, describeAlert, pickFrom, type AlertEvery, type ListAlert, type ListKind, type SavedSearch } from "./mcp/alerts";
import { followsHires } from "./hired";

/** Problems the member can fix, as the app shows them. */
export class HuntError extends Error {}

const textList = (raw: unknown, max: number, len: number) =>
  [...new Set((Array.isArray(raw) ? raw : []).map((v) => stripInvisible(String(v ?? "")).replace(/[<>]/g, "").trim().slice(0, len)).filter(Boolean))].slice(0, max);

/**
 * An Ideal Fractional Profile from loose input. Pick-list values come back in their list's spelling and
 * anything not on the list is dropped (a list can change under a saved answer). Null clears it.
 */
export function cleanIcp(raw: unknown): Icp | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") throw new HuntError("Pick your Ideal Fractional Profile from the lists.");
  const r = raw as Record<string, unknown>;
  const pick = (v: unknown, list: readonly string[]) =>
    [...new Set((Array.isArray(v) ? v : []).slice(0, 40).map((x) => pickFrom(list, x)).filter((x): x is string => !!x))];
  return {
    // "Software" (an older label) reads as every Software industry, like a saved answer does on load.
    industries: standardIndustries((Array.isArray(r.industries) ? r.industries : []).slice(0, 40)).filter((x) => RN_INDUSTRIES.includes(x)),
    employees: pick(r.employees, RN_EMPLOYEES),
    revenue: pick(r.revenue, RN_REVENUE),
    countries: textList(r.countries, 12, 60),
  };
}

/** What a saved view looks for: everything but its id, name, date, place, email and its list fields. */
function criteriaOfView(a: SavedSearch): SavedViewCriteria {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, name: _name, createdAt: _at, place: _place, email: _email, kind: _kind, cols: _cols, starter: _starter, openedAt: _opened, alert: _alert, ...criteria } = a;
  return criteria;
}

/** Where a list's alert goes, in words: "by email each week, in Slack, in the bell". */
function howWords(alert: Required<ListAlert>): string {
  const often = alert.every === "instant" ? "as it happens" : alert.every === "daily" ? "every morning" : "each week";
  return [alert.email ? `by email ${often}` : "", alert.slack ? "in Slack" : "", alert.bell ? "in the bell" : ""].filter(Boolean).join(", ") || "by email";
}

/** A saved view as a list (F5): SavedViewRec's list fields, each with its default filled in. */
export interface SavedListFields {
  kind: ListKind | null;
  cols: string[];
  starter: boolean;
  openedAt: string | null;
  alert: Required<ListAlert>;
}
export type SavedListRec = SavedViewRec & SavedListFields;

/** The views as the app gets them (Me.savedViews), with their list fields. */
export function savedViewsOut(list: SavedSearch[] | undefined): SavedListRec[] {
  return (list ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    createdAt: a.createdAt,
    place: a.place ?? null,
    email: a.email !== false,
    criteria: criteriaOfView(a),
    kind: a.kind ?? null,
    cols: a.cols ?? [],
    starter: a.starter === true,
    openedAt: a.openedAt ?? null,
    alert: alertOf(a),
  }));
}

/** A saved view read as a list, whatever server sent it (an older one leaves the list fields out). */
export function listOf(v: SavedViewRec): SavedListRec {
  return {
    ...v,
    kind: v.kind ?? null,
    cols: Array.isArray(v.cols) ? v.cols : [],
    starter: v.starter === true,
    openedAt: v.openedAt ?? null,
    alert: alertOf({ alert: v.alert, email: v.email, hiredFn: v.criteria?.hiredFn, hiredWithin: v.criteria?.hiredWithin }),
  };
}

/* ---------- the same view twice ---------- */

/** A filters value ("fn:Sales|Finance~icp") written one way: each list in order, then the parts in order. */
const filtersKey = (raw: string) =>
  (raw === "-" ? "" : raw)
    .split("~")
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf(":");
      return at < 0 ? part : `${part.slice(0, at)}:${part.slice(at + 1).split("|").filter(Boolean).sort().join("|")}`;
    })
    .sort()
    .join("~");

/**
 * Where a view saved in the app opens, written one way: its list, tab, search and filters, in any
 * order, without the sort, since the same rows in another order are the same view. Null for a view
 * with no place (a search saved in Claude).
 */
export function placeKey(place: string | null | undefined): string | null {
  const raw = String(place ?? "").replace(/^\?/, "").trim();
  if (!raw) return null;
  const parts: string[] = [];
  for (const [k, v] of new URLSearchParams(raw)) {
    if (k === "s") continue;
    const val = k === "f" ? filtersKey(v) : k === "q" ? v.trim().toLowerCase().replace(/\s+/g, " ") : v;
    if (val) parts.push(`${k}=${val}`);
  }
  return parts.sort().join("&");
}

/** What a view looks for (its criteria), written one way: each list in order, a place and the countries in one spelling. */
export function criteriaKey(c: SavedViewCriteria): string {
  const list = (xs: readonly string[] | undefined) => [...new Set((xs ?? []).map((x) => String(x).trim()).filter(Boolean))].sort();
  return JSON.stringify([
    list(c.function ? [c.function] : c.functions),
    list(c.industry),
    list(c.employees),
    list(c.revenue),
    String(c.hq ?? "").trim().toLowerCase().replace(/\s+/g, " "),
    list((c.country ?? []).map(countryKey)),
    !!c.fractionalFriendly,
    followsHires(c) ? [list(c.hiredFn), c.hiredWithin ?? 0] : null,
  ]);
}

/**
 * The member's saved view that is this one already, or null. Two views saved in the app are the same
 * when they open the same rows (placeKey: the same list, tab, search and filters, whatever the sort).
 * A search saved in Claude has no place, so it is the same as any view that looks for the same
 * things (criteriaKey). `except`: a view to leave out (the one being put back).
 */
export function sameView(list: SavedSearch[], v: { place?: string | null; criteria: SavedViewCriteria }, except?: string): SavedSearch | null {
  const here = placeKey(v.place);
  const wants = criteriaKey(v.criteria);
  for (const x of list) {
    if (x.id === except) continue;
    const there = placeKey(x.place);
    if (here && there ? here === there : criteriaKey(x) === wants) return x;
  }
  return null;
}

/** What "You saved this view already" says, with the name it was saved as. */
export const savedAlready = (v: SavedSearch) => `You saved this view already, as "${v.name}".`;

/* ---------- save, rename, remove, put back, the weekly email ---------- */

/** A view's name as save and rename keep it: no invisible or control characters or angle brackets, at most 100 characters. */
const cleanName = (raw: unknown) => stripInvisible(String(raw ?? "")).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 100);

/** The criteria from the app's loose input, cleaned the way the connector's are. Throws when a value isn't on our lists. */
function viewCriteria(c: SavedViewCriteria = {}) {
  const { criteria, problems } = cleanCriteria({
    function: c.function,
    functions: c.functions,
    industry: c.industry,
    employees: c.employees,
    revenue: c.revenue,
    hq: c.hq,
    country: c.country,
    fractional_friendly: c.fractionalFriendly,
    // Recently hired: a view that follows hires (lib/hired.ts). The email reads it from its place.
    hiredFn: c.hiredFn,
    hiredWithin: c.hiredWithin,
  });
  if (problems.length) throw new HuntError("Some of these filters aren't on our lists any more. Change them and save again.");
  return criteria;
}

/** The place is the app's own address query: kept as text, never read by the server. */
const cleanPlace = (raw: unknown) => (typeof raw === "string" ? raw.replace(/[\u0000-\u001f<>"]/g, "").replace(/^\?/, "").slice(0, 1500) : "");

/** A view put back (Undo after Remove): it keeps the id it had, if that id is one we would make and is free. */
const VIEW_ID = /^al_[A-Za-z0-9_-]{8}$/;

/**
 * One savedView action on a member's list. Returns the new list, what to say, and the view's id.
 *   save     a new view. One the member has already (sameView) is not saved twice: the answer
 *            says so, with that view's id, and the list stays as it was.
 *   rename   a new name, cleaned as save cleans it (nothing left: a name made from the criteria).
 *   delete   remove it.
 *   restore  put a removed view back where it was (`view`, `at`), with its id, so a first view is
 *            one again. Not when the member saved the same view since.
 *   email    the weekly email for it on or off (`on`).
 */
export function savedViewAction(
  list: SavedSearch[],
  a: {
    op: string;
    id?: string;
    name?: string;
    place?: string;
    criteria?: SavedViewCriteria;
    email?: boolean;
    on?: boolean;
    view?: { id?: unknown; name?: unknown; place?: unknown; criteria?: SavedViewCriteria; email?: unknown; createdAt?: unknown; kind?: unknown; cols?: unknown; starter?: unknown; alert?: unknown };
    at?: number;
    /** save and list: the list's own fields (kind, columns, a starter list, its alert). */
    list?: { kind?: unknown; cols?: unknown; starter?: unknown; alert?: unknown };
  },
  newId: () => string,
  now: string,
  /** free: the member is on Free now (as it happens is Pro's). */
  opts: { free?: boolean } = {},
): { list: SavedSearch[]; message: string; id?: string } {
  const gone = () => new HuntError("That saved view is gone already.");
  if (a.op === "delete") {
    const next = list.filter((x) => x.id !== a.id);
    if (next.length === list.length) throw gone();
    return { list: next, message: "Removed that saved view." };
  }
  if (a.op === "email") {
    const at = list.findIndex((x) => x.id === a.id);
    if (at < 0) throw gone();
    const next = [...list];
    // A list with an alert: the weekly email is the alert's email, and turning it on turns the alert on.
    const was = next[at].alert;
    next[at] = { ...next[at], email: a.on !== false, ...(was ? { alert: { ...was, email: a.on !== false, on: a.on !== false ? true : was.slack && was.on } } : {}) };
    return {
      list: next,
      id: a.id,
      message: a.on !== false ? "We'll email you new matches each week." : "No more weekly email for this view. It stays saved.",
    };
  }
  if (a.op === "alert") {
    // The alert on a list: on or off, what sets it off, how often, and where it goes (email, Slack, the bell). The weekly email follows it.
    const at = list.findIndex((x) => x.id === a.id);
    if (at < 0) throw gone();
    const cur = alertOf(list[at]);
    const raw = (a.list?.alert ?? {}) as Record<string, unknown>;
    const every = (ALERT_EVERY as readonly unknown[]).includes(raw.every) ? (raw.every as AlertEvery) : cur.every;
    // As it happens is Pro's: a Free member is told so, and nothing changes.
    if (opts.free && every === "instant" && cur.every !== "instant") throw new HuntError("As it happens is part of Pro. On Free an alert comes every morning or weekly.");
    const alert: Required<ListAlert> = {
      on: typeof raw.on === "boolean" ? raw.on : a.on !== undefined ? a.on !== false : cur.on,
      triggers: cleanTriggers(raw.triggers) ?? cur.triggers,
      every,
      email: typeof raw.email === "boolean" ? raw.email : cur.email,
      slack: typeof raw.slack === "boolean" ? raw.slack : cur.slack,
      bell: typeof raw.bell === "boolean" ? raw.bell : cur.bell,
    };
    // An alert on with no channel would say nothing: on means by email at least.
    if (alert.on && !alert.email && !alert.slack && !alert.bell) alert.email = true;
    const next = [...list];
    next[at] = { ...next[at], alert, email: alert.on && alert.email };
    return { list: next, id: a.id, message: alert.on ? `Alert on for "${next[at].name}": ${howWords(alert)}.` : `Alert off for "${next[at].name}". It stays saved.` };
  }
  if (a.op === "list") {
    // A list's columns, kind or starter flag changed (the alert has its own op).
    const at = list.findIndex((x) => x.id === a.id);
    if (at < 0) throw gone();
    const { alert: _alert, ...f } = cleanListFields(a.list); // eslint-disable-line @typescript-eslint/no-unused-vars
    const next = [...list];
    next[at] = { ...next[at], ...f };
    return { list: next, id: a.id, message: "" };
  }
  if (a.op === "opened") {
    // Opened in the app: the lists table's Opened and New read it. Says nothing.
    const at = list.findIndex((x) => x.id === a.id);
    if (at < 0) throw gone();
    const next = [...list];
    next[at] = { ...next[at], openedAt: now };
    return { list: next, id: a.id, message: "" };
  }
  if (a.op === "rename") {
    const at = list.findIndex((x) => x.id === a.id);
    if (at < 0) throw gone();
    const name = cleanName(a.name) || describeAlert(criteriaOfView(list[at]));
    const next = [...list];
    next[at] = { ...next[at], name };
    return { list: next, id: next[at].id, message: `Renamed it "${name}".` };
  }
  if (a.op === "restore") {
    const v = a.view ?? {};
    const criteria = viewCriteria(v.criteria);
    // A search saved in Claude has no place, and keeps none.
    const place = typeof v.place === "string" ? cleanPlace(v.place) : undefined;
    const dup = sameView(list, { place, criteria });
    if (dup) return { list, id: dup.id, message: savedAlready(dup) };
    if (list.length >= ALERT_MAX) throw new HuntError(`You have ${ALERT_MAX} saved views, which is the most. Remove one first.`);
    const keep = typeof v.id === "string" && VIEW_ID.test(v.id) && !list.some((x) => x.id === v.id);
    const id = keep ? (v.id as string) : newId();
    const made = typeof v.createdAt === "string" && Number.isFinite(Date.parse(v.createdAt)) && Date.parse(v.createdAt) <= Date.parse(now) ? new Date(v.createdAt).toISOString() : now;
    const name = cleanName(v.name) || describeAlert(criteria);
    // The alert as Me.savedViews read it for a view saved before lists had one (alertOf) is no alert of its own: it stays out, so the view comes back as it was.
    const a0 = v.alert as Partial<ListAlert> | undefined;
    const d0 = alertOf({ email: v.email === false ? false : undefined });
    const ownAlert = a0 && typeof a0 === "object" && !(a0.on === d0.on && a0.email === d0.email && a0.slack === d0.slack) ? a0 : undefined;
    const fields = cleanListFields({ kind: v.kind, cols: v.cols, starter: v.starter, alert: ownAlert });
    const back: SavedSearch = { id, name, ...criteria, createdAt: made, ...(place !== undefined ? { place } : {}), ...(v.email === false ? { email: false } : {}), ...fields };
    if (back.alert) back.email = back.alert.on && back.alert.email;
    const at = Math.max(0, Math.min(list.length, Number.isInteger(a.at) ? (a.at as number) : list.length));
    return { list: [...list.slice(0, at), back, ...list.slice(at)], id, message: `"${name}" is back.` };
  }
  if (a.op !== "save") throw new HuntError("Save, rename, delete or email.");
  const criteria = viewCriteria(a.criteria);
  const place = cleanPlace(a.place);
  // The same view twice is one view: say which one it is, and change nothing.
  const dup = sameView(list, { place, criteria });
  if (dup) return { list, id: dup.id, message: savedAlready(dup) };
  if (list.length >= ALERT_MAX) throw new HuntError(`You have ${ALERT_MAX} saved views, which is the most. Remove one first.`);
  const name = cleanName(a.name) || describeAlert(criteria);
  const id = newId();
  const fields = cleanListFields(a.list);
  const saved: SavedSearch = { id, name, ...criteria, createdAt: now, place, ...(a.email === false ? { email: false } : {}), ...fields };
  // A list saved with its alert: the weekly email is the alert's.
  if (saved.alert) saved.email = saved.alert.on && saved.alert.email;
  const mailed = saved.email !== false;
  // A list saved with its own alert says where that alert goes; a view without one keeps its weekly email's words.
  if (saved.alert) return { list: [...list, saved], id, message: saved.alert.on ? `Saved "${name}". Its alert is on: ${howWords(alertOf(saved))}.` : `Saved "${name}".` };
  return { list: [...list, saved], id, message: !mailed ? `Saved "${name}".` : `Saved "${name}". New matches come in your weekly email.` };
}
