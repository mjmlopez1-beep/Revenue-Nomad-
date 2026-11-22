/**
 * The PDF work for documents to sign, with pdf-lib: reading an upload (pages, their crop boxes and
 * rotation; a password or a broken file refused), and the final file: each signer's values drawn
 * into their fields, then an audit trail page (or more) at the end with the original's SHA-256,
 * the signed pages' SHA-256, and every step with its time, email, IP address and browser, and the
 * consent and its version.
 *
 * A field's place is kept as shares of the page as shown (rotation applied, as pdf.js draws it),
 * from the top left, so the app, the signing page and this file agree on any page size or rotation.
 * The standard PDF fonts only (no font files): text outside their character set is drawn with
 * its accents taken off, and anything still outside it as "?". A drawn signature is a PNG.
 */
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { DocField, StoredDocument } from "./types";

export class PdfProblem extends Error {}

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** An upload's pages, or a sentence on why it can't be used. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pages: StoredDocument["pages"] }> {
  if (Buffer.from(bytes.subarray(0, 1024)).toString("latin1").indexOf("%PDF-") < 0) throw new PdfProblem("That file isn't a PDF. Save it as a PDF and upload that.");
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    const msg = String((e as Error)?.message ?? "");
    if (/encrypt/i.test(msg) || (e as Error)?.constructor?.name === "EncryptedPDFError")
      throw new PdfProblem("That PDF has a password or is locked for changes. Save a copy without one (Print, then Save as PDF) and upload that.");
    throw new PdfProblem("That PDF didn't open. Save it again as a PDF and upload that.");
  }
  let pages: StoredDocument["pages"];
  try {
    pages = doc.getPages().map((p) => {
      const b = p.getCropBox();
      const rot = (((p.getRotation().angle % 360) + 360) % 360) as number;
      return { x: b.x, y: b.y, w: b.width, h: b.height, rot: [0, 90, 180, 270].includes(rot) ? rot : 0 };
    });
  } catch {
    throw new PdfProblem("That PDF didn't open. Save it again as a PDF and upload that.");
  }
  if (!pages.length) throw new PdfProblem("That PDF has no pages.");
  if (pages.length > 200) throw new PdfProblem("That PDF has more than 200 pages. Send a shorter one.");
  return { pages };
}

/** A page as shown: width and height with its rotation applied. */
export const shown = (p: { w: number; h: number; rot: number }) => (p.rot % 180 ? { w: p.h, h: p.w } : { w: p.w, h: p.h });

/** A point on the page as shown (points from its top left) in the page's own space (from the crop box's bottom left). */
export function toPdf(p: StoredDocument["pages"][number], dx: number, dy: number): { x: number; y: number } {
  const { x: x0, y: y0, w, h, rot } = p;
  switch (rot) {
    case 90:
      return { x: x0 + dy, y: y0 + dx };
    case 180:
      return { x: x0 + w - dx, y: y0 + dy };
    case 270:
      return { x: x0 + w - dy, y: y0 + h - dx };
    default:
      return { x: x0 + dx, y: y0 + h - dy };
  }
}

/* ---------- text the standard fonts can draw ---------- */

const MAP: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " " };
/** Text for a standard font: accents off where the letter has none in WinAnsi, the rest "?". */
export function winAnsi(s: string): string {
  return [...String(s ?? "")]
    .map((c) => MAP[c] ?? c)
    .join("")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .split("")
    .map((c) => (c.charCodeAt(0) <= 0xff ? c : c.normalize("NFKD").replace(/[̀-ͯ]/g, "")))
    .join("")
    .replace(/[^ -~ -ÿ]/g, "?");
}

const fit = (font: PDFFont, text: string, maxW: number, maxSize: number, minSize = 5) => {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  return size;
};

/** Long lines broken to fit `width` at `size`. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of winAnsi(text).split("\n")) {
    // A word wider than the line (a hash, a long address) is cut into pieces that fit.
    const words: string[] = [];
    for (const w of para.split(/\s+/).filter(Boolean)) {
      let rest = w;
      while (rest && font.widthOfTextAtSize(rest, size) > width) {
        let n = 1;
        while (n < rest.length && font.widthOfTextAtSize(rest.slice(0, n + 1), size) <= width) n++;
        words.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      if (rest) words.push(rest);
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) out.push(line), (line = word);
      else line = next;
    }
    out.push(line);
  }
  return out;
}

/* ---------- the final PDF ---------- */

export interface StampInput {
  doc: StoredDocument;
  /** Each drawn signature, by signer id. */
  signatures: Map<string, Uint8Array>;
  sender: { name: string; email: string; title: string };
  consentText: string;
  consentVersion: string;
}

const INK = rgb(0.04, 0.1, 0.075);
const MUTED = rgb(0.36, 0.4, 0.38);
const PINE = rgb(0.027, 0.247, 0.184);
const LINE = rgb(0.886, 0.902, 0.89);

const stampDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const stampWhen = (iso: string | undefined | null) =>
  iso ? `${new Date(iso).toISOString().replace("T", " ").slice(0, 19)} UTC` : "";
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 4);

/** What a field reads once its signer signed. */
export function fieldText(f: DocField, signer: StoredDocument["signers"][number]): string {
  const s = signer.signed;
  if (!s) return "";
  if (f.kind === "signature") return s.name;
  if (f.kind === "initials") return signer.values?.[f.id] || initialsOf(s.name);
  if (f.kind === "date") return stampDate(s.at);
  if (f.kind === "name") return s.name;
  if (f.kind === "checkbox") return signer.values?.[f.id] === "yes" ? "yes" : "";
  return signer.values?.[f.id] ?? "";
}

function drawField(page: PDFPage, box: StoredDocument["pages"][number], f: DocField, text: string, fonts: { sig: PDFFont; body: PDFFont }, img: PDFImage | null) {
  const sp = shown(box);
  const bw = f.w * sp.w;
  const bh = f.h * sp.h;
  const left = f.x * sp.w;
  const top = f.y * sp.h;
  const rot = degrees(box.rot);
  if (f.kind === "checkbox") {
    if (text !== "yes") return;
    // A check mark: two strokes, drawn as text in the box ("X" reads on every viewer).
    const size = Math.min(bh, bw) * 0.95;
    const w = fonts.body.widthOfTextAtSize("X", size);
    const at = toPdf(box, left + (bw - w) / 2, top + bh * 0.82);
    page.drawText("X", { x: at.x, y: at.y, size, font: fonts.body, color: INK, rotate: rot });
    return;
  }
  if ((f.kind === "signature" || f.kind === "initials") && img) {
    const scale = Math.min(bw / img.width, bh / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const at = toPdf(box, left + (bw - w) / 2, top + (bh + h) / 2);
    page.drawImage(img, { x: at.x, y: at.y, width: w, height: h, rotate: rot });
    return;
  }
  const t = winAnsi(text);
  if (!t) return;
  const font = f.kind === "signature" || f.kind === "initials" ? fonts.sig : fonts.body;
  const size = fit(font, t, bw - 4, Math.max(6, Math.min(bh * (f.kind === "signature" ? 0.72 : 0.62), 20)));
  const at = toPdf(box, left + 2, top + bh - (bh - size * 0.75) / 2 - size * 0.05);
  page.drawText(t, { x: at.x, y: at.y, size, font, color: INK, rotate: rot });
}

/**
 * The final file: the original with every signed value drawn in, then the audit trail. Returns
 * the bytes, the SHA-256 of the signed pages alone (before the audit trail was added) and of the
 * whole file.
 */
export async function buildFinal(original: Uint8Array, a: StampInput): Promise<{ bytes: Uint8Array; signedPagesSha256: string; sha256: string }> {
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  const sig = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const pages = pdf.getPages();
  const imgs = new Map<string, PDFImage>();
  for (const [id, png] of a.signatures) {
    try {
      imgs.set(id, await pdf.embedPng(png));
    } catch {
      /* a broken drawing: its typed name is drawn instead */
    }
  }
  for (const f of a.doc.fields) {
    const s = a.doc.signers.find((x) => x.id === f.signer);
    const page = pages[f.page];
    const box = a.doc.pages[f.page];
    if (!s?.signed || !page || !box) continue;
    const drawn = s.signed.method === "drawn" && f.kind === "signature" ? imgs.get(s.id) ?? null : null;
    drawField(page, box, f, fieldText(f, s), { sig, body }, drawn);
  }
  pdf.setModificationDate(new Date(a.doc.signers.map((s) => s.signed?.at ?? "").sort().pop() || Date.now()));
  const signedPages = await pdf.save({ useObjectStreams: false });
  const signedPagesSha256 = sha256(signedPages);

  // The audit trail, on US Letter pages at the end.
  const W = 612;
  const H = 792;
  const M = 54;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const need = (h: number) => {
    if (y - h < M) (page = pdf.addPage([W, H])), (y = H - M);
  };
  const text = (t: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number; indent?: number } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? body;
    for (const line of wrap(font, t, size, W - 2 * M - (o.indent ?? 0))) {
      need(size * 1.35);
      page.drawText(line, { x: M + (o.indent ?? 0), y: y - size, size, font, color: o.color ?? INK });
      y -= size * 1.35;
    }
    y -= o.gap ?? 0;
  };
  const rule = () => {
    need(14);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: LINE });
    y -= 8;
  };
  const d = a.doc;
  text("Audit trail", { size: 20, font: bold, color: PINE, gap: 4 });
  text(d.title, { size: 12, font: bold, gap: 2 });
  text(`Sent with Merlin, from Revenue Nomad. Document ${d.id}. ${pages.length} ${pages.length === 1 ? "page" : "pages"} signed, then this trail. Times are UTC.`, { color: MUTED, gap: 6 });
  rule();
  text("Fingerprints (SHA-256)", { size: 11, font: bold, gap: 2 });
  text("The document as uploaded:", { color: MUTED });
  text(d.sha256, { font: mono, size: 8.5, gap: 4 });
  text("The signed pages, with every value stamped in (this file without its audit trail):", { color: MUTED });
  text(signedPagesSha256, { font: mono, size: 8.5, gap: 4 });
  text("The fingerprint of this whole file can't be printed inside it. Merlin records it at completion and shows it in the email that carried this file and on the signed copy's page.", { color: MUTED, gap: 4 });
  rule();
  text("Sender", { size: 11, font: bold, gap: 2 });
  text(`${a.sender.name}${a.sender.title ? `, ${a.sender.title}` : ""} <${a.sender.email}>`, { gap: 2 });
  text(`Sent ${stampWhen(d.sentAt)}${d.ordered ? ", to sign in order" : ""}.`, { color: MUTED, gap: 4 });
  rule();
  text(d.signers.length === 1 ? "Signer" : "Signers", { size: 11, font: bold, gap: 2 });
  d.signers.forEach((s, i) => {
    need(60);
    text(`${i + 1}. ${s.name}${s.title ? `, ${s.title}` : ""} <${s.email}>${s.sender ? " (the sender)" : ""}`, { font: bold, gap: 1 });
    const steps = d.events.filter((e) => e.who === s.email);
    const sig = s.signed;
    if (sig) text(`Signed ${stampWhen(sig.at)} by ${sig.method === "drawn" ? "drawing their signature" : `typing "${sig.name}"`}. IP ${sig.ip || "not recorded"}. Browser: ${sig.ua || "not recorded"}.`, { indent: 12 });
    if (sig) text(`Consent to sign electronically, version ${sig.consentVersion}. The document they signed: ${sig.hash}.`, { indent: 12, color: MUTED });
    for (const e of steps) if (e.kind !== "signed") text(`${stampWhen(e.at)}  ${EVENT_WORDS[e.kind] ?? e.kind}${e.note ? `: ${e.note}` : ""}${e.ip ? `  IP ${e.ip}` : ""}${e.ua ? `  ${e.ua}` : ""}`, { indent: 12, size: 8.5, color: MUTED });
    y -= 4;
  });
  rule();
  text("Everything, in order", { size: 11, font: bold, gap: 2 });
  for (const e of d.events) text(`${stampWhen(e.at)}  ${EVENT_WORDS[e.kind] ?? e.kind}${e.who ? ` (${e.who})` : ""}${e.note ? `: ${e.note}` : ""}${e.ip ? `  IP ${e.ip}` : ""}`, { size: 8.5 });
  rule();
  text(`The consent each signer agreed to (version ${a.consentVersion})`, { size: 11, font: bold, gap: 2 });
  text(a.consentText, { size: 8.5, color: MUTED });
  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, signedPagesSha256, sha256: sha256(bytes) };
}

export const EVENT_WORDS: Record<string, string> = {
  uploaded: "Uploaded",
  sent: "Sent for signature",
  notified: "Link emailed to the signer",
  viewed: "Opened by the signer",
  code_sent: "Code sent to the signer's email",
  code_failed: "A wrong code was typed",
  code_verified: "Email confirmed with the code",
  signed: "Signed",
  declined: "Declined",
  voided: "Voided",
  completed: "Completed: every signer signed",
  copy_sent: "Final copy emailed",
  expired_open: "Opened after the link expired",
};
