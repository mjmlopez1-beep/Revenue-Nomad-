/**
 * Checks of Agent access (lib/mcp/agentTools.ts, lib/mcp/log.ts, app/api/agent, the wrap in
 * lib/mcp/server.ts, app/post/agent/AgentAccess.tsx). No server: lib/table.ts runs in process on a
 * made-up seed in a temporary data dir, and the connector is driven by the SDK's own client over
 * an in-memory transport, as Claude would drive it.
 *
 *   npx tsx scripts/test-agent.mts      exits 1 on any failure
 *
 * Covered:
 *   - every tool the connector registers is in the page's catalog, in one of the four groups;
 *     unlock's kinds come from what is unlocked, never which record;
 *   - a switched-off tool, unlock kind or group refuses in plain words and does nothing; it stays
 *     in the tool list; switched back on it works;
 *   - the log keeps the tool, when, credits, outcome and app: never an argument, a search, an id or
 *     anything a tool returned; asked, refused, off and stopped are told apart;
 *   - the daily spend limit: a quote says when a spend would pass it, a confirm past it spends
 *     nothing, it holds across calls, across agents and for calls at the same moment; raised, the
 *     spend goes through;
 *   - the page's view: use in 30 days, today's requests and credits per agent, the week's counts;
 *   - the switches and the limit only take what the page offers;
 *   - the admin export keeps the settings and leaves the log out; the purge deletes both;
 *   - the page: ?p=claude and ?p=agent land on it in the new look, the old look keeps
 *     Integrations; Example rows are labelled and never sent; no export button; the words.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rn-agent-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

const co = (id: string, name: string, site: string, f: Record<string, string>) => ({ id, fields: { name, website: site, hq: "Denver, CO", ...f } });
const companies = [
  co("c_northwind", "Northwind Clinics", "northwindclinics.example", { industry: "Health Care", employees: "201–500", revenue: "$20M–$50M" }),
  co("c_cedar", "Cedar and Pine", "cedarandpine.example", { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M" }),
  co("c_halcyon", "Halcyon Freight", "halcyonfreight.example", { industry: "Logistics", employees: "201–500", revenue: "$20M–$50M" }),
  co("c_larkspur", "Larkspur Learning", "larkspurlearning.example", { industry: "EdTech", employees: "51–200", revenue: "$5M–$20M" }),
];
const engagements = companies.map((c, i) => ({
  id: `e_seat_${i}`,
  companyId: c.id,
  verified: false,
  fields: { source: "Member success story", operator: "Sam Example", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2024-02", end: "2024-12", status: "Ended" },
}));
const contacts = [{ id: "p_dana", companyId: "c_cedar", engagementId: null, fields: { name: "Dana Whitfield", title: "CEO", relationship: "Decision maker", email: "dana@cedarandpine.example" } }];
const M = (id: string, name: string, title: string) => ({ id, name, email: `${id}.agent@example.com`, title, token: `tok-${id}-agent` });
const members = [M("mem_jordan", "Jordan Avery", "Fractional VP Sales"), M("mem_riley", "Riley Stone", "Fractional CMO")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies, engagements, contacts }));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: {}, profiles: { mem_jordan: { onboarded: true, function: "Sales", title: "Fractional VP Sales" }, mem_riley: { onboarded: true, function: "Marketing", title: "Fractional CMO" } }, members: [] }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 5).toString("base64"),
  RN_ID_SECRET: "test-id-secret-agent",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_BILLING", "RN_GRANOLA", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const src = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

async function main() {
  const t = await import("../lib/table");
  const A = await import("../lib/mcp/agentTools");
  const L = await import("../lib/mcp/log");
  const S = await import("../lib/mcp/server");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

  const member = async (id: string) => (await t.memberById(id))!;
  async function agent(id: string, app: string) {
    const server = S.makeServer({ member: await member(id), origin: "https://post.example.com", app });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const client = new Client({ name: "qa-agent", version: "1" });
    await client.connect(a);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
      const text = r.content?.[0]?.text ?? "";
      let out: Record<string, unknown> = {};
      try {
        out = JSON.parse(text);
      } catch {
        /* words */
      }
      return { text, out, isError: !!r.isError };
    };
    return { client, call, server };
  }
  const state = () => t.loadState();
  const rows = async (id: string) => L.rowsIn(await state(), id);

  console.log("\nThe catalog");
  {
    const j = await agent("mem_jordan", "Claude");
    const names = (await j.client.listTools()).tools.map((x) => x.name);
    const catalog = new Set(A.AGENT_TOOLS.map((x) => x.tool));
    check("every tool the connector registers is on the page, in a group", names.every((n) => catalog.has(n)), names.filter((n) => !catalog.has(n)));
    check("  and every group has tools: read, add, spend (four kinds of unlock), send", A.AGENT_GROUPS.every((g) => A.AGENT_TOOLS.some((x) => x.group === g.id)) && A.AGENT_TOOLS.filter((x) => x.group === "spend").length === 4);
    check("unlock's kind comes from what is unlocked", JSON.stringify(A.keysOf("unlock", { entity: "company", id: "x", field: "identity" })) === '["unlock:company"]' && JSON.stringify(A.keysOf("unlock", { entity: "person", id: "x", field: "email" })) === '["unlock:contact"]' && JSON.stringify(A.keysOf("unlock", { entity: "person", id: "x", field: "title" })) === '["unlock:person"]' && A.keysOf("unlock", { entity: "company", id: "x", field: "everything" }).length === 4 && JSON.stringify(A.keysOf("unlock", { entity: "seat", id: "x", field: "rate" })) === '["unlock:fact"]');
    check("spending and sending ask first: their tools say so", A.AGENT_TOOLS.filter((x) => x.group === "spend" || x.group === "send").every((x) => /^Asks first/.test(A.askWords(x))));
    check("the words: plain, no dashes as punctuation, no exclamation marks", A.AGENT_TOOLS.every((x) => !/[!—–]| - /.test(x.name + x.d + x.did + (x.asked ?? ""))) && !/[!—–]/.test(A.offWords("g:spend", "https://post.example.com/?p=agent")));
    await j.client.close();
  }

  console.log("\nSwitched off");
  {
    const j = await agent("mem_jordan", "Claude");
    const first = await j.call("search_companies", { query: "Cedar", limit: 3 });
    check("a read works and leaves a row", !first.isError && (await rows("mem_jordan")).at(-1)?.t === "search_companies" && (await rows("mem_jordan")).at(-1)?.o === "ok");
    await L.setPrefs("mem_jordan", { key: "search_companies", on: false });
    const off = await j.call("search_companies", { query: "Cedar", limit: 3 });
    const offSaid = String(off.out.error ?? "");
    check("a switched-off tool refuses in plain words, and says where to turn it back on", off.isError && /^"Search companies" is switched off for agents\. The member switched this off on Merlin's Agent access page, so nothing was done\./.test(offSaid) && /\?p=agent$/.test(offSaid) && !/Cedar/.test(off.text), off.text);
    check("  it does nothing (no companies came back), and its row says off", !Array.isArray(off.out.companies) && (await rows("mem_jordan")).at(-1)?.o === "off");
    check("  it stays in the tool list", (await j.client.listTools()).tools.some((x) => x.name === "search_companies"));
    check("  another tool still works", !(await j.call("my_account")).isError);
    await L.setPrefs("mem_jordan", { key: "g:read", on: false });
    const grp = await j.call("get_company", { company: "c_x" });
    check("a group switched off stops each of its tools", grp.isError && /Read tools are switched off/.test(grp.text), grp.text);
    check("  and not the other groups' tools", !/switched off/.test((await j.call("follow_company", { company: "nope", on: true })).text));
    await L.setPrefs("mem_jordan", { key: "g:read", on: true });
    await L.setPrefs("mem_jordan", { key: "search_companies", on: true });
    check("switched back on, it works again", !(await j.call("search_companies", { limit: 2 })).isError);
    await L.setPrefs("mem_jordan", { key: "unlock:contact", on: false });
    const ids = ((await j.call("search_companies", { limit: 10 })).out.companies as { id: string }[]).map((x) => x.id);
    const quoteCo = await j.call("unlock", { entity: "company", id: ids[0], field: "identity" });
    const contact = await j.call("unlock", { entity: "person", id: "anyone", field: "email" });
    check("one kind of unlock off: that kind refuses, a company still quotes", !quoteCo.isError && quoteCo.out.confirmed === false && contact.isError && /^"Open a contact detail" is switched off/.test(String(contact.out.error)), [quoteCo.text.slice(0, 120), contact.text]);
    await L.setPrefs("mem_jordan", { key: "unlock:contact", on: true });
    await j.client.close();
  }

  console.log("\nThe daily spend limit");
  {
    const j = await agent("mem_jordan", "Claude");
    const ids = ((await j.call("search_companies", { limit: 10 })).out.companies as { id: string }[]).map((x) => x.id);
    check("setup: four locked companies to open", ids.length >= 4, ids.length);
    await L.setPrefs("mem_jordan", { limit: 5 });
    const credits0 = (await j.call("my_account")).out.credits as number;
    const a = await j.call("unlock", { entity: "company", id: ids[0], field: "identity", confirm: true });
    const b = await j.call("unlock", { entity: "company", id: ids[1], field: "identity", confirm: true });
    check("under the limit, spends go through (2 credits each)", a.out.confirmed === true && b.out.confirmed === true && (await j.call("my_account")).out.credits === credits0 - 4, [a.text.slice(0, 160), b.text.slice(0, 160)]);
    const quote = await j.call("unlock", { entity: "company", id: ids[2], field: "identity" });
    check("a quote past the limit says so before any yes", quote.out.confirmed === false && /over the member's daily limit for agents \(5 credits, 4 spent today\)/.test(String(quote.out.message)), quote.out.message);
    const stop = await j.call("unlock", { entity: "company", id: ids[2], field: "identity", confirm: true });
    check("a confirm past the limit spends nothing, in plain words", stop.isError && /That would spend 2 credits, and the member's agents may spend 5 a day \(4 spent today\)\. Nothing was spent\./.test(stop.text) && (await j.call("my_account")).out.credits === credits0 - 4, stop.text);
    const last = (await rows("mem_jordan")).filter((r) => r.t === "unlock:company").at(-1);
    check("  its row says stopped, with what it asked to spend", last?.o === "limit" && last.q === 2 && !last.c, last);
    const other = await agent("mem_jordan", "Cursor");
    const stop2 = await other.call("unlock", { entity: "company", id: ids[3], field: "identity", confirm: true });
    check("the limit holds across agents: another app is stopped too", stop2.isError && /may spend 5 a day/.test(stop2.text));
    await L.flushAgentLog();
    const j2 = await agent("mem_jordan", "Claude");
    check("and across calls once the log is written", /may spend 5 a day \(4 spent today\)/.test((await j2.call("unlock", { entity: "company", id: ids[2], field: "identity", confirm: true })).text));
    await L.setPrefs("mem_jordan", { limit: 10 });
    const go = await j2.call("unlock", { entity: "company", id: ids[2], field: "identity", confirm: true });
    check("raised to 10, the spend goes through", go.out.confirmed === true && (await j2.call("my_account")).out.credits === credits0 - 6, go.text.slice(0, 200));
    await L.setPrefs("mem_jordan", { limit: null });
    check("no limit: as before, every spend still asks first", (await j2.call("unlock", { entity: "company", id: ids[3], field: "identity" })).out.confirmed === false);
    // Riley: three spends at the same moment against a limit of 5: two go through, one is stopped.
    await L.setPrefs("mem_riley", { limit: 5 });
    const r = await agent("mem_riley", "Claude");
    const rid = ((await r.call("search_companies", { limit: 10 })).out.companies as { id: string }[]).map((x) => x.id);
    const together = await Promise.all(rid.slice(0, 3).map((id) => r.call("unlock", { entity: "company", id, field: "identity", confirm: true })));
    check("calls at the same moment: the limit still holds (two of three go through)", together.filter((x) => x.out.confirmed === true).length === 2 && together.filter((x) => x.isError && /may spend 5 a day/.test(x.text)).length === 1, together.map((x) => x.text.slice(0, 80)));
    for (const x of [j, other, j2, r]) await x.client.close();
  }

  console.log("\nThe log keeps no arguments");
  {
    await L.flushAgentLog();
    const s = await state();
    const log = JSON.stringify(s.connector?.log ?? {});
    const ids = (await t.buildView("tok-mem_jordan-agent", { fresh: true })).companies.map((c) => c.id);
    check("saved: rows for both members", (s.connector?.log?.mem_jordan?.length ?? 0) > 10 && (s.connector?.log?.mem_riley?.length ?? 0) > 0);
    check("each row has only when, the tool, outcome, credits, asked-for credits and the app", (s.connector?.log?.mem_jordan ?? []).every((x) => Object.keys(x).every((k) => ["at", "t", "o", "c", "q", "a"].includes(k))), s.connector?.log?.mem_jordan?.[0]);
    check("no search, no id, no name, no field, no answer in it", !/Cedar|Northwind|Halcyon|Larkspur|Dana|identity|email|query|\.example/.test(log) && !ids.some((id) => log.includes(id)), log.slice(0, 300));
    check("the tools are the switch keys only", (s.connector?.log?.mem_jordan ?? []).every((x) => A.TOOL_BY_KEY.has(x.t)));
    const outcomes = new Set((s.connector?.log?.mem_jordan ?? []).map((x) => x.o));
    check("done, asked, off, refused and stopped are told apart", ["ok", "asked", "off", "limit"].every((o) => outcomes.has(o as never)), [...outcomes]);
    check("the app is the agent's name, as it registered", (s.connector?.log?.mem_jordan ?? []).some((x) => x.a === "Cursor") && (s.connector?.log?.mem_jordan ?? []).some((x) => x.a === "Claude"));
  }

  console.log("\nThe page's view");
  {
    const apps = [{ id: "g1", name: "Claude", connectedAt: iso(-3 * DAY), lastUsedAt: iso(-60_000) }, { id: "g2", name: "Cursor", connectedAt: iso(-DAY), lastUsedAt: iso(-60_000) }];
    const v = L.agentViewIn(await state(), "mem_jordan", apps, { network: false, paths: true, granola: false }, null);
    check("today's spend by all agents: 6 credits", v.spentToday === 6, v.spentToday);
    check("each tool's use in 30 days", (v.tools.find((x) => x.key === "unlock:company")?.used30 ?? 0) >= 6 && (v.tools.find((x) => x.key === "search_companies")?.used30 ?? 0) >= 3);
    check("each agent's requests and credits today", v.apps[0].requestsToday > 5 && v.apps[0].creditsToday === 6 && v.apps[1].requestsToday === 1 && v.apps[1].creditsToday === 0, v.apps);
    check("the week's counts by tab add up", v.week.all === v.week.read + v.week.add + v.week.spend + v.week.out && v.week.spend >= 6);
    check("tools this Merlin doesn't offer are left out (Google network, Granola)", !v.tools.some((x) => x.key === "save_my_network" || x.key === "list_granola_calls") && v.tools.some((x) => x.key === "ways_in"));
    check("newest first, and the oldest row is when counting began", Date.parse(v.log[0].at) >= Date.parse(v.log.at(-1)!.at) && !!v.since);
    const w = A.rowWords({ at: iso(0), t: "unlock:company", o: "limit", q: 2 }, 5);
    check("a stopped row reads as the mockup's", w.kind === "Stopped" && w.t === "Stopped at your daily limit" && /Limit is 5 credits/.test(w.s) && w.c === "Not spent");
    check("rows older than 90 days go", L.pruned([{ at: iso(-91 * DAY), t: "my_account", o: "ok" }, { at: iso(-DAY), t: "my_account", o: "ok" }], t0).length === 1);
  }

  console.log("\nOnly what the page offers");
  {
    const bad = await L.setPrefs("mem_jordan", { key: "drop_tables", on: false }).then(() => null, (e: Error) => e.message);
    const badLimit = await L.setPrefs("mem_jordan", { limit: 7 }).then(() => null, (e: Error) => e.message);
    check("a switch that isn't a tool is refused", bad === "That isn't one of your agents' tools.", bad);
    check("a limit that isn't one of 5, 10, 25 or 50 is refused", /Pick 5, 10, 25, 50 credits a day, or no limit/.test(badLimit ?? ""), badLimit);
    await L.setPrefs("mem_jordan", { key: "g:send", on: false });
    {
      // The daily spend limit: none until the member picks one; a picked limit is kept.
      const fresh = { connector: { agent: {} } } as never;
      check("a member who never picked has no limit (the owner's default)", L.DEFAULT_LIMIT === null && L.prefsIn(fresh, "mem_new").limit === null);
      const picked = { connector: { agent: { mem_x: { off: [], limit: 25 } } } } as never;
      check("a member who picked a limit keeps it", L.prefsIn(picked, "mem_x").limit === 25);
    }
    check("a switch is kept for the member, sorted, with when", JSON.stringify(L.prefsIn(await state(), "mem_jordan").off) === '["g:send"]' && !!L.prefsIn(await state(), "mem_jordan").at);
  }

  console.log("\nExport and purge");
  {
    const ex = await t.exportState();
    check("the admin export keeps the switches and the limit, never the log", !!ex.connector?.agent?.mem_jordan && !ex.connector?.log && !JSON.stringify(ex).includes('"o":"limit"'));
    await t.tableInternals.mutate((s, seed) => t.tableInternals.purgeMember(s, seed, "mem_jordan", new Date().toISOString()));
    const s = await state();
    check("account closure's purge deletes the member's switches, limit and log", !s.connector?.agent?.mem_jordan && !s.connector?.log?.mem_jordan);
    check("  another member's stay", !!s.connector?.agent?.mem_riley && (s.connector?.log?.mem_riley?.length ?? 0) > 0);
  }

  console.log("\nThe page");
  {
    const pages = src("app/post/shell/pages.tsx");
    const place = src("app/post/place.ts");
    const page = src("app/post/agent/AgentAccess.tsx");
    check("?p=claude and ?p=agent land on Agent access in the new look; the old look keeps Integrations", /claude: "agent"/.test(place) && /agent: \{ title: "Agent access", component: AgentP/.test(pages) && /c\.ui2 \? <AgentAccessL \/> : <IntegrationsP \/>/.test(pages));
    check("it reads GET /api/agent and revokes through /api/oauth/apps", /fetch\("\/api\/agent"/.test(page) && /send\("\/api\/oauth\/apps", \{ revoke: id \}\)/.test(page));
    check("the first visit: three steps with the address to copy, what it can and cannot do, Check the connection", /Copy your address/.test(page) && /Sign in to Merlin and allow it/.test(page) && /It cannot/.test(page) && /Check the connection/.test(page));
    check("Example rows are labelled Example and drawn only while the log is empty, never sent", /EXAMPLE_ROWS/.test(page) && />Example</.test(page) && /const examples = view\.log\.length === 0/.test(page) && !/EXAMPLE_ROWS[^\n]*fetch|send\([^)]*EXAMPLE/.test(page));
    check("the rule is said once, plainly: spending and sending always ask first", /Two things always ask first: spending credits and sending for signature\./.test(page));
    check("no export, no CSV, no download (owner's rule)", !/Export CSV|\.csv|download/i.test(page));
    check("the earning pill is the only volt; no volt button", !/btn-volt/.test(page));
    // What a member reads: the quoted strings and the JSX text (not the code around them).
    const words = [...page.matchAll(/"((?:[^"\\\n]|\\.)*)"/g), ...page.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)].map((m) => m[1]).join("\n");
    check("the page's words: no exclamation marks, no dashes as punctuation", words.length > 4000 && !/!|—|–| - /.test(words), words.match(/.{0,40}(!|—|–| - ).{0,40}/)?.[0]);
    const docs = src("docs/data-flows.md");
    const data = src("app/data/DataFlows.tsx");
    check("docs/data-flows.md and the /data page say what the log keeps and who sees it", /### Agent access/.test(docs) && /Never an argument, a search, an id, a name or anything a tool returned/.test(docs) && /purgeMember/.test(docs) && /Inside Merlin: your agents/.test(data) && /Never what\s+it asked for or what came back/.test(data));
  }
}

main()
  .catch((e) => {
    failures++;
    console.log(`FAIL threw: ${String(e?.stack ?? e).slice(0, 800)}`);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
