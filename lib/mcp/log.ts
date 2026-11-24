/**
 * Agent access on the server (BUILD_PLAN part 4, Stage 7a): the member's switches for their
 * agents' tools, the daily spend limit for all their agents together, and the log of what their
 * agents did.
 *
 *   State.connector.agent[memberId]  { off: switch keys, limit, at }   (lib/mcp/agentTools.ts keys)
 *   State.connector.log[memberId]    AgentLogRow[], oldest first, 90 days, at most LOG_MAX
 *
 * The log keeps the tool (its switch key: unlock's kind, never what it opened), when, the credits
 * spent, what came of it (done, only asked, refused, switched off, stopped at the limit) and the
 * agent's app name. Never an argument, a query, an id or anything a tool returned.
 *
 * agentCall (lib/mcp/server.ts wraps every tool with it): a switched-off tool refuses in plain
 * words; the call runs with a spend gate the unlock tool asks (spendGate) before it spends; the row
 * is written after. Rows wait in memory and are written together (one state write every
 * FLUSH_MS, or at FLUSH_AT rows), so a busy agent does not write the state on every call. The limit
 * reads the rows written and waiting, and holds credits a call is spending right now, so it holds
 * across calls and across agents.
 *
 * After a call that spent credits, the answer adds one line from the credits meter (creditsLine,
 * lib/creditsMeter.ts): "12 credits left (60% of this month's).", and at 20% or less how to get more.
 *
 * The admin export keeps the switches and the limit (settings) and leaves the log out (the
 * member's own activity). Account closure's purge deletes both (lib/table.ts purgeMember).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { loadState, meterNow, tableInternals, type State } from "../table";
import { connectorLine } from "../creditsMeter";
import { upgradeUrl } from "../plan";
import { emptyConnector } from "./types";
import {
  AGENT_GROUPS,
  AGENT_TOOLS,
  LIMIT_CHOICES,
  SWITCH_KEYS,
  TOOL_BY_KEY,
  keysOf,
  offWords,
  onlyAsked,
  tabOf,
  type AgentLogRow,
  type AgentOutcome,
  type AgentView,
  type LogTab,
} from "./agentTools";

export const LOG_DAYS = 90;
export const LOG_MAX = 3000;
const DAY = 24 * 60 * 60 * 1000;
const FLUSH_MS = 15_000;
const FLUSH_AT = 200;

export interface AgentPrefs {
  /** Switch keys turned off: a tool's key, or a group's "g:<group>". */
  off: string[];
  /** Credits all the member's agents may spend in a UTC day; null for no limit (DEFAULT_LIMIT until they pick). */
  limit: number | null;
  at?: string;
}

/** The daily spend limit until a member picks one: none (owner, 2026-11-23: agents should be free to use credits; members who want a cap set one). */
export const DEFAULT_LIMIT: number | null = null;

export const prefsIn = (s: State, memberId: string): AgentPrefs => {
  const p = s.connector?.agent?.[memberId];
  return { off: [...(p?.off ?? [])], limit: p?.limit === undefined ? DEFAULT_LIMIT : p.limit, ...(p?.at ? { at: p.at } : {}) };
};

/** The first switch that stops this call: its group's, else one of its keys. Null when it may run. */
export function stoppedBy(prefs: Pick<AgentPrefs, "off">, keys: string[]): string | null {
  const off = new Set(prefs.off);
  for (const k of keys) {
    const g = TOOL_BY_KEY.get(k)?.group;
    if (g && off.has(`g:${g}`)) return `g:${g}`;
  }
  return keys.find((k) => off.has(k)) ?? null;
}

/* ---------- the log ---------- */

/** Rows written but not yet saved, by member. */
const waiting = new Map<string, AgentLogRow[]>();
let timer: ReturnType<typeof setTimeout> | null = null;
let waitingN = 0;

const utcDay = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** A member's rows, saved and waiting, oldest first. */
export function rowsIn(s: State, memberId: string): AgentLogRow[] {
  return [...(s.connector?.log?.[memberId] ?? []), ...(waiting.get(memberId) ?? [])];
}

/** Keep LOG_DAYS and LOG_MAX. */
export function pruned(rows: AgentLogRow[], nowMs: number): AgentLogRow[] {
  const from = nowMs - LOG_DAYS * DAY;
  const kept = rows.filter((r) => Date.parse(r.at) >= from);
  return kept.length > LOG_MAX ? kept.slice(-LOG_MAX) : kept;
}

/** Write the rows waiting into the state, in one change. */
export async function flushAgentLog(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!waitingN) return;
  const batch = [...waiting.entries()];
  waiting.clear();
  waitingN = 0;
  const nowMs = Date.now();
  await tableInternals
    .mutate((s) => {
      s.connector ??= emptyConnector();
      const log = (s.connector.log ??= {});
      for (const [id, rows] of batch) {
        // A member whose personal data was deleted keeps no log.
        if (s.closures?.[id]?.purgedAt) continue;
        log[id] = pruned([...(log[id] ?? []), ...rows], nowMs);
      }
    })
    .catch((e) => console.error("agent log write failed", e));
}

/** Add a row (written with the next batch). */
export function record(memberId: string, row: AgentLogRow): void {
  const list = waiting.get(memberId) ?? [];
  list.push(row);
  waiting.set(memberId, list);
  waitingN++;
  if (waitingN >= FLUSH_AT) void flushAgentLog();
  else if (!timer) {
    timer = setTimeout(() => void flushAgentLog(), FLUSH_MS);
    timer.unref?.();
  }
}

/** Forget what waits for a member (account closure). */
export const forgetWaiting = (memberId: string) => {
  waitingN -= waiting.get(memberId)?.length ?? 0;
  waiting.delete(memberId);
};

/* ---------- the daily spend limit ---------- */

/** Credits a call is spending right now, by member: counted against the limit until its row is written. */
const holding = new Map<string, number>();

/** Credits the member's agents spent today (UTC), saved and waiting, and what calls are spending now. */
export function spentTodayIn(s: State, memberId: string, nowMs = Date.now()): number {
  const from = utcDay(nowMs);
  let n = holding.get(memberId) ?? 0;
  for (const r of rowsIn(s, memberId)) if (r.c && Date.parse(r.at) >= from) n += r.c;
  return n;
}

/** Change what a call holds against the limit by `d`. */
function holdFor(box: { memberId: string; held: number }, d: number) {
  if (!d) return;
  box.held += d;
  const n = (holding.get(box.memberId) ?? 0) + d;
  if (n > 0) holding.set(box.memberId, n);
  else holding.delete(box.memberId);
}

interface CallBox {
  memberId: string;
  limit: number | null;
  page: string;
  /** Credits held for this call now. */
  held: number;
  spent: number;
  /** Stopped at the limit: the credits it asked to spend. */
  stopped: number | null;
}
const calls = new AsyncLocalStorage<CallBox>();

export interface SpendGate {
  /** Before spending `cost`: null to go ahead (it is held until after()), or the words to refuse with. */
  before(cost: number): Promise<string | null>;
  /** What was spent (the hold is let go). */
  after(spent: number): void;
  /** For a quote: a line about the limit when this cost would pass it, else "". */
  note(cost: number): Promise<string>;
}

const limitWords = (cost: number, used: number, limit: number, page: string) =>
  `That would spend ${cost} credit${cost === 1 ? "" : "s"}, and the member's agents may spend ${limit} a day (${used} spent today). Nothing was spent. The limit resets at midnight UTC. Tell the member: they can open it themselves in Merlin, or change the limit on Merlin's Agent access page: ${page}`;

/** The gate for the tool call running now, or null outside one (in-process callers, the app). */
export function spendGate(): SpendGate | null {
  const box = calls.getStore();
  if (!box) return null;
  return {
    async before(cost) {
      if (cost <= 0) return null;
      if (box.limit !== null) {
        const used = spentTodayIn(await loadState(), box.memberId);
        if (used + cost > box.limit) {
          box.stopped = cost;
          return limitWords(cost, used, box.limit, box.page);
        }
      }
      holdFor(box, cost);
      return null;
    },
    after(spent) {
      // The hold becomes what was spent, until the call's row is written (agentCall lets it go then).
      const n = Math.max(0, spent);
      holdFor(box, n - box.held);
      box.spent += n;
    },
    async note(cost) {
      if (cost <= 0 || box.limit === null) return "";
      const used = spentTodayIn(await loadState(), box.memberId);
      return used + cost > box.limit
        ? ` This is over the member's daily limit for agents (${box.limit} credits, ${used} spent today): confirming it will be refused. They can open it themselves in Merlin, or change the limit on Merlin's Agent access page.`
        : "";
    },
  };
}

/* ---------- one tool call ---------- */

const errorOut = (message: string): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true });

/**
 * Run one tool call for an agent: refuse it when switched off, give the unlock tool its spend gate,
 * and log the row. `page`: the address of Agent access, for the words.
 */
export async function agentCall(who: { memberId: string; app?: string; page: string; base?: string }, tool: string, args: unknown, work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  const prefs = prefsIn(await loadState(), who.memberId);
  const keys = keysOf(tool, args);
  const row = (o: AgentOutcome, more: Partial<AgentLogRow> = {}): AgentLogRow => ({
    at: new Date().toISOString(),
    t: keys[0],
    o,
    ...more,
    ...(who.app ? { a: who.app.slice(0, 40) } : {}),
  });
  const off = stoppedBy(prefs, keys);
  if (off) {
    record(who.memberId, row("off"));
    return errorOut(offWords(off, who.page));
  }
  const box: CallBox = { memberId: who.memberId, limit: prefs.limit, page: who.page, held: 0, spent: 0, stopped: null };
  try {
    const res = await calls.run(box, work);
    const o: AgentOutcome = box.stopped !== null ? "limit" : res.isError ? "refused" : onlyAsked(tool, args) ? "asked" : "ok";
    // The row first, then the hold goes: what was spent is counted by one or the other at every moment.
    record(who.memberId, row(o, { ...(box.spent ? { c: box.spent } : {}), ...(box.stopped !== null ? { q: box.stopped } : {}) }));
    // The credits meter (lib/creditsMeter.ts): after a call that spent credits, one line with what is left; low, how to get more.
    if (box.spent > 0 && !res.isError) {
      const line = await creditsLine(who.memberId, who.base ?? who.page.replace(/\/?\?p=agent$/, "")).catch(() => null);
      if (line) return { ...res, content: [...(res.content ?? []), { type: "text", text: line }] };
    }
    return res;
  } finally {
    holdFor(box, -box.held);
  }
}

/** The connector's credits line now (lib/creditsMeter.ts connectorLine), with the billing link (Ways to earn while billing is off). */
export async function creditsLine(memberId: string, base: string): Promise<string> {
  const { meter, buy } = await meterNow(memberId);
  const b = base.replace(/\/$/, "");
  return connectorLine(meter, buy, buy.plan ? upgradeUrl(b, "claude_credits") : `${b}/?p=credits&tab=earn`);
}

/* ---------- the member's own changes ---------- */

export class AgentPrefsProblem extends Error {}

/** Turn a tool, an unlock kind or a group on or off, or set the limit (one of LIMIT_CHOICES, or null). */
export async function setPrefs(memberId: string, change: { key?: string; on?: boolean; limit?: number | null }): Promise<AgentPrefs> {
  if (change.key !== undefined && (!SWITCH_KEYS.has(change.key) || typeof change.on !== "boolean")) throw new AgentPrefsProblem("That isn't one of your agents' tools.");
  if (change.limit !== undefined && change.limit !== null && !(LIMIT_CHOICES as readonly number[]).includes(change.limit))
    throw new AgentPrefsProblem(`Pick ${LIMIT_CHOICES.join(", ")} credits a day, or no limit.`);
  return tableInternals.mutate((s) => {
    s.connector ??= emptyConnector();
    const all = (s.connector.agent ??= {});
    const p = prefsIn(s, memberId);
    if (change.key !== undefined) {
      const off = new Set(p.off);
      if (change.on) off.delete(change.key);
      else off.add(change.key);
      p.off = [...off].filter((k) => SWITCH_KEYS.has(k)).sort();
    }
    if (change.limit !== undefined) p.limit = change.limit;
    p.at = new Date().toISOString();
    all[memberId] = p;
    return p;
  });
}

/* ---------- the page's view ---------- */

export interface AgentOffer {
  network: boolean;
  paths: boolean;
  granola: boolean;
  /** The call triggers (RN_CALL_TRIGGERS): get_call_pack. */
  calls?: boolean;
  /** Approve, then send (RN_SEND): queue_note. */
  send?: boolean;
}

export function agentViewIn(
  s: State,
  memberId: string,
  apps: { id: string; name: string; connectedAt: string; lastUsedAt: string }[],
  offer: AgentOffer,
  freeCap: number | null,
  nowMs = Date.now(),
): AgentView {
  const prefs = prefsIn(s, memberId);
  const rows = pruned(rowsIn(s, memberId), nowMs);
  const off = new Set(prefs.off);
  const from30 = nowMs - 30 * DAY;
  const from7 = nowMs - 7 * DAY;
  const today = utcDay(nowMs);
  const used = new Map<string, number>();
  const week: Record<LogTab, number> = { all: 0, read: 0, add: 0, spend: 0, out: 0 };
  let weekSpent = 0;
  let requestsToday = 0;
  const perApp = new Map<string, { requests: number; credits: number }>();
  for (const r of rows) {
    const at = Date.parse(r.at);
    if (at >= from30) used.set(r.t, (used.get(r.t) ?? 0) + 1);
    if (at >= from7) {
      week.all++;
      week[tabOf(r)]++;
      weekSpent += r.c ?? 0;
    }
    if (at >= today) {
      requestsToday++;
      const k = r.a ?? "";
      const x = perApp.get(k) ?? { requests: 0, credits: 0 };
      x.requests++;
      x.credits += r.c ?? 0;
      perApp.set(k, x);
    }
  }
  const tools = AGENT_TOOLS.filter((t) => !t.needs || !!offer[t.needs]).map((t) => ({ ...t, on: !off.has(t.key) && !off.has(`g:${t.group}`), self: !off.has(t.key), used30: used.get(t.key) ?? 0 }));
  return {
    apps: apps.map((a) => ({ ...a, requestsToday: perApp.get(a.name.slice(0, 40))?.requests ?? 0, creditsToday: perApp.get(a.name.slice(0, 40))?.credits ?? 0 })),
    tools,
    groups: AGENT_GROUPS.map((g) => ({ ...g, on: !off.has(`g:${g.id}`) })),
    limit: prefs.limit,
    spentToday: spentTodayIn(s, memberId, nowMs),
    requestsToday,
    freeCap,
    log: rows.slice(-200).reverse(),
    week,
    weekSpent,
    since: rows[0]?.at ?? null,
  };
}
