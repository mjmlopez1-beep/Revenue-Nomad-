"use client";

/**
 * Home (page "today", the address / with no place in it): always a next click.
 *
 *   Get started, while a new member has steps left (one line once they are done)
 *   the one nudge (nudges.ts), and the trial-ended card
 *   "Hey Jordan", one line on what is new, and one search box (Enter opens the table on that text)
 *   four quick actions: Find companies, Your Crystal Ball, Add what you know, Fill in your seats
 *   Your best leads today: Crystal Ball's top company (Today.tsx LeadCard) and the next three
 *   Since your last visit: each count a row that opens it
 *   Your saved views: a small table (matches, new, the weekly email, last opened)
 *
 * It paints from GET ?today=1 before the whole table is here (Today.tsx useTodayData): what needs
 * the whole table (the saved views' counts, the seats card, the search's matches) waits a moment
 * in its own place, at its own size, so nothing moves when it lands.
 */
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Me, SavedViewRec } from "@/lib/tableTypes";
import { FEATURE_NAME, YOUR_FEATURE } from "@/lib/radar/types";
import { CompanyLogo, IconChevron, IconSearch, IconX, LockedName, timeAgo } from "../ui/shared";
import { EMPTY_FILTERS, RECORD_TYPES, applyFilters, rowsFor, type CheckStep, type CoInfo, type RecordType, type Row } from "./model";
import { plural, useMedia } from "./hooks";
import { LeadAction, LeadCard, TrialEnded, factsOf, leadWhat, type TodayData } from "./Today";
import { sinceWords } from "./todayModel";
import { NavIcon } from "./Sidebar";
import { navMatches, type NavIcon as NavIconName, type NavItem } from "./navModel";
import "./home.css";

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
 * Home's first paint is its top: the greeting, the search, the four cards and the best lead. The
 * rest (the next leads, since your last visit, the saved views) comes on the next frame, the first
 * time Home is drawn on a visit, so a phone paints sooner. Later visits to Home draw it all at once.
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
  // The leads: Crystal Ball's companies in the member's table, in its order (the top one is the card).
  const leads = useMemo(() => {
    const out: { i: CoInfo; row: NonNullable<TodayData["rows"]>[number] }[] = [];
    for (const r of data?.rows ?? []) {
      const i = byId.get(r.id);
      if (i) out.push({ i, row: r });
    }
    return out;
  }, [data, byId]);
  const loading = (!data && !p.failed) || (p.waiting && !leads.length);
  const lead = leads[0] ?? (!loading && p.firstRow ? { i: byId.get(p.firstRow.i.c.id) ?? p.firstRow.i, row: null } : null);
  const next = leads.slice(1, 4);
  const dayN = data?.newCount ?? 0;
  const since = data?.since ?? null;
  const sinceLow = p.sinceAt ? sinceWords(p.sinceAt).replace(/^Since/, "since") : null;

  // The greeting's line: what is new, in one sentence.
  const sub = (() => {
    const n = since && p.sinceAt ? since.radar : 0;
    if (n > 0 && sinceLow) return `${plural(n, "new company", "new companies")} in your ${FEATURE_NAME} ${sinceLow}.`;
    if (dayN > 0) return `${plural(dayN, "company", "companies")} in your ${FEATURE_NAME} today.`;
    if (!me.function) return "Tell us your function and Merlin finds the companies likely to hire you next.";
    if (loading) return "Finding your best leads today.";
    return `Nothing new in your ${FEATURE_NAME} today. Your table has every company.`;
  })();

  const rows = [
    { key: "radar", n: since?.radar ?? 0, text: (n: number) => `${plural(n, "new company", "new companies")} in ${FEATURE_NAME}`, to: p.radar, icon: "radar" as NavIconName },
    { key: "roles", n: since?.roles ?? 0, text: (n: number) => `${plural(n, "role")} opened in ${me.function ?? "your function"}`, to: p.roles, icon: "hiring" as NavIconName },
    { key: "follows", n: since?.follows ?? 0, text: (n: number) => `${n} of your follows changed`, to: p.follows, icon: "following" as NavIconName },
    { key: "unread", n: p.unread, text: (n: number) => `${plural(n, "unread conversation")}`, to: p.messages, icon: "messages" as NavIconName },
  ];
  const sinceRows = rows.filter((r) => r.n > 0 && (r.key === "unread" || p.sinceAt));

  return (
    <div className="hm">
      {p.nudge ? <div className="hm-nudge">{p.nudge}</div> : null}
      <header className="hm-hello">
        <h1 className="hm-h1">Hey {firstName(me.name)}</h1>
        <p className="hm-sub">{sub}</p>
      </header>
      {p.steps && <GetStarted steps={p.steps} onStep={p.onStep} onHide={p.onHideSteps} />}
      {p.trialEnded ? <TrialEnded onSeePro={p.onSeePro} onSeen={p.onTrialSeen} /> : null}
      <AskBox {...p} />

      <ul className="hm-cards" aria-label="Start here">
        <li>
          <GoLink to={p.find} className="hm-card">
            <span className="hm-card-ico" aria-hidden>
              <NavIcon name="companies" size={20} />
            </span>
            <span className="hm-card-t">Find companies</span>
            <span className="hm-card-p">Open your table, ranked for you.</span>
          </GoLink>
        </li>
        <li>
          <GoLink to={p.radar} className="hm-card">
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

      <div className="hm-grid">
        <section className="hm-sec hm-leads" aria-labelledby="hm-leads-h">
          <div className="hm-sec-head">
            <h2 className="hm-h2" id="hm-leads-h">
              Your best leads today
            </h2>
            {dayN > 0 && (
              <GoLink to={p.radar} className="hm-more">
                See all {dayN} in {FEATURE_NAME} <IconChevron dir="right" size={13} />
              </GoLink>
            )}
          </div>
          {loading && !lead ? (
            <section className="td-card td-card-skel" aria-busy>
              <span className="sr-only">Finding your best lead today</span>
              <span className="td-skel" style={{ width: "40%" }} />
              <span className="td-skel" style={{ width: "70%", height: 20 }} />
              <span className="td-skel" style={{ width: "55%" }} />
              <span className="td-skel" style={{ width: "35%", height: 44 }} />
            </section>
          ) : lead ? (
            <LeadCard key={lead.i.c.id} i={lead.i} row={lead.row} me={me} onOpen={() => p.openCompany(lead.i.c.id)} title={lead.row ? "Top of your Crystal Ball" : "Top of your table"} />
          ) : (
            <section className="td-card">
              <p className="td-none">Nothing new in your profile today. Browse every company, or widen who you want to work with in Your profile.</p>
            </section>
          )}
          {rest && next.length > 0 && (
            <ul className="hm-leadrows" aria-label={`More from ${FEATURE_NAME}`}>
              {next.map(({ i, row }) => (
                <li key={i.c.id} className="hm-lrow">
                  <button type="button" className="hm-lrow-open" onClick={() => p.openCompany(i.c.id)}>
                    <CompanyLogo name={i.c.hidden ? "" : i.c.name} domain={i.c.hidden ? null : i.c.iconDomain} hidden={i.c.hidden} seed={i.c.id} />
                    <span className="hm-lrow-id">
                      <span className="hm-lrow-n">{i.c.hidden ? row.name ?? <LockedName seed={i.c.id} /> : i.c.name}</span>
                      <span className="hm-lrow-p">{leadWhat(i, row) ?? factsOf(i)}</span>
                    </span>
                  </button>
                  <span className="hm-lrow-act">
                    <LeadAction i={i} onOpen={() => p.openCompany(i.c.id)} compact />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

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
            <p className="hm-quiet">{p.sinceAt ? `Nothing new ${sinceLow}. No new companies, roles or messages.` : "This is your first visit. New companies, roles and messages show here next time."}</p>
          )}
        </section>
        )}
      </div>

      {rest && <SavedViewsTable views={p.views} onOpen={p.onOpenView} onEmail={p.onEmailView} table={p.table} waiting={p.waiting} />}
      {rest && p.events}
    </div>
  );
}

/* ---------- the search box ---------- */

const TYPE_NOUN: Record<RecordType, [string, string]> = { companies: ["company", "companies"], engagements: ["seat", "seats"], people: ["person", "people"] };

function AskBox(p: HomeProps) {
  const [text, setText] = useState("");
  const narrow = useMedia("(max-width: 599px)");
  const q = useDeferredValue(text.trim());
  const [open, setOpen] = useState(false);
  // What the table would list for it: the same search as the top bar's (what the member can see, never a locked value).
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
          placeholder={narrow ? "Search, or ask Merlin…" : "Search companies, seats and people, or ask Merlin…"}
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
          {found?.top.map((r) => (
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
