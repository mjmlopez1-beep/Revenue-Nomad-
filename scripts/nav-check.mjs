#!/usr/bin/env node
/**
 * The app's way around, checked in a real browser on a made-up seed: screenshots of Home, the
 * table, a record and the phone's More sheet, how many clicks every page is from Home, Home's
 * first paint on a throttled iPhone 13, and no sideways scroll at five widths.
 *
 *   npm run build
 *   node scripts/nav-check.mjs                  everything (OUT=<folder> for the screenshots)
 *   ONLY=paint node scripts/nav-check.mjs       Home's first paint only (RUNS=5 by default)
 *
 * It writes its own made-up seed (fake companies, fake people, nobody real) into a temporary data
 * folder, starts `next start` on PORT (5930 by default) with the test helpers' switches
 * (RN_SCAN_TEST=1, billing on with fake Stripe ids so a trial shows, logo lookups off), and
 * removes the folder after. Nothing leaves the machine. Needs Playwright (NODE_PATH or node_modules).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const PORT = Number(process.env.PORT || 5930);
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.OUT || path.join(tmpdir(), "nav-check");
const ONLY = process.env.ONLY || "all";
const RUNS = Number(process.env.RUNS || 5);
mkdirSync(OUT, { recursive: true });

/* ---------- a made-up seed ---------- */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms) => new Date(t0 - ms).toISOString();
const monthAgo = (n) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const A = ["Quill", "Bramble", "Larkspur", "Copperleaf", "Driftwood", "Saltmarsh", "Juniper", "Ironbark", "Tidewater", "Foxglove", "Hollowell", "Marigold", "Pinecrest", "Wrenfield", "Stonebridge", "Ashgrove"];
const B = ["Analytics", "Health", "Robotics", "Logistics", "Labs", "Software", "Freight", "Payments", "Kitchens", "Energy", "Learning", "Security"];
const FIRST = ["Avery", "Blake", "Cameron", "Dana", "Emerson", "Finley", "Harper", "Jules", "Kendall", "Logan", "Morgan", "Parker", "Quinn", "Reese", "Sawyer", "Tatum"];
const LAST = ["Ashby", "Brook", "Calloway", "Dunmore", "Ellery", "Fairbanks", "Garland", "Hollis", "Ingram", "Jessup", "Kingsley", "Lowell", "Merriman", "Northcott", "Oakes", "Pemberton"];
const IND = ["SaaS", "Fintech", "Healthcare", "Manufacturing", "Logistics"];
const SIZE = ["11–50", "51–200", "201–500"];
const HQ = ["Austin, TX", "Denver, CO", "Chicago, IL", "Boston, MA", "Seattle, WA", "Atlanta, GA"];
const FNS = ["Marketing", "Sales", "Finance", "RevOps"];
const person = (k) => `${FIRST[k % FIRST.length]} ${LAST[(k * 7) % LAST.length]}`;
const companies = Array.from({ length: 64 }, (_, k) => ({
  id: `c_nav${String(k).padStart(2, "0")}`,
  fields: {
    name: `${A[k % A.length]} ${B[(k * 5) % B.length]}`,
    website: `${A[k % A.length].toLowerCase()}${k}.example`,
    industry: IND[k % IND.length],
    employees: SIZE[k % SIZE.length],
    revenue: "$5M–$20M",
    hq: HQ[k % HQ.length],
  },
}));
const engagements = [];
const contacts = [];
companies.forEach((c, k) => {
  const fn = FNS[k % FNS.length];
  // Older fractional hires, some with their holder on file.
  engagements.push({
    id: `e_nav${k}_a`,
    companyId: c.id,
    verified: false,
    fields: { source: "Seat scan", ...(k % 3 === 0 ? { operator: person(k) } : {}), role: `Fractional ${fn} Lead`, function: fn, type: "Fractional", start: monthAgo(4 + (k % 9)), status: "Active", end: "Ongoing" },
  });
  // A fractional Marketing hire just added: Crystal Ball's companies for a Sales member today.
  if (k % 4 === 2)
    engagements.push({
      id: `e_nav${k}_mkt`,
      companyId: c.id,
      verified: false,
      addedAt: ago(2 * HOUR + k * 60_000),
      fields: { source: "Seat scan", ...(k % 8 === 2 ? { operator: person(k + 3) } : {}), role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" },
    });
  // Open Sales roles.
  if (k % 5 === 2) engagements.push({ id: `e_nav${k}_open`, companyId: c.id, verified: false, fields: { source: "Demand scan", role: "Fractional VP Sales", function: "Sales", status: "Open role", posting: `https://${c.fields.website}/jobs`, rate: "$9k/mo" } });
  if (k % 6 === 0) contacts.push({ id: `p_nav${k}`, engagementId: `e_nav${k}_a`, fields: { name: person(k + 11), title: "CEO", relationship: "Hiring for the seat", email: `ceo@${c.fields.website}` } });
});
const MEMBERS = {
  fresh: { id: "mem_riley", name: "Riley Newcomb", email: "riley.newcomb@example.com", title: "Fractional VP Sales", token: "tok-nav-riley-0001" },
  trial: { id: "mem_jordan", name: "Jordan Avery", email: "jordan.avery@example.com", title: "Fractional VP Sales", token: "tok-nav-jordan-0002" },
  peer: { id: "mem_casey", name: "Casey Morgan", email: "casey.morgan@example.com", title: "Fractional CMO", token: "tok-nav-casey-0003" },
  admin: { id: "mem_ada", name: "Ada Admin", email: "admin-nav@example.com", title: "Admin", token: "tok-nav-ada-0004" },
};
const seed = { builtAt: ago(30 * DAY), members: Object.values(MEMBERS), companies, engagements, contacts };
const ICP = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };

const dir = mkdtempSync(path.join(tmpdir(), "rn-nav-"));
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(3 * DAY)])),
    profiles: {
      mem_riley: { function: "Sales", onboarded: true, icp: ICP, before: ["Marketing"], goal: "adjacent" },
      mem_jordan: { function: "Sales", onboarded: true, icp: ICP, before: ["Marketing"] },
      mem_casey: { function: "Marketing", onboarded: true, icp: ICP },
      mem_ada: { function: "Sales", onboarded: true, icp: ICP, before: ["Marketing"] },
    },
    follows: { mem_jordan: ["c_nav05", "c_nav09", "c_nav13"] },
    billing: { members: { mem_jordan: { trialStartedAt: ago(4 * DAY), trialEndsAt: new Date(t0 + 10 * DAY).toISOString() } } },
    conversations: [
      {
        id: "cv_nav_1",
        a: "mem_casey",
        b: "mem_jordan",
        about: { companyId: "", engagementId: "" },
        kind: "partners",
        messages: [{ id: "m_nav_1", by: "mem_casey", at: ago(5 * HOUR), text: "Hi Jordan, we serve the same kind of clients. Coffee next week?" }],
        readAt: {},
        status: "open",
        createdAt: ago(5 * HOUR),
      },
    ],
  }),
);

/* ---------- the server ---------- */
const env = {
  ...process.env,
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: MEMBERS.admin.email,
  RN_SCAN_TEST: "1",
  RN_LOGO_LOOKUP: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_navcheck",
  STRIPE_WEBHOOK_SECRET: "whsec_navcheck",
  STRIPE_PRICE_MONTH: "price_navcheck_m",
  STRIPE_PRICE_YEAR: "price_navcheck_y",
};
for (const k of ["RN_INTEL_SEED_KEY", "RESEND_API_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_GOOGLE"]) delete env[k];
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

const api = async (token, action) => {
  const r = await fetch(`${BASE}/api/table`, { method: "POST", headers: { "content-type": "application/json", cookie: `rn_table=${token}` }, body: JSON.stringify({ action }) });
  return r.json().catch(() => null);
};
const coId = async (k) => {
  const v = await (await fetch(`${BASE}/api/table`, { headers: { cookie: `rn_table=${MEMBERS.admin.token}` } })).json();
  return v.companies.find((c) => c.name === companies[k].fields.name)?.id;
};

/* ---------- the trial member's saved views and an unlock ---------- */
if (ONLY !== "paint") {
  const T = MEMBERS.trial.token;
  // Places as the table writes them (model.ts absolutePlace), so the view on screen is the saved one.
  const place = (v, t, f) => {
    const q = new URLSearchParams();
    q.set("v", v);
    q.set("t", t);
    q.set("f", f || "-");
    return q.toString();
  };
  await api(T, { type: "savedView", op: "save", name: "Open Sales roles", email: true, place: place("hiring", "seats", ""), criteria: { functions: ["Sales"] } });
  await api(T, { type: "savedView", op: "save", name: "Hired a fractional CMO lately", email: false, place: place("all", "companies", "hiredFn:Marketing~hiredWithin:6"), criteria: { hiredFn: ["Marketing"], hiredWithin: 6 } });
  await api(T, { type: "savedView", op: "save", name: "51–200 employees", email: true, place: place("all", "companies", "employees:51–200"), criteria: { employees: ["51–200"] } });
  const id = await coId(9);
  if (id) await api(T, { type: "unlock", entity: "company", id, field: "identity" });
}

/* ---------- the browser ---------- */
const browser = await chromium.launch();
const iphone = devices["iPhone 13"];
const results = {};

async function context(member, opts = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, ...opts });
  await ctx.addCookies([{ name: "rn_table", value: member.token, url: BASE }]);
  // The last visit, three days ago, so "Since Tuesday" has something to say.
  await ctx.addInitScript((at) => {
    try {
      if (!localStorage.getItem("tp_last_visit")) localStorage.setItem("tp_last_visit", at);
    } catch {}
  }, ago(3 * DAY));
  return ctx;
}
/** The app is drawn (its top bar is there) and nothing on screen is still loading. */
const settle = (page) =>
  page
    .waitForFunction(() => !!document.querySelector(".tp-top") && !document.querySelector(".tp-allwait, .td-card-skel, .hm-card-wait"), null, { timeout: 20_000 })
    .catch(() => {});
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`shot ${name}.png`);
};

async function firstPaint() {
  const times = [];
  for (let k = 0; k < RUNS; k++) {
    const ctx = await context(MEMBERS.trial, { ...iphone });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 85, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (9 * 1024 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    // The moment the lead card is in the page, seen from inside it (a poll from outside lands late while the page is busy).
    await page.addInitScript(() => {
      const mo = new MutationObserver(() => {
        if (window.__lead == null && document.querySelector(".td-card:not(.td-card-skel)")) {
          window.__lead = performance.now();
          mo.disconnect();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    });
    if (process.env.TRACE)
      await page.addInitScript(() => {
        window.__lt = [];
        try {
          new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(`${Math.round(e.startTime)}+${Math.round(e.duration)}`))).observe({ type: "longtask", buffered: true });
        } catch {}
      });
    if (process.env.PROFILE) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
      await cdp.send("Profiler.start");
    }
    if (process.env.TRACEFILE) await browser.startTracing(page, { path: process.env.TRACEFILE, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink.user_timing", "loading"] });
    const start = Date.now();
    await page.goto(`${BASE}/`, { waitUntil: "commit" });
    // Home is painted: its lead card (not the skeleton) is on screen.
    await page.waitForSelector(".td-card:not(.td-card-skel)", { timeout: 30_000 });
    const ms = await page.evaluate(() => window.__lead ?? null);
    if (process.env.TRACEFILE) await browser.stopTracing();
    if (process.env.PROFILE) {
      const { profile } = await cdp.send("Profiler.stop");
      // Self time by function and file, up to the lead card.
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const self = new Map();
      const dt = profile.timeDeltas;
      let t = profile.startTime;
      const leadUs = profile.startTime + (ms ?? 0) * 1000;
      profile.samples.forEach((id, k) => {
        t += dt[k];
        const n = byId.get(id);
        const f = n.callFrame;
        const key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber}`;
        self.set(key, (self.get(key) ?? 0) + dt[k] / 1000);
      });
      void leadUs;
      console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(1)}ms ${k}`).join("\n"));
    }
    const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null);
    if (process.env.TRACE)
      console.log(
        await page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .filter((r) => r.duration > 30)
            .map((r) => `${Math.round(r.startTime)}-${Math.round(r.responseEnd)} ${Math.round(r.encodedBodySize / 1024)}KB ${r.name.replace(location.origin, "").slice(0, 70)}`)
            .join("\n"),
        ),
        "\nlong tasks:",
        await page.evaluate(() => (window.__lt ?? []).join(" ")),
      );
    times.push({ lead: Math.round(ms ?? Date.now() - start), fcp: fcp ? Math.round(fcp) : null });
    await ctx.close();
  }
  const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  results.paint = { runs: times, medianLeadMs: med(times.map((t) => t.lead)), medianFcpMs: med(times.map((t) => t.fcp ?? 0)) };
  console.log("first paint", JSON.stringify(results.paint));
}

async function shots() {
  // (a) A new member mid-onboarding, Home at 1440 by 900.
  let ctx = await context(MEMBERS.fresh, { viewport: { width: 1440, height: 900 } });
  let page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await settle(page);
  await page.waitForTimeout(800);
  await shot(page, "home-new-member-1440");
  await ctx.close();

  // (b) A trial member with saved views and Crystal Ball rows.
  ctx = await context(MEMBERS.trial, { viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await settle(page);
  await page.waitForTimeout(800);
  await shot(page, "home-trial-member-1440");
  await page.screenshot({ path: path.join(OUT, "home-trial-member-1440-full.png"), fullPage: true });
  // The table with the sidebar and the filter rail.
  await page.goto(`${BASE}/?p=table`);
  await settle(page);
  await page.waitForTimeout(800);
  await shot(page, "table-1440");
  // A record open.
  await page.locator("[data-row]").first().click();
  await page.waitForSelector(".tp-drawer", { timeout: 10_000 });
  await page.waitForTimeout(500);
  await shot(page, "record-1440");
  await ctx.close();

  // Phones: Home and the More sheet on an iPhone 13.
  ctx = await context(MEMBERS.trial, { ...iphone });
  page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await settle(page);
  await page.waitForTimeout(800);
  await shot(page, "home-iphone13");
  await page.screenshot({ path: path.join(OUT, "home-iphone13-full.png"), fullPage: true });
  const more = page.locator(".tp-tabbar [data-nav='more']");
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(500);
    await shot(page, "more-sheet-iphone13");
  } else console.log("no More tab");
  await ctx.close();
}

/** Every page one click from Home: each sidebar item, clicked from Home, lands where it says. */
async function clicks() {
  const ctx = await context(MEMBERS.trial, { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await settle(page);
  const items = await page.$$eval(".tp-nav a[data-nav]", (as) => as.map((a) => ({ key: a.getAttribute("data-nav"), href: a.getAttribute("href"), label: a.textContent?.trim() })));
  const out = [];
  for (const it of items) {
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.locator(`.tp-nav a[data-nav="${it.key}"]`).first().click();
    await page.waitForTimeout(700);
    const now = await page.evaluate(() => ({ url: location.pathname + location.search, current: document.querySelector(".tp-nav [aria-current='page']")?.getAttribute("data-nav") ?? null, h1: document.querySelector("main h1, h1")?.textContent?.trim() ?? null }));
    out.push({ key: it.key, clicks: 1, url: now.url, current: now.current, ok: now.current === it.key, h1: now.h1 });
  }
  // The buttons (Add what you know, Invite) open their sheets in one click too.
  for (const key of await page.$$eval(".tp-nav button[data-nav]", (bs) => bs.map((b) => b.getAttribute("data-nav")))) {
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.locator(`.tp-nav button[data-nav="${key}"]`).first().click();
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => !!document.querySelector(".tp-modal, .tp-sheet, [role='dialog'], .tp-menu"));
    out.push({ key, clicks: 1, ok: open, opens: "dialog" });
    await page.keyboard.press("Escape");
  }
  // Back and Forward between two pages opened from the sidebar.
  await page.goto(`${BASE}/`);
  await settle(page);
  await page.locator('.tp-nav a[data-nav="credits"]').click();
  await page.waitForTimeout(500);
  await page.locator('.tp-nav a[data-nav="rates"]').click();
  await page.waitForTimeout(500);
  await page.goBack();
  await page.waitForTimeout(700);
  const back1 = await page.evaluate(() => document.querySelector(".tp-nav [aria-current='page']")?.getAttribute("data-nav"));
  await page.goBack();
  await page.waitForTimeout(700);
  const back2 = await page.evaluate(() => document.querySelector(".tp-nav [aria-current='page']")?.getAttribute("data-nav"));
  await page.goForward();
  await page.waitForTimeout(700);
  const fwd = await page.evaluate(() => document.querySelector(".tp-nav [aria-current='page']")?.getAttribute("data-nav"));
  results.history = { back1, back2, fwd, ok: back1 === "credits" && back2 === "today" && fwd === "credits" };
  results.clicks = out;
  console.log("clicks", JSON.stringify(out, null, 1));
  console.log("history", JSON.stringify(results.history));
  await ctx.close();
}

/** No page scrolls sideways at 320, 390, 768, 1024 and 1440. */
async function sideways() {
  const out = [];
  const pages = ["/", "/?p=table", "/?p=radar", "/?p=credits", "/?p=messages", "/?p=seats", "/?p=rates", "/?p=partners", "/?p=integrations", "/?p=billing"];
  for (const w of [320, 390, 768, 1024, 1440]) {
    const ctx = await context(MEMBERS.trial, w < 768 ? { ...iphone, viewport: { width: w, height: 800 } } : { viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.goto(`${BASE}${p}`);
      await settle(page);
      await page.waitForTimeout(300);
      const x = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      out.push({ w, p, over: x.sw - x.cw });
    }
    await ctx.close();
  }
  results.sideways = { bad: out.filter((x) => x.over > 0), checked: out.length };
  console.log("sideways", JSON.stringify(results.sideways));
}

try {
  if (ONLY === "debug") {
    const r = await (await fetch(`${BASE}/api/table?radar=1`, { headers: { cookie: `rn_table=${MEMBERS.trial.token}` } })).json();
    console.log(JSON.stringify({ ready: r.ready, day: r.day, days: r.days, rows: r.rows?.length, fn: r.function, before: r.before }));
  }
  if (ONLY === "probe") {
    // What sticks out past the right edge at one width (PROBE=/?p=table, WIDTH=390).
    const w = Number(process.env.WIDTH || 390);
    const ctx = await context(MEMBERS.trial, { ...iphone, viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${process.env.PROBE || "/?p=table"}`);
    await settle(page);
    await page.waitForTimeout(500);
    const out = await page.evaluate((vw) => {
      const hits = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 0.5 && r.width > 0) hits.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").join(".")} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
      }
      return hits.slice(0, 25);
    }, w);
    console.log(out.join("\n"));
    await ctx.close();
  }
  if (ONLY === "paint" || ONLY === "all") await firstPaint();
  if (ONLY === "shots" || ONLY === "all") await shots();
  if (ONLY === "clicks" || ONLY === "all") await clicks();
  if (ONLY === "sideways" || ONLY === "all") await sideways();
  writeFileSync(path.join(OUT, `results-${ONLY}.json`), JSON.stringify(results, null, 2));
} catch (e) {
  console.error(e);
  console.error(serverLog.slice(-3000));
  process.exitCode = 1;
} finally {
  await browser.close();
  stop();
}
