"use client";

/**
 * Stage 1, Builder C's way to try Home and Find in the new look in this branch, before the merge:
 * TradingPost mounts this on Home when the address said ?p=home2 or ?p=find2 and GET /api/ask says
 * RN_UI2 is not off. At the merge the page registry (app/post/shell/pages.tsx) mounts Home2 and Find
 * directly with AppCtx, and this file goes: it only wires today's TradingPost callbacks to their props.
 *
 * What it stands in for until then: the six steps (Builder A's getStarted.ts), the first-visit test
 * (firstVisit.ts), and the RN_UI2 gate (View.ui2).
 */
import { useEffect, useMemo } from "react";
import type { SavedViewRec } from "@/lib/tableTypes";
import type { AskPlan } from "@/lib/ask";
import type { CheckStep } from "../model";
import type { HomeProps } from "../Home";
import { Home2, sixSteps } from "../Home2";
import { Find } from "./Find";
import { setFindStart } from "./start";
import { useUi } from "../ui";

export type Try2Page = "home2" | "find2";
/** The address the app opened with, read once when this code loads (the app rewrites it after). */
export const TRY2_START: Try2Page | null = (() => {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search).get("p");
  return p === "home2" || p === "find2" ? p : null;
})();

/** RN_UI2 as the server has it ("off", "optin", "on"). */
export async function ui2Mode(): Promise<"off" | "optin" | "on"> {
  try {
    const r = await fetch("/api/ask", { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as { ui2?: string } | null;
    return j?.ui2 === "on" || j?.ui2 === "optin" ? j.ui2 : "off";
  } catch {
    return "off";
  }
}

export function Try2({
  which,
  setWhich,
  home,
  checks,
  openView,
  go,
  onProfile,
  runNudge,
}: {
  which: Try2Page;
  setWhich: (w: Try2Page | null) => void;
  home: HomeProps;
  checks: CheckStep[] | null;
  openView: (v: SavedViewRec) => void;
  go: (page: string) => void;
  onProfile: () => void;
  runNudge: (action: string) => void;
}) {
  const ui = useUi();
  const me = home.me;
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("p", which);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {
      /* the address stays */
    }
  }, [which]);
  const first = me.unlocked === 0 && me.added === 0 && ui.seats.n === 0;
  const six = useMemo(
    () =>
      home.waiting
        ? null
        : sixSteps({
            me,
            infos: home.infos,
            seatsN: ui.seats.n,
            network: !!checks?.find((c) => c.key === "network")?.done,
            go: {
              icp: onProfile,
              seats: () => runNudge("seats"),
              network: () => runNudge("connect"),
              open: home.table.go,
              alert: () => document.getElementById("h2-lists")?.scrollIntoView({ block: "start", behavior: "smooth" }),
            },
          }),
    [home.waiting, me, home.infos, ui.seats.n, checks, onProfile, runNudge, home.table.go],
  );
  const onAsk = (plan: AskPlan, text: string) => {
    if (plan.page === "find") return setFindStart({ plan, text }), setWhich("find2");
    if (plan.page === "lookup" || plan.page === "warm") return setFindStart({ lookup: plan.company ?? text }), setWhich("find2");
    if (plan.page === "hiring") return home.roles.go();
    if (plan.page === "radar") return home.radar.go();
    go(plan.page);
  };
  if (which === "find2")
    return (
      <Find
        me={me}
        infos={home.infos}
        waiting={home.waiting}
        first={first}
        openCompany={home.openCompany}
        openList={(v) => (setWhich(null), openView(v))}
        openPage={(p) => go(p)}
        home={{ go: () => setWhich("home2") }}
        onProfile={onProfile}
      />
    );
  return <Home2 {...home} six={six} first={first} onAsk={onAsk} openFind={() => setWhich("find2")} openPage={(p) => go(p)} openList={(v) => (setWhich(null), openView(v))} />;
}
