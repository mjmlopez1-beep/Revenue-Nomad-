"use client";

/**
 * One case study as a tile in column B (title, the result, the role and dates, where it stands),
 * and the same tile opened into its form right where it is: click it, change it, Save or Cancel.
 * No side panel. Saving goes through the route's save (api.ts), the same as everywhere; saving a
 * case study the member's agent wrote is their check ("From Claude · review" goes away).
 */
import { useMemo, useState, type ReactNode } from "react";
import { RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE } from "@/lib/tableFields";
import * as api from "./api";
import { canBeReady, hasBlank, monthOk, resultLine, splitBlanks, statusOf, suggestTagsFor, titleOf } from "./evidenceModel";
import { TagSearch } from "./TagSearch";
import type { Study, StudyInput, TagCatalogue } from "./types";

/** Words with the blanks an agent left marked, to fill. */
export function Blanked({ text }: { text: string }) {
  return (
    <>
      {splitBlanks(text).map((p, n) =>
        p.blank ? (
          <mark key={n} className="ev-blank">
            {p.t}
          </mark>
        ) : (
          <span key={n}>{p.t}</span>
        ),
      )}
    </>
  );
}

export function CaseTile({ c, onOpen }: { c: Study; onOpen: () => void }) {
  const st = statusOf(c);
  const result = resultLine(c);
  const meta = [c.role, c.dates].filter(Boolean).join(" · ");
  return (
    <li className={`ev-tile ev-tone-${st.tone}`} data-case={c.id}>
      <button type="button" className="ev-tile-btn" aria-expanded={false} aria-label={`Edit the case study: ${titleOf(c)}`} onClick={onOpen}>
        <span className={`ev-pill ev-pill-${st.tone}`}>{st.word}</span>
        <strong className="ev-tile-title">
          <Blanked text={titleOf(c)} />
        </strong>
        <span className={`ev-tile-result${result ? "" : " ev-tile-empty"}`}>{result ? <Blanked text={result} /> : "Add the result"}</span>
        {meta && (
          <span className="ev-tile-meta">
            <Blanked text={meta} />
          </span>
        )}
        {c.usedIn.length > 0 && <span className="ev-tile-used">In {c.usedIn.length === 1 ? "1 proposal" : `${c.usedIn.length} proposals`}</span>}
      </button>
    </li>
  );
}

/** A new case study's starting point at one company. */
export function blankStudy(at: { name: string; companyId?: string | null; industry?: string; size?: string; revenue?: string; role?: string }): Study {
  const now = new Date().toISOString();
  return {
    id: "",
    status: "draft",
    seatId: null,
    companyId: at.companyId ?? null,
    client: { named: false, label: "", ...(at.name ? { name: at.name } : {}) },
    title: "",
    role: at.role ?? "",
    fn: "",
    start: "",
    end: "",
    dates: "",
    hours: "",
    size: at.size ?? "",
    revenue: at.revenue ?? "",
    motion: "",
    industry: at.industry ?? "",
    soldTo: "",
    problems: [],
    workType: [],
    outcomes: [],
    workedWith: [],
    answers: { problem: "", did: "", numbers: "" },
    answered: { problem: false, did: false, numbers: false },
    took: "",
    quote: null,
    from: null,
    review: false,
    blanks: [],
    text: "",
    textBy: "template",
    showOnCard: false,
    usedIn: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** What the form's fields are now. */
export interface FormFields {
  title: string;
  company: string;
  role: string;
  start: string;
  end: string;
  going: boolean;
  datesTouched: boolean;
  problem: string;
  did: string;
  numbers: string;
  took: string;
  quote: string;
  by: string;
  byTitle: string;
  where: string;
  tags: string[];
  named: boolean;
  onCard: boolean;
  industry: string;
  size: string;
  revenue: string;
}
/**
 * What Save sends (the route's save, the same as the wizard's and every other save): ready once the
 * problem and what you did are written with no blank left, else a draft; the dates only when
 * changed (a year-only date the month box can't show stays as it was); the company's own name and
 * facts only for a company typed in, or a new case study.
 */
export function formInput(c: Study, f: FormFields): StudyInput {
  const ready = canBeReady({ problem: f.problem, did: f.did }, f.numbers, f.took, f.quote, f.by, f.byTitle, f.title, f.role);
  const isNew = !c.id;
  return {
    ...(c.id ? { id: c.id } : {}),
    title: f.title,
    role: f.role,
    answers: { problem: f.problem, did: f.did, numbers: f.numbers },
    took: f.took,
    quote: f.quote.trim() || f.by.trim() || f.byTitle.trim() ? { text: f.quote, by: f.by, title: f.byTitle, where: f.where } : null,
    workType: f.tags,
    clientNamed: f.named,
    status: ready ? "ready" : "draft",
    showOnCard: ready && f.onCard,
    ...(f.datesTouched || isNew ? { start: f.start, end: f.going ? "Ongoing" : f.end } : {}),
    ...(!c.companyId || isNew ? { clientName: f.company, industry: f.industry, size: f.size, revenue: f.revenue } : {}),
  };
}

const Field = ({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) => (
  <label className={`ev-field${wide ? " ev-wide" : ""}`}>
    <span className="ev-field-k">{label}</span>
    {children}
    {hint && <span className="ev-field-hint">{hint}</span>}
  </label>
);

/**
 * The tile opened: every part of the case study, in place. `onSaved` gets the case study back;
 * `onRemoved` after Remove; `onUse` puts a ready one in a new proposal.
 */
export function CaseForm({
  c,
  catalogue,
  onCancel,
  onSaved,
  onRemoved,
  onUse,
}: {
  c: Study;
  catalogue: TagCatalogue;
  onCancel: () => void;
  onSaved: (x: Study) => void;
  onRemoved: (id: string) => void;
  onUse: ((id: string) => void) | null;
}) {
  const isNew = !c.id;
  const [title, setTitle] = useState(c.title);
  const [company, setCompany] = useState(c.client.name ?? "");
  const [role, setRole] = useState(c.role);
  const [start, setStart] = useState(/^\d{4}-\d{2}$/.test(c.start) ? c.start : "");
  const [end, setEnd] = useState(/^\d{4}-\d{2}$/.test(c.end) ? c.end : "");
  const [going, setGoing] = useState(/^ongoing$/i.test(c.end));
  const [datesTouched, setDatesTouched] = useState(false);
  const [problem, setProblem] = useState(c.answers.problem);
  const [did, setDid] = useState(c.answers.did);
  const [numbers, setNumbers] = useState(c.answers.numbers);
  const [took, setTook] = useState(c.took);
  const [quote, setQuote] = useState(c.quote?.text ?? "");
  const [by, setBy] = useState(c.quote?.by ?? "");
  const [byTitle, setByTitle] = useState(c.quote?.title ?? "");
  const [where, setWhere] = useState(c.quote?.where ?? "");
  const [tags, setTags] = useState<string[]>(c.workType);
  const [named, setNamed] = useState(c.client.named);
  const [onCard, setOnCard] = useState(c.showOnCard);
  const [industry, setIndustry] = useState(c.industry);
  const [size, setSize] = useState(c.size);
  const [revenue, setRevenue] = useState(c.revenue);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  // A company on Merlin keeps its name and facts from there; one typed in is the member's to change.
  const ownCompany = !c.companyId;

  const ready = canBeReady({ problem, did }, numbers, took, quote, by, byTitle, title, role);
  const suggested = useMemo(() => suggestTagsFor({ title, role, fn: c.fn, industry, answers: { problem, did, numbers } }, catalogue, tags), [title, role, c.fn, industry, problem, did, numbers, catalogue, tags]);
  const save = async () => {
    if (datesTouched && (!monthOk(start) || (!going && !monthOk(end)))) return setErr("Give the months like 2024-02.");
    setBusy(true);
    setErr(null);
    const input = formInput(c, { title, company, role, start, end, going, datesTouched, problem, did, numbers, took, quote, by, byTitle, where, tags, named, onCard, industry, size, revenue });
    const r = await api.save(input);
    setBusy(false);
    if (api.failed(r)) return setErr(r.error);
    onSaved(r);
  };
  const remove = async () => {
    setBusy(true);
    const r = await api.remove(c.id);
    setBusy(false);
    if (api.failed(r)) return setErr(r.error);
    onRemoved(c.id);
  };
  const blankNote = (v: string) => (hasBlank(v) ? "Fill in the part in square brackets." : undefined);

  return (
    <li className="ev-tile ev-tile-open" data-case={c.id || "new"}>
      <form
        className="ev-form"
        aria-label={isNew ? "New case study" : `Edit the case study: ${titleOf(c)}`}
        onSubmit={(e) => (e.preventDefault(), void save())}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onCancel())}
      >
        {c.review && (
          <p className="ev-review" role="note">
            <strong>From {c.from || "your agent"}, to review.</strong> {c.from || "Your agent"} found this in your email or its memory of your work. Check it, fill in anything in square brackets, then save. It goes into proposals once you have.
          </p>
        )}
        <div className="ev-grid">
          <Field label="Title" hint="Short and plain, like Rebuilt the forecast before a Series B." wide>
            <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={titleOf({ ...c, title: "" })} />
          </Field>
          {ownCompany && (
            <Field label="Client">
              <input className="input" value={company} maxLength={120} onChange={(e) => setCompany(e.target.value)} placeholder="The company's name" />
            </Field>
          )}
          <Field label="Your seat" hint={blankNote(role)}>
            <input className="input" value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} placeholder="Fractional VP Sales" />
          </Field>
          <Field label="Started">
            <input className="input" type="month" value={start} onChange={(e) => (setStart(e.target.value), setDatesTouched(true))} />
          </Field>
          <Field label="Ended">
            <span className="ev-endrow">
              <input className="input" type="month" value={going ? "" : end} disabled={going} onChange={(e) => (setEnd(e.target.value), setDatesTouched(true))} />
              <label className="ev-check">
                <input type="checkbox" checked={going} onChange={(e) => (setGoing(e.target.checked), setDatesTouched(true))} /> Still going
              </label>
            </span>
          </Field>
          <Field label="The problem when you got there" hint={blankNote(problem)} wide>
            <textarea className="input" rows={2} value={problem} maxLength={1500} onChange={(e) => setProblem(e.target.value)} placeholder="Four reps sold four different ways, and the forecast missed every quarter." />
          </Field>
          <Field label="What you did" hint={blankNote(did)} wide>
            <textarea className="input" rows={2} value={did} maxLength={1500} onChange={(e) => setDid(e.target.value)} placeholder="Set one sales process, a weekly forecast call, and the first playbook." />
          </Field>
          <Field label="The result, with numbers" hint={blankNote(numbers) ?? "Only numbers you can stand behind. Before and after reads best."} wide>
            <textarea className="input" rows={2} value={numbers} maxLength={1500} onChange={(e) => setNumbers(e.target.value)} placeholder="Win rate went from 22% to 31%. Sales cycle went from 94 days to 61 days." />
          </Field>
          <Field label="How long it took" hint={blankNote(took)}>
            <input className="input" value={took} maxLength={80} onChange={(e) => setTook(e.target.value)} placeholder="6 months" />
          </Field>
          {ownCompany && (
            <>
              <Field label="Industry">
                <select className="input" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                  <option value="">Not set</option>
                  {RN_INDUSTRIES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="People">
                <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="">Not set</option>
                  {RN_EMPLOYEES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Revenue">
                <select className="input" value={revenue} onChange={(e) => setRevenue(e.target.value)}>
                  <option value="">Not set</option>
                  {RN_REVENUE.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
        <fieldset className="ev-vouch">
          <legend>Who can vouch</legend>
          <div className="ev-grid">
            <Field label="The quote" hint={blankNote(quote) ?? "Word for word, as they said or wrote it."} wide>
              <textarea className="input" rows={2} value={quote} maxLength={600} onChange={(e) => setQuote(e.target.value)} placeholder="Jordan gave us a forecast we could take to the board." />
            </Field>
            <Field label="Their name" hint={blankNote(by)}>
              <input className="input" value={by} maxLength={80} onChange={(e) => setBy(e.target.value)} />
            </Field>
            <Field label="Their title" hint={blankNote(byTitle)}>
              <input className="input" value={byTitle} maxLength={80} onChange={(e) => setByTitle(e.target.value)} placeholder="CEO" />
            </Field>
            <Field label="Where they're based" hint="So Merlin leaves out the name of anyone in California when this goes in a proposal.">
              <input className="input" value={where} maxLength={80} onChange={(e) => setWhere(e.target.value)} placeholder="Denver, CO" />
            </Field>
          </div>
        </fieldset>
        <div className="ev-field ev-wide">
          <span className="ev-field-k">Tags</span>
          <TagSearch value={tags} onChange={setTags} catalogue={catalogue} suggested={suggested} />
        </div>
        <div className="ev-switches">
          <label className="ev-check">
            <input type="checkbox" checked={named} onChange={(e) => setNamed(e.target.checked)} /> Name the client in proposals and on my card
            <span className="ev-field-hint">{named ? "The client's name goes with this case study." : "Off: a proposal says \"a client\" with its industry and size instead."}</span>
          </label>
          <label className="ev-check">
            <input type="checkbox" checked={ready && onCard} disabled={!ready} onChange={(e) => setOnCard(e.target.checked)} /> Show on my Fractionals card
            {!ready && <span className="ev-field-hint">Once the problem and what you did are written.</span>}
          </label>
        </div>
        {err && (
          <p className="ev-err" role="alert">
            {err}
          </p>
        )}
        {removing ? (
          <div className="ev-confirm" role="alertdialog" aria-label="Remove this case study">
            <span>Remove this case study? Proposals you already sent keep what they said.</span>
            <button type="button" className="btn btn-sm btn-pine" disabled={busy} onClick={() => void remove()}>
              Remove it
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRemoving(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <div className="ev-form-foot">
            <button type="submit" className="btn btn-pine" disabled={busy} aria-busy={busy}>
              {busy ? "Saving" : c.review ? "Looks right, save it" : "Save"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <span className="ev-form-state">{ready ? "Ready for proposals once saved" : "Saves as a draft until the problem and what you did are written"}</span>
            <span className="ev-sp" />
            {onUse && c.status === "ready" && !c.review && (
              <button type="button" className="btn btn-sm" onClick={() => onUse(c.id)}>
                Use in a proposal
              </button>
            )}
            {!isNew && (
              <button type="button" className="ev-link ev-remove" onClick={() => setRemoving(true)}>
                Remove
              </button>
            )}
          </div>
        )}
      </form>
    </li>
  );
}
