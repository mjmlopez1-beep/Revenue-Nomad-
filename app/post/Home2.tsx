"use client";

/**
 * Home in the new look (Home.dc.html, both states), behind RN_UI2. It keeps everything today's Home
 * shows (Home.tsx; BUILD_PLAN part 2), in the mockup's order:
 *
 *   in use        greeting and the day's line, the one-time trial and Pro cards, "Since your last
 *                 visit" chips, Ask Merlin with suggestions, Today (countersign due, follow-ups,
 *                 proposals out, your route's move, the three moves, one list with Done, Snooze and
 *                 Undo where each source has them), From your peers, the Fractionals line and the
 *                 directory question, Quick starts, "Your market, from found to won" from real
 *                 counts, and Your lists (All, Recent, Favorites; Holds, Rows, New, Filled in, the
 *                 alert switch, Opened, "Made for you").
 *   first visit   "What Home is for" (dismissible), Getting started's six steps, Ask Merlin with
 *                 starter questions, "Already here for you", the funnel as it starts, the starter
 *                 lists made from the ideal client (turning one's alert on saves it: step 5).
 *
 * Its props are Home's own (HomeProps, the same TradingPost gives HomePage) plus Getting started's
 * six steps (getStarted.ts sixSteps) and their buttons, `first` (firstVisit.ts), the strip's
 * dismissal (Profile.stripsOff), the header's actions, Ask's hand-off and Find. The page registry
 * (shell/pages.tsx Home2P) mounts it.
 *
 * Known gap: Today shows its sources one after another, most urgent first (each keeps its own
 * actions and sheets), not interleaved row by row by due time: that needs the sources' data lifted
 * out of their components.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Me, SavedViewRec } from "@/lib/tableTypes";
import { FEATURE_NAME, YOUR_FEATURE } from "@/lib/radar/types";
import type { MovesWire } from "@/lib/moves";
import type { AskPlan, AskVocab } from "@/lib/ask";
import { timeAgo } from "../ui/shared";
import { icpEmpty, icpMatch, type CoInfo, type RecordType } from "./model";
import { FractionalsJoined, GoLink, ShowMeAsk, TrialStarted, useAfterFirstPaint, type Go, type HomeProps } from "./Home";
import { LeadCard, TrialEnded } from "./Today";
import { MovesSection } from "./Moves";
import { FollowUps } from "./FollowUps";
import { CloseOnHome } from "./Activity";
import { CountersignDue } from "./MySignature";
import { FromYourPeers } from "./HomePeers";
import { RouteMove } from "./network/Ways";
import { KnownMoves } from "./network/KnownMoves";
import { ProWelcome, TrialSummaryCard } from "./Billing";
import { Scene } from "../ui/fractions/lazy";
import { crystalLine, sinceWords, showMeDue } from "./todayModel";
import { plural } from "./hooks";
import { useUi } from "./ui";
import { usePipeline } from "./pipelineStore";
import { useGetIn } from "./network/useWays";
import { placeRows, savedViewPlace } from "./place";
import { AskBar } from "./AskBar";
import { fillRate } from "./find/findModel";
import { alertWords, icpChips, kindLabel, kindOfList, listAct, listsOf, readFavs, starterLists, writeFavs, type SavedListRec, type StarterList } from "./find/lists";
import { sixLine, type SixKey, type SixSteps as SixStepsT } from "./getStarted";
import { planLine } from "./firstVisit";
import "./home2.css";

/* ---------- Home ---------- */

export interface Home2Props extends HomeProps {
  /** Getting started (getStarted.ts sixSteps), or null while it is hidden. */
  six: SixStepsT | null;
  /** A step's button. */
  runSix: (k: SixKey) => void;
  /** First visit: none of the member's own data yet (firstVisit.ts). */
  first: boolean;
  /** "What Home is for" is still showing (not dismissed: Profile.stripsOff), and dismissing it. */
  stripOn: boolean;
  onStripOff: () => void;
  /** The header's right side (the bell, the credits pill, Add what you know): Home draws its own header. */
  actions?: ReactNode;
  /** Ask Merlin's plan, for the page it lands on (Find, Hiring now, Rate benchmarks...). */
  onAsk: (plan: AskPlan, text: string) => void;
  /** Find, and the pages the quick starts open. */
  openFind: () => void;
  /** Find on Lookalikes: companies like the member's past clients. */
  openLookalikes: () => void;
  openPage: (p: "rates" | "fractionals" | "pipeline" | "proposals" | "network" | "getin" | "integrations" | "messages") => void;
  /** Open a list in the table (a saved view, or a starter that isn't saved yet). */
  openList: (v: SavedViewRec) => void;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
const TINTS = ["#E3E8F7", "#E8F3EE", "#FFE7A8", "#F3E8F5", "#DDF0F7", "#FBE3D6"];

export function Home2(p: Home2Props) {
  const ui = useUi();
  const rest = useAfterFirstPaint();
  const { data, byId, me, first } = p;
  const hello = useMemo(() => ((h) => (h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"))(new Date().getHours()), []);
  const about = p.stripOn;
  // Today's moves as the server picked them, then as it answered Done, Snooze or Undo (as Home.tsx).
  const [after, setAfter] = useState<MovesWire | null>(null);
  const wire = useMemo<MovesWire | null>(() => after ?? data?.moves ?? (data ? { list: data.rows.slice(0, 3).map((row) => ({ id: row.id, row })), month: 0, google: "off" } : null), [after, data]);
  const moveN = useMemo(() => (wire?.list ?? []).filter((w) => byId.has(w.id)).length, [wire, byId]);
  const loading = (!data && !p.failed) || (p.waiting && !!wire?.list.length && !moveN);
  const lead = !loading && !moveN && p.firstRow ? { i: byId.get(p.firstRow.i.c.id) ?? p.firstRow.i, row: null } : null;
  const dayN = data?.newCount ?? 0;
  const crystalN = dayN === 0 ? data?.total ?? 0 : 0;
  const since = data?.since ?? null;
  const pipe = usePipeline(true).view;
  const dueN = pipe?.due.length ?? 0;
  const openDeals = pipe ? pipe.counts.reach + pipe.counts.sent + pipe.counts.replied + pipe.counts.meeting + pipe.counts.proposal : null;
  const todoN = moveN + dueN;
  const vocab: AskVocab = useMemo(() => ({ myFn: me.function ?? null, hasIcp: !icpEmpty(me.icp) }), [me.function, me.icp]);

  const daySub = first
    ? me.proOpens
      ? `${planLine(me.plan)}Any company opens free, up to ${me.proOpens.of} a day.`
      : "Merlin's own data is all here. The six steps below are your list for today."
    : todoN
      ? `${["", "One move", "Two moves", "Three moves", "Four moves", "Five moves"][Math.min(todoN, 5)] || `${todoN} moves`} for today. About ${Math.max(2, todoN * 2)} minutes.`
      : loading
        ? "Finding your moves for today."
        : crystalN > 0
          ? crystalLine(crystalN)
          : "Today is done. Your lists and your Crystal Ball are below.";

  const sinceLabel = p.sinceAt ? sinceWords(p.sinceAt) : "This week";
  const chips = [
    { k: "radar", n: since?.radar ?? 0, t: `new in ${FEATURE_NAME}`, to: p.radar },
    { k: "roles", n: since?.roles ?? 0, t: `${me.function ?? ""} ${(since?.roles ?? 0) === 1 ? "role" : "roles"} opened`.trim(), to: p.roles },
    { k: "follows", n: since?.follows ?? 0, t: (since?.follows ?? 0) === 1 ? "company you follow changed" : "companies you follow changed", to: p.follows },
    { k: "unread", n: p.unread, t: p.unread === 1 ? "unread message" : "unread messages", to: p.messages },
  ].filter((c) => c.n > 0 && (c.k === "unread" || p.sinceAt));
  const missing = ui.seats.missing;

  const hideAbout = p.onStripOff;

  return (
    <div className="h2">
      {p.nudge ? <div className="hm-nudge">{p.nudge}</div> : null}
      <div className="h2-head">
        <h1 className="h2-h1">
          {first ? "Welcome" : hello}, {firstName(me.name)}
        </h1>
        <span className="h2-day">{daySub}</span>
        {p.actions && <div className="h2-acts">{p.actions}</div>}
      </div>

      {first && about && (
        <section aria-label="About this page" className="h2-about">
          <span>
            <strong>What Home is for.</strong> Your day starts here. Ask Merlin for anything, work through what is due, and open your lists. Until you have deals of your own, the steps below are your list for today.
          </span>
          <button type="button" aria-label="Dismiss" className="h2-x" onClick={hideAbout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </section>
      )}

      <TrialSummaryCard plan={me.plan} />
      {p.trialStarted && me.plan?.name === "trial" ? <TrialStarted days={me.plan.trialDaysLeft} opens={me.proOpens} crystal={dayN} radar={p.radar} onSeen={p.onTrialStartSeen} /> : null}
      {p.trialEnded ? <TrialEnded onSeePro={p.onSeePro} onSeen={p.onTrialSeen} art={<Scene kind="trialEnding" square pro on="mint" className="td-trial-art" />} /> : null}
      {p.proWelcome && me.plan ? <ProWelcome plan={me.plan} onSeen={p.onProSeen} /> : null}

      {!first && (chips.length > 0 || missing > 0) && (
        <nav aria-label="Since your last visit" className="h2-since">
          <span className="h2-since-l">{sinceLabel}</span>
          {chips.map((c) => (
            <GoLink key={c.k} to={c.to} className="h2-since-c">
              <strong>{c.n}</strong> {c.t}
            </GoLink>
          ))}
          {missing > 0 && (
            <button type="button" className="h2-since-earn" onClick={() => ui.openSeats()}>
              Your seats are missing {plural(missing, "fact")}. Earn up to {plural(Math.min(missing, me.earnCap), "credit")}
            </button>
          )}
        </nav>
      )}

      {p.six && (first || p.six.next) && <SixSteps six={p.six} me={me} run={p.runSix} big={first} onHide={first ? undefined : p.onHideSteps} />}

      <section aria-label="Ask Merlin" className="h2-card h2-ask">
        <AskBar
          label="Ask Merlin, search, or say what you want to do"
          placeholder={first ? `Show me software companies that just lost a fractional ${(me.function ?? "sales").toLowerCase()} leader` : `Find SaaS companies that just lost a fractional ${(me.function ?? "sales").toLowerCase()} leader, and show me who I know there`}
          vocab={vocab}
          onGo={p.onAsk}
          suggestions={askSuggestions(me, first)}
        />
        <button type="button" className="h2-likebtn" onClick={p.openLookalikes}>
          Find more like my past clients
        </button>
      </section>

      {!first && (
        <section aria-labelledby="h2-today" className="h2-card h2-today">
          <div className="h2-sec-head">
            <h2 id="h2-today" className="h2-h2">
              Today
            </h2>
            <span className="h2-sub">{todoN ? `${plural(todoN, "thing")} to do · most urgent first` : loading ? "Finding your moves" : "Nothing due"}</span>
            <span className="h2-sp" />
            <button type="button" className="h2-link" onClick={() => p.openPage("pipeline")}>
              Pipeline{openDeals !== null ? ` · ${plural(openDeals, "deal")}` : ""}
            </button>
            <GoLink to={p.radar} className="h2-link">
              {YOUR_FEATURE}
              {dayN ? ` · ${dayN}` : ""}
            </GoLink>
          </div>
          <div className="h2-today-in">
            {rest && (me.plan?.canClose ?? true) && <CountersignDue />}
            {rest && <FollowUps me={me} byId={byId} openCompany={p.openCompany} />}
            {rest && <CloseOnHome />}
            {rest && <RouteMove />}
            {/* Someone you know changed jobs: from the member's own LinkedIn file and contacts CSV (never Google). */}
            {rest && <KnownMoves where="home" openCompany={p.openCompany} />}
            <MovesSection
              me={me}
              byId={byId}
              wire={wire}
              onWire={setAfter}
              loading={loading}
              rest={rest}
              dayN={dayN}
              crystalN={crystalN}
              integrations={p.integrations}
              onClaude={p.onClaude}
              openCompany={p.openCompany}
              link={(children) => (
                <GoLink to={p.radar} className="hm-more">
                  {children}
                </GoLink>
              )}
              fallback={
                lead ? (
                  <LeadCard key={lead.i.c.id} i={lead.i} row={lead.row} me={me} onOpen={() => p.openCompany(lead.i.c.id)} title="Top of your table" />
                ) : (
                  <p className="mv-none mv-none-more">Browse every company, or widen who you want to work with in Your profile.</p>
                )
              }
            />
          </div>
        </section>
      )}

      {!first && rest && <FromYourPeers openCompany={p.openCompany} />}
      {!first && rest && <FractionalsJoined />}
      {rest && showMeDue(me, p.sinceAt) && <ShowMeAsk />}

      {rest && <QuickStarts {...p} />}
      {rest && <Funnel me={me} infos={p.infos} waiting={p.waiting} first={first} openPage={p.openPage} table={p.table} openFind={p.openFind} />}
      {rest && <Lists {...p} />}
      {rest && p.events}
    </div>
  );
}

function askSuggestions(me: Me, first: boolean): { t: string }[] {
  const fn = (me.function && me.function !== "Other" ? me.function : "sales").toLowerCase();
  return first
    ? [{ t: "Show me companies that fit my ideal client" }, { t: `Who is hiring a fractional ${fn} leader right now?` }, { t: "What should I charge a $20M SaaS company?" }, { t: "How do credits work?" }]
    : [{ t: `Companies where a fractional ${fn} leader just left` }, { t: "Repeat hirers I already have a way into" }, { t: "Draft a proposal from today's call" }, { t: "What should I charge a $20M SaaS company?" }];
}

/* ---------- Getting started ---------- */

function SixSteps({ six, me, run, big, onHide }: { six: SixStepsT; me: Me; run: (k: SixKey) => void; big: boolean; onHide?: () => void }) {
  const { steps } = six;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section aria-labelledby="h2-gs" className={`h2-card h2-gs${big ? " big" : ""}`}>
      <div className="h2-gs-head">
        <h2 id="h2-gs" className="h2-h2">
          Getting started
        </h2>
        <span className="h2-sub">
          {sixLine(six)}
          {six.minutes ? ` · about ${six.minutes} minutes left` : ""}
        </span>
        <span className="h2-gs-bar" aria-hidden>
          {steps.map((s) => (
            <span key={s.key} className={s.done ? "on" : ""} />
          ))}
        </span>
        {onHide && (
          <button type="button" className="h2-link" onClick={onHide}>
            Hide
          </button>
        )}
        <span className="h2-gs-line">Each step says what you give, what you get and how long it takes. Do them in any order. Nothing here spends a credit.</span>
      </div>
      <ol className="h2-gs-list">
        {steps.map((s, k) => {
          // The ideal client, once given, reads back as what the member said.
          const said = s.key === "icp" && s.done ? icpChips(me).map((c) => c.replace(/^[^:]+: /, "")).join(" · ") : "";
          return (
            <li key={s.key} className={`h2-gs-row${k === next ? " next" : ""}`}>
              <span className={`h2-gs-dot${s.done ? " done" : k === next ? " next" : ""}`} aria-hidden>
                {s.done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  s.n
                )}
              </span>
              <span className="h2-gs-t">
                <span className="h2-gs-title">
                  <strong>{s.label}</strong>
                  {s.done && <span className="h2-sr"> (done)</span>}
                  {s.pill && !s.done && <span className={`h2-pill${s.pillKind === "earn" ? " volt" : " mint"}`}>{s.pill}</span>}
                </span>
                <span className="h2-gs-takes">
                  <strong>{said ? "You said:" : "Takes:"}</strong> {said || s.takes}
                </span>
              </span>
              <span className="h2-gs-earns">
                <strong>Earns:</strong> {s.gives}
              </span>
              <span className="h2-gs-time">{s.done ? "Done" : s.time}</span>
              <span className="h2-gs-go">
                <button type="button" className={k === next ? "h2-volt" : s.done ? "h2-quiet" : "h2-outline"} onClick={() => run(s.key)}>
                  {s.go}
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------- quick starts ---------- */

function QuickStarts(p: Home2Props) {
  const { me, first, infos } = p;
  const fit = useMemo(() => (p.waiting || icpEmpty(me.icp) ? null : infos.filter((i) => icpMatch(me.icp, i.c) === "match").length), [p.waiting, me.icp, infos]);
  const total = p.waiting ? null : infos.length;
  const dayN = p.data?.newCount ?? 0;
  const fn = me.function && me.function !== "Other" ? me.function : null;
  const cards: { t: string; d: string; f: string; to: Go }[] = [
    { t: "Find companies", d: `Filter ${total !== null ? total.toLocaleString("en-US") : "every"} companies that hire fractionals, or describe who you want.`, f: fit !== null ? `${fit.toLocaleString("en-US")} fit your ideal client` : "Set your ideal client first", to: { go: p.openFind } },
    { t: YOUR_FEATURE, d: `Companies likely to hire a fractional ${fn ? `${fn} leader` : "leader"} next.${me.proOpens ? " These open free on your plan." : ""}`, f: dayN ? `${plural(dayN, "company", "companies")} today` : "Open it", to: p.radar },
    first
      ? { t: "Hiring now", d: "Open fractional roles, newest first, with the posted rate when there is one.", f: "Free to look", to: p.roles }
      : { t: "Bring in who you know", d: "Google, your LinkedIn connections file or a CSV. It turns into ways in.", f: "Warm paths", to: { go: () => p.openPage("getin") } },
    first
      ? { t: "Rate benchmarks", d: `What fractional ${fn ? `${fn} leaders` : "leaders"} charge, by company size and industry.`, f: "Free to look", to: { go: () => p.openPage("rates") } }
      : { t: "Start a proposal", d: "From a call, a transcript or one of your templates.", f: me.plan?.canClose === false ? "On Close" : "Proposals", to: { go: () => p.openPage("proposals") } },
    { t: "Fractionals", d: "Fellow fractionals, their seats and the clients they serve.", f: "Free on every plan", to: { go: () => p.openPage("fractionals") } },
  ];
  return (
    <section aria-labelledby="h2-starts" className="h2-starts">
      <div className="h2-sec-head bare">
        <h2 id="h2-starts" className="h2-h2">
          {first ? "Already here for you" : "Quick starts"}
        </h2>
        <span className="h2-sub">{first ? "Merlin's own data. Free to look around before you add anything." : "The five things members do most from Home"}</span>
      </div>
      <div className="h2-starts-grid">
        {cards.map((c) => (
          <GoLink key={c.t} to={c.to} className="h2-start">
            <strong>{c.t}</strong>
            <span>{c.d}</span>
            <em>{c.f}</em>
          </GoLink>
        ))}
        <button type="button" className="h2-start" onClick={() => p.onAdd()}>
          <strong>Add what you know</strong>
          <span>Earn a credit for each fact Merlin does not have, up to {me.earnCap} a day.</span>
          <em className="earn">Earns credits</em>
        </button>
      </div>
    </section>
  );
}

/* ---------- found to won ---------- */

function Funnel({ me, infos, waiting, first, openPage, table, openFind }: { me: Me; infos: CoInfo[]; waiting: boolean; first: boolean; openPage: Home2Props["openPage"]; table: Go; openFind: () => void }) {
  const pipe = usePipeline(true).view;
  const getIn = useGetIn();
  const c = useMemo(() => {
    if (waiting) return null;
    const hasIcp = !icpEmpty(me.icp);
    const market = hasIcp ? infos.filter((i) => icpMatch(me.icp, i.c) !== "no") : infos;
    const isOpen = (i: CoInfo) => !i.c.hidden && (i.unlockedByMe || !!i.c.unlocked);
    const opened = market.filter(isOpen).length;
    return { hasIcp, market: market.length, opened, locked: market.length - opened };
  }, [waiting, infos, me.icp]);
  const way = getIn.data ? getIn.data.rows.filter((r) => r.best !== null).length : null;
  const inPipe = pipe ? pipe.counts.reach + pipe.counts.sent + pipe.counts.replied + pipe.counts.meeting + pipe.counts.proposal : null;
  const won = pipe?.counts.won ?? null;
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")} a month`;
  const n = (x: number | null) => (x === null ? "…" : x.toLocaleString("en-US"));
  const boxes = [
    { k: "In your market", n: c ? n(c.market) : "…", s: !c ? "" : c.hasIcp ? (first ? "Companies that fit the ideal client you gave. Already filled." : "fit your ideal client") : "Every company. Say who your ideal client is to narrow it.", tone: 0, go: openFind },
    { k: "Opened", n: c ? n(c.opened) : "…", s: !c ? "" : first || !c.opened ? `Open a company.${me.proOpens ? ` Free on your plan, up to ${me.proOpens.of} a day.` : ""}` : `${n(c.locked)} still locked`, tone: 1, go: table.go },
    { k: "With a way in", n: getIn.off ? "0" : n(way), s: getIn.off || !way ? "Add a seat you held, or bring in who you know." : "from who you know and who held seats", tone: 2, go: () => openPage("getin") },
    // What the open deals are worth only as the member typed it on Pipeline (PipelineEntry.value): none typed, the count alone.
    { k: "In your pipeline", n: n(inPipe), s: inPipe ? (pipe?.openMonthly ? `${money(pipe.openMonthly)}${pipe.valued < inPipe ? `, ${pipe.valued} of ${inPipe} with a value` : ""}` : "open deals") : "Add a company to your pipeline from its row.", tone: 3, go: () => openPage("pipeline") },
    { k: "Won", n: n(won), s: won ? (pipe?.wonMonthly ? money(pipe.wonMonthly) : "Add the terms to see their value") : "Merlin marks a deal won when the client signs.", tone: 4, go: () => openPage("pipeline") },
  ];
  return (
    <section aria-labelledby="h2-cov" className="h2-card h2-funnel">
      <div className="h2-sec-head bare">
        <h2 id="h2-cov" className="h2-h2">
          Your market, from found to won
        </h2>
        <span className="h2-sub">{first ? "Starts today. One line on what fills each box." : "Counts as of now"}</span>
      </div>
      <div className="h2-funnel-grid">
        {boxes.map((b) => (
          <button key={b.k} type="button" className={`h2-fbox t${b.tone}`} onClick={b.go}>
            <span className="h2-fbox-k">{b.k}</span>
            <strong>{b.n}</strong>
            <span className="h2-fbox-s">{b.s}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- your lists ---------- */

interface ListRow {
  id: string;
  name: string;
  kind: string;
  rows: number | null;
  fresh: number | null;
  fill: number | null;
  opened: string | null;
  recent: boolean;
  starter: boolean;
  saved: SavedListRec | null;
  starterOf: StarterList | null;
  view: SavedViewRec;
}

const TYPE_OF: Record<string, RecordType> = { companies: "companies", people: "people", seats: "engagements", roles: "engagements", fractionals: "companies" };

function Lists(p: Home2Props) {
  const ui = useUi();
  const { me, first } = p;
  const [tab, setTab] = useState<"all" | "recent" | "fav">("all");
  const [favs, setFavs] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setFavs(readFavs()), []);
  const saved = listsOf(me);
  const starters = useMemo(() => starterLists(me, p.waiting ? null : p.infos), [me, p.waiting, p.infos]);
  const counts = useMemo(() => new Map(p.views.map((v) => [v.v.id, v])), [p.views]);
  const fills = useMemo(() => {
    const m = new Map<string, number | null>();
    if (p.waiting) return m;
    const off = new Set<string>();
    const all = [...saved.map((v) => ({ id: v.id, v: v as SavedViewRec, kind: kindOfList(v) })), ...starters.map((s) => ({ id: s.asView.id, v: s.asView, kind: s.kind }))];
    for (const x of all.slice(0, 24)) {
      const place = savedViewPlace(me, x.v, off);
      const rows = placeRows(p.infos, me, place, off);
      m.set(x.id, fillRate(rows, TYPE_OF[x.kind] ?? "companies"));
      if (x.id.startsWith("starter:")) m.set(`${x.id}#n`, rows.length);
    }
    return m;
  }, [p.waiting, p.infos, me, saved.length, starters.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const recentCut = Date.now() - 7 * 86_400_000;
  const rows: ListRow[] = [
    ...saved.map((v): ListRow => {
      const h = counts.get(v.id);
      const opened = v.openedAt ?? h?.opened ?? null;
      return {
        id: v.id,
        name: v.name,
        kind: kindLabel(kindOfList(v)),
        rows: h?.matches ?? null,
        fresh: h?.fresh ?? null,
        fill: fills.get(v.id) ?? null,
        opened,
        recent: !!opened && Date.parse(opened) >= recentCut,
        starter: v.starter,
        saved: v,
        starterOf: null,
        view: v,
      };
    }),
    ...starters.map((s): ListRow => {
      const n = (fills.get(`${s.asView.id}#n`) as number | undefined) ?? null;
      return { id: s.asView.id, name: s.name, kind: kindLabel(s.kind), rows: n, fresh: n, fill: fills.get(s.asView.id) ?? null, opened: null, recent: false, starter: true, saved: null, starterOf: s, view: s.asView };
    }),
  ];
  const shown = rows.filter((r) => (tab === "all" ? true : tab === "recent" ? r.recent : favs.includes(r.id)));
  const nOn = saved.filter((v) => v.alert.on).length;
  const flipFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    writeFavs(next);
  };
  const open = (r: ListRow) => {
    if (r.saved) void ui.act(listAct({ op: "opened", id: r.saved.id }), { quiet: true, silentError: true });
    p.openList(r.view);
  };
  /** The alert switch: on a saved list, its alert; on a starter, saving it with its alert on (Getting started step 5). */
  const flipAlert = async (r: ListRow) => {
    if (busy) return;
    setBusy(r.id);
    if (r.saved) await ui.act(listAct({ op: "alert", id: r.saved.id, list: { alert: { on: !r.saved.alert.on } } }));
    else if (r.starterOf) {
      const s = r.starterOf;
      await ui.act(listAct({ op: "save", name: s.name, place: s.place, criteria: s.criteria, email: true, list: { kind: s.kind, starter: true, alert: { on: true, email: true, slack: true } } }));
    }
    setBusy(null);
  };
  const tabs: [typeof tab, string, number][] = [
    ["all", "All", rows.length],
    ["recent", "Recent", rows.filter((r) => r.recent).length],
    ["fav", "Favorites", rows.filter((r) => favs.includes(r.id)).length],
  ];
  const chips = first ? icpChips(me) : [];
  return (
    <section aria-labelledby="h2-lists" className="h2-card h2-lists">
      <div className="h2-lists-top">
        <h2 id="h2-lists" className="h2-h2">
          {first ? "Starter lists" : "Your lists"}
        </h2>
        <div role="tablist" aria-label="Which lists" className="h2-tabs">
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`h2-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
              {label}
              <span>{n}</span>
            </button>
          ))}
        </div>
        <span className="h2-sp" />
        <button type="button" className="h2-outline h2-sm" onClick={p.openFind}>
          New list
        </button>
      </div>
      {first && chips.length > 0 && starters.length > 0 && (
        <div className="h2-made">
          <span>Merlin made these from the ideal client you gave when you signed up:</span>
          {chips.map((c) => (
            <span key={c} className="h2-made-c">
              {c}
            </span>
          ))}
          <span>Rename, change or remove any of them once saved.</span>
        </div>
      )}
      <div className="h2-tablewrap">
        <div role="table" aria-label={first ? "Starter lists" : "Your lists"} className="h2-ltable">
          <div role="row" className="h2-lrow h2-lhead">
            <span role="columnheader" aria-label="Favorite" />
            <span role="columnheader">Name</span>
            <span role="columnheader">Holds</span>
            <span role="columnheader">Rows</span>
            <span role="columnheader">New</span>
            <span role="columnheader">Filled in</span>
            <span role="columnheader">Alert</span>
            <span role="columnheader">Opened</span>
          </div>
          {shown.map((r) => {
            const fav = favs.includes(r.id);
            const alert = r.saved?.alert ?? null;
            return (
              <div key={r.id} role="row" className="h2-lrow">
                <span role="cell">
                  <button type="button" className="h2-star" aria-pressed={fav} aria-label={`${fav ? "Remove from favorites" : "Add to favorites"}: ${r.name}`} onClick={() => flipFav(r.id)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={fav ? "#073F2F" : "none"} stroke={fav ? "#073F2F" : "#5B6661"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
                    </svg>
                  </button>
                </span>
                <span role="cell" className="h2-lname">
                  <button type="button" className="h2-lopen" onClick={() => open(r)}>
                    {r.name}
                  </button>
                  {r.starter && <span className="h2-pill mint">Made for you</span>}
                </span>
                <span role="cell">{r.kind}</span>
                <span role="cell" className="num">
                  {r.rows === null ? <span className="td-skel h2-skel" aria-label="Counting" /> : r.rows.toLocaleString("en-US")}
                </span>
                <span role="cell">{r.fresh === null ? (p.waiting ? <span className="td-skel h2-skel" aria-label="Counting" /> : <span className="h2-muted">0</span>) : r.fresh > 0 ? <span className="h2-pill volt">{r.fresh} new</span> : <span className="h2-muted">0</span>}</span>
                <span role="cell" className="h2-fill">
                  {r.fill === null ? (
                    <span className="h2-muted">{p.waiting ? "" : "No rows"}</span>
                  ) : (
                    <>
                      <span className="h2-fill-bar" aria-hidden>
                        <span style={{ width: `${r.fill}%` }} />
                      </span>
                      <span className="h2-muted">{r.fill}%</span>
                    </>
                  )}
                </span>
                <span role="cell">
                  {alert ? (
                    <button type="button" role="switch" aria-checked={alert.on} aria-label={`Alert for ${r.name}`} className={`h2-switch${alert.on ? " on" : ""}`} disabled={busy === r.id} onClick={() => void flipAlert(r)}>
                      <span className="h2-track" aria-hidden>
                        <span />
                      </span>
                      {alertWords(alert)}
                    </button>
                  ) : (
                    <button type="button" className="h2-inl" disabled={busy === r.id} onClick={() => void flipAlert(r)}>
                      Off. Turn one on
                    </button>
                  )}
                </span>
                <span role="cell" className="h2-muted">
                  {r.opened ? timeAgo(r.opened) : "Not yet"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {!shown.length && (
        <div className="h2-lempty">
          <span>{tab === "fav" ? "No favorites yet. Use the star beside a list to keep it here." : tab === "recent" ? "No list opened in the last 7 days." : first ? "Say who your ideal client is and Merlin makes three lists for you." : "No lists yet. Build one in Find."}</span>
          {tab !== "all" ? (
            <button type="button" className="h2-outline h2-sm" onClick={() => setTab("all")}>
              Show all lists
            </button>
          ) : (
            <button type="button" className="h2-outline h2-sm" onClick={p.openFind}>
              Open Find
            </button>
          )}
        </div>
      )}
      <div className="h2-lfoot">
        <span>
          {first && !nOn
            ? `${plural(starters.length, "list")} made for you · no alert on yet · turning one on is step 5`
            : `${shown.length} of ${rows.length} lists · ${plural(nOn, "alert")} on · Recent means opened in the last 7 days`}
        </span>
        <button type="button" className="h2-inl" onClick={() => p.openPage("integrations")}>
          Where alerts go: email and Slack
        </button>
      </div>
    </section>
  );
}

