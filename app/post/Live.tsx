"use client";

/**
 * The live view of Merlin drafting or changing a proposal (app/api/proposals/live): each real
 * step as it happens, one line each, a check when it's done and the current one moving gently
 * (still, with reduced motion), and the section being written filling in beside it. Cancel stops
 * it. If the connection drops, it picks up from the last step it had (the job runs on, on the
 * server), and if that fails too it says so plainly and keeps whatever was written.
 */
import { useCallback, useRef, useState } from "react";
import type { LiveEvent } from "@/lib/proposals/live";
import { DocText } from "../sign/doc";
import { fieldLabel } from "@/lib/proposals/library";
import { IconCheck } from "../ui/shared";

export interface LiveItem {
  key: string;
  kind: "step" | "section";
  label: string;
  state: "active" | "done";
  text?: string;
}
export interface LiveState {
  items: LiveItem[];
  status: "idle" | "running" | "done" | "error";
  result?: unknown;
  error?: { message: string; status: number; result?: unknown };
}
type End = { ok: true; result: unknown } | { ok: false; message: string; status: number; result?: unknown };

const DROPPED = "The connection dropped and the draft didn't finish. Try again.";
const POLL_MS = 1000;
const POLL_FOR_MS = 6 * 60_000;

/** The state after one event. */
export function applyEvent(s: LiveState, e: LiveEvent): LiveState {
  const items = [...s.items];
  const at = (key: string) => items.findIndex((x) => x.key === key);
  if (e.t === "step" || e.t === "section") {
    const i = at(e.key);
    const label = e.t === "step" ? e.label : e.title;
    // A step that comes again as done is marked done in its place; an earlier active one is done once a later step starts.
    if (i >= 0) items[i] = { ...items[i], label, state: e.state };
    else items.push({ key: e.key, kind: e.t, label, state: e.state });
    return { ...s, items };
  }
  if (e.t === "text") {
    const i = at(e.key);
    if (i >= 0) items[i] = { ...items[i], text: e.text };
    return { ...s, items };
  }
  if (e.t === "done") return { ...s, items: items.map((x) => ({ ...x, state: "done" })), status: "done", result: e.result };
  return { ...s, status: "error", error: { message: e.message, status: e.status, result: e.result } };
}

export function useLive() {
  const [state, setState] = useState<LiveState>({ items: [], status: "idle" });
  const job = useRef<string | null>(null);
  const seq = useRef(0);
  const cur = useRef<LiveState>(state);
  const take = (e: LiveEvent) => {
    if (e.seq <= seq.current) return null;
    seq.current = e.seq;
    cur.current = applyEvent(cur.current, e);
    setState(cur.current);
    return e.t === "done" ? ({ ok: true, result: e.result } as End) : e.t === "error" ? ({ ok: false, message: e.message, status: e.status, result: e.result } as End) : null;
  };

  /** Pick up a job after the connection dropped: its events after the last one seen, until it ends. */
  const resume = async (): Promise<End> => {
    const until = Date.now() + POLL_FOR_MS;
    let misses = 0;
    while (Date.now() < until && job.current) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        const r = await fetch(`/api/proposals/live?job=${encodeURIComponent(job.current)}&after=${seq.current}`, { headers: { accept: "application/json" } });
        if (r.status === 404) break;
        if (!r.ok) {
          if (++misses > 5) break;
          continue;
        }
        misses = 0;
        const j = (await r.json()) as { events: LiveEvent[] };
        for (const e of j.events) {
          const end = take(e);
          if (end) return end;
        }
      } catch {
        if (++misses > 5) break;
      }
    }
    return { ok: false, message: DROPPED, status: 0 };
  };

  const start = useCallback(async (body: Record<string, unknown>): Promise<End> => {
    job.current = null;
    seq.current = 0;
    cur.current = { items: [], status: "running" };
    setState(cur.current);
    const fail = (message: string, status = 0): End => {
      cur.current = { ...cur.current, status: "error", error: { message, status } };
      setState(cur.current);
      return { ok: false, message, status };
    };
    let res: Response;
    try {
      res = await fetch("/api/proposals/live", { method: "POST", headers: { "Content-Type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
    } catch {
      return fail("We couldn't reach Merlin. Check your connection and try again.");
    }
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      return fail(j.error || "That didn't go through. Try again.", res.status);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let cut: number;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const e = JSON.parse(line.slice(6)) as LiveEvent | { t: "job"; id: string };
          if (e.t === "job") {
            job.current = (e as { id: string }).id;
            continue;
          }
          const end = take(e as LiveEvent);
          if (end) return end;
        }
      }
    } catch {
      /* dropped: picked up below */
    }
    // The answer ended before the job did: pick it up from the last step.
    if (job.current) {
      const end = await resume();
      if (!end.ok && end.status === 0) return fail(end.message);
      return end;
    }
    return fail(DROPPED);
  }, []);

  const cancel = useCallback(async () => {
    const id = job.current;
    if (!id) return;
    await fetch("/api/proposals/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "cancel", job: id }) }).catch(() => {});
  }, []);
  const reset = useCallback(() => {
    job.current = null;
    seq.current = 0;
    cur.current = { items: [], status: "idle" };
    setState(cur.current);
  }, []);
  return { state, start, cancel, reset };
}

/** The steps, one line each, and the section being written. */
export function LiveView({ state, title, onCancel, compact = false }: { state: LiveState; title: string; onCancel?: () => void; compact?: boolean }) {
  const writing = [...state.items].reverse().find((x) => x.kind === "section" && x.text) ?? null;
  const done = state.items.filter((x) => x.kind === "section" && x.state === "done").length;
  return (
    <div className="lv" data-compact={compact || undefined} aria-live="polite">
      <section className="lv-steps" aria-label={title}>
        <span className="lv-t">{title}</span>
        <ol className="lv-list">
          {state.items.map((x) => (
            <li key={x.key} className="lv-item" data-state={x.state} data-kind={x.kind}>
              <span className="lv-mark" aria-hidden>
                {x.state === "done" ? <IconCheck size={14} /> : <span className="lv-dot" />}
              </span>
              <span className="lv-label">{x.kind === "section" && x.state === "active" && !x.label.startsWith("Rewriting") ? `Writing ${x.label}` : x.label}</span>
            </li>
          ))}
          {state.status === "running" && !state.items.length && (
            <li className="lv-item" data-state="active">
              <span className="lv-mark" aria-hidden>
                <span className="lv-dot" />
              </span>
              <span className="lv-label">Starting</span>
            </li>
          )}
        </ol>
        {state.status === "running" && onCancel && (
          <button type="button" className="btn btn-sm lv-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
      </section>
      {!compact && (
        <section className="lv-preview sg-doc" aria-label="What's written so far">
          {writing ? (
            <>
              <span className="lv-count">{done ? `${done} ${done === 1 ? "section" : "sections"} written` : "Writing"}</span>
              <h3 className="sg-block-h">{writing.label}</h3>
              <div className="sg-text">
                <DocText text={writing.text ?? ""} blanks label={fieldLabel} />
              </div>
            </>
          ) : (
            <p className="pp-muted">Each section shows here as Merlin writes it.</p>
          )}
        </section>
      )}
      {compact && writing && (
        <div className="lv-mini sg-text">
          <DocText text={writing.text ?? ""} blanks label={fieldLabel} />
        </div>
      )}
    </div>
  );
}
