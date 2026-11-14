"use client";

/**
 * Decides what to show:
 *   signed out            -> Landing (marketing page, join, sign in)
 *   signed in, first run  -> Onboarding (two questions, follow companies, save your link)
 *   signed in             -> TradingPost (the app)
 * Handles ?k=CODE sign-in links and ?ref=CODE invite links.
 */
import { useCallback, useEffect, useState } from "react";
import { ToastProvider, getView, post, useToast, type Act, type View } from "./ui/shared";
import Landing from "./landing/Landing";
import Onboarding from "./onboard/Onboarding";
import TradingPost from "./post/TradingPost";

function App() {
  const [view, setView] = useState<View | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setView(await getView());
  }, []);

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
      await refresh();
    })();
  }, [refresh, toast]);

  const act: Act = useCallback(
    async (a, opts) => {
      const r = await post<{ message: string; id?: string; capped?: boolean }>({ action: a });
      if (r.error) {
        toast(r.error, true);
        return { ok: false, message: r.error };
      }
      if (!opts?.quiet && r.message) toast(r.message);
      await refresh();
      return { ok: true, message: r.message, id: r.id, capped: r.capped };
    },
    [refresh, toast],
  );

  const signOut = useCallback(async () => {
    await post({ signOut: true });
    await refresh();
  }, [refresh]);

  if (!view) return <div className="spinner-page">Loading Trading Post</div>;
  if (!view.me) return <Landing view={view} onSignedIn={refresh} />;
  if (!view.me.onboarded) return <Onboarding view={view} act={act} onDone={refresh} />;
  return <TradingPost view={view} act={act} refresh={refresh} signOut={signOut} />;
}

export default function Root() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
