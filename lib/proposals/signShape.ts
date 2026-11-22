/**
 * The signing route's body, checked field by field before anything reads it (app/api/sign/route.ts):
 * a question, a reason or a name sent as an object or a number is refused in words, never turned
 * into "[object Object]".
 */
const TEXT_FIELDS = ["token", "op", "question", "reason", "note", "name", "code", "hash", "method", "png"] as const;
const isText = (v: unknown) => v === undefined || v === null || typeof v === "string";
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** What's wrong with a body's field types, in a sentence, or null. */
export function badShape(b: Record<string, unknown>): string | null {
  for (const k of TEXT_FIELDS) if (!isText(b[k])) return k === "question" ? "Type your question as text." : k === "reason" ? "Type the reason as text." : "That didn't go through. Refresh the page and try again.";
  if (b.consent !== undefined && typeof b.consent !== "boolean") return "Tick the box to agree to sign electronically.";
  if (b.signer !== undefined && (!isObj(b.signer) || !["name", "email", "title"].every((k) => isText((b.signer as Record<string, unknown>)[k])))) return "Type their full name and email.";
  if (b.choice !== undefined && b.choice !== null && (!isObj(b.choice) || !isText(b.choice.optionId) || (b.choice.addOnIds !== undefined && (!Array.isArray(b.choice.addOnIds) || !b.choice.addOnIds.every((x) => typeof x === "string")))))
    return "That option isn't in this proposal. Reload the page and pick again.";
  if (b.values !== undefined && (!isObj(b.values) || !Object.values(b.values).every((v) => typeof v === "string" || typeof v === "boolean"))) return "That didn't go through. Refresh the page and try again.";
  return null;
}

