/**
 * Checks of the services' own icons and the connection switches (owner's asks: real service icons
 * wherever a service is named, and on/off switches in place of Connect buttons, the way Claude does):
 *
 *  1. GET /api/logo/svc/<key> (lib/serviceIcon.ts): only the allowlisted keys, each read from that
 *     service's own site under lib/logo.ts's rules (robots.txt, the same registrable domain, no
 *     redirect elsewhere, raster only), a second domain when the first has none, kept on the data
 *     volume, 204 with no body for an unknown key (a webhook, a file, a made-up or a path-like key)
 *     with nothing fetched, RN_LOGO_LOOKUP=off honoured, its own per-address limit, and the test
 *     server's loopback switch read only with RN_SCAN_TEST=1. Fake sites on 127.0.0.1 only.
 *  2. <ServiceIcon>: our own address, never an icon service's; the glyph under it until it loads (no
 *     broken image); no request for a webhook, a file, email or the bell; the landing page's Works
 *     with strip draws Google, Slack, Claude and Granola, and public pages never name LinkedIn.
 *  3. The switches: Off to on starts each source's own connect flow (settings/model.ts connectStep:
 *     Google's OAuth, Add to Slack or the URL form, Connect Granola or its key form, the file
 *     pickers, Agent access); on to off asks first and runs the very remove it ran before
 *     (REMOVE, runRemove); role="switch", 44px, pine; drawn on the server for a made-up member.
 *
 * In process, no seed, no real site.
 *
 *   npx tsx scripts/test-service-icons.mts
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import Module, { register } from "node:module";
import os from "node:os";
import path from "node:path";

const M = Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> };
M._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const dir = mkdtempSync(path.join(os.tmpdir(), "rn-svcicon-"));
Object.assign(process.env, { RN_DATA_DIR: dir, RN_INTEL_SEED: path.join(dir, "intel-seed.json"), RN_LOGO_LOOKUP: "off", RN_ID_SECRET: "svc-icons-test" });
for (const k of ["RN_SCAN_TEST", "RN_ABOUT_TEST_PORT", "RN_SVC_ICON_TEST"]) delete process.env[k];

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 1200)}`);
};
const root = process.cwd();
const src = (f: string) => readFileSync(path.join(root, f), "utf8");
/** Code without its comments. */
const code = (f: string) => src(f).replace(/^\s*(\*|\/\/|\/\*).*$/gm, "");

const png = (w: number) => {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, w);
  return b;
};
const ico = (w: number) => Uint8Array.from([0, 0, 1, 0, 1, 0, w, w, 0, 0, 1, 0, 32, 0, 9, 9, 9, 9, 22, 0, 0, 0]);

/**
 * The fake services, by the Host header (every name resolves to 127.0.0.1 here):
 *  - slack.com: links a 180px apple-touch-icon on its own site, an SVG and one on a CDN elsewhere;
 *  - claude.ai: no icon at all; anthropic.com (Claude's second domain): its manifest's 192px PNG;
 *  - linkedin.com: robots.txt says no to everyone;
 *  - chatgpt.com: its homepage redirects to another site; openai.com: a 32px /favicon.ico;
 *  - granola.ai: only an SVG icon;
 *  - google.com: links a 64px PNG.
 */
const ICON_PORT = 6791;
const asked: { host: string; path: string }[] = [];
const sites = http.createServer((req, res) => {
  const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
  const p = req.url ?? "/";
  asked.push({ host, path: p });
  const send = (status: number, type: string, body: string | Uint8Array, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": type, ...extra });
    res.end(body);
  };
  if (p === "/robots.txt") return host === "linkedin.com" ? send(200, "text/plain", "User-agent: *\nDisallow: /\n") : send(404, "text/plain", "none");
  if (host === "slack.com") {
    if (p === "/") return send(200, "text/html", `<html><head><link rel="icon" href="/s.svg"><link rel="apple-touch-icon" href="https://cdn.elsewhere.example/slack.png"><link rel="apple-touch-icon" href="/img/touch-180.png" sizes="180x180"></head></html>`);
    if (p === "/img/touch-180.png") return send(200, "image/png", png(180), { etag: '"slack"', "x-upstream": "slack.com" });
    return send(404, "text/plain", "no");
  }
  if (host === "claude.ai") return p === "/" ? send(200, "text/html", "<html><head><title>Claude</title></head></html>") : send(404, "text/plain", "no");
  if (host === "anthropic.com") {
    if (p === "/") return send(200, "text/html", `<html><head><link rel="manifest" href="/site.webmanifest"></head></html>`);
    if (p === "/site.webmanifest") return send(200, "application/manifest+json", JSON.stringify({ icons: [{ src: "/i/a192.png", sizes: "192x192", type: "image/png" }] }));
    if (p === "/i/a192.png") return send(200, "image/png", png(192));
    return send(404, "text/plain", "no");
  }
  if (host === "chatgpt.com" && p === "/") return send(302, "text/plain", "", { location: "http://elsewhere.example/" });
  if (host === "openai.com") return p === "/" ? send(200, "text/html", "<html></html>") : p === "/favicon.ico" ? send(200, "image/x-icon", ico(32)) : send(404, "text/plain", "no");
  if (host === "granola.ai") return p === "/" ? send(200, "text/html", `<html><head><link rel="icon" href="/g.svg"></head></html>`) : send(200, "image/svg+xml", "<svg xmlns='http://www.w3.org/2000/svg'/>");
  if (host === "google.com") return p === "/" ? send(200, "text/html", `<html><head><link rel="icon" href="/g64.png" sizes="64x64"></head></html>`) : p === "/g64.png" ? send(200, "image/png", png(64)) : send(404, "text/plain", "no");
  send(404, "text/plain", "no");
});

async function main() {
  /* ---------- 1. the route ---------- */
  console.log("The service icon route (GET /api/logo/svc/<key>)");
  const Lg = await import("../lib/logo.ts");
  const S = await import("../lib/serviceIcon.ts");
  await new Promise<void>((done) => sites.listen(ICON_PORT, "127.0.0.1", done));
  const realFetch = globalThis.fetch;
  const fetched: string[] = [];
  globalThis.fetch = (async (u: unknown, i?: unknown) => (fetched.push(String(u)), realFetch(u as never, i as never))) as typeof fetch;
  Lg.iconTest.opts = { resolve: async () => ["127.0.0.1"], allow: { loopback: true, port: ICON_PORT } };
  Lg.iconTest.dir = path.join(dir, "icons");
  process.env.RN_LOGO_LOOKUP = "on";
  let ip = 10;
  const ask = (key: string, from = `198.51.100.${ip++}`) => S.serviceIconResponse(new Request(`http://localhost/api/logo/svc/${encodeURIComponent(key)}`, { headers: { "x-forwarded-for": from } }), key);
  const hostsSince = (n: number) => [...new Set(asked.slice(n).map((x) => x.host))];

  check(
    "the allowlist: Google, Slack, Claude, Claude Code, ChatGPT, Cursor, Granola, LinkedIn, Stripe, each on its own service's domains",
    JSON.stringify(S.SERVICE_SITES) ===
      JSON.stringify({ google: ["google.com"], slack: ["slack.com"], claude: ["claude.ai", "anthropic.com"], "claude-code": ["claude.ai", "anthropic.com"], chatgpt: ["chatgpt.com", "openai.com"], cursor: ["cursor.com"], granola: ["granola.ai"], linkedin: ["linkedin.com"], stripe: ["stripe.com"] }),
    S.SERVICE_SITES,
  );
  let from = asked.length;
  const slack = await ask("slack");
  const slackBytes = new Uint8Array(await slack.arrayBuffer());
  check(
    "slack: its 180px apple-touch-icon from slack.com, as image bytes from our own origin, kept a day by browsers",
    slack.status === 200 && slack.headers.get("content-type") === "image/png" && slackBytes.length === 40 && slack.headers.get("cache-control") === "public, max-age=86400" && slack.headers.get("cross-origin-resource-policy") === "same-origin",
    { status: slack.status, headers: Object.fromEntries(slack.headers.entries()) },
  );
  check("only slack.com was asked: robots.txt, the homepage, the icon; never the SVG or the CDN's", hostsSince(from).join() === "slack.com" && asked.slice(from).map((x) => x.path).join(" ") === "/robots.txt / /robots.txt /img/touch-180.png", asked.slice(from));
  check("none of the site's headers come through", !slack.headers.has("etag") && !slack.headers.has("x-upstream") && !slack.headers.has("location"), Object.fromEntries(slack.headers.entries()));
  from = asked.length;
  const again = await ask("slack");
  check("a second ask is answered from memory, nothing fetched", again.status === 200 && asked.length === from);
  Lg.forgetIcons();
  const disk = await ask("slack");
  check("after a restart, from the data volume, nothing fetched", disk.status === 200 && asked.length === from && readdirSync(path.join(dir, "icons")).length >= 1);
  from = asked.length;
  const claude = await ask("claude");
  check("claude: claude.ai has none, so anthropic.com (its second domain), its manifest's 192px icon", claude.status === 200 && Lg.imageWidth(new Uint8Array(await claude.arrayBuffer())) === 192 && hostsSince(from).join() === "claude.ai,anthropic.com", asked.slice(from));
  from = asked.length;
  const code1 = await ask("claude-code");
  check("claude-code shares Claude's icon and cache: nothing fetched again", code1.status === 200 && asked.length === from);
  from = asked.length;
  const li = await ask("linkedin");
  check("linkedin: robots.txt says no, so the site is left alone after reading it: 204, no body", li.status === 204 && (await li.text()) === "" && asked.slice(from).every((x) => x.path === "/robots.txt" && x.host === "linkedin.com"), asked.slice(from));
  from = asked.length;
  const gpt = await ask("chatgpt");
  check("chatgpt: a homepage that redirects to another site is not followed; openai.com's favicon instead", gpt.status === 200 && gpt.headers.get("content-type") === "image/x-icon" && hostsSince(from).every((h) => h === "chatgpt.com" || h === "openai.com"), asked.slice(from));
  const gran = await ask("granola");
  check("granola: an SVG is never sent on (it can carry script): 204", gran.status === 204);
  from = asked.length;
  const odd = await Promise.all(["webhook", "csv", "email", "bell", "evil", "../../etc/passwd", "", "constructor", "__proto__", "slack.com", "SLACK", "google.com/s2"].map((k) => ask(k)));
  check(
    "any other key (a webhook, a file, email, the bell, made-up, path-like, prototype names, a domain): 204 with no body, nothing fetched",
    odd.every((r) => r.status === 204 && r.headers.get("content-length") === null) && asked.length === from,
    odd.map((r) => r.status),
  );
  check(
    "every request went to a service's own domain on 127.0.0.1, and fetch() (an icon service) was never used",
    asked.every((x) => Object.values(S.SERVICE_SITES).flat().includes(x.host as never)) && fetched.length === 0,
    { hosts: [...new Set(asked.map((x) => x.host))], fetched },
  );
  process.env.RN_LOGO_LOOKUP = "off";
  Lg.forgetIcons();
  from = asked.length;
  const offKept = await ask("slack");
  const offNew = await ask("cursor");
  check("RN_LOGO_LOOKUP=off: a kept icon still shows, nothing new is read (a 204, the glyph shows)", offKept.status === 200 && offNew.status === 204 && asked.length === from);
  const burst: number[] = [];
  for (let k = 0; k <= Lg.LOGO_PER_MINUTE; k++) burst.push((await ask("evil", "198.51.100.250")).status);
  check("past LOGO_PER_MINUTE a minute from one address: 429, its own limit (another address unaffected)", burst.at(-1) === 429 && (await ask("slack", "198.51.100.251")).status === 200);
  // The test server's loopback switch: only on a test server.
  process.env.RN_SVC_ICON_TEST = "loopback";
  process.env.RN_ABOUT_TEST_PORT = String(ICON_PORT);
  check("RN_SVC_ICON_TEST is not read without RN_SCAN_TEST=1", S.serviceFetchOpts() === undefined);
  process.env.RN_SCAN_TEST = "1";
  const o = S.serviceFetchOpts();
  check("with RN_SCAN_TEST=1: every service's domain is read from 127.0.0.1 on the test port", !!o && JSON.stringify(o.allow) === JSON.stringify({ loopback: true, port: ICON_PORT }) && JSON.stringify(await o.resolve!("slack.com")) === '["127.0.0.1"]', o?.allow);
  for (const k of ["RN_SCAN_TEST", "RN_ABOUT_TEST_PORT", "RN_SVC_ICON_TEST"]) delete process.env[k];
  globalThis.fetch = realFetch;
  await new Promise<void>((done) => sites.close(() => done()));
  const route = src("app/api/logo/svc/[key]/route.ts");
  check("the route is GET /api/logo/svc/[key], guarded, answering with serviceIconResponse", /export const GET = guarded\(/.test(route) && /serviceIconResponse\(req, \(await ctx\.params\)\.key\)/.test(route));
  check("no third-party icon service anywhere in the icon code", !/google\.com\/s2|duckduckgo|clearbit|favicon\.(io|im)|icon\.horse|logo\.dev/i.test(code("lib/serviceIcon.ts") + code("app/ui/ServiceIcon.tsx") + code("lib/logo.ts")));

  /* ---------- 2. the component ---------- */
  console.log("\n<ServiceIcon>");
  const React = await import("react");
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const SI = await import("../app/ui/ServiceIcon.tsx");
  check("its brand services are exactly the route's allowlist", JSON.stringify([...SI.BRAND_SERVICES].sort()) === JSON.stringify([...S.SERVICE_KEYS].sort()), { ui: SI.BRAND_SERVICES, route: S.SERVICE_KEYS });
  const draw = (el: unknown) => renderToStaticMarkup(el as never);
  const sl = draw(React.createElement(SI.ServiceIcon, { service: "slack", size: 18 }));
  check("slack: our own /api/logo/svc/slack, hidden until it loads, with Slack's glyph under it (never a broken image)", /src="\/api\/logo\/svc\/slack"/.test(sl) && /svc-wait/.test(sl) && /<svg/.test(sl) && /alt=""/.test(sl) && /aria-hidden="true"/.test(sl), sl);
  const plain = ["webhook", "csv", "email", "bell"].map((k) => draw(React.createElement(SI.ServiceIcon, { service: k as never })));
  check("a webhook, a contacts file, email and the bell: their plain glyph, and no request", plain.every((h) => !/<img/.test(h) && /<svg/.test(h)), plain);
  const fb = draw(React.createElement(SI.ServiceIcon, { service: "granola", fallback: React.createElement("i", { className: "mine" }) }));
  check("a page's own glyph can stand in while it loads", /class="mine"/.test(fb) && /\/api\/logo\/svc\/granola/.test(fb));
  const css = src("app/ui/serviceIcon.css");
  check("the image sits over the glyph and stays invisible until it has loaded", /\.svc-i\.svc-wait > img\s*\{\s*opacity: 0;/.test(css) && /position: absolute/.test(css));
  const WW = await import("../app/landing/WorksWith.tsx");
  const ww = draw(React.createElement(WW.default, { live: { google: true, granola: true } }));
  check(
    "the landing page's Works with: Google, Slack, Claude and Granola, each its own icon from our origin, and never LinkedIn",
    ["google", "slack", "claude", "granola"].every((k) => ww.includes(`/api/logo/svc/${k}`)) && !/linkedin/i.test(ww) && !/—/.test(ww),
    ww.slice(0, 400),
  );
  // Public pages never name LinkedIn, and so never draw its icon.
  const pub = ["app/landing", "app/data", "app/privacy", "app/terms", "app/legal"].filter((d) => { try { return statSync(path.join(root, d)).isDirectory(); } catch { return false; } });
  const pubFiles = pub.flatMap((d) => readdirSync(path.join(root, d), { recursive: true }).map((f) => `${d}/${f}`).filter((f) => /\.tsx?$/.test(f)));
  check("no public page asks for LinkedIn's icon", pubFiles.length > 3 && pubFiles.every((f) => !/service=["{]?["']?linkedin|svc\/linkedin/.test(src(f))), pubFiles.filter((f) => /svc\/linkedin|service="linkedin"/.test(src(f))));
  const uses = ["app/post/settings/Connections.tsx", "app/post/agent/AgentAccess.tsx", "app/post/alerts/Alerts.tsx", "app/landing/WorksWith.tsx", "app/post/GranolaSection.tsx", "app/post/network/Network.tsx", "app/post/network/WarmPaths.tsx", "app/onboard/SetupKnow.tsx", "app/post/Integrations.tsx"];
  check("ServiceIcon is used where services are named: Connections, Agent access, Alerts, Works with, Granola, Google prompts, Warm paths, Who you know, Integrations", uses.every((f) => /<ServiceIcon\b/.test(src(f))), uses.filter((f) => !/<ServiceIcon\b/.test(src(f))));
  const al = code("app/post/alerts/Alerts.tsx");
  check("Alerts' destinations: only Slack has a brand icon (email, the bell and a webhook their glyphs)", /<Dest t="Email" svc="email"/.test(al) && /<Dest t="The bell" svc="bell"/.test(al) && (al.match(/svc="webhook"/g) ?? []).length === 2 && (al.match(/svc="slack"/g) ?? []).length === 3);
  const C = await import("../app/post/settings/Connections.tsx");
  check("Connections' icons: each service its own, LinkedIn on its two rows (signed in), a plain glyph for the webhook and the contacts file", JSON.stringify(C.CONN_ICON) === JSON.stringify({ google: "google", linkedin: "linkedin", lix: "linkedin", csv: "csv", slack: "slack", hook: "webhook", granola: "granola", agent: "claude" }));

  /* ---------- 3. the switches ---------- */
  console.log("\nThe switches");
  const model = await import("../app/post/settings/model.ts");
  const ctx = { googleConfigured: true, slackApp: true, granolaOauth: true };
  const steps = Object.fromEntries((["google", "linkedin", "lix", "csv", "slack", "hook", "granola", "agent"] as const).map((k) => [k, model.connectStep(k, ctx)]));
  check(
    "off to on starts each source's own connect flow: Google's OAuth, Add to Slack, Connect Granola back to its row, the file pickers at once, the webhook form, Agent access",
    JSON.stringify(steps) ===
      JSON.stringify({ google: { go: "google" }, linkedin: { go: "open", pick: true }, lix: { go: "open", pick: true }, csv: { go: "open", pick: true }, slack: { go: "slack-oauth", url: "/api/integrations/slack/start" }, hook: { go: "open", pick: false }, granola: { go: "granola-oauth", back: "/?p=settings&sec=conn&open=granola" }, agent: { go: "page", page: "agent" } }),
    steps,
  );
  const lean = { googleConfigured: false, slackApp: false, granolaOauth: false };
  check(
    "without Slack's app or Granola's sign-in: their forms (a webhook URL, an API key); Google not set up: it stays off, said plainly",
    JSON.stringify(model.connectStep("slack", lean)) === '{"go":"open","pick":false}' && JSON.stringify(model.connectStep("granola", lean)) === '{"go":"open","pick":false}' && model.connectStep("google", lean).go === "none",
  );
  check("cancelled or failed, plain words: it stays off and nothing was connected", model.staysOff("Slack") === "Slack stays off. Nothing was connected." && model.staysOff("Your contacts file", "That file is too large.") === "That file is too large. Your contacts file stays off. Nothing was connected.");
  const cx = code("app/post/settings/Connections.tsx");
  check(
    "Connections runs those same flows: startGoogle(), Add to Slack's address, startGranola(back), the row opened with its picker, Agent access",
    /return startGoogle\(\);/.test(cx) && /window\.location\.assign\(step\.url\)/.test(cx) && /return startGranola\(step\.back\);/.test(cx) && /return setOpen\(r\.key\);/.test(cx) && /return c\.openPage\(step\.page\);/.test(cx) && /autoPick=\{pick\}/.test(cx),
  );
  check("on to off asks first, then runs the very remove it always did: runRemove(REMOVE[key])", /if \(r\.on\) return setAsking\(/.test(cx) && /runRemove\(REMOVE\[r\.key\], data\.apps \?\? \[\]\)/.test(cx));
  const NOW = Date.parse("2026-11-20T15:00:00Z");
  const d = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
  const file = { at: d(1), rows: 40, matched: 12, skipped: 0 };
  const on = model.connRows({
    google: { configured: true, link: { connectedAt: d(9), syncedAt: d(0), status: "ok" } as never, gmail: null, claude: null, syncing: false, companies: 3 },
    paths: { linkedin: file as never, csv: file as never, lix: { at: d(1), uses: ["know"], files: ["connections"], counts: { connections: 40 } } },
    integ: { allowed: true, slackApp: true, slack: { masked: "…abcd", addedAt: d(3), lastOkAt: d(0), channel: "#deals", team: "Avery Revenue" } as never, webhook: { masked: "…wxyz", addedAt: d(2), lastOkAt: null } as never },
    granola: { on: true, connected: true, canDraft: true, via: "oauth", connectedAt: d(4) } as never,
    apps: [{ id: "g1", name: "Claude", connectedAt: d(5), lastUsedAt: d(0) }],
    nowMs: NOW,
  });
  check("every on row asks \"Turn off ...?\" before its delete", on.length === 8 && on.every((r) => r.on && !!r.remove && /^Turn off .+\?/.test(r.remove.ask) && /^Turn off/.test(r.remove.yes)), on.map((r) => r.remove?.ask.slice(0, 40)));
  check("Google's question says Merlin deletes what it read from it", /^Turn off Google\? .*deletes what it read from it/.test(on[0].remove!.ask));
  // The Remove calls behind the switch: unchanged.
  check("the remove behind each switch is unchanged", JSON.stringify(model.REMOVE) === JSON.stringify({ google: { via: "google", op: "disconnect" }, linkedin: { via: "paths", op: "delete" }, lix: { via: "export", op: "remove" }, csv: { via: "paths", op: "deleteCsv" }, slack: { via: "integrations", body: { op: "remove", field: "slack" } }, hook: { via: "integrations", body: { op: "remove", field: "webhook" } }, granola: { via: "granola", op: "disconnect" }, agent: { via: "oauth", op: "revoke" } }));
  // Warm paths and the set-up: the same removes, through the shared off switch.
  const sw = code("app/post/network/sourceSwitch.tsx");
  const wp = code("app/post/network/WarmPaths.tsx");
  const sk = code("app/onboard/SetupKnow.tsx");
  check("the shared off switch asks first and runs runRemove for each of the source's own calls", /await runRemove\(call\)/.test(sw) && /<OffAsk /.test(sw));
  check(
    "Warm paths' sources: Google's OAuth, the pickers at once, and REMOVE's own calls to turn off",
    /startGoogle\(\)/.test(wp) && /removes: \[REMOVE\.google\]/.test(wp) && /removes: \[REMOVE\.linkedin\]/.test(wp) && /removes: \[REMOVE\.lix\]/.test(wp) && /removes: \[REMOVE\.csv\]/.test(wp) && /autoPick=\{pend === open\}/.test(wp) && /autoPick=\{pend === "export"\}/.test(wp),
  );
  check(
    "the set-up's Who you know: Connect Google back to this step, the pickers at once, the LinkedIn card turning off the export and the file",
    /startGoogle\("onboard"\)/.test(sk) && /\[REMOVE\.google\]/.test(sk) && /REMOVE\.lix/.test(sk) && /REMOVE\.linkedin/.test(sk) && /\[REMOVE\.csv\]/.test(sk) && /autoPick=\{pending\}/.test(sk),
  );
  const ag = code("app/post/agent/AgentAccess.tsx");
  check("Agent access: each agent on a switch; off asks, then revokes it as before; on shows the connect steps", /<ConnToggle/.test(ag) && /setAsking\(app\.id\)/.test(ag) && /send\("\/api\/oauth\/apps", \{ revoke: id \}\)/.test(ag) && /setPick\(def\.id\), setStepsOpen\(true\)/.test(ag));
  const pick = code("app/post/network/useAutoPick.ts");
  check("a picker opened by a switch says when it is closed with no file (the cancel event)", /addEventListener\("cancel"/.test(pick) && /el\.click\(\)/.test(pick));
  const T = await import("../app/ui/ConnToggle.tsx");
  const offH = draw(React.createElement(T.ConnToggle, { name: "Google", on: false, onFlip: () => {} }));
  const onH = draw(React.createElement(T.ConnToggle, { name: "Google", on: true, onFlip: () => {} }));
  const pendH = draw(React.createElement(T.ConnToggle, { name: "Slack", on: false, pending: true, onFlip: () => {} }));
  check("the switch: role=switch with aria-checked and the source's name, On, Off or Connecting", /role="switch"/.test(offH) && /aria-checked="false"/.test(offH) && /aria-label="Google"/.test(offH) && />Off</.test(offH) && /aria-checked="true"/.test(onH) && />On</.test(onH) && /aria-checked="false"/.test(pendH) && />Connecting</.test(pendH), { offH, onH, pendH });
  const tcss = src("app/ui/connToggle.css");
  check("a 44px target, pine when on", /min-height: 44px/.test(tcss) && /min-width: 44px/.test(tcss) && /\.ctg\.on \.ctg-track \{\s*background: #073f2f;/.test(tcss));
  const askH = draw(React.createElement(T.OffAsk, { ask: "Turn off Google? Merlin deletes what it read from it.", onYes: () => {}, onNo: () => {} }));
  check("the question: Turn off, or Keep it on", /Turn off Google\?/.test(askH) && />Turn off</.test(askH) && />Keep it on</.test(askH));

  // Drawn on the server: Settings / Connections with switches, for a made-up member.
  const { AppCtxProvider } = await import("../app/post/shell/pages.tsx");
  const noop = () => {};
  const app = { me: { id: "mem_jordan", name: "Jordan Avery" }, phone: false, openPage: noop, table: { setRecordType: noop }, openSeats: noop };
  const data = { net: { view: { configured: true, google: null }, off: false }, paths: null, lix: null, integ: null, setInteg: noop, granola: null, apps: [], reloadApps: noop };
  const html = draw(React.createElement(AppCtxProvider, { value: app as never }, React.createElement(C.Connections, { rows: on, open: null, setOpen: noop, data: data as never, onNotif: noop, flash: noop })));
  const sws = html.match(/role="switch"/g) ?? [];
  check("Connections draws one switch a row (on for every connected row), a Manage link each, and no Connect or Remove button", sws.length === 8 && (html.match(/aria-checked="true"/g) ?? []).length === 8 && (html.match(/>Manage</g) ?? []).length === 8 && !/>Remove</.test(html) && !/>Connect</.test(html), { switches: sws.length });
  check("each row's icon is the service's own, from our origin", ["google", "slack", "granola", "claude", "linkedin"].every((k) => html.includes(`/api/logo/svc/${k}`)) && !html.includes("/api/logo/svc/webhook"));
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
}
rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
