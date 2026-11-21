/**
 * The Nomad, as markup (the landing page's three approved poses are also in kit.tsx as React).
 *
 * Its construction is fixed: the hood is two off-cuts meeting in a point, the body a 4U column,
 * the hem two off-cuts, the face a half circle on a rectangle, the eyes two 20px arches, the ball
 * saffron. Local coordinates: x = 0 is the centre line, y = 0 the ground, up is negative; 8U tall
 * and 8U wide at rest. Range comes from four things only: the eyes, the hem, one or two 1U arms,
 * and what the hand holds. Always front on, never rotated, never on an ember field.
 *
 * A port of the asset library's generator, geometry unchanged.
 */
import { q, o, h, s, ball, g, U, clip, pill, type Tok } from "./lib";

/** The crystal ball: the one whole circle, with a quarter highlight. */
export const orb = (cx: number, cy: number, r: number, acc: Tok = "acc", hi: Tok = "acchi"): string => ball(cx, cy, r, acc) + q(cx - r * 0.6, cy - r * 0.6, r * 0.6, "br", hi);
/** Four off-cuts, solid corners together: the spark. */
export const spark = (cx: number, cy: number, r: number, cls: Tok = "acc"): string => o(cx - r, cy - r, r, "br", cls) + o(cx, cy - r, r, "bl", cls) + o(cx - r, cy, r, "tr", cls) + o(cx, cy, r, "tl", cls);
/** A half-dot (the trail's step, a breath, a wave mark). up = true is a dome. */
export const dot = (cx: number, cy: number, r: number, up: boolean, cls: Tok): string => h(cx - r, up ? cy - r : cy, r, up ? "u" : "d", cls);

/* ---------- eyes: the whole expression set ---------- */
// Each eye lives in a 20 by 20 box whose top left is (x, y). Only halves and squares.
type EyeFn = (x: number, y: number, c: Tok) => string;
const EYE: Record<"open" | "wide" | "happy" | "closed" | "flat", EyeFn> = {
  open: (x, y, c) => h(x, y, 10, "u", c) + s(x, y + 10, 20, 10, c), // the approved arch
  wide: (x, y, c) => h(x, y - 10, 10, "u", c) + s(x, y, 20, 20, c), // a taller arch
  happy: (x, y, c) => h(x, y + 4, 10, "u", c), // the dome alone
  closed: (x, y, c) => h(x, y + 8, 10, "d", c), // the bowl alone
  flat: (x, y, c) => s(x, y + 8, 20, 6, c), // a slab
};
export type Expr = "open" | "left" | "right" | "up" | "down" | "wide" | "happy" | "closed" | "wink" | "flat" | "puzzled";
/** expression: [left eye, right eye, dx, dy] */
const EXPRESSIONS: Record<Expr, [keyof typeof EYE, keyof typeof EYE, number, number]> = {
  open: ["open", "open", 0, 0],
  left: ["open", "open", -10, 0],
  right: ["open", "open", 10, 0],
  up: ["open", "open", 0, -10],
  down: ["open", "open", 0, 10],
  wide: ["wide", "wide", 0, 0],
  happy: ["happy", "happy", 0, 0],
  closed: ["closed", "closed", 0, 4],
  wink: ["open", "happy", 0, 0],
  flat: ["flat", "flat", 0, 0],
  puzzled: ["wide", "open", 0, 0],
};
type Skin = { cloak: Tok; face: Tok; eye: Tok };
/** The face. dx and dy move the whole face (a head turn is 10px), expr picks the eyes, look nudges them. */
export const face = (k: Skin, { dx = 0, dy = 0, expr = "open" as Expr, look = 0, lookY = 0 } = {}): string => {
  const [l, r, ex, ey] = EXPRESSIONS[expr];
  const x = dx + look + ex;
  const y = -180 + dy + lookY + ey;
  return h(-1.5 * U + dx, -5.5 * U + dy, 1.5 * U, "u", k.face) + s(-1.5 * U + dx, -4 * U + dy, 3 * U, U, k.face) + EYE[l](-40 + x, y, k.eye) + EYE[r](20 + x, y, k.eye);
};

/* ---------- cloak parts ---------- */
const hood = (c: Tok, top = -8 * U) => o(-2 * U, top, 2 * U, "br", c) + o(0, top, 2 * U, "bl", c);
const column = (c: Tok, top = -6 * U) => s(-2 * U, top, 4 * U, -top, c);
const flareL = (c: Tok, r = 2) => o(-(2 + r) * U, -r * U, r * U, "br", c);
const flareR = (c: Tok, r = 2) => o(2 * U, -r * U, r * U, "bl", c);
/** The bare silhouette, for tone-on-tone figures (a seat holder who is locked or not on Merlin yet). */
export const shade = (c: Tok): string => hood(c) + column(c) + flareL(c) + flareR(c);
// Arms are 1U wide and hug the body. side: 1 right, -1 left.
/** A raised arm: a column from `top` down to the elbow at -3U, rounded underneath. */
const armUp = (c: Tok, top: number, side = 1) => (side > 0 ? s(2 * U, top, U, -3 * U - top, c) + q(2 * U, -3 * U, U, "tl", c) : s(-3 * U, top, U, -3 * U - top, c) + q(-3 * U, -3 * U, U, "tr", c));
/** A low sleeve: the quarter at the hip, as in the walk. */
const sleeve = (c: Tok, side = 1, y = -3 * U) => (side > 0 ? q(2 * U, y, U, "tl", c) : q(-3 * U, y, U, "tr", c));
/** An arm held out level at `y` (its top), `len` long, with the sleeve draped under it. */
const armOut = (c: Tok, y: number, len = 2 * U, side = 1) => (side > 0 ? s(2 * U, y, len, U, c) + q(2 * U, y + U, U, "tl", c) : s(-2 * U - len, y, len, U, c) + q(-3 * U, y + U, U, "tr", c));
const handDome = (k: Skin, cx: number, y: number, r = 0.5 * U) => h(cx - r, y - r, r, "u", k.face);

const YOU: Skin = { cloak: "ember", face: "sand", eye: "pine" };

export type Pose = "stand" | "hold" | "walk" | "knock" | "celebrate" | "read" | "coin" | "lantern" | "peek" | "peekside" | "wave" | "rest" | "point" | "glance" | "shrug" | "plant" | "offer";

/** What the Nomad is drawn with: its own tokens, the eyes, and the tokens of what it holds. */
export interface NomadOpt {
  cloak?: Tok;
  face?: Tok;
  eye?: Tok;
  /** Override the pose's eyes. */
  expr?: Expr;
  /** Staff, pole and lantern frame. */
  staff?: Tok;
  acc?: Tok;
  acchi?: Tok;
  coin?: Tok;
  paper?: Tok;
  line?: Tok;
  glow?: Tok;
  flag?: Tok;
  /** Sparks, breaths and wave marks around it. */
  mark?: Tok;
  /** What rests on the offering hand, in place of the ball. */
  item?: string;
}

/** The Nomad in one of its states, standing at the origin. */
export const nomad = (pose: Pose = "stand", opt: NomadOpt = {}): string => {
  const k = { ...YOU, staff: "pine", acc: "acc", acchi: "acchi", coin: "mint", paper: "sand", line: "pine", glow: "mints", flag: "mint", mark: "sand", ...opt };
  const c = k.cloak;
  const f = (d: { dx?: number; dy?: number; expr?: Expr; look?: number } = {}) => face(k, { ...d, ...(opt.expr ? { expr: opt.expr } : {}) });
  switch (pose) {
    // The approved three, and the rest position.
    case "stand":
      return shade(c) + f();
    case "hold":
      return shade(c) + armUp(c, -6.5 * U) + s(2 * U, -7 * U, U, 0.5 * U, k.face) + orb(2.5 * U, -8.5 * U, 1.5 * U, k.acc, k.acchi) + f({ look: 5 });
    case "walk":
      return hood(c) + column(c) + flareL(c, 3) + q(2 * U, -2 * U, 2 * U, "bl", c) + s(2.75 * U, -7 * U, 0.5 * U, 7 * U, k.staff) + h(2.5 * U, -7.5 * U, 0.5 * U, "u", k.acc) + sleeve(c) + handDome(k, 3 * U, -3 * U) + f({ dx: 10, look: 5 });
    case "knock":
      return shade(c) + s(2 * U, -5 * U, U, 2 * U, c) + sleeve(c) + handDome(k, 2.5 * U, -5 * U) + f({ look: 5 });
    /** Celebrating: the ball tossed off the hand, the free hand up, eyes shut in a smile. */
    case "celebrate":
      return (
        shade(c) +
        armUp(c, -7 * U) +
        s(2 * U, -7.5 * U, U, 0.5 * U, k.face) +
        armUp(c, -6 * U, -1) +
        handDome(k, -2.5 * U, -6 * U) +
        orb(2.5 * U, -9.5 * U, 1.5 * U, k.acc, k.acchi) +
        spark(0.25 * U, -9.5 * U, 20, k.mark) +
        spark(4.75 * U, -8 * U, 10, k.mark) +
        spark(-3.5 * U, -8 * U, 10, k.mark) +
        f({ expr: "happy" })
      );
    /** Reading the ledger: an open book held across the chest, eyes down. Adding facts. */
    case "read":
      return (
        shade(c) +
        s(-2.5 * U, -2.5 * U, 2.5 * U, 1.5 * U, k.paper) +
        q(-2.5 * U, -U, 0.5 * U, "tr", k.paper) +
        s(-2 * U, -U, 2 * U, 0.5 * U, k.paper) +
        s(0, -2.5 * U, 2.5 * U, 1.5 * U, k.paper) +
        q(2 * U, -U, 0.5 * U, "tl", k.paper) +
        s(0, -U, 2 * U, 0.5 * U, k.paper) +
        s(-2, -2.5 * U, 4, 2 * U, c) +
        s(-2 * U, -2 * U, 1.5 * U, 8, k.line) +
        s(-2 * U, -1.5 * U, 1.5 * U, 8, k.line) +
        s(0.5 * U, -2 * U, 1.5 * U, 8, k.line) +
        s(0.5 * U, -1.5 * U, U, 8, k.coin) +
        f({ expr: "down" })
      );
    /** Carrying a credit: coins seen edge on, held up where the ball would be. */
    case "coin":
      return (
        shade(c) +
        armUp(c, -6.5 * U) +
        s(2 * U, -7 * U, U, 0.5 * U, k.face) +
        pill(1.5 * U, -296, 2 * U, 16, k.coin) +
        pill(1.5 * U, -318, 2 * U, 16, k.coin) +
        pill(1.5 * U + 10, -340, 2 * U, 16, k.coin) +
        spark(4.25 * U, -8.75 * U, 10, k.mark) +
        f({ look: 5 })
      );
    /** With a lantern: an arm held out, the lantern hanging from the hand. Searching. */
    case "lantern":
      return (
        shade(c) +
        armOut(c, -5 * U, 1.5 * U) +
        h(3.5 * U, -5 * U, 0.5 * U, "r", k.face) +
        s(3.75 * U - 4, -4.25 * U, 8, 0.5 * U, k.staff) +
        h(3 * U, -4.25 * U + 0.5 * U, 0.75 * U, "u", k.staff) +
        s(3 * U, -3 * U, 1.5 * U, 1.25 * U, k.glow) +
        s(3 * U, -1.75 * U, 1.5 * U, 0.25 * U, k.staff) +
        spark(3.75 * U, -2.4 * U, 14, k.acc) +
        f({ dx: 10, look: 5 })
      );
    /** Peeking over an edge. Local y = 0 is the edge itself (a card top, a wall). */
    case "peek":
      return g(clip(shade(c) + f({ expr: "up" }), -4 * U, -8 * U, 8 * U, 4.75 * U), `translate(0 ${3.25 * U})`) + handDome(k, -2.75 * U, 0) + handDome(k, 2.75 * U, 0);
    /** Peeking from behind an upright edge. Local x = 0 is the edge; the Nomad is to its left. */
    case "peekside":
      return g(clip(shade(c) + f({ expr: "right" }), -4 * U, -8 * U, 4.5 * U, 8 * U), `translate(${-0.5 * U} 0)`) + h(-0.5 * U, -2.5 * U, 0.5 * U, "l", k.face);
    /** Waving hello: a high open hand, two wave marks, smiling eyes. */
    case "wave":
      return shade(c) + armUp(c, -6.5 * U) + q(2 * U, -8 * U, 1.5 * U, "bl", k.face) + dot(4 * U, -8.25 * U, 12, true, k.mark) + dot(4.75 * U, -7.25 * U, 12, true, k.mark) + f({ expr: "happy" });
    /** Resting: settled low, hem spread wide, eyes shut, three breaths rising. Quiet and empty states. */
    case "rest":
      return (
        hood(c, -6.5 * U) +
        column(c, -4.5 * U) +
        flareL(c, 3) +
        flareR(c, 3) +
        g(face(k, { expr: opt.expr || "closed" }), `translate(0 ${1.75 * U})`) +
        dot(2.75 * U, -5.5 * U, 6, true, k.mark) +
        dot(3.5 * U, -6.5 * U, 10, true, k.mark) +
        dot(4.5 * U, -7.75 * U, 14, true, k.mark)
      );
    /** Pointing: a level arm, the head and eyes turned the same way. */
    case "point":
      return shade(c) + armOut(c, -5 * U, 2 * U) + h(4 * U, -5 * U, 0.5 * U, "r", k.face) + f({ dx: 10, expr: "right" });
    /** Looking to one side (mirror for the other). */
    case "glance":
      return shade(c) + f({ dx: 10, expr: "right" });
    /** The shrug: both hands out, palms up and empty, one eye wider than the other. Errors. */
    case "shrug":
      return shade(c) + armOut(c, -4 * U, U) + armOut(c, -4 * U, U, -1) + q(2.5 * U, -5 * U, U, "bl", k.face) + q(-3.5 * U, -5 * U, U, "br", k.face) + f({ expr: "puzzled" });
    /** Planting a flag: a pole with a quarter-circle flag. Saving a view, following a company. */
    case "plant":
      return shade(c) + s(2.75 * U, -9 * U, 0.5 * U, 9 * U, k.staff) + q(3.25 * U, -9 * U, 2 * U, "tl", k.flag) + sleeve(c) + handDome(k, 3 * U, -3 * U) + f({ dx: 10, expr: "right" });
    /** Offering: a level arm with something resting on the hand (the ball by default). Handing over. */
    case "offer":
      return shade(c) + armOut(c, -5 * U, 2 * U) + s(3.5 * U, -5.5 * U, U, 0.5 * U, k.face) + (opt.item ?? orb(4 * U, -6.5 * U, U, k.acc, k.acchi)) + f({ dx: 10, expr: "right" });
  }
};

/** Head only (hood, face, shoulders), for the member's own avatar: its local box is x -2U..2U, y -8U..-3U. */
export const head = (opt: NomadOpt = {}): string => {
  const k = { ...YOU, ...opt };
  return hood(k.cloak) + s(-2 * U, -6 * U, 4 * U, 3 * U, k.cloak) + face(k, { expr: opt.expr || "open" });
};

/** How far each pose reaches from its centre line and above the ground, in grid units: what <NomadArt> frames. */
export const POSE_BOX: Record<Pose, { l: number; r: number; top: number }> = {
  stand: { l: -4, r: 4, top: 8 },
  hold: { l: -4, r: 4, top: 10 },
  walk: { l: -5, r: 4, top: 8 },
  knock: { l: -4, r: 4, top: 8 },
  celebrate: { l: -4, r: 5, top: 11 },
  read: { l: -4, r: 4, top: 8 },
  coin: { l: -4, r: 4.6, top: 8.5 },
  lantern: { l: -4, r: 4.6, top: 8 },
  wave: { l: -4, r: 5.1, top: 8.6 },
  point: { l: -4, r: 4.6, top: 8 },
  glance: { l: -4, r: 4, top: 8 },
  plant: { l: -4, r: 5.3, top: 9 },
  offer: { l: -4, r: 5, top: 8 },
  shrug: { l: -4, r: 4, top: 8 },
  rest: { l: -5, r: 5, top: 8 },
  peek: { l: -3.3, r: 3.3, top: 5 },
  peekside: { l: -4.5, r: 0, top: 8 },
};
