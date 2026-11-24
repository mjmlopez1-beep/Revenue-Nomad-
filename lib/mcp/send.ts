/**
 * Approve, then send, in Claude (lib/send, RN_SEND): an agent can put a note it drafted in front of
 * the member, never approve or send one.
 *
 *   queue_note   a draft (to, subject, body, the company) in the member's Merlin, under Waiting for
 *                your approval in Messages. It sends nothing. The member reads it, edits it and taps
 *                Approve and send in the Merlin app, signed in, and it goes from their own Gmail.
 *
 * There is no tool that approves, sends, schedules or undoes: those are the member's taps in the app
 * (app/api/send refuses a bearer token). sendWords rewrites the lines that said Merlin never sends,
 * while sending is on, so every tool says the same thing.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ActionError } from "../table";
import { queueFromAgent, sendOn } from "../send";
import { ToolProblem, type Ctx, type ToolOut } from "./tools";

type Run = (ctx: Ctx, work: () => Promise<ToolOut>) => Promise<CallToolResult>;

/** The one sentence every tool uses about sending, while sending is on. */
export const SEND_RULE =
  "Merlin sends a note only when the member taps Approve and send in the Merlin app, signed in, and it goes from their own Gmail. No tool can approve, schedule or send one: queue_note puts a note you drafted in front of them to approve.";

/** The words that said Merlin never sends, as they are while sending is on. Off: unchanged. */
export function sendWords(text: string): string {
  if (!sendOn()) return text;
  return text
    .replace("Merlin never sends a note for a member, and never reads their email.", `${SEND_RULE} Merlin never reads their email.`)
    .replace("The member sends every note themselves; Merlin never sends for them.", `The member approves every note themselves. ${SEND_RULE}`)
    .replace("The member sends each note themselves, from their own mail or on Merlin. Merlin never sends for them, and neither should you unless they ask you to in their own mail tool.", `The member approves and sends each note themselves, in the Merlin app or from their own mail. ${SEND_RULE} Never send one yourself unless they ask you to in their own mail tool.`)
    .replace("hand it to the member to send themselves.", "hand it to the member: queue_note puts it in front of them, and they approve and send it in the Merlin app.")
    .replace("draft one in the member's voice when asked, and the member sends it.", `draft one in the member's voice when asked; queue_note puts it in front of them, and they approve and send it in the Merlin app. No tool sends it.`);
}

export function registerSendTools(server: McpServer, ctx: Ctx, run: Run): void {
  server.registerTool(
    "queue_note",
    {
      title: "Queue a note for the member to approve",
      description: `Put a note you drafted for the member (an outreach note, an intro ask, a follow-up) in front of them in Merlin, under Waiting for your approval in Messages. It never sends. The member reads it, can change any word, and taps Approve and send in the Merlin app, signed in; it then goes from their own Gmail, with 30 seconds to undo. No tool can approve, schedule or send a note: that is always the member's own tap in the app. to: an email address the member can see (one they opened on Merlin, or from their own contacts); leave it out and they add it. Never an address you guessed, and never one Merlin shows as locked. company_id: the company it is about, when there is one. Write it in the member's voice (my_voice), from facts they can see. Up to 50 a day. Costs nothing.`,
      inputSchema: {
        to: z.string().optional().describe("The email address, only one the member can see. Leave it out when you don't have it."),
        to_name: z.string().optional().describe("Who it goes to, as the member sees their name."),
        subject: z.string().describe("The subject line, under 160 characters."),
        body: z.string().describe("The note itself, in the member's voice. Plain text."),
        company_id: z.string().optional().describe("The company's id (from search_companies or todays_moves), when the note is about one."),
      },
      annotations: { title: "Queue a note for the member to approve", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (a) => run(ctx, () => queueNote(ctx, a as never)),
  );
}

async function queueNote(ctx: Ctx, a: { to?: string; to_name?: string; subject?: string; body?: string; company_id?: string }): Promise<ToolOut> {
  try {
    const it = await queueFromAgent(ctx.member, a);
    return {
      queued: true,
      sent: false,
      note_id: it.id,
      to: it.to || "Not set: the member adds the address",
      where: "Merlin, Messages, Waiting for your approval",
      next: "Tell the member the note is waiting in Merlin for their approval. It goes only when they tap Approve and send there. You can't send it.",
    };
  } catch (e) {
    if (e instanceof ActionError) throw new ToolProblem(e.message);
    throw e;
  }
}
