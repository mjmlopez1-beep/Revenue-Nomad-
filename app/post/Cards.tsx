"use client";

/**
 * Phone card list: one card per company, engagement or person. A label on the left, the fact
 * on the right, one tap each (44px rows). A card shows a fact row only when it says something
 * about this record: a value, the member's own seat, an open seat, or the one lock worth a tap
 * (the role, the name). What every card would repeat stays off the card.
 *
 * The card itself opens the record, and a tap meant for it never spends a credit. A hidden
 * company's card has no unlock button at all: its record's sticky bar holds the one unlock.
 */
import { memo } from "react";
import type { Me } from "@/lib/tableTypes";
import { AddPill, CompanyLogo, IconLock, IconStar, fmtMonth, val } from "../ui/shared";
import { coverOf, isOpenRole, isUnheldOpenRole, type Row, type Tab } from "./model";
import { YourSeat, earnNote, useCellUi } from "./ui";
import { Fit, FnChips, HeldBy, RowFact } from "./Tables";
import { RoleDate } from "./RoleDate";

/**
 * The card's title is a heading with a button in it, so a keyboard (a desktop at 200% zoom gets
 * these cards) can reach and open every record. A tap anywhere on the card does the same.
 */
function Head({ r, right, onOpen }: { r: Row; right?: React.ReactNode; onOpen: (r: Row) => void }) {
  const i = r.i;
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen(r);
  };
  if (i.c.hidden)
    return (
      <div className="tp-pcard-top">
        <span className="tp-co tp-co-hidden">
          <CompanyLogo name="" domain={null} hidden />
          <span className="tp-co-text">
            <h3 className="tp-pcard-h">
              <button type="button" className="tp-pcard-open tp-co-name" onClick={open} title="This company has an open role, so its name is hidden until you unlock it.">
                <span className="tp-hidden-name">Hidden company</span>
                <span className="sr-only">. Open the record to see what unlocking it shows.</span>
              </button>
            </h3>
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
 * What a hidden company's card holds back, as plain text. Not a button: the card opens the
 * record, and the record's sticky bar has "Unlock this role · 1 credit".
 */
function HiddenLine() {
  return (
    <div className="tp-pcard-hidden">
      <IconLock />
      <span>
        Company, role and job posting <span className="tp-pcard-hidden-cost">· 1 credit together</span>
      </span>
    </div>
  );
}

const shownCell = (c: { s: string } | undefined) => !!c && c.s !== "empty" && c.s !== "locked";

const CompanyCard = memo(function CompanyCard({ r, me, onOpen, miss: showMiss }: { r: Row; me: Me; onOpen: (r: Row) => void; miss: boolean }) {
  const ui = useCellUi();
  const i = r.i;
  const c = i.c;
  const at = c.hidden ? "the hidden company" : c.name;
  const open = i.engs.find(isOpenRole) ?? null;
  // A hidden company is about its open role. Any other company leads with its latest seat.
  const e = c.hidden ? open ?? i.latest : i.latest;
  const emp = val(c.cells.employees);
  const line = [val(c.cells.industry), emp && `${emp} employees`, val(c.cells.hq)].filter(Boolean);
  const miss = c.facts.missing;
  const own = i.engs.find((x) => x.yours);
  // The free facts of the latest seat that tell it apart: its type and when it started.
  const type = e && val(e.cells.type);
  const start = e && !e.opened ? val(e.cells.start) : null;
  const when = [type, start && `since ${fmtMonth(start)}`].filter(Boolean).join(" · ");
  // One more row when it carries something: who held the seat (or that it's open), else the rate.
  const held = e && (e.yours || (isOpenRole(e) && e.cells.operator?.s === "empty") || shownCell(e.cells.operator));
  const rate = e && !held && shownCell(e.cells.rate);
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      {/* The line under the header already gives a hidden company's industry, size and region. */}
      <Head r={r} right={<Fit i={i} />} onOpen={onOpen} />
      <div className="tp-pcard-line">{line.length ? line.join(" · ") : <span className="tp-faint">No industry, size or HQ on file yet</span>}</div>
      {(i.fns.length > 0 || own) && (
        <div className="tp-pcard-fns">
          {own && <YourSeat id={own.id} />}
          <FnChips i={i} mine={me.function} max={own ? 2 : 3} />
        </div>
      )}
      {e?.opened ? (
        <div className="tp-pcard-role">
          <RoleDate e={e} />
        </div>
      ) : (
        when && <div className="tp-pcard-when num">{when}</div>
      )}
      {c.hidden ? (
        <HiddenLine />
      ) : (
        <div className="tp-pfacts">
          {e ? (
            <>
              <Fact label={isOpenRole(e) ? "Open role" : "Role"}>
                <RowFact t={{ entity: "engagement", id: e.id, field: "role" }} at={at} cell={e.cells.role} cover={coverOf(i, e, "role")} />
              </Fact>
              {held && (
                <Fact label="Held by">
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
              <AddPill label="Add a seat" earn={!earnNote(ui.me).capped} onAdd={() => ui.openAdd({ companyId: c.id, mode: "engagement" })} />
            </Fact>
          )}
        </div>
      )}
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
  const at = i.c.hidden ? "the hidden company" : i.c.name;
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
      <div className="tp-pcard-fns">
        {fn ? <span className={`chip tp-fn${fn === me.function ? " tp-fn-me" : ""}`}>{fn}</span> : <RowFact t={t("function")} at={at} cell={e.cells.function} addLabel="Function" />}
        {type ? <span className="chip tp-fn">{type}</span> : null}
        {start && !e.opened && <span className="num tp-pcard-when">{fmtMonth(start)}</span>}
        <RoleDate e={e} />
      </div>
      {i.c.hidden ? (
        <>
          <HiddenLine />
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
          <Fact label={openRole ? "Open role" : "Role"}>
            <RowFact t={t("role")} at={at} cell={e.cells.role} cover={coverOf(i, e, "role")} />
          </Fact>
          <Fact label="Held by">
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
  const at = i.c.hidden ? "the hidden company" : i.c.name;
  const t = (field: string) => ({ entity: "contact" as const, id: p.id, field });
  const title = val(p.cells.title);
  const rel = val(p.cells.relationship);
  return (
    <article className="tp-pcard" onClick={() => onOpen(r)} data-row={r.key}>
      <Head r={r} onOpen={onOpen} />
      <div className="tp-pcard-fns">
        {title ? <span className="tp-pcard-title">{title}</span> : <RowFact t={t("title")} at={at} cell={p.cells.title} addLabel="Title" />}
        {rel ? <span className="chip tp-fn">{rel}</span> : <RowFact t={t("relationship")} at={at} cell={p.cells.relationship} addLabel="Relationship" />}
      </div>
      {/* At a hidden company the name is a quiet lock: the card opens the record, which unlocks it. */}
      <div className="tp-pfacts">
        <Fact label="Name">
          <RowFact t={t("name")} at={at} cell={p.cells.name} cover={coverOf(i, r.e, "name")} />
        </Fact>
        {p.cells.email?.s !== "empty" && p.cells.email && (
          <Fact label="Email">
            <RowFact t={t("email")} at={at} cell={p.cells.email} cover={coverOf(i, r.e, "email")} />
          </Fact>
        )}
      </div>
    </article>
  );
});

export function CardList({ type, rows, me, onOpen, tab }: { type: "companies" | "engagements" | "people"; rows: Row[]; me: Me; onOpen: (r: Row) => void; tab?: Tab }) {
  // "N things still missing here" belongs to Needs facts. Without the tab, every card keeps it.
  const miss = !tab || tab === "needs";
  return (
    <div className="tp-cards">
      {rows.map((r) =>
        type === "companies" ? (
          <CompanyCard key={r.key} r={r} me={me} onOpen={onOpen} miss={miss} />
        ) : type === "engagements" ? (
          <EngCard key={r.key} r={r} me={me} onOpen={onOpen} />
        ) : (
          <PersonCard key={r.key} r={r} onOpen={onOpen} />
        ),
      )}
    </div>
  );
}
