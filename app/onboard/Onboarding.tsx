"use client";

/**
 * First run, about a minute. One calm card:
 *   1. What Merlin is and what a credit buys, then who they are: their function, the title
 *      they go by when they message, and what they are looking for. A member with seats on file
 *      hears where those came from and who can see their name, since most of them arrive by
 *      personal link and skip the landing page.
 *   2. Who they hunt: their Ideal Fractional Profile, the companies they want as clients (industries,
 *      size, revenue, where). Every part optional.
 *   3. Find your seats: they type past and current clients, and claim the seats we found there
 *      ("Not on Merlin yet", with the "Is this you?" check), or add one we don't have.
 *   4. Follow companies (type-ahead plus 6 suggestions that fit their clients and function, never
 *      a fractional firm and never a company where they held a seat). Optional.
 *   5. Keep your sign-in link (only for members who joined here while email sign-in is off).
 * Each step is a history entry and the answers are kept for the tab, so back steps back and a
 * reload comes back to the same step. Finishing sends the follows, then the profile last
 * (which marks the member onboarded). The last button opens the table their answers built; a
 * member with seats on file under their name also gets "Fill in your seats" (Root opens the app
 * there). The last step also offers the weekly email of new matches (a saved view) and Slack.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./onboard.css";
import { Brand, CompanyLogo, IconBriefcase, IconCheck, IconCoin, IconSearch, IconStar, IconX, post, useToast, type Act, type View } from "../ui/shared";
import { FUNCTIONS } from "@/lib/tableFields";
import { GOALS, type CompanyRec, type Icp } from "@/lib/tableTypes";
import { icpEmpty } from "@/app/post/model";
import { EMPTY_ICP, IcpFields, countriesByCount, industriesByCount } from "@/app/post/Hunt";
import { alertView, isMine, metaOf, named, realTitle, seatFns, suggest, titlesFor, type Goal } from "./suggest";
import { FindSeats, SEAT_YIELD, seatsFound } from "./FindSeats";
import { ICP_SKIPPED } from "@/app/post/getStarted";
import { contactOf, mailto } from "../landing/contact";

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

/**
 * What the table opens on because of each answer (the app reads the stored key: its first tab
 * and filters follow from it). The answers themselves are GOALS in lib/tableTypes.ts.
 */
const GOAL_OPENS: Record<Goal, (fn: string | null) => string> = {
  roles: () => "The table opens on the fractional roles that are open now. We check for new ones every week.",
  friendly: () => "The table opens on repeat hirers, the companies that hired fractionals more than once.",
  adjacent: (fn) =>
    named(fn)
      ? `The table opens on companies that hired fractionals in other functions and have no ${fn} seat on file.`
      : "The table opens on companies that hired fractionals in other functions and have no seat in yours on file.",
  intro: () => "The table opens on seats where the seat holder is on file.",
};

/* ---------- where the member is: history entry and tab storage ---------- */

/** The tab keeps the answers, so a reload on step 2 still has the step 1 answers it needs. */
const SAVE_KEY = "tp_ob";
interface Saved {
  id: string;
  step: number;
  fn: string | null;
  goal: Goal | null;
  follows: string[];
  title?: string;
  icp?: Icp;
  /** Clients typed on Find your seats: a company id, or a name we don't have. */
  clients?: string[];
}
function readSaved(id: string): Partial<Saved> {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null");
    return s && s.id === id ? s : {};
  } catch {
    return {};
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

/**
 * The weekly email of new matches, offered on the last step: a saved view (the one Save this
 * view makes) of open roles in their function that fit their profile. Slack is a link away.
 */
function AlertsOpt({
  on, setOn, fn, icp, emailOn, busy, onSlack,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  fn: string | null;
  icp: Icp;
  /** The weekly email can go out (email is set up). Otherwise the view is still saved. */
  emailOn: boolean;
  busy: boolean;
  onSlack: () => void;
}) {
  const what = `${named(fn) ? `${fn} roles` : "fractional roles"}${icpEmpty(icp) ? "" : " that fit your profile"}`;
  return (
    <div className="ob-alerts">
      <label className="ob-alerts-opt">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="ob-alerts-text">
          <span className="ob-alerts-label">{emailOn ? `Email me new ${what} each week` : `Save new ${what} as a view`}</span>
          <span className="ob-alerts-hint">
            {emailOn ? "Only when something is new. Turn it off any time under Saved views." : "It sits under Saved views in the filters, so new ones are a click away."}
          </span>
        </span>
      </label>
      <p className="ob-alerts-slack">
        Rather get them in Slack?{" "}
        <button type="button" className="ob-linkbtn" disabled={busy} onClick={onSlack}>
          Set it up in Integrations
        </button>
      </p>
    </div>
  );
}

export default function Onboarding({ view, act, onDone, onSkip }: OnboardingProps) {
  const me = view.me!;
  const toast = useToast();
  const first = (me.name || "").trim().split(/\s+/)[0] || "there";
  const linkStep = me.id.startsWith("j_") && !view.email;
  // 1 who you are, 2 your Ideal Fractional Profile, 3 find your seats, 4 follow, 5 keep your link.
  const total = linkStep ? 5 : 4;
  const { support } = contactOf(view);

  // Answers kept from earlier in this tab (a reload), else what the server already knows.
  const [init] = useState(() => {
    const saved = readSaved(me.id);
    const known = new Set(view.companies.map((c) => c.id));
    // A function picked on the landing page's "Try it" comes before one guessed from the title.
    const fn = (saved.fn && FUNCTIONS.includes(saved.fn) ? saved.fn : null) ?? triedFn() ?? (me.function && FUNCTIONS.includes(me.function) ? me.function : null);
    const goal = ((GOALS.find((g) => g.key === saved.goal) ?? GOALS.find((g) => g.key === me.goal))?.key as Goal | undefined) ?? null;
    const follows = Array.isArray(saved.follows) ? saved.follows.filter((id) => known.has(id)) : view.companies.filter((c) => c.following).map((c) => c.id);
    const want = entryStep() || saved.step || 1;
    // No title yet means an empty field with the placeholder showing, never a stored "Member".
    const title = typeof saved.title === "string" ? saved.title : realTitle(me.title);
    const icp = saved.icp ?? me.icp ?? EMPTY_ICP;
    const clients = Array.isArray(saved.clients) ? saved.clients.slice(0, 20) : [];
    return { fn, goal, follows, title, icp, clients, step: fn && goal ? Math.min(Math.max(1, want), total) : 1 };
  });
  const [step, setStep] = useState(init.step);
  const [fn, setFn] = useState<string | null>(init.fn);
  const [goal, setGoal] = useState<Goal | null>(init.goal);
  const [follows, setFollows] = useState<string[]>(init.follows);
  const [title, setTitle] = useState(init.title);
  const [icp, setIcp] = useState<Icp>(init.icp);
  const [clients, setClients] = useState<string[]>(init.clients);
  const [busy, setBusy] = useState(false);
  // What the server has been told, so going back and forth sends only the changes.
  const sent = useRef(new Set(view.companies.filter((c) => c.following).map((c) => c.id)));
  const rewinding = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  // Seats on file that carry this member's name. When there are any, that is where they go next.
  const mySeats = useMemo(() => view.companies.reduce((n, c) => n + c.engagements.filter((e) => e.yours).length, 0), [view.companies]);
  // Of those, the ones we matched to work they published with us (the rest a member added with their name on it).
  const published = useMemo(
    () => view.companies.reduce((n, c) => n + c.engagements.filter((e) => e.yours && (e.source === "Published engagement" || e.source === "Member success story")).length, 0),
    [view.companies],
  );
  // The weekly email of new matches, offered on the last step (on unless they untick it).
  const [alerts, setAlerts] = useState(true);
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
  // Step 2 and 3 need both answers. If they are missing (storage was cleared), ask again.
  const shown = step > 1 && (!fn || !goal) ? 1 : step;

  // Each step opens at its top, so the browser never brings back an old scroll. That matters most
  // when finishing takes history back to the first step's entry: the app must open at its top, not
  // where the first step was scrolled. The mode is kept per entry, so it is set before any is left.
  useEffect(() => {
    try {
      window.history.scrollRestoration = "manual";
    } catch {}
  }, []);

  // This page's history entry holds the step: back steps back, forward steps forward, and a
  // reload comes back to it.
  useEffect(() => {
    if (entryStep() !== init.step) window.history.replaceState({ ob: init.step }, "");
    const onPop = () => {
      if (rewinding.current) return;
      setStep(Math.min(Math.max(1, entryStep() || 1), total));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [init.step, total]);

  useEffect(() => writeSaved({ id: me.id, step, fn, goal, follows, title, icp, clients }), [me.id, step, fn, goal, follows, title, icp, clients]);

  // New step: start at the top of the card, and move focus to its heading for screen readers.
  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>("[data-step-h]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [shown]);

  const forward = (n: number) => {
    setStep(n);
    window.history.pushState({ ob: n }, "");
  };
  const back = () => {
    if (step > 1 && entryStep() === step) window.history.back();
    else setStep((s) => Math.max(1, s - 1));
  };
  /** Take the step entries back off history before the app opens, so back in the app never lands on a step. */
  const rewind = () =>
    new Promise<void>((done) => {
      const n = entryStep();
      if (n <= 1) return done();
      rewinding.current = true;
      const end = () => {
        window.removeEventListener("popstate", end);
        clearTimeout(t);
        rewinding.current = false;
        done();
      };
      const t = setTimeout(end, 600);
      window.addEventListener("popstate", end);
      window.history.go(-(n - 1));
    });

  const byId = useMemo(() => new Map(view.companies.map((c) => [c.id, c])), [view.companies]);
  const toggle = (id: string) => setFollows((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  /** Send the follow changes at once, side by side. The profile action after them brings back the view. */
  const sendFollows = async () => {
    const want = new Set(follows);
    const ops = [
      ...[...want].filter((id) => !sent.current.has(id)).map((id) => ({ id, on: true })),
      ...[...sent.current].filter((id) => !want.has(id)).map((id) => ({ id, on: false })),
    ];
    const errors = await Promise.all(
      ops.map(async ({ id, on }) => {
        const r = await post({ action: { type: "follow", companyId: id, on } });
        if (r.error) return r.error;
        if (on) sent.current.add(id);
        else sent.current.delete(id);
        return null;
      }),
    );
    const err = errors.find(Boolean);
    if (err) toast(err, true);
  };

  /**
   * Finish with what is answered so far. `skip`: "Skip to the table", from any step. The profile
   * action marks the member onboarded either way, so a reload never brings them back here.
   */
  const finish = async (skip = false, to: "table" | "seats" | "integrations" = "table") => {
    if (busy) return;
    setBusy(true);
    // The app opens on the table their answers built, unless they asked for their seats.
    if (skip || to !== "seats") onSkip?.();
    await sendFollows();
    // The weekly email of new matches, as a saved view (only from the last step, never on a skip).
    if (!skip && alerts) {
      const v = alertView(fn, icpEmpty(icp) ? null : icp);
      const r = await post({ action: { type: "savedView", op: "save", name: v.name, place: v.place, criteria: v.criteria, email: true } });
      if (r.error) toast(r.error, true);
    }
    await rewind();
    window.scrollTo(0, 0);
    if (to === "integrations") {
      try {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?p=integrations`);
      } catch {}
    }
    const r = await act(
      { type: "profile", function: fn ?? undefined, goal: goal ?? undefined, ...(title.trim() !== realTitle(me.title) ? { title: title.trim() } : {}), icp: icpEmpty(icp) ? null : icp },
      { quiet: true },
    );
    if (!r.ok) {
      setBusy(false);
      if (step > 1 && entryStep() !== step) window.history.pushState({ ob: step }, "");
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

  const afterFollow = async () => {
    if (!linkStep) return finish(false, "table");
    setBusy(true);
    await sendFollows();
    setBusy(false);
    forward(5);
  };

  const alertsOpt = <AlertsOpt on={alerts} setOn={setAlerts} fn={fn} icp={icp} emailOn={emailOn} busy={busy} onSlack={() => finish(false, "integrations")} />;

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
            {shown === 5 ? null : (
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
              fn={fn}
              setFn={setFn}
              title={title}
              setTitle={setTitle}
              goal={goal}
              setGoal={setGoal}
              onNext={() => forward(2)}
            />
          ) : shown === 2 ? (
            <StepClients companies={view.companies} icp={icp} setIcp={setIcp} onBack={back} onNext={() => forward(3)} />
          ) : shown === 3 ? (
            <StepSeats companies={view.companies} fn={fn} title={title} name={me.name} credits={me.credits} clients={clients} setClients={setClients} act={act} onBack={back} onNext={() => forward(4)} />
          ) : shown === 4 ? (
            <StepFollow
              companies={view.companies}
              byId={byId}
              fn={fn}
              icp={icp}
              clients={clients}
              goal={goal}
              follows={follows}
              toggle={toggle}
              busy={busy}
              nextLabel={linkStep ? "Get my sign-in link" : "Open my table"}
              handoff={linkStep ? null : <SeatsNext n={mySeats} busy={busy} onFill={() => finish(false, "seats")} />}
              alerts={linkStep ? null : alertsOpt}
              onBack={back}
              onNext={afterFollow}
            />
          ) : (
            <StepLink
              token={me.token}
              email={me.email}
              support={support}
              emailOn={view.email}
              busy={busy}
              nextLabel="Open my table"
              seats={mySeats}
              alerts={alertsOpt}
              onDone={(to) => finish(false, to)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- step 1: what this is, then two questions ---------- */

function StepQuestions({
  first, seats, published, credits, fn, setFn, title, setTitle, goal, setGoal, onNext,
}: {
  first: string;
  /** Seats on file that carry the member's name. */
  seats: number;
  /** How many of them we matched to fractional work they published on Revenue Nomad. */
  published: number;
  credits: number;
  fn: string | null;
  setFn: (f: string) => void;
  title: string;
  setTitle: (t: string) => void;
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
        <p className="ob-hint">{goal ? GOAL_OPENS[goal](fn) : "The table opens on what you pick. You can change it later with the filters."}</p>
      </fieldset>

      <div className="ob-grow" />
      <div className="ob-foot">
        <span className="ob-foot-note" aria-live="polite">
          {ready ? "" : fn ? "Pick what you are looking for" : goal ? "Pick your function" : "Two answers decide what you see first"}
        </span>
        <button type="submit" className="btn btn-pine btn-lg ob-next" disabled={!ready}>
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
      <p className="ob-sub">The companies you want as clients. The table opens on companies like these, and the best fits for your function come first. Pick as many as fit, or skip it.</p>
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
          Find your seats
        </button>
      </div>
    </div>
  );
}

/* ---------- step 3: find your seats (optional) ---------- */

function StepSeats({
  companies, fn, title, name, credits, clients, setClients, act, onBack, onNext,
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
  onBack: () => void;
  onNext: () => void;
}) {
  // Seats added here, by client: the balance before each, so the card says what the seat earned.
  const [added, setAdded] = useState<Record<string, number>>({});
  const claimedN = seatsFound(companies, clients, added);
  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        Find your seats
      </h1>
      <p className="ob-sub">
        Type the clients you work with now or worked with before. We list the seats we found there in your function. Claim yours and you see everything on it free, and each answer
        you add earns a credit, {SEAT_YIELD}.
      </p>
      <FindSeats companies={companies} fn={fn} title={title} name={name} credits={credits} clients={clients} setClients={setClients} act={act} added={added} setAdded={setAdded} />

      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <span className="ob-foot-note num" aria-live="polite">
          {claimedN ? `${claimedN} ${claimedN === 1 ? "seat is" : "seats are"} yours` : "You can skip this and add seats later"}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" onClick={onNext}>
          Show companies to follow
        </button>
      </div>
    </div>
  );
}

/* ---------- step 4: follow companies (optional) ---------- */

function StepFollow({
  companies, byId, fn, icp, clients, goal, follows, toggle, busy, nextLabel, handoff, alerts, onBack, onNext,
}: {
  companies: CompanyRec[];
  byId: Map<string, CompanyRec>;
  fn: string | null;
  icp: Icp;
  clients: string[];
  goal: Goal | null;
  follows: string[];
  toggle: (id: string) => void;
  busy: boolean;
  /** What the main button does next (get the sign-in link, or open the app). */
  nextLabel: string;
  /** For a member with seats on file: where they go next. Shown first, above the list. */
  handoff: ReactNode;
  /** The weekly email offer, when this is the last step. */
  alerts: ReactNode;
  onBack: () => void;
  onNext: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Suggestions are picked once, from the answers, so cards don't jump around as you follow.
  const [sugg] = useState(() => suggest(companies, goal, fn, icp, clients));

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

  const extra = follows.filter((id) => !sugg.list.some((c) => c.id === id));
  const showList = open && q.trim().length > 0;

  return (
    <div>
      <h1 className="ob-title" tabIndex={-1} data-step-h>
        {goal === "roles" ? "Follow companies you want to hear from" : "Follow companies you know"}
      </h1>
      <p className="ob-sub">
        They get their own tab, and we point out what&apos;s new there each time you come back. Following costs nothing, and you can skip it.
      </p>

      {handoff}

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
                      <span className="ob-result-meta">{isMine(c) ? ["Your seat", metaOf(c)].filter(Boolean).join(" · ") : metaOf(c)}</span>
                    </span>
                    <span className={`ob-result-act${on ? " on" : ""}`}>
                      <IconStar size={13} filled={on} />
                      {on ? "Following" : "Follow"}
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="ob-result-empty">Nothing called {q.trim()} is on file yet. You can add it once you&apos;re in.</li>
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
          const mine = isMine(c);
          // The functions its rows show in the table: hires, open roles, then every other seat's function.
          const fns = seatFns(c);
          return (
            <li key={c.id} className={`ob-co${on ? " ob-co-on" : ""}`}>
              <div className="ob-co-top">
                <CompanyLogo name={c.name} domain={c.iconDomain} />
                <div className="ob-co-id">
                  <span className="ob-co-name" title={c.name}>
                    {c.name}
                  </span>
                  <span className="ob-co-meta" title={meta || undefined}>
                    {meta || "New on Merlin"}
                  </span>
                </div>
              </div>
              <div className="ob-co-bottom">
                <span className="ob-co-fns">
                  {/* An attribute, so an outline chip: the member held a seat here. */}
                  {mine ? <span className="chip ob-your-seat">Your seat</span> : null}
                  {fns.length ? (
                    fns.slice(0, mine ? 1 : 2).map((f) => (
                      <span key={f} className={`chip${f === fn ? " ob-chip-mine" : ""}`}>
                        {f}
                      </span>
                    ))
                  ) : mine ? null : (
                    <span className="ob-co-none">{c.engagements.length ? "Function not on file" : "No seats on file yet"}</span>
                  )}
                  {fns.length > (mine ? 1 : 2) ? <span className="ob-co-more num">+{fns.length - (mine ? 1 : 2)}</span> : null}
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

      {alerts}

      <div className="ob-grow" />
      <div className="ob-foot ob-foot-follow">
        <button type="button" className="ob-back" onClick={onBack}>
          Back
        </button>
        <span className="ob-foot-note num" aria-live="polite">
          {follows.length ? `Following ${follows.length}` : "You can follow companies later too"}
        </span>
        <button type="button" className="btn btn-pine btn-lg ob-next" disabled={busy} aria-busy={busy} onClick={onNext}>
          {busy ? "Saving" : nextLabel}
        </button>
      </div>
    </div>
  );
}

/* ---------- step 5: keep your sign-in link ---------- */

function StepLink({
  token, email, support, emailOn, seats, busy, nextLabel, alerts, onDone,
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
  alerts: ReactNode;
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
      {alerts}

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
