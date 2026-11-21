/**
 * Fractions in the product: the asset library as components. Every picture is one inline <svg>
 * (no images, no libraries), decoration unless it is given a `title`, and it never takes a tap.
 *
 * Two registers (ways.ts). LOUD is the landing page's voice, kept for first run, sign-in and
 * error pages. QUIET is for every signed-in page: no field of its own, flat pale tints of the
 * surface it sits on (`on`: white, bg the app's off-white, mint the mint tint, pine), and ember
 * on one small piece.
 *
 * The rules the app keeps (the library's, in short):
 *   - At most one Nomad a screen, and never the same pose on two screens in a row of one flow.
 *   - A scene lives in one place only; a spot belongs to one state, and a screen shows one spot.
 *   - No art behind or touching a table, a row or a record's content: 24px clear of any data.
 *   - Ember once a screen. Where the screen already shows ember (a Hiring now chip, an alert,
 *     the Nomad), art is drawn calm: its ember piece turns saffron. That is the default here;
 *     pass `ember` only where the art holds the screen's one ember.
 *   - Sizes: a spot up to 160px, a header prop up to 96px, the Nomad up to 72px on its own, a
 *     quiet scene up to 240px tall.
 *   - Nothing here animates, loads anything or runs an effect.
 *
 * Bleeds, dividers, bullets, glyphs, frames and textures repeat freely: they are the thread
 * between screens.
 */
import { useId, type CSSProperties, type ReactNode } from "react";
import { g, s, U } from "./lib";
import { LOUD, QUIET, calm, proDoor, type Surface, type Way } from "./ways";
import { nomad, POSE_BOX, type NomadOpt, type Pose } from "./nomad";
import * as props from "./props";
import * as spots from "./spots";
import { BLEEDS, BULLETS, GLYPHS, avatar, cornerCluster, dividerCamp, dividerScallop, dividerSpark, dividerSteps, frame, textureBorder, textureSparse, type BleedKind, type BulletKind, type FrameKind, type GlyphKind } from "./patterns";
import { STRIPS, doorway, scene, trail, trailWidth, welcomeBanner, type SceneKind, type StripKind } from "./compose";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
/** Markup is drawn once per picture and colourway, then kept. */
const memo = new Map<string, string>();
const once = (key: string, make: () => string) => {
  let v = memo.get(key);
  if (v === undefined) memo.set(key, (v = make()));
  return v;
};

interface FxProps {
  /** The picture, as markup from the kit. */
  html: string;
  /** The viewBox. */
  box: string;
  /** The surface quiet art sits on: picks the set of quiet tints. */
  on?: Surface;
  className?: string;
  /** With a title the picture is an image with that name; without, it is hidden from assistive technology. */
  title?: string;
  /** preserveAspectRatio. */
  fit?: string;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}
/** One picture. */
export function Fx({ html, box, on, className, title, fit, width, height, style }: FxProps) {
  const id = useId().replace(/[^A-Za-z0-9]/g, "");
  return (
    <svg
      className={cx("fx", on && `fx-on-${on}`, className)}
      viewBox={box}
      width={width}
      height={height}
      style={style}
      preserveAspectRatio={fit}
      focusable="false"
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      dangerouslySetInnerHTML={{ __html: html.includes("§") ? html.replaceAll("§", id) : html }}
    />
  );
}

type Common = { on?: Surface; className?: string; title?: string; /** This art holds the screen's one ember. */ ember?: boolean };
const way = (ember?: boolean, base: Way = QUIET) => (ember ? base : calm(base));

/* ---------- spots: one state each, never two on a screen ---------- */
const SPOTS = {
  noRoles: spots.spotNoRoles,
  noViews: spots.spotNoViews,
  noMessages: spots.spotNoMessages,
  noFollows: spots.spotNoFollows,
  noSeats: spots.spotNoSeats,
  ballEmpty: spots.spotBallEmpty,
  noResults: spots.spotNoResults,
  noCredits: spots.spotNoCredits,
  unlocked: spots.spotUnlocked,
  factAdded: spots.spotFactAdded,
  inviteSent: spots.spotInviteSent,
  offline: spots.spotOffline,
  loading: spots.spotLoading,
};
export type SpotKind = keyof typeof SPOTS;
/** A spot illustration, `size` px square (160 at most), centred above an empty state's heading. */
export function Spot({ name, size = 128, on = "white", ember, className, title }: Common & { name: SpotKind; size?: number }) {
  return <Fx html={once(`spot:${name}:${!!ember}`, () => SPOTS[name](way(ember)))} box={`0 0 ${spots.SPOT} ${spots.SPOT}`} width={size} height={size} on={on} className={cx("fx-spot", className)} title={title} />;
}

/* ---------- props: one lead prop a page ---------- */
const PROPS = {
  ballPlain: props.ballPlain,
  ballGlow: props.ballGlow,
  seatEmpty: props.seatEmpty,
  seatYours: props.seatYours,
  seatPair: props.seatPair,
  seatRow: props.seatRow,
  doorClosed: props.doorClosed,
  doorAjar: props.doorAjar,
  doorOpen: props.doorOpen,
  doorRow: props.doorRow,
  camp: props.camp,
  trailWinding: props.trailWinding,
  coinStack: props.coinStack,
  coinPair: props.coinPair,
  key: (m: Way) => props.key(m),
  lockOpen: props.lockOpen,
  lantern: props.lantern,
  ledger: props.ledger,
  cairn: props.cairn,
  bell: props.bell,
  envelope: props.envelope,
  bubbles: props.bubbles,
  join: props.join,
  compass: props.compass,
  well: props.well,
  bars: (m: Way) => props.bars(m),
  calendar: props.calendar,
  flag: props.flag,
};
export type PropKind = keyof typeof PROPS;
/**
 * A prop, `height` px tall (96 at most in a header), on its own ground line when `ground` is
 * set. `pro`: a door drawn with Pro's saffron lining.
 */
export function Prop({ name, height = 72, on = "white", ember, className, title, ground, pro }: Common & { name: PropKind; height?: number; ground?: boolean; pro?: boolean }) {
  const b = props.PROP_BOX[name];
  const pad = 10;
  const w = b.w * U + 2 * pad;
  const hh = b.h * U + pad + (ground ? 12 : pad);
  const x = -(b.dx ?? 0) * U - w / 2;
  const html = once(`prop:${name}:${!!ember}:${!!ground}:${!!pro}`, () => {
    const m = pro ? proDoor(way(ember)) : way(ember);
    return PROPS[name](m) + (ground ? s(x + pad / 2, 0, w - pad, 8, m.ground) : "");
  });
  return <Fx html={html} box={`${x} ${-(b.h * U) - pad} ${w} ${hh}`} height={height} width={Math.round((height * w) / hh)} on={on} className={cx("fx-prop", className)} title={title} />;
}

/* ---------- the Nomad: at most one a screen ---------- */
/** The Nomad on its own, `height` px tall (72 at most in the app). The screen's ember: draw nothing else in ember beside it. */
export function NomadArt({ pose, height = 56, on = "white", flip, className, title, opt }: Common & { pose: Pose; height?: number; flip?: boolean; opt?: NomadOpt }) {
  const b = POSE_BOX[pose];
  const pad = 6;
  const w = (b.r - b.l) * U + 2 * pad;
  const hh = b.top * U + 2 * pad;
  const html = once(`nomad:${pose}:${!!flip}:${JSON.stringify(opt ?? null)}`, () => {
    const fig = nomad(pose, { staff: QUIET.dark, mark: QUIET.ink2, glow: QUIET.light, coin: QUIET.ink2, paper: QUIET.paper, line: QUIET.dark, flag: QUIET.ink2, ...opt });
    return flip ? g(fig, `translate(${(b.l + b.r) * U} 0) scale(-1 1)`) : fig;
  });
  return <Fx html={html} box={`${b.l * U - pad} ${-b.top * U - pad} ${w} ${hh}`} height={height} width={Math.round((height * w) / hh)} on={on} className={cx("fx-nomad", className)} title={title} />;
}

/* ---------- scenes: one home each ---------- */
/**
 * A scene. Quiet by default (no field: it sits on `on`); with `loud` it paints its own pine, mint
 * or sand field. `square` is the 1:1 crop. CSS sizes it (240px tall at most when quiet).
 */
export function Scene({ kind, on = "white", loud, square, ember = true, pro, className, title, fit, style }: Common & { kind: SceneKind; loud?: "pine" | "mint" | "sand" | "dusk"; square?: boolean; pro?: boolean; fit?: string; style?: CSSProperties }) {
  const html = once(`scene:${kind}:${loud ?? "q"}:${!!square}:${!!ember}:${!!pro}`, () => {
    const base = loud ? LOUD[loud] : way(ember);
    return scene(kind, pro ? proDoor(base) : base, !!square, !!loud);
  });
  return <Fx html={html} box={`0 0 ${square ? 540 : 960} 540`} on={loud ? undefined : on} className={cx("fx-scene", className)} title={title} fit={fit} style={style} />;
}

/** Welcome, as the first-run card's banner (960 by 226): loud, on its own pine field. The scene's one home. */
export function WelcomeBanner({ className }: { className?: string }) {
  return <Fx html={once("welcomeBanner", () => welcomeBanner(LOUD.pine))} box="0 0 960 226" className={cx("fx-scene", className)} fit="xMidYMax slice" />;
}

/** The doorway, beside the sign-in form (320 by 520): quiet, on the mint panel it is given. */
export function Doorway({ on = "mint", className }: Common) {
  return <Fx html={once("doorway", () => doorway(QUIET))} box="0 0 320 520" on={on} className={cx("fx-scene", className)} fit="xMidYMax slice" />;
}

/** A header strip (480 by 160, standing on its bottom edge). No Nomad, no ember. */
export function Strip({ kind, on = "white", className, fit = "xMaxYMax meet" }: Common & { kind: StripKind; fit?: string }) {
  return <Fx html={once(`strip:${kind}`, () => STRIPS[kind](calm(QUIET)))} box="0 0 480 160" on={on} className={cx("fx-strip", className)} fit={fit} />;
}

/** The trail as progress: `done` of `total` steps, the Nomad walking at the step reached when `walker`. 40px tall by default. */
export function Trail({ done, total, walker, on = "white", height = 40, className }: Common & { done: number; total: number; walker?: boolean; height?: number }) {
  const w = trailWidth(total);
  return <Fx html={once(`trail:${done}:${total}:${!!walker}`, () => trail(QUIET, done, total, !!walker))} box={`0 0 ${w} 40`} height={height} width={Math.round((height * w) / 40)} on={on} className={cx("fx-trail", className)} />;
}

/* ---------- structure: repeats freely ---------- */
/**
 * A bleed for a card or a header: big quarters and halves the card crops. Put it first inside a
 * card that is `position: relative; overflow: hidden`; it fills the card's height from the right
 * (and the left, for the kinds that have a left piece). One bleed a card, on the side away from
 * the text, never behind a table.
 */
export function Bleed({ kind, on = "white", className }: Common & { kind: BleedKind }) {
  const html = once(`bleed:${kind}`, () => BLEEDS[kind](QUIET, 720, 180));
  const left = kind === "BL" || kind === "Arch";
  return (
    <>
      {left ? <Fx html={html} box="0 0 360 180" on={on} className={cx("fx-bleed fx-bleed-l", className)} fit="xMinYMax meet" /> : null}
      <Fx html={html} box="360 0 360 180" on={on} className={cx("fx-bleed fx-bleed-r", className)} fit="xMaxYMax meet" />
    </>
  );
}

const DIVIDERS = { steps: dividerSteps, spark: dividerSpark, scallop: dividerScallop, camp: dividerCamp };
/** A divider, 24px tall and as wide as its box: steps and scallop run from the left, spark and camp sit in the middle. */
export function Divider({ kind, on = "white", className }: Common & { kind: keyof typeof DIVIDERS }) {
  const mid = kind === "spark" || kind === "camp";
  return <Fx html={once(`div:${kind}`, () => DIVIDERS[kind](QUIET, 2400))} box="0 0 2400 24" on={on} className={cx("fx-divider", className)} fit={mid ? "xMidYMid slice" : "xMinYMid slice"} width="100%" height={24} />;
}

/** A quiet texture: `border` is one 40px row, `sparse` the open band (160px), `corner` a 320px cluster anchored bottom right. */
export function Texture({ kind, on = "white", className, off = 0 }: Common & { kind: "border" | "sparse" | "corner"; off?: number }) {
  if (kind === "corner") return <Fx html={once("tex:corner", () => cornerCluster(QUIET))} box="0 0 320 320" on={on} className={cx("fx-corner", className)} fit="xMaxYMax meet" />;
  const tall = kind === "border" ? 40 : 160;
  return <Fx html={once(`tex:${kind}:${off}`, () => (kind === "border" ? textureBorder : textureSparse)(QUIET, 2400, off))} box={`0 0 2400 ${tall}`} on={on} className={cx("fx-texture", className)} fit="xMinYMid slice" width="100%" height={tall} />;
}

/** A 16px list bullet in the text's own colour (currentColor), or ember where it is the screen's one ember. */
export function Bullet({ kind = "spark", size = 14, tone = "cur", className }: { kind?: BulletKind; size?: number; tone?: string; className?: string }) {
  return <Fx html={once(`bullet:${kind}:${tone}`, () => BULLETS[kind](tone))} box="0 0 16 16" width={size} height={size} className={cx("fx-bullet", className)} />;
}

/**
 * A glyph: the 24 and 16px form of a prop, one colour (`tone`, a token; "cur" follows the text
 * colour) plus an optional accent. Glyphs mark illustration moments (a page title, a toast, a
 * count); the app's line icons stay for navigation and actions.
 */
export function Glyph({ name, size = 16, tone = "cur", bg = "white", acc, className, title }: { name: GlyphKind; size?: number; tone?: string; bg?: string; acc?: string; className?: string; title?: string }) {
  return <Fx html={once(`glyph:${name}:${tone}:${bg}:${acc ?? ""}`, () => GLYPHS[name](tone, bg, acc))} box="0 0 24 24" width={size} height={size} className={cx("fx-glyph", className)} title={title} />;
}

/**
 * An avatar frame, never a circle: an arch for people, a leaf for you, a tile for companies.
 * Children (initials) sit on top; with none, the Nomad's head fills it.
 */
export function Frame({ kind, size = 32, tone = "mints", className, children }: { kind: FrameKind; size?: number; tone?: string; className?: string; children?: ReactNode }) {
  return (
    <span className={cx("fx-frame", className)} style={{ width: size, height: size }}>
      <Fx html={once(`frame:${kind}:${tone}:${children ? "x" : "n"}`, () => (children ? frame(kind, tone) : avatar(kind, tone)))} box="0 0 64 64" width={size} height={size} />
      {children ? <span className="fx-frame-in">{children}</span> : null}
    </span>
  );
}
