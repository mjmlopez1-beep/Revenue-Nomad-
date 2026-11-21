/**
 * Fractions structure: the parts that repeat from page to page and carry the continuity.
 * Textures, dividers, bleeds, bullets, avatar frames and glyphs. They may be reused freely (a
 * scene, a spot and a Nomad pose may not: see art.tsx).
 *
 * A port of the asset library's generator, geometry unchanged.
 */
import { q, o, h, s, g, ball, place, pill, clip, U, type Tok } from "./lib";
import { spark, head, nomad } from "./nomad";
import { tent, arch, steps, chair, key as keyProp, lock as lockProp } from "./props";
import type { Way } from "./ways";

/* ---------- textures (tiles repeat) ---------- */
/** A colourway reduced to what a texture needs. In quiet, the big saffron dome becomes a tint; only the spark stays saffron. */
const tex = (m: Way) => ({ bg: m.bg, a: m.quiet ? m.ink2 : m.bg === "pine" ? "mint" : "pine", b: m.quiet ? m.paper : m.bg === "sand" ? "mint" : "sand", t: m.tone, pop: m.pop, dome: m.quiet ? m.hill : m.acc, acc: m.acc });
type Tex = ReturnType<typeof tex>;
/** Sparse: the band's pieces, one every other cell, most of the field left empty. 960 by 160. */
const sparseTile = (x: Tex) =>
  [q(0, 80, 80, "bl", x.t), spark(200, 60, 16, x.acc), tent(360, 160, 40, x.a, x.bg), steps([[470, 120], [498, 120], [526, 120]], 7, x.a), h(640, 0, 60, "d", x.t), q(800, 80, 80, "br", x.b), spark(900, 50, 8, x.a)].join("");
/** Border: a single row, 480 by 40. For the edge of a section, a header with no table under it. */
const borderTile = (x: Tex) =>
  [
    q(0, 0, 40, "bl", x.a),
    h(40, 0, 20, "r", x.b),
    tent(120, 40, 40, x.t, null),
    h(160, 20, 20, "u", x.pop),
    s(200, 0, 40, 40, x.t),
    q(200, 0, 40, "tr", x.a),
    steps([[256, 20], [272, 20], [288, 20], [304, 20]], 5, x.a),
    q(320, 0, 40, "tl", x.b),
    h(360, 0, 20, "d", x.a),
    spark(420, 20, 10, x.acc),
    o(440, 0, 40, "br", x.t),
  ].join("");
const repeat = (tile: (x: Tex) => string, tw: number, w: number, x: Tex, off = 0) => {
  let out = "";
  for (let i = -off; i < w; i += tw) out += g(tile(x), `translate(${i} 0)`);
  return out;
};
/** `w` wide, 160 tall. */
export const textureSparse = (m: Way, w = 1280, off = 0): string => repeat(sparseTile, 960, w, tex(m), off);
/** `w` wide, 40 tall. */
export const textureBorder = (m: Way, w = 1280, off = 0): string => repeat(borderTile, 480, w, tex(m), off);
/** Corner cluster: 320 by 320, anchored bottom right; mirror it for the other corners. */
export const cornerCluster = (m: Way): string => {
  const x = tex(m);
  return [q(80, 80, 240, "br", x.t), h(160, 240, 80, "u", x.a), q(240, 0, 80, "br", x.b), tent(80, 320, 40, x.pop, x.bg), steps([[20, 300], [48, 300]], 7, x.a), spark(120, 160, 14, x.acc), o(240, 160, 80, "br", x.pop === "ember" ? x.b : x.t)].join("");
};

/* ---------- dividers (w by 24) ---------- */
export const dividerSteps = (m: Way, w = 640): string =>
  steps(
    Array.from({ length: Math.floor(w / 28) }, (_, i): [number, number] => [14 + i * 28, 12]),
    6,
    m.ink2,
  );
export const dividerSpark = (m: Way, w = 640): string => pill(0, 10, w / 2 - 24, 4, m.ink2) + spark(w / 2, 12, 11, m.acc) + pill(w / 2 + 24, 10, w / 2 - 24, 4, m.ink2);
export const dividerScallop = (m: Way, w = 640): string => Array.from({ length: Math.floor(w / 24) }, (_, i) => h(i * 24, 8, 12, "u", i % 5 === 2 ? m.ink : m.ink2)).join("") + s(0, 20, w, 4, m.ink2);
export const dividerCamp = (m: Way, w = 640): string => pill(0, 18, w / 2 - 44, 4, m.ink2) + steps([[w / 2 - 30, 18]], 5, m.ink) + tent(w / 2, 22, 20, m.ink, null) + steps([[w / 2 + 30, 18]], 5, m.ink) + pill(w / 2 + 44, 18, w / 2 - 44, 4, m.ink2);

/* ---------- bleeds: big quarters and halves for headers and cards. Each fills its (w, hh) box; the card clips it. ---------- */
export type BleedKind = "TR" | "BR" | "BL" | "R" | "Top" | "Arch";
export const BLEEDS: Record<BleedKind, (m: Way, w: number, hh: number) => string> = {
  /** Top right quarter. */
  TR: (m, w, hh) => q(w - hh * 0.7, 0, hh * 0.7, "tr", m.pop),
  /** Bottom right, nested. */
  BR: (m, w, hh) => q(w - hh, 0, hh, "br", m.tone) + q(w - hh * 0.5, hh * 0.5, hh * 0.5, "br", m.hill),
  /** Bottom left and a dome. */
  BL: (m, w, hh) => q(0, hh * 0.3, hh * 0.7, "bl", m.tone) + h(w - hh * 1.1, hh * 0.55, hh * 0.45, "u", m.hill),
  /** Right edge half. */
  R: (m, w, hh) => h(w - hh * 0.5, 0, hh * 0.5, "l", m.hill) + q(w - hh * 0.25, hh * 0.75, hh * 0.25, "br", m.pop),
  /** Top edge bowl. */
  Top: (m, w, hh) => h(w - hh * 1.5, 0, hh * 0.5, "d", m.tone) + q(w - hh * 0.4, hh * 0.6, hh * 0.4, "br", m.hill),
  /** Arch from the floor. */
  Arch: (m, w, hh) => arch(w - hh * 1.0, hh, hh * 0.4, hh * 0.85, m.hill) + arch(w - hh * 0.8, hh, hh * 0.2, hh * 0.5, m.light) + q(0, 0, hh * 0.5, "tl", m.tone),
};

/* ---------- bullets (16 by 16), one colour ---------- */
export type BulletKind = "spark" | "dome" | "tent" | "quarter" | "step";
export const BULLETS: Record<BulletKind, (c: Tok) => string> = {
  spark: (c) => spark(8, 8, 7, c),
  dome: (c) => h(2, 5, 6, "u", c),
  tent: (c) => tent(8, 13, 7, c, null),
  quarter: (c) => q(3, 3, 10, "bl", c),
  step: (c) => h(1, 8, 4, "d", c) + h(8, 5, 4, "u", c),
};

/* ---------- avatar frames (64 by 64): never a circle ---------- */
export type FrameKind = "arch" | "leaf" | "tile";
/** The frame's shape alone: initials or a logo go on top of it in HTML. Arch for people, leaf for you, tile for companies. */
export const frame = (kind: FrameKind, bg: Tok): string =>
  kind === "arch" ? h(0, 0, 32, "u", bg) + s(0, 32, 64, 32, bg) : kind === "leaf" ? q(0, 0, 32, "br", bg) + s(32, 0, 32, 32, bg) + s(0, 32, 32, 32, bg) + q(32, 32, 32, "tl", bg) : s(0, 0, 64, 64, bg);
/** The frame with the Nomad's head in it: the member's own avatar where no initials are shown. */
export const avatar = (kind: FrameKind, bg: Tok = "mints", cloak: Tok = "ember"): string => frame(kind, bg) + clip(place(head({ cloak }), 32, 64 + 3 * U * 0.21, 0.21), 0, 0, 64, 64);

/* ---------- glyphs: 24 by 24, one colour plus an optional accent. They sit beside the app's line icons, not instead of them. ---------- */
const G1 = (c: Tok, bg: Tok, acc?: Tok | null): Way => ({ ink: c, ink2: c, paper: c, dark: bg, bg, light: bg, tone: c, hill: c, hill2: c, ground: c, acc: acc || c, acchi: bg, hot: acc || c, spark: c, pop: c, cloak: c, face: bg, eye: c, lining: c });
export type GlyphKind = "ball" | "seat" | "door" | "tent" | "trail" | "spark" | "credit" | "key" | "lock" | "flag" | "bell" | "mail" | "lantern" | "ledger" | "nomad";
export const GLYPHS: Record<GlyphKind, (c: Tok, bg: Tok, acc?: Tok | null) => string> = {
  ball: (c, bg, acc) => ball(12, 12, 10, acc || c) + q(6, 6, 6, "br", bg),
  seat: (c) => g(chair(0, 0, c), "translate(3 23) scale(0.068)"),
  door: (c, bg, acc) => arch(3, 23, 9, 21, c) + arch(8, 23, 4, 13, acc || bg),
  tent: (c, bg) => tent(12, 21, 11, c, bg),
  trail: (c) => h(1, 17, 3, "d", c) + h(7, 12, 3, "u", c) + h(13, 12, 3, "d", c) + h(18, 6, 3, "u", c),
  spark: (c, _bg, acc) => spark(12, 12, 11, acc || c),
  credit: (c) => pill(3, 15, 18, 5, c) + pill(3, 9, 18, 5, c) + pill(5, 3, 18, 5, c),
  key: (c, bg) => g(keyProp(G1(c, bg), c), "translate(12 20.5) scale(0.08)"),
  lock: (c, bg, acc) => g(lockProp(G1(c, bg, acc)), "translate(12 23) scale(0.1)"),
  flag: (c, _bg, acc) => s(6, 1, 3, 20, c) + q(9, 1, 12, "tl", acc || c) + s(2, 21, 11, 2, c),
  bell: (c, _bg, acc) => h(4, 3, 8, "u", c) + s(4, 11, 16, 7, c) + o(1, 15, 3, "br", c) + o(20, 15, 3, "bl", c) + h(9, 19, 3, "d", acc || c),
  mail: (c, bg) => s(2, 5, 20, 15, c) + o(2, 5, 10, "tr", bg) + o(12, 5, 10, "tl", bg) + s(2, 5, 20, 1.5, c),
  lantern: (c, bg, acc) => s(11, 1, 2, 3, c) + h(5, 4, 7, "u", c) + s(5, 11, 14, 9, c) + s(7, 11, 10, 7, bg) + spark(12, 14.5, 3.5, acc || c) + s(4, 20, 16, 3, c),
  ledger: (c, bg, acc) => s(1, 5, 10, 14, c) + s(13, 5, 10, 14, c) + q(1, 19, 2, "tr", c) + q(21, 19, 2, "tl", c) + s(3, 8, 6, 2, bg) + s(3, 12, 6, 2, bg) + s(15, 8, 6, 2, bg) + s(15, 12, 4, 2, acc || bg),
  nomad: (c, bg, acc) => place(nomad("stand", { cloak: acc || c, face: bg, eye: acc ? c : bg === "white" || bg === "bgf" ? c : bg }), 12, 24, 0.075),
};
