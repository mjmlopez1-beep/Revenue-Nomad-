import Illustration from "../../Illustration";
import { Art, Switcher, artOf, type MockTheme } from "../Shell";

const FUNCTIONS = ["Sales", "Marketing", "RevOps", "Customer Success", "Partnerships", "Growth", "Product Marketing", "Enablement", "AI GTM", "Technology", "Finance", "Operations", "People", "Product", "Legal", "Executive"];

const FEATURES = [
  { art: "spot-beacon", land: "spot-beacon", blend: "spot-guide-beacon", pill: "Find the next client", title: "See who is likely to hire your function next", body: "Crystal Ball ranks companies High, Medium or Low. Hiring now lists every open fractional role." },
  { art: "spot-bridge", land: "spot-gate", blend: "scene-fellow", pill: "Get in the door", title: "Know who held the seat, who decides and who you know there", body: "Warm paths show the person in between and how strong the route is." },
  { art: "spot-stairs", land: "spot-signpost", blend: "scene-ziggurat", pill: "Price it", title: "Price your work on what fractionals charge", body: "Rate benchmarks by function and client size, per month and per hour." },
  { art: "spot-match", land: "spot-flag", blend: "spot-guide-door", pill: "Close it", title: "Send the proposal, get it signed", body: "Pipeline, proposals and e-signature in one place." },
] as const;

const PLANS = [
  { name: "Free", price: "$0", per: "", line: "25 credits to start, and 1 for each fact you add.", items: ["Companies, seats, rates and people", "1 saved view with the weekly email", "Benchmark medians by function"] },
  { name: "Pro", price: "$59", per: "a month, or $590 a year", line: "Find the company before it posts.", items: ["Unlimited saved views and every alert", "Benchmark ranges and client-size rows", "100 credits each paid month"], pick: true },
  { name: "Close", price: "$79", per: "a month, or $790 a year", line: "Adds the proposal they sign.", items: ["Everything in Pro", "Proposals and e-signature", "Evidence Bank and Agent access"] },
];

export default function Landing({ theme }: { theme: MockTheme }) {
  const art = artOf(theme);
  return (
    <div className={`ml mk mk-${theme}`}>
      <div className="mk-land">
        <header className="mk-land-nav">
          <a href="#" className="mk-wordmark">
            merlin<i>.</i>
          </a>
          <nav>
            <a href="#">Explore</a>
            <a href="#">What you can do</a>
            <a href="#">How it works</a>
            <a href="#">Pricing</a>
            <a href="#">Questions</a>
          </nav>
          <a href="#" className="mk-btn ghost">Sign in</a>
        </header>

        <section className="mk-hero">
          <div>
            <span className="mk-pill lime"><span className="mk-dot" />86 open fractional roles right now</span>
            <h1>
              Find your next fractional client and <em>the way in</em>
            </h1>
            <p className="lead">See which companies hire fractionals, what they pay and who held the seat before you.</p>
            <div className="mk-join">
              <span className="mk-input">you@yourfirm.com</span>
              <a href="#" className="mk-btn big">Email me my link</a>
            </div>
            <p className="mk-fine">Built by Revenue Nomad, the network of 500+ fractionals.</p>
          </div>
          <Art theme={theme} land="scene-trailhead" blend="scene-setting-out" priority />
        </section>

        <div className="mk-works">
          <span>Works with</span>
          {["Google Calendar, Contacts, Gmail", "Slack", "Claude and other AI assistants", "Granola"].map((w) => (
            <span className="mk-pill" key={w}>{w}</span>
          ))}
        </div>

        <div className="mk-band">
          <div><b>2,480</b><span>companies on file</span></div>
          <div><b>4,120</b><span>seats on file</span></div>
          <div><b>86</b><span>open roles now</span></div>
          <div><b>16</b><span>functions covered</span></div>
        </div>
        <div className="mk-chips">
          {FUNCTIONS.map((f) => (
            <span className="mk-pill" key={f}>{f}</span>
          ))}
        </div>

        {(
          <>
            <section className="mk-sec mk-split">
              <Art theme={theme} land="scene-fork" blend="scene-fork" />
              <div>
                <span className="mk-eyebrow">Why Merlin</span>
                <h2 className="mk-h2">Most fractionals start out alone.</h2>
                <p className="lead">
                  You work from home, with no coworkers and no pipeline, and the usual advice is cold
                  outreach. That road is steep and it mostly stops short.
                </p>
                <p className="lead">
                  Merlin shows you the warmer one: which companies are about to hire, who held the
                  seat before you, and who can walk you in.
                </p>
              </div>
            </section>
            <section className="mk-sec">
              <span className="mk-eyebrow">Where it leads</span>
              <h2 className="mk-h2">Every one of these started as a camp and a first stone.</h2>
              <p className="lead">Your practice is the thing you are building. We help you find the best road to it.</p>
              <div className="mk-dest">
                {(theme === "color"
                  ? ["first-stone", "nile", "acropolis", "forum", "jungle", "ridge"]
                  : ["first-stone", "pyramids", "temple", "ziggurat", "rotunda", "fellow"]
                ).map((d) => (
                  <Art key={d} theme={theme} land={`scene-${d}`} blend={`scene-${d}`} />
                ))}
              </div>
            </section>
          </>
        )}

        <section className="mk-sec">
          <span className="mk-eyebrow">What you can do with Merlin</span>
          <h2 className="mk-h2">Find the client, get in, price it and close it.</h2>
          <p className="lead">It works the same way in every fractional function.</p>
          <div className="mk-grid c4" style={{ marginTop: 32 }}>
            {FEATURES.map((f) => (
              <article className="mk-card mk-feature" key={f.pill}>
                <Art theme={theme} land={f.land} blend={f.blend} />
                <div>
                  <span className="mk-pill lime">{f.pill}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mk-sec">
          <span className="mk-eyebrow">How it works</span>
          <h2 className="mk-h2">Share what you know, see what others know</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/brand/${art}/divider-path.svg`} alt="" style={{ width: "100%", height: "auto", display: "block", margin: "28px 0 4px" }} />
          <div className="mk-steps">
            <div>
              <b>Add what you know</b>
              <p>A company, a seat, a rate. Each fact you add earns 1 credit.</p>
            </div>
            <div>
              <b>Spend a credit to see one</b>
              <p>Who held the seat, what it paid, who decides. 1 credit a fact.</p>
            </div>
            <div>
              <b>Confirm or report</b>
              <p>Confirm what is right and report what is wrong, so the record stays true.</p>
            </div>
          </div>
        </section>

        <section className="mk-sec">
          <span className="mk-eyebrow">Pricing</span>
          <h2 className="mk-h2">One client pays for years of Pro</h2>
          <p className="lead">Find the company before it posts and get in through the person who held the seat. Close adds the proposal they sign.</p>
          <div className="mk-grid c3" style={{ marginTop: 32 }}>
            {PLANS.map((p) => (
              <article className={`mk-card mk-plan${p.pick ? " pick forest" : ""}`} key={p.name}>
                <h3>{p.name}</h3>
                <div className="price">
                  {p.price} <small>{p.per}</small>
                </div>
                <p className="mk-dim">{p.line}</p>
                <ul>
                  {p.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <a href="#" className={`mk-btn${p.pick ? "" : " ghost"}`}>Start free</a>
              </article>
            ))}
          </div>
          <p className="mk-fine">21-day Close trial, no card. It ends into Free on its own.</p>
        </section>

        <section className="mk-cta">
          <Art theme={theme} land="scene-acropolis" blend="scene-temple" />
          <div>
            <h2>
              Find the companies that hire <em style={{ fontFamily: "var(--ml-serif)", fontWeight: 500, color: "var(--ml-lime)" }}>your function</em>
            </h2>
            <p className="mk-dim" style={{ fontSize: 17, margin: "16px 0 24px" }}>Free plan, 25 credits to start. 21-day Close trial, no card.</p>
            <a href="#" className="mk-btn big">Start free, with the 21-day Close trial</a>
          </div>
        </section>
      </div>
      <Switcher theme={theme} active="landing" />
    </div>
  );
}
