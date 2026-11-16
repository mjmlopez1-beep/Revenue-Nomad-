/**
 * Transactional email (sign-in links). Uses Resend's HTTP API when RESEND_API_KEY is set.
 * Without it, emailEnabled() is false and the app falls back to instant join with a
 * personal sign-in link (fine for a pilot, not for a public launch).
 *
 * RESEND_API_KEY   API key from resend.com
 * RN_EMAIL_FROM    e.g. "Trading Post <post@revenuenomad.com>" (domain verified in Resend)
 * RN_PUBLIC_URL    e.g. "https://post.revenuenomad.com" (used to build links)
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

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function signInEmail(name: string, link: string) {
  const first = name.split(" ")[0] || "there";
  const text = `Hi ${first},\n\nHere is your sign-in link for Trading Post:\n${link}\n\nIt keeps you signed in on this device. If you didn't ask for it, ignore this email.\n\nRevenue Nomad`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0A1A13;line-height:1.5">
<p>Hi ${esc(first)},</p>
<p>Here is your sign-in link for Trading Post.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#073F2F;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Sign in to Trading Post</a></p>
<p style="color:#5B6661;font-size:13px">It keeps you signed in on this device. If you didn't ask for it, ignore this email.</p>
<p style="color:#5B6661;font-size:13px">Revenue Nomad</p></div>`;
  return { subject: "Your Trading Post sign-in link", text, html };
}
