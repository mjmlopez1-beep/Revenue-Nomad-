/**
 * Every Merlin email's look: the pictures an email can carry, the frame, and its parts. Crystal
 * Ball's morning email (lib/radar/format.ts) set the standard; every other email (sign-in,
 * messages, invites, proposals, the plan, the weekly email) is built from the same parts here, so
 * they read as one family. Email clients don't draw SVG and treat modern CSS unevenly, so:
 *
 *   - every picture is a PNG made from the Fractions kit (app/ui/fractions/icons.ts, mail.ts) by
 *     scripts/make-email-art.mts into public/email/, served by the app, and linked by an absolute
 *     address on the site the email links to (RN_PUBLIC_URL). No photographs;
 *   - every picture has its width and height, alt text, and a solid colour painted in and behind
 *     it, so a dark mode that recolours the page never turns the art to mud;
 *   - layout is tables and inline styles; the <style> block only adds dark mode (Apple Mail,
 *     Outlook) and a phone's tighter gutters, and the email reads the same without it.
 *
 * The frame (mailShell): on the page colour, 600 wide, a pine header (the white lockup, then the
 * email's Fractions strip, HEADER_ART), the white sheet with the words and one pine button, then
 * the footer in small muted type on the page, as Crystal Ball's. Type: a 22/28 headline, 15/24
 * words, 14/20 small print, 12/18 footer. Buttons: pine with white words (volt in dark mode, where
 * pine would sink into the dark sheet); volt only where a credit is earned.
 *
 * Weights (palette PNGs): each hero about 9 KB, each header strip about 5 KB, each icon under 1 KB
 * at 2x, the lockup about 3 KB. `ART_VERSION` goes on every address, so a redrawn picture is
 * fetched fresh by mail apps that cache by address (Gmail's image proxy does).
 */
import { MAIL, escHtml, mailOrigin } from "./mailTokens";

export const ART_VERSION = "2";
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

/** The lockup, white on pine, for the top of every email. */
export const LOCKUP_ART: MailArt = { path: `${DIR}/merlin@2x.png`, width: 96, height: 28, alt: "Merlin", bg: MAIL.pine };

/**
 * The header strip of every email but Crystal Ball's (app/ui/fractions/mail.ts HEADERS): one a
 * kind of email, 600 by 120. Decoration under the lockup, so its alt text is empty.
 */
export type HeaderArt = "door" | "letter" | "proposal" | "signed" | "plan" | "week";
export const HEADER_ART_KINDS: HeaderArt[] = ["door", "letter", "proposal", "signed", "plan", "week"];
export const headerArt = (kind: HeaderArt): MailArt => ({ path: `/email/header/${kind}@2x.png`, width: 600, height: 120, alt: "", bg: MAIL.pine });

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
 * phones) and Outlook.com's own (data-ogsc, data-ogsb). The pine header and the pictures keep their
 * colours: they are pictures on solid fields. Crystal Ball's markup is classed `cb-*` piece by
 * piece; the sheet of every other email (`cb-sheet`) turns dark as a whole, its words light, its
 * links mint, its button volt with pine words.
 */
const DARK = {
  page: "#0D1813",
  card: "#15241E",
  quiet: "#111E19",
  callout: "#1D3029",
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
${p}.cb-btn a{color:#073F2F!important}
${p}.cb-cta{background-color:#2EE59D!important}
${p}.cb-cta a{color:#073F2F!important}
${p}.cb-sheet{background-color:${DARK.card}!important;border-color:${DARK.line}!important}
${p}.cb-sheet td,${p}.cb-sheet p,${p}.cb-sheet span,${p}.cb-sheet div{color:${DARK.body}!important;border-color:${DARK.line}!important}
${p}.cb-sheet table{border-color:${DARK.line}!important}
${p}.cb-sheet a{color:${DARK.label}!important}
${p}.cb-sheet .cb-ink,${p}.cb-sheet .cb-ink a{color:${DARK.ink}!important}
${p}.cb-sheet .cb-muted,${p}.cb-sheet .cb-muted a{color:${DARK.muted}!important}
${p}.cb-sheet .cb-callout{background-color:${DARK.callout}!important;color:${DARK.ink}!important}
${p}.cb-sheet .cb-ember{color:#FF9A70!important}
${p}.cb-sheet .cb-cta{background-color:#2EE59D!important;border-color:#2EE59D!important}
${p}.cb-sheet .cb-cta a{color:#073F2F!important}
${p}.cb-sheet .cb-outline{border-color:${DARK.label}!important}
${p}.cb-sheet .cb-outline a{color:${DARK.label}!important}`;

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
.cb-sheet-pad{padding:24px 16px!important}
.cb-sheet{border-radius:0!important;border-left:0!important;border-right:0!important}
.cb-wide{display:none!important}
}
</style>`;

/**
 * The frame for an email with pictures: 600 wide on the page colour, down to 320, its `top` (the
 * hero rows, on pine) and `body` (rows) inside one table, then the footer lines. `top` and `body`
 * are <tr> rows; each footer line is HTML.
 */
export function artShell(o: { title: string; preheader: string; top: string; body: string; footer: string[]; footerTop?: number }): string {
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
<tr><td class="cb-gut" style="padding:${o.footerTop ?? 8}px 24px 32px">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`.replace(/\n{2,}/g, "\n");
}

/* ---------- the parts every email is made of ---------- */

const F = MAIL.font;
/** Pine as a colour and as a one-colour background image: Gmail's apps recolour the first in dark mode, not the second. */
export const PINE_BG = `background-color:${MAIL.pine};background-image:linear-gradient(${MAIL.pine},${MAIL.pine})`;

/**
 * The pine header: the white lockup (or "Merlin" in text with no site to load it from), an
 * optional line on the right (Crystal Ball's date), then the email's Fractions strip.
 */
export function mailHeader(origin: string, art: HeaderArt, right = ""): string {
  const lockup = mailImg(origin, LOCKUP_ART, { altSize: 17 });
  const strip = mailImg(origin, headerArt(art), { fluid: true, style: "border-radius:0 0 14px 14px" });
  return `<tr><td bgcolor="${MAIL.pine}" class="cb-gut" style="padding:20px 24px 0;${PINE_BG};border-radius:14px 14px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="font-family:${F};font-size:17px;line-height:24px;font-weight:800;color:#FFFFFF">${lockup || "Merlin"}</td>
${right ? `<td valign="middle" align="right" style="font-family:${F};font-size:13px;line-height:18px;color:${MAIL.onPine}">${right}</td>` : ""}
</tr></table>
</td></tr>
<tr><td bgcolor="${MAIL.pine}" style="padding:${strip ? "12px 0 0" : "20px 0 0"};${PINE_BG};line-height:0;font-size:0;border-radius:0 0 14px 14px;overflow:hidden">${strip}</td></tr>`;
}

/**
 * The frame every email but Crystal Ball's uses: the pine header with its strip (`art`), the
 * white sheet with `body` (HTML), then the footer lines on the page. `preheader` is the line mail
 * apps show next to the subject. `link`: a link in the email, whose site serves the pictures
 * (RN_PUBLIC_URL when it has none).
 */
export function mailShell(o: { title: string; preheader: string; body: string; footer: string[]; link?: string; art?: HeaderArt }): string {
  const origin = artOrigin(o.link);
  const sheet = `<tr><td style="padding:16px 0 0">
<table role="presentation" class="cb-sheet" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid ${MAIL.line};border-radius:12px;border-collapse:separate">
<tr><td class="cb-sheet-pad" style="padding:28px 28px 32px">
${o.body}
</td></tr>
</table>
</td></tr>`;
  return artShell({ title: o.title, preheader: o.preheader, top: mailHeader(origin, o.art ?? "door"), body: sheet, footer: o.footer, footerTop: 20 });
}

/** A paragraph of body copy, 15/24. `body` is HTML: escape anything that came from data. */
export const mailP = (body: string, style = "") => `<p class="cb-body" style="margin:0 0 16px;font-family:${F};font-size:15px;line-height:24px;color:${MAIL.body};${style}">${body}</p>`;
/** The headline: 22/28, heavy and tight, the way the app sets its titles. */
export const mailH = (body: string, style = "") =>
  `<h1 class="cb-ink" style="margin:0 0 8px;font-family:${F};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.02em;color:${MAIL.ink};${style}">${body}</h1>`;
/** Small print in the sheet, 14/20 muted: how a link works, how long it lasts. */
export const mailSmall = (body: string, style = "") => `<p class="cb-muted" style="margin:0 0 4px;font-family:${F};font-size:14px;line-height:20px;color:${MAIL.muted};${style}">${body}</p>`;
/** A link shown as data (the address under a button), in the mono face. */
export const mailLinkLine = (url: string, style = "margin:0 0 16px") =>
  `<p style="${style};font-family:${MAIL.mono};font-size:13px;line-height:20px;word-break:break-all"><a href="${escHtml(url)}" style="color:${MAIL.pine};text-decoration:underline">${escHtml(url)}</a></p>`;

export type ButtonTone = "pine" | "volt" | "outline";
/**
 * The email's one button. Pine with white words; `volt` only where the click earns a credit;
 * `outline` for a second, quieter one. In dark mode the filled ones turn volt with pine words.
 */
export function mailButton(href: string, label: string, style = "margin:8px 0 0", tone: ButtonTone = "pine"): string {
  if (tone === "outline")
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${style}"><tr>
<td class="cb-outline" style="border:2px solid ${MAIL.pine};border-radius:8px"><a href="${escHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:${F};font-size:16px;line-height:20px;font-weight:700;color:${MAIL.pine};text-decoration:none;border-radius:8px">${escHtml(label)}</a></td>
</tr></table>`;
  const bg = tone === "volt" ? MAIL.volt : MAIL.pine;
  const ink = tone === "volt" ? MAIL.pine : "#FFFFFF";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${style}"><tr>
<td bgcolor="${bg}" class="cb-cta" style="border-radius:8px;background-color:${bg}"><a href="${escHtml(href)}" style="display:inline-block;padding:14px 24px;font-family:${F};font-size:16px;line-height:20px;font-weight:700;color:${ink};text-decoration:none;border-radius:8px">${escHtml(label)}</a></td>
</tr></table>`;
}

/** A note on a tint, no edge: mint for good news and earning, sand for everything else, `page` for words someone else wrote. */
export function mailCallout(body: string, tone: "mint" | "sand" | "page" = "mint", style = "margin:0 0 16px"): string {
  const bg = tone === "mint" ? MAIL.voltSoft : tone === "sand" ? MAIL.sand : MAIL.page;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${style}"><tr>
<td class="cb-callout" bgcolor="${bg}" style="padding:12px 16px;border-radius:8px;background-color:${bg};font-family:${F};font-size:15px;line-height:24px;color:${MAIL.ink}">${body}</td>
</tr></table>`;
}
/** What someone wrote (a message): their words on the page colour, with the volt rule at the left. */
export function mailQuote(body: string, style = "margin:0 0 24px"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${style}"><tr>
<td class="cb-callout" bgcolor="${MAIL.page}" style="padding:12px 16px;border-left:3px solid ${MAIL.volt};background-color:${MAIL.page};font-family:${F};font-size:15px;line-height:24px;color:${MAIL.ink}">${body}</td>
</tr></table>`;
}
/** A code to type (6 digits): large, spaced, figures lined up. */
export const mailCode = (code: string, style = "margin:0 0 24px") =>
  `<p class="cb-ink" style="${style};font-family:${F};font-size:32px;line-height:40px;font-weight:800;letter-spacing:0.16em;font-variant-numeric:tabular-nums;color:${MAIL.ink}">${escHtml(code)}</p>`;
/** A short list, each line after a pine bullet. Lines are plain text. */
export function mailList(lines: string[], style = "margin:0 0 20px"): string {
  if (!lines.length) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${style}">${lines
    .map((l) => `<tr><td valign="top" class="cb-ink" style="padding:2px 10px 2px 0;font-family:${F};font-size:15px;line-height:24px;font-weight:700;color:${MAIL.pine}">&#8226;</td><td class="cb-body" style="padding:2px 0;font-family:${F};font-size:15px;line-height:24px;color:${MAIL.body}">${escHtml(l)}</td></tr>`)
    .join("")}</table>`;
}
/** A link in the footer (Notifications, Unsubscribe): muted and underlined. */
export const mailFootLink = (href: string, label: string) => `<a href="${escHtml(href)}" style="color:${MAIL.muted};text-decoration:underline">${escHtml(label)}</a>`;
