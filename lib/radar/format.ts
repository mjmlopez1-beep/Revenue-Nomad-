/**
 * The radar's words: the morning email and the post in Slack (and other webhooks). Pure: every
 * card is already cut to what the member's table shows (lib/radar/present.ts), so nothing here
 * can name a company they can't see, or anyone at all.
 *
 * Both list the day's signals most likely first (the email up to EMAIL_CARDS, Slack up to
 * SLACK_CARDS, then "And N more"), each with its band and why-now line, and leave Low out (it stays
 * on the page). Every link in the email, the cards' and the button's, opens the day's companies in
 * the app, where each locked one unlocks right on its row. Slack lays the cards out one company a
 * block (radarEntry): there a company the card names also links to its record, and one the member's
 * table shows has its logo; a locked one has neither, and its button opens the day's companies.
 */
import { MAIL, escHtml as esc, footerNote, mailButton, mailP, mailShell, oneLine } from "../email";
import { COMPANY_PRICE_SAY } from "../tableFields";
import type { Alert, AlertEntry } from "../notify/format";
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

/** A card that goes by email or Slack: never a Low one. */
const sendable = (c: RadarCard) => c.band !== "Low";
/** "High likelihood · Fractional CMO hired 5 months ago · Sales usually follows in 4–9 months", or null for a card from before Crystal Ball scored. */
export const likelyLine = (c: RadarCard) => (c.band && c.whyNow ? `${c.band} likelihood · ${c.whyNow}` : null);

/** Several radar items in one batch (Pro instant posts inside 15 minutes): one post, each card once. */
export function mergeDays(items: RadarItem[]): RadarDay | null {
  if (!items.length) return null;
  const seen = new Set<string>();
  const cards: RadarCard[] = [];
  for (const it of items) for (const c of it.day.cards) if (!seen.has(c.id) && sendable(c)) (seen.add(c.id), cards.push(c));
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

const capFirst = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/**
 * One card as a Slack entry: the company in bold (linked to its record only when the card names
 * it), what happened under it, its band, why now and timing, and the free facts as fields, the
 * logo on the right only for a company the member's table shows, and one button: Open for a known
 * company, else Open in Merlin to the day's companies (where a locked one unlocks, and where a Trial
 * or Pro name opens free: such a card says so, and links to the day, not its record). A locked
 * card carries no name, no link to its record, no logo. Its note says how it opens (openLine).
 */
export function radarEntry(c: RadarCard, base: string): AlertEntry {
  const abs = (u: string | undefined) => (!u ? "" : /^https?:\/\//i.test(u) ? u : base && u.startsWith("/") ? `${base}${u}` : "");
  const named = !c.locked && !!c.company;
  // Trial and Pro: a company named here but not theirs yet opens free from Crystal Ball (the day's companies), not on its record.
  const record = named && c.opens !== "free" ? abs(c.place) : "";
  const [now, ...next] = (c.whyNow ?? "").split(" · ");
  const a = c.about;
  return {
    title: named ? c.subject || c.company! : c.subject || "A company in your profile",
    ...(record ? { link: record } : {}),
    text: c.signal || c.headline,
    fields: [
      { label: "Likelihood", value: c.band ?? null },
      { label: "Why now", value: c.whyNow ? now : null },
      { label: "Timing", value: next.length ? capFirst(next.join(" · ")) : null },
      ...(a
        ? [
            { label: "Industry", value: a.industry },
            { label: "Size", value: a.size },
            { label: "HQ", value: a.hq },
          ]
        : [{ label: "About", value: c.facts.join(" · ") }]),
    ],
    note: openLine(c) ? `${c.why}. ${openLine(c)}` : c.why,
    ...(named && c.known && c.logo ? { image: { url: c.logo, alt: `${c.company} logo` } } : {}),
    button: named && c.known && record ? { text: "Open", url: record } : { text: "Open in Merlin", url: record || abs(c.url) },
  };
}

export function radarAlert(items: RadarItem[], base: string): Alert | null {
  const d = mergeDays(items);
  if (!d || !d.cards.length) return null;
  const shown = d.cards.slice(0, SLACK_CARDS);
  const lines = shown.map((c) => [`${c.headline}. ${c.why}`, likelyLine(c)].filter(Boolean).join(". "));
  const rest = d.cards.length - shown.length;
  if (rest > 0) lines.push(moreWords(rest));
  return {
    kind: "radar",
    count: d.cards.length,
    headline: slackHeadline(d),
    lines,
    url: d.url,
    button: seeWords(d.companies),
    footer: RADAR_FOOTER,
    entries: shown.map((c) => radarEntry(c, base.replace(/\/+$/, ""))),
    ...(rest > 0 ? { after: [moreWords(rest)] } : {}),
  };
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
/** Trial and Pro: a Crystal Ball company opens free. */
export const OPEN_FREE_LINE = `Open it in Merlin, free from your ${FEATURE_NAME}.`;
/** Free: one Crystal Ball company a day opens in full. */
export const OPEN_ONE_LINE = `Locked for you: open it in Merlin, free from your ${FEATURE_NAME} (one company a day, everything on it).`;
/** What a card says about opening its company: null for one the member knows. */
export const openLine = (c: Pick<RadarCard, "locked" | "opens">): string | null =>
  c.opens === "free" ? OPEN_FREE_LINE : c.opens === "one" ? OPEN_ONE_LINE : c.locked ? lockedLine : null;

export function renderRadarEmail(m: RadarMail): { subject: string; text: string; html: string } {
  // Low never goes by email (it is on the page). The day passed in is cut already; this keeps it so.
  const kept = m.day.cards.filter(sendable);
  const d: RadarDay = kept.length === m.day.cards.length ? m.day : { ...m.day, cards: kept, total: kept.length, companies: new Set(kept.map((c) => c.co)).size };
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
    ...shown.flatMap((c) => [c.headline, `  ${c.facts.join(" · ")}`, ...(likelyLine(c) ? [`  ${likelyLine(c)}`] : []), `  ${c.why}`, ...(openLine(c) ? [`  ${openLine(c)}`] : []), ""]),
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
<br><span style="${small};color:${MAIL.muted}">${esc(c.facts.join(" · "))}</span>${
    c.band && c.whyNow ? `<br><span style="${small};color:${MAIL.ink}"><b style="font-weight:700">${esc(c.band)} likelihood</b> · ${esc(c.whyNow)}</span>` : ""
  }
<br><span style="${small};color:${MAIL.body}">${esc(c.why)}</span>${openLine(c) ? `<br><span style="${small};color:${MAIL.muted}">${esc(openLine(c)!)}</span>` : ""}
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
