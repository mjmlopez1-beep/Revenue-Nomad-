"use client";

/**
 * Build a case from a seat, in three questions (Evidence.dc.html, the build panel): what Merlin
 * already has from the seat (industry, size, revenue, dates, hours), then one question at a time:
 * the problem, what you did (with type of work tags), and the numbers before and after. Private by
 * default is said under it.
 *
 * Nothing costs a credit. The case is saved through the route (api.ts): a seat with no case yet is
 * drafted first (draftFromSeat, which fills in what the seat has), then the answers are saved. The
 * words are the member's own; Merlin joins them into how it reads in a Proof part with a template,
 * never with an AI, and never adds a number.
 */
import { useMemo, useState } from "react";
import { IconLock, IconPlus, IconX } from "../../ui/shared";
import * as api from "./api";
import { problemPicks, tagGroups, type EvidenceCase, type EvidenceOutcome } from "./types";
import { QUESTIONS, canBeReady, cleanOutcomes, factsOf, labelFrom, labelOf, problemLines, seededProblem, titleFrom, titleOf, type EvRow, type SeatLite } from "./evidenceModel";

type Own = Exclude<EvRow, { kind: "example" }>;
const low = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function Builder({
  row,
  others,
  onPick,
  onSaved,
  onSeats,
  seatsHref,
  firstCase,
  startAt = 0,
}: {
  row: Own | null;
  /** The member's other seats with no case yet, to switch to. */
  others: SeatLite[];
  onPick: (key: string) => void;
  onSaved: (c: EvidenceCase, built: boolean) => void;
  onSeats: () => void;
  seatsHref: string;
  /** This is the member's first case (step 6). */
  firstCase: boolean;
  /** The question to open at (Add a tag opens at the second). */
  startAt?: number;
}) {
  const c = row?.kind === "case" ? row.c : null;
  const seat = row?.seat ?? null;
  const known = problemPicks();
  const [q, setQ] = useState(Math.max(0, Math.min(2, startAt)));
  const [picked, setPicked] = useState<string[]>(() => (c ? c.problems.filter((p) => known.includes(p)) : []));
  // What the member typed for the problem: the problems off the pick list, else the route's own first answer (seeded from why they hired), else ours.
  const [typed, setTyped] = useState<string>(() => {
    if (!c) return seededProblem(seat);
    const own = c.problems.filter((p) => !known.includes(p)).join("\n");
    const picks = c.problems.filter((p) => known.includes(p));
    return own || (c.problemText && c.problemText !== picks.join(". ") && !picks.includes(c.problemText) ? c.problemText : "") || (c.status === "draft" ? seededProblem(seat) : "");
  });
  const seeded = c?.status !== "ready" && !!seat?.why;
  const [text, setText] = useState(c?.text ?? "");
  const [tags, setTags] = useState<string[]>(c?.workType ?? []);
  const [outs, setOuts] = useState<EvidenceOutcome[]>(() => (c?.outcomes.length ? c.outcomes : [{ k: "", before: "", after: "" }]));
  const [title, setTitle] = useState(c?.status === "ready" ? c.title : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const problems = useMemo(() => [...picked, ...problemLines(typed).filter((p) => !picked.includes(p))].slice(0, 8), [picked, typed]);
  const ready = canBeReady({ problems, text });
  const f = row ? factsOf(row) : null;
  const facts = [
    ["Industry", f?.industry],
    ["Company size", f?.size ? `${f.size.replace(/–/g, " to ")} people` : ""],
    ["Revenue", f?.revenue?.replace(/–/g, " to ")],
    ["Dates", seat?.dates],
    ["Hours", seat?.hours],
  ].filter((x): x is [string, string] => !!x[1]);

  const flip = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  const build = async (asDraft: boolean) => {
    setErr(null);
    setBusy(true);
    let id = c?.id;
    let base: EvidenceCase | null = c;
    if (!id && seat) {
      const d = await api.draftFromSeat(seat.id);
      if (api.failed(d)) return setBusy(false), setErr(d.error);
      id = d.id;
      base = d;
    }
    const numbers = cleanOutcomes(outs);
    const status = !asDraft && ready ? "ready" : "draft";
    const r = await api.save({
      ...(id ? { id } : {}),
      ...(seat && !id ? { seatId: seat.id } : {}),
      status,
      title: (title.trim() || titleFrom(problems, seat)).slice(0, 120),
      problems,
      text: text.trim().slice(0, 2000),
      workType: tags,
      outcomes: numbers,
      ...(base ? {} : { clientNamed: false, clientLabel: seat ? labelFrom(seat) : "A company", industry: seat?.industry ?? "", size: seat?.size ?? "", revenue: seat?.revenue ?? "", motion: seat?.motion ?? "", soldTo: "", workedWith: [], showOnCard: false }),
    });
    setBusy(false);
    if (api.failed(r)) return setErr(r.error);
    onSaved(r, status === "ready");
  };

  const step = QUESTIONS[q];
  const last = q === 2;
  return (
    <div className="ev-build">
      {seat && !c && others.length > 0 && (
        <div className="ev-sec">
          <span className="ev-k">Build from a seat you added</span>
          <div className="ev-chips">
            {[seat, ...others].map((s) => (
              <button key={s.id} type="button" className={`ev-fchip${s.id === seat.id ? " on" : ""}`} aria-pressed={s.id === seat.id} onClick={() => onPick(`seat:${s.id}`)}>
                {(s.industry || "A company") + (s.dates ? ` · ${s.dates}` : "")}
              </button>
            ))}
          </div>
          <a className="ev-link" href={seatsHref} onClick={(e) => (e.preventDefault(), onSeats())}>
            Add another seat
          </a>
        </div>
      )}
      {!row && (
        <p className="ev-note">
          Add a seat you held in{" "}
          <a href={seatsHref} onClick={(e) => (e.preventDefault(), onSeats())}>
            Seats
          </a>{" "}
          and its draft starts here, with the company and the dates filled in. Or write this case from scratch below.
        </p>
      )}
      {facts.length > 0 && (
        <div className="ev-sec ev-known">
          <span className="ev-k">Already on file. Merlin filled these in from your seat</span>
          <div className="ev-known-list">
            {facts.map(([k, v]) => (
              <span key={k} className="ev-known-f">
                {k} <strong>{v}</strong>
              </span>
            ))}
          </div>
          <span className="ev-sub">
            Something wrong?{" "}
            <a href={seatsHref} onClick={(e) => (e.preventDefault(), onSeats())}>
              Change it in Seats
            </a>
          </span>
        </div>
      )}
      <div className="ev-bars" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i <= q ? "on" : undefined} />
        ))}
      </div>
      <div className="ev-q" role="group" aria-labelledby="ev-q-t">
        <span className="ev-k">Question {q + 1} of 3</span>
        <strong id="ev-q-t" className="ev-q-t">
          {step.q}
        </strong>
        <span className="ev-sub">{step.hint}</span>
        {q === 0 && (
          <>
            <div className="ev-chips" role="group" aria-label="Problems to pick">
              {known.map((p) => (
                <button key={p} type="button" className={`ev-fchip${picked.includes(p) ? " on" : ""}`} aria-pressed={picked.includes(p)} onClick={() => setPicked(flip(picked, p))}>
                  {p}
                </button>
              ))}
            </div>
            {seeded && typed === seededProblem(seat) && <span className="ev-seeded">Merlin started this from why they hired you, on your seat. Change it freely.</span>}
            <textarea className="input ev-ta" aria-label="The problem, in your words, one a line" rows={3} maxLength={1600} value={typed} placeholder={step.ph} onChange={(e) => setTyped(e.target.value)} />
          </>
        )}
        {q === 1 && (
          <>
            <textarea className="input ev-ta" aria-label="What you did, in your words" rows={4} maxLength={2000} value={text} placeholder={step.ph} onChange={(e) => setText(e.target.value)} />
            <span className="ev-k">Type of work</span>
            <div className="ev-tagcats">
              {tagGroups().map((g) => (
                <div key={g.cat} className="ev-tagcat" role="group" aria-label={g.cat}>
                  <span className="ev-tagcat-t">{g.cat}</span>
                  <span className="ev-chips">
                    {g.tags.map((t) => (
                      <button key={t} type="button" className={`ev-tag${tags.includes(t) ? " on" : ""}`} aria-pressed={tags.includes(t)} onClick={() => setTags(flip(tags, t))}>
                        {t}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {q === 2 && (
          <>
            <div className="ev-outs">
              <span className="ev-outs-h" aria-hidden>
                <span>What changed</span>
                <span>Before</span>
                <span>After</span>
                <span />
              </span>
              {outs.map((o, n) => (
                <span key={n} className="ev-out-row">
                  <input className="input" aria-label={`Number ${n + 1}: what changed`} placeholder={n === 0 ? "Win rate" : "Sales cycle"} maxLength={80} value={o.k} onChange={(e) => setOuts(outs.map((x, i) => (i === n ? { ...x, k: e.target.value } : x)))} />
                  <input className="input" aria-label={`Number ${n + 1}: before`} placeholder={n === 0 ? "22%" : "94 days"} maxLength={40} value={o.before} onChange={(e) => setOuts(outs.map((x, i) => (i === n ? { ...x, before: e.target.value } : x)))} />
                  <input className="input" aria-label={`Number ${n + 1}: after`} placeholder={n === 0 ? "31%" : "61 days"} maxLength={40} value={o.after} onChange={(e) => setOuts(outs.map((x, i) => (i === n ? { ...x, after: e.target.value } : x)))} />
                  <button type="button" className="wb-iconbtn" aria-label={`Remove number ${n + 1}`} onClick={() => setOuts(outs.length > 1 ? outs.filter((_, i) => i !== n) : [{ k: "", before: "", after: "" }])}>
                    <IconX size={14} />
                  </button>
                </span>
              ))}
              {outs.length < 6 && (
                <button type="button" className="ev-link ev-addnum" onClick={() => setOuts([...outs, { k: "", before: "", after: "" }])}>
                  <IconPlus size={14} /> Add a number
                </button>
              )}
            </div>
            <label className="ev-title">
              <span className="ev-k">A title for the case</span>
              <input className="input" maxLength={120} value={title} placeholder={titleFrom(problems, seat)} onChange={(e) => setTitle(e.target.value)} />
            </label>
            {!ready && <span className="ev-sub">The problem and what you did make a case ready. Until both are written it stays a draft.</span>}
          </>
        )}
        {err && (
          <p className="ev-err" role="alert">
            {err}
          </p>
        )}
        <div className="ev-q-foot">
          {q > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setQ(q - 1)}>
              Back
            </button>
          )}
          <span className="ev-sub ev-q-cost">No credits. About 3 minutes for all three.</span>
          {last && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void build(true)}>
              Save as a draft
            </button>
          )}
          <button type="button" className="btn btn-pine" disabled={busy} aria-busy={busy} onClick={() => (last ? void build(false) : setQ(q + 1))}>
            {busy ? "Saving" : q === 0 ? "Next: what you did" : q === 1 ? "Next: the numbers" : c?.status === "ready" ? "Save the case" : firstCase ? "Build my first case" : "Build the case"}
          </button>
        </div>
      </div>
      <div className="ev-priv">
        <IconLock size={16} />
        <span>
          <strong>Private by default</strong>
          <span>Only you see your cases. One leaves this page only when you put it in a proposal or turn on Show on my card.</span>
          <span>
            The client name is hidden. A reader sees <strong>{c ? low(labelOf(c)) : row ? low(labelFrom(factsOf(row))) : "a line like \"a health care company, $20M to $50M\""}</strong>. You name a client case by case, once they have said yes.
          </span>
        </span>
      </div>
    </div>
  );
}

/** The build panel's head. */
export const buildHead = (row: Own | null, firstCase: boolean) => {
  const c = row?.kind === "case" ? row.c : null;
  const ready = c?.status === "ready";
  return {
    kicker: ready ? "Edit the case" : firstCase ? "Step 6 · your first case" : "Build a case",
    title: row ? titleOf(row) : "A new case",
    sub: ready ? "Change an answer and save." : row?.seat ? "Merlin has the company and the dates. Answer three questions and the case is ready." : "Answer three questions and the case is ready.",
  };
};
