/**
 * One leader per function, out of everything read on a company's pages (lib/leaders/extract.ts),
 * and how a new read meets the one on file. No network, no state: lib/table.ts saveLeaders and the
 * checks (scripts/test-leaders.mts) run these as they are.
 *
 *  - On team pages the most senior leader of a function wins.
 *  - Among press releases the newest wins: a newer release says who leads it now.
 *  - A press release names a more senior leader than the team page: the release wins. The same
 *    level and the same kind of seat: the release wins too (it says since when), unless the two
 *    name different people: then the team page (what the company shows today). Otherwise the
 *    team page.
 *  - A new read keeps a press release on file that it no longer reaches (press pages move items
 *    off the first page), unless an older one would replace a newer one.
 *  - The top leader (pickTop): a CEO over a president over a founder, the team page over a press
 *    release, and only with a name.
 *
 * The name and title stay with the leader they were read with: a pick never puts one person's name
 * on another's seat.
 */
import { sameName } from "../personName";
import type { Candidate } from "./extract";
import { levelRank, TOP_FN } from "./extract";
import type { LeaderFn, LeaderTop } from "./types";

const when = (c: { date?: string; since?: string }) => c.date ?? c.since ?? "";
/** Two leaders who are not the same person: both named, and the names differ. */
const others = (a: { name?: string }, b: { name?: string }) => !!a.name && !!b.name && !sameName(a.name, b.name);

function bestTeam(cs: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of cs) {
    if (!best) best = c;
    else if (levelRank(c.level) < levelRank(best.level)) best = c;
    else if (levelRank(c.level) === levelRank(best.level) && ((!best.since && !!c.since) || (!best.name && !!c.name && !!c.since === !!best.since))) best = c;
  }
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

/** A leader as stored. `page`: the page the person was read on, kept only when it is not `url` (it may spell their name). */
const out = (c: Candidate & { page?: string }, seenAt: string): LeaderFn => ({
  level: c.level,
  kind: c.kind,
  ...(c.since ? { since: c.since } : {}),
  how: c.how,
  url: c.url,
  seenAt,
  ...(c.name && c.title ? { name: c.name, title: c.title, ...(c.page && c.page !== c.url ? { page: c.page } : {}) } : {}),
});

/** Each function's leader from one read of a company's pages. The top leader is not a function (pickTop). */
export function pickFunctions(cands: Candidate[], seenAt: string): Record<string, LeaderFn> {
  const byFn = new Map<string, Candidate[]>();
  for (const c of cands) if (c.fn !== TOP_FN) byFn.set(c.fn, [...(byFn.get(c.fn) ?? []), c]);
  const res: Record<string, LeaderFn> = {};
  for (const [fn, cs] of byFn) {
    const team = bestTeam(cs.filter((c) => c.how === "team page"));
    const press = newestPress(cs.filter((c) => c.how === "press release"));
    let pick: Candidate;
    if (!team || !press) pick = (team ?? press)!;
    else if (levelRank(press.level) < levelRank(team.level)) pick = press;
    else if (levelRank(team.level) < levelRank(press.level)) pick = team;
    else if (press.kind === team.kind && !others(press, team)) pick = press.since ? { ...press, ...(!press.name && team.name ? { name: team.name, title: team.title } : {}) } : team;
    else pick = team;
    res[fn] = out(pick, seenAt);
  }
  return res;
}

/** The company's top leader from one read: a CEO over a president over a founder, the team page first, and only one with a name. */
export function pickTop(cands: Candidate[], seenAt: string): LeaderTop | undefined {
  const named = cands.filter((c) => c.fn === TOP_FN && c.top !== undefined && c.name && c.title);
  if (!named.length) return undefined;
  const rank = Math.min(...named.map((c) => c.top!));
  const at = named.filter((c) => c.top === rank);
  const team = at.find((c) => c.how === "team page");
  const press = newestPress(at.filter((c) => c.how === "press release"));
  const pick = team ? (press && press.since && !others(team, press) ? { ...team, since: press.since } : team) : press!;
  return { ...(out(pick, seenAt) as LeaderTop), rank };
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
    else if (n.how === "team page" && p.how === "press release" && n.level === p.level && n.kind === p.kind && !n.since && p.since && !others(n, p)) {
      // The release's since, with the person as the team page names them today.
      res[fn] = { ...p, seenAt: n.seenAt, ...(n.name && n.title ? { name: n.name, title: n.title, ...(n.page ? { page: n.page } : {}) } : {}) };
    }
  }
  return res;
}

/** A new read's top leader over the one on file: the new one, else a press release on file that the read no longer reaches. */
export function mergeTop(prev: LeaderTop | undefined, next: LeaderTop | undefined): LeaderTop | undefined {
  if (next) return next;
  return prev?.how === "press release" ? prev : undefined;
}
