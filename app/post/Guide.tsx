"use client";

/** First-run checklist, one-line strips (first visit, since your last visit) and the credit banners. */
import type { Me } from "@/lib/tableTypes";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import { IconCheck, IconPlus, IconX } from "../ui/shared";
import { fmtTime, plural } from "./hooks";
import type { Tab } from "./model";

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

/**
 * The credit banner. Out of credits and running low are the one thing that needs the member
 * now, so the strip is outlined in ember. `quiet` when the next-move card is on the page: the
 * card carries the ember, so this strip goes plain. The daily limit is news, never ember.
 */
export function CreditBanner({ me, onShowAdd, onInvite, quiet }: { me: Me; onShowAdd: () => void; onInvite: () => void; quiet?: boolean }) {
  const capped = !!me.earnResetsAt || me.earned24h >= me.earnCap;
  const tone = quiet ? "plain" : "ember";
  if (me.credits <= 0)
    return (
      <Strip
        tone={tone}
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
        {capped
          ? `You're out of credits, and you've earned today's ${me.earnCap}. You can earn again at ${fmtTime(me.earnResetsAt)}.`
          : "You're out of credits. Add a fact that's missing and you earn one back."}
      </Strip>
    );
  // Running low (and still able to earn): say so before it is a dead end.
  if (me.credits <= 3 && !capped)
    return (
      <Strip
        tone={tone}
        actions={
          <button type="button" className="btn btn-sm btn-pine" onClick={onShowAdd}>
            Show facts I can add
          </button>
        }
      >
        You have {plural(me.credits, "credit")} left. Each fact you add earns another.
      </Strip>
    );
  if (capped)
    return (
      <Strip tone="plain">
        You&apos;ve earned today&apos;s {me.earnCap} credits. You can earn again at {fmtTime(me.earnResetsAt)}. What you add before then still saves, and any bonus is held and paid when you have room.
      </Strip>
    );
  return null;
}

export function NoResults({
  q,
  tab,
  noun = "companies",
  onAdd,
  onClear,
  onBrowse,
  filtered,
}: {
  q: string;
  tab: Tab;
  noun?: string;
  onAdd: () => void;
  onClear: () => void;
  onBrowse: () => void;
  filtered: boolean;
}) {
  if (q)
    return (
      <div className="tp-noresults">
        <h3>No match for {q}</h3>
        <p className="muted">If you know the company, add it. You earn a credit for each thing you fill in.</p>
        <div className="tp-noresults-acts">
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <IconPlus size={14} /> Add {q.length > 24 ? "it" : q}
          </button>
          {(filtered || tab !== "all") && (
            <button type="button" className="btn" onClick={onClear}>
              Clear filters
            </button>
          )}
        </div>
      </div>
    );
  if (filtered)
    return (
      <div className="tp-noresults">
        <h3>Nothing matches these filters</h3>
        <p className="muted">Clear a filter to see more, or add a company you know.</p>
        <div className="tp-noresults-acts">
          <button type="button" className="btn" onClick={onClear}>
            Clear filters
          </button>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <IconPlus size={14} /> Add what you know
          </button>
        </div>
      </div>
    );
  // An empty view with no filter set: say how it fills up.
  const copy =
    tab === "following"
      ? { h: "You're not following any companies yet", p: "Open a company and choose Follow. New roles, rates and people there will show up here." }
      : tab === "unlocked"
        ? { h: "You haven't unlocked anything yet", p: "Whatever you unlock stays open for you, and it is listed here." }
        : { h: `No ${noun} in this view yet`, p: "Browse all companies, or add one you know. You earn a credit for each thing you fill in." };
  return (
    <div className="tp-noresults">
      <h3>{copy.h}</h3>
      <p className="muted">{copy.p}</p>
      <div className="tp-noresults-acts">
        <button type="button" className="btn btn-pine" onClick={onBrowse}>
          Browse all companies
        </button>
      </div>
    </div>
  );
}

export const sinceText = (n: number) => `${plural(n, "company", "companies")} you follow ${n === 1 ? "has" : "have"} something new since your last visit.`;
