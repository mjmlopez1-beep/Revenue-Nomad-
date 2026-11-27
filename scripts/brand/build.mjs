// Generates the Merlin illustration library into public/brand and a typed
// manifest into lib/brand. Run with: npm run brand:build
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES, SPOTS, BLEND, THEMES, render } from "./scenes.mjs";
import { kit, wrap, NIGHT } from "./landscape.mjs";
import { JOURNEY, DESTINATIONS, SPOTS as LAND_SPOTS, rail, W as LW, H as LH, S as LS } from "./journey.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "public", "brand");
rmSync(out, { recursive: true, force: true });

const write = (rel, body) => {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body.trim() + "\n");
};

const manifest = [];
for (const theme of Object.keys(THEMES).filter((k) => k !== "blend")) {
  for (const [name, def] of Object.entries(SCENES)) {
    const id = `scene-${name}`;
    write(`${theme}/${id}.svg`, render(def, `${id}-${theme}`, theme).svg({ labels: false, title: def.title }));
    write(`${theme}/${id}-labeled.svg`, render(def, `${id}-l-${theme}`, theme).svg({ labels: true, title: def.title }));
    if (theme === "dark") manifest.push({ id, kind: "scene", name, title: def.title, use: def.use, width: def.w, height: def.h, labeled: true });
  }
  for (const [name, def] of Object.entries(SPOTS)) {
    const id = `spot-${name}`;
    write(`${theme}/${id}.svg`, render(def, `${id}-${theme}`, theme).svg({ labels: false, title: def.title }));
    if (theme === "dark") manifest.push({ id, kind: "spot", name, title: def.title, use: def.use, width: def.w, height: def.h, labeled: false });
  }

  // ---- supporting assets ---------------------------------------------
  const t = THEMES[theme];
  // Seamless arcade pattern: tile horizontally and vertically.
  const tw = 120;
  const th = 150;
  write(
    `${theme}/pattern-arcade.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tw} ${th}" width="${tw}" height="${th}">
${t.transparent ? "" : `<rect width="${tw}" height="${th}" fill="${t.bg}"/>`}
<g fill="none" stroke-linecap="round">
<path d="M0 ${th - 1}H${tw}" stroke="${t.line}" stroke-opacity="0.28" stroke-width="1.5"/>
<path d="M22 ${th - 1}V64a38 38 0 0 1 76 0V${th - 1}" stroke="${t.line}" stroke-opacity="0.28" stroke-width="1.5"/>
<path d="M34 ${th - 1}V68a30 30 0 0 1 8.5 -21" stroke="${t.accent}" stroke-opacity="0.5" stroke-width="1.5"/>
</g></svg>`
  );
  // Path divider with three waypoints.
  const mk = (x, y, c) => `<circle cx="${x}" cy="${y}" r="13" fill="${t.bg}"/><circle cx="${x}" cy="${y}" r="7" fill="${t.bg}" stroke="${c}" stroke-width="3.5"/>`;
  write(
    `${theme}/divider-path.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 96" width="1200" height="96" role="img" aria-label="A winding path with three waypoints">
${t.transparent ? "" : `<rect width="1200" height="96" fill="${t.bg}"/>`}
<path d="M0 62C150 62 190 30 330 30S520 68 660 66S860 28 1000 30S1140 52 1200 50" fill="none" stroke="${t.path}" stroke-width="16" stroke-linecap="round"/>
${mk(120, 59, t.accent)}${mk(600, 67, t.path)}${mk(1060, 33, t.path)}
</svg>`
  );
}

// App icon: a lit doorway with the path leading in. Works at 16px and up.
const D = THEMES.dark;
write(
  "mark.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Merlin">
<rect width="64" height="64" rx="14" fill="${D.bg}"/>
<path d="M19 50V27a13 13 0 0 1 26 0V50" fill="${D.void}" stroke="${D.line}" stroke-width="3" stroke-linejoin="round"/>
<path d="M27 50V30a7 7 0 0 1 2.2 -5" fill="none" stroke="${D.accent}" stroke-width="2.5" stroke-linecap="round"/>
<path d="M12 57C24 57 23 49 32 49S39 42 33 38" fill="none" stroke="${D.path}" stroke-width="6" stroke-linecap="round"/>
<circle cx="47" cy="15" r="3.5" fill="${D.accent}"/>
</svg>`
);

// ---- blend: the guide in the line-art world ---------------------------
const blend = [];
for (const [name, def] of Object.entries(BLEND)) {
  const id = `${def.kind === "spot" ? "spot" : "scene"}-${name}`;
  write(`blend/${id}.svg`, render(def, `blend-${name}`, "blend").svg({ labels: false, title: def.title }));
  blend.push({ id, kind: def.kind, name, title: def.title, stage: def.stage, use: def.use, width: def.w, height: def.h });
}

// ---- landscapes: the journey -----------------------------------------
const K = kit();
const landscapes = [];
for (const [name, def] of Object.entries({ ...JOURNEY, ...DESTINATIONS })) {
  const body = def.draw(K);
  const kind = name in DESTINATIONS ? "destination" : "scene";
  write(`landscape/scene-${name}.svg`, wrap(body, { w: LW, h: LH, title: def.title, radius: 28 }));
  write(`landscape/banner-${name}.svg`, wrap(body, { w: LW, h: LH, crop: def.banner, title: def.title }));
  landscapes.push({ id: `scene-${name}`, kind, name, title: def.title, stage: def.stage, use: def.use, width: LW, height: LH, banner: { width: def.banner[2], height: def.banner[3] } });
}
for (const [name, def] of Object.entries(LAND_SPOTS)) {
  write(`landscape/spot-${name}.svg`, wrap(def.draw(K), { w: LS, h: LS, title: def.title, radius: 28 }));
  landscapes.push({ id: `spot-${name}`, kind: "spot", name, title: def.title, stage: "", use: def.use, width: LS, height: LS });
}
write("landscape/rail-night.svg", wrap(rail(kit(NIGHT)), { w: 480, h: 330, title: "Hills at dusk" }));
write("landscape/rail-day.svg", wrap(rail(K), { w: 480, h: 330, title: "Hills at sunrise" }));

write("manifest.json", JSON.stringify({ themes: THEMES, illustrations: manifest, landscapes, blend }, null, 2));

const lib = join(root, "lib", "brand");
mkdirSync(lib, { recursive: true });
writeFileSync(
  join(lib, "manifest.ts"),
  `// Generated by scripts/brand/build.mjs. Do not edit by hand.
export type IllustrationKind = "scene" | "spot";
export type IllustrationTheme = ${Object.keys(THEMES).filter((k) => k !== "blend").map((k) => JSON.stringify(k)).join(" | ")};
export interface IllustrationMeta {
  id: string;
  kind: IllustrationKind;
  name: string;
  title: string;
  use: string;
  width: number;
  height: number;
  labeled: boolean;
}
export const THEMES = ${JSON.stringify(THEMES, null, 2)} as const;
export const ILLUSTRATIONS: IllustrationMeta[] = ${JSON.stringify(manifest, null, 2)};
export interface LandscapeMeta {
  id: string;
  kind: IllustrationKind | "destination";
  name: string;
  title: string;
  stage: string;
  use: string;
  width: number;
  height: number;
  banner?: { width: number; height: number };
}
export const LANDSCAPES: LandscapeMeta[] = ${JSON.stringify(landscapes, null, 2)};
export const BLEND: LandscapeMeta[] = ${JSON.stringify(blend, null, 2)};
export type IllustrationId = ${manifest.map((m) => JSON.stringify(m.id)).join(" | ")};
`
);
console.log(`Wrote ${landscapes.length} landscapes and ${manifest.length} illustrations x ${Object.keys(THEMES).length} themes to public/brand`);
