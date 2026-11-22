"use client";

/**
 * Fractionals (page "fractionals"; Referral partners' old address opens it with Different from
 * yours on): one record per fractional, from GET /api/table?fractionals=1 (lib/fractionals.ts),
 * already locked as the member may see it. Filters and order: fractionalsModel.ts.
 *
 *  - Desktop: the filters on the left, the line at the top ("N fractionals serve companies like
 *    yours. M are on Merlin."), the tabs (All, On Merlin, Unlocked) and a table like Companies:
 *    Fractional, Function and level, Clients they serve (one line), Seats ("2 now · 5 past"), and
 *    one action. A row opens the record in the right-hand panel, as a company's does.
 *  - Phones: the same as cards, the filters in a sheet, the record full screen.
 *  - The action: a member on Merlin, Message (their conversation when there is one); someone not on
 *    Merlin yet, free to see by name (fellow fractionals never cost a credit),
 *    then Invite to connect: a note drafted in the member's saved voice, Copy and Mark as sent.
 *    Merlin sends no email.
 *  - A record's seats are drawn from the member's own table, so a locked company there shows only
 *    its free facts and "Unlock company · 2 credits".
 * The art: one header prop, never by a data row. Never violet.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EngagementRec, FractionalRec, FractionalsView, Icp } from "@/lib/tableTypes";
import { clientKinds, myWords } from "@/lib/partners";
import { draftNote } from "@/lib/moveNote";
import { COMPANY_PRICE, REFERRAL_BONUS } from "@/lib/tableFields";
import { CompanyLogo, IconCheck, IconChevron, IconFilter, IconLock, IconX, LockedName, fmtMonth, lockedLook, useToast } from "../ui/shared";
import { countryOf, countryShort, regionOf, shown, type CoInfo } from "./model";
import { ConnectButton, openConversation } from "./Messages";
import { Sheet, useUi } from "./ui";
import { copyText, plural } from "./hooks";
import { fmtStamp } from "./RoleDate";
import { freeCompanyNow } from "./display";
import { FR_TABS, ballChip, startPlace, takeWantSeat, choiceCounts, frDefaults, frRows, headline, leadTitle, levelLine, tabCounts, type FrFilters, type FrTab } from "./fractionalsModel";
import "./fractionals.css";
import { Prop } from "../ui/fractions/lazy";

/** A seat the record asks for: the company's info and the seat, from the member's own table. */
type SeatAt = { i: CoInfo; e: EngagementRec };

/** Rows a list draws before "Show more" (the directory can run to thousands). */
const STEP = 60;


function useFractionals(deps: unknown[]) {
  const [data, setData] = useState<FractionalsView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/table?fractionals=1", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) return setFailed(j?.error || "Fractionals didn't load. Try again.");
      setFailed(null);
      setData(j as FractionalsView);
    } catch {
      setFailed("We couldn't reach Merlin. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, failed, load };
}


export function Fractionals({ infos, waiting, different, onBack, onProfile }: { infos: CoInfo[]; waiting?: boolean; different?: boolean; onBack: () => void; onProfile: () => void }) {
  const ui = useUi();
  const me = ui.me;
  const phone = ui.layout === "phone";
  const { data, failed, load } = useFractionals([me.icp, me.function, me.fractionals]);
  const [addr] = useState(startPlace);
  const hasIcp = !!me.icp && !!(me.icp.industries.length || me.icp.employees.length || me.icp.revenue.length || me.icp.countries.length);
  const [tab, setTab] = useState<FrTab>("all");
  const [f, setF] = useState<FrFilters>(() => frDefaults(hasIcp, !!different || addr.diff));
  // After activating, the welcome shows their record a click away (beside the conversation), so it doesn't open over it.
  const [openId, setOpenId] = useState<string | null>(addr.welcome ? null : addr.rec);
  const [filtersOpen, setFiltersOpen] = useState(!phone);
  const [n, setN] = useState(STEP);
  const myFn = data?.fn ?? me.function ?? null;
  useEffect(() => setF((x) => ({ ...x, fits: x.fits && hasIcp })), [hasIcp]);

  // Each seat on the member's own table, by public id: a record's seats are drawn from it.
  const seatIndex = useMemo(() => {
    const m = new Map<string, SeatAt>();
    for (const i of infos) for (const e of i.engs) m.set(e.id, { i, e });
    return m;
  }, [infos]);
  const records = useMemo(() => data?.records ?? [], [data]);
  const rows = useMemo(() => frRows(records, tab, f, myFn, hasIcp), [records, tab, f, myFn, hasIcp]);
  const counts = useMemo(() => tabCounts(records, f, myFn, hasIcp), [records, f, myFn, hasIcp]);
  const choices = useMemo(() => choiceCounts(records, f, myFn, hasIcp), [records, f, myFn, hasIcp]);
  useEffect(() => setN(STEP), [tab, f]);

  // The company record's "See their record", or ?fs=<seat>: open the record that seat is on.
  const [want] = useState(() => takeWantSeat());
  useEffect(() => {
    const seat = want ?? addr.seat;
    if (!seat || !records.length) return;
    const r = records.find((x) => x.seats.some((s) => s.id === seat));
    if (r) setOpenId(r.id);
  }, [records, addr.seat, want]);

  const open = openId ? records.find((r) => r.id === openId) ?? null : null;
  const at = open ? rows.findIndex((r) => r.id === open.id) : -1;
  const move = (d: number) => {
    if (at < 0) return;
    const next = rows[at + d];
    if (next) setOpenId(next.id);
  };

  const filters = <FilterPanel f={f} setF={setF} choices={choices} hasIcp={hasIcp} myFn={myFn} icpLine={icpWords(me.icp)} onProfile={onProfile} />;
  const top = (
    <div className="fr-top">
      <p className="fr-line" role="status">
        {data ? headline(records, hasIcp) : failed ? failed : "Finding fractionals"}
      </p>
      {hasIcp ? (
        <button type="button" className="fr-edit" onClick={onProfile}>
          Edit
        </button>
      ) : (
        <button type="button" className="fr-edit" onClick={onProfile}>
          Say who you serve
        </button>
      )}
    </div>
  );
  const tabs = (
    <div className="fr-tabs" role="tablist" aria-label="Which fractionals">
      {FR_TABS.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`fr-tab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
          {t.label} <span className="num fr-tab-n">{data ? counts[t.key].toLocaleString("en-US") : ""}</span>
        </button>
      ))}
    </div>
  );
  const empty = data && !rows.length && (
    <div className="fr-empty">
      <p>{tab === "unlocked" ? "You haven't unlocked anyone yet. Unlock a fractional to see who they are, and their name shows on each of their seats." : "Nobody matches these filters."}</p>
      {tab !== "unlocked" && (
        <button type="button" className="btn btn-sm" onClick={() => setF(frDefaults(false))}>
          Clear the filters
        </button>
      )}
    </div>
  );
  const more = rows.length > n && (
    <button type="button" className="btn fr-more" onClick={() => setN((x) => x + STEP)}>
      Show {Math.min(STEP, rows.length - n)} more of {rows.length.toLocaleString("en-US")}
    </button>
  );
  const record = open && (
    <Record
      r={open}
      seatIndex={seatIndex}
      waiting={!!waiting}
      pos={at >= 0 ? { at: at + 1, of: rows.length } : null}
      onMove={move}
      onClose={() => setOpenId(null)}
      reload={load}
      phone={phone}
    />
  );

  if (phone)
    return (
      <div className="fr-page fr-phone">
        <h1 className="tp-page-h fr-h">Fractionals</h1>
        {addr.welcome && <Welcome m={addr.m} mine={records.find((r) => r.you) ?? null} onRecord={(id) => setOpenId(id)} />}
        <p className="fr-phone-line">{data ? headline(records, hasIcp) : failed ?? "Finding fractionals"}</p>
        <div className="fr-pchips">
          <button type="button" className={`chip fr-pchip${f.levels.length || f.regions.length || f.onMerlin ? " chip-on" : ""}`} onClick={() => setFiltersOpen(true)}>
            <IconFilter size={13} /> Filters
          </button>
          {hasIcp && (
            <button type="button" className={`chip fr-pchip${f.fits ? " chip-on" : ""}`} aria-pressed={f.fits} onClick={() => setF({ ...f, fits: !f.fits })}>
              Serves your clients
            </button>
          )}
          <button type="button" className={`chip fr-pchip${tab === "on" ? " chip-on" : ""}`} aria-pressed={tab === "on"} onClick={() => setTab(tab === "on" ? "all" : "on")}>
            On Merlin
          </button>
          <button type="button" className={`chip fr-pchip${f.fn === "diff" ? " chip-on" : ""}`} aria-pressed={f.fn === "diff"} onClick={() => setF({ ...f, fn: f.fn === "diff" ? "any" : "diff" })}>
            Other functions
          </button>
          <button type="button" className={`chip fr-pchip${tab === "unlocked" ? " chip-on" : ""}`} aria-pressed={tab === "unlocked"} onClick={() => setTab(tab === "unlocked" ? "all" : "unlocked")}>
            Unlocked
          </button>
        </div>
        {empty}
        <ul className="fr-cards" aria-label="Fractionals">
          {rows.slice(0, n).map((r) => (
            <li key={r.id}>
              <Card r={r} onOpen={() => setOpenId(r.id)} reload={load} />
            </li>
          ))}
        </ul>
        {more}
        {filtersOpen && (
          <Sheet title="Filters" onClose={() => setFiltersOpen(false)} footer={<button type="button" className="btn btn-pine btn-lg fr-wide" onClick={() => setFiltersOpen(false)}>Show {plural(rows.length, "fractional")}</button>}>
            {filters}
          </Sheet>
        )}
        {record}
      </div>
    );

  return (
    <div className={`fr-page${filtersOpen ? "" : " fr-nofilters"}`}>
      {filtersOpen ? (
        <aside className="fr-side" aria-label="Filters">
          <div className="fr-side-h">
            <h2>Filters</h2>
            <button type="button" className="fr-iconbtn" aria-label="Hide the filters" onClick={() => setFiltersOpen(false)}>
              <IconChevron dir="left" />
            </button>
          </div>
          {filters}
        </aside>
      ) : null}
      <section className="fr-body" aria-labelledby="fr-h">
        <div className="fr-head">
          <button type="button" className="tp-back" onClick={onBack}>
            <IconChevron dir="left" /> Back to the table
          </button>
          <div className="fr-titlerow">
            <h1 className="tp-page-h fr-h" id="fr-h">
              Fractionals
            </h1>
            {!filtersOpen && (
              <button type="button" className="chip fr-showf" onClick={() => setFiltersOpen(true)}>
                <IconFilter size={13} /> Filters
              </button>
            )}
          </div>
          <Prop name="trailWinding" height={64} on="bg" className="fr-art" />
        </div>
        {addr.welcome && <Welcome m={addr.m} mine={records.find((r) => r.you) ?? null} onRecord={(id) => setOpenId(id)} />}
        {top}
        {tabs}
        {empty}
        {!!rows.length && (
          <div className="fr-tablewrap">
            <table className="fr-table">
              <thead>
                <tr>
                  <th scope="col">Fractional</th>
                  <th scope="col">Function and level</th>
                  <th scope="col">Clients they serve</th>
                  <th scope="col">Seats</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, n).map((r) => (
                  <Row key={r.id} r={r} on={r.id === openId} onOpen={() => setOpenId(r.id)} reload={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {more}
      </section>
      {record}
    </div>
  );
}

/** "SaaS and Fintech · 51–200 · US", the member's Ideal Fractional Profile under its switch. */
function icpWords(icp: Icp | null | undefined): string {
  if (!icp) return "";
  return [icp.industries.slice(0, 3).join(" and "), icp.employees.join(", "), icp.revenue.join(", "), icp.countries.map(countryShort).join(", ")].filter(Boolean).join(" · ");
}

/* ---------- after Activate your fractional profile ---------- */

type Conv = { id: string; with: { first: string; title: string }; messages: { id: string; mine: boolean; at: string; text: string }[] };

/**
 * "Welcome to Merlin, Sam": the conversation with the first member who invited them, open (its
 * messages, and Write to them in Messages), and their own record a click away.
 */
function Welcome({ m, mine, onRecord }: { m: string | null; mine: FractionalRec | null; onRecord: (id: string) => void }) {
  const ui = useUi();
  const [conv, setConv] = useState<Conv | null>(null);
  useEffect(() => {
    if (!m) return;
    let live = true;
    void fetch("/api/table?messages=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setConv(((j?.conversations ?? []) as Conv[]).find((c) => c.id === m) ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [m]);
  const first = ui.me.name.trim().split(/\s+/)[0];
  const seats = mine ? mine.now + mine.past : 0;
  return (
    <section className="fr-welcome" aria-labelledby="fr-welcome-h">
      <h2 id="fr-welcome-h" className="fr-welcome-h">
        Welcome to Merlin, {first}
      </h2>
      <p className="fr-welcome-p">
        {seats ? `Your ${seats === 1 ? "seat is" : `${seats} seats are`} on your profile` : "You're on Merlin"}
        {conv ? `, and you're connected with ${conv.with.first}.` : "."}
      </p>
      <div className="fr-welcome-grid">
        {conv && (
          <div className="fr-wconv">
            <div className="fr-wconv-h">
              <b>{conv.with.first}</b>
              {conv.with.title && <span className="fr-sub">{conv.with.title}</span>}
            </div>
            <ul className="fr-wmsgs">
              {conv.messages.slice(-3).map((x) => (
                <li key={x.id} className={x.mine ? "mine" : ""}>
                  {x.text}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-pine" onClick={() => openConversation(ui.openPage, conv.id)}>
              Write to {conv.with.first}
            </button>
          </div>
        )}
        {mine && (
          <button type="button" className="fr-wrec" onClick={() => onRecord(mine.id)}>
            <Avatar r={mine} />
            <span className="fr-who-t">
              <span className="fr-name">Your record</span>
              <span className="fr-sub">
                {plural(seats, "seat")} marked Yours, and the clients you serve
              </span>
            </span>
            <IconChevron dir="right" />
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- filters ---------- */

function FilterPanel({
  f,
  setF,
  choices,
  hasIcp,
  myFn,
  icpLine,
  onProfile,
}: {
  f: FrFilters;
  setF: (f: FrFilters) => void;
  choices: ReturnType<typeof choiceCounts>;
  hasIcp: boolean;
  myFn: string | null;
  icpLine: string;
  onProfile: () => void;
}) {
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chip = (on: boolean, label: string, n: number | null, onClick: () => void) => (
    <button key={label} type="button" className={`chip fr-chip${on ? " chip-on" : ""}`} aria-pressed={on} onClick={onClick}>
      {label}
      {n !== null && <span className="num fr-chip-n">{n.toLocaleString("en-US")}</span>}
    </button>
  );
  return (
    <div className="fr-filters">
      <section className="fr-fsec" aria-labelledby="fr-f-who">
        <h3 id="fr-f-who">Who they serve</h3>
        {hasIcp ? (
          <>
            <button type="button" role="switch" aria-checked={f.fits} className={`tp-ftoggle fr-toggle${f.fits ? " on" : ""}`} onClick={() => setF({ ...f, fits: !f.fits })}>
              <span className="tp-check" aria-hidden>
                {f.fits && <IconCheck size={11} />}
              </span>
              <span className="tp-ftoggle-l">Serves your Ideal Fractional Profile</span>
              <span className="num fr-chip-n">{choices.fits.toLocaleString("en-US")}</span>
            </button>
            <p className="fr-fnote">
              {icpLine}.{" "}
              <button type="button" className="fr-link" onClick={onProfile}>
                Edit
              </button>
            </p>
          </>
        ) : (
          <p className="fr-fnote">
            Say who your clients are and this narrows to fractionals who serve the same kind.{" "}
            <button type="button" className="fr-link" onClick={onProfile}>
              Set your Ideal Fractional Profile
            </button>
          </p>
        )}
        <p className="fr-fnote">Members say who they serve. For everyone else it&apos;s read from their seats on file.</p>
      </section>
      <section className="fr-fsec" aria-labelledby="fr-f-fn">
        <h3 id="fr-f-fn">Function</h3>
        <div className="fr-chips">
          {chip(f.fn === "any", "Any", null, () => setF({ ...f, fn: "any" }))}
          {myFn && chip(f.fn === "diff", "Different from yours", choices.diff, () => setF({ ...f, fn: "diff" }))}
          {myFn && chip(f.fn === "same", "Same as yours", choices.same, () => setF({ ...f, fn: "same" }))}
        </div>
        <div className="fr-chips">{choices.fn.map(([fn, n]) => chip(f.fn === fn, fn, n, () => setF({ ...f, fn: f.fn === fn ? "any" : fn })))}</div>
      </section>
      <section className="fr-fsec" aria-labelledby="fr-f-level">
        <h3 id="fr-f-level">Level</h3>
        <div className="fr-chips">{choices.levels.map(([l, n]) => chip(f.levels.includes(l), l, n, () => setF({ ...f, levels: toggle(f.levels, l) })))}</div>
      </section>
      <section className="fr-fsec" aria-labelledby="fr-f-on">
        <h3 id="fr-f-on">On Merlin</h3>
        <button type="button" role="switch" aria-checked={f.onMerlin} className={`tp-ftoggle fr-toggle${f.onMerlin ? " on" : ""}`} onClick={() => setF({ ...f, onMerlin: !f.onMerlin })}>
          <span className="tp-check" aria-hidden>
            {f.onMerlin && <IconCheck size={11} />}
          </span>
          <span className="tp-ftoggle-l">On Merlin</span>
          <span className="num fr-chip-n">{choices.onMerlin.toLocaleString("en-US")}</span>
        </button>
        <p className="fr-fnote">Members you can message today. Everyone else you can invite.</p>
      </section>
      {choices.regions.length > 0 && (
        <section className="fr-fsec" aria-labelledby="fr-f-region">
          <h3 id="fr-f-region">Region</h3>
          <div className="fr-chips">{choices.regions.map(([r, n]) => chip(f.regions.includes(r), r, n, () => setF({ ...f, regions: toggle(f.regions, r) })))}</div>
        </section>
      )}
    </div>
  );
}

/* ---------- a fractional, in a row and on a card ---------- */

/** A locked name: made-up letters, blurred, from the record's id (never the name). */
function LockedPerson({ seed }: { seed: string }) {
  const a = lockedLook(`${seed}.first`).name.split(" ")[0];
  const b = lockedLook(`${seed}.last`).name.split(" ")[0];
  return (
    <span className="locked-name fr-name-locked">
      <span className="locked-blur" aria-hidden>
        {a} {b}
      </span>
      <span className="sr-only">Name locked</span>
    </span>
  );
}

function Avatar({ r, size = "md" }: { r: FractionalRec; size?: "md" | "lg" }) {
  if (r.locked)
    return (
      <span className={`fr-av fr-av-locked fr-av-${size}`} aria-hidden>
        <IconLock size={size === "lg" ? 16 : 13} />
      </span>
    );
  return (
    <span className={`fr-av fr-av-${size}${r.onMerlin ? " fr-av-on" : ""}`} aria-hidden>
      {r.initials}
    </span>
  );
}

/** "On Merlin", "Not on Merlin yet", "You". */
function Status({ r }: { r: FractionalRec }) {
  if (r.you) return <span className="fr-status fr-status-on">You{r.hidden ? ", hidden from others" : ""}</span>;
  return r.onMerlin ? <span className="fr-status fr-status-on">On Merlin</span> : <span className="fr-status">Not on Merlin yet</span>;
}

function Who({ r }: { r: FractionalRec }) {
  return (
    <span className="fr-who">
      <Avatar r={r} />
      <span className="fr-who-t">
        {r.locked ? <LockedPerson seed={r.id} /> : <span className="fr-name">{r.name}</span>}
        <Status r={r} />
        <BallChip r={r} />
      </span>
    </span>
  );
}

/** "Serves 2 of your Crystal Ball companies": counted from the seats the record lists, companies never named here. */
function BallChip({ r }: { r: FractionalRec }) {
  const words = ballChip(r);
  if (!words) return null;
  return <span className="fr-ball">{words}</span>;
}

/** What a first message says about the companies they serve in the member's Crystal Ball (names only where unlocked). */
const sharedOf = (r: FractionalRec) => (r.ball ? { names: r.ball.names, now: r.ball.now } : null);

function Clients({ r }: { r: FractionalRec }) {
  if (!r.clients?.line) return <span className="fr-muted">Not on file</span>;
  return (
    <span className="fr-clients">
      <span className="fr-clients-l">{r.clients.line}</span>
      {r.clients.from === "seats" && <span className="fr-sub">From their seats</span>}
    </span>
  );
}

function Seats({ r }: { r: FractionalRec }) {
  return (
    <span className="fr-seats num">
      <span>
        <b>{r.now}</b> now
      </span>
      <span>
        <b>{r.past}</b> past
      </span>
    </span>
  );
}

function Row({ r, on, onOpen, reload }: { r: FractionalRec; on: boolean; onOpen: () => void; reload: () => Promise<void> }) {
  return (
    <tr className={`fr-row${on ? " on" : ""}`} onClick={(e) => !(e.target as HTMLElement).closest("button, a") && onOpen()}>
      <td>
        <button type="button" className="fr-rowbtn" onClick={onOpen} aria-label={`Open ${r.name ?? "this fractional"}'s record`}>
          <Who r={r} />
        </button>
      </td>
      <td>
        <span className="fr-title">{leadTitle(r)}</span>
        <span className="fr-sub">{levelLine(r)}</span>
      </td>
      <td>
        <Clients r={r} />
      </td>
      <td>
        <Seats r={r} />
      </td>
      <td className="fr-act-cell">
        <Action r={r} reload={reload} />
      </td>
    </tr>
  );
}

function Card({ r, onOpen, reload }: { r: FractionalRec; onOpen: () => void; reload: () => Promise<void> }) {
  return (
    <article className="fr-card">
      <button type="button" className="fr-card-top" onClick={onOpen} aria-label={`Open ${r.name ?? "this fractional"}'s record`}>
        <Who r={r} />
        <span className="fr-card-seats num">
          <b>{r.now}</b> now · <b>{r.past}</b> past
        </span>
      </button>
      <span className="fr-title">{leadTitle(r)}</span>
      <span className="fr-sub">{levelLine(r)}</span>
      <Clients r={r} />
      <div className="fr-card-act">
        <Action r={r} reload={reload} wide />
      </div>
    </article>
  );
}

/* ---------- the one action ---------- */

function Action({ r, reload, wide }: { r: FractionalRec; reload: () => Promise<void>; wide?: boolean }) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const w = wide ? " fr-wide" : "";
  if (r.you) return null;
  if (r.locked && !r.onMerlin) {
    const unlock = async () => {
      setBusy(true);
      const out = await ui.act({ type: "unlockFractional", id: r.id });
      setBusy(false);
      if (out.ok) await reload();
    };
    return (
      <button type="button" className={`btn btn-sm fr-unlock${w}`} disabled={busy} aria-busy={busy} onClick={() => void unlock()}>
        <IconLock size={12} /> See who <span className="fr-unlock-c">· free</span>
      </button>
    );
  }
  if (r.onMerlin && r.memberId)
    return <ConnectButton member={{ id: r.memberId, first: r.first ?? "them" }} conversationId={r.conversationId} label="Message" className={`btn btn-sm${w}`} shared={sharedOf(r)} />;
  if (r.invite)
    return (
      <>
        <button ref={btn} type="button" className={`btn btn-sm${w}`} onClick={() => setInviting(true)}>
          {r.invite.at ? `Invited ${fmtStamp(r.invite.at)}` : "Invite to connect"}
        </button>
        {inviting && <InviteSheet r={r} onClose={() => setInviting(false)} restore={() => btn.current} reload={reload} />}
      </>
    );
  if (!r.onMerlin) return <span className="fr-muted fr-act-note">Unlock one of their companies to invite them</span>;
  return null;
}

/* ---------- Invite to connect ---------- */

/** The sheet from Invite to connect: who and why, a note in the member's voice with their link, Copy, Mark as sent. */
function InviteSheet({ r, onClose, restore, reload }: { r: FractionalRec; onClose: () => void; restore: () => HTMLElement | null; reload: () => Promise<void> }) {
  const ui = useUi();
  const toast = useToast();
  const id = useId();
  const first = r.first ?? "them";
  const link = `${typeof window === "undefined" ? "" : window.location.origin}${r.invite!.path}`;
  const me = ui.me;
  const [text, setText] = useState(
    () =>
      draftNote(
        {
          kind: "peerInvite",
          company: "",
          to: { name: r.name ?? first, email: null, from: "unlocked on Merlin" },
          since: null,
          saw: null,
          me: { first: me.name.split(/\s+/)[0] ?? me.name, name: me.name, as: myWords(me.title, me.function), fn: me.function, clients: clientKinds(me.icp) },
          seat: r.fn && r.fn !== me.function ? r.fn : null,
          role: null,
          link,
          shared: sharedOf(r),
        },
        me.voice ?? null,
      ).body,
  );
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [text]);
  const kept = text.includes(link);
  const why = r.clients?.line
    ? `${first} serves ${r.clients.line}${r.fits ? ", like you" : ""}${r.fn && me.function && r.fn !== me.function ? ", in a different function" : ""}.`
    : null;
  const copy = async () => {
    const ok = await copyText(text);
    toast(ok ? "Note copied. Paste it wherever you can reach them." : "That didn't copy. Select the note and copy it yourself.", !ok);
  };
  const sent = async () => {
    setBusy(true);
    const out = await ui.act({ type: "invite", engagementId: r.invite!.seat, note: text }, { quiet: true });
    setBusy(false);
    if (out.ok) {
      toast(`Marked as sent. When ${first} joins through your link, you're connected.`);
      await reload();
      onClose();
    }
  };
  return (
    <Sheet title={`Invite ${first} to connect`} onClose={onClose} dialog className="fr-invite" restore={restore}>
      <div className="fr-inv">
        <div className="fr-inv-who">
          <Avatar r={r} />
          <span className="fr-who-t">
            <span className="fr-name">{r.name}</span>
            <span className="fr-sub">
              {leadTitle(r)} · Not on Merlin yet
            </span>
          </span>
          {why && (
            <p className="fr-inv-why">
              <b>Why {first}.</b> {why}
            </p>
          )}
        </div>
        <label className="fr-inv-l" htmlFor={`${id}-note`}>
          Your note, drafted for you to edit{me.voice ? " in your voice" : ""}
        </label>
        <textarea ref={box} id={`${id}-note`} className="input fr-inv-text" value={text} rows={7} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        {kept ? (
          <p className="fr-inv-link">The link is yours. It opens {first}&apos;s seats on Merlin and connects you when they join.</p>
        ) : (
          <p className="fr-inv-warn" role="alert">
            Keep the link in it. It&apos;s how {first} joins and connects with you.
          </p>
        )}
        <div className="fr-inv-acts">
          <button type="button" className="btn btn-pine" onClick={() => void copy()}>
            Copy
          </button>
          <button type="button" className="btn" disabled={busy} aria-busy={busy} onClick={() => void sent()}>
            <IconCheck size={13} /> Mark as sent
          </button>
          <button type="button" className="btn btn-ghost fr-inv-later" onClick={onClose}>
            Not now
          </button>
        </div>
        <p className="fr-inv-note">
          Merlin doesn&apos;t have their email. You send this yourself, and when they join you&apos;re connected and you both earn credits ({REFERRAL_BONUS} each when they&apos;re new to Merlin).
        </p>
      </div>
    </Sheet>
  );
}

/* ---------- the record ---------- */

function Record({
  r,
  seatIndex,
  waiting,
  pos,
  onMove,
  onClose,
  reload,
  phone,
}: {
  r: FractionalRec;
  seatIndex: Map<string, SeatAt>;
  waiting: boolean;
  pos: { at: number; of: number } | null;
  onMove: (d: number) => void;
  onClose: () => void;
  reload: () => Promise<void>;
  phone: boolean;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), [r.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const c = r.clients;
  const they = r.first ?? "they";
  const seatsN = r.now + r.past;
  return (
    <aside className={phone ? "fr-rsheet" : "fr-drawer"} role="dialog" aria-modal={phone} aria-labelledby="fr-rec-h">
      <div className="fr-dbar">
        <button type="button" className="fr-iconbtn" aria-label="Close the record" onClick={onClose}>
          <IconX size={16} />
        </button>
        {pos && (
          <span className="fr-dpos num">
            {pos.at} of {pos.of.toLocaleString("en-US")}
          </span>
        )}
        <span className="fr-dname">{r.locked ? "A fractional" : r.name}</span>
        <span className="fr-dnav">
          <button type="button" className="fr-iconbtn" aria-label="Previous" disabled={!pos || pos.at <= 1} onClick={() => onMove(-1)}>
            <IconChevron dir="up" />
          </button>
          <button type="button" className="fr-iconbtn" aria-label="Next" disabled={!pos || pos.at >= pos.of} onClick={() => onMove(1)}>
            <IconChevron dir="down" />
          </button>
        </span>
      </div>
      <div className="fr-dbody">
        <header className="fr-rhead">
          <Avatar r={r} size="lg" />
          <div>
            <h2 className="fr-rname" id="fr-rec-h" ref={head} tabIndex={-1}>
              {r.locked ? <LockedPerson seed={r.id} /> : r.name}
            </h2>
            <p className="fr-rsub">{[leadTitle(r), levelLine(r)].filter(Boolean).join(" · ")}</p>
          </div>
        </header>
        <p className="fr-rline num">
          <b>{r.now}</b> current fractional {r.now === 1 ? "seat" : "seats"}, <b>{r.past}</b> past
        </p>
        <p className="fr-rtags">
          {r.you ? (
            <span className="fr-tag fr-tag-on">{r.hidden ? "Your record. You're hidden from other members." : "Your record"}</span>
          ) : r.onMerlin ? (
            <span className="fr-tag fr-tag-on">
              <IconCheck size={12} /> On Merlin{r.since ? ` since ${fmtMonth(r.since.slice(0, 7))}` : ""}
            </span>
          ) : (
            <span className="fr-tag">Not on Merlin yet</span>
          )}
          {r.unlocked && <span className="fr-tag-note">You unlocked {they === "they" ? "them" : they}</span>}
          <BallChip r={r} />
        </p>
        <div className="fr-ract">
          <Action r={r} reload={reload} />
        </div>
        {r.locked && !r.onMerlin && (
          <p className="fr-rnote">Fellow fractionals are free to see. Open it to see who this is.</p>
        )}
        {!r.locked && !r.onMerlin && !r.you && (
          <p className="fr-rnote">
            Merlin doesn&apos;t have {they === "they" ? "their" : `${they}'s`} email. You send the invite yourself, and when {they} joins you&apos;re connected and you both earn credits.
          </p>
        )}

        <section className="fr-rsec" aria-labelledby="fr-serve-h">
          <h3 id="fr-serve-h">
            Who {r.you ? "you serve" : "they serve"}
            {c?.from === "seats" && <span className="fr-rsec-sub">read from {r.you ? "your" : "their"} seats</span>}
          </h3>
          {c ? (
            <dl className="fr-serve">
              {c.industries.length > 0 && <ServeRow label="Industries" list={c.industries.slice(0, 6)} />}
              {c.employees.length > 0 && <ServeRow label="Size" list={c.employees.slice(0, 3).map((x) => `${x} employees`)} />}
              {c.revenue.length > 0 && <ServeRow label="Revenue" list={c.revenue.slice(0, 3)} />}
              {c.countries.length > 0 && <ServeRow label="Region" list={c.countries.slice(0, 4).map(countryShort)} />}
            </dl>
          ) : (
            <p className="fr-muted">Nothing on file yet.</p>
          )}
          {c?.from === "seats" && r.onMerlin && !r.you && <p className="fr-rnote">Until {they} says who {they === "they" ? "they serve" : "they serve"}, this is read from the companies of their seats.</p>}
        </section>

        <section className="fr-rsec" aria-labelledby="fr-seats-h">
          <h3 id="fr-seats-h">
            Fractional seats <span className="num fr-cnt">{seatsN}</span>
          </h3>
          {waiting ? (
            <p className="fr-muted" role="status">
              Loading their seats
            </p>
          ) : (
            <ul className="fr-rseats">
              {r.seats.map((s) => (
                <li key={s.id}>
                  <SeatCard at={seatIndex.get(s.id) ?? null} now={s.now} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="fr-rfoot">{r.onMerlin ? `From ${r.you ? "you" : r.first ?? "them"}, and Revenue Nomad research` : "From Revenue Nomad research"}</p>
      </div>
    </aside>
  );
}

function ServeRow({ label, list }: { label: string; list: string[] }) {
  return (
    <div className="fr-serve-row">
      <dt>{label}</dt>
      <dd>
        {list.map((x) => (
          <span key={x} className="chip fr-schip">
            {x}
          </span>
        ))}
      </dd>
    </div>
  );
}

/** "Fintech · 51–200 · $5M–$20M · MA": a company's free facts. */
function companyFacts(i: CoInfo): string {
  const co = i.c.cells;
  const country = countryOf(i.c);
  const region = regionOf(i.c);
  const place = region ?? (country ? countryShort(country) : null);
  return [shown(co.industry), shown(co.employees), shown(co.revenue), place].filter(Boolean).join(" · ");
}

/** One seat on the record, from the member's own table: a locked company shows only its free facts, and its own unlock. */
function SeatCard({ at, now }: { at: SeatAt | null; now: boolean }) {
  const ui = useUi();
  if (!at) return <div className="fr-seat fr-seat-gone">A seat that isn&apos;t on your table right now.</div>;
  const { i, e } = at;
  const hidden = !!i.c.hidden;
  const role = shown(e.cells.role);
  const fn = shown(e.cells.function);
  const start = shown(e.cells.start);
  const end = shown(e.cells.end);
  const when = !start ? null : now ? `since ${fmtMonth(start)}` : end && end !== "Ongoing" ? `${fmtMonth(start)} to ${fmtMonth(end)}` : `started ${fmtMonth(start)}`;
  const what = [role ?? (fn ? `Fractional ${fn} seat` : "Fractional seat"), when].filter(Boolean).join(" · ");
  return (
    <div className={`fr-seat${hidden ? " fr-seat-locked" : ""}`}>
      <button type="button" className="fr-seat-main" onClick={() => ui.openCompany(i.c.id, e.id)} aria-label={hidden ? `Open this locked company's record` : `Open ${i.c.name}`}>
        <CompanyLogo name={hidden ? "" : i.c.name} domain={hidden ? null : i.c.iconDomain ?? i.domain} hidden={hidden} seed={i.c.id} />
        <span className="fr-seat-t">
          <span className="fr-seat-co">
            {hidden ? <LockedName seed={i.c.id} /> : i.c.name}
            {e.yours && <span className="fr-yours">Yours</span>}
          </span>
          <span className="fr-sub">{companyFacts(i)}</span>
          <span className="fr-seat-what">{what}</span>
        </span>
        <span className={`fr-seat-state${now ? " on" : ""}`}>{now ? "Active" : "Ended"}</span>
      </button>
      {hidden && (
        <div className="fr-seat-unlock">
          <button type="button" className="btn btn-sm fr-unlock" onClick={() => void ui.unlock({ entity: "company", id: i.c.id, field: "identity" })}>
            <IconLock size={12} /> Unlock company <span className="fr-unlock-c">· {freeCompanyNow(ui.me) ? "free today" : `${COMPANY_PRICE} credits`}</span>
          </button>
        </div>
      )}
    </div>
  );
}
