/**
 * Messages in the new look (app/post/messages, Messages.dc.html): the kinds, filters and words
 * (app/post/messages/model.ts), Draft with Merlin from a template in the member's voice
 * (lib/messagesDraft.ts), and drafting with Merlin's AI behind the switch, Close, the member's
 * agreement and their AI usage (lib/messagesAi.ts, app/api/messages). Made-up data only, in a
 * temporary data dir; the AI service is a fake on a made-up address and nothing leaves the machine.
 *
 *   npx tsx scripts/test-messages2.mts
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-messages2-"));
const seed = {
  builtAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@northwind.example", title: "Fractional VP Sales", token: "tok-jordan-0001" },
    { id: "mem_rita", name: "Rita Okafor", email: "rita@halcyon.example", title: "Fractional CRO", token: "tok-rita-0001" },
  ],
  companies: [
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Health Care" } },
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarandpine.example", industry: "SaaS" } },
  ],
  engagements: [
    { id: "e_north_rita", companyId: "c_north", fields: { source: "Published engagement", operator: "Rita Okafor", role: "Fractional CRO", function: "Sales", start: "2025-01", end: "2026-10", status: "Ended" } },
    { id: "e_cedar_rita", companyId: "c_cedar", fields: { source: "Published engagement", operator: "Rita Okafor", role: "Fractional CRO", function: "Sales", start: "2024-01", status: "Active" } },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const now = new Date().toISOString();
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: { "c_north.identity": ["mem_jordan"] },
    seen: { mem_jordan: now, mem_rita: now },
    conversations: [
      // About a seat at a company Jordan has open (Northwind Clinics), and one at a company still locked for him (Cedar and Pine).
      { id: "cv_open", a: "mem_jordan", b: "mem_rita", about: { companyId: "c_north", engagementId: "e_north_rita" }, messages: [{ id: "m1", by: "mem_jordan", at: ago(60), text: "Hi Rita, would you introduce me at Northwind Clinics?" }, { id: "m2", by: "mem_rita", at: ago(30), text: "Happy to. Reach me at rita@halcyon.example if easier." }], readAt: { a: ago(50) }, status: "open", createdAt: ago(60) },
      { id: "cv_locked", a: "mem_rita", b: "mem_jordan", about: { companyId: "c_cedar", engagementId: "e_cedar_rita" }, messages: [{ id: "m3", by: "mem_rita", at: ago(20), text: "I saw your seat there. How do they buy?" }], readAt: {}, status: "open", createdAt: ago(20) },
    ],
  }),
);
Object.assign(process.env, { RN_DATA_DIR: dir, RN_INTEL_SEED: path.join(dir, "intel-seed.json"), RN_STARTER_CREDITS: "25", RN_LOGO_LOOKUP: "off", RN_SCAN_TEST: "1" });
for (const k of ["RN_EMAIL_API_URL", "RESEND_API_KEY", "RN_DIGEST", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_BILLING", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_AI_MODEL", "ANTHROPIC_BASE_URL", "RN_AI_TEST_BASE_URL"]) delete process.env[k];

// The fake AI service: what it was asked, and what it answers next.
const AI_BASE = "http://127.0.0.1:7059/fake-ai";
const aiCalls: string[] = [];
let aiText = "Thanks, Rita. I will write to the CEO this week — and copy you. Mail me at jordan@northwind.example or see https://northwind.example.";
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(AI_BASE)) {
    const raw = init?.body ?? (input instanceof Request ? await input.text() : "");
    aiCalls.push(typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer));
    const body = { id: "msg_1", type: "message", role: "assistant", model: "made-up-model", stop_reason: "end_turn", content: [{ type: "text", text: aiText }], usage: { input_tokens: 800, output_tokens: 60 } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "request-id": "req_fake" } });
  }
  throw new Error(`no outside calls in this test: ${url.slice(0, 40)}`);
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail !== undefined ? `\n     ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}` : ""}`);
};
const refused = async (p: Promise<unknown>): Promise<{ message: string; status: number } | null> => {
  try {
    await p;
    return null;
  } catch (e) {
    const x = e as { message: string; status?: number };
    return { message: x.message, status: x.status ?? 0 };
  }
};
/** Plain words: no exclamation marks, no dashes as punctuation. */
const plain = (s: string) => !/!/.test(s) && !/\s[—–-]\s/.test(s) && !/—/.test(s);

const M = await import("../app/post/messages/model");
const D = await import("../lib/messagesDraft");
const { HIDDEN_COMPANY } = await import("../lib/tableFields");

/* ---------- the kinds and the filters ---------- */
console.log("\nKinds, filters and words");
type Conv = import("../lib/tableTypes").ConversationRec;
const conv = (o: Partial<Conv> & { id: string }): Conv => ({
  started: true,
  with: { id: "m_x", name: "Rita Okafor", first: "Rita", title: "Fractional CRO" },
  about: { companyId: "c1", engagementId: "e1", company: "Halcyon Freight", seat: "Fractional CRO", years: "2025 to 2026" },
  messages: [{ id: "x", mine: false, at: ago(1), text: "Sent. I copied you." }],
  unread: 0,
  status: "open",
  canSend: true,
  updatedAt: ago(1),
  ...o,
});
const lead = (o: Partial<import("../lib/peersCore").LeadRec>) => ({ id: "lp1", side: "to-you", who: { id: "m_p", name: "Priya Natarajan", first: "Priya" }, company: "c9", name: null, kind: "Robotics company of 51–200 people", role: null, rate: null, line: "x", note: "", from: "record", at: ago(5), status: "new", conversationId: "cv_lead", ...o }) as import("../lib/peersCore").LeadRec;
const list: Conv[] = [
  conv({ id: "cv_intro", unread: 1 }),
  conv({ id: "cv_q", started: false }),
  conv({ id: "cv_lead", kind: "partners", about: { companyId: "", engagementId: "", company: "", seat: null, years: null } }),
  conv({ id: "cv_peer", kind: "partners", about: { companyId: "", engagementId: "", company: "", seat: null, years: null } }),
  conv({ id: "cv_team", kind: "team", about: { companyId: "c3", engagementId: "", company: "Larkspur Learning", seat: null, years: null } }),
  conv({ id: "cv_inv", kind: "invite" }),
  conv({ id: "cv_closed", status: "closed", closedBy: "them", canSend: false }),
  conv({ id: "cv_block", blocked: true, status: "closed", closedBy: "you", canSend: false }),
  conv({ id: "cv_locked", about: { companyId: "c4", engagementId: "e4", company: HIDDEN_COMPANY, seat: "Fractional CMO", years: null } }),
];
const intros = M.introsByConversation([{ id: "in1", side: "asked", company: "c1", name: "Halcyon Freight", who: "Rita", member: true, status: "asked", askedAt: ago(9), conversation: "cv_intro" }] as never);
const leads = M.leadsByConversation([lead({ id: "old", at: ago(500), status: "taken" }), lead({ id: "new", at: ago(5) })]);
const ctx = { intros, leads, drafts: new Set(["cv_q"]) };
const kinds = Object.fromEntries(list.map((c) => [c.id, M.kindOf(c, ctx)]));
check("an intro logged on a seat conversation reads Intro request; without one, Question", kinds.cv_intro === "intro" && kinds.cv_q === "q" && kinds.cv_locked === "q", kinds);
check("a lead passed in a fellow fractionals' conversation reads Lead passed; none, Fellow fractional", kinds.cv_lead === "lead" && kinds.cv_peer === "peer", kinds);
check("a team thread and an invite keep their own kinds", kinds.cv_team === "team" && kinds.cv_inv === "invite");
check("the newest lead in a conversation is the one it shows", leads.get("cv_lead")?.id === "new");
const counts = M.filterCounts(list, ctx);
check("filter counts: all, unread, intros, leads, questions, teams, peers (with invites), drafts, closed (with blocked)", counts.all === 9 && counts.unread === 1 && counts.intro === 1 && counts.lead === 1 && counts.q === 4 && counts.team === 1 && counts.peer === 2 && counts.draft === 1 && counts.closed === 2, counts);
check("the search reads names and companies, never a locked company's name", M.matches("halcyon", list[0]) && M.matches("rita", list[0]) && !M.matches("cedar", list[8]) && M.companyWords(list[8]) === "A locked company");
check("a locked lead reads as its free facts", M.companyWords(list[2], leads.get("cv_lead")) === "A locked Robotics company of 51–200 people");
check("the list head counts conversations and unread", M.listHead(list) === "9 conversations · 1 unread" && M.listHead([]) === "No conversations yet");
const lines = list.flatMap((c) => [M.aboutLine(c, M.kindOf(c, ctx), leads.get(c.id)), M.contextLine(c, M.kindOf(c, ctx), leads.get(c.id)), M.rowAbout(c, M.kindOf(c, ctx), leads.get(c.id))]);
check("every line is plain words, never the hidden placeholder", lines.every(plain) && !lines.some((l) => l.includes(HIDDEN_COMPANY)), lines.filter((l) => !plain(l) || l.includes(HIDDEN_COMPANY)));
check("about a seat: whose seat it is, by who started it", M.aboutLine(list[0], "intro") === "About their Fractional CRO seat at Halcyon Freight, 2025 to 2026." && M.aboutLine(list[1], "q") === "About your Fractional CRO seat at Halcyon Freight, 2025 to 2026.");
check("a lead passed to you says it opened for you alone", M.contextLine(list[2], "lead", leads.get("cv_lead")).includes("is open for you, free, and for nobody else"));
const cn = M.closedNote(list[6]);
check("not taking intros: said plainly, nothing wrong with the note, other ways in offered", cn?.text === "Rita is not taking intros right now. Nothing is wrong with your note." && cn.alt === true, cn);
check("blocked and Not now say so", /^You blocked Rita\./.test(M.closedNote(list[7])!.text) && /^You said not now\./.test(M.closedNote(conv({ id: "y", status: "closed", closedBy: "you" }))!.text) && M.closedNote(list[0]) === null);
check("a draft kept here shows as Draft on its row", M.lastLine(list[1], "My draft") === "Draft: My draft" && M.lastLine(list[0]) === "Sent. I copied you." && M.lastLine(conv({ id: "z", messages: [{ id: "r", mine: true, at: now, text: "", removed: true }] })) === "You: An admin removed this message.");
check("the example rows are labelled examples, one for each reason, and name nobody", M.EXAMPLE_ROWS.length === 3 && M.EXAMPLE_ROWS.every((e) => e.example === true) && M.EXAMPLE_ROWS.map((e) => e.reason).join() === "intro,lead,q" && !M.EXAMPLE_ROWS.some((e) => /[A-Z][a-z]+ [A-Z][a-z]+/.test(e.about)));
check("lead status words", M.leadStatus(lead({ status: "new" })) === "Waiting for you" && M.leadStatus(lead({ side: "from-you", status: "taken" })) === "Taken" && M.leadStatus(lead({ side: "from-you", status: "declined" })) === "Passed on");

/* ---------- Draft with Merlin: the template in the member's voice ---------- */
console.log("\nDraft with Merlin, from a template");
const me = { first: "Jordan", name: "Jordan Avery", title: "Fractional VP Sales", clients: "software companies of 11 to 500 people" };
const intro = D.draftMessage({ reason: "intro", to: "Rita", me, seat: "the fractional CRO seat", company: "Halcyon Freight" });
check("an intro request: their first name, the seat and company, the ask", intro.startsWith("Hi Rita, I saw you held the fractional CRO seat at Halcyon Freight.") && /introducing me to the person who hires there\?$/.test(intro), intro);
const lockedDraft = D.draftMessage({ reason: "intro", to: "Rita", me, seat: "the fractional CRO seat", company: null });
check("a company still locked is never named: 'a company on my list'", lockedDraft.includes("at a company on my list") && !lockedDraft.includes("Halcyon"), lockedDraft);
const v = { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "medium", formality: "casual", contractions: false, exclamations: "never", emoji: true, opener: "direct", phrases: ["Talk soon"] } as const;
const voiced = D.draftMessage({ reason: "q", to: "Rita", me, seat: "the fractional CRO seat", company: "Halcyon Freight" }, v as never);
check("in their voice: their greeting, no contractions, their closing phrase, their sign-off, no emoji in a chat", voiced.startsWith("Hey Rita,") && voiced.includes("I am talking") && !/I'm/.test(voiced) && voiced.includes("Talk soon.") && voiced.endsWith("Cheers,\nJordan") && !/🙂/.test(voiced), voiced);
const shorter = D.draftMessage({ reason: "q", to: "Rita", me, seat: "the fractional CRO seat", company: "Halcyon Freight" }, null, true);
const long = D.draftMessage({ reason: "q", to: "Rita", me, seat: "the fractional CRO seat", company: "Halcyon Freight" });
check("Shorter is shorter", shorter.length < long.length && shorter.includes("first 90 days"), [shorter, long]);
const all = (["intro", "lead", "q", "peer"] as const).flatMap((r) => [D.draftMessage({ reason: r, to: "Rita", me, seat: "the seat", company: "Halcyon Freight" }), D.draftMessage({ reason: r, to: "Rita", me, seat: "the seat", company: "Halcyon Freight" }, null, true)]);
const replies = (["intro", "lead", "q", "team", "peer", "invite"] as const).flatMap((k) => [true, false].map((mine) => D.draftMessage({ reason: "reply", to: "Rita", me, kind: k, mine, company: k === "team" ? "Larkspur Learning" : null, lead: k === "lead" ? { side: "in", taken: mine } : null })));
check("every draft is plain words, under 2,000 characters, without an address or a rate", [...all, ...replies].every((t) => plain(t) && t.length <= 2000 && !/@|\$\d/.test(t)), [...all, ...replies].find((t) => !plain(t)));
check("a reply about a locked company never names it", !replies.some((t) => /Halcyon|null|undefined/.test(t)));
const words = [D.draftWords({ ai: true, voiced: true }), D.draftWords({ ai: false, voiced: true }), D.draftWords({ ai: false, voiced: false })];
check("the drafted line says how it was written, Merlin never named after its service", /Merlin's AI/.test(words[0]) && /No AI allowance used/.test(words[1]) && words.every((w) => !/Claude|Anthropic/i.test(w) && /never reads your email/.test(w)));

/* ---------- Draft with Merlin's AI ---------- */
console.log("\nDraft with Merlin's AI");
const T = await import("../lib/table");
const A = await import("../lib/messagesAi");
const J = "tok-jordan-0001";
const off = await A.messageAiView(J);
check("off by default: the composer uses the template", off.ai === "off" && off.agreed === false);
const r0 = await refused(A.draftReply(J, { conversationId: "cv_open" }));
check("  and a draft request is refused with 409, nothing sent", r0?.status === 409 && aiCalls.length === 0, r0);
Object.assign(process.env, { RN_AI_DRAFTS: "1", ANTHROPIC_API_KEY: "sk-made-up-messages", RN_AI_MODEL: "made-up-model", RN_AI_TEST_BASE_URL: AI_BASE });
const on = await A.messageAiView(J);
check("on (billing off counts as Close): on, not yet agreed", on.ai === "on" && on.agreed === false && !/Claude|Anthropic/.test(on.consent), on);
const ask = await refused(A.draftReply(J, { conversationId: "cv_open" }));
check("asks to agree first (428), and nothing went out", ask?.status === 428 && aiCalls.length === 0, ask);
const notMine = await refused(A.draftReply("tok-rita-0001", { conversationId: "cv_nope", agree: true }));
check("a conversation that isn't theirs: 404", notMine?.status === 404, notMine);
const d1 = await A.draftReply(J, { conversationId: "cv_open", agree: true });
check("with the agreement: one request, the draft back", aiCalls.length === 1 && d1.text.length > 0 && d1.ai.agreed === true, d1);
check("  the draft is cleaned: no email address, no link, no dash as punctuation", !/@|https?:|—/.test(d1.text) && /write to the CEO this week\. and copy you/.test(d1.text), d1.text);
check("  the request carries the conversation's words but no email address of either member", aiCalls[0].includes("would you introduce me at Northwind Clinics") && !aiCalls[0].includes("jordan@northwind.example") && aiCalls[0].includes("made-up-model"), aiCalls[0].slice(0, 300));
await A.draftReply(J, { conversationId: "cv_locked" });
check("  a company still locked for the member is never named to the AI", aiCalls.length === 2 && !aiCalls[1].includes("Cedar and Pine") && aiCalls[1].includes("a company still locked for you"), aiCalls[1]?.slice(0, 400));
const s1 = await T.loadState();
check("  the agreement and the usage are kept, never a word of the draft", !!s1.messageAi?.mem_jordan && (s1.aiUsage?.mem_jordan?.log?.length ?? 0) === 2 && !JSON.stringify(s1).includes("write to the CEO this week"));
aiText = "";
const empty = await refused(A.draftReply(J, { conversationId: "cv_open" }));
check("an empty answer is refused, and not charged", empty?.status === 502 && ((await T.loadState()).aiUsage?.mem_jordan?.log?.length ?? 0) === 2, empty);
check("cleanDraft keeps plain words", A.cleanDraft("**Thanks** — talk soon. Call +1 555 010 0199.") === "Thanks. talk soon. Call .", A.cleanDraft("**Thanks** — talk soon. Call +1 555 010 0199."));

console.log("\nThe route");
const { GET, POST } = await import("../app/api/messages/route");
const { NextRequest } = await import("next/server");
const req = (method: string, tok: string, body?: unknown) =>
  new NextRequest("https://post.example.com/api/messages", { method, headers: { cookie: `rn_table=${tok}`, "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const g = await GET(req("GET", J));
check("GET: the view", g.status === 200 && (await g.json()).ai === "on");
check("signed out: 401", (await GET(req("GET", "nobody"))).status === 401 && (await POST(req("POST", "nobody", { op: "draft" }))).status === 401);
check("an unknown op: 400", (await POST(req("POST", J, { op: "nope" }))).status === 400);
aiText = "Thanks, Rita.";
const pr = await POST(req("POST", J, { op: "draft", conversationId: "cv_open", short: true }));
check("POST draft: 200 with the text", pr.status === 200 && (await pr.json()).text === "Thanks, Rita.");

console.log("\nClosing an account");
const sExp = await T.exportState();
check("the admin export leaves the agreement out", !("messageAi" in sExp));
await T.tableInternals.mutate((s, sd) => void T.tableInternals.purgeMember(s, sd, "mem_jordan", new Date().toISOString()));
check("closing the account deletes the agreement", !(await T.loadState()).messageAi?.mem_jordan);

console.log("\nThe page's source");
const root = path.resolve(import.meta.dirname, "..");
const src = (f: string) => readFileSync(path.join(root, f), "utf8");
const page = src("app/post/messages/Messages2.tsx");
const strings = page.match(/"[^"\n]*"|`[^`\n]*`|>[^<>{}\n]+</g) ?? [];
check("the UI never names Claude or Anthropic", !strings.some((x) => /Claude|Anthropic/.test(x)));
check("the old look keeps its page and its empty state; the new look is drawn only with ui2", /<EmptyState spot="noMessages" title="No messages yet"/.test(src("app/post/Messages.tsx")) && /app\?\.ui2 \? <Messages2 \/> : <MessagesOld/.test(src("app/post/Messages.tsx")));
check("unlock and send asks once before any credit (askSpend, then unlock asked: true)", /askSpend\(\{ cost, what: spendWhat\(needNow\)/.test(page) && /ui\.unlock\(needNow, \{ asked: true \}\)/.test(page));
check("drafts live in this browser only, every storage call wrapped", /localStorage\.getItem/.test(src("app/post/messages/drafts.ts")) && (src("app/post/messages/drafts.ts").match(/try \{/g) ?? []).length >= 2 && !/fetch\(/.test(src("app/post/messages/drafts.ts")));
check("reading a conversation tells the rail and the bell (tellUnread)", /message\.read/.test(page) && /tellUnread\(r\.unread\)/.test(page));
check("no export or download anywhere on the page", !/download|export CSV|\.csv/i.test(page));

rmSync(dir, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
