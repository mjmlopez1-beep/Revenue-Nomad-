import { byDepth, Cuboid, DEPTH, HALF, RISE, type Grid } from "../diagnostic/iso";
import rateIndex from "@/data/rate-index.json";

/**
 * The hero illustration: the eight role categories of the Rate Index as isometric blocks on a ring around one
 * gold slab, the revenue engine, in the Diagnostic's drawing language (app/diagnostic/iso.tsx). Replaces the
 * glass mark (owner review 2026-11-09: "switch the right side to an illustration of our 8 role categories").
 * Categories and their order come from data/rate-index.json, largest cut first, and each block's height follows
 * its share of the index (the largest cut is the tallest); the labels are display names.
 * Fills, strokes and type are in Hero.css under .hero-wheel (tokens only).
 */
const names: Record<string, string[]> = {
  "Sales Leadership": ["Sales", "Leadership"],
  Marketing: ["Marketing"],
  "Revenue Operations": ["Revenue", "Operations"],
  "Sales Enablement": ["Sales", "Enablement"],
  "Customer Success & Growth": ["Customer Success", "and Growth"],
  "AI GTM": ["AI GTM"],
  Partnerships: ["Partnerships"],
  "Front-line Sellers / SDR": ["Front-line", "Sales"],
};

const R = 4;
const PAD = 8;
/** Block height in grid cells from the category's record count: about 0.9 for the smallest cuts, 1.9 for the largest. */
const height = (n: number, max: number) => 0.9 + (n / max) * 1.0;
/** Ring positions (angle on the grid circle) from front to back, so the tallest block stands in front and hides
 * nothing: bottom, lower right, lower left, right, left, upper right, upper left, top. */
const slots = [45, 0, 90, 315, 135, 270, 180, 225].map((deg) => (deg * Math.PI) / 180);

export default function RoleWheel() {
  const cats = [...rateIndex.rates.byCategory].sort((a, b) => b.n - a.n).slice(0, 8);
  const maxN = cats[0]?.n ?? 1;
  const ring = cats.map((c, k) => {
    const phi = slots[k];
    const i = R * Math.cos(phi);
    const j = R * Math.sin(phi);
    const x = (i - j) * HALF;
    const y = (i + j) * RISE;
    return { c, at: [i - 0.5, j - 0.5, 0] as Grid, x, y, h: height(c.n, maxN) };
  });
  const slab = { at: [-1.1, -1.1, 0] as Grid, size: [2.2, 2.2, 0.35] as Grid };
  const rx = Math.SQRT2 * R * HALF;
  const ry = Math.SQRT2 * R * RISE;
  const minX = -(rx + HALF + 12 + 110) - PAD;
  const maxX = rx + HALF + 12 + 110 + PAD;
  const minY = -(ry + 2.4 * DEPTH + RISE + 30) - PAD;
  const maxY = ry + RISE + 34 + PAD;
  const o = { ox: -minX, oy: -minY };
  const label = (c: string) => names[c] ?? [c];
  const cubes = byDepth([...ring.map((r) => ({ at: r.at, size: [1, 1, r.h] as Grid, kind: "leaf" as const })), { at: slab.at, size: slab.size, kind: "gold" as const }]);
  const alt = `Eight role categories as blocks on a ring around one revenue engine: ${cats.map((c) => c.category).join(", ")}.`;
  return (
    <svg className="hero-wheel" viewBox={`0 0 ${Math.ceil(maxX - minX)} ${Math.ceil(maxY - minY)}`} role="img" aria-label={alt}>
      <title>{alt}</title>
      <ellipse className="hero-ring" cx={o.ox} cy={o.oy} rx={rx} ry={ry} />
      {cubes.map((c, n) => (
        <Cuboid key={n} {...o} at={c.at} size={c.size} kind={c.kind} />
      ))}
      <text className="hero-wheel-c" x={o.ox} y={o.oy - slab.size[2] * DEPTH + 3} textAnchor="middle">
        Revenue engine
      </text>
      {ring.map((r) => {
        const vertical = Math.abs(r.x) < 1;
        const anchor = vertical ? "middle" : r.x > 0 ? "start" : "end";
        const lx = vertical ? r.x : r.x + Math.sign(r.x) * (HALF + 12);
        const lines = label(r.c.category);
        const ly = vertical ? (r.y < 0 ? r.y - r.h * DEPTH - RISE - 12 - (lines.length - 1) * 13 : r.y + RISE + 16) : r.y - (r.h * DEPTH) / 2 - ((lines.length - 1) * 13) / 2 + 4;
        return (
          <text key={r.c.category} className="hero-wheel-l" x={o.ox + lx} y={o.oy + ly} textAnchor={anchor}>
            {lines.map((ln, n) => (
              <tspan key={ln} x={o.ox + lx} dy={n === 0 ? 0 : 13}>
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
