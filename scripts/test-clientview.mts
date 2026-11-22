/**
 * Checks of what the client sees and signs (app/sign, lib/proposals/pricing.ts, sections.ts,
 * pdf.ts, lib/seal.ts, app/check). No server: lib/table.ts runs in process on a made-up seed in a
 * temporary data dir, billing live with made-up Stripe settings, email "on" with a fake endpoint,
 * and fetch replaced, so nothing leaves the machine and every email is caught.
 *
 *   npx tsx scripts/test-clientview.mts      exits 1 on any failure
 *
 * Covered: pricing cleaned (1 to 3 options, one recommended, add-ons need an option, prices),
 * totals with add-ons (monthly and once), the comparison rows; the client's page rendered for 3, 2
 * and 1 options and for a short proposal with one price (the sections placed, absent ones absent,
 * stable data-section ids); the flow (send, pick, change the pick, sign that choice, the choice
 * locked after), the choice in the signed record, the member's view and both emails; the sealed
 * PDF (built, Unicode names in DejaVu Sans read back with pdf.js, the audit page with the seal
 * line and the check address), emailed to both; the seal (a match with who signed and when, an
 * altered byte, an unknown file); /check storing nothing; the seal key without RN_SEAL_KEY
 * (generated once into the data folder, 0600, logged) and with it; documents sealed too; and the
 * gates (Free can't add options; a send without Close stays one price, no PDF).
 */
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

const dir = mkdtempSync(path.join(tmpdir(), "rn-clientview-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "Software", employees: "51–200", revenue: "$20M–$50M", hq: "Austin, TX" } });
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.cv@example.com`, title, token: `tok-${id.slice(4)}-cv` });
const members = [member("mem_jor", "Jordan Avery", "Fractional CRO"), member("mem_fre", "Fred Free", "Fractional VP Sales")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies: [co("c_cedar", "Cedar and Pine Software", "cedarandpine.example")], engagements: [], contacts: [] }));
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jor: { function: "Sales", title: "Fractional CRO", onboarded: true }, mem_fre: { function: "Sales", onboarded: true } },
    billing: { members: { mem_jor: trial, mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-clientview",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_clientview",
  STRIPE_WEBHOOK_SECRET: "whsec_test_clientview",
  STRIPE_PRICE_MONTH: "price_month_clientview",
  STRIPE_PRICE_YEAR: "price_year_clientview",
  RESEND_API_KEY: "test-key-clientview",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO", "RN_AI_DRAFTS", "RN_SEAL_KEY"]) delete process.env[k];

type Mail = { to: string; subject: string; text: string; html: string; attachments?: { filename: string; content: string }[] };
const mails: Mail[] = [];
let others = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "http://127.0.0.1:9/fake-email") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html, attachments: b.attachments });
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  }
  others++;
  return new Response("{}", { status: 200 });
}) as typeof fetch;
const logs: string[] = [];
const log0 = console.log;
console.log = (...a: unknown[]) => (logs.push(a.map(String).join(" ")), log0(...a));

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  log0(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 700)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const count = (s: string, needle: string) => s.split(needle).length - 1;
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));

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

/* ---------- the made-up proposal ---------- */

const BLOCKS = [
  { blockId: "cover", title: "Cover", body: "A revenue program to get Cedar and Pine to $30M ARR\n\nPrepared for Dana Whitfield, CEO, Cedar and Pine Software\nPrepared by Jordan Avery, Fractional CRO" },
  { blockId: "what_we_heard", title: "What we heard", body: "Marketing generates enough demand, but win rates on qualified opportunities have fallen from 28% to 17%.\n- The sales cycle stretched from 60 to 95 days\n- There is no forecast the board relies on" },
  { blockId: "the_math", title: "The math", body: "The scope below is anchored to these numbers.\nNew customers a month: 11 a month\nWin rate: 17% → 28%\nAcquisition cost: $31K → $17K" },
  { blockId: "reporting_structure", title: "Reporting structure", body: "- Reports to the CFO, with the CEO as sponsor\n- Weekly check-in with the CFO" },
  {
    blockId: "phases_workstreams",
    title: "The plan",
    body: "Phase 1, days 1 to 90: diagnose and redesign\n- Weeks 1 to 3, revenue diagnostic: interviews, data and a ranked list. Deliverable: a written diagnostic.\n- Weeks 3 to 7, sales process: stages, exit rules and talk tracks. Deliverable: the documented sales process.\n\nPhase 2, from day 91: lead to the plan\n- Own the revenue plan with a weekly update\n- Run the weekly pipeline meeting",
  },
  { blockId: "milestones", title: "Milestones", body: "- Day 30: diagnostic readout, findings ranked by severity\n- Day 60: new sales process live\n- Day 90: the 2027 plan and the org recommendation" },
  { blockId: "success_measures", title: "Success measures", body: "- By day 90. A 2027 plan the CEO and CFO believe.\n- By month six. Results against the day-30 targets." },
  { blockId: "assumptions", title: "Assumptions", body: "- Access to the CRM in week one\n- Scope changes by written change order" },
  { blockId: "out_of_scope", title: "Out of scope", body: "- Closing deals directly\n- CRM administration" },
  { blockId: "investment", title: "Investment", body: "Term: Six months from December 1, then month to month.\nBilling: Invoiced monthly in advance, due on receipt." },
  {
    blockId: "terms",
    title: "Terms",
    body: "1. Services. The Consultant provides the services in the statement of work above.\n2. Payments. Compensation is as set out in Timeline and Investment.\n3. Confidential information. Each side keeps the other's information private.",
  },
  { blockId: "signature", title: "Signature", body: "Signed for Cedar and Pine Software by Dana Whitfield, CEO." },
].map((b, i) => ({ id: `b${i}`, ...b }));
const OPTIONS = {
  options: [
    { id: "o_assess", name: "Revenue Assessment", price: 24000, billing: "once", note: "45 days, then decide", about: "The Phase 1 diagnostic only.", included: ["Scored diagnostic and ranked findings", "12-month roadmap"] },
    { id: "o_lead", name: "Assessment + Fractional CRO", price: 15000, billing: "month", note: "Months 1 to 3, then $11,000 a month", included: ["Scored diagnostic and ranked findings", "12-month roadmap", "Leads the team weekly"], recommended: true },
    { id: "o_full", name: "Full GTM Program", price: 26000, billing: "month", included: ["Scored diagnostic and ranked findings", "12-month roadmap", "Leads the team weekly", "Steering committee and specialists"], recommended: true },
  ],
  addOns: [
    { id: "a_hire", name: "Sales hiring support", price: 3000, billing: "month", about: "Role profiles, scorecards and interviews." },
    { id: "a_board", name: "Board-ready 2027 plan pack", price: 6000, billing: "once" },
  ],
};

async function main() {
  const T = await import("../lib/table");
  const S = await import("../lib/proposals/store");
  const P = await import("../lib/proposals/pricing");
  const SEC = await import("../lib/proposals/sections");
  const SEAL = await import("../lib/seal");
  const CP = await import("../lib/billing/compare");
  const React = (await import("react")).default;
  // The pages use the automatic JSX runtime; tsx here compiles to React.createElement.
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const PV = await import("../app/sign/ProposalView");
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const textOf = async (bytes: Uint8Array) => {
    const d = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
    const out: string[] = [];
    for (let i = 1; i <= d.numPages; i++) out.push(((await (await d.getPage(i)).getTextContent()).items as { str: string }[]).map((x) => x.str).join(" "));
    return { pages: d.numPages, text: out, all: out.join("\n") };
  };
  const BASE = "https://post.example.com";
  const JOR = "tok-jor-cv";
  const FRE = "tok-fre-cv";
  const who = { ip: "203.0.113.7", ua: "Mozilla/5.0 (test) Safari" };

  /* ---------- pricing, cleaned ---------- */

  const clean = P.cleanPricing(OPTIONS)!;
  check("pricing: 3 options and 2 add-ons kept, prices whole dollars", clean.options.length === 3 && clean.addOns.length === 2 && clean.options[1].price === 15000);
  check("pricing: one recommended at most (the first marked)", clean.options.filter((o) => o.recommended).length === 1 && clean.options[1].recommended === true && !clean.options[2].recommended);
  check("pricing: a 4th option refused", /at most 3/.test(String(await refused(Promise.resolve().then(() => P.cleanPricing({ options: [1, 2, 3, 4].map((i) => ({ name: `O${i}`, price: 1 })), addOns: [] }))))));
  check("pricing: add-ons need an option", /option/.test(String(await refused(Promise.resolve().then(() => P.cleanPricing({ options: [], addOns: [{ name: "X", price: 1 }] }))))));
  check("pricing: a price that isn't a number refused", /price/.test(String(await refused(Promise.resolve().then(() => P.cleanPricing({ options: [{ name: "X", price: "lots" }], addOns: [] }))))));
  check("pricing: none is one price (null)", P.cleanPricing(null) === null && P.cleanPricing({ options: [], addOns: [] }) === null);
  check("pricing: invisible characters taken out of names", P.cleanPricing({ options: [{ name: "Lead‮er", price: 1 }], addOns: [] })!.options[0].name === "Lead er");

  /* ---------- totals ---------- */

  const r1 = P.choiceRec(clean, { optionId: "o_lead", addOnIds: [] });
  check("total: one monthly option", r1.monthly === 15000 && r1.once === 0 && r1.total === "$15,000 a month" && r1.summary === "Assessment + Fractional CRO ($15,000 a month)");
  const r2 = P.choiceRec(clean, { optionId: "o_lead", addOnIds: ["a_hire", "a_board"] });
  check("total: with a monthly and a one-off add-on", r2.monthly === 18000 && r2.once === 6000 && r2.total === "$18,000 a month, plus $6,000 once" && /with Sales hiring support and Board-ready 2027 plan pack$/.test(r2.summary), r2);
  const r3 = P.choiceRec(clean, { optionId: "o_assess", addOnIds: ["a_board"] });
  check("total: a fixed option with a one-off add-on", r3.monthly === 0 && r3.once === 30000 && r3.total === "$30,000 once");
  check("a choice: an unknown option is none, unknown add-ons dropped", P.validChoice(clean, { optionId: "o_nope", addOnIds: [] }) === null && P.validChoice(clean, { optionId: "o_full", addOnIds: ["a_hire", "a_zzz", "a_hire"] })!.addOnIds.join() === "a_hire");
  const rows = P.includedRows(clean);
  check("the comparison rows: every included line once, ticked per option", rows.length === 4 && rows[3].label === "Steering committee and specialists" && rows[3].cells.join() === "false,false,true" && rows[0].cells.every(Boolean));
  check("the option a page starts on: the recommended one", P.startOption(clean) === "o_lead");

  /* ---------- the page, rendered ---------- */

  const fullDoc = (pricing?: typeof clean) => ({
    title: "Cedar and Pine Software · Revenue Program",
    version: 1,
    company: "Cedar and Pine Software",
    from: { name: "Jordan Avery", title: "Fractional CRO" },
    to: { name: "Dana Whitfield", title: "CEO", email: "dana@cedarandpine.example" },
    blocks: BLOCKS.map((b) => ({ title: b.title, text: b.body, kind: b.blockId })),
    ...(pricing ? { pricing } : {}),
    preparedAt: iso(0),
  });
  const render = (doc: ReturnType<typeof fullDoc>, choice: { optionId: string; addOnIds: string[] } | null = null, live = true) =>
    renderToStaticMarkup(React.createElement(PV.ProposalView, { doc, choice, openUntil: iso(14 * DAY), canSign: live, onPick: live ? () => {} : undefined, onAddOn: live ? () => {} : undefined, sign: React.createElement("p", null, "SIGN-SLOT") }));
  const three = render(fullDoc(clean));
  check("3 options: three option cards side by side, each with its own data-section", count(three, 'data-section="option-') === 3 && three.includes('data-section="option-o_lead"') && three.includes("cv-opts-3"));
  check("3 options: the heading, the comparison table and the recommended one marked", three.includes("Choose how we work together") && three.includes("cv-table") && three.includes("Jordan recommends") && count(three, "Jordan recommends") === 1);
  check("3 options: the recommended one picked to start, the total for it", /role="radio" aria-checked="true"[^>]*data-section="option-o_lead"/.test(three) && three.includes("$15,000 a month"));
  check("3 options: the add-ons with their prices, and their own data-section", three.includes("Add if useful") && three.includes("Sales hiring support · $3,000 a month") && three.includes("Board-ready 2027 plan pack · $6,000 once") && three.includes('data-section="addon-a_board"'));
  const withAdds = render(fullDoc(clean), { optionId: "o_lead", addOnIds: ["a_hire", "a_board"] });
  check("the total updates with the add-ons picked", withAdds.includes("$18,000 a month") && withAdds.includes("Plus $6,000 once."));
  const twoP = { options: clean.options.slice(1), addOns: clean.addOns };
  const two = render(fullDoc(twoP));
  check("2 options: two cards, the wider layout, the table", count(two, 'data-section="option-') === 2 && two.includes("cv-opts-2") && two.includes("cv-table") && two.includes("Choose how we work together"));
  const oneP = { options: [clean.options[1]], addOns: clean.addOns };
  const one = render(fullDoc(oneP));
  check("1 option: one price, no cards to pick, no table", count(one, 'data-section="option-') === 1 && !one.includes('role="radio"') && !one.includes("cv-table") && one.includes("Hours and investment") && one.includes("Add if useful"));
  check("the page's sections in order, each with a stable data-section", ["header", "scope", "what_we_heard", "the_math", "team", "phases_workstreams", "milestones", "success_measures", "assume", "invest", "terms", "sign"].every((id, i, a) => three.indexOf(`data-section="${id}"`) >= 0 && (i === 0 || three.indexOf(`data-section="${id}"`) > three.indexOf(`data-section="${a[i - 1]}"`))));
  check("01 Scope: the math as stat cards", count(three, "cv-stat-v") === 3 && three.includes("17% → 28%"));
  check("the plan: phases, workstreams that open and close, deliverables", count(three, 'class="cv-stream"') === 2 && three.includes("Phase 1") && three.includes("Phase 2") && three.includes("Deliverable.") && three.includes("The documented sales process"));
  check("milestones and success measures in their own shapes", count(three, "cv-mile-w") === 3 && three.includes("By day 90.") && count(three, 'class="cv-col"') === 2);
  check("03 the agreement as parts that open, the first open", count(three, 'class="cv-legal-part"') === 3 && three.includes("1. Services") && /<details class="cv-legal-part" open=""/.test(three));
  check("the header: both parties and the cover's headline, not its 'Prepared for' lines", three.includes("Jordan Avery, Fractional CRO · prepared for Dana Whitfield, CEO, Cedar and Pine Software") && three.includes("A revenue program to get Cedar and Pine to $30M ARR") && !three.includes("Prepared by Jordan"));
  const shortDoc = { ...fullDoc(), blocks: [{ title: "Cover", text: "Sales leadership for Cedar and Pine", kind: "cover" }, { title: "Investment", text: "$12,000 a month for three months.", kind: "investment" }, { title: "Signature", text: "Signed for Cedar and Pine Software.", kind: "signature" }] };
  const short = render(shortDoc);
  check("a short proposal with one price: absent sections absent, no nav to them", !short.includes("01 · Scope") && !short.includes("03 · Consulting agreement") && !short.includes('data-section="option-') && !short.includes("cv-nav") && short.includes("$12,000 a month for three months.") && short.includes("SIGN-SLOT"));
  const old = render({ ...fullDoc(), blocks: fullDoc().blocks.map(({ kind: _k, ...b }) => b) as never });
  check("a send from before kinds were kept: placed by its library title", old.includes('data-section="terms"') && old.includes('data-section="milestones"'));
  const signedView = render(fullDoc(clean), { optionId: "o_full", addOnIds: ["a_hire"] }, false);
  // The signed copy is server-rendered: not one event handler may reach a host element there.
  const handlers: string[] = [];
  const walk2 = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk2);
    if (!n || typeof n !== "object" || !("type" in n)) return;
    const el = n as { type: unknown; props: Record<string, unknown> };
    if (typeof el.type === "function") return walk2((el.type as (p: unknown) => unknown)(el.props));
    for (const [k, v] of Object.entries(el.props ?? {})) if (k !== "children" && typeof v === "function") handlers.push(`${String(el.type)}.${k}`);
    walk2(el.props?.children);
  };
  walk2(React.createElement(PV.ProposalView, { doc: fullDoc(clean), choice: { optionId: "o_full", addOnIds: ["a_hire"] }, sign: null }).type === PV.ProposalView ? PV.ProposalView({ doc: fullDoc(clean), choice: { optionId: "o_full", addOnIds: ["a_hire"] }, sign: null }) : null);
  check("read only (the server-rendered signed copy): no event handler on any element", handlers.length === 0, handlers);
  check("signed (read only): no buttons to pick, the choice marked, add-ons fixed", !signedView.includes('role="radio"') && signedView.includes("Chosen") && /<input[^>]*disabled=""[^>]*checked=""/.test(signedView) && signedView.includes("The investment signed"));

  /* ---------- the flow ---------- */

  const p0 = await S.createProposal(JOR, { companyName: "Cedar and Pine Software", title: "Cedar and Pine Software · Revenue Program" }, BASE);
  await S.updateProposal(JOR, p0.id, { blocks: BLOCKS, signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example", title: "CEO" } }, BASE);
  const pp = await S.updateProposal(JOR, p0.id, { pricing: OPTIONS }, BASE);
  check("the member saves 3 options and 2 add-ons", pp.pricing?.options.length === 3 && pp.pricing.addOns.length === 2);
  check("a 4th option refused in words", /at most 3/.test(String(await refused(S.updateProposal(JOR, p0.id, { pricing: { options: [...OPTIONS.options, { name: "Fourth", price: 1 }], addOns: [] } }, BASE)))));
  const m0 = mails.length;
  await S.sendProposal(JOR, p0.id, {}, BASE);
  const link = mails.slice(m0).find((m) => m.to === "dana@cedarandpine.example")?.text.match(/https:\/\/post\.example\.com\/sign\/(\S+)/)?.[1] ?? "";
  const v0 = await S.signerView(link, who, BASE);
  check("the client's view: the options frozen with the document, each block's kind", v0.doc.pricing?.options.length === 3 && v0.doc.blocks.every((b) => !!b.kind) && v0.sealOnSign === true && v0.choice === null);
  const c1 = await S.chooseOption(link, { optionId: "o_full", addOnIds: ["a_board"] }, BASE);
  check("the client picks an option and an add-on: kept", c1.choice?.optionId === "o_full" && c1.choice.addOnIds.join() === "a_board");
  check("an option that isn't there refused", /isn't in this proposal/.test(String(await refused(S.chooseOption(link, { optionId: "o_zzz", addOnIds: [] }, BASE)))));
  const c2 = await S.chooseOption(link, { optionId: "o_lead", addOnIds: ["a_hire", "a_board"] }, BASE);
  check("the choice changes before signing", c2.choice?.optionId === "o_lead" && c2.choice.addOnIds.length === 2 && (await S.signerView(link, who, BASE)).choice?.optionId === "o_lead");
  const m1 = mails.length;
  await S.requestCode(link, who);
  const code = mails.slice(m1).find((m) => m.to === "dana@cedarandpine.example")?.text.match(/\b(\d{6})\b/)?.[1] ?? "";
  await S.verifyCode(link, code, who, BASE);
  const m2 = mails.length;
  const sv = await S.signProposal(link, { name: "Dana Whitfield", consent: true, hash: v0.hash }, who, BASE);
  check("signed with the choice kept (none sent with the signature)", sv.status === "signed" && sv.signedChoice?.optionId === "o_lead" && sv.signedChoice.addOns.length === 2 && sv.signedChoice.total === "$18,000 a month, plus $6,000 once");
  check("the choice is locked after signing", /can't change now/.test(String(await refused(S.chooseOption(link, { optionId: "o_assess", addOnIds: [] }, BASE)))) && /signed already/.test(String(await refused(S.signProposal(link, { name: "Dana Whitfield", consent: true, hash: v0.hash, choice: { optionId: "o_assess", addOnIds: [] } }, who, BASE)))));
  const st = await T.loadState();
  const x = st.proposals!.find((q) => q.id === p0.id)!.sends[0];
  check("the signed record states the option and add-ons, and the audit trail does", x.signed?.choice?.option === "Assessment + Fractional CRO" && x.signed.choice.addOns.map((a) => a.name).join() === "Sales hiring support,Board-ready 2027 plan pack" && x.events.some((e) => e.kind === "signed" && /chose Assessment \+ Fractional CRO/.test(e.note ?? "")));
  const rec = await S.getProposal(JOR, p0.id, BASE);
  check("the member's view states the choice and the sealed PDF", rec.send?.choice?.summary.startsWith("Assessment + Fractional CRO ($15,000 a month) with") === true && !!rec.send.sealed && /\/api\/sign\/pdf\?c=/.test(rec.send.sealed.pdf));
  const done = mails.slice(m2).filter((m) => /^Signed: /.test(m.subject));
  check("both emails state the choice and the total", done.length === 2 && done.every((m) => /chose Assessment \+ Fractional CRO \(\$15,000 a month\) with Sales hiring support and Board-ready 2027 plan pack\. Total: \$18,000 a month, plus \$6,000 once\./i.test(m.text)), done.map((m) => m.text.slice(0, 400)));
  check("both get the sealed PDF attached, its download and the check address", done.every((m) => m.attachments?.length === 1 && sha(Buffer.from(m.attachments[0].content, "base64")) === x.seal?.sha256 && m.text.includes("https://post.example.com/check") && /\/api\/sign\/pdf\?c=/.test(m.text)));

  /* ---------- the sealed PDF ---------- */

  const pdfBytes = new Uint8Array(Buffer.from(done[0].attachments![0].content, "base64"));
  const pd = await PDFDocument.load(pdfBytes);
  const t = await textOf(pdfBytes);
  check("the PDF: the proposal's sections, the option chosen, the add-ons and the total", /What we heard/.test(t.all) && /The option chosen/.test(t.all) && /Assessment \+ Fractional CRO/.test(t.all) && /Board-ready 2027 plan pack/.test(t.all) && /\$18,000 a month, plus \$6,000 once/.test(t.all) && /Services/.test(t.all), t.all.slice(0, 600));
  const audit = t.text[t.pages - 1];
  check("the audit page: its trail, the document hash, the seal line and where to check", /Audit trail/.test(t.all) && audit.includes(x.hash) && audit.includes(`Seal SHA-256: ${x.seal!.digest}`) && audit.includes("https://post.example.com/check") && pd.getPageCount() === t.pages);
  check("the seal on the record: both SHA-256s and Merlin's signature, which holds", /^[0-9a-f]{64}$/.test(x.seal!.sha256) && x.seal!.sha256 === sha(pdfBytes) && x.seal!.digest !== x.seal!.sha256 && SEAL.sealHolds(x.seal!));
  const dl = await S.sealedPdf(S.copyToken(x.id), BASE);
  check("the download from the signed copy's link is the sealed file", !!dl && sha(dl.bytes) === x.seal!.sha256 && /\(signed\)\.pdf$/.test(dl.name));
  check("kept on the volume, private", (statSync(path.join(dir, "proposals", x.id, "final.pdf")).mode & 0o777) === 0o600);
  const copy = await S.signedCopy(S.copyToken(x.id), BASE);
  check("the signed copy's page: the seal, its download and Check a copy", copy?.sealed?.sha256 === x.seal!.sha256 && copy.sealed.check === "https://post.example.com/check" && copy.sealed.events >= 5, copy?.sealed);

  /* ---------- checking a copy ---------- */

  const match = await SEAL.checkCopy(pdfBytes);
  check("a match: who signed and when, nothing else", match.result === "match" && JSON.stringify(Object.keys(match).sort()) === JSON.stringify(["result", "sealedAt", "signers"]) && match.signers.length === 1 && match.signers[0].name === "Dana Whitfield" && JSON.stringify(Object.keys(match.signers[0]).sort()) === '["at","name"]', match);
  const altered = Buffer.from(pdfBytes);
  const mid = Math.floor(altered.length / 2);
  altered[mid] = altered[mid] ^ 0x01;
  check("an altered byte: changed after sealing", (await SEAL.checkCopy(altered)).result === "changed");
  const s2 = Buffer.from(pdfBytes);
  const at = s2.indexOf(Buffer.from(x.seal!.digest));
  s2.write(x.seal!.digest[0] === "a" ? "b" : "a", at, "latin1");
  check("the printed fingerprint itself altered: no match", (await SEAL.checkCopy(s2)).result !== "match");
  const other = await PDFDocument.create();
  other.addPage().drawText("Something else", { font: await other.embedFont(StandardFonts.Helvetica) });
  check("an unknown file: no sealed record", (await SEAL.checkCopy(await other.save())).result === "unknown");

  /* ---------- /check keeps nothing ---------- */

  const { NextRequest } = await import("next/server");
  const route = await import("../app/api/check/route");
  const before = walk(dir).map((f) => [f, sha(readFileSync(f))].join(" ")).sort();
  const marker = `UPLOAD-${Math.random().toString(36).slice(2)}`;
  const up = await PDFDocument.create();
  up.addPage().drawText(marker, { font: await up.embedFont(StandardFonts.Helvetica) });
  up.setTitle(marker);
  const upBytes = await up.save({ useObjectStreams: false });
  const res = await route.POST(new NextRequest("https://post.example.com/api/check", { method: "POST", body: upBytes, headers: { "content-type": "application/pdf", "x-forwarded-for": "198.51.100.4" } }));
  const resMatch = await route.POST(new NextRequest("https://post.example.com/api/check", { method: "POST", body: pdfBytes, headers: { "content-type": "application/pdf", "x-forwarded-for": "198.51.100.4" } }));
  const after = walk(dir).map((f) => [f, sha(readFileSync(f))].join(" ")).sort();
  check("/check answers over HTTP: unknown, then a match", ((await res.json()) as { result: string }).result === "unknown" && ((await resMatch.json()) as { result: string }).result === "match" && res.headers.get("cache-control") === "no-store");
  check("/check stores nothing: every file in the data folder the same before and after", JSON.stringify(before) === JSON.stringify(after));
  check("/check stores nothing: the upload's words are in no file", walk(dir).every((f) => !readFileSync(f).includes(marker)) && !logs.some((l) => l.includes(marker)));
  const notPdf = await route.POST(new NextRequest("https://post.example.com/api/check", { method: "POST", body: Buffer.from("hello"), headers: { "x-forwarded-for": "198.51.100.4" } }));
  check("/check refuses a file that isn't a PDF, in words", notPdf.status === 400 && /isn't a PDF/.test(((await notPdf.json()) as { error: string }).error));

  /* ---------- the seal key ---------- */

  const keyFile = path.join(dir, SEAL.SEAL_KEY_FILE);
  check("no RN_SEAL_KEY: a key generated once into the data folder, private, and the log says so", existsSync(keyFile) && (statSync(keyFile).mode & 0o777) === 0o600 && SEAL.sealKey().generated && logs.some((l) => /RN_SEAL_KEY is not set/.test(l)) && /BEGIN PRIVATE KEY/.test(readFileSync(keyFile, "utf8")));
  check("the key is not in the repo", !existsSync(path.join(process.cwd(), "data", SEAL.SEAL_KEY_FILE)) || readFileSync(path.join(process.cwd(), ".gitignore"), "utf8").includes("data/seal-key.pem"));
  const first = SEAL.sealKey().keyId;
  SEAL.resetSealKey();
  check("the same generated key comes back after a restart", SEAL.sealKey().keyId === first);
  process.env.RN_SEAL_KEY = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  SEAL.resetSealKey();
  check("RN_SEAL_KEY set: that key, not the file's", !SEAL.sealKey().generated && SEAL.sealKey().keyId !== first);
  check("a record sealed with another key doesn't hold", !SEAL.sealHolds(x.seal!) && (await SEAL.checkCopy(pdfBytes)).result === "unknown");
  delete process.env.RN_SEAL_KEY;
  SEAL.resetSealKey();
  check("back on the generated key: the copy matches again", (await SEAL.checkCopy(pdfBytes)).result === "match");
  process.env.RN_SEAL_KEY = "not a key";
  SEAL.resetSealKey();
  check("a broken RN_SEAL_KEY fails loudly, never a silent unsealed file", (await refused(Promise.resolve().then(() => SEAL.sealKey()))) !== null);
  delete process.env.RN_SEAL_KEY;
  SEAL.resetSealKey();

  /* ---------- Unicode names in the PDF ---------- */

  const u = await S.createProposal(JOR, { companyName: "Cedar and Pine Software" }, BASE);
  await S.updateProposal(JOR, u.id, { blocks: BLOCKS.slice(9), pricing: { options: [{ name: "Ежемесячно", price: 9000, billing: "month", included: ["Ļoti labi"] }], addOns: [] }, signer: { name: "Łucja Øster-Ångström", email: "lucja@cedarandpine.example", title: "Directora" } }, BASE);
  const m3 = mails.length;
  await S.sendProposal(JOR, u.id, {}, BASE);
  const ulink = mails.slice(m3).find((m) => m.to === "lucja@cedarandpine.example")?.text.match(/https:\/\/post\.example\.com\/sign\/(\S+)/)?.[1] ?? "";
  const uv = await S.signerView(ulink, who, BASE);
  const m4 = mails.length;
  await S.requestCode(ulink, who);
  await S.verifyCode(ulink, mails.slice(m4).find((m) => m.to === "lucja@cedarandpine.example")?.text.match(/\b(\d{6})\b/)?.[1] ?? "", who, BASE);
  const usv = await S.signProposal(ulink, { name: "Люся Остер", consent: true, hash: uv.hash }, who, BASE);
  check("one option: signed without picking, that option is the choice", usv.signedChoice?.option === "Ежемесячно" && usv.signedChoice.total === "$9,000 a month");
  const uSend = (await T.loadState()).proposals!.find((q) => q.id === u.id)!.sends[0];
  const ub = (await S.sealedPdf(S.copyToken(uSend.id), BASE))!.bytes;
  const ut = await textOf(ub);
  const flat = ut.all.replace(/\s+/g, " ");
  check("Unicode names print in the PDF (Cyrillic, Polish, Nordic), in the embedded Unicode font", flat.includes("Люся Остер") && flat.includes("Łucja Øster-Ångström") && flat.includes("Ежемесячно") && Buffer.from(ub).includes(Buffer.from("DejaVu")), flat.slice(0, 500));
  check("…and that copy checks out too", (await SEAL.checkCopy(ub)).result === "match");

  /* ---------- documents sealed too ---------- */

  const DP = await import("../lib/documents/pdf");
  const orig = await PDFDocument.create();
  orig.addPage([612, 792]).drawText("Consulting agreement", { x: 72, y: 700, font: await orig.embedFont(StandardFonts.Helvetica) });
  const origBytes = await orig.save();
  const ddoc = {
    id: "dc_testtesttest",
    memberId: "mem_jor",
    companyId: null,
    companyPub: null,
    companyName: "Cedar and Pine Software",
    title: "Agreement",
    fileName: "agreement.pdf",
    size: origBytes.length,
    pages: [{ x: 0, y: 0, w: 612, h: 792, rot: 0 }],
    sha256: sha(origBytes),
    fields: [{ id: "f1", page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.05, kind: "signature" as const, signer: "ds_aaaaaaaaaaaa", required: true }],
    signers: [{ id: "ds_aaaaaaaaaaaa", name: "Dana Whitfield", email: "dana@cedarandpine.example", signed: { at: iso(0), ip: who.ip, ua: who.ua, name: "Dana Whitfield", method: "typed" as const, consent: "c", consentVersion: "v", hash: sha(origBytes) } }],
    ordered: false,
    createdAt: iso(0),
    updatedAt: iso(0),
    events: [],
  };
  const fin = await DP.buildFinal(origBytes, { doc: ddoc, signatures: new Map(), sender: { name: "Jordan Avery", email: "jor.cv@example.com", title: "Fractional CRO" }, consentText: "consent", consentVersion: "v", seal: { checkUrl: "https://post.example.com/check" } });
  const seal = SEAL.sealRec(fin as { digest: string; sha256: string; bytes: Uint8Array });
  const finder = SEAL.sealedIn({ documents: [{ ...ddoc, completed: { seal } }] });
  const dt = await textOf(fin.bytes);
  check("a signed document's final PDF is sealed the same way", !!fin.digest && fin.sha256 === sha(fin.bytes) && dt.all.includes(`Seal SHA-256: ${fin.digest}`) && SEAL.checkPdf(fin.bytes, finder).result === "match");

  /* ---------- the gates ---------- */

  const fp = (await T.loadState()).proposals!.find((q) => q.id === p0.id)!;
  check("Free and Pro (after the trial) can't add options: the Close prompt", /Close/.test(String(await refused(S.updateProposal(FRE, p0.id, { pricing: OPTIONS }, BASE)))) && !!fp);
  // A send made without Close (the flag a Close send carries, taken off): one price, no picking, no sealed PDF.
  const g = await S.createProposal(JOR, { companyName: "Cedar and Pine Software" }, BASE);
  await S.updateProposal(JOR, g.id, { blocks: BLOCKS.slice(9), signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example" } }, BASE);
  const m5 = mails.length;
  await S.sendProposal(JOR, g.id, {}, BASE);
  const glink = mails.slice(m5).find((m) => m.to === "dana@cedarandpine.example")?.text.match(/https:\/\/post\.example\.com\/sign\/(\S+)/)?.[1] ?? "";
  await T.tableInternals.mutate((s) => {
    for (const q of s.proposals ?? []) if (q.id === g.id) for (const y of q.sends) delete y.close;
  });
  const gv = await S.signerView(glink, who, BASE);
  check("a single-price proposal: nothing to pick", !gv.doc.pricing && gv.choice === null && gv.sealOnSign === false && /one price/.test(String(await refused(S.chooseOption(glink, { optionId: "x", addOnIds: [] }, BASE)))));
  const m6 = mails.length;
  await S.requestCode(glink, who);
  await S.verifyCode(glink, mails.slice(m6).find((m) => m.to === "dana@cedarandpine.example")?.text.match(/\b(\d{6})\b/)?.[1] ?? "", who, BASE);
  const m7 = mails.length;
  const gsv = await S.signProposal(glink, { name: "Dana Whitfield", consent: true, hash: gv.hash }, who, BASE);
  const gm = mails.slice(m7).filter((m) => /^Signed: /.test(m.subject));
  check("…signed as today: no choice, no sealed PDF, no attachment", gsv.status === "signed" && !gsv.signedChoice && !gsv.sealed && gm.length === 2 && gm.every((m) => !m.attachments?.length && !/chose/i.test(m.text)) && (await S.sealedPdf(S.copyToken((await T.loadState()).proposals!.find((q) => q.id === g.id)!.sends[0].id), BASE)) === null);
  check("the plans table: both Close rows, Free and Pro in the trial only", ["Give them options to pick from", "Sealed PDF anyone can check"].every((w) => CP.PLAN_ROWS.some((r) => r[0] === w && r[1] === "In your trial only" && r[2] === "In your trial only") && CP.CLOSE_ADDS.some((r) => r[0] === w)) && CP.LANDING_ROWS.every((r) => !/options to pick|Sealed PDF/.test(r[0])));
  /* ---------- the member's own signature ---------- */

  const MS = await import("../lib/proposals/memberSig");
  const H = await import("../lib/proposals/pipelineHook");
  const pipe: { kind: string; at: string }[] = [];
  H.setPipelineHook((st, memberId, companyId, kind, at, from) => (pipe.push({ kind, at }), H.proposalToPipeline(st, memberId, companyId, kind, at, from)));
  const CEDAR = T.tableInternals.pubId("c_cedar");
  check("saved signature: none to start", (await MS.getMySignature(JOR)) === null);
  check("saved signature: consent required", /agree/.test(String(await refused(MS.setMySignature(JOR, { method: "typed", typed: "Jordan Avery" }, BASE)))));
  check("saved signature: Free (after the trial) gets the Close prompt", /Close/.test(String(await refused(MS.setMySignature(FRE, { method: "typed", typed: "Fred Free", consent: true }, BASE)))));
  const st1 = await MS.setMySignature(JOR, { method: "typed", typed: "Jordan Avery", consent: true }, BASE);
  check("saved signature: typed, with the name and title from the profile", st1.kind === "typed" && st1.typed === "Jordan Avery" && st1.name === "Jordan Avery" && st1.title === "Fractional CRO" && st1.img === null);
  check("saved signature: a broken drawing refused", /drawing/.test(String(await refused(MS.setMySignature(JOR, { method: "drawn", png: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==", consent: true }, BASE)))));
  const sigA = png(60, 16, 3);
  const st2 = await MS.setMySignature(JOR, { method: "drawn", png: sigA, consent: true }, BASE);
  const sigFile = path.join(dir, "members", "mem_jor", "signature.png");
  check("saved signature: replaced by a drawing, kept on the volume, private, its fingerprint in the state", st2.kind === "drawn" && st2.img === sigA && (statSync(sigFile).mode & 0o777) === 0o600 && (await T.loadState()).memberSignatures?.mem_jor?.sha256 === sha(readFileSync(sigFile)));
  check("saved signature: never in the admin export", !JSON.stringify(await T.exportState()).includes("memberSignatures"));
  await MS.deleteMySignature(JOR);
  check("saved signature: deleted, the file too", (await MS.getMySignature(JOR)) === null && !existsSync(sigFile));
  await MS.setMySignature(JOR, { method: "drawn", png: sigA, consent: true }, BASE);

  // Sign it now: applied at send, bound to the document's hash.
  const sendTo = async (pricing: unknown, memberSign: string | undefined, blocks = BLOCKS.slice(9)) => {
    const q = await S.createProposal(JOR, { companyId: CEDAR, title: "Cedar and Pine Software · Revenue Program" }, BASE);
    await S.updateProposal(JOR, q.id, { blocks, signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example", title: "CEO" }, ...(pricing ? { pricing } : {}) }, BASE);
    const mk = mails.length;
    await S.sendProposal(JOR, q.id, { ...(memberSign ? { memberSign } : {}), who: { ip: "198.51.100.9", ua: "Mozilla/5.0 (member)" } }, BASE);
    const lk = mails.slice(mk).find((m) => m.to === "dana@cedarandpine.example")!.text.match(/https:\/\/post\.example\.com\/sign\/(\S+)/)![1];
    return { id: q.id, link: lk };
  };
  const signAs = async (lk: string, choice?: unknown) => {
    const v = await S.signerView(lk, who, BASE);
    const mk = mails.length;
    await S.requestCode(lk, who);
    await S.verifyCode(lk, mails.slice(mk).find((m) => m.to === "dana@cedarandpine.example")!.text.match(/\b(\d{6})\b/)![1], who, BASE);
    const mk2 = mails.length;
    const r = await S.signProposal(lk, { name: "Dana Whitfield", consent: true, hash: v.hash, ...(choice ? { choice } : {}) }, who, BASE);
    return { r, mails: mails.slice(mk2) };
  };
  const sendOf = async (id: string) => (await T.loadState()).proposals!.find((q) => q.id === id)!.sends.at(-1)!;
  const now1 = await sendTo(OPTIONS, undefined);
  const xs = await sendOf(now1.id);
  check("sign it now (the default with a saved signature): applied at send, bound to the hash, on the audit trail", xs.memberMode === "now" && xs.member?.how === "saved_at_send" && xs.member.hash === xs.hash && xs.member.kind === "drawn" && xs.member.ip === "198.51.100.9" && xs.events.some((e) => e.kind === "member_signed"));
  check("…the drawing kept with the send, so replacing the saved one changes nothing signed", sha(readFileSync(path.join(dir, "proposals", xs.id, "member-sig.png"))) === xs.member!.pngSha256);
  const nv = await S.signerView(now1.link, who, BASE);
  check("the client's page: the member's side signed, with the drawing", nv.memberMode === "now" && nv.member?.name === "Jordan Avery" && nv.member.img === sigA && !nv.awaitingMember);
  const partiesNow = renderToStaticMarkup(React.createElement(PV.Parties, { doc: nv.doc, client: { state: "here" }, member: { state: PV.memberState(nv.memberMode, nv.member, false), sig: nv.member } }));
  check("…its signature cards: the member signed, the client 'Signs here'", partiesNow.includes("Signs here") && partiesNow.includes("Signed ") && partiesNow.includes(`src="${sigA}"`) && partiesNow.includes("Jordan Avery, Fractional CRO"));
  pipe.length = 0;
  await MS.setMySignature(JOR, { method: "typed", typed: "Jordan Avery", consent: true }, BASE);
  const s1 = await signAs(now1.link, { optionId: "o_lead", addOnIds: [] });
  const xs1 = await sendOf(now1.id);
  check("…the client signs: complete at once (sealed, Won, both emails with the PDF)", s1.r.status === "signed" && !s1.r.awaitingMember && !!xs1.seal && pipe.some((e) => e.kind === "signed") && s1.mails.filter((m) => /^Signed: /.test(m.subject) && m.attachments?.length === 1).length === 2);
  check("…the member's signature on it is still the drawing it was sent with", xs1.member?.kind === "drawn");
  const pdfNow = await textOf((await S.sealedPdf(S.copyToken(xs1.id), BASE))!.bytes);
  const pdfNowAll = pdfNow.all.replace(/\s+/g, " ");
  check("…the PDF: both signatures side by side, how each was made, both consents", pdfNowAll.includes("Signed when sent") && pdfNowAll.includes("Sender, who signs too") && pdfNowAll.includes("their saved signature, applied when they sent it") && pdfNowAll.includes("The consent the sender agreed to") && pdfNowAll.includes("The consent the signer agreed to") && pdfNowAll.includes("Dana Whitfield"), pdfNowAll.slice(-1500));
  const cpNow = await S.signedCopy(S.copyToken(xs1.id), BASE);
  check("…the signed copy: the member's signature with its drawing", cpNow?.member?.how === "saved_at_send" && !!cpNow.member.img && cpNow.memberMode === "now");

  // Countersign after they sign.
  pipe.length = 0;
  const af = await sendTo(OPTIONS, "after");
  const xa = await sendOf(af.id);
  check("countersign mode: frozen into the send, nothing applied yet", xa.memberMode === "after" && !xa.member);
  const av = await S.signerView(af.link, who, BASE);
  check("…the client's page: 'Countersigns after you'", renderToStaticMarkup(React.createElement(PV.Parties, { doc: av.doc, client: { state: "here" }, member: { state: PV.memberState(av.memberMode, av.member, false), sig: av.member } })).includes("Countersigns after you"));
  check("…countersigning before the client signs is refused", /nothing to countersign/.test(String(await refused(S.countersignProposal(JOR, af.id, { method: "saved" }, BASE)))));
  const sa = await signAs(af.link, { optionId: "o_full", addOnIds: ["a_hire"] });
  const xa1 = await sendOf(af.id);
  check("…the client signed: not sealed, not Won, no sealed PDF yet", sa.r.awaitingMember && !xa1.seal && !pipe.some((e) => e.kind === "signed") && (await S.sealedPdf(S.copyToken(xa1.id), BASE)) === null && S.signingState(xa1) === "client_signed" && !S.fullySigned(xa1) && S.fullySignedAt(xa1) === null);
  const toMem = sa.mails.find((m) => m.to === "jor.cv@example.com");
  const toCli = sa.mails.find((m) => m.to === "dana@cedarandpine.example");
  check("…the member: 'Dana signed. Countersign to finish.' with the one link; the client: waiting for the member", /^Dana signed\. Countersign to finish/.test(toMem?.subject ?? "") && toMem!.text.includes(`/?p=proposals&pr=${af.id}&countersign=1`) && /waiting for Jordan Avery to countersign/.test(toCli?.subject ?? "") && sa.mails.every((m) => !m.attachments?.length), sa.mails.map((m) => m.subject));
  const ra = await S.getProposal(JOR, af.id, BASE);
  check("…status for the member: signed, waiting for them; for the client: signed by them, waiting for the member", ra.send?.status === "signed" && ra.send.waiting === "member" && sa.r.awaitingMember && readFileSync("app/post/ProposalParts.tsx", "utf8").includes("waiting for your signature.") && readFileSync("app/sign/Sign.tsx", "utf8").includes("Signed by you · waiting for {d.from.name} to countersign"));
  check("…the client's choice stays locked", /can't change now/.test(String(await refused(S.chooseOption(af.link, { optionId: "o_assess", addOnIds: [] }, BASE)))));
  check("…Home shows it after 24 hours, not before", (await S.countersignDue(JOR, 24)).length === 0 && (await S.countersignDue(JOR, 24, Date.now() + 25 * 3_600_000)).some((d) => d.id === af.id));
  check("…only the member who sent it can countersign", /isn't there anymore/.test(String(await refused(S.countersignProposal(FRE, af.id, { method: "saved" }, BASE)))));
  const mc = mails.length;
  const [c1r, c2r] = await Promise.all([S.countersignProposal(JOR, af.id, { method: "saved", who: { ip: "198.51.100.9", ua: "member" } }, BASE), S.countersignProposal(JOR, af.id, { method: "saved" }, BASE)]);
  const c3r = await S.countersignProposal(JOR, af.id, { method: "saved" }, BASE);
  const xa2 = await sendOf(af.id);
  check("…a double click is safe: one countersignature, one Won, one set of emails", xa2.events.filter((e) => e.kind === "countersigned").length === 1 && pipe.filter((e) => e.kind === "signed").length === 1 && mails.slice(mc).filter((m) => /^Signed: /.test(m.subject)).length === 2 && c1r.send?.waiting === null && c2r.send?.memberSignedAt === c3r.send?.memberSignedAt);
  check("…countersigned: then sealed, Won at the countersignature, the PDF to both", !!xa2.seal && xa2.member?.how === "saved" && xa2.member.hash === xa2.hash && S.fullySignedAt(xa2) === xa2.member.at && pipe.find((e) => e.kind === "signed")?.at === xa2.member.at && mails.slice(mc).filter((m) => m.attachments?.length === 1).length === 2);
  const pdfAf = (await textOf((await S.sealedPdf(S.copyToken(xa2.id), BASE))!.bytes)).all.replace(/\s+/g, " ");
  check("…the PDF: the countersignature, how, and the client's choice", pdfAf.includes("Countersigned") && pdfAf.includes("applied as a countersignature after the client signed") && pdfAf.includes("Full GTM Program") && pdfAf.includes("Jordan Avery"));
  check("…the copy checks out", (await SEAL.checkCopy((await S.sealedPdf(S.copyToken(xa2.id), BASE))!.bytes)).result === "match");
  // Countersign with no saved signature: drawn there, saved for next time.
  await MS.deleteMySignature(JOR);
  const af2 = await sendTo(null, "after");
  await signAs(af2.link);
  check("…no saved signature: a one-click countersign is refused in words", /Set your signature first/.test(String(await refused(S.countersignProposal(JOR, af2.id, { method: "saved" }, BASE)))));
  check("…drawn there without consent refused", /agree/.test(String(await refused(S.countersignProposal(JOR, af2.id, { method: "drawn", png: sigA }, BASE)))));
  await S.countersignProposal(JOR, af2.id, { method: "drawn", png: sigA, consent: true, save: true }, BASE);
  const xa3 = await sendOf(af2.id);
  check("…drawn there: countersigned, and saved for next time", xa3.member?.how === "drawn" && !!xa3.seal && (await MS.getMySignature(JOR))?.kind === "drawn");

  // Sign it now with no saved signature: refused, the other choices still work.
  await MS.deleteMySignature(JOR);
  check("sign it now without a saved signature: refused in words", /Set your signature first/.test(String(await refused(sendTo(null, "now")))));
  await MS.setMySignature(JOR, { method: "drawn", png: sigA, consent: true }, BASE);

  // A void, and a change after sending: the signature goes with the old send and is applied again to the new one.
  const rv = await sendTo(null, "now");
  const old1 = await sendOf(rv.id);
  await S.voidProposal(JOR, rv.id, BASE);
  await S.sendProposal(JOR, rv.id, {}, BASE);
  const new1 = await sendOf(rv.id);
  const allRv = (await T.loadState()).proposals!.find((q) => q.id === rv.id)!;
  check("void then send again: the old send keeps its signature and trail, the new one gets it again for its own hash", new1.id !== old1.id && allRv.sends[0].member?.hash === old1.hash && allRv.sends[0].events.some((e) => e.kind === "member_signed") && new1.member?.hash === new1.hash && new1.member.how === "saved_at_send" && new1.version > old1.version);
  await S.updateProposal(JOR, rv.id, { title: "Cedar and Pine Software · Revenue Program, revised" }, BASE);
  const changed = (await T.loadState()).proposals!.find((q) => q.id === rv.id)!;
  check("a change after sending: a new version, the sent one voided with its signature kept", changed.version === new1.version + 1 && changed.sends.at(-1)!.voided?.why === "changed" && !!changed.sends.at(-1)!.member);
  await S.updateProposal(JOR, rv.id, { memberSign: "after" }, BASE);
  check("the choice of how the member signs is part of the version", (await S.getProposal(JOR, rv.id, BASE)).memberSign === "after");
  await S.sendProposal(JOR, rv.id, {}, BASE);
  check("…sent again: the new choice frozen into the new send", (await sendOf(rv.id)).memberMode === "after" && !(await sendOf(rv.id)).member);

  // No signature from me: today's behaviour.
  const no = await sendTo(null, "none");
  const nov = await S.signerView(no.link, who, BASE);
  check("no signature from me: the member's card says prepared and sent by", nov.memberMode === "none" && !nov.member && renderToStaticMarkup(React.createElement(PV.Parties, { doc: nov.doc, client: { state: "here" }, member: { state: PV.memberState(nov.memberMode, nov.member, false), sig: nov.member } })).includes("Prepared and sent by"));
  const sno = await signAs(no.link);
  const xno = await sendOf(no.id);
  check("…signed: complete at once, as before, no member signature anywhere", sno.r.status === "signed" && !sno.r.awaitingMember && !xno.member && !!xno.seal && !(await textOf((await S.sealedPdf(S.copyToken(xno.id), BASE))!.bytes)).all.includes("Sender, who signs too"));
  H.setPipelineHook(H.proposalToPipeline);

  const LIB = await import("../lib/proposals/library");
  check("the page's own copy of the library's block titles matches templates.json", LIB.BLOCKS.every((b) => SEC.kindOf({ title: b.title }) === b.id));
  check("no outside calls", others === 0, others);

  log0(`\n${passes} passed, ${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  log0("FAIL crashed", e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
