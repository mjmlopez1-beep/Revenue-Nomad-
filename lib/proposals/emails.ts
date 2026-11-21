/**
 * The emails a proposal sends: the proposal to the client who signs, the 6-digit code that
 * confirms their address, the signed copy to both sides, and a decline to the member. All in the
 * look every Merlin email shares (lib/email.ts), each with a plain-text twin. The member's name
 * leads: the client may never have heard of Merlin.
 */
import { MAIL, escHtml, footerNote, mailButton, mailH, mailP, mailShell, oneLine } from "../email";

const from = "Sent with Merlin, from Revenue Nomad. Merlin keeps the signed copy and its audit trail.";
const small = (html: string) => `<p style="margin:0 0 4px;font-family:${MAIL.font};font-size:14px;line-height:20px;color:${MAIL.muted}">${html}</p>`;
const linkLine = (url: string) =>
  `<p style="margin:0 0 16px;font-family:${MAIL.mono};font-size:13px;line-height:20px;word-break:break-all"><a href="${escHtml(url)}" style="color:${MAIL.pine};text-decoration:underline">${escHtml(url)}</a></p>`;
const first = (name: string) => oneLine(name).split(" ")[0].slice(0, 40) || "there";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const foot = () => {
  const note = footerNote();
  return { lines: [escHtml(from), note ? escHtml(note) : ""], text: ["--", from, ...(note ? [note] : [])] };
};

export type Mail = { subject: string; text: string; html: string };

/** To the client: the proposal is ready to read and sign. */
export function proposalEmail(o: { signer: string; member: string; memberTitle: string; title: string; company: string; link: string; expiresAt: string; note?: string }): Mail {
  const member = oneLine(o.member).slice(0, 80);
  const subject = `${member} sent you a proposal to sign`;
  const lead = `${member}${o.memberTitle ? `, ${oneLine(o.memberTitle).slice(0, 80)},` : ""} sent you ${oneLine(o.title).slice(0, 160)}${o.company ? ` for ${oneLine(o.company).slice(0, 80)}` : ""}.`;
  const how = "Read it and sign online. No account needed: we confirm it's you with a code sent to this email.";
  const until = `The link works until ${day(o.expiresAt)}.`;
  const note = oneLine(o.note ?? "").slice(0, 600);
  const f = foot();
  const text = [`Hi ${first(o.signer)},`, "", lead, ...(note ? ["", note] : []), "", how, "", o.link, "", until, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.signer))},`),
    mailH(`${escHtml(member)} sent you a proposal`),
    mailP(escHtml(lead)),
    note ? mailP(escHtml(note), "padding:12px 16px;background:#F3F5F4;border-radius:8px;") : "",
    mailP(escHtml(how), "margin-bottom:24px;"),
    mailButton(o.link, "Review and sign", "margin:0 0 24px"),
    small("If the button doesn&#39;t work, paste this link into your browser."),
    linkLine(o.link),
    small(escHtml(until)),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.link, footer: f.lines }) };
}

/** To the client: the 6-digit code that confirms their email before they sign. */
export function codeEmail(o: { member: string; title: string; code: string }): Mail {
  const subject = `Your code to sign ${oneLine(o.title).slice(0, 100)}`;
  const lead = `Type this code on the signing page to confirm it's you. It works for 15 minutes.`;
  const why = `You got this because someone opened the proposal ${oneLine(o.member)} sent to this address and asked for a code. If it wasn't you, ignore this email.`;
  const f = foot();
  const text = [`Your code: ${o.code}`, "", lead, "", why, "", ...f.text].join("\n");
  const body = [
    mailH("Your code to sign"),
    mailP(escHtml(lead)),
    `<p style="margin:0 0 24px;font-family:${MAIL.mono};font-size:32px;line-height:40px;font-weight:700;letter-spacing:0.18em;color:${MAIL.ink}">${escHtml(o.code)}</p>`,
    small(escHtml(why)),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: `Your code: ${o.code}`, body, footer: f.lines }) };
}

/** To both sides once it is signed: the signed copy, with its audit trail. */
export function signedEmail(o: { to: "member" | "signer"; name: string; member: string; signer: string; title: string; signedAt: string; copy: string; hash: string }): Mail {
  const subject = `Signed: ${oneLine(o.title).slice(0, 140)}`;
  const lead =
    o.to === "member"
      ? `${oneLine(o.signer)} signed ${oneLine(o.title)} on ${day(o.signedAt)}.`
      : `You signed ${oneLine(o.title)} from ${oneLine(o.member)} on ${day(o.signedAt)}. Here is your copy.`;
  const keep = "The signed copy shows the proposal as it was signed, the signature and the audit trail: when it was sent, opened, the email confirmed and signed. Print it or save it as a PDF from that page.";
  const f = foot();
  const text = [`Hi ${first(o.name)},`, "", lead, "", keep, "", o.copy, "", `Document fingerprint (SHA-256): ${o.hash}`, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.name))},`),
    mailH(o.to === "member" ? "It&#39;s signed" : "Your signed copy"),
    mailP(escHtml(lead)),
    mailP(escHtml(keep), "margin-bottom:24px;"),
    mailButton(o.copy, "Open the signed copy", "margin:0 0 24px"),
    small("If the button doesn&#39;t work, paste this link into your browser."),
    linkLine(o.copy),
    small(`Document fingerprint (SHA-256): <span style="font-family:${MAIL.mono};word-break:break-all">${escHtml(o.hash)}</span>`),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.copy, footer: f.lines }) };
}

/** To the member: the client declined, with their reason when they gave one. */
export function declinedEmail(o: { member: string; signer: string; title: string; reason: string; app: string }): Mail {
  const subject = `${oneLine(o.signer).slice(0, 80)} declined ${oneLine(o.title).slice(0, 120)}`;
  const lead = `${oneLine(o.signer)} declined the proposal.`;
  const reason = oneLine(o.reason).slice(0, 1000);
  const next = "Change it and send a new version from Proposals on Merlin, or ask them what would work.";
  const f = foot();
  const text = [`Hi ${first(o.member)},`, "", lead, ...(reason ? ["", `Their reason: ${reason}`] : []), "", next, "", o.app, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.member))},`),
    mailH(escHtml(lead)),
    reason ? mailP(`Their reason: ${escHtml(reason)}`, "padding:12px 16px;background:#F3F5F4;border-radius:8px;") : "",
    mailP(escHtml(next), "margin-bottom:24px;"),
    mailButton(o.app, "Open Proposals", "margin:0 0 8px"),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.app, footer: f.lines }) };
}
