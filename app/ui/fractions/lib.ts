/**
 * Fractions, the asset library's primitives: the same five pieces as shapes.ts (quarter, half,
 * off-cut, square and the one whole circle), written as SVG markup instead of path data, so a
 * whole illustration is one string and <Fx> (art.tsx) draws it as one inline <svg>.
 *
 * Coordinates are px on the 40px grid (20 and 10 for eyes, steps and sparks). `cls` is always a
 * colour TOKEN (ways.ts), never a hex: the token becomes the class fxc-<token>, and
 * fractions.css gives it its colour, so the same drawing renders loud or quiet.
 *
 * This is a port of the asset library's generator. Nothing here knows about React.
 */
export type Corner = "tl" | "tr" | "br" | "bl";
export type Dir = "u" | "d" | "l" | "r";
/** A colour token: the class it is drawn with is fxc-<token>. */
export type Tok = string;

const C = (x: number, y: number, r: number): [number, number][] => [
  [x, y],
  [x + r, y],
  [x + r, y + r],
  [x, y + r],
];
const IDX: Record<Corner, number> = { tl: 0, tr: 1, br: 2, bl: 3 };
const n = (v: number) => String(Math.round(v * 100) / 100);
const p = (pt: [number, number]) => `${n(pt[0])} ${n(pt[1])}`;
const at = (cls: Tok) => `class="fxc-${cls}"`;

/** Quarter circle in the square (x, y, r, r); `c` is the corner that holds the circle's centre. */
export const q = (x: number, y: number, r: number, c: Corner, cls: Tok): string => {
  const k = C(x, y, r);
  const i = IDX[c];
  return `<path ${at(cls)} d="M${p(k[i])}L${p(k[(i + 1) % 4])}A${n(r)} ${n(r)} 0 0 1 ${p(k[(i + 3) % 4])}Z"/>`;
};
/** Off-cut: the square minus its quarter circle; `c` is the solid corner that remains. */
export const o = (x: number, y: number, r: number, c: Corner, cls: Tok): string => {
  const k = C(x, y, r);
  const s0 = IDX[c];
  const i = (s0 + 2) % 4;
  return `<path ${at(cls)} d="M${p(k[(i + 1) % 4])}L${p(k[s0])}L${p(k[(i + 3) % 4])}A${n(r)} ${n(r)} 0 0 0 ${p(k[(i + 1) % 4])}Z"/>`;
};
/** Half circle. u: a dome in the box (x, y, 2r, r). d: a bowl. l and r: bulging left or right in (x, y, r, 2r). */
export const h = (x: number, y: number, r: number, d: Dir, cls: Tok): string => {
  const R = n(r);
  const D =
    d === "u"
      ? `M${n(x)} ${n(y + r)}A${R} ${R} 0 0 1 ${n(x + 2 * r)} ${n(y + r)}Z`
      : d === "d"
        ? `M${n(x)} ${n(y)}A${R} ${R} 0 0 0 ${n(x + 2 * r)} ${n(y)}Z`
        : d === "l"
          ? `M${n(x + r)} ${n(y)}A${R} ${R} 0 0 0 ${n(x + r)} ${n(y + 2 * r)}Z`
          : `M${n(x)} ${n(y)}A${R} ${R} 0 0 1 ${n(x)} ${n(y + 2 * r)}Z`;
  return `<path ${at(cls)} d="${D}"/>`;
};
/** The square (or any rectangle of squares). */
export const s = (x: number, y: number, w: number, hh: number, cls: Tok): string => `<rect ${at(cls)} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hh)}"/>`;
/** The one whole circle: the crystal ball. */
export const ball = (cx: number, cy: number, r: number, cls: Tok = "acc"): string => `<circle ${at(cls)} cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
export const g = (inner: string, tf = ""): string => `<g${tf ? ` transform="${tf}"` : ""}>${inner}</g>`;
/** Place a local-coordinate drawing: origin to (x, y), scaled, optionally mirrored. */
export const place = (inner: string, x: number, y: number, sc = 1, flip = false): string => g(inner, `translate(${n(x)} ${n(y)}) scale(${flip ? -sc : sc} ${sc})`);
/**
 * Clip a drawing to a rectangle or a circle (peeks, crops, what the ball shows). The clip's id is
 * written with a `§` that <Fx> swaps for its own id, so two copies of one drawing on a page never
 * share a clip.
 */
let clipN = 0;
export const clip = (inner: string, x: number, y: number, w: number, hh: number): string => {
  const id = `fc§${++clipN}`;
  return `<clipPath id="${id}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hh)}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`;
};
export const clipCircle = (inner: string, cx: number, cy: number, r: number): string => {
  const id = `fc§${++clipN}`;
  return `<clipPath id="${id}"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`;
};
/** A bar with half-circle ends (a square and two halves): a coin seen edge on, a rung, a measuring bar. */
export const pill = (x: number, y: number, w: number, hh: number, cls: Tok): string => h(x, y, hh / 2, "l", cls) + s(x + hh / 2, y, w - hh, hh, cls) + h(x + w - hh / 2, y, hh / 2, "r", cls);
/** The grid. */
export const U = 40;
