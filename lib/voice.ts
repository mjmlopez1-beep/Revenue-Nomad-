/**
 * Your writing voice: how a member writes, kept as a handful of style conclusions so the notes
 * Merlin drafts (lib/moves.ts draftNote) read like them. Private to the member, like their network.
 *
 * Merlin never reads email. The profile comes from the member's own Claude (the connector's
 * save_my_voice: their Claude reads their own sent mail on its side and sends conclusions only,
 * after the member agrees), or from the member's own hand in Your profile. Nothing here is email
 * text: every field is one value from a short list, and the stock phrases are a few of the
 * member's own short expressions, refused when they read like quoted mail, an address, a link, a
 * number or more than a line (the same kind of checks as lib/google/compute.ts looksLikeText).
 *
 * What is kept (State.voice[memberId]), and nothing else: the fields of VoiceProfile. Never in
 * another member's view, the shared table, the export or an admin's panel.
 *
 * Pure: no I/O, relative imports only, so lib/table.ts, the connector and the app all read it.
 */

/** How they open a note. "{first}" is the reader's first name. */
export const VOICE_GREETINGS = ["Hi {first},", "Hey {first},", "Hello {first},", "Dear {first},", "{first},", "none"] as const;
/** How they close one, before their name. */
export const VOICE_SIGNOFFS = ["Best,", "Thanks,", "Cheers,", "Talk soon,", "Regards,", "Warmly,", "none"] as const;
/** How they sign: their first name, their full name, or nothing. */
export const VOICE_NAMES = ["first", "full", "none"] as const;
export const VOICE_LENGTHS = ["short", "medium"] as const;
export const VOICE_FORMALITY = ["casual", "neutral", "formal"] as const;
export const VOICE_EXCLAMATIONS = ["never", "sometimes"] as const;
export const VOICE_OPENERS = ["direct", "smalltalk"] as const;

export type VoiceGreeting = (typeof VOICE_GREETINGS)[number];
export type VoiceSignoff = (typeof VOICE_SIGNOFFS)[number];
export type VoiceName = (typeof VOICE_NAMES)[number];
export type VoiceLength = (typeof VOICE_LENGTHS)[number];
export type VoiceFormality = (typeof VOICE_FORMALITY)[number];

/** The most stock phrases kept, and the most characters in one. */
export const VOICE_PHRASES_MAX = 5;
export const VOICE_PHRASE_CHARS = 60;

/** The style a note is written in. Every field is a conclusion, never a sentence from a message. */
export interface VoiceStyle {
  greeting: VoiceGreeting;
  signoff: VoiceSignoff;
  /** The name under the sign-off. */
  name: VoiceName;
  /** short: three sentences. medium: five. */
  length: VoiceLength;
  formality: VoiceFormality;
  /** "I'd" and "it's", or "I would" and "it is". */
  contractions: boolean;
  exclamations: (typeof VOICE_EXCLAMATIONS)[number];
  emoji: boolean;
  /** Straight to the point, or a line of small talk first. */
  opener: (typeof VOICE_OPENERS)[number];
  /** Up to VOICE_PHRASES_MAX short expressions of the member's own. */
  phrases: string[];
}

/** A member's saved voice: the style, when it was saved and who filled it in. */
export interface VoiceProfile extends VoiceStyle {
  at: string;
  /** "claude": their own Claude summarised it (save_my_voice). "you": typed in Your profile. */
  by: "claude" | "you";
}

/** How a note reads with no profile saved: plain, medium, signed with a first name. */
export const NEUTRAL_VOICE: VoiceStyle = {
  greeting: "Hi {first},",
  signoff: "none",
  name: "first",
  length: "medium",
  formality: "neutral",
  contractions: true,
  exclamations: "never",
  emoji: false,
  opener: "direct",
  phrases: [],
};

/** The only fields a profile may carry. Anything else refuses the save. */
export const VOICE_FIELDS = ["greeting", "signoff", "name", "length", "formality", "contractions", "exclamations", "emoji", "opener", "phrases"] as const;

/** What each field says, for the connector's description and Your profile. */
export const VOICE_WORDS: Record<(typeof VOICE_FIELDS)[number], string> = {
  greeting: "Greeting",
  signoff: "Sign-off",
  name: "Signed with",
  length: "Length",
  formality: "Tone",
  contractions: "Contractions",
  exclamations: "Exclamation marks",
  emoji: "Emoji",
  opener: "Opens with",
  phrases: "Phrases you use",
};

/** Raised for a profile the server won't keep. The message is said to the member (or to their Claude). */
export class VoiceProblem extends Error {}

const MAIL_WORDS = /\b(wrote|subject|unsubscribe|forwarded message|original message|sent from my)\b|(^|\s)(re|fwd?|fw)\s?:/i;
const URLISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|ai|app|dev|us|uk|ca|de|fr|example)\b)/i;
/** A greeting with a name in it ("Hi Dana,"), which is a message's first line, not a phrase. */
const GREETS_SOMEONE = /^\s*(hi|hey|hello|dear|good (morning|afternoon|evening))\s+\S/i;

/**
 * Why a stock phrase isn't one: it reads like message text, an address, a link, a number or more
 * than one line. Null when it is fine.
 */
export function phraseProblem(raw: unknown): string | null {
  if (typeof raw !== "string") return "isn't text";
  const v = raw.trim();
  if (!v) return "is empty";
  if ([...v].length > VOICE_PHRASE_CHARS) return `is longer than ${VOICE_PHRASE_CHARS} characters`;
  if (/[\r\n\t]/.test(v)) return "has a line break";
  if (/@/.test(v)) return "has an address in it";
  if (URLISH.test(v)) return "has a link in it";
  if (/\d{3,}/.test(v) || /\d[\d\s().+-]{5,}\d/.test(v)) return "has a number in it";
  if (/[$€£]\s?\d/.test(v)) return "has an amount in it";
  if (/^\s*>/.test(v) || /["“”«»]/.test(v) || MAIL_WORDS.test(v)) return "reads like quoted mail";
  if (GREETS_SOMEONE.test(v)) return "greets someone by name (the greeting has its own field)";
  if (/[<>{}[\]|\\]/.test(v)) return "has markup in it";
  // More than two sentences is a passage, not a phrase.
  if ((v.match(/[.!?](\s|$)/g) ?? []).length > 2) return "is more than a phrase";
  return null;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, field: string): T => {
  if (typeof v === "string" && (list as readonly string[]).includes(v)) return v as T;
  throw new VoiceProblem(`${field} must be one of: ${list.join(" | ")}. Nothing was saved.`);
};
const yesNo = (v: unknown, field: string): boolean => {
  if (typeof v === "boolean") return v;
  throw new VoiceProblem(`${field} must be true or false. Nothing was saved.`);
};

/**
 * A profile as it is kept, from what a client sent: every field present and one of its values,
 * no field beyond VOICE_FIELDS, the phrases clean. Throws VoiceProblem (nothing is saved) on
 * anything else, so message text can't ride in on an unknown field or a long phrase.
 */
export function cleanVoice(raw: unknown): VoiceStyle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new VoiceProblem("Send the voice as one object of style conclusions. Nothing was saved.");
  const x = raw as Record<string, unknown>;
  const allowed = new Set<string>(VOICE_FIELDS);
  const extra = Object.keys(x).filter((k) => !allowed.has(k));
  if (extra.length)
    throw new VoiceProblem(`Merlin keeps style conclusions only, never message text. This had ${extra.slice(0, 3).join(", ")}, so nothing was saved. Send only: ${VOICE_FIELDS.join(", ")}.`);
  const phrasesRaw = x.phrases === undefined ? [] : x.phrases;
  if (!Array.isArray(phrasesRaw)) throw new VoiceProblem("phrases is a list of up to 5 short phrases. Nothing was saved.");
  if (phrasesRaw.length > VOICE_PHRASES_MAX) throw new VoiceProblem(`At most ${VOICE_PHRASES_MAX} phrases. Nothing was saved.`);
  const phrases: string[] = [];
  for (const p of phrasesRaw) {
    const why = phraseProblem(p);
    if (why) throw new VoiceProblem(`A phrase ${why}. Merlin keeps short stock phrases only, never message text, names or addresses. Nothing was saved.`);
    const v = (p as string).replace(/\s+/g, " ").trim();
    if (!phrases.some((q) => q.toLowerCase() === v.toLowerCase())) phrases.push(v);
  }
  return {
    greeting: oneOf(VOICE_GREETINGS, x.greeting, "greeting"),
    signoff: oneOf(VOICE_SIGNOFFS, x.signoff, "signoff"),
    name: oneOf(VOICE_NAMES, x.name, "name"),
    length: oneOf(VOICE_LENGTHS, x.length, "length"),
    formality: oneOf(VOICE_FORMALITY, x.formality, "formality"),
    contractions: yesNo(x.contractions, "contractions"),
    exclamations: oneOf(VOICE_EXCLAMATIONS, x.exclamations, "exclamations"),
    emoji: yesNo(x.emoji, "emoji"),
    opener: oneOf(VOICE_OPENERS, x.opener, "opener"),
    phrases,
  };
}

/** The style of a saved profile (or the neutral one), without when and who. */
export function styleOf(v: VoiceProfile | VoiceStyle | null | undefined): VoiceStyle {
  if (!v) return NEUTRAL_VOICE;
  return {
    greeting: v.greeting,
    signoff: v.signoff,
    name: v.name,
    length: v.length,
    formality: v.formality,
    contractions: v.contractions,
    exclamations: v.exclamations,
    emoji: v.emoji,
    opener: v.opener,
    phrases: [...(v.phrases ?? [])],
  };
}

/* ---------- words: one value from each list, said plainly ---------- */

export const greetingWords = (g: VoiceGreeting) => (g === "none" ? "No greeting" : g.replace("{first}", "Dana"));
export const signoffWords = (s: VoiceSignoff, n: VoiceName, me = "Morgan Hale") => {
  const name = n === "none" ? "" : n === "full" ? me : me.trim().split(/\s+/)[0];
  if (s === "none") return name || "No sign-off";
  return name ? `${s} ${name}` : s;
};
/** The saved style in a few words: "Casual · short · Hey Dana, · Cheers, Morgan". */
export function voiceSummary(v: VoiceStyle, me?: string): string {
  return [v.formality.charAt(0).toUpperCase() + v.formality.slice(1), v.length, greetingWords(v.greeting), signoffWords(v.signoff, v.name, me)].join(" · ");
}

/** Each field of a voice, said plainly: [label, value]. Your profile and the connector read the same words. */
export function voiceRows(v: VoiceStyle, me: string): [string, string][] {
  return [
    [VOICE_WORDS.greeting, greetingWords(v.greeting)],
    [VOICE_WORDS.signoff, signoffWords(v.signoff, v.name, me)],
    [VOICE_WORDS.length, v.length === "short" ? "Short, about three sentences" : "Medium, about five sentences"],
    [VOICE_WORDS.formality, v.formality.charAt(0).toUpperCase() + v.formality.slice(1)],
    [VOICE_WORDS.contractions, v.contractions ? "Yes (I'd, it's)" : "No (I would, it is)"],
    [VOICE_WORDS.exclamations, v.exclamations === "sometimes" ? "Sometimes" : "Never"],
    [VOICE_WORDS.emoji, v.emoji ? "Yes" : "No"],
    [VOICE_WORDS.opener, v.opener === "smalltalk" ? "A line of small talk first" : "Straight to the point"],
    [VOICE_WORDS.phrases, v.phrases.length ? v.phrases.map((p) => `“${p}”`).join(", ") : "None saved"],
  ];
}

/* ---------- applying it to a sentence ---------- */

const EXPAND: [RegExp, string][] = [
  [/\bIt's been\b/g, "It has been"],
  [/\bit's been\b/g, "it has been"],
  [/\b([Ww])hoever's\b/g, "$1hoever is"],
  [/\b(I|i)'m\b/g, "I am"],
  [/\b(I|i)'d\b/g, "I would"],
  [/\b(I|i)'ve\b/g, "I have"],
  [/\b(I|i)'ll\b/g, "I will"],
  [/\bIt's\b/g, "It is"],
  [/\bit's\b/g, "it is"],
  [/\bThat's\b/g, "That is"],
  [/\bthat's\b/g, "that is"],
  [/\bThere's\b/g, "There is"],
  [/\bthere's\b/g, "there is"],
  [/\bYou're\b/g, "You are"],
  [/\byou're\b/g, "you are"],
  [/\bYou'd\b/g, "You would"],
  [/\byou'd\b/g, "you would"],
  [/\bWe're\b/g, "We are"],
  [/\bwe're\b/g, "we are"],
  [/\bWe've\b/g, "We have"],
  [/\bwe've\b/g, "we have"],
  [/\bLet's\b/g, "Let us"],
  [/\blet's\b/g, "let us"],
  [/\bCan't\b/g, "Cannot"],
  [/\bcan't\b/g, "cannot"],
  [/\bWon't\b/g, "Will not"],
  [/\bwon't\b/g, "will not"],
  [/\b([Dd])on't\b/g, "$1o not"],
  [/\b([Dd])oesn't\b/g, "$1oes not"],
  [/\b([Dd])idn't\b/g, "$1id not"],
  [/\b([Ii])sn't\b/g, "$1s not"],
  [/\b([Aa])ren't\b/g, "$1re not"],
  [/\b([Hh])aven't\b/g, "$1ave not"],
  [/\b([Hh])asn't\b/g, "$1as not"],
  [/\b([Ww])ouldn't\b/g, "$1ould not"],
  [/\b([Cc])ouldn't\b/g, "$1ould not"],
  [/\b([Ss])houldn't\b/g, "$1hould not"],
];

/** A sentence without contractions: "I'd be glad" reads "I would be glad". Possessives ("Dana's") stay. */
export function expandContractions(text: string): string {
  let out = text.replace(/[’]/g, "'");
  for (const [re, to] of EXPAND) out = out.replace(re, to);
  return out;
}

/** Where a stock phrase fits in a note: as the line of small talk it opens with, or the line before the sign-off. */
export function phraseSlot(p: string): "open" | "close" | null {
  const v = p.trim().toLowerCase();
  if (/^(hope|hoping|trust|long time|it's been|been a while|been too long|happy (monday|tuesday|wednesday|thursday|friday)|good to|great to)\b/.test(v)) return "open";
  if (/\b(talk soon|speak soon|chat soon|looking forward|let me know|no rush|no pressure|no worries|happy to|glad to|thanks|thank you|appreciate|either way|all the best|onward|cheers)\b/.test(v)) return "close";
  return null;
}

/** A phrase as a sentence of its own: a capital first letter and a full stop when it has no ending. */
export const asSentence = (p: string) => {
  const v = p.trim();
  const s = v.charAt(0).toUpperCase() + v.slice(1);
  return /[.!?…]$/.test(s) ? s : `${s}.`;
};
