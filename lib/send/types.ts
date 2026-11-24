/**
 * Approve, then send (owner decision 2026-11-24): Merlin drafts in the member's voice, the member
 * taps Approve and send on each message, and it goes from their own Gmail. Follow-ups queue the same
 * way. Nothing ever goes out without the member's own tap in the Merlin app, signed in. An agent
 * (the connector, lib/mcp) can put a note in front of the member to approve, never approve or send.
 *
 * What is kept, State.outbox[memberId] (lib/send/index.ts):
 *   grant   the extra Google permission to send (gmail.send), sealed like the other Google tokens.
 *           Asked for only the first time the member taps Approve and send (incremental: the grant
 *           Merlin already has stays as it is). Merlin still never reads a message's text.
 *   items   each note the member approved (or an agent queued for them): who it goes to, when, the
 *           company, person and pipeline deal it is about, and once sent the Gmail message and
 *           thread ids. The text is kept only while the note waits (the 30 seconds to undo, or a
 *           follow-up's scheduled time). Once sent, cancelled or failed, the body is deleted; the
 *           subject stays only so a follow-up can go in the same thread, and goes with the record.
 *   sent    when each note went (a rolling day's cap counts these). Counts only.
 *
 * Pure: no Node imports, so the app and the server both read it.
 */

/** The switch. Off: no button, no route, no tool, and every page reads as before. */
export const SEND_ENV = "RN_SEND";
/** The extra Google permission, asked only when needed. */
export const SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send";
/** The time to take a note back after Approve and send. */
export const UNDO_MS = 30_000;
/** Notes a member can send in any rolling 24 hours. */
export const DAILY_CAP = 50;
/** Sent records kept this long (the thread a follow-up joins), then deleted. */
export const KEEP_SENT_DAYS = 90;
/** Records a member's outbox keeps at most (oldest closed ones go first). */
export const OUTBOX_MAX = 300;
export const SUBJECT_MAX = 160;
export const BODY_MAX = 5000;
/** How long the Google consent page may take before the waiting note gives up (the member taps again). */
export const GRANT_WAIT_MS = 30 * 60_000;

/**
 * Where an item stands.
 *   draft     queued by an agent (or kept by the member): waiting for the member's Approve tap
 *   grant     approved, waiting on Google's permission to send (the consent page)
 *   queued    approved, going out when the undo window ends
 *   scheduled approved follow-up, going out at its time if nobody replied
 *   sending   being handed to Gmail now
 *   sent      in the member's Gmail Sent folder
 *   cancelled undone or cancelled by the member
 *   replied   a scheduled follow-up Merlin held back because the person replied
 *   held      Merlin could not send it (the daily cap, no way to check for a reply, the permission
 *             gone): the member sends it again or drops it
 *   failed    Gmail refused it
 */
export type SendStatus = "draft" | "grant" | "queued" | "scheduled" | "sending" | "sent" | "cancelled" | "replied" | "held" | "failed";
export const OPEN_STATUSES: readonly SendStatus[] = ["draft", "grant", "queued", "scheduled", "sending", "held"];

/** What a sent note does in Merlin, as the same note used by hand would (lib/pipeline.ts rules). */
export type SendEffect =
  | { type: "move"; id: string; op: "sent"; channel?: "email" | "intro"; to?: { name?: string | null; role?: string | null; google?: boolean }; intro?: boolean }
  | { type: "pipeline.sent"; companyId: string; channel?: "email" | "intro"; to?: { name?: string | null; role?: string | null; google?: boolean }; from?: "network" | "record"; intro?: boolean }
  | { type: "pipeline.followed"; id: string };

/** Where the note came from, for the record and the words. */
export type SendKind = "move" | "network" | "record" | "followup" | "workflow" | "agent" | "intro" | "other";

/** What the app sends with Approve and send. */
export interface ApproveInput {
  /** The draft's own key (the sheet's), so a second tap on the same draft is the same send. */
  key: string;
  to: string;
  toName?: string | null;
  subject: string;
  body: string;
  kind: SendKind;
  /** The company's public id, when the note is about one. */
  company?: string | null;
  /** The pipeline deal's id, for a follow-up. */
  pipelineId?: string | null;
  effect?: SendEffect | null;
  /** A follow-up for later: ISO time. Without it the note goes when the undo window ends. */
  at?: string | null;
  /** Approving a note an agent queued: its id. */
  id?: string | null;
}

/** One item as the member's app sees it. */
export interface SendItemView {
  id: string;
  key: string;
  status: SendStatus;
  to: string;
  toName: string | null;
  /** While it waits: the text, for the member to read again. Gone once it is sent. */
  subject: string | null;
  body: string | null;
  kind: SendKind;
  company: string | null;
  companyName: string | null;
  pipelineId: string | null;
  createdAt: string;
  /** When it goes (queued, scheduled). */
  sendAt: string | null;
  sentAt: string | null;
  /** In the same Gmail thread as an earlier note from Merlin. */
  threaded: boolean;
  /** An agent queued it (the connector): the member approves it here. */
  byAgent: boolean;
  /** Why it was held, failed or not sent, in plain words. */
  note: string | null;
}

export interface SendView {
  on: true;
  /** The member gave Google's permission to send. */
  granted: boolean;
  /** The Google address it sends from, when known. */
  from: string | null;
  /** Sent in the last 24 hours, and the cap. */
  today: number;
  cap: number;
  /** Merlin can see a reply (Gmail headers are connected): a follow-up can wait for one. */
  replyCheck: boolean;
  items: SendItemView[];
  /** Per company public id: the address and subject of the latest note Merlin sent there, for a follow-up in the same thread. */
  threads: Record<string, { to: string; toName: string | null; subject: string }>;
}

/* ---------- words ---------- */

export const WORDS = {
  approve: "Approve and send",
  sentFrom: "Sent from your Gmail",
  undo: "Undo",
  promise: "Merlin sends only what you approve, from your own Gmail.",
  promiseMore: "Nothing goes out until you tap Approve and send, and you have 30 seconds to undo it. Merlin never reads your email.",
  queued: (first: string) => `Sending to ${first} from your Gmail in 30 seconds.`,
  undone: "Undone. Nothing was sent.",
  cap: `You've sent ${DAILY_CAP} notes from Merlin in the last 24 hours. That's the daily limit, so this one waits. Send it tomorrow, or from your own mail now.`,
  grant: "Google asks you once to let Merlin send from your Gmail. You'll come back here and it sends.",
  noAddress: "Add their email address to send it.",
  badAddress: "That email address doesn't look right. Check it and try again.",
  locked: "That address belongs to someone you haven't opened on Merlin. Open their email first, or send from your own mail.",
  hidden: "Merlin can't send to that person. Send from your own mail if you know them.",
  replied: (first: string) => `${first} replied, so Merlin didn't send your follow-up.`,
  agentOnly: "Merlin sends only after you approve it here. An agent can queue a note for you, never send one.",
} as const;

export const firstOf = (name: string | null | undefined, email?: string | null) => {
  const n = String(name ?? "").trim().split(/\s+/)[0];
  if (n) return n;
  const local = String(email ?? "").split("@")[0];
  return local || "them";
};

/** A plain address check: one @, a dot in the domain, no spaces, no brackets. */
export function cleanAddress(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(e)) return null;
  if (e.includes("..")) return null;
  return e;
}

/**
 * The next working morning at 9 in the member's own time, `days` working days from `fromMs`
 * (Saturday and Sunday skipped). For "Send Tuesday 9am if no reply".
 */
export function workMorning(fromMs: number, days: number): Date {
  const d = new Date(fromMs);
  d.setHours(9, 0, 0, 0);
  let left = Math.max(1, days);
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "Tuesday 9am", in the member's own time. */
export function whenWords(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h % 12 || 12;
  return `${DAYS[d.getDay()]} ${hh}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
