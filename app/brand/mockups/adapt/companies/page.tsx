import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Icon } from "../../Shell";
import "../adapt.css";

export const metadata: Metadata = { title: "Merlin mockup: Companies, adapted" };

const NAV: { heading?: string; items: { label: string; icon: string; count?: string; hot?: string; tag?: string; via?: string; on?: boolean }[] }[] = [
  { items: [{ label: "Home", icon: "home" }, { label: "Find", icon: "find" }] },
  { heading: "Data", items: [{ label: "Companies", icon: "companies", count: "64", on: true }, { label: "People", icon: "people", count: "212" }, { label: "Seats", icon: "seats", count: "97" }] },
  { heading: "Signals", items: [{ label: "Crystal Ball", icon: "crystal", count: "14" }, { label: "Hiring now", icon: "hiring", hot: "6" }, { label: "Warm paths", icon: "paths", via: "9" }] },
  { heading: "Close", items: [{ label: "Pipeline", icon: "pipeline", count: "4" }, { label: "Proposals", icon: "proposals", count: "2" }, { label: "Contracts", icon: "contracts", tag: "New" }, { label: "Evidence Bank", icon: "evidence", tag: "New" }] },
  { heading: "Community", items: [{ label: "Fractionals", icon: "fractionals", via: "38" }, { label: "Messages", icon: "messages", count: "1" }] },
  { heading: "Workspace", items: [{ label: "Rate benchmarks", icon: "rates" }, { label: "Credits and usage", icon: "credits", count: "25" }, { label: "Settings", icon: "settings" }] },
];

function Lock({ children = "1 credit" }: { children?: ReactNode }) {
  return (
    <span className="ad-chip lock">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="2" y="5.2" width="8" height="5.6" rx="1.2" />
        <path d="M4 5.2V3.8a2 2 0 0 1 4 0v1.4" />
      </svg>
      {children}
    </span>
  );
}

/** You, the person in between, who decides. Violet marks the person in between. */
function Way({ via, note }: { via?: string; note: string }) {
  return (
    <span className="ad-way">
      <span className="track">
        <span className="ad-ring" style={{ "--c": "var(--volt)" } as React.CSSProperties} />
        <i className={via ? undefined : "off"} />
        <span className={`ad-ring${via ? "" : " off"}`} style={{ "--c": "var(--violet)" } as React.CSSProperties} />
        <i className={via ? undefined : "off"} />
        <span className={`ad-ring${via ? "" : " off"}`} style={{ "--c": "var(--saffron)" } as React.CSSProperties} />
      </span>
      {via ? (
        <span className="ad-chip via">{via} · {note}</span>
      ) : (
        <span className="ad-chip missing">Nobody named yet</span>
      )}
    </span>
  );
}

interface Row {
  name?: string;
  site?: string;
  facts?: string;
  hiring?: boolean;
  held: ReactNode;
  seat: string;
  fns: string[];
  industry: string;
  emp: string;
  hq: string;
  via?: string;
  note: string;
  history: string;
  sel?: boolean;
}

const ROWS: Row[] = [
  { name: "Larkspur Learning", site: "larkspurlearning.com", hiring: true, held: <>Dana R. <span className="ad-chip volt">Member</span></>, seat: "Fractional VP Sales", fns: ["Sales", "Marketing"], industry: "EdTech", emp: "51-200", hq: "Austin, US", via: "Dana", note: "held the seat", history: "3 seats since 2024", sel: true },
  { name: "Northwind Clinics", site: "northwindclinics.com", held: <Lock />, seat: "Fractional VP Sales", fns: ["Sales"], industry: "Health Care", emp: "201-500", hq: "Denver, US", via: "Priya", note: "fellow fractional", history: "2 seats since 2023" },
  { name: "Cedar and Pine", site: "cedarandpine.com", held: <>Lena K. <span className="ad-chip volt">Member</span></>, seat: "Fractional CMO", fns: ["Marketing", "RevOps"], industry: "Software", emp: "51-200", hq: "Portland, US", via: "Lena", note: "works with them", history: "2 seats since 2025" },
  { facts: "Software · $20M-$50M", held: <Lock>With the company</Lock>, seat: "Fractional CRO", fns: ["Sales"], industry: "Software", emp: "201-500", hq: "United States", note: "", history: "1 seat in 2025" },
  { name: "Halcyon Freight", site: "halcyonfreight.com", held: <Lock />, seat: "Fractional CRO", fns: ["Sales", "Finance"], industry: "Freight", emp: "201-500", hq: "Chicago, US", via: "Marcus", note: "reported to the CEO", history: "4 seats since 2022" },
  { name: "Kestrel Analytics", site: "kestrelanalytics.io", held: <span className="ad-chip missing">Not named yet</span>, seat: "Fractional VP Sales", fns: ["Sales"], industry: "SaaS", emp: "51-200", hq: "Toronto, CA", note: "", history: "1 seat in 2024" },
  { facts: "Fintech · $10M-$20M", held: <Lock>With the company</Lock>, seat: "Fractional CMO", fns: ["Marketing"], industry: "Fintech", emp: "51-200", hq: "United Kingdom", note: "", history: "2 seats since 2024" },
  { name: "Tallgrass Foods", site: "tallgrassfoods.com", held: <Lock />, seat: "Fractional CFO", fns: ["Finance", "Sales"], industry: "Food", emp: "201-500", hq: "Omaha, US", via: "Sam", note: "fellow fractional", history: "3 seats since 2023" },
  { name: "Osprey Legal", site: "ospreylegal.com", held: <span className="ad-chip missing">Not named yet</span>, seat: "Fractional VP Sales", fns: ["Sales"], industry: "Legal services", emp: "11-50", hq: "Boston, US", note: "", history: "1 seat in 2025" },
];

export default function CompaniesAdapted() {
  return (
    <>
      <div className="ad">
        <aside className="ad-rail">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/brand/adapt/merlin-lockup.svg" alt="Merlin by Revenue Nomad" />
          {NAV.map((g, i) => (
            <div className="ad-nav" key={i}>
              {g.heading && <h4>{g.heading}</h4>}
              {g.items.map((it) => (
                <a key={it.label} href="#" className={it.on ? "on" : undefined}>
                  <Icon name={it.icon} />
                  {it.label}
                  {it.count && <em className="num">{it.count}</em>}
                  {it.hot && <span className="hot num">{it.hot}</span>}
                  {it.via && <span className="via num">{it.via}</span>}
                  {it.tag && <span className="tag">{it.tag}</span>}
                </a>
              ))}
            </div>
          ))}
          <div className="ad-foot">
            <div className="ad-started">
              <div>
                <b>Getting started · 3 of 6 done</b>
                <div className="ad-ticks">
                  {[1, 1, 1, 0, 0, 0].map((f, i) => <i key={i} className={f ? "f" : undefined} />)}
                </div>
                <small>Next: Add the seats you have held</small>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/adapt/card-door.svg" alt="" />
            </div>
            <div className="ad-plan">
              <span>Close trial · 16 days left</span>
              <a href="#">Upgrade</a>
            </div>
            <div className="ad-me">
              <span>JS</span>
              <div>
                <b>Jane Smith</b>
                <small>Fractional VP Sales</small>
              </div>
            </div>
          </div>
        </aside>

        <div>
          <header className="ad-header">
            <span className="crumb">Home / <b>Companies</b></span>
            <span className="sp" />
            <span style={{ width: 18, height: 18, display: "inline-flex", color: "var(--muted)" }}><Icon name="bell" /></span>
            <span className="ad-credits"><i />25 credits</span>
            <a className="ad-btn volt" href="#">+ Add what you know</a>
          </header>

          <main className="ad-page">
            <section className="ad-band">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/adapt/band-companies.svg" alt="" />
              <div>
                <h1>Companies</h1>
                <p>64 companies that hired a fractional Sales leader. 9 of them have a door you can already reach.</p>
              </div>
              <div className="ad-legend">
                <span><span className="ad-ring" style={{ "--c": "var(--volt)" } as React.CSSProperties} />You</span>
                <span><span className="ad-ring" style={{ "--c": "var(--violet-light)" } as React.CSSProperties} />Someone you know</span>
                <span><span className="ad-ring" style={{ "--c": "var(--saffron)" } as React.CSSProperties} />Who decides</span>
              </div>
            </section>

            <div className="ad-tools">
              <a className="ad-btn" href="#">View: Your ideal client</a>
              <span className="ad-ask">
                <Icon name="spark" />
                Ask Merlin: SaaS companies under 500 people with a seat that ended, with who decides
              </span>
              <a className="ad-btn" href="#">Columns</a>
              <a className="ad-btn pine" href="#">Save view with an alert</a>
            </div>
            <div className="ad-chips">
              <span className="ad-chip on">Sales</span>
              <span className="ad-chip">Recently hired</span>
              <span className="ad-chip">Open roles</span>
              <span className="ad-chip">Industry</span>
              <span className="ad-chip">Employees</span>
              <span className="ad-chip">Revenue</span>
              <span className="ad-chip via">Where you know someone · 9</span>
              <span className="sp" />
              <span className="ad-muted">Sort: Most recent seat</span>
            </div>

            <div className="ad-card">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Held by</th>
                    <th>Latest seat</th>
                    <th>Functions hired</th>
                    <th>Industry and size</th>
                    <th className="via">Your way in</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr key={i} className={r.sel ? "sel" : undefined}>
                      <td>
                        <div className="ad-co">
                          {r.name ? (
                            <span className="ad-ico">{r.name.split(" ").filter((w) => w !== "and").slice(0, 2).map((w) => w[0]).join("")}</span>
                          ) : (
                            <span className="ad-ico locked">?</span>
                          )}
                          <div>
                            <b>
                              {r.name || "Locked company"} {r.hiring && <span className="ad-chip ember" style={{ marginLeft: 4 }}>Hiring</span>}
                            </b>
                            {r.site ? <small>{r.site}</small> : <span className="ad-muted" style={{ fontSize: 12.5 }}><a href="#" style={{ color: "var(--pine)", fontWeight: 600 }}>Unlock · 2 credits</a></span>}
                          </div>
                        </div>
                      </td>
                      <td>{r.held}</td>
                      <td>{r.seat}</td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          {r.fns.map((f) => <span className="ad-chip" key={f}>{f}</span>)}
                        </span>
                      </td>
                      <td className="ad-muted">
                        {r.industry}
                        <div className="num" style={{ fontSize: 12.5 }}>{r.emp} · {r.hq}</div>
                      </td>
                      <td>{r.name ? <Way via={r.via} note={r.note} /> : <span className="ad-muted">Opens after the company</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ad-bottom">
              <a className="ad-btab on" href="#">Companies · <span className="num">64</span></a>
              <a className="ad-btab" href="#">People at these companies · <span className="num">212</span></a>
              <a className="ad-btab" href="#">Seats at these companies · <span className="num">97</span></a>
              <a className="ad-btab" href="#">+ Add</a>
              <span className="status">Showing 9 of 64 · 38 of 40 companies left today</span>
            </div>
          </main>

          <aside className="ad-notes">
            <b>What changed from the current page</b>
            <ul>
              <li>The page title sits in one pine band with the line architecture. Lines are white, highlights are volt, the path is saffron.</li>
              <li>Violet has one job: the person in between. It marks the &quot;Your way in&quot; column, the filter for it, and the Warm paths and Fractionals counts.</li>
              <li>The Getting started card in the rail is pine with a small doorway.</li>
              <li>Everything else is the current system: light page, white rail, Schibsted Grotesk, chips, radii, ember kept to two uses on the screen.</li>
            </ul>
          </aside>
        </div>
      </div>
    </>
  );
}
