/**
 * Merlin's illustrations for the new design (RN_UI3): the layered landscape set cut from the
 * Fractions pieces (quarter, half, off-cut, square, one whole circle a picture), ported from
 * find-design/v5/illustrations.js. Flat color, no outlines, no text. Every color is a --i-*
 * variable from ui3.css, so each picture follows the light and dark themes.
 *
 *   <Art name="titleHome" />   a scene as an inline SVG (decorative: aria-hidden)
 *   MI.titleHome()             the same scene as an SVG string
 *
 * Title band scenes (640 by 240, art weighted right): titleHome (Home), titleBall (Crystal Ball),
 * titleSpy (Target Companies), titleWalk (Lookalikes), titleCamp (My Network), titleSign (Warm
 * Paths), titleKeep and titleSit. Card and panel art: doorway, summit, arches, harbor, signpost,
 * bridgeCamps, trailhead. navLand sits behind the navigation's account row.
 */
import type { CSSProperties } from "react";

type Pt = [number, number];
type Corner = "tl" | "tr" | "br" | "bl";
type Dir = "u" | "d" | "l" | "r";
export interface ArtOpts {
  w?: number | string;
  h?: number | string;
  /** preserveAspectRatio; each scene has its own default. */
  fit?: string;
  cls?: string;
}
interface FigOpts {
  shirt?: string;
  pants?: string;
  pack?: string;
  hat?: string;
}

/* eslint-disable prefer-const */
const build = () => {
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const F = (c: string) => ' fill="var(--i-' + c + ')" stroke="var(--i-' + c + ')"';
  const C4 = (x: number, y: number, r: number): Pt[] => [[x, y], [x + r, y], [x + r, y + r], [x, y + r]];
  const IDX: Record<Corner, number> = { tl: 0, tr: 1, br: 2, bl: 3 };
  const p = (pt: Pt) => n(pt[0]) + " " + n(pt[1]);
  /* the five pieces */
  const q = (x: number, y: number, r: number, c: Corner, col: string) => { const k = C4(x, y, r), i = IDX[c]; return '<path' + F(col) + ' d="M' + p(k[i]) + "L" + p(k[(i + 1) % 4]) + "A" + n(r) + " " + n(r) + " 0 0 1 " + p(k[(i + 3) % 4]) + 'Z"/>'; };
  const o = (x: number, y: number, r: number, c: Corner, col: string) => { const k = C4(x, y, r), s0 = IDX[c], i = (s0 + 2) % 4; return '<path' + F(col) + ' d="M' + p(k[(i + 1) % 4]) + "L" + p(k[s0]) + "L" + p(k[(i + 3) % 4]) + "A" + n(r) + " " + n(r) + " 0 0 0 " + p(k[(i + 1) % 4]) + 'Z"/>'; };
  const h = (x: number, y: number, r: number, d: Dir, col: string) => {
    const R = n(r);
    const D = d === "u" ? "M" + n(x) + " " + n(y + r) + "A" + R + " " + R + " 0 0 1 " + n(x + 2 * r) + " " + n(y + r) + "Z"
      : d === "d" ? "M" + n(x) + " " + n(y) + "A" + R + " " + R + " 0 0 0 " + n(x + 2 * r) + " " + n(y) + "Z"
      : d === "l" ? "M" + n(x + r) + " " + n(y) + "A" + R + " " + R + " 0 0 0 " + n(x + r) + " " + n(y + 2 * r) + "Z"
      : "M" + n(x) + " " + n(y) + "A" + R + " " + R + " 0 0 1 " + n(x) + " " + n(y + 2 * r) + "Z";
    return '<path' + F(col) + ' d="' + D + '"/>';
  };
  const s = (x: number, y: number, w: number, hh: number, col: string) => '<rect' + F(col) + ' x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(hh) + '"/>';
  const ball = (cx: number, cy: number, r: number, col: string) => '<circle' + F(col) + ' cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '"/>';
  const g = (inner: string, tf?: string) => "<g" + (tf ? ' transform="' + tf + '"' : "") + ">" + inner + "</g>";
  const place = (inner: string, x: number, y: number, sc: number, flip?: boolean) => g(inner, "translate(" + n(x) + " " + n(y) + ") scale(" + (flip ? -sc : sc) + " " + sc + ")");
  /* built from the pieces */
  const tent = (x: number, y: number, r: number, col: string) => o(x - r, y - r, r, "br", col) + o(x, y - r, r, "bl", col);
  const arch = (x: number, y: number, r: number, hh: number, col: string) => h(x, y - hh, r, "u", col) + s(x, y - hh + r, 2 * r, hh - r, col);
  const leaf = (x: number, y: number, r: number, col: string, flip?: boolean) => '<path' + F(col) + ' d="M' + n(x) + " " + n(y) + "A" + n(r) + " " + n(r) + " 0 0 " + (flip ? 0 : 1) + " " + n(x + (flip ? -r : r)) + " " + n(y - r) + "A" + n(r) + " " + n(r) + " 0 0 " + (flip ? 0 : 1) + " " + n(x) + " " + n(y) + 'Z"/>';
  const spark = (cx: number, cy: number, r: number, col: string) => o(cx - r, cy - r, r, "br", col) + o(cx, cy - r, r, "bl", col) + o(cx - r, cy, r, "tr", col) + o(cx, cy, r, "tl", col);
  const steps = (pts: Pt[], r: number, col: string) => pts.map((pt, i) => h(pt[0] - r, i % 2 ? pt[1] - r : pt[1], r, i % 2 ? "u" : "d", col)).join("");
  const tree = (x: number, y: number, r: number, col: string, trunk?: string) => s(x - r * 0.12, y - r * 0.5, r * 0.24, r * 0.5, trunk || "f4") + tent(x, y - r * 0.35, r, col) + tent(x, y - r * 1.05, r * 0.78, col) + tent(x, y - r * 1.65, r * 0.55, col);

  /* ---------- the human figure: hair dome, face, a torso with quarter shoulders, a pack, legs in stride ---------- */
  const figureWalk = (o2: FigOpts = {}) => {
    const shirt = o2.shirt || "shirt", pants = o2.pants || "pants", pack = o2.pack || "pack";
    return [
      s(52, -268, 7, 268, "hair"), h(48, -276, 7.5, "u", "gold"),                          // staff
      s(-58, -214, 30, 84, pack), q(-58, -236, 22, "br", pack), s(-36, -236, 8, 22, pack), // pack
      s(-36, -128, 30, 112, pants), s(-44, -16, 40, 16, "hair"),                           // back leg, boot
      s(2, -128, 30, 70, pants), s(2, -58, 30, 42, pants), s(4, -16, 44, 16, "hair"),      // front leg, boot
      q(-36, -226, 20, "br", shirt), s(-16, -226, 32, 20, shirt), q(16, -226, 20, "bl", shirt), s(-36, -206, 72, 82, shirt), // torso
      s(30, -204, 16, 64, shirt), h(30, -148, 8, "d", "skin"), s(30, -150, 26, 14, "skin"),  // arm to the staff
      s(-18, -246, 36, 22, "skin"), h(-18, -226, 18, "d", "skin"),                         // face
      h(-22, -282, 22, "u", "hair"), s(-22, -260, 8, 22, "hair"),                           // hair
      h(-30, -270, 30, "u", o2.hat || "f3"), s(-34, -262, 70, 8, o2.hat || "f3")           // hat
    ].join("");
  };
  const figureSit = (o2: FigOpts = {}) => {
    const shirt = o2.shirt || "sand", pants = o2.pants || "f3", pack = o2.pack || "gold";
    return [
      s(-56, -200, 28, 74, pack), q(-56, -218, 18, "br", pack),                            // pack
      s(-34, -60, 120, 30, pants), q(56, -60, 30, "tr", pants), s(66, -30, 30, 26, pants), s(66, -6, 46, 14, "hair"), // legs out, knee, boot
      q(-34, -192, 18, "br", shirt), s(-16, -192, 30, 18, shirt), q(14, -192, 18, "bl", shirt), s(-34, -174, 66, 116, shirt), // torso
      s(26, -160, 15, 70, shirt), h(26, -96, 7.5, "d", "skin"),                            // arm resting on the knee
      s(-16, -212, 32, 22, "skin"), h(-16, -192, 16, "d", "skin"),                         // face
      h(-20, -246, 20, "u", "hair"), s(20, -226, 0, 0, "hair"), s(-20, -226, 10, 24, "hair"), h(12, -236, 9, "u", "hair") // hair, bun
    ].join("");
  };

  const svg = (vw: number, vh: number, inner: string, o2: ArtOpts = {}, def?: string) => { return '<svg class="mi ' + (o2.cls || "") + '" viewBox="0 0 ' + vw + " " + vh + '" preserveAspectRatio="' + (o2.fit || def || "xMaxYMax slice") + '"' + (o2.w ? ' width="' + o2.w + '"' : "") + (o2.h ? ' height="' + o2.h + '"' : "") + ' aria-hidden="true" focusable="false" stroke-width=".8" stroke-linejoin="round">' + inner + "</svg>"; };

  /* ---------- title band scenes, 640 by 240, art weighted to the right ---------- */
  const T = (o2?: ArtOpts): ArtOpts => Object.assign({ fit: "xMaxYMax meet" }, o2 || {});
  const hillsBack = () => [h(250, 70, 200, "u", "l1"), h(420, 40, 170, "u", "l1"), tent(330, 170, 90, "l2"), tent(470, 170, 120, "l2"), tent(600, 170, 80, "l2")].join("");
  /* My Network: the camp at dusk, two people talking by the fire. Relationships feel human. */
  const titleCamp = (o2?: ArtOpts) => svg(640, 240, [
    hillsBack(), h(560, 52, 44, "u", "sun"),
    h(300, 160, 160, "u", "f1"), h(500, 170, 150, "u", "f2"), s(300, 230, 340, 10, "f2"),
    tent(560, 236, 46, "f3"), o(547, 223, 13, "br", "sand"), o(560, 223, 13, "bl", "sand"), tent(612, 236, 26, "f4"),
    tent(472, 236, 12, "pack"), tent(472, 236, 7, "gold"), spark(472, 210, 5, "sun-2"),
    place(figureSit(), 418, 236, 0.28), place(figureSit({ shirt: "co-2", pants: "f4", pack: "l4" }), 528, 236, 0.28, true),
    steps([[330, 230], [356, 226], [382, 230]], 5, "f4"),
    spark(450, 70, 6, "sun-2")
  ].join(""), T(o2));
  /* My Network next move: two camps joined by a bridge. A warm introduction. */
  const bridgeCamps = (o2?: ArtOpts) => svg(240, 280, [
    s(0, 0, 240, 280, "l1"), h(80, 70, 40, "u", "sun"),
    h(-60, 120, 120, "u", "l2"), h(110, 110, 120, "u", "l3"),
    s(0, 220, 240, 60, "cobalt"), s(0, 236, 240, 4, "co-2"), s(0, 254, 240, 4, "co-2"),
    q(-30, 170, 90, "tr", "f2"), s(0, 210, 60, 70, "f2"), q(180, 170, 90, "tl", "f3"), s(180, 210, 60, 70, "f3"),
    s(52, 196, 136, 14, "sand"), h(76, 210, 44, "d", "sand"), h(120, 210, 44, "d", "sand"), s(76, 210, 88, 0, "sand"),
    tent(28, 210, 22, "gold"), tent(212, 210, 22, "f4"),
    steps([[70, 192], [92, 192], [114, 192], [136, 192], [158, 192]], 4, "f4"),
    spark(196, 52, 6, "sun-2")
  ].join(""), o2, "xMidYMid slice");
  /* Company view, no warm path yet: the tent at the trailhead, steps leading off toward the company */
  const trailhead = (o2?: ArtOpts) => svg(320, 200, [
    h(150, 60, 120, "u", "l1"), h(40, 120, 80, "u", "f1"), s(0, 186, 320, 14, "f2"),
    tent(70, 186, 40, "f3"), o(60, 176, 10, "br", "sand"), o(70, 176, 10, "bl", "sand"),
    steps([[130, 176], [156, 172], [182, 176], [208, 172], [234, 176], [260, 172], [286, 176]], 5, "sand"),
    h(250, 70, 30, "u", "sun"), spark(200, 50, 6, "sun-2")
  ].join(""), o2, "xMidYMax slice");
  /* the explorer with a spyglass on a hilltop, looking out to the right: searching for the next client */
  const figureSpy = () => [
    s(-34, -120, 30, 104, "pants"), s(-42, -16, 40, 16, "hair"), s(4, -120, 30, 104, "pants"), s(4, -16, 44, 16, "hair"),
    s(-56, -212, 26, 76, "pack"), q(-56, -230, 18, "br", "pack"),
    q(-34, -224, 20, "br", "shirt"), s(-14, -224, 30, 20, "shirt"), q(16, -224, 20, "bl", "shirt"), s(-34, -204, 70, 90, "shirt"),
    s(10, -214, 52, 16, "shirt"), h(54, -214, 8, "r", "skin"),
    s(-16, -246, 34, 24, "skin"), h(-16, -224, 17, "d", "skin"), h(-20, -280, 21, "u", "hair"), s(-20, -259, 9, 20, "hair"),
    s(30, -246, 70, 18, "hair"), s(92, -251, 20, 28, "hair"), s(26, -242, 8, 10, "gold")
  ].join("");
  const titleSpy = (o2?: ArtOpts) => svg(640, 240, [
    hillsBack(), h(540, 36, 54, "u", "sun"),
    h(380, 160, 140, "u", "l3"), h(540, 170, 130, "u", "l2"),
    tree(450, 150, 30, "f2", "f3"), tree(480, 156, 22, "f1", "f3"),
    h(400, 150, 110, "u", "deep"), s(400, 260, 220, 0, "deep"), q(280, 180, 60, "tl", "l4"),
    leaf(330, 240, 96, "f3"), leaf(372, 240, 70, "f4", true), leaf(300, 228, 56, "f2"),
    place(figureSpy(), 500, 154, 0.4),
    spark(620, 96, 7, "sun-2")
  ].join(""), T(o2));
  const titleSit = (o2?: ArtOpts) => svg(640, 240, [
    hillsBack(), h(500, 40, 50, "u", "sun"),
    h(260, 150, 170, "u", "l3"), h(540, 170, 140, "u", "l3"),
    h(366, 132, 96, "u", "rock"), s(366, 228, 192, 12, "rock"), h(420, 176, 60, "u", "l4"), // the rock the figure sits on
    leaf(250, 240, 120, "f3"), leaf(296, 240, 92, "f4", true), leaf(214, 226, 70, "f2"), leaf(340, 240, 64, "f2", true),
    place(figureSit(), 446, 158, 0.42),
    spark(600, 78, 7, "sun-2")
  ].join(""), T(o2));
  const titleWalk = (o2?: ArtOpts) => svg(640, 240, [
    hillsBack(), h(500, 30, 56, "u", "sun"),
    h(260, 150, 160, "u", "l3"), h(470, 120, 200, "u", "l2"),
    q(340, 150, 150, "tr", "f3"), o(400, 160, 80, "bl", "f2"), h(520, 150, 140, "u", "f4"), q(560, 170, 80, "tl", "l4"),
    steps([[250, 228], [280, 222], [310, 214], [340, 204], [370, 192]], 5, "sand"),
    place(figureWalk(), 470, 168, 0.4),
    spark(610, 108, 6, "sun-2")
  ].join(""), T(o2));
  const titleSign = (o2?: ArtOpts) => svg(640, 240, [
    hillsBack(), h(510, 36, 50, "u", "sun"),
    h(300, 150, 170, "u", "l3"), h(500, 140, 170, "u", "f1"),
    q(440, 160, 80, "tr", "f2"), h(560, 180, 120, "u", "f3"),
    steps([[300, 232], [330, 226], [360, 220], [390, 214], [420, 208], [450, 202]], 5, "sand"),
    s(492, 92, 8, 116, "rock"), s(500, 100, 62, 22, "gold"), q(562, 100, 22, "bl", "gold"), s(440, 132, 52, 22, "co-2"), q(418, 132, 22, "br", "co-2"), s(500, 162, 46, 20, "l4"), q(546, 162, 20, "bl", "l4"),
    place(figureWalk({ shirt: "co-2", pack: "gold" }), 400, 208, 0.26),
    spark(600, 110, 6, "sun-2")
  ].join(""), T(o2));
  const titleBall = (o2?: ArtOpts) => svg(640, 240, [
    hillsBack(), h(250, 140, 160, "u", "l3"), h(470, 120, 190, "u", "l2"), q(560, 150, 90, "tl", "l4"),
    s(456, 196, 88, 16, "sand"), o(430, 212, 50, "br", "sand"), s(480, 212, 40, 28, "sand"), o(520, 212, 50, "bl", "sand"), s(410, 236, 180, 4, "sand"),
    ball(500, 140, 56, "gold"), q(466, 106, 24, "br", "sun"), tent(480, 176, 18, "f4"), tent(522, 176, 18, "f4"), tent(500, 176, 26, "deep"),
    spark(400, 70, 9, "sun-2"), spark(610, 90, 6, "l4")
  ].join(""), T(o2));
  const titleHome = (o2?: ArtOpts) => svg(640, 240, [
    hillsBack(), h(440, 70, 90, "u", "sun"),
    h(270, 160, 160, "u", "l3"), h(470, 150, 180, "u", "f1"), q(560, 160, 80, "tl", "f2"),
    tent(470, 236, 46, "f3"), o(457, 225, 13, "br", "sand"), o(470, 225, 13, "bl", "sand"), tent(540, 236, 30, "f4"), s(580, 176, 4, 60, "f4"), q(584, 176, 22, "tl", "gold"),
    steps([[330, 230], [360, 226], [390, 228], [420, 226]], 5, "f4"),
    spark(380, 90, 8, "sun-2")
  ].join(""), T(o2));
  const titleKeep = (o2?: ArtOpts) => svg(640, 240, [
    hillsBack(), h(520, 40, 46, "u", "sun"),
    h(290, 150, 170, "u", "l3"), h(470, 140, 190, "u", "f1"),
    s(430, 120, 210, 120, "l4"), s(430, 112, 20, 8, "l4"), s(470, 112, 20, 8, "l4"), s(510, 112, 20, 8, "l4"), s(550, 112, 20, 8, "l4"), s(590, 112, 20, 8, "l4"),
    arch(490, 240, 40, 104, "deep"), arch(500, 240, 30, 92, "gold"), arch(508, 240, 22, 82, "sky"),
    steps([[330, 232], [360, 228], [390, 232], [420, 228], [450, 232]], 5, "f3"),
    leaf(400, 240, 60, "f3"), leaf(420, 240, 44, "f2", true),
    spark(612, 70, 7, "sun-2")
  ].join(""), T(o2));

  /* ---------- card art, 320 by 200, weighted bottom right ---------- */
  const doorway = (o2?: ArtOpts) => svg(320, 200, [
    h(150, 70, 130, "u", "l1"), tent(250, 200, 110, "l2"),
    arch(150, 200, 70, 170, "l3"), arch(166, 200, 54, 150, "l1"), q(166, 50, 54, "br", "l2"), s(166, 104, 54, 96, "l2"),
    s(220, 104, 34, 96, "sky"), q(220, 50, 54, "bl", "sky")
  ].join(""), o2);
  const summit = (o2?: ArtOpts) => svg(320, 200, [
    h(100, 90, 120, "u", "l1"), tent(250, 200, 120, "co-2"), tent(130, 200, 90, "cobalt"), o(250, 80, 120, "bl", "co-3"),
    o(220, 80, 30, "br", "sand"), o(250, 80, 30, "bl", "sand"),
    s(248, 28, 4, 54, "hair"), q(252, 28, 26, "tl", "gold")
  ].join(""), o2);
  const arches = (o2?: ArtOpts) => svg(320, 200, [
    h(110, 60, 90, "u", "gold"), s(110, 150, 180, 50, "gold"), arch(190, 200, 60, 160, "f3"), h(250, 100, 70, "u", "sun"), arch(260, 200, 60, 110, "f2"), q(140, 140, 60, "tr", "f4")
  ].join(""), o2);
  const harbor = (o2?: ArtOpts) => svg(360, 220, [
    h(-40, 110, 150, "u", "l1"), h(180, 90, 170, "u", "l2"), tent(300, 170, 80, "l3"),
    s(0, 170, 360, 50, "l3"), s(0, 182, 360, 3, "l2"), s(0, 196, 360, 3, "l2"),
    s(96, 128, 26, 20, "gold"), s(124, 128, 26, 20, "pack"), s(152, 128, 26, 20, "l4"), s(180, 128, 26, 20, "gold"), s(208, 128, 26, 20, "cobalt"),
    s(110, 106, 26, 20, "l4"), s(138, 106, 26, 20, "gold"), s(166, 106, 26, 20, "pack"), s(194, 106, 26, 20, "l4"),
    s(236, 86, 22, 62, "sand"), s(240, 74, 14, 12, "sand"),
    s(80, 148, 200, 22, "deep"), q(280, 148, 22, "tl", "deep"), o(58, 148, 22, "tr", "deep")
  ].join(""), o2, "xMidYMax slice");
  /* the signpost where the trail forks: a wooden post, one sign each way, the trail of steps coming up to it */
  const signpost = (o2?: ArtOpts) => svg(240, 280, [
    s(0, 0, 240, 280, "l1"), h(136, 74, 44, "u", "sun"),
    h(-70, 104, 140, "u", "l2"), h(96, 118, 130, "u", "l3"),
    h(-90, 176, 150, "u", "f1"), h(92, 196, 130, "u", "f2"), s(0, 250, 240, 30, "f2"), q(150, 226, 90, "tl", "f3"),
    steps([[150, 270], [138, 256], [128, 244], [120, 233], [116, 223]], 5, "sand"),
    s(113, 96, 9, 130, "wood"), h(113, 90, 4.5, "u", "wood"),
    s(122, 104, 64, 24, "l4"), o(186, 104, 12, "tl", "l4"), o(186, 116, 12, "bl", "l4"),
    s(50, 138, 63, 24, "gold"), o(38, 138, 12, "tr", "gold"), o(38, 150, 12, "br", "gold"),
    s(122, 172, 46, 20, "co-2"), h(168, 172, 10, "r", "co-2"),
    spark(40, 60, 6, "sun-2")
  ].join(""), o2, "xMidYMid slice");
  const navLand = (o2?: ArtOpts) => svg(240, 300, [
    h(88, 158, 62, "u", "nav-sun"), spark(206, 92, 6, "nav-sun"), spark(70, 128, 4, "nav-sun"),
    h(-80, 170, 170, "u", "nav-l1"), h(70, 190, 140, "u", "nav-l2"),
    h(-100, 214, 150, "u", "nav1"), h(90, 222, 150, "u", "nav2"), q(-20, 230, 120, "tr", "nav3"), q(120, 236, 130, "tl", "nav2"),
    tree(206, 262, 26, "nav4", "nav4"), tree(226, 270, 18, "nav5", "nav4"), tree(26, 268, 20, "nav4", "nav4"),
    s(0, 270, 240, 30, "nav1")
  ].join("").replace(/var\(--i-nav-l1\)/g, "#9c86c9").replace(/var\(--i-nav-l2\)/g, "#7d66b0").replace(/var\(--i-nav1\)/g, "#1a4b3d").replace(/var\(--i-nav2\)/g, "#215a49").replace(/var\(--i-nav3\)/g, "#2c6b55").replace(/var\(--i-nav4\)/g, "#123f33").replace(/var\(--i-nav5\)/g, "#3b7c62").replace(/var\(--i-nav-sun\)/g, "#f0b85e"), o2, "xMidYMax slice");
  const mark = (col?: string) => '<svg viewBox="0 0 32 32" aria-hidden="true"><path stroke="none" fill="' + (col || "currentColor") + '" d="M16 3c-1.1 0-2 .9-2 2v1.3C11.9 13 8 19.2 3.5 23.6a1.6 1.6 0 1 0 2.2 2.3C10 21.7 13.6 16 16 9.8c2.4 6.2 6 11.9 10.3 16.1a1.6 1.6 0 1 0 2.2-2.3C24 19.2 20.1 13 18 6.3V5c0-1.1-.9-2-2-2z"/><circle cx="16" cy="25.5" r="3.3" fill="' + (col || "currentColor") + '"/></svg>';
  return {
    titleCamp, bridgeCamps, trailhead, titleSpy, titleSit, titleWalk, titleSign, titleBall, titleHome, titleKeep,
    doorway, summit, arches, harbor, signpost, navLand, mark,
    figureWalk: (o2?: ArtOpts) => svg(160, 300, place(figureWalk(), 80, 290, 1), o2, "xMidYMax meet"),
    figureSit: (o2?: ArtOpts) => svg(200, 260, place(figureSit(), 80, 250, 1), o2, "xMidYMax meet"),
  };
};
export const MI = build();
export type ArtName = Exclude<keyof typeof MI, "mark">;

/** One scene, inline. Decorative: hidden from assistive tech. */
export function Art({ name, opts, className, style }: { name: ArtName; opts?: ArtOpts; className?: string; style?: CSSProperties }) {
  // Our own static drawing (no member text in it), so inlining the markup is safe.
  return <span className={className} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: MI[name](opts) }} />;
}

/** The Merlin mark (the logo's A and its dot). */
export function MarkIcon({ color }: { color?: string }) {
  return <span className="m-markic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MI.mark(color) }} />;
}
