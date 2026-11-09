import { byDepth, Cuboid, DEPTH, HALF, RISE, type Grid, type Kind } from "../diagnostic/iso";

/**
 * One isometric drawing per problem page, on the Diagnostic's grid (app/diagnostic/iso.tsx) so the pages share
 * the method's visual language: leaf for the engine, gold for the one element the fix changes, ghost for what
 * is scattered or not yet built, l1 to l4 for the four maturity levels. Fills live in Solution.css under
 * .solp-motif (tokens only). Each drawing lists its blocks; the viewBox is fitted to them. The hero is text only
 * (owner review 2026-11-09: a consulting firm would lead with the statement), so the drawing sits in the
 * "Why it happens" band with its caption.
 */
export type MotifKey = "founder" | "pipeline" | "forecast" | "ai";

type Block = { at: Grid; size?: Grid; kind: Kind };
/** `over` is drawn after everything else, for a block that floats above the rest and must not be painted over. */
type Drawing = { label: string; blocks: Block[]; over?: Block[] };

const unit: Grid = [1, 1, 1];

/* ---------- the drawings: the problem as a parti, one per page, in the "Why it happens" band ---------- */

type HeroDrawing = Drawing & { caption: string };

/** Founder-led: a wide slab of revenue balanced on one gold block, the founder, with dashed outlines where the
 * team's blocks should stand. */
const founderHero: HeroDrawing = {
  caption: "Everything rests on one person.",
  label: "A wide dark-green slab balanced on a single gold block in the middle, with dashed outlines of blocks under each end where nothing holds it up.",
  blocks: [
    { at: [0, 0, 0], kind: "ghost" },
    { at: [1.5, 0, 0], kind: "ghost" },
    { at: [3, 0, 0], kind: "gold" },
    { at: [4.5, 0, 0], kind: "ghost" },
    { at: [6, 0, 0], kind: "ghost" },
  ],
  over: [{ at: [-0.3, -0.2, 1], size: [7.6, 1.4, 0.35], kind: "forest" }],
};

/** Pipeline: a tight cluster, the network, and a row reaching away from it that fades to outlines before the
 * gold block where the meetings are. */
const pipelineHero: HeroDrawing = {
  caption: "The network ends. The pipeline has to keep going.",
  label: "A tight two-by-two cluster of green blocks, and a row of single blocks reaching away from it that fades from green to dashed outlines before ending in a gold block.",
  blocks: [
    { at: [0, 0, 0], kind: "leaf" },
    { at: [1, 0, 0], kind: "leaf" },
    { at: [0, 1, 0], kind: "leaf" },
    { at: [1, 1, 0], kind: "leaf" },
    { at: [0, 0, 1], kind: "leaf" },
    { at: [1, 1, 1], kind: "leaf" },
    { at: [3, 0.5, 0], kind: "leaf" },
    { at: [4.2, 0.5, 0], kind: "l3" },
    { at: [5.4, 0.5, 0], kind: "l2" },
    { at: [6.6, 0.5, 0], kind: "l1" },
    { at: [7.8, 0.5, 0], kind: "ghost" },
    { at: [9, 0.5, 0], kind: "gold" },
  ],
};

/** Forecast: five columns like a bar chart, a gold slab laid across at one height, the number everyone can hold;
 * everything above it is an outline. */
const forecastHeights = [2, 4, 3, 5, 3];
const forecastHero: HeroDrawing = {
  caption: "One number the board can hold.",
  label: "Five columns of stacked blocks of different heights, like a bar chart, with a thin gold slab laid across all of them at one height; the blocks above the slab are drawn as dashed outlines.",
  blocks: forecastHeights.flatMap((h, i) =>
    Array.from({ length: h }, (_, k): Block => ({ at: [i * 1.2, 0, k], kind: k < 3 ? (k === 2 ? "l3" : "leaf") : "ghost" })),
  ),
  over: [{ at: [-0.3, -0.25, 3], size: [5.4, 1.5, 0.22], kind: "gold" }],
};

/** AI: the revenue engine as a platform with one gold block set into it, and two dashed blocks floating apart
 * from it, the tools bought and never plugged in. */
const aiHero: HeroDrawing = {
  caption: "Plugged into the engine, not bought beside it.",
  label: "A green platform of blocks, four by three, with one gold block set into its top, and two dashed blocks floating off to the side above it.",
  blocks: [
    ...Array.from({ length: 12 }, (_, n): Block => ({ at: [n % 4, Math.floor(n / 4), 0], kind: "leaf" })),
    { at: [1, 1, 1], kind: "gold" },
    { at: [4.6, 0.2, 1.6], kind: "ghost" },
    { at: [5.4, 1.6, 2.2], kind: "ghost" },
  ],
};

const drawings: Record<MotifKey, HeroDrawing> = { founder: founderHero, pipeline: pipelineHero, forecast: forecastHero, ai: aiHero };

/** The drawing's visible caption, for the figure the page renders around it. */
export const motifCaption = (motif: MotifKey) => drawings[motif].caption;

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
