import { pillars } from "../check/content";
import { method } from "./content";
import { byDepth, corner, Cuboid, DEPTH, HALF, points, RISE, type Grid, type Kind } from "./iso";

/**
 * The method in eight small isometric drawings, two rows of four with arrows between them and a caption under
 * each, after the owner's reference (an architectural parti diagram). Each drawing is its own SVG on the same
 * 290 x 240 viewBox so the grid can reflow to two across on phones. The revenue engine is a wall seven cells
 * long, one deep and three high: seven pillars (i), three building blocks each (k), 21 blocks in all.
 */
const VB = { w: 290, h: 240 };
/** The wall centered in the viewBox: x from 48 to 242, y from 22 to 218. */
const O = { ox: 72.25, oy: 106 };

const PILLARS = pillars.length; // 7
const BLOCKS = 3;

/** Sample block scores, 1 to 4, in pillar order and bottom to top. They follow the illustrative pillar scores
 * on the page (Data Foundations and AI lowest, Revenue Technology highest); no number is shown. */
const SCORES: number[][] = [
  [2, 2, 3], // GTM Design
  [3, 3, 2], // Revenue Technology
  [2, 1, 2], // Revenue Insights
  [1, 2, 1], // Data Foundations
  [2, 3, 2], // Operating Rhythm
  [2, 2, 2], // Team Enablement
  [1, 1, 2], // AI
];
/** The finished solid: every block at Performing or Optimized. */
const TARGET: number[][] = [
  [3, 3, 3],
  [3, 3, 4],
  [3, 3, 3],
  [3, 3, 3],
  [3, 4, 3],
  [3, 3, 3],
  [3, 3, 3],
];
const level = (n: number) => `l${n}` as Kind;

/** The lowest-scoring blocks (score 1) as grid cells, worst pillar first. */
const BROKEN: Grid[] = (() => {
  const out: Grid[] = [];
  SCORES.forEach((col, i) => col.forEach((s, k) => s === 1 && out.push([i, 0, k])));
  return out;
})();

function Wall({ shade, holes = [] }: { shade: (i: number, k: number) => Kind; holes?: Grid[] }) {
  const cubes: { at: Grid; kind: Kind }[] = [];
  for (let i = 0; i < PILLARS; i++) {
    for (let k = 0; k < BLOCKS; k++) {
      const hole = holes.some((h) => h[0] === i && h[2] === k);
      cubes.push({ at: [i, 0, k], kind: hole ? "ghost" : shade(i, k) });
    }
  }
  return (
    <>
      {byDepth(cubes).map((c) => (
        <Cuboid key={`${c.at[0]}-${c.at[2]}`} {...O} at={c.at} kind={c.kind} />
      ))}
    </>
  );
}

/* 1. The envelope: the whole engine as one block. */
function Envelope() {
  return <Cuboid {...O} at={[0, 0, 0]} size={[PILLARS, 1, BLOCKS]} kind="leaf" />;
}

/* 2. Seven slabs: one per pillar. */
function Slabs() {
  return (
    <>
      {Array.from({ length: PILLARS }, (_, i) => (
        <Cuboid key={i} {...O} at={[i, 0, 0]} size={[1, 1, BLOCKS]} kind="leaf" />
      ))}
    </>
  );
}

/* 3. The 21 blocks. */
function Blocks() {
  return <Wall shade={() => "leaf"} />;
}

/* 4. Shaded by score, with the four-level scale at the left and the level reached marked in gold. */
const LEGEND_X = 14;
const LEGEND_Y = 64; // top cube's anchor; level 4 at the top
function Scored() {
  const shifted = { ox: O.ox + 29, oy: O.oy };
  const cubes: { at: Grid; kind: Kind }[] = [];
  for (let i = 0; i < PILLARS; i++) for (let k = 0; k < BLOCKS; k++) cubes.push({ at: [i, 0, k], kind: level(SCORES[i][k]) });
  const reached = 2; // the sample rolls up to Foundational
  const markY = LEGEND_Y + (4 - reached) * DEPTH + RISE / 2 + DEPTH / 2;
  return (
    <>
      {[4, 3, 2, 1].map((n, row) => {
        const x = LEGEND_X;
        const y = LEGEND_Y + row * DEPTH;
        return (
          <g key={n} className={`dx-cube dx-cube--l${n}`}>
            <polygon className="dx-face dx-face--l" points={`${x},${y} ${x + HALF},${y + RISE} ${x + HALF},${y + RISE + DEPTH} ${x},${y + DEPTH}`} />
            <polygon className="dx-face dx-face--r" points={`${x + 2 * HALF},${y} ${x + HALF},${y + RISE} ${x + HALF},${y + RISE + DEPTH} ${x + 2 * HALF},${y + DEPTH}`} />
            {row === 0 && <polygon className="dx-face dx-face--t" points={`${x + HALF},${y - RISE} ${x + 2 * HALF},${y} ${x + HALF},${y + RISE} ${x},${y}`} />}
          </g>
        );
      })}
      <polygon className="dx-mark" points={`${LEGEND_X + 2 * HALF + 10},${markY} ${LEGEND_X + 2 * HALF + 16},${markY - 6} ${LEGEND_X + 2 * HALF + 22},${markY} ${LEGEND_X + 2 * HALF + 16},${markY + 6}`} />
      {byDepth(cubes).map((c) => (
        <Cuboid key={`${c.at[0]}-${c.at[2]}`} {...shifted} at={c.at} kind={c.kind} />
      ))}
    </>
  );
}

/* 5. The lowest blocks pulled out toward the viewer, the worst in gold. */
const PULL = 1.2;
function Ranked() {
  // Data Foundations is the lowest pillar on the sample scorecard, so its bottom block ranks first and is gold.
  const pulled = BROKEN.map((b) => ({
    at: [b[0], PULL, b[2]] as Grid,
    kind: (b[0] === 3 && b[2] === 0 ? "gold" : "l1") as Kind,
  }));
  return (
    <>
      <Wall shade={(i, k) => level(SCORES[i][k])} holes={BROKEN} />
      {byDepth(pulled).map((c) => (
        <Cuboid key={`${c.at[0]}-${c.at[2]}`} {...O} at={c.at} kind={c.kind} />
      ))}
    </>
  );
}

/* 6. The pulled blocks regrouped into three workstreams in front of the engine's dashed outline. */
const GROUPS: Grid[] = [
  [0.2, 1, 0],
  [1.2, 1, 0],
  [3, 1, 0],
  [3, 1, 1],
  [5.6, 1, 0],
];
function Workstreams() {
  return (
    <>
      <Cuboid {...O} at={[0, 0, 0]} size={[PILLARS, 1, BLOCKS]} kind="ghost" />
      {byDepth(GROUPS.map((at) => ({ at }))).map((c) => (
        <Cuboid key={c.at.join("-")} {...O} at={c.at} kind="leaf" />
      ))}
    </>
  );
}

/* 7. A bridge from the pipeline block to the bookings goal, the goal's top still dashed. */
function Bridge() {
  const T = 0.3; // the bridge's thickness, in cells
  return (
    <>
      <Cuboid {...O} at={[0, 0, 0]} size={[2, 1, 2]} kind="leaf" />
      <g className="dx-cube dx-cube--gold">
        <polygon className="dx-face dx-face--l" points={points(O, [[2, 1, 2], [5, 1, 3], [5, 1, 3 - T], [2, 1, 2 - T]])} />
        <polygon className="dx-face dx-face--t" points={points(O, [[2, 0, 2], [5, 0, 3], [5, 1, 3], [2, 1, 2]])} />
      </g>
      <Cuboid {...O} at={[5, 0, 0]} size={[2, 1, 2]} kind="forest" />
      <Cuboid {...O} at={[5, 0, 2]} size={[2, 1, 1]} kind="ghost" />
    </>
  );
}

/* 8. The finished solid with the operating rhythm drawn as a dashed gold ring on the ground, a marker per re-score. */
function Rhythm() {
  const [cx, cy] = corner(O, [3.5, 0.5, 0]);
  const rx = 123;
  const ry = 71;
  const marks = [30, 90, 150].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
  return (
    <>
      <path className="dx-ring dx-ring--back" d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`} />
      <Wall shade={(i, k) => level(TARGET[i][k])} />
      <path className="dx-ring" d={`M ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`} />
      {marks.map(([x, y], n) => (
        <polygon key={n} className="dx-mark" points={`${x - 6},${y} ${x},${y - 6} ${x + 6},${y} ${x},${y + 6}`} />
      ))}
    </>
  );
}

const DRAWINGS = [Envelope, Slabs, Blocks, Scored, Ranked, Workstreams, Bridge, Rhythm];

function StepArrow() {
  return (
    <svg className="dx-method-arrow" width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
      <path d="M1 6h22M18 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MethodDiagram() {
  return (
    <ol className="dx-method" aria-label={method.label}>
      {method.steps.map((s, n) => {
        const Drawing = DRAWINGS[n];
        return (
          <li key={s.title} className="dx-method-step">
            <div className="dx-method-art">
              <svg className="dx-method-svg" viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={`Step ${n + 1} of 8, ${s.title}: ${s.caption}`}>
                <g>
                  <title>{s.title}</title>
                  <Drawing />
                </g>
              </svg>
              <StepArrow />
            </div>
            <p className="dx-method-cap">
              <span className="dx-num" aria-hidden="true">
                {String(n + 1).padStart(2, "0")}
              </span>
              <b>{s.title}</b>
              <span className="dx-method-sub">{s.caption}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
