/**
 * Saved lists in the app (BUILD_PLAN F5, Stage 1): the list fields on saved views, the "Made for
 * you" starter lists from the ideal client, and the savedView ops the app sends for them
 * (lib/tableTypes.ts Action savedView, read by lib/hunt.ts savedViewAction).
 */
import type { Action, Me, SavedViewCriteria, SavedViewRec } from "@/lib/tableTypes";
import { listOf, placeKey, type SavedListRec } from "@/lib/hunt";
import { LIST_KIND_LABEL, type ListAlert, type ListKind } from "@/lib/mcp/alerts";
import { EMPTY_FILTERS, absolutePlace, criteriaOf, icpEmpty, icpLabel, namedFn, withIcpSpelled, type CoInfo, type Filters, type RecordType, type SortKey, type Tab } from "../model";
import { likeCriteria, lookalikesFor } from "./lookalikes";

export type { SavedListRec };

/** The savedView ops for lists, as the server reads them (lib/hunt.ts savedViewAction). */
export type ListOp =
  | { op: "save"; name: string; place: string; criteria: SavedViewCriteria; email?: boolean; list?: { kind?: ListKind; cols?: string[]; starter?: boolean; alert?: Partial<ListAlert> } }
  | { op: "alert"; id: string; list: { alert: Partial<ListAlert> } }
  | { op: "list"; id: string; list: { kind?: ListKind; cols?: string[]; starter?: boolean } }
  | { op: "opened"; id: string };
export const listAct = (x: ListOp): Action => ({ type: "savedView", ...x });

/** The member's saved views, read as lists. */
export const listsOf = (me: Me): SavedListRec[] => (me.savedViews ?? []).map(listOf);

/** What a list holds, from its own kind or its place. */
export function kindOfList(v: SavedListRec): ListKind {
  if (v.kind) return v.kind;
  const p = new URLSearchParams(v.place ?? "");
  if (p.get("v") === "hiring") return "roles";
  if (p.get("t") === "seats") return "seats";
  if (p.get("t") === "people") return "people";
  return v.place ? "companies" : "roles";
}
export const kindLabel = (k: ListKind) => LIST_KIND_LABEL[k];

/** The alert in a few words: "On · weekly email", "On · email and Slack", "Off". */
export function alertWords(a: ListAlert): string {
  if (!a.on) return "Off";
  return `On · ${[a.email ? "weekly email" : "", a.slack ? "Slack" : ""].filter(Boolean).join(" and ") || "weekly email"}`;
}

/** A list not saved yet (a starter): what it would save. */
export interface StarterList {
  key: string;
  name: string;
  kind: ListKind;
  place: string;
  criteria: SavedViewCriteria;
  /** It stands for a saved view while it isn't one (openView reads its place). */
  asView: SavedViewRec;
}

const place = (t: RecordType, v: Tab, s: SortKey | null, f: Filters) => absolutePlace({ t, v, s, f, q: "" });

/**
 * "Made for you": three lists from the ideal client the member gave (Home's first visit). Each is
 * left out once the member saved it, or one that opens the same rows. None without an ideal client.
 */
export function starterLists(me: Me, infos: CoInfo[] | null = null, now = new Date().toISOString()): StarterList[] {
  const fn = namedFn(me.function ?? null);
  const icpF = withIcpSpelled({ ...EMPTY_FILTERS, icp: true }, me.icp);
  const out: { key: string; name: string; kind: ListKind; t: RecordType; v: Tab; s: SortKey | null; f: Filters }[] = [];
  if (!icpEmpty(me.icp)) out.push({ key: "icp", name: "Your ideal client", kind: "companies", t: "companies", v: "all", s: "best", f: icpF });
  // Like your past clients: once the member has a seat with something on file to match.
  const like = infos ? lookalikesFor(infos, me) : null;
  if (like && like.tokens.some((t) => !t.startsWith("x:"))) out.push({ key: "like", name: "Like your past clients", kind: "companies", t: "companies", v: "all", s: "best", f: { ...EMPTY_FILTERS, like: like.tokens } });
  if (fn && !icpEmpty(me.icp)) {
    out.push({ key: "roles", name: `Open ${fn} roles at your kind of company`, kind: "roles", t: "engagements", v: "hiring", s: null, f: { ...icpF, fn: [fn] } });
    out.push({ key: "ended", name: `${fn} seats that ended in the last 90 days`, kind: "seats", t: "engagements", v: "all", s: null, f: { ...EMPTY_FILTERS, fn: [fn], endedWithin: 3 } });
  }
  const have = new Set(listsOf(me).map((v) => placeKey(v.place)).filter(Boolean));
  return out
    .map((x) => {
      const p = place(x.t, x.v, x.s, x.f);
      const criteria = x.f.like.length ? { ...criteriaOf({ ...x.f, like: [] }, null), ...likeCriteria(x.f.like) } : criteriaOf(x.f, null);
      return { key: x.key, name: x.name, kind: x.kind, place: p, criteria, asView: { id: `starter:${x.key}`, name: x.name, place: p, criteria, email: false, createdAt: now } };
    })
    .filter((x) => !have.has(placeKey(x.place)));
}

/** The ideal client as chips ("Industries: Software, EdTech", "Size: 11 to 500 people"). */
export function icpChips(me: Me): string[] {
  if (icpEmpty(me.icp)) return [];
  const fn = namedFn(me.function ?? null);
  const parts = icpLabel(me.icp).split(" · ");
  return [...(fn ? [`Function: ${fn}`] : []), ...parts.filter(Boolean)];
}

/* ---------- favorites: this browser only (a per-viewer convenience; the list fields have none) ---------- */

const FAV_KEY = "rn_list_favs";
export function readFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}
export function writeFavs(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids.slice(0, 50)));
  } catch {
    /* private window: favorites last this visit */
  }
}
