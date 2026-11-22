/**
 * The sealed PDF of a signed proposal (Close): the proposal as the client read and signed it, with
 * the option and add-ons they picked, every section in the order of their page (lib/proposals/
 * sections.ts), the signatures, then an audit trail page with the document's SHA-256, every step
 * with its time, IP address and browser, the consent, and the seal (lib/seal.ts): the file's own
 * SHA-256 printed on it and a line on where to check a copy.
 *
 * The same text machinery as a signed document (lib/documents/pdf.ts): Latin in the standard
 * fonts, anything else in DejaVu Sans (subset into the file), CJK and emoji as "?" with the name
 * as typed kept in Unicode code points on the audit page.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { codePoints, pdfText, stampWhen, unicodeFont, type Ink } from "../documents/pdf";
import { finishSeal, placeSeal } from "../seal";
import { includedRows, priced } from "./pricing";
import { arrange, parseText } from "./sections";
import type { ChoiceRec, StoredSend } from "./types";

const { wrap, drawRuns, widthOf, latinOk, printable } = pdfText;

const INK = rgb(0.04, 0.1, 0.075);
const BODY = rgb(0.157, 0.196, 0.176);
const MUTED = rgb(0.36, 0.4, 0.38);
const PINE = rgb(0.027, 0.247, 0.184);
const MINT = rgb(0.81, 0.91, 0.867);
const LINE = rgb(0.886, 0.902, 0.89);
const WASH = rgb(0.953, 0.961, 0.957);

const W = 612;
const H = 792;
const M = 54;

export const EVENT_WORDS: Record<string, string> = {
  sent: "Sent for signature",
  viewed: "Opened by the signer",
  code_sent: "Code sent to the signer's email",
  code_failed: "A wrong code was typed",
  code_verified: "Email confirmed with the code",
  signed: "Signed",
  declined: "Declined",
  voided: "Voided",
  expired_open: "Opened after the link expired",
  copy_sent: "Signed copy emailed",
};

export interface ProposalPdfInput {
  send: StoredSend;
  sender: { name: string; email: string; title: string };
  consentVersion: string;
  /** Where anyone checks a copy ("https://…/check"). */
  checkUrl: string;
}

/** The final PDF, sealed. Returns its bytes, the digest printed on it and its SHA-256. */
export async function buildProposalPdf(a: ProposalPdfInput): Promise<{ bytes: Uint8Array; digest: string; sha256: string; pages: number }> {
  const x = a.send;
  const d = x.doc;
  const sig = x.signed!;
  const choice: ChoiceRec | undefined = sig.choice;
  const pdf = await PDFDocument.create();
  const at = new Date(sig.at);
  pdf.setTitle(d.title.slice(0, 200));
  pdf.setAuthor(d.from.name.slice(0, 100));
  pdf.setSubject("Signed proposal, sealed by Merlin");
  pdf.setProducer("Merlin, from Revenue Nomad");
  pdf.setCreator("Merlin");
  pdf.setCreationDate(at);
  pdf.setModificationDate(at);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const script = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const all = JSON.stringify([d, sig.name, x.events.map((e) => e.note), a.sender]);
  const uf = [...all].some((c) => !latinOk(c)) ? unicodeFont() : null;
  if (uf) pdf.registerFontkit(fontkit);
  const ink: Ink = { uni: uf ? await pdf.embedFont(uf.bytes, { subset: true }) : null, has: uf?.has ?? (() => false), lost: false };

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const need = (h: number) => {
    if (y - h < M) newPage();
  };
  type T = { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number; indent?: number; width?: number; lead?: number };
  const text = (t: string, o: T = {}) => {
    const size = o.size ?? 10;
    const font = o.font ?? body;
    const lead = o.lead ?? 1.45;
    for (const l of wrap(ink, font, t, size, o.width ?? W - 2 * M - (o.indent ?? 0))) {
      need(size * lead);
      drawRuns(page, ink, font, l, { x: M + (o.indent ?? 0), y: y - size, size, color: o.color ?? BODY });
      y -= size * lead;
    }
    y -= o.gap ?? 0;
  };
  const bullet = (t: string, o: T = {}) => {
    const size = o.size ?? 10;
    const ind = (o.indent ?? 0) + 14;
    need(size * 1.45);
    page.drawCircle({ x: M + ind - 8, y: y - size * 0.68, size: 1.6, color: o.color ?? BODY });
    text(t, { ...o, indent: ind });
  };
  const rule = (gap = 10) => {
    need(gap * 2);
    y -= gap;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: LINE });
    y -= gap;
  };
  const kicker = (t: string) => {
    need(60);
    text(t.toUpperCase(), { size: 8.5, font: bold, color: PINE, gap: 2 });
  };
  const heading = (t: string, size = 13) => {
    need(size * 3);
    text(t, { size, font: bold, color: INK, gap: 3 });
  };
  /** A block's text: paragraphs, and lines starting "- " as bullets. */
  const prose = (t: string) => {
    for (const p of parseText(t)) {
      if (p.kind === "list") for (const li of p.items) bullet(li);
      else text(p.lines.join("\n"));
      y -= 5;
    }
  };

  // The header: a pine band with the title and both parties.
  const titleLines = wrap(ink, bold, d.title, 22, W - 2 * M);
  const partyLine = `${d.from.name}${d.from.title ? `, ${d.from.title}` : ""} · prepared for ${d.to.name}${d.to.title ? `, ${d.to.title}` : ""}${d.company ? `, ${d.company}` : ""}`;
  const partyLines = wrap(ink, body, partyLine, 10.5, W - 2 * M);
  const bandH = 40 + 14 + titleLines.length * 28 + partyLines.length * 15 + 26;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: PINE });
  y = H - 40;
  drawRuns(page, ink, bold, `PROPOSAL · VERSION ${d.version}`, { x: M, y: y - 9, size: 9, color: MINT });
  y -= 24;
  for (const l of titleLines) drawRuns(page, ink, bold, l, { x: M, y: y - 22, size: 22, color: rgb(1, 1, 1) }), (y -= 28);
  y -= 4;
  for (const l of partyLines) drawRuns(page, ink, body, l, { x: M, y: y - 10.5, size: 10.5, color: MINT }), (y -= 15);
  y = H - bandH - 26;
  text(`Sent ${stampWhen(x.sentAt)}. Signed by ${sig.name} ${stampWhen(sig.at)}.`, { size: 9, color: MUTED, gap: 8 });

  const g = arrange(d);
  if (g.cover?.lead) text(g.cover.lead, { size: 12, color: INK, gap: 10 });

  // 01 Scope, 02 Timeline and investment, 03 the agreement: every section in the page's order.
  if (g.scope.length) {
    kicker("01 · Scope");
    for (const b of g.scope) {
      heading(b.title);
      prose(b.text);
      y -= 6;
    }
  }
  const p = d.pricing;
  if (g.invest.length || p) {
    rule(12);
    kicker("02 · Timeline and investment");
    if (p && choice) {
      const opt = p.options.find((o) => o.id === choice.optionId);
      heading(p.options.length > 1 ? "The option chosen" : "Hours and investment");
      if (opt) {
        need(80);
        const boxTop = y;
        const boxPage = page;
        y -= 10;
        text(opt.name, { size: 12, font: bold, color: INK, indent: 12, width: W - 2 * M - 24 });
        text(priced(opt.price, opt.billing), { size: 15, font: bold, color: INK, indent: 12, gap: 2 });
        if (opt.note) text(opt.note, { size: 9, color: MUTED, indent: 12 });
        if (opt.about) text(opt.about, { indent: 12, width: W - 2 * M - 24 });
        for (const t of opt.included) bullet(t, { indent: 12 });
        y -= 6;
        // The box round it, when it stayed on one page.
        if (page === boxPage) page.drawRectangle({ x: M, y, width: W - 2 * M, height: boxTop - y, borderColor: PINE, borderWidth: 1.2 });
        y -= 10;
      }
      if (choice.addOns.length) {
        text("Add-ons chosen", { font: bold, color: INK, gap: 2 });
        for (const ad of choice.addOns) bullet(`${ad.name} · ${priced(ad.price, ad.billing)}`);
        y -= 4;
      } else if (p.addOns.length) text("No add-ons chosen.", { color: MUTED, gap: 4 });
      need(40);
      page.drawRectangle({ x: M, y: y - 34, width: W - 2 * M, height: 34, color: PINE });
      drawRuns(page, ink, body, "Your investment", { x: M + 12, y: y - 13, size: 8.5, color: MINT });
      drawRuns(page, ink, bold, choice.total, { x: M + 12, y: y - 28, size: 12.5, color: rgb(1, 1, 1) });
      y -= 46;
      const others = p.options.filter((o) => o.id !== choice.optionId);
      if (others.length) text(`Also offered: ${others.map((o) => `${o.name} (${priced(o.price, o.billing)})`).join("; ")}.`, { size: 9, color: MUTED, gap: 4 });
      if (p.options.length > 1) {
        const rows = includedRows(p);
        if (rows.length) {
          text("What each option includes", { font: bold, color: INK, gap: 2, size: 9.5 });
          for (const r of rows) text(`${r.label}: ${p.options.map((o, i) => `${o.name} ${r.cells[i] ? "yes" : "no"}`).join(", ")}`, { size: 8.5, color: MUTED });
          y -= 6;
        }
      }
    }
    for (const b of g.invest) {
      heading(b.title, 12);
      prose(b.text);
      y -= 4;
    }
  }
  if (g.terms.length) {
    rule(12);
    kicker("03 · Consulting agreement");
    for (const b of g.terms) {
      if (g.terms.length > 1 || b.sections.length <= 1) heading(b.title);
      let n = 0;
      for (const s of b.sections) {
        if (b.sections.length > 1 && s.title) text(`${++n}. ${s.title}`, { font: bold, color: INK, gap: 1 });
        prose(s.body);
      }
      y -= 4;
    }
  }

  // The signatures.
  rule(12);
  kicker("Signatures");
  for (const b of g.sign) prose(b.text);
  const nameOk = printable(ink, sig.name);
  need(110);
  const colW = (W - 2 * M - 18) / 2;
  const top = y;
  page.drawRectangle({ x: M, y: top - 96, width: colW, height: 96, borderColor: LINE, borderWidth: 1 });
  page.drawRectangle({ x: M + colW + 18, y: top - 96, width: colW, height: 96, borderColor: LINE, borderWidth: 1 });
  const cell = (x0: number, lines: { t: string; size: number; font: PDFFont; color: ReturnType<typeof rgb> }[]) => {
    let yy = top - 12;
    for (const l of lines) {
      for (const w of wrap(ink, l.font, l.t, l.size, colW - 20).slice(0, 2)) {
        drawRuns(page, ink, l.font, w, { x: x0 + 10, y: yy - l.size, size: l.size, color: l.color });
        yy -= l.size * 1.4;
      }
    }
  };
  const shownName = nameOk ? sig.name : x.signer.email;
  const scriptSize = Math.min(20, Math.max(10, 20 * Math.min(1, (colW - 20) / Math.max(1, widthOf(ink, script, shownName, 20)))));
  cell(M, [
    { t: d.company || "The client", size: 8.5, font: body, color: MUTED },
    { t: shownName, size: scriptSize, font: script, color: INK },
    { t: `${sig.name}${d.to.title ? `, ${d.to.title}` : ""}`, size: 9.5, font: bold, color: INK },
    { t: `Signed ${stampWhen(sig.at)}`, size: 8.5, font: body, color: MUTED },
  ]);
  cell(M + colW + 18, [
    { t: "Prepared and sent by", size: 8.5, font: body, color: MUTED },
    { t: `${d.from.name}${d.from.title ? `, ${d.from.title}` : ""}`, size: 11, font: bold, color: INK },
    { t: `Sent ${stampWhen(x.sentAt)}`, size: 8.5, font: body, color: MUTED },
    { t: a.sender.email, size: 8.5, font: body, color: MUTED },
  ]);
  y = top - 108;
  if (choice) text(`Accepted: ${choice.summary}. Total: ${choice.total}.`, { size: 9.5, color: INK });

  // The audit trail, on a page of its own.
  newPage();
  text("Audit trail", { size: 20, font: bold, color: PINE, gap: 4 });
  text(d.title, { size: 12, font: bold, color: INK, gap: 2 });
  text(`Sent with Merlin, from Revenue Nomad. Proposal version ${d.version}, envelope ${x.id}. Times are UTC.`, { color: MUTED, size: 9.5, gap: 6 });
  rule(6);
  text("Fingerprints (SHA-256)", { size: 11, font: bold, color: INK, gap: 2 });
  text("The proposal as sent and signed (its text, options and parties):", { color: MUTED, size: 9.5 });
  text(x.hash, { font: mono, size: 8.5, gap: 4 });
  rule(6);
  text("Signer", { size: 11, font: bold, color: INK, gap: 2 });
  text(`${x.signer.name}${x.signer.title ? `, ${x.signer.title}` : ""} <${x.signer.email}>`, { font: bold, size: 9.5, color: INK, gap: 1 });
  text(`Signed ${stampWhen(sig.at)} by typing "${sig.name}". Email confirmed with a 6-digit code: ${sig.email}. IP ${sig.ip || "not recorded"}. Browser: ${sig.ua || "not recorded"}.`, { size: 9, indent: 12 });
  text(`Consent to sign electronically, version ${sig.consentVersion}. The document they signed: ${sig.hash}.`, { size: 9, indent: 12, color: MUTED });
  if (!nameOk) text(`Their name as typed has characters this file's fonts can't print, so the signature shows their email. The name as typed, in Unicode: ${codePoints(sig.name)}.`, { size: 9, indent: 12, color: MUTED });
  if (choice) text(`They chose ${choice.summary}. Total: ${choice.total}.`, { size: 9, indent: 12, gap: 2 });
  text("Sender", { size: 11, font: bold, color: INK, gap: 2 });
  text(`${a.sender.name}${a.sender.title ? `, ${a.sender.title}` : ""} <${a.sender.email}>. Sent ${stampWhen(x.sentAt)}.`, { size: 9.5, gap: 4 });
  rule(6);
  text("Everything, in order", { size: 11, font: bold, color: INK, gap: 2 });
  for (const e of x.events) text(`${stampWhen(e.at)}  ${EVENT_WORDS[e.kind] ?? e.kind}${e.note ? `: ${e.note}` : ""}${e.ip ? `  IP ${e.ip}` : ""}${e.ua ? `  ${e.ua}` : ""}`, { size: 8, color: BODY });
  rule(6);
  text(`The consent the signer agreed to (version ${a.consentVersion})`, { size: 11, font: bold, color: INK, gap: 2 });
  text(sig.consent, { size: 8, color: MUTED });
  rule(6);
  need(90);
  page.drawRectangle({ x: M, y: y - 82, width: W - 2 * M, height: 82, color: WASH });
  y -= 10;
  text("Sealed by Merlin", { size: 11, font: bold, color: PINE, indent: 10, gap: 1 });
  text(`Sealed ${stampWhen(sig.at)}. The SHA-256 of this file, with the 64 characters below read as zeros:`, { size: 8.5, color: MUTED, indent: 10 });
  need(14);
  await placeSeal(pdf, page, M + 10, y - 9, 8);
  y -= 14;
  text(`Any change to this file breaks the seal. Check this copy at ${a.checkUrl}: drop the PDF there to see whether it matches what was signed.`, { size: 8.5, color: INK, indent: 10, width: W - 2 * M - 20 });
  y -= 10;
  if (ink.lost) text("Some characters in this file (Chinese, Japanese or Korean, or emoji) are outside its fonts and print as ?. Merlin keeps every value exactly as typed.", { size: 8, color: MUTED });

  // Page numbers on every page.
  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(`${i + 1} of ${pages.length}`, { x: W - M - body.widthOfTextAtSize(`${i + 1} of ${pages.length}`, 8), y: 28, size: 8, font: body, color: MUTED }));
  const fin = finishSeal(await pdf.save({ useObjectStreams: false }));
  return { ...fin, pages: pages.length };
}
