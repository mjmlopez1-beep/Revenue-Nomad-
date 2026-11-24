/**
 * Peers in Claude (lib/peers.ts): the member's peers, referring a company to a peer (asks first, like
 * unlock), and the referrals peers sent them. The tool names stay pass_lead and leads_passed_to_me.
 *
 *   list_peers            members only: peers who serve the same kind of clients, and members the
 *                         member already talks to. People from the member's own Google or LinkedIn
 *                         are never named here, only counted (the app shows them to the member).
 *   pass_lead             without confirm it refers nothing and says what would happen; with confirm true it refers.
 *   leads_passed_to_me    referrals for the member (the company opens free for them), and the referrals they sent.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ActionError, perform } from "../table";
import { peerPicks, peersView } from "../peers";
import { PASS_CREDIT, type LeadRec, type PeerRec } from "../peersCore";
import { ToolProblem, type Ctx, type ToolOut } from "./tools";

type Run = (ctx: Ctx, work: () => Promise<ToolOut>) => Promise<CallToolResult>;

const companyWords = (x: { name: string | null; kind: string | null }) => x.name ?? (x.kind ? `a locked ${x.kind}` : "a locked company");

function peerOut(r: PeerRec): ToolOut {
  return {
    peer_id: r.memberId ?? r.id,
    name: r.name,
    title: r.title,
    ...(r.fn ? { function: r.fn } : {}),
    ...(r.why ? { why: r.why } : {}),
    working_on: r.working.map((w) => `${w.role ? `${w.role} at ` : ""}${companyWords(w)}`),
    ...(r.both.length ? { companies_you_both_know: r.both } : {}),
    ...(r.thread ? { conversation: r.thread.words } : {}),
    ...(r.muted ? { muted: true } : {}),
  };
}

function leadOut(l: LeadRec): ToolOut {
  return {
    lead_id: l.id,
    ...(l.side === "to-you" ? { from: l.who.first } : { to: l.who.first }),
    company_id: l.company,
    company: companyWords(l),
    ...(l.role ? { open_role: l.role } : {}),
    ...(l.rate ? { posted_rate: l.rate } : {}),
    line: l.line,
    ...(l.note && l.side === "to-you" ? { note: l.note } : {}),
    status: l.status === "new" ? "waiting for an answer" : l.status === "taken" ? "taken into the pipeline" : "turned down",
    ...(l.won ? { won: true } : {}),
    ...(l.side === "to-you" && l.stage ? { pipeline_stage: l.stage } : {}),
    passed: l.at.slice(0, 10),
  };
}

export async function listPeers(ctx: Ctx): Promise<ToolOut> {
  const v = await peersView(ctx.member.token);
  if (!v) throw new ToolProblem("The member is signed out of Merlin.");
  // Only members they already talk to on Merlin are named from "already know": a Google or LinkedIn contact is never named here.
  const talking = v.know.filter((r) => r.onMerlin && r.known?.from.includes("messages") && r.memberId);
  const privately = v.know.filter((r) => !talking.includes(r)).length;
  return {
    peers_who_serve_your_kind_of_clients: v.serve.map(peerOut),
    members_you_already_talk_to: talking.map(peerOut),
    ...(privately ? { more_you_already_know: `${privately} more fractionals the member knows from their own contacts. They see them in Peers on Merlin; their names stay there.` } : {}),
    ...(v.circle ? { circle: { name: v.circle.name, members: v.circle.members.filter((m) => !m.you).map((m) => `${m.first}${m.fn ? ` (${m.fn})` : ""}`), this_months_prompt: v.circle.prompt } } : {}),
    passes_left_today: v.passesLeft,
    how_to_use: `Peers are fellow fractionals on Merlin. To refer a company that isn't the member's fit to a peer, call pass_lead (it asks first). It opens free for the peer, and the member earns ${PASS_CREDIT} credits when the peer takes it. Messaging and referring cost nothing.`,
  };
}

export async function passLead(ctx: Ctx, a: { company_id: string; peer_id?: string; note?: string; role_id?: string; confirm?: boolean }): Promise<ToolOut> {
  const picks = await peerPicks(ctx.member.token, String(a.company_id ?? ""), a.role_id ?? null, false);
  if (!picks) throw new ToolProblem("That company isn't on Merlin. Pass company_id from search_companies or get_company.");
  if (!picks.name) throw new ToolProblem("The member hasn't opened this company, so they can't refer it to a peer. Unlock it first (unlock, field identity).");
  if (!a.peer_id)
    return {
      confirmed: false,
      company: picks.name,
      ...(picks.needs ? { needs: picks.needs } : {}),
      best_peers: picks.picks.map((p) => ({ peer_id: p.id, name: p.name, ...(p.fn ? { function: p.fn } : {}), why: p.why, ...(p.best ? { best_fit: true } : {}) })),
      next: "Ask the member who to refer it to, then call pass_lead with peer_id (and a note in their words). It still asks first.",
    };
  const pick = picks.picks.find((p) => p.id === a.peer_id);
  if (!pick) throw new ToolProblem("That peer can't take referrals here. Call pass_lead without peer_id for the peers who can.");
  if (!a.confirm)
    return {
      confirmed: false,
      would_pass: picks.name,
      to: pick.name,
      ...(picks.role ? { about_open_role: picks.role.fn ?? picks.role.title } : {}),
      what_happens: `${picks.name} opens free for ${pick.first} alone (no credits), lands in their Messages and on their Home, and they can take it into their pipeline. The member earns ${PASS_CREDIT} credits when they do.`,
      passes_left_today: picks.passesLeft,
      next: "Tell the member exactly this. Only if they say yes, call pass_lead again with the same arguments and confirm: true.",
    };
  try {
    const r = await perform(ctx.member.token, { type: "peer.pass", companyId: picks.company, memberId: pick.id, note: a.note ?? "", roleId: a.role_id ?? null, from: "connector" }, ctx.origin);
    return { confirmed: true, message: r.message, passes_left_today: r.peers?.passesLeft };
  } catch (e) {
    if (e instanceof ActionError) throw new ToolProblem(e.message);
    throw e;
  }
}

export async function leadsPassedToMe(ctx: Ctx): Promise<ToolOut> {
  const v = await peersView(ctx.member.token);
  if (!v) throw new ToolProblem("The member is signed out of Merlin.");
  return {
    passed_to_you: v.inbox.map(leadOut),
    you_passed: v.sent.map(leadOut),
    how_to_use:
      "A company a peer referred opens free for the member: no credits. The member takes it into their pipeline, or not, in Peers on Merlin. A referral they took waits at To reach out (pipeline_stage) until their note goes out, then Merlin moves it to Sent by itself.",
  };
}

export function registerPeerTools(server: McpServer, ctx: Ctx, run: Run): void {
  const READ = { readOnlyHint: true, openWorldHint: false } as const;
  const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
  server.registerTool(
    "list_peers",
    {
      title: "My peers",
      description:
        "Fellow fractionals on Merlin to work with: members in functions that work beside the member's, at companies like theirs (what each is working on, companies both know, where their conversation stands), members the member already talks to on Merlin, and their circle. Members only. People the member knows from their own Google or LinkedIn are counted, never named. Costs nothing.",
      inputSchema: {},
      annotations: { title: "My peers", ...READ },
    },
    () => run(ctx, () => listPeers(ctx)),
  );
  server.registerTool(
    "pass_lead",
    {
      title: "Refer it to a peer",
      description:
        "Not the member's fit? Refer a company to a peer. Without peer_id: the best peers for the function the company needs. With peer_id and without confirm: nothing is referred, it says what would happen. Only after the member says yes, call it again with confirm: true. The company opens free for that peer alone, and the member earns 5 credits when they take it. 10 a day.",
      inputSchema: {
        company_id: z.string().describe("The company's id, from search_companies or get_company. The member must have opened it."),
        peer_id: z.string().optional().describe("The peer's id, from list_peers or this tool's best_peers."),
        role_id: z.string().optional().describe("An open role's id there, when the referral is about one."),
        note: z.string().optional().describe("A short note in the member's own words. Up to 600 characters."),
        confirm: z.boolean().optional().describe("true only after the member said yes."),
      },
      annotations: { title: "Refer it to a peer", ...WRITE },
    },
    (a) => run(ctx, () => passLead(ctx, a)),
  );
  server.registerTool(
    "leads_passed_to_me",
    {
      title: "Referrals for you",
      description: "Referrals for the member: companies peers referred to them (each opens free for them), and the referrals the member sent, with what came of each. A referral the member took shows its stage in their pipeline: To reach out until their note goes out, then Sent and on. Costs nothing.",
      inputSchema: {},
      annotations: { title: "Referrals for you", ...READ },
    },
    () => run(ctx, () => leadsPassedToMe(ctx)),
  );
}
