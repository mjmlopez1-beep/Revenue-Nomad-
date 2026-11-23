/**
 * Reading Granola's MCP tool answers (lib/granola/mcp.ts) into what Merlin needs: meetings (id,
 * when, how long, who was on it, the title only for the member) and one transcript's text.
 *
 * Granola's tools answer in text that is XML-like for some tools and JSON for others, and may
 * also send structuredContent. Both shapes are read here, tolerantly: a field Merlin can't find is
 * left out, never guessed. Pure functions, no network, for scripts/test-granola.mts.
 */
import type { CallPerson } from "./types";

export interface Meeting {
  id: string;
  when: string | null;
  minutes: number | null;
  title: string;
  people: CallPerson[];
  /** The note's creator, when the answer marks them (not "the other side" of the call). */
  creator: string | null;
}
export interface TranscriptPage {
  text: string;
  next: number | null;
  /** Why there is no transcript (transcript_pending, no_transcript, ...), when Granola said. */
  unavailable: string | null;
}

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const ent = (x: string) =>
  x
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
const validIso = (x: unknown) => (typeof x === "string" && x.length < 60 && Number.isFinite(Date.parse(x)) ? new Date(Date.parse(x)).toISOString() : null);
const str = (x: unknown) => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");
const minutesBetween = (a: string | null, b: string | null) => {
  if (!a || !b) return null;
  const m = Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
  return m > 0 && m <= 12 * 60 ? m : null;
};

/** Attributes of one XML-like tag: name="value" pairs. */
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = ent(m[2] ?? m[3] ?? "");
  return out;
}
const child = (body: string, ...names: string[]) => {
  for (const n of names) {
    const m = new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, "i").exec(body);
    if (m) return ent(m[1].replace(/<[^>]+>/g, "").trim());
  }
  return "";
};

/** People in a block of text: <participant name= email=/> tags, "Name <email>" pairs, then bare emails. */
function peopleIn(body: string): { people: CallPerson[]; creator: string | null } {
  const people = new Map<string, CallPerson>();
  let creator: string | null = null;
  const add = (name: string, email: string) => {
    const e = email.trim().toLowerCase();
    if (!e || e.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
    const was = people.get(e);
    if (!was || (!was.name && name)) people.set(e, { name: name.trim().replace(/^["']|["']$/g, "").slice(0, 80), email: e });
  };
  for (const m of body.matchAll(/<(participant|attendee|person|invitee|creator|note_creator|owner)\b([^>]*?)\/?>(?:([^<]*)<\/\1>)?/gi)) {
    const a = attrs(m[2]);
    const email = a.email || (m[3] ?? "").match(EMAIL)?.[0] || "";
    const name = a.name || (m[3] ?? "").replace(EMAIL, "").replace(/[<>()]/g, "").trim();
    const role = `${m[1]} ${a.role ?? ""} ${a.type ?? ""} ${a.is_creator === "true" ? "creator" : ""}`.toLowerCase();
    if (/creator|owner/.test(role) && email) creator = email.toLowerCase();
    add(ent(name), email);
  }
  // The rest as plain text: other tags out, then entities decoded ("Dana &lt;dana@...&gt;" is "Dana <dana@...>").
  const plain = ent(body.replace(/<(participant|attendee|person|invitee|creator|note_creator|owner)\b[^>]*?\/?>(?:[^<]*<\/\1>)?/gi, " ").replace(/<\/?[A-Za-z_][^<>]*>/g, "\n"));
  for (const m of plain.matchAll(/([^\n<>,;()"]{1,80}?)\s*<([^<>\s]+@[^<>\s]+)>/g)) add(m[1].replace(/^[\s\-*:]+/, ""), m[2]);
  for (const m of plain.matchAll(EMAIL)) add("", m[0]);
  return { people: [...people.values()], creator };
}

/** People from a JSON field: [{name, email}], ["Name <email>"], or { participants: [...] }. */
function peopleOfJson(x: unknown): CallPerson[] {
  const list = Array.isArray(x) ? x : x && typeof x === "object" ? ((x as Record<string, unknown>).participants ?? (x as Record<string, unknown>).attendees ?? (x as Record<string, unknown>).items) : null;
  if (!Array.isArray(list)) return [];
  const out: CallPerson[] = [];
  for (const p of list) {
    if (typeof p === "string") out.push(...peopleIn(p).people);
    else if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      const email = str(o.email ?? o.email_address).toLowerCase();
      if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.push({ name: str(o.name ?? o.display_name).slice(0, 80), email });
    }
  }
  return out;
}

function meetingOfJson(o: Record<string, unknown>): Meeting | null {
  const id = str(o.id ?? o.meeting_id ?? o.note_id ?? o.document_id);
  if (!id) return null;
  const when = validIso(o.meeting_at ?? o.start ?? o.start_time ?? o.scheduled_start ?? o.date ?? o.created_at);
  const end = validIso(o.end ?? o.end_time ?? o.scheduled_end ?? o.meeting_end);
  const people = [...peopleOfJson(o.known_participants), ...peopleOfJson(o.participants), ...peopleOfJson(o.attendees)];
  const creatorRaw = o.creator ?? o.note_creator ?? o.owner;
  const creator = creatorRaw && typeof creatorRaw === "object" ? str((creatorRaw as Record<string, unknown>).email).toLowerCase() || null : typeof creatorRaw === "string" ? (creatorRaw.match(EMAIL)?.[0] ?? "").toLowerCase() || null : null;
  const dur = typeof o.duration_minutes === "number" ? Math.round(o.duration_minutes) : null;
  return { id, when, minutes: dur && dur > 0 && dur <= 720 ? dur : minutesBetween(when, end), title: str(o.title ?? o.name).slice(0, 300), people: dedupe(people), creator };
}
const dedupe = (ps: CallPerson[]) => {
  const m = new Map<string, CallPerson>();
  for (const p of ps) if (!m.has(p.email) || (!m.get(p.email)!.name && p.name)) m.set(p.email, p);
  return [...m.values()];
};

function meetingsOfJson(data: unknown): Meeting[] | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const list = Array.isArray(data) ? data : (o.meetings ?? o.results ?? o.notes ?? o.items ?? o.data);
  if (!Array.isArray(list)) return o.id || o.meeting_id ? [meetingOfJson(o)].filter((x): x is Meeting => !!x) : null;
  return list.map((x) => (x && typeof x === "object" ? meetingOfJson(x as Record<string, unknown>) : null)).filter((x): x is Meeting => !!x);
}

function meetingsOfXml(text: string): Meeting[] {
  // Upcoming meetings (evt_...) come in their own block: never a call that happened.
  const past = text.replace(/<upcoming_meetings\b[\s\S]*?<\/upcoming_meetings>/gi, "");
  const out: Meeting[] = [];
  for (const m of past.matchAll(/<(meeting|note|document)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const a = attrs(m[2]);
    const body = m[3];
    const id = a.id || a.meeting_id || a.note_id || child(body, "id", "meeting_id");
    if (!id) continue;
    const when = validIso(a.meeting_at || a.start || a.date || a.scheduled_start || child(body, "meeting_at", "start", "date") || a.created_at || child(body, "created_at"));
    const end = validIso(a.end || a.meeting_end || a.scheduled_end || child(body, "end", "meeting_end"));
    const blocks = [...body.matchAll(/<(known_participants|participants|attendees|creator|note_creator|owner)\b[^>]*>([\s\S]*?)<\/\1>|<(?:creator|note_creator|owner|participant)\b[^>]*\/>/gi)].map((x) => x[0]).join("\n");
    const { people, creator } = peopleIn(blocks || "");
    const dur = Number(a.duration_minutes || a.minutes || "");
    out.push({ id: id.trim(), when, minutes: dur > 0 && dur <= 720 ? Math.round(dur) : minutesBetween(when, end), title: (a.title || child(body, "title")).slice(0, 300), people, creator });
  }
  return out;
}

/** search_meetings and get_meetings: the meetings in the answer, upcoming ones left out. */
export function readMeetings(a: { text: string; data: unknown }): Meeting[] {
  const fromJson = meetingsOfJson(a.data);
  const list = fromJson ?? meetingsOfXml(a.text);
  return list.filter((m) => !/^evt_/i.test(m.id));
}

/** The cursor for the next page of search_meetings, when Granola gave one. */
export function nextCursor(a: { text: string; data: unknown }): string | null {
  const o = a.data && typeof a.data === "object" ? (a.data as Record<string, unknown>) : null;
  const c = o ? str(o.next_cursor) : (/<next_cursor>([^<]+)<\/next_cursor>/i.exec(a.text)?.[1] ?? /next_cursor="([^"]+)"/i.exec(a.text)?.[1] ?? "").trim();
  return c && c.length <= 2048 ? c : null;
}

/** get_meeting_transcript: this page's text, the next offset, or why there is none. */
export function readTranscriptPage(a: { text: string; data: unknown }): TranscriptPage {
  const o = a.data && typeof a.data === "object" && !Array.isArray(a.data) ? (a.data as Record<string, unknown>) : null;
  if (o) {
    // One meeting asked for: its entry when the answer lists them.
    const one = Array.isArray(o.meetings) ? ((o.meetings[0] as Record<string, unknown>) ?? {}) : o;
    const un = one.transcript_unavailable;
    const reason = un && typeof un === "object" ? str((un as Record<string, unknown>).reason) : typeof un === "string" ? un : "";
    const t = one.transcript ?? one.text;
    const text = typeof t === "string" ? t : Array.isArray(t) ? t.map((b) => (typeof b === "string" ? b : str((b as Record<string, unknown>)?.text))).join("\n") : "";
    const next = typeof one.next_offset === "number" && one.next_offset > 0 ? one.next_offset : null;
    return { text, next: one.truncated === false ? null : next, unavailable: !text.trim() ? reason || (t === null ? "no_transcript" : null) : null };
  }
  const t = a.text;
  const un = /<transcript_unavailable\b([^>]*)\/?>/i.exec(t);
  const wrap = /<transcript\b([^>]*)>([\s\S]*?)<\/transcript>/i.exec(t);
  const at = wrap ? attrs(wrap[1]) : {};
  const body = wrap ? ent(wrap[2]) : ent(t.replace(/<\/?[a-z_]+\b[^>]*>/gi, ""));
  const nx = Number(at.next_offset || /next_offset["']?\s*[:=]\s*["']?(\d+)/i.exec(t)?.[1] || "");
  const truncated = (at.truncated || /truncated["']?\s*[:=]\s*["']?(true|false)/i.exec(t)?.[1] || "").toLowerCase();
  return { text: un && !body.trim() ? "" : body, next: truncated === "false" || !(nx > 0) ? null : nx, unavailable: un ? attrs(un[1]).reason || "no_transcript" : null };
}

/* ---------- a transcript's text as Merlin's lines ---------- */

const TIME = /^\s*\[((?:\d{4}-\d\d-\d\d[T ])?\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?)\]\s*/;
const LABEL = /^([^:\n]{1,60}?):\s+(.*)$/;
const PARTICLE = /^(de|da|del|della|di|du|van|von|der|den|la|le|bin|al|el|y)$/;
/** A speaker's label, not the start of a sentence: an audio source, "Speaker A", or a name of up to five capitalised words. */
function isLabel(l: string): boolean {
  if (!l) return false;
  if (/^(microphone|mic|me|you|system audio|system|them|speaker|speaker [a-z0-9]{1,3})$/i.test(l)) return true;
  if (/[,;?!"]/.test(l) || /\.\s+[a-z]/.test(l)) return false;
  const w = l.split(/\s+/);
  return w.length <= 5 && w.every((x) => /^[\p{Lu}\d]/u.test(x) || PARTICLE.test(x));
}
const secondsOf = (t: string) => {
  if (/^\d{4}-/.test(t)) return Date.parse(t.replace(" ", "T")) / 1000;
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

/**
 * Granola's transcript text ("[10:00:05] Dana Whitfield: ...", audio sources "Microphone" and
 * "System audio", or "Speaker A") as "Name: what they said", one speaker turn a line, with the
 * call's length from its first and last times. The member's own audio carries their name.
 */
export function transcriptLines(raw: string, meName: string, themName: string, cap: number): { text: string; minutes: number | null } {
  const out: { who: string; text: string }[] = [];
  const times: number[] = [];
  let size = 0;
  for (const line0 of raw.replace(/\r\n?/g, "\n").split("\n")) {
    let line = line0.trim();
    if (!line) continue;
    const tm = TIME.exec(line);
    if (tm) {
      const s = secondsOf(tm[1]);
      if (Number.isFinite(s)) times.push(s);
      line = line.slice(tm[0].length);
    }
    const lb = LABEL.exec(line);
    let who: string | null = null;
    let text = line;
    const source = lb ? /\((microphone|mic|system audio|system|speaker)\)\s*$/i.exec(lb[1]) : null;
    const label = lb ? lb[1].replace(/\s*\([^)]{0,30}\)\s*$/, "").trim() : "";
    if (lb && isLabel(label)) {
      who = /^(microphone|mic|me|you)$/i.test(label) ? meName : /^(system audio|system|them|speaker)$/i.test(label) ? themName : label;
      text = lb[2];
    } else if (lb && !label && source) {
      who = /^mic/i.test(source[1]) ? meName : themName;
      text = lb[2];
    }
    text = text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && (who === null || last.who === who)) last.text += ` ${text}`;
    else out.push({ who: who ?? "Speaker", text });
    size += text.length + (who?.length ?? 7) + 3;
    if (size > cap) break;
  }
  let minutes: number | null = null;
  if (times.length > 1) {
    let span = times[times.length - 1] - times[0];
    if (span < 0) span += 86_400;
    const m = Math.round(span / 60);
    minutes = m > 0 && m <= 12 * 60 ? m : null;
  }
  return {
    text: out
      .map((l) => `${l.who}: ${l.text}`)
      .join("\n")
      .slice(0, cap),
    minutes,
  };
}
