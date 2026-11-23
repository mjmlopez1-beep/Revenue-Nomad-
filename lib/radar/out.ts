/**
 * "Why not": the companies that are not in a member's Crystal Ball, and why. Pure, no Node imports
 * (the page reads the reasons' words; lib/table.ts applies the action; lib/radar/index.ts and
 * match.ts read what is stored).
 *
 * Two kinds:
 *
 *   Left out by the member: "Not for me" on a company, with a reason. Stored per member with their
 *   Crystal Ball (State.radar.members[id].out, keyed by the internal company id: it never leaves the
 *   server). It leaves the page's ranges and the morning email at once. "Not now" lasts until
 *   something new happens there (a signal dated after the reason); every other reason lasts until
 *   the member brings it back. Nothing is deleted: the company stays in Companies, and a company
 *   that was in the ball still opens free from it as before (lib/radar crystalCompanyIds is not
 *   cut by this).
 *
 *   Held back by Merlin: a High or Medium event of the last RADAR_CARRY_DAYS days the morning's limit
 *   (RADAR_DAY_MAX companies) left out of the email, so it is not in the ball's days. It can still
 *   come on a day with room. "Show it anyway" puts it first in the next morning's run ("anyway",
 *   back from tomorrow): it then comes by email and joins the ball as any company does.
 *
 * "They have a full-time leader" is a fact, not only a reason: the page sends the existing
 * leaderReport (1 credit, Crystal Ball stops pointing at that function there for everyone) and
 * then this "fulltime" reason. Every reason here earns nothing by itself.
 */

export type OutReason = "fulltime" | "size" | "kind" | "known" | "notnow";
export const OUT_REASONS: OutReason[] = ["fulltime", "size", "kind", "known", "notnow"];

/** The reasons as the page offers them: what the member says, and what Merlin does with it. */
export const OUT_WORDS: Record<OutReason, { t: string; did: string }> = {
  fulltime: { t: "They have a full-time leader in my function", did: "A fact: you earn 1 credit, and Merlin stops pointing members like you at it." },
  size: { t: "Too small or too big", did: "It stays out of your ball. Change the sizes in your ideal client to leave out companies like it." },
  kind: { t: "Wrong kind of company", did: "It stays out of your ball. Change the industries in your ideal client to leave out companies like it." },
  known: { t: "I already know them", did: "It stays out of your ball. It is still in Companies." },
  notnow: { t: "Not now", did: "It comes back when something new happens there." },
};

/** One company the member left out, or asked to see anyway. `r` "anyway": put first in the next morning's run. */
export interface RadarOutEntry {
  r: OutReason | "anyway";
  /** When (ISO). */
  at: string;
}

/** At most this many entries a member (the oldest go first). */
export const OUT_MAX = 500;
/** An "anyway" lasts this long: past it the company has had its morning, or its event is too old to send. */
export const ANYWAY_DAYS = 7;

/**
 * The company is out of the member's ball now: left out for a reason, and for "Not now" only while
 * nothing happened there after it (`latestMs`: the company's newest signal in view, or null).
 */
export function isOut(e: RadarOutEntry | undefined, latestMs: number | null): boolean {
  if (!e || e.r === "anyway") return false;
  if (e.r === "notnow") return !(latestMs !== null && latestMs > Date.parse(e.at));
  return true;
}

/** An "anyway" still waiting for its morning. */
export const wantsAnyway = (e: RadarOutEntry | undefined, nowMs: number) => !!e && e.r === "anyway" && nowMs - Date.parse(e.at) < ANYWAY_DAYS * 24 * 60 * 60 * 1000;

export type OutOp = "out" | "back" | "anyway";

/**
 * The member's out list after one change: `out` with a reason, `back` (Bring it back: the entry
 * goes), `anyway` (Show it anyway). Returns the new map, or an error in plain words. Pure.
 */
export function applyOut(
  cur: Record<string, RadarOutEntry> | undefined,
  companyId: string,
  op: unknown,
  reason: unknown,
  nowIso: string,
): { out: Record<string, RadarOutEntry> } | { error: string } {
  const next = { ...(cur ?? {}) };
  if (op === "back") {
    delete next[companyId];
    return { out: next };
  }
  if (op === "anyway") {
    next[companyId] = { r: "anyway", at: nowIso };
    return { out: trim(next) };
  }
  if (op === "out") {
    if (!OUT_REASONS.includes(reason as OutReason)) return { error: "Pick why it is not for you." };
    next[companyId] = { r: reason as OutReason, at: nowIso };
    return { out: trim(next) };
  }
  return { error: "That didn't go through. Refresh the page and try again." };
}

function trim(m: Record<string, RadarOutEntry>): Record<string, RadarOutEntry> {
  const ks = Object.keys(m);
  if (ks.length <= OUT_MAX) return m;
  const keep = ks.sort((a, b) => Date.parse(m[b].at) - Date.parse(m[a].at)).slice(0, OUT_MAX);
  return Object.fromEntries(keep.map((k) => [k, m[k]]));
}

/** The message after a change, naming the company only as the caller can ("Northwind Clinics", "This company"). */
export function outMessage(op: OutOp, reason: OutReason | null, label: string): string {
  if (op === "back") return `${label} is back in your Crystal Ball.`;
  if (op === "anyway") return `${label} comes first in tomorrow's Crystal Ball.`;
  return `${label} left your Crystal Ball. ${reason ? OUT_WORDS[reason].did : ""}`.trim();
}

/** One row of "Not in your ball", as the page reads it (RadarView.out). */
export interface RadarOutRow {
  /** The company's public id, as the member's table has it. */
  id: string;
  /** "you" left it out, or "merlin" held it back. */
  by: "you" | "merlin";
  /**
   * You: the reason. Merlin: "limit" (kept off the email by the morning's limit), "quiet" (shown in the
   * last 30 days and nothing new since), "icp" (a strong signal outside the ideal client; `line` says
   * which part), or "anyway" (the member asked for it: first in the next morning's run).
   */
  r: OutReason | "limit" | "quiet" | "icp" | "anyway";
  /** When (ISO): the reason's, or the held-back event's. */
  at: string;
  /** Merlin's rows: the band and what happened there, never naming the company. */
  band?: "High" | "Medium" | "Low";
  line?: string;
  /** Trial and Pro: the company's name, free here as on the ball, while the table keeps it locked. */
  name?: string;
}
