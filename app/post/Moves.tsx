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
 * Free's one a day, then the ordinary "Unlock · 2 credits"), and so does a click on its name. People
 * cost what they cost.
 *
 * An open role in the member's function shows itself once its company is open: "Your move" names the
 * role with its posted rate and hours, and "Open the posting" is the button. Opening the posting (or
 * "Then: …") moves the card on to the next step, the move lib/moves.ts picks (remembered in this
 * browser, per role).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Me } from "@/lib/tableTypes";
import { FEATURE_NAME } from "@/lib/radar/types";
import { MOVES_MAX, buildMove, buyerWhat, holderOnFile, knowLine, moveSent, postedWords, type Move, type MoveWire, type MovesWire } from "@/lib/moves";
import { webLink } from "@/lib/links";
import { CompanyLogo, IconBriefcase, IconChevron, IconExternal, IconLock, IconPencil, LockedName, initials, useToast } from "../ui/shared";
import type { CoInfo } from "./model";
import { SecondaryCtx, useUi } from "./ui";
import { LeadAction } from "./Today";
import { useCrystalClick } from "./CrystalOpen";
import { CRYSTAL_USED_UNLOCK, roleTermsLine, TOMORROW_LINE } from "./todayModel";
import { loadPipeline } from "./pipelineStore";
import "./moves.css";
import { Chip, WarmthChip } from "../ui/system";

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

/** The open roles whose posting the member opened from a move, in this browser: the card moves on to its next step. */
const POSTING_SEEN = "tp_posting_seen";
function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(POSTING_SEEN) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(-50) : [];
  } catch {
    return [];
  }
}
function usePostingSeen(seatId: string | null): [boolean, () => void] {
  const [seen, setSeen] = useState(false);
  useEffect(() => setSeen(!!seatId && readSeen().includes(seatId)), [seatId]);
  const mark = useCallback(() => {
    if (!seatId) return;
    setSeen(true);
    try {
      localStorage.setItem(POSTING_SEEN, JSON.stringify([...readSeen().filter((x) => x !== seatId), seatId].slice(-50)));
    } catch {}
  }, [seatId]);
  return [seen, mark];
}

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
  crystalN = 0,
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
  /** Nothing new this week, but Crystal Ball holds this many companies (Home's crystalN): the empty line says so and links it. */
  crystalN?: number;
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
  // The moves as they stand now, for a note that went from Gmail after its sheet closed (Approve and send).
  const nowRef = useRef(now);
  nowRef.current = now;
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

  // The note was used (Open in Gmail, Copy): when its sheet closes, the move is sent (Your pipeline, lib/pipeline.ts).
  const used = useRef(false);
  const log = async (id: string, op: "done" | "snooze" | "undo" | "sent", quiet = false, m?: Move) => {
    if (busy) return;
    setBusy(id);
    const r = await ui.act(op === "sent" ? { type: "move", id, op, ...(m ? sentOf(m) : {}) } : { type: "move", id, op }, { quiet: true });
    setBusy(null);
    if (!r.ok) return;
    if (r.moves) onWire(r.moves);
    if (op === "sent" || op === "undo") void loadPipeline(true);
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
                onDraft={() => ((used.current = false), setNote(m.id))}
                onDone={() => void log(m.id, "done")}
                onSnooze={() => void log(m.id, "snooze")}
              />
            </li>
          ))}
        </ol>
      ) : (
        <>
          <p className="mv-none">
            {month > 0 && dayN > 0 ? (
              "That's today's moves done. Tomorrow's arrive with the morning's Crystal Ball."
            ) : crystalN > 0 ? (
              <>
                Your {FEATURE_NAME} has {crystalN === 1 ? "1 company" : `${crystalN} companies`}.{" "}
                {link(
                  <>
                    Open one to start <IconChevron dir="right" size={13} />
                  </>,
                )}
              </>
            ) : (
              "Nothing strong today. No company in your Crystal Ball has a move worth your ten minutes."
            )}
          </p>
          {fallback}
        </>
      )}
      {/* A phone keeps its first screen for the first move: the link to the whole day sits under the moves there. */}
      {dayN > 0 && <div className="mv-all mv-all-foot">{all}</div>}
      {(month > 0 || now?.google === "connect" || !!now?.warm || (fn && (n > 0 || month > 0))) && (
        <div className="mv-foot">
          {fn && (n > 0 || month > 0) && <p className="mv-tally mv-tomorrow">{TOMORROW_LINE}</p>}
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
          onClose={() => {
            setNote(null);
            if (used.current) void log(drafting.m.id, "sent", false, drafting.m);
            used.current = false;
          }}
          onUsed={() => (used.current = true)}
          sendAs={{
            // Sent from Gmail: the server marks the move sent (the pipeline at Sent, as Mark as sent does); here it leaves today's list.
            effect: { type: "move", id: drafting.m.id, op: "sent", ...sentOf(drafting.m), channel: drafting.m.do === "intro" ? "intro" : "email" },
            kind: "move",
            onGmailSent: () => {
              const w = nowRef.current;
              if (w) onWire({ ...w, list: w.list.filter((x) => x.id !== drafting.m.id), month: (w.month ?? 0) + 1 });
              void loadPipeline(true);
            },
          }}
          onSent={(channel) => {
            const m = drafting.m;
            used.current = false;
            setNote(null);
            void log(m.id, "sent", false, channel === "merlin" ? { ...m, do: "holderMessage" } : m);
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

/** What a sent move tells the pipeline (lib/moves.ts moveSent): someone they know, the seat holder, the buyer, or an open role's hiring team. */
const sentOf = (m: Move) => moveSent(m);

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
  const crystalClick = useCrystalClick();
  /*
   * The open role in their function, once the company is open: its title, posted rate and hours, and
   * "Open the posting" lead, until the member opens it (or skips to the next step).
   */
  const role = m.open && !m.hidden ? m.open : null;
  const roleSeat = role ? i.engs.find((e) => e.id === role.seatId) ?? null : null;
  const roleTerms = roleSeat ? roleTermsLine(roleSeat.cells) : null;
  const roleLink = role && role.posting && role.posting !== "locked" ? webLink(role.posting) : null;
  const [roleSeen, markRoleSeen] = usePostingSeen(role ? role.seatId : null);
  const roleStep = !!role && !roleSeen && (!!roleLink || role.posting === "locked");
  const roleBusy = !!role && ["posting", "rate", "hours"].some((f) => ui.busy.has(`${role.seatId}.${f}`));
  // What comes after the posting: the note for it, or the move at the company (its seat holder, someone they know).
  const nextTitle = m.do === "reply" ? "Draft your note" : m.do === "seePosting" ? null : m.title;
  const seatBusy = m.way.kind === "holder" && (ui.busy.has(`${m.way.seatId}.operator`) || ui.busy.has(`${m.way.seatId}.role`));
  // The open role's posting: the way in's own role, or the role beside a buyer.
  const postSeat = m.way.kind === "role" ? m.way.seatId : m.open?.seatId ?? null;
  const postBusy = !!postSeat && ["posting", "rate", "hours"].some((f) => ui.busy.has(`${postSeat}.${f}`));
  const posting = m.open && m.open.posting && m.open.posting !== "locked" ? webLink(m.open.posting) : null;
  // The one button: pine on the first move, outline on the others (one filled button on Home).
  const pine = n > 1 ? "btn-outline" : "btn-pine";
  let main: ReactNode;
  if (roleStep && role)
    main = roleLink ? (
      <a className={`btn ${pine} mv-main`} href={roleLink} target="_blank" rel="noreferrer" onClick={markRoleSeen}>
        Open the posting <IconExternal size={12} />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      <button type="button" className={`btn ${pine} mv-main`} disabled={roleBusy} aria-busy={roleBusy} onClick={() => void ui.unlock({ entity: "engagement", id: role.seatId, field: "posting" })}>
        {roleBusy ? "Unlocking" : "See the posting · 1 credit"}
      </button>
    );
  else if (m.do === "open") main = <LeadAction i={i} row={w.row} onOpen={onOpen} cls="mv-main" />;
  else if (m.do === "record")
    main = (
      <button type="button" className={`btn ${pine} mv-main`} onClick={onOpen}>
        Open
      </button>
    );
  else if (m.do === "seeHolder" && m.way.kind === "holder") {
    const seatId = m.way.seatId;
    main = (
      <button type="button" className={`btn ${pine} mv-main`} disabled={seatBusy} aria-busy={seatBusy} onClick={() => void ui.unlock({ entity: "engagement", id: seatId, field: "operator" })}>
        {seatBusy ? "Unlocking" : "See who held it · 1 credit"}
      </button>
    );
  } else if (m.do === "seeBuyer" && m.way.kind === "buyer") {
    // The buyer's name and title: one purchase, 1 credit, as on the record.
    const personId = m.way.personId;
    const buyerBusy = ui.busy.has(`${personId}.name`) || ui.busy.has(`${personId}.title`);
    main = (
      <button type="button" className={`btn ${pine} mv-main`} disabled={buyerBusy} aria-busy={buyerBusy} onClick={() => void ui.unlock({ entity: "contact", id: personId, field: "name" })}>
        {buyerBusy ? "Unlocking" : `${m.way.rel === "Hiring for the seat" ? "See who hired them" : "See who decides"} · 1 credit`}
      </button>
    );
  } else if (m.do === "find" && m.find) {
    main = (
      <a className={`btn ${pine} mv-main`} href={m.find.linkedin} target="_blank" rel="noreferrer">
        Search LinkedIn <IconExternal size={12} />
      </a>
    );
  } else if (m.do === "seePosting" && postSeat) {
    const seatId = postSeat;
    main = (
      <button type="button" className={`btn ${pine} mv-main`} disabled={postBusy} aria-busy={postBusy} onClick={() => void ui.unlock({ entity: "engagement", id: seatId, field: "posting" })}>
        {postBusy ? "Unlocking" : "See the posting · 1 credit"}
      </button>
    );
  } else
    main = (
      <button type="button" className={`btn ${pine} mv-main`} onClick={onDraft}>
        <IconPencil size={14} /> Draft
      </button>
    );
  return (
    <SecondaryCtx.Provider value={n > 1}>
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
        <button type="button" className="mv-co-open" onClick={() => void crystalClick(c.id, !!c.hidden, onOpen)} aria-label={m.name ? `Open ${m.name}` : "Look at this company"}>
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
        {roleStep && role ? (
          <>
            <span className="mv-do-t">Reply to the open role</span>
            <p className="mv-role">
              <span className="mv-role-t">{role.title}</span>
              {roleTerms ? <span className="mv-role-f num">{roleTerms}</span> : null}
            </p>
          </>
        ) : (
          <>
            <span className="mv-do-t">{m.title}</span>
            <p className="mv-do-p">{m.do === "open" && me.crystal === "used" ? CRYSTAL_USED_UNLOCK : m.line}</p>
          </>
        )}
        <div className="mv-acts">
          {main}
          {/* Done and Snooze stay side by side, under a long button when the row is too narrow for all three. */}
          <span className="mv-later">
            {/* The member marks it done themselves (they may have made the move outside Merlin); the toast has Undo. */}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onDone} aria-label={`Mark as done: ${m.title}`}>
              Mark as done
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSnooze} aria-label={`Snooze ${m.name ?? "this company"} for 7 days`}>
              Snooze
            </button>
          </span>
        </div>
        {roleStep && nextTitle ? (
          <button type="button" className="mv-link mv-post" onClick={markRoleSeen}>
            Then: {nextTitle}
          </button>
        ) : null}
        {!roleStep && posting && m.do === "reply" ? (
          <a className="mv-link mv-post" href={posting} target="_blank" rel="noreferrer">
            Open the posting <IconExternal size={11} />
          </a>
        ) : null}
      </div>
    </section>
    </SecondaryCtx.Provider>
  );
}

const upperFirst = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** The middle of a move: the best way in on file. */
function WayIn({ m, companyId }: { m: Move; companyId: string }) {
  const ui = useUi();
  const way = m.way;
  if (way.kind === "know") {
    const p = way.person;
    const seat = p.seat ? `${p.seat.now ? "Holds" : "Held"} their ${p.seat.fn && p.seat.fn !== "Other" ? `${p.seat.fn} ` : ""}seat` : null;
    return (
      <>
        <span className="mv-label">You know</span>
        <div className="mv-who">
          <span className="mv-av" aria-hidden>
            {initials(p.name)}
          </span>
          <div className="mv-who-t">
            <span className="mv-who-n">{p.name}</span>
            {(p.title || p.dm || seat) && (
              <span className="mv-who-s">
                {seat ?? p.title}
                {!seat && p.title && p.dm ? " · " : ""}
                {!seat && p.dm ? <span className="mv-dm">Decision maker</span> : null}
              </span>
            )}
          </div>
        </div>
        <p className="mv-who-line">
          <WarmthChip warmth={p.warmth} />
          <span>{knowLine(p)}</span>
        </p>
      </>
    );
  }
  if (way.kind === "buyer") {
    const what = buyerWhat(way);
    if (!way.name)
      return (
        <>
          <span className="mv-label">Your way in</span>
          <div className="mv-who">
            <span className="mv-av mv-av-quiet" aria-hidden>
              <IconLock size={16} />
            </span>
            <div className="mv-who-t">
              <span className="mv-who-x">{way.rel === "Hiring for the seat" || way.rel === "Reported to" ? `The exec who ${what} is on file` : "A decision maker is on file"}</span>
            </div>
          </div>
          {m.hidden ? (
            <p className="mv-who-line mv-quiet">Opens after the company.</p>
          ) : m.do === "seeBuyer" ? (
            <p className="mv-who-line mv-quiet">1 credit shows their name and title.</p>
          ) : (
            // The open role leads the move: the buyer's own unlock is here.
            <button type="button" className="mv-link mv-add" onClick={() => void ui.unlock({ entity: "contact", id: way.personId, field: "name" })}>
              See who · 1 credit
            </button>
          )}
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
            <span className="mv-who-s">
              {way.title ? `${way.title} · ` : ""}
              <span className="mv-dm">Decision maker</span>
            </span>
          </div>
        </div>
        <p className="mv-who-line">
          <Chip tone="mint">The buyer</Chip>
          <span>{upperFirst(what)}</span>
        </p>
        {way.email === "locked" && (
          <button type="button" className="mv-link mv-add" disabled={ui.busy.has(`${way.personId}.email`)} onClick={() => void ui.unlock({ entity: "contact", id: way.personId, field: "email" })}>
            Their email · 1 credit
          </button>
        )}
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
          <Find m={m} companyId={companyId} />
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
          {way.member ? <Chip tone="mint">On Merlin</Chip> : <Chip>Not on Merlin yet</Chip>}
          <span>{way.member ? "Message them there" : way.invite?.at ? "You invited them" : way.invite ? "Your note invites them" : "Held the seat"}</span>
        </p>
        <Find m={m} companyId={companyId} />
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
        <Find m={m} companyId={companyId} />
      </>
    );
  }
  if (m.find)
    return (
      <>
        <span className="mv-label">Your way in</span>
        <p className="mv-who-x mv-none-t">Nobody who decides is on file yet</p>
        <Find m={m} companyId={companyId} lead />
      </>
    );
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

/**
 * Nobody who decides is on file: where to look (a LinkedIn people search by the company's name
 * and the titles, their team page or website), and Add them. Links out; Merlin reads nothing back.
 * `lead`: the move's own button is the LinkedIn search, so only the rest shows here.
 */
function Find({ m, companyId, lead }: { m: Move; companyId: string; lead?: boolean }) {
  const ui = useUi();
  const f = m.find;
  if (!f) return null;
  return (
    <div className="mv-find">
      {!lead && <span className="mv-find-h">{f.label}</span>}
      <span className="mv-find-acts">
        {!lead && (
          <a className="mv-link" href={f.linkedin} target="_blank" rel="noreferrer">
            Search LinkedIn <IconExternal size={11} />
          </a>
        )}
        {f.site && (
          <a className="mv-link" href={f.site.href} target="_blank" rel="noreferrer">
            {f.site.label} <IconExternal size={11} />
          </a>
        )}
        <button type="button" className="mv-link" onClick={() => ui.openAdd({ companyId, mode: "person" })}>
          Add them <span className="plus1">+1 credit</span>
        </button>
      </span>
    </div>
  );
}
