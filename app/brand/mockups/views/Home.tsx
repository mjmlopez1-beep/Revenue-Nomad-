import { Art, Icon, Logo, Route, Shell, type MockTheme } from "../Shell";

const MOVES = [
  {
    band: "Likely to hire · High", tone: "lime", name: "Larkspur Learning", facts: "EdTech · $10M-$20M · 51-200 people",
    why: "Their fractional VP Sales seat ended last month and no leader is on the team page.",
    via: "Dana", viaNote: "Held the seat · On Merlin", to: "CEO", toNote: "Decides", move: "Message Dana", second: "See who held it · 1 credit",
  },
  {
    band: "Hiring now · Open role", tone: "gold", name: "Northwind Clinics", facts: "Health Care · $20M-$50M · 201-500 people",
    why: "Fractional VP Sales, open since Nov 3. Strong fit to your past clients.",
    via: "Priya", viaNote: "Fellow fractional · On Merlin", to: "COO", toNote: "Hiring for the seat", move: "Reply to the open role", second: "Ask for an intro",
  },
  {
    band: "Likely to hire · Medium", tone: "ame", name: "Kestrel Analytics", facts: "SaaS · $10M-$20M · 51-200 people",
    why: "Raised money in September and has hired fractionals before.",
    via: "Nobody named yet", viaNote: "Not on Merlin yet", to: "CRO", toNote: "Decides", move: "Bring in who you know", second: "Open free · 1 left today",
  },
];

const LISTS = [
  ["SaaS, lost a sales leader", "Companies", "18", "3", "72%", "On", "Today"],
  ["Sales roles open now", "Seats", "6", "2", "88%", "On", "Yesterday"],
  ["Past clients, lookalikes", "Companies", "41", "0", "64%", "Off", "Nov 21"],
];

export default function Home({ theme }: { theme: MockTheme }) {
  return (
    <Shell theme={theme} active="home" crumb="Home">
      <div className="mk-page">
        <div className="mk-page-head">
          <div>
            <h1>Good morning, Jane</h1>
            <p>Three moves for today. About 6 minutes.</p>
          </div>
          <Art theme={theme} land="banner-trailhead" blend="spot-guide" className="mk-headart" />
        </div>
        <div className="mk-since">
          <span className="mk-pill">This week</span>
          <span className="mk-pill lime"><span className="mk-dot" />4 new in Crystal Ball</span>
          <span className="mk-pill gold"><span className="mk-dot" />2 Sales roles opened</span>
          <span className="mk-pill ame">1 unread message</span>
        </div>

        <div className="mk-stack">
          <div className="mk-askbig">
            <Icon name="spark" />
            <span>Find SaaS companies that just lost a fractional sales leader, and show me who I know there</span>
            <a className="mk-btn ghost small" href="#">Find more like my past clients</a>
          </div>

          <div className="mk-grid main-aside">
            <section className="mk-card">
              <div className="mk-card-head">
                <div>
                  <h3>Your three moves today</h3>
                  <span className="mk-dim">3 things to do · most urgent first</span>
                </div>
                <div className="mk-row">
                  <a href="#">Pipeline · 4 deals</a>
                  <a href="#">Your Crystal Ball · 14</a>
                </div>
              </div>
              <div className="mk-list">
                {MOVES.map((m) => (
                  <div className="mk-move" key={m.name}>
                    <div>
                      <span className={`mk-pill ${m.tone}`}>{m.band}</span>
                      <div className="mk-co" style={{ marginTop: 10 }}>
                        <Logo name={m.name} />
                        <div>
                          {m.name}
                          <small>{m.facts}</small>
                        </div>
                      </div>
                      <p className="why">{m.why}</p>
                    </div>
                    <div>
                      <div className="mk-eyebrow" style={{ marginBottom: 10, color: "var(--mk-faint)" }}>Your way in</div>
                      <Route via={m.via} viaNote={m.viaNote} to={m.to} toNote={m.toNote} />
                    </div>
                    <div className="acts">
                      <a className="mk-btn small" href="#">{m.move}</a>
                      <a className="mk-btn ghost small" href="#">{m.second}</a>
                      <span className="mk-dim" style={{ fontSize: 12.5, textAlign: "center" }}>Mark as done · Snooze</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mk-stack">
              <section className="mk-card mk-started tint-lilac">
                <Art theme={theme} land="spot-walker" blend="spot-guide-door" />
                <div>
                  <div className="mk-row between">
                    <h3 style={{ fontSize: 16 }}>Getting started</h3>
                    <span className="mk-dim" style={{ fontSize: 12.5 }}>3 of 6 done</span>
                  </div>
                  <div className="mk-bar"><i style={{ width: "50%" }} /></div>
                  <p className="mk-dim" style={{ margin: "10px 0" }}>Next: Add the seats you have held. Earns credits.</p>
                  <a className="mk-btn small" href="#">Add a seat</a>
                </div>
              </section>
              <section className="mk-card">
                <div className="mk-card-head"><h3>Quick starts</h3></div>
                <div className="mk-list">
                  {[["find", "Find companies"], ["crystal", "Your Crystal Ball"], ["people", "Bring in who you know"], ["proposals", "Start a proposal"], ["fractionals", "Fractionals"]].map(([i, l]) => (
                    <div className="mk-row" key={l}>
                      <span style={{ width: 16, height: 16, display: "inline-flex", color: "var(--ml-lime)" }}><Icon name={i} /></span>
                      {l}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <section className="mk-card">
            <div className="mk-card-head"><h3>Your market, from found to won</h3></div>
            <div className="mk-funnel">
              {[["412", "In your market", 100], ["64", "Opened", 62], ["9", "With a way in", 34], ["4", "In your pipeline", 18], ["1", "Won", 8]].map(([n, l, w]) => (
                <div key={l as string}>
                  <b>{n}</b>
                  <span>{l}</span>
                  <i style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          </section>

          <section className="mk-card">
            <div className="mk-card-head">
              <h3>Your lists</h3>
              <a className="mk-btn ghost small" href="#">New list</a>
            </div>
            <table className="mk-table">
              <thead>
                <tr>{["Name", "Holds", "Rows", "New", "Filled in", "Alert", "Opened"].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {LISTS.map((r) => (
                  <tr key={r[0]}>
                    <td style={{ fontWeight: 700 }}>{r[0]}</td>
                    <td className="mk-dim">{r[1]}</td>
                    <td>{r[2]}</td>
                    <td>{r[3] !== "0" ? <span className="mk-pill lime">{r[3]} new</span> : <span className="mk-dim">0</span>}</td>
                    <td className="mk-dim">{r[4]}</td>
                    <td>{r[5]}</td>
                    <td className="mk-dim">{r[6]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </Shell>
  );
}
