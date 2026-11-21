"use client";

/**
 * Your three moves today (Home): up to three companies from the member's Crystal Ball, each a row
 * of three parts. The company (why now, how likely or "Hiring now"), the way in (someone they
 * already know there, the fractional who held a seat, an open role, or nothing on file yet), and
 * their move: one verb with one button, then Done and Snooze.
 *
 * The server picks the three (GET ?today=1's `moves`, lib/movesView.ts). Each row is built here
 * from that and from the member's own record of the company (lib/moves.ts buildMove), so opening
 * the company or its seat holder changes the row at once, and nothing shows that their table,
 * their Crystal Ball and Your network don't show already. Done and Snooze are theirs alone, kept
 * on the server (the "move" action), which answers with the next best in place.
 *
 * A locked company opens here exactly as it does from Crystal Ball (Today.tsx LeadAction: by plan,
 * Free's one a day, then "Upgrade to open more"). People cost what they cost.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Me } from "@/lib/tableTypes";
import { CRYSTAL_USED_LINE, FEATURE_NAME } from "@/lib/radar/types";
import { MOVES_MAX, buildMove, holderOnFile, knowLine, postedWords, type Move, type MoveWire, type MovesWire } from "@/lib/moves";
import { webLink } from "@/lib/links";
import { CompanyLogo, IconBriefcase, IconChevron, IconExternal, IconLock, IconPencil, LockedName, initials, useToast } from "../ui/shared";
import type { CoInfo } from "./model";
import { useUi } from "./ui";
import { LeadAction } from "./Today";
import "./moves.css";

/*
 * The note's sheet, its templates and the voice load on their own: Home paints without them, and
 * they are fetched once Home's first paint is over, so Draft opens at once.
 */
const loadNote = () => import("./MoveNote");
const NoteSheet = dynamic(() => loadNote().then((m) => m.NoteSheet), { ssr: false });

/** A place on Home: a link where it is one, else a button (Home.tsx Go). */
interface Go {
  href?: string;
  go: () => void;
}

const COUNT_WORD = ["", "", "two ", "three "];

/** The section's title for this many moves: "Your three moves today", "Your move today". */
export const movesTitle = (n: number) => (n === 1 ? "Your move today" : `Your ${COUNT_WORD[Math.min(n, MOVES_MAX)] ?? ""}moves today`);

export function MovesSection({
  me,
  byId,
  wire,
  onWire,
  loading,
  rest,
  dayN,
  integrations,
  onClaude,
  openCompany,
  fallback,
  link,
}: {
  me: Me;
  byId: Map<string, CoInfo>;
  /** Today's moves as the server picked them, or last answered (null while they are on their way). */
  wire: MovesWire | null;
  /** The server's answer to Done, Snooze or Undo: it takes the place of the one the page opened with. */
  onWire: (w: MovesWire) => void;
  loading: boolean;
  /** Home's first paint is over (Home.tsx useAfterFirstPaint): until then only the first move is drawn, so a phone paints sooner. */
  rest: boolean;
  /** Companies in Crystal Ball's day, for "All 14 in Crystal Ball". */
  dayN: number;
  integrations: Go;
  /** How their own Claude learns their voice: the Claude connector's page. */
  onClaude: () => void;
  openCompany: (id: string) => void;
  /** What stands in for the moves when there are none (the top of their table, or a line). */
  fallback: ReactNode;
  /** The "All n in Crystal Ball" link, drawn by Home (its own link component). */
  link: (children: ReactNode) => ReactNode;
}) {
  const ui = useUi();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const now = wire;
  const moves = useMemo(() => {
    const out: { m: Move; w: MoveWire; i: CoInfo }[] = [];
    for (const w of now?.list ?? []) {
      const i = byId.get(w.id);
      if (i) out.push({ m: buildMove(i.c, w.row, w.know, me), w, i });
    }
    return out.slice(0, MOVES_MAX);
  }, [now, byId, me]);
  const drafting = note ? moves.find((x) => x.m.id === note) ?? null : null;
  // The note's sheet is fetched while the member reads their moves.
  useEffect(() => {
    if (!rest || !moves.length) return;
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    const go = () => void loadNote().catch(() => {});
    const t = setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 2000 }) : go()), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest, moves.length > 0]);
  // A note's move left the list (done in another tab): its sheet closes.
  useEffect(() => {
    if (note && !drafting) setNote(null);
  }, [note, drafting]);

  const log = async (id: string, op: "done" | "snooze" | "undo", quiet = false) => {
    if (busy) return;
    setBusy(id);
    const r = await ui.act({ type: "move", id, op }, { quiet: true });
    setBusy(null);
    if (!r.ok) return;
    if (r.moves) onWire(r.moves);
    if (quiet || op === "undo") return void (op === "undo" && toast(r.message));
    toast(r.message, false, { action: { label: "Undo", onClick: () => void log(id, "undo") } });
  };

  const n = moves.length;
  const month = now?.month ?? 0;
  const fn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  const all = link(
    <>
      All {dayN} in {FEATURE_NAME} <IconChevron dir="right" size={13} />
    </>,
  );
  return (
    <section className="hm-sec mv" aria-labelledby="mv-h">
      <div className="mv-head">
        <h2 className="hm-h2" id="mv-h">
          {loading && !n ? "Your moves today" : movesTitle(n)}
        </h2>
        {n > 0 && <span className="mv-head-s">{fn ? `Companies likely to hire a fractional ${fn} leader, and your best way in to each` : "Companies likely to hire you next, and your best way in to each"}</span>}
        <span className="mv-sp" />
        {dayN > 0 && <span className="mv-all mv-all-top">{all}</span>}
      </div>
      {loading && !n ? (
        <div className="mv-card mv-skel" aria-busy>
          <span className="sr-only">Finding your moves for today</span>
          {[0, 1, 2].map((k) => (
            <div key={k}>
              <span className="td-skel" style={{ width: "38%" }} />
              <span className="td-skel" style={{ width: "72%", height: 22 }} />
              <span className="td-skel" style={{ width: "88%" }} />
              <span className="td-skel" style={{ width: "46%", height: k === 2 ? 40 : 12 }} />
            </div>
          ))}
        </div>
      ) : n ? (
        <ol className="mv-list">
          {(rest ? moves : moves.slice(0, 1)).map(({ m, w, i }, k) => (
            <li key={m.id}>
              <MoveCard
                n={k + 1}
                m={m}
                w={w}
                i={i}
                me={me}
                busy={busy === m.id}
                onOpen={() => openCompany(m.id)}
                onDraft={() => setNote(m.id)}
                onDone={() => void log(m.id, "done")}
                onSnooze={() => void log(m.id, "snooze")}
              />
            </li>
          ))}
        </ol>
      ) : (
        <>
          <p className="mv-none">
            {month > 0 && dayN > 0
              ? "That's today's moves done. Tomorrow's arrive with the morning's Crystal Ball."
              : "Nothing strong today. No company in your Crystal Ball has a move worth your ten minutes."}
          </p>
          {fallback}
        </>
      )}
      {/* A phone keeps its first screen for the first move: the link to the whole day sits under the moves there. */}
      {dayN > 0 && <div className="mv-all mv-all-foot">{all}</div>}
      {(month > 0 || now?.google === "connect" || !!now?.warm) && (
        <div className="mv-foot">
          {month > 0 && (
            <p className="mv-tally num">
              This month: <b>{month}</b> {month === 1 ? "move" : "moves"} done
            </p>
          )}
          {now?.google === "connect" && (
            <p className="mv-google">
              <GoLink to={integrations}>Connect Google to see who you already know at these companies</GoLink>
            </p>
          )}
          {/* [google network] Beyond today's moves: every company they know that is likely to hire them. */}
          {now?.google === "on" && !!now.warm && (
            <p className="mv-google">
              <button type="button" className="mv-link" onClick={() => ui.openPage("network")}>
                {now.warm === 1 ? "Your warm path" : `Your ${now.warm} warm paths`} into companies likely to hire you
              </button>
            </p>
          )}
        </div>
      )}
      {drafting && (
        <NoteSheet
          key={drafting.m.id}
          m={drafting.m}
          row={drafting.w.row}
          me={me}
          onClose={() => setNote(null)}
          onSent={() => {
            const id = drafting.m.id;
            setNote(null);
            void log(id, "done");
          }}
          onClaude={() => {
            setNote(null);
            onClaude();
          }}
        />
      )}
    </section>
  );
}

const ownClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
function GoLink({ to, children }: { to: Go; children: ReactNode }) {
  if (!to.href)
    return (
      <button type="button" className="mv-link" onClick={to.go}>
        {children}
      </button>
    );
  return (
    <a
      href={to.href}
      className="mv-link"
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

function MoveCard({
  n,
  m,
  w,
  i,
  me,
  busy,
  onOpen,
  onDraft,
  onDone,
  onSnooze,
}: {
  n: number;
  m: Move;
  w: MoveWire;
  i: CoInfo;
  me: Me;
  busy: boolean;
  onOpen: () => void;
  onDraft: () => void;
  onDone: () => void;
  onSnooze: () => void;
}) {
  const ui = useUi();
  const c = i.c;
  const seatBusy = m.way.kind === "holder" && (ui.busy.has(`${m.way.seatId}.operator`) || ui.busy.has(`${m.way.seatId}.role`));
  const postBusy = m.way.kind === "role" && ["posting", "rate", "hours"].some((f) => ui.busy.has(`${(m.way as { seatId: string }).seatId}.${f}`));
  const posting = m.open && m.open.posting && m.open.posting !== "locked" ? webLink(m.open.posting) : null;
  // The one button.
  let main: ReactNode;
  if (m.do === "open") main = <LeadAction i={i} row={w.row} onOpen={onOpen} cls="mv-main" />;
  else if (m.do === "record")
    main = (
      <button type="button" className="btn btn-pine mv-main" onClick={onOpen}>
        Open
      </button>
    );
  else if (m.do === "seeHolder" && m.way.kind === "holder") {
    const seatId = m.way.seatId;
    main = (
      <button type="button" className="btn btn-pine mv-main" disabled={seatBusy} aria-busy={seatBusy} onClick={() => void ui.unlock({ entity: "engagement", id: seatId, field: "operator" })}>
        {seatBusy ? "Unlocking" : "See who held it · 1 credit"}
      </button>
    );
  } else if (m.do === "seePosting" && m.way.kind === "role") {
    const seatId = m.way.seatId;
    main = (
      <button type="button" className="btn btn-pine mv-main" disabled={postBusy} aria-busy={postBusy} onClick={() => void ui.unlock({ entity: "engagement", id: seatId, field: "posting" })}>
        {postBusy ? "Unlocking" : "See the posting · 1 credit"}
      </button>
    );
  } else
    main = (
      <button type="button" className="btn btn-pine mv-main" onClick={onDraft}>
        <IconPencil size={14} /> Draft
      </button>
    );
  return (
    <section className="mv-card" aria-label={`Move ${n}: ${m.title}`}>
      <div className="mv-co">
        <span className="mv-label mv-row">
          {m.hiring ? (
            <>
              Hiring now{" "}
              <span className="chip chip-ember-outline mv-chip">
                <span className="live-dot" aria-hidden /> Open role
              </span>
            </>
          ) : (
            <>
              Likely to hire {m.band ? <span className={`mv-band mv-band-${m.band.toLowerCase()}`}>{m.band}</span> : null}
            </>
          )}
        </span>
        <button type="button" className="mv-co-open" onClick={onOpen} aria-label={m.name ? `Open ${m.name}` : "Look at this company"}>
          <CompanyLogo name={c.hidden ? "" : c.name} domain={c.hidden ? null : c.iconDomain} hidden={c.hidden} seed={c.id} size="lg" />
          <span className="mv-co-id">
            <span className="mv-name">{m.name ?? <LockedName seed={c.id} />}</span>
            {m.facts ? <span className="mv-facts">{m.facts}</span> : null}
          </span>
        </button>
        {m.why ? <p className="mv-why">{m.why}</p> : null}
      </div>
      <div className="mv-way">
        <WayIn m={m} companyId={c.id} />
      </div>
      <div className="mv-do">
        <span className="mv-label">Your move</span>
        <span className="mv-do-t">{m.title}</span>
        <p className="mv-do-p">{m.do === "open" && me.crystal === "used" ? CRYSTAL_USED_LINE : m.line}</p>
        <div className="mv-acts">
          {main}
          {/* Done and Snooze stay side by side, under a long button when the row is too narrow for all three. */}
          <span className="mv-later">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onDone} aria-label={`Done: ${m.title}`}>
              Done
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSnooze} aria-label={`Snooze ${m.name ?? "this company"} for 7 days`}>
              Snooze
            </button>
          </span>
        </div>
        {posting && m.do === "reply" ? (
          <a className="mv-link mv-post" href={posting} target="_blank" rel="noreferrer">
            Open the posting <IconExternal size={11} />
          </a>
        ) : null}
      </div>
    </section>
  );
}

/** The middle of a move: the best way in on file. */
function WayIn({ m, companyId }: { m: Move; companyId: string }) {
  const ui = useUi();
  const way = m.way;
  if (way.kind === "know") {
    const p = way.person;
    return (
      <>
        <span className="mv-label">You know</span>
        <div className="mv-who">
          <span className="mv-av" aria-hidden>
            {initials(p.name)}
          </span>
          <div className="mv-who-t">
            <span className="mv-who-n">{p.name}</span>
            {(p.title || p.dm) && (
              <span className="mv-who-s">
                {p.title}
                {p.title && p.dm ? " · " : ""}
                {p.dm ? <span className="mv-dm">Decision maker</span> : null}
              </span>
            )}
          </div>
        </div>
        <p className="mv-who-line">
          <span className={`mv-warm mv-warm-${p.warmth.toLowerCase()}`}>{p.warmth}</span>
          <span>{knowLine(p)}</span>
        </p>
      </>
    );
  }
  if (way.kind === "holder") {
    const seat = way.fn && way.fn !== "Other" ? `${way.fn} seat` : "seat";
    if (!way.name)
      return (
        <>
          <span className="mv-label">Your way in</span>
          <div className="mv-who">
            <span className="mv-av mv-av-quiet" aria-hidden>
              <IconLock size={16} />
            </span>
            <div className="mv-who-t">
              <span className="mv-who-x">{holderOnFile(way.fn)}</span>
            </div>
          </div>
          <p className="mv-who-line mv-quiet">{m.hidden ? "Opens after the company." : "1 credit shows who, with the role they held."}</p>
        </>
      );
    return (
      <>
        <span className="mv-label">Your way in</span>
        <div className="mv-who">
          <span className="mv-av" aria-hidden>
            {initials(way.name)}
          </span>
          <div className="mv-who-t">
            <span className="mv-who-n">{way.name}</span>
            <span className="mv-who-s">{way.role ? `${way.role}, their ${seat}` : `Held their ${seat}`}</span>
          </div>
        </div>
        <p className="mv-who-line">
          {way.member ? <span className="mv-warm mv-warm-warm">On Merlin</span> : <span className="mv-warm mv-warm-fading">Not on Merlin yet</span>}
          <span>{way.member ? "Message them there" : way.invite?.at ? "You invited them" : way.invite ? "Your note invites them" : "Held the seat"}</span>
        </p>
      </>
    );
  }
  if (way.kind === "role") {
    const when = postedWords(way.since);
    return (
      <>
        <span className="mv-label">Your way in</span>
        <div className="mv-who">
          <span className="mv-av mv-av-quiet" aria-hidden>
            <IconBriefcase size={18} />
          </span>
          <div className="mv-who-t">
            <span className="mv-who-n">{way.title}</span>
            <span className="mv-who-s">{["The open role", when].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <p className="mv-who-line mv-quiet">{m.hidden ? "Its posting opens with the company." : way.posting === "locked" ? "Its posting is on file." : way.posting ? "Apply through its posting." : "No posting link on file."}</p>
      </>
    );
  }
  return (
    <>
      <span className="mv-label">Your way in</span>
      <p className="mv-who-x mv-none-t">No way in on file yet</p>
      {m.hidden ? (
        <p className="mv-who-line mv-quiet">Open the company to see who decides.</p>
      ) : (
        <button type="button" className="mv-link mv-add" onClick={() => ui.openAdd({ companyId, mode: "person" })}>
          Add who you know <span className="plus1">+1</span>
        </button>
      )}
    </>
  );
}
