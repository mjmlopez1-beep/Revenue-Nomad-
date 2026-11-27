import type { Metadata } from "next";
import type React from "react";
import type { ReactNode } from "react";
import "../mockups/homepage/home.css";
import "./guide.css";

export const metadata: Metadata = { title: "Merlin brand guide" };

const css = (v: Record<string, string>) => v as React.CSSProperties;
const Ring = ({ c, fill }: { c: string; fill?: string }) => <span className="hp-ring" style={css({ "--c": c, ...(fill ? { background: fill } : {}) })} />;
const Img = ({ src, alt = "" }: { src: string; alt?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={`/brand/adapt/${src}.svg`} alt={alt} />
);

const COLORS: [string, string, string, string][] = [
  ["Pine", "#073F2F", "#fff", "Navigate, act, spend. The ground for line art."],
  ["Volt", "#2EE59D", "#073F2F", "Earn and add. The primary button. You."],
  ["Ember", "#FF5A1F", "#fff", "Needs you now. The Nomad's cloak."],
  ["Saffron", "#FFC12E", "#073F2F", "The path, a lit door, who decides."],
  ["Violet", "#A05CE6", "#fff", "The person in between."],
];
const SHADES: [string, string][] = [["Ink", "#0A1A13"], ["Page", "#FAFAF7"], ["Surface", "#F3F5F4"], ["Sand", "#F5ECD9"], ["Volt soft", "#E8FBF2"], ["Volt ink", "#0B6B45"], ["Violet light", "#C08CF5"], ["Violet soft", "#F3EAFD"], ["Violet ink", "#6A32B4"], ["Door glow", "#FFE39A"]];

const TILES: [string, string, string][] = [
  ["scene-terraces", "Terraced climb", "Homepage hero"],
  ["band-companies", "Wall of doors", "Companies and lists: many accounts, one lit"],
  ["scene-bridge", "Bridge", "Introductions and fellow fractionals"],
  ["fx-ball", "Crystal ball", "Crystal Ball and forecasts"],
  ["scene-summit", "Stepped tower", "Pipeline and progress"],
  ["scene-rotunda", "Rotunda", "Closing call to action"],
];

function Sec({ n, title, lead, children }: { n: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section className="bg-sec">
      <small>{n}</small>
      <h2>{title}</h2>
      <p>{lead}</p>
      {children}
    </section>
  );
}

function DD({ ok, stage, bg, children }: { ok: boolean; stage: ReactNode; bg: string; children: ReactNode }) {
  return (
    <figure style={css({ "--k": ok ? "#0B6B45" : "#D12F4A" })}>
      <div className="stage" style={{ background: bg }}>{stage}</div>
      <figcaption>
        <b>{ok ? "Do" : "Don't"}</b>
        {children}
      </figcaption>
    </figure>
  );
}

export default function BrandGuide() {
  return (
    <div className="hp">
      <header className="bg-cover">
        <Img src="scene-terraces" />
        <div className="hp-wrap" style={{ width: "100%" }}>
          <div className="in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/brand/adapt/merlin-lockup-white.svg" alt="Merlin by Revenue Nomad" />
            <h1>A familiar<br /><em>way in.</em></h1>
            <p>Brand guide. The Merlin design system, with line architecture, a saffron path and one new job for violet.</p>
          </div>
        </div>
      </header>

      <div className="hp-wrap">
        <Sec n="01" title="The idea" lead="Going fractional is a long road that most people start alone. Merlin shows the warmer one. The whole identity is a single picture of that: a traveller, a path, someone in between, and a lit door.">
          <div className="bg-mean">
            <div className="bg-box"><Ring c="var(--volt)" /><div><h4>You</h4><p>The Nomad. One traveller, usually alone at the start.</p></div></div>
            <div className="bg-box"><Ring c="var(--violet)" /><div><h4>The person in between</h4><p>A seat holder, a mutual contact, a fellow fractional.</p></div></div>
            <div className="bg-box"><Ring c="var(--saffron)" fill="var(--glow)" /><div><h4>The lit door</h4><p>The company, and the person who decides.</p></div></div>
          </div>
        </Sec>

        <Sec n="02" title="Logo" lead="Use the existing lockup. Pine and ink on light, all white on pine. Keep it at least 96px wide, and never on volt, ember or saffron.">
          <div className="bg-grid c2">
            <div className="bg-box" style={{ display: "flex", justifyContent: "center", padding: 48 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/adapt/merlin-lockup.svg" alt="Merlin lockup on light" style={{ height: 64 }} />
            </div>
            <div className="bg-box" style={{ display: "flex", justifyContent: "center", padding: 48, background: "var(--pine)", borderColor: "var(--pine)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/adapt/merlin-lockup-white.svg" alt="Merlin lockup on pine" style={{ height: 64 }} />
            </div>
          </div>
        </Sec>

        <Sec n="03" title="Color" lead="Every color has one job. If a use does not fit the job, the color is wrong for it.">
          <div className="bg-grid c5">
            {COLORS.map(([name, hex, on, job]) => (
              <div className="bg-sw" key={name}>
                <i style={{ background: hex, color: on }}>{name}</i>
                <div><code>{hex}</code>{job}</div>
              </div>
            ))}
          </div>
          <div className="bg-shades">
            {SHADES.map(([n, h]) => <span key={n}><i style={{ background: h }} />{n} <code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{h}</code></span>)}
          </div>
        </Sec>

        <Sec n="04" title="The route" lead="A route always reads volt, then violet, then saffron. It is the one motif that travels from the hero into the product.">
          <div className="bg-route">
            <div className="stop"><Ring c="var(--volt)" /><b>You</b><span className="d">Fractional VP Sales</span></div>
            <span className="seg" />
            <div className="stop"><Ring c="var(--violet-light)" /><b>Dana R.</b><span className="d">Held the seat. On Merlin.</span></div>
            <span className="seg" />
            <div className="stop"><Ring c="var(--saffron)" fill="var(--glow)" /><b>Ava Whitcombe</b><span className="d">CEO. Decides on the seat.</span></div>
          </div>
          <div className="bg-grid c2" style={{ marginTop: 16 }}>
            <div className="bg-box">
              <h4>In a table row</h4>
              <div className="hp-way" style={{ border: 0, padding: 0 }}>
                <Ring c="var(--volt)" /><i /><Ring c="var(--violet)" /><i /><Ring c="var(--saffron)" />
                <span className="hp-chip via" style={{ marginLeft: 6 }}>Dana · held the seat</span>
              </div>
            </div>
            <div className="bg-box">
              <h4>When nobody is named yet</h4>
              <div className="hp-way" style={{ border: 0, padding: 0 }}>
                <Ring c="var(--volt)" /><i style={{ background: "var(--line-strong)" }} /><Ring c="var(--line-strong)" /><i style={{ background: "var(--line-strong)" }} /><Ring c="var(--line-strong)" />
                <span className="hp-chip" style={{ marginLeft: 6, border: "1px dashed var(--line-strong)", color: "var(--muted)" }}>Nobody named yet</span>
              </div>
            </div>
          </div>
        </Sec>

        <Sec n="05" title="Type" lead="Schibsted Grotesk for everything. Red Hat Mono only for domains, links and emails shown as data. No serif.">
          <div className="bg-box bg-type">
            <div className="row" style={{ borderTop: 0 }}><small>Headline · 64 / 800</small><div style={{ fontSize: 64, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.04em", color: "var(--ink)" }}>Find the <span style={{ color: "var(--volt-ink)" }}>way in</span></div></div>
            <div className="row"><small>Page title · 28 / 800</small><div style={{ fontSize: 28, lineHeight: "34px", fontWeight: 800, letterSpacing: "-0.025em", color: "var(--ink)" }}>Companies</div></div>
            <div className="row"><small>Section · 17 / 700</small><div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Who decides here</div></div>
            <div className="row"><small>Reading · 15 / 400</small><div>See which companies hire fractionals, what they pay and who held the seat before you.</div></div>
            <div className="row"><small>Data · mono 12</small><div style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>larkspurlearning.example</div></div>
          </div>
        </Sec>

        <Sec n="06" title="Interface" lead="Corners are 6, 8 and 10px. A filled chip is a state, an outlined chip is an attribute, a dashed chip means missing. Ember appears at most twice on a screen.">
          <div className="bg-grid c2">
            <div className="bg-box">
              <h4>Buttons</h4>
              <div className="bg-ui" style={{ marginTop: 10 }}>
                <a className="hp-btn" href="#">+ Add what you know</a>
                <a className="hp-btn pine" href="#">Ask for an intro</a>
                <a className="hp-btn" href="#" style={{ background: "#fff", border: "1px solid var(--line-strong)", color: "var(--ink)" }}>Open the company</a>
              </div>
            </div>
            <div className="bg-box">
              <h4>Chips</h4>
              <div className="bg-ui" style={{ marginTop: 10 }}>
                <span className="hp-chip pine">Sales</span>
                <span className="hp-chip out">Marketing</span>
                <span className="hp-chip volt">Member</span>
                <span className="hp-chip via">Fellow fractional</span>
                <span className="hp-chip ember" style={{ marginLeft: 0 }}>Hiring now</span>
                <span className="hp-chip pine">Unlock · 1 credit</span>
                <span className="hp-chip" style={{ border: "1px dashed var(--line-strong)", color: "var(--muted)" }}>Not named yet</span>
              </div>
            </div>
          </div>
        </Sec>

        <Sec n="07" title="Illustration" lead="White lines of one weight on pine. Classical forms in isometric view. Volt on arch edges and trees, one saffron path, one lit door. The Nomad is the only ember shape, and the crystal ball the only filled circle.">
          <div className="bg-grid c3">
            {TILES.map(([src, name, use]) => (
              <div key={src}>
                <div className="bg-tile" style={{ borderRadius: "16px 16px 0 0" }}><Img src={src} alt={name} /></div>
                <div className="bg-tile" style={{ background: "none", borderRadius: 0 }}><div><b>{name}</b>{use}</div></div>
              </div>
            ))}
          </div>
        </Sec>

        <Sec n="08" title="Do and don't" lead="Four rules that keep the picture readable.">
          <div className="bg-grid c2 bg-dd">
            <DD ok bg="var(--pine)" stage={<Img src="spot-door" />}>Keep line art on pine, with one lit door.</DD>
            <DD ok={false} bg="var(--bg)" stage={<span style={{ filter: "invert(1) hue-rotate(180deg)", width: "86%", display: "flex", justifyContent: "center" }}><Img src="spot-door" /></span>}>Don&apos;t put line art on a light background. It loses the look.</DD>
            <DD ok bg="var(--surface)" stage={<div className="hp-way" style={{ border: 0 }}><Ring c="var(--volt)" /><i /><Ring c="var(--violet)" /><i /><Ring c="var(--saffron)" /><span className="hp-chip via" style={{ marginLeft: 6 }}>Priya · fellow fractional</span></div>}>Use violet where a person connects two others.</DD>
            <DD ok={false} bg="var(--surface)" stage={<div className="bg-ui"><a className="hp-btn" href="#" style={{ background: "var(--violet)", color: "#fff" }}>Save view</a><span className="hp-chip" style={{ background: "var(--saffron)", color: "var(--ink)" }}>New</span></div>}>Don&apos;t use violet or saffron as decoration or for buttons.</DD>
          </div>
        </Sec>

        <footer className="bg-foot">Merlin brand guide, draft. The written version is in docs/merlin-brand-guide.md.</footer>
      </div>
    </div>
  );
}
