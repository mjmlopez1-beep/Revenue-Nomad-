/**
 * Checks of documents to sign (lib/documents, app/api/documents, the document side of app/api/sign).
 * No server: lib/table.ts runs in process on a made-up seed in a temporary data dir, billing live
 * with made-up Stripe settings, email "on" with a fake endpoint, and fetch replaced, so nothing
 * leaves the machine and every email is caught. The PDFs are made here with pdf-lib.
 *
 *   npx tsx scripts/test-documents.mts      exits 1 on any failure
 *
 * Covered: the upload (a PDF only, a Word file and a broken file refused in words, the size cap,
 * kept on the data volume and private, its SHA-256), placing fields (every kind, kept on the page,
 * a new signer's fields keep their signer), signers in order (the sender too), the plan gate,
 * sending (only the first signer's link, the pipeline told), the signer's side (waiting for their
 * turn, the email code, consent, the hash, required fields, typed and drawn signatures, only their
 * own fields), the next signer told, the final PDF (the values stamped in, read back with pdf.js,
 * page count with pdf-lib, the audit trail page with both fingerprints, emails, IPs, browsers and
 * the consent version), the final file's SHA-256 recorded, everyone emailed the PDF, the finished
 * page and its download, decline and void, an expired or tampered link, and privacy (another
 * member, the export, the table).
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

const dir = mkdtempSync(path.join(tmpdir(), "rn-documents-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "Manufacturing", employees: "51–200", revenue: "$5M–$20M", hq: "Columbus, OH" } });
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.docs@example.com`, title, token: `tok-${id.slice(4)}-docs` });
const members = [member("mem_pat", "Pat Rowan", "Fractional VP Sales"), member("mem_oth", "Oona Other", "Fractional CMO"), member("mem_fre", "Fred Free", "Fractional VP Sales")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies: [co("c_acme", "Acme Robotics", "acmerobotics.example")], engagements: [], contacts: [] }));
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_pat: { function: "Sales", title: "Fractional VP Sales", onboarded: true }, mem_oth: { function: "Marketing", onboarded: true }, mem_fre: { function: "Sales", onboarded: true } },
    billing: { members: { mem_pat: trial, mem_oth: trial, mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-documents",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  RN_DOC_MAX_MB: "2",
  STRIPE_SECRET_KEY: "sk_test_documents",
  STRIPE_WEBHOOK_SECRET: "whsec_test_documents",
  STRIPE_PRICE_MONTH: "price_month_documents",
  STRIPE_PRICE_YEAR: "price_year_documents",
  RESEND_API_KEY: "test-key-documents",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "http://127.0.0.1:9/fake-email",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_EMAIL_REPLY_TO", "RN_AI_DRAFTS"]) delete process.env[k];

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

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 700)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** A tiny PNG (a drawn signature), made here. */
function png(w = 40, h = 12): string {
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
  const rows = Buffer.concat(Array.from({ length: h }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, (_, x) => Buffer.from(x === y * 3 ? [10, 26, 19, 255] : [0, 0, 0, 0])))])));
  const b = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${b.toString("base64")}`;
}

async function main() {
  const T = await import("../lib/table");
  const S = await import("../lib/documents/store");
  const PS = await import("../lib/proposals/store");
  const H = await import("../lib/proposals/pipelineHook");
  const { CONSENT_VERSION } = await import("../lib/proposals/types");
  const { PDFDocument, StandardFonts, degrees } = await import("pdf-lib");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const textOf = async (bytes: Uint8Array) => {
    const d = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
    const out: string[] = [];
    for (let i = 1; i <= d.numPages; i++) out.push(((await (await d.getPage(i)).getTextContent()).items as { str: string }[]).map((x) => x.str).join(" "));
    return out;
  };

  const BASE = "https://post.example.com";
  const PAT = "tok-pat-docs";
  const OTH = "tok-oth-docs";
  const FRE = "tok-fre-docs";
  const who = { ip: "203.0.113.9", ua: "Mozilla/5.0 (made-up signer browser)" };
  const who2 = { ip: "198.51.100.4", ua: "Mozilla/5.0 (second made-up browser)" };
  const ACME = T.tableInternals.pubId("c_acme");
  const pipe: { companyId: string; kind: string; from?: unknown }[] = [];
  H.setPipelineHook((s, memberId, companyId, kind, at, from) => {
    pipe.push({ companyId, kind, from });
    return H.proposalToPipeline(s, memberId, companyId, kind, at, from);
  });
  const deals = async () => ((await T.loadState()).pipeline?.mem_pat?.entries ?? []).filter((e) => e.companyId === "c_acme");
  const tokenOf = (t: string) => t.match(/\/sign\/(ds_[^\s"<]+)/)?.[1] ?? "";
  const lastTo = (to: string) => [...mails].reverse().find((m) => m.to === to);

  // A made-up agreement, two pages, the second one turned (a landscape schedule).
  const src = await PDFDocument.create();
  const f = await src.embedFont(StandardFonts.Helvetica);
  const p1 = src.addPage([612, 792]);
  p1.drawText("Consulting Agreement between Pat Rowan and Acme Robotics", { x: 54, y: 730, size: 14, font: f });
  p1.drawText("Client signature:", { x: 54, y: 200, size: 10, font: f });
  const p2 = src.addPage([612, 792]);
  p2.setRotation(degrees(90));
  p2.drawText("Schedule A", { x: 54, y: 730, size: 14, font: f });
  const original = await src.save();

  /* ================= upload ================= */
  console.log("\nupload");
  check("not a PDF: refused", (await refused(S.uploadDocument(PAT, "notes.pdf", Buffer.from("hello there, not a pdf"), BASE)))?.includes("isn't a PDF"));
  check("a Word file: PDF only, and how to make one", (await refused(S.uploadDocument(PAT, "contract.docx", Buffer.from("PK..."), BASE)))?.includes("Save as or Download, then PDF"));
  check("a broken PDF: refused in words", /didn't open|no pages/.test((await refused(S.uploadDocument(PAT, "x.pdf", Buffer.from("%PDF-1.7\nnot really"), BASE))) ?? ""));
  check("over the size cap (RN_DOC_MAX_MB): refused", (await refused(S.uploadDocument(PAT, "big.pdf", Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2.2 * 1024 * 1024)]), BASE)))?.includes("over 2 MB"));
  check("signed out: refused", (await refused(S.uploadDocument(null, "a.pdf", original, BASE)))?.includes("signed out"));
  let d = await S.uploadDocument(PAT, "Acme consulting agreement.pdf", original, BASE);
  check("uploaded: a draft, its pages as shown (the turned page landscape), its SHA-256", d.status === "draft" && d.pages.length === 2 && d.pages[0].w === 612 && d.pages[1].w === 792 && d.pages[1].h === 612 && d.sha256 === sha(original) && d.title === "Acme consulting agreement", d.pages);
  const file = path.join(dir, "documents", d.id, "original.pdf");
  check("the PDF is on the data volume, private to the server (0600), byte for byte", existsSync(file) && (statSync(file).mode & 0o777) === 0o600 && sha(readFileSync(file)) === sha(original));
  check("never in the state", !readFileSync(path.join(dir, "intel.json"), "utf8").includes(Buffer.from(original).subarray(0, 400).toString("base64").slice(0, 60)) && readFileSync(path.join(dir, "intel.json"), "utf8").length < 20_000);
  check("it lists with the proposals", (await PS.listProposals(PAT, BASE)).documents.some((x) => x.id === d.id));

  /* ================= fields and signers ================= */
  console.log("\nfields and signers");
  await T.perform(PAT, { type: "unlock", entity: "company", id: ACME, field: "identity" } as never, BASE);
  const fieldsFor = (dana: string, me: string) => [
    { id: "sig1", page: 0, x: 0.1, y: 0.72, w: 0.3, h: 0.05, kind: "signature", signer: dana },
    { id: "dat1", page: 0, x: 0.5, y: 0.72, w: 0.18, h: 0.03, kind: "date", signer: dana },
    { id: "nam1", page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.03, kind: "name", signer: dana },
    { id: "ini1", page: 1, x: 0.8, y: 0.85, w: 0.08, h: 0.05, kind: "initials", signer: dana },
    { id: "txt1", page: 0, x: 0.5, y: 0.8, w: 0.3, h: 0.03, kind: "text", signer: dana, label: "Start date", required: true },
    { id: "box1", page: 0, x: 0.1, y: 0.86, w: 0.03, h: 0.023, kind: "checkbox", signer: dana, required: true },
    { id: "sig2", page: 0, x: 0.5, y: 0.9, w: 0.3, h: 0.05, kind: "signature", signer: me },
    { id: "bad1", page: 7, x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: "signature", signer: dana },
    { id: "bad2", page: 0, x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: "stamp", signer: dana },
    { id: "far1", page: 0, x: 1.4, y: -2, w: 0.2, h: 0.04, kind: "text", signer: dana, required: false },
  ];
  d = await S.updateDocument(
    PAT,
    d.id,
    {
      title: "Acme consulting agreement",
      companyId: ACME,
      signers: [
        { id: "new_dana", name: "Dana Whitfield", email: "Dana@AcmeRobotics.example", title: "COO" },
        { id: "new_me", name: "Pat Rowan", email: "pat.docs@example.com" },
      ],
      fields: fieldsFor("new_dana", "new_me"),
    },
    BASE,
  );
  const dana = d.signers[0];
  const meS = d.signers[1];
  check("signers in order, emails lowercased, Merlin's own ids", d.signers.map((x) => x.email).join() === "dana@acmerobotics.example,pat.docs@example.com" && /^ds_/.test(dana.id) && /^ds_/.test(meS.id) && d.ordered);
  check("the member as a signer is marked as the sender", meS.sender && !dana.sender);
  check("fields placed in the same change keep their new signer", d.fields.filter((x) => x.signer === dana.id).length === 7 && d.fields.find((x) => x.id === "sig2")?.signer === meS.id, d.fields.map((x) => [x.id, x.signer]));
  check("a field off the pages or of no known kind is dropped; one off the edge is kept on the page", !d.fields.some((x) => x.id === "bad1" || x.id === "bad2") && (() => { const x = d.fields.find((y) => y.id === "far1")!; return x.x === 0.8 && x.y === 0; })(), d.fields.find((y) => y.id === "far1"));
  check("the company attached, named as she can see it", d.company.id === ACME && d.company.name === "Acme Robotics");
  check("the same email twice is refused", (await refused(S.updateDocument(PAT, d.id, { signers: [{ name: "A B", email: "x@y.example" }, { name: "C D", email: "X@y.example" }] }, BASE)))?.includes("twice"));
  check("a signer needs a name and an email", (await refused(S.updateDocument(PAT, d.id, { signers: [{ name: "", email: "x@y.example" }] }, BASE)))?.includes("name"));

  /* ================= plans and readiness ================= */
  console.log("\nplans");
  const fd = await S.uploadDocument(FRE, "free.pdf", original, BASE);
  check("Free: can upload and prepare a document", fd.status === "draft");
  const fsend = await S.sendDocument(FRE, fd.id, {}, BASE).then(() => null, (e: InstanceType<typeof PS.ProposalProblem>) => e);
  check("Free: sending is Pro's, with the price and the upgrade link", fsend?.status === 403 && /on Pro: \$59 a month/.test(fsend.message) && /p=billing/.test(fsend.upgrade ?? ""), fsend?.message);
  const nod = await S.uploadDocument(PAT, "nobody.pdf", original, BASE);
  check("no signers: can't go out", (await refused(S.sendDocument(PAT, nod.id, {}, BASE)))?.includes("Add who signs"));
  await S.updateDocument(PAT, nod.id, { signers: [{ id: "new_a", name: "Ann Lee", email: "ann@lee.example" }], fields: [{ page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.03, kind: "date", signer: "new_a" }] }, BASE);
  check("a signer without a Signature field: can't go out", (await refused(S.sendDocument(PAT, nod.id, {}, BASE)))?.includes("Place a Signature field for Ann Lee"));

  /* ================= send ================= */
  console.log("\nsend");
  const m0 = mails.length;
  const sent = await S.sendDocument(PAT, d.id, { message: "Here's the agreement we discussed." }, BASE);
  d = sent.document;
  const out1 = mails.slice(m0);
  check("in order: only the first signer gets their link", out1.length === 1 && out1[0].to === "dana@acmerobotics.example" && /sent you Acme consulting agreement to sign/.test(out1[0].subject) && /Here's the agreement we discussed/.test(out1[0].text), out1.map((m) => [m.to, m.subject]));
  check("status Sent, the others waiting, 30 days", d.status === "sent" && d.signers[0].status === "sent" && d.signers[1].status === "waiting" && Date.parse(d.expiresAt!) - Date.parse(d.sentAt!) === 30 * DAY);
  check("the pipeline moves to Proposal, to the first signer who isn't the sender", pipe.some((x) => x.kind === "proposal_sent" && x.companyId === "c_acme") && (await deals())[0]?.stage === "proposal" && (await deals())[0]?.to.name === "Dana Whitfield", await deals());
  check("once sent it can't change", (await refused(S.updateDocument(PAT, d.id, { title: "Changed" }, BASE)))?.includes("can't change"));
  check("nor be deleted while it's out", (await refused(S.deleteDocument(PAT, d.id)))?.includes("Void it first"));
  const danaTok = tokenOf(out1[0]?.text ?? "");
  check("the link is the signer's own, signed", S.readDocSignToken(danaTok)?.signerId === dana.id);

  /* ================= the first signer ================= */
  console.log("\nthe first signer");
  let v = await S.docSignerView(danaTok, who, BASE);
  check("her view: open, her own fields only, the pages and the document's hash", v.status === "open" && v.fields.length === 7 && v.fields.every((x) => x.signer === dana.id) && v.pages.length === 2 && v.sha256 === d.sha256 && v.from.name === "Pat Rowan");
  check("who else signs, never their email", v.others.length === 1 && v.others[0].name === "Pat Rowan" && !JSON.stringify(v).includes("pat.docs@example.com"));
  check("the consent is the proposals' words, for a document, with its version", /electronic signature for this document/.test(v.consent) && /drawing my signature/.test(v.consent) && v.consentVersion === CONSENT_VERSION);
  check("the original PDF, from her link", sha(await S.signerFile(danaTok)) === sha(original));
  check("the first open is on the trail, with her IP and browser", (await S.getDocument(PAT, d.id, BASE)).events.some((e) => e.kind === "viewed" && e.who === "dana@acmerobotics.example" && e.ip === who.ip && e.ua === who.ua));
  const meTok = (await S.myDocLink(PAT, d.id, BASE).then(() => "", (e: Error) => e.message));
  check("the sender's own link waits for their turn", meTok.includes("isn't your turn"));
  check("signing before the code is refused", (await refused(S.docSign(danaTok, { name: "Dana Whitfield", consent: true, hash: v.sha256, values: { txt1: "Dec 1", box1: true } }, who, BASE)))?.includes("code first"));
  await S.docRequestCode(danaTok, who);
  const code = lastTo("dana@acmerobotics.example")?.text.match(/Your code: (\d{6})/)?.[1] ?? "";
  check("a 6-digit code to her email", /^\d{6}$/.test(code));
  check("a wrong code is refused and counted", (await refused(S.docVerifyCode(danaTok, code === "000000" ? "111111" : "000000", who, BASE)))?.includes("didn't match"));
  v = await S.docVerifyCode(danaTok, code, who, BASE);
  check("the right code confirms her email", v.codeVerified);
  check("consent is needed", (await refused(S.docSign(danaTok, { name: "Dana Whitfield", consent: false, hash: v.sha256, values: {} }, who, BASE)))?.includes("Tick the box"));
  check("a full name is needed", (await refused(S.docSign(danaTok, { name: "Dana", consent: true, hash: v.sha256, values: {} }, who, BASE)))?.includes("full name"));
  check("the document she read must be the one signed", (await refused(S.docSign(danaTok, { name: "Dana Whitfield", consent: true, hash: "0".repeat(64), values: {} }, who, BASE)))?.includes("out of date"));
  check("a required text field must be filled", (await refused(S.docSign(danaTok, { name: "Dana Whitfield", consent: true, hash: v.sha256, values: { box1: true } }, who, BASE)))?.includes('"Start date"'));
  check("a required box must be ticked", (await refused(S.docSign(danaTok, { name: "Dana Whitfield", consent: true, hash: v.sha256, values: { txt1: "December 1, 2026" } }, who, BASE)))?.includes("Tick"));
  const m1 = mails.length;
  v = await S.docSign(danaTok, { name: "Dana Whitfield", method: "typed", consent: true, hash: v.sha256, values: { txt1: "December 1, 2026", box1: true, ini1: "dw", sig2: "not hers" } }, who, BASE);
  check("signed: her view says so, and it's not complete yet", v.status === "signed" && !v.copyUrl);
  const afterDana = mails.slice(m1);
  check("the next signer (the sender) gets their link, told who signed before", afterDana.length === 1 && afterDana[0].to === "pat.docs@example.com" && /Your turn to sign/.test(afterDana[0].subject) && /Dana Whitfield signed it/.test(afterDana[0].text), afterDana.map((m) => [m.to, m.subject]));
  const st = (await T.loadState()).documents!.find((x) => x.id === d.id)!;
  const sd = st.signers[0];
  check("only her own fields took her values (another signer's field ignored)", sd.values?.txt1 === "December 1, 2026" && sd.values.box1 === "yes" && sd.values.ini1 === "DW" && !("sig2" in (sd.values ?? {})), sd.values);
  check("her signature: time, IP, browser, typed, consent and version, the hash", sd.signed?.ip === who.ip && sd.signed.ua === who.ua && sd.signed.method === "typed" && sd.signed.consentVersion === CONSENT_VERSION && sd.signed.hash === sha(original) && /electronic signature/.test(sd.signed.consent));
  check("she can't sign twice", (await refused(S.docSign(danaTok, { name: "Dana Whitfield", consent: true, hash: v.sha256, values: {} }, who, BASE)))?.includes("signed it already"));
  check("the pipeline isn't Won until everyone has signed", (await deals())[0]?.stage === "proposal");

  /* ================= the sender signs last: drawn ================= */
  console.log("\nthe second signer, drawn");
  const myLink = (await S.myDocLink(PAT, d.id, BASE)).link;
  const meTok2 = tokenOf(myLink);
  check("the sender's own link, now it's their turn", S.readDocSignToken(meTok2)?.signerId === meS.id && tokenOf(afterDana[0]?.text ?? "") === meTok2);
  check("another member can't get it", (await refused(S.myDocLink(OTH, d.id, BASE)))?.includes("isn't there"));
  await S.docSignerView(meTok2, who2, BASE);
  await S.docRequestCode(meTok2, who2);
  const code2 = lastTo("pat.docs@example.com")?.text.match(/Your code: (\d{6})/)?.[1] ?? "";
  await S.docVerifyCode(meTok2, code2, who2, BASE);
  check("a drawing that isn't a PNG is refused", (await refused(S.docSign(meTok2, { name: "Pat Rowan", method: "drawn", png: "data:image/png;base64,AAAA", consent: true, hash: d.sha256, values: {} }, who2, BASE)))?.includes("drawing didn't come through"));
  const m2 = mails.length;
  v = await S.docSign(meTok2, { name: "Pat Rowan", method: "drawn", png: png(), consent: true, hash: d.sha256, values: {} }, who2, BASE);
  check("the last signature finishes it", v.status === "done" && !!v.copyUrl);
  d = await S.getDocument(PAT, d.id, BASE);
  check("status Signed, with the final file's SHA-256", d.status === "signed" && !!d.completedAt && /^[0-9a-f]{64}$/.test(d.finalSha256 ?? ""));
  const finalBytes = readFileSync(path.join(dir, "documents", d.id, "final.pdf"));
  check("the final file is on the volume, private, and its SHA-256 is the one recorded", (statSync(path.join(dir, "documents", d.id, "final.pdf")).mode & 0o777) === 0o600 && sha(finalBytes) === d.finalSha256);
  const fpdf = await PDFDocument.load(finalBytes);
  check("pdf-lib: the original's 2 pages, then the audit trail", fpdf.getPageCount() >= 3 && fpdf.getPage(1).getRotation().angle === 90, fpdf.getPageCount());
  const pages = await textOf(finalBytes);
  check("page 1 has the stamped values: her name (signature and full name), the text field, the box ticked, the date", (pages[0].match(/Dana Whitfield/g) ?? []).length >= 2 && pages[0].includes("December 1, 2026") && / X( |$)/.test(pages[0]) && pages[0].includes(new Date(sd.signed!.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })), pages[0]);
  check("the turned page has her initials", pages[1].includes("DW"), pages[1]);
  const audit = pages.slice(2).join(" ");
  check("the audit page: the original's SHA-256 and the signed pages'", audit.includes("Audit trail") && audit.includes(sha(original)) && audit.includes((await T.loadState()).documents!.find((x) => x.id === d.id)!.completed!.signedPagesSha256), audit.slice(0, 300));
  check("the audit page: every signer's email, IP, browser, how they signed, timestamps", ["dana@acmerobotics.example", "pat.docs@example.com", who.ip, who2.ip, "made-up signer browser", "drawing their signature", 'typing "Dana Whitfield"', "Email confirmed with the code", " UTC"].every((t) => audit.includes(t)), audit.slice(0, 1200));
  check("the audit page: the consent and its version", audit.includes(`version ${CONSENT_VERSION}`) && audit.includes("electronic signature for this document"));
  const done = mails.slice(m2).filter((m) => /Signed by everyone/.test(m.subject));
  check("everyone gets the final PDF attached, with its page and fingerprint", done.length === 2 && done.map((m) => m.to).sort().join() === "dana@acmerobotics.example,pat.docs@example.com" && done.every((m) => m.attachments?.length === 1 && sha(Buffer.from(m.attachments[0].content, "base64")) === d.finalSha256 && m.text.includes(d.finalSha256!) && /\/signed\/dc_/.test(m.text)), done.map((m) => [m.to, m.attachments?.length]));
  check("the trail: completed and the copies sent", d.events.some((e) => e.kind === "completed") && d.events.some((e) => e.kind === "copy_sent"));
  check("the pipeline: Won", pipe.some((x) => x.kind === "signed" && x.companyId === "c_acme") && (await deals())[0]?.stage === "won", await deals());
  const copyTok = d.copyUrl!.split("/signed/")[1];
  const page = await S.docCopy(copyTok, BASE);
  check("the finished page: who signed, how, the three fingerprints and the download", page?.signers.length === 2 && page.signers[1].method === "drawn" && page.sha256 === sha(original) && page.finalSha256 === d.finalSha256 && /api\/documents\/file\?c=/.test(page.download));
  check("the download from the finished page's link is the final file", sha((await S.copyFile(copyTok))!.bytes) === d.finalSha256);
  check("a tampered finished link: nothing", (await S.docCopy(`${copyTok.slice(0, -2)}xx`, BASE)) === null && (await S.copyFile(`${copyTok.slice(0, -2)}xx`)) === null);
  check("the member's own download: the final file", sha((await S.ownerFile(PAT, d.id, true)).bytes) === d.finalSha256);
  check("signed: kept, can't be deleted or voided", (await refused(S.deleteDocument(PAT, d.id)))?.includes("kept") && (await refused(S.voidDocument(PAT, d.id, BASE)))?.includes("can't be voided"));
  const copy = await S.copyDocument(PAT, d.id, BASE);
  check("copy: a new draft from the same PDF, signers and fields, nobody signed", copy.status === "draft" && copy.sha256 === d.sha256 && copy.fields.length === d.fields.length && copy.signers.every((x) => x.status === "waiting") && copy.signers.every((x, i) => x.id !== d.signers[i].id));

  /* ================= at once, decline, void, expiry ================= */
  console.log("\ndecline, void, expiry");
  const two = await S.uploadDocument(PAT, "nda.pdf", original, BASE);
  await S.updateDocument(
    PAT,
    two.id,
    {
      ordered: false,
      companyId: ACME,
      signers: [
        { id: "new_a", name: "Ann Lee", email: "ann@lee.example" },
        { id: "new_b", name: "Ben Ode", email: "ben@ode.example" },
      ],
      fields: [
        { page: 0, x: 0.1, y: 0.1, w: 0.3, h: 0.05, kind: "signature", signer: "new_a" },
        { page: 0, x: 0.5, y: 0.1, w: 0.3, h: 0.05, kind: "signature", signer: "new_b" },
      ],
    },
    BASE,
  );
  const m3 = mails.length;
  await S.sendDocument(PAT, two.id, {}, BASE);
  const both = mails.slice(m3);
  check("all at once: both get their link", both.map((m) => m.to).sort().join() === "ann@lee.example,ben@ode.example");
  const annTok = tokenOf(both.find((m) => m.to === "ann@lee.example")!.text);
  const benTok = tokenOf(both.find((m) => m.to === "ben@ode.example")!.text);
  const m4 = mails.length;
  const dv = await S.docDecline(annTok, { reason: "We need a shorter term." }, who, BASE);
  check("decline: her view, the member emailed with the reason", dv.status === "declined" && mails.slice(m4).some((m) => m.to === "pat.docs@example.com" && /Ann Lee declined nda/.test(m.subject) && /shorter term/.test(m.text)));
  check("decline: the document is Declined and the other link stops", (await S.getDocument(PAT, two.id, BASE)).status === "declined" && (await S.docSignerView(benTok, who, BASE)).status === "declined" && (await refused(S.docRequestCode(benTok, who)))?.includes("declined"));
  check("decline: the pipeline moves to Lost", pipe.some((x) => x.kind === "declined") && pipe.filter((x) => x.kind === "declined").every((x) => (x.from as { document?: unknown })?.document));
  check("the signer's file stops with it", (await refused(S.signerFile(benTok)))?.includes("declined"));

  const three = await S.copyDocument(PAT, two.id, BASE);
  const m5 = mails.length;
  await S.sendDocument(PAT, three.id, {}, BASE);
  const t3 = tokenOf(mails.slice(m5).find((m) => m.to === "ann@lee.example")!.text);
  const voided = await S.voidDocument(PAT, three.id, BASE);
  check("void: Voided, the links stop", voided.status === "void" && (await S.docSignerView(t3, who, BASE)).status === "void" && (await refused(S.docSign(t3, { name: "Ann Lee", consent: true, hash: three.sha256, values: {} }, who, BASE)))?.includes("withdrew"));
  check("void: once", (await refused(S.voidDocument(PAT, three.id, BASE)))?.includes("isn't out"));
  check("a voided draft can be deleted, and its files go", (await S.deleteDocument(PAT, three.id), !existsSync(path.join(dir, "documents", three.id))));

  const four = await S.copyDocument(PAT, two.id, BASE);
  const m6 = mails.length;
  await S.sendDocument(PAT, four.id, {}, BASE);
  const t4 = tokenOf(mails.slice(m6).find((m) => m.to === "ben@ode.example")!.text);
  check("an expired link says so", (await S.docSignerView(t4, who, BASE, Date.now() + 31 * DAY)).status === "expired" && (await refused(S.docRequestCode(t4, who, Date.now() + 31 * DAY)))?.includes("expired"));
  check("a tampered link: nothing", (await refused(S.docSignerView(`${t4.slice(0, -3)}abc`, who, BASE)))?.includes("doesn't work") && (await refused(S.docSignerView("ds_notarealsigner.1.x", who, BASE)))?.includes("doesn't work"));
  check("a proposal's link isn't a document's", !S.isDocToken("s_abcdefghijkl.x.y") && S.isDocToken(t4));

  /* ================= privacy ================= */
  console.log("\nprivacy");
  check("another member can't read it", (await refused(S.getDocument(OTH, d.id, BASE)))?.includes("isn't there"));
  check("nor its file", (await refused(S.ownerFile(OTH, d.id, false)))?.includes("isn't there") && (await refused(S.ownerFile(OTH, d.id, true)))?.includes("isn't there"));
  check("nor change, send, void, copy or delete it", (await refused(S.updateDocument(OTH, nod.id, { title: "Mine" }, BASE)))?.includes("isn't there") && (await refused(S.sendDocument(OTH, nod.id, {}, BASE)))?.includes("isn't there") && (await refused(S.voidDocument(OTH, four.id, BASE)))?.includes("isn't there") && (await refused(S.copyDocument(OTH, d.id, BASE)))?.includes("isn't there") && (await refused(S.deleteDocument(OTH, nod.id)))?.includes("isn't there"));
  check("their list is their own", (await PS.listProposals(OTH, BASE)).documents.length === 0);
  check("nothing of it in another member's table", !JSON.stringify(await T.buildView(OTH)).includes("Acme consulting agreement"));
  const ex = JSON.stringify(await T.exportState());
  check("nothing of it in the export", !ex.includes("Acme consulting agreement") && !ex.includes('"documents"') && !ex.includes("dana@acmerobotics.example"));
  check("a signer's view never carries the member's email or another document", !JSON.stringify(await S.docSignerView(t4, who, BASE)).includes("pat.docs@example.com"));

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
