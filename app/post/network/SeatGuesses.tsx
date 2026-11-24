"use client";

/**
 * Confirm, don't type: "We think you held these 3 seats", at the top of Your seats (lib/google
 * seatGuessesOf). Each card is a company the member met with over months: the months and the
 * meeting count Your network already shows, who they met most, and the seat Confirm would add,
 * with the function and title from their own profile.
 *
 * Confirm is the member's own click on the existing Add ("add" with themselves as the seat
 * holder, lib/table.ts): it claims a seat Revenue Nomad already found there or adds a new one, by
 * that action's own rules, credits and daily limits, and a new seat at a company whose first seat
 * still waits earns "when confirmed". What the card says it earns is what the server then says it
 * earned. "Not a seat" is remembered for good. Nothing is added without the click, and the cards
 * hold no meeting title, guest list or date beyond the months. Only the member sees them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CompanyLogo, IconCheck, IconLock, useToast } from "../../ui/shared";
import { Prop } from "../../ui/fractions/lazy";
import { seatConfirmFields, type SeatGuessView } from "@/lib/google/types";
import { namedFn, type CoInfo, type SeatInfo } from "../model";
import { useUi } from "../ui";
import { earnRoom } from "../NextMove";
import { SEAT_YIELD } from "../earnBack";
import { load, monthYear, netAct, useNetwork } from "./useNetwork";
import "./network.css";

/** "Dec 2025 to Sep 2026 · 50 meetings over 10 months" */
export const guessLine = (g: Pick<SeatGuessView, "from" | "to" | "meetings" | "months">) =>
  `${monthYear(g.from)} to ${monthYear(g.to)} · ${g.meetings} ${g.meetings === 1 ? "meeting" : "meetings"} over ${g.months} ${g.months === 1 ? "month" : "months"}`;

/** What a confirmed card remembers for the visit: the server's own words, and the seat it made. */
interface Done {
  g: SeatGuessView;
  role: string | null;
  message: string;
  seatId: string | null;
}

/** What Confirm would earn, said before the click: the facts it adds, within today's room, or "when confirmed". */
function earnWords(g: SeatGuessView, facts: number, room: number, cap: number, claims: boolean): { plus: string | null; text: string } {
  // "up to ~12", from the one place a seat's worth is said.
  const rest = SEAT_YIELD.replace(" credits a seat", "");
  if (g.waits) return { plus: `+${facts}`, text: "when confirmed. Another member confirms a fact on it, or an admin checks it." };
  if (room <= 0) return { plus: null, text: `No credit today: you've earned today's ${cap}. It still saves.` };
  const now = Math.min(facts, room);
  if (claims) return { plus: `up to +${now}`, text: "We have a seat on file there that may be yours. Confirming claims it, and each fact it was missing earns a credit." };
  return { plus: `+${now}`, text: `${now === 1 ? "credit" : "credits"} now${now < facts ? " (today's limit)" : ""}, ${rest} with the rest` };
}

function GuessCard({
  g,
  info,
  busy,
  onConfirm,
  onNo,
}: {
  g: SeatGuessView;
  info: CoInfo | undefined;
  busy: "yes" | "no" | null;
  onConfirm: (role: string | null) => void;
  onNo: () => void;
}) {
  const ui = useUi();
  const [role, setRole] = useState(g.role ?? "");
  const [editing, setEditing] = useState(!g.role && !g.function);
  const [draft, setDraft] = useState(role);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing && (g.role || g.function)) input.current?.focus();
  }, [editing, g.role, g.function]);
  const fields = seatConfirmFields(g, ui.me.name, role || null);
  const facts = Object.keys(fields).length;
  // A seat Revenue Nomad found there that Confirm claims instead of adding a second one: the server's own rule (g.claim, lib/table.ts claimableSeats).
  const claims = !!g.claim;
  const earn = earnWords(g, facts, earnRoom(ui.me), ui.me.earnCap, claims);
  const fn = namedFn(g.function);
  const looks = role || (fn ? `Fractional ${fn} seat` : "");
  const canConfirm = !!(g.function || role.trim());
  const save = () => {
    setRole(draft.trim());
    setEditing(false);
  };
  return (
    <article className="sg-seat" aria-label={`A seat you might have held at ${g.name}`} data-guess={g.id}>
      <div className="sg-head">
        <CompanyLogo name={g.name} domain={info?.c.iconDomain ?? info?.domain ?? g.site} seed={info?.c.id} size="lg" />
        <div className="sg-who">
          <span className="sg-name">{g.name}</span>
          <span className="sg-line num">{guessLine(g)}</span>
        </div>
        {!g.sure && (
          <span className="chip chip-outline sg-less" title="Fewer months or fewer meetings than most seats. It may have been a project or a long sales conversation.">
            Less sure
          </span>
        )}
      </div>
      <dl className="sg-facts">
        {g.with.length > 0 && (
          <div>
            <dt>You met mostly with</dt>
            <dd>{g.with.map((p) => [p.name, p.title].filter(Boolean).join(", ")).join(" · ")}</dd>
          </div>
        )}
        <div>
          <dt>Looks like</dt>
          <dd>
            {editing ? (
              <form
                className="sg-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <input ref={input} className="input sg-input" value={draft} maxLength={80} aria-label={`Your title at ${g.name}`} placeholder={fn ? `Fractional VP ${fn}` : "Fractional VP Sales"} onChange={(e) => setDraft(e.target.value)} />
                <button type="submit" className="btn btn-sm">
                  Save
                </button>
                {(g.role || g.function) && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setDraft(role), setEditing(false))}>
                    Cancel
                  </button>
                )}
              </form>
            ) : (
              <>
                <b>{looks}</b>
                <button type="button" className="sg-link" onClick={() => (setDraft(role), setEditing(true))} aria-label={`Change the title for ${g.name}`}>
                  Change
                </button>
              </>
            )}
          </dd>
        </div>
      </dl>
      <p className="sg-adds">
        Confirm puts your name on a {fn ? `${fn} ` : ""}seat here, from {monthYear(g.from)}
        {g.active ? ", still active" : ` to ${monthYear(g.to)}`}. You can change any of it after.
      </p>
      <div className="sg-foot">
        <button type="button" className="btn btn-volt" disabled={!!busy || !canConfirm || editing} aria-busy={busy === "yes"} onClick={() => onConfirm(role.trim() || null)}>
          <IconCheck size={14} /> {busy === "yes" ? "Adding" : "Confirm this seat"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={!!busy} aria-busy={busy === "no"} onClick={onNo}>
          Not a seat
        </button>
        <span className="sg-sp" />
        <span className="sg-earn" data-waits={g.waits ? "1" : undefined}>
          {earn.plus && <span className="sg-plus num">{earn.plus}</span>}
          <span>{earn.text}</span>
        </span>
      </div>
    </article>
  );
}

export function SeatGuesses({ infos, seats, onShown }: { infos: CoInfo[]; /** The member's seats, for "N more answers" on one just confirmed. */ seats: SeatInfo[]; onShown?: (shown: boolean) => void }) {
  const ui = useUi();
  const toast = useToast();
  const { view } = useNetwork();
  const [done, setDone] = useState<Done[]>([]);
  const [busy, setBusy] = useState<{ id: string; what: "yes" | "no" } | null>(null);
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  const doneIds = new Set(done.map((d) => d.g.id));
  const guesses = (view?.seats ?? []).filter((g) => !doneIds.has(g.id));
  const total = guesses.length + done.length;
  const shown = total > 0;
  useEffect(() => onShown?.(shown), [shown, onShown]);
  if (!shown) return null;

  const confirm = async (g: SeatGuessView, role: string | null) => {
    if (busy) return;
    setBusy({ id: g.id, what: "yes" });
    // The existing Add, with the member as the seat holder: its rules, credits and limits, nothing new.
    // The seat it claims (g.claim) goes with it, so the Add claims that one and never adds a second seat beside it.
    const r = await ui.act({ type: "add", company: g.name, newEngagement: true, ...(g.claim ? { engagementId: g.claim } : {}), engagementFields: seatConfirmFields(g, ui.me.name, role), operatorMemberId: "me" }, { quiet: true });
    setBusy(null);
    if (!r.ok) return;
    // What it earned is the server's own sentence ("You earned 5 credits.", or "+5 when confirmed. ..."), said as it came.
    setDone((d) => [...d, { g, role, message: r.message, seatId: r.id ?? null }]);
    // The guess is a seat of theirs now: the server's list drops it.
    void load(true);
  };
  const no = async (g: SeatGuessView) => {
    if (busy) return;
    setBusy({ id: g.id, what: "no" });
    const r = await netAct("not-a-seat", { company: g.id });
    setBusy(null);
    toast(r.error ?? r.message ?? "Got it.", !!r.error);
  };
  const fnAll = namedFn(view?.seats[0]?.function ?? done[0]?.g.function ?? ui.me.function);

  return (
    <section className="sg" aria-labelledby="sg-h">
      <div className="sg-top">
        <div className="sg-top-t">
          <h2 className="sg-h" id="sg-h">
            {total === 1 ? "We think you held this seat" : `We think you held these ${total} seats`}
          </h2>
          <p className="sg-p">
            Your calendar shows months of regular meetings with {total === 1 ? "this company" : "each company"}. Confirm {total === 1 ? "it if it was a fractional seat" : "the ones that were fractional seats"}. Nothing is
            added until you do, and you never type a thing.
          </p>
        </div>
        <Prop name="seatYours" height={76} on="white" ember className="sg-art" />
      </div>
      {done.map((d) => {
        const seat = d.seatId ? seats.find((s) => s.e.id === d.seatId) : undefined;
        const left = seat ? seat.missing.length + seat.coMissing.length : 0;
        const room = earnRoom(ui.me);
        return (
          <article key={d.g.id} className="sg-seat sg-seat-done" aria-label={`Your seat at ${d.g.name}`} data-confirmed={d.g.id}>
            <div className="sg-head">
              <CompanyLogo name={d.g.name} domain={byId.get(d.g.id)?.c.iconDomain ?? byId.get(d.g.id)?.domain ?? d.g.site} seed={byId.get(d.g.id)?.c.id} size="lg" />
              <div className="sg-who">
                <span className="sg-name">{d.g.name}</span>
                <span className="sg-line num">{guessLine(d.g)}</span>
              </div>
              <span className="chip chip-volt sg-added">
                <IconCheck size={12} /> Added to Your seats
              </span>
            </div>
            <div className="sg-foot">
              <span className="sg-earn" role="status">
                {d.message}
              </span>
              <span className="sg-sp" />
              {seat && left > 0 && (
                <button type="button" className="btn btn-sm" onClick={() => ui.openSeats(d.seatId!)}>
                  Add {left} more {left === 1 ? "answer" : "answers"} {room > 0 && <span className="sg-plus num">+{Math.min(left, room)}</span>}
                </button>
              )}
            </div>
          </article>
        );
      })}
      {guesses.map((g) => (
        <GuessCard key={g.id} g={g} info={byId.get(g.id)} busy={busy?.id === g.id ? busy.what : null} onConfirm={(role) => void confirm(g, role)} onNo={() => void no(g)} />
      ))}
      <p className="sg-fine">
        <IconLock size={12} />
        <span>
          Only you see these suggestions. When you confirm one, members see that the company hired a fractional {fnAll ? `${fnAll} ` : ""}leader and when it started. Your name on the seat costs them 1 credit, like every seat. Who
          you met, and how often, is never shown.
        </span>
      </p>
    </section>
  );
}
