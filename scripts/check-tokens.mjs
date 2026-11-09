#!/usr/bin/env node
// Design-token guard. Fails when a homepage file defines a color or font outside app/tokens.css.
// CONSTRAINTS.md "Design". Scope: app/home/**, app/page.tsx, app/[...slug]/**.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const targets = ["app/home", "app/check", "app/page.tsx", "app/[...slug]", "app/thanks", "app/Brand.tsx"];
const files = [];
function walk(p) {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (/\.(tsx?|css)$/.test(p)) files.push(p);
}
targets.forEach((t) => walk(join(root, t)));

const hex = /#[0-9a-fA-F]{3,8}\b/g;
const rgb = /\brgba?\(/g;
// A font-family that names a token is fine; a literal family name is not.
const font = /font-family\s*:(?!\s*var\(--rn-font-)/g;
// A radius must be a token (or 0 / 50% for circles).
const radius = /border-radius\s*:(?![^;]*var\(--rn-radius-)[^;]*\d+px/g;
const problems = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const where = `${relative(root, f)}:${i + 1}`;
    // SVG attributes may carry a literal "none" or currentColor; literal hex in markup is still a violation.
    if (line.includes("tokens-allow")) return;
    if (hex.test(line)) problems.push(`${where}: raw hex color -> use var(--rn-*)`);
    if (rgb.test(line)) problems.push(`${where}: raw rgb() color -> add a token`);
    if (font.test(line)) problems.push(`${where}: font-family outside app/tokens.css`);
    if (radius.test(line)) problems.push(`${where}: literal border-radius -> use var(--rn-radius-*)`);
    hex.lastIndex = rgb.lastIndex = font.lastIndex = radius.lastIndex = 0;
  });
}
if (problems.length) {
  console.error(`check:tokens failed (${problems.length})\n` + problems.join("\n"));
  process.exit(1);
}
console.log(`check:tokens ok (${files.length} files)`);
