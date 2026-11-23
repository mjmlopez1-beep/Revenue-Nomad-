"use client";

/**
 * The drill-in for an Enrich run: which rows (all in view, the ones picked, or the first 5 to try
 * it), what each costs, the total from the server's quote, the balance after, and Run. Picking a
 * scope only asks for a quote; Run, its own button, is the yes. Rows with nothing on file to buy
 * are skipped, never charged ("never charged for a row that comes back empty"), and rows that need
 * something opened first are counted and said, never bought on the way.
 */
import { useEffect, useState } from "react";
import type { UnlockQuote } from "@/lib/tableTypes";
import { useToast } from "../../ui/shared";
import type { FactRef, RecordType, Row } from "../model";
import { useUi } from "../ui";
import { columnOf, costWords, rowNeed } from "./columns";
import { appDeps, creditWords, fetchQuote } from "./quote";
import { runUnlock } from "./run";

export type Scope = "all" | "sel" | "test";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What a run on these rows would buy, and why the rest won't be. */
export function runPlan(col: string, rows: Row[]): { items: FactRef[]; wait: number; skip: number } {
  const items: FactRef[] = [];
  const keys = new Set<string>();
  let wait = 0;
  let skip = 0;
  for (const r of rows) {
    const n = rowNeed(col, r);
    if (n === "wait") wait++;
    else if (n === "skip") skip++;
    else if (!keys.has(`${n.id}.${n.field}`)) (keys.add(`${n.id}.${n.field}`), items.push(n));
  }
  return { items, wait, skip };
}

const DESC: Record<string, { title: string; desc: string; wait: string }> = {
  company: { title: "Company name and website", desc: "Opens each company: its name, website and job postings. Who held its seats then shows free.", wait: "" },
  decider: { title: "Decision maker", desc: "The name and title of who hires, one purchase for both. A company has to be open first.", wait: "need the company opened first" },
  email: { title: "Work email", desc: "The decision maker's work email, where one is on file. Their name has to be open first.", wait: "need the company or the decision maker's name first" },
  rate: { title: "Rate paid", desc: "What the latest seat paid, where a member shared it. A company has to be open first.", wait: "need the company opened first" },
};
/** People's runs (People.dc.html): the person's own locks. */
const PEOPLE_DESC: Record<string, { title: string; desc: string; wait: string }> = {
  company: { title: "Open these companies", desc: "Opens each company: its name, website and who held the seat. Its people can then be opened.", wait: "" },
  name: { title: "Find the decider", desc: "Opens the name and title of each locked person in this view. One unlock shows both. A locked company has to be open first.", wait: "need the company opened first" },
  email: { title: "Find an email", desc: "Opens the email for each person whose name you can see. Where none is on file nothing is spent, and you can add it to earn 1 credit.", wait: "need the company or the name opened first" },
  phone: { title: "Find a phone number", desc: "Opens the phone for each person whose name you can see. Where none is on file nothing is spent.", wait: "need the company or the name opened first" },
  linkedin: { title: "Find a public profile", desc: "Opens the link to the public profile of each person whose name you can see. Where none is on file nothing is spent.", wait: "need the company or the name opened first" },
};

export function RunConfig({
  type = "companies",
  col,
  rows,
  picked,
  onBack,
  onDone,
}: {
  /** The list the rows are (People's runs are the person's own locks). */
  type?: RecordType;
  col: string;
  /** The rows in view. */
  rows: Row[];
  /** The rows picked, in view order. */
  picked: Row[];
  onBack: () => void;
  /** The run finished: the column shows, and the status line says what it filled and spent. */
  onDone: (x: { col: string; scope: Row[]; done: number; spent: number }) => void;
}) {
  const ui = useUi();
  const toast = useToast();
  const def = columnOf(type === "people" ? "people" : "companies", col) ?? columnOf("companies", col);
  const d = (type === "people" ? PEOPLE_DESC[col] : null) ?? DESC[col] ?? { title: def?.label ?? col, desc: def?.tip ?? "", wait: "need something opened first" };
  const [scope, setScope] = useState<Scope>(picked.length ? "sel" : "all");
  const scopeRows = (s: Scope) => (s === "all" ? rows : s === "sel" ? picked : rows.slice(0, 5));
  const plan = runPlan(col, scopeRows(scope));
  const sig = plan.items.map((t) => `${t.id}.${t.field}`).join(",");
  const [q, setQ] = useState<UnlockQuote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"quote" | "run" | null>(null);
  // The total is the server's quote for exactly these rows (a dry run: nothing spent).
  useEffect(() => {
    setQ(null);
    setErr(null);
    if (!plan.items.length) return;
    let live = true;
    setBusy("quote");
    void fetchQuote(plan.items).then((r) => {
      if (!live) return;
      setBusy(null);
      if ("error" in r) setErr(r.error);
      else setQ(r);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const per = col === "company" ? (ui.me.proOpens && ui.me.proOpens.left > 0 ? "Free on the trial and Pro, up to 15 a day" : costWords(def?.cost ?? 1).replace("/ row", "credits a row")) : "1 credit a row";
  const run = async () => {
    if (!q) return;
    setBusy("run");
    const out = await runUnlock({ items: plan.items, quote: q, confirmed: true }, appDeps(ui));
    setBusy(null);
    if (out.stopped) toast(out.stopped, !out.done);
    onDone({ col, scope: scopeRows(scope), done: out.done, spent: out.spent });
  };
  const scopes: { key: Scope; name: string; n: number }[] = [
    { key: "all", name: `All ${plural(rows.length, "row")} in this view`, n: runPlan(col, rows).items.length },
    { key: "sel", name: `Selected rows (${picked.length})`, n: runPlan(col, picked).items.length },
    { key: "test", name: "First 5 rows, to try it", n: runPlan(col, rows.slice(0, 5)).items.length },
  ];
  return (
    <div className="wb-cfg">
      <button type="button" className="wb-back" onClick={onBack}>
        Back to tools
      </button>
      <div className="wb-cfg-head">
        <span className="wb-eyebrow">Enrich · column</span>
        <strong className="wb-cfg-title">{d.title}</strong>
        <span className="wb-cfg-desc">{d.desc}</span>
      </div>
      <fieldset className="wb-scopes">
        <legend>Run it on</legend>
        {scopes.map((s) => (
          <label key={s.key} className={`wb-scope${scope === s.key ? " on" : ""}`}>
            <input type="radio" name="wb-scope" checked={scope === s.key} onChange={() => setScope(s.key)} disabled={s.key === "sel" && !picked.length} />
            <span className="wb-scope-t">{s.name}</span>
            <span className="wb-scope-n">{s.n ? plural(s.n, "to open", "to open") : "Nothing to open"}</span>
          </label>
        ))}
      </fieldset>
      <div className="wb-total" role="status" aria-live="polite">
        {!plan.items.length ? (
          <>
            <strong>Nothing to buy in these rows</strong>
            <span>
              {plan.wait ? `${plural(plan.wait, "row")} ${d.wait}. ` : ""}
              {plan.skip ? `${plural(plan.skip, "row")} ${col === "company" ? "open already" : "show it already or have none on file"}, so they cost nothing.` : ""}
            </span>
          </>
        ) : busy === "quote" || (!q && !err) ? (
          <strong>Getting the price from Merlin</strong>
        ) : err ? (
          <strong role="alert">{err}</strong>
        ) : q ? (
          <>
            <strong>
              {plural(q.fits, "row")} · {creditWords(q.cost)}
            </strong>
            <span>
              {q.cost ? `You have ${plural(q.credits, "credit")}, ${plural(q.after, "credit")} after.` : `You have ${plural(q.credits, "credit")}. Nothing is spent.`} You are never charged for a row that comes back empty.
            </span>
            {q.stop && <span className="wb-total-stop">{q.fits < q.asked ? `Only the first ${plural(q.fits, "row")} fit. ` : ""}{q.stop}</span>}
            {(plan.wait > 0 || plan.skip > 0) && (
              <span>
                {plan.wait ? `${plural(plan.wait, "row")} ${d.wait}, so they are left out. ` : ""}
                {plan.skip ? `${plural(plan.skip, "row")} cost nothing.` : ""}
              </span>
            )}
          </>
        ) : null}
      </div>
      <div className="wb-cfg-foot">
        <span className="wb-cfg-per">{per}</span>
        <button type="button" className="btn btn-pine wb-run" disabled={!q || q.fits === 0 || busy !== null} aria-busy={busy === "run"} onClick={() => void run()}>
          {busy === "run" ? "Running" : q ? `Run · ${creditWords(q.cost)}` : "Run"}
        </button>
      </div>
    </div>
  );
}
