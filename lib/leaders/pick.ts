/**
 * One leader per function, out of everything read on a company's pages (lib/leaders/extract.ts),
 * and how a new read meets the one on file. No network, no state: lib/table.ts saveLeaders and the
 * checks (scripts/test-leaders.mts) run these as they are.
 *
 *  - On team pages the most senior leader of a function wins.
 *  - Among press releases the newest wins: a newer release says who leads it now.
 *  - A press release names a more senior leader than the team page: the release wins. The same
 *    level and the same kind of seat: the release wins too (it says since when). Otherwise the
 *    team page (what the company shows today).
 *  - A new read keeps a press release on file that it no longer reaches (press pages move items
 *    off the first page), unless an older one would replace a newer one.
 */
import type { Candidate } from "./extract";
import { levelRank } from "./extract";
import type { LeaderFn } from "./types";

const when = (c: { date?: string; since?: string }) => c.date ?? c.since ?? "";

function bestTeam(cs: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of cs) if (!best || levelRank(c.level) < levelRank(best.level) || (levelRank(c.level) === levelRank(best.level) && !best.since && !!c.since)) best = c;
  return best;
}
function newestPress(cs: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of cs) {
    if (!best) best = c;
    else if (when(c) > when(best) || (when(c) === when(best) && levelRank(c.level) < levelRank(best.level))) best = c;
  }
  return best;
}

const out = (c: Candidate, seenAt: string): LeaderFn => ({ level: c.level, kind: c.kind, ...(c.since ? { since: c.since } : {}), how: c.how, url: c.url, seenAt });

/** Each function's leader from one read of a company's pages. */
export function pickFunctions(cands: Candidate[], seenAt: string): Record<string, LeaderFn> {
  const byFn = new Map<string, Candidate[]>();
  for (const c of cands) byFn.set(c.fn, [...(byFn.get(c.fn) ?? []), c]);
  const res: Record<string, LeaderFn> = {};
  for (const [fn, cs] of byFn) {
    const team = bestTeam(cs.filter((c) => c.how === "team page"));
    const press = newestPress(cs.filter((c) => c.how === "press release"));
    let pick: Candidate;
    if (!team || !press) pick = (team ?? press)!;
    else if (levelRank(press.level) < levelRank(team.level)) pick = press;
    else if (levelRank(team.level) < levelRank(press.level)) pick = team;
    else if (press.kind === team.kind) pick = press.since ? press : team;
    else pick = team;
    res[fn] = out(pick, seenAt);
  }
  return res;
}

/** A new read of a company over the one on file. */
export function mergeFunctions(prev: Record<string, LeaderFn> | undefined, next: Record<string, LeaderFn>): Record<string, LeaderFn> {
  const res: Record<string, LeaderFn> = { ...next };
  for (const [fn, p] of Object.entries(prev ?? {})) {
    const n = next[fn];
    if (!n) {
      // A press release on file stays: the site's news pages move on, the appointment stands.
      if (p.how === "press release") res[fn] = p;
      continue;
    }
    if (p.how === "press release" && n.how === "press release" && (p.since ?? "") > (n.since ?? "")) res[fn] = p;
    else if (n.how === "team page" && p.how === "press release" && n.level === p.level && n.kind === p.kind && !n.since && p.since) res[fn] = { ...p, seenAt: n.seenAt };
  }
  return res;
}
