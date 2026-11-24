/**
 * Checks of the call picker's logic (app/post/callPick.ts) and its wiring (GranolaCallPicker.tsx,
 * ProposalStart.tsx, Proposals.tsx): the stall where typing who signs searched Granola on every key.
 *
 *   npx tsx scripts/test-call-picker.mts
 *
 * Pure: a fake clock and a fake list request, made-up companies, no server, no network.
 *
 *  1. callSearch: a search waits 400 ms after the last change; the same question is asked once; a
 *     newer question cancels the older request (its signal aborts) and an answer that comes back
 *     late is dropped; `now` asks at once; Try again asks again; stop drops everything.
 *  2. Typing an email one key at a time: one request for the whole address, none for the half-typed ones.
 *  3. withPicked: the picked call stays in the list whatever the list says now.
 *  4. companyForCall: the attendee's work domain to a company the member can see (subdomains too),
 *     never a locked company, free mail, the member's own domain, or a domain two companies share.
 *  5. The wiring: the picker asks once when it opens (no effect on the signer's email or the company),
 *     the signer's email never reaches it, a pick preselects the company.
 */
import { readFileSync } from "node:fs";
import type { CoInfo } from "../app/post/model.ts";

const P = await import("../app/post/callPick.ts");

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)}`.slice(0, 600)}`);
};

/* ---------- a fake clock and a fake list request ---------- */
let now = 0;
let timers: { id: number; at: number; f: () => void }[] = [];
let tid = 0;
const clock = {
  set: (f: () => void, ms: number) => {
    const id = ++tid;
    timers.push({ id, at: now + ms, f });
    return id as unknown as ReturnType<typeof setTimeout>;
  },
  clear: (t: ReturnType<typeof setTimeout>) => void (timers = timers.filter((x) => x.id !== (t as unknown as number))),
};
const advance = async (ms: number) => {
  const end = now + ms;
  for (;;) {
    const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    now = next.at;
    timers = timers.filter((t) => t !== next);
    next.f();
    await flush();
  }
  now = end;
  await flush();
};
const flush = () => new Promise((r) => setImmediate(r));

type Asked = { key: string; signal: AbortSignal; answer: (a: string) => void };
function harness() {
  const asked: Asked[] = [];
  const shown: string[] = [];
  const started: string[] = [];
  const s = P.callSearch<string>({
    ask: (key, signal) => new Promise<string>((answer) => asked.push({ key, signal, answer })),
    onStart: (k) => started.push(k),
    onAnswer: (k, a) => shown.push(`${k}=${a}`),
    timers: clock,
  });
  return { s, asked, shown, started };
}

/* ---------- 1. callSearch ---------- */
console.log("callSearch");
{
  const h = harness();
  h.s.want("recent", { now: true });
  check("`now` asks at once", h.asked.length === 1 && h.asked[0].key === "recent");
  h.s.want("recent", { now: true });
  h.s.want("recent");
  check("the same question again (in flight) is not asked again", h.asked.length === 1);
  h.asked[0].answer("A");
  await flush();
  check("the answer is shown", h.shown.join() === "recent=A");
  h.s.want("recent", { now: true });
  check("the same question again (answered) is not asked again", h.asked.length === 1);
  h.s.retry();
  check("Try again asks again", h.asked.length === 2);
  h.asked[1].answer("A2");
  await flush();

  h.s.want("email:dana@qaco3.example");
  await advance(399);
  check("a search waits: nothing at 399 ms", h.asked.length === 2);
  h.s.want("email:dana@qaco3.example");
  await advance(1);
  check("then it goes at 400 ms, once", h.asked.length === 3 && h.asked[2].key === "email:dana@qaco3.example");

  // Out of order: the older answer comes back after the newer one.
  h.s.want("email:lee@qaco3.example", { now: true });
  check("a newer question cancels the older request (its signal aborts)", h.asked[2].signal.aborted && !h.asked[3].signal.aborted);
  h.asked[3].answer("LEE");
  await flush();
  h.asked[2].answer("DANA-LATE");
  await flush();
  check("an answer that comes back late is dropped", h.shown.at(-1) === "email:lee@qaco3.example=LEE" && !h.shown.some((x) => x.includes("DANA-LATE")), h.shown);

  h.s.want("email:x@qaco3.example");
  h.s.want("email:lee@qaco3.example");
  await advance(1000);
  check("back to the question already on screen before the wait ends: nothing asked", h.asked.length === 4);

  h.s.want("company:c_1", { now: true });
  h.s.stop();
  h.asked[4].answer("CO");
  await flush();
  check("stop: the request in flight is cancelled and its answer dropped", h.asked[4].signal.aborted && !h.shown.some((x) => x.startsWith("company:")));
  h.s.want("company:c_1", { now: true });
  check("after stop (a remount) the same question is asked again", h.asked.length === 6);
}

/* ---------- 2. typing an email ---------- */
console.log("\nTyping an email, one key at a time (60 ms a key)");
{
  const h = harness();
  h.s.want(P.callQueryKey({ recent: true }, false), { now: true });
  h.asked[0].answer("RECENT");
  await flush();
  const typed = "dana.w@qaco3.example";
  for (let i = 1; i <= typed.length; i++) {
    const v = typed.slice(0, i);
    // The picker's own search box: only a whole address searches by itself.
    if (P.WHOLE_EMAIL.test(v)) h.s.want(P.callQueryKey({ email: v }, false));
    await advance(60);
  }
  await advance(400);
  const emailAsks = h.asked.filter((a) => a.key.startsWith("email:"));
  check("20 keys typed: one request, for the whole address", emailAsks.length === 1 && emailAsks[0].key === "email:dana.w@qaco3.example", h.asked.map((a) => a.key));
  check("half-typed addresses are not whole", !P.WHOLE_EMAIL.test("dana.w@") && !P.WHOLE_EMAIL.test("dana.w@qaco3") && !P.WHOLE_EMAIL.test("dana.w@qaco3.e") && P.WHOLE_EMAIL.test("dana.w@qaco3.ex"));
  check("the question's key: who, then titles", P.callQueryKey({ email: " Dana@QACO3.example " }, true) === "email:dana@qaco3.example|titles" && P.callQueryKey({ company: "c_1", email: "x@y.example" }, false) === "company:c_1" && P.callQueryKey({ recent: true }, false) === "recent");
}

/* ---------- 3. withPicked ---------- */
console.log("\nThe picked call stays");
{
  const a = { noteId: "not_a" };
  const b = { noteId: "not_b" };
  const c = { noteId: "not_c" };
  check("in the list: the list as it is", JSON.stringify(P.withPicked([a, b], b, "not_b")) === JSON.stringify([a, b]));
  check("not in the list now (no calls with that email): still shown, first", JSON.stringify(P.withPicked([], c, "not_c")) === JSON.stringify([c]) && JSON.stringify(P.withPicked([a], c, "not_c")) === JSON.stringify([c, a]));
  check("nothing picked, or another call picked: the list as it is", P.withPicked([a], null, null).length === 1 && P.withPicked([a], c, "not_b").length === 1);
}

/* ---------- 4. companyForCall ---------- */
console.log("\nThe company from the call");
{
  const co = (id: string, name: string, domain: string | null, hidden = false) => ({ c: { id, name, hidden }, domain }) as unknown as CoInfo;
  const infos = [
    co("c_copper", "Copperleaf Logistics Qaco3", "qaco3.example"),
    co("c_cedar", "Cedar and Pine", "https://www.cedarpine.example/about"),
    co("c_locked", "", "hiddenco.example", true),
    co("c_twin1", "Twin One", "twins.example"),
    co("c_twin2", "Twin Two", "twins.example"),
    co("c_mine", "My Own Advisory", "averyadvisory.example"),
  ];
  const me = { email: "cleo@averyadvisory.example" };
  check("the attendee's domain is a company the member can see: that company", P.companyForCall([{ email: "dana@qaco3.example" }], infos, me)?.c.id === "c_copper");
  check("a website with www and a path, and a subdomain under it", P.companyForCall([{ email: "lee@eu.cedarpine.example" }], infos, me)?.c.id === "c_cedar");
  check("the first attendee that matches, skipping free mail and the member's own domain", P.companyForCall([{ email: "x@gmail.com" }, { email: "me2@averyadvisory.example" }, { email: "dana@qaco3.example" }], infos, me)?.c.id === "c_copper");
  check("a locked company is never matched (it would name it)", P.companyForCall([{ email: "pat@hiddenco.example" }], infos, me) === null);
  check("a domain two companies share: no guess", P.companyForCall([{ email: "a@twins.example" }], infos, me) === null);
  check("nothing on Merlin: none", P.companyForCall([{ email: "a@nowhere.example" }, { email: "" }, {}], infos, me) === null);
}

/* ---------- 5. the wiring ---------- */
console.log("\nThe wiring");
{
  const pk = readFileSync(new URL("../app/post/GranolaCallPicker.tsx", import.meta.url), "utf8");
  const ps = readFileSync(new URL("../app/post/ProposalStart.tsx", import.meta.url), "utf8");
  const pr = readFileSync(new URL("../app/post/Proposals.tsx", import.meta.url), "utf8");
  check("the picker no longer follows the company or the email after it opens", !/\}, \[companyId, email\]\)/.test(pk) && !/\[ready, by, titles, run\]/.test(pk) && /\}, \[ready\]\);/.test(pk));
  check("the picker asks through callSearch, with a signal to cancel", /callSearch</.test(pk) && /fetchCalls\(.*, signal\)/.test(pk));
  check("its own search: a whole address, 400 ms after the last key", /WHOLE_EMAIL\.test\(v\)\) ask\(\{ email: v \}, titles, false\)/.test(pk));
  check("the picked call is kept in the list", /withPicked\(list\.a\.calls, picked\.current, pickedId\)/.test(pk));
  check("who signs never reaches the picker", !/signerEmail:/.test(ps) && !/signerEmail/.test(pr) && !/email=\{o\./.test(pr));
  check("a picked call preselects the company the member can see", /companyForCall\(c\.attendees \?\? \[\], infos, data\.me\)/.test(ps) && /setPick\(co\.c\.id\)/.test(ps));
  const client = readFileSync(new URL("../app/post/granolaClient.ts", import.meta.url), "utf8");
  check("the list request takes the signal", /signal\?: AbortSignal\): Promise<Answer<CallsAnswer>>/.test(client) && /signal \? \{ signal \} : undefined/.test(client));
  const route = readFileSync(new URL("../app/api/integrations/granola/[op]/route.ts", import.meta.url), "utf8");
  check("the route counts only fresh asks of Granola, 10 a minute, and says to wait a minute", /CALLS_PER_MINUTE = 10/.test(route) && /limited\(`granola-calls:\$\{key\}`, CALLS_PER_MINUTE, 60_000\)/.test(route) && /Wait a minute, then try again\./.test(route) && /\{ gate \}/.test(route));
  check("no em dash in the new words", ![pk, ps, route].some((x) => /Wait a minute[^"]*—/.test(x)) && !readFileSync(new URL("../app/post/callPick.ts", import.meta.url), "utf8").includes("—"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
