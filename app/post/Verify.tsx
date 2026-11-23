"use client";

/**
 * Verify: who held this seat. Three choices, each the server's own action:
 *  - This is me: claim the seat (claimSeat). A name that isn't the member's own waits for an admin
 *    first, and the answer says so.
 *  - I know this is right: confirm it (verify). Two members confirming it verify it. It earns nothing.
 *  - This is wrong: report it (report). One report takes the name off for everyone at once, and
 *    whoever paid to see it gets the credit back.
 * A seat Merlin found with nobody named has only the first ("Is this you?").
 *
 * Where it shows:
 *  - VerifyName, the small button beside a seat holder's name from public profiles that nobody has
 *    verified yet (Cell.unverified). There is no "not verified" label: the button is the whole sign.
 *    On a phone the choices open in a sheet, elsewhere in a popover; inside a VerifyHost (the Seats
 *    page) they open in that page's side panel instead (VerifyPanel). Clicks stay inside it, so a
 *    table row under it never opens the record or spends a credit.
 *  - VerifyPanel, the side panel's drill-in ("Verify · who held this seat"), with what the member
 *    chose said in place once it went through.
 *  - VerifyChoices, the choices alone (Add what you know's "Or check a name").
 *
 * Once the name is verified the server stops sending `unverified`, and the button is gone. Beside
 * the name there is no check of any kind while it is unverified (a tick reads as "verified"). How
 * many members confirmed it (`count`, the cell's `ver`) is said in here instead.
 */
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { IconCheck } from "../ui/shared";
import { Anchored, Sheet, useCellUi } from "./ui";
import { confirmedWords } from "./display";
import "./verify.css";

/** The seat a Verify is about. `named`: a name is on it (else "Nobody named yet": only "This is me"). */
export interface VerifyTarget {
  engagementId: string;
  named: boolean;
  confirmed?: boolean;
  count?: number;
}

/** What the member chose, once the server took it. */
export type VerifyDone = "me" | "right" | "wrong";

/**
 * A page that shows Verify in its own panel (the Seats page's Tools side): VerifyName hands it the
 * seat instead of opening a popover. A phone always gets the sheet.
 */
const HostCtx = createContext<((t: VerifyTarget) => void) | null>(null);
export const VerifyHost = ({ open, children }: { open: (t: VerifyTarget) => void; children: ReactNode }) => <HostCtx.Provider value={open}>{children}</HostCtx.Provider>;
export const useVerifyHost = () => useContext(HostCtx);

const CHOICE: Record<VerifyDone, { t: string; p: (named: boolean) => string }> = {
  me: {
    t: "This is me",
    p: (named) => `Claim the seat. It moves to Your seats, and the facts you add there earn credits.${named ? " If the name isn't yours as written, an admin checks first." : ""}`,
  },
  right: { t: "I know this is right", p: () => "Two members confirming it makes it verified. It doesn't earn a credit." },
  wrong: { t: "This is wrong", p: () => "The name comes off for everyone now, and whoever paid to see it gets the credit back." },
};

/** The choices for one seat. `onDone`: the server took one (its own message is the toast). */
export function VerifyChoices({ t, onDone, compact = false }: { t: VerifyTarget; onDone?: (d: VerifyDone, message: string) => void; compact?: boolean }) {
  const ui = useCellUi();
  const [busy, setBusy] = useState<VerifyDone | null>(null);
  const fact = { entity: "engagement" as const, id: t.engagementId, field: "operator" };
  const run = async (key: VerifyDone) => {
    setBusy(key);
    const r = await ui.act(key === "me" ? { type: "claimSeat", engagementId: t.engagementId } : key === "right" ? { type: "verify", ...fact } : { type: "report", ...fact });
    setBusy(null);
    if (r.ok) onDone?.(key, r.message);
  };
  const keys: VerifyDone[] = t.named ? ["me", "right", "wrong"] : ["me"];
  return (
    <div className={`vf-list${compact ? " vf-list-compact" : ""}`}>
      {keys.map((k) =>
        k === "right" && t.confirmed ? (
          <div key={k} className="vf-row is-done">
            <b>
              <IconCheck size={13} /> You confirmed this name
            </b>
            {!compact && <span>Once another member confirms it too, it&apos;s verified.</span>}
          </div>
        ) : (
          <button key={k} type="button" className={`vf-row${k === "wrong" ? " vf-row-red" : ""}`} disabled={!!busy} aria-busy={busy === k} onClick={() => void run(k)}>
            <b>{CHOICE[k].t}</b>
            {!compact && <span>{CHOICE[k].p(t.named)}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/** What a choice did, said once it went through. */
export function doneWords(d: VerifyDone, named: boolean, count = 0): string {
  if (d === "me") return named ? "Your claim is sent. If the name on file isn't yours as written, an admin checks it first. The seat waits in Your seats." : "The seat is yours now. It is in Your seats, and each fact you add there earns 1 credit.";
  if (d === "right") return count >= 1 ? "That makes 2 members. The name is verified now. Confirming earns no credit." : "You confirmed this name. Once another member confirms it too, it is verified. Confirming earns no credit.";
  return "The name came off for everyone, and whoever paid to see it gets the credit back. An admin will look.";
}

/**
 * The side panel's drill-in (the Seats page): the seat, how many confirmed the name, the choices,
 * and once one went through what it did, with "Go to Your seats" after a claim.
 */
export function VerifyPanel({
  t,
  title,
  sub,
  from,
  onBack,
  onMine,
  onAdd,
}: {
  t: VerifyTarget;
  /** The name on the seat, or "Nobody named yet". */
  title: string;
  /** "Fractional VP Sales at Northwind Clinics, from Feb 2024". */
  sub: string;
  /** Where the name came from ("public profiles"), for the count line. */
  from?: string | null;
  onBack: () => void;
  onMine: () => void;
  /** "I know who held it": Add what you know at the company. */
  onAdd?: () => void;
}) {
  const [done, setDone] = useState<VerifyDone | null>(null);
  const count = t.count ?? 0;
  const countLine = !t.named
    ? "Merlin found this seat. Nobody holds it on Merlin until its fractional claims it."
    : count === 1
      ? "1 member confirmed this name. One more makes it verified."
      : count > 1
        ? confirmedWords(count)
        : `No member has confirmed this name yet.${from ? ` It came from ${from}.` : ""}`;
  return (
    <div className="vf-panel">
      <button type="button" className="wb-back" onClick={onBack}>
        Back to the table
      </button>
      <div className="vf-panel-head">
        <span className="wb-eyebrow">Verify · who held this seat</span>
        <strong className="vf-panel-title">{title}</strong>
        <span className="vf-panel-sub">{sub}</span>
        <span className="vf-count num">{countLine}</span>
      </div>
      {done ? (
        <div className="vf-panel-done" role="status">
          {doneWords(done, t.named, count)}
        </div>
      ) : (
        <VerifyChoices t={t} onDone={(d) => setDone(d)} />
      )}
      {!t.named && !done && onAdd && (
        <button type="button" className="tp-flink vf-panel-add" onClick={onAdd}>
          I know who held it. Add the name in the record
        </button>
      )}
      {done === "me" && (
        <button type="button" className="btn btn-pine vf-panel-mine" onClick={onMine}>
          Go to Your seats
        </button>
      )}
    </div>
  );
}

export function VerifyName({ engagementId, confirmed = false, count = 0, waiting = false }: { engagementId: string; confirmed?: boolean; count?: number; waiting?: boolean }) {
  const ui = useCellUi();
  const host = useVerifyHost();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // The member said the seat is theirs: an admin decides, so nothing else to choose here.
  if (waiting)
    return (
      <span className="vf-wait" title="You said this seat is yours. An admin is checking it, and your name goes on it once they agree.">
        Your claim is with an admin
      </span>
    );
  const t: VerifyTarget = { engagementId, named: true, confirmed, count };
  const choices = <VerifyChoices t={t} onDone={() => setOpen(false)} />;
  return (
    <span className="vf" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        className="vf-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Is this the right name? Verify it"
        onClick={(e) => {
          e.stopPropagation();
          if (host && ui.layout !== "phone") return host(t);
          setOpen(true);
        }}
      >
        Verify
      </button>
      {open &&
        (ui.layout === "phone" ? (
          <Sheet title="Verify this name" onClose={() => setOpen(false)}>
            <p className="vf-lead">Who held this seat? Tell us if the name is right.</p>
            <p className="vf-count num">{confirmedWords(count)}</p>
            {choices}
          </Sheet>
        ) : (
          btn.current && (
            <Anchored anchor={btn.current} width={340} onClose={() => setOpen(false)} label="Verify this name" className="vf-pop">
              <p className="vf-eyebrow">Verify · who held this seat</p>
              <p className="vf-h">Verify this name</p>
              <p className="vf-count num">{confirmedWords(count)}</p>
              {choices}
            </Anchored>
          )
        ))}
    </span>
  );
}
