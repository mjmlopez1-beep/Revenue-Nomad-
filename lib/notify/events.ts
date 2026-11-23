/**
 * What sets off an alert, worked out from the state after the change was written:
 *   afterScan    new open roles in the member's function, new matches for their saved views, and the
 *                week's new hires for their saved views that follow hires ("Recently hired")
 *   afterMessage a member wrote to them (and, when it starts a conversation about their seat
 *                with message alerts off, a seat alert instead)
 *   afterUnlock  another member unlocked who held their seat, or facts on it
 * Each one only reads; lib/notify/index.ts does the sending and the batching.
 *
 * Everything an alert says is what that member can see in Merlin: a hidden company stays
 * hidden, a locked role title stays locked (roles are described by their free facts), and the
 * member who unlocked something is described by function and title only.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { alertKindOpen, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { fieldDef } from "../tableFields";
import { alertMatches, alertOf, bellOn, countryKey, slackOn, watches, type AlertEvery, type AlertTrigger, type SavedSearch } from "../mcp/alerts";
import { followsHires, hiresLine, startWords } from "../hired";
import { listCompanies, newHires, seatAddedTimes, type HireRow } from "../hireAlerts";
import { baseOf, deliver, functionFor, postWatch, track } from "./index";
import { detectSignals, fundingCompanies } from "../radar/signals";
import { fundingSource } from "../radar/sources/funding";
import { personKey } from "../paths/match";
import { coKey, knownLine, knownMoves, type KnownPerson, type NewLeader } from "./known";
import { emptyWatch, fixedPref, logAlert, pushInbox, WATCH_KEYS, type FixedPref, type InboxEntry, type QueuedLine } from "../inbox";
import { renderAlertEmail } from "../digest";
import { emailEnabled, sendEmail } from "../email";
import { emailLinker } from "../emailIn";
import { alertOnPlan } from "../billing/rules";
import { BATCH_WINDOW_MS } from "./types";
import { alertFor, snippetOf } from "./format";
import type { AlertItem, HireNews } from "./types";

type G = ReturnType<typeof T.graph>;
type Idx = ReturnType<typeof T.memberIndex>;

/** Members with a working destination and this alert on. */
const listening = (s: State, kind: AlertItem["kind"]) =>
  Object.entries(s.integrations?.members ?? {})
    .filter(([, m]) => m.alerts?.[kind] !== false && [m.slack, m.webhook].some((d) => d && !d.broken))
    .map(([id]) => id);

/** The saved views whose news goes to this member's Slack: the ones their plan watches, each with its Slack switch on (lib/mcp/alerts.ts slackOn). */
const slackViews = (s: State, id: string) => T.alertViewsOf(s, id, s.connector?.alerts?.[id] ?? []).filter(slackOn);
/** The saved views whose new roles and hires go to this member's bell (lib/inbox.ts): each with its alert on, its bell on, watching roles or hires. */
const bellViews = (s: State, id: string) => T.alertViewsOf(s, id, s.connector?.alerts?.[id] ?? []).filter((v) => bellOn(v) && (watches(v, "role") || watches(v, "hire")));

/** The company's name as this member sees it. */
function companyFor(g: G, s: State, idx: Idx, tracks: ReturnType<typeof T.tracksOf>, m: Member, companyId: string, hiddenWords = "a locked company"): string {
  return T.identityHidden(g, s, idx, tracks, m, companyId) ? hiddenWords : g.companies.get(companyId)?.name || "a company";
}

/** The other member as an alert describes them: function and title, nothing else. */
function actorOf(s: State, m: Member | undefined): { function: string | null; title: string | null } {
  if (!m) return { function: null, title: null };
  return { function: functionFor(s, m), title: (s.profiles[m.id]?.title || m.title || "").trim() || null };
}

/* ---------- the weekly scan ---------- */

/** How a company that newly matches a saved view reads in a post: "Acme Robotics · Finance · Mar 2026". A locked company is never named. */
const hireLabel = (r: HireRow) => [r.company ?? "A locked company", r.function, startWords(r.start)].filter(Boolean).join(" · ");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One post per member per scan: the roles it opened that match their function or a saved view,
 * and the companies that newly match their saved views that follow hires (a matching seat added
 * since their last such post, a week at most). A scan with neither for a member sends them nothing.
 */
export const afterScan = (at: string) => track(scanAlerts(at));
async function scanAlerts(at: string): Promise<void> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const slackWho = new Set(listening(s, "roles"));
  // The bell (lib/inbox.ts): members with a list whose alert has its bell on, Slack connected or not.
  const bellWho = new Set(Object.keys(s.connector?.alerts ?? {}).filter((id) => bellViews(s, id).length > 0 && !s.closures?.[id]));
  const who = [...new Set([...slackWho, ...bellWho])];
  if (!who.length) return;
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const fresh = [...g.engagements.values()].filter((e) => {
    const t = tracks.get(e.id);
    return !!t && t.firstSeen === at && !t.closedAt && T.isOpenRole(e, s, tracks);
  });
  // Members with a saved view that follows hires: its new matches go in the same post, so a scan that opened nothing still can.
  const viewsOf = (id: string) => {
    const seen = new Set<string>();
    return [...(slackWho.has(id) ? slackViews(s, id) : []), ...(bellWho.has(id) ? bellViews(s, id) : [])].filter((v) => !seen.has(v.id) && !!seen.add(v.id));
  };
  const hireWho = new Set(who.filter((id) => viewsOf(id).some(followsHires)));
  if (!fresh.length && !hireWho.size) return;
  const added = hireWho.size ? seatAddedTimes(seed, s) : null;
  const atMs = Date.parse(at);
  /** Members told about new hires in this scan's post: the next scan counts from here. */
  const told: string[] = [];
  /** The bell's lines, written together after the loop. */
  const bellOut: { id: string; lines: Omit<InboxEntry, "read">[] }[] = [];
  const review = T.firmsInReview(seed, s);
  // Industry, employees and revenue are the standard values (the state takes them on load), and the
  // place is the company's country and region (lib/geo.ts), the same facts the weekly email matches on.
  const facts = fresh.map((e) => {
    const c = g.companies.get(e.companyId);
    const engs = [...g.engagements.values()].filter((x) => x.companyId === e.companyId);
    return {
      e,
      f: {
        function: T.fnOf(e, s),
        industry: T.live(c, s, "industry"),
        employees: T.live(c, s, "employees"),
        revenue: T.live(c, s, "revenue"),
        hq: T.live(c, s, "hq"),
        pastHires: T.friendliness(g, s, tracks, e.companyId, engs, new Set(), review.has(e.companyId)).fractional,
        ...T.geoOf(c, s),
      },
    };
  });
  for (const id of who) {
    const m = idx.byId.get(id);
    if (!m) continue;
    const fn = functionFor(s, m);
    const hiddenFor = (companyId: string) => T.identityHidden(g, s, idx, tracks, m, companyId);
    // The HQ a member matches on is the one they see: a hidden company's region.
    const seen = (x: (typeof facts)[number]) => (x.f.hq && hiddenFor(x.e.companyId) ? { ...x.f, hq: T.hqRegion(x.f.hq) } : x.f);
    const mine = fn && fn !== "Other" && slackWho.has(id) ? facts.filter((x) => x.f.function === fn) : [];
    const alerts = viewsOf(id).map((a) => ({ id: a.id, name: a.name, hits: facts.filter((x) => alertMatches(a, seen(x))) })).filter((a) => a.hits.length);
    const all = [...new Set([...mine, ...alerts.flatMap((a) => a.hits)])];
    let hires: (HireNews & { viewId?: string })[] = [];
    if (added && hireWho.has(id) && Number.isFinite(atMs)) {
      const prev = Date.parse(s.integrations?.members[id]?.hiresAt ?? "");
      const since = Math.max(Number.isFinite(prev) ? prev : 0, atMs - WEEK_MS);
      try {
        hires = (await newHires(m, viewsOf(id), since, atMs, added)).map((h) => ({
          viewId: h.viewId,
          name: h.name,
          n: h.n,
          functions: h.functions,
          inProfile: h.inProfile,
          place: h.place,
          rows: h.rows.slice(0, 3).map((r) => ({ companyId: r.companyId, label: hireLabel(r), company: r.company, function: r.function, start: r.start })),
        }));
      } catch (e) {
        console.error("new hires alert failed for one member", e);
      }
    }
    if (!all.length && !hires.length) continue;
    /** The role in free facts (a locked company by its industry, never its name): the label, and the same in parts for Slack. */
    const row = (x: (typeof facts)[number]) => {
      const f = seen(x);
      const hidden = hiddenFor(x.e.companyId);
      const name = hidden ? null : g.companies.get(x.e.companyId)?.name || "a company";
      const where = hidden ? (f.industry ? `at a ${f.industry} company` : "at a locked company") : `at ${name}`;
      const size = f.revenue ? `, ${f.revenue} revenue` : f.employees ? `, ${f.employees} employees` : "";
      // Where, from the country and region on file ("Texas, US"), else the HQ as the member sees it.
      const country = f.country ? (countryKey(f.country) === "united states" ? "US" : countryKey(f.country) === "united kingdom" ? "UK" : f.country) : null;
      const place = f.country ? [f.region, country].filter(Boolean).join(", ") : f.hq;
      return {
        companyId: T.pubId(x.e.companyId),
        label: `${f.function ? `Fractional ${f.function}` : "Fractional"} role ${where}${size}${place ? `, ${place}` : ""}`,
        about: { name, function: f.function ?? null, industry: f.industry ?? null, employees: f.employees ?? null, revenue: f.revenue ?? null, place: place || null },
      };
    };
    const item: AlertItem = {
      kind: "roles",
      at,
      function: mine.length ? fn : null,
      total: all.length,
      mine: mine.length,
      roles: all.slice(0, 3).map(row),
      alerts: alerts.map((a) => ({ name: a.name, n: a.hits.length })),
      ...(hires.length ? { hires } : {}),
    };
    if (hires.length) told.push(id);
    // The bell: one line for each list whose alert has its bell on, as that list's Slack line would say it (a locked company never named).
    if (bellWho.has(id)) {
      const bells = new Set(bellViews(s, id).map((v) => v.id));
      const lines: Omit<InboxEntry, "read">[] = [];
      for (const a of alerts) {
        if (!bells.has(a.id)) continue;
        const one = alertFor([{ ...item, function: null, total: a.hits.length, mine: 0, roles: a.hits.slice(0, 3).map(row), alerts: [{ name: a.name, n: a.hits.length }], hires: undefined }], "");
        if (one) lines.push({ id: `roles:${a.id}:${at}`, at, kind: "roles", line: one.headline, sub: `On your list ${a.name}`, href: a.hits.length === 1 ? `/?c=${encodeURIComponent(T.pubId(a.hits[0].e.companyId))}` : "/?v=hiring", alert: `list:${a.id}` });
      }
      for (const h of hires) {
        if (!h.viewId || !bells.has(h.viewId)) continue;
        lines.push({ id: `hire:${h.viewId}:${at}`, at, kind: "hire", line: `${hiresLine(h.n, h.functions, h.inProfile, true)}`, sub: `On your list ${h.name}`, href: h.rows.length === 1 ? `/?c=${encodeURIComponent(h.rows[0].companyId)}` : "/?t=companies", alert: `list:${h.viewId}` });
      }
      if (lines.length) bellOut.push({ id, lines });
    }
    // Slack: only for members with it connected, and only what goes to their Slack.
    if (!slackWho.has(id)) continue;
    const slackIds = new Set(slackViews(s, id).map((v) => v.id));
    const sAlerts = alerts.filter((a) => slackIds.has(a.id));
    const sHires = hires.filter((h) => !h.viewId || slackIds.has(h.viewId)).map(({ viewId: _v, ...h }) => h); // eslint-disable-line @typescript-eslint/no-unused-vars
    const sAll = [...new Set([...mine, ...sAlerts.flatMap((a) => a.hits)])];
    if (!sAll.length && !sHires.length) continue;
    void deliver(id, { ...item, total: sAll.length, roles: sAll.slice(0, 3).map(row), alerts: sAlerts.map((a) => ({ name: a.name, n: a.hits.length })), ...(sHires.length ? { hires: sHires } : { hires: undefined }) });
  }
  if (bellOut.length)
    await T.mutate((d) => {
      for (const b of bellOut) {
        pushInbox(d, b.id, b.lines);
        const counts = new Map<string, number>();
        for (const l of b.lines) counts.set(l.alert ?? "roles", (counts.get(l.alert ?? "roles") ?? 0) + 1);
        logAlert(d, b.id, [...counts].map(([alert, count]) => ({ at, alert, kind: "roles", channel: "bell" as const, count })));
      }
    });
  if (told.length)
    await T.mutate((d) => {
      for (const id of told) {
        const mi = d.integrations?.members[id];
        if (mi) mi.hiresAt = at;
      }
    });
}

/* ---------- messages ---------- */

/** A member wrote in a conversation: an alert to the other side. */
export const afterMessage = (conversationId: string) => track(messageAlert(conversationId));
async function messageAlert(conversationId: string): Promise<void> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const c = (s.conversations ?? []).find((x) => x.id === conversationId);
  const last = c?.messages[c.messages.length - 1];
  if (!c || !last || last.removed) return;
  const toId = last.by === c.a ? c.b : c.a;
  const conn = s.integrations?.members[toId];
  if (!conn) return;
  const idx = T.memberIndex(seed, s);
  const to = idx.byId.get(toId);
  const from = idx.byId.get(last.by);
  if (!to || !from) return;
  const g = T.graph(seed, s);
  const tracks = T.tracksOf(seed, s);
  // A conversation from Referral partners is about no seat.
  const partners = !c.about.engagementId;
  const company = partners ? "" : companyFor(g, s, idx, tracks, to, c.about.companyId);
  const holder = !partners && toId === c.b;
  const first = T.firstName(from.name);
  const messagesOn = conn.alerts?.message !== false;
  if (messagesOn) {
    void deliver(toId, { kind: "message", at: last.at, conversationId: c.id, from: first, company, holder, snippet: snippetOf(last.text), ...(partners ? { about: "partners" as const } : {}) });
    return;
  }
  if (partners) return;
  // Message alerts off: a first message to the seat holder about their seat still counts as someone engaging the seat.
  if (holder && c.messages.length === 1)
    void deliver(toId, { kind: "seat", at: last.at, companyId: T.pubId(c.about.companyId), company, what: "message", actor: { ...actorOf(s, from), first }, conversationId: c.id });
}

/**
 * A fractional the member invited to connect claimed their seat through the invite, which opened a
 * conversation (lib/table.ts connectInvite): the inviter's message alert says so (lib/messages.ts afterConnect).
 */
export const afterConnectAlert = (conversationId: string) => track(connectAlert(conversationId));
async function connectAlert(conversationId: string): Promise<void> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const c = (s.conversations ?? []).find((x) => x.id === conversationId);
  if (!c || c.kind !== "invite" || !s.integrations?.members[c.a]) return;
  const idx = T.memberIndex(seed, s);
  const to = idx.byId.get(c.a);
  const partner = idx.byId.get(c.b);
  if (!to || !partner) return;
  const company = companyFor(T.graph(seed, s), s, idx, T.tracksOf(seed, s), to, c.about.companyId);
  void deliver(to.id, { kind: "message", at: c.createdAt, conversationId: c.id, from: T.firstName(partner.name), company, holder: false, snippet: "", about: "invite" });
}

/* ---------- unlocks ---------- */

/** The cells an unlock opened, grouped by seat: an alert to each seat's holder (never to the member who unlocked). */
export const afterUnlock = (token: string | null, cells: { entity: string; id: string; field: string }[]) => track(unlockAlerts(token, cells));
async function unlockAlerts(token: string | null, cells: { entity: string; id: string; field: string }[]): Promise<void> {
  const [seed, s]: [Seed, State] = await Promise.all([loadSeed(), loadState()]);
  const actor = memberByToken(seed, token, s);
  if (!actor) return;
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const engByPub = new Map<string, string>();
  for (const id of g.engagements.keys()) engByPub.set(T.pubId(id), id);
  const personByPub = new Map<string, string>();
  for (const [id, p] of g.contacts) if (p.engagementId) personByPub.set(T.pubId(id), id);
  const bells: { id: string; line: Omit<InboxEntry, "read"> }[] = [];
  /** Seat id -> the facts opened on it. */
  const bySeat = new Map<string, Set<string>>();
  for (const cell of cells) {
    let engId: string | undefined;
    let words: string | undefined;
    if (cell.entity === "engagement") {
      engId = engByPub.get(cell.id);
      words = cell.field === "operator" ? "operator" : fieldDef("engagement", cell.field)?.say ?? `the ${cell.field}`;
    } else if (cell.entity === "person") {
      const pid = personByPub.get(cell.id);
      engId = pid ? g.contacts.get(pid)?.engagementId ?? undefined : undefined;
      words = fieldDef("person", cell.field)?.say ?? "a person's details";
    }
    if (!engId || !words) continue;
    const set = bySeat.get(engId) ?? new Set<string>();
    set.add(words);
    bySeat.set(engId, set);
  }
  for (const [engId, facts] of bySeat) {
    const e = g.engagements.get(engId);
    if (!e) continue;
    const holder = T.seatHolder(s, idx, e.id, T.valueOf(e, s, "operator"));
    if (!holder || holder.id === actor.id) continue;
    // Someone engages your seat is Pro's (Free: the bell stays quiet too), and it goes to the bell whether Slack is connected or not.
    if (!alertKindOpen(s, holder.id, "seat")) continue;
    const holderUnlocked = facts.has("operator");
    facts.delete("operator");
    const item: AlertItem = {
      kind: "seat",
      at: new Date().toISOString(),
      companyId: T.pubId(e.companyId),
      company: companyFor(g, s, idx, tracks, holder, e.companyId),
      what: holderUnlocked ? "holder" : "facts",
      actor: actorOf(s, actor),
      ...(holderUnlocked ? {} : { facts: [...facts] }),
    };
    const head = alertFor([item], "")?.headline;
    if (head) bells.push({ id: holder.id, line: { id: `engaged:${T.pubId(e.id)}:${item.at.slice(0, 16)}`, at: item.at, kind: "engaged", line: head, sub: "Your seat", href: "/?p=seats", alert: "seat" } });
    if (s.integrations?.members[holder.id] && s.integrations.members[holder.id].alerts?.seat !== false) void deliver(holder.id, item);
  }
  if (bells.length)
    await T.mutate((d) => {
      for (const b of bells) {
        pushInbox(d, b.id, [b.line]);
        logAlert(d, b.id, [{ at: b.line.at, alert: "seat", kind: "seat", channel: "bell", count: 1 }]);
      }
    });
}

/* ---------- the watch: a list alert's other triggers, Companies you follow, Someone you know changed jobs ---------- */

/**
 * Every 15 minutes at most (the scheduler's tick, lib/jobs.ts runDueJobs), the watch looks at what
 * came into Merlin since its last look and tells each member what their alerts watch:
 *   a list alert with   seat     a fractional leadership seat ended at a company on the list
 *                       leader   a new leader shows on a list company's own website
 *                       fact     a fact changed at a company on the list
 *                       funding  a company on the list raised money, as its SEC filing says (RN_FUNDING)
 *   Companies you follow         a fact, a seat or a leader changed at a company the member follows
 *   Someone you know changed jobs  a person in their own sources is a new leader at another company (lib/notify/known.ts)
 * The bell gets each line as it happens. Email and Slack follow the alert's How often: as it happens
 * (Pro: Slack in the 15-minute batch, email at most every 15 minutes), every morning (the first look
 * after MORNING_HOUR_UTC), or weekly (Monday's morning). On Free, as it happens comes each morning and
 * Slack waits for Pro (lib/billing/rules.ts alertOnPlan). Each line is told once (State.alertWatch keys).
 * A company the member hasn't opened is described by its free facts, never named.
 */
export const WATCH_EVERY_MS = BATCH_WINDOW_MS;
/** The morning's email goes at the first look after this hour (UTC): about 8 in the morning on the US east coast. */
export const MORNING_HOUR_UTC = 13;
const WATCH_TRIGGERS: AlertTrigger[] = ["seat", "leader", "fact", "funding"];
const DAY_MS = 86_400_000;
/** The first look, or one after a long pause, reads back at most this far. */
const WATCH_BACK_MS = 2 * DAY_MS;

/** One piece of news for one member, from one alert. */
interface WatchLine extends QueuedLine {
  bell: boolean;
  every: AlertEvery;
  trigger: AlertTrigger | "follows" | "known";
}

/** What a company the member hasn't opened reads as: "a locked SaaS company with 51-200 employees". */
function lockedWords(g: G, s: State, companyId: string): string {
  const c = g.companies.get(companyId);
  const ind = T.live(c, s, "industry");
  const emp = T.live(c, s, "employees");
  return `a locked ${ind ? `${ind} ` : ""}company${emp ? ` with ${emp} employees` : ""}`;
}
const capFirst = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const listWords2 = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The signature on a link that turns alerts off (the email's own links): one member, these alerts. */
export const alertOffSig = (memberId: string, keys: string) => createHmac("sha256", T.ID_KEY).update(`alert-off:${memberId}:${keys}`).digest("base64url").slice(0, 22);
export const alertOffUrl = (base: string, memberId: string, keys: string[]) => {
  const k = keys.join(",");
  return `${base}/api/table/unsubscribe?m=${encodeURIComponent(T.pubId(memberId))}&r=alert&a=${encodeURIComponent(k)}&s=${alertOffSig(memberId, k)}`;
};

/**
 * The email's "Turn this alert off" link: the alerts it names go off for the member it was signed for
 * (a list's alert, or Companies you follow, or Someone you know). Their names for the page, or null
 * when the link isn't valid.
 */
export async function alertOffByLink(m: unknown, keys: unknown, sig: unknown): Promise<string[] | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const member = T.memberIndex(seed, s).all.find((x) => T.pubId(x.id) === String(m ?? ""));
  const k = String(keys ?? "").slice(0, 400);
  if (!member || !k) return null;
  const want = Buffer.from(alertOffSig(member.id, k));
  const got = Buffer.from(String(sig ?? ""));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const wanted = k.split(",").filter(Boolean);
  return T.mutate((d) => {
    const names: string[] = [];
    for (const key of wanted) {
      if (key === "follows" || key === "known") {
        d.alertPrefs ??= {};
        const cur = fixedPref(d, member.id, key);
        d.alertPrefs[member.id] = { ...(d.alertPrefs[member.id] ?? {}), [key]: { ...cur, on: false } };
        names.push(key === "follows" ? "Companies you follow" : "Someone you know changed jobs");
        continue;
      }
      const id = key.startsWith("list:") ? key.slice(5) : "";
      const list = d.connector?.alerts?.[member.id] ?? [];
      const at = list.findIndex((x) => x.id === id);
      if (at < 0) continue;
      const a = alertOf(list[at]);
      list[at] = { ...list[at], alert: { ...a, on: false }, email: false };
      names.push(list[at].name);
    }
    return names;
  });
}

let watching = false;
/** Sends of the watch in flight, so the tests (and a clean shutdown) can wait for them. */
export const afterWatch = (nowMs = Date.now(), origin?: string) => track(watchPass(nowMs, origin));

/** One look. Returns what it did, in counts (the tests read them). */
async function watchPass(nowMs: number, origin?: string): Promise<{ looked: boolean; lines: number; emails: number; posts: number }> {
  const out = { looked: false, lines: 0, emails: 0, posts: 0 };
  if (watching) return out;
  const s0 = await loadState();
  const lastMs = Date.parse(s0.alertWatch?.at ?? "");
  if (Number.isFinite(lastMs) && nowMs - lastMs < WATCH_EVERY_MS) return out;
  watching = true;
  try {
    out.looked = true;
    const seed = await loadSeed();
    const s = s0;
    const sinceMs = Number.isFinite(lastMs) ? Math.max(lastMs, nowMs - WATCH_BACK_MS) : nowMs - WATCH_EVERY_MS;
    const nowIso = new Date(nowMs).toISOString();
    const inWin = (iso: string | undefined | null) => {
      const ms = Date.parse(iso ?? "");
      return Number.isFinite(ms) && ms > sinceMs && ms <= nowMs;
    };
    const g = T.graph(seed, s);
    const idx = T.memberIndex(seed, s);
    const tracks = T.tracksOf(seed, s);

    // Who watches what.
    type Who = { m: Member; lists: SavedSearch[]; follows: FixedPref; known: FixedPref; free: boolean };
    const who: Who[] = [];
    for (const m of idx.all) {
      if (!(s.seen[m.id] || s.profiles[m.id] || s.members.some((x) => x.id === m.id)) || s.closures?.[m.id]) continue;
      const lists = T.alertViewsOf(s, m.id, s.connector?.alerts?.[m.id] ?? [], nowMs).filter((v) => {
        const a = alertOf(v);
        return a.on && a.triggers.some((t) => WATCH_TRIGGERS.includes(t));
      });
      const follows = fixedPref(s, m.id, "follows");
      const known = fixedPref(s, m.id, "known");
      const watchesFollows = follows.on && (s.follows[m.id] ?? []).length > 0;
      const p = (s as State & { paths?: Record<string, { linkedin?: { rows: unknown[] }; csv?: { rows: unknown[] } }> }).paths?.[m.id];
      const watchesKnown = known.on && !!(p?.linkedin?.rows.length || p?.csv?.rows.length || s.network?.[m.id]);
      if (!lists.length && !watchesFollows && !watchesKnown) continue;
      who.push({ m, lists, follows: watchesFollows ? follows : { ...follows, on: false }, known: watchesKnown ? known : { ...known, on: false }, free: T.freeNow(s, m.id, nowMs) });
    }

    /* ---- what came in ---- */
    const wantSignals = who.some((w) => w.lists.some((v) => alertOf(v).triggers.some((t) => t === "seat" || t === "leader" || t === "funding")));
    const funding = wantSignals ? await fundingSource().events({ sinceMs, nowMs, companies: fundingCompanies(seed, s) }) : [];
    const signals = wantSignals ? detectSignals(seed, s, sinceMs, nowMs, funding).filter((x) => (x.kind === "seat" || x.kind === "arrival" || x.kind === "funding") && !x.reopen && !x.standing) : [];
    // Facts that changed, by company: what they were (never the value), and who wrote them.
    const facts = new Map<string, { says: Set<string>; by: Set<string> }>();
    const factAt = (companyId: string | undefined | null, say: string, by: string) => {
      if (!companyId || !g.companies.has(companyId)) return;
      const f = facts.get(companyId) ?? { says: new Set<string>(), by: new Set<string>() };
      f.says.add(say);
      f.by.add(by);
      facts.set(companyId, f);
    };
    const wantFacts = who.some((w) => w.follows.on || w.lists.some((v) => alertOf(v).triggers.includes("fact")));
    if (wantFacts) {
      for (const k in s.values) {
        const v = s.values[k];
        if (v.status !== "live" || !inWin(v.at)) continue;
        const dot = k.indexOf(".");
        const id = k.slice(0, dot);
        const field = k.slice(dot + 1);
        if (g.companies.has(id)) {
          const d = fieldDef("company", field);
          if (d) factAt(id, d.say ?? `the ${d.label.toLowerCase()}`, v.by);
        } else if (g.engagements.has(id)) {
          const d = field === "operator" ? { say: "who held a seat", label: "" } : fieldDef("engagement", field);
          if (d) factAt(g.engagements.get(id)!.companyId, d.say ?? "a seat's facts", v.by);
        } else if (g.contacts.has(id)) {
          const d = fieldDef("person", field);
          if (d) factAt(g.contacts.get(id)!.companyId, "a person's details", v.by);
        }
      }
      for (const e of s.engagements) if (inWin(e.at)) factAt(e.companyId, e.source === "Demand scan" ? "a new open role" : "a new seat", e.by);
      for (const x of s.leaderArrivals ?? []) if (inWin(x.at)) factAt(x.companyId, "a new leader on its website", "website");
    }
    // New leaders, for Someone you know: a leader its website shows now (with the name kept), or a person a member added.
    const leaders: NewLeader[] = [];
    if (who.some((w) => w.known.on)) {
      for (const x of s.leaderArrivals ?? []) {
        if (!inWin(x.at) || !g.companies.has(x.companyId)) continue;
        const fnRec = s.leaders?.[x.companyId]?.functions?.[x.fn];
        const nk = personKey(fnRec?.name);
        if (!fnRec?.name || !nk) continue;
        leaders.push({ key: `lead:${T.pubId(x.companyId)}:${x.fn}:${x.at.slice(0, 10)}`, companyId: x.companyId, companyName: g.companies.get(x.companyId)?.name ?? "", nameKey: nk, fn: x.fn, at: x.at, californian: fnRec.california === true });
      }
      for (const c of s.contacts) {
        if (!inWin(c.at)) continue;
        const name = s.values[`${c.id}.name`];
        const coId = c.companyId ?? (c.engagementId ? g.engagements.get(c.engagementId)?.companyId : undefined);
        const nk = personKey(name?.status === "live" ? name.value : null);
        if (!coId || !nk || !g.companies.has(coId)) continue;
        leaders.push({ key: `added:${T.pubId(c.id)}`, companyId: coId, companyName: g.companies.get(coId)?.name ?? "", nameKey: nk, fn: null, at: c.at, californian: false });
      }
    }

    /* ---- each member's lines ---- */
    const linesOf = new Map<string, WatchLine[]>();
    for (const w of who) {
      const m = w.m;
      const lines: WatchLine[] = [];
      const named = (companyId: string) => (T.identityHidden(g, s, idx, tracks, m, companyId) ? null : g.companies.get(companyId)?.name || null);
      const coWords = (companyId: string) => named(companyId) ?? lockedWords(g, s, companyId);
      const href = (companyId: string) => `/?c=${encodeURIComponent(T.pubId(companyId))}`;
      const listCos = w.lists.length && (signals.length || facts.size) ? await listCompanies(m, w.lists).catch((e) => (console.error("watch: a member's lists failed", e), new Map<string, Map<string, unknown>>())) : new Map<string, Map<string, unknown>>();
      for (const v of w.lists) {
        const a = alertOf(v);
        const on = listCos.get(v.id);
        if (!on?.size) continue;
        const base = { alert: `list:${v.id}`, name: v.name, email: a.email, slack: a.slack, bell: a.bell, every: a.every, sub: `On your list ${v.name}` };
        for (const x of signals) {
          const pub = T.pubId(x.companyId);
          if (!on.has(pub)) continue;
          const trig: AlertTrigger = x.kind === "seat" ? "seat" : x.kind === "arrival" ? "leader" : "funding";
          if (!a.triggers.includes(trig)) continue;
          const co = coWords(x.companyId);
          const fn = x.fn && x.fn !== "Other" ? `${x.fn} ` : "";
          const line =
            trig === "seat"
              ? `A fractional ${fn}seat ended at ${co}`
              : trig === "leader"
                ? `A new ${fn}leader${x.arrived?.level ? ` (${x.arrived.level})` : ""} on the website of ${co}`
                : `${capFirst(co)} raised ${x.amount ?? "money"}${x.round ? ` (${x.round})` : ""}, as its ${x.fundNote ?? "SEC filing"} says`;
          lines.push({ ...base, id: x.key, at: x.at, kind: trig, trigger: trig, line: capFirst(line), href: href(x.companyId) });
        }
        if (a.triggers.includes("fact"))
          for (const [companyId, f] of facts) {
            if (!on.has(T.pubId(companyId)) || [...f.by].every((b) => b === m.id)) continue;
            lines.push({ ...base, id: `fact:${T.pubId(companyId)}:${nowIso.slice(0, 16)}`, at: nowIso, kind: "fact", trigger: "fact", line: `New at ${coWords(companyId)}: ${listWords2([...f.says].slice(0, 3))}`, href: href(companyId) });
          }
      }
      if (w.follows.on) {
        const mine = new Set(s.follows[m.id] ?? []);
        for (const [companyId, f] of facts) {
          if (!mine.has(companyId) || [...f.by].every((b) => b === m.id)) continue;
          lines.push({ id: `fact:${T.pubId(companyId)}:${nowIso.slice(0, 16)}`, alert: "follows", name: "Companies you follow", at: nowIso, kind: "fact", trigger: "follows", line: `New at ${coWords(companyId)}: ${listWords2([...f.says].slice(0, 3))}`, sub: "A company you follow", href: href(companyId), email: w.follows.email, slack: w.follows.slack, bell: w.follows.bell, every: "instant" });
        }
      }
      if (w.known.on && leaders.length) {
        const people = knownPeopleOf(s, m);
        const self = personKey(m.name);
        const byName = new Map<string, string>();
        for (const [id, c] of g.companies) {
          const k = coKey(c.name);
          if (k) byName.set(k, byName.has(k) ? "" : id);
        }
        for (const mv of knownMoves(people, leaders, self, (k) => byName.get(k) || null)) {
          const name = named(mv.leader.companyId);
          lines.push({
            id: `known:${mv.leader.key}`, alert: "known", name: "Someone you know changed jobs", at: mv.leader.at, kind: "known", trigger: "known",
            line: knownLine(mv, name), sub: "From your own contacts", href: href(mv.leader.companyId), email: w.known.email, slack: w.known.slack, bell: w.known.bell, every: "instant",
          });
        }
      }
      if (lines.length) linesOf.set(m.id, lines);
    }

    /* ---- write the bell, the queues and the keys; take what is due ---- */
    const today = nowIso.slice(0, 10);
    const morning = new Date(nowMs).getUTCHours() >= MORNING_HOUR_UTC;
    const monday = new Date(nowMs).getUTCDay() === 1;
    type Job = { memberId: string; email: QueuedLine[]; slack: QueuedLine[]; every: AlertEvery };
    let added = 0;
    const jobs = await T.mutate((d) => {
      d.alertWatch ??= emptyWatch();
      d.alertWatch.members ??= {};
      d.alertWatch.at = nowIso;
      const due: Job[] = [];
      for (const [memberId, lines] of linesOf) {
        const st = (d.alertWatch.members[memberId] ??= { keys: [] });
        const told = new Set(st.keys);
        const fresh = lines.filter((l) => !told.has(`${l.alert}|${l.id}`));
        if (!fresh.length) continue;
        st.keys = [...st.keys, ...fresh.map((l) => `${l.alert}|${l.id}`)].slice(-WATCH_KEYS);
        const bell = fresh.filter((l) => l.bell);
        pushInbox(d, memberId, bell.map(({ id, at, kind, line, sub, href, alert }) => ({ id, at, kind, line, sub, href, alert })));
        const counts = new Map<string, number>();
        for (const l of bell) counts.set(l.alert, (counts.get(l.alert) ?? 0) + 1);
        logAlert(d, memberId, [...counts].map(([alert, count]) => ({ at: nowIso, alert, kind: "watch", channel: "bell" as const, count })), nowMs);
        const free = who.find((w) => w.m.id === memberId)?.free ?? true;
        const now: Job = { memberId, email: [], slack: [], every: "instant" };
        for (const l of fresh) {
          const plan = alertOnPlan({ every: l.every, slack: !!l.slack }, free, l.trigger === "follows" || l.trigger === "known" ? "watch" : l.trigger);
          const q: QueuedLine = { id: l.id, at: l.at, kind: l.kind, line: l.line, sub: l.sub, href: l.href, alert: l.alert, name: l.name, email: !!l.email, slack: plan.slack };
          if (!q.email && !q.slack) continue;
          if (plan.every === "instant") {
            if (q.email) now.email.push(q);
            if (q.slack) (st.slack ??= []).push(q);
          } else (st[plan.every] ??= []).push(q);
        }
        if (now.email.length) due.push(now);
        added += fresh.length;
      }
      // What is due now, for every member with something waiting: the Slack batch, the morning's, the week's.
      for (const [memberId, st] of Object.entries(d.alertWatch.members)) {
        const slackAtMs = Date.parse(st.slackAt ?? "");
        if (st.slack?.length && (!Number.isFinite(slackAtMs) || nowMs - slackAtMs >= BATCH_WINDOW_MS)) {
          due.push({ memberId, email: [], slack: st.slack, every: "instant" });
          st.slackAt = nowIso;
          delete st.slack;
        }
        if (st.daily?.length && morning && (st.dailyAt ?? "").slice(0, 10) !== today) {
          due.push({ memberId, email: st.daily.filter((l) => l.email), slack: st.daily.filter((l) => l.slack), every: "daily" });
          st.dailyAt = nowIso;
          delete st.daily;
        }
        const weeklyAtMs = Date.parse(st.weeklyAt ?? "");
        if (st.weekly?.length && morning && monday && (!Number.isFinite(weeklyAtMs) || nowMs - weeklyAtMs > 6 * DAY_MS)) {
          due.push({ memberId, email: st.weekly.filter((l) => l.email), slack: st.weekly.filter((l) => l.slack), every: "weekly" });
          st.weeklyAt = nowIso;
          delete st.weekly;
        }
      }
      return due;
    });
    out.lines = added;

    /* ---- send ---- */
    if (!jobs.length) return out;
    const s1 = await loadState();
    const base = baseOf(s1) || (origin ?? "").replace(/\/+$/, "");
    for (const j of jobs) {
      const m = idx.byId.get(j.memberId);
      if (!m) continue;
      if (j.email.length && base && emailEnabled() && /@/.test(m.email ?? "")) {
        try {
          const linker = emailLinker(seed, s1, m.id, base, nowMs);
          const byAlert = new Map<string, { name: string; lines: QueuedLine[] }>();
          for (const l of j.email) {
            const gr = byAlert.get(l.alert) ?? { name: l.name, lines: [] };
            gr.lines.push(l);
            byAlert.set(l.alert, gr);
          }
          const keys = [...byAlert.keys()];
          const unsubscribeUrl = alertOffUrl(base, m.id, keys);
          const mail = renderAlertEmail({
            name: m.name,
            every: j.every,
            groups: [...byAlert].map(([key, gr]) => ({ name: gr.name, lines: gr.lines.map((l) => ({ text: l.line, url: linker(l.href) })), offUrl: alertOffUrl(base, m.id, [key]) })),
            alertsUrl: linker("/?p=alerts"),
            appUrl: base,
            unsubscribeUrl,
          });
          if (await sendEmail(m.email, mail.subject, mail.text, mail.html, { unsubscribeUrl })) {
            out.emails++;
            await T.mutate((d) => logAlert(d, m.id, [...byAlert].map(([alert, gr]) => ({ at: new Date().toISOString(), alert, kind: "watch", channel: "email" as const, count: gr.lines.length }))));
          }
        } catch (e) {
          console.error("watch email failed for one member", e);
        }
      }
      if (j.slack.length) {
        const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const counts = new Map<string, number>();
        for (const l of j.slack) counts.set(l.alert, (counts.get(l.alert) ?? 0) + 1);
        const head = j.slack.length === 1 ? j.slack[0].line : `${j.slack.length} alerts${j.every === "daily" ? " this morning" : j.every === "weekly" ? " this week" : ""}`;
        const ok = await postWatch(
          m.id,
          {
            kind: "watch",
            count: j.slack.length,
            headline: head,
            lines: j.slack.slice(0, 8).map((l) => esc(`${l.line} · ${l.name}`)),
            url: base ? `${base}${j.slack.length === 1 ? j.slack[0].href : "/?p=alerts"}` : "",
            footer: "Merlin alerts. Change them in Alerts and workflows.",
          },
          [...counts].map(([alert, count]) => ({ alert, count })),
        );
        if (ok) out.posts++;
      }
    }
    return out;
  } finally {
    watching = false;
  }
}

/** The member's own people, from their LinkedIn file, their contacts CSV and their Google network, for Someone you know. */
function knownPeopleOf(s: State, m: Member): KnownPerson[] {
  const out: KnownPerson[] = [];
  const p = (s as State & { paths?: Record<string, { linkedin?: { rows: { f: string; l: string; c?: string }[] }; csv?: { rows: { n: string; c?: string }[] } }> }).paths?.[m.id];
  for (const r of p?.linkedin?.rows ?? []) {
    const name = `${r.f} ${r.l}`.trim();
    const nk = personKey(name);
    if (nk) out.push({ name, nameKey: nk, companyId: null, company: r.c ?? null, src: "linkedin" });
  }
  for (const r of p?.csv?.rows ?? []) {
    const nk = personKey(r.n);
    if (nk) out.push({ name: r.n, nameKey: nk, companyId: null, company: r.c ?? null, src: "csv" });
  }
  const n = s.network?.[m.id];
  for (const src of [n?.cal, n?.con, n?.gm, n?.claude])
    for (const [companyId, co] of Object.entries(src?.companies ?? {}))
      for (const x of co.people ?? []) {
        const nk = personKey(x.name);
        if (x.name && nk) out.push({ name: x.name, nameKey: nk, companyId, company: null, src: "google" });
      }
  return out;
}
