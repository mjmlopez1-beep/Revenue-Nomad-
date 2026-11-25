#!/usr/bin/env node
/**
 * The signed-out landing page, checked in a real browser on a made-up seed: screenshots (the
 * first screen and the whole page in parts, phone and desktop), first paint on a throttled
 * iPhone 13, the words in the first phone screen, page weight, no sideways scroll at six
 * widths, the pictures (none over text, text over one still 4.5:1, the hero's Nomad whole and
 * its door on the record, at six widths), the page's words with a few functions picked (nothing
 * may say one function unless the visitor chose it), and the page working: the function, the
 * questions, the tabs, Refine, Sign in and joining.
 *
 *   npm run build
 *   TAG=after node scripts/landing-check.mjs          everything (OUT=<folder> for the screenshots)
 *   ONLY=paint|shots|words|weight|scroll|art|functions|flow   one part (or several, comma separated)
 *   EXTRA=320,768,1024,2000   first screens at more widths      PART=3500   the height of a part, in CSS px
 *   EXTRA_WHOLE=1             the whole page at those widths too
 *   DEV=1                     `next dev` in place of `next start`, for a look while the page is being changed
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
/** The whole page is saved in parts this tall (CSS px), so each picture stays small enough to read. */
const PART = Number(process.env.PART || 3500);
/** Every width the layout is checked at. */
const WIDTHS = [320, 390, 768, 1024, 1440, 2000];
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
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", process.env.DEV ? "dev" : "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
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

/**
 * The hero's record made shorter (no open role, nothing to do next) or taller (two more seats),
 * in the page as it stands: the door and the Nomad are placed from the record, whatever its height.
 */
async function reshape(page, kind) {
  await page.evaluate((k) => {
    const rec = document.querySelector(".lp-hero .lp-rec");
    const secs = [...rec.querySelectorAll(".lp-rec-sec")];
    if (k === "short") {
      if (secs.length > 1) secs[0].remove();
      rec.querySelector(".lp-reach-wrap")?.remove();
    } else {
      const last = secs.at(-1);
      last.after(last.cloneNode(true), last.cloneNode(true));
    }
  }, kind);
  await page.waitForTimeout(150);
}

async function shots() {
  for (const [name, opts, whole] of [
    ["390", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: iphone.userAgent }, true],
    ["1440", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, true],
    // EXTRA=320,768,1024,2000: the first screen at more widths, for a look at the layout between and beyond the two.
    ...(process.env.EXTRA ?? "")
      .split(",")
      .filter(Boolean)
      .map((w) => [w, { viewport: { width: Number(w), height: 900 }, deviceScaleFactor: 2, isMobile: Number(w) < 768, hasTouch: Number(w) < 768 }, !!process.env.EXTRA_WHOLE]),
  ]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `${TAG}-first-${name}.png`) });
    if (!whole) {
      console.log(`shot ${TAG}-first-${name}.png`);
      await ctx.close();
      continue;
    }
    // Lazy pictures load as the page scrolls by.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    // The footer's logo loads when it is reached: wait for it, so the last part shows it.
    await page.locator(".lp-foot").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll(".lp img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(600);
    // The whole page, in parts no taller than PART: one long picture is too tall to read.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const parts = Math.ceil(height / PART);
    for (let k = 0; k < parts; k++) {
      const y = k * PART;
      await page.screenshot({ path: path.join(OUT, `${TAG}-full-${name}-part${k + 1}.png`), fullPage: true, clip: { x: 0, y, width: opts.viewport.width, height: Math.min(PART, height - y) } });
    }
    console.log(`shot ${TAG}-first-${name}.png ${TAG}-full-${name}-part1..${parts}.png (${height}px)`);
    // The hero with a taller record, then a short one.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    for (const kind of ["tall", "short"]) {
      if (kind === "short") await page.reload().then(() => settle(page));
      await reshape(page, kind);
      const box = await page.evaluate(() => {
        const r = document.querySelector(".lp-hero").getBoundingClientRect();
        return { x: 0, y: Math.round(r.top + scrollY), width: innerWidth, height: Math.round(r.height) };
      });
      await page.screenshot({ path: path.join(OUT, `${TAG}-hero-${kind}-${name}.png`), fullPage: true, clip: box });
    }
    console.log(`shot ${TAG}-hero-tall-${name}.png ${TAG}-hero-short-${name}.png`);
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

/** No sideways scroll, and nothing wider than the screen, at six widths. */
async function scroll() {
  const out = {};
  for (const w of WIDTHS) {
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

/**
 * The pictures (Fractions, inline SVG with class fx) at six widths. No shape may sit over text.
 * Text that has a shape, or the hero's mint door, behind it must still be 4.5:1 on that colour.
 * In the hero, the Nomad's stage is whole (inside the page, under the nav), its bottom edge is
 * the record's top edge, the door is at least as wide as the record and runs to the hero's
 * bottom edge. The same holds with the record made taller, and shorter.
 */
async function art() {
  const out = {};
  let fails = 0;
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await settle(page);
    const hero = () =>
      page.evaluate(() => {
        const box = (sel) => {
          const e = [...document.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().width > 0);
          return e ? e.getBoundingClientRect() : null;
        };
        const stage = box(".lp-hero-stage");
        const rec = box(".lp-hero .lp-rec");
        const nav = box(".lp-nav");
        const sec = document.querySelector(".lp-hero");
        const h = sec.getBoundingClientRect();
        // Just inside the door, beside the record's bottom and at the hero's bottom edge: the door is there.
        window.scrollTo({ top: h.bottom + scrollY - innerHeight + 40, behavior: "instant" });
        const r2 = box(".lp-hero .lp-rec");
        const h2 = sec.getBoundingClientRect();
        const s2 = box(".lp-hero-stage");
        const doorAt = (y) => !!document.elementFromPoint(s2.left + 4, y)?.closest(".lp-hero-door");
        const reach = doorAt(r2.bottom - 4) && doorAt(h2.bottom - 3);
        window.scrollTo({ top: 0, behavior: "instant" });
        return {
          nomadWhole: !!stage && stage.left >= -0.5 && stage.right <= innerWidth + 0.5 && stage.top >= nav.bottom - 0.5 && stage.bottom <= h.bottom,
          stageOnRecord: !!stage && !!rec && Math.abs(stage.bottom - rec.top) <= 1,
          doorHoldsRecord: !!stage && !!rec && stage.left <= rec.left + 0.5 && stage.right >= rec.right - 0.5,
          doorToTheBottom: reach,
          stage: stage ? [stage.left, stage.top, stage.width, stage.height].map(Math.round) : null,
          record: rec ? [rec.left, rec.top, rec.width, rec.height].map(Math.round) : null,
        };
      });
    const got = await page.evaluate(async () => {
      // Pictures take no taps, so the browser leaves them out of what is at a point. For this check they count.
      const st = document.createElement("style");
      st.textContent = ".fx,.fx *{pointer-events:auto!important}";
      document.head.append(st);
      const rgba = (c) => {
        const m = /rgba?\(([^)]+)\)/.exec(c);
        if (!m) return null;
        const [r, g, b, a = "1"] = m[1].split(/[,/ ]+/).filter(Boolean);
        return [Number(r), Number(g), Number(b), Number(a)];
      };
      const over = (top, under) => {
        const a = top[3];
        return [0, 1, 2].map((k) => top[k] * a + under[k] * (1 - a)).concat(1);
      };
      const lum = (c) => {
        const v = c.slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + 0.05) / (y + 0.05);
      };
      const isArt = (el) => !!el.closest?.("svg.fx");
      /** What an element paints at its own box: a shape's fill, its background, or its ::before's. */
      const paint = (el) => {
        if (isArt(el)) return el instanceof SVGSVGElement ? null : { c: rgba(getComputedStyle(el).fill), art: true };
        const own = rgba(getComputedStyle(el).backgroundColor);
        if (own && own[3] > 0) return { c: own, art: false };
        const before = getComputedStyle(el, "::before");
        const pc = before.content !== "none" && before.position === "absolute" ? rgba(before.backgroundColor) : null;
        if (pc && pc[3] > 0) return { c: pc, art: el.classList.contains("lp-hero-door") };
        return null;
      };
      const overText = [];
      const low = [];
      let onArt = 0;
      const walk = document.createTreeWalker(document.querySelector(".lp"), NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const nodes = [];
      for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n);
      for (const n of nodes) {
        const text = n.textContent.replace(/\s+/g, " ").trim();
        const el = n.parentElement;
        if (!text || !el || el.closest("script, style, .sr-only, option, select, svg")) continue;
        if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        el.scrollIntoView({ block: "center", behavior: "instant" });
        range.selectNodeContents(n);
        const ink0 = rgba(getComputedStyle(el).color);
        if (!ink0) continue;
        for (const r of range.getClientRects()) {
          if (r.width < 2 || r.height < 2) continue;
          for (const x of [r.left + 2, (r.left + r.right) / 2, r.right - 2]) {
            const y = (r.top + r.bottom) / 2;
            if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
            const stack = document.elementsFromPoint(x, y);
            const at = stack.findIndex((e) => e === el || e.contains(el));
            if (at < 0) continue;
            const above = stack.slice(0, at).find(isArt);
            if (above) {
              overText.push(`${text.slice(0, 40)} <- ${above.closest("svg").getAttribute("class")}`);
              continue;
            }
            // The first thing under the text that paints all of its colour, with anything see-through over it mixed in.
            let bg = null;
            let viaArt = false;
            const veils = [];
            for (const e of stack.slice(at)) {
              const p = paint(e);
              if (!p || !p.c) continue;
              if (p.c[3] < 1) {
                veils.push(p.c);
                continue;
              }
              bg = p.c;
              viaArt = p.art;
              break;
            }
            if (!bg || !viaArt) continue;
            for (const v of veils.reverse()) bg = over(v, bg);
            onArt++;
            const cr = ratio(over(ink0, bg), bg);
            if (cr < 4.5) low.push(`${text.slice(0, 40)}: ${cr.toFixed(2)} on rgb(${bg.slice(0, 3).map(Math.round).join(",")})`);
          }
        }
      }
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 100));
      return {
        pictures: document.querySelectorAll("svg.fx").length,
        textOnArt: onArt,
        overText: [...new Set(overText)].slice(0, 8),
        lowContrast: [...new Set(low)].slice(0, 8),
      };
    });
    const holds = (h) => h.nomadWhole && h.stageOnRecord && h.doorHoldsRecord && h.doorToTheBottom;
    got.hero = await hero();
    await reshape(page, "tall");
    got.tall = await hero();
    await page.reload();
    await settle(page);
    await reshape(page, "short");
    got.short = await hero();
    const ok = got.pictures > 0 && !got.overText.length && !got.lowContrast.length && holds(got.hero) && holds(got.tall) && holds(got.short);
    if (!ok) fails++;
    console.log(`${ok ? "ok  " : "FAIL"} pictures at ${w}: ${JSON.stringify(got)}`);
    out[w] = got;
    await ctx.close();
  }
  results.art = { fails, widths: out };
  if (fails) process.exitCode = 1;
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
  // The placeholder moves through example questions, and stays still under prefers-reduced-motion.
  const ph0 = await page.locator(".lp-ask-ph").innerText();
  await page.waitForTimeout(3600);
  check("the example question changes every few seconds", (await page.locator(".lp-ask-ph").innerText()) !== ph0, ph0);
  {
    const still = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const p2 = await still.newPage();
    await p2.goto(`${BASE}/`);
    await settle(p2);
    const a = await p2.locator(".lp-ask-ph").innerText();
    await p2.waitForTimeout(3600);
    check("and stays still under prefers-reduced-motion", (await p2.locator(".lp-ask-ph").innerText()) === a, a);
    // The footer's logo loads late, and is there once the visitor reaches it.
    await p2.locator(".lp-foot").scrollIntoViewIfNeeded();
    await p2.waitForFunction(() => document.querySelector(".lp-foot img")?.complete && document.querySelector(".lp-foot img").naturalWidth > 0, null, { timeout: 5000 }).catch(() => {});
    check("the footer's logo is lazy and loads when reached", await p2.evaluate(() => { const i = document.querySelector(".lp-foot img"); return i.loading === "lazy" && i.complete && i.naturalWidth > 0; }));
    await still.close();
  }
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
  await page.locator("#find").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, `${TAG}-finder-picked.png`) });
  await page.getByRole("button", { name: "Who held the Finance seat before me" }).click();
  await page.waitForFunction(() => document.querySelector(".lp-tab.is-on")?.textContent?.startsWith("CFO seat or role") && document.querySelector(".lp-res")?.getAttribute("aria-busy") === "false");
  check("who held the seat reads the CFO seat or role tab, and its line stands out", (await page.locator(".lp-res-held.is-on").count()) === 1);
  // Owner review M3: no tab is called All, and the line under the tabs names each population with the scope.
  const tabsText = await page.locator(".lp-tab").allInnerTexts();
  check("no tab is called All: the first names its population", !tabsText.some((t) => /^All\b/.test(t)) && /^CFO seat or role/.test(tabsText[0]), tabsText);
  check("the line under the tabs names the scope and how the counts relate", /^In Finance, any industry, any country: [\d,]+ compan(y has|ies have) a CFO seat or role on file/.test(await page.locator(".lp-res-pop").innerText()));
  await page.getByRole("button", { name: "What a fractional CFO charges" }).click();
  const note = await page.locator(".lp-res").innerText();
  await page.screenshot({ path: path.join(OUT, `${TAG}-finder-rates.png`) });
  check("rates has no public answer: no figure, no table",(await page.locator(".lp-rw").count()) === 0 && !/[$€£]\s?\d/.test(note), note.slice(0, 160));
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
  // The feature pictures are invented and carry no label saying so, so they may hold no amount: a revenue band is the only money on them.
  const feats = await page.locator("#features").innerText();
  check("the feature pictures say nothing of samples or illustrations", !/sample figures|illustration|made up|not Merlin/i.test(feats), feats.match(/[^.\n]*(sample figures|illustration|made up|not Merlin)[^.\n]*/i)?.[0]);
  const money = (feats.match(/[$€£]\s?[\d,.]+\s?[kKmMbB]?/g) ?? []).filter((x) => !/^\$\d+M$/.test(x));
  check("and show no amount: the rates are drawn locked", money.length === 0 && (await page.locator(".lp-v-rates .lock-rest").count()) >= 3, money);
  check("the hero's headline", (await page.locator(".lp-h1").innerText()).replace(/\s+/g, " ") === "Find your next fractional client and the way in" && (await page.locator(".lp-h1 em").innerText()) === "the way in");
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

const parts = { shots, paint, words, weight, scroll, art, functions, flow };
for (const [name, run] of Object.entries(parts)) if (ONLY === "all" || ONLY.split(",").includes(name)) await run();
writeFileSync(path.join(OUT, `${TAG}-results.json`), JSON.stringify(results, null, 2));
console.log(`results in ${path.join(OUT, `${TAG}-results.json`)}`);
await browser.close();
stop();
process.exit(process.exitCode ?? 0);
