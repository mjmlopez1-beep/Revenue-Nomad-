import { NextRequest, NextResponse } from "next/server";
import {
  ActionError, buildView, exportState, isAdmin, joinMember, memberByEmail, memberForToken, perform, type Action,
} from "@/lib/table";
import { emailEnabled, sendEmail, signInEmail } from "@/lib/email";
import { clientIp, limited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";

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

/**
 * GET              the table as the signed-in member sees it (signed out: counts only).
 * GET ?export=1    admins: download the runtime state (a backup).
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (req.nextUrl.searchParams.get("export")) {
    if (!isAdmin(await memberForToken(token))) return err("Admins only.", 403);
    return new NextResponse(JSON.stringify(await exportState()), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="trading-post-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }
  return NextResponse.json(await buildView(token));
}

/**
 * POST { signIn: tokenOrLink }        sign in with a personal link or the code at the end of it.
 * POST { emailLink: email }           email me my sign-in link (when email is switched on).
 * POST { join: { name, email, ref } } join. With email switched on, we email a sign-in link
 *                                     (that's the email check); without it, you're in at once.
 * POST { signOut: true }              sign out.
 * POST { action: {...} }              see Action in lib/tableTypes.ts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return err("Invalid request.");
  const ip = clientIp(req);

  if (typeof body.signIn === "string") {
    if (limited(`signin:${ip}`, 30, 10 * 60_000)) return err("Too many tries. Wait a few minutes.", 429);
    const raw = body.signIn.trim();
    const token = raw.match(/[?&]k=([^&#\s]+)/)?.[1] ?? raw;
    const m = await memberForToken(token);
    if (!m) return err("That sign-in link or code isn't valid.", 401);
    return withSession(req, NextResponse.json({ ok: true }), m.token);
  }

  if (typeof body.emailLink === "string") {
    if (!emailEnabled()) return err("Email sign-in isn't on yet. Use the personal link we sent you.");
    if (limited(`email:${ip}`, 5, 60 * 60_000)) return err("Too many emails. Try again in an hour.", 429);
    const m = await memberByEmail(body.emailLink);
    if (m) {
      const e = signInEmail(m.name, `${origin(req)}/?k=${encodeURIComponent(m.token)}`);
      await sendEmail(m.email, e.subject, e.text, e.html);
    }
    // Same answer either way, so nobody can test which emails are members.
    return NextResponse.json({ ok: true, sent: true });
  }

  if (body.join && typeof body.join === "object") {
    if (limited(`join:${ip}`, 8, 60 * 60_000)) return err("Too many sign-ups from here. Try again in an hour.", 429);
    try {
      const m = await joinMember(body.join.name, body.join.email, body.join.ref);
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
  if (limited(`act:${token ?? ip}`, 240, 60_000)) return err("Slow down a little.", 429);
  try {
    return NextResponse.json(await perform(token, body.action as Action));
  } catch (e) {
    if (e instanceof ActionError) return err(e.message);
    throw e;
  }
}
