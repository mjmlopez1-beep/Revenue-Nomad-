import type { Metadata } from "next";
import "../../brand.css";
import "../mock.css";
import { Logo, Shell } from "../Shell";

export const metadata: Metadata = { title: "Merlin mockup: Pipeline" };

interface Deal { name: string; pitch: string; value: string; way: string; next: string; due: string; hot?: boolean }
const COLS: { stage: string; total: string; deals: Deal[]; won?: boolean }[] = [
  { stage: "To reach out", total: "$17,500", deals: [
    { name: "Larkspur Learning", pitch: "Fractional VP Sales", value: "$9,500 a month", way: "Dana, held the seat", next: "Message Dana", due: "Today", hot: true },
    { name: "Kestrel Analytics", pitch: "Fractional VP Sales", value: "$8,000 a month", way: "No way in chosen", next: "Bring in who you know", due: "Fri" },
  ] },
  { stage: "Sent", total: "$8,000", deals: [
    { name: "Northwind Clinics", pitch: "Fractional VP Sales", value: "$8,000 a month", way: "Priya, fellow fractional", next: "Follow up", due: "Mon" },
  ] },
  { stage: "Replied", total: "$0", deals: [] },
  { stage: "Meeting", total: "$10,000", deals: [
    { name: "Halcyon Freight", pitch: "Fractional CRO", value: "$10,000 a month", way: "Marcus, reported to the CEO", next: "Send the recap", due: "Tomorrow" },
  ] },
  { stage: "Proposal", total: "$11,000", deals: [
    { name: "Cedar and Pine", pitch: "Fractional VP Sales, 3 days a week", value: "$11,000 a month", way: "Lena, fellow fractional", next: "Proposal sent, awaiting signature", due: "Dec 2" },
  ] },
  { stage: "Won", total: "$7,500", won: true, deals: [
    { name: "Bluegate Systems", pitch: "Fractional VP Sales", value: "$7,500 a month", way: "Warm intro", next: "Write your case study", due: "Signed Nov 12" },
  ] },
];

export default function PipelineMock() {
  return (
    <Shell active="pipeline" crumb="Close / Pipeline">
      <div className="mk-page">
        <div className="mk-page-head">
          <div>
            <h1>Pipeline</h1>
            <p>5 open · $46,500 a month in play · 1 next move due</p>
          </div>
          <div className="mk-actions">
            <a className="mk-btn ghost" href="#">Add from a list</a>
            <a className="mk-btn" href="#">+ Add a deal</a>
          </div>
        </div>

        <div className="mk-toolbar">
          <span className="mk-pill lime">Board</span>
          <span className="mk-pill">Table</span>
          <span style={{ width: 8 }} />
          <span className="mk-pill">All deals</span>
          <span className="mk-pill">Next move due</span>
          <span className="mk-pill">Has a proposal or contract</span>
          <span className="mk-pill">No way in chosen</span>
          <span className="mk-pill">With a peer</span>
          <span style={{ flex: 1 }} />
          <span className="mk-dim">Sort: next move due</span>
        </div>

        <div className="mk-board">
          {COLS.map((c) => (
            <section className={`mk-col${c.won ? " won" : ""}`} key={c.stage}>
              <header>
                <span>{c.stage} <small>{c.deals.length}</small></span>
                <small>{c.total}</small>
              </header>
              {c.deals.map((d) => (
                <article className="mk-deal" key={d.name}>
                  <div className="mk-co">
                    <Logo name={d.name} size="sm" />
                    <div>
                      {d.name}
                      <small>{d.pitch}</small>
                    </div>
                  </div>
                  <div className="val">{d.value}</div>
                  <dl>
                    <div><dt>Your way in</dt><dd>{d.way}</dd></div>
                    <div><dt>Next move</dt><dd style={{ color: "var(--ml-cream)" }}>{d.next}</dd></div>
                  </dl>
                  <div style={{ marginTop: 10 }}>
                    <span className={`mk-pill${d.hot ? " gold" : c.won ? " lime" : ""}`}>{d.hot ? "Due today" : d.due}</span>
                  </div>
                </article>
              ))}
              {c.deals.length === 0 && <p className="mk-dim" style={{ padding: "4px 4px 0", fontSize: 13 }}>Nothing here yet.</p>}
            </section>
          ))}
        </div>

        <div className="mk-row between" style={{ marginTop: 18 }}>
          <div className="mk-tabs" style={{ margin: 0, border: 0 }}>
            <a className="on" href="#">Deals</a>
            <a href="#">Intros · 2</a>
          </div>
          <span className="mk-dim">Lost · 3 (Not now and Went quiet) · Show</span>
        </div>
      </div>
    </Shell>
  );
}
