/**
 * Your pipeline, the server's half (lib/pipeline.ts has the rules and the words): what Merlin sees
 * for one member, moving their entries by it, the view the app gets (GET /api/table?pipeline=1),
 * the "pipeline.*" actions, and the hooks other parts call: the morning email (dueFollowUpsFor),
 * the proposal builder (recordPipelineEvent), and a sync of the member's Google account
 * (detectNow).
 *
 * What it reads to move an entry, and nothing else: what Your network already keeps per company
 * (State.network[memberId]: the times of the latest email out and in and the first one out, from
 * Gmail's From, To and Date headers; the days of the last and next meeting with someone there, from
 * calendar attendees), the member's own conversations on Merlin (who wrote last, and when: never
 * the text), and their own seats. Never a subject, a message's text, a meeting title or an
 * attendee list: Merlin never fetches them.
 *
 * Every entry is the member's own: an action finds it in their own pipeline or refuses, and the
 * view never carries another member's entry, note or contact. An intro another member asked of
 * this member shows them who asked and the company (as they themselves see it), and nothing else.
 */
import { randomBytes } from "crypto";
import { ActionError, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "./table";
import * as P from "./pipeline";
import type { Action, ActionResult } from "./tableTypes";
import { networkOn } from "./google/types";
import { gmailTester } from "./google/config";

const SIGNED_OUT = "You're signed out. Sign in again to see your pipeline.";
const GONE = "That isn't in your pipeline anymore.";
const newId = () => `pl${randomBytes(8).toString("hex")}`;

/* ---------- what Merlin sees ---------- */

/** The member's crystal ball companies (internal ids), where a new email out may open an entry by itself. */
async function crystalOf(seed: Seed, s: State, me: Member, nowMs: number): Promise<Set<string>> {
  try {
    const radar = await import("./radar");
    return radar.crystalCompanyIds(seed, s, me, nowMs);
  } catch {
    return new Set();
  }
}

/**
 * What Merlin can see per company for this member (lib/pipeline.ts CompanySignals): Your network's
 * Gmail times and calendar days, and their own seats at the companies in their pipeline.
 */
export function signalsFor(seed: Seed, s: State, me: Member): Map<string, P.CompanySignals> {
  const out = new Map<string, P.CompanySignals>();
  const n = s.network?.[me.id];
  const one = (id: string) => {
    let x = out.get(id);
    if (!x) out.set(id, (x = {}));
    return x;
  };
  for (const [id, c] of Object.entries(n?.gm?.companies ?? {})) {
    const x = one(id);
    if (c.outAt) x.outAt = c.outAt;
    if (c.inAt) x.inAt = c.inAt;
    if (c.outFirstAt) x.outFirstAt = c.outFirstAt;
    if (c.first) x.firstDay = c.first;
    const p = c.people.find((q) => (q.sent ?? 0) > 0);
    if (p && (p.name || p.title)) x.person = { ...(p.name ? { name: p.name } : {}), ...(p.title ? { title: p.title } : {}) };
  }
  for (const [id, c] of Object.entries(n?.cal?.companies ?? {})) {
    const x = one(id);
    if (c.last) x.metDay = c.last;
    if (c.next) x.nextDay = c.next;
  }
  // Their own seats at the companies in their pipeline: a new one is a win.
  const at = new Set((s.pipeline?.[me.id]?.entries ?? []).map((e) => e.companyId));
  if (at.size) {
    const g = T.graph(seed, s);
    const idx = T.memberIndex(seed, s);
    // When each seat came onto Merlin: added by a member or the scan (State.engagements[].at), else the seed's stamp. A seed seat without one was there before.
    const addedAt = new Map<string, string>();
    for (const e of seed.engagements) if (at.has(e.companyId) && e.addedAt) addedAt.set(e.id, e.addedAt);
    for (const e of s.engagements) if (at.has(e.companyId) && e.at) addedAt.set(e.id, e.at);
    for (const e of g.engagements.values()) {
      if (!at.has(e.companyId)) continue;
      if (T.seatHolder(s, idx, e.id, T.valueOf(e, s, "operator"))?.id !== me.id) continue;
      const x = one(e.companyId);
      (x.seats ??= []).push(e.id);
      (x.seatFacts ??= {})[e.id] = { start: T.live(e, s, "start"), addedAt: addedAt.get(e.id) ?? null, type: T.live(e, s, "type") };
    }
    for (const id of at) if (!out.get(id)?.seats) one(id).seats = [];
  }
  return out;
}

/** Conversation id -> the latest message from the other side (ISO), for the member's conversations. Never the text. */
function repliesFor(s: State, meId: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of s.conversations ?? []) {
    if (c.a !== meId && c.b !== meId) continue;
    for (const m of c.messages) if (m.by !== meId && (!out.has(c.id) || m.at > out.get(c.id)!)) out.set(c.id, m.at);
  }
  return out;
}

/** Companies a new email out may open an entry at: their Crystal Ball, with Gmail connected, and not one they set aside. */
function newAtFor(s: State, me: Member, crystal: Set<string>): Set<string> | undefined {
  const n = s.network?.[me.id];
  if (!n?.gmail || !n.gm) return undefined;
  const aside = new Set([...Object.keys(n.notRel ?? {}), ...Object.keys(n.auto ?? {})]);
  return new Set([...crystal].filter((id) => !aside.has(id)));
}

/** The member's Gmail is connected and reading (headers only): a reply by email would be seen. */
function gmailSees(s: State, me: Member): boolean {
  const n = s.network?.[me.id];
  return networkOn() && !!n?.gmail && n.gmail.status !== "reconnect" && !!n.gm;
}

/** What detection reads for a member, from the committed state (its graph is built once and shared). */
function seeFor(seed: Seed, s: State, me: Member, crystal: Set<string>): P.DetectInput {
  return { signals: signalsFor(seed, s, me), replies: repliesFor(s, me.id), newAt: newAtFor(s, me, crystal), newId, gmail: gmailSees(s, me) };
}

/** Move one member's pipeline in `s` by what Merlin sees (`see`). Returns how many entries changed. */
function detectIn(s: State, memberId: string, see: P.DetectInput, nowMs: number): number {
  const had = s.pipeline?.[memberId];
  if (!had && !see.newAt?.size) return 0;
  const log = had ?? P.emptyPipeline();
  const n = P.detectAll(log, see, nowMs);
  if (n && !had) (s.pipeline ??= {})[memberId] = log;
  return n;
}

/**
 * Bring a member's pipeline up to date with what Merlin sees, writing only when something moved
 * (a dry run on a copy of their pipeline first). After a sync of their Google account, and before
 * their pipeline is shown.
 */
export async function detectNow(memberId: string, nowMs = Date.now()): Promise<number> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = T.memberIndex(seed, s).byId.get(memberId);
  if (!me) return 0;
  const see = seeFor(seed, s, me, await crystalOf(seed, s, me, nowMs));
  const copy = { pipeline: s.pipeline?.[memberId] ? { [memberId]: structuredClone(s.pipeline[memberId]) } : {} } as State;
  if (!detectIn(copy, memberId, see, nowMs)) return 0;
  return T.mutate((d) => detectIn(d, memberId, see, nowMs));
}

/* ---------- the view ---------- */

function nameFor(seed: Seed, s: State, me: Member) {
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  return (companyId: string | null): string | null => {
    if (!companyId) return null;
    const c = g.companies.get(companyId);
    if (!c) return null;
    return T.identityHidden(g, s, idx, tracks, me, companyId) ? null : c.name;
  };
}

/** The member's pipeline as they see it. Public ids only; another member's entries never. */
export function pipelineViewOf(seed: Seed, s: State, me: Member, nowMs = Date.now()): P.PipelineView {
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const nameOf = nameFor(seed, s, me);
  const log = s.pipeline?.[me.id] ?? P.emptyPipeline();
  const view = P.emptyPipelineView(nowMs);
  const introById = new Map(log.intros.map((i) => [i.id, i]));
  // Peers (lib/peers.ts): who passed a lead, and the teams the member is on, by company.
  const teamAt = new Map<string, { id: string; with: string }>();
  for (const t of s.peers?.teams ?? []) {
    if (t.status !== "active" || (t.by !== me.id && t.with !== me.id)) continue;
    teamAt.set(t.companyId, { id: t.id, with: T.firstName(idx.byId.get(t.by === me.id ? t.with : t.by)?.name ?? "a peer") });
  }
  const gmail = gmailSees(s, me);
  const introWho = (i: P.IntroRecord) => (i.introducer.memberId ? idx.byId.get(i.introducer.memberId)?.name ?? "A former member" : i.introducer.name || (i.introducer.role ? `the ${i.introducer.role}` : "Someone you know"));
  for (const e of log.entries) {
    if (!g.companies.has(e.companyId)) continue;
    const toName = e.to.memberId ? idx.byId.get(e.to.memberId)?.name ?? e.to.name ?? null : e.to.name ?? null;
    const fix: P.PipelineRec["fix"] = [];
    if (e.stage === "replied" && (e.via.replied === "gmail" || e.via.replied === "message")) fix.push("notReply");
    if (e.stage === "meeting" && e.via.meeting === "calendar") fix.push("notMeeting");
    if (e.stage === "won" && e.via.won && e.via.won !== "you") fix.push("notWon");
    if (P.isOpen(e.stage)) fix.push("lost", "notnow");
    if (e.stage === "lost" || e.stage === "notnow" || e.stage === "quiet" || e.stage === "won") fix.push("reopen");
    const ask = P.askReply(e, gmail, nowMs);
    if (e.stage !== "won") fix.push("remove");
    const intro = e.introId ? introById.get(e.introId) : undefined;
    view.entries.push({
      id: e.id,
      company: T.pubId(e.companyId),
      name: nameOf(e.companyId),
      stage: e.stage,
      channel: e.channel,
      // A peer's lead at To reach out: nobody written to yet.
      to: { label: e.stage === "reach" && !toName && !e.to.role ? "nobody yet" : P.whoWords({ ...e.to, name: toName }, e.channel, "all"), name: toName, role: e.to.role ?? null, google: !!e.to.google },
      source: e.source,
      merlinDefault: P.merlinByDefault(e),
      dates: e.dates,
      via: e.via,
      how: P.viaLine(e.via[e.stage], e.stage === "quiet" ? e.lastOut : e.dates[e.stage]),
      due: P.isOpen(e.stage) ? e.due : null,
      follow: e.follow,
      next: ask ? P.askWords(e.channel) : P.nextStep(e, nowMs),
      fix,
      ...(ask ? { ask: true } : {}),
      notes: e.notes,
      log: e.log.slice(-30),
      ...(e.won ? { won: { ...e.won, monthly: P.monthlyValue(e.won) } } : {}),
      ...(e.seatId ? { seat: T.pubId(e.seatId) } : {}),
      ...(intro ? { intro: { id: intro.id, by: introWho(intro), status: intro.status } } : {}),
      ...(e.lead ? { lead: { id: e.lead.passId, by: idx.byId.get(e.lead.by)?.name ?? "A former member" } } : {}),
      ...(teamAt.has(e.companyId) ? { team: teamAt.get(e.companyId)! } : {}),
      ...(e.route ? { route: true } : {}),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    });
    view.counts[e.stage]++;
    if (e.stage === "won") view.wonMonthly += P.monthlyValue(e.won);
  }
  view.entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const f of P.dueFollowUps(s, me.id, nowMs)) {
    if (!g.companies.has(f.companyId)) continue;
    const e = log.entries.find((x) => x.id === f.entryId)!;
    const toName = e.to.memberId ? idx.byId.get(e.to.memberId)?.name ?? e.to.name ?? null : e.to.name ?? null;
    const to = { ...f.to, name: toName };
    const words = P.followUpWords({ ...f, to }, nameOf(f.companyId), "all");
    view.due.push({ id: f.entryId, company: T.pubId(f.companyId), name: nameOf(f.companyId), stage: f.stage, channel: f.channel, who: P.whoWords(to, f.channel, "all"), title: words.title, line: words.line, sentAt: f.sentAt, due: f.due, days: f.days, follow: f.follow });
  }
  // Intros this member asked for, then the ones other members asked of them.
  const wonEntry = new Set(log.entries.filter((e) => e.stage === "won").map((e) => e.introId).filter(Boolean) as string[]);
  for (const i of log.intros) {
    view.intros.push({
      id: i.id,
      side: "asked",
      company: i.companyId && g.companies.has(i.companyId) ? T.pubId(i.companyId) : null,
      name: nameOf(i.companyId),
      who: introWho(i),
      member: !!i.introducer.memberId,
      status: i.status,
      askedAt: i.askedAt,
      ...(i.madeAt ? { madeAt: i.madeAt } : {}),
      ...(i.declinedAt ? { declinedAt: i.declinedAt } : {}),
      ...(i.conversationId ? { conversation: i.conversationId } : {}),
      ...(wonEntry.has(i.id) ? { won: true } : {}),
      ...(i.entryId ? { entry: i.entryId } : {}),
    });
  }
  for (const [askerId, other] of Object.entries(s.pipeline ?? {})) {
    if (askerId === me.id) continue;
    const won = new Set(other.entries.filter((e) => e.stage === "won").map((e) => e.introId).filter(Boolean) as string[]);
    for (const i of other.intros ?? []) {
      if (i.introducer.memberId !== me.id) continue;
      view.intros.push({
        id: i.id,
        side: "of-you",
        company: i.companyId && g.companies.has(i.companyId) ? T.pubId(i.companyId) : null,
        name: nameOf(i.companyId),
        who: idx.byId.get(askerId)?.name ?? "A former member",
        member: true,
        status: i.status,
        askedAt: i.askedAt,
        ...(i.madeAt ? { madeAt: i.madeAt } : {}),
        ...(i.declinedAt ? { declinedAt: i.declinedAt } : {}),
        ...(i.conversationId ? { conversation: i.conversationId } : {}),
        ...(won.has(i.id) ? { won: true } : {}),
      });
    }
  }
  const n = s.network?.[me.id];
  view.sees = {
    google: networkOn(),
    calendar: networkOn() && !!n?.google && n.google.status !== "reconnect" && !!n.cal,
    gmail,
    gmailOffered: networkOn() && !!n?.google && gmailTester(me.email, n.google.email),
  };
  return view;
}

/** GET /api/table?pipeline=1: brought up to date with what Merlin sees, then as the member sees it. Null when signed out. */
export async function pipelineViewFor(token: string | null, nowMs = Date.now()): Promise<P.PipelineView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  if (await detectNow(me.id, nowMs)) {
    const [seed2, s2] = await Promise.all([loadSeed(), loadState()]);
    return pipelineViewOf(seed2, s2, me, nowMs);
  }
  return pipelineViewOf(seed, s, me, nowMs);
}

/* ---------- the hooks ---------- */

/**
 * The morning email's follow-ups for a member: due today or overdue, as of what Merlin sees now,
 * each with its company named as the member sees it (null while locked) and its words. A person from
 * the member's Google account is named, since the email goes to the member alone; pass
 * names "merlin" to leave those names out. Writes nothing.
 */
export async function dueFollowUpsFor(memberId: string, nowMs = Date.now(), names: "all" | "merlin" = "all"): Promise<DueFollowUp[]> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = T.memberIndex(seed, s).byId.get(memberId);
  if (!me) return [];
  return followUpsOf(seed, s, me, nowMs, names);
}

export type DueFollowUp = P.FollowUpItem & { company: string | null; companyPub: string; title: string; line: string };

/**
 * dueFollowUpsFor on a seed and state already read (the morning email's run has them). `named`:
 * whether the member may see the company's name (default: their table shows it); a company it
 * refuses is "a company in your pipeline". Writes nothing.
 */
export function followUpsOf(seed: Seed, s: State, me: Member, nowMs: number, names: "all" | "merlin" = "all", named?: (companyId: string) => boolean): DueFollowUp[] {
  if (!s.pipeline?.[me.id]?.entries?.length) return [];
  const nameOf = nameFor(seed, s, me);
  const items = P.dueFollowUps(s, me.id, nowMs, { signals: signalsFor(seed, s, me), replies: repliesFor(s, me.id), gmail: gmailSees(s, me) });
  return items.map((f) => {
    const company = !named || named(f.companyId) ? nameOf(f.companyId) : null;
    return { ...f, company, companyPub: T.pubId(f.companyId), ...P.followUpWords(f, company, names) };
  });
}

/**
 * The proposal builder's hook: a proposal went out, was signed or was declined at a company
 * (internal or public id). Moves the member's entry to Proposal, Won or Lost (lib/pipeline.ts
 * pipelineEvent). Returns the entry's id, or null for an unknown member or company.
 */
export async function recordPipelineEvent(memberId: string, companyId: string, kind: P.ProposalKind, at: string | number = Date.now()): Promise<string | null> {
  return T.mutate((s, seed) => {
    if (!T.memberIndex(seed, s).byId.get(memberId)) return null;
    const g = T.graph(seed, s);
    const id = g.companies.has(companyId) ? companyId : [...g.companies.keys()].find((x) => T.pubId(x) === companyId);
    if (!id) return null;
    return P.pipelineEvent(s, memberId, id, kind, at, newId).id;
  });
}

/* ---------- the actions ---------- */

type PipelineAction = Extract<Action, { type: `pipeline.${string}` }>;

export async function performPipeline(token: string | null, raw: Action): Promise<ActionResult> {
  const a = raw as PipelineAction;
  const nowMs = Date.now();
  const [seed0, s0] = await Promise.all([loadSeed(), loadState()]);
  const me0 = memberByToken(seed0, token, s0);
  if (!me0) throw new ActionError(SIGNED_OUT);
  const crystal = a.type === "pipeline.sent" ? await crystalOf(seed0, s0, me0, nowMs) : new Set<string>();
  // Read from the committed state, whose graph is built once and shared: the records an action here points at don't change in it.
  const g = T.graph(seed0, s0);
  const idx = T.memberIndex(seed0, s0);
  const tracks = T.tracksOf(seed0, s0);
  const sig0 = a.type === "pipeline.correct" ? signalsFor(seed0, s0, me0) : new Map<string, P.CompanySignals>();
  const rep0 = a.type === "pipeline.correct" ? repliesFor(s0, me0.id) : new Map<string, string>();
  const message = await T.mutate((s, seed): string => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError(SIGNED_OUT);
    const log = ((s.pipeline ??= {})[me.id] ??= P.emptyPipeline());
    const companyOf = (pub: unknown) => [...g.companies.keys()].find((x) => T.pubId(x) === String(pub ?? "")) ?? null;
    const entry = (id: unknown) => {
      const e = log.entries.find((x) => x.id === String(id ?? ""));
      if (!e) throw new ActionError(GONE);
      return e;
    };
    switch (a.type) {
      case "pipeline.sent": {
        // A drafted note was used at a company outside today's moves (a record, Your network).
        const cid = companyOf(a.companyId);
        const channel = P.isChannel(a.channel) ? a.channel : a.intro ? "intro" : "email";
        const to = P.cleanTo(a.to);
        if (!cid) {
          // An ask for intros in general (an investor, another fractional) names no company: the intro alone.
          if (!a.intro) throw new ActionError("That company isn't on Merlin anymore.");
          P.addIntro(log, { id: newId(), companyId: null, introducer: { name: to.name ?? null, role: to.role ?? null, ...(to.google ? { google: true } : {}) }, nowMs });
          return "Your ask is in your pipeline. Mark it made when they introduce you.";
        }
        if (T.identityHidden(g, s, idx, tracks, me, cid)) throw new ActionError("Open the company first. Then your note is ready.");
        const source: P.Source = crystal.has(cid) ? "crystal" : a.from === "network" ? "network" : "record";
        let introId: string | undefined;
        if (a.intro) introId = P.addIntro(log, { id: newId(), companyId: cid, introducer: { name: to.name ?? null, role: to.role ?? null, ...(to.google ? { google: true } : {}) }, nowMs }).intro.id;
        const { entry: e, created } = P.openEntry(log, { id: newId(), companyId: cid, channel, to, source, via: "note", nowMs, introId });
        if (introId) log.intros.find((i) => i.id === introId)!.entryId ??= e.id;
        return created ? "In your pipeline. Merlin moves it when they reply, and nudges you to follow up in 3 business days." : "Logged in your pipeline.";
      }
      case "pipeline.followed": {
        const e = entry(a.id);
        if (!P.isOpen(e.stage)) throw new ActionError("That deal isn't open anymore.");
        if (nowMs - Date.parse(e.lastOut) < 30 * 60_000) return "Logged.";
        P.followedUp(e, "note", nowMs, nowMs);
        return `Followed up. Merlin nudges you again on ${P.shortDay(e.due ?? P.dayOf(nowMs))} if they haven't replied.`;
      }
      case "pipeline.snooze": {
        const e = entry(a.id);
        if (!P.isOpen(e.stage)) throw new ActionError("That deal isn't open anymore.");
        P.snoozeFollowUp(e, P.SNOOZE_FOLLOW_UP_DAYS, nowMs);
        return `Snoozed to ${P.shortDay(e.due!)}.`;
      }
      case "pipeline.close": {
        const e = entry(a.id);
        if (a.stage !== "lost" && a.stage !== "notnow") throw new ActionError("Pick Lost or Not now.");
        if (e.stage === "won") throw new ActionError("That one is won.");
        P.closeEntry(e, a.stage, nowMs);
        return a.stage === "lost" ? "Marked lost." : "Marked not now. Merlin won't nudge you about it.";
      }
      case "pipeline.reopen": {
        const e = entry(a.id);
        if (!P.reopenEntry(e, nowMs)) throw new ActionError("That one is still open.");
        return `Back to ${P.STAGE_WORDS[e.stage]}.`;
      }
      case "pipeline.move": {
        // The member moves it by hand, to any stage but Went quiet (Merlin's), on every plan.
        const e = entry(a.id);
        if (!P.isMoveStage(a.stage)) throw new ActionError("Pick a stage: To reach out, Sent, Replied, Meeting, Proposal, Won, Lost or Not now.");
        if (e.stage === a.stage) return `It's at ${P.STAGE_WORDS[e.stage]} already.`;
        P.moveEntry(e, a.stage, nowMs);
        return a.stage === "won" ? "Moved to Won. Add the terms and your seat when you're ready." : a.stage === "notnow" ? "Moved to Not now. Merlin won't nudge you about it." : `Moved to ${P.STAGE_WORDS[a.stage]}.`;
      }
      case "pipeline.correct": {
        const e = entry(a.id);
        const sig = sig0.get(e.companyId) ?? {};
        const msgAt = e.conversationId ? rep0.get(e.conversationId) : undefined;
        if (!P.correctEntry(e, msgAt ? { ...sig, msgAt } : sig, nowMs)) throw new ActionError("There's nothing Merlin detected to take back here.");
        return `Back to ${P.STAGE_WORDS[e.stage]}. Merlin sets that one aside.`;
      }
      case "pipeline.remove": {
        const e = entry(a.id);
        if (e.stage === "won") throw new ActionError("A won deal stays in your pipeline.");
        log.entries.splice(log.entries.indexOf(e), 1);
        for (const i of log.intros) if (i.entryId === e.id) delete i.entryId;
        return "Taken out of your pipeline.";
      }
      case "pipeline.note": {
        const e = entry(a.id);
        if (!P.addNote(e, a.text, nowMs)) throw new ActionError("Write a note first.");
        return "Note saved. Only you see it.";
      }
      case "pipeline.won": {
        const e = entry(a.id);
        if (e.stage !== "won") throw new ActionError("Move it to Won first. Merlin also marks a deal won when the proposal is signed, or when you add your seat there.");
        const w = P.cleanWon(a, nowMs);
        if (!w.terms) throw new ActionError(w.error!);
        P.setWonTerms(e, w.terms, nowMs);
        return `Saved: ${P.monthWords(P.monthlyValue(w.terms))}.`;
      }
      case "pipeline.seat": {
        const e = entry(a.id);
        const sid = [...g.engagements.keys()].find((x) => T.pubId(x) === String(a.engagementId ?? ""));
        const seat = sid ? g.engagements.get(sid) : undefined;
        if (!seat || seat.companyId !== e.companyId || T.seatHolder(s, idx, seat.id, T.valueOf(seat, s, "operator"))?.id !== me.id)
          throw new ActionError("That isn't your seat at this company.");
        e.seatId = seat.id;
        (e.seen.seats ??= []).includes(seat.id) || e.seen.seats.push(seat.id);
        if (e.stage !== "won") {
          // Their own seat there: the win itself.
          const sig: P.CompanySignals = { seats: e.seen.seats.filter((x) => x !== seat.id).concat(seat.id) };
          e.seen.seats = e.seen.seats.filter((x) => x !== seat.id);
          P.detectEntry(e, sig, nowMs);
        }
        e.updatedAt = new Date(nowMs).toISOString();
        return "Your seat is confirmed by this win.";
      }
      case "pipeline.intro": {
        // The member asked the other member in this conversation for an intro at the seat's company.
        const c = (s.conversations ?? []).find((x) => x.id === String(a.conversationId ?? ""));
        if (!c || (c.a !== me.id && c.b !== me.id)) throw new ActionError("That conversation isn't there anymore.");
        if (!c.about.companyId) throw new ActionError("This conversation is about no company. Ask about a company's seat to log an intro.");
        const other = c.a === me.id ? c.b : c.a;
        const { created } = P.addIntro(log, { id: newId(), companyId: c.about.companyId, introducer: { memberId: other }, nowMs, conversationId: c.id });
        const first = T.firstName(idx.byId.get(other)?.name ?? "They");
        return created ? `Logged. ${first} sees your ask here, and either of you can mark it made.` : "That ask is logged already.";
      }
      case "pipeline.introMark": {
        const status = a.status === "made" || a.status === "declined" || a.status === "asked" ? a.status : null;
        if (!status) throw new ActionError("Pick made or declined.");
        // The member's own ask, or one another member asked of them.
        let intro = log.intros.find((i) => i.id === String(a.id ?? ""));
        let askerId = me.id;
        let by: "asker" | "introducer" = "asker";
        if (!intro)
          for (const [mid, other] of Object.entries(s.pipeline ?? {})) {
            const hit = (other.intros ?? []).find((i) => i.id === String(a.id ?? "") && i.introducer.memberId === me.id);
            if (hit) (intro = hit), (askerId = mid), (by = "introducer");
          }
        if (!intro) throw new ActionError("That intro isn't there anymore.");
        P.markIntro(intro, status, by, nowMs);
        // Made, to a company: the asker's pipeline has it at Sent, through the intro.
        if (status === "made" && intro.companyId && g.companies.has(intro.companyId)) {
          const alog = (s.pipeline[askerId] ??= P.emptyPipeline());
          const { entry: e } = P.openEntry(alog, { id: newId(), companyId: intro.companyId, channel: "intro", to: {}, source: "intro", via: by === "introducer" ? "message" : "you", nowMs, introId: intro.id });
          e.introId ??= intro.id;
          intro.entryId = e.id;
        }
        const first = T.firstName(idx.byId.get(askerId)?.name ?? "They");
        return status === "made" ? (by === "introducer" ? `Thanks. ${first} sees the intro is made.` : "Intro made. It's in your pipeline.") : status === "declined" ? "Marked declined." : "Back to asked.";
      }
      default:
        throw new ActionError("That isn't something Merlin can do yet. Reload the page and try again.");
    }
  });
  // What Merlin sees moves it on at once (a new entry's first look at the member's seats there, say).
  await detectNow(me0.id, nowMs).catch(() => 0);
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s)!;
  return { message, pipeline: pipelineViewOf(seed, s, me, nowMs) };
}

/** The admin's numbers (lib/pipeline.ts outcomeStats) on the committed state: counts and sums only, never a name, company or note. */
export async function outcomeStatsNow(nowMs = Date.now()): Promise<P.OutcomeStats> {
  return P.outcomeStats(await loadState(), nowMs);
}
