/**
 * Workflows v2, the graph model (behind RN_WORKFLOWS_V2; off by default, and then nothing here is
 * read or written). Pure: shapes, the node catalog, the converter from today's linear workflows,
 * and the checks a workflow passes before it saves. No I/O, relative imports only: the runner
 * (lib/workflows/graphRun.ts), the server half (lib/workflows/v2.ts) and the tests read it.
 *
 * A workflow is nodes (id, type, settings, on/off, position) joined by edges (a node's named output
 * to the next node's input). It has one trigger, a draft and a live version ("Make live"), and a
 * monthly credit cap. Today's workflows ("When this, then that") convert losslessly into a straight
 * line: the trigger, then each step in the order the old engine runs them (STEP_ORDER).
 *
 * The rules a save checks (checkGraph), in plain words:
 *   - exactly one trigger, nothing leading into it;
 *   - every node that sends to someone else has the member's tap before it on every path: an
 *     "Approve, then send" (which pauses for the tap itself) or "Ask me" answered yes;
 *   - the plan's gates: a Close step needs Close, a paid step needs Pro;
 *   - no loops, except back through a "Wait for reply" with its loops bounded (at most 3);
 *   - the most one run can spend, the highest path, said before it is turned on.
 */
import { CALL_DEFAULT, REMIND_DAYS, STEP_ORDER, TRIGGERS, WF_CAP_MAX, cleanCall, oneLineWf, sortSteps, type CallOptions, type StepPrices, type WfScope, type WfScopeKind, type WfStep, type WfStepKey, type WfTrigger, type Workflow } from "./types";

export const WFV2_ENV = "RN_WORKFLOWS_V2";

/* ---------- the catalog ---------- */

export type NodeGroup = "trigger" | "find" | "ai" | "logic" | "act" | "notify";
/** A v2 trigger: one of today's (WfTrigger), or the new ones. */
export type V2Trigger = WfTrigger | "schedule" | "manual" | "webhook" | "visitor" | "chat";
export type PlanGate = "pro" | "close";

export interface NodeInfo {
  group: NodeGroup;
  name: string;
  sub: string;
  /** Today's step this node is (the converter maps it both ways). */
  step?: WfStepKey;
  /** The trigger it is. */
  trigger?: V2Trigger;
  /** Costs credits (the app's own unlock prices). */
  paid?: true;
  /** The plan it needs. */
  plan?: PlanGate;
  /** It sends something to someone other than the member. */
  sends?: true;
  /** The member's tap: this node's approving outputs count as the approval for what follows. */
  approves?: string[];
  /** It can pause the run (a wait, a tap, an answer). */
  pauses?: true;
  /** It ends a straight stretch: its output depends on what it reads or on a wait. */
  branches?: true;
  /** Defined, not connected yet: it says so and does nothing. */
  stub?: string;
  /** Only with a server switch. */
  flag?: "funding" | "calls" | "send";
  /** It reads the company (a locked one waits or is skipped). */
  company?: true;
}

const T = (name: string, sub: string, trigger: V2Trigger, more: Partial<NodeInfo> = {}): NodeInfo => ({ group: "trigger", name, sub, trigger, ...more });

export const NODES = {
  // Triggers (When this happens): today's, then the new ones.
  "trig.role": T("New open role", "A company posts a fractional role in your function", "role"),
  "trig.hire": T("Recent fractional hire", "A company just hired a fractional", "hire"),
  "trig.seat": T("Seat ended", "A fractional seat at the company ended", "seat"),
  "trig.leader": T("New leader", "A new leader shows on the company's own website", "leader"),
  "trig.fact": T("A fact changed", "Another member added or changed a fact there", "fact"),
  "trig.funding": T("Funding round", "From its SEC filing (Form D)", "funding", { flag: "funding" }),
  "trig.known": T("Someone I know changed jobs", "A person in your own contacts is a new leader somewhere", "known"),
  "trig.opened": T("Proposal opened", "The first time a client opens it", "opened", { plan: "close" }),
  "trig.signed": T("Proposal signed", "A proposal or a contract is fully signed", "signed", { plan: "close" }),
  "trig.call": T("A call ends", "In Granola or Fathom. Merlin sees what was agreed", "call", { flag: "calls" }),
  "trig.schedule": T("On a schedule", "Every day, every weekday or once a week, at an hour you pick", "schedule"),
  "trig.manual": T("Run now", "You start it by hand", "manual"),
  "trig.webhook": T("Incoming webhook", "Another tool calls this workflow's own link", "webhook"),
  "trig.visitor": T("Website visitor", "A known company visits your website", "visitor", { stub: "Website visitors aren't connected yet. Use Incoming webhook from your site's tool for now." }),
  "trig.chat": T("Chat message", "You ask Merlin in chat", "chat", { stub: "Chat isn't connected to workflows yet. Use Run now for now." }),

  // Find and enrich.
  "find.open": { group: "find", name: "Open the company", sub: "Its name, website and open roles, at the price in the app", step: "open", paid: true, plan: "pro", company: true },
  "find.dm": { group: "find", name: "Open who decides", sub: "Their name and title. The company opens first if it is locked", step: "dm", paid: true, plan: "pro", company: true },
  "find.way": { group: "find", name: "Find my way in", sub: "Your ways in there, strongest first", step: "way", company: true },
  "find.profile": { group: "find", name: "Company profile", sub: "Industry, size, revenue, region and its About text, from Merlin's own records", company: true },
  "find.rates": { group: "find", name: "Check my rates", sub: "Rate benchmarks: what fractionals charge in your function", plan: "pro" },
  "find.match": { group: "find", name: "Match to a company on Merlin", sub: "By its website. Free: opening it is a separate step" },
  "find.evidence": { group: "find", name: "Match my evidence", sub: "Your closest Evidence Bank cases, client names hidden", plan: "close" },
  "find.roles": { group: "find", name: "Open roles there", sub: "Titles and the functions it is hiring for", company: true },
  "find.gcontacts": { group: "find", name: "Check my Google contacts", sub: "How many people you know there. Never their names in a message", company: true },

  // Merlin AI.
  "ai.draft": { group: "ai", name: "Draft a note in my voice", sub: "A draft in Messages, from your voice. Never sent by itself", step: "draft", paid: true, plan: "pro", company: true },
  "ai.write": { group: "ai", name: "Merlin AI: write", sub: "A note or text from your prompt, with what you attach", plan: "close" },
  "ai.decide": { group: "ai", name: "Merlin AI: decide", sub: "Sorts it into your labels, Unsure when it can't tell", plan: "close", branches: true },
  "ai.agent": { group: "ai", name: "Merlin AI with tools", sub: "Fixed free tools run first (rates, ways in, evidence). It never picks a paid one", plan: "close" },
  "ai.extract": { group: "ai", name: "Read into fields", sub: "Fills fields you name from what came before, the call's notes included", plan: "close" },
  "ai.proposal": { group: "ai", name: "Draft the proposal from the call", sub: "Your template, closest case studies, profile and voice. A draft", step: "proposal", plan: "close" },
  "ai.sow": { group: "ai", name: "Draft an SOW from the call", sub: "A statement of work draft", step: "sow", plan: "close" },
  "ai.followup": { group: "ai", name: "Draft the follow-up email", sub: "What was agreed and the next steps, in your voice. A draft", step: "followup", plan: "pro" },
  "ai.deck": { group: "ai", name: "Outline a deck from the call", sub: "Slide by slide, text to build from", step: "deck", plan: "close" },
  "ai.claude": { group: "ai", name: "Prepare it for Claude", sub: "A call pack and a prompt that opens in Claude", step: "claude", plan: "close" },

  // Logic.
  "logic.filter": { group: "logic", name: "Filter", sub: "Only carry on when it matches", branches: true },
  "logic.if": { group: "logic", name: "If", sub: "Two paths", branches: true },
  "logic.switch": { group: "logic", name: "Switch", sub: "A path for each case, and Other", branches: true },
  "logic.wait": { group: "logic", name: "Wait", sub: "Some days or hours, then carry on", pauses: true, branches: true },
  "logic.waitreply": { group: "logic", name: "Wait for reply", sub: "Replied or No reply, from Gmail headers or Merlin", pauses: true, branches: true },
  "logic.merge": { group: "logic", name: "Merge", sub: "Join paths", branches: true },
  "logic.stop": { group: "logic", name: "Stop", sub: "End the run here", branches: true },
  "logic.ask": { group: "logic", name: "Ask me", sub: "Pause for your yes", pauses: true, branches: true, approves: ["yes"] },

  // Actions.
  "act.pipe": { group: "act", name: "Add to my pipeline", sub: "At To reach out. A locked company waits until it is open", step: "pipe", company: true },
  "act.move": { group: "act", name: "Move the deal", sub: "To the stage you pick", company: true },
  "act.send": { group: "act", name: "Approve, then send", sub: "From your Gmail, after your tap. Nothing goes without it", sends: true, approves: ["sent"], pauses: true, branches: true, flag: "send", plan: "pro" },
  "act.invite": { group: "act", name: "Invite to connect", sub: "Invites a fellow fractional on Merlin", sends: true },
  "act.evidence": { group: "act", name: "Save to Evidence Bank", sub: "A draft case, the client's name hidden", step: "evidence", plan: "close" },
  "act.remind": { group: "act", name: "Remind me", sub: "A line in the bell on the day", step: "remind" },
  "act.follow": { group: "act", name: "Keep watching", sub: "Follow the company: its news comes to you", company: true },
  "act.proposal": { group: "act", name: "Start a proposal", sub: "A draft in Proposals for the company. Never sent by itself", plan: "close", company: true },
  "act.reply": { group: "act", name: "Reply in chat", sub: "Merlin answers in the chat that started it", stub: "Chat isn't connected to workflows yet." },
  "act.docs": { group: "act", name: "Fill my Google Docs template", sub: "Copies your template and fills it", plan: "close", stub: "Google Docs isn't connected yet. Merlin will ask for access to the files you pick when it is." },

  // Notify (only ever the member).
  "notify.tell": { group: "notify", name: "Tell me", sub: "In the bell, and by email and in Slack where your alerts go", step: "tell" },
  "notify.me": { group: "notify", name: "Notify me", sub: "In the bell and by email" },
  "notify.bell": { group: "notify", name: "Bell", sub: "A line in Merlin's bell" },
  "notify.email": { group: "notify", name: "Email me", sub: "To your own inbox" },
  "notify.slack": { group: "notify", name: "Slack", sub: "Where your alerts go in Slack", plan: "pro" },
  "notify.webhook": { group: "notify", name: "Webhook", sub: "Your own webhook (Zapier, Make)", plan: "pro" },
} as const satisfies Record<string, NodeInfo>;
export type NodeType = keyof typeof NODES;
export const NODE_TYPES = Object.keys(NODES) as NodeType[];
export const info = (t: NodeType): NodeInfo => NODES[t];
export const isNodeType = (v: unknown): v is NodeType => typeof v === "string" && Object.prototype.hasOwnProperty.call(NODES, v);

/** Today's step key to its node type, and back. */
export const TYPE_OF_STEP = Object.fromEntries(NODE_TYPES.filter((t) => info(t).step).map((t) => [info(t).step!, t])) as Record<WfStepKey, NodeType>;
export const TYPE_OF_TRIGGER = Object.fromEntries(NODE_TYPES.filter((t) => info(t).trigger).map((t) => [info(t).trigger!, t])) as Record<V2Trigger, NodeType>;

/** The node's outputs, from its type and settings. */
export function outsOf(n: Pick<GNode, "type" | "settings">): string[] {
  switch (n.type) {
    case "logic.filter":
      return ["fits", "no"];
    case "logic.if":
      return ["yes", "no"];
    case "logic.switch":
      return [...casesOf(n.settings).map((c) => c.out), "other"];
    case "logic.waitreply":
      return ["replied", "none"];
    case "logic.ask":
      return ["yes", "no"];
    case "act.send":
      return ["sent", "skipped", "expired"];
    case "ai.decide":
      return [...labelsOf(n.settings).map((l) => `label:${slug(l)}`), "unsure"];
    case "logic.stop":
      return [];
    default:
      return ["main"];
  }
}
export const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "x";
export const casesOf = (s: Record<string, unknown>): { value: string; out: string }[] =>
  (Array.isArray(s.cases) ? s.cases : []).slice(0, 6).map((c, i) => ({ value: oneLineWf((c as { value?: unknown })?.value ?? c, 80), out: `case:${i + 1}` }));
export const labelsOf = (s: Record<string, unknown>): string[] => (Array.isArray(s.labels) ? s.labels : []).map((l) => oneLineWf(l, 40)).filter(Boolean).slice(0, 5);

/* ---------- shapes ---------- */

export interface GNode {
  id: string;
  type: NodeType;
  /** The member's label (the catalog's name by default). */
  name: string;
  /** Off: skipped, and what came in carries on. An off approval stops its path. */
  on: boolean;
  settings: Record<string, unknown>;
  pos: { x: number; y: number };
  /** If this step fails: stop the run (default), or skip it and carry on. */
  onError?: "stop" | "skip";
}
export interface GEdge {
  id: string;
  from: string;
  /** The output it leaves from: "main", "true", "case:1", "sent", ... */
  out: string;
  to: string;
}
export interface GraphVersion {
  v: number;
  nodes: GNode[];
  edges: GEdge[];
  savedAt: string;
}
export interface GraphWorkflow {
  /** Converted from today's workflow: the same id. */
  id: string;
  name: string;
  on: boolean;
  /** What runs now. Null until the first "Make live". */
  live: GraphVersion | null;
  /** Changes not live yet. */
  draft: GraphVersion | null;
  /** Older live versions, newest first (runs in flight finish on theirs). */
  versions: GraphVersion[];
  cap: number | null;
  warn: number | null;
  warned?: string;
  /** Tell me when a run fails (bell). */
  notifyOnFail: boolean;
  /** Failed runs in a row: three turn the workflow off. */
  fails?: number;
  /** The incoming webhook's secret (trig.webhook). Never shown after it is made, except to the member. */
  hook?: string;
  /** Converted from today's linear workflow. */
  from?: "v1";
  /** Made in Simple mode (the new design, lib/workflows/simple.ts): it always has a monthly credit limit. */
  mode?: "simple";
  createdAt: string;
  updatedAt: string;
}

/** What flows from node to node: one subject, as named fields. Never a transcript, never a locked company's name. */
export type Fields = Record<string, string | number | boolean | null>;

export type NodeStatus = "done" | "waiting" | "skipped" | "failed" | "stopped";
export interface NodeRun {
  node: string;
  type: NodeType;
  status: NodeStatus;
  /** The output it left by. */
  out?: string;
  note: string;
  credits: number;
  ms: number;
  at: string;
  input?: Fields;
  output?: Fields;
}
export type WaitKind = "wait" | "reply" | "ask" | "send" | "cap" | "limit";
export interface RunWait {
  kind: WaitKind;
  node: string;
  /** A wait's time: when it carries on (or, for a reply, when No reply is taken). */
  due?: string;
  /** A tap's time limit: then Expired (or No). */
  expires: string;
  /** Approve, then send: the outbox note. */
  outbox?: string;
  /** What a yes spends (cap, limit). */
  credits?: number;
}
export type RunStatus = "running" | "waiting" | "done" | "failed" | "stopped";
export interface GraphRun {
  id: string;
  wf: string;
  /** The version it runs on. */
  v: number;
  at: string;
  test: boolean;
  status: RunStatus;
  /** The trigger, as the member sees Merlin: a locked company described, never named. */
  line: string;
  lineOut?: string;
  href: string;
  /** The event, enough to carry on after a restart (never a transcript). */
  event: { key: string; trigger: V2Trigger; company: string | null; fn: string | null; lists: string[]; radar: boolean; follows: boolean; title: string | null };
  item: Fields;
  nodes: NodeRun[];
  /** The most this run can spend, quoted before the first spend (the highest path). */
  quote: number;
  /** Quoted just before each straight stretch spends; spent is that or less. */
  estimate: number;
  spent: number;
  /** Nodes still to run, in order (a pause keeps them). */
  frontier: string[];
  /** Times each node ran (a node runs once; a Wait for reply loop a few times). */
  visits: Record<string, number>;
  /** Paid nodes already bought (a retry never buys them twice). */
  bought: string[];
  /** Nodes waiting for a yes on credits (the cap or the daily limit), in order. */
  deferred: string[];
  wait?: RunWait;
  failedAt?: string;
  endedAt?: string;
  /** A call run: what it built (never the transcript). */
  built?: Record<string, string>;
  /** Paid steps waiting for the member's yes (the cap, or the daily limit): what the yes spends, and the answer. */
  ask?: { credits: number; answer?: "yes" | "no"; at?: string };
  /** Why they wait: the workflow's monthly cap, or the member's daily limit. */
  askKind?: "cap" | "limit";
  /** Mirrors today's run log for a converted straight line (Alerts reads it). */
  mirror?: boolean;
}

/** Limits: per workflow and per member. */
export const V2_LIMITS = {
  nodes: 40, edges: 80, name: 140, nodeName: 60, text: 1200, runsKept: 50, runsTotal: 400, testsPerDay: 50, failsOff: 3,
  waitDays: 30, tapDays: 14, tapDefaultDays: 7, loops: 3, conditions: 6, fields: 8, field: 300, versions: 10,
} as const;

/* ---------- the converter (today's linear workflow <-> a straight line) ---------- */

const GAP = 260;
/** Today's workflow as a graph: the trigger, then each step in run order, one edge each. Lossless (toLinear gives it back). */
export function fromLinear(f: Workflow): GraphWorkflow {
  const steps = sortSteps(f.steps);
  const trig: GNode = { id: "n_trigger", type: TYPE_OF_TRIGGER[f.trigger], name: TRIGGERS[f.trigger].name, on: true, settings: { scope: { ...f.scope }, ...(f.trigger === "call" ? { call: { ...(f.call ?? CALL_DEFAULT) } } : {}) }, pos: { x: 0, y: 0 } };
  const nodes: GNode[] = [trig];
  steps.forEach((st, i) => {
    const t = TYPE_OF_STEP[st.key];
    nodes.push({ id: `n_${st.key}`, type: t, name: info(t).name, on: true, settings: st.key === "remind" ? { days: st.days ?? REMIND_DAYS.default } : {}, pos: { x: GAP * (i + 1), y: 0 } });
  });
  const edges: GEdge[] = nodes.slice(1).map((n, i) => ({ id: `e_${i + 1}`, from: nodes[i].id, out: "main", to: n.id }));
  const live: GraphVersion = { v: 1, nodes, edges, savedAt: f.updatedAt };
  return { id: f.id, name: f.name, on: f.on, live, draft: null, versions: [], cap: f.cap, warn: f.warn, ...(f.warned ? { warned: f.warned } : {}), notifyOnFail: true, from: "v1", createdAt: f.createdAt, updatedAt: f.updatedAt };
}

/**
 * A straight line of today's steps back as today's shape, or null when it isn't one (a branch, a
 * logic node, a new node type, a node switched off).
 */
export function toLinear(g: GraphVersion): (Pick<Workflow, "trigger" | "scope" | "steps"> & { call?: CallOptions }) | null {
  const line = straightLine(g);
  if (!line) return null;
  const [t, ...rest] = line;
  const trigger = info(t.type).trigger;
  if (!trigger || trigger === "schedule" || trigger === "manual" || trigger === "webhook" || trigger === "visitor" || trigger === "chat") return null;
  const steps: WfStep[] = [];
  for (const n of rest) {
    const k = info(n.type).step;
    if (!k || !n.on) return null;
    steps.push(k === "remind" ? { key: k, days: Number(n.settings.days ?? REMIND_DAYS.default) } : { key: k });
  }
  // Today's engine runs its steps in its own order: a line in another order isn't today's.
  const keys = steps.map((x) => x.key);
  if (keys.join() !== [...keys].sort((a, b) => STEP_ORDER.indexOf(a) - STEP_ORDER.indexOf(b)).join() || new Set(keys).size !== keys.length) return null;
  const sc = (t.settings.scope ?? {}) as WfScope;
  return { trigger, scope: { kind: sc.kind, ...(sc.list ? { list: sc.list } : {}) }, steps, ...(trigger === "call" ? { call: cleanCall(t.settings.call) } : {}) };
}

/** The nodes in order when the graph is one straight line from its trigger (every node reached once by "main"), else null. */
export function straightLine(g: GraphVersion): GNode[] | null {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const trig = g.nodes.filter((n) => info(n.type).group === "trigger");
  if (trig.length !== 1) return null;
  const out: GNode[] = [trig[0]];
  const seen = new Set([trig[0].id]);
  let cur = trig[0];
  for (;;) {
    const next = g.edges.filter((e) => e.from === cur.id);
    if (!next.length) break;
    if (next.length > 1 || next[0].out !== "main") return null;
    const n = byId.get(next[0].to);
    if (!n || seen.has(n.id) || g.edges.filter((e) => e.to === n.id).length !== 1) return null;
    seen.add(n.id);
    out.push(n);
    cur = n;
  }
  return out.length === g.nodes.length ? out : null;
}

/* ---------- settings, checked ---------- */

export class GraphProblem extends Error {}

const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
const txt = (v: unknown, n: number) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").trim().slice(0, n);
/** A field name the member chose: letters, numbers, spaces, hyphens and underscores. */
export const fieldName = (v: unknown) => oneLineWf(v, 40).replace(/[^A-Za-z0-9 _-]+/g, "").trim();
export const OPS = ["is", "isNot", "contains", "over", "under", "has", "hasNot"] as const;
export type Op = (typeof OPS)[number];
export interface Condition {
  field: string;
  op: Op;
  value: string;
}
const cleanConds = (v: unknown): Condition[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, V2_LIMITS.conditions)
    .map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      return { field: fieldName(r.field), op: (OPS as readonly string[]).includes(String(r.op)) ? (r.op as Op) : "is", value: oneLineWf(r.value, 120) };
    })
    .filter((c) => c.field);
const SCOPES: WfScopeKind[] = ["list", "radar", "follows", "contacts", "proposals", "calls"];
const ATTACH = ["voice", "evidence", "templates", "rates", "call"] as const;
export type Attachment = (typeof ATTACH)[number];
export const ATTACH_WORDS: Record<Attachment, string> = { voice: "Voice", evidence: "Evidence Bank", templates: "Templates", rates: "Rates", call: "Call notes" };
export const MOVE_TO = ["reach", "sent", "replied", "meeting", "proposal", "won", "lost", "notnow"] as const;

/** A node's settings as the builder sent them, checked for its type. Unknown keys go. */
export function cleanSettings(type: NodeType, raw: unknown): Record<string, unknown> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nf = info(type);
  if (nf.group === "trigger") {
    const t = nf.trigger!;
    if (t === "schedule") return { every: ["day", "weekdays", "week"].includes(String(r.every)) ? r.every : "week", hourUtc: int(r.hourUtc, 0, 23, 14), weekday: int(r.weekday, 0, 6, 1) };
    if (t === "manual" || t === "webhook" || t === "visitor" || t === "chat") return {};
    const scopes = TRIGGERS[t as WfTrigger].scopes;
    const sr = (r.scope ?? {}) as Record<string, unknown>;
    const kind = (SCOPES.includes(sr.kind as WfScopeKind) && scopes.includes(sr.kind as WfScopeKind) ? sr.kind : scopes[0]) as WfScopeKind;
    return { scope: { kind, ...(kind === "list" ? { list: oneLineWf(sr.list, 40) } : {}) }, ...(t === "call" ? { call: cleanCall(r.call) } : {}) };
  }
  switch (type) {
    case "act.remind":
      return { days: int(r.days, REMIND_DAYS.min, REMIND_DAYS.max, REMIND_DAYS.default) };
    case "logic.wait":
      return { days: int(r.days, 0, V2_LIMITS.waitDays, 1), hours: int(r.hours, 0, 23, 0) };
    case "logic.waitreply":
      return { days: int(r.days, 1, V2_LIMITS.waitDays, 4), loops: int(r.loops, 0, V2_LIMITS.loops, 0) };
    case "logic.ask":
      return { question: oneLineWf(r.question, 160) || "Carry on?", days: int(r.days, 1, V2_LIMITS.tapDays, V2_LIMITS.tapDefaultDays) };
    case "logic.filter":
    case "logic.if":
      return { conditions: cleanConds(r.conditions), match: r.match === "any" ? "any" : "all" };
    case "logic.switch":
      return { field: fieldName(r.field), cases: casesOf(r).map((c) => ({ value: c.value })) };
    case "ai.write":
    case "ai.agent":
      return { prompt: txt(r.prompt, V2_LIMITS.text), attach: ATTACH.filter((a) => Array.isArray(r.attach) && r.attach.includes(a)), out: fieldName(r.out) || "Text" };
    case "ai.decide":
      return { question: txt(r.question, 400), labels: labelsOf(r).length >= 2 ? labelsOf(r) : ["Yes", "No"], attach: ATTACH.filter((a) => Array.isArray(r.attach) && r.attach.includes(a)) };
    case "ai.extract": {
      const fields = (Array.isArray(r.fields) ? r.fields : [])
        .slice(0, V2_LIMITS.fields)
        .map((x) => ({ name: fieldName((x as { name?: unknown })?.name ?? x), hint: oneLineWf((x as { hint?: unknown })?.hint, 160) }))
        .filter((x) => x.name);
      return { fields, attach: ATTACH.filter((a) => Array.isArray(r.attach) && r.attach.includes(a)) };
    }
    case "act.send":
      // email: the member is asked by email too, as well as in the bell (Simple mode's "In-app notifications and email").
      return { to: oneLineWf(r.to, 200), toName: oneLineWf(r.toName, 120), subject: oneLineWf(r.subject, 160), body: txt(r.body, 5000), days: int(r.days, 1, V2_LIMITS.tapDays, V2_LIMITS.tapDefaultDays), ...(r.email === true ? { email: true } : {}) };
    case "act.invite":
      return { to: oneLineWf(r.to, 80), note: txt(r.note, 600) };
    case "act.move":
      return { stage: (MOVE_TO as readonly string[]).includes(String(r.stage)) ? r.stage : "replied" };
    case "act.docs":
      return { template: oneLineWf(r.template, 120) };
    case "find.match":
      return { from: fieldName(r.from) || "Website" };
    case "find.rates":
      return { fn: oneLineWf(r.fn, 40) };
    case "notify.me":
    case "notify.bell":
    case "notify.email":
    case "notify.slack":
    case "notify.webhook":
      return { text: oneLineWf(r.text, 240) };
    default:
      return {};
  }
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
/** A version as the builder sent it: shapes checked, settings cleaned. Throws GraphProblem in plain words. */
export function cleanVersion(raw: unknown, v: number, at: string): GraphVersion {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nodesIn = Array.isArray(r.nodes) ? r.nodes : [];
  const edgesIn = Array.isArray(r.edges) ? r.edges : [];
  if (nodesIn.length > V2_LIMITS.nodes) throw new GraphProblem(`A workflow keeps ${V2_LIMITS.nodes} steps at most.`);
  if (edgesIn.length > V2_LIMITS.edges) throw new GraphProblem(`A workflow keeps ${V2_LIMITS.edges} lines at most.`);
  const nodes: GNode[] = [];
  const ids = new Set<string>();
  for (const x of nodesIn) {
    const n = (x ?? {}) as Record<string, unknown>;
    if (!isNodeType(n.type)) throw new GraphProblem("One of the steps isn't one Merlin knows. Remove it and add it again from the list.");
    const id = String(n.id ?? "");
    if (!ID.test(id) || ids.has(id)) throw new GraphProblem("Two steps share a name inside. Refresh the page and try again.");
    ids.add(id);
    const p = (n.pos ?? {}) as Record<string, unknown>;
    nodes.push({
      id,
      type: n.type,
      name: oneLineWf(n.name, V2_LIMITS.nodeName) || info(n.type).name,
      on: n.on !== false,
      settings: cleanSettings(n.type, n.settings),
      pos: { x: int(p.x, -100_000, 100_000, 0), y: int(p.y, -100_000, 100_000, 0) },
      ...(n.onError === "skip" ? { onError: "skip" as const } : {}),
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: GEdge[] = [];
  const seenEdge = new Set<string>();
  for (const x of edgesIn) {
    const e = (x ?? {}) as Record<string, unknown>;
    const from = byId.get(String(e.from ?? ""));
    const to = byId.get(String(e.to ?? ""));
    if (!from || !to) throw new GraphProblem("A line points at a step that isn't there. Remove the line and draw it again.");
    const out = String(e.out ?? "main");
    if (!outsOf(from).includes(out)) throw new GraphProblem(`${from.name} has no output called ${oneLineWf(out, 30)}.`);
    const k = `${from.id}|${out}|${to.id}`;
    if (seenEdge.has(k)) continue;
    seenEdge.add(k);
    const id = ID.test(String(e.id ?? "")) ? String(e.id) : `e_${edges.length + 1}`;
    edges.push({ id, from: from.id, out, to: to.id });
  }
  return { v, nodes, edges, savedAt: at };
}

/* ---------- the checks a save passes ---------- */

export interface PlanGates {
  tier: "free" | "pro" | "close";
  paid: boolean;
  proposals: boolean;
  evidence: boolean;
}
export interface SwitchesOn {
  funding: boolean;
  calls: boolean;
  send: boolean;
}
export interface GraphCheck {
  ok: boolean;
  /** Plain words, the first one first. */
  problems: string[];
  /** Nodes the plan holds back: "Part of Pro" / "Part of Close" (shown on the card, skipped in a run). */
  holds: Record<string, string>;
  /** The most one run can spend: the highest path. */
  ceiling: number;
}

/** "Part of Close" for a node the plan holds back, else null. */
export function holdOf(type: NodeType, plan: PlanGates): string | null {
  const nf = info(type);
  if (nf.plan === "close") {
    if (type === "act.evidence" ? !plan.evidence : !plan.proposals) return "Part of Close";
  } else if (nf.plan === "pro" && !plan.paid) return "Part of Pro";
  return null;
}

export const outEdges = (g: Pick<GraphVersion, "edges">, id: string, out?: string) => g.edges.filter((e) => e.from === id && (out === undefined || e.out === out));
export const triggerOf = (g: Pick<GraphVersion, "nodes">) => g.nodes.find((n) => info(n.type).group === "trigger") ?? null;

/** Every cycle passes through a Wait for reply: true. (Loops through it are bounded by its own setting.) */
function loopsOk(g: GraphVersion): boolean {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  // Drop the Wait for reply nodes' outgoing lines: what's left must have no cycle.
  const color = new Map<string, number>();
  const visit = (id: string): boolean => {
    color.set(id, 1);
    if (byId.get(id)?.type !== "logic.waitreply")
      for (const e of outEdges(g, id)) {
        const c = color.get(e.to) ?? 0;
        if (c === 1) return false;
        if (c === 0 && !visit(e.to)) return false;
      }
    color.set(id, 2);
    return true;
  };
  return g.nodes.every((n) => (color.get(n.id) ?? 0) !== 0 || visit(n.id));
}

/**
 * Every path from the trigger to a node that sends passes the member's tap first: an approving
 * node left by an approving output (Ask me: Yes; Approve, then send: Sent), switched on. A node that
 * sends and approves itself (Approve, then send) passes by itself. Returns the first send that
 * doesn't, or null.
 */
export function unapprovedSend(g: GraphVersion): GNode | null {
  const trig = triggerOf(g);
  if (!trig) return null;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  // Reachable without a tap: a walk that never passes an approving output.
  const bare = new Set<string>([trig.id]);
  const todo = [trig.id];
  while (todo.length) {
    const id = todo.pop()!;
    const n = byId.get(id)!;
    const ap = n.on ? (info(n.type).approves ?? []) : [];
    for (const e of outEdges(g, id)) {
      if (ap.includes(e.out)) continue;
      if (!bare.has(e.to)) {
        bare.add(e.to);
        todo.push(e.to);
      }
    }
  }
  return g.nodes.find((n) => bare.has(n.id) && info(n.type).sends && !info(n.type).approves) ?? null;
}

/** Credits one path spends at most: the company once (Open the company, who decides, a note), who decides' person once. */
function pathCredits(types: Set<NodeType>, scope: WfScope | null, p: StepPrices): number {
  const company = scope?.kind === "radar" && p.ballFree ? 0 : p.companyFull;
  const needsCompany = types.has("find.open") || types.has("find.dm") || types.has("ai.draft");
  return (needsCompany ? company : 0) + (types.has("find.dm") ? p.person : 0);
}

/** The most one run can spend: the highest of its paths (at most 500 paths are walked, then every paid node counts). */
export function graphCeiling(g: GraphVersion, p: StepPrices, plan?: PlanGates): number {
  const trig = triggerOf(g);
  if (!trig) return 0;
  const scope = (trig.settings.scope ?? null) as WfScope | null;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const counts = (n: GNode) => n.on && !!info(n.type).paid && !(plan && holdOf(n.type, plan));
  let best = 0;
  let walked = 0;
  const walk = (id: string, seen: Set<string>, paid: Set<NodeType>) => {
    if (++walked > 500) return;
    const n = byId.get(id)!;
    const here = counts(n) ? new Set([...paid, n.type]) : paid;
    best = Math.max(best, pathCredits(here, scope, p));
    for (const e of outEdges(g, id)) if (!seen.has(e.to)) walk(e.to, new Set([...seen, e.to]), here);
  };
  walk(trig.id, new Set([trig.id]), new Set());
  if (walked > 500) best = pathCredits(new Set(g.nodes.filter(counts).map((n) => n.type)), scope, p);
  return Math.min(WF_CAP_MAX, best);
}

/** The checks a save passes. `ok` false: the problems say what to fix, in plain words. */
export function checkGraph(g: GraphVersion, plan: PlanGates, prices: StepPrices, on: SwitchesOn, lists: string[] = []): GraphCheck {
  const problems: string[] = [];
  const holds: Record<string, string> = {};
  const trigs = g.nodes.filter((n) => info(n.type).group === "trigger");
  if (trigs.length === 0) problems.push("Pick what sets it off first: a workflow starts with one trigger.");
  if (trigs.length > 1) problems.push("A workflow has one trigger. Remove the second one, or make it a workflow of its own.");
  const trig = trigs[0];
  if (trig && g.edges.some((e) => e.to === trig.id)) problems.push("Nothing can lead into the trigger. Remove the line into it.");
  if (trig && !outEdges(g, trig.id).length && g.nodes.length > 1) problems.push(`Connect ${trig.name} to the first step.`);
  if (trig) {
    const t = info(trig.type).trigger!;
    if (info(trig.type).stub) problems.push(info(trig.type).stub!);
    if (t === "funding" && !on.funding) problems.push("Funding filings aren't switched on yet, so nothing would set this off.");
    if (t === "call" && !on.calls) problems.push("Calls aren't switched on for Merlin yet, so nothing would set this off.");
    const sc = trig.settings.scope as WfScope | undefined;
    if (sc?.kind === "list" && (!sc.list || !lists.includes(sc.list))) problems.push("Pick the list it watches: one of your saved lists.");
  }
  const send = unapprovedSend(g);
  if (send) problems.push(`${send.name} sends to someone, so it needs your tap first. Put Ask me (Yes) or Approve, then send before it on every path.`);
  if (!loopsOk(g)) problems.push("A line goes back to an earlier step. Only Wait for reply can loop back, and at most 3 times.");
  for (const n of g.nodes) {
    const h = holdOf(n.type, plan);
    if (h) {
      holds[n.id] = h;
      problems.push(`${n.name} is ${h.toLowerCase()}.`);
    }
    if (info(n.type).group !== "trigger" && n.id !== trig?.id && !g.edges.some((e) => e.to === n.id)) problems.push(`${n.name} isn't connected to anything before it.`);
  }
  if (trig?.type === "trig.call") {
    const companyNodes = g.nodes.filter((n) => info(n.type).paid);
    if (companyNodes.length) problems.push(`${companyNodes[0].name} needs a company, and a call may not have one. Remove it from a call workflow.`);
  }
  if (g.nodes.length <= 1) problems.push("Add at least one thing for it to do.");
  return { ok: !problems.length, problems, holds, ceiling: graphCeiling(g, prices, plan) };
}

/** The cap and warning, as today's builder checks them. */
export function cleanCapWarn(cap: unknown, warn: unknown): { cap: number | null; warn: number | null } {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(WF_CAP_MAX, n) : null;
  };
  const c = num(cap);
  const w = num(warn);
  if (c !== null && w !== null && w >= c) throw new GraphProblem("Set the warning below the monthly limit, or leave one of them off.");
  return { cap: c, warn: w };
}

/* ---------- conditions (Filter, If) ---------- */

const numOf = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, "").replace(/k$/i, "000"));
  return Number.isFinite(n) ? n : null;
};
export function holds1(c: Condition, f: Fields): boolean {
  const v = f[c.field];
  const s = v === null || v === undefined ? "" : String(v);
  switch (c.op) {
    case "is":
      return s.toLowerCase() === c.value.toLowerCase();
    case "isNot":
      return s.toLowerCase() !== c.value.toLowerCase();
    case "contains":
      return s.toLowerCase().includes(c.value.toLowerCase());
    case "over":
    case "under": {
      const a = numOf(v);
      const b = numOf(c.value);
      return a !== null && b !== null && (c.op === "over" ? a > b : a < b);
    }
    case "has":
      return s !== "" && v !== false;
    case "hasNot":
      return s === "" || v === false;
  }
}
export function matchAll(settings: Record<string, unknown>, f: Fields): boolean {
  const cs = (settings.conditions as Condition[] | undefined) ?? [];
  if (!cs.length) return true;
  return settings.match === "any" ? cs.some((c) => holds1(c, f)) : cs.every((c) => holds1(c, f));
}

/** "{Company} is hiring" with the item's fields. A field that isn't there reads as nothing. */
export const fill = (tpl: string, f: Fields) => tpl.replace(/\{([A-Za-z0-9 _-]{1,40})\}/g, (_, k: string) => (f[k.trim()] === null || f[k.trim()] === undefined ? "" : String(f[k.trim()])));

/* ---------- words ---------- */

export const creditsOf = (n: number) => (n === 1 ? "1 credit" : `${n} credits`);
/** The scope of a company trigger in words. */
export const v2ScopeKinds = SCOPES;
export type { WfScope, StepPrices };

/* ---------- what the watchers read (lib/workflows/index.ts, lib/calls) ---------- */

export const v2Switch = () => /^(1|on|true|yes)$/i.test(process.env[WFV2_ENV] ?? "");
/** A workflow as the watch passes see it: its trigger, what it watches, and today's step keys it has. */
export interface Watching {
  trigger: V2Trigger;
  scope: WfScope;
  steps: { key: WfStepKey }[];
}
/**
 * The member's workflows that are on, as the watch passes see them. Switch off: today's workflows,
 * exactly as before. On: the live graphs, and today's workflows not saved as a graph yet.
 */
export function watchingOf(w: { flows: Workflow[]; graphs?: GraphWorkflow[] } | undefined): Watching[] {
  if (!w) return [];
  if (!v2Switch()) return w.flows.filter((f) => f.on);
  const ids = new Set((w.graphs ?? []).map((g) => g.id));
  const out: Watching[] = w.flows.filter((f) => f.on && !ids.has(f.id));
  for (const g of w.graphs ?? []) {
    if (!g.on || !g.live) continue;
    const t = triggerOf(g.live);
    if (!t || !t.on) continue;
    out.push({ trigger: info(t.type).trigger!, scope: (t.settings.scope as WfScope) ?? { kind: "calls" }, steps: g.live.nodes.filter((n) => info(n.type).step).map((n) => ({ key: info(n.type).step! })) });
  }
  return out;
}
