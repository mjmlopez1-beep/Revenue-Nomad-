/**
 * Workflows, Simple mode (the new design, RN_UI3, on the v2 engine RN_WORKFLOWS_V2): a workflow said
 * as four stages, compiled to a real graph the engine runs (graph.ts, graphRun.ts). Pure, relative
 * imports only: the page and scripts/test-ui3-work.mts read it.
 *
 *   01 When this happens      one of today's company triggers, watching the member's Crystal Ball, a
 *                             saved list, or the companies they follow
 *   02 Merlin does this       research the company (opens it, at the app's price), find the decision
 *                             maker (opens who decides), find their email (off by default: 1 credit
 *                             on every plan, the one step that spends on Pro and Close), find my
 *                             warmest way in, draft an introduction in my voice (always on: the
 *                             approval needs a note)
 *   03 I approve              Approve, then send: the note waits for the member's tap, asked in the
 *                             bell and, when they choose, by email; skipped when not answered in N
 *                             days. Nothing goes out without it (the engine refuses any other path).
 *   04 Merlin follows through after the tap: add it to the pipeline, watch for a reply (moves the deal
 *                             to Replied), and, with no reply, a follow-up drafted for another tap
 *
 * A Simple workflow always has a monthly credit limit (v2.ts refuses one without): at the limit its
 * runs stop spending and wait for the member's yes in the bell (graphRun.ts, the cap).
 *
 * Node ids are fixed (s_*), so parseSimple reads a saved version back; a graph changed in Advanced
 * past what Simple can say reads as null and opens in Advanced.
 */
import type { WfScope, WfTrigger } from "./types";
import type { GEdge, GNode, GraphVersion, NodeType } from "./graph";

export type SimpleTrigger = Extract<WfTrigger, "seat" | "role" | "hire" | "funding" | "known" | "leader" | "fact">;
export const SIMPLE_TRIGGERS: SimpleTrigger[] = ["seat", "role", "hire", "funding", "leader", "known", "fact"];

export interface SimpleCfg {
  trigger: SimpleTrigger;
  scope: WfScope;
  /** 02: research the company (open it), find the decision maker, find my warmest way in. The draft is always on. */
  research: boolean;
  dm: boolean;
  /** Find their email: who decides' email, 1 credit on every plan. Off unless the member turns it on. */
  email: boolean;
  way: boolean;
  /** 03: how the member is asked (the bell always; email too when on), and the days before an unanswered draft is skipped. */
  ask: { email: boolean; days: number };
  /** 04: add to the pipeline after the tap, watch for a reply (and move the deal), prepare a follow-up for another tap. */
  follow: { pipe: boolean; reply: boolean; replyDays: number; followup: boolean };
}

export const SIMPLE_DEFAULT: SimpleCfg = {
  trigger: "seat",
  scope: { kind: "radar" },
  research: true,
  dm: true,
  email: false,
  way: true,
  ask: { email: true, days: 7 },
  follow: { pipe: true, reply: true, replyDays: 4, followup: true },
};

/** The four stages' own words, as the page says them. */
export const TRIGGER_SAY: Record<SimpleTrigger, { head: string; line: string }> = {
  seat: { head: "An ideal client needs someone like me.", line: "A fractional seat ends at a company" },
  role: { head: "A client is hiring for my expertise.", line: "A company posts a fractional role in my function" },
  hire: { head: "A company just started using fractionals.", line: "A company hires a fractional" },
  funding: { head: "A client just raised money.", line: "A company files a funding round" },
  leader: { head: "A new leader is building a team.", line: "A new leader shows at a company" },
  known: { head: "Someone I know just moved.", line: "A person in my contacts starts at a new company" },
  fact: { head: "Something changed at a company I watch.", line: "A member adds or changes a fact at a company" },
};
export const SCOPE_SAY: Record<string, string> = { radar: "in my Crystal Ball", list: "on my saved list", follows: "I follow", contacts: "where I know someone" };

const node = (id: string, type: NodeType, name: string, settings: Record<string, unknown>, x: number, y: number, on = true): GNode => ({ id, type, name, on, settings, pos: { x, y } });
const edge = (from: string, out: string, to: string): GEdge => ({ id: `e_${from}_${out}_${to}`.slice(0, 40), from, out, to });

/** The four stages as a graph version (v and savedAt are the server's). */
export function compileSimple(c: SimpleCfg): Pick<GraphVersion, "nodes" | "edges"> {
  const X = 340;
  const trigType = `trig.${c.trigger}` as NodeType;
  const scope = c.trigger === "known" ? { kind: "contacts" } : c.scope.kind === "list" ? { kind: "list", list: c.scope.list ?? "" } : { kind: c.scope.kind };
  const days = Math.max(1, Math.min(14, Math.round(c.ask.days) || 7));
  const nodes: GNode[] = [
    node("s_trigger", trigType, TRIGGER_SAY[c.trigger].line, { scope }, 0, 0),
    node("s_open", "find.open", "Research the company", {}, 0, 140, c.research),
    node("s_dm", "find.dm", "Find the decision maker", {}, 0, 280, c.dm),
    // Find their email is in the graph only when it is on, so a workflow saved before it reads back the same.
    ...(c.email ? [node("s_email", "find.email", "Find their email", {}, 0, 350)] : []),
    node("s_way", "find.way", "Find my warmest way in", {}, 0, 420, c.way),
    node("s_draft", "ai.draft", "Draft an introduction in my voice", {}, 0, 560),
    node("s_send", "act.send", "I approve", { days, email: c.ask.email }, 0, 700),
  ];
  const edges: GEdge[] = [edge("s_trigger", "main", "s_open"), edge("s_open", "main", "s_dm"), ...(c.email ? [edge("s_dm", "main", "s_email"), edge("s_email", "main", "s_way")] : [edge("s_dm", "main", "s_way")]), edge("s_way", "main", "s_draft"), edge("s_draft", "main", "s_send")];
  let after = "s_send";
  let out = "sent";
  if (c.follow.pipe) {
    nodes.push(node("s_pipe", "act.pipe", "Update my pipeline", {}, 0, 840));
    edges.push(edge(after, out, "s_pipe"));
    after = "s_pipe";
    out = "main";
  }
  if (c.follow.reply) {
    const rd = Math.max(1, Math.min(30, Math.round(c.follow.replyDays) || 4));
    nodes.push(node("s_reply", "logic.waitreply", "Watch for a reply", { days: rd, loops: 0 }, 0, 980));
    edges.push(edge(after, out, "s_reply"));
    nodes.push(node("s_move", "act.move", "Move the deal to Replied", { stage: "replied" }, -X / 2, 1120));
    edges.push(edge("s_reply", "replied", "s_move"));
    if (c.follow.followup) {
      nodes.push(node("s_fdraft", "ai.draft", "Prepare a follow-up", {}, X / 2, 1120));
      nodes.push(node("s_fsend", "act.send", "I approve the follow-up", { days, email: c.ask.email }, X / 2, 1260));
      edges.push(edge("s_reply", "none", "s_fdraft"), edge("s_fdraft", "main", "s_fsend"));
    }
  }
  return { nodes, edges };
}

/** A saved version back as the four stages, or null when it holds more than Simple can say. */
export function parseSimple(v: Pick<GraphVersion, "nodes" | "edges"> | null | undefined): SimpleCfg | null {
  if (!v) return null;
  const by = new Map(v.nodes.map((n) => [n.id, n]));
  const t = by.get("s_trigger");
  const send = by.get("s_send");
  if (!t || !send || !by.get("s_draft") || send.type !== "act.send") return null;
  const trigger = t.type.replace(/^trig\./, "") as SimpleTrigger;
  if (!SIMPLE_TRIGGERS.includes(trigger)) return null;
  const known = new Set(["s_trigger", "s_open", "s_dm", "s_email", "s_way", "s_draft", "s_send", "s_pipe", "s_reply", "s_move", "s_fdraft", "s_fsend"]);
  if (v.nodes.some((n) => !known.has(n.id))) return null;
  const sc = (t.settings.scope ?? { kind: "radar" }) as WfScope;
  const reply = by.get("s_reply");
  const cfg: SimpleCfg = {
    trigger,
    scope: sc.kind === "list" ? { kind: "list", list: sc.list } : { kind: sc.kind },
    research: by.get("s_open")?.on ?? false,
    dm: by.get("s_dm")?.on ?? false,
    email: by.get("s_email")?.on === true,
    way: by.get("s_way")?.on ?? false,
    ask: { email: send.settings.email === true, days: Number(send.settings.days ?? 7) },
    follow: { pipe: by.has("s_pipe"), reply: !!reply, replyDays: Number(reply?.settings.days ?? 4), followup: by.has("s_fsend") },
  };
  // The same graph again: anything else (a line moved, a step added) belongs to Advanced.
  const again = compileSimple(cfg);
  const key = (x: Pick<GraphVersion, "edges">) => x.edges.map((e) => `${e.from}>${e.out}>${e.to}`).sort().join("|");
  return key(again) === key(v) && again.nodes.length === v.nodes.length ? cfg : null;
}

/** Credits a run of these four stages can spend, in words for each paid step: what the app's prices say. */
export const SIMPLE_PAID: { id: string; what: "company" | "person" | "detail" }[] = [
  { id: "s_open", what: "company" },
  { id: "s_dm", what: "person" },
  { id: "s_email", what: "detail" },
];
