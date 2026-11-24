/**
 * Checks of the QA fixes, batch B (the UI and copy), on made-up seeds in temporary data dirs
 * (nothing real, nothing leaves the machine):
 *
 *   npm run build && npx tsx scripts/test-qafixb.mts      exits 1 on any failure
 *   QAFIXB_PORT=7451 npx tsx scripts/test-qafixb.mts      the browser checks' server port (default 7451)
 *
 * In process (lib/ on a made-up seed, fetch replaced):
 *   - Undo an unlock (lib/table.ts undoUnlock): an unlock that spent credits answers with `undo`; taken
 *     back within the window its credits come back, its ledger lines go, the company locks again; not
 *     after anything else the member did, not with a made-up stamp, not after the window; a free
 *     open answers with no undo;
 *   - Unlock and send: writing to who held a seat at a company named for one search only is refused
 *     until it is unlocked, then goes (what "Unlock and send" does, app/post/Messages.tsx);
 *   - Hide my name on my seats (settings nameHidden, lib/table.ts cellOf, holderNameHidden): another
 *     member, and the connector's views, read "A fractional (name hidden)"; the member's own view keeps
 *     the name; the role still shows with the company; out of the directory; no conversation through the
 *     seat; the switch off brings the name back;
 *   - the words: who sees a name on a seat (seatNameWho, read from PEERS_FREE), the one sentence for the
 *     free opens (OPENS_RULE) on Home, Credits, the toasts, onboarding and the landing page, PRO_STORY,
 *     a 500 or above in plain words (errorText), the proposal's blanks by their labels and the count's
 *     wording, Draft it's signer (signerFrom), the spend question's rule (needsSpendConfirm).
 *
 * In a browser (Playwright, Chromium at 1440 and as an iPhone 13; skipped with a note when it isn't
 * there), against `next start` on QAFIXB_PORT:
 *   - typing "Larkspur Learning" quickly into the top bar's search on Home, and into Home's own search
 *     (then Enter and more letters): every letter is kept, the cursor stays in a search, Add never opens;
 *   - the price shows on a lock at rest; a spend of 2 credits asks first (what it opens, the balance
 *     after), Not now spends nothing, Unlock spends, its toast has Undo, and Undo gives the credits back;
 *   - the full table failing after the first screen: tried again, then Try again (never "Loading all
 *     companies…" for good), a page that isn't about companies shows its own head, no raw server words;
 *   - Fractionals at 1024: the filters behind a button, nothing pushed sideways; phone tap targets of 44px.
 */
import { spawn, spawnSync } from "node:child_process";
import Module, { createRequire, register } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The pages import their stylesheets: in this process a stylesheet is nothing.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);
// The pages' JSX reads React from the scope.
(globalThis as { React?: unknown }).React = React;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ---------- the made-up seed, in process ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "rn-qafixb-"));
const co = (id: string, name: string) => ({ id, fields: { name, website: `${id.slice(2)}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" } });
const seat = (id: string, companyId: string, operator?: string) => ({
  id,
  companyId,
  verified: false,
  fields: { source: "Seat scan", ...(operator ? { operator } : {}), role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2024-02", status: "Active", end: "Ongoing" },
});
const seed = {
  builtAt: iso(-60 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Quinlan", email: "sal.qafixb@example.com", title: "Fractional VP Sales", token: "tok-sal-qafixb" },
    { id: "mem_cas", name: "Casey Morgan", email: "casey.qafixb@example.com", title: "Fractional CMO", token: "tok-cas-qafixb" },
    { id: "mem_dan", name: "Dana Pell", email: "dana.qafixb@example.com", title: "Fractional VP Sales", token: "tok-dan-qafixb" },
  ],
  companies: [co("c_lark", "Larkspur Learning"), co("c_two", "Tidewater Robotics"), co("c_three", "Marigold Labs"), co("c_four", "Foxglove Health")],
  engagements: [seat("e_lark", "c_lark", "Casey Morgan"), seat("e_two", "c_two"), seat("e_three", "c_three"), seat("e_four", "c_four")],
  contacts: [{ id: "p_two", companyId: "c_two", fields: { name: "Blake Hollis", title: "CEO", relationship: "Decision maker" } }],
};
const seedFile = path.join(dir, "intel-seed.json");
writeFileSync(seedFile, JSON.stringify(seed));
const sales = { function: "Sales", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, iso(-HOUR)])),
    // Casey hasn't chosen about the directory: who held their seat shows free once a member can see the company (PEERS_FREE).
    profiles: { mem_sal: sales, mem_dan: sales, mem_cas: { function: "Marketing", onboarded: true } },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: seedFile,
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-qafixb@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_FREE_COMPANY: "off",
  // The old look's top bar and drawer are what the browser checks drive: since Stage 9 the new look is the default, so the rollback is asked for by name.
  RN_UI2: "off",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_INTEL_SEED_KEY", "RN_GOOGLE"]) delete process.env[k];
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

const ORIGIN = "https://post.example.com";

async function inProcess() {
  const t = await import("../lib/table");
  const TF = await import("../lib/tableFields");
  const F = await import("../lib/fractionals");
  const rules = await import("../lib/billing/rules");
  const S = await import("../app/ui/shared");
  const SAL = "tok-sal-qafixb";
  const CAS = "tok-cas-qafixb";
  const DAN = "tok-dan-qafixb";
  const view = (tok: string) => t.buildView(tok, { fresh: true });
  const credits = async (tok: string) => (await view(tok)).me!.credits;
  const pub = async (name: string) => t.tableInternals.pubId(seed.companies.find((c) => c.fields.name === name)!.id);
  const act = async (tok: string, a: unknown) => {
    try {
      return { ok: true as const, ...(await t.perform(tok, a as never, ORIGIN)) };
    } catch (e) {
      return { ok: false as const, message: (e as Error).message };
    }
  };

  /* ---------- Undo an unlock ---------- */
  console.log("Undo an unlock");
  const two = await pub("Tidewater Robotics");
  const c0 = await credits(SAL);
  const u = await act(SAL, { type: "unlock", entity: "company", id: two, field: "identity" });
  check("an unlock that spends answers with its undo stamp", u.ok && typeof (u as { undo?: string }).undo === "string" && (await credits(SAL)) === c0 - 2, u);
  const company = async (tok: string, id: string) => (await view(tok)).companies.find((c) => c.id === id);
  check("and the company is open", !(await company(SAL, two))?.hidden);
  const back = await act(SAL, { type: "undoUnlock", at: (u as { undo?: string }).undo });
  check("Undo within the window: the credits come back", back.ok && (await credits(SAL)) === c0 && /Undone\. Your 2 credits are back/.test(back.message), back);
  check("the company locks again, and the unlock is gone from the credit history", !!(await company(SAL, two))?.hidden && !(await view(SAL)).ledger.some((l) => l.delta < 0), (await view(SAL)).ledger);
  check("the cells that changed come with the answer (the page patches them)", back.ok && Array.isArray((back as { cells?: unknown[] }).cells) && (back as { cells: unknown[] }).cells.length > 0);
  const twice = await act(SAL, { type: "undoUnlock", at: (u as { undo?: string }).undo });
  check("a second Undo of the same unlock does nothing", !twice.ok && twice.message === t.UNDO_TOO_LATE && (await credits(SAL)) === c0, twice);
  const made = await act(SAL, { type: "undoUnlock", at: new Date().toISOString() });
  check("a made-up stamp is refused", !made.ok && made.message === t.UNDO_TOO_LATE, made);
  const u2 = await act(SAL, { type: "unlock", entity: "company", id: two, field: "identity" });
  const p2 = (await view(SAL)).companies.find((c) => c.id === two)?.people[0];
  const u3 = p2 ? await act(SAL, { type: "unlock", entity: "contact", id: p2.id, field: "name" }) : { ok: false, message: "no person" };
  const late = await act(SAL, { type: "undoUnlock", at: (u2 as { undo?: string }).undo });
  check("not once the member did more since (the decision maker's name, 1 credit, after it)", u2.ok && u3.ok && !late.ok && late.message === t.UNDO_AFTER && !(await company(SAL, two))?.hidden, { u3, late });
  const u3back = await act(SAL, { type: "undoUnlock", at: (u3 as { undo?: string }).undo });
  check("the later one can still be undone on its own", u3back.ok && (await credits(SAL)) === c0 - 2, u3back);

  /* ---------- Unlock and send ---------- */
  console.log("\nUnlock and send");
  const lark = t.tableInternals.pubId("c_lark");
  const found = await act(DAN, { type: "find", text: "Larkspur Learning" });
  check("Dana finds Larkspur Learning by its exact name", found.ok && (found as { found?: string }).found === "new", found);
  const seatId = t.tableInternals.pubId("e_lark");
  const refused = await act(DAN, { type: "message.start", engagementId: seatId, text: "Hi Casey, a question about the seat." });
  check("writing to who held its seat is refused until it is unlocked (the sheet then says Unlock and send)", !refused.ok && /^Unlock who held this seat first/.test(refused.message), refused);
  const opened = await act(DAN, { type: "unlock", entity: "company", id: lark, field: "identity" });
  const sent = await act(DAN, { type: "message.start", engagementId: seatId, text: "Hi Casey, a question about the seat." });
  check("unlocked, the same message goes", opened.ok && sent.ok && /^Sent\./.test(sent.message), { opened, sent });

  /* ---------- Hide my name on my seats ---------- */
  console.log("\nHide my name on my seats");
  await act(SAL, { type: "unlock", entity: "company", id: lark, field: "identity" });
  const holder = async (tok: string) => (await view(tok)).companies.find((c) => c.id === lark)?.engagements[0]?.cells.operator as { s: string; v?: string } | undefined;
  // As other members see Casey until she chooses the directory: first name and last initial (lib/memberName.ts, profile item 1, 2026-11-24).
  check("before: fellow fractionals see Casey's name free once the company is open", (await holder(SAL))?.v === "Casey M.", await holder(SAL));
  await act(CAS, { type: "settings", fractionals: true });
  check("in the directory, by name", JSON.stringify(await F.fractionalsView(SAL)).includes("Casey Morgan"));
  const on = await act(CAS, { type: "settings", nameHidden: true });
  check("Casey hides it", on.ok && /hidden on your seats/.test(on.message) && (await view(CAS)).me!.nameHidden === true, on);
  const hidden = await holder(SAL);
  check("another member reads 'A fractional (name hidden)', a value, nothing to sell", hidden?.s === "value" && hidden.v === TF.NAME_HIDDEN, hidden);
  const salJson = JSON.stringify(await view(SAL));
  check("and Casey's name is nowhere in their table (what the connector reads too)", !salJson.includes("Casey Morgan"));
  const shared = JSON.stringify(await t.buildView(SAL));
  check("the shared table says the same", !shared.includes("Casey Morgan") && shared.includes(TF.NAME_HIDDEN));
  check("the role still shows with the company", (await view(SAL)).companies.find((c) => c.id === lark)?.engagements[0]?.cells.role?.s === "value");
  const own = await holder(CAS);
  check("Casey's own view keeps their name", own?.v === "Casey Morgan", own);
  const dir1 = await F.fractionalsView(SAL);
  check("out of the Fractionals directory", !JSON.stringify(dir1).includes("Casey Morgan"), dir1?.records.map((r) => r.name));
  const msg = await act(SAL, { type: "message.start", engagementId: seatId, text: "Hello" });
  check("no conversation starts through the seat", !msg.ok && /keeps their name private/.test(msg.message), msg);
  const off = await act(CAS, { type: "settings", nameHidden: false });
  check("the switch off brings the name back", off.ok && (await holder(SAL))?.v === "Casey Morgan" && (await view(CAS)).me!.nameHidden === false);

  /* ---------- the words ---------- */
  console.log("\nThe words");
  check("who sees a name on a seat follows PEERS_FREE", TF.PEERS_FREE ? /for free once they can see that company/.test(TF.seatNameWho()) && /costs other members 1 credit/.test(TF.seatNameWho(false)) : /spend 1 credit/.test(TF.seatNameWho()));
  const ob = readFileSync("app/onboard/Classic.tsx", "utf8");
  check("onboarding says it from seatNameWho, links Hide my name, and no longer says a credit is always spent", /seatNameWho\(\)/.test(ob) && /HideNameToggle/.test(ob) && !/only after they spend 1 credit/.test(ob));
  check("Your seats, the directory switch and the Privacy page say the same and link the switch", /seatNameWho/.test(readFileSync("app/post/Seats.tsx", "utf8")) && /HideNameSwitch/.test(readFileSync("app/post/Seats.tsx", "utf8")) && /Hide my name on my seats/.test(readFileSync("app/post/PartnersSwitch.tsx", "utf8")) && /seatNameWho/.test(readFileSync("app/privacy/Privacy.tsx", "utf8")));
  const { faqItems } = await import("../app/landing/faq");
  const faq = new Map(faqItems(25));
  check("the Questions say who sees a name and how to hide it", /once they can see that company/.test(faq.get("What will other members see about me?") ?? "") && /name hidden/.test(faq.get("What will other members see about me?") ?? ""), faq.get("What will other members see about me?"));
  check("what each plan opens is one sentence, with the one line first", TF.OPENS_RULE === `${TF.OPEN_LINE} The trial opens up to 40 companies a day, with everything on them.`);
  check("the Questions use it", (faq.get("What does it cost?") ?? "").includes(TF.OPENS_RULE));
  for (const f of ["app/post/Credits.tsx", "app/post/todayModel.ts", "app/onboard/Classic.tsx", "app/onboard/Setup.tsx", "app/landing/Pricing.tsx", "app/landing/faq.ts", "app/post/Today.tsx"]) check(`${f} uses OPENS_RULE or OPEN_LINE`, /OPENS_RULE|OPEN_LINE/.test(readFileSync(f, "utf8")));
  check("the trial's toast counts down today's companies", /13 of today's 40 companies left/.test(t.proOpenLine(13)) && /last of today's 40/.test(t.proOpenLine(0)));
  const TM = await import("../app/post/todayModel");
  check("Home's trial card says it", TM.trialCardLine(21, { left: 39, of: 40 }).includes(TF.OPENS_RULE) && /39 of 40 companies left to open today/.test(TM.trialCardLine(21, { left: 39, of: 40 })), TM.trialCardLine(21, { left: 39, of: 40 }));
  check("PRO_STORY never promises Pro sends proposals", !/send the proposal/.test(rules.PRO_STORY) && /Close adds the proposal they sign/.test(rules.PRO_STORY), rules.PRO_STORY);
  check("no \"Pro + Close\" anywhere in what changed", !["app/post/Credits.tsx", "app/landing/faq.ts", "lib/billing/rules.ts", "lib/tableFields.ts", "app/onboard/Classic.tsx", "app/onboard/Setup.tsx"].some((f) => readFileSync(f, "utf8").includes("Pro + Close")));
  check("a 500 or above reads in plain words, a refusal keeps its own", S.errorText(500, "TypeError: x is undefined at line 4", "f") === S.SERVER_PROBLEM && S.errorText(503, "Merlin is busy", "f") === S.SERVER_PROBLEM && S.errorText(400, "Pick the company.", "f") === "Pick the company." && S.errorText(404, "", "Fallback.") === "Fallback.");
  check("the plain words", S.SERVER_PROBLEM === "Something went wrong on our side. Try again.");

  // The spend question's rule.
  const U = await import("../app/post/ui");
  check("the first spend of a session asks, so does 2 credits or more, a free open never", U.needsSpendConfirm(1) && U.needsSpendConfirm(2) && !U.needsSpendConfirm(0));
  U.markSpent();
  check("after one spend, 1 credit no longer asks; 2 still does", !U.needsSpendConfirm(1) && U.needsSpendConfirm(2));
  check("what each spend opens, in words", U.spendWhat({ entity: "company", id: "x", field: "identity" }) === "this company's name, website and job postings" && U.spendWhat({ entity: "contact", id: "x", field: "title" }) === "this person's name and title" && U.spendWhat({ entity: "engagement", id: "x", field: "operator" }) === "who held this seat and their role");

  // The proposal editor: blanks by their labels, and the count.
  const { DocText } = await import("../app/sign/doc");
  const L = await import("../lib/proposals/library");
  const doc = renderToStaticMarkup(React.createElement(DocText, { text: "Dear {{client.signerName}},\nWe meet on {{discovery.callDate}}.", blanks: true, label: L.fieldLabel }));
  check("blanks show by their labels, never the keys", /Signer name/.test(text(doc)) && !/client\.signerName|discovery\.callDate/.test(doc), text(doc));
  const signDoc = renderToStaticMarkup(React.createElement(DocText, { text: "Dear {{client.signerName}}", blanks: true }));
  check("(the signing page's own use is unchanged)", /client\.signerName/.test(signDoc));
  const P = await import("../app/post/Proposals");
  const fixLine = (fixes: string[], blanks: number) => text(renderToStaticMarkup(React.createElement(P.FixLine, { fixes, blanks })));
  check("the count: blanks first, then the rest", /^15 blanks to fill, and 9 more things to fix before you send$/.test(fixLine(["15 blanks left to fill.", ...Array.from({ length: 9 }, (_, k) => `fix ${k}`)], 15)), fixLine(["15 blanks left to fill.", ...Array.from({ length: 9 }, (_, k) => `fix ${k}`)], 15));
  check("one blank alone, and no blanks", /^1 blank to fill before you send$/.test(fixLine(["1 blank left to fill."], 1)) && /^3 things to fix before you send$/.test(fixLine(["a", "b", "c"], 3 - 3)), [fixLine(["1 blank left to fill."], 1), fixLine(["a", "b", "c"], 0)]);
  const PS = await import("../app/post/ProposalStart");
  const callText = "Quinn: thanks for the time.\nAvery Ashby, CEO: we want to hire a fractional sales leader.\nBudget around $10k a month. Send it to avery@quill.example";
  check("Draft it's signer from the call's with line", JSON.stringify(PS.signerFrom({ withWho: "Avery Ashby, CEO", text: "", me: "Quinn Tester" })) === JSON.stringify({ name: "Avery Ashby", title: "CEO" }), PS.signerFrom({ withWho: "Avery Ashby, CEO", text: "", me: "Quinn Tester" }));
  check("from the call itself, with the email on their line", JSON.stringify(PS.signerFrom({ withWho: "", text: callText, me: "Quinn Tester" })) === JSON.stringify({ name: "Avery Ashby", title: "CEO", email: "avery@quill.example" }), PS.signerFrom({ withWho: "", text: callText, me: "Quinn Tester" }));
  const dm = { c: { people: [{ cells: { relationship: { s: "value", v: "Decision maker" }, name: { s: "value", v: "Blake Hollis" }, title: { s: "value", v: "CEO" }, email: { s: "value", v: "blake@tide.example" } } }] } };
  check("else the company's decision maker on the record", JSON.stringify(PS.signerFrom({ withWho: "", text: "We talked about the pipeline.", me: "Quinn Tester", company: dm as never })) === JSON.stringify({ name: "Blake Hollis", title: "CEO", email: "blake@tide.example" }));
  check("never the member themselves, nothing guessed", JSON.stringify(PS.signerFrom({ withWho: "Quinn Tester, CEO", text: "", me: "Quinn Tester" })) === "{}");

  // The stylesheets and the one filled button.
  const css = (f: string) => readFileSync(f, "utf8");
  const g = css("app/globals.css");
  check("the white top bar's ring is no longer volt", !/^\.tp-top,\s*$/m.test(g.slice(g.indexOf("On pine and ink the volt itself is the ring"), g.indexOf("prefers-reduced-motion"))));
  check("a volt button's ring is pine", /\.btn-volt:focus-visible \{\s*outline: 2px solid var\(--pine\);/.test(g));
  check("phones: scroll-padding-bottom 72px under 768", /@media \(max-width: 767px\) \{\s*html \{\s*scroll-padding-bottom: 72px;/.test(g));
  const fr = css("app/post/fractionals.css");
  check("Fractionals: the side column shrinks and wraps, the table scrolls in its frame with a min-width", /\.fr-side \{\s*min-width: 0;\s*overflow-wrap: anywhere;/.test(fr) && /\.fr-tablewrap \{[^}]*overflow-x: auto;/.test(fr) && /\.fr-table \{[^}]*min-width: 760px;/.test(fr));
  check("Fractionals: under 1280 the filters are a button and a sheet", /useMedia\("\(max-width: 1279px\)"\)/.test(readFileSync("app/post/Fractionals.tsx", "utf8")));
  const sg = css("app/sign/sign.css");
  check("the signing page: its column's children shrink, long names break", /\.sg-main > \* \{\s*min-width: 0;/.test(sg) && /\.sg-sender,\s*\.sg-sender-t,\s*\.sg-title,[\s\S]*?overflow-wrap: anywhere;/.test(sg));
  check("the blanks in the text face", /\.sg-blank \{[^}]*font-family: var\(--font\);/.test(sg) && !/\.sg-blank \{[^}]*var\(--mono\)/.test(sg));
  check("phones: Manage, Upgrade and the saved views in More are 44px", /\.tp-nav-sheet \.tp-nav-view,\s*\.tp-nav-manage,\s*\.tp-nav-plan-go \{\s*min-height: 44px;/.test(css("app/post/nav.css")));
  check("phones: the top bar's Upgrade pill and the interval chips are 44px", /\.tp-plan-phone,\s*\.tp-top-phone \.tp-plan \{\s*min-height: 44px;/.test(css("app/post/billing.css")) && /\.bl-interval \.chip \{\s*min-height: 44px;/.test(css("app/post/billing.css")));
  check("one filled button: Home's moves past the first are outline", /const pine = n > 1 \? "btn-outline" : "btn-pine";/.test(readFileSync("app/post/Moves.tsx", "utf8")) && !/className="btn btn-pine mv-main"/.test(readFileSync("app/post/Moves.tsx", "utf8")));
  check("Crystal Ball's rows past the first, and Peers' cards past the first, are outline", /SecondaryCtx\.Provider value=\{i\.c\.id !== firstRow\}/.test(readFileSync("app/post/Radar.tsx", "utf8")) && (readFileSync("app/post/Peers.tsx", "utf8").match(/value=\{later\(\)\}/g) ?? []).length === 4 && !/className="btn btn-sm btn-pine"/.test(readFileSync("app/post/Peers.tsx", "utf8").split("function TeamAsk")[0].split("function PeerCard")[1] ?? ""));
  const ui2 = renderToStaticMarkup(
    React.createElement(U.SecondaryCtx.Provider, { value: true }, React.createElement(() => React.createElement("span", null, U.usePine()))),
  );
  check("usePine: outline inside a later item, pine otherwise", text(ui2) === "btn-outline" && text(renderToStaticMarkup(React.createElement(() => React.createElement("span", null, U.usePine())))) === "btn-pine");
}

/* ---------- in a browser ---------- */

function findPlaywright(): { chromium: import("playwright").BrowserType; devices: Record<string, import("playwright").BrowserContextOptions> } | null {
  const require = createRequire(import.meta.url);
  const tries = ["playwright", ...(process.env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean).map((p) => path.join(p, "playwright"))];
  try {
    const g = spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim();
    if (g) tries.push(path.join(g, "playwright"));
  } catch {}
  for (const p of tries) {
    try {
      return require(p);
    } catch {}
  }
  return null;
}

async function inBrowser() {
  const pw = findPlaywright();
  if (!pw) {
    console.log("\nSKIP the browser checks: Playwright isn't installed here (npm i -g playwright).");
    return;
  }
  const PORT = Number(process.env.QAFIXB_PORT || 7451);
  const BASE = `http://127.0.0.1:${PORT}`;
  const bdir = mkdtempSync(path.join(tmpdir(), "rn-qafixb-web-"));
  const A = ["Quill", "Bramble", "Larkspur", "Copperleaf", "Driftwood", "Saltmarsh", "Juniper", "Ironbark", "Tidewater", "Foxglove", "Hollowell", "Marigold"];
  const B = ["Analytics", "Health", "Robotics", "Logistics", "Learning", "Software"];
  const companies = Array.from({ length: 24 }, (_, k) => ({
    id: `c_qbw${String(k).padStart(2, "0")}`,
    fields: { name: `${A[k % A.length]} ${B[(k * 5) % B.length]}`, website: `${A[k % A.length].toLowerCase()}${k}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" },
  }));
  const engagements = companies.map((c, k) => ({ id: `e_qbw${k}`, companyId: c.id, verified: false, fields: { source: "Seat scan", ...(k % 3 === 0 ? { operator: `Reese Lowell${k}` } : {}), role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2025-03", status: "Active", end: "Ongoing" } }));
  const contacts = companies.slice(0, 6).map((c, k) => ({ id: `p_qbw${k}`, companyId: c.id, fields: { name: `Blake Hollis${k}`, title: "CEO", relationship: "Decision maker" } }));
  const members = [
    { id: "mem_desk", name: "Desk Tester", email: "desk.qafixb@example.com", title: "Fractional VP Sales", token: "tok-qafixb-desk-0001" },
    { id: "mem_phone", name: "Phone Tester", email: "phone.qafixb@example.com", title: "Fractional VP Sales", token: "tok-qafixb-phone-0001" },
    { id: "mem_spend", name: "Spend Tester", email: "spend.qafixb@example.com", title: "Fractional VP Sales", token: "tok-qafixb-spend-0001" },
  ];
  const icp = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };
  writeFileSync(path.join(bdir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-30 * DAY), members, companies, engagements, contacts }));
  writeFileSync(
    path.join(bdir, "intel.json"),
    JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: Object.fromEntries(members.map((m) => [m.id, iso(-3 * DAY)])), profiles: Object.fromEntries(members.map((m) => [m.id, { function: "Sales", onboarded: true, icp, before: ["Marketing"], fractionals: true }])) }),
  );
  const env: NodeJS.ProcessEnv = { ...process.env, RN_DATA_DIR: bdir, RN_INTEL_SEED: path.join(bdir, "intel-seed.json"), RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin-qafixb-web@example.com", RN_SCAN_TEST: "1", RN_LOGO_LOOKUP: "off", RN_DIGEST: "0", RN_FREE_COMPANY: "off" };
  for (const k of ["RN_INTEL_SEED_KEY", "RESEND_API_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_GOOGLE", "RN_BILLING", "STRIPE_SECRET_KEY"]) delete env[k];
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  try {
    let up = false;
    for (let k = 0; k < 120 && !up; k++) {
      try {
        up = (await realFetch(`${BASE}/api/health`)).ok;
      } catch {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    check("the server is up", up, log.slice(-400));
    if (!up) return;
    const browser = await pw.chromium.launch({ args: ["--no-proxy-server"] });
    const devs = { desktop: { viewport: { width: 1440, height: 900 } }, iphone: { ...pw.devices["iPhone 13"] } } as const;
    const ctxFor = async (dev: keyof typeof devs, token: string) => {
      const ctx = await browser.newContext({ ...devs[dev] });
      await ctx.addCookies([{ name: "rn_table", value: token, url: BASE }]);
      return ctx;
    };
    const settle = (page: import("playwright").Page) =>
      page.waitForFunction(() => !!document.querySelector(".tp-top") && !document.querySelector(".tp-allwait, .mv-skel, .td-card-skel, .hm-card-wait"), null, { timeout: 30_000 }).catch(() => {});
    const addOpen = (page: import("playwright").Page) => page.evaluate(() => !!document.querySelector(".tp-modal, .tp-add") || [...document.querySelectorAll(".tp-sheet-title, .tp-modal h2")].some((h) => /Add what you know/.test(h.textContent ?? "")));
    const searchState = (page: import("playwright").Page) =>
      page.evaluate(() => {
        const a = document.activeElement as HTMLInputElement | null;
        return { focused: !!a && a.tagName === "INPUT" && a.type === "search", value: a?.value ?? null, all: [...document.querySelectorAll<HTMLInputElement>("input[type='search']")].map((x) => x.value) };
      });
    try {
      /* ---------- the top search keeps every letter ---------- */
      for (const dev of ["desktop", "iphone"] as const) {
        console.log(`\nsearch on Home (${dev})`);
        const ctx = await ctxFor(dev, dev === "desktop" ? members[0].token : members[1].token);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`);
        await settle(page);
        if (dev === "iphone") await page.locator(".tp-top button[aria-label='Search']").first().click();
        const top = page.locator(".tp-top input[type='search']").first();
        await top.click();
        await page.keyboard.type("Larkspur Learning", { delay: 60 });
        await page.waitForTimeout(1500);
        const s1 = await searchState(page);
        check(`the top bar's search keeps "Larkspur Learning" with the cursor in it (${dev})`, s1.focused && s1.value === "Larkspur Learning", s1);
        check(`Add what you know never opened (${dev})`, !(await addOpen(page)));
        check(`the table lists the search once the typing paused (${dev})`, new URL(page.url()).searchParams.get("q") === "Larkspur Learning" || (await page.locator(".tp-q, .tp-searchline, .tp-table, .tp-pcard").count()) > 0, page.url());
        // Home's own search: Enter moves to the table, and the next letters land in the table's search.
        await page.goto(`${BASE}/`);
        await settle(page);
        const ask = page.locator(".hm-ask-in");
        if (await ask.count()) {
          await ask.click();
          await page.keyboard.type("Larkspur Learning", { delay: 40 });
          await page.keyboard.press("Enter");
          await page.keyboard.type(" a", { delay: 40 });
          await page.waitForTimeout(1200);
          const s2 = await searchState(page);
          check(`Home's search: Enter, then more letters, all kept in a search (${dev})`, s2.focused && s2.value === "Larkspur Learning a", s2);
          check(`and Add never opened (${dev})`, !(await addOpen(page)));
        } else check(`Home's own search is there (${dev})`, false);
        await ctx.close();
      }

      /* ---------- the price at rest, the question before a spend, Undo ---------- */
      console.log("\nspending credits (desktop)");
      {
        const ctx = await ctxFor("desktop", members[2].token);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?p=table`);
        await settle(page);
        const rest = await page.evaluate(() => [...document.querySelectorAll(".tp-table .lock-price, .tp-table .tp-co-price")].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.textContent).slice(0, 4));
        check("locks show their price at rest", rest.length > 0 && rest.every((x) => /credit|Free/.test(x ?? "")), rest);
        // The pill's own words ("You have 23 credits. …"): its text can carry the change beside the balance for a moment.
        const credit = () => page.evaluate(() => Number(/You have (\d+) credit/.exec(document.querySelector(".tp-credits")?.getAttribute("aria-label") ?? "")?.[1] ?? NaN));
        const c0 = await credit();
        const lock = page.locator(".tp-table .tp-co-hidden.in-table button.lock").first();
        await lock.click();
        const ask = page.locator(".tp-spend");
        await ask.waitFor({ timeout: 5000 }).catch(() => {});
        const words = text((await ask.innerHTML().catch(() => "")) ?? "");
        check("a company (2 credits) asks first: what it opens and the balance after", /Spend 2 credits of your 25 to see this company's name, website and job postings\?/.test(words) && /You'll have 23 credits left/.test(words), words);
        await page.locator(".tp-spend button", { hasText: "Not now" }).click();
        await page.waitForTimeout(500);
        check("Not now spends nothing", (await credit()) === c0 && (await page.locator(".tp-spend").count()) === 0);
        await lock.click();
        await page.locator(".tp-spend button", { hasText: "Unlock" }).click();
        const toast = await page.waitForSelector(".toasts .toast-act .toast-btn:text('Undo')", { timeout: 8000 }).catch(() => null);
        await page.waitForTimeout(300);
        check("Unlock spends, and its toast has Undo", !!toast && (await credit()) === c0 - 2, await credit());
        await toast?.click();
        await page.waitForTimeout(1500);
        check("Undo gives the credits back", (await credit()) === c0, await credit());
        await ctx.close();
      }

      /* ---------- the full table failing after the first screen ---------- */
      console.log("\nthe full table failing");
      {
        const ctx = await ctxFor("desktop", members[0].token);
        const page = await ctx.newPage();
        let full = 0;
        await page.route(/\/api\/table\?compact=1/, async (r) => {
          full++;
          await r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "TypeError: Cannot read properties of undefined (reading 'x') at memberView" }) });
        });
        await page.goto(`${BASE}/?p=credits`);
        await page.waitForSelector(".tp-top", { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const early = await page.evaluate(() => ({ head: document.querySelector(".tp-pagewait h1")?.textContent ?? null, all: document.body.innerText.includes("Loading all companies") }));
        check("a page that isn't about companies shows its own head while the table loads, never 'Loading all companies…'", early.head === "Your credits" && !early.all, early);
        await page.waitForSelector(".tp-pagewait .problem", { timeout: 40_000 }).catch(() => {});
        const failed = await page.evaluate(() => ({ text: document.body.innerText, retry: !!document.querySelector(".tp-pagewait .problem button.btn-pine") }));
        check("after the retries (2, 5 and 15 seconds): plain words and Try again", failed.retry && /Something went wrong on our side\. Try again\./.test(failed.text) && full >= 4, { full, text: failed.text.slice(0, 300) });
        check("never the server's own words", !/TypeError|memberView/.test(failed.text));
        await page.unroute(/\/api\/table\?compact=1/);
        await page.locator(".tp-pagewait .problem button.btn-pine").click();
        const ok = await page.waitForFunction(() => !document.querySelector(".tp-pagewait"), null, { timeout: 30_000 }).then(() => true).catch(() => false);
        check("Try again brings the page", ok);
        await ctx.close();
      }

      /* ---------- Fractionals at 1024, phone targets ---------- */
      console.log("\nFractionals at 1024, and phone targets");
      {
        const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
        await ctx.addCookies([{ name: "rn_table", value: members[0].token, url: BASE }]);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?p=peers&pt=all`);
        await page.waitForSelector(".fr-page", { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const m = await page.evaluate(() => ({ side: !!document.querySelector(".fr-side"), btn: !!document.querySelector(".fr-showf"), sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        check("the filters sit behind a Filters button, and nothing pushes the page sideways", !m.side && m.btn && m.sw <= m.iw, m);
        await page.locator(".fr-showf").click();
        check("the button opens them in a sheet", (await page.locator(".tp-sheet .fr-sheet-filters").count()) === 1);
        await ctx.close();
      }
      {
        const ctx = await ctxFor("iphone", members[1].token);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?p=billing`);
        await settle(page);
        await page.waitForTimeout(800);
        const chips = await page.evaluate(() => [...document.querySelectorAll(".bl-interval .chip")].map((e) => Math.round(e.getBoundingClientRect().height)));
        check("the plan interval chips are 44px tall on a phone", chips.length === 0 || chips.every((h) => h >= 44), chips);
        const ring = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
        check("a focused control is never under the tab bar (scroll-padding-bottom 72px)", ring === "72px", ring);
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.log(`server log: ${log.slice(-1500)}`);
    throw e;
  } finally {
    try {
      server.kill();
    } catch {}
    rmSync(bdir, { recursive: true, force: true });
  }
}

try {
  await inProcess();
  if (!process.env.QAFIXB_NOBROWSER) await inBrowser();
} catch (e) {
  failures++;
  console.log(`FAIL crashed: ${(e as Error).stack}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
