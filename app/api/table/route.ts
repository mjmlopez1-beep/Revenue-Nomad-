import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";
import { gzip } from "zlib";
import {
  ActionError, buildView, exportState, inviterName, isAdmin, joinMember, maybeScan, memberByEmail, memberForToken, perform, searchMembers, touch, type Action,
} from "@/lib/table";
import { stateVersion } from "@/lib/table";
import { emailEnabled, sendEmail, signInEmail } from "@/lib/email";
import { clientIp, limited } from "@/lib/rateLimit";
import { guarded } from "@/lib/apiGuard";
import { shared } from "@/lib/viewQueue";
import { tidy, wellFormed } from "@/lib/tableFields";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
const gz = promisify(gzip);
/** The largest request body a POST may carry. The biggest real one (Add with ten people) is a few KB. */
const MAX_BODY = 64 * 1024;

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

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store", vary: "Accept-Encoding" };
const wantsGzip = (req: NextRequest) => /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "");

/** JSON, gzipped when the client accepts it (Next doesn't compress route handlers). */
async function sendJson(req: NextRequest, data: unknown, extra: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  const headers: Record<string, string> = { ...JSON_HEADERS, ...extra };
  if (body.length > 2048 && wantsGzip(req)) {
    return new NextResponse(new Uint8Array(await gz(body, { level: 6 })), { headers: { ...headers, "content-encoding": "gzip" } });
  }
  return new NextResponse(body, { headers });
}

/**
 * The table view, built, turned into JSON and compressed inside the view queue (lib/viewQueue.ts):
 * at most 4 at once, the rest wait, and past 50 waiting the answer is 503 with Retry-After. One
 * member's requests share one build while the state has not changed under it, so a tab that
 * fires a burst of loads costs one.
 */
type Built = { body: string; gzipped: Uint8Array<ArrayBuffer> | null };
const viewFlights = new Map<string, { p: Promise<Built>; started: number | null }>();
const builtView = (token: string | null) =>
  shared(viewFlights, token ?? "", stateVersion, async (): Promise<Built> => {
    const body = JSON.stringify(await buildView(token));
    return { body, gzipped: body.length > 2048 ? new Uint8Array(await gz(body, { level: 6 })) : null };
  });

/**
 * GET              the table as the signed-in member sees it (signed out: counts only).
 * GET ?people=Q    { members }: up to 8 members whose name matches (signed in only), for the seat-holder picker.
 * GET ?ref=CODE    { inviter }: the first name of the member who sent this invite code, or null.
 * GET ?export=1    admins: download the runtime state (a backup).
 *
 * See also POST /api/table/scan (the weekly scan, for a cron), GET /api/table/unsubscribe and
 * GET /api/health. Every handler answers 503 while Trading Post cannot serve (lib/apiGuard.ts).
 */
export const GET = guarded(async (req: NextRequest) => {
  const ip = clientIp(req);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  // The seat-holder picker searches as you type, so it has its own limit (per member).
  const people = req.nextUrl.searchParams.get("people");
  if (people !== null) {
    if (limited(`people:${token ?? ip}`, 120, 60_000)) return err("Slow down a little.", 429);
    return NextResponse.json({ members: await searchMembers(token, people) }, { headers: { "cache-control": "no-store" } });
  }
  if (limited(`get:${ip}`, 120, 60_000)) return err("Slow down a little.", 429);
  const ref = req.nextUrl.searchParams.get("ref");
  if (ref !== null) {
    if (limited(`ref:${ip}`, 30, 60_000)) return err("Slow down a little.", 429);
    return NextResponse.json({ inviter: await inviterName(ref) }, { headers: { "cache-control": "no-store" } });
  }
  if (req.nextUrl.searchParams.get("export")) {
    if (!isAdmin(await memberForToken(token))) return err("Admins only.", 403);
    return sendJson(req, await exportState(), {
      "content-disposition": `attachment; filename="trading-post-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }
  // Neither holds the page up: the visit is noted (at most once per 6 hours per member), and a
  // weekly scan starts in the background when one is due (only with RN_SCAN=1).
  if (token) void touch(token).catch((e) => console.error("last seen not saved", e));
  void maybeScan(origin(req)).catch((e) => console.error("scan check failed", e));
  const view = await builtView(token);
  return view.gzipped && wantsGzip(req)
    ? new NextResponse(view.gzipped, { headers: { ...JSON_HEADERS, "content-encoding": "gzip" } })
    : new NextResponse(view.body, { headers: JSON_HEADERS });
});

/** The request body as JSON, or null when it is not JSON. "too large" past MAX_BODY, whatever Content-Length says. */
async function readBody(req: NextRequest): Promise<unknown | "too large"> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return "too large";
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      void reader.cancel().catch(() => {});
      return "too large";
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/** Every text in what the client sent, with half characters removed (a lone surrogate breaks whoever encodes it later). */
function sound<T>(x: T, depth = 0): T {
  if (typeof x === "string") return wellFormed(x) as T;
  if (!x || typeof x !== "object" || depth > 6) return x;
  if (Array.isArray(x)) return x.map((v) => sound(v, depth + 1)) as T;
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, sound(v, depth + 1)])) as T;
}

/**
 * POST { signIn: tokenOrLink }        sign in with a personal link or the code at the end of it.
 * POST { emailLink: email }           email me my sign-in link (when email is switched on).
 * POST { join: { name, email, ref } } join. With email switched on, we email a sign-in link
 *                                     (that's the email check); without it, you're in at once.
 * POST { signOut: true }              sign out.
 * POST { action: {...} }              see Action and ActionResult in lib/tableTypes.ts.
 *
 * A body over 64 KB is refused (413). An action from someone who is not signed in is answered
 * at once and never queued as a change.
 */
export const POST = guarded(async (req: NextRequest) => {
  const read = await readBody(req);
  if (read === "too large") return err("That is too much to send at once. Shorten it and try again.", 413);
  const body = sound(read) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!body || typeof body !== "object") return err("Invalid request.");
  const ip = clientIp(req);

  if (typeof body.signIn === "string") {
    if (limited(`signin:${ip}`, 30, 10 * 60_000)) return err("Too many tries. Wait a few minutes.", 429);
    const raw = body.signIn.trim();
    // Tokens are base64url, so a link copied with a trailing "." or inside <…> still works.
    const token = raw.match(/[?&]k=([A-Za-z0-9_-]+)/)?.[1] ?? raw.replace(/[^A-Za-z0-9_-]/g, "");
    const m = token ? await memberForToken(token) : null;
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
    if (limited(`join:${ip}`, 10, 60 * 60_000)) return err("Too many sign-ups from here. Try again in an hour.", 429);
    // The name is cut to its 80 characters here, on a whole character (joinMember cuts by unit).
    body.join.name = tidy(body.join.name, 80);
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

  // Who is acting comes first. Nobody signed in means an answer at once: nothing is queued, and
  // the limit is on the address, since any cookie value can be made up.
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) {
    if (limited(`act:ip:${ip}`, 60, 60_000)) return err("Slow down a little.", 429);
    return err("Join or sign in to add, confirm and unlock.");
  }
  if (limited(`act:${me.id}`, 240, 60_000)) return err("Slow down a little.", 429);
  const action = body.action as Action;
  // Profile texts are cut on a whole character here (perform cuts them by unit).
  if (action?.type === "profile") {
    if (typeof action.title === "string") action.title = tidy(action.title, 80);
    if (typeof action.goal === "string") action.goal = tidy(action.goal, 40);
  }
  try {
    return NextResponse.json(await perform(token, action, origin(req)));
  } catch (e) {
    if (e instanceof ActionError) return err(e.message);
    throw e;
  }
});
