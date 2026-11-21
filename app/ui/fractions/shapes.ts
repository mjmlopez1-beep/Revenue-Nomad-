/**
 * Fractions, Merlin's illustration system: the five pieces, as SVG path data.
 *
 * Every picture is cut from halves and quarters of a circle, the off-cut (a square minus its
 * quarter) and the square, flat and sharp, on a 40px grid (20 and 10 for eyes, steps and
 * sparks). The one whole circle is the crystal ball, and it is drawn as a <circle> in kit.tsx.
 *
 * These are pure functions: numbers in, a path `d` out, so pieces of one colour can be joined
 * into a single path. Nothing here knows about React or the page.
 */

export type Corner = "tl" | "tr" | "br" | "bl";
export type Dir = "u" | "d" | "l" | "r";
export type Pt = readonly [number, number];

const n = (v: number) => String(Math.round(v * 100) / 100);
const p = (pt: Pt) => `${n(pt[0])} ${n(pt[1])}`;
/** The square's corners, clockwise from the top left. */
const corners = (x: number, y: number, r: number): Pt[] => [
  [x, y],
  [x + r, y],
  [x + r, y + r],
  [x, y + r],
];
const AT: Record<Corner, number> = { tl: 0, tr: 1, br: 2, bl: 3 };

/** Quarter circle in the square (x, y, r, r). `c` is the corner that holds the circle's centre. */
export function quarter(x: number, y: number, r: number, c: Corner): string {
  const k = corners(x, y, r);
  const i = AT[c];
  return `M${p(k[i])}L${p(k[(i + 1) % 4])}A${n(r)} ${n(r)} 0 0 1 ${p(k[(i + 3) % 4])}Z`;
}

/** Off-cut: the square minus its quarter circle. `c` is the solid corner that remains. */
export function offcut(x: number, y: number, r: number, c: Corner): string {
  const k = corners(x, y, r);
  const s = AT[c];
  const i = (s + 2) % 4;
  return `M${p(k[(i + 1) % 4])}L${p(k[s])}L${p(k[(i + 3) % 4])}A${n(r)} ${n(r)} 0 0 0 ${p(k[(i + 1) % 4])}Z`;
}

/** Half circle. u: a dome in the box (x, y, 2r, r). d: a bowl. l and r: bulging left or right in (x, y, r, 2r). */
export function half(x: number, y: number, r: number, d: Dir): string {
  const R = n(r);
  if (d === "u") return `M${n(x)} ${n(y + r)}A${R} ${R} 0 0 1 ${n(x + 2 * r)} ${n(y + r)}Z`;
  if (d === "d") return `M${n(x)} ${n(y)}A${R} ${R} 0 0 0 ${n(x + 2 * r)} ${n(y)}Z`;
  if (d === "l") return `M${n(x + r)} ${n(y)}A${R} ${R} 0 0 0 ${n(x + r)} ${n(y + 2 * r)}Z`;
  return `M${n(x)} ${n(y)}A${R} ${R} 0 0 1 ${n(x)} ${n(y + 2 * r)}Z`;
}

/** The square (or any rectangle of squares). */
export function square(x: number, y: number, w: number, h: number): string {
  return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
}

/** Arch: a half circle on a rectangle. (x, y) is its bottom left, the width is 2r, `h` the whole height. */
export function arch(x: number, y: number, r: number, h: number): string {
  return half(x, y - h, r, "u") + square(x, y - h + r, 2 * r, h - r);
}

/** Tent: two off-cuts back to back, the logo's A. (x, y) is the middle of its base. */
export function tent(x: number, y: number, r: number): string {
  return offcut(x - r, y - r, r, "br") + offcut(x, y - r, r, "bl");
}

/** Spark: four off-cuts with their solid corners together. */
export function spark(cx: number, cy: number, r: number): string {
  return offcut(cx - r, cy - r, r, "br") + offcut(cx, cy - r, r, "bl") + offcut(cx - r, cy, r, "tr") + offcut(cx, cy, r, "tl");
}

/** Footsteps: half dots, one up and one down in turn, never a whole one. */
export function steps(pts: readonly Pt[], r = 8): string {
  return pts.map(([x, y], i) => half(x - r, i % 2 ? y - r : y, r, i % 2 ? "u" : "d")).join("");
}

/** The seat: a square, quarters and off-cuts. (x, y) is the bottom left of its 240 by 320 box. */
export function seat(x: number, y: number): string {
  const U = 40;
  return (
    square(x, y - 4 * U, 6 * U, U) +
    quarter(x + 6 * U, y - 4 * U, U, "bl") +
    square(x, y - 7 * U, U, 3 * U) +
    quarter(x, y - 8 * U, U, "br") +
    offcut(x, y - 3 * U, 3 * U, "tl") +
    offcut(x + 3 * U, y - 3 * U, 3 * U, "tr")
  );
}

/** A straight run to (x, y), or a turn around (cx, cy) with radius r from angle a0 to a1, in degrees. */
export type Seg = readonly ["L", number, number] | readonly ["A", number, number, number, number, number];

/** Points every `gap` px along a path of straight runs and quarter turns, for `steps`. */
export function walk(start: Pt, segs: readonly Seg[], gap = 28): Pt[] {
  const out: Pt[] = [];
  let [x, y] = start;
  let carry = 0;
  const emit = (len: number, at: (d: number) => Pt) => {
    let d = carry;
    while (d <= len) {
      out.push(at(d));
      d += gap;
    }
    carry = d - len;
  };
  for (const sg of segs) {
    if (sg[0] === "L") {
      const [, x1, y1] = sg;
      const len = Math.hypot(x1 - x, y1 - y);
      const x0 = x;
      const y0 = y;
      emit(len, (d) => [x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len]);
      x = x1;
      y = y1;
    } else {
      const [, cx, cy, r, a0, a1] = sg;
      const len = (Math.abs(a1 - a0) * Math.PI * r) / 180;
      emit(len, (d) => {
        const a = ((a0 + ((a1 - a0) * d) / len) * Math.PI) / 180;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      });
      const a = (a1 * Math.PI) / 180;
      x = cx + r * Math.cos(a);
      y = cy + r * Math.sin(a);
    }
  }
  return out;
}
