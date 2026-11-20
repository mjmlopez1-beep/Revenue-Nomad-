/**
 * What Slack's Block Kit would refuse in a post, for the suites that check lib/notify/format.ts
 * slackBody (test-notify, test-radar, test-hired): only the block types the post may use, each
 * kind's limits (SLACK_LIMITS), buttons and images with http(s) addresses, action ids that never
 * repeat, and a fallback text. An empty list: Slack takes it.
 */
import { SLACK_BLOCKS, SLACK_LIMITS } from "../lib/notify/format";

export type Block = {
  type: string;
  text?: { type: string; text: string };
  fields?: { type: string; text: string }[];
  accessory?: { type: string; image_url?: string; alt_text?: string };
  elements?: { type: string; text?: unknown; url?: string; action_id?: string; style?: string }[];
};
export type SlackPost = { text?: unknown; blocks: Block[] };

export function blockKitProblems(body: SlackPost): string[] {
  const L = SLACK_LIMITS;
  const out: string[] = [];
  if (typeof body.text !== "string" || !body.text.trim()) out.push("no fallback text");
  if (!Array.isArray(body.blocks) || !body.blocks.length) return [...out, "no blocks"];
  if (body.blocks.length > L.blocks) out.push(`${body.blocks.length} blocks`);
  const linkOk = (u: unknown) => typeof u === "string" && /^https?:\/\/[^\s<>|]+$/.test(u) && u.length <= L.url;
  for (const [i, b] of body.blocks.entries()) {
    if (!(SLACK_BLOCKS as readonly string[]).includes(b.type)) out.push(`${i}: block ${b.type}`);
    if (b.type === "header" && (b.text?.type !== "plain_text" || !b.text.text || b.text.text.length > L.header)) out.push(`${i}: header`);
    if (b.type === "section") {
      if (!b.text && !b.fields?.length) out.push(`${i}: empty section`);
      if (b.text && (b.text.type !== "mrkdwn" || !b.text.text || b.text.text.length > L.section)) out.push(`${i}: section text ${b.text.text.length}`);
      if ((b.fields?.length ?? 0) > L.fields) out.push(`${i}: ${b.fields!.length} fields`);
      for (const f of b.fields ?? []) if (f.type !== "mrkdwn" || !f.text || f.text.length > L.field) out.push(`${i}: field ${f.text.length}`);
      if (b.accessory && (b.accessory.type !== "image" || !/^https:\/\/[^\s<>|]+$/.test(b.accessory.image_url ?? "") || !b.accessory.alt_text || b.accessory.alt_text.length > L.alt)) out.push(`${i}: accessory`);
    }
    if (b.type === "context" && (!b.elements?.length || b.elements.length > 10 || b.elements.some((e) => e.type !== "mrkdwn" || !e.text || String(e.text).length > L.context))) out.push(`${i}: context`);
    if (b.type === "actions") {
      if (!b.elements?.length || b.elements.length > 25) out.push(`${i}: actions`);
      for (const e of b.elements ?? []) {
        const t = e.text as { type: string; text: string } | undefined;
        if (e.type !== "button" || t?.type !== "plain_text" || !t.text || t.text.length > L.button || !linkOk(e.url) || !e.action_id) out.push(`${i}: button`);
      }
    }
  }
  const ids = body.blocks.flatMap((b) => (b.type === "actions" ? (b.elements ?? []).map((e) => e.action_id) : []));
  if (new Set(ids).size !== ids.length) out.push("action ids repeat");
  return out;
}

/** The post's sections, in order. */
export const sectionsOf = (body: SlackPost) => body.blocks.filter((b) => b.type === "section");
