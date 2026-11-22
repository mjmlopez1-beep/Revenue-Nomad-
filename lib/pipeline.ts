/**
 * Your pipeline: each member's own deals, one entry per company they reached out to, moved by
 * Merlin itself. The member never moves a stage by hand: Merlin sees what happened and moves it.
 *
 *   Sent      the member used a drafted note (Open in Gmail, Copy, Mark as sent), a message,
 *             intro or invite went out on Merlin, or their connected Gmail shows a new email out
 *             to a company in their Crystal Ball (headers only: who, to whom, when).
 *   Replied   an email in from that company after Sent (Gmail headers), or a reply on Merlin.
 *   Meeting   a calendar event with someone from that company after Sent (attendees and time
 *             only, never a title), or one booked ahead.
 *   Proposal  a proposal sent, and Won or Lost from it signed or declined (pipelineEvent: the
 *             proposal builder plugs in there).
 *   Won       also when the member adds or claims their own seat at that company after Sent.
 *   Went quiet  no reply after QUIET_AFTER_FOLLOW_UPS follow-ups, or QUIET_DAYS of silence.
 *   Lost, Not now  the only things the member says, one tap, when they want to.
 *
 * Each entry keeps who it went to, the channel, the date of each stage and what it was detected
 * from, the next follow-up, private notes and a log. The member can correct a detection in one tap
 * ("Not a reply"): the signal it came from is set aside, and the entry goes back a stage.
 *
 * What it reads of Google is what Your network already keeps (lib/google/compute.ts): per
 * company, the time of the latest email out and in (From, To and Date headers), and the days of
 * the last and next meeting with someone there. Never a subject, a message's text, a meeting
 * title or an attendee list. Without Gmail, Sent comes from Merlin's own actions and Replied from
 * replies on Merlin; Meeting comes from the calendar.
 *
 * Intros: when a member asks someone for an introduction (a move's "Ask for an intro", Your
 * network, or a conversation with another member) it is recorded with the member who asked. When
 * the one asked is a member, they see it too and either side can mark it made or declined. An intro
 * that leads to Won is credited on the Won record.
 *
 * Private: State.pipeline[memberId] is that member's alone. Never in another member's view, the
 * shared table, the export or anyone else's connector. A person from the member's own Google
 * account may be named on the member's own screens (as their moves name them) and nowhere else:
 * the connector and whoWords(..., "merlin") leave those names out. Admins see counts and sums only
 * (outcomeStats), never a name, a company or a note. When the member's Google data is deleted
 * (lib/google), forgetGoogle takes out what came from it: Google-only entries, and the names,
 * titles and Gmail and calendar details on the rest.
 *
 * The morning email reads dueFollowUps and followUpWords. Pure: no I/O and relative imports only
 * (the server and the app both load it). Ids are made by the caller.
 */

/* ---------- stages and channels ---------- */

export const STAGES = ["sent", "replied", "meeting", "proposal", "won", "lost", "notnow", "quiet"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_WORDS: Record<Stage, string> = { sent: "Sent", replied: "Replied", meeting: "Meeting", proposal: "Proposal", won: "Won", lost: "Lost", notnow: "Not now", quiet: "Went quiet" };
/** The stages a deal moves through in order, to Won. */
export const LINE: readonly Stage[] = ["sent", "replied", "meeting", "proposal", "won"];
/** Still in play: these have a next step and a follow-up date. */
export const OPEN_STAGES: readonly Stage[] = ["sent", "replied", "meeting", "proposal"];
/** What the member may say themselves (one tap). */
export const MANUAL_STAGES = ["lost", "notnow"] as const;
export type ManualStage = (typeof MANUAL_STAGES)[number];
export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);
export const isOpen = (s: Stage) => OPEN_STAGES.includes(s);

export const CHANNELS = ["email", "linkedin", "merlin", "intro"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_WORDS: Record<Channel, string> = { email: "Email", linkedin: "LinkedIn", merlin: "Message on Merlin", intro: "Intro" };
/** "by email", "on LinkedIn", "on Merlin", "through an intro". */
export const CHANNEL_HOW: Record<Channel, string> = { email: "by email", linkedin: "on LinkedIn", merlin: "on Merlin", intro: "through an intro" };
export const isChannel = (v: unknown): v is Channel => typeof v === "string" && (CHANNELS as readonly string[]).includes(v);

/**
 * What a stage was detected from. note: the member used a drafted note. message: a message, intro
 * or invite went out on Merlin, or a reply came in there. gmail, calendar: the member's connected
 * Google account (headers and attendees only). proposal: the proposal builder. auto: silence aged
 * it out. you: the member said so.
 */
export type Via = "note" | "message" | "gmail" | "calendar" | "proposal" | "seat" | "auto" | "you";
export const VIA_WORDS: Record<Via, string> = {
  note: "From your note",
  message: "From Merlin messages",
  gmail: "Detected from your Gmail",
  calendar: "From your calendar",
  proposal: "From your proposal",
  seat: "From your seats",
  auto: "No reply since",
  you: "You marked it",
};

/**
 * Where an entry started. A move, a Crystal Ball company and an intro count as through Merlin by
 * default (the Won prompt's "Did this come through Merlin?" starts checked); the member says.
 */
export type Source = "move" | "crystal" | "intro" | "network" | "record" | "gmail" | "message" | "proposal" | "peer";
/** peer: a lead a peer passed (lib/peers.ts), or a company the member teamed up on. */
export const MERLIN_SOURCES: readonly Source[] = ["move", "crystal", "intro", "peer"];

/** Business days to a follow-up, the snooze, and when silence ages an entry out. */
export const FOLLOW_UP_BUSINESS_DAYS = 3;
export const SNOOZE_FOLLOW_UP_DAYS = 3;
export const QUIET_AFTER_FOLLOW_UPS = 2;
export const QUIET_DAYS = 30;
/** A new email out to a Crystal Ball company opens an entry when the first email with them is this recent. */
export const GMAIL_NEW_DAYS = 14;
/** The same note used twice inside this long is one send (Copy, then Open in Gmail). */
const SAME_SEND_MS = 30 * 60_000;
/** An email out this long after the last send counts as a follow-up. */
const FOLLOW_GAP_MS = 12 * 3_600_000;
/** What one member's pipeline keeps at most. */
export const PIPELINE_LIMITS = { entries: 500, notes: 50, noteChars: 1000, log: 100, intros: 300 } as const;
/** A closed entry (Lost, Not now, Went quiet) keeps its company out of today's moves this long after it closed. */
export const CLOSED_QUIET_DAYS = 30;

/* ---------- what is stored (State.pipeline[memberId]) ---------- */

/**
 * Who it went to. `role` is a title ("CEO"), `name` the name the member saw when they wrote (their
 * own network, a seat holder they can see, a member). `google`: the person came from the member's
 * Google account, so their name never leaves the member's own screens. `seatId` (internal) when a
 * seat on file is who it went to, `memberId` when a member is.
 */
export interface PipelineTo {
  role?: string | null;
  name?: string | null;
  google?: boolean;
  seatId?: string;
  memberId?: string;
}

export interface PipelineNote {
  at: string;
  text: string;
}

/** A Won deal's terms, as the member gave them (optional, for Add it as your seat). `rate` is dollars an hour or a month. */
export interface WonTerms {
  pricing: "hourly" | "monthly";
  rate: number;
  hours: number | null;
  /** YYYY-MM. */
  start: string | null;
  /** Expected length in months. */
  months: number | null;
  /** "Did this come through Merlin?" */
  merlin: boolean;
  at: string;
}

/** The signals already used (or set aside by a correction): only newer ones move the entry again. ISO times, or days for meetings. */
export interface SeenSignals {
  out?: string;
  in?: string;
  met?: string;
  next?: string;
  msg?: string;
  /** The member's own seats at the company when Merlin first looked (a new one after that is a win). */
  seats?: string[];
}

export interface PipelineEntry {
  id: string;
  /** Internal company id. */
  companyId: string;
  stage: Stage;
  channel: Channel;
  to: PipelineTo;
  source: Source;
  /** Stage -> when it was reached (ISO), and what it was detected from. */
  dates: Partial<Record<Stage, string>>;
  via: Partial<Record<Stage, Via>>;
  /** YYYY-MM-DD of the next follow-up (open stages only), or null. */
  due: string | null;
  /** Follow-ups sent. */
  follow: number;
  /** When the last note or follow-up went out (ISO). */
  lastOut: string;
  seen: SeenSignals;
  /** The member's conversation on Merlin this went out in (replies there count). */
  conversationId?: string;
  notes: PipelineNote[];
  log: PipelineNote[];
  won?: WonTerms;
  /** The member's seat it became (internal id): the seat is confirmed by this win. */
  seatId?: string;
  /** The intro (IntroRecord.id) this deal came through. */
  introId?: string;
  /** A lead a peer passed (lib/peers.ts LeadPass): its id and the member who passed it. A win here is counted for them too. */
  lead?: { passId: string; by: string };
  /** The member went with a route in (lib/paths/plan.ts, Your way in): when. The plan itself is State.routes. */
  route?: { at: string };
  createdAt: string;
  updatedAt: string;
}

export type IntroStatus = "asked" | "made" | "declined";
/**
 * An intro the member asked for. `introducer.memberId`: a member (they see it and can mark it too);
 * otherwise someone from the member's own network, kept here only. `companyId`: the company they
 * asked to be introduced to, when there is one (an ask to an investor may name none).
 */
export interface IntroRecord {
  id: string;
  companyId: string | null;
  introducer: { memberId?: string; name?: string | null; role?: string | null; google?: boolean };
  status: IntroStatus;
  askedAt: string;
  madeAt?: string;
  declinedAt?: string;
  /** Who marked it last: the member who asked, or the introducer. */
  markedBy?: "asker" | "introducer";
  conversationId?: string;
  /** The pipeline entry it opened or joined. */
  entryId?: string;
}

export interface PipelineLog {
  entries: PipelineEntry[];
  intros: IntroRecord[];
}

export const emptyPipeline = (): PipelineLog => ({ entries: [], intros: [] });

/* ---------- days ---------- */

const DAY = 86_400_000;
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
/** The UTC day `n` business days (Monday to Friday) after the day of `fromMs`. */
export function addBusinessDays(fromMs: number, n: number): string {
  let t = dayMs(dayOf(fromMs));
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    t += DAY;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return dayOf(t);
}
export const addDays = (day: string, n: number) => dayOf(dayMs(day) + n * DAY);
/** Whole days from one day to another (UTC). */
export const daysBetween = (fromIso: string, toMs: number) => Math.max(0, Math.round((dayMs(dayOf(toMs)) - dayMs(String(fromIso).slice(0, 10))) / DAY));
export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) && Number.isFinite(dayMs(v));

/* ---------- changing an entry (in place) ---------- */

const flat = (v: unknown, max = 120) => String(v ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** Text the member typed, kept as typed (line breaks too), within the limit. */
export function cleanNote(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, PIPELINE_LIMITS.noteChars);
}
export function cleanTo(raw: unknown): PipelineTo {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const to: PipelineTo = {};
  const role = flat(x.role, 80);
  const name = flat(x.name, 80);
  if (role) to.role = role;
  if (name) to.name = name;
  if (x.google === true) to.google = true;
  return to;
}

const iso = (ms: number) => new Date(ms).toISOString();
function logLine(e: PipelineEntry, text: string, nowMs: number) {
  e.log.push({ at: iso(nowMs), text });
  if (e.log.length > PIPELINE_LIMITS.log) e.log.splice(0, e.log.length - PIPELINE_LIMITS.log);
  e.updatedAt = iso(nowMs);
}

/** The next follow-up after a change at `atMs`: FOLLOW_UP_BUSINESS_DAYS business days on, while the deal is open. */
const nextDue = (stage: Stage, atMs: number) => (isOpen(stage) ? addBusinessDays(atMs, FOLLOW_UP_BUSINESS_DAYS) : null);

/** The open entry at a company, or the latest one. */
export function entryAt(log: PipelineLog | undefined, companyId: string): PipelineEntry | null {
  const all = (log?.entries ?? []).filter((e) => e.companyId === companyId);
  return all.find((e) => isOpen(e.stage)) ?? [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

/**
 * Something went out to a company: a new entry at Sent with a follow-up in 3 business days. A
 * company with an open entry keeps it: a note sent again counts as a follow-up (the same note used
 * twice in half an hour is one send). An entry that went quiet comes back to Sent.
 */
export function openEntry(
  log: PipelineLog,
  o: { id: string; companyId: string; channel: Channel; to?: PipelineTo; source: Source; via: Via; nowMs: number; atMs?: number; introId?: string; conversationId?: string; lead?: { passId: string; by: string } },
): { entry: PipelineEntry; created: boolean } {
  const atMs = o.atMs ?? o.nowMs;
  const at = iso(atMs);
  const had = log.entries.find((e) => e.companyId === o.companyId && (isOpen(e.stage) || e.stage === "quiet"));
  if (had) {
    // A message on Merlin opened it a moment ago, and it was a move's note: it came from the move.
    if (MERLIN_SOURCES.includes(o.source) && !MERLIN_SOURCES.includes(had.source)) had.source = o.source;
    if (o.introId && !had.introId) had.introId = o.introId;
    if (o.lead && !had.lead) had.lead = o.lead;
    if (o.conversationId && !had.conversationId) had.conversationId = o.conversationId;
    if (o.to?.memberId && !had.to.memberId) had.to = { ...had.to, ...o.to };
    // A route the member went with and hasn't acted on yet (routeEntry): this is its first send, not a follow-up.
    if (had.route && had.stage === "sent" && !had.dates.sent) {
      had.dates.sent = at;
      had.via.sent = o.via;
      had.channel = o.channel;
      if (o.to && !had.to.name && !had.to.memberId) had.to = { ...had.to, ...o.to };
      had.lastOut = at;
      had.due = nextDue("sent", atMs);
      logLine(had, `Sent ${CHANNEL_HOW[o.channel]}`, o.nowMs);
      return { entry: had, created: false };
    }
    if (atMs - Date.parse(had.lastOut) < SAME_SEND_MS) return { entry: had, created: false };
    if (had.stage === "quiet") {
      moveTo(had, "sent", o.via, atMs, o.nowMs);
      had.lastOut = at;
      return { entry: had, created: false };
    }
    followedUp(had, o.via, atMs, o.nowMs);
    return { entry: had, created: false };
  }
  const entry: PipelineEntry = {
    id: o.id,
    companyId: o.companyId,
    stage: "sent",
    channel: o.channel,
    to: o.to ?? {},
    source: o.source,
    dates: { sent: at },
    via: { sent: o.via },
    due: nextDue("sent", atMs),
    follow: 0,
    lastOut: at,
    seen: {},
    notes: [],
    log: [],
    ...(o.introId ? { introId: o.introId } : {}),
    ...(o.conversationId ? { conversationId: o.conversationId } : {}),
    ...(o.lead ? { lead: o.lead } : {}),
    createdAt: iso(o.nowMs),
    updatedAt: iso(o.nowMs),
  };
  logLine(entry, `Sent ${CHANNEL_HOW[o.channel]}`, o.nowMs);
  log.entries.push(entry);
  // The oldest closed entries make room past the limit.
  if (log.entries.length > PIPELINE_LIMITS.entries) {
    const closed = log.entries.filter((e) => !isOpen(e.stage) && e.stage !== "won").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    for (const c of closed.slice(0, log.entries.length - PIPELINE_LIMITS.entries)) log.entries.splice(log.entries.indexOf(c), 1);
  }
  return { entry, created: true };
}

/**
 * Go with a route (Your way in, lib/paths/plan.ts): the company's open deal takes the route, or a
 * new deal waits at Sent with nothing sent yet (no send date, no follow-up due) until the member's
 * first step goes out, which openEntry then counts as its first send. Nothing is sent here.
 */
export function routeEntry(log: PipelineLog, o: { id: string; companyId: string; channel: Channel; source: Source; nowMs: number }): { entry: PipelineEntry; created: boolean } {
  const had = log.entries.find((e) => e.companyId === o.companyId && (isOpen(e.stage) || e.stage === "quiet"));
  if (had) {
    if (!had.route) logLine(had, "Chose a route in", o.nowMs);
    had.route = { at: iso(o.nowMs) };
    had.updatedAt = iso(o.nowMs);
    return { entry: had, created: false };
  }
  const entry: PipelineEntry = {
    id: o.id,
    companyId: o.companyId,
    stage: "sent",
    channel: o.channel,
    to: {},
    source: o.source,
    dates: {},
    via: {},
    due: null,
    follow: 0,
    lastOut: iso(o.nowMs),
    seen: {},
    notes: [],
    log: [],
    route: { at: iso(o.nowMs) },
    createdAt: iso(o.nowMs),
    updatedAt: iso(o.nowMs),
  };
  logLine(entry, "Chose a route in", o.nowMs);
  log.entries.push(entry);
  return { entry, created: true };
}

const LOG_WORDS: Record<Stage, string> = {
  sent: "Back to Sent",
  replied: "They replied",
  meeting: "Meeting",
  proposal: "Proposal sent",
  won: "Won",
  lost: "Marked lost",
  notnow: "Marked not now",
  quiet: "Went quiet",
};
/** Move an entry to a stage, with what it was detected from. The next follow-up is set from when it happened. */
function moveTo(e: PipelineEntry, stage: Stage, via: Via, atMs: number, nowMs: number) {
  const back = LINE.indexOf(stage) >= 0 && LINE.indexOf(e.stage) > LINE.indexOf(stage);
  e.stage = stage;
  if (!e.dates[stage] || back) e.dates[stage] = iso(atMs);
  e.via[stage] = via;
  e.due = nextDue(stage, Math.max(atMs, nowMs - 365 * DAY));
  if (stage !== "won") delete e.won;
  logLine(e, `${LOG_WORDS[stage]}${via === "you" || via === "auto" ? "" : ` (${VIA_WORDS[via].replace(/^(From|Detected from) /, "").replace(/^your /, "your ")})`}`, nowMs);
}

/** A follow-up went out: counted, logged, and the next one is due 3 business days on. */
export function followedUp(e: PipelineEntry, via: Via, atMs: number, nowMs: number) {
  e.follow++;
  e.lastOut = iso(atMs);
  e.due = nextDue(e.stage, atMs);
  logLine(e, `Followed up${via === "gmail" ? " (your Gmail)" : ""}`, nowMs);
}

/** Snooze the follow-up: `days` calendar days on from the later of today and its due day. */
export function snoozeFollowUp(e: PipelineEntry, days: number, nowMs: number) {
  const today = dayOf(nowMs);
  const from = e.due && e.due > today ? e.due : today;
  e.due = addDays(from, Math.max(1, Math.min(60, Math.floor(days))));
  logLine(e, `Follow-up moved to ${shortDay(e.due)}`, nowMs);
}

export function addNote(e: PipelineEntry, text: string, nowMs: number): boolean {
  const t = cleanNote(text);
  if (!t) return false;
  e.notes.push({ at: iso(nowMs), text: t });
  if (e.notes.length > PIPELINE_LIMITS.notes) e.notes.splice(0, e.notes.length - PIPELINE_LIMITS.notes);
  e.updatedAt = iso(nowMs);
  return true;
}

/** Lost or Not now: the member's one tap. */
export function closeEntry(e: PipelineEntry, stage: ManualStage, nowMs: number) {
  if (e.stage === stage) return;
  moveTo(e, stage, "you", nowMs, nowMs);
}

/** The stage an entry was at before its current one: the furthest on the way to Won that it reached, short of `below`. */
function stageBefore(e: PipelineEntry, below: Stage | null): Stage {
  const cap = below ? LINE.indexOf(below) : LINE.length;
  for (let i = (cap < 0 ? LINE.length : cap) - 1; i >= 0; i--) if (e.dates[LINE[i]] && LINE[i] !== "won") return LINE[i];
  return "sent";
}

/** Undo the member's Lost, Not now, or a Went quiet: back to where it was. */
export function reopenEntry(e: PipelineEntry, nowMs: number): boolean {
  if (isOpen(e.stage) || e.stage === "won") return false;
  const back = stageBefore(e, null);
  const was = e.stage;
  delete e.dates[was];
  delete e.via[was];
  e.stage = back;
  e.due = nextDue(back, nowMs);
  // Silence counts from now.
  e.lastOut = iso(nowMs);
  logLine(e, `Back to ${STAGE_WORDS[back]}`, nowMs);
  return true;
}

/**
 * A detection was wrong ("Not a reply", "Not a meeting"): the signal behind it is set aside (only a
 * newer one counts), and the entry goes back to the stage before. Only a detected stage, never Sent.
 */
export function correctEntry(e: PipelineEntry, sig: CompanySignals | undefined, nowMs: number): boolean {
  if (e.stage !== "replied" && e.stage !== "meeting") return false;
  const was = e.stage;
  if (was === "replied") {
    if (sig?.inAt) e.seen.in = maxIso(e.seen.in, sig.inAt);
    if (sig?.msgAt) e.seen.msg = maxIso(e.seen.msg, sig.msgAt);
  } else {
    if (sig?.metDay) e.seen.met = maxIso(e.seen.met, sig.metDay);
    if (sig?.nextDay) e.seen.next = maxIso(e.seen.next, sig.nextDay);
  }
  delete e.dates[was];
  delete e.via[was];
  e.stage = stageBefore(e, was);
  e.due = nextDue(e.stage, nowMs);
  logLine(e, was === "replied" ? "You said that wasn't a reply" : "You said that wasn't a meeting about this", nowMs);
  return true;
}
const maxIso = (a: string | undefined, b: string) => (!a || b > a ? b : a);

/** Won terms, given after a win was detected (the Add it as your seat prompt). */
export function setWonTerms(e: PipelineEntry, terms: Omit<WonTerms, "at">, nowMs: number) {
  e.won = { ...terms, at: iso(nowMs) };
  logLine(e, `Terms: ${rateWords(e.won)}`, nowMs);
}

/** A Won entry's terms from what the member sent, or a problem in words. */
export function cleanWon(raw: unknown, nowMs: number): { terms?: Omit<WonTerms, "at">; error?: string } {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pricing = x.pricing === "hourly" ? "hourly" : x.pricing === "monthly" ? "monthly" : null;
  if (!pricing) return { error: "Pick hourly or monthly." };
  const rate = Number(String(x.rate ?? "").replace(/[$,\s]/g, "").replace(/k$/i, "000"));
  if (!Number.isFinite(rate) || rate <= 0) return { error: pricing === "hourly" ? "Add the rate an hour, like 175." : "Add the rate a month, like 9000." };
  if (pricing === "hourly" ? rate > 5000 : rate > 500_000) return { error: "That rate looks too high. Check it and try again." };
  const hoursRaw = x.hours === undefined || x.hours === null || x.hours === "" ? null : Number(x.hours);
  if (hoursRaw !== null && (!Number.isFinite(hoursRaw) || hoursRaw <= 0 || hoursRaw > 80)) return { error: "Hours a week is a number from 1 to 80." };
  if (pricing === "hourly" && hoursRaw === null) return { error: "Add the hours a week, so the month's value adds up." };
  const start = x.start === undefined || x.start === null || x.start === "" ? null : String(x.start);
  if (start !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(start)) return { error: "Pick the start month." };
  if (start !== null && (Number(start.slice(0, 4)) < 2000 || start > dayOf(nowMs + 3 * 366 * DAY).slice(0, 7))) return { error: "Pick a start month within the next three years." };
  const monthsRaw = x.months === undefined || x.months === null || x.months === "" ? null : Number(x.months);
  if (monthsRaw !== null && (!Number.isFinite(monthsRaw) || monthsRaw <= 0 || monthsRaw > 60)) return { error: "Expected length is a number of months, from 1 to 60." };
  return { terms: { pricing, rate: Math.round(rate), hours: hoursRaw === null ? null : Math.round(hoursRaw * 10) / 10, start, months: monthsRaw === null ? null : Math.round(monthsRaw), merlin: x.merlin === true } };
}

/** A month's worth of a Won deal: the monthly rate, or the hourly rate times the hours a week, 52 weeks over 12 months. */
export function monthlyValue(w: Pick<WonTerms, "pricing" | "rate" | "hours"> | undefined | null): number {
  if (!w) return 0;
  if (w.pricing === "monthly") return Math.round(w.rate);
  return Math.round((w.rate * (w.hours ?? 0) * 52) / 12);
}
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** "$175/hr, 15 hrs a week" or "$9,000/mo". */
export const rateWords = (w: Pick<WonTerms, "pricing" | "rate" | "hours">) =>
  w.pricing === "hourly" ? `${money(w.rate)}/hr${w.hours ? `, ${w.hours} hrs a week` : ""}` : `${money(w.rate)}/mo`;
/** "$9,750 a month". */
export const monthWords = (n: number) => `${money(n)} a month`;

/** Through Merlin by default: the Won prompt's checkbox starts this way. */
export const merlinByDefault = (e: Pick<PipelineEntry, "source" | "introId" | "lead">) => MERLIN_SOURCES.includes(e.source) || !!e.introId || !!e.lead;

/**
 * "Add it as your seat": the add-seat form's answers from a Won entry, in the form's own words
 * (lib/tableFields.ts engagement fields). A start month still to come is left for the member: the
 * form takes months that have begun.
 */
export function wonSeatFields(w: Pick<WonTerms, "pricing" | "rate" | "hours" | "start">, fn: string | null, nowMs: number): Record<string, string> {
  const out: Record<string, string> = { type: "Fractional", status: "Active", end: "Ongoing" };
  if (fn && fn !== "Other") out.function = fn;
  if (w.start && w.start <= dayOf(nowMs).slice(0, 7)) out.start = w.start;
  out.pricing = w.pricing === "hourly" ? "Hourly" : "Monthly retainer";
  out.rate = w.pricing === "hourly" ? `$${w.rate}/hr` : w.rate >= 1000 && w.rate % 100 === 0 ? `$${w.rate / 1000}k/mo` : `$${w.rate}/mo`;
  if (w.hours) out.hours = String(w.hours);
  return out;
}

/* ---------- what Merlin sees, and moving entries by it ---------- */

/**
 * What Merlin can see about one company for one member, from what Your network keeps and from
 * Merlin's own messages. Times are ISO; meeting days YYYY-MM-DD. Never a subject, text or title.
 */
export interface CompanySignals {
  /** The latest email out to someone there, and in from someone there (Gmail headers). */
  outAt?: string;
  inAt?: string;
  /** The first email out to them in the window, and the first touch with them either way (day). */
  outFirstAt?: string;
  firstDay?: string;
  /** The last past meeting and the next booked one with someone there (calendar attendees). */
  metDay?: string;
  nextDay?: string;
  /** The latest message from the other side in this entry's conversation on Merlin. */
  msgAt?: string;
  /** A person Merlin saw an email go to (for an entry Gmail opened). From the member's Google account. */
  person?: { name?: string; title?: string };
  /** The member's own seats there (internal ids): one that is new since Merlin first looked is a win. */
  seats?: string[];
}

/**
 * Move one entry by what Merlin sees, forward only: an email out after the last send is a
 * follow-up; an email in, or a reply on Merlin, after Sent is Replied; a meeting after Sent (or one
 * booked ahead) is Meeting. Proposal, Won, Lost and Not now are never changed here. With nothing new
 * for QUIET_DAYS, or past the last follow-up, an entry at Sent goes quiet. Returns whether it changed.
 */
export function detectEntry(e: PipelineEntry, sig: CompanySignals | undefined, nowMs: number): boolean {
  let changed = false;
  const sentAt = e.dates.sent ?? e.createdAt;
  const after = (t: string | undefined, seen: string | undefined, floor: string) => !!t && t > floor && (!seen || t > seen);
  if (sig) {
    // An email out, well after the last send: a follow-up (or, after it went quiet, a new try).
    if ((e.stage === "sent" || e.stage === "quiet") && sig.outAt && Date.parse(sig.outAt) - Date.parse(e.lastOut) > FOLLOW_GAP_MS && after(sig.outAt, e.seen.out, e.lastOut)) {
      e.seen.out = sig.outAt;
      if (e.stage === "quiet") {
        moveTo(e, "sent", "gmail", Date.parse(sig.outAt), nowMs);
        e.lastOut = sig.outAt;
      } else followedUp(e, "gmail", Date.parse(sig.outAt), nowMs);
      changed = true;
    }
    const canReply = e.stage === "sent" || e.stage === "quiet";
    if (canReply && after(sig.inAt, e.seen.in, sentAt)) {
      e.seen.in = sig.inAt;
      moveTo(e, "replied", "gmail", Date.parse(sig.inAt!), nowMs);
      changed = true;
    } else if (canReply && after(sig.msgAt, e.seen.msg, sentAt)) {
      e.seen.msg = sig.msgAt;
      moveTo(e, "replied", "message", Date.parse(sig.msgAt!), nowMs);
      changed = true;
    }
    const sentDay = sentAt.slice(0, 10);
    const canMeet = e.stage === "sent" || e.stage === "replied" || e.stage === "quiet";
    if (canMeet) {
      const met = sig.metDay && sig.metDay > sentDay && (!e.seen.met || sig.metDay > e.seen.met) ? sig.metDay : null;
      const next = !met && sig.nextDay && sig.nextDay >= dayOf(nowMs) && (!e.seen.next || sig.nextDay > e.seen.next) ? sig.nextDay : null;
      if (met || next) {
        if (met) e.seen.met = met;
        if (next) e.seen.next = next;
        // A meeting booked ahead counts from when Merlin saw it.
        moveTo(e, "meeting", "calendar", met ? Date.parse(`${met}T12:00:00Z`) : nowMs, nowMs);
        changed = true;
      }
    }
  }
  // Their own seat there, new since Merlin first looked: they won it.
  if (sig?.seats) {
    if (!e.seen.seats) {
      // The first look: the seats there now were there before the deal (kept, so a later one reads as new).
      e.seen.seats = [...sig.seats].slice(0, 20);
      changed = true;
    } else {
      const fresh = sig.seats.find((x) => !e.seen.seats!.includes(x));
      if (fresh) {
        e.seen.seats = [...e.seen.seats, fresh].slice(-20);
        if (isOpen(e.stage) || e.stage === "quiet") {
          e.seatId = fresh;
          moveTo(e, "won", "seat", nowMs, nowMs);
          changed = true;
        }
      }
    }
  }
  if (e.stage === "sent") {
    const quietDays = (nowMs - Date.parse(e.lastOut)) / DAY;
    const pastLast = e.follow >= QUIET_AFTER_FOLLOW_UPS && !!e.due && e.due <= dayOf(nowMs);
    if (pastLast || quietDays >= QUIET_DAYS) {
      moveTo(e, "quiet", "auto", nowMs, nowMs);
      changed = true;
    }
  }
  return changed;
}

export interface DetectInput {
  /** Company (internal id) -> what Merlin sees there for this member. */
  signals: Map<string, CompanySignals>;
  /** Conversation id -> the latest message from the other side (ISO), for replies on Merlin. */
  replies?: Map<string, string>;
  /** Companies a new email out may open an entry at (the member's Crystal Ball). Internal ids. */
  newAt?: Set<string>;
  /** Makes an id for an entry Gmail opens. */
  newId?: () => string;
}

/**
 * Move every entry of one member's pipeline by what Merlin sees, and open an entry at a Crystal
 * Ball company their Gmail shows a new email out to (the first email with them, in the last
 * GMAIL_NEW_DAYS). Returns how many entries changed or opened.
 */
export function detectAll(log: PipelineLog, x: DetectInput, nowMs: number): number {
  let n = 0;
  for (const e of log.entries) {
    const base = x.signals.get(e.companyId);
    const msgAt = e.conversationId ? x.replies?.get(e.conversationId) : undefined;
    const sig = msgAt ? { ...(base ?? {}), msgAt } : base;
    if (detectEntry(e, sig, nowMs)) n++;
  }
  if (x.newAt && x.newId) {
    for (const id of x.newAt) {
      const sig = x.signals.get(id);
      if (!sig?.outAt || !sig.outFirstAt || !sig.firstDay) continue;
      if (log.entries.some((e) => e.companyId === id)) continue;
      // A new conversation: the first touch with them was this email out, lately.
      if (sig.outFirstAt.slice(0, 10) !== sig.firstDay || nowMs - Date.parse(sig.outFirstAt) > GMAIL_NEW_DAYS * DAY) continue;
      const to: PipelineTo = sig.person?.name || sig.person?.title ? { ...(sig.person.name ? { name: sig.person.name } : {}), ...(sig.person.title ? { role: sig.person.title } : {}), google: true } : {};
      const { entry } = openEntry(log, { id: x.newId(), companyId: id, channel: "email", to, source: "gmail", via: "gmail", nowMs, atMs: Date.parse(sig.outFirstAt) });
      entry.seen.out = sig.outAt;
      detectEntry(entry, sig, nowMs);
      n++;
    }
  }
  return n;
}

/**
 * The proposal builder's hook: a proposal went out ("proposal_sent"), was signed ("signed") or
 * declined ("declined") at a company. Moves the member's entry there (Proposal, Won, Lost), and
 * opens one at Proposal when there is none. Returns the entry.
 */
export type ProposalKind = "proposal_sent" | "signed" | "declined";
export function pipelineEvent(
  state: { pipeline?: Record<string, PipelineLog> },
  memberId: string,
  companyId: string,
  kind: ProposalKind,
  at: string | number,
  newId: () => string,
  nowMs: number = Date.now(),
): PipelineEntry {
  const all = (state.pipeline ??= {});
  const log = (all[memberId] ??= emptyPipeline());
  const atMs = typeof at === "number" ? at : Date.parse(at);
  const when = Number.isFinite(atMs) ? Math.min(atMs, nowMs) : nowMs;
  let e = entryAt(log, companyId);
  if (!e || (!isOpen(e.stage) && e.stage !== "quiet" && kind === "proposal_sent")) {
    e = openEntry(log, { id: newId(), companyId, channel: "email", source: "proposal", via: "proposal", nowMs, atMs: when }).entry;
  }
  const stage: Stage = kind === "proposal_sent" ? "proposal" : kind === "signed" ? "won" : "lost";
  if (e.stage !== stage) moveTo(e, stage, "proposal", when, nowMs);
  return e;
}

/* ---------- intros ---------- */

export function addIntro(
  log: PipelineLog,
  o: { id: string; companyId: string | null; introducer: IntroRecord["introducer"]; nowMs: number; conversationId?: string },
): { intro: IntroRecord; created: boolean } {
  const same = (i: IntroRecord) =>
    i.status === "asked" &&
    i.companyId === o.companyId &&
    (o.conversationId ? i.conversationId === o.conversationId : o.introducer.memberId ? i.introducer.memberId === o.introducer.memberId : !i.introducer.memberId && (i.introducer.name ?? "") === (o.introducer.name ?? ""));
  const had = log.intros.find(same);
  if (had) return { intro: had, created: false };
  const intro: IntroRecord = { id: o.id, companyId: o.companyId, introducer: o.introducer, status: "asked", askedAt: iso(o.nowMs), ...(o.conversationId ? { conversationId: o.conversationId } : {}) };
  log.intros.push(intro);
  if (log.intros.length > PIPELINE_LIMITS.intros) log.intros.splice(0, log.intros.length - PIPELINE_LIMITS.intros);
  return { intro, created: true };
}

export function markIntro(i: IntroRecord, status: IntroStatus, by: "asker" | "introducer", nowMs: number) {
  i.status = status;
  i.markedBy = by;
  if (status === "made") (i.madeAt = iso(nowMs)), delete i.declinedAt;
  else if (status === "declined") (i.declinedAt = iso(nowMs)), delete i.madeAt;
  else delete i.madeAt, delete i.declinedAt;
}

/* ---------- deleting what came from Google ---------- */

/**
 * What to take out of a pipeline when the member's Google data is deleted (lib/google:
 * Disconnect and delete everything, Drop Gmail, or access removed at Google for GONE_KEEP_DAYS).
 * gmail, calendar: which reads go. google: every person marked as from the member's Google account
 * goes too (Calendar, Contacts and Gmail all at once). names, emails: the people Your network kept
 * from those reads, lowercase, so a name on an entry is found even without the mark.
 */
export interface GoogleForget {
  gmail: boolean;
  calendar: boolean;
  google: boolean;
  names: Set<string>;
  emails: Set<string>;
}

/**
 * The member did something on Merlin with this entry: used a drafted note, a message or intro on
 * Merlin, a proposal, their own seat, a follow-up they marked, their own note, or Won terms. An
 * entry without any of these that Gmail opened exists only because of Google, and goes whole.
 */
export function merlinActed(e: PipelineEntry): boolean {
  return (
    Object.values(e.via).some((v) => v === "note" || v === "message" || v === "proposal" || v === "seat") ||
    !!e.conversationId ||
    !!e.introId ||
    !!e.seatId ||
    !!e.won ||
    e.notes.length > 0 ||
    // pipeline.followed logs a bare "Followed up"; one Gmail saw says "(your Gmail)".
    e.log.some((l) => l.text === "Followed up")
  );
}

const lower = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();

/**
 * Take what came from Google out of one member's pipeline, in place: an entry Gmail opened that
 * the member did nothing with on Merlin goes; every other entry stays with its stages, dates,
 * follow-ups, notes and what Merlin itself saw, without the person's name and title from Google,
 * without "Detected from your Gmail" or "From your calendar" on a stage, and without the email and
 * meeting times it kept to tell a newer signal from one already used. Intros asked of someone from
 * Google keep their status, without that person's name and title. Returns the counts.
 */
export function forgetGoogle(log: PipelineLog, o: GoogleForget): { removed: number; cleared: number } {
  const known = (name: string | null | undefined) => !!name && (o.names.has(lower(name)) || o.emails.has(lower(name)));
  const fromGoogle = (p: { name?: string | null; google?: boolean; memberId?: string; seatId?: string }, gmailOpened = false) =>
    (o.google && !!p.google) || gmailOpened || (!p.memberId && !p.seatId && known(p.name));
  let removed = 0;
  let cleared = 0;
  const gone = new Set<string>();
  log.entries = log.entries.filter((e) => {
    const opened = o.gmail && (e.source === "gmail" || e.via.sent === "gmail");
    if (opened && !merlinActed(e)) {
      gone.add(e.id);
      removed++;
      return false;
    }
    const before = JSON.stringify(e);
    if (fromGoogle(e.to, opened)) {
      delete e.to.name;
      delete e.to.role;
      delete e.to.google;
    }
    for (const st of Object.keys(e.via) as Stage[]) if ((o.gmail && e.via[st] === "gmail") || (o.calendar && e.via[st] === "calendar")) delete e.via[st];
    if (o.gmail) {
      delete e.seen.out;
      delete e.seen.in;
      if (e.source === "gmail") e.source = "record";
    }
    if (o.calendar) {
      delete e.seen.met;
      delete e.seen.next;
    }
    for (const l of e.log) {
      if (o.gmail) l.text = l.text.replace(/ \(your Gmail\)/g, "");
      if (o.calendar) l.text = l.text.replace(/ \(your calendar\)/g, "");
    }
    if (JSON.stringify(e) !== before) cleared++;
    return true;
  });
  for (const i of log.intros) {
    if (i.entryId && gone.has(i.entryId)) delete i.entryId;
    if (!i.introducer.memberId && fromGoogle(i.introducer) && (i.introducer.name || i.introducer.role || i.introducer.google)) {
      delete i.introducer.name;
      delete i.introducer.role;
      delete i.introducer.google;
      cleared++;
    }
  }
  return { removed, cleared };
}

/* ---------- reading ---------- */

/**
 * Companies that stay out of today's moves because they live in the pipeline: every open or Won
 * entry, and a closed one for CLOSED_QUIET_DAYS after it closed. Internal ids.
 */
export function pipelineHidden(log: PipelineLog | undefined, nowMs: number): Set<string> {
  const out = new Set<string>();
  for (const e of log?.entries ?? []) {
    if (isOpen(e.stage) || e.stage === "won") out.add(e.companyId);
    else if (nowMs - Date.parse(e.dates[e.stage] ?? e.updatedAt) < CLOSED_QUIET_DAYS * DAY) out.add(e.companyId);
  }
  return out;
}

/**
 * The entry reached this stage: it actually happened (the stage has its date), or the entry is at
 * it now. Being past it is not enough: a deal that went Sent, Proposal, Won had no reply and no
 * meeting, and isn't counted as Replied or Meeting.
 */
export function reached(e: Pick<PipelineEntry, "stage" | "dates">, stage: Stage): boolean {
  return !!e.dates[stage] || e.stage === stage;
}

export interface FollowUpItem {
  entryId: string;
  /** Internal company id. */
  companyId: string;
  stage: Stage;
  channel: Channel;
  to: PipelineTo;
  /** ISO: when the note went out, and when the stage it is at began. */
  sentAt: string;
  stageAt: string;
  due: string;
  /** Days since the last note went out, and since the stage began. */
  days: number;
  stageDays: number;
  follow: number;
}

/**
 * The follow-ups due for a member at `nowMs`: open entries whose follow-up day is today or past,
 * the most overdue first. What Home shows above the moves and what the morning email can list.
 * `see`: what Merlin sees (as for detectAll), so the list is as of now even before the stored
 * entries are moved; without it the stored stages are read as they are. Nothing is written.
 */
export function dueFollowUps(state: { pipeline?: Record<string, PipelineLog> }, memberId: string, nowMs: number = Date.now(), see?: Omit<DetectInput, "newAt" | "newId">): FollowUpItem[] {
  const stored = state.pipeline?.[memberId];
  if (!stored) return [];
  const log: PipelineLog = see ? (JSON.parse(JSON.stringify(stored)) as PipelineLog) : stored;
  if (see) detectAll(log, see, nowMs);
  const today = dayOf(nowMs);
  return log.entries
    .filter((e) => isOpen(e.stage) && !!e.due && e.due <= today && !(e.stage === "sent" && quietBy(e, nowMs)))
    .map((e) => {
      const sentAt = e.lastOut ?? e.dates.sent ?? e.createdAt;
      const stageAt = e.dates[e.stage] ?? sentAt;
      return { entryId: e.id, companyId: e.companyId, stage: e.stage, channel: e.channel, to: e.to, sentAt, stageAt, due: e.due!, days: daysBetween(sentAt, nowMs), stageDays: daysBetween(stageAt, nowMs), follow: e.follow };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.sentAt.localeCompare(b.sentAt));
}
/** An entry at Sent that would go quiet now (read without changing it). */
const quietBy = (e: PipelineEntry, nowMs: number) => (e.follow >= QUIET_AFTER_FOLLOW_UPS && !!e.due && e.due <= dayOf(nowMs)) || (nowMs - Date.parse(e.lastOut)) / DAY >= QUIET_DAYS;

const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** "the CEO" from "CEO". */
const theRole = (role: string) => (/^(the|a|an)\s/i.test(role) ? role : `the ${role}`);
/**
 * Who it went to, in words. `names`: "all" (the member's own screens), or "merlin" (a name from
 * Merlin's own records, never one from the member's Google account: the connector, and anything
 * that leaves the app).
 */
export function whoWords(to: PipelineTo, channel: Channel, names: "all" | "merlin" = "all"): string {
  // Someone from the member's Google account stays on the member's own screens: no name or title elsewhere.
  if (names === "merlin" && to.google) return "the person you know there";
  const nameOk = !!to.name && (names === "all" || !to.google);
  if (nameOk) return firstOf(to.name!);
  if (to.role) return theRole(to.role);
  if (channel === "intro") return "your intro";
  return to.google ? "the person you know there" : "them";
}

const ago = (n: number) => (n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);
/**
 * A follow-up in words: "Follow up with the CEO at Larkfield Robotics" and "Sent 3 days ago by
 * email." `company`: its name as the member may see it, else null ("a company in your pipeline").
 */
export function followUpWords(f: Pick<FollowUpItem, "stage" | "channel" | "to" | "days" | "stageDays" | "follow">, company: string | null, names: "all" | "merlin" = "all"): { title: string; line: string } {
  const who = whoWords(f.to, f.channel, names);
  const at = company ?? "a company in your pipeline";
  const followed = f.follow ? ` You followed up ${f.follow === 1 ? "once" : `${f.follow} times`}.` : "";
  switch (f.stage) {
    case "replied":
      return { title: `Book a meeting with ${who} at ${at}`, line: `They replied ${ago(f.stageDays)}.` };
    case "meeting":
      return { title: `Send ${at} a proposal`, line: `You met ${ago(f.stageDays)}.` };
    case "proposal":
      return { title: `Check in on your proposal to ${at}`, line: `Sent ${ago(f.stageDays)}.${followed}` };
    default:
      return { title: `Follow up with ${who} at ${at}`, line: `Sent ${ago(f.days)} ${CHANNEL_HOW[f.channel]}.${followed}` };
  }
}

/** The next step on an entry, in a few words ("Follow up Nov 24", "Book a meeting", "Add it as your seat"), or null when there is none. */
export function nextStep(e: Pick<PipelineEntry, "stage" | "due" | "seatId"> & Partial<Pick<PipelineEntry, "route" | "dates">>, nowMs: number): string | null {
  // A route chosen and not acted on yet: its first step (the words name nobody, so the connector can read them too).
  if (e.route && e.stage === "sent" && e.dates && !e.dates.sent) return "Take the first step of your route";
  const today = dayOf(nowMs);
  const when = e.due ? (e.due < today ? "overdue" : e.due === today ? "today" : shortDay(e.due)) : null;
  switch (e.stage) {
    case "sent":
      return when ? (when === "overdue" ? "Follow up, overdue" : `Follow up ${when}`) : "Wait to hear back";
    case "replied":
      return "Book a meeting";
    case "meeting":
      return "Send a proposal";
    case "proposal":
      return when ? (when === "overdue" ? "Check in, overdue" : `Check in ${when}`) : "Hear back";
    case "won":
      return e.seatId ? null : "Add it as your seat";
    default:
      return null;
  }
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 24" from "2026-11-24". */
export function shortDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? `${SHORT[Number(m[2]) - 1]} ${Number(m[3])}` : day;
}
/** "Detected from your Gmail on Nov 21", "From your calendar on Nov 21", "You marked it on Nov 21". */
export function viaLine(via: Via | undefined, at: string | undefined): string | null {
  if (!via || !at) return null;
  return `${VIA_WORDS[via]} ${via === "auto" ? "" : "on "}${shortDay(at)}`.replace(/\s+/g, " ").trim();
}

/* ---------- the admin's numbers ---------- */

export interface OutcomeStats {
  /** Members with at least one entry. */
  members: number;
  entries: number;
  byStage: Record<Stage, number>;
  /** Entries that reached each stage (reached: the stage happened, not only a later one). */
  reached: Record<"sent" | "replied" | "meeting" | "proposal" | "won", number>;
  /** Shares from 0 to 1, or null with nothing to divide by. */
  conversion: { sentToReplied: number | null; repliedToMeeting: number | null; meetingToWon: number | null; sentToWon: number | null };
  won: number;
  wonThroughMerlin: number;
  /** Won from a signed proposal (the proposal builder moved it to Won: its via is "proposal"). */
  wonFromProposal: number;
  /** The month's value of every Won deal with terms, and of those through Merlin (dollars). */
  monthlyValue: number;
  monthlyValueThroughMerlin: number;
  /** Won deals that became a seat. */
  wonSeats: number;
  followUpsDue: number;
  /** Stages reached, by what Merlin detected them from. */
  detected: Record<Via, number>;
  intros: { asked: number; made: number; declined: number; won: number };
  /** Peers (lib/peers.ts): leads passed between members, taken into the peer's pipeline, and won there; teams and circles. Counts only. */
  leads: { passed: number; taken: number; won: number };
  teams: { formed: number; active: number };
  circles: { n: number; members: number; posts: number };
}

const share = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

/**
 * Every member's pipeline in counts and sums only, for the admin: entries by stage, how many went
 * Sent to Replied to Meeting to Won, Won through Merlin, the month's value of Won, and what the
 * stages were detected from. Never a name, a company, a note or anything that says whose.
 */
export function outcomeStats(state: { pipeline?: Record<string, PipelineLog>; peers?: PeersCounted }, nowMs: number = Date.now()): OutcomeStats {
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  const detected: Record<Via, number> = { note: 0, message: 0, gmail: 0, calendar: 0, proposal: 0, seat: 0, auto: 0, you: 0 };
  const reachedN = { sent: 0, replied: 0, meeting: 0, proposal: 0, won: 0 };
  // Each share counts the entries that reached both of its stages, so a deal that skipped one never counts as converted through it.
  const both = { sentReplied: 0, repliedMeeting: 0, meetingWon: 0, sentWon: 0 };
  let members = 0;
  let entries = 0;
  let wonThroughMerlin = 0;
  let wonFromProposal = 0;
  let monthly = 0;
  let monthlyMerlin = 0;
  let wonSeats = 0;
  let due = 0;
  const intros = { asked: 0, made: 0, declined: 0, won: 0 };
  let leadsWon = 0;
  const today = dayOf(nowMs);
  for (const log of Object.values(state.pipeline ?? {})) {
    if (!log) continue;
    if (log.entries?.length) members++;
    const wonIntro = new Set<string>();
    for (const e of log.entries ?? []) {
      entries++;
      byStage[e.stage]++;
      const r = Object.fromEntries(LINE.map((s) => [s, reached(e, s)])) as Record<(typeof LINE)[number], boolean>;
      for (const s of ["sent", "replied", "meeting", "proposal", "won"] as const) if (r[s]) reachedN[s]++;
      if (r.sent && r.replied) both.sentReplied++;
      if (r.replied && r.meeting) both.repliedMeeting++;
      if (r.meeting && r.won) both.meetingWon++;
      if (r.sent && r.won) both.sentWon++;
      for (const v of Object.values(e.via ?? {})) if (v) detected[v]++;
      if (isOpen(e.stage) && e.due && e.due <= today) due++;
      if (e.stage === "won") {
        const v = monthlyValue(e.won);
        monthly += v;
        if (e.won ? e.won.merlin : merlinByDefault(e)) wonThroughMerlin++, (monthlyMerlin += v);
        if (e.seatId) wonSeats++;
        if (e.via?.won === "proposal") wonFromProposal++;
        if (e.introId) wonIntro.add(e.introId);
      }
    }
    for (const i of log.intros ?? []) {
      intros[i.status]++;
      if (wonIntro.has(i.id)) intros.won++;
    }
    for (const e of log.entries ?? []) if (e.stage === "won" && e.lead) leadsWon++;
  }
  const passes = state.peers?.passes ?? [];
  const teams = state.peers?.teams ?? [];
  const circles = state.peers?.circles ?? [];
  return {
    members,
    entries,
    byStage,
    reached: reachedN,
    conversion: {
      sentToReplied: share(both.sentReplied, reachedN.sent),
      repliedToMeeting: share(both.repliedMeeting, reachedN.replied),
      meetingToWon: share(both.meetingWon, reachedN.meeting),
      sentToWon: share(both.sentWon, reachedN.sent),
    },
    won: byStage.won,
    wonThroughMerlin,
    wonFromProposal,
    monthlyValue: monthly,
    monthlyValueThroughMerlin: monthlyMerlin,
    wonSeats,
    followUpsDue: due,
    detected,
    intros,
    leads: { passed: passes.length, taken: passes.filter((p) => p.status === "taken").length, won: leadsWon },
    teams: { formed: teams.filter((t) => t.status === "active" || t.status === "ended").length, active: teams.filter((t) => t.status === "active").length },
    circles: { n: circles.filter((c) => c.members.length).length, members: circles.reduce((n, c) => n + c.members.length, 0), posts: circles.reduce((n, c) => n + c.posts.length, 0) },
  };
}

/** What outcomeStats reads of State.peers (lib/peersCore.ts PeersState): statuses and sizes, never a name, a company or a word written. */
export interface PeersCounted {
  passes?: { status: string }[];
  teams?: { status: string }[];
  circles?: { members: unknown[]; posts: unknown[] }[];
}

/* ---------- what the app and the connector are sent ---------- */

/** One entry as its member sees it (GET ?pipeline=1). Public ids only. */
export interface PipelineRec {
  id: string;
  /** The company's public id. */
  company: string;
  /** Its name as the member sees it, or null while it is locked for them. */
  name: string | null;
  stage: Stage;
  channel: Channel;
  to: { label: string; name: string | null; role: string | null; google: boolean };
  source: Source;
  /** The Won prompt's "Did this come through Merlin?" starts checked. */
  merlinDefault: boolean;
  dates: Partial<Record<Stage, string>>;
  via: Partial<Record<Stage, Via>>;
  /** "Detected from your Gmail on Nov 21": how the current stage was seen. */
  how: string | null;
  due: string | null;
  follow: number;
  next: string | null;
  /** One-tap corrections that make sense now. */
  fix: ("notReply" | "notMeeting" | "lost" | "notnow" | "reopen" | "remove")[];
  notes: PipelineNote[];
  log: PipelineNote[];
  won?: WonTerms & { monthly: number };
  /** The member's seat it became (public id). */
  seat?: string;
  /** The intro it came through: who made it, and its status. */
  intro?: { id: string; by: string; status: IntroStatus };
  /** A lead a peer passed: who passed it ("Passed to you by Ana"). */
  lead?: { id: string; by: string };
  /** A team at this company (lib/peers.ts): "Teamed with Ana". */
  team?: { id: string; with: string };
  /** The member went with a route in here (Your way in): the card draws the route line (app/post/network/Ways.tsx RouteLine). */
  route?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One intro as a member sees it: one they asked for ("asked"), or one another member asked of them ("of-you"). */
export interface IntroRec {
  id: string;
  side: "asked" | "of-you";
  /** The company's public id and name as this member sees it (null: none named, or locked). */
  company: string | null;
  name: string | null;
  /** Who introduces (side asked), or who asked (side of-you). */
  who: string;
  /** The introducer is a member, so either side can mark it. */
  member: boolean;
  status: IntroStatus;
  askedAt: string;
  madeAt?: string;
  declinedAt?: string;
  conversation?: string;
  /** The deal it led to was won. */
  won?: boolean;
  /** The asker's pipeline entry (side asked only). */
  entry?: string;
}

export interface FollowUpRec {
  id: string;
  company: string;
  name: string | null;
  stage: Stage;
  channel: Channel;
  who: string;
  title: string;
  line: string;
  sentAt: string;
  due: string;
  days: number;
  follow: number;
}

export interface PipelineView {
  entries: PipelineRec[];
  due: FollowUpRec[];
  intros: IntroRec[];
  counts: Record<Stage, number>;
  /** The month's value of Won deals with terms (dollars). */
  wonMonthly: number;
  /** What Merlin can see by itself for this member: their calendar, their Gmail, and whether Gmail is offered to them. */
  sees: { calendar: boolean; gmail: boolean; gmailOffered: boolean; google: boolean };
  /** The server's UTC day, for "overdue" and "today". */
  today: string;
}

export const emptyPipelineView = (nowMs = Date.now()): PipelineView => ({
  entries: [],
  due: [],
  intros: [],
  counts: Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>,
  wonMonthly: 0,
  sees: { calendar: false, gmail: false, gmailOffered: false, google: false },
  today: dayOf(nowMs),
});
