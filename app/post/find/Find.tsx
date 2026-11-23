"use client";

/**
 * Find (Find.dc.html): where a member builds a list. A kind switcher (Companies, People, Seats, Open
 * roles, Fractionals), Ask Merlin in a pane (lib/ask.ts rules), quick filters and the full filter
 * browser with a live count on every value from the member's own table, a preview that spends
 * nothing and never shows a locked name, the save step (list name, how many, add data now with its
 * cost per row and the total, the alert), and "one company in mind?": look it up by its full name or
 * website (the find_company rules, app/ui/find.ts), or add it by its website (Add what you know).
 *
 * The first visit starts from the ideal client (the pill on) and says so. Lookalikes is the last
 * kind (BUILD_PLAN part 8): companies like the member's past clients.
 *
 * Mounted by the page registry (shell/pages.tsx FindP, page key "find"), under the shell's header
 * and breadcrumb. Props are explicit; actions go through UiCtx (act, unlockMany, openAdd) as every
 * page's do. The save step's "Add data now" is priced by the server's quote (workbench/quote.ts)
 * and runs as the workbench's bulk runs do (workbench/run.ts): one quote, one button.
 */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { FractionalRec, FractionalsView, Me, SavedViewRec, UnlockQuote } from "@/lib/tableTypes";
import { COMPANY_PRICE } from "@/lib/tableFields";
import type { AskPlan, AskVocab } from "@/lib/ask";
import { AskBar } from "../AskBar";
import { useUi, type AppPage, type Ui } from "../ui";
import { useToast, type Action, type ToastFn } from "../../ui/shared";
import { findCompany, type Found } from "../../ui/find";
import { usePipeline } from "../pipelineStore";
import { useGetIn } from "../network/useWays";
import { openWay } from "../network/useWays";
import {
  EMPTY_FILTERS, absolutePlace, activeCount, clearedFilters, criteriaOf, icpEmpty, icpLabel, setFilterSets, sortsFor, viewName, withIcpSpelled,
  type CoInfo, type Filters, type Row, type SortKey,
} from "../model";
import {
  HEADS, KIND_LABEL, KIND_TYPE, NOTES, deciderRefs, filterGroups, filtersFromAsk, findRun, fractionalRow, icpLine, insideStats, nounOf, previewRow, quickGroups, runCompanies, saveCost,
  type FilterValue, type FindKind,
} from "./findModel";
import { alertWords, kindOfList, listAct, listsOf } from "./lists";
import { listenFindStart, takeFindStart, type FindStart } from "./start";
import { appDeps, fetchQuote, quoteWords } from "../workbench/quote";
import { runUnlock } from "../workbench/run";
import { defaultSeeds, likeCriteria, profileOf, profileWords, rankLike, seedMatches, traitChips, withoutTrait, type LikeRow } from "./lookalikes";
import type { LikeTrait } from "../model";
import "./find.css";

/** The kinds in the switcher, Lookalikes last (the owner's "reverse engineer what works into a target account list"). */
const KINDS: FindKind[] = ["companies", "people", "seats", "roles", "fractionals", "lookalikes"];
const PREVIEW = 8;

export interface FindProps {
  me: Me;
  infos: CoInfo[];
  /** The whole table is still on its way. */
  waiting: boolean;
  /** The member's first visit here (none of their own lists yet): starts from the ideal client and says so. */
  first: boolean;
  openCompany: (id: string) => void;
  /** Open a saved view (or a list just saved) in the table. */
  openList: (v: SavedViewRec) => void;
  openPage: (p: AppPage) => void;
  /** Your profile (to change the ideal client). */
  onProfile: () => void;
  /** "What Find is for" is still showing (not dismissed: Profile.stripsOff), and dismissing it. */
  stripOn: boolean;
  onStripOff: () => void;
}

const word = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function useDirectory(on: boolean): FractionalRec[] | null {
  const [d, setD] = useState<FractionalRec[] | null>(null);
  useEffect(() => {
    if (!on || d) return;
    let live = true;
    void fetch("/api/table?fractionals=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: FractionalsView | null) => live && j && setD(j.records ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [on, d]);
  return d;
}

export function Find(p: FindProps) {
  const ui = useUi();
  const toast = useToast();
  const { me, infos } = p;
  const hasIcp = !icpEmpty(me.icp);
  const [kind, setKind] = useState<FindKind>("companies");
  const [f, setF] = useState<Filters>(() => ({ ...EMPTY_FILTERS, icp: hasIcp }));
  const [step, setStep] = useState<"filter" | "browse" | "lookup" | "save">("filter");
  // On a phone Ask opens on a tap, so the filters and the preview come first.
  const [askOpen, setAskOpen] = useState(ui.layout !== "phone");
  const [panel, setPanel] = useState<"" | "saved">("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("best");
  const [lookText, setLookText] = useState("");
  const [askText, setAskText] = useState("");
  // Lookalikes: the seed companies (null: the member's seats) and the traits taken off.
  const [seeds, setSeeds] = useState<string[] | null>(null);
  const [traitsOff, setTraitsOff] = useState<LikeTrait[]>([]);
  // What another page sent: an Ask plan to set, or a company to look up.
  const startWith = (s: FindStart) => {
    if ("plan" in s) applyPlan(s.plan, s.text);
    else if ("lookup" in s) (setLookText(s.lookup), setStep("lookup"));
    else if ("kind" in s) setKind(s.kind);
    else setStep(s.step);
  };
  useEffect(() => {
    const s = takeFindStart();
    if (s) startWith(s);
    // Already on Find: "/" (or Ask from elsewhere on the page) opens the lookup here, focused by the shell.
    return listenFindStart(startWith);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The member's own sets: the pipeline's companies, and the ones they have a way into (RN_GOOGLE).
  const pipe = usePipeline(true).view;
  const getIn = useGetIn();
  useEffect(() => {
    setFilterSets({ pipeline: pipe ? pipe.entries.filter((e) => !["lost", "notnow", "quiet"].includes(e.stage)).map((e) => e.company) : null });
  }, [pipe]);
  useEffect(() => {
    setFilterSets({ wayIn: getIn.data ? getIn.data.rows.filter((r) => r.best !== null).map((r) => r.id) : null });
  }, [getIn.data]);
  const sets = { pipeline: !!pipe, wayIn: getIn.off ? ("off" as const) : !!getIn.data };

  const directory = useDirectory(kind === "fractionals");
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  const seedIds = useMemo(() => seeds ?? defaultSeeds(infos, me), [seeds, infos, me]);
  const seedInfos = useMemo(() => seedIds.map((id) => byId.get(id)).filter((i): i is CoInfo => !!i), [seedIds, byId]);
  const likeAll = useMemo(() => profileOf(seedInfos), [seedInfos]);
  const like = useMemo(() => traitsOff.reduce((t, k) => withoutTrait(t, k), likeAll), [likeAll, traitsOff]);
  // The filters the run reads: on Lookalikes, the profile is one of them.
  const fx = useMemo<Filters>(() => (kind === "lookalikes" ? { ...f, like, icp: false } : f.like.length ? { ...f, like: [] } : f), [kind, f, like]);
  const df = useDeferredValue(fx);
  const dq = useDeferredValue(q.trim());
  const run = useMemo(() => (p.waiting || (kind === "lookalikes" && !like.length) ? null : findRun(kind, infos, me, df, dq, sort, directory)), [p.waiting, kind, infos, me, df, dq, sort, directory, like.length, sets.pipeline, sets.wayIn]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => (kind === "lookalikes" && run ? new Map(rankLike(run.rows.slice(0, 200), like, seedInfos).map((x) => [x.row.key, x])) : null), [kind, run, like, seedInfos]);
  const groups = useMemo(() => (run ? filterGroups(fx, run.facets, me, sets) : []), [run, fx, me, sets.pipeline, sets.wayIn]); // eslint-disable-line react-hooks/exhaustive-deps
  const quick = useMemo(() => quickGroups(groups, f, me, p.first), [groups, f, me, p.first]);
  const vocab: AskVocab = useMemo(() => ({ myFn: me.function ?? null, hasIcp }), [me.function, hasIcp]);
  const noun = (n: number) => nounOf(kind, n);
  const found = run?.n ?? 0;
  const lists = listsOf(me);

  function applyPlan(plan: AskPlan, text: string) {
    setAskText(text);
    if (plan.company) {
      setLookText(plan.company);
      setStep("lookup");
      return;
    }
    if (plan.page === "find" || plan.page === "hiring") setKind(plan.page === "hiring" ? "roles" : plan.kind);
    setF(filtersFromAsk(plan.filters, !!plan.filters.icp));
    if (plan.sort) setSort(plan.sort as SortKey);
    setStep("filter");
  }

  const kinds = KINDS.map((k) => (
    <button key={k} type="button" className={`fd-kind${kind === k ? " on" : ""}`} aria-pressed={kind === k} onClick={() => (setKind(k), step === "save" && setStep("filter"))}>
      {KIND_LABEL[k]}
    </button>
  ));

  return (
    <div className="fd">
      <div className="fd-bar">
        <div role="group" aria-label="What to find" className="fd-kinds">
          {kinds}
        </div>
        <button type="button" className={`fd-tbtn${step === "lookup" ? " on" : ""}`} aria-pressed={step === "lookup"} onClick={() => setStep(step === "lookup" ? "filter" : "lookup")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add a company by its website
        </button>
        <button type="button" className={`fd-tbtn fd-askbtn${askOpen ? " on" : ""}`} aria-pressed={askOpen} onClick={() => setAskOpen(!askOpen)}>
          Ask Merlin
        </button>
        <button type="button" className="fd-tbtn" aria-expanded={panel === "saved"} onClick={() => setPanel(panel === "saved" ? "" : "saved")}>
          Saved searches · {lists.length}
        </button>
      </div>

      {panel === "saved" && <SavedPanel me={me} openList={(v) => (setPanel(""), p.openList(v))} onKeep={() => (setPanel(""), setStep("save"))} openAgent={() => p.openPage("integrations")} />}

      {p.first && p.stripOn && (
        <div role="note" className="fd-strip">
          <span>
            <strong>Find is where you build a list.</strong> Describe who you want or pick filters, check the preview, then save it. Nothing is spent here
            {me.proOpens ? `, and opening a company is free on your plan, up to ${me.proOpens.of} a day.` : `. Opening a company is ${COMPANY_PRICE} credits.`}
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            className="fd-x"
            onClick={p.onStripOff}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      <div className="fd-body">
        {askOpen && (
          <aside aria-label="Ask Merlin" className="fd-ask">
            <div className="fd-ask-h">
              <strong>Describe who you&apos;re looking for</strong>
              <span>Merlin sets the filters. You can see and change every one.</span>
            </div>
            <AskBar
              key={askText}
              variant="pane"
              rows={4}
              label="Your words"
              initial={askText}
              placeholder={p.first ? "SaaS companies of 11 to 500 people with no fractional sales leader yet" : "SaaS companies under 500 people that hired a fractional sales leader and are hiring again"}
              vocab={vocab}
              onGo={applyPlan}
              suggestionsLabel={p.first && me.function ? `Three to start with, written for a fractional ${me.function} leader` : "Try one of these"}
              suggestions={examples(me, p.first)}
            />
            <button type="button" className="fd-likebtn" aria-pressed={kind === "lookalikes"} onClick={() => (setKind("lookalikes"), setStep("filter"))}>
              Find more like my past clients
            </button>
          </aside>
        )}

        <section aria-label={step === "filter" ? "Filters" : step === "save" ? "Save the list" : step === "browse" ? "All filters" : "Look up or add a company"} className="fd-pane">
          {step === "filter" && (
            <div className="fd-pane-in">
              <div className="fd-pane-top">
                <strong>Filters · {activeCount(f) + (f.icp && hasIcp ? 1 : 0)}</strong>
                <button type="button" className="fd-link" onClick={() => setF(clearedFilters({ ...f, icp: false }))}>
                  Clear
                </button>
              </div>
              {kind === "lookalikes" ? (
                <LikePanel
                  tokens={like}
                  all={likeAll}
                  off={traitsOff}
                  setOff={setTraitsOff}
                  seeds={seedInfos}
                  infos={infos}
                  setSeeds={(ids) => setSeeds(ids)}
                  isDefault={seeds === null}
                  onAddSeat={() => ui.openAdd({ mode: "engagement", mine: true })}
                />
              ) : (
                <IcpBox me={me} infos={infos} f={f} setF={setF} first={p.first} onProfile={p.onProfile} />
              )}
              {!(kind === "lookalikes" && !like.length) && quick.map((g) => (
                <div key={g.name} className="fd-group">
                  <span className="fd-group-h">{g.name.toUpperCase()}</span>
                  <div className="fd-chips">
                    {g.items.map((v) => (
                      <Chip key={v.key} v={v} f={f} setF={setF} />
                    ))}
                  </div>
                </div>
              ))}
              {p.first && kind !== "lookalikes" && (
                <div className="fd-group">
                  <span className="fd-group-h">YOU</span>
                  <span className="fd-note">
                    One more switches on with your own data: <button type="button" className="fd-inl" onClick={() => p.openPage("network")}>you have a way in</button>, once you bring in who you know.
                  </span>
                </div>
              )}
              <ExtraChips f={f} setF={setF} quick={quick.flatMap((g) => g.items.map((v) => v.key))} groups={groups} />
              {groups.length > 0 && <button type="button" className="fd-browse" onClick={() => setStep("browse")}>
                Browse all {groups.reduce((n, g) => n + g.filters.length, 0)} filters
              </button>}
              <Foot n={found} noun={noun} waiting={p.waiting} onNext={() => setStep("save")} />
            </div>
          )}
          {step === "browse" && <Browse groups={groups} f={f} setF={setF} onBack={() => setStep("filter")} foot={<Foot n={found} noun={noun} waiting={p.waiting} onNext={() => setStep("save")} />} openRates={() => p.openPage("rates")} />}
          {step === "lookup" && <Lookup key={lookText} initial={lookText} me={me} onBack={() => setStep("filter")} openCompany={p.openCompany} />}
          {step === "save" && run && (
            <SavePane
              key={`${kind}:${found}`}
              kind={kind}
              f={fx}
              q={dq}
              sort={sort}
              rows={run.rows}
              n={found}
              me={me}
              first={p.first}
              onBack={() => setStep("filter")}
              onSaved={(v) => p.openList(v)}
              onSlack={() => p.openPage("integrations")}
              act={async (a) => ui.act(a, { quiet: true })}
              unlock={ui.unlockMany}
              toast={toast}
            />
          )}
        </section>

        <section aria-label="Preview" className="fd-prev">
          <div className="fd-prev-top">
            <strong>Preview</strong>
            <span className="fd-prev-n" role="status">
              {kind === "lookalikes" && !like.length ? "Pick a past client first. Nothing is spent here." : p.waiting || !run ? "Counting the whole table…" : <>{Math.min(PREVIEW, found)} of <b>{found.toLocaleString("en-US")}</b> {noun(found).replace(/^[\d,]+ /, "")} found · updates as you filter · nothing is spent yet</>}
            </span>
            <input type="search" aria-label="Search these results" placeholder="Search by name, website, industry or function" value={q} onChange={(e) => setQ(e.target.value)} className="fd-search" />
            <label className="fd-sort">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {sortsFor(KIND_TYPE[kind]).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Preview kind={kind} run={run} me={me} ranked={ranked} openCompany={p.openCompany} openFractionals={() => p.openPage("fractionals")} />
          {kind === "lookalikes" && !like.length && <p className="fd-note fd-pad">Pick a past client in the filters column and Merlin lists the companies most like it.</p>}
          {kind === "companies" && run && found > 0 && (
            <div className="fd-inside">
              <span className="fd-inside-h">Inside these {found.toLocaleString("en-US")} companies. Tap one to narrow the list.</span>
              <div className="fd-stats">
                {insideStats(run.rows, f, p.first).map((t) => (
                  <button key={t.key} type="button" aria-pressed={t.on} className={`fd-stat${t.on ? " on" : ""}`} onClick={() => setF(t.flip(f))}>
                    <strong>{(t.on ? found : t.n).toLocaleString("en-US")}</strong>
                    <span>{t.label}</span>
                    <em>{t.on ? "Filter on" : "Show only these"}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="fd-kindnote">
            <span>{NOTES[kind](p.first)}</span>
            <button type="button" className="fd-inl" onClick={() => setStep("lookup")}>
              One company in mind? Look it up, or add it by its website if Merlin does not have it yet.
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Three examples to start with, in the member's function. */
function examples(me: Me, first: boolean): { t: string }[] {
  const fn = (me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : "sales").toLowerCase();
  return first
    ? [
        { t: `SaaS companies of 11 to 500 people that have a fractional CMO or CFO and no fractional ${fn} leader yet` },
        { t: `Companies where a fractional ${fn} seat ended in the last 90 days` },
        { t: `US companies that are hiring a fractional ${fn} leader right now` },
      ]
    : [
        { t: `SaaS companies under 500 people that hired a fractional ${fn} leader and are hiring again` },
        { t: `Companies where a fractional ${fn} leader left in the last three months` },
        { t: "Repeat hirers I already have a way into" },
      ];
}

function Chip({ v, f, setF, count }: { v: FilterValue; f: Filters; setF: (f: Filters) => void; count?: boolean }) {
  return (
    <button type="button" aria-pressed={v.on} disabled={!!v.off && !v.on} title={v.off} className={`fd-chip${v.on ? " on" : ""}`} onClick={() => setF(v.flip(f))}>
      <span>{v.label}</span>
      {count && v.n !== null ? <span className="fd-chip-n">{v.n.toLocaleString("en-US")}</span> : null}
      {v.off && !v.on ? <span className="fd-chip-n">{v.off === "Loading" ? "…" : "Not yet"}</span> : null}
    </button>
  );
}

/** Filters set in the browser or by Ask that the quick filters don't show: one removable chip each. */
function ExtraChips({ f, setF, quick, groups }: { f: Filters; setF: (f: Filters) => void; quick: string[]; groups: ReturnType<typeof filterGroups> }) {
  const extra = groups.flatMap((g) => g.filters.flatMap((d) => d.values.filter((v) => v.on && !quick.includes(v.key) && v.key !== "icp").map((v) => ({ v, label: d.name === v.label ? v.label : `${d.name}: ${v.label}` }))));
  if (!extra.length) return null;
  return (
    <div className="fd-group">
      <span className="fd-group-h">ALSO ON</span>
      <div className="fd-chips">
        {extra.map(({ v, label }) => (
          <button key={v.key} type="button" className="fd-chip on fd-chip-x" aria-label={`Remove the filter ${label}`} onClick={() => setF(v.flip(f))}>
            <span>{label}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function IcpBox({ me, infos, f, setF, first, onProfile }: { me: Me; infos: CoInfo[]; f: Filters; setF: (f: Filters) => void; first: boolean; onProfile: () => void }) {
  const line = useMemo(() => icpLine(infos, me), [infos, me]);
  if (icpEmpty(me.icp)) {
    return (
      <div className="fd-icp">
        <span>
          <strong>No ideal client yet.</strong> Say who you want as clients and Find starts from them.
        </span>
        <button type="button" className="fd-link" onClick={onProfile}>
          Set your ideal client
        </button>
      </div>
    );
  }
  if (first)
    return (
      <div className="fd-icp fd-icp-first">
        <span>
          <strong>Set from your ideal client,</strong> as you gave it at sign-up: {icpLabel(me.icp)}.{" "}
        </span>
        <button type="button" className="fd-link" onClick={onProfile}>
          Change your ideal client
        </button>
      </div>
    );
  return (
    <div role="group" aria-label="Your ideal client" className="fd-icp">
      <span>
        <strong>Your ideal client:</strong> {icpLabel(me.icp)}. {word(line.match + line.maybe, "company fits", "companies fit")}: {line.match.toLocaleString("en-US")} confirmed, {line.maybe.toLocaleString("en-US")} where a part is not on file.
      </span>
      <div className="fd-icp-acts">
        <button type="button" aria-pressed={f.icp} className={`fd-icp-btn${f.icp ? " on" : ""}`} onClick={() => setF({ ...f, icp: !f.icp })}>
          {f.icp ? "Showing only these. Show everyone" : "Show only these"}
        </button>
        <button type="button" className="fd-link" onClick={onProfile}>
          Edit
        </button>
      </div>
    </div>
  );
}

function Foot({ n, noun, waiting, onNext }: { n: number; noun: (n: number) => string; waiting: boolean; onNext: () => void }) {
  return (
    <div className="fd-foot">
      <span>{waiting ? "Counting…" : noun(n)}</span>
      <button type="button" className="fd-primary" onClick={onNext} disabled={waiting || n === 0}>
        Continue
      </button>
    </div>
  );
}

function Browse({ groups, f, setF, onBack, foot, openRates }: { groups: ReturnType<typeof filterGroups>; f: Filters; setF: (f: Filters) => void; onBack: () => void; foot: React.ReactNode; openRates: () => void }) {
  const [cat, setCat] = useState(0);
  const g = groups[cat] ?? groups[0];
  const [open, setOpen] = useState<string>("");
  const total = groups.reduce((n, x) => n + x.filters.length, 0);
  const on = groups.reduce((n, x) => n + x.filters.reduce((m, d) => m + d.values.filter((v) => v.on).length, 0), 0);
  if (!g) return null;
  const openName = open === "" ? g.filters[0]?.name : open;
  return (
    <div className="fd-pane-in">
      <div className="fd-pane-top">
        <strong>
          All {total} filters · {on} on
        </strong>
        <button type="button" className="fd-link" onClick={onBack}>
          Back to quick filters
        </button>
      </div>
      <div role="tablist" aria-label="Filter groups" className="fd-cats">
        {groups.map((x, k) => (
          <button key={x.name} type="button" role="tab" aria-selected={k === cat} className={`fd-cat${k === cat ? " on" : ""}`} onClick={() => (setCat(k), setOpen(""))}>
            {x.name} · {x.filters.length}
          </button>
        ))}
      </div>
      <div className="fd-acc">
        {g.filters.map((d) => {
          const picked = d.values.filter((v) => v.on);
          const isOpen = d.name === openName;
          return (
            <div key={d.name} className="fd-acc-item">
              <button type="button" aria-expanded={isOpen} className="fd-acc-h" onClick={() => setOpen(isOpen ? "-" : d.name)}>
                <span className="fd-acc-name">{d.name}</span>
                <span className={`fd-acc-sum${picked.length ? " on" : ""}`}>{picked.length ? picked.map((v) => v.label).join(", ") : "Any"}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={isOpen ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
                </svg>
              </button>
              {isOpen && (
                <div className="fd-acc-body">
                  <div className="fd-chips">
                    {d.values.length ? d.values.map((v) => <Chip key={v.key} v={v} f={f} setF={setF} count />) : <span className="fd-note">Nothing on file for this yet.</span>}
                  </div>
                  {d.hint && <span className="fd-note">{d.hint}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span className="fd-note">
        Every option shows how many rows have it. Filters show which seats have a rate or a name on file, never the rate or the name. See what fractionals charge in{" "}
        <button type="button" className="fd-inl" onClick={openRates}>
          Rate benchmarks
        </button>
        .
      </span>
      {foot}
    </div>
  );
}

/* ---------- one company in mind ---------- */

function Lookup({ initial, me, onBack, openCompany }: { initial: string; me: Me; onBack: () => void; openCompany: (id: string) => void }) {
  const ui = useUi();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Found | null>(null);
  const go = async (t = text) => {
    if (t.trim().length < 3) return;
    setBusy(true);
    setRes(await findCompany(t));
    setBusy(false);
  };
  useEffect(() => {
    if (initial.trim().length >= 3) void go(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const free = !!me.proOpens && me.proOpens.left > 0;
  return (
    <div className="fd-pane-in">
      <div className="fd-pane-top">
        <strong>One company in mind?</strong>
        <button type="button" className="fd-link" onClick={onBack}>
          Back to filters
        </button>
      </div>
      <span className="fd-note">
        Type its full name or its website. Merlin finds it even while it is locked. If Merlin does not have it yet, add it by its website and earn credits. Looking one up is free, up to 25 new companies a day.
      </span>
      <form
        className="fd-look"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <label htmlFor="fd-lk">Company name or website</label>
        <input id="fd-lk" type="text" value={text} onChange={(e) => (setText(e.target.value), setRes(null))} placeholder="Full name or website, like cedarandpine.example" />
        <button type="submit" className="fd-primary" disabled={busy || text.trim().length < 3} aria-busy={busy}>
          Look it up
        </button>
      </form>
      {res?.error && <p className="fd-err">{res.error}</p>}
      {res && res.recs.length > 0 &&
        res.recs.slice(0, 3).map((c) => (
          <div key={c.id} className="fd-found">
            <div className="fd-found-h">
              <span className="fd-tile" aria-hidden>
                {c.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{c.name}</strong>
                <span>{c.cells.website?.s === "value" ? c.cells.website.v : ""}</span>
              </span>
            </div>
            <span>
              {[c.cells.industry?.s === "value" ? c.cells.industry.v : null, c.cells.revenue?.s === "value" ? `${c.cells.revenue.v} revenue` : null, c.friendly.fractional ? word(c.friendly.fractional, "fractional seat on file", "fractional seats on file") : null, c.friendly.open ? "hiring a fractional now" : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {c.hidden && <span className="fd-note">Named this once because you typed it in full. It stays locked in your lists until you open it.</span>}
            <button type="button" className="fd-outline" onClick={() => openCompany(c.id)}>
              {c.hidden ? (free ? "Open it, free on your plan today" : `Open it for ${COMPANY_PRICE} credits`) : "Open the company"}
            </button>
            <button type="button" className="fd-link" onClick={() => openWay(c.id)}>
              See your way in
            </button>
          </div>
        ))}
      {res?.none && (
        <div className="fd-found">
          <span>
            <strong>{res.q} is not in Merlin yet.</strong> Add it by its website. Merlin reads the site and fills in what it can. You check it, and it is on file for every member.
          </span>
          <button type="button" className="fd-volt" onClick={() => ui.openAdd({ query: res.q })}>
            Add this company
          </button>
          <span className="fd-note">Each fact Merlin does not have earns 1 credit, up to {me.earnCap} a day. A company is never added twice: the same website is the same company.</span>
        </div>
      )}
    </div>
  );
}

/* ---------- the save step ---------- */

function SavePane(p: {
  kind: FindKind;
  f: Filters;
  q: string;
  sort: SortKey;
  rows: Row[];
  n: number;
  me: Me;
  first: boolean;
  onBack: () => void;
  onSaved: (v: SavedViewRec) => void;
  onSlack: () => void;
  act: (a: Action) => Promise<{ ok: boolean; message: string; id?: string }>;
  unlock: Ui["unlockMany"];
  toast: ToastFn;
}) {
  const { me } = p;
  const type = KIND_TYPE[p.kind];
  const tab = p.kind === "roles" ? "hiring" : "all";
  const fnOne = p.f.fn.length === 1 ? p.f.fn[0] : null;
  const [name, setName] = useState(() => (p.kind === "lookalikes" ? "Like your past clients" : p.first && p.kind === "companies" && p.f.icp ? `${icpLabel(me.icp)}`.slice(0, 100) || "Your ideal client" : viewName(p.f, tab, type, null, me.function ?? null)));
  const [many, setMany] = useState<"all" | "25">(p.n > 25 ? "25" : "all");
  const [adds, setAdds] = useState<{ names: boolean; dm: boolean }>({ names: false, dm: false });
  const [alert, setAlert] = useState(true);
  const [busy, setBusy] = useState(false);
  const take = many === "all" ? p.n : Math.min(25, p.n);
  const companyKind = p.kind !== "fractionals";
  const cost = useMemo(() => saveCost(p.rows, take, me), [p.rows, take, me]);
  // What "Add data now" would open, and the server's quote for it (a dry run: nothing is spent).
  const items = useMemo(() => {
    const cos = runCompanies(p.rows, take);
    return [
      ...(adds.names ? cos.filter((i) => i.c.hidden).map((i) => ({ entity: "company" as const, id: i.c.id, field: "identity" })) : []),
      ...(adds.dm ? cos.flatMap(deciderRefs) : []),
    ];
  }, [p.rows, take, adds.names, adds.dm]);
  const itemsKey = items.map((x) => `${x.entity}:${x.id}:${x.field}`).join("|");
  const [quote, setQuote] = useState<UnlockQuote | { error: string } | null>(null);
  useEffect(() => {
    setQuote(null);
    if (!items.length) return;
    let live = true;
    const t = setTimeout(() => void fetchQuote(items).then((q) => live && setQuote(q)), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);
  const quoted = quote && !("error" in quote) ? quote : null;
  const total = quoted?.cost ?? 0;
  const words = quoted ? quoteWords(quoted, ["fact", "facts"]) : null;
  const quoting = items.length > 0 && !quote;
  const credits = me.credits;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const f = withIcpSpelled(p.f, me.icp);
    const place = absolutePlace({ t: type, v: tab, s: p.sort, f, q: p.q });
    const criteria = f.like.length ? { ...criteriaOf({ ...f, like: [] }, fnOne), ...likeCriteria(f.like) } : criteriaOf(f, fnOne);
    const kind = p.kind === "lookalikes" ? "companies" : p.kind;
    const r = await p.act(listAct({ op: "save", name: name.trim(), place, criteria, email: alert, list: { kind, alert: { on: alert, email: alert, slack: alert } } }));
    if (!r.ok) {
      setBusy(false);
      p.toast(r.message || "That list didn't save. Try again.", true);
      return;
    }
    // Add data now: what the quote covers, in batches of 60, each quoted again first so the run never spends more than it said (workbench/run.ts).
    // The button that says the cost is the yes.
    if (quoted && quoted.fits > 0) {
      const out = await runUnlock({ items, quote: quoted, confirmed: true }, appDeps({ unlockMany: p.unlock }));
      if (out.stopped) p.toast(out.stopped, true);
    }
    setBusy(false);
    p.toast(r.message);
    p.onSaved({ id: r.id ?? `new:${Date.now()}`, name: name.trim() || viewName(p.f, tab, type), place, criteria, email: alert, createdAt: new Date().toISOString() });
  };
  return (
    <div className="fd-pane-in">
      <strong className="fd-save-h">Save these as a list</strong>
      <label className="fd-field">
        List name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </label>
      <div role="radiogroup" aria-label="How many" className="fd-radios">
        <span className="fd-lab">How many?</span>
        {(
          [
            ["all", "All that match", p.n],
            ["25", "Only the first", Math.min(25, p.n)],
          ] as const
        ).map(([k, label, v]) => (
          <button key={k} type="button" role="radio" aria-checked={many === k} className={`fd-radio${many === k ? " on" : ""}`} onClick={() => setMany(k)}>
            <span>{label}</span>
            <b>{v.toLocaleString("en-US")}</b>
          </button>
        ))}
      </div>
      {companyKind && (
        <div className="fd-adds">
          <span className="fd-lab">Add data now?</span>
          <Check
            on={adds.names}
            set={(v) => setAdds({ ...adds, names: v })}
            name="Company names and websites"
            sub={cost.locked ? `${word(cost.locked, "locked company", "locked companies")}${cost.free ? `, ${cost.free} free today on your plan` : ""}` : "Every company here is open to you"}
            cost={cost.free && !cost.names ? "Free" : `${COMPANY_PRICE} / row`}
            free={!cost.names}
          />
          <Check on={false} name="Who held each seat" sub="Opens with the company, free" cost="Free" free fixed />
          <Check on={adds.dm} set={(v) => setAdds({ ...adds, dm: v })} name="Decision makers" sub={cost.deciderN ? `Name and title of ${word(cost.deciderN, "decision maker", "decision makers")}, after the company` : "None locked at these companies"} cost="1 / row" free={!cost.deciderN} />
          <Check on={false} name="Your way in" sub="Best path, from who you know and who held seats" cost="Free" free fixed />
        </div>
      )}
      <div className="fd-adds">
        <span className="fd-lab">{p.first ? "Alert · step 5 of getting started" : "Alert"}</span>
        <Check on={alert} set={setAlert} name="Tell me when this list changes" sub="A weekly email with new matches, and new roles in Slack once it is connected." cost="Free" free />
        {p.first && (
          <span className="fd-note">
            <strong>A saved list can carry an alert,</strong> so Merlin keeps watching after you leave.{" "}
            <button type="button" className="fd-inl" onClick={p.onSlack}>
              Add Slack
            </button>{" "}
            to get it there too.
          </span>
        )}
      </div>
      <div className="fd-total" role="status">
        <strong>{!items.length ? "This costs nothing." : quoting ? "Working out the cost…" : quote && "error" in quote ? quote.error : total === 0 ? "This costs nothing." : `This costs ${total.toLocaleString("en-US")} ${total === 1 ? "credit" : "credits"}.`}</strong>
        <span>
          {words && total > 0 ? `${words.after} ` : `You have ${credits.toLocaleString("en-US")} credits. `}
          {words?.stop ? `${words.stop} ` : ""}
          Anything you skip can be added later from the table, row by row or in bulk.
        </span>
      </div>
      <div className="fd-foot">
        <button type="button" className="fd-outline" onClick={p.onBack}>
          Back
        </button>
        <button type="button" className="fd-primary fd-grow" onClick={() => void save()} disabled={busy || quoting} aria-busy={busy}>
          {total > 0 ? `Save and spend ${total.toLocaleString("en-US")} ${total === 1 ? "credit" : "credits"}` : "Save and open the table"}
        </button>
      </div>
    </div>
  );
}

function Check({ on, set, name, sub, cost, free, fixed }: { on: boolean; set?: (v: boolean) => void; name: string; sub: string; cost: string; free?: boolean; fixed?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={fixed ? true : on} aria-disabled={fixed} className="fd-check" onClick={() => !fixed && set?.(!on)}>
      <span className={`fd-box${on || fixed ? " on" : ""}`} aria-hidden>
        {(on || fixed) && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <span className="fd-check-t">
        <span>{name}</span>
        <span>{sub}</span>
      </span>
      <span className={`fd-cost${free ? " free" : ""}`}>{cost}</span>
    </button>
  );
}

/* ---------- saved searches ---------- */

function SavedPanel({ me, openList, onKeep, openAgent }: { me: Me; openList: (v: SavedViewRec) => void; onKeep: () => void; openAgent: () => void }) {
  const ui = useUi();
  const toast = useToast();
  const lists = listsOf(me);
  const [ren, setRen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const cap = me.plan?.limits.savedViews;
  return (
    <section aria-label="Saved searches" className="fd-saved">
      <div className="fd-saved-list">
        {lists.map((v) => (
          <div key={v.id} className="fd-saved-card">
            {ren === v.id ? (
              <>
                <label className="fd-field">
                  New name
                  <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={100} />
                </label>
                <div className="fd-saved-acts">
                  <button type="button" className="fd-primary fd-sm" onClick={async () => (await ui.act({ type: "savedView", op: "rename", id: v.id, name: draft }), setRen(null))}>
                    Save name
                  </button>
                  <button type="button" className="fd-outline fd-sm" onClick={() => setRen(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <strong>{v.name}</strong>
                <span className="fd-note">
                  {kindOfList(v) === "companies" ? "Companies" : kindOfList(v) === "roles" ? "Open roles" : kindOfList(v) === "seats" ? "Seats" : "People"} · alert {alertWords(v.alert).toLowerCase()}
                  {v.place ? "" : " · saved by your agent"}
                </span>
                <div className="fd-saved-acts">
                  <button type="button" className="fd-outline fd-sm" onClick={() => openList(v)}>
                    Open
                  </button>
                  <button type="button" role="switch" aria-checked={v.alert.on} className={`fd-mail${v.alert.on ? " on" : ""}`} onClick={() => void ui.act(listAct({ op: "alert", id: v.id, list: { alert: { on: !v.alert.on } } }))}>
                    {v.alert.on ? "Alert on" : "Alert off"}
                  </button>
                  <button type="button" className="fd-link" onClick={() => (setRen(v.id), setDraft(v.name))}>
                    Rename
                  </button>
                  <button
                    type="button"
                    className="fd-link"
                    onClick={async () => {
                      const at = lists.findIndex((x) => x.id === v.id);
                      const r = await ui.act({ type: "savedView", op: "delete", id: v.id }, { quiet: true });
                      if (r.ok) toast(`Removed "${v.name}".`, false, { action: { label: "Undo", onClick: () => void ui.act({ type: "savedView", op: "restore", view: v, at }) }, ms: 8000 });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {!lists.length && (
          <div className="fd-saved-card fd-saved-none">
            <strong>No saved searches yet.</strong> A saved search keeps your filters so you can open them in one tap, and Merlin can email you new matches each week.
          </div>
        )}
      </div>
      <div className="fd-saved-foot">
        <button type="button" className="fd-outline fd-sm" onClick={onKeep}>
          Save the filters on screen
        </button>
        <span className="fd-note">
          {cap != null ? `Free keeps ${cap} saved search. Pro and the trial keep as many as you like.` : "Keep as many as you like."}{" "}
          <button type="button" className="fd-inl" onClick={openAgent}>
            An agent you connect
          </button>{" "}
          can open them too.
        </span>
      </div>
    </section>
  );
}

/* ---------- the preview ---------- */

const TINTS = ["#E3E8F7", "#E8F3EE", "#FFE7A8", "#F3E8F5", "#DDF0F7", "#FBE3D6"];
const ini = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => w && !["and", "of", "Fractional", "the"].includes(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Preview({ kind, run, me, ranked, openCompany, openFractionals }: { kind: FindKind; run: ReturnType<typeof findRun> | null; me: Me; ranked: Map<string, LikeRow> | null; openCompany: (id: string) => void; openFractionals: () => void }) {
  const head = HEADS[kind];
  const rows = !run ? [] : kind === "fractionals" ? (run.fractionals ?? []).slice(0, PREVIEW).map(fractionalRow) : run.rows.slice(0, PREVIEW).map((r) => previewRow(kind, r, me, ranked?.get(r.key) ?? null));
  return (
    <div className="fd-grid-wrap">
      <div className="fd-grid" role="table" aria-label="Preview">
        <div role="row" className="fd-grow-h">
          <span role="columnheader">#</span>
          {head.map((h) => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
        </div>
        {!run && kind !== "lookalikes" &&
          Array.from({ length: 5 }, (_, k) => (
            <div key={k} role="row" className="fd-grow-r" aria-hidden>
              <span className="td-skel" style={{ width: 14 }} />
              <span className="td-skel" style={{ width: "70%" }} />
              <span className="td-skel" style={{ width: "50%" }} />
              <span className="td-skel" style={{ width: "50%" }} />
              <span className="td-skel" style={{ width: "40%" }} />
            </div>
          ))}
        {run && kind === "fractionals" && !run.fractionals && <p className="fd-note fd-pad">Loading the directory…</p>}
        {run && !rows.length && (kind !== "fractionals" || run.fractionals) && <p className="fd-note fd-pad">Nothing matches all of these. Take a filter off to see more.</p>}
        {rows.map((r, k) => (
          <div key={r.key} role="row" className="fd-grow-r">
            <span role="cell" className="fd-num">
              {k + 1}
            </span>
            <span role="cell" className="fd-namecell">
              <span className="fd-tile" style={{ background: r.open ? TINTS[k % 6] : "#EEF1EF" }} aria-hidden>
                {r.open ? ini(r.name) : "?"}
              </span>
              <span className="fd-namebox">
                {r.companyId ? (
                  <button type="button" className={`fd-name${r.open ? "" : " locked"}`} onClick={() => openCompany(r.companyId!)}>
                    {r.name}
                  </button>
                ) : (
                  <button type="button" className={`fd-name${r.open ? "" : " locked"}`} onClick={openFractionals}>
                    {r.name}
                  </button>
                )}
                <span className="fd-sub">
                  <span>{r.sub}</span>
                  {r.pill && <span className={`fd-pill${/credit/.test(r.pill) ? " lock" : r.pill === "Free" ? " mint" : ""}`}>{r.pill}</span>}
                </span>
              </span>
            </span>
            <span role="cell">{r.c2}</span>
            <span role="cell" className={r.c3muted ? "fd-muted" : ""}>
              {r.c3}
            </span>
            <span role="cell">{r.sig && <span className={`fd-pill${r.sig === "Hiring now" || r.sig === "Member" ? " mint" : /credit/.test(r.sig) ? " lock" : ""}`}>{r.sig}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- lookalikes: the seeds and the profile built from them ---------- */

function LikePanel({
  tokens,
  all,
  off,
  setOff,
  seeds,
  infos,
  setSeeds,
  isDefault,
  onAddSeat,
}: {
  tokens: string[];
  all: string[];
  off: LikeTrait[];
  setOff: (x: LikeTrait[]) => void;
  seeds: CoInfo[];
  infos: CoInfo[];
  setSeeds: (ids: string[]) => void;
  isDefault: boolean;
  onAddSeat: () => void;
}) {
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
  const skip = new Set(seeds.map((s) => s.c.id));
  const hits = seedMatches(infos, text, skip);
  const ids = seeds.map((s) => s.c.id);
  const chips = traitChips(tokens);
  const offChips = traitChips(all).filter((c) => off.includes(c.k));
  const picker = (
    <div className="fd-seedpick">
      <label htmlFor="fd-seed" className="fd-lab">
        Add a company you can see
      </label>
      <input id="fd-seed" type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="A client's name, like Cedar and Pine" />
      {hits.length > 0 && (
        <ul className="fd-seedhits">
          {hits.map((i) => (
            <li key={i.c.id}>
              <button type="button" className="fd-link" onClick={() => (setSeeds([...ids, i.c.id]), setText(""))}>
                Add {i.c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {text.trim().length >= 2 && !hits.length && <span className="fd-note">No company you have open by that name. Open it first, or look it up by its full name.</span>}
    </div>
  );
  if (!seeds.length)
    return (
      <div className="fd-like">
        <strong>Lookalikes start from your past clients.</strong>
        <span className="fd-note">You have no seats on Merlin yet, so there is nothing to match against. Add a seat you held, or pick companies you have won, and Merlin lists the companies most like them. Each fact you add to a seat earns 1 credit.</span>
        <div className="fd-like-acts">
          <button type="button" className="fd-volt fd-sm" onClick={onAddSeat}>
            Add a seat you held
          </button>
          <button type="button" className="fd-outline fd-sm" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            Pick companies you&apos;ve won
          </button>
        </div>
        {picking && picker}
      </div>
    );
  return (
    <div className="fd-like">
      <span className="fd-like-words">
        <strong>{profileWords(tokens).replace(/:.*$/, "")}.</strong> Each match shares at least 3 of these. Take one off to widen it.
      </span>
      <div className="fd-chips" aria-label="The profile">
        {chips.map((c) => (
          <button key={c.k} type="button" className="fd-chip on fd-chip-x" aria-label={`Take off: ${c.label}`} onClick={() => setOff([...off, c.k])}>
            <span>{c.label}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ))}
        {offChips.map((c) => (
          <button key={c.k} type="button" className="fd-chip" onClick={() => setOff(off.filter((k) => k !== c.k))}>
            Put back: {c.label}
          </button>
        ))}
      </div>
      <span className="fd-lab">{isDefault ? "From your seats" : "Your past clients"}</span>
      <div className="fd-chips">
        {seeds.map((s) => (
          <button key={s.c.id} type="button" className="fd-chip fd-chip-x" aria-label={`Leave out ${s.c.hidden ? "this company" : s.c.name}`} onClick={() => setSeeds(ids.filter((x) => x !== s.c.id))}>
            <span>{s.c.hidden ? "A company you held a seat at" : s.c.name}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ))}
      </div>
      {picker}
    </div>
  );
}
