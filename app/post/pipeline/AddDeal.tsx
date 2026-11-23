"use client";

/**
 * Add a deal, and Add from a list (Pipeline.dc.html's two side panels).
 *
 *   Add a deal       pick a company: any the member can see (typed by name or website), one found
 *                    by its exact name or website, or one not on Merlin yet, added from its website
 *                    (AddCompany, as a proposal adds a client). Then the seat pitched, what it is
 *                    worth a month (the member's own figure, with the benchmark range as a hint),
 *                    and the stage to start it in. Free: adding a deal never spends a credit.
 *   Add from a list  companies on the member's own lists (opened, the ideal client, followed) not
 *                    in the pipeline yet. A company they can see adds free; a locked one opens
 *                    first, asked and priced before anything is spent (ui.unlock).
 */
import { useMemo, useState } from "react";
import { LINE, STAGE_WORDS, pitchesFor, type MoveStage } from "@/lib/pipeline";
import type { Benchmarks, CompanyRec } from "@/lib/tableTypes";
import { COMPANY_PRICE } from "@/lib/tableFields";
import { normaliseSite } from "@/lib/proposals/startCall";
import { CompanyLogo, IconX, LockedName, useToast } from "../../ui/shared";
import { useExactFind } from "../../ui/find";
import { useUi } from "../ui";
import { icpEmpty, icpMatch, shown, type CoInfo } from "../model";
import { useApp } from "../shell/pages";
import { pipelineAct } from "../pipelineStore";
import { AddCompany } from "../AddCompany";
import { money } from "./model";

/**
 * The benchmark's hint beside the value box: "Members charge $7,500 to $11,000 a month for Sales at
 * this size", from the member's own function and the company's revenue band, else the function's
 * median, else nothing. A hint only: the value is what the member types.
 */
export function benchHint(b: Benchmarks | undefined, fn: string | null, i: CoInfo | undefined): string | null {
  if (!b || !fn || fn === "Other") return null;
  const band = i ? shown(i.c.cells.revenue) : null;
  const rows = b.rows.filter((r) => r.function === fn);
  const at = (band && rows.find((r) => r.revenue === band)) || null;
  const all = rows.find((r) => r.revenue === "All") ?? null;
  for (const [r, size] of [
    [at, " at this size"],
    [all, ""],
  ] as const) {
    const m = r?.monthly;
    if (m?.p25 && m.p75) return `Members charge ${money(m.p25)} to ${money(m.p75)} a month for ${fn}${size}.`;
  }
  const med = at?.monthly.median ?? all?.monthly.median;
  return med ? `The median for ${fn} is ${money(med)} a month.` : null;
}

const STARTS: MoveStage[] = [...LINE] as MoveStage[];

/* ---------- Add a deal ---------- */

export function AddDeal({ onClose, onAdded, stageAt }: { onClose: () => void; onAdded: (companyId: string) => void; stageAt: Map<string, string> }) {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string; i?: CoInfo } | null>(null);
  const pitches = pitchesFor(c.me.function);
  const [pitch, setPitch] = useState<string>(pitches[0]);
  const [other, setOther] = useState("");
  const [val, setVal] = useState("");
  const [stage, setStage] = useState<MoveStage>("reach");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(0);
  const q = text.trim().toLowerCase();
  const matches = useMemo(() => (q.length < 2 || picked ? [] : c.infos.filter((i) => !i.c.hidden && i.nameHay.toLowerCase().includes(q)).slice(0, 6)), [q, c.infos, picked]);
  const [found] = useExactFind(text, !picked && q.length >= 3 && matches.length === 0, now);
  const site = normaliseSite(text) && /\./.test(text) ? normaliseSite(text) : null;
  const pickRec = (r: CompanyRec) => setPicked({ id: r.id, name: r.name, i: c.byId.get(r.id) });
  const openFound = async (r: CompanyRec) => {
    const ok = await ui.unlock({ entity: "company", id: r.id, field: "identity" });
    if (ok) pickRec(r);
  };
  const hint = benchHint(c.view.benchmarks, c.me.function ?? null, picked?.i);
  const pitchNow = pitch === "other" ? other.trim() : pitch;
  const go = async () => {
    if (!picked) return setErr(q ? "Pick the company from the list first." : "Type the company first.");
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await pipelineAct({ type: "pipeline.deal", companyId: picked.id, stage, value: val.trim() || null, pitch: pitchNow || null } as never);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    toast(r.message);
    onAdded(picked.id);
  };
  return (
    <aside className="pl2-drawer" aria-label="Add a deal">
      <div className="pl2-dr-head">
        <span className="pl2-dr-t">
          <strong>Add a deal</strong>
          <span className="pl2-dr-sub">Any company you are trying to win</span>
        </span>
        <button type="button" className="pl2-x" aria-label="Close" onClick={onClose}>
          <IconX size={16} />
        </button>
      </div>
      {/* A div, not a form: Add <Name> to Merlin inside it is a form of its own. */}
      <div className="pl2-dr-body pl2-form">
        <label className="pl2-lab" htmlFor="pl2-aco">
          Company
        </label>
        {picked ? (
          <span className="pl2-picked">
            <CompanyLogo name={picked.name} domain={picked.i?.c.iconDomain ?? picked.i?.domain ?? null} seed={picked.id} />
            <strong>{picked.name}</strong>
            <button type="button" className="pl2-link" onClick={() => (setPicked(null), setAdding(false))}>
              Change
            </button>
          </span>
        ) : (
          <>
            <input
              id="pl2-aco"
              className="pl2-in"
              autoComplete="off"
              value={text}
              placeholder="Name or website, like northwind.example"
              onChange={(e) => (setText(e.target.value), setAdding(false))}
              onKeyDown={(e) => {
                // Enter picks the first company you can see, else looks it up by its exact name or website.
                if (e.key === "Enter") (e.preventDefault(), matches[0] ? setPicked({ id: matches[0].c.id, name: matches[0].c.name, i: matches[0] }) : setNow(Date.now()));
              }}
            />
            {matches.length > 0 && (
              <ul className="pl2-matches" aria-label="Companies you can see">
                {matches.map((i) => (
                  <li key={i.c.id}>
                    <button type="button" onClick={() => setPicked({ id: i.c.id, name: i.c.name, i })}>
                      <CompanyLogo name={i.c.name} domain={i.c.iconDomain ?? i.domain} seed={i.c.id} />
                      <span>
                        <strong>{i.c.name}</strong>
                        <span className="pl2-sub">{stageAt.has(i.c.id) ? `In your pipeline, at ${stageAt.get(i.c.id)}` : i.domain ?? ""}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!matches.length && found?.recs.length ? (
              <ul className="pl2-matches" aria-label="Found by its exact name or website">
                {found.recs.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    {r.hidden ? (
                      <span className="pl2-found">
                        <CompanyLogo name="" domain={null} hidden seed={r.id} />
                        <span>
                          <strong>{r.name}</strong>
                          <span className="pl2-sub">On Merlin, still locked for you</span>
                        </span>
                        <button type="button" className="pl2-open" onClick={() => void openFound(r)}>
                          Open · {ui.me.proOpens && ui.me.proOpens.left > 0 ? "free" : `${COMPANY_PRICE} credits`}
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => pickRec(r)}>
                        <CompanyLogo name={r.name} domain={r.iconDomain} seed={r.id} />
                        <span>
                          <strong>{r.name}</strong>
                          <span className="pl2-sub">On Merlin</span>
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {found?.error && <span className="pl2-err">{found.error}</span>}
            {!matches.length && found?.none && !adding && (
              <span className="pl2-small">
                {found.none}{" "}
                <button type="button" className="mv-link" onClick={() => setAdding(true)}>
                  Add it from its website
                </button>
              </span>
            )}
            {adding && (
              <AddCompany
                name={site ? "" : text.trim()}
                website={site}
                onAdded={(r) => (setPicked({ id: r.companyId, name: r.name }), setAdding(false))}
                onCancel={() => setAdding(false)}
              />
            )}
            {!q && <span className="pl2-small">Type the company. Any company you can see works, and one Merlin doesn&apos;t have yet adds from its website.</span>}
          </>
        )}
        <span className="pl2-lab" id="pl2-seat-l">
          Seat you are pitching
        </span>
        <div className="pl2-radios" role="radiogroup" aria-labelledby="pl2-seat-l">
          {[...pitches, "other"].map((p) => (
            <button key={p} type="button" role="radio" aria-checked={pitch === p} className={pitch === p ? "on" : ""} onClick={() => setPitch(p)}>
              {p === "other" ? "Another seat" : p}
            </button>
          ))}
        </div>
        {pitch === "other" && <input className="pl2-in" aria-label="The seat you are pitching" maxLength={60} value={other} placeholder="Fractional VP Sales" onChange={(e) => setOther(e.target.value)} />}
        <label className="pl2-lab" htmlFor="pl2-aval">
          Value a month, in dollars
        </label>
        <input id="pl2-aval" className="pl2-in" inputMode="numeric" autoComplete="off" value={val} placeholder="9000" onChange={(e) => setVal(e.target.value)} />
        <span className="pl2-small">
          {hint ?? "Optional. What you expect it to be worth a month."}{" "}
          <button type="button" className="mv-link" onClick={() => c.openPage("rates")}>
            Rate benchmarks
          </button>
        </span>
        <span className="pl2-lab" id="pl2-stage-l">
          Start it in
        </span>
        <div className="pl2-radios" role="radiogroup" aria-labelledby="pl2-stage-l">
          {STARTS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={stage === s} className={stage === s ? "on" : ""} onClick={() => setStage(s)}>
              {STAGE_WORDS[s]}
            </button>
          ))}
        </div>
        {err && (
          <span className="pl2-err" role="alert">
            {err}
          </span>
        )}
        <div className="pl2-dr-foot">
          <span className="pl2-small pl2-grow">Free. Adding a deal never spends a credit.</span>
          <button type="button" className="pl2-big pl2-pine" disabled={busy} aria-busy={busy} onClick={() => void go()}>
            Add the deal
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Add from a list ---------- */

type ListKey = "opened" | "icp" | "follow";
const LIST_WORDS: Record<ListKey, string> = { opened: "You opened", icp: "Your ideal client", follow: "You follow" };
/** Rows a list shows at once. */
const LIST_ROWS = 8;

export function AddFromList({ first, inPipeline, onClose, onAdded }: { first: boolean; inPipeline: Set<string>; onClose: () => void; onAdded: (companyId: string) => void }) {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const hasIcp = !icpEmpty(c.me.icp);
  const lists = useMemo(() => {
    const free = (i: CoInfo) => !i.c.hidden;
    const out: { key: ListKey; rows: CoInfo[] }[] = [];
    const not = (i: CoInfo) => !inPipeline.has(i.c.id);
    out.push({ key: "opened", rows: c.infos.filter((i) => not(i) && free(i) && (i.unlockedByMe || !!i.c.unlocked || i.c.mine)) });
    if (hasIcp) {
      const m = c.infos.filter((i) => not(i) && icpMatch(c.me.icp, i.c) === "match");
      out.push({ key: "icp", rows: [...m.filter(free), ...m.filter((i) => !free(i))] });
    }
    out.push({ key: "follow", rows: c.infos.filter((i) => not(i) && i.c.following) });
    return out.filter((l) => l.rows.length > 0);
    // The lists as they stood when the panel opened: a company added stays in place, marked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.infos, hasIcp, c.me.icp]);
  const [tab, setTab] = useState<ListKey | null>(null);
  const cur = lists.find((l) => l.key === tab) ?? lists.find((l) => l.key === (first ? "icp" : "opened")) ?? lists[0] ?? null;
  const freeOpen = !!ui.me.proOpens && ui.me.proOpens.left > 0;
  const add = async (i: CoInfo) => {
    if (busy) return;
    setBusy(i.c.id);
    if (i.c.hidden) {
      const ok = await ui.unlock({ entity: "company", id: i.c.id, field: "identity" });
      if (!ok) return setBusy(null);
    }
    const r = await pipelineAct({ type: "pipeline.add", companyIds: [i.c.id] });
    setBusy(null);
    toast(r.message, !r.ok);
    if (r.ok) setDone((s) => new Set(s).add(i.c.id)), onAdded(i.c.id);
  };
  const saved = (c.me.savedViews ?? []).filter((v) => v.place);
  return (
    <aside className="pl2-drawer" aria-label="Add from a list">
      <div className="pl2-dr-head">
        <span className="pl2-dr-t">
          <strong>Add from a list</strong>
          <span className="pl2-dr-sub">Companies on your lists, not in your pipeline yet</span>
        </span>
        <button type="button" className="pl2-x" aria-label="Close" onClick={onClose}>
          <IconX size={16} />
        </button>
      </div>
      <div className="pl2-dr-body">
        <span className="pl2-small">Each one lands in To reach out, free when you can see it. Add a value a month on its card when you know it.</span>
        {lists.length > 0 ? (
          <>
            <div className="pl2-radios" role="tablist" aria-label="Your lists">
              {lists.map((l) => (
                <button key={l.key} type="button" role="tab" aria-selected={cur?.key === l.key} className={cur?.key === l.key ? "on" : ""} onClick={() => setTab(l.key)}>
                  {LIST_WORDS[l.key]} · {l.rows.length}
                </button>
              ))}
            </div>
            <ul className="pl2-picklist">
              {(cur?.rows ?? []).slice(0, LIST_ROWS).map((i) => {
                const lock = !!i.c.hidden;
                const isIn = done.has(i.c.id);
                return (
                  <li key={i.c.id}>
                    <CompanyLogo name={lock ? "" : i.c.name} domain={lock ? null : i.c.iconDomain ?? i.domain} hidden={lock} seed={i.c.id} />
                    <span className="pl2-pick-t">
                      {lock ? <LockedName seed={i.c.id} /> : <strong>{i.c.name}</strong>}
                      <span className="pl2-sub">{lock ? i.teaser : [shown(i.c.cells.industry), shown(i.c.cells.revenue)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <button
                      type="button"
                      className={`pl2-addbtn${isIn ? " in" : ""}`}
                      disabled={isIn || busy === i.c.id}
                      aria-label={isIn ? `${lock ? "This company" : i.c.name} is in To reach out` : lock ? `Open this locked company (${freeOpen ? "free on your plan" : `${COMPANY_PRICE} credits`}) and add it to To reach out` : `Add ${i.c.name} to To reach out`}
                      onClick={() => void add(i)}
                    >
                      {isIn ? "In To reach out" : lock ? `Add · ${freeOpen ? "free" : `${COMPANY_PRICE} credits`}` : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
            {(cur?.rows.length ?? 0) > LIST_ROWS && <span className="pl2-small">And {cur!.rows.length - LIST_ROWS} more on the list.</span>}
          </>
        ) : (
          <p className="pl2-none">Nothing on your lists yet. Open a company on Companies or Crystal Ball, or follow one, and it shows here.</p>
        )}
        <div className="pl2-costnote">
          {freeOpen
            ? `A company you can see adds free. A locked one opens first: free on your plan today, ${ui.me.proOpens!.of - ui.me.proOpens!.left} of ${ui.me.proOpens!.of} opens used. After that a company costs ${COMPANY_PRICE} credits.`
            : `A company you can see adds free. A locked one costs ${COMPANY_PRICE} credits to open, and Merlin asks before it spends.`}
        </div>
        {saved.length > 0 && (
          <section className="pl2-sec" aria-label="Your saved lists">
            <h3>Your saved lists</h3>
            <span className="pl2-small">Open one, tick the companies you want, and use Add to pipeline.</span>
            <span className="pl2-acts">
              {saved.slice(0, 6).map((v) => (
                <button key={v.id} type="button" className="pl2-mini" onClick={() => c.table.openView(v)}>
                  {v.name}
                </button>
              ))}
            </span>
          </section>
        )}
        <button type="button" className="pl2-link" onClick={() => c.openPage("find")}>
          Find more companies
        </button>
      </div>
    </aside>
  );
}
