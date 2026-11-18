"use client";

/**
 * The Radar page (page "radar", the menu's Find section): the last 24 hours' signals at companies
 * in the member's Ideal Fractional Profile, so a member without Slack or email still sees them.
 * The server decides what each plan reveals (GET /api/table?radar=1, lib/radar): free, one greyed
 * card with no company and "N more today"; Pro, every card with the company when the member's
 * table shows it, each opening its record. Phone first: one column, every action a 44px tap.
 *
 * Signals: radar_opened once per tab when the page shows, radar_clicked on a card or See who.
 */
import { useCallback, useEffect, useState } from "react";
import type { RadarCard, RadarKind, RadarView } from "@/lib/radar/types";
import { IconChevron, IconCheck, IconLock, post } from "../ui/shared";
import { useUi } from "./ui";
import "./radar.css";

const KIND: Record<RadarKind, string> = { adjacent: "Hire before yours", role: "Open role", seat: "Seat ended", funding: "Funding" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let openedSent = false;
const signal = (name: "radar_opened" | "radar_clicked", where: string) => void post({ action: { type: "signal", name, where } });

export function Radar({ onBack, onProfile, openCompany }: { onBack: () => void; onProfile: () => void; openCompany: (id: string) => void }) {
  const ui = useUi();
  const me = ui.me;
  const [data, setData] = useState<RadarView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [whoNote, setWhoNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/table?radar=1", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) return setFailed(j?.error || "Your radar didn't load. Try again.");
      setFailed(null);
      setData(j as RadarView);
    } catch {
      setFailed("We couldn't reach Merlin. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, me.function, me.icp, me.before, me.radar]);
  useEffect(() => {
    if (!openedSent) (openedSent = true), signal("radar_opened", "app");
  }, []);

  const open = (c: RadarCard) => {
    signal("radar_clicked", "app");
    const id = new URLSearchParams(c.url.split("?")[1] ?? "").get("c");
    if (id) openCompany(id);
  };
  const seeWho = () => {
    signal("radar_clicked", "app");
    // With billing on, the upgrade link. Off, nobody is on Pro yet: say so in place.
    if (data?.billing && data.day) window.location.assign(data.day.seeWho);
    else setWhoNote(true);
  };
  const flip = async () => {
    setBusy(true);
    await ui.act({ type: "settings", radar: !(data?.on ?? true) });
    setBusy(false);
    void load();
  };

  const fn = data?.function ?? me.function;
  const before = data?.before ?? [];
  const day = data?.day ?? null;
  return (
    <div className="tp-page rd-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Your next-client radar</h1>
      <p className="rd-lead">
        Companies in your Ideal Fractional Profile that moved in the last 24 hours
        {fn ? (
          <>
            : a fractional hire in a function that usually comes before {fn}
            {before.length ? ` (${before.join(", ")})` : ""}, a new open {fn} role, or a {fn} seat that just ended.
          </>
        ) : (
          "."
        )}
      </p>

      {failed && !data ? (
        <p className="rd-note" role="alert">
          {failed}{" "}
          <button type="button" className="rd-link" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : !data ? (
        <p className="rd-note" role="status">
          Looking at what moved
        </p>
      ) : !data.ready ? (
        <section className="tp-card rd-empty">
          <p className="rd-note">Your radar needs your function and your Ideal Fractional Profile, the companies you want as clients.</p>
          <button type="button" className="btn btn-primary rd-btn" onClick={onProfile}>
            Open Your profile
          </button>
        </section>
      ) : !day ? (
        <section className="tp-card rd-empty">
          <p className="rd-note">Nothing moved at companies in your profile in the last 24 hours. We never send a day with nothing in it.</p>
        </section>
      ) : day.pro ? (
        <>
          <p className="rd-count">
            <b className="num">{day.cards.length}</b> {day.cards.length === 1 ? "signal" : "signals"} today
          </p>
          <ul className="rd-list">
            {day.cards.map((c) => (
              <li key={c.id}>
                <button type="button" className="rd-card rd-card-pro" onClick={() => open(c)}>
                  <span className={`rd-kind rd-kind-${c.kind}`}>{KIND[c.kind]}</span>
                  <span className="rd-h">{c.headline}</span>
                  <span className="rd-facts">{c.facts.join(" · ")}</span>
                  <span className="rd-why">{c.why}</span>
                  <span className="rd-go">
                    {c.locked ? (
                      <>
                        <IconLock size={12} /> Unlock it in the record
                      </>
                    ) : (
                      "Open the record and the way in"
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="rd-count">
            <b className="num">{day.total}</b> {day.total === 1 ? "signal" : "signals"} today
          </p>
          <ul className="rd-list">
            {day.cards.map((c) => (
              <li key={c.id}>
                <div className="rd-card rd-card-free" aria-label={`${KIND[c.kind]}: ${c.headline}`}>
                  <span className={`rd-kind rd-kind-${c.kind}`}>{KIND[c.kind]}</span>
                  <span className="rd-h">{c.headline}</span>
                  <span className="rd-facts">{c.facts.join(" · ")}</span>
                  <span className="rd-why">{c.why}</span>
                </div>
              </li>
            ))}
          </ul>
          {day.more > 0 && <p className="rd-more">{plural(day.more, "more signal")} today</p>}
          <button type="button" className="btn btn-primary rd-btn" onClick={seeWho}>
            See who
          </button>
          {whoNote && (
            <p className="rd-note rd-who" role="status">
              Who it is, and the way in, comes with Pro, which isn&apos;t open yet. Every one of these companies is in the table: filter by your profile to find them.
            </p>
          )}
        </>
      )}

      {data?.ready && (
        <section className="tp-card rd-deliver" aria-labelledby="rd-deliver-h">
          <h2 className="tp-card-h" id="rd-deliver-h">
            Every morning
          </h2>
          <p className="rd-note">
            {!data.on
              ? "Your radar is off. This page still lists what moved."
              : data.email && data.slack
                ? "Your radar comes by email and in Slack, on mornings when something moved."
                : data.email
                  ? "Your radar comes by email, on mornings when something moved."
                  : data.slack
                    ? "Your radar comes in Slack, on mornings when something moved."
                    : "Connect Slack under Integrations to get your radar every morning. Until then it is here."}
          </p>
          <button type="button" role="switch" aria-checked={data.on} className={`tp-ftoggle rd-switch${data.on ? " on" : ""}`} disabled={busy} aria-busy={busy} onClick={() => void flip()}>
            <span className="tp-check" aria-hidden>
              {data.on && <IconCheck size={11} />}
            </span>
            <span className="tp-ftoggle-l">Send me my radar</span>
          </button>
        </section>
      )}
    </div>
  );
}
