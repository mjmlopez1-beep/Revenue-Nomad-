#!/usr/bin/env node
/**
 * Your network's "Your seat" card and the specific intro note, looked at in a real browser on a
 * made-up seed (iPhone 13, deviceScaleFactor 2): the card's suggestions (the member never suggested,
 * someone already on file as Confirm with what it earns, one tidy row each on a phone, no sideways
 * scroll), Confirm on someone already on file without the page failing, and "Ask Jake" drafting a
 * note that names who Jake can introduce the member to.
 *
 *   npm run build
 *   OUT=<folder> node scripts/intro-check.mjs          (PORT=7031 by default)
 *
 * It writes its own made-up seed (fake companies, fake people, nobody real) into a temporary data
 * folder, with one member's network as a Google sync leaves it (nothing is read from Google: the
 * connector's test address points at a closed local port), starts `next start`, and removes the
 * folder after. Nothing leaves the machine. Needs Playwright (NODE_PATH or node_modules).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const PORT = Number(process.env.PORT || 7031);
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.OUT || path.join(tmpdir(), "intro-check");
mkdirSync(OUT, { recursive: true });

/* ---------- a made-up seed ---------- */
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms) => new Date(t0 + ms).toISOString();
const today = iso(0).slice(0, 10);
const monthAgo = (n) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const dayAgo = (n) => iso(-n * DAY).slice(0, 10);
const co = (id, name, site, industry, employees) => ({ id, fields: { name, website: site, industry, employees, revenue: "$5M–$20M", hq: "Austin, TX" } });
const companies = [
  co("c_skal", "Skyhollow Consulting", "skyhollow.example", "Consulting", "11–50"),
  co("c_brit", "Brightloom Labs", "brightloom.example", "SaaS", "51–200"),
  co("c_acme", "Acorn Ridge Logistics", "acornridge.example", "Logistics", "51–200"),
  co("c_fern", "Fernway Health", "fernway.example", "Healthcare", "51–200"),
  co("c_gale", "Galewind Software", "galewind.example", "SaaS", "51–200"),
];
const seat = (id, companyId, fields, holderKey) => ({ id, companyId, verified: false, fields, ...(holderKey ? { holderKey } : {}) });
const engagements = [
  // Jake Moreno held Brightloom's RevOps seat while Dana Ruiz held its Sales seat; Dana is Acorn Ridge's fractional CRO now.
  seat("e_brit_jake", "c_brit", { source: "Member success story", function: "RevOps", role: "Fractional Head of RevOps", operator: "Jake Moreno", type: "Fractional", start: "2024-02", end: "2025-06", status: "Ended" }, "p_jakefake0001"),
  seat("e_brit_dana", "c_brit", { source: "Member success story", function: "Sales", role: "Fractional CRO", operator: "Dana Ruiz", type: "Fractional", start: "2024-01", end: "2025-03", status: "Ended" }, "p_danafake0001"),
  seat("e_acme_dana", "c_acme", { source: "Member success story", function: "Sales", role: "Fractional CRO", operator: "Dana Ruiz", type: "Fractional", start: monthAgo(2), status: "Active", end: "Ongoing" }, "p_danafake0001"),
  seat("e_acme_cmo", "c_acme", { source: "Seat scan", function: "Marketing", role: "Fractional CMO", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }),
  // Jake holds Fernway's RevOps seat now.
  seat("e_fern_jake", "c_fern", { source: "Member success story", function: "RevOps", role: "Fractional Head of RevOps", operator: "Jake Moreno", type: "Fractional", start: monthAgo(8), status: "Active", end: "Ongoing" }, "p_jakefake0001"),
  seat("e_gale_cfo", "c_gale", { source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", start: monthAgo(3), status: "Active", end: "Ongoing" }),
];
// Already on file at Skyhollow: Dana Whitfield, with everything an Add would send.
const contacts = [{ id: "p_skal_dana", companyId: "c_skal", fields: { name: "Dana Whitfield", title: "VP Sales", relationship: "Worked with" } }];
const m = (id, name, token, title = "Fractional VP Sales") => ({ id, name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`, title, token });
const MEMBERS = { morgan: m("mem_morgan", "Morgan Hale", "tok-ic-morgan-0001"), bo: m("mem_bo", "Bo Other", "tok-ic-bo-0002") };
const seed = { builtAt: iso(-40 * DAY), members: Object.values(MEMBERS), companies, engagements, contacts };
const ICP = { industries: ["Logistics", "SaaS", "Healthcare"], employees: ["51–200"], revenue: [], countries: [] };
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
const months = (n) => Array.from({ length: n }, (_, k) => monthAgo(n - 1 - k));
const person = (email, name, title, meetings, last, first) => ({ key: email, email, name, ...(title ? { title } : {}), meetings, last, first, src: ["calendar", "contacts"], saved: true });

const dir = mkdtempSync(path.join(tmpdir(), "rn-intro-"));
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    // Morgan's own seat at Skyhollow; she has opened Acorn Ridge, Brightloom and Fernway, and who holds Acorn Ridge's Sales seat and Fernway's RevOps seat.
    engagements: [{ id: "e_skal_morgan", companyId: "c_skal", by: "mem_morgan", at: iso(-30 * DAY) }],
    contacts: [],
    values: {
      "e_skal_morgan.operator": { value: "Morgan Hale", by: "mem_morgan", at: iso(-30 * DAY), status: "live", memberId: "mem_morgan" },
      "e_skal_morgan.function": { value: "Sales", by: "mem_morgan", at: iso(-30 * DAY), status: "live" },
      "e_skal_morgan.status": { value: "Active", by: "mem_morgan", at: iso(-30 * DAY), status: "live" },
    },
    unlocks: { "c_acme.identity": ["mem_morgan"], "c_brit.identity": ["mem_morgan"], "c_fern.identity": ["mem_morgan"], "e_acme_dana.operator": ["mem_morgan"], "e_fern_jake.operator": ["mem_morgan"] },
    // Acorn Ridge's team page names a fractional CMO and nobody in Sales.
    leaders: {
      c_acme: {
        status: "found", checkedAt: iso(-5 * DAY), ok: true, readAt: iso(-5 * DAY), teamAt: iso(-5 * DAY), team: true,
        functions: { Marketing: { level: "C-level", kind: "fractional", how: "team page", url: "https://acornridge.example/team", seenAt: iso(-5 * DAY) } },
      },
    },
    seen: Object.fromEntries(seed.members.map((x) => [x.id, iso(-3 * DAY)])),
    profiles: Object.fromEntries(seed.members.map((x) => [x.id, { function: "Sales", onboarded: true, icp: ICP, title: x.title }])),
    billing: { members: { mem_morgan: trial, mem_bo: trial }, events: [], payments: [], ended: [] },
    radar: {
      lastRunAt: null,
      lastRunDay: null,
      members: {
        mem_morgan: {
          sent: {},
          days: {
            [today]: [
              { k: "ic:acme", c: "c_acme", kind: "adjacent", l: "Hired a fractional CMO 1 month ago", b: "High", w: "Fractional CMO hired 1 month ago · Sales usually follows in 1–4 months" },
              { k: "ic:fern", c: "c_fern", kind: "adjacent", l: "Hired a fractional RevOps lead 8 months ago", b: "Medium", w: "Fractional RevOps lead hired 8 months ago · Sales often follows" },
            ],
          },
        },
      },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
    network: {
      mem_morgan: {
        google: { token: "sealed-not-a-real-token", email: "morgan.hale@example.com", scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/contacts.readonly"], connectedAt: iso(-3 * DAY), syncedAt: iso(-20 * 60_000), status: "ok", firstMs: 40_000 },
        found: iso(-2 * DAY),
        cal: {
          at: iso(-20 * 60_000),
          unmatched: 40,
          real: 12,
          companies: {
            // Morgan's client: weekly meetings for a year, with her own work address there, Dana (on file) and Owen (new).
            c_skal: {
              domain: "skyhollow.example",
              meetings: 47,
              months: months(12),
              first: `${monthAgo(11)}-04`,
              last: dayAgo(4),
              people: [
                person("morgan@skyhollow.example", "Morgan Hale", "Fractional VP Sales", 47, dayAgo(4), `${monthAgo(11)}-04`),
                person("dana.w@skyhollow.example", "Dana Whitfield", null, 30, dayAgo(4), `${monthAgo(11)}-04`),
                person("owen@skyhollow.example", "Owen Park", "CEO", 22, dayAgo(11), `${monthAgo(10)}-02`),
              ],
            },
          },
        },
        con: {
          at: iso(-20 * 60_000),
          unmatched: 0,
          real: 0,
          companies: {},
          // Jake Moreno, another fractional Morgan meets often, at no company on Merlin by his email.
          loose: [{ key: "jake@moreno-revops.example", email: "jake@moreno-revops.example", name: "Jake Moreno", title: "Fractional Head of RevOps", meetings: 47, last: dayAgo(29), first: "2024-12-10", src: ["calendar", "contacts"], saved: true, domain: "moreno-revops.example" }],
        },
      },
    },
  }),
);

/* ---------- the server ---------- */
const env = {
  ...process.env,
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "intro-check-not-real",
  RN_STARTER_CREDITS: "25",
  RN_SCAN_TEST: "1",
  RN_LOGO_LOOKUP: "off",
  RN_DIGEST: "0",
  RN_RADAR: "0",
  RN_FREE_COMPANY: "off",
  RN_GOOGLE: "1",
  GOOGLE_CLIENT_ID: "intro-check-client",
  GOOGLE_CLIENT_SECRET: "intro-check-secret",
  RN_GOOGLE_API_TEST: "http://127.0.0.1:9",
};
for (const k of ["RESEND_API_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_GOOGLE_GMAIL", "RN_BILLING", "RN_ADMIN_EMAILS"]) delete env[k];
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stop = () => {
  try {
    server.kill();
  } catch {}
  rmSync(dir, { recursive: true, force: true });
};
process.on("exit", stop);
for (let k = 0; k < 120; k++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)}`}`);
};

if (process.env.DEBUG) console.log("paths:", JSON.stringify(await (await fetch(`${BASE}/api/paths`, { headers: { cookie: `rn_table=${MEMBERS.morgan.token}` } })).json()).slice(0, 3000));
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "rn_table", value: MEMBERS.morgan.token, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e?.stack ?? e)));
await page.goto(`${BASE}/?p=network`);
await page.waitForSelector("#nw-clients .np-client", { timeout: 30_000 });
await page.waitForTimeout(1500);
const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

/* ---------- "Your seat" ---------- */
const card = page.locator(".np-client", { hasText: "Skyhollow Consulting" });
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const rows = await card.locator("li.np-offer").allInnerTexts();
console.log("rows:", JSON.stringify(rows));
check("the member is never suggested at her own seat", !rows.some((t) => /Morgan Hale/.test(t)), rows);
check("someone already on file reads On file and Confirm, with what it earns", rows.some((t) => /Dana Whitfield/.test(t) && /On file/.test(t) && /Confirm/.test(t) && /Confirms their name/.test(t) && !/\+\d/.test(t)), rows);
check("a new person reads Add with its credits", rows.some((t) => /Owen Park/.test(t) && /\+3 credits/.test(t) && /Add/.test(t)), rows);
const heights = await card.locator("li.np-offer").evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().height, e.querySelector(".np-offer-do")?.getBoundingClientRect().height ?? 0]));
check("each suggestion is one tidy card on a phone: two lines at most, its controls on one line", heights.every(([h, d]) => h < 130 && d < 48), heights);
check("no sideways scroll on a phone", !(await sideways()));
await card.screenshot({ path: path.join(OUT, "seat-card-phone.png") });
await card.locator("li.np-offer", { hasText: "Dana Whitfield" }).locator("button").click();
await page.waitForTimeout(3500);
check("Confirm on someone already on file: the page keeps working and the row goes", (await page.locator("text=This page hit a problem").count()) === 0 && !errors.length && (await card.locator("li.np-offer", { hasText: "Dana Whitfield" }).count()) === 0, errors);
await card.screenshot({ path: path.join(OUT, "seat-card-after-confirm.png") });
check("Jake is listed where he holds a seat now, not where he held one", /Fernway Health/.test(await page.locator(".np-intro", { hasText: "Jake Moreno" }).locator(".nw-muted").first().innerText()));

/* ---------- the specific ask ---------- */
const intro = page.locator(".np-intro", { hasText: "Jake Moreno" });
await intro.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
const introText = await intro.innerText();
console.log("intro card:", JSON.stringify(introText));
check("Jake's card: how strong, and who he can introduce her to", /47 meetings since Dec 2024/.test(introText) && /Strong/.test(introText) && /Why Jake:/.test(introText) && /can introduce you to 3 companies that fit your ideal client/.test(introText) && /Acorn Ridge Logistics/.test(introText), introText);
await intro.screenshot({ path: path.join(OUT, "intro-card-phone.png") });
// The toasts go first, so the pictures show the page.
await page.evaluate(() => document.querySelector(".toasts")?.setAttribute("style", "display:none"));
await intro.locator("button", { hasText: "Ask Jake" }).click();
await page.waitForSelector(".mn-sheet", { timeout: 10_000 });
await page.waitForTimeout(700);
const body = await page.locator("#mn-body").inputValue();
const sheet = await page.locator(".mn-sheet").innerText();
console.log("note:", JSON.stringify(body));
check("the note names who and where, and asks for that introduction", /You worked with Dana Ruiz at Brightloom Labs\./.test(body) && /Acorn Ridge Logistics as their fractional CRO/.test(body) && /has no Sales leader yet/.test(body) && /introduce me to Dana Ruiz\?/.test(body) && !/You see a lot of teams/.test(body), body);
check("the sheet says why Jake, and Merlin drafts, you send", /Why Jake: 47 meetings since Dec 2024 · can introduce you to 3 companies that fit your ideal client/.test(sheet) && /Merlin drafts, you send/.test(sheet), sheet.slice(0, 600));
check("no sideways scroll with the note open", !(await sideways()));
await page.screenshot({ path: path.join(OUT, "intro-note-phone.png") });
await page.locator("#mn-body").evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "intro-note-phone-body.png") });

await browser.close();
console.log(failed ? `${failed} failed` : "All passed");
if (failed) console.log(serverLog.slice(-2000));
process.exit(failed ? 1 : 0);
