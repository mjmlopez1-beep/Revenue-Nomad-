import type { Metadata } from "next";
import type React from "react";
import { Icon } from "../../Shell";
import "../re.css";

export const metadata: Metadata = { title: "Merlin mockup: Companies, reimagined" };

/* 64 companies as 64 doors, in two tiers of 32. o = a door you can reach,
   h = also hiring now, l = locked, . = known but no way in yet. */
const TIERS = ["..o...l....o..l...o...h....l..l.", ".l....o..l..l..o....h.l...o...o."];

const css = (v: Record<string, string | number>) => v as React.CSSProperties;

function Arcade() {
  const W = 1280;
  const dw = W / 32;
  const tierH = 92;
  const ground = 2 * tierH + 6;
  let lit = 0;
  const doors: React.ReactNode[] = [];
  const drops: string[] = [];
  TIERS.forEach((row, t) => {
    [...row].forEach((ch, i) => {
      const x = i * dw + dw * 0.2;
      const w = dw * 0.6;
      const base = (t + 1) * tierH;
      const top = base - tierH * 0.74;
      const d = `M${x} ${base}V${top + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${base}Z`;
      const open = ch === "o" || ch === "h";
      doors.push(<path key={`${t}-${i}`} d={d} className={`door${open ? " open" : ""}${ch === "h" ? " hiring" : ""}${ch === "l" ? " locked" : ""}`} style={open ? css({ "--i": lit++ }) : undefined} />);
      if (open) drops.push(`M${x + w / 2} ${ground}V${base - 4}`);
    });
  });
  return (
    <svg className="re-arcade" viewBox={`0 -8 ${W} ${ground + 30}`} role="img" aria-label="64 companies drawn as an arcade of doors. Nine are lit.">
      <path d={`M0 0H${W}M0 ${tierH}H${W}M0 ${2 * tierH}H${W}`} stroke="rgba(255,255,255,.5)" strokeWidth="1.5" />
      <path d={Array.from({ length: 33 }, (_, i) => `M${i * dw} 0V${2 * tierH}`).join("")} stroke="rgba(255,255,255,.16)" strokeWidth="1" />
      {doors}
      <path className="path" d={`M10 ${ground}H${W - 30} ${drops.join(" ")}`} />
      <circle cx="10" cy={ground} r="9" fill="#04261d" stroke="#2ee59d" strokeWidth="5" />
    </svg>
  );
}

function Door() {
  return (
    <svg className="re-door" viewBox="0 0 34 52" aria-hidden="true">
      <path d="M2 51V17a15 15 0 0 1 30 0V51Z" />
    </svg>
  );
}

interface Row {
  name?: string;
  meta: string;
  hiring?: boolean;
  seat: string;
  held: string;
  via?: string;
  rel?: string;
  open?: boolean;
}
const ROWS: Row[] = [
  { name: "Larkspur Learning", meta: "EDTECH · 51-200 · AUSTIN", hiring: true, seat: "Fractional VP Sales", held: "Held by Dana R., ended last month", via: "Dana", rel: "held the seat", open: true },
  { name: "Northwind Clinics", meta: "HEALTH CARE · 201-500 · DENVER", seat: "Fractional VP Sales", held: "Seat holder locked · 1 credit", via: "Priya", rel: "fellow fractional" },
  { name: "Cedar and Pine", meta: "SOFTWARE · 51-200 · PORTLAND", seat: "Fractional CMO", held: "Held by Lena K., active", via: "Lena", rel: "works with them" },
  { meta: "SOFTWARE · 201-500 · UNITED STATES", seat: "Fractional CRO", held: "Opens with the company" },
  { name: "Halcyon Freight", meta: "FREIGHT · 201-500 · CHICAGO", seat: "Fractional CRO", held: "Seat holder locked · 1 credit", via: "Marcus", rel: "reported to the CEO" },
  { name: "Kestrel Analytics", meta: "SAAS · 51-200 · TORONTO", seat: "Fractional VP Sales", held: "Not named yet" },
  { name: "Tallgrass Foods", meta: "FOOD · 201-500 · OMAHA", seat: "Fractional CFO", held: "Seat holder locked · 1 credit", via: "Sam", rel: "fellow fractional" },
  { name: "Osprey Legal", meta: "LEGAL SERVICES · 11-50 · BOSTON", seat: "Fractional VP Sales", held: "Not named yet" },
];

export default function CompaniesReimagined() {
  return (
    <div className="re">
      <aside className="re-rail">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/adapt/merlin-lockup-white.svg" alt="Merlin" />
        {["home", "find", "companies", "people", "crystal", "hiring", "paths", "pipeline", "proposals", "fractionals", "messages"].map((n) => (
          <a key={n} href="#" className={n === "companies" ? "on" : undefined} aria-label={n}>
            <Icon name={n} />
            {n === "hiring" && <i />}
          </a>
        ))}
        <span className="me">JS</span>
      </aside>

      <div>
        <header className="re-top">
          <span className="crumb">Data / <b>Companies</b></span>
          <span className="re-cmd">
            <b>&gt;</b> SaaS companies under 500 people with a seat that ended, with who decides
            <kbd>/</kbd>
          </span>
          <span className="re-credits"><i />25 credits</span>
          <a className="re-btn" href="#">+ Add what you know</a>
        </header>

        <section className="re-hero">
          <h1>
            <span>64 doors.</span>
            <span><em>9</em> are open</span>
            <span className="thin">to you.</span>
          </h1>
          <div className="re-key">
            <div><span className="re-ring" style={css({ "--c": "var(--saffron)", background: "var(--glow)" })} />A door you can reach <b className="num">09</b></div>
            <div><span className="re-ring" style={css({ "--c": "var(--ember)" })} />Hiring now <b>02</b></div>
            <div><span className="re-ring" style={css({ "--c": "rgba(255,255,255,.5)" })} />No way in yet <b>47</b></div>
            <div><span className="re-ring" style={css({ "--c": "rgba(255,255,255,.3)", borderStyle: "dashed" })} />Locked <b>08</b></div>
          </div>
        </section>
        <div style={{ padding: "0 40px 28px" }}>
          <Arcade />
        </div>

        <nav className="re-filters">
          <a className="on" href="#">Your ideal client</a>
          <a href="#">Sales</a>
          <a href="#">Recently hired</a>
          <a href="#">Open roles</a>
          <a href="#">Industry</a>
          <a href="#">Size</a>
          <a className="via" href="#">Where you know someone · 9</a>
          <span className="sp" />
          <span className="mono" style={{ color: "var(--faint)" }}>SORT · CLOSEST DOOR FIRST</span>
          <a className="re-btn ghost" href="#">Save view with an alert</a>
        </nav>

        <main>
          {ROWS.map((r, i) => (
            <article key={i} className={`re-row${r.via ? " routed" : ""}${r.name ? "" : " locked"}${r.open ? " open-row" : ""}`}>
              <span className="re-spine" />
              <Door />
              <span className="re-idx mono">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="re-name">
                  {r.name || "Locked company"}
                  {r.hiring && <span className="re-tag">Hiring</span>}
                </div>
                <div className="re-meta mono">{r.meta}</div>
              </div>
              <div className="re-seat">
                <b>{r.seat}</b>
                <span>{r.held}</span>
              </div>
              {r.via ? (
                <div className="re-via">
                  <span className="re-ring" style={css({ "--c": "var(--violet)" })} />
                  <span><b>{r.via}</b> <span>{r.rel}</span></span>
                </div>
              ) : r.name ? (
                <div className="re-none">No one yet. <a href="#">Bring in who you know</a></div>
              ) : (
                <div className="re-none"><a href="#">Unlock · 2 credits</a></div>
              )}
              <span className="re-go">→</span>

              {r.open && (
                <div className="re-open">
                  <div>
                    <div className="re-route">
                      <div className="re-stop">
                        <span className="re-ring" style={css({ "--c": "var(--volt)" })} />
                        <b>You</b>
                        <span>Fractional VP Sales</span>
                      </div>
                      <span className="seg" />
                      <div className="re-stop">
                        <span className="re-ring" style={css({ "--c": "var(--violet)" })} />
                        <b>Dana R.</b>
                        <span>Held this seat until last month. On Merlin.</span>
                      </div>
                      <span className="seg" />
                      <div className="re-stop">
                        <span className="re-ring" style={css({ "--c": "var(--saffron)", background: "var(--glow)" })} />
                        <b>Ava Whitcombe</b>
                        <span>CEO. Decides on the seat.</span>
                      </div>
                    </div>
                    <div className="acts">
                      <a className="re-btn" href="#">Ask Dana for an intro</a>
                      <a className="re-btn ghost" href="#">Open the company</a>
                      <a className="re-btn ghost" href="#">Add to pipeline</a>
                    </div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/adapt/card-door.svg" alt="" />
                </div>
              )}
            </article>
          ))}
        </main>

        <footer className="re-foot">
          <a className="on" href="#">Companies · 64</a>
          <a href="#">People at these companies · 212</a>
          <a href="#">Seats at these companies · 97</a>
          <span className="sp" />
          <span className="mono">08 OF 64 · 38 OF 40 COMPANIES LEFT TODAY</span>
        </footer>
      </div>
    </div>
  );
}
