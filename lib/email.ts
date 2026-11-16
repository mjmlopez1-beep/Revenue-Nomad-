/**
 * Email: the sender, the look every Trading Post email shares, and the sign-in email.
 * Uses Resend's HTTP API when RESEND_API_KEY is set. Without it, emailEnabled() is false and
 * the app falls back to instant join with a personal sign-in link (fine for a pilot, not for
 * a public launch).
 *
 * RESEND_API_KEY   API key from resend.com
 * RN_EMAIL_FROM    e.g. "Trading Post <post@revenuenomad.com>" (domain verified in Resend)
 * RN_PUBLIC_URL    e.g. "https://post.revenuenomad.com" (used to build links)
 * RN_EMAIL_FOOTER  optional line for the footer, such as the sender's postal address
 */
export const emailEnabled = () => !!process.env.RESEND_API_KEY && !!process.env.RN_EMAIL_FROM;

/**
 * `unsubscribeUrl` (the weekly email): sent as List-Unsubscribe with one-click
 * List-Unsubscribe-Post, so a mail app can show its own unsubscribe button. The same address
 * takes that one-click POST and the link in the email (GET): app/api/table/unsubscribe.
 */
export async function sendEmail(to: string, subject: string, text: string, html: string, opts: { unsubscribeUrl?: string } = {}): Promise<boolean> {
  if (!emailEnabled()) return false;
  const unsub = /^https?:\/\/[^\s<>]+$/.test(opts.unsubscribeUrl ?? "") ? opts.unsubscribeUrl : undefined;
  const headers = unsub ? { headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {};
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RN_EMAIL_FROM, to: [to], subject, text, html, ...headers }),
    });
    if (!r.ok) console.error("email send failed", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error("email send failed", e);
    return false;
  }
}

/* ---------- the look every email shares ---------- */

/**
 * Mail clients don't load web fonts, so email is set in the reader's system face, with the
 * product's colors, spacing and weights. Tables and inline styles only: that is what survives
 * every client. Pine header, one volt button, and ember only on a number that is live.
 */
export const MAIL = {
  pine: "#073F2F",
  volt: "#2EE59D",
  voltSoft: "#E8FBF2",
  ember: "#FF5A1F",
  ink: "#0A1A13",
  body: "#28322D",
  muted: "#5B6661",
  line: "#E2E6E3",
  page: "#FAFAF7",
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  /** Links shown as data. */
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const;

export const escHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** One line of text: no control characters, no line breaks. */
export const oneLine = (s: unknown) => String(s ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
/** The optional footer line (a postal address, usually). */
export const footerNote = () => oneLine(typeof process !== "undefined" ? process.env.RN_EMAIL_FOOTER : "").slice(0, 300);

/** A paragraph of body copy. `body` is HTML: escape anything that came from data. */
export const mailP = (body: string, style = "") =>
  `<p style="margin:0 0 16px;font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.body};${style}">${body}</p>`;
/** A headline: heavy and tight, the way the app sets its titles. */
export const mailH = (body: string, style = "") =>
  `<p style="margin:0 0 8px;font-family:${MAIL.font};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.02em;color:${MAIL.ink};${style}">${body}</p>`;
/** The one button an email gets: volt with pine text. */
export const mailButton = (href: string, label: string, style = "margin:8px 0 0") =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${style}"><tr>
<td bgcolor="${MAIL.volt}" style="border-radius:8px"><a href="${escHtml(href)}" style="display:inline-block;padding:14px 24px;font-family:${MAIL.font};font-size:16px;line-height:20px;font-weight:700;color:${MAIL.pine};text-decoration:none;border-radius:8px">${escHtml(label)}</a></td>
</tr></table>`;

/**
 * The frame: a white card on the page color with the pine header. `body` and each footer
 * line are HTML. `preheader` is the line mail apps show next to the subject.
 */
export function mailShell(o: { title: string; preheader: string; body: string; footer: string[] }): string {
  const small = `font-family:${MAIL.font};font-size:12px;line-height:18px;color:${MAIL.muted}`;
  const footer = o.footer
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 4px;${small}">${line}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escHtml(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:${MAIL.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MAIL.page};font-size:1px;line-height:1px">${escHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL.page}" style="background:${MAIL.page}">
<tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${MAIL.line};border-radius:10px;border-collapse:separate">
<tr><td bgcolor="${MAIL.pine}" style="padding:16px 24px;border-radius:9px 9px 0 0;font-family:${MAIL.font};font-size:17px;line-height:24px;font-weight:800;letter-spacing:-0.01em;color:#FFFFFF">Trading Post</td></tr>
<tr><td style="padding:32px 24px 32px">
${o.body}
</td></tr>
<tr><td style="padding:16px 24px 16px;border-top:1px solid ${MAIL.line}">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`.replace(/\n{2,}/g, "\n");
}

/* ---------- the sign-in email ---------- */

/** Sent when a member asks for their link, and to a new member as the check that the email is theirs. */
export function signInEmail(name: string, link: string) {
  const first = oneLine(name).split(" ")[0].slice(0, 40) || "there";
  const url = oneLine(link);
  const lead = "It opens Trading Post and keeps you signed in on this device.";
  const keep = "Keep this link to yourself. It works like a password.";
  const why = "You got this because someone asked for a sign-in link with this email address. If it wasn't you, ignore this email.";
  const from = "Trading Post is a free pilot from Revenue Nomad.";
  const note = footerNote();

  const text = [
    `Hi ${first},`,
    "",
    `Here's your sign-in link for Trading Post. ${lead}`,
    "",
    url,
    "",
    keep,
    "",
    "--",
    why,
    from,
    ...(note ? [note] : []),
  ].join("\n");

  const body = [
    mailP(`Hi ${escHtml(first)},`),
    mailH("Here&#39;s your sign-in link"),
    mailP(escHtml(lead), "margin-bottom:24px;"),
    mailButton(url, "Sign in to Trading Post", "margin:0 0 24px"),
    `<p style="margin:0 0 4px;font-family:${MAIL.font};font-size:14px;line-height:20px;color:${MAIL.muted}">If the button doesn&#39;t work, paste this link into your browser.</p>`,
    `<p style="margin:0 0 16px;font-family:${MAIL.mono};font-size:13px;line-height:20px;word-break:break-all"><a href="${escHtml(url)}" style="color:${MAIL.pine};text-decoration:underline">${escHtml(url)}</a></p>`,
    `<p style="margin:0;font-family:${MAIL.font};font-size:14px;line-height:20px;color:${MAIL.muted}">${escHtml(keep)}</p>`,
  ].join("\n");

  const html = mailShell({ title: "Your Trading Post sign-in link", preheader: lead, body, footer: [escHtml(why), escHtml(from), note ? escHtml(note) : ""] });
  return { subject: "Your Trading Post sign-in link", text, html };
}
