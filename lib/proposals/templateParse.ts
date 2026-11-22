/**
 * A member's own past proposal or SOW, read into blocks for "My templates": each section heading
 * becomes a block's title, the text under it the block's body. It reads .docx (a small zip and
 * XML reader: Word's own Heading and Title styles, list paragraphs as "- " bullets), .pdf (text
 * with pdfjs-dist; a line set larger than the body text, or a short line in capitals, is a
 * heading), .md (# headings) and .txt (short lines in capitals, numbered or ending with a colon).
 *
 * Server-side only (node:zlib, pdfjs-dist's Node build). Nothing is kept here: the caller stores
 * the blocks as the member's template (lib/proposals/mine.ts).
 */
import { inflateRawSync } from "node:zlib";
import { BLOCKS } from "./library";

export interface ParsedSection {
  title: string;
  body: string;
  /** The library block it reads as, or "custom". */
  blockId: string;
}
export interface ParsedTemplate {
  title: string;
  sections: ParsedSection[];
  /** Characters of text read. */
  chars: number;
}

export const TEMPLATE_TYPES = [".docx", ".pdf", ".md", ".txt"] as const;
/** The largest file read, and the most text kept from it. */
export const TEMPLATE_MAX_BYTES = 5 * 1024 * 1024;
export const TEMPLATE_MAX_CHARS = 60_000;
const MAX_SECTIONS = 40;
const SECTION_CHARS = 8000;

export class TemplateProblem extends Error {}

/* ---------- which library block a heading reads as ---------- */

/** Checked in this order: the more specific headings ("Out of scope", "Payment schedule") before the general ones ("scope", "pricing"). */
const KEYWORDS: [RegExp, string][] = [
  [/\baddendum\b/i, "addendum_header"],
  [/\b(out of scope|exclusions?|not included)\b/i, "out_of_scope"],
  [/\b(payment schedule|payment terms|invoic|billing)\b/i, "payment_schedule"],
  [/\b(next steps?|getting started|how to proceed)\b/i, "next_steps"],
  [/\b(next phases?|future phases?|later phases?)\b/i, "future_phases"],
  [/\b(the math|business case|roi|economics)\b/i, "the_math"],
  [/\b(why now|the moment|urgency)\b/i, "why_now"],
  [/\b(why fractional|why us)\b/i, "why_fractional"],
  [/\b(role profile|candidate|selection)\b/i, "role_profile"],
  [/\b(what we heard|background|situation|context|current state|challenges?)\b/i, "what_we_heard"],
  [/\b(diagnosis|assessment|findings|our view)\b/i, "diagnosis"],
  [/\b(milestones?|timeline|30.?60.?90|roadmap)\b/i, "milestones"],
  [/\b(success|kpis?|measures|outcomes)\b/i, "success_measures"],
  [/\b(cadence|communication|meetings|governance)\b/i, "operating_cadence"],
  [/\b(reporting|reports to)\b/i, "reporting_structure"],
  [/\b(assumptions?|dependencies|responsibilities|client obligations)\b/i, "assumptions"],
  [/\b(proof|case stud|experience|about (?:me|us)|credentials|references)\b/i, "proof"],
  [/\b(team|rates?|staffing)\b/i, "team_rates"],
  [/\b(investment|pricing|fees?|price|compensation|cost|commercials?)\b/i, "investment"],
  [/\b(scope|workstreams?|phases?|deliverables?|activities|plan of work|services)\b/i, "phases_workstreams"],
  [/\b(recommend|approach|solution|our plan)\b/i, "recommendation"],
  [/\b(terms|conditions|legal|confidential|agreement)\b/i, "terms"],
  [/\b(signatures?|signed|acceptance|authori[sz]ation|approval)\b/i, "signature"],
  [/\b(cover|introduction|overview|summary|executive summary)\b/i, "cover"],
];

/** The library block a heading reads as, or "custom". */
export function blockFor(heading: string): string {
  const t = heading.trim();
  for (const [re, id] of KEYWORDS) if (re.test(t) && BLOCKS.some((b) => b.id === id)) return id;
  return "custom";
}

/* ---------- shared clean-up ---------- */

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(CTRL, "").replace(/[ \t ]+/g, " ");
const tidyTitle = (s: string) =>
  clean(s)
    .replace(/^#+\s*/, "")
    .replace(/^(\d+(\.\d+)*[.)]?|[IVX]+\.)\s+/, "")
    .replace(/[:\s]+$/, "")
    .replace(/\*+/g, "")
    .trim()
    .slice(0, 120);

/** Lines of [heading?, text] into sections. Text before the first heading becomes the cover. */
function toSections(lines: { text: string; heading: boolean }[], fallbackTitle: string): ParsedTemplate {
  const out: ParsedSection[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  let title = "";
  const push = () => {
    if (!cur) return;
    const body = cur.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, SECTION_CHARS);
    if (cur.title || body) out.push({ title: cur.title || "Introduction", body, blockId: blockFor(cur.title || "Introduction") });
  };
  for (const l of lines) {
    const t = clean(l.text).trimEnd();
    if (l.heading && t.trim()) {
      if (!title && !out.length && (!cur || !cur.lines.join("").trim())) title = tidyTitle(t);
      push();
      cur = { title: tidyTitle(t), lines: [] };
    } else {
      cur ??= { title: "", lines: [] };
      cur.lines.push(t);
    }
  }
  push();
  // The document's own title (its first heading, alone at the top) is not a section of its own.
  if (out.length > 1 && out[0].title === title && !out[0].body) out.shift();
  const sections = out.filter((s) => s.title || s.body).slice(0, MAX_SECTIONS);
  const chars = sections.reduce((n, s) => n + s.title.length + s.body.length, 0);
  if (!sections.length || chars < 40) throw new TemplateProblem("We couldn't find any text in that file. If it's a scan, save it as a Word document first.");
  return { title: title || fallbackTitle, sections, chars };
}

/* ---------- .md and .txt ---------- */

export function parseMarkdown(text: string, name = "My template"): ParsedTemplate {
  const lines = clean(text)
    .slice(0, TEMPLATE_MAX_CHARS)
    .split("\n")
    .map((l) => {
      const h = l.match(/^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/);
      if (h) return { text: h[2], heading: true };
      return { text: l.replace(/^\s*[*+]\s+/, "- ").replace(/\*\*([^*]+)\*\*/g, "$1"), heading: false };
    });
  return toSections(lines, name);
}

const looksLikeHeading = (l: string, next: string | undefined) => {
  const t = l.trim();
  if (!t || t.length > 70 || /[.,;]$/.test(t) || /^[-*•]/.test(t)) return false;
  const words = t.split(/\s+/).length;
  if (words > 9) return false;
  if (/^(\d+(\.\d+)*[.)]|[IVX]+\.)\s+\S/.test(t)) return true;
  if (/:$/.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && letters === letters.toUpperCase()) return true;
  // A short Title Case line with text after it.
  return !!next?.trim() && words <= 6 && t.split(/\s+/).every((w) => /^[A-Z0-9&(]/.test(w) || /^(and|or|of|the|to|for|a|an|in|on|with)$/.test(w));
};

export function parseText(text: string, name = "My template"): ParsedTemplate {
  if (/^\s{0,3}#{1,4}\s+\S/m.test(text)) return parseMarkdown(text, name);
  const raw = clean(text).slice(0, TEMPLATE_MAX_CHARS).split("\n");
  const lines = raw.map((l, i) => ({ text: l.replace(/^\s*[•*]\s+/, "- "), heading: looksLikeHeading(l, raw.slice(i + 1).find((x) => x.trim())) }));
  return toSections(lines, name);
}

/* ---------- .docx: a small zip reader and Word's XML ---------- */

/** The files in a zip, by name (stored or deflated entries only). */
export function unzip(buf: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // The end of central directory record: within the last 64 KB plus its 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) (eocd = i), (i = -1);
  if (eocd < 0) throw new TemplateProblem("That .docx didn't open. Save it again from Word or Google Docs and try once more.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name) || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: 20 * 1024 * 1024 }));
  }
  return out;
}

const XML_ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : XML_ENT[e.toLowerCase()] ?? ""));

export function parseDocx(buf: Buffer, name = "My template"): ParsedTemplate {
  const files = unzip(buf, (n) => n === "word/document.xml" || n === "word/styles.xml" || n === "docProps/core.xml");
  const doc = files.get("word/document.xml")?.toString("utf8");
  if (!doc) throw new TemplateProblem("That .docx has no document in it. Save it again from Word or Google Docs.");
  // Style ids whose name is a heading or a title (Word may name them "Heading1", or by locale).
  const headingStyles = new Set<string>();
  const styles = files.get("word/styles.xml")?.toString("utf8") ?? "";
  for (const m of styles.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const nm = m[2].match(/<w:name w:val="([^"]+)"/)?.[1] ?? "";
    if (/^(heading \d|title|subtitle)$/i.test(nm) || /<w:outlineLvl w:val="[0-3]"/.test(m[2])) headingStyles.add(m[1]);
  }
  const lines: { text: string; heading: boolean }[] = [];
  for (const m of doc.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const p = m[1] ?? "";
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = unxml([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr)\/>/g)].map((x) => (x[2] === "tab" ? "\t" : x[2] ? "\n" : x[1])).join(""));
    const heading = headingStyles.has(style) || /^(Heading\d|Title|Subtitle)$/i.test(style) || /<w:outlineLvl w:val="[0-3]"/.test(p);
    const list = /<w:numPr>/.test(p);
    // A short paragraph that is bold all through, with no style, reads as a heading too.
    const runs = [...p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].map((r) => r[1]).filter((r) => /<w:t[ >]/.test(r));
    const allBold = !heading && runs.length > 0 && runs.every((r) => /<w:b\/>|<w:b w:val="(1|true|on)"\/>/.test(r)) && text.trim().length <= 70 && !/[.,;]$/.test(text.trim());
    lines.push({ text: list ? `- ${text.trim()}` : text, heading: heading || allBold });
  }
  const core = files.get("docProps/core.xml")?.toString("utf8") ?? "";
  const docTitle = unxml(core.match(/<dc:title>([^<]*)<\/dc:title>/)?.[1] ?? "").trim();
  const t = toSections(lines, docTitle || name);
  return docTitle ? { ...t, title: docTitle.slice(0, 120) } : t;
}

/* ---------- .pdf: text with pdfjs-dist ---------- */

interface PdfItem {
  str: string;
  transform: number[];
  height: number;
  fontName?: string;
}

export async function parsePdf(buf: Buffer, name = "My template"): Promise<ParsedTemplate> {
  const pdfjs = await (await import("../documents/pdfjsNode")).pdfjsNode();
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new TemplateProblem((e as Error)?.name === "PasswordException" ? "That PDF has a password. Save a copy without one and try again." : "That PDF didn't open. Save it as a Word document and upload that instead.");
  }
  const rows: { text: string; size: number; bold: boolean }[] = [];
  const pages = Math.min(doc.numPages, 60);
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const styles = (tc as unknown as { styles: Record<string, { fontFamily?: string }> }).styles ?? {};
    const items = (tc.items as PdfItem[]).filter((i) => typeof i.str === "string");
    let line: PdfItem[] = [];
    const flush = () => {
      const text = line.map((i) => i.str).join("").replace(/\s+/g, " ").trim();
      if (text) {
        const size = Math.max(...line.map((i) => Math.abs(i.height) || Math.hypot(i.transform[2], i.transform[3])));
        const bold = line.every((i) => /bold|black|heavy|semibold/i.test(`${i.fontName ?? ""} ${styles[i.fontName ?? ""]?.fontFamily ?? ""}`));
        rows.push({ text, size, bold });
      }
      line = [];
    };
    let y: number | null = null;
    for (const it of items) {
      const iy = it.transform[5];
      if (y !== null && Math.abs(iy - y) > 2) flush();
      if (it.str || line.length) line.push(it);
      y = iy;
      if ((it as unknown as { hasEOL?: boolean }).hasEOL) flush(), (y = null);
    }
    flush();
    rows.push({ text: "", size: 0, bold: false });
    page.cleanup();
  }
  await task.destroy();
  const sized = rows.filter((r) => r.text);
  if (!sized.length) throw new TemplateProblem("We couldn't find any text in that PDF. If it's a scan, upload a Word document instead.");
  // The body size: the size most of the text is set in.
  const weight = new Map<number, number>();
  for (const r of sized) weight.set(Math.round(r.size * 2) / 2, (weight.get(Math.round(r.size * 2) / 2) ?? 0) + r.text.length);
  const body = [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const lines = rows.map((r) => {
    const short = r.text.length <= 80 && !/[.,;]$/.test(r.text);
    const caps = r.text.replace(/[^A-Za-z]/g, "").length >= 3 && r.text === r.text.toUpperCase() && r.text.split(/\s+/).length <= 8;
    return { text: r.text.replace(/^[•●▪◦]\s*/, "- "), heading: !!r.text && short && (r.size >= body * 1.15 || (r.bold && r.size >= body * 0.95 && r.text.split(/\s+/).length <= 8) || caps) };
  });
  return toSections(lines, name);
}

/** Read a file by its name's type. */
export async function parseTemplateFile(fileName: string, buf: Buffer): Promise<ParsedTemplate> {
  const lower = fileName.toLowerCase();
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 100) || "My template";
  if (buf.length > TEMPLATE_MAX_BYTES) throw new TemplateProblem("That file is over 5 MB. Upload a smaller copy, or just the text.");
  if (lower.endsWith(".docx")) {
    if (buf.readUInt32LE(0) !== 0x04034b50) throw new TemplateProblem("That isn't a .docx file. Save it again from Word or Google Docs.");
    return parseDocx(buf, base);
  }
  if (lower.endsWith(".pdf")) {
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new TemplateProblem("That isn't a PDF.");
    return parsePdf(buf, base);
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return parseMarkdown(buf.toString("utf8"), base);
  if (lower.endsWith(".txt")) return parseText(buf.toString("utf8"), base);
  if (lower.endsWith(".doc")) throw new TemplateProblem("Old .doc files don't read here. Save it as .docx or PDF and try again.");
  throw new TemplateProblem("Upload a .docx, .pdf, .md or .txt file.");
}
