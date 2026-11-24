/**
 * Your writing voice from your own LinkedIn posts, by rules, on the member's device: no AI, and
 * no post leaves it. The posts (at most LIX_LIMITS.posts, the newest) are read for a handful of
 * style conclusions (lib/voice.ts VoiceStyle), and only those are sent, through the voice's own
 * checks (cleanVoice). A post has no greeting or sign-off, so those come from the voice already
 * saved (or the neutral one); phrases are never taken from a post.
 *
 * The rules, so a member can check them against their own posts:
 *  - contractions: yes when "I'm", "it's", "don't" and the like are at least as common as "I am",
 *    "it is", "do not";
 *  - exclamation marks: sometimes when one post in six or more has one, else never;
 *  - emoji: yes when one post in ten or more has one;
 *  - length: short when the typical post is three sentences or fewer, else medium;
 *  - tone: casual or formal by which words lead ("hey", "folks", "super", "awesome" against
 *    "furthermore", "therefore", "pleased to", "sincerely"), else neutral;
 *  - opens with: a line of small talk when one post in four or more starts with "Happy Friday",
 *    "Hope", "Quick one" and the like, else straight to the point.
 * Fewer than 3 posts: no conclusion at all (null).
 */
import { NEUTRAL_VOICE, styleOf, type VoiceStyle } from "../voice";

const CONTRACTED = /\b(i'm|i'd|i've|i'll|it's|that's|there's|you're|we're|we've|let's|can't|won't|don't|doesn't|didn't|isn't|aren't|haven't|wouldn't|couldn't)\b/gi;
const EXPANDED = /\b(i am|i would|i have|i will|it is|that is|there is|you are|we are|we have|let us|cannot|will not|do not|does not|did not|is not|are not|have not|would not|could not)\b/gi;
const CASUAL = /\b(hey|folks|super|awesome|gonna|wanna|kinda|lol|y'all|stoked|pumped|crushing it|huge shoutout|shout ?out)\b/gi;
const FORMAL = /\b(furthermore|therefore|moreover|pleased to|sincerely|regards|hereby|kindly|esteemed|accordingly)\b/gi;
const SMALLTALK = /^\s*(happy (monday|tuesday|wednesday|thursday|friday|new year)|hope|hoping|quick one|it's been a while|good morning|morning all|hi all|hello all)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

const count = (t: string, re: RegExp) => (t.match(re) ?? []).length;
const sentences = (t: string) => Math.max(1, (t.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+(\s|$)/g) ?? []).length || 1);

export function voiceFromPosts(posts: string[], prior?: VoiceStyle | null): VoiceStyle | null {
  const ps = posts.map((p) => p.replace(/[’]/g, "'").trim()).filter((p) => p.length >= 20);
  if (ps.length < 3) return null;
  const all = ps.join("\n");
  const c = count(all, CONTRACTED);
  const x = count(all, EXPANDED);
  const bang = ps.filter((p) => p.includes("!")).length / ps.length;
  const emoji = ps.filter((p) => EMOJI.test(p)).length / ps.length;
  const lens = ps.map(sentences).sort((a, b) => a - b);
  const mid = lens[Math.floor(lens.length / 2)];
  const casual = count(all, CASUAL);
  const formal = count(all, FORMAL);
  const small = ps.filter((p) => SMALLTALK.test(p)).length / ps.length;
  const base = styleOf(prior ?? NEUTRAL_VOICE);
  return {
    greeting: base.greeting,
    signoff: base.signoff,
    name: base.name,
    length: mid <= 3 ? "short" : "medium",
    formality: casual >= 2 && casual > formal * 2 ? "casual" : formal >= 2 && formal > casual * 2 ? "formal" : "neutral",
    contractions: c >= x,
    exclamations: bang >= 1 / 6 ? "sometimes" : "never",
    emoji: emoji >= 0.1,
    opener: small >= 0.25 ? "smalltalk" : "direct",
    // Never a phrase from a post: only what was saved before.
    phrases: base.phrases,
  };
}
