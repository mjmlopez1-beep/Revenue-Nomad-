import { levels, pillarLabel, pillars } from "../check/content";
import { blocks, model } from "./content";
import { DEPTH, HALF, RISE } from "./iso";

/**
 * The 21 building blocks: seven pillar columns, each a stack of three small isometric cubes with the block names
 * beside them and the pillar number on a gold chip, then the four maturity levels as a horizontal scale.
 * Pillar names and level copy come from app/check/content.ts.
 */
const PITCH = 40; // vertical distance between the stacked cubes, so a two-line block name fits beside each

function Stack({ count, label }: { count: number; label: string }) {
  const w = 2 * HALF + 1;
  const h = RISE + (count - 1) * PITCH + DEPTH + RISE + 1;
  return (
    <svg className="dx-stack" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      {Array.from({ length: count }, (_, n) => {
        const x = 0.5;
        const y = RISE + 0.5 + n * PITCH;
        return (
          <g key={n} className="dx-cube dx-cube--leaf">
            <polygon className="dx-face dx-face--l" points={`${x},${y} ${x + HALF},${y + RISE} ${x + HALF},${y + RISE + DEPTH} ${x},${y + DEPTH}`} />
            <polygon className="dx-face dx-face--r" points={`${x + 2 * HALF},${y} ${x + HALF},${y + RISE} ${x + HALF},${y + RISE + DEPTH} ${x + 2 * HALF},${y + DEPTH}`} />
            <polygon className="dx-face dx-face--t" points={`${x + HALF},${y - RISE} ${x + 2 * HALF},${y} ${x + HALF},${y + RISE} ${x},${y}`} />
          </g>
        );
      })}
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
            <div className="dx-pillar-body">
              <Stack count={blocks[p].length} label={`${blocks[p].length} building blocks in ${pillarLabel[p]}`} />
              <ul className="dx-blocks">
                {blocks[p].map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
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
