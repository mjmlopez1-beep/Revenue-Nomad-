#!/usr/bin/env node
// Homepage smoke check. CONSTRAINTS.md "Design" and "Enforced with numbers".
// Usage: node scripts/check-home.mjs [--url http://localhost:3000] [--path /]
// Without --url it starts `next dev` on a free port, runs the checks and stops it.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
// Playwright is preinstalled machine-wide (resolvable through NODE_PATH), so load it via require.
const { chromium } = require("playwright");

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1] ?? true] : [])).filter((x) => x.length)
);
const PATH = args.path ?? "/";
const SITE_ENV = args["site-env"] ?? process.env.NEXT_PUBLIC_SITE_ENV ?? "preview";
const PRODUCTION = SITE_ENV === "production";
const FEE_WORDS = /\b(fee|fees|margin|take rate|split|all-in|take-home|take home|you pay only when)\b/i;
// Allowed because the founder's copy uses them to say companies pay nothing
// ("No fees for companies", "No fee on top", the footer's "Fees for companies: None").
const FEE_ALLOWED = /no fees? (for|on top|to) |no fee[ ,.-]|fees? for companies(?!\s*[:-]?\s*\d)|without (a )?fees?|zero fees?/i;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];
const LIMITS = { totalBytes: 1.5 * 1024 * 1024, imageBytes: 400 * 1024 };

let server;
let baseUrl = args.url;
async function startServer() {
  const port = 3100 + Math.floor(Math.random() * 400);
  baseUrl = `http://localhost:${port}`;
  server = spawn("npx", ["next", "dev", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_ENV: SITE_ENV } });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(baseUrl + PATH);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("next dev did not become ready in 90s");
}

const failures = [];
const fail = (vp, msg) => failures.push(`[${vp}] ${msg}`);

async function checkViewport(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleIssues = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) consoleIssues.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => consoleIssues.push(`pageerror: ${e.message}`));
  let totalBytes = 0, imageBytes = 0;
  page.on("response", async (res) => {
    try {
      const type = res.headers()["content-type"] ?? "";
      const len = Number(res.headers()["content-length"]) || (await res.body().catch(() => Buffer.alloc(0))).length;
      totalBytes += len;
      if (type.startsWith("image/") || type.startsWith("font/") === false && /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/.test(res.url())) imageBytes += len;
    } catch {}
  });

  await page.goto(baseUrl + PATH, { waitUntil: "networkidle" });
  // Trigger lazy content.
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await page.waitForLoadState("networkidle");

  const devNoise = /Download the React DevTools|Fast Refresh|\[HMR\]|webpack-hmr|hydrated|Image with src .* has either width or height modified/i;
  consoleIssues.filter((c) => !devNoise.test(c)).forEach((c) => fail(vp.name, `console ${c}`));

  const dom = await page.evaluate(() => {
    const out = {};
    out.scrollWidth = document.documentElement.scrollWidth;
    out.innerWidth = window.innerWidth;
    out.imgsWithoutAlt = [...document.images].filter((i) => !i.hasAttribute("alt")).map((i) => i.currentSrc || i.src);
    const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
    out.headingSkips = hs.filter((lvl, i) => i > 0 && lvl > hs[i - 1] + 1).length;
    out.h1Count = document.querySelectorAll("h1").length;
    out.badLinks = [...document.querySelectorAll("a")].filter((a) => { const h = a.getAttribute("href"); return !h || h === "#"; }).map((a) => a.textContent.trim().slice(0, 40));
    out.text = document.body.innerText;
    out.unverified = document.querySelectorAll("[data-unverified]").length;
    out.placeholderStrip = document.querySelectorAll('[data-section="validation"][data-placeholder]').length;
    out.hrefs = [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/") && !h.startsWith("//")).map((h) => h.split("#")[0]).filter(Boolean))];
    return out;
  });
  if (dom.scrollWidth > dom.innerWidth) fail(vp.name, `horizontal scroll: scrollWidth ${dom.scrollWidth} > innerWidth ${dom.innerWidth}`);
  dom.imgsWithoutAlt.forEach((s) => fail(vp.name, `image without alt: ${s}`));
  if (dom.headingSkips) fail(vp.name, `${dom.headingSkips} heading level skip(s)`);
  if (dom.h1Count !== 1) fail(vp.name, `expected one h1, found ${dom.h1Count}`);
  dom.badLinks.forEach((t) => fail(vp.name, `link with empty or # href: "${t}"`));
  for (const line of dom.text.split("\n")) {
    if (FEE_WORDS.test(line) && !FEE_ALLOWED.test(line)) fail(vp.name, `fee language on a client-facing page: "${line.trim().slice(0, 90)}"`);
  }
  if (PRODUCTION && dom.unverified) fail(vp.name, `${dom.unverified} unverified number(s) rendered in production`);
  if (!PRODUCTION && vp.name === "desktop" && dom.unverified === 0) console.log("note: no unverified figures rendered (expected once all numbers are confirmed)");
  if (dom.placeholderStrip) fail(vp.name, "validation strip rendered with placeholder-only data");
  if (vp.name === "desktop") {
    for (const h of dom.hrefs) {
      try {
        const r = await fetch(baseUrl + h, { redirect: "follow" });
        if (!r.ok) fail(vp.name, `internal link ${h} -> HTTP ${r.status}`);
      } catch (e) { fail(vp.name, `internal link ${h} failed: ${e.message}`); }
    }
    const nf = await fetch(baseUrl + "/no-such-page-" + Date.now());
    if (nf.status !== 404) fail(vp.name, `unknown path returned ${nf.status}, expected 404`);
  }

  // Accessibility (external opinion): axe-core, fail on critical or serious.
  await page.addScriptTag({ content: axeSource });
  const axe = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
  for (const v of axe.violations) {
    if (["critical", "serious"].includes(v.impact)) fail(vp.name, `axe ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.[0]})`);
  }

  // Page weight.
  if (args.url && totalBytes > LIMITS.totalBytes) fail(vp.name, `page weight ${(totalBytes / 1024).toFixed(0)} KB > ${(LIMITS.totalBytes / 1024).toFixed(0)} KB`);
  if (args.url && imageBytes > LIMITS.imageBytes) fail(vp.name, `image weight ${(imageBytes / 1024).toFixed(0)} KB > ${(LIMITS.imageBytes / 1024).toFixed(0)} KB`);

  // Reduced motion: nothing may keep animating.
  const rm = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce" });
  const rmPage = await rm.newPage();
  await rmPage.goto(baseUrl + PATH, { waitUntil: "networkidle" });
  await rmPage.waitForTimeout(400);
  const running = await rmPage.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming?.().iterations ?? 1) === Infinity).length);
  if (running) fail(vp.name, `${running} infinite animation(s) still running under prefers-reduced-motion`);
  await rm.close();

  console.log(`${vp.name}: ${(totalBytes / 1024).toFixed(0)} KB total, ${(imageBytes / 1024).toFixed(0)} KB images, ${axe.violations.length} axe violation(s) of any impact, ${dom.unverified} unverified number(s)`);
  await context.close();
}

try {
  if (!baseUrl) await startServer();
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) await checkViewport(browser, vp);
  await browser.close();
} catch (e) {
  failures.push(`runner: ${e.message}`);
} finally {
  server?.kill("SIGTERM");
}
if (failures.length) {
  console.error(`\ncheck:home failed (${failures.length})\n- ` + failures.join("\n- "));
  process.exit(1);
}
console.log("check:home ok");
