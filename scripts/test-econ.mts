/**
 * Checks of the bundles and prices on the server module (lib/table.ts), in process, on a made-up
 * seed. Each scenario runs in its own process: the module keeps its state in memory, and a state
 * file is read only at start. Nothing from the real seed is read.
 *
 *   npx tsx scripts/test-econ.mts       exits 1 on any failure
 *
 *  - An end month that reads "Ongoing" is free. What a member paid to see one comes back once, on
 *    load, with the line "Gave back 1 credit: an ongoing seat's end month is free now.", and a
 *    restart gives nothing back twice. A dated end on an Ended seat stays a 1 credit fact.
 *  - SEAT_SCAN_ROLE_FREE (lib/tableFields.ts), both ways: as shipped, and on a copy of lib/ with the
 *    constant turned the other way. True: the role of a seat Revenue Nomad found that nobody is named
 *    on is a free fact (its cell, Unlock all and the counts, which the connector reads too). False:
 *    it is a 1 credit lock. Either way, once its fractional claims the seat, the role comes with who
 *    held it (one purchase).
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CompanyRec, EngagementRec, View } from "../lib/tableTypes";

const THIS = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(THIS));
const args = process.argv.slice(2);
const DAY = 86_400_000;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${(typeof detail === "string" ? detail : JSON.stringify(detail) ?? "undefined").slice(0, 600)}`}`);
}

const ONGOING_LINE = "Gave back 1 credit: an ongoing seat's end month is free now.";
const NOTHING = "Nothing here is locked, so no credit was spent.";
const SHIPPED_FREE = /export const SEAT_SCAN_ROLE_FREE = true;/.test(readFileSync(path.join(ROOT, "lib", "tableFields.ts"), "utf8"));

/* ---------- a made-up seed, and a state where a member paid for three end months ---------- */

const SEED = {
  builtAt: new Date(Date.now() - 5 * DAY).toISOString(),
  members: [
    { id: "m1", name: "Ann Holder", email: "ann@example.com", title: "Fractional VP Sales", token: "tok-ann" },
    { id: "m2", name: "Bo Buyer", email: "bo@example.com", title: "Fractional CMO", token: "tok-bo" },
    { id: "m3", name: "Cy Claimer", email: "cy@example.com", title: "Fractional CMO", token: "tok-cy" },
    { id: "m4", name: "Di Fresh", email: "di@example.com", title: "Fractional CRO", token: "tok-di" },
  ],
  companies: [
    { id: "c_alpha", fields: { name: "Alphaco", industry: "SaaS" } },
    { id: "c_beta", fields: { name: "Betaco", industry: "SaaS" } },
  ],
  engagements: [
    { id: "e_alpha_active", companyId: "c_alpha", fields: { source: "Published engagement", operator: "Ann Holder", role: "Fractional VP Sales", function: "Sales", type: "Fractional", status: "Active", start: "2025-01", end: "Ongoing" }, verified: false },
    { id: "e_alpha_ended", companyId: "c_alpha", fields: { source: "Published engagement", operator: "Ann Holder", role: "Fractional CRO", function: "Sales", type: "Fractional", status: "Ended", start: "2023-01", end: "2024-06" }, verified: false },
    { id: "e_beta_scan", companyId: "c_beta", fields: { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", status: "Active", start: "2026-05", end: "Ongoing" }, verified: false },
  ],
  contacts: [],
};
const PAID_AT = new Date(Date.now() - 2 * DAY).toISOString();
const PAID_ENDS = ["e_alpha_active.end", "e_alpha_ended.end", "e_beta_scan.end"];
const STATE = {
  companies: [], engagements: [], contacts: [], values: {}, verifications: {}, members: [], profiles: {}, follows: {}, referralPaid: [], reportLog: [], held: [],
  benchRates: [], signals: [], notMine: {}, seen: {}, scan: { lastRunAt: null, sources: [], roles: {} }, digest: { lastSentAt: null, sent: 0, members: {} }, flags: {},
  ledger: PAID_ENDS.map((ref) => ({ memberId: "m2", delta: -1, reason: "unlock", ref, at: PAID_AT })),
  unlocks: Object.fromEntries(PAID_ENDS.map((ref) => [ref, ["m2"]])),
};

/* =====================================================================================
 * Scenarios: one process each (`--child <name>`), with RN_DATA_DIR, the seed and the tree set by the parent.
 * ===================================================================================== */

type Table = typeof import("../lib/table");
const tableOf = async (): Promise<Table> => import(process.env.ECON_LIB ? path.join(process.env.ECON_LIB, "table.ts") : "../lib/table");
const engs = (v: View) => v.companies.flatMap((c) => c.engagements.map((e) => ({ c, e })));
/** The seat with this role, read as Ann (the seed's seat holder sees her own seats free). */
async function seatId(t: Table, role: string): Promise<string> {
  const hit = engs(await t.buildView("tok-ann")).find(({ e }) => e.cells.role?.s === "value" && e.cells.role.v === role);
  if (!hit) throw new Error(`no seat with the role ${role}`);
  return hit.e.id;
}
const eng = (v: View, id: string): EngagementRec | undefined => engs(v).find(({ e }) => e.id === id)?.e;
const company = (v: View, name: string): CompanyRec | undefined => v.companies.find((c) => c.name === name);
const tryAct = async (t: Table, token: string, a: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> => {
  try {
    return { ok: true, message: (await t.perform(token, a as never)).message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};

const CHILDREN: Record<string, () => Promise<void>> = {
  /** First start on a state where Bo paid for two end months that read Ongoing and one dated end. */
  async refund() {
    const t = await tableOf();
    const active = await seatId(t, "Fractional VP Sales");
    const ended = await seatId(t, "Fractional CRO");
    const bo = await t.buildView("tok-bo");
    const lines = bo.ledger.filter((l) => l.reason === ONGOING_LINE);
    check("the two credits spent on Ongoing end months come back", bo.me?.credits === 25 - 3 + 2, bo.me?.credits);
    check("  each with the owner's line, and nothing after it", lines.length === 2 && lines.every((l) => l.delta === 1 && l.company === "" && l.field === ""), lines);
    const a = eng(bo, active)?.cells.end;
    const scan = company(bo, "Betaco")?.engagements[0]?.cells.end;
    check("an Ongoing end month is a free value, no longer a paid one", a?.s === "value" && a.v === "Ongoing" && !a.paid && scan?.s === "value" && scan.v === "Ongoing" && !scan.paid, [a, scan]);
    const e = eng(bo, ended)?.cells.end;
    check("the dated end Bo paid for stays his, and was not given back", e?.s === "value" && e.v === "2024-06" && e.paid === true, e);
    const di = await t.buildView("tok-di");
    check("for a member who paid nothing, the Ongoing end is free and the dated end is locked", eng(di, active)?.cells.end?.s === "value" && eng(di, ended)?.cells.end?.s === "locked", [eng(di, active)?.cells.end, eng(di, ended)?.cells.end]);
    const free = await tryAct(t, "tok-di", { type: "unlock", entity: "engagement", id: active, field: "end" });
    check("asking to unlock an Ongoing end spends nothing", !free.ok && free.error === NOTHING, free);
    const paid = await tryAct(t, "tok-di", { type: "unlock", entity: "engagement", id: ended, field: "end" });
    check("a dated end on an Ended seat is 1 credit", paid.ok && paid.message === "Unlocked the end month for 1 credit." && (await t.buildView("tok-di")).me?.credits === 24, paid);
  },

  /** A restart on the state the first start wrote: nothing is given back twice. */
  async refundAgain() {
    const t = await tableOf();
    const bo = await t.buildView("tok-bo");
    check("after a restart nothing is given back twice", bo.me?.credits === 24 && bo.ledger.filter((l) => l.reason === ONGOING_LINE).length === 2, [bo.me?.credits, bo.ledger.length]);
    check("  and what another member bought since is kept", (await t.buildView("tok-di")).me?.credits === 24);
  },

  /** The role of a found seat nobody is named on, with SEAT_SCAN_ROLE_FREE as this tree has it (ECON_FREE says which). */
  async scanRole() {
    const free = process.env.ECON_FREE === "true";
    const t = await tableOf();
    const F: typeof import("../lib/tableFields") = await import(process.env.ECON_LIB ? path.join(process.env.ECON_LIB, "tableFields.ts") : "../lib/tableFields");
    const M: typeof import("../app/post/model") = await import("../app/post/model");
    check(`this tree has SEAT_SCAN_ROLE_FREE = ${free}`, F.SEAT_SCAN_ROLE_FREE === free, F.SEAT_SCAN_ROLE_FREE);
    const di = await t.buildView("tok-di");
    const beta = company(di, "Betaco")!;
    const e = beta.engagements[0];
    const info = M.deriveAll([beta])[0];
    const r = await tryAct(t, "tok-di", { type: "unlock", entity: "engagement", id: e.id, field: "role" });
    if (free) {
      check("true: the found seat's role is a free value", e.cells.role?.s === "value" && e.cells.role.v === "Fractional CMO" && !e.cells.role.paid, e.cells.role);
      check("true: Unlock all has nothing to buy there, and nothing counts as locked", info.locked.length === 0 && beta.facts.locked === 0, [info.locked, beta.facts]);
      check("true: asking to unlock it spends nothing", !r.ok && r.error === NOTHING && (await t.buildView("tok-di")).me?.credits === 25, r);
    } else {
      check("false: the found seat's role is a 1 credit lock", e.cells.role?.s === "locked", e.cells.role);
      check("false: Unlock all buys it, and it counts as locked", info.locked.map((x) => x.field).join() === "role" && beta.facts.locked === 1, [info.locked, beta.facts]);
      check("false: unlocking it is 1 credit", r.ok && r.message === "Unlocked the role for 1 credit." && (await t.buildView("tok-di")).me?.credits === 24, r);
    }
    // Its fractional claims it: the seat has a holder now, and the role comes with who held it.
    const claim = await tryAct(t, "tok-cy", { type: "claimSeat", engagementId: e.id });
    check("its fractional claims the seat", claim.ok, claim);
    const bo = await t.buildView("tok-bo");
    const be = company(bo, "Betaco")!.engagements[0];
    check("once claimed, who held it and the role are both locked, one purchase", be.cells.operator?.s === "locked" && be.cells.role?.s === "locked" && M.lockedInEngagement(be).map((x) => x.field).join() === "operator", [be.cells.operator, be.cells.role]);
    const buy = await tryAct(t, "tok-bo", { type: "unlock", entity: "engagement", id: e.id, field: "role" });
    const after = company(await t.buildView("tok-bo"), "Betaco")!.engagements[0];
    check(
      "  unlocking the role opens who held it too, for 1 credit",
      buy.ok && buy.message === "Unlocked the seat holder and their role for 1 credit." && after.cells.operator?.s === "value" && after.cells.operator.v === "Cy Claimer" && after.cells.role?.s === "value",
      [buy, after.cells.operator, after.cells.role],
    );
    if (!free) {
      // Di paid for the role before the claim: she holds that half of the pair, so who claimed it comes with it.
      const d = company(await t.buildView("tok-di"), "Betaco")!.engagements[0];
      check("false: a member who paid for the role before the claim sees who held it, the rest of the pair", d.cells.operator?.s === "value" && d.cells.operator.paid === true, d.cells.operator);
    }
  },
};

if (args[0] === "--child") {
  const noise = console.log;
  console.log = (...a: unknown[]) => (/^(PASS|FAIL|##)/.test(String(a[0])) ? noise(...a) : undefined);
  console.warn = () => {};
  console.error = () => {};
  try {
    await CHILDREN[args[1]]();
  } catch (e) {
    check(`scenario ${args[1]} ran to the end`, false, String((e as Error)?.stack ?? e).slice(0, 800));
  }
  console.log(`##RESULT ${passed} ${failed}`);
  process.exit(0);
}

/* =====================================================================================
 * The parent: prepare the folders, then run the scenarios.
 * ===================================================================================== */

const scratch = mkdtempSync(path.join(tmpdir(), "rn-econ-"));
const seedPath = path.join(scratch, "seed.json");
writeFileSync(seedPath, JSON.stringify(SEED));
const UNSET = ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_REQUIRE_SEED", "RN_INTEL_SEED_KEY", "RN_INTEL_SEED_B64", "RN_ADMIN_EMAILS", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN"];
function child(name: string, dataDir: string, extra: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = { ...process.env, RN_DATA_DIR: dataDir, RN_INTEL_SEED: seedPath, RN_STARTER_CREDITS: "25", RN_LOGO_LOOKUP: "off", RN_ID_SECRET: "econ-secret", ...extra };
  for (const k of UNSET) delete env[k];
  const run = spawnSync(process.execPath, [...process.execArgv, THIS, "--child", name], { encoding: "utf8", timeout: 120_000, env: env as NodeJS.ProcessEnv });
  const out = run.stdout ?? "";
  const lines = out.split("\n").filter((l) => l && !l.startsWith("##"));
  if (lines.length) console.log(lines.join("\n"));
  const result = out.match(/^##RESULT (\d+) (\d+)$/m);
  if (result) {
    passed += Number(result[1]);
    failed += Number(result[2]);
  } else check(`scenario ${name} ran to the end`, false, (run.stderr || String(run.error ?? "no output")).slice(-600));
}
const freshDir = (name: string) => {
  const d = path.join(scratch, name);
  mkdirSync(d, { recursive: true });
  return d;
};

try {
  console.log("\nAn end month that reads Ongoing is free, and what was paid for one comes back once");
  const refundDir = freshDir("refund");
  writeFileSync(path.join(refundDir, "intel.json"), JSON.stringify(STATE));
  child("refund", refundDir);
  child("refundAgain", refundDir);

  console.log(`\nSEAT_SCAN_ROLE_FREE as shipped (${SHIPPED_FREE})`);
  child("scanRole", freshDir("shipped"), { ECON_FREE: String(SHIPPED_FREE) });

  console.log(`\nSEAT_SCAN_ROLE_FREE turned the other way (${!SHIPPED_FREE}), on a copy of lib/`);
  const lib = path.join(scratch, "flipped", "lib");
  cpSync(path.join(ROOT, "lib"), lib, { recursive: true });
  // lib/table.ts also reads one import-free file outside lib/ (the saved-view place, app/onboard/place.ts).
  mkdirSync(path.join(scratch, "flipped", "app", "onboard"), { recursive: true });
  cpSync(path.join(ROOT, "app", "onboard", "place.ts"), path.join(scratch, "flipped", "app", "onboard", "place.ts"));
  const fieldsPath = path.join(lib, "tableFields.ts");
  const before = readFileSync(fieldsPath, "utf8");
  const flipped = before.replace(`export const SEAT_SCAN_ROLE_FREE = ${SHIPPED_FREE};`, `export const SEAT_SCAN_ROLE_FREE = ${!SHIPPED_FREE};`);
  check("the copy has the constant turned the other way", flipped !== before);
  writeFileSync(fieldsPath, flipped);
  child("scanRole", freshDir("flippedData"), { ECON_FREE: String(!SHIPPED_FREE), ECON_LIB: lib });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
