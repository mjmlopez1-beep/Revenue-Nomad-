/**
 * Fractions scenes and strips: composed illustrations, one per product moment.
 *
 * SCENES are the asset library's, geometry unchanged, in a wide crop (960 by 540) and a square
 * one (540 by 540), composed separately. Rules every scene keeps: one shape at least half the
 * frame tall, one shape cropped by the frame, one whole circle at most (the ball), the Nomad
 * once. A scene has ONE home in the product and is never reused as decoration:
 *
 *   welcome      onboarding, step 1 (as a banner: welcomeBanner, its third crop)
 *   trialEnding  the trial-ended card on Home
 *   notFound     the not-found page
 *   wayIn        the first unlock (not placed yet)
 *   doorway      sign-in, beside the form
 *   castle       the Pro welcome: the plans sheet once the member is on Pro (The keep, with its violets)
 *   allQuiet     (its parts, without the Nomad, are Home's band on a quiet day: stripNight)
 *
 * In the loud register a scene has its own field; in the quiet one it has none and sits on the
 * surface it is given (`field: false`).
 *
 * STRIPS are small compositions made for the app's headers from the same parts and by the same
 * five steps (name the moment, lay the ground and one big shape, stand the prop, finish with up
 * to three sparks). They hold no Nomad and no ember.
 */
import { q, h, s, g, place, U } from "./lib";
import { nomad, spark, dot, orb, type NomadOpt, type Pose } from "./nomad";
import { tent, arch, steps, walk, calendar, signpost, key, doorAjar, violetDrift } from "./props";
import type { Way } from "./ways";

const G = 480; // a scene's ground line
const ground = (sq: boolean, m: Way) => s(0, G, sq ? 540 : 960, 60, m.ground);
/** The member's Nomad, standing on the ground line unless y is given. */
const N = (m: Way, pose: Pose, x: number, sc: number, opt: NomadOpt = {}, flip = false, y = G) =>
  place(nomad(pose, { cloak: m.cloak, face: m.face, eye: m.eye, staff: m.ink, mark: m.spark, glow: m.light, coin: m.ink2, paper: m.paper, line: m.dark, flag: m.ink2, acc: m.acc, acchi: m.acchi, ...opt }), x, y, sc, flip);

type SceneFn = (m: Way, sq: boolean) => string[];

const keyItem = (m: Way) => g(key(m, m.dark), `translate(${5 * U} ${-4.75 * U}) scale(0.45)`);
/** Your way in: the key in hand, the door nested and lit. */
const wayIn: SceneFn = (m, sq) =>
  sq
    ? [q(0, 240, 240, "bl", m.tone), h(20, 0, 90, "d", m.pop), ground(sq, m), arch(250, G, 130, 420, m.ink), arch(280, G, 100, 350, m.hill), arch(310, G, 70, 280, m.lining), arch(340, G, 40, 200, m.light), N(m, "offer", 120, 0.5, { item: keyItem(m) }), spark(210, 150, 10, m.spark)]
    : [
        q(0, 0, 280, "tl", m.tone),
        h(300, 0, 120, "d", m.pop),
        ground(sq, m),
        arch(560, G, 180, 460, m.ink),
        arch(600, G, 140, 380, m.hill),
        arch(640, G, 100, 300, m.lining),
        arch(680, G, 60, 220, m.light),
        tent(80, G, 40, m.ink, m.bg),
        steps(walk([150, 466], [["L", 230, 466]], 30), 8, m.ink),
        N(m, "offer", 370, 0.8, { item: keyItem(m) }),
        spark(100, 330, 20, m.acc),
        spark(530, 200, 10, m.spark),
      ];

/** The trial is ending: the calendar's last square, and the door to Pro with its lining. */
const trialEnding: SceneFn = (m, sq) =>
  sq
    ? [q(0, 0, 220, "tl", m.tone), ground(sq, m), arch(280, G, 130, 400, m.hill), arch(315, G, 95, 320, m.lining), arch(350, G, 60, 240, m.light), place(calendar(m), 90, 180, 0.5), N(m, "knock", 170, 0.6), spark(230, 90, 10, m.spark)]
    : [
        q(0, 0, 280, "tl", m.tone),
        q(0, 320, 160, "bl", m.tone),
        ground(sq, m),
        arch(600, G, 160, 440, m.hill),
        arch(640, G, 120, 360, m.lining),
        arch(680, G, 80, 280, m.light),
        place(calendar(m), 190, G, 0.85),
        N(m, "knock", 470, 0.8),
        h(380, 70, 50, "l", m.paper),
        spark(480, 90, 10, m.spark),
        spark(300, 150, 10, m.spark),
      ];

/** All quiet: night at the camp, nothing new today. */
const allQuiet: SceneFn = (m, sq) =>
  sq
    ? [h(60, 180, 300, "u", m.tone), h(420, 70, 50, "l", m.paper), ground(sq, m), tent(120, G, 120, m.ink, m.bg), N(m, "rest", 360, 0.7), spark(250, 450, 12, m.acc), spark(90, 110, 10, m.spark), spark(330, 80, 10, m.spark), spark(480, 230, 10, m.spark)]
    : [
        h(240, 80, 400, "u", m.tone),
        h(770, 80, 70, "l", m.paper),
        q(800, 320, 160, "br", m.hill),
        ground(sq, m),
        tent(220, G, 180, m.ink, m.bg),
        N(m, "rest", 600, 0.9),
        spark(430, 448, 14, m.acc),
        spark(120, 120, 20, m.spark),
        spark(500, 70, 10, m.spark),
        spark(900, 240, 10, m.spark),
        spark(680, 150, 10, m.spark),
      ];

/** Not found: the signpost points both ways, the trail runs off the page. */
const notFound: SceneFn = (m, sq) =>
  sq
    ? [q(0, 0, 200, "tl", m.tone), q(340, 280, 200, "br", m.hill), h(60, 0, 80, "d", m.pop), ground(sq, m), place(signpost(m), 390, G, 0.9), N(m, "shrug", 170, 0.6), steps(walk([470, 466], [["L", 540, 466]], 30), 8, m.ink)]
    : [
        q(0, 0, 240, "tl", m.tone),
        q(720, 240, 240, "br", m.hill),
        h(160, 0, 100, "d", m.pop),
        ground(sq, m),
        steps(walk([40, 466], [["L", 130, 466]], 30), 8, m.ink),
        place(signpost(m), 620, G, 1.1),
        N(m, "shrug", 340, 0.8),
        steps(walk([730, 466], [["L", 960, 466]], 30), 8, m.ink),
        steps(walk([720, 430], [["A", 720, 270, 160, 80, 5]], 30), 8, m.ink),
      ];

/** Welcome: the Nomad waves you in. */
const welcome: SceneFn = (m, sq) =>
  sq
    ? [q(0, 300, 240, "bl", m.tone), q(0, 0, 120, "tl", m.pop), ground(sq, m), arch(280, G, 150, 400, m.hill), arch(340, G, 90, 280, m.light), N(m, "wave", 170, 0.6), spark(230, 90, 10, m.spark)]
    : [
        q(0, 300, 240, "bl", m.tone),
        q(0, 0, 160, "tl", m.pop),
        ground(sq, m),
        arch(600, G, 200, 420, m.hill),
        arch(680, G, 120, 300, m.light),
        tent(140, G, 60, m.ink, m.bg),
        steps([[224, 466], [254, 466], [284, 466]], 8, m.ink2),
        N(m, "wave", 450, 0.85),
        spark(330, 110, 20, m.spark),
        spark(560, 60, 10, m.spark),
      ];

/**
 * The keep, on its own: a castle's plan in plain blocks (wall, gatehouse, keep, towers), the ball
 * rising behind it. Local coordinates: x = 0 the centre line, y = 0 the ground, up is negative;
 * 30.5U wide, 20U tall. No battlements, flags or banners: every tower is one block with one roof
 * piece, windows are arch cuts.
 */
export const keep = (m: Way): string => {
  const b = (x0: number, x1: number, hh: number, c: string) => s(x0 * U, -hh * U, (x1 - x0) * U, hh * U, c);
  const dome = (x0: number, x1: number, base: number, c: string) => h(x0 * U, -(base + (x1 - x0) / 2) * U, ((x1 - x0) / 2) * U, "u", c);
  const roof = (cx: number, base: number, r: number, c: string) => tent(cx * U, -base * U, r * U, c, null);
  const cut = (cx: number, y: number, r: number, hh: number, c: string) => arch((cx - r) * U, -y * U, r * U, hh * U, c);
  const bright = m.quiet ? m.light : "white";
  const soft = m.quiet ? m.tone : "sandd";
  const inner = m.quiet ? m.bg : m.light;
  return (
    orb(0, -14.5 * U, 5.25 * U, m.acc, m.acchi) +
    b(-15.25, -12.75, 6.5, m.hill2) +
    dome(-15.25, -12.75, 6.5, m.hill2) +
    b(12.75, 15.25, 6.5, m.hill2) +
    dome(12.75, 15.25, 6.5, m.hill2) +
    b(-3, 3, 14, m.paper) +
    roof(0, 14, 4, m.pop) +
    cut(-1.2, 8.6, 0.55, 3, m.dark) +
    cut(1.2, 8.6, 0.55, 3, m.dark) +
    b(-8.25, -5.25, 10.5, bright) +
    roof(-6.75, 10.5, 2.4, m.hill) +
    cut(-6.75, 6, 0.5, 2.4, soft) +
    b(5.25, 8.25, 10.5, bright) +
    roof(6.75, 10.5, 2.4, m.hill) +
    cut(6.75, 6, 0.5, 2.4, soft) +
    b(-12.25, -9.5, 7, m.hill) +
    dome(-12.25, -9.5, 7, m.hill) +
    b(9.5, 12.25, 7, m.pop) +
    dome(9.5, 12.25, 7, m.pop) +
    b(-12.25, 12.25, 4.5, m.paper) +
    [-10.2, -8.2, 8.2, 10.2].map((x) => cut(x, 0, 0.6, 2.6, soft)).join("") +
    b(-4, 4, 6.5, bright) +
    q(-4 * U, -7.5 * U, U, "br", bright) +
    s(-3 * U, -7.5 * U, 6 * U, U, bright) +
    q(3 * U, -7.5 * U, U, "bl", bright) +
    arch(-2.5 * U, 0, 2.5 * U, 5.75 * U, m.dark) +
    arch(-1.9 * U, 0, 1.9 * U, 5.05 * U, m.lining) +
    arch(-1.3 * U, 0, 1.3 * U, 4.35 * U, inner)
  );
};
/**
 * The keep: the company you are trying to get into, and the way in. The trail ends at its door.
 * Violets grow on the right-hand hill: specks near the crest, a few in the middle, big blooms
 * close to us (Violet's rule: rare, and only on something beautiful). In the loud register it is
 * the one scene under the violet dusk (LOUD.dusk); in the quiet one it keeps its white field and
 * the violets stay in full violet.
 */
const castle: SceneFn = (m, sq) => {
  const leaf = m.quiet ? m.ink : "pine";
  return sq
    ? [
        q(0, 0, 200, "tl", m.tone),
        h(-30, 180, 300, "u", m.tone),
        q(420, 0, 120, "tr", m.pop),
        place(keep(m), 270, G, 0.5),
        s(0, G, 540, 60, m.hill),
        q(380, G - 60, 160, "br", m.hill2),
        violetDrift([[512, 442, 3], [494, 454, 3.6, 1], [470, 474, 5.5], [506, 488, 7, 1], [448, 506, 11], [502, 524, 15, 1]], leaf),
        steps(walk([20, G + 26], [["L", 110, G + 26]], 30), 8, m.dark),
        N(m, "walk", 160, 0.3, {}, false, G + 52),
        spark(70, 110, 12, m.spark),
        spark(470, 190, 10, m.spark),
      ]
    : [
        q(0, 0, 220, "tl", m.tone),
        h(170, 150, 330, "u", m.tone),
        q(800, 0, 160, "tr", m.pop),
        place(keep(m), 500, G, 0.52),
        s(0, G, 960, 60, m.hill),
        q(0, G - 100, 160, "bl", m.hill),
        q(760, G - 80, 200, "br", m.hill2),
        violetDrift([[930, 414, 3], [912, 426, 3.6, 1], [944, 432, 4], [884, 452, 6], [924, 468, 7.5, 1], [848, 492, 12], [904, 514, 16, 1], [800, 520, 9.5]], leaf),
        violetDrift([[640, G + 34, 6]], leaf),
        steps(walk([40, G + 26], [["L", 290, G + 26]], 30), 8, m.dark),
        N(m, "walk", 350, 0.3, {}, false, G + 52),
        spark(200, 120, 20, m.spark),
        spark(330, 60, 10, m.spark),
        spark(720, 80, 10, m.spark),
        spark(880, 250, 14, m.acc),
      ];
};

export const SCENES = { wayIn, trialEnding, allQuiet, notFound, welcome, castle };

/**
 * Welcome as a banner (960 by 226, the first-run card's top): the same parts as the scene, set
 * again on the grid for a strip, the door cropped by the top edge. With its own field.
 */
export const welcomeBanner = (m: Way): string =>
  [
    s(0, 0, 960, 226, m.bg),
    q(0, 66, 160, "bl", m.tone),
    q(0, 0, 100, "tl", m.pop),
    s(0, 196, 960, 30, m.ground),
    arch(620, 196, 150, 260, m.hill),
    arch(680, 196, 90, 170, m.light),
    tent(170, 196, 40, m.ink, m.bg),
    steps([[236, 186], [262, 186], [288, 186]], 7, m.ink2),
    place(nomad("wave", { cloak: m.cloak, face: m.face, eye: m.eye, mark: m.spark }), 440, 196, 0.5),
    spark(330, 60, 16, m.spark),
    spark(560, 40, 8, m.spark),
    spark(880, 70, 10, m.spark),
  ].join("");

/**
 * The doorway (320 by 520, upright, beside the sign-in form): the door ajar, the Nomad waving you
 * in. No field: it sits on the panel it is given. The panel is narrower than the box and crops
 * its sides, so the door and the Nomad keep to the middle 200.
 */
export const doorway = (m: Way): string =>
  [
    q(0, 0, 200, "tl", m.tone),
    h(140, 300, 180, "u", m.hill),
    s(0, 480, 320, 40, m.ground),
    place(doorAjar(m), 210, 480, 0.82),
    place(nomad("wave", { cloak: m.cloak, face: m.face, eye: m.eye, mark: m.spark }), 118, 480, 0.36),
    spark(84, 250, 12, m.acc),
    spark(236, 120, 8, m.spark),
    spark(150, 60, 6, m.spark),
  ].join("");
export type SceneKind = keyof typeof SCENES;
/** A scene's markup for a 960 by 540 box (540 by 540 when `sq`). `field`: paint its own field first (the loud register). */
export const scene = (kind: SceneKind, m: Way, sq = false, field = false): string => (field ? s(0, 0, sq ? 540 : 960, 540, m.bg) : "") + SCENES[kind](m, sq).join("");

/* ---------- strips: 480 by 160, the ground is the bottom edge ---------- */
const SG = 160;
/** New today: the sun half coming up behind the dunes, a camp, the trail in from the left. Home's band. */
const stripMorning = (m: Way) =>
  [
    h(250, 30, 130, "u", m.tone),
    h(300, 70, 90, "u", m.pop),
    q(400, 80, 80, "br", m.hill),
    h(170, 110, 50, "u", m.light),
    tent(215, SG, 44, m.ink, m.bg),
    steps([[40, SG - 12], [68, SG - 12], [96, SG - 12], [124, SG - 12], [152, SG - 12]], 7, m.ink2),
    spark(232, 44, 12, m.acc),
    spark(430, 40, 7, m.spark),
    spark(150, 78, 6, m.spark),
  ].join("");
/** Nothing new: night at the camp. The parts of the All quiet scene without the Nomad, who rests further down the page. */
const stripNight = (m: Way) =>
  [h(190, 20, 150, "u", m.tone), h(392, 26, 30, "l", m.paper), q(410, 90, 70, "br", m.hill), tent(250, SG, 62, m.ink, m.bg), spark(318, SG - 16, 8, m.acc), spark(160, 50, 9, m.spark), spark(352, 30, 6, m.spark), spark(452, 62, 6, m.spark)].join("");
/** A page that leads somewhere: a tent, the trail's steps, a second camp. For a header with no table under it. */
const stripTrail = (m: Way) =>
  [h(300, 40, 120, "u", m.tone), tent(120, SG, 36, m.ink, m.bg), steps(walk([170, SG - 12], [["L", 330, SG - 12]], 30), 7, m.ink2), tent(390, SG, 56, m.ink2, m.bg), spark(250, 60, 10, m.acc)].join("");

export const STRIPS = { morning: stripMorning, night: stripNight, trail: stripTrail };
export type StripKind = keyof typeof STRIPS;

/* ---------- the trail as progress ---------- */
/**
 * Steps along a trail from a tent to a door, one pair of half-dots a step: the done ones in
 * structure colour, the rest pale. With `walker`, the Nomad walks at the step reached. 40 units
 * tall; its width is `trailWidth(total)`.
 */
export const trailWidth = (total: number) => 62 + total * 34 + 30;
export const trail = (m: Way, done: number, total: number, walker: boolean): string => {
  const y = 36;
  const x0 = 62;
  const at = (k: number) => x0 + k * 34;
  let out = tent(14, 40, 12, m.ink, m.bg);
  for (let k = 0; k < total; k++) out += dot(at(k), y, 5, false, k < done ? m.ink : m.ink2) + dot(at(k) + 13, y, 5, true, k < done ? m.ink : m.ink2);
  const end = at(total) + 12;
  out += arch(end - 10, 40, 10, 28, m.ink) + arch(end - 6, 40, 6, 21, done >= total ? m.lining : m.light);
  if (walker) out += place(nomad("walk", { cloak: m.cloak, face: m.face, eye: m.eye, staff: m.dark }), at(Math.min(done, total)) - 16, 40, 0.11);
  return out;
};
