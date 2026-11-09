/**
 * The assessment's cube solid: 7 cubes long, 3 deep, 3 high, drawn in three layers (design 4.8).
 * Geometry copied from the "Homepage D" artboard (HomeEPage.dc.html, section 14): every face there sits on
 * one isometric grid, so each cube is stored as its left-face anchor and a kind, and the three faces are
 * derived. Fills and strokes are CSS classes in Assessment.css so every color is a token.
 *
 * Kinds: "b" built (night tints, the slabs already in place), "n" new (leaf greens, the pillars this layer
 * adds), "g" ghost (dashed outline, the next pillars to come).
 */
type Kind = "b" | "n" | "g";
type Cube = [x: number, y: number, kind: Kind];
type Layer = { width: number; height: number; cubes: Cube[] };

const HALF = 24.25; // half the cube's isometric width
const RISE = 14; // vertical rise across one half width
const DEPTH = 28; // the cube's vertical edge

const LAYERS: Layer[] = [
  { width: 154, height: 183, cubes: [[50.5, 83.2, "n"], [26.2, 97.2, "n"], [74.7, 97.2, "n"], [50.5, 55.2, "n"], [2, 111.2, "n"], [50.5, 111.2, "n"], [26.2, 69.2, "n"], [74.7, 69.2, "n"], [50.5, 27.2, "n"], [26.2, 125.2, "n"], [74.7, 125.2, "n"], [2, 83.2, "n"], [50.5, 83.2, "n"], [26.2, 41.2, "n"], [74.7, 41.2, "n"], [50.5, 139.2, "n"], [26.2, 97.2, "n"], [2, 55.2, "n"], [50.5, 55.2, "n"], [26.2, 69.2, "n"], [103.8, 16, "g"], [99, 83.2, "g"]] },
  { width: 217, height: 214, cubes: [[50.5, 72, "b"], [26.2, 86, "b"], [74.7, 86, "b"], [50.5, 44, "b"], [2, 100, "b"], [50.5, 100, "b"], [99, 100, "n"], [26.2, 58, "b"], [74.7, 58, "b"], [50.5, 16, "b"], [26.2, 114, "b"], [74.7, 114, "n"], [123.2, 114, "n"], [2, 72, "b"], [50.5, 72, "b"], [99, 72, "n"], [26.2, 30, "b"], [74.7, 30, "b"], [50.5, 128, "n"], [99, 128, "n"], [147.5, 128, "n"], [26.2, 86, "b"], [74.7, 86, "n"], [123.2, 86, "n"], [2, 44, "b"], [50.5, 44, "b"], [99, 44, "n"], [74.7, 142, "n"], [123.2, 142, "n"], [50.5, 100, "n"], [99, 100, "n"], [147.5, 100, "n"], [26.2, 58, "b"], [74.7, 58, "n"], [123.2, 58, "n"], [99, 156, "n"], [74.7, 114, "n"], [123.2, 114, "n"], [50.5, 72, "n"], [99, 72, "n"], [147.5, 72, "n"], [123.2, 170, "n"], [99, 128, "n"], [74.7, 86, "n"], [123.2, 86, "n"], [99, 100, "n"], [166.9, 55.2, "g"]] },
  { width: 246, height: 228, cubes: [[50.5, 72, "b"], [26.2, 86, "b"], [74.7, 86, "b"], [50.5, 44, "b"], [2, 100, "b"], [50.5, 100, "b"], [99, 100, "b"], [26.2, 58, "b"], [74.7, 58, "b"], [50.5, 16, "b"], [26.2, 114, "b"], [74.7, 114, "b"], [123.2, 114, "b"], [2, 72, "b"], [50.5, 72, "b"], [99, 72, "b"], [26.2, 30, "b"], [74.7, 30, "b"], [50.5, 128, "b"], [99, 128, "b"], [147.5, 128, "b"], [26.2, 86, "b"], [74.7, 86, "b"], [123.2, 86, "b"], [2, 44, "b"], [50.5, 44, "b"], [99, 44, "b"], [74.7, 142, "b"], [123.2, 142, "b"], [171.7, 142, "n"], [50.5, 100, "b"], [99, 100, "b"], [147.5, 100, "b"], [26.2, 58, "b"], [74.7, 58, "b"], [123.2, 58, "b"], [99, 156, "b"], [147.5, 156, "n"], [196, 156, "n"], [74.7, 114, "b"], [123.2, 114, "b"], [171.7, 114, "n"], [50.5, 72, "b"], [99, 72, "b"], [147.5, 72, "b"], [123.2, 170, "n"], [171.7, 170, "n"], [99, 128, "b"], [147.5, 128, "n"], [196, 128, "n"], [74.7, 86, "b"], [123.2, 86, "b"], [171.7, 86, "n"], [147.5, 184, "n"], [123.2, 142, "n"], [171.7, 142, "n"], [99, 100, "b"], [147.5, 100, "n"], [196, 100, "n"], [147.5, 156, "n"], [123.2, 114, "n"], [171.7, 114, "n"], [147.5, 128, "n"]] },];

export const CUBE_LAYER_LABELS = [
  "The cube solid, layer 1 of 3: two of seven pillars built as green blocks, the next pillars shown as dashed outlines.",
  "The cube solid, layer 2 of 3: the first two pillars in place, three more added in green, one pillar still outlined.",
  "The cube solid, layer 3 of 3: all seven pillars built, the last two added in green on top of the finished slabs.",
] as const;

const f = (n: number) => (Math.round(n * 10) / 10).toString();

function faces([x, y, kind]: Cube, key: number) {
  const left = `${f(x)},${f(y)} ${f(x + HALF)},${f(y + RISE)} ${f(x + HALF)},${f(y + RISE + DEPTH)} ${f(x)},${f(y + DEPTH)}`;
  const right = `${f(x + 2 * HALF)},${f(y)} ${f(x + HALF)},${f(y + RISE)} ${f(x + HALF)},${f(y + RISE + DEPTH)} ${f(x + 2 * HALF)},${f(y + DEPTH)}`;
  const top = `${f(x + HALF)},${f(y - RISE)} ${f(x + 2 * HALF)},${f(y)} ${f(x + HALF)},${f(y + RISE)} ${f(x)},${f(y)}`;
  return (
    <g key={key} className={`asmt-cube asmt-cube--${kind}`}>
      <polygon className="asmt-face asmt-face--l" points={left} />
      <polygon className="asmt-face asmt-face--r" points={right} />
      <polygon className="asmt-face asmt-face--t" points={top} />
    </g>
  );
}

/** One layer of the solid. `layer` is 0, 1 or 2. */
export default function CubeSolid({ layer, className }: { layer: 0 | 1 | 2; className?: string }) {
  const { width, height, cubes } = LAYERS[layer];
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={CUBE_LAYER_LABELS[layer]}
    >
      {cubes.map(faces)}
    </svg>
  );
}
