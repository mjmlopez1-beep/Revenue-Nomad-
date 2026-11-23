"use client";

/**
 * A seat on the record (EngagementCard), the next step with its holder (Reach), and claiming an open role or a seat Revenue Nomad found.
 * Moved out of Drawer.tsx: the record drawer (phones, RN_UI2 off) and the company page (company/CompanyPage.tsx) both draw these.
 */
import { MessageButton } from "../../Messages";
import { InviteConnect } from "../../Invite";
import { openFractionalAt } from "../../fractionalsModel";
import { VerifyName } from "../../Verify";
import { useRef, useState } from "react";
import type { ActionResult, EngagementRec, PersonRec } from "@/lib/tableTypes";
import { SOURCE_LABEL, SEAT_BUNDLE, NAME_HIDDEN } from "@/lib/tableFields";
import { IconCheck, IconExternal, IconPlus, fmtMonth, post } from "../../../ui/shared";
import { AFTER_COMPANY, ENG_FIELDS, OPEN_ROLE_BUNDLE, seatBundled, seatMissingCount, shown } from "../../model";
import { YourSeat, useUi } from "../../ui";
import { RoleDate, statusText } from "../../RoleDate";
import { closedOn, emailOnFile, openRole, safeHref, useEnv, useEscape } from "./env";
import { FieldList } from "./Facts";
import { AddPersonForm, PersonCard } from "./People";

/* ---------- engagements ---------- */


/**
 * After the seat holder is unlocked: the next step with them. This is the promise of the unlock,
 * and no step of it goes through Revenue Nomad's staff.
 *  - A member who has signed in: "Message Ana", with a first message the member can change.
 *  - Named but not on Merlin yet (a name from public profiles, or a member who never signed in):
 *    "Invite to connect", a note with their seat's claim link (EngagementRec.invite). When they
 *    claim the seat through it, a conversation opens between them, and a new member's invite bonus
 *    goes to both.
 *  - A name the claim link can't bring in: find them on LinkedIn.
 * Then their record in Fractionals (every seat of theirs, and the clients they serve).
 */
export function Reach({ e, name, member, emailTo, known = false, more = true }: { e: EngagementRec; name: string; member: boolean; emailTo: string | null; known?: boolean; more?: boolean }) {
  const ui = useUi();
  const env = useEnv();
  const first = name.trim().split(/\s+/)[0] || name;
  const li = safeHref(() => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`);
  return (
    <div className="tp-reach">
      {member ? (
        <MessageButton
          engagementId={e.id}
          name={name}
          company={env.company}
          role={shown(e.cells.role)}
          fn={shown(e.cells.function)}
          // Named for this search only: the company opens first (free on a free open), then the message goes.
          unlockFirst={env.found && env.companyId ? { entity: "company", id: env.companyId, field: "identity" } : null}
        />
      ) : e.invite ? (
        <>
          {/* [ux ws3] One meaning: named, and not a member yet. */}
          <span className="tp-notyet">Not on Merlin yet</span>
          <InviteConnect e={e} name={name} company={env.company} emailTo={emailTo} />
        </>
      ) : known && emailTo ? (
        // In the member's own contacts, with an address: they write from their own mail.
        <a className="btn btn-sm btn-pine" href={`mailto:${encodeURIComponent(emailTo)}`}>
          Email {first}
        </a>
      ) : (
        li && (
          <a className="btn btn-sm btn-pine" href={li} target="_blank" rel="noreferrer">
            Find them on LinkedIn <IconExternal size={11} />
          </a>
        )
      )}
      {!member && (
        <span className="tp-reach-note">
          {e.invite
            ? e.invite.at
              ? `Once ${first} claims their seat through your link, you're connected on Merlin.`
              : `Invite ${first}, and once they claim their seat you're connected on Merlin.`
            : known
              ? emailTo
                ? `${first} isn't on Merlin yet. The address is from your own contacts.`
                : `${first} isn't on Merlin yet. You know them, so reach them the way you usually do.`
              : `${first} isn't on Merlin yet, so you can't message them here.`}
        </span>
      )}
      {more && (
        // Seat holder to record: their record in Fractionals, with every seat of theirs.
        <button type="button" className="tp-intro tp-reach-more" onClick={() => (openFractionalAt(e.id), ui.openPage("fractionals"))}>
          See {first}&apos;s record in Fractionals
        </button>
      )}
    </div>
  );
}


/** An open role nobody holds yet: the member who took it says so (the seat then links to them). */
export function ClaimRole({ id }: { id: string }) {
  const ui = useUi();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const cancel = () => {
    setAsk(false);
    setTimeout(() => btn.current?.focus({ preventScroll: true }));
  };
  useEscape(ask, cancel);
  const claim = async () => {
    setBusy(true);
    await ui.act({ type: "fill", entity: "engagement", id, field: "operator", value: ui.me.name, memberId: "me" });
    setBusy(false);
    setAsk(false);
  };
  if (ask)
    return (
      <div className="tp-frow-ask tp-claim-ask" role="group" aria-label="I took this role">
        <p>Mark this role as yours? Your name goes on the seat, and it moves to Your seats. You can mark one open role a day.</p>
        <span className="tp-frow-ask-acts">
          <button type="button" className="btn btn-sm btn-volt" autoFocus disabled={busy} aria-busy={busy} onClick={claim}>
            {busy ? "Saving" : "Yes, I took it"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={cancel}>
            Cancel
          </button>
        </span>
      </div>
    );
  return (
    <div className="tp-claim">
      <button ref={btn} type="button" className="btn btn-sm" onClick={() => setAsk(true)}>
        I took this role
      </button>
      <span className="tp-small muted">Nobody holds this seat yet.</span>
    </div>
  );
}

/**
 * A seat Revenue Nomad found that nobody holds on Merlin yet. Its fractional claims it:
 * their name goes on it (behind the usual lock) and it moves to Your seats.
 */
/** "Fractional CMO at Acme, Mar 2025 to now": what an unclaimed seat says, for the member to check before claiming it. */
export function claimLine(c: NonNullable<ActionResult["claim"]>, company: string, fallback: string): string {
  const what = c.role ?? (c.function ? `A ${c.function} seat` : `The ${fallback} seat`);
  const ongoing = !c.end || c.end === "Ongoing";
  const when = c.start
    ? ongoing
      ? c.status === "Ended"
        ? `from ${fmtMonth(c.start)}`
        : `${fmtMonth(c.start)} to now`
      : `${fmtMonth(c.start)} to ${fmtMonth(c.end!)}`
    : !ongoing
      ? `until ${fmtMonth(c.end!)}`
      : "";
  return `${what} at ${company}${c.role && c.function && !c.role.toLowerCase().includes(c.function.toLowerCase()) ? ` (${c.function})` : ""}${when ? `, ${when}` : ""}`;
}

export function ClaimSeat({ id, seat, company }: { id: string; seat: string; company: string }) {
  const ui = useUi();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<NonNullable<ActionResult["claim"]> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const cancel = () => {
    setAsk(false);
    setTimeout(() => btn.current?.focus({ preventScroll: true }));
  };
  useEscape(ask, cancel);
  // Before claiming, the seat's title, function and dates, so the member can check it is theirs.
  const check = async () => {
    setAsk(true);
    if (info) return;
    setErr(null);
    const r = await post<ActionResult>({ action: { type: "claimSeat", engagementId: id, preview: true } });
    if (r.error || !r.claim) setErr(r.error || "We couldn't load this seat. Try again.");
    else setInfo(r.claim);
  };
  const claim = async () => {
    setBusy(true);
    await ui.act({ type: "claimSeat", engagementId: id });
    setBusy(false);
    setAsk(false);
  };
  // "Not me" is kept on the server (notMine), so adding a seat later never claims this one for them.
  const notMe = () => {
    cancel();
    void ui.act({ type: "notMine", engagementId: id }, { quiet: true, silentError: true });
  };
  if (ask)
    return (
      <div className="tp-frow-ask tp-claim-ask" role="group" aria-label="Claim this seat">
        {err ? (
          <p role="alert">{err}</p>
        ) : info ? (
          <p>
            <b>Is this you?</b> {claimLine(info, company, seat)}. Claim it? Other members who can see the company will see your name on it. Fellow fractionals are free to see.
          </p>
        ) : (
          <p aria-busy="true">Checking the seat</p>
        )}
        <span className="tp-frow-ask-acts">
          <button type="button" className="btn btn-sm btn-volt" autoFocus disabled={busy || !info} aria-busy={busy} onClick={claim}>
            {busy ? "Saving" : "Yes, it's my seat"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={info ? notMe : cancel}>
            {info ? "Not me" : "Cancel"}
          </button>
        </span>
      </div>
    );
  return (
    <div className="tp-claim">
      <button ref={btn} type="button" className="btn btn-sm" onClick={check}>
        Is this your seat? Claim it
      </button>
    </div>
  );
}

export const ENG_ROWS = ["function", "type", ...ENG_FIELDS];

export function EngagementCard({ e, companyId, company, focus, coPeople = [], wayIn = false }: { e: EngagementRec; companyId: string; company: string; focus: boolean; coPeople?: PersonRec[]; wayIn?: boolean }) {
  const ui = useUi();
  const [adding, setAdding] = useState(false);
  const op = shown(e.cells.operator);
  const opCell = e.cells.operator;
  const role = shown(e.cells.role);
  const start = shown(e.cells.start);
  const toFill = e.yours ? seatMissingCount(e, ui.me) : 0;
  const hidden = ui.isHidden(e.id);
  const open = openRole(e);
  // An open role nobody holds has no seat holder, start, end, reason or source yet: nothing to add there.
  const vacant = open && (!opCell || opCell.s === "empty");
  const posting = e.cells.posting;
  const closed = !!e.closed && posting?.s === "value";
  const fnRender = (v: string) => <span className={`chip tp-fn${v === ui.me.function ? " tp-fn-me" : ""}`}>{v}</span>;
  // Nobody reaches out to themselves, and a hidden company's seat holders open after the company. Nobody named: no next step here (the claim below stays).
  // [ux ws3] A seat listed under Your way in has its next step there.
  const reach = !wayIn && op && op !== NAME_HIDDEN && !e.yours && !(opCell?.s === "value" && opCell.member?.you) && !hidden && (
    <Reach e={e} name={op} member={!!(opCell?.s === "value" && opCell.member)} emailTo={e.invite ? emailOnFile([...e.people, ...coPeople], op) : null} />
  );
  // Anything paid on a seat at a locked company opens after the company (an open role's posting and rate come with it).
  const waits = (f: string) => (hidden && e.cells[f]?.s === "locked" && !(open && OPEN_ROLE_BUNDLE.includes(f)) ? AFTER_COMPANY : null);
  return (
    <article className={`tp-eng${focus ? " focus" : ""}`} id={`tp-d-${e.id}`}>
      <div className="tp-eng-top">
        {e.opened ? <RoleDate e={e} /> : <span className="tp-src">{SOURCE_LABEL[e.source] ?? e.source}</span>}
        {e.yours && <YourSeat id={e.id} />}
        {e.verified && (
          <span className="tp-verified">
            <IconCheck size={11} /> Confirmed by the client
          </span>
        )}
        {start && <span className="tp-eng-when num">{fmtMonth(start)}</span>}
      </div>
      <FieldList
        entity="engagement"
        id={e.id}
        cells={e.cells}
        fields={ENG_ROWS}
        noAdd={vacant ? ["operator", "start", "end", "endReason", "reason", "whyNow", "sourced"] : shown(e.cells.status) !== "Ended" ? ["endReason"] : []}
        labels={open ? { rate: "Posted rate", hours: "Posted hours" } : {}}
        render={{ function: fnRender, type: (v) => <span className="chip tp-fn">{v}</span>, status: statusText }}
        notes={{
          ...(closed ? { posting: <span className="tp-frow-note">Closed {closedOn(e)}</span> } : {}),
          // A name from public profiles nobody has verified: Verify beside it, and no label. While the member's own claim on it waits, the line under the seat says so instead.
          ...(opCell?.s === "value" && opCell.unverified && !e.claimWaiting ? { operator: <VerifyName engagementId={e.id} confirmed={!!opCell.iv} count={opCell.ver} /> } : {}),
        }}
        after={reach ? { operator: reach } : {}}
        pair={open ? OPEN_ROLE_BUNDLE : seatBundled(e) ? SEAT_BUNDLE : undefined}
        own={e.yours}
        listed={open}
        fixed={open ? ["operator"] : []}
        waits={waits}
        nouns={{ operator: "who held it" }}
      />
      {/* [ux ws3] Nobody named on a past seat: the row says so, a locked company's record too (it used to leave Held by out). */}
      {!open && !e.yours && (!opCell || opCell.s === "empty") && (
        <div className="tp-flist-d">
          <div className="tp-frow">
            <span className="tp-frow-l">Held by</span>
            <span className="tp-frow-v">
              <span className="tp-notyet">Nobody named yet</span>
              {!hidden && !adding && (
                <button type="button" className="tp-tbtn tp-heldby-add" onClick={() => setAdding(true)}>
                  Know who held it? Add them <span className="plus1">+1</span>
                </button>
              )}
            </span>
          </div>
        </div>
      )}
      {/* The member named themselves on this seat and nobody has confirmed it yet (see Your seats). */}
      {!e.yours && opCell?.s === "value" && opCell.member?.you && (
        <p className="tp-claim-wait">{open ? "Claimed by you. Others still see the role as open until your claim is confirmed." : "You're named on this seat. It opens for you once another member confirms it."}</p>
      )}
      {vacant && !hidden && !e.yours && <ClaimRole id={e.id} />}
      {/* "Is this your seat?" while no name shows here. A name the member can see has Verify, whose first choice is the same claim. */}
      {e.claimable && !hidden && !e.yours && !e.claimWaiting && opCell?.s !== "value" && (
        <ClaimSeat id={e.id} seat={role ?? (shown(e.cells.function) ? `${shown(e.cells.function)}` : "fractional")} company={company} />
      )}
      {e.claimWaiting && !e.yours && <p className="tp-claim-wait">You said this seat is yours. An admin is checking it, and your name goes on it once they agree.</p>}
      {toFill > 0 && (
        <button type="button" className="ys-fill-link" onClick={() => ui.openSeats(e.id)}>
          Fill in the {toFill === 1 ? "one thing" : `${toFill} things`} missing on your seat
        </button>
      )}
      {e.people.length > 0 && (
        <div className="tp-eng-people">
          <div className="tp-sublabel">Decision makers on this seat</div>
          {e.people.map((p) => (
            <PersonCard key={p.id} p={p} inSeat />
          ))}
        </div>
      )}
      {adding ? (
        <AddPersonForm companyId={companyId} engagementId={e.id} onDone={() => setAdding(false)} />
      ) : (
        !hidden && (
          <div className="tp-eng-foot">
            <button type="button" className="btn btn-sm btn-ghost tp-addlink" onClick={() => setAdding(true)}>
              <IconPlus size={13} /> {op ? "Add a contact on this seat" : "Add someone on this seat"}
            </button>
          </div>
        )
      )}
    </article>
  );
}
