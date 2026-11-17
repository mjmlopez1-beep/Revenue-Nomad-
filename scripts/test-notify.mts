/**
 * Checks of alerts in Slack and other tools (lib/notify), without a server, Slack or a network.
 *
 *   npx tsx scripts/test-notify.mts
 *
 * Runs on a made-up seed in a temporary data dir. fetch is replaced, so every post that would go
 * to Slack or a webhook is caught here, and names are resolved by a stand-in, so nothing leaves
 * the machine. The clock moves forward where a rule is about time (the 15 minute batches).
 * Each alert is set off through the real code path: applyScan, perform (unlock) and a message.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-notify-"));
const seed = {
  builtAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  members: [
    { id: "mem_hana", name: "Hana Holder", email: "hana.holder@example.com", title: "Fractional CMO", token: "tok-hana-0001" },
    { id: "mem_sal", name: "Sal Starter", email: "sal.starter@example.com", title: "Fractional VP Sales", token: "tok-sal-0001" },
    { id: "mem_mo", name: "Mo Marketer", email: "mo.marketer@example.com", title: "Fractional VP Marketing", token: "tok-mo-0001" },
    { id: "mem_ada", name: "Ada Admin", email: "ada.admin@example.com", title: "Founder", token: "tok-ada-0001" },
  ],
  companies: [
    { id: "c_acme", fields: { name: "Acme Robotics", website: "acme.example" } },
    { id: "c_beta", fields: { name: "Beta Labs", website: "beta.example", industry: "SaaS", revenue: "$5M–$20M", hq: "Austin, TX" } },
  ],
  engagements: [
    {
      id: "e_acme_hana",
      companyId: "c_acme",
      fields: { source: "Published engagement", operator: "Hana Holder", role: "Fractional CMO", function: "Marketing", start: "2023-01", end: "2024-06", status: "Ended", rate: "$10k/mo", sourced: "Referral" },
    },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const at0 = new Date().toISOString();
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: { mem_hana: at0, mem_sal: at0, mem_mo: at0, mem_ada: at0 },
    profiles: { mem_hana: { function: "Marketing", onboarded: true }, mem_mo: { function: "Marketing", onboarded: true }, mem_sal: { function: "Sales", onboarded: true } },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
});
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT"]) delete process.env[k];

/* ---------- the network, replaced ---------- */

type Sent = { url: string; body: Record<string, unknown>; init: RequestInit };
const outbox: Sent[] = [];
/** What the next posts answer, by URL (default 200 "ok"). */
const answers = new Map<string, () => Response | Promise<Response>>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  outbox.push({ url, body: JSON.parse(String(init?.body ?? "{}")), init: init ?? {} });
  const a = answers.get(url);
  return a ? a() : new Response("ok", { status: 200 });
}) as typeof fetch;
void realFetch;

const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;
const MIN = 60 * 1000;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 500)}`}`);
};

const SLACK = "https://hooks.slack.com/services/" + "T0001TEST/B0001TEST/abcdefghijklmnopqrstWXYZ";
const SLACK_MO = "https://hooks.slack.com/services/" + "T0002TEST/B0002TEST/mmmmmmmmmmmmmmmmmmmmQRST";
const FLOW = "https://hooks.slack.com/workflows/T0001TEST/A0001TEST/123456789/zzzzzzzzzzzz";
const HOOK = "https://hooks.tools.example/catch/123/abc";
const SECRETS = [SLACK, SLACK_MO, FLOW, HOOK, "abcdefghijklmnopqrstWXYZ", "mmmmmmmmmmmmmmmmmmmmQRST", "zzzzzzzzzzzz", "catch/123/abc"];
const leaks = (x: unknown) => {
  const s = JSON.stringify(x);
  return SECRETS.filter((k) => s.includes(k));
};

async function main() {
  const t = await import("../lib/table");
  const n = await import("../lib/notify");
  const url = await import("../lib/notify/url");
  const fmt = await import("../lib/notify/format");
  const tools = await import("../lib/mcp/tools");
  const pub = t.tableInternals.pubId;
  const HANA = "tok-hana-0001";
  const SAL = "tok-sal-0001";
  const MO = "tok-mo-0001";
  const ADA = "tok-ada-0001";
  /** Names resolve to a public address unless a test says otherwise. */
  const dns = new Map<string, string[]>();
  url.setResolver(async (host) => dns.get(host) ?? ["93.184.216.34"]);
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 15));
      await n.settled();
    }
  };
  const act = async (token: string, a: Parameters<typeof t.perform>[1]) => {
    try {
      return { ok: true as const, ...(await t.perform(token, a, "https://post.example.com")) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  };
  const tryIt = async <T,>(fn: () => Promise<T>) => {
    try {
      return { ok: true as const, v: await fn() };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  };
  const to = (u: string) => outbox.filter((x) => x.url === u);
  const textOf = (x: Sent) => JSON.stringify(x.body);
  const clear = () => (outbox.length = 0);

  /* ---------- URLs ---------- */
  console.log("\nWhich URLs are taken");
  const slackOk = tryIt(async () => url.checkSlackUrl(SLACK));
  check("a Slack incoming webhook is taken", (await slackOk).ok && (await slackOk as { v: { kind: string } }).v.kind === "slack");
  const flow = url.checkSlackUrl(FLOW);
  check("a Slack workflow webhook is taken as a workflow", flow.kind === "workflow" && flow.url === FLOW);
  check("spaces around a pasted URL are trimmed", url.checkSlackUrl(`  ${SLACK}\n`).url === SLACK);
  const bad: [string, string, RegExp][] = [
    ["http is refused", SLACK.replace("https:", "http:"), /https:\/\//],
    ["another host is refused in the Slack field", "https://hooks.example.com/services/T0001TEST/B0001TEST/abcdefghijklmnopqrstWXYZ", /isn't a Slack webhook/],
    ["a look-alike host is refused", "https://hooks.slack.com.evil.example/services/T0001TEST/B0001TEST/abcdefghijklmnopqrstWXYZ", /isn't a Slack webhook/],
    ["slack.com itself is refused", "https://slack.com/services/T0001TEST/B0001TEST/abcdefghijklmnopqrstWXYZ", /isn't a Slack webhook/],
    ["a cut-short Slack URL is refused", "https://hooks.slack.com/services/" + "T0001TEST", /cut short/],
    ["a Slack URL with a query is refused", `${SLACK}?x=1`, /extra parts/],
    ["a URL with a sign-in in it is refused", "https://user:pw@hooks.slack.com/services/" + "T0001TEST/B0001TEST/abcdefghijklmnopqrstWXYZ", /sign-in/],
    ["a non-standard port is refused", "https://hooks.slack.com:8443/services/T0001TEST/B0001TEST/abcdefghijklmnopqrstWXYZ", /standard https port/],
    ["something that isn't a URL is refused", "hooks.slack.com/services/x", /full web address/],
    ["an empty field is refused", "", /Paste the webhook URL/],
  ];
  for (const [name, u, re] of bad) {
    const r = await tryIt(async () => url.checkSlackUrl(u));
    check(name, !r.ok && re.test(r.error), r);
  }
  dns.set("hooks.tools.example", ["52.1.2.3"]);
  dns.set("rebind.tools.example", ["52.1.2.3", "10.0.0.7"]);
  dns.set("meta.tools.example", ["169.254.169.254"]);
  dns.set("v6.tools.example", ["fd00::1"]);
  const hookOk = await tryIt(() => url.checkWebhookUrl(HOOK));
  check("a public https webhook is taken", hookOk.ok && hookOk.v.kind === "webhook", hookOk);
  const generic: [string, string][] = [
    ["http is refused for other tools", "http://hooks.tools.example/catch/1"],
    ["a loopback address is refused", "https://127.0.0.1/hook"],
    ["a private address is refused", "https://10.1.2.3/hook"],
    ["a 192.168 address is refused", "https://192.168.1.20/hook"],
    ["a 172.16 address is refused", "https://172.20.0.5/hook"],
    ["the cloud metadata address is refused", "https://169.254.169.254/latest"],
    ["IPv6 loopback is refused", "https://[::1]/hook"],
    ["IPv4 inside IPv6 is refused", "https://[::ffff:127.0.0.1]/hook"],
    ["localhost is refused", "https://localhost/hook"],
    ["an internal name is refused", "https://api.railway.internal/hook"],
    ["a name that resolves to a private address is refused", "https://rebind.tools.example/hook"],
    ["a name that resolves to the metadata address is refused", "https://meta.tools.example/hook"],
    ["a name that resolves to a unique-local IPv6 is refused", "https://v6.tools.example/hook"],
  ];
  for (const [name, u] of generic) {
    const r = await tryIt(() => url.checkWebhookUrl(u));
    check(name, !r.ok, r);
  }
  check("public addresses pass the address check", !url.isPrivateAddress("93.184.216.34") && !url.isPrivateAddress("2606:4700::1111"));
  check("the mask shows the host and last four characters only", url.maskUrl(SLACK) === "hooks.slack.com/…/WXYZ", url.maskUrl(SLACK));

  /* ---------- posting guards ---------- */
  console.log("\nEvery post is guarded");
  clear();
  answers.set("https://hooks.tools.example/redirect", () => new Response("", { status: 302, headers: { location: "https://10.0.0.1/" } }));
  const redir = await url.postJson("https://hooks.tools.example/redirect", "webhook", { a: 1 });
  check("a redirect is not followed and counts as a failure", !redir.ok && redir.error === "redirect" && outbox.length === 1, redir);
  check("posts ask fetch not to follow redirects, with a time limit", outbox[0]?.init.redirect === "manual" && !!outbox[0]?.init.signal, outbox[0]?.init);
  answers.set("https://hooks.tools.example/slow", () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })));
  const slow = await url.postJson("https://hooks.tools.example/slow", "webhook", {});
  check("a post that runs out of time reads as a timeout", !slow.ok && slow.error === "timeout", slow);
  clear();
  const priv = await url.postJson("https://meta.tools.example/x", "webhook", {});
  check("a webhook whose name now points inside is not posted to", !priv.ok && outbox.length === 0, priv);
  const notSlack = await url.postJson("https://evil.example/services/x", "slack", {});
  check("a Slack-kind post only goes to hooks.slack.com", !notSlack.ok && outbox.length === 0, notSlack);
  check("posting waits at most 5 seconds", url.POST_TIMEOUT_MS === 5000);

  /* ---------- connecting ---------- */
  console.log("\nConnecting Slack");
  clear();
  answers.set(SLACK, () => new Response("no_service", { status: 404 }));
  const refused = await tryIt(() => n.connect(HANA, "slack", SLACK));
  check("a URL Slack refuses is not saved", !refused.ok && /didn't take the test/.test(refused.error), refused);
  check("Slack's refusal is explained in plain words", !refused.ok && /removed|Copy the webhook URL again/.test(refused.error), refused);
  check("nothing is connected after a refused URL", (await n.integrationsView(HANA))?.slack === null);
  answers.delete(SLACK);
  clear();
  const signedOut = await tryIt(() => n.connect("tok-nobody", "slack", SLACK));
  check("signed out can't connect", !signedOut.ok && /signed out/.test(signedOut.error) && outbox.length === 0, signedOut);
  const wrongField = await tryIt(() => n.connect(HANA, "slack", HOOK));
  check("a non-Slack URL in the Slack field is refused before anything is sent", !wrongField.ok && outbox.length === 0, wrongField);
  const con = await tryIt(() => n.connect(HANA, "slack", SLACK));
  check("a good Slack URL connects", con.ok && /Connected/.test(con.v.message), con);
  const welcome = to(SLACK)[0];
  check("connecting sends one test message first", to(SLACK).length === 1, to(SLACK).length);
  const blocks = (welcome?.body.blocks ?? []) as { type: string; elements?: { type: string; url?: string; text?: { text: string } }[] }[];
  check("the test is Block Kit with a fallback text", typeof welcome?.body.text === "string" && blocks[0]?.type === "section", welcome?.body);
  const button = blocks.find((b) => b.type === "actions")?.elements?.[0];
  check("it has an Open in Merlin button", button?.type === "button" && button.text?.text === "Open in Merlin" && /^https:\/\/post\.example\.com\//.test(button.url ?? ""), button);
  check("alert copy has no em dashes", !textOf(welcome!).includes("—"));
  const v1 = con.ok ? con.v.view : null;
  check("all three alerts are on after connecting", !!v1 && v1.alerts.roles && v1.alerts.message && v1.alerts.seat, v1);
  check("the view shows the masked URL", v1?.slack?.masked === "hooks.slack.com/…/WXYZ" && v1?.slack?.kind === "slack", v1?.slack);
  check("the view never has the full URL", leaks(v1).length === 0, leaks(v1));
  check("the view knows the member's function", v1?.function === "Marketing", v1?.function);

  clear();
  const test = await tryIt(() => n.sendTest(HANA, "slack"));
  check("Send a test posts a short message", test.ok && to(SLACK).length === 1 && /connected/i.test(String(to(SLACK)[0].body.text)), test);
  const noHook = await tryIt(() => n.sendTest(HANA, "webhook"));
  check("Send a test with nothing connected says what to do", !noHook.ok && /Connect a webhook first/.test(noHook.error), noHook);

  /* ---------- seat alerts: unlocking who held the seat ---------- */
  console.log("\nSomeone engages your seat");
  clear();
  const seat = pub("e_acme_hana");
  const un = await act(SAL, { type: "unlock", entity: "engagement", id: seat, field: "operator" });
  await settle();
  const seatPosts = to(SLACK);
  check("unlocking who held a seat works", un.ok, un);
  check("the seat holder gets one Slack post", seatPosts.length === 1, seatPosts.map(textOf));
  const seatText = seatPosts[0] ? textOf(seatPosts[0]) : "";
  check("it reads as an opportunity, by function and title", /A fractional VP Sales unlocked your seat at Acme Robotics/.test(seatText) && /may want to talk, or partner/.test(seatText), seatText);
  check("it never names the member who unlocked", !/\bSal\b|Starter|sal\.starter/.test(seatText), seatText);
  check("it links to the seat's company", seatText.includes(`?c=${encodeURIComponent(pub("c_acme"))}`), seatText);
  clear();
  await act(HANA, { type: "unlock", entity: "engagement", id: seat, field: "rate" }).catch(() => null);
  await settle();
  check("the seat holder's own actions never alert them", to(SLACK).length === 0, to(SLACK).map(textOf));

  // Facts on the seat, inside the 15 minutes: held for the batch.
  clear();
  const un2 = await act(SAL, { type: "unlock", entity: "engagement", id: seat, field: "rate" });
  await settle();
  check("a second seat event inside 15 minutes waits", un2.ok && to(SLACK).length === 0, { un2, posts: to(SLACK).map(textOf) });
  const un3 = await act(SAL, { type: "unlock", entity: "engagement", id: seat, field: "sourced" });
  await settle();
  check("and so does a third", un3.ok && to(SLACK).length === 0, un3);

  /* ---------- message alerts ---------- */
  console.log("\nNew messages");
  clear();
  const long = `Hi Hana, I saw you led marketing at Acme. Write me at sal.starter@example.com if easier. ${"More words to go past the limit. ".repeat(8)}`;
  const start = await act(SAL, { type: "message.start", engagementId: seat, text: long });
  await settle();
  const msgPosts = to(SLACK);
  check("starting a conversation works", start.ok, start);
  check("the recipient gets one Slack post for the message", msgPosts.length === 1, msgPosts.map(textOf));
  const msgText = msgPosts[0] ? textOf(msgPosts[0]) : "";
  check("it has the sender's first name and the company", /Sal sent you a message about your seat at Acme Robotics/.test(msgText), msgText);
  check("it never has the sender's last name", !/Starter/.test(msgText), msgText);
  check("it never has an email address, even one typed in the message", !/@example\.com/.test(msgText) && /email hidden/.test(msgText), msgText);
  const quoted = (msgPosts[0]?.body.blocks as { text?: { text: string } }[])?.[0]?.text?.text ?? "";
  const snippet = quoted.split("\n")[1] ?? "";
  check("it quotes at most the first 140 characters", [...snippet.replace(/^“|”$/g, "")].length <= 141 && snippet.endsWith("…”"), snippet);
  const convId = (start.ok && "id" in start ? String(start.id) : "") as string;
  check("it links to the conversation", msgText.includes(`p=messages&m=${convId}`), msgText);

  clear();
  const convs = await (await import("../lib/messages")).listConversations(HANA);
  const hanaConv = convs!.conversations[0].id;
  await act(HANA, { type: "message.send", conversationId: hanaConv, text: "Happy to talk." });
  await settle();
  check("the sender gets nothing for their own message (Sal has no Slack)", outbox.length === 0, outbox.map(textOf));
  await act(SAL, { type: "message.send", conversationId: hanaConv, text: "Great, Tuesday works for me." });
  await act(SAL, { type: "message.send", conversationId: hanaConv, text: "Or Wednesday at 10." });
  await settle();
  check("more messages inside 15 minutes wait for the batch", to(SLACK).length === 0, to(SLACK).map(textOf));

  /* ---------- batches ---------- */
  console.log("\nBatches");
  clear();
  skew += 10 * MIN;
  check("nothing goes out before the window opens", (await n.flushDue()) === 0 && outbox.length === 0);
  skew += 6 * MIN;
  const flushed = await n.flushDue();
  await settle();
  const batch = to(SLACK).map(textOf);
  check("after 15 minutes each waiting kind goes out as one post", flushed === 2 && batch.length === 2, { flushed, batch });
  const mBatch = batch.find((x) => /new messages/.test(x)) ?? "";
  check("the message batch has a count", /2 new messages on Merlin/.test(mBatch), mBatch);
  check("the message batch names the sender and company", /Sal, about Acme Robotics/.test(mBatch), mBatch);
  const sBatch = batch.find((x) => /engaged your seats/.test(x)) ?? "";
  check("the seat batch has a count and the facts", /2 times/.test(sBatch) && /unlocked the rate on your seat at Acme Robotics/.test(sBatch) && /how the seat was sourced/.test(sBatch), sBatch);
  check("the seat batch never names the member", !/\bSal\b|Starter/.test(sBatch), sBatch);
  clear();
  check("a batch goes out once", (await n.flushDue()) === 0 && outbox.length === 0);
  skew += 16 * MIN;
  await act(SAL, { type: "message.send", conversationId: hanaConv, text: "See you then." });
  await settle();
  check("after a quiet window the next message goes out at once", to(SLACK).length === 1 && /Sal sent you a message/.test(textOf(to(SLACK)[0])), to(SLACK).map(textOf));

  /* ---------- switches ---------- */
  console.log("\nSwitches");
  skew += 16 * MIN;
  await n.setAlerts(HANA, { message: false });
  clear();
  await act(SAL, { type: "message.send", conversationId: hanaConv, text: "One more thing." });
  await settle();
  check("with message alerts off, a reply sends nothing", outbox.length === 0, outbox.map(textOf));
  const view2 = await n.integrationsView(HANA);
  check("the switch is saved", view2?.alerts.message === false && view2.alerts.seat === true, view2?.alerts);
  await n.setAlerts(HANA, { message: true, bogus: true } as never);

  /* ---------- the weekly scan ---------- */
  console.log("\nNew open roles from the scan");
  clear();
  const mo = await tryIt(() => n.connect(MO, "slack", SLACK_MO));
  check("a second member connects their own Slack", mo.ok, mo);
  // A saved view from the connector's store (the app's "Save this view" uses the same one).
  const ctxMo = { member: (await t.memberForToken(MO))!, origin: "https://post.example.com" };
  const saved = await tools.alerts(ctxMo, { action: "save", name: "Sales at SaaS", function: "Sales", industry: ["SaaS"] }).catch((e) => ({ error: String(e) }));
  check("a saved view is stored for the member", !("error" in saved), saved);
  // A view in another country never matches a US role (the company's country on file, lib/geo.ts).
  const abroad = await tools.alerts(ctxMo, { action: "save", name: "Sales in Germany", function: "Sales", country: ["Germany"] }).catch((e) => ({ error: String(e) }));
  check("a saved view by country is stored", !("error" in abroad), abroad);
  clear();
  const role = (company: string, title: string, fn: string, domain: string | null = null) => ({
    key: `${company}::${title}`.toLowerCase(), company, domain, title, function: fn, type: "Fractional", url: `https://jobs.example.com/${encodeURIComponent(title)}`,
    source: "board", postedAt: null, rate: null, hoursPerWeek: null,
  });
  const found = {
    roles: [role("Beta Labs", "Fractional CMO", "Marketing", "beta.example"), role("Gamma Goods", "Fractional VP Marketing", "Marketing"), role("Beta Labs", "Fractional VP Sales", "Sales", "beta.example"), role("Delta Data", "Fractional RevOps Lead", "RevOps")],
    sources: [{ source: "board", fetched: 4, matched: 4 }],
  };
  const res = await t.applyScan(found);
  await settle();
  check("the scan opened the roles", res.opened === 4, res);
  const moPosts = to(SLACK_MO);
  const hanaPosts = to(SLACK);
  check("one post per member per scan", moPosts.length === 1 && hanaPosts.length === 1, { mo: moPosts.map(textOf), hana: hanaPosts.map(textOf) });
  const moText = moPosts[0] ? textOf(moPosts[0]) : "";
  check("it counts the member's function and their saved view", /3 new open roles for you in the latest scan/.test(moText), moText);
  check("it says which saved view matched", /1 matches your saved view “Sales at SaaS”/.test(moText), moText);
  check("a hidden company stays hidden", !/Beta Labs|Gamma Goods/.test(moText) && /at a SaaS company/.test(moText), moText);
  check("a role reads its standard industry and its country and region", /at a SaaS company, \$5M–\$20M revenue, Texas, US/.test(moText), moText);
  check("a saved view for another country doesn't match", !/Sales in Germany/.test(moText), moText);
  check("the role title stays locked (described by free facts)", !/Fractional CMO|VP Marketing/.test(moText), moText);
  check("a role outside the member's function and views is left out", !/RevOps/.test(moText), moText);
  const hanaText = hanaPosts[0] ? textOf(hanaPosts[0]) : "";
  check("a member with only a function gets their function's roles", /2 new open Marketing roles in the latest scan/.test(hanaText), hanaText);
  check("several roles link to Hiring now", hanaText.includes("https://post.example.com/?v=hiring"), hanaText);
  clear();
  skew += 16 * MIN;
  const res2 = await t.applyScan({ roles: [...found.roles, role("Echo Energy", "Fractional Head of Marketing", "Marketing")], sources: [{ source: "board", fetched: 5, matched: 5 }] });
  await settle();
  const one = to(SLACK).map(textOf);
  check("a later scan alerts only on what it opened", res2.opened === 1 && one.length === 1 && /1 new open Marketing role in the latest scan/.test(one[0]), { res2, one });
  check("one role links to that role's company", one[0]?.includes("?c="), one);
  clear();
  skew += 16 * MIN;
  await t.applyScan({ roles: [...found.roles, role("Echo Energy", "Fractional Head of Marketing", "Marketing")], sources: [{ source: "board", fetched: 5, matched: 5 }] });
  await settle();
  check("a scan that opens nothing sends nothing", outbox.length === 0, outbox.map(textOf));

  /* ---------- other tools ---------- */
  console.log("\nOther tools");
  clear();
  const hk = await tryIt(() => n.connect(HANA, "webhook", HOOK));
  check("a public webhook connects after a test post", hk.ok && to(HOOK).length === 1, hk);
  const hb = to(HOOK)[0]?.body ?? {};
  check("the webhook gets the documented JSON", hb.source === "Merlin" && hb.event === "test" && hb.count === 1 && typeof hb.title === "string" && Array.isArray(hb.lines) && typeof hb.url === "string" && typeof hb.sentAt === "string", hb);
  const privHook = await tryIt(() => n.connect(HANA, "webhook", "https://rebind.tools.example/x"));
  check("a webhook on a private network can't be connected", !privHook.ok && /private network/.test(privHook.error), privHook);
  clear();
  skew += 16 * MIN;
  await act(SAL, { type: "message.send", conversationId: hanaConv, text: "Sent you the deck." });
  await settle();
  check("an alert goes to Slack and the webhook", to(SLACK).length === 1 && to(HOOK).length === 1, outbox.map((x) => x.url.slice(0, 30)));
  check("the webhook alert says what it is", to(HOOK)[0]?.body.event === "message" && /Sal sent you a message/.test(String(to(HOOK)[0]?.body.title)), to(HOOK)[0]?.body);
  check("a workflow webhook gets flat text fields", JSON.stringify(Object.keys(fmt.workflowBody(fmt.testAlert("https://x.example")))) === JSON.stringify(["event", "title", "text", "url", "count"]));
  const esc = fmt.slackBody({ kind: "message", count: 1, headline: "<!channel> hi & bye", lines: ["<https://evil.example|click>"], url: "https://post.example.com/" });
  check("Slack text is escaped so a message can't @channel or hide a link", !JSON.stringify(esc.blocks).includes("<!channel>") && !JSON.stringify(esc.blocks).includes("<https://evil"), esc.blocks);

  /* ---------- a URL that stops working ---------- */
  console.log("\nA webhook that stops working");
  clear();
  skew += 16 * MIN;
  answers.set(HOOK, () => new Response("Not found", { status: 410 }));
  await act(SAL, { type: "message.send", conversationId: hanaConv, text: "Checking in." });
  await settle();
  const v3 = await n.integrationsView(HANA);
  check("a gone webhook is marked stopped", v3?.webhook?.broken === true && !!v3.webhook.problem, v3?.webhook);
  check("Slack still got the alert", to(SLACK).length === 1);
  clear();
  skew += 16 * MIN;
  await act(SAL, { type: "message.send", conversationId: hanaConv, text: "Still there?" });
  await settle();
  check("nothing more goes to a stopped webhook", to(HOOK).length === 0 && to(SLACK).length === 1, outbox.map((x) => x.url.slice(0, 30)));
  answers.delete(HOOK);

  /* ---------- the URL never leaves ---------- */
  console.log("\nThe URL is a secret");
  const asHana = await t.buildView(HANA);
  check("not in the member's table view", leaks(asHana).length === 0, leaks(asHana));
  const asAdmin = await t.buildView(ADA);
  check("not in the admin's view", leaks(asAdmin).length === 0, leaks(asAdmin));
  const exp = await t.exportState();
  check("not in the admin export", leaks(exp).length === 0, leaks(exp));
  check("the export still says who is connected", !!(exp.integrations?.members.mem_hana?.slack), exp.integrations?.members.mem_hana);
  const ctxHana = { member: (await t.memberForToken(HANA))!, origin: "https://post.example.com" };
  const mcpOut = [await tools.myAccount(ctxHana), await tools.listOpenRoles(ctxHana, {}), await tools.alerts(ctxMo, { action: "list" })];
  check("not in what the Claude connector's tools return", leaks(mcpOut).length === 0, leaks(mcpOut));
  check("not in any integrations view", leaks([await n.integrationsView(HANA), await n.integrationsView(MO)]).length === 0);
  check("not in the conversation list", leaks(await (await import("../lib/messages")).listConversations(HANA)).length === 0);

  /* ---------- pilot metrics ---------- */
  console.log("\nPilot metrics");
  const m = asAdmin.admin?.integrations;
  check("admins see counts of connected members", m?.slackConnected === 2 && m.webhookConnected === 1 && m.broken === 1, m);
  check("and alerts sent by type", !!m && m.sent.message >= 4 && m.sent.seat >= 2 && m.sent.roles >= 3 && m.sent.test >= 3, m);
  check("and failures", !!m && m.failed >= 1, m);
  const asMember = await t.buildView(HANA);
  check("members don't see the metrics", !asMember.admin, asMember.admin);

  /* ---------- removing ---------- */
  console.log("\nRemoving");
  clear();
  const rm = await n.removeDest(HANA, "slack");
  check("Remove forgets the Slack URL", rm.view.slack === null && /Removed/.test(rm.message), rm);
  await n.removeDest(HANA, "webhook");
  skew += 16 * MIN;
  await act(SAL, { type: "message.send", conversationId: hanaConv, text: "Bye for now." });
  await act(SAL, { type: "unlock", entity: "engagement", id: seat, field: "end" });
  await settle();
  check("after removing, nothing is sent", outbox.length === 0, outbox.map((x) => x.url.slice(0, 30)));
  const st = await t.loadState();
  check("the URL is gone from the state", leaks(st.integrations?.members.mem_hana ?? {}).length === 0, st.integrations?.members.mem_hana);

  /* ---------- the words ---------- */
  console.log("\nThe words");
  check("a title with a company in it is cut", fmt.actorWords({ function: "Sales", title: "Fractional CRO at Bigco, Inc." }) === "a fractional CRO", fmt.actorWords({ function: "Sales", title: "Fractional CRO at Bigco, Inc." }));
  check("no title falls back to the function", fmt.actorWords({ function: "RevOps", title: null }) === "a fractional RevOps leader");
  check("'an' before a vowel", fmt.actorWords({ function: null, title: "Interim CMO" }) === "an Interim CMO");
  check("the 140-character snippet", [...fmt.snippetOf("x".repeat(300))].length === 141);
}

main()
  .catch((e) => {
    failures++;
    console.log(`FAIL crashed: ${(e as Error).stack}`);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
