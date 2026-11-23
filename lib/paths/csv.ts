/**
 * Reading the member's own files of people they know. Pure, no imports beyond the types, so the
 * page reads a file in the browser to say what it found before anything is sent, and the server
 * reads it again the same way.
 *
 *  1. LinkedIn's own Connections.csv (Settings, Data privacy, Get a copy of your data, Connections):
 *     parseConnections, below.
 *  2. Any contacts CSV (a CRM export, Google or Outlook contacts, a spreadsheet): readContacts finds
 *     the header and guesses which column is the name, company, title and email (guessColumns); the
 *     member checks or changes that and sees a preview; pickColumns then writes a new, smaller CSV
 *     with only those four columns, and only that is sent. The server reads it with parseContacts.
 *     So no other column of the member's file ever reaches Merlin.
 *
 * About LinkedIn's file:
 *
 * The file starts with a few lines of notes before its header ("Notes:", a quoted paragraph about
 * missing email addresses, a blank line), then:
 *
 *   First Name,Last Name,URL,Email Address,Company,Position,Connected On
 *
 * Fields can be quoted, with commas, quotes ("") and line breaks inside. "Connected On" reads
 * "12 Mar 2023" (older files: "3/12/23", "2023-03-12"). Email Address is usually empty: LinkedIn
 * gives it only for people who allowed it.
 *
 * From December 2026 LinkedIn's file no longer has the email, the company or the position
 * ("As of December 2026, your data download no longer includes your connections' email addresses,
 * current companies, or job titles"): its header is First Name, Last Name, URL, Connected On. Such
 * a file still reads (namesOnly: true), and Merlin places its people by their profile link alone
 * (lib/paths/index.ts contactsOf), never by a name. A file uploaded before keeps what it had.
 */
import { ROWS_MAX, type ContactRow, type LinkedInRow } from "./types";

export type CsvProblem = "zip" | "empty" | "not-connections" | "no-rows";
export const CSV_PROBLEM_WORDS: Record<CsvProblem, string> = {
  zip: "That's the whole archive. Unzip it first, then pick Connections.csv from inside.",
  empty: "That file is empty. Pick Connections.csv from LinkedIn's export.",
  "not-connections": "That doesn't look like LinkedIn's Connections.csv. It needs the First Name and Last Name columns, and a URL or Company column.",
  "no-rows": "Connections.csv has no connections in it.",
};

/**
 * `namesOnly`: the file has no Company column, or no row in it has a company or an email (LinkedIn's
 * files from December 2026): its people can be placed only by their profile link.
 */
export type CsvResult = { ok: true; rows: LinkedInRow[]; skipped: number; namesOnly: boolean } | { ok: false; problem: CsvProblem };

/** Every record of a CSV text, as arrays of fields (RFC 4180: quotes, doubled quotes, line breaks inside quotes). `sep`: the field separator. */
export function csvRecords(text: string, sep = ","): string[][] {
  const out: string[][] = [];
  let rec: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      field = "";
      quoted = true;
      i++;
      continue;
    }
    if (ch === sep) {
      rec.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      rec.push(field);
      out.push(rec);
      rec = [];
      field = "";
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || rec.length) {
    rec.push(field);
    out.push(rec);
  }
  return out;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (x: number) => String(x).padStart(2, "0");
/** "12 Mar 2023", "Mar 12, 2023", "3/12/23", "2023-03-12" -> "2023-03-12", else undefined. */
export function connectedDay(raw: string): string | undefined {
  const v = raw.trim();
  let y: number, m: number, d: number;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(v))) [d, m, y] = [Number(r[1]), MONTHS[r[2].toLowerCase().slice(0, 3)] ?? 0, Number(r[3])];
  else if ((r = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(v))) [m, d, y] = [MONTHS[r[1].toLowerCase().slice(0, 3)] ?? 0, Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{4})-(\d{2})-(\d{2})/.exec(v))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v))) [m, d, y] = [Number(r[1]), Number(r[2]), r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3])];
  else return undefined;
  if (!y || y < 2003 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A LinkedIn internal member id ("ACoAA..." or "ACwAA...", as Sales Navigator links carry them), not a public profile's name: never stored. */
const SALES_ID = /^ac[ow]aa[a-z0-9_-]{20,}$/i;

/** The profile's slug from its address: "https://www.linkedin.com/in/dana-reyes-12ab/" -> "dana-reyes-12ab". */
export function profileSlug(url: string): string | undefined {
  const m = /linkedin\.com\/in\/([^/?#\s]+)/i.exec(url.trim());
  if (!m) return undefined;
  let s = m[1];
  try {
    s = decodeURIComponent(s);
  } catch {
    /* as it is */
  }
  s = s.toLowerCase().replace(/\/+$/, "");
  // LinkedIn's internal member ids ("ACoAA...", "ACwAA..."), as Sales Navigator links carry them, are never kept.
  if (SALES_ID.test(s)) return undefined;
  return s && s.length <= 100 ? s : undefined;
}

/** Control characters, angle brackets and extra spaces out; at most `max` characters. */
const clean = (v: string | undefined, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const EMAIL = /^[^\s@<>()",;]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * LinkedIn's Connections.csv as the rows Merlin keeps. The header is the first record that has a
 * First Name and a Last Name column; everything before it is LinkedIn's notes. It needs a Company
 * or a URL column too (LinkedIn's files from December 2026 have no Company column: namesOnly). A
 * row without a first or a last name is skipped (LinkedIn leaves both empty for people who hid
 * them), and so is a second row for the same profile. At most ROWS_MAX rows.
 */
export function parseConnections(text: string): CsvResult {
  if (text.startsWith("PK\u0003\u0004")) return { ok: false, problem: "zip" };
  const body = text.replace(/^﻿/, "");
  if (!body.trim()) return { ok: false, problem: "empty" };
  const recs = csvRecords(body);
  const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");
  const at = recs.findIndex((r) => {
    const h = r.map(norm);
    return h.includes("first name") && h.includes("last name");
  });
  if (at < 0) return { ok: false, problem: "not-connections" };
  const head = recs[at].map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const c = {
    f: col("first name"),
    l: col("last name"),
    u: col("url", "profile url"),
    e: col("email address", "email"),
    c: col("company"),
    p: col("position", "title"),
    d: col("connected on"),
  };
  if (c.c < 0 && c.u < 0) return { ok: false, problem: "not-connections" };
  const rows: LinkedInRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of recs.slice(at + 1)) {
    if (r.every((x) => !x.trim())) continue;
    const get = (i: number) => (i >= 0 ? r[i] : undefined);
    const f = clean(get(c.f), 60);
    const l = clean(get(c.l), 80);
    if (!f || !l) {
      skipped++;
      continue;
    }
    const row: LinkedInRow = { f, l };
    const co = clean(get(c.c), 120);
    if (co) row.c = co;
    const p = clean(get(c.p), 160);
    if (p) row.p = p;
    const d = connectedDay(clean(get(c.d), 30));
    if (d) row.d = d;
    const u = profileSlug(clean(get(c.u), 300));
    if (u) row.u = u;
    const e = clean(get(c.e), 120).toLowerCase();
    if (e && EMAIL.test(e)) row.e = e;
    const key = row.u ? `u:${row.u}` : `n:${f.toLowerCase()} ${l.toLowerCase()}|${(row.c ?? "").toLowerCase()}`;
    if (seen.has(key) || rows.length >= ROWS_MAX) {
      skipped++;
      continue;
    }
    seen.add(key);
    rows.push(row);
  }
  if (!rows.length) return { ok: false, problem: "no-rows" };
  return { ok: true, rows, skipped, namesOnly: c.c < 0 || !rows.some((x) => x.c || x.e) };
}

/* ---------- any contacts CSV ---------- */

/** The four things Merlin may read from a contacts file. A name is one column, or a first and a last name. */
export type ContactField = "name" | "first" | "last" | "company" | "title" | "email";
export const CONTACT_FIELDS: { key: ContactField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "first", label: "First name" },
  { key: "last", label: "Last name" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "email", label: "Email" },
];
/** Which column (its index) holds each field. A field left out is not read. */
export type ColumnMap = Partial<Record<ContactField, number>>;

export type ContactsProblem = "zip" | "empty" | "no-name" | "no-company" | "no-rows";
export const CONTACTS_PROBLEM_WORDS: Record<ContactsProblem, string> = {
  zip: "That's a zip archive. Unzip it first, then pick the CSV inside.",
  empty: "That file is empty. Pick a CSV with a name and a company on each row.",
  "no-name": "Pick the column that holds each person's name, or their first and last name.",
  "no-company": "Pick the column with the company or the email. Merlin needs one of them to place each person.",
  "no-rows": "None of the rows has a name with a company or an email.",
};

/** A header as words: "E-mail 1 - Value" -> "e mail 1 value". */
const headWords = (h: string) =>
  h
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const EXACT: Record<ContactField, string[]> = {
  name: ["name", "full name", "fullname", "contact name", "contact", "display name", "person", "person name"],
  first: ["first name", "firstname", "first", "given name", "forename"],
  last: ["last name", "lastname", "last", "surname", "family name"],
  company: ["company", "company name", "organization", "organisation", "organization name", "organisation name", "organization 1 name", "employer", "account", "account name", "business", "org", "current company"],
  title: ["title", "job title", "position", "role", "job", "organization title", "organization 1 title", "job role", "current title"],
  email: ["email", "e mail", "email address", "e mail address", "e mail 1 value", "email 1", "work email", "primary email", "business email", "email 1 value"],
};
/** Looser readings, tried after the exact ones: a header that mentions the field. */
const LOOSE: Record<ContactField, RegExp> = {
  name: /\b(full )?name\b/,
  first: /\bfirst\b|\bgiven\b/,
  last: /\blast\b|\bsurname\b|\bfamily\b/,
  company: /\bcompany\b|\borgani[sz]ation\b|\bemployer\b/,
  title: /\btitle\b|\bposition\b|\brole\b/,
  email: /\be ?mail\b/,
};

/**
 * Which column is which, from the header. Exact names first ("Company", "Job Title", "E-mail
 * Address", Google's "Organization Name"), then a header that mentions the field. Each column is
 * used once. A first and a last name are used when there is no single name column.
 */
export function guessColumns(header: readonly string[]): ColumnMap {
  const words = header.map(headWords);
  const used = new Set<number>();
  const map: ColumnMap = {};
  const take = (f: ContactField, test: (w: string) => boolean) => {
    if (map[f] !== undefined) return;
    const k = words.findIndex((w, i) => !used.has(i) && !!w && test(w));
    if (k >= 0) {
      map[f] = k;
      used.add(k);
    }
  };
  const order: ContactField[] = ["email", "first", "last", "company", "title", "name"];
  for (const f of order) take(f, (w) => EXACT[f].includes(w));
  const halves = () => map.first !== undefined && map.last !== undefined;
  for (const f of order) take(f, (w) => LOOSE[f].test(w) && !(f === "name" && (halves() || /\b(first|last|middle|nick|maiden|phonetic|given|family|company|organi[sz]ation|account|file|user|business)\b/.test(w))));
  if (map.name !== undefined && (map.first !== undefined || map.last !== undefined)) {
    // One name column wins; the halves are then not needed.
    delete map.first;
    delete map.last;
  }
  return map;
}

/** The field separator a file uses: a comma, else a semicolon or a tab when its first line has more of them. */
export function separatorOf(text: string): string {
  const line = (text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) ?? "").replace(/"[^"]*"/g, "");
  const n = (c: string) => line.split(c).length - 1;
  const comma = n(","), semi = n(";"), tab = n("\t");
  return tab > comma && tab >= semi ? "\t" : semi > comma ? ";" : ",";
}

/** A map is enough to read people: a name (one column, or a first and a last), and a company or an email. */
export function mapProblem(map: ColumnMap): ContactsProblem | null {
  if (map.name === undefined && (map.first === undefined || map.last === undefined)) return "no-name";
  if (map.company === undefined && map.email === undefined) return "no-company";
  return null;
}

export interface ContactsFile {
  ok: true;
  /** The header's columns, as the file has them. */
  header: string[];
  /** Which record is the header (0 for most files; LinkedIn's export has notes first). */
  at: number;
  sep: string;
  /** Merlin's guess of which column is which. */
  map: ColumnMap;
  /** The first rows after the header, for the preview. */
  sample: string[][];
  /** Rows after the header that are not blank. */
  rows: number;
}

/**
 * A contacts CSV's header, Merlin's guess at its columns and a few rows to preview. The header is
 * the first record in the first ten whose columns give a name; else the first record.
 */
export function readContacts(text: string): ContactsFile | { ok: false; problem: ContactsProblem } {
  if (text.startsWith("PK\u0003\u0004")) return { ok: false, problem: "zip" };
  const body = text.replace(/^﻿/, "");
  if (!body.trim()) return { ok: false, problem: "empty" };
  const sep = separatorOf(body);
  const recs = csvRecords(body, sep);
  const filled = (r: string[]) => r.some((x) => x.trim());
  let at = recs.slice(0, 10).findIndex((r) => filled(r) && mapProblem(guessColumns(r)) !== "no-name");
  if (at < 0) at = recs.findIndex(filled);
  if (at < 0) return { ok: false, problem: "empty" };
  const header = recs[at].map((h) => clean(h, 80));
  const rest = recs.slice(at + 1).filter(filled);
  return { ok: true, header, at, sep, map: guessColumns(header), sample: rest.slice(0, 3).map((r) => header.map((_, k) => clean(r[k], 80))), rows: rest.length };
}

const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * The file as Merlin may read it: a new CSV with only Name, Company, Title and Email, from the
 * columns the member picked. This is all the page sends; every other column stays on their side.
 */
export function pickColumns(text: string, file: Pick<ContactsFile, "at" | "sep">, map: ColumnMap): string {
  const recs = csvRecords(text.replace(/^﻿/, ""), file.sep).slice(file.at + 1);
  const get = (r: string[], f: ContactField) => (map[f] !== undefined ? clean(r[map[f]!], 200) : "");
  const out = ["Name,Company,Title,Email"];
  for (const r of recs) {
    if (!r.some((x) => x.trim())) continue;
    const name = map.name !== undefined ? get(r, "name") : [get(r, "first"), get(r, "last")].filter(Boolean).join(" ");
    const row = [name, get(r, "company"), get(r, "title"), get(r, "email")];
    if (!row.some(Boolean)) continue;
    out.push(row.map(quote).join(","));
    if (out.length > ROWS_MAX + 1) break;
  }
  return out.join("\n");
}

export type ContactsResult = { ok: true; rows: ContactRow[]; skipped: number } | { ok: false; problem: ContactsProblem };

/**
 * A contacts CSV as the rows Merlin keeps: a name with a company or an email, each person once (by
 * email, else by name and company), at most ROWS_MAX. Columns by guessColumns (the page sends the
 * file pickColumns wrote, whose header names them exactly). Nothing else in a row is kept.
 */
export function parseContacts(text: string): ContactsResult {
  const f = readContacts(text);
  if (!f.ok) return f;
  const bad = mapProblem(f.map);
  if (bad) return { ok: false, problem: bad };
  const recs = csvRecords(text.replace(/^﻿/, ""), f.sep).slice(f.at + 1);
  const m = f.map;
  const get = (r: string[], k: ContactField, max: number) => (m[k] !== undefined ? clean(r[m[k]!], max) : "");
  const rows: ContactRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of recs) {
    if (r.every((x) => !x.trim())) continue;
    const n = (m.name !== undefined ? get(r, "name", 140) : [get(r, "first", 60), get(r, "last", 80)].filter(Boolean).join(" ")).slice(0, 140);
    const c = get(r, "company", 120);
    const t = get(r, "title", 160);
    const e0 = get(r, "email", 120).toLowerCase();
    const e = e0 && EMAIL.test(e0) ? e0 : "";
    if (!/\p{L}/u.test(n) || (!c && !e)) {
      skipped++;
      continue;
    }
    const key = e ? `e:${e}` : `n:${n.toLowerCase()}|${c.toLowerCase()}`;
    if (seen.has(key) || rows.length >= ROWS_MAX) {
      skipped++;
      continue;
    }
    seen.add(key);
    const row: ContactRow = { n };
    if (c) row.c = c;
    if (t) row.t = t;
    if (e) row.e = e;
    rows.push(row);
  }
  if (!rows.length) return { ok: false, problem: "no-rows" };
  return { ok: true, rows, skipped };
}
