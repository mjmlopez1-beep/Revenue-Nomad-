/**
 * The pictures an email can carry, and the frame for an email that carries them (Crystal Ball's
 * morning email first). Email clients don't draw SVG and treat modern CSS unevenly, so:
 *
 *   - every picture is a PNG made from the Fractions kit (app/ui/fractions/icons.ts, mail.ts) by
 *     scripts/make-email-art.mts into public/email/crystal-ball/, served by the app, and linked by
 *     an absolute address on the site the email links to (RN_PUBLIC_URL), like the banner;
 *   - every picture has its width and height, alt text, and a solid colour painted in and behind
 *     it, so a dark mode that recolours the page never turns the art to mud;
 *   - layout is tables and inline styles; the <style> block only adds dark mode (Apple Mail,
 *     Outlook) and a phone's tighter gutters, and the email reads the same without it.
 *
 * Weights (public/email/crystal-ball, palette PNGs): each hero about 9 KB, each icon under 1 KB at
 * 2x, the lockup about 3 KB. `ART_VERSION` goes on every address, so a redrawn picture is fetched
 * fresh by mail apps that cache by address (Gmail's image proxy does).
 */
import { MAIL, escHtml, mailOrigin } from "./email";

export const ART_VERSION = "1";
const DIR = "/email/crystal-ball";

/** One picture: where it is under public/, the size it shows at in the email (its file is 2x), and its alt text. */
export interface MailArt {
  path: string;
  width: number;
  height: number;
  alt: string;
  /** The colour painted behind it, also what shows when images are off. */
  bg: string;
}

export const HERO_ART = {
  morning: { path: `${DIR}/hero-morning@2x.png`, width: 600, height: 200, alt: "The Nomad looks into the crystal ball at sunrise", bg: MAIL.pine },
  quiet: { path: `${DIR}/hero-quiet@2x.png`, width: 600, height: 200, alt: "The crystal ball at night, the Nomad resting beside it", bg: MAIL.pine },
} satisfies Record<string, MailArt>;
export type HeroArt = keyof typeof HERO_ART;

/** The lockup, white on pine, for the top of the email. */
export const LOCKUP_ART: MailArt = { path: `${DIR}/merlin@2x.png`, width: 96, height: 28, alt: "Merlin", bg: MAIL.pine };

/** The icons (app/ui/fractions/icons.ts IconKind), each a 48-unit tile, shown at 40 (2x file); the 3x file is for Slack and the app. */
export type IconArt = "hired" | "role" | "ended" | "rehire" | "tenure" | "arrival" | "departure" | "gap" | "funding" | "team" | "growing" | "new" | "still";
/** Each icon's field colour: behind the image, and the tile that shows when images are off. */
const ICON_BG: Record<IconArt, string> = {
  hired: "#2EE59D",
  role: "#2EE59D",
  ended: "#2EE59D",
  rehire: "#2EE59D",
  tenure: "#2EE59D",
  arrival: "#F5ECD9",
  departure: "#F5ECD9",
  gap: "#F5ECD9",
  funding: MAIL.pine,
  team: MAIL.pine,
  growing: MAIL.pine,
  new: "#F5ECD9",
  still: MAIL.pine,
};
/** An icon is decoration beside its label (the label says what it means), so its alt text is empty. */
export const iconArt = (kind: IconArt, size = 40, scale: 2 | 3 = 2): MailArt => ({ path: `${DIR}/icon-${kind}@${scale}x.png`, width: size, height: size, alt: "", bg: ICON_BG[kind] });

/** A picture's absolute address on `origin`, or "" without one (the email then leaves the picture out). */
export const artUrl = (origin: string, a: Pick<MailArt, "path">) => (origin ? `${origin}${a.path}?v=${ART_VERSION}` : "");

/**
 * An <img> for email: absolute src, width and height, alt text set in the email's face and in a
 * colour that reads on `bg` with images off, display block, no border. `fluid`: scales down with
 * its column (the hero), else fixed. "" when there is no site to load it from.
 */
export function mailImg(origin: string, a: MailArt, o: { fluid?: boolean; altColor?: string; altSize?: number; cls?: string; style?: string } = {}): string {
  const src = artUrl(origin, a);
  if (!src) return "";
  const size = o.fluid ? `width:100%;max-width:${a.width}px;height:auto` : `width:${a.width}px;height:${a.height}px`;
  return `<img src="${escHtml(src)}" width="${a.width}" height="${a.height}" alt="${escHtml(a.alt)}"${o.cls ? ` class="${o.cls}"` : ""} style="display:block;${size};border:0;outline:none;text-decoration:none;background-color:${a.bg};font-family:${MAIL.font};font-size:${o.altSize ?? 14}px;line-height:20px;font-weight:700;color:${o.altColor ?? "#FFFFFF"};${o.style ?? ""}">`;
}

/** The site an email's pictures load from: the email's own link, else RN_PUBLIC_URL. */
export const artOrigin = (link?: string) => mailOrigin(link, typeof process !== "undefined" ? process.env.RN_PUBLIC_URL : undefined);

/**
 * Dark mode, for the mail apps that honour prefers-color-scheme (Apple Mail, Outlook on Mac and
 * phones) and Outlook.com's own (data-ogsc, data-ogsb). The pine hero and the icons keep their
 * colours: they are pictures on solid fields. Everything else is classed `cb-*` in the markup.
 */
const DARK = {
  page: "#0D1813",
  card: "#15241E",
  quiet: "#111E19",
  line: "#2A3B34",
  ink: "#EEF4F0",
  body: "#CBD6D0",
  muted: "#9AAAA2",
  label: "#6FEFBF",
};
const dark = (p: string) => `
${p}.cb-page{background-color:${DARK.page}!important}
${p}.cb-card{background-color:${DARK.card}!important;border-color:${DARK.line}!important}
${p}.cb-quiet{background-color:${DARK.quiet}!important;border-color:${DARK.line}!important}
${p}.cb-line{border-color:${DARK.line}!important}
${p}.cb-ink{color:${DARK.ink}!important}
${p}.cb-body{color:${DARK.body}!important}
${p}.cb-muted,${p}.cb-muted a{color:${DARK.muted}!important}
${p}.cb-label{color:${DARK.label}!important}
${p}.cb-chip-med{background-color:#2C3A33!important;color:${DARK.ink}!important}
${p}.cb-btn{background-color:#2EE59D!important}
${p}.cb-btn a{color:#073F2F!important}`;

const STYLE = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){${dark("")}
}
${dark("[data-ogsc] ")}
${dark("[data-ogsb] ")}
@media (max-width:480px){
.cb-gut{padding-left:16px!important;padding-right:16px!important}
.cb-outer{padding:0!important}
.cb-h1{font-size:24px!important;line-height:30px!important}
.cb-pad{padding:14px!important}
.cb-wide{display:none!important}
}
</style>`;

/**
 * The frame for an email with pictures: 600 wide on the page colour, down to 320, its `top` (the
 * hero rows, on pine) and `body` (rows) inside one table, then the footer lines. `top` and `body`
 * are <tr> rows; each footer line is HTML.
 */
export function artShell(o: { title: string; preheader: string; top: string; body: string; footer: string[] }): string {
  const small = `font-family:${MAIL.font};font-size:12px;line-height:18px;color:${MAIL.muted}`;
  const footer = o.footer
    .filter(Boolean)
    .map((line) => `<p class="cb-muted" style="margin:0 0 6px;${small}">${line}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escHtml(o.title)}</title>
${STYLE}
</head>
<body class="cb-page" style="margin:0;padding:0;background-color:${MAIL.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MAIL.page};font-size:1px;line-height:1px">${escHtml(o.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" class="cb-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL.page}" style="background-color:${MAIL.page}">
<tr><td align="center" class="cb-outer" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate">
${o.top}
${o.body}
<tr><td class="cb-gut" style="padding:8px 24px 32px">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`.replace(/\n{2,}/g, "\n");
}
