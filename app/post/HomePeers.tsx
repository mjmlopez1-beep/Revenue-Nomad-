"use client";

/**
 * Home's "From your peers", above Since your last visit (GET ?peers=home, lib/peers.ts peersHome):
 * leads passed to the member ("Ana passed you Acme: open Sales role, posted $9k/mo", opened free for
 * them) with Take it, leads of theirs a peer took since they last looked, team-up asks, and new posts
 * in their circle's thread. Nothing at all when there is nothing.
 */
import { useContext, useEffect, useState } from "react";
import type { PeersHome } from "@/lib/peersCore";
import { IconChevron, timeAgo, useToast } from "../ui/shared";
import { UiCtx } from "./ui";
import { loadPeersHome, openPeersAt, peersAct } from "./peersStore";
import { Avatar } from "./PeerSheets";
import "./peers.css";

export function FromYourPeers({ openCompany }: { openCompany: (id: string) => void }) {
  const ui = useContext(UiCtx);
  const toast = useToast();
  const [d, setD] = useState<PeersHome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadPeersHome().then((h) => live && setD(h));
    return () => {
      live = false;
    };
  }, []);
  const any = !!d && (d.leads.length > 0 || d.teams.length > 0 || !!d.circle);
  // Seen once shown: a peer taking the member's lead shows here once.
  useEffect(() => {
    if (!any) return;
    const t = setTimeout(() => void peersAct({ type: "peer.seen" }), 4000);
    return () => clearTimeout(t);
  }, [any]);
  if (!d || !any || !ui) return null;
  const go = (w?: { team?: string; lead?: string }) => {
    if (w) openPeersAt(w);
    ui.openPage("peers");
  };
  const take = async (id: string, yes: boolean) => {
    setBusy(id);
    const r = await peersAct({ type: "peer.answer", id, take: yes });
    setBusy(null);
    toast(r.message, !r.ok);
    if (r.ok) setD((x) => (x ? { ...x, leads: x.leads.filter((l) => l.id !== id) } : x));
  };
  return (
    <section className="hm-sec hm-peers" aria-labelledby="hm-peers-h">
      <h2 className="hm-h2" id="hm-peers-h">
        From your peers
      </h2>
      <ul className="pe-leads">
        {d.leads.map((l) =>
          l.side === "to-you" ? (
            <li key={l.id} className="pe-lead pe-lead-new">
              <Avatar name={l.who.name} small />
              <div className="pe-lead-main">
                <p className="pe-lead-line">
                  <b>{l.line}</b>
                </p>
                {l.note && <p className="pe-lead-note">&ldquo;{l.note}&rdquo;</p>}
                <p className="pe-muted pe-lead-meta">{timeAgo(l.at)} · Opened free for you, a gift from a peer</p>
                <div className="pe-row">
                  <button type="button" className="btn btn-sm btn-pine" aria-busy={busy === l.id} onClick={() => void take(l.id, true)}>
                    Take it
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => openCompany(l.company)}>
                    Open the company
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void take(l.id, false)}>
                    Not for me
                  </button>
                </div>
              </div>
            </li>
          ) : (
            <li key={l.id} className="pe-lead">
              <Avatar name={l.who.name} small />
              <div className="pe-lead-main">
                <p className="pe-lead-line">
                  <b>
                    {l.who.first} took the lead you passed{l.name ? `: ${l.name}` : ""}
                  </b>
                </p>
                <p className="pe-muted pe-lead-meta">{l.credited ? `You earned ${l.credited} credits. Thank you for thinking of them.` : "Thank you for thinking of them."}</p>
              </div>
            </li>
          ),
        )}
        {d.teams.map((t) => (
          <li key={t.id} className="pe-lead pe-lead-new">
            <Avatar name={t.with.name} small />
            <div className="pe-lead-main">
              <p className="pe-lead-line">
                <b>
                  {t.with.first} wants to team up on {t.name ?? (t.kind ? `a ${t.kind}` : "a company")}
                </b>
              </p>
              <p className="pe-muted pe-lead-meta">{t.me.fn && t.with.fn ? `A ${t.with.fn} and ${t.me.fn} pitch, together.` : "Two fractionals, one pitch."}</p>
              <div className="pe-row">
                <button type="button" className="btn btn-sm btn-pine" onClick={() => go({ team: t.id })}>
                  See the team space
                </button>
              </div>
            </div>
          </li>
        ))}
        {d.circle && (
          <li className="pe-lead">
            <span className="pe-av pe-av-sm" aria-hidden>
              {d.circle.unread}
            </span>
            <div className="pe-lead-main">
              <p className="pe-lead-line">
                <b>
                  {d.circle.unread === 1 ? "A new post" : `${d.circle.unread} new posts`} in {d.circle.name}
                </b>
              </p>
              {d.circle.latest && (
                <p className="pe-muted pe-lead-meta">
                  {d.circle.latest.first}: {d.circle.latest.text}
                </p>
              )}
              <button type="button" className="hm-more" onClick={() => go()}>
                Open your circle <IconChevron dir="right" size={12} />
              </button>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
