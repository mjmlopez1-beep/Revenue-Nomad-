"use client";

/**
 * First run, under 30 seconds. One calm card:
 *   1. Two questions, one tap each (seat, what they are looking for).
 *   2. Follow 3 companies (type-ahead plus 6 suggestions picked from the answers).
 *   3. Keep your sign-in link (only for members who joined here while email sign-in is off).
 * Finishing sends the follows, then the profile last (which marks the member onboarded).
 * The last button names where the member lands: their seats when a seat on file carries
 * their name (Root opens the app there), otherwise the table.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./onboard.css";
import { Brand, CompanyLogo, IconBriefcase, IconCheck, IconCoin, IconSearch, IconStar, IconX, val, type Act, type View } from "../ui/shared";
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

/** Functions that read naturally in "no Sales seat yet". The catch-alls do not. */
const named = (fn: string | null) => (fn && fn !== "Other" && fn !== "Executive" ? fn : null);

/**
 * What the table opens on because of each answer (the app reads the stored key: its first tab
 * and filters follow from it). The answers themselves are GOALS in lib/tableTypes.ts.
 */
const GOAL_OPENS: Record<Goal, (fn: string | null) => string> = {
  roles: () => "The table opens on the fractional roles that are open now. We check for new ones every week.",
  friendly: () => "The table opens on the companies that hire fractionals most.",
  adjacent: (fn) =>
    named(fn)
      ? `The table opens on companies that hired other GTM functions and have no ${fn} seat on file.`
      : "The table opens on companies that hired other GTM functions and have no seat in yours on file.",
  intro: () => "The table opens on seats where the seat holder is on file.",
};

/**
 * One line about a company that works for sparse and rich records: industry, size, and the
 * seats on file with how recent they are ("1 recent seat", "3 seats, 2 recent", "2 past seats").
 */
function metaOf(c: CompanyRec): string {
  const parts = [val(c.cells.industry), val(c.cells.employees)].filter(Boolean) as string[];
  const n = c.engagements.length;
  const f = c.friendly;
  if (n === 1) parts.push(f.recent > 0 ? "1 recent seat" : f.fractional > 0 ? "1 past seat" : "1 seat");
  else if (n > 1) parts.push(f.recent > 0 ? `${n} seats, ${Math.min(n, f.recent)} recent` : f.fractional > 0 ? `${n} past seats` : `${n} seats`);
  return parts.join(" · ");
}

const SUGGESTIONS = 6;

/**
 * How strong the evidence is that a company hires fractionals, for sorting: an open role
 * now, a fractional seat that started recently, or one on file from before.
 */
function fitRank(c: CompanyRec): number {
  const f = c.friendly;
  return f.open > 0 ? 3 : f.recent > 0 ? 2 : f.fractional > 0 ? 1 : 0;
}

/** Six suggestions that match what the member came for. */
function suggest(all: CompanyRec[], goal: Goal | null, fn: string | null): { title: string; list: CompanyRec[] } {
  // Hidden companies (an open role, not yet unlocked) have no name to follow by.
  const companies = all.filter((c) => !c.hidden);
  const rank = new Map(companies.map((c) => [c.id, fitRank(c)]));
  // Many companies tie on score, so recent evidence breaks the tie before name order does.
  const byScore = (a: CompanyRec, b: CompanyRec) =>
    b.friendly.score - a.friendly.score ||
    (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0) ||
    b.engagements.length - a.engagements.length ||
    Number(!!b.iconDomain) - Number(!!a.iconDomain) ||
    a.name.localeCompare(b.name);
  const fnBonus = (c: CompanyRec) => (fn && c.friendly.functions.includes(fn) ? 1 : 0);
  /** Companies with no functions on file say little; keep them only to fill the six. */
  const withFunctions = (list: CompanyRec[]) => {
    const kept = list.filter((c) => c.friendly.functions.length > 0);
    return kept.length >= SUGGESTIONS ? kept : list;
  };
  let pool = companies.slice();
  let title = "Companies that hire fractionals";
  if (goal === "adjacent") {
    const adj = pool.filter((c) => c.friendly.functions.length && (!fn || !c.friendly.functions.includes(fn)));
    pool = (adj.length >= SUGGESTIONS ? adj : pool).sort((a, b) => b.friendly.functions.length - a.friendly.functions.length || byScore(a, b));
    title = named(fn) ? `No ${fn} seat on file yet` : "Hired fractionals in other functions";
  } else if (goal === "intro") {
    pool = withFunctions(pool).sort((a, b) => b.friendly.operators - a.friendly.operators || byScore(a, b));
    title = "A member held a seat here";
  } else {
    pool = withFunctions(pool).sort((a, b) => fnBonus(b) - fnBonus(a) || byScore(a, b));
    if (pool[0] && fnBonus(pool[0]) && named(fn)) title = `Hired a fractional in ${fn}`;
  }
  return { title, list: pool.slice(0, SUGGESTIONS) };
}

function FollowBtn({ on, onClick, name }: { on: boolean; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      className={`btn ob-follow${on ? " btn-pine" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
    >
      {/* The same star as Follow in a company record. */}
      <IconStar size={13} filled={on} />
      {on ? "Following" : "Follow"}
    </button>
  );
}

/**
 * The hand-off on the last step, for a member with seats on file under their name: what is
 * waiting and why it is worth doing first. Nothing for everyone else (they go to the table).
 */
function SeatsNext({ n }: { n: number }) {
  if (!n) return null;
  return (
    <p className="ob-next-up">
      <span className="ob-next-icon" aria-hidden>
        <IconBriefcase size={16} />
      </span>
      <span>
        <strong>{n === 1 ? "1 seat on file carries your name." : `${n} seats on file carry your name.`}</strong> You see everything on{" "}
        {n === 1 ? "it" : "them"} free, and each thing you fill in earns a credit.
      </span>
    </p>
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
  // Seats on file that carry this member's name. When there are any, that is where they go next.
  const mySeats = useMemo(() => view.companies.reduce((n, c) => n + c.engagements.filter((e) => e.yours).length, 0), [view.companies]);
  const lastLabel = mySeats ? `Fill in your ${mySeats === 1 ? "seat" : "seats"}` : "Open the table";

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
        <span className="ob-brand">
          <Brand />
          <span className="ob-product">Trading Post</span>
        </span>
        <span className="ob-credits num" title="Your balance">
          <span className="ob-coin" aria-hidden>
            <IconCoin size={13} />
          </span>
          <span>
            <strong>{me.credits}</strong> credits
          </span>
        </span>
      </header>

      <main className="ob-main">
        <div className="ob-card" ref={cardRef}>
          <div className="ob-progress">
            <div className="ob-dots" role="img" aria-label={`Step ${step} of ${total}`}>
              {Array.from({ length: total }, (_, i) => (
                <i key={i} className={i + 1 === step ? "now" : i + 1 < step ? "done" : ""} />
              ))}
            </div>
            <span className="ob-step num" aria-hidden>
              Step {step} of {total}
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
              nextLabel={linkStep ? "Get my sign-in link" : lastLabel}
              handoff={linkStep ? null : <SeatsNext n={mySeats} />}
              onBack={() => setStep(1)}
              onNext={afterFollow}
              onSkip={afterFollow}
            />
          ) : (
            <StepLink token={me.token} email={me.email} busy={busy} nextLabel={lastLabel} handoff={<SeatsNext n={mySeats} />} onDone={finish} />
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
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Welcome, {first}
      </h1>
      <p className="ob-sub">Two answers decide what you see first. After that you pick a few companies to follow.</p>

      <fieldset className="ob-q">
        <legend className="ob-h">Which GTM function do you work in?</legend>
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
        <p className="ob-hint">We use it to point out open roles in your function and companies that have not hired it yet.</p>
      </fieldset>

      <fieldset className="ob-q">
        <legend className="ob-h">What are you looking for first?</legend>
        <div className="ob-goals" role="radiogroup" aria-label="What you are looking for first">
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
        <p className="ob-hint">{goal ? GOAL_OPENS[goal](fn) : "The table opens on what you pick. Everything else is one filter away."}</p>
      </fieldset>

      <div className="ob-grow" />
      <div className="ob-foot">
        <span className="ob-foot-note" aria-live="polite">
          {ready ? "" : fn ? "Pick what you are looking for" : goal ? "Pick your function" : "Pick one answer for each"}
        </span>
        <button type="submit" className="btn btn-pine btn-lg ob-next" disabled={!ready}>
          Show companies to follow
        </button>
      </div>
    </form>
  );
}

/* ---------- step 2: follow 3 companies ---------- */

function StepFollow({
  companies, byId, fn, goal, follows, toggle, busy, nextLabel, handoff, onBack, onNext, onSkip,
}: {
  companies: CompanyRec[];
  byId: Map<string, CompanyRec>;
  fn: string | null;
  goal: Goal | null;
  follows: string[];
  toggle: (id: string) => void;
  busy: boolean;
  /** What the main button does next (get the sign-in link, or open the app). */
  nextLabel: string;
  /** Shown above the buttons when this is the last step: where the member goes next. */
  handoff: ReactNode;
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
      if (c.hidden) continue;
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
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Follow {FOLLOW_TARGET} companies you know
      </h1>
      <p className="ob-sub">They get their own tab, and we point out what is new there each time you come back. Following is free.</p>

      <div className="ob-search" ref={boxRef}>
        <span className="ob-search-icon" aria-hidden>
          <IconSearch size={16} />
        </span>
        <input
          ref={inputRef}
          className="input ob-search-input"
          placeholder={`Search ${companies.length.toLocaleString("en-US")} companies`}
          aria-label="Search companies"
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
                      <span className="ob-result-meta">{metaOf(c)}</span>
                    </span>
                    <span className={`ob-result-act${on ? " on" : ""}`}>
                      <IconStar size={13} filled={on} />
                      {on ? "Following" : "Follow"}
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="ob-result-empty">Nothing called {q.trim()} is on file yet. You can add it once you are in.</li>
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
                <span className="ob-picked-name">{c.name}</span>
                <button type="button" aria-label={`Unfollow ${c.name}`} onClick={() => toggle(id)}>
                  <IconX size={12} />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="ob-sugg-head">
        <h2>Suggested for you</h2>
        <span className="ob-sugg-why">{sugg.title}</span>
      </div>
      <ul className="ob-sugg">
        {sugg.list.map((c) => {
          const on = follows.includes(c.id);
          const meta = metaOf(c);
          return (
            <li key={c.id} className={`ob-co${on ? " ob-co-on" : ""}`}>
              <div className="ob-co-top">
                <CompanyLogo name={c.name} domain={c.iconDomain} />
                <div className="ob-co-id">
                  <span className="ob-co-name" title={c.name}>
                    {c.name}
                  </span>
                  <span className="ob-co-meta" title={meta || undefined}>
                    {meta || "New on Trading Post"}
                  </span>
                </div>
              </div>
              <div className="ob-co-bottom">
                <span className="ob-co-fns">
                  {c.friendly.functions.length ? (
                    c.friendly.functions.slice(0, 2).map((f) => (
                      <span key={f} className={`chip${f === fn ? " ob-chip-mine" : ""}`}>
                        {f}
                      </span>
                    ))
                  ) : (
                    <span className="ob-co-none">No functions on file yet</span>
                  )}
                  {c.friendly.functions.length > 2 ? <span className="ob-co-more num">+{c.friendly.functions.length - 2}</span> : null}
                  {/* An open role: a row repeats, so the dot is the only ember it carries. */}
                  {c.friendly.open > 0 ? (
                    <span className="ob-tier">
                      <i className="live-dot" aria-hidden />
                      Hiring now
                    </span>
                  ) : null}
                </span>
                <FollowBtn on={on} name={c.name} onClick={() => toggle(c.id)} />
              </div>
            </li>
          );
        })}
      </ul>

      {handoff}

      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <button type="button" className="ob-skip" onClick={onSkip} disabled={busy}>
          Skip for now
        </button>
        <span className="ob-foot-note num" aria-live="polite">
          {left ? `Follow ${left} more` : `Following ${follows.length}`}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" disabled={left > 0 || busy} aria-busy={busy} onClick={onNext}>
          {busy ? "Saving" : nextLabel}
        </button>
      </div>
    </div>
  );
}

/* ---------- step 3: keep your sign-in link ---------- */

function StepLink({
  token, email, busy, nextLabel, handoff, onDone,
}: {
  token: string;
  email: string;
  busy: boolean;
  nextLabel: string;
  handoff: ReactNode;
  onDone: () => void;
}) {
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
  const mailto = `mailto:${encodeURIComponent(email)}?subject=Trading%20Post%20sign-in%20link&body=${encodeURIComponent(link)}`;

  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Keep your sign-in link
      </h1>
      <p className="ob-sub">This link is how you sign in. There is no password, so save it where you will find it again.</p>

      <div className="ob-linkbox">
        <div ref={boxRef} className="ob-linkbox-text mono" aria-label="Your sign-in link" tabIndex={0} onFocus={selectLink}>
          {link}
        </div>
        <button type="button" className={`btn ob-copy${copied ? " ob-copy-done" : ""}`} onClick={copy}>
          {copied ? <IconCheck size={14} /> : null}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <a className="ob-mailme" href={mailto}>
        Email it to myself
      </a>
      <p className="ob-hint ob-hint-flush">Anyone with this link can sign in as you. Keep it to yourself.</p>

      {handoff}

      <div className="ob-grow" />
      <div className="ob-foot">
        <span className="ob-foot-note" />
        <button type="button" className="btn btn-pine btn-lg ob-next" onClick={onDone} disabled={busy} aria-busy={busy}>
          {busy ? "Opening" : nextLabel}
        </button>
      </div>
    </div>
  );
}
