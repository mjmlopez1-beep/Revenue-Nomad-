import { Art, Lock, Logo, Route, Shell, type MockTheme } from "../Shell";

const SEATS = [
  { seat: "Fractional VP Sales", by: "Dana R.", member: true, start: "Oct 2025", end: <Lock>1 credit</Lock>, hours: "20 a week", rate: <Lock>1 credit</Lock>, why: "First sales leader", via: <Lock>1 credit</Lock> },
  { seat: "Fractional CMO", by: "Lena K.", member: true, start: "Mar 2025", end: "Active", hours: "12 a week", rate: "$9,000 a month", why: "New product launch", via: "Referral" },
  { seat: "Fractional RevOps Lead", by: "Not named yet", member: false, start: "Jan 2024", end: "Dec 2024", hours: "8 a week", rate: <Lock>1 credit</Lock>, why: "CRM rebuild", via: <Lock>1 credit</Lock> },
];

const PEOPLE = [
  { name: "Ava Whitcombe", title: "CEO", rel: "Decision maker", email: <Lock>1 credit</Lock>, phone: <Lock>1 credit</Lock>, know: "Dana reported to her" },
  { name: <Lock>Name and title · 1 credit</Lock>, title: "", rel: "Hiring for the seat", email: <span className="mk-dim">After the name</span>, phone: <span className="mk-dim">After the name</span>, know: "Nobody named yet" },
  { name: <Lock>Name and title · 1 credit</Lock>, title: "", rel: "Reported to", email: <span className="mk-dim">After the name</span>, phone: <span className="mk-dim">After the name</span>, know: "Lena works with them" },
];

export default function Company({ theme }: { theme: MockTheme }) {
  return (
    <Shell theme={theme} active="company" crumb={<>Companies / Larkspur Learning <span style={{ marginLeft: 12, fontWeight: 400 }}>3 of 64</span></>}>
      <div className="mk-page">
        <div className="mk-cohead">
          <Logo name="Larkspur Learning" size="lg" />
          <div style={{ flex: 1 }}>
            <h1>Larkspur Learning</h1>
            <div className="mk-facts">EdTech · $10M-$20M · 51-200 people · Austin, United States</div>
          </div>
          <span className="mk-pill">Stage · Not in pipeline</span>
          <a className="mk-btn ghost" href="#">Follow</a>
          <a className="mk-btn" href="#">Add to pipeline</a>
        </div>

        <div className="mk-tabs">
          {["Overview", "Seats", "People", "Ways in", "Open roles", "Notes and activity", "Deal"].map((t, i) => (
            <a key={t} href="#" className={i === 0 ? "on" : undefined}>{t}</a>
          ))}
        </div>

        <div className="mk-grid main-aside">
          <div className="mk-stack">
            <section className="mk-card tint-lilac">
              <div className="mk-card-head">
                <h3>Your way in</h3>
                <span className="mk-pill lime">Strong</span>
              </div>
              <Route via="Dana R." viaNote="Held the Fractional VP Sales seat · On Merlin" to="Ava Whitcombe" toNote="CEO · Decision maker" />
              <div className="mk-row" style={{ marginTop: 20 }}>
                <a className="mk-btn" href="#">Ask for an intro</a>
                <a className="mk-btn ghost" href="#">Compare the routes</a>
                <span className="mk-dim">Their email · 1 credit</span>
              </div>
            </section>

            <section className="mk-card">
              <div className="mk-card-head">
                <h3>Why it fits you</h3>
                <span className="mk-pill lime">Likely to hire · High</span>
              </div>
              <p className="mk-dim">
                Same size and industry as two of your past clients. Their fractional VP Sales seat
                ended last month, and no sales leader is on the team page.
              </p>
            </section>

            <section className="mk-card">
              <div className="mk-card-head">
                <h3>Fractional seats <span className="mk-dim">3</span></h3>
                <a href="#">Unlock all 6 locked facts here</a>
              </div>
              <table className="mk-table">
                <thead>
                  <tr>{["Seat", "Held by", "Start", "End", "Hours", "Rate", "Why hired", "Sourced via"].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {SEATS.map((s) => (
                    <tr key={s.seat}>
                      <td style={{ fontWeight: 700 }}>{s.seat}</td>
                      <td>
                        {s.by} {s.member && <span className="mk-pill lime" style={{ marginLeft: 4 }}>Member</span>}
                      </td>
                      <td className="mk-dim">{s.start}</td>
                      <td>{s.end}</td>
                      <td className="mk-dim">{s.hours}</td>
                      <td>{s.rate}</td>
                      <td className="mk-dim">{s.why}</td>
                      <td>{s.via}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mk-card">
              <div className="mk-card-head">
                <h3>Who decides here <span className="mk-dim">3</span></h3>
              </div>
              <table className="mk-table">
                <thead>
                  <tr>{["Name and title", "Relationship", "Email", "Phone", "How you know them"].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {PEOPLE.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <b>{p.name}</b>
                        {p.title && <div className="mk-dim" style={{ fontSize: 12.5 }}>{p.title}</div>}
                      </td>
                      <td><span className="mk-pill">{p.rel}</span></td>
                      <td>{p.email}</td>
                      <td>{p.phone}</td>
                      <td className="mk-dim">{p.know}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mk-dim" style={{ marginTop: 12, fontSize: 13 }}>
                A name and title are 1 credit together. Email, phone and public profile are 1 credit each, after the name.
              </p>
            </section>

            <section className="mk-card">
              <div className="mk-card-head"><h3>What opens, and what stays locked</h3></div>
              <div className="mk-gate">
                <Art theme={theme} land="spot-gate" blend="spot-guide-door" />
                <div>
                  <h4>Free, showing now</h4>
                  <ul>
                    <li>Industry, size, revenue, HQ region</li>
                    <li>Functions hired, and when</li>
                    <li>Each seat&apos;s start, hours and why</li>
                    <li>Open roles: title and date listed</li>
                  </ul>
                </div>
                <div>
                  <h4>Opened with the company <span className="mk-pill gold" style={{ marginLeft: 6 }}>2 credits</span></h4>
                  <ul>
                    <li>Its name, website and logo</li>
                    <li>Who held each seat, and their role</li>
                    <li>Job postings, with rate and hours</li>
                  </ul>
                </div>
                <div>
                  <h4>Still locked after that</h4>
                  <ul>
                    <li>A decision maker&apos;s name and title</li>
                    <li>Their email, phone or profile link</li>
                    <li>What a seat paid, how it was found</li>
                    <li>The end date of a seat that ended</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <aside className="mk-stack">
            {theme === "color" && <Art theme={theme} land="banner-bridge" className="mk-asideart" />}
            <section className="mk-card forest">
              <span className="mk-eyebrow">Your next move</span>
              <h3 style={{ fontSize: 19, margin: "8px 0" }}>Message Dana</h3>
              <p className="mk-dim">She held the seat until last month and is on Merlin. Ask what the team needs next.</p>
              <div className="mk-row" style={{ marginTop: 14 }}>
                <a className="mk-btn small" href="#">Draft a note</a>
                <a className="mk-btn ghost small" href="#">Snooze</a>
              </div>
            </section>
            <section className="mk-card">
              <div className="mk-card-head"><h3>Open roles</h3><span className="mk-pill gold">1 open</span></div>
              <b>Fractional VP Sales</b>
              <div className="mk-dim" style={{ fontSize: 13, margin: "4px 0 10px" }}>Open since Nov 3 · 20 hours a week · No rate posted</div>
              <a className="mk-btn ghost small" href="#">Job posting</a>
            </section>
            <section className="mk-card">
              <div className="mk-card-head"><h3>Add what you know</h3><span className="mk-pill ame">Earns credits</span></div>
              <div className="mk-list mk-dim">
                <div className="mk-row between">Average deal size <a className="mk-pill" href="#">+1</a></div>
                <div className="mk-row between">Sales motion <a className="mk-pill" href="#">+1</a></div>
                <div className="mk-row between">A person who decides <a className="mk-pill" href="#">+1</a></div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
