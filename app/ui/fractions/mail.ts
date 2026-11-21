/**
 * Fractions for email: the Crystal Ball morning email's header strips. Email clients don't draw
 * SVG, so these are rasterised to PNG (scripts/make-email-art.mts, into public/email/crystal-ball/)
 * and the email shows the PNG; the markup lives here with the rest of the kit.
 *
 * Each strip is 960 by 320 on the 40px grid (shown 600 by 200 in the email, saved at 2x), in the
 * loud register on its own pine field, so the art never sits on a colour a dark mode could turn to
 * mud: the field is painted in, and the email puts the same pine behind the image.
 *
 *   morning  Crystal Ball morning (the library's crystalMorning, re-set for a strip): the ball on
 *            its plinth against the mint hill, the Nomad beside it looking in. Days with news.
 *   quiet    the same place at night: the moon half, the ball still lit, the Nomad at rest. Days
 *            with nothing new, only companies where it is still a good time.
 *
 * The rules kept: one shape at least half the frame tall (the hill, the night dome), one cropped
 * by the frame, the ball the only whole circle, one Nomad, ember on the Nomad and one large
 * shape, up to three sparks, no words in the art. No violet.
 */
import { q, h, s, place, U } from "./lib";
import { nomad, spark, dot } from "./nomad";
import { ballPlinth, tent, steps } from "./props";
import { LOUD } from "./ways";

export const STRIP = { w: 960, h: 320 } as const;
const GY = 280; // the ground line
const m = LOUD.pine;
const who = { cloak: m.cloak, face: m.face, eye: m.eye, mark: m.spark };

/** Crystal Ball morning: news today. */
export const heroMorning = (): string =>
  [
    s(0, 0, STRIP.w, STRIP.h, m.bg),
    q(600, 0, 360, "tr", m.tone),
    h(-120, 160, 160, "u", m.pop),
    h(480, 40, 240, "u", m.hill),
    s(0, GY, STRIP.w, STRIP.h - GY, m.ground),
    place(ballPlinth(m), 720, GY, 0.6),
    place(nomad("glance", who), 380, GY, 0.55),
    steps([[200, GY - 10], [226, GY - 10], [252, GY - 10]], 7, m.ink2),
    spark(240, 80, 18, m.spark),
    spark(520, 40, 8, m.spark),
    spark(905, 70, 10, m.acc),
  ].join("");

/** The same place at night: nothing new, still a good time. */
export const heroQuiet = (): string =>
  [
    s(0, 0, STRIP.w, STRIP.h, m.bg),
    h(120, 40, 280, "u", m.tone),
    h(820, 40, 60, "l", m.paper),
    q(-40, 120, 160, "bl", m.tone),
    s(0, GY, STRIP.w, STRIP.h - GY, m.ground),
    tent(200, GY, 80, m.ink2, m.bg),
    place(nomad("rest", who), 420, GY, 0.5),
    place(ballPlinth(m), 690, GY, 0.5),
    dot(540, GY - 14, 6, true, m.ink2),
    spark(320, 70, 12, m.spark),
    spark(600, 50, 8, m.spark),
    spark(920, 200, 8, m.spark),
  ].join("");

export const HEROES = { morning: heroMorning, quiet: heroQuiet };
export type HeroKind = keyof typeof HEROES;
/** The grid, for callers that place things against the strip. */
export const STRIP_U = U;
