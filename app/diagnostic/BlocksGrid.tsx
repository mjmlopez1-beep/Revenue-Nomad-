import { levels, pillarLabel, pillars } from "../check/content";
import { blocks, model } from "./content";

/**
 * The 21 building blocks: seven pillar columns, each its three block names with a small leaf marker and the pillar
 * number on a gold chip, then the four maturity levels as a horizontal scale. The blocks were drawn as small cubes
 * at first; with the eight method drawings right above, the owner read that as too many cubes (gallery review
 * 2026-11-09), so the marker is a plain square. Pillar names and level copy come from app/check/content.ts.
 */

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
                  <span className="dx-block-mark" aria-hidden="true" />
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
