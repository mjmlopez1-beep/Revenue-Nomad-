/**
 * Workflow approval and outbox safety (lib/workflows/graphRun.ts, lib/send): the waiting state is
 * written before the member is told, and told once (a durable key per run and step, so a second
 * pass after an interruption sends no second email or bell line); a workflow's note is queued once
 * per key whatever became of it (approved, queued, sent); an expired approval is refused where the
 * member taps, before the scheduler gets to it; waiting runs are never trimmed away by the run
 * history's limits; with Gmail sending off the member is told of a draft only when there is one;
 * with Merlin's AI off an "AI: write" step never queues its own instruction as the note; and nothing
 * leaves without the member's tap, under retries and concurrent passes. In process, on a made-up
 * seed in a temporary data dir, with fetch replaced.
 *
 *   npx tsx scripts/test-wfsafe.mts      exits 1 on any failure
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-wfsafe-"));
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const ORIGIN = "https://post.example.com";
const seed = {
  builtAt: iso(t0 - 60 * DAY),
  members: [{ id: "mem_c", name: "Casey Close", email: "casey@close.example", title: "Fractional COO", token: "tok-c-000000001" }],
  companies: [
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Hospitals and Health Care", employees: "51-200", hq: "Denver, CO" } },
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarpine.example", industry: "Software Development", employees: "11-50", hq: "Austin, TX" } },
  ],
  engagements: [{ id: "e_north_ops", companyId: "c_north", fields: { source: "Published engagement", role: "Fractional COO", function: "Operations", type: "Fractional", start: "2025-01", status: "Active" } }],
  contacts: [{ id: "p_cedar_ceo", companyId: "c_cedar", fields: { name: "Morgan Hale", title: "CEO", relationship: "Decision maker" } }],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const seen = iso(t0 - 2 * DAY);
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Northwind is open for Casey; Cedar and Pine stays locked.
    unlocks: { "c_north.identity": ["mem_c"] },
    seen: { mem_c: seen },
    profiles: { mem_c: { function: "Operations", onboarded: true } },
    follows: {},
    connector: { clients: [], grants: [], alerts: { mem_c: [{ id: "al_casey001", name: "Every company", createdAt: seen, place: "v=all&t=companies", alert: { on: false, triggers: ["role"], every: "instant", email: false, slack: false, bell: false } }] } },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "40",
  RN_PUBLIC_URL: ORIGIN,
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_WORKFLOWS: "1",
  RN_WORKFLOWS_V2: "1",
  RESEND_API_KEY: "re_test_key",
  RN_EMAIL_FROM: "Merlin <alerts@merlin.example>",
});
// Billing off (every plan feature on); Merlin's AI off (no RN_AI_DRAFTS, no key); Gmail sending switched on below, per check.
for (const k of ["RN_BILLING", "RN_FREE_COMPANY", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_ADMIN_EMAILS", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_SEND", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RN_GOOGLE", "RN_GOOGLE_API_TEST"]) delete process.env[k];
const sendSwitch = (on: boolean) => {
  if (on) Object.assign(process.env, { RN_SEND: "1", GOOGLE_CLIENT_ID: "client-test.apps.example", GOOGLE_CLIENT_SECRET: "secret-test" });
  else for (const k of ["RN_SEND", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) delete process.env[k];
};

type Call = { url: string; body: Record<string, unknown>; raw: string };
const calls: Call[] = [];
/** Called as each email goes to the email API, before it answers: what the state on disk says at that moment. */
let onEmail: ((c: Call) => void) | null = null;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const raw = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : "";
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    body = {};
  }
  const c = { url, body, raw };
  calls.push(c);
  if (/resend/.test(url)) onEmail?.(c);
  if (/oauth2\.googleapis\.com\/token/.test(url)) return new Response(JSON.stringify({ access_token: "ya29.test-access", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.send", token_type: "Bearer" }), { status: 200, headers: { "content-type": "application/json" } });
  if (/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/.test(url)) return new Response(JSON.stringify({ id: `gm${calls.length}`, threadId: `th${calls.length}` }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ id: "x", ok: true }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const emailsTo = (addr: string) => calls.filter((x) => /resend/.test(x.url) && JSON.stringify(x.body.to ?? "").includes(addr));
const gmailSends = () => calls.filter((x) => /gmail\/v1\/users\/me\/messages\/send/.test(x.url));

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 1200)}`}`);
};

type Item = { id: string; key: string; status: string; kind: string; to: string; subject: string | null; body: string | null; expiresAt?: string | null };

async function main() {
  const t = await import("../lib/table");
  const W = await import("../lib/workflows");
  const G = await import("../lib/workflows/graph");
  const GR = await import("../lib/workflows/graphRun");
  const S = await import("../lib/send");
  const { seal } = await import("../lib/google/crypto");
  const n = await import("../lib/notify");
  const R = await import("../app/api/workflows2/route.ts");
  const { NextRequest } = await import("next/server");
  const T = t.tableInternals;
  const pub = T.pubId;
  const C = "tok-c-000000001";
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await n.settled();
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const route = async (method: "GET" | "POST", body?: unknown) => {
    const req = new NextRequest(`${ORIGIN}/api/workflows2`, {
      method,
      headers: { cookie: `rn_table=${C}`, ...(method === "POST" ? { "content-type": "application/json", origin: ORIGIN } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const res = await (method === "POST" ? R.POST : R.GET)(req as never, undefined as never);
    return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; message?: string; id?: string } };
  };
  const st = () => t.loadState();
  const disk = () => JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8")) as { workflows?: Record<string, { graphRuns?: import("../lib/workflows/graph").GraphRun[]; drafts: { id: string; subject: string; body: string }[] }>; outbox?: Record<string, { items: Item[] }>; inbox?: Record<string, { id: string; line: string }[]> };
  const items = async () => ((await st()) as unknown as { outbox?: Record<string, { items: Item[] }> }).outbox?.mem_c?.items ?? [];
  const runOf = async (id: string) => (await st()).workflows?.mem_c?.graphRuns?.find((r) => r.id === id);
  const lastRun = async (wf: string) => (await st()).workflows?.mem_c?.graphRuns?.filter((r) => r.wf === wf).sort((a, b) => b.at.localeCompare(a.at))[0];
  const bells = async (re: RegExp) => ((await st()).inbox?.mem_c ?? []).filter((x) => re.test(x.line));
  const N = (id: string, type: string, settings: Record<string, unknown> = {}, x = 0) => ({ id, type, name: id, on: true, settings, pos: { x, y: 0 } });
  const E = (from: string, to: string, out = "main") => ({ id: `e_${from}_${to}_${out}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40), from, out, to });
  const mk = async (name: string, nodes: ReturnType<typeof N>[], edges: ReturnType<typeof E>[]) => {
    const s1 = await route("POST", { op: "save", name, version: { nodes, edges } });
    if (s1.status !== 200) throw new Error(`save ${name}: ${s1.j.error}`);
    const id = String(s1.j.id);
    const l = await route("POST", { op: "live", id });
    if (l.status !== 200) throw new Error(`live ${name}: ${l.j.error}`);
    const o = await route("POST", { op: "on", id, on: true });
    if (o.status !== 200) throw new Error(`on ${name}: ${o.j.error}`);
    return id;
  };
  const tails = (s: string) => [N("ok", "notify.bell", { text: `${s}: sent path` }), N("sk", "notify.bell", { text: `${s}: skipped path` }), N("ex", "notify.bell", { text: `${s}: expired path` })];
  const tailEdges = (from = "s") => [E(from, "ok", "sent"), E(from, "sk", "skipped"), E(from, "ex", "expired")];
  const seatEvent = (key: string, companyId: string) => ({ memberId: "mem_c", key, trigger: "seat" as const, at: iso(Date.now()), companyId, line: "A fractional seat ended at a company you follow", href: `/?c=${pub(companyId)}`, lists: ["al_casey001"] });

  sendSwitch(true);

  /* ---------- 1. the waiting state first, then the member told, once ---------- */
  console.log("\n1. Approve, then send: persisted before the notification; the notification once per run and step");
  const w1 = await mk("Wait, then ask", [N("t", "trig.manual"), N("wt", "logic.wait", { days: 0, hours: 1 }), N("s", "act.send", { to: "dana@client.example", subject: "Hello", body: "Hi Dana, a short hello.", email: true }), ...tails("W1")], [E("t", "wt"), E("wt", "s"), ...tailEdges()]);
  await route("POST", { op: "run", id: w1 });
  await settle();
  const r1 = (await lastRun(w1))!;
  // The run as written before the tick: what a restart finds if the process stops after the email and before the write.
  const before1 = structuredClone(r1);
  let atEmail: { status?: string; kind?: string; outbox?: string; draft?: boolean } | null = null;
  onEmail = () => {
    const d = disk();
    const r = d.workflows?.mem_c?.graphRuns?.find((x) => x.id === r1.id);
    atEmail = { status: r?.status, kind: r?.wait?.kind, outbox: r?.wait?.outbox, draft: !!d.outbox?.mem_c?.items.some((x) => x.id === r?.wait?.outbox && x.status === "draft") };
  };
  const mails0 = emailsTo("casey@close.example").length;
  await GR.graphTick(Date.now() + 2 * HOUR);
  await settle();
  onEmail = null;
  const r1b = (await runOf(r1.id))!;
  check("the run waits at the send with its note in the outbox", r1b.status === "waiting" && r1b.wait?.kind === "send" && (await items()).some((x) => x.id === r1b.wait?.outbox && x.status === "draft"), r1b);
  check("the approval email goes only after the waiting state (and its draft) are written", emailsTo("casey@close.example").length === mails0 + 1 && atEmail !== null && atEmail!.status === "waiting" && atEmail!.kind === "send" && !!atEmail!.outbox && atEmail!.draft === true, { atEmail, mails: emailsTo("casey@close.example").length - mails0 });
  const bellRe = /^A note waits for your tap/;
  const bells1 = (await bells(bellRe)).length;
  // A second pass after an interruption: the run as it was before the tick (the write never happened), and the bell line gone from the
  // bell (it keeps the newest 200): the run carries on again from the wait.
  await T.mutate((d) => {
    const rs = d.workflows!.mem_c.graphRuns!;
    rs[rs.findIndex((x) => x.id === r1.id)] = structuredClone(before1);
    d.inbox!.mem_c = d.inbox!.mem_c.filter((x) => !bellRe.test(x.line));
  });
  await GR.graphTick(Date.now() + 3 * HOUR);
  await settle();
  const r1c = (await runOf(r1.id))!;
  check("a second pass of the same run and step sends no second approval email", emailsTo("casey@close.example").length === mails0 + 1, { mails: emailsTo("casey@close.example").length - mails0 });
  check("…and puts no second bell line", bells1 === 1 && (await bells(bellRe)).length === 0, { bells1, now: (await bells(bellRe)).length });
  check("…and queues no second note: the same draft, the run waiting on it", r1c.status === "waiting" && r1c.wait?.outbox === r1b.wait?.outbox && (await items()).filter((x) => x.key.startsWith(`wf:${r1.id}:`)).length === 1, { r1c: r1c.wait, items: (await items()).map((x) => [x.key, x.status]) });

  /* ---------- 2. queueFromWorkflow: one note per key, whatever its status ---------- */
  console.log("\n2. A workflow's note is queued once per key, whatever became of it");
  const K = "wf:run_test2:s:1";
  const q1 = await S.queueFromWorkflow("mem_c", { key: K, to: "dana@client.example", subject: "Hello", body: "Hi Dana." });
  const again0 = await S.queueFromWorkflow("mem_c", { key: K, to: "dana@client.example", subject: "Hello", body: "Hi Dana." });
  check("a draft's key again: the same draft", again0 === q1);
  for (const status of ["grant", "queued", "scheduled", "sending", "sent", "replied", "held", "cancelled", "failed"]) {
    await T.mutate((d) => {
      const x = (d as unknown as { outbox: Record<string, { items: Item[] }> }).outbox.mem_c.items.find((i) => i.id === q1)!;
      x.status = status;
    });
    const q = await S.queueFromWorkflow("mem_c", { key: K, to: "dana@client.example", subject: "Hello", body: "Hi Dana." });
    check(`retried after the note was ${status}: no new message, the same note`, q === q1 && (await items()).filter((x) => x.key === K).length === 1, { q, q1, n: (await items()).filter((x) => x.key === K).map((x) => [x.id, x.status]) });
  }
  // Approved through the run's own tap: the note keeps its key, so a retry of the run finds it.
  const w2 = await mk("Ask and send", [N("t", "trig.manual"), N("s", "act.send", { to: "dana@client.example", subject: "Hi", body: "Hi Dana, again." }), ...tails("W2")], [E("t", "s"), ...tailEdges()]);
  await route("POST", { op: "run", id: w2 });
  const r2 = (await lastRun(w2))!;
  const key2 = (await items()).find((x) => x.id === r2.wait?.outbox)!.key;
  await route("POST", { op: "answer", run: r2.id, yes: true });
  const it2 = (await items()).find((x) => x.id === r2.wait?.outbox)!;
  const q2 = await S.queueFromWorkflow("mem_c", { key: key2, to: "dana@client.example", subject: "Hi", body: "Hi Dana, again." });
  check("approved from the run's tap, then the run retried: no second message", it2.status !== "draft" && q2 === it2.id && (await items()).filter((x) => x.key === key2 || x.key.startsWith(`wf:${r2.id}:`)).length === 1, { it2, q2, key2, items: (await items()).filter((x) => x.key.includes(r2.id)).map((x) => [x.id, x.key, x.status]) });

  /* ---------- 2b. journey E1: no address, the live run waits like the test, and nothing goes to nobody ---------- */
  console.log("\n2b. A live run whose note has no address waits for the member's tap (journey E1)");
  const wNo = await mk("No address yet", [N("t", "trig.manual"), N("s", "act.send", { to: "", toName: "Their CFO", subject: "Hello", body: "Hi, a short hello.", email: true }), ...tails("WNo")], [E("t", "s"), ...tailEdges()]);
  await route("POST", { op: "run", id: wNo });
  await settle();
  const rNo = (await lastRun(wNo))!;
  const itNo = (await items()).find((x) => x.id === rNo.wait?.outbox);
  check("E1: with no address the live run waits at the approval, never failed", rNo.status === "waiting" && rNo.wait?.kind === "send" && !rNo.failedAt, { status: rNo.status, nodes: rNo.nodes.map((x) => [x.node, x.status, x.note]) });
  check("E1: its note waits in the outbox with an empty To and who it is for, for the member to fill in", !!itNo && itNo.status === "draft" && itNo.to === "" && (itNo as unknown as { toName: string | null }).toName === "Their CFO", itNo);
  check("E1: the step says so: add who it is to, then Approve and send", rNo.nodes.find((x) => x.node === "s")?.note === GR.NO_TO_YET, rNo.nodes.find((x) => x.node === "s")?.note);
  check("E1: the bell says add who it is to", (await bells(/^A note waits for you: add who it is to, then Approve and send/)).length >= 1);
  const yesNo = await route("POST", { op: "answer", run: rNo.id, yes: true });
  check("E1: a yes from the run with no address is refused in plain words, and nothing is queued or sent", yesNo.status >= 400 && yesNo.j.error === GR.ADD_TO_FIRST && (await items()).find((x) => x.id === itNo!.id)?.status === "draft", yesNo);
  const noTo = await S.approve("tok-c-000000001", { key: itNo!.key, id: itNo!.id, to: "", subject: "Hello", body: "Hi, a short hello.", kind: "workflow" } as never).then(() => null, (e: Error) => e.message);
  check("E1: the outbox's own approve refuses an empty To too", !!noTo, noTo);
  const withTo = await S.approve("tok-c-000000001", { key: itNo!.key, id: itNo!.id, to: "cfo@client.example", subject: "Hello", body: "Hi, a short hello.", kind: "workflow" } as never);
  check("E1: with the address the member typed, Approve and send queues that one note, to that address", ["queued", "grant"].includes(withTo.item.status) && withTo.item.to === "cfo@client.example" && (await items()).filter((x) => x.key === itNo!.key).length === 1, withTo.item);

  /* ---------- 3. an expired approval is refused where the member taps ---------- */
  console.log("\n3. Expiry at the approve endpoint itself");
  const w3 = await mk("Expires", [N("t", "trig.manual"), N("s", "act.send", { to: "dana@client.example", subject: "Late", body: "Hi Dana, a late one.", days: 1 }), ...tails("W3")], [E("t", "s"), ...tailEdges()]);
  await route("POST", { op: "run", id: w3 });
  const r3 = (await lastRun(w3))!;
  const late = Date.parse(r3.wait!.expires) + MIN;
  // Through the run (the workflows page's tap and the bell's): refused, the member told it expired.
  let ans3: string | null = null;
  let err3: string | null = null;
  try {
    ans3 = await GR.answerRun("mem_c", r3.id, true, ORIGIN, late);
  } catch (e) {
    err3 = e instanceof Error ? e.message : String(e);
  }
  const it3 = (await items()).find((x) => x.id === r3.wait?.outbox);
  check("approving an expired note through the run is refused, and says it expired", !ans3 && !!err3 && /expired|ran out|too late/i.test(err3) && (!it3 || it3.status === "draft" || it3.status === "cancelled"), { ans3, err3, it3 });
  check("…nothing was queued to send", !it3 || !["grant", "queued", "scheduled", "sending", "sent"].includes(it3.status), it3);
  // Through the outbox itself (Approve and send in Messages), before the scheduler cancels it.
  const w3b = await mk("Expires 2", [N("t", "trig.manual"), N("s", "act.send", { to: "dana@client.example", subject: "Late 2", body: "Hi Dana, a late two.", days: 1 }), ...tails("W3b")], [E("t", "s"), ...tailEdges()]);
  await route("POST", { op: "run", id: w3b });
  const r3b = (await lastRun(w3b))!;
  const ob3 = (await items()).find((x) => x.id === r3b.wait?.outbox)!;
  let err3b: string | null = null;
  let ok3b: unknown = null;
  try {
    ok3b = await S.approve(C, { key: ob3.key, id: ob3.id, to: ob3.to, subject: ob3.subject ?? "", body: ob3.body ?? "", kind: "workflow" } as never, Date.parse(r3b.wait!.expires) + MIN);
  } catch (e) {
    err3b = e instanceof Error ? e.message : String(e);
  }
  const ob3b = (await items()).find((x) => x.id === ob3.id)!;
  check("approving an expired workflow note in the outbox is refused, and says it expired", !ok3b && !!err3b && /expired|ran out|too late/i.test(err3b) && !["grant", "queued", "scheduled", "sending", "sent"].includes(ob3b.status), { err3b, ok3b: !!ok3b, ob3b });
  // In time it still goes through.
  const ok3c = await S.approve(C, { key: ob3.key, id: ob3.id, to: ob3.to, subject: ob3.subject ?? "", body: ob3.body ?? "", kind: "workflow" } as never, Date.parse(r3b.wait!.expires) - HOUR).catch((e) => e as Error);
  check("…in time, the same tap is taken", !(ok3c instanceof Error) && ["grant", "queued"].includes((await items()).find((x) => x.id === ob3.id)!.status), ok3c instanceof Error ? ok3c.message : (await items()).find((x) => x.id === ob3.id));
  // An Ask me past its time: yes is refused too.
  const w3c = await mk("Ask late", [N("t", "trig.manual"), N("ask", "logic.ask", { question: "Go?", days: 1 }), N("y", "notify.bell", { text: "W3c yes" }), N("no", "notify.bell", { text: "W3c no" })], [E("t", "ask"), E("ask", "y", "yes"), E("ask", "no", "no")]);
  await route("POST", { op: "run", id: w3c });
  const r3c = (await lastRun(w3c))!;
  let err3c: string | null = null;
  try {
    await GR.answerRun("mem_c", r3c.id, true, ORIGIN, Date.parse(r3c.wait!.expires) + MIN);
  } catch (e) {
    err3c = e instanceof Error ? e.message : String(e);
  }
  const r3cb = (await runOf(r3c.id))!;
  check("a yes to an Ask me past its time is refused too: it took No", !!err3c && /expired|ran out|too late/i.test(err3c) && !r3cb.nodes.some((x) => x.node === "y"), { err3c, nodes: r3cb.nodes.map((x) => [x.node, x.status]) });

  /* ---------- 4. waiting runs are never trimmed ---------- */
  console.log("\n4. The run history's limits never trim a waiting run");
  const waitingOld: import("../lib/workflows/graph").GraphRun = { ...structuredClone(r3c), id: "run_waiting_old", at: iso(t0 - 20 * DAY), status: "waiting", wait: { kind: "ask", node: "ask", expires: iso(t0 + 5 * DAY) } };
  const waitingBefore = ((await st()).workflows!.mem_c.graphRuns ?? []).filter((x) => x.status === "waiting").map((x) => x.id);
  await T.mutate((d) => {
    const w = d.workflows!.mem_c;
    const done: import("../lib/workflows/graph").GraphRun[] = [];
    for (let i = 0; i < G.V2_LIMITS.runsTotal + 20; i++) done.push({ ...structuredClone(r3c), id: `run_hist_${i}`, wf: `wf_hist_${i % 12}`, at: iso(t0 - 10 * DAY + i * MIN), status: "done", wait: undefined });
    w.graphRuns = [waitingOld, ...(w.graphRuns ?? []), ...done];
  });
  await route("POST", { op: "run", id: w2 });
  await settle();
  const gr4 = (await st()).workflows!.mem_c.graphRuns!;
  check("an old waiting run (an approval request) is kept past the 400 runs of history", gr4.some((x) => x.id === "run_waiting_old" && x.status === "waiting"), { n: gr4.length, waiting: gr4.filter((x) => x.status === "waiting").map((x) => x.id) });
  check("…every waiting run is kept, and the completed history is still capped", gr4.filter((x) => x.status !== "waiting").length <= G.V2_LIMITS.runsTotal && waitingBefore.every((id) => gr4.some((x) => x.id === id && x.status === "waiting")), { done: gr4.filter((x) => x.status !== "waiting").length, waiting: gr4.filter((x) => x.status === "waiting").length });
  // Today's run log too (a converted line's cap ask): an unanswered ask is kept past the 200 runs.
  const WT = await import("../lib/workflows/types");
  const RUN = await import("../lib/workflows/run");
  const wfx = WT.emptyWorkflows();
  wfx.runs = [{ id: "run_ask_old", wf: "wf_x", at: iso(t0 - 5 * DAY), line: "x", href: "/", steps: [], estimate: 2, spent: 0, ask: { credits: 2 } }, ...Array.from({ length: WT.WF_LIMITS.runs + 5 }, (_, i) => ({ id: `run_v1_${i}`, wf: "wf_x", at: iso(t0 - DAY + i * MIN), line: "x", href: "/", steps: [], estimate: 0, spent: 0 }))];
  RUN.capWorkflows(wfx, t0);
  check("today's run log keeps an unanswered ask past its 200 runs too", wfx.runs.some((x) => x.id === "run_ask_old") && wfx.runs.filter((x) => !x.ask || x.ask.answer).length <= WT.WF_LIMITS.runs, { n: wfx.runs.length });

  /* ---------- 5. Gmail sending off: told of a draft only when there is one ---------- */
  console.log("\n5. Sending off: the member is told of a draft only when it exists");
  const w5 = await mk("Draft when off", [N("t", "trig.manual"), N("s", "act.send", { to: "dana@client.example", subject: "Off", body: "Hi Dana, while sending is off.", email: true }), ...tails("W5")], [E("t", "s"), ...tailEdges()]);
  const w5b = await mk("Draft when off, at a company", [N("t", "trig.seat", { scope: { kind: "list", list: "al_casey001" } }), N("s", "act.send", { to: "dana@client.example", subject: "Off at a company", body: "Hi Dana, at Northwind.", email: true }), ...tails("W5b")], [E("t", "s"), ...tailEdges()]);
  sendSwitch(false);
  const drafts5 = (await st()).workflows!.mem_c.drafts.length;
  const mails5 = emailsTo("casey@close.example").length;
  const draftBell = /^A note Merlin drafted waits in Messages/;
  const b5 = (await bells(draftBell)).length;
  await route("POST", { op: "run", id: w5 });
  await settle();
  const r5 = (await lastRun(w5))!;
  const s5 = r5.nodes.find((x) => x.node === "s");
  check("no company: no draft, so no 'a draft is waiting' bell line or email", (await st()).workflows!.mem_c.drafts.length === drafts5 && (await bells(draftBell)).length === b5 && emailsTo("casey@close.example").length === mails5, { drafts: (await st()).workflows!.mem_c.drafts.length - drafts5, bells: (await bells(draftBell)).length - b5, mails: emailsTo("casey@close.example").length - mails5 });
  check("…and the step says plainly that nothing was sent and nothing waits in Messages", !!s5 && s5.status === "skipped" && /nothing was sent/i.test(s5.note) && !/is a draft in Messages/i.test(s5.note), s5);
  await W.runEvents([seatEvent("w5b:1", "c_north")]);
  await settle();
  const ds5 = (await st()).workflows!.mem_c.drafts;
  check("at a company you can see: the draft is in Messages, and then you're told (bell and email)", ds5.length === drafts5 + 1 && ds5[0].companyName === "Northwind Clinics" && (await bells(draftBell)).length === b5 + 1 && emailsTo("casey@close.example").length === mails5 + 1, { drafts: ds5.length - drafts5, bells: (await bells(draftBell)).length - b5, mails: emailsTo("casey@close.example").length - mails5 });
  sendSwitch(true);

  /* ---------- 6. AI off: an instruction is never queued as the note ---------- */
  console.log("\n6. Merlin's AI off: an AI write step never queues its instruction");
  const PROMPT = "Thank the client for signing and propose a kickoff call.";
  const w6 = await mk("Write and send, no company", [N("t", "trig.manual"), N("w", "ai.write", { prompt: PROMPT }), N("s", "act.send", { to: "dana@client.example" }), ...tails("W6")], [E("t", "w"), E("w", "s"), ...tailEdges()]);
  const items6 = (await items()).length;
  await route("POST", { op: "run", id: w6 });
  await settle();
  const r6 = (await lastRun(w6))!;
  const all6 = await items();
  const leak6 = all6.filter((x) => (x.body ?? "").includes(PROMPT) || (x.subject ?? "").includes(PROMPT.slice(0, 40)));
  check("no company to write about: the instruction is never queued as a draft", leak6.length === 0 && all6.length === items6, { leak6, run: r6.nodes.map((x) => [x.node, x.status, x.note]) });
  const wn6 = r6.nodes.find((x) => x.node === "w");
  check("…the write step holds with a plain message, and the send has nothing to approve", !!wn6 && wn6.status === "skipped" && /AI/.test(wn6.note) && !JSON.stringify(wn6.output ?? {}).includes(PROMPT) && r6.nodes.find((x) => x.node === "s")?.status === "skipped" && r6.status !== "waiting", { wn6, s: r6.nodes.find((x) => x.node === "s"), status: r6.status });
  const w6b = await mk("Write and send, at a company", [N("t", "trig.seat", { scope: { kind: "list", list: "al_casey001" } }), N("w", "ai.write", { prompt: PROMPT }), N("s", "act.send", { to: "dana@client.example" }), ...tails("W6b")], [E("t", "w"), E("w", "s"), ...tailEdges()]);
  await W.runEvents([seatEvent("w6b:1", "c_north")]);
  await settle();
  const r6b = (await lastRun(w6b))!;
  const ob6 = (await items()).find((x) => x.id === r6b.wait?.outbox);
  check("at a company you can see: a real rules draft waits for the tap, never the instruction", r6b.status === "waiting" && !!ob6 && !!ob6.body && !ob6.body.includes(PROMPT) && !(ob6.subject ?? "").includes(PROMPT.slice(0, 40)) && /Northwind/.test(`${ob6.subject} ${ob6.body}`), { ob6, nodes: r6b.nodes.map((x) => [x.node, x.status, x.note]) });

  /* ---------- 7. nothing without the tap, under retries and concurrent passes ---------- */
  console.log("\n7. Nothing goes without the member's tap: retries and concurrent passes");
  // Google's permission to send is given, so a tap would send for real.
  await T.mutate((d) => {
    const all = ((d as unknown as { outbox: Record<string, { grant?: unknown; items: Item[]; sent: string[] }> }).outbox ??= {});
    (all.mem_c ??= { items: [], sent: [] }).grant = { token: seal("REFRESH-test-send"), email: "casey@close.example", scopes: ["https://www.googleapis.com/auth/gmail.send"], connectedAt: iso(t0), status: "ok" };
  });
  const w7 = await mk("Concurrent", [N("t", "trig.manual"), N("s", "act.send", { to: "dana@client.example", subject: "Once", body: "Hi Dana, exactly once." }), ...tails("W7")], [E("t", "s"), ...tailEdges()]);
  await route("POST", { op: "run", id: w7 });
  const r7 = (await lastRun(w7))!;
  const before7 = structuredClone(r7);
  const g0 = gmailSends().length;
  const far = Date.now() + 2 * MIN;
  await Promise.all([GR.graphTick(far), GR.graphTick(far), S.sendTick(far), S.sendDue(far), S.sendDue(far, "mem_c"), GR.graphTick(far), S.sendTick(far + HOUR)]);
  await settle();
  check("concurrent scheduler passes before the tap: nothing is sent, the note stays a draft, the run waits", gmailSends().length === g0 && (await items()).find((x) => x.id === r7.wait?.outbox)?.status === "draft" && (await runOf(r7.id))?.status === "waiting", { sends: gmailSends().length - g0, item: (await items()).find((x) => x.id === r7.wait?.outbox) });
  // A retry of the run while it waits (a second pass from where it was written): still one draft, nothing sent.
  await T.mutate((d) => {
    const rs = d.workflows!.mem_c.graphRuns!;
    const k = rs.findIndex((x) => x.id === r7.id);
    rs[k] = { ...structuredClone(before7), status: "running", wait: undefined, frontier: [], visits: { t: 1 }, nodes: before7.nodes.filter((x) => x.node === "t") } as never;
    rs[k].status = "failed";
    rs[k].failedAt = "s";
  });
  await GR.retryRun("mem_c", r7.id, ORIGIN).catch(() => null);
  check("a retried run before the tap: still one note, still a draft, nothing sent", gmailSends().length === g0 && (await items()).filter((x) => x.key.startsWith(`wf:${r7.id}:`)).length === 1 && (await items()).find((x) => x.key.startsWith(`wf:${r7.id}:`))?.status === "draft", (await items()).filter((x) => x.key.startsWith(`wf:${r7.id}:`)));
  // The tap, three times at once (the run's tap, the bell's, the outbox's): one note queued, sent once.
  const r7b = (await runOf(r7.id))!;
  const ob7 = (await items()).find((x) => x.id === r7b.wait?.outbox)!;
  const tapAt = Date.now();
  const taps = await Promise.allSettled([
    GR.answerRun("mem_c", r7.id, true, ORIGIN, tapAt),
    t.perform(C, { type: "workflow.approve", run: r7.id, yes: true } as never),
    S.approve(C, { key: ob7.key, id: ob7.id, to: ob7.to, subject: ob7.subject ?? "", body: ob7.body ?? "", kind: "workflow" } as never, tapAt),
  ]);
  const queued7 = (await items()).filter((x) => x.key === ob7.key);
  check("three taps at once queue the note once", queued7.length === 1 && ["queued", "sending", "sent"].includes(queued7[0].status) && taps.some((x) => x.status === "fulfilled"), { queued7, taps: taps.map((x) => x.status === "fulfilled" ? "ok" : String((x as PromiseRejectedResult).reason?.message)) });
  await Promise.all([S.sendDue(tapAt + 31_000), S.sendDue(tapAt + 31_000, "mem_c"), S.sendTick(tapAt + 31_000), GR.graphTick(tapAt + 31_000)]);
  await settle();
  check("…and it goes from Gmail exactly once, whatever passes run at once", gmailSends().length === g0 + 1 && (await items()).find((x) => x.id === ob7.id)?.status === "sent", { sends: gmailSends().length - g0, item: (await items()).find((x) => x.id === ob7.id) });
  // After it went: the run retried from where it last waited (an interrupted pass) sends nothing more.
  await T.mutate((d) => {
    const rs = d.workflows!.mem_c.graphRuns!;
    rs[rs.findIndex((x) => x.id === r7.id)] = structuredClone(r7b);
  });
  await GR.graphTick(tapAt + 2 * MIN);
  await S.sendDue(tapAt + 3 * MIN);
  await settle();
  check("…a second pass of the run after it was sent: no new message, nothing sent again, the run carries on by Sent", gmailSends().length === g0 + 1 && (await items()).filter((x) => x.key.startsWith(`wf:${r7.id}:`)).length === 1 && (await runOf(r7.id))?.nodes.some((x) => x.node === "ok"), { sends: gmailSends().length - g0, items: (await items()).filter((x) => x.key.startsWith(`wf:${r7.id}:`)).map((x) => x.status), nodes: (await runOf(r7.id))?.nodes.map((x) => [x.node, x.status]) });
  // A note nobody tapped is never sent by any pass, even long after.
  const w7c = await mk("Never tapped", [N("t", "trig.manual"), N("s", "act.send", { to: "dana@client.example", subject: "Never", body: "Hi Dana, never tapped.", days: 1 }), ...tails("W7c")], [E("t", "s"), ...tailEdges()]);
  await route("POST", { op: "run", id: w7c });
  const r7c = (await lastRun(w7c))!;
  const g1 = gmailSends().length;
  for (const k of [1, 2, 3]) await Promise.all([GR.graphTick(Date.now() + k * DAY), S.sendDue(Date.now() + k * DAY), S.sendTick(Date.now() + k * DAY)]);
  await settle();
  const r7cb = (await runOf(r7c.id))!;
  check("a note never tapped is never sent: it expires unsent and the run takes Expired", gmailSends().length === g1 && (await items()).find((x) => x.id === r7c.wait?.outbox)?.status === "cancelled" && r7cb.nodes.some((x) => x.node === "ex"), { sends: gmailSends().length - g1, item: (await items()).find((x) => x.id === r7c.wait?.outbox), nodes: r7cb.nodes.map((x) => [x.node, x.status]) });
  // The same event twice at once runs the workflow once.
  const w7d = await mk("Same event", [N("t", "trig.seat", { scope: { kind: "list", list: "al_casey001" } }), N("s", "act.send", { to: "dana@client.example", subject: "Event", body: "Hi Dana, one event." }), ...tails("W7d")], [E("t", "s"), ...tailEdges()]);
  await Promise.all([W.runEvents([seatEvent("w7d:1", "c_north")]), W.runEvents([seatEvent("w7d:1", "c_north")])]);
  await settle();
  check("the same event at once, twice: one run, one draft", (await st()).workflows!.mem_c.graphRuns!.filter((x) => x.wf === w7d).length === 1 && (await items()).filter((x) => x.subject === "Event").length === 1, (await st()).workflows!.mem_c.graphRuns!.filter((x) => x.wf === w7d).length);
}

main()
  .catch((e) => {
    failures++;
    console.error("FAIL the run threw", e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${failures ? "FAILED" : "ok"}: ${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
