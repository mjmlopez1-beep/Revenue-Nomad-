/**
 * The words of each alert, and the three bodies they go out in: Slack Block Kit (incoming
 * webhooks), flat fields (Slack Workflow Builder) and plain JSON (Zapier, Make and the rest).
 * Pure functions, no Node imports.
 *
 * Every alert is a short headline, one to three lines and one link to the exact place in
 * Trading Post (the role, the conversation, the seat). Never an email address, and never the
 * name of a member who only unlocked something: their function and title only.
 */
import type { AlertItem, AlertKind, DestKind } from "./types";

export interface Alert {
  kind: AlertKind | "test";
  count: number;
  headline: string;
  lines: string[];
  /** Absolute link into Trading Post, or "" when the app's address isn't known. */
  url: string;
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

/** Links into the app. `base` is the app's address with no trailing slash. */
export const links = {
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
  if (kind === "message") {
    const ms = items as Extract<AlertItem, { kind: "message" }>[];
    if (ms.length === 1) {
      const m = ms[0];
      const about = m.holder ? `your seat at ${m.company}` : `the seat at ${m.company}`;
      return { kind, count: 1, headline: `${m.from} sent you a message about ${about}`, lines: [`“${m.snippet}”`], url: links.thread(base, m.conversationId) };
    }
    const latest = ms.slice(-3).reverse();
    const lines = latest.map((m) => `${m.from}, about ${m.company}. “${cut(m.snippet, 80)}”`);
    if (ms.length > 3) lines[2] = `${lines[2]} And ${plural(ms.length - 2, "more message")}.`;
    const convs = new Set(ms.map((m) => m.conversationId));
    return { kind, count: ms.length, headline: `${plural(ms.length, "new message")} on Trading Post`, lines, url: convs.size === 1 ? links.thread(base, ms[0].conversationId) : links.messages(base) };
  }
  if (kind === "seat") {
    const ss = items as Extract<AlertItem, { kind: "seat" }>[];
    if (ss.length === 1) {
      const s = ss[0];
      const lines =
        s.what === "message"
          ? ["Reply in Trading Post. It could be a chance to partner."]
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
  const headline =
    fn && mine === total ? `${plural(total, `new open ${fn} role`)} in the latest scan` : `${plural(total, "new open role")} for you in the latest scan`;
  const lines = roles.slice(0, 3).map((r) => r.label);
  if (total > lines.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}. And ${plural(total - lines.length, "more")}.`;
  const saved = [...alerts].slice(0, 2).map(([name, n]) => `${n} ${n === 1 ? "matches" : "match"} your saved view “${cut(name, 60)}”`);
  // At most 3 lines in all: the saved views take the last places.
  const out = [...lines.slice(0, Math.max(1, 3 - saved.length)), ...saved].slice(0, 3);
  return { kind: "roles", count: total, headline, lines: out, url: roles.length === 1 && total === 1 ? links.company(base, roles[0].companyId) : links.hiring(base) };
}

/** The message "Send a test" posts. */
export function testAlert(base: string): Alert {
  return {
    kind: "test",
    count: 1,
    headline: "Trading Post alerts are connected",
    lines: ["You'll get a post here for new open roles in your function, new messages and when someone engages your seat."],
    url: links.integrations(base),
  };
}

/* ---------- bodies ---------- */

/** Slack mrkdwn: &, < and > escaped, so nobody can @channel or hide a link in a message. */
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const httpUrl = (u: string) => (/^https?:\/\/[^\s<>|]+$/i.test(u) ? u : "");

/** Block Kit for an incoming webhook: the headline in bold, the lines, and an "Open in Trading Post" button. */
export function slackBody(a: Alert) {
  const url = httpUrl(a.url);
  const text = [`*${esc(a.headline)}*`, ...a.lines.map(esc)].join("\n");
  return {
    text: `${a.headline}${a.lines.length ? `${/[.!?]$/.test(a.headline) ? "" : "."} ${a.lines[0]}` : ""}`.slice(0, 300),
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: text.slice(0, 2900) } },
      ...(url ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Trading Post" }, url, style: "primary", action_id: "open" }] }] : []),
      { type: "context", elements: [{ type: "mrkdwn", text: "Trading Post alerts. Change them in Integrations." }] },
    ],
  };
}

/** Flat text fields for a Slack Workflow Builder trigger (it reads each key as a text variable). */
export function workflowBody(a: Alert) {
  return { event: a.kind, title: a.headline, text: a.lines.join("\n"), url: httpUrl(a.url), count: String(a.count) };
}

/** The JSON a generic webhook gets. Documented on the Integrations page. */
export function webhookBody(a: Alert, sentAt: string) {
  return { source: "Trading Post", event: a.kind, count: a.count, title: a.headline, lines: a.lines, url: httpUrl(a.url), sentAt };
}

export function bodyFor(kind: DestKind, a: Alert, sentAt: string): unknown {
  return kind === "slack" ? slackBody(a) : kind === "workflow" ? workflowBody(a) : webhookBody(a, sentAt);
}
