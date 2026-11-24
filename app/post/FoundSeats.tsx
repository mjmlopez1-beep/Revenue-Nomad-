"use client";

/**
 * "Are these yours?" (Me.foundSeats, lib/table.ts foundOf): seats Revenue Nomad found under the
 * member's own name, from public profiles, that nobody has claimed. Until the member answers, other
 * members see ONE card for them (their account, named the way they chose), never a second research
 * profile under the same name.
 *
 * Each seat is ticked to start. "Yes, these are mine" claims the ticked ones (the foundSeats
 * action: the claim rules and the daily claim limit of claimSeat); the unticked ones, and every one
 * on "None of these are me", are "This isn't me", so that record shows again as someone else.
 * A locked company is described by its free facts, never named. Shown on Your seats and on the
 * set-up's seats step.
 */
import { useState } from "react";
import type { FoundSeat, Me } from "@/lib/tableTypes";
import type { Act } from "../ui/shared";
import "./foundSeats.css";

const when = (f: FoundSeat) => {
  const y = (d: string | null) => (d ? d.slice(0, 4) : "");
  const from = y(f.start);
  const to = f.now ? "now" : y(f.end);
  return from && to ? `${from} to ${to}` : from || to || "";
};

/** The seat in a line: its role (or function), and its company or what is known about it. */
export const foundLine = (f: FoundSeat) =>
  [f.role || (f.fn ? `Fractional ${f.fn}` : "A fractional seat"), f.company ?? (f.facts ? `A locked company: ${f.facts}` : "A locked company"), when(f)].filter(Boolean).join(" · ");

export function FoundSeats({ me, act, className }: { me: Pick<Me, "foundSeats" | "name">; act: Act; className?: string }) {
  const list = me.foundSeats ?? [];
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"mine" | "notMine" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (!list.length)
    return said ? (
      <p className={`fs-said${className ? ` ${className}` : ""}`} role="status">
        {said}
      </p>
    ) : null;
  const ticked = list.filter((f) => !off.has(f.id)).length;
  const answer = async (k: "mine" | "notMine") => {
    if (busy) return;
    if (k === "mine" && !ticked) return setErr("Tick at least one seat that's yours, or pick None of these are me.");
    setErr(null);
    setBusy(k);
    const r = await act(k === "mine" ? { type: "foundSeats", answer: "mine", skip: [...off] } : { type: "foundSeats", answer: "notMine" }, { quiet: true, silentError: true });
    setBusy(null);
    if (!r.ok) return setErr(r.message || "That didn't go through. Try again.");
    setSaid(r.message);
    setOff(new Set());
  };
  return (
    <section className={`fs-box${className ? ` ${className}` : ""}`} aria-labelledby="fs-h">
      <h2 className="fs-h" id="fs-h">
        Are these yours?
      </h2>
      <p className="fs-p">
        Revenue Nomad found {list.length === 1 ? "a seat" : `${list.length} seats`} under the name {me.name}. Until you answer, members see one card for you, with your name the way you chose. Untick any that aren&apos;t yours.
      </p>
      <ul className="fs-list">
        {list.map((f) => {
          const on = !off.has(f.id);
          return (
            <li key={f.id} className="fs-row">
              <label className="fs-pick">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setOff((o) => {
                      const n = new Set(o);
                      if (n.has(f.id)) n.delete(f.id);
                      else n.add(f.id);
                      return n;
                    })
                  }
                />
                <span>{foundLine(f)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {err ? (
        <p className="fs-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="fs-acts">
        <button type="button" className="btn btn-pine btn-sm" disabled={!!busy || !ticked} onClick={() => void answer("mine")}>
          {busy === "mine" ? "Saving" : ticked === list.length ? (list.length === 1 ? "Yes, this is mine" : "Yes, these are mine") : `Yes, the ${ticked === 1 ? "ticked one is" : `${ticked} ticked are`} mine`}
        </button>
        <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => void answer("notMine")}>
          {busy === "notMine" ? "Saving" : list.length === 1 ? "This isn't me" : "None of these are me"}
        </button>
      </div>
    </section>
  );
}
