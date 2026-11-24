/**
 * Numbers and names that must agree across screens (branch consist), the parts not covered by the
 * page suites (test-hiring, test-warm, test-crystal-ball, test-rates-credits):
 *
 *   npx tsx scripts/test-consist.mts
 *
 * A person is shown with one company: someone the member knows, on file as a decision maker (or who
 * hired a seat) at one company while the member's own file has them at another, is never given the
 * title from that other company beside the company they decide at (lib/paths/find.ts, words.ts,
 * ways.ts, intro.ts). Pure: a made-up world (companies Northwind Clinics and Cedar and Pine, the
 * person Riley Example), nothing read from disk, no network.
 */
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

const F = await import("../lib/paths/find.ts");
const W = await import("../lib/paths/words.ts");
const I = await import("../lib/paths/intro.ts");
type World = import("../lib/paths/find.ts").World;
type Contact = import("../lib/paths/find.ts").Contact;
type WLeader = import("../lib/paths/find.ts").WLeader;

console.log("\nA person is shown with one company");
const NW = "c_nw";
const CP = "c_cp";
const dm: WLeader = { id: "p_dm", companyId: NW, nameKey: "riley example", slug: "riley-example", rel: "Decision maker", seat: null };
const w: World = {
  nowIdx: 2026 * 12 + 10,
  companies: new Map([
    [NW, { id: NW, name: "Northwind Clinics", kind: "Health Care" }],
    [CP, { id: CP, name: "Cedar and Pine", kind: "SaaS" }],
  ]),
  seats: new Map(),
  seatsAt: new Map(),
  persons: new Map(),
  personByNameCo: new Map(),
  personOfMember: new Map(),
  memberByEmail: new Map(),
  memberBySlug: new Map(),
  leadersAt: new Map([[NW, [dm]]]),
  leadersBySlug: new Map([["riley-example", [dm]]]),
  leaderByNameCo: new Map(),
  caSlugs: new Set(),
};
// The member's own file: Riley is VP Sales at Cedar and Pine. Merlin has Riley as a decision maker at Northwind (same profile).
const riley: Contact = {
  key: "li:riley-example", name: "Riley Example", first: "Riley", nameKey: "riley example", title: "VP Sales", companyId: CP, email: null, slug: "riley-example",
  linkedin: "https://www.linkedin.com/in/riley-example", src: ["linkedin"], warmth: null, why: "LinkedIn connection", met: false, connected: "2025-03-01", member: null,
};
const me = { memberId: "mem_jor", nameKey: "jordan avery", person: null, clients: new Set<string>(), visible: () => true, words: { name: "Jordan Avery", as: "a fractional VP Sales", clients: null, fn: "Sales" }, voice: null, nowMs: Date.now() };
const found = F.findPaths(w, me as never, [riley]);
const atNw = found.get(NW)?.paths ?? [];
const atCp = found.get(CP)?.paths ?? [];
const lead = atNw.find((p) => p.kind === "leads");
check("the way in at Northwind is Riley as its decision maker", !!lead, atNw.map((p) => p.kind));
check("…and it never pairs their Cedar and Pine title with Northwind", !!lead && !/VP Sales at Northwind/.test(lead.line) && lead.line.includes("decision maker at Northwind Clinics") && lead.via.title === null, lead && { line: lead.line, title: lead.via.title });
const works = atCp.find((p) => p.kind === "leads" || p.kind === "works");
check("at Cedar and Pine, where the file has them, their title is said with that company", !!works && works.line.includes("VP Sales") && works.line.includes("Cedar and Pine"), works?.line);
check("the words: a decision maker elsewhere is said without a title", W.lineOf({ kind: "leads", who: { name: "Riley Example", first: "Riley", title: null, src: ["linkedin"], met: false }, target: "Northwind Clinics", elsewhere: true }).includes("is a decision maker at Northwind Clinics"));
check("the specific ask says the same", I.howThey({ kind: "leads", degree: 1, first: "Riley", title: null, company: "Northwind Clinics", bridge: null, bridgeNote: null, fn: null, active: false, other: null, otherRole: null, rel: null, leader: false } as never) === "Riley is a decision maker at Northwind Clinics.");

const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
check("the finder marks both cross-company kinds (a decision maker, a seat they hired for)", /kind: "leads", elsewhere: true/.test(src("lib/paths/find.ts")) && /l\.companyId !== c\.companyId \? \{ elsewhere: true \}/.test(src("lib/paths/find.ts")));
check("the route and the specific ask drop the other company's title", /parts\.elsewhere \? "Decision maker" : "A leader"/.test(src("lib/paths/ways.ts")) && /title: p\.elsewhere \? null : c\.title/.test(src("lib/paths/index.ts")));

console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
