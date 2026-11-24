/**
 * Merlin's AI for Workflows v2: the AI nodes (write, decide, read into fields) and describe-to-build.
 * One small request to Anthropic's Messages API with structured output, only where Merlin's AI
 * drafts already run (lib/proposals/aiConfig.ts: RN_AI_DRAFTS, ANTHROPIC_API_KEY, RN_AI_MODEL; Close,
 * the member agreed, AI usage left: lib/calls/read.ts aiReadOpen). Each request is charged from the
 * API's own usage (chargeIn). Null when it can't be used: the caller's rules answer instead.
 *
 * What goes in: the fields the run carries (never a transcript, never a locked company's name: the
 * item never holds one), and the attachments the member picked. Nothing is kept but the answer.
 */
import Anthropic from "@anthropic-ai/sdk";
import { loadState, tableInternals as T } from "../table";
import { aiModel, aiTestBase } from "../proposals/aiConfig";
import { chargeIn } from "../proposals/aiUsage";
import { aiReadOpen } from "../calls/read";

export const aiOpenFor = async (memberId: string, nowMs = Date.now()) => aiReadOpen(await loadState(), memberId, nowMs);

/** Ask for JSON that follows `schema`. Null on a refusal, a shape that doesn't parse, or the API failing. */
export async function askJson(memberId: string, system: string, user: string, schema: Record<string, unknown>, nowMs = Date.now(), maxTokens = 2000): Promise<Record<string, unknown> | null> {
  if (!(await aiOpenFor(memberId, nowMs))) return null;
  const testBase = aiTestBase();
  const client = new Anthropic({ apiKey: String(process.env.ANTHROPIC_API_KEY).trim(), ...(testBase ? { baseURL: testBase } : {}), maxRetries: 1, timeout: 60_000 });
  let msg: Anthropic.Message;
  try {
    msg = await client.messages.create({
      model: aiModel(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    } as Anthropic.MessageCreateParamsNonStreaming);
  } catch (e) {
    console.error("workflows ai: the request failed", e instanceof Anthropic.APIError ? e.status : (e as Error)?.name);
    return null;
  }
  if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") return null;
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  let out: unknown;
  try {
    out = JSON.parse(text);
  } catch {
    return null;
  }
  if (!out || typeof out !== "object" || Array.isArray(out)) return null;
  await T.mutate((d) => void chargeIn(d, memberId, nowMs, { inTok: msg.usage?.input_tokens ?? 0, outTok: msg.usage?.output_tokens ?? 0 }));
  return out as Record<string, unknown>;
}
