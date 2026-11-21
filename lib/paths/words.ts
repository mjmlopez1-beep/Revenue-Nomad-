/**
 * A way in, said plainly: one sentence, one next action, and a short note in the member's own voice
 * (lib/voice.ts) that they send themselves. Pure.
 *
 * What a sentence may name:
 *  - the person the member knows, as the member's own list has them (their name and title);
 *  - the company, when the member can see it, else "this company";
 *  - the company the bridge happened at, when it is the one the person's own entry names or one
 *    the member can see, else its kind ("a SaaS company");
 *  - the person on the other side only by the seat, function and year (free facts), never by name:
 *    "Acme's fractional RevOps lead", "the person who held Acme's fractional Sales seat in 2022".
 */
import { NEUTRAL_VOICE, expandContractions, type VoiceStyle } from "../voice";
import type { PathKind, PathSource } from "./types";

export interface Who {
  name: string;
  first: string;
  title: string | null;
  src: PathSource[];
  /** Met through Google (meetings or mail), not only saved. */
  met: boolean;
}

/** "your LinkedIn connection", "you've met", "a member you've messaged", "in your contacts". */
export function srcWords(w: Who): string {
  if (w.src.includes("messages")) return "a member you've messaged";
  if (w.src.includes("google") && w.met) return w.src.includes("linkedin") ? "your LinkedIn connection, and you've met" : "you've met";
  if (w.src.includes("linkedin")) return "your LinkedIn connection";
  return "in your contacts";
}

/** What the sentence needs about the company and the seat on the other side. */
export interface Parts {
  kind: PathKind;
  who: Who;
  /** The company: its name when the member can see it, else null ("this company"). */
  target: string | null;
  /** The bridge company's words ("Brightloop", "a SaaS company"). */
  bridge?: string;
  /** The bridge as the note says it to the person, who knows where they worked: its name, or "one of your past clients". */
  bridgeNote?: string;
  /** The seat's function on the other side (or the contact's own seat for "seat"), and whether it is still going. */
  fn?: string | null;
  active?: boolean;
  /** The year it is about ("in 2023"): the seat's own, or when the bridge happened. Null for now. */
  year?: number | null;
  /** The start year of the seat on the other side, at the company (2nd degree). */
  tYear?: number | null;
  /** hired: "Hiring for the seat" or "Reported to"; a decision maker on a record has none. */
  rel?: string | null;
  /** prevco through one of the company's leaders on Merlin (no seat on the other side). */
  leader?: boolean;
  /** client: the shared client's words. */
  shared?: string;
}

/** "Acme's", "Acme Robotics'", or "this company's". */
const poss = (t: string | null) => (t ? (/s$/i.test(t) ? `${t}'` : `${t}'s`) : "this company's");
const at = (t: string | null) => t ?? "this company";
const fnSeat = (fn: string | null | undefined) => (fn ? `fractional ${fn}` : "fractional");
const inYear = (y: number | null | undefined) => (y ? ` in ${y}` : "");
/** "Acme's fractional RevOps lead", or "someone who held Acme's fractional Sales seat in 2021". */
const other = (p: Parts) => (p.active ? `${poss(p.target)} ${fnSeat(p.fn)} lead` : `someone who held ${poss(p.target)} ${fnSeat(p.fn)} seat${inYear(p.tYear)}`);

/** The one plain sentence. */
export function lineOf(p: Parts): string {
  const who = p.kind === "client" ? p.who.name : `${p.who.name} (${srcWords(p.who)})`;
  switch (p.kind) {
    case "leads":
      return p.who.title ? `${who} is ${p.who.title} at ${at(p.target)}.` : `${who} is a decision maker at ${at(p.target)}.`;
    case "hired":
      return p.rel === "Reported to"
        ? `${who} had ${poss(p.target)} ${fnSeat(p.fn)} lead report to them${inYear(p.year)}.`
        : `${who} hired ${poss(p.target)} ${fnSeat(p.fn)} lead${inYear(p.year)}.`;
    case "seat":
      return p.active ? `${who} holds ${poss(p.target)} ${fnSeat(p.fn)} seat now.` : `${who} held ${poss(p.target)} ${fnSeat(p.fn)} seat${inYear(p.year)}.`;
    case "works":
      return `${who} works at ${at(p.target)}${p.who.title ? ` as ${p.who.title}` : ""}.`;
    case "overlap":
      if (p.active) return p.year ? `${who} worked with ${other(p)} at ${p.bridge} in ${p.year}.` : `${who} works with ${other(p)} at ${p.bridge}.`;
      return p.year ? `${who} worked at ${p.bridge} in ${p.year} with ${other(p)}.` : `${who} works at ${p.bridge} with ${other(p)}.`;
    case "colleague":
      return p.active ? `${who} works at ${p.bridge}, where ${other(p)} also holds a seat.` : `${who} works at ${p.bridge}, where ${other(p)} holds a seat now.`;
    case "prevco":
      if (p.leader) return `${who} works at ${p.bridge}, where one of ${poss(p.target)} leaders also worked.`;
      return p.active ? `${who} works at ${p.bridge}, where ${other(p)} held a seat${inYear(p.year)}.` : `${who} works at ${p.bridge}, where ${other(p)} also held a seat${inYear(p.year)}.`;
    case "client":
      return `You and ${p.who.name} both worked with ${p.shared}. ${p.who.first} ${p.active ? "holds" : "held"} ${poss(p.target)} ${fnSeat(p.fn)} seat${p.active ? " now" : inYear(p.year)}.`;
  }
}

/** The next action, in one line. */
export function actionOf(p: Parts): string {
  const f = p.who.first;
  switch (p.kind) {
    case "leads":
      return `Write to ${f}.`;
    case "hired":
      return `Write to ${f}. They have brought in a fractional before.`;
    case "seat":
      return p.active ? `Ask ${f} for an intro to the team.` : `Ask ${f} how it went and who to talk to.`;
    case "works":
      return `Ask ${f} who to talk to there.`;
    case "client":
      return `Message ${f} on Merlin. You share a client.`;
    default:
      return `Ask ${f} for an intro.`;
  }
}

export interface MeWords {
  /** Their name, as Merlin has it. */
  name: string;
  /** "a fractional CRO". */
  as: string;
  /** "SaaS companies of 51–200 people", or null. */
  clients: string | null;
  /** Their function, for "room for a fractional RevOps lead". */
  fn: string | null;
  voice?: VoiceStyle | null;
}

/** The note to send, in the member's voice: their greeting, their sign-off, their contractions. */
export function noteOf(p: Parts, me: MeWords): { subject: string; body: string } {
  const v = me.voice ?? NEUTRAL_VOICE;
  const t = p.target;
  const I = `I'm ${me.as}${me.clients ? ` working with ${me.clients}` : ""}.`;
  let subject: string;
  let lines: string[];
  switch (p.kind) {
    case "leads":
    case "hired":
      subject = t ? `${t} and fractional ${me.fn ?? "help"}` : "A quick question";
      lines = [I, `${t ?? "Your company"} looks like a fit for the work I do. Would you be open to 20 minutes in the next couple of weeks to hear what's next for the team?`];
      break;
    case "works":
      subject = t ? `Quick question about ${t}` : "A quick question";
      lines = [I, `${t ?? "Your company"} looks like a fit for the work I do. Would you be open to a quick chat, or to pointing me to the right person on the team?`];
      break;
    case "seat":
      subject = t ? `Quick question about ${t}` : "A quick question";
      lines = p.active
        ? [t ? `I saw you're working with ${t} as their fractional ${p.fn ?? ""} lead.` : `I saw you're a fractional ${p.fn ?? ""} lead at a company I'd like to work with.`, I, `I think there could be room for both of us there. Would you be open to introducing me to the team?`]
        : [`I saw you held the fractional ${p.fn ?? ""} seat at ${t ?? "a company I'm looking at"}.`.replace("  ", " "), I, `How did it go, and who would you talk to there today?`];
      break;
    case "client":
      subject = p.shared ? `${p.shared}, and a quick hello` : "A quick hello";
      lines = [
        `We've both worked with ${p.shared}.`,
        I,
        `I see you ${p.active ? "work" : "worked"} with ${t ?? "a company I'm looking at"}. Would you be open to a quick call to compare notes${me.fn ? `, and to hear whether there's room for a fractional ${me.fn} lead there` : ""}?`,
      ];
      break;
    default: {
      subject = t ? `Intro to ${t}?` : "A quick ask";
      const where = p.bridgeNote ?? p.bridge ?? "your company";
      const seat = `fractional ${p.fn ?? ""}`;
      // The company is named just before: "their" from here on.
      const why = p.leader
        ? `I believe one of their leaders worked at ${where}.`
        : p.active
          ? p.kind === "overlap"
            ? `I believe you worked with their ${seat} lead at ${where}.`
            : `I believe their ${seat} lead ${p.kind === "colleague" ? "also works with" : "worked with"} ${where}.`
          : p.kind === "overlap"
            ? `I believe you worked at ${where} with someone who held their ${seat} seat.`
            : `I believe someone who held their ${seat} seat ${p.kind === "colleague" ? "works with" : "worked with"} ${where}.`;
      lines = [`Quick ask. ${I}`, `${t ?? "There's a company that"} looks like a strong fit for what I do, and ${why.replace("  ", " ")}`, "Would you be open to introducing us? I'm happy to send a short note you can forward."];
      if (!t) lines[1] = `There's a company I'd like to work with, and ${why.replace("  ", " ")}`;
    }
  }
  const greet = v.greeting === "none" ? "" : v.greeting.replace("{first}", p.who.first);
  const sign = v.name === "none" ? "" : v.name === "full" ? me.name : me.name.trim().split(/\s+/)[0];
  const close = [v.signoff === "none" ? "" : v.signoff, sign].filter(Boolean).join("\n");
  let body = [greet, lines.join(" "), close].filter(Boolean).join("\n\n");
  body = body.replace(/ {2,}/g, " ").replace(/ \./g, ".").replace(/ ,/g, ",");
  if (!v.contractions) body = expandContractions(body);
  return { subject, body };
}
