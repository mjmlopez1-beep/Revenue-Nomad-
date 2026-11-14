"use client";

/**
 * First run, under 30 seconds. One calm card:
 *   1. Two questions, one tap each (seat, goal).
 *   2. Follow 3 companies (type-ahead plus 6 suggestions picked from the answers).
 *   3. Save your sign-in link (only for members who joined here while email sign-in is off).
 * Finishing sends the follows, then the profile last (which marks the member onboarded).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "./onboard.css";
import { Brand, CompanyLogo, IconCheck, IconCoin, IconLink, IconPlus, IconSearch, IconX, val, type Act, type View } from "../ui/shared";
import { FUNCTIONS } from "@/lib/tableFields";
import { GOALS, type CompanyRec } from "@/lib/tableTypes";

export interface OnboardingProps {
  view: View;
  act: Act;
  /** Call when the member finishes (after the profile action marks them onboarded). */
  onDone: () => Promise<void> | void;
}

type Goal = (typeof GOALS)[number]["key"];
const FOLLOW_TARGET = 3;

const GOAL_HINT: Record<Goal, string> = {
  friendly: "We start you on the companies with the highest fit scores.",
  adjacent: "We start you on companies that hired other GTM functions fractionally.",
  intro: "We start you on companies where fellow members held a seat.",
};

/** One line about a company that works for sparse and rich records. */
function metaOf(c: CompanyRec): string {
  const parts = [val(c.cells.industry), val(c.cells.employees)].filter(Boolean) as string[];
  const n = c.engagements.length;
  if (n) parts.push(`${n} engagement${n > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/** Six suggestions that match what the member came for. */
function suggest(companies: CompanyRec[], goal: Goal | null, fn: string | null): { title: string; list: CompanyRec[] } {
  const byScore = (a: CompanyRec, b: CompanyRec) =>
    b.friendly.score - a.friendly.score ||
    b.engagements.length - a.engagements.length ||
    Number(!!b.iconDomain) - Number(!!a.iconDomain) ||
    a.name.localeCompare(b.name);
  let pool = companies.slice();
  let title = "Highest fit scores";
  if (goal === "adjacent") {
    const adj = pool.filter((c) => c.friendly.functions.length && (!fn || !c.friendly.functions.includes(fn)));
    pool = (adj.length >= 6 ? adj : pool).sort((a, b) => b.friendly.functions.length - a.friendly.functions.length || byScore(a, b));
    title = fn ? `Hired other functions, not ${fn} yet` : "Hired fractionals in other functions";
  } else if (goal === "intro") {
    pool.sort((a, b) => b.friendly.operators - a.friendly.operators || byScore(a, b));
    title = "Where members held a seat";
  } else pool.sort(byScore);
  return { title, list: pool.slice(0, 6) };
}

function Fit({ score }: { score: number }) {
  const on = score > 0 ? Math.max(1, Math.round(score / 20)) : 0;
  return (
    <span className="ob-fit" title={`Fit score ${score} of 100`}>
      <span className="ob-fit-k">Fit</span>
      <span className="mono ob-fit-v">{score}</span>
      <span className="ob-fitbar" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i < on ? "on" : ""} />
        ))}
      </span>
    </span>
  );
}

function FollowBtn({ on, onClick, name }: { on: boolean; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      className={`ob-follow${on ? " ob-follow-on" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
    >
      {on ? <IconCheck size={13} /> : <IconPlus size={13} />}
      {on ? "Following" : "Follow"}
    </button>
  );
}

export default function Onboarding({ view, act, onDone }: OnboardingProps) {
  const me = view.me!;
  const first = (me.name || "").trim().split(/\s+/)[0] || "there";
  const linkStep = me.id.startsWith("j_") && !view.email;
  const total = linkStep ? 3 : 2;

  const [step, setStep] = useState(1);
  const [fn, setFn] = useState<string | null>(me.function && FUNCTIONS.includes(me.function) ? me.function : null);
  const [goal, setGoal] = useState<Goal | null>((GOALS.find((g) => g.key === me.goal)?.key as Goal) ?? null);
  const [follows, setFollows] = useState<string[]>(() => view.companies.filter((c) => c.following).map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const followsSent = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // New step: start at the top of the card, and move focus to its heading for screen readers.
  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>("[data-step-h]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const byId = useMemo(() => new Map(view.companies.map((c) => [c.id, c])), [view.companies]);
  const toggle = (id: string) => setFollows((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const sendFollows = async () => {
    if (followsSent.current) return;
    followsSent.current = true;
    const already = new Set(view.companies.filter((c) => c.following).map((c) => c.id));
    for (const id of follows) if (!already.has(id)) await act({ type: "follow", companyId: id, on: true }, { quiet: true });
    for (const id of already) if (!follows.includes(id)) await act({ type: "follow", companyId: id, on: false }, { quiet: true });
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    await sendFollows();
    const r = await act({ type: "profile", function: fn ?? undefined, goal: goal ?? undefined }, { quiet: true });
    if (!r.ok) {
      setBusy(false);
      return;
    }
    await onDone();
  };

  const afterFollow = async () => {
    if (!linkStep) return finish();
    setBusy(true);
    await sendFollows();
    setBusy(false);
    setStep(3);
  };

  return (
    <div className="ob">
      <header className="ob-top">
        <Brand />
        <span className="ob-credits" title="Your balance">
          <span className="ob-coin" aria-hidden>
            <IconCoin size={13} />
          </span>
          <span className="mono">{me.credits}</span> credits
        </span>
      </header>

      <main className="ob-main">
        <div className={`ob-card${step === 2 ? " ob-card-wide" : ""}`} ref={cardRef}>
          <div className="ob-progress">
            <div className="ob-dots" role="img" aria-label={`Step ${step} of ${total}`}>
              {Array.from({ length: total }, (_, i) => (
                <i key={i} className={i + 1 === step ? "now" : i + 1 < step ? "done" : ""} />
              ))}
            </div>
            <span className="ob-step mono">
              {step} of {total}
            </span>
          </div>

          {step === 1 ? (
            <StepQuestions first={first} fn={fn} setFn={setFn} goal={goal} setGoal={setGoal} onNext={() => setStep(2)} />
          ) : step === 2 ? (
            <StepFollow
              companies={view.companies}
              byId={byId}
              fn={fn}
              goal={goal}
              follows={follows}
              toggle={toggle}
              busy={busy}
              last={!linkStep}
              onBack={() => setStep(1)}
              onNext={afterFollow}
              onSkip={afterFollow}
            />
          ) : (
            <StepLink token={me.token} busy={busy} onDone={finish} />
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- step 1: two questions ---------- */

function StepQuestions({
  first, fn, setFn, goal, setGoal, onNext,
}: {
  first: string;
  fn: string | null;
  setFn: (f: string) => void;
  goal: Goal | null;
  setGoal: (g: Goal) => void;
  onNext: () => void;
}) {
  const ready = !!fn && !!goal;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onNext();
      }}
    >
      <p className="ob-welcome">Welcome, {first}. Two questions and you are in.</p>

      <fieldset className="ob-q">
        <legend className="ob-h" tabIndex={-1} data-step-h>
          Which seat do you hold?
        </legend>
        <div className="ob-chips" role="radiogroup" aria-label="Your GTM function">
          {FUNCTIONS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={fn === f}
              className={`ob-chip${fn === f ? " ob-chip-on" : ""}`}
              onClick={() => setFn(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <p className="ob-hint">We flag companies that hired other GTM functions but not yours yet.</p>
      </fieldset>

      <fieldset className="ob-q">
        <legend className="ob-h">What do you want first?</legend>
        <div className="ob-goals" role="radiogroup" aria-label="What you want first">
          {GOALS.map((g) => (
            <button
              key={g.key}
              type="button"
              role="radio"
              aria-checked={goal === g.key}
              className={`ob-goal${goal === g.key ? " ob-goal-on" : ""}`}
              onClick={() => setGoal(g.key)}
            >
              <span className="ob-radio" aria-hidden />
              {g.label}
            </button>
          ))}
        </div>
        <p className="ob-hint">{goal ? GOAL_HINT[goal] : "Your first view opens on what you pick."}</p>
      </fieldset>

      <div className="ob-foot">
        <span className="ob-foot-note">{ready ? "" : fn ? "Pick what you want first" : goal ? "Pick your seat" : "Pick one of each"}</span>
        <button type="submit" className="btn btn-primary btn-lg ob-next" disabled={!ready}>
          Continue
        </button>
      </div>
    </form>
  );
}

/* ---------- step 2: follow 3 companies ---------- */

function StepFollow({
  companies, byId, fn, goal, follows, toggle, busy, last, onBack, onNext, onSkip,
}: {
  companies: CompanyRec[];
  byId: Map<string, CompanyRec>;
  fn: string | null;
  goal: Goal | null;
  follows: string[];
  toggle: (id: string) => void;
  busy: boolean;
  last: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Suggestions are picked once, from the answers, so cards don't jump around as you follow.
  const [sugg] = useState(() => suggest(companies, goal, fn));

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const starts: CompanyRec[] = [];
    const has: CompanyRec[] = [];
    for (const c of companies) {
      const n = c.name.toLowerCase();
      if (n.startsWith(t)) starts.push(c);
      else if (n.includes(t)) has.push(c);
      if (starts.length >= 6) break;
    }
    return [...starts, ...has].slice(0, 6);
  }, [q, companies]);

  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (id: string) => {
    toggle(id);
    setQ("");
    inputRef.current?.focus();
  };

  const left = Math.max(0, FOLLOW_TARGET - follows.length);
  const extra = follows.filter((id) => !sugg.list.some((c) => c.id === id));
  const showList = open && q.trim().length > 0;

  return (
    <div>
      <h1 className="ob-h ob-h-lg" tabIndex={-1} data-step-h>
        Follow {FOLLOW_TARGET} companies you know
      </h1>
      <p className="ob-sub">We show you what changes there. Following is free.</p>

      <div className="ob-search" ref={boxRef}>
        <span className="ob-search-icon" aria-hidden>
          <IconSearch size={16} />
        </span>
        <input
          ref={inputRef}
          className="input ob-search-input"
          placeholder={`Search ${companies.length.toLocaleString("en-US")} companies`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => (h + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => (h - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[hi].id);
            } else if (e.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-expanded={showList}
          aria-controls="ob-results"
          aria-autocomplete="list"
          aria-activedescendant={showList && results[hi] ? `ob-r-${results[hi].id}` : undefined}
          autoComplete="off"
        />
        {q ? (
          <button type="button" className="ob-search-clear" aria-label="Clear search" onClick={() => (setQ(""), inputRef.current?.focus())}>
            <IconX size={14} />
          </button>
        ) : null}
        {showList ? (
          <ul className="ob-results" id="ob-results" role="listbox">
            {results.length ? (
              results.map((c, i) => {
                const on = follows.includes(c.id);
                return (
                  <li
                    key={c.id}
                    id={`ob-r-${c.id}`}
                    role="option"
                    aria-selected={i === hi}
                    className={`ob-result${i === hi ? " ob-result-hi" : ""}`}
                    onMouseEnter={() => setHi(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c.id)}
                  >
                    <CompanyLogo name={c.name} domain={c.iconDomain} />
                    <span className="ob-result-id">
                      <span className="ob-result-name">{c.name}</span>
                      <span className="ob-result-meta mono">{metaOf(c)}</span>
                    </span>
                    <span className={`ob-result-act${on ? " on" : ""}`}>
                      {on ? <IconCheck size={13} /> : <IconPlus size={13} />}
                      {on ? "Following" : "Follow"}
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="ob-result-empty">No company called {q.trim()} yet. You can add it once you are in.</li>
            )}
          </ul>
        ) : null}
      </div>

      {extra.length ? (
        <div className="ob-picked" aria-label="Also following">
          {extra.map((id) => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <span key={id} className="ob-picked-chip">
                <CompanyLogo name={c.name} domain={c.iconDomain} />
                {c.name}
                <button type="button" aria-label={`Unfollow ${c.name}`} onClick={() => toggle(id)}>
                  <IconX size={12} />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="ob-sugg-head">
        <span>Suggested for you</span>
        <span className="ob-sugg-why">{sugg.title}</span>
      </div>
      <ul className="ob-sugg">
        {sugg.list.map((c) => {
          const on = follows.includes(c.id);
          return (
            <li key={c.id} className={`ob-co${on ? " ob-co-on" : ""}`}>
              <div className="ob-co-top">
                <CompanyLogo name={c.name} domain={c.iconDomain} />
                <div className="ob-co-id">
                  <span className="ob-co-name" title={c.name}>
                    {c.name}
                  </span>
                  <span className="ob-co-meta mono">{metaOf(c) || "New on Trading Post"}</span>
                </div>
                <Fit score={c.friendly.score} />
              </div>
              <div className="ob-co-bottom">
                <span className="ob-co-fns">
                  {c.friendly.functions.length ? (
                    c.friendly.functions.slice(0, 3).map((f) => (
                      <span key={f} className={`chip ob-chip-sm${f === fn ? " chip-volt" : ""}`}>
                        {f}
                      </span>
                    ))
                  ) : (
                    <span className="ob-co-none">No functions on file yet</span>
                  )}
                </span>
                <FollowBtn on={on} name={c.name} onClick={() => toggle(c.id)} />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <button type="button" className="ob-skip" onClick={onSkip} disabled={busy}>
          Skip for now
        </button>
        <span className="ob-foot-note mono" aria-live="polite">
          {left ? `${left} more` : `${follows.length} following`}
        </span>
        <button type="button" className="btn btn-primary btn-lg ob-next" disabled={left > 0 || busy} onClick={onNext}>
          {busy ? "Saving" : last ? "Go to Trading Post" : "Continue"}
        </button>
      </div>
    </div>
  );
}

/* ---------- step 3: save your sign-in link ---------- */

function StepLink({ token, busy, onDone }: { token: string; busy: boolean; onDone: () => void }) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => setLink(`${window.location.origin}/?k=${token}`), [token]);

  /** Select the link text, so it can be copied by hand if the clipboard is blocked. */
  const selectLink = () => {
    const el = boxRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      selectLink();
      try {
        document.execCommand("copy");
      } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };
  const mailto = `mailto:?subject=Trading%20Post%20sign-in%20link&body=${encodeURIComponent(link)}`;

  return (
    <div>
      <span className="ob-linkicon" aria-hidden>
        <IconLink size={18} />
      </span>
      <h1 className="ob-h ob-h-lg" tabIndex={-1} data-step-h>
        Save your sign-in link
      </h1>
      <p className="ob-sub">You will need it on other devices. There is no password.</p>

      <div className="ob-linkbox">
        <div ref={boxRef} className="ob-linkbox-text mono" aria-label="Your sign-in link" tabIndex={0} onFocus={selectLink}>
          {link}
        </div>
        <button type="button" className={`btn ob-copy${copied ? " ob-copy-done" : ""}`} onClick={copy}>
          {copied ? <IconCheck size={14} /> : null}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <a className="ob-mailme" href={mailto}>
        Email it to myself
      </a>
      <p className="ob-hint">Anyone with this link can sign in as you. Keep it to yourself.</p>

      <div className="ob-foot">
        <span className="ob-foot-note" />
        <button type="button" className="btn btn-primary btn-lg ob-next" onClick={onDone} disabled={busy}>
          {busy ? "Opening" : "Go to Trading Post"}
        </button>
      </div>
    </div>
  );
}
