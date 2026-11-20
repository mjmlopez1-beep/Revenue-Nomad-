/**
 * The radar (server only; members read it by FEATURE_NAME, lib/radar/types.ts): every morning,
 * each member gets the signals that match their Ideal Fractional Profile, by Slack (when
 * connected) and email, and the app lists each day's companies. See lib/radar/types.ts for the
 * signals and lib/radar/present.ts for what a card reveals.
 *
 * When it runs: once a UTC day, on the first page load after 13:00 UTC (maybeRadar, called where
 * the weekly scan's maybeScan is), and when an admin presses "Send now" on Pilot metrics (runRadar
 * with force). RN_RADAR=0 turns the daily run off. A run looks back to the last run (at most 7
 * days), and a day with no signal for a member sends that member nothing.
 *
 * Every member gets every signal: a company's name is locked for everyone until they unlock it,
 * so nothing here is held back by plan. Each card names the company only when the member's table
 * does, and every link (the cards' and the button) opens the day's companies in the app
 * (radarPath: /?p=table&sig=<day>), where each locked one unlocks on its row for COMPANY_PRICE.
 * Plans (lib/plan.ts) change delivery only: Pro (and the trial) get signals at once, when a scan or
 * a change to a seat makes one, in the next alert batch with Slack or a webhook (radarInstant);
 * everyone else gets one radar a UTC day. With billing off nobody is on Pro.
 *
 * The day's view (radarView): the companies that went out that UTC day, as kept with the delivery
 * (State.radar.members[id].days, 14 days), so the email's link opens exactly what the email listed.
 * A day nothing went out lists the signals that happened that day.
 *
 * Never twice: each member's sent signals are kept (State.radar.members[id].sent, 120 days). A
 * signal is marked sent only when it went out by email or Slack.
 *
 * Crystal Ball's ranking (lib/radar/match.ts scoreFor, lib/radar/predict.ts): every member's
 * signals are scored and ranked, most likely first. High and Medium go by email and Slack (the
 * email's top EMAIL_CARDS); Low stays on the page only (the day's view keeps it with the delivery).
 * Merlin's own transitions between fractional seats move the research's priors (observedTransitions).
 *
 * Product signals (State.signals): radar_sent (one per delivery, where = email, slack, email+slack
 * or instant), radar_opened (the email's pixel, or the day's view in the app), radar_clicked (a
 * link in the email or Slack, through /api/radar/go), radar_off (Your profile, or the email's
 * unsubscribe link).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { publicBase } from "../links";
import { emailEnabled, sendEmail } from "../email";
import { billingLive, hasPro, type PlanRecord } from "../plan";
import { deliver, functionFor } from "../notify";
import { detectSignals, fundingCompanies, observedTransitions, recordHeadcount, type RawSignal } from "./signals";
import { deliverable, profileOf, signalsFor, icpIsEmpty, type RadarProfile, type Scored } from "./match";
import { networkWarmth } from "../google/types"; // [google network]
import { dayOf, rowsOf, viewLine, type CardContext, type MemberSignal } from "./present";
import { renderRadarEmail } from "./format";
import { fundingSource, type FundingSource } from "./sources/funding";
import {
  RADAR_HOUR_UTC, RADAR_KEEP_DAYS, RADAR_KEEP_VIEW_DAYS, RADAR_MAX_WINDOW_DAYS, RADAR_VIEW_DAYS, SIG_DAY_RE, emptyRadar, radarPath, type RadarDay, type RadarSentRow, type RadarState, type RadarView,
} from "./types";

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
 * redirect). The day's companies (/?p=table&sig=2026-11-19) are one.
 */
export const safePath = (to: unknown): string | null => {
  const v = String(to ?? "");
  return /^\/(\?[A-Za-z0-9_\-.~%=&:+,]*)?$/.test(v) && v.length <= 300 ? v : null;
};

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

/** Absolute, tracked links for one channel: each card's link and the button go through /api/radar/go. */
function tracked(day: RadarDay, base: string, memberId: string, w: "email" | "slack"): RadarDay {
  const q = `m=${encodeURIComponent(T.pubId(memberId))}&s=${radarSig(memberId)}&w=${w}`;
  const go = (path: string) => `${base}/api/radar/go?${q}&to=${encodeURIComponent(path)}`;
  return { ...day, url: go(day.url), cards: day.cards.map((c) => ({ ...c, url: go(c.url) })) };
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

/** A member's cards for one UTC day: every link opens that day's companies. */
function cardContext(c: Ctx, m: Member, day: string): CardContext {
  // Trial and Pro: every card names its company, free. Naming it on the card doesn't make it theirs
  // or charge: the table keeps it locked, and its people and seat holders still need their own unlocks.
  const pro = isPro(c.s, m.id, c.nowMs);
  return {
    // The member's own table, as a member: a company locked for them stays unnamed (an admin's too), unless they are on Pro.
    visible: (companyId) => pro || !T.identityHidden(c.g, c.s, c.idx, c.tracks, m, companyId, true),
    cardId: (key) => cardId(m.id, key),
    coId: (companyId) => coId(m.id, companyId),
    url: radarPath(day),
  };
}

/** A signal as the day's view keeps it. */
const sentRow = (x: MemberSignal): RadarSentRow => ({ k: x.key, c: x.companyId, kind: x.kind, l: viewLine(x), ...(x.band ? { b: x.band } : {}), ...(x.whyNow ? { w: x.whyNow } : {}) });

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
  const today = nowIso.slice(0, 10);
  const days = (mine.days ??= {});
  for (const k of Object.keys(days)) if (!SIG_DAY_RE.test(k) || nowMs - dayStart(k) > RADAR_KEEP_VIEW_DAYS * DAY) delete days[k];
  const kept = (days[today] ??= []);
  for (const x of rows) if (!kept.some((y) => y.k === x.key) && kept.length < DAY_ROWS_MAX) kept.push(sentRow(x));
  mine.lastAt = nowIso;
  mine.lastCount = sigs.length;
  mine.lastVia = via;
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

/**
 * GET /api/table?radar=1[&day=YYYY-MM-DD]: one UTC day's companies for the member, the list the
 * email's and Slack's links open. A day something went out lists exactly what went out (kept with
 * the delivery); any other day of the last RADAR_VIEW_DAYS lists the signals that happened that
 * day and were never sent. Only the member's own signals, and only companies still in the table.
 * No day asked: the latest day with something in it. A day older than what is kept (or not a
 * day): the latest, with `expired`. Null when signed out.
 */
export async function radarView(token: string | null, dayAsked?: string | null, nowIso?: string): Promise<RadarView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) return null;
  const nowMs = Date.parse(nowIso ?? "") || Date.now();
  const today = dayOfMs(nowMs);
  const c = ctxOf(seed, s, nowMs);
  const pro = isPro(s, m.id, nowMs);
  const fn = functionFor(s, m);
  const p = profileOf(seed, s, m.id, fn);
  const ready = !!p.fn && !icpIsEmpty(p.icp);
  const list = Array.from({ length: RADAR_VIEW_DAYS }, (_, i) => dayOfMs(nowMs - i * DAY));
  const asked = typeof dayAsked === "string" && SIG_DAY_RE.test(dayAsked) && Number.isFinite(dayStart(dayAsked)) ? dayAsked : null;
  // A day asked for that is kept (an older email's link) is listed too.
  const inKeep = !!asked && asked <= today && nowMs - dayStart(asked) <= RADAR_KEEP_VIEW_DAYS * DAY;
  const byDay = new Map<string, RadarSentRow[]>();
  if (ready) {
    const kept = s.radar?.members?.[m.id]?.days ?? {};
    const keptKeys = new Set(Object.values(kept).flatMap((rows) => rows.map((x) => x.k)));
    const wanted = inKeep && !list.includes(asked!) ? [...list, asked!] : list;
    // Days nothing went out: the signals that happened that day (and never went out another day).
    const fromMs = Math.min(...wanted.map(dayStart));
    // [google network] the page ranks by who the member knows too (networkWarmth: nothing with RN_GOOGLE off).
    const live = signalsFor(detectSignals(seed, s, fromMs, nowMs), p, { counts: observedTransitions(seed, s), nowMs, warmth: networkWarmth(s, m.id, nowMs) }).filter((x) => !keptKeys.has(x.key));
    for (const d of wanted) {
      const rows = kept[d]?.length ? kept[d] : live.filter((x) => x.at.slice(0, 10) === d).map(sentRow);
      // A company merged away or taken out since is no row.
      byDay.set(d, rows.filter((x) => c.g.companies.has(x.c)));
    }
  }
  const count = (d: string) => new Set((byDay.get(d) ?? []).map((x) => x.c)).size;
  const latest = list.find((d) => count(d) > 0) ?? today;
  const day = inKeep ? asked! : latest;
  return {
    on: !s.profiles[m.id]?.radarOff,
    ready,
    function: p.fn,
    before: p.before,
    beforeFromMember: p.beforeFromMember,
    day,
    today,
    ...(dayAsked != null && dayAsked !== "" && !inKeep ? { expired: true } : {}),
    days: list.map((d) => ({ day: d, companies: count(d) })),
    rows: rowsOf(byDay.get(day) ?? [], T.pubId).map(({ id, c: co, kinds, lines, notes, band }) => ({
      id,
      kinds,
      lines,
      ...(notes.some(Boolean) ? { notes } : {}),
      ...(band ? { band } : {}),
      // Trial and Pro see each company named here, free (the table still keeps it locked and theirs to unlock).
      ...(pro && T.identityHidden(c.g, c.s, c.idx, c.tracks, m, co, true) ? { name: c.g.companies.get(co)?.name ?? undefined } : {}),
    })),
    email: emailEnabled() && EMAIL_RE.test(m.email),
    slack: hasDest(s, m.id),
  };
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
  const all = detectSignals(seed, s0, sinceMs, nowMs, funding);
  const out: RadarRun = { ran: true, signals: all.length, members: 0, emails: 0, slack: 0 };
  if (!all.length) return out;
  const c = ctxOf(seed, s0, nowMs);
  const counts = observedTransitions(seed, s0);
  const mailOn = emailEnabled();
  for (const m of c.idx.all) {
    try {
      if (s0.profiles[m.id]?.radarOff || !signedIn(c, m.id)) continue;
      const email = mailOn && EMAIL_RE.test(m.email);
      const slack = hasDest(s0, m.id);
      if (!email && !slack) continue;
      const p = readyProfile(c, m);
      if (!p) continue;
      const pro = isPro(s0, m.id, nowMs);
      // A free member gets one radar a UTC day, even when an admin sends one again.
      const last = s0.radar?.members?.[m.id]?.lastAt;
      if (!pro && last && last.slice(0, 10) === today && Date.parse(last) < nowMs) continue;
      const sent = sentKeys(s0, m.id);
      const mine = signalsFor(all, p, { counts, nowMs }).filter((x) => !sent[x.key] && !(x.of && sent[x.of]));
      // High and Medium go out; Low stays on the page (kept with the day's companies below).
      const out_ = deliverable(mine);
      const day = dayOf(out_, cardContext(c, m, today), "daily", today);
      if (!day) continue;
      // Someone may have turned it off while the run was going.
      const s1 = await loadState();
      if (s1.profiles[m.id]?.radarOff) continue;
      const via: string[] = [];
      if (email) {
        const unsubscribeUrl = radarUnsubscribeUrl(base, m.id);
        const mail = renderRadarEmail({
          name: m.name,
          day: tracked(day, base, m.id, "email"),
          unsubscribeUrl,
          openPixel: `${base}/api/radar/open?m=${encodeURIComponent(T.pubId(m.id))}&s=${radarSig(m.id)}`,
          appUrl: base,
        });
        if (await sendEmail(m.email, mail.subject, mail.text, mail.html, { unsubscribeUrl })) (via.push("email"), out.emails++);
      }
      if (slack) {
        await deliver(m.id, { kind: "radar", at: nowIso, day: tracked(day, base, m.id, "slack") });
        via.push("slack");
        out.slack++;
      }
      if (!via.length) continue;
      out.members++;
      const where = via.join("+");
      await T.mutate((d) => {
        markSent(d, m.id, out_, nowIso, where, mine);
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
  if (out.members) console.log(`radar: ${all.length} signals, sent to ${out.members} members (${out.emails} emails, ${out.slack} Slack)`);
  return out;
}

/**
 * Start the daily run in the background when it is due: after 13:00 UTC and not yet today.
 * Called on page loads, so it stays cheap: at most one look every 10 minutes. RN_RADAR=0 turns it off.
 */
export async function maybeRadar(origin?: string): Promise<void> {
  if (process.env.RN_RADAR === "0" || flight || Date.now() - triedAt < 10 * 60_000) return;
  const now = new Date();
  if (now.getUTCHours() < RADAR_HOUR_UTC) return;
  triedAt = Date.now();
  const s = await loadState();
  if (s.radar?.lastRunDay === now.toISOString().slice(0, 10)) return;
  void runRadar({ origin }).catch((e) => console.error("radar failed", e));
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
  const pros = c.idx.all.filter((m) => isPro(s, m.id, nowMs) && hasDest(s, m.id) && !s.profiles[m.id]?.radarOff && signedIn(c, m.id));
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
    const mine: Scored[] = signalsFor(all, p, { counts, nowMs }).filter((x) => !sent[x.key] && !(x.of && sent[x.of]));
    const out_ = deliverable(mine);
    const day = dayOf(out_, cardContext(c, m, now.slice(0, 10)), "instant", now.slice(0, 10));
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

/** The radar email's unsubscribe link: turns the radar off for the member it was signed for. False when the link isn't valid. */
export async function unsubscribeRadar(m: unknown, sig: unknown): Promise<boolean> {
  const member = await memberOfPub(m);
  if (!member || !sigOk(member.id, sig)) return false;
  await T.mutate((d) => {
    const p = { ...(d.profiles[member.id] ?? {}) };
    if (!p.radarOff) T.addSignal(d, member.id, "radar_off", "email", new Date().toISOString());
    p.radarOff = true;
    d.profiles[member.id] = p;
  });
  return true;
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
