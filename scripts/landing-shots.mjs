#!/usr/bin/env node
/**
 * Makes the screenshots in the landing page's "What you can do with it" showcase
 * (app/landing/Showcase.tsx) from the real app: public/landing/<slide>.webp and <slide>-m.webp.
 *
 * Run it against a throwaway server on a FRESH data dir with the real seed, then delete that dir:
 *
 *   npm run build
 *   RN_INTEL_SEED_KEY="$(cat data/intel-seed.key)" RN_DATA_DIR=$(mktemp -d) RN_STARTER_CREDITS=25 \
 *     RN_INTRO_EMAIL=intro@example.com npx next start -p 4731
 *   BASE=http://localhost:4731 node scripts/landing-shots.mjs
 *
 * It joins as a made-up member (Morgan Ellery, a fractional CMO) who sets a function and an
 * Ideal Fractional Profile, and shoots one panel of each screen at the size the app draws it, so
 * the words in the picture can be read on the landing page:
 *
 *   <slide>.webp     a 720 by 450 CSS-pixel crop of the desktop app (1120 wide), saved at 2x (1440 by 900)
 *   <slide>-m.webp   a 390 by 480 crop of the app on a phone (390 wide), saved at 2x (780 by 960)
 *
 * The record is drawn 720 wide for its pictures (the app's own record, widened), so a seat fills
 * the crop. It never unlocks a seat holder, a hiring contact, an email, a phone or a rate, and by
 * default no company with an open role (UNLOCKS=n unlocks n of them), so none of those can be in
 * a picture: the Hiring now picture shows the titles free and the companies behind a lock, as a
 * member sees them before spending a credit. Look at every image before you commit it: the repo
 * is public.
 *
 * Needs Playwright (resolved from NODE_PATH or node_modules) and sharp (a Next.js dependency).
 */
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const sharp = require("sharp");

const BASE = (process.env.BASE || "http://localhost:4731").replace(/\/$/, "");
const OUT = process.env.OUT || "public/landing";
/** The desktop window, and the crop saved from it (CSS pixels, saved at 2x). */
const DESK = { w: 1120, h: 700 };
const CROP = { w: 720, h: 450 };
/** The phone crop (CSS pixels, saved at 2x), from an iPhone 13 sized window. */
const CROP_M = { w: 390, h: 480 };
/** Only these slides (comma separated), for a quick re-shoot of one. */
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const IP = `10.${(Date.now() >> 8) & 255}.${Date.now() & 255}.${Math.floor(Math.random() * 250) + 1}`;

async function api(body, token) {
  const headers = { "content-type": "application/json", "x-forwarded-for": IP };
  if (token) headers.cookie = `rn_table=${token}`;
  const r = await fetch(`${BASE}/api/table`, { method: "POST", headers, body: JSON.stringify(body) });
  const tok = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean);
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(json).slice(0, 200)}`);
  return { json, token: tok };
}
const view = async (token) => (await fetch(`${BASE}/api/table`, { headers: { cookie: `rn_table=${token}`, "x-forwarded-for": IP } })).json();

// 1. A made-up member with a function and an Ideal Fractional Profile.
const { token } = await api({ join: { name: "Morgan Ellery", email: `morgan.ellery.${Date.now()}@example.com` } });
if (!token) throw new Error("join gave no sign-in cookie (is email sign-in switched on? use a server without RESEND_API_KEY)");
await api(
  {
    action: {
      type: "profile",
      function: "Marketing",
      title: "Fractional CMO",
      goal: "adjacent",
      icp: { industries: ["SaaS", "Enterprise Software"], employees: ["11–50", "51–200", "201–500"], revenue: ["$5M–$20M", "$20M–$50M"], countries: ["United States"] },
    },
  },
  token,
);

// 2. Optionally unlock hidden companies with open roles, the way a member does (1 credit each). None by default.
let v = await view(token);
const hidden = v.companies.filter((c) => c.hidden).slice(0, Number(process.env.UNLOCKS ?? 0));
for (const c of hidden) await api({ action: { type: "unlock", entity: "company", id: c.id, field: "identity" } }, token);
if (hidden.length) v = await view(token);
/** The company for the seat and earn pictures: a seat holder on file, a recent seat and its people. */
const byName = (n) => v.companies.find((c) => c.name === n);
const seatCo =
  byName(process.env.SEAT_COMPANY || "Platform Science") ??
  v.companies.find((c) => !c.hidden && c.engagements.some((e) => e.cells.operator?.s === "locked") && c.people.length > 0);
const earnCo = byName(process.env.EARN_COMPANY || "Hone") ?? seatCo;

const browser = await chromium.launch();
const tmp = join(tmpdir(), `landing-shots-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
mkdirSync(OUT, { recursive: true });

/** One window: the desktop one or the phone one. */
async function windowFor(phone) {
  const ctx = await browser.newContext(phone ? { ...devices["iPhone 13"], deviceScaleFactor: 2 } : { viewport: { width: DESK.w, height: DESK.h }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "rn_table", value: token, url: BASE }]);
  const page = await ctx.newPage();
  // Every scroll lands at once, so a picture never catches one halfway.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "html{scroll-behavior:auto!important} *{animation-duration:0s!important;transition-duration:0s!important}";
      document.head.appendChild(s);
    });
  });
  return { ctx, page, phone };
}

async function open(w, qs = "") {
  const { page } = w;
  await page.goto(`${BASE}/${qs}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  for (const name of ["Hide Get started", "Dismiss", "Close"]) {
    const b = page.locator(".tp-main, main").getByRole("button", { name, exact: true });
    if (await b.count().catch(() => 0)) await b.first().evaluate((el) => el.click()).catch(() => {});
  }
  // The record drawn 720 wide on the desktop, so a seat fills the crop.
  if (!w.phone) await page.addStyleTag({ content: ".tp-drawer{width:720px!important}" });
  await page.waitForTimeout(300);
}
const click = async (w, name) => {
  const b = w.page.getByRole("button", { name });
  if (await b.count()) await b.first().evaluate((el) => el.click());
  await w.page.waitForTimeout(600);
};
const hideFilters = (w) => click(w, "Hide filters");
/** Scroll a heading (in the record or the page) to the top, under the top bar. */
async function headingTop(w, text) {
  await w.page
    .locator("h1, h2, h3, h4")
    .filter({ hasText: new RegExp(`^${text}`) })
    .first()
    .evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      // On a phone the record is the page: leave room for the top bar.
      if (document.scrollingElement && document.scrollingElement.scrollTop > 0 && el.getBoundingClientRect().top < 80) window.scrollBy(0, -72);
    });
  await w.page.waitForTimeout(300);
}
/** The top of an element in the window, in CSS pixels. */
const topOf = async (w, locator) => (await locator.first().boundingBox())?.y ?? 0;

/** Save a crop of the window: x and y in CSS pixels, the crop's size from the kind of window. */
async function save(w, name, { x = 0, y = 0 } = {}) {
  const size = w.phone ? CROP_M : CROP;
  const vp = w.page.viewportSize();
  const clip = { x: Math.max(0, Math.min(x, vp.width - size.w)), y: Math.max(0, Math.min(y, vp.height - size.h)), width: size.w, height: size.h };
  const file = `${name}${w.phone ? "-m" : ""}`;
  const png = join(tmp, `${file}.png`);
  await w.page.screenshot({ path: png, clip });
  await sharp(png).webp({ quality: 80, effort: 6 }).toFile(join(OUT, `${file}.webp`));
  console.log(`${OUT}/${file}.webp`);
}

/** Each slide: how to reach its screen, and where its crop sits. */
const SLIDES = {
  // The fractional who held the seat: a company's record at its seats (the seat holder stays locked).
  async seat(w) {
    await open(w, `?c=${seatCo.id}`);
    await headingTop(w, "Seats");
    await save(w, "seat", w.phone ? {} : { x: DESK.w - CROP.w, y: 56 });
  },
  // Earn credits: a company's record with facts still missing (+1 each).
  async earn(w) {
    await open(w, `?c=${earnCo.id}`);
    // From About down to the facts still missing, each with its +1.
    await headingTop(w, w.phone ? "How they sell" : "About");
    await save(w, "earn", w.phone ? {} : { x: DESK.w - CROP.w, y: 56 });
  },
  // Hiring now: everyone's open roles, titles free, the companies behind a lock.
  async hiring(w) {
    await open(w);
    await click(w, "Show everyone");
    await click(w, /^Hiring now/);
    await hideFilters(w);
    if (w.phone) {
      await w.page.evaluate(() => window.scrollBy(0, 0));
      await save(w, "hiring");
    } else await save(w, "hiring", { x: 8, y: (await topOf(w, w.page.getByRole("button", { name: /^Hiring now/ }))) - 16 });
  },
  // Repeat hirers with no fractional in the member's function yet.
  async next(w) {
    await open(w);
    await click(w, /^Repeat hirers/);
    await hideFilters(w);
    if (w.phone) await save(w, "next");
    else await save(w, "next", { x: 8, y: (await topOf(w, w.page.getByRole("button", { name: /^Repeat hirers/ }))) - 16 });
  },
  // The Ideal Fractional Profile over the table, sorted Best fit for you.
  async ifp(w) {
    await open(w);
    await hideFilters(w);
    if (w.phone) await save(w, "ifp");
    else await save(w, "ifp", { x: 8, y: (await topOf(w, w.page.getByText(/Your Ideal Fractional Profile/))) - 24 });
  },
  // Saved views: Save this view, with the weekly email.
  async views(w) {
    await open(w);
    await hideFilters(w);
    // On a phone, Save this view is in the filters sheet.
    if (w.phone) await click(w, /^Sort and filter/);
    await w.page.getByRole("button", { name: "Save this view" }).last().evaluate((el) => el.click());
    await w.page.waitForTimeout(600);
    const box = await w.page.getByRole("dialog").first().boundingBox();
    const size = w.phone ? CROP_M : CROP;
    if (!box) return save(w, "views");
    await save(w, "views", w.phone ? { y: box.y + box.height - size.h } : { x: box.x + box.width / 2 - size.w / 2, y: box.y + box.height / 2 - size.h / 2 });
  },
  // Rate benchmarks: the medians by function.
  async rates(w) {
    await open(w, "?p=rates");
    await headingTop(w, "Rate benchmarks");
    if (w.phone) await save(w, "rates", { y: (await topOf(w, w.page.locator("h1"))) - 12 });
    else await save(w, "rates", { x: Math.max(0, ((await w.page.locator("h1").first().boundingBox())?.x ?? 24) - 24), y: (await topOf(w, w.page.locator("h1"))) - 12 });
  },
  // Integrations: Slack alerts.
  async connect(w) {
    await open(w, "?p=integrations");
    await headingTop(w, "Integrations");
    if (w.phone) await save(w, "connect", { y: (await topOf(w, w.page.locator("h1"))) - 12 });
    else await save(w, "connect", { x: Math.max(0, ((await w.page.locator("h1").first().boundingBox())?.x ?? 24) - 24), y: (await topOf(w, w.page.locator("h1"))) - 12 });
  },
};

for (const phone of [false, true]) {
  const w = await windowFor(phone);
  for (const [name, run] of Object.entries(SLIDES)) if (!ONLY || ONLY.includes(name)) await run(w);
  await w.ctx.close();
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });
