"use client";

/**
 * The reminders a member sets as they send (the mockup's "When sending: reminders"): three
 * switches, each on unless turned off, for the proposal's send sheet (ProposalParts.tsx SendSheet)
 * and a contract's or document's send (contracts/ContractsHome.tsx, DocBuilder.tsx).
 *
 *   Remind them if it's not opened in 2 days
 *   Remind them if it's opened but not signed in 7 days
 *   Warn them 2 days before the link closes        (not for a link with no end date)
 *
 * Saved with POST /api/activity { op: "reminders", id, d2, d7, expiry } (lib/close/server.ts
 * setReminders, Close) just before the send, so nothing goes out that was switched off. The same
 * switches stay on the proposal's activity panel afterwards (Activity.tsx).
 */
import { useEffect, useState } from "react";
import { REMINDER_SAY } from "@/lib/close/reminders";
import { REMINDER_KEYS, type ReminderKey } from "@/lib/close/types";
import { errorText } from "../ui/shared";
import "./activity.css";

export type ReminderChoice = Record<ReminderKey, boolean>;
export const REMINDERS_ON: ReminderChoice = { d2: true, d7: true, expiry: true };
export const REMINDERS_NOTE = "Reminders come from Merlin on your behalf, in your words, and stop the moment they sign or decline.";

/** The switches as last saved for this proposal or document (all on for a new one), and a setter. */
export function useSendReminders(id: string | null | undefined, enabled = true): [ReminderChoice, (c: ReminderChoice) => void] {
  const [choice, setChoice] = useState<ReminderChoice>(REMINDERS_ON);
  useEffect(() => {
    if (!id || !enabled) return;
    let live = true;
    fetch(`/api/activity?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { remindersOn?: Partial<ReminderChoice> } | null) => {
        if (live && v?.remindersOn) setChoice({ ...REMINDERS_ON, ...v.remindersOn });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, enabled]);
  return [choice, setChoice];
}

/** Save the switches for this proposal or document. Null when saved, else what to tell the member. */
export async function saveReminders(id: string, choice: ReminderChoice): Promise<string | null> {
  try {
    const r = await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "reminders", id, d2: choice.d2, d7: choice.d7, expiry: choice.expiry }) });
    if (r.ok) return null;
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    return errorText(r.status, j.error, "The reminders didn't save. Try again.");
  } catch {
    return "We couldn't reach the server. Check your connection and try again.";
  }
}

export function SendReminders({ value, onChange, noEnd, disabled }: { value: ReminderChoice; onChange: (c: ReminderChoice) => void; /** The link has no end date: no warning before it closes. */ noEnd?: boolean; disabled?: boolean }) {
  return (
    <fieldset className="sr" data-section="send-reminders">
      <legend className="pp-field-l">Reminders until they sign</legend>
      {REMINDER_KEYS.filter((k) => !(noEnd && k === "expiry")).map((k) => (
        <label key={k} className="ac-check">
          <input type="checkbox" checked={value[k]} disabled={disabled} data-reminder={k} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} />
          <span>{REMINDER_SAY[k].why}</span>
        </label>
      ))}
      {noEnd && <p className="pp-muted">No end date, so there is no warning before the link closes.</p>}
      <p className="pp-muted">{REMINDERS_NOTE}</p>
    </fieldset>
  );
}
