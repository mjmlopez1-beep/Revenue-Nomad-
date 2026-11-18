"use client";

/**
 * Referral partners (page "partners"): "Build your fractional referral network". Phone first: one
 * column, every action a 44px tap.
 *
 *  a. Who gets hired before and after you. From the table's dated seats, a line once 20 companies
 *     back it ("At 34 companies, a fractional Marketing leader started before the fractional Sales
 *     leader"), and members' answers to "Which fractional usually gets hired before you?" as counts
 *     once 20 members of the function answered. Thin data gets one honest line. The server counts
 *     these (GET /api/table?partners=1, lib/table.ts partnersView).
 *  b. Partners at your kind of clients. Who held seats in other functions at companies that fit the
 *     member's Ideal Fractional Profile (partnersModel.ts), from the member's own view of the table,
 *     so every lock holds: a holder's name is the 1 credit SEAT_BUNDLE unlock (with the role), and a
 *     locked company stays locked. After the unlock, Message (a member) or Invite to connect (not on
 *     Merlin yet), and Verify on a name nobody verified. Seats with nobody named are a count.
 *  c. Members on Merlin, listed by default: first name, title, function and the clients they want,
 *     with Connect. Never an email. Your profile has "Show me in Referral partners".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PartnersView } from "@/lib/tableTypes";
import { clientKinds } from "@/lib/partners";
import { CompanyLogo, IconChevron, LockedName, fmtMonth, initials } from "../ui/shared";
import { coverOf, icpEmpty, icpLabel, seatBothLocked, seatNoun, seatWhat, shown, type CoInfo } from "./model";
import { HeldBy, RowFact } from "./Tables";
import { ConnectButton, MessageButton } from "./Messages";
import { InviteConnect } from "./Invite";
import { holderIsMember, partnerGroups, type PartnerGroup, type PartnerSeat } from "./partnersModel";
import { useUi } from "./ui";
import { plural } from "./hooks";
import "./partners.css";

/** Cards a function shows before "Show all", and members before "Show more". */
const SEATS_FIRST = 3;
const MEMBERS_STEP = 12;

function usePartners(deps: unknown[]) {
  const [data, setData] = useState<PartnersView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/table?partners=1", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) return setFailed(j?.error || "Referral partners didn't load. Try again.");
      setFailed(null);
      setData(j as PartnersView);
    } catch {
      setFailed("We couldn't reach Merlin. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, failed, load };
}

export function Partners({ infos, onBack, onProfile }: { infos: CoInfo[]; onBack: () => void; onProfile: () => void }) {
  const ui = useUi();
  const me = ui.me;
  const { data, failed, load } = usePartners([me.function, me.partners, me.icp]);
  const { groups, fits } = useMemo(() => partnerGroups(infos, me), [infos, me]);
  return (
    <div className="tp-page pt-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Build your fractional referral network</h1>
      <p className="pt-lead">
        Fractionals in other functions who work with the same kind of clients send each other work. Here is who gets hired around you, who held seats at companies like
        yours, and the members you can write to today.
      </p>

      <section className="tp-card pt-sec" aria-labelledby="pt-order-h">
        <h2 className="tp-card-h" id="pt-order-h">
          Who gets hired before and after you
        </h2>
        {failed && !data ? (
          <p className="pt-note" role="alert">
            {failed}{" "}
            <button type="button" className="pt-link" onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : (
          <Order data={data} onProfile={onProfile} />
        )}
      </section>

      <section className="tp-card pt-sec" aria-labelledby="pt-seats-h">
        <h2 className="tp-card-h" id="pt-seats-h">
          Partners at your kind of clients
        </h2>
        <Seats groups={groups} fits={fits} onProfile={onProfile} />
      </section>

      <section className="tp-card pt-sec" aria-labelledby="pt-members-h">
        <h2 className="tp-card-h" id="pt-members-h">
          Members on Merlin
        </h2>
        {failed && !data ? (
          <p className="pt-note">{failed}</p>
        ) : (
          <Members data={data} onProfile={onProfile} />
        )}
      </section>
    </div>
  );
}

/* ---------- a. who gets hired before and after you ---------- */

function Order({ data, onProfile }: { data: PartnersView | null; onProfile: () => void }) {
  if (!data)
    return (
      <p className="pt-note" role="status">
        Counting the seats on file
      </p>
    );
  const fn = data.fn;
  if (!fn)
    return (
      <p className="pt-note">
        Pick your function in Your profile, and this shows which fractionals get hired before and after you.{" "}
        <button type="button" className="pt-link" onClick={onProfile}>
          Open Your profile
        </button>
      </p>
    );
  const before = data.order.filter((x) => x.when === "before");
  const after = data.order.filter((x) => x.when === "after");
  const answers = data.answers?.fns.filter((x) => x.n > 0).slice(0, 3) ?? [];
  return (
    <>
      {data.order.length ? (
        <ul className="pt-lines">
          {[...before, ...after].map((x) => (
            <li key={`${x.when}${x.fn}`} className="pt-line">
              <span className={`pt-when pt-when-${x.when}`}>{x.when === "before" ? "Before you" : "After you"}</span>
              <span>
                At <b className="num">{x.companies.toLocaleString("en-US")}</b> companies, a fractional {x.fn} leader started {x.when} the fractional {fn} leader.
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pt-note">
          Not enough dated seats yet to say. A line shows here once {data.min} companies have a dated fractional seat in {fn} and one in another function
          {data.companies ? `. So far ${plural(data.companies, "company does", "companies do")}.` : "."}
        </p>
      )}
      {data.answers && answers.length > 0 && (
        <ul className="pt-lines pt-answers">
          {answers.map((x) => (
            <li key={x.fn} className="pt-line">
              <span className="pt-when">Members say</span>
              <span>
                Of <b className="num">{data.answers!.n}</b> fractional {fn} leaders who answered, <b className="num">{x.n}</b> say a fractional {x.fn} leader usually gets
                hired before them.
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------- b. partners at your kind of clients ---------- */

function Seats({ groups, fits, onProfile }: { groups: PartnerGroup[]; fits: number; onProfile: () => void }) {
  const ui = useUi();
  const icp = ui.me.icp;
  if (icpEmpty(icp))
    return (
      <div className="hunt-pill hunt-pill-off" role="group" aria-label="Your Ideal Fractional Profile">
        <span className="hunt-pill-text">Set your Ideal Fractional Profile, the companies you want as clients, and this lists who held seats there in other functions.</span>
        <button type="button" className="hunt-pill-btn" onClick={onProfile}>
          Set it up
        </button>
      </div>
    );
  return (
    <>
      <div className="hunt-pill pt-pill" role="group" aria-label="Your Ideal Fractional Profile">
        <span className="hunt-pill-text">
          <span className="hunt-pill-k">Your profile:</span> <b>{icpLabel(icp)}</b> · <span className="num">{fits.toLocaleString("en-US")}</span> {fits === 1 ? "company fits" : "companies fit"}
        </span>
        <span className="hunt-pill-acts">
          <button type="button" className="hunt-pill-btn hunt-pill-edit" onClick={onProfile}>
            Edit
          </button>
        </span>
      </div>
      {groups.length ? (
        groups.map((g) => <Group key={g.fn} g={g} />)
      ) : (
        <p className="pt-note">No seats in other functions at companies that fit your profile yet. As members add seats, they show here.</p>
      )}
    </>
  );
}

function Group({ g }: { g: PartnerGroup }) {
  const [all, setAll] = useState(false);
  const shownSeats = all ? g.seats : g.seats.slice(0, SEATS_FIRST);
  return (
    <section className="pt-group" aria-label={`${g.fn} seats`}>
      <h3 className="pt-group-h">
        {g.fn} <span className="pt-group-n num">{plural(g.seats.length, "seat")}</span>
      </h3>
      {shownSeats.length > 0 && (
        <div className="pt-cards">
          {shownSeats.map((s) => (
            <SeatCard key={s.e.id} s={s} />
          ))}
        </div>
      )}
      {g.seats.length > SEATS_FIRST && (
        <button type="button" className="pt-link pt-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${g.seats.length}`}
        </button>
      )}
      {g.unnamed > 0 && (
        <p className="pt-unnamed">
          {g.seats.length ? `${plural(g.unnamed, `more ${g.fn} seat`)}` : plural(g.unnamed, `${g.fn} seat`)} at companies like yours {g.unnamed === 1 ? "has" : "have"} nobody named yet.
        </p>
      )}
    </section>
  );
}

function SeatCard({ s }: { s: PartnerSeat }) {
  const ui = useUi();
  const { i, e } = s;
  const hidden = !!i.c.hidden;
  const at = hidden ? "this company" : i.c.name;
  const fn = shown(e.cells.function);
  const start = shown(e.cells.start);
  const end = shown(e.cells.end);
  const active = shown(e.cells.status) === "Active" || end === "Ongoing";
  // "since Apr 2025" while it runs, "Sep 2023 to Aug 2024" once it ended, "started Sep 2023" when the end is locked.
  const when = !start ? null : active ? `since ${fmtMonth(start)}` : end ? `${fmtMonth(start)} to ${fmtMonth(end)}` : `started ${fmtMonth(start)}`;
  const op = e.cells.operator;
  const name = op?.s === "value" ? op.v : null;
  const t = (field: string) => ({ entity: "engagement" as const, id: e.id, field });
  return (
    <article className="pt-card">
      <button type="button" className="pt-card-co" onClick={() => ui.openCompany(i.c.id, e.id)} title={hidden ? "Open the record to see what unlocking it shows" : `Open ${i.c.name}`}>
        <CompanyLogo name={hidden ? "" : i.c.name} domain={hidden ? null : i.c.iconDomain ?? i.domain} hidden={hidden} seed={i.c.id} />
        <span className="pt-card-id">
          <span className="pt-card-name">{hidden ? <LockedName seed={i.c.id} /> : i.c.name}</span>
          <span className="pt-card-meta num">{[fn && `${fn} seat`, when].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
      <dl className="pt-facts">
        {/* Who held the seat and their role are one purchase: while both are locked, one row and one lock. */}
        {!seatBothLocked(e) && (
          <div className="pt-fact">
            <dt>Role</dt>
            <dd>
              <RowFact t={t("role")} at={at} cell={e.cells.role} cover={coverOf(i, e, "role")} noun={seatNoun(e, "role")} what={seatWhat(e, "role")} />
            </dd>
          </div>
        )}
        <div className="pt-fact">
          <dt>{seatBothLocked(e) ? "Held by and role" : "Held by"}</dt>
          <dd>
            <HeldBy e={e} cover={coverOf(i, e, "operator")} />
          </dd>
        </div>
      </dl>
      {name && !hidden && (holderIsMember(e) || e.invite) && (
        <div className="pt-next">
          {holderIsMember(e) ? (
            <MessageButton engagementId={e.id} name={name} company={i.c.name} role={shown(e.cells.role)} fn={fn} />
          ) : (
            <InviteConnect e={e} name={name} company={i.c.name} />
          )}
        </div>
      )}
    </article>
  );
}

/* ---------- c. members on Merlin ---------- */

function Members({ data, onProfile }: { data: PartnersView | null; onProfile: () => void }) {
  const [n, setN] = useState(MEMBERS_STEP);
  if (!data)
    return (
      <p className="pt-note" role="status">
        Finding members
      </p>
    );
  const list = data.members.slice(0, n);
  return (
    <>
      <p className="pt-note">
        {data.listed
          ? "Members who work in other functions come first. You're listed here too, with your first name, title, function and the clients you want, never your email."
          : "You're hidden from this list, so other members don't see you here."}{" "}
        <button type="button" className="pt-link" onClick={onProfile}>
          {data.listed ? "Change it in Your profile" : "Show me again"}
        </button>
      </p>
      {list.length ? (
        <div className="pt-members">
          {list.map((m) => (
            <MemberCard key={m.id} m={m} />
          ))}
        </div>
      ) : (
        <p className="pt-note">No other members are listed yet.</p>
      )}
      {data.members.length > n && (
        <button type="button" className="btn pt-showmore" onClick={() => setN(n + MEMBERS_STEP)}>
          Show more members
        </button>
      )}
    </>
  );
}

function MemberCard({ m }: { m: PartnersView["members"][number] }) {
  const kinds = clientKinds(m.icp);
  return (
    <article className="pt-member">
      <span className="pt-av" aria-hidden>
        {initials(m.first)}
      </span>
      <span className="pt-member-main">
        <span className="pt-member-name">{m.first}</span>
        {m.title && <span className="pt-member-title">{m.title}</span>}
        <span className="pt-member-meta">
          {m.fn && <span className="chip tp-fn">{m.fn}</span>}
          <span className="pt-member-kinds">{kinds ? `Works with ${kinds}` : "No ideal clients set yet"}</span>
        </span>
      </span>
      <span className="pt-member-act">
        <ConnectButton member={{ id: m.id, first: m.first }} conversationId={m.conversationId} />
      </span>
    </article>
  );
}
