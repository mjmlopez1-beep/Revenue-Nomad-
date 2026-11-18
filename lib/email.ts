/**
 * Email: the sender, the look every Merlin email shares, and the sign-in email.
 * Uses Resend's HTTP API when RESEND_API_KEY is set. Without it, emailEnabled() is false and
 * the app falls back to instant join with a personal sign-in link (fine for a pilot, not for
 * a public launch).
 *
 * RESEND_API_KEY   API key from resend.com
 * RN_EMAIL_FROM    e.g. "Merlin <post@revenuenomad.com>" (domain verified in Resend)
 * RN_PUBLIC_URL    e.g. "https://post.revenuenomad.com" (used to build links)
 * RN_EMAIL_FOOTER  optional line for the footer, such as the sender's postal address
 * RN_EMAIL_REPLY_TO optional, e.g. "hello@revenuenomad.com": sent as Resend's reply_to, so a reply reaches
 *                  the team (the mail can go out from another address, such as hello@mail.revenuenomad.com).
 *                  Every email uses it, message emails too: a reply never goes to a member's address.
 * RN_EMAIL_API_URL optional, for tests: where email goes instead of Resend's API (a local mock that catches it)
 */
export const emailEnabled = () => !!process.env.RESEND_API_KEY && !!process.env.RN_EMAIL_FROM;
/** Resend's API, unless RN_EMAIL_API_URL points at a local mock. */
/** RN_EMAIL_REPLY_TO, when it holds one plain address. */
const replyTo = () => {
  const v = process.env.RN_EMAIL_REPLY_TO?.trim() ?? "";
  return /^[^\s@<>,]+@[^\s@<>,]+\.[a-z]{2,}$/i.test(v) ? v : null;
};
const emailApiUrl = () => process.env.RN_EMAIL_API_URL?.trim() || "https://api.resend.com/emails";

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
    const r = await fetch(emailApiUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RN_EMAIL_FROM, to: [to], subject, text, html, ...(replyTo() ? { reply_to: replyTo() } : {}), ...headers }),
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
 * every client. Banner header on pine, one volt button, and ember only on a number that is live.
 */
export const MAIL = {
  pine: "#073F2F",
  volt: "#2EE59D",
  voltSoft: "#E8FBF2",
  ember: "#FF5A1F",
  /** Ember text on white (the full ember is for dots and fills). */
  emberInk: "#B23A0A",
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

/** The site an email's links go to (http or https origin), or "" when there is none. */
export function mailOrigin(...links: (string | undefined)[]): string {
  for (const l of links) {
    try {
      const u = new URL(oneLine(l));
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* not a link */
    }
  }
  return "";
}

/** The banner every email opens with (public/brand, made by scripts/make-banner.py): 560 by 128, saved at 2x. */
export const MAIL_BANNER = { path: "/brand/merlin-banner-email.png", width: 560, height: 128, alt: "Merlin by Revenue Nomad" } as const;

/**
 * The header: the mountain banner, from the site the email links to (mail needs an absolute
 * address). Pine behind it, so with images off it is still a pine bar with the alt text in white.
 * With no site to load it from, the pine bar with the name in text.
 */
function mailHeader(origin: string): string {
  const top = "border-radius:9px 9px 0 0";
  if (!origin)
    return `<tr><td bgcolor="${MAIL.pine}" style="padding:16px 24px;${top};font-family:${MAIL.font};font-size:17px;line-height:24px;font-weight:800;letter-spacing:-0.01em;color:#FFFFFF">Merlin<span style="font-weight:500;font-size:13px;letter-spacing:0;color:#C9D9D1">&nbsp;&nbsp;by Revenue Nomad</span></td></tr>`;
  const b = MAIL_BANNER;
  return `<tr><td bgcolor="${MAIL.pine}" style="padding:0;${top};background-color:${MAIL.pine};line-height:0;font-size:0"><img src="${escHtml(origin + b.path)}" width="${b.width}" height="${b.height}" alt="${escHtml(b.alt)}" style="display:block;width:100%;max-width:${b.width}px;height:auto;border:0;outline:none;text-decoration:none;${top};background-color:${MAIL.pine};font-family:${MAIL.font};font-size:17px;line-height:24px;font-weight:800;color:#FFFFFF"></td></tr>`;
}

/**
 * The frame: a white card on the page color with the banner header. `body` and each footer
 * line are HTML. `preheader` is the line mail apps show next to the subject. `link`: a link
 * in the email, whose site serves the banner (RN_PUBLIC_URL when it has none).
 */
export function mailShell(o: { title: string; preheader: string; body: string; footer: string[]; link?: string }): string {
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
${mailHeader(mailOrigin(o.link, process.env.RN_PUBLIC_URL))}
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
  const lead = "It opens Merlin and keeps you signed in on this device.";
  const keep = "Keep this link to yourself. It works like a password.";
  const why = "You got this because someone asked for a sign-in link with this email address. If it wasn't you, ignore this email.";
  const from = "Merlin is a data exchange for fractional operators, from Revenue Nomad.";
  const note = footerNote();

  const text = [
    `Hi ${first},`,
    "",
    `Here's your sign-in link for Merlin. ${lead}`,
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
    mailButton(url, "Sign in to Merlin", "margin:0 0 24px"),
    `<p style="margin:0 0 4px;font-family:${MAIL.font};font-size:14px;line-height:20px;color:${MAIL.muted}">If the button doesn&#39;t work, paste this link into your browser.</p>`,
    `<p style="margin:0 0 16px;font-family:${MAIL.mono};font-size:13px;line-height:20px;word-break:break-all"><a href="${escHtml(url)}" style="color:${MAIL.pine};text-decoration:underline">${escHtml(url)}</a></p>`,
    `<p style="margin:0;font-family:${MAIL.font};font-size:14px;line-height:20px;color:${MAIL.muted}">${escHtml(keep)}</p>`,
  ].join("\n");

  const html = mailShell({ title: "Your Merlin sign-in link", preheader: lead, body, link: url, footer: [escHtml(why), escHtml(from), note ? escHtml(note) : ""] });
  return { subject: "Your Merlin sign-in link", text, html };
}
