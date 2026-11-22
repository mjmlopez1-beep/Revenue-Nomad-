import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { draftWithClaude } from "@/lib/proposals/draft";
import { proposeChange } from "@/lib/proposals/change";
import { cancelJob, eventsAfter, follow, jobOf, startJob, type LiveEvent } from "@/lib/proposals/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE = "rn_table";
const MAX_BODY = 900 * 1024;
const NO_STORE = { "cache-control": "no-store" };
const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: NO_STORE });

/**
 * Merlin drafting and changing a proposal, live (lib/proposals/live.ts): each real step as it
 * happens, as server-sent events over the POST's own answer.
 *
 * POST { op: "draft", ...the draft's arguments (app/api/proposals op "draft") }   text/event-stream
 * POST { op: "change", id, instruction, agree? }                                  text/event-stream
 *      Each event is one JSON line (`data: {...}`): first { t: "job", id }, then the job's events
 *      in order (step, section, text), and last done or error. The job runs on if the connection drops.
 * GET ?job=ID&after=N     { status, events }: the events after N (the app picks up from here, or polls).
 * POST { op: "cancel", job }   Stops it; nothing is saved.
 */
export const GET = guarded(async (req: NextRequest) => {
  const me = await memberForToken(req.cookies.get(COOKIE)?.value ?? null);
  if (!me) return err("You're signed out. Sign in again.", 401);
  if (limited(`live-get:${me.id}`, 240, 60_000)) return err("That's a lot in one minute. Give it a moment.", 429);
  const j = jobOf(me.id, req.nextUrl.searchParams.get("job") ?? "");
  if (!j) return err("That draft isn't running anymore. Start it again.", 404);
  return NextResponse.json(eventsAfter(j, Number(req.nextUrl.searchParams.get("after") ?? 0) || 0), { headers: NO_STORE });
});

export const POST = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again.", 401);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return err("That's too much to send at once. Paste the part of the call about their business.", 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return err("That's too much to send at once. Paste the part of the call about their business.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  if (b?.op === "cancel") return NextResponse.json({ ok: cancelJob(me.id, String(b.job ?? "")) }, { headers: NO_STORE });
  const o = origin(req);
  let job;
  if (b?.op === "draft") {
    if (limited(`prop-draft:${me.id}`, 12, 60 * 60_000)) return err("That's a lot of drafts at once. Give it a few minutes, then try again.", 429);
    job = startJob(me.id, "draft", (p) => draftWithClaude(token, { templateId: b.templateId, companyId: b.companyId, companyName: b.companyName, transcript: b.transcript, callDate: b.callDate, callWith: b.callWith, agree: b.agree }, o, Date.now(), p));
  } else if (b?.op === "change") {
    if (limited(`prop-change:${me.id}`, 30, 60 * 60_000)) return err("That's a lot of changes at once. Give it a few minutes, then try again.", 429);
    job = startJob(me.id, "change", (p) => proposeChange(token, String(b.id ?? ""), { instruction: b.instruction, agree: b.agree }, o, Date.now(), p));
  } else return err("That didn't go through. Refresh the page and try again.");

  const enc = new TextEncoder();
  let stop: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      const send = (e: LiveEvent | { t: "job"; id: string }) => {
        try {
          c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* closed */
        }
      };
      const end = () => {
        stop?.();
        if (ping) clearInterval(ping);
        try {
          c.close();
        } catch {
          /* closed */
        }
      };
      send({ t: "job", id: job.id });
      stop = follow(job, 0, (e) => {
        send(e);
        if (e.t === "done" || e.t === "error") end();
      });
      ping = setInterval(() => {
        try {
          c.enqueue(enc.encode(": keep\n\n"));
        } catch {
          end();
        }
      }, 15_000);
      // The member's connection went: the job runs on, and the app picks it up again with GET.
      req.signal.addEventListener("abort", () => (stop?.(), ping && clearInterval(ping)));
    },
    cancel() {
      stop?.();
      if (ping) clearInterval(ping);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no", connection: "keep-alive" } });
});
