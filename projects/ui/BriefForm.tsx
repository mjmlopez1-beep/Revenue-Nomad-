import { useMemo, useState } from "react";
import type { Project, State } from "../lib/types";
import { OPERATORS, displayName } from "../lib/data";
import { briefFromProject, fitScore, seatCategory } from "../lib/fit";
import { MAX_SCREENING, opState, type BriefErrors } from "../lib/store";
import { Avatar, FieldError, FitParts, FitScore } from "./common";

export type BriefDraft = Project;

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  "Sales Leadership": ["How have you handed off founder-led sales?", "How do you design quota and comp for a first sales team?"],
  "Revenue Operations": ["Which CRM migrations have you owned?", "How do you run a weekly forecast call?"],
  Marketing: ["Which channel did you scale from zero last?", "How do you report pipeline sourced by marketing?"],
};

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(/[$,]/g, ""));
  return isNaN(n) ? NaN : n;
}

/** Best-effort prefill from a pasted job description, SOW or call notes. */
export function prefillFromText(text: string): Partial<Project> {
  const out: Partial<Project> = {};
  const title = text.match(/(fractional|interim)\s+[a-z &/]+?(?=[\n.,(]|$)/i);
  if (title) out.title = title[0].trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bOf\b/g, "of");
  const hrs = text.match(/(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*(?:hrs|hours)/i);
  if (hrs) {
    out.hoursPerMonthMin = Number(hrs[1]);
    out.hoursPerMonthMax = Number(hrs[2]);
  }
  const budget = text.match(/\$(\d{2,4})\s*(?:-|–|to)\s*\$?(\d{2,4})/);
  if (budget) {
    out.budgetMin = Number(budget[1]);
    out.budgetMax = Number(budget[2]);
  }
  const term = text.match(/(\d{1,2})[- ]month/i);
  if (term) out.term = `${term[1]} months`;
  return out;
}

export function BriefFields({
  draft,
  set,
  errors,
  showBudget = true,
}: {
  draft: BriefDraft;
  set: (patch: Partial<Project>) => void;
  errors: BriefErrors;
  showBudget?: boolean;
}) {
  const [tag, setTag] = useState("");
  const [paste, setPaste] = useState("");
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const cat = seatCategory(draft.title || "");
  const suggestions = (SUGGESTED_QUESTIONS[cat] || SUGGESTED_QUESTIONS["Sales Leadership"]).filter((q) => !draft.screeningQuestions.includes(q));
  const qs = draft.screeningQuestions;
  return (
    <>
      <details className="card paste">
        <summary>
          <b>Start from what you have</b> <span className="muted">Optional. Paste a job description, SOW or call notes to prefill the fields below</span>
        </summary>
        <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Paste a job description" />
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const p = prefillFromText(paste);
              set(p);
              setPrefilled(Object.keys(p).length ? `Prefilled ${Object.keys(p).length} field${Object.keys(p).length === 1 ? "" : "s"}. Check them below.` : "Nothing to prefill from that text.");
            }}
          >
            Prefill
          </button>
          {prefilled && <span className="muted" role="status">{prefilled}</span>}
        </div>
      </details>

      <section className="card form-card" aria-labelledby="seat-h">
        <h2 id="seat-h">The seat</h2>
        <label className="field">
          <span>Role</span>
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Fractional VP of Sales" aria-invalid={!!errors.title} aria-describedby="err-title" data-testid="f-title" />
          <FieldError msg={errors.title} id="err-title" />
        </label>
        <label className="field">
          <span>What does success look like in 90 days</span>
          <textarea rows={3} value={draft.successIn90Days} onChange={(e) => set({ successIn90Days: e.target.value })} aria-invalid={!!errors.successIn90Days} data-testid="f-success" />
          <FieldError msg={errors.successIn90Days} />
        </label>
        <div className="grid-fields">
          <fieldset className="field">
            <legend>Hours a month</legend>
            <div className="range">
              <input type="number" min={1} value={draft.hoursPerMonthMin ?? ""} onChange={(e) => set({ hoursPerMonthMin: num(e.target.value) as number })} aria-label="Hours a month, minimum" data-testid="f-hmin" aria-invalid={!!errors.hours} />
              <span>to</span>
              <input type="number" min={1} value={draft.hoursPerMonthMax ?? ""} onChange={(e) => set({ hoursPerMonthMax: num(e.target.value) as number })} aria-label="Hours a month, maximum" data-testid="f-hmax" aria-invalid={!!errors.hours} />
            </div>
            <FieldError msg={errors.hours} />
          </fieldset>
          <label className="field">
            <span>Term</span>
            <input value={draft.term} onChange={(e) => set({ term: e.target.value })} />
          </label>
          <label className="field">
            <span>Target start</span>
            <input type="date" value={draft.startTarget} onChange={(e) => set({ startTarget: e.target.value })} />
          </label>
          {showBudget && (
            <fieldset className="field">
              <legend>Budget, $ per hour</legend>
              <div className="range">
                <input type="number" min={1} value={draft.budgetMin ?? ""} onChange={(e) => set({ budgetMin: num(e.target.value) })} aria-label="Budget minimum per hour" data-testid="f-bmin" aria-invalid={!!errors.budget} />
                <span>to</span>
                <input type="number" min={1} value={draft.budgetMax ?? ""} onChange={(e) => set({ budgetMax: num(e.target.value) })} aria-label="Budget maximum per hour" data-testid="f-bmax" aria-invalid={!!errors.budget} />
              </div>
              <FieldError msg={errors.budget} />
            </fieldset>
          )}
          <label className="field span2">
            <span>Location</span>
            <input value={draft.location} onChange={(e) => set({ location: e.target.value })} />
          </label>
        </div>

        <div className="field">
          <span className="field-l">Must-haves</span>
          <div className="chips">
            {draft.mustHaves.map((m) => (
              <span key={m} className="chip chip-v">
                {m}
                <button type="button" className="chip-x" aria-label={`Remove ${m}`} onClick={() => set({ mustHaves: draft.mustHaves.filter((x) => x !== m) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="row">
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a must-have" aria-label="Add a must-have" onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (tag.trim() && !draft.mustHaves.includes(tag.trim())) set({ mustHaves: [...draft.mustHaves, tag.trim()] });
                setTag("");
              }
            }} />
            <button type="button" className="btn" onClick={() => {
              if (tag.trim() && !draft.mustHaves.includes(tag.trim())) set({ mustHaves: [...draft.mustHaves, tag.trim()] });
              setTag("");
            }}>
              Add
            </button>
          </div>
        </div>

        <div className="field" data-testid="screening">
          <span className="field-l">Screening questions</span>
          <p className="muted">Interested operators answer these before they reach your slate. Up to {MAX_SCREENING}. Answers are not scored yet.</p>
          <ol className="questions">
            {qs.map((q, i) => (
              <li key={i}>
                <textarea
                  rows={2}
                  value={q}
                  aria-label={`Screening question ${i + 1}`}
                  onChange={(e) => set({ screeningQuestions: qs.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <button type="button" className="btn ghost btn-sm" onClick={() => set({ screeningQuestions: qs.filter((_x, j) => j !== i) })} aria-label={`Remove question ${i + 1}`}>
                  Remove
                </button>
              </li>
            ))}
          </ol>
          <FieldError msg={errors.screeningQuestions} id="err-screening" />
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => set({ screeningQuestions: [...qs, ""] })} data-testid="add-question">
              Add a question
            </button>
            {suggestions.length > 0 && <span className="muted">Suggested:</span>}
            {suggestions.map((sq) => (
              <button key={sq} type="button" className="chip chip-btn" onClick={() => set({ screeningQuestions: [...qs, sq] })}>
                + {sq}
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function useLiveMatch(s: State, draft: BriefDraft) {
  return useMemo(() => {
    const hmin = Number(draft.hoursPerMonthMin) || 0;
    const hmax = Number(draft.hoursPerMonthMax) || hmin;
    const brief = briefFromProject({ ...draft, hoursPerMonthMin: hmin, hoursPerMonthMax: hmax });
    const scored = OPERATORS.map((o) => ({ o, f: fitScore(o, brief) })).sort((a, b) => b.f.fit - a.f.fit || (a.o.id < b.o.id ? -1 : 1));
    const rated = OPERATORS.filter((o) => o.rate != null).map((o) => o.rate as number).sort((a, b) => a - b);
    const median = rated.length ? (rated.length % 2 ? rated[(rated.length - 1) / 2] : (rated[rated.length / 2 - 1] + rated[rated.length / 2]) / 2) : null;
    return {
      brief,
      scored,
      n70: scored.filter((x) => x.f.fit >= 70).length,
      availableNow: OPERATORS.filter((o) => {
        const st = opState(s, o.id);
        return st.availability ? st.availability === "open" : /now/i.test(o.avail);
      }).length,
      rateInside: OPERATORS.filter((o) => o.rate != null && o.rate >= brief.rmin && o.rate <= brief.rmax).length,
      hoursOpen: OPERATORS.filter((o) => (o.hrs || 0) >= hmin).length,
      noRate: OPERATORS.filter((o) => o.rate == null).length,
      median,
      hmin,
    };
  }, [s, draft]);
}

export function LiveMatch({ s, draft, rn }: { s: State; draft: BriefDraft; rn?: boolean }) {
  const m = useLiveMatch(s, draft);
  const range = rn ? `at or under $${draft.operatorRate ?? "?"}` : `$${draft.budgetMin ?? "?"} to $${draft.budgetMax ?? "?"}`;
  return (
    <aside className="card live-match" aria-labelledby="lm-h" data-testid="live-match">
      <div className="eyebrow">
        <span className="live-dot" aria-hidden="true" />
        Live match
      </div>
      <h2 id="lm-h" className="lm-big">
        <b data-testid="lm-70">{m.n70}</b> of {OPERATORS.length} live profiles score 70+ on this brief
      </h2>
      <dl className="facts">
        <div>
          <dt>Available now</dt>
          <dd data-testid="lm-available">{m.availableNow}</dd>
        </div>
        <div>
          <dt>Rate listed and inside budget</dt>
          <dd data-testid="lm-rate">{m.rateInside}</dd>
        </div>
        <div>
          <dt>{m.hmin}+ hrs a month open</dt>
          <dd data-testid="lm-hours">{m.hoursOpen}</dd>
        </div>
      </dl>
      <p className="note-box" data-testid="lm-norate">
        <b>{m.noRate}</b> of {OPERATORS.length} operators have no rate on their profile, so budget fit is a guess for most. The {OPERATORS.length - m.noRate} who list one have a median of ${m.median}/hr
        {m.median != null && draft.budgetMax != null && !rn ? (m.median > draft.budgetMax ? ", above your range" : m.median < (draft.budgetMin ?? 0) ? ", below your range" : ", inside your range") : ""}. Budget range {range}.
      </p>
      <h3 className="mini-h">Top matches right now</h3>
      <ol className="lm-top">
        {m.scored.slice(0, 5).map(({ o, f }) => (
          <li key={o.id} data-testid="lm-top">
            <div className="lm-who">
              <Avatar op={o} size={28} />
              <span>
                <b>{displayName(o)}</b>
                <small>{o.role}</small>
              </span>
              <FitScore fit={f} size="sm" />
            </div>
            <FitParts fit={f} noRate={o.rate == null} />
          </li>
        ))}
      </ol>
    </aside>
  );
}
