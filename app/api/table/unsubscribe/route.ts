import { NextRequest, NextResponse } from "next/server";
import { readdirSync } from "fs";
import path from "path";
import { clientIp, limited } from "@/lib/rateLimit";
import { unsubscribe } from "@/lib/table";
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
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:24px;padding:0 16px;border-radius:8px;background:#073F2F;color:#fff;font-size:15px;font-weight:700;text-decoration:none;transition:background-color .15s ease}
.btn:hover{background:#0E5640}
.btn:active{background:#052E22}
a:focus-visible{outline:2px solid #2EE59D;outline-offset:2px}
.foot{margin:16px 0 0;color:#5B6661;font-size:13px;line-height:20px}
@media (max-width:480px){.top{padding:0 16px}main{margin-top:24px}.card{padding:24px}h1{font-size:26px;line-height:32px}.btn{width:100%;min-height:48px;font-size:16px}}
@media (max-width:359px){.brand span{display:none}}
@media (prefers-reduced-motion:reduce){.btn{transition:none}}
`.replace(/\n/g, "");

const CHECK =
  '<div class="done" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg></div>';

/** One small page in the product's frame: what happened, in a sentence or two, and one way back. */
const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Merlin</title><style>${appFont()}${CSS}</style></head>
<body>
<header class="top"><a class="brand" href="/" aria-label="Merlin by Revenue Nomad, home"><img src="/brand/merlin-lockup-on-dark.png" alt="Merlin by Revenue Nomad" width="122" height="36"></a></header>
<main>
<div class="card">
${status === 200 ? CHECK : ""}<h1>${title}</h1>
<p>${body}</p>
<a class="btn" href="/">Open Merlin</a>
</div>
<p class="foot">Merlin is a data exchange for fractional operators, from Revenue Nomad.</p>
</main>
</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

/** While Merlin cannot serve, the link answers 503 with a page, and nothing is changed. */
const paused = (e: unknown) => (isDown(e) || isBusy(e) ? page("Try this link again in a few minutes", "Merlin is paused while we fix a problem on our side. Your weekly email setting has not changed yet.", 503) : null);

/**
 * GET ?m=<public member id>&s=<signature>: the unsubscribe link in the weekly email. Turns the
 * email off for that member. No sign-in needed; the signature is the proof.
 */
export const GET = guarded(async (req: NextRequest) => {
  if (limited(`unsub:${clientIp(req)}`, 30, 60_000)) return page("Too many tries in one minute", "Wait a minute, then open the link from your email again.", 429);
  const q = req.nextUrl.searchParams;
  if (!(await unsubscribe(q.get("m"), q.get("s"))))
    return page("That link didn't work", "It may have been cut off in your email. You can turn the weekly email off yourself under Your credits.", 400);
  return page("You're unsubscribed", "We won't send you the weekly email of new open roles again. If you change your mind, turn it back on under Your credits.");
}, paused);

/**
 * POST to the same address: the one-click unsubscribe a mail app sends when the member presses
 * its own unsubscribe button (the weekly email carries List-Unsubscribe and
 * List-Unsubscribe-Post). The signature in the address is the proof, as for GET. No page: the
 * mail app only reads the status.
 */
export const POST = guarded(async (req: NextRequest) => {
  if (limited(`unsub:${clientIp(req)}`, 30, 60_000)) return new NextResponse(null, { status: 429 });
  const q = req.nextUrl.searchParams;
  return new NextResponse(null, { status: (await unsubscribe(q.get("m"), q.get("s"))) ? 200 : 400, headers: { "cache-control": "no-store" } });
});
