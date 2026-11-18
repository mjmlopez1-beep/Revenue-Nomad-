"use client";

/**
 * Find your seats: the member types the clients they work with now or worked with before, and
 * claims the seats we found there ("Not on Merlin yet", after the "Is this you?" check), or adds
 * the one they held when we have none. Each answer they then add to a seat earns a credit, up to
 * about 12 a seat. Onboarding's step 5, and in the app the top of Your seats (and its empty
 * state), where the zero-credits wall and Get started step 2 send members.
 *
 * The parts that decide what a client card says (seatsAt, seatState, seatLine) are pure and live
 * in ./suggest.ts, where scripts/test-onboard.mts checks them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "./onboard.css";
import { CompanyLogo, IconCheck, IconSearch, IconX, fmtMonth, post, val, type Act } from "../ui/shared";
import type { ActionResult, CompanyRec, EngagementRec } from "@/lib/tableTypes";
import { isFirm } from "@/app/post/model";
import { SEAT_YIELD } from "@/app/post/earnBack";
import { metaOf, seatLine as lineOf, seatState, seatsAt } from "./suggest";

export { SEAT_YIELD };

const seatLine = (e: EngagementRec) => lineOf(e, fmtMonth);

/** A seat on file there that the member can't claim here: its function, its line, where it stands. */
function OtherSeat({ e }: { e: EngagementRec }) {
  const f = val(e.cells.function);
  const line = seatLine(e);
  return (
    <li className="ob-seat ob-seat-other">
      <span className="ob-seat-id">
        <span className="ob-seat-line">{f && !line.startsWith(f) ? `${f} · ${line}` : line}</span>
        <span className="ob-seat-meta">{seatState(e)}</span>
      </span>
    </li>
  );
}

/** One unclaimed seat: "Claim it", then "Is this you?" with what the seat says, then the claim. */
function ClaimRow({ e, company, act }: { e: EngagementRec; company: string; act: Act }) {
  const [ask, setAsk] = useState<NonNullable<ActionResult["claim"]> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const askRef = useRef<HTMLLIElement>(null);
  // The question comes to the middle of the screen, clear of a sticky footer on a phone.
  useEffect(() => {
    if (ask) askRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ask]);
  if (e.yours)
    return (
      <li className="ob-seat ob-seat-done">
        <span className="ob-seat-line">{seatLine(e)}</span>
        <span className="ob-seat-ok">
          <IconCheck size={13} /> Your seat
        </span>
      </li>
    );
  const check = async () => {
    setErr(null);
    setBusy(true);
    const r = await post<ActionResult>({ action: { type: "claimSeat", engagementId: e.id, preview: true } });
    setBusy(false);
    if (r.error || !r.claim) setErr(r.error || "We couldn't load this seat. Try again.");
    else setAsk(r.claim);
  };
  const claim = async () => {
    setBusy(true);
    await act({ type: "claimSeat", engagementId: e.id });
    setBusy(false);
    setAsk(null);
  };
  if (ask) {
    const what = ask.role || ask.function || "A fractional seat";
    const when = ask.start ? (ask.end && ask.end !== "Ongoing" ? `${fmtMonth(ask.start)} to ${fmtMonth(ask.end)}` : `from ${fmtMonth(ask.start)}`) : "";
    return (
      <li className="ob-seat ob-seat-ask" role="group" aria-label="Claim this seat" ref={askRef}>
        <p>
          <b>Is this you?</b> {what} at {company}
          {when ? `, ${when}` : ""}. Other members will see your name on it, behind a 1 credit lock.
        </p>
        <span className="ob-seat-acts">
          <button type="button" className="btn btn-pine" disabled={busy} aria-busy={busy} onClick={claim}>
            {busy ? "Saving" : "Yes, it's my seat"}
          </button>
          <button type="button" className="btn" onClick={() => setAsk(null)}>
            Not me
          </button>
        </span>
      </li>
    );
  }
  return (
    <li className="ob-seat">
      <span className="ob-seat-id">
        <span className="ob-seat-line">{seatLine(e)}</span>
        <span className="ob-seat-meta">Not on Merlin yet</span>
        {err && (
          <span className="ob-seat-err" role="alert">
            {err}
          </span>
        )}
      </span>
      <button type="button" className="btn btn-pine ob-seat-btn" disabled={busy} onClick={check}>
        Claim it
      </button>
    </li>
  );
}

/** What the card says once a seat was added: what it earned (the balance moved by), and where to go on. */
function SeatAdded({ earned, rest }: { earned: number; rest: string }) {
  return (
    <p className="ob-seat-ok ob-seat-added" role="status">
      <IconCheck size={13} />
      <span>
        {earned > 0 ? `Added your seat, +${earned} ${earned === 1 ? "credit" : "credits"} for the ${earned === 1 ? "fact" : "facts"} on it. ${rest}` : `Added your seat. ${rest}`}
      </span>
    </p>
  );
}

/** "Add a seat you held" at a client we have no seat for: their title and whether it's ongoing, one tap. */
function AddSeat({ company, fn, title, name, act, onAdded }: { company: string; fn: string | null; title: string; name: string; act: Act; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(title);
  const [status, setStatus] = useState<"Active" | "Ended">("Active");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn ob-seat-add" onClick={() => setOpen(true)}>
        Add a seat you held
      </button>
    );
  const add = async () => {
    setBusy(true);
    const fields: Record<string, string> = { status, ...(fn ? { function: fn } : {}), ...(role.trim() ? { role: role.trim() } : {}), operator: name.trim() };
    const r = await act({ type: "add", company, newEngagement: true, engagementFields: fields, operatorMemberId: "me" }, { quiet: true });
    setBusy(false);
    if (r.ok) onAdded();
  };
  return (
    <div className="ob-seat-form">
      <label className="ob-seat-label" htmlFor={`ob-role-${company}`}>
        Your title there
      </label>
      <input id={`ob-role-${company}`} className="input" value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} placeholder={fn ? `Fractional VP ${fn}` : "Fractional VP Sales"} />
      <div className="ob-chips" role="radiogroup" aria-label="Still in the seat?">
        {(["Active", "Ended"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={status === s} className={`ob-chip${status === s ? " ob-chip-on" : ""}`} onClick={() => setStatus(s)}>
            {s === "Active" ? "I'm still there" : "It ended"}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-pine" disabled={busy || (!fn && !role.trim())} aria-busy={busy} onClick={add}>
        {busy ? "Adding" : "Add this seat"}
      </button>
    </div>
  );
}

/** How many seats are the member's at the clients typed: claimed or added at a company on file, plus seats added at a name we didn't have. */
export function seatsFound(companies: CompanyRec[], clients: string[], added: Record<string, number>): number {
  const byId = new Map(companies.map((c) => [c.id, c]));
  return clients.reduce((n, id) => n + (byId.get(id)?.engagements.filter((e) => e.yours).length ?? 0), 0) + Object.keys(added).filter((id) => id.startsWith("name:")).length;
}

export function FindSeats({
  companies,
  fn,
  title,
  name,
  credits,
  clients,
  setClients,
  act,
  autoFocus,
  where = "onboarding",
  added,
  setAdded,
}: {
  companies: CompanyRec[];
  fn: string | null;
  /** The member's title: the role a seat they add starts with. */
  title: string;
  /** The member's name: the seat holder on a seat they add. */
  name: string;
  /** The balance now, so a seat added here can say what it earned. */
  credits: number;
  /** Clients typed so far: a company id, or "name:" and a name we don't have. */
  clients: string[];
  setClients: (f: (c: string[]) => string[]) => void;
  act: Act;
  autoFocus?: boolean;
  /** Where the seats land: onboarding sends the member to Your seats later; in the app they are on it. */
  where?: "onboarding" | "seats";
  /** Seats added here, by client: the balance before each, so the card says what the seat earned. */
  added: Record<string, number>;
  setAdded: (f: (a: Record<string, number>) => Record<string, number>) => void;
}) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const starts: CompanyRec[] = [];
    const has: CompanyRec[] = [];
    for (const c of companies) {
      if (c.hidden || isFirm(c) || clients.includes(c.id)) continue;
      const n = c.name.toLowerCase();
      if (n.startsWith(t)) starts.push(c);
      else if (n.includes(t)) has.push(c);
      if (starts.length >= 6) break;
    }
    return [...starts, ...has].slice(0, 6);
  }, [q, companies, clients]);
  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const pick = (id: string) => {
    setClients((c) => (c.includes(id) ? c : [...c, id].slice(-20)));
    setQ("");
    inputRef.current?.focus();
  };
  // A name we don't have: kept as typed, so they can add the seat they held there.
  const typed = q.trim();
  const addTyped = () => typed && pick(`name:${typed.slice(0, 80)}`);
  // "Use “Hone”" only when no company on file is called exactly that.
  const exact = !!typed && results.some((c) => c.name.trim().toLowerCase() === typed.toLowerCase());
  const rest = where === "seats" ? "Fill in the rest below." : "Fill in the rest on Your seats.";
  return (
    <>
      <div className="ob-search">
        <span className="ob-search-icon" aria-hidden>
          <IconSearch size={16} />
        </span>
        <input
          ref={inputRef}
          className="input ob-search-input"
          placeholder="A client you worked with"
          aria-label="A client you worked with"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && results.length) {
              e.preventDefault();
              setHi((h) => (h + 1) % results.length);
            } else if (e.key === "ArrowUp" && results.length) {
              e.preventDefault();
              setHi((h) => (h - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[hi]) pick(results[hi].id);
              else addTyped();
            } else if (e.key === "Escape" && q) {
              // The first Esc clears what was typed; a second one is the page's (it closes what is open).
              e.stopPropagation();
              e.preventDefault();
              setQ("");
            }
          }}
          role="combobox"
          aria-expanded={!!typed}
          aria-controls="ob-client-results"
          aria-autocomplete="list"
          autoComplete="off"
        />
        {typed ? (
          <ul className="ob-results" id="ob-client-results" role="listbox">
            {results.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === hi}
                className={`ob-result${i === hi ? " ob-result-hi" : ""}`}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c.id)}
              >
                <CompanyLogo name={c.name} domain={c.iconDomain} />
                <span className="ob-result-id">
                  <span className="ob-result-name">{c.name}</span>
                  <span className="ob-result-meta">{metaOf(c) || "On Merlin"}</span>
                </span>
              </li>
            ))}
            {exact ? null : (
              <li role="option" aria-selected={false} className="ob-result" onMouseDown={(e) => e.preventDefault()} onClick={addTyped}>
                <span className="ob-result-id">
                  <span className="ob-result-name">Use &ldquo;{typed}&rdquo;</span>
                  <span className="ob-result-meta">Not on file yet. You can add the seat you held there.</span>
                </span>
              </li>
            )}
          </ul>
        ) : null}
      </div>

      {clients.length > 0 && (
        <ul className="ob-clients">
          {clients.map((id) => {
            const c = id.startsWith("name:") ? null : byId.get(id);
            const label = c ? c.name : id.slice(5);
            const { claim: list, others, note } = seatsAt(c, fn);
            const before = added[id];
            return (
              <li key={id} className="ob-client">
                <div className="ob-client-top">
                  {c ? <CompanyLogo name={c.name} domain={c.iconDomain} /> : null}
                  <span className="ob-client-name">{label}</span>
                  <button type="button" className="ob-client-x" aria-label={`Take ${label} off the list`} onClick={() => setClients((x) => x.filter((y) => y !== id))}>
                    <IconX size={12} />
                  </button>
                </div>
                {list.length > 0 && (
                  <ul className="ob-seats">
                    {list.map((e) => (
                      <ClaimRow key={e.id} e={e} company={label} act={act} />
                    ))}
                  </ul>
                )}
                {before !== undefined ? (
                  <SeatAdded earned={credits - before} rest={rest} />
                ) : !list.some((e) => e.yours) ? (
                  <div className="ob-client-add">
                    {note && <p className="ob-hint ob-hint-flush">{note}</p>}
                    {others.length > 0 && (
                      <ul className="ob-seats ob-seats-other" aria-label={`Seats on file at ${label}`}>
                        {others.map((e) => (
                          <OtherSeat key={e.id} e={e} />
                        ))}
                      </ul>
                    )}
                    <AddSeat company={label} fn={fn} title={title} name={name} act={act} onAdded={() => setAdded((a) => ({ ...a, [id]: credits }))} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
