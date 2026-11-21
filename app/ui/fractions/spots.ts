/**
 * Fractions spots: small illustrations (96 to 160px), three to six parts, for empty states and
 * small moments inside the app. Each is drawn on a 320 by 320 canvas with NO field: it sits on
 * the surface it is given. Anatomy: a pale dome, the prop, a ground bar, one accent.
 *
 * m.hot is the spot's one ember piece. Where the screen has spent its ember, pass calm(m)
 * (ways.ts) and it turns saffron. A port of the asset library's generator, geometry unchanged.
 */
import { q, o, h, s, g, place, pill } from "./lib";
import { orb, spark, dot } from "./nomad";
import { tent, steps, chair, lantern, ledger, envelope, lockOpen } from "./props";
import type { Way } from "./ways";

type SpotFn = (m: Way) => string;
/** A spot's canvas. */
export const SPOT = 320;
const GY = 270;
const dome = (m: Way, x = 50, r = 110): string => h(x, GY - r, r, "u", m.light);
const bar = (m: Way): string => s(20, GY, 280, 10, m.ground);
const spot = (parts: string[]): string => parts.join("");

/** No open roles: the empty seat, the steps of whoever just left. (The approved empty state.) */
export const spotNoRoles: SpotFn = (m) => spot([dome(m, 40, 120), g(chair(0, 0, m.ink), `translate(90 ${GY}) scale(0.5)`), bar(m), steps([[240, 256], [264, 256], [288, 256]], 7, m.ink), spark(250, 110, 18, m.acc), spark(56, 190, 10, m.hot)]);
/** No saved views: a flag waiting to be planted. */
export const spotNoViews: SpotFn = (m) => spot([dome(m), s(146, 80, 12, 190, m.ink), q(158, 80, 80, "tl", m.hot), h(120, 240, 32, "u", m.ink2), bar(m), spark(70, 130, 12, m.acc)]);
/** No messages: one bubble, nothing in it yet. */
export const spotNoMessages: SpotFn = (m) => spot([dome(m, 60, 100), s(70, 90, 150, 90, m.ink), q(86, 180, 34, "tr", m.ink), ...[0, 1, 2].map((i) => dot(108 + i * 36, 135, 8, i % 2 === 0, m.light)), s(170, 196, 100, 52, m.ink2), q(240, 248, 22, "tl", m.ink2), bar(m), spark(262, 110, 12, m.hot)]);
/** Not following anyone: the first stone of a waypoint. */
export const spotNoFollows: SpotFn = (m) => spot([dome(m), h(100, 210, 60, "u", m.ink), h(124, 168, 42, "u", m.ink2), h(140, 142, 26, "u", m.ink), bar(m), spark(232, 120, 14, m.hot)]);
/** No seats claimed yet: two seats, yours to fill. */
export const spotNoSeats: SpotFn = (m) => spot([dome(m, 40, 120), g(chair(0, 0, m.ink), `translate(52 ${GY}) scale(0.42)`), g(chair(0, 0, m.ink2), `translate(268 ${GY}) scale(-0.42 0.42)`), bar(m), spark(160, 100, 14, m.hot)]);
/** Crystal Ball empty: the ball is there, nothing in it today. */
export const spotBallEmpty: SpotFn = (m) => spot([dome(m), s(140, 210, 40, 40, m.paper), o(100, 210, 40, "br", m.paper), o(180, 210, 40, "bl", m.paper), s(90, 250, 140, 20, m.paper), orb(160, 150, 60, m.acc, m.acchi), bar(m), dot(246, 150, 6, true, m.ink2), dot(262, 122, 9, true, m.ink2), dot(282, 90, 12, true, m.ink2)]);
/** Search found nothing: the lantern, and bare ground. */
export const spotNoResults: SpotFn = (m) => spot([dome(m, 30, 110), place(lantern(m), 140, GY, 0.75), bar(m), steps([[226, 256], [252, 256], [278, 256]], 7, m.ink2)]);
/** Credits at zero: an empty stack, one coin to earn. */
export const spotNoCredits: SpotFn = (m) => spot([dome(m), pill(90, 238, 140, 26, m.ink2), pill(90, 206, 140, 26, m.ink2), pill(104, 150, 140, 26, m.ink), bar(m), spark(266, 132, 14, m.hot), dot(174, 190, 6, true, m.ink)]);
/** First unlock: the lock is open. */
export const spotUnlocked: SpotFn = (m) => spot([dome(m), place(lockOpen({ ...m, spark: m.acc }), 150, GY, 0.72), bar(m), spark(70, 150, 10, m.hot)]);
/** Fact added: your line in the ledger, a coin back. */
export const spotFactAdded: SpotFn = (m) => spot([dome(m, 40, 120), place(ledger(m), 160, GY, 0.62), pill(190, 104, 84, 18, m.ink), dot(170, 150, 6, true, m.ink2), bar(m), spark(292, 92, 12, m.acc)]);
/** Invite sent: the envelope is on its way. */
export const spotInviteSent: SpotFn = (m) => spot([dome(m, 20, 100), place(envelope(m), 196, 196, 0.62), dot(60, 250, 7, true, m.ink), dot(86, 222, 7, true, m.ink), dot(108, 190, 7, true, m.ink), bar(m), spark(282, 84, 12, m.acc)]);
/** Offline or error: the two halves have come apart. */
export const spotOffline: SpotFn = (m) => spot([dome(m), h(60, 110, 70, "l", m.ink), s(130, 146, 24, 14, m.ink), s(130, 200, 24, 14, m.ink), h(196, 130, 70, "r", m.ink2), bar(m), spark(178, 110, 12, m.hot)]);
/** Loading: steps appearing along the trail, one at a time. */
export const spotLoading: SpotFn = (m) => spot([dome(m, 60, 100), tent(60, GY, 50, m.ink, m.light), ...[0, 1, 2, 3].map((i) => dot(122 + i * 34, 252, 11, i % 2 === 1, i < 2 ? m.ink : m.ink2)), tent(270, GY, 36, m.ink2, null), bar(m), spark(232, 150, 12, m.acc)]);
