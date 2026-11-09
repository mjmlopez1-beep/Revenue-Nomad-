import { byDepth, Cuboid, DEPTH, HALF, RISE, type Grid, type Kind } from "../diagnostic/iso";

/**
 * One isometric drawing per problem page, on the Diagnostic's grid (app/diagnostic/iso.tsx) so the pages share
 * the method's visual language: leaf for the engine, gold for the one element the fix changes, ghost for what
 * is scattered or not yet built, l1 to l4 for the four maturity levels. Fills live in Solution.css under
 * .solp-motif (tokens only). Each drawing lists its blocks; the viewBox is fitted to them.
 */
export type MotifKey = "founder" | "pipeline" | "forecast" | "ai";

type Block = { at: Grid; size?: Grid; kind: Kind };
/** `over` is drawn after everything else, for a block that floats above the rest and must not be painted over. */
type Drawing = { label: string; blocks: Block[]; over?: Block[] };

const unit: Grid = [1, 1, 1];

/** Founder-led sales: the row of leaf blocks is the team, standing on its own; the gold block is the founder,
 * stepped out in front and to the side. */
const founder: Drawing = {
  label: "A row of five green blocks stands on its own while one gold block steps away from the row.",
  blocks: [
    ...Array.from({ length: 5 }, (_, i): Block => ({ at: [i, 0, 0], kind: "leaf" })),
    { at: [5.6, 1.4, 0], kind: "gold" },
  ],
};

/** Pipeline: scattered dashed blocks at the wide end funnel into one tight leaf row, with a gold block at the end
 * where the meetings land. */
const pipeline: Drawing = {
  label: "Scattered dashed blocks narrow into one tight row of green blocks that ends in a gold block.",
  blocks: [
    { at: [-0.6, 0.2, 0], kind: "ghost" },
    { at: [0.4, 1.6, 0], kind: "ghost" },
    { at: [-0.2, 2.9, 0], kind: "ghost" },
    { at: [1.0, -0.4, 0], kind: "ghost" },
    { at: [1.0, 3.6, 0], kind: "ghost" },
    { at: [2.2, 2.4, 0], kind: "ghost" },
    { at: [2.2, 0.6, 0], kind: "ghost" },
    { at: [3.3, 1.8, 0], kind: "leaf" },
    { at: [4.3, 1.8, 0], kind: "leaf" },
    { at: [5.3, 1.8, 0], kind: "leaf" },
    { at: [6.3, 1.8, 0], kind: "leaf" },
    { at: [7.3, 1.8, 0], kind: "gold" },
  ],
};

/** Forecast: a wall five wide and three high, each block shaded by its maturity level, and a thin gold slab
 * floating above it as the target the wall has to reach. */
const forecastLevels: number[][] = [
  [1, 2, 1],
  [2, 2, 3],
  [1, 1, 2],
  [3, 2, 2],
  [2, 3, 3],
];
const forecast: Drawing = {
  label: "A wall of blocks shaded from pale to dark green by maturity level, with a thin gold slab floating above it.",
  blocks: forecastLevels.flatMap((col, i) => col.map((lvl, k): Block => ({ at: [i, 0, k], kind: `l${lvl}` as Kind }))),
  over: [{ at: [0, 0, 3.7], size: [5, 1, 0.3], kind: "gold" }],
};

/** AI: a grid of leaf blocks, the revenue process, with gold blocks set inside it where AI does a task. */
const aiGold = new Set(["1-0", "2-2", "0-3", "3-1"]);
const ai: Drawing = {
  label: "A four by four grid of green blocks with four gold blocks set among them.",
  blocks: Array.from({ length: 16 }, (_, n): Block => {
    const i = n % 4;
    const j = Math.floor(n / 4);
    return { at: [i, j, 0], kind: aiGold.has(`${i}-${j}`) ? "gold" : "leaf" };
  }),
};

const drawings: Record<MotifKey, Drawing> = { founder, pipeline, forecast, ai };

const PAD = 6;

/** The screen-space bounds of a set of blocks before the origin is applied, from their eight corners each. */
function bounds(blocks: Block[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const b of blocks) {
    const [i, j, k] = b.at;
    const [di, dj, dk] = b.size ?? unit;
    for (const ii of [i, i + di]) {
      for (const jj of [j, j + dj]) {
        for (const kk of [k, k + dk]) {
          const x = (ii - jj) * HALF;
          const y = (ii + jj) * RISE - kk * DEPTH;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

export default function ProblemMotif({ motif, className }: { motif: MotifKey; className?: string }) {
  const d = drawings[motif];
  const all = [...d.blocks, ...(d.over ?? [])];
  const b = bounds(all);
  const w = Math.ceil(b.maxX - b.minX + PAD * 2);
  const h = Math.ceil(b.maxY - b.minY + PAD * 2);
  const o = { ox: PAD - b.minX, oy: PAD - b.minY };
  return (
    <svg className={className ? `solp-motif ${className}` : "solp-motif"} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={d.label}>
      <title>{d.label}</title>
      {[...byDepth(d.blocks), ...(d.over ?? [])].map((c) => (
        <Cuboid key={c.at.join(",")} {...o} at={c.at} size={c.size} kind={c.kind} />
      ))}
    </svg>
  );
}
