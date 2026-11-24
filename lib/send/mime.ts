/**
 * One plain-text email as RFC 2822 (RFC 5322) for Gmail's users.messages.send, base64url as its
 * `raw`. Header values never carry a line break (no header can be added from a field), words
 * outside ASCII are encoded as RFC 2047 UTF-8 words, and the text goes as UTF-8 in base64 lines.
 */
import { randomBytes } from "crypto";

const flat = (v: unknown) => String(v ?? "").replace(/[\r\n\t\u2028\u2029]+/g, " ").replace(/\s{2,}/g, " ").trim();
const ascii = (v: string) => /^[\x20-\x7e]*$/.test(v);

/** RFC 2047 encoded words, split so each stays under 75 characters and no UTF-8 character is cut. */
export function encodeWords(v: string): string {
  const s = flat(v);
  if (ascii(s)) return s;
  const out: string[] = [];
  let chunk = "";
  for (const ch of s) {
    // 45 bytes of UTF-8 become 60 base64 characters, inside the 75 an encoded word may take.
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) {
      out.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) out.push(chunk);
  return out.map((c) => `=?UTF-8?B?${Buffer.from(c, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** A display name and address: "Dana Example" <dana@x.example>, the name encoded when it needs to be. */
export function mailbox(address: string, name?: string | null): string {
  const a = flat(address).replace(/[<>",;\s]/g, "");
  const n = flat(name);
  if (!n) return a;
  if (!ascii(n)) return `${encodeWords(n)} <${a}>`;
  return `"${n.replace(/["\\]/g, "")}" <${a}>`;
}

export const newMessageId = (domain = "merlin.revenuenomad.com") => `<rn.${Date.now().toString(36)}.${randomBytes(9).toString("base64url")}@${domain}>`;

export interface Mail {
  to: string;
  toName?: string | null;
  from?: string | null;
  fromName?: string | null;
  subject: string;
  body: string;
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  date?: Date;
}

/** The message, as text, CRLF line ends. */
export function rfc2822(m: Mail): string {
  const h: string[] = [];
  if (m.from) h.push(`From: ${mailbox(m.from, m.fromName)}`);
  h.push(`To: ${mailbox(m.to, m.toName)}`);
  h.push(`Subject: ${encodeWords(m.subject)}`);
  h.push(`Date: ${(m.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`);
  h.push(`Message-ID: ${flat(m.messageId)}`);
  if (m.inReplyTo) h.push(`In-Reply-To: ${flat(m.inReplyTo)}`);
  const refs = (m.references ?? []).map(flat).filter(Boolean);
  if (refs.length) h.push(`References: ${refs.join(" ")}`);
  h.push("MIME-Version: 1.0");
  h.push('Content-Type: text/plain; charset="UTF-8"');
  h.push("Content-Transfer-Encoding: base64");
  const text = String(m.body ?? "").replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
  const b64 = Buffer.from(text, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return `${h.join("\r\n")}\r\n\r\n${b64}\r\n`;
}

export const rawOf = (m: Mail) => Buffer.from(rfc2822(m), "utf8").toString("base64url");
