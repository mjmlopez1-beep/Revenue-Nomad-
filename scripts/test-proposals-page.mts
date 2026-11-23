/**
 * Proposals in the new look (app/post/proposalsPage/*, Stage 4 Builder B), with no browser:
 *
 *   the table's rows (model.ts rowOf): status words, reader activity, the next step, the value, when
 *     the link ends, and which views each row is in; drafts never "need you", a client signature does
 *   the examples on a first visit are Example-wrapped and never counted
 *   a template made from a library example reads back into the same sections (the upload's parser)
 *   the editor's outline states (Proof says Evidence Bank is coming)
 *   the client preview freezes what the server would
 *   and in the source: Merlin's AI is Merlin, no export, no ember in the page's CSS, the saving and
 *   the two-tab check are the one editor's, the addresses (pr, new, ct) are unchanged.
 *
 *   npx tsx scripts/test-proposals-page.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Module, { register } from "node:module";
import type { ProposalRec } from "../lib/proposals/types";
import type { ActivityLite } from "../app/post/proposalsPage/model";

// The screens import their CSS: read as nothing here.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const root = path.join(import.meta.dirname, "..");
const src = (f: string) => readFileSync(path.join(root, f), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  if (ok) passes++, console.log(`PASS ${name}`);
  else failures++, console.log(`FAIL ${name}`, info === undefined ? "" : JSON.stringify(info).slice(0, 600));
};

const M = await import("../app/post/proposalsPage/model");
const X = await import("../app/post/examples");
const L = await import("../lib/proposals/library");
const TP = await import("../lib/proposals/templateParse");

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-23T12:00:00Z");
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const base = (over: Partial<ProposalRec> = {}): ProposalRec => ({
  id: "pr_test",
  title: "Fractional VP Sales for Cedar and Pine",
  company: { id: "co_1", name: "Cedar and Pine" },
  templateId: null,
  blocks: [{ id: "b1", blockId: "custom", title: "Summary", body: "Two days a week." }],
  fields: {},
  sources: {},
  notes: [],
  signerOnCall: null,
  signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example", title: "CEO" },
  pricing: null,
  memberSign: "after",
  linkDays: 30,
  version: 1,
  status: "draft",
  createdAt: iso(-3 * DAY),
  updatedAt: iso(-DAY),
  rev: 3,
  send: null,
  history: [],
  ...over,
});
const send = (status: Exclude<ProposalRec["status"], "draft">, over: Partial<NonNullable<ProposalRec["send"]>> = {}): NonNullable<ProposalRec["send"]> => ({
  id: "ps_1",
  version: 1,
  signer: { name: "Dana Whitfield", email: "dana@cedarandpine.example", title: "CEO" },
  status,
  sentAt: iso(-3 * DAY),
  expiresAt: iso(24 * DAY),
  viewedAt: null,
  codeVerifiedAt: null,
  signedAt: null,
  signedName: null,
  declinedAt: null,
  declineReason: null,
  voidedAt: null,
  hash: "x",
  copyUrl: null,
  choice: null,
  sealed: null,
  passedFrom: null,
  passedTo: null,
  memberMode: "after",
  memberSignedAt: null,
  waiting: null,
  events: [],
  ...over,
});
const act = (over: Partial<ActivityLite> = {}): ActivityLite => ({ stats: { opens: 0, readers: 0, ms: 0, option: null, mostRead: null }, suggestion: null, timeline: [], reminders: [], sections: [], ...over });

/* ---------- the table's rows ---------- */
console.log("\nthe table");
const draft = M.rowOf(base({ blocks: [{ id: "b1", blockId: "custom", title: "Fee", body: "{{pricing.monthlyFee}} a month" }] }), null, NOW);
check("a draft: its blanks counted, Finish draft, in Drafts only (never Needs you)", draft.a1 === "1 blank to fill" && draft.next.label === "Finish draft" && !draft.next.main && draft.views.join() === "all,draft", draft);
check("  its link: not sent, 30 days once sent", draft.l1 === "Not sent" && draft.l2 === "30 days once sent");
check("  no end date picked: said so before it is sent", M.rowOf(base({ linkDays: 0 }), null, NOW).l2 === "No end date once sent");
check("  value not set: said, never guessed", draft.val === "Not set yet" && !draft.priced);
const cs = M.rowOf(base({ status: "client_signed", send: send("client_signed", { viewedAt: iso(-2 * DAY), signedAt: iso(-DAY), waiting: "member" }) }), act({ stats: { opens: 3, readers: 1, ms: 120_000, option: null, mostRead: "Pricing" } }), NOW);
check("client signed: Countersign is the main button, in Needs you and Out", cs.next.label === "Countersign" && cs.next.kind === "countersign" && cs.next.main && cs.views.includes("needs") && cs.views.includes("out"), cs);
check("  the status words: Client signed · your turn to countersign", (await import("../app/post/ProposalParts")).STATUS.client_signed === "Client signed · your turn to countersign");
check("  its link line: signed by them, waiting for you, no due mark", cs.l1 === "Signed by them" && cs.l2 === "Waiting for you" && !cs.due);
const sentRow = M.rowOf(base({ status: "sent", send: send("sent", { expiresAt: iso(6 * DAY) }) }), act({ reminders: [{ key: "d2", to: "dana@cedarandpine.example", label: "Day 2", at: iso(DAY), state: "planned", on: true }] }), NOW);
check("sent, not opened: Not opened yet, the next reminder, Out with clients, not Needs you", sentRow.a1 === "Not opened yet" && sentRow.a2 === "Sent 3 days ago." && /^Next reminder: /.test(sentRow.ns) && sentRow.views.join() === "all,out", sentRow);
check("  a link ending within 10 days carries the due mark", sentRow.due && sentRow.l1 === "6 days left");
const sug = { key: "pricing", when: "Follow up tomorrow morning", headline: "Dana is weighing the price", points: [], why: "", draft: "Hi Dana", engaged: true };
const opened = M.rowOf(base({ status: "viewed", send: send("viewed", { viewedAt: iso(-DAY) }) }), act({ stats: { opens: 2, readers: 1, ms: 360_000, option: null, mostRead: "Pricing" }, sections: [{ id: "s1", label: "Pricing", ms: 360_000, top: true }], suggestion: sug }), NOW);
check("opened, with a rule saying follow up: Follow up, its when, in Needs you", opened.next.label === "Follow up" && opened.ns === "Follow up tomorrow morning" && opened.views.includes("needs") && /^Opened twice · 6 min on Pricing$/.test(opened.a1), opened);
const viewedNoBeacon = M.rowOf(base({ status: "viewed", send: send("viewed", { viewedAt: iso(-DAY) }) }), act(), NOW);
check("opened with no reading counted yet: the day it was opened, never 'Opened 0 times'", /^Opened Nov 22$/.test(viewedNoBeacon.a1), viewedNoBeacon.a1);
const noEnd = M.rowOf(base({ status: "sent", send: send("sent", { expiresAt: null }) }), null, NOW);
check("no end date on the link: said so", noEnd.l1 === "No end date");
const signed = M.rowOf(base({ status: "signed", send: send("signed", { signedAt: iso(-2 * DAY), memberSignedAt: iso(-DAY) }) }), null, NOW);
check("signed: See Pipeline, moved to Won, Signed or closed", signed.next.kind === "pipeline" && signed.ns === "Moved to Won" && signed.views.join() === "all,done");
check("what needs you comes first", M.needsFirst([draft, signed, sentRow, cs]).map((r) => r.status).join() === "client_signed,sent,draft,signed");

/* ---------- values ---------- */
console.log("\nvalues");
const pricing = { options: [{ id: "a", name: "Assessment", price: 24000, billing: "once" as const, included: [] }, { id: "b", name: "Lead", price: 11000, billing: "month" as const, included: [], recommended: true }], addOns: [] };
check("the recommended option's price", M.valueOf(base({ pricing })).val === "$11,000 a month" && M.valueOf(base({ pricing })).vs === "2 options, this one recommended", M.valueOf(base({ pricing })));
check("else the fee from the call, with the term", M.valueOf(base({ fields: { "pricing.monthlyFee": "$9,500", "term.initialMonths": "6" } })).val === "$9,500 a month" && M.valueOf(base({ fields: { "pricing.monthlyFee": "$9,500", "term.initialMonths": "6" } })).vs === "6 month term");
check("the seat: the library example's kind, else what the title says", M.seatOf(base({ templateId: "advisory" })) === "Advisory" && M.seatOf(base()) === "Fractional VP Sales" && M.seatOf(base({ title: "Untitled" })) === "Not set yet");

/* ---------- examples ---------- */
console.log("\nfirst visit");
check("two example rows, each wrapped as an Example and labelled", M.EXAMPLE_ROWS.length === 2 && M.EXAMPLE_ROWS.every((x) => X.isExample(x) && x.label === "Example"));
check("  realOnly drops them: never counted", X.realOnly([...M.EXAMPLE_ROWS, draft]).length === 1);
const home = src("app/post/proposalsPage/ProposalsHome.tsx");
check("  the table's counts and views read the member's rows only (examples drawn apart)", /const rows = useMemo\(\(\) => needsFirst\(real\.map/.test(home) && /const count = \(v: ViewKey\) => rows\.filter/.test(home) && !/rows\.push\(.*EXAMPLE/.test(home));
check("  the example rows carry no action but See activity", !/examples\.map[\s\S]{0,3000}onOpen\(/.test(home.slice(home.indexOf("examples.map"), home.indexOf("shown.map"))));

/* ---------- templates ---------- */
console.log("\ntemplates");
check("the library: five examples with their section counts", M.LIBRARY.map((l) => l.sections).join() === "16,15,5,13,9" && M.LIBRARY.every((l) => l.about.length < 60));
for (const l of M.LIBRARY) {
  const md = M.templateMarkdown(l.id, `${l.short}, in your voice`);
  const parsed = TP.parseMarkdown(md, M.BUILT_FROM);
  const want = L.templateBlocks(l.id);
  const same = parsed.sections.length === want.length && parsed.sections.every((s, i) => s.title === want[i].title);
  const ids = parsed.sections.filter((s, i) => s.blockId === want[i].blockId).length;
  check(`  ${l.short}: saved as Markdown, it reads back into the same ${want.length} sections, titled as you named it`, same && parsed.title === `${l.short}, in your voice` && ids >= want.length - 2, { n: parsed.sections.length, title: parsed.title, ids });
}
check("  where it came from: a made one says so, an upload names its file", M.fromWords(M.BUILT_FROM) === "Built from a Merlin example" && M.fromWords("Sprint-SOW.docx") === "Read from Sprint-SOW.docx");
const maker = src("app/post/proposalsPage/TemplateMaker.tsx");
check("  the maker saves through the upload (no new store) and the voice action, and costs nothing", /uploadTemplate\(new File\(\[md\], BUILT_FROM/.test(maker) && /type: "voice"/.test(maker) && /uses no credits and none of your Merlin allowance/.test(maker));
check("  the signature step is the saved signature, its consent box unticked until ticked", /<MySignature value=\{sig\.sig\}/.test(maker) && /const \[agree, setAgree\] = useState\(false\)/.test(src("app/post/MySignature.tsx")));
check("  removing a template can be undone, and still goes once the moment passes or the page closes", /Template removed\. Proposals you made from it stay\./.test(home) && /goneTimer\.current = setTimeout/.test(home) && /if \(goneRef\.current\) void reallyRemove/.test(home));

/* ---------- the editor ---------- */
console.log("\nthe editor");
const p0 = base({ blocks: [L.makeBlock("proof"), { id: "b2", blockId: "investment", title: "Investment", body: "{{pricing.monthlyFee}}" }, L.makeBlock("signature")], pricing });
const f0 = L.docFields(p0);
check("Proof with no case: Needs a case (Merlin never writes one)", M.blockState(p0.blocks[0], p0, f0).text === "Needs a case" && M.blockState(p0.blocks[0], p0, f0).tone === "fix");
const pEv = { ...p0, fields: { ...p0.fields, caseStudies: "A health care company, $20M to $50M. Forecast miss: 30% to 8%.\nAn EdTech company. Sales cycle: 74 days to 51 days." }, proofCases: ["ev1", "ev2"] };
check("Proof from Evidence Bank: how many cases it holds", M.blockState(pEv.blocks[0], pEv, L.docFields(pEv)).text === "2 cases from Evidence Bank" && M.blockState(pEv.blocks[0], pEv, L.docFields(pEv)).tone === "ready");
check("Proof written by hand (no case ids): read as any section", M.blockState(p0.blocks[0], { ...p0, fields: { ...p0.fields, caseStudies: "My own words" } }, L.docFields({ ...p0, fields: { ...p0.fields, caseStudies: "My own words" } })).text !== "Needs a case");
check("Proof without Close (read only): no word of Evidence Bank, a Close feature", !/Evidence Bank|Needs a case/.test(M.blockState(p0.blocks[0], p0, f0, { close: false }).text));
check("a section with a blank says how many", M.blockState(p0.blocks[1], p0, f0).text === "1 blank");
check("the signature says how you sign", M.blockState(p0.blocks[2], { ...p0, memberSign: "after" }, f0).text === "You countersign" || M.blockState(p0.blocks[2], { ...p0, memberSign: "after" }, f0).tone === "fix");
check("a change shown and not accepted is marked", M.blockState(p0.blocks[1], p0, f0, { marked: true }).text === "Changed, not saved yet");
const fz = M.frozenOf(p0, true, "2026-11-23T00:00:00.000Z");
check("the client preview freezes what the server sends: blocks with their kind, options only on Close", fz.blocks.length === 3 && fz.blocks[0].kind === "proof" && !!fz.pricing && !M.frozenOf(p0, false).pricing && fz.to.name === "Dana Whitfield");
const frame = src("app/post/proposalsPage/EditorFrame.tsx");
const proofPanel = src("app/post/proposalsPage/ProofPanel.tsx");
const prSrc = src("app/post/Proposals.tsx");
check("Proof is Evidence Bank's panel on Close (no placeholder left)", /b\.blockId === "proof" && !x\.locked && <ProofPanel/.test(frame) && !/Evidence Bank is coming/.test(frame));
check("  the panel: Swap case, Add a case, Send without Proof, and Merlin never writes a case", /Swap case/.test(proofPanel) && /Add a case/.test(proofPanel) && /Send without Proof/.test(proofPanel) && /Merlin never writes (a case|one) for you/.test(proofPanel) && /Your other cases, closest first/.test(proofPanel));
check("  a pick saves through the editor's own save (revision, retry, stash): fields and proofCases", /const setProof = \(ids: string\[\], text: string\)/.test(prSrc) && /change\(\{ fields: f, sources: \{ \.\.\.p\.sources, caseStudies: "evidence" \}, proofCases/.test(prSrc) && /"pricing", "proofCases"\]/.test(prSrc));
check("  read only (sent, signed, a change shown): the cases show without controls", /readOnly=\{x\.readOnly \|\| x\.previewing\}/.test(frame) && /!readOnly && \(/.test(proofPanel));
check("the right panel: Change it, Pricing, Send", /\["change", "Change it"\]/.test(frame) && /\["pricing", "Pricing"\]/.test(frame) && /"Send"\]/.test(frame));
const pr = src("app/post/Proposals.tsx");
check("one editor saves for both looks: one flush, the revision sent, the conflict banner and the stash", (pr.match(/const flush = useCallback/g) ?? []).length === 1 && /op: "update", id, rev: rev\.current/.test(pr) && (pr.match(/This proposal changed in another tab or window\./g) ?? []).length === 2 && /writeStash\(id, \{ rev: rev\.current, body: pending\.current \}\)/.test(pr));
check("  the new look's editor is the same Editor, drawn by EditorFrame (the leave guard and Esc stay)", /if \(ui2\) \{[\s\S]*<EditorFrame/.test(pr) && /useLeaveGuard\(okToLeave\)/.test(pr) && /e\.key !== "Escape"/.test(pr) && /el\?\.closest\("input, textarea, select, \[contenteditable='true'\]"\)/.test(pr));
check("  its activity reloads with the revision", (pr.match(/version=\{`\$\{p\.version\}:\$\{p\.rev\}:\$\{p\.status\}`\}/g) ?? []).length === 2);
check("  the addresses: pr, dc, new and ct, as before", /const SUB_KEYS = \["pr", "dc", "new", "ct"\] as const;/.test(pr) && /starting && data\?\.canBuild \? \{ new: true \}/.test(pr));
check("  one count of fixes: the same FixLine and fixesFor in both looks", (pr.match(/<FixLine fixes=\{fixes\} blanks=\{blanks\.length\} \/>/g) ?? []).length === 2 && /const fixes = useMemo\(\(\) => fixesFor\(p, view, toFix\)/.test(pr));
const parts = src("app/post/ProposalParts.tsx");
check("Send in the tab saves the reminders first, as the sheet does (one hook)", /export function useSend\(/.test(parts) && parts.indexOf("await saveReminders(") < parts.indexOf('op: "send"') && (parts.match(/<SendReminders value=\{f\.rem\} onChange=\{f\.setRem\} noEnd=\{f\.days === 0\}/g) ?? []).length === 1);
check("  the link's length: 30 days unless picked, 14 to 90 or no end date", /LINK_DAYS\.map/.test(parts) && /useState<LinkDays>\(p\.linkDays \?\? 30\)/.test(parts));

/* ---------- words and rules ---------- */
console.log("\nwords and rules");
const files = ["app/post/proposalsPage/ProposalsHome.tsx", "app/post/proposalsPage/EditorFrame.tsx", "app/post/proposalsPage/TemplateMaker.tsx", "app/post/proposalsPage/LiveSteps.tsx", "app/post/proposalsPage/ClientPreview.tsx", "app/post/proposalsPage/model.ts"];
check("Merlin's AI is Merlin: no Claude or Anthropic in the new screens", files.every((f) => !/Claude|Anthropic/.test(strip(src(f)))), files.filter((f) => /Claude|Anthropic/.test(strip(src(f)))));
check("no export: no download, CSV or PDF action on the list", !/Download as PDF|\.csv|>\s*Export/i.test(strip(home)));
check("no ember in the page's own CSS (the shell's bell and Hiring now keep the budget)", !/--ember|#ff5a1f/i.test(src("app/post/proposalsPage/proposalsPage.css")));
check("plan names: the trial is the Close trial, Close is $79 a month", /TRIAL_NAME/.test(home) && /PRICES\.closeMonth/.test(home) && !/Pro trial/.test(home));
const all = files.map((f) => strip(src(f))).join("\n");
const jsx = [...all.matchAll(/>\s*([A-Z][^<>{}=]*?)\s*</g)].map((m) => m[1]);
check("no exclamation marks in the screens' words", !jsx.some((t) => t.includes("!")), jsx.filter((t) => t.includes("!")));
check("live drafting: the steps as they come, what is next, and a clock so it never looks frozen", /Working for \$\{secs\} seconds/.test(src("app/post/proposalsPage/LiveSteps.tsx")) && /role="progressbar"/.test(src("app/post/proposalsPage/LiveSteps.tsx")) && /data-state="next"/.test(src("app/post/proposalsPage/LiveSteps.tsx")));
check("the start panel keeps the consent box unticked until the member agreed once", /useState\(data\.ai === "on" && !!data\.aiAgreed\)/.test(src("app/post/ProposalStart.tsx")));

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
