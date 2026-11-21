/**
 * The radar's words: the morning email and the post in Slack (and other webhooks). Pure: every
 * card is already cut to what the member's table shows (lib/radar/present.ts), so nothing here
 * can name a company they can't see, or anyone at all.
 *
 * Both list the day's signals most likely first (the email up to EMAIL_CARDS, Slack up to
 * SLACK_CARDS, then "And N more"), each with its band and why-now line, and leave Low out (it stays
 * on the page). The email sets them as cards under a Fractions hero, new events first, then the
 * ones still a good time (its layout is described above renderRadarEmail). Each card's button opens
 * its own company's record from that day's Crystal Ball (RadarCard.open), with the plan's free open
 * ready there; the button under the cards opens the day's companies. Every link signs the member
 * in once (lib/emailIn.ts, added by the run). Slack lays the cards out one company a
 * block (radarEntry): there a company the card names also links to its record, and one the member's
 * table shows has its logo; a locked one has neither, and its button opens the day's companies.
 */
import { MAIL, escHtml as esc, footerNote, mailButton, oneLine } from "../email";
import { HERO_ART, LOCKUP_ART, artOrigin, artShell, iconArt, mailImg, type IconArt } from "../emailArt";
import { COMPANY_PRICE_SAY } from "../tableFields";
import type { Alert, AlertEntry } from "../notify/format";
import { FEATURE_NAME, RADAR_STILL, YOUR_FEATURE, type RadarBand, type RadarCard, type RadarDay, type RadarEvery, type RadarItem, type RadarKind } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const companies = (n: number) => plural(n, "company", "companies");
/** How many cards a Slack post lists before "And N more". */
export const SLACK_CARDS = 5;
/** How many cards the email lists before "And N more". */
export const EMAIL_CARDS = 10;
export const RADAR_FOOTER = `${FEATURE_NAME} from Merlin. Choose what posts here in Notifications.`;

/** The button: "See the company", "See the 2 companies". */
export const seeWords = (n: number) => (n === 1 ? "See the company" : `See the ${companies(n)}`);
/**
 * The email's button for the whole list: "See all 3 companies", "See both companies", or with one
 * company (its card already opens it) "Open Crystal Ball".
 */
export const seeAllWords = (n: number) => (n <= 1 ? `Open ${FEATURE_NAME}` : n === 2 ? "See both companies" : `See all ${n} companies`);
/** "And 3 more." */
const moreWords = (n: number) => `And ${plural(n, "more signal")}.`;

/**
 * The day's companies that moved (an event there), and the ones that are only still a good time
 * (standing states, their why-now starting RADAR_STILL): the subject never says a company moved
 * when nothing happened there.
 */
function movedOf(d: RadarDay): { moved: number; still: number } {
  const cos = new Map<string, boolean>();
  for (const c of d.cards) cos.set(c.co, (cos.get(c.co) ?? false) || !(c.whyNow ?? "").startsWith(RADAR_STILL));
  const moved = [...cos.values()].filter(Boolean).length;
  // Cards kept without a company id (older batches) count as moved, as before.
  return cos.size ? { moved, still: cos.size - moved } : { moved: d.companies, still: 0 };
}
/**
 * The email's subject: "Your Crystal Ball: 3 companies leaning your way" (any company that moved,
 * counted with the ones still a good time), or on a day with nothing new "Your Crystal Ball: 2
 * companies still worth a look". Never says a company moved when nothing happened there.
 */
export function radarSubject(d: RadarDay): string {
  const { moved, still } = movedOf(d);
  if (!moved && still) return `${YOUR_FEATURE}: ${companies(still)} still worth a look`;
  return `${YOUR_FEATURE}: ${companies(moved + still)} leaning your way`;
}
/** Slack's headline: "Your Crystal Ball · 2 companies moved", "… · 1 company moved, 1 still a good time". */
export const slackHeadline = (d: RadarDay) => {
  const { moved, still } = movedOf(d);
  if (!moved && still) return `${YOUR_FEATURE} · ${companies(still)}, still a good time`;
  return `${YOUR_FEATURE} · ${companies(moved)} moved${still ? `, ${still} still a good time` : ""}`;
};

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
/** "Posted 3…" -> "posted 3…"; an acronym ("CRO …") stays. */
const lowerFirst = (v: string) => (/^[A-Z](?![A-Z])/.test(v) ? v.charAt(0).toLowerCase() + v.slice(1) : v);

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
/*
 * The morning email, laid out to be read in two seconds a company:
 *
 *   the hero     on pine: the lockup and the date, "3 companies are leaning your way today", the
 *                count by kind ("2 new · 1 still a good time"), then the Fractions strip (the
 *                Crystal Ball morning, or the same place at night on a day with nothing new)
 *   the cards    new events first, then "Still a good time", quieter. Each: the signal's icon and
 *                plain label, its likelihood chip, the company ("A SaaS company in Texas" while it is
 *                locked), what happened, the reason in smaller type, the free facts, one button
 *   the button   See the companies, then why they get it and the unsubscribe link
 *
 * Tables and inline styles; pictures are PNGs on the site's own public path (lib/emailArt.ts).
 * The plain text says the same in the same order.
 */

export interface RadarMail {
  name: string;
  day: RadarDay;
  /** The radar's own unsubscribe link (signed for the member). */
  unsubscribeUrl: string;
  /** Notifications in the app, signed in (lib/emailIn.ts): where the member picks how often it comes. */
  settingsUrl?: string;
  /** How often the member gets it (Notifications): a twice-a-week or weekly email counts what is new since the last one. */
  every?: RadarEvery;
  /** A 1 by 1 image that counts the email as opened, or "". */
  openPixel?: string;
  /** The app: the site the pictures load from (else RN_PUBLIC_URL). */
  appUrl: string;
  /**
   * Follow-ups due in Your pipeline (lib/pipelineActions.ts followUpsOf), most overdue first, in the
   * words the run made: a company named only when the member's table shows it, never a person from
   * their Google account. The email lists at most EMAIL_FOLLOW_UPS, above the companies.
   */
  followUps?: EmailFollowUp[];
  /** Your pipeline in the app, signed in: the button of an email with follow-ups and no companies. */
  pipelineUrl?: string;
}

/** One follow-up as the email lists it: "Follow up with the CEO at Larkfield Robotics", "Sent 3 days ago by email.", and its link. */
export interface EmailFollowUp {
  title: string;
  line: string;
  /** The company's record (or Your pipeline while the company is locked), tracked and signed in. */
  url: string;
}
/** How many follow-ups the email lists. */
export const EMAIL_FOLLOW_UPS = 3;
export const FOLLOW_UPS_TITLE = "Follow-ups due";
const followUps = (n: number) => plural(n, "follow-up");

const lockedLine = `Locked for you: unlock it in Merlin for ${COMPANY_PRICE_SAY}.`;
/** Trial and Pro: a Crystal Ball company opens free. */
export const OPEN_FREE_LINE = `Open it in Merlin, free from your ${FEATURE_NAME}.`;
/** Free: one Crystal Ball company a day opens in full. */
export const OPEN_ONE_LINE = `Locked for you: open it in Merlin, free from your ${FEATURE_NAME} (one company a day, everything on it).`;
/** What a card says about opening its company: null for one the member knows. */
export const openLine = (c: Pick<RadarCard, "locked" | "opens">): string | null =>
  c.opens === "free" ? OPEN_FREE_LINE : c.opens === "one" ? OPEN_ONE_LINE : c.locked ? lockedLine : null;

/** Free's button on the one company of the day the email offers free: the first card that opens that way. */
export const OPEN_TODAYS = "Open free (today's)";
/**
 * The card's button: "Open free" on Trial and Pro (every Crystal Ball company opens free, `opens`
 * "free"); on Free, "Open free (today's)" on the first card only (`first`: one company a day opens
 * free), "Open in Merlin" on the rest and on every other card.
 */
export const openButton = (c: Pick<RadarCard, "opens">, first = true) => (c.opens === "free" ? "Open free" : c.opens === "one" && first ? OPEN_TODAYS : "Open in Merlin");
/**
 * How a company opens, in the email's words: said once above the cards when every card that needs
 * it says the same (the usual case: one plan), else beside each card's button. Null for a company
 * the member knows.
 */
export const openNote = (c: Pick<RadarCard, "locked" | "opens">): string | null =>
  c.opens === "free"
    ? `Each company here opens free from your ${FEATURE_NAME}.`
    : c.opens === "one"
      ? `One ${FEATURE_NAME} company a day opens free, with everything on it.`
      : c.locked
        ? `A locked company unlocks in Merlin for ${COMPANY_PRICE_SAY}.`
        : null;

/** A signal's plain label and its icon (app/ui/fractions/icons.ts). */
const KIND: Record<RadarKind, { label: string; icon: IconArt }> = {
  adjacent: { label: "Hired a fractional", icon: "hired" },
  role: { label: "Open role", icon: "role" },
  seat: { label: "Fractional seat ended", icon: "ended" },
  rehire: { label: "Hired fractionals before", icon: "rehire" },
  tenure: { label: "Seat at 12 months", icon: "tenure" },
  arrival: { label: "New leader", icon: "arrival" },
  departure: { label: "Leader left", icon: "departure" },
  gap: { label: "No leader on their team page", icon: "gap" },
  funding: { label: "Raised money", icon: "funding" },
  "sales-build": { label: "Team hiring", icon: "team" },
  "team-build": { label: "Team hiring", icon: "team" },
  headcount: { label: "Growing", icon: "growing" },
};
/** "Team hiring", "Seat at 15 months": the card's label. */
export function kindLabel(c: Pick<RadarCard, "kind" | "signal" | "headline">): string {
  if (c.kind === "tenure") {
    const n = /(\d+) months in/.exec(c.signal ?? c.headline)?.[1];
    if (n) return `Seat at ${n} months`;
  }
  return KIND[c.kind]?.label ?? "Signal";
}
export const kindIcon = (k: RadarKind): IconArt => KIND[k]?.icon ?? "new";

/** A standing state: still true, nothing new happened there (its why-now starts RADAR_STILL). */
const isStill = (c: RadarCard) => (c.whyNow ?? "").startsWith(RADAR_STILL);

/** "Texas" from "Texas, US"; "the US", "the UK" alone; "Canada". */
const placeIn = (hq: string | undefined) => {
  if (!hq) return null;
  const [first, ...rest] = hq.split(",").map((x) => x.trim());
  if (rest.length) return first;
  return /^(US|UK|UAE|Netherlands|Philippines)$/.test(first) ? `the ${first}` : first;
};
/** Who the card is about: the name when the card shows it, else "A SaaS company in Texas" from the free facts. */
export function companyLine(c: RadarCard): string {
  if (!c.locked && c.company) return c.company;
  const a = c.about;
  if (!a) return c.subject && c.subject !== "A company that's hiring now" ? c.subject : "A company in your profile";
  const where = placeIn(a.hq);
  const what = a.industry ? `${an(a.industry)} ${a.industry} company` : "A company";
  return `${capFirst(what)}${where ? ` in ${where}` : ""}`;
}
const an = (w: string) => (/^[aeiou]/i.test(w) && !/^(one|uni|use|eu)/i.test(w) ? "an" : "a");
/** The facts the company line didn't already say: "51–200 people · $5M–$20M revenue". */
function factLine(c: RadarCard): string {
  const a = c.about;
  if (!a) return c.facts.join(" · ");
  const named = !c.locked && !!c.company;
  return [a.size, named ? a.industry : null, named ? a.hq : null, a.revenue ? `${a.revenue} revenue` : null].filter(Boolean).join(" · ");
}
const stop = (v: string) => (/[.?!)]$/.test(v) ? v : `${v}.`);
/**
 * What happened, and why it matters now, as two lines: the headline fact (the signal, without the
 * company) and the reason (the why-now's timing or rule, else why it is theirs). Today's single long
 * sentence, split.
 */
export function cardLines(c: RadarCard): { fact: string; reason: string } {
  const fact = c.signal || c.headline;
  const parts = (c.whyNow ?? "").replace(RADAR_STILL, "").trim().split(" · ").filter(Boolean);
  const reason = parts.length > 1 ? capFirst(parts.slice(1).join(" · ")) : c.why;
  return { fact, reason: stop(reason) };
}

/** "Saturday, November 21" for a UTC day ("2026-11-21"). */
export function dayWords(day: string): string {
  const t = Date.parse(`${day}T12:00:00Z`);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** The hero's headline: "3 companies are leaning your way today", or on a day with nothing new "2 companies are still worth a look". */
export function heroWords(d: RadarDay, every: RadarEvery = "daily"): string {
  const { moved, still } = movedOf(d);
  const n = moved + still;
  const when = every === "daily" ? " today" : every === "weekly" ? " this week" : "";
  return moved ? `${companies(n)} ${n === 1 ? "is" : "are"} leaning your way${when}` : `${companies(still)} ${still === 1 ? "is" : "are"} still worth a look`;
}
/** Since when the email counts what is new: "since yesterday", "since your last email" (twice a week), "this week". */
const sinceWords = (every: RadarEvery) => (every === "daily" ? "since yesterday" : every === "weekly" ? "this week" : "since your last email");
/** "2 new · 1 still a good time", "3 new since yesterday", or "Nothing new since yesterday" (the headline counts what is still a good time). */
export function countWords(d: RadarDay, every: RadarEvery = "daily"): string {
  const { moved, still } = movedOf(d);
  if (!moved) return `Nothing new ${sinceWords(every)}`;
  return still ? `${moved} new · ${still} still a good time` : `${moved} new ${sinceWords(every)}`;
}

const CHIP: Record<RadarBand, { bg: string; ink: string; cls: string }> = {
  High: { bg: MAIL.volt, ink: MAIL.pine, cls: "" },
  Medium: { bg: "#F5ECD9", ink: MAIL.pine, cls: "cb-chip-med" },
  Low: { bg: MAIL.line, ink: MAIL.body, cls: "cb-chip-med" },
};

export function renderRadarEmail(m: RadarMail): { subject: string; text: string; html: string } {
  // Low never goes by email (it is on the page). The day passed in is cut already; this keeps it so.
  const kept = m.day.cards.filter(sendable);
  const d: RadarDay = kept.length === m.day.cards.length ? m.day : { ...m.day, cards: kept, total: kept.length, companies: new Set(kept.map((c) => c.co)).size };
  const first = oneLine(m.name).split(" ")[0].slice(0, 40) || "there";
  const n = d.cards.length;
  // Follow-ups due, above the companies. A day with follow-ups and no companies still sends (the run
  // decides): the email is then about them alone, and its button opens Your pipeline.
  const ups = (m.followUps ?? []).slice(0, EMAIL_FOLLOW_UPS);
  const upsOnly = !n && ups.length > 0;
  const upsAll = m.followUps?.length ?? 0;
  const subject = oneLine(upsOnly ? `${YOUR_FEATURE}: ${followUps(upsAll)} due` : radarSubject(d));
  // New events first, then the standing states, each most likely first as the run ranked them.
  const ordered = [...d.cards.filter((c) => !isStill(c)), ...d.cards.filter(isStill)];
  const shown = ordered.slice(0, EMAIL_CARDS);
  const fresh = shown.filter((c) => !isStill(c));
  const still = shown.filter(isStill);
  const rest = n - shown.length;
  const every = m.every ?? "daily";
  const button = upsOnly ? "Open your pipeline" : seeAllWords(d.companies);
  const buttonUrl = upsOnly ? (m.pipelineUrl ?? d.url) : d.url;
  const hero = upsOnly ? `You have ${followUps(upsAll)} due` : heroWords(d, every);
  const count = upsOnly ? `${countWords(d, every)} at your companies` : countWords(d, every);
  const date = dayWords(d.day);
  const freshTitle = `New ${sinceWords(every)}`;
  // Free: only the first card that opens as today's free one says so.
  const todays = shown.find((c) => c.opens === "one");
  const label = (c: RadarCard) => openButton(c, c === todays);
  const href = (c: RadarCard) => c.open ?? c.url;
  const settingsUrl = m.settingsUrl ?? "";
  const why = `You get this when a company in your Ideal Fractional Profile moves.${settingsUrl ? " Choose how often in Notifications, or turn it off with the link below." : " Turn it off with the link below."}`;
  const note = footerNote();
  const stillIntro = "Nothing new happened at these, and the timing still fits.";
  const lead = shown[0] ? `${companyLine(shown[0])}: ${lowerFirst(cardLines(shown[0]).fact)}` : ups[0] ? ups[0].title : "";
  const preheader = `${count}.${lead ? ` First up: ${lead}` : ""}`;

  // How the companies open: once, when every card that needs it says the same.
  const notes = [...new Set(shown.map(openNote).filter((x): x is string => !!x))];
  const oneNote = notes.length === 1 ? notes[0] : null;

  /* ---- plain text: the same order as the HTML ---- */
  const textCard = (c: RadarCard) => {
    const { fact, reason } = cardLines(c);
    return [
      `${kindLabel(c)}${c.band ? ` · ${c.band} likelihood` : ""}`,
      companyLine(c),
      fact,
      reason,
      ...(factLine(c) ? [factLine(c)] : []),
      ...(!oneNote && openNote(c) ? [openNote(c)!] : []),
      `${label(c)}: ${href(c)}`,
      "",
    ];
  };
  const text = [
    `Hi ${first},`,
    "",
    hero,
    [date, count].filter(Boolean).join(" · "),
    ...(oneNote ? [oneNote] : []),
    "",
    ...(ups.length ? [FOLLOW_UPS_TITLE.toUpperCase(), "", ...ups.flatMap((f) => [oneLine(f.title), oneLine(f.line), `Open it: ${f.url}`, ""]), ...(upsAll > ups.length ? [`And ${followUps(upsAll - ups.length)} more in Your pipeline.`, ""] : [])] : []),
    ...(fresh.length ? [freshTitle.toUpperCase(), "", ...fresh.flatMap(textCard)] : []),
    ...(still.length ? ["STILL A GOOD TIME", stillIntro, "", ...still.flatMap(textCard)] : []),
    ...(rest > 0 ? [moreWords(rest), ""] : []),
    button,
    buttonUrl,
    "",
    "--",
    why,
    ...(settingsUrl ? ["Notifications", settingsUrl] : []),
    `To stop the ${FEATURE_NAME} emails, open this link`,
    m.unsubscribeUrl,
    ...(note ? [note] : []),
  ].join("\n");

  /* ---- HTML ---- */
  const origin = artOrigin(m.appUrl);
  const F = MAIL.font;
  // Pine as a colour and as a one-colour background image: Gmail's apps recolour the first in dark mode, not the second.
  const pineBg = `background-color:${MAIL.pine};background-image:linear-gradient(${MAIL.pine},${MAIL.pine})`;
  const heroArt = HERO_ART[fresh.length ? "morning" : "quiet"];
  const lockup = mailImg(origin, LOCKUP_ART, { altSize: 17 });
  const top = `<tr><td bgcolor="${MAIL.pine}" class="cb-gut" style="padding:20px 24px 0;${pineBg};border-radius:14px 14px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="font-family:${F};font-size:17px;line-height:24px;font-weight:800;color:#FFFFFF">${lockup || "Merlin"}</td>
<td valign="middle" align="right" style="font-family:${F};font-size:13px;line-height:18px;color:#C9D9D1">${esc(date)}</td>
</tr></table>
</td></tr>
<tr><td bgcolor="${MAIL.pine}" class="cb-gut" style="padding:24px 24px 0;${pineBg}">
<p style="margin:0 0 6px;font-family:${F};font-size:15px;line-height:20px;color:#C9D9D1">Hi ${esc(first)},</p>
<h1 class="cb-h1" style="margin:0 0 10px;font-family:${F};font-size:28px;line-height:34px;font-weight:800;letter-spacing:-0.02em;color:#FFFFFF">${esc(hero)}</h1>
<p style="margin:0;font-family:${F};font-size:15px;line-height:22px;font-weight:700;color:${MAIL.volt}">${count.split(" · ").map((x) => `<span style="white-space:nowrap">${esc(x)}</span>`).join(" · ")}</p>
</td></tr>
<tr><td bgcolor="${MAIL.pine}" style="padding:${origin ? "8px 0 0" : "24px 0 0"};${pineBg};line-height:0;font-size:0;border-radius:0 0 14px 14px;overflow:hidden">${mailImg(origin, heroArt, { fluid: true, altColor: "#C9D9D1", style: "border-radius:0 0 14px 14px" })}</td></tr>`;

  const chip = (b: RadarBand) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr><td${CHIP[b].cls ? ` class="${CHIP[b].cls}"` : ""} bgcolor="${CHIP[b].bg}" style="padding:3px 9px;border-radius:999px;background-color:${CHIP[b].bg};font-family:${F};font-size:12px;line-height:16px;font-weight:700;color:${CHIP[b].ink};white-space:nowrap">${esc(b)}<span class="cb-wide"> likelihood</span></td></tr></table>`;
  const card = (c: RadarCard, quiet: boolean) => {
    const { fact, reason } = cardLines(c);
    const icon = iconArt(kindIcon(c.kind), quiet ? 36 : 44);
    const img = mailImg(origin, icon);
    const facts = factLine(c);
    const how = oneNote ? null : openNote(c);
    const bg = quiet ? MAIL.page : "#FFFFFF";
    return `<tr><td style="padding:0 0 12px">
<table role="presentation" class="${quiet ? "cb-quiet" : "cb-card"}" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${MAIL.line};border-radius:12px;border-collapse:separate">
<tr><td class="cb-pad" style="padding:18px 18px 18px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" width="${icon.width}" style="width:${icon.width}px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${icon.width}" height="${icon.height}" bgcolor="${icon.bg}" style="width:${icon.width}px;height:${icon.height}px;background-color:${icon.bg};line-height:0;font-size:0">${img}</td></tr></table></td>
<td valign="top" style="padding-left:14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" class="cb-label" style="font-family:${F};font-size:13px;line-height:18px;font-weight:700;color:${quiet ? MAIL.muted : "#0B6B45"}">${esc(kindLabel(c))}</td>
<td valign="middle" align="right" style="padding-left:8px">${c.band ? chip(c.band) : ""}</td>
</tr></table>
<p class="cb-ink" style="margin:6px 0 2px;font-family:${F};font-size:${quiet ? 16 : 18}px;line-height:${quiet ? 22 : 24}px;font-weight:800;letter-spacing:-0.01em;color:${MAIL.ink}">${esc(companyLine(c))}</p>
<p class="cb-body" style="margin:0 0 4px;font-family:${F};font-size:15px;line-height:22px;color:${MAIL.body}">${esc(fact)}</p>
<p class="cb-muted" style="margin:0 0 ${facts ? 6 : 14}px;font-family:${F};font-size:14px;line-height:20px;color:${MAIL.muted}">${esc(reason)}</p>
${facts ? `<p class="cb-muted" style="margin:0 0 14px;font-family:${F};font-size:12px;line-height:18px;color:${MAIL.muted}">${facts.split(" · ").map((x) => `<span style="white-space:nowrap">${esc(x)}</span>`).join(" · ")}</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="cb-btn" bgcolor="${quiet ? MAIL.voltSoft : MAIL.pine}" style="border-radius:8px;background-color:${quiet ? MAIL.voltSoft : MAIL.pine}"><a href="${esc(href(c))}" style="display:inline-block;padding:9px 16px;font-family:${F};font-size:14px;line-height:18px;font-weight:700;color:${quiet ? MAIL.pine : "#FFFFFF"};text-decoration:none;border-radius:8px">${esc(label(c))}</a></td>
${how ? `<td class="cb-muted" style="padding-left:12px;font-family:${F};font-size:12px;line-height:16px;color:${MAIL.muted}">${esc(how)}</td>` : ""}
</tr></table>
</td>
</tr></table>
</td></tr>
</table>
</td></tr>`;
  };
  const group = (icon: IconArt, title: string, sub: string | null) => {
    const a = iconArt(icon, 24);
    return `<tr><td style="padding:0 0 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" width="24" bgcolor="${a.bg}" style="width:24px;height:24px;background-color:${a.bg};line-height:0;font-size:0">${mailImg(origin, a)}</td>
<td valign="middle" class="cb-ink" style="padding-left:10px;font-family:${F};font-size:15px;line-height:20px;font-weight:800;color:${MAIL.ink}">${esc(title)}</td>
</tr></table>${sub ? `\n<p class="cb-muted" style="margin:6px 0 0;font-family:${F};font-size:14px;line-height:20px;color:${MAIL.muted}">${esc(sub)}</p>` : ""}
</td></tr>`;
  };
  // A follow-up: what to do, when it went out, and a link to the company's record.
  const upRow = (f: EmailFollowUp) => `<tr><td style="padding:0 0 10px">
<table role="presentation" class="cb-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid ${MAIL.line};border-radius:12px;border-collapse:separate">
<tr><td class="cb-pad" style="padding:14px 16px">
<p class="cb-ink" style="margin:0 0 2px;font-family:${F};font-size:16px;line-height:22px;font-weight:800;color:${MAIL.ink}"><a href="${esc(f.url)}" style="color:${MAIL.ink};text-decoration:none">${esc(oneLine(f.title))}</a></p>
<p class="cb-muted" style="margin:0;font-family:${F};font-size:14px;line-height:20px;color:${MAIL.muted}">${esc(oneLine(f.line))} <a href="${esc(f.url)}" style="color:${MAIL.pine};font-weight:700;text-decoration:underline">Open it</a></p>
</td></tr>
</table>
</td></tr>`;
  const upRows = ups.length
    ? [
        group("new", FOLLOW_UPS_TITLE, null),
        ...ups.map(upRow),
        ...(upsAll > ups.length ? [`<tr><td style="padding:0 0 10px;font-family:${F};font-size:14px;line-height:20px;color:${MAIL.muted}">And ${esc(followUps(upsAll - ups.length))} more in Your pipeline.</td></tr>`] : []),
        ...(n ? [`<tr><td style="padding:6px 0 0"></td></tr>`] : []),
      ]
    : [];
  const cards = [
    ...upRows,
    ...(fresh.length ? [group("new", freshTitle, null), ...fresh.map((c) => card(c, false))] : []),
    ...(still.length ? [`<tr><td style="padding:${fresh.length ? 16 : 0}px 0 0"></td></tr>`, group("still", "Still a good time", stillIntro), ...still.map((c) => card(c, true))] : []),
  ].join("\n");
  const body = `<tr><td class="cb-gut" style="padding:${oneNote ? 18 : 28}px 24px 8px">
${oneNote ? `<p class="cb-muted" style="margin:0 0 22px;font-family:${F};font-size:13px;line-height:18px;color:${MAIL.muted}">${esc(oneNote)}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${cards}
</table>
${rest > 0 ? `<p style="margin:4px 0 20px;font-family:${F};font-size:15px;line-height:22px"><a class="cb-ink" href="${esc(d.url)}" style="color:${MAIL.ink};font-weight:700;text-decoration:underline">${esc(moreWords(rest))}</a></p>` : ""}
${mailButton(buttonUrl, button, "margin:12px 0 28px")}
<div class="cb-line" style="border-top:1px solid ${MAIL.line};height:1px;line-height:1px;font-size:1px">&nbsp;</div>
${m.openPixel ? `<img src="${esc(m.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : ""}
</td></tr>`;
  const html = artShell({
    title: subject,
    preheader,
    top,
    body,
    footer: [
      esc(why),
      [
        settingsUrl ? `<a href="${esc(settingsUrl)}" style="color:${MAIL.muted};text-decoration:underline">Notifications</a>` : "",
        `<a href="${esc(m.unsubscribeUrl)}" style="color:${MAIL.muted};text-decoration:underline">Unsubscribe from ${esc(FEATURE_NAME)} emails</a>`,
      ]
        .filter(Boolean)
        .join(" · "),
      note ? esc(note) : "",
    ],
  });
  return { subject, text, html };
}
