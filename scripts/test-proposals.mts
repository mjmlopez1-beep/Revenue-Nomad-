/**
 * Checks of the proposal builder (lib/proposals, app/api/proposals, app/api/sign, lib/mcp/proposals.ts).
 * No server: lib/table.ts runs in process on a made-up seed in a temporary data dir, billing live
 * with made-up Stripe settings, email "on" with a fake endpoint, and fetch replaced, so nothing
 * leaves the machine and every email is caught.
 *
 *   npx tsx scripts/test-proposals.mts      exits 1 on any failure
 *
 * Covered:
 *   - the library: 5 templates and 24 blocks, a template's blocks in its order, {{fields}} filled
 *     (lists as bullets, blanks kept), the checklist and the risk flags;
 *   - the extractor on a made-up transcript (WebVTT, SRT, plain): goals, pains, numbers, timeline,
 *     who decides, budget signals, the people involved, the buyer's own words; the member's own
 *     questions never as the buyer's facts; the person who signs not on the call;
 *   - create (from a template, blank, a company on Merlin, a locked one, one typed in), edit,
 *     reorder, add and remove blocks, fields from the record, the profile and the call;
 *   - the rate suggestion from the member's own benchmarks, and where their price sits;
 *   - plans: Free sees one template and keeps drafts, sending is Pro's (with the price);
 *   - privacy: another member can't read, change, send or sign it; nothing of it in their table or
 *     the export; the signer's view carries nothing private; only accepted lines are stored;
 *   - send: blanks refused, an email to the signer with a signed link, the pipeline told;
 *   - the pipeline moves (lib/table.ts wires the hook at start-up): sent to Proposal, signed to Won
 *     with the proposal's fee, hours and term and an intro credited, declined to Lost;
 *   - signing: the code by email (wrong tries, expiry), consent, the full name, the hash of the
 *     document shown, the audit trail complete, the signed copy to both sides, frozen after;
 *   - decline, void, a new version on a change after sending, an expired link refused, a tampered link;
 *   - the connector's tools, and that sending asks first.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-proposals-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

/* ---------- the made-up seed ---------- */

const co = (id: string, name: string, site: string, more: Record<string, string> = {}) => ({ id, fields: { name, website: site, industry: "Manufacturing", employees: "51–200", revenue: "$5M–$20M", hq: "Columbus, OH", ...more } });
const rateCos = Array.from({ length: 12 }, (_, i) => co(`c_r${i}`, `Ratefield ${i} Works`, `ratefield${i}.example`));
const companies = [co("c_acme", "Acme Robotics", "acmerobotics.example"), co("c_hid", "Quillmoor Systems", "quillmoor.example", { revenue: "$20M–$50M" }), ...rateCos];
const RATES = [9000, 10000, 10500, 11000, 11500, 12000, 12500, 13000, 13500, 14000, 15000, 16000];
const engagements = [
  ...rateCos.map((c, i) => ({ id: `e_r${i}`, companyId: c.id, verified: false, fields: { source: "Member success story", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: monthAgo(6), status: "Active", end: "Ongoing", rate: `$${RATES[i] / 1000}k/mo` } })),
  { id: "e_acme", companyId: "c_acme", verified: false, fields: { source: "Member success story", role: "Fractional CRO", function: "Sales", type: "Fractional", start: monthAgo(20), status: "Ended", end: monthAgo(8) } },
];
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.proposals@example.com`, title, token: `tok-${id.slice(4)}-proposals` });
const members = [member("mem_pat", "Pat Rowan", "Fractional VP Sales"), member("mem_oth", "Oona Other", "Fractional CMO"), member("mem_fre", "Fred Free", "Fractional VP Sales"), { id: "mem_adm", name: "Ada Admin", email: "admin-proposals@example.com", title: "Admin", token: "tok-adm-proposals" }];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies, engagements, contacts: [] }));
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: {
      mem_pat: { function: "Sales", title: "Fractional VP Sales", onboarded: true },
      mem_oth: { function: "Marketing", title: "Fractional CMO", onboarded: true },
      mem_fre: { function: "Sales", title: "Fractional VP Sales", onboarded: true },
    },
    billing: { members: { mem_pat: trial, mem_oth: trial, mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-proposals",
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-proposals@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_proposals",
  STRIPE_WEBHOOK_SECRET: "whsec_test_proposals",
  STRIPE_PRICE_MONTH: "price_month_proposals",
  STRIPE_PRICE_YEAR: "price_year_proposals",
  // Email "on", to a fake endpoint that fetch below catches: nothing is sent.
  RESEND_API_KEY: "test-key-proposals",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO"]) delete process.env[k];

const mails: { to: string; subject: string; text: string; html: string; reply_to?: string }[] = [];
let others = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "http://127.0.0.1:9/fake-email") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html, reply_to: b.reply_to });
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  }
  others++;
  return new Response("{}", { status: 200 });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 700)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);

const TRANSCRIPT = `WEBVTT

00:00:01.000 --> 00:00:05.000
<v Pat Rowan>Thanks for the time. What made you look at this now? What's the problem you keep hitting?

00:00:06.000 --> 00:00:15.000
<v Dana Whitfield>Honestly, our sales seat has been empty for three weeks and the pipeline is flat. The problem is nobody owns the forecast.

00:00:16.000 --> 00:00:30.000
<v Dana Whitfield>We want to get to $20M by end of next year. We do about $9M today with four reps.

00:00:31.000 --> 00:00:40.000
<v Dana Whitfield>Win rates dropped to 18 percent and the cycle is now 14 weeks.

00:00:41.000 --> 00:00:50.000
<v Dana Whitfield>We tried an agency last year and it didn't work out. Our CRM was set up for another business line, so nobody updates it.

00:00:51.000 --> 00:01:00.000
<v Dana Whitfield>I need to check with our CEO before we sign anything. We were quoted $15k a month by another firm, which felt too expensive.

00:01:01.000 --> 00:01:10.000
<v Dana Whitfield>Ideally someone two days a week, not a manager. We can give you access to the CRM in week one.

00:01:11.000 --> 00:01:20.000
<v Pat Rowan>Great. Let's meet Thursday to walk through the plan.

00:01:21.000 --> 00:01:30.000
<v Dana Whitfield>Between us, the sales director is delicate about this. He reports to the COO.
`;
const SECRET_LINE = "Between us, the sales director is delicate about this.";

async function main() {
  const T = await import("../lib/table");
  const L = await import("../lib/proposals/library");
  const X = await import("../lib/proposals/extract");
  const R = await import("../lib/proposals/rates");
  const S = await import("../lib/proposals/store");
  const H = await import("../lib/proposals/pipelineHook");
  const C = await import("../lib/mcp/proposals");
  const { CONSENT_VERSION } = await import("../lib/proposals/types");
  type ProposalRec = import("../lib/proposals/types").ProposalRec;

  const BASE = "https://post.example.com";
  const PAT = "tok-pat-proposals";
  const OTH = "tok-oth-proposals";
  const FRE = "tok-fre-proposals";
  const pub = (id: string) => T.tableInternals.pubId(id);
  const ACME = pub("c_acme");
  const HID = pub("c_hid");
  const who = { ip: "203.0.113.7", ua: "Mozilla/5.0 (iPhone; made-up test browser)" };
  const P = await import("../lib/pipeline");
  const HL = await import("../lib/health");
  type State = import("../lib/table").State;
  // lib/table.ts wired the pipeline in when it loaded: the real hook, on the change's own state.
  check("at start-up the proposals are wired to the pipeline (lib/table.ts registers proposalToPipeline)", H.pipelineHookNow() === H.proposalToPipeline);
  const pipe: { memberId: string; companyId: string; kind: string; at: string }[] = [];
  // Every event is noted here, then goes on to the real hook, so the member's pipeline moves as it would.
  H.setPipelineHook((s, memberId, companyId, kind, at) => {
    pipe.push({ memberId, companyId, kind, at });
    return H.proposalToPipeline(s, memberId, companyId, kind, at);
  });
  const acmeDeals = async () => ((await T.loadState()).pipeline?.mem_pat?.entries ?? []).filter((e) => e.companyId === "c_acme");
  const tokenOf = (link: string) => link.match(/\/sign\/([^\s"<]+)/)?.[1] ?? "";
  const copyOf = (link: string) => link.match(/\/signed\/([^\s"<]+)/)?.[1] ?? "";
  const lastMail = (to: string) => [...mails].reverse().find((m) => m.to === to);

  /* ================= the library ================= */
  console.log("\nthe library");
  check("5 templates and 24 blocks, as researched", L.TEMPLATES.length === 5 && L.BLOCKS.length === 24, [L.TEMPLATES.length, L.BLOCKS.length]);
  check("every template block is in the library", L.TEMPLATES.every((t) => t.blocks.every((b) => !!L.blockDef(b.blockId))));
  check("every library block has starting text", L.BLOCKS.every((b) => typeof L.STARTER[b.id] === "string" && L.STARTER[b.id].length > 0));
  const tb = L.templateBlocks("fractional-sales-leader");
  check("a template's blocks come in its order", tb.map((b) => b.blockId).join() === L.templateDef("fractional-sales-leader")!.blocks.map((b) => b.blockId).join(), tb.map((b) => b.blockId));
  check("the library has no consulting firm, network or person named", !/linkedin|sales navigator/i.test(JSON.stringify(L.BLOCKS) + JSON.stringify(L.TEMPLATES)));
  const filled = L.fill("Goal: {{goals.target}}\n{{pains}}\nLeft: {{nope}}", { "goals.target": "$20M by next year", pains: "Seat empty three weeks\nForecast nobody owns" });
  check("{{fields}} fill in, a list as one bullet each, a blank stays a blank", filled === "Goal: $20M by next year\n- Seat empty three weeks\n- Forecast nobody owns\nLeft: {{nope}}", filled);
  check("blanks are counted once", L.blanksOf([{ id: "a", blockId: "custom", title: "x", body: "{{a}} {{b}} {{a}}" }], { b: "1" }).join() === "a");

  /* ================= the extractor ================= */
  console.log("\nthe extractor");
  const ex = X.extract(TRANSCRIPT, "Pat Rowan");
  const keys = (k: string) => ex.suggestions.filter((s) => s.key === k).map((s) => s.text);
  check("WebVTT: speakers and turns read", ex.speakers.join() === "Pat Rowan,Dana Whitfield" && ex.utterances >= 3, ex.speakers);
  check("a goal with its deadline", keys("goals.target").some((t) => /\$20M by end of next year/.test(t)), keys("goals.target"));
  check("pains in their words", keys("pains").some((t) => /nobody owns the forecast/.test(t)) && keys("pains").some((t) => /pipeline is flat/.test(t)), keys("pains"));
  check("numbers: a percentage and a cycle length", keys("metrics").some((t) => /18 percent/.test(t)), keys("metrics"));
  check("what they tried", keys("priorAttempts").some((t) => /agency/.test(t)), keys("priorAttempts"));
  check("systems", keys("currentState.systems").some((t) => /CRM was set up/.test(t)), keys("currentState.systems"));
  check("who decides", keys("decision.process").some((t) => /our CEO/.test(t)), keys("decision.process"));
  check("budget signals: a quote and too expensive", keys("budget.signals").some((t) => /quoted \$15k a month/.test(t)), keys("budget.signals"));
  check("a timeline", keys("timeline").length > 0, keys("timeline"));
  check("the next step the member agreed", keys("nextStep").some((t) => /Let's meet Thursday/.test(t)), keys("nextStep"));
  check("the role they picture and who they want", keys("roleShape").some((t) => /two days a week/.test(t)) && keys("candidate").some((t) => /Ideally/.test(t)));
  check("what they can give", keys("dependencies").some((t) => /give you access/.test(t)), keys("dependencies"));
  check("the people involved", keys("stakeholders").some((t) => /reports to the COO/.test(t)), keys("stakeholders"));
  check("sensitivities found, for the member only", keys("sensitivities").some((t) => /delicate/.test(t)) && L.DISCOVERY_TARGET.sensitivities === null);
  check("the buyer's own phrases", keys("buyerPhrases").length > 0 && ex.suggestions.filter((s) => s.key === "buyerPhrases").every((s) => s.buyer), keys("buyerPhrases"));
  check("the member's own questions are never the buyer's pains", !ex.suggestions.some((s) => s.key === "pains" && /problem you keep hitting/.test(s.text)));
  check("the person who signs wasn't on the call (\"I need to check with\")", ex.signerOnCall === false && /check with our CEO/.test(ex.signerWhy ?? ""), ex);
  check("every suggestion within its length and the per-field limit", ex.suggestions.every((s) => s.text.length <= X.MAX_LINE) && Object.values(ex.suggestions.reduce((a, s) => ((a[s.key] = (a[s.key] ?? 0) + 1), a), {} as Record<string, number>)).every((n) => n <= X.PER_FIELD));
  const srt = X.parseTranscript("1\n00:00:01,000 --> 00:00:04,000\nDana: The problem is the forecast.\n\n2\n00:00:05,000 --> 00:00:08,000\nPat: Got it.\n");
  check("SRT: numbers and timestamps skipped, speakers kept", srt.length === 2 && srt[0].speaker === "Dana" && srt[0].text === "The problem is the forecast." && srt[1].speaker === "Pat", srt);
  const plain = X.extract("[00:02] Dana Whitfield: I can approve this myself. We were quoted 12k per month.\nPat Rowan: Thanks.", "Pat Rowan");
  check("plain text with times: the signer was on the call (\"I can approve\")", plain.signerOnCall === true && plain.suggestions.some((s) => s.key === "budget.signals"), plain);
  check("files it reads", X.transcriptOk("call.vtt") && X.transcriptOk("Call.SRT") && X.transcriptOk("notes.md") && X.transcriptOk("t.txt") && !X.transcriptOk("call.pdf"));

  /* ================= create and edit ================= */
  console.log("\ncreate and edit");
  // Pat unlocks Acme, so its name is hers to see. Quillmoor stays locked.
  await T.perform(PAT, { type: "unlock", entity: "company", id: ACME, field: "identity" } as never, BASE);
  let p: ProposalRec = await S.createProposal(PAT, { templateId: "fractional-sales-leader", companyId: ACME }, BASE);
  check("a new draft from a template, for a company on Merlin", p.status === "draft" && p.version === 1 && p.templateId === "fractional-sales-leader" && p.company.id === ACME && p.company.name === "Acme Robotics", p);
  check("fields from the record: name and revenue band", p.fields["client.companyName"] === "Acme Robotics" && p.fields["company.revenue"] === "$5M–$20M" && p.sources["company.revenue"] === "record", p.fields);
  check("fields from the profile: name and title", p.fields["provider.name"] === "Pat Rowan" && p.fields["provider.title"] === "Fractional VP Sales" && p.sources["provider.name"] === "profile");
  check("the library's defaults: a 3-month term, 30 days' notice", p.fields["term.initialMonths"] === "3" && p.fields["term.noticeDays"] === "30", p.fields);
  check("the template's blocks, with guidance for each", p.blocks.length === tb.length && p.blocks.every((b) => !!L.guidanceFor(b.blockId, p.templateId)?.guidance));
  const hidden = await S.createProposal(PAT, { templateId: null, companyId: HID }, BASE);
  check("a locked company's proposal never carries its name", hidden.company.name === "" && !JSON.stringify(hidden).includes("Quillmoor"), hidden.company);
  const typed = await S.createProposal(PAT, { companyName: "Bramble & Finch Studio" }, BASE);
  check("a company typed in, not on Merlin, from a blank page", typed.company.id === null && typed.company.name === "Bramble & Finch Studio" && typed.templateId === null && typed.blocks.some((b) => b.blockId === "signature"));
  check("no such company", (await refused(S.createProposal(PAT, { companyId: "c_notreal" }, BASE)))?.includes("isn't on Merlin"));

  // Reorder, add, remove.
  const order = p.blocks.map((b) => b.id);
  const swapped = [p.blocks[1], p.blocks[0], ...p.blocks.slice(2)];
  const custom = { ...L.makeBlock("custom"), title: "Why me", body: "I built this twice before." };
  const withCustom = [...swapped.filter((b) => b.blockId !== "proof"), custom];
  p = await S.updateProposal(PAT, p.id, { blocks: withCustom }, BASE);
  check("reorder: the second block first", p.blocks[0].id === order[1] && p.blocks[1].id === order[0]);
  check("remove: proof is gone; add: a custom block at the end", !p.blocks.some((b) => b.blockId === "proof") && p.blocks[p.blocks.length - 1].title === "Why me" && p.blocks[p.blocks.length - 1].blockId === "custom");
  check("saved: read back the same", JSON.stringify((await S.getProposal(PAT, p.id, BASE)).blocks) === JSON.stringify(p.blocks));
  check("too many blocks refused", (await refused(S.updateProposal(PAT, p.id, { blocks: Array.from({ length: 41 }, () => L.makeBlock("custom")) }, BASE)))?.includes("40 blocks"));
  check("still a draft, still version 1", p.status === "draft" && p.version === 1);

  // Accept lines from the call: into fields and notes. Only these are kept.
  let f = { ...p.fields };
  let notes = [...p.notes];
  for (const s of ex.suggestions.filter((x) => ["goals.target", "pains", "budget.signals", "nextStep"].includes(x.key)).slice(0, 6)) ({ fields: f, notes } = L.acceptInto(f, notes, s.key, s.text, new Date().toISOString()));
  p = await S.updateProposal(PAT, p.id, { fields: f, notes, signerOnCall: ex.signerOnCall }, BASE);
  check("accepted lines fill their fields and are kept as notes", /\$20M/.test(p.fields["goals.target"] ?? "") && /forecast/.test(p.fields.pains ?? "") && p.notes.length >= 3, p.fields);
  const stateFile = readFileSync(path.join(dir, "intel.json"), "utf8");
  check("the transcript itself is never stored: a line nobody accepted isn't in the state", stateFile.includes("nobody owns the forecast") && !stateFile.includes(SECRET_LINE) && !stateFile.includes("WEBVTT"));
  check("the risk flags: the person who signs wasn't on the call", L.riskFlags(p).some((r) => r.id === "signer_absent") && !L.riskFlags(p).some((r) => r.id === "no_budget_signal"), L.riskFlags(p));
  check("no budget signal and no next step flagged on a fresh draft", L.riskFlags(typed).some((r) => r.id === "no_budget_signal") && L.riskFlags(typed).some((r) => r.id === "no_next_step") && L.riskFlags(typed).some((r) => r.id === "price_deferred"));

  // The checklist before and after.
  const before = L.checklist({ ...p, fields: L.docFields(p) });
  const miss = (id: string) => before.find((c) => c.id === id);
  check("checklist: no signer yet, no price yet, blanks left", miss("signer")?.ok === false && miss("price")?.ok === false && miss("blanks")?.ok === false && /blanks? left/.test(miss("blanks")?.missing ?? ""), before.filter((c) => !c.ok).map((c) => c.id));
  check("checklist: 30/60/90 decisions and client dependencies come from the template", miss("milestones")?.ok === true && miss("dependencies")?.ok === true && miss("workstreams")?.ok === true, before);
  const blanks = L.blanksOf(p.blocks, L.docFields({ ...p, signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example", title: "COO" } }));
  const set: Record<string, string> = Object.fromEntries(blanks.map((k) => [k, `Filled ${k}`]));
  Object.assign(set, { "pricing.monthlyFee": "$12,000", "pricing.stepDownFee": "$8,000", "pricing.overageRate": "$200", "pricing.allocation": "two days a week", headline: "Build the sales system first, then hire into it" });
  p = await S.updateProposal(PAT, p.id, { setFields: set, signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example", title: "COO" }, signerOnCall: true }, BASE);
  const after = L.checklist({ ...p, fields: L.docFields(p) });
  check("checklist: every pattern there once it's filled in", after.filter((c) => !c.soft).every((c) => c.ok), after.filter((c) => !c.ok));

  /* ================= rates ================= */
  console.log("\nrates");
  const view = await T.buildView(PAT);
  const adv = R.adviceFromView(view, p);
  check("a rate suggestion for her function at this revenue band", !!adv.suggestion && adv.suggestion.fn === "Sales" && adv.suggestion.band === "$5M–$20M" && adv.suggestion.scope === "sized" && adv.suggestion.figure.state === "range", adv.suggestion);
  check("the market band in words, and where her price sits", /middle half of 12 people/.test(adv.suggestion?.says ?? "") && /^Your price is/.test(adv.suggestion?.sits ?? ""), adv.suggestion);
  check("pricing shape: a build then a step down, a short term, an out", adv.shape.some((x) => /month 4/.test(x)) && adv.shape.some((x) => /3 to 6 months/.test(x)) && adv.shape.some((x) => /day 90/.test(x)) && !!adv.template);
  check("above the band is flagged", L.riskFlags({ ...p, fields: { ...p.fields, "pricing.monthlyFee": "$40,000" } }, adv.suggestion!.high).some((r) => r.id === "over_band"));
  const freeView = await T.buildView(FRE);
  const fadv = R.adviceFromView(freeView, { company: { id: null }, fields: { "company.revenue": "$5M–$20M", "pricing.monthlyFee": "$12,000" }, templateId: null });
  check("Free: the median for every size only, as the benchmarks show it", fadv.suggestion?.scope === "all" && fadv.suggestion.limited === true && fadv.suggestion.figure.state !== "range", fadv.suggestion);

  /* ================= plans ================= */
  console.log("\nplans");
  const fv = await S.listProposals(FRE, BASE);
  check("Free: one template open, no sending", fv.templatesOpen.join() === L.FREE_TEMPLATE && fv.canSend === false);
  const sprint = await refused(S.createProposal(FRE, { templateId: "sprint-90" }, BASE));
  // Every template and sending are Pro + Close now (canClose): Free and Pro build and preview.
  check("Free: another template is Pro + Close's, with the price", /Pro \+ Close: \$79 a month/.test(sprint ?? ""), sprint);
  const fp = await S.createProposal(FRE, { templateId: L.FREE_TEMPLATE, companyName: "Wrenfield Dairy" }, BASE);
  check("Free: a draft from the open template", fp.status === "draft");
  const fsend = await S.sendProposal(FRE, fp.id, { signer: { name: "Rhea Wren", email: "rhea@wrenfield.example" } }, BASE).then(() => null, (e: InstanceType<typeof S.ProposalProblem>) => e);
  check("Free: sending is Pro + Close's, said plainly with the price, with the upgrade link", !!fsend && fsend.status === 403 && /Sending for signature is on Pro \+ Close: \$79 a month, or \$790 a year/.test(fsend.message) && /p=billing/.test(fsend.upgrade ?? ""), fsend?.message);
  check("Trial: every template and sending", (await S.listProposals(PAT, BASE)).canSend && (await S.listProposals(PAT, BASE)).templatesOpen.length === 5);

  /* ================= privacy ================= */
  console.log("\nprivacy");
  check("another member can't read it", (await refused(S.getProposal(OTH, p.id, BASE)))?.includes("isn't there"));
  check("nor change it", (await refused(S.updateProposal(OTH, p.id, { title: "Mine now" }, BASE)))?.includes("isn't there"));
  check("nor send it", (await refused(S.sendProposal(OTH, p.id, { signer: { name: "Oona Other", email: "x@y.example" } }, BASE)))?.includes("isn't there"));
  check("nor delete or void it", (await refused(S.deleteProposal(OTH, p.id)))?.includes("isn't there") && (await refused(S.voidProposal(OTH, p.id, BASE)))?.includes("isn't there"));
  const ov = await S.listProposals(OTH, BASE);
  check("their list is their own: empty", ov.proposals.length === 0);
  const othTable = JSON.stringify(await T.buildView(OTH));
  check("nothing of it in another member's table", !othTable.includes(p.title) && !othTable.includes("nobody owns the forecast") && !othTable.includes("pr_"));
  const exported = JSON.stringify(await T.exportState());
  check("nothing of it in the export", !exported.includes("nobody owns the forecast") && !exported.includes('"proposals"'));
  check("signed out: nothing", (await refused(S.listProposals(null, BASE)))?.includes("signed out") && (await refused(S.listProposals("not-a-token", BASE)))?.includes("signed out"));

  /* ================= send ================= */
  console.log("\nsend");
  const t2 = await S.createProposal(PAT, { companyName: "Hollis Fabrication" }, BASE);
  check("blanks refused before sending", (await refused(S.sendProposal(PAT, t2.id, { signer: { name: "Ivy Hollis", email: "ivy@hollis.example" } }, BASE)))?.startsWith("Fill the"));
  check("a signer's email is needed", (await refused(S.sendProposal(PAT, p.id, { signer: { name: "Dana Whitfield", email: "not-an-email" } }, BASE)))?.includes("email"));
  check("not to yourself", (await refused(S.sendProposal(PAT, p.id, { signer: { name: "Pat Rowan", email: "pat.proposals@example.com" } }, BASE)))?.includes("not to yourself"));
  const n0 = mails.length;
  const sent = await S.sendProposal(PAT, p.id, { message: "Here's the plan we talked about." }, BASE);
  p = sent.proposal;
  const toDana = mails.slice(n0).filter((m) => m.to === "dana@acmerobotics.example");
  check("sent: one email to the signer, from the member by name", toDana.length === 1 && toDana[0].subject === "Pat Rowan sent you a proposal to sign" && /Review and sign/.test(toDana[0].html) && /No account needed/.test(toDana[0].text), toDana.map((m) => m.subject));
  check("replies go to the member", toDana[0]?.reply_to === "pat.proposals@example.com", toDana[0]?.reply_to);
  check("the member's note above the link", /Here's the plan we talked about/.test(toDana[0]?.text ?? ""));
  const link = toDana[0]?.text.match(/https:\/\/post\.example\.com\/sign\/\S+/)?.[0] ?? "";
  const tok = tokenOf(link);
  check("a signed link that expires", /^s_[A-Za-z0-9_-]{12}\.[0-9a-z]+\.[A-Za-z0-9_-]{32}$/.test(tok) && !!S.readSignToken(tok) && S.readSignToken(tok)!.expMs === Date.parse(p.send!.expiresAt), tok);
  check("status sent, 30 days", p.status === "sent" && p.send!.status === "sent" && Math.round((Date.parse(p.send!.expiresAt) - Date.parse(p.send!.sentAt)) / DAY) === S.SIGN_DAYS);
  check("pipeline: proposal_sent, for the member and the company on Merlin", pipe.length === 1 && pipe[0].kind === "proposal_sent" && pipe[0].memberId === "mem_pat" && pipe[0].companyId === "c_acme", pipe);
  const afterSend = await acmeDeals();
  check(
    "the member's pipeline moved: a deal at Proposal at the company, opened by the proposal, to the signer",
    afterSend.length === 1 && afterSend[0].stage === "proposal" && afterSend[0].source === "proposal" && afterSend[0].via.proposal === "proposal" && afterSend[0].to.name === "Dana Whitfield" && !!afterSend[0].due,
    afterSend,
  );
  check("sending the same version twice refused", (await refused(S.sendProposal(PAT, p.id, {}, BASE)))?.includes("out for signature already"));

  /* ================= the signer ================= */
  console.log("\nsigning");
  const v0 = await S.signerView(tok, who, BASE);
  check("the signing page: open, the document as sent", v0.status === "open" && v0.doc.title === p.title && v0.doc.from.name === "Pat Rowan" && v0.doc.to.name === "Dana Whitfield" && v0.doc.blocks.length === p.blocks.length);
  const canon = (x: unknown): unknown => (Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x);
  const myHash = createHash("sha256").update(JSON.stringify(canon(v0.doc))).digest("hex");
  check("the hash is the SHA-256 of exactly the content shown", v0.hash === myHash && v0.hash === p.send!.hash && /^[0-9a-f]{64}$/.test(myHash));
  check("no blank left in what the client reads", !JSON.stringify(v0.doc).includes("{{"));
  const viewJson = JSON.stringify(v0);
  const PRIVATE = ["pat.proposals@example.com", "mem_pat", "c_acme", "quoted $15k", "budget.signals", "notes", SECRET_LINE, '"fields"', '"sources"', "pr_"];
  check("the signer's view carries nothing private", PRIVATE.every((w) => !viewJson.includes(w)) && /^da\*+@acmerobotics\.example$/.test(v0.emailHint), PRIVATE.filter((w) => viewJson.includes(w)));
  check(
    "the consent: ESIGN-style, with its version (electronic records, legally binding, authority, paper copy at no cost, withdrawing and what it does, what's needed, contact details, the audit trail)",
    /electronic records and an electronic signature/.test(v0.consent) &&
      /legally binding/.test(v0.consent) &&
      /authorised to sign/.test(v0.consent) &&
      /paper copy at any time, at no cost/.test(v0.consent) &&
      /withdraw this consent/.test(v0.consent) &&
      /does not undo anything already signed/.test(v0.consent) &&
      /web browser/.test(v0.consent) &&
      /email address changes/.test(v0.consent) &&
      /fingerprint of this exact document/.test(v0.consent) &&
      v0.consentVersion === CONSENT_VERSION,
    v0.consent,
  );
  const p1 = await S.getProposal(PAT, p.id, BASE);
  check("viewed: on the audit trail with IP and browser, once", p1.status === "viewed" && p1.send!.events.filter((e) => e.kind === "viewed").length === 1 && p1.send!.events.find((e) => e.kind === "viewed")?.ip === who.ip);
  await S.signerView(tok, who, BASE);
  check("a second open isn't noted again", (await S.getProposal(PAT, p.id, BASE)).send!.events.filter((e) => e.kind === "viewed").length === 1);
  check("signing before the code is refused", (await refused(S.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: v0.hash }, who, BASE)))?.includes("code first"));
  const m0 = mails.length;
  const code1 = await S.requestCode(tok, who);
  const codeMail = mails.slice(m0).find((m) => m.to === "dana@acmerobotics.example");
  const code = codeMail?.text.match(/\b(\d{6})\b/)?.[1] ?? "";
  check("a 6-digit code by email to the signer", code1.sent && /^\d{6}$/.test(code) && /Your code to sign/.test(codeMail?.subject ?? ""), codeMail?.subject);
  check("the code isn't stored as itself", !readFileSync(path.join(dir, "intel.json"), "utf8").includes(`"${code}"`));
  const wrong = code === "000000" ? "111111" : "000000";
  check("a wrong code refused, and counted", (await refused(S.verifyCode(tok, wrong, who, BASE)))?.includes("didn't match") && (await S.getProposal(PAT, p.id, BASE)).send!.events.some((e) => e.kind === "code_failed"));
  check("not 6 digits refused", (await refused(S.verifyCode(tok, "12ab", who, BASE)))?.includes("6 digits"));
  const v1 = await S.verifyCode(tok, code, who, BASE);
  check("the right code confirms the email", v1.codeVerified === true);
  check("the code works once", (await refused(S.verifyCode(tok, code, who, BASE)))?.includes("expired"));
  check("a one-word name refused", (await refused(S.signProposal(tok, { name: "Dana", consent: true, hash: v0.hash }, who, BASE)))?.includes("full name"));
  check("no consent refused", (await refused(S.signProposal(tok, { name: "Dana Whitfield", consent: false, hash: v0.hash }, who, BASE)))?.includes("agree"));
  check("a document that isn't the one shown refused", (await refused(S.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: "0".repeat(64) }, who, BASE)))?.includes("out of date"));
  const m1 = mails.length;
  const signedV = await S.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: v0.hash }, who, BASE);
  check("signed", signedV.status === "signed" && signedV.signedName === "Dana Whitfield" && !!signedV.copyUrl);
  const copyMails = mails.slice(m1);
  check("the signed copy to both sides", copyMails.some((m) => m.to === "dana@acmerobotics.example" && /^Signed: /.test(m.subject)) && copyMails.some((m) => m.to === "pat.proposals@example.com" && /^Signed: /.test(m.subject)), copyMails.map((m) => [m.to, m.subject]));
  check("each with the link to the copy and the fingerprint", copyMails.every((m) => /\/signed\/s_/.test(m.text) && m.text.includes(v0.hash)));
  check("pipeline: signed (Won)", pipe.map((x) => x.kind).join() === "proposal_sent,signed" && pipe[1].companyId === "c_acme");
  const afterSign = await acmeDeals();
  const wonDeal = afterSign.find((e) => e.id === afterSend[0]?.id);
  const pfields = L.docFields(await S.getProposal(PAT, p.id, BASE));
  const termMonths = Number(pfields["term.initialMonths"]);
  check(
    "the same deal moved to Won, from the signed proposal, at the signing time",
    afterSign.length === 1 && wonDeal?.stage === "won" && wonDeal.via.won === "proposal" && wonDeal.dates.won === signedV.signedAt && wonDeal.due === null,
    afterSign,
  );
  check(
    "the Won terms are the proposal's: $12,000 a month, two days a week as 16 hours, its initial term",
    wonDeal?.won?.pricing === "monthly" && wonDeal.won.rate === 12000 && wonDeal.won.hours === 16 && wonDeal.won.months === (Number.isInteger(termMonths) && termMonths > 0 ? termMonths : null) && P.monthlyValue(wonDeal.won) === 12000,
    wonDeal?.won,
  );
  const ps = await S.getProposal(PAT, p.id, BASE);
  check("the member sees it signed, with the copy's link", ps.status === "signed" && ps.send!.signedName === "Dana Whitfield" && ps.send!.copyUrl === signedV.copyUrl);
  const kinds = ps.send!.events.map((e) => e.kind);
  check("the audit trail: sent, viewed, code sent, code failed, code verified, signed, copy sent, in order", ["sent", "viewed", "code_sent", "code_failed", "code_verified", "signed", "copy_sent"].every((k, i, a) => kinds.indexOf(k as never) >= 0 && (i === 0 || kinds.indexOf(k as never) > kinds.indexOf(a[i - 1] as never))), kinds);
  check("timestamps on every event, IP and browser on each of the signer's steps", ps.send!.events.every((e) => !Number.isNaN(Date.parse(e.at))) && ps.send!.events.filter((e) => ["viewed", "code_verified", "signed"].includes(e.kind)).every((e) => e.ip === who.ip && e.ua === who.ua));
  const copy = await S.signedCopy(copyOf(signedV.copyUrl!));
  check("the signed copy: the document, its hash matching the content, the signature", !!copy && copy.hash === v0.hash && copy.hashNow === copy.hash && copy.signed.name === "Dana Whitfield" && copy.signed.email === "dana@acmerobotics.example" && copy.signed.ip === who.ip && copy.signed.ua === who.ua && copy.signed.consentVersion === CONSENT_VERSION && /electronic/.test(copy.signed.consent) && copy.signed.hash === v0.hash);
  check("a tampered copy link opens nothing", (await S.signedCopy(copyOf(signedV.copyUrl!).replace(/.$/, (c) => (c === "A" ? "B" : "A")))) === null && (await S.signedCopy("s_nope.nope")) === null);
  check("frozen after signing: no change, no void, no delete", (await refused(S.updateProposal(PAT, p.id, { title: "Changed" }, BASE)))?.includes("signed") && (await refused(S.voidProposal(PAT, p.id, BASE)))?.includes("signed") && (await refused(S.deleteProposal(PAT, p.id)))?.includes("record"));
  check("signing twice refused", (await refused(S.signProposal(tok, { name: "Dana Whitfield", consent: true, hash: v0.hash }, who, BASE)))?.includes("signed already"));
  const dup = await S.duplicateProposal(PAT, p.id, BASE);
  check("duplicate a signed one: a new draft, version 1", dup.status === "draft" && dup.version === 1 && dup.id !== p.id && dup.send === null);
  check("a tampered signing link refused", (await refused(S.signerView(tok.replace(/.$/, (c) => (c === "A" ? "B" : "A")), who, BASE)))?.includes("doesn't work") && (await refused(S.signerView("s_aaaaaaaaaaaa.zz.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", who, BASE)))?.includes("doesn't work"));

  /* ================= decline, void, versions, expiry ================= */
  console.log("\ndecline, void, versions, expiry");
  const ready = async (name: string) => {
    let q = await S.createProposal(PAT, { companyName: name }, BASE);
    const b = L.blanksOf(q.blocks, L.docFields({ ...q, signer: { name: "Mara Lind", email: "mara@lind.example" } }));
    q = await S.updateProposal(PAT, q.id, { setFields: Object.fromEntries(b.map((k) => [k, k.startsWith("pricing.") ? "$9,000" : `Filled ${k}`])) }, BASE);
    return q;
  };
  // Decline: on a company on Merlin, so the pipeline hears it.
  let d = await S.createProposal(PAT, { templateId: "advisory", companyId: ACME }, BASE);
  d = await S.updateProposal(PAT, d.id, { setFields: Object.fromEntries(L.blanksOf(d.blocks, L.docFields({ ...d, signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example" } })).map((k) => [k, k.startsWith("pricing.") ? "$4,000" : `Filled ${k}`])) }, BASE);
  await S.sendProposal(PAT, d.id, { signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example" } }, BASE);
  const dtok = tokenOf(lastMail("dana@acmerobotics.example")!.text);
  const m2 = mails.length;
  const dv = await S.declineProposal(dtok, { reason: "We're going to wait until next quarter." }, who, BASE);
  check("declined, with the reason", dv.status === "declined" && (await S.getProposal(PAT, d.id, BASE)).send!.declineReason === "We're going to wait until next quarter.");
  check("the member is told by email, with the reason", mails.slice(m2).some((m) => m.to === "pat.proposals@example.com" && /declined/.test(m.subject) && /next quarter/.test(m.text)));
  check("pipeline: declined (Lost)", pipe[pipe.length - 1].kind === "declined" && pipe[pipe.length - 1].companyId === "c_acme");
  const afterDecline = await acmeDeals();
  check(
    "a new proposal after the win opened a new deal, and its decline moved that one to Lost; the Won deal stays Won",
    afterDecline.length === 2 && afterDecline.some((e) => e.id === wonDeal?.id && e.stage === "won" && e.won?.rate === 12000) && afterDecline.some((e) => e.id !== wonDeal?.id && e.stage === "lost" && e.via.lost === "proposal" && !!e.dates.proposal && !e.won),
    afterDecline.map((e) => [e.stage, e.via]),
  );
  const st0 = P.outcomeStats(await T.loadState());
  check("the admin's numbers: one won from a signed proposal", st0.won === 1 && st0.wonFromProposal === 1, st0);
  check("a declined link can't be signed or asked for a code", (await refused(S.requestCode(dtok, who)))?.includes("declined"));

  // Void.
  const vq = await ready("Lind Outfitters");
  await S.sendProposal(PAT, vq.id, { signer: { name: "Mara Lind", email: "mara@lind.example" } }, BASE);
  const vtok = tokenOf(lastMail("mara@lind.example")!.text);
  const pipeN = pipe.length;
  const voided = await S.voidProposal(PAT, vq.id, BASE);
  check("void: the member withdraws a sent proposal", voided.status === "void" && voided.send!.events.some((e) => e.kind === "voided"));
  check("a typed-in company isn't sent to the pipeline (no company on Merlin)", pipe.length === pipeN);
  const vv = await S.signerView(vtok, who, BASE);
  check("a voided link opens as withdrawn, and can't be signed", vv.status === "void" && (await refused(S.requestCode(vtok, who)))?.includes("withdrew"));
  check("voiding twice refused", (await refused(S.voidProposal(PAT, vq.id, BASE)))?.includes("no sent link"));
  const resent = await S.sendProposal(PAT, vq.id, { signer: { name: "Mara Lind", email: "mara@lind.example" } }, BASE);
  check("sending again after a void: a new version and a new link", resent.proposal.version === 2 && resent.proposal.status === "sent" && tokenOf(lastMail("mara@lind.example")!.text) !== vtok);

  // A change after sending: a new version, and the old link stops.
  const cq = await ready("Calder Instruments");
  await S.sendProposal(PAT, cq.id, { signer: { name: "Mara Lind", email: "mara.calder@lind.example" } }, BASE);
  const ctok = tokenOf(lastMail("mara.calder@lind.example")!.text);
  const notesOnly = await S.updateProposal(PAT, cq.id, { notes: [{ key: "pains", text: "A note for me" }] }, BASE);
  check("a note only (nothing the client reads) keeps the version and the link", notesOnly.version === 1 && notesOnly.status === "sent");
  const changed = await S.updateProposal(PAT, cq.id, { title: "Calder Instruments: the new plan" }, BASE);
  check("a change after sending: version 2, back to a draft", changed.version === 2 && changed.status === "draft" && changed.history.length === 1 && changed.history[0].status === "void");
  const cv = await S.signerView(ctok, who, BASE);
  check("the old link says it changed, and can't be signed", cv.status === "changed" && (await refused(S.signProposal(ctok, { name: "Mara Lind", consent: true, hash: cv.hash }, who, BASE)))?.includes("changed"));
  await S.sendProposal(PAT, cq.id, {}, BASE);
  const c2 = tokenOf(lastMail("mara.calder@lind.example")!.text);
  const c2v = await S.signerView(c2, who, BASE);
  check("the new version's link works, with the new title and version", c2v.status === "open" && c2v.doc.title === "Calder Instruments: the new plan" && c2v.doc.version === 2 && (await S.signerView(ctok, who, BASE)).status === "changed");

  // Expired.
  const eq = await ready("Ostrander Marine");
  await S.sendProposal(PAT, eq.id, { signer: { name: "Ola Ostrander", email: "ola@ostrander.example" } }, BASE, Date.now() - 31 * DAY);
  const etok = tokenOf(lastMail("ola@ostrander.example")!.text);
  const ev = await S.signerView(etok, who, BASE);
  check("an expired link opens as expired", ev.status === "expired" && (await S.getProposal(PAT, eq.id, BASE)).status === "expired");
  check("and is refused for a code and a signature", (await refused(S.requestCode(etok, who)))?.includes("expired") && (await refused(S.signProposal(etok, { name: "Ola Ostrander", consent: true, hash: ev.hash }, who, BASE)))?.includes("expired"));
  const er = await S.sendProposal(PAT, eq.id, {}, BASE);
  check("sent again after expiry: a new version", er.proposal.version === 2 && er.proposal.status === "sent");

  // Codes: expiry and the hourly limit.
  const kq = await ready("Kestrel Foods");
  await S.sendProposal(PAT, kq.id, { signer: { name: "Kai Kestrel", email: "kai@kestrel.example" } }, BASE);
  const ktok = tokenOf(lastMail("kai@kestrel.example")!.text);
  await S.requestCode(ktok, who, Date.now() - 20 * 60_000);
  const oldCode = lastMail("kai@kestrel.example")!.text.match(/\b(\d{6})\b/)![1];
  check("a code older than 15 minutes refused", (await refused(S.verifyCode(ktok, oldCode, who, BASE)))?.includes("expired"));
  for (let i = 0; i < 4; i++) await S.requestCode(ktok, who);
  check("at most 5 codes an hour", (await refused(S.requestCode(ktok, who)))?.includes("5 codes in an hour"));

  /* ================= the connector ================= */
  console.log("\nthe connector");
  const ctx = { member: (await T.memberForToken(PAT))!, origin: BASE };
  const fctx = { member: (await T.memberForToken(FRE))!, origin: BASE };
  const lib = await C.listProposalTemplates(ctx);
  check("list_proposal_templates: templates, blocks with guidance and fields, what to pull from a call", (lib.templates as unknown[]).length === 5 && (lib.blocks as { fields: unknown[] }[]).every((b) => Array.isArray(b.fields)) && (lib.from_a_call as { cues: string[] }[]).every((x) => x.cues.length > 0) && /person who signs/.test(String(lib.about)));
  check("on Free it says which template is open", ((await C.listProposalTemplates(fctx)).templates as { id: string; open: boolean }[]).filter((t) => t.open).map((t) => t.id).join() === L.FREE_TEMPLATE);
  const made = await C.createOrUpdateProposal(ctx, {
    template_id: "sprint-90",
    company_id: ACME,
    fields: { "goals.target": "Double qualified pipeline by Q3", pains: "Forecast nobody owns\nCRM nobody updates" },
    notes: [{ key: "budget.signals", text: "Another firm quoted about 15k a month" }],
    signer: { name: "Dana Whitfield", email: "dana@acmerobotics.example", title: "COO" },
    signer_on_call: false,
  });
  const pid = String(made.proposal_id);
  check("create_or_update_proposal: saved with blocks, fields, notes and the signer", made.saved === true && (made.blocks as unknown[]).length === L.templateDef("sprint-90")!.blocks.length && /Double qualified/.test(JSON.stringify(made.fields)) && (made.notes_from_calls as unknown[]).length === 1);
  check("its answer: blanks, checklist and risk flags (the signer wasn't on the call)", (made.blanks as string[]).length > 0 && (made.checklist as unknown[]).length > 5 && (made.risk_flags as string[]).some((r) => /wasn't on the call/.test(r)));
  check("and the rates for this company's size", /middle half/.test(JSON.stringify(made.rates)));
  check("its fields are marked as Claude's", (await S.getProposal(PAT, pid, BASE)).sources["goals.target"] === "claude");
  const upd = await C.createOrUpdateProposal(ctx, { proposal_id: pid, blocks: [{ block_id: "cover" }, { block_id: "what_we_heard", body: "What we heard:\n{{pains}}" }, { block_id: "signature" }] });
  check("update: blocks in Claude's order, its body kept, the library's starter where it sent none", (upd.blocks as { block_id: string; body: string }[]).map((b) => b.block_id).join() === "cover,what_we_heard,signature" && (upd.blocks as { body: string }[])[1].body === "What we heard:\n{{pains}}" && (upd.blocks as { body: string }[])[0].body === L.STARTER.cover);
  const got = await C.getProposalTool(ctx, { proposal_id: pid });
  check("get_proposal: the text as it reads", (got.blocks as { reads: string }[])[1].reads.includes("- Forecast nobody owns"));
  check("get_proposal without an id: the member's own list", ((await C.getProposalTool(ctx, {})).proposals as { proposal_id: string }[]).some((x) => x.proposal_id === pid));
  const othCtx = { member: (await T.memberForToken(OTH))!, origin: BASE };
  check("another member's Claude can't read it", (await refused(C.getProposalTool(othCtx, { proposal_id: pid })))?.includes("isn't there") && ((await C.getProposalTool(othCtx, {})).proposals as unknown[]).length === 0);
  const fillAll = Object.fromEntries(L.blanksOf((await S.getProposal(PAT, pid, BASE)).blocks, L.docFields(await S.getProposal(PAT, pid, BASE))).map((k) => [k, `Filled ${k}`]));
  await C.createOrUpdateProposal(ctx, { proposal_id: pid, fields: fillAll });
  const m3 = mails.length;
  const ask = await C.sendForSignature(ctx, { proposal_id: pid });
  check("send_proposal_for_signature without confirm: nothing sent, it asks", ask.confirmed === false && /Nothing was sent/.test(String(ask.message)) && /confirm: true/.test(String(ask.next)) && mails.length === m3 && (await S.getProposal(PAT, pid, BASE)).status === "draft", ask);
  const yes = await C.sendForSignature(ctx, { proposal_id: pid, confirm: true });
  check("with confirm: sent", yes.confirmed === true && (await S.getProposal(PAT, pid, BASE)).status === "sent" && mails.slice(m3).some((m) => m.to === "dana@acmerobotics.example"), yes);
  const fmade = await C.createOrUpdateProposal(fctx, { template_id: L.FREE_TEMPLATE, company_name: "Wrenfield Dairy" });
  check("Free through Claude: drafts yes", fmade.saved === true);
  check("Free through Claude: sending is Pro's", (await refused(C.sendForSignature(fctx, { proposal_id: String(fmade.proposal_id), signer_name: "Rhea Wren", signer_email: "rhea@wrenfield.example", confirm: true })))?.includes("Pro"));
  check("Free through Claude: another template is Pro's", (await refused(C.createOrUpdateProposal(fctx, { template_id: "revops-build" })))?.includes("Pro"));

  /* ================= the pipeline, on its own ================= */
  console.log("\nthe pipeline hook, on its own");
  check("hours a week from the allocation: hours a week, hours a month, days a week, nothing", H.hoursAWeek("15 hours a week") === 15 && H.hoursAWeek("60 hrs/month") === 13.8 && H.hoursAWeek("two days a week") === 16 && H.hoursAWeek("1.5 days per week") === 12 && H.hoursAWeek("as needed") === null && H.hoursAWeek(undefined) === null);
  check("terms need a monthly fee", H.wonTermsOf({ fields: { "pricing.allocation": "10 hours a week" }, version: 1, signer: null }) === null);
  const mkProposal = (id: string, companyId: string, fields: Record<string, string>, signedAt?: string) =>
    ({ id, memberId: "m_x", companyId, companyPub: null, companyName: "X", templateId: null, title: "Plan", blocks: [], fields, sources: {}, notes: [], signerOnCall: null, signer: { name: "Ivy Hollis", email: "ivy@x.example", title: "CEO" }, version: 1, createdAt: iso(0), updatedAt: signedAt ?? iso(0), sends: signedAt ? [{ id: `s_${id}`, version: 1, sentAt: iso(DAY), expiresAt: iso(30 * DAY), signed: { at: signedAt } }] : [] }) as unknown as import("../lib/proposals/types").StoredProposal;
  const st = { pipeline: { m_x: P.emptyPipeline() }, proposals: [] } as unknown as State;
  const xlog = st.pipeline!.m_x;
  // A deal that came through an intro the member asked for, and that was made.
  const intro = P.addIntro(xlog, { id: "in_x", companyId: "c_x", introducer: { name: "Rob Intro" }, nowMs: t0 }).intro;
  P.markIntro(intro, "made", "asker", t0);
  const opened = P.openEntry(xlog, { id: "pl_intro", companyId: "c_x", channel: "intro", to: { name: "Ivy Hollis" }, source: "intro", via: "you", nowMs: t0, introId: "in_x" }).entry;
  intro.entryId = opened.id;
  st.proposals = [mkProposal("pr_x", "c_x", { "pricing.monthlyFee": "$9,000", "pricing.allocation": "60 hours a month", "term.initialMonths": "6" }, iso(3 * DAY))];
  const sentE = H.proposalToPipeline(st, "m_x", "c_x", "proposal_sent", iso(DAY));
  check("sent: the intro's deal moves to Proposal (no second deal)", sentE.id === "pl_intro" && sentE.stage === "proposal" && xlog.entries.length === 1);
  const wonE = H.proposalToPipeline(st, "m_x", "c_x", "signed", iso(3 * DAY));
  check(
    "signed: Won from the proposal, the intro kept, the terms from the proposal (and through Merlin, as an intro's deal is)",
    wonE.id === "pl_intro" && wonE.stage === "won" && wonE.via.won === "proposal" && wonE.introId === "in_x" && wonE.won?.rate === 9000 && wonE.won.hours === 13.8 && wonE.won.months === 6 && wonE.won.merlin === true,
    wonE,
  );
  // Signed at a company with no deal yet: one opens, from the proposal, and goes to Won.
  st.proposals.push(mkProposal("pr_y", "c_y", { "pricing.monthlyFee": "$15k" }, iso(4 * DAY)));
  const newWon = H.proposalToPipeline(st, "m_x", "c_y", "signed", iso(4 * DAY));
  check("signed with no deal yet: a deal opens from the proposal, straight to Won, with its fee", newWon.source === "proposal" && newWon.stage === "won" && newWon.won?.rate === 15000 && newWon.won.hours === null && newWon.won.merlin === false && newWon.to.name === "Ivy Hollis" && newWon.to.role === "CEO", newWon);
  // A deal the member opened with a note: the proposal sent, then declined.
  P.openEntry(xlog, { id: "pl_z", companyId: "c_z", channel: "email", source: "record", via: "note", nowMs: t0 });
  H.proposalToPipeline(st, "m_x", "c_z", "proposal_sent", iso(DAY));
  const lostE = H.proposalToPipeline(st, "m_x", "c_z", "declined", iso(2 * DAY));
  check("declined: the deal moves to Lost", lostE.id === "pl_z" && lostE.stage === "lost" && lostE.via.lost === "proposal" && !lostE.won);
  const xs = P.outcomeStats(st, t0 + 5 * DAY);
  check("the intro is credited with the win, and both wins count as from a signed proposal", xs.won === 2 && xs.wonFromProposal === 2 && xs.intros.made === 1 && xs.intros.won === 1 && xs.wonThroughMerlin === 1, xs);
  const rows = HL.outcomeRows(xs);
  check("Health's outcomes: Won from a signed proposal, after Won through Merlin", rows.find((r) => r.label === "Won from a signed proposal")?.n === 2 && rows.findIndex((r) => r.label === "Won from a signed proposal") === rows.findIndex((r) => r.label === "Won through Merlin") + 1, rows);

  check("nothing but the fake email endpoint was called", others === 0, others);
  H.setPipelineHook(null);
  console.log(`\n${passes} passed, ${failures} failed`);
  if (!failures) rmSync(dir, { recursive: true, force: true });
  else console.log(`state kept in ${dir}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
