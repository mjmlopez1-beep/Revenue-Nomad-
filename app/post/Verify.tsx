"use client";

/**
 * Verify: the small button beside a seat holder's name from public profiles that nobody has
 * verified yet (Cell.unverified). There is no "not verified" label: the button is the whole sign.
 * It opens three choices, each the server's own action:
 *  - This is me: claim the seat (claimSeat). A name that isn't the member's own waits for an admin
 *    first, and the toast says so.
 *  - I know this is right: confirm it (verify). Two members confirming it verify it. It earns nothing.
 *  - This is wrong: report it (report). One report takes the name off for everyone at once, and
 *    whoever paid to see it gets the credit back.
 * Once the name is verified the server stops sending `unverified`, and the button is gone. On a
 * phone the choices open in a sheet, elsewhere in a popover. Clicks stay inside it, so a table row
 * under it never opens the record or spends a credit.
 *
 * Beside the name there is no check of any kind while it is unverified (a tick reads as
 * "verified"). How many members confirmed it (`count`, the cell's `ver`) is said in here instead.
 */
import { useRef, useState } from "react";
import { IconCheck } from "../ui/shared";
import { Anchored, Sheet, useCellUi } from "./ui";
import { confirmedWords } from "./display";
import "./verify.css";

export function VerifyName({ engagementId, confirmed = false, count = 0, waiting = false }: { engagementId: string; confirmed?: boolean; count?: number; waiting?: boolean }) {
  const ui = useCellUi();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The member said the seat is theirs: an admin decides, so nothing else to choose here.
  if (waiting)
    return (
      <span className="vf-wait" title="You said this seat is yours. An admin is checking it, and your name goes on it once they agree.">
        Your claim is with an admin
      </span>
    );
  const t = { entity: "engagement" as const, id: engagementId, field: "operator" };
  const run = async (key: string, a: Parameters<typeof ui.act>[0]) => {
    setBusy(key);
    const r = await ui.act(a);
    setBusy(null);
    if (r.ok) setOpen(false);
  };
  const choices = (
    <div className="vf-list">
      <button type="button" className="vf-row" disabled={!!busy} aria-busy={busy === "me"} onClick={() => void run("me", { type: "claimSeat", engagementId })}>
        <b>This is me</b>
        <span>Claim the seat. It moves to Your seats, and the facts you add there earn credits. If the name isn&apos;t yours as written, an admin checks first.</span>
      </button>
      {confirmed ? (
        <div className="vf-row is-done">
          <b>
            <IconCheck size={13} /> You confirmed this name
          </b>
          <span>Once another member confirms it too, it&apos;s verified.</span>
        </div>
      ) : (
        <button type="button" className="vf-row" disabled={!!busy} aria-busy={busy === "right"} onClick={() => void run("right", { type: "verify", ...t })}>
          <b>I know this is right</b>
          <span>Two members confirming it makes it verified. It doesn&apos;t earn a credit.</span>
        </button>
      )}
      <button type="button" className="vf-row vf-row-red" disabled={!!busy} aria-busy={busy === "wrong"} onClick={() => void run("wrong", { type: "report", ...t })}>
        <b>This is wrong</b>
        <span>The name comes off for everyone now, and whoever paid to see it gets the credit back.</span>
      </button>
    </div>
  );
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
              <p className="vf-h">Verify this name</p>
              <p className="vf-count num">{confirmedWords(count)}</p>
              {choices}
            </Anchored>
          )
        ))}
    </span>
  );
}
