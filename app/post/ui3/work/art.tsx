/**
 * The work pages' title band scenes (find-design/v5/work.html, WI): one per module, cut from the
 * same Fractions pieces as ui3/illustrations.tsx (whose pieces stay private there, so the few used
 * here are repeated). Colors are --i-* variables, so each scene follows light and dark.
 *
 *   pipeline    the climb to the flag (each step a stage)
 *   proposals   the page in the morning light
 *   contracts   a bridge both sides cross to meet
 *   evidence    proof stacked up like a cairn
 *   community   peers around one fire
 */
import { MI } from "../illustrations";

type Pt = [number, number];
type Corner = "tl" | "tr" | "br" | "bl";
type Dir = "u" | "d" | "l" | "r";

const n = (v: number) => String(Math.round(v * 10) / 10);
const F = (c: string) => ` fill="var(--i-${c})" stroke="var(--i-${c})"`;
const C4 = (x: number, y: number, r: number): Pt[] => [[x, y], [x + r, y], [x + r, y + r], [x, y + r]];
const IDX: Record<Corner, number> = { tl: 0, tr: 1, br: 2, bl: 3 };
const p = (pt: Pt) => `${n(pt[0])} ${n(pt[1])}`;
const q = (x: number, y: number, r: number, c: Corner, col: string) => {
  const k = C4(x, y, r), i = IDX[c];
  return `<path${F(col)} d="M${p(k[i])}L${p(k[(i + 1) % 4])}A${n(r)} ${n(r)} 0 0 1 ${p(k[(i + 3) % 4])}Z"/>`;
};
const o = (x: number, y: number, r: number, c: Corner, col: string) => {
  const k = C4(x, y, r), s0 = IDX[c], i = (s0 + 2) % 4;
  return `<path${F(col)} d="M${p(k[(i + 1) % 4])}L${p(k[s0])}L${p(k[(i + 3) % 4])}A${n(r)} ${n(r)} 0 0 0 ${p(k[(i + 1) % 4])}Z"/>`;
};
const h = (x: number, y: number, r: number, d: Dir, col: string) => {
  const R = n(r);
  const D =
    d === "u" ? `M${n(x)} ${n(y + r)}A${R} ${R} 0 0 1 ${n(x + 2 * r)} ${n(y + r)}Z`
    : d === "d" ? `M${n(x)} ${n(y)}A${R} ${R} 0 0 0 ${n(x + 2 * r)} ${n(y)}Z`
    : d === "l" ? `M${n(x + r)} ${n(y)}A${R} ${R} 0 0 0 ${n(x + r)} ${n(y + 2 * r)}Z`
    : `M${n(x)} ${n(y)}A${R} ${R} 0 0 1 ${n(x)} ${n(y + 2 * r)}Z`;
  return `<path${F(col)} d="${D}"/>`;
};
const s = (x: number, y: number, w: number, hh: number, col: string) => `<rect${F(col)} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hh)}"/>`;
const ball = (cx: number, cy: number, r: number, col: string) => `<circle${F(col)} cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
const tent = (x: number, y: number, r: number, col: string) => o(x - r, y - r, r, "br", col) + o(x, y - r, r, "bl", col);
const arch = (x: number, y: number, r: number, hh: number, col: string) => h(x, y - hh, r, "u", col) + s(x, y - hh + r, 2 * r, hh - r, col);
const leaf = (x: number, y: number, r: number, col: string, flip?: boolean) =>
  `<path${F(col)} d="M${n(x)} ${n(y)}A${n(r)} ${n(r)} 0 0 ${flip ? 0 : 1} ${n(x + (flip ? -r : r))} ${n(y - r)}A${n(r)} ${n(r)} 0 0 ${flip ? 0 : 1} ${n(x)} ${n(y)}Z"/>`;
const spark = (cx: number, cy: number, r: number, col: string) => o(cx - r, cy - r, r, "br", col) + o(cx, cy - r, r, "bl", col) + o(cx - r, cy, r, "tr", col) + o(cx, cy, r, "tl", col);
const steps = (pts: Pt[], r: number, col: string) => pts.map((pt, i) => h(pt[0] - r, i % 2 ? pt[1] - r : pt[1], r, i % 2 ? "u" : "d", col)).join("");
const tree = (x: number, y: number, r: number, col: string, trunk?: string) =>
  s(x - r * 0.12, y - r * 0.5, r * 0.24, r * 0.5, trunk || "f4") + tent(x, y - r * 0.35, r, col) + tent(x, y - r * 1.05, r * 0.78, col) + tent(x, y - r * 1.65, r * 0.55, col);
const fig = (kind: "sit" | "walk", x: number, y: number, w: number, flip?: boolean) => {
  const raw = (kind === "sit" ? MI.figureSit : MI.figureWalk)({ fit: "xMidYMax meet" });
  const hgt = kind === "sit" ? w * 1.3 : w * 1.875;
  const inner = raw.replace("<svg ", `<svg x="0" y="0" width="${w}" height="${hgt}" `);
  return flip ? `<g transform="translate(${x + w} ${y - hgt}) scale(-1 1)">${inner}</g>` : `<g transform="translate(${x} ${y - hgt})">${inner}</g>`;
};
const wrap = (inner: string) => `<svg class="mi" viewBox="0 0 640 240" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">${inner}</svg>`;
const back = () => h(160, 110, 190, "u", "l1") + h(420, 70, 230, "u", "l1");

const SCENES = {
  pipeline: () =>
    wrap([back(), h(520, 34, 46, "u", "sun"), tent(540, 240, 118, "l3"), tent(430, 240, 80, "l2"), o(540, 122, 118, "bl", "l4"), s(538, 54, 4, 70, "hair"), q(542, 54, 24, "tl", "gold"),
      steps([[330, 236], [362, 228], [394, 218], [426, 206], [456, 192], [484, 176]], 5, "sand"), q(250, 160, 80, "tr", "f3"), q(330, 180, 60, "tl", "f2"), leaf(268, 236, 40, "f4"), fig("walk", 418, 210, 26), spark(612, 96, 6, "sun-2")].join("")),
  proposals: () =>
    wrap([back(), h(470, 40, 80, "u", "sun"), h(330, 150, 110, "u", "l2"), h(500, 140, 120, "u", "l3"), s(468, 62, 104, 132, "sand"), o(552, 62, 20, "bl", "gold"), s(484, 88, 60, 6, "l3"), s(484, 104, 72, 6, "l3"), s(484, 120, 50, 6, "l3"), s(484, 150, 40, 10, "f3"),
      q(380, 180, 70, "tr", "f2"), q(560, 180, 80, "tl", "f3"), leaf(420, 240, 46, "f4"), leaf(600, 240, 38, "f2", true), spark(440, 70, 6, "sun-2")].join("")),
  contracts: () =>
    wrap([back(), h(500, 46, 44, "u", "sun"), s(300, 204, 340, 36, "l2"), s(300, 214, 340, 3, "l3"), s(300, 226, 340, 3, "l3"), q(300, 150, 90, "br", "f3"), s(300, 150, 90, 54, "f3"), q(560, 140, 90, "bl", "f2"), s(560, 140, 90, 64, "f2"),
      s(380, 146, 190, 10, "rock"), arch(396, 204, 18, 48, "deep"), arch(452, 204, 18, 48, "deep"), arch(508, 204, 18, 48, "deep"), fig("walk", 420, 146, 22), fig("walk", 494, 146, 22, true), spark(610, 92, 6, "sun-2")].join("")),
  evidence: () =>
    wrap([back(), h(430, 50, 60, "u", "sun"), h(350, 160, 100, "u", "l2"), q(560, 150, 90, "tl", "l3"), s(470, 206, 120, 34, "rock"), h(480, 160, 50, "u", "l4"), s(494, 176, 72, 30, "gold"), h(500, 136, 30, "u", "cobalt"), ball(530, 128, 12, "sun-2"),
      s(528, 70, 4, 50, "hair"), q(532, 70, 20, "tl", "f3"), q(320, 180, 70, "tr", "f2"), leaf(360, 240, 44, "f4"), fig("sit", 420, 216, 46), spark(600, 84, 6, "sun-2")].join("")),
  community: () =>
    wrap([back(), h(520, 30, 50, "u", "sun"), h(330, 160, 120, "u", "l2"), h(500, 150, 120, "u", "l3"), q(300, 170, 80, "tr", "f3"), q(580, 170, 70, "tl", "f2"), s(300, 216, 340, 24, "f2"),
      tent(492, 216, 14, "ember"), tent(492, 216, 8, "sun"), s(472, 214, 40, 5, "rock"), fig("sit", 410, 220, 54), fig("walk", 520, 218, 30, true), tree(610, 216, 30, "f3"), spark(440, 70, 6, "sun-2")].join("")),
};
export type WorkArt = keyof typeof SCENES;

/** One scene, inline (our own static drawing, no member text in it). Decorative. */
export function WArt({ name, className }: { name: WorkArt; className?: string }) {
  return <div className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SCENES[name]() }} />;
}
