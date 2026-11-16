"use client";

/** The Get started checklist and the one-line strip (first visit, an invite bonus waiting, running low, since your last visit). */
import type { Me } from "@/lib/tableTypes";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import { IconCheck, IconX } from "../ui/shared";
import { plural } from "./hooks";

export function Checklist({
  me,
  onUnlock,
  onAdd,
  onInvite,
  onDismiss,
  vertical,
  seats,
  onSeats,
}: {
  me: Me;
  onUnlock: () => void;
  onAdd: () => void;
  onInvite: () => void;
  onDismiss: () => void;
  vertical?: boolean;
  /** Credits the member can earn today by filling in their own seats (0 when they hold none, or all are full). */
  seats?: number;
  onSeats?: () => void;
}) {
  const paid = me.invitesPaid ?? 0;
  // A member with seats on file gives there first: it is what they know best.
  const give =
    seats && onSeats
      ? { done: me.added > 0, label: "Fill in your seats", hint: seats === 1 ? "earns 1 credit" : `earns up to ${seats} credits`, go: onSeats, open: true, more: true }
      : { done: me.added > 0, label: "Add a fact", hint: "earns 1 credit", go: onAdd, open: false, more: false };
  const steps = [
    { done: me.unlocked > 0, label: "Unlock a fact", hint: "costs 1 credit", go: onUnlock, open: false, more: false },
    give,
    // Done once an invitee's first fact paid the bonus, not when they merely joined.
    { done: paid > 0, label: me.invited > paid ? `Invite a fractional, ${me.invited} joined` : "Invite a fractional", hint: `${REFERRAL_BONUS} credits each`, go: onInvite, open: true, more: false },
  ];
  const n = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  // Dismissable at any time; the X sits at the end of the row (top right on phones).
  const close = (
    <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm tp-check-x" aria-label="Hide Get started" title="Hide Get started" onClick={onDismiss}>
      <IconX size={14} />
    </button>
  );
  return (
    <section className={`tp-check-card${vertical ? " vertical" : ""}`} aria-label="Get started">
      <div className="tp-check-head">
        <span className="tp-check-title">Get started</span>
        <span className="tp-check-n num">
          {n} of {steps.length} done
        </span>
        {vertical && close}
      </div>
      <ol className="tp-steps">
        {steps.map((s, k) => (
          <li key={k}>
            <button type="button" className={`tp-step${s.done ? " done" : ""}${s.done && s.more ? " ys-more" : ""}${k === next ? " next" : ""}`} onClick={s.go} disabled={s.done && !s.open}>
              <span className="tp-step-dot" aria-hidden>
                {s.done ? <IconCheck size={11} /> : <span className="num">{k + 1}</span>}
              </span>
              <span className="tp-step-l">{s.label}</span>
              <span className="tp-step-h num">{s.hint}</span>
            </button>
          </li>
        ))}
      </ol>
      {!vertical && close}
    </section>
  );
}

/** One calm line with at most one action. Never ember: the balance in the top bar and the next-move card carry that. */
export function Strip({ children, onClose, actions }: { children: React.ReactNode; onClose?: () => void; actions?: React.ReactNode }) {
  return (
    <div className="tp-strip" role="status">
      <span className="tp-strip-t">{children}</span>
      {actions && <span className="tp-strip-acts">{actions}</span>}
      {onClose && (
        <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm" aria-label="Dismiss" onClick={onClose}>
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}

export const sinceText = (n: number) => `${plural(n, "company", "companies")} you follow ${n === 1 ? "has" : "have"} something new since your last visit.`;
