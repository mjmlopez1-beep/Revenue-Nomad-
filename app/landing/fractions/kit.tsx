/**
 * Fractions, the kit: the pieces from shapes.ts as inline SVG, and what they are assembled into
 * (the crystal ball, the spark, the tent, the door, the seat, the steps, the Nomad in its three
 * poses and the texture band).
 *
 * The rules, in short. Five pieces and nothing else: half, quarter, off-cut, square and one
 * whole circle, which only the crystal ball keeps. One 40px grid. Flat colour: no gradients, no
 * outlines, no shadows (the hairline stroke here is the piece's own colour, so two pieces that
 * meet leave no seam). Every picture has one shape at least half its height and one cropped by
 * its frame. No words inside a picture. The Nomad is always ember, always front on, never
 * rotated and never on an ember field.
 *
 * Colours come from the brand tokens through the classes in fractions.css (`Tone`). Nothing here
 * has state, effects or handlers, so it renders the same on the server and in the browser.
 * A picture is decoration unless it is given a `title`.
 */
import type { ReactNode } from "react";
import "./fractions.css";
import { arch, half, offcut, quarter, seat, spark, square, steps, tent, type Pt } from "./shapes";

/** A colour of the system. pine2, mintd and sandd are the tones for shape on shape; acc is the crystal ball's saffron. */
export type Tone = "pine" | "pine2" | "mint" | "mints" | "mintd" | "ember" | "sand" | "sandd" | "acc" | "acchi" | "white";

const U = 40;

/** Pieces of one colour, as one path. */
export function P({ t, d }: { t: Tone; d: string }) {
  return <path className={`fxc-${t}`} d={d} />;
}

/**
 * One picture. `w` and `h` are its own units (the viewBox); CSS sizes it. With `title` it is an
 * image with that name; without, it is hidden from assistive technology. `fit` is
 * preserveAspectRatio, for a picture that fills a box of another shape.
 */
export function Art({ w, h, title, className, fit, children }: { w: number; h: number; title?: string; className?: string; fit?: string; children: ReactNode }) {
  return (
    <svg
      className={className ? `fx ${className}` : "fx"}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={fit}
      focusable="false"
      {...(title ? { role: "img" } : { "aria-hidden": true })}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** The crystal ball: the one whole circle, with a quarter for its highlight. */
export function Ball({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle className="fxc-acc" cx={cx} cy={cy} r={r} />
      <P t="acchi" d={quarter(cx - r * 0.6, cy - r * 0.6, r * 0.6, "br")} />
    </>
  );
}

/** The big crystal ball and what it shows: three tents, the ember one is next. `id` names its clip, once a page. */
export function BigBall({ cx, cy, r, id }: { cx: number; cy: number; r: number; id: string }) {
  const k = r / 120;
  const y = cy + 40 * k;
  return (
    <>
      <circle className="fxc-acc" cx={cx} cy={cy} r={r} />
      <clipPath id={id}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <P t="acchi" d={square(cx - r, y, 2 * r, r)} />
        <P t="pine" d={tent(cx - 70 * k, y, 40 * k) + tent(cx + 70 * k, y, 40 * k)} />
        <P t="ember" d={tent(cx, y, 60 * k)} />
        <P t="acchi" d={tent(cx, y, 15 * k)} />
        <P t="white" d={spark(cx + 50 * k, cy - 50 * k, 10 * k)} />
      </g>
      <P t="acchi" d={quarter(cx - 80 * k, cy - 80 * k, 40 * k, "br")} />
    </>
  );
}

/** Four off-cuts, solid corners together. Saffron for the one spark that may be. */
export function Spark({ cx, cy, r, t = "sand" }: { cx: number; cy: number; r: number; t?: Tone }) {
  return <P t={t} d={spark(cx, cy, r)} />;
}

/** Two off-cuts back to back, with a flap. (x, y) is the middle of its base. */
export function Tent({ x, y, r, t = "pine", flap = "sand" }: { x: number; y: number; r: number; t?: Tone; flap?: Tone | null }) {
  return (
    <>
      <P t={t} d={tent(x, y, r)} />
      {flap ? <P t={flap} d={tent(x, y, r / 4)} /> : null}
    </>
  );
}

/** A half circle on a rectangle: the door. (x, y) is its bottom left. */
export function Arch({ x, y, r, h, t }: { x: number; y: number; r: number; h: number; t: Tone }) {
  return <P t={t} d={arch(x, y, r, h)} />;
}

/** Half-dot steps along a trail. */
export function Steps({ pts, r = 8, t = "pine" }: { pts: readonly Pt[]; r?: number; t?: Tone }) {
  return <P t={t} d={steps(pts, r)} />;
}

/** The seat. (x, y) is the bottom left of its box, 240 by 320 at scale 1. */
export function Seat({ x, y, scale = 1, t = "pine" }: { x: number; y: number; scale?: number; t?: Tone }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <P t={t} d={seat(0, 0)} />
    </g>
  );
}

/* ---------- the Nomad: the logo's A is the cloak, its dot is the ball ---------- */

/** Local coordinates: x 0 is the centre line, y 0 the ground, up is negative. 8 units wide, 8 tall. */
const hood = offcut(-2 * U, -8 * U, 2 * U, "br") + offcut(0, -8 * U, 2 * U, "bl");
const column = square(-2 * U, -6 * U, 4 * U, 6 * U);
const flareL = (r = 2) => offcut(-(2 + r) * U, -r * U, r * U, "br");
const flareR = offcut(2 * U, -2 * U, 2 * U, "bl");
/** The bare silhouette: hood, body and hem. */
const cloak = hood + column + flareL() + flareR;
/** An eye is a tiny arch: a half circle on a square. */
const eye = (x: number) => half(x, -180, 10, "u") + square(x, -170, 20, 10);

function Face({ dx = 0, look = 0 }: { dx?: number; look?: number }) {
  return (
    <>
      <P t="sand" d={half(-1.5 * U + dx, -5.5 * U, 1.5 * U, "u") + square(-1.5 * U + dx, -4 * U, 3 * U, U)} />
      <P t="pine" d={eye(-40 + dx + look) + eye(20 + dx + look)} />
    </>
  );
}

export type Pose = "stand" | "hold" | "walk" | "knock";

/**
 * The Nomad, standing at (x, y): the middle of its hem. 320 wide and 320 tall at scale 1 (400
 * tall with the ball held up). `flip` mirrors it, so the raised arm is on the left.
 * Poses: stand, hold (holds up the crystal ball), walk (with a staff), knock.
 */
export function Nomad({ pose = "stand", x, y, scale = 1, flip = false, staff = "pine" }: { pose?: Pose; x: number; y: number; scale?: number; flip?: boolean; staff?: Tone }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      {pose === "stand" ? (
        <>
          <P t="ember" d={cloak} />
          <Face />
        </>
      ) : pose === "hold" ? (
        <>
          <P t="ember" d={cloak + square(2 * U, -6.5 * U, U, 3.5 * U) + quarter(2 * U, -3 * U, U, "tl")} />
          <P t="sand" d={square(2 * U, -7 * U, U, 0.5 * U)} />
          <Ball cx={2.5 * U} cy={-8.5 * U} r={1.5 * U} />
          <Face look={5} />
        </>
      ) : pose === "walk" ? (
        <>
          <P t="ember" d={hood + column + flareL(3) + quarter(2 * U, -2 * U, 2 * U, "bl")} />
          <P t={staff} d={square(2.75 * U, -7 * U, 0.5 * U, 7 * U)} />
          <P t="acc" d={half(2.5 * U, -7.5 * U, 0.5 * U, "u")} />
          <P t="ember" d={quarter(2 * U, -3 * U, U, "tl")} />
          <P t="sand" d={half(2.5 * U, -3.5 * U, 0.5 * U, "u")} />
          <Face dx={10} look={5} />
        </>
      ) : (
        <>
          <P t="ember" d={cloak + square(2 * U, -5 * U, U, 2 * U) + quarter(2 * U, -3 * U, U, "tl")} />
          <P t="sand" d={half(2 * U, -5.5 * U, 0.5 * U, "u")} />
          <Face look={5} />
        </>
      )}
    </g>
  );
}

/** The Nomad's bare silhouette in one tone: who held the seat before you. */
export function Shade({ x, y, scale = 1, t }: { x: number; y: number; scale?: number; t: Tone }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <P t={t} d={cloak} />
    </g>
  );
}

/* ---------- the band: one 960 by 160 tile of the same pieces, repeated ---------- */

type Way = { bg: Tone; a: Tone; b: Tone; t: Tone; pop: Tone; acc: Tone };
const WAYS: Record<"pine" | "sand" | "mint", Way> = {
  pine: { bg: "pine", a: "mint", b: "sand", t: "pine2", pop: "ember", acc: "acc" },
  sand: { bg: "sand", a: "pine", b: "mint", t: "sandd", pop: "ember", acc: "acc" },
  mint: { bg: "mint", a: "pine", b: "sand", t: "mintd", pop: "ember", acc: "acc" },
};

/**
 * The texture band, as wide as its box. Two rows (160px) behind a headline, or the lower row
 * (80px) along an edge. `way` is the colourway, `off` where in the tile it starts, and `id`
 * names its pattern, once a page.
 */
export function Band({ id, way = "pine", rows = 1, off = 0, className }: { id: string; way?: keyof typeof WAYS; rows?: 1 | 2; off?: number; className?: string }) {
  const m = WAYS[way];
  const tall = rows === 2 ? 160 : 80;
  return (
    <svg className={className ? `fx fx-band ${className}` : "fx fx-band"} width="100%" height={tall} focusable="false" aria-hidden>
      <pattern id={id} width={960} height={160} patternUnits="userSpaceOnUse" patternTransform={`translate(${-off} ${tall - 160})`}>
        <P t={m.bg} d={square(0, 0, 960, 160)} />
        <P
          t={m.a}
          d={
            quarter(0, 0, 160, "bl") +
            quarter(400, 0, 80, "tr") +
            half(640, 120, 40, "u") +
            steps([
              [736, 40],
              [768, 40],
              [800, 40],
              [832, 40],
              [864, 40],
            ])
          }
        />
        <P t={m.pop} d={arch(160, 160, 40, 160) + half(640, 0, 40, "d") + tent(800, 160, 80)} />
        <P t={m.t} d={tent(320, 80, 80) + quarter(480, 0, 160, "tr")} />
        <P t={m.acc} d={half(240, 80, 80, "u") + spark(540, 110, 20)} />
        <P t={m.b} d={quarter(400, 80, 80, "bl") + half(880, 0, 80, "r")} />
        <P t={m.bg} d={tent(800, 160, 20)} />
      </pattern>
      <rect width="100%" height={tall} style={{ fill: `url(#${id})` }} />
    </svg>
  );
}
