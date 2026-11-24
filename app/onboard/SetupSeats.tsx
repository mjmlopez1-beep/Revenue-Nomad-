"use client";

/**
 * The set-up's step 2 and step 3 (Setup.tsx):
 *
 *   The seats you have held   the seats on file under the member's name (EngagementRec.yours), each
 *       with where it came from: "Yes, this is mine" keeps it (and asks the hours a week, 1 credit as
 *       any new fact earns), "Not mine" takes their name off as Your seats does (the notMine action,
 *       asked first, in the same words). Held one we missed: FindSeats.tsx, type a client and claim
 *       the seat Merlin found there or add the one held. Their name on their seats: Hide my name, and
 *       Show me in the Fractionals directory.
 *   Like your past clients    lookalikes (setupModel.ts likeStep, app/post/find/lookalikes.ts) with
 *       the member's own seats as the seeds: the profile as chips (one tap takes one off), the
 *       companies that share the most with why each matched, a locked company described by its
 *       free facts and never named, and "Save as your first list" with its alert on (weekly, by
 *       email and in the bell: every plan may). No seats: one honest line, and the step is skipped.
 */
import { useState } from "react";
import { IconCheck, IconX, fmtMonth, type Act, type View } from "../ui/shared";
import type { Me } from "@/lib/tableTypes";
import { NAME_HIDDEN, NAME_HIDDEN_SAY, seatNameWho } from "@/lib/tableFields";
import { shown, type CoInfo, type LikeTrait, type SeatInfo } from "@/app/post/model";
import { FoundSeats } from "@/app/post/FoundSeats";
import { SEAT_YIELD } from "@/app/post/earnBack";
import { FindSeats } from "./FindSeats";
import { ExportSeats } from "@/app/post/network/ExportPanel";
import { Head, Switch } from "./setupParts";
import { HOURS_PICKS, LIKE_LIST_NAME, LIKE_SHOWN, factsLine, likeListAction, likeRowView, seatSource, type LikeStep } from "./setupModel";
import { SETUP_STEPS } from "./setupModel";

/** What Merlin means by a seat, said once, where the member first adds one. */
export const SEAT_MEANS = "A seat is one fractional role you held at one client: the company, your role and the dates.";
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/* ---------- step 2: the seats ---------- */

function when(s: SeatInfo): string {
  const a = shown(s.e.cells.start);
  const b = shown(s.e.cells.end);
  if (!a) return b && b !== "Ongoing" ? `Ended ${fmtMonth(b)}` : "";
  return b && b !== "Ongoing" ? `${fmtMonth(a)} to ${fmtMonth(b)}` : `Since ${fmtMonth(a)}`;
}

/** What "Not mine" asks first, as Your seats asks it (app/post/Seats.tsx giveUp). */
function giveUpWords(s: SeatInfo): { q: string; go: string } {
  const op = s.e.cells.operator;
  const own = op?.s === "value" && !!op.mine;
  if (own && s.e.source === "Member added" && !s.e.opened) return { q: "Remove this seat? Everything you added to it comes off, with the credits it earned.", go: "Remove it" };
  if (own) return { q: "Not your seat? We'll take your name off it, with everything you added to it and the credits it earned.", go: "Take my name off" };
  if (op?.s === "value" && op.from === "records") return { q: "Take your name off this seat? We matched it by name, so it may be someone else's. Nobody will see your name on it.", go: "Take my name off" };
  return { q: "Take your name off this seat? Another member put it there, so it may be someone else's. We'll hide it while we check.", go: "Take my name off" };
}

function SeatCard({ s, yes, onYes, onUndo, act }: { s: SeatInfo; yes: boolean; onYes: () => void; onUndo: () => void; act: Act }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { i, e } = s;
  const role = shown(e.cells.role) ?? (shown(e.cells.function) ? `Fractional ${shown(e.cells.function)}` : "A fractional seat");
  const co = i.c.hidden ? "a locked company" : i.c.name;
  const meta = [when(s), factsLine(i)].filter(Boolean).join(" · ");
  const hoursEmpty = e.cells.hours?.s === "empty";
  const notMine = async () => {
    setBusy(true);
    setErr(null);
    const r = await act({ type: "notMine", engagementId: e.id }, { quiet: true, silentError: true });
    setBusy(false);
    if (!r.ok) setErr(r.message);
  };
  const pickHours = async (h: string) => {
    setBusy(true);
    setErr(null);
    const r = await act({ type: "fill", entity: "engagement", id: e.id, field: "hours", value: h }, { quiet: true, silentError: true });
    setBusy(false);
    if (r.ok) setHours(h);
    else setErr(r.message);
  };
  return (
    <article className={`su-seat${yes ? " yes" : ""}`} aria-label={`${role} at ${co}`}>
      <div className="su-seat-top">
        <span className="su-tile-q" aria-hidden>
          {i.c.hidden ? "?" : i.c.name.slice(0, 2)}
        </span>
        <span className="su-seat-t">
          <strong>
            {role} at {co}
          </strong>
          {meta ? <span>{meta}</span> : null}
          <span className="su-mute">{seatSource(e)}</span>
        </span>
        {yes ? (
          <>
            <span className="su-ok">
              <IconCheck size={14} /> Yours
            </span>
            <button type="button" className="su-link" onClick={onUndo}>
              Undo
            </button>
          </>
        ) : asking ? null : (
          <>
            <button type="button" className="su-pine" onClick={onYes}>
              Yes, this is mine
            </button>
            <button type="button" className="su-ghost" onClick={() => setAsking(true)}>
              Not mine
            </button>
          </>
        )}
      </div>
      {asking && !yes ? (
        <div className="su-ask" role="group" aria-label="Not your seat">
          <span>{giveUpWords(s).q}</span>
          <span className="su-acts">
            <button type="button" className="su-pine" disabled={busy} aria-busy={busy} onClick={() => void notMine()}>
              {busy ? "Saving" : giveUpWords(s).go}
            </button>
            <button type="button" className="su-ghost" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </span>
        </div>
      ) : null}
      {yes ? (
        <div className="su-seat-more">
          <span>A way in at {co}: the people you worked with there. Fill in the rest on Seats, {SEAT_YIELD}.</span>
          {hoursEmpty || hours ? (
            <span className="su-hours" role="group" aria-label="Hours a week">
              <strong>Hours a week</strong>
              {hours ? (
                <span className="su-ok num">
                  <IconCheck size={13} /> {hours} hours a week · +1 credit
                </span>
              ) : (
                <>
                  <span className="su-volt num">+1 credit</span>
                  {HOURS_PICKS.map((h) => (
                    <button key={h} type="button" className="su-chip" disabled={busy} onClick={() => void pickHours(h)}>
                      {h}
                    </button>
                  ))}
                </>
              )}
            </span>
          ) : null}
        </div>
      ) : null}
      {err ? (
        <span className="su-err" role="alert">
          {err}
        </span>
      ) : null}
    </article>
  );
}

export function SeatsScreen(p: {
  view: View;
  act: Act;
  infos: CoInfo[];
  seats: SeatInfo[];
  ready: boolean;
  fn: string | null;
  title: string;
  mine: string[];
  setMine: (f: (m: string[]) => string[]) => void;
  clients: string[];
  setClients: (f: (c: string[]) => string[]) => void;
  added: Record<string, number>;
  setAdded: (f: (a: Record<string, number>) => Record<string, number>) => void;
}) {
  const me = p.view.me!;
  const [nameHidden, setNameHidden] = useState(!!me.nameHidden);
  const [dir, setDir] = useState(me.fractionals === true);
  const setting = (k: "nameHidden" | "fractionals", on: boolean, undo: (v: boolean) => void) =>
    void p.act({ type: "settings", [k]: on }, { quiet: true, silentError: true }).then((x) => {
      if (!x.ok) undo(!on);
    });
  // A seat they claimed or added themselves is theirs already: it reads as confirmed.
  const yes = (s: SeatInfo) => p.mine.includes(s.e.id) || (s.e.cells.operator?.s === "value" && !!s.e.cells.operator.mine);
  const n = p.seats.length;
  const earned = p.view.ledger.filter((l) => l.delta > 0);
  const byCo = new Map<string, number>();
  for (const l of earned) if (l.company) byCo.set(l.company, (byCo.get(l.company) ?? 0) + l.delta);
  const total = earned.reduce((k, l) => k + l.delta, 0);
  return (
    <>
      <Head eyebrow={`Step 2 of ${SETUP_STEPS}`} title="The seats you have held">
        {!p.ready
          ? "Finding the seats on file under your name."
          : `${SEAT_MEANS} ` +
            (n
            ? `Merlin has ${plural(n, "seat", "seats")} on file that may be yours. Confirm each in a tap. Each fact you add to a seat earns a credit, and each seat becomes a way in.`
            : "Merlin has no seat under your name yet. Add the ones you held below: each fact you add earns a credit, and each seat becomes a way in.")}
      </Head>
      <div className="su-earn" aria-live="polite">
        <strong className="num">+{total}</strong>
        <span>{total ? "credits earned so far" : "credits so far. Add a fact and watch it tick."}</span>
        {[...byCo].slice(0, 4).map(([c, k]) => (
          <span key={c} className="su-earn-chip num">
            {c} <strong>+{k}</strong>
          </span>
        ))}
      </div>
      {p.ready ? (
        <div className="su-seats">
          {p.seats.map((s) => (
            <SeatCard key={s.e.id} s={s} yes={yes(s)} act={p.act} onYes={() => p.setMine((m) => [...new Set([...m, s.e.id])])} onUndo={() => p.setMine((m) => m.filter((x) => x !== s.e.id))} />
          ))}
        </div>
      ) : (
        <div className="su-skel" aria-hidden />
      )}
      {/* "Are these yours?": seats found under their own name (lib/table.ts foundOf), the same answer as on Your seats. */}
      {p.ready ? <FoundSeats me={me} act={p.act} /> : null}
      {/* The roles in the member's own LinkedIn export (lib/linkedin): confirmed one by one with the existing Add. */}
      {p.ready ? <ExportSeats act={p.act} holder={me.name} /> : null}
      <section className="su-hand" aria-label="Add a seat by hand">
        <span className="su-glabel">
          <strong>Held one we missed? Add it by hand</strong>
          <span>Type a client you worked with. Merlin lists the seats it found there: claim yours, or add the one you held.</span>
        </span>
        {p.ready ? (
          <FindSeats companies={p.view.companies} fn={p.fn} title={p.title} name={me.name} credits={me.credits} clients={p.clients} setClients={p.setClients} act={p.act} added={p.added} setAdded={p.setAdded} />
        ) : null}
      </section>
      <section className="su-names" aria-label="Your name on your seats">
        <Switch
          on={nameHidden}
          onChange={(on) => {
            setNameHidden(on);
            setting("nameHidden", on, setNameHidden);
          }}
          label="Hide my name on my seats"
          hint={nameHidden ? `Everyone else sees "${NAME_HIDDEN}" on your seats. Your seats and roles still count.` : NAME_HIDDEN_SAY}
        />
        <Switch
          on={dir}
          onChange={(on) => {
            setDir(on);
            setting("fractionals", on, setDir);
          }}
          label="Show me in the Fractionals directory"
          hint={`Fractionals who serve the same clients can find you and pass leads. ${seatNameWho(dir)}`}
        />
      </section>
    </>
  );
}

/* ---------- step 3: like your past clients ---------- */

export function LikeScreen(p: {
  act: Act;
  me: Me;
  like: LikeStep;
  ready: boolean;
  off: LikeTrait[];
  setOff: (f: (o: LikeTrait[]) => LikeTrait[]) => void;
  savedId: string | null;
  onSaved: (id: string, sig: string) => void;
  onSeats: () => void;
}) {
  const { like } = p;
  const [alertOn, setAlertOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const free = p.me.plan?.name === "free" && !!p.me.plan.hadTrial;
  const top = like.ranked.slice(0, LIKE_SHOWN);
  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await p.act(likeListAction(like.tokens, alertOn), { quiet: true, silentError: true });
    setBusy(false);
    if (r.ok && r.id) p.onSaved(r.id, `like:${like.tokens.join("~")}`);
    else setErr(r.message || "That list didn't save. Try again.");
  };
  return (
    <>
      <Head eyebrow={`Step 3 of ${SETUP_STEPS}`} title="Companies like your past clients">
        Merlin reads what the companies where you held a seat have in common, and lists the companies that share the most of it. Save them as your first list and Merlin tells you when one starts hiring.
      </Head>
      {!p.ready ? (
        <div className="su-skel" aria-hidden />
      ) : like.empty ? (
        <div className="su-honest" role="status">
          <strong>{like.empty === "noSeats" ? "Nothing to match yet" : "Nothing on file to match yet"}</strong>
          <span>
            {like.empty === "noSeats"
              ? "Lookalikes start from your past clients, and Merlin has no seat under your name yet. Add a seat on the step before, or skip this one: Find builds lookalikes whenever you have a seat."
              : "The companies where you held a seat have no industry, size or region on file yet, so there is nothing to match them on. Add those facts on Seats (each earns a credit), then Find builds the list."}
          </span>
          {like.empty === "noSeats" ? (
            <button type="button" className="su-ghost" onClick={p.onSeats}>
              Back to your seats
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="su-profile">
            <span className="su-glabel">
              <strong>Built from {plural(like.seeds.length, "past client", "past clients")}</strong>
              <span>{like.seeds.map((s) => (s.c.hidden ? "a locked company" : s.c.name)).join(", ")}</span>
            </span>
            <div className="su-chips" role="group" aria-label="What they have in common">
              {like.chips.map((c) => (
                <span key={c.k} className="su-chip on su-chip-x">
                  {c.label}
                  {p.savedId ? null : (
                    <button type="button" aria-label={`Take ${c.label} off`} onClick={() => p.setOff((o) => [...new Set([...o, c.k])])}>
                      <IconX size={11} />
                    </button>
                  )}
                </span>
              ))}
              {p.off.length && !p.savedId ? (
                <button type="button" className="su-link" onClick={() => p.setOff(() => [])}>
                  Put them all back
                </button>
              ) : null}
            </div>
            <span className="su-count-line">
              <strong className="num">{like.ranked.length.toLocaleString("en-US")}</strong> {like.ranked.length === 1 ? "company shares" : "companies share"} most of these with your past clients, the closest first.
            </span>
          </div>
          {top.length ? (
            <div className="su-like" role="table" aria-label="Companies like your past clients">
              <div className="su-like-row su-like-head" role="row">
                <span role="columnheader">Company</span>
                <span role="columnheader">Why it matched</span>
                <span role="columnheader">Fractionals hired</span>
              </div>
              {top.map((r) => {
                const v = likeRowView(r);
                return (
                  <div key={v.id} className="su-like-row" role="row">
                    <span role="cell" className="su-like-co">
                      <span className="su-tile-q" aria-hidden>
                        {v.locked ? "?" : v.title.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{v.title}</strong>
                        <span>{v.meta}</span>
                        {v.locked ? <span className="su-mute">Locked · opens with its name later</span> : null}
                      </span>
                    </span>
                    <span role="cell">{v.why}</span>
                    <span role="cell" className="su-mute">
                      {v.hired ?? "None on file"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="su-small">No company on Merlin shares enough with your past clients yet. Take off a chip to widen it.</p>
          )}
          <section className="su-save" aria-label="Save as your first list">
            {p.savedId ? (
              <span className="su-ok" role="status">
                <IconCheck size={14} /> Saved as &ldquo;{LIKE_LIST_NAME}&rdquo;, your first list.{" "}
                {alertOn ? "Its alert is on: weekly, by email and in the bell." : "Its alert is off. Turn it on from Alerts."} Find it on Home under Your lists.
              </span>
            ) : (
              <>
                <span className="su-glabel">
                  <strong>Save as your first list: {LIKE_LIST_NAME}</strong>
                  <span>Merlin watches these companies and tells you when one posts a role, hires a fractional or a seat ends.</span>
                </span>
                <Switch on={alertOn} onChange={setAlertOn} label="Alert me when something happens" hint={`Weekly, by email and in the bell.${free ? " As it happens is part of Pro." : ""}`} />
                <button type="button" className="su-pine" disabled={busy} aria-busy={busy} onClick={() => void save()}>
                  {busy ? "Saving" : "Save as your first list"}
                </button>
                {err ? (
                  <span className="su-err" role="alert">
                    {err}
                  </span>
                ) : null}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
