/**
 * The weekly digest email: new open roles in the member's function, what closed, and what they
 * can add. One member's numbers only. It never names a company, since open roles keep the
 * company hidden until the member unlocks it.
 *
 * RN_EMAIL_FOOTER   optional line for the footer, such as the sender's postal address
 */
import type { DigestData } from "./scanTypes";

const PINE = "#073F2F";
const VOLT = "#2EE59D";
const VOLT_SOFT = "#E8FBF2";
const EMBER = "#FF5A1F";
const INK = "#0A1A13";
const BODY = "#28322D";
const MUTED = "#5B6661";
const LINE = "#E2E6E3";
const PAGE = "#FAFAF7";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** How many functions the list shows before the rest fold into one line. */
const MAX_FUNCTIONS = 6;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** One line of text: no control characters, no line breaks. */
const oneLine = (s: unknown) => String(s ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
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
  const footerNote = oneLine(typeof process !== "undefined" ? process.env.RN_EMAIL_FOOTER : "").slice(0, 300);

  /* ---- the words ---- */

  // The headline is a number and what it counts, so the subject and the top of the email match.
  const heroCount = mine > 0 ? mine : newRoles;
  const heroLabel = mine > 0 ? `new ${fn} ${mine === 1 ? "role" : "roles"} this week` : `new fractional ${newRoles === 1 ? "role" : "roles"} this week`;
  const subject = heroCount > 0 ? `${heroCount} ${heroLabel}` : "No new fractional roles this week";

  let lead: string;
  if (mine > 0) {
    if (hidden === 0) lead = "";
    else if (mine === 1) lead = "The company is hidden. Unlock it for 1 credit to see who is hiring.";
    else if (hidden === mine) lead = `All ${mine} companies are hidden. Unlock one for 1 credit to see who is hiring.`;
    else if (hidden === 1) lead = "1 of those companies is hidden. Unlock it for 1 credit to see who is hiring.";
    else lead = `${hidden} of those companies are hidden. Unlock one for 1 credit to see who is hiring.`;
  } else if (newRoles > 0) {
    const none = fn && fn !== "Other" ? (newRoles === 1 ? `It is not in ${fn}. ` : `None are in ${fn}. `) : "";
    lead = `${none}${newRoles === 1 ? "The" : "Each"} company stays hidden until you unlock it for 1 credit.`;
  } else {
    lead = "Roles that are already open are still listed.";
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
  const seatsLine = missing === 0 ? "" : missing === 1 ? "Your seats are missing 1 fact. It earns a credit." : `Your seats are missing ${missing} facts. Each one earns a credit.`;
  const creditsLine = credits === 0 ? "You have 0 credits. Every fact you add earns one." : `You have ${plural(credits, "credit")}.`;
  const cta = "See this week's roles";
  const why = "You get this email once a week because you are a Trading Post member.";

  /* ---- plain text ---- */

  const text = [
    `Hi ${first},`,
    "",
    heroCount > 0 ? `${heroCount} ${heroLabel.replace(" this week", " opened this week")}.${lead ? " " + lead : ""}` : `No new fractional roles opened this week. ${lead}`,
    ...(showList ? ["", "New roles by function", ...shown.map((r) => `  ${r.function}  ${r.n}`), ...(rest ? [`  More functions  ${rest}`] : [])] : []),
    ...(closedLine ? ["", closedLine] : []),
    ...(seatsLine ? ["", seatsLine] : []),
    "",
    creditsLine,
    ...(appUrl ? ["", cta, appUrl] : []),
    "",
    "--",
    why,
    ...(unsubscribeUrl ? ["To stop these emails, open this link", unsubscribeUrl] : []),
    ...(footerNote ? [footerNote] : []),
  ].join("\n");

  /* ---- HTML ---- */

  const p = (body: string, style = "") => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${BODY};${style}">${body}</p>`;

  const hero =
    heroCount > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>
<td valign="middle" style="padding:0 14px 0 0;font-family:${FONT};font-size:48px;line-height:52px;font-weight:800;color:${EMBER}">${heroCount}</td>
<td valign="middle" style="font-family:${FONT};font-size:20px;line-height:26px;font-weight:700;color:${INK}">${esc(heroLabel)}</td>
</tr></table>`
      : `<p style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:800;color:${INK}">No new fractional roles this week</p>`;

  const cell = (body: string, align: "left" | "right", bold: boolean) =>
    `<td align="${align}" style="padding:10px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:15px;line-height:20px;color:${INK};font-weight:${bold ? 700 : 400}">${body}</td>`;
  const list = showList
    ? `<p style="margin:8px 0 6px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:700;color:${MUTED}">New roles by function</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-bottom:1px solid ${LINE}">
${shown.map((r) => `<tr>${cell(esc(r.function), "left", r.function === fn)}${cell(String(r.n), "right", true)}</tr>`).join("\n")}${
        rest ? `\n<tr>${cell("More functions", "left", false)}${cell(String(rest), "right", true)}</tr>` : ""
      }
</table>`
    : "";

  const seats = seatsLine
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>
<td bgcolor="${VOLT_SOFT}" style="padding:12px 14px;border-radius:8px;font-family:${FONT};font-size:16px;line-height:24px;color:${INK}">${esc(seatsLine)}</td>
</tr></table>`
    : "";

  const button = appUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px"><tr>
<td bgcolor="${VOLT}" style="border-radius:8px"><a href="${esc(appUrl)}" style="display:inline-block;padding:14px 22px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;color:${PINE};text-decoration:none;border-radius:8px">${esc(cta)}</a></td>
</tr></table>`
    : "";

  const small = `font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED}`;
  const footer = [
    esc(why),
    unsubscribeUrl ? `<a href="${esc(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a>` : "",
    footerNote ? esc(footerNote) : "",
  ]
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 4px;${small}">${line}</p>`)
    .join("\n");

  const preheader = oneLine([lead, creditsLine].filter(Boolean).join(" "));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};font-size:1px;line-height:1px">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${LINE};border-radius:10px;border-collapse:separate">
<tr><td bgcolor="${PINE}" style="padding:18px 28px;border-radius:9px 9px 0 0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:800;color:#FFFFFF">Trading Post</td></tr>
<tr><td style="padding:28px 28px 24px">
${p(`Hi ${esc(first)},`)}
${hero}
${lead ? p(esc(lead), "margin-bottom:20px;") : ""}
${list}
${closedLine ? p(esc(closedLine)) : ""}
${seats}
${p(esc(creditsLine))}
${button}
</td></tr>
<tr><td style="padding:16px 28px 20px;border-top:1px solid ${LINE}">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`.replace(/\n{2,}/g, "\n");

  return { subject: oneLine(subject), text, html };
}
