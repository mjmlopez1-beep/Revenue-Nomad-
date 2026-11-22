"use client";

/**
 * Home (page "today", the address / with no place in it): always a next click.
 *
 *   the one nudge (nudges.ts)
 *   "Good morning, Jordan" and one line on the day (on a phone, the trial and its days left under it),
 *   then the one-time cards (the trial started, the trial ended, the Pro welcome)
 *   Your three moves today (Moves.tsx): a company from Crystal Ball, the way in, and the move, three times
 *   Get started, while a new member has steps left (one line once they are done)
 *   one search box: companies by the names the member can see (Crystal Ball's names on their plan too); Enter
 *   searches the whole table, every company, with the profile and filters off for that search
 *   four quick actions: Find companies, Your Crystal Ball, Add what you know, Fill in your seats
 *   Since your last visit: each count a row that opens it
 *   Your saved views: a small table (matches, new, the weekly email, last opened)
 *
 * Pictures (Fractions, the quiet register: app/ui/fractions/art.tsx). The greeting sits in a mint
 * band with a small scene at its far end (morning when something is new, night when nothing is);
 * each quick action has its prop in a corner. Home shows the Nomad at most once, and only where
 * the moment is: knocking in the trial-ended card, else resting by "Nothing new since". Get
 * started keeps its plain progress bar (a figure small enough to stand on it was too small to read).
 *
 * It paints from GET ?today=1 before the whole table is here (Today.tsx useTodayData): what needs
 * the whole table (the saved views' counts, the seats card, the search's matches) waits a moment
 * in its own place, at its own size, so nothing moves when it lands.
 */
import { useContext, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FractionalsHome, Me, SavedViewRec } from "@/lib/tableTypes";
import { UiCtx } from "./ui";
import { FEATURE_NAME, YOUR_FEATURE, yourFeature } from "@/lib/radar/types";
import { CompanyLogo, IconChevron, IconSearch, IconX, timeAgo } from "../ui/shared";
import { EMPTY_FILTERS, RECORD_TYPES, applyFilters, rowsFor, type CheckStep, type CoInfo, type RecordType, type Row } from "./model";
import { plural, useMedia } from "./hooks";
import { LeadCard, TrialEnded, factsOf, type TodayData } from "./Today";
import { MovesSection } from "./Moves";
import { FollowUps } from "./FollowUps";
import { ProWelcome, TrialSummaryCard } from "./Billing";
import type { MovesWire } from "@/lib/moves";
import { crystalNames, nameMatches, showMeDue, trialCardLine, trialPillWords, sinceWords } from "./todayModel";
import { openPlans } from "./Billing";
import { NavIcon } from "./Sidebar";
import { navMatches, type NavIcon as NavIconName, type NavItem } from "./navModel";
import { Bleed, NomadArt, Prop, Scene, Spot, Strip } from "../ui/fractions/lazy";
import "./home.css";

/* ---------- Fractionals on Home ---------- */

/**
 * "3 fractionals who serve your kind of client joined this week." Asked for after Home's first
 * paint (GET ?fractionals=home, lib/fractionals.ts fractionalsHome), and nothing at all when none did.
 */
function FractionalsJoined() {
  const ui = useContext(UiCtx);
  const [d, setD] = useState<FractionalsHome | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/table?fractionals=home", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setD(j as FractionalsHome))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!ui || !d || d.n < 1) return null;
  return (
    <section className="hm-frline" aria-label="New in Fractionals">
      {d.initials.length > 0 && (
        <span className="hm-frfaces" aria-hidden>
          {d.initials.map((x, k) => (
            <span key={k} className="hm-frface">
              {x}
            </span>
          ))}
        </span>
      )}
      <span className="hm-frtext">
        {d.n === 1 ? "1 fractional who serves your kind of client joined this week." : `${d.n} fractionals who serve your kind of client joined this week.`}
      </span>
      <button type="button" className="hm-frgo" onClick={() => ui.openPage("fractionals")}>
        See {d.n === 1 ? "them" : "them"} <IconChevron dir="right" />
      </button>
    </section>
  );
}

/** Once, for a member who hasn't chosen: show them in the Fractionals directory, or keep them out. Your profile has the same switch. */
function ShowMeAsk() {
  const ui = useContext(UiCtx);
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  if (!ui) return null;
  const pick = async (on: boolean) => {
    setBusy(on ? "yes" : "no");
    await ui.act({ type: "settings", fractionals: on });
    setBusy(null);
  };
  return (
    <section className="hm-frask" aria-labelledby="hm-frask-h">
      <h2 className="hm-frask-h" id="hm-frask-h">
        Show you in the Fractionals directory?
      </h2>
      <p className="hm-frask-p">
        Members see your name, your seats and the clients you serve, free, and can message you. Never your email. Until you choose, you show as {ui.me.name.trim().split(/\s+/)[0]}{" "}
        {(ui.me.name.trim().split(/\s+/).pop() ?? "").charAt(0).toUpperCase()}. You can change it any time in Your profile.
      </p>
      <div className="hm-frask-acts">
        <button type="button" className="btn btn-pine" disabled={!!busy} aria-busy={busy === "yes"} onClick={() => void pick(true)}>
          Show me
        </button>
        <button type="button" className="btn" disabled={!!busy} aria-busy={busy === "no"} onClick={() => void pick(false)}>
          Keep me out
        </button>
      </div>
    </section>
  );
}

/** A place on Home: a link where it is one (middle-click opens a new tab), else a button. */
export interface Go {
  href?: string;
  go: () => void;
}

export interface HomeView {
  v: SavedViewRec;
  href: string;
  /** Rows it lists, and how many of their companies are new since the last visit (null: the whole table isn't here yet). */
  matches: number | null;
  fresh: number | null;
  /** Last opened in this browser (ISO), or null. */
  opened: string | null;
  /** What it follows in full, when its name is short (the first view's "Likely to need Sales next"). */
  about?: string | null;
}

export interface HomeProps {
  me: Me;
  infos: CoInfo[];
  byId: Map<string, CoInfo>;
  /** The top row of the member's first view: the lead when Crystal Ball has nothing. */
  firstRow: Row | null;
  /** Only Today's companies are here; the whole table is on its way. */
  waiting: boolean;
  data: TodayData | null;
  failed: boolean;
  sinceAt: string | null;
  unread: number;
  nudge: ReactNode;
  events?: ReactNode;
  trialEnded: boolean;
  onTrialSeen: () => void;
  onSeePro: () => void;
  /** The one-time card when the trial started (Me.plan.trialStarted), and its "Got it". */
  trialStarted: boolean;
  onTrialStartSeen: () => void;
  /** The one-time Pro welcome, right after the plan became Pro (Me.plan.proWelcome), and its "Got it". */
  proWelcome: boolean;
  onProSeen: () => void;
  /** Integrations (Connect Google), and the Claude connector's section of it (how a member's own Claude learns their voice). */
  integrations: Go;
  onClaude: () => void;
  /** Get started (null while the whole table is on its way, or once put away). */
  steps: CheckStep[] | null;
  onStep: (key: CheckStep["key"]) => void;
  onHideSteps: () => void;
  find: Go;
  radar: Go;
  onAdd: () => void;
  /** The fourth card: fill in, or find, your seats; Invite a fractional once that's done. Null while the table is on its way. */
  seats: { kind: "fill" | "find" | "invite"; title: string; line: string; go: () => void } | null;
  roles: Go;
  follows: Go;
  messages: Go;
  views: HomeView[];
  onOpenView: (v: SavedViewRec) => void;
  onEmailView: (v: SavedViewRec, on: boolean) => void;
  table: Go;
  openCompany: (id: string) => void;
  /** Enter in the search: the table, on that text. */
  onSearch: (q: string) => void;
  /** The sidebar's items, for "Go to Rate benchmarks" under the search. */
  nav: NavItem[];
  onNav: (it: NavItem) => void;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
const ownClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
/** A link that moves in the app on a plain click. */
function GoLink({ to, className, children, label }: { to: Go; className?: string; children: ReactNode; label?: string }) {
  if (!to.href)
    return (
      <button type="button" className={className} onClick={to.go} aria-label={label}>
        {children}
      </button>
    );
  return (
    <a
      href={to.href}
      className={className}
      aria-label={label}
      onClick={(e) => {
        if (!ownClick(e)) return;
        e.preventDefault();
        to.go();
      }}
    >
      {children}
    </a>
  );
}

/**
 * Home's first paint is its top: the greeting and the first of today's moves. The rest (the other
 * moves, Get started, the search, the four cards, since your last visit, the saved views) comes on
 * the next frame, the first time Home is drawn on a visit, so a phone paints sooner. Later visits
 * to Home draw it all at once.
 */
let drawnOnce = false;
function useAfterFirstPaint() {
  const [on, setOn] = useState(drawnOnce);
  useEffect(() => {
    if (on) return;
    let t = 0;
    const raf = requestAnimationFrame(() => {
      t = window.setTimeout(() => {
        drawnOnce = true;
        setOn(true);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [on]);
  return on;
}

export function HomePage(p: HomeProps) {
  const rest = useAfterFirstPaint();
  const { data, byId, me } = p;
  // The hour is the browser's: Home is drawn in the browser only.
  const hello = useMemo(() => ((h) => (h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"))(new Date().getHours()), []);
  // Today's moves as the server picked them, then as it answered Done, Snooze or Undo. A server from before them: the day's top rows, with no way in from a network.
  const [after, setAfter] = useState<MovesWire | null>(null);
  const wire = useMemo<MovesWire | null>(
    () => after ?? data?.moves ?? (data ? { list: data.rows.slice(0, 3).map((row) => ({ id: row.id, row })), month: 0, google: "off" } : null),
    [after, data],
  );
  const moveN = useMemo(() => (wire?.list ?? []).filter((w) => byId.has(w.id)).length, [wire, byId]);
  const loading = (!data && !p.failed) || (p.waiting && !!wire?.list.length && !moveN);
  // With no move today: the top of their table, as before.
  const lead = !loading && !moveN && p.firstRow ? { i: byId.get(p.firstRow.i.c.id) ?? p.firstRow.i, row: null } : null;
  const dayN = data?.newCount ?? 0;
  const since = data?.since ?? null;
  const sinceLow = p.sinceAt ? sinceWords(p.sinceAt).replace(/^Since/, "since") : null;

  // The greeting's line: today's moves, else what is new, in one sentence.
  const sub = (() => {
    if (moveN > 0) return `${["", "One move", "Two moves", "Three moves"][Math.min(moveN, 3)]} for today. About ten minutes.`;
    const n = since && p.sinceAt ? since.radar : 0;
    if (n > 0 && sinceLow) return `${plural(n, "new company", "new companies")} in your ${FEATURE_NAME} ${sinceLow}.`;
    if (dayN > 0) return `${plural(dayN, "company", "companies")} in your ${FEATURE_NAME} today.`;
    if (!me.function) return "Tell us your function and Merlin finds the companies likely to hire you next.";
    if (loading) return "Finding your moves for today.";
    return `Nothing new in your ${FEATURE_NAME} today. Your table has every company.`;
  })();

  const rows = [
    { key: "radar", n: since?.radar ?? 0, text: (n: number) => `${plural(n, "new company", "new companies")} in ${FEATURE_NAME}`, to: p.radar, icon: "radar" as NavIconName },
    { key: "roles", n: since?.roles ?? 0, text: (n: number) => `${plural(n, "role")} opened in ${me.function ?? "your function"}`, to: p.roles, icon: "hiring" as NavIconName },
    { key: "follows", n: since?.follows ?? 0, text: (n: number) => `${n} of your follows changed`, to: p.follows, icon: "following" as NavIconName },
    { key: "unread", n: p.unread, text: (n: number) => `${plural(n, "unread conversation")}`, to: p.messages, icon: "messages" as NavIconName },
  ];
  const sinceRows = rows.filter((r) => r.n > 0 && (r.key === "unread" || p.sinceAt));
  // A quiet day: the day's numbers are here and nothing in them is new for this member.
  const quietDay = !!data && !loading && !!me.function && dayN === 0 && !(since && p.sinceAt && since.radar > 0);
  // The one Nomad on Home (art.tsx: at most one a screen), once the day's numbers are here.
  const nomadAt = !data ? null : p.trialEnded ? "trial" : !sinceRows.length && p.sinceAt ? "since" : null;

  return (
    <div className="hm">
      {p.nudge ? <div className="hm-nudge">{p.nudge}</div> : null}
      <header className="hm-hello">
        {/* The band's picture: a scene at the far end on a wide screen, a plain corner on a narrow one. Never under the words. */}
        <Strip kind={quietDay ? "night" : "morning"} on="mint" className="hm-hello-art" />
        <Bleed kind="BR" on="mint" className="hm-hello-corner" />
        <h1 className="hm-h1">
          {hello}, {firstName(me.name)}
        </h1>
        <p className="hm-sub">{sub}</p>
        {/* A phone keeps the top bar's trial pill in its More sheet: the trial and its days left show here. */}
        {trialPillWords(me.plan) ? (
          <button type="button" className="hm-trialpill" onClick={() => openPlans("trial")}>
            {trialPillWords(me.plan)}
          </button>
        ) : null}
      </header>
      {/* The trial's last 4 days: what they used, and what locks when it ends (PlanView.summary). */}
      <TrialSummaryCard plan={me.plan} />
      {p.trialStarted && me.plan?.name === "trial" ? <TrialStarted days={me.plan.trialDaysLeft} today={dayN} radar={p.radar} onSeen={p.onTrialStartSeen} /> : null}
      {p.trialEnded ? <TrialEnded onSeePro={p.onSeePro} onSeen={p.onTrialSeen} art={<Scene kind="trialEnding" square pro on="mint" className="td-trial-art" />} /> : null}
      {p.proWelcome && me.plan ? <ProWelcome plan={me.plan} onSeen={p.onProSeen} /> : null}

      {/* Your pipeline's follow-ups due, above the moves (FollowUps.tsx), read once Home's first paint is over. Nothing when none is due. */}
      {rest && <FollowUps me={me} byId={byId} openCompany={p.openCompany} />}

      <MovesSection
        me={me}
        byId={byId}
        wire={wire}
        onWire={setAfter}
        loading={loading}
        rest={rest}
        dayN={dayN}
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

      {/* Fractionals: one quiet line when fractionals who serve the member's kind of client joined this week, and the one-time question. */}
      {rest && <FractionalsJoined />}
      {/* The directory question waits for the member's first unlock, or their second visit. */}
      {rest && showMeDue(me, p.sinceAt) && <ShowMeAsk />}

      {rest && p.steps && <GetStarted steps={p.steps} onStep={p.onStep} onHide={p.onHideSteps} />}
      {rest && <AskBox {...p} />}

      {rest && (
      <ul className="hm-cards" aria-label="Start here">
        <li>
          <GoLink to={p.find} className="hm-card">
            <Prop name="doorRow" height={34} className="hm-card-art" />
            <span className="hm-card-ico" aria-hidden>
              <NavIcon name="companies" size={20} />
            </span>
            <span className="hm-card-t">Find companies</span>
            <span className="hm-card-p">Open your table, ranked for you.</span>
          </GoLink>
        </li>
        <li>
          <GoLink to={p.radar} className="hm-card">
            <Prop name={dayN > 0 ? "ballGlow" : "ballPlain"} height={dayN > 0 ? 40 : 30} className="hm-card-art" />
            <span className="hm-card-ico" aria-hidden>
              <NavIcon name="radar" size={20} />
            </span>
            <span className="hm-card-t">
              {YOUR_FEATURE}
              {dayN > 0 && <span className="hm-card-n num">{dayN}</span>}
            </span>
            <span className="hm-card-p">Companies likely to hire you next.</span>
          </GoLink>
        </li>
        <li>
          <button type="button" className="hm-card" onClick={p.onAdd}>
            <Prop name="ledger" height={32} className="hm-card-art" />
            <span className="hm-card-ico hm-card-ico-earn" aria-hidden>
              <NavIcon name="add" size={20} />
            </span>
            <span className="hm-card-t">Add what you know</span>
            <span className="hm-card-p">Earn a credit for each fact, up to {me.earnCap} a day.</span>
          </button>
        </li>
        <li>
          {p.seats ? (
            <button type="button" className="hm-card" onClick={p.seats.go}>
              <Prop name={p.seats.kind === "invite" ? "envelope" : "seatEmpty"} height={p.seats.kind === "invite" ? 30 : 38} className="hm-card-art" />
              <span className="hm-card-ico hm-card-ico-earn" aria-hidden>
                <NavIcon name={p.seats.kind === "invite" ? "invite" : "yourseats"} size={20} />
              </span>
              <span className="hm-card-t">{p.seats.title}</span>
              <span className="hm-card-p">{p.seats.line}</span>
            </button>
          ) : (
            <div className="hm-card hm-card-wait" aria-hidden>
              <span className="hm-card-ico" />
              <span className="td-skel" style={{ width: "60%", height: 14 }} />
              <span className="td-skel" style={{ width: "85%" }} />
            </div>
          )}
        </li>
      </ul>
      )}

        {rest && (
        <section className="hm-sec hm-since" aria-labelledby="hm-since-h">
          <h2 className="hm-h2" id="hm-since-h">
            {p.sinceAt ? "Since your last visit" : "What's new"}
          </h2>
          {sinceRows.length ? (
            <ul className="hm-slist">
              {sinceRows.map((r) => (
                <li key={r.key}>
                  <GoLink to={r.to} className="hm-srow">
                    <span className="hm-srow-ico" aria-hidden>
                      <NavIcon name={r.icon} size={16} />
                    </span>
                    <span className="hm-srow-t num">{r.text(r.n)}</span>
                    <IconChevron dir="right" size={13} />
                  </GoLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`hm-quiet${nomadAt === "since" ? " hm-quiet-art" : ""}`}>
              {nomadAt === "since" ? <NomadArt pose="rest" height={52} className="hm-quiet-nomad" /> : null}
              <span>{p.sinceAt ? `Nothing new ${sinceLow}. No new companies, roles or messages.` : "This is your first visit. New companies, roles and messages show here next time."}</span>
            </p>
          )}
        </section>
        )}

      {rest && <SavedViewsTable views={p.views} onOpen={p.onOpenView} onEmail={p.onEmailView} table={p.table} waiting={p.waiting} />}
      {rest && p.events}
    </div>
  );
}

/* ---------- the trial's one-time card ---------- */

/** Once, when the trial starts: every Crystal Ball company opens free for its days, and the way there. */
function TrialStarted({ days, today, radar, onSeen }: { days: number | null; today: number; radar: Go; onSeen: () => void }) {
  return (
    <section className="td-trial hm-trialcard" aria-labelledby="hm-trialcard-h">
      <p className="td-trial-h" id="hm-trialcard-h">
        Your Pro trial is on.
      </p>
      <p>{trialCardLine(days, today)}</p>
      <div className="td-acts">
        <GoLink to={{ href: radar.href, go: () => (onSeen(), radar.go()) }} className="btn btn-pine">
          Open {FEATURE_NAME}
        </GoLink>
        <button type="button" className="btn" onClick={onSeen}>
          Got it
        </button>
      </div>
    </section>
  );
}

/* ---------- the search box ---------- */

const TYPE_NOUN: Record<RecordType, [string, string]> = { companies: ["company", "companies"], engagements: ["seat", "seats"], people: ["person", "people"] };

function AskBox(p: HomeProps) {
  const [text, setText] = useState("");
  const narrow = useMedia("(max-width: 599px)");
  const q = useDeferredValue(text.trim());
  const [open, setOpen] = useState(false);
  // What the table would list for it, every company and no filter: the same search as the top bar's (what the member can see, never a locked value).
  const found = useMemo(() => {
    if (q.length < 2 || p.waiting) return null;
    const counts = {} as Record<RecordType, number>;
    let top: Row[] = [];
    for (const t of RECORD_TYPES) {
      const rows = applyFilters(rowsFor(t.key, p.infos), EMPTY_FILTERS, "all", q, p.me, true).rows;
      counts[t.key] = rows.length;
      if (t.key === "companies") top = rows.slice(0, 4);
    }
    return { counts, top };
  }, [q, p.infos, p.me, p.waiting]);
  // The Crystal Ball companies their plan names (Trial and Pro), still locked in the table: found by those names too, first.
  const named = useMemo(() => {
    const list = crystalNames(p.data).filter((x) => p.byId.get(x.id)?.c.hidden);
    return nameMatches(q, list, 4).map((x) => ({ ...x, i: p.byId.get(x.id)! }));
  }, [q, p.data, p.byId]);
  const tableTop = (found?.top ?? []).filter((r) => !named.some((x) => x.id === r.i.c.id)).slice(0, Math.max(0, 4 - named.length));
  const pages = useMemo(() => navMatches(q, p.nav), [q, p.nav]);
  const shown = open && q.length >= 2;
  const submit = () => {
    if (!text.trim()) return;
    p.onSearch(text.trim());
  };
  return (
    <div className="hm-ask" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <form
        className="hm-ask-f"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <IconSearch size={18} />
        <input
          className="hm-ask-in"
          type="search"
          value={text}
          enterKeyHint="search"
          placeholder={narrow ? "Search companies, people…" : "Search companies, seats and people"}
          aria-label="Search companies, seats and people"
          aria-expanded={shown}
          aria-controls="hm-ask-list"
          onChange={(e) => (setText(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") (setText(""), setOpen(false));
          }}
        />
        {text ? (
          <button type="button" className="hm-ask-x" aria-label="Clear search" onClick={() => setText("")}>
            <IconX size={14} />
          </button>
        ) : null}
        <button type="submit" className="btn btn-pine hm-ask-go" disabled={!text.trim()}>
          Search
        </button>
      </form>
      {shown && (
        <div className="hm-ask-list" id="hm-ask-list">
          {pages.map((it) => (
            <button key={it.key} type="button" className="hm-ask-row" onClick={() => p.onNav(it)}>
              <NavIcon name={it.icon} size={16} />
              <span>
                Go to <b>{it.label}</b>
              </span>
            </button>
          ))}
          {named.map((x) => (
            <button key={`cb-${x.id}`} type="button" className="hm-ask-row" onClick={() => p.openCompany(x.id)}>
              <CompanyLogo name="" domain={null} hidden seed={x.id} />
              <span className="hm-ask-co">
                <b>{x.name}</b>
                <span className="hm-ask-facts">{[`In ${yourFeature}`, factsOf(x.i)].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          ))}
          {tableTop.map((r) => (
            <button key={r.key} type="button" className="hm-ask-row" onClick={() => p.openCompany(r.i.c.id)}>
              <CompanyLogo name={r.i.c.name} domain={r.i.c.iconDomain} />
              <span className="hm-ask-co">
                <b>{r.i.c.name}</b>
                <span className="hm-ask-facts">{factsOf(r.i)}</span>
              </span>
            </button>
          ))}
          <button type="button" className="hm-ask-row hm-ask-all" onClick={submit}>
            <IconSearch size={16} />
            <span>
              {found ? (
                <>
                  Search the table for <b>{text.trim()}</b>
                  <span className="hm-ask-facts num">
                    {" "}
                    ·{" "}
                    {RECORD_TYPES.map((t) => plural(found.counts[t.key], TYPE_NOUN[t.key][0], TYPE_NOUN[t.key][1])).join(", ")}
                  </span>
                </>
              ) : (
                <>
                  Search the table for <b>{text.trim()}</b>
                </>
              )}
            </span>
            <kbd className="hm-kbd">Enter</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Get started ---------- */

function GetStarted({ steps, onStep, onHide }: { steps: CheckStep[]; onStep: (k: CheckStep["key"]) => void; onHide: () => void }) {
  const done = steps.filter((s) => s.done).length;
  const all = done === steps.length;
  if (all)
    return (
      <div className="hm-gs hm-gs-done" role="status">
        <span className="hm-gs-check" aria-hidden>
          ✓
        </span>
        <span>You&apos;re set up: every Get started step is done.</span>
        <button type="button" className="tp-flink" onClick={onHide}>
          Hide
        </button>
      </div>
    );
  return (
    <section className="hm-gs" aria-labelledby="hm-gs-h">
      <div className="hm-gs-head">
        <h2 className="hm-h2" id="hm-gs-h">
          Get started
        </h2>
        <span className="hm-gs-n num">
          {done} of {steps.length} done
        </span>
        <span className="hm-gs-bar" aria-hidden>
          <span style={{ width: `${(done / steps.length) * 100}%` }} />
        </span>
      </div>
      <ol className="hm-gs-steps">
        {steps.map((s, k) => (
          <li key={s.key}>
            <button type="button" className={`hm-gs-step${s.done ? " done" : ""}`} onClick={() => onStep(s.key)} aria-label={`${s.label}, ${s.done ? "done" : s.hint}`}>
              <span className="hm-gs-dot num" aria-hidden>
                {s.done ? "✓" : k + 1}
              </span>
              <span className="hm-gs-t">
                <span className="hm-gs-l">{s.label}</span>
                <span className="hm-gs-hint">{s.done ? "Done" : s.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- saved views ---------- */

function SavedViewsTable({ views, onOpen, onEmail, table, waiting }: { views: HomeView[]; onOpen: (v: SavedViewRec) => void; onEmail: (v: SavedViewRec, on: boolean) => void; table: Go; waiting: boolean }) {
  const [tab, setTab] = useState<"all" | "recent">("all");
  const recentCut = Date.now() - 14 * 86_400_000;
  const list =
    tab === "all"
      ? views
      : views
          .filter((x) => x.opened && Date.parse(x.opened) >= recentCut)
          .slice()
          .sort((a, b) => (b.opened ?? "").localeCompare(a.opened ?? ""));
  const n = (x: number | null) => (x === null ? <span className="td-skel hm-skel-n" aria-label="Counting" /> : x.toLocaleString("en-US"));
  return (
    <section className="hm-sec hm-views" aria-labelledby="hm-views-h">
      <div className="hm-sec-head">
        <h2 className="hm-h2" id="hm-views-h">
          Your saved views
        </h2>
        {views.length > 0 && (
          <div className="hm-tabs" role="tablist" aria-label="Which views">
            {(["all", "recent"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`hm-tab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
                {t === "all" ? "All" : "Recent"}
              </button>
            ))}
          </div>
        )}
      </div>
      {views.length === 0 ? (
        <div className="hm-empty">
          <Spot name="noViews" size={64} className="hm-empty-art" />
          <p>Save a view of the table to get it here and by email each week.</p>
          <GoLink to={table} className="btn">
            Open the table
          </GoLink>
        </div>
      ) : list.length === 0 ? (
        <p className="hm-quiet">You haven&apos;t opened a saved view in the last two weeks.</p>
      ) : (
        <div className="hm-tablewrap">
          <table className="hm-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className="hm-num">
                  Matches
                </th>
                <th scope="col" className="hm-num">
                  <span className="hm-long">New since last visit</span>
                  <span className="hm-short">
                    New
                  </span>
                </th>
                <th scope="col">
                  <span className="hm-long">Weekly email</span>
                  <span className="hm-short">
                    Email
                  </span>
                </th>
                <th scope="col" className="hm-col-opened">
                  Last opened
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.v.id}>
                  <th scope="row">
                    <GoLink to={{ href: x.href, go: () => onOpen(x.v) }} className="hm-vname">
                      <NavIcon name="view" size={15} />
                      <span>{x.v.name}</span>
                    </GoLink>
                    {x.about ? <span className="hm-vabout">{x.about}</span> : null}
                  </th>
                  <td className="hm-num num">{n(x.matches)}</td>
                  <td className="hm-num num">{x.fresh === null ? n(null) : x.fresh > 0 ? <span className="hm-fresh">{x.fresh} new</span> : <span className="hm-zero">0</span>}</td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={x.v.email}
                      aria-label={`Weekly email for ${x.v.name}`}
                      className={`hm-switch${x.v.email ? " on" : ""}`}
                      onClick={() => onEmail(x.v, !x.v.email)}
                    >
                      <span className="hm-switch-k" aria-hidden />
                      <span className="hm-switch-l">{x.v.email ? "On" : "Off"}</span>
                    </button>
                  </td>
                  <td className="hm-col-opened hm-muted">{x.opened ? timeAgo(x.opened) : waiting ? "" : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
