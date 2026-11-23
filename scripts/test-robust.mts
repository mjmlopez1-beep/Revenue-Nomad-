/**
 * Checks of what keeps Merlin standing: a damaged state file, a missing seed, the health
 * check, the cap on table views, oversized and signed-out requests, what members can type, one
 * company one record, security headers and the weekly email's unsubscribe headers. Also the
 * API's routes (the old job-board routes are gone and answer 404), what an action's answer
 * carries (the records it touched, the whole Me, the table version), the kept copy of a
 * member's table and the signed-out counts kept for a few minutes. The load check is
 * scripts/test-load.mjs.
 *
 *   npx tsx scripts/test-robust.mts            run everything (exits 1 on any failure)
 *   ROBUST_PORT=4599                           the port the test servers listen on (default 4599)
 *   ROBUST_HTTP=0                              leave out the checks that start a server
 *
 * Three kinds of check:
 *  - plain ones on pure modules (lib/tableFields.ts, lib/scan/clean.ts, lib/viewQueue.ts);
 *  - scenarios on the server module (lib/table.ts), each in its own process on a made-up seed
 *    and a temporary data folder, because the module keeps its state in memory and a damaged
 *    file is only met at start;
 *  - checks over HTTP against servers this file starts itself (`next start`, so run
 *    `npm run build` first) on a made-up seed. Nothing from the real seed is read or printed.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fsMod, { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** A seat in an Add names the member as its holder: members add only seats they held (the server writes their own name). */
const asHolder = (extra: Record<string, unknown>) =>
  extra.engagementFields ? { ...extra, operatorMemberId: "me", engagementFields: { operator: "Seat Holder", ...(extra.engagementFields as Record<string, unknown>) } } : extra;
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
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);
/** Anything a check needs that may not exist on an older tree: a missing export fails the check, it does not stop the run. */
const fn = <T,>(x: T | undefined, name: string): T => x ?? ((() => { throw new Error(`${name} is not exported`); }) as unknown as T);
const attempt = async <T,>(work: () => T | Promise<T>): Promise<{ ok: true; v: T } | { ok: false; e: unknown }> => {
  try {
    return { ok: true, v: await work() };
  } catch (e) {
    return { ok: false, e };
  }
};
const well = (s: unknown) => typeof s === "string" && s.isWellFormed();

/* ---------- a made-up seed ---------- */

const SMALL_SEED = {
  builtAt: new Date(Date.now() - 20 * DAY).toISOString(),
  members: [
    { id: "m1", name: "Ann Adder", email: "ann@example.com", title: "Fractional VP Sales", token: "tok-a" },
    { id: "m2", name: "Bo Buyer", email: "bo@example.com", title: "Fractional CMO", token: "tok-b" },
    { id: "m9", name: "Ada Admin", email: "ada@example.com", title: "Founder", token: "tok-ada" },
  ],
  companies: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `c_fill${i}`, fields: { name: `Fillco ${i}` } })),
  engagements: [{ id: "e_fill1_x", companyId: "c_fill1", fields: { source: "Published engagement", function: "Sales" } }],
  contacts: [],
};
const S3_ENV = { RN_BACKUP_S3_ENDPOINT: "https://s3.robust.example", RN_BACKUP_S3_BUCKET: "bucket", RN_BACKUP_S3_KEY_ID: "key", RN_BACKUP_S3_SECRET: "secret", RN_BACKUP_S3_PATH_STYLE: "1" };

/* =====================================================================================
 * Scenarios: one process each (`--child <name>`), with RN_DATA_DIR and the seed set by the parent.
 * ===================================================================================== */

type Table = typeof import("../lib/table");
const STATE = () => path.join(process.env.RN_DATA_DIR!, "intel.json");
const corruptCopies = () => readdirSync(process.env.RN_DATA_DIR!).filter((f) => f.startsWith("intel.json.corrupt-"));
const unavailable = (e: unknown) => !!e && (e as { unavailable?: boolean }).unavailable === true;

/** Add an HQ to one of the seed's companies as Ann: one fact, one credit, one write. */
/** One fact: the HQ of a company on file, added by typing its name (every company is locked for a member until they know it; Add by name still works). */
async function fillHq(t: Table, n: number) {
  return t.perform("tok-a", { type: "add", company: `Fillco ${n}`, companyFields: { hq: "Austin, TX" } });
}
/** Uploads to the made-up bucket, caught instead of sent. */
function catchUploads(): string[] {
  const puts: string[] = [];
  globalThis.fetch = (async (url: unknown, init?: { method?: string }) => {
    if (String(url).startsWith(S3_ENV.RN_BACKUP_S3_ENDPOINT) && init?.method === "PUT") puts.push(String(url));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return puts;
}
const settle = () => new Promise((done) => setTimeout(done, 80));

const CHILDREN: Record<string, () => Promise<void>> = {
  /** Three facts as Ann. The day's backup is written with the first, so it holds one fact and the state file three. */
  async prep() {
    const t: Table = await import("../lib/table");
    for (const n of [1, 2, 3]) await fillHq(t, n);
    eq("three facts are on file", (await t.buildView("tok-a")).me?.added, 3);
  },

  /** A first start: an empty folder. */
  async first() {
    const puts = catchUploads();
    // Watch the write: the temp file must be on the disk (fsync) before it takes the state file's place.
    const fsp = fsMod.promises;
    const events: string[] = [];
    const open = fsp.open.bind(fsp);
    (fsp as { open: unknown }).open = async (p: unknown, ...rest: unknown[]) => {
      const fh = await (open as (...a: unknown[]) => Promise<fsMod.promises.FileHandle>)(p, ...rest);
      if (String(p).endsWith("intel.json.tmp")) {
        events.push("open");
        const sync = fh.sync.bind(fh);
        fh.sync = async () => (events.push("fsync"), sync());
      }
      return fh;
    };
    const rename = fsp.rename.bind(fsp);
    (fsp as { rename: unknown }).rename = async (a: fsMod.PathLike, b: fsMod.PathLike) => (String(b).endsWith("intel.json") && events.push("rename"), rename(a, b));

    const t: Table = await import("../lib/table");
    eq("a missing state file with no backups is a first start: an empty table", (await t.buildView("tok-a")).me?.added, 0);
    const r = await attempt(() => fillHq(t, 1));
    check("and it takes writes", r.ok, r.ok ? undefined : String(r.e));
    eq("the state is written to a temp file, synced to the disk, then renamed", events, ["open", "fsync", "rename"]);
    check("the state file on disk parses", !!JSON.parse(readFileSync(STATE(), "utf8")).ledger?.length);
    await settle();
    eq("a table that started empty does not replace today's off-site copy", puts.length, 0);
    const h = await attempt(() => fn(t.health, "health")());
    eq("health: ok", h.ok ? h.v : String(h.e), { ok: true, seed: "ok", state: "ok", disk: "ok" });
  },

  /** A start from a good state file: uploads go out as before. */
  async file() {
    const puts = catchUploads();
    const t: Table = await import("../lib/table");
    eq("a good state file loads as it is", (await t.buildView("tok-a")).me?.added, 3);
    await fillHq(t, 4);
    await settle();
    check("and a write uploads the off-site copy", puts.length === 1 && /\/backups\/intel-\d{4}-\d{2}-\d{2}\.json$/.test(puts[0]), puts);
  },

  /** The state file is damaged or gone, and a backup with one fact can be read. EXPECT_ASIDE: the damaged file is kept. */
  async restored() {
    const puts = catchUploads();
    const errors: string[] = [];
    console.error = (...a: unknown[]) => void errors.push(a.map(String).join(" "));
    const t: Table = await import("../lib/table");
    const v = await attempt(() => t.buildView("tok-a"));
    eq("the table comes from the newest backup that parses, never empty", v.ok ? [v.v.me?.added, v.v.me?.credits] : String(v.e), [1, 26]);
    const aside = corruptCopies();
    if (process.env.EXPECT_ASIDE) {
      eq("the damaged file is kept next to the state, byte for byte", [aside.length, aside[0] && statSync(path.join(process.env.RN_DATA_DIR!, aside[0])).size], [1, Number(process.env.EXPECT_ASIDE)]);
    } else eq("there was no file to keep", aside.length, 0);
    check("the log says what happened and which backup was used", errors.some((l) => /STATE (DAMAGED|MISSING)/.test(l)) && errors.some((l) => /STATE RESTORED from backups\/intel-/.test(l)), errors);
    const h = await attempt(() => fn(t.health, "health")());
    eq("health says the state was restored", h.ok ? [h.v.ok, h.v.state] : String(h.e), [true, "restored"]);
    const w = await attempt(() => fillHq(t, 5));
    check("writes go on from there", w.ok && JSON.parse(readFileSync(STATE(), "utf8")).ledger.length === 2, w.ok ? readFileSync(STATE(), "utf8").slice(0, 200) : String(w.e));
    await settle();
    eq("a restored table does not replace today's off-site copy", puts.length, 0);
  },

  /** The state file is damaged and no backup can be read: refuse, and touch nothing. */
  async refuse() {
    const puts = catchUploads();
    console.error = () => {};
    const before = readFileSync(STATE());
    const t: Table = await import("../lib/table");
    const view = await attempt(() => t.buildView("tok-a"));
    check("the view is refused, not built from an empty table", !view.ok && unavailable(view.e), view.ok ? { added: view.v.me?.added } : String(view.e));
    const act = await attempt(() => t.perform("tok-a", { type: "profile", function: "Sales" }));
    check("an action is refused", !act.ok && unavailable(act.e), act.ok ? act.v : String(act.e));
    const join = await attempt(() => t.joinMember("New Person", "new.person@example.com"));
    check("joining is refused", !join.ok && unavailable(join.e), join.ok ? "joined" : String(join.e));
    const seen = await attempt(() => t.touch("tok-a"));
    check("a visit is not written either", !seen.ok && unavailable(seen.e));
    const h = await attempt(() => fn(t.health, "health")());
    eq("health fails, and says it is the state", h.ok ? [h.v.ok, h.v.state] : String(h.e), [false, "down"]);
    await settle();
    check("the damaged file is still there, byte for byte", existsSync(STATE()) && readFileSync(STATE()).equals(before));
    eq("nothing was snapshotted or uploaded", [existsSync(path.join(process.env.RN_DATA_DIR!, "backups")) ? readdirSync(path.join(process.env.RN_DATA_DIR!, "backups")).length : 0, puts.length], [Number(process.env.EXPECT_BACKUPS ?? 0), 0]);
  },

  /** A change that fails costs one copy of the state, and never leaves part of itself behind. */
  async flush() {
    const t: Table = await import("../lib/table");
    // A company is found by its public id: every company is locked for a member until they unlock it or know it.
    const idOf = (name: string) => t.tableInternals.pubId(`c_fill${name.split(" ")[1]}`);
    const follow = () => t.perform("tok-a", { type: "follow", companyId: idOf("Fillco 6"), on: true });
    const hq = (n: number) => t.perform("tok-a", { type: "fill", entity: "company", id: idOf(`Fillco ${n}`), field: "hq", value: "Austin, TX" });
    const bad = () => t.perform("tok-a", { type: "nope" } as never);
    await follow(); // the first write of a process carries a one-time job of its own
    // The two the member adds to: unlocked first (a fact added by clicking into a locked company is refused).
    for (const n of [1, 2]) await t.perform("tok-a", { type: "unlock", entity: "company", id: idOf(`Fillco ${n}`), field: "identity" });
    let clones = 0;
    const real = globalThis.structuredClone;
    globalThis.structuredClone = ((x: unknown, o?: StructuredSerializeOptions) => (clones++, real(x, o))) as typeof structuredClone;
    const alone = await attempt(bad);
    eq("a change that fails on its own copies the state once, not twice", [alone.ok, clones], [false, 1]);
    // Three calls in a row: the first is taken as a batch of one, the two behind it run together as the next.
    clones = 0;
    const r1 = await Promise.allSettled([follow(), bad(), hq(1)]);
    eq("a failed change followed by a good one: the good one is saved on a rebuilt copy", [r1.map((r) => r.status), clones], [["fulfilled", "rejected", "fulfilled"], 3]);
    clones = 0;
    const r2 = await Promise.allSettled([follow(), hq(2), bad()]);
    eq("a good change followed by a failed one: the copy is rebuilt before it is written", [r2.map((r) => r.status), clones], [["fulfilled", "fulfilled", "rejected"], 3]);
    eq("both good changes are on file", (await t.buildView("tok-a")).me?.added, 2);
    eq("and on disk", JSON.parse(readFileSync(STATE(), "utf8")).ledger.filter((l: { reason: string }) => l.reason === "fill").length, 2);
    // CR-08: an unlockMany list with things that aren't objects in it is read without them: never a server error (TypeError).
    const odd = await attempt(() => t.perform("tok-a", { type: "unlockMany", items: [null, 1, "x"] } as never));
    check("CR-08: unlockMany with [null, 1, \"x\"]: no TypeError, an answer or a refusal in words", odd.ok || odd.e instanceof t.ActionError, odd.ok ? odd.v.message : String(odd.e));
    const mixed = await attempt(() => t.perform("tok-a", { type: "unlockMany", items: [null, { entity: "company", id: idOf("Fillco 3"), field: "identity" }, "x", [1]] } as never));
    check("CR-08: the objects in such a list still unlock", mixed.ok && (await t.buildView("tok-a")).companies.some((c) => c.id === idOf("Fillco 3") && !c.hidden), mixed.ok ? mixed.v.message : String(mixed.e));
  },

  /** RN_REQUIRE_SEED=1 and no seed to load. Runs from a folder with no data/ in it. */
  async seedRequired() {
    console.error = () => {};
    const t: Table = await import("../lib/table");
    const seed = await attempt(() => t.loadSeed());
    check("the sample seed is refused", !seed.ok && unavailable(seed.e), seed.ok ? { demo: seed.v.demo } : String(seed.e));
    const demo = await attempt(() => t.memberForToken("demo"));
    check('"demo" signs nobody in', !demo.ok && unavailable(demo.e), demo.ok ? !!demo.v : String(demo.e));
    const view = await attempt(() => t.buildView(null));
    check("the signed-out view is refused too", !view.ok && unavailable(view.e), view.ok ? { demo: view.v.demo } : String(view.e));
    const h = await attempt(() => fn(t.health, "health")());
    eq("health fails, and says it is the seed", h.ok ? [h.v.ok, h.v.seed] : String(h.e), [false, "missing"]);
  },

  /** No seed and no RN_REQUIRE_SEED: the sample data still runs (local builds), but health is not ok. */
  async seedDemo() {
    const t: Table = await import("../lib/table");
    eq("without RN_REQUIRE_SEED the sample seed still loads", (await t.loadSeed()).demo, true);
    const h = await attempt(() => fn(t.health, "health")());
    eq("health is not ok on sample data", h.ok ? [h.v.ok, h.v.seed] : String(h.e), [false, "demo"]);
  },

  /** A real seed with no RN_ID_SECRET: say so once. */
  async seedWarn() {
    const warnings: string[] = [];
    console.warn = (...a: unknown[]) => void warnings.push(a.map(String).join(" "));
    const t: Table = await import("../lib/table");
    await t.buildView("tok-a");
    await t.buildView("tok-b");
    const want = process.env.RN_ID_SECRET ? 0 : 1;
    eq(want ? "a real seed with no RN_ID_SECRET logs one warning" : "with RN_ID_SECRET set there is no warning", warnings.filter((w) => /RN_ID_SECRET/.test(w)).length, want);
  },

  /** What members type into Add and into a field. */
  async add() {
    const t: Table = await import("../lib/table");
    const stats = async () => (await t.buildView("tok-a")).stats.companies;
    const add = (company: string, extra: Record<string, unknown> = {}) => attempt(() => t.perform("tok-a", { type: "add", company, ...asHolder(extra) } as never));
    const adminCompany = async (name: string) => (await t.buildView("tok-ada")).companies.find((c) => c.name === name);
    const n0 = await stats();

    await add("Dupetest Robotics", { website: "dupetest.example.com" });
    eq("a new company is one more record", (await stats()) - n0, 1);
    for (const name of ["Dupetest Robotics, Inc.", "Dupetest Robotics LLC", "DUPETEST ROBOTICS (YC W24)", "The Dupetest Robotics", "dupetest  robotics."]) await add(name);
    eq("the same name with a legal suffix, a bracketed note, capitals or a leading The is the same record", (await stats()) - n0, 1);
    await add("Dupetest Holdings", { website: "https://www.DUPETEST.example.com/careers?src=x" });
    await add("Dupetest Group", { website: "Dupetest.Example.com" });
    eq("the same website in another case, or with a path, is the same record", (await stats()) - n0, 1);

    await add("Hostonly Works", { website: "Example-Two.COM/about/team?utm=1#x" });
    eq("a company website is stored as its host, lowercase", ((await adminCompany("Hostonly Works"))?.cells.website as { v?: string })?.v, "example-two.com");

    const n1 = await stats();
    await add("Ромашка");
    await add("Берёзка");
    await add("日本語の会社", { engagementFields: { function: "Sales", type: "Fractional" } });
    eq("companies named in Cyrillic and Japanese are three records, not one", (await stats()) - n1, 3);
    eq("  and the seat went to the company it was added for", [(await adminCompany("日本語の会社"))?.engagements.length, (await adminCompany("Ромашка"))?.engagements.length], [1, 0]);
    await add("Société Robustesse");
    await add("Societe Robustesse");
    eq("an accented and an unaccented spelling are one record", (await stats()) - n1, 4);
    const junk = [await add("!!!"), await add("🚀🚀"), await add("(YC W24)")];
    check("a name with no letter or digit is refused", junk.every((r) => !r.ok) && (await stats()) - n1 === 4, junk.map((r) => (r.ok ? "added" : String(r.e))));

    const long = `${"B".repeat(79)}🚀 Robotics`;
    await add(long);
    const cutName = (await t.buildView("tok-ada")).companies.find((c) => c.name.startsWith("BBBB"))?.name;
    eq("a company name cut at 80 never ends in half a character", [well(cutName), cutName?.length], [true, 79]);

    // Fields.
    // A seat Ann held (only its holder adds facts to a seat).
    const own = await add("Fillco 1", { newEngagement: true, engagementFields: { function: "Marketing" } });
    const seat = { id: own.ok ? (own.v as { id: string }).id : "" };
    const fill = (field: string, value: unknown) => attempt(() => t.perform("tok-a", { type: "fill", entity: "engagement", id: seat.id, field, value } as never));
    const one = await fill("role", "a");
    const digits = await fill("role", "1 2345");
    check("a role needs at least 2 letters", !one.ok && !digits.ok, [one.ok, digits.ok]);
    const obj = await fill("role", { a: 1 });
    const list = await fill("role", ["Fractional CMO"]);
    check("a value that is not text is refused", !obj.ok && !list.ok && /text/.test(String((obj as { e: unknown }).e)), [obj.ok ? obj.v : String(obj.e), list.ok]);
    const emoji = await fill("role", `${"C".repeat(199)}🚀`);
    check("a role cut at 200 never ends in half a character", emoji.ok && well(emoji.v.cells?.[0]?.cell && (emoji.v.cells[0].cell as { v?: string }).v), emoji.ok ? emoji.v.cells : String(emoji.e));

    const tracked = `https://jobs.example.com/acme/fractional-vp-sales-123456?${"utm_source=newsletter&utm_campaign=x".repeat(8)}`;
    const posting = await fill("posting", tracked);
    eq("a job link over 200 characters loses its tracking codes, not its end", posting.ok ? (posting.v.cells?.[0]?.cell as { v?: string }).v : String(posting.e), "jobs.example.com/acme/fractional-vp-sales-123456");
    const seat2 = await add("Longlink Works", { engagementFields: { posting: `https://jobs.example.com/${"a".repeat(230)}` } });
    check("a link that is still too long is refused, with what to do", !seat2.ok && /too long/.test(String(seat2.e)), seat2.ok ? "saved" : String(seat2.e));
  },


  /** Health checks that come together while the disk check is due (repair round: they raced on one probe file). */
  async healthRace() {
    const t: Table = await import("../lib/table");
    const health = fn(t.health, "health");
    const burst = async () => (await Promise.all(Array.from({ length: 20 }, () => health()))).filter((h) => h.ok && h.disk === "ok").length;
    eq("20 health checks at once on a fresh start all say ok", await burst(), 20);
    const realNow = Date.now;
    Date.now = () => realNow() + 16_000; // the disk check is due again
    try {
      eq("and 20 more when the disk check is due again", await burst(), 20);
      const one = await health();
      eq("the next single check is ok too", [one.ok, one.disk], [true, "ok"]);
    } finally {
      Date.now = realNow;
    }
    eq("no probe file is left behind", readdirSync(process.env.RN_DATA_DIR!).filter((f) => f.startsWith(".health-")), []);
  },

  /** Company websites on hosts many companies share, names in scripts that write vowels as marks, and short role titles (repair round). */
  async addMore() {
    const t: Table = await import("../lib/table");
    const add = (company: string, extra: Record<string, unknown> = {}) => attempt(() => t.perform("tok-a", { type: "add", company, ...asHolder(extra) } as never));
    const adminCompany = async (name: string) => (await t.buildView("tok-ada")).companies.find((c) => c.name === name);
    const count = async () => (await t.buildView("tok-a")).stats.companies;

    const n0 = await count();
    await add("Alpha Widgets", { website: "linkedin.com/company/alpha-widgets" });
    const beta = await add("Beta Gadgets", { website: "https://www.linkedin.com/company/beta-gadgets/", engagementFields: { function: "Sales", type: "Fractional" } });
    check("a second company on a LinkedIn page is its own record", beta.ok && /^Added Beta Gadgets\./.test(beta.v.message) && (await count()) - n0 === 2, beta.ok ? beta.v.message : String(beta.e));
    eq("  and its seat is on its own record", [(await adminCompany("Beta Gadgets"))?.engagements.length, (await adminCompany("Alpha Widgets"))?.engagements.length], [1, 0]);
    eq("  the website keeps the page's path", ((await adminCompany("Beta Gadgets"))?.cells.website as { v?: string })?.v, "linkedin.com/company/beta-gadgets");
    await add("Gamma Sites", { website: "https://sites.google.com/view/gamma-sites" });
    await add("Delta Sites", { website: "sites.google.com/view/delta-sites" });
    await add("Epsilon Notes", { website: "epsilon.notion.site" });
    await add("Zeta Notes", { website: "zeta.notion.site" });
    eq("two Google Sites pages and two Notion sites are four companies", (await count()) - n0, 6);
    const again = await add("Alpha Widgets Group", { website: "https://www.linkedin.com/company/Alpha-Widgets?trk=x" });
    check("the same LinkedIn page in another case still finds its company", again.ok && /Alpha Widgets is already on Merlin/.test(again.v.message) && (await count()) - n0 === 6, again.ok ? again.v.message : String(again.e));

    const n1 = await count();
    await add("काम");
    const kam = await add("कम");
    await add("กิน");
    await add("กัน");
    check("Hindi and Thai names that differ only in a vowel sign are four records", kam.ok && !/already on Merlin/.test(kam.v.message) && (await count()) - n1 === 4, kam.ok ? kam.v.message : String(kam.e));
    await add("Société Marquée");
    await add("Societe Marquee");
    eq("an accented and an unaccented Latin spelling are still one record", (await count()) - n1, 5);

    const made = await attempt(() => t.perform("tok-a", { type: "add", company: "Fillco 2", newEngagement: true, operatorMemberId: "me", engagementFields: { operator: "Ann Adder", function: "Sales" } } as never));
    const engId = made.ok ? made.v.id : null;
    const fill = (value: string) => attempt(() => t.perform("tok-a", { type: "fill", entity: "engagement", id: engId, field: "role", value } as never));
    const ok: string[] = [];
    for (const title of ["GM", "AE", "BD", "VP", "CS", "CX", "PR", "営業", "销售", "CMO"]) if ((await fill(title)).ok) ok.push(title);
    eq("short real titles are taken as a role", ok, ["GM", "AE", "BD", "VP", "CS", "CX", "PR", "営業", "销售", "CMO"]);
    const one = await fill("a");
    const digits = await fill("1 2345");
    check("one letter, or digits alone, is still not a title", !!engId && !one.ok && !digits.ok, [one.ok, digits.ok]);
  },
  /** The weekly email carries one-click unsubscribe headers. */
  async digest() {
    const sent: { to: string; text: string; headers?: Record<string, string> }[] = [];
    globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
      if (String(url) === "https://api.resend.com/emails") {
        const mail = JSON.parse(String(init?.body ?? "{}"));
        sent.push({ to: mail.to[0], text: mail.text, headers: mail.headers });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const t: Table = await import("../lib/table");
    const email: typeof import("../lib/email") = await import("../lib/email");
    await t.touch("tok-a");
    await t.applyScan({
      roles: [{ key: "digestco:cmo", company: "Digestco Labs", domain: null, title: "Fractional CMO", function: "Marketing", type: "Fractional", url: "https://jobs.example.com/d/1", source: "board", postedAt: null, rate: null, hoursPerWeek: null }],
      sources: [{ source: "board", fetched: 10, matched: 1 }],
    });
    eq("one weekly email goes out", await t.sendDigests(undefined, "https://post.example.com"), 1);
    const mail = sent[0];
    const link = mail?.text.match(/https:\/\/post\.example\.com\/api\/table\/unsubscribe\?\S+/)?.[0];
    check("it carries List-Unsubscribe with that member's own unsubscribe link", !!link && mail.headers?.["List-Unsubscribe"] === `<${link}>`, mail?.headers);
    eq("and List-Unsubscribe-Post for one click", mail?.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    await email.sendEmail("someone@example.com", "Your sign-in link", "text", "<p>html</p>");
    eq("a sign-in email carries neither", sent[1]?.headers, undefined);
  },
};

if (args[0] === "--child") {
  const noise = console.log;
  console.log = (...a: unknown[]) => (/^(PASS|FAIL|##)/.test(String(a[0])) ? noise(...a) : undefined);
  console.warn = () => {};
  try {
    await CHILDREN[args[1]]();
  } catch (e) {
    check(`scenario ${args[1]} ran to the end`, false, String((e as Error)?.stack ?? e).slice(0, 800));
  }
  console.log(`##RESULT ${passed} ${failed}`);
  process.exit(0);
}

/* =====================================================================================
 * The parent: plain checks, then the scenarios, then the servers.
 * ===================================================================================== */

const scratch = mkdtempSync(path.join(tmpdir(), "rn-robust-"));
const seedPath = path.join(scratch, "seed.json");
writeFileSync(seedPath, JSON.stringify(SMALL_SEED));
const BASE_ENV: Record<string, string> = { RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "ada@example.com", RN_LOGO_LOOKUP: "off", RN_SCAN_TEST: "1", RN_ID_SECRET: "robust-secret" };
const UNSET = ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_REQUIRE_SEED", "RN_INTEL_SEED", "RN_INTEL_SEED_KEY", "RN_INTEL_SEED_B64", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", ...Object.keys(S3_ENV)];
const cleanEnv = (extra: Record<string, string>) => {
  const env: Record<string, string | undefined> = { ...process.env, ...BASE_ENV, ...extra };
  for (const k of UNSET) if (!(k in extra)) delete env[k];
  return env as NodeJS.ProcessEnv;
};
/** Run one scenario in its own process and add its checks to the count. */
function child(name: string, dataDir: string, extra: Record<string, string> = {}, cwd?: string) {
  const run = spawnSync(process.execPath, [...process.execArgv, THIS, "--child", name], {
    encoding: "utf8",
    timeout: 120_000,
    cwd,
    env: cleanEnv({ RN_DATA_DIR: dataDir, RN_INTEL_SEED: seedPath, ...extra }),
  });
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
/** A folder holding a real state: three facts in intel.json, and the day's backup with one. */
function preparedDir(name: string) {
  const d = freshDir(name);
  const run = spawnSync(process.execPath, [...process.execArgv, THIS, "--child", "prep"], { encoding: "utf8", env: cleanEnv({ RN_DATA_DIR: d, RN_INTEL_SEED: seedPath }) });
  if (!/##RESULT 1 0/.test(run.stdout ?? "")) throw new Error(`could not prepare a state: ${(run.stderr || run.stdout || "").slice(-400)}`);
  return d;
}
const cutInHalf = (file: string) => {
  const b = readFileSync(file);
  writeFileSync(file, b.subarray(0, Math.floor(b.length / 2)));
  return Math.floor(b.length / 2);
};
const backupsOf = (d: string) => readdirSync(path.join(d, "backups")).filter((f) => /^intel-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();

/* ---------- what members can type (lib/tableFields.ts) ---------- */
console.log("\nWhat members can type");
{
  const F = (await import("../lib/tableFields")) as typeof import("../lib/tableFields");
  const def = (entity: string, key: string) => F.fieldDef(entity, key)!;
  const clean = (entity: string, key: string, raw: unknown) => F.cleanValue(def(entity, key), raw);
  const start = (raw: unknown) => clean("engagement", "start", raw);
  const realNow = Date.now;
  const at = (isoNow: string, work: () => void) => {
    Date.now = () => Date.parse(isoNow);
    try {
      work();
    } finally {
      Date.now = realNow;
    }
  };

  // 08:00 on 1 December in Sydney, 21:00 UTC on 30 November.
  at("2026-11-30T21:00:00Z", () => {
    eq("the month that has started for members ahead of UTC is accepted", [start("2026-12").value, clean("engagement", "end", "2026-12").value], ["2026-12", "2026-12"]);
    eq("the month after that is still the future", start("2027-01").error, "That month hasn't happened yet. Pick this month or earlier.");
    eq("a year that has not started anywhere is the future", start("2027").error, "That month hasn't happened yet. Pick this month or earlier.");
  });
  at("2026-11-16T12:00:00Z", () => {
    eq("mid month, next month is the future", start("2026-12").error, "That month hasn't happened yet. Pick this month or earlier.");
    check("a year before 1970 has its own message", /too far back/.test(start("1969-01").error ?? "") && /too far back/.test(start("1969").error ?? ""), [start("1969-01"), start("1969")]);
    eq(
      "months typed the natural way are read",
      ["3/2025", "03/2025", "2025-3", "2025/03", "Mar 2025", "March 2025", "march 2025", "Sept 2024", "Dec. 2023", "2025-03-15"].map((x) => start(x).value),
      ["2025-03", "2025-03", "2025-03", "2025-03", "2025-03", "2025-03", "2025-03", "2024-09", "2023-12", "2025-03"],
    );
    eq("what is not a month still gets the format", ["13/2025", "Marchember 2025", "soon", "2025-00"].map((x) => start(x).error), Array(4).fill("Use a year and month, like 2025-03."));
    eq("Ongoing still works for an end", clean("engagement", "end", "ongoing").value, "Ongoing");
  });

  eq("a website is its host, lowercase, with no path", ["Example-One.COM", "https://www.EXAMPLE-FOUR.com/", "example-two.com/about/team?utm=1#x"].map((x) => clean("company", "website", x).value), ["example-one.com", "example-four.com", "example-two.com"]);
  eq("other links keep their path and lose only the host's capitals", [clean("contact", "linkedin", "https://www.LinkedIn.com/in/Jane-Doe").value, clean("engagement", "posting", "Jobs.Example.com/Acme/Role?id=7").value], ["linkedin.com/in/Jane-Doe", "jobs.example.com/Acme/Role?id=7"]);
  const tracked = `https://jobs.example.com/acme/role-1234?${"utm_source=x&".repeat(30)}`;
  eq("a link over 200 characters drops its query", clean("engagement", "posting", tracked).value, "jobs.example.com/acme/role-1234");
  eq("a link that is still too long is refused", clean("engagement", "posting", `jobs.example.com/${"a".repeat(220)}`), { error: "That link is too long. Paste the short link." });
  check("values that are not text or a number are refused", [{ a: 1 }, ["x"], true, () => 1].every((x) => !!clean("company", "hq", x).error && !clean("company", "hq", x).value), clean("company", "hq", { a: 1 }));
  eq("a number is still fine for hours", clean("engagement", "hours", 15).value, "15");
  eq("nothing at all is still empty", [clean("company", "hq", null).error, clean("company", "hq", undefined).error, clean("company", "hq", "   ").error], Array(3).fill("It's still empty. Add something first."));
  const hq = clean("company", "hq", `${"x".repeat(199)}🚀 and more`).value;
  eq("text cut at 200 never ends in half a character", [well(hq), hq?.length], [true, 199]);
  eq("a lone half character from the client is dropped", clean("company", "hq", "Austin\ud83d, TX").value, "Austin, TX");
  const tidy = fn(F.tidy, "tidy");
  const t80 = await attempt(() => tidy(`  ${"n".repeat(79)}🚀   Smith `, 80));
  eq("tidy() cuts a name on a whole character", t80.ok ? [well(t80.v), t80.v.length] : String(t80.e), [true, 79]);
  // Repair round: long job links keep the part that names the job (ROB-12).
  const indeed = `https://www.indeed.com/viewjob?jk=4f2a9c1b7e3d5a60&from=serp&vjs=3&tk=${"1h2k3m4n5p6q7r8s".repeat(6)}&advn=${"9".repeat(30)}&adid=${"7".repeat(30)}`;
  const li = `https://www.linkedin.com/jobs/search/?currentJobId=4012345678&geoId=103644278&keywords=${"fractional%20vp%20sales%20".repeat(4)}&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true&trk=${"public_jobs".repeat(5)}`;
  const gh = `https://acme-robotics.com/careers?gh_jid=4567890&gh_src=${"a1b2c3d4e5".repeat(12)}&utm_source=${"x".repeat(40)}`;
  const hashed = `https://jobs.example.com/careers?utm_source=${"y".repeat(200)}#/job/12345`;
  const got = [indeed, li, gh, hashed].map((x) => clean("engagement", "posting", x).value ?? "");
  check(
    "a long Indeed, LinkedIn or Greenhouse link keeps its job id, and a hash-routed one its page",
    got[0].startsWith("indeed.com/viewjob?jk=4f2a9c1b7e3d5a60") &&
      got[1].startsWith("linkedin.com/jobs/search?currentJobId=4012345678") &&
      got[2] === "acme-robotics.com/careers?gh_jid=4567890" &&
      got[3] === "jobs.example.com/careers#/job/12345" &&
      got.every((x) => x.length <= 200 && !/utm_|trk=|gh_src|tk=/.test(x)),
    got,
  );
  eq("a link whose own path is too long is still refused", clean("engagement", "posting", `https://jobs.example.com/${"b".repeat(190)}?jk=1&${"utm_x=1&".repeat(5)}`), { error: "That link is too long. Paste the short link." });
  eq("a link of 200 characters or less keeps every parameter", clean("engagement", "posting", "Jobs.Example.com/Acme/Role?id=7&utm_source=x").value, "jobs.example.com/Acme/Role?id=7&utm_source=x");

  // Websites on hosts many companies share keep their path, and are matched by it (repair round).
  eq(
    "a website on a shared host keeps its path, and other websites are still the host",
    ["https://www.linkedin.com/company/Beta-Gadgets/?trk=x", "sites.google.com/view/delta", "zeta.notion.site", "acme.com/about"].map((x) => clean("company", "website", x).value),
    ["linkedin.com/company/Beta-Gadgets", "sites.google.com/view/delta", "zeta.notion.site", "acme.com"],
  );
  const keys = await attempt(() =>
    ["linkedin.com/company/alpha", "https://www.LinkedIn.com/company/Alpha/", "linkedin.com/company/beta", "twitter.com", "google.com", "acme.com/careers"].map((x) => fn(F.siteKey, "siteKey")(x)),
  );
  eq(
    "two LinkedIn pages never share a key, and a shared host with no path has none",
    keys.ok ? keys.v : String(keys.e),
    ["linkedin.com/company/alpha", "linkedin.com/company/alpha", "linkedin.com/company/beta", null, null, "acme.com"],
  );

  // Short role titles (repair round).
  check(
    "a role needs 2 letters, or one Han, Kana or Hangul character",
    ["GM", "AE", "BD", "VP", "CS", "CX", "PR", "営業", "销售", "CMO"].every((x) => clean("engagement", "role", x).value === x) &&
      !!clean("engagement", "role", "a").error &&
      !!clean("engagement", "role", "1234 5").error,
    ["GM", "営業", "a", "1234 5"].map((x) => clean("engagement", "role", x)),
  );

}

/* ---------- one company, one key (lib/scan/clean.ts) ---------- */
console.log("\nOne company, one key");
{
  const C = (await import("../lib/scan/clean")) as typeof import("../lib/scan/clean");
  const key = await attempt(() => {
    const companyKey = fn(C.companyKey, "companyKey");
    return {
      same: ["Acme Robotics", "ACME robotics", "Acme Robotics, Inc.", "Acme Robotics LLC", "Acme Robotics (YC W24)", "The Acme Robotics", "acme-robotics", "Acme  Robotics."].map(companyKey),
      co: [companyKey("Copper Kettle Co"), companyKey("Copper Kettle")],
      scripts: ["Ромашка", "Берёзка", "日本語の会社", "شركة"].map(companyKey),
      accents: [companyKey("Société Générale"), companyKey("Societe Generale")],
      empty: ["!!!", "🚀🚀", "", "(note)"].map(companyKey),
    };
  });
  if (!key.ok) check("companyKey exists", false, String(key.e));
  else {
    eq("spellings of one company share a key", [...new Set(key.v.same)], ["acmerobotics"]);
    check('"Co" is part of the name, not a suffix', key.v.co[0] !== key.v.co[1], key.v.co);
    eq("names in other scripts keep keys of their own", new Set(key.v.scripts).size, 4);
    eq("accents do not split a company", key.v.accents[0], key.v.accents[1]);
    eq("a name with no letter or digit has an empty key", key.v.empty, ["", "", "", ""]);
  }
  const scriptsMarked = await attempt(() => {
    const companyKey = fn(C.companyKey, "companyKey");
    return [["काम", "कम"], ["กิน", "กัน"], ["কাম", "কম"], ["கால்", "கல்"], ["がっこう", "かっこう"]].map(([a, b]) => companyKey(a) !== companyKey(b) && !!companyKey(a) && !!companyKey(b));
  });
  eq("names that differ only in a vowel sign (Hindi, Thai, Bengali, Tamil) or a Kana mark keep keys of their own (ROB-11)", scriptsMarked.ok ? scriptsMarked.v : String(scriptsMarked.e), [true, true, true, true, true]);

}

/* ---------- the view queue (lib/viewQueue.ts) ---------- */
console.log("\nThe cap on table views");
{
  const Q = await attempt(() => import("../lib/viewQueue" as string) as Promise<typeof import("../lib/viewQueue")>);
  if (!Q.ok) check("lib/viewQueue.ts exists", false, String(Q.e).slice(0, 200));
  else {
    const { inSlot, shared, MAX_ACTIVE, MAX_WAITING } = Q.v;
    let running = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    const work = () =>
      inSlot(async () => {
        peak = Math.max(peak, ++running);
        await new Promise<void>((open) => gates.push(open));
        running--;
        return "done";
      });
    const flights = Array.from({ length: MAX_ACTIVE + MAX_WAITING + 6 }, () => work().then((v) => v, (e) => (e as { busy?: boolean }).busy === true && "busy"));
    await new Promise((r) => setTimeout(r, 20));
    eq("4 run at once and the rest wait", [MAX_ACTIVE, running], [4, 4]);
    while (running || gates.length) {
      gates.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
    }
    const got = await Promise.all(flights);
    eq("50 wait their turn and are served, and the 6 past that are told to come back", [got.filter((x) => x === "done").length, got.filter((x) => x === "busy").length, peak], [MAX_ACTIVE + MAX_WAITING, 6, 4]);

    // One build per member, unless the state changed after it began.
    let version = 0;
    let builds = 0;
    const map = new Map<string, { p: Promise<number>; started: number | null }>();
    const opens: (() => void)[] = [];
    const release = () => opens.splice(0).forEach((open) => open());
    const build = () =>
      shared(map, "member", () => version, async () => {
        const n = ++builds;
        await new Promise<void>((open) => opens.push(open));
        return n;
      });
    const first = Array.from({ length: 120 }, build);
    release();
    eq("120 loads from one member at once are one build", [new Set(await Promise.all(first)).size, builds], [1, 1]);
    const a = build();
    version++; // the member's action landed while that build was running
    const b = build();
    release();
    eq("a load that follows a change does not get the build that began before it", [await a, await b], [2, 3]);
    await new Promise((r) => setTimeout(r, 0));
    eq("nothing is left behind", map.size, 0);
  }
}

/* ---------- 503, never an empty table (lib/apiGuard.ts) ---------- */
console.log("\nThe answer when Merlin cannot serve");
{
  const G = await attempt(() => import("../lib/apiGuard" as string) as Promise<typeof import("../lib/apiGuard")>);
  if (!G.ok) check("lib/apiGuard.ts exists", false, String(G.e).slice(0, 200));
  else {
    const down = await G.v.guarded(async () => {
      throw Object.assign(new Error("state"), { unavailable: true });
    })();
    eq("a route answers 503 with Retry-After and a plain message", [down.status, down.headers.get("retry-after"), ((await down.json()) as { error: string }).error], [503, "60", G.v.DOWN_MESSAGE]);
    const busy = await G.v.guarded(async () => {
      throw Object.assign(new Error("busy"), { busy: true });
    })();
    eq("a full view queue is a 503 to retry in a moment", [busy.status, busy.headers.get("retry-after")], [503, "2"]);
    const other = await attempt(() => G.v.guarded(async () => { throw new Error("a bug"); })());
    check("any other error is still an error", !other.ok);
    const copy = [G.v.DOWN_MESSAGE, G.v.BUSY_MESSAGE].join(" ");
    check("the messages have no em dash, colon or semicolon", !/[—:;]/.test(copy), copy);
  }
}

/* ---------- an action's answer on the page (app/ui/shared.tsx patchView) ---------- */
console.log("\nAn action's answer on the page's copy of the table");
{
  const S = await attempt(() => import("../app/ui/shared" as string) as Promise<typeof import("../app/ui/shared")>);
  if (!S.ok) check("app/ui/shared.tsx loads", false, String(S.e).slice(0, 200));
  else {
    const { patchView } = S.v;
    type V = Parameters<typeof patchView>[0];
    const co = (id: string, name: string, score: number, hq = "Austin, TX") =>
      ({ id, name, hidden: false, cells: { hq: { s: "value", v: hq, mine: false, ver: 0, iv: false } }, engagements: [], people: [], following: false, friendly: { score }, facts: { known: 1, locked: 0, missing: 0 } }) as unknown as V["companies"][number];
    const a = co("c-a", "Alder", 50);
    const b = co("c-b", "Birch", 30);
    const c = co("c-c", "Cedar", 10);
    const view = { me: { id: "m1", credits: 5, function: "Sales" }, companies: [a, b, c], ledger: [{ at: "2026-11-01", delta: 1 }], scan: { mine7: 0 }, stats: {} } as unknown as V;
    const b2 = co("c-b", "Birch", 30, "Boise, ID");
    const d = co("c-d", "Dogwood", 40);
    const out = patchView(view, {
      cells: [{ id: "c-a", field: "hq", cell: { s: "value", v: "Reno, NV", mine: true, ver: 0, iv: false } }],
      companies: [b2, d],
      me: { credits: 4, function: "Finance" },
      ledgerNew: [{ at: "2026-11-18", delta: -1 } as never],
      scan: { mine7: 2 } as never,
    });
    eq("a company the answer sends whole takes the place of the one on screen", out.companies.find((x) => x.id === "c-b")?.cells.hq, b2.cells.hq);
    eq("a new one goes where the server lists it (best fit first)", out.companies.map((x) => x.id), ["c-a", "c-d", "c-b", "c-c"]);
    check("a changed cell still lands, and a company nothing touched keeps its object (its rows don't render again)", (out.companies[0].cells.hq as { v: string }).v === "Reno, NV" && out.companies[3] === c && out.companies[0] !== a);
    eq("the member's fields merge, the credit history rows go on top, the scan summary is replaced", [out.me?.credits, out.me?.function, out.me?.id, out.ledger.map((l) => l.at), (out.scan as { mine7: number }).mine7], [4, "Finance", "m1", ["2026-11-18", "2026-11-01"], 2]);
    const b3 = co("c-b", "Birch", 30, "Provo, UT");
    const both = patchView(view, { cells: [{ id: "c-b", field: "hq", cell: { s: "value", v: "Ogden, UT", mine: true, ver: 0, iv: false } }], companies: [b3] });
    eq("when an answer has both, the record built after the action wins over its cells", (both.companies.find((x) => x.id === "c-b")?.cells.hq as { v: string }).v, "Provo, UT");
    check("an answer with nothing in it leaves the page's copy as it was", patchView(view, {}) === view && patchView(view, { companies: [] }) === view);
  }
}

/* ---------- the API's routes (app/api) ---------- */
console.log("\nThe API's routes");
{
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name === "route.ts") found.push(path.relative(path.join(ROOT, "app"), path.dirname(p)).split(path.sep).join("/"));
    }
  };
  walk(path.join(ROOT, "app", "api"));
  // Each answers only with its own proof: the member's cookie, the cron secret, an OAuth token or flow, an unsubscribe signature, Stripe's webhook signature. Health and the counts are public on purpose.
  const KNOWN = [
    // Closing an account (lib/account.ts): the member's cookie (an admin's for the list and Restore); api/account/restore: the restore link's own key.
    "api/account", "api/account/restore",
    // After a proposal or document goes out (lib/close): the member's cookie for their own activity and alert switches.
    "api/activity",
    // Agent access (lib/mcp/log.ts): the member's cookie for their own agents' switches, spend limit and log.
    "api/agent",
    "api/ask",
    // api/billing/ai-pack: the AI usage pack's checkout, the member's cookie (Close and the trial).
    "api/billing", "api/billing/ai-pack", "api/billing/webhook",
    // Check a copy (/check, lib/seal.ts): public on purpose; the PDF is hashed in memory and kept nowhere, and the answer names only who signed and when.
    "api/check",
    // Documents to sign (lib/documents): the member's cookie for their own uploads; api/documents/file: the member's cookie, the signer's own signing link, or the finished copy's link.
    "api/documents", "api/documents/file",
    // Evidence Bank (lib/evidence): the member's cookie for their own cases; Close only.
    "api/evidence", "api/evidence/closest",
    // A link in the weekly email or an email's footer: a signed grant for one member, 7 days, used once (lib/emailIn.ts); it only ever goes to a path in the app.
    "api/go",
    "api/health", "api/integrations",
    // [google network] Your network (lib/google): the member's cookie, and Google's OAuth flow (a one-time state bound to the member and the browser).
    "api/integrations/google", "api/integrations/google/callback", "api/integrations/google/start",
    // Granola (lib/granola): the member's cookie for their own key and calls; off (404) unless RN_GRANOLA=1.
    "api/integrations/granola/[op]",
    "api/integrations/slack/callback", "api/integrations/slack/start",
    // A company's logo by its public id, as image bytes (lib/logo.ts): public on purpose, it names nothing.
    "api/logo/[id]",
    "api/mcp",
    // Drafting a reply in Messages with Merlin's AI (lib/messagesAi.ts): the member's cookie, Close and the trial, their own conversations only; nothing stored.
    "api/messages",
    "api/oauth/apps", "api/oauth/authorize", "api/oauth/register", "api/oauth/revoke", "api/oauth/token",
    // Smart ways in (lib/paths): the member's cookie, their own LinkedIn connections only.
    "api/paths",
    // Proposals (lib/proposals): the member's cookie for their own; api/sign: the signer's signed link (one send, 30 days) is the only key.
    "api/proposals",
    // Merlin drafting and changing a proposal, live (lib/proposals/live.ts): the member's cookie, and only their own jobs.
    "api/proposals/live",
    // My templates (lib/proposals/mine.ts): a past proposal the member uploads, read into sections, their cookie only.
    "api/proposals/template",
    // The radar: Send now (an admin's cookie), and the email's open pixel and tracked links (the radar's signature; a click only ever goes to a path in the app).
    "api/radar", "api/radar/go", "api/radar/open",
    // api/sign/pdf: the sealed PDF of a signed proposal, with the signed copy's own link.
    "api/sign",
    // The signing page's reading beacons (lib/close): a valid, live signing link is the only key; a random reader cookie, never the IP.
    "api/sign/activity", "api/sign/pdf",
    // api/table/jobs: Automatic jobs (lib/jobs.ts), the card and cadence changes (an admin's cookie), and the scheduler's own look (a key only this process holds).
    "api/table", "api/table/jobs", "api/table/lookup", "api/table/names", "api/table/scan", "api/table/unsubscribe",
  ];
  eq("the API has exactly the routes Merlin uses (a new one is added to this list on purpose)", found.sort(), KNOWN);
  check("none of the old job-board routes is back (jobs, crawl, prospects, profile)", !found.some((r) => /^api\/(jobs|crawl|prospects|profile)(\/|$)/.test(r)), found);
}

/* ---------- a damaged state file (lib/table.ts loadState) ---------- */
console.log("\nA first start");
child("first", freshDir("first"), S3_ENV);

console.log("\nA good state file");
child("file", preparedDir("file"), S3_ENV);

console.log("\nA state file cut short, with a backup");
{
  const d = preparedDir("cut");
  const size = cutInHalf(path.join(d, "intel.json"));
  child("restored", d, { ...S3_ENV, EXPECT_ASIDE: String(size) });
}

console.log("\nA state file that parses but is not a state, with a backup");
{
  const d = preparedDir("shape");
  writeFileSync(path.join(d, "intel.json"), '{"ledger":5,"companies":"none"}');
  child("restored", d, { EXPECT_ASIDE: "31" });
}

console.log("\nA state file that is gone, with backups left");
{
  const d = preparedDir("gone");
  rmSync(path.join(d, "intel.json"));
  child("restored", d);
}

console.log("\nA state file cut short, and the newest backup cut short too");
{
  const d = preparedDir("older");
  const size = cutInHalf(path.join(d, "intel.json"));
  const [today] = backupsOf(d);
  copyFileSync(path.join(d, "backups", today), path.join(d, "backups", "intel-2026-01-01.json"));
  cutInHalf(path.join(d, "backups", today));
  child("restored", d, { EXPECT_ASIDE: String(size) });
}

console.log("\nA state file cut short, with no backup");
{
  const d = preparedDir("refuse");
  cutInHalf(path.join(d, "intel.json"));
  rmSync(path.join(d, "backups"), { recursive: true });
  child("refuse", d, S3_ENV);
  console.log("  and after a restart");
  child("refuse", d, S3_ENV);
}

console.log("\nA state file cut short, and every backup cut short");
{
  const d = preparedDir("allbad");
  cutInHalf(path.join(d, "intel.json"));
  for (const f of backupsOf(d)) cutInHalf(path.join(d, "backups", f));
  child("refuse", d, { ...S3_ENV, EXPECT_BACKUPS: "1" });
}


console.log("\nA state file that is valid JSON but holds no state ({}), with a backup");
{
  const d = preparedDir("emptyobj");
  writeFileSync(path.join(d, "intel.json"), "{}");
  child("restored", d, { ...S3_ENV, EXPECT_ASIDE: "2" });
}

console.log("\nAnother app's JSON put back as the state file, with a backup");
{
  const d = preparedDir("foreign");
  const body = '{"acme.com":{"name":"Acme"}}';
  writeFileSync(path.join(d, "intel.json"), body);
  child("restored", d, { ...S3_ENV, EXPECT_ASIDE: String(body.length) });
}

console.log("\nA state file that holds no state ({}), with no backup");
{
  const d = preparedDir("emptynobackup");
  writeFileSync(path.join(d, "intel.json"), "{}");
  rmSync(path.join(d, "backups"), { recursive: true });
  child("refuse", d, S3_ENV);
}

console.log("\nHealth checks that come together");
child("healthRace", freshDir("healthrace"));

console.log("\nShared hosts, marked scripts and short titles, on a table");
child("addMore", freshDir("addmore"));
console.log("\nA change that fails");
child("flush", freshDir("flush"));

/* ---------- the seed ---------- */
console.log("\nThe seed");
{
  const nowhere = freshDir("nowhere"); // no data/ folder here, so no seed can be found from the working folder
  child("seedRequired", freshDir("seed1"), { RN_REQUIRE_SEED: "1", RN_INTEL_SEED: path.join(nowhere, "none.json") }, nowhere);
  child("seedDemo", freshDir("seed2"), { RN_INTEL_SEED: path.join(nowhere, "none.json") }, nowhere);
  child("seedWarn", freshDir("seed3"), { RN_ID_SECRET: "" });
  child("seedWarn", freshDir("seed4"));
}

/* ---------- Add and fields, on a table ---------- */
console.log("\nAdd and fields, on a table");
child("add", freshDir("add"));

/* ---------- the weekly email ---------- */
console.log("\nThe weekly email");
child("digest", freshDir("digest"), { RESEND_API_KEY: "test-key", RN_EMAIL_FROM: "Merlin <post@example.com>", RN_PUBLIC_URL: "https://post.example.com" });

/* =====================================================================================
 * Over HTTP, against servers started here.
 * ===================================================================================== */

const PORT = Number(process.env.ROBUST_PORT ?? 4599);
const BASE = `http://localhost:${PORT}`;
const ID_SECRET = "robust-secret";

/** A seed big enough that one view is a real piece of work (about 2 MB of JSON). */
const BIG = 300;
const bigSeed = {
  builtAt: new Date(Date.now() - 20 * DAY).toISOString(),
  members: Array.from({ length: BIG }, (_, i) => ({ id: `fm${i}`, name: `Fixture Member${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, email: `fm${i}@example.com`, title: "Fractional VP Sales", token: `fixtok-${i}` })),
  companies: Array.from({ length: 1800 }, (_, i) => ({ id: `c_fx${i}`, fields: { name: `Fixture Company ${i}`, website: `fixture${i}.example.com`, industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", hq: "Austin, TX" } })),
  engagements: Array.from({ length: 1800 }, (_, i) => ({
    id: `e_fx${i}`,
    companyId: `c_fx${i}`,
    fields: { source: "Published engagement", function: "Sales", type: "Fractional", role: "Fractional VP Sales", status: "Active", start: "2025-03", rate: "$8k/mo", hours: "15" },
  })),
  contacts: [],
};

let server: ChildProcess | null = null;
let serverLog = "";
async function startServer(dataDir: string, seedFile: string) {
  serverLog = "";
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: cleanEnv({ RN_DATA_DIR: dataDir, RN_INTEL_SEED: seedFile, RN_ID_SECRET: ID_SECRET, RN_CRON_SECRET: "qa-cron" }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (b) => (serverLog += b));
  server.stderr?.on("data", (b) => (serverLog += b));
  for (let i = 0; i < 150; i++) {
    const up = await fetch(`${BASE}/api/health`).then((r) => r.status, () => 0);
    if (up) return true;
    if (server.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
async function stopServer() {
  const s = server;
  server = null;
  if (!s || s.exitCode !== null) return;
  await new Promise<void>((done) => {
    s.once("exit", () => done());
    s.kill("SIGTERM");
    setTimeout(() => s.kill("SIGKILL"), 3000);
  });
}
process.on("exit", () => server?.kill("SIGKILL"));

let ipN = 0;
const ip = () => `10.77.${Math.floor(++ipN / 250)}.${(ipN % 250) + 1}`;
async function call(method: string, urlPath: string, o: { token?: string; body?: unknown; raw?: string; ipAddr?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": o.ipAddr ?? ip() };
  if (o.token) headers.cookie = `rn_table=${o.token}`;
  if (o.body !== undefined || o.raw !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(BASE + urlPath, { method, headers, body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)), redirect: "manual" });
  const text = await r.text();
  let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text, headers: r.headers };
}
/** One table load, kept small: a view is about 2 MB, and a burst of them must not be held in memory here. */
async function load(token: string) {
  const r = await fetch(`${BASE}/api/table`, { headers: { cookie: `rn_table=${token}`, "x-forwarded-for": ip() } });
  const text = await r.text();
  return { status: r.status, me: text.match(/"me":\{"id":"([^"]+)"/)?.[1] ?? null, retryAfter: r.headers.get("retry-after"), error: r.status === 200 ? "" : text.slice(0, 200) };
}
/** A POST sent in chunks with no Content-Length. */
function chunkedPost(urlPath: string, size: number): Promise<number> {
  return new Promise((resolve) => {
    const req = httpRequest(BASE + urlPath, { method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked", "x-forwarded-for": ip() } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", () => resolve(0));
    req.write('{"action":{"type":"signal","name":"pro_view","where":"');
    for (let sent = 0; sent < size; sent += 8192) req.write("x".repeat(8192));
    req.end('"}}');
  });
}

if (process.env.ROBUST_HTTP === "0") console.log("\nSKIP the checks over HTTP (ROBUST_HTTP=0)");
else if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) check("the checks over HTTP need a build (run npm run build first)", false);
else {
  const bigSeedPath = path.join(scratch, "big-seed.json");
  writeFileSync(bigSeedPath, JSON.stringify(bigSeed));

  console.log("\nOver HTTP: a healthy server");
  const httpData = freshDir("http-a");
  if (!(await startServer(httpData, bigSeedPath))) check("the test server started", false, serverLog.slice(-600));
  else {
    try {
      const health = await call("GET", "/api/health");
      eq("GET /api/health answers 200 and ok", [health.status, health.json], [200, { ok: true, seed: "ok", state: "ok", disk: "ok" }]);

      const WANT = { "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" };
      for (const p of ["/", "/api/table", "/api/health"]) {
        const r = await call("GET", p);
        const got = Object.fromEntries(Object.keys(WANT).map((k) => [k, r.headers.get(k)]));
        check(`security headers on ${p}`, JSON.stringify(got) === JSON.stringify(WANT) && /max-age=\d+/.test(r.headers.get("strict-transport-security") ?? "") && !r.headers.get("x-powered-by"), {
          ...got,
          hsts: r.headers.get("strict-transport-security"),
          poweredBy: r.headers.get("x-powered-by"),
        });
      }

      // The logo route by an id that names no company: 404 at once, never a redirect, and nothing fetched (no domain to ask about).
      const logo = await call("GET", "/api/logo/c_madeupmadeup");
      check("GET /api/logo/<an id that names no company> answers 204 (no logo, no body), no redirect", logo.status === 204 && !logo.headers.get("location"), { status: logo.status, location: logo.headers.get("location") });

      // Oversized bodies.
      const me = "fixtok-0";
      const big = await call("POST", "/api/table", { token: me, raw: JSON.stringify({ action: { type: "signal", name: "pro_view", where: "x".repeat(70_000) } }) });
      eq("a body over 64 KB is refused with 413", big.status, 413);
      eq("and so is one sent in chunks with no length", await chunkedPost("/api/table", 200_000), 413);
      const fits = await call("POST", "/api/table", { token: me, raw: JSON.stringify({ action: { type: "signal", name: "pro_view", where: "x".repeat(50_000) } }) });
      eq("a body under the limit goes through", fits.status, 200);
      check("the 413 says what to do", /too much/i.test(big.json?.error ?? "") && !/[—:;]/.test(big.json?.error ?? ""), big.json);

      // Signed-out actions.
      const junkIp = ip();
      const junk = [];
      for (let i = 0; i < 70; i++) junk.push((await call("POST", "/api/table", { token: `made-up-${i}`, body: { action: { type: "follow", companyId: "x", on: true } }, ipAddr: junkIp })).status);
      eq("signed-out actions with made-up cookies are limited by address", [junk.slice(0, 60).every((s) => s === 401), junk.slice(60).every((s) => s === 429)], [true, true]);
      const anon = await call("POST", "/api/table", { body: { action: { type: "follow", companyId: "x", on: true } } });
      eq("a signed-out action still gets the sign-in message", [anon.status, anon.json?.error], [401, "You're signed out. Sign in again to add, confirm or unlock."]);
      const still = await call("POST", "/api/table", { token: me, body: { action: { type: "nope" } }, ipAddr: junkIp });
      eq("a member behind that address is not held up by it", [still.status, still.json?.error], [400, "That didn't go through. Refresh the page and try again."]);

      // Names cut on a whole character. (A name is words of letters, so the character pair is a letter outside the basic plane: 76 + 1 + 2 + 2 units, cut at 80 inside the second.)
      const joined = await call("POST", "/api/table", { body: { join: { name: `${"J".repeat(76)} 𠀀𠀀`, email: `robust-${Date.now().toString(36)}@example.com` } } });
      const cookie = (joined.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean);
      const joinedView = cookie ? await call("GET", "/api/table", { token: cookie }) : null;
      check("a joined name cut at 80 never ends in half a character", !!joinedView && well(joinedView.json?.me?.name) && joinedView.json.me.name.length <= 80, joinedView?.json?.me?.name ?? joined.json);
      await call("POST", "/api/table", { token: me, body: { action: { type: "profile", function: "Sales", title: `${"T".repeat(79)}🚀 lead` } } });
      const meView = await call("GET", "/api/table", { token: me });
      check("a title cut at 80 never ends in half a character", well(meView.json?.me?.title) && meView.json.me.title.length === 79, meView.json?.me?.title);

      // The old job-board API is gone: no listing of roles, no crawl, no writes to the volume, whoever asks.
      const legacy = ["/api/jobs", "/api/jobs/seed000000000001", "/api/crawl", "/api/prospects", "/api/prospects/p1", "/api/prospects/scan", "/api/profile"];
      const legacyStatus: Record<string, number[]> = {};
      for (const p of legacy)
        for (const method of ["GET", "POST", "PUT", "PATCH"]) {
          const r = await call(method, p, { token: method === "GET" ? undefined : me, body: method === "GET" ? undefined : { status: "hidden", name: "Made Up" } });
          (legacyStatus[p] ??= []).push(r.status);
        }
      check("the old job-board routes answer 404 to every method, signed in or out", Object.values(legacyStatus).every((s) => s.every((x) => x === 404)), legacyStatus);
      eq("and nothing was written for them", readdirSync(httpData).filter((f) => /jobs|profile|prospects/.test(f)), []);

      // An action's answer carries what changed (viewPatch): the records it touched as the member now sees them, the whole Me,
      // the credit history rows it wrote and the table's version, so the page never downloads the whole table for it.
      const pm = "fixtok-5";
      const pmIp = ip(); // one network: the first visit from a network is noted (a write), which would move the version
      const v0 = await call("GET", "/api/table", { token: pm, ipAddr: pmIp });
      const target = v0.json.companies.find((c: { engagements: { cells: Record<string, { s: string }> }[] }) => c.engagements.some((e) => e.cells.rate?.s === "locked"));
      const seat = target.engagements.find((e: { cells: Record<string, { s: string }> }) => e.cells.rate?.s === "locked");
      // The company first (2 credits): a fact paid at a locked company opens after it.
      if (target.hidden) await call("POST", "/api/table", { token: pm, ipAddr: pmIp, body: { action: { type: "unlock", entity: "company", id: target.id, field: "identity" } } });
      const ver0 = await call("GET", "/api/table", { token: pm, ipAddr: pmIp }); // the first load noted the visit and the network (a write of their own), so start from the next
      const un = await call("POST", "/api/table", { token: pm, ipAddr: pmIp, body: { action: { type: "unlock", entity: "engagement", id: seat.id, field: "rate" } } });
      const v1 = await call("GET", "/api/table", { token: pm, ipAddr: pmIp });
      const fresh = v1.json.companies.find((c: { id: string }) => c.id === target.id);
      eq("an unlock's answer carries the company, built as a fresh view builds it", JSON.stringify(un.json?.companies?.[0]) === JSON.stringify(fresh), true);
      eq("and the whole Me, the same as a fresh view's", JSON.stringify(un.json?.me) === JSON.stringify(v1.json.me), true);
      eq("and the credit history row it wrote", [un.json?.ledgerNew?.length, JSON.stringify(un.json?.ledgerNew?.[0]) === JSON.stringify(v1.json.ledger[0])], [1, true]);
      const vn = (x: string | null | undefined) => Number(String(x ?? "").split(":")[1]);
      eq("an action with nobody else acting moves the table's version by one", [vn(un.json?.version) - vn(ver0.json.version), un.json?.version?.split(":")[0] === ver0.json.version?.split(":")[0]], [1, true]);
      eq("a view says its version in the body and in a header", [typeof v1.json.version, v1.headers.get("x-view-version") === v1.json.version], ["string", true]);
      const fo = await call("POST", "/api/table", { token: pm, ipAddr: pmIp, body: { action: { type: "follow", companyId: target.id, on: true } } });
      eq("a follow's answer carries the company, followed", [fo.json?.companies?.length, fo.json?.companies?.[0]?.following], [1, true]);
      const pr = await call("POST", "/api/table", { token: pm, ipAddr: pmIp, body: { action: { type: "profile", function: "Finance", goal: "roles", title: "Fractional CFO" } } });
      eq("a profile's answer carries the member's answers and no records", [pr.json?.me?.function, pr.json?.me?.goal, pr.json?.me?.title, pr.json?.me?.onboarded, pr.json?.companies?.length], ["Finance", "roles", "Fractional CFO", true, 0]);
      const coName = `Patchwork Analytics ${Date.now().toString(36)}`;
      const ad = await call("POST", "/api/table", { token: pm, ipAddr: pmIp, body: { action: { type: "add", company: coName, companyFields: { hq: "Denver, CO" } } } });
      const v2 = await call("GET", "/api/table", { token: pm, ipAddr: pmIp });
      const added = v2.json.companies.find((c: { name: string }) => c.name === coName);
      eq("an add's answer carries the new company as a fresh view has it", [ad.status, !!added, JSON.stringify(ad.json?.companies?.[0]) === JSON.stringify(added)], [200, true, true]);
      const sv = await call("POST", "/api/table", { token: pm, ipAddr: pmIp, body: { action: { type: "savedView", op: "save", name: "Patch check", place: "?p=hiring", criteria: {} } } });
      check("a saved view's answer carries the member's saved views", sv.status !== 200 || (sv.json?.me?.savedViews ?? []).some((x: { name: string }) => x.name === "Patch check"), sv.json);
      check("a saved view's id is not taken for a record (no partial answer)", sv.status !== 200 || !sv.json?.partial, sv.json);

      // A member's table is kept, compressed, while nothing changes: the same bytes, without a second build.
      const k1 = await call("GET", "/api/table", { token: pm, ipAddr: pmIp });
      const k2 = await call("GET", "/api/table", { token: pm, ipAddr: pmIp });
      eq("two loads with nothing changed in between answer the same table", [k1.headers.get("x-view-version") === k2.headers.get("x-view-version"), k1.text === k2.text], [true, true]);
      const other = await call("GET", "/api/table", { token: "fixtok-6" });
      eq("and another member gets their own", other.json?.me?.id, "fm6");

      // The signed-out counts are kept for a few minutes, whatever members change (lib/table.ts ANON_FRESH).
      const a1 = await call("GET", "/api/table");
      await call("POST", "/api/table", { token: pm, ipAddr: pmIp, body: { action: { type: "add", company: `${coName} Two`, companyFields: { hq: "Boise, ID" } } } });
      const a2 = await call("GET", "/api/table");
      eq("signed-out counts stay put right after a member adds a company", a2.json?.stats?.facts, a1.json?.stats?.facts);
      check("and the signed-out answer carries no records", Array.isArray(a2.json?.companies) && a2.json.companies.length === 0 && a2.json.me === null, a2.json?.me);

      // One-click unsubscribe.
      const hmac = (s: string) => createHmac("sha256", ID_SECRET).update(s).digest("base64url");
      const link = (id: string, sig = hmac(`unsubscribe:${id}`).slice(0, 22)) => `/api/table/unsubscribe?m=${id[0]}_${hmac(id).slice(0, 12)}&s=${sig}`;
      const badSig = await call("POST", link("fm1", "not-the-signature-0000"));
      const oneClick = await call("POST", link("fm1"), { raw: "List-Unsubscribe=One-Click" });
      const after = await call("GET", "/api/table", { token: "fixtok-1" });
      eq("the one-click unsubscribe POST turns the weekly email off, and a bad signature does not", [badSig.status, oneClick.status, after.json?.me?.digest], [400, 200, false]);

      // The cap on views.
      const burst = await Promise.all(Array.from({ length: 150 }, () => load("fixtok-2")));
      eq("150 loads from one member at once all answer", burst.filter((r) => r.status === 200 && r.me === "fm2").length, 150);
      const many = await Promise.all(Array.from({ length: BIG - 10 }, (_, i) => load(`fixtok-${i + 10}`)));
      const ok = many.filter((r, i) => r.status === 200 && r.me === `fm${i + 10}`).length;
      const busy = many.filter((r) => r.status === 503);
      check(`${BIG - 10} members loading at once: some are served and the rest are told to come back (${ok} served, ${busy.length} told)`, ok >= 4 && busy.length >= 1 && ok + busy.length === many.length, many.filter((r) => r.status !== 200 && r.status !== 503).slice(0, 5));
      check("the 503 carries Retry-After and a plain message", busy.length > 0 && busy.every((r) => r.retryAfter === "2" && /"error":"Merlin is busy/.test(r.error)), busy[0]);
      const afterBurst = await call("GET", "/api/table", { token: "fixtok-3" });
      eq("and the server is still up afterwards", [afterBurst.status, afterBurst.json?.companies?.length], [200, 1800 + 2]); // the seed's 1,800 and the two companies added above
    } catch (e) {
      check("the checks on a healthy server ran to the end", false, String((e as Error)?.stack ?? e).slice(0, 600));
    }
    await stopServer();
  }

  console.log("\nOver HTTP: a damaged state file and no backup");
  const bad = freshDir("http-b");
  const damaged = '{"companies":[],"ledger":[{"memberId":"fm1","delta":-3,"reason":"unl';
  writeFileSync(path.join(bad, "intel.json"), damaged);
  if (!(await startServer(bad, bigSeedPath))) check("the test server started", false, serverLog.slice(-600));
  else {
    try {
      const view = await call("GET", "/api/table", { token: "fixtok-1" });
      check("the table answers 503 with a plain message, not an empty table", view.status === 503 && typeof view.json?.error === "string" && !view.json.me && view.headers.get("retry-after") === "60", [view.status, view.json?.error ?? view.text.slice(0, 80)]);
      const act = await call("POST", "/api/table", { token: "fixtok-1", body: { action: { type: "profile", function: "Sales" } } });
      const join = await call("POST", "/api/table", { body: { join: { name: "New Person", email: "new.person@example.com" } } });
      const signIn = await call("POST", "/api/table", { body: { signIn: "fixtok-1" } });
      const anon = await call("GET", "/api/table");
      eq("actions, joining, signing in and the signed-out page all answer 503", [act.status, join.status, signIn.status, anon.status], [503, 503, 503, 503]);
      const health = await call("GET", "/api/health");
      eq("health fails, so a deploy in this state never goes live", [health.status, health.json?.ok, health.json?.state], [503, false, "down"]);
      const unsub = await call("GET", "/api/table/unsubscribe?m=f_x&s=y");
      check("the unsubscribe link answers 503 with a page", unsub.status === 503 && /<h1/.test(unsub.text), [unsub.status, unsub.text.slice(0, 80)]);
      eq("the damaged file is untouched, and nothing was written next to it", [readFileSync(path.join(bad, "intel.json"), "utf8"), readdirSync(bad).filter((f) => !f.startsWith("company-icons")).sort()], [damaged, ["intel.json"]]);
      check("the log names the file", /STATE DOWN/.test(serverLog) && serverLog.includes(path.join(bad, "intel.json")), serverLog.slice(-300));
    } catch (e) {
      check("the checks on a damaged state ran to the end", false, String((e as Error)?.stack ?? e).slice(0, 600));
    }
    await stopServer();
  }
}

rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
