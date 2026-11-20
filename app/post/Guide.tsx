"use client";

/** The Get started checklist and the one-line strip (first visit, an invite bonus waiting, running low, since your last visit). */
import { useState } from "react";
import type { Me } from "@/lib/tableTypes";
import { IconCheck, IconChevron, IconX } from "../ui/shared";
import { plural, store } from "./hooks";
import type { CheckStep } from "./model";
import { startSteps, type StepOne } from "./getStarted";

export function Checklist({
  me,
  onUnlock,
  onAdd,
  onInvite,
  onDismiss,
  vertical,
  compact,
  seats,
  seatsHeld,
  seatsLeft,
  onSeats,
  stepOne,
  seen,
}: {
  me: Me;
  onUnlock: () => void;
  /** Step 2, "Find your seats": the search for seats the member held. */
  onAdd: () => void;
  onInvite: () => void;
  onDismiss: () => void;
  vertical?: boolean;
  /**
   * Phones: one line, so the first record is on the first screen. It names the next step and
   * runs it on a tap; the chevron opens every step.
   */
  compact?: boolean;
  /** Credits the member can earn today by filling in their own seats (0 when none can earn now). */
  seats?: number;
  /** Seats on file under the member's name, and the facts still missing on them. */
  seatsHeld?: number;
  seatsLeft?: number;
  onSeats?: () => void;
  /** What step 1 can point at in the member's table (app/post/getStarted.ts). */
  stepOne?: StepOne;
  /** The table shows a seat holder (or, for that step, a person) the member paid to see: step 1 is done. */
  seen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // A done step stays done in this browser, so the count never goes backwards (a refund, a removed fact).
  const doneKey = `tp_check_done_${me.id}`;
  const stuck = new Set((store.get(doneKey) ?? "").split(",").filter(Boolean));
  // Step 1 is "Unlock a company" and stays that once done (startSteps): "See who held a seat" is only ever the next nudge.
  const plan = startSteps(me, { seatsHeld: onSeats ? seatsHeld ?? 0 : 0, seatsLeft: seatsLeft ?? 0, earn: seats ?? 0, stuck, seen, stepOne });
  const go: Record<CheckStep["key"], () => void> = { unlock: onUnlock, seat: onAdd, invite: onInvite };
  const steps = plan.steps.map((x) => ({ ...x, go: go[x.key], open: x.key === "invite" }));
  // "Fill in your seats" takes the place of the done step 2, so the strip never holds four items.
  const nudge = plan.next?.action === "fillSeats" ? plan.next : null;
  const nowDone = steps.filter((x) => x.done).map((x) => x.key);
  if (nowDone.some((k) => !stuck.has(k))) store.set(doneKey, nowDone.join(","));
  const n = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  // Dismissable at any time; the X sits at the end of the row (top right on phones).
  const close = (
    <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm tp-check-x" aria-label="Hide Get started" title="Hide Get started" onClick={onDismiss}>
      <IconX size={14} />
    </button>
  );
  if (compact && !open) {
    // The next step, else the nudge once every step is done.
    const up = next >= 0 ? steps[next] : null;
    const label = up ? up.label : nudge ? nudge.label : "You've done every step";
    const hint = up ? up.hint : nudge ? nudge.hint : "";
    const run = up ? up.go : nudge ? onSeats : undefined;
    return (
      <section className="tp-check-card tp-check-compact" aria-label="Get started">
        <button type="button" className="tp-check-line" onClick={run} disabled={!run} aria-label={`Get started. Next: ${label}${hint ? `, ${hint}` : ""}`}>
          <span className="tp-check-title">Get started</span>
          <span className="tp-check-next" aria-hidden>
            {label}
          </span>
        </button>
        <button type="button" className="tp-check-count" aria-label={`${n} of ${steps.length} done. Show every step`} aria-expanded={false} onClick={() => setOpen(true)}>
          <span className="num">
            {n}/{steps.length}
          </span>
          <IconChevron dir="down" size={14} />
        </button>
        {close}
      </section>
    );
  }
  return (
    <section className={`tp-check-card${vertical ? " vertical" : ""}`} aria-label="Get started">
      <div className="tp-check-head">
        <span className="tp-check-title">Get started</span>
        <span className="tp-check-n num">
          {n} of {steps.length} done
        </span>
        {compact && (
          <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm tp-check-more" aria-label="Show fewer steps" aria-expanded onClick={() => setOpen(false)}>
            <IconChevron dir="up" size={14} />
          </button>
        )}
        {vertical && close}
      </div>
      <ol className="tp-steps">
        {steps.map((s, k) => (
          <li key={s.key}>
            {s.key === "seat" && nudge ? (
              <button type="button" className="tp-check-nudge" onClick={onSeats} aria-label={`Step ${k + 1} is done. Next: ${nudge.label}, ${nudge.hint}`}>
                {/* An arrow, not a tick: this is the next thing to do, not a thing done. */}
                <span className="tp-step-dot" aria-hidden>
                  <IconChevron dir="right" size={11} />
                </span>
                <span className="tp-step-l">{nudge.label}</span>
                <span className="tp-step-h num">{nudge.hint}</span>
              </button>
            ) : (
            <button type="button" className={`tp-step${s.done ? " done" : ""}${k === next ? " next" : ""}`} onClick={s.go} disabled={s.done && !s.open}>
              <span className="tp-step-dot" aria-hidden>
                {s.done ? <IconCheck size={11} /> : <span className="num">{k + 1}</span>}
              </span>
              <span className="tp-step-l">
                {/* Under 360px the invite step reads "Invite" (the rest is .tp-step-more), so no word breaks inside itself. */}
                {s.key === "invite" ? (
                  <>
                    Invite<span className="tp-step-more">{s.label.slice("Invite".length)}</span>
                  </>
                ) : (
                  s.label
                )}
              </span>
              <span className="tp-step-h num">{s.hint}</span>
            </button>
            )}
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
