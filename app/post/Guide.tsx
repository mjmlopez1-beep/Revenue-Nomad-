"use client";

/** The Get started checklist and the one-line strip (first visit, an invite bonus waiting, running low, since your last visit). */
import type { Me } from "@/lib/tableTypes";
import { IconCheck, IconX } from "../ui/shared";
import { plural, store } from "./hooks";
import { checkSteps, type CheckStep } from "./model";

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
}: {
  me: Me;
  onUnlock: () => void;
  /** Step 2, "Add a seat you held": the form for a seat they held. */
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
}) {
  // A done step stays done in this browser, so the count never goes backwards (a refund, a removed fact).
  const doneKey = `tp_check_done_${me.id}`;
  const stuck = new Set((store.get(doneKey) ?? "").split(",").filter(Boolean));
  const plan = checkSteps(me, { seatsHeld: onSeats ? seatsHeld ?? 0 : 0, seatsLeft: seatsLeft ?? 0, earn: seats ?? 0, stuck });
  const go: Record<CheckStep["key"], () => void> = { unlock: onUnlock, seat: onAdd, invite: onInvite };
  const steps = plan.steps.map((x) => ({ ...x, go: go[x.key], open: x.key === "invite" }));
  // "Fill in your seats" takes the place of the done step 2, so the strip never holds four items.
  const nudge = plan.nudge;
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
            {k === 1 && nudge ? (
              <button type="button" className="tp-check-nudge" onClick={onSeats} aria-label={`Step 2 is done. Next: ${nudge.label}, ${nudge.hint}`}>
                <span className="tp-step-dot" aria-hidden>
                  <IconCheck size={11} />
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
