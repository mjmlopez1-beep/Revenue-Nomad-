/**
 * Your three moves today, the server's half (lib/moves.ts has the rules and the words): which
 * companies of the member's Crystal Ball, with what the page needs to draw each one.
 *
 * It reads three things, each already the member's own and already built with their locks:
 *   - their Crystal Ball's latest day (lib/radar radarView: ranked as the page ranks it, a company
 *     named only where their plan shows it there),
 *   - their record of each company, exactly as their table builds it (lib/table.ts viewPatch),
 *   - their own network (lib/google networkView), when the connector is on and they connected.
 * and their move log (done, snoozed). So a move can show nothing their table, their Crystal Ball
 * and Your network don't show them already, and nothing of anyone else's.
 *
 * GET /api/table?today=1 carries the answer (lib/today.ts), the "move" action returns it again
 * with the next best in place of the one done or snoozed, and the connector's todays_moves reads
 * it for the member's own Claude. Server side only.
 */
import { radarView } from "./radar";
import { networkView } from "./google";
import { moveState, viewPatch } from "./table";
import type { CompanyRec, Me } from "./tableTypes";
import type { RadarView } from "./radar/types";
import { MOVE_CANDIDATES, knowFrom, pickMoves, type KnowPerson, type Move, type MovesWire } from "./moves";

export interface MovesAnswer {
  wire: MovesWire;
  /** Each move as it reads for the member (the page builds the same from the wire and the record). */
  moves: Move[];
  /** The member's own record of each move's company, in the moves' order. */
  companies: CompanyRec[];
  /** The member, as their view's `me`, and the version of the table this was built on. */
  me: Me;
  version?: string;
  /** Their Crystal Ball's day, as radarView gave it. */
  radar: RadarView;
}

/** Today's moves for `token`'s member. Null when the token is nobody's. `rv`: their radarView, when the caller has it already. */
export async function movesFor(token: string | null, opts: { rv?: RadarView | null; nowMs?: number } = {}): Promise<MovesAnswer | null> {
  const nowMs = opts.nowMs ?? Date.now();
  const rv = opts.rv ?? (await radarView(token));
  if (!rv) return null;
  const st = await moveState(token, nowMs);
  if (!st) return null;
  // The day's companies in Crystal Ball's order, without the ones done or snoozed, a few more than are shown so the best ways in can lead.
  const rows = rv.rows.filter((r) => !st.hidden.has(r.id)).slice(0, MOVE_CANDIDATES);
  const patch = await viewPatch(token, rows.map((r) => r.id), { max: MOVE_CANDIDATES });
  if (!patch) return null;
  const me = patch.me;
  const net = await networkView(token).catch(() => null);
  const know = new Map<string, KnowPerson>();
  if (net && net.on)
    for (const c of net.companies) {
      // Someone selling to them, a recruiter or an investor, and anyone they said is not a relationship, is not a way in.
      if (c.set) continue;
      const p = knowFrom(c.people.filter((x) => !x.hidden));
      if (p) know.set(c.id, p);
    }
  const byId = new Map((patch.companies ?? []).map((c) => [c.id, c]));
  const cands = rows.flatMap((row) => {
    const rec = byId.get(row.id);
    return rec ? [{ row, rec, know: know.get(row.id) }] : [];
  });
  const picked = pickMoves(cands, me);
  return {
    wire: {
      list: picked.map((x) => x.wire),
      month: st.month,
      // Off for everyone, or on with nothing to connect to (no Google client set up): no mention on Home.
      google: !net || !net.on ? "off" : net.google ? "on" : net.configured ? "connect" : "off",
      ...(net && net.on && net.google ? { warm: net.warm.length } : {}),
    },
    moves: picked.map((x) => x.move),
    companies: picked.map((x) => byId.get(x.wire.id)!),
    me,
    ...(patch.version ? { version: patch.version } : {}),
    radar: rv,
  };
}
