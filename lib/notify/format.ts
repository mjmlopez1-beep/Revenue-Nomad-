/**
 * The words of each alert, and the three bodies they go out in: Slack Block Kit (incoming
 * webhooks), flat fields (Slack Workflow Builder) and plain JSON (Zapier, Make and the rest).
 * Pure functions, no Node imports.
 *
 * Every alert is a short headline, one to three lines and one link to the exact place in
 * Merlin (the role, the conversation, the seat). Never an email address, and never the
 * name of a member who only unlocked something: their function and title only.
 */
import { webLink } from "../links";
import { hiresLine } from "../hired";
import type { AlertItem, AlertKind, DestKind, HireNews } from "./types";
import { radarAlert } from "../radar/format";
import type { RadarItem } from "../radar/types";

export interface Alert {
  kind: AlertKind | "test";
  count: number;
  headline: string;
  lines: string[];
  /** Absolute link into Merlin, or "" when the app's address isn't known. */
  url: string;
  /** The button's words in Slack (default "Open in Merlin"). The radar's free view says "See who". */
  button?: string;
  /** The small line under a Slack post (default: where to change alerts). */
  footer?: string;
}

const flat = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
/** Email addresses never leave in an alert, even inside a message someone typed. */
const noEmails = (v: string) => v.replace(/[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/gi, "(email hidden)");
const cut = (v: string, n: number) => ([...v].length > n ? `${[...v].slice(0, n).join("").trimEnd()}…` : v);
/** The first 140 characters of a message, on one line, without email addresses. */
export const snippetOf = (text: string) => cut(noEmails(flat(text)), 140);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const an = (word: string) => (/^[aeiou]/i.test(word) && !/^(one|uni|use)/i.test(word) ? "an" : "a");

/**
 * "a fractional CMO", from the other member's title, else their function, else "another
 * fractional". Only the part of a title before " at ", a comma or a dash, so a company name
 * in a title doesn't come along.
 */
export function actorWords(actor: { function: string | null; title: string | null }): string {
  const title = flat(actor.title).split(/\s+at\s+|,|\s[-|–—]\s|\(|\//i)[0].trim().slice(0, 40);
  if (title) {
    const t = /^fractional\b/i.test(title) ? `fractional${title.slice(10)}` : title;
    return `${an(t)} ${t}`;
  }
  if (actor.function && actor.function !== "Other") return `a fractional ${actor.function} leader`;
  return "another fractional";
}
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const listWords = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/* ---------- the invite loop: the words the app, the email and the alerts share ---------- */

/** "Sam joined Merlin from your invite": the alert's headline and the email's subject. */
export const joinedHeadline = (first: string) => `${cut(flat(first), 40) || "A fractional"} joined Merlin from your invite`;

/**
 * The inviter's line when fractionals joined from their invite, in the app and in an alert. `both`:
 * they both get `bonus` credits when that one adds a first fact (else no bonus is promised).
 * "Sam joined Merlin from your invite. You both get 10 credits when Sam adds a first fact."
 */
export function joinedLine(joined: { first: string; both: boolean }[], bonus: number): string {
  const firsts = joined.map((j) => cut(flat(j.first), 40) || "A fractional");
  if (!firsts.length) return "";
  if (firsts.length === 1) return `${joinedHeadline(firsts[0])}.${joined[0].both ? ` You both get ${bonus} credits when ${firsts[0]} adds a first fact.` : ""}`;
  const names = firsts.length > 3 ? `${firsts.slice(0, 3).join(", ")} and ${plural(firsts.length - 3, "other")}` : listWords(firsts);
  return `${names} joined Merlin from your invite.${joined.every((j) => j.both) ? ` Each time one of them adds a first fact, you both get ${bonus} credits.` : ""}`;
}

/**
 * The invitee's line on onboarding's first step: "Ivy invited you. You both get 10 credits when you
 * add your first fact." `both` false (the inviter is past REFERRAL_LIMIT): only the invitee's bonus.
 */
export function invitedLine(first: string, both: boolean, bonus: number): string {
  return invitedParts(first, both, bonus).join(" ");
}
/** invitedLine in its two sentences, so the page can set the first one in bold. */
export function invitedParts(first: string, both: boolean, bonus: number): [string, string] {
  return [`${cut(flat(first), 40) || "A member"} invited you.`, `${both ? "You both get" : "You get"} ${bonus} credits when you add your first fact.`];
}

/** Links into the app. `base` is the app's address with no trailing slash. */
export const links = {
  home: (base: string) => (base ? `${base}/` : ""),
  thread: (base: string, id: string) => (base ? `${base}/?p=messages&m=${encodeURIComponent(id)}` : ""),
  messages: (base: string) => (base ? `${base}/?p=messages` : ""),
  company: (base: string, id: string) => (base ? `${base}/?c=${encodeURIComponent(id)}` : ""),
  seats: (base: string) => (base ? `${base}/?p=seats` : ""),
  hiring: (base: string) => (base ? `${base}/?v=hiring` : ""),
  integrations: (base: string) => (base ? `${base}/?p=integrations` : ""),
};

function seatLine(x: Extract<AlertItem, { kind: "seat" }>): string {
  const who = actorWords(x.actor);
  if (x.what === "message") return `${x.actor.first || cap(who)}${x.actor.first ? `, ${who},` : ""} wrote to you about your seat at ${x.company}`;
  if (x.what === "holder") return `${cap(who)} unlocked your seat at ${x.company}`;
  const facts = x.facts?.length ? (x.facts.length <= 2 ? listWords(x.facts) : plural(x.facts.length, "fact")) : "a fact";
  return `${cap(who)} unlocked ${facts} on your seat at ${x.company}`;
}

/** One alert from the events of one kind that came together in one window (oldest first). */
export function alertFor(items: AlertItem[], base: string): Alert | null {
  if (!items.length) return null;
  const kind = items[0].kind;
  if (kind === "radar") return radarAlert(items as RadarItem[], base);
  if (kind === "message") {
    const all = items as Extract<AlertItem, { kind: "message" }>[];
    // Fractionals who joined from the member's invite: one line between them, never a conversation link.
    const joins = all.filter((m) => m.about === "joined");
    const joinedNow = joinedLine(joins.map((j) => ({ first: j.from, both: !!j.bonus })), joins.find((j) => j.bonus)?.bonus ?? 0);
    const ms = all.filter((m) => m.about !== "joined");
    if (!ms.length) {
      const j = joins[0];
      if (joins.length === 1) return { kind, count: 1, headline: joinedHeadline(j.from), lines: j.bonus ? [`You both get ${j.bonus} credits when ${j.from} adds a first fact.`] : [], url: links.home(base) };
      return { kind, count: joins.length, headline: `${plural(joins.length, "fractional")} joined Merlin from your invite`, lines: [joinedNow], url: links.home(base) };
    }
    if (ms.length === 1 && !joins.length) {
      const m = ms[0];
      if (m.about === "invite")
        return { kind, count: 1, headline: `${m.from} claimed their seat at ${m.company} through your invite`, lines: ["You're connected as referral partners. Your note is the first message, so say hello."], url: links.thread(base, m.conversationId) };
      const about = m.about === "partners" ? "connecting as referral partners" : m.holder ? `your seat at ${m.company}` : `the seat at ${m.company}`;
      return { kind, count: 1, headline: `${m.from} sent you a message about ${about}`, lines: [`“${m.snippet}”`], url: links.thread(base, m.conversationId) };
    }
    // With fractionals who joined, their line takes the last place.
    const room = joins.length ? 2 : 3;
    const latest = ms.slice(-room).reverse();
    const lines = latest.map((m) =>
      m.about === "invite" ? `${m.from} claimed their seat at ${m.company} through your invite.` : `${m.from}${m.about === "partners" ? "" : `, about ${m.company}`}. “${cut(m.snippet, 80)}”`,
    );
    if (ms.length > room) lines[room - 1] = `${lines[room - 1]} And ${plural(ms.length - room + 1, "more message")}.`;
    if (joins.length) lines.push(joinedNow);
    const convs = new Set(ms.map((m) => m.conversationId));
    return { kind, count: all.length, headline: `${plural(ms.length, "new message")} on Merlin`, lines, url: convs.size === 1 ? links.thread(base, ms[0].conversationId) : links.messages(base) };
  }
  if (kind === "seat") {
    const ss = items as Extract<AlertItem, { kind: "seat" }>[];
    if (ss.length === 1) {
      const s = ss[0];
      const lines =
        s.what === "message"
          ? ["Reply in Merlin. It could be a chance to partner."]
          : [`They may want to talk, or partner.${s.actor.function && s.actor.function !== "Other" ? ` They work in ${s.actor.function}.` : ""}`];
      return { kind, count: 1, headline: seatLine(s), lines, url: s.conversationId ? links.thread(base, s.conversationId) : links.company(base, s.companyId) };
    }
    const lines = ss.slice(-3).reverse().map(seatLine);
    if (ss.length > 3) lines[2] = `${lines[2]}. And ${plural(ss.length - 3, "more")}.`;
    const companies = new Set(ss.map((s) => s.companyId));
    return {
      kind,
      count: ss.length,
      headline: `Fractionals engaged your seats ${ss.length} times. They may want to talk, or partner.`,
      lines,
      url: companies.size === 1 ? links.company(base, ss[0].companyId) : links.seats(base),
    };
  }
  // roles: one item per scan. Two scans in one window add up.
  const rs = items as Extract<AlertItem, { kind: "roles" }>[];
  const total = rs.reduce((n, r) => n + r.total, 0);
  const mine = rs.reduce((n, r) => n + r.mine, 0);
  const fn = rs.find((r) => r.function)?.function ?? null;
  const roles = rs.flatMap((r) => r.roles);
  const alerts = new Map<string, number>();
  for (const r of rs) for (const a of r.alerts) alerts.set(a.name, (alerts.get(a.name) ?? 0) + a.n);
  // Saved views that follow hires, one entry each: two scans in one window add up (they never count one hire twice).
  const hireViews = new Map<string, HireNews>();
  for (const r of rs)
    for (const h of r.hires ?? []) {
      const cur = hireViews.get(h.name);
      hireViews.set(h.name, cur ? { ...cur, n: cur.n + h.n, rows: [...cur.rows, ...h.rows] } : { ...h, rows: [...h.rows] });
    }
  const hires = [...hireViews.values()];
  const viewUrl = (h: HireNews) => (base && h.place ? `${base}/?${h.place}` : links.hiring(base));
  if (!total && hires.length) {
    // No new roles for the member, only new hires: the first view's line is the headline, its companies the lines.
    const h = hires[0];
    const one = hires.length === 1;
    const lines = one ? h.rows.slice(0, 3).map((r) => r.label) : hires.slice(0, 3).map((x) => `${hiresLine(x.n, x.functions, x.inProfile)}, for “${cut(x.name, 50)}”`);
    if (one && h.n > lines.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}. And ${plural(h.n - lines.length, "more")}.`;
    return {
      kind: "roles",
      count: hires.reduce((n, x) => n + x.n, 0),
      headline: one ? hiresLine(h.n, h.functions, h.inProfile) : `New hires for ${hires.length} of your saved views this week`,
      lines,
      url: viewUrl(h),
    };
  }
  const headline =
    fn && mine === total ? `${plural(total, `new open ${fn} role`)} in the latest scan` : `${plural(total, "new open role")} for you in the latest scan`;
  const lines = roles.slice(0, 3).map((r) => r.label);
  if (total > lines.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}. And ${plural(total - lines.length, "more")}.`;
  const saved = [
    ...hires.map((h) => `${hiresLine(h.n, h.functions, h.inProfile)}, for your saved view “${cut(h.name, 50)}”`),
    ...[...alerts].map(([name, n]) => `${n} ${n === 1 ? "matches" : "match"} your saved view “${cut(name, 60)}”`),
  ].slice(0, 2);
  // At most 3 lines in all: the saved views take the last places.
  const out = [...lines.slice(0, Math.max(1, 3 - saved.length)), ...saved].slice(0, 3);
  return {
    kind: "roles",
    count: total + hires.reduce((n, h) => n + h.n, 0),
    headline,
    lines: out,
    url: roles.length === 1 && total === 1 && !hires.length ? links.company(base, roles[0].companyId) : links.hiring(base),
  };
}

/** The message "Send a test" posts. */
export function testAlert(base: string): Alert {
  return {
    kind: "test",
    count: 1,
    headline: "Merlin alerts are connected",
    lines: ["You'll get a post here for new open roles in your function, new messages and when someone engages your seat."],
    url: links.integrations(base),
  };
}

/* ---------- bodies ---------- */

/** Slack mrkdwn: &, < and > escaped, so nobody can @channel or hide a link in a message. */
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const httpUrl = (u: string) => (/^https?:\/\/[^\s<>|]+$/i.test(u) ? u : /[|]/.test(u) ? "" : webLink(u) ?? "");

/** Block Kit for an incoming webhook: the headline in bold, the lines, and an "Open in Merlin" button. */
export function slackBody(a: Alert) {
  const url = httpUrl(a.url);
  const text = [`*${esc(a.headline)}*`, ...a.lines.map(esc)].join("\n");
  return {
    text: `${a.headline}${a.lines.length ? `${/[.!?]$/.test(a.headline) ? "" : "."} ${a.lines[0]}` : ""}`.slice(0, 300),
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: text.slice(0, 2900) } },
      ...(url ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: a.button || "Open in Merlin" }, url, style: "primary", action_id: "open" }] }] : []),
      { type: "context", elements: [{ type: "mrkdwn", text: esc(a.footer || "Merlin alerts. Change them in Integrations.") }] },
    ],
  };
}

/** Flat text fields for a Slack Workflow Builder trigger (it reads each key as a text variable). */
export function workflowBody(a: Alert) {
  return { event: a.kind, title: a.headline, text: a.lines.join("\n"), url: httpUrl(a.url), count: String(a.count) };
}

/** The JSON a generic webhook gets. Documented on the Integrations page. */
export function webhookBody(a: Alert, sentAt: string) {
  return { source: "Merlin", event: a.kind, count: a.count, title: a.headline, lines: a.lines, url: httpUrl(a.url), sentAt };
}

export function bodyFor(kind: DestKind, a: Alert, sentAt: string): unknown {
  return kind === "slack" ? slackBody(a) : kind === "workflow" ? workflowBody(a) : webhookBody(a, sentAt);
}
