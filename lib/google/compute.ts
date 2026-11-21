/**
 * From what Google hands back to per-company conclusions. Pure: no I/O, so the tests run it on
 * fixtures. Nothing here keeps an event's title or description (the fetch never asks for them), a
 * message's subject, snippet or body (Gmail is read with headers only), or an attendee list: each
 * event and message is folded into per-person and per-company counts and dates, then dropped.
 *
 * Matching (matchDomain, matchOrg): an email domain matches a company on Merlin whose website host
 * is that domain (siteKey), or a parent of it ("eu.acme.com" -> "acme.com"). An organisation name
 * from Contacts matches only when it is exact (companyKey), names one company, and isn't generic.
 */
import { siteKey } from "../tableFields";
import { companyKey, isPlaceholderCompany } from "../scan/clean";
import {
  AUTOMATED_LOCAL, LOOSE_MAX, PEOPLE_MAX, domainOf, isBulkDomain, isDecisionMaker, isFreeMail, warmthScore, workDomain,
  type LoosePerson, type NetCompany, type NetPerson, type NetSource, type SourceData,
} from "./types";
import { personKind } from "./judge";

/* ---------- the companies to match against ---------- */

export interface Directory {
  /** Website host (siteKey) -> company id. */
  bySite: Map<string, string>;
  /** companyKey(name) -> company id, or null when two companies share it. */
  byName: Map<string, string | null>;
}

export function makeDirectory(companies: Iterable<{ id: string; website: string | null; name: string }>): Directory {
  const bySite = new Map<string, string>();
  const byName = new Map<string, string | null>();
  for (const c of companies) {
    const site = siteKey(c.website);
    if (site && !site.includes("/") && !bySite.has(site)) bySite.set(site, c.id);
    const k = companyKey(c.name);
    if (k) byName.set(k, byName.has(k) && byName.get(k) !== c.id ? null : c.id);
  }
  return { bySite, byName };
}

export function matchDomain(dir: Directory, domain: string | null): string | null {
  if (!domain) return null;
  const labels = domain.toLowerCase().split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const hit = dir.bySite.get(labels.slice(i).join("."));
    if (hit) return hit;
  }
  return null;
}

/** Words that are never one company on their own. */
const GENERIC_ORG = new Set(
  [
    "self", "selfemployed", "freelance", "freelancer", "independent", "consultant", "consulting", "contractor", "advisor", "advisory", "personal", "home", "family",
    "friends", "school", "university", "college", "student", "retired", "none", "na", "n/a", "unemployed", "stealth", "startup", "company", "business", "work",
    "office", "group", "partners", "ventures", "capital", "holdings", "solutions", "services", "agency", "studio", "labs", "global", "international", "investor",
  ].map((w) => companyKey(w)),
);
export function matchOrg(dir: Directory, org: string | null | undefined): string | null {
  const name = String(org ?? "").trim();
  if (!name || name.length > 80 || isPlaceholderCompany(name)) return null;
  const k = companyKey(name);
  if (!k || k.length < 4 || GENERIC_ORG.has(k)) return null;
  return dir.byName.get(k) ?? null;
}

/* ---------- people ---------- */

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const cleanText = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || undefined;
/** A display name worth showing: not an email address, not a role mailbox. */
const personName = (v: unknown) => {
  const n = cleanText(v, 80);
  return n && !n.includes("@") && /\p{L}/u.test(n) ? n.replace(/^["']+|["']+$/g, "") : undefined;
};

interface Acc {
  person: NetPerson;
  company: string | null;
  domain: string | null;
}

/**
 * Someone at no company on Merlin is kept (for the member alone) when they are a real relationship
 * (2+ meetings, replies both ways, a saved contact) or their title says they can introduce the
 * member (another fractional, an investor). Never a colleague at the member's own domain.
 */
function looseOf(p: NetPerson, own: Set<string>): LoosePerson | null {
  const d = domainOf(p.email);
  const domain = workDomain(p.email, own);
  if (d && !domain && !isFreeMail(d)) return null;
  const k = personKind(p, domain);
  if (!((p.meetings ?? 0) >= 2 || p.both || p.saved || k === "fractional" || k === "investor")) return null;
  if (!p.name && !p.email) return null;
  return { ...p, ...(domain ? { domain } : {}) };
}

/** People grouped into companies: the warmest PEOPLE_MAX kept per company, the rest counted; people at no company on Merlin counted, and the ones looseOf keeps listed. */
function finish(accs: Map<string, Acc>, companies: Map<string, NetCompany>, nowMs: number, at: string, real: number, own: Set<string> = new Set()): SourceData {
  let unmatched = 0;
  const per = new Map<string, NetPerson[]>();
  const loose: LoosePerson[] = [];
  for (const a of accs.values()) {
    if (!a.company) {
      unmatched++;
      const l = looseOf(a.person, own);
      if (l) loose.push(l);
      continue;
    }
    const l = per.get(a.company) ?? [];
    l.push(a.person);
    per.set(a.company, l);
    const c = companies.get(a.company) ?? { people: [] };
    if (a.domain && !c.domain) c.domain = a.domain;
    companies.set(a.company, c);
  }
  const out: Record<string, NetCompany> = {};
  for (const [id, c] of companies) {
    const people = (per.get(id) ?? []).sort((x, y) => warmthScore(y, nowMs) - warmthScore(x, nowMs) || (y.last ?? "").localeCompare(x.last ?? ""));
    if (!people.length) continue;
    c.people = people.slice(0, PEOPLE_MAX);
    if (people.length > PEOPLE_MAX) c.more = people.length - PEOPLE_MAX;
    if (c.months) c.months = [...new Set(c.months)].sort().slice(-30);
    out[id] = c;
  }
  loose.sort((x, y) => warmthScore(y, nowMs) - warmthScore(x, nowMs) || (y.last ?? "").localeCompare(x.last ?? ""));
  return { at, companies: out, unmatched, real, ...(loose.length ? { loose: loose.slice(0, LOOSE_MAX) } : {}) };
}

/* ---------- Calendar ---------- */

export interface CalEvent {
  status?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean; resource?: boolean; responseStatus?: string; organizer?: boolean }[];
}
/** A meeting with more people than this is a webinar or an all-hands, not a relationship. */
export const MAX_ATTENDEES = 25;

/**
 * Per external attendee and per company: past meetings, upcoming ones (the next 30 days), first,
 * last and next meeting, the months with meetings. An event counts once per company however many
 * people from there came. Cancelled events, ones the member declined, rooms, and big ones don't count.
 */
export function calendarSource(events: CalEvent[], dir: Directory, own: Set<string>, nowMs: number): SourceData {
  const accs = new Map<string, Acc>();
  const companies = new Map<string, NetCompany>();
  for (const ev of events) {
    if (ev.status === "cancelled" || (ev.eventType && ev.eventType !== "default" && ev.eventType !== "fromGmail")) continue;
    const at = Date.parse(ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T12:00:00Z` : ""));
    if (!Number.isFinite(at)) continue;
    const list = ev.attendees ?? [];
    if (list.length < 2 || list.length > MAX_ATTENDEES) continue;
    if (list.some((a) => a.self && a.responseStatus === "declined")) continue;
    const past = at <= nowMs;
    const d = day(at);
    const seenCo = new Set<string>();
    // Per company at this meeting: how many of their people came, and whether one of them sent the invite (counts only).
    const sideOf = new Map<string, number>();
    const invitedBy = new Set<string>();
    for (const a of list) {
      if (a.self || a.resource) continue;
      const email = String(a.email ?? "").trim().toLowerCase();
      const domain = workDomain(email, own);
      if (!domainOf(email)) continue;
      if (a.responseStatus === "declined") continue;
      let acc = accs.get(email);
      if (!acc) {
        const company = matchDomain(dir, domain);
        acc = { person: { key: email, email, src: ["calendar"] }, company, domain: company ? domain : null };
        accs.set(email, acc);
      }
      const p = acc.person;
      p.name ??= personName(a.displayName);
      if (past) {
        p.meetings = (p.meetings ?? 0) + 1;
        if (!p.first || d < p.first) p.first = d;
        if (!p.last || d > p.last) p.last = d;
      } else {
        p.upcoming = (p.upcoming ?? 0) + 1;
        if (!p.next || d < p.next) p.next = d;
      }
      if (acc.company) {
        sideOf.set(acc.company, (sideOf.get(acc.company) ?? 0) + 1);
        if (a.organizer && past) invitedBy.add(acc.company);
      }
      if (acc.company && !seenCo.has(acc.company)) {
        seenCo.add(acc.company);
        const c = companies.get(acc.company) ?? { people: [] };
        if (past) {
          c.meetings = (c.meetings ?? 0) + 1;
          if (!c.first || d < c.first) c.first = d;
          if (!c.last || d > c.last) c.last = d;
          (c.months ??= []).push(d.slice(0, 7));
        } else {
          c.upcoming = (c.upcoming ?? 0) + 1;
          if (!c.next || d < c.next) c.next = d;
        }
        companies.set(acc.company, c);
      }
    }
    for (const [id, n] of sideOf) {
      const c = companies.get(id);
      if (!c) continue;
      if (n > (c.side ?? 0)) c.side = n;
      if (invitedBy.has(id)) c.invitedBy = (c.invitedBy ?? 0) + 1;
    }
  }
  let real = 0;
  for (const a of accs.values()) if ((a.person.meetings ?? 0) >= 2 && (workDomain(a.person.email, own) || a.company)) real++;
  return finish(accs, companies, nowMs, new Date(nowMs).toISOString(), real, own);
}

/* ---------- Contacts ---------- */

export interface GContact {
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
  organizations?: { name?: string; title?: string }[];
}

/**
 * Saved contacts (people/me/connections) and other contacts (otherContacts, Gmail's
 * auto-saved ones, names and emails only). Each email matches by domain; a saved contact's
 * organisation matches by exact name when no email did.
 */
export function contactsSource(saved: GContact[], other: GContact[], dir: Directory, own: Set<string>, nowMs: number): SourceData {
  const accs = new Map<string, Acc>();
  const companies = new Map<string, NetCompany>();
  const add = (c: GContact, isSaved: boolean) => {
    const name = personName(c.names?.[0]?.displayName);
    const org = c.organizations?.[0];
    const title = cleanText(org?.title, 80);
    const orgName = isSaved ? cleanText(org?.name, 80) : undefined;
    const emails = (c.emailAddresses ?? []).map((e) => String(e.value ?? "").trim().toLowerCase()).filter((e) => !!domainOf(e));
    let company: string | null = null;
    let domain: string | null = null;
    let email: string | undefined;
    for (const e of emails) {
      const d = workDomain(e, own);
      const hit = matchDomain(dir, d);
      if (hit) {
        company = hit;
        domain = d;
        email = e;
        break;
      }
    }
    if (!company && isSaved) company = matchOrg(dir, org?.name);
    email ??= emails.find((e) => workDomain(e, own)) ?? emails[0];
    const key = email ?? (name ? `n:${name.toLowerCase()}` : "");
    if (!key) return;
    const was = accs.get(key);
    if (was) {
      if (isSaved) {
        was.person.saved = true;
        was.person.name = name ?? was.person.name;
        was.person.title = title ?? was.person.title;
        was.person.org = orgName ?? was.person.org;
      }
      if (!was.company && company) Object.assign(was, { company, domain });
      return;
    }
    accs.set(key, { person: { key, ...(email ? { email } : {}), ...(name ? { name } : {}), ...(title ? { title } : {}), ...(orgName ? { org: orgName } : {}), ...(isSaved ? { saved: true } : {}), src: ["contacts"] }, company, domain });
  };
  for (const c of saved) add(c, true);
  for (const c of other) add(c, false);
  for (const a of accs.values()) {
    if (!a.company) continue;
    const c = companies.get(a.company) ?? { people: [] };
    c.contacts = (c.contacts ?? 0) + 1;
    companies.set(a.company, c);
  }
  return finish(accs, companies, nowMs, new Date(nowMs).toISOString(), 0, own);
}

/* ---------- Gmail headers ---------- */

export interface GmailMeta {
  internalDate?: string;
  labelIds?: string[];
  headers: Record<string, string>;
}
const BULK_LABELS = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS", "SPAM", "TRASH"]);
/** A message out to more people than this is a mailing, not a conversation. */
export const MAX_RECIPIENTS = 12;

/** "Ana Ruiz" <ana@acme.com>, bo@acme.com -> [{ name, email }] */
export function addresses(header: string | undefined): { name?: string; email: string }[] {
  const out: { name?: string; email: string }[] = [];
  if (!header) return out;
  const re = /(?:"?([^"<>,]*?)"?\s*)?<([^<>\s,]+@[^<>\s,]+)>|([^\s<>,;"]+@[^\s<>,;"]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) && out.length < 100) {
    const email = (m[2] ?? m[3] ?? "").trim().toLowerCase();
    if (!domainOf(email)) continue;
    const name = personName(m[1]);
    out.push(name ? { name, email } : { email });
  }
  return out;
}

/** Bulk and automated mail: list headers, auto-replies, Gmail's tabs, noreply senders, marketing platforms. */
export function isBulk(m: GmailMeta): boolean {
  const h = m.headers;
  if (h["list-unsubscribe"] || h["list-id"]) return true;
  if (/^(bulk|list|junk|auto_reply)$/i.test((h.precedence ?? "").trim())) return true;
  const auto = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (auto && auto !== "no") return true;
  if ((m.labelIds ?? []).some((l) => BULK_LABELS.has(l))) return true;
  const from = addresses(h.from)[0];
  if (!from) return true;
  const [local, domain] = from.email.split("@");
  return AUTOMATED_LOCAL.test(local) || isBulkDomain(domain);
}

/**
 * Per correspondent and per company: messages each way, both ways or not, first and last. A
 * message from the member counts once for each person it went to; one to them counts for the
 * sender. Only the From, To, Cc and Date headers (and the bulk markers) are read.
 */
export function gmailSource(msgs: GmailMeta[], self: Set<string>, dir: Directory, own: Set<string>, nowMs: number): SourceData {
  const accs = new Map<string, Acc>();
  const companies = new Map<string, NetCompany>();
  const touch = (email: string, name: string | undefined, out: boolean, d: string, seen: Set<string>, atIso: string) => {
    if (self.has(email)) return;
    const domain = workDomain(email, own);
    if (!domain) return;
    let acc = accs.get(email);
    if (!acc) {
      const company = matchDomain(dir, domain);
      acc = { person: { key: email, email, src: ["gmail"] }, company, domain: company ? domain : null };
      accs.set(email, acc);
    }
    const p = acc.person;
    p.name ??= name;
    if (out) p.sent = (p.sent ?? 0) + 1;
    else p.received = (p.received ?? 0) + 1;
    p.emails = (p.sent ?? 0) + (p.received ?? 0);
    p.both = (p.sent ?? 0) > 0 && (p.received ?? 0) > 0 ? true : undefined;
    if (!p.first || d < p.first) p.first = d;
    if (!p.last || d > p.last) p.last = d;
    if (acc.company && !seen.has(acc.company)) {
      seen.add(acc.company);
      const c = companies.get(acc.company) ?? { people: [] };
      c.emails = (c.emails ?? 0) + 1;
      if (!c.first || d < c.first) c.first = d;
      if (!c.last || d > c.last) c.last = d;
      // Your pipeline (lib/pipeline.ts): when the latest email went out to them and came in from them, and the first one out. The Date header's time only.
      if (out) {
        if (!c.outAt || atIso > c.outAt) c.outAt = atIso;
        if (!c.outFirstAt || atIso < c.outFirstAt) c.outFirstAt = atIso;
      } else if (!c.inAt || atIso > c.inAt) c.inAt = atIso;
      companies.set(acc.company, c);
    }
  };
  for (const m of msgs) {
    const at = Number(m.internalDate) || Date.parse(m.headers.date ?? "");
    if (!Number.isFinite(at) || at > nowMs + 86_400_000) continue;
    if (isBulk(m)) continue;
    const d = day(at);
    const atIso = new Date(at).toISOString();
    const from = addresses(m.headers.from)[0];
    const seen = new Set<string>();
    if (self.has(from.email)) {
      const to = [...addresses(m.headers.to), ...addresses(m.headers.cc)];
      if (to.length > MAX_RECIPIENTS) continue;
      for (const r of to) touch(r.email, r.name, true, d, seen, atIso);
    } else {
      touch(from.email, from.name, false, d, seen, atIso);
    }
  }
  let real = 0;
  for (const a of accs.values()) if (a.person.both) real++;
  return finish(accs, companies, nowMs, new Date(nowMs).toISOString(), real, own);
}

/* ---------- what a member's Claude saves ---------- */

export const RELATIONSHIPS = ["client", "former client", "referral partner", "prospect", "peer", "other"] as const;
/** The only fields an entry may have. Anything else (a subject, a body, a snippet) refuses the call. */
export const CLAUDE_FIELDS = ["company", "person_name", "person_title", "emails", "last_contact", "first_contact", "both_ways", "relationship"] as const;

export interface ClaudeEntry {
  company: string;
  person_name?: string;
  person_title?: string;
  emails?: number;
  last_contact?: string;
  first_contact?: string;
  both_ways?: boolean;
  relationship?: string;
}

const DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
export function cleanDate(v: unknown, nowMs: number): string | undefined {
  const m = DATE_RE.exec(String(v ?? "").trim());
  if (!m) return undefined;
  const d = `${m[1]}-${m[2]}-${m[3] ?? "15"}`;
  const ms = Date.parse(`${d}T12:00:00Z`);
  if (!Number.isFinite(ms) || ms > nowMs + 86_400_000 || ms < nowMs - 30 * 365 * 86_400_000) return undefined;
  return d;
}

/** Words a line of mail carries and a name, a title or a domain doesn't. */
const MAIL_WORDS = /\b(wrote|subject|unsubscribe)\b/i;
/**
 * A reply or forward prefix at the start of a word: "Re: next steps", "RE:pricing", "Fwd: intro",
 * "FW: deck", "Fw :". (The colon can't end a `\b...\b` group before a space, which is how "Re: "
 * used to get through.) Inside a word it is not one: "Infrastructure: Cloud", "Core: Platform".
 */
const MAIL_PREFIX = /(^|[^a-z0-9])(re|fwd?|fw)\s?:/i;
/** A value that reads like email text rather than a name, a title or a domain. */
export const looksLikeText = (v: string, max: number) => v.length > max || /[\r\n]/.test(v) || MAIL_WORDS.test(v) || MAIL_PREFIX.test(v);

export { isDecisionMaker };
export type { NetSource };
