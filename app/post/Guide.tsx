"use client";

/** First-run checklist, one-line strips (first visit, since your last visit) and the credit banners. */
import type { Me } from "@/lib/tableTypes";
import { IconCheck, IconPlus, IconX } from "../ui/shared";
import { fmtTime, plural } from "./hooks";

export function Checklist({
  me,
  onUnlock,
  onAdd,
  onInvite,
  onDismiss,
  vertical,
}: {
  me: Me;
  onUnlock: () => void;
  onAdd: () => void;
  onInvite: () => void;
  onDismiss: () => void;
  vertical?: boolean;
}) {
  const steps = [
    { done: me.unlocked > 0, label: "Unlock a fact", hint: "1 credit", go: onUnlock },
    { done: me.added > 0, label: "Add a fact", hint: "+1 credit", go: onAdd },
    { done: me.invited > 0, label: "Invite a fractional", hint: "+10 each", go: onInvite },
  ];
  const n = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className={`tp-check-card${vertical ? " vertical" : ""}`} aria-label="Get started">
      <div className="tp-check-head">
        <span className="tp-check-title">Get started</span>
        <span className="mono tp-check-n">
          {n} of {steps.length}
        </span>
        {n === steps.length && (
          <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm" aria-label="Hide checklist" onClick={onDismiss}>
            <IconX size={14} />
          </button>
        )}
      </div>
      <ol className="tp-steps">
        {steps.map((s, k) => (
          <li key={s.label}>
            <button type="button" className={`tp-step${s.done ? " done" : ""}${k === next ? " next" : ""}`} onClick={s.go} disabled={s.done && k !== 2}>
              <span className="tp-step-dot" aria-hidden>
                {s.done ? <IconCheck size={11} /> : <span className="mono">{k + 1}</span>}
              </span>
              <span className="tp-step-l">{s.label}</span>
              <span className="tp-step-h mono">{s.hint}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Strip({ children, onClose, tone = "plain", actions }: { children: React.ReactNode; onClose?: () => void; tone?: "plain" | "ember" | "volt"; actions?: React.ReactNode }) {
  return (
    <div className={`tp-strip tp-strip-${tone}`} role="status">
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

export function CreditBanner({ me, onShowAdd, onInvite }: { me: Me; onShowAdd: () => void; onInvite: () => void }) {
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  if (me.credits <= 0)
    return (
      <Strip
        tone="ember"
        actions={
          <>
            <button type="button" className="btn btn-sm btn-pine" onClick={onShowAdd}>
              Show facts I can add
            </button>
            <button type="button" className="btn btn-sm" onClick={onInvite}>
              Invite a fractional
            </button>
          </>
        }
      >
        You are out of credits. Add a fact to earn one back.
      </Strip>
    );
  if (capped)
    return (
      <Strip tone="ember">
        You earned today&apos;s {me.earnCap}. Earning reopens at {fmtTime(me.earnResetsAt)}. Facts you add still count when others confirm them.
      </Strip>
    );
  return null;
}

export function NoResults({ q, onAdd, onClear, filtered }: { q: string; onAdd: () => void; onClear: () => void; filtered: boolean }) {
  return (
    <div className="tp-noresults">
      {q ? (
        <>
          <h3>No match for {q}</h3>
          <p className="muted">Add it and earn a credit for each fact.</p>
          <div className="tp-noresults-acts">
            <button type="button" className="btn btn-primary" onClick={onAdd}>
              <IconPlus size={14} /> Add {q.length > 24 ? "it" : q}
            </button>
            {filtered && (
              <button type="button" className="btn" onClick={onClear}>
                Clear filters
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <h3>Nothing matches these filters</h3>
          <p className="muted">Clear a filter, or add a company you know and earn a credit for each fact.</p>
          <div className="tp-noresults-acts">
            <button type="button" className="btn" onClick={onClear}>
              Clear filters
            </button>
            <button type="button" className="btn btn-primary" onClick={onAdd}>
              <IconPlus size={14} /> Add what you know
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export const sinceText = (n: number) => `${plural(n, "company", "companies")} you follow ${n === 1 ? "has" : "have"} new facts since your last visit.`;
