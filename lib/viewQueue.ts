/**
 * A cap on heavy work that runs side by side: building a member's table view, turning it into
 * JSON and compressing it. Each one holds a few megabytes while it runs, so 120 at once can run
 * the server out of memory. At most MAX_ACTIVE run, the rest wait in line holding nothing, and
 * past MAX_WAITING the caller is told to come back (Busy, which the route answers with 503 and
 * Retry-After).
 */
export const MAX_ACTIVE = 4;
export const MAX_WAITING = 50;

export class Busy extends Error {
  readonly busy = true;
  constructor() {
    super("Too many table views are being built.");
    this.name = "Busy";
  }
}

let active = 0;
const waiting: (() => void)[] = [];

/** Run `work` in one of the slots. `onStart` fires when it leaves the line. Throws Busy when the line is full. */
export async function inSlot<T>(work: () => Promise<T>, onStart?: () => void): Promise<T> {
  if (active < MAX_ACTIVE) active++;
  else {
    if (waiting.length >= MAX_WAITING) throw new Busy();
    // The slot of whoever finishes is handed straight to the head of the line, so `active` stays as it is.
    await new Promise<void>((go) => waiting.push(go));
  }
  try {
    onStart?.();
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

/**
 * One piece of work per key at a time: a second caller with the same key joins the one already
 * waiting or running instead of starting another, as long as its result will still be current.
 * `version` counts changes to what the work reads: a flight that started before the latest
 * change is not joined (the second caller may be asking because of that change).
 */
export function shared<T>(flights: Map<string, { p: Promise<T>; started: number | null }>, key: string, version: () => number, work: () => Promise<T>): Promise<T> {
  const cur = flights.get(key);
  // Still in line (it will read the state when it starts), or started on the state as it is now.
  if (cur && (cur.started === null || cur.started === version())) return cur.p;
  const flight: { p: Promise<T>; started: number | null } = { p: Promise.resolve(null as T), started: null };
  flight.p = inSlot(work, () => {
    flight.started = version();
  }).finally(() => {
    if (flights.get(key) === flight) flights.delete(key);
  });
  flights.set(key, flight);
  return flight.p;
}
