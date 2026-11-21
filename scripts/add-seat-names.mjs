#!/usr/bin/env node
/**
 * Put the seat holder's name on the seats Revenue Nomad found (source "Seat scan") whose holder is
 * based in the United States, from the seat file, into the private seed (data/intel-seed.json), then
 * re-seal data/intel-seed.enc.
 *
 *   node scripts/add-seat-names.mjs <seats.csv>
 *   node scripts/add-seat-names.mjs <seats.csv> --dry-run                               (counts only, writes nothing)
 *   node scripts/add-seat-names.mjs <seats.csv> --seed <intel-seed.json> --no-seal      (tests, a worktree's copy)
 *
 * Needs the seed key (RN_INTEL_SEED_KEY, else data/intel-seed.key): a row's seat is found by the
 * same one-way HMAC of its seat_id that scripts/add-seat-scan.mjs keyed it by ("e_ss_" + the first 20
 * hex of HMAC-SHA256(key, "seat-scan:" + seat_id)), or by the first batch's id ("e_ss_" + the
 * seat_id's letters and digits).
 *
 * Only rows whose country is exactly "United States" are named. A seat named from a public profile
 * whose row says the holder is elsewhere loses that name, and the run stops without writing if any
 * seat outside the United States would still carry one (it prints that count, which must be 0).
 * The name is cleaned (lib/personName.ts):
 * pronouns, credentials, emoji, nicknames and decoration go, and what is left must read as a first
 * and last name written out; a row whose name doesn't is skipped and counted. The seat gets the name
 * as its seat holder (fields.operator) and the marker holderFrom "public profile": the name is
 * unverified until its fractional claims the seat, two members confirm it, or an admin does (see
 * lib/table.ts). Nothing else from the row is stored: no profile id, location, search query, tenure
 * or anything about the company that the seat scan did not already store.
 *
 * A seat that already has a seat holder in the seed keeps it, so a second run changes nothing. A
 * member's claim lives in the runtime state, never in the seed, so it always wins over this name.
 * Prints counts only, never a name.
 */
import { execFileSync, spawnSync } from "child_process";
import { createHmac } from "crypto";
import { readFileSync, writeFileSync } from "fs";

// The name rules (lib/personName.ts) are TypeScript, so this runs under tsx: started with plain node, it starts itself again with tsx loaded.
if (!process.env.RN_SEAT_NAMES_TSX) {
  const r = spawnSync(process.execPath, ["--import", "tsx", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, RN_SEAT_NAMES_TSX: "1" } });
  process.exit(r.status ?? 1);
}
// What the importers share: the CSV, the seed key, and names for United States seats only (seat-import.mjs).
const { inUs, nameSeat, outsideUsNames, parseCsv, seedKey } = await import("./seat-import.mjs");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const seedPath = flag("--seed") ?? "data/intel-seed.json";
const noSeal = args.includes("--no-seal");
const dryRun = args.includes("--dry-run");
const csvPath = args.filter((a) => a !== "--no-seal" && a !== "--dry-run")[0];
if (!csvPath) {
  console.error("Usage: node scripts/add-seat-names.mjs <seats.csv> [--seed data/intel-seed.json] [--no-seal] [--dry-run]");
  process.exit(1);
}

const seatKey = seedKey("Seats are found by an HMAC under it.");
const hashedId = (seatId) => `e_ss_${createHmac("sha256", seatKey).update(`seat-scan:${seatId}`).digest("hex").slice(0, 20)}`;
const legacyId = (seatId) => `e_ss_${seatId.replace(/[^A-Za-z0-9]/g, "")}`;

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const rows = parseCsv(readFileSync(csvPath, "utf8"));
const byId = new Map(seed.engagements.map((e) => [e.id, e]));

const counts = { us: 0, matchedHashed: 0, matchedLegacy: 0, notOnSeed: 0, notFound: 0, alreadyNamed: 0, named: 0, sameSeatTwice: 0 };
const skipped = {};
const seen = new Set();
for (const r of rows) {
  if (!inUs(r)) continue;
  counts.us++;
  const sid = String(r.seat_id ?? "").trim();
  if (!sid) {
    counts.notOnSeed++;
    continue;
  }
  const e = byId.get(legacyId(sid)) ?? byId.get(hashedId(sid));
  if (!e) {
    counts.notOnSeed++;
    continue;
  }
  if (e.id === legacyId(sid)) counts.matchedLegacy++;
  else counts.matchedHashed++;
  if (e.fields?.source !== "Seat scan") {
    counts.notFound++;
    continue;
  }
  if (seen.has(e.id)) {
    counts.sameSeatTwice++;
    continue;
  }
  seen.add(e.id);
  // Never overwrite: a seat that has a holder in the seed keeps it (a second run, or a name from elsewhere).
  const put = nameSeat(e, r.person_name);
  if (put.kept) counts.alreadyNamed++;
  else if (put.skip) skipped[put.skip] = (skipped[put.skip] ?? 0) + 1;
  else counts.named++;
}

// The owner's rule: no name for anyone based outside the United States. A seat named from a public
// profile whose row in this file is outside the United States (the holder moved, or an older file
// said otherwise) loses that name. A member's claim lives in the state and is not touched.
const seatOfRow = (r) => {
  const sid = String(r.seat_id ?? "").trim();
  return sid ? byId.get(legacyId(sid)) ?? byId.get(hashedId(sid)) : undefined;
};
const { takenOff, namedOutsideUs } = outsideUsNames(rows, seatOfRow, (e) => e.fields?.source === "Seat scan");
if (namedOutsideUs) {
  console.error(`${namedOutsideUs} seats outside the United States would carry a name. Nothing was written.`);
  process.exit(1);
}

if (!dryRun) writeFileSync(seedPath, JSON.stringify(seed, null, 1));

const matched = counts.matchedHashed + counts.matchedLegacy;
const skippedN = Object.values(skipped).reduce((n, x) => n + x, 0);
const onFile = seed.engagements.filter((e) => e.holderFrom === "public profile" && e.fields?.operator).length;
console.log(`${dryRun ? "DRY RUN, nothing written. " : ""}rows read: ${rows.length}, United States: ${counts.us}`);
console.log(`matched to a seat on the seed: ${matched} (${counts.matchedHashed} by the hashed id, ${counts.matchedLegacy} by the first batch's id); not on the seed: ${counts.notOnSeed}`);
if (counts.notFound) console.log(`matched a seat that isn't from the seat scan (left alone): ${counts.notFound}`);
if (counts.sameSeatTwice) console.log(`the same seat twice in the file: ${counts.sameSeatTwice}`);
console.log(`named now: ${counts.named}`);
console.log(`already had a seat holder (kept): ${counts.alreadyNamed}`);
console.log(`skipped, the name doesn't read as a first and last name: ${skippedN}`);
for (const [why, n] of Object.entries(skipped).sort((a, b) => b[1] - a[1])) console.log(`  skipped (${why}): ${n}`);
console.log(`rows outside the United States: ${rows.length - counts.us}; names taken off them: ${takenOff}; named seats outside the United States: ${namedOutsideUs}`);
console.log(`seed now: ${onFile} seats named from public profiles, of ${seed.engagements.filter((e) => e.fields?.source === "Seat scan").length} seat-scan seats`);
if (!dryRun && !noSeal && seedPath === "data/intel-seed.json") execFileSync(process.execPath, ["scripts/seal-intel-seed.mjs"], { stdio: "inherit" });
