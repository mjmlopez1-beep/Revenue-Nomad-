"use client";

/**
 * First run in the new look (Onboarding.dc.html): a header (Getting set up, time left, saved as you
 * go, the balance, Finish later), the stepper of five steps with the progress bar, the screen in a
 * white card, and beside it What you have so far, A first look (on the ideal client), the credits
 * and Why we ask. On a phone the side column moves under the card.
 *
 *   1 Welcome              who invited them and the bonus (REFERRAL_BONUS), what the next minutes get
 *                          them, the trial in three numbers.
 *   2 Your ideal client    the function they sell (and their title), industries with their counts,
 *                          company size, where, who is usually hired before them; the live count
 *                          (companies that fit, hiring now, likely to need them next) and a first look.
 *   3 The seats you have held   the seats on file under their name: Yes, this is mine, or Not mine
 *                          (notMine, as Your seats does); hours a week for 1 credit; held one we
 *                          missed: add it by hand (FindSeats.tsx, the credit per fact as today); their
 *                          name on their seats (Hide my name, the Fractionals directory).
 *   4 Like your past clients   lookalikes from their seats (setupModel.ts likeStep): the profile as
 *                          chips, the ranked companies with why each matched, a locked company
 *                          described and never named, saved as their first list with its alert on.
 *                          No seats: an honest line, and the step is skipped.
 *   5 Who you know         Google, the LinkedIn connections file, a contacts CSV: each on its own or
 *                          together, all optional, what is read and never read. Google stays private.
 *   6 Open your first company   the profile goes in as it shows (onboarding ends on the server and
 *                          the trial starts, so Crystal Ball names its companies): three from Crystal
 *                          Ball, opened as Crystal Ball opens them; who held the seat, who decides
 *                          (1 credit, asked first) and the way in.
 *   7 Done                 the six steps as they stand, the morning moves email, the sign-in link,
 *                          and two things worth doing later (the writing voice, an invite).
 *
 * Each screen is a history entry (back steps back), the answers are kept for the tab and on the
 * server after each screen (OnboardDraft, so another device picks up), and Finish later ends
 * onboarding with what is answered so far: Getting started on Home keeps the rest.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./setup.css";
import { IconCheck, post, type Act, type View } from "../ui/shared";
import { FUNCTIONS, OPENS_RULE, TRIAL_OPENS_DAILY, REFERRAL_BONUS, RN_EMPLOYEES } from "@/lib/tableFields";
import type { Icp, OnboardDraft } from "@/lib/tableTypes";
import { deriveAll, icpEmpty, mySeats, namedFn, type LikeTrait } from "@/app/post/model";
import { EMPTY_ICP, countriesByCount, industriesByCount } from "@/app/post/Hunt";
import { countryKey } from "@/app/post/model";
import { TRIAL_DAYS, TRIAL_NAME } from "@/lib/billing/rules";
import { invitedParts } from "@/lib/notify/format";
import { ICP_SKIPPED, sixSteps } from "@/app/post/getStarted";
import { Logo } from "../ui/Logo";
import { radioKeys, radioTab } from "../post/radioGroup";
import { contactOf, mailto } from "../landing/contact";
import { localCountry, type OnboardingProps } from "./Classic";
import { realTitle, titlesFor } from "./suggest";
import { BEFORE_MAX, beforeOrder, firstView, goalFor, newerAnswers, toggleBefore, andList } from "./firstView";
import {
  PROFILE_SCREEN, SETUP_STEPS, companyLabel, factsLine, idealCounts, idealLine, ledgerLines, likeStep, resumeScreen, screenN, screenOf, stepOfScreen, suggestIcp, timeLeftWords,
  type ScreenKey,
} from "./setupModel";
import { SeatsScreen, LikeScreen } from "./SetupSeats";
import { KnowScreen, FirstScreen, useKnowCounts } from "./SetupKnow";
import { Head, Switch } from "./setupParts";

/* ---------- where the member is: history entry, tab storage and the server's draft ---------- */

const SAVE_KEY = "tp_ob2";
type Saved = Partial<OnboardDraft> & { id: string };
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
const TRY_FN_KEY = "tp_try_fn";
function triedFn(): string | null {
  try {
    const v = localStorage.getItem(TRY_FN_KEY);
    return v && FUNCTIONS.includes(v) ? v : null;
  } catch {
    return null;
  }
}
function entryStep(): number {
  const n = Number(window.history.state?.ob);
  return Number.isInteger(n) && n >= 1 ? n : 0;
}
function entryBase(): number {
  const n = Number(window.history.state?.obBase);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
/** The app opens on this address (Home with none): the address keeps no other place. */
function setPlace(search = "") {
  try {
    const u = new URL(window.location.href);
    for (const k of ["v", "t", "s", "f", "q", "af", "p", "google", "sec", "tab", "c"]) u.searchParams.delete(k);
    for (const [k, v] of new URLSearchParams(search)) u.searchParams.set(k, v);
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  } catch {}
}

/* ---------- small parts every screen uses ---------- */

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const LABELS: Record<ScreenKey, string> = { welcome: "Welcome", ideal: "Your ideal client", seats: "The seats you have held", like: "Like your past clients", know: "Who you know", first: "Your first company", done: "Done" };
const NEXT: Record<ScreenKey, string> = {
  welcome: "Start: your ideal client",
  ideal: "Next: the seats you have held",
  seats: "Next: like your past clients",
  like: "Next: who you know",
  know: "Next: your first company",
  first: "Finish",
  done: "Open Home",
};
const WHY: Record<ScreenKey, [string, string]> = {
  welcome: ["Why Merlin asks before it shows", "Merlin holds every company it knows hired a fractional. A few short answers turn that into a short list that is about you."],
  ideal: ["Why we ask", "Find starts filtered to it, Crystal Ball ranks by it, and every list reads it. Every part is optional, and you can change it in Settings."],
  seats: ["Why we ask", "Merlin runs on what members add. Your seats earn the credits you spend elsewhere, and the people you worked with become your warmest ways in."],
  like: ["How lookalikes work", "Merlin reads the free facts of the companies where you held a seat and lists the companies that share the most of them. Plain rules, no guessing."],
  know: ["What happens to your contacts", "They stay yours. Other members never see them, Merlin does not message anyone, and one tap in Settings deletes everything that was read."],
  first: ["Why a company is locked", `Names are what members trade. Your trial opens up to ${TRIAL_OPENS_DAILY} companies a day, each with everything on it. Pro opens everything.`],
  done: ["What happens next", "Home shows your best moves each morning. The Getting started card in the nav keeps the steps left in view until they are done."],
};

/* ---------- the set-up ---------- */

export default function Setup({ view, act, onDone, onSkip, viewReady = true, onHold }: OnboardingProps) {
  const me = view.me!;
  const first = (me.name || "").trim().split(/\s+/)[0] || "there";
  const { support } = contactOf(view);
  const linkStep = me.id.startsWith("j_") && !view.email;

  const [init] = useState(() => {
    const tab = readSaved(me.id);
    const server: Saved | null = me.draft ? { ...me.draft, id: me.id } : null;
    const a: Saved = newerAnswers(tab, server) ?? { id: me.id };
    const picked = a.function;
    const fn = (picked && FUNCTIONS.includes(picked) ? picked : null) ?? triedFn() ?? (me.function && FUNCTIONS.includes(me.function) ? me.function : null);
    const title = typeof a.title === "string" ? a.title : realTitle(me.title);
    const here = a.icp || me.icp ? null : localCountry();
    const icp = a.icp ?? me.icp ?? (here ? { ...EMPTY_ICP, countries: [here] } : EMPTY_ICP);
    const raw = Array.isArray(a.before) ? a.before : Array.isArray(me.before) ? me.before : null;
    const kept = raw ? raw.filter((f) => FUNCTIONS.includes(f) && f !== fn).slice(0, BEFORE_MAX) : null;
    const before = raw && raw.length && kept && !kept.length ? null : kept;
    const saved = new Set((me.savedViews ?? []).map((v) => v.id));
    const views = Array.isArray(a.views) ? a.views.filter((id) => saved.has(id)) : [];
    // A reload on "Your first company" (the profile is in, so the member reads as onboarded): it stays on that screen until Finish (acceptance F37).
    const screen = me.onboarded && entryStep() === PROFILE_SCREEN ? PROFILE_SCREEN : resumeScreen(entryStep() || a.step || 1, { fn });
    return {
      fn, title, icp, here, before, views, screen,
      clients: Array.isArray(a.clients) ? a.clients.slice(0, 20) : [],
      mine: Array.isArray(a.mine) ? a.mine : [],
      likeSig: typeof a.saved === "string" && a.saved.startsWith("like:") && views.length ? a.saved : null,
    };
  });

  const plan = me.plan;
  const trialAhead = !!plan && (plan.name === "trial" || (plan.name === "free" && !plan.hadTrial));
  const [screen, setScreen] = useState(init.screen);
  /** The furthest screen reached in this flow: a step behind it that holds nothing reads "Skipped". */
  const [maxSeen, setMaxSeen] = useState(init.screen);
  const [fn, setFn] = useState<string | null>(init.fn);
  const [title, setTitle] = useState(init.title);
  const [icp, setIcp] = useState<Icp>(init.icp);
  const [before, setBefore] = useState<string[] | null>(init.before);
  const [clients, setClients] = useState<string[]>(init.clients);
  const [added, setAdded] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<string[]>(init.mine);
  const [likeOff, setLikeOff] = useState<LikeTrait[]>([]);
  /** The saved views the set-up made: the lookalikes list (index 0 while there is one), the first view. */
  const [likeId, setLikeId] = useState<string | null>(init.likeSig ? init.views[0] ?? null : null);
  const [likeSig, setLikeSig] = useState<string | null>(init.likeSig);
  const [fvId, setFvId] = useState<string | null>(init.views.find((id) => id !== (init.likeSig ? init.views[0] : null)) ?? null);
  const [radarEmail, setRadarEmail] = useState(me.radar !== false);
  const [finishing, setFinishing] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [linkKept, setLinkKept] = useState(false);
  const rewinding = useRef(false);
  const base = useRef(1);
  const cardRef = useRef<HTMLDivElement>(null);
  const key = screenOf(screen);

  /* ----- what the screens read ----- */
  const infos = useMemo(() => deriveAll(view.companies), [view.companies]);
  const ready = viewReady && view.companies.length > 0;
  const order = useMemo(() => beforeOrder(infos, fn), [infos, fn]);
  const beforeNow = before ?? order.suggested;
  const icpNow = icpEmpty(icp) ? null : icp;
  const counts = useMemo(() => (ready ? idealCounts(infos, me, { fn, icp: icpNow, before, suggested: order.suggested }) : null), [ready, infos, me, fn, icpNow, before, order]);
  const fv = useMemo(() => (ready ? firstView(infos, me, { fn, icp: icpNow, before: before ?? [], suggested: order.suggested }) : null), [ready, infos, me, fn, icpNow, before, order]);
  const seats = useMemo(() => mySeats(infos, me), [infos, me]);
  const seedIds = useMemo(() => [...new Set(seats.map((s) => s.i.c.id))], [seats]);
  const like = useMemo(() => likeStep(infos, me, seedIds, likeOff), [infos, me, seedIds, likeOff]);
  const known = useKnowCounts();
  const lines = ledgerLines(me, view.ledger);
  const earnedNow = lines.earned + lines.bonus;
  const openedInfo = opened ? infos.find((i) => i.c.id === opened) ?? null : null;
  const openedName = openedInfo && !openedInfo.c.hidden ? openedInfo.c.name : null;

  // The country the profile started in, once the companies are in: one we have no company in narrows to nothing, so it goes.
  useEffect(() => {
    if (!ready || !init.here || icp.countries.length !== 1 || icp.countries[0] !== init.here) return;
    if (!countriesByCount(view.companies).some((c) => countryKey(c.name) === countryKey(init.here!))) setIcp((x) => ({ ...x, countries: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* ----- history: back steps back, forward steps forward, a reload comes back to the screen ----- */
  useEffect(() => {
    try {
      window.history.scrollRestoration = "manual";
    } catch {}
  }, []);
  useEffect(() => {
    const had = entryStep();
    base.current = had ? Math.min(entryBase(), init.screen) : init.screen;
    if (had !== init.screen || entryBase() !== base.current) window.history.replaceState({ ob: init.screen, obBase: base.current }, "");
    const onPop = () => {
      if (rewinding.current) return;
      setScreen(Math.min(Math.max(1, entryStep() || base.current), 7));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [init.screen]);

  const answers = (at: number): Saved => ({
    id: me.id,
    step: Math.min(at, PROFILE_SCREEN - 1),
    function: fn,
    title,
    icp: icpNow,
    before,
    roles: false,
    email: true,
    clients,
    views: [likeId, fvId].filter((x): x is string => !!x),
    saved: likeId ? likeSig : null,
    mine,
    at: new Date().toISOString(),
  });
  const latest = useRef(answers);
  latest.current = answers;
  useEffect(() => writeSaved(latest.current(screen)), [me.id, screen, fn, title, icp, before, clients, mine, likeId, likeSig, fvId]);
  // Each new screen goes to the server too (before the profile goes in), so a new tab or another device picks up here.
  const opened0 = useRef(true);
  useEffect(() => {
    setMaxSeen((m) => Math.max(m, screen));
    if (opened0.current) {
      opened0.current = false;
      return;
    }
    if (screen >= PROFILE_SCREEN) return;
    const { id: _id, ...draft } = latest.current(screen);
    void post({ action: { type: "onboardDraft", draft } });
  }, [screen]);
  // A seat confirmed, a list saved: the draft says so at once (they are answers, not steps).
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    if (screen >= PROFILE_SCREEN) return;
    const t = setTimeout(() => {
      const { id: _id, ...draft } = latest.current(screen);
      void post({ action: { type: "onboardDraft", draft } });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, likeId]);

  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>("[data-step-h]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [screen]);

  const go = (n: number) => {
    const to = Math.min(Math.max(1, n), 7);
    if (to === screen) return;
    if (to > screen) {
      setScreen(to);
      window.history.pushState({ ob: to, obBase: base.current }, "");
    } else if (to === screen - 1 && screen > base.current && entryStep() === screen) window.history.back();
    else {
      base.current = Math.min(base.current, to);
      setScreen(to);
      window.history.replaceState({ ob: to, obBase: base.current }, "");
    }
  };
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

  /* ----- the profile, and the first view saved beside the lookalikes ----- */
  const profileAct = (firstViewId: string | null) => {
    const beforeSent = before ?? (fn ? order.suggested : null);
    return {
      type: "profile" as const,
      function: fn ?? undefined,
      ...(fn ? { goal: goalFor(fn) } : {}),
      ...(title.trim() !== realTitle(me.title) ? { title: title.trim() } : {}),
      icp: icpNow,
      ...(beforeSent !== null ? { before: beforeSent } : {}),
      ...(firstViewId ? { firstView: firstViewId } : {}),
    };
  };
  const fvSig = fv ? JSON.stringify({ p: fv.place }) : null;
  const [fvSaved, setFvSaved] = useState<string | null>(fvId ? fvSig : null);
  /**
   * The ideal client's first view (firstView.ts), saved once with its weekly email, after the
   * lookalikes list (so the lookalikes are the member's first list), before the profile goes in
   * (onboarding's own views don't count toward Free's one). The table opens on it (Me.firstView).
   */
  const saveFirstView = async (): Promise<string | null> => {
    if (!fv || !fvSig) return fvId;
    if (fvId && fvSaved === fvSig) return fvId;
    if (fvId) await act({ type: "savedView", op: "delete", id: fvId }, { quiet: true, silentError: true });
    const r = await act({ type: "savedView", op: "save", name: fv.name, place: fv.place, criteria: fv.criteria, email: true }, { quiet: true, silentError: true });
    const id = r.ok && r.id ? r.id : null;
    setFvId(id);
    setFvSaved(id ? fvSig : null);
    return id;
  };
  const profSig = JSON.stringify({ fn, t: title.trim(), icp: icpNow, b: before, fv: fvSig });
  const [profSent, setProfSent] = useState<string | null>(null);
  const profAsked = useRef<string | null>(null);
  useEffect(() => {
    if (screen < PROFILE_SCREEN || finishing || profSent === profSig || profAsked.current === profSig || !ready) return;
    profAsked.current = profSig;
    void (async () => {
      onHold?.();
      const id = await saveFirstView();
      const r = await act(profileAct(id), { quiet: true, silentError: true });
      profAsked.current = null;
      if (r.ok) setProfSent(profSig);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, profSig, finishing, ready]);

  /** Finish: Open Home, Finish later, or a link on the done screen (`to`: the address the app opens on). */
  const finish = async (to = "") => {
    if (finishing) return;
    setFinishing(true);
    onSkip?.();
    await rewind();
    window.scrollTo(0, 0);
    setPlace(to);
    if (screen < PROFILE_SCREEN || profSent !== profSig) {
      const id = ready ? await saveFirstView() : fvId;
      const r = await act(profileAct(id), { quiet: true });
      if (!r.ok) {
        setFinishing(false);
        return;
      }
    }
    if (!radarEmail && me.radar !== false) await act({ type: "settings", radar: false }, { quiet: true, silentError: true });
    // A member who starts in the new look has nothing to hear about what moved: What's new stays off for them.
    await act({ type: "settings", stripOff: "whatsnew" }, { quiet: true, silentError: true });
    writeSaved(null);
    if (icpEmpty(icp))
      try {
        sessionStorage.setItem(ICP_SKIPPED, "1");
      } catch {}
    await onDone();
  };

  /* ----- the stepper and what you have so far ----- */
  const has: Record<ScreenKey, boolean> = {
    welcome: true,
    ideal: !!fn && !icpEmpty(icp),
    seats: seats.length > 0,
    like: !!likeId,
    know: known.any,
    first: !!opened,
    done: false,
  };
  const subOf: Record<ScreenKey, string> = {
    welcome: "",
    ideal: counts ? `${plural(counts.match, "company", "companies")} fit` : "Your picks",
    seats: `${plural(seats.length, "seat", "seats")}${earnedNow ? ` · +${earnedNow} credits` : ""}`,
    like: likeId ? "Saved, alert on" : like.empty ? "Needs a seat first" : plural(like.ranked.length, "company", "companies"),
    know: known.any ? known.line : "Optional",
    first: openedName ?? (opened ? "Opened" : "Open one free"),
    done: "",
  };
  const steps = (["ideal", "seats", "like", "know", "first"] as ScreenKey[]).map((k) => {
    const n = screenN(k);
    const now = screen === n;
    const seen = maxSeen > n || screen > n;
    return { k, n, step: stepOfScreen(n)!, now, done: seen && has[k] && !now, skipped: seen && !has[k] && !now };
  });

  const toNext = () => go(screen + 1);
  const canNext = key !== "ideal" || !!fn;
  const nav = (
    <div className="su-foot">
      {screen > 1 ? (
        <button type="button" className="su-back" onClick={() => go(screen - 1)} disabled={finishing}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back
        </button>
      ) : null}
      <span className="su-foot-hint" aria-live="polite">
        {footHint(key, { fn, seats: seats.length, like: !!likeId, likeEmpty: !!like.empty, known: known.any, opened: openedName ?? (opened ? "That company" : null) })}
      </span>
      {(key === "ideal" || key === "seats" || key === "like" || key === "know") && !has[key] ? (
        <button type="button" className="su-skip" onClick={toNext} disabled={!canNext || finishing}>
          Skip this step
        </button>
      ) : null}
      {key === "done" ? null : (
        <button type="button" className="su-next" onClick={() => (key === "first" ? go(7) : toNext())} disabled={!canNext || finishing}>
          {NEXT[key]}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );

  const invited = me.invitedBy ? invitedParts(me.invitedBy.first, me.invitedBy.both, REFERRAL_BONUS) : null;
  const industries = useMemo(() => industriesByCount(view.companies), [view.companies]);

  return (
    <div className="su">
      <header className="su-top">
        <span className="su-brand">
          <Logo height={30} />
        </span>
        <span className="su-left">
          Getting set up · <strong>{timeLeftWords(key)}</strong>
        </span>
        <span className="su-saved">Saved as you go</span>
        <span className="su-credits" aria-live="polite" title="Your balance">
          <strong className="num">{me.credits}</strong> credits
          {earnedNow > 0 ? <span className="su-gain num">+{earnedNow} earned</span> : null}
        </span>
        {key === "done" ? null : (
          <button type="button" className="su-later" onClick={() => void finish()} disabled={finishing}>
            Finish later
          </button>
        )}
      </header>

      <nav className="su-steps" aria-label="Set-up steps">
        {steps.map((s) => (
          <button key={s.k} type="button" className={`su-step${s.now ? " now" : ""}${s.done ? " done" : ""}${s.skipped ? " skipped" : ""}`} aria-current={s.now ? "step" : undefined} onClick={() => !finishing && go(s.k !== "ideal" && !fn ? screenN("ideal") : s.n)}>
            <span className="su-dot" aria-hidden>
              {s.done ? <IconCheck size={13} /> : s.step}
            </span>
            <span className="su-step-t">
              <strong>{LABELS[s.k]}</strong>
              <span>{s.now ? "Now" : s.done ? subOf[s.k] : s.skipped ? "Skipped. Tap to do it" : s.k === "know" ? "Optional · 1 minute" : "1 minute"}</span>
            </span>
          </button>
        ))}
      </nav>
      <div className="su-bar" role="progressbar" aria-label="Set-up progress" aria-valuemin={0} aria-valuemax={SETUP_STEPS} aria-valuenow={Math.min(SETUP_STEPS, Math.max(0, screen - 1))}>
        <span style={{ width: `${Math.min(100, Math.max(0, (screen - 1) / (SETUP_STEPS + 1)) * 100)}%` }} />
      </div>

      <div className="su-body">
        <main className="su-main" ref={cardRef}>
          {key === "welcome" ? (
            <Welcome first={first} invited={invited} credits={me.credits} trial={trialAhead} seats={seats.length} />
          ) : key === "ideal" ? (
            <Ideal
              fn={fn}
              setFn={(f) => {
                setFn(f);
                setBefore((b) => {
                  if (!b || !b.includes(f)) return b;
                  const rest = b.filter((x) => x !== f);
                  return rest.length ? rest : null;
                });
              }}
              title={title}
              setTitle={setTitle}
              icp={icp}
              setIcp={setIcp}
              here={init.here}
              industries={industries}
              order={order.order}
              suggested={order.suggested}
              before={before}
              beforeNow={beforeNow}
              setBefore={setBefore}
              counts={counts}
              suggest={ready ? suggestIcp(infos, me, fn, icp) : null}
            />
          ) : key === "seats" ? (
            <SeatsScreen view={view} act={act} infos={infos} seats={seats} ready={ready} fn={fn} title={title} mine={mine} setMine={setMine} clients={clients} setClients={setClients} added={added} setAdded={setAdded} />
          ) : key === "like" ? (
            <LikeScreen
              act={act}
              me={me}
              like={like}
              ready={ready}
              off={likeOff}
              setOff={setLikeOff}
              savedId={likeId}
              onSaved={(id, sig) => {
                setLikeId(id);
                setLikeSig(sig);
              }}
              onSeats={() => go(screenN("seats"))}
            />
          ) : key === "know" ? (
            <KnowScreen onLeave={() => setPlace()} />
          ) : key === "first" ? (
            <FirstScreen
              view={view}
              act={act}
              infos={infos}
              fn={fn}
              fv={fv}
              ready={ready && profSent === profSig}
              ideal={!icpEmpty(icp)}
              opened={opened}
              setOpened={setOpened}
              knownAny={known.any}
              onKnow={() => go(screenN("know"))}
              onPage={(id) => void finish(`?c=${encodeURIComponent(id)}`)}
            />
          ) : (
            <Done
              me={me}
              view={view}
              seatsHeld={seats.length}
              opened={openedName}
              radarEmail={radarEmail}
              setRadarEmail={setRadarEmail}
              go={(k) => go(screenN(k))}
              open={(to) => void finish(to)}
              link={linkStep}
              linkKept={linkKept}
              onKept={() => setLinkKept(true)}
              support={support}
              finishing={finishing}
              onBack={() => go(screen - 1)}
            />
          )}
          {key === "done" ? null : nav}
        </main>

        <aside className="su-side" aria-label="What you have so far">
          <section className="su-card">
            <h2 className="su-h2">What you have so far</h2>
            {(
              [
                ["ideal", "Companies that fit", counts ? plural(counts.match, "company", "companies") : "Counting", idealLine(fn, icp)],
                ["seats", "Seats", `${plural(seats.length, "seat", "seats")} on file as yours`, earnedNow ? `+${plural(earnedNow, "credit", "credits")} earned` : "Each answer you add earns 1 credit"],
                ["like", "Like your past clients", like.empty ? "Needs a seat" : plural(like.ranked.length, "company", "companies"), likeId ? "Saved as your first list, alert on" : like.empty ? "Add a seat and Merlin finds companies like it" : "Not saved yet"],
                ["know", "Who you know", known.any ? known.line : "Nothing brought in yet", known.any ? "Only you see them" : "From your seats alone for now"],
                ["first", "First company", openedName ?? (opened ? "Opened" : "Not opened yet"), opened ? "Yours to keep" : "Opens free from Crystal Ball"],
              ] as [ScreenKey, string, string, string][]
            ).map(([k, label, value, sub]) => {
              const n = screenN(k);
              const live = screen === n;
              const seen = maxSeen > n || screen > n;
              const tick = seen && has[k] && !live;
              return (
                <div key={k} className="su-far">
                  <span className={`su-fdot${tick ? " done" : live ? " now" : seen ? " skipped" : ""}`} aria-hidden>
                    {tick ? <IconCheck size={12} /> : null}
                  </span>
                  <span className="su-far-t">
                    <span>{label}</span>
                    <strong className={seen || live ? "" : "su-mute"}>{seen || live ? value : `Step ${stepOfScreen(n)}`}</strong>
                    {seen || live ? <span>{sub}</span> : null}
                  </span>
                </div>
              );
            })}
          </section>
          {key === "ideal" ? <FirstLook counts={counts} /> : null}
          <section className="su-card su-ledger" aria-label="Credits">
            <h2 className="su-h2">Credits</h2>
            <span className="su-lrow">
              <span>Starting credits</span>
              <strong className="num">{lines.start}</strong>
            </span>
            <span className="su-lrow">
              <span>Earned here</span>
              <strong className={`num${lines.earned ? " su-up" : " su-mute"}`}>+{lines.earned}</strong>
            </span>
            {invited || lines.bonus ? (
              <span className="su-lrow">
                <span>Invite bonus</span>
                <strong className={`num${lines.bonus ? " su-up" : " su-mute"}`}>{lines.bonus ? `+${lines.bonus}` : "After your first fact"}</strong>
              </span>
            ) : null}
            <span className="su-lrow">
              <span>Spent</span>
              <strong className="num">{lines.spent ? `-${lines.spent}` : "0"}</strong>
            </span>
            <span className="su-lrow su-ltotal">
              <strong>You have</strong>
              <strong className="num">{plural(me.credits, "credit", "credits")}</strong>
            </span>
            <span className="su-small">A company costs 2 credits to open, a fact 1. Adding a fact Merlin does not have earns 1.{trialAhead ? " On the trial, companies open free." : ""}</span>
          </section>
          <section className="su-why" aria-label="Why we ask">
            <strong>{WHY[key][0]}</strong>
            <span>{WHY[key][1]}</span>
          </section>
        </aside>
      </div>
    </div>
  );
}

function footHint(k: ScreenKey, x: { fn: string | null; seats: number; like: boolean; likeEmpty: boolean; known: boolean; opened: string | null }): string {
  switch (k) {
    case "welcome":
      return "Five steps, about a minute each.";
    case "ideal":
      return x.fn ? "Nothing picked in a row means all of it." : "Pick the function you sell to go on.";
    case "seats":
      return x.seats ? `${plural(x.seats, "seat", "seats")} on file as yours. You can add more later on Seats.` : "No seat yet. You can add one later on Seats.";
    case "like":
      return x.like ? "Saved. Its alert is on." : x.likeEmpty ? "Nothing to match yet. Skipping is fine." : "Save it, or skip and find it later in Find.";
    case "know":
      return x.known ? "You can add another source later in Settings." : "Nothing brought in. Skipping is fine: seat holders still show as ways in.";
    case "first":
      return x.opened ? `${x.opened} is open. The others stay in Crystal Ball.` : "Nothing opened. The companies wait for you in Crystal Ball.";
    default:
      return "";
  }
}

/* ---------- 1. welcome ---------- */

function Welcome({ first, invited, credits, trial, seats }: { first: string; invited: [string, string] | null; credits: number; trial: boolean; seats: number }) {
  const PLAN: [string, string, string][] = [
    ["Your ideal client", "Function, industries, company size", "A list of companies tuned to you, with a live count as you pick."],
    ["The seats you have held", seats ? `${plural(seats, "seat", "seats")} on file under your name` : "Confirm or add them in a tap", "Credits for what you add, and a way in at each client."],
    ["Like your past clients", "Nothing to type", "Companies like the ones you served, saved as your first list with an alert."],
    ["Who you know", "Google, a connections file, a CSV, or skip", "Warm paths: who can open a door at the companies that fit."],
    ["Your first company", "Pick one of three", "Its name, who held the seat, who decides and your way in."],
  ];
  return (
    <>
      <Head eyebrow={`Welcome, ${first}`} title="Five short steps to your first open company">
        Merlin is a data exchange for fractional operators. It shows which companies hire fractionals, who held each seat, who decides, and your way in. Share what you know to earn credits.
      </Head>
      {invited ? (
        <div className="su-invite">
          <span className="su-volt num">+{REFERRAL_BONUS} credits</span>
          <span>
            <strong>{invited[0]}</strong> {invited[1]} The seats step does it.
          </span>
        </div>
      ) : null}
      <section className="su-plan" aria-label="What the next minutes get you">
        <h2 className="su-h2">What the next five minutes get you</h2>
        {PLAN.map(([t, ask, get], k) => (
          <div key={t} className="su-plan-row">
            <span className="su-plan-n">{k + 1}</span>
            <span className="su-plan-t">
              <strong>{t}</strong>
              <span>{ask}</span>
            </span>
            <span className="su-plan-get">{get}</span>
            <span className="su-pill">{k === 3 ? "Optional" : "1 minute"}</span>
          </div>
        ))}
      </section>
      <section className="su-tiles" aria-label={trial ? "Your trial" : "Your credits"}>
        {trial ? (
          <>
            <div className="su-tile">
              <strong>{TRIAL_DAYS} days</strong>
              <span>{TRIAL_NAME}. It starts when you finish here, no card.</span>
            </div>
            <div className="su-tile">
              <strong className="num">{plural(credits, "credit", "credits")}</strong>
              <span>To start. You earn more by adding what you know.</span>
            </div>
            <div className="su-tile">
              <strong className="num">{TRIAL_OPENS_DAILY} a day</strong>
              <span>Companies you can open free, each with everything on it.</span>
            </div>
          </>
        ) : (
          <>
            <div className="su-tile">
              <strong className="num">{plural(credits, "credit", "credits")}</strong>
              <span>To start. You earn more by adding what you know.</span>
            </div>
            <div className="su-tile">
              <strong className="num">2 credits</strong>
              <span>To open a company. A fact is 1.</span>
            </div>
            <div className="su-tile">
              <strong className="num">1 a day</strong>
              <span>On the Free plan, one Crystal Ball company opens free each day.</span>
            </div>
          </>
        )}
      </section>
      {trial ? <p className="su-small">{OPENS_RULE}</p> : null}
      <p className="su-small">You can skip any step and come back to it. Your answers save after each step, so a new tab or another device picks up where you stopped.</p>
    </>
  );
}

/* ---------- 2. the ideal client ---------- */

function Chip({ on, onClick, children, n, radio, tab }: { on: boolean; onClick: () => void; children: ReactNode; n?: number | null; radio?: boolean; tab?: number }) {
  return (
    <button type="button" className={`su-chip${on ? " on" : ""}`} {...(radio ? { role: "radio", "aria-checked": on, tabIndex: tab } : { "aria-pressed": on })} onClick={onClick}>
      {on && !radio ? <IconCheck size={11} /> : null}
      {children}
      {n !== undefined && n !== null ? <span className="su-chip-n num">{n.toLocaleString("en-US")}</span> : null}
    </button>
  );
}
const toggle = (xs: string[], v: string) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);
const SIZE_WORDS = (v: string) => v.replace("–", " to ").replace("1,001+", "Over 1,000");

function Ideal(p: {
  fn: string | null;
  setFn: (f: string) => void;
  title: string;
  setTitle: (t: string) => void;
  icp: Icp;
  setIcp: (v: Icp) => void;
  here: string | null;
  industries: { name: string; n: number }[];
  order: string[];
  suggested: string[];
  before: string[] | null;
  beforeNow: string[];
  setBefore: (b: string[] | null) => void;
  counts: ReturnType<typeof idealCounts> | null;
  suggest: ReturnType<typeof suggestIcp>;
}) {
  const { fn, icp, setIcp } = p;
  const nfn = namedFn(fn);
  const [moreInd, setMoreInd] = useState(false);
  const [moreBefore, setMoreBefore] = useState(() => p.beforeNow.some((f) => !p.suggested.includes(f)));
  const picks = titlesFor(fn);
  const shownInd = (moreInd ? p.industries : p.industries.slice(0, 10)).filter((x) => x.n > 0 || icp.industries.includes(x.name));
  const sugOn = !!p.suggest && JSON.stringify([...p.suggest.icp.industries].sort()) === JSON.stringify([...icp.industries].sort()) && JSON.stringify([...p.suggest.icp.employees].sort()) === JSON.stringify([...icp.employees].sort());
  const unsure = p.before !== null && p.before.length === 0;
  const full = p.beforeNow.length >= BEFORE_MAX;
  const country = icp.countries.length === 1 ? icp.countries[0] : null;
  const where = p.here ?? country;
  const c = p.counts;
  const fnIdx = FUNCTIONS.indexOf(fn as (typeof FUNCTIONS)[number]);
  const fns = FUNCTIONS.filter((f) => f !== "Other");
  return (
    <>
      <Head eyebrow={`Step 1 of ${SETUP_STEPS}`} title="Who is your ideal client?">
        The function you sell, the industries, the company size. Merlin tunes Find, Crystal Ball and every list to them. You can change it later in Settings.
      </Head>
      <div className="su-count" aria-live="polite">
        <strong className="su-count-n num">{c ? c.match.toLocaleString("en-US") : "…"}</strong>
        <span className="su-count-t">
          <strong>{c ? `${c.match === 1 ? "company fits" : "companies fit"} of ${c.total.toLocaleString("en-US")} on Merlin` : "Counting the companies on Merlin"}</strong>
          {c ? (
            <span className="num">
              {c.hiring.toLocaleString("en-US")} hiring now{nfn ? ` · ${c.likely.toLocaleString("en-US")} likely to need ${nfn} next` : ""}
            </span>
          ) : null}
        </span>
        {p.suggest ? (
          <button type="button" className="su-ghost" onClick={() => setIcp(sugOn ? { ...icp, industries: [], employees: [] } : p.suggest!.icp)}>
            {sugOn ? "Clear picks" : "Use Merlin's suggestion"}
          </button>
        ) : null}
      </div>
      {p.suggest && !sugOn ? <p className="su-small su-tight">Merlin&apos;s suggestion comes from {p.suggest.from === "seats" ? "the companies where you held a seat" : `the companies on Merlin that hired a fractional ${nfn ?? "leader"}`}.</p> : null}

      <div className="su-group" role="radiogroup" aria-label="The function you sell" onKeyDown={radioKeys}>
        <span className="su-glabel">
          <strong>The function you sell</strong>
          <span>One.</span>
        </span>
        <div className="su-chips">
          {fns.map((f, i) => (
            <Chip key={f} on={fn === f} radio tab={radioTab(i, fnIdx)} onClick={() => p.setFn(f)}>
              {f}
            </Chip>
          ))}
        </div>
      </div>
      {fn ? (
        <div className="su-group">
          <span className="su-glabel">
            <strong>Your title</strong>
            <span>Members see it when you message them.</span>
          </span>
          <div className="su-chips">
            {picks.map((t) => (
              <Chip key={t} on={p.title === t} onClick={() => p.setTitle(t)}>
                {t}
              </Chip>
            ))}
            <label className="su-type">
              {picks.length ? "Or type it" : "Your title"}
              <input type="text" value={p.title} maxLength={80} onChange={(e) => p.setTitle(e.target.value)} placeholder={nfn ? `Fractional VP ${nfn}` : "Fractional VP Sales"} autoComplete="organization-title" />
            </label>
          </div>
        </div>
      ) : null}
      <div className="su-group" role="group" aria-label="Industries">
        <span className="su-glabel">
          <strong>Industries</strong>
          <span>{icp.industries.length ? `${plural(icp.industries.length, "industry", "industries")} picked` : "None picked means any industry. The number is companies in each."}</span>
        </span>
        <div className="su-chips">
          {shownInd.map((x) => (
            <Chip key={x.name} on={icp.industries.includes(x.name)} n={x.n} onClick={() => setIcp({ ...icp, industries: toggle(icp.industries, x.name) })}>
              {x.name}
            </Chip>
          ))}
          {!moreInd && p.industries.length > 10 ? (
            <button type="button" className="su-link" onClick={() => setMoreInd(true)}>
              More industries
            </button>
          ) : null}
        </div>
      </div>
      <div className="su-group" role="group" aria-label="Company size, by people">
        <span className="su-glabel">
          <strong>Company size, by people</strong>
          <span>{icp.employees.length ? "" : "None picked means any size."}</span>
        </span>
        <div className="su-chips">
          {RN_EMPLOYEES.map((v) => (
            <Chip key={v} on={icp.employees.includes(v)} onClick={() => setIcp({ ...icp, employees: RN_EMPLOYEES.filter((x) => (x === v ? !icp.employees.includes(v) : icp.employees.includes(x))) })}>
              {SIZE_WORDS(v)}
            </Chip>
          ))}
        </div>
      </div>
      {where ? (
        <div className="su-group" role="group" aria-label="Where">
          <span className="su-glabel">
            <strong>Where</strong>
            <span>Starts in your own country.</span>
          </span>
          <div className="su-chips">
            <Chip on={country === where} onClick={() => setIcp({ ...icp, countries: [where] })}>
              {where}
            </Chip>
            <Chip on={!icp.countries.length} onClick={() => setIcp({ ...icp, countries: [] })}>
              Anywhere
            </Chip>
          </div>
        </div>
      ) : null}
      {fn ? (
        <div className="su-group" role="group" aria-label="Who is usually hired before you">
          <span className="su-glabel">
            <strong>Who is usually hired before you</strong>
            <span>Optional. A company that just hired one of these often needs {nfn ? `${nfn} next` : "you next"}. Merlin ticked its suggestion.</span>
          </span>
          <div className="su-chips">
            {[...p.suggested, ...(moreBefore ? p.order.filter((f) => !p.suggested.includes(f)) : [])].map((f) => {
              const on = !unsure && p.beforeNow.includes(f);
              return (
                <Chip key={f} on={on} onClick={() => (!on && full ? undefined : p.setBefore(toggleBefore(unsure ? [] : p.beforeNow, f)))}>
                  {f}
                </Chip>
              );
            })}
            <Chip on={unsure} onClick={() => p.setBefore(unsure ? null : [])}>
              Not sure
            </Chip>
            {moreBefore ? null : (
              <button type="button" className="su-link" onClick={() => setMoreBefore(true)}>
                Other functions
              </button>
            )}
          </div>
          {unsure ? <span className="su-small">We&apos;ll start with {andList(p.suggested)}.</span> : p.before !== null && full ? <span className="su-small">{BEFORE_MAX} picked, the most.</span> : null}
        </div>
      ) : null}
    </>
  );
}

/** "A first look": the first companies that fit, each described by its free facts. A locked company is never named. */
function FirstLook({ counts }: { counts: ReturnType<typeof idealCounts> | null }) {
  const rows = counts ? counts.rows.slice(0, 4) : [];
  return (
    <section className="su-card su-look" aria-label="A first look at your list" aria-live="polite">
      <div className="su-look-h">
        <h2 className="su-h2">A first look</h2>
        <span>{counts ? `${rows.length} of ${counts.match.toLocaleString("en-US")} that fit` : "Finding them"}</span>
      </div>
      {rows.map((r) => {
        const i = r.i;
        const hot = counts!.hiringIds.has(i.c.id);
        const hired = i.fnState.hired.filter((f) => f !== "Other");
        return (
          <div key={r.key} className="su-look-row">
            <span className="su-tile-q" aria-hidden>
              {i.c.hidden ? "?" : i.c.name.slice(0, 1)}
            </span>
            <span className="su-look-t">
              <strong>{i.c.hidden ? factsLine(i) || companyLabel(i) : `${i.c.name}${factsLine(i) ? ` · ${factsLine(i)}` : ""}`}</strong>
              <span>{hired.length ? `Hired fractional ${hired.slice(0, 2).join(" and ")}` : "On file"}</span>
            </span>
            <span className={`su-sig${hot ? " hot" : ""}`}>{hot ? "Hiring now" : "Fractional friendly"}</span>
          </div>
        );
      })}
      {counts && !rows.length ? <p className="su-look-p">No company for this mix yet. Take off an industry or a size.</p> : null}
      <p className="su-look-foot">Names are locked for now. You open your first one in step 5.</p>
    </section>
  );
}

/* ---------- 7. done ---------- */

function Done(p: {
  me: NonNullable<View["me"]>;
  view: View;
  seatsHeld: number;
  opened: string | null;
  radarEmail: boolean;
  setRadarEmail: (v: boolean) => void;
  go: (k: ScreenKey) => void;
  open: (to: string) => void;
  link: boolean;
  linkKept: boolean;
  onKept: () => void;
  support: string | null;
  finishing: boolean;
  onBack: () => void;
}) {
  const { me } = p;
  const close = !me.plan || me.plan.tier === "close" || me.plan.name === "trial" || (me.plan.name === "free" && !me.plan.hadTrial);
  const six = sixSteps({ me, seatsHeld: p.seatsHeld, close });
  const head = { label: six.done >= six.of ? `All ${six.of} done` : `${six.done} of ${six.of} done, the rest are waiting`, head: p.opened ? `You are set up, and ${p.opened} is open` : six.done ? "You are set up" : "Nothing is set up yet, and that is fine" };
  const JUMP: Partial<Record<string, ScreenKey>> = { icp: "ideal", seat: "seats", network: "know", open: "first" };
  const LINK: Partial<Record<string, string>> = { alert: "?p=find", evidence: "?p=evidence" };
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [asked, setAsked] = useState(false);
  useEffect(() => setLink(`${window.location.origin}/?k=${me.token}`), [me.token]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {}
    setCopied(true);
    p.onKept();
    setTimeout(() => setCopied(false), 2400);
  };
  const needLink = p.link && !p.linkKept;
  return (
    <>
      <Head eyebrow={head.label} title={head.head}>
        {six.done
          ? "Here is what Merlin built from your answers and the steps left. The rest happen inside the product, with your own data already in place."
          : "Merlin's own data is all there, so Home is not empty. Each step below takes about a minute whenever you want it, here or from Getting started in the nav."}
      </Head>
      <section className="su-six" aria-label="The steps">
        {six.steps.map((s) => (
          <div key={s.key} className={`su-six-row${s.done ? " done" : ""}`}>
            <span className={`su-dot${s.done ? " done" : ""}`} aria-hidden>
              {s.done ? <IconCheck size={13} /> : s.n}
            </span>
            <span className="su-six-t">
              <strong>{s.label}</strong>
              <span>{s.done ? s.gives : s.takes}</span>
            </span>
            {s.done ? null : JUMP[s.key] ? (
              <button type="button" className="su-ghost" onClick={() => p.go(JUMP[s.key]!)}>
                Do it now
              </button>
            ) : LINK[s.key] ? (
              <button type="button" className="su-ghost" onClick={() => p.open(LINK[s.key]!)} disabled={p.finishing}>
                {s.go}
              </button>
            ) : null}
          </div>
        ))}
      </section>
      <section className="su-before" aria-label="Before you go">
        <Switch
          on={p.radarEmail}
          onChange={p.setRadarEmail}
          label="New moves every morning, by email"
          hint={p.view.scan?.digest ? "Three companies from your Crystal Ball and your best way in to each, only on mornings when something moved." : "Email starts once it's switched on for the pilot. Your moves are on Home either way."}
        />
        <div className="su-link-row">
          <span className="su-link-t">
            <strong>Your sign-in link</strong>
            <span>
              Merlin has no password.{p.view.email ? ` We emailed the link to ${me.email}.` : ""} Keep a copy.
              {p.support ? (
                <>
                  {" "}
                  Lost it?{" "}
                  <a href={mailto(p.support, "Merlin sign-in link") ?? undefined} className="su-a">
                    Ask us
                  </a>
                </>
              ) : null}
            </span>
            <span className="su-mono">{link}</span>
          </span>
          <button type="button" className="su-ghost" onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </section>
      <div className="su-laters">
        <span>Worth two minutes later:</span>
        <button type="button" className="su-a" onClick={() => p.open("?p=settings&sec=voice")} disabled={p.finishing}>
          Set your writing voice, so drafted notes sound like you
        </button>
        <button type="button" className="su-a" onClick={() => p.open("?p=credits&tab=earn")} disabled={p.finishing}>
          Invite a fractional. You both get {REFERRAL_BONUS} credits
        </button>
      </div>
      <div className="su-foot">
        <button type="button" className="su-back" onClick={p.onBack} disabled={p.finishing}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back
        </button>
        <span className="su-foot-hint" aria-live="polite">
          {asked && needLink ? <strong className="su-warn">Copy your sign-in link first. Without it you can&apos;t sign back in.</strong> : `${six.done} of ${six.of} set-up steps done. The rest live in the product.`}
        </span>
        <button type="button" className="su-next" disabled={p.finishing} aria-busy={p.finishing} onClick={() => (needLink && !asked ? setAsked(true) : p.open(""))}>
          {p.finishing ? "Opening" : asked && needLink ? "Open Home without it" : "Open Home"}
        </button>
      </div>
    </>
  );
}
