/**
 * The specific ask for an introduction: for someone the member knows, how strong the relationship
 * is, and who and where in the member's own list (their Crystal Ball, their saved views, their Ideal
 * Fractional Profile) that person can introduce them to, best first, in words the member can send.
 * Merlin drafts, the member sends; the generic ask is only for when there is nothing specific.
 *
 * Pure: the server (lib/paths/index.ts introPlansOf) resolves what the member may see and hands
 * these functions names that are already allowed, never an internal id:
 *  - a company by name only when the member can see it, else by its kind and size, with what it
 *    costs to open it first ("Open it free from your Crystal Ball");
 *  - the person on the other side by name only when the member can see that name (a seat holder they
 *    unlocked or one in the Fractionals directory, a leader they paid for), else by the seat;
 *  - the person the member knows as their own list has them (their Google network, their LinkedIn
 *    connections, the members they messaged): only this member's answer ever carries them.
 */
import type { PathKind } from "./types";

/** One company someone can introduce the member to, as the page and the note show it. */
export interface IntroTargetView {
  /** The company's public id. */
  id: string;
  /** Its name when the member can see it; null for a company still locked for them. */
  name: string | null;
  /** Its free facts: "Logistics · 51–200". */
  facts: string;
  /** Why it is in the member's list: their Crystal Ball, a saved view's name, or their profile. */
  inWords: string;
  /** Why now, when Merlin knows: "Hired a fractional CMO 1 month ago · No Sales leader on their team page". */
  now: string | null;
  /** How the person the member knows reaches it, in the third person: "Jake worked with Dana Ruiz at Brightloop. Dana holds this company's fractional Sales seat now." */
  how: string;
  degree: 1 | 2;
  /** 1 to 100: how strong the way in is, times how well the company fits. */
  score: number;
  /** A locked company: what opening it costs first ("Open it free from your Crystal Ball"), so the note can name it. Null when named. */
  open: string | null;
}

/** Someone the member knows, with the companies in their list that person can introduce them to. */
export interface IntroPlanView {
  /** The member's own keys for this person (a Google contact "g:<email>", a LinkedIn connection "l:<slug>", a member "m:<id>"). */
  keys: string[];
  name: string;
  first: string;
  /** "47 meetings since Dec 2024, last Oct 23 · Strong". */
  strength: string;
  /** "Why Jake": "47 meetings since Dec 2024 · can introduce you to 3 companies in your profile". */
  why: string;
  /** Best first, at most INTRO_TARGETS_MAX. */
  targets: IntroTargetView[];
  /** Every company in the member's list they can introduce them to, and how many of those are still locked for the member. */
  count: number;
  locked: number;
  /** What the note says, for the named companies only (at most two): the facts the "introAsk" template reads. */
  ask: IntroAsk | null;
}

/** The facts the specific note uses (lib/moveNote.ts "introAsk"): only names the member may see. */
export interface IntroAsk {
  lines: IntroAskLine[];
  /** Companies the person can introduce them to that are still locked (said as a count, never named). */
  locked: number;
}
export interface IntroAskLine {
  /** The company, named. */
  company: string;
  /** How the person reaches it, said to them: "You worked with Dana Ruiz at Brightloop, and Dana holds the fractional Sales seat at Acorn Ridge Logistics now." */
  you: string;
  /** Why now, as a clause after the company: "just hired a fractional CMO and has no Sales leader yet". Null when Merlin knows nothing new. */
  now: string | null;
  /** Who the member asks to meet there, named, or null (the team, whoever owns the function). */
  person: string | null;
  /** Who the ask is to meet, as the note says it: "Dana Ruiz", "the team there", "whoever owns Sales there". */
  to: string;
}

/** Who the note asks to meet: the person on the other side by name, else the team (they are there, or were), else whoever owns the member's function. */
export function askTo(f: IntroFacts, fn: string | null): string {
  const p = askPerson(f);
  if (p) return p;
  const at = f.company ? `at ${f.company}` : "there";
  if (f.kind === "seat" || f.kind === "hired" || f.kind === "client") return `the team ${at}`;
  return fn ? `whoever owns ${fn} ${at}` : `the right person ${at}`;
}

export const INTRO_TARGETS_MAX = 5;
export const INTRO_NOTE_MAX = 2;

/** Why a company is in the member's list, and how much that counts (Crystal Ball's band, a saved view, their profile). */
export type ListFit = { kind: "ball"; band: "High" | "Medium" | "Low" } | { kind: "view"; name: string } | { kind: "profile" };
export const FIT_WEIGHT = (f: ListFit) => (f.kind === "ball" ? (f.band === "High" ? 1 : f.band === "Medium" ? 0.75 : 0.5) : f.kind === "view" ? 0.55 : 0.45);
export const fitWords = (f: ListFit) => (f.kind === "ball" ? "In your Crystal Ball" : f.kind === "view" ? `Saved view: ${f.name}` : "Fits your profile");

/** What the server resolved about one way in, every name already one the member may see. */
export interface IntroFacts {
  kind: PathKind;
  degree: 1 | 2;
  /** The person the member knows: first name, and their title when their own entry has one. */
  first: string;
  title: string | null;
  /** The company, named, or null (locked). */
  company: string | null;
  /** The bridge company as the member may say it ("Brightloop", "a SaaS company"), and as the note says it to the person ("one of your past clients"). */
  bridge: string | null;
  bridgeNote: string | null;
  /** The function and whether the seat on the other side (or their own) is still going. */
  fn: string | null;
  active: boolean;
  /** The person on the other side, when the member may see their name, and their title there when they may see it. */
  other: string | null;
  otherRole: string | null;
  /** hired: "Reported to" or "Hiring for the seat". */
  rel: string | null;
  /** prevco through one of the company's leaders on file. */
  leader: boolean;
}

const fnSeat = (fn: string | null) => (fn && fn !== "Other" ? `fractional ${fn}` : "fractional");
const poss = (t: string | null) => (t ? (/s$/i.test(t) ? `${t}'` : `${t}'s`) : "this company's");

/** How the person reaches the company, for the page (third person). */
export function howThey(f: IntroFacts): string {
  const T = f.company;
  const at = T ?? "this company";
  const seat = `${poss(T)} ${fnSeat(f.fn)} seat`;
  switch (f.kind) {
    case "leads":
      return f.title ? `${f.first} is ${f.title} at ${at}.` : `${f.first} is a decision maker at ${at}.`;
    case "works":
      return `${f.first} works at ${at}${f.title ? ` as ${f.title}` : ""}.`;
    case "hired":
      return f.rel === "Reported to" ? `${f.first} had ${poss(T)} ${fnSeat(f.fn)} lead report to them.` : `${f.first} hired ${poss(T)} ${fnSeat(f.fn)} lead.`;
    case "seat":
      return f.active ? `${f.first} holds ${seat} now.` : `${f.first} held ${seat}.`;
    case "overlap":
      return f.other
        ? `${f.first} worked with ${f.other} at ${f.bridge}. ${f.other} ${f.active ? "holds" : "held"} ${seat}${f.active ? " now" : ""}.`
        : `${f.first} worked at ${f.bridge} with ${f.active ? `${poss(T)} ${fnSeat(f.fn)} lead` : `someone who held ${seat}`}.`;
    case "colleague":
      // The person on the other side holds a seat at the bridge now; the company's seat is theirs now, or was.
      return `${f.first} works at ${f.bridge}, where ${f.other ?? (f.active ? `${poss(T)} ${fnSeat(f.fn)} lead` : `the person who held ${seat}`)} holds a seat now.`;
    case "prevco":
      if (f.leader) return `${f.first} works at ${f.bridge}, where ${f.other ? `${f.other}, one of ${poss(T)} leaders,` : `one of ${poss(T)} leaders`} also worked.`;
      return `${f.first} works at ${f.bridge}, where ${f.other ?? `the person who ${f.active ? "holds" : "held"} ${seat}`} held a seat before.`;
    case "client":
      return `${f.first} serves ${at} too.`;
  }
}

/** The same, said to the person in the note. Only for a named company. */
export function howYou(f: IntroFacts & { company: string }): string {
  const T = f.company;
  const where = f.bridgeNote ?? f.bridge ?? "your company";
  const role = f.otherRole ? ` as their ${f.otherRole.replace(/^Fractional\s+/i, "fractional ")}` : "";
  switch (f.kind) {
    case "leads":
    case "works":
      return `You're at ${T}${f.title ? ` as ${f.title}` : ""}.`;
    case "hired":
      return `You brought in the fractional ${f.fn ?? ""} lead at ${T}.`.replace("  ", " ");
    case "seat":
      return f.active ? `You hold the ${fnSeat(f.fn)} seat at ${T}.` : `You held the ${fnSeat(f.fn)} seat at ${T}.`;
    case "overlap":
      return f.other
        ? `You worked with ${f.other} at ${where}. ${f.other} ${f.active ? "is now at" : "was at"} ${T}${role || ` in the ${fnSeat(f.fn)} seat`}.`
        : `You worked at ${where} with the person who ${f.active ? "now holds" : "held"} the ${fnSeat(f.fn)} seat at ${T}.`;
    case "colleague":
      return f.other ? `${f.other} works with you at ${where} and is also at ${T}${role || ` in the ${fnSeat(f.fn)} seat`}.` : `Someone you work with at ${where} also holds the ${fnSeat(f.fn)} seat at ${T}.`;
    case "prevco":
      if (f.leader) return f.other ? `${f.other}, one of the leaders at ${T}, worked at ${where} too.` : `One of the leaders at ${T} worked at ${where} too.`;
      return f.other ? `${f.other} held a seat at ${where} and is at ${T} now${role}.` : `Someone who held a seat at ${where} is at ${T} now.`;
    case "client":
      return `You work with ${T} too.`;
  }
}

/** Who the member asks to meet: the person on the other side when named (2nd degree), else nobody named (the person themself is the way in). */
export const askPerson = (f: IntroFacts) => (f.degree === 2 && f.other ? f.other : null);

/** "Why Jake": the strength in counts, and how many companies in the member's list. */
export function whyLine(strength: string, count: number): string {
  // "47 meetings since Dec 2024, last Oct 23 · Strong" -> "47 meetings since Dec 2024": the card says the rest beside it.
  const counts = strength.replace(/ · [A-Za-z ]+$/, "").replace(/, last [^·]+$/, "");
  return count > 0 ? `${counts} · can introduce you to ${count} ${count === 1 ? "company" : "companies"} in your profile` : counts;
}

/** When there is nothing specific: what the UI says beside the generic note. */
export const NOTHING_SPECIFIC = "Nothing specific yet: this note asks generally.";
