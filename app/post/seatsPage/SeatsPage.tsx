"use client";

/**
 * Seats (Seats.dc.html, behind RN_UI2): a full-width workbench page with three tabs at its foot.
 *
 *   All seats                 every seat on file (the table listing seats: its filters, sort, address)
 *   Seats that ended lately   the same with "A seat ended in the last 90 days" on, newest end first
 *   Your seats                the member's own seats (the page "seats", so ?p=seats lands here)
 *
 * The page registry mounts it twice (shell/pages.tsx): in the table's place while the table lists
 * seats (`at="data"`), and as the page "seats" (`at="mine"`). Switching tabs moves the place, so the
 * address, the rail and the breadcrumb follow.
 *
 * First visit (no seat under the member's name yet): opening Seats lands on Your seats once a
 * visit, at Getting started's step 2, with Merlin's guesses to confirm in one tap.
 *
 * Phones keep today's pages: the card list for the data tabs, and today's Your seats (Seats.tsx),
 * under the same three tabs.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconPlus } from "../../ui/shared";
import { CardList } from "../Cards";
import { endedTest, rowsFor } from "../model";
import { Seats } from "../Seats";
import { PageStrip } from "../shell/PageStrip";
import { useApp } from "../shell/pages";
import { firstOf, ownOf } from "../firstVisit";
import { ENDED_MONTHS, endedFilters, sortEnded, tabOf, type SeatTab } from "./seatsModel";
import { SeatsData } from "./SeatsData";
import { YourSeats } from "./YourSeats";
import "../workbench/workbench.css";
import "./seatsPage.css";

const TITLE: Record<SeatTab, string> = { all: "All seats", ended: "Seats that ended lately", mine: "Your seats" };
/** A phone's tabs, short enough to sit side by side. */
const SHORT: Record<SeatTab, string> = { all: "All", ended: "Ended lately", mine: "Yours" };

/** The first visit lands on Your seats once per browser session (sessionStorage), never in a loop. */
const landedKey = (id: string) => `sp_landed_${id}`;
const landed = (id: string) => {
  try {
    return sessionStorage.getItem(landedKey(id)) === "1";
  } catch {
    return true;
  }
};
const markLanded = (id: string) => {
  try {
    sessionStorage.setItem(landedKey(id), "1");
  } catch {
    /* nothing to remember it in: no landing */
  }
};

export function SeatsPage({ at }: { at: "data" | "mine" }) {
  const c = useApp();
  const t = c.table;
  const tab = tabOf(at, t.filters);
  const seats = c.shell.seats;
  const [first] = useState(() => firstOf("seats", ownOf("seats", c.me, c.view, { seats: seats.length })).first);

  // First visit: the table's Seats lands on Your seats, once.
  useEffect(() => {
    if (at === "mine") return markLanded(c.me.id);
    if (!first || landed(c.me.id) || t.filters.endedWithin > 0) return;
    markLanded(c.me.id);
    c.openSeats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const all = rowsFor("engagements", c.infos);
    const ended = endedTest(ENDED_MONTHS, []);
    return { all: all.length, ended: all.filter(ended).length, mine: seats.length };
  }, [c.infos, seats.length]);

  const go = (k: SeatTab) => {
    if (k === tab) return;
    if (k === "mine") return c.openSeats();
    const f = endedFilters(t.filters, k);
    if (at === "mine" || t.recordType !== "engagements" || t.tab === "hiring") {
      t.setRecordType("engagements");
      if (t.tab === "hiring") t.setTab("all");
      t.setFilters(f);
      return c.openPage("table");
    }
    t.setFilters(f);
  };
  const tabs = (
    <div role="tablist" aria-label="Seat tables" className="wb-bottom-tabs">
      {(["all", "ended", "mine"] as SeatTab[]).map((k) => (
        <button key={k} type="button" role="tab" aria-selected={k === tab} className={`wb-btab${k === tab ? " on" : ""}`} onClick={() => go(k)}>
          {c.phone ? <span aria-hidden>{SHORT[k]}</span> : TITLE[k]}
          {c.phone && <span className="sr-only">{TITLE[k]}</span>} · <span className="num">{counts[k].toLocaleString("en-US")}</span>
        </button>
      ))}
    </div>
  );
  const bottom = (status: ReactNode) => (
    <div className="wb-bottom">
      {tabs}
      {status}
    </div>
  );

  /* ----- phones: today's pages under the three tabs ----- */
  if (c.phone)
    return (
      <div className="sp-phone">
        <h1 className="sr-only">Seats: {TITLE[tab]}</h1>
        <div className="sp-phone-tabs">{tabs}</div>
        <PageStrip page="seats" own={seats.length} />
        {tab === "mine" ? (
          <Seats seats={seats} infos={c.infos} focus={c.shell.seatFocus} search={c.shell.seatSearch} back={c.shell.seatBack} />
        ) : (
          <PhoneList ended={tab === "ended"} />
        )}
        {/* The main action in thumb reach, as on today's phone table. */}
        <button type="button" className="btn btn-volt tp-fab" onClick={() => c.openAdd(tab === "mine" ? { mine: true } : undefined)}>
          <IconPlus size={18} /> {tab === "mine" ? "Add a seat you held" : "Add what you know"}
        </button>
      </div>
    );

  return (
    <div className="wb sp">
      <h1 className="sr-only">Seats: {TITLE[tab]}</h1>
      {tab === "mine" ? <YourSeats bottom={bottom} /> : <SeatsData tab={tab} bottom={bottom} />}
    </div>
  );
}

/** A phone's seats: the card list, as today, with Show more. */
function PhoneList({ ended }: { ended: boolean }) {
  const c = useApp();
  const t = c.table;
  const [limit, setLimit] = useState(50);
  const rows = useMemo(() => (ended && !t.sortPicked ? sortEnded(t.rows) : t.rows), [ended, t.sortPicked, t.rows]);
  return (
    <div className="wb-phone">
      {ended && <p className="wb-icp-line">Seats that ended in the last 90 days. How long ago is free; the exact month costs 1 credit.</p>}
      <CardList type="engagements" rows={rows.slice(0, limit)} me={c.me} onOpen={(r) => c.openCompany(r.i.c.id, r.key)} tab={t.tab} />
      {rows.length > limit && (
        <button type="button" className="btn wb-more" onClick={() => setLimit((n) => n + 50)}>
          Show {Math.min(50, rows.length - limit)} more
        </button>
      )}
    </div>
  );
}
