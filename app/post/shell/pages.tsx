"use client";

/**
 * The page registry: every page the app draws in place of the table, by its key, and the one
 * context they all read (AppCtx). TradingPost.tsx owns the place (the address, the record, the
 * overlays) and the table; it builds an AppCtx and draws `PAGES[page]`. A new page is a new file
 * and one entry here, so nobody needs to edit TradingPost to add one.
 *
 *   PAGES          key to PageDef: its component, its title (the header and the tab title), where
 *                  it sits in the header's breadcrumb, and how its <main> is styled
 *   AppCtx         what TradingPost hands every page (see the interface for each field)
 *   useApp()       read it in a page
 *   pageDef(k)     the entry for a key, or null (the table and Home are TradingPost's own)
 *
 * Four slots belong to the new look (RN_UI2), each the page that takes an old one's place:
 *
 *   home2       Home in the new look (Home2.tsx), in place of today's Home.
 *   companies2  the Companies workbench (workbench/CompaniesWorkbench.tsx), in place of the
 *               table while it lists companies. It reads and changes the table's place (TableCtx).
 *   find2       Find (find/Find.tsx), page key "find".
 *   people2     People (people/People.tsx), in place of the table while it lists people (Data / People).
 *               It reads the table's place (TableCtx) for its filters and the list type.
 *   seats2      Seats (seatsPage/SeatsPage.tsx), in place of the table while it lists seats (not
 *               Hiring now): its tabs All seats and Seats that ended lately. Its third tab, Your
 *               seats, is the page "seats" (today's Seats.tsx inside it), so ?p=seats lands there.
 *
 *   company2    the company record (company/CompanyPage.tsx) while one is open (?c=<id>), in place of
 *               the list or page it was opened over, on wider screens (AppCtx.record). Phones keep
 *               the record drawer (Drawer.tsx).
 *
 * tableSlotOf(recordType, tab) (shell/slots.ts) names the slot that takes the table's place, or null.
 *
 * An entry with `placeholder` and no `component` draws today's page instead (TradingPost).
 */
import dynamic from "next/dynamic";
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { Me, SavedViewRec, View } from "@/lib/tableTypes";
import type { Act } from "../../ui/shared";
import type { RadarRange, RadarView } from "@/lib/radar/types";
import { YOUR_FEATURE } from "@/lib/radar/types";
import type { CoInfo, Facets, Filters, HireCtx, RecordType, Row, SeatInfo, SortKey, Tab } from "../model";
import type { Layout } from "../hooks";
import type { AddOpts } from "../ui";
import type { Ui2Page } from "../place";
import type { SixSteps } from "../getStarted";
import type { HomeProps } from "../Home";
import { MyCredits } from "../Credits";
import { MessagesPage } from "../Messages";
import { RadarPage } from "../Radar";
import { BillingPage, openPlans } from "../Billing";
import { Seats } from "../Seats";
import { PipelinePage } from "../Pipeline";
import { GetInPage, WayInPage } from "../network/Ways";
import { NetworkPage } from "../network/Network"; // [google network]
import { useState } from "react";
import type { AskPlan } from "@/lib/ask";
import { setFindStart } from "../find/start";
import { firstOf, ownOf } from "../firstVisit";

/* ---------- the keys ---------- */

/**
 * Every place the app draws. "today" (Home) and "table" are TradingPost's own; the rest are pages
 * here. The new look adds Ui2Page (place.ts UI2_PAGES: find, warm, alerts, agent, settings).
 */
export type ShellPage =
  | "today" | "table" | "credits" | "rates" | "seats" | "metrics" | "messages" | "integrations" | "notifications" | "partners" | "billing"
  | "radar" | "network" | "fractionals" | "pipeline" | "proposals" | "peers" | "getin" | Ui2Page;

/* ---------- what every page reads ---------- */

/** The table as TradingPost keeps it: the companies workbench (companies2) reads and changes it through these. */
export interface TableCtx {
  /** What it lists: companies, seats (engagements) or people. */
  recordType: RecordType;
  setRecordType: (t: RecordType) => void;
  /** The view: all, hiring, repeat, unlocked, following, needs (model.ts TABS). */
  tab: Tab;
  setTab: (t: Tab) => void;
  /** The sort in use (the member's pick, else the view's default), and the sorts this list offers. null puts the default back. */
  sort: SortKey;
  /** The member's own pick, or null while the view's default applies. */
  sortPicked: SortKey | null;
  setSort: (s: SortKey | null) => void;
  sorts: { key: SortKey; label: string }[];
  /** The filters in play (the onboarding preset and a widened search applied). setFilters keeps the preset's rules (TradingPost setEff). */
  filters: Filters;
  setFilters: (f: Filters) => void;
  clearFilters: () => void;
  /** How many filters are on, and each as a chip that takes it off. */
  nFilters: number;
  chips: { id: string; label: string; clear: () => void }[];
  /** The search typed (the list reads it deferred). */
  query: string;
  setQuery: (q: string) => void;
  /** The list in order (frozen while a record is open, so "3 of 64" holds), the rows drawn so far (Show more), and how many it has in all. */
  rows: Row[];
  shown: Row[];
  total: number;
  /** Draw the next 50. */
  showMore: () => void;
  /** Only the first screen is here: the list waits for the whole table. */
  listWaits: boolean;
  /** Counts per view and per filter value, per list (companies, seats, people), and on file. */
  facets: Facets;
  typeCounts: Record<RecordType, number>;
  totals: Record<RecordType, number>;
  /** Open a row's record (the drawer), and the row whose record is open. */
  openRow: (r: Row) => void;
  openKey: string | null;
  /** The previous visit (ISO), for "new since" marks; null on a first visit. */
  since: string | null;
  /** Recently hired is on: which functions and the window (rows say who was hired and when). */
  hire: HireCtx | null;
  /** Saved views (lists), the one on screen, open one, and "Save this view" (its sheet, or the plans on Free). */
  views: SavedViewRec[];
  currentView: string | null;
  openView: (v: SavedViewRec) => void;
  askSave: () => void;
  /** The ideal client pill (or Recently hired's sentence) as the old look draws it over the list; null where it doesn't apply. */
  pill: ReactNode;
  /** The filter panel (Filters.tsx) with these filters and counts, under an optional head. */
  filterPanel: (head?: ReactNode) => ReactNode;
  /** A search field bound to `query` (the old top bar's), for a page to place. */
  searchField: ReactNode;
}

/** What the pages that exist today read from the shell (each was a prop TradingPost passed). */
export interface ShellState {
  /** Crystal Ball: the day's or range's data, its rows, and the member as the cells see them. */
  radar: { data: RadarView | null; failed: string | null; reload: () => void; rows: Row[] };
  cellMe: Me;
  setRadarRange: (r: RadarRange) => void;
  radarKnow: boolean;
  setRadarKnow: (on: boolean) => void;
  /** Your network at one of its parts ("nw-warm"). */
  openNetwork: (section: string | null) => void;
  netSection: string | null;
  /** Integrations opened at its Claude section (an old "Use it in Claude" link). */
  claudeLink: boolean;
  /** Peers on Every fractional (the directory). */
  peersAll: boolean;
  setPeersAll: (on: boolean) => void;
  /** Your seats: the member's seats, the one to open at, whether its search comes first, and the way back to the fact the zero-credits wall was on. */
  seats: SeatInfo[];
  seatFocus: string | null;
  seatSearch: boolean;
  seatBack: { name: string; go: () => void } | null;
  /** Warm paths: one company's way in (?w=), or none (the list). */
  wayCo: string | null;
  setWayCo: (id: string | null) => void;
}

/** Getting started and first visits (getStarted.ts sixSteps, firstVisit.ts). */
export interface StartCtx {
  /** The six steps as they stand (step 6 hidden until Evidence ships), derived from what the member has. */
  six: SixSteps;
  /** Run a step's action (the same as its button on Home and the rail card). */
  run: (key: SixSteps["steps"][number]["key"]) => void;
  /** Getting started is closed (Home's "Hide"), or every step is done. */
  hidden: boolean;
  hide: () => void;
  /** A page's "what this page is for" strip is dismissed (Profile.stripsOff). */
  stripOff: (key: string) => boolean;
  dismissStrip: (key: string) => void;
}

/**
 * The company record open now (TradingPost's record, BUILD_PLAN F0: the record stays ?c=), for the
 * company page (company/CompanyPage.tsx), which the new look draws in place of the list on wider
 * screens. Phones and the old look keep the drawer. Null while no record is open.
 */
export interface RecordCtx {
  info: CoInfo;
  me: Me;
  /** A seat or a person to open at. */
  focus: string | null;
  /** "3 of 64" in the list it was opened from, or null. */
  pos: { n: number; of: number } | null;
  /** Back to the list or the page it was opened from (Esc). */
  onClose: () => void;
  /** The previous or next company in that list (K, J). */
  onStep: (d: 1 | -1) => void;
  /** Opened from Crystal Ball or Home's card at a company it lists. */
  crystal: boolean;
  /** The breadcrumb before the company's name: Companies (or the list), Crystal Ball, Home. */
  crumbs: import("./Header").Crumb[];
}

export interface AppCtx {
  /** The member's whole view, their Me (= view.me), the action call and a refresh of the view. */
  view: View;
  me: Me;
  act: Act;
  refresh: () => Promise<void>;
  /** Every company with its seats and people (model.ts deriveAll), and by id. A company found by exact name is in byId as its named record. */
  infos: CoInfo[];
  byId: Map<string, CoInfo>;
  /** Only the first screen's companies are here; the whole table is on its way. */
  waiting: boolean;
  /** The whole table failed after its retries: a page that waits for it says so, and this tries again. */
  fullFailed: (() => void) | null;
  layout: Layout;
  phone: boolean;
  /** The new look is on (RN_UI2, Me.ui2). */
  ui2: boolean;
  /** Your network is on (RN_GOOGLE) and loaded: the member's contacts are a source. */
  network: boolean;
  /** The page on screen. */
  page: ShellPage;
  /** Open a company's record, at a seat or a person when `focus` is given. Closing it comes back here. */
  openCompany: (id: string, focus?: string) => void;
  /** Open a page (closes the record and any sheet; asks first while a proposal has an unsaved edit). Old keys open their new home under the new look. */
  openPage: (p: ShellPage) => void;
  /** The address of a page, for a real link (middle-click opens a new tab). */
  hrefOf: (p: ShellPage) => string;
  /** Back to Home or the table, whichever this page was opened over. */
  toBase: () => void;
  /** Add what you know (the sheet), optionally on a company or with a query. */
  openAdd: (o?: AddOpts) => void;
  /** Your seats, at one seat when given. */
  openSeats: (engagementId?: string) => void;
  /** Your profile sheet (the ideal client). */
  openProfile: () => void;
  /** The table, for the workbench and Find. */
  table: TableCtx;
  /** What today's pages read from the shell. */
  shell: ShellState;
  /** What the old look draws, for a placeholder to draw until its new page exists. */
  legacy: { home: ReactNode; table: ReactNode; homeProps: HomeProps };
  /** The new header's right side (bell, credits pill, Add what you know), for a page that draws its own header (Home). */
  headerActions: ReactNode;
  start: StartCtx;
  /** The company record open now, for the company page (null without one, and on phones, where the drawer draws it). */
  record?: RecordCtx | null;
}

const Ctx = createContext<AppCtx | null>(null);
export const AppCtxProvider = Ctx.Provider;
/** The shell's context, in any page. */
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppCtx missing");
  return c;
}
/** The same, or null outside the app (a component that also renders elsewhere). */
export const useAppMaybe = () => useContext(Ctx);

/* ---------- the registry ---------- */

export interface PageDef {
  /** The page's name: the header's title or the breadcrumb's last part, and the browser tab's title. */
  title: string;
  /** What to draw. Absent on a placeholder whose old page TradingPost draws. */
  component?: ComponentType;
  /** Not built yet: what stands in (TradingPost draws it). "home" today's Home, "table" today's table. */
  placeholder?: "home" | "table";
  /** The breadcrumb's parts before the title (each a page). Absent: Home, then the title. */
  crumbs?: ShellPage[];
  /** The page draws its own header (Home's greeting). It places ctx.headerActions itself. */
  ownHeader?: boolean;
  /** The page places its own "what this page is for" strip (shell/PageStrip.tsx); else the shell draws it under the header. */
  ownStrip?: boolean;
  /** Classes on its <main> besides "tp-main tp-main-page". */
  mainClass?: string | ((c: AppCtx) => string);
  /** Draw it only when this holds (Pilot metrics for admins, Plan and billing while billing is live); else the table, as before. */
  when?: (c: AppCtx) => boolean;
  /** While the whole table is on its way, this page waits for it ("Loading all companies"); else it shows its own head. */
  needsTable?: boolean;
}

/*
 * Pages a member opens now and then load on their own: Home and the table paint without them, and
 * they are fetched once the whole table is here (preloadPages, from TradingPost).
 */
const pageWait = () => (
  <div className="tp-allwait" role="status" aria-busy>
    <p className="tp-allwait-t">Loading…</p>
  </div>
);
const loadIntegrations = () => import("../Integrations");
const loadNotifications = () => import("../Notifications");
const loadBenchmarks = () => import("../Benchmarks");
const loadFractionals = () => import("../Fractionals");
const loadPeers = () => import("../Peers");
const loadAdmin = () => import("../Admin");
const Integrations = dynamic(() => loadIntegrations().then((m) => m.Integrations), { ssr: false, loading: pageWait });
const Notifications = dynamic(() => loadNotifications().then((m) => m.Notifications), { ssr: false, loading: pageWait });
const Benchmarks = dynamic(() => loadBenchmarks().then((m) => m.Benchmarks), { ssr: false, loading: pageWait });
// Peers (Peers.tsx): fellow fractionals to work with; the Fractionals directory is its Every fractional view.
const PeersPage = dynamic(() => loadPeers().then((m) => m.PeersPage), { ssr: false, loading: pageWait });
const Admin = dynamic(() => loadAdmin().then((m) => m.Admin), { ssr: false, loading: pageWait });
// Proposals (Proposals.tsx), loaded when opened.
const ProposalsPage = dynamic(() => import("../Proposals").then((m) => m.ProposalsPage), { ssr: false, loading: pageWait });
/*
 * The new look's own pages load on their own too, so the old look's first paint carries none of
 * their code. A member in the new look fetches them once the whole table is here (preloadPages).
 */
const loadHome2 = () => import("../Home2");
const loadFind = () => import("../find/Find");
const loadWorkbench = () => import("./workbenchPage");
const loadPeople = () => import("../people/People");
const loadSeatsPage = () => import("../seatsPage/SeatsPage");
const loadCompany = () => import("../company/CompanyPage");
const Home2 = dynamic(() => loadHome2().then((m) => m.Home2), { ssr: false, loading: pageWait });
const Find = dynamic(() => loadFind().then((m) => m.Find), { ssr: false, loading: pageWait });
const WorkbenchPage = dynamic(() => loadWorkbench().then((m) => m.WorkbenchPage), { ssr: false, loading: pageWait });
// The company record as a page (company/CompanyPage.tsx), in place of the list while a record is open.
const CompanyPage = dynamic(() => loadCompany().then((m) => m.CompanyPage), { ssr: false, loading: pageWait });
const SeatsPage = dynamic(() => loadSeatsPage().then((m) => m.SeatsPage), { ssr: false, loading: pageWait });
const PeoplePage = dynamic(() => loadPeople().then((m) => m.PeoplePage), { ssr: false, loading: pageWait });
/** The new look's pages, fetched while the member reads. */
export const preloadUi2 = () => [loadHome2, loadFind, loadWorkbench, loadCompany, loadPeople, loadSeatsPage];
/** Fetch the pages while the member reads: opening one is then instant. */
export const preloadPages = (admin: boolean) => [loadIntegrations, loadBenchmarks, loadFractionals, loadPeers, ...(admin ? [loadAdmin] : [])];

/* Today's pages, each as the shell drew it (the same props, now read from AppCtx). */

function CreditsP() {
  const c = useApp();
  return <MyCredits view={c.view} refresh={c.refresh} onUseInClaude={() => c.openPage("integrations")} onNotifications={() => c.openPage("notifications")} />;
}
function IntegrationsP() {
  const c = useApp();
  return (
    <Integrations
      onBack={c.toBase}
      onCredits={() => c.openPage("credits")}
      section={c.shell.claudeLink || c.page === "agent" ? "claude" : undefined}
      onNetwork={() => c.openPage("network")}
      onNotifications={() => c.openPage("notifications")}
    />
  );
}
function NotificationsP() {
  const c = useApp();
  return <Notifications view={c.view} onIntegrations={() => c.openPage("integrations")} />;
}
function RatesP() {
  const c = useApp();
  return <Benchmarks view={c.view} refresh={c.refresh} />;
}
function MetricsP() {
  const c = useApp();
  return <Admin view={c.view} refresh={c.refresh} />;
}
function MessagesP() {
  const c = useApp();
  return <MessagesPage onBack={c.toBase} openCompany={(id) => c.openCompany(id)} />;
}
function RadarP() {
  const c = useApp();
  const s = c.shell;
  return (
    <RadarPage
      view={s.radar.data}
      failed={s.radar.failed}
      reload={s.radar.reload}
      rows={s.radar.data ? s.radar.rows : []}
      me={s.cellMe}
      phone={c.phone}
      onBack={c.toBase}
      onProfile={c.openProfile}
      onRange={s.setRadarRange}
      openCompany={c.openCompany}
      know={s.radarKnow}
      onKnow={s.setRadarKnow}
      onWarm={() => s.openNetwork("nw-warm")}
    />
  );
}
function BillingP() {
  const c = useApp();
  return <BillingPage view={c.view} refresh={c.refresh} />;
}
function PeersP() {
  const c = useApp();
  return <PeersPage infos={c.infos} waiting={c.waiting} all={c.shell.peersAll || c.page !== "peers"} onAll={c.shell.setPeersAll} onProfile={c.openProfile} openCompany={c.openCompany} />;
}
/** Your seats. In the new look it is the Seats page's third tab (seatsPage/SeatsPage.tsx), with today's page inside it. */
function SeatsP() {
  const c = useApp();
  if (c.ui2) return <SeatsPage at="mine" />;
  return <Seats seats={c.shell.seats} infos={c.infos} focus={c.shell.seatFocus} search={c.shell.seatSearch} back={c.shell.seatBack} />;
}
/** Seats in place of the table while it lists seats: All seats, or Seats that ended lately. */
function Seats2P() {
  return (
    <main className="tp-main tp-main-page wb-host sp-host">
      <SeatsPage at="data" />
    </main>
  );
}
function PipelineP() {
  const c = useApp();
  return <PipelinePage infos={c.infos} openCompany={c.openCompany} onIntegrations={() => c.openPage("integrations")} />;
}
function ProposalsP() {
  const c = useApp();
  return <ProposalsPage view={c.view} infos={c.infos} />;
}
/** Where you can get in, and Your way into one company (network/Ways.tsx). With Your network on. The new look's Warm paths, for now. */
function GetInP() {
  const c = useApp();
  return c.shell.wayCo ? (
    <WayInPage company={c.shell.wayCo} phone={c.phone} infos={c.infos} onBack={() => c.shell.setWayCo(null)} />
  ) : (
    <GetInPage infos={c.infos} phone={c.phone} openCompany={c.openCompany} />
  );
}
/** [google network] Your network: the member's own, from Google and their own Claude. */
function NetworkP() {
  const c = useApp();
  return (
    <NetworkPage
      infos={c.infos}
      me={c.me}
      onBack={c.toBase}
      openCompany={c.openCompany}
      onProfile={c.openProfile}
      section={c.shell.netSection}
      onSeats={() => c.openSeats()}
      onClaude={() => (c.openPage("integrations"), setTimeout(() => document.getElementById("claude-network")?.scrollIntoView({ block: "start" }), 400))}
      refresh={c.refresh}
    />
  );
}

/**
 * Evidence Bank (Close): private case studies that fill the Proof part of a proposal. Its page comes
 * in Stage 5; until then this says so plainly. Without Close it offers the upgrade, as the rail does.
 */
function EvidenceSoon() {
  const c = useApp();
  const close = !c.me.plan || c.me.plan.tier === "close";
  return (
    <div className="ws-soon">
      <h1>Evidence Bank</h1>
      <p>Your private case studies: the problem, what you did, and the numbers before and after. The client name stays hidden unless you show it. Each case fills the Proof part of the proposals you send.</p>
      {close ? (
        <p>Evidence Bank is being built. Your seats will each start a draft case here.</p>
      ) : (
        <>
          <p>Evidence Bank is part of the Close plan, with proposals and contracts.</p>
          <button type="button" className="btn btn-pine" onClick={() => openPlans("proposals")}>
            See the Close plan
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- the new look's own pages ---------- */

/** A dismissed strip: on the member's profile (Profile.stripsOff), or dismissed in this visit. */
export const stripGone = (c: AppCtx, k: string) => c.start.stripOff(k) || (c.me.stripsOff ?? []).includes(k);

/**
 * Where an Ask Merlin answer lands from Home or the workbench: Find with the plan set (filters,
 * kind, sort; or a company to look up), Hiring now, Crystal Ball, or the page it names.
 */
export function askGo(c: AppCtx, plan: AskPlan, text: string) {
  const hp = c.legacy.homeProps;
  if (plan.company && (plan.page === "lookup" || plan.page === "warm" || plan.page === "find")) return setFindStart({ lookup: plan.company }), c.openPage("find");
  if (plan.page === "find" || plan.page === "lookup") return setFindStart({ plan, text }), c.openPage("find");
  if (plan.page === "hiring") return hp.roles.go();
  if (plan.page === "radar") return hp.radar.go();
  c.openPage(plan.page);
}

/** Home in the new look (Home2.tsx): Home's own props, Getting started, the first visit and Ask. */
function Home2P() {
  const c = useApp();
  // Read once when Home opens: what the member does here doesn't swap the page under them.
  const [first] = useState(() => firstOf("home", ownOf("home", c.me)).first);
  const run = (k: SixSteps["steps"][number]["key"]) => {
    // Step 5 on Home: the lists are right here (the starter lists' alert switch saves one).
    const lists = k === "alert" ? document.getElementById("h2-lists") : null;
    if (lists) return lists.scrollIntoView({ block: "start", behavior: "smooth" });
    c.start.run(k);
  };
  return (
    <main className="tp-main tp-main-page td-page hm-page h2-page">
      <Home2
        {...c.legacy.homeProps}
        six={c.start.hidden ? null : c.start.six}
        runSix={run}
        first={first}
        stripOn={!stripGone(c, "home")}
        onStripOff={() => c.start.dismissStrip("home")}
        actions={c.headerActions}
        onAsk={(plan, text) => askGo(c, plan, text)}
        openFind={() => c.openPage("find")}
        openLookalikes={() => (setFindStart({ kind: "lookalikes" }), c.openPage("find"))}
        openPage={(p) => c.openPage(p)}
        openList={(v) => c.table.openView(v)}
      />
    </main>
  );
}

/** Find (find/Find.tsx), page key "find", under the shell's header and breadcrumb. */
function FindP() {
  const c = useApp();
  const [first] = useState(() => firstOf("find", ownOf("find", c.me)).first);
  return (
    <Find
      me={c.me}
      infos={c.infos}
      waiting={c.waiting}
      first={first}
      openCompany={(id) => c.openCompany(id)}
      openList={(v) => c.table.openView(v)}
      openPage={(p) => c.openPage(p)}
      onProfile={c.openProfile}
      stripOn={!stripGone(c, "find")}
      onStripOff={() => c.start.dismissStrip("find")}
    />
  );
}

/**
 * The Companies workbench, in place of the table while it lists companies. Its view, filters and
 * sort are the table's own (TableCtx), so the address, a saved list opened from Home or Find, and
 * the breadcrumb follow it; Ask Merlin's bar sets them here, or hands off to Find.
 */
/** The Companies workbench, in place of the table while it lists companies (shell/workbenchPage.tsx). */
function Companies2P() {
  return <WorkbenchPage />;
}

/** The company record as a page (company/CompanyPage.tsx), drawn while AppCtx.record is set. */
function CompanyP() {
  return <CompanyPage />;
}

/** People (people/People.tsx), in place of the table while it lists people. It draws its own <main>. */
function People2P() {
  return <PeoplePage />;
}

const peersMain = (c: AppCtx) => (c.shell.peersAll || c.page !== "peers" ? "fr-main" : "");

/**
 * Every page by key. Old keys keep their pages; the new look's keys open the page that is their
 * home today until their own is built (Warm paths is Where you can get in, Alerts and workflows is
 * Notifications, Agent access and Settings are Integrations).
 */
export const PAGES: Partial<Record<ShellPage | "home2" | "companies2" | "find2" | "company2" | "people2" | "seats2", PageDef>> = {
  credits: { title: "Your credits", component: CreditsP },
  integrations: { title: "Integrations", component: IntegrationsP },
  notifications: { title: "Notifications", component: NotificationsP },
  rates: { title: "Rate benchmarks", component: RatesP },
  metrics: { title: "Pilot metrics", component: MetricsP, when: (c) => !!c.view.admin },
  messages: { title: "Messages", component: MessagesP },
  radar: { title: YOUR_FEATURE, component: RadarP, mainClass: "rd-main", needsTable: true },
  billing: { title: "Plan and billing", component: BillingP, when: (c) => !!c.me.plan },
  peers: { title: "Peers", component: PeersP, mainClass: peersMain },
  fractionals: { title: "Peers", component: PeersP, mainClass: peersMain },
  partners: { title: "Peers", component: PeersP, mainClass: peersMain },
  seats: { title: "Your seats", component: SeatsP, mainClass: (c) => (c.ui2 && !c.phone ? "wb-host sp-host" : "ys-main"), ownStrip: true },
  pipeline: { title: "Your pipeline", component: PipelineP },
  proposals: { title: "Proposals", component: ProposalsP },
  getin: { title: "Where you can get in", component: GetInP, needsTable: true },
  network: { title: "Your network", component: NetworkP },
  // The new look's pages (RN_UI2): each opens its home of today until its own exists.
  warm: { title: "Warm paths", component: GetInP, needsTable: true },
  evidence: { title: "Evidence Bank", component: EvidenceSoon },
  alerts: { title: "Alerts and workflows", component: NotificationsP },
  agent: { title: "Agent access", component: IntegrationsP },
  settings: { title: "Settings", component: IntegrationsP },
  // Mount points for the new look's own pages (see the top of this file).
  home2: { title: "Home", component: Home2P, ownHeader: true, ownStrip: true },
  companies2: { title: "Companies", component: Companies2P, crumbs: ["today"], ownStrip: true },
  find2: { title: "Find", component: FindP, ownStrip: true },
  // The company record (?c=<id>) as a page, while one is open on a wider screen: it draws its own header (breadcrumb, 3 of 64) and strip.
  company2: { title: "Company", component: CompanyP, ownHeader: true, ownStrip: true },
  seats2: { title: "Seats", component: Seats2P, crumbs: ["today"], ownStrip: true },
  people2: { title: "People", component: People2P, crumbs: ["today"], ownStrip: true },
};

/** The new look's page in the table's place for a list (shell/slots.ts). */
export { tableSlotOf } from "./slots";

/** Keys drawn by another key's entry: the page "find" is the find2 slot. */
const ENTRY_OF: Partial<Record<string, string>> = { find: "find2" };
/** The entry for a key, or null. */
export const pageDef = (k: string): PageDef | null => (PAGES as Record<string, PageDef | undefined>)[ENTRY_OF[k] ?? k] ?? null;
/** A key whose page is a placeholder for the table opens the table (Find until its page exists). */
export const opensTable = (k: string) => pageDef(k)?.placeholder === "table" && !pageDef(k)?.component;
