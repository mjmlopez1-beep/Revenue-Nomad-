"use client";

/**
 * What Merlin does, by the job it does for a fractional: four panels, each a small label (the
 * job), a headline with one phrase picked out, a sentence or two, and a picture of that part of the
 * product drawn in HTML and CSS (no image files), with the panel's prop from the illustration system
 * standing on it (scenes.tsx). Find the next client (mint, the ball: Crystal Ball, Hiring now,
 * Lookalikes), get in the door (sand, the trail: your way in and who you know), price it (mint
 * soft, the seat: rate benchmarks and What should I charge), let it run (pine, the door: alerts,
 * and workflows when they are on). Under them, "Everything in Merlin": every use case in a line,
 * grouped by the same jobs plus winning the client, with Close and Beta marked where they apply.
 *
 * What is switchable (Workflows behind RN_WORKFLOWS, Google behind RN_GOOGLE) is named only when
 * the server says it is on (View.live). Nothing here promises an export: members can't export.
 *
 * Nothing here reads from the table, so nothing real can show: the companies and people in the
 * pictures are invented (.example addresses, names like "Alex Sample"), and the pictures carry
 * no label saying so. For that reason the rates picture shows no amount at all: every figure is
 * drawn the way the app draws a locked one, so no invented number can pass for Merlin's. The
 * functions vary from picture to picture (RevOps, People, Marketing, Customer Success, Finance,
 * Sales, Technology, Product), because Merlin covers every fractional function.
 */
import type { ReactNode } from "react";
import { IconLock, monoTint } from "../ui/shared";
import { Locked } from "./Visuals";
import { Corner, FeatBall, FeatDoor, FeatRates, FeatTrail, Sun } from "./scenes";

/** A made-up company's tile: two letters on a brand tint, as the app draws a company with no logo. */
function Tile({ letters }: { letters: string; hue?: number }) {
  return (
    <span className="lp-v-tile" style={monoTint(letters)}>
      {letters}
    </span>
  );
}

/* ---------- Crystal Ball: who is likely to hire next, and why now ---------- */

const BALL = [
  { co: "Paper Kite Labs", site: "paperkite.example", letters: "PK", hue: 205, what: "Hired a fractional CRO", band: "High", why: "2 months ago · RevOps usually follows" },
  { co: "Moonbeam Freight", site: "moonbeam.example", letters: "MF", hue: 265, what: "Raised a new round", band: "High", why: "Last month · a People leader often comes next" },
  { co: "Tin Robot Health", site: "tinrobot.example", letters: "TR", hue: 20, what: "Marketing leader left", band: "Medium", why: "3 weeks ago · an interim CMO can bridge the gap" },
];

function BallVisual() {
  return (
    <div className="lp-v lp-v-ball" aria-hidden>
      <div className="lp-v-top">
        <span className="lp-v-h">Crystal Ball</span>
        <span className="lp-v-quiet">Most likely first</span>
      </div>
      {BALL.map((r) => (
        <div key={r.co} className="lp-v-row">
          <Tile letters={r.letters} hue={r.hue} />
          <div className="lp-v-main">
            <span className="lp-v-name">{r.co}</span>
            <span className="lp-v-line">{r.what}</span>
            <span className="lp-v-note">
              <span className={`lp-v-band lp-v-band-${r.band.toLowerCase()}`}>{r.band}</span>
              <span>{r.why}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Warm paths: a record's "Your way in" ---------- */

function WayInVisual() {
  return (
    <div className="lp-v lp-v-way" aria-hidden>
      <div className="lp-v-cohead">
        <Tile letters="BH" hue={160} />
        <div className="lp-v-main">
          <span className="lp-v-name">Blue Heron Payments</span>
          <span className="lp-v-quiet mono">blueheron.example</span>
        </div>
      </div>
      <div className="lp-v-sec">
        <span className="lp-v-h">Your way in</span>
        <div className="lp-v-way-row">
          <div className="lp-v-main">
            <span className="lp-v-line">Fractional VP Customer Success · Mar 2025</span>
            <span className="lp-v-who">
              Alex Sample <span className="lp-v-tag">On Merlin</span>
            </span>
          </div>
          <span className="lp-v-btn lp-v-btn-pine">Message</span>
        </div>
        <div className="lp-v-way-row">
          <div className="lp-v-main">
            <span className="lp-v-line">Interim CFO · Jun 2023</span>
            <span className="lp-v-who">
              Jordan Example <span className="lp-v-quiet">Not on Merlin yet</span>
            </span>
          </div>
          <span className="lp-v-btn">Invite to connect</span>
        </div>
        <div className="lp-v-way-row">
          <div className="lp-v-main">
            <span className="lp-v-line">In your contacts · Started here in May</span>
            <span className="lp-v-who">
              Riley Example <span className="lp-v-tag">You know them</span>
            </span>
          </div>
          <span className="lp-v-btn">Draft a note</span>
        </div>
        <div className="lp-v-way-row">
          <div className="lp-v-main">
            <span className="lp-v-line">Hired them · CEO</span>
            <span className="lp-v-who lp-v-quiet">Decision maker</span>
          </div>
          <span className="lp-v-unlock">
            <IconLock size={12} />
            Unlock <span className="num">· 1 credit</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Rates: a range bar per function, every amount locked. No figure is ever drawn here. ---------- */

const RATES = [
  { fn: "Sales", from: 22, to: 68, mid: 44 },
  { fn: "Finance", from: 14, to: 56, mid: 34 },
  { fn: "Technology", from: 34, to: 84, mid: 58 },
];

function RatesVisual() {
  return (
    <div className="lp-v lp-v-rates" aria-hidden>
      <div className="lp-v-top">
        <span className="lp-v-h">Rate benchmarks</span>
        <span className="lp-v-quiet">Median and range</span>
      </div>
      <div className="lp-v-seg">
        <span>Per month</span>
        <span className="is-off">Per hour</span>
        <span className="lp-v-seg-gap" />
        <span className="is-off">Client revenue: $5M–$20M</span>
      </div>
      {RATES.map((r) => (
        <div key={r.fn} className="lp-v-rate">
          <div className="lp-v-rate-top">
            <span className="lp-v-name">{r.fn}</span>
            <span className="lp-v-rate-med">
              <Locked w={56} />
              <span className="lp-v-quiet">median</span>
            </span>
          </div>
          <div className="lp-v-track">
            <span className="lp-v-range" style={{ left: `${r.from}%`, width: `${r.to - r.from}%` }} />
            <span className="lp-v-mid" style={{ left: `${r.mid}%` }} />
          </div>
          <div className="lp-v-rate-ends">
            <span style={{ left: `${r.from}%` }}>
              <Locked w={36} />
            </span>
            <span style={{ left: `${r.to}%` }}>
              <Locked w={36} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Alerts: a list's alert as it lands in Slack ---------- */

const ALERTS = [
  { co: "A SaaS company", what: "New open role: Fractional Head of Product", when: "Posted 2 days ago", facts: ["51–200 people", "$5M–$20M"] },
  { co: "A healthcare company", what: "Raised funding", when: "SEC filing, Nov 18", facts: ["201–500 people", "$20M–$50M"] },
];

function SlackVisual() {
  return (
    <div className="lp-v lp-v-slack" aria-hidden>
      <div className="lp-v-slack-head">
        <span className="lp-v-app">M</span>
        <span className="lp-v-name">Merlin</span>
        <span className="lp-v-apptag">APP</span>
        <span className="lp-v-quiet num">9:02 AM</span>
      </div>
      <div className="lp-v-slack-body">
        <span className="lp-v-slack-h num">2 changes on your list Healthcare and SaaS</span>
        {ALERTS.map((r) => (
          <div key={r.co} className="lp-v-slack-item">
            <span className="lp-v-name">{r.co}</span>
            <span className="lp-v-line">
              <span className="lp-v-dot" />
              {r.what} · <span className="num">{r.when}</span>
            </span>
            <span className="lp-v-facts num">
              {r.facts.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </span>
          </div>
        ))}
        <span className="lp-v-btn lp-v-btn-pine">Open in Merlin</span>
        <span className="lp-v-quiet">Merlin alerts. Change them in Alerts and workflows.</span>
      </div>
    </div>
  );
}

interface Feature {
  key: string;
  /** The panel's field: mint, sand, mint soft or pine. */
  tone: "mint" | "sand" | "soft" | "pine";
  /** The job the panel does, as its small label. */
  label: string;
  /** The headline in three parts: before, the phrase picked out, after. */
  head: [string, string, string];
  body: string;
  /** The panel's prop, standing on the picture. */
  art: ReactNode;
  /** One large shape in the panel's top corner. */
  corner: ReactNode;
  visual: ReactNode;
  /** What the picture shows, for anyone who can't see it. */
  alt: string;
}

/** Which switchable features are on (View.live, signed out). Left out: both off, so nothing switchable is named. */
export interface Live {
  workflows: boolean;
  google: boolean;
}
const OFF: Live = { workflows: false, google: false };

/** Where who you know comes from: the two files always, Google only when it is on. */
export const knownFrom = (live: Live) =>
  live.google ? "your connections file, a contacts file or Google" : "your connections file or a contacts file";

export function features(live: Live = OFF): Feature[] {
  return [
    {
      key: "ball",
      tone: "mint",
      label: "Find the next client",
      head: ["See who is likely to hire ", "your function next", ""],
      body: "Crystal Ball ranks companies High, Medium or Low on how likely they are to bring in a fractional in your function, and says why now. Hiring now lists the open fractional roles. Lookalikes finds more companies like your past clients.",
      art: <FeatBall />,
      corner: <Corner c="tr" t="ember" className="lp-feat-corner" />,
      visual: <BallVisual />,
      alt: "Crystal Ball: three companies, each with what happened there, a High or Medium likelihood and why now.",
    },
    {
      key: "way",
      tone: "sand",
      label: "Get in the door",
      head: ["Know ", "who held the seat", ", who decides and who you know there"],
      body: `A company's record leads with your way in: message the fractional who held the seat, see who hired them, and find warm paths through people you know. Bring in ${knownFrom(live)}. Each one is optional${live.google ? ", and Google stays private to you" : ""}.`,
      art: <FeatTrail />,
      corner: <Sun className="lp-feat-corner lp-feat-sun" />,
      visual: <WayInVisual />,
      alt: "A company's record with Your way in: two past seat holders with Message and Invite to connect, someone in your contacts who started there with Draft a note, and the CEO who hired them behind a 1 credit unlock.",
    },
    {
      key: "rates",
      tone: "soft",
      label: "Price it",
      head: ["Price your work on ", "what fractionals charge", ""],
      body: "Median monthly and hourly rates by function, shown only once enough people share one, and ranges by client size on Pro. What should I charge works out a price for a client and shows the working.",
      art: <FeatRates />,
      corner: <Corner c="tr" t="ember" className="lp-feat-corner" />,
      visual: <RatesVisual />,
      alt: "Rate benchmarks: a range bar and a median for three functions. Every amount is locked until you join.",
    },
    {
      key: "run",
      tone: "pine",
      label: "Let it run",
      head: ["Hear ", "the moment it changes", ", in Slack or email"],
      body: live.workflows
        ? "Put an alert on any list: a new open role, a company raised funding, a new leader, a seat ended. It comes by email, in Slack or in the bell. Workflows (Beta) take the next step for you, like finding who decides or drafting a note, and a note always waits as a draft."
        : "Put an alert on any list: a new open role, a company raised funding, a new leader, a seat ended. It comes by email, in Slack or in the bell. And each week we send you the new open roles in your function.",
      art: <FeatDoor />,
      corner: <Corner c="tl" t="ember" className="lp-feat-corner lp-feat-corner-l" />,
      visual: <SlackVisual />,
      alt: "A Merlin alert in Slack on a saved list: a new open role and a company that raised funding, each with the company's size, and a button to open it in Merlin.",
    },
  ];
}

/** One use case in "Everything in Merlin": its name, what it does in a line, and the plan or stage it needs, where it needs one. */
interface UseCase {
  name: string;
  line: string;
  tag?: "Close" | "Beta";
}
interface Job {
  key: string;
  h: string;
  items: UseCase[];
}

/**
 * Every use case, by the job it does. Plain facts only: what is Close's (proposals, contracts,
 * Evidence Bank) says so, Workflows say Beta and show only when on, Google only when on.
 */
export function jobs(live: Live = OFF): Job[] {
  return [
    {
      key: "find",
      h: "Find the next client",
      items: [
        { name: "Find", line: "Search every company, seat and person, and save what you find as a list" },
        { name: "Companies, People and Seats", line: "The tables, led by the companies that fit your ideal client" },
        { name: "Crystal Ball", line: "Companies likely to hire your function next: High, Medium or Low, and why now" },
        { name: "Hiring now", line: "Open fractional, interim and contract roles" },
        { name: "Lookalikes", line: "More companies like your past clients, built from your seats" },
      ],
    },
    {
      key: "in",
      h: "Get in the door",
      items: [
        { name: "Your way in", line: "Who held the seat, and who decides there" },
        { name: "Warm paths", line: `Through people you know, from ${knownFrom(live)}. Each is optional${live.google ? ", and Google stays private to you" : ""}` },
        { name: "Someone you know changed jobs", line: "Hear when a person you know starts as a leader at another company" },
        { name: "Messages", line: "Talk with fellow fractionals inside Merlin" },
        { name: "Fractionals", line: "The directory, and referral partners who serve your kind of clients" },
      ],
    },
    {
      key: "price",
      h: "Price it",
      items: [
        { name: "Rate benchmarks", line: "What the work pays, by function and, on Pro, by client size" },
        { name: "What should I charge", line: "A price for a client, with the working shown" },
      ],
    },
    {
      key: "win",
      h: "Win and close it",
      items: [
        { name: "Pipeline", line: "Every company you are working on, step by step" },
        { name: "Proposals", line: "Drafted from your call, sent and signed", tag: "Close" },
        { name: "Contracts", line: "Your own contracts with e-signature", tag: "Close" },
        { name: "Evidence Bank", line: "Your past results, matched to a proposal", tag: "Close" },
      ],
    },
    {
      key: "run",
      h: "Let it run",
      items: [
        { name: "Alerts", line: "On any list or a company you follow, by email, Slack or the bell" },
        ...(live.workflows ? [{ name: "Workflows", line: "When this happens, then do this. A note is always a draft", tag: "Beta" as const }] : []),
        { name: "Agent access", line: "Use Merlin from your own AI assistant, such as Claude, with a switch for what it may do and a spend limit if you want one" },
      ],
    },
  ];
}

export default function Features({ onJoin, starter, live = OFF }: { onJoin: () => void; starter: number; live?: Live }) {
  return (
    <section className="lp-sec lp-feats" id="features" aria-labelledby="feats-h">
      <div className="lp-wrap">
        <div className="lp-sec-head lp-sec-head-c">
          <h2 className="lp-h2" id="feats-h">
            What you can do with Merlin
          </h2>
          <p className="lp-lead">Find the client, get in, price it, win it. It works the same way in every fractional function.</p>
        </div>
        <div className="lp-feat-list">
          {features(live).map((f) => (
            <article key={f.key} className={`lp-feat lp-feat-${f.tone}`} aria-labelledby={`feat-${f.key}`}>
              {f.corner}
              <div className="lp-feat-copy">
                <span className="lp-pill">{f.label}</span>
                <h3 className="lp-feat-h" id={`feat-${f.key}`}>
                  {f.head[0]}
                  <em>{f.head[1]}</em>
                  {f.head[2]}
                </h3>
                <p className="lp-feat-p">{f.body}</p>
                <button type="button" className="lp-feat-cta num" onClick={onJoin}>
                  Try it with {starter} free credits <span aria-hidden>→</span>
                </button>
              </div>
              <div className="lp-feat-fig">
                <div className="lp-feat-stage">{f.art}</div>
                <div role="img" aria-label={f.alt}>
                  {f.visual}
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="lp-all" id="everything" aria-labelledby="all-h">
          <h3 className="lp-all-h" id="all-h">
            Everything in Merlin
          </h3>
          <div className="lp-all-jobs">
            {jobs(live).map((j) => (
              <section key={j.key} className="lp-all-job" aria-labelledby={`all-${j.key}`}>
                <h4 className="lp-all-job-h" id={`all-${j.key}`}>
                  {j.h}
                </h4>
                <ul className="lp-all-list">
                  {j.items.map((x) => (
                    <li key={x.name}>
                      <span className="lp-all-name">
                        {x.name}
                        {x.tag ? <span className={`lp-all-tag lp-all-tag-${x.tag.toLowerCase()}`}>{x.tag}</span> : null}
                      </span>
                      <span className="lp-all-line">{x.line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
