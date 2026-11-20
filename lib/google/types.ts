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
 *  - counts only for everything that matched no company (never the domains or the people);
 *  - the Google refresh tokens, sealed (lib/google/crypto.ts), never sent to a browser or logged.
 * Never an event title, description or attendee list, never a subject, snippet or body. Calendar
 * events are fetched without them (the fields parameter leaves them out), Gmail with headers only.
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
}

export interface SourceData {
  at: string;
  /** Internal company id -> what this source says. */
  companies: Record<string, NetCompany>;
  /** People who matched no company on Merlin (a count only). */
  unmatched: number;
  /** People the member really meets or talks with (2+ meetings, or replies both ways), matched or not. A count only. */
  real: number;
}

export interface GoogleLink {
  /** The refresh token, sealed (lib/google/crypto.ts). */
  token: string;
  /** The Google account's own email, shown to the member only. */
  email: string;
  scopes: string[];
  connectedAt: string;
  /** "reconnect": Google said the token is gone (invalid_grant). The data already derived stays. */
  status?: "ok" | "reconnect";
  /** When it last went through (ISO). */
  syncedAt?: string;
  /** Short reason the last sync failed ("unreachable", "http_500"), never a token. */
  error?: string;
  /** Gmail only: it came from its own OAuth client (GOOGLE_GMAIL_CLIENT_ID), so dropping it revokes at Google too. */
  ownClient?: boolean;
}

export interface MemberNetwork {
  google?: GoogleLink;
  gmail?: GoogleLink;
  cal?: SourceData;
  con?: SourceData;
  gm?: SourceData;
  /** What the member saved through their own Claude (save_my_network). */
  claude?: SourceData & { saves: string[]; named: { id: string; at: string }[] };
}

/** State.network: member id -> their network. Nobody else's view ever reads another member's entry. */
export type NetworkState = Record<string, MemberNetwork>;

/* ---------- limits ---------- */

export const PEOPLE_MAX = 8;
/** save_my_network: calls a member can make in any rolling 24 hours, and entries per call. */
export const CLAUDE_SAVES_DAILY = 5;
export const CLAUDE_ENTRIES_MAX = 200;
/** Companies a member's Claude saves can name for them free in any rolling 24 hours (Calendar and Contacts aren't capped). */
export const CLAUDE_NEW_DAILY = 25;
/** "A seat you might have held": meetings with a company in this many months, this many meetings in all. */
export const SEAT_MONTHS = 3;
export const SEAT_MEETINGS = 6;

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

export const WARMTH_RANK: Record<Warmth, number> = { Hot: 0, Warm: 1, Fading: 2, Cold: 3 };

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
        } else {
          was.name ??= p.name;
          was.title ??= p.title;
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
    first: parts.reduce<string | undefined>((a, x) => min(a, x.first), undefined),
    last: parts.reduce<string | undefined>((a, x) => max(a, x.last), undefined),
    next: parts.reduce<string | undefined>((a, x) => min(a, x.next), undefined),
    ...(months.length ? { months } : {}),
  };
}

/** A company's warmth for this member: its warmest person, or the company's own counts when they say more. */
export function companyScore(c: NetCompany, nowMs = Date.now()): number {
  const both = c.people.some((p) => p.both);
  const own = warmthScore({ ...c, both }, nowMs);
  return Math.max(own, ...c.people.map((p) => warmthScore(p, nowMs)));
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
      const c = mergeCompany(n, id);
      w = c ? warmthOf(companyScore(c, nowMs)) : null;
      memo.set(id, w);
    }
    return w;
  };
}

/* ---------- what the app gets (GET /api/integrations/google) ---------- */

export interface LinkView {
  email: string;
  status: "ok" | "reconnect";
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
  companies: NetCompanyView[];
  /** People who matched no company on Merlin, people the member really meets or talks with. Counts only. */
  stats: { unmatched: number; real: number };
}
export type NetworkAnswer = NetworkView | { on: false };
