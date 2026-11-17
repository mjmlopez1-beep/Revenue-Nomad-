#!/usr/bin/env node
/**
 * Makes the screenshots in the landing page's "What you can do with it" showcase
 * (app/landing/Showcase.tsx) from the real app: public/landing/<slide>.webp.
 *
 * Run it against a throwaway server on a FRESH data dir with the real seed, then delete that dir:
 *
 *   npm run build
 *   RN_INTEL_SEED_KEY="$(cat data/intel-seed.key)" RN_DATA_DIR=$(mktemp -d) RN_STARTER_CREDITS=25 \
 *     RN_INTRO_EMAIL=intro@example.com npx next start -p 4731
 *   BASE=http://localhost:4731 node scripts/landing-shots.mjs
 *
 * It joins as a made-up member (Morgan Ellery, a fractional CMO) who sets a function and an
 * Ideal Fractional Profile, spends credits to unlock the hidden companies with open roles (up to
 * UNLOCKS, default 3)
 * (the real unlock), and shoots each screen at 1440 wide, deviceScaleFactor 2, cropped to the
 * part that matters. It never unlocks a seat holder, a hiring contact, an email, a phone or a
 * rate, so none of those can be in a picture. Look at every image before you commit it: the
 * repo is public.
 *
 * Needs Playwright (resolved from NODE_PATH or node_modules) and sharp (a Next.js dependency).
 */
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const sharp = require("sharp");

const BASE = (process.env.BASE || "http://localhost:4731").replace(/\/$/, "");
const OUT = process.env.OUT || "public/landing";
/** The window every picture is taken in, in CSS pixels (16:10), and the width it is saved at. */
const CLIP = { w: 1120, h: 700 };
const SAVE_W = 1440;
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

// 2. Unlock the hidden companies (up to UNLOCKS) with open roles, the way a member does (1 credit each).
let v = await view(token);
const hidden = v.companies.filter((c) => c.hidden).slice(0, Number(process.env.UNLOCKS ?? 3));
for (const c of hidden) await api({ action: { type: "unlock", entity: "company", id: c.id, field: "identity" } }, token);
v = await view(token);
const unlocked = v.companies.filter((c) => c.unlocked);
/** The company for the seat and earn pictures: a seat holder on file, a recent seat and its people. */
const byName = (n) => v.companies.find((c) => c.name === n);
const seatCo =
  byName(process.env.SEAT_COMPANY || "Platform Science") ??
  v.companies.find((c) => !c.hidden && c.engagements.some((e) => e.cells.operator?.s === "locked") && c.people.length > 0);
const earnCo = byName(process.env.EARN_COMPANY || "Hone") ?? seatCo;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: CLIP.w, height: CLIP.h }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "rn_table", value: token, url: BASE }]);
const page = await ctx.newPage();
const tmp = join(tmpdir(), `landing-shots-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function open(qs = "") {
  await page.goto(`${BASE}/${qs}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const hideStart = page.getByRole("button", { name: "Hide Get started" });
  if (await hideStart.count()) await hideStart.first().evaluate((el) => el.click());
  await page.waitForTimeout(200);
}
async function hideFilters() {
  const b = page.getByRole("button", { name: "Hide filters" });
  if (await b.count()) await b.first().evaluate((el) => el.click());
  await page.waitForTimeout(300);
}
/** Scroll the open record so `text` (a section heading) sits at its top. */
async function drawerTo(text) {
  await page.locator(".tp-drawer").locator("h2, h3, h4").filter({ hasText: new RegExp(`^${text}`) }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
}
async function save(name) {
  const png = join(tmp, `${name}.png`);
  await page.screenshot({ path: png, clip: { x: 0, y: 0, width: CLIP.w, height: CLIP.h } });
  await sharp(png).resize({ width: SAVE_W }).webp({ quality: 74, effort: 6 }).toFile(join(OUT, `${name}.webp`));
  console.log(`${OUT}/${name}.webp`);
}

// The fractional who held the seat: a company's record at its seats (the seat holder stays locked).
await open(`?c=${seatCo.id}`);
await drawerTo("Seats");
await save("seat");

// Earn credits: a company's record with facts still missing (+1 each).
await open(`?c=${earnCo.id}`);
await save("earn");

// Hiring now: everyone's open roles, the unlocked companies named, one record open on its role.
await open(unlocked[0] ? `?c=${unlocked[0].id}` : "");
const everyone = page.getByRole("button", { name: "Show everyone" });
if (await everyone.count()) await everyone.first().evaluate((el) => el.click());
await page.getByRole("button", { name: /^Hiring now/ }).first().evaluate((el) => el.click());
await page.waitForTimeout(600);
await save("hiring");

// Repeat hirers with no fractional in the member's function yet, the shortcut on in the filters.
await open();
await page.getByRole("button", { name: /^Repeat hirers/ }).first().evaluate((el) => el.click());
await page.waitForTimeout(600);
await save("next");

// The Ideal Fractional Profile pill over the table, sorted Best fit for you.
await open();
await hideFilters();
await save("ifp");

// Saved views: Save this view, with the weekly email.
await open();
await hideFilters();
await page.getByRole("button", { name: "Save this view" }).last().evaluate((el) => el.click());
await page.waitForTimeout(500);
await save("views");

// Rate benchmarks and Integrations.
await open("?p=rates");
await save("rates");
await open("?p=integrations");
await save("connect");

await browser.close();
rmSync(tmp, { recursive: true, force: true });
