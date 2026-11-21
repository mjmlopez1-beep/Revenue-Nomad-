import { NextRequest, NextResponse } from "next/server";
import { readdirSync } from "fs";
import path from "path";
import { clientIp, limited } from "@/lib/rateLimit";
import { unsubscribe } from "@/lib/table";
import { radarLinkMember, setRadarEmail } from "@/lib/radar";
import { FEATURE_NAME, RADAR_EVERY_WHEN } from "@/lib/radar/types";
import { guarded, isBusy, isDown } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";

/**
 * The app's own typeface for this page. The build gives the font file a hashed name, so it is
 * looked up once. Without it (no build output next to the server) the page falls back to the
 * system face, the same one the email uses.
 */
let fontFace: string | null = null;
function appFont(): string {
  if (fontFace !== null) return fontFace;
  fontFace = "";
  try {
    const file = readdirSync(path.join(process.cwd(), ".next", "static", "media")).find((f) => /^schibsted-grotesk-latin-wght-normal\.[\w-]+\.woff2$/.test(f));
    if (file)
      fontFace = `@font-face{font-family:"Schibsted Grotesk Variable";font-style:normal;font-display:swap;font-weight:400 900;src:url(/_next/static/media/${file}) format("woff2-variations")}`;
  } catch {
    /* system fonts */
  }
  return fontFace;
}

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#FAFAF7;color:#28322D;font-family:"Schibsted Grotesk Variable",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:24px;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
.top{display:flex;align-items:center;height:56px;padding:0 24px;background:#073F2F}
.brand{display:inline-flex;align-items:center;gap:12px;min-height:44px;border-radius:8px;color:#fff;text-decoration:none}
.brand img{display:block;height:28px;width:auto}
.brand span{padding:2px 0 0 12px;border-left:1px solid rgba(255,255,255,.24);font-size:13.5px;line-height:20px;font-weight:500;color:rgba(255,255,255,.78);white-space:nowrap}
main{max-width:480px;margin:64px auto 0;padding:0 16px 32px}
.card{padding:32px;background:#fff;border:1px solid #E2E6E3;border-radius:10px}
.done{display:flex;align-items:center;justify-content:center;width:40px;height:40px;margin:0 0 16px;border-radius:50%;background:#2EE59D;color:#073F2F}
h1{margin:0 0 8px;color:#0A1A13;font-size:28px;line-height:34px;font-weight:800;letter-spacing:-.025em;text-wrap:balance}
p{margin:0}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:24px;padding:0 16px;border:0;border-radius:8px;background:#073F2F;color:#fff;font:inherit;font-size:15px;font-weight:700;text-decoration:none;cursor:pointer;transition:background-color .15s ease}
.btn:hover{background:#0E5640}
.btn:active{background:#052E22}
.btn-ghost{background:#fff;color:#073F2F;box-shadow:inset 0 0 0 1.5px #C9D2CD}
.btn-ghost:hover{background:#F2F5F3}
.btn-ghost:active{background:#E8EDEA}
.acts{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
.acts form{margin:0}
.acts .btn{margin-top:0}
.sub{margin:8px 0 0;color:#5B6661;font-size:15px;line-height:22px}
.foot a{color:#073F2F;font-weight:600}
a:focus-visible,button:focus-visible{outline:2px solid #2EE59D;outline-offset:2px}
.foot{margin:16px 0 0;color:#5B6661;font-size:13px;line-height:20px}
@media (max-width:480px){.top{padding:0 16px}main{margin-top:24px}.card{padding:24px}h1{font-size:26px;line-height:32px}.btn{width:100%;min-height:48px;font-size:16px}.acts{flex-direction:column}.acts form{width:100%}}
@media (max-width:359px){.brand span{display:none}}
@media (prefers-reduced-motion:reduce){.btn{transition:none}}
`.replace(/\n/g, "");

const CHECK =
  '<div class="done" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg></div>';

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Where the member sets every email: Notifications, in the app. */
const NOTIFICATIONS = "/?p=notifications";
const FOOT = "Merlin is a data exchange for fractional operators, from Revenue Nomad.";

/** One small page in the product's frame: what happened, in a sentence or two, and one way back (`back`, the app's home by default). */
const page = (title: string, body: string, status = 200, back: { href: string; label: string } = { href: "/", label: "Open Merlin" }, foot = FOOT) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Merlin</title><style>${appFont()}${CSS}</style></head>
<body>
<header class="top"><a class="brand" href="/" aria-label="Merlin by Revenue Nomad, home"><img src="/brand/merlin-lockup-on-dark.png" alt="Merlin by Revenue Nomad" width="122" height="36"></a></header>
<main>
<div class="card">
${status === 200 ? CHECK : ""}<h1>${title}</h1>
<p>${body}</p>
<a class="btn" href="${back.href}">${back.label}</a>
</div>
<p class="foot">${foot}</p>
</main>
</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

/** While Merlin cannot serve, the link answers 503 with a page, and nothing is changed. */
const paused = (e: unknown) => (isDown(e) || isBusy(e) ? page("Try this link again in a few minutes", "Merlin is paused while we fix a problem on our side. Your weekly email setting has not changed yet.", 503) : null);

/** The radar email's link carries r=radar (and its own signature, lib/radar radarSig): it sets the radar's email, not the weekly email. */
const isRadar = (q: URLSearchParams) => q.get("r") === "radar";

/**
 * The radar email's unsubscribe page, before anything changes: "Send it weekly instead" first, then
 * "Turn it off". Each is a form that posts back here with do=weekly or do=off. Slack is set apart.
 */
function radarChoice(q: URLSearchParams, now: "daily" | "twice" | "weekly") {
  const action = esc(`/api/table/unsubscribe?${new URLSearchParams({ m: q.get("m") ?? "", s: q.get("s") ?? "", r: "radar" })}`);
  const form = (choice: "weekly" | "off", label: string, ghost: boolean) =>
    `<form method="post" action="${action}"><input type="hidden" name="do" value="${choice}"><button type="submit" class="btn${ghost ? " btn-ghost" : ""}">${label}</button></form>`;
  const weekly = now === "weekly";
  const title = weekly ? `Turn off ${FEATURE_NAME} emails?` : `Fewer ${FEATURE_NAME} emails?`;
  const lead = weekly
    ? `It comes once a week now. ${RADAR_EVERY_WHEN.weekly}`
    : `You can get it once a week instead. ${RADAR_EVERY_WHEN.weekly}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Merlin</title><style>${appFont()}${CSS}</style></head>
<body>
<header class="top"><a class="brand" href="/" aria-label="Merlin by Revenue Nomad, home"><img src="/brand/merlin-lockup-on-dark.png" alt="Merlin by Revenue Nomad" width="122" height="36"></a></header>
<main>
<div class="card">
<h1>${title}</h1>
<p>${lead}</p>
<p class="sub">Turning the email off doesn't change ${FEATURE_NAME} in Slack.</p>
<div class="acts">
${weekly ? form("off", "Turn it off", false) : `${form("weekly", "Send it weekly instead", false)}\n${form("off", "Turn it off", true)}`}
</div>
</div>
<p class="foot">Choose how often each email comes, and what goes to Slack, in <a href="${NOTIFICATIONS}">Notifications</a>.</p>
</main>
</body></html>`;
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/** After a choice: what changed, and Notifications for the rest. */
const radarDone = (choice: "weekly" | "off") =>
  choice === "weekly"
    ? page(`${FEATURE_NAME} comes once a week`, `${RADAR_EVERY_WHEN.weekly} ${FEATURE_NAME} in Slack is unchanged. Change either in Notifications.`, 200, { href: NOTIFICATIONS, label: "Open Notifications" })
    : page(`${FEATURE_NAME} emails are off`, `We won't email you ${FEATURE_NAME} again. ${FEATURE_NAME} in Slack, if you connected it, is unchanged. Turn the email back on in Notifications.`, 200, { href: NOTIFICATIONS, label: "Open Notifications" });
const radarBad = () =>
  page("That link didn't work", `It may have been cut off in your email. You can choose how often ${FEATURE_NAME} emails come, or turn them off, in Notifications.`, 400, { href: NOTIFICATIONS, label: "Open Notifications" });

/**
 * GET ?m=<public member id>&s=<signature>: the unsubscribe link in the weekly email. Turns the
 * email off for that member. No sign-in needed; the signature is the proof. With r=radar, the
 * link in the radar email (FEATURE_NAME): a page that offers the email once a week first, then
 * off (radarChoice). Nothing changes until the member picks one, and never Slack.
 */
export const GET = guarded(async (req: NextRequest) => {
  if (limited(`unsub:${clientIp(req)}`, 30, 60_000)) return page("Too many tries in one minute", "Wait a minute, then open the link from your email again.", 429);
  const q = req.nextUrl.searchParams;
  if (isRadar(q)) {
    const who = await radarLinkMember(q.get("m"), q.get("s"));
    if (!who) return radarBad();
    if (who.email === "off") return page(`${FEATURE_NAME} emails are off`, `We won't email you ${FEATURE_NAME}. Turn it back on, or choose how often it comes, in Notifications.`, 200, { href: NOTIFICATIONS, label: "Open Notifications" });
    return radarChoice(q, who.email);
  }
  if (!(await unsubscribe(q.get("m"), q.get("s"))))
    return page("That link didn't work", "It may have been cut off in your email. You can turn the weekly email off yourself in Notifications.", 400, { href: NOTIFICATIONS, label: "Open Notifications" });
  return page("You're unsubscribed", "We won't send you the weekly email of new open roles again. If you change your mind, turn it back on in Notifications.", 200, { href: NOTIFICATIONS, label: "Open Notifications" });
}, paused);

/**
 * POST to the same address: the one-click unsubscribe a mail app sends when the member presses
 * its own unsubscribe button (the weekly email carries List-Unsubscribe and
 * List-Unsubscribe-Post). The signature in the address is the proof, as for GET. No page: the
 * mail app only reads the status. For the radar it turns the email off (not Slack). The radar's
 * own page posts here too, with do=weekly or do=off in its form: that answers with a page.
 */
export const POST = guarded(async (req: NextRequest) => {
  if (limited(`unsub:${clientIp(req)}`, 30, 60_000)) return new NextResponse(null, { status: 429 });
  const q = req.nextUrl.searchParams;
  const form = await req.formData().catch(() => null);
  const picked = form?.get("do");
  if (isRadar(q) && (picked === "weekly" || picked === "off")) {
    if (!(await setRadarEmail(q.get("m"), q.get("s"), picked))) return radarBad();
    return radarDone(picked);
  }
  const done = isRadar(q) ? await setRadarEmail(q.get("m"), q.get("s"), "off") : await unsubscribe(q.get("m"), q.get("s"));
  return new NextResponse(null, { status: done ? 200 : 400, headers: { "cache-control": "no-store" } });
});
