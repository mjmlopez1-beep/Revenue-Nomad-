/**
 * The one-screen Proposals (scratchpad plan "Proposals, rebuilt"), behind RN_PROPOSALS2, off by
 * default. Off: today's page, start panel and editor, unchanged. On (with the new look): the home
 * with one "New proposal" card (recent calls and pipeline companies as one-tap starts), the
 * document opening at once with everything Merlin knows filled in (lib/proposals/quick.ts), only
 * "What we heard" and "What I recommend" written live by Merlin's AI, the side rail, and one Send
 * sheet. Read on the server only; the app learns it from ProposalsView.v2 and Me.proposals2.
 */
export const proposals2On = (): boolean => /^(1|on|true|yes)$/i.test((typeof process !== "undefined" ? process.env.RN_PROPOSALS2 : "") ?? "");
