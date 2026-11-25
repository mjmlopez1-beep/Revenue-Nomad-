/**
 * How Merlin estimates a way in (Your way into a company, Where you can get in, Your ways in on a
 * record, Home's move and the connector's ways_in). Pure: no I/O, relative imports only, so the
 * server, the app and the checks all read it.
 *
 *  1. Each link of a route (You to someone, someone to the next, the last one to who decides) is
 *     rated from what the two sides actually share (linkStrength): meetings and emails and how
 *     recent they are (counts and dates only, never what anyone wrote), messages on Merlin, a seat
 *     held at the same company at the same time, a former client, a peer on Merlin, or a LinkedIn
 *     connection from the member's own import alone (weak). The strength is a number from 0 to 1;
 *     its word (Strong, Good, Fading, Cold) is what the link says on screen.
 *  2. One internal score for a route (estSuccess): the links multiplied together, lowered for each
 *     hand-off, lowered when the last person doesn't decide on fractional hires, and weighed by the
 *     company's hiring signals (an open role, a recent fractional hire, how well it fits the
 *     member). Rounded to the nearest 5, between 5 and 85. It orders routes and places the map's
 *     marks; it is never shown. Merlin has no validated outcome data yet, so a member sees only its
 *     band in words (wayBandOf: Warm intro, Good path, Long shot), never a percentage, and never a
 *     predicted time to a meeting (owner, 2026-11-25: no false precision).
 *  3. A company's best route is then placed by its hiring odds (zoneOf, companyScore, mapPoint).
 *
 * The weights are EST below. They are a first estimate: plans record what happened at each step
 * (lib/paths/plan.ts, counts only), so they can be calibrated later.
 */

export type PathBand = "Strong" | "Good" | "Fading" | "Cold";
export type OddsBand = "High" | "Medium" | "Low";
/** Where a company sits: likely to hire (High or Medium odds) by a warm best way in (Strong or Good). */
export type Zone = "go" | "find" | "warm" | "watch";

/** Weakest first. */
export const BANDS: readonly PathBand[] = ["Cold", "Fading", "Good", "Strong"];
export const ODDS: readonly OddsBand[] = ["Low", "Medium", "High"];
export const bandIdx = (b: PathBand) => BANDS.indexOf(b);
export const oddsIdx = (b: OddsBand) => ODDS.indexOf(b);
export const isBand = (x: unknown): x is PathBand => typeof x === "string" && (BANDS as readonly string[]).includes(x);

export const ZONES: readonly Zone[] = ["go", "find", "warm", "watch"];
export const ZONE_WORDS: Record<Zone, { title: string; hint: string }> = {
  go: { title: "Go now", hint: "Likely to hire, and one of your warmer ways in. Ask for the intro." },
  find: { title: "Find a way in", hint: "Likely to hire, but your routes there are colder. Ask a fellow fractional or bring in who you know." },
  warm: { title: "Keep warm", hint: "One of your warmer ways in, not hiring yet. Follow them and stay in touch." },
  watch: { title: "Watch", hint: "Neither yet. Merlin tells you when that changes." },
};

/* ---------- 1. a link ---------- */

/**
 * What one link rests on: what the two sides share. A link can rest on several (the member met
 * someone and also messaged them on Merlin): it is as strong as the strongest of them.
 */
export type Evidence =
  /** Meetings and emails from the member's own Google network: counts and the last day only. */
  | { kind: "met"; meetings: number; emails: number; both?: boolean; last: string | null }
  /** Messages on Merlin between the two, and the last one (day). */
  | { kind: "messages"; count: number; last: string | null }
  /** Someone at a company where the member holds or held a seat: their client. */
  | { kind: "client"; active: boolean; endYear: number | null }
  /** The two held seats at the same company at the same time. */
  | { kind: "together"; active: boolean; endYear: number | null }
  /** A peer on Merlin the member can message there, with the client they share, when they share one. */
  | { kind: "peer"; shared?: { active: boolean; year: number | null } | null }
  /** A connection in the member's own LinkedIn import, and nothing else: weak. */
  | { kind: "linkedin"; since: string | null }
  /** Messages on LinkedIn between the two, from the member's own export: how many, both ways or not, and the last day. Never the words. */
  | { kind: "limsg"; count: number; both: boolean; last: string | null }
  /** One recommended (rec) or endorsed the other on LinkedIn, from the member's own export. `theirs`: they vouched for the member. */
  | { kind: "vouch"; rec: boolean; theirs: boolean }
  /** A LinkedIn invitation still pending (not a connection): weaker than one. */
  | { kind: "invited"; out: boolean }
  /** Saved in the member's own contacts, never met. */
  | { kind: "contact" }
  /** Works now where the other one holds a seat now. */
  | { kind: "colleague" }
  /** Was at the same company at another time (no overlap on file). */
  | { kind: "sameplace"; year: number | null }
  /** One of the company's leaders on Merlin also worked where they work. */
  | { kind: "leaderElsewhere" }
  /** The other one held a fractional seat there and reported to them (or they hired for it). */
  | { kind: "reported"; active: boolean; endYear: number | null }
  /** Into the company: they hold, or held, a fractional seat there. */
  | { kind: "seat"; active: boolean; endYear: number | null }
  /** Into the company: they work there. */
  | { kind: "works" }
  /** The two have never met: a note out of the blue. */
  | { kind: "none" };

const DAY = 86_400_000;
const daysSince = (day: string | null | undefined, nowMs: number) => {
  const t = day ? Date.parse(`${day.slice(0, 10)}T12:00:00Z`) : NaN;
  return Number.isFinite(t) ? Math.max(0, (nowMs - t) / DAY) : null;
};
const yearOf = (nowMs: number) => new Date(nowMs).getUTCFullYear();
/** A seat (or a time together) by how long ago it ended: going, within 2 years, within 5, older; no end on file. */
const byEnd = (active: boolean, endYear: number | null, nowMs: number, v: [now: number, two: number, five: number, older: number, unknown: number]): number => {
  if (active) return v[0];
  if (endYear === null) return v[4];
  const gap = yearOf(nowMs) - endYear;
  return gap <= 2 ? v[1] : gap <= 5 ? v[2] : v[3];
};

/**
 * How well one piece of evidence says the two know each other, 0 to 1: the chance this person
 * acts on the ask. Meetings and messages count by how many and how recent; a seat held together
 * and a former client by how long ago; a LinkedIn connection alone is weak (0.42 at best).
 */
export function evidenceStrength(e: Evidence, nowMs: number): number {
  switch (e.kind) {
    case "met": {
      const d = daysSince(e.last, nowMs);
      if (d === null) return e.meetings > 0 || e.emails > 0 ? 0.45 : 0.2;
      if (e.meetings >= 3 && d <= 120) return 0.9;
      if (e.meetings >= 1 && d <= 240) return 0.72;
      if (e.emails >= 4 && !!e.both && d <= 120) return 0.66;
      return d <= 540 ? 0.45 : 0.25;
    }
    case "messages": {
      const d = daysSince(e.last, nowMs);
      if (d === null) return 0.45;
      if (d <= 60) return e.count >= 4 ? 0.85 : 0.68;
      return d <= 270 ? 0.45 : 0.25;
    }
    case "client":
      return byEnd(e.active, e.endYear, nowMs, [0.9, 0.85, 0.68, 0.45, 0.68]);
    case "together":
      return byEnd(e.active, e.endYear, nowMs, [0.85, 0.72, 0.5, 0.3, 0.5]);
    case "peer":
      if (!e.shared) return 0.5;
      return e.shared.active ? 0.68 : 0.55;
    case "linkedin": {
      const d = daysSince(e.since, nowMs);
      return d !== null && d <= 5 * 365.25 ? 0.42 : 0.28;
    }
    case "limsg": {
      const d = daysSince(e.last, nowMs);
      if (d === null) return 0.4;
      if (d <= 60) return e.count >= 4 && e.both ? 0.8 : 0.6;
      if (d <= 270) return e.both ? 0.5 : 0.42;
      return 0.28;
    }
    case "vouch":
      return e.rec ? 0.7 : 0.48;
    case "invited":
      return 0.2;
    case "contact":
      return 0.25;
    case "colleague":
      return 0.65;
    case "sameplace":
      return e.year !== null && yearOf(nowMs) - e.year <= 3 ? 0.45 : 0.3;
    case "leaderElsewhere":
      return 0.45;
    case "reported":
      return byEnd(e.active, e.endYear, nowMs, [0.88, 0.72, 0.5, 0.3, 0.5]);
    case "seat":
      return byEnd(e.active, e.endYear, nowMs, [0.85, 0.7, 0.5, 0.3, 0.5]);
    case "works":
      return 0.62;
    case "none":
      return 0.12;
  }
}

/** The word a link says: 0.8 and up Strong, 0.6 Good, 0.4 Fading, below that Cold. */
export function bandOf(strength: number): PathBand {
  return strength >= 0.8 ? "Strong" : strength >= 0.6 ? "Good" : strength >= 0.4 ? "Fading" : "Cold";
}
/** One piece of evidence, as a word. */
export const rateEvidence = (e: Evidence, nowMs: number): PathBand => bandOf(evidenceStrength(e, nowMs));

/** A link: the strongest of what it rests on. Nothing to rest on is a note out of the blue. */
export function linkStrength(evidence: readonly Evidence[], nowMs: number): number {
  let best = -1;
  for (const e of evidence) best = Math.max(best, evidenceStrength(e, nowMs));
  return best < 0 ? evidenceStrength({ kind: "none" }, nowMs) : best;
}
export const rateStep = (evidence: readonly Evidence[], nowMs: number): PathBand => bandOf(linkStrength(evidence, nowMs));

/**
 * The relationship band a member may SEE (Strong, Good, Fading, Cold), or null. Merlin derives a
 * band only from how recently the two were in touch: meetings and emails from the member's own mail
 * and calendar, or messages on Merlin, each with the day of the last one. Everything else (a peer on
 * Merlin, a LinkedIn connection, a seat held together, a former client, a contacts file) says how
 * the two are connected, in words, never as a band (owner, 2026-11-25: no invented strengths). The
 * strength above still orders routes; it is never shown as a band without this.
 */
export function relBandOf(evidence: readonly Evidence[], nowMs: number): PathBand | null {
  let best = -1;
  for (const e of evidence) if ((e.kind === "met" || e.kind === "messages") && e.last && daysSince(e.last, nowMs) !== null) best = Math.max(best, evidenceStrength(e, nowMs));
  return best < 0 ? null : bandOf(best);
}

/** The strongest piece of evidence, for the words under a link. */
export function strongestOf(evidence: readonly Evidence[], nowMs: number): Evidence | null {
  let best: Evidence | null = null;
  let bi = -1;
  for (const e of evidence) {
    const i = evidenceStrength(e, nowMs);
    if (i > bi) (bi = i), (best = e);
  }
  return best;
}

/** A route's weakest link. No links: Cold. */
export function pathBand(steps: readonly PathBand[]): PathBand {
  if (!steps.length) return "Cold";
  let low = 3;
  for (const s of steps) low = Math.min(low, bandIdx(s));
  return BANDS[low];
}

/* ---------- 2. a route's score (internal) ---------- */

/**
 * The weights. handoff: what each person in between keeps (each hand-off is another chance it
 * stalls). notDecider: what is kept when the last person doesn't decide on fractional hires (they
 * pass it on, or it waits). The hiring factor starts at hiringBase and adds openRole, recentHire,
 * and perFit for each fit level (1 to 3: the member's Crystal Ball, a saved view, their profile).
 * Shown as a percentage rounded to `step`, between `min` and `max`.
 */
export const EST = {
  handoff: 0.85,
  notDecider: 0.6,
  hiringBase: 0.8,
  openRole: 0.2,
  recentHire: 0.1,
  perFit: 0.04,
  step: 5,
  min: 5,
  max: 85,
} as const;

export interface EstInput {
  /** Each link's strength, 0 to 1, from You to the last person. */
  links: readonly number[];
  /** People between the member and the last person. */
  handoffs: number;
  /** The last person decides on fractional hires there (a leader, a decision maker, who hired for a seat). */
  decides: boolean;
  /** The company's hiring signals. */
  openRole: boolean;
  recentHire: boolean;
  /** How well the company fits the member, 0 (not in any of their lists) to 3. */
  fit: number;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** The hiring factor: hiringBase, plus an open role, a recent fractional hire and the fit. */
export function hiringFactor(x: Pick<EstInput, "openRole" | "recentHire" | "fit">): number {
  const fit = Math.max(0, Math.min(3, Math.round(Number.isFinite(x.fit) ? x.fit : 0)));
  return EST.hiringBase + (x.openRole ? EST.openRole : 0) + (x.recentHire ? EST.recentHire : 0) + fit * EST.perFit;
}

/** The estimate before rounding, 0 to 1 and more (a hot company can lift it past 1; estSuccess clamps). */
export function estRaw(x: EstInput): number {
  const chain = x.links.length ? x.links.reduce((a, b) => a * clamp01(b), 1) : 0;
  const handoffs = Math.max(0, Math.floor(Number.isFinite(x.handoffs) ? x.handoffs : 0));
  return chain * EST.handoff ** handoffs * (x.decides ? 1 : EST.notDecider) * hiringFactor(x);
}

/** Round to the nearest `EST.step` percent, kept between EST.min and EST.max. */
export function roundEst(raw: number): number {
  const pct = Math.round((Number.isFinite(raw) ? raw : 0) * 100 / EST.step) * EST.step;
  return Math.max(EST.min, Math.min(EST.max, pct));
}

/** The internal score, 5 to 85 in steps of 5: it orders and places, and is never shown. */
export const estSuccess = (x: EstInput): number => roundEst(estRaw(x));

/* ---------- the words a member sees ---------- */

/** How warm a way in is, in words: what a member sees instead of a number. */
export type WayBand = "Warm intro" | "Good path" | "Long shot";
/** Coldest first. */
export const WAY_BANDS: readonly WayBand[] = ["Long shot", "Good path", "Warm intro"];
/** A best route at WARM_EST or more is a Warm intro; at GOOD_EST or more a Good path; under that a Long shot. */
export const GOOD_EST = 15;
export const wayBandOf = (est: number): WayBand => (est >= WARM_EST ? "Warm intro" : est >= GOOD_EST ? "Good path" : "Long shot");
export const wayBandIdx = (b: WayBand) => WAY_BANDS.indexOf(b);
export const isWayBand = (x: unknown): x is WayBand => typeof x === "string" && (WAY_BANDS as readonly string[]).includes(x);
/** The band's index from the score (0 coldest), or null with no route: the map's coarse value across. */
export const wayCoarse = (est: number | null) => (est === null ? null : wayBandIdx(wayBandOf(est)));
/** What a band means, in a line. */
export const WAY_BAND_HINT: Record<WayBand, string> = {
  "Warm intro": "Someone who knows them well can introduce you.",
  "Good path": "A real way in, with a hand-off or a weaker link.",
  "Long shot": "Worth a try, but nobody close vouches for you yet.",
};
/**
 * What kind of route it is, the one label every surface shows for it (the graph, the summary, the
 * comparison badge, the connector): a route with nobody in between is a Direct connection (someone
 * the member knows) or Direct outreach (a note to someone they have never met), whatever its
 * warmth; a Warm intro needs an introducer. Routes with people in between keep their band (Warm
 * intro, Good path, Long shot). The band (WayBand) still orders and places; this is what is said.
 */
export type RouteType = "Direct connection" | "Direct outreach" | WayBand;
export const ROUTE_TYPES: readonly RouteType[] = ["Direct outreach", "Long shot", "Good path", "Warm intro", "Direct connection"];
export function routeTypeOf(r: { est: number; between: number; knows: boolean }): RouteType {
  if (r.between <= 0) return r.knows ? "Direct connection" : "Direct outreach";
  return wayBandOf(r.est);
}
export const isRouteType = (x: unknown): x is RouteType => typeof x === "string" && (ROUTE_TYPES as readonly string[]).includes(x);
/** What a route type means, in a line. */
export const ROUTE_TYPE_HINT: Record<RouteType, string> = {
  ...WAY_BAND_HINT,
  "Direct connection": "You know them yourself. Nobody in between, so you write to them directly.",
  "Direct outreach": "Nobody in between and you haven't met, so it is a direct note that leans on timing.",
};
/** The map's axis across. */
export const WAY_AXIS = "How warm your way in is";

/** How Merlin judges this: the one line behind the link of that name. */
export const HOW_ESTIMATED =
  "Merlin's read of how well each person knows the next, how many hand-offs it takes, and whether the last person decides. A guide, not a prediction: Merlin has no outcome data yet.";

/** What orders a company's routes, best first: the score (unrounded), then fewer hand-offs, then reaching who decides, then the finder's own order. */
export interface RouteKey {
  raw: number;
  handoffs: number;
  decides: boolean;
  tie: number;
}
export function compareRoutes(a: RouteKey, b: RouteKey): number {
  return b.raw - a.raw || a.handoffs - b.handoffs || Number(b.decides) - Number(a.decides) || b.tie - a.tie;
}

/** "1 person", "2 people", "No one". */
export const betweenWords = (n: number) => (n <= 0 ? "No one" : n === 1 ? "1 person" : `${n} people`);

/* ---------- 3. a company ---------- */

/** How well the company fits the member: the lists it is in. Bigger is better, 1 to 3. */
export interface FitIn {
  ball: boolean;
  view: boolean;
  profile: boolean;
}
export function fitLevel(f: FitIn): 1 | 2 | 3 {
  const n = Number(f.ball) * 2 + Number(f.view) + Number(f.profile);
  return n >= 3 ? 3 : n === 2 ? 2 : 1;
}

/** The odds of hiring when Crystal Ball has nothing to say (no function on the member's profile): an open role, then past fractional hires. */
export function oddsFallback(x: { openRole: boolean; pastHires: number; fnsHired: number }): OddsBand {
  if (x.openRole) return "High";
  return x.pastHires >= 2 || x.fnsHired >= 2 ? "Medium" : "Low";
}

/** A warm way in (a Warm intro): a best route scored 35 or more. */
export const WARM_EST = 35;
/** Likely to hire is High or Medium odds; a warm way in is a best route at WARM_EST or more. No route at all is cold. */
export function zoneOf(best: number | null, odds: OddsBand): Zone {
  const likely = odds !== "Low";
  const warm = best !== null && best >= WARM_EST;
  return likely ? (warm ? "go" : "find") : warm ? "warm" : "watch";
}

/** The order companies are listed in: the best route's estimate weighed with the odds and the fit. */
export function companyScore(best: number | null, odds: OddsBand, fit: 1 | 2 | 3, tie = 0): number {
  const b = best ?? 0; // 0 to 85
  return b + oddsIdx(odds) * 30 + fit * 3 + Math.max(0, Math.min(1, tie));
}

/**
 * Where a company's dot goes on the map, 0 to 100 on each axis: across by the best route's Est.
 * success (no route at the far left; WARM_EST on the middle line, so the quadrants are the zones),
 * up by the odds (Low under the middle line, Medium and High above it). `tieY` (0 to 1) places it
 * within its odds lane: Crystal Ball's score.
 */
export function mapPoint(best: number | null, odds: OddsBand, tieY: number): { x: number; y: number } {
  const cy = Math.max(0, Math.min(1, Number.isFinite(tieY) ? tieY : 0));
  let x: number;
  if (best === null) x = 8;
  else if (best < WARM_EST) x = 12 + ((Math.max(EST.min, best) - EST.min) / (WARM_EST - EST.min)) * 32;
  else x = 56 + ((Math.min(EST.max, best) - WARM_EST) / (EST.max - WARM_EST)) * 34;
  const lane = odds === "High" ? [70, 86] : odds === "Medium" ? [56, 66] : [14, 40];
  const y = lane[0] + cy * (lane[1] - lane[0]);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

/**
 * Nudge dots that sit on top of each other apart, inside their own quadrant (they never cross the
 * middle lines, so a dot's zone stays what it is). `gap` is the least distance between centres, in
 * map units. Deterministic: the same input places the same way.
 */
export function spread<T extends { x: number; y: number }>(points: T[], gap = 7, rounds = 60): T[] {
  const out = points.map((p) => ({ ...p }));
  const lo = (v: number) => (v < 50 ? 6 : 54);
  const hi = (v: number) => (v < 50 ? 46 : 92);
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.01) {
          dx = (j % 3) - 1 || 1;
          dy = ((j % 2) * 2 - 1) * 0.5;
        }
        const n = Math.hypot(dx, dy) || 1;
        const push = (gap - d) / 2;
        const ux = (dx / n) * push;
        const uy = (dy / n) * push;
        const ax = a.x;
        const ay = a.y;
        const bx = b.x;
        const by = b.y;
        a.x = Math.min(hi(ax), Math.max(lo(ax), ax - ux));
        a.y = Math.min(hi(ay), Math.max(lo(ay), ay - uy));
        b.x = Math.min(hi(bx), Math.max(lo(bx), bx + ux));
        b.y = Math.min(hi(by), Math.max(lo(by), by + uy));
        moved = true;
      }
    if (!moved) break;
  }
  for (const p of out) {
    p.x = Math.round(p.x * 10) / 10;
    p.y = Math.round(p.y * 10) / 10;
  }
  return out;
}

/* ---------- lines placed from the data ---------- */

/**
 * The fixed middle line (WARM_EST, 35) leaves a member with no contacts of their own on one side:
 * routes through fellow fractionals they haven't met top out near 15, so every mark sat in the
 * "no route" corner. Warm paths places each middle line from the companies on the page instead:
 * where they split about evenly, on a whole value when one splits them well enough (fit 3 of 5,
 * Good path or warmer), else by rank (the better half). The words say which, so the quadrants never
 * claim more than they mean.
 */
export interface Split {
  /** The value a row needs (>=) to be on the high side; null when the split is by rank. */
  at: number | null;
  /** For a split by rank: the fine value a row needs (>=). Infinity: every row is low. */
  fineAt: number;
}

/** The least share of rows a whole-value line must leave on each side, or the line goes by rank. */
export const SPLIT_MIN_SHARE = 0.2;

/**
 * Where a middle line goes. `coarse` is each row's whole value (null: always low, a company with no
 * route), `fine` the same with its tie-breaks (the unrounded estimate, the hiring odds), same order.
 */
export function splitLine(coarse: readonly (number | null)[], fine: readonly number[]): Split {
  const n = coarse.length;
  const vals = coarse.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!vals.length) return { at: null, fineAt: Infinity };
  const distinct = [...new Set(vals)].sort((a, b) => a - b);
  // A whole value: the one that leaves the larger side smallest. Rows without a value are low.
  let best: { at: number; low: number } | null = null;
  for (const at of distinct) {
    const high = vals.filter((v) => v >= at).length;
    const low = n - high;
    if (!high || !low) continue;
    const small = Math.min(high, low);
    if (!best || small > best.low) best = { at, low: small };
  }
  if (best && best.low >= Math.max(1, Math.ceil(n * SPLIT_MIN_SHARE))) return { at: best.at, fineAt: -Infinity };
  // By rank: the top half of the rows that have a value at all (rows without one stay low).
  const withVal = fine.filter((_, k) => coarse[k] !== null && Number.isFinite(coarse[k] as number)).sort((a, b) => b - a);
  if (withVal.length === 1) return { at: null, fineAt: n > 1 ? withVal[0] : Infinity };
  const take = Math.max(1, Math.min(withVal.length, Math.floor(n / 2)));
  return { at: null, fineAt: withVal[take - 1] };
}

/** A row is on the high side of a split. */
export const isHigh = (sp: Split, coarse: number | null, fine: number) => (coarse === null ? false : sp.at !== null ? coarse >= sp.at : fine >= sp.fineAt);

/**
 * Where each row goes along one axis, 0 to 100: the low side in `lo` (default [lo0 + 4, 44]), the
 * high side in `hi` (default [56, 92]). Within its side a row is placed half by its fine value and
 * half by its rank there, so many companies with the same estimate spread out instead of standing in
 * a column (the axis reads Colder to Warmer, never a number). Rows with no value at all sit at
 * `none` (the map's "No route" strip).
 */
export function placeAxis(coarse: readonly (number | null)[], fine: readonly number[], sp: Split, opts: { lo0?: number; none?: number; lo?: [number, number]; hi?: [number, number] } = {}): number[] {
  const lo0 = opts.lo0 ?? 8;
  const [loA, loB] = opts.lo ?? [lo0 + 4, 44];
  const [hiA, hiB] = opts.hi ?? [56, 92];
  const high = coarse.map((c, k) => isHigh(sp, c, fine[k]));
  const side = (on: boolean) => {
    const ks = coarse.map((_, k) => k).filter((k) => high[k] === on && coarse[k] !== null);
    ks.sort((a, b) => fine[a] - fine[b] || a - b);
    const rank = new Map(ks.map((k, i) => [k, ks.length > 1 ? i / (ks.length - 1) : 0.5]));
    const v = ks.map((k) => fine[k]);
    return { rank, min: v.length ? Math.min(...v) : 0, max: v.length ? Math.max(...v) : 0 };
  };
  const L = side(false);
  const H = side(true);
  return coarse.map((c, k) => {
    if (c === null) return opts.none ?? lo0;
    const s = high[k] ? H : L;
    const [a, b] = high[k] ? [hiA, hiB] : [loA, loB];
    const byValue = s.max > s.min ? (fine[k] - s.min) / (s.max - s.min) : 0.5;
    const t = 0.5 * byValue + 0.5 * (s.rank.get(k) ?? 0.5);
    return Math.round((a + t * (b - a)) * 10) / 10;
  });
}

/**
 * Nudge marks apart, each inside its own box [x0, x1, y0, y1] (its quadrant, or the "No route"
 * strip), so a mark never crosses a line and its quadrant stays what it is. Deterministic.
 */
export function spreadBox<T extends { x: number; y: number; box: [number, number, number, number] }>(points: T[], gap = 6.5, rounds = 80): T[] {
  const out = points.map((p) => ({ ...p, x: Math.min(p.box[1], Math.max(p.box[0], p.x)), y: Math.min(p.box[3], Math.max(p.box[2], p.y)) }));
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.01) {
          dx = ((j * 7) % 5) - 2 || 1;
          dy = ((j * 3) % 5) - 2 || 1;
        }
        const n = Math.hypot(dx, dy) || 1;
        const push = (gap - d) / 2;
        const ux = (dx / n) * push;
        const uy = (dy / n) * push;
        a.x = Math.min(a.box[1], Math.max(a.box[0], a.x - ux));
        a.y = Math.min(a.box[3], Math.max(a.box[2], a.y - uy));
        b.x = Math.min(b.box[1], Math.max(b.box[0], b.x + ux));
        b.y = Math.min(b.box[3], Math.max(b.box[2], b.y + uy));
        moved = true;
      }
    if (!moved) break;
  }
  for (const p of out) {
    p.x = Math.round(p.x * 10) / 10;
    p.y = Math.round(p.y * 10) / 10;
  }
  return out;
}

/** How fresh a way in is, by the days since its newest dated signal: 30 or less Fresh, 90 or less Ageing, else Stale. */
export const freshWord = (days: number | null): "Fresh" | "Ageing" | "Stale" | null => (days === null ? null : days <= 30 ? "Fresh" : days <= 90 ? "Ageing" : "Stale");

/** The newest dated thing a piece of evidence rests on, as days ago, and what it is. Null: nothing dated. */
export function evidenceAge(e: Evidence, nowMs: number): { days: number; what: string } | null {
  const yearEnd = (y: number | null) => (y === null ? null : daysSince(`${y}-12-31`, nowMs));
  switch (e.kind) {
    case "met": {
      const d = daysSince(e.last, nowMs);
      return d === null ? null : { days: Math.round(d), what: e.meetings ? "a meeting" : "an email" };
    }
    case "messages": {
      const d = daysSince(e.last, nowMs);
      return d === null ? null : { days: Math.round(d), what: "a message on Merlin" };
    }
    case "client":
    case "together":
    case "reported":
    case "seat": {
      if (e.active) return { days: 0, what: e.kind === "client" ? "your seat there, going now" : "a seat going now" };
      const d = yearEnd(e.endYear);
      return d === null ? null : { days: Math.round(d), what: `a seat that ended in ${e.endYear}` };
    }
    case "linkedin": {
      const d = daysSince(e.since, nowMs);
      return d === null ? null : { days: Math.round(d), what: "the day you connected" };
    }
    case "limsg": {
      const d = daysSince(e.last, nowMs);
      return d === null ? null : { days: Math.round(d), what: "a message on LinkedIn" };
    }
    default:
      return null;
  }
}

/** A route's freshness from what its links rest on: the newest dated one. */
export function freshOf(evidence: readonly (Evidence | null)[], nowMs: number): { word: "Fresh" | "Ageing" | "Stale" | null; days: number | null; line: string } {
  let best: { days: number; what: string } | null = null;
  for (const e of evidence) {
    if (!e) continue;
    const a = evidenceAge(e, nowMs);
    if (a && (!best || a.days < best.days)) best = a;
  }
  if (!best) return { word: null, days: null, line: "Nothing on this path is dated yet, so Merlin can't say how fresh it is." };
  const ago = best.days === 0 ? "today" : best.days === 1 ? "1 day ago" : best.days < 60 ? `${best.days} days ago` : best.days < 730 ? `${Math.round(best.days / 30)} months ago` : `${Math.round(best.days / 365)} years ago`;
  const word = freshWord(best.days);
  const tail = word === "Ageing" ? " Say hello before you ask." : word === "Stale" ? " Reconnect first: an old link is a weaker one." : "";
  return { word, days: best.days, line: /going now$/.test(best.what) ? `Newest signal: ${best.what}.${tail}` : `Newest signal: ${best.what}, ${ago}.${tail}` };
}

/* ---------- words ---------- */

/** Two letters for a person or a company with no picture: "Jake Moreno" is JM, "Acme" is AC. */
export function initialsOf(name: string): string {
  const w = name.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 24" within the last year, else "Oct 2024". */
export function monthDay(day: string, nowMs: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const mon = MONTHS[Number(m[2]) - 1] ?? "";
  return Math.abs(nowMs - at) <= 330 * DAY ? `${mon} ${Number(m[3])}` : `${mon} ${m[1]}`;
}

/** The words under a link, from what it rests on (the strongest piece): "6 meetings, last Oct 24". Names in `at` are ones the member may see. */
export function evidenceWords(e: Evidence, nowMs: number, at?: string | null): string {
  const y = (iso: string | null | undefined) => (iso ? iso.slice(0, 4) : null);
  switch (e.kind) {
    case "met": {
      if (e.meetings) return `${e.meetings} ${e.meetings === 1 ? "meeting" : "meetings"}${e.last ? `, last ${monthDay(e.last, nowMs)}` : ""}`;
      if (e.emails) return `${e.emails} ${e.emails === 1 ? "email" : "emails"}${e.both ? " both ways" : ""}${e.last ? `, last ${monthDay(e.last, nowMs)}` : ""}`;
      return "In your contacts";
    }
    case "messages":
      return `${e.count > 1 ? `${e.count} messages` : "Messages"} on Merlin${e.last ? `, last ${monthDay(e.last, nowMs)}` : ""}`;
    case "client":
      return e.active ? `Your client${at ? ` at ${at}` : ""} now` : `Your client${at ? ` at ${at}` : ""}${e.endYear ? ` until ${e.endYear}` : ""}`;
    case "together":
      return e.active ? `Work together${at ? ` at ${at}` : ""} now` : `Worked together${at ? ` at ${at}` : ""}${e.endYear ? ` until ${e.endYear}` : ""}`;
    case "peer":
      return e.shared ? "A peer on Merlin, you share a client" : "A peer on Merlin";
    case "linkedin":
      return `From your LinkedIn${y(e.since) ? ` since ${y(e.since)}` : ""}, not met`;
    case "limsg":
      return `${e.count} LinkedIn ${e.count === 1 ? "message" : "messages"}${e.both ? " both ways" : ""}${e.last ? `, last ${monthDay(e.last, nowMs)}` : ""}`;
    case "vouch":
      return e.rec ? (e.theirs ? "Recommended you on LinkedIn" : "You recommended them on LinkedIn") : e.theirs ? "Endorsed you on LinkedIn" : "You endorsed them on LinkedIn";
    case "invited":
      return e.out ? "You invited them on LinkedIn, not connected yet" : "Invited you on LinkedIn, not connected yet";
    case "contact":
      return "In your contacts, not met";
    case "colleague":
      return `Work together${at ? ` at ${at}` : ""}`;
    case "sameplace":
      return `Both at ${at ?? "the same company"}${e.year ? `, ${e.year}` : ""}`;
    case "leaderElsewhere":
      return `One of their leaders worked${at ? ` at ${at}` : " where they work"}`;
    case "reported":
      return e.active ? "Reports to them now" : `Reported to them${e.endYear ? ` until ${e.endYear}` : ""}`;
    case "seat":
      return e.active ? "Holds a fractional seat there now" : `Held a fractional seat there${e.endYear ? ` until ${e.endYear}` : ""}`;
    case "works":
      return "Works there";
    case "none":
      return "You have never met";
  }
}
