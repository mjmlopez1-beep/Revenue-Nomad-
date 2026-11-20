"use client";

/**
 * Today's data and its lead card. Home (Home.tsx, page "today") draws them.
 *
 *   "Your best lead today": the top company of the member's Crystal Ball (already ranked), else the
 *   top row of their first view. Its free facts (industry, size, region), what happened there and
 *   why now, and a line on the warm path. One action (LeadAction, the one place it is decided, used
 *   by the card and by Home's next three rows):
 *     - "Unlock free · your company of the day" while the free one is left,
 *     - "Unlock · 2 credits" after it,
 *     - "Open" for a company the member already knows.
 *   Once the company is open the card becomes its warm path: who held a seat there (1 credit), then
 *   Message them on Merlin or Invite to connect. And the one-time trial-ended card.
 *
 * Its data: GET /api/table?today=1 (me, plan, the top 4 radar rows, the free company, the since
 * counts) when the server has it. Without it (an older server: a 4xx, a full view, or no radar in
 * the answer) the same comes from what the page has: the radar's own GET ?radar=1 for the rows and
 * the day counts, the free company from Me, and the since counts from the view.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Me } from "@/lib/tableTypes";
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
import { TODAY_MAX_BYTES, TODAY_ROWS, isTodayAnswer, radarSince, sinceWords, type TodayAnswer, type TodayData } from "./todayModel";
import "./today.css";

export { rolesSince, type TodayData } from "./todayModel";

/* ---------- the data ---------- */

/**
 * Today's data: ?today=1 when the server has it, else the radar's own day (?radar=1) with the
 * since counts worked out here. `local` gives the counts the page can work out itself. Nothing is
 * asked for until `active` (Today has shown on this visit), and then once. `initial`: the ?today=1
 * answer the page opened with (app/Root.tsx asks for it before the whole table), read instead of
 * asking again.
 */
export function useTodayData(
  active: boolean,
  sinceIso: string | null,
  local: { roles: number; follows: number },
  initial?: unknown,
): { data: TodayData | null; failed: boolean } {
  // The answer the page opened with is read at once, so Today draws on its first render.
  const [data, setData] = useState<TodayData | null>(() => (active && isTodayAnswer(initial) ? todayFrom(initial, sinceIso, local) : null));
  const [failed, setFailed] = useState(false);
  const localRef = useRef(local);
  localRef.current = local;
  const opened = useRef(data !== null);
  useEffect(() => {
    if (!active || opened.current) return;
    let gone = false;
    const fromAnswer = (j: TodayAnswer) => todayFrom(j, sinceIso, localRef.current);
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
        latest: v.ready ? ((d) => (d ? { day: d.day, n: d.companies } : null))(v.days.find((d) => d.companies > 0)) : null,
      };
    };
    const viaToday = async (): Promise<TodayData | null> => {
      const ctl = new AbortController();
      // With the previous visit, the server counts "Since Tuesday" on the whole table.
      const r = await fetch(`/api/table?today=1${sinceIso ? `&since=${encodeURIComponent(sinceIso)}` : ""}`, { cache: "no-store", signal: ctl.signal });
      const size = Number(r.headers.get("content-length") ?? 0);
      if (!r.ok || size > TODAY_MAX_BYTES) {
        ctl.abort();
        return null;
      }
      const j = await r.json().catch(() => null);
      return isTodayAnswer(j) ? fromAnswer(j) : null;
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

/** Today's data from GET ?today=1's answer: the server's since counts, else the ones the page works out (`local`). */
function todayFrom(j: TodayAnswer, sinceIso: string | null, local: { roles: number; follows: number }): TodayData {
  const s = j.since ?? null;
  return {
    day: j.radar.day,
    rows: j.radar.rows.slice(0, TODAY_ROWS),
    newCount: j.radar.newCount,
    since: s ?? (sinceIso ? { radar: j.radar.newCount, roles: local.roles, follows: local.follows, sinceIso } : null),
    from: "today",
    latest: j.radar.ready !== false && j.radar.day && j.radar.newCount > 0 ? { day: j.radar.day, n: j.radar.newCount } : null,
  };
}

/* ---------- words ---------- */

/** The lead's free facts: industry, size and region. */
export const factsOf = (i: CoInfo) => {
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

/**
 * The one action on a Crystal Ball company, in one place (Home's card and its rows both use it):
 * a locked company's unlock ("Unlock free · your company of the day" while the free one is left,
 * "Unlock · 2 credits" after it, "Unlocks again tomorrow" when the day's limit binds), or "Open"
 * for a company the member can see. With too few credits the zero-credits popover says what to add.
 */
export function LeadAction({ i, onOpen, compact }: { i: CoInfo; onOpen: () => void; compact?: boolean }) {
  const ui = useUi();
  const ref = useRef<HTMLButtonElement>(null);
  const [zero, setZero] = useState(false);
  const c = i.c;
  if (!c.hidden)
    return (
      <button type="button" className={compact ? "btn btn-sm td-row-go" : "btn btn-pine btn-lg td-main"} onClick={onOpen}>
        Open
      </button>
    );
  const busy = ui.busy.has(`${c.id}.identity`);
  const free = freeCompanyNow(ui.me);
  const later = (ui.me.unlocksLeft ?? Infinity) < COMPANY_PRICE && (ui.me.credits >= COMPANY_PRICE || !!ui.me.freeCompany);
  const unlock = () => {
    if (free || ui.me.credits >= COMPANY_PRICE) return ui.unlock({ entity: "company", id: c.id, field: "identity" }, { onWall: () => setZero(true) });
    setZero(true);
  };
  const label = busy ? "Unlocking" : later ? "Unlocks again tomorrow" : free ? (compact ? "Unlock free" : "Unlock free · your company of the day") : `Unlock · ${COMPANY_PRICE_SAY}`;
  return (
    <>
      <button ref={ref} type="button" className={compact ? "btn btn-sm td-row-go" : "btn btn-pine btn-lg td-main"} disabled={busy || later} aria-busy={busy} onClick={unlock}>
        {label}
      </button>
      {zero && ui.me.credits < COMPANY_PRICE && ref.current && <ZeroCredits anchor={ref.current} id={c.id} need={COMPANY_PRICE} onClose={() => setZero(false)} />}
    </>
  );
}

/** What happened at a lead and when: the Crystal Ball's line up to its first " · ", else its latest hire. */
export function leadWhat(i: CoInfo, row: RadarRow | null): string | null {
  const hire = !row && i.latest ? hireLine(i.latest) : null;
  return row?.lines[0]?.split(" · ")[0] ?? (hire ? `${hire.what}${hire.when ? ` · ${hire.when}` : ""}` : null);
}

/** The best lead: locked with its one unlock, or open with its warm path. */
export function LeadCard({ i, row, me, onOpen, title = "Your best lead today" }: { i: CoInfo; row: RadarRow | null; me: Me; onOpen: () => void; title?: string }) {
  const c = i.c;
  const facts = factsOf(i);
  // What happened there and why now: the Crystal Ball's lines, else the first view's hire.
  const what = leadWhat(i, row);
  const why = row?.notes?.[0] ?? null;
  const seat = warmSeat(i, me);
  const seatFn = seat ? shown(seat.cells.function) : null;
  const name = c.hidden ? row?.name ?? null : c.name;
  return (
    <section className="td-card" aria-labelledby="td-lead">
      <p className="td-card-t" id="td-lead">
        {title}
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
            <LeadAction i={i} onOpen={onOpen} />
            <button type="button" className="td-quiet" onClick={onOpen}>
              Look first
            </button>
          </div>
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
export function TrialEnded({ onSeePro, onSeen }: { onSeePro: () => void; onSeen: () => void }) {
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
