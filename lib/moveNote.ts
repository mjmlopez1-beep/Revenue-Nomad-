/**
 * The drafted note for a move (Home's "Your three moves today", lib/moves.ts): the facts it may
 * use, a template for each situation (someone the member knows, asking for an intro, the seat
 * holder, an invite to connect, an open role), the member's voice applied to it (lib/voice.ts), and
 * the links that open it in their own mail. No service writes a note: the words are these
 * templates, filled with facts already on the member's own screen. Never a locked fact, a rate or
 * anything from another member.
 *
 * Kept apart from lib/moves.ts so Home's first paint doesn't carry the templates: the page loads
 * this with the note's sheet, the first time a note is opened (app/post/MoveNote.tsx).
 *
 * Pure: no I/O and relative imports only.
 */
import type { RadarKind, RadarRow } from "./radar/types";
import { clientKinds, firstOf, myWords, seatWords, sharedLine, type SharedCompanies } from "./partners";
import { NEUTRAL_VOICE, asSentence, expandContractions, phraseSlot, styleOf, type VoiceFormality, type VoiceProfile, type VoiceStyle } from "./voice";
import { hiredWords, sinceMonth, type BuyerCtx, type Move, type MoveMe } from "./moves";

const flat = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const lowerFirst = (v: string) => (/^[A-Z][a-z]/.test(v) ? v.charAt(0).toLowerCase() + v.slice(1) : v);

/* ---------- the drafted note ---------- */

export type NoteKind = "know" | "knowHolder" | "intro" | "holderMessage" | "holderInvite" | "buyer" | "role" | "roleCold" | "ask" | "peerInvite";

/** Every fact a note may use. Each one is on the member's own screen already. */
export interface NoteFacts {
  kind: NoteKind;
  /** The company's name: a note is only drafted for a company the member can see. */
  company: string;
  /** Who it goes to, when it goes to someone. */
  to: { name: string; email: string | null; from: "your own contacts" | "unlocked on Merlin" | null } | null;
  /** "March": the month they last met, when it was more than a month ago. */
  since: string | null;
  /** What happened there, as a clause after "I saw": "Larkfield Robotics hired a fractional CRO 2 months ago". */
  saw: string | null;
  /** The member: their first name, full name, "a fractional RevOps leader", their function, the kind of clients they want. */
  me: { first: string; name: string; as: string; fn: string | null; clients: string | null };
  /** "the fractional CMO seat", for a seat holder. */
  seat: string | null;
  /** The open role's title, for a reply. */
  role: string | null;
  /** The seat's claim link with the member's invite code, for an invite to connect. */
  link: string | null;
  /** "ask" (Your network's People who can introduce you): who they are to the member, an investor or another fractional. */
  via?: "investor" | "fractional";
  /** "buyer" (and a reply to the open role sent to the buyer): the company's free facts the note's pattern line uses. */
  pattern?: BuyerCtx | null;
  /** "knowHolder": the seat their own contact holds there ("the Marketing seat"), and whether it is still going. */
  held?: { seat: string; now: boolean } | null;
  /** "peerInvite": they serve companies in the member's Crystal Ball, named only where the member has them unlocked (lib/partners sharedLine). */
  shared?: SharedCompanies | null;
}

/** "SaaS", "software", "manufacturing": the industry as a note says it before "company". Null when it reads badly there. */
export function industryWord(v: string | null | undefined): string | null {
  const t = flat(v).replace(/\s*\(.*\)$/, "").replace(/\s*&\s*/g, " and ");
  if (!t || t.length > 30 || /\b(other|services?)\b/i.test(t) || /\//.test(t)) return null;
  // A plain word goes lower case ("Manufacturing" -> "manufacturing"); one with its own capitals stays ("SaaS", "B2B", "AI").
  return t.split(" ").map((w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w)).join(" ");
}
/** "past $5M", from a revenue band ("$5M–$20M", "$50M+"). Null under $1M, pre-revenue, or when it says nothing. */
export function revenueWord(v: string | null | undefined): string | null {
  const m = /^\$(\d+(?:\.\d+)?[KMB])/i.exec(flat(v));
  return m ? `past $${m[1].toUpperCase()}` : null;
}

/**
 * The pattern a note to the buyer says why now with, from the company's free facts only:
 * "When a SaaS company is past $5M and has a fractional CMO but no Sales leader yet, Sales is
 * usually what needs an owner next." "no Sales leader yet" only when their team page was read and
 * names nobody there (lib/leaders), else "and no fractional Sales seat yet" when none is on file.
 */
export function patternLine(p: BuyerCtx | null | undefined, fn: string | null, sawHire = false): Tone | null {
  if (!fn) return null;
  const ind = industryWord(p?.industry);
  const rev = revenueWord(p?.revenue);
  const hired = p?.hired ? hiredWords(p.hired.role, p.hired.fn).replace(/^their /, "") : null;
  const a = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");
  const co = ind ? `${a(ind)} ${ind} company` : "a company";
  if (!hired && !rev) return null;
  let when: string;
  if (sawHire) {
    // The note just said what they hired: the pattern says what usually follows it.
    const gap = p?.noLeader ? ` and has no ${fn} leader yet` : "";
    when = `When ${co}${rev ? ` ${rev}` : ""} makes that hire${gap}`;
  } else if (hired) {
    const gap = p?.noLeader ? ` but no ${fn} leader yet` : p?.gap ? ` and no fractional ${fn} seat yet` : "";
    when = `When ${co}${rev ? ` is ${rev} and` : ""} has a ${hired}${gap}`;
  } else when = `When ${co} is ${rev}`;
  return {
    casual: `${when}, ${fn} is usually what needs an owner next.`,
    neutral: `${when}, ${fn} is usually what needs an owner next.`,
    formal: `In my experience, when ${when.slice(5)}, ${fn} is usually the next function to need an owner.`,
  };
}

/** A role's title as a note may say it: no bracket, no rate, no company after "at". */
export function safeRole(title: string | null | undefined): string | null {
  const t = flat(title)
    .replace(/\s*[([{].*$/, "")
    .split(/\s+(?:at|@)\s+|\s[|–—-]\s|,/i)[0]
    .replace(/[$€£]\s?[\d.,]+\s?[kKmM]?(\s?(\/|per|a)\s?\w+)?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t && !/\d{2,}/.test(t) ? t.slice(0, 60) : null;
}

/**
 * What happened, as a clause a note can say after "I saw", from the row's first line (which never
 * carries a name) and the company's name. Money raised is said without the amount.
 */
export function sawClause(row: RadarRow, company: string): string | null {
  const kind: RadarKind | undefined = row.kinds[0];
  const head = flat(row.lines[0]).split(" · ")[0];
  if (!kind || !head) return null;
  switch (kind) {
    case "adjacent":
      return `${company} ${lowerFirst(head)}`;
    case "role": {
      const t = safeRole(head.replace(/^New open role:\s*/i, ""));
      return t ? `${company} posted an open ${t} role` : `${company} posted an open fractional role`;
    }
    case "seat":
      return `${lowerFirst(head)} at ${company}`;
    case "funding":
      return `${company} just raised a round`;
    case "sales-build":
      return `${company} ${lowerFirst(head)}`;
    case "departure":
      return `${company} ${lowerFirst(head)}`;
  }
  return null;
}

/** The facts for a move's note, or null when the move has nothing to draft (a locked company, a locked seat holder). */
export function noteFacts(m: Move, row: RadarRow, me: MoveMe, origin = "", nowMs = Date.now()): NoteFacts | null {
  if (m.hidden || !m.name) return null;
  const kind: NoteKind | null =
    m.do === "message"
      ? m.way.kind === "know" && m.way.person.seat
        ? "knowHolder"
        : "know"
      : m.do === "intro"
        ? "intro"
        : m.do === "holderMessage"
          ? "holderMessage"
          : m.do === "holderInvite"
            ? "holderInvite"
            : m.do === "buyer"
              ? "buyer"
              : m.do === "reply"
                ? m.way.kind === "know"
                  ? "role"
                  : "roleCold"
                : null;
  if (!kind) return null;
  const meFacts = { first: firstOf(me.name), name: flat(me.name), as: myWords(me.title, me.function), fn: me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null, clients: clientKinds(me.icp) };
  const base = { kind, company: m.name, since: null as string | null, saw: sawClause(row, m.name), me: meFacts, seat: null as string | null, role: null as string | null, link: null as string | null };
  if (m.way.kind === "know") {
    const p = m.way.person;
    const held = kind === "knowHolder" && p.seat ? { seat: p.seat.fn && p.seat.fn !== "Other" ? `the ${p.seat.fn} seat` : "the seat", now: p.seat.now } : null;
    return { ...base, to: { name: p.name, email: p.email, from: p.email ? "your own contacts" : null }, since: sinceMonth(p.last, nowMs), role: kind === "role" ? safeRole(m.open?.title) : null, held };
  }
  if (m.way.kind === "buyer" && m.way.name) {
    const w = m.way;
    const email = w.email && w.email !== "locked" ? w.email : null;
    return { ...base, to: { name: w.name!, email, from: email ? "unlocked on Merlin" : null }, role: kind === "roleCold" ? safeRole(m.open?.title) : null, pattern: w.ctx };
  }
  if (m.way.kind === "holder" && m.way.name) {
    const link = kind === "holderInvite" && m.way.invite ? `${origin}${m.way.invite.path}` : null;
    return { ...base, to: { name: m.way.name, email: m.way.email, from: m.way.email ? "unlocked on Merlin" : null }, seat: seatWords(m.way.role, m.way.fn), link };
  }
  if (m.way.kind === "role") return { ...base, to: null, role: safeRole(m.way.title) };
  return null;
}

type Tone = Record<VoiceFormality, string>;
/** A template: five sentences in order, and the three a short note keeps. */
interface Template {
  subject: string;
  sentences: Tone[];
  short: [number, number, number];
  /** A paragraph that always closes the note, whatever its length (the claim link). */
  tail?: string;
}

function template(f: NoteFacts): Template {
  const co = f.company;
  const me = f.me.as;
  const fn = f.me.fn;
  const since: Tone = f.since
    ? { casual: `It's been a minute since ${f.since}.`, neutral: `It's been since ${f.since}, which is too long.`, formal: `It's been some time since we last spoke in ${f.since}.` }
    : { casual: "It's been a minute.", neutral: "It's been a little while.", formal: "It's been some time since we last spoke." };
  const saw: Tone = f.saw
    ? { casual: `Saw ${f.saw}.`, neutral: `I saw ${f.saw}.`, formal: `I noticed that ${f.saw}.` }
    : { casual: `${co} came up for me this week.`, neutral: `${co} came up for me this week.`, formal: `${co} came to my attention this week.` };
  switch (f.kind) {
    case "know":
      return {
        subject: fn ? `Catching up, and a thought on ${fn}` : "Catching up",
        sentences: [
          since,
          saw,
          fn
            ? {
                casual: `That's usually when ${fn} starts needing an owner, and that's what I do as ${me}.`,
                neutral: `That's usually when ${fn} starts to need an owner, which is the work I do as ${me}.`,
                formal: `In my experience that's when ${fn} begins to need an owner, which is the work I do as ${me}.`,
              }
            : {
                casual: `That's usually when a team needs an extra pair of senior hands, and that's what I do as ${me}.`,
                neutral: `That's usually when a team needs senior help for a while, which is the work I do as ${me}.`,
                formal: `In my experience that's when a team needs senior help for a time, which is the work I do as ${me}.`,
              },
          {
            casual: "No pitch. Happy to share what I'd look at in the first 30 days.",
            neutral: "No pitch, but I'd be glad to share what I'd look at in the first 30 days.",
            formal: "I'd be glad to share what I'd review in the first 30 days, with no obligation.",
          },
          { casual: "Up for 20 minutes next week?", neutral: "Worth 20 minutes next week?", formal: "Would you have 20 minutes next week?" },
        ],
        short: [1, 2, 4],
      };
    case "knowHolder": {
      // Their own contact holds a seat there: they know how the company buys, and who decides.
      const seat = f.held?.seat ?? "a seat";
      const hold = f.held && !f.held.now ? "held" : "hold";
      return {
        subject: `${co}, and a quick question`,
        sentences: [
          since,
          {
            casual: `${co} came up for me this week, and I know you ${hold} ${seat} there.`,
            neutral: `${co} came up for me this week, and I know you ${hold} ${seat} there.`,
            formal: `${co} came to my attention this week, and I understand you ${hold} ${seat} there.`,
          },
          {
            casual: `I'm looking at them for ${fn ?? "fractional"} work, which is what I do as ${me}.`,
            neutral: `I'm looking at them for ${fn ?? "fractional"} work, which is what I do as ${me}.`,
            formal: `I'm considering them for ${fn ?? "fractional"} work, which is what I do as ${me}.`,
          },
          { casual: "Happy to send referrals your way too.", neutral: "I'm glad to send referrals your way too.", formal: "I'd be glad to send referrals your way in return." },
          {
            casual: `Who decides on ${fn ?? "that"} there, and would you point me their way?`,
            neutral: `Who decides on ${fn ?? "that"} there, and would you be open to pointing me their way?`,
            formal: `Who decides on ${fn ?? "that"} there, and would you be willing to point me their way?`,
          },
        ],
        short: [1, 2, 4],
      };
    }
    case "buyer": {
      // To the buyer on file: the signal, the pattern it fits, what the member does. Short, and no pitch.
      const hire = !!f.saw && /\bhired\b/i.test(f.saw);
      const pat = patternLine(f.pattern, fn, hire) ?? {
        casual: `That's usually when ${fn ?? "a team"} starts needing a senior owner for a while.`,
        neutral: `That's usually when ${fn ?? "a team"} starts to need a senior owner for a while.`,
        formal: `In my experience that's when ${fn ?? "a team"} begins to need a senior owner for a time.`,
      };
      const clients = f.me.clients ? ` for ${f.me.clients}` : "";
      return {
        subject: fn ? `${fn} at ${co}` : `A thought on ${co}`,
        sentences: [
          saw,
          pat,
          { casual: `That's the work I do as ${me}${clients}.`, neutral: `That's the work I do as ${me}${clients}.`, formal: `That's the work I do as ${me}${clients}.` },
          {
            casual: "No pitch. Happy to share what I'd look at in the first 30 days.",
            neutral: "No pitch, but I'd be glad to share what I'd look at in the first 30 days.",
            formal: "I'd be glad to share what I'd review in the first 30 days, with no obligation.",
          },
          { casual: "Up for 20 minutes next week?", neutral: "Worth 20 minutes next week?", formal: "Would you have 20 minutes next week?" },
        ],
        short: [0, 1, 4],
      };
    }
    case "intro":
      return {
        subject: `An introduction at ${co}?`,
        sentences: [
          since,
          saw,
          {
            casual: `I work with teams like that as ${me}, and I'd love to meet whoever owns ${fn ?? "that"} there.`,
            neutral: `I work with teams like that as ${me}, and I'd like to meet whoever owns ${fn ?? "that"} there.`,
            formal: `I work with comparable teams as ${me}, and I'd value meeting whoever is responsible for ${fn ?? "that"} there.`,
          },
          { casual: "You know the team way better than I do.", neutral: "You know the team far better than I do.", formal: "You know the team far better than I do." },
          {
            casual: "Open to making an intro if I send a short note you can forward?",
            neutral: "Would you be open to an introduction if I send a short note you can forward?",
            formal: "Would you be willing to introduce me if I send a short note you can forward?",
          },
        ],
        short: [1, 2, 4],
      };
    case "holderMessage":
    case "holderInvite": {
      const seat = f.seat ?? "a fractional seat";
      const kinds = f.me.clients ?? "similar companies";
      return {
        subject: `Your seat at ${co}`,
        sentences: [
          { casual: `Saw you held ${seat} at ${co}.`, neutral: `I saw you held ${seat} at ${co}.`, formal: `I noticed that you held ${seat} at ${co}.` },
          { casual: `I'm ${me} working with ${kinds}.`, neutral: `I'm ${me} and I work with ${kinds}.`, formal: `I'm ${me} and I work with ${kinds}.` },
          {
            casual: `I'm looking at ${co}${fn ? ` for ${fn} work` : ""}, and you know how they buy.`,
            neutral: `I'm looking at ${co}${fn ? ` for ${fn} work` : ""}, and you know how they buy.`,
            formal: `I'm considering ${co}${fn ? ` for ${fn} work` : ""}, and you know how they buy.`,
          },
          {
            casual: "I'd love ten minutes on how the seat came about, and I'm happy to send referrals your way.",
            neutral: "I'd value ten minutes on how the seat came about, and I'm glad to send referrals your way.",
            formal: "I'd value ten minutes on how the seat came about, and I'd be glad to send referrals your way.",
          },
          { casual: "Up for swapping notes?", neutral: "Open to swapping notes and referrals?", formal: "Would you be open to comparing notes?" },
        ],
        short: [0, 1, 4],
        ...(f.kind === "holderInvite" && f.link ? { tail: `Your seat is on Merlin, a data exchange for fractional operators. Claim it with this link and we're connected there.\n${f.link}` } : {}),
      };
    }
    case "peerInvite": {
      // Fractionals' Invite to connect: a fractional who serves the same kind of clients. `seat` is their side ("RevOps"), when known.
      const kinds = f.me.clients ?? "the same kind of companies";
      const side = f.seat ? ` on the ${f.seat} side` : "";
      return {
        subject: "Comparing notes on clients",
        sentences: [
          { casual: `I'm ${me} working with ${kinds}.`, neutral: `I'm ${me} and I work with ${kinds}.`, formal: `I'm ${me} and I work with ${kinds}.` },
          f.shared
            ? { casual: sharedLine(f.shared), neutral: sharedLine(f.shared), formal: sharedLine(f.shared) }
            : {
                casual: `Looks like you serve the same kind of clients${side}.`,
                neutral: `It looks like you serve the same kind of clients${side}.`,
                formal: `It appears you serve the same kind of clients${side}.`,
              },
          {
            casual: "I'd love to compare notes on who we each work with and where we could bring each other in.",
            neutral: "I'd like to compare notes on who we each work with and where we could bring each other in.",
            formal: "I'd value comparing notes on who we each work with and where we might bring each other in.",
          },
          { casual: "No pitch, just two people serving the same clients.", neutral: "No pitch, just two people serving the same clients.", formal: "There's no pitch here, simply two people serving the same clients." },
          { casual: "Up for connecting?", neutral: "Open to connecting?", formal: "Would you be open to connecting?" },
        ],
        short: [0, 1, 4],
        ...(f.link ? { tail: `I'm on Merlin, a data exchange for fractional operators. Connect with me there:\n${f.link}` } : {}),
      };
    }
    case "role": {
      const role = f.role ? `an open ${f.role} role` : `an open fractional${fn ? ` ${fn}` : ""} role`;
      return {
        subject: f.role ? `The ${f.role} role at ${co}` : `The open role at ${co}`,
        sentences: [
          since,
          { casual: `Saw ${co} posted ${role}.`, neutral: `I saw ${co} posted ${role}.`, formal: `I noticed that ${co} posted ${role}.` },
          {
            casual: `That's what I do as ${me}, so I've applied through the posting.`,
            neutral: `That's the work I do as ${me}, so I've applied through the posting.`,
            formal: `That's the work I do as ${me}, and I've applied through the posting.`,
          },
          { casual: "Wanted you to hear it from me first.", neutral: "I wanted you to hear it from me, not from the pile.", formal: "I wanted you to hear it from me directly." },
          {
            casual: "Could you point me to whoever's running the search?",
            neutral: "Could you point me to whoever is running the search?",
            formal: "Would you be able to point me to whoever is leading the search?",
          },
        ],
        short: [1, 2, 4],
      };
    }
    case "ask": {
      // Asking someone who can introduce the member to companies they know: what Merlin knows is who they are, never who they know.
      const where = f.via === "investor" ? "across the companies you back" : "through your clients";
      return {
        subject: "An introduction?",
        sentences: [
          since,
          {
            casual: `I'm taking on a new client as ${me}${f.me.clients ? `, ideally ${f.me.clients}` : ""}.`,
            neutral: `I'm taking on a new client as ${me}${f.me.clients ? `, ideally ${f.me.clients}` : ""}.`,
            formal: `I'm taking on a new client as ${me}${f.me.clients ? `, ideally ${f.me.clients}` : ""}.`,
          },
          { casual: `You see a lot of teams ${where}.`, neutral: `You see a lot of teams ${where}.`, formal: `You see a great many teams ${where}.` },
          {
            casual: `If one of them needs ${fn ?? "senior"} help part-time, I'd love an intro.`,
            neutral: `If one of them needs ${fn ?? "senior"} help part-time, I'd be grateful for an introduction.`,
            formal: `If one of them would benefit from part-time ${fn ?? "senior"} leadership, I'd be grateful for an introduction.`,
          },
          { casual: "Anyone come to mind? Happy to return the favor.", neutral: "Does anyone come to mind? I'm glad to return the favor.", formal: "Does anyone come to mind? I'd be glad to return the favor." },
        ],
        short: [1, 3, 4],
      };
    }
    case "roleCold": {
      const role = f.role ? `the open ${f.role} role` : `the open fractional${fn ? ` ${fn}` : ""} role`;
      return {
        subject: f.role ? `The ${f.role} role at ${co}` : `The open role at ${co}`,
        sentences: [
          { casual: `I'm writing about ${role} at ${co}.`, neutral: `I'm writing about ${role} at ${co}.`, formal: `I'm writing regarding ${role} at ${co}.` },
          {
            casual: `I'm ${me}, and this is the work I do${f.me.clients ? ` for ${f.me.clients}` : ""}.`,
            neutral: `I'm ${me}, and this is the work I do${f.me.clients ? ` for ${f.me.clients}` : ""}.`,
            formal: `I'm ${me}, and this is the work I do${f.me.clients ? ` for ${f.me.clients}` : ""}.`,
          },
          {
            casual: "I'd start with a short working session on what the first 90 days should cover.",
            neutral: "I'd start with a short working session on what the first 90 days should cover.",
            formal: "I'd propose starting with a short working session on what the first 90 days should cover.",
          },
          {
            casual: "I work part-time by design, so you get senior judgment without a full-time hire.",
            neutral: "I work part-time by design, so you get senior judgment without a full-time hire.",
            formal: "I work part-time by design, which gives you senior judgment without a full-time hire.",
          },
          { casual: "Could we find 20 minutes this week?", neutral: "Could we find 20 minutes this week?", formal: "Would you have 20 minutes this week?" },
        ],
        short: [0, 1, 4],
      };
    }
  }
}

export interface NoteDraft {
  kind: NoteKind;
  subject: string;
  body: string;
  /** Who it goes to: the address only when the member already has it. */
  to: NoteFacts["to"];
  /** The style it was written in came from the member's saved voice. */
  voiced: boolean;
}

const SMALLTALK: Tone = { casual: "Hope you're doing well.", neutral: "Hope you're well.", formal: "I hope this finds you well." };

/**
 * The note for a move, written from its template in the member's voice (lib/voice.ts): their
 * greeting and sign-off, three sentences or five, their tone, with or without contractions, an
 * exclamation mark or an emoji where they use them, small talk first when they do, and at most one
 * of their stock phrases where it fits. With no voice saved it is the plain template.
 */
export function draftNote(f: NoteFacts, voice?: VoiceProfile | VoiceStyle | null): NoteDraft {
  const v = voice ? styleOf(voice) : NEUTRAL_VOICE;
  const t = template(f);
  const tone = v.formality;
  const fix = (x: string) => (v.contractions ? x : expandContractions(x));
  const picked = (v.length === "short" ? t.short.map((k) => t.sentences[k]) : t.sentences).map((x) => fix(x[tone]));
  // Paragraphs: the opening pair, the middle, and the ask on a line of its own.
  const ask = picked[picked.length - 1];
  const paras = picked.length === 3 ? [`${picked[0]} ${picked[1]}`, ask] : [`${picked[0]} ${picked[1]}`, `${picked[2]} ${picked[3]}`, ask];
  // At most one stock phrase: their own small talk when they open with it, else their closing line.
  const openPhrase = v.opener === "smalltalk" ? v.phrases.find((p) => phraseSlot(p) === "open") : undefined;
  const closePhrase = openPhrase ? undefined : v.phrases.find((p) => phraseSlot(p) === "close");
  const bang = v.exclamations === "sometimes";
  const lines: string[] = [];
  const first = f.to ? firstOf(f.to.name) : null;
  if (v.greeting !== "none") lines.push(first ? v.greeting.replace("{first}", first) : v.greeting === "Hey {first}," ? "Hey there," : v.greeting === "Hi {first}," ? "Hi there," : "Hello,");
  let banged = false;
  if (v.opener === "smalltalk") {
    let s = openPhrase ? asSentence(openPhrase) : fix(SMALLTALK[tone]);
    if (bang && s.endsWith(".")) (s = `${s.slice(0, -1)}!`), (banged = true);
    paras[0] = `${s} ${paras[0]}`;
  }
  if (v.emoji) paras[paras.length - 1] = `${paras[paras.length - 1]} 🙂`;
  lines.push(...paras);
  if (t.tail) lines.push(v.contractions ? t.tail : t.tail.replace("we're connected", "we are connected"));
  if (closePhrase) lines.push(asSentence(closePhrase));
  let signoff: string = v.signoff === "none" ? "" : v.signoff;
  if (bang && !banged) {
    // One exclamation mark, where they'd put it: on their thanks.
    if (signoff === "Thanks,") signoff = "Thanks!";
    else if (!closePhrase || !/!$/.test(closePhrase)) lines.push(tone === "formal" ? "Thank you!" : "Thanks!");
  }
  const name = v.name === "none" ? "" : v.name === "full" ? f.me.name : f.me.first;
  const sign = [signoff, name].filter(Boolean).join("\n");
  if (sign) lines.push(sign);
  return { kind: f.kind, subject: t.subject, body: lines.join("\n\n"), to: f.to, voiced: !!voice };
}

/** The sentences a note's own template wrote (its greeting, sign-off, small talk, claim link and stock phrase aside): 3 or 5. */
export function templateSentences(f: NoteFacts, voice?: VoiceProfile | VoiceStyle | null): string[] {
  const v = voice ? styleOf(voice) : NEUTRAL_VOICE;
  const t = template(f);
  const fix = (x: string) => (v.contractions ? x : expandContractions(x));
  return (v.length === "short" ? t.short.map((k) => t.sentences[k]) : t.sentences).map((x) => fix(x[v.formality]));
}

/* ---------- sending it: the member's own mail ---------- */

/** An address worth putting in a link (one address, nothing else). */
const ADDRESS = /^[^\s<>"',;:()[\]\\@]+@[^\s<>"',;:()[\]\\@]+\.[^\s<>"',;:()[\]\\@]+$/;
const addr = (to: string | null | undefined) => (to && ADDRESS.test(to.trim()) ? to.trim() : "");

/** A mailto: link with the subject and the body. The address only when the member already has it; otherwise To is left empty. */
export function mailtoLink(to: string | null | undefined, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(addr(to))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
/** The same as a Gmail compose window (a link the member opens: no Google permission is asked for). */
export function gmailLink(to: string | null | undefined, subject: string, body: string): string {
  const a = addr(to);
  return `https://mail.google.com/mail/?view=cm&fs=1${a ? `&to=${encodeURIComponent(a)}` : ""}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
