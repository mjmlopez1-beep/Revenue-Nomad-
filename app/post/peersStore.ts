"use client";

/**
 * Peers in the page (lib/peersCore.ts PeersView): read from GET /api/table?peers=1 and shared by the
 * Peers page, the record's With a peer block and the sheets. Every peer action answers with the
 * whole view, which takes its place here, so each part redraws at once. A pass or a team changes the
 * pipeline and Messages too: those are read again after it.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { post, type Action, errorText } from "../ui/shared";
import type { PeerPicks, PeersHome, PeersView } from "@/lib/peersCore";
import { loadPipeline } from "./pipelineStore";

let view: PeersView | null = null;
let failed: string | null = null;
let loading: Promise<void> | null = null;
let loadedAt = 0;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
const STALE_MS = 60_000;

export function setPeers(v: PeersView | null | undefined) {
  if (!v) return;
  view = v;
  failed = null;
  loadedAt = Date.now();
  tell();
}

export function loadPeers(force = false): Promise<void> {
  if (loading) return loading;
  if (!force && view && Date.now() - loadedAt < STALE_MS) return Promise.resolve();
  loading = (async () => {
    try {
      const r = await fetch("/api/table?peers=1", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error(errorText(r.status, j?.error, "Peers didn't load. Try again."));
      setPeers(j as PeersView);
    } catch (e) {
      failed = e instanceof Error && e.message ? e.message : "We couldn't reach Merlin. Check your connection and try again.";
      tell();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

const sub = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

export function usePeers(load = true): { view: PeersView | null; failed: string | null } {
  const v = useSyncExternalStore(sub, () => view, () => null);
  const f = useSyncExternalStore(sub, () => failed, () => null);
  useEffect(() => {
    if (load) void loadPeers();
  }, [load]);
  return { view: v, failed: f };
}

/** Run a peer action. The answer's view takes the place of the one here; the pipeline is read again after a lead or a team. */
export async function peersAct(action: Action): Promise<{ ok: boolean; message: string }> {
  const r = await post<{ message?: string; peers?: PeersView }>({ action });
  if (r.error) return { ok: false, message: r.error };
  setPeers(r.peers);
  if (["peer.answer", "peer.teamAnswer", "peer.teamLeave"].includes(action.type)) void loadPipeline(true);
  return { ok: true, message: r.message ?? "" };
}

/** Who to pass a company to, or team up with (GET ?peers=picks). */
export async function loadPicks(company: string, role: string | null, forTeam: boolean): Promise<PeerPicks | { error: string }> {
  try {
    const q = new URLSearchParams({ peers: "picks", c: company, ...(role ? { role } : {}), ...(forTeam ? { for: "team" } : {}) });
    const r = await fetch(`/api/table?${q}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    return r.ok && j ? (j as PeerPicks) : { error: errorText(r.status, j?.error, "That didn't load. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

export async function loadPeersHome(): Promise<PeersHome | null> {
  try {
    const r = await fetch("/api/table?peers=home", { cache: "no-store" });
    return r.ok ? ((await r.json()) as PeersHome) : null;
  } catch {
    return null;
  }
}

/**
 * A team or a lead to open when the Peers page draws (an email's link, Home's card). Taken once.
 * The address the app opened with is read when this file loads (the table rewrites the address
 * before the Peers page's own code arrives): ?p=peers&team= or &lead= from an email's link.
 */
let want: { team?: string; lead?: string } | null = (() => {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get("p") !== "peers") return null;
  return q.get("team") ? { team: q.get("team")! } : q.get("lead") ? { lead: q.get("lead")! } : null;
})();
export const openPeersAt = (w: { team?: string; lead?: string }) => {
  want = w;
};
export const takePeersWant = () => {
  const w = want;
  want = null;
  return w;
};

/**
 * Peers' badge in the sidebar: leads passed to the member and team-up asks waiting on them. Read
 * from Home's small answer once, a moment after the app paints, then from the Peers view whenever
 * it is here.
 */
export function usePeersNew(): number {
  const v = useSyncExternalStore(sub, () => view, () => null);
  const [home, setHome] = useState<number>(0);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void loadPeersHome().then((h) => live && h && setHome(h.leads.filter((l) => l.side === "to-you").length + h.teams.length));
    }, 2500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);
  if (v) return v.inbox.filter((l) => l.status === "new").length + v.teams.filter((t) => !t.invited && t.status === "invited").length;
  return home;
}
