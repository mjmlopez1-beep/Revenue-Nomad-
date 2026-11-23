"use client";

/**
 * What Merlin does, by the job it does for a fractional: five panels, each a small label (the
 * job), a headline with one phrase picked out, a sentence or two, and a picture of that part of the
 * product drawn in HTML and CSS (no image files), with the panel's prop from the illustration system
 * standing on it (scenes.tsx). Find the next client (mint, the ball: Crystal Ball, Hiring now,
 * Lookalikes), get in the door (sand, the trail: your way in and who you know), price it (mint
 * soft, the seat: rate benchmarks and What should I charge), close it (deep sand, the door with
 * the seat won: Pipeline, and on the Close plan proposals, e-signature and Evidence Bank), and
 * workflows (pine, the stairs: alerts, and workflows when they are on; while workflows are off
 * the panel is Alerts and says nothing of them). Agent access is named in the last panel, and
 * Messages, Fractionals and Lookalikes in the questions (faq.ts).
 *
 * What is switchable (Workflows behind RN_WORKFLOWS, Google behind RN_GOOGLE) is named only when
 * the server says it is on (View.live). Nothing here promises an export: members can't export.
 *
 * Nothing here reads from the table, so nothing real can show: the companies and people in the
 * pictures are invented (.example addresses, names like "Alex Sample"), and the pictures carry
 * no label saying so. For that reason the rates picture shows no amount at all: every figure is
 * drawn the way the app draws a locked one, so no invented number can pass for Merlin's. The
 * only numbers on the cards are counts, made-up dates and the app's own credit prices. The
 * functions vary from picture to picture (RevOps, People, Marketing, Customer Success, Finance,
 * Sales, Technology, Product), because Merlin covers every fractional function.
 */
import type { ReactNode } from "react";
import { IconCheck, IconLock, monoTint } from "../ui/shared";
import { COMPANY_PRICE_SAY } from "@/lib/tableFields";
import { Locked } from "./Visuals";
import { Corner, FeatBall, FeatClose, FeatFlow, FeatRates, FeatTrail, Sun } from "./scenes";

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

function SlackVisual({ workflows = false }: { workflows?: boolean }) {
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
        <span className="lp-v-quiet">Merlin alerts. Change them in {workflows ? "Alerts and workflows" : "Alerts"}.</span>
      </div>
    </div>
  );
}

/* ---------- Close it: a deal at Won, its proposal signed, and a result from the Evidence Bank ---------- */

const STAGES = ["To reach out", "Meeting", "Proposal", "Won"];

function CloseVisual() {
  return (
    <div className="lp-v lp-v-close" aria-hidden>
      <div className="lp-v-cohead">
        <Tile letters="FH" />
        <div className="lp-v-main">
          <span className="lp-v-name">Fern Hollow Health</span>
          <span className="lp-v-quiet mono">fernhollow.example</span>
        </div>
        <span className="lp-v-won">Won</span>
      </div>
      <div className="lp-v-pipe">
        {STAGES.map((x) => (
          <span key={x} className={x === "Won" ? "is-now" : undefined}>
            {x}
          </span>
        ))}
      </div>
      <div className="lp-v-sec">
        <div className="lp-v-top">
          <span className="lp-v-h">Proposal</span>
          <span className="lp-v-quiet">Fractional VP Marketing</span>
        </div>
        <div className="lp-v-log num">
          <span>
            <IconCheck size={12} />
            Sent Nov 10
          </span>
          <span>
            <IconCheck size={12} />
            Opened 2 times
          </span>
          <span className="is-done">
            <IconCheck size={12} />
            Signed by both
          </span>
        </div>
        <div className="lp-v-sign">
          <svg className="lp-v-sig" viewBox="0 0 132 32" focusable="false" aria-hidden>
            <path d="M4 22c6-14 12-18 14-12s-6 14-2 12 10-16 14-14-2 12 2 12 8-10 12-10 0 8 4 8 6-6 10-6 2 6 6 6 8-8 14-8 4 4 10 4 14-2 22-4" />
          </svg>
          <span className="lp-v-sign-who">
            <span className="lp-v-name">Casey Example, CEO</span>
            <span className="lp-v-quiet num">Signed Nov 14</span>
          </span>
        </div>
      </div>
      <div className="lp-v-proof">
        <span className="lp-v-proof-k">
          <span className="lp-v-h">Evidence Bank</span>
          <span className="lp-v-tag">Matched to this proposal</span>
        </span>
        <span className="lp-v-line">Rebuilt demand generation at a healthcare company</span>
      </div>
    </div>
  );
}

/* ---------- Workflows: when this happens, then do this, with what each step costs ---------- */

const FLOW = [
  { step: "Open the company", cost: `${COMPANY_PRICE_SAY} when locked` },
  { step: "Find who decides", cost: "1 credit" },
  { step: "Draft a note", cost: "No credits" },
];

function FlowVisual() {
  return (
    <div className="lp-v lp-v-flow" aria-hidden>
      <div className="lp-v-top">
        <span className="lp-v-h">Funding, then reach out</span>
        <span className="lp-v-on">On</span>
      </div>
      <div className="lp-v-when">
        <span className="lp-v-k">When</span>
        <span className="lp-v-line">
          A company on my list <strong>Healthcare and SaaS</strong> raises funding
        </span>
      </div>
      <div className="lp-v-then">
        <span className="lp-v-k">Then</span>
        <ol className="lp-v-steps">
          {FLOW.map((x, i) => (
            <li key={x.step}>
              <span className="lp-v-n num">{i + 1}</span>
              <span className="lp-v-name">{x.step}</span>
              <span className="lp-v-cost num">{x.cost}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="lp-v-flow-foot">
        <span className="lp-v-tag">Draft</span>
        <span>Moonbeam Freight raised funding. Your note waits in Messages.</span>
      </div>
    </div>
  );
}

interface Feature {
  key: string;
  /** The panel's field: mint, sand, mint soft, deep sand or pine. */
  tone: "mint" | "sand" | "soft" | "deep" | "pine";
  /** The job the panel does, as its small label. */
  label: string;
  /** A quiet Beta beside the label. */
  beta?: boolean;
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
      key: "close",
      tone: "deep",
      label: "Close it",
      head: ["Send the proposal, ", "get it signed", ""],
      body: "Pipeline keeps every company you are working on, step by step. On the Close plan, Merlin drafts the proposal from your call, sends it and your own contracts for e-signature, and tells you when they open it, with a follow-up ready. Evidence Bank matches your past results to the proposal.",
      art: <FeatClose />,
      corner: <Corner c="tl" t="ember" className="lp-feat-corner lp-feat-corner-l" />,
      visual: <CloseVisual />,
      alt: "A deal in the pipeline at Won. Its proposal was sent, opened 2 times and signed by both, with the client's e-signature, and a past result from the Evidence Bank matched to it.",
    },
    live.workflows
      ? {
          key: "flow",
          tone: "pine",
          label: "Workflows",
          beta: true,
          head: ["Hear ", "the moment it changes", ", then take the next step"],
          body: "Put an alert on any list or company you follow: a new open role, new funding, a new leader, a seat ended. It comes by email, in Slack or in the bell. A workflow then takes the next step: open the company, find who decides, draft a note. Each step shows its credits before it runs, and a note always waits as a draft. You can also use Merlin from your own AI assistant, such as Claude.",
          art: <FeatFlow />,
          corner: <Corner c="tr" t="ember" className="lp-feat-corner" />,
          visual: <FlowVisual />,
          alt: "A workflow: when a company on a saved list raises funding, open the company, find who decides and draft a note, with the credits each step costs. Its last run left a note waiting as a draft.",
        }
      : {
          key: "flow",
          tone: "pine",
          label: "Alerts",
          head: ["Hear ", "the moment it changes", ", in Slack or email"],
          body: "Put an alert on any list or company you follow: a new open role, new funding, a new leader, a seat ended. It comes by email, in Slack or in the bell. Each week we also send you the new open roles in your function. You can also use Merlin from your own AI assistant, such as Claude.",
          art: <FeatFlow />,
          corner: <Corner c="tr" t="ember" className="lp-feat-corner" />,
          visual: <SlackVisual />,
          alt: "A Merlin alert in Slack on a saved list: a new open role and a company that raised funding, each with the company's size, and a button to open it in Merlin.",
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
          <p className="lp-lead">Find the client, get in, price it and close it. It works the same way in every fractional function.</p>
        </div>
        <div className="lp-feat-list">
          {features(live).map((f) => (
            <article key={f.key} className={`lp-feat lp-feat-${f.tone}`} aria-labelledby={`feat-${f.key}`}>
              {f.corner}
              <div className="lp-feat-copy">
                <span className="lp-feat-label">
                  <span className="lp-pill">{f.label}</span>
                  {f.beta ? <span className="lp-feat-beta">Beta</span> : null}
                </span>
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
      </div>
    </section>
  );
}
