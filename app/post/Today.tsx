"use client";

/**
 * Today (page "today"): the first screen for an onboarded member who opens / with no place in
 * the address (?c=, ?p=, ?v= and the rest still open the table, ?sig= the Crystal Ball day).
 *
 *   "Today", then one card, "Your best lead today": the top company of their Crystal Ball (already
 *   ranked), else the top row of their first view. Its free facts (industry, size, region), what
 *   happened there and why now, and a line on the warm path. One button:
 *     - "Unlock free · your company of the day" while the free one is left,
 *     - "Unlock · 2 credits" after it,
 *     - "Open" for a company the member already knows.
 *   Once the company is open the card becomes its warm path: who held a seat there (1 credit), then
 *   Message them on Merlin or Invite to connect.
 *   Under it two links: "{n} more new since {weekday}" (Crystal Ball) and "Browse all companies".
 *   Then one nudge at most (nudges.ts, TradingPost picks it), "Since {weekday}: ..." (each part a
 *   link), and the one-time trial-ended card.
 *
 * Its data: GET /api/table?today=1 (me, plan, the top 4 radar rows, the free company, the since
 * counts) when the server has it. Without it (an older server: a 4xx, a full view, or no radar in
 * the answer) the same comes from what the page has: the radar's own GET ?radar=1 for the rows and
 * the day counts, the free company from Me, and the since counts from the view.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Me, PlanView } from "@/lib/tableTypes";
import type { RadarRow, RadarView } from "@/lib/radar/types";
import { FEATURE_NAME, YOUR_FEATURE } from "@/lib/radar/types";
import { COMPANY_PRICE, COMPANY_PRICE_SAY } from "@/lib/tableFields";
import { CompanyLogo, IconChevron, IconLock, LockedName, val } from "../ui/shared";
import { countryOf, hireLine, isOpenRole, namedFn, shown, type CoInfo, type Row } from "./model";
import { useUi, ZeroCredits } from "./ui";
import { freeCompanyNow } from "./display";
import { MessageButton } from "./Messages";
import { InviteConnect } from "./Invite";
import { plural } from "./hooks";
import "./today.css";

/* ---------- the data ---------- */

/** GET /api/table?today=1 (BUILD-LIST contract, WS2). */
export interface TodayAnswer {
  me: Me;
  plan?: PlanView;
  freeCompany?: boolean;
  radar: { day: string; fn: string | null; rows: RadarRow[]; newCount: number };
  since?: { radar: number; roles: number; follows: number; sinceIso: string };
}
/** What Today draws from, whichever way it came. */
export interface TodayData {
  day: string | null;
  rows: RadarRow[];
  /** Companies new in the Crystal Ball since the last visit (or on its latest day, on a first visit). */
  newCount: number;
  since: { radar: number; roles: number; follows: number; sinceIso: string } | null;
  from: "today" | "radar";
}
/** The rows Today keeps from the radar. */
export const TODAY_ROWS = 4;
/** An answer bigger than this to ?today=1 is a full view (a server without the endpoint): it isn't read. */
const TODAY_MAX_BYTES = 200_000;

const dayOf = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);

/** The answer is the small one the contract describes, not a full view or an error. */
export function isTodayAnswer(j: unknown): j is TodayAnswer {
  const x = j as Partial<TodayAnswer> & { companies?: unknown };
  return !!x && typeof x === "object" && !x.companies && !!x.radar && Array.isArray(x.radar.rows) && typeof x.radar.newCount === "number";
}

/** Companies in the radar's days after the last visit (the latest day with any, on a first visit). */
export function radarSince(v: Pick<RadarView, "days">, sinceIso: string | null): number {
  const after = dayOf(sinceIso);
  if (!after) return v.days.find((d) => d.companies > 0)?.companies ?? 0;
  return v.days.filter((d) => d.day > after).reduce((n, d) => n + d.companies, 0);
}

/** Open roles in the member's function that opened since the last visit (never a fractional firm's). */
export function rolesSince(infos: CoInfo[], fn: string | null, sinceIso: string | null): number {
  const own = namedFn(fn);
  const at = Date.parse(sinceIso ?? "");
  if (!own || !Number.isFinite(at)) return 0;
  let n = 0;
  for (const i of infos)
    for (const e of i.engs) {
      if (!isOpenRole(e) || e.unseen || shown(e.cells.function) !== own) continue;
      const opened = Date.parse(e.openedAt ?? (e.opened ? `${e.opened}T00:00:00Z` : ""));
      if (Number.isFinite(opened) && opened > at) n++;
    }
  return n;
}

/**
 * Today's data: ?today=1 when the server has it, else the radar's own day (?radar=1) with the
 * since counts worked out here. `local` gives the counts the page can work out itself. Nothing is
 * asked for until `active` (Today has shown on this visit), and then once.
 */
export function useTodayData(active: boolean, sinceIso: string | null, local: { roles: number; follows: number }): { data: TodayData | null; failed: boolean } {
  const [data, setData] = useState<TodayData | null>(null);
  const [failed, setFailed] = useState(false);
  const localRef = useRef(local);
  localRef.current = local;
  useEffect(() => {
    if (!active) return;
    let gone = false;
    const viaRadar = async (): Promise<TodayData | null> => {
      const r = await fetch("/api/table?radar=1", { cache: "no-store" });
      const v = (await r.json().catch(() => null)) as RadarView | null;
      if (!r.ok || !v || !Array.isArray(v.rows)) return null;
      const radar = radarSince(v, sinceIso);
      return {
        day: v.day,
        rows: v.rows.slice(0, TODAY_ROWS),
        newCount: radar,
        since: sinceIso ? { radar, roles: localRef.current.roles, follows: localRef.current.follows, sinceIso } : null,
        from: "radar",
      };
    };
    const viaToday = async (): Promise<TodayData | null> => {
      const ctl = new AbortController();
      const r = await fetch("/api/table?today=1", { cache: "no-store", signal: ctl.signal });
      const size = Number(r.headers.get("content-length") ?? 0);
      if (!r.ok || size > TODAY_MAX_BYTES) {
        ctl.abort();
        return null;
      }
      const j = await r.json().catch(() => null);
      if (!isTodayAnswer(j)) return null;
      const s = j.since ?? null;
      return {
        day: j.radar.day,
        rows: j.radar.rows.slice(0, TODAY_ROWS),
        newCount: j.radar.newCount,
        // The server's counts, else the ones worked out here.
        since: s ?? (sinceIso ? { radar: j.radar.newCount, roles: localRef.current.roles, follows: localRef.current.follows, sinceIso } : null),
        from: "today",
      };
    };
    (async () => {
      let d: TodayData | null = null;
      try {
        d = await viaToday();
      } catch {}
      try {
        d ??= await viaRadar();
      } catch {}
      if (gone) return;
      if (d) setData(d);
      else setFailed(true);
    })();
    return () => {
      gone = true;
    };
  }, [active, sinceIso]);
  return { data, failed };
}

/* ---------- words ---------- */

/** "Since Tuesday", "Since earlier today", "Since Nov 12" (a week or more ago). */
export function sinceWords(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Since your last visit";
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return "Since earlier today";
  if (days === 1) return "Since yesterday";
  if (days < 7) return `Since ${d.toLocaleDateString("en-US", { weekday: "long" })}`;
  return `Since ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** The lead's free facts: industry, size and region. */
const factsOf = (i: CoInfo) => {
  const emp = val(i.c.cells.employees);
  return [val(i.c.cells.industry), emp && `${emp} employees`, countryOf(i.c) ?? i.c.region].filter(Boolean).join(" · ");
};

/** The seat whose holder is the warm way in: one with its holder on file, in a function before the member's first, then the latest. */
function warmSeat(i: CoInfo, me: Pick<Me, "before" | "function">) {
  const held = i.engs.filter((e) => !e.yours && !isOpenRole(e) && (e.cells.operator?.s === "locked" || e.cells.operator?.s === "value"));
  if (!held.length) return null;
  const before = new Set(me.before ?? []);
  return held.find((e) => before.has(shown(e.cells.function) ?? "")) ?? (i.latest && held.includes(i.latest) ? i.latest : held[0]);
}

/* ---------- the page ---------- */

export interface TodayProps {
  me: Me;
  infos: CoInfo[];
  byId: Map<string, CoInfo>;
  /** The top row of the member's first view: the lead when the Crystal Ball has nothing. */
  firstRow: Row | null;
  data: TodayData | null;
  failed: boolean;
  /** The previous visit (ISO), null on a first visit. */
  sinceAt: string | null;
  /** The one nudge (NudgeSlot), or null. */
  nudge: ReactNode;
  /** One-time lines (an invite bonus paid, who joined from an invite). */
  events?: ReactNode;
  /** The trial-ended card shows (Me.plan.trialEnded, not closed yet on this page). */
  trialEnded: boolean;
  onTrialSeen: () => void;
  onSeePro: () => void;
  onRadar: () => void;
  onBrowse: () => void;
  onRoles: () => void;
  onFollows: () => void;
  openCompany: (id: string) => void;
}

export function TodayPage(p: TodayProps) {
  const { data, byId, firstRow } = p;
  // The lead: the Crystal Ball's top company still in the member's table, else the first view's top row.
  const radarLead = useMemo(() => {
    for (const r of data?.rows ?? []) {
      const i = byId.get(r.id);
      if (i) return { i, row: r };
    }
    return null;
  }, [data, byId]);
  const loading = !data && !p.failed;
  // While the Crystal Ball is on its way the card waits (a skeleton), so it never swaps one company for another under the pointer.
  const lead = radarLead ?? (!loading && firstRow ? { i: byId.get(firstRow.i.c.id) ?? firstRow.i, row: null } : null);
  const more = Math.max(0, (data?.newCount ?? 0) - (radarLead ? 1 : 0));
  const since = data?.since ?? null;
  // The link under the card already says how many are new in the Crystal Ball since then: the line doesn't say it twice.
  const saidNew = more > 0 && !!p.sinceAt;
  const parts: { n: number; text: string; go: () => void }[] = since
    ? [
        { n: saidNew ? 0 : since.radar, text: `${since.radar} new in ${FEATURE_NAME}`, go: p.onRadar },
        { n: since.roles, text: `${plural(since.roles, "role")} opened`, go: p.onRoles },
        { n: since.follows, text: `${since.follows} of your follows changed`, go: p.onFollows },
      ].filter((x) => x.n > 0)
    : [];
  return (
    <div className="td">
      <h1 className="td-h1">Today</h1>
      {p.trialEnded ? <TrialEnded onSeePro={p.onSeePro} onSeen={p.onTrialSeen} /> : null}
      {loading && !lead ? (
        <section className="td-card td-card-skel" aria-busy>
          <span className="sr-only">Finding your best lead today</span>
          <span className="td-skel" style={{ width: "40%" }} />
          <span className="td-skel" style={{ width: "70%", height: 20 }} />
          <span className="td-skel" style={{ width: "55%" }} />
          <span className="td-skel" style={{ width: "35%", height: 44 }} />
        </section>
      ) : lead ? (
        <LeadCard key={lead.i.c.id} i={lead.i} row={lead.row} me={p.me} onOpen={() => p.openCompany(lead.i.c.id)} />
      ) : (
        <section className="td-card">
          <p className="td-card-t">Your best lead today</p>
          <p className="td-none">Nothing new in your profile today. Browse every company, or widen who you want to work with in Your profile.</p>
        </section>
      )}
      <nav className="td-links" aria-label="More">
        <button type="button" className="td-link" onClick={p.onRadar}>
          {more > 0 ? (p.sinceAt ? `${more} more new ${sinceWords(p.sinceAt).replace(/^Since/, "since")}` : `${more} more in ${YOUR_FEATURE}`) : `See ${YOUR_FEATURE}`}
          <IconChevron dir="right" size={13} />
        </button>
        <button type="button" className="td-link" onClick={p.onBrowse}>
          Browse all companies
          <IconChevron dir="right" size={13} />
        </button>
      </nav>
      {p.nudge ? <div className="td-nudge">{p.nudge}</div> : null}
      {p.sinceAt && parts.length ? (
        <p className="td-since">
          <span className="td-since-h">{sinceWords(p.sinceAt)}:</span>{" "}
          {parts.map((x, k) => (
            <span key={x.text}>
              {k ? <span aria-hidden> · </span> : null}
              <button type="button" className="td-since-l num" onClick={x.go}>
                {x.text}
              </button>
            </span>
          ))}
        </p>
      ) : null}
      {p.events}
    </div>
  );
}

/** The best lead: locked with its one unlock, or open with its warm path. */
function LeadCard({ i, row, me, onOpen }: { i: CoInfo; row: RadarRow | null; me: Me; onOpen: () => void }) {
  const ui = useUi();
  const ref = useRef<HTMLButtonElement>(null);
  const [zero, setZero] = useState(false);
  const c = i.c;
  const facts = factsOf(i);
  // What happened there and why now: the Crystal Ball's lines, else the first view's hire.
  const hire = !row && i.latest ? hireLine(i.latest) : null;
  // The Crystal Ball's line up to its first " · " (what happened, when): why now is the next line.
  const what = row?.lines[0]?.split(" · ")[0] ?? (hire ? `${hire.what}${hire.when ? ` · ${hire.when}` : ""}` : null);
  const why = row?.notes?.[0] ?? null;
  const seat = warmSeat(i, me);
  const seatFn = seat ? shown(seat.cells.function) : null;
  const name = c.hidden ? row?.name ?? null : c.name;
  const busy = ui.busy.has(`${c.id}.identity`);
  const free = freeCompanyNow(ui.me);
  const later = (ui.me.unlocksLeft ?? Infinity) < COMPANY_PRICE && (ui.me.credits >= COMPANY_PRICE || !!ui.me.freeCompany);
  const unlock = () => {
    if (free || ui.me.credits >= COMPANY_PRICE) return ui.unlock({ entity: "company", id: c.id, field: "identity" }, { onWall: () => setZero(true) });
    setZero(true);
  };
  return (
    <section className="td-card" aria-labelledby="td-lead">
      <p className="td-card-t" id="td-lead">
        Your best lead today
      </p>
      <div className="td-co">
        <CompanyLogo name={c.hidden ? "" : c.name} domain={c.hidden ? null : c.iconDomain} hidden={c.hidden} seed={c.id} />
        <div className="td-co-id">
          <span className="td-co-name">{name ?? <LockedName seed={c.id} />}</span>
          {facts ? <span className="td-co-facts">{facts}</span> : null}
        </div>
      </div>
      {what ? <p className="td-what">{what}</p> : null}
      {why ? <p className="td-why">{why}</p> : null}
      {c.hidden ? (
        <>
          <p className="td-warm">
            {seat ? (
              <>
                <IconLock size={12} /> The fractional who held their {seatFn ?? "last"} seat is on file: your warm way in.
              </>
            ) : (
              "No seat holder on file yet. Unlock it to see what we have."
            )}
          </p>
          <div className="td-acts">
            <button ref={ref} type="button" className="btn btn-pine btn-lg td-main" disabled={busy || later} aria-busy={busy} onClick={unlock}>
              {busy ? "Unlocking" : later ? "Unlocks again tomorrow" : free ? "Unlock free · your company of the day" : `Unlock · ${COMPANY_PRICE_SAY}`}
            </button>
            <button type="button" className="td-quiet" onClick={onOpen}>
              Look first
            </button>
          </div>
          {zero && ui.me.credits < COMPANY_PRICE && ref.current && <ZeroCredits anchor={ref.current} id={c.id} need={COMPANY_PRICE} onClose={() => setZero(false)} />}
        </>
      ) : (
        <WarmPath i={i} seat={seat} onOpen={onOpen} />
      )}
    </section>
  );
}

/** The company is open: its warm path, from the record (who held a seat, then Message or Invite to connect), and Open. */
function WarmPath({ i, seat, onOpen }: { i: CoInfo; seat: ReturnType<typeof warmSeat>; onOpen: () => void }) {
  const ui = useUi();
  const op = seat?.cells.operator;
  const fn = seat ? shown(seat.cells.function) : null;
  const holder = op?.s === "value" ? op.v : null;
  const busy = !!seat && (ui.busy.has(`${seat.id}.operator`) || ui.busy.has(`${seat.id}.role`));
  let action: ReactNode = null;
  let line: string;
  if (!seat) line = "No seat holder on file here yet. Open it to see who decides.";
  else if (op?.s === "locked") {
    line = `The fractional who held their ${fn ?? ""} seat. See who, then message them or invite them.`.replace("  ", " ");
    action = (
      <button type="button" className="btn btn-pine btn-lg td-main" disabled={busy} aria-busy={busy} onClick={() => ui.unlock({ entity: "engagement", id: seat.id, field: "operator" })}>
        {busy ? "Unlocking" : "See who held it · 1 credit"}
      </button>
    );
  } else if (holder && op?.s === "value" && op.member) {
    line = `${holder} held their ${fn ?? ""} seat, and is on Merlin.`.replace("  ", " ");
    action = <MessageButton engagementId={seat.id} name={holder} company={i.c.name} role={shown(seat.cells.role)} fn={fn} />;
  } else if (holder && seat.invite) {
    line = `${holder} held their ${fn ?? ""} seat. They aren't on Merlin yet.`.replace("  ", " ");
    action = <InviteConnect e={seat} name={holder} company={i.c.name} />;
  } else line = holder ? `${holder} held their ${fn ?? ""} seat.`.replace("  ", " ") : "Open it to see who held a seat there.";
  return (
    <>
      <p className="td-warm td-warm-open">
        <strong>Your way in.</strong> {line}
      </p>
      <div className="td-acts">
        {action}
        <button type="button" className={action ? "btn btn-lg" : "btn btn-pine btn-lg td-main"} onClick={onOpen}>
          Open
        </button>
      </div>
    </>
  );
}

/** Once, after the trial ended without a paid plan: what they kept and what Pro adds. */
function TrialEnded({ onSeePro, onSeen }: { onSeePro: () => void; onSeen: () => void }) {
  return (
    <section className="td-trial" aria-labelledby="td-trial-h">
      <p className="td-trial-h" id="td-trial-h">
        Your Pro trial ended.
      </p>
      <p>
        <strong>You kept:</strong> your credits, 1 saved view with the weekly email, {FEATURE_NAME} each morning.
      </p>
      <p>
        <strong>Pro adds:</strong> open roles the moment they post, rate ranges, Slack alerts.
      </p>
      <div className="td-acts">
        <button type="button" className="btn btn-pine" onClick={onSeePro}>
          See Pro
        </button>
        <button type="button" className="btn" onClick={onSeen}>
          Got it
        </button>
      </div>
    </section>
  );
}
