"use client";

/**
 * The bar over the table while rows are picked: Unlock N with what it costs, Add to pipeline,
 * Draft notes, Pass as a lead, and Clear. There is no Export: members cannot export data from
 * Merlin (the owner's decision).
 *
 * Unlock is one quote, one confirm, one button: pressing it only asks the server for a quote (a dry
 * run, nothing spent) and shows it in the bar, with the balance after and any limit that stops part
 * of it; only the quote's own button runs it (run.ts, in batches of 60).
 */
import { useEffect, useState } from "react";
import type { UnlockQuote } from "@/lib/tableTypes";
import { COMPANY_PRICE } from "@/lib/tableFields";
import { useToast } from "../../ui/shared";
import type { FactRef, RecordType, Row } from "../model";
import { useUi } from "../ui";
import { appDeps, creditWords, fetchQuote, quoteWords } from "./quote";
import { runUnlock } from "./run";

/** What Unlock buys for each picked row: a company's own unlock, a person's name and title, who held a seat. Rows with nothing to buy are left out. */
export function unlockItems(type: RecordType, rows: Row[]): { items: FactRef[]; wait: number } {
  const items: FactRef[] = [];
  const seen = new Set<string>();
  let wait = 0;
  for (const r of rows) {
    const i = r.i;
    if (type === "companies") {
      if (i.c.hidden && !seen.has(i.c.id)) (seen.add(i.c.id), items.push({ entity: "company", id: i.c.id, field: "identity" }));
      continue;
    }
    if (i.c.hidden) {
      wait++;
      continue;
    }
    if (type === "people" && r.p) {
      const lead = (["name", "title"] as const).find((f) => r.p!.cells[f]?.s === "locked");
      if (lead) items.push({ entity: "contact", id: r.p.id, field: lead });
    } else if (type === "engagements" && r.e) {
      const lead = (["operator", "role"] as const).find((f) => r.e!.cells[f]?.s === "locked");
      if (lead) items.push({ entity: "engagement", id: r.e.id, field: lead });
    }
  }
  return { items, wait };
}

const NOUN: Record<RecordType, [string, string]> = { companies: ["company", "companies"], people: ["person", "people"], engagements: ["seat", "seats"] };

export function SelectionBar({
  type,
  rows,
  onClear,
  onPipeline,
  onNotes,
  onPass,
  onDone,
}: {
  type: RecordType;
  rows: Row[];
  onClear: () => void;
  onPipeline: () => void;
  onNotes: () => void;
  onPass: () => void;
  /** A run finished: what it opened and spent, for the status line. */
  onDone?: (x: { done: number; spent: number }) => void;
}) {
  const ui = useUi();
  const toast = useToast();
  const me = ui.me;
  const { items, wait } = unlockItems(type, rows);
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
  const freeLeft = type === "companies" && me.proOpens ? Math.min(items.length, me.proOpens.left) : 0;
  const guess = type === "companies" ? (items.length - freeLeft) * COMPANY_PRICE : items.length;
  const noun = NOUN[type];
  const label =
    type === "companies" && guess === 0
      ? `Open ${items.length} · free ${me.plan?.name === "trial" ? "on the trial" : "today"}`
      : `Unlock ${items.length} · ${creditWords(guess)}`;
  const ask = async () => {
    setErr(null);
    setBusy("quote");
    const r = await fetchQuote(items);
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
  const w = q ? quoteWords(q, noun, type === "companies" && me.proOpens ? me.proOpens.left : null) : null;
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
          {items.length > 0 && (
            <button type="button" className="wb-sel-btn wb-sel-primary" onClick={() => void ask()} disabled={!!busy} aria-busy={busy === "quote"}>
              {busy === "quote" ? "Getting the price" : label}
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
            Pass as a lead
          </button>
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
