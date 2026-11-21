/**
 * How long Fractionals takes to build (lib/fractionals.ts fractionalsView), on a made-up seed the
 * size of the real one (7,400 companies, 7,700 seats, 4,100 of them named, 280 members) plus 6,000
 * made-up past seats, each with a person key shared with a current seat or another past one. In
 * process, nothing private, nothing leaves the machine.
 *
 *   npx tsx scripts/fractionals-perf.mts
 *
 * Prints the first build for a member (the shared groups and the member's records), then the median
 * of 10 more for other members, and how many records and how large the answer is.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-fr-perf-"));
const rnd = (() => {
  let x = 42;
  return () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
})();
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const IND = ["SaaS", "Fintech", "Health Care", "Insurance", "E-commerce", "Education", "Manufacturing", "Marketing"];
const EMP = ["1–10", "11–50", "51–200", "201–500", "501–1,000"];
const REV = ["$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M–$100M"];
const HQ = ["Austin, TX", "Denver, CO", "Boston, MA", "Raleigh, NC", "Seattle, WA", "Toronto, ON", "London, England", "Chicago, IL"];
const ROLES: [string, string][] = [["Fractional CMO", "Marketing"], ["Fractional CFO", "Finance"], ["Fractional VP Sales", "Sales"], ["Fractional Head of RevOps", "RevOps"], ["Fractional CRO", "Sales"], ["Fractional Head of Growth", "Growth"], ["Fractional COO", "Operations"], ["Fractional CTO", "Technology"]];
const FIRST = ["Ari", "Bea", "Cy", "Di", "Ed", "Flo", "Gus", "Hal", "Ida", "Jem", "Kit", "Lou", "Max", "Nan", "Oz", "Pam", "Quin", "Ros", "Sol", "Tam"];
const LAST = ["Arden", "Bexley", "Corran", "Delmont", "Everly", "Farrow", "Galt", "Hale", "Ives", "Jessop", "Kerrow", "Lanyard", "Morrow", "Nettle", "Orwin", "Pell", "Quarry", "Rook", "Stave", "Tarn"];

const companies = Array.from({ length: 7400 }, (_, i) => ({ id: `c_p${i}`, fields: { name: `Perfco ${i} Labs`, website: `perfco${i}.example`, industry: pick(IND), employees: pick(EMP), revenue: pick(REV), hq: pick(HQ) } }));
const members = Array.from({ length: 280 }, (_, i) => ({ id: `mem_p${i}`, name: `${pick(FIRST)} Member${i}`, email: `m${i}@example.com`, title: pick(ROLES)[0], token: `tok-p${i}` }));
const engagements: Record<string, unknown>[] = [];
const keyOf = (n: number) => `p_${n.toString(16).padStart(20, "0")}`;
// 7,700 current seats: 4,100 named (3,550 from public profiles, the rest members' own), the rest unnamed.
for (let i = 0; i < 7700; i++) {
  const [role, fn] = pick(ROLES);
  const named = i < 4100;
  const member = named && i >= 3550 ? members[i % members.length] : null;
  const person = i % 3550;
  engagements.push({
    id: `e_p${i}`,
    companyId: `c_p${i % 7400}`,
    verified: false,
    fields: { source: member ? "Member success story" : "Seat scan", ...(named ? { operator: member ? member.name : `${FIRST[person % 20]} ${LAST[Math.floor(person / 20) % 20]} ${person}` } : {}), role, function: fn, type: "Fractional", start: "2025-02", status: "Active", end: "Ongoing" },
    ...(named && !member ? { holderFrom: "public profile", holderKey: keyOf(person) } : {}),
  });
}
// 6,000 past seats: each a person key shared with a current seat (4,000) or another past seat.
for (let i = 0; i < 6000; i++) {
  const [role, fn] = pick(ROLES);
  const person = i < 4000 ? i % 3550 : 3550 + (i % 1000);
  engagements.push({
    id: `e_ps_${i}`,
    companyId: `c_p${Math.floor(rnd() * 7400)}`,
    verified: false,
    fields: { source: "Seat scan", operator: `${FIRST[person % 20]} ${LAST[Math.floor(person / 20) % 20]} ${person}`, role, function: fn, type: "Fractional", start: "2022", status: "Ended", end: "2024" },
    holderFrom: "public profile",
    holderKey: keyOf(person),
  });
}
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: new Date().toISOString(), members, companies, engagements, contacts: [] }));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: Object.fromEntries(members.map((m) => [m.id, new Date().toISOString()])), profiles: Object.fromEntries(members.map((m, i) => [m.id, { onboarded: true, function: "Marketing", ...(i % 3 ? { fractionals: true } : {}), icp: { industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: ["United States"] } }])) }),
);
Object.assign(process.env, { RN_DATA_DIR: dir, RN_INTEL_SEED: path.join(dir, "intel-seed.json"), RN_LOGO_LOOKUP: "off", RN_SCAN_TEST: "1", RN_DIGEST: "0", RN_UNVERIFIED_NAMES_UNTIL: "100000", RN_INTEL_SEED_KEY: Buffer.alloc(32, 3).toString("base64") });
for (const k of ["RN_BILLING", "RN_SCAN", "RN_RADAR", "RESEND_API_KEY"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

const t = await import("../lib/table");
const fr = await import("../lib/fractionals");
await t.loadState();
const t0 = performance.now();
const first = await fr.fractionalsView("tok-p0");
const firstMs = performance.now() - t0;
const times: number[] = [];
for (let i = 1; i <= 10; i++) {
  const a = performance.now();
  await fr.fractionalsView(`tok-p${i}`);
  times.push(performance.now() - a);
}
times.sort((a, b) => a - b);
const json = JSON.stringify(first);
console.log(`seats ${engagements.length}, records ${first!.records.length}, answer ${(json.length / 1024).toFixed(0)} KB`);
console.log(`first build ${firstMs.toFixed(0)} ms (groups and the shared part), then median ${times[5].toFixed(0)} ms, slowest ${times[9].toFixed(0)} ms for other members`);
rmSync(dir, { recursive: true, force: true });
process.exit(0);
