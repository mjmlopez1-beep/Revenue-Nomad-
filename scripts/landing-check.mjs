#!/usr/bin/env node
/**
 * The signed-out landing page, checked in a real browser on a made-up seed: screenshots (full
 * page and first screen, phone and desktop), first paint on a throttled iPhone 13, the words in
 * the first phone screen, page weight, no sideways scroll at five widths, the page's words
 * with a few functions picked (nothing may say one function unless the visitor chose it), and
 * the page working: the function, the questions, the tabs, Refine, Sign in and joining.
 *
 *   npm run build
 *   TAG=after node scripts/landing-check.mjs          everything (OUT=<folder> for the screenshots)
 *   ONLY=paint|shots|words|weight|scroll|functions|flow   one part (or several, comma separated)
 *
 * It writes its own made-up seed (fake companies at .example addresses, fake people, nobody
 * real) into a temporary data folder, starts `next start` on PORT (5940 by default) with the test
 * helpers' switches (RN_SCAN_TEST=1, logo lookups off), and removes the folder after. Nothing
 * leaves the machine. Needs Playwright (NODE_PATH or node_modules).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const PORT = Number(process.env.PORT || 5940);
const BASE = process.env.BASE || `http://localhost:${PORT}`;
const OUT = process.env.OUT || path.join(tmpdir(), "landing-check");
const TAG = process.env.TAG || "after";
const ONLY = process.env.ONLY || "all";
const RUNS = Number(process.env.RUNS || 5);
mkdirSync(OUT, { recursive: true });

/* ---------- a made-up seed: every function has seats, some have open roles ---------- */
const DAY = 24 * 3_600_000;
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
const FNS = ["Marketing", "Finance", "RevOps", "Sales", "Customer Success", "Product", "Technology", "Operations", "People", "Partnerships", "Growth", "Product Marketing"];
const TITLE = {
  Marketing: "Fractional CMO",
  Finance: "Fractional CFO",
  RevOps: "Fractional Head of RevOps",
  Sales: "Fractional VP Sales",
  "Customer Success": "Fractional VP Customer Success",
  Product: "Fractional CPO",
  Technology: "Fractional CTO",
  Operations: "Fractional COO",
  People: "Fractional VP People",
  Partnerships: "Fractional Head of Partnerships",
  Growth: "Fractional Head of Growth",
  "Product Marketing": "Fractional VP Product Marketing",
};
const person = (k) => `${FIRST[k % FIRST.length]} ${LAST[(k * 7) % LAST.length]}`;
const companies = Array.from({ length: 144 }, (_, k) => ({
  id: `c_lp${String(k).padStart(3, "0")}`,
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
  engagements.push({
    id: `e_lp${k}_a`,
    companyId: c.id,
    verified: false,
    fields: { source: "Seat scan", ...(k % 3 === 0 || k % 12 === 1 ? { operator: person(k) } : {}), role: TITLE[fn], function: fn, type: "Fractional", start: monthAgo(3 + (k % 14)), status: "Active", end: "Ongoing", rate: "$8k/mo" },
  });
  // A second seat in another function at every other company: repeat hirers.
  if (k % 2 === 1) {
    const fn2 = FNS[(k + 5) % FNS.length];
    engagements.push({
      id: `e_lp${k}_b`,
      companyId: c.id,
      verified: false,
      fields: { source: "Seat scan", ...(k % 4 === 1 ? { operator: person(k + 9) } : {}), role: TITLE[fn2], function: fn2, type: k % 3 ? "Fractional" : "Interim", start: monthAgo(1 + (k % 7)), status: "Active", end: "Ongoing" },
    });
  }
  // Open roles across functions.
  if (k % 5 === 2) {
    const fn3 = FNS[(k * 3 + 1) % FNS.length];
    engagements.push({ id: `e_lp${k}_open`, companyId: c.id, verified: false, fields: { source: "Demand scan", role: TITLE[fn3], function: fn3, status: "Open role", posting: `https://${c.fields.website}/jobs`, rate: "$9k/mo" } });
  }
  if (k % 6 === 0) contacts.push({ id: `p_lp${k}`, engagementId: `e_lp${k}_a`, fields: { name: person(k + 11), title: "CEO", relationship: "Hiring for the seat", email: `ceo@${c.fields.website}` } });
});
const seed = {
  builtAt: ago(30 * DAY),
  members: [{ id: "mem_lp_ada", name: "Ada Admin", email: "admin-lp@example.com", title: "Admin", token: "tok-lp-ada-0001" }],
  companies,
  engagements,
  contacts,
};

let stop = () => {};
if (!process.env.BASE) {
  const dir = mkdtempSync(path.join(tmpdir(), "rn-lp-"));
  writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
  const env = { ...process.env, RN_DATA_DIR: dir, RN_INTEL_SEED: path.join(dir, "intel-seed.json"), RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin-lp@example.com", RN_SCAN_TEST: "1", RN_LOGO_LOOKUP: "off", RN_DIGEST: "0", RN_SUPPORT_EMAIL: "support-qa@example.com" };
  for (const k of ["RN_INTEL_SEED_KEY", "RESEND_API_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_GOOGLE", "RN_BILLING"]) delete env[k];
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});
  stop = () => {
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
}

const browser = await chromium.launch();
const iphone = devices["iPhone 13"];
const results = { tag: TAG };
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** The landing is drawn: its headline, the counts and the first preview answer are in. */
async function settle(page) {
  await page.waitForSelector(".lp-h1", { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector(".lp [aria-busy='true']") && !document.querySelector(".lp-tt-skel, .lp-rec-loading"), null, { timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function shots() {
  for (const [name, opts] of [
    ["390", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: iphone.userAgent }],
    ["1440", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
  ]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `${TAG}-first-${name}.png`) });
    // Lazy pictures load as the page scrolls by.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${TAG}-full-${name}.png`), fullPage: true });
    console.log(`shot ${TAG}-first-${name}.png ${TAG}-full-${name}.png`);
    await ctx.close();
  }
}

/** First contentful paint, and the moment the hero's headline is in the page, on a throttled iPhone 13. */
async function paint() {
  const times = [];
  for (let k = 0; k < RUNS; k++) {
    const ctx = await browser.newContext({ ...iphone });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 85, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (9 * 1024 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const mo = new MutationObserver(() => {
        if (window.__hero == null && document.querySelector(".lp-h1")) window.__hero = performance.now();
        if (window.__rec == null && document.querySelector(".lp-rec:not(.lp-rec-loading)")) {
          window.__rec = performance.now();
          mo.disconnect();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
      try {
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {}
    });
    await page.goto(`${BASE}/`, { waitUntil: "commit" });
    await page.waitForSelector(".lp-rec:not(.lp-rec-loading)", { timeout: 60_000 });
    await page.waitForTimeout(1500);
    const t = await page.evaluate(() => ({
      fcp: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0),
      hero: Math.round(window.__hero ?? 0),
      record: Math.round(window.__rec ?? 0),
      lcp: Math.round(window.__lcp ?? 0),
    }));
    times.push(t);
    await ctx.close();
  }
  results.paint = { runs: times, medianFcpMs: med(times.map((t) => t.fcp)), medianHeroMs: med(times.map((t) => t.hero)), medianLcpMs: med(times.map((t) => t.lcp)), medianRecordMs: med(times.map((t) => t.record)) };
  console.log("paint", JSON.stringify(results.paint));
}

/** The words a visitor can read in the first phone screen (390 by 844), without scrolling. */
async function words() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: iphone.userAgent });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await settle(page);
  const seen = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent.replace(/\s+/g, " ").trim();
      const el = n.parentElement;
      if (!text || !el || el.closest("script, style, [aria-hidden='true'], .sr-only, .locked-blur")) continue;
      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      range.selectNodeContents(n);
      // Each line box on screen counts for the share of the node it holds.
      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      if (!rects.length) continue;
      const inView = rects.filter((r) => r.top < window.innerHeight - 4 && r.bottom > 0 && r.left < window.innerWidth && r.right > 0);
      if (!inView.length) continue;
      const all = text.split(" ").filter(Boolean).length;
      out.push({ text, words: Math.round((all * inView.length) / rects.length) });
    }
    return out;
  });
  results.words = { firstPhoneScreen: seen.reduce((n, x) => n + x.words, 0), text: seen.map((x) => x.text).join(" | ") };
  console.log("words", JSON.stringify(results.words));
  await ctx.close();
}

/** Everything the page downloads to draw itself, signed out, nothing cached. */
async function weight() {
  const ctx = await browser.newContext({ ...iphone });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const by = {};
  const kind = new Map();
  let total = 0;
  let requests = 0;
  cdp.on("Network.responseReceived", (e) => kind.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    const t = kind.get(e.requestId) ?? "Other";
    by[t] = (by[t] ?? 0) + e.encodedDataLength;
    total += e.encodedDataLength;
    requests++;
  });
  await page.goto(`${BASE}/`);
  await settle(page);
  const first = { kb: Math.round(total / 1024), requests, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 1024)])) };
  // The whole page scrolled through, so lazy pictures count too.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  await page.waitForTimeout(1500);
  results.weight = { firstLoad: first, scrolledKb: Math.round(total / 1024), scrolledRequests: requests, pageHeightPx: await page.evaluate(() => document.documentElement.scrollHeight) };
  console.log("weight", JSON.stringify(results.weight));
  await ctx.close();
}

/** No sideways scroll, and nothing wider than the screen, at five widths. */
async function scroll() {
  const out = {};
  for (const w of [320, 390, 768, 1024, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await settle(page);
    out[w] = await page.evaluate(() => {
      const de = document.documentElement;
      window.scrollTo(9999, 0);
      const moved = window.scrollX;
      window.scrollTo(0, 0);
      // Anything that sticks out past the right edge, outside a box that scrolls on its own.
      const wide = [...document.querySelectorAll(".lp *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.right <= window.innerWidth + 1) return false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return false;
          }
          return true;
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
      return { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth, sideways: moved > 0 || de.scrollWidth > window.innerWidth, wide };
    });
    await ctx.close();
  }
  results.scroll = out;
  console.log("scroll", JSON.stringify(out));
}

/** The page's words with no function picked, then with a few picked: which function names it says. */
async function functions() {
  const NAMES = ["Sales", "Marketing", "RevOps", "Customer Success", "Partnerships", "Growth", "Product Marketing", "Enablement", "AI GTM", "Technology", "Finance", "Operations", "People", "Product", "Legal", "Executive"];
  const out = {};
  for (const pick of [null, "Finance", "Marketing", "Customer Success"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    if (pick) await page.addInitScript((f) => localStorage.setItem("tp_try_fn", f), pick);
    await page.goto(`${BASE}/`);
    await settle(page);
    out[pick ?? "(none picked)"] = await page.evaluate((names) => {
      const strings = [];
      const walk = document.createTreeWalker(document.querySelector(".lp"), NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement;
        const text = n.textContent.replace(/\s+/g, " ").trim();
        // Options in a picker, the questions (folded) and blurred made-up names are not the page speaking.
        if (!text || !el || el.closest("option, select, script, style, .locked-blur, details:not([open]) > :not(summary)")) continue;
        strings.push(text);
      }
      const all = strings.join(" ");
      const count = Object.fromEntries(names.map((f) => [f, (all.match(new RegExp(`\\b${f}\\b`, "g")) ?? []).length]).filter(([, n]) => n > 0));
      const heads = [...document.querySelectorAll(".lp h1, .lp h2, .lp h3")].filter((h) => !h.closest("details:not([open]) > :not(summary)")).map((h) => `${h.tagName.toLowerCase()}: ${h.textContent.replace(/\s+/g, " ").trim()}`);
      const says = (f) => strings.filter((s) => new RegExp(`\\b${f}\\b|sales`, "i").test(s) && (f !== "Sales" ? true : /sales/i.test(s))).slice(0, 40);
      return { headings: heads, functionWords: count, sayingSales: strings.filter((s) => /\bsales\b/i.test(s)).slice(0, 40), picked: names.includes(document.querySelector("[data-fn]")?.getAttribute("data-fn") ?? "") ? document.querySelector("[data-fn]").getAttribute("data-fn") : null, sample: says("Finance").slice(0, 0) };
    }, NAMES);
    await ctx.close();
  }
  results.functions = out;
  console.log("functions", JSON.stringify(out, null, 1));
}

/** The page works: the function, the questions, the tabs, Refine, Sign in, and joining from the hero form. */
async function flow() {
  let fails = 0;
  const check = (name, ok, got) => {
    if (!ok) fails++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || got === undefined ? "" : ` (${JSON.stringify(got).slice(0, 200)})`}`);
  };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const asked = [];
  page.on("request", (r) => r.url().includes("preview=1") && asked.push(new URL(r.url()).searchParams));
  await page.goto(`${BASE}/`);
  await settle(page);
  const box = page.locator(".lp-ask-box");
  const sel = page.locator(".lp-ask-select");
  check("no function is picked at first", (await sel.inputValue()) === "");
  check("the answer says it is an example", (await page.locator(".lp-res-eg").count()) === 1);
  check("the empty box shows an example question as a placeholder", (await page.locator(".lp-ask-ph").count()) === 1);
  check("an example is never kept for onboarding", (await page.evaluate(() => localStorage.getItem("tp_try_fn"))) === null);
  await sel.selectOption("Finance");
  await page.waitForFunction(() => document.querySelector(".lp-res-fn")?.textContent === "Finance" && document.querySelector(".lp-res")?.getAttribute("aria-busy") === "false");
  check("picking Finance asks the preview for Finance", asked.at(-1)?.get("fn") === "Finance", asked.at(-1)?.toString());
  check("the pick is kept for onboarding", (await page.evaluate(() => localStorage.getItem("tp_try_fn"))) === "Finance");
  check("the example note is gone", (await page.locator(".lp-res-eg").count()) === 0);
  check("the third tab names the function's seat", /No fractional CFO yet/.test(await page.locator(".lp-tab").nth(2).innerText()));
  await page.getByRole("button", { name: "Companies hiring a fractional CFO now" }).click();
  await page.waitForFunction(() => document.querySelector(".lp-tab.is-on")?.textContent?.startsWith("Hiring now") && document.querySelector(".lp-res")?.getAttribute("aria-busy") === "false");
  check("the suggestion fills the box", /Companies hiring a fractional CFO now/.test(await box.innerText()));
  check("and asks for the Hiring now tab", asked.at(-1)?.get("view") === "hiring", asked.at(-1)?.toString());
  const rowsN = await page.locator(".lp-rw:not(.lp-rw-skel)").count();
  check("the list is short (8 rows at most)", rowsN <= 8, rowsN);
  await page.getByRole("button", { name: "Who held the Finance seat before me" }).click();
  await page.waitForFunction(() => document.querySelector(".lp-tab.is-on")?.textContent?.startsWith("All") && document.querySelector(".lp-res")?.getAttribute("aria-busy") === "false");
  check("who held the seat reads the All tab, and its line stands out", (await page.locator(".lp-res-held.is-on").count()) === 1);
  await page.getByRole("button", { name: "What a fractional CFO charges" }).click();
  const note = await page.locator(".lp-res").innerText();
  check("rates has no public answer: no figure, no table", (await page.locator(".lp-rw").count()) === 0 && !/[$€£]\s?\d/.test(note), note.slice(0, 160));
  await page.getByRole("button", { name: "Clear the question" }).click();
  check("clearing the box brings the placeholder back", (await page.locator(".lp-ask-ph").count()) === 1);
  await page.getByRole("button", { name: /^Refine/ }).click();
  const ind = page.locator(".lp-refine-select").first();
  const firstInd = await ind.locator("option").nth(1).getAttribute("value");
  await ind.selectOption(firstInd);
  await page.waitForFunction(() => document.querySelector(".lp-res")?.getAttribute("aria-busy") === "false");
  check("Refine holds the industry and country, and filters the answer", asked.at(-1)?.get("ind") === firstInd && (await page.locator(".lp-refine-n").innerText()) === "1", asked.at(-1)?.toString());
  // The page's own words: nobody's name, no email, no rate.
  const text = await page.locator(".lp").innerText();
  const people = seed.engagements.map((e) => e.fields.operator).concat(seed.contacts.map((c) => c.fields.name)).filter(Boolean);
  check("no seat holder or hiring contact from the seed is on the page", !people.some((n) => text.includes(n)), people.filter((n) => text.includes(n)).slice(0, 3));
  check("no rate from the seed and no posting link is on the page", !/\$[89]k\/mo|\/jobs/.test(await page.content()));
  // Sign in opens and closes.
  await page.locator(".lp-nav-signin").click();
  check("Sign in opens its dialog", (await page.locator(".lp-dialog").count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("Escape closes it", (await page.locator(".lp-dialog").count()) === 0);
  // Joining from the hero form: email, then name, then the member is in (onboarding).
  const hero = page.locator(".lp-hero-form");
  await hero.locator("input[type=email]").fill(`lp-check-${Date.now()}@example.com`);
  await hero.getByRole("button", { name: "Get 25 credits" }).click();
  await hero.locator("input[name=name]").fill("Casey Lander");
  await hero.locator("button[type=submit]").click();
  await page.waitForFunction(() => !document.querySelector(".lp"), null, { timeout: 30_000 }).catch(() => {});
  check("joining from the hero form signs the visitor in", (await page.locator(".lp").count()) === 0);
  await ctx.close();
  results.flow = { fails };
  if (fails) process.exitCode = 1;
}

const parts = { shots, paint, words, weight, scroll, functions, flow };
for (const [name, run] of Object.entries(parts)) if (ONLY === "all" || ONLY.split(",").includes(name)) await run();
writeFileSync(path.join(OUT, `${TAG}-results.json`), JSON.stringify(results, null, 2));
console.log(`results in ${path.join(OUT, `${TAG}-results.json`)}`);
await browser.close();
stop();
process.exit(process.exitCode ?? 0);
