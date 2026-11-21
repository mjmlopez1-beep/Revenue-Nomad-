/**
 * Fractions props: one named function a prop, each tied to one product meaning (the ball: who
 * hires next; the seat; the door: locked, ajar, open; the camp; the trail; credits as coins seen
 * edge on; key and lock; and the rest). Drawn from the shared primitives in LOCAL coordinates:
 * x = 0 is the centre line, y = 0 the ground, up is negative. `m` is a colourway (ways.ts), so the
 * same prop renders loud or quiet without touching its geometry.
 *
 * A port of the asset library's generator, geometry unchanged. PROP_BOX (below) holds each
 * prop's bounding box in grid units, which <Prop> (art.tsx) uses to frame it.
 */
import { q, o, h, s, ball, g, U, place, clip, clipCircle, pill, type Tok } from "./lib";
import { orb, spark, dot, shade, nomad } from "./nomad";
import type { Way } from "./ways";

type Pt = [number, number];
type Seg = ["L", number, number] | ["A", number, number, number, number, number];
type PropFn = (m: Way) => string;

// ---------- shared small assemblies ----------
/** Tent: two off-cuts back to back (the mark's A), with a flap. Base centre (x,y). */
export const tent = (x: number, y: number, r: number, cls: Tok = "pine", flap: Tok | null = "sand"): string =>
  o(x - r, y - r, r, "br", cls) + o(x, y - r, r, "bl", cls) + (flap ? o(x - r / 4, y - r / 4, r / 4, "br", flap) + o(x, y - r / 4, r / 4, "bl", flap) : "");
/** Arch: a half circle on a rectangle. Bottom-left (x,y), width 2r, total height hh. */
export const arch = (x: number, y: number, r: number, hh: number, cls: Tok): string => h(x, y - hh, r, "u", cls) + s(x, y - hh + r, 2 * r, hh - r, cls);
/** Footstep half-dots along sampled points. */
export const steps = (pts: Pt[], r = 8, cls: Tok = "pine"): string => pts.map(([x, y], i) => h(x - r, i % 2 ? y - r : y, r, i % 2 ? "u" : "d", cls)).join("");
/** Sample points every `gap` px along segments: ["L",x,y] or ["A",cx,cy,r,a0,a1] (degrees). */
export const walk = (start: Pt, segs: Seg[], gap = 28): Pt[] => {
  const out: Pt[] = []; let [x, y] = start; let carry = 0;
  const emit = (len: number, at: (d: number) => Pt) => { let d = carry; while (d <= len) { out.push(at(d)); d += gap; } carry = d - len; };
  for (const sg of segs) {
    if (sg[0] === "L") { const [, x1, y1] = sg; const len = Math.hypot(x1 - x, y1 - y); const x0 = x, y0 = y; emit(len, (d) => [x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len]); x = x1; y = y1; }
    else { const [, cx, cy, r, a0, a1] = sg; const len = (Math.abs(a1 - a0) * Math.PI * r) / 180; emit(len, (d) => { const a = ((a0 + ((a1 - a0) * d) / len) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }); const a = (a1 * Math.PI) / 180; x = cx + r * Math.cos(a); y = cy + r * Math.sin(a); }
  }
  return out.map(([a, b]): Pt => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
};
/** The seat: square, quarters, off-cuts. Bottom-left of its 6U x 8U box at (x,y). */
export const chair = (x: number, y: number, cls: Tok = "pine"): string =>
  s(x, y - 4 * U, 6 * U, U, cls) + q(x + 6 * U, y - 4 * U, U, "bl", cls) +
  s(x, y - 7 * U, U, 3 * U, cls) + q(x, y - 8 * U, U, "br", cls) +
  o(x, y - 3 * U, 3 * U, "tl", cls) + o(x + 3 * U, y - 3 * U, 3 * U, "tr", cls);
/** The ball's stand: the mark's A on a slab. Top centre at (0, -3U). */
const plinth = (c: Tok): string => s(-U, -3 * U, 2 * U, 2 * U, c) + o(-3 * U, -3 * U, 2 * U, "br", c) + o(U, -3 * U, 2 * U, "bl", c) + s(-4 * U, -U, 8 * U, U, c);

// ---------- 1. the crystal ball ----------
export const ballPlain: PropFn = (m) => orb(0, -2 * U, 2 * U, m.acc, m.acchi);
export const ballGlow: PropFn = (m) => h(-3.5 * U, -5.5 * U, 3.5 * U, "u", m.tone) + orb(0, -2 * U, 2 * U, m.acc, m.acchi) +
  spark(-3 * U, -4.5 * U, 20, m.spark) + spark(3.25 * U, -3.5 * U, 14, m.spark) + spark(2 * U, -5.25 * U, 10, m.spark);
/** What the ball shows: three camps, the hot one is next. */
export const ballScene = (m: Way, r = 3 * U): string => {
  const cy = -r;
  return ball(0, cy, r, m.acc) + clipCircle(s(-r, cy + r / 3, 2 * r, r, m.acchi) + tent(-r * 0.58, cy + r / 3, r / 3, "pine", null) + tent(r * 0.58, cy + r / 3, r / 3, "pine", null) + tent(0, cy + r / 3, r / 2, m.hot, m.acchi) + spark(r * 0.42, cy - r * 0.42, r / 12, "white"), 0, cy, r) + q(-r * 0.66, cy - r * 0.66, r / 3, "br", m.acchi);
};
export const ballPlinth: PropFn = (m) => plinth(m.paper) + g(ballScene(m), `translate(0 ${-3 * U})`);
export const ballEmpty: PropFn = (m) => plinth(m.paper) + orb(0, -6 * U, 3 * U, m.acc, m.acchi);

// ---------- 2. the seat ----------
export const seatEmpty: PropFn = (m) => chair(-3 * U, 0, m.ink);
/** Held by someone you cannot see yet: the silhouette one tone off the field. */
export const seatHeld: PropFn = (m) => place(shade(m.tone), 0.5 * U, -4 * U, 0.5) + chair(-3 * U, 0, m.ink);
/** Your seat: the Nomad on it. */
export const seatYours: PropFn = (m) => chair(-3 * U, 0, m.ink) + place(nomad("stand", { cloak: m.cloak, face: m.face, eye: m.eye }), 0.5 * U, -4 * U, 0.5);
/** Two seats: a repeat hirer. */
export const seatPair: PropFn = (m) => g(chair(-3 * U, 0, m.ink), `translate(${-2.5 * U} 0) scale(0.7)`) + g(chair(-3 * U, 0, m.ink2), `translate(${2.5 * U} 0) scale(-0.7 0.7)`);
/** A row of seats, one per function; the hot one is open. */
export const seatRow: PropFn = (m) => [m.ink, m.ink2, m.hot, m.ink].map((c, i) => g(chair(-3 * U, 0, c), `translate(${(i - 1.5) * 3 * U - 0.2 * U} 0) scale(0.4)`)).join("") + spark(1.4 * U, -4.1 * U, 12, m.acc);

// ---------- 3. the doorway ----------
const frame = (m: Way): string => arch(-2 * U, 0, 2 * U, 6 * U, m.ink);
export const doorClosed: PropFn = (m) => frame(m) + arch(-1.5 * U, 0, 1.5 * U, 5.5 * U, m.ink2) + dot(0.9 * U, -2.4 * U, 8, true, m.acc);
/** Ajar: one leaf still shut, light in the other half. */
export const doorAjar: PropFn = (m) => frame(m) + arch(-1.5 * U, 0, 1.5 * U, 5.5 * U, m.light) + q(-1.5 * U, -5.5 * U, 1.5 * U, "br", m.ink2) + s(-1.5 * U, -4 * U, 1.5 * U, 4 * U, m.ink2) + dot(-0.45 * U, -2.4 * U, 8, true, m.acc);
/** Open: nested arches, the lining saffron, light at the back. */
export const doorOpen: PropFn = (m) => frame(m) + arch(-1.5 * U, 0, 1.5 * U, 5.5 * U, m.lining) + arch(-U, 0, U, 4.5 * U, m.light) + spark(2.75 * U, -5.5 * U, 14, m.spark) + spark(-2.9 * U, -3.5 * U, 8, m.spark);
/** A row of doors: companies. One is lit. */
export const doorRow: PropFn = (m) => arch(-5 * U, 0, U, 4 * U, m.ink) + arch(-2.5 * U, 0, U, 5 * U, m.ink2) + arch(0, 0, U, 3.5 * U, m.ink) + arch(0.25 * U, 0, 0.75 * U, 3.25 * U, m.light) + arch(2.5 * U, 0, U, 4.5 * U, m.ink) + arch(5 * U - U, 0, U, 3 * U, m.ink2) + spark(U, -4.5 * U, 12, m.acc);

// ---------- 4. tent and camp ----------
export const tentOne: PropFn = (m) => tent(0, 0, 4 * U, m.ink, m.bg);
export const camp: PropFn = (m) => tent(-1.5 * U, 0, 4 * U, m.ink, m.bg) + tent(2.75 * U, 0, 2 * U, m.ink2, m.bg) + s(4.9 * U, -4.5 * U, 0.2 * U, 4.5 * U, m.ink) + q(5.1 * U, -4.5 * U, U, "tl", m.hot) + spark(1.6 * U, -0.6 * U, 14, m.acc);

// ---------- 5. the trail ----------
export const trailStraight: PropFn = (m) => tent(-3.5 * U, 0, 1.25 * U, m.ink, m.bg) + steps(walk([-1.9 * U, -0.5 * U], [["L", 1.6 * U, -0.5 * U]], 38), 12, m.ink) + tent(3.75 * U, 0, 1.75 * U, m.ink2, m.bg);
export const trailWinding: PropFn = (m) => tent(-3.5 * U, 0, 1.25 * U, m.ink, m.bg) +
  steps(walk([-1.9 * U, -0.5 * U], [["L", -0.75 * U, -0.5 * U], ["A", -0.75 * U, -2 * U, 1.5 * U, 90, 0], ["A", 2.25 * U, -2 * U, 1.5 * U, 180, 270], ["L", 2.5 * U, -3.5 * U]], 38), 12, m.ink) +
  s(2.75 * U, -3 * U, 2.75 * U, 0.25 * U, m.ink2) + tent(4.25 * U, -3 * U, 1.25 * U, m.ink2, m.bg);
export const trailFork: PropFn = (m) => steps(walk([-4.5 * U, -0.5 * U], [["L", -1.6 * U, -0.5 * U]], 38), 12, m.ink) +
  steps(walk([-0.9 * U, -0.75 * U], [["A", -1 * U, -3.25 * U, 2.5 * U, 80, 10]], 38), 12, m.ink) +
  steps(walk([-0.6 * U, -0.5 * U], [["L", 2 * U, -0.5 * U]], 38), 12, m.ink2) +
  s(1.5 * U, -3.5 * U, 2.75 * U, 0.25 * U, m.ink) + tent(3 * U, -3.5 * U, 1.1 * U, m.ink, m.bg) + tent(3.75 * U, 0, 1.25 * U, m.ink2, m.bg);

// ---------- 6. spark ----------
export const sparks: PropFn = (m) => spark(-1.5 * U, -2.5 * U, 2 * U, m.acc) + spark(2 * U, -4.5 * U, 0.75 * U, m.spark) + spark(2.5 * U, -1.25 * U, 0.4 * U, m.spark);

// ---------- 7. credits ----------
/** A credit is a coin seen edge on: a bar with half-circle ends. Never a whole circle. */
export const coin: PropFn = (m) => pill(-2 * U, -0.9 * U, 4 * U, 0.8 * U, m.ink) + pill(-1.6 * U, -1.9 * U, 4 * U, 0.8 * U, m.ink2) + spark(2.4 * U, -3.1 * U, 14, m.acc);
export const coinStack: PropFn = (m) => [0, 1, 2, 3, 4].map((i) => pill(-2 * U + (i === 4 ? 12 : i === 2 ? -8 : 0), -(i + 1) * 0.9 * U + 4, 4 * U, 0.75 * U, i % 2 ? m.ink : m.ink2)).join("") + spark(2.6 * U, -5 * U, 14, m.acc);
export const coinPair: PropFn = (m) => [0, 1, 2].map((i) => pill(-4 * U, -(i + 1) * 0.9 * U + 4, 3.5 * U, 0.75 * U, m.ink2)).join("") + [0, 1, 2, 3, 4].map((i) => pill(0.25 * U + (i === 3 ? 10 : 0), -(i + 1) * 0.9 * U + 4, 3.5 * U, 0.75 * U, m.ink)).join("");

// ---------- 8. key and lock ----------
/** Key: a half-circle bow on a square, a shaft, two square bits. Centred, floating 1U above y=0. */
export const key = (m: Way, c: Tok = m.ink): string => h(-3.5 * U, -3 * U, U, "l", c) + s(-2.5 * U, -3 * U, U, 2 * U, c) + s(-2.75 * U, -2.25 * U, 0.5 * U, 0.5 * U, m.bg) +
  s(-1.5 * U, -2.25 * U, 5 * U, 0.5 * U, c) + s(2 * U, -1.75 * U, 0.5 * U, 0.75 * U, c) + s(3 * U, -1.75 * U, 0.5 * U, 0.5 * U, c);
const lockBody = (m: Way): string => s(-2 * U, -3 * U, 4 * U, 3 * U, m.ink) + arch(-0.4 * U, -0.9 * U, 0.4 * U, 1.2 * U, m.acc);
export const lock: PropFn = (m) => arch(-1.5 * U, -3 * U, 1.5 * U, 2.5 * U, m.ink) + arch(-0.75 * U, -3 * U, 0.75 * U, 1.75 * U, m.bg) + lockBody(m);
export const lockOpen: PropFn = (m) => arch(-1.5 * U, -3 * U, 1.5 * U, 3.5 * U, m.ink) + arch(-0.75 * U, -3 * U, 0.75 * U, 2.75 * U, m.bg) + s(0.75 * U, -4 * U, 0.75 * U, U, m.bg) + lockBody(m) + spark(2.75 * U, -5.5 * U, 16, m.spark);

// ---------- 9. lantern ----------
export const lantern: PropFn = (m) => s(-0.15 * U, -6 * U, 0.3 * U, 0.75 * U, m.ink) + h(-1.5 * U, -5.25 * U, 1.5 * U, "u", m.ink) + s(-1.5 * U, -3.75 * U, 3 * U, 3 * U, m.light) + s(-1.75 * U, -0.75 * U, 3.5 * U, 0.75 * U, m.ink) + spark(0, -2.25 * U, 30, m.acc);

// ---------- 10. ledger and scroll: the facts ----------
export const ledger: PropFn = (m) =>
  s(-4 * U, -4 * U, 4 * U, 3 * U, m.paper) + q(-4 * U, -U, U, "tr", m.paper) + s(-3 * U, -U, 3 * U, U, m.paper) +
  s(0, -4 * U, 4 * U, 3 * U, m.paper) + q(3 * U, -U, U, "tl", m.paper) + s(0, -U, 3 * U, U, m.paper) +
  s(-3, -4 * U, 6, 4 * U, m.ink2) +
  [0, 1, 2].map((i) => s(-3.25 * U, -3.25 * U + i * 0.9 * U, 2.5 * U, 10, m.dark)).join("") + s(0.75 * U, -3.25 * U, 2.5 * U, 10, m.dark) + s(0.75 * U, -2.35 * U, 1.75 * U, 10, m.hot) ;
export const scroll: PropFn = (m) => s(-2 * U, -5.5 * U, 4 * U, 5 * U, m.paper) + pill(-2.5 * U, -6 * U, 5 * U, 0.75 * U, m.ink) + pill(-2.5 * U, -0.75 * U, 5 * U, 0.75 * U, m.ink) +
  [0, 1, 2].map((i) => s(-1.25 * U, -4.5 * U + i * 0.9 * U, 2.5 * U, 10, m.dark)).join("") + s(-1.25 * U, -1.8 * U, 1.5 * U, 10, m.hot);

// ---------- 11. flag and waypoint ----------
export const flag: PropFn = (m) => s(-0.2 * U, -6 * U, 0.4 * U, 6 * U, m.ink) + q(0.2 * U, -6 * U, 2.5 * U, "tl", m.hot) + h(-U, -U, U, "u", m.ink2);
/** Waypoint: three stones, each a half. Following. */
export const cairn: PropFn = (m) => h(-2 * U, -2 * U, 2 * U, "u", m.ink) + h(-1 * U, -3.25 * U, 1.25 * U, "u", m.ink2) + h(-0.95 * U, -4 * U, 0.75 * U, "u", m.ink) + spark(2 * U, -4.5 * U, 12, m.acc);

// ---------- 12. signpost ----------
export const signpost: PropFn = (m) => s(-0.25 * U, -6 * U, 0.5 * U, 6 * U, m.ink) +
  s(-0.25 * U, -5.5 * U, 2.5 * U, U, m.ink2) + q(2.25 * U, -5.5 * U, U, "bl", m.ink2) +
  s(-2.25 * U, -4 * U, 2.5 * U, U, m.ink) + q(-3.25 * U, -4 * U, U, "br", m.ink) +
  s(-0.25 * U, -2.5 * U, 1.75 * U, U, m.hot) + q(1.5 * U, -2.5 * U, U, "bl", m.hot);

// ---------- 13. bell ----------
export const bell: PropFn = (m) => h(-0.4 * U, -5.65 * U, 0.4 * U, "u", m.ink) + h(-1.5 * U, -5.25 * U, 1.5 * U, "u", m.ink) + s(-1.5 * U, -3.75 * U, 3 * U, 2.25 * U, m.ink) +
  o(-2.5 * U, -2.5 * U, U, "br", m.ink) + o(1.5 * U, -2.5 * U, U, "bl", m.ink) + h(-0.6 * U, -1.5 * U, 0.6 * U, "d", m.hot) +
  dot(2.9 * U, -5 * U, 8, true, m.spark) + dot(3.5 * U, -4.2 * U, 8, true, m.spark);

// ---------- 14. messages ----------
export const envelope: PropFn = (m) => s(-3 * U, -4 * U, 6 * U, 4 * U, m.paper) + o(-3 * U, -4 * U, 3 * U, "tr", m.ink2) + o(0, -4 * U, 3 * U, "tl", m.ink2) + spark(0, -1.35 * U, 14, m.hot);
export const bubbles: PropFn = (m) => s(-4 * U, -5.5 * U, 5.5 * U, 3 * U, m.ink) + q(-3.5 * U, -2.5 * U, U, "tr", m.ink) +
  [0, 1, 2].map((i) => dot(-2.5 * U + i * 1.25 * U, -4 * U, 8, i % 2 === 0, m.bg)).join("") +
  s(-0.5 * U, -2.9 * U, 4.5 * U, 2 * U, m.ink2) + q(3 * U, -0.9 * U, 0.9 * U, "tl", m.ink2);

// ---------- 15. bridge: the warm path ----------
export const bridge = (m: Way, bare = false): string => s(-5 * U, -2.5 * U, 10 * U, 2.5 * U, m.ink) + h(-4 * U, -1.75 * U, 1.75 * U, "u", m.bg) + h(0.5 * U, -1.75 * U, 1.75 * U, "u", m.bg) +
  (bare ? "" : steps([-3, -1.8, -0.6, 0.6, 1.8, 3].map((x): Pt => [x * U, -2.9 * U]), 8, m.ink2) + tent(-5 * U, -2.5 * U, U, m.ink2, null) + tent(5 * U, -2.5 * U, U, m.hot, null));

// ---------- 16. landscape ----------
export const mountains: PropFn = (m) => tent(-3 * U, 0, 3 * U, m.tone, null) + tent(1.25 * U, 0, 5 * U, m.ink, null) + clip(tent(1.25 * U, 0, 5 * U, m.paper, null), -4 * U, -5 * U, 10 * U, 1.9 * U) + spark(-3.75 * U, -4.5 * U, 12, m.spark);
export const dunes: PropFn = (m) => h(-5.5 * U, -2.5 * U, 2.5 * U, "u", m.ink2) + q(-U, -4 * U, 4 * U, "br", m.paper) + q(3 * U, -2 * U, 2 * U, "bl", m.ink) + steps([[-3.5, -3.1], [-2.8, -3.1], [-2.1, -3.1]].map(([a, b]): Pt => [a * U, b * U]), 7, m.dark);

// ---------- 17. time ----------
/** The sun half: new today. */
export const sun: PropFn = (m) => h(-2.5 * U, -2.5 * U, 2.5 * U, "u", m.pop) + s(-4.5 * U, 0 - 0.25 * U, 9 * U, 0.25 * U, m.ink) + spark(-3.5 * U, -3.5 * U, 12, m.acc) + spark(3.25 * U, -3 * U, 8, m.spark) + spark(0, -4 * U, 8, m.spark);
/** The moon half: since your last visit, overnight. */
export const moon: PropFn = (m) => h(-0.5 * U, -5.5 * U, 2 * U, "l", m.paper) + spark(2.5 * U, -4.5 * U, 14, m.spark) + spark(-2.75 * U, -1.5 * U, 8, m.spark) + spark(3 * U, -1.25 * U, 8, m.spark);

// ---------- 18. compass ----------
/** Compass: a spark with a hot north, in its dish. */
export const compass: PropFn = (m) => { const r = 2 * U, cy = -3 * U;
  return h(-0.6 * U, -6.1 * U, 0.6 * U, "u", m.ink) + s(-2.75 * U, -5.75 * U, 5.5 * U, 5.5 * U, m.paper) + s(-2.45 * U, cy - 6, 0.3 * U, 12, m.ink2) + s(2.15 * U, cy - 6, 0.3 * U, 12, m.ink2) +
    o(-r, cy - r, r, "br", m.hot) + o(0, cy - r, r, "bl", m.hot) + o(-r, cy, r, "tr", m.dark) + o(0, cy, r, "tl", m.dark); };

// ---------- 19. the well and the oasis: where everyone draws from ----------
export const well: PropFn = (m) => s(-1.75 * U, -5.5 * U, 0.4 * U, 3.5 * U, m.ink) + s(1.35 * U, -5.5 * U, 0.4 * U, 3.5 * U, m.ink) + tent(0, -5 * U, 2.5 * U, m.ink, null) +
  s(-3, -5 * U, 6, 1.5 * U, m.ink) + s(-0.5 * U, -3.75 * U, U, 0.9 * U, m.paper) + s(-0.5 * U, -3.75 * U, U, 0.3 * U, m.hill) +
  s(-2.5 * U, -2 * U, 5 * U, 0.5 * U, m.ink2) + s(-2 * U, -1.5 * U, 4 * U, 1.5 * U, m.ink);
/** A frond is an arch of leaf: a dome with a smaller dome of the field cut from under it (as a door frame is). */
const frond = (x: number, y: number, r: number, c: Tok, bg: Tok): string => h(x, y, r, "u", c) + h(x + r * 0.3, y + r * 0.45, r * 0.7, "u", bg) + s(x, y + r - 1, 2 * r, 2, bg);
const palm = (x: number, hh: number, r: number, m: Way): string => frond(x - 2 * r, -hh - r * 0.55, r, m.ink2, m.bg) + frond(x, -hh - r * 0.55, r, m.ink2, m.bg) + s(x - r * 0.18, -hh - r * 0.5, r * 0.36, hh + r * 0.5, m.ink) + h(x - r * 0.7, -hh - r * 1.2, r * 0.7, "u", m.ink2);
export const oasis: PropFn = (m) => pill(-3.5 * U, -0.5 * U, 7 * U, 0.5 * U, m.hill) + palm(-1.5 * U, 3.9 * U, 1.3 * U, m) + palm(1.9 * U, 2.2 * U, 0.85 * U, m) + tent(3.6 * U, -0.5 * U, 0.8 * U, m.paper, null);

// ---------- 20. rates ----------
export const scales: PropFn = (m) => tent(0, 0, 1.25 * U, m.ink, null) + s(-0.2 * U, -6 * U, 0.4 * U, 5 * U, m.ink) + h(-0.5 * U, -6.5 * U, 0.5 * U, "u", m.ink) + s(-3.5 * U, -5.75 * U, 7 * U, 0.4 * U, m.ink) +
  s(-3.4 * U, -5.5 * U, 5, 2 * U, m.ink) + s(3.4 * U - 5, -5.5 * U, 5, 2.5 * U, m.ink) + h(-4.7 * U, -3.5 * U, 1.35 * U, "d", m.ink2) + h(2 * U, -3 * U, 1.35 * U, "d", m.ink2) + pill(2.4 * U, -3.45 * U, 1.9 * U, 0.4 * U, m.hot);
/** Measuring bars: arches of different heights, the median marked. */
export const bars = (m: Way, hi: Tok = m.hot): string => [2.5, 4, 5.5, 3.5, 1.75].map((hh, i) => arch((-4.4 + i * 1.8) * U, 0, 0.7 * U, hh * U, i === 2 ? hi : i % 2 ? m.ink2 : m.ink)).join("") + pill(-4.9 * U, -3.6 * U, 9.8 * U, 0.3 * U, m.dark);

// ---------- 21. calendar tile ----------
export const calendar: PropFn = (m) => s(-3 * U, -5.5 * U, 6 * U, 5.5 * U, m.paper) + s(-3 * U, -5.5 * U, 6 * U, 1.5 * U, m.ink) + arch(-2 * U, -5 * U, 0.3 * U, 1.2 * U, m.ink2) + arch(1.4 * U, -5 * U, 0.3 * U, 1.2 * U, m.ink2) +
  [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => s((-2.4 + c * 1.3) * U, (-3.4 + r * 1.1) * U, 0.8 * U, 0.7 * U, r === 2 && c === 3 ? m.hot : r === 2 || (r === 1 && c > 1) ? m.ink2 : m.tone === m.paper ? m.ink2 : m.tone)).join("")).join("");

// ---------- 22. shield ----------
/** Privacy: a square on a half circle, eyes shut. */
export const shield: PropFn = (m) => s(-2.5 * U, -6 * U, 5 * U, 3.5 * U, m.ink) + h(-2.5 * U, -2.5 * U, 2.5 * U, "d", m.ink) + s(-1.9 * U, -5.4 * U, 3.8 * U, 2.9 * U, m.ink2) + h(-1.9 * U, -2.5 * U, 1.9 * U, "d", m.ink2) +
  h(-1.2 * U, -3.6 * U, 0.4 * U, "d", m.dark) + h(0.4 * U, -3.6 * U, 0.4 * U, "d", m.dark);

// ---------- 23. crown: Pro ----------
export const crown: PropFn = (m) => s(-3 * U, -1.25 * U, 6 * U, 1.25 * U, m.ink) + tent(-2 * U, -1.25 * U, U, m.ink, null) + tent(0, -1.25 * U, U, m.ink, null) + tent(2 * U, -1.25 * U, U, m.ink, null) + s(-3 * U, -1.25 * U, 6 * U, 0.3 * U, m.acc) + spark(0, -3.6 * U, 14, m.acc);

// ---------- 24. two halves meeting: integrations, a claimed invite ----------
export const join: PropFn = (m) => h(-2.75 * U, -5 * U, 2.25 * U, "l", m.ink) + h(0.5 * U, -4 * U, 2.25 * U, "r", m.ink2) + s(-0.5 * U, -3.25 * U, U, 0.4 * U, m.ink) + s(-0.5 * U, -2.25 * U, U, 0.4 * U, m.ink);

/* ---------- the violet (rare: Violet's rule, globals.css) ---------- */
/**
 * A violet: four half-circle petals round a square, a sand heart, a stem and one leaf. The
 * bloom's centre is (cx, cy), its petal radius r; `stem` is the stem's length in r (0 for a
 * far-off bloom). Always violet or its light tone: the flower keeps its colour in both registers.
 */
export const violetFlower = (cx: number, cy: number, r: number, stem = 2.4, c: Tok = "violet", leaf: Tok = "pine"): string =>
  (stem ? s(cx - Math.max(1.5, r * 0.22), cy + r, Math.max(3, r * 0.44), stem * r, leaf) + q(cx + Math.max(1.5, r * 0.22), cy + r * 1.9, r * 1.3, "bl", leaf) : "") +
  h(cx - r, cy - 2 * r, r, "u", c) +
  h(cx - r, cy + r, r, "d", c) +
  h(cx - 2 * r, cy - r, r, "l", c) +
  h(cx + r, cy - r, r, "r", c) +
  s(cx - r, cy - r, 2 * r, 2 * r, c) +
  s(cx - r * 0.45, cy - r * 0.45, r * 0.9, r * 0.9, "sand");
/** A drift of violets: [x, y, r, light?]. A few, placed by eye, never a pattern. Blooms under 7px have no stem (they are far away). */
export const violetDrift = (list: [number, number, number, number?][], leaf: Tok = "pine"): string =>
  list.map(([x, y, r, light]) => violetFlower(x, y, r, r >= 7 ? (r > 16 ? 3.4 : 2.3) : 0, light ? "violetb" : "violet", leaf)).join("");

/** Each prop's bounding box in grid units (40px). float: it sits above the ground. dx: its centre is off the centre line. */
export const PROP_BOX: Record<string, { w: number; h: number; float?: boolean; dx?: number }> = {
  ballPlain: { w: 4, h: 4 },
  ballGlow: { w: 7.5, h: 6 },
  ballScene: { w: 6, h: 6 },
  ballPlinth: { w: 8, h: 9 },
  seatEmpty: { w: 7, h: 8 },
  seatHeld: { w: 7, h: 8 },
  seatYours: { w: 7, h: 8 },
  seatPair: { w: 9.5, h: 5.6 },
  seatRow: { w: 12, h: 4.6 },
  doorClosed: { w: 4, h: 6 },
  doorAjar: { w: 4, h: 6 },
  doorOpen: { w: 6.5, h: 6.2 },
  doorRow: { w: 10, h: 5.2 },
  tentOne: { w: 8, h: 4 },
  camp: { w: 11.5, h: 4.6 },
  trailStraight: { w: 11, h: 2 },
  trailWinding: { w: 10.5, h: 4.4, dx: -0.3 },
  trailFork: { w: 10, h: 4.8 },
  coin: { w: 5.5, h: 3.6 },
  coinStack: { w: 6, h: 5.6 },
  coinPair: { w: 8.5, h: 4.6 },
  key: { w: 7.5, h: 3.5, float: true },
  lock: { w: 4.5, h: 5.6 },
  lockOpen: { w: 6.5, h: 6.6 },
  sparks: { w: 7, h: 5.5, float: true },
  lantern: { w: 4, h: 6 },
  ledger: { w: 8, h: 4 },
  scroll: { w: 5, h: 6 },
  flag: { w: 5.5, h: 6 },
  cairn: { w: 5.5, h: 5 },
  signpost: { w: 7, h: 6 },
  bell: { w: 6.5, h: 5.8, float: true },
  envelope: { w: 6, h: 4, float: true },
  bubbles: { w: 8.5, h: 5.5 },
  bridge: { w: 12, h: 3.6 },
  join: { w: 5.5, h: 5, float: true },
  mountains: { w: 12, h: 5.5 },
  dunes: { w: 11, h: 4 },
  sun: { w: 9, h: 4.4 },
  moon: { w: 7, h: 5.5, float: true },
  compass: { w: 5.5, h: 6.2, float: true },
  well: { w: 5.5, h: 7.5 },
  oasis: { w: 8, h: 6.2 },
  scales: { w: 9.5, h: 6.5 },
  bars: { w: 10, h: 5.5 },
  calendar: { w: 6, h: 5.5, float: true },
  shield: { w: 5, h: 6, float: true },
  crown: { w: 6, h: 4.2, float: true },
};
