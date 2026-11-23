/**
 * The radar (server only; members read it by FEATURE_NAME, lib/radar/types.ts): every morning,
 * each member gets the signals that match their Ideal Fractional Profile, by Slack (when
 * connected) and email, and the app lists each day's companies. See lib/radar/types.ts for the
 * signals and lib/radar/present.ts for what a card reveals.
 *
 * When it runs: on its schedule (lib/schedule.ts; once a UTC day from 13:00 UTC by default, the
 * owner can change it in Pilot metrics), started by the scheduler's timer or a page load
 * (maybeRadar), and when an admin presses "Run now" on Pilot metrics (runRadar with force).
 * RN_RADAR=0 turns the scheduled run off. A run looks back to the last run (at most 7
 * days), and a day with no signal for a member sends that member nothing.
 *
 * Every member gets every signal: a company's name is locked for everyone until they unlock it,
 * so nothing here is held back by plan. Each card names the company only when the member's table
 * does (Trial and Pro aside: they see every name). In the email each card opens its own company's
 * record over that day's companies (RadarCard.open, radarOpenPath: /?sig=<day>&c=<id>), where it opens
 * as on the page: free on Trial and Pro, today's one in full on Free, COMPANY_PRICE with billing off
 * (crystalCompanyIds is what the server checks; lib/table.ts crystalOf the plan's rule). The button
 * under the cards opens the day's companies (radarPath: /?p=table&sig=<day>). Every link in the email
 * signs the member in once (lib/emailIn.ts); Slack's never do, a channel being shared.
 * In Slack a named company also links to its record, and one the member knows shows its logo.
 * Plans (lib/plan.ts) change delivery only: Pro (and the trial) get signals at once, when a scan or
 * a change to a seat makes one, in the next alert batch with Slack or a webhook (radarInstant);
 * everyone else gets one radar a UTC day. With billing off nobody is on Pro.
 *
 * What the member chose (Notifications, lib/radar/types radarPrefs): the email every morning, twice a
 * week (Monday and Thursday) or once a week (Monday), or off, and Crystal Ball in Slack on or off,
 * apart. A twice-a-week or weekly email waits for its day (radarEmailDue), and what moved meanwhile
 * stays unsent, so its email rolls it up (up to RADAR_ROLLUP_MAX companies). Slack keeps its own pace.
 * Nothing goes out, by email or Slack, on a day with no new company for the member: a day with only
 * standing states ("still a good time") is kept for the page, not sent (keepForView). One exception,
 * the email only: follow-ups due in Your pipeline are a reason to come back, so a day with a
 * follow-up that came due since the member's last email still sends one, about the follow-ups alone.
 *
 * Follow-ups due (lib/pipelineActions.ts followUpsOf): above the companies in the email, at most
 * EMAIL_FOLLOW_UPS, the most overdue first, each linking to the company's record (signed in, through
 * /api/radar/go like the cards). A company is named only when the member's table shows it (as a
 * member, as the cards), and a person from the member's Google account never is ("the person you
 * know there"). Never in Slack, a channel being shared.
 *
 * The day's view (radarView): the companies that went out that UTC day, as kept with the delivery
 * (State.radar.members[id].days, RADAR_KEEP_VIEW_DAYS: 31 days), so the email's link opens exactly
 * what the email listed. A day nothing went out lists the signals that happened that day. The page
 * reads them as ranges (Today, Last 7 days, Last 30 days): each company once, at its latest day.
 *
 * Never twice: each member's sent signals are kept (State.radar.members[id].sent, 120 days). A
 * signal is marked sent only when it went out by email or Slack. Each company sent is kept 30 days
 * (State.radar.members[id].shown): a calendar signal or a standing state doesn't name it again inside them.
 *
 * A member's day (lib/radar/match.ts pickDaily): their unsent High and Medium events since the last
 * run and the RADAR_CARRY_DAYS before it, at most RADAR_DAY_MAX companies; when fewer than
 * RADAR_DAY_MIN come from events, the strongest standing states they haven't been shown fill it
 * ("Still a good time: …", signals.ts standingSignals). Nothing is made up to fill a day: a member
 * with neither gets nothing.
 *
 * Crystal Ball's ranking (lib/radar/match.ts scoreFor, lib/radar/predict.ts): every member's
 * signals are scored and ranked, most likely first. High and Medium go by email and Slack (the
 * email's top EMAIL_CARDS); Low stays on the page only (the day's view keeps it with the delivery).
 * Merlin's own transitions between fractional seats move the research's priors (observedTransitions).
 *
 * Product signals (State.signals): radar_sent (one per delivery, where = email, slack, email+slack
 * or instant), radar_opened (the email's pixel, or the day's view in the app), radar_clicked (a
 * link in the email or Slack, through /api/radar/go), radar_off (the email turned off: Notifications,
 * Your profile's old switch, or the email's unsubscribe link).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { publicBase } from "../links";
import { siteKey } from "../tableFields";
import { emailEnabled, sendEmail } from "../email";
import { billingLive, gated, hasPro, type PlanRecord } from "../plan";
import { deliver, functionFor } from "../notify";
import { detectSignals, fundingCompanies, observedTransitions, recordHeadcount, standingSignals, type RawSignal } from "./signals";
import { deliverable, icpMisses, inIcp, pickDaily, profileOf, signalsFor, icpIsEmpty, type RadarProfile, type Scored } from "./match";
import { isOut, type RadarOutRow } from "./out";
import { isTuned } from "./tune";
import { bandOf } from "./predict";
import { isCalendar } from "./signals";
import { networkWarmth } from "../google/types"; // [google network]
import { dayOf, rowsOf, viewLine, type CardContext, type MemberSignal } from "./present";
import { EMAIL_FOLLOW_UPS, renderRadarEmail, type EmailFollowUp } from "./format";
import { followUpsOf } from "../pipelineActions";
import { fundingSource, type FundingSource } from "./sources/funding";
import { isDue, settingOf } from "../schedule";
import {
  RADAR_CARRY_DAYS, RADAR_COMPANY_QUIET_DAYS, RADAR_HOUR_UTC, RADAR_KEEP_DAYS, RADAR_KEEP_VIEW_DAYS, RADAR_MAX_WINDOW_DAYS, RADAR_RANGES, RADAR_ROLLUP_MAX, RADAR_VIEW_DAYS, SIG_DAY_RE, emptyRadar, radarEmailDue, radarOpenPath, radarPath, radarPrefs, radarRangeOf,
  type RadarDay, type RadarEmail, type RadarRange, type RadarSentRow, type RadarState, type RadarView,
} from "./types";
import { NOTIFICATIONS_PATH, emailLinker, grantQuery, safePath } from "../emailIn";

const DAY = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/** A delivery's companies kept for one day's view: at most this many signals. */
const DAY_ROWS_MAX = 200;
/** The UTC day of a time. */
const dayOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00.000Z`);

/* ---------- plans and links ---------- */

/** What billing stores for the member (State.billing, from the billing branch), read defensively: it may not exist. */
const planRecord = (s: State, memberId: string): PlanRecord | undefined =>
  s.billing?.members?.[memberId] as PlanRecord | undefined;
/** Pro or the trial right now. False for everyone while billing is off. */
export const isPro = (s: State, memberId: string, nowMs: number) => hasPro(planRecord(s, memberId), nowMs);

/** The signature on the radar's links for one member: unsubscribe, the open pixel and tracked clicks. */
export const radarSig = (memberId: string) => createHmac("sha256", T.ID_KEY).update(`radar:${memberId}`).digest("base64url").slice(0, 22);
const sigOk = (memberId: string, sig: unknown) => {
  const want = Buffer.from(radarSig(memberId));
  const got = Buffer.from(String(sig ?? ""));
  return want.length === got.length && timingSafeEqual(want, got);
};
/** An opaque card id per member: never a record's public id. */
const cardId = (memberId: string, key: string) => createHmac("sha256", T.ID_KEY).update(`radar-card:${memberId}:${key}`).digest("base64url").slice(0, 12);
/** An opaque company id per member, for counting companies in a merged post: never a record's public id. */
const coId = (memberId: string, companyId: string) => createHmac("sha256", T.ID_KEY).update(`radar-co:${memberId}:${companyId}`).digest("base64url").slice(0, 12);

/**
 * A path the click link may send to: the app's root with a query, nothing else (no open
 * redirect). The day's companies (/?p=table&sig=2026-11-19) and a card's company are two (lib/emailIn.ts).
 */
export { safePath };

/**
 * Where a sign-in link returns to (POST { emailLink, to }): the page the visitor asked from, a
 * link to a day's companies say, as more of the sign-in link's query ("&p=table&sig=…"). Only a
 * path safePath allows, without a sign-in code or invite code of its own. "" when there is none.
 */
export function returnQuery(to: unknown): string {
  const path = safePath(to);
  if (!path || path === "/") return "";
  const q = new URLSearchParams(path.slice(2));
  for (const k of ["k", "ref"]) q.delete(k);
  const s = q.toString();
  return s ? `&${s}` : "";
}

/** The radar email's own unsubscribe link (the weekly email's route, with r=radar and the radar's signature). */
export const radarUnsubscribeUrl = (base: string, memberId: string) => `${base}/api/table/unsubscribe?m=${encodeURIComponent(T.pubId(memberId))}&s=${radarSig(memberId)}&r=radar`;

/**
 * Absolute, tracked links for one channel: each card's links and the button go through
 * /api/radar/go. `grant` (the email only, never Slack, which a channel shares): each link also
 * signs the member in, once (lib/emailIn.ts grantQuery).
 */
function tracked(day: RadarDay, base: string, memberId: string, w: "email" | "slack", grant?: (path: string) => string): RadarDay {
  const q = `m=${encodeURIComponent(T.pubId(memberId))}&s=${radarSig(memberId)}&w=${w}`;
  const go = (path: string) => `${base}/api/radar/go?${q}${grant ? `&${grant(path)}` : ""}&to=${encodeURIComponent(path)}`;
  return {
    ...day,
    url: go(day.url),
    cards: day.cards.map((c) => ({ ...c, url: go(c.url), ...(c.place ? { place: go(c.place) } : {}), ...(c.open ? { open: go(c.open) } : {}) })),
  };
}

/* ---------- who has a radar ---------- */

type G = ReturnType<typeof T.graph>;
interface Ctx {
  seed: Seed;
  s: State;
  g: G;
  idx: ReturnType<typeof T.memberIndex>;
  tracks: ReturnType<typeof T.tracksOf>;
  nowMs: number;
}
const ctxOf = (seed: Seed, s: State, nowMs: number): Ctx => ({ seed, s, g: T.graph(seed, s), idx: T.memberIndex(seed, s), tracks: T.tracksOf(seed, s), nowMs });

/** The member's own table shows the company (as a member: an admin's locked companies stay locked here too). */
const knownTo = (c: Ctx, m: Member, companyId: string) => !T.identityHidden(c.g, c.s, c.idx, c.tracks, m, companyId, true);

/**
 * Logos for a delivery's companies that the member's table shows, by internal id: the https
 * address of our own GET /api/logo/<public id> (lib/logo.ts), for Slack to fetch. The icon comes
 * from the company's own website through our server: Slack is never pointed at an icon service, and
 * the address names no domain. Only for a company with a website of its own (not a shared host),
 * and only when the public address is https. A company locked for the member gets none.
 */
async function logosFor(c: Ctx, m: Member, sigs: MemberSignal[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const base = (publicBase() || "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) return out;
  for (const id of new Set(sigs.map((x) => x.companyId))) {
    if (!knownTo(c, m, id)) continue;
    const n = c.g.companies.get(id);
    const site = n ? siteKey(T.live(n, c.s, "website")) : null;
    if (site && !site.includes("/")) out.set(id, `${base}/api/logo/${encodeURIComponent(T.pubId(id))}`);
  }
  return out;
}

/**
 * The email's follow-ups for a member (paths, not yet tracked): every one due, so the email can say
 * how many more there are, each linking to the company's record. A company the member's table
 * doesn't show is "a company in your pipeline", and a person from their Google account is never named.
 */
function emailFollowUps(c: Ctx, m: Member): (Omit<EmailFollowUp, "url"> & { path: string; due: string })[] {
  if (!c.s.pipeline?.[m.id]?.entries?.length) return [];
  return followUpsOf(c.seed, c.s, m, c.nowMs, "merlin", (id) => knownTo(c, m, id)).map((f) => ({ title: f.title, line: f.line, due: f.due, path: `/?c=${encodeURIComponent(f.companyPub)}` }));
}
/** Your pipeline in the app: the button of an email about follow-ups alone. */
const PIPELINE_PATH = "/?p=pipeline";

/** A member's cards for one UTC day: every link opens that day's companies; a named one also links to its record. */
function cardContext(c: Ctx, m: Member, day: string, logos: Map<string, string> = new Map()): CardContext {
  // Trial and Pro: every card names its company, free. Naming it on the card doesn't make it theirs
  // or charge: the table keeps it locked, and its people and seat holders still need their own unlocks.
  const pro = isPro(c.s, m.id, c.nowMs);
  // Free (trial over, billing live): one Crystal Ball company a day opens in full, free, while today's is left. Billing off: neither.
  const free = gated(planRecord(c.s, m.id), c.nowMs) && T.crystalOf(c.s, m.id, c.nowMs) === "one";
  return {
    // The member's own table, as a member: a company locked for them stays unnamed (an admin's too), unless they are on Pro.
    visible: (companyId) => pro || knownTo(c, m, companyId),
    // Trial and Pro open any Crystal Ball company free; Free opens one a day, in full.
    opens: (companyId) => (knownTo(c, m, companyId) ? null : pro ? "free" : free ? "one" : null),
    cardId: (key) => cardId(m.id, key),
    coId: (companyId) => coId(m.id, companyId),
    url: radarPath(day),
    known: (companyId) => knownTo(c, m, companyId),
    place: (companyId) => `/?c=${encodeURIComponent(T.pubId(companyId))}`,
    // The email's card: the company's record, opened from this day's Crystal Ball (its free open ready, as on the page).
    open: (companyId) => radarOpenPath(day, T.pubId(companyId)),
    logo: (companyId) => logos.get(companyId) ?? null,
  };
}

/** A signal as the day's view keeps it. */
const sentRow = (x: MemberSignal & { horizon?: [number, number]; score?: number }): RadarSentRow => ({
  k: x.key,
  c: x.companyId,
  kind: x.kind,
  l: viewLine(x),
  ...(x.band ? { b: x.band } : {}),
  ...(x.whyNow ? { w: x.whyNow } : {}),
  // When it happened, when a hire is likely and its score: what the page's side panel and the member's tuning read.
  ...(x.at ? { a: x.at.slice(0, 10) } : {}),
  ...(x.horizon ? { h: x.horizon } : {}),
  ...(typeof x.score === "number" && Number.isFinite(x.score) ? { s: Math.round(x.score * 1000) / 1000 } : {}),
});

/** The member's radar profile, or null when the radar can match nothing for them (no function, or no Ideal Fractional Profile). */
function readyProfile(c: Ctx, m: Member): RadarProfile | null {
  const p = profileOf(c.seed, c.s, m.id, functionFor(c.s, m));
  return p.fn && !icpIsEmpty(p.icp) ? p : null;
}

/** Signed in (or joined), so the radar goes to them, as the weekly email decides. */
const signedIn = (c: Ctx, id: string) => !!c.s.seen[id] || !!c.s.profiles[id] || c.s.members.some((x) => x.id === id);

/** A working Slack or webhook destination. */
const hasDest = (s: State, id: string) => {
  const mi = s.integrations?.members[id];
  return [mi?.slack, mi?.webhook].some((d) => !!d && !d.broken);
};

const radarOf = (d: State): RadarState => {
  d.radar ??= emptyRadar();
  d.radar.members ??= {};
  d.radar.stats ??= { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 };
  return d.radar;
};
const sentKeys = (s: State, id: string) => s.radar?.members?.[id]?.sent ?? {};

/**
 * Mark these signals sent to the member, and keep `rows` (the delivered ones and the Low ones that
 * stayed on the page) as the day's companies, for the view the links open. Forgets sent keys older
 * than RADAR_KEEP_DAYS and days older than RADAR_KEEP_VIEW_DAYS.
 */
function markSent(d: State, memberId: string, sigs: MemberSignal[], nowIso: string, via: string, rows: MemberSignal[] = sigs) {
  const r = radarOf(d);
  const mine = (r.members[memberId] ??= { sent: {} });
  mine.sent ??= {};
  const nowMs = Date.parse(nowIso);
  for (const [k, at] of Object.entries(mine.sent)) if (nowMs - Date.parse(at) > RADAR_KEEP_DAYS * DAY) delete mine.sent[k];
  for (const x of sigs) mine.sent[x.key] = nowIso;
  // Each company sent, for the quiet days a calendar signal or a standing state waits before naming it again.
  const shown = (mine.shown ??= {});
  for (const [k, at] of Object.entries(shown)) if (nowMs - Date.parse(at) > RADAR_COMPANY_QUIET_DAYS * DAY) delete shown[k];
  for (const x of sigs) shown[x.companyId] = nowIso;
  const today = nowIso.slice(0, 10);
  const days = (mine.days ??= {});
  for (const k of Object.keys(days)) if (!SIG_DAY_RE.test(k) || nowMs - dayStart(k) > RADAR_KEEP_VIEW_DAYS * DAY) delete days[k];
  const kept = (days[today] ??= []);
  for (const x of rows) if (!kept.some((y) => y.k === x.key) && kept.length < DAY_ROWS_MAX) kept.push(sentRow(x));
  mine.lastAt = nowIso;
  mine.lastCount = sigs.length;
  mine.lastVia = via;
}

/**
 * A day nothing new went out (only companies still a good time): no email, no post, nothing marked
 * sent, but the day's view keeps them, so the page lists them today.
 */
function keepForView(d: State, memberId: string, rows: MemberSignal[], nowIso: string) {
  const mine = (radarOf(d).members[memberId] ??= { sent: {} });
  const kept = ((mine.days ??= {})[nowIso.slice(0, 10)] ??= []);
  for (const x of rows) if (!kept.some((y) => y.k === x.key) && kept.length < DAY_ROWS_MAX) kept.push(sentRow(x));
}

/** Funding events' companies with no ownership on file become VC-backed (by "scan": nobody earned for it, and a member can correct it). */
function inferVcBacked(d: State, events: { companyId: string }[], nowIso: string): number {
  let n = 0;
  for (const f of events) {
    const k = `${f.companyId}.ownership`;
    if (d.values[k]) continue;
    d.values[k] = { value: "VC-backed", by: "scan", at: nowIso, status: "live" };
    n++;
  }
  return n;
}

/* ---------- the day's companies in the app ---------- */

/** [ux ws3] A day read as any company lists at most this many companies. */
export const ANY_COMPANY_MAX = 20;
/** The rows of the first `n` companies, in order. */
function firstCompanies(rows: RadarSentRow[], n: number): RadarSentRow[] {
  const seen = new Set<string>();
  return rows.filter((x) => (seen.has(x.c) ? true : seen.size < n ? (seen.add(x.c), true) : false));
}

/** A day the view still opens when asked for it: today or earlier, inside RADAR_KEEP_VIEW_DAYS. */
const keptDay = (day: string, nowMs: number) => day <= dayOfMs(nowMs) && nowMs - dayStart(day) <= RADAR_KEEP_VIEW_DAYS * DAY;
/** Every day the view still opens, today first: the days Crystal Ball's companies come from (the page's ranges and crystalCompanyIds alike). */
const keptDays = (nowMs: number) => Array.from({ length: RADAR_KEEP_VIEW_DAYS + 1 }, (_, i) => dayOfMs(nowMs - i * DAY)).filter((d) => keptDay(d, nowMs));

/**
 * The member's Crystal Ball rows for these UTC days, as the day's view lists them: a day something
 * went out lists exactly what went out (kept with the delivery); any other day lists the signals
 * that happened that day and never went out. Only companies still on file.
 */
function dayRows(c: Ctx, m: Member, wanted: string[]): { p: RadarProfile; ready: boolean; byDay: Map<string, RadarSentRow[]>; raw: RawSignal[] } {
  const { seed, s, nowMs } = c;
  // [ux ws3] No Ideal Fractional Profile yet: the page reads it as any company (the morning run still needs one).
  const p: RadarProfile = { ...profileOf(seed, s, m.id, functionFor(s, m)), any: true };
  const ready = !!p.fn;
  const byDay = new Map<string, RadarSentRow[]>();
  if (!ready || !wanted.length) return { p, ready, byDay, raw: [] };
  const kept = s.radar?.members?.[m.id]?.days ?? {};
  const keptKeys = new Set(Object.values(kept).flatMap((rows) => rows.map((x) => x.k)));
  // Days nothing went out: the signals that happened that day (and never went out another day).
  const fromMs = Math.min(...wanted.map(dayStart));
  const raw = detectSignals(seed, s, fromMs, nowMs);
  // [google network] the page ranks by who the member knows too (networkWarmth: nothing with RN_GOOGLE off).
  const scored = signalsFor(raw, p, { counts: observedTransitions(seed, s), nowMs, warmth: networkWarmth(s, m.id, nowMs) });
  const live = scored.filter((x) => !keptKeys.has(x.key));
  // A member who tuned their ball (lib/radar/tune.ts): a kept row reads as its signal scores for them now, where the signal is still
  // in view (its band and why-now as the page shows them; its line, and what the email said, stay). Nobody else's rows change.
  const now = isTuned(p.tune) ? new Map(scored.map((x) => [x.key, x])) : null;
  const retuned = (x: RadarSentRow): RadarSentRow => {
    const y = now?.get(x.k);
    return y ? { ...x, b: y.band, w: y.whyNow, h: y.horizon, s: Math.round(y.score * 1000) / 1000 } : x;
  };
  for (const d of wanted) {
    const rows = kept[d]?.length ? (now ? kept[d].map(retuned) : kept[d]) : live.filter((x) => x.at.slice(0, 10) === d).map(sentRow);
    // A company merged away or taken out since is no row.
    const onFile = rows.filter((x) => c.g.companies.has(x.c));
    // [ux ws3] Any company (no profile yet): the day's most likely companies, not every one (the rows come most likely first).
    byDay.set(d, icpIsEmpty(p.icp) ? firstCompanies(onFile, ANY_COMPANY_MAX) : onFile);
  }
  return { p, ready, byDay, raw };
}

/**
 * The companies in the member's Crystal Ball (internal ids): every company a day of their view
 * lists, any day it still opens (today back to RADAR_KEEP_VIEW_DAYS). What the server checks before
 * a company opens free from Crystal Ball (lib/table.ts, the unlock with from "crystal"): a client
 * can't claim one. Pure on the seed and state it is given, so an action reads it from its own draft.
 */
export function crystalCompanyIds(seed: Seed, s: State, m: Member, nowMs: number): Set<string> {
  const { byDay } = dayRows(ctxOf(seed, s, nowMs), m, keptDays(nowMs));
  return new Set([...byDay.values()].flatMap((rows) => rows.map((x) => x.c)));
}

/**
 * The member's Crystal Ball rows by company (internal id): the latest day's row for each, with its
 * band and line, for the specific ask for an introduction (lib/paths/index.ts). The same companies
 * as crystalCompanyIds.
 */
export function crystalRowsOf(seed: Seed, s: State, m: Member, nowMs: number): Map<string, RadarSentRow> {
  const { byDay } = dayRows(ctxOf(seed, s, nowMs), m, keptDays(nowMs));
  const out = new Map<string, RadarSentRow>();
  for (const d of [...byDay.keys()].sort().reverse()) for (const x of byDay.get(d) ?? []) if (!out.has(x.c)) out.set(x.c, x);
  return out;
}

/** The same, as the public ids the member's table and the connector use. Empty when the token is nobody's. */
export async function crystalPublicIds(token: string | null, nowMs = Date.now()): Promise<Set<string>> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) return new Set();
  return new Set([...crystalCompanyIds(seed, s, m, nowMs)].map((id) => T.pubId(id)));
}

/** Most likely first; a row kept before Crystal Ball scored (no band) after Low. */
const BAND_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const bandOrder = (b?: string) => BAND_ORDER[b ?? ""] ?? 3;

/**
 * A range's rows: each company once, with its signals of the most recent day it appeared on
 * (`days` today first), and that day. In the order the page reads: most likely first, then newest,
 * then the day's own order (its most likely first).
 */
function rangeRows(byDay: Map<string, RadarSentRow[]>, days: string[]): { rows: RadarSentRow[]; dayOf: Map<string, string> } {
  const dayOf = new Map<string, string>();
  const rows: RadarSentRow[] = [];
  for (const d of days)
    for (const x of byDay.get(d) ?? []) {
      const at = dayOf.get(x.c);
      if (at === undefined) dayOf.set(x.c, d);
      else if (at !== d) continue;
      rows.push(x);
    }
  return { rows, dayOf };
}

/**
 * GET /api/table?radar=1[&day=YYYY-MM-DD]: one UTC day's companies for the member, the list the
 * email's and Slack's links open. A day something went out lists exactly what went out (kept with
 * the delivery); any other day of the last RADAR_VIEW_DAYS lists the signals that happened that
 * day and were never sent. Only the member's own signals, and only companies still in the table.
 * No day asked: the latest day with something in it. A day older than what is kept (or not a
 * day): the latest, with `expired`. Null when signed out. Home, Today's moves and the connect
 * moment read it this way.
 *
 * `rangeAsked` (&range=, the page): Crystal Ball as ranges. Every kept day is read (the same days
 * crystalCompanyIds reads, so whatever a range lists opens from it), and the view lists the range
 * asked for (RADAR_RANGES), or by default Today if it has companies, else Last 7 days, else Last 30
 * days. A kept day asked for (an email's or Slack's link) lists that day alone, as before, with
 * `range` null; one that isn't kept opens the default range with `expired`.
 */
export async function radarView(token: string | null, dayAsked?: string | null, nowIso?: string, rangeAsked?: string | null): Promise<RadarView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) return null;
  const nowMs = Date.parse(nowIso ?? "") || Date.now();
  const today = dayOfMs(nowMs);
  const c = ctxOf(seed, s, nowMs);
  const pro = isPro(s, m.id, nowMs);
  const ranged = rangeAsked != null;
  const list = Array.from({ length: RADAR_VIEW_DAYS }, (_, i) => dayOfMs(nowMs - i * DAY));
  const asked = typeof dayAsked === "string" && SIG_DAY_RE.test(dayAsked) && Number.isFinite(dayStart(dayAsked)) ? dayAsked : null;
  // A day asked for that is kept (an older email's link) is listed too.
  const inKeep = !!asked && keptDay(asked, nowMs);
  const kept = keptDays(nowMs);
  const { p, ready, byDay, raw } = dayRows(c, m, ranged ? kept : inKeep && !list.includes(asked!) ? [...list, asked!] : list);
  const count = (d: string) => new Set((byDay.get(d) ?? []).map((x) => x.c)).size;
  const latest = list.find((d) => count(d) > 0) ?? today;
  const day = inKeep ? asked! : ranged ? today : latest;
  // The page's ranges: each company once, at its latest day in the range.
  const cut = (n: number) => rangeRows(byDay, kept.slice(0, n));
  const ranges = ranged ? RADAR_RANGES.map((r) => ({ range: r.range, companies: cut(r.days).dayOf.size })) : [];
  const range: RadarRange | null = !ranged || inKeep ? null : (radarRangeOf(rangeAsked) ?? ranges.find((r) => r.companies > 0)?.range ?? "30d");
  const shown = range ? cut(RADAR_RANGES.find((r) => r.range === range)!.days) : { rows: byDay.get(day) ?? [], dayOf: null };
  const proName = (co: string) => (pro && T.identityHidden(c.g, c.s, c.idx, c.tracks, m, co, true) ? { name: c.g.companies.get(co)?.name ?? undefined } : {});
  // "Why not" (lib/radar/out.ts): a range leaves out the companies the member left out (a day's link lists what it listed).
  const outs = s.radar?.members?.[m.id]?.out ?? {};
  const newest = new Map<string, number>();
  if (range) for (const [d, rs] of byDay) for (const x of rs) newest.set(x.c, Math.max(newest.get(x.c) ?? 0, Date.parse(`${x.a ?? d}T12:00:00Z`) || 0));
  const leftOut = (co: string) => !!range && isOut(outs[co], newest.get(co) ?? null);
  const score = new Map<string, number>();
  for (const x of shown.rows) score.set(x.c, Math.max(score.get(x.c) ?? 0, x.s ?? 0));
  const rows = rowsOf(shown.rows.filter((x) => !leftOut(x.c)), T.pubId).map(({ id, c: co, kinds, lines, notes, band, sigs, h }) => ({
    id,
    ...(shown.dayOf ? { day: shown.dayOf.get(co) } : {}),
    kinds,
    lines,
    ...(notes.some(Boolean) ? { notes } : {}),
    ...(band ? { band } : {}),
    // Trial and Pro see each company named here, free (the table still keeps it locked and theirs to unlock).
    ...proName(co),
    ...(range ? { sigs, ...(h ? { h } : {}) } : {}),
    co,
  }));
  // A range reads most likely first, then newest (rows come newest day first; the sort keeps that order within a band).
  // A member who tuned: most likely first by their own weights.
  const tuned = isTuned(p.tune);
  if (range) rows.sort((a, b) => bandOrder(a.band) - bandOrder(b.band) || (tuned ? (score.get(b.co) ?? 0) - (score.get(a.co) ?? 0) : 0));
  const out = range ? outRows(c, m, p, byDay, raw, outs, kept, proName) : [];
  return {
    on: ((x) => x.email !== "off" || x.slack)(radarPrefs(s.profiles[m.id])),
    ready,
    ...(ready && icpIsEmpty(p.icp) ? { anyCompany: true } : {}),
    function: p.fn,
    before: p.before,
    beforeFromMember: p.beforeFromMember,
    day,
    today,
    ...(dayAsked != null && dayAsked !== "" && !inKeep ? { expired: true } : {}),
    days: list.map((d) => ({ day: d, companies: count(d) })),
    ...(ranged ? { range, ranges } : {}),
    rows: rows.map(({ co: _co, ...r }) => r), // eslint-disable-line @typescript-eslint/no-unused-vars
    email: emailEnabled() && EMAIL_RE.test(m.email),
    slack: hasDest(s, m.id),
    ...(range ? { out } : {}),
    ...(tuned ? { tune: p.tune } : {}),
  };
}

/** "Why not" lists at most this many held back by Merlin, and this many outside the ideal client. */
const OUT_HELD_MAX = 10;
const OUT_ICP_MAX = 3;

/**
 * "Why not" (lib/radar/out.ts): the companies the member left out, with their reasons; then those
 * Merlin kept off the email (a High or Medium event in the ball's last RADAR_CARRY_DAYS days that no
 * morning sent: the day's limit, or a company shown in the last 30 days with nothing new); then the
 * strongest High events this week at companies outside the ideal client. A company is named only as
 * the ball names it (the member's table, or Trial and Pro).
 */
function outRows(
  c: Ctx,
  m: Member,
  p: RadarProfile,
  byDay: Map<string, RadarSentRow[]>,
  raw: RawSignal[],
  outs: Record<string, { r: string; at: string }>,
  kept: string[],
  proName: (co: string) => { name?: string },
): RadarOutRow[] {
  const { s, nowMs } = c;
  const known = (co: string) => (knownTo(c, m, co) ? {} : proName(co));
  const rows: RadarOutRow[] = [];
  for (const [co, e] of Object.entries(outs)) {
    if (!c.g.companies.has(co)) continue;
    if (e.r === "anyway") rows.push({ id: T.pubId(co), by: "merlin", r: "anyway", at: e.at, ...known(co) });
    else rows.push({ id: T.pubId(co), by: "you", r: e.r as RadarOutRow["r"], at: e.at, ...known(co) });
  }
  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const listed = new Set(Object.keys(outs));
  const mem = s.radar?.members?.[m.id];
  const sent = mem?.sent ?? {};
  const keptDaysMap = mem?.days ?? {};
  let held = 0;
  // Kept off the email: a delivery's day, its High and Medium rows that were not sent, at a company with nothing sent that day.
  for (const d of kept.slice(0, RADAR_CARRY_DAYS)) {
    if (!keptDaysMap[d]?.length) continue;
    const day = byDay.get(d) ?? [];
    const sentCo = new Set(day.filter((x) => sent[x.k]).map((x) => x.c));
    for (const x of day) {
      if (held >= OUT_HELD_MAX) break;
      if (sent[x.k] || sentCo.has(x.c) || listed.has(x.c) || !x.b || x.b === "Low") continue;
      listed.add(x.c);
      held++;
      const shownAt = Date.parse(mem?.shown?.[x.c] ?? "");
      const quiet = Number.isFinite(shownAt) && isCalendar({ kind: x.kind }) && nowMs - shownAt < RADAR_COMPANY_QUIET_DAYS * DAY;
      rows.push({ id: T.pubId(x.c), by: "merlin", r: quiet ? "quiet" : "limit", at: `${d}T12:00:00.000Z`, band: x.b, line: x.l, ...known(x.c) } as RadarOutRow);
    }
  }
  // Outside the ideal client: the strongest this week, each with the part that doesn't match.
  if (!icpIsEmpty(p.icp) && p.fn) {
    const anyP: RadarProfile = { ...p, icp: null, any: true };
    const weekMs = nowMs - 7 * DAY;
    const seen = new Set<string>();
    for (const x of signalsFor(raw.filter((y) => y.atMs >= weekMs && !inIcp(p.icp, y.co)), anyP, { nowMs })) {
      if (seen.size >= OUT_ICP_MAX) break;
      if (x.band !== "High" || seen.has(x.companyId) || listed.has(x.companyId) || !c.g.companies.has(x.companyId)) continue;
      seen.add(x.companyId);
      const miss = icpMisses(p.icp!, x.co);
      rows.push({ id: T.pubId(x.companyId), by: "merlin", r: "icp", at: x.at, band: bandOf(x.score), line: miss.join(", "), ...known(x.companyId) } as RadarOutRow);
    }
  }
  return rows;
}

/* ---------- the morning run ---------- */

export interface RadarRun {
  /** False: not due (already ran today), or another run was going. */
  ran: boolean;
  signals: number;
  members: number;
  emails: number;
  slack: number;
}

let flight: Promise<RadarRun> | null = null;
let triedAt = 0;

/**
 * One daily run: claim the UTC day, find the signals since the last run, and send each member
 * theirs. `force` (Send radar now) runs even if today's run is done; a free member still gets at
 * most one radar a day. `now` and `funding` are for tests.
 */
export function runRadar(opts: { now?: string; force?: boolean; origin?: string; funding?: FundingSource } = {}): Promise<RadarRun> {
  flight ??= (async () => {
    try {
      return await run(opts);
    } finally {
      flight = null;
    }
  })();
  return flight;
}

async function run(opts: { now?: string; force?: boolean; origin?: string; funding?: FundingSource }): Promise<RadarRun> {
  const nowIso = new Date(Date.parse(opts.now ?? "") || Date.now()).toISOString();
  const nowMs = Date.parse(nowIso);
  const today = nowIso.slice(0, 10);
  const none: RadarRun = { ran: false, signals: 0, members: 0, emails: 0, slack: 0 };
  const prev = await T.mutate((d, seedD): { at: string | null } | null => {
    const r = radarOf(d);
    if (!opts.force && r.lastRunDay === today) return null;
    const at = r.lastRunAt;
    r.lastRunAt = nowIso;
    r.lastRunDay = today;
    r.stats.runs++;
    // Each company's employee band as it changed, once a day (a crossing of 25 or 50 people, read later).
    recordHeadcount(d, seedD, nowIso);
    return { at };
  });
  if (!prev) return none;
  const sinceMs = Math.max(Date.parse(prev.at ?? "") || nowMs - DAY, nowMs - RADAR_MAX_WINDOW_DAYS * DAY);
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const base = (publicBase() || opts.origin || s0.integrations?.origin || "").replace(/\/+$/, "");
  if (!base) {
    console.error("radar not sent: set RN_PUBLIC_URL so it can link back");
    return { ...none, ran: true };
  }
  const src = opts.funding ?? fundingSource();
  const funding = await src.events({ sinceMs, nowMs, companies: fundingCompanies(seed, s0) }).catch((e) => (console.error("funding source failed", e), []));
  // A company that raised a round is VC-backed, unless a member said otherwise (the only ownership Merlin infers).
  // Not from an SEC filing: a Form D is any private raise (angels, debt, friends and family), not proof of VC.
  const rounds = funding.filter((f) => f.source !== "SEC filing");
  if (rounds.length) await T.mutate((d) => void inferVcBacked(d, rounds, nowIso));
  // The events since the last run, and the ones before it (up to RADAR_CARRY_DAYS) that the day's cap held back:
  // what was sent is left out per member below, so an event goes at most once.
  const all = detectSignals(seed, s0, Math.min(sinceMs, nowMs - RADAR_CARRY_DAYS * DAY), nowMs, funding);
  const fresh = all.filter((x) => x.atMs > sinceMs).length;
  // What is still true today (a window open, a gap still there): only for a member's day with few fresh events.
  const standing = standingSignals(seed, s0, nowMs);
  const out: RadarRun = { ran: true, signals: fresh, members: 0, emails: 0, slack: 0 };
  // Follow-ups due in someone's pipeline are a reason for their email even on a day with no signal.
  const anyFollowUp = Object.values(s0.pipeline ?? {}).some((log) => log?.entries?.some((e) => !!e.due && e.due <= today));
  if (!all.length && !standing.length && !anyFollowUp) {
    console.log("radar: 0 signals since the last run and nothing standing, nothing to send");
    return out;
  }
  let fromEvents = 0;
  let fromStanding = 0;
  const c = ctxOf(seed, s0, nowMs);
  const counts = observedTransitions(seed, s0);
  const mailOn = emailEnabled();
  for (const m of c.idx.all) {
    try {
      if (!signedIn(c, m.id)) continue;
      // Notifications: how often the email comes (daily, twice a week, weekly or off), and Crystal Ball in Slack on or off, apart.
      const prefs = radarPrefs(s0.profiles[m.id]);
      const mem = s0.radar?.members?.[m.id];
      const emailOn = mailOn && EMAIL_RE.test(m.email) && prefs.email !== "off";
      const every = prefs.email === "off" ? "daily" : prefs.email;
      // A twice-a-week or weekly email waits for its day; what moved meanwhile stays unsent, so the next one rolls it up.
      const email = emailOn && radarEmailDue(every, mem?.lastMailAt, nowMs);
      const slack = hasDest(s0, m.id) && prefs.slack;
      if (!email && !slack) continue;
      // Follow-ups due in Your pipeline: the email's alone (never Slack). Those that came due since the last email
      // went out are a reason to send one even with no new company; one already listed doesn't send another.
      const ups = email ? emailFollowUps(c, m) : [];
      const lastMailDay = mem?.lastMailAt?.slice(0, 10) ?? "";
      const upsNew = ups.some((f) => f.due > lastMailDay);
      const p = readyProfile(c, m);
      if (!p && !upsNew) continue;
      const pro = isPro(s0, m.id, nowMs);
      // A free member gets one radar a UTC day, even when an admin sends one again.
      const last = mem?.lastAt;
      if (!pro && last && last.slice(0, 10) === today && Date.parse(last) < nowMs) continue;
      const sent = sentKeys(s0, m.id);
      const mine = p ? signalsFor(all, p, { counts, nowMs }).filter((x) => !sent[x.key] && !(x.of && sent[x.of])) : [];
      // The day (pickDaily): High and Medium events, at most RADAR_DAY_MAX companies (a roll-up email more, RADAR_ROLLUP_MAX),
      // filled with standing states to RADAR_DAY_MIN when fewer fresh events reach them; no company twice inside 30 days unless something new happened.
      const still = p ? signalsFor(standing, p, { counts, nowMs }) : [];
      const picked = pickDaily(mine, still, { sent, shown: mem?.shown, out: mem?.out }, nowMs, RADAR_ROLLUP_MAX[email ? every : "daily"]);
      // Nothing new for them (only companies that are still a good time): no post, and no email unless a follow-up came due.
      // The page still lists the companies today; an email about follow-ups alone lists no company.
      const upsOnly = !picked.fromEvents;
      const out_ = upsOnly ? [] : picked.send;
      // Low stays on the page: the day's companies keep what went out and this run's other events.
      const rows = upsOnly ? [...picked.send, ...mine.filter((x) => x.atMs > sinceMs && !picked.send.includes(x))] : [...out_, ...mine.filter((x) => x.atMs > sinceMs && !out_.includes(x))];
      if (upsOnly) {
        if (rows.length) await T.mutate((d) => keepForView(d, m.id, rows, nowIso));
        if (!upsNew) continue;
      }
      const day: RadarDay | null = upsOnly ? { cards: [], total: 0, companies: 0, day: today, url: radarPath(today), mode: "daily" } : dayOf(out_, cardContext(c, m, today, slack ? await logosFor(c, m, out_) : undefined), "daily", today);
      if (!day) continue;
      // Someone may have turned it off while the run was going.
      const now1 = radarPrefs((await loadState()).profiles[m.id]);
      const via: string[] = [];
      if (email && now1.email !== "off") {
        const unsubscribeUrl = radarUnsubscribeUrl(base, m.id);
        const grant = (path: string) => grantQuery(seed, s0, m.id, path, nowMs);
        const go = (path: string) => `${base}/api/radar/go?m=${encodeURIComponent(T.pubId(m.id))}&s=${radarSig(m.id)}&w=email&${grant(path)}&to=${encodeURIComponent(path)}`;
        const mail = renderRadarEmail({
          name: m.name,
          day: tracked(day, base, m.id, "email", grant),
          unsubscribeUrl,
          settingsUrl: emailLinker(seed, s0, m.id, base, nowMs)(NOTIFICATIONS_PATH),
          openPixel: `${base}/api/radar/open?m=${encodeURIComponent(T.pubId(m.id))}&s=${radarSig(m.id)}`,
          appUrl: base,
          every,
          // Every follow-up due counts for "And N more"; the email lists EMAIL_FOLLOW_UPS, each tracked and signed in.
          followUps: ups.map((f, i) => ({ title: f.title, line: f.line, url: i < EMAIL_FOLLOW_UPS ? go(f.path) : "" })),
          pipelineUrl: go(PIPELINE_PATH),
        });
        if (await sendEmail(m.email, mail.subject, mail.text, mail.html, { unsubscribeUrl })) (via.push("email"), out.emails++);
      }
      if (slack && now1.slack && !upsOnly) {
        await deliver(m.id, { kind: "radar", at: nowIso, day: tracked(day, base, m.id, "slack") });
        via.push("slack");
        out.slack++;
      }
      if (!via.length) continue;
      out.members++;
      fromEvents += picked.fromEvents;
      fromStanding += out_.filter((x) => x.standing).length;
      const where = via.join("+");
      await T.mutate((d) => {
        // An email about follow-ups alone marks no company sent (the free member's one radar a day is still theirs).
        if (upsOnly) (radarOf(d).members[m.id] ??= { sent: {} }).lastMailAt = nowIso;
        else markSent(d, m.id, out_, nowIso, where, rows);
        if (via.includes("email")) radarOf(d).members[m.id].lastMailAt = nowIso;
        const r = radarOf(d);
        r.stats.sent++;
        if (via.includes("email")) r.stats.emails++;
        if (via.includes("slack")) r.stats.slack++;
        T.addSignal(d, m.id, "radar_sent", where, nowIso);
      });
    } catch (e) {
      console.error("radar failed for one member", e);
    }
  }
  console.log(
    `radar: ${fresh} signals since the last run (${all.length} unsent-eligible in ${RADAR_CARRY_DAYS} days), ${standing.length} standing states, sent to ${out.members} members (${out.emails} emails, ${out.slack} Slack; ${fromEvents} companies from events, ${fromStanding} standing)`,
  );
  return out;
}

/** Whether a run is going in this process (Pilot metrics' Automatic jobs). */
export const radarRunning = () => flight !== null;

/**
 * Start the run in the background when its schedule says it is due (lib/schedule.ts: each day
 * from RADAR_HOUR_UTC, 13:00 UTC, by default; not twice in a UTC day). Called by the scheduler
 * and on page loads, so it stays cheap: at most one look every 10 minutes. RN_RADAR=0 turns it off.
 */
export async function maybeRadar(origin?: string, nowMs = Date.now()): Promise<boolean> {
  if (process.env.RN_RADAR === "0" || flight || nowMs - triedAt < 10 * 60_000) return false;
  const s = await loadState();
  if (!isDue(settingOf(s.schedule, "radar"), Date.parse(s.radar?.lastRunAt ?? ""), nowMs)) return false;
  triedAt = nowMs;
  void runRadar({ origin }).catch((e) => console.error("radar failed", e));
  return true;
}

/* ---------- instant, for Pro ---------- */

/**
 * After a scan or a change to a seat: the signals it made go to Pro members with Slack or a
 * webhook in the next alert batch (lib/notify deliver), instead of the next morning. Nothing
 * happens while billing is off (nobody is on Pro). Members without Slack get them in the morning.
 */
export async function radarInstant(nowIso?: string): Promise<number> {
  if (!billingLive()) return 0;
  const now = new Date(Date.parse(nowIso ?? "") || Date.now()).toISOString();
  const nowMs = Date.parse(now);
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const c = ctxOf(seed, s, nowMs);
  const pros = c.idx.all.filter((m) => isPro(s, m.id, nowMs) && hasDest(s, m.id) && radarPrefs(s.profiles[m.id]).slack && signedIn(c, m.id));
  const since = await T.mutate((d) => {
    const r = radarOf(d);
    const prev = Date.parse(r.instantAt ?? "");
    r.instantAt = now;
    return Math.max(Number.isFinite(prev) ? prev : nowMs - 60 * 60_000, nowMs - DAY);
  });
  const base = (publicBase() || s.integrations?.origin || "").replace(/\/+$/, "");
  if (!pros.length || !base) return 0;
  const all: RawSignal[] = detectSignals(seed, s, since, nowMs);
  if (!all.length) return 0;
  const counts = observedTransitions(seed, s);
  let n = 0;
  for (const m of pros) {
    const p = readyProfile(c, m);
    if (!p) continue;
    const sent = sentKeys(s, m.id);
    const outs = s.radar?.members?.[m.id]?.out;
    // A company the member left out ("Why not", lib/radar/out.ts) never posts; one left out "Not now" posts again once something new happens there.
    const mine: Scored[] = signalsFor(all, p, { counts, nowMs }).filter((x) => !sent[x.key] && !(x.of && sent[x.of]) && !(outs && isOut(outs[x.companyId], x.atMs)));
    const out_ = deliverable(mine);
    const day = dayOf(out_, cardContext(c, m, now.slice(0, 10), await logosFor(c, m, out_)), "instant", now.slice(0, 10));
    if (!day) continue;
    await T.mutate((d) => {
      markSent(d, m.id, out_, now, "instant", mine);
      radarOf(d).stats.instant++;
      T.addSignal(d, m.id, "radar_sent", "instant", now);
    });
    await deliver(m.id, { kind: "radar", at: now, day: tracked(day, base, m.id, "slack") });
    n++;
  }
  return n;
}

/** Run radarInstant in the background (the scan and actions call this; it never holds them up). */
export const afterRadarChange = () => {
  if (!billingLive()) return;
  void radarInstant().catch((e) => console.error("radar instant failed", e));
};

/* ---------- the links in the email and Slack ---------- */

async function memberOfPub(m: unknown): Promise<{ id: string } | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return T.memberIndex(seed, s).all.find((x) => T.pubId(x.id) === String(m ?? "")) ?? null;
}

/**
 * The Crystal Ball email's own choice, set for the member a link was signed for (the unsubscribe
 * page and a mail app's one-click unsubscribe): "off" turns the email off, "weekly" sends it once
 * a week instead. Crystal Ball in Slack stays as it was. False when the link isn't valid.
 */
export async function setRadarEmail(m: unknown, sig: unknown, choice: RadarEmail, where = "email"): Promise<boolean> {
  const member = await memberOfPub(m);
  if (!member || !sigOk(member.id, sig)) return false;
  await T.mutate((d) => {
    const p = { ...(d.profiles[member.id] ?? {}) };
    const was = radarPrefs(p);
    // Before Notifications one switch turned both off: the Slack side keeps what it was.
    delete p.radarOff;
    if (!was.slack) p.radarSlackOff = true;
    if (choice === "off" && was.email !== "off") T.addSignal(d, member.id, "radar_off", where, new Date().toISOString());
    p.radarEmail = choice;
    d.profiles[member.id] = p;
  });
  return true;
}

/** The radar email's unsubscribe link: turns the email off (not Slack) for the member it was signed for. False when the link isn't valid. */
export const unsubscribeRadar = (m: unknown, sig: unknown) => setRadarEmail(m, sig, "off");

/** Whether the link is the radar's, signed for that member, and what the email is set to now (the unsubscribe page). Null when it isn't valid. */
export async function radarLinkMember(m: unknown, sig: unknown): Promise<{ email: RadarEmail } | null> {
  const member = await memberOfPub(m);
  if (!member || !sigOk(member.id, sig)) return null;
  return { email: radarPrefs((await loadState()).profiles[member.id]).email };
}

/** The email was opened (its pixel loaded): radar_opened, once a member a day. */
export async function radarOpened(m: unknown, sig: unknown): Promise<boolean> {
  const member = await memberOfPub(m);
  if (!member || !sigOk(member.id, sig)) return false;
  const now = new Date().toISOString();
  await T.mutate((d) => {
    if (d.signals.some((x) => x.memberId === member.id && x.name === "radar_opened" && x.where === "email" && x.at.slice(0, 10) === now.slice(0, 10))) return;
    T.addSignal(d, member.id, "radar_opened", "email", now);
  });
  return true;
}

/** A link in the email or Slack: radar_clicked, then where it goes (a path in the app). Null when the link isn't valid. */
export async function radarClicked(m: unknown, sig: unknown, w: unknown, to: unknown): Promise<string | null> {
  const path = safePath(to);
  if (!path) return null;
  const member = await memberOfPub(m);
  if (member && sigOk(member.id, sig)) {
    const where = w === "slack" ? "slack" : "email";
    await T.mutate((d) => void T.addSignal(d, member.id, "radar_clicked", where, new Date().toISOString()));
  }
  return path;
}
