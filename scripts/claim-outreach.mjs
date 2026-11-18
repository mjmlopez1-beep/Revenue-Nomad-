#!/usr/bin/env node
/**
 * The owner's "claim your seat" outreach file: one CSV row per seat named from public profiles
 * (scripts/add-seat-names.mjs) whose holder is in the United States and that no member has claimed.
 * Offline, for the owner only. It never goes inside the repo, and nothing in it is ever stored by
 * Merlin.
 *
 *   node scripts/claim-outreach.mjs <out.csv> --csv <seats.csv>
 *   node scripts/claim-outreach.mjs <out.csv> --csv <seats.csv> --seed <intel-seed.json> --state <intel.json>
 *
 * --csv    the seat file the names came from (the one scripts/add-seat-names.mjs read).
 * --seed   the private seed with the names in it (default data/intel-seed.json).
 * --state  optional: a copy of the runtime state (the admin export, or intel.json). Seats a member
 *          claimed, and names taken off, are left out. Without it every named seat is in.
 *
 * Columns: first name, full name, company, role, start month, claim link, Sales Navigator lead link
 * and a ready-to-send message. The claim link is
 * ${RN_PUBLIC_URL || "https://table-pilot.up.railway.app"}/claim/<token>, the token worked out the
 * way the server does (lib/claimToken.ts, from the seed key: RN_INTEL_SEED_KEY, else
 * data/intel-seed.key). The lead link is the one place the file's profile id goes, and only here.
 * The message says what the person gets and that it is free, and never where the name came from.
 *
 * Prints counts only, never a name.
 */
import { spawnSync } from "child_process";
import { createHmac } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

// lib/claimToken.ts and lib/personName.ts are TypeScript: started with plain node, this starts itself again with tsx loaded.
if (!process.env.RN_CLAIM_OUTREACH_TSX) {
  const r = spawnSync(process.execPath, ["--import", "tsx", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, RN_CLAIM_OUTREACH_TSX: "1" } });
  process.exit(r.status ?? 1);
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const csvPath = flag("--csv");
const seedPath = flag("--seed") ?? path.join(ROOT, "data", "intel-seed.json");
const statePath = flag("--state");
const outPath = args[0];
if (!outPath || !csvPath) {
  console.error("Usage: node scripts/claim-outreach.mjs <out.csv> --csv <seats.csv> [--seed intel-seed.json] [--state intel.json]");
  process.exit(1);
}
const out = path.resolve(outPath);
// The file names people next to their profile links: it never goes inside the repo (the repo is public).
const repoRoots = [ROOT, path.resolve(ROOT, "..", "..", "..")].filter((p) => existsSync(path.join(p, "package.json")));
if (repoRoots.some((r) => out === r || out.startsWith(r + path.sep))) {
  console.error("Write the outreach file outside the repo (it names people next to their profile links). Nothing was written.");
  process.exit(1);
}

const keyB64 = process.env.RN_INTEL_SEED_KEY || (existsSync(path.join(ROOT, "data", "intel-seed.key")) ? readFileSync(path.join(ROOT, "data", "intel-seed.key"), "utf8").trim() : "");
if (!keyB64) {
  console.error("No seed key: set RN_INTEL_SEED_KEY or put it in data/intel-seed.key. Seats and claim links are keyed by HMACs under it.");
  process.exit(1);
}
process.env.RN_INTEL_SEED_KEY = keyB64;
const { claimToken } = await import("../lib/claimToken.ts");
const { firstNameOf } = await import("../lib/personName.ts");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = head.map((h) => h.replace(/^﻿/, "").trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthText = (m) => (/^\d{4}-\d{2}$/.test(m ?? "") ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : /^\d{4}$/.test(m ?? "") ? m : "");

const key = Buffer.from(keyB64, "base64");
const hashedId = (seatId) => `e_ss_${createHmac("sha256", key).update(`seat-scan:${seatId}`).digest("hex").slice(0, 20)}`;
const legacyId = (seatId) => `e_ss_${seatId.replace(/[^A-Za-z0-9]/g, "")}`;

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const state = statePath ? JSON.parse(readFileSync(statePath, "utf8")) : null;
const engs = new Map(seed.engagements.map((e) => [e.id, e]));
const companies = new Map(seed.companies.map((c) => [c.id, c]));
const base = (process.env.RN_PUBLIC_URL || "https://table-pilot.up.railway.app").replace(/\/+$/, "");

const counts = { us: 0, notOnSeed: 0, notNamed: 0, claimed: 0, removed: 0, noLead: 0, written: 0 };
const lines = [["first_name", "full_name", "company", "role", "start_month", "claim_link", "sales_navigator_lead", "message"].join(",")];
for (const r of parseCsv(readFileSync(csvPath, "utf8"))) {
  if (String(r.country ?? "").trim() !== "United States") continue;
  counts.us++;
  const sid = String(r.seat_id ?? "").trim();
  const e = sid ? engs.get(legacyId(sid)) ?? engs.get(hashedId(sid)) : undefined;
  if (!e) {
    counts.notOnSeed++;
    continue;
  }
  if (e.holderFrom !== "public profile" || !e.fields.operator) {
    counts.notNamed++;
    continue;
  }
  // The runtime state wins: a member's claim, or a name taken off.
  const v = state?.values?.[`${e.id}.operator`];
  if (v?.status === "removed") {
    counts.removed++;
    continue;
  }
  if (v) {
    counts.claimed++;
    continue;
  }
  const lead = String(r.person_sales_nav_id ?? "").trim();
  if (!lead) counts.noLead++;
  const name = e.fields.operator;
  const first = firstNameOf(name);
  const company = companies.get(e.companyId)?.fields?.name ?? String(r.company_name ?? "").trim();
  const role = e.fields.role ?? "";
  const link = `${base}/claim/${claimToken(e.id)}`;
  const seat = role ? `your seat as ${role} at ${company}` : `your fractional seat at ${company}`;
  const message =
    `Hi ${first}, ${seat} is on Merlin, a data exchange for fractional operators from Revenue Nomad. ` +
    "Operators share what they know about fractional work to earn credits, and see which companies hire fractionals, what they've paid and which roles are open now. " +
    `Claiming your seat is free and takes a minute. ${link} ` +
    "Not you, or would you rather not be listed? The same link takes your name off.";
  lines.push([first, name, company, role, monthText(e.fields.start), link, lead ? `https://www.linkedin.com/sales/lead/${lead}` : "", message].map(csvCell).join(","));
  counts.written++;
}

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
console.log(`United States rows: ${counts.us}`);
console.log(`rows written: ${counts.written}${counts.noLead ? ` (${counts.noLead} without a lead link)` : ""}`);
console.log(`left out: ${counts.notOnSeed} not on the seed, ${counts.notNamed} with no name on the seat, ${counts.claimed} claimed by a member, ${counts.removed} taken off`);
console.log(`claim links point at ${base}`);
console.log("wrote the file (outside the repo). It names people: keep it to yourself.");
