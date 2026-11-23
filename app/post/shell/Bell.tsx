"use client";

/**
 * The new look's bell, v2 (BUILD_PLAN F5, Stage 7a): the member's inbox (GET /api/table?inbox=1,
 * lib/inbox.ts: every alert that went out by email or Slack, and every alert with its bell on: a
 * list's new roles, a seat ended, a new leader, a fact changed, funding, someone you know, Crystal
 * Ball's day, the weekly email), marked read with POST { action: { type: "inbox.read" } }; with it,
 * as before, the proposal and document notifications (GET /api/activity, Close only, marked read
 * with POST {op: "read"}), unread conversations and leads and team-ups from peers. The counts since
 * the last visit (companies you follow, open roles in your function, Crystal Ball) stay while the
 * inbox has no unread line of their kind, so nothing is said twice. Nothing here is stored.
 *
 * The count dot is ember only when the screen's ember budget allows (two ember marks at most).
 *
 * A workflow's run waiting at its monthly limit (lib/workflows, Beta) shows "Say yes · N credits" and
 * "Not now" on its line: POST { action: { type: "workflow.approve", run, yes } }. Only a yes spends.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CloseInboxView } from "@/lib/close/types";
import type { InboxView } from "@/lib/inbox";
import { errorText, timeAgo, useToast } from "../../ui/shared";
import { openItem } from "../Activity";
import { Anchored, UiCtx } from "../ui";
import { plural } from "../hooks";
import "./shell.css";

const BellIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15zM10 21a2 2 0 0 0 4 0" />
  </svg>
);

async function inbox(body?: Record<string, unknown>): Promise<CloseInboxView | { error: string }> {
  try {
    const r = await fetch("/api/activity", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? (j as CloseInboxView) : { error: errorText(r.status, j.error, "That didn't load.") };
  } catch {
    return { error: "We couldn't reach Merlin." };
  }
}

async function alertsInbox(ids?: string[] | "all"): Promise<InboxView | { error: string }> {
  try {
    const r = ids
      ? await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: { type: "inbox.read", ...(ids === "all" ? {} : { ids }) } }) })
      : await fetch("/api/table?inbox=1", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: errorText(r.status, j.error, "That didn't load.") };
    return ids ? ((j as { inbox?: InboxView }).inbox ?? { items: [], unread: 0 }) : (j as InboxView);
  } catch {
    return { error: "We couldn't reach Merlin." };
  }
}

/** Where an inbox line opens, from its in-app address: a company's record, or a page. */
function goHref(href: string, ui: { openCompany: (id: string) => void; openPage: (p: never) => void } | null, go: { hiring: () => void; radar: () => void; messages: () => void; alerts: () => void }) {
  const q = new URLSearchParams(href.startsWith("/?") ? href.slice(2) : "");
  const c = q.get("c");
  if (c && ui) return ui.openCompany(c);
  if (q.get("v") === "hiring") return go.hiring();
  const p = q.get("p");
  if (p === "radar" || q.get("sig")) return go.radar();
  if (p === "messages") return go.messages();
  if (p === "alerts" || !p || !ui) return go.alerts();
  ui.openPage(p as never);
}

/** One line in the bell: what happened, when, and where it goes. */
export interface BellLine {
  id: string;
  head: string;
  text: string;
  sub?: string;
  /** New (counted on the dot). */
  fresh: boolean;
  go: () => void;
  /** A proposal notification: marked read on the server when opened. */
  inbox?: boolean;
  /** A workflow's run waiting for the member's yes (lib/workflows). */
  ask?: { run: string; credits: number };
}

async function answerAsk(run: string, yes: boolean): Promise<{ message: string } | { error: string }> {
  try {
    const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: { type: "workflow.approve", run, yes } }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { message: String(j.message ?? "") } : { error: errorText(r.status, j.error, "That didn't go through.") };
  } catch {
    return { error: "We couldn't reach Merlin." };
  }
}

export interface BellCounts {
  /** Conversations with something unread. */
  unread: number;
  /** Leads and team-up asks from peers waiting. */
  peers: number;
  /** Companies you follow with news since the last visit. */
  follows: number;
  /** Open roles in your function since the last visit. */
  roles: number;
  /** New companies in your Crystal Ball. */
  radar: number;
}

export function Bell({
  counts,
  fn,
  go,
  ember,
}: {
  counts: BellCounts;
  /** The member's function, to name the roles ("3 new Sales roles"). */
  fn: string | null;
  go: { messages: () => void; peers: () => void; following: () => void; hiring: () => void; radar: () => void; alerts: () => void };
  /** The dot may be ember (the screen's budget allows it). */
  ember: boolean;
}) {
  const ui = useContext(UiCtx);
  const toast = useToast();
  const [asking, setAsking] = useState<string | null>(null);
  const [v, setV] = useState<CloseInboxView | null>(null);
  const [mine, setMine] = useState<InboxView | null>(null);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const load = useCallback(() => {
    void inbox().then((r) => !("error" in r) && setV(r));
    void alertsInbox().then((r) => !("error" in r) && setMine(r));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), 120_000);
    window.addEventListener("focus", load);
    return () => (window.clearInterval(t), window.removeEventListener("focus", load));
  }, [load]);
  const read = (ids?: string[]) => {
    if (!v) return;
    setV({ ...v, unread: ids ? v.items.filter((x) => !x.read && !ids.includes(x.id)).length : 0, items: v.items.map((x) => (!ids || ids.includes(x.id) ? { ...x, read: true } : x)) });
    void inbox({ op: "read", ...(ids ? { ids } : {}) });
  };
  const readMine = (ids?: string[]) => {
    if (!mine) return;
    setMine({ unread: ids ? mine.items.filter((x) => !x.read && !ids.includes(x.id)).length : 0, items: mine.items.map((x) => (!ids || ids.includes(x.id) ? { ...x, read: true } : x)) });
    void alertsInbox(ids ?? "all").then((r) => !("error" in r) && setMine(r));
  };
  // A count since the last visit stays only while the inbox has no unread line that says the same.
  const told = (kinds: string[]) => !!mine?.items.some((x) => !x.read && kinds.includes(x.kind));
  const close = () => setOpen(false);
  const lines: BellLine[] = [];
  if (counts.unread > 0) lines.push({ id: "msg", head: plural(counts.unread, "conversation"), text: "with something new for you", fresh: true, go: go.messages });
  if (counts.peers > 0) lines.push({ id: "peers", head: plural(counts.peers, "lead or team-up", "leads and team-ups"), text: "from your peers", fresh: true, go: go.peers });
  if (counts.radar > 0 && !told(["radar"])) lines.push({ id: "radar", head: plural(counts.radar, "new company", "new companies"), text: "in your Crystal Ball", fresh: true, go: go.radar });
  if (counts.roles > 0 && !told(["roles"])) lines.push({ id: "roles", head: plural(counts.roles, fn ? `new ${fn} role` : "new open role"), text: "since your last visit", fresh: true, go: go.hiring });
  if (counts.follows > 0 && !told(["fact"])) lines.push({ id: "follows", head: plural(counts.follows, "company", "companies"), text: "you follow changed since your last visit", fresh: true, go: go.following });
  // The inbox and the proposal notifications, newest first, together.
  const dated: (BellLine & { at: string })[] = [];
  for (const x of mine?.items.slice(0, 20) ?? [])
    dated.push({
      id: `ib:${x.id}`,
      at: x.at,
      head: x.line,
      text: "",
      sub: [timeAgo(x.at), x.sub].filter(Boolean).join(" · "),
      fresh: !x.read,
      ...(x.ask && !x.ask.answer ? { ask: { run: x.ask.run, credits: x.ask.credits } } : {}),
      go: () => {
        if (!x.read) readMine([x.id]);
        goHref(x.href, ui as never, go);
      },
    });
  for (const x of v?.open ? v.items.slice(0, 12) : [])
    dated.push({
      at: x.at,
      id: x.id,
      head: x.head,
      text: x.text,
      sub: [timeAgo(x.at), x.sub].filter(Boolean).join(" · "),
      fresh: !x.read,
      inbox: true,
      go: () => {
        if (!x.read) read([x.id]);
        openItem(ui, x.item.startsWith("dc_") ? { dc: x.item } : { pr: x.item });
      },
    });
  lines.push(...dated.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20));
  const n = lines.filter((l) => l.fresh).length;
  const inboxUnread = (v?.open ? v.unread : 0) + (mine?.unread ?? 0);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="ws-hbtn ws-bell"
        aria-label={n ? `Notifications, ${n} new` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : (setOpen(true), load()))}
      >
        <BellIcon />
        {n > 0 && (
          <span className={`ws-bell-n num${ember ? "" : " quiet"}`} aria-hidden>
            {n > 99 ? "99+" : n}
          </span>
        )}
      </button>
      {open && btn.current && (
        <Anchored anchor={btn.current} onClose={close} width={380} align="end" role="dialog" label="Notifications" className="ws-bellpop">
          <div className="ws-bell-head">
            <h2 className="ws-bell-h">Notifications</h2>
            {inboxUnread > 0 && (
              <button type="button" className="tp-flink" onClick={() => (read(), readMine())}>
                Mark all read
              </button>
            )}
          </div>
          {lines.length === 0 ? (
            <p className="ws-bell-empty">Nothing new yet. Every alert with the bell on shows here, on every page: a company on a list starts hiring, a seat ends, a client opens your proposal, someone replies to you.</p>
          ) : (
            <ul className="ws-bell-list">
              {lines.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="ws-bell-row"
                    onClick={() => {
                      close();
                      l.go();
                    }}
                  >
                    <span className="ws-bell-dot" data-new={l.fresh} aria-hidden />
                    <span className="ws-bell-t">
                      <span>
                        {l.fresh && <span className="sr-only">New: </span>}
                        <strong>{l.head}</strong> {l.text}
                      </span>
                      {l.sub && <span className="ws-bell-sub">{l.sub}</span>}
                    </span>
                  </button>
                  {l.ask && (
                    <span className="ws-bell-ask">
                      <button
                        type="button"
                        className="btn btn-sm btn-pine"
                        disabled={asking === l.ask.run}
                        onClick={() => {
                          const run = l.ask!.run;
                          setAsking(run);
                          void answerAsk(run, true).then((r) => {
                            setAsking(null);
                            toast("error" in r ? r.error : r.message || "Done.", "error" in r);
                            load();
                          });
                        }}
                      >
                        Say yes · {l.ask.credits === 1 ? "1 credit" : `${l.ask.credits} credits`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        disabled={asking === l.ask.run}
                        onClick={() => {
                          const run = l.ask!.run;
                          setAsking(run);
                          void answerAsk(run, false).then((r) => {
                            setAsking(null);
                            toast("error" in r ? r.error : "Nothing was spent.", "error" in r);
                            load();
                          });
                        }}
                      >
                        Not now
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="ws-bell-foot"
            onClick={() => {
              close();
              go.alerts();
            }}
          >
            Alerts and workflows
          </button>
        </Anchored>
      )}
    </>
  );
}
