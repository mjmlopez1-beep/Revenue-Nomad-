/**
 * Checks of what joins the four Close pieces together (the parts each one left for the others):
 *
 *   npx tsx scripts/test-close-merge.mts
 *
 * In process on a made-up seed (Jordan Avery in the trial, so on Close; Fred Free after it; Cedar
 * and Pine Software, signer Dana Whitfield), billing live with made-up Stripe settings, email and
 * Slack to fake endpoints, a fake Granola API on 127.0.0.1 and a fake Anthropic API, fetch replaced.
 *
 *  1. Granola into "start from the call": off, nothing Granola-specific (the status, the slot, the
 *     connector); on, a call picked in the picker's own calls is read and drafted with the fake AI,
 *     the transcript kept nowhere; the connector's granola_note_id through the real resolver, Close only.
 *  2. Tracking on the client's page: options are options (data-option with the name), sections
 *     carry their own titles, a pick and an add-on land in the member's activity under the
 *     proposal's own names, the notice is on the page, the signed copy and the document's pages,
 *     a download of the signed PDF is told (and nothing else once it is signed).
 *  3. The client's question and hand-off reach the member's alerts through the store's own hooks.
 *  4. The three signature modes: none, now, and countersign (told to countersign, then Signed);
 *     one Signed alert each, the pipeline to Won exactly once at the fully signed moment, the
 *     renewal clock from then.
 *  5. A link with no end date: null in the send, 0 in the token, read by the beacon, no reminder
 *     before it closes, "No end date" in the words, never expired.
 *  6. The reminder switches as the send sheets save them, for a proposal and a document.
 *  7. The connector: pricing options, the link's length, the member's signature mode, the tools.
 *  8. The member's saved signature on a contract they sign last (the contracts flow).
 *  9. Wording, the plan rows and the legal versions.
 * 10. Account closure deletes every new store, and the admin export has none of them.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import Module, { register } from "node:module";

// The pages import CSS: nothing here.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const dir = mkdtempSync(path.join(tmpdir(), "rn-close-merge-"));
const DAY = 86_400_000;
const HOUR = 3_600_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const root = path.join(import.meta.dirname, "..");
const src = (f: string) => readFileSync(path.join(root, f), "utf8");

const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "Software", employees: "51–200", revenue: "$5M–$20M", hq: "Denver, CO" } });
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.merge@example.com`, title, token: `tok-${id.slice(4)}-merge` });
const members = [member("mem_jor", "Jordan Avery", "Fractional CRO"), member("mem_fre", "Fred Free", "Fractional VP Sales"), member("mem_oth", "Oona Other", "Fractional CMO")];
writeFileSync(
  path.join(dir, "intel-seed.json"),
  JSON.stringify({ builtAt: iso(-60 * DAY), members, companies: [co("c_cedar", "Cedar and Pine Software", "cedarpine.example"), co("c_larch", "Larchfield Robotics", "larchfield.example"), co("c_birch", "Birchwater Health", "birchwater.example"), co("c_alder", "Alder Lane Studio", "alderlane.example")], engagements: [], contacts: [] }),
);
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: Object.fromEntries(["c_cedar", "c_larch", "c_birch", "c_alder"].map((c) => [`${c}.identity`, ["mem_jor"]])),
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jor: { function: "Sales", title: "Fractional CRO", onboarded: true }, mem_fre: { function: "Sales", onboarded: true }, mem_oth: { function: "Marketing", onboarded: true } },
    // Jordan and Oona: Close for the whole run (it reaches past a trial's 21 days). Fred: after his trial, on Free.
    billing: { members: { mem_jor: { ...trial, trialEndsAt: iso(400 * DAY) }, mem_oth: { ...trial, trialEndsAt: iso(400 * DAY) }, mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
    integrations: {
      members: { mem_jor: { slack: { kind: "slack", url: "https://hooks.slack.com/services/T000/B000/madeup", addedAt: iso(-DAY) }, alerts: { roles: true, message: true, seat: true, radar: true }, lastSent: {}, pending: {} } },
      stats: { sent: {}, failed: 0, connects: 1, removes: 0 },
    },
  }),
);

/* ---------- the fake Granola: one call today with Dana at Cedar and Pine ---------- */
const GKEY = "grn_goodkey_jordan_abcd";
const FKEY = "grn_goodkey_fred_wxyz";
const NOTE = "not_cedar000000001";
const SAID = "our win rate fell to 14 percent MERGESECRETLINE";
const owner = { name: "Jordan Avery", email: "jor.merge@example.com" };
const callAt = t0 - 2 * HOUR;
const lines: [string, "me" | "them", string][] = [
  ["Jordan Avery", "me", "Thanks for making the time, Dana."],
  ["", "them", `Happy to. The short version is ${SAID}, and the team is new.`],
  ["", "them", "We want to get to $8M next year. Two days a week sounds right, at $11,000 a month for six months."],
  ["", "me", "That works. I'll send the proposal to you at dana@cedarpine.example."],
];
const items = () => lines.map(([name, who, text], i) => ({ speaker: { source: who === "me" ? "microphone" : "speaker", attribution: who, ...(name ? { name } : {}) }, text, start_time: new Date(callAt + i * 10 * 60_000).toISOString(), end_time: new Date(callAt + i * 10 * 60_000 + 60_000).toISOString() }));
const noteJson = (withT: boolean) => ({
  id: NOTE,
  object: "note",
  title: "Cedar and Pine pricing MERGESECRETTITLE",
  owner,
  created_at: new Date(callAt).toISOString(),
  updated_at: new Date(callAt + HOUR).toISOString(),
  deleted_at: null,
  calendar_event: { event_title: "x", invitees: [{ email: owner.email }, { email: "dana@cedarpine.example" }], organiser: owner.email, calendar_event_id: "ev_1", scheduled_start_time: new Date(callAt).toISOString(), scheduled_end_time: new Date(callAt + 45 * 60_000).toISOString() },
  attachments: [],
  attendees: [owner, { name: "Dana Whitfield", email: "dana@cedarpine.example" }],
  folder_membership: [],
  summary_text: "Summary MERGESECRETSUMMARY",
  summary_markdown: null,
  private_notes_text: null,
  private_notes_markdown: null,
  transcript: withT ? items() : null,
});
const granolaAsked: string[] = [];
const granola = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const u = new URL(req.url ?? "/", "http://x");
  let raw = "";
  for await (const ch of req) raw += ch;
  const key = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  granolaAsked.push(`${req.method} ${u.pathname}${u.search}`);
  const send = (status: number, body: unknown) => (res.writeHead(status, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
  if (key !== GKEY && key !== FKEY) return send(401, { code: "INVALID_API_KEY", message: "x" });
  const head = { id: NOTE, object: "note", title: "x", owner, created_at: new Date(callAt).toISOString(), updated_at: new Date(callAt).toISOString(), deleted_at: null };
  if (u.pathname === "/v1/notes" && req.method === "GET") return send(200, { notes: [head], hasMore: false, cursor: null });
  if (u.pathname === "/v1/notes/search" && req.method === "POST") return send(200, { notes: [{ ...head, meeting_at: head.created_at }], hasMore: false, cursor: null, completion_status: "exhausted" });
  if (u.pathname === `/v1/notes/${NOTE}`) return send(200, noteJson(u.searchParams.get("include") === "transcript"));
  if (u.pathname === `/v1/notes/${NOTE}/transcript`) return send(200, { transcript: items(), hasMore: false, cursor: null });
  return send(404, { code: "NOT_FOUND", message: "x" });
});
await new Promise<void>((r) => granola.listen(0, "127.0.0.1", () => r()));
const GRANOLA = `http://127.0.0.1:${(granola.address() as AddressInfo).port}`;
const AI_BASE = "http://127.0.0.1:7059/fake-anthropic";

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-close-merge",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_merge",
  STRIPE_WEBHOOK_SECRET: "whsec_test_merge",
  STRIPE_PRICE_MONTH: "price_month_merge",
  STRIPE_PRICE_YEAR: "price_year_merge",
  RESEND_API_KEY: "test-key-merge",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
  RN_GRANOLA_API_TEST: GRANOLA,
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_AI_MODEL", "RN_AI_TEST_BASE_URL", "RN_GRANOLA", "RN_SEAL_KEY"]) delete process.env[k];

type Mail = { to: string; subject: string; text: string; html: string };
const mails: Mail[] = [];
const slack: { text: string; blocks: unknown[] }[] = [];
const aiCalls: { messages: { content: string }[]; system: string }[] = [];
let aiAnswer: () => unknown = () => ({});
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(GRANOLA)) return realFetch(input, init);
  if (url.startsWith(AI_BASE)) {
    const raw = init?.body ?? (input instanceof Request ? await input.text() : "{}");
    aiCalls.push(JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer)));
    return new Response(JSON.stringify(aiAnswer()), { status: 200, headers: { "content-type": "application/json", "request-id": "req_fake" } });
  }
  if (url === "http://127.0.0.1:9/fake-email") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html });
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  }
  if (url.startsWith("https://hooks.slack.com/")) {
    slack.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response("ok", { status: 200 });
  }
  return new Response("{}", { status: 200 });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 900)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { status?: number }) => `${e.status ?? ""} ${e.message}`.trim());

/** A small PNG drawn here (a signature), as a data URL. */
function png(w = 60, h = 16, seed = 3): string {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0), ihdr.writeUInt32BE(h, 4), (ihdr[8] = 8), (ihdr[9] = 6);
  const rows = Buffer.concat(Array.from({ length: h }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, (_, x) => Buffer.from((x + y * seed) % 7 === 0 ? [10, 26, 19, 255] : [0, 0, 0, 0])))])));
  const b = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${b.toString("base64")}`;
}

async function main() {
  const T = await import("../lib/table");
  const PS = await import("../lib/proposals/store");
  const DS = await import("../lib/documents/store");
  const SM = await import("../lib/documents/smart");
  const SA = await import("../lib/documents/samples");
  const C = await import("../lib/close/server");
  const CT = await import("../lib/close/types");
  const RN = await import("../lib/close/renewal");
  const MS = await import("../lib/proposals/memberSig");
  const H = await import("../lib/proposals/pipelineHook");
  const G = await import("../lib/granola");
  const MG = await import("../lib/mcp/granola");
  const MP = await import("../lib/mcp/proposals");
  const MSV = await import("../lib/mcp/server");
  const DRF = await import("../lib/proposals/draft");
  const CP = await import("../lib/billing/compare");
  const ACC = await import("../lib/account");
  const LG = await import("../app/legal/LegalShell");
  const React = await import("react");
  // The pages use the automatic JSX runtime; tsx here compiles to React.createElement.
  (globalThis as unknown as { React: typeof React }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const PV = await import("../app/sign/ProposalView");
  const ACT = await import("../app/sign/activity");

  const BASE = "https://post.example.com";
  const JOR = "tok-jor-merge";
  const FRE = "tok-fre-merge";
  const who = { ip: "203.0.113.9", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148" };
  const pub = (id: string) => T.tableInternals.pubId(id);
  const CEDAR = pub("c_cedar");
  const settle = () => C.closeSettled();
  const lastTo = (to: string) => [...mails].reverse().find((m) => m.to === to);
  const signTok = (t: string) => t.match(/\/sign\/((?:s|ds)_[^\s"<]+)/)?.[1] ?? "";
  const jctx = { member: (await T.memberForToken(JOR))!, origin: BASE };
  const fctx = { member: (await T.memberForToken(FRE))!, origin: BASE };
  const stageOf = async (c: string) => ((await T.loadState()).pipeline?.mem_jor?.entries ?? []).find((e) => e.companyId === c)?.stage ?? null;
  // Every move the proposals and documents ask of the pipeline, counted, then done for real.
  const pipe: { kind: string; company: string; at: string }[] = [];
  H.setPipelineHook((st, memberId, companyId, kind, at, from) => (pipe.push({ kind, company: companyId, at }), H.proposalToPipeline(st, memberId, companyId, kind, at, from)));
  const wonMoves = (c: string) => pipe.filter((e) => e.kind === "signed" && e.company === c).length;
  const blocks = [
    { id: "s1", blockId: "custom", title: "Summary", body: "A plan for the next 90 days." },
    { id: "s2", blockId: "custom", title: "Your situation", body: "Pipeline is thin." },
    { id: "s3", blockId: "custom", title: "Terms", body: "Three months to start. 30 days notice." },
  ];
  const signer = { name: "Dana Whitfield", email: "dana@cedarpine.example", title: "COO" };
  /** The email code on this link: asked for, then typed (asking, passing on and declining need it, as signing does). */
  const confirmed = async (tok: string, email: string, nowMs: number) => {
    await PS.requestCode(tok, who, nowMs);
    return PS.verifyCode(tok, lastTo(email)?.text.match(/Your code: (\d{6})/)?.[1] ?? "", who, BASE, nowMs);
  };
  /** The client's steps to a signature on this link: the code, then their name. */
  const clientSigns = async (tok: string, email: string, name: string, nowMs: number, choice?: unknown) => {
    await PS.requestCode(tok, who, nowMs);
    const code = lastTo(email)?.text.match(/Your code: (\d{6})/)?.[1] ?? "";
    const v = await PS.verifyCode(tok, code, who, BASE, nowMs);
    return PS.signProposal(tok, { name, consent: true, hash: v.hash, ...(choice ? { choice } : {}) }, who, BASE, nowMs);
  };

  /* ================= 1. Granola into "start from the call" ================= */
  console.log("\n1. Granola into start from the call");
  check("off: the status says off, so the app passes no Granola slot", (await G.granolaStatus(JOR))?.on === false);
  const proposalsSrc = src("app/post/Proposals.tsx");
  const startSrc = src("app/post/ProposalStart.tsx");
  check("  the picker is rendered into the start sheet's slot only while Granola is on", /granolaSlot=\{\s*granola\.status\?\.on\s*\?/.test(proposalsSrc) && /<GranolaCallPicker/.test(proposalsSrc) && /useGranola\(\)/.test(proposalsSrc));
  check("  without the slot the sheet shows no Granola card and starts on paste", /\{granolaSlot && card\("granola", "From Granola"/.test(startSrc) && /useState<Source>\(granolaSlot && granolaFirst \? "granola" : "paste"\)/.test(startSrc) && !/Connect Granola in Integrations/.test(startSrc));
  check("  paste, drop and what was agreed stay", /card\("paste", "Paste or drop a transcript"/.test(startSrc) && /card\("agreed", "Tell Merlin what was agreed"/.test(startSrc) && /onPaste: \(\) => \(setSrc\("paste"\)/.test(startSrc));
  check("  the picker hands back the transcript, who was on it, when and the note's id", /onPick=\{\(c\) => o\.onPick\(\{ transcript: c\.text, attendees: c\.attendees\.map/.test(proposalsSrc) && /noteId: c\.noteId, when: c\.when/.test(proposalsSrc));
  check("off: the connector refuses a Granola note id in words", /pass its text as transcript/.test((await refused(MP.draftFromCall(jctx, { granola_note_id: NOTE }))) ?? ""));
  check("off: list_granola_calls isn't registered", !Object.keys((MSV.makeServer(jctx) as unknown as { _registeredTools: Record<string, unknown> })._registeredTools).includes("list_granola_calls"));

  process.env.RN_GRANOLA = "1";
  check("on, not connected: the status says so (the picker offers Connect Granola and Paste a transcript instead)", (await G.granolaStatus(JOR))?.on === true && (await G.granolaStatus(JOR))?.connected === false && /Paste a transcript instead/.test(src("app/post/GranolaCallPicker.tsx")));
  await G.connectGranola(JOR, GKEY);
  const st = await G.granolaStatus(JOR);
  check("connected, on Close: the picker can draft", st?.connected === true && st.canDraft === true);
  const calls = await G.granolaCalls(JOR, { companyId: CEDAR });
  check("the picker's calls for the company: today's call with Dana, no title", calls.calls.length === 1 && calls.calls[0].noteId === NOTE && calls.calls[0].with.some((p) => p.email === "dana@cedarpine.example") && !JSON.stringify(calls).includes("MERGESECRETTITLE"), calls);
  const picked = await G.transcriptForPicker(JOR, NOTE);
  check("picking it reads the transcript, then", picked.text.includes(SAID) && picked.attendees.some((a) => a.name === "Dana Whitfield"));
  // What Proposals.tsx hands the start sheet (CallPick), then what the sheet sends to draft.
  const callPick = { transcript: picked.text, attendees: picked.attendees.map((a) => ({ name: a.name || undefined, email: a.email || undefined })), noteId: picked.noteId, when: picked.when };
  Object.assign(process.env, { RN_AI_DRAFTS: "1", ANTHROPIC_API_KEY: "sk-ant-test-fake", RN_AI_MODEL: "model-from-the-env", RN_AI_TEST_BASE_URL: AI_BASE });
  const draftJson = {
    title: "Fractional sales leader for Cedar and Pine Software",
    blocks: [
      { block_id: "cover", title: "Prepared for Dana Whitfield", body: "Prepared for Dana Whitfield, Cedar and Pine Software.\nPrepared by Jordan Avery." },
      { block_id: "what_we_heard", title: "What we heard", body: "You want to get to $8M next year.\n- The win rate fell." },
      { block_id: "investment", title: "Investment", body: "$11,000 a month for two days a week, for six months." },
    ],
    fields: { monthly_fee: "$11,000", step_down_fee: "", allocation: "two days a week", initial_months: "6", notice_days: "", goal: "Get to $8M next year", call_date: "", next_step: "" },
    signer: { name: "Dana Whitfield", title: "", email: "dana@cedarpine.example" },
    signer_on_call: "yes",
    notes: [],
    to_fix: [],
  };
  aiAnswer = () => ({ id: "msg_fake", type: "message", role: "assistant", model: "model-from-the-env", content: [{ type: "text", text: JSON.stringify(draftJson) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 600 } });
  const drafted = await DRF.draftWithClaude(JOR, { templateId: "fractional-sales-leader", companyId: CEDAR, transcript: callPick.transcript, callDate: callPick.when.slice(0, 10), callWith: callPick.attendees[0]?.name, agree: true }, BASE);
  check("drafted from the picked call: one request to the fake AI, with the call in it", aiCalls.length === 1 && aiCalls[0].messages[0].content.includes(SAID), aiCalls.length);
  check("  a draft is saved for the company, its signer from the call", drafted.proposal.company.id === CEDAR && drafted.proposal.signer?.email === "dana@cedarpine.example" && drafted.proposal.blocks.length === 3, drafted.proposal.signer);
  const stateText = () => readFileSync(path.join(dir, "intel.json"), "utf8");
  check("  nothing of the call is kept: not the transcript, the title or the summary; only the sealed key", !stateText().includes("MERGESECRETLINE") && !stateText().includes("MERGESECRETTITLE") && !stateText().includes("MERGESECRETSUMMARY") && !stateText().includes(GKEY) && /"granola"/.test(stateText()));
  check("a member not on Close can connect, but not draft from a call", (await G.connectGranola(FRE, FKEY)).status.connected === true && /403 Drafting a proposal from a call is on Close/.test((await refused(G.transcriptForPicker(FRE, NOTE))) ?? ""));
  // The connector: the resolver lib/mcp/granola.ts sets is the real one (Granola on, connected, Close).
  MP.setGranolaTranscript(MG.granolaForDraft);
  const viaTool = await MP.draftFromCall(jctx, { granola_note_id: NOTE, company_name: "Cedar and Pine Software" });
  check("the connector: draft_proposal_from_call with a granola_note_id reads the call through Merlin's Granola connection", viaTool.saved === true && viaTool.transcript_kept === false && (await PS.getProposal(JOR, String(viaTool.proposal_id), BASE)).signer?.email === "dana@cedarpine.example", viaTool);
  check("  Close only: a Free member's note id is refused", /Close/.test((await refused(MG.granolaForDraft("mem_fre", NOTE))) ?? "") && /Close/.test((await refused(MP.draftFromCall(fctx, { granola_note_id: NOTE }))) ?? ""));
  const toolsOn = Object.keys((MSV.makeServer(jctx) as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);
  check("  the connector's tools with Granola on: C1's three, C4's one, and the rest", ["draft_proposal_from_call", "change_proposal", "send_document_for_signature", "list_granola_calls", "create_or_update_proposal", "send_proposal_for_signature"].every((t) => toolsOn.includes(t)) && toolsOn.length === 30, toolsOn.length); // ways_in now registers with ways in on (RN_PATHS), not only with Google
  for (const k of ["RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_AI_MODEL", "RN_AI_TEST_BASE_URL"]) delete process.env[k];

  /* ================= 2. tracking on the client's page ================= */
  console.log("\n2. tracking on the client's page");
  const pricing = {
    options: [
      { id: "o_adv", name: "Advisor", price: 6000, billing: "month", included: ["Weekly pipeline review"] },
      { id: "o_op", name: "Operator", price: 12000, billing: "month", included: ["Weekly pipeline review", "Two days a week"], recommended: true },
      { id: "o_full", name: "Full program", price: 18000, billing: "month", included: ["Weekly pipeline review", "Two days a week", "Hiring"] },
    ],
    addOns: [{ id: "a_hire", name: "Sales hiring", price: 4000, billing: "once" }],
  };
  let opt = await PS.createProposal(JOR, { companyId: pub("c_larch"), title: "Sales leadership for Larchfield", blocks, fields: { "pricing.monthlyFee": "$12,000", "term.initialMonths": "3" } }, BASE);
  opt = await PS.updateProposal(JOR, opt.id, { pricing }, BASE);
  opt = (await PS.sendProposal(JOR, opt.id, { signer: { name: "Dana Whitfield", email: "dana@larchfield.example", title: "COO" }, memberSign: "none" }, BASE, t0)).proposal;
  const otok = signTok(lastTo("dana@larchfield.example")?.text ?? "");
  const ov = await PS.signerView(otok, who, BASE, t0 + HOUR);
  const html = renderToStaticMarkup(React.createElement(PV.ProposalView, { doc: ov.doc, choice: null, openUntil: ov.expiresAt, canSign: true, onPick: () => {}, onAddOn: () => {}, sign: React.createElement(ACT.ActivityNotice, { sender: ov.doc.from.name }) }));
  check("the client's page: each option is an option for the reading hook, with its name", ["o_adv", "o_op", "o_full"].every((id) => html.includes(`data-section="option-${id}"`) && html.includes(`data-option="${id}"`)) && html.includes('data-option-title="Operator"'), html.match(/<button[^>]*data-option[^>]*>/g));
  check("  each section the member wrote carries its own title", ["Summary", "Your situation"].every((t) => html.includes(`data-section-title="${t}"`)) && html.includes('data-section-title="Timeline and investment"'));
  check("  a group that only holds others, and a part of one (an add-on's row), are marked so they aren't counted as sections", /data-section="scope" data-section-group=""/.test(html) && /data-section="addon-a_hire" data-section-part=""/.test(html));
  check("  the notice the client reads is on the page", html.includes("Jordan Avery sees when this is opened and which sections are read.") && html.includes('data-activity-notice="open"'));
  const signSrc = src("app/sign/Sign.tsx");
  const hookSrc = src("app/sign/activity.tsx");
  check("the signing page tells a pick, an add-on and a download", /track\.picked\(c\.optionId, d\.pricing\.options\.find/.test(signSrc) && /track\.addon\(a\.id, now, a\.name\)/.test(signSrc) && /onClick=\{\(\) => track\.downloaded\(\)\}/.test(signSrc));
  check("  the hook reads data-option, skips groups and parts, and takes the inner of two sections", /querySelectorAll<HTMLElement>\("\[data-option\]"\)/.test(hookSrc) && /data-section-group/.test(hookSrc) && /data-section-part/.test(hookSrc) && /c\.x\.el\.contains\(o\.x\.el\)/.test(hookSrc));
  check("  the notice is on the proposal page, the signed copy, the document's signing page and its signed copy", /<ActivityNotice sender=\{d\.from\.name\} \/>/.test(signSrc) && /<ActivityNotice sender=\{d\.from\.name\} signed \/>/.test(src("app/signed/[token]/page.tsx")) && /<ActivityNotice sender=\{v\.from\.name\} \/>/.test(src("app/sign/DocSign.tsx")) && /<ActivityNotice sender=\{c\.from\.name\} signed \/>/.test(src("app/signed/DocCopy.tsx")));
  const cookie = "A".repeat(22);
  const beacon = (token: string, events: unknown, nowMs: number, o: { cookie?: string | null; memberToken?: string | null } = {}) => C.recordBeacon({ token, events, cookie: o.cookie === undefined ? cookie : o.cookie, ua: who.ua, memberToken: o.memberToken ?? null }, nowMs);
  await beacon(otok, [{ t: "open" }], t0 + HOUR);
  // What the page sends as they read and choose: time on a section and an option, a pick (the page's label is whatever it likes), an add-on.
  await beacon(otok, [{ t: "sec", id: "custom", label: "Summary", ms: 12_000 }, { t: "opt", id: "o_op", label: "Operator", ms: 9_000 }], t0 + HOUR + 30_000);
  await beacon(otok, [{ t: "pick", id: "o_op", label: "made up by the page" }, { t: "addon", id: "a_hire", on: true, label: "x" }], t0 + HOUR + 40_000);
  await PS.chooseOption(otok, { optionId: "o_op", addOnIds: ["a_hire"] }, BASE, t0 + HOUR + 40_000);
  await settle();
  let av = await C.activityView(JOR, opt.id, BASE, t0 + HOUR + MINUTE);
  check("the member's activity: the option picked, under the proposal's own name", av.stats.option === "Operator" && av.options.some((o) => o.id === "o_op" && o.label === "Operator" && o.picks === 1), av.options);
  check("  the add-on chosen, under its own name, and the section read under its title", av.addons.some((a) => a.label === "Sales hiring" && a.on) && av.sections.some((x) => x.label === "Summary" && x.ms >= 10_000), [av.addons, av.sections]);
  // They sign that choice: Signed once, Won once (the member doesn't sign this one).
  let sq = slack.length;
  const signedView = await clientSigns(otok, "dana@larchfield.example", "Dana Whitfield", t0 + 2 * HOUR, { optionId: "o_op", addOnIds: ["a_hire"] });
  await C.afterSignerStep(otok, BASE, t0 + 2 * HOUR);
  await settle();
  const signedAlerts = slack.slice(sq).filter((x) => x.text.startsWith("Signed"));
  check("signed with no signature from the member: one Signed alert, naming the option, Moved to Won", signedAlerts.length === 1 && /Operator/.test(JSON.stringify(signedAlerts[0])) && /Moved to Won/.test(JSON.stringify(signedAlerts[0].blocks)), slack.slice(sq).map((x) => x.text));
  check("  the pipeline moved to Won once", wonMoves("c_larch") === 1 && (await stageOf("c_larch")) === "won", pipe);
  // Once signed nothing is read: only a download of the signed PDF, from the signing page or the signed copy.
  const copyTok = signedView.copyUrl!.split("/signed/")[1];
  check("signed: the page shows the sealed PDF to download", !!signedView.sealed?.pdf);
  const afterSign = await beacon(otok, [{ t: "open" }, { t: "sec", id: "custom", ms: 20_000 }], t0 + 3 * HOUR);
  check("signed: reading is no longer counted", afterSign.body.off === true && (await C.activityView(JOR, opt.id, BASE, t0 + 3 * HOUR)).sections.find((x) => x.label === "Summary")?.ms === av.sections.find((x) => x.label === "Summary")?.ms);
  const dl1 = await beacon(otok, [{ t: "dl" }], t0 + 3 * HOUR);
  const dl2 = await beacon(copyTok, [{ t: "dl" }], t0 + 4 * HOUR, { cookie: null });
  const dlMine = await beacon(copyTok, [{ t: "dl" }], t0 + 5 * HOUR, { memberToken: JOR });
  av = await C.activityView(JOR, opt.id, BASE, t0 + 6 * HOUR);
  const state1 = await T.loadState();
  check("signed: a download of the signed PDF is told, from the signing page and from the signed copy's link", dl1.status === 200 && !dl1.body.off && dl2.status === 200 && !dl2.body.off && !!dl2.cookie && state1.close?.items?.[opt.id]?.downloads.length === 2, state1.close?.items?.[opt.id]?.downloads);
  check("  the member's own download isn't counted, and the timeline says the signed PDF", dlMine.body.off === true && av.timeline.some((x) => x.text === "Dana downloaded the signed PDF") && av.timeline.some((x) => x.text === "Someone downloaded the signed PDF"), av.timeline.map((x) => x.text));
  check("  a made-up link is refused", (await beacon("s_nothere.abc.def", [{ t: "dl" }], t0)).status === 404);
  const signedCopyHtml = renderToStaticMarkup(React.createElement(PV.SealCard, { at: iso(0), signers: ["Dana Whitfield"], events: 5, pdf: "/api/sign/pdf?c=x", check: "/check", track: copyTok }));
  check("  the signed copy's seal card: the tracked download, and the signed notice's words", signedCopyHtml.includes("data-tracked-download") && CT.signedDisclosureText("Jordan Avery") === "Jordan Avery sees when the signed PDF is downloaded from this page. Merlin counts this with a cookie on this page, never your IP address.");
  check("the renewal clock runs from the signature: 3 months on", av.renewal?.end === RN.addMonths(new Date(t0 + 2 * HOUR).toISOString().slice(0, 10), 3), av.renewal);

  /* ================= 3. a question and a hand-off reach the alerts ================= */
  console.log("\n3. a question, passed on");
  let cs = await PS.createProposal(JOR, { companyId: CEDAR, title: "Revenue operations reset", blocks, fields: { "pricing.monthlyFee": "$9,000", "term.initialMonths": "3" } }, BASE);
  cs = (await PS.sendProposal(JOR, cs.id, { signer, memberSign: "after" }, BASE, t0)).proposal;
  const cstok = signTok(lastTo("dana@cedarpine.example")?.text ?? "");
  await confirmed(cstok, "dana@cedarpine.example", t0 + DAY);
  sq = slack.length;
  await PS.askQuestion(cstok, "Can we start in January?", who, BASE, t0 + DAY);
  await settle();
  const q = slack.slice(sq).find((x) => /asked a question/.test(x.text));
  check("the client asks a question on the page: the member's alert, the question quoted", !!q && q.text.startsWith("Dana Whitfield asked a question about Revenue operations reset") && JSON.stringify(q.blocks).includes("Can we start in January?"), slack.slice(sq).map((x) => x.text));
  check("  in the bell too, and the question itself came by email", (await C.inboxView(JOR)).items.some((x) => x.head === "Question:" && x.kind === "question") && mails.some((m) => m.to === "jor.merge@example.com" && /Can we start in January/.test(m.text)));
  sq = slack.length;
  await PS.handOff(cstok, { signer: { name: "Sam Lee", email: "sam@cedarpine.example", title: "CEO" }, note: "Yours to sign." }, who, BASE, t0 + 2 * DAY);
  await settle();
  check("the client passes it on: Dana Whitfield passed it to Sam Lee to sign", slack.slice(sq).some((x) => x.text.startsWith("Dana Whitfield passed Revenue operations reset to Sam Lee to sign")) && (await C.inboxView(JOR)).items.some((x) => x.head === "Passed on:" && x.text === "Dana to Sam Lee"), slack.slice(sq).map((x) => x.text));
  const samTok = signTok(lastTo("sam@cedarpine.example")?.text ?? "");
  check("  the new signer has their own link, the old one is read only", !!samTok && samTok !== cstok && (await PS.signerView(cstok, who, BASE, t0 + 2 * DAY)).status === "passed");
  check("  a custom hook still replaces the defaults (and they go back)", await (async () => {
    const seen: string[] = [];
    PS.setProposalHooks({ onClientQuestion: (e) => void seen.push(e.text) });
    await confirmed(samTok, "sam@cedarpine.example", t0 + 2 * DAY + HOUR);
    const n = slack.length;
    await PS.askQuestion(samTok, "One more thing?", who, BASE, t0 + 2 * DAY + HOUR);
    await settle();
    PS.setProposalHooks(C.closeHooks);
    return seen.join() === "One more thing?" && !slack.slice(n).some((x) => /asked a question/.test(x.text));
  })());

  /* ================= 4. countersign: told, then Signed and Won once ================= */
  console.log("\n4. the three ways the member signs");
  sq = slack.length;
  const wonBefore = wonMoves("c_cedar");
  const csSigned = await clientSigns(samTok, "sam@cedarpine.example", "Sam Lee", t0 + 3 * DAY);
  await C.afterSignerStep(samTok, BASE, t0 + 3 * DAY);
  await settle();
  check("countersign mode, the client signs: Sam Lee signed. Countersign to finish., once", slack.slice(sq).filter((x) => x.text.startsWith("Sam Lee signed. Countersign to finish.")).length === 1 && csSigned.awaitingMember === true, slack.slice(sq).map((x) => x.text));
  check("  no Signed alert yet, the pipeline hasn't moved to Won, no renewal clock", !slack.slice(sq).some((x) => x.text.startsWith("Signed")) && wonMoves("c_cedar") === wonBefore && (await stageOf("c_cedar")) === "proposal" && (await C.activityView(JOR, cs.id, BASE, t0 + 3 * DAY + HOUR)).renewal === null);
  check("  the member's status line and bell say whose turn it is", (await C.activityView(JOR, cs.id, BASE, t0 + 3 * DAY + HOUR)).statusWords === "Signed by Sam · countersign to finish" && (await C.inboxView(JOR)).items.some((x) => x.kind === "countersign"));
  sq = slack.length;
  const fullAt = t0 + 5 * DAY;
  const done = await PS.countersignProposal(JOR, cs.id, { method: "typed", typed: "Jordan Avery", consent: true }, BASE, fullAt);
  await C.afterSignerStep(samTok, BASE, fullAt);
  await C.afterFullySigned(cs.id, { origin: BASE }, fullAt);
  await PS.countersignProposal(JOR, cs.id, { method: "typed", typed: "Jordan Avery", consent: true }, BASE, fullAt + HOUR);
  await settle();
  check("the member countersigns: Signed, Moved to Won, told once whatever asks again", slack.slice(sq).filter((x) => x.text.startsWith("Signed")).length === 1 && /Moved to Won/.test(JSON.stringify(slack.slice(sq).find((x) => x.text.startsWith("Signed"))?.blocks)) && done.send?.status === "signed" && done.send.waiting === null, slack.slice(sq).map((x) => x.text));
  check("  the pipeline moved to Won exactly once, at the countersignature", wonMoves("c_cedar") === wonBefore + 1 && pipe.filter((e) => e.kind === "signed" && e.company === "c_cedar").at(-1)?.at === new Date(fullAt).toISOString() && (await stageOf("c_cedar")) === "won", pipe.filter((e) => e.company === "c_cedar"));
  const csv = await C.activityView(JOR, cs.id, BASE, fullAt + 2 * HOUR);
  check("  the renewal clock starts at the countersignature (fullySignedAt), not the client's signature", csv.renewal?.end === RN.addMonths(new Date(fullAt).toISOString().slice(0, 10), 3) && PS.fullySignedAt((await T.loadState()).proposals!.find((p) => p.id === cs.id)!.sends.find((x) => x.signed)!) === new Date(fullAt).toISOString(), csv.renewal);
  // Signed as it goes out, with a saved signature: the client's signature finishes it.
  await MS.setMySignature(JOR, { method: "drawn", png: png(), consent: true }, BASE);
  let now1 = await PS.createProposal(JOR, { companyId: pub("c_birch"), title: "Pipeline review for Birchwater", blocks, fields: { "pricing.monthlyFee": "$7,000", "term.initialMonths": "6" } }, BASE);
  now1 = (await PS.sendProposal(JOR, now1.id, { signer: { name: "Dana Whitfield", email: "dana@birchwater.example" }, memberSign: "now" }, BASE, t0)).proposal;
  const ntok = signTok(lastTo("dana@birchwater.example")?.text ?? "");
  sq = slack.length;
  await clientSigns(ntok, "dana@birchwater.example", "Dana Whitfield", t0 + DAY);
  await C.afterSignerStep(ntok, BASE, t0 + DAY);
  await settle();
  check("signed as it went out: the client's signature finishes it. One Signed alert, Won once, no countersign alert", slack.slice(sq).filter((x) => x.text.startsWith("Signed")).length === 1 && !slack.slice(sq).some((x) => /Countersign/.test(x.text)) && wonMoves("c_birch") === 1 && (await stageOf("c_birch")) === "won", slack.slice(sq).map((x) => x.text));
  check("  the sign route's own step and the store's hook never both tell it (source: one done list)", /if \(t\.x\.signed && \(awaitingMember\(t\.x\)/.test(src("lib/close/server.ts")) && /proposalHooks\.onSigned\(\{ \.\.\.signedFacts, state: "client_signed" \}\)/.test(src("lib/proposals/store.ts")) && /state: "fully_signed"/.test(src("lib/proposals/store.ts")));

  /* ================= 5. a link with no end date ================= */
  console.log("\n5. no end date");
  let ne = await PS.createProposal(JOR, { companyId: pub("c_alder"), title: "Advisory for Alder Lane", blocks, fields: { "pricing.monthlyFee": "$5,000", "term.initialMonths": "3" } }, BASE);
  const sentNe = await PS.sendProposal(JOR, ne.id, { signer: { name: "Dana Whitfield", email: "dana@alderlane.example" }, memberSign: "none", linkDays: 0 }, BASE, t0);
  ne = sentNe.proposal;
  const netok = signTok(lastTo("dana@alderlane.example")?.text ?? "");
  check("sent with no end date: null in the send, 0 in the link's token, said in the answer and the email", ne.send?.expiresAt === null && netok.split(".")[1] === "0" && C.NO_END_TOKEN_MS === 0 && /The link has no end date\./.test(sentNe.message) && /The link has no end date\./.test(lastTo("dana@alderlane.example")?.text ?? ""), [ne.send?.expiresAt, netok.split(".")[1]]);
  check("  the two sides read the end the same way", CT.linkEnd(null) === null && CT.linkEnd(undefined) === null && !CT.linkExpired(null, t0 + 4000 * DAY) && PS.expMsOf(null) === C.NO_END_TOKEN_MS && CT.NO_END_WORDS === "No end date");
  const neBeacon = await beacon(netok, [{ t: "open" }], t0 + HOUR, { cookie: "N".repeat(22) });
  check("  the reading beacon accepts its token", neBeacon.status === 200 && !neBeacon.body.off && (await T.loadState()).close?.items?.[ne.id]?.readers.length === 1, neBeacon);
  const nev = await C.activityView(JOR, ne.id, BASE, t0 + 2 * HOUR);
  check("  no reminder before the link closes: day 2 and day 7 only", nev.expiresAt === null && nev.reminders.map((r) => r.key).join() === "d2,d7", nev.reminders);
  const mailsBefore = mails.length;
  for (const d of [2, 7, 28, 60, 400]) await C.closeTick(BASE, t0 + d * DAY + HOUR);
  await settle();
  const neMails = mails.slice(mailsBefore).filter((m) => m.to === "dana@alderlane.example");
  check("  over 400 days: the day 7 reminder goes (it was opened), never one about the link closing, and it never expires", neMails.length === 1 && !neMails.some((m) => /closes on/.test(m.text)) && (await PS.getProposal(JOR, ne.id, BASE, t0 + 400 * DAY)).status !== "expired" && (await PS.signerView(netok, who, BASE, t0 + 400 * DAY)).status === "open", neMails.map((m) => m.subject));
  const neHtml = renderToStaticMarkup(React.createElement(PV.ProposalView, { doc: (await PS.signerView(netok, who, BASE, t0 + DAY)).doc, choice: null, openUntil: "none", canSign: true, sign: null }));
  check("  the words: No end date on the client's page, the member's panel and the pickers", neHtml.includes("No end date") && /NO_END_WORDS/.test(src("app/post/Activity.tsx")) && /0: "No end date"/.test(src("lib/proposals/types.ts")) && /"No end date"/.test(src("app/sign/DocSign.tsx")));

  /* ================= 6. the reminder switches in the send sheets ================= */
  console.log("\n6. reminder switches");
  let rp = await PS.createProposal(JOR, { companyName: "Quillstone Partners", title: "Quillstone plan", blocks, fields: { "pricing.monthlyFee": "$8,000" } }, BASE);
  check("a draft: every reminder on to start with", JSON.stringify((await C.activityView(JOR, rp.id, BASE)).remindersOn) === JSON.stringify({ d2: true, d7: true, expiry: true }));
  // What the send sheet posts just before it sends: POST /api/activity { op: "reminders", id, d2, d7, expiry }.
  const { NextRequest } = await import("next/server");
  const route = await import("../app/api/activity/route");
  const post = async (token: string, body: unknown) => {
    const r = await route.POST(new NextRequest("https://post.example.com/api/activity", { method: "POST", headers: { cookie: `rn_table=${token}`, "content-type": "application/json", origin: "https://post.example.com", host: "post.example.com" }, body: JSON.stringify(body) }), {} as never);
    return { status: r.status, json: (await r.json()) as { remindersOn?: Record<string, boolean>; error?: string } };
  };
  const saved = await post(JOR, { op: "reminders", id: rp.id, d2: false, d7: true, expiry: false });
  check("saved from the send sheet through /api/activity, before it is sent", saved.status === 200 && JSON.stringify(saved.json.remindersOn) === JSON.stringify({ d2: false, d7: true, expiry: false }), saved);
  check("  Close only: a member on Free gets the upgrade", (await post(FRE, { op: "reminders", id: rp.id, d2: false })).status !== 200);
  rp = (await PS.sendProposal(JOR, rp.id, { signer: { name: "Dana Whitfield", email: "dana@quillstone.example" }, memberSign: "none", linkDays: 14 }, BASE, t0)).proposal;
  const rv = await C.activityView(JOR, rp.id, BASE, t0 + HOUR);
  check("  sent: day 2 and the warning are off, day 7 planned (a 14-day link has all three)", rv.reminders.map((r) => `${r.key}:${r.state}`).join() === "d2:off,d7:planned,expiry:off", rv.reminders);
  const before6 = mails.length;
  for (const d of [2, 7, 12]) await C.closeTick(BASE, t0 + d * DAY + HOUR);
  await settle();
  const rem = mails.slice(before6).filter((m) => m.to === "dana@quillstone.example");
  check("  only the day 7 reminder goes out", rem.length === 1 && /Following up on this/.test(rem[0].text), rem.map((m) => m.text.slice(0, 80)));
  const sheets = { proposal: src("app/post/ProposalParts.tsx"), doc: src("app/post/DocBuilder.tsx"), contracts: src("app/post/contracts/ContractsHome.tsx"), sr: src("app/post/SendReminders.tsx") };
  const savesFirst = (s: string) => s.indexOf("await saveReminders(") > 0 && s.indexOf("await saveReminders(") < s.indexOf('op: "send"') && /<SendReminders value=\{rem\} onChange=\{setRem\} noEnd=\{days === 0\}/.test(s);
  check("the three switches are in the proposal's send sheet, the document's and the contracts review, each saved before the send", savesFirst(sheets.proposal) && savesFirst(sheets.doc) && savesFirst(sheets.contracts));
  check("  they post { op: \"reminders\", id, d2, d7, expiry }, in the mockup's words, with no warning for a link with no end date", /op: "reminders", id, d2: choice\.d2, d7: choice\.d7, expiry: choice\.expiry/.test(sheets.sr) && /filter\(\(k\) => !\(noEnd && k === "expiry"\)\)/.test(sheets.sr) && (await import("../lib/close/reminders")).REMINDER_SAY.d2.why === "Remind them if it's not opened in 2 days");
  check("  the contracts review no longer promises what isn't kept: the days are in the switches", !/Reminders on day 2 and day 7 if it isn't signed/.test(sheets.contracts) && /You'll get an alert when \$\{first\} opens it, and when it's signed\./.test(sheets.contracts));

  /* ================= 7. the connector ================= */
  console.log("\n7. the connector");
  const made = await MP.createOrUpdateProposal(jctx, {
    company_name: "Quillstone Partners",
    title: "Quillstone, three ways",
    blocks: [{ block_id: "custom", title: "Summary", body: "Three ways to work together." }],
    pricing: { options: [{ name: "Advisor", price: 6000 }, { name: "Operator", price: 12000, recommended: true, included: ["Two days a week"] }, { name: "Full program", price: 18000 }], add_ons: [{ name: "Sales hiring", price: 4000, billing: "once" }] },
    link_days: 60,
  });
  const madeP = await PS.getProposal(JOR, String(made.proposal_id), BASE);
  check("create_or_update_proposal takes pricing and the link's length", made.saved === true && madeP.pricing?.options.length === 3 && madeP.pricing.addOns[0].billing === "once" && madeP.linkDays === 60 && made.link_days === 60 && (made.pricing as { options: { price: string }[] }).options[1].price === "$12,000 a month", [made.pricing, made.link_days]);
  const again = await MP.createOrUpdateProposal(jctx, { proposal_id: madeP.id, pricing: { options: [{ name: "Advisor", price: 6500 }, { name: "Operator", price: 12000 }] }, link_days: 0 });
  const againP = await PS.getProposal(JOR, madeP.id, BASE);
  check("  an option named as before keeps its id; the set is replaced; 0 is no end date", againP.pricing?.options.length === 2 && againP.pricing.options[0].id === madeP.pricing!.options[0].id && againP.pricing.options[0].price === 6500 && againP.pricing.addOns.length === 0 && again.link_days === "No end date", againP.pricing);
  check("  too many options, a price that isn't one, and a length that isn't offered are refused in words", /at most 3 options/.test((await refused(MP.createOrUpdateProposal(jctx, { proposal_id: madeP.id, pricing: { options: [1, 2, 3, 4].map((n) => ({ name: `O${n}`, price: 1000 })) } }))) ?? "") && /14, 30, 60 or 90 days, or no end date/.test((await refused(MP.createOrUpdateProposal(jctx, { proposal_id: madeP.id, link_days: 45 }))) ?? "") && (await PS.getProposal(JOR, madeP.id, BASE)).pricing?.options.length === 2);
  check("  null goes back to one price", (await MP.createOrUpdateProposal(jctx, { proposal_id: madeP.id, pricing: null })).pricing === undefined && (await PS.getProposal(JOR, madeP.id, BASE)).pricing === null);
  await MP.createOrUpdateProposal(jctx, { proposal_id: madeP.id, pricing: { options: [{ name: "Advisor", price: 6500 }, { name: "Operator", price: 12000 }] } });
  const ask = await MP.sendForSignature(jctx, { proposal_id: madeP.id, signer_name: "Dana Whitfield", signer_email: "dana@quillstone.example", my_signature: "after" });
  const would = ask.would_send as { link: string; members_signature: string; the_client_picks_from: string[] };
  check("send_proposal_for_signature asks first: the link's length, how the member signs, what the client picks from", ask.confirmed === false && would.link === "No end date" && /countersigns on Merlin/.test(would.members_signature) && would.the_client_picks_from.join("|") === "Advisor, $6,500 a month|Operator, $12,000 a month", would);
  const yes = await MP.sendForSignature(jctx, { proposal_id: madeP.id, signer_name: "Dana Whitfield", signer_email: "dana@quillstone.example", my_signature: "after", link_days: 90, confirm: true });
  const sentP = await PS.getProposal(JOR, madeP.id, BASE);
  check("  with confirm: sent, the link 90 days, the member countersigns after", yes.confirmed === true && yes.link === "Works for 90 days" && sentP.send?.memberMode === "after" && Math.round((Date.parse(sentP.send.expiresAt!) - Date.now()) / DAY) === 90, [yes, sentP.send?.expiresAt]);
  check("the instructions and the tools say so", /pass pricing there instead of one price/.test(MSV.INSTRUCTIONS) && /link_days: 14, 30, 60 or 90, or 0 for no end date/.test(MSV.INSTRUCTIONS) && /list_granola_calls is among your tools/.test(MSV.INSTRUCTIONS) && /granola_note_id/.test(MSV.INSTRUCTIONS));

  /* ================= 8. the member's saved signature on a contract they sign last ================= */
  console.log("\n8. the saved signature in the contracts flow");
  const up = await DS.uploadDocument(JOR, SA.SAMPLE_NAME["two-column"], await SA.makeSamplePdf("two-column", { member: "Jordan Avery" }), BASE);
  const read = await SM.readContract(JOR, up.id, BASE);
  const plan = read.reading;
  check("the contract is read: the other party first, the member last", plan.found && plan.signers.length === 2 && plan.signers[1].me === true && plan.signers[0].me !== true, plan.signers);
  // What the contracts review saves and sends (ContractsHome.tsx save, then send with the link's length and the switches).
  await DS.updateDocument(JOR, up.id, { title: plan.title, message: plan.message, ordered: true, signers: plan.signers.map((x) => ({ id: x.key, name: x.name || "Dana Whitfield", email: x.email || "dana@cedarpine.example", title: x.title || "CEO" })), fields: plan.fields.map((f) => (f.kind === "text" && f.label === "Title" ? { ...f, prefill: "CEO" } : f)), companyId: CEDAR, companyName: "Cedar and Pine Software" }, BASE);
  await C.setReminders(JOR, up.id, { d2: false, d7: true, expiry: true }, BASE);
  const tDoc = Date.now();
  const sentDoc = await DS.sendDocument(JOR, up.id, { message: plan.message, linkDays: 0 }, BASE, tDoc);
  check("sent from the review with no end date: the first signer only, said so", sentDoc.document.status === "sent" && sentDoc.document.expiresAt === null && /no end date/.test(sentDoc.message), sentDoc.message);
  const docView = await C.activityView(JOR, up.id, BASE, tDoc + HOUR);
  check("  its reminders: day 2 off as saved, day 7 planned, none before the link closes", docView.kind === "document" && docView.reminders.map((r) => `${r.key}:${r.state}`).join() === "d2:off,d7:planned", docView.reminders);
  const danaDoc = signTok(lastTo("dana@cedarpine.example")?.text ?? "");
  const signDoc = async (tok: string, email: string, name: string, how: Record<string, unknown>, me?: string) => {
    await DS.docRequestCode(tok, who, tDoc + HOUR);
    const code = lastTo(email)?.text.match(/(\d{6})/)?.[1] ?? "";
    const v = await DS.docVerifyCode(tok, code, who, BASE, tDoc + HOUR);
    const values = Object.fromEntries(v.fields.filter((f) => f.kind === "text").map((f) => [f.id, f.prefill || "Filled in"]));
    return DS.docSign(tok, { name, consent: true, hash: v.sha256, values, ...how }, who, BASE, tDoc + 2 * HOUR, me);
  };
  sq = slack.length;
  await signDoc(danaDoc, "dana@cedarpine.example", "Dana Whitfield", { method: "typed" });
  await C.afterSignerStep(danaDoc, BASE, tDoc + 2 * HOUR);
  const mine = await DS.myDocLink(JOR, up.id, BASE, tDoc + 2 * HOUR);
  const myTok = signTok(mine.link);
  check("the other party signs; it is the member's turn, with their own link", !!myTok && (await DS.getDocument(JOR, up.id, BASE)).status !== "signed" && !slack.slice(sq).some((x) => x.text.startsWith("Signed")));
  const savedSig = await DS.docSavedSignature(myTok, JOR);
  check("signed in to Merlin, the signing page offers Use my saved signature (the drawing they saved)", savedSig?.kind === "drawn" && !!savedSig.img && /Use my saved signature/.test(src("app/sign/DocSign.tsx")));
  check("  never for someone else: no sign-in, or another member's", (await DS.docSavedSignature(myTok, null)) === null && (await DS.docSavedSignature(myTok, FRE)) === null && (await DS.docSavedSignature(danaDoc, JOR)) === null);
  const wonDoc = wonMoves("c_cedar");
  await signDoc(myTok, "jor.merge@example.com", "Jordan Avery", { method: "saved" }, JOR);
  await C.afterSignerStep(myTok, BASE, tDoc + 2 * HOUR);
  await settle();
  const finished = await DS.getDocument(JOR, up.id, BASE);
  const trail = (await T.loadState()).documents!.find((d) => d.id === up.id)!;
  check("the member signs last with it in one click: complete, on the audit trail as their saved signature", finished.status === "signed" && trail.events.some((e) => e.kind === "signed" && /applied their saved signature \(drawn\)/.test(e.note ?? "")), trail.events.map((e) => e.note));
  check("  one Signed alert for the document, and the pipeline's Won asked for once", slack.slice(sq).filter((x) => x.text.startsWith("Signed")).length === 1 && wonMoves("c_cedar") === wonDoc + 1, slack.slice(sq).map((x) => x.text));
  const contractsSrc = sheets.contracts;
  check("  the contracts review shows it: the link's length, the saved signature to set, and that they sign last", /<LinkDaysPick value=\{days\} onChange=\{setDays\} \/>/.test(contractsSrc) && /<MySignature value=\{mySig\.sig\}/.test(contractsSrc) && /You sign last, after \$\{first\}\. Your saved signature goes on in one click: Use my saved signature\./.test(contractsSrc) && /op: "send", id: saved\.id, message, linkDays: days/.test(contractsSrc));
  check("  Send a contract to sign still opens the contracts home from Proposals", /<ContractsHome/.test(proposalsSrc) && /setContract\(true\)/.test(proposalsSrc));
  const docCopyTok = DS.docCopyToken(up.id);
  const docDl = await beacon(docCopyTok, [{ t: "dl" }], Date.now(), { cookie: null });
  check("  a download from the document's signed copy is told too", docDl.status === 200 && !docDl.body.off && (await T.loadState()).close?.items?.[up.id]?.downloads.length === 1);

  /* ================= 9. wording, the plan rows, the legal versions ================= */
  console.log("\n9. wording, plans and legal");
  const strip = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const mergedUi = ["app/post/SendReminders.tsx", "app/post/ProposalStart.tsx", "app/post/GranolaCallPicker.tsx", "app/post/contracts/ContractsHome.tsx", "app/sign/activity.tsx", "app/sign/ProposalView.tsx", "app/sign/Sign.tsx", "app/post/Activity.tsx"];
  check("Merlin's own AI features name neither Claude nor Anthropic in the merged screens", mergedUi.every((f) => !/Claude|Anthropic/.test(strip(f))), mergedUi.filter((f) => /Claude|Anthropic/.test(strip(f))));
  const names = CP.PLAN_ROWS.map((r) => r[0]);
  check("the plan rows: one set, no row twice, each Close row from the four pieces there once", new Set(names).size === names.length && ["Drop in a contract, fields placed for you", "Change it by talking", "Start from the call", "Know when they open it and what they read", "Reminders until they sign", "Renewal reminders", "Give them options to pick from", "Sealed PDF anyone can check"].every((w) => names.filter((n) => n === w).length === 1), names);
  check("  the landing page keeps its first six", CP.LANDING_ROWS.map((r) => r[0]).join("|") === "Opening companies|Fellow fractionals|Proposals and e-signature|Merlin drafting and your own contracts|Pipeline after a signature|Open roles");
  check("the Terms are 1.2 and the Privacy Policy 1.3, effective November 22, 2026", LG.TERMS_VERSION === "1.2" && LG.PRIVACY_VERSION === "1.3" && LG.LEGAL_EFFECTIVE === "2026-11-22");
  const terms = src("app/terms/Terms.tsx");
  const privacy = src("app/privacy/Privacy.tsx");
  const dataPage = src("app/data/DataFlows.tsx");
  const flows = src("docs/data-flows.md");
  const all4 = [terms, privacy, dataPage, flows];
  check("each of the four says: readers and the notice, reminders, the sealed PDF and /check, the member's signature, the link's length, Granola, Anthropic", [/opens it|opened/i, /remind/i, /seal/i, /\/check|Check a copy/, /saved signature|signature you save/i, /no end date/i, /Granola/, /Anthropic/].every((re) => all4.every((t) => re.test(t))), [/opens it|opened/i, /remind/i, /seal/i, /\/check|Check a copy/, /saved signature|signature you save/i, /no end date/i, /Granola/, /Anthropic/].map((re) => all4.map((t) => re.test(t))));
  check("  Granola: the key encrypted, the transcript read when a call is picked and not kept, off until switched on", /kept encrypted/.test(privacy) && /used to draft that one proposal, and not kept/.test(privacy) && /stays off until Revenue\s+Nomad switches it on/.test(privacy) && /off until Revenue Nomad switches it on/.test(terms) && /RN_GRANOLA=1/.test(flows) && /Only while the Granola feature is on/.test(dataPage));
  check("  the client's notice once signed is on the data page and in the doc", /signedDisclosureText\(\)/.test(dataPage) && /sees when the signed PDF is downloaded from this page/.test(flows));

  /* ================= 10. account closure and the export ================= */
  console.log("\n10. closure and the export");
  // An earlier version kept on a proposal (a change accepted through the connector).
  const ver = await PS.createProposal(JOR, { companyName: "Quillstone Partners", title: "Versions", blocks, fields: {} }, BASE);
  await MP.changeProposalTool(jctx, { proposal_id: ver.id, sections: [{ section_id: ver.blocks[0].id, title: "Summary", body: "A plan for the next 120 days. MERGEVERSIONLINE", summary: "is now 120 days." }], apply: true });
  const s2 = await T.loadState();
  const mySends = (s2.proposals ?? []).filter((p) => p.memberId === "mem_jor").flatMap((p) => p.sends);
  const sealedIds = mySends.filter((x) => x.seal).map((x) => x.id);
  const sigCopyIds = mySends.filter((x) => x.member?.kind === "drawn" && !x.seal).map((x) => x.id);
  const sendDir = (id: string) => path.join(dir, "proposals", id);
  const sigFile = path.join(dir, "members", "mem_jor", "signature.png");
  // A send that went out with the drawn signature and was never signed: its copy of the signature is a file too.
  let un = await PS.createProposal(JOR, { companyName: "Quillstone Partners", title: "Never signed", blocks, fields: {} }, BASE);
  un = (await PS.sendProposal(JOR, un.id, { signer: { name: "Dana Whitfield", email: "dana@quillstone.example" }, memberSign: "now" }, BASE)).proposal;
  const unId = un.send!.id;
  check("before: every new store holds something of theirs", !!s2.close?.items && Object.values(s2.close.items).some((a) => a.memberId === "mem_jor") && (s2.close.inbox.mem_jor?.length ?? 0) > 0 && !!s2.memberSignatures?.mem_jor && !!(s2 as unknown as { granola: Record<string, unknown> }).granola.mem_jor && (s2.proposals ?? []).some((p) => (p.versions?.length ?? 0) > 0) && sealedIds.length >= 3 && sealedIds.every((id) => existsSync(path.join(sendDir(id), "final.pdf"))) && existsSync(sigFile) && existsSync(path.join(sendDir(unId), "member-sig.png")) && existsSync(path.join(dir, "documents", up.id)), { sealedIds, sigCopyIds, unId });
  const ex = JSON.stringify(await T.exportState());
  check("the admin export has none of them: activity, notifications, signatures, the Granola key, proposals and their versions, documents", ["close", "memberSignatures", "granola", "proposals", "documents"].every((k) => !(k in ((JSON.parse(ex) as Record<string, unknown>) ?? {}))) && !ex.includes("MERGEVERSIONLINE") && !ex.includes("Can we start in January") && !ex.includes("dana@cedarpine.example"));
  await C.setPref(JOR, "open", "email", false);
  const closeAt = Date.now();
  await ACC.closeAccount(JOR, { nowMs: closeAt });
  check("closed: the Granola key goes at once", !(((await T.loadState()) as unknown as { granola?: Record<string, unknown> }).granola ?? {}).mem_jor);
  const n = await ACC.purgeDue(closeAt + 31 * DAY);
  const s3 = await T.loadState();
  const left = JSON.stringify(s3);
  check("30 days on, their personal data is deleted: the activity, the bell and the alert switches", n === 1 && !Object.values(s3.close?.items ?? {}).some((a) => a.memberId === "mem_jor") && !s3.close?.inbox.mem_jor && !s3.close?.prefs.mem_jor, [n, Object.keys(s3.close?.items ?? {})]);
  check("  the saved signature and its file, the Granola key, the proposals with their versions, the documents", !s3.memberSignatures?.mem_jor && !existsSync(sigFile) && !(s3 as unknown as { granola?: Record<string, unknown> }).granola?.mem_jor && !(s3.proposals ?? []).some((p) => p.memberId === "mem_jor") && !(s3.documents ?? []).some((d) => d.memberId === "mem_jor") && !left.includes("MERGEVERSIONLINE"));
  check("  the sealed PDFs, each send's copy of their signature (signed or not), and the documents' files", sealedIds.every((id) => !existsSync(sendDir(id))) && !existsSync(sendDir(unId)) && !existsSync(path.join(dir, "documents", up.id)), readdirSync(path.join(dir, "proposals")));
  check("  another member's key stays", !!(s3 as unknown as { granola?: Record<string, unknown> }).granola?.mem_fre);

  console.log(`\n${passes} passed, ${failures} failed`);
}
const MINUTE = 60_000;

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(() => {
    granola.close();
    process.exit(failures ? 1 : 0);
  });
