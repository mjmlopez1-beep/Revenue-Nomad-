"use client";

/**
 * Your way in: who held the seats here, the decision makers on file and the next step with each, or where to look for who decides.
 * Moved out of Drawer.tsx: the record drawer (phones, RN_UI2 off) and the company page (company/CompanyPage.tsx) both draw these.
 */
import { useState } from "react";
import type { CompanyRec, EngagementRec } from "@/lib/tableTypes";
import { SEAT_BUNDLE, NAME_HIDDEN } from "@/lib/tableFields";
import { IconExternal, fmtMonth } from "../../../ui/shared";
import { AFTER_COMPANY, cellKey, shown, waitWords, type CoInfo } from "../../model";
import { QuietLock, useUi } from "../../ui";
import { WayInPeople, wayInFrom } from "../../network/Network";
import { useNetCompany } from "../../network/useNetwork";
import { WarmthChip } from "../../network/parts";
import dynamic from "next/dynamic";
import { bestBuyer, buyerNoteMove, buyersOf, buyerWhat, findBuyer, knowSeatLine, moveSent, type BuyerOnFile } from "@/lib/moves";
import { pipelineAct } from "../../pipelineStore";
import { emailOnFile, firstOfName, openRole } from "./env";
import { PairLock } from "./Facts";
import { AddPersonForm } from "./People";
import { Reach } from "./Seats";

// The note's sheet and its templates load the first time a note is drafted from the record.
export const NoteSheet = dynamic(() => import("../../MoveNote").then((m) => m.NoteSheet), { ssr: false });


/** [ux ws3] Someone held this seat (named, locked, or found with nobody named yet), so the record's "Your way in" lists it. Not an open role, not the member's own. */
export const wayInSeat = (e: EngagementRec) => !openRole(e) && !e.yours && (!!e.cells.operator && e.cells.operator.s !== "empty" ? true : !!e.claimable);
/** How many seats "Your way in" lists. */
export const WAY_IN_MAX = 3;
/** [ux ws3] The seats "Your way in" lists: the ones someone held, the member's function first, then a name they can see, then a lock. */
export function wayInSeatsOf(i: CoInfo, fn: string | null): EngagementRec[] {
  const rank = (e: EngagementRec) => (shown(e.cells.function) === fn ? 0 : 4) + (e.cells.operator?.s === "value" ? 0 : e.cells.operator?.s === "locked" ? 1 : 2);
  return i.engs.filter(wayInSeat).sort((a, b) => rank(a) - rank(b)).slice(0, WAY_IN_MAX);
}

/**
 * The decision makers "Your way in" lists (lib/moves buyersOf): the company's people and the
 * people on its seats marked Hiring for the seat, Reported to or Decision maker, the buyer to reach
 * first at the top (bestBuyer). The member's own seats are left out. At most WAY_IN_MAX.
 */
export function wayInBuyersOf(c: CompanyRec, fn: string | null): BuyerOnFile[] {
  const all = buyersOf(c, { others: true });
  const best = bestBuyer(c, fn);
  return (best ? [best, ...all.filter((b) => b.p.id !== best.p.id)] : all).slice(0, WAY_IN_MAX);
}

/** "Hired their fractional CRO · Marketing seat", "Decision maker": who a buyer on file is to the company. */
export const buyerLabel = (b: BuyerOnFile) => {
  const what = buyerWhat({ rel: b.rel, fn: b.e ? shown(b.e.cells.function) : null, seatRole: b.e ? shown(b.e.cells.role) : null });
  return what === "a decision maker there" ? "Decision maker" : what.charAt(0).toUpperCase() + what.slice(1);
};

/** One decision maker under Your way in: who they are to the company, their name (or its one lock), and a drafted note. */
export function WayInBuyer({ i, b, onDraft }: { i: CoInfo; b: BuyerOnFile; onDraft: (b: BuyerOnFile) => void }) {
  const ui = useUi();
  const hidden = !!i.c.hidden;
  const name = shown(b.p.cells.name);
  const title = shown(b.p.cells.title);
  const email = b.p.cells.email;
  const nameLocked = ["name", "title"].filter((f) => b.p.cells[f]?.s === "locked");
  const emailBusy = ui.busy.has(cellKey(b.p.id, "email"));
  return (
    <div className="tp-wayin-row tp-wayin-buyer">
      <span className="tp-wayin-what">{buyerLabel(b)}</span>
      {name ? (
        <>
          <span className="tp-wayin-who">
            {name}
            {title ? <span className="tp-wayin-t"> · {title}</span> : null}
          </span>
          <div className="tp-reach">
            <button type="button" className="btn btn-sm btn-pine" onClick={() => onDraft(b)}>
              Draft a note to {firstOfName(name)}
            </button>
            {email?.s === "locked" && (
              <button type="button" className="btn btn-sm" disabled={emailBusy} aria-busy={emailBusy} onClick={() => void ui.unlock({ entity: "contact", id: b.p.id, field: "email" })}>
                {emailBusy ? "Unlocking" : "Their email · 1 credit"}
              </button>
            )}
            <span className="tp-reach-note">
              {email?.s === "value" ? "The note goes to their email on file. You send it from your own mail." : email?.s === "locked" ? "Their email is on file. The note is ready either way." : "No email on file. Copy the note and send it where you reach them."}
            </span>
          </div>
        </>
      ) : hidden ? (
        <QuietLock words={waitWords(AFTER_COMPANY) ?? "Opens after the company"} tip={AFTER_COMPANY} />
      ) : (
        // Their name and title: one purchase, 1 credit, before the click.
        <PairLock entity="contact" id={b.p.id} hidden={false} fields={nameLocked.length ? nameLocked : ["name"]} />
      )}
    </div>
  );
}

/**
 * Nobody who decides is on file at a company the member can see: "Find who runs Sales at Acme".
 * A LinkedIn people search by the company's name and the titles, their team page or website, and
 * Add them (+1 credit a fact). Links out; Merlin reads nothing from them.
 */
export function WayInFind({ i }: { i: CoInfo }) {
  const ui = useUi();
  const [adding, setAdding] = useState(false);
  const f = findBuyer(i.c, { function: ui.me.function });
  if (!f) return null;
  return (
    <div className="tp-wayin-row tp-wayin-find">
      <span className="tp-wayin-what">Nobody who decides is on file yet</span>
      <span className="tp-wayin-who">{f.label}</span>
      {adding ? (
        <AddPersonForm companyId={i.c.id} engagementId={null} onDone={() => setAdding(false)} initial={{ relationship: "Decision maker" }} />
      ) : (
        <div className="tp-reach">
          <a className="btn btn-sm btn-pine" href={f.linkedin} target="_blank" rel="noreferrer">
            Search LinkedIn <IconExternal size={11} />
          </a>
          {f.site && (
            <a className="btn btn-sm" href={f.site.href} target="_blank" rel="noreferrer">
              {f.site.label} <IconExternal size={11} />
            </a>
          )}
          <button type="button" className="btn btn-sm btn-ghost tp-addlink" onClick={() => setAdding(true)}>
            Add them <span className="plus1">+1 credit</span>
          </button>
          <span className="tp-reach-note">These open in a new tab. Add who you find and earn a credit for each fact.</span>
        </div>
      )}
    </div>
  );
}



/**
 * [ux ws3] Your way in: right under the record's header and its one action, the people who held
 * its seats and the next step with each. Named and on Merlin: Message. Named, not a member: Not
 * on Merlin yet · Invite to connect. Locked: who held it, 1 credit (after the company at a locked
 * one). Nobody named: Know who held it? Add them, +1. Then the seats, people and details.
 *
 * [google network] One section and one heading: the people the member already knows here come
 * first, warmest first (their own network, nothing with RN_GOOGLE off), then the buyer (the
 * decision makers on file, and the people on its seats who hired or managed the fractional), then
 * the seats someone held. A seat whose holder is in the member's own contacts says so ("You know
 * Pat (Hot), who holds their Marketing seat") and the invite goes to the address they have.
 * Nobody who decides on file: where to look for them (WayInFind).
 */
export function YourWayIn({ i, seats }: { i: CoInfo; seats: EngagementRec[] }) {
  const ui = useUi();
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState<BuyerOnFile | null>(null);
  const hidden = !!i.c.hidden;
  const mine = ui.me.function;
  const net = useNetCompany(hidden ? null : i.c.id);
  const buyers = wayInBuyersOf(i.c, mine);
  const find = !hidden && !buyers.length && !!findBuyer(i.c, { function: mine });
  if (!seats.length && !net && !buyers.length && !find) return null;
  // Their own contacts who hold a seat here, by seat (lib/google seat matches).
  const knownOn = new Map((net?.people ?? []).filter((p) => p.seat && p.name && !p.hidden).map((p) => [p.seat!.id, p]));
  const move = draft ? buyerNoteMove(i.c, draft, ui.me) : null;
  return (
    <section className="tp-dsec tp-wayin" aria-labelledby="tp-wayin-h">
      <h3 className="tp-dsec-h" id="tp-wayin-h">
        Your way in{net && <span className="nw-muted nw-way-from">{wayInFrom(net)}</span>}
      </h3>
      {net && <WayInPeople c={net} company={i.c.name} />}
      {buyers.map((b) => (
        <WayInBuyer key={b.p.id} i={i} b={b} onDraft={setDraft} />
      ))}
      {find && <WayInFind i={i} />}
      {seats.map((e, k) => {
        const op = e.cells.operator;
        const name = op?.s === "value" ? op.v : null;
        const role = shown(e.cells.role);
        const fn = shown(e.cells.function);
        const start = shown(e.cells.start);
        const what = [role ?? (fn ? `${fn} seat` : "A fractional seat"), start && fmtMonth(start)].filter(Boolean).join(" · ");
        const member = op?.s === "value" && !!op.member;
        const known = name ? knownOn.get(e.id) : undefined;
        return (
          <div key={e.id} className="tp-wayin-row">
            <span className={`tp-wayin-what${fn && fn === mine ? " mine" : ""}`}>{what}</span>
            {name ? (
              <>
                <span className="tp-wayin-who">{name}</span>
                {known && (
                  <span className="tp-wayin-know">
                    <WarmthChip w={known.warmth} />
                    <span>{knowSeatLine({ name: known.name!, warmth: known.warmth, seat: known.seat })} Only you see this.</span>
                  </span>
                )}
                {/* A holder who hides their name has no way to reach them here. */}
                {!(op?.s === "value" && op.member?.you) && name !== NAME_HIDDEN && (
                  <Reach
                    e={e}
                    name={name}
                    member={member}
                    emailTo={known?.email || (e.invite ? emailOnFile([...e.people, ...i.c.people], name) : null)}
                    known={!!known}
                    more={k === seats.length - 1}
                  />
                )}
              </>
            ) : op?.s === "locked" ? (
              hidden ? (
                <QuietLock words={waitWords(AFTER_COMPANY) ?? "Opens after the company"} tip={AFTER_COMPANY} />
              ) : (
                // The unlock in words ("Unlock who held it · 1 credit"), with the role when that is locked too: one purchase.
                <PairLock id={e.id} hidden={false} fields={SEAT_BUNDLE.filter((f) => e.cells[f]?.s === "locked")} />
              )
            ) : adding === e.id ? (
              <AddPersonForm companyId={i.c.id} engagementId={e.id} onDone={() => setAdding(null)} />
            ) : (
              <span className="tp-wayin-none">
                <span className="tp-notyet">Nobody named yet</span>
                {!hidden && (
                  <button type="button" className="btn btn-sm btn-ghost tp-addlink" onClick={() => setAdding(e.id)}>
                    Know who held it? Add them <span className="plus1">+1</span>
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      {move && (
        <NoteSheet
          key={draft!.p.id}
          m={move}
          row={{ id: i.c.id, kinds: [], lines: [] }}
          me={ui.me}
          sentLabel="Mark as sent"
          onClose={() => setDraft(null)}
          // The buyer's note used (Gmail, another mail app, Copy) or marked sent: the company goes into Your pipeline at
          // Sent, to the buyer as the member sees them (lib/moves.ts moveSent). The same note twice in half an hour is one send.
          onUsed={() => void pipelineAct({ type: "pipeline.sent", companyId: i.c.id, from: "record", ...moveSent(move) })}
          onSent={() => (void pipelineAct({ type: "pipeline.sent", companyId: i.c.id, from: "record", ...moveSent(move) }), setDraft(null))}
          onClaude={() => setDraft(null)}
        />
      )}
    </section>
  );
}
