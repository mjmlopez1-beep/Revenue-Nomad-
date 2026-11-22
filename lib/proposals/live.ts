/**
 * Live progress for Merlin's drafting and changes (app/api/proposals/live): a job runs on the
 * server and records each real step as it happens, so the app can show them as they come, and
 * pick up where it left off when its connection drops (the job keeps running; the app reads the
 * events after the last one it has). A job can be cancelled.
 *
 * What a step says comes from what actually happened: the call's word count once it is read, the
 * goal and the signer once they are found in it, the rate figure once the kit has it, each section
 * once its title arrives in the model's streamed answer (lib/proposals/streamParse.ts), its text
 * as it is written, and a check once it is closed. Never a timer.
 *
 * Jobs live in this server's memory for JOB_KEEP_MS after they end, and belong to one member.
 * What they hold is that member's own draft as it is written: never a transcript.
 */
import { randomBytes } from "crypto";

export type LiveEvent =
  | { seq: number; t: "step"; key: string; label: string; state: "active" | "done" }
  | { seq: number; t: "section"; key: string; title: string; state: "active" | "done" }
  | { seq: number; t: "text"; key: string; text: string }
  | { seq: number; t: "done"; result: unknown }
  | { seq: number; t: "error"; message: string; status: number; result?: unknown };
type NoSeq<T> = T extends unknown ? Omit<T, "seq"> : never;
export type LiveInput = NoSeq<LiveEvent>;

/** What the work reports through. `signal` aborts when the member cancels. */
export interface Progress {
  step: (key: string, label: string, state?: "active" | "done") => void;
  section: (key: string, title: string, state?: "active" | "done") => void;
  text: (key: string, text: string) => void;
  signal: AbortSignal;
}

export const JOB_KEEP_MS = 15 * 60_000;
/** Text events for one section at most this often (the last one always goes). */
export const TEXT_EVERY_MS = 120;

export interface Job {
  id: string;
  memberId: string;
  kind: string;
  events: LiveEvent[];
  status: "running" | "done" | "failed" | "cancelled";
  endedAt: number | null;
  abort: AbortController;
  listeners: Set<(e: LiveEvent) => void>;
}

const jobs = new Map<string, Job>();

function sweep(nowMs: number) {
  for (const [id, j] of jobs) if (j.endedAt && nowMs - j.endedAt > JOB_KEEP_MS) jobs.delete(id);
}

/** A job's progress reporter: steps and sections as they happen, text no more often than TEXT_EVERY_MS. */
function reporter(j: Job): Progress {
  const lastText = new Map<string, { at: number; text: string; timer: ReturnType<typeof setTimeout> | null }>();
  const emit = (e: LiveInput) => push(j, e);
  return {
    step: (key, label, state = "done") => emit({ t: "step", key, label, state }),
    section: (key, title, state = "active") => {
      // A section's last text before it is marked done.
      const lt = lastText.get(key);
      if (state === "done" && lt?.timer) clearTimeout(lt.timer), (lt.timer = null), emit({ t: "text", key, text: lt.text });
      emit({ t: "section", key, title, state });
    },
    text: (key, text) => {
      const now = Date.now();
      const lt = lastText.get(key) ?? { at: 0, text: "", timer: null };
      lt.text = text;
      lastText.set(key, lt);
      if (now - lt.at >= TEXT_EVERY_MS) {
        lt.at = now;
        if (lt.timer) clearTimeout(lt.timer), (lt.timer = null);
        emit({ t: "text", key, text });
      } else if (!lt.timer)
        lt.timer = setTimeout(() => {
          lt.timer = null;
          lt.at = Date.now();
          if (j.status === "running") emit({ t: "text", key, text: lt.text });
        }, TEXT_EVERY_MS);
    },
    signal: j.abort.signal,
  };
}

function push(j: Job, e: LiveInput) {
  const ev = { ...e, seq: j.events.length + 1 } as LiveEvent;
  j.events.push(ev);
  for (const l of j.listeners) l(ev);
}

/** An error the work throws: its words, its status, and what it kept (a draft saved with the sections written so far). */
export class LiveProblem extends Error {
  constructor(
    message: string,
    public status = 500,
    public result?: unknown,
  ) {
    super(message);
  }
}

/** Start a job for this member. The work reports through Progress and returns the result. */
export function startJob(memberId: string, kind: string, work: (p: Progress) => Promise<unknown>, nowMs = Date.now()): Job {
  sweep(nowMs);
  const j: Job = { id: `lj_${randomBytes(9).toString("base64url")}`, memberId, kind, events: [], status: "running", endedAt: null, abort: new AbortController(), listeners: new Set() };
  jobs.set(j.id, j);
  const p = reporter(j);
  void (async () => {
    try {
      const result = await work(p);
      if (j.status !== "running") return;
      j.status = "done";
      push(j, { t: "done", result });
    } catch (e) {
      if (j.status === "cancelled") return;
      j.status = "failed";
      const x = e as { message?: string; status?: number; result?: unknown };
      push(j, { t: "error", message: x?.message || "That didn't go through. Try again.", status: typeof x?.status === "number" ? x.status : 500, ...(x?.result !== undefined ? { result: x.result } : {}) });
    } finally {
      j.endedAt = Date.now();
    }
  })();
  return j;
}

/** One of this member's jobs, or null. */
export const jobOf = (memberId: string, id: string): Job | null => {
  const j = jobs.get(id);
  return j && j.memberId === memberId ? j : null;
};

/** The events after `after`, and where the job is. */
export function eventsAfter(j: Job, after: number): { status: Job["status"]; events: LiveEvent[] } {
  return { status: j.status, events: j.events.filter((e) => e.seq > after) };
}

/** Cancel a running job: its work is aborted, and nothing it was writing is saved. */
export function cancelJob(memberId: string, id: string): boolean {
  const j = jobOf(memberId, id);
  if (!j || j.status !== "running") return false;
  j.status = "cancelled";
  j.abort.abort();
  push(j, { t: "error", message: "Stopped. Nothing was saved.", status: 499 });
  j.endedAt = Date.now();
  return true;
}

/** Listen to a job's events from `after` on: what has happened already first. Returns the stop. */
export function follow(j: Job, after: number, on: (e: LiveEvent) => void): () => void {
  for (const e of j.events) if (e.seq > after) on(e);
  j.listeners.add(on);
  return () => void j.listeners.delete(on);
}

/** Tests: the jobs running now. */
export const liveInternals = { jobs };
