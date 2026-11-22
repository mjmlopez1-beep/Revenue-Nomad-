/**
 * Granola for one member (lib/granola/types.ts says what is kept and why): connect a personal API
 * key, the status the page shows, Disconnect, the recent calls with a company or a person, and
 * one picked call's transcript for drafting (granolaTranscript).
 *
 * The key is sealed at rest and opened only here, right before a request to Granola. It is never
 * logged, never in an answer (only its last four characters) and never in the admin export.
 * Nothing Granola returns is stored: calls are read when the member opens the picker and dropped
 * with the answer, a transcript when the member picks a call, for that request alone. A note's
 * title goes to the member only when they asked for titles, and never into a log, an alert or a count.
 */
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { seal, unseal } from "../google/crypto";
import { domainOf } from "../google/types";
import { MAX_TRANSCRIPT } from "../proposals/extract";
import * as G from "./api";
import {
  CALLS_MAX, CALL_DAYS, GRANOLA_WORDS as W, KEY_SHAPE, NOTES_READ_MAX, NOTE_ID, granolaOn,
  type CallPerson, type CallsAnswer, type GranolaCall, type GranolaLink, type GranolaStatus, type GranolaTranscript,
} from "./types";

export { granolaOn } from "./types";
export type { CallsAnswer, GranolaCall, GranolaStatus, GranolaTranscript } from "./types";

const DAY = 86_400_000;
/** A refusal in the member's words, with the HTTP status the route answers. */
export class GranolaProblem extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "",
  ) {
    super(message);
  }
}

type GState = State & { granola?: Record<string, GranolaLink> };
const linksOf = (s: State) => ((s as GState).granola ??= {});
export const linkOf = (s: State, memberId: string): GranolaLink | undefined => (s as GState).granola?.[memberId];

async function who(token: string | null | undefined): Promise<{ seed: Seed; s: State; m: Member } | null> {
  if (!token) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? { seed, s, m } : null;
}
async function signedIn(token: string | null | undefined) {
  if (!granolaOn()) throw new GranolaProblem(W.off, 404, "off");
  const w = await who(token);
  if (!w) throw new GranolaProblem("You're signed out. Sign in again.", 401, "signed_out");
  return w;
}

function statusOf(s: State, m: Member, nowMs = Date.now()): GranolaStatus {
  const l = linkOf(s, m.id);
  const canDraft = T.closeNow(s, m.id, nowMs);
  if (!granolaOn()) return { on: false, connected: false, canDraft };
  if (!l) return { on: true, connected: false, canDraft };
  return { on: true, connected: true, last4: l.last4, connectedAt: l.connectedAt, ...(l.badAt ? { broken: true } : {}), canDraft };
}

/** GET status: what the Integrations card and the picker show. Null when signed out. */
export async function granolaStatus(token: string | null | undefined, nowMs = Date.now()): Promise<GranolaStatus | null> {
  const w = await who(token);
  return w ? statusOf(w.s, w.m, nowMs) : null;
}

/** Granola's refusal in the member's words. `transcript`: the request was for a transcript. */
function wordsFor(e: unknown, o: { connecting?: boolean; transcript?: boolean } = {}): GranolaProblem {
  if (!(e instanceof G.GranolaError)) return new GranolaProblem(W.down, 424, "error");
  switch (e.code) {
    case "bad_key":
      return new GranolaProblem(o.connecting ? W.badKey : W.revoked, o.connecting ? 400 : 409, "bad_key");
    case "no_plan":
      return new GranolaProblem(W.noPlan, 403, "no_plan");
    case "suspended":
      return new GranolaProblem(W.suspended, 403, "suspended");
    case "ip":
      return new GranolaProblem(W.ip, 403, "ip");
    case "forbidden":
      return new GranolaProblem(o.transcript ? W.noTranscripts : W.scope, 403, o.transcript ? "no_transcripts" : "forbidden");
    case "not_found":
      return new GranolaProblem(W.notFound, 404, "not_found");
    case "busy":
      return new GranolaProblem(W.busy, 429, "busy");
    default:
      return new GranolaProblem(W.down, 424, e.code);
  }
}

/** The member's key, opened. A key that won't open (another server secret) is as good as none. */
async function keyFor(memberId: string): Promise<string> {
  const s = await loadState();
  const l = linkOf(s, memberId);
  if (!l) throw new GranolaProblem(W.notConnected, 409, "not_connected");
  const key = unseal(l.key);
  if (!key) throw new GranolaProblem(W.revoked, 409, "bad_key");
  return key;
}

/** After a call: a refused key is marked (the card says so), a working one dated (at most hourly, so reads don't write each time). */
async function noteOutcome(memberId: string, e: unknown, nowMs = Date.now()) {
  const bad = e instanceof G.GranolaError && e.code === "bad_key";
  const l = linkOf(await loadState(), memberId);
  if (!l) return;
  if (bad && !l.badAt) await T.mutate((s) => void (linkOf(s, memberId) && (linkOf(s, memberId)!.badAt = new Date(nowMs).toISOString())));
  if (!e && (l.badAt || !l.okAt || nowMs - Date.parse(l.okAt) > 3_600_000))
    await T.mutate((s) => {
      const x = linkOf(s, memberId);
      if (!x) return;
      x.okAt = new Date(nowMs).toISOString();
      delete x.badAt;
    });
}
async function withKey<T>(memberId: string, work: (key: string) => Promise<T>, o: { transcript?: boolean } = {}): Promise<T> {
  const key = await keyFor(memberId);
  try {
    const out = await work(key);
    await noteOutcome(memberId, null).catch(() => {});
    return out;
  } catch (e) {
    if (e instanceof GranolaProblem) throw e;
    await noteOutcome(memberId, e).catch(() => {});
    console.error(`Granola: a request failed (${e instanceof G.GranolaError ? e.code : "error"})`);
    throw wordsFor(e, o);
  }
}

/* ---------- connect and disconnect ---------- */

/** POST connect { key }: check the key with one cheap call (one note), then keep it sealed. */
export async function connectGranola(token: string | null | undefined, rawKey: unknown, nowMs = Date.now()): Promise<{ status: GranolaStatus; message: string }> {
  const w = await signedIn(token);
  const key = String(rawKey ?? "").trim();
  if (!KEY_SHAPE.test(key)) throw new GranolaProblem(W.shape, 400, "shape");
  try {
    await G.listNotes(key, { pageSize: 1 });
  } catch (e) {
    console.error(`Granola connect: the key check failed (${e instanceof G.GranolaError ? e.code : "error"})`);
    throw wordsFor(e, { connecting: true });
  }
  const at = new Date(nowMs).toISOString();
  const link: GranolaLink = { key: seal(key), last4: key.slice(-4), connectedAt: at, okAt: at };
  const s = await T.mutate((d) => {
    linksOf(d)[w.m.id] = link;
    return d;
  });
  return { status: statusOf(s, w.m, nowMs), message: "Granola is connected. Pick a call when you start a proposal." };
}

/** POST disconnect: delete the key. Granola keeps it until the member revokes it there. */
export async function disconnectGranola(token: string | null | undefined, nowMs = Date.now()): Promise<{ status: GranolaStatus; message: string }> {
  const w = await who(token);
  if (!w) throw new GranolaProblem("You're signed out. Sign in again.", 401, "signed_out");
  const s = await T.mutate((d) => {
    delete (d as GState).granola?.[w.m.id];
    return d;
  });
  return { status: statusOf(s, w.m, nowMs), message: "Granola is disconnected. Merlin deleted your key. To turn it off in Granola too, revoke it under Settings, Connectors, API keys." };
}

/** Account closure (lib/account.ts) and the 30-day delete (lib/table.ts purgeMember): the key goes, inside the caller's mutate. */
export function forgetGranolaIn(s: State, memberId: string): void {
  delete (s as GState).granola?.[memberId];
}

/* ---------- the calls ---------- */

const low = (x: unknown) => String(x ?? "").trim().toLowerCase();
const validIso = (x: unknown) => (typeof x === "string" && Number.isFinite(Date.parse(x)) ? x : null);

type Filter = { kind: "company"; domain: string } | { kind: "email"; email: string } | { kind: "recent" };
const matches = (f: Filter, email: string) =>
  f.kind === "recent" ? false : f.kind === "email" ? email === f.email : !!domainOf(email) && (domainOf(email) === f.domain || domainOf(email)!.endsWith(`.${f.domain}`));

/** One note as a call: who else was on it (attendees and invitees, without the member and the note's owner), when, how long. */
function callOf(n: G.Note, ref: G.NoteRef | undefined, own: Set<string>, f: Filter, titles: boolean): (GranolaCall & { hit: boolean }) | null {
  const people = new Map<string, CallPerson>();
  for (const a of n.attendees ?? []) {
    const email = low(a?.email);
    if (email && !people.has(email)) people.set(email, { name: String(a?.name ?? "").trim().slice(0, 80), email });
  }
  for (const i of n.calendar_event?.invitees ?? []) {
    const email = low(i?.email);
    if (email && !people.has(email)) people.set(email, { name: "", email });
  }
  for (const o of [...own, low(n.owner?.email ?? ref?.owner?.email)]) if (o) people.delete(o);
  const all = [...people.values()].filter((p) => domainOf(p.email));
  const hit = all.some((p) => matches(f, p.email));
  const sorted = [...all.filter((p) => matches(f, p.email)), ...all.filter((p) => !matches(f, p.email))];
  const start = validIso(n.calendar_event?.scheduled_start_time);
  const end = validIso(n.calendar_event?.scheduled_end_time);
  const when = start ?? validIso(ref?.meeting_at) ?? validIso(n.meeting_at) ?? validIso(n.created_at) ?? validIso(ref?.created_at);
  if (!when) return null;
  const mins = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 60_000) : NaN;
  const title = String(n.title ?? ref?.title ?? "").trim();
  return { noteId: n.id, when, minutes: mins > 0 && mins <= 12 * 60 ? mins : null, with: sorted.slice(0, 8), more: Math.max(0, sorted.length - 8), ...(titles && title ? { title: title.slice(0, 200) } : {}), hit };
}

/** The member's own addresses, never counted as the other side of a call. */
const ownOf = (m: Member) => new Set([low(m.email)].filter(Boolean));

/** The company's domain as the member sees it on Merlin: refused while the company is locked for them. */
async function companyDomain(m: Member, companyId: string): Promise<string> {
  const { memberView } = await import("../mcp/view");
  const info = (await memberView(m)).byId.get(companyId);
  if (!info) throw new GranolaProblem(W.noCompany, 404, "no_company");
  if (info.c.hidden) throw new GranolaProblem(W.locked, 403, "locked");
  const d = String(info.domain ?? "").toLowerCase().replace(/^www\./, "");
  if (!d || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new GranolaProblem(W.noDomain, 409, "no_domain");
  return d;
}

/**
 * Recent calls (the last CALL_DAYS days) with anyone at a company's domain, with one email, or any
 * recent call (`recent`), newest first. Granola's search finds the meetings with that domain or
 * email on the invite; the newest notes are read too, since a note is searchable only a while
 * after its summary is written (today's call may not be there yet). Each candidate note is read
 * once, without its transcript, and checked here against its attendees.
 */
export async function callsFor(m: Member, a: { companyId?: unknown; email?: unknown; recent?: unknown; titles?: unknown }, nowMs = Date.now()): Promise<CallsAnswer> {
  if (!granolaOn()) throw new GranolaProblem(W.off, 404, "off");
  let f: Filter;
  const email = low(a.email);
  if (typeof a.companyId === "string" && a.companyId) f = { kind: "company", domain: await companyDomain(m, a.companyId) };
  else if (email) {
    if (!domainOf(email) || email.length > 200) throw new GranolaProblem(W.email, 400, "email");
    f = { kind: "email", email };
  } else f = { kind: "recent" };
  const titles = a.titles === true || a.titles === "1";
  const fromMs = nowMs - CALL_DAYS * DAY;
  const own = ownOf(m);
  return withKey(m.id, async (key) => {
    const refs = new Map<string, G.NoteRef>();
    const add = (ns: G.NoteRef[]) => ns.forEach((n) => NOTE_ID.test(n.id) && !refs.has(n.id) && refs.set(n.id, n));
    if (f.kind === "recent") add((await G.listNotes(key, { createdAfterMs: fromMs })).notes);
    else {
      const participant = f.kind === "email" ? f.email : f.domain;
      try {
        let page = await G.searchNotes(key, { participant, fromMs });
        add(page.notes);
        if (page.cursor) {
          page = await G.searchNotes(key, { participant, fromMs, cursor: page.cursor });
          add(page.notes);
        }
      } catch (e) {
        // A search Granola won't run (an odd domain): the newest notes alone still answer.
        if (!(e instanceof G.GranolaError) || e.code !== "invalid") throw e;
      }
      add((await G.listNotes(key, { createdAfterMs: nowMs - 2 * DAY })).notes);
    }
    const newest = [...refs.values()]
      .map((r) => ({ r, at: Date.parse(r.meeting_at ?? r.created_at ?? "") || 0 }))
      .filter((x) => !x.at || x.at >= fromMs - DAY)
      .sort((x, y) => y.at - x.at)
      .slice(0, NOTES_READ_MAX);
    const notes = await Promise.all(
      newest.map(({ r }) =>
        G.getNote(key, r.id).catch((e) => {
          // A note deleted or not readable since the list: left out. Anything else stops the answer.
          if (e instanceof G.GranolaError && e.code === "not_found") return null;
          throw e;
        }),
      ),
    );
    const calls = notes
      .map((n, i) => (n && typeof n.id === "string" ? callOf(n, newest[i].r, own, f, titles) : null))
      .filter((c): c is GranolaCall & { hit: boolean } => !!c && Date.parse(c.when) >= fromMs && (f.kind === "recent" || c.hit))
      .sort((x, y) => y.when.localeCompare(x.when))
      .slice(0, CALLS_MAX)
      .map(({ hit: _hit, ...c }) => c); // eslint-disable-line @typescript-eslint/no-unused-vars
    return { calls, by: f, days: CALL_DAYS };
  });
}

/** GET calls (the picker): the signed-in member's calls. */
export async function granolaCalls(token: string | null | undefined, a: Parameters<typeof callsFor>[1], nowMs = Date.now()): Promise<CallsAnswer> {
  const w = await signedIn(token);
  return callsFor(w.m, a, nowMs);
}

/* ---------- one call's transcript, for drafting ---------- */

const MAX_PAGES = 80;

/** "Name: what they said", one speaker turn a line. The member's own lines carry their name, so the reader knows them. */
function linesOf(items: G.TranscriptItem[], meName: string, themName: string): string {
  const out: { who: string; text: string }[] = [];
  let size = 0;
  for (const it of items) {
    const text = String(it?.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const sp = it?.speaker ?? {};
    const who =
      String(sp.name ?? "").trim() ||
      (sp.attribution === "me" ? meName : sp.attribution === "them" ? themName : "") ||
      String(sp.diarization_label ?? "").trim() ||
      (sp.source === "microphone" ? meName : sp.source === "speaker" ? themName : "Speaker");
    const last = out[out.length - 1];
    if (last && last.who === who) last.text += ` ${text}`;
    else out.push({ who, text });
    size += text.length + who.length + 3;
    if (size > MAX_TRANSCRIPT) break;
  }
  return out
    .map((l) => `${l.who}: ${l.text}`)
    .join("\n")
    .slice(0, MAX_TRANSCRIPT);
}

function minutesOf(items: G.TranscriptItem[]): number | null {
  const starts = items.map((i) => Date.parse(i?.start_time ?? "")).filter(Number.isFinite);
  const ends = items.map((i) => Date.parse(i?.end_time ?? "")).filter(Number.isFinite);
  if (!starts.length || !ends.length) return null;
  const m = Math.round((Math.max(...ends) - Math.min(...starts)) / 60_000);
  return m > 0 && m <= 12 * 60 ? m : null;
}

/**
 * One call's transcript as text, with who was on it, for the drafting code (the picker's
 * transcript route, and the draft-from-call path given a Granola note id). Read from Granola now
 * and returned: nothing of it is kept here. The caller gates drafting (Close).
 */
export async function granolaTranscript(memberId: string, noteId: string, o: { titles?: boolean } = {}): Promise<GranolaTranscript> {
  if (!granolaOn()) throw new GranolaProblem(W.off, 404, "off");
  const id = String(noteId ?? "").trim();
  if (!NOTE_ID.test(id)) throw new GranolaProblem(W.notFound, 404, "not_found");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = T.memberIndex(seed, s).all.find((x) => x.id === memberId);
  if (!m) throw new GranolaProblem("You're signed out. Sign in again.", 401, "signed_out");
  return withKey(
    m.id,
    async (key) => {
      let note: G.Note;
      let items: G.TranscriptItem[] | null;
      try {
        note = await G.getNote(key, id, true);
        items = Array.isArray(note.transcript) ? note.transcript : null;
      } catch (e) {
        if (!(e instanceof G.GranolaError) || e.code !== "too_large") throw e;
        // Too long to come with the note: the note alone, then the transcript in pages.
        note = await G.getNote(key, id, false);
        items = [];
        let cursor: string | null = null;
        for (let i = 0; i < MAX_PAGES; i++) {
          const p = await G.transcriptPage(key, id, cursor);
          items.push(...p.items);
          if (!p.cursor) break;
          cursor = p.cursor;
        }
      }
      // No transcript with the note: either transcripts are off over the API for the workspace (the transcript route says 403), or there is none.
      if (items === null) {
        items = (await G.transcriptPage(key, id, null, 1)).items;
      }
      const call = callOf(note, undefined, ownOf(m), { kind: "recent" }, !!o.titles);
      const attendees = call?.with ?? [];
      const others = attendees.filter((p) => p.name);
      const text = linesOf(items ?? [], m.name || "Me", others.length === 1 ? others[0].name : "Them");
      if (!text.trim()) throw new GranolaProblem(W.noTranscript, 404, "no_transcript");
      return { noteId: note.id || id, when: call?.when ?? new Date().toISOString(), minutes: minutesOf(items ?? []) ?? call?.minutes ?? null, attendees, text, ...(call?.title ? { title: call.title } : {}) };
    },
    { transcript: true },
  );
}

/** GET transcript (the picker): the signed-in member's picked call. Drafting from a call is Close (the trial counts). */
export async function transcriptForPicker(token: string | null | undefined, noteId: unknown, o: { titles?: unknown } = {}, nowMs = Date.now()): Promise<GranolaTranscript> {
  const w = await signedIn(token);
  if (!T.closeNow(w.s, w.m.id, nowMs)) throw new GranolaProblem(W.close, 403, "close");
  return granolaTranscript(w.m.id, String(noteId ?? ""), { titles: o.titles === true || o.titles === "1" });
}
