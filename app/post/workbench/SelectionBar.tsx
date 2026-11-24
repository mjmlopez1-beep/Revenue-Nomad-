"use client";

/**
 * The bar over the table while rows are picked: Unlock N with what it costs, Add to pipeline,
 * Draft notes, Refer it to a peer, and Clear. There is no Export: members cannot export data from
 * Merlin (the owner's decision).
 *
 * Unlock is one quote, one confirm, one button: pressing it only asks the server for a quote (a dry
 * run, nothing spent) and shows it in the bar, with the balance after and any limit that stops part
 * of it; only the quote's own button runs it (run.ts, in batches of 60).
 */
import { useEffect, useState, type ReactNode } from "react";
import type { UnlockQuote } from "@/lib/tableTypes";
import { COMPANY_PRICE } from "@/lib/tableFields";
import { useToast } from "../../ui/shared";
import type { RecordType, Row } from "../model";
import { useUi } from "../ui";
import { companyItems, unlockItems } from "./pickItems";
import { appDeps, creditWords, fetchQuote, quoteWords } from "./quote";
import { runUnlock } from "./run";

/** The pure halves (what Unlock and Open buy), kept where they were for every caller. */
export { companyItems, unlockItems };

const NOUN: Record<RecordType, [string, string]> = { companies: ["company", "companies"], people: ["person", "people"], engagements: ["seat", "seats"] };

export function SelectionBar({
  type,
  rows,
  onClear,
  onPipeline,
  onNotes,
  onPass,
  onDone,
  extra,
}: {
  type: RecordType;
  rows: Row[];
  onClear: () => void;
  onPipeline: () => void;
  onNotes: () => void;
  onPass: () => void;
  /** A run finished: what it opened and spent, for the status line. */
  onDone?: (x: { done: number; spent: number }) => void;
  /** A page's own buttons after Refer it to a peer (Hiring now's Mark as seen). */
  extra?: ReactNode;
}) {
  const ui = useUi();
  const toast = useToast();
  const me = ui.me;
  const own = unlockItems(type, rows);
  const cos = companyItems(type, rows);
  // What the quote is for: the rows' own unlock, or (people and seats) their locked companies first.
  const [what, setWhat] = useState<"rows" | "cos">("rows");
  const items = what === "cos" ? cos : own.items;
  const wait = own.wait;
  const [q, setQ] = useState<UnlockQuote | null>(null);
  const [busy, setBusy] = useState<"quote" | "run" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // A quote is for the rows it was asked for: picking another row asks again.
  const sig = items.map((t) => `${t.id}.${t.field}`).join(",");
  useEffect(() => {
    setQ(null);
    setErr(null);
  }, [sig]);
  // Before the quote: the bar's own estimate, from the plan's free opens (the quote is the server's word).
  const isCo = type === "companies" || what === "cos";
  const coGuess = (n: number) => (n - (me.proOpens ? Math.min(n, me.proOpens.left) : 0)) * COMPANY_PRICE;
  const guess = type === "companies" ? coGuess(own.items.length) : own.items.length;
  const noun = isCo ? NOUN.companies : NOUN[type];
  const label =
    type === "companies" && guess === 0
      ? `Open ${own.items.length} · free ${me.plan?.name === "trial" ? "on the trial" : "today"}`
      : `Unlock ${own.items.length} · ${creditWords(guess)}`;
  const coLabel = `Open ${cos.length} ${cos.length === 1 ? "company" : "companies"} · ${coGuess(cos.length) === 0 ? `free ${me.plan?.name === "trial" ? "on the trial" : "today"}` : creditWords(coGuess(cos.length))}`;
  const ask = async (w: "rows" | "cos") => {
    setErr(null);
    setWhat(w);
    setBusy("quote");
    const r = await fetchQuote(w === "cos" ? cos : own.items);
    setBusy(null);
    if ("error" in r) return setErr(r.error);
    setQ(r);
  };
  const run = async () => {
    if (!q) return;
    setBusy("run");
    const out = await runUnlock({ items, quote: q, confirmed: true }, appDeps(ui));
    setBusy(null);
    setQ(null);
    onDone?.({ done: out.done, spent: out.spent });
    if (out.stopped) toast(out.stopped, !out.done);
  };
  const w = q ? quoteWords(q, noun, isCo && me.proOpens ? me.proOpens.left : null) : null;
  const picked = rows.length;
  const someOpen = rows.some((r) => !r.i.c.hidden);
  return (
    <div className="wb-selbar" role="toolbar" aria-label="Actions for the rows you picked">
      <strong className="wb-sel-n">{picked} selected</strong>
      {q && w ? (
        <span className="wb-sel-quote" role="status">
          <span className="wb-sel-total">{w.total}</span>
          <span className="wb-sel-after">{w.after}</span>
          {w.stop && <span className="wb-sel-stop">{w.stop}</span>}
          <button type="button" className="wb-sel-btn" onClick={() => setQ(null)} disabled={busy === "run"}>
            Not now
          </button>
          {q.fits > 0 && (
            <button type="button" className="wb-sel-btn wb-sel-primary" onClick={() => void run()} disabled={busy === "run"} aria-busy={busy === "run"} autoFocus>
              {busy === "run" ? "Opening" : `${q.cost ? "Unlock" : "Open"} ${q.fits} · ${creditWords(q.cost)}`}
            </button>
          )}
        </span>
      ) : (
        <>
          {cos.length > 0 && (
            <button type="button" className="wb-sel-btn wb-sel-primary" onClick={() => void ask("cos")} disabled={!!busy} aria-busy={busy === "quote" && what === "cos"}>
              {busy === "quote" && what === "cos" ? "Getting the price" : coLabel}
            </button>
          )}
          {own.items.length > 0 && (
            <button type="button" className="wb-sel-btn wb-sel-primary" onClick={() => void ask("rows")} disabled={!!busy} aria-busy={busy === "quote" && what === "rows"}>
              {busy === "quote" && what === "rows" ? "Getting the price" : label}
            </button>
          )}
          {wait > 0 && <span className="wb-sel-wait">{wait === 1 ? "1 opens" : `${wait} open`} after the company</span>}
          <button type="button" className="wb-sel-btn" onClick={onPipeline} disabled={!someOpen} title={someOpen ? undefined : "Open a company first. Then it can go in your pipeline."}>
            Add to pipeline
          </button>
          <button type="button" className="wb-sel-btn" onClick={onNotes} disabled={!someOpen} title={someOpen ? undefined : "Open a company first. Then Merlin drafts the note."}>
            Draft notes
          </button>
          <button type="button" className="wb-sel-btn" onClick={onPass}>
            Refer it to a peer
          </button>
          {extra}
        </>
      )}
      {err && (
        <span className="wb-sel-err" role="alert">
          {err}
        </span>
      )}
      <button type="button" className="wb-sel-clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
