/**
 * Per-member request limits on Merlin's data reads (the table, a company's record, people and
 * Fractionals) and the connector's tools, so no plan can be scraped. Pro and Close open everything,
 * which makes a bulk read worth trying: these stop scripted paging and leave a person clicking well
 * inside the limits (a busy afternoon is a few hundred reads an hour).
 *
 * In memory, one server: the counts restart with the server. What trips, and the members whose
 * reads today pass HEAVY_DAY, are counted for admin Health, as counts only (never who).
 */
import { limited } from "./rateLimit";

export type ReadKind = "table" | "company" | "people" | "mcp";

/**
 * Reads a member makes in any minute before the next waits (the IP limit beside it is 120). A full
 * page load in the new design reads 7 or 8 times (the table, Home's moves, the nav's counts, ways in),
 * so a person opening a page every 4 seconds stays inside it (acceptance F22: 90 tripped at 12 loads).
 * The member's own state (their bell, their pipeline, their workflows) isn't counted: it opens nothing.
 */
export const READS_PER_MINUTE = 120;
/** Reads in any hour: about one every 2 seconds for the whole hour. A person never gets near it. */
export const READS_PER_HOUR = 1800;
/** GET /api/table reads of the member's own state only (nothing a plan opens): not counted toward the limits. */
export const OWN_READS = ["inbox", "pipeline", "workflows"] as const;
/** A member past this many reads in a UTC day counts as heavy usage on Health. */
export const HEAVY_DAY = 1500;
/** What the member reads when a limit trips. */
export const READS_SLOW = "That's a lot of requests in a short time. Give it a minute, then try again.";

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
let today = "";
const perMember = new Map<string, number>();
const trips: Record<ReadKind, number> = { table: 0, company: 0, people: 0, mcp: 0 };
const tripped = new Set<string>();
let tripsAll = 0;

function roll(nowMs: number) {
  const d = day(nowMs);
  if (d === today) return;
  today = d;
  perMember.clear();
  tripped.clear();
  for (const k of Object.keys(trips) as ReadKind[]) trips[k] = 0;
}

/** Count a limit that tripped (the connector's own limits call this too). */
export function noteTrip(memberId: string, kind: ReadKind, nowMs = Date.now()): void {
  roll(nowMs);
  trips[kind]++;
  tripsAll++;
  tripped.add(memberId);
}

/**
 * One read by a member: null while inside the limits, else the words to answer with (a 429).
 * `kind` only says which part of Merlin it was, for Health.
 */
export function memberRead(memberId: string, kind: ReadKind, nowMs = Date.now()): string | null {
  roll(nowMs);
  perMember.set(memberId, (perMember.get(memberId) ?? 0) + 1);
  if (perMember.size > 50_000) perMember.clear();
  if (limited(`rd-min:${memberId}`, READS_PER_MINUTE, 60_000) || limited(`rd-hr:${memberId}`, READS_PER_HOUR, 60 * 60_000)) {
    noteTrip(memberId, kind, nowMs);
    return READS_SLOW;
  }
  return null;
}

/** For admin Health: today's (UTC) counts. Never a member id. */
export function usageStats(nowMs = Date.now()): { day: string; readers: number; heavy: number; trippedMembers: number; trips: Record<ReadKind, number>; tripsSinceStart: number; limits: { perMinute: number; perHour: number; heavyDay: number } } {
  roll(nowMs);
  let heavy = 0;
  for (const n of perMember.values()) if (n > HEAVY_DAY) heavy++;
  return { day: today, readers: perMember.size, heavy, trippedMembers: tripped.size, trips: { ...trips }, tripsSinceStart: tripsAll, limits: { perMinute: READS_PER_MINUTE, perHour: READS_PER_HOUR, heavyDay: HEAVY_DAY } };
}

/** Tests only: start the counts over. */
export function usageReset(): void {
  today = "";
  perMember.clear();
  tripped.clear();
  tripsAll = 0;
  for (const k of Object.keys(trips) as ReadKind[]) trips[k] = 0;
}
