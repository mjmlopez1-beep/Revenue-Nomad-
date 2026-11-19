"use client";

/**
 * A company's About text in its record. The table carries a visible About without its text
 * (Cell.lazy, lib/table.ts ABOUT_LATER), so the record asks GET /api/table?about=<id> when it
 * opens. Answers are kept for the session; records opened in the same moment share one request
 * (up to ABOUT_BATCH ids). A cell that arrives whole (an action's answer) is shown and kept as it is.
 *
 * What the server sends depends on how the record is open (`as`): a locked company's About comes
 * without its name, web address and links (lib/scan/clean.ts aboutWithout), a record opened from a
 * lookup by exact name asks with &found=1 and gets the whole text, and so does a company the
 * member can name. The three are kept apart, so an unlock or a closed lookup never shows the text
 * from before.
 */
import { useEffect, useState } from "react";
import type { Cell } from "@/lib/tableTypes";

/** How the record is open: the company locked, named from a lookup by exact name, or one the member knows. */
export type AboutAs = "locked" | "found" | "open";

/** lib/table.ts ABOUT_MAX. */
const ABOUT_BATCH = 50;
/** About cells loaded this session, by keyOf. */
const cache = new Map<string, Cell>();
/** Requests waiting for the next flush (by keyOf), each with whoever is waiting on it. */
const waiting = new Map<string, { id: string; as: AboutAs; done: ((c: Cell | null) => void)[] }>();
let timer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (id: string, as: AboutAs) => `${as === "locked" ? "~" : as === "found" ? "!" : ""}${id}`;

async function ask(ids: string[], found: boolean): Promise<Record<string, Cell> | null> {
  try {
    const r = await fetch(`/api/table?about=${ids.map((id) => encodeURIComponent(id)).join(",")}${found ? "&found=1" : ""}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as { about?: Record<string, Cell> }).about ?? {} : null;
  } catch {
    return null;
  }
}

async function flush() {
  timer = null;
  const batch = [...waiting.entries()].slice(0, ABOUT_BATCH);
  for (const [k] of batch) waiting.delete(k);
  if (waiting.size) timer = setTimeout(flush, 0);
  const found = batch.filter(([, w]) => w.as === "found");
  const rest = batch.filter(([, w]) => w.as !== "found");
  const [a, b] = await Promise.all([
    found.length ? ask(found.map(([, w]) => w.id), true) : null,
    rest.length ? ask([...new Set(rest.map(([, w]) => w.id))], false) : null,
  ]);
  for (const [k, w] of batch) {
    const about = w.as === "found" ? a : b;
    // An id the answer leaves out names no company any more: nothing on file.
    const c = about ? about[w.id] ?? { s: "empty" as const } : null;
    if (c) cache.set(k, c);
    for (const f of w.done) f(c);
  }
}

/** The About cell of company `id`, from the session's cache or the next request. Null when it could not be loaded. */
export function loadAbout(id: string, as: AboutAs = "open"): Promise<Cell | null> {
  const k = keyOf(id, as);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const w = waiting.get(k);
    if (w) w.done.push(resolve);
    else waiting.set(k, { id, as, done: [resolve] });
    timer ??= setTimeout(flush, 0);
  });
}

/** What the record shows for an About cell: its text, nothing, loading, or a failed load. */
type AboutNow = { text: string | null; state: "ready" | "loading" | "failed" };

function aboutNow(id: string, cell: Cell | undefined, as: AboutAs): AboutNow {
  if (cell?.s !== "value") return { text: null, state: "ready" };
  if (!cell.lazy) return { text: cell.v || null, state: "ready" };
  const hit = cache.get(keyOf(id, as));
  return hit ? { text: hit.s === "value" ? hit.v || null : null, state: "ready" } : { text: null, state: "loading" };
}

export function useAbout(id: string, cell: Cell | undefined, as: AboutAs = "open"): AboutNow & { retry: () => void } {
  const [now, setNow] = useState<AboutNow>(() => aboutNow(id, cell, as));
  const [tries, setTries] = useState(0);
  const lazy = cell?.s === "value" && !!cell.lazy;
  useEffect(() => {
    // A whole cell (an action's answer) is the newest word on it: keep it for when the table's marker comes back.
    if (cell?.s === "value" && !cell.lazy) cache.set(keyOf(id, as), cell);
    const first = aboutNow(id, cell, as);
    setNow(first);
    if (first.state !== "loading") return;
    let live = true;
    void loadAbout(id, as).then((c) => {
      if (!live) return;
      setNow(c ? { text: c.s === "value" ? c.v || null : null, state: "ready" } : { text: null, state: "failed" });
    });
    return () => {
      live = false;
    };
    // The cell's text and state decide; a new object with the same content changes nothing.
  }, [id, as, cell?.s, lazy, cell?.s === "value" ? cell.v : "", tries]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...now, retry: () => setTries((n) => n + 1) };
}

/**
 * The About block's text in the record: the company's own words, a quiet line while they load, or
 * none on file. A locked company's says under it what its text leaves out.
 */
export function AboutText({ id, cell, as = "open" }: { id: string; cell: Cell | undefined; as?: AboutAs }) {
  const a = useAbout(id, cell, as);
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
  if (!a.text) return <p className="tp-about tp-faint">No About on file yet.</p>;
  return (
    <>
      <p className="tp-about">{a.text}</p>
      {as === "locked" && <p className="tp-about-note">Its name, website and links are left out until you unlock it.</p>}
    </>
  );
}
