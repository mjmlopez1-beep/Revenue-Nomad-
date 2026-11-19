/**
 * The radar's words: the morning email and the post in Slack (and other webhooks). Pure: every
 * card is already cut to what the member's table shows (lib/radar/present.ts), so nothing here
 * can name a company they can't see, or anyone at all.
 *
 * Both list every signal of the day (the email up to EMAIL_CARDS, Slack up to SLACK_CARDS, then
 * "And N more"), and every link, the cards' and the button's, opens the day's companies in the
 * app, where each locked one unlocks right on its row.
 */
import { MAIL, escHtml as esc, footerNote, mailButton, mailP, mailShell, oneLine } from "../email";
import { COMPANY_PRICE_SAY } from "../tableFields";
import type { Alert } from "../notify/format";
import { FEATURE_NAME, YOUR_FEATURE, type RadarCard, type RadarDay, type RadarItem } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const companies = (n: number) => plural(n, "company", "companies");
/** How many cards a Slack post lists before "And N more". */
export const SLACK_CARDS = 5;
/** How many cards the email lists before "And N more". */
export const EMAIL_CARDS = 10;
export const RADAR_FOOTER = `${FEATURE_NAME} from Merlin. Turn it off in Your profile.`;

/** The button: "See the company", "See the 2 companies". */
export const seeWords = (n: number) => (n === 1 ? "See the company" : `See the ${companies(n)}`);
/** "And 3 more." */
const moreWords = (n: number) => `And ${plural(n, "more signal")}.`;

/** The email's subject and heading: "Your Crystal Ball: 2 companies in your profile moved". */
export function radarSubject(d: RadarDay): string {
  return `${YOUR_FEATURE}: ${companies(d.companies)} in your profile moved`;
}
/** Slack's headline: "Your Crystal Ball · 2 companies moved". */
export const slackHeadline = (d: RadarDay) => `${YOUR_FEATURE} · ${companies(d.companies)} moved`;

/* ---------- Slack and webhooks ---------- */

/** Several radar items in one batch (Pro instant posts inside 15 minutes): one post, each card once. */
export function mergeDays(items: RadarItem[]): RadarDay | null {
  if (!items.length) return null;
  const seen = new Set<string>();
  const cards: RadarCard[] = [];
  for (const it of items) for (const c of it.day.cards) if (!seen.has(c.id)) (seen.add(c.id), cards.push(c));
  const last = items[items.length - 1].day;
  return {
    cards,
    total: cards.length,
    companies: new Set(cards.map((c) => c.co)).size,
    day: last.day,
    url: last.url,
    mode: items.every((x) => x.day.mode === "instant") ? "instant" : "daily",
  };
}

export function radarAlert(items: RadarItem[], _base: string): Alert | null {
  const d = mergeDays(items);
  if (!d || !d.cards.length) return null;
  const shown = d.cards.slice(0, SLACK_CARDS);
  const lines = shown.map((c) => `${c.headline}. ${c.why}`);
  if (d.cards.length > shown.length) lines.push(moreWords(d.cards.length - shown.length));
  return { kind: "radar", count: d.cards.length, headline: slackHeadline(d), lines, url: d.url, button: seeWords(d.companies), footer: RADAR_FOOTER };
}

/* ---------- the email ---------- */

export interface RadarMail {
  name: string;
  day: RadarDay;
  /** The radar's own unsubscribe link (signed for the member). */
  unsubscribeUrl: string;
  /** A 1 by 1 image that counts the email as opened, or "". */
  openPixel?: string;
  /** The app, for the banner. */
  appUrl: string;
}

const lockedLine = `Locked for you: unlock it in Merlin for ${COMPANY_PRICE_SAY}.`;

export function renderRadarEmail(m: RadarMail): { subject: string; text: string; html: string } {
  const d = m.day;
  const first = oneLine(m.name).split(" ")[0].slice(0, 40) || "there";
  const subject = oneLine(radarSubject(d));
  const n = d.cards.length;
  const lead = n === 1 ? "One signal at a company in your Ideal Fractional Profile since yesterday." : `${n} signals at ${companies(d.companies)} in your Ideal Fractional Profile since yesterday.`;
  const why = "You get this when a company in your Ideal Fractional Profile moves. Turn it off in Your profile, or with the link below.";
  const note = footerNote();
  const shown = d.cards.slice(0, EMAIL_CARDS);
  const rest = n - shown.length;
  const button = seeWords(d.companies);

  /* ---- plain text ---- */
  const text = [
    `Hi ${first},`,
    "",
    lead,
    "",
    ...shown.flatMap((c) => [c.headline, `  ${c.facts.join(" · ")}`, `  ${c.why}`, ...(c.locked ? [`  ${lockedLine}`] : []), ""]),
    ...(rest > 0 ? [moreWords(rest), ""] : []),
    button,
    d.url,
    "",
    "--",
    why,
    `To stop the ${FEATURE_NAME} emails, open this link`,
    m.unsubscribeUrl,
    ...(note ? [note] : []),
  ].join("\n");

  /* ---- HTML ---- */
  const small = `font-family:${MAIL.font};font-size:14px;line-height:20px`;
  // Each headline links to the day's companies, where a locked one unlocks on its row.
  const card = (c: RadarCard) => `<tr><td style="padding:14px 0;border-top:1px solid ${MAIL.line};font-family:${MAIL.font}">
<a href="${esc(c.url)}" style="font-size:16px;line-height:22px;font-weight:700;color:${MAIL.ink};text-decoration:underline">${esc(c.headline)}</a>
<br><span style="${small};color:${MAIL.muted}">${esc(c.facts.join(" · "))}</span>
<br><span style="${small};color:${MAIL.body}">${esc(c.why)}</span>${c.locked ? `<br><span style="${small};color:${MAIL.muted}">${esc(lockedLine)}</span>` : ""}
</td></tr>`;
  const list = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-bottom:1px solid ${MAIL.line}">
${shown.map(card).join("\n")}
</table>`;
  const body = [
    mailP(`Hi ${esc(first)},`),
    `<p style="margin:0 0 8px;font-family:${MAIL.font};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.02em;color:${MAIL.ink}">${esc(subject)}</p>`,
    mailP(esc(lead), "margin-bottom:24px;"),
    list,
    rest > 0 ? mailP(`<a href="${esc(d.url)}" style="color:${MAIL.ink};font-weight:700;text-decoration:underline">${esc(moreWords(rest))}</a>`, "margin-bottom:24px;") : "",
    mailButton(d.url, button, "margin:0 0 8px"),
    m.openPixel ? `<img src="${esc(m.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const html = mailShell({
    title: subject,
    link: m.appUrl,
    preheader: lead,
    body,
    footer: [esc(why), `<a href="${esc(m.unsubscribeUrl)}" style="color:${MAIL.muted};text-decoration:underline">Unsubscribe from ${esc(FEATURE_NAME)} emails</a>`, note ? esc(note) : ""],
  });
  return { subject, text, html };
}
