import { levels, pillarLabel } from "../check/content";
import { get, sampleScores } from "./content";

/**
 * The illustrative scores by pillar as a bar chart on the 1 to 4 scale: a bar per pillar, gridlines at each
 * level, the level names at 1 and 4, and a gold marker at the target. CSS grid, so the labels stay live text.
 */
const MAX = 4;
const pct = (n: number) => `${(n / MAX) * 100}%`;
const name = (n: number) => levels.find((l) => l.level === n)?.name ?? "";

export default function ScoresChart() {
  const s = get.scores;
  return (
    <figure className="dx-scores">
      <figcaption className="dx-scores-head">
        <h3 className="dx-scores-title">{s.title}</h3>
        <span className="dx-badge-illustrative">{s.badge}</span>
      </figcaption>
      <div className="dx-scores-body" role="list">
        <span className="dx-scores-grid" aria-hidden="true" style={{ gridRow: `1 / ${sampleScores.length + 2}` }}>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className="dx-scores-line" style={{ left: pct(n) }} />
          ))}
          <span className="dx-scores-target" style={{ left: pct(s.target) }}>
            <span className="dx-scores-target-label">
              {s.targetLabel} {s.target}
            </span>
          </span>
        </span>
        {sampleScores.map((row, n) => (
          <div key={row.pillar} className="dx-score" role="listitem" style={{ gridRow: n + 1 }}>
            <span className="dx-score-label">{pillarLabel[row.pillar]}</span>
            <span className="dx-score-track">
              <span className="dx-score-bar" style={{ width: pct(row.score) }} />
            </span>
            <span className="dx-score-value">
              {row.score.toFixed(1)}
              <span className="rn-sr-only"> of {MAX}</span>
            </span>
          </div>
        ))}
        <div className="dx-score dx-score--axis" aria-hidden="true" style={{ gridRow: sampleScores.length + 1 }}>
          <span />
          <span className="dx-scores-axis">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="dx-scores-tick" style={{ left: pct(n) }}>
                {n}
              </span>
            ))}
            {[1, MAX].map((n) => (
              <span key={n} className="dx-scores-tick dx-scores-tick--name" style={{ left: pct(n) }}>
                {name(n)}
              </span>
            ))}
          </span>
          <span />
        </div>
      </div>
      <p className="dx-scores-note">{s.note}</p>
    </figure>
  );
}
