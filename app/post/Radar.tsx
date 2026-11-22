"use client";

/**
 * The radar's page (page "radar"; members read it as FEATURE_NAME): the Companies list cut to the
 * companies in a range of the member's signals, Today, Last 7 days or Last 30 days, each company
 * once at its most recent day (the line beside it says which day). It opens on Today when Today has
 * companies, else Last 7 days, else Last 30 days (?p=radar; ?p=radar&range=7d once picked). An
 * email's or Slack's link names a day (/?p=table&sig=2026-11-19) and opens that day alone, exactly
 * what it listed, with the ranges a tap away. The server decides which companies (GET
 * /api/table?radar=1&range=&day=, lib/radar radarView: only the member's own signals); the rows are the
 * member's own table rows, so a company they don't know stays locked and named by nothing.
 *
 * Each row (desktop) and card (phones) says what happened there and has one button. For a locked
 * company it goes by plan (Me.crystal, CrystalOpen.tsx): Trial and Pro "Open" (free, and the company
 * is theirs), Free "Open free · 1 left today" (one a UTC day, with everything on it), then the
 * ordinary "Unlock · 2 credits" with the line under the heading and its Pro link; with billing off,
 * Unlock company · 2 credits (the record's own UnlockCompany, so the zero-credit wall and the daily
 * limit work as everywhere). Open for one the member knows. The server checks each free open is in
 * their Crystal Ball. The row or card itself opens the company the way its button does where that is
 * free (useCrystalClick), then the record, and closing it comes back here. A removable pill says what
 * the list is ("From your Crystal Ball · Last 7 days · 9 companies", "… · Nov 19 · 2 companies" for a
 * day's link); taking it off shows all companies. The three ranges are one tap each, with their
 * counts, and stay out of the way when all three count the same companies.
 *
 * [google network] "Where you know someone": the list cut to the companies in the member's own
 * network (the rows that carry the "You know someone · Warm" chip); a chip beside the ranges turns
 * it on and off. With it on and nobody known in the range on screen, the page moves to the next
 * range that has companies (Today, then Last 7 days, then Last 30 days) instead of a blank list;
 * with nobody known in any of them it says so and leads to Your network's warm paths, which are
 * scored live for every company the member knows, not only the ones that moved. Nothing with RN_GOOGLE off.
 *
 * Signals: radar_opened once per tab when the page shows, radar_clicked when a row is opened.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Me } from "@/lib/tableTypes";
import { FUNCTIONS, RN_INDUSTRIES } from "@/lib/tableFields";
import { YOUR_FEATURE, FEATURE_NAME, rangeLabel, yourFeature, type RadarRange, type RadarView } from "@/lib/radar/types";
import { IconChevron, IconX, post } from "../ui/shared";
import { isOpenRole, type CoInfo, type Row } from "./model";
import { useUi } from "./ui";
import { DataTable, type SignalRows } from "./Tables";
import { CardList } from "./Cards";
import { UnlockCompany } from "./Drawer";
import { CrystalOpen, useCrystalClick } from "./CrystalOpen";
import { CRYSTAL_PRO_LINK, rangesWorthShowing } from "./todayModel";
import { COMPANY_PRICE_SAY } from "@/lib/tableFields";
import { LeaderReport } from "./LeaderReport";
import { plural } from "./hooks";
import { ProRow, openPlans, planDay } from "./Billing";
import { radarDelivery } from "./PartnersSwitch";
import { KnowChip } from "./network/Network"; // [google network]
import { useNetwork } from "./network/useNetwork"; // [google network]
import { PathsChip, usePathIds } from "./network/SmartPaths"; // [smart ways in]
import { PassButton } from "./PeerSheets";
import "./radar.css";
import { Bleed, Prop, Spot } from "../ui/fractions/lazy";

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
 * The page's companies from the server, while `active` (the page is open): one day (`day`, an
 * email's or Slack's link) or a range (`range`; null: the one that opens by default). The last
 * answer stays after the page closes, so the record opened from it steps through the same companies.
 */
export function useRadarDay(active: boolean, day: string | null, range: RadarRange | null, again: unknown[]) {
  const [data, setData] = useState<RadarView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const want = useRef(0);
  const load = useCallback(async () => {
    const n = ++want.current;
    try {
      const r = await fetch(`/api/table?radar=1&range=${range ?? "auto"}${day ? `&day=${encodeURIComponent(day)}` : ""}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (n !== want.current) return;
      if (!r.ok || !j) return setFailed(j?.error || `${YOUR_FEATURE} didn't load. Try again.`);
      setFailed(null);
      setData(j as RadarView);
    } catch {
      if (n === want.current) setFailed("We couldn't reach Merlin. Check your connection and try again.");
    }
  }, [day, range]);
  useEffect(() => {
    if (active) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, load, ...again]);
  // The answer for what was asked: that day, that range, or (neither) whichever range opened by default.
  const fits = !!data && (day ? (data.day === day && !data.range) || !!data.expired : range ? data.range === range : !!data.range);
  return { data: fits ? data : null, stale: data, failed, reload: load };
}

/** The member's rows for the day's companies, in the server's order (most likely first). */
export function radarRows(view: RadarView | null, rows: Row[]): Row[] {
  if (!view?.rows.length) return [];
  const by = new Map(rows.map((r) => [r.i.c.id, r]));
  // Trial and Pro: a locked company reads by its name here (RadarRow.name). It stays locked until its Open (free from here, CrystalOpen).
  const named = (r: Row, name?: string): Row => (name && r.i.c.hidden ? { ...r, i: { ...r.i, c: { ...r.i.c, shownName: name } } } : r);
  return view.rows.map((x) => (by.has(x.id) ? named(by.get(x.id)!, x.name) : undefined)).filter((r): r is Row => !!r);
}

/** An open role here has a posted rate behind the lock: the unlock names the rate only then. */
const postedRate = (i: CoInfo) => i.engs.some((e) => isOpenRole(e) && (e.cells.rate?.s === "locked" || e.cells.rate?.s === "value"));

export function RadarPage({
  view,
  failed,
  reload,
  rows: dayRows,
  me,
  phone,
  onBack,
  onProfile,
  onRange,
  openCompany,
  know = false,
  onKnow,
  onWarm,
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
  /** Today, Last 7 days or Last 30 days (the switcher). */
  onRange: (range: RadarRange) => void;
  openCompany: (id: string) => void;
  /** [google network] Only the companies where the member knows someone. */
  know?: boolean;
  onKnow?: (on: boolean) => void;
  /** [google network] Your network's warm paths. */
  onWarm?: () => void;
}) {
  const ui = useUi();
  // [google network] the member's own network: which of the day's companies they know someone at.
  const net = useNetwork().view;
  // [smart ways in] ...and where they have a way in through someone they know (LinkedIn, contacts, messages).
  const pathIds = usePathIds();
  const knownIds = useMemo(() => new Set([...(net?.companies ?? []).map((c) => c.id), ...pathIds]), [net, pathIds]);
  const knownN = useMemo(() => dayRows.filter((r) => knownIds.has(r.i.c.id)).length, [dayRows, knownIds]);
  const knowOn = know && !!net;
  const rows = useMemo(() => (knowOn ? dayRows.filter((r) => knownIds.has(r.i.c.id)) : dayRows), [knowOn, dayRows, knownIds]);
  // [google network] Turned on with nobody known in this range: the next wider range with companies, once each time it is turned on.
  const widened = useRef<string | null>(null);
  useEffect(() => {
    if (!knowOn) {
      widened.current = null;
      return;
    }
    if (!view?.ready || !view.range || knownN > 0 || widened.current === "done") return;
    const order: RadarRange[] = ["today", "7d", "30d"];
    const at = order.indexOf(view.range);
    const next = (view.ranges ?? []).find((r) => order.indexOf(r.range) > at && r.companies > 0);
    if (next && widened.current !== next.range) {
      widened.current = next.range;
      onRange(next.range);
    } else widened.current = "done";
  }, [knowOn, view, knownN, onRange]);
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
  // The row or card itself: free where the plan opens it free (Trial, Pro, Free's one a day), then the record.
  const crystalClick = useCrystalClick();
  const openRow = useCallback((r: Row) => void crystalClick(r.i.c.id, !!r.i.c.hidden, () => open(r.i.c.id)), [open, crystalClick]);
  const fnMine = view?.function ?? me.function ?? null;
  const crystal = me.crystal ?? null;
  // One button a company: a locked one opens from here by plan (CrystalOpen), else Unlock company (the record's own); Open for one the member knows.
  const action = useCallback(
    (i: CoInfo) =>
      i.c.hidden ? (
        crystal ? (
          <span className="rd-acts">
            {/* [smart ways in] "2 ways in through people you know" (nothing without any). */}
            <PathsChip companyId={i.c.id} />
            <CrystalOpen id={i.c.id} name={i.c.shownName} className="rd-open" onOpened={() => open(i.c.id)} noPro />
          </span>
        ) : (
          <span className="rd-acts">
            <PathsChip companyId={i.c.id} />
            <UnlockCompany id={i.c.id} rate={postedRate(i)} roles={i.engs.some(isOpenRole)} />
          </span>
        )
      ) : (
        <span className="rd-acts nw-act">
          {/* [google network] "You know someone · Warm" (nothing with RN_GOOGLE off). */}
          <KnowChip companyId={i.c.id} />
          <PathsChip companyId={i.c.id} />
          <button type="button" className="btn rd-open" onClick={() => open(i.c.id)}>
            Open<span className="sr-only"> {i.c.name}</span>
          </button>
          {/* Crystal Ball got it wrong: they already have a full-time leader in the member's function (a fact, 1 credit). */}
          <LeaderReport companyId={i.c.id} fn={fnMine} leads={i.c.leads} from="radar" />
          {/* Not my fit? Pass it to a peer (PeerSheets.tsx): free for them, a gift. */}
          <PassButton company={i.c.id} role={i.engs.find(isOpenRole)?.id ?? null} from="crystal" className="btn btn-sm rd-pass" />
        </span>
      ),
    [open, fnMine, crystal],
  );
  // Over several days each company says which day its lines are from, beside the first one's band: "High · Yesterday · Fractional CMO hired…".
  const dated = !!view?.range && view.range !== "today";
  const signals = useMemo<SignalRows>(
    () => ({
      lines: new Map((view?.rows ?? []).map((x) => [x.id, x.lines])),
      notes: new Map(
        (view?.rows ?? []).flatMap((x) => {
          if (!dated || !x.day) return x.notes ? [[x.id, x.notes] as const] : [];
          const when = dayLabel(x.day, view!.today);
          const first = x.notes?.[0] ?? "";
          const cut = first.indexOf(" · ");
          const note = !first ? when : cut > 0 ? `${first.slice(0, cut)} · ${when} · ${first.slice(cut + 3)}` : `${when} · ${first}`;
          return [[x.id, [note, ...(x.notes ?? []).slice(1)]] as const];
        }),
      ),
      action,
    }),
    [view, dated, action],
  );

  const fn = view?.function ?? me.function;
  const before = view?.before ?? [];
  const n = rows.length;
  const day = view?.day ?? null;
  const range = view?.range ?? null;
  // Something moved today: the ball glows.
  const glow = n > 0 && (range ? (view?.ranges?.[0]?.companies ?? 0) > 0 : day === view?.today);
  // What the list is, in the pill ("Last 7 days", "Nov 19"), and in a sentence ("in the last 7 days", "on Nov 19").
  const what = range ? rangeLabel(range) : day ? shortDay(day) : "";
  const when = range === "today" || (!range && day === view?.today) ? "today" : range ? `in the ${rangeLabel(range).toLowerCase()}` : day ? `on ${shortDay(day)}` : "";
  return (
    <div className="tp-page rd-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> All companies
      </button>
      {/* The header card: the words first, the ball at its far end on a nested corner. With nothing today, the empty state's picture is the page's one. */}
      <header className="rd-head">
      <Bleed kind="BR" on="white" className="rd-head-bleed" />
      {view?.ready && !n ? null : <Prop name={glow ? "ballGlow" : "ballPlain"} height={glow ? 92 : 64} className="rd-head-ball" />}
      <h1 className="tp-page-h">{YOUR_FEATURE}</h1>
      {/* [ux ws3] One line, then the rest behind "How it ranks". */}
      <p className="rd-lead">
        Companies {view?.anyCompany || !view?.ready ? "" : "in your profile "}most likely to hire a fractional {fn ?? "leader like you"} next.
      </p>
      {view?.ready && (
        <details className="rd-how">
          <summary>How it ranks</summary>
          <Prop name="compass" height={56} className="rd-how-art" />
          <p>
            Each company has something new on Merlin: a new open {fn} role, a {fn} seat that just ended or a {fn} leader who left, a fractional hire in another function, or a first
            sales team. Most likely comes first, each with why now
            {view.beforeFromMember && before.length ? `, and the functions you said come before yours (${before.join(", ")}) count for more` : ""}.{" "}
            {me.crystal === "all" ? "Open any of them right here, free." : me.crystal ? "Open one a day right here, free, with everything on it." : "Unlock any of them right here."}
          </p>
          <p className="rd-legend">
            <span className="rd-band rd-band-high">High</span> <span className="rd-band rd-band-medium">Medium</span> come by email. <span className="rd-band rd-band-low">Low</span> is only here.
          </p>
        </details>
      )}
      </header>
      {view?.anyCompany && (
        <p className="rd-any" role="note">
          <span>Any company for now. Set your profile to narrow it and get it by email.</span>{" "}
          <button type="button" className="rd-link" onClick={onProfile}>
            Set your profile
          </button>
        </p>
      )}

      {view?.ready && day && (
        <div className="rd-bar">
          <span className="chip chip-on rd-pill">
            <span>
              From {yourFeature} · {what} · {plural(n, "company", "companies")}
            </span>
            <button type="button" className="rd-pill-x" onClick={onBack} aria-label="Remove this filter and show all companies" title="Show all companies">
              <IconX size={13} />
            </button>
          </span>
          {/* [google network] the day cut to where they know someone (nothing with RN_GOOGLE off, or when they know nobody in it). */}
          {/* With nobody known in this range it still shows over a range: turned on, it moves to the range that has them. */}
          {net && onKnow && (knowOn || knownN > 0 || (!!view.range && net.companies.some((c) => !c.set))) && (
            <button type="button" className={`chip rd-day rd-know${knowOn ? " chip-on" : ""}`} aria-pressed={knowOn} onClick={() => onKnow(!knowOn)}>
              Where you know someone
              <span className="num rd-day-n" aria-label={`, ${plural(knownN, "company", "companies")}`}>
                {knownN}
              </span>
            </button>
          )}
          {/* Today, Last 7 days, Last 30 days, each with its companies. A day's link (?sig=) shows that day in the pill, with none of them on. */}
          {rangesWorthShowing(view.ranges) && (
          <div className="rd-days rd-ranges" role="group" aria-label="Pick a range">
            {(view.ranges ?? []).map((r) => (
              <button key={r.range} type="button" className={`chip rd-day${r.range === range ? " chip-on" : ""}`} aria-pressed={r.range === range} onClick={() => onRange(r.range)}>
                {rangeLabel(r.range)}
                <span className="num rd-day-n" aria-label={`, ${plural(r.companies, "company", "companies")}`}>
                  {r.companies}
                </span>
              </button>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Free, after today's free company: the rest unlock as anywhere (2 credits each), or Pro opens them free. */}
      {view?.ready && me.crystal === "used" && (
        <p className="rd-note rd-used" role="status">
          Your free {FEATURE_NAME} company for today is used. The rest unlock for {COMPANY_PRICE_SAY} each.{" "}
          <button type="button" className="rd-link" onClick={() => openPlans("crystal")}>
            {CRYSTAL_PRO_LINK}
          </button>
        </p>
      )}

      {view?.expired && (
        <p className="rd-note rd-expired" role="status">
          That day is older than we keep. Here is what moved {when || "lately"} instead.
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
        <StartRadar reload={reload} />
      ) : !n && knowOn ? (
        <section className="tp-card rd-empty">
          <p className="rd-note">
            Nobody you know is at a company in {yourFeature} {when}. {yourFeature} lists companies where something just moved; your warm paths on Your network are every company you
            know that fits your profile or is likely to hire you.
          </p>
          <div className="rd-know-acts">
            {onWarm && (
              <button type="button" className="btn btn-primary" onClick={onWarm}>
                See your warm paths
              </button>
            )}
            {dayRows.length > 0 && (
              <button type="button" className="btn" onClick={() => onKnow?.(false)}>
                Show all {dayRows.length} here
              </button>
            )}
          </div>
        </section>
      ) : !n ? (
        <section className="tp-card rd-empty rd-empty-pic">
          <Spot name="ballEmpty" size={104} />
          <p className="rd-note">
            Nothing moved at companies in your profile {when}. We never send a day with nothing in it.
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
            By email and Slack
          </h2>
          <p className="rd-note">
            {view.anyCompany
              ? `Set your profile to get ${yourFeature} by email each morning. Until then it is here.`
              : !view.email && !view.slack
                ? `Connect Slack under Integrations to get ${yourFeature} every morning. Until then it is here.`
                : !view.on
                  ? `${YOUR_FEATURE} is off by email and in Slack. This page still lists what moved.`
                  : `${view.email ? radarDelivery(me, view.slack) : me.radarSlack !== false ? `${YOUR_FEATURE} comes in Slack, on mornings when something moved.` : `${YOUR_FEATURE} is off in Slack.`} This page lists what moved either way.`}
          </p>
          {/* How often it comes, and Slack apart from the email: Notifications (one place for every email and post). */}
          <button type="button" className="btn btn-sm rd-switch" onClick={() => ui.openPage("notifications")}>
            Change in Notifications
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

/** [ux ws3] The functions to pick from (not Other), and the industries most members pick first. */
const START_FNS = FUNCTIONS.filter((f) => f !== "Other");
const START_INDUSTRIES = RN_INDUSTRIES.slice(0, 9);

/**
 * [ux ws3] No function yet: the two questions inline, so Crystal Ball starts here. Your function
 * (one), and the industries you want (any, optional: none is any company), then "Show my Crystal Ball".
 */
function StartRadar({ reload }: { reload: () => void }) {
  const ui = useUi();
  const [fn, setFn] = useState<string | null>(null);
  const [ind, setInd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!fn) return;
    setBusy(true);
    const r = await ui.act({ type: "profile", function: fn, ...(ind.length ? { icp: { industries: ind, employees: [], revenue: [], countries: [] } } : {}) }, { quiet: true });
    setBusy(false);
    if (r.ok) reload();
  };
  return (
    <section className="tp-card rd-empty rd-start" aria-labelledby="rd-start-h">
      <h2 className="tp-card-h" id="rd-start-h">
        Start {yourFeature}
      </h2>
      <div className="rd-start-q">
        <span className="tp-flabel" id="rd-start-fn">
          What do you do?
        </span>
        <div className="tp-fchips" role="radiogroup" aria-labelledby="rd-start-fn">
          {START_FNS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={fn === f} className={`chip tp-fchip${fn === f ? " chip-on" : ""}`} onClick={() => setFn(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="rd-start-q">
        <span className="tp-flabel" id="rd-start-ind">
          Who you want to work with <span className="muted">· optional</span>
        </span>
        <div className="tp-fchips" role="group" aria-labelledby="rd-start-ind">
          {START_INDUSTRIES.map((x) => {
            const on = ind.includes(x);
            return (
              <button key={x} type="button" aria-pressed={on} className={`chip tp-fchip${on ? " chip-on" : ""}`} onClick={() => setInd(on ? ind.filter((y) => y !== x) : [...ind, x])}>
                {x}
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" className="btn btn-primary rd-btn" disabled={!fn || busy} aria-busy={busy} onClick={() => void go()}>
        {busy ? "Starting" : "Show my Crystal Ball"}
      </button>
    </section>
  );
}
