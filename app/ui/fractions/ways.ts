/**
 * Fractions colourways: role to token. A piece never names a hex, it names a token (lib.ts); a
 * composition that has to work in both registers never names a token, it names a ROLE of the
 * colourway it is handed (m.ink, m.tone ...). Passing LOUD.pine or QUIET is the whole difference
 * between the registers.
 *
 *   bg      the field, or the surface the art sits on
 *   tone    the big tone-on-field shape            hill   the big second-colour shape (dome, arch, sky)
 *   light   light inside a door, the pale dome     ground the ground strip
 *   ink     a prop's main structure                ink2   its second structure colour
 *   paper   paper, a coin's face, stone            pop    the one large ember shape (loud), a sand tone (quiet)
 *   hot     the small ember accent: one per SCREEN in the app, so calm() turns it saffron
 *   acc     saffron: the ball, one spark           lining a door's lining: saffron in loud, sand deep in quiet
 *   spark   ordinary sparks                        cloak, face, eye   the Nomad
 *
 * LOUD is for the landing page, first run, sign-in and error pages: the brand tokens at full
 * strength, on a pine, mint or sand field or straight on a light surface.
 * QUIET is for every signed-in page. Its tokens (q-ink, q-tone ...) are flat pre-mixed tints, and
 * which tint depends on the surface the art sits on: fractions.css holds one set of CSS variables
 * per surface (.fx-on-white, .fx-on-bg, .fx-on-mint, .fx-on-pine), and <Fx on="..."> picks it.
 */
import type { Tok } from "./lib";

export interface Way {
  bg: Tok;
  tone: Tok;
  hill: Tok;
  hill2: Tok;
  light: Tok;
  ground: Tok;
  ink: Tok;
  ink2: Tok;
  paper: Tok;
  pop: Tok;
  hot: Tok;
  acc: Tok;
  acchi: Tok;
  spark: Tok;
  dark: Tok;
  cloak: Tok;
  face: Tok;
  eye: Tok;
  lining: Tok;
  quiet?: boolean;
}

const nomadYou = { cloak: "ember", face: "sand", eye: "pine", lining: "acc" };
const loudBase = { pop: "ember", hot: "ember", acc: "acc", acchi: "acchi", dark: "pine", ...nomadYou };

export const LOUD: Record<"pine" | "mint" | "sand" | "white" | "bg" | "mints", Way> = {
  pine: { ...loudBase, bg: "pine", tone: "pine2", hill: "mint", hill2: "mintd", light: "mints", ground: "sand", ink: "sand", ink2: "mint", paper: "sand", spark: "sand" },
  mint: { ...loudBase, bg: "mint", tone: "mintd", hill: "mints", hill2: "mintd", light: "mints", ground: "pine", ink: "pine", ink2: "sand", paper: "sand", spark: "pine" },
  sand: { ...loudBase, bg: "sand", tone: "sandd", hill: "mint", hill2: "sandd", light: "mints", ground: "pine", ink: "pine", ink2: "mint", paper: "white", spark: "pine" },
  // Loud on a light surface with no field of its own.
  white: { ...loudBase, bg: "white", tone: "mints", hill: "mint", hill2: "mintd", light: "mints", ground: "pine", ink: "pine", ink2: "mint", paper: "sand", spark: "pine" },
  bg: { ...loudBase, bg: "bgf", tone: "sand", hill: "mint", hill2: "mintd", light: "mints", ground: "pine", ink: "pine", ink2: "mint", paper: "sand", spark: "pine" },
  mints: { ...loudBase, bg: "mints", tone: "mint", hill: "mint", hill2: "mintd", light: "white", ground: "pine", ink: "pine", ink2: "sand", paper: "sand", spark: "pine" },
};

/** The quiet register. One map for every surface: the surface's own tints come from the CSS variable set <Fx on> picks. */
export const QUIET: Way = {
  bg: "q-bg",
  tone: "q-tone",
  hill: "q-hill",
  hill2: "q-tone",
  light: "q-light",
  ground: "q-ink2",
  ink: "q-ink",
  ink2: "q-ink2",
  paper: "q-b",
  pop: "q-pop",
  hot: "ember",
  acc: "acc",
  acchi: "acchi",
  spark: "q-ink2",
  dark: "q-ink",
  quiet: true,
  ...nomadYou,
  lining: "q-pop",
};

/** The surfaces quiet art can sit on. */
export type Surface = "white" | "bg" | "mint" | "pine";

/**
 * The screen has spent its ember (a Hiring now chip, an alert, the Nomad somewhere else): the
 * art's one ember piece turns saffron.
 */
export const calm = (m: Way): Way => ({ ...m, hot: m.acc });
/** Pro's door keeps its saffron lining in the quiet register too: it is how Pro is marked. */
export const proDoor = (m: Way): Way => ({ ...m, lining: "acc" });
