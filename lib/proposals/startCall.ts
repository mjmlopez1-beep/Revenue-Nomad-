/**
 * "Start a proposal from the call", without a model: plain rules the app (ProposalStart.tsx) and
 * the connector (draft_proposal_from_call) share.
 *
 *  - readTerms: what was agreed, as the proposal's fields: the monthly fee, a fixed fee, the first
 *    term in months, days of notice, the time it covers ("two days a week"), a start date. Only
 *    what the text says outright; a hedge ("around two days a week") is kept as a thing to check.
 *    Anything the call didn't settle stays a labelled blank in the draft, never guessed.
 *  - bestTemplate: the template that best fits what was asked for (an assessment first, a
 *    retainer, a program with phases), the member's own first on a tie.
 *  - docxText: a .docx transcript's text, read in the browser (or Node) with the platform's own
 *    inflate, so the transcript never has to leave the browser.
 *
 * Pure: no imports beyond types.
 */
import type { TemplateChoice } from "./types";

export interface AgreedTerms {
  /** Field keys and values, as the proposal's {{keys}} take them. */
  fields: Record<string, string>;
  /** Where the words were loose: "They said "around two days a week". The draft says 2 days a week." */
  checks: string[];
}

const WORDN: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, "forty-five": 45, sixty: 60, ninety: 90 };
const n = (s: string) => WORDN[s.toLowerCase()] ?? Number(s);
const NUM = "(\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty-five|sixty|ninety)";
const AMOUNT = "\\$\\s?(\\d[\\d,]*(?:\\.\\d+)?)\\s?(k|K|m|M)?";
const HEDGE = /\b(around|about|roughly|maybe|probably|ish|or so|give or take|something like|at least|up to)\b/i;
const usd = (raw: string, unit?: string) => {
  const v = Number(raw.replace(/,/g, "")) * (unit?.toLowerCase() === "k" ? 1000 : unit?.toLowerCase() === "m" ? 1_000_000 : 1);
  return `$${Math.round(v).toLocaleString("en-US")}`;
};
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** What the text says was agreed, as fields, and the loose words to check. */
export function readTerms(text: string): AgreedTerms {
  const fields: Record<string, string> = {};
  const checks: string[] = [];
  const sentences = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const set = (k: string, v: string, s: string, said: RegExp) => {
    if (fields[k]) return;
    fields[k] = v;
    const m = s.match(said);
    const at = m?.index ?? 0;
    if (m && HEDGE.test(s.slice(Math.max(0, at - 20), at + m[0].length + 6))) {
      // The words as said, from the hedge before them when there is one.
      const from = at > 12 ? s.slice(at - 12, at + m[0].length).replace(/^\S*\s/, "") : s.slice(0, at + m[0].length);
      checks.push(`They said "${from.trim().replace(/^./, (c) => c.toLowerCase())}". The draft says ${v}.`);
    }
  };
  for (const s of sentences) {
    const monthly = s.match(new RegExp(`${AMOUNT}\\s*(?:a|per|\\/|each)\\s*(?:month|mo)\\b|${AMOUNT}\\s*monthly|monthly (?:fee|retainer|rate) (?:of|is|at)\\s*${AMOUNT}`, "i"));
    if (monthly) {
      const [raw, unit] = monthly[1] ? [monthly[1], monthly[2]] : monthly[3] ? [monthly[3], monthly[4]] : [monthly[5], monthly[6]];
      if (/\b(after|from|then|drops? to|steps? down|month (?:4|four))\b/i.test(s.slice(0, monthly.index)) && fields["pricing.monthlyFee"]) set("pricing.stepDownFee", usd(raw, unit), s, new RegExp(AMOUNT, "i"));
      else set("pricing.monthlyFee", usd(raw, unit), s, new RegExp(AMOUNT, "i"));
    }
    const fixed = s.match(new RegExp(`${AMOUNT}\\s*(?:fixed|flat|one[- ]time|up front|upfront)|(?:fixed|flat|one[- ]time) (?:fee|price) (?:of|is|at)\\s*${AMOUNT}`, "i"));
    if (fixed) set("pricing.fixedFee", usd(fixed[1] ?? fixed[3], fixed[1] ? fixed[2] : fixed[4]), s, new RegExp(AMOUNT, "i"));
    const term = s.match(new RegExp(`\\b${NUM}[- ]month (?:term|contract|engagement|commitment|retainer)|(?:term|contract|engagement|commitment) (?:of|for|is)\\s*${NUM} months?|\\bfor (?:the first )?${NUM} months\\b`, "i"));
    if (term) set("term.initialMonths", String(n(term[1] ?? term[2] ?? term[3])), s, /\d+|\b(one|two|three|four|five|six|twelve)\b/i);
    const notice = s.match(new RegExp(`\\b${NUM}\\s*days?(?:'|’)?\\s*(?:written\\s*)?notice|notice (?:of|period of)\\s*${NUM}\\s*days`, "i"));
    if (notice) set("term.noticeDays", String(n(notice[1] ?? notice[2])), s, /\d+\s*days?|\b(thirty|sixty|ninety)\s*days?/i);
    const alloc = s.match(new RegExp(`\\b${NUM}\\s*(days|hours)\\s*(?:a|per|each)\\s*week\\b`, "i"));
    if (alloc) set("pricing.allocation", `${n(alloc[1])} ${n(alloc[1]) === 1 ? alloc[2].replace(/s$/, "") : alloc[2]} a week`, s, new RegExp(`(?:around |about |roughly )?${NUM}\\s*(days|hours)\\s*(?:a|per|each)\\s*week`, "i"));
    const start = s.match(new RegExp(`\\bstart(?:s|ing)?\\s*(?:on|by|from)?\\s*((?:${MONTHS.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS.join("|")}))`, "i"));
    if (start) set("start.date", start[1].replace(/\b[a-z]/, (c) => c.toUpperCase()).replace(/(\d)(st|nd|rd|th)\b/, "$1"), s, new RegExp(start[1], "i"));
  }
  return { fields, checks: checks.slice(0, 4) };
}

/** Words that say what kind of engagement was asked for, and the template words that fit them. */
const SHAPES: [RegExp, RegExp][] = [
  [/\b(assessment|diagnostic|audit|evaluate|review first|look under the hood|opt[- ]?in)\b/i, /\b(assessment|diagnostic|audit|opt[- ]?in|sprint)\b/i],
  [/\b(phase|phases|two stages|stage one|roadmap|program|transformation|workstreams?)\b/i, /\b(phase|program|transformation|workstream|sow)\b/i],
  [/\b(retainer|ongoing|monthly|fractional|part[- ]time|days a week|hours a week)\b/i, /\b(fractional|retainer|monthly|leader|sow)\b/i],
  [/\b(hire|hiring|recruit|build the team|first vp|first sales hire)\b/i, /\b(hire|hiring|recruit|team|interim)\b/i],
  [/\b(interim|cover|maternity|leave|gap)\b/i, /\binterim\b/i],
];

/** The template that fits the call best, and how strongly (0: no signal). */
export function bestTemplate(templates: TemplateChoice[], text: string, used: Record<string, number> = {}): { id: string | null; score: number } {
  const open = templates.filter((t) => t.open);
  if (!open.length) return { id: null, score: 0 };
  let best: { id: string; score: number } = { id: open[0].id, score: -1 };
  for (const t of open) {
    const about = `${t.title} ${t.about}`;
    let score = 0;
    for (const [said, fits] of SHAPES) if (said.test(text) && fits.test(about)) score += 2;
    if (t.mine) score += 0.5;
    score += Math.min(1, (used[t.id] ?? 0) / 6);
    if (score > best.score) best = { id: t.id, score };
  }
  return best;
}

/* ---------- .docx ---------- */

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const XML_ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : XML_ENT[e.toLowerCase()] ?? ""));

/** A .docx's text, one paragraph a line. `inflateRaw` is the platform's (DecompressionStream in a browser, zlib in Node). */
export async function docxText(bytes: Uint8Array, inflateRaw: (data: Uint8Array) => Promise<Uint8Array>): Promise<string> {
  if (u32(bytes, 0) !== 0x04034b50) throw new Error("That isn't a .docx file. Save it again from Word or Google Docs.");
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--)
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("That .docx didn't open. Save it again from Word or Google Docs.");
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  for (let k = 0; k < count && p + 46 <= bytes.length; k++) {
    if (u32(bytes, p) !== 0x02014b50) break;
    const method = u16(bytes, p + 10);
    const csize = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28);
    const local = u32(bytes, p + 42);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + u16(bytes, p + 30) + u16(bytes, p + 32);
    if (name !== "word/document.xml") continue;
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const data = bytes.subarray(start, start + csize);
    const xml = new TextDecoder().decode(method === 0 ? data : await inflateRaw(data));
    const lines: string[] = [];
    for (const m of xml.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g))
      lines.push(unxml([...(m[1] ?? "").matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr)\/>/g)].map((x) => (x[2] === "tab" ? "\t" : x[2] ? "\n" : x[1])).join("")));
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  throw new Error("That .docx has no document in it. Save it again from Word or Google Docs.");
}

/** The browser's own inflate, for docxText. */
export async function browserInflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/* ---------- who signs, and the client's website, from the call ---------- */

const SIGNER_TITLE = /\b(CEO|CFO|COO|CTO|CRO|CMO|CPO|Chief [A-Z][a-z]+(?: [A-Z][a-z]+)? Officer|Founder|Co-founder|Cofounder|President|Managing Director|General Manager|Owner|VP(?: of)? [A-Z][A-Za-z]+|Vice President(?: of)? [A-Z][A-Za-z]+|Head of [A-Z][A-Za-z]+)\b/;
const PERSON = "([A-Z][a-z'’-]+(?: [A-Z][a-z'’-]+){1,2})";
const EMAIL_G = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Mail hosts many people share: an address there says nothing about the company. */
export const SHARED_MAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|hey|fastmail|zoho|gmx|mail|yandex)\./i;

/**
 * Who signs, from the call: a name beside a title ("Brian Hain, VP of Operations", "CEO Dana
 * Whitfield", "I'm Dana, the CEO" is not enough: a full name is needed), not the member. Their
 * email when it is on a line with their first name, or the only address in the call that isn't
 * the member's. Nothing is guessed.
 */
export function signerInCall(text: string, me: { name: string; email?: string }): { name?: string; title?: string; email?: string } {
  const mine = me.name.trim().toLowerCase();
  const out: { name?: string; title?: string; email?: string } = {};
  for (const line of String(text ?? "").split("\n")) {
    const a = line.match(new RegExp(`${PERSON}\\s*(?:,|\\(|-|–|—)\\s*(?:the\\s+|our\\s+)?${SIGNER_TITLE.source}`));
    const b = !a ? line.match(new RegExp(`${SIGNER_TITLE.source}\\s+${PERSON}`)) : null;
    const [name, title] = a ? [a[1], a[2]] : b ? [b[2], b[1]] : [];
    if (name && name.toLowerCase() !== mine && !mine.startsWith(name.toLowerCase())) {
      out.name = name;
      out.title = title;
      break;
    }
  }
  const mails = [...new Set((String(text ?? "").match(EMAIL_G) ?? []).map((x) => x.toLowerCase()))].filter((x) => x !== me.email?.toLowerCase());
  const first = out.name?.split(/\s+/)[0]?.toLowerCase();
  const near = first ? String(text).split("\n").find((l) => l.toLowerCase().includes(first) && EMAIL_G.test(l)) : undefined;
  EMAIL_G.lastIndex = 0;
  const nearMail = near?.match(EMAIL_G)?.find((x) => x.toLowerCase() !== me.email?.toLowerCase());
  EMAIL_G.lastIndex = 0;
  const byName = first ? mails.find((x) => x.split("@")[0].split(/[._-]/).includes(first)) : undefined;
  const email = nearMail?.toLowerCase() ?? byName ?? (mails.length === 1 && out.name ? mails[0] : undefined);
  if (email) out.email = email;
  return out;
}

/** "sevenfigureagency.com/", "https://www.SevenFigureAgency.com/about" read "sevenfigureagency.com". Null when it isn't a website. */
export function normaliseSite(raw: string): string | null {
  const host = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) && !host.includes("..") ? host : null;
}

/** The client's website from the call: a site named in it, else the signer's or another address's company domain (never a shared mail host, never the member's own). */
export function siteFromCall(text: string, me: { email?: string }, signerEmail?: string): string | null {
  const mine = me.email?.split("@")[1]?.toLowerCase();
  const fromMail = (e?: string) => {
    const d = e?.split("@")[1]?.toLowerCase();
    return d && !SHARED_MAIL.test(d) && d !== mine ? normaliseSite(d) : null;
  };
  if (fromMail(signerEmail)) return fromMail(signerEmail);
  const sites = [...String(text ?? "").matchAll(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|co|ai|net|org|agency|app|dev|us|uk|ca|de))\b(?!@)/gi)]
    .filter((m) => !String(text).slice(Math.max(0, (m.index ?? 0) - 1), m.index).includes("@"))
    .map((m) => normaliseSite(m[1]))
    .filter((x): x is string => !!x && x !== mine && !SHARED_MAIL.test(`${x}.`));
  if (sites.length) return sites[0];
  for (const e of String(text ?? "").match(EMAIL_G) ?? []) if (fromMail(e)) return fromMail(e);
  return null;
}

/** A name typed all in lower case reads with capitals: "seven figure agency" is "Seven Figure Agency". Anything else is left as typed. */
export function properCase(name: string): string {
  const t = String(name ?? "").trim();
  if (!t || t !== t.toLowerCase() || !/[a-z]/.test(t)) return t;
  return t.replace(/\b([a-z])([a-z']*)/g, (w, a: string, b: string, i: number) => (i > 0 && /^(and|of|the|for|in|on|at|de|la)$/.test(w) ? w : a.toUpperCase() + b)).replace(/\b(Llc|Inc|Ltd|Llp)\b/g, (w) => (w === "Llc" || w === "Llp" ? w.toUpperCase() : w));
}
