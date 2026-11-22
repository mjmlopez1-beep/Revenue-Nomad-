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
import { ballPlinth, tent, steps, walk, doorOpen, doorRow, envelope, scroll, calendar } from "./props";
import { keep } from "./compose";
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

/* ---------- the header every other email opens with ---------- */
/*
 * One strip a kind of email, 960 by 192 on the 40px grid (shown 600 by 120, saved at 2x), loud on
 * its own pine field under the lockup, the way the Crystal Ball hero sits under its headline. The
 * same rules: one big shape at least half the frame tall (the mint hill, cropped by the top and
 * right edges), one cropped corner, ember on the Nomad or one large shape only, up to three
 * sparks, saffron once, no words. No violet.
 *
 *   door      sign-in, finishing joining, a signing code: the door is open, the Nomad waves you in
 *   letter    a message, a claimed invite, someone joined from your invite: the letter on its way
 *   proposal  a proposal to read and sign, a decline: the scroll, and the Nomad pointing to it
 *   signed    a signed proposal: the keep, its door reached, the Nomad waving from the trail
 *   plan      the trial and the plan: the calendar's last square, the camp beside it
 *   week      the weekly email: a row of open doors (open roles)
 */
export const HEADER = { w: 960, h: 192 } as const;
const HG = 162; // the ground line
/** The Nomad's colours on pine. */
const you = { cloak: m.cloak, face: m.face, eye: m.eye, mark: m.spark, staff: m.ink, acc: m.acc, acchi: m.acchi, paper: m.paper, line: m.dark, coin: m.ink2, glow: m.light, flag: m.ink2 };
/** The field, the cropped corner, the hill and the ground every strip shares. */
const field = (extra: string[]): string =>
  [s(0, 0, HEADER.w, HEADER.h, m.bg), q(0, 0, 150, "tl", m.tone), h(668, HG - 206, 206, "u", m.hill), s(0, HG, HEADER.w, HEADER.h - HG, m.ground), ...extra].join("");
/** The strip's props are drawn calm: the Nomad (or one large shape) holds the strip's ember. */
const still = { ...m, hot: m.acc };

const headers = {
  door: () =>
    field([
      place(doorOpen(m), 486, HG, 0.62),
      place(nomad("wave", you), 330, HG, 0.36),
      spark(196, 54, 14, m.spark),
      spark(612, 34, 8, m.spark),
      spark(910, 120, 9, m.spark),
    ]),
  letter: () =>
    field([
      place(envelope(still), 500, HG - 46, 0.62),
      place(nomad("glance", you), 300, HG, 0.36),
      steps([[372, HG - 8], [396, HG - 8], [420, HG - 8]], 6, m.ink2),
      spark(196, 58, 12, m.spark),
      spark(906, 122, 9, m.spark),
    ]),
  proposal: () =>
    field([
      place(scroll(still), 486, HG, 0.56),
      place(nomad("point", you), 318, HG, 0.36),
      spark(200, 52, 14, m.spark),
      spark(602, 40, 8, m.spark),
      spark(908, 118, 9, m.spark),
    ]),
  signed: () =>
    field([
      place(keep(m), 520, HG, 0.17),
      steps(walk([226, HG - 8], [["L", 420, HG - 8]], 24), 6, m.ink2),
      place(nomad("wave", you), 160, HG, 0.32),
      spark(906, 120, 9, m.spark),
    ]),
  plan: () =>
    field([
      h(-96, HG - 112, 112, "u", m.pop),
      tent(280, HG, 58, m.ink, m.bg),
      steps([[352, HG - 8], [376, HG - 8], [400, HG - 8]], 6, m.ink2),
      place(calendar(still), 500, HG - 12, 0.54),
      spark(220, 46, 12, m.spark),
      spark(904, 120, 9, m.spark),
    ]),
  week: () =>
    field([
      h(-96, HG - 112, 112, "u", m.pop),
      place(doorRow(m), 452, HG, 0.56),
      steps([[230, HG - 8], [254, HG - 8], [278, HG - 8]], 6, m.ink2),
      spark(196, 48, 12, m.spark),
      spark(906, 120, 9, m.spark),
    ]),
};
export type HeaderKind = keyof typeof headers;
export const HEADERS: Record<HeaderKind, () => string> = headers;
export const HEADER_KINDS = Object.keys(headers) as HeaderKind[];
