"use client";

/**
 * Add a case study, a step at a time (the first visit opens on it; "Add a case study" opens it
 * later): 1 pick a client you did great work for (a seat of yours on Merlin, with its logo, or type
 * the company), 2 the problem and what you did, 3 what changed and how long it took, 4 who can
 * vouch (optional), then Add another or Done. Each step saves to Merlin as it goes, so nothing is
 * lost, and the wizard picks up where it was left (evidenceModel resumeAt; the step is kept in this
 * browser, the case study on Merlin). Works one-handed on a phone: one question a screen.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CompanyLogo } from "../../ui/shared";
import * as api from "./api";
import { Blanked } from "./CaseTile";
import { WIZ_STEPS, canBeReady, monthOk, resultLine, stepOf, suggestTagsFor, titleOf, type SeatLite, type WizStep } from "./evidenceModel";
import type { Study, TagCatalogue } from "./types";

export function Wizard({
  seats,
  cases,
  catalogue,
  start,
  onCase,
  onStep,
  onClose,
  buildForMe,
  first,
}: {
  seats: SeatLite[];
  cases: Study[];
  catalogue: TagCatalogue;
  /** Pick up here: a case study already started, at its step. */
  start: { caseId: string; step: WizStep } | null;
  /** A case study saved (new or changed). */
  onCase: (c: Study) => void;
  /** Where the wizard is now (kept for next time), or null when it is finished or closed. */
  onStep: (at: { caseId: string; step: WizStep } | null) => void;
  onClose: () => void;
  buildForMe: ReactNode;
  first: boolean;
}) {
  const startCase = start ? cases.find((c) => c.id === start.caseId) ?? null : null;
  const [step, setStep] = useState<WizStep>(startCase ? start!.step : 0);
  const [cur, setCur] = useState<Study | null>(startCase);
  const [pick, setPick] = useState<string | null>(startCase?.seatId ?? null);
  const [typed, setTyped] = useState("");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [going, setGoing] = useState(false);
  const [problem, setProblem] = useState(startCase?.answers.problem ?? "");
  const [did, setDid] = useState(startCase?.answers.did ?? "");
  const [numbers, setNumbers] = useState(startCase?.answers.numbers ?? "");
  const [took, setTook] = useState(startCase?.took ?? "");
  const [quote, setQuote] = useState(startCase?.quote?.text ?? "");
  const [by, setBy] = useState(startCase?.quote?.by ?? "");
  const [byTitle, setByTitle] = useState(startCase?.quote?.title ?? "");
  const [where, setWhere] = useState(startCase?.quote?.where ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.querySelector<HTMLElement>("input:not([type=checkbox]), textarea, button.ev-seatpick")?.focus({ preventScroll: true });
  }, [step]);

  const caseOfSeat = useMemo(() => new Map(cases.filter((c) => c.seatId).map((c) => [c.seatId!, c])), [cases]);
  const fill = (c: Study) => {
    setCur(c);
    setProblem(c.answers.problem);
    setDid(c.answers.did);
    setNumbers(c.answers.numbers);
    setTook(c.took);
    setQuote(c.quote?.text ?? "");
    setBy(c.quote?.by ?? "");
    setByTitle(c.quote?.title ?? "");
    setWhere(c.quote?.where ?? "");
  };
  const go = (s: WizStep, c: Study | null = cur) => {
    setStep(s);
    setErr(null);
    onStep(c && s < 4 ? { caseId: c.id, step: s } : null);
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const done = async (r: Study | api.Fail, next: WizStep) => {
    setBusy(false);
    if (api.failed(r)) return setErr(r.error);
    onCase(r);
    fill(r);
    go(next, r);
  };

  const step0 = async () => {
    setErr(null);
    if (pick) {
      setBusy(true);
      const r = await api.draftFromSeat(pick);
      if (api.failed(r)) return (setBusy(false), setErr(r.error));
      return done(r, Math.max(1, stepOf(r)) as WizStep);
    }
    if (!typed.trim()) return setErr("Pick a client above, or type the company's name.");
    if (!monthOk(from) || (!going && !monthOk(to))) return setErr("Give the months like 2024-02.");
    setBusy(true);
    void done(await api.save({ clientName: typed.trim(), role: role.trim(), start: from, end: going ? "Ongoing" : to, status: "draft" }), 1);
  };
  const step1 = async () => {
    if (!problem.trim() || !did.trim()) return setErr("Write a line for each: the problem, and what you did.");
    setBusy(true);
    void done(await api.save({ id: cur!.id, answers: { problem, did } }), 2);
  };
  const step2 = async () => {
    setBusy(true);
    void done(await api.save({ id: cur!.id, answers: { numbers }, took }), 3);
  };
  const step3 = async (skip: boolean) => {
    setBusy(true);
    const q = skip ? {} : { quote: quote.trim() || by.trim() || byTitle.trim() ? { text: quote, by, title: byTitle, where } : null };
    const ready = canBeReady({ problem, did }, numbers, took, ...(skip ? [] : [quote, by, byTitle]));
    void done(await api.save({ id: cur!.id, ...q, status: ready ? "ready" : "draft" }), 4);
  };
  const addTag = async (t: string) => {
    if (!cur) return;
    const r = await api.save({ id: cur.id, workType: [...cur.workType, t] });
    if (api.failed(r)) return setErr(r.error);
    onCase(r);
    setCur(r);
  };
  const again = () => {
    setCur(null);
    setPick(null);
    setTyped("");
    setRole("");
    setFrom("");
    setTo("");
    setGoing(false);
    for (const set of [setProblem, setDid, setNumbers, setTook, setQuote, setBy, setByTitle, setWhere]) set("");
    go(0, null);
  };

  const clientName = cur?.client.name || (pick ? seats.find((s) => s.id === pick)?.company : "") || typed;
  const head = step < 4 ? WIZ_STEPS[step as 0 | 1 | 2 | 3] : null;
  const nav = (next: () => void, label: string, back = true) => (
    <div className="ev-wiz-foot">
      {back && step > 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => go((step - 1) as WizStep)}>
          Back
        </button>
      )}
      <span className="ev-sp" />
      <button type="button" className="btn btn-pine" disabled={busy} aria-busy={busy} onClick={next}>
        {busy ? "Saving" : label}
      </button>
    </div>
  );

  return (
    <section className="ev-wiz" aria-label="Add a case study" ref={top} data-step={step}>
      <div className="ev-wiz-top">
        {head ? (
          <>
            <ol className="ev-wiz-dots" aria-label={`Step ${step + 1} of ${WIZ_STEPS.length}`}>
              {WIZ_STEPS.map((s, n) => (
                <li key={s.key} className={n < step ? "done" : n === step ? "on" : undefined} aria-current={n === step ? "step" : undefined}>
                  <span className="sr-only">{`Step ${n + 1}: ${s.h}`}</span>
                </li>
              ))}
            </ol>
            <span className="ev-wiz-n">
              Step {step + 1} of {WIZ_STEPS.length}
              {clientName && step > 0 ? ` · ${clientName}` : ""}
            </span>
          </>
        ) : (
          <span className="ev-wiz-n">Saved</span>
        )}
        <span className="ev-sp" />
        <button type="button" className="ev-link" onClick={onClose}>
          {step === 0 || step === 4 ? (first && !cases.length ? "Skip for now" : "Close") : "Save and finish later"}
        </button>
      </div>
      {head && (
        <header className="ev-wiz-head">
          <h2>{head.h}</h2>
          <p>{head.p}</p>
        </header>
      )}

      {step === 0 && (
        <>
          {seats.length > 0 && (
            <ul className="ev-seatpicks" aria-label="Your seats on Merlin">
              {seats.map((s) => {
                const has = caseOfSeat.get(s.id);
                return (
                  <li key={s.id}>
                    <button type="button" className={`ev-seatpick${pick === s.id ? " on" : ""}`} aria-pressed={pick === s.id} onClick={() => (setPick(pick === s.id ? null : s.id), setTyped(""), setErr(null))}>
                      <CompanyLogo name={s.company || "Client company"} domain={null} seed={s.companyId} hidden={!s.company} />
                      <span className="ev-seatpick-t">
                        <strong>{s.company || "Client company"}</strong>
                        <span>{[s.role, s.dates].filter(Boolean).join(" · ")}</span>
                        {has && <span className="ev-seatpick-has">{has.status === "ready" ? "Has a case study" : "Started"}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className={`ev-typed${pick ? " ev-dim" : ""}`}>
            <span className="ev-field-k">{seats.length ? "Or type the company" : "The company"}</span>
            <div className="ev-grid">
              <label className="ev-field ev-wide">
                <span className="sr-only">Company name</span>
                <input className="input" value={typed} maxLength={120} placeholder="Company name" onChange={(e) => (setTyped(e.target.value), setPick(null))} />
              </label>
              {(typed.trim() || !seats.length) && (
                <>
                  <label className="ev-field">
                    <span className="ev-field-k">Your seat</span>
                    <input className="input" value={role} maxLength={80} placeholder="Fractional VP Sales" onChange={(e) => setRole(e.target.value)} />
                  </label>
                  <label className="ev-field">
                    <span className="ev-field-k">Started</span>
                    <input className="input" type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </label>
                  <label className="ev-field">
                    <span className="ev-field-k">Ended</span>
                    <span className="ev-endrow">
                      <input className="input" type="month" value={going ? "" : to} disabled={going} onChange={(e) => setTo(e.target.value)} />
                      <label className="ev-check">
                        <input type="checkbox" checked={going} onChange={(e) => setGoing(e.target.checked)} /> Still going
                      </label>
                    </span>
                  </label>
                </>
              )}
            </div>
          </div>
          {err && (
            <p className="ev-err" role="alert">
              {err}
            </p>
          )}
          {nav(() => void step0(), "Next: the work", false)}
          <div className="ev-wiz-alt">{buildForMe}</div>
        </>
      )}

      {step === 1 && (
        <>
          <label className="ev-field ev-wide">
            <span className="ev-field-k">The problem when you got there</span>
            <textarea className="input" rows={3} value={problem} maxLength={1500} onChange={(e) => setProblem(e.target.value)} placeholder="Four reps sold four different ways, and the forecast missed every quarter." />
          </label>
          <label className="ev-field ev-wide">
            <span className="ev-field-k">What you did</span>
            <textarea className="input" rows={3} value={did} maxLength={1500} onChange={(e) => setDid(e.target.value)} placeholder="Set one sales process, a weekly forecast call, and the first playbook." />
          </label>
          {err && (
            <p className="ev-err" role="alert">
              {err}
            </p>
          )}
          {nav(() => void step1(), "Next: the result")}
        </>
      )}

      {step === 2 && (
        <>
          <label className="ev-field ev-wide">
            <span className="ev-field-k">The result, with a number</span>
            <textarea className="input" rows={3} value={numbers} maxLength={1500} onChange={(e) => setNumbers(e.target.value)} placeholder="Win rate went from 22% to 31%. Pipeline went from $1.2M to $3.4M." />
            <span className="ev-field-hint">Only numbers you can stand behind. Merlin never fills one in for you.</span>
          </label>
          <label className="ev-field">
            <span className="ev-field-k">How long it took</span>
            <input className="input" value={took} maxLength={80} onChange={(e) => setTook(e.target.value)} placeholder="6 months" />
          </label>
          {err && (
            <p className="ev-err" role="alert">
              {err}
            </p>
          )}
          {nav(() => void step2(), numbers.trim() ? "Next: who can vouch" : "Skip the number for now")}
        </>
      )}

      {step === 3 && (
        <>
          <label className="ev-field ev-wide">
            <span className="ev-field-k">The quote</span>
            <textarea className="input" rows={3} value={quote} maxLength={600} onChange={(e) => setQuote(e.target.value)} placeholder="Jordan gave us a forecast we could take to the board." />
            <span className="ev-field-hint">Word for word, as they said or wrote it.</span>
          </label>
          <div className="ev-grid">
            <label className="ev-field">
              <span className="ev-field-k">Their name</span>
              <input className="input" value={by} maxLength={80} onChange={(e) => setBy(e.target.value)} />
            </label>
            <label className="ev-field">
              <span className="ev-field-k">Their title</span>
              <input className="input" value={byTitle} maxLength={80} placeholder="CEO" onChange={(e) => setByTitle(e.target.value)} />
            </label>
            <label className="ev-field">
              <span className="ev-field-k">Where they're based</span>
              <input className="input" value={where} maxLength={80} placeholder="Denver, CO" onChange={(e) => setWhere(e.target.value)} />
            </label>
          </div>
          <p className="ev-field-hint">The quote stays with you here. In a proposal the person is named only when you name the client, and never when they are in California.</p>
          {err && (
            <p className="ev-err" role="alert">
              {err}
            </p>
          )}
          <div className="ev-wiz-foot">
            <button type="button" className="btn btn-ghost" onClick={() => go(2)}>
              Back
            </button>
            <span className="ev-sp" />
            <button type="button" className="btn" disabled={busy} onClick={() => void step3(true)}>
              Skip this
            </button>
            <button type="button" className="btn btn-pine" disabled={busy} aria-busy={busy} onClick={() => void step3(false)}>
              {busy ? "Saving" : "Save the case study"}
            </button>
          </div>
        </>
      )}

      {step === 4 && cur && (
        <div className="ev-wiz-done">
          <h2>{cur.status === "ready" ? "Your case study is saved and ready." : "Saved as a draft."}</h2>
          <p>{cur.status === "ready" ? `Merlin puts it in the Proof part of a proposal when the company looks like ${clientName || "this client"}. The client's name stays out of proposals unless you switch it on.` : "Finish the problem and what you did and it is ready. It waits for you in the table."}</p>
          <div className="ev-wiz-card">
            <strong>
              <Blanked text={titleOf(cur)} />
            </strong>
            {resultLine(cur) && (
              <span>
                <Blanked text={resultLine(cur)} />
              </span>
            )}
          </div>
          <div className="ev-tagpicks" aria-label="Tag it so Merlin can match it">
            <span className="ev-tagpicks-k">Tag it</span>
            {cur.workType.map((t) => (
              <span key={t} className="ev-tagchip">
                {t}
              </span>
            ))}
            {suggestTagsFor(cur, catalogue, cur.workType).map((t) => (
              <button key={t} type="button" className="ev-tagpick" onClick={() => void addTag(t)}>
                + {t}
              </button>
            ))}
          </div>
          {err && (
            <p className="ev-err" role="alert">
              {err}
            </p>
          )}
          <div className="ev-wiz-foot">
            <button type="button" className="btn" onClick={again}>
              Add another
            </button>
            <span className="ev-sp" />
            <button type="button" className="btn btn-pine" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
