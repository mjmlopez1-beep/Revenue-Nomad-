/**
 * Reading LinkedIn's own Connections.csv (Settings, Data privacy, Get a copy of your data,
 * Connections). Pure, no imports beyond the types, so the page reads the file in the browser to say
 * what it found before anything is sent, and the server reads it again the same way.
 *
 * The file starts with a few lines of notes before its header ("Notes:", a quoted paragraph about
 * missing email addresses, a blank line), then:
 *
 *   First Name,Last Name,URL,Email Address,Company,Position,Connected On
 *
 * Fields can be quoted, with commas, quotes ("") and line breaks inside. "Connected On" reads
 * "12 Mar 2023" (older files: "3/12/23", "2023-03-12"). Email Address is usually empty: LinkedIn
 * gives it only for people who allowed it.
 */
import { ROWS_MAX, type LinkedInRow } from "./types";

export type CsvProblem = "zip" | "empty" | "not-connections" | "no-rows";
export const CSV_PROBLEM_WORDS: Record<CsvProblem, string> = {
  zip: "That's the whole archive. Unzip it first, then pick Connections.csv from inside.",
  empty: "That file is empty. Pick Connections.csv from LinkedIn's export.",
  "not-connections": "That doesn't look like LinkedIn's Connections.csv. It needs the First Name, Last Name and Company columns.",
  "no-rows": "Connections.csv has no connections in it.",
};

export type CsvResult = { ok: true; rows: LinkedInRow[]; skipped: number } | { ok: false; problem: CsvProblem };

/** Every record of a CSV text, as arrays of fields (RFC 4180: quotes, doubled quotes, line breaks inside quotes). */
export function csvRecords(text: string): string[][] {
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
    if (ch === ",") {
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
 * First Name and a Last Name column; everything before it is LinkedIn's notes. A row without a
 * first or a last name is skipped (LinkedIn leaves both empty for people who hid them), and so is
 * a second row for the same profile. At most ROWS_MAX rows.
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
  if (c.c < 0) return { ok: false, problem: "not-connections" };
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
  return { ok: true, rows, skipped };
}
