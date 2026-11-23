/**
 * The bell, v2 (BUILD_PLAN F5, Stage 7a): one inbox per member, and the log of every alert sent.
 *
 *   State.inbox[memberId]     what came in, newest first, at most INBOX_MAX: { id, at, kind, line,
 *                             href, read }. Written wherever an alert goes out by email or Slack, and
 *                             wherever an alert with the bell on fires (lib/notify/events.ts, the
 *                             weekly scan's roles, Crystal Ball's run, a seat someone engaged).
 *                             Proposal activity keeps its own inbox (lib/close, State.close.inbox):
 *                             the bell reads both. Messages keep theirs (unread conversations).
 *   State.alertLog[memberId]  each alert sent, by channel and count, ALERT_LOG_DAYS kept, for "Since
 *                             Thursday · 9 alerts sent" and each alert's Last fired. Counts and the
 *                             alert's key only: never a company or a person.
 *   State.alertPrefs[memberId] the switches of the alerts that are no list: Companies you follow, and
 *                             Someone you know changed jobs (each on, by email, in Slack, in the bell).
 *   State.alertWatch          the watch pass (lib/notify/events.ts afterWatch): when it last looked,
 *                             each member's keys already told (never twice) and what waits for the
 *                             morning or the week. Internal: never sent to the app.
 *
 * Every line here was written for its member, as they see Merlin: a company they have not opened is
 * described, never named (lib/digest.ts LOCKED_HIRER). The inbox and the watch are theirs alone:
 * never in another member's view or the admin export; account closure's purge deletes them all.
 *
 * The pure helpers take the state's parts structurally (no import of lib/table.ts at the top), so the
 * table, the senders and the tests share them. The server half (inboxFor, alertsFor, performInbox)
 * loads lib/table.ts when it runs.
 */

/** Lines a member's inbox keeps (newest first). */
export const INBOX_MAX = 200;
/** Days the alert log keeps. */
export const ALERT_LOG_DAYS = 90;
const DAY = 86_400_000;

/** What a line is about, for its mark and where it goes. */
/** credits: the credits meter's line, once a period at 80% used and at 0 (lib/creditsMeter.ts meterBell). */
export type InboxKind = "roles" | "hire" | "seat" | "leader" | "fact" | "funding" | "known" | "radar" | "engaged" | "workflow" | "credits" | "test";
export const INBOX_KINDS: InboxKind[] = ["roles", "hire", "seat", "leader", "fact", "funding", "known", "radar", "engaged", "workflow", "credits", "test"];

export interface InboxEntry {
  /** Unique in the member's inbox: the event's key ("seat:<seat public id>"), so the same news never comes twice. */
  id: string;
  at: string;
  kind: InboxKind;
  /** The line, in plain words, as the member sees Merlin. */
  line: string;
  /** The small line under it ("On your list Sales-led SaaS"). */
  sub?: string;
  /** Where it opens in the app: "/?c=<company public id>", "/?p=radar", "/?v=hiring". */
  href: string;
  read?: boolean;
  /** The alert it came from ("list:<view id>", "follows", "radar", "wf:<workflow id>"). */
  alert?: string;
  /**
   * A workflow's run waiting at its monthly cap (lib/workflows/run.ts): the bell shows "Say yes · N
   * credits" until the member answers (POST { action: { type: "workflow.approve", run, yes } }).
   */
  ask?: { run: string; credits: number; answer?: "yes" | "no" };
}

export type AlertChannel = "email" | "slack" | "webhook" | "bell";
export interface AlertLogRow {
  at: string;
  /** The alert's key: "list:<view id>", "radar", "digest", "follows", "known", "seat", "roles", "message", "proposal". */
  alert: string;
  kind: string;
  channel: AlertChannel;
  /** Events it carried. */
  count: number;
}

/** One of the alerts that is no list, as the member set it. Left out: on, by email and in the bell, not Slack. */
export interface FixedPref {
  on: boolean;
  email: boolean;
  slack: boolean;
  bell: boolean;
}
export type FixedKey = "follows" | "known";
export const FIXED_KEYS: FixedKey[] = ["follows", "known"];
export const FIXED_DEFAULT: FixedPref = { on: true, email: true, slack: false, bell: true };
export type MemberAlertPrefs = Partial<Record<FixedKey, FixedPref>>;

/** An event waiting for its email (the morning's or the week's), as its line. */
export interface QueuedLine {
  id: string;
  at: string;
  kind: InboxKind;
  line: string;
  sub?: string;
  href: string;
  alert: string;
  /** The alert's name for the email's group ("Sales-led SaaS, hiring", "Companies you follow"). */
  name: string;
  /** Where it goes when its time comes. */
  email?: boolean;
  slack?: boolean;
}

/** State.alertWatch. */
export interface WatchState {
  /** The last pass (ISO). */
  at: string | null;
  /** When the log started counting (the launch): "Counting since Dec 2". */
  from?: string;
  members: Record<
    string,
    {
      /** Event keys already told, newest last, at most WATCH_KEYS. */
      keys: string[];
      /** Lines waiting for the morning's email, and the week's. */
      daily?: QueuedLine[];
      weekly?: QueuedLine[];
      /** When the morning's email and the week's last went (ISO). */
      dailyAt?: string;
      weeklyAt?: string;
      /** The last Slack post of the watch (the 15-minute batch). */
      slackAt?: string;
      slack?: QueuedLine[];
    }
  >;
}
export const WATCH_KEYS = 2000;
export const emptyWatch = (): WatchState => ({ at: null, members: {} });

/** The parts of the state this file reads and writes. */
export interface AlertStores {
  inbox?: Record<string, InboxEntry[]>;
  alertLog?: Record<string, AlertLogRow[]>;
  alertPrefs?: Record<string, MemberAlertPrefs>;
  alertWatch?: WatchState;
}

/* ---------- writing (inside the table's write queue: `d` is the draft) ---------- */

/** One line of text, never longer than `n`, no control characters. */
const oneLine = (v: unknown, n: number) => [...String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim()].slice(0, n).join("");
/** Only an address inside the app: "/?…" or "/". */
export const appHref = (v: unknown) => {
  const h = String(v ?? "");
  return /^\/(\?[^\s<>"'`\\]*)?$/.test(h) ? h : "/";
};

/** Add lines to a member's inbox, newest first, each id once (a line already there stays as it was), capped at INBOX_MAX. Returns how many were added. */
export function pushInbox(d: AlertStores, memberId: string, entries: Omit<InboxEntry, "read">[]): number {
  if (!entries.length) return 0;
  d.inbox ??= {};
  const list = d.inbox[memberId] ?? [];
  const have = new Set(list.map((x) => x.id));
  const add: InboxEntry[] = [];
  for (const e of entries) {
    const id = oneLine(e.id, 160);
    if (!id || have.has(id)) continue;
    have.add(id);
    add.push({
      id,
      at: e.at,
      kind: INBOX_KINDS.includes(e.kind) ? e.kind : "test",
      line: oneLine(e.line, 240),
      ...(e.sub ? { sub: oneLine(e.sub, 160) } : {}),
      href: appHref(e.href),
      ...(e.alert ? { alert: oneLine(e.alert, 80) } : {}),
      ...(e.ask ? { ask: { run: oneLine(e.ask.run, 40), credits: Math.max(0, Math.round(Number(e.ask.credits) || 0)), ...(e.ask.answer ? { answer: e.ask.answer } : {}) } } : {}),
    });
  }
  if (!add.length) return 0;
  d.inbox[memberId] = [...add, ...list].sort((a, b) => b.at.localeCompare(a.at)).slice(0, INBOX_MAX);
  return add.length;
}

/** Log alerts sent, and drop rows older than ALERT_LOG_DAYS. The first row starts the count ("Counting since"). */
export function logAlert(d: AlertStores, memberId: string, rows: AlertLogRow[], nowMs = Date.now()): void {
  const keep = rows.filter((r) => r.count > 0);
  if (!keep.length) return;
  d.alertLog ??= {};
  d.alertWatch ??= emptyWatch();
  d.alertWatch.from ??= new Date(nowMs).toISOString();
  const cut = new Date(nowMs - ALERT_LOG_DAYS * DAY).toISOString();
  d.alertLog[memberId] = [...(d.alertLog[memberId] ?? []).filter((r) => r.at >= cut), ...keep.map((r) => ({ ...r, alert: oneLine(r.alert, 80), kind: oneLine(r.kind, 40), count: Math.max(1, Math.round(r.count)) }))];
}

/** Mark lines read: the ids given, or every line. Returns how many changed. */
export function markRead(d: AlertStores, memberId: string, ids?: unknown): number {
  const list = d.inbox?.[memberId];
  if (!list) return 0;
  const want = Array.isArray(ids) ? new Set(ids.map((x) => String(x))) : null;
  let n = 0;
  for (const x of list)
    if (!x.read && (!want || want.has(x.id))) {
      x.read = true;
      n++;
    }
  return n;
}

/** A workflow's ask answered (or its price changed, with `answer` null): the bell line says so, once. */
export function settleAsk(d: AlertStores, memberId: string, runId: string, answer: "yes" | "no" | null, credits?: number): void {
  for (const x of d.inbox?.[memberId] ?? []) {
    if (x.ask?.run !== runId) continue;
    if (answer) {
      x.ask = { ...x.ask, answer };
      x.read = true;
      x.line = answer === "yes" ? "A workflow went on: you said yes" : "A workflow stopped there: you said no";
    } else if (credits !== undefined) {
      x.ask = { ...x.ask, credits };
      x.line = `A workflow waits for your yes · ${credits === 1 ? "1 credit" : `${credits} credits`}`;
    }
  }
}

/** A fixed alert's switches as the member set them. */
export const fixedPref = (s: AlertStores, memberId: string, k: FixedKey): FixedPref => ({ ...FIXED_DEFAULT, ...(s.alertPrefs?.[memberId]?.[k] ?? {}) });

/** Account closure: everything of theirs here goes. */
export function forgetAlerts(d: AlertStores, memberId: string): void {
  if (d.inbox) delete d.inbox[memberId];
  if (d.alertLog) delete d.alertLog[memberId];
  if (d.alertPrefs) delete d.alertPrefs[memberId];
  if (d.alertWatch?.members) delete d.alertWatch.members[memberId];
}

/* ---------- reading ---------- */

/** GET /api/table?inbox=1: the member's lines, newest first, and how many are unread. */
export interface InboxView {
  items: InboxEntry[];
  unread: number;
}
export function inboxOf(s: AlertStores, memberId: string, limit = 50): InboxView {
  const list = s.inbox?.[memberId] ?? [];
  return { items: list.slice(0, limit).map((x) => ({ ...x, read: !!x.read })), unread: list.filter((x) => !x.read).length };
}

/** GET /api/table?alerts=1: what the Alerts page reads besides Me and the integrations. */
export interface AlertsView {
  /** The fixed alerts' switches. */
  prefs: Record<FixedKey, FixedPref>;
  /** Alerts sent since `since` (the member's last visit), and the day the count started. */
  sent: number;
  since: string | null;
  countingSince: string | null;
  /** Each alert's last time, by its key, and how many went in the last 30 days. */
  last: Record<string, { at: string; count: number }>;
  /** The member has people of their own (Google, the LinkedIn file, a contacts CSV): Someone you know changed jobs can watch them. */
  sources: boolean;
}
export function alertsOf(s: AlertStores, memberId: string, sinceIso: string | null, nowMs = Date.now(), sources = false): AlertsView {
  const log = s.alertLog?.[memberId] ?? [];
  const month = new Date(nowMs - 30 * DAY).toISOString();
  const last: AlertsView["last"] = {};
  for (const r of log) {
    const x = (last[r.alert] ??= { at: r.at, count: 0 });
    if (r.at > x.at) x.at = r.at;
    if (r.at >= month) x.count += r.count;
  }
  const since = sinceIso && Number.isFinite(Date.parse(sinceIso)) ? new Date(sinceIso).toISOString() : null;
  // One alert sent is one row, whatever channels carried it at the same minute: email and the bell together count once.
  const sentKeys = new Set(log.filter((r) => !since || r.at > since).map((r) => `${r.alert}|${r.at.slice(0, 16)}`));
  return {
    prefs: { follows: fixedPref(s, memberId, "follows"), known: fixedPref(s, memberId, "known") },
    sent: sentKeys.size,
    since,
    countingSince: s.alertWatch?.from ?? null,
    last,
    sources,
  };
}

/* ---------- the server half ---------- */

const SIGNED_OUT = "You're signed out. Sign in again to change your alerts.";

/** GET /api/table?inbox=1. Null when signed out. */
export async function inboxFor(token: string | null): Promise<InboxView | null> {
  const { loadSeed, loadState, memberByToken } = await import("./table");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? inboxOf(s, m.id) : null;
}

/** GET /api/table?alerts=1&since=ISO. Null when signed out. */
export async function alertsFor(token: string | null, since: string | null): Promise<AlertsView | null> {
  const { loadSeed, loadState, memberByToken } = await import("./table");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) return null;
  // Someone you know reads the member's LinkedIn file, contacts CSV and Google, for this member alone (lib/notify/knownView.ts).
  const sources = (await import("./notify/knownView")).hasKnownSources(s, m.id);
  return alertsOf(s, m.id, since, Date.now(), sources);
}

/**
 * The actions (POST /api/table, lib/table.ts perform):
 *   inbox.read    { ids? }                    mark lines read (all without ids)
 *   alerts.fixed  { key, on?, email?, slack?, bell? }   a fixed alert's switches (follows, known)
 *   alerts.test   { alert }                  a test line in the bell now, saying where else this alert goes
 */
export async function performInbox(token: string | null, a: { type: string } & Record<string, unknown>): Promise<{ message: string; inbox?: InboxView; alerts?: AlertsView }> {
  const { ActionError, loadSeed, loadState, memberByToken, tableInternals: T } = await import("./table");
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s0);
  if (!m) throw new ActionError(SIGNED_OUT);
  if (a.type === "inbox.read") {
    const inbox = await T.mutate((d) => {
      markRead(d, m.id, a.ids);
      return inboxOf(d, m.id);
    });
    return { message: "", inbox };
  }
  if (a.type === "alerts.fixed") {
    const key = a.key;
    if (!FIXED_KEYS.includes(key as FixedKey)) throw new ActionError("That alert isn't one Merlin has.");
    const k = key as FixedKey;
    const free = T.freeNow(s0, m.id);
    if (a.slack === true && free) throw new ActionError("Slack for this alert is part of Pro.");
    const alerts = await T.mutate((d) => {
      d.alertPrefs ??= {};
      const cur = fixedPref(d, m.id, k);
      const next: FixedPref = {
        on: typeof a.on === "boolean" ? a.on : cur.on,
        email: typeof a.email === "boolean" ? a.email : cur.email,
        slack: typeof a.slack === "boolean" ? a.slack : cur.slack,
        bell: typeof a.bell === "boolean" ? a.bell : cur.bell,
      };
      if (next.on && !next.email && !next.slack && !next.bell) next.bell = true;
      d.alertPrefs[m.id] = { ...(d.alertPrefs[m.id] ?? {}), [k]: next };
      return alertsOf(d, m.id, null);
    });
    const name = k === "follows" ? "Companies you follow" : "Someone you know changed jobs";
    return { message: alerts.prefs[k].on ? `Saved. ${name} is on.` : `${name} is off.`, alerts };
  }
  if (a.type === "alerts.test") {
    const alert = oneLine(a.alert, 80) || "test";
    const at = new Date().toISOString();
    const inbox = await T.mutate((d) => {
      pushInbox(d, m.id, [{ id: `test:${alert}:${at}`, at, kind: "test", line: "A test alert. This is how an alert shows in the bell.", sub: "Sent from Alerts and workflows", href: "/?p=alerts", alert }]);
      logAlert(d, m.id, [{ at, alert, kind: "test", channel: "bell", count: 1 }]);
      return inboxOf(d, m.id);
    });
    return { message: "Sent a test to the bell. Open it at the top of the page.", inbox };
  }
  throw new ActionError("That didn't go through. Refresh the page and try again.");
}
