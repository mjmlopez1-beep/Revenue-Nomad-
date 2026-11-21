/**
 * Fractions icons: one small mark for each kind of signal Crystal Ball sends, and two for its
 * groups (new since yesterday, still a good time). Made for the morning email first (rasterised
 * to PNG at 2x and 3x into public/email/crystal-ball/ by scripts/make-email-art.mts), and written
 * here so the app and Slack can draw the same marks later.
 *
 * Each icon is a 48 by 48 tile, readable down to 32px: a field of its own (square, never a
 * circle), one big tone quarter cropped by its corner, and one glyph cut from the five pieces on
 * a 12px grid (6 and 3 for steps and sparks). Flat colour, no outlines, no words.
 *
 * Three families, so a column of cards reads at a glance:
 *   seats     (mint field)   hired, role, ended, rehire, tenure: what happened to a fractional seat
 *   leaders   (sand field)   arrival, departure, gap: who leads the function on the company's own site
 *   company   (pine field)   funding, team, growing: the company itself is moving
 * and the group marks: new (sand, the sun half coming up) and still (pine, the moon half).
 *
 * Colour: pine, its tone, mint, mint soft, sand, sand deep, saffron, and ember on two marks only
 * (the Nomad in the seat, the sun). Other people are the Nomad's silhouette in one tone. Never violet (Violet's rule). The markup uses the same
 * colour tokens as the rest of the kit (fxc-<token>, fractions.css); `solid()` swaps them for
 * the brand hexes where no stylesheet reaches (an email, a PNG, Slack).
 */
import { q, o, h, s, g, place, pill, type Tok } from "./lib";
import { nomad, spark, shade } from "./nomad";
import { arch, chair, steps } from "./props";

export type IconKind = "hired" | "role" | "ended" | "rehire" | "tenure" | "arrival" | "departure" | "gap" | "funding" | "team" | "growing" | "new" | "still";
export const ICON_KINDS: IconKind[] = ["hired", "role", "ended", "rehire", "tenure", "arrival", "departure", "gap", "funding", "team", "growing", "new", "still"];
/** The icon's own box. */
export const ICON = 48;

/** A family's field and the tone quarter cropped in its corner. */
const FIELD = {
  seat: { bg: "mint", tone: "mintd" },
  lead: { bg: "sand", tone: "sandd" },
  co: { bg: "pine", tone: "pine2" },
} as const;
type Family = keyof typeof FIELD;
const tile = (f: Family, corner: "tr" | "tl" = "tr") => s(0, 0, ICON, ICON, FIELD[f].bg) + (corner === "tr" ? q(18, 0, 30, "tr", FIELD[f].tone) : q(0, 0, 30, "tl", FIELD[f].tone));

/** The seat (props.ts chair), its bottom left at (x, y), `k` of its 280 by 320 box. */
const seatAt = (x: number, y: number, k: number, c: Tok, flip = false) => g(chair(0, 0, c), `translate(${x} ${y}) scale(${flip ? -k : k} ${k})`);
/**
 * A person at the company (never the member, who is the ember Nomad): the Nomad's figure in
 * another cloak, standing at (x, y), `k` of its 320 box. `face` null: the silhouette alone, someone
 * who isn't there.
 */
const fig = (x: number, y: number, k: number, cloak: Tok, face: Tok | null = "sand", eye: Tok = "pine") =>
  place(face ? nomad("stand", { cloak, face, eye }) : shade(cloak), x, y, k);

const DRAW: Record<IconKind, () => string> = {
  /** Hired a fractional: the seat, and the Nomad in it (its ember cloak is the icon's one ember piece). */
  hired: () => tile("seat") + seatAt(6, 46, 0.1, "pine") + place(nomad("stand"), 27, 29, 0.058),
  /** Open role: the door, open, its saffron lining lit. */
  role: () => tile("seat") + arch(11, 44, 13, 36, "pine") + arch(15, 44, 9, 29, "acc") + arch(19, 44, 5, 22, "mints") + spark(41, 8, 4, "pine"),
  /** Fractional seat ended: the seat, empty, and the steps of whoever left it. */
  ended: () => tile("seat") + seatAt(5, 44, 0.085, "pine") + steps([[33, 40], [39, 40], [45, 40]], 3, "pine"),
  /** Hired fractionals before (a seat ended months ago): two seats, the second in sand. */
  rehire: () => tile("seat") + seatAt(3, 44, 0.07, "pine") + seatAt(45, 44, 0.07, "sand", true),
  /** A seat at 12 months: the calendar tile, a year of squares, the last one saffron. */
  tenure: () =>
    tile("seat") +
    s(9, 11, 30, 29, "sand") +
    s(9, 11, 30, 8, "pine") +
    arch(14, 15, 2, 8, "mintd") +
    arch(30, 15, 2, 8, "mintd") +
    [0, 1, 2].map((c) => s(13 + c * 8, 23, 6, 5, "sandd")).join("") +
    [0, 1].map((c) => s(13 + c * 8, 31, 6, 5, "sandd")).join("") +
    s(29, 31, 6, 5, "acc"),
  /** New leader: a figure in pine, with a saffron spark. */
  arrival: () => tile("lead") + fig(21, 46, 0.11, "pine") + spark(40, 10, 5, "acc"),
  /** Leader left: the figure gone pale, and the steps going out. */
  departure: () => tile("lead") + fig(16, 46, 0.1, "sandd", "white", "sandd") + steps([[34, 41], [40, 41], [46, 41]], 3, "pine"),
  /** No leader on the team page: a row of figures with the middle one missing. */
  gap: () => tile("lead", "tl") + fig(8, 46, 0.055, "pine") + fig(24, 46, 0.055, "sandd", null) + fig(40, 46, 0.055, "pine"),
  /** Raised money: coins seen edge on (a stack), one saffron spark. */
  funding: () =>
    tile("co") +
    pill(9, 37, 22, 6, "mint") +
    pill(12, 30, 22, 6, "sand") +
    pill(8, 23, 22, 6, "mint") +
    pill(11, 16, 22, 6, "sand") +
    spark(39, 12, 5, "acc"),
  /** Team hiring: a row of figures, the newest in mint. */
  team: () => tile("co") + fig(8, 46, 0.055, "sand", "white") + fig(24, 46, 0.065, "mint", "white") + fig(40, 46, 0.055, "sand", "white") + spark(41, 8, 4, "acc"),
  /** Growing: the ramp (an off-cut) rising to a saffron spark. */
  growing: () => tile("co", "tl") + o(10, 14, 30, "br", "mint") + s(10, 44, 30, 4, "mint") + spark(37, 8, 5, "acc"),
  /** New since yesterday: the sun half coming up over the ground. */
  new: () => s(0, 0, ICON, ICON, "sand") + q(18, 0, 30, "tr", "sandd") + h(8, 18, 16, "u", "ember") + s(0, 34, ICON, 14, "pine") + spark(38, 12, 4, "acc"),
  /** Still a good time: the moon half, and the night. */
  still: () => s(0, 0, ICON, ICON, "pine") + q(0, 0, 30, "tl", "pine2") + h(16, 8, 16, "r", "sand") + spark(12, 32, 3, "sand") + spark(39, 36, 4, "acc") + s(0, 44, ICON, 4, "pine2"),
};

/** An icon's markup in token classes (fractions.css colours it), for a 48 by 48 viewBox. */
export const icon = (kind: IconKind): string => DRAW[kind]();

/** The brand hexes behind each token (globals.css), for markup that has no stylesheet: an email's PNG, Slack. Violet is left out on purpose. */
export const HEX: Record<string, string> = {
  pine: "#073f2f",
  pine2: "#0e5640",
  mint: "#2ee59d",
  mints: "#e8fbf2",
  mintd: "#22d18c",
  ember: "#ff5a1f",
  sand: "#f5ecd9",
  sandd: "#ead9b6",
  acc: "#ffc12e",
  acchi: "#ffe39a",
  white: "#ffffff",
  bgf: "#fafaf7",
};

/**
 * Standalone SVG with the brand hexes written in (each piece filled and stroked a hair in its
 * own colour, as fractions.css does, so pieces that meet leave no seam). Throws on a token it
 * doesn't know, violet included: art for email never carries it.
 */
export function solid(markup: string, w: number, hh: number, px = { w, h: hh }, hair = 0.7): string {
  const body = markup.replaceAll("§", "s").replace(/class="fxc-([a-z0-9-]+)"/g, (_, t: string) => {
    const hex = HEX[t];
    if (!hex) throw new Error(`fractions: no hex for token "${t}"`);
    return `fill="${hex}" stroke="${hex}" stroke-width="${hair}" stroke-linejoin="round"`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}" width="${px.w}" height="${px.h}" shape-rendering="geometricPrecision">${body}</svg>`;
}
