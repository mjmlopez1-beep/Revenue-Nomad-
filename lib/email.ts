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
/** `replyTo` (a proposal): one plain address that replies go to instead of RN_EMAIL_REPLY_TO. */
/** `attachments` (a signed document's final PDF): files sent with the email, as Resend takes them (base64 content). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
  opts: { unsubscribeUrl?: string; replyTo?: string; attachments?: { filename: string; content: Uint8Array }[] } = {},
): Promise<boolean> {
  if (!emailEnabled()) return false;
  const unsub = /^https?:\/\/[^\s<>]+$/.test(opts.unsubscribeUrl ?? "") ? opts.unsubscribeUrl : undefined;
  const headers = unsub ? { headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {};
  const reply = opts.replyTo && /^[^\s@<>,]+@[^\s@<>,]+\.[a-z]{2,}$/i.test(opts.replyTo) ? opts.replyTo : replyTo();
  const files = (opts.attachments ?? []).filter((a) => a.content.length <= MAX_ATTACHMENT_BYTES);
  const attachments = files.length ? { attachments: files.map((a) => ({ filename: oneLine(a.filename).replace(/[\\/"]/g, "-").slice(0, 120), content: Buffer.from(a.content).toString("base64") })) } : {};
  try {
    const r = await fetch(emailApiUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RN_EMAIL_FROM, to: [to], subject, text, html, ...(reply ? { reply_to: reply } : {}), ...headers, ...attachments }),
    });
    if (!r.ok) console.error("email send failed", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error("email send failed", e);
    return false;
  }
}

/* ---------- the look every email shares ---------- */

/*
 * The tokens live in lib/mailTokens.ts and the frame and its parts in lib/emailArt.ts (the pine
 * header with the lockup and a Fractions strip, the white sheet, one pine button, the footer as
 * Crystal Ball's). Re-exported here, where every email has always found them.
 */
export { MAIL, escHtml, oneLine, footerNote, mailOrigin } from "./mailTokens";
export { mailShell, mailP, mailH, mailSmall, mailLinkLine, mailButton, mailCallout, mailQuote, mailCode, mailList, mailFootLink, type HeaderArt } from "./emailArt";
import { escHtml, footerNote, oneLine } from "./mailTokens";
import { mailButton, mailH, mailLinkLine, mailP, mailShell, mailSmall } from "./emailArt";

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
    mailSmall("If the button doesn&#39;t work, paste this link into your browser."),
    mailLinkLine(url),
    mailSmall(escHtml(keep), "margin:0;"),
  ].join("\n");

  const html = mailShell({ title: "Your Merlin sign-in link", preheader: lead, body, link: url, art: "door", footer: [escHtml(why), escHtml(from), note ? escHtml(note) : ""] });
  return { subject: "Your Merlin sign-in link", text, html };
}
