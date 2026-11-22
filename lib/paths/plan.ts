/**
 * Your way in, as a plan (Go with a route): what is kept, and the plan's state machine. Pure: no
 * I/O, relative imports only, so the server, the app and the checks all read it.
 *
 * What is kept (State.routes[memberId][companyId], the member's own, like their pipeline):
 *  - the chosen route: its id and its hop ids (opaque hashes worked out on the server from who the
 *    route goes through, never a name, an email or a profile address);
 *  - when it was chosen, the step the member is on and how many there are;
 *  - plan B (another route's id);
 *  - the log: what happened when (a kind of event and the step, never a name or any text);
 *  - the outcomes of each step (made the intro, no reply yet, can't help, meeting booked) and the
 *    route's Est. success when chosen, so the estimate can be calibrated later;
 *  - where the route came from (google, linkedin): deleting that data deletes the plan with it.
 * Names are worked out when the plan is shown, by the rules that hold then.
 *
 * State.routeStats is the only thing that leaves a member's own entry: counts of outcomes by the
 * shape of the step (how many hand-offs, the link's word, whether the last person decides, the
 * estimate). No member, company, person or route id, and no name, is in it.
 */
import type { PathBand } from "./rank";

/* ---------- what is kept ---------- */

export const OUTCOMES = ["intro", "noreply", "cant", "booked"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const isOutcome = (v: unknown): v is Outcome => typeof v === "string" && (OUTCOMES as readonly string[]).includes(v);

/**
 * One event on a plan. chose: went with the route. switched: picked another route. planb: plan B
 * took over after someone couldn't help. sent: the member's ask went out (their click). intro:
 * someone made the intro (or the person replied). noreply: no reply yet (a nudge is drafted).
 * nudged: the nudge went out. cant: they couldn't help. booked: the meeting is booked.
 */
export type LogKind = "chose" | "switched" | "planb" | "sent" | "intro" | "noreply" | "nudged" | "cant" | "booked";
export interface PlanLog {
  at: string;
  k: LogKind;
  /** The step it happened at (1 based). */
  step?: number;
  /** The route it happened on. */
  r: string;
}

export interface PlanOutcome {
  at: string;
  step: number;
  o: Outcome;
}

export interface RoutePlan {
  /** The chosen route's id. */
  route: string;
  /** Its hop ids, You and the company left out. */
  hops: string[];
  /** When it was chosen (ISO). */
  at: string;
  /** The step the member is on, 1 based. Past `steps`: every step is done. */
  step: number;
  steps: number;
  /** The route Merlin takes up if this one stalls. */
  planB: string | null;
  /** The day Merlin reminds the member to nudge (YYYY-MM-DD), after "No reply yet". */
  nudge?: string | null;
  /** Plan B took over because someone couldn't help: the route it came from. Cleared once the member goes with it. */
  fromCant?: string;
  /** Est. success when it was chosen (5 to 85). */
  est: number;
  /** Where the route came from: the member's own Google network, their LinkedIn import. */
  src?: ("google" | "linkedin")[];
  log: PlanLog[];
  outcomes: PlanOutcome[];
}

/** State.routes: member id -> internal company id -> their plan there. */
export type RoutesState = Record<string, Record<string, RoutePlan>>;
/** State.routeStats: a step's shape -> how often each outcome happened. Counts only. */
export type RouteStats = Record<string, Partial<Record<Outcome, number>>>;

export const PLAN_LIMITS = { plans: 200, log: 60, outcomes: 60, hops: 6 } as const;
/** Business days to the nudge after "No reply yet". */
export const NUDGE_BUSINESS_DAYS = 3;

/* ---------- the shape of a route, as the plan reads it ---------- */

/** What the plan needs of a route: its id, hop ids, how many people in between, its links' words, whether the last person decides. */
export interface RouteShape {
  id: string;
  hops: string[];
  /** People between the member and the last person. 0: a note straight to who decides. */
  between: number;
  links: PathBand[];
  decides: boolean;
  est: number;
  src?: ("google" | "linkedin")[];
}

/** The steps a route takes: the member's ask, one intro per person in between, then the meeting. A note straight to who decides: the note, their reply, the meeting. */
export const stepsOf = (r: Pick<RouteShape, "between">) => (r.between <= 0 ? 3 : r.between + 2);

/** Who acts at a step: the member (the first ask and the meeting), or the person at that link (their index in the route's people, 0 based; the last person for a reply). */
export function actorOf(r: Pick<RouteShape, "between">, step: number): { you: true } | { person: number } {
  const n = stepsOf(r);
  if (step <= 1 || step >= n) return { you: true };
  return { person: r.between <= 0 ? 0 : step - 2 };
}

/** What a step asks for: the member's ask, a hand-off that waits on someone, or the meeting. */
export type StepKind = "ask" | "wait" | "meet";
export function stepKind(r: Pick<RouteShape, "between">, step: number): StepKind {
  const n = stepsOf(r);
  return step <= 1 ? "ask" : step >= n ? "meet" : "wait";
}

/* ---------- days ---------- */

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const dayOf = (ms: number) => iso(ms).slice(0, 10);
/** The UTC day `n` business days after the day of `fromMs`. */
export function businessDaysAfter(fromMs: number, n: number): string {
  let t = Date.parse(`${dayOf(fromMs)}T00:00:00Z`);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    t += DAY;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return dayOf(t);
}

/* ---------- the state machine ---------- */

function pushLog(p: RoutePlan, e: Omit<PlanLog, "at">, nowMs: number) {
  p.log.push({ at: iso(nowMs), ...e });
  if (p.log.length > PLAN_LIMITS.log) p.log.splice(0, p.log.length - PLAN_LIMITS.log);
}
function pushOutcome(p: RoutePlan, step: number, o: Outcome, nowMs: number) {
  p.outcomes.push({ at: iso(nowMs), step, o });
  if (p.outcomes.length > PLAN_LIMITS.outcomes) p.outcomes.splice(0, p.outcomes.length - PLAN_LIMITS.outcomes);
}

/**
 * Go with a route: a new plan at step 1, or the plan there switched to this route (its log and
 * outcomes kept, the step back to 1). The same route again changes nothing. `planB` is the next
 * best route, when there is one.
 */
export function go(had: RoutePlan | undefined, r: RouteShape, planB: string | null, nowMs: number): { plan: RoutePlan; changed: boolean; switched: boolean } {
  if (had && had.route === r.id) {
    // Going with plan B after a can't help: it was picked for the member, now they chose it.
    if (had.fromCant) {
      delete had.fromCant;
      pushLog(had, { k: "chose", r: r.id }, nowMs);
      return { plan: had, changed: true, switched: false };
    }
    return { plan: had, changed: false, switched: false };
  }
  const plan: RoutePlan = {
    route: r.id,
    hops: r.hops.slice(0, PLAN_LIMITS.hops),
    at: iso(nowMs),
    step: 1,
    steps: stepsOf(r),
    planB: planB && planB !== r.id ? planB : null,
    est: r.est,
    ...(r.src?.length ? { src: [...new Set(r.src)] } : {}),
    log: had ? had.log : [],
    outcomes: had ? had.outcomes : [],
  };
  pushLog(plan, { k: had ? "switched" : "chose", r: r.id }, nowMs);
  return { plan, changed: true, switched: !!had };
}

export type StepOp = "sent" | "intro" | "noreply" | "nudged" | "cant" | "booked";
export const STEP_OPS: readonly StepOp[] = ["sent", "intro", "noreply", "nudged", "cant", "booked"];
export const isStepOp = (v: unknown): v is StepOp => typeof v === "string" && (STEP_OPS as readonly string[]).includes(v);

/** What a step answer did, for the words and the anonymous counts. */
export interface StepResult {
  ok: boolean;
  /** Why not, in words, when not ok. */
  refused?: string;
  /** An outcome to count (State.routeStats). */
  outcome?: Outcome;
  /** The step it was at. */
  at: number;
  /** Plan B should take over (the server goes with it). */
  planB?: boolean;
  /** Every step is done. */
  done?: boolean;
}

/**
 * One answer at the step the member is on, checked against what that step asks:
 *   ask   sent: the ask went out, on to the next step.
 *   wait  intro: they made the intro (or the person replied), on to the next step.
 *         noreply: no reply yet, the step stays and a nudge is due in NUDGE_BUSINESS_DAYS.
 *         nudged: the nudge went out, the reminder is cleared.
 *         cant: they couldn't help: plan B takes over.
 *   meet  booked: the meeting is booked, every step done.
 * `step` is the step the page showed: an answer for any other step is refused (a second tab).
 */
export function answer(p: RoutePlan, r: Pick<RouteShape, "between">, op: StepOp, step: number, nowMs: number): StepResult {
  const at = p.step;
  if (p.fromCant) return { ok: false, refused: "Go with plan B first, or pick another route.", at };
  if (at > p.steps) return { ok: false, refused: "Every step is done.", at };
  if (step !== at) return { ok: false, refused: "That step has moved on. Here is where your plan is now.", at };
  const kind = stepKind(r, at);
  const allowed: Record<StepKind, StepOp[]> = { ask: ["sent"], wait: ["intro", "noreply", "nudged", "cant"], meet: ["booked", "noreply", "nudged", "cant"] };
  if (!allowed[kind].includes(op)) return { ok: false, refused: "That isn't what this step asks for.", at };
  switch (op) {
    case "sent":
      p.step++;
      p.nudge = null;
      pushLog(p, { k: "sent", step: at, r: p.route }, nowMs);
      return { ok: true, at };
    case "intro":
      p.step++;
      p.nudge = null;
      pushLog(p, { k: "intro", step: at, r: p.route }, nowMs);
      pushOutcome(p, at, "intro", nowMs);
      return { ok: true, outcome: "intro", at };
    case "noreply":
      p.nudge = businessDaysAfter(nowMs, NUDGE_BUSINESS_DAYS);
      pushLog(p, { k: "noreply", step: at, r: p.route }, nowMs);
      pushOutcome(p, at, "noreply", nowMs);
      return { ok: true, outcome: "noreply", at };
    case "nudged":
      p.nudge = null;
      pushLog(p, { k: "nudged", step: at, r: p.route }, nowMs);
      return { ok: true, at };
    case "cant":
      p.nudge = null;
      pushLog(p, { k: "cant", step: at, r: p.route }, nowMs);
      pushOutcome(p, at, "cant", nowMs);
      return { ok: true, outcome: "cant", at, planB: true };
    case "booked":
      p.step = p.steps + 1;
      p.nudge = null;
      pushLog(p, { k: "booked", step: at, r: p.route }, nowMs);
      pushOutcome(p, at, "booked", nowMs);
      return { ok: true, outcome: "booked", at, done: true };
  }
}

/**
 * Plan B takes over after a can't help: the plan moves to that route at step 1, its log and
 * outcomes kept, marked as picked for the member (fromCant) until they go with it. `next` is the
 * route after plan B, when there is one. No plan B: the plan stays where it is, for the member to
 * pick another route.
 */
export function takePlanB(p: RoutePlan, b: RouteShape | null, next: string | null, nowMs: number): boolean {
  if (!b || b.id === p.route) return false;
  const from = p.route;
  p.route = b.id;
  p.hops = b.hops.slice(0, PLAN_LIMITS.hops);
  p.step = 1;
  p.steps = stepsOf(b);
  p.planB = next && next !== b.id && next !== from ? next : null;
  p.est = b.est;
  p.nudge = null;
  p.fromCant = from;
  p.at = iso(nowMs);
  if (b.src?.length) p.src = [...new Set([...(p.src ?? []), ...b.src])];
  pushLog(p, { k: "planb", r: b.id }, nowMs);
  return true;
}

/** Every step done. */
export const isDone = (p: Pick<RoutePlan, "step" | "steps">) => p.step > p.steps;
/** The nudge is due (today or past). */
export const nudgeDue = (p: Pick<RoutePlan, "nudge">, nowMs: number) => !!p.nudge && p.nudge <= dayOf(nowMs);

/* ---------- the anonymous counts ---------- */

/**
 * The key a step's outcome is counted under: how many people in between, the link's word, whether
 * the last person decides, and the estimate when chosen. Never a member, a company or a person.
 */
export function statKey(x: { between: number; link: PathBand | null; decides: boolean; est: number }): string {
  const est = Math.max(0, Math.min(100, Math.round(x.est / 5) * 5));
  return `h${Math.max(0, Math.min(PLAN_LIMITS.hops, Math.floor(x.between)))}|${x.link ?? "none"}|d${x.decides ? 1 : 0}|e${est}`;
}
export function countOutcome(stats: RouteStats, key: string, o: Outcome): void {
  const row = (stats[key] ??= {});
  row[o] = (row[o] ?? 0) + 1;
}

/* ---------- deleting ---------- */

/** Account closure: every plan of the member's. The anonymous counts stay (they name nobody). */
export function forgetMember(routes: RoutesState | undefined, memberId: string): number {
  if (!routes?.[memberId]) return 0;
  const n = Object.keys(routes[memberId]).length;
  delete routes[memberId];
  return n;
}
/** The member deleted their Google data, or their LinkedIn import: the plans through it go with it. */
export function forgetSource(routes: RoutesState | undefined, memberId: string, src: "google" | "linkedin"): number {
  const mine = routes?.[memberId];
  if (!mine) return 0;
  let n = 0;
  for (const [co, p] of Object.entries(mine))
    if (p.src?.includes(src)) {
      delete mine[co];
      n++;
    }
  if (!Object.keys(mine).length) delete routes![memberId];
  return n;
}
