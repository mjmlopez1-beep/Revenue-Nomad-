/**
 * A call, ready for Claude (lib/calls): get_call_pack(pack_id) gives the member's own Claude what a
 * call workflow's "Prepare it for Claude" step prepared (the Open in Claude link names the pack):
 * the call's summary and what was agreed, the template's kit, the closest case studies, the
 * member's profile and voice, and the transcript only when the member ticked it (read from their
 * recorder for that answer alone; Merlin keeps none). Read only. Close. Only with RN_CALL_TRIGGERS.
 * Like every tool, it goes through Agent access's switches (lib/mcp/log.ts agentCall).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CallProblem, callPack } from "../calls";
import { ToolProblem, type Ctx, type ToolOut } from "./tools";

type Run = (ctx: Ctx, work: () => Promise<ToolOut>) => Promise<CallToolResult>;

export async function getCallPack(ctx: Ctx, a: { pack_id?: string }): Promise<ToolOut> {
  const id = String(a.pack_id ?? "").trim();
  if (!/^cp_[a-z0-9]{4,20}$/.test(id)) throw new ToolProblem("Pass the pack_id from the member's Open in Claude link (it starts cp_).");
  try {
    return await callPack(ctx.member, id);
  } catch (e) {
    if (e instanceof CallProblem) throw new ToolProblem(e.message);
    throw e;
  }
}

export function registerCallTools(server: McpServer, ctx: Ctx, run: Run): void {
  server.registerTool(
    "get_call_pack",
    {
      title: "A call, ready for Claude",
      description:
        "What Merlin prepared after one of the member's sales calls ended (their call workflow's Prepare it for Claude step): the deliverable they agreed to send (a proposal, an SOW, a follow-up email or a deck), the call's summary, what was agreed and the next steps, the proposal kit (the member's template with its sections and guidance, the rate band, the company's facts as they see them, their profile and writing voice), their closest Evidence Bank case studies, and the transcript only when the member chose to include it. Pass pack_id from the Open in Claude link. Write the deliverable from it in the member's voice; save a proposal or SOW only as a draft with create_or_update_proposal. Never send anything to the client. Close (the trial included).",
      inputSchema: { pack_id: z.string().describe("The pack's id from the member's Open in Claude link, like cp_abc123.") },
      annotations: { title: "A call, ready for Claude", readOnlyHint: true, openWorldHint: false },
    },
    (a) => run(ctx, () => getCallPack(ctx, a)),
  );
}
