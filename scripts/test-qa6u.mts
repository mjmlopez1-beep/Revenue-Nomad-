/**
 * Checks of the QA fixes, batch 6U, on made-up seeds in temporary data dirs (nothing real, nothing
 * leaves the machine; every person and company here is invented):
 *
 *   npm run build && npx tsx scripts/test-qa6u.mts      exits 1 on any failure
 *   QA6U_PORT=7461 npx tsx scripts/test-qa6u.mts         the browser checks' server port (default 7461)
 *   QA6U_NOBROWSER=1 npx tsx scripts/test-qa6u.mts       in process only
 *
 * In process (lib/ with billing live against made-up Stripe keys, fetch replaced):
 *   - the plan by name from one helper (planName, paidName): Free, Pro, Close, Close trial; the
 *     trial's button for Pro is Choose Pro; the renewal email names Close; the month's credits say
 *     which month of a yearly plan; the thanks after checkout names the plan bought; the sidebar's
 *     plan line; a free open in the credit history names the plan it opened on (the Close trial);
 *     the billing page for a member on Close says Close in its status, buttons and pause card;
 *   - Home's trial card: the free opens left of 15, and the Crystal Ball's count in its own words;
 *   - the table's credits line reads the balance now (pickSlotNudge);
 *   - Unlock and send: the one question says the message then sends;
 *   - the claim page says where Merlin found the seat, and who sent the link;
 *   - Peers: a peer you only messaged reads "You've messaged";
 *   - a locked company's site is dots, never a domain; the empty dash is 3:1 or better.
 *
 * In a browser (Playwright, Chromium; skipped with a note when it isn't there), against `next start`:
 *   - at 768 wide the record is modal: aria-modal, the table behind is inert, Tab stays inside,
 *     Escape closes it and focus goes back to the row that opened it;
 *   - onboarding's function chips: one Tab stop, the arrow keys move the choice;
 *   - the Fractionals table fits at 768 (nothing cut off);
 *   - a touch screen at 768: the top bar's and the record's controls are 44px;
 *   - the new look (a second server with RN_UI2=on, port + 1): at 1440 the record is a page in
 *     place of the list (Enter opens it, Escape goes back to the row, /?c= opens it), and on a
 *     phone it stays the drawer. The checks above run on the old look (RN_UI2 off).
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
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ").trim();

/* ---------- the made-up seed, in process ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "rn-qa6u-"));
const co = (id: string, name: string, fn = "Sales") => ({ id, fields: { name, website: `${id.slice(2)}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" }, fn });
const companies = [co("c_cedar", "Cedar and Pine Software"), co("c_birch", "Birchway Analytics"), co("c_alder", "Alderbank Health")];
const seed = {
  builtAt: iso(-60 * DAY),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan.avery@example.com", title: "Fractional VP Sales", token: "tok-qa6u-jordan" },
    { id: "mem_close", name: "Casey Closer", email: "casey.closer@example.com", title: "Fractional CRO", token: "tok-qa6u-close" },
    { id: "mem_peer", name: "Robin Marsh", email: "robin.marsh@example.com", title: "Fractional CFO", token: "tok-qa6u-peer" },
  ],
  companies: companies.map(({ fn: _f, ...c }) => c),
  engagements: [
    { id: "e_cedar1", companyId: "c_cedar", verified: false, fields: { source: "Seat scan", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2024-02", status: "Active", end: "Ongoing" } },
    { id: "e_birch1", companyId: "c_birch", verified: false, fields: { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2025-01", status: "Active", end: "Ongoing" } },
    { id: "e_alder1", companyId: "c_alder", verified: false, fields: { source: "Seat scan", role: "Fractional CFO", function: "Finance", type: "Fractional", start: "2025-04", status: "Active", end: "Ongoing" } },
  ],
  contacts: [],
};
const seedFile = path.join(dir, "intel-seed.json");
writeFileSync(seedFile, JSON.stringify(seed));
const onb = (fn: string) => ({ function: fn, onboarded: true, icp: { industries: [], employees: [], revenue: [], countries: [] } });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, iso(-HOUR)])),
    profiles: { mem_jordan: onb("Sales"), mem_close: onb("Sales"), mem_peer: { ...onb("Finance"), fractionals: true } },
    // Jordan and Robin only exchanged messages: no lead passed, no team.
    conversations: [{ id: "cv_qa6u", a: "mem_jordan", b: "mem_peer", about: { companyId: "", engagementId: "" }, kind: "partners", messages: [{ id: "m_qa6u", by: "mem_peer", at: iso(-2 * HOUR), text: "Hello from a made-up peer." }], readAt: {}, status: "open", createdAt: iso(-2 * HOUR) }],
    billing: {
      members: {
        // Jordan: the Close trial, 10 days left. Casey: paid Close, yearly.
        mem_jordan: { trialStartedAt: iso(-11 * DAY), trialEndsAt: iso(10 * DAY), notices: { trialStartedSeen: iso(-10 * DAY) } },
        mem_close: { tier: "close", subscriptionId: "sub_qa6u", customerId: "cus_qa6u", interval: "year", proUntil: iso(300 * DAY), paidSince: iso(-65 * DAY), periodStart: iso(-65 * DAY), invoiceId: "in_qa6u", notices: { proWelcomeSeen: iso(-60 * DAY) } },
      },
      events: [],
      payments: [],
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: seedFile,
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 9).toString("base64"),
  RN_ID_SECRET: "qa6u-made-up-id-secret",
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-qa6u@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_qa6u_made_up",
  STRIPE_WEBHOOK_SECRET: "whsec_qa6u_made_up",
  STRIPE_PRICE_MONTH: "price_qa6u_m",
  STRIPE_PRICE_YEAR: "price_qa6u_y",
  STRIPE_PRICE_CLOSE_MONTH: "price_qa6u_cm",
  STRIPE_PRICE_CLOSE_YEAR: "price_qa6u_cy",
  STRIPE_API_URL: "http://stripe.qa6u.test",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_GOOGLE", "RN_SCAN_TEST", "RN_FREE_COMPANY"]) delete process.env[k];
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
const ORIGIN = "https://post.example.com";

async function inProcess() {
  const t = await import("../lib/table");
  const R = await import("../lib/billing/rules");
  const E = await import("../lib/billing/emails");
  const JORDAN = "tok-qa6u-jordan";
  const CLOSE = "tok-qa6u-close";
  const view = (tok: string) => t.buildView(tok, { fresh: true });
  const act = async (tok: string, a: unknown) => {
    try {
      return { ok: true as const, ...(await t.perform(tok, a as never, ORIGIN)) };
    } catch (e) {
      return { ok: false as const, message: (e as Error).message };
    }
  };

  /* ---------- the plan by name ---------- */
  console.log("The plan by name");
  check(
    "one helper names every plan: Free, Pro, Close, Close trial",
    R.planName({ name: "free" }) === "Free" && R.planName({ name: "pro", tier: "pro" }) === "Pro" && R.planName({ name: "pro", tier: "close" }) === "Close" && R.planName({ name: "trial", tier: "close" }) === "Close trial" && R.planName(null) === "Free",
  );
  check("the paid tier, paused or not: Pro unless it says Close", R.paidName("close") === "Close" && R.paidName("pro") === "Pro" && R.paidName(undefined) === "Pro" && R.paidName("free") === "Pro");
  check("the trial's buttons: Choose Pro (a plan they aren't on), Keep Close (the trial is Close)", R.keepWords("pro") === "Choose Pro" && R.keepWords("close") === "Keep Close" && R.keepVerb("pro") === "choose Pro");
  const ren = E.renewalEmail({ first: "Casey", counts: { unlocks: 0 } as never, interval: "year", link: "https://post.example.com/", tier: "close" });
  check("the renewal email names Close, never Pro", ren.subject === "Your year on Merlin Close" && /^Close renewed\./m.test(ren.text.split("\n")[2] ?? "") && !/\bPro\b/.test(ren.subject + ren.text), { subject: ren.subject, text: ren.text.slice(0, 200) });
  const mProEnd = E.trialEndingEmail({ first: "Jordan", days: 3, notLooking: false, rateLine: null, link: "https://post.example.com/", keep: "pro" });
  check("the trial reminder for Pro says choose Pro, never Keep Pro", /unless you choose Pro/.test(mProEnd.text) && mProEnd.html.includes(">Choose Pro<") && !/Keep Pro/.test(mProEnd.text + mProEnd.html));
  check(
    "the month's credits: monthly, and which month of a yearly plan",
    t.planCreditsLine({ tier: "close", interval: "month" } as never, "plan.in_1.0") === "Close credits for the month" && t.planCreditsLine({ tier: "pro", interval: "year" } as never, "plan.in_1.2") === "Pro credits for month 3 of your year",
    [t.planCreditsLine({ tier: "close", interval: "month" } as never, "plan.in_1.0"), t.planCreditsLine({ tier: "pro", interval: "year" } as never, "plan.in_1.2")],
  );
  check(
    "a free open names the plan it opened on, not today's",
    t.freeOpenLine({ trialStartedAt: iso(-11 * DAY), trialEndsAt: iso(10 * DAY) } as never, t0 - DAY) === "Opened free in your Close trial" &&
      t.freeOpenLine({ tier: "close", proUntil: iso(30 * DAY) } as never, t0 - DAY) === "Opened free on Close" &&
      t.freeOpenLine({ trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } as never, t0 - 20 * DAY) === "Opened free in your Close trial",
  );

  // Jordan (Close trial) opens a company free: the history says the trial, not Pro.
  const cedar = t.tableInternals.pubId("c_cedar");
  const opened = await act(JORDAN, { type: "unlock", entity: "company", id: cedar, field: "identity" });
  const jv = await view(JORDAN);
  check("a company opens free on the trial", opened.ok && jv.me!.credits === 25, opened);
  check("and the credit history reads 'Opened free in your Close trial'", jv.ledger.some((l) => l.reason === "Opened free in your Close trial") && !jv.ledger.some((l) => /on Pro/.test(l.reason)), jv.ledger.map((l) => l.reason));
  const LG = await import("../app/post/ledger");
  check("and the page shows that line with the company", LG.ledgerLine(jv.ledger.find((l) => /^Opened free in your/.test(l.reason))!, 25).text === "Opened free in your Close trial: Cedar and Pine Software");

  const cv = await view(CLOSE);
  const plan = cv.me!.plan!;
  check("Casey's plan reads Close, with the subscription's tier", plan.name === "pro" && plan.tier === "close" && plan.paidTier === "close", { name: plan.name, tier: plan.tier, paidTier: plan.paidTier });
  const B = await import("../app/post/Billing");
  check(
    "the thanks after checkout names the plan bought",
    B.paidThanks(plan) === "Thanks. Close is yours." && B.paidThanks({ ...plan, paidTier: "pro", tier: "pro" }) === "Thanks. Pro is yours." && B.paidThanks({ ...plan, name: "trial", paidTier: null, firstChargeAt: iso(5 * DAY) }) === "Thanks. Pro is yours. Nothing is charged until your trial ends.",
    [B.paidThanks(plan)],
  );
  const NM = await import("../app/post/navModel");
  check("the sidebar's plan line says Close", NM.planLine(plan) === "Close" && NM.planLine(jv.me!.plan) === "Close trial · 10 days left", [NM.planLine(plan), NM.planLine(jv.me!.plan)]);
  try {
    const html = text(renderToStaticMarkup(React.createElement(B.BillingPage, { view: cv, refresh: async () => {} })));
    check("the billing page on Close: its status, Cancel Close and Pause Close, never Pro", /Close, yearly/.test(html) && /Pause Close for a month/.test(html) && /Cancel Close/.test(html) && /Everything in the Close column is yours/.test(html) && !/Cancel Pro|Keep Pro|Pause Pro|Pro comes back/.test(html), html.slice(0, 500));
  } catch (e) {
    check("the billing page renders here", false, (e as Error).message);
  }
  const cancelled = { ...cv, me: { ...cv.me!, plan: { ...plan, cancelAt: plan.proUntil } } };
  const htmlC = text(renderToStaticMarkup(React.createElement(B.BillingPage, { view: cancelled, refresh: async () => {} })));
  check("cancelled on Close: 'You keep Close until', and Keep Close", /You keep Close until/.test(htmlC) && /Keep Close/.test(htmlC) && !/Keep Pro|keep Pro/.test(htmlC), htmlC.slice(0, 400));

  /* ---------- Home's trial card ---------- */
  console.log("\nHome's trial card");
  const TM = await import("../app/post/todayModel");
  const card = TM.trialCardLine(21, { left: 15, of: 15 }, 18);
  check("the free opens left of 15, then Crystal Ball's 18 in its own words", /15 of 15 free opens left today\. 18 companies are in your Crystal Ball today\.$/.test(card) && !/ 18 left today/.test(card), card);

  /* ---------- one balance ---------- */
  console.log("\nThe table's credits line");
  const N = await import("../app/post/nudges");
  const slot = N.pickSlotNudge({ page: "table", credits: 2, plan: undefined, profileEmpty: false }, 0);
  check("after spending the last 2, the line reads 0 like the pill", slot?.kind === "credits" && slot.text === "You're out of credits.", slot);
  const same = N.pickSlotNudge({ page: "table", credits: 2, plan: undefined, profileEmpty: false }, 2);
  check("no change, the same line", same?.kind === "credits" && /^2 credits left/.test(same.text), same);

  /* ---------- Unlock and send ---------- */
  console.log("\nUnlock and send");
  const M = await import("../app/post/Messages");
  check("the price on the button and the one question agree", M.unlockSendCost({ credits: 25 } as never, { entity: "company", id: "x", field: "identity" }) === 2 && M.unlockSendCost({ credits: 25 } as never, { entity: "engagement", id: "x", field: "operator" }) === 1);
  const msrc = readFileSync("app/post/Messages.tsx", "utf8");
  check("it asks once, saying the message then sends, before anything reads Sending", /then: `Then your message to \$\{first\} sends\.`/.test(msrc) && /ui\.unlock\(needs, \{ asked: true \}\)/.test(msrc) && msrc.indexOf("askSpend({") < msrc.indexOf("setBusy(true);\n      const ok = await ui.unlock"));

  /* ---------- the claim page ---------- */
  console.log("\nThe claim page");
  const CT = await import("../lib/claimToken");
  const cp = await t.claimPage(CT.claimToken("e_alder1"), null);
  const SL = await import("../app/claim/seatLine");
  check("the seat says where it was found: public sources", cp.seat?.found === "public" && /^Merlin found this seat in public sources/.test(SL.foundLine(cp.seat.found)), cp.seat);
  check("with an invite on the link, who sent it", SL.foundLine("public", "Jordan") === "Merlin found this seat in public sources, such as public profiles and company pages. Jordan sent you this link.");

  /* ---------- Peers ---------- */
  console.log("\nPeers");
  const P = await import("../lib/peers");
  const picks = await P.peerPicks(JORDAN, cedar, null);
  const robin = picks?.picks.find((p) => p.first === "Robin");
  check("a peer you only messaged reads You've messaged, not You already work together", robin?.why === "You've messaged", picks?.picks);

  /* ---------- the quiet marks ---------- */
  console.log("\nThe quiet marks");
  const S = await import("../app/ui/shared");
  const sites = ["c1", "c2", "c3", "Zq3", "abc"].map((x) => S.lockedLook(x).site);
  check("a locked company's site is dots, never a domain", sites.every((x) => /^•+\.•+$/.test(x) && !/[a-z]/i.test(x)), sites);
  const css = readFileSync("app/post/post.css", "utf8");
  check("the empty dash uses the 3.4:1 colour", /\.tp-none \{\s*color: var\(--line-input\);/.test(css));
  check("Home's trial card is wired to the opens, not to Crystal Ball's count", /opens=\{me\.proOpens\} crystal=\{dayN\}/.test(readFileSync("app/post/Home.tsx", "utf8")));
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
  const PORT = Number(process.env.QA6U_PORT || 7461);
  const BASE = `http://127.0.0.1:${PORT}`;
  const bdir = mkdtempSync(path.join(tmpdir(), "rn-qa6u-web-"));
  const A = ["Cedar", "Birchway", "Alderbank", "Hazel", "Rowan", "Willow", "Aspen", "Linden", "Maple", "Spruce"];
  const Bw = ["Software", "Analytics", "Health", "Logistics", "Learning"];
  const cos = Array.from({ length: 16 }, (_, k) => ({ id: `c_q6w${k}`, fields: { name: `${A[k % A.length]} ${Bw[(k * 3) % Bw.length]} ${k}`, website: `${A[k % A.length].toLowerCase()}${k}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" } }));
  const engs = cos.map((c, k) => ({ id: `e_q6w${k}`, companyId: c.id, verified: false, fields: { source: "Seat scan", operator: `Reese Lowell${k}`, role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2025-03", status: "Active", end: "Ongoing" } }));
  const members = [
    { id: "mem_desk", name: "Jordan Avery", email: "jordan.qa6u@example.com", title: "Fractional VP Sales", token: "tok-qa6u-web-desk-0001" },
    { id: "mem_new", name: "Sam Newfield", email: "sam.qa6u@example.com", title: "", token: "tok-qa6u-web-new-0001" },
  ];
  const icp = { industries: [], employees: [], revenue: [], countries: [] };
  writeFileSync(path.join(bdir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-30 * DAY), members, companies: cos, engagements: engs, contacts: [] }));
  writeFileSync(
    path.join(bdir, "intel.json"),
    JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: Object.fromEntries(members.map((m) => [m.id, iso(-3 * DAY)])), profiles: { mem_desk: { function: "Sales", onboarded: true, icp, fractionals: true } } }),
  );
  const env: NodeJS.ProcessEnv = { ...process.env, RN_DATA_DIR: bdir, RN_INTEL_SEED: path.join(bdir, "intel-seed.json"), RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin-qa6u-web@example.com", RN_SCAN_TEST: "1", RN_LOGO_LOOKUP: "off", RN_DIGEST: "0", RN_FREE_COMPANY: "off" };
  // The old look here (the rollback): the record is the drawer. The new look's record page is checked below on its own server.
  for (const k of ["RN_UI2", "RN_INTEL_SEED_KEY", "RESEND_API_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_GOOGLE", "RN_BILLING", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR", "STRIPE_API_URL"]) delete env[k];
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
    const ctxFor = async (opts: import("playwright").BrowserContextOptions, token: string) => {
      const ctx = await browser.newContext(opts);
      await ctx.addCookies([{ name: "rn_table", value: token, url: BASE }]);
      return ctx;
    };
    const settle = (page: import("playwright").Page) =>
      page.waitForFunction(() => !!document.querySelector(".tp-top") && !document.querySelector(".tp-allwait, .mv-skel, .td-card-skel, .hm-card-wait"), null, { timeout: 30_000 }).catch(() => {});
    try {
      /* ---------- the record at 768 ---------- */
      console.log("\nThe record at 768");
      {
        const ctx = await ctxFor({ viewport: { width: 768, height: 1024 } }, members[0].token);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?t=companies`);
        await settle(page);
        await page.waitForSelector(".tp-table tbody tr", { timeout: 20_000 }).catch(() => {});
        // A row is its own Tab stop (Enter opens its record).
        const opener = page.locator(".tp-table tbody tr[data-row]").first();
        await opener.focus();
        const openerLabel = await opener.evaluate((el) => el.outerHTML.slice(0, 120));
        await page.keyboard.press("Enter");
        await page.waitForSelector(".tp-drawer[role='dialog']", { timeout: 8000 }).catch(() => {});
        const st = await page.evaluate(() => ({
          modal: document.querySelector(".tp-drawer")?.getAttribute("aria-modal"),
          // The page beside the record (the table and the top bar, wherever the layout nests them) is out of reach.
          inert: !!document.querySelector(".tp-table")?.closest("[inert]") && !!document.querySelector(".tp-top")?.closest("[inert]"),
        }));
        check("the record covers the table and is modal: aria-modal, the page behind inert", st.modal === "true" && st.inert, st);
        let outside = 0;
        for (let k = 0; k < 40; k++) {
          await page.keyboard.press("Tab");
          if (!(await page.evaluate(() => !!document.activeElement?.closest(".tp-drawer")))) outside++;
        }
        check("40 Tabs never leave the record", outside === 0, outside);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
        const back = await page.evaluate(() => ({ open: !!document.querySelector(".tp-drawer"), inert: !!document.querySelector(".tp-app [inert]"), focus: document.activeElement?.outerHTML.slice(0, 120) ?? "" }));
        check("Escape closes it, the page is back, focus returns to the row", !back.open && !back.inert && back.focus === openerLabel, { back, openerLabel });
        await ctx.close();
      }
      {
        const ctx = await ctxFor({ viewport: { width: 1440, height: 900 } }, members[0].token);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?t=companies`);
        await settle(page);
        await page.locator(".tp-table tbody tr").first().click();
        await page.waitForSelector(".tp-drawer", { timeout: 8000 }).catch(() => {});
        check("at 1440 the record sits beside the table and stays non-modal", (await page.evaluate(() => document.querySelector(".tp-drawer")?.getAttribute("aria-modal"))) === "false");
        await ctx.close();
      }

      /* ---------- the chips in onboarding ---------- */
      console.log("\nOnboarding's chips");
      {
        const ctx = await ctxFor({ viewport: { width: 1440, height: 900 } }, members[1].token);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`);
        await page.waitForSelector(".ob-chips[role='radiogroup']", { timeout: 20_000 }).catch(() => {});
        const tabs = await page.evaluate(() => [...document.querySelectorAll(".ob-chips[aria-label='Your function'] [role='radio']")].map((b) => (b as HTMLElement).tabIndex));
        check("one Tab stop in the group (the first while none is chosen)", tabs.length > 3 && tabs.filter((x) => x === 0).length === 1 && tabs[0] === 0, tabs);
        await page.locator(".ob-chips[aria-label='Your function'] [role='radio']").first().focus();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        const st = await page.evaluate(() => {
          const r = [...document.querySelectorAll(".ob-chips[aria-label='Your function'] [role='radio']")] as HTMLElement[];
          return { focus: r.indexOf(document.activeElement as HTMLElement), checked: r.findIndex((x) => x.getAttribute("aria-checked") === "true"), tab: r.map((x) => x.tabIndex).indexOf(0) };
        });
        check("ArrowRight twice: the third chip is focused, chosen, and the one Tab stop", st.focus === 2 && st.checked === 2 && st.tab === 2, st);
        await page.keyboard.press("ArrowLeft");
        check("ArrowLeft steps back", (await page.evaluate(() => [...document.querySelectorAll(".ob-chips[aria-label='Your function'] [role='radio']")].findIndex((x) => x.getAttribute("aria-checked") === "true"))) === 1);
        await ctx.close();
      }

      /* ---------- Fractionals at 768 ---------- */
      console.log("\nFractionals at 768");
      {
        const ctx = await ctxFor({ viewport: { width: 768, height: 1024 } }, members[0].token);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?p=fractionals`);
        await page.waitForSelector(".fr-table", { timeout: 20_000 }).catch(() => {});
        const m = await page.evaluate(() => {
          const w = document.querySelector(".fr-tablewrap") as HTMLElement | null;
          const tb = document.querySelector(".fr-table") as HTMLElement | null;
          return w && tb ? { wrap: w.clientWidth, table: tb.scrollWidth } : null;
        });
        check("all five columns fit the frame", !!m && m.table <= m.wrap, m);
        await ctx.close();
      }

      /* ---------- touch at 768 ---------- */
      console.log("\nTouch at 768");
      {
        const ctx = await ctxFor({ viewport: { width: 768, height: 1024 }, hasTouch: true }, members[0].token);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?t=companies`);
        await settle(page);
        const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
        if (!coarse) console.log("NOTE this browser doesn't report a coarse pointer with touch on: the sizes below are checked by the stylesheet's rule only.");
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".tp-top button, .tp-top a")]
            .filter((e) => e.offsetParent !== null)
            .map((e) => ({ l: e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 20), h: Math.round(e.getBoundingClientRect().height) }))
            .filter((x) => x.h < 44),
        );
        check("the top bar's controls are 44px tall on touch", !coarse || small.length === 0, small);
        await ctx.close();
      }
      /* ---------- the new look: the record is a page at 1440, the drawer on a phone ---------- */
      console.log("\nThe record in the new look (RN_UI2=on)");
      {
        const PORT2 = PORT + 1;
        const BASE2 = `http://127.0.0.1:${PORT2}`;
        const bdir2 = mkdtempSync(path.join(tmpdir(), "rn-qa6u-web2-"));
        for (const f of ["intel-seed.json", "intel.json"]) writeFileSync(path.join(bdir2, f), readFileSync(path.join(bdir, f)));
        const server2 = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT2)], { env: { ...env, RN_UI2: "on", RN_DATA_DIR: bdir2, RN_INTEL_SEED: path.join(bdir2, "intel-seed.json") }, stdio: ["ignore", "pipe", "pipe"] });
        let log2 = "";
        server2.stdout.on("data", (d) => (log2 += d));
        server2.stderr.on("data", (d) => (log2 += d));
        try {
          let up2 = false;
          for (let k = 0; k < 120 && !up2; k++) {
            try {
              up2 = (await realFetch(`${BASE2}/api/health`)).ok;
            } catch {}
            if (!up2) await new Promise((r) => setTimeout(r, 500));
          }
          check("the new look's server is up", up2, log2.slice(-400));
          if (up2) {
            let phoneKey: string | null = null;
            const ctx2 = async (opts: import("playwright").BrowserContextOptions) => {
              const ctx = await browser.newContext(opts);
              await ctx.addCookies([{ name: "rn_table", value: members[0].token, url: BASE2 }]);
              return ctx;
            };
            {
              const ctx = await ctx2({ viewport: { width: 1440, height: 900 } });
              const page = await ctx.newPage();
              await page.goto(`${BASE2}/?t=companies`);
              await settle(page);
              await page.waitForSelector(".wb-scroll tbody tr[data-row]", { timeout: 20_000 }).catch(() => {});
              const opener = page.locator(".wb-scroll tbody tr[data-row]").first();
              const key = await opener.getAttribute("data-row");
              const key2 = await page.locator(".wb-scroll tbody tr[data-row]").nth(1).getAttribute("data-row");
              await opener.focus();
              await page.keyboard.press("Enter");
              await page.waitForSelector("main.co-page", { timeout: 10_000 }).catch(() => {});
              const st = await page.evaluate(() => ({ page: !!document.querySelector("main.co-page"), drawer: !!document.querySelector(".tp-drawer"), table: !!document.querySelector(".wb-scroll"), url: location.search, focus: document.activeElement?.matches("h1.co-name-h") ?? false }));
              check("at 1440 the record opens as a page in place of the list (no drawer), its title focused, at ?c=", st.page && !st.drawer && !st.table && /[?&]c=/.test(st.url) && st.focus, st);
              await page.keyboard.press("Escape");
              await page.waitForTimeout(500);
              const back = await page.evaluate(() => ({ page: !!document.querySelector("main.co-page"), table: !!document.querySelector(".wb-scroll"), row: (document.activeElement as HTMLElement | null)?.closest("tr")?.getAttribute("data-row") ?? null }));
              check("Escape goes back to the list, and focus to the row it was opened from", !back.page && back.table && back.row === key, { back, key });
              await page.goto(`${BASE2}/?c=${key2}`);
              await page.waitForSelector("main.co-page", { timeout: 10_000 }).catch(() => {});
              check("an old /?c= address opens the page too", await page.evaluate(() => !!document.querySelector("main.co-page") && !document.querySelector(".tp-drawer")));
              phoneKey = key2;
              await ctx.close();
            }
            {
              const ctx = await ctx2({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
              const page = await ctx.newPage();
              await page.goto(`${BASE2}/?c=${phoneKey}`);
              await page.waitForSelector(".tp-drawer", { timeout: 10_000 }).catch(() => {});
              check("on a phone the record stays the drawer", await page.evaluate(() => !!document.querySelector(".tp-drawer") && !document.querySelector("main.co-page")));
              await ctx.close();
            }
          }
        } finally {
          try {
            server2.kill();
          } catch {}
          rmSync(bdir2, { recursive: true, force: true });
        }
      }

      const cssAll = readFileSync("app/post/post.css", "utf8");
      check("the touch rule covers icon buttons, chips, the credits pill and the record's links", /@media \(pointer: coarse\) \{\s*\.tp-app \.tp-iconbtn,[\s\S]*?min-width: 44px;[\s\S]*?\.tp-app \.chip,[\s\S]*?\.tp-app \.tp-credits,[\s\S]*?\.tp-drawer \.tp-dlinks a,/.test(cssAll));
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
  if (!process.env.QA6U_NOBROWSER) await inBrowser();
} catch (e) {
  failures++;
  console.log(`FAIL crashed: ${(e as Error).stack}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
