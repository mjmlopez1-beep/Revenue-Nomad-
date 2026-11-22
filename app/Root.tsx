"use client";

/**
 * Decides what to show:
 *   signed out            -> Landing (marketing page, join, sign in)
 *   signed in, first run  -> Onboarding (who you are, ideal clients, who comes before you, the first view, your seats, your link)
 *   signed in             -> TradingPost (the app)
 * Handles ?k=CODE sign-in links and ?ref=CODE invite links. Every other query key (the app's
 * place: ?c=, ?p=, ?v= and so on) stays in the address bar for the app to read. A link with
 * ?c= opens that company for a member and the landing page for anyone else.
 *
 * Keeping the view fresh:
 *   - An action's answer carries what it changed (the records it touched, the member's numbers,
 *     the credit history rows it wrote), so the page applies it and does not download the whole
 *     table again. The answer also says the table's version: when other members changed the table
 *     since this page downloaded it, the page downloads it again, at most once a minute.
 *   - The server can answer 503 with Retry-After (busy or paused). The view on screen stays and
 *     we try again after that many seconds. An error body never becomes the view.
 *   - A tab that comes back into view after a minute or more reloads its view.
 *   - Background refreshes that pile up run once more at the end, not once each, and a company
 *     that did not change keeps its object, so its rows don't render again.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ALREADY_OPEN, SIGNED_IN_LINK_USED, ToastProvider, alreadyOpen, calmRefusal, fetchFirst, fetchView, patchView, post, useToast, type Act, type ActPatch, type ActResult, type FirstResult, type View, type ViewResult } from "./ui/shared";
import type { TradingPostProps } from "./post/TradingPost";
import type { OnboardingProps } from "./onboard/Onboarding";
import type { Me } from "@/lib/tableTypes";
import { sigDayOf, yourFeature } from "@/lib/radar/types";

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
/**
 * The page's own answer said this browser holds a sign-in cookie (middleware.ts sets rn_in=1 on
 * the page while rn_table is there): a member as far as the server can tell, even on the first
 * visit in this browser, before any view has set the hint. The sign-in cookie itself stays out of
 * the page's reach; this one only says it is there.
 */
const signedInHere = () => {
  try {
    return /(?:^|;\s*)rn_in=1(?:;|$)/.test(document.cookie);
  } catch {
    return false;
  }
};
/** Draw and load the member's app first: the hint says so, or the server saw the sign-in cookie. */
const likelyMember = () => readHint() || signedInHere();
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
  const hinted = useSyncExternalStore(noSubscribe, likelyMember, () => false);
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
            <span className="sr-only">Opening Merlin</span>
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
          <span className="sr-only">Opening Merlin</span>
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
/**
 * `viewReady` false: onboarding opened from the join answer alone (its `me`), with no companies
 * yet. The full table is on its way in the background, and the view is replaced when it lands.
 */
const Onboarding = dynamic<OnboardingProps & { viewReady?: boolean }>(() => import("./onboard/Onboarding"), { ssr: false, loading: pageLoading });
/**
 * Onboarding's own component, once its code is here (JoinForm starts the download while the name
 * is typed): drawn as it is, so it shows the moment the join answer lands. Through the dynamic
 * wrapper it would wait behind its loading frame, which React holds for about 300 ms.
 */
let onboardingNow: React.ComponentType<OnboardingProps & { viewReady?: boolean }> | null = null;
/**
 * `start` is where the app opens when the member has just finished onboarding: "seats" when a
 * seat on file carries their name, so the first thing they see is what they can fill in.
 * The app reads it once, when it mounts.
 */
const TradingPost = dynamic<TradingPostProps>(() => import("./post/TradingPost"), { ssr: false, loading: appLoading });
/** The app's own component once its code is here, drawn as it is (as onboardingNow): the first screen shows the moment it can. */
let tradingPostNow: React.ComponentType<TradingPostProps> | null = null;
const loadTradingPost = () =>
  import("./post/TradingPost").then(
    (m) => (tradingPostNow = m.default),
    () => null,
  );

/*
 * Start the view and the likely next chunk as soon as this file runs, not after the first
 * render: they download side by side. A sign-in link (?k=) signs in first, so it waits.
 *
 * A member (as far as this browser knows, or the page's answer said it holds a sign-in cookie:
 * likelyMember) gets the first screen first: GET ?first=1 (fetchFirst), a few KB, Today's answer
 * on Today's address and the list's first rows elsewhere. The app draws from it, and the full view
 * (megabytes of JSON to read and work through on a phone) is asked for once that is on screen.
 * Anyone else gets the view at once (signed out it is the counts only).
 */
let early: Promise<ViewResult> | null = null;
let earlyFirst: Promise<FirstResult | null> | null = null;
if (typeof window !== "undefined") {
  const q = new URLSearchParams(window.location.search);
  const member = likelyMember();
  if (!q.has("k")) {
    if (member) earlyFirst = fetchFirst(window.location.search);
    else early = fetchView();
  }
  if (member) void loadTradingPost();
  else void import("./landing/Landing");
}

/** An admin removing everything a member added changes records all over the table: wait for the full view. */
const FULL_REFRESH = new Set(["adminRemoveMember"]);
/** Other members' changes show within this long of an action (or of coming back to the tab). */
const REFRESH_EVERY = 60_000;
/**
 * Up to this much more, picked at random each time: members who all arrived together (a blast)
 * would otherwise all download the table again in the same second, a minute later.
 */
const REFRESH_SPREAD = 30_000;

/** "<boot>:<commits>" (View.version), read. */
const parseVersion = (v: string | null | undefined) => {
  const m = typeof v === "string" ? v.match(/^(.+):(\d+)$/) : null;
  return m ? { boot: m[1], n: Number(m[2]) } : null;
};
/**
 * The table changed since the page's copy beyond this one action: more than one commit later, a
 * restart, or a version the page can't read. Changes by other members in the same commit as the
 * action wait for the next download.
 */
const othersChanged = (known: string | null, answer: string | null | undefined) => {
  const a = parseVersion(answer);
  const k = parseVersion(known);
  return !a || !k || a.boot !== k.boot || a.n > k.n + 1;
};

/** Run `f` once the page has painted what was just set (a frame, then a task), or after half a second at most (a hidden tab has no frames). */
function afterPaint(f: () => void) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    f();
  };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 500);
}

/** Sign in's note for a visitor who followed a message email's link while signed out. */
const MESSAGE_NOTE = "Sign in to read your message.";
/** A link to a day of the radar (?sig=, its email and Slack). Signed out, Sign in opens with this; the emailed sign-in link comes back to the same day. */
const RADAR_NOTE = `Sign in to see the companies from ${yourFeature}.`;
const MESSAGE_LINK_USED = "That link was already used, or it's more than 7 days old. Sign in to read your message.";
/** A link in the Crystal Ball or weekly email that was already used, or is more than 7 days old (?in=used, lib/emailIn.ts). */
const EMAIL_LINK_USED = "That link from your email was already used, or it's more than 7 days old. Sign in to open it.";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";

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
  // A link to a conversation (?p=messages, from a message email). Signed out, Sign in opens with a note.
  // Signed in by that email's one-time link, the member goes straight to it, skipping onboarding for this visit.
  const [toMessage] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("p") === "messages");
  const [toRadar] = useState(() => typeof window !== "undefined" && !!sigDayOf(new URLSearchParams(window.location.search).get("sig")));
  // Just activated a fractional profile (app/claim/Claim.tsx): their record and first conversation, skipping onboarding for this visit.
  const [toWelcome] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1" && new URLSearchParams(window.location.search).get("p") === "fractionals");
  const linkNote = toMessage ? MESSAGE_NOTE : toRadar ? RADAR_NOTE : null;
  const fromMessageLink = useRef(false);
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
  /** The table version of the view on screen (View.version), moved on by each action's answer that only carried this page's own change. */
  const version = useRef<string | null>(null);
  /** Other members changed the table since the page's copy: download it again (see markStale). */
  const stale = useRef(false);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markStaleRef = useRef<() => void>(() => {});
  /** The view on screen is the join answer's Me with no companies (see joined): the table is still on its way. */
  const [viewReady, setViewReady] = useState(true);
  const waitingView = useRef(false);
  const syncRef = useRef<() => void>(() => {});
  /** A view with companies reached this page (deriveInSlices ran for it). */
  const hadTable = useRef(false);
  /**
   * The view on screen is the first screen only (GET ?first=1: Today's companies, or the list's
   * first rows' companies), and the full view is on its way. TradingPost draws from it, and waits
   * for the full view for anything else.
   */
  const [partial, setPartial] = useState<Pick<FirstResult, "first" | "today"> | null>(null);
  /** The app's component as first drawn (tradingPostNow or the dynamic wrapper), kept so it never mounts twice. */
  const postRef = useRef<React.ComponentType<TradingPostProps> | null>(null);
  /** What to do once TradingPost has drawn the first screen (ask for the full view). */
  const drawnThen = useRef<(() => void) | null>(null);
  const onDrawn = useCallback(() => {
    const f = drawnThen.current;
    drawnThen.current = null;
    f?.();
  }, []);

  const refresh = useCallback(async () => {
    const g = ++gen.current;
    const firstScreen = earlyFirst;
    earlyFirst = null;
    let signedOut: View | null = null;
    if (firstScreen) {
      // With the app's code, so it draws the moment the answer is set (not behind the dynamic wrapper's loading frame).
      const [f] = await Promise.all([firstScreen.catch(() => null), tradingPostNow ?? loadTradingPost()]);
      if (f?.view.me && g === gen.current && !loaded.current) {
        loaded.current = true;
        writeHint(true);
        setFailed(null);
        version.current = f.view.version ?? null;
        // The full view is owed at once, even when an action overtakes its download (see below).
        waitingView.current = true;
        setViewReady(false);
        // Onboarding opens on Me alone, as after joining: its first view waits for the full table.
        const onboarded = !!f.view.me.onboarded;
        setView(onboarded ? f.view : { ...f.view, companies: [] });
        setPartial(onboarded ? { first: f.first, today: f.today } : null);
        // The full view once the first screen is on screen (TradingPost's onDrawn), so reading it never holds up that paint.
        // Onboarding asks for it at once, as after joining.
        if (onboarded) {
          drawnThen.current = () => afterPaint(() => syncRef.current());
          // Should it never draw (a chunk that failed to load), the full view comes all the same.
          setTimeout(onDrawn, 3000);
        } else syncRef.current();
        return;
      }
      // Signed out after all (a sign-in cookie that is nobody's): that answer is the signed-out view itself, not asked for again.
      if (f && !f.view.me) signedOut = f.view;
    }
    let r: ViewResult;
    try {
      const pending = early;
      early = null;
      r = signedOut ? { view: signedOut } : await (pending ?? fetchView());
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
    // The first table on this page: what the app works out for each company is worked out a slice at a
    // time first (deriveInSlices), so a phone never freezes on a few thousand companies at once. A later
    // download keeps the records that did not change (reuse), and their work with them.
    if (!hadTable.current && v.companies.length) {
      // Loaded with the app (TradingPost and Onboarding use it), so a visitor on the landing page never downloads it.
      await import("./post/model").then((m) => m.deriveInSlices(v.companies)).catch(() => {});
      hadTable.current = true;
    }
    // A refresh an action overtook is dropped (it may predate the action), so the table is still owed:
    // at once while onboarding waits for its first table, else within the minute.
    if (g !== gen.current) return waitingView.current ? syncRef.current() : markStaleRef.current();
    version.current = v.version ?? null;
    stale.current = false;
    waitingView.current = false;
    setViewReady(true);
    setPartial(null);
    setView((prev) => reuse(prev, v));
  }, [toast, onDrawn]);
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
  syncRef.current = sync;

  /**
   * Signed in. Joining hands over the new member's Me (the join answer's): onboarding opens on it
   * at once, with the counts the landing page already had and no companies, and the table
   * downloads in the background (viewReady false until it lands). Otherwise, the table first.
   */
  const joined = useCallback(
    async (me?: Me) => {
      if (!me || me.onboarded) return refresh();
      if (!onboardingNow) onboardingNow = (await import("./onboard/Onboarding").catch(() => null))?.default ?? null;
      waitingView.current = true;
      setViewReady(false);
      setView((v) => ({ demo: v?.demo ?? false, me, companies: [], stats: v?.stats ?? { companies: 0, engagements: 0, people: 0, fractionalFriendly: 0, openRoles: 0, members: 0, facts: 0, starter: me.credits }, ledger: [], reported: [], email: v?.email ?? false, contact: v?.contact }));
      sync();
    },
    [refresh, sync],
  );

  /**
   * Other members changed the table since this page downloaded it: download it again a minute
   * or so after the last download (at once when that was longer ago). A hidden tab waits until it
   * is back in view (see the focus handler below), so a background tab costs nothing.
   */
  const markStale = useCallback(() => {
    stale.current = true;
    if (staleTimer.current) return;
    const due = lastLoad.current + REFRESH_EVERY + Math.random() * REFRESH_SPREAD;
    staleTimer.current = setTimeout(() => {
      staleTimer.current = null;
      if (stale.current && document.visibilityState === "visible") sync();
    }, Math.max(0, due - Date.now()));
  }, [sync]);
  markStaleRef.current = markStale;

  /** After an action's answer: it carried this page's own change only (the version moved by one), or the table is owed. */
  const settle = useCallback(
    (r: ActPatch) => {
      if (r.partial || othersChanged(version.current, r.version)) return markStale();
      const a = parseVersion(r.version);
      const k = parseVersion(version.current);
      if (a && k && a.n > k.n) version.current = r.version!;
    },
    [markStale],
  );

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
      // A discount code (?code=RN-SURVEY10) stays from the landing page through joining and the sign-in link, for checkout.
      const code = url.searchParams.get("code");
      if (code) {
        try {
          localStorage.setItem("tp_code", code.slice(0, 40));
        } catch {}
      }
      if (!k && lastSawVisitor() && !signedInHere()) setGuest(true);
      // An email's link that no longer signs in (lib/emailIn.ts): signed out, Sign in opens and says why.
      const spent = url.searchParams.get("in") === "used";
      if (spent && !k) setSignInError(EMAIL_LINK_USED);
      let signedInNow = false;
      if (k) {
        const r = await post({ signIn: k });
        const toThread = url.searchParams.get("p") === "messages";
        // A message email's link lasts 7 days, not the 20 minutes a sign-in email's link does.
        if (r.error) setSignInError(toThread && /expired or was already used/.test(r.error) ? MESSAGE_LINK_USED : r.error);
        else {
          signedInNow = true;
          if (toThread) fromMessageLink.current = true;
        }
      }
      if (k || ref || spent) {
        url.searchParams.delete("k");
        url.searchParams.delete("ref");
        url.searchParams.delete("in");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      // Just signed in by the link (often the first visit in this browser): the first screen first, as for any member.
      if (signedInNow && !earlyFirst && !early) {
        earlyFirst = fetchFirst(window.location.search);
        void loadTradingPost();
      }
      await load();
    })();
  }, [load, toast]);

  // A tab that comes back after a minute away reloads, so it never shows credits or locks another tab already changed.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== "visible" || !loaded.current) return;
      if (Date.now() - lastLoad.current > REFRESH_EVERY) sync();
      else if (stale.current) markStale(); // owed while the tab was away: due a minute after the last download
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
      if (retry.current) clearTimeout(retry.current);
      if (staleTimer.current) clearTimeout(staleTimer.current);
    };
  }, [sync, markStale]);

  const act: Act = useCallback(
    async (a, opts) => {
      gen.current++; // a refresh still in flight predates this action
      // Follow flips at once; the answer brings the company as the server now has it.
      const flip = a.type === "follow" ? a : null;
      if (flip) setView((v) => (v ? { ...v, companies: v.companies.map((c) => (c.id === flip.companyId ? { ...c, following: flip.on } : c)) } : v));
      const r = await post<{ message: string; id?: string; capped?: boolean; moves?: ActResult["moves"] } & ActPatch>({ action: a });
      if (r.error) {
        // Already unlocked for this member, from another device or tab: no mistake. A calm word, and the table as it is now.
        if (alreadyOpen(r.error)) {
          if (!opts?.silentError) toast(ALREADY_OPEN);
          await refresh();
          return { ok: false, message: ALREADY_OPEN };
        }
        if (!opts?.silentError) toast(r.error, !calmRefusal(r.error));
        // The day's unlock limit: every unlock button says "Unlocks again tomorrow" at once, before the table comes back.
        const fewer = /^You can unlock (\d+) more today/.exec(r.error);
        const left = fewer ? Number(fewer[1]) : /^You've unlocked \d+ facts today|^You've reached today's unlock limit/.test(r.error) ? 0 : null;
        if (left !== null) setView((v) => (v?.me ? { ...v, me: { ...v.me, unlocksLeft: Math.min(left, v.me.unlocksLeft ?? left) } } : v));
        sync(); // replaces any background sync this action superseded, and undoes a flip that failed
        return { ok: false, message: r.error };
      }
      if (!opts?.quiet && r.message) toast(r.message);
      if (FULL_REFRESH.has(a.type)) await refresh();
      else {
        // The answer carries what changed: show it, and download the table again only when others changed it too (settle).
        setView((v) => (v ? patchView(v, r) : v));
        settle(r);
      }
      return { ok: true, message: r.message, id: r.id, capped: r.capped, ...(r.moves ? { moves: r.moves } : {}) };
    },
    [refresh, settle, sync, toast],
  );

  const signOut = useCallback(async () => {
    await post({ signOut: true });
    // The app's place (?c=, ?p= and the rest) is the member's. The landing page starts clean.
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {}
    await refresh();
  }, [refresh]);

  /** Skipped onboarding ("Skip to the table"): the app opens on the table, even with seats on file. */
  const skipped = useRef(false);
  /**
   * Onboarding's last step. Its profile answer already put the member's answers on screen (their
   * first view with them, which the table opens on), so the app opens at once. Anything else
   * onboarding sent on its own comes with one download in the background (skipped when one just landed).
   */
  const onboarded = useCallback(() => {
    setObHold(false);
    if (Date.now() - lastLoad.current > 1500) sync();
  }, [sync]);
  /**
   * Onboarding's last step sends the profile as it shows (the trial starts, so Crystal Ball names its
   * companies there): the member reads as onboarded from then on, and onboarding stays on screen until
   * its own button (onDone). A reload from there opens the app.
   */
  const [obHold, setObHold] = useState(false);
  const holdOnboarding = useCallback(() => setObHold(true), []);
  const onSkip = useCallback(() => {
    skipped.current = true;
  }, []);

  // A sign-in link that no longer works, opened in a browser that is signed in already: the landing page's Sign in never
  // shows here, so a small notice says what happened (the member stays signed in).
  // Read once, on the first table after the link was tried (a sign-in through the landing page later never says it).
  const linkChecked = useRef(false);
  useEffect(() => {
    if (linkChecked.current || !view) return;
    linkChecked.current = true;
    if (!view.me || !signInError) return;
    toast(SIGNED_IN_LINK_USED);
    setSignInError(null);
  }, [view, signInError, toast]);

  const onboarding = !!view?.me && (!view.me.onboarded || obHold) && !fromMessageLink.current && !toMessage && !toWelcome;
  useEffect(() => {
    if (onboarding) firstRun.current = true;
  }, [onboarding]);

  // A member who brought a discount code (?code=, kept as tp_code) that the server doesn't have yet: give it over once, so checkout applies it.
  const codeSent = useRef(false);
  const needCode = !!view?.me?.plan && !view.me.plan.code;
  useEffect(() => {
    if (!needCode || codeSent.current) return;
    let code = "";
    try {
      code = localStorage.getItem("tp_code") ?? "";
    } catch {}
    if (!code) return;
    codeSent.current = true;
    void post<{ message?: string }>({ action: { type: "promoCode", code } }).then((r) => (r.error ? undefined : refresh()));
  }, [needCode, refresh]);

  if (!view)
    return failed ? (
      <Skeleton>
        <p>{failed}</p>
        <button type="button" className="btn" onClick={load}>
          Try again
        </button>
      </Skeleton>
    ) : guest ? (
      <Landing view={null} onSignedIn={joined} signInNote={linkNote} />
    ) : (
      <Skeleton />
    );
  if (!view.me) return <Landing view={view} onSignedIn={joined} signInError={signInError} signInNote={linkNote} />;
  if (onboarding) {
    const Ob = onboardingNow ?? Onboarding;
    return <Ob view={view} act={act} onDone={onboarded} onSkip={onSkip} viewReady={viewReady} onHold={holdOnboarding} />;
  }
  // Done with onboarding before its first table landed: the app's frame until it does. The first screen draws without it.
  if (!viewReady && !partial) return <Skeleton member />;
  // Straight from onboarding, a member with seats under their name starts on those seats.
  const start = firstRun.current && !skipped.current && view.companies.some((c) => c.engagements.some((e) => e.yours)) ? "seats" : undefined;
  // Picked once: switching from the dynamic wrapper to the component itself later would mount the app again.
  postRef.current ??= tradingPostNow ?? TradingPost;
  const Post = postRef.current;
  return <Post view={view} act={act} refresh={refresh} signOut={signOut} start={start} partial={partial} onDrawn={partial ? onDrawn : undefined} />;
}

export default function Root() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
