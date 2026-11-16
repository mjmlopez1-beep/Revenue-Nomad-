/**
 * What the API answers when Trading Post cannot serve: 503, never an empty or a sample table.
 *  - Unavailable (lib/table.ts): the state file is damaged and no backup could be read, or
 *    RN_REQUIRE_SEED=1 and the member seed did not load.
 *  - Busy (lib/viewQueue.ts): too many table views are being built at once.
 * Wrap every route handler under app/api/table in guarded().
 */
import { NextResponse } from "next/server";

export const DOWN_MESSAGE = "Trading Post is paused while we fix a problem on our side. Try again in a few minutes.";
export const BUSY_MESSAGE = "Trading Post is busy right now. Try again in a moment.";

const flagged = (e: unknown, flag: "unavailable" | "busy") => !!e && typeof e === "object" && (e as Record<string, unknown>)[flag] === true;
export const isDown = (e: unknown) => flagged(e, "unavailable");
export const isBusy = (e: unknown) => flagged(e, "busy");

const refuse = (message: string, retryAfter: number) =>
  NextResponse.json({ error: message }, { status: 503, headers: { "retry-after": String(retryAfter), "cache-control": "no-store" } });

/** The 503 for an error that means "not now", or null for any other error. */
export function notNow(e: unknown): NextResponse | null {
  if (isDown(e)) return refuse(DOWN_MESSAGE, 60);
  if (isBusy(e)) return refuse(BUSY_MESSAGE, 2);
  return null;
}

/** A route handler that answers 503 instead of throwing when Trading Post cannot serve. */
export function guarded<A extends unknown[]>(handler: (...args: A) => Promise<Response>, onDown: (e: unknown) => Response | null = notNow) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      const r = onDown(e);
      if (r) return r;
      throw e;
    }
  };
}
