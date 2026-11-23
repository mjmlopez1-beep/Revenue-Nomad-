"use client";

/**
 * Someone you know changed jobs, on Home (a move in Today) and on Warm paths (GET /api/table?known=1,
 * lib/notify/knownView.ts). The people come from the member's own LinkedIn connections file,
 * contacts CSV and Google, for that member alone. The lines are the server's words: a Californian is never named,
 * and at a company the member hasn't opened nobody is named and the company is described by its
 * industry and size. Read once per page load and shared by both places.
 */
import { useEffect, useState } from "react";
import type { KnownView } from "@/lib/notify/knownView";
import { timeAgo } from "../../ui/shared";
import "./knownMoves.css";

let snap: KnownView | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<(v: KnownView | null) => void>();

/** Read it again (after a file is brought in or a company opened). */
export function loadKnownMoves(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetch("/api/table?known=1", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: KnownView) => {
      snap = j;
      subs.forEach((f) => f(snap));
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function useKnownMoves(enabled = true): KnownView | null {
  const [v, setV] = useState<KnownView | null>(snap);
  useEffect(() => {
    if (!enabled) return;
    subs.add(setV);
    // Read again on each mount: a company opened since names its line now.
    if (snap) setV(snap);
    void loadKnownMoves(!!snap);
    return () => {
      subs.delete(setV);
    };
  }, [enabled]);
  return enabled ? v : null;
}

/**
 * The moves as a short list. `where` "home": a section of Today; "warm": a section of Warm paths
 * (its own classes). Nothing at all while there is no move.
 */
export function KnownMoves({ where, openCompany, enabled = true }: { where: "home" | "warm"; openCompany: (id: string) => void; enabled?: boolean }) {
  const v = useKnownMoves(enabled);
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), []);
  if (!v?.list.length) return null;
  const home = where === "home";
  return (
    <section className={home ? "hm-sec kn kn-home" : "wp-sug kn kn-warm"} aria-labelledby={`kn-h-${where}`} data-known-moves>
      <div className={home ? "kn-head" : "wp-src-head"}>
        <h2 id={`kn-h-${where}`} className={home ? "hm-h2 kn-h" : undefined}>
          Someone you know changed jobs
        </h2>
        <span className={home ? "kn-sub" : "wp-sub"}>From your own LinkedIn file and contacts. A new leader is the warmest way in there.</span>
      </div>
      <ul className="kn-list">
        {v.list.map((m) => (
          <li key={m.id}>
            <button type="button" className="kn-row" onClick={() => openCompany(m.company)} data-known={m.company}>
              <span className="kn-main">
                <span className="kn-line">{m.line}</span>
                <span className="kn-meta">
                  {now ? `${timeAgo(m.at)} · ` : ""}
                  {m.named ? "Open the company and say congratulations" : "Open the company to see who it is"}
                </span>
              </span>
              <span className="kn-go" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
