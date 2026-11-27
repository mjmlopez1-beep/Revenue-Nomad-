import type { Metadata } from "next";
import type React from "react";
import type { ReactNode } from "react";
import "../homepage/home.css";
import "./lines.css";

export const metadata: Metadata = { title: "Merlin homepage, drawn in line" };

const css = (v: Record<string, string>) => v as React.CSSProperties;
const Ring = ({ c }: { c: string }) => <span className="hp-ring" style={css({ "--c": c })} />;

function Panel({ tone, hi, flip, dark, tag, tagBg, title, body, art, children }: { tone: string; hi?: string; flip?: boolean; dark?: boolean; tag: string; tagBg?: string; title: ReactNode; body: string; art: string; children: ReactNode }) {
  return (
    <article className={`hl-panel${flip ? " flip" : ""}${dark ? " dark" : ""}`} style={css({ "--t": tone, ...(hi ? { "--hi": hi } : {}) })}>
      <div className="hl-text">
        <span className="hp-tag" style={tagBg ? { background: tagBg, color: tagBg === "var(--saffron)" ? "var(--ink)" : "#fff" } : undefined}>{tag}</span>
        <h3>{title}</h3>
        <p>{body}</p>
        <a className="try" href="#">Try it with 25 free credits →</a>
      </div>
      <div className="hl-stack">
        <div className="hl-pic">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/brand/adapt/${art}.svg`} alt="" />
        </div>
        <div className="hp-card">{children}</div>
      </div>
    </article>
  );
}

export default function HomepageLines() {
  return (
    <div className="hp">
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
          <div className="hl-hero-grid">
            <div className="hl-left">
              <h1 style={{ fontSize: 60 }}>
                Find your next fractional client and <em style={{ color: "var(--volt)" }}>the way in</em>
              </h1>
              <p className="lead">See which companies hire fractionals, what they pay and who held the seat before you.</p>
              <div className="hp-join">
                <span>you@yourfirm.com</span>
                <a href="#" className="hp-btn">Get 25 credits</a>
              </div>
              <p className="hp-fine">Free plan, 25 credits to start. 21-day Close trial, no card.</p>
              <p style={{ color: "#a9c6ba", fontSize: 14, marginTop: 6 }}>Built by Revenue Nomad, the network of 500+ fractionals.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="art" src="/brand/adapt/fx-hero.svg" alt="" />
            </div>
            <div className="hl-right">
              <div className="hp-record">
                <div className="co">
                  <span className="hp-ico">QA</span>
                  <div>
                    <b>Quill Analytics</b>
                    <small>quillanalytics.example</small>
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>SaaS · 11-50 people · $5M-$20M</div>
                  </div>
                  <span className="hp-chip ember">Hiring now</span>
                </div>
                <div className="hl-sec" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                  <h5>Sales role · Open now <span>Open since Oct 24</span></h5>
                  <div className="hp-kv"><span>Role</span><b>Fractional VP Sales</b></div>
                  <div className="hp-kv"><span>Job posting</span><span className="hp-chip pine">Unlock · 1 credit</span></div>
                </div>
                <div className="hl-sec">
                  <h5>Marketing seat · Fractional <span>Started May 2026</span></h5>
                  <div className="hp-kv"><span>Seat holder</span><b>On file</b></div>
                  <div className="hp-kv"><span>Name and role</span><span className="hp-chip pine">Unlock · 1 credit</span></div>
                </div>
                <div className="hl-sec" style={{ borderTopStyle: "dashed" }}>
                  <h5>Once you join</h5>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <span className="hp-chip pine" style={{ padding: "4px 12px" }}>Message the seat holder</span>
                    <span className="hp-chip out" style={{ padding: "3px 12px" }}>Invite to connect</span>
                  </div>
                </div>
              </div>
              <p>A real record on Merlin today. Quill Analytics is hiring for Sales, and whoever held its Marketing seat is on file.</p>
            </div>
          </div>
        </div>
      </header>

      <div className="hp-wrap">
        <div className="hp-works">
          <span>Works with</span>
          <b>Slack</b>
          <span><b>Claude</b> and other AI assistants</span>
          <b>Granola</b>
        </div>

        <section className="hl-panels">
          <h2>What you can do with Merlin</h2>
          <p>Find the client, get in, price it and close it. It works the same way in every fractional function.</p>

          <Panel tone="var(--volt)" tag="Find the next client" art="fx-ball" title={<>See who is likely to hire your function next</>} body="Crystal Ball ranks companies High, Medium or Low on how likely they are to bring in a fractional in your function, and says why now. Hiring now lists the open fractional roles. Lookalikes finds more companies like your past clients.">
            <h4>Crystal Ball <span>Most likely first</span></h4>
            {[["PK", "Paper Kite Labs", "Hired a fractional CRO", "High", "pine"], ["MF", "Moonbeam Freight", "Raised a new round", "High", "pine"], ["TR", "Tin Robot Health", "Marketing leader left", "Medium", "volt"]].map(([i, n, w, b, c]) => (
              <div className="hp-li" key={n}>
                <span className="hp-ico">{i}</span>
                <div><b>{n}</b><small>{w}</small></div>
                <span className={`hp-chip ${c} act`}>{b}</span>
              </div>
            ))}
          </Panel>

          <Panel flip tone="var(--sand)" hi="#8a5a12" tag="Get in the door" tagBg="var(--saffron)" art="fx-way" title={<>Know <em>who held the seat</em>, who decides and who you know there</>} body="A company's record leads with your way in: message the fractional who held the seat, see who hired them, and find warm paths through people you know. Bring in your connections file or a contacts file. Each one is optional.">
            <h4>Your way in <span>Blue Heron Payments</span></h4>
            <div className="hp-li"><Ring c="var(--violet)" /><div><b>Alex Sample</b><small>Fractional VP Customer Success · On Merlin</small></div><span className="hp-chip pine act">Message</span></div>
            <div className="hp-li"><Ring c="var(--violet)" /><div><b>Jordan Example</b><small>Interim CFO · Not on Merlin yet</small></div><span className="hp-chip out act">Invite to connect</span></div>
            <div className="hp-li"><Ring c="var(--saffron)" /><div><b>Hired them · CEO</b><small>Decision maker</small></div><span className="hp-chip pine act">Unlock · 1 credit</span></div>
          </Panel>

          <Panel tone="var(--volt-soft)" hi="var(--volt-ink)" tag="Price it" art="fx-rates" title={<>Price your work on <em>what fractionals charge</em></>} body="Median monthly and hourly rates by function, shown only once enough people share one, and ranges by client size on Pro. What should I charge works out a price for a client and shows the working.">
            <h4>Rate benchmarks <span>Median and range</span></h4>
            {[["Sales", 22, 46, 44], ["Finance", 14, 42, 34], ["Technology", 34, 50, 58]].map(([l, a, w, m]) => (
              <div key={l as string}>
                <b style={{ color: "var(--ink)" }}>{l}</b>
                <div className="hp-bar"><i style={{ left: `${a}%`, width: `${w}%` }} /><u style={{ left: `${m}%` }} /></div>
              </div>
            ))}
          </Panel>

          <Panel flip tone="#ead9b6" hi="var(--volt-ink)" tag="Close it" art="fx-won" title={<>Send the proposal, <em>get it signed</em></>} body="Pipeline keeps every company you are working on, step by step. On the Close plan, Merlin drafts the proposal from your call, sends it and your own contracts for e-signature, and tells you when they open it, with a follow-up ready. Evidence Bank matches your past results to the proposal.">
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
          </Panel>

          <Panel dark tone="var(--pine)" hi="var(--volt)" tag="Workflows" tagBg="var(--ember)" art="fx-flow" title={<>Hear <em>the moment it changes</em>, then take the next step</>} body="Put an alert on any list or company you follow: a new open role, new funding, a new leader, a seat ended. It comes by email, in Slack or in the bell. A workflow then takes the next step: open the company, find who decides, draft a note. Each step shows its credits before it runs, and a note always waits as a draft.">
            <h4>Funding, then reach out <span style={{ color: "var(--volt-ink)", fontWeight: 700 }}>On</span></h4>
            <small style={{ color: "var(--muted)" }}>WHEN a company on my list <b style={{ color: "var(--ink)" }}>Healthcare and SaaS</b> raises funding</small>
            {[["Open the company", "2 credits when locked"], ["Find who decides", "1 credit"], ["Draft a note", "No credits"]].map(([a, b], i) => (
              <div className="hp-li" key={a}>
                <span className="hp-num">{i + 1}</span>
                <b>{a}</b>
                <small className="act">{b}</small>
              </div>
            ))}
          </Panel>
        </section>
      </div>
    </div>
  );
}
