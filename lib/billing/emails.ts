/**
 * Billing's emails: the trial ending (3 days before, and the last day), the value receipt when the
 * trial ends (with the annual plan first), and the value receipt at each renewal. Counts only:
 * never another member's name, never a company the member hasn't unlocked.
 *
 * A member who said "Not now" to "Are you looking for a new client?" gets the soft form: staying
 * on Free is a fine answer, a pause is there, and nothing pushes.
 */
import { MAIL, escHtml, footerNote, mailButton, mailH, mailP, mailShell, oneLine } from "../email";
import { PRICES, TOPUP_CREDITS } from "./rules";

/** What a member got in a period, as counts. */
export interface ValueCounts {
  conversations: number;
  invites: number;
  unlocks: number;
  /** New open roles in their function while they were on Pro. */
  roles: number;
  function: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The receipt's lines, only the ones with something in them. */
export function valueLines(v: ValueCounts): string[] {
  const out: string[] = [];
  if (v.roles) out.push(`${plural(v.roles, `new open ${v.function ? `${v.function} ` : ""}role`)} as they opened`);
  if (v.unlocks) out.push(`${plural(v.unlocks, "unlock")} used`);
  if (v.conversations) out.push(`${plural(v.conversations, "conversation")} opened`);
  if (v.invites) out.push(`${plural(v.invites, "intro")} sent`);
  return out;
}

const listHtml = (lines: string[]) =>
  lines.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">${lines
        .map(
          (l) =>
            `<tr><td style="padding:4px 10px 4px 0;font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.pine};font-weight:700">&#8226;</td><td style="padding:4px 0;font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.body}">${escHtml(l)}</td></tr>`,
        )
        .join("")}</table>`
    : "";

const WHY = "You get this because you're a Merlin member with a plan. Merlin is a data exchange for fractional operators, from Revenue Nomad.";

function shell(subject: string, lead: string, bodyParts: string[], link: string) {
  const note = footerNote();
  return mailShell({ title: subject, preheader: lead.slice(0, 120), body: bodyParts.join("\n"), link, footer: [escHtml(WHY), note ? escHtml(note) : ""] });
}

/** The annual line first, then monthly. `rateLine`: "Less than an hour of your time a month." when their rate says so. */
const priceWords = (rateLine: string | null) =>
  `Pro is $${PRICES.year} a year, which is 2 months free, or $${PRICES.month} a month.${rateLine ? ` ${rateLine}` : ""}`;

/** The trial ends in `days` days (3, or 1 on the last day). */
export function trialEndingEmail(o: { first: string; days: number; notLooking: boolean; rateLine: string | null; link: string }) {
  const first = oneLine(o.first).slice(0, 40) || "there";
  const when = o.days <= 1 ? "tomorrow" : `in ${o.days} days`;
  const subject = o.days <= 1 ? "Your Pro trial ends tomorrow" : `Your Pro trial ends in ${o.days} days`;
  const link = oneLine(o.link);
  const lead = o.notLooking
    ? `Nothing to do: when it ends you stay on Free, with your saved view and the weekly email. No card, no charge.`
    : `After that you're on Free, unless you keep Pro: who's hiring before it's posted, the hiring exec and the warm path, as soon as roles open.`;
  const offer = o.notLooking ? `If your book fills up again later, Pro is a click away.` : priceWords(o.rateLine);
  const text = [`Hi ${first},`, "", `Your Merlin Pro trial ends ${when}.`, "", lead, "", offer, "", link, "", "--", WHY].join("\n");
  const html = shell(subject, lead, [mailP(`Hi ${escHtml(first)},`), mailH(escHtml(subject)), mailP(escHtml(lead)), mailP(escHtml(offer), "margin-bottom:24px;"), mailButton(link, o.notLooking ? "Open Merlin" : "Keep Pro", "margin:0 0 8px")], link);
  return { subject, text, html };
}

/** The trial ended: what it gave them, then the annual plan first (or, not looking, nothing to push). */
export function trialEndedEmail(o: { first: string; counts: ValueCounts; notLooking: boolean; rateLine: string | null; link: string }) {
  const first = oneLine(o.first).slice(0, 40) || "there";
  const lines = valueLines(o.counts);
  const subject = "Your Pro trial is over";
  const link = oneLine(o.link);
  const lead = "You're on Free now. Your credits, your saved view and the weekly email stay. Nothing was charged.";
  const got = lines.length ? "In your trial:" : null;
  const offer = o.notLooking
    ? "Not looking for a client right now? Free is the right plan. Pro is here when you are."
    : `${priceWords(o.rateLine)} Credits run out? ${TOPUP_CREDITS} more are $${PRICES.topup}, once.`;
  const text = [`Hi ${first},`, "", lead, "", ...(got ? [got, ...lines.map((l) => `- ${l}`), ""] : []), offer, "", link, "", "--", WHY].join("\n");
  const html = shell(
    subject,
    lead,
    [mailP(`Hi ${escHtml(first)},`), mailH(subject), mailP(escHtml(lead)), ...(got ? [mailP(escHtml(got), "margin-bottom:8px;font-weight:700;"), listHtml(lines)] : []), mailP(escHtml(offer), "margin-bottom:24px;"), mailButton(link, o.notLooking ? "Open Merlin" : "See the yearly plan", "margin:0 0 8px")],
    link,
  );
  return { subject, text, html };
}

/** A renewal: what the last period gave them. */
export function renewalEmail(o: { first: string; counts: ValueCounts; interval: "month" | "year"; link: string }) {
  const first = oneLine(o.first).slice(0, 40) || "there";
  const lines = valueLines(o.counts);
  const subject = o.interval === "year" ? "Your year on Merlin Pro" : "Your month on Merlin Pro";
  const link = oneLine(o.link);
  const lead = `Pro renewed. Here's what the last ${o.interval} gave you.`;
  const none = "A quiet stretch. Pro keeps watching your markets, and a pause is there in Plan and billing if your book is full.";
  const text = [`Hi ${first},`, "", lead, "", ...(lines.length ? lines.map((l) => `- ${l}`) : [none]), "", link, "", "--", WHY].join("\n");
  const html = shell(subject, lead, [mailP(`Hi ${escHtml(first)},`), mailH(subject), mailP(escHtml(lead)), lines.length ? listHtml(lines) : mailP(escHtml(none)), mailButton(link, "Open Merlin", "margin:0 0 8px")], link);
  return { subject, text, html };
}
