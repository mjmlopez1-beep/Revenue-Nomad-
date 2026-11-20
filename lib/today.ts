/**
 * GET /api/table?today=1[&since=ISO] (TodayView in lib/viewWire.ts): what Today draws before the
 * full view arrives. The member, their plan and free company of the day, Crystal Ball's top 4 of
 * its latest day (radarView's own rows, so a company is named only where the member's table names
 * it, Trial and Pro aside) with their records exactly as the table builds them (viewPatch), and
 * with `since`, the counts for "Since Tuesday". A few KB, under TODAY_MAX, built in milliseconds
 * outside the view queue. Server side only.
 */
import { radarView } from "./radar";
import { todayCounts, viewPatch } from "./table";
import { packCompany, type TodayView } from "./viewWire";

/** The most Today's answer carries: past it, its companies are left off from the last. */
export const TODAY_MAX = 20_000;
/** How far back &since= may reach (Crystal Ball keeps its days for less). */
const SINCE_MAX_MS = 60 * 86_400_000;
/** How many of the day's companies Today carries. */
const TODAY_ROWS = 4;

/** Null when the token is nobody's. */
export async function todayView(token: string | null, sinceRaw?: string | null, nowMs = Date.now()): Promise<TodayView | null> {
  const r = await radarView(token);
  if (!r) return null;
  const rows = r.rows.slice(0, TODAY_ROWS);
  const patch = await viewPatch(token, rows.map((x) => x.id));
  if (!patch) return null;
  const me = patch.me;
  const sinceMs = Date.parse(sinceRaw ?? "");
  const sinceIso = Number.isFinite(sinceMs) && sinceMs < nowMs && nowMs - sinceMs <= SINCE_MAX_MS ? new Date(sinceMs).toISOString() : null;
  const counts = sinceIso ? await todayCounts(token, sinceIso, me.function) : null;
  const byId = new Map((patch.companies ?? []).map((c) => [c.id, c]));
  const out: TodayView = {
    me,
    ...(me.plan ? { plan: me.plan } : {}),
    freeCompany: !!me.freeCompany,
    radar: { day: r.day, fn: r.function, rows, newCount: r.rows.length, on: r.on, ready: r.ready },
    ...(sinceIso && counts
      ? { since: { radar: r.days.filter((d) => d.day >= sinceIso.slice(0, 10)).reduce((n, d) => n + d.companies, 0), roles: counts.roles, follows: counts.follows, sinceIso } }
      : {}),
    companies: [],
  };
  // The rows' records in the rows' order, as many as fit.
  let size = JSON.stringify(out).length;
  for (const row of rows) {
    const c = byId.get(row.id);
    if (!c) continue;
    const packed = packCompany(c);
    const n = JSON.stringify(packed).length + 1;
    if (size + n > TODAY_MAX) break;
    out.companies.push(packed);
    size += n;
  }
  return out;
}
