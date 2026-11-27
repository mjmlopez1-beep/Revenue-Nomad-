import type { Metadata } from "next";
import type React from "react";
import "./home.css";

export const metadata: Metadata = { title: "Merlin homepage redesign" };

const css = (v: Record<string, string>) => v as React.CSSProperties;
const Ring = ({ c }: { c: string }) => <span className="hp-ring" style={css({ "--c": c })} />;

export default function HomepageRedesign() {
  return (
    <div className="hp">
      {/* ---------------- hero ---------------- */}
      <header className="hp-hero">
        <div className="hp-wrap">
          <div className="hp-nav">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/adapt/merlin-lockup-white.svg" alt="Merlin by Revenue Nomad" />
            <nav>
              <a href="#">Explore</a>
              <a href="#">What you can do</a>
              <a href="#">How it works</a>
              <a href="#">Pricing</a>
              <a href="#">Questions</a>
            </nav>
            <span className="sp" />
            <a href="#" style={{ fontWeight: 700 }}>Sign in</a>
            <a href="#" className="hp-btn line">Get 25 credits</a>
          </div>

          <div className="hp-hero-grid">
            <div style={{ position: "relative", zIndex: 2 }}>
              <h1>
                Find your next fractional client and <em>the way in</em>
              </h1>
              <p className="lead">See which companies hire fractionals, what they pay and who held the seat before you.</p>
              <div className="hp-join">
                <span>you@yourfirm.com</span>
                <a href="#" className="hp-btn">Get 25 credits</a>
              </div>
              <p className="hp-fine">Free plan, 25 credits to start. 21-day Close trial, no card.</p>
              <p>Built by Revenue Nomad, the network of 500+ fractionals.</p>
            </div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hp-hero-art" src="/brand/adapt/scene-terraces.svg" alt="A path climbing three terraces to a lit doorway" />
              <span className="hp-call" style={{ left: 566, top: 383 }}>You</span>
              <span className="hp-call" style={{ left: 836, top: 336 }}>Someone you know</span>
              <span className="hp-call" style={{ left: 918, top: 176 }}>Who decides</span>
              <div className="hp-record">
                <div className="co">
                  <span className="hp-ico">QA</span>
                  <div>
                    <b>Quill Analytics</b>
                    <small>quillanalytics.example</small>
                  </div>
                  <span className="hp-chip ember">Hiring now</span>
                </div>
                <div className="hp-kv"><span>Role</span><b>Fractional VP Sales</b></div>
                <div className="hp-kv"><span>Seat holder</span><span className="hp-chip pine">Unlock · 1 credit</span></div>
                <div className="hp-way">
                  <Ring c="var(--volt)" /><i /><Ring c="var(--violet)" /><i /><Ring c="var(--saffron)" />
                  <span className="hp-chip via" style={{ marginLeft: 6 }}>Dana · held the seat</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="hp-wrap">
        <div className="hp-works">
          <span>Works with</span>
          <b>Google</b>
          <b>Slack</b>
          <span><b>Claude</b> and other AI assistants</span>
          <b>Granola</b>
        </div>

        {/* ---------------- finder ---------------- */}
        <section className="hp-center">
          <span className="hp-tag">Live data</span>
          <h2>What are you looking for?</h2>
          <p>Pick your function and a question. The answer is on Merlin today.</p>
          <div className="hp-finder">
            <div className="row">
              {["Sales", "Marketing", "RevOps", "Customer Success", "Finance", "Product"].map((f, i) => (
                <span key={f} className={`hp-chip ${i === 0 ? "pine" : "out"}`}>{f}</span>
              ))}
            </div>
            <div className="row">
              <span className="hp-chip pine">Who is hiring now?</span>
              <span className="hp-chip out">Who hired a fractional before?</span>
              <span className="hp-chip out">What does it pay?</span>
              <span className="hp-chip via">Who do I know there?</span>
            </div>
            <div className="ans">
              <b>23</b>
              <span>companies have an open fractional Sales role right now. Join to see which, and your way in to each.</span>
            </div>
          </div>
        </section>

        {/* ---------------- the route ---------------- */}
        <section className="hp-route">
          <h2>What you can do with Merlin</h2>
          <p>Find the client, get in, price it and close it. It works the same way in every fractional function.</p>

          <article className="hp-step" data-n="1" style={css({ "--t": "var(--volt-soft)", "--mk": "var(--volt)" })}>
            <div>
              <span className="hp-tag">Find the next client</span>
              <h3>See who is likely to <em>hire your function next</em></h3>
              <p>Crystal Ball ranks companies High, Medium or Low on how likely they are to bring in a fractional in your function, and says why now. Hiring now lists the open fractional roles. Lookalikes finds more companies like your past clients.</p>
              <a className="try" href="#">Try it with 25 free credits →</a>
            </div>
            <div className="hp-card">
              <h4>Crystal Ball <span>Most likely first</span></h4>
              {[["PK", "Paper Kite Labs", "Hired a fractional CRO", "High", "pine"], ["MF", "Moonbeam Freight", "Raised a new round", "High", "pine"], ["TR", "Tin Robot Health", "Marketing leader left", "Medium", "volt"]].map(([i, n, w, b, c]) => (
                <div className="hp-li" key={n}>
                  <span className="hp-ico">{i}</span>
                  <div><b>{n}</b><small>{w}</small></div>
                  <span className={`hp-chip ${c} act`}>{b}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="hp-step" data-n="2" style={css({ "--t": "var(--violet-soft)", "--mk": "var(--violet)", "--hi": "var(--violet-ink)" })}>
            <div>
              <span className="hp-tag" style={{ background: "var(--violet-ink)" }}>Get in the door</span>
              <h3>Know <em>who held the seat</em>, who decides and who you know there</h3>
              <p>A company&apos;s record leads with your way in: message the fractional who held the seat, see who hired them, and find warm paths through people you know. Bring in your connections file or a contacts file. Each one is optional.</p>
              <a className="try" href="#">Try it with 25 free credits →</a>
            </div>
            <div className="hp-card">
              <h4>Your way in <span>Blue Heron Payments</span></h4>
              <div className="hp-li"><Ring c="var(--violet)" /><div><b>Alex Sample</b><small>Fractional VP Customer Success · On Merlin</small></div><span className="hp-chip pine act">Message</span></div>
              <div className="hp-li"><Ring c="var(--violet)" /><div><b>Jordan Example</b><small>Interim CFO · Not on Merlin yet</small></div><span className="hp-chip out act">Invite to connect</span></div>
              <div className="hp-li"><Ring c="var(--violet)" /><div><b>Riley Example</b><small>In your contacts · Started here in May</small></div><span className="hp-chip out act">Draft a note</span></div>
              <div className="hp-li"><Ring c="var(--saffron)" /><div><b>Hired them · CEO</b><small>Decision maker</small></div><span className="hp-chip pine act">Unlock · 1 credit</span></div>
            </div>
          </article>

          <article className="hp-step" data-n="3" style={css({ "--t": "var(--surface-2)" })}>
            <div>
              <span className="hp-tag">Price it</span>
              <h3>Price your work on <em>what fractionals charge</em></h3>
              <p>Median monthly and hourly rates by function, shown only once enough people share one, and ranges by client size on Pro. What should I charge works out a price for a client and shows the working.</p>
              <a className="try" href="#">Try it with 25 free credits →</a>
            </div>
            <div className="hp-card">
              <h4>Rate benchmarks <span>Median and range</span></h4>
              {[["Sales", 22, 46, 44], ["Finance", 14, 42, 34], ["Technology", 34, 50, 58]].map(([l, a, w, m]) => (
                <div key={l as string}>
                  <b style={{ color: "var(--ink)" }}>{l}</b>
                  <div className="hp-bar"><i style={{ left: `${a}%`, width: `${w}%` }} /><u style={{ left: `${m}%` }} /></div>
                </div>
              ))}
            </div>
          </article>

          <article className="hp-step" data-n="4" style={css({ "--t": "var(--sand)" })}>
            <div>
              <span className="hp-tag">Close it</span>
              <h3>Send the proposal, <em>get it signed</em></h3>
              <p>Pipeline keeps every company you are working on, step by step. On the Close plan, Merlin drafts the proposal from your call, sends it and your own contracts for e-signature, and tells you when they open it, with a follow-up ready. Evidence Bank matches your past results to the proposal.</p>
              <a className="try" href="#">Try it with 25 free credits →</a>
            </div>
            <div className="hp-card">
              <div className="hp-li" style={{ border: 0, paddingTop: 0 }}>
                <span className="hp-ico">FH</span>
                <div><b>Fern Hollow Health</b><small>Fractional VP Marketing</small></div>
                <span className="hp-chip pine act">Won</span>
              </div>
              <div className="hp-stages">
                {["To reach out", "Meeting", "Proposal", "Won"].map((s) => <div key={s}><i />{s}</div>)}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="hp-chip out">Sent Nov 10</span>
                <span className="hp-chip out">Opened 2 times</span>
                <span className="hp-chip volt">Signed by both</span>
              </div>
            </div>
          </article>

          <article className="hp-step dark" data-n="5" style={css({ "--t": "var(--pine)", "--mk": "var(--ember)", "--hi": "var(--volt)" })}>
            <div>
              <span className="hp-tag" style={{ background: "var(--ember)" }}>Workflows</span>
              <h3>Hear <em>the moment it changes</em>, then take the next step</h3>
              <p>Put an alert on any list or company you follow: a new open role, new funding, a new leader, a seat ended. It comes by email, in Slack or in the bell. A workflow then takes the next step: open the company, find who decides, draft a note.</p>
              <a className="try" href="#">Try it with 25 free credits →</a>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="art" src="/brand/adapt/spot-beacon.svg" alt="" />
            <div className="hp-card">
              <h4>Funding, then reach out <span style={{ color: "var(--volt-ink)", fontWeight: 700 }}>On</span></h4>
              <small style={{ color: "var(--muted)" }}>WHEN a company on my list <b style={{ color: "var(--ink)" }}>Healthcare and SaaS</b> raises funding</small>
              {[["Open the company", "2 credits when locked"], ["Find who decides", "1 credit"], ["Draft a note", "No credits"]].map(([a, b], i) => (
                <div className="hp-li" key={a}>
                  <span className="hp-num">{i + 1}</span>
                  <b>{a}</b>
                  <small className="act">{b}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        {/* ---------------- how it works ---------------- */}
        <section className="hp-how">
          <h2>Share what you know, see what others know</h2>
          <div className="hp-how-line">
            <div style={css({ "--c": "var(--volt)" })}><b>Add what you know</b>A company, a seat, a rate. Each fact you add earns 1 credit.</div>
            <div style={css({ "--c": "var(--violet)" })}><b>Spend a credit to see one</b>Who held the seat, what it paid, who decides. 1 credit a fact.</div>
            <div style={css({ "--c": "var(--saffron)" })}><b>Confirm or report</b>Confirm what is right and report what is wrong, so the record stays true.</div>
          </div>
        </section>
      </div>

      {/* ---------------- pricing ---------------- */}
      <section className="hp-price">
        <div className="hp-wrap">
          <h2>One client pays for years of Pro</h2>
          <p>Find the company before it posts and get in through the person who held the seat. Close adds the proposal they sign.</p>
          <div className="hp-plans">
            {[
              { n: "Free", a: "$0", per: "", items: ["25 credits to start, and 1 for each fact you add", "1 saved view with the weekly email", "Benchmark medians by function"] },
              { n: "Pro", a: "$59", per: "a month, or $590 a year", items: ["Unlimited saved views and every alert", "Benchmark ranges and client-size rows", "100 credits each paid month"], pick: true },
              { n: "Close", a: "$79", per: "a month, or $790 a year", items: ["Everything in Pro", "Proposals and e-signature", "Evidence Bank and Agent access"] },
            ].map((p) => (
              <article key={p.n} className={`hp-plan${p.pick ? " pick" : ""}`}>
                <h3>{p.n}</h3>
                <div className="amt">{p.a} <small>{p.per}</small></div>
                <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
                <a href="#" className={`hp-btn${p.pick ? "" : " pine"}`}>Start free</a>
              </article>
            ))}
          </div>
          <p style={{ marginTop: 18 }}>21-day Close trial, no card. It ends into Free on its own.</p>
        </div>
      </section>

      {/* ---------------- closing ---------------- */}
      <div className="hp-wrap">
        <section className="hp-close">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/adapt/scene-rotunda.svg" alt="" />
          <div>
            <h2>Find the companies that hire <em>your function</em></h2>
            <p>Free plan, 25 credits to start. 21-day Close trial, no card.</p>
            <a href="#" className="hp-btn">Start free, with the 21-day Close trial</a>
          </div>
        </section>
        <footer className="hp-foot">
          <span>Merlin by Revenue Nomad</span>
          <span>Privacy · Terms · Questions and feedback</span>
        </footer>
      </div>
    </div>
  );
}
