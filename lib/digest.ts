/**
 * The weekly email: new open roles in the member's function, what closed, and what they can
 * add. One member's numbers only. It never names a company, since open roles keep the company
 * hidden until the member unlocks it.
 *
 * It leads with the count, then up to 5 of the roles it counts in free facts only (title,
 * function, industry, size, region, the day it was listed), each linked to its record, and the
 * one button, which opens the list it counted (Hiring now in the member's function). The
 * breakdown and the member's own numbers come after, for whoever reads on. The frame is shared
 * with the sign-in email (lib/email.ts).
 *
 * RN_EMAIL_FOOTER   optional line for the footer, such as the sender's postal address
 */
import { webLink } from "./links";
import type { DigestData, DigestHireRow, DigestHires, DigestRole } from "./scanTypes";
import { MAIL, escHtml as esc, footerNote as footerLine, mailButton, mailP, mailShell, oneLine } from "./email";
import { hiresLine, startWords } from "./hired";

/** How many functions the list shows before the rest fold into one line. */
const MAX_FUNCTIONS = 6;
/** How many of the week's roles the email lists. */
export const DIGEST_ROLES = 5;
/** Saved views that follow hires the email covers, and the companies it lists for each. */
export const DIGEST_HIRE_VIEWS = 3;
export const DIGEST_HIRE_ROWS = 5;
/** A company that is locked for the member is never named: it has an open role, so it reads as one. */
export const LOCKED_HIRER = "A locked company";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-17" -> "Nov 17". */
const dayOf = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(oneLine(iso));
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : "";
};

/** A whole number of things, never negative, never NaN. */
const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
/** Only web links go in an href (escaped where used). A scheme-less "merlin.example.com/x" gets https://; javascript: and data: never pass. */
const link = (u: unknown) => (/^https?:\/\/\S+$/i.test(oneLine(u)) ? oneLine(u) : webLink(oneLine(u)) ?? "");
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
  // The button opens the list the headline counts. An older caller without one opens the app.
  const rolesUrl = link(d.rolesUrl) || appUrl;
  const unsubscribeUrl = link(d.unsubscribeUrl);
  const footerNote = footerLine();
  // The roles it counts, in free facts only. A field that isn't text is left out.
  const roles = (Array.isArray(d.roles) ? d.roles : [])
    .slice(0, DIGEST_ROLES)
    .map((r: Partial<DigestRole>) => ({
      title: oneLine(r?.title).slice(0, 90),
      meta: [oneLine(r?.industry).slice(0, 60), oneLine(r?.employees) ? `${oneLine(r?.employees).slice(0, 20)} employees` : "", oneLine(r?.region).slice(0, 60)].filter(Boolean).join(" · "),
      day: dayOf(r?.listed),
      url: link(r?.url),
    }))
    .filter((r) => r.title);
  // Saved views that follow hires, with what newly matches each: free facts only, a locked company unnamed, never who held the seat.
  const hires = (Array.isArray(d.hires) ? d.hires : [])
    .map((h: Partial<DigestHires>) => ({
      name: oneLine(h?.name).slice(0, 120),
      n: count(h?.n),
      functions: (Array.isArray(h?.functions) ? h.functions : []).map((x) => oneLine(x).slice(0, 40)).filter(Boolean),
      inProfile: h?.inProfile === true,
      url: link(h?.url),
      rows: (Array.isArray(h?.rows) ? h.rows : []).slice(0, DIGEST_HIRE_ROWS).map((r: Partial<DigestHireRow>) => ({
        company: oneLine(r?.company).slice(0, 80) || LOCKED_HIRER,
        meta: [oneLine(r?.function).slice(0, 40), startWords(oneLine(r?.start))].filter(Boolean).join(" · "),
        url: link(r?.url),
      })),
    }))
    .filter((h) => h.n > 0)
    .slice(0, DIGEST_HIRE_VIEWS);
  // No new open role this week, only new hires for a saved view: the email leads with the first view's line.
  const hireOnly = newRoles === 0 && hires.length > 0;

  /* ---- the words ---- */

  // The headline is a number and what it counts, so the subject and the top of the email match.
  const heroCount = hireOnly ? hires[0].n : mine > 0 ? mine : newRoles;
  const heroLabel = hireOnly
    ? hiresLine(hires[0].n, hires[0].functions, hires[0].inProfile).replace(/^\d+ /, "")
    : mine > 0
      ? `new ${fn} ${mine === 1 ? "role" : "roles"} this week`
      : `new fractional ${newRoles === 1 ? "role" : "roles"} this week`;
  const subject = heroCount > 0 ? `${heroCount} ${heroLabel}` : "No new fractional roles this week";
  const hireCta = "Open the saved view";

  let lead: string;
  if (mine > 0) {
    if (hidden === 0) lead = mine === 1 ? "You can already see the company." : mine === 2 ? "You can already see both companies." : `You can already see all ${mine} companies.`;
    else if (mine === 1) lead = "The company is locked. Unlock it for 2 credits to see which company is hiring.";
    else if (hidden === mine) lead = `All ${mine} companies are locked. Unlock one for 2 credits to see which company is hiring.`;
    else if (hidden === 1) lead = `1 of the ${mine} companies is locked. Unlock it for 2 credits to see which company is hiring.`;
    else lead = `${hidden} of the ${mine} companies are locked. Unlock one for 2 credits to see which company is hiring.`;
  } else if (newRoles > 0) {
    const none = fn && fn !== "Other" ? (newRoles === 1 ? `It is not in ${fn}. ` : `None are in ${fn}. `) : "";
    lead = `${none}${newRoles === 1 ? "The" : "Each"} company stays locked until you unlock it for 2 credits.`;
  } else if (hireOnly) {
    // Why this email came: the view the member saved, by its own name.
    lead = hires[0].name ? `From your saved view “${hires[0].name}”.` : "";
  } else {
    lead = "The roles that were already open are still listed.";
  }

  const all = (Array.isArray(d.byFunction) ? d.byFunction : [])
    .map((r) => ({ function: oneLine(r?.function).slice(0, 40), n: count(r?.n) }))
    .filter((r) => r.function && r.n > 0)
    .sort((a, b) => b.n - a.n);
  // "Other" is no function: it goes in with the rest, so the list never shows two "Other" lines.
  const rows = all.filter((r) => r.function !== "Other");
  const shown = rows.slice(0, MAX_FUNCTIONS);
  const rest = rows.slice(MAX_FUNCTIONS).reduce((sum, r) => sum + r.n, 0) + all.filter((r) => r.function === "Other").reduce((sum, r) => sum + r.n, 0);
  // A list with one line that repeats the headline adds nothing.
  const showList = newRoles > 0 && shown.length > 0 && !(shown.length === 1 && rest === 0 && shown[0].n === heroCount);

  // Saved searches with new matches this week, most first. Names only, never a company.
  const alerts = (Array.isArray(d.alerts) ? d.alerts : [])
    .map((a) => ({ name: oneLine(a?.name).slice(0, 120), n: count(a?.n) }))
    .filter((a) => a.name && a.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  const alertsTitle = "Your saved views";
  const alertNew = (n: number) => `${n} new`;

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
  const why = "You get this once a week because you're a Merlin member.";
  const listTitle = "New roles by function";
  const restLabel = "Other functions";

  /* ---- plain text ---- */

  const roleMeta = (r: (typeof roles)[number]) => [r.meta, r.day ? `listed ${r.day}` : ""].filter(Boolean).join(" · ");
  const text = [
    `Hi ${first},`,
    "",
    hireOnly
      ? `${heroCount} ${heroLabel}.${lead ? " " + lead : ""}`
      : heroCount > 0
        ? `${heroCount} ${heroLabel.replace(" this week", " opened this week")}.${lead ? " " + lead : ""}`
        : `No new fractional roles opened this week. ${lead}`,
    ...(roles.length ? ["", ...roles.flatMap((r) => [r.title, ...(roleMeta(r) ? [`  ${roleMeta(r)}`] : []), ...(r.url ? [`  ${r.url}`] : [])])] : []),
    ...(rolesUrl && !hireOnly ? ["", cta, rolesUrl] : []),
    // Each saved view that follows hires: its line (the first one is the headline in a week with no new roles), the companies, the view.
    ...hires.flatMap((h, k) => [
      ...(hireOnly && k === 0 ? [] : ["", `${hiresLine(h.n, h.functions, h.inProfile)}.`]),
      ...(h.name && !(hireOnly && k === 0) ? [`  From your saved view “${h.name}”`] : []),
      "",
      ...h.rows.flatMap((r) => [`${r.company}${r.meta ? ` · ${r.meta}` : ""}`, ...(r.url ? [`  ${r.url}`] : [])]),
      ...(h.url ? ["", hireCta, h.url] : []),
    ]),
    ...(showList ? ["", listTitle, ...shown.map((r) => `  ${r.function}  ${r.n}`), ...(rest ? [`  ${restLabel}  ${rest}`] : [])] : []),
    ...(alerts.length ? ["", alertsTitle, ...alerts.map((a) => `  ${a.name}  ${alertNew(a.n)}`)] : []),
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
  // New hires are no live opening: their count is ink, with no dot.
  const hero =
    heroCount > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>
${hireOnly ? "" : `<td valign="middle" style="padding:0 8px 0 0;font-size:0;line-height:0"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${MAIL.ember}"></span></td>\n`}<td valign="middle" style="padding:0 12px 0 0;font-family:${MAIL.font};font-size:48px;line-height:52px;font-weight:800;letter-spacing:-0.03em;${num}color:${hireOnly ? MAIL.ink : MAIL.emberInk}">${heroCount}</td>
<td valign="middle" style="font-family:${MAIL.font};font-size:22px;line-height:26px;font-weight:800;letter-spacing:-0.02em;color:${MAIL.ink}">${esc(heroLabel)}</td>
</tr></table>`
      : `<p style="margin:0 0 12px;font-family:${MAIL.font};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.02em;color:${MAIL.ink}">No new fractional roles this week</p>`;

  const cell = (body: string, align: "left" | "right", bold: boolean) =>
    `<td align="${align}" style="padding:10px 0;border-top:1px solid ${MAIL.line};font-family:${MAIL.font};font-size:15px;line-height:20px;${align === "right" ? `${num}white-space:nowrap;padding-left:12px;` : ""}color:${MAIL.ink};font-weight:${bold ? 700 : 400}">${body}</td>`;
  const list = showList
    ? `<p style="margin:0 0 8px;font-family:${MAIL.font};font-size:13px;line-height:20px;font-weight:700;color:${MAIL.muted}">${listTitle}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-bottom:1px solid ${MAIL.line}">
${shown.map((r) => `<tr>${cell(esc(r.function), "left", r.function === fn)}${cell(String(r.n), "right", true)}</tr>`).join("\n")}${
        rest ? `\n<tr>${cell(restLabel, "left", false)}${cell(String(rest), "right", true)}</tr>` : ""
      }
</table>`
    : "";

  const alertList = alerts.length
    ? `<p style="margin:0 0 8px;font-family:${MAIL.font};font-size:13px;line-height:20px;font-weight:700;color:${MAIL.muted}">${alertsTitle}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-bottom:1px solid ${MAIL.line}">
${alerts.map((a) => `<tr>${cell(esc(a.name), "left", false)}${cell(alertNew(a.n), "right", true)}</tr>`).join("\n")}
</table>`
    : "";

  // Each role: its title as a link to its record, its free facts under it, and the day it was listed.
  const roleList = roles.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-bottom:1px solid ${MAIL.line}">
${roles
  .map(
    (r) => `<tr>
<td valign="top" style="padding:12px 12px 12px 0;border-top:1px solid ${MAIL.line};font-family:${MAIL.font}">${
      r.url
        ? `<a href="${esc(r.url)}" style="font-size:16px;line-height:22px;font-weight:700;color:${MAIL.ink};text-decoration:underline">${esc(r.title)}</a>`
        : `<span style="font-size:16px;line-height:22px;font-weight:700;color:${MAIL.ink}">${esc(r.title)}</span>`
    }${r.meta ? `<br><span style="font-size:14px;line-height:20px;color:${MAIL.muted}">${esc(r.meta)}</span>` : ""}</td>
<td valign="top" align="right" style="padding:13px 0 12px;border-top:1px solid ${MAIL.line};font-family:${MAIL.font};font-size:14px;line-height:20px;${num}white-space:nowrap;color:${MAIL.muted}">${esc(r.day)}</td>
</tr>`,
  )
  .join("\n")}
</table>`
    : "";

  // A saved view that follows hires: its line in bold (the headline already says it in a week with no new roles), the
  // companies that newly match (each a link to its record, never a locked company's name, never who held the seat), and a
  // button to the view: the email's filled button in a week with no new roles, an outlined one under the roles' button
  // otherwise (and for a second view), so the email still has one main button.
  const outlineButton = (href: string, label: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px"><tr>
<td style="border:2px solid ${MAIL.pine};border-radius:8px"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-family:${MAIL.font};font-size:16px;line-height:20px;font-weight:700;color:${MAIL.pine};text-decoration:none;border-radius:8px">${esc(label)}</a></td>
</tr></table>`;
  const hireBlocks = hires
    .map((h, k) => {
      const lead0 = hireOnly && k === 0;
      const head = lead0
        ? ""
        : `<p style="margin:0 0 4px;font-family:${MAIL.font};font-size:17px;line-height:24px;font-weight:800;letter-spacing:-0.01em;color:${MAIL.ink}">${esc(hiresLine(h.n, h.functions, h.inProfile))}</p>${
            h.name ? `\n<p style="margin:0 0 12px;font-family:${MAIL.font};font-size:14px;line-height:20px;color:${MAIL.muted}">From your saved view “${esc(h.name)}”</p>` : ""
          }`;
      const list = h.rows.length
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-bottom:1px solid ${MAIL.line}">
${h.rows
  .map(
    (r) => `<tr><td valign="top" style="padding:12px 0;border-top:1px solid ${MAIL.line};font-family:${MAIL.font}">${
      r.url
        ? `<a href="${esc(r.url)}" style="font-size:16px;line-height:22px;font-weight:700;color:${MAIL.ink};text-decoration:underline">${esc(r.company)}</a>`
        : `<span style="font-size:16px;line-height:22px;font-weight:700;color:${MAIL.ink}">${esc(r.company)}</span>`
    }${r.meta ? `<br><span style="font-size:14px;line-height:20px;${num}color:${MAIL.muted}">${esc(r.meta)}</span>` : ""}</td></tr>`,
  )
  .join("\n")}
</table>`
        : "";
      const way = !h.url ? "" : hireOnly && k === 0 ? mailButton(h.url, hireCta, "margin:0 0 32px") : outlineButton(h.url, hireCta);
      return [head, list, way].filter(Boolean).join("\n");
    })
    .join("\n");

  const seats = seatsLine
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>
<td bgcolor="${MAIL.voltSoft}" style="padding:12px 16px;border-radius:8px;font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.ink}">${esc(seatsLine)}</td>
</tr></table>`
    : "";

  // The headline, then the roles it counts (each one a link), then the one button, which opens that list in the app.
  const body = [
    mailP(`Hi ${esc(first)},`),
    hero,
    lead ? mailP(esc(lead), rolesUrl || roles.length || hires.length ? "margin-bottom:24px;" : "margin-bottom:32px;") : "",
    roleList,
    rolesUrl && !hireOnly ? mailButton(rolesUrl, cta, "margin:0 0 32px") : "",
    hireBlocks,
    list,
    alertList,
    closedLine ? mailP(esc(closedLine)) : "",
    seats,
    mailP(esc(creditsLine), "margin-bottom:0;"),
  ]
    .filter(Boolean)
    .join("\n");

  const html = mailShell({
    title: subject,
    link: appUrl || unsubscribeUrl,
    preheader: oneLine([lead, creditsLine].filter(Boolean).join(" ")),
    body,
    footer: [esc(why), unsubscribeUrl ? `<a href="${esc(unsubscribeUrl)}" style="color:${MAIL.muted};text-decoration:underline">Unsubscribe</a>` : "", footerNote ? esc(footerNote) : ""],
  });

  return { subject: oneLine(subject), text, html };
}
