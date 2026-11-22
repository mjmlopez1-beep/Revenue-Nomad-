import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { ProposalProblem } from "@/lib/proposals/store";
import { activityView, inboxView, markRead, setPref, setReminders, setRenewal, startRenewal } from "@/lib/close/server";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
const NO_STORE = { "cache-control": "no-store" };
const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
const err = (message: string, status = 400, upgrade?: string) => NextResponse.json({ error: message, ...(upgrade ? { upgrade } : {}) }, { status, headers: NO_STORE });
const SLOW = "That's a lot in one minute. Give it a moment, then try again.";

async function answer(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ProposalProblem) return err(e.message, e.status, e.upgrade);
    throw e;
  }
}

/**
 * After a proposal or document goes out, for the member who sent it (lib/close/server.ts). Signed in only.
 *
 * GET ?id=ID       ActivityView: who opened it, what they read, when to follow up, the reminders, the renewal.
 * GET              CloseInboxView: notifications in Merlin, renewals due, the alert switches.
 * POST { op: "read", ids? }                             these notifications read, or every one
 * POST { op: "pref", kind, channel, on }                one alert on one channel (slack, email, app)
 * POST { op: "reminders", id, d2?, d7?, expiry? }       this proposal's reminders, each on (true) or off
 * POST { op: "renewal", id, end? | skip? | ending? }     the term's end when Merlin couldn't read it; Not sure; It's ending
 * POST { op: "renew", id }                              Start the renewal: a new draft with the dates moved on
 */
export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to see your proposals.", 401);
  if (limited(`act-get:${me.id}`, 120, 60_000)) return err(SLOW, 429);
  const id = req.nextUrl.searchParams.get("id");
  return answer(() => (id ? activityView(token, id.slice(0, 40), origin(req)) : inboxView(token)));
});

export const POST = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to work on proposals.", 401);
  if (limited(`act-post:${me.id}`, 60, 60_000)) return err(SLOW, 429);
  const text = await req.text();
  if (text.length > 8 * 1024) return err("That's too much to send at once.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  if (!b || typeof b !== "object") return err("That didn't go through. Refresh the page and try again.");
  const id = typeof b.id === "string" ? b.id.slice(0, 40) : "";
  const o = origin(req);
  switch (b.op) {
    case "read":
      return answer(() => markRead(token, b.ids));
    case "pref":
      return answer(() => setPref(token, b.kind, b.channel, b.on));
    case "reminders":
      return answer(() => setReminders(token, id, { d2: b.d2, d7: b.d7, expiry: b.expiry }, o));
    case "renewal":
      return answer(() => setRenewal(token, id, { end: b.end, skip: b.skip, ending: b.ending }, o));
    case "renew":
      return answer(() => startRenewal(token, id, o));
    default:
      return err("That didn't go through. Refresh the page and try again.");
  }
});
