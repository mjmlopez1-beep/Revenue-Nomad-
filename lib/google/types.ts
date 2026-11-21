/**
 * Your network: who a member already knows at companies on Merlin, from their own Google Calendar
 * and Contacts (lib/google), Gmail headers for test members, and what they chose to save from
 * their own inbox through their own Claude (save_my_network). Private to that member.
 *
 * This file is pure (no I/O, no table import), so lib/table.ts, lib/radar and the app can read it.
 *
 * What is kept (State.network[memberId]), and nothing else:
 *  - per company on Merlin (internal id): counts (meetings, upcoming meetings, emails, contacts),
 *    first, last and next touch, and the months it had meetings in (for "a seat you might have held");
 *  - up to PEOPLE_MAX people per company: email, name, title, their counts and dates, where it came from;
 *  - for people at no company on Merlin: a count, and the ones the member really knows (2+
 *    meetings, replies both ways, or a saved contact) or who can introduce them (a contact whose
 *    title says fractional or investor), at most LOOSE_MAX, with their email domain (SourceData.loose);
 *  - per company, who sent the invites and how many of their people came at most (invitedBy, side):
 *    counts that tell a sales process from a relationship, never who or what it was about;
 *  - what the member said about a company or a person ("Not a relationship", "It is one"), and what
 *    Merlin set aside at the last read (auto), so Crystal Ball ranks by real relationships only;
 *  - the Google refresh tokens, sealed (lib/google/crypto.ts), never sent to a browser or logged;
 *  - how long the first read took, when the member saw its result, and the companies they said
 *    were "Not a seat" (so a seat guess they dismissed stays dismissed).
 * Never an event title, description or attendee list, never a subject, snippet or body. Calendar
 * events are fetched without them (the fields parameter leaves them out), Gmail with headers only.
 *
 * Deleted, with what came from it on Your pipeline (lib/pipeline.ts forgetGoogle), on Disconnect
 * and delete everything, or GONE_KEEP_DAYS after a read found the access removed at Google and the
 * member didn't connect again (lib/google forgetIn, expireRevoked).
 *
 * Google API Services User Data Policy, Limited Use: this data is used only to show this member
 * their own network inside Merlin. It is never shown to another member or an admin, never added to
 * shared counts or the radar's model, and never used to train anything.
 */

export type NetSource = "calendar" | "contacts" | "gmail" | "claude";
export const SOURCE_WORDS: Record<NetSource, string> = { calendar: "Calendar", contacts: "Contacts", gmail: "Gmail", claude: "Gmail via Claude" };

export type Warmth = "Hot" | "Warm" | "Fading" | "Cold";

/** One person at one company, from one source (or merged across them for the view). Dates are YYYY-MM-DD. */
export interface NetPerson {
  /** Lowercase email, or "n:<name key>" for a Claude entry that gave a name and no email. */
  key: string;
  email?: string;
  name?: string;
  title?: string;
  /** Past meetings, upcoming meetings (calendar). */
  meetings?: number;
  upcoming?: number;
  /** Emails each way (gmail), or the member's count (claude, in `emails`). */
  sent?: number;
  received?: number;
  emails?: number;
  /** Replies go both ways. */
  both?: boolean;
  first?: string;
  last?: string;
  next?: string;
  /** What the member said they are (claude): client, former client, referral partner, prospect, peer, other. */
  rel?: string;
  /** The organisation on their saved contact (the member's own words). */
  org?: string;
  /** A saved contact (Google Contacts). */
  saved?: boolean;
  src: NetSource[];
}

/** One company, from one source. */
export interface NetCompany {
  /** The email domain it matched by, when it matched by one. */
  domain?: string;
  people: NetPerson[];
  /** People there beyond PEOPLE_MAX (counted, not kept). */
  more?: number;
  meetings?: number;
  upcoming?: number;
  emails?: number;
  contacts?: number;
  first?: string;
  last?: string;
  next?: string;
  /** Distinct months with a past meeting (YYYY-MM), at most 30 kept. */
  months?: string[];
  /** Past meetings someone at the company sent the invite for (the member's calendar's organizer flag). */
  invitedBy?: number;
  /** The most of their people at one meeting. */
  side?: number;
  /**
   * Gmail only, for Your pipeline (lib/pipeline.ts): the time (ISO, from the Date header) of the
   * latest email out to someone there and in from someone there, and of the first one out. Times
   * only, never a subject or text.
   */
  outAt?: string;
  inAt?: string;
  outFirstAt?: string;
}

/** Someone at no company on Merlin the member really knows or who can introduce them (SourceData.loose). */
export interface LoosePerson extends NetPerson {
  /** Their work email's domain; none for personal email. */
  domain?: string;
}

export interface SourceData {
  at: string;
  /** Internal company id -> what this source says. */
  companies: Record<string, NetCompany>;
  /** People who matched no company on Merlin (a count only). */
  unmatched: number;
  /** People the member really meets or talks with (2+ meetings, or replies both ways), matched or not. A count only. */
  real: number;
  /** People at no company on Merlin worth listing for the member alone (LOOSE_MAX at most). */
  loose?: LoosePerson[];
}

export interface GoogleLink {
  /** The refresh token, sealed (lib/google/crypto.ts). */
  token: string;
  /** The Google account's own email, shown to the member only. */
  email: string;
  scopes: string[];
  connectedAt: string;
  /**
   * "reconnect": Google said the token is gone (invalid_grant: the member removed Merlin's access,
   * or it expired). What it derived stays GONE_KEEP_DAYS from goneAt, then Merlin deletes it
   * (lib/google expireRevoked) unless the member connected again.
   */
  status?: "ok" | "reconnect";
  /** When a sync first found the grant revoked or invalid (ISO). A new connection starts without it. */
  goneAt?: string;
  /** When it last went through (ISO). */
  syncedAt?: string;
  /** Short reason the last sync failed ("unreachable", "http_500"), never a token. */
  error?: string;
  /** Gmail only: it came from its own OAuth client (GOOGLE_GMAIL_CLIENT_ID), so dropping it revokes at Google too. */
  ownClient?: boolean;
  /** Measured: milliseconds from this connection being made to its first read finishing. Set once, by that read. */
  firstMs?: number;
}

export interface MemberNetwork {
  google?: GoogleLink;
  gmail?: GoogleLink;
  cal?: SourceData;
  con?: SourceData;
  gm?: SourceData;
  /** What the member saved through their own Claude (save_my_network). */
  claude?: SourceData & { saves: string[]; named: { id: string; at: string }[] };
  /** When the member saw the result of their first read (the connect moment shows once). ISO. */
  found?: string;
  /** Internal company ids the member said were "Not a seat": those seat guesses stay dismissed. */
  notSeats?: string[];
  /** Internal company id -> what the member said it is ("Not a relationship"). Kept across reads. */
  notRel?: Record<string, NotRelWhy>;
  /** Internal company ids where the member undid what Merlin set aside ("It is a relationship"). */
  isRel?: string[];
  /** People (their key, an email) the member said are not a relationship. */
  notPeople?: string[];
  /** What Merlin set aside at the last read (internal id -> kind), so Crystal Ball reads it without the table. */
  auto?: Record<string, SetKind>;
}

/** What the member can say a company is instead of a relationship. */
export const NOT_REL = ["vendor", "recruiter", "oneoff", "own", "other"] as const;
export type NotRelWhy = (typeof NOT_REL)[number];
export const NOT_REL_WORDS: Record<NotRelWhy, string> = { vendor: "A vendor selling to me", recruiter: "A recruiter", oneoff: "A one-off meeting", own: "My own firm", other: "Not a relationship" };
/** What Merlin sets aside by itself: someone selling to the member, a recruiter, an investor (who goes to People who can introduce you). */
export type SetKind = "vendor" | "recruiter" | "investor";

/** State.network: member id -> their network. Nobody else's view ever reads another member's entry. */
export type NetworkState = Record<string, MemberNetwork>;

/* ---------- limits ---------- */

export const PEOPLE_MAX = 8;
/** People at no company on Merlin kept per source (the warmest). */
export const LOOSE_MAX = 300;
/** "Not a relationship" answers kept per member, companies and people each (the oldest go first). */
export const NOT_REL_MAX = 1000;
/** save_my_network: calls a member can make in any rolling 24 hours, and entries per call. */
export const CLAUDE_SAVES_DAILY = 5;
export const CLAUDE_ENTRIES_MAX = 200;
/** Companies a member's Claude saves can name for them free in any rolling 24 hours (Calendar and Contacts aren't capped). */
export const CLAUDE_NEW_DAILY = 25;
/** "A seat you might have held": meetings with a company in this many months, this many meetings in all. */
export const SEAT_MONTHS = 3;
export const SEAT_MEETINGS = 8;
/** ...and at least this many meetings a month from the first to the last (about every three weeks): a prospect's few calls aren't a seat. */
export const SEAT_RATE = 1.4;
/** A client now: a seat pattern whose last meeting is this recent (or one is coming up). */
export const CLIENT_RECENT_DAYS = 45;
/** A seat guess with fewer months or fewer meetings than these reads "Less sure" (about every other week for half a year). */
export const SEAT_SURE_MONTHS = 6;
export const SEAT_SURE_MEETINGS = 18;
/** "Not a seat" answers kept per member (the oldest go first). */
export const NOT_SEATS_MAX = 500;

/** Access removed at Google (status "reconnect"): what Merlin read from it is deleted this many days after goneAt, unless the member connects again. */
export const GONE_KEEP_DAYS = 30;
/** The day (YYYY-MM-DD) Merlin deletes what it read from a connection whose access was found removed at `goneAt`. */
export const deleteDayOf = (goneAt: string) => new Date(Date.parse(goneAt) + GONE_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
/** Past the keep: what that connection read is due for deletion. */
export const goneExpired = (goneAt: string | undefined, nowMs: number) => !!goneAt && Number.isFinite(Date.parse(goneAt)) && nowMs - Date.parse(goneAt) >= GONE_KEEP_DAYS * 86_400_000;
const longDay = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
/** Your network's line while access is removed: "Google access was removed on November 21, 2026. Reconnect within 30 days or Merlin deletes what it read from Google on December 21, 2026." */
export function goneWords(what: "Google" | "Gmail", goneAt: string, deleteOn = deleteDayOf(goneAt)): string {
  return `${what} access was removed on ${longDay(goneAt)}. Reconnect within ${GONE_KEEP_DAYS} days or Merlin deletes what it read from ${what} on ${longDay(deleteOn)}.`;
}

/* ---------- the feature switch (env only, safe anywhere on the server) ---------- */

export const networkOn = () => process.env.RN_GOOGLE === "1";

/* ---------- warmth ---------- */

const DAY_MS = 86_400_000;
const dayMs = (d: string | undefined) => (d ? Date.parse(`${d.slice(0, 10)}T12:00:00Z`) : NaN);

/**
 * Warmth from recency and frequency, 0 to 1: recency halves about every 5.5 months since the last
 * touch, frequency fills toward 1 with meetings (an email counts a quarter, a saved contact a
 * half), replies both ways count for more, and a meeting on the calendar counts as a touch now.
 */
export function warmthScore(x: { meetings?: number; upcoming?: number; emails?: number; both?: boolean; saved?: boolean; contacts?: number; last?: string; next?: string }, nowMs = Date.now()): number {
  let f = (x.meetings ?? 0) + (x.emails ?? 0) / 4 + (x.saved || (x.contacts ?? 0) > 0 ? 0.5 : 0) + (x.upcoming ?? 0) * 0.5;
  if (x.both) f *= 1.25;
  if (f <= 0) return 0;
  const last = dayMs(x.last);
  let days = Number.isFinite(last) ? Math.max(0, (nowMs - last) / DAY_MS) : 3 * 365;
  if ((x.upcoming ?? 0) > 0 || x.next) days = Math.min(days, 7);
  const rec = Math.exp(-days / 240);
  const fr = 1 - Math.exp(-f / 4);
  return Math.round(rec * fr * 100) / 100;
}

export function warmthOf(score: number): Warmth {
  return score >= 0.45 ? "Hot" : score >= 0.2 ? "Warm" : score >= 0.07 ? "Fading" : "Cold";
}

/** What the warmth grade reads: counts and dates the member's own calendar, contacts and mail give. */
export interface Touch {
  meetings?: number;
  upcoming?: number;
  emails?: number;
  both?: boolean;
  saved?: boolean;
  first?: string;
  last?: string;
  next?: string;
  /** Distinct months with a meeting, when known (a company's); else the first-to-last span says it. */
  months?: number;
}
/** The grades, in rules a member can check against their own calendar (WARMTH_RULES says them in words). */
export const HOT_MEETINGS = 4;
export const HOT_DAYS = 60;
export const WARM_DAYS = 270;
export const MAIL_WARM_DAYS = 180;
export const FADING_DAYS = 730;
export const WARMTH_RULES =
  "Hot: 4 or more meetings across at least two months, the last in the past 60 days. Warm: 2 or more meetings in the past 9 months, emails both ways in the past 6, or a meeting coming up after one you had. Fading: one meeting, or any contact in the past 2 years. Cold: a saved contact only, or nothing in 2 years.";

const daysSince = (d: string | undefined, nowMs: number) => {
  const t = dayMs(d);
  return Number.isFinite(t) ? Math.max(0, (nowMs - t) / DAY_MS) : Infinity;
};

/**
 * The warmth grade by explicit rules (WARMTH_RULES): a single call is never Warm, a burst of calls
 * in one fortnight is never Hot, and a meeting on the calendar counts only after one already had.
 */
export function warmthFor(x: Touch, nowMs = Date.now()): Warmth {
  const m = x.meetings ?? 0;
  const days = daysSince(x.last, nowMs);
  const span = Number.isFinite(dayMs(x.first)) && Number.isFinite(dayMs(x.last)) ? (dayMs(x.last) - dayMs(x.first)) / DAY_MS : 0;
  const spread = x.months !== undefined ? x.months >= 2 : span >= 28;
  const soon = (x.upcoming ?? 0) > 0 || !!x.next;
  const mail = !!x.both && (x.emails ?? 0) >= 4;
  if (m >= HOT_MEETINGS && spread && (days <= HOT_DAYS || (soon && days <= 2 * HOT_DAYS))) return "Hot";
  if ((m >= 2 && days <= WARM_DAYS) || (mail && days <= MAIL_WARM_DAYS) || (m >= 1 && soon && days <= WARM_DAYS)) return "Warm";
  if ((m >= 1 || (x.emails ?? 0) > 0 || soon) && (days <= FADING_DAYS || soon)) return "Fading";
  return "Cold";
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 5" within 30 days either way, "in March" this year, "in March 2025" another. */
export function whenWords(d: string | null | undefined, nowMs = Date.now()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? "");
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12) return null;
  const at = Date.UTC(y, mo - 1, day, 12);
  if (Math.abs(nowMs - at) <= 30 * DAY_MS) return `${MONTHS_SHORT[mo - 1]} ${day}`;
  return y === new Date(nowMs).getUTCFullYear() ? `in ${MONTHS_LONG[mo - 1]}` : `in ${MONTHS_LONG[mo - 1]} ${y}`;
}

/** The warmth's reason in plain words: "4 meetings, last in March", "1 meeting, Nov 5 · one coming up Dec 2", "12 emails both ways, last in June", "In your contacts". */
export function touchWords(x: Touch, nowMs = Date.now()): string {
  const m = x.meetings ?? 0;
  const e = x.emails ?? 0;
  const when = whenWords(x.last, nowMs);
  const parts: string[] = [];
  if (m) parts.push(`${m} ${m === 1 ? "meeting" : "meetings"}${when ? `, ${m === 1 ? "" : "last "}${when}` : ""}`);
  else if (e) parts.push(`${e} ${e === 1 ? "email" : "emails"}${x.both ? " both ways" : ""}${when ? `, last ${when}` : ""}`);
  if ((x.upcoming ?? 0) > 0 || x.next) {
    const n = whenWords(x.next, nowMs);
    parts.push(`one coming up${n ? ` ${n}` : ""}`);
  }
  if (!parts.length) return x.saved ? "In your contacts" : "In your contacts, never met";
  return parts.join(" · ");
}

export const WARMTH_RANK: Record<Warmth, number> = { Hot: 0, Warm: 1, Fading: 2, Cold: 3 };

/** Crystal Ball's chip, in words: "You know someone · Warm". The same grades Your network shows. */
export const knowWords = (w: Warmth) => `You know someone · ${w}`;

/* ---------- decision makers ---------- */

const DM_TITLE =
  /\b(ceo|cfo|coo|cro|cmo|cto|cpo|cio|cco|chief|founder|co-?founder|owner|president|managing (director|partner)|general manager|gm|vp|svp|evp|vice president|head of|partner|principal)\b/i;
/** A title that reads like someone who hires or signs: CEO, Founder, CRO, CFO, VP, Head of... */
export const isDecisionMaker = (title: string | null | undefined) => !!title && DM_TITLE.test(title) && !/\bassistant|\bexecutive assistant|\bea to\b|\bintern\b/i.test(title);

/* ---------- domains ---------- */

const FREE_MAIL = new Set(
  [
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com",
    "aol.com", "proton.me", "protonmail.com", "protonmail.ch", "pm.me", "gmx.com", "gmx.de", "gmx.net", "mail.com", "zoho.com", "zohomail.com", "yandex.com", "yandex.ru",
    "hey.com", "fastmail.com", "fastmail.fm", "qq.com", "163.com", "126.com", "web.de", "t-online.de", "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
    "bellsouth.net", "cox.net", "charter.net", "btinternet.com", "orange.fr", "free.fr", "laposte.net", "libero.it", "hotmail.co.uk", "yahoo.co.uk", "outlook.co.uk",
    "live.co.uk", "hotmail.fr", "yahoo.fr", "tutanota.com", "tuta.io", "duck.com", "privaterelay.appleid.com", "mail.ru", "inbox.com", "naver.com", "rediffmail.com",
    "shaw.ca", "rogers.com", "sympatico.ca", "bigpond.com", "optusnet.com.au", "xtra.co.nz", "seznam.cz", "wp.pl", "o2.pl", "interia.pl",
  ],
);
/** Calendar rooms, groups and Google's own addresses. */
const NOT_PEOPLE = /(^|\.)(resource\.calendar\.google\.com|group\.calendar\.google\.com|calendar\.google\.com|google\.com\.calendar|calendar-notification\.google\.com|reply\.github\.com|noreply\.github\.com)$/i;

export const isFreeMail = (domain: string) => FREE_MAIL.has(domain.toLowerCase());

/** The domain of an email address, lowercase, or null when it isn't one. */
export function domainOf(email: string | null | undefined): string | null {
  const m = /^[^\s@<>()",;]+@([a-z0-9-]+(\.[a-z0-9-]+)+)$/i.exec(String(email ?? "").trim());
  return m ? m[1].toLowerCase() : null;
}

/** A person's work domain worth matching: not free mail, not a calendar resource, not the member's own. */
export function workDomain(email: string | null | undefined, own: Set<string>): string | null {
  const d = domainOf(email);
  if (!d || isFreeMail(d) || NOT_PEOPLE.test(d)) return null;
  for (const o of own) if (d === o || d.endsWith(`.${o}`)) return null;
  return d;
}

/** Automated senders: noreply and its cousins. */
export const AUTOMATED_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|noreply[-+.\w]*|mailer-daemon|postmaster|bounces?[-+.\w]*|notifications?|notify|alerts?|news(letter)?s?|marketing|mailer|updates?|digest|automated|auto-?confirm|calendar-notification|invitations?|drive-shares?-dm-noreply)$/i;
/** Bulk mail and marketing platforms: a From on one of them is never a person. */
const BULK_DOMAIN = /(^|\.)(mailchimp(app)?\.com|mcsv\.net|mcdlv\.net|sendgrid\.(net|com)|amazonses\.com|mailgun\.(org|net)|sparkpostmail\.com|mandrillapp\.com|constantcontact\.com|hubspotemail\.net|hs-?email\.(net|com)|klaviyo(mail)?\.com|mktomail\.com|marketo\.(com|org)|pardot\.com|exacttarget\.com|salesforce-?mail\.com|sendinblue\.com|brevo\.com|customer\.io|intercom-mail\.com|substack\.com|beehiiv\.com|convertkit\.com|e\.linkedin\.com|linkedin\.com|facebookmail\.com|twitter\.com|x\.com|medium\.com|quora\.com|calendly\.com|zoom\.us|docusign\.net|notion\.so|slack\.com|github\.com|atlassian\.net|google\.com|googlegroups\.com|apple\.com|amazon\.com|paypal\.com|stripe\.com|intuit\.com|eventbrite\.com|meetup\.com)$/i;
export const isBulkDomain = (domain: string) => BULK_DOMAIN.test(domain);

/* ---------- reading the state (lib/table.ts hooks, lib/radar) ---------- */

/** Every company id in any of this member's sources. */
export function networkIds(n: MemberNetwork | undefined): Set<string> {
  const out = new Set<string>();
  if (!n) return out;
  for (const src of [n.cal, n.con, n.gm, n.claude]) for (const id in src?.companies ?? {}) out.add(id);
  return out;
}

/**
 * [google network] The companies a member knows someone at, so they are named for them free
 * ("you already know them"), like a company they own. Only while RN_GOOGLE=1. Seat holders and
 * people there still cost their usual unlocks.
 */
export function networkKnown(s: { network?: NetworkState }, memberId: string): Set<string> {
  if (!networkOn()) return new Set();
  return networkIds(s.network?.[memberId]);
}

/** Merge what each source says about one company (people by email, or by name when Claude gave no email). */
export function mergeCompany(n: MemberNetwork, id: string): NetCompany | null {
  const parts = [n.cal, n.con, n.gm, n.claude].map((x) => x?.companies[id]).filter((x): x is NetCompany => !!x);
  if (!parts.length) return null;
  const people = new Map<string, NetPerson>();
  const byName = new Map<string, string>();
  const nameKey = (name: string | undefined) => (name ? name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim() : "");
  const min = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b);
  const max = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);
  for (const part of parts)
    for (const p of part.people) {
      let key = p.key;
      if (key.startsWith("n:") && byName.has(key.slice(2))) key = byName.get(key.slice(2))!;
      const was = people.get(key);
      if (!was) {
        people.set(key, { ...p, src: [...p.src] });
      } else {
        was.email ??= p.email;
        // Contacts' name and title first (the member's own words), then the others.
        if (p.src.includes("contacts")) {
          if (p.name) was.name = p.name;
          if (p.title) was.title = p.title;
          if (p.org) was.org = p.org;
        } else {
          was.name ??= p.name;
          was.title ??= p.title;
          was.org ??= p.org;
        }
        was.meetings = (was.meetings ?? 0) + (p.meetings ?? 0) || undefined;
        was.upcoming = (was.upcoming ?? 0) + (p.upcoming ?? 0) || undefined;
        // Gmail and Claude read the same inbox: the larger count, not both.
        was.emails = Math.max(was.emails ?? 0, p.emails ?? 0) || undefined;
        was.sent = Math.max(was.sent ?? 0, p.sent ?? 0) || undefined;
        was.received = Math.max(was.received ?? 0, p.received ?? 0) || undefined;
        was.both = was.both || p.both || undefined;
        was.saved = was.saved || p.saved || undefined;
        was.rel ??= p.rel;
        was.first = min(was.first, p.first);
        was.last = max(was.last, p.last);
        was.next = min(was.next, p.next);
        for (const s of p.src) if (!was.src.includes(s)) was.src.push(s);
      }
      const nk = nameKey(p.name);
      if (nk && !key.startsWith("n:")) byName.set(nk, key);
    }
  const sum = (k: "meetings" | "upcoming" | "contacts") => parts.reduce((a, x) => a + (x[k] ?? 0), 0);
  const months = [...new Set(parts.flatMap((x) => x.months ?? []))].sort();
  return {
    domain: parts.find((x) => x.domain)?.domain,
    people: [...people.values()],
    more: Math.max(...parts.map((x) => x.more ?? 0)) || undefined,
    meetings: sum("meetings") || undefined,
    upcoming: sum("upcoming") || undefined,
    emails: Math.max(...parts.map((x) => x.emails ?? 0)) || undefined,
    contacts: sum("contacts") || undefined,
    invitedBy: parts.reduce((a, x) => a + (x.invitedBy ?? 0), 0) || undefined,
    side: Math.max(0, ...parts.map((x) => x.side ?? 0)) || undefined,
    first: parts.reduce<string | undefined>((a, x) => min(a, x.first), undefined),
    last: parts.reduce<string | undefined>((a, x) => max(a, x.last), undefined),
    next: parts.reduce<string | undefined>((a, x) => min(a, x.next), undefined),
    ...(months.length ? { months } : {}),
  };
}

/** A company's warmth score for ordering: its warmest person, or the company's own counts when they say more. */
export function companyScore(c: NetCompany, nowMs = Date.now()): number {
  const both = c.people.some((p) => p.both);
  const own = warmthScore({ ...c, contacts: 0, both }, nowMs);
  return Math.max(own, ...c.people.map((p) => warmthScore({ ...p, saved: false }, nowMs)));
}

/** A company's touch: its own meetings (each counted once), its months, and its people's mail. */
export const companyTouch = (c: NetCompany): Touch => ({
  meetings: c.meetings,
  upcoming: c.upcoming,
  emails: c.emails,
  both: c.people.some((p) => p.both),
  first: c.first,
  last: c.last,
  next: c.next,
  months: c.months?.length,
});
/** A company's grade: the warmer of its own counts and its warmest person. */
export function companyWarmth(c: NetCompany, nowMs = Date.now()): Warmth {
  let best = warmthFor(companyTouch(c), nowMs);
  for (const p of c.people) {
    const w = warmthFor(p, nowMs);
    if (WARMTH_RANK[w] < WARMTH_RANK[best]) best = w;
  }
  return best;
}

/** Set aside for this member: what they said ("Not a relationship"), else what Merlin set aside at the last read and they didn't undo. */
export function setAside(n: MemberNetwork, id: string): boolean {
  if (n.notRel?.[id]) return true;
  return !!n.auto?.[id] && !(n.isRel ?? []).includes(id);
}

/**
 * [google network] Crystal Ball's warmth multiplier for one company (lib/radar/match.ts
 * warmthMultiplier reads this): 1 when the member knows nobody there.
 */
export function networkWarmth(s: { network?: NetworkState }, memberId: string, nowMs = Date.now()): (companyId: string) => Warmth | null {
  const n = networkOn() ? s.network?.[memberId] : undefined;
  if (!n) return () => null;
  const ids = networkIds(n);
  const memo = new Map<string, Warmth | null>();
  return (id) => {
    if (!ids.has(id)) return null;
    let w = memo.get(id);
    if (w === undefined) {
      // Someone selling to them, a recruiter or an investor isn't a way in: Crystal Ball ranks by real relationships only.
      const c = setAside(n, id) ? null : mergeCompany(n, id);
      w = c ? companyWarmth(c, nowMs) : null;
      memo.set(id, w);
    }
    return w;
  };
}

/* ---------- what the app gets (GET /api/integrations/google) ---------- */

export interface LinkView {
  email: string;
  status: "ok" | "reconnect";
  /** Needs reconnecting: when Google access was found removed (ISO), and the day Merlin deletes what it read from it (YYYY-MM-DD). */
  goneAt: string | null;
  deleteOn: string | null;
  syncedAt: string | null;
  connectedAt: string;
  calendar: boolean;
  contacts: boolean;
  error: string | null;
}

export interface NetPersonView {
  name: string | null;
  title: string | null;
  email: string | null;
  warmth: Warmth;
  last: string | null;
  next: string | null;
  meetings: number;
  emails: number;
  both: boolean;
  /** Title reads like a decision maker. */
  dm: boolean;
  rel: string | null;
  src: NetSource[];
  /** The person's key (their email, or a name key): what "Not a relationship" on a person remembers. */
  key: string;
  /** The warmth in words: "4 meetings, last in March". */
  why: string;
  /** What their title says they are, when it says (lib/google/judge.ts personKind). */
  kind: PersonKind | null;
  /** The organisation on their saved contact. */
  org: string | null;
  /** The member said this person is not a relationship. */
  hidden: boolean;
  /**
   * They hold (or held) a seat at this company: the member's own contact matches a seat holder the
   * member can see by name (first and last name, with a fractional title or one in the seat's
   * function) or a member by email (lib/google seatMatches). The seat's public id, its function,
   * and whether it is still going. Only this member sees it. Left out otherwise.
   */
  seat?: { id: string; fn: string | null; now: boolean };
}

/** What a person's title (or their firm) says they are: another fractional, an investor, a recruiter, someone selling. */
export type PersonKind = "fractional" | "investor" | "recruiter" | "seller";

/** Crystal Ball's likelihood for this company hiring the member's function, scored live (lib/google/odds.ts). */
export interface HireOdds {
  band: "High" | "Medium" | "Low";
  score: number;
  /** Why, in Crystal Ball's own words: "Fractional CRO hired 2 months ago · RevOps usually follows in 1–4 months". */
  why: string;
  /** What happened, as a Crystal Ball row says it (a note can say "I saw ..."): the kind and the line. */
  saw: { kind: "role" | "seat" | "adjacent"; line: string } | null;
}

/** A client the calendar shows: regular meetings over months, still going (or the member's own seat there). */
export interface ClientView {
  /** First and last month with a meeting (YYYY-MM), meetings in all, months from first to last. */
  from: string;
  to: string;
  meetings: number;
  months: number;
  /** Met in the last CLIENT_RECENT_DAYS or a meeting is coming up. */
  active: boolean;
  /** The member's own seat there is on Merlin (public id), or null: not confirmed yet. */
  seat: string | null;
}

/** Why a company is set aside, and who said so: Merlin (with Undo) or the member. */
export interface SetView {
  kind: SetKind | NotRelWhy;
  why: string;
  by: "merlin" | "you";
}

/** Someone who can introduce the member to other companies: another fractional, or an investor. */
export interface IntroView {
  key: string;
  name: string;
  title: string | null;
  /** Where they are: the company on Merlin, their contact's organisation, or their email's domain. */
  org: string | null;
  kind: "fractional" | "investor";
  warmth: Warmth;
  why: string;
  email: string | null;
  /** The company on Merlin they are at (public id), when they are at one. */
  companyId: string | null;
  /** What they can open, said honestly: what Merlin knows, and what it doesn't. */
  opens: string;
  src: NetSource[];
}

/** Someone at no company on Merlin (LoosePerson), as the member's own list shows them. */
export interface LooseView {
  key: string;
  name: string | null;
  title: string | null;
  org: string | null;
  domain: string | null;
  email: string | null;
  warmth: Warmth;
  why: string;
  kind: PersonKind | null;
  hidden: boolean;
  src: NetSource[];
}

export interface NetCompanyView {
  /** The company's public id, as the table has it. */
  id: string;
  name: string;
  site: string | null;
  warmth: Warmth;
  score: number;
  last: string | null;
  next: string | null;
  meetings: number;
  upcoming: number;
  emails: number;
  contacts: number;
  src: NetSource[];
  people: NetPersonView[];
  more: number;
  /** Met over SEAT_MONTHS+ months: maybe a seat they held (Your seats confirms it; nothing is added). */
  seat: { from: string; to: string } | null;
  /** Free facts, for the filters and the fit line. */
  industry: string | null;
  employees: string | null;
  /** The company's warmth in words: "4 meetings, last in March". */
  touch: string;
  /** Set aside (a vendor, a recruiter, an investor, or what the member said), or null: a relationship. */
  set: SetView | null;
  /** In the member's Ideal Fractional Profile (true or false), or null without a profile. */
  fit: boolean | null;
  /** How likely it is to hire the member's function, or null without a function. */
  odds: HireOdds | null;
  /** In the member's Crystal Ball (any day it keeps). */
  ball: boolean;
  /** A client now, by the calendar (or the member's own seat there). */
  client: ClientView | null;
}

/** What the read is doing right now (kept in memory while it runs, never stored). */
export type SyncStage = "calendar" | "contacts" | "gmail" | "matching";

/**
 * "We think you held this seat": a company the member met with over months (NetCompanyView.seat),
 * where they hold no seat on Merlin yet and haven't said "Not a seat". Only they see it. It holds
 * no meeting title, guest list or date beyond the months and the count Your network already shows.
 */
export interface SeatGuessView {
  /** The company's public id, name and site, as the member's table has them. */
  id: string;
  name: string;
  site: string | null;
  /** First and last month with a meeting (YYYY-MM), the past meetings in all, and the months from first to last. */
  from: string;
  to: string;
  meetings: number;
  months: number;
  /** False: fewer than SEAT_SURE_MONTHS or SEAT_SURE_MEETINGS, so the card says "Less sure". */
  sure: boolean;
  /** Up to two people there the member met most: names and titles their own network already shows. */
  with: { name: string; title: string | null }[];
  /** What Confirm fills in: the function and title from the member's profile (the title is a guess they can change). */
  function: string | null;
  role: string | null;
  /** Met this month or last, or a meeting is coming up: the seat goes in as Active with no end month. */
  active: boolean;
  /**
   * A new seat here would wait to be confirmed (the company's first seat still waits, lib/table.ts
   * pendingSeats): what Confirm adds earns "when confirmed", not now.
   */
  waits: boolean;
}

/**
 * What Confirm sends as the seat's facts (the existing Add's engagementFields, with the member as
 * the seat holder): their name, the function, the title, the first month and, for a seat that
 * ended, the last month (an ongoing one goes in as Active). `role`: the member's own change to the title.
 */
export function seatConfirmFields(g: SeatGuessView, holder: string, role: string | null = g.role): Record<string, string> {
  const title = (role ?? "").trim();
  return {
    operator: holder,
    ...(g.function ? { function: g.function } : {}),
    ...(title ? { role: title } : {}),
    start: g.from,
    ...(g.active ? { status: "Active" } : { end: g.to }),
  };
}

export interface NetworkView {
  on: true;
  /** GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. */
  configured: boolean;
  google: LinkView | null;
  gmail: LinkView | null;
  /** The member may add Gmail directly (RN_GOOGLE_GMAIL=1 and on RN_GOOGLE_GMAIL_TESTERS). */
  gmailOffered: boolean;
  /** Dropping Gmail also revokes it at Google (it has its own client). */
  gmailOwnClient: boolean;
  claude: { at: string; companies: number } | null;
  claudeLeft: number;
  syncing: boolean;
  /** While it reads: which part it is on. Null when idle. */
  stage: SyncStage | null;
  /**
   * The first read of this connection: how long it took (measured, null until it finishes or when
   * it was never timed) and whether the member has seen its result. Null without Google connected.
   */
  first: { ms: number | null; seen: boolean } | null;
  companies: NetCompanyView[];
  /** Seats the member might have held, most meetings first. Nothing is added until they confirm one. */
  seats: SeatGuessView[];
  /** People who matched no company on Merlin, people the member really meets or talks with. Counts only. */
  stats: { unmatched: number; real: number };
  /** The member's function, for the words ("likely to hire a fractional RevOps leader"). */
  fn: string | null;
  /** Warm paths, best first: company ids of `companies` (warmPaths). The page lists exactly these, and every count of them is this length. */
  warm: string[];
  /** People who can introduce the member, warmest first. */
  intros: IntroView[];
  /** People at no company on Merlin, warmest first. */
  loose: LooseView[];
}
export type NetworkAnswer = NetworkView | { on: false };

/* ---------- the connect moment ---------- */

/** "58 seconds", "about 2 minutes": the measured time of the first read, in words. */
export function tookWords(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 90) return `${sec} ${sec === 1 ? "second" : "seconds"}`;
  return `about ${Math.round(sec / 60)} minutes`;
}
