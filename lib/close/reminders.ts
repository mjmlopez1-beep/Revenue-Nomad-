/**
 * Reminders to the signer, pure: which go out when, and which are done. lib/close/server.ts sends
 * the due ones on the job scheduler's tick (lib/jobs.ts), with the proposal's or document's own
 * email (lib/proposals/emails.ts proposalEmail, lib/documents/emails.ts docInviteEmail).
 *
 *   d2       2 days after it went to them, if they haven't opened it
 *   d7       7 days after, if they haven't signed
 *   expiry   2 days before the link closes, if they haven't signed
 *
 * Each is on unless the member turned it off for this proposal. None goes once it is signed,
 * declined or withdrawn (voided), or the link expired, and a reminder more than 2 days late (the
 * server was down) is dropped rather than sent out of turn.
 */
import type { ItemActivity, ReminderKey, ReminderRow } from "./types";
import { REMINDER_KEYS } from "./types";

const DAY = 86_400_000;
export const LATE_MS = 2 * DAY;

/** One signing link: a proposal's current send, or a document signer whose turn it is. */
export interface LinkInfo {
  link: string;
  name: string;
  email: string;
  /** When it went to them: the send, or the document signer's own email. */
  base: string;
  viewedAt: string | null;
  expiresAt: string;
  done: "signed" | "declined" | "void" | "expired" | null;
}

export const REMINDER_SAY: Record<ReminderKey, { label: string; opened?: string; short: string; why: string }> = {
  d2: { label: "Day 2, not opened", short: "not opened in 2 days", why: "Remind them if it's not opened in 2 days" },
  d7: { label: "Day 7, not signed", opened: "Day 7, opened but not signed", short: "not signed in 7 days", why: "Remind them if it's opened but not signed in 7 days" },
  expiry: { label: "2 days before the link closes", short: "the link closes in 2 days", why: "Warn them 2 days before the link closes" },
};

/** When each reminder is due for a link. */
export function reminderAt(l: LinkInfo, key: ReminderKey): number {
  const b = Date.parse(l.base);
  return key === "d2" ? b + 2 * DAY : key === "d7" ? b + 7 * DAY : Date.parse(l.expiresAt) - 2 * DAY;
}

function rowsFor(l: LinkInfo, a: ItemActivity | null | undefined, nowMs: number): ReminderRow[] {
  const off = a?.reminders?.off ?? {};
  const sent = a?.reminders?.sent ?? {};
  const opened = !!l.viewedAt || !!a?.readers.some((r) => r.link === l.link);
  const out: ReminderRow[] = [];
  for (const key of REMINDER_KEYS) {
    const atMs = reminderAt(l, key);
    const done = sent[`${l.link}:${key}`];
    if (!Number.isFinite(atMs)) continue;
    // A link too short for these: the day 7 one when the warning comes first, the warning when it would come by day 2.
    if (!done && key === "d7" && atMs >= reminderAt(l, "expiry")) continue;
    if (!done && key === "expiry" && atMs <= reminderAt(l, "d2")) continue;
    const say = REMINDER_SAY[key];
    const label = key === "d7" && opened && say.opened ? say.opened : say.label;
    const state: ReminderRow["state"] = done
      ? "sent"
      : l.done
        ? "stopped"
        : key === "d2" && opened
          ? "skipped"
          : off[key]
            ? "off"
            : nowMs >= atMs + LATE_MS
              ? "skipped"
              : "planned";
    out.push({ key, to: l.name, label, at: done ?? new Date(atMs).toISOString(), state, on: !off[key] });
  }
  return out;
}

export const reminderRows = (links: LinkInfo[], a: ItemActivity | null | undefined, nowMs: number): ReminderRow[] => links.flatMap((l) => rowsFor(l, a, nowMs));

/** The reminders to send now: planned, and their time has come (but not 2 days past). */
export function dueReminders(links: LinkInfo[], a: ItemActivity | null | undefined, nowMs: number): { link: LinkInfo; key: ReminderKey }[] {
  return links.flatMap((l) => rowsFor(l, a, nowMs).filter((r) => r.state === "planned" && nowMs >= Date.parse(r.at)).map((r) => ({ link: l, key: r.key })));
}

/** The line above the link in the reminder, in the member's voice. */
export function reminderNote(key: ReminderKey, expiresDay: string): string {
  return key === "d2"
    ? "Making sure this reached you. It takes a few minutes to read, and you can sign on your phone."
    : key === "d7"
      ? "Following up on this. Happy to answer anything before you sign."
      : `The link to sign closes on ${expiresDay}. If you need more time, reply and I'll send a new one.`;
}
