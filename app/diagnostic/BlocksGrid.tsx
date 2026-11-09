import { levels, pillarLabel, pillars } from "../check/content";
import { blocks, model } from "./content";
import { DEPTH, HALF, RISE } from "./iso";

/**
 * The 21 building blocks: seven pillar columns, each a stack of three small isometric cubes with the block names
 * beside them (one cube per row, so a long name never overlaps the next) and the pillar number on a gold chip, then the four maturity levels as a horizontal scale.
 * Pillar names and level copy come from app/check/content.ts.
 */
const W = 2 * HALF + 1;
const H = 2 * RISE + DEPTH + 1;

/** One small isometric cube, drawn beside each block name so the three read as a stack. */
function Cube() {
  const x = 0.5;
  const y = RISE + 0.5;
  return (
    <svg className="dx-cube-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <g className="dx-cube dx-cube--leaf">
        <polygon className="dx-face dx-face--l" points={`${x},${y} ${x + HALF},${y + RISE} ${x + HALF},${y + RISE + DEPTH} ${x},${y + DEPTH}`} />
        <polygon className="dx-face dx-face--r" points={`${x + 2 * HALF},${y} ${x + HALF},${y + RISE} ${x + HALF},${y + RISE + DEPTH} ${x + 2 * HALF},${y + DEPTH}`} />
        <polygon className="dx-face dx-face--t" points={`${x + HALF},${y - RISE} ${x + 2 * HALF},${y} ${x + HALF},${y + RISE} ${x},${y}`} />
      </g>
    </svg>
  );
}

export default function BlocksGrid() {
  const ascending = [...levels].sort((a, b) => a.level - b.level);
  return (
    <>
      <ol className="dx-pillars">
        {pillars.map((p, n) => (
          <li key={p} className="dx-pillar">
            <div className="dx-pillar-head">
              <span className="dx-num" aria-hidden="true">
                {String(n + 1).padStart(2, "0")}
              </span>
              <h3 className="dx-pillar-name">{pillarLabel[p]}</h3>
              {p === "ai" && <span className="dx-pillar-tag">{model.aiTag}</span>}
            </div>
            <ul className="dx-blocks" aria-label={`${blocks[p].length} building blocks in ${pillarLabel[p]}`}>
              {blocks[p].map((b) => (
                <li key={b}>
                  <Cube />
                  {b}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className="dx-levels">
        <p className="dx-kicker">{model.levelsKicker}</p>
        <ol className="dx-scale">
          {ascending.map((l) => (
            <li key={l.level} className={`dx-level dx-level--${l.level}`}>
              <span className="dx-level-n" aria-hidden="true">
                {l.level}
              </span>
              <span className="dx-level-text">
                <b>
                  <span className="rn-sr-only">Level {l.level}, </span>
                  {l.name}
                </b>
                <span>{l.summary}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
