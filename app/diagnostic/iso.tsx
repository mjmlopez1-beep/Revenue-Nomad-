/**
 * The isometric grid shared by the Diagnostic's drawings: the same geometry as the homepage's cube solid
 * (app/home/CubeSolid.tsx): half width 24.25, rise 14, depth 28. A grid corner (i, j, k) maps to the screen as
 * x = ox + (i - j) * HALF, y = oy + (i + j) * RISE - k * DEPTH, so a unit cube at (i, j, k) has the same three
 * faces as CubeSolid's anchor-based cubes. Fills and strokes are CSS classes in Diagnostic.css (tokens only).
 */
export const HALF = 24.25;
export const RISE = 14;
export const DEPTH = 28;

/** Face palettes, see Diagnostic.css: leaf and forest for the engine, gold for the highlighted element,
 * ghost (dashed) for what is yet to build, l1 to l4 for the four maturity levels (l1 is the night tint). */
export type Kind = "leaf" | "forest" | "gold" | "ghost" | "l1" | "l2" | "l3" | "l4";

export type Grid = [i: number, j: number, k: number];
export type Origin = { ox: number; oy: number };

const f = (n: number) => (Math.round(n * 10) / 10).toString();

export function corner({ ox, oy }: Origin, [i, j, k]: Grid): [number, number] {
  return [ox + (i - j) * HALF, oy + (i + j) * RISE - k * DEPTH];
}

export function points(o: Origin, corners: Grid[]): string {
  return corners
    .map((c) => corner(o, c))
    .map(([x, y]) => `${f(x)},${f(y)}`)
    .join(" ");
}

type CuboidProps = Origin & { at: Grid; size?: Grid; kind: Kind };

/** A cuboid from grid corner `at` with `size` cells along i, j and k: top, left (the j-max side) and right
 * (the i-max side) faces, the three a viewer sees from this angle. */
export function Cuboid({ ox, oy, at: [i, j, k], size: [di, dj, dk] = [1, 1, 1], kind }: CuboidProps) {
  const o = { ox, oy };
  const i1 = i + di;
  const j1 = j + dj;
  const k1 = k + dk;
  return (
    <g className={`dx-cube dx-cube--${kind}`}>
      <polygon className="dx-face dx-face--l" points={points(o, [[i, j1, k1], [i1, j1, k1], [i1, j1, k], [i, j1, k]])} />
      <polygon className="dx-face dx-face--r" points={points(o, [[i1, j, k1], [i1, j1, k1], [i1, j1, k], [i1, j, k]])} />
      <polygon className="dx-face dx-face--t" points={points(o, [[i, j, k1], [i1, j, k1], [i1, j1, k1], [i, j1, k1]])} />
    </g>
  );
}

/** Painter's order for unit cubes on this grid: farther (smaller i + j) and lower first. */
export function byDepth<T extends { at: Grid }>(cubes: T[]): T[] {
  return [...cubes].sort((a, b) => a.at[0] + a.at[1] + a.at[2] - (b.at[0] + b.at[1] + b.at[2]));
}
