"use client";

/**
 * The radar's day (page "radar"; members read it as FEATURE_NAME): the Companies list cut to the
 * companies in one UTC day of the member's signals, the page the email's and Slack's links open
 * (/?p=table&sig=2026-11-19, also ?p=radar). The server decides which companies (GET
 * /api/table?radar=1&day=, lib/radar radarView: only the member's own signals); the rows are the
 * member's own table rows, so a company they don't know stays locked and named by nothing.
 *
 * Each row (desktop) and card (phones) says what happened there and has one button: Unlock
 * company · 2 credits for a locked company (the record's own UnlockCompany, so the zero-credit
 * wall and the daily limit work as everywhere), Open for one the member knows. The row or card
 * itself opens the record, and closing it comes back here. A removable pill says what the list
 * is ("From your Crystal Ball · Nov 19 · 2 companies"); taking it off shows all companies. The
 * last 7 days are one tap each.
 *
 * Signals: radar_opened once per tab when the page shows, radar_clicked when a row is opened.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Me } from "@/lib/tableTypes";
import { YOUR_FEATURE, FEATURE_NAME, yourFeature, type RadarView } from "@/lib/radar/types";
import { IconChevron, IconCheck, IconX, post } from "../ui/shared";
import { isOpenRole, type CoInfo, type Row } from "./model";
import { useUi } from "./ui";
import { DataTable, type SignalRows } from "./Tables";
import { CardList } from "./Cards";
import { UnlockCompany } from "./Drawer";
import { LeaderReport } from "./LeaderReport";
import { plural } from "./hooks";
import { ProRow, planDay } from "./Billing";
import { KnowChip } from "./network/Network"; // [google network]
import "./radar.css";

let openedSent = false;
const signal = (name: "radar_opened" | "radar_clicked", where: string) => void post({ action: { type: "signal", name, where } });

/** "Nov 19". */
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** The day switcher's words: Today, Yesterday, then "Nov 17". */
const dayLabel = (day: string, today: string) => {
  if (day === today) return "Today";
  if (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) === 86_400_000) return "Yesterday";
  return shortDay(day);
};

/**
 * One day's companies from the server, while `active` (the page is open). The last answer stays
 * after the page closes, so the record opened from it steps through the same companies.
 * `day` null: the latest day with something in it.
 */
export function useRadarDay(active: boolean, day: string | null, again: unknown[]) {
  const [data, setData] = useState<RadarView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const want = useRef(0);
  const load = useCallback(async () => {
    const n = ++want.current;
    try {
      const r = await fetch(`/api/table?radar=1${day ? `&day=${encodeURIComponent(day)}` : ""}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (n !== want.current) return;
      if (!r.ok || !j) return setFailed(j?.error || `${YOUR_FEATURE} didn't load. Try again.`);
      setFailed(null);
      setData(j as RadarView);
    } catch {
      if (n === want.current) setFailed("We couldn't reach Merlin. Check your connection and try again.");
    }
  }, [day]);
  useEffect(() => {
    if (active) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, load, ...again]);
  return { data: data && (!day || data.day === day || data.expired) ? data : null, stale: data, failed, reload: load };
}

/** The member's rows for the day's companies, in the server's order (most likely first). */
export function radarRows(view: RadarView | null, rows: Row[]): Row[] {
  if (!view?.rows.length) return [];
  const by = new Map(rows.map((r) => [r.i.c.id, r]));
  // Trial and Pro: a locked company reads by its name here, free (RadarRow.name). It stays locked, with its own Unlock company.
  const named = (r: Row, name?: string): Row => (name && r.i.c.hidden ? { ...r, i: { ...r.i, c: { ...r.i.c, shownName: name } } } : r);
  return view.rows.map((x) => (by.has(x.id) ? named(by.get(x.id)!, x.name) : undefined)).filter((r): r is Row => !!r);
}

/** An open role here has a posted rate behind the lock: the unlock names the rate only then. */
const postedRate = (i: CoInfo) => i.engs.some((e) => isOpenRole(e) && (e.cells.rate?.s === "locked" || e.cells.rate?.s === "value"));

export function RadarPage({
  view,
  failed,
  reload,
  rows,
  me,
  phone,
  onBack,
  onProfile,
  onDay,
  openCompany,
}: {
  view: RadarView | null;
  failed: string | null;
  reload: () => void;
  /** The day's rows (radarRows). */
  rows: Row[];
  me: Me;
  phone: boolean;
  /** All companies: the pill taken off, or Back. */
  onBack: () => void;
  onProfile: () => void;
  onDay: (day: string) => void;
  openCompany: (id: string) => void;
}) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!openedSent) (openedSent = true), signal("radar_opened", "app");
  }, []);

  const open = useCallback(
    (id: string) => {
      signal("radar_clicked", "app");
      openCompany(id);
    },
    [openCompany],
  );
  const openRow = useCallback((r: Row) => open(r.i.c.id), [open]);
  const fnMine = view?.function ?? me.function ?? null;
  // One button a company: Unlock company for a locked one (the record's own), Open for one the member knows.
  const action = useCallback(
    (i: CoInfo) =>
      i.c.hidden ? (
        <UnlockCompany id={i.c.id} rate={postedRate(i)} roles={i.engs.some(isOpenRole)} />
      ) : (
        <span className="rd-acts nw-act">
          {/* [google network] "You know someone · Warm" (nothing with RN_GOOGLE off). */}
          <KnowChip companyId={i.c.id} />
          <button type="button" className="btn rd-open" onClick={() => open(i.c.id)}>
            Open<span className="sr-only"> {i.c.name}</span>
          </button>
          {/* Crystal Ball got it wrong: they already have a full-time leader in the member's function (a fact, 1 credit). */}
          <LeaderReport companyId={i.c.id} fn={fnMine} leads={i.c.leads} from="radar" />
        </span>
      ),
    [open, fnMine],
  );
  const signals = useMemo<SignalRows>(
    () => ({ lines: new Map((view?.rows ?? []).map((x) => [x.id, x.lines])), notes: new Map((view?.rows ?? []).flatMap((x) => (x.notes ? [[x.id, x.notes] as const] : []))), action }),
    [view, action],
  );
  const flip = async () => {
    setBusy(true);
    await ui.act({ type: "settings", radar: !(view?.on ?? true) });
    setBusy(false);
    reload();
  };

  const fn = view?.function ?? me.function;
  const before = view?.before ?? [];
  const n = rows.length;
  const day = view?.day ?? null;
  return (
    <div className="tp-page rd-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> All companies
      </button>
      <h1 className="tp-page-h">{YOUR_FEATURE}</h1>
      <p className="rd-lead">
        Companies in your Ideal Fractional Profile with something new on Merlin
        {fn ? (
          <>
            : a new open {fn} role, a {fn} seat that just ended or a {fn} leader who left, a fractional hire in another function, or a first sales team. Most likely to hire a
            fractional {fn} next comes first, each with why now
            {view?.beforeFromMember && before.length ? `, and the functions you said come before yours (${before.join(", ")}) count for more` : ""}.
          </>
        ) : (
          "."
        )}{" "}
        Unlock any of them right here.
      </p>
      {view?.ready && (
        <p className="rd-legend">
          <span className="rd-band rd-band-high">High</span> <span className="rd-band rd-band-medium">Medium</span> come by email. <span className="rd-band rd-band-low">Low</span> is only here.
        </p>
      )}

      {view?.ready && day && (
        <div className="rd-bar">
          <span className="chip chip-on rd-pill">
            <span>
              From {yourFeature} · {shortDay(day)} · {plural(n, "company", "companies")}
            </span>
            <button type="button" className="rd-pill-x" onClick={onBack} aria-label="Remove this filter and show all companies" title="Show all companies">
              <IconX size={13} />
            </button>
          </span>
          <div className="rd-days" role="group" aria-label="Pick a day">
            {[...view.days, ...(view.days.some((d) => d.day === day) ? [] : [{ day, companies: n }])].map((d) => (
              <button key={d.day} type="button" className={`chip rd-day${d.day === day ? " chip-on" : ""}`} aria-pressed={d.day === day} onClick={() => onDay(d.day)}>
                {dayLabel(d.day, view.today)}
                <span className="num rd-day-n" aria-label={`, ${plural(d.companies, "company", "companies")}`}>
                  {d.companies}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view?.expired && (
        <p className="rd-note rd-expired" role="status">
          That day is older than we keep. Here is the latest instead.
        </p>
      )}

      {failed && !view ? (
        <p className="rd-note" role="alert">
          {failed}{" "}
          <button type="button" className="rd-link" onClick={() => reload()}>
            Try again
          </button>
        </p>
      ) : !view ? (
        <p className="rd-note" role="status">
          Looking at what moved
        </p>
      ) : !view.ready ? (
        <section className="tp-card rd-empty">
          <p className="rd-note">
            {YOUR_FEATURE} needs your function and your Ideal Fractional Profile, the companies you want as clients.
          </p>
          <button type="button" className="btn btn-primary rd-btn" onClick={onProfile}>
            Open Your profile
          </button>
        </section>
      ) : !n ? (
        <section className="tp-card rd-empty">
          <p className="rd-note">
            Nothing moved at companies in your profile {day === view.today ? "today" : `on ${shortDay(day!)}`}. We never send a day with nothing in it.
          </p>
        </section>
      ) : phone ? (
        <div className="rd-cards">
          <CardList type="companies" rows={rows} me={me} onOpen={openRow} signals={signals} />
        </div>
      ) : (
        <div className="tp-frame rd-frame">
          <DataTable type="companies" rows={rows} me={me} selected={null} onOpen={openRow} newSince={null} signals={signals} />
        </div>
      )}

      {view?.ready && (
        <section className="tp-card rd-deliver" aria-labelledby="rd-deliver-h">
          <h2 className="tp-card-h" id="rd-deliver-h">
            Every morning
          </h2>
          <p className="rd-note">
            {!view.on
              ? `${YOUR_FEATURE} is off. This page still lists what moved.`
              : view.email && view.slack
                ? `${YOUR_FEATURE} comes by email and in Slack, on mornings when something moved.`
                : view.email
                  ? `${YOUR_FEATURE} comes by email, on mornings when something moved.`
                  : view.slack
                    ? `${YOUR_FEATURE} comes in Slack, on mornings when something moved.`
                    : `Connect Slack under Integrations to get ${yourFeature} every morning. Until then it is here.`}
          </p>
          <button type="button" role="switch" aria-checked={view.on} className={`tp-ftoggle rd-switch${view.on ? " on" : ""}`} disabled={busy} aria-busy={busy} onClick={() => void flip()}>
            <span className="tp-check" aria-hidden>
              {view.on && <IconCheck size={11} />}
            </span>
            <span className="tp-ftoggle-l">Send me {FEATURE_NAME} emails</span>
          </button>
          {/* Billing live only: Slack as it happens is Pro's. Locked on Free, marked in the trial, nothing on Pro. */}
          <ProRow
            from="radar"
            title="In Slack as it happens"
            free="Pro posts each signal to Slack the moment it shows. On Free they come each morning."
            desc={`Each signal posts to Slack the moment it shows, in your trial until ${planDay(me.plan?.trialEndsAt ?? null)}.${view.slack ? "" : " Connect Slack under Integrations to get them."}`}
          />
        </section>
      )}
    </div>
  );
}
