/**
 * Personal claim links: /claim/<token>, one per seat, optionally with ?ref=<inviteCode>.
 *
 * The token is HMAC-SHA256 under the seed key (RN_INTEL_SEED_KEY, base64) of "claim:" + the seat's
 * internal id, base64url, its first 22 characters. It is never stored: the server finds the seat by
 * working out the token of every seat (an index, kept per set of seats), and the offline scripts
 * (scripts/claim-outreach.mjs) work out the same token from data/intel-seed.key. Without the seed key
 * there are no claim links: claimToken returns "" and no token finds a seat.
 *
 * Node only (crypto).
 */
import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_LEN = 22;
/** A claim token as it reads in a link: 22 base64url characters. */
export const isClaimToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{22}$/.test(t);

let keyCache: { raw: string; key: Buffer | null } | null = null;
function seedKey(): Buffer | null {
  const raw = process.env.RN_INTEL_SEED_KEY ?? "";
  if (keyCache?.raw === raw) return keyCache.key;
  const key = raw.trim() ? Buffer.from(raw.trim(), "base64") : null;
  keyCache = { raw, key: key && key.length ? key : null };
  return keyCache.key;
}

/** The claim token of a seat (its internal id), or "" when the server has no seed key. */
export function claimToken(seatId: string): string {
  const key = seedKey();
  if (!key) return "";
  return createHmac("sha256", key).update(`claim:${seatId}`).digest("base64url").slice(0, TOKEN_LEN);
}

/** Token -> seat id, for one collection of seat ids (an array or a map's keys, kept while that object lives) and one key. */
const indexes = new WeakMap<object, { key: Buffer; ix: Map<string, string> }>();

/**
 * The seat a token names, out of `seatIds`, or null. The token is checked against the seat's own
 * with timingSafeEqual. `seatIds` is usually the same object on every call (a graph's seat ids), so
 * the index is built once for it.
 */
export function seatForToken(token: unknown, seatIds: Iterable<string>): string | null {
  if (!isClaimToken(token)) return null;
  const key = seedKey();
  if (!key) return null;
  const holder = typeof seatIds === "object" && seatIds !== null ? (seatIds as object) : null;
  let hit = holder ? indexes.get(holder) : undefined;
  if (!hit || !hit.key.equals(key)) {
    const ix = new Map<string, string>();
    for (const id of seatIds) ix.set(claimToken(id), id);
    hit = { key, ix };
    if (holder) indexes.set(holder, hit);
  }
  const id = hit.ix.get(token);
  if (!id) return null;
  const want = Buffer.from(claimToken(id));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
