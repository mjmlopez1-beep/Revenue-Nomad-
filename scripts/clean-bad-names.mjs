#!/usr/bin/env node
/**
 * Take the names that are a greeting or a page's words ("Welcome Read", "Meet Our Team",
 * lib/nameWords.ts) off the private seed (data/intel-seed.json), then re-seal data/intel-seed.enc.
 * Such a name got in because the importers checked only its shape (lib/personName.ts now refuses
 * it on the way in, and lib/table.ts hides one at view time).
 *
 *   node scripts/clean-bad-names.mjs                                         (writes the seed and seals it)
 *   node scripts/clean-bad-names.mjs --dry-run                               (counts only, writes nothing)
 *   node scripts/clean-bad-names.mjs --seed <intel-seed.json> --no-seal      (tests, a copy)
 *
 * A seat's holder name (fields.operator) goes, with its "public profile" marker: the seat reads as
 * nobody named yet. A person's name goes from their record. A seat or person whose name is a
 * member's own name (by first and last name, lib/personName.ts nameKey) is never touched: those are
 * members' own seats. Nothing else changes, and a second run changes nothing.
 *
 * It also counts the company names that want an admin's eyes (lib/scan/clean.ts companyNameFlag: a
 * bare domain, digits only, 1 or 2 characters). They are not changed here: the admin's review list
 * (View.admin.firmReview) lists them.
 *
 * Prints counts only, never a name.
 */
import { execFileSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

// The name rules are TypeScript, so this runs under tsx: started with plain node, it starts itself again with tsx loaded.
if (!process.env.RN_CLEAN_NAMES_TSX) {
  const r = spawnSync(process.execPath, ["--import", "tsx", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, RN_CLEAN_NAMES_TSX: "1" } });
  process.exit(r.status ?? 1);
}
const { neverNameWord } = await import("../lib/nameWords.ts");
const { nameKey } = await import("../lib/personName.ts");
const { companyNameFlag, isPlaceholderCompany } = await import("../lib/scan/clean.ts");

const args = process.argv.slice(2);
const at = args.indexOf("--seed");
const seedPath = at >= 0 ? args[at + 1] : "data/intel-seed.json";
const dryRun = args.includes("--dry-run");
const noSeal = args.includes("--no-seal");

const text = readFileSync(seedPath, "utf8");
const seed = JSON.parse(text);
const members = new Set((seed.members ?? []).map((m) => nameKey(m.name ?? "")).filter(Boolean));
const ownName = (n) => members.has(nameKey(n));

const counts = { seatNames: 0, seatNamesMembers: 0, seatNamesRemoved: 0, personNames: 0, personNamesMembers: 0, personNamesRemoved: 0 };
/** How often each word was the reason (a word, never a name). */
const byWord = {};
for (const e of seed.engagements ?? []) {
  const n = e.fields?.operator;
  if (!n) continue;
  counts.seatNames++;
  const w = neverNameWord(n);
  if (!w) continue;
  if (ownName(n)) {
    counts.seatNamesMembers++;
    continue;
  }
  byWord[w] = (byWord[w] ?? 0) + 1;
  counts.seatNamesRemoved++;
  delete e.fields.operator;
  if (e.holderFrom) delete e.holderFrom;
}
for (const p of seed.contacts ?? []) {
  const n = p.fields?.name;
  if (!n) continue;
  counts.personNames++;
  const w = neverNameWord(n);
  if (!w) continue;
  if (ownName(n)) {
    counts.personNamesMembers++;
    continue;
  }
  byWord[w] = (byWord[w] ?? 0) + 1;
  counts.personNamesRemoved++;
  delete p.fields.name;
}

// Company names for an admin's review: counted, never changed. A placeholder name is already left out of the table.
const flags = { "a bare domain": 0, "digits only": 0, "1 or 2 characters": 0, placeholder: 0 };
for (const c of seed.companies ?? []) {
  const name = c.fields?.name ?? "";
  if (isPlaceholderCompany(name)) flags.placeholder++;
  else {
    const f = companyNameFlag(name);
    if (f) flags[f]++;
  }
}

console.log(`seat holder names: ${counts.seatNames}; with a greeting or page word: ${counts.seatNamesRemoved + counts.seatNamesMembers} (${counts.seatNamesMembers} a member's own name, kept; ${counts.seatNamesRemoved} removed)`);
console.log(`person names: ${counts.personNames}; with a greeting or page word: ${counts.personNamesRemoved + counts.personNamesMembers} (${counts.personNamesMembers} a member's own name, kept; ${counts.personNamesRemoved} removed)`);
console.log(`by word: ${Object.entries(byWord).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} ${n}`).join(", ") || "none"}`);
console.log(`company names for admin review (not changed): ${flags["a bare domain"]} a bare domain, ${flags["digits only"]} digits only, ${flags["1 or 2 characters"]} 1 or 2 characters (${flags.placeholder} placeholders already left out)`);

const changed = counts.seatNamesRemoved + counts.personNamesRemoved > 0;
if (dryRun) console.log("dry run: nothing written");
else if (!changed) console.log("nothing to remove: the seed is unchanged");
else {
  // Written the way it was read: compact, or one space a level.
  writeFileSync(seedPath, text.startsWith('{"') ? JSON.stringify(seed) : JSON.stringify(seed, null, 1));
  console.log(`wrote ${seedPath}`);
  if (!noSeal && seedPath === "data/intel-seed.json") execFileSync(process.execPath, ["scripts/seal-intel-seed.mjs"], { stdio: "inherit" });
}
