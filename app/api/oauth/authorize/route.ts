/**
 * The authorization endpoint.
 *
 * GET  ?response_type=code&client_id&redirect_uri&code_challenge&code_challenge_method=S256&state&resource
 *      Checks the request, keeps it for 30 minutes and sends the browser to the consent page
 *      (/oauth/consent?r=...). A bad client or redirect URI stops on the page; anything else wrong
 *      goes back to the app as an OAuth error.
 * GET  ?r=ID&info=1   what the consent page shows: the app, where it returns to, and who is signed in.
 * POST { r, allow }   the member's answer (signed in with the app's cookie, same origin only).
 *      Answers { redirect } for the page to follow.
 */
import { NextRequest, NextResponse } from "next/server";
import { notNow } from "@/lib/apiGuard";
import { emailEnabled } from "@/lib/email";
import { clientIp, limited } from "@/lib/rateLimit";
import { contactInfo, memberForToken } from "@/lib/table";
import { mcpUrl, publicOrigin, readText } from "@/lib/mcp/http";
import { decide, pendingRequest, startAuthorization } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };

const toPage = (req: NextRequest, q: string) => NextResponse.redirect(`${publicOrigin(req)}/oauth/consent?${q}`, { status: 302, headers: noStore });

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    if (q.get("info")) {
      const r = pendingRequest(q.get("r") ?? "");
      if (!r) return NextResponse.json({ ok: false }, { headers: noStore });
      const me = await memberForToken(req.cookies.get(COOKIE)?.value);
      let host = "";
      try {
        host = new URL(r.redirectUri).host || new URL(r.redirectUri).protocol.replace(":", "");
      } catch {}
      return NextResponse.json(
        {
          ok: true,
          app: r.clientName,
          returnsTo: host,
          signedIn: !!me,
          firstName: me ? me.name.trim().split(/\s+/)[0] : null,
          email: emailEnabled(),
          support: contactInfo().support,
        },
        { headers: noStore },
      );
    }
    if (limited(`oauth-authz:${clientIp(req)}`, 60, 60_000)) return toPage(req, "e=busy");
    const out = await startAuthorization(q, mcpUrl(req), publicOrigin(req));
    if ("page" in out) return toPage(req, `e=${out.page.includes("return address") ? "redirect" : "client"}`);
    if ("redirect" in out) return NextResponse.redirect(out.redirect, { status: 302, headers: noStore });
    return toPage(req, `r=${encodeURIComponent(out.ok.id)}`);
  } catch (e) {
    const r = notNow(e);
    if (r) return r;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    // The answer comes from our own consent page only. The cookie is SameSite=Lax as well.
    const origin = req.headers.get("origin");
    if (origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return NextResponse.json({ error: "That didn't come from Merlin." }, { status: 403, headers: noStore });
    const text = await readText(req, 4096);
    let body: { r?: unknown; allow?: unknown } = {};
    try {
      body = JSON.parse(text ?? "") ?? {};
    } catch {}
    const me = await memberForToken(req.cookies.get(COOKIE)?.value);
    const allow = body.allow === true;
    if (allow && !me) return NextResponse.json({ error: "You're signed out. Sign in, then try again." }, { status: 401, headers: noStore });
    const redirect = decide(String(body.r ?? ""), me?.id ?? null, allow, publicOrigin(req));
    if (!redirect) return NextResponse.json({ error: "This request ran out of time. Go back to the app and connect Merlin again." }, { status: 410, headers: noStore });
    return NextResponse.json({ redirect }, { headers: noStore });
  } catch (e) {
    const r = notNow(e);
    if (r) return r;
    throw e;
  }
}
