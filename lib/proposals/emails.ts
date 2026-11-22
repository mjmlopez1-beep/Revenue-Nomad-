/**
 * The emails a proposal sends: the proposal to the client who signs, the 6-digit code that
 * confirms their address, the signed copy to both sides, and a decline to the member. All in the
 * look every Merlin email shares (lib/email.ts), each with a plain-text twin. The member's name
 * leads: the client may never have heard of Merlin.
 */
import { MAIL, escHtml, footerNote, mailButton, mailCallout, mailCode, mailH, mailLinkLine, mailP, mailShell, mailSmall, oneLine } from "../email";

const from = "Sent with Merlin, from Revenue Nomad. Merlin keeps the signed copy and its audit trail.";
const small = (html: string) => mailSmall(html);
const linkLine = (url: string) => mailLinkLine(url);
const first = (name: string) => oneLine(name).split(" ")[0].slice(0, 40) || "there";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const foot = () => {
  const note = footerNote();
  return { lines: [escHtml(from), note ? escHtml(note) : ""], text: ["--", from, ...(note ? [note] : [])] };
};

export type Mail = { subject: string; text: string; html: string };

/** "Fractional sales leader for Larkfield Robotics": the company once, even when the title already names it. */
export function proposalName(title: string, company: string): string {
  const t = oneLine(title).slice(0, 160);
  const c = oneLine(company).slice(0, 80);
  return c && !t.toLowerCase().includes(c.toLowerCase()) ? `${t} for ${c}` : t;
}

/** To the client: the proposal is ready to read and sign. */
export function proposalEmail(o: { signer: string; member: string; memberTitle: string; title: string; company: string; link: string; expiresAt: string | null; note?: string }): Mail {
  const member = oneLine(o.member).slice(0, 80);
  const subject = `${member} sent you a proposal to sign`;
  const lead = `${member}${o.memberTitle ? `, ${oneLine(o.memberTitle).slice(0, 80)},` : ""} sent you ${proposalName(o.title, o.company)}.`;
  const how = "Read it and sign online. No account needed: we confirm it's you with a code sent to this email.";
  const until = o.expiresAt ? `The link works until ${day(o.expiresAt)}.` : "The link has no end date.";
  const note = oneLine(o.note ?? "").slice(0, 600);
  const f = foot();
  const text = [`Hi ${first(o.signer)},`, "", lead, ...(note ? ["", note] : []), "", how, "", o.link, "", until, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.signer))},`),
    mailH(`${escHtml(member)} sent you a proposal`),
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
    mailCode(o.code),
    small(escHtml(why)),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: `Your code: ${o.code}`, body, art: "door", footer: f.lines }) };
}

/** To both sides once it is signed: the signed copy, with its audit trail. */
export function signedEmail(o: {
  to: "member" | "signer";
  name: string;
  member: string;
  signer: string;
  title: string;
  signedAt: string;
  copy: string;
  hash: string;
  /** What they picked: "Option (price) with add-on. Total: …". */
  choice?: string;
  /** The sealed PDF (Close): its download, its SHA-256, where to check a copy, and whether it is attached. */
  sealed?: { pdf: string; sha256: string; check: string; attached: boolean };
}): Mail {
  const subject = `Signed: ${oneLine(o.title).slice(0, 140)}`;
  const lead =
    o.to === "member"
      ? `${oneLine(o.signer)} signed ${oneLine(o.title)} on ${day(o.signedAt)}.`
      : `You signed ${oneLine(o.title)} from ${oneLine(o.member)} on ${day(o.signedAt)}. Here is your copy.`;
  const chose = o.choice ? `${o.to === "member" ? `${oneLine(o.signer).split(" ")[0]} chose` : "You chose"} ${oneLine(o.choice).slice(0, 400)}` : "";
  const keep = o.sealed
    ? `${o.sealed.attached ? "The sealed PDF is attached" : "Download the sealed PDF from the signed copy's page"}: the proposal as it was signed, the signature and the audit trail on its last page. Any change to the file breaks the seal. Anyone can check a copy at ${o.sealed.check}.`
    : "The signed copy shows the proposal as it was signed, the signature and the audit trail: when it was sent, opened, the email confirmed and signed. Print it or save it as a PDF from that page.";
  const f = foot();
  const text = [
    `Hi ${first(o.name)},`,
    "",
    lead,
    ...(chose ? ["", chose] : []),
    "",
    keep,
    "",
    o.copy,
    ...(o.sealed ? ["", `Sealed PDF: ${o.sealed.pdf}`, `Sealed PDF fingerprint (SHA-256): ${o.sealed.sha256}`] : []),
    "",
    `Document fingerprint (SHA-256): ${o.hash}`,
    "",
    ...f.text,
  ].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.name))},`),
    mailH(o.to === "member" ? "It&#39;s signed" : "Your signed copy"),
    mailP(escHtml(lead)),
    chose ? mailCallout(escHtml(chose), "page") : "",
    mailP(escHtml(keep), "margin-bottom:24px;"),
    o.sealed ? mailButton(o.sealed.pdf, "Download the signed PDF", "margin:0 0 16px") : mailButton(o.copy, "Open the signed copy", "margin:0 0 24px"),
    small(o.sealed ? "The signed copy&#39;s page, with who signed and when:" : "If the button doesn&#39;t work, paste this link into your browser."),
    linkLine(o.copy),
    o.sealed ? small(`Sealed PDF fingerprint (SHA-256): <span style="font-family:${MAIL.mono};word-break:break-all">${escHtml(o.sealed.sha256)}</span>`) : "",
    small(`Document fingerprint (SHA-256): <span style="font-family:${MAIL.mono};word-break:break-all">${escHtml(o.hash)}</span>`),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.copy, art: "signed", footer: f.lines }) };
}

/**
 * Countersign mode, once the client signed: to the member, "Dana signed. Countersign to finish."
 * with the one link that opens the proposal to countersign; to the client, that it comes next.
 * The sealed copy follows the countersignature (signedEmail).
 */
export function countersignEmail(o: { to: "member" | "signer"; name: string; member: string; signer: string; title: string; link: string; choice?: string }): Mail {
  const signerFirst = oneLine(o.signer).split(" ")[0] || "They";
  const member = oneLine(o.member);
  const title = oneLine(o.title).slice(0, 140);
  const subject = o.to === "member" ? `${signerFirst} signed. Countersign to finish: ${title}`.slice(0, 200) : `Signed by you, waiting for ${member} to countersign: ${title}`.slice(0, 200);
  const lead =
    o.to === "member"
      ? `${oneLine(o.signer)} signed ${title}. Countersign to finish: it's sealed and you both get the signed PDF as soon as you do.`
      : `You signed ${title}. ${member} countersigns next, and then you both get the sealed copy by email.`;
  const chose = o.choice ? `${o.to === "member" ? `${signerFirst} chose` : "You chose"} ${oneLine(o.choice).slice(0, 400)}` : "";
  const f = foot();
  const text = [`Hi ${first(o.name)},`, "", lead, ...(chose ? ["", chose] : []), "", o.link, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.name))},`),
    mailH(o.to === "member" ? `${escHtml(signerFirst)} signed. Countersign to finish.` : "You signed"),
    mailP(escHtml(lead)),
    chose ? mailCallout(escHtml(chose), "page") : "",
    mailButton(o.link, o.to === "member" ? "Countersign" : "See what you signed", "margin:8px 0 24px"),
    small("If the button doesn&#39;t work, paste this link into your browser."),
    linkLine(o.link),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.link, art: "signed", footer: f.lines }) };
}

/** To the member: the client's question, reply-to the client's own address. */
export function questionEmail(o: { member: string; signer: string; title: string; question: string; link: string }): Mail {
  const signer = oneLine(o.signer).slice(0, 80);
  const title = oneLine(o.title).slice(0, 140);
  const subject = `${signer} asked a question about ${title}`.slice(0, 200);
  const lead = `${signer} asked about ${title}. Reply to this email to answer: it goes straight to them.`;
  const q = String(o.question).slice(0, 2000);
  const f = foot();
  const text = [`Hi ${first(o.member)},`, "", lead, "", q, "", `The proposal in Merlin: ${o.link}`, "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.member))},`),
    mailH(`${escHtml(signer)} asked a question`),
    mailP(escHtml(lead)),
    mailCallout(escHtml(q).replace(/\n/g, "<br>"), "page"),
    mailButton(o.link, "Open the proposal", "margin:8px 0 24px"),
    linkLine(o.link),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.link, art: "proposal", footer: f.lines }) };
}

/** A hand-off: to the new signer, their link; to the member, who it went to. */
export function handoffEmail(o: { to: "signer" | "member"; name: string; from: string; member: string; title: string; link: string; expiresAt: string | null; note?: string; newSigner?: string }): Mail {
  const from = oneLine(o.from).slice(0, 80);
  const member = oneLine(o.member).slice(0, 80);
  const title = oneLine(o.title).slice(0, 140);
  const subject = o.to === "signer" ? `${from} passed you ${title} to sign`.slice(0, 200) : `${from} passed ${title} to ${oneLine(o.newSigner ?? "someone else")} to sign`.slice(0, 200);
  const lead =
    o.to === "signer"
      ? `${from} passed you ${title}, from ${member}, to read and sign online. No account needed: we confirm it's you with a code sent to this email.`
      : `${from} passed ${title} to ${oneLine(o.newSigner ?? "someone else")} to sign. Their link is on its way; the one ${from} had is read only now.`;
  const note = oneLine(o.note ?? "").slice(0, 600);
  const until = o.expiresAt ? `The link works until ${day(o.expiresAt)}.` : "The link has no end date.";
  const f = foot();
  const text = [`Hi ${first(o.name)},`, "", lead, ...(note ? ["", `${from}'s note: ${note}`] : []), "", o.link, ...(o.to === "signer" ? ["", until] : []), "", ...f.text].join("\n");
  const body = [
    mailP(`Hi ${escHtml(first(o.name))},`),
    mailH(o.to === "signer" ? `${escHtml(from)} passed you a proposal to sign` : "It was passed on"),
    mailP(escHtml(lead)),
    note ? mailCallout(`${escHtml(from)}&#39;s note: ${escHtml(note)}`, "page") : "",
    mailButton(o.link, o.to === "signer" ? "Review and sign" : "Open the proposal", "margin:8px 0 24px"),
    linkLine(o.link),
    o.to === "signer" ? small(escHtml(until)) : "",
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.link, art: "proposal", footer: f.lines }) };
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
    reason ? mailCallout(`Their reason: ${escHtml(reason)}`, "page") : "",
    mailP(escHtml(next), "margin-bottom:24px;"),
    mailButton(o.app, "Open Proposals", "margin:0 0 8px"),
  ].join("\n");
  return { subject, text, html: mailShell({ title: subject, preheader: lead, body, link: o.app, art: "proposal", footer: f.lines }) };
}
