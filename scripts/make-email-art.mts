/**
 * The Crystal Ball email's images, from the Fractions kit (app/ui/fractions/icons.ts, mail.ts):
 * email clients don't draw SVG, so each picture is rasterised to a PNG in public/email/crystal-ball/,
 * which the app serves and the email loads by its absolute address (lib/emailArt.ts).
 *
 *   npx tsx scripts/make-email-art.mts [sheet_dir]
 *
 * Makes:
 *   hero-morning@2x.png, hero-quiet@2x.png   1200 x 400 (shown 600 x 200)
 *   icon-<kind>@2x.png, icon-<kind>@3x.png   80 and 120 square (shown 40): the email uses 2x, Slack and the app can take 3x
 *   merlin@2x.png                            the lockup on pine for the header, from public/brand/merlin-lockup-on-dark.png
 *   ../header/<kind>@2x.png                  1200 x 240 (shown 600 x 120): the header strip of every other email (mail.ts HEADERS)
 * and, with sheet_dir, icons-sheet.png there: every icon at 32, 40 and 80px on white, on the
 * email's page colour and on its dark-mode page.
 *
 * Needs Chromium through Playwright (resolved from node_modules or NODE_PATH) and ImageMagick's
 * `convert`, which brings each PNG down to an indexed palette (flat art loses nothing).
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ICON, ICON_KINDS, icon, solid, type IconKind } from "../app/ui/fractions/icons";
import { HEADER, HEADERS, HEADER_KINDS, HEROES, STRIP, type HeroKind } from "../app/ui/fractions/mail";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "public/email/crystal-ball");
/** The header strip of every other email (sign-in, messages, proposals, the plan, the weekly email). */
const HDR = join(ROOT, "public/email/header");
const sheetDir = process.argv[2] ? resolve(process.argv[2]) : null;
mkdirSync(OUT, { recursive: true });
mkdirSync(HDR, { recursive: true });

const req = createRequire(import.meta.url);
let pw: typeof import("playwright");
try {
  pw = req("playwright");
} catch {
  pw = createRequire(join(process.env.NODE_PATH?.split(":")[0] ?? "/usr/local/lib/node_modules_global", "x"))("playwright");
}
const tmp = mkdtempSync(join(tmpdir(), "email-art-"));
const browser = await pw.chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** One SVG to a PNG of exactly w by h pixels, then to an indexed palette of `colors`. */
async function raster(svg: string, w: number, hh: number, file: string, colors: number) {
  await page.setViewportSize({ width: w, height: hh });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#073f2f">${svg}</body></html>`);
  const raw = join(tmp, "raw.png");
  await page.screenshot({ path: raw, clip: { x: 0, y: 0, width: w, height: hh } });
  execFileSync("convert", [raw, "-strip", "-dither", "None", "-colors", String(colors), "-define", "png:compression-level=9", "-define", "png:exclude-chunks=all", `PNG8:${file}`]);
  return statSync(file).size;
}

const sizes: [string, number][] = [];
for (const kind of Object.keys(HEROES) as HeroKind[]) {
  const f = join(OUT, `hero-${kind}@2x.png`);
  sizes.push([f, await raster(solid(HEROES[kind](), STRIP.w, STRIP.h, { w: 1200, h: 400 }, 1.6), 1200, 400, f, 64)]);
}
for (const kind of HEADER_KINDS) {
  const f = join(HDR, `${kind}@2x.png`);
  sizes.push([f, await raster(solid(HEADERS[kind](), HEADER.w, HEADER.h, { w: 1200, h: 240 }, 1.6), 1200, 240, f, 64)]);
}
for (const kind of ICON_KINDS) {
  for (const [scale, px] of [[2, 80], [3, 120]] as const) {
    const f = join(OUT, `icon-${kind}@${scale}x.png`);
    sizes.push([f, await raster(solid(icon(kind), ICON, ICON, { w: px, h: px }, 0.35), px, px, f, 32)]);
  }
}
// The lockup, white on pine: 2x of 96 by 28. Painted onto pine so it never shows a transparent edge.
const lock = join(OUT, "merlin@2x.png");
execFileSync("convert", [join(ROOT, "public/brand/merlin-lockup-on-dark.png"), "-background", "#073f2f", "-alpha", "remove", "-alpha", "off", "-filter", "Lanczos", "-resize", "192x56!", "-strip", "-dither", "None", "-colors", "32", "-define", "png:compression-level=9", `PNG8:${lock}`]);
sizes.push([lock, statSync(lock).size]);

if (sheetDir) {
  mkdirSync(sheetDir, { recursive: true });
  const LABEL: Record<IconKind, string> = {
    hired: "Hired a fractional", role: "Open role", ended: "Fractional seat ended", rehire: "Hired fractionals before", tenure: "Seat at 12 months", arrival: "New leader",
    departure: "Leader left", gap: "No leader on their team page", funding: "Raised money", team: "Team hiring", growing: "Growing", new: "New since yesterday", still: "Still a good time",
  };
  const src = (k: IconKind, s: 2 | 3) => `data:image/png;base64,${readFileSync(join(OUT, `icon-${k}@${s}x.png`)).toString("base64")}`;
  const cell = (k: IconKind, bg: string, ink: string) =>
    `<div style="display:flex;align-items:center;gap:14px;padding:10px 14px;background:${bg}"><img src="${src(k, 2)}" width="32" height="32"><img src="${src(k, 2)}" width="40" height="40"><img src="${src(k, 3)}" width="80" height="80"><span style="font:600 14px/18px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${ink}">${LABEL[k]}<br><span style="font-weight:400;color:#5b6661;font-size:12px">${k}</span></span></div>`;
  const col = (bg: string, ink: string, title: string) => `<div style="flex:1"><div style="font:700 12px/16px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#5b6661;padding:0 14px 8px">${title}</div>${ICON_KINDS.map((k) => cell(k, bg, ink)).join("")}</div>`;
  const html = `<!doctype html><html><body style="margin:0;padding:28px;background:#fafaf7;width:1180px">
<div style="font:800 28px/34px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#073f2f;letter-spacing:-.02em;margin:0 0 4px">Crystal Ball signal icons</div>
<div style="font:14px/20px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#28322d;margin:0 0 20px">Fractions, 48-unit tiles. Each shown at 32, 40 (the email) and 80px. Seats on mint, leaders on sand, the company on pine; the two group marks last.</div>
<div style="display:flex;gap:16px">${col("#ffffff", "#0a1a13", "On white (the card)")}${col("#fafaf7", "#0a1a13", "On the page")}${col("#0f1f19", "#e8efe9", "Dark mode")}</div></body></html>`;
  await page.setViewportSize({ width: 1236, height: 800 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: join(sheetDir, "icons-sheet.png"), fullPage: true });
}
await browser.close();
let total = 0;
for (const [f, n] of sizes) {
  total += n;
  console.log(`${(n / 1024).toFixed(1).padStart(6)} KB  ${f.slice(ROOT.length + 1)}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(6)} KB  in all`);
