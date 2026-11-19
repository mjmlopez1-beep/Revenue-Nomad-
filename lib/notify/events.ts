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
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { fieldDef } from "../tableFields";
import { alertMatches, countryKey } from "../mcp/alerts";
import { followsHires, startWords } from "../hired";
import { newHires, seatAddedTimes, type HireRow } from "../hireAlerts";
import { deliver, functionFor, track } from "./index";
import { snippetOf } from "./format";
import type { AlertItem, HireNews } from "./types";

type G = ReturnType<typeof T.graph>;
type Idx = ReturnType<typeof T.memberIndex>;

/** Members with a working destination and this alert on. */
const listening = (s: State, kind: AlertItem["kind"]) =>
  Object.entries(s.integrations?.members ?? {})
    .filter(([, m]) => m.alerts?.[kind] !== false && [m.slack, m.webhook].some((d) => d && !d.broken))
    .map(([id]) => id);

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
  const who = listening(s, "roles");
  if (!who.length) return;
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const fresh = [...g.engagements.values()].filter((e) => {
    const t = tracks.get(e.id);
    return !!t && t.firstSeen === at && !t.closedAt && T.isOpenRole(e, s, tracks);
  });
  // Members with a saved view that follows hires: its new matches go in the same post, so a scan that opened nothing still can.
  const hireWho = new Set(who.filter((id) => (T.alertViewsOf(s, id, s.connector?.alerts?.[id] ?? [])).some(followsHires)));
  if (!fresh.length && !hireWho.size) return;
  const added = hireWho.size ? seatAddedTimes(seed, s) : null;
  const atMs = Date.parse(at);
  /** Members told about new hires in this scan's post: the next scan counts from here. */
  const told: string[] = [];
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
    const mine = fn && fn !== "Other" ? facts.filter((x) => x.f.function === fn) : [];
    const alerts = (T.alertViewsOf(s, id, s.connector?.alerts?.[id] ?? [])).map((a) => ({ name: a.name, hits: facts.filter((x) => alertMatches(a, seen(x))) })).filter((a) => a.hits.length);
    const all = [...new Set([...mine, ...alerts.flatMap((a) => a.hits)])];
    let hires: HireNews[] = [];
    if (added && hireWho.has(id) && Number.isFinite(atMs)) {
      const prev = Date.parse(s.integrations?.members[id]?.hiresAt ?? "");
      const since = Math.max(Number.isFinite(prev) ? prev : 0, atMs - WEEK_MS);
      try {
        hires = (await newHires(m, T.alertViewsOf(s, id, s.connector?.alerts?.[id] ?? []), since, atMs, added)).map((h) => ({
          name: h.name,
          n: h.n,
          functions: h.functions,
          inProfile: h.inProfile,
          place: h.place,
          rows: h.rows.slice(0, 3).map((r) => ({ companyId: r.companyId, label: hireLabel(r) })),
        }));
      } catch (e) {
        console.error("new hires alert failed for one member", e);
      }
    }
    if (!all.length && !hires.length) continue;
    const label = (x: (typeof facts)[number]) => {
      const f = seen(x);
      const hidden = hiddenFor(x.e.companyId);
      const where = hidden ? (f.industry ? `at a ${f.industry} company` : "at a locked company") : `at ${g.companies.get(x.e.companyId)?.name || "a company"}`;
      const size = f.revenue ? `, ${f.revenue} revenue` : f.employees ? `, ${f.employees} employees` : "";
      // Where, from the country and region on file ("Texas, US"), else the HQ as the member sees it.
      const country = f.country ? (countryKey(f.country) === "united states" ? "US" : countryKey(f.country) === "united kingdom" ? "UK" : f.country) : null;
      const place = f.country ? [f.region, country].filter(Boolean).join(", ") : f.hq;
      return `${f.function ? `Fractional ${f.function}` : "Fractional"} role ${where}${size}${place ? `, ${place}` : ""}`;
    };
    const item: AlertItem = {
      kind: "roles",
      at,
      function: mine.length ? fn : null,
      total: all.length,
      mine: mine.length,
      roles: all.slice(0, 3).map((x) => ({ companyId: T.pubId(x.e.companyId), label: label(x) })),
      alerts: alerts.map((a) => ({ name: a.name, n: a.hits.length })),
      ...(hires.length ? { hires } : {}),
    };
    if (hires.length) told.push(id);
    void deliver(id, item);
  }
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
  if (!listening(s, "seat").length) return;
  const actor = memberByToken(seed, token, s);
  if (!actor) return;
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const engByPub = new Map<string, string>();
  for (const id of g.engagements.keys()) engByPub.set(T.pubId(id), id);
  const personByPub = new Map<string, string>();
  for (const [id, p] of g.contacts) if (p.engagementId) personByPub.set(T.pubId(id), id);
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
    if (!holder || holder.id === actor.id || !s.integrations?.members[holder.id]) continue;
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
    void deliver(holder.id, item);
  }
}
