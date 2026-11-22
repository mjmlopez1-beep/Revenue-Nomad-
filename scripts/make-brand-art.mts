/**
 * The brand's pictures for places that can't draw the app's inline SVG: the lockup PNGs (other
 * sites, emails, the unsubscribe page) and the link preview (Open Graph, 1200 by 630). All from
 * the same sources as the app: the lockup's paths (app/ui/logoPaths.ts) and a loud Fractions
 * scene (app/ui/fractions/compose.ts). No photographs.
 *
 *   npx tsx scripts/make-brand-art.mts
 *
 * Makes, in public/brand/:
 *   merlin-lockup.png, merlin-wordmark.png               811 x 240, the pine mark and the ink wordmark, transparent
 *   merlin-lockup-on-dark.png, merlin-wordmark-on-dark.png  811 x 240, all white, transparent (for pine)
 *   merlin-og-banner.png                                  1200 x 630, the link preview: the white lockup and the
 *                                                         line on pine, the Welcome scene (loud, pine) on the right
 *   merlin-og.png                                         1200 x 630, the plain lockup on the page colour
 * Run scripts/make-email-art.mts after it: the email header's lockup is made from merlin-lockup-on-dark.png.
 *
 * Needs Chromium through Playwright (resolved from node_modules or NODE_PATH) and ImageMagick's `convert`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { LOGO_BOX, LOGO_MARK, LOGO_WORD } from "../app/ui/logoPaths";
import { solid } from "../app/ui/fractions/icons";
import { scene } from "../app/ui/fractions/compose";
import { LOUD } from "../app/ui/fractions/ways";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "public/brand");
const FONT = join(ROOT, "node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2");
const PINE = "#073F2F";
const INK = "#0A1A13";

const req = createRequire(import.meta.url);
let pw: typeof import("playwright");
try {
  pw = req("playwright");
} catch {
  pw = createRequire(join(process.env.NODE_PATH?.split(":")[0] ?? "/usr/local/lib/node_modules_global", "x"))("playwright");
}
const tmp = mkdtempSync(join(tmpdir(), "brand-art-"));
const browser = await pw.chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** The lockup as standalone SVG markup, `h` px tall. */
export const logoSvg = (mark: string, word: string, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_BOX.w} ${LOGO_BOX.h}" width="${Math.round((h * LOGO_BOX.w) / LOGO_BOX.h)}" height="${h}"><path fill="${mark}" fill-rule="evenodd" d="${LOGO_MARK}"/><path fill="${word}" fill-rule="evenodd" d="${LOGO_WORD}"/></svg>`;

/** A page of HTML to a PNG of exactly w by h, through a file (so the page can load the font from disk). */
async function shoot(html: string, w: number, h: number, file: string, transparent = false) {
  const src = join(tmp, "page.html");
  writeFileSync(src, `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:"SG";src:url("file://${FONT}") format("woff2");font-weight:100 900}html,body{margin:0;background:${transparent ? "transparent" : "#fff"}}</style></head><body>${html}</body></html>`);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`file://${src}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const raw = join(tmp, "raw.png");
  await page.screenshot({ path: raw, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: transparent });
  return raw;
}

const sizes: [string, number][] = [];
const keep = (f: string) => sizes.push([f, statSync(f).size]);

// The lockups: transparent, full colour depth (the edges are antialiased over any background).
for (const [name, mark, word] of [
  ["merlin-lockup", PINE, INK],
  ["merlin-wordmark", PINE, INK],
  ["merlin-lockup-on-dark", "#FFFFFF", "#FFFFFF"],
  ["merlin-wordmark-on-dark", "#FFFFFF", "#FFFFFF"],
] as const) {
  const raw = await shoot(logoSvg(mark, word, LOGO_BOX.h), LOGO_BOX.w, LOGO_BOX.h, "", true);
  const f = join(OUT, `${name}.png`);
  execFileSync("convert", [raw, "-strip", "-define", "png:compression-level=9", "-define", "png:exclude-chunks=all", `PNG32:${f}`]);
  keep(f);
}

// The link preview: words on the left, the Welcome scene's square crop on the right, both on pine.
// The tone shapes take the field colour here: the crop's left edge falls mid-picture, and a tone cut there would read as a seam.
const art = solid(scene("welcome", { ...LOUD.pine, tone: "pine" }, true, true), 540, 540, { w: 630, h: 630 }, 1.2);
const og = `<div style="position:relative;width:1200px;height:630px;background:${PINE};overflow:hidden;font-family:SG,sans-serif">
<div style="position:absolute;left:0;right:0;bottom:0;height:70px;background:#F5ECD9"></div>
<div style="position:absolute;right:0;top:0;width:630px;height:630px">${art}</div>
<div style="position:absolute;left:80px;top:84px;width:470px">
${logoSvg("#FFFFFF", "#FFFFFF", 112)}
<div style="margin-top:56px;font-size:42px;line-height:50px;font-weight:800;letter-spacing:-0.02em;color:#FFFFFF">Find your next client and the fractional who can introduce you</div>
<div style="margin-top:24px;font-size:20px;line-height:28px;font-weight:600;color:#2EE59D;white-space:nowrap">Who hires, what they paid, who opens the door</div>
</div></div>`;
{
  const raw = await shoot(og, 1200, 630, "");
  const f = join(OUT, "merlin-og-banner.png");
  execFileSync("convert", [raw, "-strip", "-dither", "None", "-colors", "128", "-define", "png:compression-level=9", "-define", "png:exclude-chunks=all", `PNG8:${f}`]);
  keep(f);
}
{
  const plain = `<div style="width:1200px;height:630px;background:#FAFAF7;display:flex;align-items:center;justify-content:center">${logoSvg(PINE, INK, 180)}</div>`;
  const raw = await shoot(plain, 1200, 630, "");
  const f = join(OUT, "merlin-og.png");
  execFileSync("convert", [raw, "-strip", "-dither", "None", "-colors", "64", "-define", "png:compression-level=9", "-define", "png:exclude-chunks=all", `PNG8:${f}`]);
  keep(f);
}

await browser.close();
let total = 0;
for (const [f, n] of sizes) {
  total += n;
  console.log(`${(n / 1024).toFixed(1).padStart(6)} KB  ${f.slice(ROOT.length + 1)}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(6)} KB  in all`);
