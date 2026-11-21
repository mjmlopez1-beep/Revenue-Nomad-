/**
 * Today's data, the pure parts (app/post/Today.tsx draws it), so scripts/test-model.mts checks
 * them with no browser: which answer to GET ?today=1 is the small one, the Crystal Ball's companies
 * since the last visit, the roles opened since, and "Since Tuesday".
 */
import type { Me, PlanView } from "@/lib/tableTypes";
import type { RadarRow, RadarView } from "@/lib/radar/types";
import type { MovesWire } from "@/lib/moves";
import { isFirm, isOpenRole, namedFn, shown, type CoInfo } from "./model";

/** GET /api/table?today=1 (BUILD-LIST contract, WS2). */
export interface TodayAnswer {
  me: Me;
  plan?: PlanView;
  freeCompany?: boolean;
  radar: { day: string; fn: string | null; rows: RadarRow[]; newCount: number; ready?: boolean };
  /** Your three moves today (lib/moves.ts). Left out by a server from before them. */
  moves?: MovesWire;
  since?: { radar: number; roles: number; follows: number; sinceIso: string };
}
/** What Today draws from, whichever way it came. */
export interface TodayData {
  day: string | null;
  rows: RadarRow[];
  /** Companies new in the Crystal Ball since the last visit (or on its latest day, on a first visit). */
  newCount: number;
  since: { radar: number; roles: number; follows: number; sinceIso: string } | null;
  from: "today" | "radar";
  /** Today's moves as the server picked them. Null from a server without them: Home makes them of the top rows, with no way in from a network. */
  moves: MovesWire | null;
  /**
   * Crystal Ball's latest day with companies and how many it has: the count of new companies on
   * its menu item and in the bar (useRadarNew in TopBar.tsx). Null when it has none, or isn't
   * ready (no function yet).
   */
  latest: { day: string; n: number } | null;
}
/** The rows Today keeps from the radar. */
export const TODAY_ROWS = 4;
/** An answer bigger than this to ?today=1 is a full view (a server without the endpoint): it isn't read. */
export const TODAY_MAX_BYTES = 200_000;

const dayOf = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);

/**
 * The answer is the small one the contract describes, not a full view or an error. It carries its
 * rows' companies (TodayView in lib/viewWire.ts); a view carries its stats, and never a radar.
 */
export function isTodayAnswer(j: unknown): j is TodayAnswer {
  const x = j as Partial<TodayAnswer> & { stats?: unknown };
  return !!x && typeof x === "object" && !x.stats && !!x.radar && Array.isArray(x.radar.rows) && typeof x.radar.newCount === "number";
}

/** Companies in the radar's days after the last visit (the latest day with any, on a first visit). */
export function radarSince(v: Pick<RadarView, "days">, sinceIso: string | null): number {
  const after = dayOf(sinceIso);
  if (!after) return v.days.find((d) => d.companies > 0)?.companies ?? 0;
  return v.days.filter((d) => d.day > after).reduce((n, d) => n + d.companies, 0);
}

/** Open roles in the member's function that opened since the last visit (never a fractional firm's). */
export function rolesSince(infos: CoInfo[], fn: string | null, sinceIso: string | null): number {
  const own = namedFn(fn);
  const at = Date.parse(sinceIso ?? "");
  if (!own || !Number.isFinite(at)) return 0;
  let n = 0;
  for (const i of infos)
    for (const e of i.engs) {
      if (isFirm(i.c) || !isOpenRole(e) || e.unseen || shown(e.cells.function) !== own) continue;
      const opened = Date.parse(e.openedAt ?? (e.opened ? `${e.opened}T00:00:00Z` : ""));
      if (Number.isFinite(opened) && opened > at) n++;
    }
  return n;
}

/** "Since Tuesday", "Since earlier today", "Since Nov 12" (a week or more ago). */
export function sinceWords(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Since your last visit";
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return "Since earlier today";
  if (days === 1) return "Since yesterday";
  if (days < 7) return `Since ${d.toLocaleDateString("en-US", { weekday: "long" })}`;
  return `Since ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

