"use client";

/**
 * Merlin landing page (signed out). In order: the warm intro and what it costs (hero, with
 * the join form), "Try it" with the visitor's own function (real counts and sample rows from
 * GET /api/table?preview=1), the numbers, what you can do with it (a tabbed showcase of real
 * screenshots, Showcase.tsx), how it works (credits, with the free and locked fields folded
 * away), questions, and the join form again. The hero's record is a real company from the same
 * preview answer. Nothing on the page is blurred.
 * One display heading. One volt button in view at a time: the join form's when a form is on
 * screen, Try it's button when only that is, the nav's when none is.
 *
 * It renders before the view arrives (`view` null): everything but the counts is fixed copy,
 * so the page is up at once and the counts fill in when the view lands.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./landing.css";
import { Brand, IconLock, Num, type View } from "../ui/shared";
import { EARN_CAP, GROUPS, REFERRAL_BONUS, type Entity } from "@/lib/tableFields";
import JoinForm from "./JoinForm";
import SignIn from "./SignIn";
import { Questions } from "./Questions";
import { contactOf, mailto, signInFailText } from "./contact";
import { DemoAdd, DemoConfirm, DemoUnlock, HeroRecord } from "./Visuals";
import TryIt, { type PreviewExample } from "./TryIt";
import Showcase from "./Showcase";

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

/**
 * Free and locked fields, read from the field definitions so this page can't drift from what
 * the table does. `more` adds what is not a field: the dates on an open role (free) and the
 * one unlock that reveals a hidden company.
 */
const MATRIX: { entity: Entity; label: string; free: string[]; locked: string[]; note?: string }[] = (
  [
    {
      entity: "company",
      label: "The company",
      freeFirst: ["Name"],
      note: "While a company has an open role, its name, website and LinkedIn are locked. One credit shows the company and its job posting, and the posted rate when there is one. When the role closes, everyone sees the company again. Try it on this page names a few hiring companies as a sample.",
    },
    {
      entity: "engagement",
      label: "The seat",
      freeLast: ["Title of an open role", "Open and closed dates"],
      note: "An open role's title is free while it is open. The role on a past seat costs 1 credit.",
    },
    { entity: "contact", label: "A hiring contact" },
  ] as { entity: Entity; label: string; freeFirst?: string[]; freeLast?: string[]; note?: string }[]
).map((row) => {
  const fields = (GROUPS.find((g) => g.entity === row.entity)?.fields ?? []).filter((f) => !f.identity && !f.system);
  return {
    entity: row.entity,
    label: row.label,
    free: [...(row.freeFirst ?? []), ...fields.filter((f) => !f.gated).map((f) => f.label), ...(row.freeLast ?? [])],
    // An open role's title is free (above), so the locked one is a past seat's.
    locked: fields.filter((f) => f.gated).map((f) => (row.entity === "engagement" && f.key === "role" ? "Role of a past seat" : f.label)),
    note: row.note,
  };
});

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
  const tryCta = useRef<HTMLDivElement>(null);
  /** The hero's real example record: undefined until Try it's first answer lands. */
  const [example, setExample] = useState<PreviewExample | null | undefined>(undefined);
  const [heroIn, finalIn, tryIn] = useInView(heroForm, finalForm, tryCta);
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

  const proof: [number | undefined, string][] = [
    [s?.companies, "companies"],
    [s?.engagements, "seats on file"],
    [s?.people, "hiring contacts"],
    [s?.members, "members"],
  ];

  const joinHint = "Add something you know and you earn a credit. Spend a credit to see something another member added, like who held a seat.";
  const supportHref = support ? mailto(support, "Merlin question") : null;

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="#top" className="lp-nav-brand" aria-label="Merlin by Revenue Nomad">
            <Brand kind="lockup" dark size={54} />
          </a>
          <nav className="lp-nav-links" aria-label="Sections">
            <a href="#try">Try it</a>
            <a href="#uses">What you can do</a>
            <a href="#how">How it works</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className="lp-nav-cta">
            <button type="button" className="lp-nav-signin" onClick={() => openSignIn()}>
              Sign in
            </button>
            <button type="button" className={`btn num lp-nav-get${formInView || tryIn ? "" : " btn-primary"}`} onClick={toJoin}>
              Get {starter} credits
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ---------- hero ---------- */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
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
                <p className="lp-live lp-live-quiet">A free pilot from Revenue Nomad</p>
              )}
              <h1 className="lp-h1">Find your next client and the fractional who can introduce you</h1>
              <p className="lp-hero-sub">
                See which companies hire fractionals for your function and who held the seat before you. Ask them for a warm intro and hear how the
                engagement went before your first call.
              </p>
              {inviter ? (
                <div className="lp-invited">
                  <p>
                    {inviter} invited you. Add one fact to a company or a seat and you both get <span className="num">{REFERRAL_BONUS}</span> credits.
                  </p>
                  <p className="lp-invited-small">The bonus doesn&apos;t apply when you join from the same internet connection as {inviter}.</p>
                </div>
              ) : null}
              <p className="lp-hero-free num">Free pilot. {starter} credits to start.</p>
              <div className="lp-hero-form" ref={heroForm}>
                <JoinForm emailOn={emailOn} starter={starter} onSignedIn={onSignedIn} onMember={openSignIn} place="hero" hint={joinHint} />
              </div>
              <p className="lp-hero-member">
                Already a member?{" "}
                <button type="button" className="lp-linkbtn" onClick={() => openSignIn()}>
                  Sign in
                </button>
              </p>
              <p className="lp-hero-by">Built by Revenue Nomad, the network of {NETWORK} fractionals.</p>
            </div>
            <div className="lp-hero-visual">
              <HeroRecord example={example} intro={!!intro} onJoin={toJoin} />
            </div>
          </div>
        </section>

        {/* ---------- try it: the visitor's own function, real numbers ---------- */}
        <TryIt onJoin={toJoin} primary={!formInView} ctaRef={tryCta} onExample={setExample} />

        {/* ---------- proof ---------- */}
        <section className="lp-proof" aria-label="Merlin in numbers" aria-busy={!s}>
          <div className="lp-wrap">
            <dl className="lp-proof-grid">
              {proof.map(([n, label]) => (
                <div key={label} className="lp-proof-item">
                  <dt className="lp-proof-label">{label}</dt>
                  <dd className="lp-proof-num">
                    <Count n={n} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="lp-proof-note">
              It starts from fractional work members published on Revenue Nomad, member success stories and a weekly check for open roles. Members add the rest.
            </p>
          </div>
        </section>

        {/* ---------- what you can do ---------- */}
        <section className="lp-sec lp-sec-tint" id="uses">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <h2 className="lp-h2">What you can do with it</h2>
              <p className="lp-lead">Screens from the pilot as it works today.</p>
            </div>
            <Showcase intro={!!intro} />
          </div>
        </section>

        {/* ---------- how it works: credits, with the free and locked fields folded away ---------- */}
        <section className="lp-sec" id="how">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <h2 className="lp-h2">How it works</h2>
              <p className="lp-lead">
                You start with <span className="num">{starter}</span> credits. Add something you know and you earn a credit. Spend a credit to see
                something another member added.
              </p>
            </div>
            <ul className="lp-steps">
              <li className="lp-step">
                <DemoAdd />
                <div className="lp-step-body">
                  <h3>Add what you know</h3>
                  <p>
                    Add a seat you held, with its rate and hours a week, or something missing on a company, like its HQ or size. Each one earns a credit, up
                    to <span className="num">{EARN_CAP}</span> a day.
                  </p>
                </div>
              </li>
              <li className="lp-step">
                <DemoUnlock />
                <div className="lp-step-body">
                  <h3>Spend a credit to see one</h3>
                  <p>One credit shows one thing, like who held a seat or what it paid. It stays open for you.</p>
                </div>
              </li>
              <li className="lp-step">
                <DemoConfirm />
                <div className="lp-step-body">
                  <h3>Confirm or report</h3>
                  <p>Confirm what you know is right. Report what is wrong and we review it. If we remove something you unlocked, your credit comes back.</p>
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
                          <span className="num">{row.locked.length ? "1 credit each" : "1 credit"}</span>
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

        {/* ---------- FAQ ---------- */}
        <section className="lp-sec lp-sec-tint" id="faq">
          <div className="lp-wrap lp-faq-wrap">
            <h2 className="lp-h2">Questions</h2>
            <Questions starter={starter} support={support} intro={!!intro} />
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section className="lp-final">
          <div className="lp-wrap lp-final-in">
            <h2 className="lp-h2">Find the companies that hire your function</h2>
            <p className="lp-final-sub num">It takes your email. Free pilot. {starter} credits to start.</p>
            <div className="lp-final-form" ref={finalForm}>
              <JoinForm emailOn={emailOn} starter={starter} onSignedIn={onSignedIn} onMember={openSignIn} place="final" />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div className="lp-foot-brand">
            <Brand kind="lockup" size={64} />
            <span>Merlin is a free pilot from Revenue Nomad, the network of {NETWORK} fractionals.</span>
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
