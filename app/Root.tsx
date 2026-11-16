"use client";

/**
 * Decides what to show:
 *   signed out            -> Landing (marketing page, join, sign in)
 *   signed in, first run  -> Onboarding (two questions, follow companies, keep your link)
 *   signed in             -> TradingPost (the app)
 * Handles ?k=CODE sign-in links and ?ref=CODE invite links.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ToastProvider, getView, patchView, post, useToast, type Act, type ActPatch, type View } from "./ui/shared";
import type { TradingPostProps } from "./post/TradingPost";

// Each screen is its own chunk: signed-out visitors never download the app, members never download the landing page.
const loading = () => <div className="spinner-page">Opening Trading Post</div>;
const Landing = dynamic(() => import("./landing/Landing"), { ssr: false, loading });
const Onboarding = dynamic(() => import("./onboard/Onboarding"), { ssr: false, loading });
/**
 * `start` is where the app opens when the member has just finished onboarding: "seats" when a
 * seat on file carries their name, so the first thing they see is what they can fill in.
 * The app reads it once, when it mounts.
 */
const TradingPost = dynamic<TradingPostProps>(() => import("./post/TradingPost"), { ssr: false, loading });

/** Actions that create records: wait for the full view so the new record is there. */
const FULL_REFRESH = new Set(["add", "addPerson", "profile"]);

function App() {
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  const toast = useToast();
  // Only the newest refresh may set the view, so a slow one never undoes a later patch.
  const gen = useRef(0);
  const loaded = useRef(false);
  // The member went through onboarding on this page load (it decides where the app opens).
  const firstRun = useRef(false);

  const refresh = useCallback(async () => {
    const g = ++gen.current;
    const v = await getView();
    // An error answer (a rate limit, say) has no table in it. Keep what is on screen.
    if (!v?.stats) return;
    loaded.current = true;
    if (g === gen.current) setView(v);
  }, []);

  /** First load. If it fails there is nothing on screen yet, so say so and offer another try. */
  const load = useCallback(async () => {
    setFailed(false);
    try {
      await refresh();
    } catch {}
    if (!loaded.current) setFailed(true);
  }, [refresh]);

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const k = url.searchParams.get("k");
      const ref = url.searchParams.get("ref");
      if (ref) {
        try {
          localStorage.setItem("tp_ref", ref);
        } catch {}
      }
      if (k) {
        const r = await post({ signIn: k });
        if (r.error) toast(r.error, true);
      }
      if (k || ref) {
        url.searchParams.delete("k");
        url.searchParams.delete("ref");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      await load();
    })();
  }, [load, toast]);

  const act: Act = useCallback(
    async (a, opts) => {
      gen.current++; // a refresh still in flight predates this action
      const r = await post<{ message: string; id?: string; capped?: boolean } & ActPatch>({ action: a });
      if (r.error) {
        toast(r.error, true);
        void refresh(); // replaces any background sync this action superseded
        return { ok: false, message: r.error };
      }
      if (!opts?.quiet && r.message) toast(r.message);
      if (!FULL_REFRESH.has(a.type) && (r.cells || r.me)) {
        // Show the change now; the full view syncs in the background.
        setView((v) => (v ? patchView(v, r) : v));
        void refresh();
      } else await refresh();
      return { ok: true, message: r.message, id: r.id, capped: r.capped };
    },
    [refresh, toast],
  );

  const signOut = useCallback(async () => {
    await post({ signOut: true });
    await refresh();
  }, [refresh]);

  const onboarding = !!view?.me && !view.me.onboarded;
  useEffect(() => {
    if (onboarding) firstRun.current = true;
  }, [onboarding]);

  if (!view)
    return failed ? (
      <div className="spinner-page" role="alert">
        <div style={{ display: "grid", gap: 16, justifyItems: "center", padding: 24, textAlign: "center" }}>
          <p>Trading Post did not load. Check your connection and try again.</p>
          <button type="button" className="btn" onClick={load}>
            Try again
          </button>
        </div>
      </div>
    ) : (
      loading()
    );
  if (!view.me) return <Landing view={view} onSignedIn={refresh} />;
  if (onboarding) return <Onboarding view={view} act={act} onDone={refresh} />;
  // Straight from onboarding, a member with seats under their name starts on those seats.
  const start = firstRun.current && view.companies.some((c) => c.engagements.some((e) => e.yours)) ? "seats" : undefined;
  return <TradingPost view={view} act={act} refresh={refresh} signOut={signOut} start={start} />;
}

export default function Root() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
