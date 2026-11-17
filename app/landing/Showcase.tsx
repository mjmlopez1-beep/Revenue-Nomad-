"use client";

/**
 * "What you can do with it": one use case per tab, each a short heading, a line or two and a
 * screenshot of the real app (public/landing/*.webp, made by scripts/landing-shots.mjs from a
 * made-up member on the real table). The slides sit in a horizontal scroll-snap track, so a
 * phone swipes them and a tab click scrolls the track (never the page).
 *
 * It moves on by itself every 6 seconds while it is on screen, and stops for good once the
 * visitor picks a tab, swipes, or presses Pause. Hover and keyboard focus hold it. Nothing moves
 * under prefers-reduced-motion. Tabs follow the ARIA tabs pattern (arrow keys, Home, End).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconLock } from "../ui/shared";

export interface Slide {
  key: string;
  tab: string;
  title: string;
  body: string;
  cost: { label: string; kind: "free" | "locked" | "earn" };
  img: { src: string; w: number; h: number; alt: string };
}

/** The slides, with the copy that depends on whether we make intros. Image sizes are the files' own (2x). */
export function slides(intro: boolean): Slide[] {
  return [
    {
      key: "seat",
      tab: "Who held the seat",
      title: "The fractional who held the seat",
      body: `Open a company and see every seat on file. Unlock who held one for 1 credit, then message them inside Merlin${intro ? " or ask us for a warm intro" : ""}, and hear how it went before your first call.`,
      cost: { label: "1 credit", kind: "locked" },
      img: { src: "/landing/seat.webp", w: 1440, h: 900, alt: "A company's record in Merlin with its fractional seats, the seat holder behind a lock" },
    },
    {
      key: "hiring",
      tab: "Hiring now",
      title: "Open fractional roles, dated",
      body: "Fractional, interim and contract roles across functions. We check every week and date each one, so a new role stands apart from one that has sat for months. The title is free, and 1 credit shows the company with its job posting.",
      cost: { label: "1 credit shows the company", kind: "locked" },
      img: { src: "/landing/hiring.webp", w: 1440, h: 900, alt: "The Hiring now list in Merlin with open roles and the day each was posted" },
    },
    {
      key: "next",
      tab: "Repeat hirers",
      title: "Repeat hirers, and who hasn't hired your function yet",
      body: "Every company that hires fractionals, with the function and start of each seat. A company that hired a fractional CMO and a RevOps lead may need sales next, and one filter shows exactly those.",
      cost: { label: "Free", kind: "free" },
      img: { src: "/landing/next.webp", w: 1440, h: 900, alt: "The companies table filtered to repeat hirers with no fractional in the member's function yet" },
    },
    {
      key: "ifp",
      tab: "Ideal Fractional Profile",
      title: "Your Ideal Fractional Profile and best fit",
      body: "Your Ideal Fractional Profile is the companies you want as clients, by industry, size, revenue and country. The table leads with the companies that fit it, and Best fit for you puts the likeliest first.",
      cost: { label: "Free", kind: "free" },
      img: { src: "/landing/ifp.webp", w: 1440, h: 900, alt: "The table led by the member's Ideal Fractional Profile and sorted by Best fit for you" },
    },
    {
      key: "rates",
      tab: "Rate benchmarks",
      title: "What the seat pays",
      body: "Median monthly and hourly rates by function and client revenue, from Revenue Nomad's Rate Index and the rates members share. A number shows only once enough people are in it.",
      cost: { label: "Free", kind: "free" },
      img: { src: "/landing/rates.webp", w: 1440, h: 900, alt: "Rate benchmarks in Merlin: median monthly and hourly rates by function and client revenue" },
    },
    {
      key: "connect",
      tab: "Slack and Claude",
      title: "Alerts in Slack, and Merlin in Claude",
      body: "Get a post in Slack, or any tool by webhook, when a new open role fits you, when someone writes to you or when someone unlocks your seat. Connect Claude and ask which companies fit you best.",
      cost: { label: "Free", kind: "free" },
      img: { src: "/landing/connect.webp", w: 1440, h: 900, alt: "The Integrations page in Merlin with Slack alerts and the Claude connector" },
    },
    {
      key: "views",
      tab: "Saved views",
      title: "Saved views and the weekly email",
      body: "Save a search as a view and open it again in one tap. Each week we email you the new open roles that match it.",
      cost: { label: "Free", kind: "free" },
      img: { src: "/landing/views.webp", w: 1440, h: 900, alt: "Saving a view in Merlin with the weekly email switched on" },
    },
    {
      key: "earn",
      tab: "Earn credits",
      title: "Your seats, and credits for what you know",
      body: "Claim the seats you held and everything on them is free to you. Add a fact that is missing on any company, like its HQ or size, and you earn a credit.",
      cost: { label: "Earns credits", kind: "earn" },
      img: { src: "/landing/earn.webp", w: 1440, h: 900, alt: "A company's record with missing facts a member can add for a credit each" },
    },
  ];
}

/** Every feature without a slide of its own, so the section still names them all. */
export const MORE_FEATURES = [
  "Search companies, seats and people, including what a company does",
  "Hiring contacts, with titles free and a name, LinkedIn, email or phone for 1 credit each",
  "Messages with other members",
  "Follow a company",
  "Invite a fractional you trust",
];

const ADVANCE_MS = 6000;

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function Showcase({ intro }: { intro: boolean }) {
  const list = slides(intro);
  const [at, setAt] = useState(0);
  /** The visitor took over (a tab, a swipe, Pause): nothing moves by itself again. */
  const [stopped, setStopped] = useState(false);
  /** Hover or focus inside, or the section off screen: hold for now. */
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(true);
  const track = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  /** Set while the track scrolls because of us, so the scroll isn't read as a swipe. */
  const auto = useRef(false);

  useEffect(() => setStill(reducedMotion()), []);

  // Only move while the section is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /** Show slide `n`: scroll the track to it (never the page) and keep its tab in view. */
  const go = useCallback(
    (n: number, smooth = true) => {
      const t = track.current;
      const slide = t?.children[n] as HTMLElement | undefined;
      if (!t || !slide) return;
      auto.current = true;
      t.scrollTo({ left: slide.offsetLeft - t.offsetLeft, behavior: smooth && !still ? "smooth" : "auto" });
      const tab = tabs.current[n];
      const bar = tab?.parentElement;
      if (tab && bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: tab.offsetLeft - bar.clientWidth / 2 + tab.offsetWidth / 2, behavior: smooth && !still ? "smooth" : "auto" });
      setAt(n);
      window.setTimeout(() => (auto.current = false), 700);
    },
    [still],
  );

  // Move on by itself.
  const running = !stopped && !held && visible && !still;
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => go((at + 1) % list.length), ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [running, at, go, list.length]);

  // A swipe or a scroll of the track picks the slide nearest its left edge.
  const onScroll = () => {
    const t = track.current;
    if (!t) return;
    const n = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
    if (auto.current) return;
    if (n !== at && n >= 0 && n < list.length) {
      setAt(n);
      setStopped(true);
    }
  };

  const pick = (n: number) => {
    setStopped(true);
    go(n);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = list.length - 1;
    const n = e.key === "ArrowRight" ? (at === last ? 0 : at + 1) : e.key === "ArrowLeft" ? (at === 0 ? last : at - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (n < 0) return;
    e.preventDefault();
    pick(n);
    tabs.current[n]?.focus();
  };

  return (
    <div
      className={`lp-show${running ? " is-running" : ""}`}
      ref={root}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHeld(false)}
    >
      <div className="lp-show-bar">
        <div className="lp-show-tabs" role="tablist" aria-label="What you can do">
          {list.map((s, n) => (
            <button
              key={s.key}
              ref={(el) => {
                tabs.current[n] = el;
              }}
              type="button"
              role="tab"
              id={`show-tab-${s.key}`}
              aria-selected={n === at}
              aria-controls={`show-panel-${s.key}`}
              tabIndex={n === at ? 0 : -1}
              className={`lp-show-tab${n === at ? " is-on" : ""}`}
              onClick={() => pick(n)}
              onKeyDown={onKey}
            >
              {s.tab}
              {n === at ? <span className="lp-show-tick" aria-hidden key={`${at}-${running}`} /> : null}
            </button>
          ))}
        </div>
        {!still && !stopped ? (
          <button type="button" className="lp-show-pause" onClick={() => setStopped(true)}>
            Pause
          </button>
        ) : null}
      </div>

      <div className="lp-show-track" ref={track} onScroll={onScroll}>
        {list.map((s, n) => (
          <section
            key={s.key}
            className="lp-show-slide"
            role="tabpanel"
            id={`show-panel-${s.key}`}
            aria-labelledby={`show-tab-${s.key}`}
            aria-hidden={n !== at}
            inert={n !== at ? true : undefined}
          >
            <div className="lp-show-copy">
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              {s.cost.kind === "locked" ? (
                <span className="chip lp-cost lp-cost-locked">
                  <IconLock size={12} />
                  <span className="num">{s.cost.label}</span>
                </span>
              ) : (
                <span className={`chip lp-cost${s.cost.kind === "earn" ? " lp-cost-earn" : ""}`}>{s.cost.label}</span>
              )}
            </div>
            <div className="lp-show-shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.img.src} width={s.img.w} height={s.img.h} alt={s.img.alt} loading="lazy" decoding="async" />
            </div>
          </section>
        ))}
      </div>

      <p className="lp-show-more">
        <span className="lp-show-more-k">Also in the pilot</span> {MORE_FEATURES.join(" · ")}
      </p>
    </div>
  );
}
