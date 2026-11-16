import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";
import { gzip } from "zlib";
import {
  ActionError, buildView, exportState, inviterName, isAdmin, joinMember, maybeScan, memberByEmail, memberForToken, perform, searchMembers, touch, type Action,
} from "@/lib/table";
import { emailEnabled, sendEmail, signInEmail } from "@/lib/email";
import { clientIp, limited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
const gz = promisify(gzip);

function withSession(req: NextRequest, res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Follow the real protocol (proxies set x-forwarded-proto) so http:// localhost still works.
    secure: (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;

const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
/** Past a per-minute limit. The limits are high enough that a person only meets this by accident. */
const SLOW = "That's a lot in one minute. Give it a moment, then try again.";

/** JSON, gzipped when the client accepts it (Next doesn't compress route handlers). */
async function sendJson(req: NextRequest, data: unknown, extra: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store", vary: "Accept-Encoding", ...extra };
  if (body.length > 2048 && /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) {
    return new NextResponse(new Uint8Array(await gz(body, { level: 6 })), { headers: { ...headers, "content-encoding": "gzip" } });
  }
  return new NextResponse(body, { headers });
}

/**
 * GET              the table as the signed-in member sees it (signed out: counts only).
 * GET ?people=Q    { members }: up to 8 members whose name matches (signed in only), for the seat-holder picker.
 * GET ?ref=CODE    { inviter }: the first name of the member who sent this invite code, or null.
 * GET ?export=1    admins: download the runtime state (a backup).
 *
 * See also POST /api/table/scan (the weekly scan, for a cron) and GET /api/table/unsubscribe.
 */
export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  // The seat-holder picker searches as you type, so it has its own limit (per member).
  const people = req.nextUrl.searchParams.get("people");
  if (people !== null) {
    if (limited(`people:${token ?? ip}`, 120, 60_000)) return err(SLOW, 429);
    return NextResponse.json({ members: await searchMembers(token, people) }, { headers: { "cache-control": "no-store" } });
  }
  if (limited(`get:${ip}`, 120, 60_000)) return err(SLOW, 429);
  const ref = req.nextUrl.searchParams.get("ref");
  if (ref !== null) {
    if (limited(`ref:${ip}`, 30, 60_000)) return err(SLOW, 429);
    return NextResponse.json({ inviter: await inviterName(ref) }, { headers: { "cache-control": "no-store" } });
  }
  if (req.nextUrl.searchParams.get("export")) {
    if (!isAdmin(await memberForToken(token))) return err("Only admins can download the export.", 403);
    return sendJson(req, await exportState(), {
      "content-disposition": `attachment; filename="trading-post-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }
  // Neither holds the page up: the visit is noted (at most once per 6 hours per member), and a
  // weekly scan starts in the background when one is due (only with RN_SCAN=1).
  if (token) void touch(token).catch((e) => console.error("last seen not saved", e));
  void maybeScan(origin(req)).catch((e) => console.error("scan check failed", e));
  return sendJson(req, await buildView(token));
}

/**
 * POST { signIn: tokenOrLink }        sign in with a personal link or the code at the end of it.
 * POST { emailLink: email }           email me my sign-in link (when email is switched on).
 * POST { join: { name, email, ref } } join. With email switched on, we email a sign-in link
 *                                     (that's the email check); without it, you're in at once.
 * POST { signOut: true }              sign out.
 * POST { action: {...} }              see Action and ActionResult in lib/tableTypes.ts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return err("That didn't go through. Refresh the page and try again.");
  const ip = clientIp(req);

  if (typeof body.signIn === "string") {
    if (limited(`signin:${ip}`, 30, 10 * 60_000)) return err("That's 30 sign-in tries in 10 minutes, which is the limit. Wait 10 minutes, then try again.", 429);
    const raw = body.signIn.trim();
    // Tokens are base64url, so a link copied with a trailing "." or inside <…> still works.
    const token = raw.match(/[?&]k=([A-Za-z0-9_-]+)/)?.[1] ?? raw.replace(/[^A-Za-z0-9_-]/g, "");
    const m = token ? await memberForToken(token) : null;
    if (!m) return err("That sign-in link or code didn't work. Paste the whole thing, or ask us for a new one.", 401);
    return withSession(req, NextResponse.json({ ok: true }), m.token);
  }

  if (typeof body.emailLink === "string") {
    if (!emailEnabled()) return err("Email sign-in isn't on yet. Use the personal link we sent you.");
    if (limited(`email:${ip}`, 5, 60 * 60_000)) return err("That's 5 requests in an hour, which is the limit. Check your inbox, or try again in an hour.", 429);
    const m = await memberByEmail(body.emailLink);
    if (m) {
      const e = signInEmail(m.name, `${origin(req)}/?k=${encodeURIComponent(m.token)}`);
      await sendEmail(m.email, e.subject, e.text, e.html);
    }
    // Same answer either way, so nobody can test which emails are members.
    return NextResponse.json({ ok: true, sent: true });
  }

  if (body.join && typeof body.join === "object") {
    if (limited(`join:${ip}`, 10, 60 * 60_000)) return err("That's 10 sign-ups from this network in an hour, which is the limit. Try again in an hour.", 429);
    try {
      const m = await joinMember(body.join.name, body.join.email, body.join.ref, ip);
      if (emailEnabled()) {
        const e = signInEmail(m.name, `${origin(req)}/?k=${encodeURIComponent(m.token)}`);
        await sendEmail(m.email, e.subject, e.text, e.html);
        return NextResponse.json({ ok: true, sent: true });
      }
      return withSession(req, NextResponse.json({ ok: true }), m.token);
    } catch (e) {
      if (e instanceof ActionError) return err(e.message);
      throw e;
    }
  }

  if (body.signOut) {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE);
    return res;
  }

  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (limited(`act:${token ?? ip}`, 240, 60_000)) return err(SLOW, 429);
  try {
    return NextResponse.json(await perform(token, body.action as Action, origin(req)));
  } catch (e) {
    if (e instanceof ActionError) return err(e.message);
    throw e;
  }
}
