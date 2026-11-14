"use client";

/**
 * Trading Post landing page (signed out): what it is, what is free and what costs a
 * credit, the rules, and one join form (email, then name) in the hero and at the end.
 * The product visual is static HTML; there is no clickable table here.
 */
import { useCallback, useRef, useState } from "react";
import "./landing.css";
import { Brand, IconCheck, IconLock, type View } from "../ui/shared";
import { EARN_CAP, REFERRAL_BONUS } from "@/lib/tableFields";
import JoinForm from "./JoinForm";
import SignIn from "./SignIn";
import { HeroRecord, StepDemoAdd, StepDemoConfirm, StepDemoUnlock, UseAdjacent, UseFriendly, UseIntro } from "./Visuals";

export interface LandingProps {
  /** Signed-out view: only `stats` and `email` are filled; companies is empty. */
  view: View;
  /** Call after a successful join (no email provider) or sign-in, to load the signed-in view. */
  onSignedIn: () => Promise<void> | void;
}

/** Pilot starter balance (the server's RN_STARTER_CREDITS default). */
const STARTER = 50;

const fmt = (n: number) => n.toLocaleString("en-US");

const FREE = ["Company and website", "Size and revenue", "GTM functions hired", "Fit score", "People's titles"];
const LOCKED = ["Exact role", "Status", "Who held the seat", "Rate", "Hours per week", "Names and contact details"];

const FAQ: [string, string][] = [
  [
    "Where does the data come from?",
    "Revenue Nomad published engagements, member success stories and our own scans for open fractional roles. Members add the rest, one fact at a time.",
  ],
  [
    "Is my own engagement data shown?",
    "Anonymous engagements are never shown. Facts you add carry no name, and locked details stay locked until a member spends a credit on them.",
  ],
  [
    "What happens when a fact is wrong?",
    "Report it and it is hidden until we review it. If we remove it, the member who added it loses that credit and everyone who unlocked it gets theirs back.",
  ],
  [
    `Why can I only earn ${EARN_CAP} credits a day?`,
    "So the table fills with things people know, not guesses made for points. Add carefully, not quickly.",
  ],
  ["Does it cost anything?", `No. The pilot is free and you start with ${STARTER} credits. Unlocking only ever costs credits.`],
];

export default function Landing({ view, onSignedIn }: LandingProps) {
  const [signIn, setSignIn] = useState<{ open: boolean; note: string | null }>({ open: false, note: null });
  const heroForm = useRef<HTMLDivElement>(null);
  const finalForm = useRef<HTMLDivElement>(null);
  const s = view.stats;

  /** Take the visitor to the nearest join form and focus it (email, or name once the email is in). */
  const toJoin = useCallback(() => {
    setSignIn({ open: false, note: null });
    const mid = window.innerHeight / 2;
    const dist = (el: HTMLElement | null) => (el ? Math.abs(el.getBoundingClientRect().top + el.offsetHeight / 2 - mid) : Infinity);
    const target = dist(finalForm.current) < dist(heroForm.current) ? finalForm.current : heroForm.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => target?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 350);
  }, []);
  const openSignIn = useCallback((note: string | null = null) => setSignIn({ open: true, note }), []);
  const closeSignIn = useCallback(() => setSignIn({ open: false, note: null }), []);

  // Open roles are the strongest proof once there are enough of them; until then show fractional-friendly companies.
  const proof: [number, string][] = [
    [s.companies, "companies"],
    [s.engagements, "fractional engagements"],
    s.openRoles >= 10 ? [s.openRoles, "open roles"] : [s.fractionalFriendly, "fractional-friendly companies"],
    [s.members, "members"],
  ];

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="#top" className="lp-nav-brand" aria-label="Trading Post by Revenue Nomad">
            <Brand dark />
            <span className="lp-nav-product">Trading Post</span>
          </a>
          <nav className="lp-nav-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#why">Use cases</a>
            <a href="#rules">Rules</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-cta">
            <button type="button" className="lp-nav-signin" onClick={() => openSignIn()}>
              Sign in
            </button>
            <button type="button" className="btn btn-primary lp-nav-get" onClick={toJoin}>
              Get {STARTER} credits
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ---------- hero ---------- */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow mono">Trading Post by Revenue Nomad</p>
              <h1 className="lp-h1">See who hires fractionals, for which seat, at what rate</h1>
              <p className="lp-hero-sub">
                The shared record of fractional GTM work. Add what you know, unlock what you need.
              </p>
              <div className="lp-hero-form" ref={heroForm}>
                <JoinForm emailOn={view.email} onSignedIn={onSignedIn} onMember={openSignIn} place="hero" />
              </div>
              <p className="lp-hero-terms mono">
                {STARTER} credits to start · earn up to {EARN_CAP} a day · free pilot
              </p>
              <p className="lp-hero-member">
                Revenue Nomad member?{" "}
                <button type="button" className="lp-linkbtn" onClick={() => openSignIn()}>
                  Sign in with your link
                </button>
              </p>
            </div>
            <div className="lp-hero-visual">
              <HeroRecord />
            </div>
          </div>
        </section>

        {/* ---------- proof ---------- */}
        <section className="lp-proof" aria-label="Trading Post in numbers">
          <div className="lp-wrap">
            <dl className="lp-proof-grid">
              {proof.map(([n, label]) => (
                <div key={label} className="lp-proof-item">
                  <dt className="lp-proof-label">{label}</dt>
                  <dd className="lp-proof-num mono">{fmt(n)}</dd>
                </div>
              ))}
            </dl>
            <p className="lp-proof-note">Seeded from Revenue Nomad engagements and member stories. Members add the rest.</p>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section className="lp-sec lp-sec-tint" id="how">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <h2 className="lp-h2">Give what you know. Get what you need.</h2>
              <p className="lp-lead">One currency. Every fact earns or costs 1 credit.</p>
            </div>
            <ol className="lp-steps">
              <li className="lp-step">
                <StepDemoAdd />
                <div className="lp-step-body">
                  <span className="lp-step-n mono">01</span>
                  <h3>Add what you know, earn 1 credit</h3>
                  <p>Fill an empty fact on a company you worked with. It takes about 20 seconds.</p>
                </div>
              </li>
              <li className="lp-step">
                <StepDemoUnlock />
                <div className="lp-step-body">
                  <span className="lp-step-n mono">02</span>
                  <h3>Unlock what you need, 1 credit</h3>
                  <p>Spend a credit to see a locked fact someone else added. It stays unlocked for you.</p>
                </div>
              </li>
              <li className="lp-step">
                <StepDemoConfirm />
                <div className="lp-step-body">
                  <span className="lp-step-n mono">03</span>
                  <h3>Confirm and keep it accurate</h3>
                  <p>Confirm facts you know are right. Report the wrong ones and they come down, with credits refunded.</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* ---------- use cases ---------- */}
        <section className="lp-sec" id="why">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <h2 className="lp-h2">Why fractionals use it</h2>
              <p className="lp-lead">Three questions it answers before your next pitch.</p>
            </div>
            <div className="lp-uses">
              <article className="lp-use">
                <UseFriendly />
                <h3>Find fractional-friendly companies</h3>
                <p>See which companies hire fractionals, how often and for which seats. Each one gets a fit score.</p>
              </article>
              <article className="lp-use">
                <UseAdjacent />
                <h3>See who hired other GTM functions</h3>
                <p>A company that brought in a fractional CMO and RevOps lead may need sales next. Spot the gap and pitch it.</p>
              </article>
              <article className="lp-use">
                <UseIntro />
                <h3>Find a fractional for an intro or intel</h3>
                <p>Unlock who held the seat and ask for an intro, or the real story before your first call.</p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------- free vs locked ---------- */}
        <section className="lp-sec lp-sec-tint" id="free">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <h2 className="lp-h2">What is free and what you trade for</h2>
              <p className="lp-lead">The free view tells you if a company is worth a look. Credits get you the facts that win the work.</p>
            </div>
            <div className="lp-split">
              <div className="lp-col">
                <div className="lp-col-head">
                  <h3>Free to see</h3>
                  <span className="chip chip-volt">Free</span>
                </div>
                <ul className="lp-list">
                  {FREE.map((x) => (
                    <li key={x}>
                      <span className="lp-tick" aria-hidden>
                        <IconCheck size={13} />
                      </span>
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lp-col lp-col-locked">
                <div className="lp-col-head">
                  <h3>Trade for</h3>
                  <span className="lock">
                    <IconLock /> <span className="lock-cost">1</span> credit each
                  </span>
                </div>
                <ul className="lp-list">
                  {LOCKED.map((x) => (
                    <li key={x}>
                      <span className="lp-lockicon" aria-hidden>
                        <IconLock size={13} />
                      </span>
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- rules ---------- */}
        <section className="lp-sec" id="rules">
          <div className="lp-wrap">
            <div className="lp-rules">
              <div className="lp-rules-head">
                <h2 className="lp-h2">The rules in plain words</h2>
                <button type="button" className="btn btn-primary btn-lg" onClick={toJoin}>
                  Get {STARTER} credits
                </button>
              </div>
              <dl className="lp-rules-grid">
                <div>
                  <dt className="mono">{STARTER}</dt>
                  <dd>credits to start. The pilot is free.</dd>
                </div>
                <div>
                  <dt className="mono">{EARN_CAP}</dt>
                  <dd>most you can earn in a day. Each fact you add earns 1.</dd>
                </div>
                <div>
                  <dt className="mono">{REFERRAL_BONUS}</dt>
                  <dd>credits each for you and a fractional you invite, once they add a fact.</dd>
                </div>
                <div>
                  <dt className="mono">100%</dt>
                  <dd>back when a fact you unlocked is removed as wrong.</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="lp-sec lp-sec-tint" id="faq">
          <div className="lp-wrap lp-faq-wrap">
            <h2 className="lp-h2">Questions</h2>
            <div className="lp-faq">
              {FAQ.map(([q, a]) => (
                <details key={q} className="lp-qa">
                  <summary>
                    <span>{q}</span>
                    <span className="lp-qa-icon" aria-hidden />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section className="lp-final">
          <div className="lp-wrap lp-final-in">
            <h2 className="lp-h2">Add one thing you know. See what the rest of us know.</h2>
            <div className="lp-final-form" ref={finalForm}>
              <JoinForm emailOn={view.email} onSignedIn={onSignedIn} onMember={openSignIn} place="final" />
            </div>
            <p className="lp-hero-terms mono">Takes about 20 seconds to add your first fact</p>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div className="lp-foot-brand">
            <Brand />
            <span>Trading Post is a Revenue Nomad pilot.</span>
          </div>
          <div className="lp-foot-links">
            <a href="https://revenuenomad.com" target="_blank" rel="noopener noreferrer">
              revenuenomad.com
            </a>
            <button type="button" className="lp-linkbtn lp-linkbtn-ink" onClick={() => openSignIn()}>
              Sign in
            </button>
          </div>
        </div>
      </footer>

      <SignIn open={signIn.open} note={signIn.note} onClose={closeSignIn} emailOn={view.email} onSignedIn={onSignedIn} onJoin={toJoin} />
    </div>
  );
}
