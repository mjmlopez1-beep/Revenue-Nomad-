/**
 * The call recorders Merlin reads, one CallRecorder each (lib/calls/types.ts), for the "A call
 * ends" trigger and the connector's get_call_pack:
 *
 *   granola   lib/granola: Connect Granola (Granola's MCP server: search_meetings, get_meetings,
 *             get_meeting_transcript) or a pasted API key (Granola's REST API). RN_GRANOLA.
 *   fathom    lib/calls/fathom.ts: a pasted API key (X-Api-Key, api.fathom.ai/external/v1). RN_FATHOM.
 *
 * Later (no code yet): Fireflies, Zoom, Gong. Each is one more entry in RECORDERS with its own
 * connection; nothing outside this file and its connect row changes.
 */
import { domainOf, workDomain } from "../google/types";
import { granolaOn } from "../granola/types";
import { fathomEnded, fathomLinkOf, fathomOn, fathomTranscript } from "./fathom";
import { RECORDER_NAMES, TRANSCRIPT_MAX, type CallRecorder, type EndedCall, type RecorderKey } from "./types";

type Who = { id: string; email: string; name: string };
const ownDomains = (m: Who) => new Set([domainOf(m.email)].filter((x): x is string => !!x));
/** Who else was on it, paired (the member left out, real addresses only), for the one-tap start's "who signs". */
const peopleOf = (m: Who, people: { name?: string; email: string }[]) =>
  people
    .filter((p) => !!domainOf(p.email) && p.email.toLowerCase() !== m.email.toLowerCase())
    .slice(0, 8)
    .map((p) => ({ name: String(p.name ?? "").trim().slice(0, 80), email: p.email.toLowerCase() }));
/** The people on a call as the trigger reads them: emails, their work domains (not free mail, not the member's own), names. */
const participants = (m: Who, people: { name?: string; email: string }[]) => {
  const own = ownDomains(m);
  const emails = [...new Set(people.map((p) => p.email.toLowerCase()).filter((e) => !!domainOf(e) && e !== m.email.toLowerCase()))];
  const domains = [...new Set(emails.map((e) => workDomain(e, own)).filter((d): d is string => !!d))];
  const names = [...new Set(people.map((p) => String(p.name ?? "").trim()).filter(Boolean))].slice(0, 12);
  return { emails: emails.slice(0, 30), domains: domains.slice(0, 10), names };
};

const granola: CallRecorder = {
  key: "granola",
  name: RECORDER_NAMES.granola,
  on: granolaOn,
  connected: (s, memberId) => !!(s as { granola?: Record<string, unknown> }).granola?.[memberId],
  async listEndedSince(m, sinceMs, nowMs, max) {
    const { endedCallsFor } = await import("../granola");
    const calls = await endedCallsFor(m.id, sinceMs, nowMs, max);
    return calls.map((c): EndedCall => ({ id: c.id, recorder: "granola", ...(c.title ? { title: c.title } : {}), startedAt: c.startedAt, endedAt: c.endedAt, participants: participants(m, c.with), people: peopleOf(m, c.with) }));
  },
  async transcript(m, id) {
    // Granola's reader pages through get_meeting_transcript (or the REST API's pages) itself, up to Merlin's cap.
    const { granolaTranscript } = await import("../granola");
    const t = await granolaTranscript(m.id, id);
    return { text: t.text.slice(0, TRANSCRIPT_MAX), next: null };
  },
};

const fathom: CallRecorder = {
  key: "fathom",
  name: RECORDER_NAMES.fathom,
  on: fathomOn,
  connected: (s, memberId) => !!fathomLinkOf(s, memberId),
  async listEndedSince(m, sinceMs, nowMs, max) {
    const ms = await fathomEnded(m, sinceMs, nowMs, max);
    return ms.map((x): EndedCall => ({ id: x.id, recorder: "fathom", ...(x.title ? { title: x.title } : {}), startedAt: x.startedAt, endedAt: x.endedAt, participants: participants(m, x.others), people: peopleOf(m, x.others) }));
  },
  async transcript(m, id) {
    return { text: await fathomTranscript(m.id, id, TRANSCRIPT_MAX), next: null };
  },
};

/** Every recorder, in the order Settings lists them. Add Fireflies, Zoom, Gong here. */
export const RECORDERS: Record<RecorderKey, CallRecorder> = { granola, fathom };
export const recorderOf = (k: string): CallRecorder | null => (k in RECORDERS ? RECORDERS[k as RecorderKey] : null);
/** The recorders switched on for Merlin and connected by this member. */
export const connectedRecorders = (s: unknown, memberId: string): CallRecorder[] => Object.values(RECORDERS).filter((r) => r.on() && r.connected(s, memberId));

/** A call's whole transcript, page after page, up to Merlin's cap. Read for the run and dropped. */
export async function readTranscript(r: CallRecorder, m: Who, id: string): Promise<string> {
  let text = "";
  let cursor: string | null = null;
  for (let i = 0; i < 40; i++) {
    const p = await r.transcript(m, id, cursor);
    text += (text && !text.endsWith("\n") ? "\n" : "") + p.text;
    if (!p.next || text.length >= TRANSCRIPT_MAX) break;
    cursor = p.next;
  }
  return text.slice(0, TRANSCRIPT_MAX);
}
