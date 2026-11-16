"use client";

/**
 * The Pro waitlist offer. The pilot is free: this only measures who wants more, and where
 * they were when they asked. No price, no deadline.
 *
 * Signals (see Action "signal" in lib/tableTypes.ts):
 *   pro_view      the offer rendered at a place, once per place per browser session
 *   pro_interest  the member asked to be told (the server keeps it once per member)
 *   wall          a member with 0 credits tapped a lock
 */
import { useEffect, useState } from "react";
import { IconCheck, post } from "../ui/shared";
import "./seats.css";

export type ProWhere = "zero_credits" | "hidden_company" | "my_credits" | "hiring_tab";
type SignalName = "wall" | "pro_view" | "pro_interest";

/** Send a product signal. It changes nothing on screen, so nothing waits on it or refreshes after it. */
export function sendSignal(name: SignalName, where: string) {
  void post({ action: { type: "signal", name, where } });
}

/** Places that already counted a view in this tab (session storage can be blocked). */
const viewed = new Set<string>();
function firstView(where: string): boolean {
  if (viewed.has(where)) return false;
  viewed.add(where);
  const key = `tp_pro_view_${where}`;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* blocked storage: the set above still keeps it to once per page load */
  }
  return true;
}

export const PRO_TITLE = "Pro is coming";
export const PRO_LINE = "Open roles the week they post. Every hiring company unlocked. Alerts for your function.";
export const PRO_DONE = "You're on the list. We'll email you when it opens.";

/**
 * `listed` is Me.proInterest. `onAsk` sends pro_interest and resolves true when it was saved.
 * "card" stands on its own (My credits, the foot of Hiring now); "line" is the quiet form
 * that sits under another action (the zero-credits popover, a hidden company's record).
 */
export function ProOffer({
  where,
  listed,
  onAsk,
  variant = "card",
}: {
  where: ProWhere;
  listed: boolean;
  onAsk: (where: ProWhere) => Promise<boolean>;
  variant?: "card" | "line";
}) {
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const on = listed || asked;
  useEffect(() => {
    // Someone already on the list sees the confirmation, not the offer.
    if (!listed && firstView(where)) sendSignal("pro_view", where);
  }, [where, listed]);
  const ask = async () => {
    setBusy(true);
    const ok = await onAsk(where);
    setBusy(false);
    if (ok) setAsked(true);
  };
  const done = (
    <span className="pro-done" role="status">
      <IconCheck size={13} /> {PRO_DONE}
    </span>
  );
  if (variant === "line")
    return (
      <div className="pro-line" data-pro={where}>
        <p className="pro-line-t">
          <strong>{PRO_TITLE}.</strong> {PRO_LINE}
        </p>
        {on ? (
          done
        ) : (
          <button type="button" className="pro-link" disabled={busy} onClick={ask}>
            Tell me when it&apos;s ready
          </button>
        )}
      </div>
    );
  return (
    <section className="pro-card" aria-label={PRO_TITLE} data-pro={where}>
      <div className="pro-card-t">
        <h3 className="pro-card-h">{PRO_TITLE}</h3>
        <p className="pro-card-p">{PRO_LINE}</p>
      </div>
      {on ? (
        done
      ) : (
        <button type="button" className="btn btn-sm pro-btn" disabled={busy} onClick={ask}>
          Tell me when it&apos;s ready
        </button>
      )}
    </section>
  );
}
