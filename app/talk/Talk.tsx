"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import Arrow from "../home/Arrow";
import { submitTalk, type TalkReceipt } from "./actions";
import { assurances, bookCallUrl, employeeRanges, needs, revenueRanges, starts } from "./content";
import "./Talk.css";

type Step = 1 | 2 | 3 | 4;
type Sent = { kind: "sent"; receipt: TalkReceipt };
type State = { kind: "step"; step: Step } | Sent;

/**
 * Talk to us: four questions (need, company size, start date, contact) then a sent state.
 * Option buttons answer and advance in one tap; number keys 1-9 pick the matching option on the current step.
 */
export default function Talk() {
  const [state, setState] = useState<State>({ kind: "step", step: 1 });
  const [need, setNeed] = useState("");
  const [revenue, setRevenue] = useState("");
  const [employees, setEmployees] = useState("");
  const [start, setStart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, begin] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [state]);

  const step = state.kind === "step" ? state.step : 0;
  const goto = (s: Step) => {
    setError(null);
    setState({ kind: "step", step: s });
  };

  // Number-key shortcuts for the option steps (the artboard's "Press 1 to 8").
  useEffect(() => {
    if (state.kind !== "step" || state.step === 4) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      if (state.step === 1 && needs[n - 1]) pickNeed(needs[n - 1].value);
      if (state.step === 2) {
        if (n <= revenueRanges.length) setRevenue(revenueRanges[n - 1].value);
        else if (revenueRanges.length + employeeRanges.length >= n) setEmployees(employeeRanges[n - 1 - revenueRanges.length].value);
      }
      if (state.step === 3 && starts[n - 1]) pickStart(starts[n - 1].value);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const pickNeed = (v: string) => {
    setNeed(v);
    goto(2);
  };
  const pickStart = (v: string) => {
    setStart(v);
    goto(4);
  };

  const label = (list: readonly { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? "";
  const chips = [need && label(needs, need), revenue && employees && `${label(revenueRanges, revenue)} · ${label(employeeRanges, employees)} people`, start && label(starts, start)].filter(Boolean) as string[];

  if (state.kind === "sent") return <SentState receipt={state.receipt} onRestart={() => { setNeed(""); setRevenue(""); setEmployees(""); setStart(""); goto(1); }} />;

  return (
    <div className="talk-card">
      <div className="talk-top">
        {step > 1 ? (
          <button type="button" className="talk-back" onClick={() => goto((step - 1) as Step)}>
            Back
          </button>
        ) : (
          <Link className="talk-back" href="/">
            Close
          </Link>
        )}
        <span className="talk-count" aria-live="polite">
          Question {step} of 4
        </span>
      </div>
      <ol className="talk-progress" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <li key={i} className={i <= step ? "is-done" : ""} />
        ))}
      </ol>
      {chips.length > 0 && step > 1 && (
        <ul className="talk-chips" aria-label="Your answers so far">
          {chips.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}

      {step === 1 && (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="talk-h">
            Where is revenue stuck right now?
          </h1>
          <p className="talk-help">
            Pick the closest one - our team reads every request. <span className="talk-hint">Press 1 to {needs.length}</span>
          </p>
          <ul className="talk-options talk-options--2">
            {needs.map((n, i) => (
              <li key={n.value}>
                <button type="button" className={need === n.value ? "talk-opt is-chosen" : "talk-opt"} onClick={() => pickNeed(n.value)}>
                  <span className="talk-opt-n" aria-hidden="true">{i + 1}</span>
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {step === 2 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!revenue || !employees) return setError("Pick a revenue band and a people band.");
            goto(3);
          }}
        >
          <h1 ref={headingRef} tabIndex={-1} className="talk-h">
            How big is the company?
          </h1>
          <fieldset className="talk-fieldset">
            <legend className="talk-legend">
              Annual revenue <span className="talk-hint">- the band is enough. Press 1 to {revenueRanges.length}</span>
            </legend>
            <ul className="talk-options talk-options--3">
              {revenueRanges.map((r, i) => (
                <li key={r.value}>
                  <label className={revenue === r.value ? "talk-opt is-chosen" : "talk-opt"}>
                    <input type="radio" name="revenue" value={r.value} checked={revenue === r.value} onChange={() => setRevenue(r.value)} />
                    <span className="talk-opt-n" aria-hidden="true">{i + 1}</span>
                    {r.label}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset className="talk-fieldset">
            <legend className="talk-legend">
              People <span className="talk-hint">- full-time employees. Press {revenueRanges.length + 1} to {revenueRanges.length + employeeRanges.length}</span>
            </legend>
            <ul className="talk-options talk-options--3">
              {employeeRanges.map((r, i) => (
                <li key={r.value}>
                  <label className={employees === r.value ? "talk-opt is-chosen" : "talk-opt"}>
                    <input type="radio" name="employees" value={r.value} checked={employees === r.value} onChange={() => setEmployees(r.value)} />
                    <span className="talk-opt-n" aria-hidden="true">{revenueRanges.length + i + 1}</span>
                    {r.label}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          {error && <p className="talk-error" role="alert">{error}</p>}
          <div className="talk-actions">
            <button type="submit" className="rn-btn rn-btn--leaf">
              Next
              <Arrow />
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="talk-h">
            When does the leader need to start?
          </h1>
          <p className="talk-help">
            <span className="talk-hint">Press 1 to {starts.length}</span>
          </p>
          <ul className="talk-options talk-options--2">
            {starts.map((s, i) => (
              <li key={s.value}>
                <button type="button" className={start === s.value ? "talk-opt is-chosen" : "talk-opt"} onClick={() => pickStart(s.value)}>
                  <span className="talk-opt-n" aria-hidden="true">{i + 1}</span>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {step === 4 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setError(null);
            begin(async () => {
              try {
                const receipt = await submitTalk({
                  need,
                  revenue,
                  employees,
                  start,
                  name: String(data.get("name") ?? ""),
                  email: String(data.get("email") ?? ""),
                  company: String(data.get("company") ?? ""),
                  title: String(data.get("title") ?? ""),
                  note: String(data.get("note") ?? ""),
                });
                setState({ kind: "sent", receipt });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
              }
            });
          }}
        >
          <h1 ref={headingRef} tabIndex={-1} className="talk-h">
            Where should we reach you?
          </h1>
          <div className="talk-grid">
            <label className="talk-field">
              <span>Your name</span>
              <input name="name" type="text" autoComplete="name" required maxLength={120} />
            </label>
            <label className="talk-field">
              <span>Work email</span>
              <input name="email" type="email" autoComplete="email" required maxLength={160} />
            </label>
            <label className="talk-field">
              <span>
                Company <em>Optional</em>
              </span>
              <input name="company" type="text" autoComplete="organization" maxLength={120} />
            </label>
            <label className="talk-field">
              <span>
                Title <em>Optional</em>
              </span>
              <input name="title" type="text" autoComplete="organization-title" maxLength={80} />
            </label>
            <label className="talk-field talk-field--wide">
              <span>
                What are you looking for? <em>Optional</em>
              </span>
              <textarea name="note" rows={3} maxLength={1000} placeholder="For example: founder hand-off - I am still closing every deal myself and we want a leader who can take the number in 90 days." />
            </label>
          </div>
          {error && <p className="talk-error" role="alert">{error}</p>}
          <div className="talk-actions talk-actions--send">
            <button type="submit" className="rn-btn rn-btn--leaf" disabled={pending} aria-busy={pending}>
              {pending ? "Sending" : "Send request"}
              <Arrow />
            </button>
            <p className="talk-fine">A person speaks with you within 24 hours. No sales sequence, and no fees for companies.</p>
          </div>
        </form>
      )}

      {step !== 4 && (
        <aside className="talk-aside">
          <ul className="talk-assure" aria-label="What to expect">
            {assurances.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {bookCallUrl && (
            <div className="talk-now">
              <p className="talk-now-k">Rather talk now?</p>
              <p className="talk-now-b">Someone on our team who has sat in your seat. Weekdays, 9am to 6pm Eastern.</p>
              <a className="rn-btn rn-btn--sm rn-btn--outline-light" href={bookCallUrl} target="_blank" rel="noopener noreferrer">
                Book a call
              </a>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function SentState({ receipt, onRestart }: { receipt: TalkReceipt; onRestart: () => void }) {
  const s = receipt.summary;
  return (
    <div className="talk-card talk-card--sent">
      <div className="talk-top">
        <button type="button" className="talk-back" onClick={onRestart}>
          Start a new request
        </button>
        <span className="talk-count">Sent</span>
      </div>
      <ol className="talk-progress" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <li key={i} className="is-done" />
        ))}
      </ol>
      <h1 tabIndex={-1} className="talk-h" autoFocus>
        Got it, {receipt.firstName}. A person is on it.
      </h1>
      <p className="talk-help talk-help--sent">
        You will hear from us at {receipt.email} - we speak within 24 hours.{bookCallUrl ? " Want to move faster? Book a call now." : ""}
      </p>
      <div className="talk-sent-grid">
        {bookCallUrl && (
          <div className="talk-sent-card">
            <p className="talk-now-k">Book a call</p>
            <p className="talk-now-b">30 minutes with someone on our team who has sat in your seat.</p>
            <a className="rn-btn rn-btn--sm" href={bookCallUrl} target="_blank" rel="noopener noreferrer">
              Pick a time
            </a>
          </div>
        )}
        <div className="talk-sent-card">
          <p className="talk-now-k">Your request</p>
          <ul className="talk-summary">
            <li>Need - {s.need}</li>
            <li>Revenue - {s.revenue}</li>
            <li>People - {s.employees}</li>
            <li>Start - {s.start}</li>
            {s.note && <li>Looking for - {s.note}</li>}
          </ul>
        </div>
      </div>
      <p className="talk-fine">
        <Link href="/">Back to the homepage</Link>
      </p>
    </div>
  );
}
