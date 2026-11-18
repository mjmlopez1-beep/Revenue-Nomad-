/**
 * The radar's words: the morning email and the post in Slack (and other webhooks). Pure: every
 * card is already cut to the member's plan (lib/radar/present.ts) and carries its own link, so
 * nothing here can name what the plan doesn't show.
 *
 * Free: the one card, greyed (no company, no person), "N more today", and one button, "See who",
 * to the upgrade link. Pro: every card, each linked to its record, and a button to the Radar page.
 */
import { MAIL, escHtml as esc, footerNote, mailButton, mailP, mailShell, oneLine } from "../email";
import type { Alert } from "../notify/format";
import type { RadarCard, RadarDay, RadarItem } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** How many cards a Pro post lists before "And N more". */
export const SLACK_CARDS = 5;
export const SEE_WHO = "See who";
export const RADAR_FOOTER = "Merlin radar. Turn it off in Your profile.";

/** "1 more today", or "". */
export const moreWords = (n: number) => (n > 0 ? `${n} more today` : "");

/** The subject (and Slack's headline). */
export function radarSubject(d: RadarDay): string {
  const first = d.cards[0]?.headline ?? "";
  if (!d.pro) return d.more ? `${first} (+${d.more} more today)` : first;
  if (d.cards.length === 1) return first;
  return d.mode === "instant" ? `${d.cards.length} new on your radar` : `${d.cards.length} new signals on your radar today`;
}

/* ---------- Slack and webhooks ---------- */

/** Several radar items in one batch (Pro instant posts inside 15 minutes): one post, each card once. */
export function mergeDays(items: RadarItem[]): RadarDay | null {
  if (!items.length) return null;
  const seen = new Set<string>();
  const cards: RadarCard[] = [];
  let more = 0;
  for (const it of items) {
    for (const c of it.day.cards) if (!seen.has(c.id)) (seen.add(c.id), cards.push(c));
    more += it.day.more;
  }
  const last = items[items.length - 1].day;
  const pro = items.some((x) => x.day.pro);
  return { pro, cards: pro ? cards : cards.slice(0, 1), more: pro ? 0 : more + Math.max(0, cards.length - 1), total: cards.length + (pro ? 0 : more), seeWho: last.seeWho, mode: items.every((x) => x.day.mode === "instant") ? "instant" : "daily" };
}

export function radarAlert(items: RadarItem[], _base: string): Alert | null {
  const d = mergeDays(items);
  if (!d || !d.cards.length) return null;
  const line = (c: RadarCard) => [c.facts.join(" · "), c.why].filter(Boolean).join(". ");
  if (!d.pro) {
    const c = d.cards[0];
    return { kind: "radar", count: d.total, headline: c.headline, lines: [line(c), moreWords(d.more)].filter(Boolean), url: d.seeWho, button: SEE_WHO, footer: RADAR_FOOTER };
  }
  if (d.cards.length === 1) {
    const c = d.cards[0];
    return { kind: "radar", count: 1, headline: c.headline, lines: [line(c)], url: c.url, button: c.locked ? "Unlock in Merlin" : "Open the record", footer: RADAR_FOOTER };
  }
  const shown = d.cards.slice(0, SLACK_CARDS);
  const lines = shown.map((c) => `${c.headline}. ${c.facts.join(" · ")}`);
  if (d.cards.length > shown.length) lines.push(`And ${plural(d.cards.length - shown.length, "more")}.`);
  return { kind: "radar", count: d.cards.length, headline: radarSubject(d), lines, url: d.seeWho, button: "See your radar", footer: RADAR_FOOTER };
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

export function renderRadarEmail(m: RadarMail): { subject: string; text: string; html: string } {
  const d = m.day;
  const first = oneLine(m.name).split(" ")[0].slice(0, 40) || "there";
  const subject = oneLine(radarSubject(d));
  const n = d.pro ? d.cards.length : d.total;
  const lead =
    n === 1
      ? "One signal at a company in your Ideal Fractional Profile since yesterday."
      : `${n} signals at companies in your Ideal Fractional Profile since yesterday.${d.pro ? "" : " Here is one."}`;
  const why = "You get this when a company in your Ideal Fractional Profile moves. Turn it off in Your profile, or with the link below.";
  const note = footerNote();

  /* ---- plain text ---- */
  const text = [
    `Hi ${first},`,
    "",
    lead,
    "",
    ...d.cards.flatMap((c) => [c.headline, `  ${c.facts.join(" · ")}`, `  ${c.why}`, ...(d.pro ? [`  ${c.url}`] : []), ""]),
    ...(d.more ? [moreWords(d.more), ""] : []),
    d.pro ? "See your radar" : SEE_WHO,
    d.seeWho,
    "",
    "--",
    why,
    "To stop the radar emails, open this link",
    m.unsubscribeUrl,
    ...(note ? [note] : []),
  ].join("\n");

  /* ---- HTML ---- */
  const small = `font-family:${MAIL.font};font-size:14px;line-height:20px`;
  // Free: one card on grey, in muted ink, with no link of its own. Pro: each headline links to its record.
  const card = (c: RadarCard) =>
    d.pro
      ? `<tr><td style="padding:14px 0;border-top:1px solid ${MAIL.line};font-family:${MAIL.font}">
<a href="${esc(c.url)}" style="font-size:16px;line-height:22px;font-weight:700;color:${MAIL.ink};text-decoration:underline">${esc(c.headline)}</a>
<br><span style="${small};color:${MAIL.muted}">${esc(c.facts.join(" · "))}</span>
<br><span style="${small};color:${MAIL.body}">${esc(c.why)}</span>${
          c.locked ? `<br><span style="${small};color:${MAIL.muted}">Locked for you: open the record to unlock it.</span>` : ""
        }
</td></tr>`
      : `<tr><td bgcolor="#F1F3F2" style="padding:16px;border-radius:8px;background:#F1F3F2;font-family:${MAIL.font}">
<span style="font-size:16px;line-height:22px;font-weight:700;color:${MAIL.muted}">${esc(c.headline)}</span>
<br><span style="${small};color:${MAIL.muted}">${esc(c.facts.join(" · "))}</span>
<br><span style="${small};color:${MAIL.muted}">${esc(c.why)}</span>
</td></tr>`;
  const list = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${d.pro ? "24px;border-bottom:1px solid " + MAIL.line : "16px"}">
${d.cards.map(card).join("\n")}
</table>`;
  const body = [
    mailP(`Hi ${esc(first)},`),
    `<p style="margin:0 0 8px;font-family:${MAIL.font};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.02em;color:${MAIL.ink}">Your next-client radar</p>`,
    mailP(esc(lead), "margin-bottom:24px;"),
    list,
    d.more ? mailP(`<b>${esc(moreWords(d.more))}</b>`, "margin-bottom:24px;") : "",
    mailButton(d.seeWho, d.pro ? "See your radar" : SEE_WHO, "margin:0 0 8px"),
    m.openPixel ? `<img src="${esc(m.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const html = mailShell({
    title: subject,
    link: m.appUrl,
    preheader: lead,
    body,
    footer: [esc(why), `<a href="${esc(m.unsubscribeUrl)}" style="color:${MAIL.muted};text-decoration:underline">Unsubscribe from the radar</a>`, note ? esc(note) : ""],
  });
  return { subject, text, html };
}
