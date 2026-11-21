/**
 * The drafted follow-up for a deal in the member's pipeline (Home's follow-ups, the record's Your
 * pipeline): a short note for where the deal is (no reply yet, they replied, after a meeting, a
 * proposal out), in the member's voice when they saved one (lib/voice.ts: greeting, sign-off, tone,
 * contractions, an exclamation mark or an emoji where they use them). Templates only, filled with
 * what the member's own pipeline already shows them. Never a rate, a locked name or another
 * member's data. Merlin drafts, the member sends.
 *
 * Pure: no I/O and relative imports only.
 */
import { NEUTRAL_VOICE, expandContractions, styleOf, type VoiceFormality, type VoiceProfile, type VoiceStyle } from "./voice";
import type { Channel, Stage } from "./pipeline";

export interface FollowFacts {
  /** Their name, when the member's pipeline has it (the greeting), else null. */
  to: string | null;
  company: string;
  stage: Stage;
  channel: Channel;
  /** Days since the last note went out. */
  days: number;
  follow: number;
  me: { first: string; name: string; fn: string | null };
}

type Tone = Record<VoiceFormality, string>;
const same = (s: string): Tone => ({ casual: s, neutral: s, formal: s });

function sentences(f: FollowFacts): { subject: string; lines: Tone[] } {
  const co = f.company;
  const when = f.days >= 7 ? "last week" : f.days >= 3 ? "a few days ago" : "earlier this week";
  const area = f.me.fn ? `${f.me.fn} at ${co}` : co;
  if (f.channel === "intro" && f.stage === "sent")
    return {
      subject: `The intro at ${co}`,
      lines: [
        { casual: `Just circling back on the intro I asked about at ${co}.`, neutral: `Following up on the intro I asked about at ${co}.`, formal: `I wanted to follow up on the introduction I asked about at ${co}.` },
        { casual: "No pressure at all if the timing isn't right.", neutral: "No pressure if the timing isn't right.", formal: "Please don't feel any pressure if the timing isn't right." },
        { casual: "Happy to send a short blurb you can forward.", neutral: "I'm glad to send a short blurb you can forward.", formal: "I'd be glad to send a short note you can forward." },
      ],
    };
  switch (f.stage) {
    case "replied":
      return {
        subject: `Next step on ${co}`,
        lines: [
          { casual: "Thanks again for getting back to me.", neutral: "Thanks again for getting back to me.", formal: "Thank you again for your reply." },
          { casual: `Could we grab 20 minutes to talk through ${area}?`, neutral: `Could we find 20 minutes to talk through ${area}?`, formal: `Would you have 20 minutes to discuss ${area}?` },
          { casual: "Send me a couple of times that work and I'll make one of them happen.", neutral: "Send me a couple of times that suit you and I'll work around them.", formal: "If you share a few times that suit you, I'll work around them." },
        ],
      };
    case "meeting":
      return {
        subject: `Following our conversation`,
        lines: [
          { casual: "Thanks for the time.", neutral: "Thanks for making the time.", formal: "Thank you for making the time." },
          { casual: `I'm putting together a short proposal for ${co}.`, neutral: `As promised, I'm putting together a short proposal for ${co}.`, formal: `As discussed, I'm preparing a short proposal for ${co}.` },
          { casual: "Anything you'd want me to cover?", neutral: "Is there anything you'd like me to include?", formal: "Is there anything you would like me to include?" },
        ],
      };
    case "proposal":
      return {
        subject: `The proposal for ${co}`,
        lines: [
          { casual: "Checking in on the proposal I sent over.", neutral: "Checking in on the proposal I sent.", formal: "I wanted to check in on the proposal I sent." },
          { casual: "Happy to walk through it or tweak the scope.", neutral: "I'm glad to walk through it or adjust the scope.", formal: "I'd be glad to walk through it or adjust the scope." },
          { casual: "What would help you decide?", neutral: "What would help you decide?", formal: "What would be most helpful for your decision?" },
        ],
      };
    default:
      if (f.follow >= 1)
        return {
          subject: `Re: ${co}`,
          lines: [
            { casual: `One last nudge on my note about ${co}.`, neutral: `One last note on ${co} from me.`, formal: `A brief final note regarding ${co}.` },
            same("I know things get busy."),
            { casual: "If the timing changes, I'm easy to reach.", neutral: "If the timing changes, I'm easy to reach.", formal: "Should the timing change, I'm easy to reach." },
          ],
        };
      return {
        subject: `Re: ${co}`,
        lines: [
          { casual: `Bumping my note from ${when} in case it got buried.`, neutral: `Following up on my note from ${when}.`, formal: `I wanted to follow up on my note from ${when}.` },
          { casual: `Still happy to share what I'd look at first for ${area}.`, neutral: `I'd still be glad to share what I'd look at first for ${area}.`, formal: `I'd still be glad to share what I would review first for ${area}.` },
          { casual: "Worth 15 minutes this week?", neutral: "Would 15 minutes this week work?", formal: "Would you have 15 minutes this week?" },
        ],
      };
  }
}

/** The follow-up, written in the member's voice (or the plain template without one). */
export function draftFollowUp(f: FollowFacts, voice?: VoiceProfile | VoiceStyle | null): { subject: string; body: string } {
  const v = voice ? styleOf(voice) : NEUTRAL_VOICE;
  const t = sentences(f);
  const fix = (x: string) => (v.contractions ? x : expandContractions(x));
  const said = t.lines.map((x) => fix(x[v.formality]));
  const out: string[] = [];
  const first = f.to ? f.to.trim().split(/\s+/)[0] : null;
  if (v.greeting !== "none") out.push(first ? v.greeting.replace("{first}", first) : v.greeting === "Hey {first}," ? "Hey there," : v.greeting === "Hi {first}," ? "Hi there," : "Hello,");
  let last = said.slice(1).join(" ");
  if (v.emoji) last = `${last} 🙂`;
  out.push(said[0], last);
  let signoff: string = v.signoff === "none" ? "" : v.signoff;
  if (v.exclamations === "sometimes" && signoff === "Thanks,") signoff = "Thanks!";
  const name = v.name === "none" ? "" : v.name === "full" ? f.me.name : f.me.first;
  const sign = [signoff, name].filter(Boolean).join("\n");
  if (sign) out.push(sign);
  return { subject: t.subject, body: out.join("\n\n") };
}
