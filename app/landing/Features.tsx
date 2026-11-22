"use client";

/**
 * What Merlin does, one panel each: a small label, a headline with one phrase picked out, one
 * sentence, and a picture of that part of the product drawn in HTML and CSS (no image files),
 * with the panel's prop from the illustration system standing on it (scenes.tsx).
 * Crystal Ball (mint, the ball), warm paths (sand, the trail), rates (mint soft, the seat),
 * open roles (pine, the door).
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

/* ---------- Open roles: the alert as it lands in Slack ---------- */

const ROLES = [
  { co: "A SaaS company", role: "Fractional Head of Product", when: "Posted 2 days ago", facts: ["51–200 people", "$5M–$20M"] },
  { co: "A healthcare company", role: "Interim CMO", when: "Posted today", facts: ["201–500 people", "$20M–$50M"] },
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
        <span className="lp-v-slack-h num">2 new open roles fit you this week</span>
        {ROLES.map((r) => (
          <div key={r.role} className="lp-v-slack-item">
            <span className="lp-v-name">{r.co}</span>
            <span className="lp-v-line">
              <span className="lp-v-dot" />
              {r.role} · <span className="num">{r.when}</span>
            </span>
            <span className="lp-v-facts num">
              {r.facts.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </span>
          </div>
        ))}
        <span className="lp-v-btn lp-v-btn-pine">Open in Merlin</span>
        <span className="lp-v-quiet">Merlin alerts. Change them in Integrations.</span>
      </div>
    </div>
  );
}

interface Feature {
  key: string;
  /** The panel's field: mint, sand, mint soft or pine. */
  tone: "mint" | "sand" | "soft" | "pine";
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

const FEATURES: Feature[] = [
  {
    key: "ball",
    tone: "mint",
    label: "Crystal Ball",
    head: ["See who is likely to hire ", "your function next", ""],
    body: "Crystal Ball ranks the companies most likely to bring in a fractional in your function, and says why now.",
    art: <FeatBall />,
    corner: <Corner c="tr" t="ember" className="lp-feat-corner" />,
    visual: <BallVisual />,
    alt: "Crystal Ball: three companies, each with what happened there, a High or Medium likelihood and why now.",
  },
  {
    key: "way",
    tone: "sand",
    label: "Warm paths",
    head: ["Know ", "who held the seat", " and who hired them"],
    body: "A company's record leads with your way in: message the fractional who held the seat, or invite them to connect.",
    art: <FeatTrail />,
    corner: <Sun className="lp-feat-corner lp-feat-sun" />,
    visual: <WayInVisual />,
    alt: "A company's record with Your way in: two past seat holders with Message and Invite to connect, and the CEO who hired them behind a 1 credit unlock.",
  },
  {
    key: "rates",
    tone: "soft",
    label: "Rates",
    head: ["Price your work on ", "what fractionals charge", ""],
    body: "Median monthly and hourly rates by function and client revenue, shown only once enough people share one.",
    art: <FeatRates />,
    corner: <Corner c="tr" t="ember" className="lp-feat-corner" />,
    visual: <RatesVisual />,
    alt: "Rate benchmarks: a range bar and a median for three functions. Every amount is locked until you join.",
  },
  {
    key: "roles",
    tone: "pine",
    label: "Open roles",
    head: ["New fractional roles ", "every week", ", in Slack or email"],
    body: "We check for open fractional, interim and contract roles each week and send you the ones in your function.",
    art: <FeatDoor />,
    corner: <Corner c="tl" t="ember" className="lp-feat-corner lp-feat-corner-l" />,
    visual: <SlackVisual />,
    alt: "A Merlin alert in Slack: two new open roles, each with its title, when it was posted and the company's size, and a button to open it in Merlin.",
  },
];

/** Everything else in Merlin, named in a line each, so the page still says what is there. */
const ALSO = [
  "Ideal Fractional Profile and best fit",
  "Saved views with a weekly email",
  "Fractionals who serve your kind of clients",
  "Merlin in Claude",
  "Search across companies, seats and decision makers",
  "Follow a company",
];

export default function Features({ onJoin, starter }: { onJoin: () => void; starter: number }) {
  return (
    <section className="lp-sec lp-feats" id="features" aria-labelledby="feats-h">
      <div className="lp-wrap">
        <div className="lp-sec-head lp-sec-head-c">
          <h2 className="lp-h2" id="feats-h">
            What you can do with Merlin
          </h2>
          <p className="lp-lead">It works the same way in every fractional function.</p>
        </div>
        <div className="lp-feat-list">
          {FEATURES.map((f) => (
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
        <div className="lp-also">
          <h3 className="lp-also-h">Also in Merlin</h3>
          <ul className="lp-also-list">
            {ALSO.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
