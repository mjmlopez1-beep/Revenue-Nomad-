/**
 * Automatic jobs (lib/jobs.ts, lib/schedule.ts).
 *
 * POST with header x-merlin-tick   the scheduler's own timer (lib/scheduler.ts), from this
 *                                   process only: its key is made at start and never leaves it.
 *                                   Runs each job's due check and answers { started }.
 * GET                               admins: the Automatic jobs card ({ jobs, timer }).
 * POST { op: "cadence", job, every, hourUtc }   admins: change a job's cadence (checked here).
 * POST { op: "run", job: "funding" }            admins: "Run now" for the funding filings (the
 *                                   other jobs' "Run now" are the actions they had before).
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { isAdmin, memberForToken } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { jobsPanel, schedulerTick, setCadence } from "@/lib/jobs";
import { jobsRuntime, parseSetting } from "@/lib/schedule";
import { fundingEnabled } from "@/lib/funding/types";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

const fromTimer = (req: NextRequest) => {
  const key = jobsRuntime.key;
  const got = req.headers.get("x-merlin-tick");
  if (!key || got === null) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function admin(req: NextRequest) {
  const me = await memberForToken(req.cookies.get(COOKIE)?.value ?? null);
  if (!me) return { error: fail("You're signed out. Sign in again.", 401) };
  if (!isAdmin(me)) return { error: fail("Only admins can see or change automatic jobs.", 403) };
  return { me };
}

export const GET = guarded(async (req: NextRequest) => {
  const a = await admin(req);
  if (a.error) return a.error;
  return NextResponse.json(await jobsPanel(), { headers: noStore });
});

export const POST = guarded(async (req: NextRequest) => {
  if (req.headers.has("x-merlin-tick")) {
    if (!fromTimer(req)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
    return NextResponse.json({ started: await schedulerTick() }, { headers: noStore });
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const a = await admin(req);
  if (a.error) return a.error;
  if (limited(`jobs:${a.me.id}`, 30, 60_000)) return fail("That's a lot of changes in a minute. Give it a moment.", 429);
  const body = (await req.json().catch(() => null)) as { op?: unknown; job?: unknown; every?: unknown; hourUtc?: unknown } | null;
  if (body?.op === "cadence") {
    const p = parseSetting(body.job, body.every, body.hourUtc);
    if ("error" in p) return fail(p.error);
    const r = await setCadence(p.job, p.setting);
    if (!r.ok) return fail(r.error);
    return NextResponse.json({ message: "Saved.", job: r.row }, { headers: noStore });
  }
  if (body?.op === "run" && body.job === "funding") {
    if (!fundingEnabled()) return fail("Reading funding filings is off. Set RN_FUNDING=1 in Railway to turn it on.");
    const { fundingRunning, runFunding } = await import("@/lib/funding/run");
    if (fundingRunning()) return NextResponse.json({ message: "Already running." }, { headers: noStore });
    void runFunding().catch((e) => console.error("funding run failed", e));
    return NextResponse.json({ message: "Started. It reads the day's filings from EDGAR, so give it a few minutes." }, { headers: noStore });
  }
  return fail("That didn't go through. Refresh the page and try again.");
});
