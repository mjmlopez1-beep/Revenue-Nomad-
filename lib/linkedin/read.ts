/**
 * Reading the member's own LinkedIn data export, in their browser (and the checks). Pure apart
 * from the archive reader it is handed: nothing here sends anything. It turns the files Merlin
 * reads (lib/linkedin/files.ts READS) into the small payload of each use (lib/linkedin/types.ts
 * ExportPayload), and drops everything else on the device:
 *
 *  - messages.csv: only who wrote to whom and when. The CONTENT, SUBJECT, CONVERSATION TITLE and
 *    ATTACHMENTS columns are skipped while the file is read, character by character: their words
 *    are never even put together as text (eachRecord's `keep`). What comes out is one row per
 *    person: { profileSlug, sent, received, first, last }.
 *  - Invitations.csv: the other person's profile link, name, which way and the day. Never the note.
 *  - Positions.csv: company, title and months. Never the description or the location.
 *  - Recommendations: who and which way; the text of a received one only with the proof tick.
 *  - Shares, Comments, Rich_Media: read for the voice only (lib/linkedin/voice.ts), on the device.
 *    Only the style conclusions leave it.
 */
import { connectedDay, parseConnections, profileSlug } from "../paths/csv";
import { functionOf } from "../tableFields";
import { cleanVoice, type VoiceStyle } from "../voice";
import { classify, readableEntries, shownFileName, type ExportFile } from "./files";
import { listZip, looksLikeZip, readText, ZipProblem, type ZipSource } from "./zip";
import { voiceFromPosts } from "./voice";
import { LIX_LIMITS, type EndorseRow, type ExportPayload, type InviteRow, type PositionRow, type RecRow, type UseKey, type WarmRow } from "./types";

/* ---------- CSV, one record at a time ---------- */

/**
 * Each record of a CSV, handed to `on` one at a time (RFC 4180: quotes, doubled quotes, line
 * breaks inside quotes). `keep(i)`: the fields to put together; every other field's characters
 * are passed over and never become text (its place in the record is undefined). The header (the
 * first record `isHeader` accepts) is always read whole, then `keepFor(header)` picks the fields.
 * Returning false from `on` stops the read.
 */
export function eachRecord(text: string, on: (rec: (string | undefined)[], head: string[]) => boolean | void, opts: { isHeader: (rec: string[]) => boolean; keepFor?: (head: string[]) => (i: number) => boolean }): string[] | null {
  let head: string[] | null = null;
  let keep: (i: number) => boolean = () => true;
  let rec: (string | undefined)[] = [];
  let field = "";
  let quoted = false;
  let keeping = true;
  let started = false;
  const n = text.length;
  let i = 0;
  const endField = () => {
    rec.push(keeping ? field : undefined);
    field = "";
    started = false;
    keeping = keep(rec.length);
  };
  const endRecord = (): boolean => {
    endField();
    const r = rec;
    rec = [];
    keeping = keep(0);
    if (!head) {
      const full = r.map((x) => x ?? "");
      if (opts.isHeader(full)) {
        head = full.map((h) => h.trim());
        keep = opts.keepFor ? opts.keepFor(head) : () => true;
        keeping = keep(0);
      }
      return true;
    }
    if (r.length === 1 && !r[0]) return true;
    return on(r, head) !== false;
  };
  while (i < n) {
    const ch = text.charCodeAt(i);
    if (quoted) {
      if (ch === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          if (keeping) field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      if (keeping) field += text[i];
      i++;
      continue;
    }
    if (ch === 34 && !started) {
      quoted = true;
      started = true;
      field = "";
      i++;
      continue;
    }
    if (ch === 44) {
      endField();
      i++;
      continue;
    }
    if (ch === 13 || ch === 10) {
      if (!endRecord()) return head;
      i += ch === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
      continue;
    }
    if (ch !== 32 && ch !== 9) started = true;
    if (keeping) field += text[i];
    i++;
  }
  if (field !== "" || rec.length) endRecord();
  return head;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");
const hasAll = (...cols: string[]) => (rec: string[]) => {
  const h = rec.map(norm);
  return cols.every((c) => h.includes(c));
};
const colOf = (head: string[], ...names: string[]) => head.map(norm).findIndex((h) => names.includes(h));
const clean = (v: string | undefined, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** "2024-05-03 14:22:11 UTC", "5/3/24, 2:22 PM", "Mar 12, 2023" -> "2024-05-03". */
export function dayOf(raw: string | undefined): string | undefined {
  const v = clean(raw, 40);
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const head = v.split(/[,T]| \d{1,2}:/)[0].trim();
  return connectedDay(head) ?? connectedDay(v.replace(/,?\s+\d{1,2}:\d{2}.*$/, "").trim());
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
/** Positions.csv's "Jan 2023" -> "2023-01"; "2023" -> "2023"; else undefined. */
export function monthOf(raw: string | undefined): string | undefined {
  const v = clean(raw, 30);
  let m = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(v);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[2]}-${MONTHS[m[1].slice(0, 3).toLowerCase()]}`;
  if ((m = /^(\d{4})-(\d{2})/.exec(v))) return `${m[1]}-${m[2]}`;
  if ((m = /^(\d{1,2})\/(\d{4})$/.exec(v))) return `${m[2]}-${m[1].padStart(2, "0")}`;
  if ((m = /^(\d{4})$/.exec(v))) return m[1];
  return undefined;
}

/* ---------- each file ---------- */

/** messages.csv's columns Merlin reads. CONTENT, SUBJECT, CONVERSATION TITLE, ATTACHMENTS and the names are never put together. */
const MSG_COLS = ["sender profile url", "recipient profile urls", "date", "is message draft", "folder"];

/**
 * messages.csv as one row per person: messages each way, first and last day. The member is the
 * profile that sent the most (`me`, else found that way). Drafts and spam don't count; a message
 * the member sent to more than three people at once doesn't count for any of them. The most
 * messaged LIX_LIMITS.warm people.
 */
export function messageWarmth(text: string, me?: string | null): { rows: WarmRow[]; me: string | null; messages: number; ok: boolean } {
  type Msg = { from: string | null; to: string[]; day: string | undefined };
  const msgs: Msg[] = [];
  const head = eachRecord(
    text,
    (r, h) => {
      const at = (name: string) => colOf(h, name);
      const draft = clean(r[at("is message draft")], 10).toLowerCase();
      if (draft === "yes" || draft === "true") return;
      if (/spam/i.test(clean(r[at("folder")], 20))) return;
      const from = profileSlug(clean(r[at("sender profile url")], 300)) ?? null;
      const to = clean(r[at("recipient profile urls")], 4000)
        .split(/[,;\s]+/)
        .map((u) => (u ? profileSlug(u) : undefined))
        .filter((u): u is string => !!u);
      msgs.push({ from, to: [...new Set(to)], day: dayOf(r[at("date")]) });
    },
    {
      isHeader: hasAll("from", "sender profile url", "date"),
      keepFor: (h) => {
        const want = new Set(MSG_COLS.map((c) => colOf(h, c)).filter((x) => x >= 0));
        return (i) => want.has(i);
      },
    },
  );
  if (!head) return { rows: [], me: null, messages: 0, ok: false };
  let self = me ?? null;
  if (!self) {
    const sent = new Map<string, number>();
    for (const m of msgs) if (m.from) sent.set(m.from, (sent.get(m.from) ?? 0) + 1);
    self = [...sent].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  }
  const by = new Map<string, WarmRow>();
  const bump = (u: string, way: "sent" | "received", day: string | undefined) => {
    if (u === self) return;
    let w = by.get(u);
    if (!w) by.set(u, (w = { profileSlug: u, sent: 0, received: 0, first: day ?? "", last: day ?? "" }));
    w[way]++;
    if (day) {
      if (!w.first || day < w.first) w.first = day;
      if (!w.last || day > w.last) w.last = day;
    }
  };
  for (const m of msgs) {
    if (m.from && m.from === self) {
      const to = m.to.filter((u) => u !== self);
      if (to.length > 3) continue;
      for (const u of to) bump(u, "sent", m.day);
    } else if (m.from) bump(m.from, "received", m.day);
  }
  const rows = [...by.values()]
    .filter((w) => w.first && w.last)
    .sort((a, b) => b.sent + b.received - (a.sent + a.received) || a.profileSlug.localeCompare(b.profileSlug))
    .slice(0, LIX_LIMITS.warm);
  return { rows, me: self, messages: msgs.length, ok: true };
}

/** Invitations.csv: pending invitations, the other person's link and name. The Message column is never read. */
export function parseInvitations(text: string): InviteRow[] {
  const out: InviteRow[] = [];
  const seen = new Set<string>();
  eachRecord(
    text,
    (r, h) => {
      const at = (n: string) => colOf(h, n);
      const out1 = /out/i.test(clean(r[at("direction")], 20));
      const u = profileSlug(clean(r[at(out1 ? "inviteeprofileurl" : "inviterprofileurl")], 300));
      const n = clean(r[at(out1 ? "to" : "from")], 120);
      if (!u || !n || seen.has(u)) return;
      seen.add(u);
      const d = dayOf(r[at("sent at")]);
      out.push({ u, n, out: out1, ...(d ? { d } : {}) });
      if (out.length >= LIX_LIMITS.invites) return false;
    },
    {
      isHeader: hasAll("from", "to", "direction"),
      keepFor: (h) => {
        const want = new Set(["from", "to", "sent at", "direction", "inviterprofileurl", "inviteeprofileurl"].map((c) => colOf(h, c)).filter((x) => x >= 0));
        return (i) => want.has(i);
      },
    },
  );
  return out;
}

/** Titles that read as fractional work, first on the list of seats. */
export const KIND_RE: [RegExp, NonNullable<import("./types").SeatOffer["kind"]>][] = [
  [/\bfractional\b|\bpart[\s-]time\b|\bf(cmo|cro|cfo|coo|cto|cpo)\b/i, "fractional"],
  [/\binterim\b/i, "interim"],
  [/\badvis[eo]r\b|\badvisory\b|\bboard advis/i, "advisor"],
  [/\bconsult(ant|ing)\b|\bfreelance\b|\bcontract(or)?\b/i, "consulting"],
];
export const kindOfTitle = (t: string) => KIND_RE.find(([re]) => re.test(t))?.[1] ?? null;

/** Positions.csv: company, title and months. Description and Location are never read. */
export function parsePositions(text: string): PositionRow[] {
  const out: PositionRow[] = [];
  eachRecord(
    text,
    (r, h) => {
      const at = (n: string) => colOf(h, n);
      const c = clean(r[at("company name")], 120);
      const t = clean(r[at("title")], 120);
      if (!c || !t) return;
      const s = monthOf(r[at("started on")]);
      const e = monthOf(r[at("finished on")]);
      out.push({ c, t, ...(s ? { s } : {}), ...(e ? { e } : {}) });
      if (out.length >= LIX_LIMITS.positions) return false;
    },
    {
      isHeader: hasAll("company name", "title", "started on"),
      keepFor: (h) => {
        const want = new Set(["company name", "title", "started on", "finished on"].map((c) => colOf(h, c)).filter((x) => x >= 0));
        return (i) => want.has(i);
      },
    },
  );
  return out;
}

/** Recommendations: who, which way and the day; the text of a received one only when `withText`. Hidden ones don't count. */
export function parseRecs(text: string, k: "in" | "out", withText: boolean): RecRow[] {
  const out: RecRow[] = [];
  eachRecord(
    text,
    (r, h) => {
      const at = (n: string) => colOf(h, n);
      if (/hidden|reject|declin|withdraw/i.test(clean(r[at("status")], 30))) return;
      const f = clean(r[at("first name")], 60);
      const l = clean(r[at("last name")], 80);
      const c = clean(r[at("company")], 120);
      if (!f || !l) return;
      const d = dayOf(r[at("creation date")]);
      const tx = withText && k === "in" ? clean(r[at("text")], LIX_LIMITS.proofChars) : "";
      out.push({ f, l, c, k, ...(d ? { d } : {}), ...(tx ? { text: tx } : {}) });
      if (out.length >= LIX_LIMITS.recs) return false;
    },
    {
      isHeader: hasAll("first name", "last name", "company", "status"),
      keepFor: (h) => {
        const want = new Set(["first name", "last name", "company", "creation date", "status", ...(withText && k === "in" ? ["text"] : [])].map((c) => colOf(h, c)).filter((x) => x >= 0));
        return (i) => want.has(i);
      },
    },
  );
  return out;
}

/** Endorsements: the other person's profile link and which way. */
export function parseEndorsements(text: string, k: "in" | "out"): EndorseRow[] {
  const out: EndorseRow[] = [];
  const seen = new Set<string>();
  const col = k === "in" ? "endorser public url" : "endorsee public url";
  eachRecord(
    text,
    (r, h) => {
      if (/hidden|reject|declin/i.test(clean(r[colOf(h, "endorsement status")], 30))) return;
      const u = profileSlug(clean(r[colOf(h, col)], 300));
      if (!u || seen.has(u)) return;
      seen.add(u);
      out.push({ u, k });
      if (out.length >= LIX_LIMITS.endorsements) return false;
    },
    { isHeader: hasAll("endorsement date", "skill name", col), keepFor: (h) => ((want) => (i: number) => want.has(i))(new Set([colOf(h, col), colOf(h, "endorsement status")])) },
  );
  return out;
}

/** Company Follows.csv: the companies' names. */
export function parseFollows(text: string): string[] {
  const out = new Set<string>();
  eachRecord(
    text,
    (r, h) => {
      const o = clean(r[colOf(h, "organization")], 120);
      if (o) out.add(o);
      if (out.size >= LIX_LIMITS.follows) return false;
    },
    { isHeader: hasAll("organization", "followed on") },
  );
  return [...out];
}

/** Skills.csv: the skills' names. */
export function parseSkills(text: string): string[] {
  const out: string[] = [];
  eachRecord(
    text,
    (r) => {
      const v = clean(r[0], 80);
      if (v) out.push(v);
      if (out.length >= 200) return false;
    },
    { isHeader: (r) => r.length >= 1 && norm(r[0]) === "name" },
  );
  return out;
}

/** The member's own posts, comments or media captions, newest first, for the voice (never sent). */
export function parsePosts(text: string, which: "shares" | "comments" | "richMedia"): { day: string; text: string }[] {
  const col = which === "shares" ? "sharecommentary" : which === "comments" ? "message" : "media description";
  const dcol = which === "richMedia" ? "date/time" : "date";
  const out: { day: string; text: string }[] = [];
  eachRecord(
    text,
    (r, h) => {
      const t = String(r[colOf(h, col)] ?? "").trim().slice(0, LIX_LIMITS.postChars);
      if (t.length >= 20) out.push({ day: dayOf(r[colOf(h, dcol)]) ?? "", text: t });
    },
    {
      isHeader: hasAll(dcol, col),
      keepFor: (h) => ((want) => (i: number) => want.has(i))(new Set([colOf(h, col), colOf(h, dcol)])),
    },
  );
  return out;
}

/** A function from the skills (the one most of them read as, lib/tableFields.ts functionOf). */
export function fnFromSkills(skills: string[], titles: string[] = []): string | null {
  const n = new Map<string, number>();
  for (const s of [...skills, ...titles, ...titles]) {
    const f = functionOf(s);
    if (f && f !== "Executive" && f !== "Other") n.set(f, (n.get(f) ?? 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/* ---------- the whole export ---------- */

/** What the browser found: the files Merlin will read (with what each holds) and the ones it won't, by name. */
export interface ExportRead {
  /** Files read, by key, with rows found (a count only). */
  found: Partial<Record<ExportFile, number>>;
  /** Names of the files in the archive Merlin never opened. */
  skipped: string[];
  /** Counts the consent screen shows for each use. */
  preview: {
    connections: number;
    namesOnly: boolean;
    invites: number;
    positions: number;
    fractionalPositions: number;
    warmPeople: number;
    messages: number;
    vouch: number;
    recsReceived: number;
    follows: number;
    posts: number;
    skills: number;
  };
  /** Builds the payload for the ticked uses. Everything it reads is already on the device. */
  payload: (uses: UseKey[], prior?: VoiceStyle | null) => ExportPayload;
  /** The voice the posts read as, or null with too few posts. */
  voice: (prior?: VoiceStyle | null) => VoiceStyle | null;
  problems: string[];
}

/** A file the member picked (or one entry of the archive), read only when asked. */
interface Readable {
  name: string;
  text: () => Promise<string>;
}

/** The most text read from one file. messages.csv can be tens of megabytes. */
const MAX_TEXT = 400 * 1024 * 1024;
const MAX_SMALL = 40 * 1024 * 1024;

/**
 * The export, read on the device: a .zip (only its table of contents, then only the files Merlin
 * reads), or the CSV files picked from it. Files are matched by name (files.ts classify).
 */
export async function readExport(picked: { name: string; size: number; slice: ZipSource["slice"]; text?: () => Promise<string> }[]): Promise<ExportRead> {
  const files = new Map<ExportFile, Readable>();
  const skipped: string[] = [];
  const problems: string[] = [];
  for (const f of picked) {
    if (/\.zip$/i.test(f.name) || (await looksLikeZip(f).catch(() => false))) {
      let list;
      try {
        list = await listZip(f);
      } catch (e) {
        problems.push(e instanceof ZipProblem ? e.message : "That archive couldn't be read.");
        continue;
      }
      const ok = readableEntries(list.map((e) => e.name));
      for (const e of list) {
        if (e.name.endsWith("/")) continue;
        const k = ok.get(e.name);
        if (!k || files.has(k)) {
          skipped.push(shownFileName(e.name));
          continue;
        }
        files.set(k, { name: e.name, text: () => readText(f, e, k === "messages" ? MAX_TEXT : MAX_SMALL) });
      }
      continue;
    }
    const k = classify(f.name);
    if (!k || files.has(k)) {
      skipped.push(shownFileName(f.name));
      continue;
    }
    files.set(k, { name: f.name, text: f.text ?? (async () => new TextDecoder().decode(await f.slice(0, f.size).arrayBuffer())) });
  }
  const text = async (k: ExportFile) => {
    const r = files.get(k);
    if (!r) return null;
    try {
      return (await r.text()).replace(/^﻿/, "");
    } catch (e) {
      problems.push(e instanceof ZipProblem ? e.message : `${shownFileName(r.name)} couldn't be read.`);
      return null;
    }
  };
  const found: ExportRead["found"] = {};
  // Connections first: its profile links tell accepted invitations apart.
  const connText = await text("connections");
  const conn = connText ? parseConnections(connText) : null;
  if (connText && conn && !conn.ok) problems.push("Connections.csv didn't read as LinkedIn's connections file, so it is left out.");
  const conns = conn && conn.ok ? conn.rows : [];
  if (conn?.ok) found.connections = conns.length;
  const connSlugs = new Set(conns.map((r) => r.u).filter(Boolean) as string[]);

  const invText = await text("invitations");
  const invites = invText ? parseInvitations(invText).filter((x) => !connSlugs.has(x.u)) : [];
  if (invText) found.invitations = invites.length;

  const posText = await text("positions");
  const positions = posText ? parsePositions(posText) : [];
  if (posText) found.positions = positions.length;

  const msgText = await text("messages");
  const warm = msgText ? messageWarmth(msgText) : null;
  if (msgText) found.messages = warm?.messages ?? 0;

  const recInText = await text("recsReceived");
  const recOutText = await text("recsGiven");
  const endInText = await text("endorseReceived");
  const endOutText = await text("endorseGiven");
  const recIn = recInText ? parseRecs(recInText, "in", true) : [];
  const recOut = recOutText ? parseRecs(recOutText, "out", false) : [];
  const ends = [...(endInText ? parseEndorsements(endInText, "in") : []), ...(endOutText ? parseEndorsements(endOutText, "out") : [])];
  if (recInText) found.recsReceived = recIn.length;
  if (recOutText) found.recsGiven = recOut.length;
  if (endInText) found.endorseReceived = ends.filter((e) => e.k === "in").length;
  if (endOutText) found.endorseGiven = ends.filter((e) => e.k === "out").length;

  const folText = await text("companyFollows");
  const follows = folText ? parseFollows(folText) : [];
  if (folText) found.companyFollows = follows.length;

  const posts: { day: string; text: string }[] = [];
  for (const k of ["shares", "comments", "richMedia"] as const) {
    const t = await text(k);
    if (t === null) continue;
    const p = parsePosts(t, k);
    found[k] = p.length;
    posts.push(...p);
  }
  posts.sort((a, b) => b.day.localeCompare(a.day));
  const recent = posts.slice(0, LIX_LIMITS.posts).map((p) => p.text);

  const skText = await text("skills");
  const skills = skText ? parseSkills(skText) : [];
  if (skText) found.skills = skills.length;

  // Strong ties as the browser can see them: endorsements by link, recommendations by exact name and company in the connections.
  const nameCo = new Set(conns.filter((r) => r.c).map((r) => `${r.f.toLowerCase()} ${r.l.toLowerCase()}|${r.c!.toLowerCase()}`));
  const vouchN = new Set([...ends.map((e) => e.u).filter((u) => connSlugs.has(u)), ...[...recIn, ...recOut].filter((r) => r.c && nameCo.has(`${r.f.toLowerCase()} ${r.l.toLowerCase()}|${r.c.toLowerCase()}`)).map((r) => `${r.f} ${r.l}|${r.c}`)]).size;

  const current = positions.filter((p) => !p.e).map((p) => p.t);
  const voiceOf = (prior?: VoiceStyle | null) => {
    const v = voiceFromPosts(recent, prior);
    if (!v) return null;
    try {
      return cleanVoice(v);
    } catch {
      return null;
    }
  };
  return {
    found,
    skipped: [...new Set(skipped)].sort((a, b) => a.localeCompare(b)),
    problems,
    preview: {
      connections: conns.length,
      namesOnly: !!(conn && conn.ok && conn.namesOnly),
      invites: invites.length,
      positions: positions.length,
      fractionalPositions: positions.filter((p) => kindOfTitle(p.t)).length,
      warmPeople: warm?.rows.length ?? 0,
      messages: warm?.messages ?? 0,
      vouch: vouchN,
      recsReceived: recIn.length,
      follows: follows.length,
      posts: recent.length,
      skills: skills.length,
    },
    voice: voiceOf,
    payload: (uses, prior) => {
      const on = new Set(uses);
      const p: ExportPayload = { v: 1, uses: [...on], files: [...files.keys()] };
      if (on.has("know") && connText && conn?.ok) p.connections = connText;
      if (on.has("know") && invites.length) p.invites = invites;
      if (on.has("seats") && positions.length) p.positions = positions;
      if (on.has("warm") && warm?.rows.length) p.warm = warm.rows.map((w) => ({ profileSlug: w.profileSlug, sent: w.sent, received: w.received, first: w.first, last: w.last }));
      if (on.has("vouch") || on.has("proof")) {
        const recs = [...recIn, ...recOut].map((r) => {
          const keepText = on.has("proof") && r.k === "in" && r.text;
          const { text: _t, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
          return keepText ? { ...rest, text: r.text } : rest;
        });
        if (recs.length) p.recs = on.has("vouch") ? recs : recs.filter((r) => r.k === "in");
        if (on.has("vouch") && ends.length) p.endorsements = ends;
      }
      if (on.has("follows") && follows.length) p.follows = follows;
      if (on.has("voice")) {
        const v = voiceOf(prior);
        if (v) p.voice = v;
      }
      if (on.has("skills")) {
        const fn = fnFromSkills(skills, current);
        const title = current[0];
        if (fn || title) p.skills = { ...(fn ? { fn } : {}), ...(title ? { title: title.slice(0, 80) } : {}) };
      }
      return p;
    },
  };
}
