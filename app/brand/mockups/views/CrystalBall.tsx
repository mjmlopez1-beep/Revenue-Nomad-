import Illustration from "../../Illustration";
import { Logo, Route, Shell, artOf, type MockTheme } from "../Shell";

const ROWS: { name: string; facts: string; band: "High" | "Medium" | "Low"; why: string[]; when: string; move: string; way: string; sel?: boolean }[] = [
  { name: "Larkspur Learning", facts: "EdTech · $10M-$20M", band: "High", why: ["Fractional seat ended", "No leader on their team page"], when: "Today", move: "Message Dana", way: "Dana held the seat", sel: true },
  { name: "Northwind Clinics", facts: "Health Care · $20M-$50M", band: "High", why: ["Open role", "Hired fractionals before"], when: "2 days ago", move: "Reply to the open role", way: "Priya, fellow fractional" },
  { name: "Halcyon Freight", facts: "Freight · $20M-$50M", band: "High", why: ["Leader left", "Team hiring"], when: "3 days ago", move: "Ask for an intro", way: "Marcus reported to the CEO" },
  { name: "Kestrel Analytics", facts: "SaaS · $10M-$20M", band: "Medium", why: ["Raised money", "Hired fractionals before"], when: "This week", move: "Bring in who you know", way: "Nobody named yet" },
  { name: "Redwood Pay", facts: "Fintech · $10M-$20M", band: "Medium", why: ["Seat at 12 months"], when: "This week", move: "See who held it · 1 credit", way: "Opens after the company" },
  { name: "Fernhill Software", facts: "Software · $20M-$50M", band: "Medium", why: ["New leader", "Growing"], when: "Last week", move: "Draft a note", way: "Lena, fellow fractional" },
  { name: "Osprey Legal", facts: "Legal services · $10M-$20M", band: "Low", why: ["Growing"], when: "Last week", move: "Open free · 1 left today", way: "Nobody named yet" },
  { name: "Tallgrass Foods", facts: "Food · $20M-$50M", band: "Low", why: ["Hired a fractional"], when: "Nov 14", move: "Unlock · 2 credits", way: "Opens after the company" },
];

const TONE: Record<string, string> = {
  "Open role": "gold",
  "Fractional seat ended": "terra",
  "Leader left": "terra",
  "No leader on their team page": "terra",
  "Raised money": "ame",
  "New leader": "ame",
  "Hired fractionals before": "lime",
  "Hired a fractional": "lime",
  "Seat at 12 months": "lime",
};

function Likely({ band }: { band: "High" | "Medium" | "Low" }) {
  const n = band === "High" ? 3 : band === "Medium" ? 2 : 1;
  return (
    <span style={{ whiteSpace: "nowrap", fontWeight: 700 }}>
      <span className="mk-likely">
        {[8, 12, 16].map((h, i) => (
          <i key={h} className={i < n ? "f" : undefined} style={{ height: h }} />
        ))}
      </span>
      {band}
    </span>
  );
}

export default function CrystalBall({ theme }: { theme: MockTheme }) {
  const art = artOf(theme);
  return (
    <Shell theme={theme} active="crystal-ball" crumb="Signals / Crystal Ball">
      <div className="mk-page">
        <div className="mk-page-head">
          <div>
            <h1>Your Crystal Ball</h1>
            <p>14 companies likely to hire a fractional Sales leader next.</p>
          </div>
          <Illustration theme={art} name="spot-beacon" alt="" className="mk-headart" />
        </div>

        <div className="mk-bands">
          <div className="on t-mint"><span className="mk-dim">High</span><b>5</b></div>
          <div className="t-gold"><span className="mk-dim">Medium</span><b>6</b></div>
          <div className="t-lilac"><span className="mk-dim">Low</span><b>3</b></div>
          <div style={{ flex: 2, display: "flex", alignItems: "center" }} className="mk-dim">High and Medium come by email. Low shows only here.</div>
        </div>

        <div className="mk-grid main-aside">
          <section className="mk-card" style={{ padding: "14px 8px 6px" }}>
            <div className="mk-toolbar" style={{ padding: "0 12px" }}>
              <span className="mk-pill">Sort: Most likely first</span>
              <span className="mk-pill">Today</span>
              <span className="mk-pill lime">Last 7 days</span>
              <span className="mk-pill">Last 30 days</span>
              <span className="mk-pill">Where you know someone</span>
              <span style={{ flex: 1 }} />
              <a className="mk-btn ghost small" href="#">Tune</a>
            </div>
            <table className="mk-table">
              <thead>
                <tr>{["Company", "Likely", "Why now", "When", "Your move and way in"].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.name} className={r.sel ? "sel" : undefined}>
                    <td>
                      <div className="mk-co">
                        <Logo name={r.name} size="sm" />
                        <div>
                          {r.name}
                          <small>{r.facts}</small>
                        </div>
                      </div>
                    </td>
                    <td><Likely band={r.band} /></td>
                    <td>
                      <div className="mk-sigs">
                        {r.why.map((w) => <span className={`mk-pill ${TONE[w] || ""}`} key={w}>{w}</span>)}
                      </div>
                    </td>
                    <td className="mk-dim mk-nowrap">{r.when}</td>
                    <td>
                      <b>{r.move}</b>
                      <div className="mk-dim" style={{ fontSize: 12.5 }}>{r.way}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <aside className="mk-card">
            <div className="mk-tabs" style={{ marginBottom: 16 }}>
              <a className="on" href="#">Why it is here</a>
              <a href="#">Tune</a>
            </div>
            <div className="mk-co" style={{ marginBottom: 16 }}>
              <Logo name="Larkspur Learning" />
              <div>
                Larkspur Learning
                <small>EdTech · $10M-$20M · 51-200 people</small>
              </div>
            </div>
            <div className="mk-eyebrow" style={{ marginBottom: 10, color: "var(--mk-faint)" }}>What put it here</div>
            <div className="mk-timeline">
              <div><small>12 months ago</small>Hired a fractional VP Sales</div>
              <div><small>6 months ago</small>Raised money</div>
              <div><small>Last month</small>Fractional seat ended</div>
              <div><small>Today</small>No leader on their team page</div>
            </div>
            <p style={{ margin: "6px 0 18px" }}><b>Fit.</b> <span className="mk-dim">Same size and industry as two of your past clients.</span></p>
            <div className="mk-eyebrow" style={{ marginBottom: 12, color: "var(--mk-faint)" }}>Your way in</div>
            <Route via="Dana" viaNote="Held the seat" to="CEO" toNote="Decides" />
            <div className="mk-wrap-row" style={{ marginTop: 20 }}>
              <a className="mk-btn" href="#">Message Dana</a>
              <a className="mk-btn ghost" href="#">Open free · 1 left today</a>
            </div>
            <p className="mk-dim" style={{ marginTop: 16, fontSize: 13 }}>Why not Larkspur Learning?</p>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
