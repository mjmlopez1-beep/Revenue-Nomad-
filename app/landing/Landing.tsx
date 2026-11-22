"use client";

/**
 * Merlin landing page (signed out). In order: the hero (the live signal, the headline, one line,
 * the join form, and one real record, beside the form on a wide screen and peeking up from the
 * bottom of the first screen on a phone), "What are you looking for?" (Finder.tsx: the visitor's
 * function and a question, answered with real counts and rows from GET /api/table?preview=1),
 * the numbers across every function in one band, what members say (Quotes.tsx, drawn only once
 * quotes.ts has a real one), what you can do with it (Features.tsx: four tinted panels, each
 * with a picture drawn in HTML and CSS), how it works (credits, with the free and locked fields
 * folded away), pricing (Pricing.tsx: Free against Pro), questions, and the join form again. The hero's record is a real company from the
 * same preview answer. Nothing on the page is blurred but the rows past the named ones.
 *
 * Merlin covers every fractional function, so nothing here speaks to one: the page's own words
 * say "your function", and a function is named only where the visitor picked it (or in the
 * answer shown as an example, which changes each day and says it is one).
 *
 * One display heading. One volt button in view at a time: the join form's when a form is on
 * screen, the Finder's button when only that is, the nav's when none is.
 *
 * It renders before the view arrives (`view` null): everything but the counts is fixed copy,
 * so the page is up at once and the counts fill in when the view lands.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./landing.css";
import { Brand, IconLock, Num, type View } from "../ui/shared";
import { EARN_CAP, FUNCTIONS, REFERRAL_BONUS } from "@/lib/tableFields";
import { TRIAL_LABEL } from "@/lib/billing/rules";
import JoinForm from "./JoinForm";
import SignIn from "./SignIn";
import { Questions } from "./Questions";
import { priceMatrix } from "./prices";
import { accountNoteOf, contactOf, mailto, signInFailText } from "./contact";
import { Callout } from "../ui/system";
import { DemoAdd, DemoConfirm, DemoUnlock, HeroRecord } from "./Visuals";
import Finder, { type PreviewExample, type Totals } from "./Finder";
import Features from "./Features";
import Quotes from "./Quotes";
import Pricing from "./Pricing";
import { Band } from "../ui/fractions/kit";
import { Corner, FinalScene, HeroDome, HeroEdge, HeroStage, HeroStagePhone, HeroTrail } from "./scenes";

export interface LandingProps {
  /**
   * Signed-out view: only `stats`, `email` and `contact` are filled; companies is empty.
   * Null while it loads: the page shows at once and the counts fill in when it arrives.
   */
  view: View | null;
  /** Call after a successful join (no email provider) or sign-in, to load the signed-in view. */
  onSignedIn: () => Promise<void> | void;
  /** A personal link (?k=) that did not sign the visitor in: Sign in opens with this message. */
  signInError?: string | null;
  /** Sign in opens at once with this note (a link to a message, followed while signed out). */
  signInNote?: string | null;
}

/** The server's default starter balance, used until the view arrives (or if it predates stats.starter). */
const STARTER_FALLBACK = 25;

const fmt = (n: number) => n.toLocaleString("en-US");

/** Revenue Nomad's network, as the page says it. */
const NETWORK = "500+";

/** Every function Merlin covers (lib/preview.ts PREVIEW_FUNCTIONS: all but "Other"), named under the numbers. */
const COVERED = FUNCTIONS.filter((f) => f !== "Other");
/** Questions shown before "Show all". */
const FAQ_FIRST = 6;

/** Free and locked fields, one locked chip per purchase (prices.ts). */
const MATRIX = priceMatrix();

/**
 * First name of the member whose invite link brought this visitor here. Root saves the
 * ?ref= code as localStorage tp_ref; the server answers GET ?ref=CODE with { inviter }.
 * A bad code, no code or blocked storage shows nothing.
 */
function useInviter(): string | null {
  const [inviter, setInviter] = useState<string | null>(null);
  useEffect(() => {
    let ref: string | null = null;
    try {
      ref = localStorage.getItem("tp_ref");
    } catch {
      ref = null;
    }
    if (!ref) return;
    const ctl = new AbortController();
    fetch(`/api/table?ref=${encodeURIComponent(ref)}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { inviter?: unknown } | null) => {
        const name = typeof j?.inviter === "string" ? j.inviter.trim() : "";
        if (name) setInviter(name);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, []);
  return inviter;
}

/** Which of these elements are on screen now, in the same order. Before the observer reports, all of them count as in view. */
function useInView(...refs: React.RefObject<HTMLElement | null>[]): boolean[] {
  const [seen, setSeen] = useState<boolean[]>(() => refs.map(() => true));
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = refs.map((r) => r.current);
    const now = els.map(() => false);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const at = els.indexOf(e.target as HTMLElement);
        if (at >= 0) now[at] = e.isIntersecting;
      }
      setSeen([...now]);
    });
    for (const el of els) if (el) io.observe(el);
    return () => io.disconnect();
    // The refs are stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return seen;
}

/** A count, or a quiet bar the size of one while the view is on its way. */
function Count({ n }: { n: number | undefined }) {
  return typeof n === "number" ? <Num>{fmt(n)}</Num> : <span className="lp-skel" aria-label="Loading" />;
}

type SignInState = { open: boolean; note: string | null; tone: "info" | "error" };

export default function Landing({ view, onSignedIn, signInError = null, signInNote = null }: LandingProps) {
  const [signIn, setSignIn] = useState<SignInState>(() =>
    signInError
      ? { open: true, note: signInFailText(signInError, "clicked"), tone: "error" }
      : signInNote
        ? { open: true, note: signInNote, tone: "info" }
        : { open: false, note: null, tone: "info" },
  );
  // The account was just closed (?closed=1), or a restore link that has expired brought them here (?restore=gone).
  const [accountNote] = useState(() => (typeof window === "undefined" ? null : accountNoteOf(window.location.search)));
  const heroForm = useRef<HTMLDivElement>(null);
  const finalForm = useRef<HTMLDivElement>(null);
  // An answer without stats (an error body) is treated like one that hasn't arrived.
  const s = view?.stats ?? null;
  const emailOn = !!view?.email;
  const { support, intro } = contactOf(view);
  // stats.starter is what the server gives a new member (RN_STARTER_CREDITS, default 25).
  const starter = s?.starter ?? STARTER_FALLBACK;
  // Roles first seen in the last 7 days. A server that predates the count falls back to what is open now.
  const opened = s?.openedWeek ?? 0;
  const inviter = useInviter();
  const findCta = useRef<HTMLDivElement>(null);
  /** The hero's real example record: undefined until the Finder's first answer lands. */
  const [example, setExample] = useState<PreviewExample | null | undefined>(undefined);
  /** Counts across every function, from the same answer. Undefined while it loads, null when it could not be had. */
  const [totals, setTotals] = useState<Totals | null | undefined>(undefined);
  const [heroIn, finalIn, findIn] = useInView(heroForm, finalForm, findCta);
  const formInView = heroIn || finalIn;

  // A failed ?k= link that arrives after the page is up opens Sign in with the message too.
  useEffect(() => {
    if (signInError) setSignIn({ open: true, note: signInFailText(signInError, "clicked"), tone: "error" });
  }, [signInError]);

  /** Take the visitor to the nearest join form and focus it (email, or name once the email is in). */
  const toJoin = useCallback(() => {
    setSignIn({ open: false, note: null, tone: "info" });
    const mid = window.innerHeight / 2;
    const dist = (el: HTMLElement | null) => (el ? Math.abs(el.getBoundingClientRect().top + el.offsetHeight / 2 - mid) : Infinity);
    const target = dist(finalForm.current) < dist(heroForm.current) ? finalForm.current : heroForm.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => target?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 350);
  }, []);
  const openSignIn = useCallback((note: string | null = null) => setSignIn({ open: true, note, tone: "info" }), []);
  const closeSignIn = useCallback(() => setSignIn({ open: false, note: null, tone: "info" }), []);

  // All four are counted across every function. The first comes with the preview answer; if that
  // can't be had (null), the companies on file stand in, named as what they are.
  const figures: [number | undefined, string][] = [
    totals === null ? [s?.companies, "companies on file"] : [totals?.anyHire, "companies have hired a fractional"],
    [s?.engagements, "seats on file"],
    [s?.openRoles, s?.openRoles === 1 ? "open role now" : "open roles now"],
    [totals?.functions ?? COVERED.length, "functions covered"],
  ];

  const supportHref = support ? mailto(support, "Merlin question") : null;

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="#top" className="lp-nav-brand" aria-label="Merlin by Revenue Nomad">
            <Brand kind="lockup" dark size={54} />
          </a>
          <nav className="lp-nav-links" aria-label="Sections">
            <a href="#find">Explore</a>
            <a href="#features">What you can do</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className="lp-nav-cta">
            <button type="button" className="lp-nav-signin" onClick={() => openSignIn()}>
              Sign in
            </button>
            <button type="button" className={`btn num lp-nav-get${formInView || findIn ? "" : " btn-primary"}`} onClick={toJoin}>
              Get {starter} credits
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ---------- hero ---------- */}
        <section className="lp-hero">
          <Corner c="bl" t="pine2" className="lp-hero-hill" />
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              {accountNote ? (
                <Callout tone="sand" role="status" className="lp-account-note">
                  {accountNote}
                </Callout>
              ) : null}
              {opened > 0 ? (
                <p className="lp-live">
                  <span className="live-dot live-dot-lg" aria-hidden />
                  <span>
                    <Num>{fmt(opened)}</Num> new fractional {opened === 1 ? "role" : "roles"} this week
                  </span>
                </p>
              ) : s && s.openRoles > 0 ? (
                <p className="lp-live">
                  <span className="live-dot live-dot-lg" aria-hidden />
                  <span>
                    <Num>{fmt(s.openRoles)}</Num> open fractional {s.openRoles === 1 ? "role" : "roles"} right now
                  </span>
                </p>
              ) : (
                <p className="lp-live lp-live-quiet">The data exchange for fractional operators</p>
              )}
              <h1 className="lp-h1">
                Find your next fractional client and <em>the way in</em>
              </h1>
              <p className="lp-hero-sub">See which companies hire fractionals, what they pay and who held the seat before you.</p>
              {inviter ? (
                <div className="lp-invited">
                  <p>
                    {inviter} invited you. Add one fact to a company on Merlin and you both get <span className="num">{REFERRAL_BONUS}</span> credits.
                  </p>
                  <p className="lp-invited-small">The bonus doesn&apos;t apply when you join from the same internet connection as {inviter}.</p>
                </div>
              ) : null}
              <div className="lp-hero-form" ref={heroForm}>
                <JoinForm emailOn={emailOn} starter={starter} onSignedIn={onSignedIn} onMember={openSignIn} place="hero" />
              </div>
              <p className="lp-hero-free num">
                Free plan, {starter} credits to start. {TRIAL_LABEL}, no card.
              </p>
              <p className="lp-hero-member">
                Already a member?{" "}
                <button type="button" className="lp-linkbtn" onClick={() => openSignIn()}>
                  Sign in
                </button>
              </p>
              <p className="lp-hero-by">Built by Revenue Nomad, the network of {NETWORK} fractionals.</p>
            </div>
            {/* The record sits in a mint doorway: the arch and the Nomad above it, the door's body behind it. */}
            <div className="lp-hero-visual">
              <HeroEdge className="lp-hero-edge" />
              <HeroDome className="lp-hero-dome" />
              <HeroTrail className="lp-hero-trail" />
              <Corner c="tl" t="pine2" className="lp-hero-ql" />
              <Corner c="tr" t="ember" className="lp-hero-qr" />
              <HeroStage className="lp-hero-stage lp-hero-stage-wide" />
              <HeroStagePhone className="lp-hero-stage lp-hero-stage-phone" />
              <div className="lp-hero-door">
                <HeroRecord example={example} intro={!!intro} onJoin={toJoin} />
              </div>
            </div>
          </div>
        </section>

        {/* ---------- what are you looking for: the visitor's function and a question, real numbers ---------- */}
        <Finder onJoin={toJoin} primary={!formInView} ctaRef={findCta} onExample={setExample} onTotals={setTotals} />

        {/* ---------- the numbers, across every function ---------- */}
        <section className="lp-stats" aria-labelledby="stats-h" aria-busy={!s}>
          <div className="lp-wrap">
            <div className="lp-stats-band">
              <h2 className="sr-only" id="stats-h">
                Merlin in numbers
              </h2>
              <dl className="lp-stats-grid">
                {figures.map(([n, label]) => (
                  <div key={label} className="lp-stat">
                    <dt>{label}</dt>
                    <dd>
                      <Count n={n} />
                    </dd>
                  </div>
                ))}
              </dl>
              <ul className="lp-stats-fns" aria-label="Functions covered">
                {COVERED.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="lp-stats-note">
                Counted across every function. It starts from fractional work members published on Revenue Nomad, member success stories and a weekly
                check for open roles. Members add the rest.
              </p>
              <Band id="fx-band-stats" off={200} className="lp-stats-tex" />
            </div>
          </div>
        </section>

        {/* ---------- what members say: nothing until quotes.ts has a real one ---------- */}
        <Quotes />

        {/* ---------- what you can do: four panels ---------- */}
        <Features onJoin={toJoin} starter={starter} />

        {/* ---------- how it works: credits, with the free and locked fields folded away ---------- */}
        <section className="lp-sec lp-how" id="how" aria-labelledby="how-h">
          <div className="lp-wrap">
            <div className="lp-sec-head lp-sec-head-c">
              <span className="lp-pill lp-pill-pine">How it works</span>
              <h2 className="lp-h2" id="how-h">
                Share what you know, see what others know
              </h2>
              <p className="lp-lead">
                You start with <span className="num">{starter}</span> credits. Add a fact and you earn one. Spend one to see a fact another member added.
              </p>
            </div>
            <ul className="lp-steps">
              <li className="lp-step">
                <DemoAdd />
                <div className="lp-step-body">
                  <h3>Add what you know</h3>
                  <p>
                    A seat you held, or something missing on a company. Each one earns a credit, up to <span className="num">{EARN_CAP}</span> a day.
                  </p>
                </div>
              </li>
              <li className="lp-step">
                <DemoUnlock />
                <div className="lp-step-body">
                  <h3>Spend a credit to see one</h3>
                  <p>One credit opens one answer, like a hiring exec's name and title. It stays open for you. Fellow fractionals are free to see.</p>
                </div>
              </li>
              <li className="lp-step">
                <DemoConfirm />
                <div className="lp-step-body">
                  <h3>Confirm or report</h3>
                  <p>Confirm what is right. Report what is wrong and we review it. If we remove something you unlocked, your credit comes back.</p>
                </div>
              </li>
            </ul>
            <p className="lp-invite">
              <span className="lp-plus num">+{REFERRAL_BONUS}</span>
              <span>
                Invite a fractional you trust. You each get <span className="num">{REFERRAL_BONUS}</span> credits when they add their first fact to a company
                or a seat.
              </span>
            </p>

            <details className="lp-free" id="free">
              <summary>
                <span>What&apos;s free and what costs a credit</span>
                <span className="lp-qa-icon" aria-hidden />
              </summary>
              <div className="lp-free-in">
                <p className="lp-free-lead">Everything on a seat you held is free to you, and so are the rate benchmarks.</p>
                <div className="lp-matrix" role="table" aria-label="Free and locked fields">
                  <div className="lp-mx-head" role="row">
                    <span role="columnheader" className="sr-only">
                      Record
                    </span>
                    <span role="columnheader" className="lp-mx-col">
                      Free to see
                    </span>
                    <span role="columnheader" className="lp-mx-col">
                      <IconLock size={13} /> <span className="num">1 credit each</span>
                    </span>
                  </div>
                  {MATRIX.map((row) => (
                    <div key={row.entity} className="lp-mx-row" role="row">
                      <h3 role="rowheader">{row.label}</h3>
                      <div role="cell" className="lp-mx-cell">
                        <span className="lp-mx-label">Free to see</span>
                        <ul className="lp-chiprow">
                          {row.free.map((x) => (
                            <li key={x} className="chip">
                              {x}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div role="cell" className="lp-mx-cell">
                        <span className="lp-mx-label">
                          <span className="num">{row.price ?? (row.locked.length ? "1 credit each" : "1 credit")}</span>
                        </span>
                        {row.locked.length ? (
                          <ul className="lp-chiprow">
                            {row.locked.map((x) => (
                              <li key={x} className="chip lp-chip-locked">
                                <IconLock size={11} />
                                {x}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {row.note ? <p className="lp-mx-note">{row.note}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </section>

        {/* ---------- pricing: Free against Pro, framed by return ---------- */}
        <Pricing starter={starter} onJoin={toJoin} />

        {/* ---------- FAQ ---------- */}
        <section className="lp-sec lp-faq-sec" id="faq" aria-labelledby="faq-h">
          <div className="lp-wrap lp-faq-wrap">
            <h2 className="lp-h2" id="faq-h">
              Questions
            </h2>
            <Questions starter={starter} support={support} intro={!!intro} first={FAQ_FIRST} />
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section className="lp-final" aria-labelledby="final-h">
          <div className="lp-wrap">
            <div className="lp-final-in">
              <h2 className="lp-h2" id="final-h">
                Find the companies that hire <em>your function</em>
              </h2>
              <p className="lp-final-sub num">
                Free plan, {starter} credits to start. {TRIAL_LABEL}, no card.
              </p>
              <div className="lp-final-form" ref={finalForm}>
                <JoinForm emailOn={emailOn} starter={starter} onSignedIn={onSignedIn} onMember={openSignIn} place="final" />
              </div>
              <FinalScene className="lp-final-art" />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div className="lp-foot-brand">
            <Brand kind="lockup" size={64} lazy />
            <span>Merlin is a data exchange for fractional operators, built by Revenue Nomad, the network of {NETWORK} fractionals.</span>
          </div>
          <div className="lp-foot-links">
            {support && supportHref ? (
              <a className="mono" href={supportHref}>
                {support}
              </a>
            ) : null}
            <a className="mono" href="https://revenuenomad.com" target="_blank" rel="noopener noreferrer">
              revenuenomad.com
            </a>
            <a className="lp-tap" href="/remove">Remove my name</a>
            <a href="/data">Where your data goes</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <button type="button" className="lp-linkbtn lp-linkbtn-ink" onClick={() => openSignIn()}>
              Sign in
            </button>
          </div>
        </div>
      </footer>

      <SignIn
        open={signIn.open}
        note={signIn.note}
        noteTone={signIn.tone}
        support={support}
        onClose={closeSignIn}
        emailOn={emailOn}
        starter={starter}
        onSignedIn={onSignedIn}
        onJoin={toJoin}
      />
    </div>
  );
}
