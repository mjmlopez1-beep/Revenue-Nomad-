"use client";

/**
 * Getting started in the new look (BUILD_PLAN F6, getStarted.ts sixSteps): the rail's card
 * ("2 of 5 done", a tick per step, "Next: Open your first company"), and the list Home shows
 * (each step with what it takes, what it gives, the time, and its button). Every tick is derived
 * from what the member has; step 6 (evidence) is Close only (left out without it).
 */
import type { SixKey, SixSteps } from "../getStarted";
import { sixLine } from "../getStarted";
import "./shell.css";

/** The rail's card. A click runs the next step. */
export function GettingStartedCard({ six, onClick }: { six: SixSteps; onClick: () => void }) {
  const line = sixLine(six);
  return (
    <button type="button" className="ws-start" onClick={onClick} aria-label={`Getting started, ${line}${six.next ? `. Next: ${six.next.label}` : ""}`}>
      <span className="ws-start-h">
        <strong>Getting started</strong>
        <span>{line}</span>
      </span>
      <span className="ws-ticks" aria-hidden>
        {six.steps.map((s) => (
          <span key={s.key} className={s.done ? "on" : ""} />
        ))}
      </span>
      {six.next && (
        <span className="ws-start-next">
          Next: <strong>{six.next.label}</strong>
        </span>
      )}
    </button>
  );
}

/** The steps as a list (Home), with each one's button. `onHide` closes the list. */
export function GettingStartedList({ six, onRun, onHide }: { six: SixSteps; onRun: (k: SixKey) => void; onHide?: () => void }) {
  return (
    <section className="ws-steps" aria-labelledby="ws-steps-h">
      <div className="ws-steps-head">
        <h2 id="ws-steps-h">Getting started</h2>
        <span className="ws-steps-sub num">
          {sixLine(six)}
          {six.minutes > 0 ? ` · about ${six.minutes} minutes left` : ""}
        </span>
        {onHide && (
          <button type="button" className="tp-flink" onClick={onHide}>
            Hide
          </button>
        )}
      </div>
      <ol className="ws-steps-ol">
        {six.steps.map((s) => (
          <li key={s.key} className={s.done ? "done" : ""}>
            <span className="ws-step-n num" aria-hidden>
              {s.done ? (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : (
                s.n
              )}
            </span>
            <span className="ws-step-t">
              <strong>
                {s.label}
                {s.done && <span className="sr-only"> (done)</span>}
              </strong>
              <span>{s.takes}</span>
              <span className="ws-step-gives">{s.gives}</span>
            </span>
            <span className="ws-step-side">
              {s.pill && <span className={`ws-pill ws-pill-${s.pillKind === "earn" ? "new" : "free"}`}>{s.pill}</span>}
              <span className="ws-step-time">{s.time}</span>
              <button type="button" className={`btn btn-sm ${s.done ? "" : "btn-pine"}`} onClick={() => onRun(s.key)}>
                {s.go}
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
