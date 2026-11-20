"use client";

/**
 * First run, three steps, and it ends on the member's first saved view and Today. One calm card,
 * and the value comes before the ask:
 *   1. "What do you do?": what Merlin is and what a credit buys, then their function, with the
 *      titles for it as chips under it. A member with seats on file hears where those came from and
 *      who can see their name, since most of them arrive by personal link and skip the landing page.
 *   2. "Who you want to work with": the fractionals usually hired before them, the suggested ones
 *      already ticked (firstView.ts beforeOrder), or "Not sure", stored as Me.before; then the
 *      companies they want as clients, industry and size only (their Ideal Fractional Profile).
 *      Where defaults to the member's own country, one tap to Anywhere. Every part optional.
 *   3. "Your first view": companies in their profile that hired a fractional in those functions in
 *      the last 12 months and have no fractional in theirs yet (widened until it shows enough), the
 *      top 3 rows. The view saves itself, with the weekly email on, and "Also show open <function>
 *      roles" saves the open roles in their function as a second view. One button, "Open Today".
 *      A member who joined here while email sign-in is off keeps their sign-in link inline, above
 *      it. A member with seats on file under their name gets "Fill in your seats" here.
 * What it no longer asks moved out: Find your seats is the nudge after the first unlock (Today and
 * the table), and how many clients they have and whether they're looking are left unanswered (the
 * plans read an unanswered "looking" as yes; Your profile keeps it).
 * Each step is a history entry, so back steps back and forward steps forward. The answers are
 * kept for the tab (a reload comes back to the same step) and on the server after each step (a
 * new tab or another device picks up there too). Finishing sends the profile, which marks the
 * member onboarded with their first view, and the app opens on Today. A member with seats on file
 * under their name who picks "Fill in your seats" opens on those (Root).
 *
 * `viewReady` false: the join answer is in but the full view is still on its way (Root, WS2).
 * Steps 1 and 2 need no companies; step 3 shows skeleton rows and saves once the view is there.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "./onboard.css";
import { Brand, CompanyLogo, IconBriefcase, IconCheck, IconCoin, IconLock, LockedName, post, val, type Act, type View } from "../ui/shared";
import { FUNCTIONS } from "@/lib/tableFields";
import type { Icp, OnboardDraft } from "@/lib/tableTypes";
import { CLIENT_COUNTS } from "@/lib/tableTypes";
import { countryKey, countryOf, deriveAll, hireLine, hireOfRow, icpEmpty, type Filters, type Row } from "@/app/post/model";
import { EMPTY_ICP, IcpFields, countriesByCount, industriesByCount } from "@/app/post/Hunt";
import { alertView, named, realTitle, titlesFor } from "./suggest";
import {
  BEFORE_MAX, PREVIEW_ROWS, andList, beforeOrder, firstView, firstViewLine, goalFor, guessLine, holderOnFile, holdersLine, newerAnswers, openRolesCount, resumeStep, toggleBefore,
  STEPS, widenLine, type FirstView,
} from "./firstView";
import { ICP_SKIPPED } from "@/app/post/getStarted";
import { contactOf, mailto } from "../landing/contact";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import { invitedParts } from "@/lib/notify/format";
import { OnboardGoogle, startGoogle } from "@/app/post/network/Network"; // [google network]

export interface OnboardingProps {
  view: View;
  act: Act;
  /** Call when the member finishes (after the profile action marks them onboarded). */
  onDone: () => Promise<void> | void;
  /**
   * Called first when the member picks "Skip to the table" or "Open Today", before the profile
   * action reloads the view: the app then opens there, not on their seats.
   */
  onSkip?: () => void;
  /**
   * The full view is in (default). False while only the join answer is (`view.companies` empty):
   * steps 1 and 2 work without companies, and the first view waits for them.
   */
  viewReady?: boolean;
}

/* ---------- where the member is: history entry, tab storage and the server's draft ---------- */

/** The tab keeps the answers (sessionStorage), so a reload on the first view still has the answers it needs. */
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
/**
 * The member's own country, from the browser's language ("en-GB" is the United Kingdom), spelled
 * as the company records spell it. Null when the browser doesn't say. Their Ideal Fractional
 * Profile starts there; one tap makes it Anywhere.
 */
export function localCountry(): string | null {
  try {
    const langs = [...(navigator.languages ?? []), navigator.language];
    const tag = langs.find((l) => /-[a-z]{2}$/i.test(l ?? ""));
    const code = tag?.slice(-2).toUpperCase();
    if (!code) return null;
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return name && name !== code ? name : null;
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
/** The app opens on Today (or on the table, `table`): the address keeps no other place (a company link stays). */
function clearPlace(table = false) {
  try {
    const u = new URL(window.location.href);
    for (const k of ["v", "t", "s", "f", "q", "af", "p"]) u.searchParams.delete(k);
    if (table) u.searchParams.set("p", "table");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  } catch {}
}

/**
 * For a member with seats on file under their name: what is waiting and why it is worth doing,
 * with "Fill in your seats". Shown on the last step above its button. Nothing for everyone else.
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

export default function Onboarding({ view, act, onDone, onSkip, viewReady = true }: OnboardingProps) {
  const me = view.me!;
  const first = (me.name || "").trim().split(/\s+/)[0] || "there";
  // Joined here with email sign-in off: the sign-in link is kept on the last step (with it on, it comes by email).
  const linkStep = me.id.startsWith("j_") && !view.email;
  const total = STEPS;
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
    // Nothing picked yet anywhere: the profile starts in the member's own country.
    const here = a.icp || me.icp ? null : localCountry();
    const icp = a.icp ?? me.icp ?? (here ? { ...EMPTY_ICP, countries: [here] } : EMPTY_ICP);
    // Their own function can't come before them. An answer left with nothing once it is taken off is unanswered (the suggestion), not "Not sure".
    const raw = Array.isArray(a.before) ? a.before : Array.isArray(me.before) ? me.before : null;
    const kept = raw ? raw.filter((f) => FUNCTIONS.includes(f) && f !== fn).slice(0, BEFORE_MAX) : null;
    const before = raw && raw.length && kept && !kept.length ? null : kept;
    // Kept from earlier answers (a draft from the longer flow): sent on as they were, never asked again here.
    const clients = Array.isArray(a.clients) ? a.clients.filter((id) => id.startsWith("name:") || known.has(id) || !view.companies.length).slice(0, 20) : [];
    const views = Array.isArray(a.views) ? a.views.filter((id) => saved.has(id)) : [];
    const step = resumeStep(entryStep() || a.step || 1, { fn, before }, total);
    const clientCount = typeof a.clientCount === "string" && (CLIENT_COUNTS as readonly string[]).includes(a.clientCount) ? a.clientCount : me.clientCount ?? null;
    const looking = typeof a.looking === "boolean" ? a.looking : me.looking ?? null;
    return {
      fn, title, icp, here, before, clients, views, step, clientCount, looking,
      roles: a.roles !== false,
      email: a.email !== false,
      saved: views.length && typeof a.saved === "string" ? a.saved : null,
    };
  });
  const [step, setStep] = useState(init.step);
  const [fn, setFn] = useState<string | null>(init.fn);
  const [title, setTitle] = useState(init.title);
  const [icp, setIcp] = useState<Icp>(init.icp);
  /** The member's answer: null not given yet (the suggested ones show ticked), [] Not sure. */
  const [before, setBefore] = useState<string[] | null>(init.before);
  const [roles, setRoles] = useState(init.roles);
  const [email, setEmail] = useState(init.email);
  /** The saved views the first view step made (the first view, then the open roles), and what they were saved as. */
  const [views, setViews] = useState<string[]>(init.views);
  const [saved, setSaved] = useState<string | null>(init.saved);
  /** A save that failed, for these answers: it isn't tried again by itself. */
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  /** The sign-in link was copied, emailed or shared (only asked of a member with no email to sign in by). */
  const [linkKept, setLinkKept] = useState(false);
  const rewinding = useRef(false);
  /** The first step this tab's history holds. Back from it steps back in place rather than leaving the page. */
  const base = useRef(1);
  const cardRef = useRef<HTMLDivElement>(null);
  // Seats on file that carry this member's name. When there are any, that is where they can go next.
  const mySeats = useMemo(() => view.companies.reduce((n, c) => n + c.engagements.filter((e) => e.yours).length, 0), [view.companies]);
  // Of those, the ones we matched to work they published with us, and the ones Revenue Nomad's own seat scan found (the rest a member added with their name on it).
  const published = useMemo(
    () => view.companies.reduce((n, c) => n + c.engagements.filter((e) => e.yours && (e.source === "Published engagement" || e.source === "Member success story")).length, 0),
    [view.companies],
  );
  const scanned = useMemo(() => view.companies.reduce((n, c) => n + c.engagements.filter((e) => e.yours && e.source === "Seat scan").length, 0), [view.companies]);
  const emailOn = !!view.scan?.digest;

  /* ----- the first view, from the answers ----- */
  const infos = useMemo(() => deriveAll(view.companies), [view.companies]);
  const order = useMemo(() => beforeOrder(infos, fn), [infos, fn]);
  /** What the before question reads as now: the answer, else the suggestion, ticked. */
  const beforeNow = before ?? order.suggested;
  const ready = viewReady && view.companies.length > 0;
  const fv = useMemo(
    () => (before === null || !ready ? null : firstView(infos, me, { fn, icp: icpEmpty(icp) ? null : icp, before, suggested: order.suggested })),
    [infos, me, fn, icp, before, order, ready],
  );
  // Open roles in their function that fit their profile now, for "Also show open <function> roles" (counted when the first view shows).
  const openRoles = useMemo(() => (step === 3 && ready ? openRolesCount(infos, me, fn, icpEmpty(icp) ? null : icp) : 0), [step, ready, infos, me, fn, icp]);
  const sig = fv ? signature(fv, roles, email, fn, icp) : null;
  /** The views saved on the first view step still say what the answers say now. */
  const savedNow = !!views.length && saved === sig;

  // The country the profile started in, once the companies are in: one we have no company in narrows to nothing, so it goes.
  useEffect(() => {
    if (!ready || !init.here || icp.countries.length !== 1 || icp.countries[0] !== init.here) return;
    if (!countriesByCount(view.companies).some((c) => countryKey(c.name) === countryKey(init.here!))) setIcp((x) => ({ ...x, countries: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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
    // A reload keeps this tab's entries (and the first one they hold). A new tab that picks up at step 3 has none behind it.
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
    clientCount: init.clientCount,
    looking: init.looking,
    clients: init.clients,
    views,
    saved,
    at: new Date().toISOString(),
  });
  const latest = useRef(answers);
  latest.current = answers;
  useEffect(() => writeSaved(latest.current(step)), [me.id, step, fn, title, icp, before, roles, email, views, saved]);

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

  /* ----- the first view saves itself ----- */

  /**
   * The first view (and the open roles in their function, when that's on), with the weekly email as
   * ticked. It saves as soon as the step shows, and again after a change of answer, in place of the
   * ones before. Nothing to press.
   */
  const saveFirst = async () => {
    if (!fv || !sig || busy) return;
    setBusy(true);
    for (const id of views) await act({ type: "savedView", op: "delete", id }, { quiet: true, silentError: true });
    setViews([]);
    setSaved(null);
    const r = await act({ type: "savedView", op: "save", name: fv.name, place: fv.place, criteria: fv.criteria, email }, { quiet: true });
    if (!r.ok || !r.id) {
      setSaveFailed(sig);
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
    setBusy(false);
  };
  useEffect(() => {
    if (shown !== 3 || !fv || !sig || savedNow || busy || finishing || saveFailed === sig) return;
    // A switch flipped twice in a row saves once.
    const t = setTimeout(() => void saveFirst(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, sig, savedNow, busy, finishing, saveFailed]);

  /**
   * Finish with what is answered so far. `skip`: "Skip to the table", from step 1 or 2. The profile
   * action marks the member onboarded either way, so a reload never brings them back here.
   */
  const finish = async (skip = false, to: "today" | "seats" = "today") => {
    if (finishing) return;
    setFinishing(true);
    // The app opens on Today (or the table, skipped), unless they asked for their seats.
    if (skip || to !== "seats") onSkip?.();
    await rewind();
    window.scrollTo(0, 0);
    if (skip) clearPlace(true);
    else if (views[0] || to === "today") clearPlace();
    // Not answered yet when they skip: the suggestion stands in, as it did on screen.
    const beforeSent = before ?? (fn ? order.suggested : null);
    const r = await act(
      {
        type: "profile",
        function: fn ?? undefined,
        ...(fn ? { goal: goalFor(fn) } : {}),
        ...(title.trim() !== realTitle(me.title) ? { title: title.trim() } : {}),
        icp: icpEmpty(icp) ? null : icp,
        ...(beforeSent !== null ? { before: beforeSent } : {}),
        ...(views[0] ? { firstView: views[0] } : {}),
        ...(init.clientCount !== null ? { clientCount: init.clientCount } : {}),
        // "Are you looking for a new client?" isn't asked here any more: unanswered reads as yes (the plans' softer pitch is only for "Not now").
        ...(init.looking !== null ? { looking: init.looking } : {}),
      },
      { quiet: true },
    );
    if (!r.ok) {
      setFinishing(false);
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

  return (
    <div className="ob">
      <header className="ob-top">
        <span className="ob-brand">
          <Brand size={36} />
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
            {/* Not on the last step: its own button opens the app, with the first view saved. */}
            {shown === total ? null : (
              <button type="button" className="ob-skip" onClick={() => finish(true)} disabled={finishing}>
                Skip to the table
              </button>
            )}
          </div>

          {shown === 1 ? (
            <StepYou
              first={first}
              seats={mySeats}
              published={published}
              scanned={scanned}
              credits={me.credits}
              invited={me.invitedBy ? invitedParts(me.invitedBy.first, me.invitedBy.both, REFERRAL_BONUS) : null}
              fn={fn}
              setFn={(f) => {
                setFn(f);
                // Their own function can't come before them. Taking off their only pick leaves the question unanswered (the suggestion), not "Not sure".
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
            <StepWho
              fn={fn}
              order={order.order}
              suggested={order.suggested}
              before={before}
              beforeNow={beforeNow}
              setBefore={setBefore}
              icp={icp}
              setIcp={setIcp}
              here={init.here}
              industries={industriesByCount(view.companies)}
              onBack={back}
              onNext={() => {
                setBefore(beforeNow);
                forward(3);
              }}
            />
          ) : (
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
              saving={busy}
              failed={!!sig && saveFailed === sig}
              onRetry={() => setSaveFailed(null)}
              finishing={finishing}
              onBack={back}
              link={linkStep ? <LinkInline token={me.token} email={me.email} support={support} onKept={() => setLinkKept(true)} /> : null}
              needLink={linkStep && !linkKept}
              handoff={
                <>
                  <SeatsNext n={mySeats} busy={finishing} onFill={() => finish(false, "seats")} />
                  {/* [google network] optional and skippable (nothing with RN_GOOGLE off). */}
                  <OnboardGoogle onConnect={() => void finish(false, "today").then(() => startGoogle("onboard"))} />
                </>
              }
              onOpen={() => finish(false, "today")}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- step 1: what this is, then what you do ---------- */

/**
 * Where the seats with their name came from: work they published on Revenue Nomad, Revenue
 * Nomad's own seat scan ("Revenue Nomad found 1 seat with your name"), or members.
 */
function seatsLine(seats: number, published: number, scanned: number): string {
  const n = (k: number) => (k === 1 ? "1 seat" : `${k} seats`);
  if (published === seats) return `We started it from the fractional work you published on Revenue Nomad, so ${seats === 1 ? "1 seat already carries" : `${seats} seats already carry`} your name.`;
  if (scanned === seats) return `Revenue Nomad found ${n(seats)} with your name.`;
  if (!published && !scanned) return `Members have already put your name on ${n(seats)}.`;
  const members = seats - published - scanned;
  const parts = [...(published ? [`we matched ${published} to the fractional work you published on Revenue Nomad`] : []), ...(scanned ? [`Revenue Nomad found ${scanned}`] : []), ...(members ? ["members added the rest"] : [])];
  const said = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${seats} seats already carry your name: ${said}.`;
}

function StepYou({
  first, seats, published, scanned, credits, invited, fn, setFn, title, setTitle, onNext,
}: {
  first: string;
  /** Seats on file that carry the member's name. */
  seats: number;
  /** How many of them we matched to fractional work they published on Revenue Nomad. */
  published: number;
  /** How many of them Revenue Nomad's own seat scan found (source "Seat scan"): no member put the name there. */
  scanned: number;
  credits: number;
  /** "Ivy invited you." and "You both get 10 credits when you add your first fact." (invitedParts), for a member who joined from an invite. */
  invited: [string, string] | null;
  fn: string | null;
  setFn: (f: string) => void;
  title: string;
  setTitle: (t: string) => void;
  onNext: () => void;
}) {
  const picks = titlesFor(fn);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (fn) onNext();
      }}
    >
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Welcome, {first}. What do you do?
      </h1>
      <p className="ob-sub">
        Merlin shows you which companies hire fractionals, who held each seat and which roles are open now. Share what you know to earn credits.
        {seats ? ` ${seatsLine(seats, published, scanned)} Other members see your name on a seat only after they spend 1 credit.` : null}
      </p>
      <p className="ob-credit-note">
        <span className="ob-coin" aria-hidden>
          <IconCoin size={13} />
        </span>
        <span>
          {/* Joined from an invite: who sent it, and the credits it brings once they add a first fact. */}
          {invited ? (
            <>
              <strong>{invited[0]}</strong> {invited[1]}{" "}
            </>
          ) : null}
          You have{" "}
          <strong className="num">
            {credits} {credits === 1 ? "credit" : "credits"}
          </strong>
          . A company is 2 credits, and your first one each day is free. One more credit shows who held a seat there.
        </span>
      </p>

      <fieldset className="ob-q">
        <legend className="ob-h">Your function</legend>
        <div className="ob-chips" role="radiogroup" aria-label="Your function">
          {FUNCTIONS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={fn === f} className={`ob-chip${fn === f ? " ob-chip-on" : ""}`} onClick={() => setFn(f)}>
              {f}
            </button>
          ))}
        </div>
      </fieldset>

      {fn ? (
        <div className="ob-q ob-q-tight">
          <label className="ob-h" htmlFor="ob-title">
            Your title
          </label>
          {picks.length ? (
            <div className="ob-title-picks" role="radiogroup" aria-label="Titles to pick from">
              {picks.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={title === t} className={`ob-title-pick${title === t ? " ob-title-pick-on" : ""}`} onClick={() => setTitle(t)}>
                  {t}
                </button>
              ))}
            </div>
          ) : null}
          <input
            id="ob-title"
            className="input ob-title-input"
            value={title}
            maxLength={80}
            placeholder={picks.length ? "Or type your own" : "Fractional VP Sales"}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="organization-title"
          />
          <p className="ob-hint">Members see it when you message them.</p>
        </div>
      ) : null}

      <div className="ob-grow" />
      <div className="ob-foot">
        <span className="ob-foot-note" aria-live="polite">
          {fn ? "" : "Pick your function"}
        </span>
        <button type="submit" className="btn btn-pine btn-lg ob-next" disabled={!fn}>
          Next
        </button>
      </div>
    </form>
  );
}

/* ---------- step 2: who you want to work with ---------- */

function StepWho({
  fn, order, suggested, before, beforeNow, setBefore, icp, setIcp, here, industries, onBack, onNext,
}: {
  fn: string | null;
  /** Every function it offers, the suggested ones first (beforeOrder). */
  order: string[];
  suggested: string[];
  /** The answer: null not given yet, [] Not sure. */
  before: string[] | null;
  /** What shows ticked: the answer, else the suggestion. */
  beforeNow: string[];
  setBefore: (b: string[] | null) => void;
  icp: Icp;
  setIcp: (v: Icp) => void;
  /** The member's own country, where the profile started (null: the browser didn't say). */
  here: string | null;
  industries: { name: string; n: number }[];
  onBack: () => void;
  onNext: () => void;
}) {
  const nfn = named(fn);
  const unsure = before !== null && before.length === 0;
  const full = beforeNow.length >= BEFORE_MAX;
  const [more, setMore] = useState(() => beforeNow.some((f) => !suggested.includes(f)));
  const chip = (f: string) => {
    const on = !unsure && beforeNow.includes(f);
    return (
      <button
        key={f}
        type="button"
        aria-pressed={on}
        aria-disabled={!on && full}
        className={`ob-chip${on ? " ob-chip-on" : ""}${!on && full ? " ob-chip-full" : ""}`}
        onClick={() => setBefore(toggleBefore(unsure ? [] : beforeNow, f))}
      >
        {on ? <IconCheck size={11} /> : null}
        {f}
      </button>
    );
  };
  const rest = order.filter((f) => !suggested.includes(f));
  const country = icp.countries.length === 1 ? icp.countries[0] : null;
  const where = here ?? country;
  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Who you want to work with
      </h1>
      <p className="ob-sub">
        A company that just hired one of these often needs {nfn ? `a fractional ${nfn} leader` : "you"} next, and the fractional who held that seat is a natural referral partner.
      </p>
      <fieldset className="ob-q">
        <legend className="ob-h">{nfn ? `Who's hired before ${nfn}` : "Who's hired before you"}</legend>
        <div className="ob-chips" role="group" aria-label={nfn ? `Who's hired before ${nfn}` : "Who's hired before you"}>
          {suggested.map(chip)}
          {more ? rest.map(chip) : null}
          <button type="button" aria-pressed={unsure} className={`ob-chip ob-chip-unsure${unsure ? " ob-chip-on" : ""}`} onClick={() => setBefore(unsure ? null : [])}>
            Not sure
          </button>
        </div>
        {more ? null : (
          <button type="button" className="ob-linkbtn ob-more" onClick={() => setMore(true)}>
            Other functions
          </button>
        )}
      </fieldset>
      {/* The Ideal Fractional Profile, industry and size only here: revenue and the rest wait for Your profile (onboard.css .ob-icp-short). */}
      <div className="ob-icp-short">
        <IcpFields value={icp} onChange={setIcp} industries={industries} countries={[]} headingClass="ob-h" />
      </div>
      {where ? (
        <fieldset className="ob-q ob-q-tight">
          <legend className="ob-h">Where</legend>
          <div className="ob-chips" role="group" aria-label="Where">
            <button type="button" aria-pressed={country === where} className={`ob-chip${country === where ? " ob-chip-on" : ""}`} onClick={() => setIcp({ ...icp, countries: [where] })}>
              {where}
            </button>
            <button type="button" aria-pressed={!icp.countries.length} className={`ob-chip${!icp.countries.length ? " ob-chip-on" : ""}`} onClick={() => setIcp({ ...icp, countries: [] })}>
              Anywhere
            </button>
          </div>
        </fieldset>
      ) : null}
      <p className="ob-hint">All optional. You can change any of it later in Your profile.</p>
      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <span className="ob-foot-note num" aria-live="polite">
          {unsure ? `We'll start with ${andList(suggested)}` : full ? `${BEFORE_MAX} picked, the most` : ""}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" onClick={onNext}>
          Show my first view
        </button>
      </div>
    </div>
  );
}

/* ---------- step 3: your first view ---------- */

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
        <span className="ob-fv-name">{c.hidden ? <LockedName seed={c.id} /> : c.name}</span>
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
  fv, fn, icp, openRoles, roles, setRoles, email, setEmail, emailOn, savedNow, saving, failed, onRetry, finishing, onBack, link, needLink, handoff, onOpen,
}: {
  /** Null until the companies are in: skeleton rows meanwhile. */
  fv: FirstView | null;
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
  /** Saved, as the answers are now. */
  savedNow: boolean;
  saving: boolean;
  /** The save failed for these answers. */
  failed: boolean;
  onRetry: () => void;
  finishing: boolean;
  onBack: () => void;
  /** The sign-in link, for a member who has no email to sign in by. */
  link: React.ReactNode;
  /** It isn't kept yet: the first press of Open Today asks once. */
  needLink: boolean;
  /** For a member with seats on file: where they can go instead. */
  handoff: React.ReactNode;
  onOpen: () => void;
}) {
  const nfn = named(fn);
  const notes = fv ? ([widenLine(fv, fn), guessLine(fv, fn)].filter(Boolean) as string[]) : [];
  const top = fv ? fv.rows.slice(0, PREVIEW_ROWS) : [];
  const more = fv ? fv.rows.length - top.length : 0;
  const partners = fv ? holdersLine(fv) : null;
  const [asked, setAsked] = useState(false);
  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Your first view
      </h1>
      {fv ? (
        <>
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
        </>
      ) : (
        <div role="status" aria-busy>
          <span className="sr-only">Finding the companies for your first view</span>
          <ul className="ob-fv-rows" aria-hidden>
            {Array.from({ length: PREVIEW_ROWS }, (_, k) => (
              <li key={k} className="ob-fv-row ob-fv-skel">
                <span className="ob-skel ob-skel-logo" />
                <span className="ob-fv-id">
                  <span className="ob-skel" style={{ width: "45%" }} />
                  <span className="ob-skel" style={{ width: "70%" }} />
                  <span className="ob-skel" style={{ width: "55%" }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                {!fv
                  ? "They get a view of their own."
                  : openRoles > 0
                    ? `${openRoles === 1 ? "1 is" : `${openRoles} are`} open${icpEmpty(icp) ? "" : " in your profile"} now. They get a view of their own.`
                    : `None open${icpEmpty(icp) ? "" : " in your profile"} right now. They get a view of their own for when one opens.`}
              </span>
            </span>
          </button>
        ) : null}
      </div>

      {handoff}
      {link}

      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <span className="ob-foot-note" aria-live="polite">
          {asked && needLink ? (
            <strong className="ob-link-warn">Copy your sign-in link first. Without it you can&apos;t sign back in.</strong>
          ) : failed ? (
            <button type="button" className="ob-linkbtn" onClick={onRetry}>
              Your view didn&apos;t save. Try again
            </button>
          ) : savedNow ? (
            <span className="ob-saved">
              <IconCheck size={13} /> Saved under Saved views
            </span>
          ) : saving || !fv ? (
            "Saving your view"
          ) : (
            ""
          )}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" disabled={finishing || saving} aria-busy={finishing} onClick={() => (needLink && !asked ? setAsked(true) : onOpen())}>
          {finishing ? "Opening" : asked && needLink ? "Open Today without it" : "Open Today"}
        </button>
      </div>
    </div>
  );
}

/* ---------- the sign-in link, inline on the last step ---------- */

/**
 * "Your sign-in link · Copy (there's no password, keep it)": only for a member who joined here
 * while email sign-in is off. Email it to themselves or share it to Notes, too.
 */
function LinkInline({ token, email, support, onKept }: { token: string; email: string; support: string | null; onKept: () => void }) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);
  useEffect(() => setLink(`${window.location.origin}/?k=${token}`), [token]);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
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
    onKept();
    setTimeout(() => setCopied(false), 2400);
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Merlin sign-in link", text: "My Merlin sign-in link", url: link });
      onKept();
    } catch {}
  };
  const mailMe = `mailto:${encodeURIComponent(email)}?subject=Merlin%20sign-in%20link&body=${encodeURIComponent(link)}`;
  const supportHref = support ? mailto(support, "Merlin sign-in link") : null;
  return (
    <div className="ob-link-inline">
      <p className="ob-link-h">
        <strong>Your sign-in link</strong> <span className="ob-hint-i">There&apos;s no password, so keep it.</span>
      </p>
      <div className="ob-linkbox">
        <span ref={boxRef} className="ob-linkbox-text mono" aria-label="Your sign-in link" tabIndex={0} onFocus={selectLink}>
          {link}
        </span>
        <button type="button" className={`btn ob-copy${copied ? " ob-copy-done" : ""}`} onClick={copy}>
          {copied ? <IconCheck size={14} /> : null}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="ob-keep-ways">
        <a className="ob-mailme" href={mailMe} onClick={onKept}>
          Email it to myself
        </a>
        {canShare ? (
          <button type="button" className="ob-linkbtn ob-mailme" onClick={share}>
            Share it to Notes
          </button>
        ) : null}
        {support ? (
          <span className="ob-hint-i">
            Lost it? Email{" "}
            {supportHref ? (
              <a className="mono ob-help-link" href={supportHref}>
                {support}
              </a>
            ) : (
              <span className="mono">{support}</span>
            )}
            .
          </span>
        ) : null}
      </p>
    </div>
  );
}
