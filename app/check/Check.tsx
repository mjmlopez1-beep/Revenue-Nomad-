"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import Arrow from "../home/Arrow";
import { hrefs } from "../home/content/links";
import { submitCheck } from "./actions";
import { employeeRanges, levels, pillars, questions, revenueRanges, type Pillar } from "./content";
import type { CheckResult } from "./scoring";
import "./Check.css";

type Step = { kind: "intake" } | { kind: "question"; index: number } | { kind: "lead" } | { kind: "results"; result: CheckResult };

/**
 * The 2-minute Revenue Health Check stepper. Intake (revenue and employee range), seven questions, the lead
 * form, then results from the server action. State lives here; scoring and recording happen on the server.
 */
export default function Check() {
  const [step, setStep] = useState<Step>({ kind: "intake" });
  const [revenue, setRevenue] = useState("");
  const [employees, setEmployees] = useState("");
  const [answers, setAnswers] = useState<Partial<Record<Pillar, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the step heading on each step change so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  if (step.kind === "results") return <Results result={step.result} />;

  if (step.kind === "intake") {
    return (
      <form
        className="chk-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!revenue || !employees) return setError("Choose both so we can read your scores for your stage.");
          go({ kind: "question", index: 0 });
        }}
      >
        <p className="rn-eyebrow">Before we start</p>
        <h2 ref={headingRef} tabIndex={-1} className="chk-h">
          Two things about your company
        </h2>
        <p className="rn-body chk-help">Your stage decides which fixes create the most lift, so the results are read against it.</p>
        <div className="chk-selects">
          <label className="chk-field">
            <span>Company revenue</span>
            <select name="revenue" value={revenue} onChange={(e) => setRevenue(e.target.value)} required>
              <option value="">Choose a range</option>
              {revenueRanges.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="chk-field">
            <span>Company employees</span>
            <select name="employees" value={employees} onChange={(e) => setEmployees(e.target.value)} required>
              <option value="">Choose a range</option>
              {employeeRanges.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="chk-error" role="alert">
            {error}
          </p>
        )}
        <div className="chk-actions">
          <button type="submit" className="rn-btn">
            Start the seven questions
            <Arrow />
          </button>
        </div>
      </form>
    );
  }

  if (step.kind === "question") {
    const q = questions[step.index];
    const chosen = answers[q.pillar];
    const last = step.index === questions.length - 1;
    return (
      <form
        className="chk-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen === undefined) return setError("Pick the answer closest to today.");
          go(last ? { kind: "lead" } : { kind: "question", index: step.index + 1 });
        }}
      >
        <div className="chk-progress">
          <p className="rn-eyebrow" aria-live="polite">
            Question {step.index + 1} of {questions.length}
          </p>
          <ol className="chk-dots" aria-hidden="true">
            {questions.map((_, i) => (
              <li key={i} className={i < step.index ? "is-done" : i === step.index ? "is-current" : ""} />
            ))}
          </ol>
          <p className="chk-pillar">{pillarName(q.pillar)}</p>
        </div>
        <fieldset className="chk-fieldset">
          <legend ref={headingRef as React.RefObject<HTMLLegendElement>} tabIndex={-1} className="chk-h">
            {q.text}
          </legend>
          <ul className="chk-options">
            {q.answers.map((a, i) => (
              <li key={i}>
                <label className={chosen === i ? "chk-option is-chosen" : "chk-option"}>
                  <input
                    type="radio"
                    name={q.pillar}
                    value={i}
                    checked={chosen === i}
                    onChange={() => {
                      setError(null);
                      setAnswers((prev) => ({ ...prev, [q.pillar]: i }));
                    }}
                  />
                  <span>{a}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {error && (
          <p className="chk-error" role="alert">
            {error}
          </p>
        )}
        <div className="chk-actions">
          <button
            type="button"
            className="rn-link chk-back"
            onClick={() => go(step.index === 0 ? { kind: "intake" } : { kind: "question", index: step.index - 1 })}
          >
            Back
          </button>
          <button type="submit" className="rn-btn">
            {last ? "See how to get your results" : "Next"}
            <Arrow />
          </button>
        </div>
      </form>
    );
  }

  // Lead form
  return (
    <form
      className="chk-card"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            const result = await submitCheck({
              revenue,
              employees,
              answers: answers as Record<string, number>,
              firstName: String(data.get("firstName") ?? ""),
              lastName: String(data.get("lastName") ?? ""),
              email: String(data.get("email") ?? ""),
              company: String(data.get("company") ?? ""),
            });
            go({ kind: "results", result });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
          }
        });
      }}
    >
      <p className="rn-eyebrow">Last step</p>
      <h2 ref={headingRef} tabIndex={-1} className="chk-h">
        Where should we send your results?
      </h2>
      <p className="rn-body chk-help">Your scores appear right away. We also send them to this address and may follow up once.</p>
      <div className="chk-grid">
        <label className="chk-field">
          <span>First name</span>
          <input name="firstName" type="text" autoComplete="given-name" required maxLength={80} />
        </label>
        <label className="chk-field">
          <span>Last name</span>
          <input name="lastName" type="text" autoComplete="family-name" required maxLength={80} />
        </label>
        <label className="chk-field chk-field--wide">
          <span>Work email</span>
          <input name="email" type="email" autoComplete="email" required maxLength={160} />
        </label>
        <label className="chk-field chk-field--wide">
          <span>Company (optional)</span>
          <input name="company" type="text" autoComplete="organization" maxLength={120} />
        </label>
      </div>
      <p className="rn-small">No spam, one click to leave.</p>
      {error && (
        <p className="chk-error" role="alert">
          {error}
        </p>
      )}
      <div className="chk-actions">
        <button type="button" className="rn-link chk-back" onClick={() => go({ kind: "question", index: questions.length - 1 })}>
          Back
        </button>
        <button type="submit" className="rn-btn" disabled={pending} aria-busy={pending}>
          {pending ? "Scoring" : "See my results"}
          <Arrow />
        </button>
      </div>
    </form>
  );
}

function pillarName(p: Pillar) {
  return questions.find((q) => q.pillar === p) ? pillarLabelOf(p) : p;
}
function pillarLabelOf(p: Pillar) {
  // Imported lazily to keep the content module the single source for labels.
  const { pillarLabel } = require("./content") as typeof import("./content");
  return pillarLabel[p];
}

function Results({ result }: { result: CheckResult }) {
  const levelName = (lvl: number) => levels.find((l) => l.level === lvl)?.name ?? "";
  return (
    <section className="chk-results" aria-labelledby="chk-results-h">
      <p className="rn-eyebrow">Your results</p>
      <h2 id="chk-results-h" tabIndex={-1} className="chk-h">
        Your revenue engine scores <strong className="chk-total">{result.total}</strong> out of 100
      </h2>
      <p className="rn-body chk-help">
        Each pillar is placed on the Diagnostic&apos;s four levels, from Ad Hoc to Optimized. The two to fix first are
        chosen by your lowest scores and what creates the most lift for a company your size.
      </p>

      <ol className="chk-bars">
        {result.pillars.map((p) => (
          <li key={p.pillar} className="chk-bar">
            <span className="chk-bar-label">{p.label}</span>
            <span className="chk-bar-track" role="img" aria-label={`${p.label}: level ${p.level} of 4, ${levelName(p.level)}`}>
              <span className={`chk-bar-fill chk-bar-fill--${p.level}`} />
            </span>
            <span className="chk-bar-level">
              {p.level} · {levelName(p.level)}
            </span>
          </li>
        ))}
      </ol>

      <h3 className="chk-sub">Fix these first</h3>
      <ol className="chk-fix">
        {result.fixFirst.map((f, i) => (
          <li key={f.pillar} className="chk-fix-item">
            <span className="chk-fix-n">{i + 1}</span>
            <div>
              <h4 className="chk-fix-h">
                {f.label} <span className="chk-fix-level">level {f.level}, {levelName(f.level)}</span>
              </h4>
              <p className="rn-body">{f.line}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="chk-actions chk-actions--results">
        <Link className="rn-btn" href={hrefs.talk}>
          Talk to us about these scores
          <Arrow />
        </Link>
        <Link className="rn-link" href="/engage/diagnostic">
          See the full Revenue Health Diagnostic
          <Arrow size={13} />
        </Link>
      </div>
      <p className="rn-small">
        Seven questions give a first read, not a diagnosis. The Diagnostic scores all {pillars.length} pillars across 21
        building blocks with the evidence behind every score.
      </p>
    </section>
  );
}
