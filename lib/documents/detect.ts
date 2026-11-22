/**
 * Reading a contract's signature blocks, so Merlin can place the fields itself (lib/documents/smart.ts).
 *
 * readPdfText: each page's text with where it sits, read with pdf.js (pdfjs-dist's Node build, the
 * same reader lib/proposals/templateParse.ts uses), as runs of text on one line, in shares of the
 * page as it is shown (rotation and crop box applied), from its top left: the same space a
 * DocField's x, y, w and h are in.
 *
 * findParties (pure): the lines labelled By, Signature, Signed, Name, Print name, Title, Its, Date
 * and their variants, followed by a colon, a line to write on, or nothing. Grouped into parties by
 * column (two blocks side by side), then by a label repeating or a gap (blocks stacked one above
 * the other). Each party's heading is the line just above its first label: a company's name, or
 * a role ("Company", "Client", "Consultant", "Contractor"), which the contract's own definitions
 * ("Cedar and Pine Software (the "Client")") turn into a name. A party needs a signature line.
 * Where a label already has its answer printed ("Name: Dana Whitfield"), that is who signs, and no
 * field goes over it.
 *
 * Nothing here is kept: the caller places fields from what it returns.
 */

/** A run of text on one line, in shares of the page as shown. */
export interface TextRun {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}
export interface PageText {
  /** The page as shown, in PDF points. */
  w: number;
  h: number;
  runs: TextRun[];
}

export type RowKind = "signature" | "name" | "title" | "date";

/** One labelled line of a signature block, and where its field goes (shares of its page). */
export interface FoundRow {
  kind: RowKind;
  /** The label as the contract writes it, like "By" or "Print name". */
  label: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The answer already printed after the label ("Dana Whitfield"): no field goes over it. */
  value?: string;
}

export interface FoundParty {
  /** The company or person this block is for, as the contract names it ("" when it doesn't). */
  org: string;
  /** "Client", "Consultant" and so on, when the heading or the contract's definitions say. */
  role: string | null;
  page: number;
  rows: FoundRow[];
  /** Printed in the block: who signs, their title, an email. */
  name?: string;
  title?: string;
  email?: string;
}

const PDF_LABELS: [RowKind, RegExp][] = [
  ["signature", /^(by|signature|signed|sign here|authori[sz]ed signature|signature of [a-z ]{2,30})\b/i],
  ["name", /^(name|print(?:ed)? name|full name|name \(print(?:ed)?\)|name \(please print\)|print)\b/i],
  ["title", /^(title|its|position|role|designation|capacity)\b/i],
  ["date", /^(date signed|dated|date)\b/i],
];
/** A label is followed by a colon, a line to write on, or nothing at all. */
const AFTER = /^\s*(?::|\.(?=\s|_|$)|(?=_)|$)/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const ROLE_WORDS = "company|client|consultant|contractor|customer|provider|service provider|vendor|agency|advisor|adviser|supplier|licensee|licensor";
const ROLE_HEAD = new RegExp(`^(?:the\\s+)?(${ROLE_WORDS})\\b\\s*[:,–—-]?\\s*(.*)$`, "i");
const ROLE_PAREN = new RegExp(`\\(\\s*(?:the\\s+|hereinafter\\s+)?["“‘']?(${ROLE_WORDS})["”’']?\\s*\\)`, "i");
const ROLE_DEF = new RegExp(`([A-Z][A-Za-z0-9&.,'’ -]{2,90}?)\\s*,?\\s*\\(\\s*(?:the\\s+|hereinafter\\s+(?:the\\s+)?|together,?\\s+)?["“‘']?(${ROLE_WORDS})["”’']?\\s*\\)`, "gi");
const SENTENCE_END = /[.;]\s*$/;

/** The label a run starts with, what comes after it, and where the label ends. */
export function labelOf(text: string): { kind: RowKind; label: string; rest: string; end: number } | null {
  const t = text.replace(/\s+/g, " ").trim();
  for (const [kind, re] of PDF_LABELS) {
    const m = t.match(re);
    if (!m) continue;
    const after = t.slice(m[0].length);
    if (!AFTER.test(after)) continue;
    const rest = after.replace(/^\s*[:.]?/, "");
    const value = rest.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    // A sentence that starts with "Date" or "By" is the contract's text, not a line to sign on.
    if (value.length > 60 || (value && SENTENCE_END.test(value) && value.split(" ").length > 6)) return null;
    return { kind, label: m[0].replace(/\b\w/, (c) => c.toUpperCase()), rest, end: m[0].length };
  }
  return null;
}

const titleCase = (s: string) => s.replace(/\b([a-z])([a-z]*)/gi, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase());
/** A heading in capitals reads as a name: "CEDAR AND PINE SOFTWARE, INC." is "Cedar And Pine Software, Inc.", with small words small. */
function nameCase(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return s;
  return titleCase(s).replace(/\b(And|Of|The|For|In|On|At)\b/g, (w, _x, i: number) => (i === 0 ? w : w.toLowerCase())).replace(/\b(Llc|Lp|Llp|Pc)\b/g, (w) => w.toUpperCase());
}
const roleName = (r: string) => titleCase(r.toLowerCase());

/** The contract's own definitions: "Cedar and Pine Software, Inc. (the "Client")" gives Client is Cedar and Pine Software, Inc. */
export function definitions(allText: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of allText.matchAll(ROLE_DEF)) {
    const role = m[2].toLowerCase();
    // "This Agreement is made between Cedar and Pine Software, Inc., a Delaware corporation" keeps the name alone.
    const name = m[1]
      .replace(/^.*?\b(?:by and between|between|made by|entered into by)\s+/i, "")
      .replace(/^and\s+/i, "")
      .replace(/,\s*an?\s+[A-Za-z][\w\s-]*(?:corporation|company|partnership|limited liability company)\s*$/i, "")
      .trim()
      .replace(/[,\s]+$/, "");
    if (name.length >= 2 && !out.has(role)) out.set(role, name);
  }
  return out;
}

/** The heading above a block: its company and its role. */
function headingOf(text: string, defs: Map<string, string>): { org: string; role: string | null } {
  let t = text.replace(/\s+/g, " ").trim().replace(/[:\s]+$/, "");
  let role: string | null = null;
  const paren = t.match(ROLE_PAREN);
  if (paren) (role = paren[1].toLowerCase()), (t = t.replace(ROLE_PAREN, "").trim().replace(/[,:\s]+$/, ""));
  const head = t.match(ROLE_HEAD);
  if (head) {
    role = head[1].toLowerCase();
    t = head[2].trim();
  }
  const org = t || (role ? defs.get(role) ?? "" : "");
  return { org: nameCase(org.replace(/^["“']|["”']$/g, "").trim()), role: role ? roleName(role) : null };
}

const isLine = (t: string) => /^[_\s.]{4,}$/.test(t) && /_{3,}/.test(t);
const overlaps = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -0.01;

/** Default field sizes, as shares of a portrait Letter page (lib/documents/types.ts FIELD_SIZE). */
const KIND_H: Record<RowKind, number> = { signature: 0.05, name: 0.03, title: 0.03, date: 0.03 };
const KIND_W: Record<RowKind, number> = { signature: 0.3, name: 0.28, title: 0.24, date: 0.18 };

interface LabelHit {
  run: TextRun;
  kind: RowKind;
  label: string;
  value: string;
  /** Where the line to write on starts, and ends. */
  lineX0: number | null;
  lineX1: number | null;
  /** The field sits on a line under the label's own line (a block written as a rule, then "Signature" under it). */
  above?: TextRun;
}

/** The parties a contract's signature blocks name, page by page. */
export function findParties(pages: PageText[]): FoundParty[] {
  const allText = pages.map((p) => p.runs.map((r) => r.text).join(" ")).join("\n");
  const defs = definitions(allText);
  const out: FoundParty[] = [];
  pages.forEach((pg, page) => {
    const hits: LabelHit[] = [];
    for (const run of pg.runs) {
      const l = labelOf(run.text);
      if (!l) continue;
      const t = run.text.replace(/\s+/g, " ").trim();
      const u = t.indexOf("_", l.end);
      const span = run.x1 - run.x0;
      const at = (i: number) => run.x0 + (span * i) / Math.max(1, t.length);
      const value = l.rest.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
      const hit: LabelHit = { run, kind: l.kind, label: l.label, value, lineX0: u >= 0 ? at(u) : null, lineX1: u >= 0 ? at(t.lastIndexOf("_") + 1) : null };
      if (u < 0 && !value) {
        // A rule to write on just above the label, or just to its right on the same line.
        const above = pg.runs.find((r) => r !== run && isLine(r.text) && r.bottom <= run.top + 0.004 && run.top - r.bottom < 0.035 && overlaps(r, run));
        const right = pg.runs.find((r) => r !== run && isLine(r.text) && Math.abs(r.bottom - run.bottom) < 0.008 && r.x0 >= run.x1 - 0.005 && r.x0 - run.x1 < 0.08);
        if (right) (hit.lineX0 = right.x0), (hit.lineX1 = right.x1);
        else if (above) (hit.above = above), (hit.lineX0 = above.x0), (hit.lineX1 = above.x1);
      }
      hits.push(hit);
    }
    if (!hits.some((h) => h.kind === "signature")) return;

    // Columns: labels that start well apart across the page are separate blocks side by side.
    const sorted = [...hits].sort((a, b) => a.run.x0 - b.run.x0);
    const cols: LabelHit[][] = [];
    for (const h of sorted) {
      const c = cols.find((col) => Math.abs(col[0].run.x0 - h.run.x0) < 0.18);
      if (c) c.push(h);
      else cols.push([h]);
    }
    cols.sort((a, b) => a[0].run.x0 - b[0].run.x0);
    cols.forEach((col, ci) => {
      const left = Math.min(...col.map((h) => h.run.x0));
      const right = ci + 1 < cols.length ? Math.min(...cols[ci + 1].map((h) => h.run.x0)) - 0.03 : 0.94;
      const rowsTop = (h: LabelHit) => (h.above ? h.above.top : h.run.top);
      col.sort((a, b) => rowsTop(a) - rowsTop(b));
      // Blocks stacked in one column: a new one where a label comes round again, or after a gap.
      const groups: LabelHit[][] = [];
      for (const h of col) {
        const g = groups[groups.length - 1];
        const prev = g?.[g.length - 1];
        const repeats = g?.some((x) => x.kind === h.kind) ?? false;
        const gap = prev ? rowsTop(h) - prev.run.bottom : 0;
        if (!g || repeats || gap > 0.09) groups.push([h]);
        else g.push(h);
      }
      for (const g of groups) {
        if (!g.some((h) => h.kind === "signature")) continue;
        const firstTop = Math.min(...g.map(rowsTop));
        const lastBottom = Math.max(...g.map((h) => h.run.bottom));
        // The heading: the nearest line above the block, in its column, that isn't a label, a rule or a sentence.
        const heads = pg.runs
          .filter((r) => r.bottom <= firstTop + 0.002 && firstTop - r.bottom < 0.12 && r.x0 >= left - 0.06 && r.x0 < right && !labelOf(r.text) && !isLine(r.text) && r.text.trim().length >= 2 && r.text.length <= 90 && !(SENTENCE_END.test(r.text) && r.text.split(/\s+/).length > 8))
          .sort((a, b) => b.bottom - a.bottom);
        const head = heads[0] ? headingOf(heads[0].text, defs) : { org: "", role: null };
        const party: FoundParty = { org: head.org, role: head.role, page, rows: [] };
        // An email printed in the block, or just under it.
        const mail = pg.runs.find((r) => EMAIL.test(r.text) && r.top >= firstTop - 0.01 && r.top <= lastBottom + 0.05 && r.x0 >= left - 0.06 && r.x0 < right);
        if (mail) party.email = mail.text.match(EMAIL)![0].toLowerCase();
        g.forEach((h, i) => {
          if (h.value) {
            if (h.kind === "name" && !EMAIL.test(h.value) && !/^\/s\//.test(h.value)) party.name = h.value;
            if (h.kind === "title") party.title = h.value;
            party.rows.push({ kind: h.kind, label: h.label, page, x: 0, y: 0, w: 0, h: 0, value: h.value });
            return;
          }
          // The line the field sits on, and how much room there is above it.
          const base = h.above ?? h.run;
          const prevBottom = i > 0 ? (g[i - 1].above ?? g[i - 1].run).bottom : heads[0] ? heads[0].bottom : base.top - KIND_H[h.kind];
          const room = Math.max(0.018, base.bottom - prevBottom - 0.004);
          const fh = Math.min(KIND_H[h.kind] * (792 / pg.h), room);
          const x = h.lineX0 ?? Math.min(h.run.x1 + 0.01, right - 0.1);
          const end = h.lineX1 && h.lineX1 - x >= 0.1 ? h.lineX1 : Math.min(right, x + KIND_W[h.kind] * (612 / pg.w));
          const w = Math.max(0.08, Math.min(0.9, end - x));
          const bottom = base.bottom + 0.003;
          party.rows.push({ kind: h.kind, label: h.label, page, x: clamp(x, 0, 1 - w), y: clamp(bottom - fh, 0, 1 - fh), w, h: fh });
        });
        out.push(party);
      }
    });
  });
  // The same company named twice is one party (a block's heading and a second page): keep both blocks apart, in order.
  return out.sort((a, b) => a.page - b.page || a.rows[0].x - b.rows[0].x || a.rows[0].y - b.rows[0].y);
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Every email the contract prints, lowercased, in order. */
export const emailsIn = (pages: PageText[]) => [...new Set(pages.flatMap((p) => p.runs.flatMap((r) => (r.text.match(new RegExp(EMAIL.source, "g")) ?? []).map((x) => x.toLowerCase()))))];

/* ---------- reading the PDF ---------- */

interface PdfItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/** Each page's text as runs, in shares of the page as shown. Pages after `maxPages` are left out. */
export async function readPdfText(bytes: Uint8Array, maxPages = 60): Promise<PageText[]> {
  const pdfjs = await (await import("./pdfjsNode")).pdfjsNode();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: PageText[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const W = vp.width;
      const H = vp.height;
      const tc = await page.getTextContent();
      const boxes: { text: string; x0: number; x1: number; top: number; bottom: number; base: number }[] = [];
      for (const it of tc.items as PdfItem[]) {
        if (typeof it.str !== "string" || !it.str.trim()) continue;
        const [a, b, , , e, f] = it.transform;
        const len = Math.hypot(a, b) || 1;
        const ux = a / len;
        const uy = b / len;
        const hgt = Math.abs(it.height) || len;
        const pts = [
          [e, f],
          [e + ux * it.width, f + uy * it.width],
          [e - uy * hgt, f + ux * hgt],
          [e + ux * it.width - uy * hgt, f + uy * it.width + ux * hgt],
        ].map(([x, y]) => vp.convertToViewportPoint(x, y) as [number, number]);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const base = vp.convertToViewportPoint(e, f)[1] as number;
        boxes.push({ text: it.str, x0: Math.min(...xs) / W, x1: Math.max(...xs) / W, top: Math.min(...ys) / H, bottom: Math.max(...ys) / H, base: base / H });
      }
      // Runs: boxes on one baseline, joined left to right while the gap between them is small.
      boxes.sort((p, q) => p.base - q.base || p.x0 - q.x0);
      const runs: TextRun[] = [];
      let line: typeof boxes = [];
      const flush = () => {
        line.sort((p, q) => p.x0 - q.x0);
        let cur: TextRun | null = null;
        for (const bx of line) {
          const charW = (bx.x1 - bx.x0) / Math.max(1, bx.text.length);
          if (cur && bx.x0 - cur.x1 < Math.max(0.03, charW * 4)) {
            cur.text += (bx.x0 - cur.x1 > charW * 0.3 && !/\s$/.test(cur.text) ? " " : "") + bx.text;
            cur.x1 = Math.max(cur.x1, bx.x1);
            cur.top = Math.min(cur.top, bx.top);
            cur.bottom = Math.max(cur.bottom, bx.bottom);
          } else {
            if (cur) runs.push(cur);
            cur = { text: bx.text, x0: bx.x0, x1: bx.x1, top: bx.top, bottom: bx.bottom };
          }
        }
        if (cur) runs.push(cur);
        line = [];
      };
      for (const bx of boxes) {
        if (line.length && Math.abs(bx.base - line[0].base) > 0.004) flush();
        line.push(bx);
      }
      flush();
      for (const r of runs) r.text = r.text.replace(/\s+/g, " ").trim();
      pages.push({ w: W, h: H, runs: runs.filter((r) => r.text) });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
