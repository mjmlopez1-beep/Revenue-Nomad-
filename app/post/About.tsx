"use client";

/**
 * A company's About text in its record. The table carries a visible About without its text
 * (Cell.lazy, lib/table.ts ABOUT_LATER), so the record asks GET /api/table?about=<id> when it
 * opens. Answers are kept for the session; records opened in the same moment share one request
 * (up to ABOUT_BATCH ids). A cell that arrives whole (an action's answer) is shown and kept as it is.
 */
import { useEffect, useState } from "react";
import type { Cell } from "@/lib/tableTypes";

/** lib/table.ts ABOUT_MAX. */
const ABOUT_BATCH = 50;
/** About cells loaded this session, by public company id. */
const cache = new Map<string, Cell>();
/** Ids waiting for the next request, each with whoever is waiting on it. */
const waiting = new Map<string, ((c: Cell | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const batch = [...waiting.entries()].slice(0, ABOUT_BATCH);
  for (const [id] of batch) waiting.delete(id);
  if (waiting.size) timer = setTimeout(flush, 0);
  let about: Record<string, Cell> | null = null;
  try {
    const r = await fetch(`/api/table?about=${batch.map(([id]) => encodeURIComponent(id)).join(",")}`, { cache: "no-store" });
    if (r.ok) about = ((await r.json()) as { about?: Record<string, Cell> }).about ?? {};
  } catch {
    about = null;
  }
  for (const [id, done] of batch) {
    // An id the answer leaves out names no company any more: nothing on file.
    const c = about ? about[id] ?? { s: "empty" as const } : null;
    if (c) cache.set(id, c);
    for (const f of done) f(c);
  }
}

/** The About cell of company `id`, from the session's cache or the next request. Null when it could not be loaded. */
export function loadAbout(id: string): Promise<Cell | null> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    waiting.set(id, [...(waiting.get(id) ?? []), resolve]);
    timer ??= setTimeout(flush, 0);
  });
}

/** What the record shows for an About cell: its text, nothing, loading, or a failed load. */
type AboutNow = { text: string | null; state: "ready" | "loading" | "failed" };

function aboutNow(id: string, cell: Cell | undefined): AboutNow {
  if (cell?.s !== "value") return { text: null, state: "ready" };
  if (!cell.lazy) return { text: cell.v || null, state: "ready" };
  const hit = cache.get(id);
  return hit ? { text: hit.s === "value" ? hit.v || null : null, state: "ready" } : { text: null, state: "loading" };
}

export function useAbout(id: string, cell: Cell | undefined): AboutNow & { retry: () => void } {
  const [now, setNow] = useState<AboutNow>(() => aboutNow(id, cell));
  const [tries, setTries] = useState(0);
  const lazy = cell?.s === "value" && !!cell.lazy;
  useEffect(() => {
    // A whole cell (an action's answer) is the newest word on it: keep it for when the table's marker comes back.
    if (cell?.s === "value" && !cell.lazy) cache.set(id, cell);
    const first = aboutNow(id, cell);
    setNow(first);
    if (first.state !== "loading") return;
    let live = true;
    void loadAbout(id).then((c) => {
      if (!live) return;
      setNow(c ? { text: c.s === "value" ? c.v || null : null, state: "ready" } : { text: null, state: "failed" });
    });
    return () => {
      live = false;
    };
    // The cell's text and state decide; a new object with the same content changes nothing.
  }, [id, cell?.s, lazy, cell?.s === "value" ? cell.v : "", tries]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...now, retry: () => setTries((n) => n + 1) };
}

/** The About block's text in the record: the company's own words, a quiet line while they load, or none on file. */
export function AboutText({ id, cell }: { id: string; cell: Cell | undefined }) {
  const a = useAbout(id, cell);
  if (a.state === "loading")
    return (
      <p className="tp-about tp-faint" aria-busy="true">
        Loading…
      </p>
    );
  if (a.state === "failed")
    return (
      <p className="tp-about tp-faint">
        The About didn&apos;t load.{" "}
        <button type="button" className="tp-flink" onClick={a.retry}>
          Try again
        </button>
      </p>
    );
  return a.text ? <p className="tp-about">{a.text}</p> : <p className="tp-about tp-faint">No About on file yet.</p>;
}
