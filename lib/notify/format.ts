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
import { hiresLine, startWords } from "../hired";
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
  /** The button's words in Slack (default "Open in Merlin"). The radar's says "See the 2 companies". */
  button?: string;
  /** The small line under a Slack post (default: where to change alerts). */
  footer?: string;
  /**
   * Slack only: the post one item a block (a company, a role, a message), each with its name in
   * bold, its facts as labeled fields and its own button. Without it, Slack shows `lines`. The
   * workflow and webhook bodies always carry `lines`, never these.
   */
  entries?: AlertEntry[];
  /** Slack only, with `entries`: small lines after them ("And 3 more signals."). */
  after?: string[];
}

/**
 * One item of a Slack post. Every word in it is shown escaped; links and the image only when they
 * are http(s) (the image https). A company locked for the member has no `link` and no `image`, and
 * a button that opens a list, never its record.
 */
export interface AlertEntry {
  /** In bold: a name the member can see, or free-facts words ("A SaaS company"). */
  title: string;
  /** The title's link (the record in Merlin), only for something the member can see. */
  link?: string;
  /** One line under the title. */
  text?: string;
  /** Words someone wrote, set as a quote under the text. */
  quote?: string;
  /** Labeled facts, shown two to a row. Empty values are left out. */
  fields?: { label: string; value: string | null | undefined }[];
  /** A small grey line under it. */
  note?: string;
  /** A picture on the right (a company's logo): https only. */
  image?: { url: string; alt: string };
  button?: { text: string; url: string };
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

/** A seat event in two parts, who and what they did: ["A fractional VP Sales", "unlocked your seat at Acme"]. */
function seatParts(x: Extract<AlertItem, { kind: "seat" }>): [string, string] {
  const who = actorWords(x.actor);
  if (x.what === "message") return [`${x.actor.first || cap(who)}${x.actor.first ? `, ${who},` : ""}`, `wrote to you about your seat at ${x.company}`];
  if (x.what === "holder") return [cap(who), `unlocked your seat at ${x.company}`];
  const facts = x.facts?.length ? (x.facts.length <= 2 ? listWords(x.facts) : plural(x.facts.length, "fact")) : "a fact";
  return [cap(who), `unlocked ${facts} on your seat at ${x.company}`];
}
const seatLine = (x: Extract<AlertItem, { kind: "seat" }>) => seatParts(x).join(" ");

/** "A SaaS company", "An E-commerce company", or "A locked company": a company the member can't see, by its industry. */
const lockedWords = (industry: string | null | undefined) => (industry ? `${cap(an(industry))} ${industry} company` : "A locked company");

type RoleRow = Extract<AlertItem, { kind: "roles" }>["roles"][number];
/** A new open role as a Slack entry: the company in bold (by its free facts when locked), the role, its facts. */
function roleEntry(r: RoleRow, base: string): AlertEntry {
  const a = r.about;
  if (!a) return { title: r.label };
  const record = a.name ? links.company(base, r.companyId) : "";
  return {
    title: a.name ?? lockedWords(a.industry),
    ...(record ? { link: record } : {}),
    text: `${a.function ? `Fractional ${a.function}` : "Fractional"} role`,
    fields: [
      { label: "Industry", value: a.industry },
      { label: "Size", value: a.employees ? `${a.employees} employees` : null },
      { label: "Revenue", value: a.revenue },
      { label: "Where", value: a.place },
    ],
    ...(a.name ? {} : { note: "Locked for you: unlock it in Merlin to see the company and the posting." }),
    button: record ? { text: "Open", url: record } : { text: "Open in Merlin", url: links.hiring(base) },
  };
}

type HireRowItem = HireNews["rows"][number];
/** A company that newly matches a saved view that follows hires, as a Slack entry. */
function hireEntry(r: HireRowItem, base: string, list: string): AlertEntry {
  if (r.company === undefined) return { title: r.label };
  const record = r.company ? links.company(base, r.companyId) : "";
  return {
    title: r.company ?? "A locked company",
    ...(record ? { link: record } : {}),
    text: r.function ? `Hired a fractional ${r.function} leader` : "Hired a fractional leader",
    fields: [{ label: "Started", value: startWords(r.start) || null }],
    button: record ? { text: "Open", url: record } : { text: "Open in Merlin", url: list },
  };
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
    // Slack: one entry a message, newest first (up to 5), its sender in bold, what it is about, the words quoted, and Reply.
    const shown = ms.slice(-5).reverse();
    const entries: AlertEntry[] = shown.map((m) =>
      m.about === "invite"
        ? { title: m.from, text: `Claimed their seat at ${m.company} through your invite`, button: { text: "Reply", url: links.thread(base, m.conversationId) } }
        : {
            title: m.from,
            text: m.about === "partners" ? "About connecting as referral partners" : `About ${m.holder ? "your seat" : "the seat"} at ${m.company}`,
            ...(m.snippet ? { quote: `“${m.snippet}”` } : {}),
            button: { text: "Reply", url: links.thread(base, m.conversationId) },
          },
    );
    const after = [...(ms.length > shown.length ? [`And ${plural(ms.length - shown.length, "more message")}.`] : []), ...(joins.length ? [joinedNow] : [])];
    return {
      kind,
      count: all.length,
      headline: `${plural(ms.length, "new message")} on Merlin`,
      lines,
      url: convs.size === 1 ? links.thread(base, ms[0].conversationId) : links.messages(base),
      entries,
      ...(after.length ? { after } : {}),
    };
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
    const shown = ss.slice(-5).reverse();
    const entries: AlertEntry[] = shown.map((s) => {
      const [who, what] = seatParts(s);
      return { title: who.replace(/,$/, ""), text: cap(what), button: { text: "Open", url: s.conversationId ? links.thread(base, s.conversationId) : links.company(base, s.companyId) } };
    });
    return {
      kind,
      count: ss.length,
      headline: `Fractionals engaged your seats ${ss.length} times. They may want to talk, or partner.`,
      lines,
      url: companies.size === 1 ? links.company(base, ss[0].companyId) : links.seats(base),
      entries,
      ...(ss.length > shown.length ? { after: [`And ${plural(ss.length - shown.length, "more")}.`] } : {}),
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
    // Slack: one view, a company an entry; several views, a view an entry.
    const entries: AlertEntry[] = one
      ? h.rows.slice(0, 3).map((r) => hireEntry(r, base, viewUrl(h)))
      : hires.slice(0, 5).map((x) => ({ title: `“${cut(x.name, 50)}”`, text: hiresLine(x.n, x.functions, x.inProfile), button: { text: "Open in Merlin", url: viewUrl(x) } }));
    const more = one ? h.n - entries.length : hires.length - entries.length;
    return {
      kind: "roles",
      count: hires.reduce((n, x) => n + x.n, 0),
      headline: one ? hiresLine(h.n, h.functions, h.inProfile) : `New hires for ${hires.length} of your saved views this week`,
      lines,
      url: viewUrl(h),
      ...(entries.length ? { entries } : {}),
      ...(entries.length && more > 0 ? { after: [`And ${plural(more, one ? "more" : "more saved view")}.`] } : {}),
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
  // Slack: a role an entry (the scan keeps 3), then how many more and the saved views, small.
  const entries = roles.slice(0, 3).map((r) => roleEntry(r, base));
  const after = [...(total > entries.length && entries.length ? [`And ${plural(total - entries.length, "more open role")}.`] : []), ...saved];
  return {
    kind: "roles",
    count: total + hires.reduce((n, h) => n + h.n, 0),
    headline,
    lines: out,
    url: roles.length === 1 && total === 1 && !hires.length ? links.company(base, roles[0].companyId) : links.hiring(base),
    ...(entries.length ? { entries } : {}),
    ...(entries.length && after.length ? { after } : {}),
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

/** Block Kit's limits for a message (api.slack.com/reference/block-kit), and what the post keeps under them. */
export const SLACK_LIMITS = { blocks: 50, fields: 10, field: 2000, section: 3000, header: 150, button: 75, context: 3000, alt: 2000, url: 3000 } as const;
/** The only blocks a post is made of. */
export const SLACK_BLOCKS = ["header", "section", "divider", "context", "actions"] as const;

/** Escaped text at most `n` long once escaped (an entity is never cut in half). */
function fit(v: string, n: number): string {
  const s = flat(v);
  let k = Math.min([...s].length, n);
  let out = esc(cut(s, k));
  while (out.length > n && k > 1) {
    k -= Math.max(1, out.length - n);
    out = esc(cut(s, k));
  }
  return out;
}
const plain = (v: string, n: number) => ({ type: "plain_text", text: fit(v, n) });
const mrkdwn = (text: string) => ({ type: "mrkdwn", text });
/** An image Slack fetches itself: https only, nothing that could break out of the URL. */
const imageUrl = (u: string | undefined) => (u && u.length <= SLACK_LIMITS.url && /^https:\/\/[^\s<>|"'`\\]+$/i.test(u) ? u : "");
const button = (text: string, url: string, id: string, primary = false) => ({
  type: "button",
  text: plain(text, SLACK_LIMITS.button),
  url,
  action_id: id,
  ...(primary ? { style: "primary" } : {}),
});

/** One entry's blocks: its section (name in bold, linked when it may be; the line; the quote; fields; the image), its note, its button. */
function entryBlocks(e: AlertEntry, i: number): Record<string, unknown>[] {
  const link = e.link ? httpUrl(e.link) : "";
  const title = fit(e.title, 200) || "Merlin";
  // A link that long would crowd the section's 3000 characters: the button still has it.
  const head = link && link.length <= 1500 ? `*<${link}|${title}>*` : `*${title}*`;
  const body = [head, e.text ? fit(e.text, 600) : "", e.quote ? `>${fit(e.quote, 600)}` : ""].filter(Boolean).join("\n");
  const fields = (e.fields ?? [])
    .filter((f) => flat(f.value))
    .slice(0, SLACK_LIMITS.fields)
    .map((f) => mrkdwn(`*${fit(f.label, 60)}*\n${fit(String(f.value), SLACK_LIMITS.field - 80)}`));
  const img = imageUrl(e.image?.url);
  const out: Record<string, unknown>[] = [
    {
      type: "section",
      text: mrkdwn(body.slice(0, SLACK_LIMITS.section)),
      ...(fields.length ? { fields } : {}),
      ...(img ? { accessory: { type: "image", image_url: img, alt_text: fit(e.image!.alt || e.title, SLACK_LIMITS.alt) || "Logo" } } : {}),
    },
  ];
  if (e.note) out.push({ type: "context", elements: [mrkdwn(fit(e.note, SLACK_LIMITS.context))] });
  const url = e.button ? httpUrl(e.button.url) : "";
  if (e.button && url && url.length <= SLACK_LIMITS.url) out.push({ type: "actions", elements: [button(e.button.text, url, `open-${i}`)] });
  return out;
}

/**
 * Block Kit for an incoming webhook. The headline as a header; then either one entry a block
 * (a divider, the name in bold with its line and labeled fields, a logo on the right when there is
 * one, a small note, its own button), or the lines; then the main button and a small footer. Every
 * word is escaped, so nobody can @channel or hide a link; links are http(s) only. Kept inside Block
 * Kit's limits (SLACK_LIMITS): entries that would pass 50 blocks are left out. `text` is the
 * fallback notifications and screen readers read.
 */
export function slackBody(a: Alert) {
  const url = httpUrl(a.url);
  const footer = { type: "context", elements: [mrkdwn(fit(a.footer || "Merlin alerts. Change them in Integrations.", SLACK_LIMITS.context))] };
  const main = url && url.length <= SLACK_LIMITS.url ? [{ type: "actions", elements: [button(a.button || "Open in Merlin", url, "open", true)] }] : [];
  const blocks: Record<string, unknown>[] = [{ type: "header", text: plain(a.headline, SLACK_LIMITS.header) }];
  const entries = a.entries ?? [];
  if (entries.length) {
    const after = (a.after ?? []).filter((x) => flat(x));
    const tail = 1 + (after.length ? 1 : 0) + main.length + 1;
    for (const [i, e] of entries.entries()) {
      const bs = [{ type: "divider" }, ...entryBlocks(e, i)];
      if (blocks.length + bs.length + tail > SLACK_LIMITS.blocks) break;
      blocks.push(...bs);
    }
    blocks.push({ type: "divider" });
    if (after.length) blocks.push({ type: "context", elements: [mrkdwn(after.map((x) => fit(x, 600)).join("\n").slice(0, SLACK_LIMITS.context))] });
  } else if (a.lines.length) {
    blocks.push({ type: "section", text: mrkdwn(a.lines.map((l) => fit(l, SLACK_LIMITS.section)).join("\n").slice(0, SLACK_LIMITS.section)) });
  }
  blocks.push(...main, footer);
  return {
    text: fit(`${a.headline}${a.lines.length ? `${/[.!?]$/.test(a.headline) ? "" : "."} ${a.lines[0]}` : ""}`, 300),
    unfurl_links: false,
    unfurl_media: false,
    blocks,
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
