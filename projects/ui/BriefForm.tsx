import { useMemo, useState } from "react";
import type { Project, State } from "../lib/types";
import { CATEGORIES, OPERATORS, displayName } from "../lib/data";
import { ROLE_CATALOG } from "../../lib/roles";
import { briefFromProject, clientRate, fitScore, seatCategory, seatOf } from "../lib/fit";
import { MAX_SCREENING, buyerProfileOf, opState, useSession, type BriefErrors } from "../lib/store";
import { ACV_BANDS, MOTIONS, STAGES, companyFit, label, profileCompleteness } from "../lib/company";
import { Link } from "../lib/router";
import { CompanyFitChip } from "./buyer/Company";
import { BUDGET_PRESETS, HOUR_PRESETS, TEMPLATES } from "../lib/templates";
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

/** The six skills most listed by operators in this seat's category, for one-click must-haves. */
function suggestedMustHaves(title: string, chosen: string[]): string[] {
  const cat = seatCategory(title || "");
  const counts = new Map<string, number>();
  for (const o of OPERATORS) if (o.cat === cat) for (const t of o.allTags || []) counts.set(t, (counts.get(t) || 0) + 1);
  const lower = chosen.map((c) => c.toLowerCase());
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([t]) => t)
    .filter((t) => !lower.includes(t.toLowerCase()))
    .slice(0, 6);
}

/** Standard titles for a function, as on revenuenomad.com's role catalog. */
function standardTitles(cat: string): string[] {
  const key = cat === "Customer Success & Growth" ? "Customer Success" : cat;
  return ROLE_CATALOG.find((g) => g.category === key)?.roles.map((r) => r.label) || [];
}

export function catSlug(cat: string): string {
  return cat.toLowerCase().replace(/&/g, "").replace(/[^a-z]+/g, "-").replace(/-+$/, "");
}

export function TemplatePicker({ onPick, active }: { onPick: (key: string) => void; active?: string }) {
  return (
    <section className="card templates" aria-labelledby="tpl-h" data-testid="templates">
      <div className="card-head">
        <h2 id="tpl-h">Start from a template</h2>
        <span className="head-meta">One click fills the brief. Change anything after.</span>
      </div>
      <div className="tpl-grid" role="group" aria-label="Templates">
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" className={`tpl tpl-${catSlug(seatCategory(t.brief.title))}`} aria-pressed={active === t.brief.title} onClick={() => onPick(t.key)} data-testid={`tpl-${t.key}`}>
            <em>{seatCategory(t.brief.title).replace(" & Growth", "")}</em>
            <b>{t.label}</b>
            <span>{t.blurb}</span>
            <small>
              {t.brief.hoursPerMonthMin}-{t.brief.hoursPerMonthMax} hrs · ${t.brief.budgetMin}-${t.brief.budgetMax}/hr
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

function Presets({ label, options, current, onPick, fmt }: { label: string; options: [number, number][]; current: [number | null | undefined, number | null | undefined]; onPick: (v: [number, number]) => void; fmt: (v: [number, number]) => string }) {
  return (
    <div className="presets" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.join("-")} type="button" className="preset" aria-pressed={current[0] === o[0] && current[1] === o[1]} onClick={() => onPick(o)}>
          {fmt(o)}
        </button>
      ))}
    </div>
  );
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
  const cat = seatOf(draft);
  const suggestions = (SUGGESTED_QUESTIONS[cat] || SUGGESTED_QUESTIONS["Sales Leadership"]).filter((q) => !draft.screeningQuestions.includes(q));
  const qs = draft.screeningQuestions;
  return (
    <>

      <section className="card form-card" aria-labelledby="seat-h">
        <h2 id="seat-h">The seat</h2>
        <fieldset className="field">
          <legend>Function</legend>
          <div className="chips fn-chips" role="group" aria-label="Function" data-testid="f-function">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip chip-btn fn-chip tpl-${catSlug(c)}`}
                aria-pressed={draft.category === c}
                onClick={() => set({ category: draft.category === c ? null : c })}
              >
                {c}
              </button>
            ))}
          </div>
          <small className="muted">{draft.category ? `Matching on ${draft.category} operators.` : draft.title.trim() ? `Reading the title as ${seatCategory(draft.title)}. Pick one to be sure.` : "Pick the function first. Matching and alerts use it."}</small>
        </fieldset>
        <label className="field">
          <span>Role title</span>
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Fractional VP of Sales" aria-invalid={!!errors.title} aria-describedby="err-title" data-testid="f-title" />
          <FieldError msg={errors.title} id="err-title" />
        </label>
        {(draft.category || draft.title.trim()) && standardTitles(seatOf(draft)).length > 0 && (
          <div className="chips title-chips" role="group" aria-label="Standard titles" data-testid="f-titles">
            {standardTitles(seatOf(draft)).map((t) => (
              <button key={t} type="button" className="chip chip-btn" aria-pressed={draft.title === `Fractional ${t}`} onClick={() => set({ title: `Fractional ${t}`, category: draft.category || seatOf({ title: t }) })}>
                {t}
              </button>
            ))}
          </div>
        )}
        <label className="field">
          <span>What does success look like in 90 days</span>
          <textarea rows={3} value={draft.successIn90Days} onChange={(e) => set({ successIn90Days: e.target.value })} aria-invalid={!!errors.successIn90Days} data-testid="f-success" />
          <FieldError msg={errors.successIn90Days} />
        </label>
        <label className="field">
          <span>GTM problem or scope, optional</span>
          <textarea rows={2} value={draft.scope || ""} onChange={(e) => set({ scope: e.target.value })} placeholder="What is going on today, in plain words. Operators see this first." data-testid="f-scope" />
        </label>
        <div className="grid-fields">
          <fieldset className="field">
            <legend>Hours a month</legend>
            <div className="range">
              <input type="number" min={1} value={draft.hoursPerMonthMin ?? ""} onChange={(e) => set({ hoursPerMonthMin: num(e.target.value) as number })} aria-label="Hours a month, minimum" data-testid="f-hmin" aria-invalid={!!errors.hours} />
              <span>to</span>
              <input type="number" min={1} value={draft.hoursPerMonthMax ?? ""} onChange={(e) => set({ hoursPerMonthMax: num(e.target.value) as number })} aria-label="Hours a month, maximum" data-testid="f-hmax" aria-invalid={!!errors.hours} />
            </div>
            <Presets label="Common hours" options={HOUR_PRESETS} current={[draft.hoursPerMonthMin, draft.hoursPerMonthMax]} onPick={([a, b]) => set({ hoursPerMonthMin: a, hoursPerMonthMax: b })} fmt={([a, b]) => `${a}-${b}`} />
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
              <Presets label="Common budgets" options={BUDGET_PRESETS} current={[draft.budgetMin, draft.budgetMax]} onPick={([a, b]) => set({ budgetMin: a, budgetMax: b })} fmt={([a, b]) => `$${a}-${b}`} />
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
          <div className="chips" aria-label="Suggested must-haves">
            {suggestedMustHaves(draft.title, draft.mustHaves).map((t) => (
              <button key={t} type="button" className="chip chip-btn" onClick={() => set({ mustHaves: [...draft.mustHaves, t] })} data-testid="musthave-suggestion">
                + {t}
              </button>
            ))}
          </div>
          <div className="row">
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Or type your own" aria-label="Add a must-have" onKeyDown={(e) => {
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
  const sess = useSession();
  const bp = sess.role === "buyer" ? buyerProfileOf(s, sess.buyerId) : null;
  // With no role there's nothing to match on yet; scoring a guess would read as a real result.
  if (!draft.title.trim())
    return (
      <aside className="card live-match" aria-labelledby="lm-h" data-testid="live-match">
        <div className="eyebrow">
          <span className="live-dot" aria-hidden="true" />
          Live match
        </div>
        <h2 id="lm-h" className="lm-big lm-wait">
          Pick a template or add a role title
        </h2>
        <p className="muted" data-testid="lm-empty">
          Then this scores all {OPERATORS.length} live profiles against your brief as you type: who fits, who is available, and who is inside your budget.
        </p>
      </aside>
    );
  const range = rn ? `at or under $${draft.operatorRate ?? "?"}` : draft.budgetMin == null || draft.budgetMax == null ? null : `$${draft.budgetMin} to $${draft.budgetMax}`;
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
        <b>{m.noRate}</b> of {OPERATORS.length} operators have no rate on their profile, so budget fit is a guess for most. The {OPERATORS.length - m.noRate} who list one have a median of ${rn ? m.median : clientRate(m.median)}/hr{rn ? "" : " all-in"}
        {m.median != null && draft.budgetMax != null && !rn ? (clientRate(m.median)! > draft.budgetMax ? ", above your range" : clientRate(m.median)! < (draft.budgetMin ?? 0) ? ", below your range" : ", inside your range") : ""}.{range ? ` Budget range ${range}.` : " Pick a budget to compare."}
      </p>
      <h3 className="mini-h">Top matches right now</h3>
      {!rn && (
        <p className="small lm-company" data-testid="lm-company">
          {bp && profileCompleteness(bp) > 0 ? (
            <>
              Company fit uses your profile: {[label(STAGES, bp.stage), ...bp.motions.map((x) => label(MOTIONS, x)), label(ACV_BANDS, bp.acv)].filter(Boolean).join(" · ")}.{" "}
              <Link to="/buyer/company">Edit</Link>
            </>
          ) : (
            <>
              <Link to="/buyer/company">Add your company profile</Link> to also match on stage, GTM motion, deal size and sales cycle.
            </>
          )}
        </p>
      )}
      <ol className="lm-top">
        {m.scored.slice(0, 5).map(({ o, f }) => {
          const cf = !rn && bp ? companyFit(o, bp) : null;
          return (
            <li key={o.id} data-testid="lm-top">
              <div className="lm-who">
                <Avatar op={o} size={32} />
                <span>
                  <b>{displayName(o)}</b>
                  <small>{o.role}</small>
                </span>
                <FitScore fit={f} size="sm" />
              </div>
              {cf && cf.level !== "unknown" && (
                <div className="lm-cf">
                  <CompanyFitChip fit={cf} testId="lm-company-fit" />
                  <small>{[...cf.matched.slice(0, 2), ...cf.missed.slice(0, cf.matched.length ? 0 : 1)].join(" · ")}</small>
                </div>
              )}
              <FitParts fit={f} noRate={o.rate == null} />
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
