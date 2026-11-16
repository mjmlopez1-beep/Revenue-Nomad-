"use client";

/**
 * Decides what to show:
 *   signed out            -> Landing (marketing page, join, sign in)
 *   signed in, first run  -> Onboarding (two questions, follow companies, keep your link)
 *   signed in             -> TradingPost (the app)
 * Handles ?k=CODE sign-in links and ?ref=CODE invite links. Every other query key (the app's
 * place: ?c=, ?p=, ?v= and so on) stays in the address bar for the app to read. A link with
 * ?c= opens that company for a member and the landing page for anyone else.
 *
 * Keeping the view fresh:
 *   - The server can answer 503 with Retry-After (busy or paused). The view on screen stays and
 *     we try again after that many seconds. An error body never becomes the view.
 *   - A tab that comes back into view after a minute or more reloads its view.
 *   - Background refreshes that pile up (several follows in a row) run once more at the end,
 *     not once each, and a company that did not change keeps its object, so its rows don't
 *     render again.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ToastProvider, fetchView, patchView, post, useToast, type Act, type ActPatch, type View, type ViewResult } from "./ui/shared";
import type { TradingPostProps } from "./post/TradingPost";

/* ---------- loading: the shape of what is coming, not a line of gray text ---------- */

/** Set once a view arrives: "1" for a member, "0" for a visitor. It picks the loading shape on the next visit. */
const HINT = "tp_member";
const readHint = () => {
  try {
    return window.localStorage.getItem(HINT) === "1";
  } catch {
    return false;
  }
};
/**
 * The last view this browser loaded had no member in it, or it never loaded one: draw the
 * landing page at once, with its counts filled in when the view arrives. Blocked storage counts
 * as a member. A member whose storage was cleared sees the landing page for a moment, once.
 */
const lastSawVisitor = () => {
  try {
    return window.localStorage.getItem(HINT) !== "1";
  } catch {
    return false;
  }
};
const writeHint = (member: boolean) => {
  try {
    window.localStorage.setItem(HINT, member ? "1" : "0");
  } catch {}
};

const SKELETON_CSS = `
.sk{min-height:100vh;background:var(--bg)}
.sk-bar{height:56px;background:var(--pine)}
.sk-lp .sk-bar{height:64px}
.sk-body{display:flex}
.sk-rail{width:264px;flex:none;min-height:calc(100vh - 56px);border-right:1px solid var(--line);background:var(--surface);padding:24px 20px;display:grid;align-content:start;gap:14px}
.sk-main{flex:1;min-width:0;padding:20px 24px}
.sk-line{height:12px;border-radius:6px;background:var(--line)}
.sk-frame{margin-top:20px;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}
.sk-row{height:44px;display:flex;align-items:center;gap:24px;padding:0 16px;border-top:1px solid var(--line)}
.sk-row:first-child{border-top:0}
.sk-row .sk-line:first-child{width:22%}
.sk-row .sk-line{width:12%}
.sk-cards{display:none}
.sk-msg{display:grid;justify-items:center;gap:16px;padding:48px 24px;text-align:center;color:var(--body-ink,#2b3631);font-size:16px;line-height:24px}
.sk-hero{max-width:720px;margin:72px auto 0;padding:0 24px;display:grid;gap:16px}
.sk-hero .sk-line{height:20px}
@keyframes sk-fade{50%{opacity:.55}}
.sk-line{animation:sk-fade 1.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.sk-line{animation:none}}
@media (max-width:1279px){.sk-rail{display:none}}
@media (max-width:767px),(pointer:coarse) and (max-height:599px){
  .sk-body{display:block}
  .sk-main{padding:12px 16px}
  .sk-frame{display:none}
  .sk-cards{display:grid;gap:12px;margin-top:16px}
  .sk-card{height:160px;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:16px;display:grid;align-content:start;gap:12px}
  .sk-card .sk-line:first-child{width:55%;height:16px}
  .sk-card .sk-line{width:80%}
  .sk-hero{margin-top:40px}
}
`;

/** The page before the view arrives: the app's frame for a member, the landing's bar for anyone else. A message replaces the rows when loading failed. */
const noSubscribe = () => () => {};
function Skeleton({ member, children }: { member?: boolean; children?: React.ReactNode }) {
  // The server's HTML can't read the hint, so it draws the landing's bar; the browser corrects it as it hydrates.
  const hinted = useSyncExternalStore(noSubscribe, readHint, () => false);
  const app = member ?? hinted;
  const bars = (n: number, cls: string) =>
    Array.from({ length: n }, (_, k) => (
      <div key={k} className={cls}>
        <span className="sk-line" />
        <span className="sk-line" />
        <span className="sk-line" />
      </div>
    ));
  return (
    <div className={`sk${app ? "" : " sk-lp"}`} role={children ? undefined : "status"} aria-busy={!children}>
      <style>{SKELETON_CSS}</style>
      <div className="sk-bar" />
      {children ? (
        <div className="sk-msg" role="alert">
          {children}
        </div>
      ) : app ? (
        <div className="sk-body">
          <div className="sk-rail" aria-hidden>
            {Array.from({ length: 9 }, (_, k) => (
              <span key={k} className="sk-line" style={{ width: `${50 + ((k * 37) % 40)}%` }} />
            ))}
          </div>
          <div className="sk-main">
            <span className="sr-only">Opening Trading Post</span>
            <span className="sk-line" style={{ display: "block", width: 280, maxWidth: "70%", height: 16 }} aria-hidden />
            <div className="sk-frame" aria-hidden>
              {bars(12, "sk-row")}
            </div>
            <div className="sk-cards" aria-hidden>
              {bars(3, "sk-card")}
            </div>
          </div>
        </div>
      ) : (
        <div className="sk-hero">
          <span className="sr-only">Opening Trading Post</span>
          <span className="sk-line" style={{ width: "80%" }} aria-hidden />
          <span className="sk-line" style={{ width: "60%" }} aria-hidden />
          <span className="sk-line" style={{ width: "40%", height: 12 }} aria-hidden />
        </div>
      )}
    </div>
  );
}

const appLoading = () => <Skeleton member />;
const pageLoading = () => <Skeleton member={false} />;
// Each screen is its own chunk: signed-out visitors never download the app, members never download the landing page.
const Landing = dynamic(() => import("./landing/Landing"), { ssr: false, loading: pageLoading });
const Onboarding = dynamic(() => import("./onboard/Onboarding"), { ssr: false, loading: pageLoading });
/**
 * `start` is where the app opens when the member has just finished onboarding: "seats" when a
 * seat on file carries their name, so the first thing they see is what they can fill in.
 * The app reads it once, when it mounts.
 */
const TradingPost = dynamic<TradingPostProps>(() => import("./post/TradingPost"), { ssr: false, loading: appLoading });

/*
 * Start the view and the likely next chunk as soon as this file runs, not after the first
 * render: they download side by side. A sign-in link (?k=) signs in first, so it waits.
 */
let early: Promise<ViewResult> | null = null;
if (typeof window !== "undefined") {
  const q = new URLSearchParams(window.location.search);
  if (!q.has("k")) early = fetchView();
  if (readHint()) void import("./post/TradingPost");
  else void import("./landing/Landing");
}

/** Actions that create records: wait for the full view so the new record is there. */
const FULL_REFRESH = new Set(["add", "addPerson", "profile", "adminRemoveMember"]);

const NETWORK = "We couldn't reach Trading Post. Check your connection and try again.";

/**
 * The new view, with every company that did not change keeping its old object (and the list
 * keeping its old array when nothing changed), so the rows built from them are reused.
 */
const sigs = new WeakMap<object, string>();
const sigOf = (o: object) => {
  let s = sigs.get(o);
  if (s === undefined) {
    s = JSON.stringify(o);
    sigs.set(o, s);
  }
  return s;
};
function reuse(prev: View | null, next: View): View {
  if (!prev || !prev.companies || !next.companies) return next;
  const old = new Map(prev.companies.map((c) => [c.id, c]));
  let same = prev.companies.length === next.companies.length;
  const companies = next.companies.map((c, k) => {
    const o = old.get(c.id);
    if (o && sigOf(o) === sigOf(c)) {
      if (prev.companies[k] !== o) same = false;
      return o;
    }
    same = false;
    return c;
  });
  const me = prev.me && next.me && sigOf(prev.me) === sigOf(next.me) ? prev.me : next.me;
  return { ...next, me, companies: same ? prev.companies : companies };
}

function App() {
  const [view, setView] = useState<View | null>(null);
  /** Why the first load failed (nothing on screen yet). */
  const [failed, setFailed] = useState<string | null>(null);
  // A ?k= sign-in link that failed: the landing page opens Sign in with this message.
  const [signInError, setSignInError] = useState<string | null>(null);
  // A visitor (as far as this browser knows) gets the landing page before the view arrives.
  const [guest, setGuest] = useState(false);
  const toast = useToast();
  // Only the newest refresh may set the view, so a slow one never undoes a later patch.
  const gen = useRef(0);
  const loaded = useRef(false);
  const lastLoad = useRef(0);
  // The member went through onboarding on this page load (it decides where the app opens).
  const firstRun = useRef(false);
  // A busy or paused server: one retry waits, and the member hears about it once.
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toldBusy = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async () => {
    const g = ++gen.current;
    let r: ViewResult;
    try {
      const pending = early;
      early = null;
      r = await (pending ?? fetchView());
    } catch {
      r = { view: null, error: NETWORK, status: 0, retryAfter: null };
    }
    if (!r.view) {
      // An error answer has no table in it. Keep what is on screen, and try again when the server says.
      if (r.retryAfter && !retry.current) {
        retry.current = setTimeout(() => {
          retry.current = null;
          void refreshRef.current();
        }, Math.min(r.retryAfter, 120) * 1000);
      }
      if (!loaded.current) setFailed(r.error);
      else if (r.status === 503 && !toldBusy.current) {
        toldBusy.current = true;
        toast(r.error, true);
      }
      return;
    }
    toldBusy.current = false;
    loaded.current = true;
    lastLoad.current = Date.now();
    writeHint(!!r.view.me);
    setFailed(null);
    const v = r.view;
    if (g === gen.current) setView((prev) => reuse(prev, v));
  }, [toast]);
  refreshRef.current = refresh;

  /**
   * A refresh in the background. While one is on its way, more requests fold into one more
   * run when it lands: five follows in a row download the table twice, not five times.
   */
  const syncing = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const sync = useCallback(() => {
    if (syncing.current) {
      again.current = true;
      return;
    }
    syncing.current = (async () => {
      do {
        again.current = false;
        await refresh();
      } while (again.current);
      syncing.current = null;
    })();
  }, [refresh]);

  /** First load. If it fails there is nothing on screen yet, so say why and offer another try. */
  const load = useCallback(async () => {
    setFailed(null);
    await refresh();
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
      if (!k && lastSawVisitor()) setGuest(true);
      if (k) {
        const r = await post({ signIn: k });
        if (r.error) setSignInError(r.error);
      }
      if (k || ref) {
        url.searchParams.delete("k");
        url.searchParams.delete("ref");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      await load();
    })();
  }, [load, toast]);

  // A tab that comes back after a minute away reloads, so it never shows credits or locks another tab already changed.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible" && loaded.current && Date.now() - lastLoad.current > 60_000) sync();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [sync]);

  const act: Act = useCallback(
    async (a, opts) => {
      gen.current++; // a refresh still in flight predates this action
      // Follow flips at once. The answer carries no cells, so the background refresh confirms it.
      const flip = a.type === "follow" ? a : null;
      if (flip) setView((v) => (v ? { ...v, companies: v.companies.map((c) => (c.id === flip.companyId ? { ...c, following: flip.on } : c)) } : v));
      const r = await post<{ message: string; id?: string; capped?: boolean } & ActPatch>({ action: a });
      if (r.error) {
        if (!opts?.silentError) toast(r.error, true);
        sync(); // replaces any background sync this action superseded, and undoes a flip that failed
        return { ok: false, message: r.error };
      }
      if (!opts?.quiet && r.message) toast(r.message);
      if (flip) sync();
      else if (!FULL_REFRESH.has(a.type) && (r.cells || r.me)) {
        // Show the change now; the full view syncs in the background.
        setView((v) => (v ? patchView(v, r) : v));
        sync();
      } else await refresh();
      return { ok: true, message: r.message, id: r.id, capped: r.capped };
    },
    [refresh, sync, toast],
  );

  const signOut = useCallback(async () => {
    await post({ signOut: true });
    await refresh();
  }, [refresh]);

  /** Onboarding's last step: its profile action already reloaded the view, so a second download in the same breath is skipped. */
  const onboarded = useCallback(async () => {
    if (Date.now() - lastLoad.current > 1500) await refresh();
  }, [refresh]);

  const onboarding = !!view?.me && !view.me.onboarded;
  useEffect(() => {
    if (onboarding) firstRun.current = true;
  }, [onboarding]);

  if (!view)
    return failed ? (
      <Skeleton>
        <p>{failed}</p>
        <button type="button" className="btn" onClick={load}>
          Try again
        </button>
      </Skeleton>
    ) : guest ? (
      <Landing view={null} onSignedIn={refresh} />
    ) : (
      <Skeleton />
    );
  if (!view.me) return <Landing view={view} onSignedIn={refresh} signInError={signInError} />;
  if (onboarding) return <Onboarding view={view} act={act} onDone={onboarded} />;
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
