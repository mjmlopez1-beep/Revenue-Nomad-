/**
 * Checks of how Merlin turns a call into a proposal (RN_PROPOSALS2, propbrain): the call brief
 * (lib/proposals/brief.ts), the "Senior operator inside the business" family and its agreement
 * (operator.ts, operatorLib.ts), the brief pass (quick.ts writeSections), the deck view (deck.ts,
 * Deck.tsx, deck.css), the rate's days a week, and "Make a template from a proposal I've used"
 * (learn.ts).
 *
 *   npx tsx scripts/test-proposals-brain.mts
 *
 * In process on a made-up seed and a SYNTHETIC three-party call: Jordan Avery (the member, a firm
 * placing an operator) talks with Riley Chen (an operator candidate) about Halcyon Freight (CEO
 * Morgan Ellis; a CFO who joined in March; sales and marketing leaders five years in), with a
 * recorder header, audio trouble and small talk. A fake AI answers with a brief written for that
 * call. Nothing leaves the machine; no real call, transcript or member.
 *
 *  1. The call cleaned by rules: header, audio trouble and filler never reach anything.
 *  2. Rules only: conservative (no insight guessed from the talk; days a week only when said).
 *  3. The brief by Merlin's AI: who's who (client, decider, the member as the firm, the candidate),
 *     the prompt without noise, a number the call never said dropped, charged; each gate says why.
 *  4. A pasted call opens the Senior operator family with no empty boxes and no noise; no 40 hours.
 *  5. The pass writes the family's sections in order from the brief; the days a week from the call
 *     priced by the one calculation with What should I charge.
 *  6. The AI can't run: said plainly, only what is certain, no empty boxes, no noise.
 *  7. The deck view and its PDF print rules.
 *  8. The agreement from the same brief, sent through the Contracts flow.
 *  9. A template learned from a proposal the member sent: shown, edited, saved, theirs alone.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Module, { register } from "node:module";

(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const dir = mkdtempSync(path.join(tmpdir(), "rn-brain-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const root = path.join(import.meta.dirname, "..");
const src = (f: string) => readFileSync(path.join(root, f), "utf8");

const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.brain@example.com`, title, token: `tok-${id.slice(4)}-brain` });
const members = [member("mem_jor", "Jordan Avery", "Founder"), member("mem_sam", "Sam Okafor", "Fractional CRO"), member("mem_fre", "Fred Free", "Fractional VP Sales")];
writeFileSync(
  path.join(dir, "intel-seed.json"),
  JSON.stringify({ builtAt: iso(-60 * DAY), members, companies: [{ id: "c_hal", fields: { name: "Halcyon Freight", website: "halcyonfreight.example", industry: "Freight & Trucking", employees: "201–500", revenue: "$20M–$50M", hq: "Denver, CO" } }], engagements: [], contacts: [] }),
);
const bill = (live: boolean) => ({ trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(live ? 400 * DAY : -9 * DAY) });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: { "c_hal.identity": ["mem_jor", "mem_sam"] },
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jor: { function: "Sales", title: "Founder", firm: "Harbor Bench", onboarded: true }, mem_sam: { function: "Sales", title: "Fractional CRO", onboarded: true }, mem_fre: { function: "Sales", onboarded: true } },
    billing: { members: { mem_jor: bill(true), mem_sam: bill(true), mem_fre: bill(false) }, events: [], payments: [], ended: [] },
    aiDrafts: { mem_jor: iso(-5 * DAY), mem_sam: iso(-5 * DAY) },
    // An earlier proposal of Jordan's priced at 40 hours a week: it must never carry over.
    proposals: [
      { id: "pr_old0000000001", memberId: "mem_jor", companyId: null, companyPub: null, companyName: "Larkspur Learning", templateId: "fractional-sales-leader", title: "Old one", blocks: [], fields: { "pricing.allocation": "40 hours a week", "pricing.monthlyFee": "$30,000" }, sources: {}, notes: [], signerOnCall: null, signer: null, version: 1, createdAt: iso(-30 * DAY), updatedAt: iso(-30 * DAY), sends: [] },
    ],
  }),
);

import { BRIEF, CALL, LEARNED } from "./brain-fixture.mts";

const AI_BASE = "http://127.0.0.1:7061/fake-anthropic";
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-brain",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_brain",
  STRIPE_WEBHOOK_SECRET: "whsec_test_brain",
  STRIPE_PRICE_MONTH: "price_month_brain",
  STRIPE_PRICE_YEAR: "price_year_brain",
  RESEND_API_KEY: "test-key-brain",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
  RN_AI_DRAFTS: "1",
  ANTHROPIC_API_KEY: "sk-ant-test-fake",
  RN_AI_MODEL: "model-from-the-env",
  RN_AI_TEST_BASE_URL: AI_BASE,
  RN_PROPOSALS2: "1",
  RN_UI2: "on",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_RADAR", "RN_GOOGLE", "RN_GRANOLA", "RN_EMAIL_REPLY_TO", "RN_SEAL_KEY"]) delete process.env[k];

const aiCalls: { system: string; content: unknown; model: string }[] = [];
let aiFail = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(AI_BASE)) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    aiCalls.push({ system: body.system, content: body.messages?.[0]?.content, model: body.model });
    if (aiFail) return aiFail--, new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "x" } }), { status: 500, headers: { "content-type": "application/json" } });
    const answer = /reusable template/.test(body.system) ? LEARNED : BRIEF;
    return new Response(JSON.stringify({ id: "msg_fake", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify(answer) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 4000, output_tokens: 1500 } }), { status: 200, headers: { "content-type": "application/json", "request-id": "req_fake" } });
  }
  if (url.startsWith("http://127.0.0.1:9/")) return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  return realFetch(input, init);
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 900)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { status?: number }) => `${e.status ?? ""} ${e.message}`.trim());

const B = await import("../lib/proposals/brief.ts");
const Q = await import("../lib/proposals/quick.ts");
const S = await import("../lib/proposals/store.ts");
const L = await import("../lib/proposals/library.ts");
const D = await import("../lib/proposals/deck.ts");
const LR = await import("../lib/proposals/learn.ts");
const Rates = await import("../lib/proposals/rates.ts");
const CM = await import("../app/post/chargeModel.ts");
const OL = await import("../lib/proposals/operatorLib.ts");
const JOR = members[0].token;
const SAM = members[1].token;
const FRE = members[2].token;
const NOISE = /can you hear me|can't hear you|number I can call|look in the chat|is that you|Meeting participants|Meeting Title|how's that/i;
/** A document's text as the client would read it, with blanks as {{key}}. */
const docText = (p: { blocks: { title: string; body: string }[]; fields: Record<string, string> }) => p.blocks.map((b) => `${b.title}\n${L.fill(b.body, p.fields)}`).join("\n\n");

/* ---------- 1. the call cleaned by rules ---------- */
console.log("The call, cleaned by rules");
{
  const c = B.cleanCall(CALL);
  check("the recorder's header is gone (title, date, participants, Transcript:)", !/Meeting Title|Meeting participants|^Date:|Transcript:/m.test(c.text), c.text.slice(0, 200));
  check("audio trouble and scheduling chatter are gone", !NOISE.test(c.text), c.text.split("\n").filter((l) => NOISE.test(l)));
  check("filler turns are gone (Um, Uh)", !/^Riley Chen: Um,?$/m.test(c.text) && c.dropped >= 6, c.dropped);
  check("what matters stays: the flat meetings, the alternatives, the days a week", /flat for three quarters/.test(c.text) && /Apex Advisory/.test(c.text) && /two and a half days a week/.test(c.text));
  check("isNoise: audio lines yes, a business line no", B.isNoise("No, I still can't hear you.") && B.isNoise("Is there a number I can call you?") && B.isNoise("Um,") && !B.isNoise("New logo meetings have been flat for three quarters."));
  check("days a week only when said outright", B.daysPerWeekIn("two and a half days a week") === 2.5 && B.daysPerWeekIn("2 days per week") === 2 && B.daysPerWeekIn("why not go full-time") === null && B.daysPerWeekIn("40 hours a week") === null);
  check("a long call is read in parts of whole turns", B.chunksOf("a\nb\nc", 3).join("|") === "a\nb|c" && B.chunksOf("short", 100).length === 1);
}

/* ---------- 2. rules only: conservative ---------- */
console.log("\nRules only: what is certain");
{
  const r = B.briefByRules(CALL, { name: "Jordan Avery" }, { company: "Halcyon Freight" });
  check("no insight guessed from the talk", r.insights.length === 0 && !r.constraint && r.by === "rules");
  check("the days a week said outright are kept (2.5)", r.shape.daysPerWeek === 2.5 && r.shape.hoursPerWeek === 20);
  check("the next meeting's day, never a noise line", r.nextSteps.length === 1 && /thursday/i.test(r.nextSteps[0].when));
  check("nothing in it is noise", !NOISE.test(JSON.stringify(r)));
}

/* ---------- 3. the brief by Merlin's AI ---------- */
console.log("\nThe brief, by Merlin's AI");
{
  const before = aiCalls.length;
  const r = await B.readBrief("mem_jor", CALL, { me: { name: "Jordan Avery" }, company: "Halcyon Freight" });
  const call = aiCalls[before];
  check("one request, the model from RN_AI_MODEL, the brief's system prompt", aiCalls.length === before + 1 && call.model === "model-from-the-env" && /three parties/.test(call.system));
  check("the request carries the call without its header or audio trouble", typeof call.content === "string" && !NOISE.test(String(call.content)) && /flat for three quarters/.test(String(call.content)));
  const b = r.brief;
  check("the client is the company that buys, never the member's firm", r.ai && b.company === "Halcyon Freight" && b.company !== "Harbor Bench");
  check("the decider is the client's CEO", B.deciderOf(b)?.name === "Morgan Ellis" && B.shortRole(B.deciderOf(b)!.role) === "CEO");
  check("the member is the firm, the candidate is the operator", b.memberRole === "firm" && b.operator === "Riley Chen" && b.people.some((p) => p.side === "operator" && p.name === "Riley Chen"));
  check("4 to 7 insights, a noise insight dropped", b.insights.length === 5 && !b.insights.some((x) => NOISE.test(`${x.title} ${x.body}`)), b.insights.map((x) => x.title));
  check("a number the call never said is dropped (47%), the rest of the insight kept", !JSON.stringify(b.insights).includes("47%") && b.insights.some((x) => /lane audit/.test(x.body)));
  check("evidence quotes kept for the member", b.insights.every((x) => !!x.evidence));
  check("the constraint and the two alternatives with the member's answers", b.constraint?.title === "Planning season" && b.alternatives.length === 2 && b.alternatives.every((a) => !!a.answer));
  check("the days a week as said (2.5), so 20 hours a week", b.shape.daysPerWeek === 2.5 && b.shape.hoursPerWeek === 20);
  const s = JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
  check("charged from the API's usage", (s.aiUsage?.mem_jor?.log ?? []).length === 1);
  check("the transcript is not in the state", !JSON.stringify(s).includes("lane-audit product"));
  // Each gate says why, with no AI request.
  const n = aiCalls.length;
  const consent = await B.readBrief("mem_fre", CALL, { me: { name: "Fred Free" }, company: "Halcyon Freight" });
  check("Free: the plan, said plainly, no request", !consent.ai && consent.miss?.code === "plan" && aiCalls.length === n);
  delete process.env.RN_AI_DRAFTS;
  const off = await B.readBrief("mem_jor", CALL, { me: { name: "Jordan Avery" }, company: "Halcyon Freight" });
  process.env.RN_AI_DRAFTS = "1";
  check("AI off: said plainly, the rules' brief instead", !off.ai && off.miss?.code === "off" && /isn't switched on/.test(off.miss.message) && off.brief.by === "rules");
  aiFail = 2;
  const failed = await B.readBrief("mem_jor", CALL, { me: { name: "Jordan Avery" }, company: "Halcyon Freight" });
  aiFail = 0;
  check("the model failing: said plainly with the status, not swallowed", !failed.ai && failed.miss?.code === "failed" && /error 500/.test(failed.miss.message));
  check("the schema asks for parties, insights, constraint, alternatives, shape, next steps, questions", ["people", "member_role", "insights", "constraint", "alternatives", "shape", "next_steps", "questions", "write"].every((k) => k in (B.BRIEF_SCHEMA as { properties: Record<string, unknown> }).properties));
}

/* ---------- 4. a pasted call: the Senior operator family, no empty boxes, no noise, no 40 hours ---------- */
console.log("\nA pasted call opens");
let pid = "";
{
  const r = await Q.quickProposal(JOR, { transcript: CALL, companyName: "Halcyon Freight", rate: { fee: 18000, allocation: "" } });
  const p = r.proposal;
  pid = p.id;
  check("the Senior operator family, not the template used last", p.templateId === OL.SENIOR_OPERATOR, p.templateId);
  check("What I heard says Merlin is reading the call (no empty boxes)", p.blocks.find((b) => b.blockId === "what_we_heard")?.body === Q.HEARD_WAIT && L.placeholders(p.blocks.find((b) => b.blockId === "what_we_heard")!.body).length === 0);
  check("no noise in the document or its notes", !NOISE.test(docText(p)) && !NOISE.test(JSON.stringify(p.notes)), p.notes);
  check("the call's date from its Date: line, never today's", p.fields["discovery.callDate"] === "March 4", p.fields["discovery.callDate"]);
  check("the 40 hours of an earlier proposal never carry over", p.fields["pricing.allocation"] === "2.5 days a week" && !Object.values(p.fields).some((v) => /40 hours/.test(v)), p.fields["pricing.allocation"]);
  check("its hours from the shared calculation (2.5 days is 20 hours a week)", p.fields["pricing.hoursMonth"] === String(CM.hoursMonth(20)));
  check("the AI pass is ready for the family's sections", r.ai.state === "ready" && r.ai.blocks.length >= 2);
  check("the pasted call is held in memory only, until the pass reads it", Q.pasteKept.peek("mem_jor", p.id) !== null && !readFileSync(path.join(dir, "intel.json"), "utf8").includes("lane-audit product"));
  check("STANDING never carries the days a week", !/"pricing\.allocation"\]/.test(src("lib/proposals/quick.ts").match(/const STANDING = \[[^\]]*\]/)?.[0] ?? "x") && !(src("lib/proposals/quick.ts").match(/const STANDING = \[[^\]]*\]/)?.[0] ?? "").includes("pricing.allocation"));
  check("the home never prices from an earlier proposal's days", !/lastAllocation/.test(src("app/post/proposalsPage/Home2.tsx")));
  const noDays = await Q.quickProposal(JOR, { transcript: CALL.replace("Right, and I'd propose two and a half days a week for the operator.", "Right."), companyName: "Halcyon Freight", rate: { fee: 18000, allocation: "" } });
  check("days unsaid: the document asks (a blank to set), never 40 hours", !noDays.proposal.fields["pricing.allocation"] && L.blanksOf(noDays.proposal.blocks, L.docFields(noDays.proposal)).includes("pricing.allocation"));
  const rate = Rates.proposalRate({ benchmarks: undefined, me: undefined, companies: [] } as never, { company: { id: null }, fields: {} });
  check("no days: the rate's math has no hours, nothing assumed", rate.hoursWeek === null && rate.hoursMonth === null);
}

/* ---------- 5. the pass writes the family from the brief ---------- */
console.log("\nThe brief pass writes the proposal");
{
  const out = await Q.writeSections(JOR, pid, {});
  check("the AI read it", out.ai.ran && out.brief.by === "ai");
  const ids = out.sections.map((x) => x.blockId);
  check("the family's sections, in the template's order", JSON.stringify(ids) === JSON.stringify(["cover", "what_we_heard", "thesis", "pitfalls", "why_fractional", "engagement_glance", "phases_workstreams", "day30", "the_math", "org_chart", "questions", "next_steps"]), ids);
  check("who signs from the brief: the client's CEO", out.fields["client.signerName"] === "Morgan Ellis" && out.fields["client.signerTitle"] === "CEO");
  check("the pasted call is dropped once read", Q.pasteKept.peek("mem_jor", pid) === null);
  const p0 = await S.getProposal(JOR, pid);
  const m = Q.mergeWritten(p0.blocks, out.sections, out.before);
  await S.updateProposal(JOR, pid, { blocks: m.blocks, setFields: { ...p0.fields, ...out.fields }, notes: out.notes });
  const p = await S.getProposal(JOR, pid);
  const text = docText(p);
  const heard = p.blocks.find((b) => b.blockId === "what_we_heard")!;
  check("What I heard: the insights as cards and the constraint, dated", heard.title === "What I heard on March 4" && (heard.body.match(/^- /gm) ?? []).length === 5 && /The constraint: Planning season\./.test(heard.body));
  check("the alternatives answered (a full-time hire, the firm)", /Why a senior operator, not the alternatives/.test(text) && /full-time VP Revenue: Premature/.test(text) && /Apex Advisory/.test(text));
  check("the 90 days: the assessment to the day-30 decision, then sprints with deliverables", /Days 0 to 30 · Assessment/.test(text) && /Day 30 · The decision/.test(text) && /Days 31 to 90 · Design/.test(text) && (text.match(/Deliverable:/g) ?? []).length >= 3);
  check("the bridge has ? for the member, never a number", /Bookings goal: \?/.test(text) && /Meeting rate: \?/.test(text));
  check("where the operator sits: the CEO on top, the leaders beside, the firm's operator", /Top: Morgan Ellis, CEO/.test(text) && /Beside: CFO, VP Sales, VP Marketing/.test(text) && /A senior operator from Harbor Bench/.test(text));
  check("the candidate is never named in the proposal before it's agreed", !/Riley/.test(text));
  check("no noise, no invented number in the document", !NOISE.test(text) && !/47%/.test(text));
  check("no empty boxes: only the member's deliberate blanks remain", L.blanksOf(p.blocks, L.docFields(p)).every((k) => ["client.companyName", "pricing.monthlyFee"].includes(k)), L.blanksOf(p.blocks, L.docFields(p)));
  check("the brief is kept for the member, never the transcript", !!p.brief && p.brief.insights.length === 5 && !JSON.stringify(p.brief).includes("lane-audit product. "));
  check("From the call notes come from the brief", p.notes.some((n) => n.key === "call.insight") && !NOISE.test(JSON.stringify(p.notes)));
  const fz = (await import("../app/post/proposalsPage/model.ts")).frozenOf?.(p, true) as { blocks: unknown[] } | undefined;
  check("the client's copy has no brief", !fz || !JSON.stringify(fz).includes("evidence"));
  // Days to hours, ONE calculation with What should I charge.
  const w = CM.chargeWorking({ minN: 5, rangeN: 10, total: 10, rows: [] } as never, { fn: "Sales", band: "All", kind: "monthly", hours: Rates.hoursWeekOf(p.fields["pricing.allocation"]), company: null, industry: false }, {});
  check("2.5 days a week is the same 20 hours What should I charge works from", Rates.hoursWeekOf(p.fields["pricing.allocation"]) === 20 && Rates.rateMath(18000, p.fields["pricing.allocation"]).hoursMonth === CM.hoursMonth(20) && !!w);
  check("the editor prices the call's days through proposalRate (no 40 default)", /r\.fields\?\.\["pricing\.allocation"\][\s\S]{0,200}proposalRate\(view/.test(src("app/post/Proposals.tsx")) && /DAY_CHOICES/.test(src("app/post/proposalsPage/Rail2.tsx")));
  check("Free can't run the pass (the Close gate)", /403/.test((await refused(Q.writeSections(FRE, pid, {}))) ?? ""));
}

/* ---------- 6. the AI can't run ---------- */
console.log("\nWhen Merlin's AI can't read the call");
{
  delete process.env.RN_AI_DRAFTS;
  const r = await Q.quickProposal(JOR, { transcript: CALL, companyName: "Halcyon Freight", rate: { fee: 18000, allocation: "" } });
  check("the start says plainly the AI is off (no Merlin is reading)", r.ai.state === "off" && r.proposal.blocks.find((b) => b.blockId === "what_we_heard")?.body === Q.HEARD_MISS);
  const out = await Q.writeSections(JOR, r.proposal.id, {});
  process.env.RN_AI_DRAFTS = "1";
  check("the pass says why and that only the certain is filled", !out.ai.ran && out.ai.miss?.code === "off" && out.sections.length === 0);
  const text = docText(r.proposal);
  check("no noise and no empty boxes in What I heard", !NOISE.test(text) && L.placeholders(r.proposal.blocks.find((b) => b.blockId === "what_we_heard")!.body).length === 0);
  check("the editor shows the reason with Try again, not a passing toast", /Merlin didn&#39;t read the call\.<\/strong>/.test(src("app/post/Proposals.tsx")) && /miss\?\.retry &&/.test(src("app/post/Proposals.tsx")));
  Q.pasteKept.drop("mem_jor", r.proposal.id);
  const gone = await Q.writeSections(JOR, r.proposal.id, {});
  check("a pasted call that's gone: said plainly (paste it again)", !gone.ai.ran && /Paste it again/.test(gone.ai.miss?.message ?? ""));
}

/* ---------- 7. the deck ---------- */
console.log("\nThe deck view");
{
  const p = await S.getProposal(JOR, pid);
  const deck = D.deckOf({ blocks: p.blocks, fields: L.docFields(p), from: "Harbor Bench", to: "Halcyon Freight" });
  const kinds = deck.slides.map((s) => s.kind);
  check("a dark cover first, with the headline's accent", deck.slides[0].kind === "cover" && deck.slides[0].title.startsWith("A senior revenue operator") && deck.slides[0].accent === "inside the business", deck.slides[0]);
  const heard = deck.slides.find((s) => s.kind === "cards" && /What I heard/.test(s.title));
  check("What I heard as numbered cards with the dark constraint card", !!heard && heard.kind === "cards" && heard.cards.length === 6 && heard.cards[0].n === "01" && heard.cards[5].dark === true && heard.cards[5].tag === "The constraint");
  check("the 90 days on a clock with the decision", kinds.includes("plan") && deck.slides.some((s) => s.kind === "plan" && /decide/.test(s.decision) && s.phases.length === 3));
  check("pitfalls as rows with what each shows up as", deck.slides.some((s) => s.kind === "rows" && s.rows.length === 3 && !!s.rows[0].aside));
  check("the bridge, the org chart, the thesis", kinds.includes("bridge") && kinds.includes("org") && kinds.includes("thesis"));
  check("the footer names both companies", deck.footer === "Harbor Bench × Halcyon Freight");
  const React = (await import("react")).default;
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const DK = await import("../app/post/proposalsPage/Deck.tsx");
  const html = renderToStaticMarkup(React.createElement(DK.DeckView, { blocks: p.blocks, fields: L.docFields(p), from: "Harbor Bench", to: "Halcyon Freight" }));
  check(`the deck renders ${deck.slides.length} slides with page counts`, (html.match(/class="dk-slide"/g) ?? []).length === deck.slides.length && html.includes(`01 / ${String(deck.slides.length).padStart(2, "0")}`) && /Download PDF/.test(html));
  const css = src("app/post/proposalsPage/deck.css");
  check("the PDF prints one 16:9 slide to a landscape page, nothing else", /@page\s*\{\s*size: 13\.333in 7\.5in/.test(css) && /break-after: page/.test(css) && /body\.dk-printing > \*:not\(\.dk-print-root\)/.test(css) && /aspect-ratio: 16 \/ 9/.test(css));
  check("the deck is a view of the document (the editor stays the source)", /<DeckView blocks=\{p\.blocks\} fields=\{fields\}/.test(src("app/post/Proposals.tsx")));
}

/* ---------- 8. the agreement ---------- */
console.log("\nThe agreement from the same brief");
{
  const a = await Q.draftAgreement(JOR, pid);
  const text = docText(a);
  check("a new draft from the agreement template", a.templateId === OL.OPERATOR_AGREEMENT && a.id !== pid && a.status === "draft");
  const kinds = a.blocks.map((b) => b.blockId);
  check("scope, staffing, governance, reporting, cadence, the plan, focus, commitments, out of scope, success, fees and terms", ["scope", "team_rates", "governance", "reporting_structure", "operating_cadence", "phases_workstreams", "focus_areas", "commitments", "out_of_scope", "success_measures", "investment", "agreement", "signature"].every((k) => kinds.includes(k)), kinds);
  check("staffing names the lead operator and the member as executive sponsor", /Lead operator: Riley Chen/.test(text) && /Executive sponsor: Jordan Avery/.test(text));
  check("two phases with dated deliverables (by day 30, by day 90)", /Phase 1 · Embed and diagnose/.test(text) && /By day 30\./.test(text) && /By day 90\./.test(text));
  check("the committee chaired by the CEO", /chaired by Morgan Ellis \(CEO\)/.test(text));
  check("the price carried over with its days", a.fields["pricing.monthlyFee"] === "$18,000" && a.fields["pricing.allocation"] === "2.5 days a week");
  check("the brief goes with it (for the member)", !!a.brief && a.brief.company === "Halcyon Freight");
  check("no noise in the agreement", !NOISE.test(text));
  const page = src("app/post/Proposals.tsx");
  check("it is sent through the Contracts flow (openSend in contracts/SendSheet.tsx), client first", /import \{ openSend as openContractSend \} from "\.\/contracts\/SendSheet"/.test(page) && /p\.templateId === OPERATOR_AGREEMENT[\s\S]{0,300}openContractSend\(\{ kind: "proposal", id: p\.id, signers/.test(page));
  check("another member can't draft from this proposal", /404/.test((await refused(Q.draftAgreement(SAM, pid))) ?? ""));
}

/* ---------- 9. a template learned from a proposal the member sent ---------- */
console.log("\nMake a template from a proposal I've used");
{
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([792, 612]);
  const lines = ["What I heard", "Pipeline is flat at a made-up client.", "Investment", "A monthly fee for days a week."];
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 550 - i * 30, size: i % 2 ? 11 : 20, font }));
  const pdf = Buffer.from(await doc.save());
  const n = aiCalls.length;
  const got = await LR.learnTemplate(JOR, [{ name: "old-proposal.pdf", bytes: pdf }]);
  check("Merlin's AI reads its structure, headings and voice", got.by === "ai" && aiCalls.length === n + 1 && got.sections.length === 3 && got.voice.headings.length > 0 && got.sections[1].blockId === "thesis");
  check("nothing is saved until the member saves", !JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8")).myTemplates?.mem_jor);
  const edited = { ...got, title: "Jordan's operator deck", sections: got.sections.map((x, i) => (i === 0 ? { ...x, title: "What I heard, edited" } : x)) };
  const saved = await LR.saveLearned(JOR, edited);
  check("saved as the member edited it", saved.length === 1 && saved[0].title === "Jordan's operator deck" && saved[0].blocks[0].title === "What I heard, edited" && !!saved[0].learned?.voice, saved);
  const mine = (await S.listProposals(JOR)).templates.find((t) => t.id === saved[0].id);
  const theirs = (await S.listProposals(SAM)).templates.find((t) => t.id === saved[0].id);
  check("it is the member's own template", !!mine && mine.mine);
  check("private: another member never sees it", !theirs);
  check("private: another member can't start from it", /isn't there anymore|404/.test((await refused(Q.quickProposal(SAM, { templateId: saved[0].id, companyName: "Halcyon Freight" }))) ?? ""));
  const withAgreement = await LR.learnTemplate(JOR, [{ name: "old-proposal.pdf", bytes: pdf }, { name: "old-agreement.pdf", bytes: pdf }]);
  check("an agreement uploaded too is learned alongside", withAgreement.agreement.length === 1);
  check("Free can't (Close)", /403/.test((await refused(LR.learnTemplate(FRE, [{ name: "x.pdf", bytes: pdf }]))) ?? ""));
  delete process.env.RN_AI_DRAFTS;
  const rules = await LR.learnTemplate(JOR, [{ name: "old-proposal.pdf", bytes: pdf }]);
  process.env.RN_AI_DRAFTS = "1";
  check("without the AI: the headings Merlin's reader found, and it says so", rules.by === "rules" && /headings only/.test(rules.note ?? "") && rules.sections.length >= 1);
  const disk = readFileSync(path.join(dir, "intel.json"), "utf8");
  check("the file itself is never kept", !disk.includes("%PDF") && !disk.includes("Pipeline is flat at a made-up client"));
}

/* ---------- words ---------- */
console.log("\nWords");
{
  const files = ["app/post/proposalsPage/Deck.tsx", "app/post/proposalsPage/LearnTemplate.tsx", "app/post/proposalsPage/Rail2.tsx", "lib/proposals/operator.ts", "lib/proposals/operatorLib.ts"];
  const all = files.map(src).join("\n");
  check("no em dashes in what the member reads", !/—/.test(all));
  check("Merlin, never Claude or Anthropic, in the new screens", !/Claude|Anthropic/.test(files.slice(0, 3).map(src).join("\n")));
  check("no client, member or firm names in the template family (generic)", !/Halcyon|Harbor Bench|Morgan|Riley|Jordan|Cedar|Dana/i.test(src("lib/proposals/operatorLib.ts") + src("lib/proposals/operator.ts")));
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
