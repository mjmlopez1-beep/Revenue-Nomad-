#!/usr/bin/env node
/**
 * Seal the owner's private fit tag taxonomy (lib/evidence/tags.ts) so it can ship with the code
 * without being readable in the public repo: AES-256-GCM over gzip, the format of
 * data/intel-seed.enc (base64 of iv[12] + authTag[16] + ciphertext), with the same key.
 *
 *   node scripts/seal-fit-tags.mjs /path/outside/the/repo/fit-tags.json
 *   node scripts/seal-fit-tags.mjs /path/fit-tags.json --out /tmp/x/fit-tags.enc     (tests)
 *
 * The key: RN_INTEL_SEED_KEY, else data/intel-seed.key. It is never printed. The plain JSON is
 * read from the path given and must be outside the repo, so it is never committed by mistake.
 * Its shape: { sources, categories: [{ name, slug, roles, roles_doc_summary, roles_doc_section,
 * groups: [{ name, source, tags }] }] }. The app keeps only names, slugs, group names and tags.
 */
import { createCipheriv, randomBytes } from "crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "fs";
import path from "path";
import { gzipSync } from "zlib";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? path.resolve(args[outAt + 1] ?? "") : path.join(ROOT, "data", "fit-tags.enc");
const input = args.find((a, i) => !a.startsWith("--") && (outAt < 0 || i !== outAt + 1));
if (!input) {
  console.error("Give the plain JSON's path: node scripts/seal-fit-tags.mjs /path/outside/the/repo/fit-tags.json");
  process.exit(2);
}
const src = realpathSync(path.resolve(input));
const root = realpathSync(ROOT);
if (src === root || src.startsWith(root + path.sep)) {
  console.error("The plain taxonomy must not be inside the repo. Keep it outside, and give its path.");
  process.exit(2);
}

const keyFile = path.join(ROOT, "data", "intel-seed.key");
const keyB64 = process.env.RN_INTEL_SEED_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "");
const key = Buffer.from(keyB64, "base64");
if (key.length !== 32) {
  console.error("Set RN_INTEL_SEED_KEY (32 bytes, base64), the key that opens data/intel-seed.enc.");
  process.exit(2);
}

const json = JSON.parse(readFileSync(src, "utf8"));
const cats = Array.isArray(json?.categories) ? json.categories : [];
if (!cats.length || !cats.every((c) => typeof c?.name === "string" && Array.isArray(c.groups))) {
  console.error("That file isn't the taxonomy: it needs categories, each with a name and groups.");
  process.exit(2);
}
const tags = cats.reduce((n, c) => n + c.groups.reduce((m, g) => m + (Array.isArray(g?.tags) ? g.tags.length : 0), 0), 0);

const plain = gzipSync(Buffer.from(JSON.stringify(json)), { level: 9 });
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const body = Buffer.concat([cipher.update(plain), cipher.final()]);
writeFileSync(out, Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64"));
// Counts only: never a tag, a path inside the file or the key.
console.log(`sealed ${cats.length} categories, ${tags} tags (${body.length} bytes)`);
