/**
 * The one-tap starts on the one-screen Proposals home (RN_PROPOSALS2): the member's recent calls
 * from every call recorder they connected (Granola, Fathom), and the companies in their pipeline.
 *
 * Speed: the calls list is fetched in the background and kept in this server's memory per member
 * (fresh for CALLS_FRESH_MS, served while a refresh runs for up to CALLS_KEEP_MS), so opening the
 * home never waits on a recorder twice, and tapping a call never waits on one at all. Right after
 * a list comes in, the newest few calls are read once in the background and turned into a short
 * reading by Merlin's own rules (CallPrep: a summary, what was agreed, the terms, who signs, a few
 * of the buyer's lines). The transcript itself is dropped as soon as that is made: only the
 * reading is kept, in memory, for PREP_KEEP_MS, for this member alone. Merlin's AI later writes
 * "What we heard" and "What I recommend" from the reading, not from the transcript.
 *
 * Privacy: nothing here is written to the state or a log. A company the member hasn't opened is
 * described, never named (companyOfCall). Titles of calls stay here for Merlin's rules (internal or
 * not) and never reach the app. Google data never feeds it.
 */
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { connectedRecorders, readTranscript, recorderOf } from "../calls/providers";
import { kindByRules, readByRules, summaryByRules, RECORDER_NAMES, type RecorderKey } from "../calls/types";
import { STAGE_WORDS, OPEN_STAGES, type Stage } from "../pipeline";
import { extract, parseTranscript, sentences } from "./extract";
import { signerInCall } from "./startCall";
import { moneyOf } from "./library";
import { ProposalProblem } from "./store";
import { cleanCall } from "./brief";

const DAY = 86_400_000;
/** How far back the home looks for calls, and how many it lists. */
export const CALLS_DAYS = 14;
export const CALLS_SHOWN = 6;
export const CALLS_FRESH_MS = 2 * 60_000;
export const CALLS_KEEP_MS = 30 * 60_000;
/** How many of the newest calls are read in the background, and how long a reading is kept. */
export const PREP_AHEAD = 3;
export const PREP_KEEP_MS = 60 * 60_000;
/** Pipeline companies on the home. */
export const COMPANIES_SHOWN = 6;

/** A call as the home lists it. Never a title, never a transcript. */
export interface HomeCall {
  /** "<recorder>:<id>". */
  key: string;
  recorder: RecorderKey;
  recorderName: string;
  id: string;
  when: string;
  minutes: number | null;
  /** The first person from outside the member's company on it, when the recorder named them. */
  who: { name: string; email: string } | null;
  company: { id: string | null; name: string | null; label: string; stage: string | null };
  /** The member's draft from this call already (the call trigger, or an earlier tap). */
  draftId: string | null;
  /** Merlin read it in the background: the document opens with its terms and who signs. */
  ready: boolean;
  /** What the call agreed, when it was read: the fee and the days or hours (for the rate's one calculation in the app). */
  terms?: { fee?: number; allocation?: string };
}
/** A company in the member's pipeline, as the home lists it. */
export interface HomeCompany {
  id: string;
  name: string | null;
  label: string;
  stage: string;
  /** Who the member is talking to there, as they typed it. */
  to: string | null;
  draftId: string | null;
}
export interface HomeView {
  calls: HomeCall[];
  /** The list is on its way from the recorders (first open): ask again in a moment. */
  loading: boolean;
  /** The recorders the member connected, by name ("Granola"). Empty: none. */
  recorders: string[];
  companies: HomeCompany[];
}

/** What Merlin's rules read from one call: kept in memory for a while, never the transcript. */
export interface CallPrep {
  at: number;
  summary: string;
  /** What was agreed, and the terms talked about, one a line. */
  items: string[];
  /** A few of the buyer's own lines (goals, pains, numbers, timing), each with its discovery key. */
  lines: { key: string; text: string }[];
  goal: string | null;
  /** The terms the call settled, as proposal fields (readTerms). */
  terms: Record<string, string>;
  signer: { name?: string; title?: string; email?: string };
  signerOnCall: boolean | null;
  words: number;
}

interface KeptCall {
  recorder: RecorderKey;
  id: string;
  startedAt: string;
  endedAt: string;
  people: { name: string; email: string }[];
  company: HomeCall["company"];
}
interface KeptList {
  at: number;
  calls: KeptCall[];
  going: Promise<void> | null;
}
const lists = new Map<string, KeptList>();
const preps = new Map<string, CallPrep>();
const prepping = new Map<string, Promise<CallPrep | null>>();
const prepKey = (memberId: string, recorder: string, id: string) => `${memberId}|${recorder}:${id}`;

/** For the checks: forget everything kept, or one member's. */
export const _recentKept = {
  clear(memberId?: string) {
    if (!memberId) return void (lists.clear(), preps.clear(), prepping.clear());
    lists.delete(memberId);
    for (const k of [...preps.keys()]) if (k.startsWith(`${memberId}|`)) preps.delete(k);
  },
  lists,
  preps,
};

/** A reading by Merlin's rules from a transcript or notes. Pure: the text goes nowhere. */
export function prepFrom(raw: string, me: { name: string; email?: string }, o: { company: string; minutes: number | null; people?: { name: string; email: string }[] }, nowMs = Date.now()): CallPrep {
  // The recorder's header, audio trouble and filler never reach a reading (brief.ts cleanCall).
  const text = cleanCall(raw).text;
  const rules = readByRules(text);
  const sum = summaryByRules(rules, o);
  const ex = extract(text, me.name);
  const want = ["goals.target", "pains", "metrics", "timeline", "buyerPhrases", "whyNow.trigger"];
  const lines: CallPrep["lines"] = [];
  for (const k of want)
    for (const sg of ex.suggestions.filter((x) => x.key === k && x.buyer).slice(0, 2)) if (lines.length < 8 && !lines.some((l) => l.text === sg.text)) lines.push({ key: k, text: sg.text });
  // Few cues matched: the buyer's own first lines about the business (a number, a want, a problem), at most three.
  if (lines.length < 3) {
    const meKey = me.name.trim().toLowerCase();
    for (const u of parseTranscript(text)) {
      if (!u.speaker || u.speaker.trim().toLowerCase() === meKey) continue;
      for (const sn of sentences(u.text)) {
        if (lines.length >= 3) break;
        if (sn.length < 30 || sn.length > 220 || /\?\s*$/.test(sn) || lines.some((l) => l.text === sn)) continue;
        if (/\d|\b(want|need|goal|problem|issue|guess|stuck|slow|fell|dropped|missed|hard|can't|cannot)\b/i.test(sn)) lines.push({ key: "buyerPhrases", text: sn });
      }
    }
  }
  const goal = ex.suggestions.find((x) => x.key === "goals.target" && x.buyer)?.text ?? null;
  // Who signs: what the call says, else the first named person from outside on the invite.
  const said = signerInCall(text, me);
  const p0 = (o.people ?? []).find((x) => x.name) ?? null;
  const signer = said.name ? said : p0 ? { name: p0.name, email: p0.email, ...(said.title ? { title: said.title } : {}) } : said;
  return { at: nowMs, summary: sum.summary, items: sum.items, lines, goal, terms: rules.terms, signer, signerOnCall: ex.signerOnCall, words: text.split(/\s+/).filter(Boolean).length };
}

const sweep = (nowMs: number) => {
  for (const [k, v] of preps) if (nowMs - v.at > PREP_KEEP_MS) preps.delete(k);
  while (preps.size > 2000) preps.delete(preps.keys().next().value!);
  if (lists.size > 2000) lists.delete(lists.keys().next().value!);
};

/** A reading kept for this call, or null. Never reads the recorder: the document's open path calls this. */
export function prepFor(memberId: string, recorder: string, id: string, nowMs = Date.now()): CallPrep | null {
  const p = preps.get(prepKey(memberId, recorder, id));
  return p && nowMs - p.at <= PREP_KEEP_MS ? p : null;
}
/** A reading kept for a pasted transcript, by the proposal made from it. */
export const pastePrep = {
  get: (memberId: string, proposalId: string, nowMs = Date.now()) => prepFor(memberId, "paste", proposalId, nowMs),
  set: (memberId: string, proposalId: string, p: CallPrep) => void preps.set(prepKey(memberId, "paste", proposalId), p),
};

/** The reading for this call: kept, or read from the recorder now (never on the document's open path: the AI pass and the background). */
export async function ensurePrep(m: Member, recorder: string, id: string, o: { company: string; minutes: number | null; people?: { name: string; email: string }[] }, nowMs = Date.now()): Promise<CallPrep | null> {
  const have = prepFor(m.id, recorder, id, nowMs);
  if (have) return have;
  const k = prepKey(m.id, recorder, id);
  const going = prepping.get(k);
  if (going) return going;
  const r = recorderOf(recorder);
  if (!r) return null;
  const run = (async () => {
    try {
      // Read once, turned into the reading, and dropped here.
      const text = await readTranscript(r, m, id);
      if (!text.trim()) return null;
      const p = prepFrom(text, m, o, Date.now());
      preps.set(k, p);
      sweep(Date.now());
      return p;
    } catch {
      return null;
    } finally {
      prepping.delete(k);
    }
  })();
  prepping.set(k, run);
  return run;
}

const minutesOf = (c: Pick<KeptCall, "startedAt" | "endedAt">) => {
  const n = Math.round((Date.parse(c.endedAt) - Date.parse(c.startedAt)) / 60_000);
  return n > 0 && n < 12 * 60 ? n : null;
};

/** Read the member's recorders now and keep the list (the background refresh). */
async function refresh(m: Member, nowMs: number): Promise<void> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const recs = connectedRecorders(s, m.id);
  const found: KeptCall[] = [];
  const { companyOfCall } = await import("../calls/index");
  await Promise.all(
    recs.map(async (r) => {
      let list;
      try {
        list = await r.listEndedSince(m, nowMs - CALLS_DAYS * DAY, nowMs, 10);
      } catch (e) {
        console.error(`proposals home: ${r.key} didn't answer (${(e as { code?: string })?.code ?? "error"})`);
        return;
      }
      for (const c of list) {
        const co = await companyOfCall(seed, s, m, c);
        // Calls with nobody from outside the member's company are not proposals.
        if (kindByRules({ title: c.title, external: c.participants.domains.length, stage: co.stage }) === "internal") continue;
        const stage = co.stage ? STAGE_WORDS[co.stage as Stage] ?? null : null;
        found.push({ recorder: r.key, id: c.id, startedAt: c.startedAt, endedAt: c.endedAt, people: c.people ?? [], company: { id: co.pub, name: co.name, label: co.label, stage } });
      }
    }),
  );
  found.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  const calls = found.slice(0, CALLS_SHOWN + 2);
  lists.set(m.id, { at: nowMs, calls, going: null });
  sweep(nowMs);
  // The newest few, read once in the background: the document then opens with what was agreed.
  for (const c of calls.slice(0, PREP_AHEAD)) void ensurePrep(m, c.recorder, c.id, { company: c.company.name ?? "the client", minutes: minutesOf(c), people: c.people }).catch(() => null);
}

/** The member's recent calls: kept, refreshed in the background when old. `wait`: on a first open, wait for the list (up to waitMs). */
export async function recentCalls(m: Member, o: { wait?: boolean; waitMs?: number } = {}, nowMs = Date.now()): Promise<{ calls: KeptCall[]; loading: boolean }> {
  let k = lists.get(m.id);
  const fresh = k && nowMs - k.at < CALLS_FRESH_MS;
  if (!fresh && !k?.going) {
    const going = refresh(m, nowMs).catch(() => {
      const was = lists.get(m.id);
      if (was) was.going = null;
    });
    k = lists.get(m.id) ?? { at: 0, calls: [], going: null };
    k.going = going;
    lists.set(m.id, k);
  }
  if (k!.at === 0 && o.wait && k!.going) await Promise.race([k!.going, new Promise((r) => setTimeout(r, o.waitMs ?? 6000))]);
  const now = lists.get(m.id)!;
  const usable = now.at > 0 && nowMs - now.at < CALLS_KEEP_MS;
  return { calls: usable ? now.calls : [], loading: !usable };
}

/** One call from the kept list (the tap's quick path), or null. */
export function keptCall(memberId: string, recorder: string, id: string): (KeptCall & { minutes: number | null }) | null {
  const c = lists.get(memberId)?.calls.find((x) => x.recorder === recorder && x.id === id);
  return c ? { ...c, minutes: minutesOf(c) } : null;
}

/** A draft of the member's from this call (open in Proposals), or null. */
export const draftOfCall = (s: State, memberId: string, recorder: string, id: string): string | null =>
  [...(s.proposals ?? [])].reverse().find((p) => p.memberId === memberId && p.fromCall?.recorder === recorder && p.fromCall.id === id && !p.sends.length)?.id ?? null;

/** The first person from outside on the call: a named one first. */
const whoOf = (people: KeptCall["people"]) => people.find((p) => p.name) ?? people[0] ?? null;

/** The companies in the member's pipeline, open deals first by stage (Meeting first), newest first. */
export function pipelineCompanies(seed: Seed, s: State, m: Member): HomeCompany[] {
  const entries = (s.pipeline?.[m.id]?.entries ?? []).filter((e) => (OPEN_STAGES as readonly string[]).includes(e.stage));
  const order: Stage[] = ["meeting", "proposal", "replied", "sent", "reach"];
  entries.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const seen = new Set<string>();
  const out: HomeCompany[] = [];
  for (const e of entries) {
    if (seen.has(e.companyId) || !g.companies.has(e.companyId)) continue;
    seen.add(e.companyId);
    const hidden = T.identityHidden(g, s, idx, tracks, m, e.companyId);
    const name = hidden ? null : g.companies.get(e.companyId)?.name || null;
    const draft = [...(s.proposals ?? [])].reverse().find((p) => p.memberId === m.id && p.companyId === e.companyId && !p.sends.length);
    out.push({ id: T.pubId(e.companyId), name, label: name ?? "A locked company", stage: STAGE_WORDS[e.stage], to: e.to?.name && !e.to.google ? String(e.to.name).slice(0, 80) : null, draftId: draft?.id ?? null });
    if (out.length >= COMPANIES_SHOWN) break;
  }
  return out;
}

/** The home's one-tap starts for the signed-in member. */
export async function homeFor(token: string | null, o: { wait?: boolean } = {}, nowMs = Date.now()): Promise<HomeView> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) throw new ProposalProblem("You're signed out. Sign in again to see your proposals.", 401);
  const recs = connectedRecorders(s, m.id);
  const { calls, loading } = recs.length ? await recentCalls(m, { wait: o.wait }, nowMs) : { calls: [], loading: false };
  const s2 = await loadState();
  return {
    calls: calls.slice(0, CALLS_SHOWN).map((c) => {
      const prep = prepFor(m.id, c.recorder, c.id, nowMs);
      const fee = prep ? moneyOf(prep.terms["pricing.monthlyFee"]) : null;
      const allocation = prep?.terms["pricing.allocation"];
      return {
        key: `${c.recorder}:${c.id}`,
        recorder: c.recorder,
        recorderName: RECORDER_NAMES[c.recorder],
        id: c.id,
        when: c.startedAt,
        minutes: minutesOf(c),
        who: whoOf(c.people),
        company: { ...c.company },
        draftId: draftOfCall(s2, m.id, c.recorder, c.id),
        ready: !!prep,
        ...(fee || allocation ? { terms: { ...(fee ? { fee } : {}), ...(allocation ? { allocation } : {}) } } : {}),
      };
    }),
    loading,
    recorders: recs.map((r) => r.name),
    companies: pipelineCompanies(seed, s2, m),
  };
}
