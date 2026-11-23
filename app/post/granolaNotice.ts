/**
 * Granola's way back (?granola=connected|denied|failed|unavailable, from
 * /api/integrations/granola/callback): read when this file loads. It loads with the shell
 * (settings/at.ts imports it), before the app rewrites the address, and the first Granola card on
 * screen shows it once (granolaClient.ts useGranolaNotice).
 */
export type GranolaNotice = "connected" | "denied" | "failed" | "unavailable";

let notice: GranolaNotice | null = (() => {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("granola");
  return v === "connected" || v === "denied" || v === "failed" || v === "unavailable" ? v : null;
})();

/** The notice, once, and off the address. */
export function takeGranolaNotice(): GranolaNotice | null {
  const n = notice;
  notice = null;
  if (n)
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("granola")) {
        u.searchParams.delete("granola");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      }
    } catch {}
  return n;
}
