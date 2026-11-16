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
  seatsHeld,
  seatsLeft,
  onSeats,
  addLabel,
}: {
  me: Me;
  onUnlock: () => void;
  onAdd: () => void;
  onInvite: () => void;
  onDismiss: () => void;
  vertical?: boolean;
  /** Credits the member can earn today by filling in their own seats (0 when none can earn now). */
  seats?: number;
  /** Seats on file under the member's name, and the facts still missing on them. */
  seatsHeld?: number;
  seatsLeft?: number;
  onSeats?: () => void;
  /** What step 2 does for a member with no seats ("Add a seat you held", or "Add a fact" when a company they know has a gap). */
  addLabel?: string;
}) {
  const paid = me.invitesPaid ?? 0;
  /*
   * A member with seats on file gives there first: it is what they know best. The step is done
   * only once nothing is missing on them, so one answer never reads as finished, and the hint
   * says how many are left and what they earn today.
   */
  const left = seatsLeft ?? 0;
  const earn = seats ?? 0;
  const give =
    seatsHeld && onSeats
      ? {
          done: left === 0,
          label: "Fill in your seats",
          hint: left === 0 ? "all filled in" : earn >= left ? `${left} left, 1 credit each` : earn > 0 ? `${left} left, earns up to ${earn}` : `${left} left to fill`,
          go: onSeats,
          open: true,
          more: true,
        }
      : { done: me.added > 0, label: addLabel ?? "Add a fact", hint: "earns 1 credit", go: onAdd, open: false, more: false };
  // The first unlock shows what a credit buys: who held a seat (an open role, for a member looking for roles).
  const unlockLabel = me.goal === "roles" ? "See an open role" : "See who held a seat";
  const steps = [
    { done: me.unlocked > 0, label: unlockLabel, hint: "costs 1 credit", go: onUnlock, open: false, more: false },
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
              <span className="tp-step-l">
                {/* Under 360px the invite step reads "Invite" (the rest is .tp-step-more), so no word breaks inside itself. */}
                {k === 2 ? (
                  <>
                    Invite<span className="tp-step-more">{s.label.slice("Invite".length)}</span>
                  </>
                ) : (
                  s.label
                )}
              </span>
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
