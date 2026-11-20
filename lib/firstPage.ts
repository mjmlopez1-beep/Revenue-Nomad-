/**
 * GET /api/table?first=1&place=<the address's query>[&off=a,b][&since=ISO]: the first screen
 * before the full view, so a phone draws its first cards without parsing the member's whole table.
 *
 *   - Today's address (no place in it, app/post/place.ts isHome): Today's answer (lib/today.ts),
 *     which needs no full table at all.
 *   - Any other: the member's view as the table builds it (buildView), without its companies but
 *     the ones of the list's first FIRST_ROWS rows (and the company ?c= opens), and `first`, the
 *     counts the table's first screen shows, worked out on the whole table (place.ts listAt, the
 *     same functions the page runs). The records are the full view's own objects, so they are
 *     exactly what the full view sends for those companies, their locks with them.
 *
 * `off`: the onboarding presets the member took off in this browser (TradingPost presetsOff).
 * Server side only.
 */
import { buildView } from "./table";
import { todayView } from "./today";
import { packCompany, type TodayView } from "./viewWire";
import type { View } from "./tableTypes";
import { deriveAll } from "@/app/post/model";
import { FIRST_ROWS, isHome, listAt, parsePlace, type FirstList } from "@/app/post/place";

export type FirstAnswer = { today: TodayView } | { view: View & { packed: true }; first: FirstList };

/**
 * The first screen for `token`'s member, or null when the token is nobody's. `built` hands the
 * whole view it built to the caller (the route keeps it for the full view asked for next).
 */
export async function firstPage(
  token: string | null,
  search: string,
  opts: { off?: string | null; since?: string | null; asMember?: boolean; built?: (v: View) => void } = {},
): Promise<FirstAnswer | null> {
  const place = String(search ?? "").slice(0, 2000);
  if (isHome(place)) {
    const today = await todayView(token, opts.since ?? null);
    return today ? { today } : null;
  }
  const view = await buildView(token, { asMember: opts.asMember });
  if (!view.me) return null;
  opts.built?.(view);
  const first = listFor(view, place, opts.off ?? "").first;
  // "Since your last visit": the companies they follow that changed, counted as the page counts them (on the previous visit's own text).
  const since = opts.since ? String(opts.since).slice(0, 40) : "";
  const follows = since ? view.companies.filter((c) => c.following && c.updatedAt && c.updatedAt > since).length : undefined;
  return { view: firstView(view, place, opts.off ?? ""), first: follows === undefined ? first : { ...first, follows } };
}

const offSet = (off: string) => new Set(off.split(",").map((x) => x.trim()).filter(Boolean));

/** The first page's counts and the ids of the companies it carries, from the member's whole view. */
function listOf(view: View, place: string, off: string) {
  const me = view.me!;
  const p = parsePlace(me, place, offSet(off));
  const { rows, first } = listAt(deriveAll(view.companies), me, p, offSet(off));
  const ids = new Set<string>();
  for (const r of rows.slice(0, FIRST_ROWS)) ids.add(r.i.c.id);
  // A link to a company (?c=) opens its record at once.
  if (p.c) ids.add(p.c);
  return { first, ids };
}
const memo = new WeakMap<View, Map<string, ReturnType<typeof listOf>>>();
const listFor = (view: View, place: string, off: string) => {
  let m = memo.get(view);
  if (!m) memo.set(view, (m = new Map()));
  const k = `${place}\u0000${off}`;
  let x = m.get(k);
  if (!x) m.set(k, (x = listOf(view, place, off)));
  return x;
};

/** The view with only the first page's companies, in the view's own order, packed as the view packs them (lib/viewWire.ts). */
export function firstView(view: View, place: string, off = ""): View & { packed: true } {
  const { ids } = listFor(view, place, off);
  // The rates are the Rates page's, which waits for the full view.
  const { benchmarks: _b, ...rest } = view;
  void _b;
  return { ...rest, companies: view.companies.filter((c) => ids.has(c.id)).map(packCompany), packed: true } as View & { packed: true };
}
