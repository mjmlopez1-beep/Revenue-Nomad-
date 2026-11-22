/**
 * The emails a document to sign sends: the link to each signer when it is their turn, the 6-digit
 * code that confirms their address, the final PDF to everyone once all have signed (attached, with
 * a link to its page), and a decline to the member. The same look as every Merlin email
 * (lib/email.ts) and the proposal emails, each with a plain-text twin. The member's name leads.
 */
import { MAIL, escHtml, footerNote, mailButton, mailCallout, mailCode, mailH, mailLinkLine, mailP, mailShell, mailSmall, oneLine } from "../email";

export type Mail = { subject: string; text: string; html: string };
const from = "Sent with Merlin, from Revenue Nomad. Merlin keeps the signed copy and its audit trail.";
const small = (html: string) => mailSmall(html);
const linkLine = (url: string) => mailLinkLine(url);
const first = (name: string) => oneLine(name).split(" ")[0].slice(0, 40) || "there";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const foot = () => {
  const note = footerNote();
  return { lines: [escHtml(from), note ? escHtml(note) : ""], text: ["--", from, ...(note ? [note] : [])] };
};

/** To a signer, when it is their turn. */
export function docInviteEmail(o: { signer: string; member: string; memberTitle: string; title: string; link: string; expiresAt: string; note?: string; after?: string | null; self?: boolean }): Mail {
  const member = oneLine(o.member).slice(0, 80);
  const title = oneLine(o.title).slice(0, 160);
  const subject = o.self ? `Your turn to sign ${title}` : `${member} sent you ${title} to sign`;
  const lead = o.self
    ? `You added yourself as a signer of ${title}. ${o.after ? `${oneLine(o.after)} signed it, so it's your turn.` : "It's your turn."}`
    : `${member}${o.memberTitle ? `, ${oneLine(o.memberTitle).slice(0, 80)},` : ""} sent you ${title} to sign.${o.after ? ` ${oneLine(o.after)} signed it already.` : ""}`;
  const how = "Read it and sign online. No account needed: we confirm it's you with a code sent to this email.";
  const until = `The link works until ${day(o.expiresAt)}.`;
  const note = o.self ? "" : oneLine(o.note ?? "").slice(0, 600);
  const f = foot();
  const text = [`Hi ${first(o.signer)},`, "", lead, ...(note ? ["", note] : []), "", how, "", o.link, "", until, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.signer))},`),
    mailH(o.self ? "Your turn to sign" : `${escHtml(member)} sent you a document to sign`),
    mailP(escHtml(lead)),
    note ? mailCallout(escHtml(note), "page") : "",
    mailP(escHtml(how), "margin-bottom:24px;"),
    mailButton(o.link, "Review and sign", "margin:0 0 24px"),
    small("If the button doesn&#39;t work, paste this link into your browser."),
    linkLine(o.link),
    small(escHtml(until)),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.link, art: "proposal", footer: f.lines }) };
}

/** To a signer: the 6-digit code. */
export function docCodeEmail(o: { member: string; title: string; code: string }): Mail {
  const subject = `Your code to sign ${oneLine(o.title).slice(0, 100)}`;
  const lead = "Type this code on the signing page to confirm it's you. It works for 15 minutes.";
  const why = `You got this because someone opened the document ${oneLine(o.member)} sent to this address and asked for a code. If it wasn't you, ignore this email.`;
  const f = foot();
  const text = [`Your code: ${o.code}`, "", lead, "", why, "", ...f.text].join("\n");
  const body = [
    mailH("Your code to sign"),
    mailP(escHtml(lead)),
    mailCode(o.code),
    small(escHtml(why)),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: `Your code: ${o.code}`, body, art: "door", footer: f.lines }) };
}

/** To everyone once all have signed: the final PDF (attached when it fits) and its page. */
export function docDoneEmail(o: { name: string; title: string; signers: string[]; completedAt: string; copy: string; download: string; sha256: string; attached: boolean }): Mail {
  const title = oneLine(o.title).slice(0, 140);
  const subject = `Signed by everyone: ${title}`;
  const who = o.signers.map(oneLine);
  const lead = `${who.length === 1 ? who[0] : `${who.slice(0, -1).join(", ")} and ${who[who.length - 1]}`} signed ${title}. It was complete on ${day(o.completedAt)}.`;
  const keep = o.attached
    ? "The final PDF is attached: every signature and field stamped in, and an audit trail page at the end. The same file is on its page."
    : "Download the final PDF from its page: every signature and field stamped in, and an audit trail page at the end.";
  const f = foot();
  const text = [`Hi ${first(o.name)},`, "", lead, "", keep, "", o.copy, "", `Download: ${o.download}`, "", `Final file fingerprint (SHA-256): ${o.sha256}`, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.name))},`),
    mailH("Signed by everyone"),
    mailP(escHtml(lead)),
    mailP(escHtml(keep), "margin-bottom:24px;"),
    mailButton(o.download, "Download the signed PDF", "margin:0 0 24px"),
    small("Its page, with who signed and when:"),
    linkLine(o.copy),
    small(`Final file fingerprint (SHA-256): <span style="font-family:${MAIL.mono};word-break:break-all">${escHtml(o.sha256)}</span>`),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.copy, art: "signed", footer: f.lines }) };
}

/** To the member: a signer declined. */
export function docDeclinedEmail(o: { member: string; signer: string; title: string; reason: string; app: string }): Mail {
  const subject = `${oneLine(o.signer).slice(0, 80)} declined ${oneLine(o.title).slice(0, 120)}`;
  const lead = `${oneLine(o.signer)} declined to sign. The links stopped working for everyone.`;
  const reason = oneLine(o.reason).slice(0, 1000);
  const next = "Copy it to change and send again from Proposals on Merlin, or ask them what would work.";
  const f = foot();
  const text = [`Hi ${first(o.member)},`, "", lead, ...(reason ? ["", `Their reason: ${reason}`] : []), "", next, "", o.app, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.member))},`),
    mailH(escHtml(`${oneLine(o.signer)} declined`)),
    mailP(escHtml(lead)),
    reason ? mailCallout(`Their reason: ${escHtml(reason)}`, "page") : "",
    mailP(escHtml(next), "margin-bottom:24px;"),
    mailButton(o.app, "Open Proposals", "margin:0 0 8px"),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.app, art: "proposal", footer: f.lines }) };
}
