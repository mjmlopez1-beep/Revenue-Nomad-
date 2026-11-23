"use client";

/**
 * The new look's bell, v1 (BUILD_PLAN F1): one place for what is new, merged from what exists
 * today. Proposal and document notifications (GET /api/activity, Close only, marked read with
 * POST {op: "read"}), unread conversations, leads and team-ups from peers, and the counts since
 * the last visit (companies you follow that changed, open roles in your function, Crystal Ball's
 * new companies). Bell v2 reads one inbox (F5, Stage 7). Nothing here is stored.
 *
 * The count dot is ember only when the screen's ember budget allows (two ember marks at most).
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CloseInboxView } from "@/lib/close/types";
import { errorText, timeAgo } from "../../ui/shared";
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
  const [v, setV] = useState<CloseInboxView | null>(null);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const load = useCallback(() => {
    void inbox().then((r) => !("error" in r) && setV(r));
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
  const close = () => setOpen(false);
  const lines: BellLine[] = [];
  if (counts.unread > 0) lines.push({ id: "msg", head: plural(counts.unread, "conversation"), text: "with something new for you", fresh: true, go: go.messages });
  if (counts.peers > 0) lines.push({ id: "peers", head: plural(counts.peers, "lead or team-up", "leads and team-ups"), text: "from your peers", fresh: true, go: go.peers });
  if (counts.radar > 0) lines.push({ id: "radar", head: plural(counts.radar, "new company", "new companies"), text: "in your Crystal Ball", fresh: true, go: go.radar });
  if (counts.roles > 0) lines.push({ id: "roles", head: plural(counts.roles, fn ? `new ${fn} role` : "new open role"), text: "since your last visit", fresh: true, go: go.hiring });
  if (counts.follows > 0) lines.push({ id: "follows", head: plural(counts.follows, "company", "companies"), text: "you follow changed since your last visit", fresh: true, go: go.following });
  for (const x of v?.open ? v.items.slice(0, 12) : [])
    lines.push({
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
  const n = lines.filter((l) => l.fresh).length;
  const inboxUnread = v?.open ? v.unread : 0;
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
              <button type="button" className="tp-flink" onClick={() => read()}>
                Mark all read
              </button>
            )}
          </div>
          {lines.length === 0 ? (
            <p className="ws-bell-empty">Nothing new yet. When a company on a list starts hiring, a client opens your proposal or someone replies to you, it shows here and in your email.</p>
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
