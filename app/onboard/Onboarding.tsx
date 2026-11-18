"use client";

/**
 * First run, about two minutes, and it ends on the member's first saved view. One calm card, and
 * the value comes before the ask:
 *   1. What Merlin is and what a credit buys, then their function and the title they go by. A
 *      member with seats on file hears where those came from and who can see their name, since
 *      most of them arrive by personal link and skip the landing page.
 *   2. Their Ideal Fractional Profile: the companies they want as clients (industries, size,
 *      revenue, where). Every part optional.
 *   3. "Which fractional usually gets hired before you?": up to 3 functions, suggested first
 *      (firstView.ts beforeOrder), or "Not sure". Stored as Me.before.
 *   4. Their first view: companies in their profile that hired a fractional in those functions in
 *      the last 12 months and have no fractional in theirs yet (widened until it shows enough), the
 *      top 3 rows, and one button, "Save this view", with the weekly email on. "Also show open
 *      <function> roles" saves the open roles in their function as a second view.
 *   5. Find your seats: they type past and current clients and claim the seats we found there, or
 *      add one we don't have. Each answer they add earns a credit.
 *   6. Keep your sign-in link (only for members who joined here while email sign-in is off).
 * Each step is a history entry, so back steps back and forward steps forward. The answers are
 * kept for the tab (a reload comes back to the same step) and on the server after each step (a
 * new tab or another device picks up there too). Finishing sends the profile, which marks the
 * member onboarded with their first view, and the table opens on that view. A member with seats
 * on file under their name also gets "Fill in your seats" (Root opens the app there).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./onboard.css";
import { Brand, CompanyLogo, IconBriefcase, IconCheck, IconCoin, IconLock, post, val, type Act, type View } from "../ui/shared";
import { FUNCTIONS } from "@/lib/tableFields";
import type { CompanyRec, Icp, OnboardDraft } from "@/lib/tableTypes";
import { countryOf, deriveAll, hireLine, hireOfRow, icpEmpty, type Filters, type Row } from "@/app/post/model";
import { EMPTY_ICP, IcpFields, countriesByCount, industriesByCount } from "@/app/post/Hunt";
import { alertView, named, realTitle, titlesFor } from "./suggest";
import { FindSeats, SEAT_YIELD, seatsFound } from "./FindSeats";
import {
  BEFORE_MAX, PREVIEW_ROWS, andList, beforeOrder, firstView, firstViewLine, goalFor, guessLine, holderOnFile, holdersLine, newerAnswers, openRolesCount, resumeStep, toggleBefore,
  widenLine, type FirstView,
} from "./firstView";
import { ICP_SKIPPED } from "@/app/post/getStarted";
import { contactOf, mailto } from "../landing/contact";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import { invitedParts } from "@/lib/notify/format";

export interface OnboardingProps {
  view: View;
  act: Act;
  /** Call when the member finishes (after the profile action marks them onboarded). */
  onDone: () => Promise<void> | void;
  /**
   * Called first when the member picks "Skip to the table", before the profile action reloads
   * the view: the app then opens on the table, not on their seats.
   */
  onSkip?: () => void;
}

/* ---------- where the member is: history entry, tab storage and the server's draft ---------- */

/** The tab keeps the answers (sessionStorage), so a reload on step 4 still has the answers it needs. */
const SAVE_KEY = "tp_ob";
/** The answers as this tab keeps them: a draft (OnboardDraft) with the member's id. `fn` is how a tab from before kept the function. */
type Saved = Partial<OnboardDraft> & { id: string; fn?: string | null };
function readSaved(id: string): Saved | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null");
    return s && s.id === id ? s : null;
  } catch {
    return null;
  }
}
function writeSaved(s: Saved | null) {
  try {
    if (s) sessionStorage.setItem(SAVE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SAVE_KEY);
  } catch {}
}
/** The function a visitor picked in "Try it" on the landing page (localStorage, see app/landing/TryIt.tsx), or null. */
const TRY_FN_KEY = "tp_try_fn";
function triedFn(): string | null {
  try {
    const v = localStorage.getItem(TRY_FN_KEY);
    return v && FUNCTIONS.includes(v) ? v : null;
  } catch {
    return null;
  }
}
/** The step this history entry holds, or 0 when it holds none. */
function entryStep(): number {
  const n = Number(window.history.state?.ob);
  return Number.isInteger(n) && n >= 1 ? n : 0;
}
/** The first step this tab's history holds (a resumed flow starts past step 1, with no entries behind it). */
function entryBase(): number {
  const n = Number(window.history.state?.obBase);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
/** The table opens on the member's first view: the address keeps no other place (a company link stays). */
function clearPlace() {
  try {
    const u = new URL(window.location.href);
    for (const k of ["v", "t", "s", "f", "q", "af", "p"]) u.searchParams.delete(k);
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  } catch {}
}

/**
 * For a member with seats on file under their name: what is waiting and why it is worth doing,
 * with "Fill in your seats" (the main button opens the table). Shown on the last step above the
 * list, so it is the first thing they read there. Nothing for everyone else.
 */
function SeatsNext({ n, busy, onFill }: { n: number; busy?: boolean; onFill?: () => void }) {
  if (!n) return null;
  return (
    <div className="ob-next-up">
      <span className="ob-next-icon" aria-hidden>
        <IconBriefcase size={16} />
      </span>
      <span className="ob-next-text">
        <span>
          <strong>{n === 1 ? "1 seat on file carries your name." : `${n} seats on file carry your name.`}</strong> You see everything on{" "}
          {n === 1 ? "it" : "them"} free, and each answer you add there earns a credit.
        </span>
        {onFill ? (
          <button type="button" className="btn ob-fill" disabled={busy} onClick={onFill}>
            Fill in your {n === 1 ? "seat" : "seats"}
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** What the saved views of the first view step were saved as: a change of answer means saving again. */
const signature = (fv: FirstView, roles: boolean, email: boolean, fn: string | null, icp: Icp) =>
  JSON.stringify({ p: fv.place, n: fv.name, r: roles && named(fn) ? alertView(fn, icpEmpty(icp) ? null : icp).place : null, e: email });

export default function Onboarding({ view, act, onDone, onSkip }: OnboardingProps) {
  const me = view.me!;
  const first = (me.name || "").trim().split(/\s+/)[0] || "there";
  const linkStep = me.id.startsWith("j_") && !view.email;
  // 1 who you are, 2 your Ideal Fractional Profile, 3 who gets hired before you, 4 your first view, 5 find your seats, 6 keep your link.
  const total = linkStep ? 6 : 5;
  const { support } = contactOf(view);

  // Answers from this tab (a reload) or the server (another tab or device), whichever is newer, else what the server already knows.
  const [init] = useState(() => {
    const tab = readSaved(me.id);
    const server: Saved | null = me.draft ? { ...me.draft, id: me.id } : null;
    const a: Saved = newerAnswers(tab, server) ?? { id: me.id };
    const known = new Set(view.companies.map((c) => c.id));
    const saved = new Set((me.savedViews ?? []).map((v) => v.id));
    // A function picked on the landing page's "Try it" comes before one guessed from the title.
    const picked = a.function ?? a.fn;
    const fn = (picked && FUNCTIONS.includes(picked) ? picked : null) ?? triedFn() ?? (me.function && FUNCTIONS.includes(me.function) ? me.function : null);
    // No title yet means an empty field with the placeholder showing, never a stored "Member".
    const title = typeof a.title === "string" ? a.title : realTitle(me.title);
    const icp = a.icp ?? me.icp ?? EMPTY_ICP;
    // Their own function can't come before them. An answer left with nothing once it is taken off is unanswered, not "Not sure".
    const raw = Array.isArray(a.before) ? a.before : Array.isArray(me.before) ? me.before : null;
    const kept = raw ? raw.filter((f) => FUNCTIONS.includes(f) && f !== fn).slice(0, BEFORE_MAX) : null;
    const before = raw && raw.length && kept && !kept.length ? null : kept;
    const clients = Array.isArray(a.clients) ? a.clients.filter((id) => id.startsWith("name:") || known.has(id)).slice(0, 20) : [];
    const views = Array.isArray(a.views) ? a.views.filter((id) => saved.has(id)) : [];
    const step = resumeStep(entryStep() || a.step || 1, { fn, before }, total);
    return {
      fn, title, icp, before, clients, views, step,
      roles: a.roles !== false,
      email: a.email !== false,
      saved: views.length && typeof a.saved === "string" ? a.saved : null,
    };
  });
  const [step, setStep] = useState(init.step);
  const [fn, setFn] = useState<string | null>(init.fn);
  const [title, setTitle] = useState(init.title);
  const [icp, setIcp] = useState<Icp>(init.icp);
  const [before, setBefore] = useState<string[] | null>(init.before);
  const [roles, setRoles] = useState(init.roles);
  const [email, setEmail] = useState(init.email);
  const [clients, setClients] = useState<string[]>(init.clients);
  /** The saved views the first view step made (the first view, then the open roles), and what they were saved as. */
  const [views, setViews] = useState<string[]>(init.views);
  const [saved, setSaved] = useState<string | null>(init.saved);
  /** The first view was saved on this visit: Find your seats says so at its top. */
  const [justSaved, setJustSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const rewinding = useRef(false);
  /** The first step this tab's history holds. Back from it steps back in place rather than leaving the page. */
  const base = useRef(1);
  const cardRef = useRef<HTMLDivElement>(null);
  // Seats on file that carry this member's name. When there are any, that is where they go next.
  const mySeats = useMemo(() => view.companies.reduce((n, c) => n + c.engagements.filter((e) => e.yours).length, 0), [view.companies]);
  // Of those, the ones we matched to work they published with us (the rest a member added with their name on it).
  const published = useMemo(
    () => view.companies.reduce((n, c) => n + c.engagements.filter((e) => e.yours && (e.source === "Published engagement" || e.source === "Member success story")).length, 0),
    [view.companies],
  );
  const emailOn = !!view.scan?.digest;
  // Credits earned on the way (a seat added on Find your seats): "+4" beside the balance for a moment.
  const [bump, setBump] = useState(0);
  const prevCredits = useRef(me.credits);
  useEffect(() => {
    const d = me.credits - prevCredits.current;
    prevCredits.current = me.credits;
    if (d <= 0) return;
    setBump(d);
    const t = setTimeout(() => setBump(0), 2400);
    return () => clearTimeout(t);
  }, [me.credits]);

  /* ----- the first view, from the answers ----- */
  const infos = useMemo(() => deriveAll(view.companies), [view.companies]);
  const order = useMemo(() => beforeOrder(infos, fn), [infos, fn]);
  const fv = useMemo(() => (before === null ? null : firstView(infos, me, { fn, icp: icpEmpty(icp) ? null : icp, before, suggested: order.suggested })), [infos, me, fn, icp, before, order]);
  // Open roles in their function that fit their profile now, for "Also show open <function> roles" (counted when the first view shows).
  const openRoles = useMemo(() => (step === 4 ? openRolesCount(infos, me, fn, icpEmpty(icp) ? null : icp) : 0), [step, infos, me, fn, icp]);
  const sig = fv ? signature(fv, roles, email, fn, icp) : null;
  /** The views saved on the first view step still say what the answers say now. */
  const savedNow = !!views.length && saved === sig;

  // A step needs the answers before it. If they are missing (storage was cleared), ask again.
  const shown = resumeStep(step, { fn, before }, total);

  /* ----- history: back steps back, forward steps forward, a reload comes back to the step ----- */

  // Each step opens at its top, so the browser never brings back an old scroll. That matters most
  // when finishing takes history back to the first step's entry: the app must open at its top, not
  // where the first step was scrolled. The mode is kept per entry, so it is set before any is left.
  useEffect(() => {
    try {
      window.history.scrollRestoration = "manual";
    } catch {}
  }, []);

  useEffect(() => {
    // A reload keeps this tab's entries (and the first one they hold). A new tab that picks up at step 4 has none behind it.
    const had = entryStep();
    base.current = had ? Math.min(entryBase(), init.step) : init.step;
    if (had !== init.step || entryBase() !== base.current) window.history.replaceState({ ob: init.step, obBase: base.current }, "");
    const onPop = () => {
      if (rewinding.current) return;
      setStep(Math.min(Math.max(1, entryStep() || base.current), total));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [init.step, total]);

  /** The answers as they are now, for the tab and for the server's draft. */
  const answers = (atStep: number): Saved => ({
    id: me.id,
    step: atStep,
    function: fn,
    title,
    icp: icpEmpty(icp) ? null : icp,
    before,
    roles,
    email,
    clients,
    views,
    saved,
    at: new Date().toISOString(),
  });
  const latest = useRef(answers);
  latest.current = answers;
  useEffect(() => writeSaved(latest.current(step)), [me.id, step, fn, title, icp, before, roles, email, clients, views, saved]);

  // Each new step goes to the server too, so a new tab or another device picks up here (the step it opened on is already there).
  const opened = useRef(true);
  useEffect(() => {
    if (opened.current) {
      opened.current = false;
      return;
    }
    const { id: _id, ...draft } = latest.current(step);
    void post({ action: { type: "onboardDraft", draft } });
  }, [step]);

  // New step: start at the top of the card, and move focus to its heading for screen readers.
  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>("[data-step-h]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [shown]);

  const forward = (n: number) => {
    setStep(n);
    window.history.pushState({ ob: n, obBase: base.current }, "");
  };
  const back = () => {
    if (step > base.current && entryStep() === step) window.history.back();
    else {
      const n = Math.max(1, step - 1);
      base.current = Math.min(base.current, n);
      setStep(n);
      window.history.replaceState({ ob: n, obBase: base.current }, "");
    }
  };
  /** Take the step entries back off history before the app opens, so back in the app never lands on a step. */
  const rewind = () =>
    new Promise<void>((done) => {
      const k = entryStep() - base.current;
      if (k <= 0) return done();
      rewinding.current = true;
      const end = () => {
        window.removeEventListener("popstate", end);
        clearTimeout(t);
        rewinding.current = false;
        done();
      };
      const t = setTimeout(end, 600);
      window.addEventListener("popstate", end);
      window.history.go(-k);
    });

  /* ----- saving the first view ----- */

  /**
   * "Save this view": the first view (and the open roles in their function, when that's on), with
   * the weekly email as ticked. Saved again after a change of answer, in place of the ones before.
   */
  const saveFirst = async () => {
    if (!fv || busy) return;
    if (savedNow) return forward(5);
    setBusy(true);
    for (const id of views) await act({ type: "savedView", op: "delete", id }, { quiet: true, silentError: true });
    setViews([]);
    setSaved(null);
    const r = await act({ type: "savedView", op: "save", name: fv.name, place: fv.place, criteria: fv.criteria, email }, { quiet: true });
    if (!r.ok || !r.id) {
      setBusy(false);
      return;
    }
    const ids = [r.id];
    if (roles && named(fn)) {
      const av = alertView(fn, icpEmpty(icp) ? null : icp);
      const r2 = await act({ type: "savedView", op: "save", name: av.name, place: av.place, criteria: av.criteria, email }, { quiet: true });
      if (r2.ok && r2.id) ids.push(r2.id);
    }
    setViews(ids);
    setSaved(sig);
    setJustSaved(true);
    setBusy(false);
    forward(5);
  };

  /**
   * Finish with what is answered so far. `skip`: "Skip to the table", from any step. The profile
   * action marks the member onboarded either way, so a reload never brings them back here.
   */
  const finish = async (skip = false, to: "table" | "seats" = "table") => {
    if (busy) return;
    setBusy(true);
    // The app opens on the table their answers built, unless they asked for their seats.
    if (skip || to !== "seats") onSkip?.();
    await rewind();
    window.scrollTo(0, 0);
    // With a first view saved, the table opens on it.
    if (views[0]) clearPlace();
    const r = await act(
      {
        type: "profile",
        function: fn ?? undefined,
        ...(fn ? { goal: goalFor(fn) } : {}),
        ...(title.trim() !== realTitle(me.title) ? { title: title.trim() } : {}),
        icp: icpEmpty(icp) ? null : icp,
        ...(before !== null ? { before } : {}),
        ...(views[0] ? { firstView: views[0] } : {}),
      },
      { quiet: true },
    );
    if (!r.ok) {
      setBusy(false);
      if (step > base.current && entryStep() !== step) window.history.pushState({ ob: step, obBase: base.current }, "");
      return;
    }
    writeSaved(null);
    // No Ideal Fractional Profile picked: the table doesn't ask for one again in this visit (app/post/TradingPost.tsx).
    if (icpEmpty(icp))
      try {
        sessionStorage.setItem(ICP_SKIPPED, "1");
      } catch {}
    await onDone();
  };

  const afterSeats = () => (linkStep ? forward(6) : finish(false, "table"));

  return (
    <div className="ob">
      <header className="ob-top">
        <span className="ob-brand">
          <Brand size={28} />
          <span className="ob-product">by Revenue Nomad</span>
        </span>
        <span className="ob-credits num" title="Your balance">
          <span className="ob-coin" aria-hidden>
            <IconCoin size={13} />
          </span>
          <span>
            <strong>{me.credits}</strong> credits
          </span>
          {bump > 0 ? (
            <span className="ob-credits-bump" aria-hidden>
              +{bump}
            </span>
          ) : null}
        </span>
      </header>

      <main className="ob-main">
        <div className="ob-card" ref={cardRef}>
          {/* The welcome step opens on the mountain banner (scripts/make-banner.py makes the images). */}
          {shown === 1 ? (
            <img
              className="ob-banner"
              src="/brand/merlin-banner-onboarding.webp"
              srcSet="/brand/merlin-banner-onboarding-1000.webp 1000w, /brand/merlin-banner-onboarding.webp 2000w"
              sizes="(max-width: 640px) 100vw, 720px"
              width={2000}
              height={470}
              alt=""
              decoding="async"
              fetchPriority="high"
            />
          ) : null}
          <div className="ob-progress">
            <div className="ob-dots" role="img" aria-label={`Step ${shown} of ${total}`}>
              {Array.from({ length: total }, (_, i) => (
                <i key={i} className={i + 1 === shown ? "now" : i + 1 < shown ? "done" : ""} />
              ))}
            </div>
            <span className="ob-step num" aria-hidden>
              Step {shown} of {total}
            </span>
            {/* Not on the sign-in link step: leaving there without the link is the one thing to avoid. */}
            {shown === 6 ? null : (
              <button type="button" className="ob-skip" onClick={() => finish(true)} disabled={busy}>
                Skip to the table
              </button>
            )}
          </div>

          {shown === 1 ? (
            <StepQuestions
              first={first}
              seats={mySeats}
              published={published}
              credits={me.credits}
              invited={me.invitedBy ? invitedParts(me.invitedBy.first, me.invitedBy.both, REFERRAL_BONUS) : null}
              fn={fn}
              setFn={(f) => {
                setFn(f);
                // Their own function can't come before them. Taking off their only pick leaves the question unanswered, not "Not sure".
                setBefore((b) => {
                  if (!b || !b.includes(f)) return b;
                  const rest = b.filter((x) => x !== f);
                  return rest.length ? rest : null;
                });
              }}
              title={title}
              setTitle={setTitle}
              onNext={() => forward(2)}
            />
          ) : shown === 2 ? (
            <StepClients companies={view.companies} icp={icp} setIcp={setIcp} onBack={back} onNext={() => forward(3)} />
          ) : shown === 3 ? (
            <StepBefore fn={fn} order={order.order} suggested={order.suggested} before={before} setBefore={setBefore} onBack={back} onNext={() => forward(4)} />
          ) : shown === 4 && fv ? (
            <StepFirstView
              fv={fv}
              fn={fn}
              icp={icp}
              openRoles={openRoles}
              roles={roles}
              setRoles={setRoles}
              email={email}
              setEmail={setEmail}
              emailOn={emailOn}
              savedNow={savedNow}
              busy={busy}
              onBack={back}
              onSave={saveFirst}
            />
          ) : shown === 5 ? (
            <StepSeats
              companies={view.companies}
              fn={fn}
              title={title}
              name={me.name}
              credits={me.credits}
              clients={clients}
              setClients={setClients}
              act={act}
              savedLine={justSaved && savedNow ? (email && emailOn ? "Your first view is saved. New ones come in your weekly email." : "Your first view is saved under Saved views.") : null}
              handoff={linkStep ? null : <SeatsNext n={mySeats} busy={busy} onFill={() => finish(false, "seats")} />}
              nextLabel={linkStep ? "Get my sign-in link" : "Open my table"}
              busy={busy}
              onBack={back}
              onNext={afterSeats}
            />
          ) : (
            <StepLink token={me.token} email={me.email} support={support} emailOn={view.email} busy={busy} nextLabel="Open my table" seats={mySeats} onDone={(to) => finish(false, to)} />
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- step 1: what this is, then who you are ---------- */

function StepQuestions({
  first, seats, published, credits, invited, fn, setFn, title, setTitle, onNext,
}: {
  first: string;
  /** Seats on file that carry the member's name. */
  seats: number;
  /** How many of them we matched to fractional work they published on Revenue Nomad. */
  published: number;
  credits: number;
  /** "Ivy invited you." and "You both get 10 credits when you add your first fact." (invitedParts), for a member who joined from an invite. */
  invited: [string, string] | null;
  fn: string | null;
  setFn: (f: string) => void;
  title: string;
  setTitle: (t: string) => void;
  onNext: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (fn) onNext();
      }}
    >
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Welcome, {first}
      </h1>
      <p className="ob-sub">
        Merlin is where fractional leaders share which companies hired fractionals, for which seat, who held it and what it paid.
        {seats
          ? ` ${
              published === seats
                ? `We started it from the fractional work you published on Revenue Nomad, so ${seats === 1 ? "1 seat already carries" : `${seats} seats already carry`} your name.`
                : published > 0
                  ? `${seats} seats already carry your name. We matched ${published} to the fractional work you published on Revenue Nomad, and members added the rest.`
                  : `Members have already put your name on ${seats === 1 ? "1 seat" : `${seats} seats`}.`
            } Other members see your name on a seat only after they spend 1 credit.`
          : null}
      </p>
      <p className="ob-credit-note">
        <span className="ob-coin" aria-hidden>
          <IconCoin size={13} />
        </span>
        <span>
          {/* Joined from an invite: who sent it, and the credits it brings once they add a first fact. One note with the credits, so the first question stays near the top on a phone. */}
          {invited ? (
            <>
              <strong>{invited[0]}</strong> {invited[1]}{" "}
            </>
          ) : null}
          You have{" "}
          <strong className="num">
            {credits} {credits === 1 ? "credit" : "credits"}
          </strong>
          . A credit shows you one thing another member added, like who held a seat or an open role. Adding what you know earns credits back.
        </span>
      </p>

      <fieldset className="ob-q">
        <legend className="ob-h">Which function do you work in?</legend>
        <div className="ob-chips" role="radiogroup" aria-label="Your function">
          {FUNCTIONS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={fn === f} className={`ob-chip${fn === f ? " ob-chip-on" : ""}`} onClick={() => setFn(f)}>
              {f}
            </button>
          ))}
        </div>
        <p className="ob-hint">We use it to find companies that haven&apos;t hired a fractional in your function yet, and open roles in it.</p>
      </fieldset>

      <div className="ob-q">
        <label className="ob-h" htmlFor="ob-title">
          Your title
        </label>
        <input
          id="ob-title"
          className="input ob-title-input"
          value={title}
          maxLength={80}
          placeholder={titlesFor(fn)[0] ?? "Fractional VP Sales"}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="organization-title"
        />
        {!title.trim() && titlesFor(fn).length ? (
          <div className="ob-title-picks" aria-label="Titles to pick from">
            {titlesFor(fn).map((t) => (
              <button key={t} type="button" className="ob-title-pick" onClick={() => setTitle(t)}>
                {t}
              </button>
            ))}
          </div>
        ) : null}
        <p className="ob-hint">Members see it when you message them.</p>
      </div>

      <div className="ob-grow" />
      <div className="ob-foot">
        <span className="ob-foot-note" aria-live="polite">
          {fn ? "" : "Pick your function"}
        </span>
        <button type="submit" className="btn btn-pine btn-lg ob-next" disabled={!fn}>
          Next: your profile
        </button>
      </div>
    </form>
  );
}

/* ---------- step 2: your Ideal Fractional Profile, the companies you want as clients (optional) ---------- */

function StepClients({ companies, icp, setIcp, onBack, onNext }: { companies: CompanyRec[]; icp: Icp; setIcp: (v: Icp) => void; onBack: () => void; onNext: () => void }) {
  const industries = useMemo(() => industriesByCount(companies), [companies]);
  const countries = useMemo(() => countriesByCount(companies), [companies]);
  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Your Ideal Fractional Profile
      </h1>
      <p className="ob-sub">The companies you want as clients. Your first view shows companies like these. Pick as many as fit, or skip it.</p>
      <IcpFields value={icp} onChange={setIcp} industries={industries} countries={countries} headingClass="ob-h" />
      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <span className="ob-foot-note" aria-live="polite">
          {icpEmpty(icp) ? "You can skip this and pick later" : ""}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" onClick={onNext}>
          Next: who comes before you
        </button>
      </div>
    </div>
  );
}

/* ---------- step 3: which fractional usually gets hired before you ---------- */

function StepBefore({
  fn, order, suggested, before, setBefore, onBack, onNext,
}: {
  fn: string | null;
  /** Every function it offers, the suggested ones first (beforeOrder). */
  order: string[];
  suggested: string[];
  /** The answer: null not yet, [] Not sure. */
  before: string[] | null;
  setBefore: (b: string[] | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const nfn = named(fn);
  const picked = before ?? [];
  const unsure = before !== null && before.length === 0;
  const full = picked.length >= BEFORE_MAX;
  const chip = (f: string) => {
    const on = picked.includes(f);
    return (
      <button
        key={f}
        type="button"
        aria-pressed={on}
        aria-disabled={!on && full}
        className={`ob-chip${on ? " ob-chip-on" : ""}${!on && full ? " ob-chip-full" : ""}`}
        onClick={() => setBefore(toggleBefore(before, f))}
      >
        {f}
      </button>
    );
  };
  const rest = order.filter((f) => !suggested.includes(f));
  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Which fractional usually gets hired before you?
      </h1>
      <p className="ob-sub">
        Pick up to {BEFORE_MAX}. A company that just hired one of them often needs {nfn ? `a fractional ${nfn} leader` : "you"} next, and the fractional who held that seat is a natural referral partner.
      </p>
      <fieldset className="ob-q">
        <legend className="ob-label">{nfn ? `Usually before ${nfn}` : "Hired most often"}</legend>
        <div className="ob-chips" role="group" aria-label={nfn ? `Usually before ${nfn}` : "Hired most often"}>
          {suggested.map(chip)}
          <button type="button" aria-pressed={unsure} className={`ob-chip ob-chip-unsure${unsure ? " ob-chip-on" : ""}`} onClick={() => setBefore(unsure ? null : [])}>
            Not sure
          </button>
        </div>
      </fieldset>
      <fieldset className="ob-q ob-q-tight">
        <legend className="ob-label">Every other function</legend>
        <div className="ob-chips" role="group" aria-label="Every other function">
          {rest.map(chip)}
        </div>
      </fieldset>
      <p className="ob-hint">You can change this later in Your profile.</p>
      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <span className="ob-foot-note num" aria-live="polite">
          {unsure ? `We'll start with ${andList(suggested)}` : picked.length ? (full ? `${BEFORE_MAX} picked, the most` : `${picked.length} of ${BEFORE_MAX} picked`) : `Pick up to ${BEFORE_MAX}, or Not sure`}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" disabled={before === null} onClick={onNext}>
          Show my first view
        </button>
      </div>
    </div>
  );
}

/* ---------- step 4: your first view ---------- */

/** One row of the first view, free facts only: the company (or that it's hiring now), the hire, and that its seat holder is on file. */
function FirstRow({ r, f }: { r: Row; f: Filters }) {
  const c = r.i.c;
  const e = hireOfRow(r, f.hiredFn, f.hiredWithin);
  const hire = e ? hireLine(e) : null;
  const emp = val(c.cells.employees);
  const meta = [val(c.cells.industry), emp && `${emp} employees`, countryOf(c) ?? val(c.cells.hq)].filter(Boolean).join(" · ");
  // Who held the seat: a lock, never a name. They are the member's potential referral partner.
  const holder = holderOnFile(e);
  return (
    <li className="ob-fv-row">
      <CompanyLogo name={c.hidden ? "" : c.name} domain={c.hidden ? null : c.iconDomain} hidden={c.hidden} seed={c.id} />
      <div className="ob-fv-id">
        <span className="ob-fv-name">{c.hidden ? "A company that's hiring now" : c.name}</span>
        {meta ? <span className="ob-fv-meta">{meta}</span> : null}
        {hire ? (
          <span className="ob-fv-hire">
            {hire.what}
            {hire.when ? <span className="num"> · {hire.when}</span> : null}
          </span>
        ) : null}
        {holder ? (
          <span className="ob-fv-holder">
            <span className="ob-fv-lock" aria-hidden>
              <IconLock size={12} />
            </span>
            <span>Seat holder on file, a potential referral partner</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

function StepFirstView({
  fv, fn, icp, openRoles, roles, setRoles, email, setEmail, emailOn, savedNow, busy, onBack, onSave,
}: {
  fv: FirstView;
  fn: string | null;
  icp: Icp;
  /** Open roles in their function that fit their profile now. */
  openRoles: number;
  roles: boolean;
  setRoles: (v: boolean) => void;
  email: boolean;
  setEmail: (v: boolean) => void;
  /** The weekly email can go out (email is set up). Otherwise the views are still saved. */
  emailOn: boolean;
  /** Saved already, as it is now: the button moves on. */
  savedNow: boolean;
  busy: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  const nfn = named(fn);
  const notes = [widenLine(fv, fn), guessLine(fv, fn)].filter(Boolean) as string[];
  const top = fv.rows.slice(0, PREVIEW_ROWS);
  const more = fv.rows.length - top.length;
  const partners = holdersLine(fv);
  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Your first view
      </h1>
      <p className="ob-fv-lead">{firstViewLine(fv, fn)}</p>
      {notes.map((n) => (
        <p key={n} className="ob-hint ob-fv-note">
          {n}
        </p>
      ))}
      {top.length ? (
        <ul className="ob-fv-rows" aria-label="The first companies in your first view">
          {top.map((r) => (
            <FirstRow key={r.key} r={r} f={fv.f} />
          ))}
        </ul>
      ) : null}
      {more > 0 ? <p className="ob-fv-more num">And {more === 1 ? "1 more" : `${more.toLocaleString("en-US")} more`}, the most recent hire first.</p> : null}
      {partners ? (
        <p className="ob-fv-partners num">
          <span className="ob-fv-lock" aria-hidden>
            <IconLock size={12} />
          </span>
          <span>{partners}</span>
        </p>
      ) : null}

      <div className="ob-alerts ob-fv-opts">
        <label className="ob-alerts-opt">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          <span className="ob-alerts-text">
            <span className="ob-alerts-label">Email me new ones each week</span>
            <span className="ob-alerts-hint">
              {emailOn ? "Only when a company newly matches. Slack too, once you connect it in Integrations." : "Email starts once it's switched on for the pilot. Your view is saved either way."}
            </span>
          </span>
        </label>
        {nfn ? (
          <button type="button" role="switch" aria-checked={roles} className={`ob-switch${roles ? " on" : ""}`} onClick={() => setRoles(!roles)}>
            <span className="ob-switch-track" aria-hidden>
              <span className="ob-switch-thumb" />
            </span>
            <span className="ob-alerts-text">
              <span className="ob-alerts-label">Also show open {nfn} roles</span>
              <span className="ob-alerts-hint num">
                {openRoles > 0
                  ? `${openRoles === 1 ? "1 is" : `${openRoles} are`} open${icpEmpty(icp) ? "" : " in your profile"} now. They get a view of their own.`
                  : `None open${icpEmpty(icp) ? "" : " in your profile"} right now. They get a view of their own for when one opens.`}
              </span>
            </span>
          </button>
        ) : null}
      </div>

      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <span className="ob-foot-note" aria-live="polite">
          {savedNow ? "Saved under Saved views" : ""}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" disabled={busy} aria-busy={busy} onClick={onSave}>
          {busy ? "Saving" : savedNow ? "Next: find your seats" : "Save this view"}
        </button>
      </div>
    </div>
  );
}

/* ---------- step 5: find your seats (optional) ---------- */

function StepSeats({
  companies, fn, title, name, credits, clients, setClients, act, savedLine, handoff, nextLabel, busy, onBack, onNext,
}: {
  companies: CompanyRec[];
  fn: string | null;
  title: string;
  name: string;
  /** The balance now, so a seat added here can say what it earned. */
  credits: number;
  clients: string[];
  setClients: (f: (c: string[]) => string[]) => void;
  act: OnboardingProps["act"];
  /** The first view was just saved: one line at the top says so. */
  savedLine: string | null;
  /** For a member with seats on file: where they go next. */
  handoff: ReactNode;
  nextLabel: string;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  // Seats added here, by client: the balance before each, so the card says what the seat earned.
  const [added, setAdded] = useState<Record<string, number>>({});
  const claimedN = seatsFound(companies, clients, added);
  return (
    <div>
      {savedLine ? (
        <p className="ob-seat-ok ob-fv-saved" role="status">
          <IconCheck size={13} />
          <span>{savedLine}</span>
        </p>
      ) : null}
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Find your seats
      </h1>
      <p className="ob-sub">
        Type the clients you work with now or worked with before. We list the seats we found there in your function. Claim yours and you see everything on it free, and each answer
        you add earns a credit, {SEAT_YIELD}.
      </p>
      {handoff}
      <FindSeats companies={companies} fn={fn} title={title} name={name} credits={credits} clients={clients} setClients={setClients} act={act} added={added} setAdded={setAdded} />

      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <span className="ob-foot-note num" aria-live="polite">
          {claimedN ? `${claimedN} ${claimedN === 1 ? "seat is" : "seats are"} yours` : "You can skip this and add seats later"}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" disabled={busy} aria-busy={busy} onClick={onNext}>
          {busy ? "Opening" : nextLabel}
        </button>
      </div>
    </div>
  );
}

/* ---------- step 6: keep your sign-in link ---------- */

function StepLink({
  token, email, support, emailOn, seats, busy, nextLabel, onDone,
}: {
  token: string;
  email: string;
  /** Where a member asks for a new link (View.contact.support), or null. */
  support: string | null;
  /** Email sign-in is on: a lost link is never the end, a new one comes by email. */
  emailOn: boolean;
  /** Seats on file under their name ("Fill in your seats"). */
  seats: number;
  busy: boolean;
  nextLabel: string;
  onDone: (to: "table" | "seats") => void;
}) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  // Copied, emailed or shared: until then, saving the link is the main action and moving on asks first.
  const [kept, setKept] = useState(false);
  // Where they tried to go without saving the link: the check before leaving shows.
  const [leaving, setLeaving] = useState<"table" | "seats" | null>(null);
  const [canShare, setCanShare] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLDivElement>(null);
  useEffect(() => setLink(`${window.location.origin}/?k=${token}`), [token]);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  useEffect(() => {
    if (!leaving) return;
    // On a phone the main button sits in the sticky footer, far below: bring the check into view.
    askRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    askRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [leaving]);

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
    setKept(true);
    setTimeout(() => setCopied(false), 2400);
  };
  /** Phones: the share sheet, so the link can go to Notes, Messages or a password manager. */
  const share = async () => {
    try {
      await navigator.share({ title: "Merlin sign-in link", text: "My Merlin sign-in link", url: link });
      setKept(true);
    } catch {}
  };
  const mailMe = `mailto:${encodeURIComponent(email)}?subject=Merlin%20sign-in%20link&body=${encodeURIComponent(link)}`;
  const supportHref = support ? mailto(support, "Merlin sign-in link") : null;
  /** Leave for the app, but not without the link unless they say so (email sign-in on: no need). */
  const leave = (to: "table" | "seats") => (kept || emailOn ? onDone(to) : setLeaving(to));

  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Keep your sign-in link
      </h1>
      <p className="ob-sub">
        {emailOn
          ? "This link signs you straight in. Save it for next time. If you lose it, you can always get a new one by email."
          : "This link is how you sign in. There is no password, so save it where you'll find it again."}
      </p>

      <div className="ob-linkbox">
        <div ref={boxRef} className="ob-linkbox-text mono" aria-label="Your sign-in link" tabIndex={0} onFocus={selectLink}>
          {link}
        </div>
        <button type="button" className={`btn ob-copy${copied ? " ob-copy-done" : kept ? "" : " btn-pine"}`} onClick={copy}>
          {copied ? <IconCheck size={14} /> : null}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="ob-keep-ways">
        <a className="ob-mailme" href={mailMe} onClick={() => setKept(true)}>
          Email it to myself
        </a>
        {canShare ? (
          <button type="button" className="ob-linkbtn ob-mailme" onClick={share}>
            Share it to Notes or Messages
          </button>
        ) : null}
      </p>
      <p className="ob-hint ob-hint-flush">Anyone with this link can sign in as you. Keep it to yourself.</p>
      {emailOn ? null : (
        <p className="ob-hint">
          {support ? (
            <>
              Without it you can&apos;t sign back in on your own. If you lose it, email{" "}
              {supportHref ? (
                <a className="mono ob-help-link" href={supportHref}>
                  {support}
                </a>
              ) : (
                <span className="mono">{support}</span>
              )}{" "}
              and we&apos;ll send you a new one.
            </>
          ) : (
            "Without it there is no way back in, so save it before you go on."
          )}
        </p>
      )}

      {leaving ? (
        <div className="ob-leave" role="alertdialog" aria-labelledby="ob-leave-h" ref={askRef}>
          <p id="ob-leave-h">
            <strong>You haven&apos;t saved your link.</strong> {support ? "Without it, signing back in means emailing us for a new one." : "Without it you can't sign back in."}
          </p>
          <span className="ob-leave-acts">
            <button
              type="button"
              className="btn btn-pine"
              disabled={busy}
              onClick={async () => {
                await copy();
                onDone(leaving);
              }}
            >
              Copy link and go on
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => onDone(leaving)}>
              Go on without it
            </button>
          </span>
        </div>
      ) : null}

      <SeatsNext n={seats} busy={busy} onFill={() => leave("seats")} />

      <div className="ob-grow" />
      <div className="ob-foot">
        <span className="ob-foot-note" aria-live="polite">
          {kept || emailOn ? "" : "Save your link first"}
        </span>
        <button type="button" className={`btn btn-lg ob-next${kept || emailOn ? " btn-pine" : ""}`} onClick={() => leave("table")} disabled={busy} aria-busy={busy}>
          {busy ? "Opening" : nextLabel}
        </button>
      </div>
    </div>
  );
}
