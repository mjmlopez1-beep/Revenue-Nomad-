"use client";

/**
 * Phone card list: one card per company, engagement or person. A label on the left, the fact
 * on the right, one tap each (44px rows). A card shows a fact row only when it says something
 * about this record: a value, the member's own seat, an open seat, or the one lock worth a tap
 * (the role, the name). What every card would repeat stays off the card.
 *
 * The card itself opens the record, and a tap meant for it never spends a credit. A locked
 * company's card has no unlock button at all: its record's sticky bar holds the one unlock.
 * The one exception is the radar's day (`signals`, Radar.tsx): each card says what happened there
 * and carries its own button, Unlock company for a locked company, Open for one the member knows.
 */
import { memo } from "react";
import type { Me } from "@/lib/tableTypes";
import { COMPANY_PRICE_SAY } from "@/lib/tableFields";
import { AddPill, CompanyLogo, IconLock, IconStar, LockedName, LockedSite, fmtMonth, val } from "../ui/shared";
import { cardSeat, coverOf, hireOfRow, isOpenRole, personBothLocked, personCoverOf, personNoun, isUnheldOpenRole, known, seatBothLocked, seatNoun, seatWhat, type HireCtx, type Row, type Tab } from "./model";
import { YourSeat, earnNote, useCellUi } from "./ui";
import { Fit, FnChips, HeldBy, HireLine, LOCKED_TIP, RowFact, SignalLines, UnlockedTag, type SignalRows } from "./Tables";
import { RoleDate } from "./RoleDate";
import { useFitWhy } from "./Hunt";

/**
 * The card's title is a heading with a button in it, so a keyboard (a desktop at 200% zoom gets
 * these cards) can reach and open every record. A tap anywhere on the card does the same.
 */
function Head({ r, right, onOpen }: { r: Row; right?: React.ReactNode; onOpen: (r: Row) => void }) {
  const i = r.i;
  const why = useFitWhy(i);
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen(r);
  };
  if (i.c.hidden)
    return (
      <div className="tp-pcard-top">
        <span className="tp-co tp-co-hidden">
          <CompanyLogo name="" domain={null} hidden seed={i.c.id} />
          <span className="tp-co-text">
            <h3 className="tp-pcard-h">
              <button type="button" className="tp-pcard-open tp-co-name" onClick={open} title={LOCKED_TIP}>
                <span className="tp-hidden-name">
                  <LockedName seed={i.c.id} />
                </span>
                <span className="sr-only">. Open the record to see what unlocking it shows.</span>
              </button>
            </h3>
            <LockedSite seed={i.c.id} className="tp-co-dom" />
            {why && <span className="hunt-why">{why}</span>}
          </span>
        </span>
        {right}
      </div>
    );
  return (
    <div className="tp-pcard-top">
      <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} />
      <div className="tp-pcard-name">
        <h3 className="tp-pcard-h">
          <button type="button" className="tp-pcard-open tp-co-name" title={i.c.name} onClick={open}>
            <span className="tp-co-name-t">{i.c.name}</span>
            {i.c.following && (
              <span className="tp-co-star" title="You follow this company">
                <IconStar size={11} filled />
                <span className="sr-only">, followed</span>
              </span>
            )}
            <span className="sr-only">. Open the record.</span>
          </button>
        </h3>
        {i.domain && <span className="tp-co-dom mono">{i.domain}</span>}
        {why && <span className="hunt-why">{why}</span>}
        {/* A company card says it beside its Hiring now chip (Fit). Seat and person cards say it here. */}
        {!right && i.c.unlocked && i.c.friendly.open > 0 && <UnlockedTag />}
      </div>
      {right}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tp-pfact">
      <span className="tp-pfact-l">{label}</span>
      {children}
    </div>
  );
}

/**
 * What a locked company's card holds back, as plain text. Not a button: the card opens the
 * record, and the record's sticky bar has "Unlock company · 2 credits". `roles`: an open role
 * here, whose job posting comes with the company.
 */
function HiddenLine({ rate, roles = true }: { rate: boolean; roles?: boolean }) {
  // The rate only when the posting gave one: a card never promises a rate that isn't there (C49).
  return (
    <div className="tp-pcard-hidden">
      <IconLock />
      <span>
        {!roles ? "Unlock company" : rate ? "Company, posting and rate" : "Company and posting"} <span className="tp-pcard-hidden-cost">· {COMPANY_PRICE_SAY}{roles ? " together" : ""}</span>
      </span>
    </div>
  );
}

const shownCell = (c: { s: string } | undefined) => !!c && c.s !== "empty" && c.s !== "locked";

/** A company's firmographics in one line (industry, size, revenue, HQ), so a member can tell whether it's worth opening. */
function firmo(c: Row["i"]["c"]): string[] {
  const emp = val(c.cells.employees);
  const rev = val(c.cells.revenue);
  return [val(c.cells.industry), emp && `${emp} employees`, rev && `${rev} revenue`, val(c.cells.hq)].filter(Boolean) as string[];
}

function FirmoLine({ c }: { c: Row["i"]["c"] }) {
  const line = firmo(c);
  return <div className="tp-pcard-line">{line.length ? line.join(" · ") : <span className="tp-faint">No industry, size, revenue or HQ on file yet</span>}</div>;
}

/**
 * The radar's day: the company, what happened there and one button that spends
 * nothing by accident (it is its own tap, never the card's).
 */
const SignalCard = memo(function SignalCard({ r, onOpen, lines, action }: { r: Row; onOpen: (r: Row) => void; lines: string[]; action: SignalRows["action"] }) {
  return (
    <article className="tp-pcard rd-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} onOpen={onOpen} />
      {/* The header already gives the industry, size and revenue: the card says what happened, then the button. */}
      <SignalLines lines={lines} />
      <div className="rd-pcard-act" onClick={(e) => e.stopPropagation()}>
        {action(r.i)}
      </div>
    </article>
  );
});
const NO_LINES: string[] = [];

const CompanyCard = memo(function CompanyCard({ r, me, onOpen, miss: showMiss, hire }: { r: Row; me: Me; onOpen: (r: Row) => void; miss: boolean; hire?: HireCtx | null }) {
  const ui = useCellUi();
  const i = r.i;
  const c = i.c;
  const at = c.hidden ? "this company" : c.name;
  // Recently hired: the card is about the hire it matched ("Hired a fractional CFO · Mar 2026") and who held that seat.
  const hired = hire ? hireOfRow(r, hire.fns, hire.within) : null;
  // A hidden company is about its open role. Any other company leads with a seat in the member's
  // function (one with its holder on file first), then a seat with a holder on file, then the latest (C45).
  const e = hired ?? cardSeat(i, me.function);
  const miss = c.facts.missing;
  const own = i.engs.find((x) => x.yours);
  // What the seat is: its function first ("RevOps seat"), then its type and when it started.
  const fn = e && val(e.cells.function);
  const type = e && val(e.cells.type);
  const start = e && !e.opened ? val(e.cells.start) : null;
  const when = [fn && `${fn} seat`, type, start && `since ${fmtMonth(start)}`].filter(Boolean).join(" · ");
  // One more row when it carries something: who held the seat (or that it's open), else the rate.
  const held = e && (e.yours || e.claimable || (isOpenRole(e) && e.cells.operator?.s === "empty") || shownCell(e.cells.operator) || e.cells.operator?.s === "locked");
  const rate = e && !held && shownCell(e.cells.rate);
  // The seat shown has no holder on file, but another seat here does: say so, so the card isn't read as "nobody on file".
  const otherHolder = !c.hidden && !!e && !known(e.cells.operator) && !e.yours && i.engs.some((x) => x !== e && known(x.cells.operator));
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      {/* The line under the header already gives a hidden company's industry, size and region. */}
      <Head r={r} right={<Fit i={i} />} onOpen={onOpen} />
      <FirmoLine c={c} />
      {(i.fns.length > 0 || own) && (
        <div className="tp-pcard-fns">
          {own && <YourSeat id={own.id} />}
          <FnChips i={i} mine={me.function} max={own ? 2 : 3} />
        </div>
      )}
      {hired ? (
        <HireLine e={hired} />
      ) : e?.opened ? (
        <div className="tp-pcard-role">
          {fn && <span className="tp-pcard-fn">{fn} · </span>}
          <RoleDate e={e} />
        </div>
      ) : (
        when && <div className="tp-pcard-when num">{when}</div>
      )}
      {c.hidden && hired ? (
        // A locked company that hired: who held the seat opens after the company, in its record.
        <HiddenLine rate={i.engs.some((x) => isOpenRole(x) && (x.cells.rate?.s === "locked" || x.cells.rate?.s === "value"))} roles={i.engs.some(isOpenRole)} />
      ) : c.hidden ? (
        <>
          {e && isOpenRole(e) && e.cells.role?.s === "value" && (
            <div className="tp-pfacts">
              <Fact label="Open role">{e.cells.role.v}</Fact>
            </div>
          )}
          {/* A past seat at a locked company: who held it opens after the company (a quiet lock, never a button). */}
          {e && !isOpenRole(e) && (e.cells.operator?.s === "locked" || e.claimable || e.yours) && (
            <div className="tp-pfacts">
              <Fact label="Held by">
                <HeldBy e={e} cover={coverOf(i, e, "operator")} />
              </Fact>
            </div>
          )}
          <HiddenLine rate={!!e && isOpenRole(e) && (e.cells.rate?.s === "locked" || e.cells.rate?.s === "value")} roles={!!e && isOpenRole(e)} />
        </>
      ) : (
        <div className="tp-pfacts">
          {e ? (
            <>
              {/* Who held the seat and their role are one purchase: while both are locked, one row and one lock for the two. The hire line already says a role it can see. */}
              {!seatBothLocked(e) && !hired && (
                <Fact label={isOpenRole(e) ? "Open role" : "Role"}>
                  <RowFact t={{ entity: "engagement", id: e.id, field: "role" }} at={at} cell={e.cells.role} cover={coverOf(i, e, "role")} noun={seatNoun(e, "role")} what={seatWhat(e, "role")} />
                </Fact>
              )}
              {held && (
                <Fact label={seatBothLocked(e) ? "Held by and role" : "Held by"}>
                  <HeldBy e={e} />
                </Fact>
              )}
              {rate && (
                <Fact label={isUnheldOpenRole(e) ? "Posted rate" : "Rate"}>
                  <RowFact t={{ entity: "engagement", id: e.id, field: "rate" }} at={at} cell={e.cells.rate} />
                </Fact>
              )}
            </>
          ) : (
            <Fact label="Seat">
              <AddPill label="Add your seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: c.id, mode: "engagement" })} />
            </Fact>
          )}
        </div>
      )}
      {otherHolder && <div className="tp-pcard-when">Another seat here has its holder on file. Open the record to see it.</div>}
      {/* Facts at a hidden company can't be added until it is unlocked, so the card doesn't offer them. */}
      {showMiss && miss > 0 && !c.hidden && (
        <div className="tp-pcard-miss">
          <span className="num">{miss}</span> {miss === 1 ? "thing" : "things"} still missing here.{earnNote(me).capped ? "" : miss === 1 ? " Add it and earn a credit." : " Add one and earn a credit."}
        </div>
      )}
    </article>
  );
});

const EngCard = memo(function EngCard({ r, me, onOpen }: { r: Row; me: Me; onOpen: (r: Row) => void }) {
  const e = r.e!;
  const i = r.i;
  const at = i.c.hidden ? "this company" : i.c.name;
  const t = (field: string) => ({ entity: "engagement" as const, id: e.id, field });
  const fn = val(e.cells.function);
  const type = val(e.cells.type);
  const start = val(e.cells.start);
  const openRole = isOpenRole(e);
  // The rate row only when there is a rate to see or unlock (adding one is in the record).
  const rate = e.cells.rate?.s === "value" || (e.cells.rate?.s === "locked" && !i.c.hidden);
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} onOpen={onOpen} />
      <FirmoLine c={i.c} />
      <div className="tp-pcard-fns">
        {fn ? <span className={`chip tp-fn${fn === me.function ? " tp-fn-me" : ""}`}>{fn}</span> : <RowFact t={t("function")} at={at} cell={e.cells.function} addLabel="Function" />}
        {type ? <span className="chip tp-fn">{type}</span> : null}
        {start && !e.opened && <span className="num tp-pcard-when">{fmtMonth(start)}</span>}
        <RoleDate e={e} />
      </div>
      {i.c.hidden ? (
        <>
          {openRole && e.cells.role?.s === "value" && (
            <div className="tp-pfacts">
              <Fact label="Open role">{e.cells.role.v}</Fact>
            </div>
          )}
          {!openRole && (e.cells.operator?.s === "locked" || e.claimable || e.yours) && (
            <div className="tp-pfacts">
              <Fact label="Held by">
                <HeldBy e={e} cover={coverOf(i, e, "operator")} />
              </Fact>
            </div>
          )}
          <HiddenLine rate={openRole && (e.cells.rate?.s === "locked" || e.cells.rate?.s === "value")} roles={openRole} />
          {e.cells.rate?.s === "value" && (
            <div className="tp-pfacts">
              <Fact label="Posted rate">
                <RowFact t={t("rate")} at={at} cell={e.cells.rate} />
              </Fact>
            </div>
          )}
        </>
      ) : (
        <div className="tp-pfacts">
          {/* Who held the seat and their role are one purchase: while both are locked, one row and one lock for the two. */}
          {!seatBothLocked(e) && (
            <Fact label={openRole ? "Open role" : "Role"}>
              <RowFact t={t("role")} at={at} cell={e.cells.role} cover={coverOf(i, e, "role")} noun={seatNoun(e, "role")} what={seatWhat(e, "role")} />
            </Fact>
          )}
          <Fact label={seatBothLocked(e) ? "Held by and role" : "Held by"}>
            <HeldBy e={e} />
          </Fact>
          {rate && (
            <Fact label={isUnheldOpenRole(e) ? "Posted rate" : "Rate"}>
              <RowFact t={t("rate")} at={at} cell={e.cells.rate} />
            </Fact>
          )}
        </div>
      )}
    </article>
  );
});

const PersonCard = memo(function PersonCard({ r, onOpen }: { r: Row; onOpen: (r: Row) => void }) {
  const p = r.p!;
  const i = r.i;
  const at = i.c.hidden ? "this company" : i.c.name;
  const t = (field: string) => ({ entity: "contact" as const, id: p.id, field });
  const title = val(p.cells.title);
  const rel = val(p.cells.relationship);
  // A locked name and title are one purchase: one row ("Name and title") and one lock for the two.
  const both = personBothLocked(p.cells);
  // A title can't be added to a person the member can't see yet.
  const titleAddable = p.cells.title?.s !== "empty" || p.cells.name?.s !== "locked";
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} onOpen={onOpen} />
      <FirmoLine c={i.c} />
      <div className="tp-pcard-fns">
        {title ? (
          <span className="tp-pcard-title">{title}</span>
        ) : (
          !both && titleAddable && <RowFact t={t("title")} at={at} cell={p.cells.title} addLabel="Title" cover={personCoverOf(i, r.e, p, "title")} noun={personNoun(p.cells, "title")} />
        )}
        {rel ? <span className="chip tp-fn">{rel}</span> : <RowFact t={t("relationship")} at={at} cell={p.cells.relationship} addLabel="Relationship" />}
      </div>
      {/* At a hidden company the name is a quiet lock ("Opens after the company"): the card opens the record, which unlocks it. */}
      <div className="tp-pfacts">
        <Fact label={both ? "Name and title" : "Name"}>
          <RowFact t={t("name")} at={at} cell={p.cells.name} cover={personCoverOf(i, r.e, p, "name")} noun={personNoun(p.cells, "name")} />
        </Fact>
        {p.cells.email?.s !== "empty" && p.cells.email && (
          <Fact label="Email">
            <RowFact t={t("email")} at={at} cell={p.cells.email} cover={personCoverOf(i, r.e, p, "email")} />
          </Fact>
        )}
      </div>
    </article>
  );
});

export function CardList({
  type,
  rows,
  me,
  onOpen,
  tab,
  hire = null,
  signals = null,
}: {
  type: "companies" | "engagements" | "people";
  rows: Row[];
  me: Me;
  onOpen: (r: Row) => void;
  tab?: Tab;
  /** Recently hired is on: company cards lead with the hire they matched. */
  hire?: HireCtx | null;
  /** The radar's day: each company's lines and its own button (SignalCard). */
  signals?: SignalRows | null;
}) {
  // "N things still missing here" belongs to Needs facts. Without the tab, every card keeps it.
  const miss = !tab || tab === "needs";
  return (
    <div className="tp-cards">
      {rows.map((r) =>
        type === "companies" && signals ? (
          <SignalCard key={r.key} r={r} onOpen={onOpen} lines={signals.lines.get(r.i.c.id) ?? NO_LINES} action={signals.action} />
        ) : type === "companies" ? (
          <CompanyCard key={r.key} r={r} me={me} onOpen={onOpen} miss={miss} hire={hire} />
        ) : type === "engagements" ? (
          <EngCard key={r.key} r={r} me={me} onOpen={onOpen} />
        ) : (
          <PersonCard key={r.key} r={r} onOpen={onOpen} />
        ),
      )}
    </div>
  );
}
