import Arrow from "../home/Arrow";
import { pillarLabel } from "../check/content";
import { roadmap } from "./content";

/**
 * The sample roadmap: five workstreams across Month 1, 2, 3, Q2, Q3, Q4. Forest bars for the work, a gold
 * diamond at each milestone, and the "What it unlocks" row under the periods. A CSS grid inside a scroll
 * region, so phones scroll the plan sideways instead of the page.
 */
const LABEL = "minmax(240px, 300px)";
const cols = { gridTemplateColumns: `${LABEL} repeat(${roadmap.columns.length}, minmax(0, 1fr))` };
/** Period columns are 1-based; the label column is grid column 1, so period n is grid column n + 1. */
const span = (from: number, to: number) => ({ gridColumn: `${from + 1} / ${to + 1}` });
const endAt = (at: number) => ({ gridColumn: `2 / ${at + 1}` });

function Diamond() {
  return <span className="dx-diamond" aria-hidden="true" />;
}

export default function Roadmap() {
  const r = roadmap;
  return (
    <>
      <div className="dx-roadmap-wrap" role="region" aria-label={`${r.title}, ${r.badge.toLowerCase()}`} tabIndex={0}>
        <div className="dx-roadmap">
          <div className="dx-roadmap-head" style={cols}>
            <span className="dx-roadmap-k">
              {r.head.workstream} · {r.head.score} <span aria-hidden="true">to</span>
              <span className="rn-sr-only">to</span> {r.head.target} · {r.head.owner}
            </span>
            {r.columns.map((c) => (
              <span key={c} className="dx-roadmap-k dx-roadmap-col">
                {c}
              </span>
            ))}
          </div>
          {r.rows.map((w) => (
            <div key={w.title} className="dx-ws" style={cols}>
              {r.columns.map((c, n) => (
                <span key={c} className="dx-ws-rule" style={{ gridColumn: n + 2, gridRow: "1 / span 2" }} aria-hidden="true" />
              ))}
              <div className="dx-ws-label">
                <b>{w.title}</b>
                <span className="dx-ws-meta">
                  {pillarLabel[w.pillar]} · <b className="dx-ws-score">{w.score}</b>
                  <Arrow size={12} />
                  <span className="rn-sr-only">to</span>
                  <b className="dx-ws-target">{w.target}</b> · {w.owner}
                </span>
              </div>
              {w.bars.map((b) => (
                <div key={b.label} className="dx-bar" style={{ ...span(b.from, b.to), gridRow: 1 }}>
                  {b.label}
                </div>
              ))}
              <div className="dx-milestone" style={{ ...endAt(w.milestone.at), gridRow: 2 }}>
                <span className="rn-sr-only">Milestone, end of {r.columns[w.milestone.at - 2]}: </span>
                {w.milestone.label}
                <Diamond />
              </div>
            </div>
          ))}
          <div className="dx-unlocks" style={cols}>
            <span className="dx-roadmap-k">{r.unlocks.label}</span>
            {r.unlocks.items.map((u) => (
              <div key={u.label} className="dx-unlock" style={span(u.from, u.to)}>
                {u.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="dx-roadmap-foot">
        <span className="dx-roadmap-legend">
          <Diamond />
          {r.legend}
        </span>
        <span>{r.cadence}</span>
        <span>{r.note}</span>
      </div>
    </>
  );
}
