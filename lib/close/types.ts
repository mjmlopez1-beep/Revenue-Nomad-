/**
 * After a proposal or a document goes out (lib/close): what its readers did on the signing page,
 * the alerts it sets off, the reminders to the signer and the renewal reminder to the member. Pure
 * types and constants, no Node imports, so the server, the app and the signing page can all use it.
 *
 * What is kept (State.close, by proposal or document id): per reader (a random device id in a
 * cookie, kept here only as an HMAC; never an IP address, never a fingerprint) their visits and
 * reading time, and per section and per pricing option the time read, added up per reader. The raw
 * beacons are kept only as the last RAW_KEEP, for checking. Everything is capped (CAPS).
 *
 * Private to the member who sent it, like the proposal: never in another member's view, an admin's
 * panel or the export; account closure deletes it.
 */

/** What the client is told, on the proposal and the signing page, near the footer: short and plain. */
export const disclosureText = (sender?: string | null) =>
  `${String(sender ?? "").trim() || "The sender"} sees when this is opened and which sections are read. Merlin counts this with a cookie on this page, never your IP address.`;
export const DISCLOSURE = disclosureText();
/** The same line once it is signed (the signing page after signing, and the signed copy): reading isn't counted any more, a download is. */
export const signedDisclosureText = (sender?: string | null) =>
  `${String(sender ?? "").trim() || "The sender"} sees when the signed PDF is downloaded from this page. Merlin counts this with a cookie on this page, never your IP address.`;
/** The same, at more length, for the privacy pages. */
export const DISCLOSURE_LONG =
  "When you open a proposal or document sent with Merlin, the sender can see when it was opened, how many people opened the link, and roughly how long each section and price option was read. Once it is signed, only a download of the signed PDF from its page is counted. Merlin counts this with a random id in a cookie on this page, not your IP address.";

/** The cookie that tells one reader's browser from another on a signing link: a random id, nothing else. */
export const READER_COOKIE = "rn_reader";

export const CAPS = {
  /** Readers counted on one proposal or document; more are counted as dropped. */
  readers: 20,
  /** Sections and pages, and price options, tracked on one item. */
  sections: 60,
  options: 24,
  addons: 24,
  /** Events in one beacon. */
  events: 40,
  /** The time one beacon can carry, in total, and the slack on top of the time since the last one. */
  beaconMs: 60_000,
  slackMs: 5_000,
  /** One reader's time on one section (or option), at most. */
  sectionMs: 30 * 60_000,
  /** A visit ends after this long with nothing from that reader. */
  visitGapMs: 30 * 60_000,
  /** Kept: the last visits, downloads and raw events. */
  visits: 60,
  downloads: 20,
  raw: 200,
  /** An id or a label from the page. */
  id: 48,
  label: 60,
  /** The member's in-app notifications kept. */
  inbox: 60,
} as const;

/** A section counts as read in a visit once this much of the visit was on it. */
export const SEEN_MS = 10_000;

export type DeviceKind = "phone" | "tablet" | "computer";

export interface Reader {
  /** "r1", "r2"... in the order they first opened it. */
  id: string;
  /** HMAC of the reader cookie (22 characters). The cookie's own value is never stored. */
  dev: string;
  /** The signing link it came through: a proposal's send id, or a document signer's id. */
  link: string;
  /** The person the link went to: the first reader on that link, or the one who confirmed the email code. */
  signer: boolean;
  device: DeviceKind | null;
  firstAt: string;
  lastAt: string;
  visits: number;
  ms: number;
}

export interface SectionAgg {
  label: string;
  /** Total time, and per reader id. */
  ms: number;
  by: Record<string, number>;
  /** Visits with at least SEEN_MS on it. */
  visits: number;
  /** The visit being counted now ("r1:3") and its time on this section so far. */
  cur?: { v: string; ms: number };
}

export interface OptionAgg extends SectionAgg {
  /** Times a reader picked it. */
  picks: number;
  /** The last reader to pick it, and when. */
  pickedAt?: string;
}

export interface AddonAgg {
  label: string;
  /** Times it was turned on and off; on now as the last reader left it. */
  on: number;
  off: number;
  now: boolean;
}

export interface Visit {
  /** Reader id, and their visit number (1 is their first open). */
  r: string;
  n: number;
  at: string;
  /** The last beacon of the visit. */
  end: string;
  ms: number;
  /** Time on each section in this visit (at most 12 kept). */
  secs: Record<string, number>;
}

export interface RawEvent {
  at: string;
  r: string;
  t: string;
  id?: string;
  ms?: number;
}

export type ReminderKey = "d2" | "d7" | "expiry";
export const REMINDER_KEYS: ReminderKey[] = ["d2", "d7", "expiry"];

export interface ItemActivity {
  kind: "proposal" | "document";
  memberId: string;
  readers: Reader[];
  sections: Record<string, SectionAgg>;
  options: Record<string, OptionAgg>;
  addons: Record<string, AddonAgg>;
  visits: Visit[];
  downloads: { r: string; at: string }[];
  raw: RawEvent[];
  /** Events refused by the caps or the checks, counted only. */
  dropped: number;
  /** What the member was told, so nothing is said twice. */
  alerts: {
    /** Links whose first open was told (a proposal has one link a send; a document one a signer). */
    opened: string[];
    /** Readers told about as new. */
    readers: string[];
    engagedAt?: string;
    engagedKey?: string;
    /** Visits counted when the last engaged alert went out: a new one needs a new visit. */
    engagedVisits?: number;
    /** An engaged alert waiting for the 6 hours to pass. */
    engagedWaiting?: boolean;
    /** Signed or declined told, by link. */
    done: string[];
  };
  /** The member's reminder switches for this proposal (on unless turned off), and what went out ("<link>:<key>" -> at). */
  reminders: { off: Partial<Record<ReminderKey, boolean>>; sent: Record<string, string>; failed?: Record<string, number> };
  /**
   * Signed by the client, waiting for the member's countersignature (closeC3): when the client signed, who,
   * and when it was fully signed. Until `fullAt`, no renewal clock and no Won.
   */
  countersign?: { clientAt: string; by: string; fullAt?: string };
  /** A signed proposal's renewal: the term's end, asked once when not known, the reminder, the draft started from it. */
  renewal?: { end?: string; asked?: boolean; skipped?: boolean; remindedAt?: string; startedId?: string; ending?: string };
}

/**
 * question: the client asked a question on the page; passed: they passed it to someone else to sign;
 * countersign: they signed and the member countersigns to finish (closeC3's flows, lib/close/server.ts
 * afterClientAsked, afterPassedOn, afterClientSigned). signed: fully signed, or declined.
 */
export type CloseAlertKind = "open" | "reader" | "engaged" | "question" | "passed" | "countersign" | "signed" | "renewal";
export const CLOSE_ALERT_KINDS: CloseAlertKind[] = ["open", "engaged", "reader", "question", "passed", "countersign", "signed", "renewal"];
export type Channel = "slack" | "email" | "app";
export const CHANNELS: Channel[] = ["slack", "email", "app"];

/** The settings grid, in the mockup's words. */
export const ALERT_ROWS: { kind: CloseAlertKind; label: string; line: string }[] = [
  { kind: "open", label: "First open", line: "The first time they open it." },
  { kind: "engaged", label: "Engaged: time to follow up", line: "When what they read says it's time, at most once every 6 hours for each proposal." },
  { kind: "reader", label: "Someone new opened it", line: "A new person opens the link, say a forward to their boss." },
  { kind: "question", label: "They asked a question", line: "A question on the proposal. The email has the question, and your reply goes straight to them." },
  { kind: "passed", label: "Passed to someone else to sign", line: "They sent it on to the person who signs." },
  { kind: "countersign", label: "Signed, your turn to countersign", line: "They signed. It's finished once you countersign." },
  { kind: "signed", label: "Signed or declined", line: "As it happens. The signed copy and a decline always come by email too." },
  { kind: "renewal", label: "Renewal coming up", line: "30 days before a signed engagement ends." },
];

/** A member's switches: on unless turned off (or off by default here). Slack only goes out when Slack is connected. */
export type AlertPrefs = Partial<Record<CloseAlertKind, Partial<Record<Channel, boolean>>>>;
/**
 * Off until turned on: none now. A question, a hand-off and "your turn to countersign" each come in
 * one email, the proposal's own (lib/proposals/store.ts), and its email switch here turns that one off.
 */
export const DEFAULT_OFF: AlertPrefs = {};
export const prefOn = (p: AlertPrefs | undefined, kind: CloseAlertKind, ch: Channel): boolean => p?.[kind]?.[ch] ?? DEFAULT_OFF[kind]?.[ch] !== false;

/** One notification in Merlin. */
export interface InboxItem {
  id: string;
  kind: CloseAlertKind | "reminder";
  at: string;
  /** The proposal or document it is about. */
  item: string;
  /** In bold, then the rest: "Signed:" "Larkspur Learning, Operator". */
  head: string;
  text: string;
  /** The small line: "moved to Won", "automatic". */
  sub?: string;
  read?: boolean;
}

export interface CloseState {
  items: Record<string, ItemActivity>;
  inbox: Record<string, InboxItem[]>;
  prefs: Record<string, AlertPrefs>;
}

export const emptyClose = (): CloseState => ({ items: {}, inbox: {}, prefs: {} });

/**
 * A signing link's end, as ms, or null when it has none (closeC3: a link may have no end date).
 * Everything here reads a link's expiry through this, so a send whose expiresAt is null or missing
 * never expires, gets no "before the link closes" reminder, and reads "No end date".
 */
export const linkEnd = (expiresAt: string | null | undefined): number | null => {
  const ms = Date.parse(String(expiresAt ?? ""));
  return Number.isFinite(ms) ? ms : null;
};
/** The link has an end and it has passed. */
export const linkExpired = (expiresAt: string | null | undefined, nowMs: number) => {
  const end = linkEnd(expiresAt);
  return end !== null && nowMs > end;
};
export const NO_END_WORDS = "No end date";

/* ---------- what the member's app gets ---------- */

export interface Suggestion {
  /** The rule that made it (pricing, options, new_reader, opened_not_signed, quiet, not_opened, wait, signed, declined, expired). */
  key: string;
  /** "Follow up tomorrow morning". */
  when: string;
  headline: string;
  points: string[];
  /** The one-line why. */
  why: string;
  /** A follow-up email to start from, in plain words. Null when there's nothing to send. */
  draft: string | null;
  /** Worth an engaged alert. */
  engaged: boolean;
}

export interface ReminderRow {
  key: ReminderKey;
  /** Whose link (a document's signer), else the proposal's signer. */
  to: string;
  label: string;
  at: string;
  state: "sent" | "planned" | "skipped" | "off" | "stopped";
  /** The member's switch for this kind. */
  on: boolean;
}

export interface ActivityView {
  id: string;
  kind: "proposal" | "document";
  /** Close (canClose, the trial counts). Off: only `upgrade` and nothing read is shown. */
  open: boolean;
  upgrade?: string;
  title: string;
  company: string;
  status: string;
  /** "Viewed · not signed". */
  statusWords: string;
  signer: { name: string; title: string; email: string } | null;
  sentAt: string | null;
  /** Null: not sent, or the link has no end date. */
  expiresAt: string | null;
  stats: { opens: number; readers: number; ms: number; option: string | null; mostRead: string | null };
  sections: { id: string; label: string; ms: number; top: boolean }[];
  options: { id: string; label: string; ms: number; picks: number; words: string }[];
  addons: { label: string; on: boolean }[];
  /** Newest first. */
  timeline: { at: string; text: string; strong?: string }[];
  suggestion: Suggestion | null;
  reminders: ReminderRow[];
  /** The member's reminder switches for this proposal or document, set or not sent yet (the send sheets read these). */
  remindersOn: Record<ReminderKey, boolean>;
  /** A signed proposal: its renewal. `ask`: the end isn't known, ask once. */
  renewal: { end: string | null; ask: boolean; due: boolean; remindedAt: string | null; startedId: string | null; ending: boolean } | null;
  /** "Open in Gmail": a compose link to the signer, with the draft. */
  gmail: string | null;
  disclosure: string;
}

export interface CloseInboxView {
  open: boolean;
  items: InboxItem[];
  unread: number;
  /** Signed proposals whose renewal is due (30 days before the end), for Home. */
  renewals: { id: string; title: string; company: string; end: string; days: number; line: string; terms: string | null }[];
  prefs: Record<CloseAlertKind, Record<Channel, boolean>>;
  slack: boolean;
  email: boolean;
}

/** "phone" from the browser's own user agent: the kind of device, nothing that tells one apart. */
export function deviceOf(ua: string): DeviceKind | null {
  const u = String(ua ?? "");
  if (!u) return null;
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(u)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(u)) return "phone";
  return "computer";
}
