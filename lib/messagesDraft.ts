/**
 * "Draft with Merlin" in Messages (app/post/messages/Messages2.tsx), the template path: the words of
 * a first message or a reply, written in the member's voice (lib/voice.ts: their greeting, their
 * sign-off, short or medium, with or without contractions, one stock phrase where it fits). No
 * service writes these: they are templates filled with what the member already sees on screen (the
 * other fractional's first name, the seat and the company as the member sees it, their own title
 * and kind of client). A company still locked for the member is never named: the template says
 * "a company on my list" instead. Never an email address, a rate or a locked fact.
 *
 * Merlin's AI writes a draft only behind the drafting switch, with the member's agreement and while
 * their AI usage lasts (lib/messagesAi.ts). Everything here is pure, relative imports only.
 */
import { NEUTRAL_VOICE, asSentence, expandContractions, phraseSlot, styleOf, type VoiceProfile, type VoiceStyle } from "./voice";

/** Why a member writes. The three reasons members message each other, a reply, and a first note between fellow fractionals. */
export type DraftReason = "intro" | "lead" | "q" | "peer" | "reply";
/** What the conversation is, for a reply (app/post/messages/model.ts kindOf). */
export type ReplyKind = "intro" | "lead" | "q" | "team" | "peer" | "invite";

export interface DraftFacts {
  reason: DraftReason;
  /** The other fractional's first name. */
  to: string;
  /** The member writing: first and full name, title ("Fractional VP Sales"), and the kind of clients they want, as words. */
  me: { first: string; name: string; title: string | null; clients: string | null };
  /** "the fractional CMO seat": the seat in question, as the member sees it. */
  seat?: string | null;
  /** The company, only when the member can see its name; else null and the words never name it. */
  company?: string | null;
  /** A reply: what the conversation is, and who started it (the member, or the other side). */
  kind?: ReplyKind;
  mine?: boolean;
  /** A lead in the conversation: passed to the member (in) or by them (out), and whether it was taken. */
  lead?: { side: "in" | "out"; taken?: boolean } | null;
}

const flat = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
/** "a fractional VP Sales", from the member's title. */
function asWho(title: string | null): string {
  const t = flat(title).split(/\s+(?:at|@)\s+|,|\s[|–—-]\s|\s\(/i)[0].trim();
  if (!t || /^member$/i.test(t)) return "a fractional leader";
  return `a fractional ${t.replace(/^fractional\s+/i, "")}`;
}
const at = (f: DraftFacts) => (f.company ? `${f.seat ?? "a seat"} at ${f.company}` : `${f.seat ?? "a seat"} at a company on my list`);
const where = (f: DraftFacts) => f.company ?? "that company";

/** The template: the long version's sentences, and which of them the short one keeps (the greeting and sign-off come from the voice). */
function template(f: DraftFacts): { long: string[]; short: number[] } {
  const me = asWho(f.me.title);
  const kinds = f.me.clients ? ` I work with ${f.me.clients}.` : "";
  switch (f.reason) {
    case "intro":
      return {
        long: [`I saw you held ${at(f)}.`, `I'm ${me}.${kinds}`, `They look ready for someone in my seat.`, `Would you be open to introducing me to the person who hires there?`],
        short: [0, 3],
      };
    case "q":
      return {
        long: [`I saw you held ${at(f)}.`, `I'm ${me}, and I'm talking to a company a lot like it.`, `What did the CEO care about most in your first 90 days?`],
        short: [0, 2],
      };
    case "lead":
      return {
        long: [`I found you in the Fractionals directory.`, `I'm ${me}.${kinds}`, `When I meet a company that isn't my fit and could be yours, I'd like to pass it to you.`, `What makes a company a good fit for you?`],
        short: [2, 3],
      };
    case "peer":
      return {
        long: [`I found you in the Fractionals directory.`, `I'm ${me}.${kinds}`, `Open to swapping notes and referrals?`],
        short: [0, 2],
      };
    case "reply":
      return reply(f);
  }
}

function reply(f: DraftFacts): { long: string[]; short: number[] } {
  const co = where(f);
  switch (f.kind) {
    case "intro":
      return f.mine
        ? { long: ["Thank you.", "I'll give them a few days, then follow up once.", "If it turns into work, you'll hear it from me first.", "And when a seat that fits you comes up on my side, I'll pass it to you."], short: [0, 1] }
        : { long: ["Glad to.", `I'll write a short note about you to the person who hires at ${co} and copy you.`, "Good luck with it."], short: [0, 1] };
    case "lead":
      if (f.lead?.side === "out") return { long: ["Glad it fits.", "Tell me how the first call goes."], short: [1] };
      return f.lead?.taken
        ? { long: ["Thanks for thinking of me.", `I've added ${co} to my pipeline and I'll reach out this week.`, "Anything I should know before I write?"], short: [0, 2] }
        : { long: ["Thanks for thinking of me.", `I'm reading up on ${co} now.`, "Anything I should know before I write?"], short: [0, 2] };
    case "q":
      return f.mine
        ? { long: ["Thank you, that helps a lot.", "I'll come back to you if I get the work."], short: [0] }
        : { long: ["Happy to help.", `What would you like to know about ${co}?`], short: [1] };
    case "team":
      return { long: ["Sounds good.", `I'll send you my notes on ${co}, and we can draft our one page together.`], short: [1] };
    case "invite":
      return { long: ["Welcome to Merlin.", "Good to have someone to swap notes with.", "If a seat comes my way that I can't take, you'll hear first."], short: [0, 2] };
    default:
      return { long: ["Good to hear from you.", "When a company comes my way that fits you better, I'll pass it on.", "What makes a company a good fit for you?"], short: [1, 2] };
  }
}

/**
 * The draft, in the member's voice: their greeting ("Hi Rita,"), the template's sentences (all of
 * them, or the short version's when their voice is short or `short` is asked for), without
 * contractions when they don't use them, one closing phrase of theirs where it fits, and their
 * sign-off. No exclamation marks unless their voice uses them, and no emoji in a chat message.
 */
export function draftMessage(f: DraftFacts, voice?: VoiceProfile | VoiceStyle | null, short = false): string {
  const v = voice ? styleOf(voice) : NEUTRAL_VOICE;
  const t = template(f);
  const pick = short || v.length === "short" ? t.short.map((k) => t.long[k]) : t.long;
  const fix = (x: string) => (v.contractions ? x : expandContractions(x));
  const first = flat(f.to);
  const greet = v.greeting === "none" ? "" : first ? v.greeting.replace("{first}", first) : "Hi,";
  let body = [greet, ...pick].filter(Boolean).join(" ");
  const close = !short ? v.phrases.find((p) => phraseSlot(p) === "close") : undefined;
  if (close) body = `${body} ${asSentence(close)}`;
  const name = v.name === "none" ? "" : v.name === "full" ? flat(f.me.name) : flat(f.me.first);
  const sign = [v.signoff === "none" ? "" : v.signoff, name && v.signoff !== "none" ? name : ""].filter(Boolean).join("\n");
  return fix(sign ? `${body}\n\n${sign}` : body).slice(0, 2000);
}

/** What the "Drafted by Merlin" line says about how the draft was written. */
export function draftWords(o: { ai: boolean; voiced: boolean }): string {
  if (o.ai) return "Merlin's AI wrote it from this conversation, in your voice. Merlin never reads your email.";
  return o.voiced
    ? "Drafted from a template in your voice. No AI allowance used. Merlin never reads your email."
    : "Drafted from a template. Describe how you write in your profile and every draft follows it. Merlin never reads your email.";
}
