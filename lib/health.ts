/**
 * Health: the numbers an outside scorecard asks for, for Pilot metrics (AdminStats.health). Counts
 * only: never a name, an email, a company or what anyone wrote. Pure: the state and the time come
 * in, so tests build a made-up state with known counts and check the exact numbers.
 *
 *  - funnel: members who joined (State.members), then of those, who finished onboarding, added a
 *    first fact, made a first unlock and sent a first message or invite. Each step counts members
 *    who also did every step before it.
 *  - cohorts: members by the month they joined, and who came back in week 1, 4 and 8 after joining
 *    (week 1 is days 7 to 13, week 4 days 28 to 34, week 8 days 56 to 62). "Came back" is anything a
 *    member did that the state keeps a time for: a fact, an unlock, a message, an invite, a product
 *    signal from the app (an email opening alone is not one), a locked company opened, or the last
 *    visit. A visit with none of these is not kept, so the numbers are a floor. A cohort counts a
 *    member for a week only once that week is over.
 *  - weeks: facts added per week, the last 12 (Monday to Sunday, UTC): added by members, and scanned
 *    or imported (the weekly scan, website reads, the website finder, seat scans dated in the seed).
 *    Seed records with no date are not in any week. Confirmed: member-added facts on file now that a
 *    second member confirmed.
 *  - credits: credits earned and spent per week, by source and by use.
 *  - invites, plans, and outcomes: every member's pipeline in counts and sums (outcomeStats in
 *    lib/pipeline.ts): deals by how far they got, Won and Won through Merlin, the month's value of
 *    Won, follow-ups due, what Merlin detected the stages from, intros. Never whose.
 *  - insights: "What's working" and "What isn't", plain sentences from the numbers above (insights()).
 */
import type { State } from "./table";
import { planOf } from "./plan";
import { aiUsageTotals, type AiUsageTotals } from "./proposals/aiUsage";
import { outcomeStats, reached as reachedStage, type OutcomeStats, type PipelineLog, type Via } from "./pipeline";

export const WEEKS = 12;
/** A comparison or a rate is said only when each group has at least this many members. */
export const MIN_GROUP = 20;
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
/** Who adds values that are not a member: our records, the weekly scan, website reads, the website finder. */
const SYSTEM_BY = new Set(["seed", "scan", "website", "found"]);

export interface Share {
  back: number;
  of: number;
}
export interface CreditWeek {
  week: string;
  earned: { seats: number; facts: number; invites: number; pro: number; topups: number; starting: number; refunds: number };
  spent: { company: number; person: number; contact: number; other: number; takenBack: number };
}
export interface Insight {
  /** One plain sentence with the numbers in it. */
  text: string;
  /** The numbers behind it and the group sizes. */
  detail: string;
  /** Size of the effect in percentage points, for the ranking. */
  effect: number;
}
export interface HealthStats {
  funnel: { step: string; n: number }[];
  cohorts: { month: string; joined: number; w1: Share; w4: Share; w8: Share }[];
  weeks: { week: string; member: number; imported: number }[];
  confirmed: { facts: number; confirmed: number };
  credits: CreditWeek[];
  invites: { sent: number; joined: number; bonusMembers: number; bonusCredits: number };
  plans: { billing: boolean; trialsEnded: number; trialsPaid: number; paidNow: number };
  /**
   * Deal tracking (outcomeStats in lib/pipeline.ts) as rows for the Outcomes card: a count, a share
   * in percent ("%") or dollars a month ("$"). Null only for a state without the pipeline at all:
   * the panel then reads "Deal tracking not live yet".
   */
  outcomes: OutcomeRow[] | null;
  /** Claude on Merlin's server this UTC month (lib/proposals/aiUsage.ts aiUsageTotals): calls, tokens, estimated cost, packs, members past 50/90/100%. Admin only. */
  ai: AiUsageTotals;
  insights: { working: Insight[]; notWorking: Insight[]; waiting: string[] };
  /**
   * Heavy usage (lib/usageGuard.ts usageStats), today's UTC counts on this server: members who read,
   * members past the heavy line, members a limit stopped and trips by part, with the trial's company
   * opens today and paid plans' email and phone unlocks. Counts only, never who. Left out by healthStats (lib/table.ts adds it).
   */
  usage?: {
    day: string;
    readers: number;
    heavy: number;
    trippedMembers: number;
    trips: Record<"table" | "company" | "people" | "mcp", number>;
    tripsSinceStart: number;
    limits: { perMinute: number; perHour: number; heavyDay: number };
    trialOpens: number;
    trialCapped: number;
  };
}

export interface OutcomeRow {
  label: string;
  n: number;
  unit?: "%" | "$";
}

export interface HealthInput {
  s: State;
  nowMs: number;
  /** Credits every member starts with. */
  starter: number;
  /** Which kind of record an id is (lib/table.ts entityOf). */
  entityOf: (id: string) => "company" | "engagement" | "contact";
  /** A member still on Merlin. */
  isMember: (id: string) => boolean;
  /** Billing is live (lib/plan.ts billingLive). */
  billing: boolean;
  /** Seats the seed's seat scans added, with when and how many facts each carried. */
  seatImports?: { at: string; facts: number }[];
}

/** Monday 00:00 UTC of the week `ms` falls in. */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const refId = (ref: string) => ref.slice(0, Math.max(0, ref.indexOf(".")));
const refField = (ref: string) => ref.slice(ref.indexOf(".") + 1);

/** Every time a member did something the state keeps a time for (see the file's note). */
function activityTimes(s: State): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const add = (id: string, at: string | undefined) => {
    const t = at ? Date.parse(at) : NaN;
    if (!Number.isFinite(t)) return;
    const list = out.get(id);
    if (list) list.push(t);
    else out.set(id, [t]);
  };
  for (const l of s.ledger) if (l.reason === "fill" || l.reason === "unlock") add(l.memberId, l.at);
  for (const c of s.conversations ?? []) for (const m of c.messages) add(m.by, m.at);
  for (const x of s.seatInvites ?? []) add(x.by, x.at);
  // radar_sent and radar_off are written by the server; an email's opening pixel is not a visit.
  for (const x of s.signals) if (x.name !== "radar_sent" && x.name !== "radar_off" && !(x.name === "radar_opened" && x.where === "email")) add(x.memberId, x.at);
  for (const v of s.lockedViews ?? []) add(v.memberId, `${v.day}T12:00:00.000Z`);
  for (const [id, at] of Object.entries(s.seen)) add(id, at);
  return out;
}

/** Whether a member did something in days [from, to) after joining. */
const activeIn = (times: number[] | undefined, joined: number, fromDay: number, toDay: number) =>
  !!times?.some((t) => t >= joined + fromDay * DAY && t < joined + toDay * DAY);

export function healthStats(o: HealthInput): HealthStats {
  const { s, nowMs } = o;
  const joined = s.members.filter((m) => o.isMember(m.id) && Number.isFinite(Date.parse(m.at)));
  const times = activityTimes(s);

  /* ---------- the funnel ---------- */
  const firstFill = new Map<string, number>();
  const firstUnlock = new Map<string, number>();
  for (const l of s.ledger) {
    const t = Date.parse(l.at);
    if (l.reason === "fill" && !l.undone && !firstFill.has(l.memberId)) firstFill.set(l.memberId, t);
    if (l.reason === "unlock" && !firstUnlock.has(l.memberId)) firstUnlock.set(l.memberId, t);
  }
  const reached = new Set<string>();
  for (const c of s.conversations ?? []) for (const m of c.messages) reached.add(m.by);
  for (const x of s.seatInvites ?? []) reached.add(x.by);
  const steps: [string, (id: string) => boolean][] = [
    ["Joined", () => true],
    ["Finished onboarding", (id) => !!s.profiles[id]?.onboarded],
    ["Added a first fact", (id) => firstFill.has(id)],
    ["Made a first unlock", (id) => firstUnlock.has(id)],
    ["Sent a first message or invite", (id) => reached.has(id)],
  ];
  let pool = joined.map((m) => m.id);
  const funnel = steps.map(([step, ok]) => {
    pool = pool.filter(ok);
    return { step, n: pool.length };
  });

  /* ---------- retention by signup month ---------- */
  const byMonth = new Map<string, typeof joined>();
  for (const m of joined) {
    const k = m.at.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), m]);
  }
  const share = (list: typeof joined, week: number): Share => {
    let back = 0;
    let of = 0;
    for (const m of list) {
      const j = Date.parse(m.at);
      if (nowMs < j + (week + 1) * WEEK) continue; // that week isn't over yet
      of++;
      if (activeIn(times.get(m.id), j, week * 7, week * 7 + 7)) back++;
    }
    return { back, of };
  };
  const cohorts = [...byMonth.keys()].sort().map((month) => {
    const list = byMonth.get(month)!;
    return { month, joined: list.length, w1: share(list, 1), w4: share(list, 4), w8: share(list, 8) };
  });

  /* ---------- facts a week ---------- */
  const thisWeek = weekStart(nowMs);
  const first = thisWeek - (WEEKS - 1) * WEEK;
  const weekIdx = (at: string | undefined) => {
    const t = at ? Date.parse(at) : NaN;
    if (!Number.isFinite(t) || t < first || t > nowMs) return -1;
    return Math.floor((weekStart(t) - first) / WEEK);
  };
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({ week: isoDay(first + i * WEEK), member: 0, imported: 0 }));
  const counted = new Set<string>();
  for (const l of s.ledger) {
    if (l.reason !== "fill" || l.undone || l.ref.startsWith("bench.") || !o.isMember(l.memberId)) continue;
    const k = `${l.memberId} ${l.ref}`;
    if (counted.has(k)) continue;
    counted.add(k);
    const i = weekIdx(l.at);
    if (i >= 0) weeks[i].member++;
  }
  for (const v of Object.values(s.values)) {
    if (!SYSTEM_BY.has(v.by) || v.status === "removed" || !v.value) continue;
    const i = weekIdx(v.at);
    if (i >= 0) weeks[i].imported++;
  }
  for (const c of s.companies) {
    if (!SYSTEM_BY.has(c.by)) continue;
    const i = weekIdx(c.at);
    if (i >= 0) weeks[i].imported++;
  }
  for (const e of o.seatImports ?? []) {
    const i = weekIdx(e.at);
    if (i >= 0) weeks[i].imported += e.facts;
  }
  let facts = 0;
  let confirmed = 0;
  for (const [k, v] of Object.entries(s.values)) {
    if (SYSTEM_BY.has(v.by) || v.status !== "live" || !v.value || !o.isMember(v.by)) continue;
    facts++;
    if ((s.verifications[k] ?? []).some((id) => id !== v.by)) confirmed++;
  }

  /* ---------- credits a week ---------- */
  const credits: CreditWeek[] = weeks.map((w) => ({
    week: w.week,
    earned: { seats: 0, facts: 0, invites: 0, pro: 0, topups: 0, starting: 0, refunds: 0 },
    spent: { company: 0, person: 0, contact: 0, other: 0, takenBack: 0 },
  }));
  for (const m of joined) {
    const i = weekIdx(m.at);
    if (i >= 0) credits[i].earned.starting += o.starter;
  }
  for (const l of s.ledger) {
    const i = weekIdx(l.at);
    if (i < 0 || !l.delta) continue;
    const c = credits[i];
    const id = refId(l.ref);
    if (l.reason === "fill" || l.reason === "confirm") {
      if (l.ref.startsWith("bench.") || o.entityOf(id) === "engagement") c.earned.seats += l.delta;
      else c.earned.facts += l.delta;
    } else if (l.reason === "referral") c.earned.invites += l.delta;
    else if (l.reason === "plan") c.earned.pro += l.delta;
    else if (l.reason === "topup") c.earned.topups += l.delta;
    else if (l.reason === "adjust") c.earned.starting += l.delta;
    else if (l.reason === "refund") c.earned.refunds += l.delta;
    else if (l.reason === "reversal") c.spent.takenBack += -l.delta;
    else if (l.reason === "unlock") {
      const field = refField(l.ref);
      const kind = o.entityOf(id);
      const spent = -l.delta;
      if (kind === "company" && field === "identity") c.spent.company += spent;
      else if (kind === "contact" && (field === "name" || field === "title")) c.spent.person += spent;
      else if (kind === "contact") c.spent.contact += spent;
      else c.spent.other += spent;
    }
  }

  /* ---------- invites and plans ---------- */
  const invites = {
    sent: (s.seatInvites ?? []).length,
    joined: s.members.filter((m) => !!m.referredBy).length,
    bonusMembers: s.referralPaid.length,
    bonusCredits: s.ledger.filter((l) => l.reason === "referral").reduce((n, l) => n + l.delta, 0),
  };
  let trialsEnded = 0;
  let trialsPaid = 0;
  let paidNow = 0;
  for (const [id, rec] of Object.entries(s.billing?.members ?? {})) {
    if (!o.isMember(id)) continue;
    if (rec.trialEndsAt && (Date.parse(rec.trialEndsAt) <= nowMs || rec.paidSince)) {
      trialsEnded++;
      if (rec.paidSince) trialsPaid++;
    }
    if (o.billing && planOf(rec, nowMs) === "pro") paidNow++;
  }

  const out: HealthStats = {
    funnel,
    cohorts,
    weeks,
    confirmed: { facts, confirmed },
    credits,
    invites,
    plans: { billing: o.billing, trialsEnded, trialsPaid, paidNow },
    outcomes: [...outcomeRows(outcomeStats(s, nowMs)), ...sendRows(s, nowMs)],
    ai: aiUsageTotals(s, nowMs),
    insights: { working: [], notWorking: [], waiting: [] },
  };
  out.insights = insights(o, out, joined, times, firstFill, firstUnlock);
  return out;
}

/* ---------- outcomes ---------- */

const VIA_ROWS: [Via, string][] = [
  ["note", "a note used or Mark as sent"],
  ["message", "Merlin messages"],
  ["gmail", "Gmail"],
  ["calendar", "the calendar"],
  ["proposal", "a proposal tool"],
  ["seat", "a seat added"],
  ["auto", "time passing"],
  ["you", "the member"],
];
const pctOf = (share: number | null) => (share === null ? null : Math.round(share * 100));

/**
 * Approve and send (lib/send, RN_SEND): notes members sent from their own Gmail, in counts only,
 * never who, to whom or what. No rows until a member has an outbox.
 */
export function sendRows(s: State, nowMs: number): OutcomeRow[] {
  const all = (s as State & { outbox?: Record<string, { grant?: unknown; items?: { status?: string; approvedAt?: string | null; sentAt?: string | null; createdAt?: string }[] }> }).outbox;
  if (!all || !Object.keys(all).length) return [];
  let members = 0, granted = 0, sent7 = 0, sent30 = 0, undone = 0, replied = 0, failed = 0;
  for (const b of Object.values(all)) {
    if (b.grant) granted++;
    let used = false;
    for (const x of b.items ?? []) {
      const age = nowMs - Date.parse(x.sentAt ?? x.approvedAt ?? x.createdAt ?? "");
      if (!(age < 30 * DAY)) continue;
      if (x.status === "sent") {
        used = true;
        sent30++;
        if (age < 7 * DAY) sent7++;
      } else if (x.status === "cancelled" && x.approvedAt) undone++;
      else if (x.status === "replied") replied++;
      else if (x.status === "failed") failed++;
    }
    if (used) members++;
  }
  return [
    { label: "Members who gave Merlin permission to send", n: granted },
    { label: "Members who sent from their Gmail, 30 days", n: members },
    { label: "Notes sent from members' Gmail, 7 days", n: sent7 },
    { label: "Notes sent from members' Gmail, 30 days", n: sent30 },
    { label: "Notes undone or cancelled, 30 days", n: undone },
    { label: "Follow-ups held back on a reply, 30 days", n: replied },
    { label: "Notes Gmail refused, 30 days", n: failed },
  ];
}

/** The Outcomes card's rows from outcomeStats: counts and sums only. A share shows once it has something to divide by. */
export function outcomeRows(o: OutcomeStats): OutcomeRow[] {
  const rows: OutcomeRow[] = [
    { label: "Members with a deal", n: o.members },
    { label: "Deals", n: o.entries },
    { label: "Reached Sent", n: o.reached.sent },
    { label: "Reached Replied", n: o.reached.replied },
    { label: "Reached Meeting", n: o.reached.meeting },
    { label: "Reached Proposal", n: o.reached.proposal },
    { label: "Won", n: o.won },
    { label: "Won through Merlin", n: o.wonThroughMerlin },
    { label: "Won from a signed proposal", n: o.wonFromProposal },
    { label: "Won that became a seat", n: o.wonSeats },
    { label: "Won, a month", n: o.monthlyValue, unit: "$" },
    { label: "Won through Merlin, a month", n: o.monthlyValueThroughMerlin, unit: "$" },
    { label: "Follow-ups due now", n: o.followUpsDue },
  ];
  const shares: [string, number | null][] = [
    ["Sent to Replied", pctOf(o.conversion.sentToReplied)],
    ["Replied to Meeting", pctOf(o.conversion.repliedToMeeting)],
    ["Meeting to Won", pctOf(o.conversion.meetingToWon)],
    ["Sent to Won", pctOf(o.conversion.sentToWon)],
  ];
  for (const [label, n] of shares) if (n !== null) rows.push({ label, n, unit: "%" });
  for (const [via, words] of VIA_ROWS) if (o.detected[via]) rows.push({ label: `Stages seen from ${words}`, n: o.detected[via] });
  rows.push({ label: "Intros asked", n: o.intros.asked + o.intros.made + o.intros.declined }, { label: "Intros made", n: o.intros.made }, { label: "Intros that led to a win", n: o.intros.won });
  // Peers (lib/peers.ts): counts only, never who or which company.
  if (o.leads) rows.push({ label: "Referrals to a peer", n: o.leads.passed }, { label: "Referrals a peer took", n: o.leads.taken }, { label: "Referrals waiting at To reach out", n: o.byStage.reach ?? 0 }, { label: "Referrals that were won", n: o.leads.won });
  if (o.teams) rows.push({ label: "Teams formed", n: o.teams.formed }, { label: "Teams active now", n: o.teams.active });
  if (o.circles) rows.push({ label: "Circles", n: o.circles.n }, { label: "Members in a circle", n: o.circles.members }, { label: "Circle posts", n: o.circles.posts });
  return rows;
}

/* ---------- what's working, what isn't ---------- */

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * Plain sentences from the numbers, each with the numbers behind it and the group sizes. A
 * comparison is said only when both groups have MIN_GROUP members, a rate only when its group has;
 * otherwise it goes in `waiting`. Ranked by the size of the effect, at most 5 of each.
 */
function insights(
  o: HealthInput,
  h: HealthStats,
  joined: State["members"],
  times: Map<string, number[]>,
  firstFill: Map<string, number>,
  firstUnlock: Map<string, number>,
): HealthStats["insights"] {
  const { s, nowMs } = o;
  const working: Insight[] = [];
  const notWorking: Insight[] = [];
  const waiting: string[] = [];

  // Week 4 (days 28 to 34) for members whose week 4 is over.
  const ripe = joined.filter((m) => nowMs >= Date.parse(m.at) + 5 * WEEK);
  const back4 = (id: string, at: string) => activeIn(times.get(id), Date.parse(at), 28, 35);
  const google = new Set(Object.entries(s.network ?? {}).filter(([, n]) => !!n?.google).map(([id]) => id));
  const connector = new Set((s.connector?.grants ?? []).map((g) => g.memberId));
  const pipelines: Record<string, PipelineLog | undefined> = s.pipeline ?? {};
  const slack = new Set(Object.entries(s.integrations?.members ?? {}).filter(([, x]) => !!x?.slack).map(([id]) => id));
  const within = (m: Map<string, number>, id: string, at: string) => {
    const t = m.get(id);
    return t !== undefined && t < Date.parse(at) + WEEK;
  };
  const groups: { label: string; who: string; whoNot: string; inGroup: (m: State["members"][number]) => boolean }[] = [
    { label: "a first fact in week 1", who: "add a fact in their first week", whoNot: "don't", inGroup: (m) => within(firstFill, m.id, m.at) },
    { label: "a first unlock in week 1", who: "unlock something in their first week", whoNot: "don't", inGroup: (m) => within(firstUnlock, m.id, m.at) },
    { label: "onboarding", who: "finish onboarding", whoNot: "don't", inGroup: (m) => !!s.profiles[m.id]?.onboarded },
    { label: "Google", who: "connect Google", whoNot: "don't", inGroup: (m) => google.has(m.id) },
    { label: "the Claude connector", who: "add the Claude connector", whoNot: "don't", inGroup: (m) => connector.has(m.id) },
    { label: "Slack alerts", who: "turn on Slack alerts", whoNot: "don't", inGroup: (m) => slack.has(m.id) },
    { label: "an invite", who: "joined through an invite", whoNot: "didn't", inGroup: (m) => !!m.referredBy },
    { label: "a deal in Your pipeline", who: "have a deal in Your pipeline", whoNot: "don't", inGroup: (m) => !!pipelines[m.id]?.entries?.length },
  ];
  for (const g of groups) {
    const a = ripe.filter(g.inGroup);
    const b = ripe.filter((m) => !g.inGroup(m));
    if (a.length < MIN_GROUP || b.length < MIN_GROUP) {
      waiting.push(`Coming back in week 4, with and without ${g.label}: not enough members yet (${a.length.toLocaleString("en-US")} and ${b.length.toLocaleString("en-US")}, ${MIN_GROUP} needed in each).`);
      continue;
    }
    const ab = a.filter((m) => back4(m.id, m.at)).length;
    const bb = b.filter((m) => back4(m.id, m.at)).length;
    const pa = pct(ab, a.length);
    const pb = pct(bb, b.length);
    const diff = pa - pb;
    if (Math.abs(diff) < 5) continue;
    const times_ = pb > 0 ? pa / pb : 0;
    const how = diff > 0 ? (times_ >= 1.9 && times_ < 2.5 ? "twice as often" : times_ >= 2.5 ? `${Math.round(times_)} times as often` : "more often") : "less often";
    const who = g.who === "joined through an invite" ? "Members who joined through an invite" : `Members who ${g.who}`;
    const x: Insight = {
      text: `${who} come back in week 4 ${how} (${pa}% vs ${pb}%).`,
      detail: `${ab} of ${plural(a.length, "member", "members")} vs ${bb} of ${b.length.toLocaleString("en-US")} who ${g.whoNot}. Members who joined at least 5 weeks ago.`,
      effect: Math.abs(diff),
    };
    (diff > 0 ? working : notWorking).push(x);
  }

  // The funnel: the biggest drop, and steps most members get through.
  let worst: { i: number; rate: number } | null = null;
  for (let i = 1; i < h.funnel.length; i++) {
    const prev = h.funnel[i - 1];
    const cur = h.funnel[i];
    if (prev.n < MIN_GROUP) {
      waiting.push(`${cur.step}: not enough members yet (${prev.n.toLocaleString("en-US")} reached the step before, ${MIN_GROUP} needed).`);
      continue;
    }
    const rate = pct(cur.n, prev.n);
    if (rate >= 70) working.push({ text: `${rate}% of members who ${lower(prev.step)} go on to ${lower(cur.step).replace(/^made /, "make ").replace(/^added /, "add ").replace(/^sent /, "send ").replace(/^finished /, "finish ")}.`, detail: `${cur.n} of ${plural(prev.n, "member", "members")}.`, effect: rate - 70 });
    if (rate < 50 && (!worst || rate < worst.rate)) worst = { i, rate };
  }
  if (worst) {
    const prev = h.funnel[worst.i - 1];
    const cur = h.funnel[worst.i];
    notWorking.push({
      text: `Most members stop after "${prev.step}": ${100 - worst.rate}% never get to "${cur.step}".`,
      detail: `${cur.n} of ${plural(prev.n, "member", "members")} did. Each step counts members who did every step before it.`,
      effect: 50 - worst.rate,
    });
  }

  // Crystal Ball emails, the last 30 days.
  const since = nowMs - 30 * DAY;
  const recent = s.signals.filter((x) => Date.parse(x.at) >= since);
  const sends = recent.filter((x) => x.name === "radar_sent" && x.where.includes("email"));
  const sentTo = new Set(sends.map((x) => x.memberId)).size;
  if (sentTo < MIN_GROUP) waiting.push(`Crystal Ball emails: not enough members yet (${sentTo.toLocaleString("en-US")} got one in the last 30 days, ${MIN_GROUP} needed).`);
  else {
    const opens = recent.filter((x) => x.name === "radar_opened" && x.where === "email").length;
    const clicks = recent.filter((x) => x.name === "radar_clicked" && x.where === "email").length;
    const po = pct(opens, sends.length);
    const pc = pct(clicks, sends.length);
    const x: Insight = { text: `Crystal Ball emails: ${po}% opened, ${pc}% clicked.`, detail: `${opens} opens and ${clicks} clicks of ${plural(sends.length, "email", "emails")} to ${plural(sentTo, "member", "members")}, the last 30 days. Some mail apps hide opens.`, effect: Math.abs(po - 30) };
    if (po >= 40) working.push(x);
    else if (po < 20) notWorking.push(x);
  }

  // Credits running out in the first week.
  const week1 = joined.filter((m) => nowMs >= Date.parse(m.at) + WEEK);
  if (week1.length < MIN_GROUP) waiting.push(`Running out of credits in week 1: not enough members yet (${week1.length.toLocaleString("en-US")}, ${MIN_GROUP} needed).`);
  else {
    const byMember = new Map<string, { t: number; d: number }[]>();
    for (const l of s.ledger) byMember.set(l.memberId, [...(byMember.get(l.memberId) ?? []), { t: Date.parse(l.at), d: l.delta }]);
    const outDays: number[] = [];
    for (const m of week1) {
      const j = Date.parse(m.at);
      let bal = o.starter;
      for (const r of (byMember.get(m.id) ?? []).sort((a, b) => a.t - b.t)) {
        if (r.t >= j + WEEK) break;
        bal += r.d;
        if (bal <= 0) {
          outDays.push(Math.max(1, Math.ceil((r.t - j) / DAY)));
          break;
        }
      }
    }
    const p = pct(outDays.length, week1.length);
    const median = outDays.length ? outDays.sort((a, b) => a - b)[Math.floor((outDays.length - 1) / 2)] : 0;
    const x: Insight = {
      text: `${p}% of members run out of credits in their first week${outDays.length ? `, by day ${median} for half of them` : ""}.`,
      detail: `${outDays.length} of ${plural(week1.length, "member", "members")} who joined at least a week ago. Out means a balance of 0 or less.`,
      effect: Math.abs(p - 15),
    };
    if (p >= 25) notWorking.push(x);
    else if (p <= 5 && h.funnel[3] && h.funnel[3].n >= MIN_GROUP) working.push({ ...x, text: `Few members run out of credits in their first week (${p}%).` });
  }

  // Facts confirmed by a second member.
  const authors = new Set(Object.values(s.values).filter((v) => !SYSTEM_BY.has(v.by) && v.status === "live" && o.isMember(v.by)).map((v) => v.by)).size;
  if (authors < MIN_GROUP) waiting.push(`Facts confirmed by a second member: not enough members yet (${authors.toLocaleString("en-US")} have facts on file, ${MIN_GROUP} needed).`);
  else {
    const p = pct(h.confirmed.confirmed, h.confirmed.facts);
    const x: Insight = { text: `${p}% of the facts members added are confirmed by a second member.`, detail: `${h.confirmed.confirmed} of ${plural(h.confirmed.facts, "fact", "facts")}, from ${plural(authors, "member", "members")}.`, effect: Math.abs(p - 20) };
    if (p >= 30) working.push(x);
    else if (p < 10) notWorking.push(x);
  }

  // Trial to paid.
  if (h.plans.trialsEnded < MIN_GROUP) waiting.push(`Trial to paid: not enough members yet (${h.plans.trialsEnded.toLocaleString("en-US")} trials ended, ${MIN_GROUP} needed).`);
  else {
    const p = pct(h.plans.trialsPaid, h.plans.trialsEnded);
    const x: Insight = { text: `${p}% of trials turn into a paid plan.`, detail: `${h.plans.trialsPaid} of ${plural(h.plans.trialsEnded, "trial", "trials")} that ended.`, effect: Math.abs(p - 7) * 3 };
    if (p >= 10) working.push(x);
    else if (p < 5) notWorking.push(x);
  }

  // Invites to connect.
  const inviters = new Set((s.seatInvites ?? []).map((x) => x.by)).size;
  if (inviters < MIN_GROUP) waiting.push(`Invites: not enough members yet (${inviters.toLocaleString("en-US")} sent one, ${MIN_GROUP} needed).`);
  else {
    const claimed = (s.seatInvites ?? []).filter((x) => !!x.claimedBy).length;
    const p = pct(claimed, h.invites.sent);
    const x: Insight = { text: `${p}% of invites to connect are taken up.`, detail: `${claimed} of ${plural(h.invites.sent, "invite", "invites")} from ${plural(inviters, "member", "members")} ended with the seat claimed.`, effect: Math.abs(p - 12) };
    if (p >= 20) working.push(x);
    else if (p < 5) notWorking.push(x);
  }

  // Your pipeline: replies to what members sent, and wins through Merlin. A rate only when MIN_GROUP
  // members are in its group (members with a deal at Sent, members with a win), counted per member.
  const sentBy: string[] = [];
  const wonBy: string[] = [];
  let sentDeals = 0;
  let repliedDeals = 0;
  for (const [id, log] of Object.entries(pipelines)) {
    if (!o.isMember(id)) continue;
    const entries = log?.entries ?? [];
    const sent = entries.filter((e) => reachedStage(e, "sent"));
    if (sent.length) sentBy.push(id);
    if (entries.some((e) => e.stage === "won")) wonBy.push(id);
    sentDeals += sent.length;
    repliedDeals += sent.filter((e) => reachedStage(e, "replied")).length;
  }
  if (sentBy.length < MIN_GROUP) waiting.push(`Replies to what members sent: not enough members yet (${sentBy.length.toLocaleString("en-US")} have a deal at Sent, ${MIN_GROUP} needed).`);
  else {
    const p = pct(repliedDeals, sentDeals);
    const x: Insight = { text: `${p}% of what members send gets a reply.`, detail: `${repliedDeals} of ${plural(sentDeals, "deal", "deals")} sent, from ${plural(sentBy.length, "member", "members")}. Merlin moves a deal to Replied when it sees the reply.`, effect: Math.abs(p - 20) };
    if (p >= 30) working.push(x);
    else if (p < 10) notWorking.push(x);
  }
  if (wonBy.length < MIN_GROUP) waiting.push(`Wins through Merlin: not enough members yet (${wonBy.length.toLocaleString("en-US")} won a deal, ${MIN_GROUP} needed).`);
  else {
    const won = outcomeStats({ pipeline: Object.fromEntries(wonBy.map((id) => [id, pipelines[id]!])) }, nowMs);
    const p = pct(won.wonThroughMerlin, won.won);
    const x: Insight = { text: `${p}% of the deals members win came through Merlin.`, detail: `${won.wonThroughMerlin} of ${plural(won.won, "won deal", "won deals")}, from ${plural(wonBy.length, "member", "members")}. Through Merlin is the member's own answer when they mark it Won.`, effect: Math.abs(p - 40) };
    if (p >= 50) working.push(x);
    else if (p < 20) notWorking.push(x);
  }

  const top = (l: Insight[]) => l.sort((a, b) => b.effect - a.effect).slice(0, 5);
  return { working: top(working), notWorking: top(notWorking), waiting };
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
