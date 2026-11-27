import Link from "next/link";
import type React from "react";
import type { ReactNode } from "react";
import { Icon } from "../Shell";
import "./net.css";

export const VERSIONS = [
  { v: 1, name: "Title band", note: "The page title sits on one dark band with the terraced climb.", share: "about 15%" },
  { v: 2, name: "Next move", note: "Only the Your next move card goes dark, with the bridge above the route.", share: "about 10%" },
  { v: 3, name: "The rail", note: "The sidebar foot becomes line art, and the selected stat card goes dark.", share: "about 12%" },
  { v: 4, name: "Four doors", note: "Each of the four stat cards is a dark tile with its own small building.", share: "about 20%" },
  { v: 5, name: "Dark hero", note: "Header, search and stats share one dark hero with the corridor of arches.", share: "about 30%" },
  { v: 6, name: "Opened row", note: "The selected opportunity opens into a dark panel that draws the route to the door.", share: "about 18%" },
  { v: 7, name: "Right column", note: "The whole right column is one dark panel under the rotunda.", share: "about 25%" },
  { v: 8, name: "Arcade strip", note: "A thin dark strip shows your twelve contacts as twelve doors.", share: "about 10%" },
  { v: 9, name: "Arched window", note: "One arch-shaped dark window in the header, and nothing else.", share: "about 8%" },
  { v: 10, name: "Bookends", note: "Line art in the sidebar foot and one closing band at the bottom of the page.", share: "about 20%" },
] as const;

const css = (v: Record<string, string | number>) => v as React.CSSProperties;
const Art = ({ name }: { name: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img className="art" src={`/brand/net/${name}.svg`} alt="" />
);

const NAV: { h?: string; items: [string, string, string?, boolean?][] }[] = [
  { items: [["Home", "home"], ["Crystal Ball", "crystal", "b3"]] },
  { h: "FIND", items: [["My Network", "people", "12", true], ["Target Companies", "companies", "38"], ["Warm Paths", "paths", "8"]] },
  { h: "WORK", items: [["Pipeline", "pipeline", "8"], ["Proposals", "proposals"], ["Contracts", "contracts", "b1"], ["Evidence Bank", "evidence"], ["Workflows", "agent"]] },
  { h: "COMMUNITY", items: [["Fractionals", "fractionals"], ["Messages", "messages", "b2"]] },
];

const STATS: [string, string, string, string, string, string][] = [
  ["Business opportunities", "Contacts connected to active demand", "7", "spark", "spot-beacon", "on"],
  ["Decision makers", "Close to a conversation", "5", "people", "spot-door", ""],
  ["Former clients", "Past engagements and champions", "4", "evidence", "spot-stairs", ""],
  ["Fellow fractionals", "Peers who can open doors", "4", "fractionals", "spot-bridge", ""],
];

const PEOPLE = [
  { i: "RI", c: "#f3c9c0", name: "Rosa Iqbal", role: "Fractional CFO", how: "Worked together at Brightwater (2021-2023)", last: "Last spoke 2 weeks ago", co: "Copperlane Logistics", lc: "#e2603f", pill: "hire", note: "RevOps advisor, part time", act: "Request an intro", primary: true },
  { i: "TB", c: "#f3dc9a", name: "Theo Brandt", role: "Head of Sales", how: "Introduced by Dana Kim at SaaS Summit", last: "Last spoke 1 month ago", co: "Quillfeather", lc: "#d94f6b", pill: "emerge", note: "Scaling RevOps after raise", act: "Reconnect" },
  { i: "SO", c: "#dfe6c4", name: "Sam Okafor", role: "Fractional CMO", how: "Former client (2 engagements)", last: "Last spoke 3 months ago", co: "Larkspur Analytics", lc: "#4a56d6", pill: "hire", note: "RevOps lead", act: "Discuss opportunity" },
  { i: "AL", c: "#f2d3c4", name: "Ava Lindqvist", role: "Fractional COO", how: "Co-led a project at Tidewell Freight", last: "Last spoke 1 month ago", co: "Kestrel Ledger", lc: "#1f2a37", pill: "emerge", note: "Fractional RevOps seat ends in March", act: "Reconnect" },
  { i: "MS", c: "#e3d5f1", name: "Mara Svensson", role: "Fractional CMO", how: "Referral from Owen Pryce (trusted partner)", last: "Last spoke 2 weeks ago", co: "Saltmarsh Security", lc: "#4f6be0", pill: "emerge", note: "Recently raised funding", act: "Discuss opportunity" },
];

function Route() {
  return (
    <div className="nw-route">
      <div className="nw-stop"><i style={{ background: "#0e3329", color: "#fff", boxShadow: "0 0 0 2px #c9f03d inset" }}>MH</i><b>You</b></div>
      <span className="seg" />
      <div className="nw-stop"><i style={{ background: "#e9dff5", color: "#17241e" }}>DK</i><b>Dana Kim</b><span>Your contact</span></div>
      <span className="seg" />
      <div className="nw-stop"><i style={{ background: "#dbe6f7", color: "#17241e" }}>CW</i><b>Casey Wu</b><span>CRO, Larkspur</span></div>
    </div>
  );
}

function NextMove({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <span className="nw-eyebrow">YOUR NEXT MOVE</span>
      <h2>A warm path to Larkspur Analytics.</h2>
      <p style={{ color: "var(--dim)" }}>Dana can introduce you to the CRO, who is hiring a RevOps lead.</p>
      <Route />
      <a className="nw-btn" href="#" style={{ width: "100%", justifyContent: "center" }}>Request an intro from Dana</a>
    </>
  );
}

function Glance() {
  const rows: [string, string, number, string][] = [["With opportunities", "7", 78, "#134237"], ["Decision makers", "5", 56, "#7955b5"], ["Former clients", "4", 45, "#3e6fd1"], ["Fellow fractionals", "4", 45, "#d29b43"]];
  return (
    <>
      <h2 style={{ fontSize: 25 }}>Your network at a glance</h2>
      <div className="nw-bars">
        {rows.map(([l, n, w, c]) => (
          <div key={l}>
            <span>{l}</span>
            <span className="track"><i style={{ width: `${w}%`, background: c }} /></span>
            <b>{n}</b>
          </div>
        ))}
      </div>
      <div className="nw-note">
        <Icon name="spark" />
        <div>
          3 contacts have new or increasing demand in your areas of expertise.
          <div style={{ marginTop: 6 }}><a href="#">Review opportunities →</a></div>
        </div>
      </div>
    </>
  );
}

/** Twelve contacts as twelve doors. Seven lead somewhere today. */
function Arcade() {
  const state = "o.ov.o.oo.vo";
  const dw = 60;
  return (
    <svg viewBox="0 0 720 96" role="img" aria-label="Twelve contacts drawn as twelve doors. Seven are lit.">
      <path d="M0 84H720" stroke="#f2b632" strokeWidth="5" strokeLinecap="round" />
      {[...state].map((ch, i) => {
        const x = i * dw + 14;
        const w = 32;
        return <path key={i} className={`door${ch === "o" ? " open" : ""}${ch === "v" ? " open via" : ""}`} d={`M${x} 82V${22 + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V82Z`} />;
      })}
      <circle cx="6" cy="84" r="6" fill="#0e3329" stroke="#c9f03d" strokeWidth="4" />
    </svg>
  );
}

export default function Network({ v }: { v: number }) {
  const lineRail = v === 3 || v === 10;
  const top = (
    <div className="nw-top">
      <span className="nw-crumb">Find &nbsp;›<b>My Network</b></span>
      <span className="nw-search"><Icon name="find" />Search your network, companies and people<kbd>⌘K</kbd></span>
      <a className="nw-btn ghost" href="#">Import contacts</a>
      <a className="nw-btn" href="#">All contacts (12)</a>
    </div>
  );
  const title = (
    <div>
      <h1>Your network in motion.</h1>
      <p>The relationships that can grow your practice.</p>
    </div>
  );
  const stats = (
    <div className="nw-stats">
      {STATS.map(([t, s, n, ic, art, on], i) => {
        const dark = v === 4 || (v === 3 && i === 0);
        return (
          <div key={t} className={`nw-stat${on && !dark ? " on" : ""}${dark ? " dark" : ""}`}>
            <span className="ico"><Icon name={ic} /></span>
            <div>
              <b>{t}</b>
              <small>{s}</small>
            </div>
            <span className="n">{n}</span>
            {dark && <Art name={art} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="nw">
      <aside className="nw-side">
        <div className="nw-brand">
          <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 22 13 3l10 19M8.5 17.5 13 22l4.5-4.5" />
          </svg>
          Merlin
        </div>
        {NAV.map((g, i) => (
          <div className="nw-nav" key={i}>
            {g.h && <h4>{g.h}</h4>}
            {g.items.map(([label, icon, n, on]) => (
              <a key={label} href="#" className={on ? "on" : undefined}>
                <Icon name={icon} />
                {label}
                {n && (n.startsWith("b") ? <b>{n.slice(1)}</b> : <em>{n}</em>)}
              </a>
            ))}
          </div>
        ))}
        <div className={`nw-side-foot${lineRail ? " line" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lineRail ? "/brand/net/scene-rotunda.svg" : "/brand/landscape/rail-night.svg"} alt="" />
          <div className="nw-me">
            <span>MH</span>
            <div>
              <b>Morgan Hale</b>
              <small>Fractional RevOps</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="nw-main">
        {v === 5 ? (
          <section className="dark v-hero">
            <Art name="scene-arcade" />
            {top}
            <div className="nw-head">{title}</div>
            {stats}
          </section>
        ) : (
          <>
            {top}
            {v === 1 ? (
              <section className="dark v-band">
                <Art name="scene-terraces" />
                <div style={{ position: "relative" }}>{title}</div>
              </section>
            ) : (
              <div className="nw-head">
                {title}
                {v === 9 ? (
                  <div className="dark v-window"><Art name="spot-beacon" /></div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="land" src="/brand/landscape/banner-company.svg" alt="" />
                )}
              </div>
            )}
            {v === 8 && (
              <section className="dark v-arcade">
                <div>
                  <span className="nw-eyebrow">12 CONTACTS, 12 DOORS</span>
                  <p style={{ marginTop: 6, color: "var(--dim)" }}>Seven lead somewhere today. Two go through someone you both know.</p>
                </div>
                <Arcade />
              </section>
            )}
            {stats}
          </>
        )}

        <div className="nw-body">
          <div>
            <div className="nw-tabs">
              <a className="on" href="#">Opportunities (7)</a>
              <a href="#">All contacts (12)</a>
              <a href="#">Companies (6)</a>
            </div>
            <div className="nw-chips">
              {["Hiring now (3)", "Emerging demand (4)", "Strong (4)", "Fading (1)", "My relationships"].map((c) => (
                <span className="nw-chip" key={c}>{c}</span>
              ))}
            </div>
            <div className="nw-list">
              {PEOPLE.map((p, i) => (
                <div key={p.i}>
                  <div className={`nw-row${i === 0 && v !== 6 ? " sel" : ""}${i === 0 && v === 6 ? " dark" : ""}`} style={i === 0 && v === 6 ? { borderBottom: 0, borderRadius: 0 } : undefined}>
                    <span className="nw-av" style={{ background: p.c, color: "#17241e" }}>{p.i}</span>
                    <div>
                      <h3>{p.name}</h3>
                      <span className="dim">{p.role}</span>
                    </div>
                    <div className="dim">
                      {p.how}
                      <div>{p.last}</div>
                    </div>
                    <div>
                      <div className="nw-co"><span className="nw-logo" style={{ background: p.lc }} />{p.co}</div>
                      <span className={`nw-pill ${p.pill}`}>{p.pill === "hire" ? "Hiring now" : "Emerging demand"}</span>
                      <div className="dim">{p.note}</div>
                    </div>
                    <a className={`nw-btn small${p.primary ? "" : " ghost"}`} href="#">{p.act}</a>
                  </div>
                  {i === 0 && v === 6 && (
                    <div className="dark v-open">
                      <Art name="band-companies" />
                      <div style={{ position: "relative" }}>
                        <span className="nw-eyebrow">THE WAY IN</span>
                        <div className="nw-route" style={css({ marginBottom: 12 })}>
                          <div className="nw-stop"><i style={{ background: "#0e3329", color: "#fff", boxShadow: "0 0 0 2px #c9f03d inset" }}>MH</i><b>You</b></div>
                          <span className="seg" />
                          <div className="nw-stop"><i style={{ background: "#e9dff5", color: "#17241e" }}>RI</i><b>Rosa Iqbal</b><span>Worked together</span></div>
                          <span className="seg" />
                          <div className="nw-stop"><i style={{ background: "#fbefc2", color: "#17241e" }}>CL</i><b>Copperlane</b><span>Hiring a RevOps advisor</span></div>
                        </div>
                        <a className="nw-btn small" href="#">Request an intro from Rosa</a>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {v === 7 ? (
            <aside className="dark v-rightdark">
              <Art name="scene-rotunda" />
              <div style={{ position: "relative" }}>
                <div style={{ height: 190 }} />
                <NextMove />
                <hr />
                <Glance />
              </div>
            </aside>
          ) : (
            <aside style={{ display: "grid", gap: 16 }}>
              <section className={`nw-card${v === 2 ? " dark" : ""}`}>
                <NextMove>{v === 2 && <div className="v-next-art"><Art name="spot-bridge" /></div>}</NextMove>
              </section>
              <section className="nw-card">
                <Glance />
              </section>
            </aside>
          )}
        </div>

        {v === 10 && (
          <section className="dark v-close">
            <Art name="scene-summit" />
            <div style={{ position: "relative" }}>
              <span className="nw-eyebrow">ONE STEP AT A TIME</span>
              <h2>Six fellow fractionals can introduce you at your targets.</h2>
              <p>Only members who opted in are counted. Ask one, and the next door is a conversation away.</p>
              <a className="nw-btn" href="#">See who can introduce you</a>
            </div>
          </section>
        )}
      </main>

      <nav className="nw-pick" aria-label="Versions">
        <Link href="/brand/mockups/network">All</Link>
        {VERSIONS.map((x) => (
          <Link key={x.v} href={`/brand/mockups/network/${x.v}`} className={x.v === v ? "on" : undefined}>{x.v}</Link>
        ))}
      </nav>
    </div>
  );
}
