"use client";

/**
 * Hiring now's right drawer for one open role (HiringNow.dc.html, the role panel): the role and who
 * is hiring, the posting (one purchase with its rate and hours once the company is open), Closest
 * evidence (Evidence Bank, Close only: a placeholder until it ships), the way in, and the actions:
 * open the company, draft a note, add to pipeline, pass to a fractional who fits better.
 *
 * Every lock here is the table's own cell (Tables.tsx RowFact, NameAndTitle) or the record's
 * Unlock company button, so it spends exactly as there: one purchase, the question first where
 * the app asks. Nothing in the drawer spends on a stray click.
 */
import { COMPANY_PRICE } from "@/lib/tableFields";
import type { Me, PersonRec } from "@/lib/tableTypes";
import { bestBuyer } from "@/lib/moves";
import { IconX } from "../../ui/shared";
import { NameAndTitle, engCell } from "../Tables";
import { UnlockCompany } from "../company/sections/Unlock";
import { openPlans } from "../Billing";
import { bundleLead, isOpenRole, shown, type CoInfo, type Row } from "../model";
import { fitOf, fnOf, listedOf, pastHires, rateOf, type Status, type WayIn } from "./hiringModel";

/** Who is hiring for a role: a person on the role marked Hiring for the seat, else the company's best buyer on file. */
export function whoIsHiring(i: CoInfo, r: Row, fn: string | null): { p: PersonRec; rel: string | null } | null {
  const e = r.e!;
  const onRole = e.people.find((p) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Hiring for the seat") ?? e.people[0];
  if (onRole) return { p: onRole, rel: shown(onRole.cells.relationship) };
  const b = bestBuyer(i.c, fn);
  return b ? { p: b.p, rel: b.rel } : null;
}

export const roleTitle = (r: Row) => {
  const e = r.e!;
  const fn = fnOf(e);
  return shown(e.cells.role) ?? (fn && fn !== "Other" ? `Fractional ${fn}` : "A fractional role");
};

export function RoleDrawer({
  r,
  me,
  status,
  way,
  inPipe,
  close,
  onClose,
  onOpenRecord,
  onNote,
  onPipeline,
  onPass,
  onAddPerson,
  onWay,
  onRates,
  line,
}: {
  r: Row;
  me: Me;
  status: Status;
  way: WayIn;
  inPipe: boolean;
  /** Close features are open (Evidence Bank is a Close feature). */
  close: boolean;
  onClose: () => void;
  onOpenRecord: () => void;
  onNote: () => void;
  onPipeline: () => void;
  onPass: () => void;
  onAddPerson: () => void;
  onWay: () => void;
  onRates: () => void;
  /** What just happened here ("Passed to Rita. You earn 5 credits when they pick it up."), with its link. */
  line: { text: string; go?: { label: string; do: () => void } } | null;
}) {
  const i = r.i;
  const e = r.e!;
  const c = i.c;
  const open = !c.hidden;
  const fn = fnOf(e);
  const fit = fitOf(r, me);
  const listed = listedOf(e);
  const rate = rateOf(r);
  const hoursOn = e.cells.hours && e.cells.hours.s !== "empty";
  const postOn = e.cells.posting?.s === "value";
  const bought = rate === "value" || postOn;
  const who = whoIsHiring(i, r, me.function);
  const facts = [shown(c.cells.industry), shown(c.cells.revenue), shown(c.cells.employees) ? `${shown(c.cells.employees)} people` : null, shown(c.cells.hq)].filter(Boolean).join(" · ");
  const roles = i.engs.filter(isOpenRole).length;
  const tags = [
    shown(e.cells.type),
    `Listed ${listed.day}`,
    fit.tier ? `${fit.label} fit: ${fit.why}` : "Not your function",
    `Past fractional hires: ${pastHires(i).replace(/^\d+ hires?: /, "")}`,
    ...(c.following ? ["You follow this company"] : []),
    ...(roles > 1 ? [`${roles} open roles here`] : []),
    ...(e.unseen ? ["Not seen in the last scan"] : []),
    open ? "Open for you" : "",
  ].filter(Boolean) as string[];
  const opens = me.proOpens;
  const primary: "open" | "pass" | "note" = !open ? "open" : fit.tier === 0 ? "pass" : status.k === "pitched" ? "open" : "note";
  const btn = (k: typeof primary | "pipe", on = false) => `hn-act${primary === k ? " hn-act-primary" : on ? " on" : ""}`;
  return (
    <aside className="wb-tools hn-drawer" aria-label="Role details">
      <div className="hn-dr">
        <div className="hn-dr-top">
          <span className="hn-cap">
            Open role · {fn ?? "Function not on file"} · {status.label}
          </span>
          <button type="button" className="hn-x" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <h2 className="hn-dr-role">{roleTitle(r)}</h2>
        <div className="hn-dr-co">
          <span className={`hn-tile${open ? "" : " locked"}`} aria-hidden>
            {open ? c.name.split(/\s+/).filter((w) => w !== "and").map((w) => w[0]).join("").slice(0, 2) : "?"}
          </span>
          <span className="hn-dr-co-t">
            <strong>{open ? c.name : "Locked company"}</strong>
            <span>{facts || i.teaser || "Industry, size and HQ not on file yet"}</span>
          </span>
        </div>
        <ul className="hn-tags" aria-label="About this role">
          {tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <section className="hn-box" aria-label="The posting">
          <h3>The posting</h3>
          {!open ? (
            <p>
              The title, function and listed date are free.{" "}
              {rate === "none" ? "No rate was posted. The posting and its hours open with the company." : "The posting, its rate and its hours open with the company."}
            </p>
          ) : bought ? (
            <>
              <p className="hn-post-facts">
                <strong>{rate === "none" ? "No rate posted" : engCell(i, e, "rate")}</strong>
                <strong>{hoursOn ? <>{engCell(i, e, "hours")} hours a week</> : "Hours not posted"}</strong>
              </p>
              {postOn && e.cells.posting?.s === "value" && /^https?:\/\//i.test(e.cells.posting.v) && (
                <a className="hn-link" href={e.cells.posting.v} target="_blank" rel="noopener noreferrer">
                  Read the full posting
                </a>
              )}
            </>
          ) : (
            <>
              <p>
                You can see this company, so its posting is one purchase: the full text{rate === "none" ? "" : ", the posted rate"} and the hours.{rate === "none" ? " No rate was posted." : ""}
              </p>
              <span className="hn-buy">{engCell(i, e, bundleLead(e) ?? "rate")}</span>
            </>
          )}
          <button type="button" className="tp-flink hn-link" onClick={onRates}>
            {fn ? `${fn} rate benchmarks` : "Rate benchmarks"}
          </button>
        </section>

        <section className="hn-sec" aria-label="Who is hiring">
          <h3 className="hn-k">Who is hiring</h3>
          {who ? (
            <div className="hn-who">
              <NameAndTitle i={i} e={e} p={who.p} />
              <span className="hn-sub">{open ? `${who.rel ?? "Hiring for the seat"}. Name and title are one purchase, 1 credit.` : "Hiring for the seat. Opens after the company, for 1 credit."}</span>
            </div>
          ) : (
            <div className="hn-who">
              <strong className="hn-muted">Nobody on file yet</strong>
              <span className="hn-sub">Know who is hiring here? Tell Merlin.</span>
              {open && (
                <button type="button" className="hn-earn" onClick={onAddPerson}>
                  Add who is hiring, earn 1 credit
                </button>
              )}
            </div>
          )}
        </section>

        <section className="hn-sec" aria-label="Closest evidence case">
          <h3 className="hn-k">Closest evidence case</h3>
          {close ? (
            <>
              <strong>Evidence Bank is coming</strong>
              <span className="hn-sub">Your seats will each start a draft case there, and the closest one shows here and goes into your note.</span>
            </>
          ) : (
            <>
              <strong>Part of the Close plan</strong>
              <span className="hn-sub">
                Evidence Bank keeps your case studies and finds the closest one for each role.{" "}
                <button type="button" className="tp-flink" onClick={() => openPlans("proposals")}>
                  See the Close plan
                </button>
              </span>
            </>
          )}
        </section>

        <section className="hn-sec" aria-label="Your way in">
          <h3 className="hn-k">Your way in</h3>
          <strong>{way.text}</strong>
          <span className="hn-sub">
            {way.has ? (open ? way.sub : "A fellow fractional held a seat here. Their name is free once the company is open.") : "Nobody you know is linked to this company yet."}{" "}
            <button type="button" className="tp-flink" onClick={onWay}>
              {way.has && open ? "See the path" : "Find a path in Warm paths"}
            </button>
          </span>
        </section>

        <div className="hn-acts">
          {!open ? (
            <span className="hn-open">
              <UnlockCompany id={c.id} rate={rate !== "none"} roles />
              <span className="hn-sub">
                Normally {COMPANY_PRICE} credits.{opens ? ` ${opens.of - opens.left} of ${opens.of} free opens used today.` : ""} It also opens the posting{roles > 1 ? " for every open role here." : ", its rate and hours."}
              </span>
            </span>
          ) : (
            <button type="button" className={`${btn("open")} hn-wide`} onClick={onOpenRecord}>
              Open the company page
            </button>
          )}
          <button type="button" className={btn("note")} onClick={onNote}>
            Draft a note
          </button>
          <button type="button" className={btn("pipe", inPipe)} aria-pressed={inPipe} onClick={onPipeline}>
            {inPipe ? (status.k === "pitched" ? "In pipeline · Reached out" : "In pipeline · Target") : "Add to pipeline"}
          </button>
          <button type="button" className={`${btn("pass")} hn-wide`} onClick={onPass}>
            Pass to a fractional who fits better
          </button>
          {line && (
            <span role="status" className="hn-line">
              {line.text}{" "}
              {line.go && (
                <button type="button" className="tp-flink" onClick={line.go.do}>
                  {line.go.label}
                </button>
              )}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
