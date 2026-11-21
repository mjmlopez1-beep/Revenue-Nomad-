/**
 * Pulling suggestions out of a discovery call, without a model: plain rules over the transcript.
 * It reads pasted text and .txt, .md, .vtt and .srt files (speaker labels as "Name:" or WebVTT
 * <v Name>), splits it into sentences, and matches the cue phrases in templates.json
 * (discoveryExtraction) to each field: goals, pains, numbers, timeline, who decides, budget
 * signals, the people involved, and the buyer's own phrases. Everything comes back as a
 * suggestion for the member to accept or skip.
 *
 * It runs in the member's browser: the transcript never leaves it. Only the lines the member
 * accepts are saved with the proposal. Pure, no imports beyond the library.
 */
import { DISCOVERY_FIELDS } from "./library";

export interface Utterance {
  speaker: string | null;
  text: string;
}
export interface Suggestion {
  /** The discovery field (templates.json discoveryExtraction key, or "buyerPhrases"). */
  key: string;
  text: string;
  speaker: string | null;
  /** The cue that matched, or what the rule saw ("a number", "a title"). */
  why: string;
  /** Said by someone other than the member: the buyer's side. */
  buyer: boolean;
}
export interface Extraction {
  utterances: number;
  speakers: string[];
  suggestions: Suggestion[];
  /** Was the person who signs on the call: from "I can approve" (yes) or "I need to check with" (no). Null: no sign either way. */
  signerOnCall: boolean | null;
  /** The sentence that said so. */
  signerWhy: string | null;
}

/** The most suggestions per field, the most in all, and the longest line kept. */
export const PER_FIELD = 6;
export const MAX_SUGGESTIONS = 80;
export const MAX_LINE = 280;
/** The most of a transcript read (characters): about three hours of talk. */
export const MAX_TRANSCRIPT = 400_000;

const TIMESTAMP = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?.*$/;
const LEAD_TIME = /^\s*[[(]?\s*(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?\s*[\])]?\s*[-–]?\s*/;
const SPEAKER = /^\s*(?:\*\*)?([A-Z][\p{L}'’.-]*(?: [A-Z][\p{L}'’.-]*){0,3}|Speaker \w+)(?:\*\*)?\s*(?:\([^)]{0,40}\))?\s*:\s+(.*)$/u;

/** A transcript in any of the formats as who said what, in order. Lines from one speaker in a row are joined. */
export function parseTranscript(raw: string): Utterance[] {
  const text = String(raw ?? "").slice(0, MAX_TRANSCRIPT).replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const out: Utterance[] = [];
  let speaker: string | null = null;
  const push = (sp: string | null, t: string) => {
    const clean = t
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    const last = out[out.length - 1];
    if (last && last.speaker === sp) last.text += ` ${clean}`;
    else out.push({ speaker: sp, text: clean });
  };
  for (const line0 of text.split("\n")) {
    const line = line0.trim();
    if (!line || /^WEBVTT/.test(line) || /^(NOTE|STYLE|REGION)\b/.test(line) || /^\d+$/.test(line) || TIMESTAMP.test(line)) continue;
    if (/^#{1,6}\s/.test(line) || /^[-*_]{3,}$/.test(line)) continue;
    let l = line.replace(LEAD_TIME, "");
    // WebVTT voice: <v Dana Whitfield>text
    const v = l.match(/^<v(?:\.[^ >]+)?\s+([^>]+)>(.*)$/);
    if (v) {
      speaker = v[1].trim();
      push(speaker, v[2]);
      continue;
    }
    const s = l.match(SPEAKER);
    if (s && !/^(Deliverable|Expected impact|Note|Next|Goal|Action items?)$/i.test(s[1])) {
      speaker = s[1].trim();
      l = s[2];
    }
    push(speaker, l.replace(/^[-*]\s+/, ""));
  }
  return out;
}

/** A text's sentences. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘$])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A cue phrase as a pattern: whole words, any case, straight or curly apostrophes. */
const cueRe = (cue: string) => new RegExp(`(^|[^\\p{L}])${esc(cue.toLowerCase()).replace(/'/g, "['’]")}($|[^\\p{L}])`, "iu");
const CUES = DISCOVERY_FIELDS.map((f) => ({ key: f.key, cues: f.cues.map((c) => ({ c, re: cueRe(c) })) }));

/** More rules than the cue phrases: a number with a unit, a money amount, a title, a date. */
const NUMBER_UNIT = /\b\d+(?:\.\d+)?\s?(%|percent|weeks?|months?|days?|reps?|deals?|clients?|customers?|leads?|meetings?|calls?|per (?:month|week|quarter|year))\b/i;
const MONEY = /(\$\s?\d[\d,.]*\s?(k|m|million|thousand)?|\b\d+(?:\.\d+)?\s?(k|million)\b)/i;
const TITLE = /\b(CEO|COO|CFO|CRO|CMO|CTO|founder|co-founder|owner|president|VP|vice president|head of|director|board|partner|chair)\b/i;
const DATE = /\b(by|before|after|in|end of|start of|early|mid|late)\s+(january|february|march|april|may|june|july|august|september|october|november|december|q[1-4]|next (?:week|month|quarter|year)|the (?:first|new year|summer|fall|spring))\b/i;
const BUDGET = /\b(budget|quoted|quote|too expensive|afford|price|pricing|cost|spend|commission|retainer)\b/i;
const SIGNER_YES = /\b(I can approve|I sign off|I make the call|it's my call|it is my call|my decision|I own the budget|I can sign)\b/i;
const SIGNER_NO = /\b(I need to check with|I'll need to run it by|run it by|take it to|need sign-off from|I'll have to ask|the board has to|our CEO has to|needs to approve)\b/i;
const PAIN_WORDS = /\b(problem|frustrat|struggl|stuck|can't|cannot|doesn't work|isn't working|broken|nobody|no one|keeps happening|leak|stall|flat|dropp|lost|churn)\w*/i;

/** Is this speaker the member (their name or first name)? */
const isMember = (speaker: string | null, memberName: string) => {
  if (!speaker) return false;
  const s = speaker.toLowerCase();
  const n = memberName.trim().toLowerCase();
  if (!n) return false;
  return s === n || s === n.split(/\s+/)[0] || n.startsWith(s + " ") || /^(me|you|host)$/.test(s);
};

/**
 * Suggestions from a transcript. `memberName`: the member's own name, so their own lines count as
 * theirs (their questions are not the buyer's pains). Lines with no speaker count as the buyer's.
 */
export function extract(raw: string, memberName = ""): Extraction {
  const utts = parseTranscript(raw);
  const speakers = [...new Set(utts.map((u) => u.speaker).filter((x): x is string => !!x))];
  const by = new Map<string, Suggestion[]>();
  const seen = new Set<string>();
  let signerOnCall: boolean | null = null;
  let signerWhy: string | null = null;
  const add = (key: string, text: string, speaker: string | null, why: string, buyer: boolean) => {
    const t = text.length > MAX_LINE ? `${text.slice(0, MAX_LINE - 1).trimEnd()}…` : text;
    const dedupe = `${key}|${t.toLowerCase()}`;
    if (seen.has(dedupe)) return;
    const list = by.get(key) ?? [];
    if (list.length >= PER_FIELD) return;
    seen.add(dedupe);
    list.push({ key, text: t, speaker, why, buyer });
    by.set(key, list);
  };
  for (const u of utts) {
    const buyer = !isMember(u.speaker, memberName);
    for (const s of sentences(u.text)) {
      // The member's own questions are not the buyer's facts, except a next step they agreed.
      const question = /\?\s*$/.test(s);
      for (const f of CUES) {
        const hit = f.cues.find((c) => c.re.test(s));
        if (!hit) continue;
        if (!buyer && f.key !== "nextStep" && f.key !== "timeline") continue;
        if (question && f.key !== "nextStep") continue;
        if (f.key === "decision.signerOnCall") continue;
        add(f.key, s, u.speaker, `"${hit.c}"`, buyer);
      }
      if (!buyer || question) continue;
      if (NUMBER_UNIT.test(s)) add("metrics", s, u.speaker, "a number", buyer);
      if (MONEY.test(s) && BUDGET.test(s)) add("budget.signals", s, u.speaker, "an amount", buyer);
      if (DATE.test(s)) add("timeline", s, u.speaker, "a date", buyer);
      if (TITLE.test(s) && /\b(report|works? with|owns|runs|decid|approv|sign)/i.test(s)) add("stakeholders", s, u.speaker, "a title", buyer);
      if (PAIN_WORDS.test(s) && s.length <= 200) add("pains", s, u.speaker, "a pain", buyer);
      // Their own words: short first-person lines about the business, to echo back (paraphrased).
      if (/^(I|We|Our|My|Honestly|The)\b/.test(s) && s.length <= 140 && (PAIN_WORDS.test(s) || /\b(want|need|wish|goal|hope)\b/i.test(s))) add("buyerPhrases", s, u.speaker, "their words", buyer);
      if (signerOnCall !== false && SIGNER_NO.test(s)) (signerOnCall = false), (signerWhy = s);
      else if (signerOnCall === null && SIGNER_YES.test(s)) (signerOnCall = true), (signerWhy = s);
    }
  }
  const order = [...DISCOVERY_FIELDS.map((f) => f.key), "buyerPhrases"];
  const suggestions = order.flatMap((k) => by.get(k) ?? []).slice(0, MAX_SUGGESTIONS);
  return { utterances: utts.length, speakers, suggestions, signerOnCall, signerWhy };
}

/** File types a transcript can come in. */
export const TRANSCRIPT_TYPES = [".txt", ".vtt", ".srt", ".md"];
export const transcriptOk = (name: string) => TRANSCRIPT_TYPES.some((x) => name.toLowerCase().endsWith(x));
