/**
 * The weekly email: new open roles in the member's function, what closed, and what they can
 * add. One member's numbers only. It never names a company, since open roles keep the company
 * hidden until the member unlocks it.
 *
 * It leads with the count and the one button. The breakdown and the member's own numbers come
 * after, for whoever reads on. The frame is shared with the sign-in email (lib/email.ts).
 *
 * RN_EMAIL_FOOTER   optional line for the footer, such as the sender's postal address
 */
import type { DigestData } from "./scanTypes";
import { MAIL, escHtml as esc, footerNote as footerLine, mailButton, mailP, mailShell, oneLine } from "./email";

/** How many functions the list shows before the rest fold into one line. */
const MAX_FUNCTIONS = 6;

/** A whole number of things, never negative, never NaN. */
const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
/** Only web links go in an href. */
const link = (u: unknown) => (/^https?:\/\/\S+$/i.test(oneLine(u)) ? oneLine(u) : "");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function renderDigest(d: DigestData): { subject: string; text: string; html: string } {
  const first = oneLine(d.name).split(" ")[0].slice(0, 40) || "there";
  const fn = oneLine(d.function).slice(0, 40);
  const newRoles = count(d.newRoles);
  // "Other" is a bucket, not a function anyone searches by, so it gets the general wording.
  const mine = fn && fn !== "Other" ? count(d.newRolesMine) : 0;
  const hidden = Math.min(count(d.newRolesMineHidden), mine);
  const closed = count(d.closedRoles);
  const missing = count(d.seatFactsMissing);
  const credits = count(d.credits);
  const appUrl = link(d.appUrl);
  const unsubscribeUrl = link(d.unsubscribeUrl);
  const footerNote = footerLine();

  /* ---- the words ---- */

  // The headline is a number and what it counts, so the subject and the top of the email match.
  const heroCount = mine > 0 ? mine : newRoles;
  const heroLabel = mine > 0 ? `new ${fn} ${mine === 1 ? "role" : "roles"} this week` : `new fractional ${newRoles === 1 ? "role" : "roles"} this week`;
  const subject = heroCount > 0 ? `${heroCount} ${heroLabel}` : "No new fractional roles this week";

  let lead: string;
  if (mine > 0) {
    if (hidden === 0) lead = mine === 1 ? "You can already see the company." : mine === 2 ? "You can already see both companies." : `You can already see all ${mine} companies.`;
    else if (mine === 1) lead = "The company is hidden. Unlock it for 1 credit to see who is hiring.";
    else if (hidden === mine) lead = `All ${mine} companies are hidden. Unlock one for 1 credit to see who is hiring.`;
    else if (hidden === 1) lead = `1 of the ${mine} companies is hidden. Unlock it for 1 credit to see who is hiring.`;
    else lead = `${hidden} of the ${mine} companies are hidden. Unlock one for 1 credit to see who is hiring.`;
  } else if (newRoles > 0) {
    const none = fn && fn !== "Other" ? (newRoles === 1 ? `It is not in ${fn}. ` : `None are in ${fn}. `) : "";
    lead = `${none}${newRoles === 1 ? "The" : "Each"} company stays hidden until you unlock it for 1 credit.`;
  } else {
    lead = "The roles that were already open are still listed.";
  }

  const rows = (Array.isArray(d.byFunction) ? d.byFunction : [])
    .map((r) => ({ function: oneLine(r?.function).slice(0, 40), n: count(r?.n) }))
    .filter((r) => r.function && r.n > 0)
    .sort((a, b) => b.n - a.n);
  const shown = rows.slice(0, MAX_FUNCTIONS);
  const rest = rows.slice(MAX_FUNCTIONS).reduce((sum, r) => sum + r.n, 0);
  // A list with one line that repeats the headline adds nothing.
  const showList = newRoles > 0 && shown.length > 0 && !(shown.length === 1 && rest === 0 && shown[0].n === heroCount);

  const closedLine =
    closed === 0 ? "" : closed === 1 ? "1 role closed this week. Its company is visible again." : `${closed} roles closed this week. Their companies are visible again.`;
  const seatsLine =
    missing === 0
      ? ""
      : missing === 1
        ? "1 thing is still missing on your seats. Add it and you earn a credit."
        : `${missing} things are still missing on your seats. Add one and you earn a credit.`;
  // Low on credits: say how to earn, unless the seats line just did.
  const creditsLine =
    credits === 0
      ? `You have 0 credits.${seatsLine ? "" : " Add a fact you know and you earn one."}`
      : credits <= 3
        ? `You have ${plural(credits, "credit")} left.${seatsLine ? "" : " Add a fact you know and you earn another."}`
        : `You have ${credits} credits to spend.`;
  const cta = "See this week's roles";
  const why = "You get this once a week because you're a Trading Post member.";
  const listTitle = "New roles by function";
  const restLabel = "Other functions";

  /* ---- plain text ---- */

  const text = [
    `Hi ${first},`,
    "",
    heroCount > 0 ? `${heroCount} ${heroLabel.replace(" this week", " opened this week")}.${lead ? " " + lead : ""}` : `No new fractional roles opened this week. ${lead}`,
    ...(appUrl ? ["", cta, appUrl] : []),
    ...(showList ? ["", listTitle, ...shown.map((r) => `  ${r.function}  ${r.n}`), ...(rest ? [`  ${restLabel}  ${rest}`] : [])] : []),
    ...(closedLine ? ["", closedLine] : []),
    ...(seatsLine ? ["", seatsLine] : []),
    "",
    creditsLine,
    "",
    "--",
    why,
    ...(unsubscribeUrl ? ["To stop these emails, open this link", unsubscribeUrl] : []),
    ...(footerNote ? [footerNote] : []),
  ].join("\n");

  /* ---- HTML ---- */

  const num = "font-variant-numeric:tabular-nums;";
  // The one ember element: a 10px dot before the count of roles live this week. The count itself is ember-ink, the ember for text on white.
  const hero =
    heroCount > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>
<td valign="middle" style="padding:0 8px 0 0;font-size:0;line-height:0"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${MAIL.ember}"></span></td>
<td valign="middle" style="padding:0 12px 0 0;font-family:${MAIL.font};font-size:48px;line-height:52px;font-weight:800;letter-spacing:-0.03em;${num}color:${MAIL.emberInk}">${heroCount}</td>
<td valign="middle" style="font-family:${MAIL.font};font-size:22px;line-height:26px;font-weight:800;letter-spacing:-0.02em;color:${MAIL.ink}">${esc(heroLabel)}</td>
</tr></table>`
      : `<p style="margin:0 0 12px;font-family:${MAIL.font};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.02em;color:${MAIL.ink}">No new fractional roles this week</p>`;

  const cell = (body: string, align: "left" | "right", bold: boolean) =>
    `<td align="${align}" style="padding:10px 0;border-top:1px solid ${MAIL.line};font-family:${MAIL.font};font-size:15px;line-height:20px;${align === "right" ? num : ""}color:${MAIL.ink};font-weight:${bold ? 700 : 400}">${body}</td>`;
  const list = showList
    ? `<p style="margin:0 0 8px;font-family:${MAIL.font};font-size:13px;line-height:20px;font-weight:700;color:${MAIL.muted}">${listTitle}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-bottom:1px solid ${MAIL.line}">
${shown.map((r) => `<tr>${cell(esc(r.function), "left", r.function === fn)}${cell(String(r.n), "right", true)}</tr>`).join("\n")}${
        rest ? `\n<tr>${cell(restLabel, "left", false)}${cell(String(rest), "right", true)}</tr>` : ""
      }
</table>`
    : "";

  const seats = seatsLine
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>
<td bgcolor="${MAIL.voltSoft}" style="padding:12px 16px;border-radius:8px;font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.ink}">${esc(seatsLine)}</td>
</tr></table>`
    : "";

  // The button comes right under the headline, so the next move shows without scrolling.
  const body = [
    mailP(`Hi ${esc(first)},`),
    hero,
    lead ? mailP(esc(lead), appUrl ? "margin-bottom:24px;" : "margin-bottom:32px;") : "",
    appUrl ? mailButton(appUrl, cta, "margin:0 0 32px") : "",
    list,
    closedLine ? mailP(esc(closedLine)) : "",
    seats,
    mailP(esc(creditsLine), "margin-bottom:0;"),
  ]
    .filter(Boolean)
    .join("\n");

  const html = mailShell({
    title: subject,
    preheader: oneLine([lead, creditsLine].filter(Boolean).join(" ")),
    body,
    footer: [esc(why), unsubscribeUrl ? `<a href="${esc(unsubscribeUrl)}" style="color:${MAIL.muted};text-decoration:underline">Unsubscribe</a>` : "", footerNote ? esc(footerNote) : ""],
  });

  return { subject: oneLine(subject), text, html };
}
