/**
 * The switch for drafting proposals with Claude on Merlin's server (lib/proposals/draft.ts). Off
 * unless all three are set:
 *
 *   RN_AI_DRAFTS=1      turn it on
 *   ANTHROPIC_API_KEY   the key Merlin's server calls Anthropic's API with
 *   RN_AI_MODEL         which model drafts (required: Merlin names none of its own)
 *
 * Off, Proposals keeps its own reader of a transcript (lib/proposals/extract.ts, in the member's
 * browser) and offers "Build it in Claude" with the connector instead. Tests point the API at a
 * fake with RN_AI_TEST_BASE_URL, read only on a test server (RN_SCAN_TEST=1).
 */
export const aiModel = () => String(process.env.RN_AI_MODEL ?? "").trim();
export const aiConfigured = () => process.env.RN_AI_DRAFTS === "1" && !!String(process.env.ANTHROPIC_API_KEY ?? "").trim() && !!aiModel();
export const aiTestBase = () => (process.env.RN_SCAN_TEST === "1" ? String(process.env.RN_AI_TEST_BASE_URL ?? "").trim() || null : null);
