import { NextRequest, NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/rateLimit";
import { unsubscribe } from "@/lib/table";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Trading Post</title></head>
<body style="margin:0;background:#FAFAF7;color:#0A1A13;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;line-height:1.5">
<main style="max-width:480px;margin:0 auto;padding:72px 24px">
<p style="margin:0 0 24px;font-weight:700;color:#073F2F">Trading Post</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">${title}</h1>
<p style="margin:0 0 24px;color:#28322D">${body}</p>
<p style="margin:0"><a href="/" style="display:inline-block;background:#073F2F;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open Trading Post</a></p>
</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

/**
 * GET ?m=<public member id>&s=<signature>: the unsubscribe link in the weekly email. Turns the
 * email off for that member. No sign-in needed; the signature is the proof.
 */
export async function GET(req: NextRequest) {
  if (limited(`unsub:${clientIp(req)}`, 30, 60_000)) return page("Slow down a little", "Try the link again in a minute.", 429);
  const q = req.nextUrl.searchParams;
  if (!(await unsubscribe(q.get("m"), q.get("s"))))
    return page("That link didn't work", "It may have been cut off in your email. You can turn the weekly email off in Trading Post, under My credits.", 400);
  return page("You're unsubscribed", "You won't get the weekly email of new open roles. To turn it back on, open Trading Post and go to My credits.");
}
