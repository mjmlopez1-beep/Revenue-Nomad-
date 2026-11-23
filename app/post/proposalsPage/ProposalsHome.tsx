"use client";

/**
 * Proposals in the new look (Proposals.dc.html), the list page under the shell's header:
 *
 *   the strip      on a first visit: what the page is for (PageStrip, dismissible)
 *   Start          three ways to begin (from a call, from a template, blank), and on a first visit
 *                  Make your first template; the panel under the row is the start sheet in its
 *                  panel layout (ProposalStart.tsx) or the template maker (TemplateMaker.tsx)
 *   the table      every proposal: client and signer, status ("Client signed · your turn to
 *                  countersign"), reader activity, the next step, the seat, the value, when the link
 *                  ends; views with counts, Ask Merlin who needs a follow-up, the Template column,
 *                  selection with Void and Delete. A first visit shows two Example rows, never counted.
 *   My templates   the member's own, as tiles: use, edit (rename and voice), remove with Undo, upload
 *   Template library  Merlin's five examples, each Build from this
 *   Activity       beside the table: one proposal's reading in full, or every notification
 *
 * Everything comes from what Proposals.tsx loads (GET /api/proposals) and GET /api/activity. Nothing
 * here spends a credit. Without Close (after the trial) the page is read only with the Close prompt.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProposalRec, ProposalsView, TemplateChoice } from "@/lib/proposals/types";
import type { ActivityView, CloseInboxView } from "@/lib/close/types";
import { minWords } from "@/lib/close/activity";
import { PRICES, TRIAL_DAYS, TRIAL_NAME } from "@/lib/billing/rules";
import { errorText, useToast } from "../../ui/shared";
import { useAppMaybe } from "../shell/pages";
import { PageStrip } from "../shell/PageStrip";
import { openPlans } from "../Billing";
import { ProposalStatus, STATUS, api } from "../ProposalParts";
import { TEMPLATE_ACCEPT, uploadTemplate } from "../ProposalStart";
import { BLANK_SECTIONS, EXAMPLE_ROWS, LIBRARY, TRIAL_INCLUDES, VIEWS, fromWords, inView, needsFirst, rowOf, type Row, type ViewKey } from "./model";
import { TemplateMaker, type MakerStart } from "./TemplateMaker";
import { ClientPreview } from "./ClientPreview";
import "./proposalsPage.css";

export type StartMode = "call" | "template" | "blank";

/** A status in the table, in the shared words (ProposalParts.tsx STATUS), allowed to wrap: "Client signed · your turn to countersign". */
export const StatusPill = ({ status }: { status: ProposalRec["status"] }) => (
  <span className="pz-pill" data-st={status}>
    {STATUS[status]}
  </span>
);

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
async function activity<T>(body?: Record<string, unknown>, id?: string): Promise<T | { error: string }> {
  try {
    const r = await fetch(body ? "/api/activity" : `/api/activity${id ? `?id=${encodeURIComponent(id)}` : ""}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? (j as T) : { error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: NETWORK };
  }
}
/** How many sent proposals the table reads activity for at once (each is one GET). */
const ACTIVITY_ROWS = 15;

const ICONS = {
  make: "M4 20l4-1 11-11-3-3L5 16zM14 7l3 3",
  call: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6",
  template: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  blank: "M7 3h7l5 5v13H7zM14 3v5h5M12 12v6M9 15h6",
};
const Icon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => w && w.toLowerCase() !== "and")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function ProposalsHome({
  data,
  start,
  onStart,
  startPanel,
  onOpen,
  onContracts,
  onTemplates,
  onPut,
  onGone,
  closePrompt,
  granola,
}: {
  /** Granola for Merlin: switched on (RN_GRANOLA) and connected by the member. */
  granola?: { on: boolean; connected: boolean };
  /** The Close prompt where building is refused (Proposals.tsx CloseBuildPrompt). */
  closePrompt: ReactNode;
  data: ProposalsView;
  /** The start panel open (from a call, a template or blank), with a template picked when one was. */
  start: { mode: StartMode; templateId?: string } | null;
  onStart: (s: { mode: StartMode; templateId?: string } | null) => void;
  /** The start sheet in its panel layout (Proposals.tsx wires Granola into it). */
  startPanel: (mode: StartMode, templateId?: string) => ReactNode;
  /** Open a proposal in the editor, at a tab of its right panel. */
  onOpen: (id: string, tab?: "change" | "pricing" | "send") => void;
  onContracts: () => void;
  onTemplates: (t: TemplateChoice[]) => void;
  onPut: (p: ProposalRec) => void;
  onGone: (id: string) => void;
}) {
  const c = useAppMaybe();
  const toast = useToast();
  const mine = data.templates.filter((t) => t.mine);
  const real = data.proposals;
  const first = real.length === 0;
  const canBuild = data.canBuild;
  const plan = c?.me.plan;
  const onTrial = plan?.name === "trial";

  /* ---------- the start row and its panel ---------- */
  const [make, setMake] = useState<MakerStart | null>(() => (first && !mine.length && canBuild ? { ex: 0, step: 0 } : null));
  const [fresh, setFresh] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollToPanel = () => window.requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  const pick = (m: StartMode | "make") => {
    if (!canBuild) return openPlans("proposals");
    if (m === "make") {
      onStart(null);
      setMake(make ? null : { ex: 0, step: 0 });
      return scrollToPanel();
    }
    setMake(null);
    onStart(start?.mode === m ? null : { mode: m });
    scrollToPanel();
  };
  const openMaker = (s: MakerStart) => {
    if (!canBuild) return openPlans("proposals");
    onStart(null);
    setMake(s);
    scrollToPanel();
  };

  /* ---------- reader activity for the sent ones ---------- */
  const [acts, setActs] = useState<Record<string, ActivityView>>({});
  const asked = useRef(new Set<string>());
  const sentIds = useMemo(
    () =>
      real
        .filter((p) => p.status !== "draft")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, ACTIVITY_ROWS)
        .map((p) => `${p.id}|${p.status}|${p.rev}`),
    [real],
  );
  useEffect(() => {
    let live = true;
    const want = sentIds.filter((k) => !asked.current.has(k));
    void (async () => {
      for (let i = 0; i < want.length; i += 4) {
        const batch = want.slice(i, i + 4);
        batch.forEach((k) => asked.current.add(k));
        const got = await Promise.all(batch.map((k) => activity<ActivityView>(undefined, k.split("|")[0])));
        if (!live) return;
        setActs((a) => {
          const n = { ...a };
          got.forEach((r, j) => !("error" in r) && r.open && (n[batch[j].split("|")[0]] = r));
          return n;
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [sentIds]);
  const [inbox, setInbox] = useState<CloseInboxView | null>(null);
  const loadInbox = useCallback(() => void activity<CloseInboxView>().then((r) => !("error" in r) && setInbox(r)), []);
  useEffect(() => loadInbox(), [loadInbox, real.length]);

  /* ---------- the table ---------- */
  const rows = useMemo(() => needsFirst(real.map((p) => rowOf(p, acts[p.id] ?? null, Date.now(), mine))), [real, acts, mine]);
  const [view, setView] = useState<ViewKey>("all");
  const [askedFollow, setAskedFollow] = useState(false);
  const [tplCol, setTplCol] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const count = (v: ViewKey) => rows.filter((r) => inView(r, v)).length;
  const shown = rows.filter((r) => inView(r, view));
  const examples = first ? EXAMPLE_ROWS : [];
  const [asideOn, setAsideOn] = useState(true);
  const [atab, setAtab] = useState<"one" | "all">("one");
  const [focus, setFocus] = useState<string | null>(null);
  const focusRow = rows.find((r) => r.id === focus) ?? rows[0] ?? null;
  const focusEx = !focusRow && first ? (EXAMPLE_ROWS.find((x) => x.value.key === focus) ?? EXAMPLE_ROWS[0]) : null;
  const focusOn = (id: string) => (setFocus(id), setAsideOn(true), setAtab("one"));
  const [preview, setPreview] = useState<ProposalRec | null>(null);
  const next = (r: Row) => {
    if (r.next.kind === "pipeline") return c?.openPage("pipeline");
    if (r.next.kind === "countersign") return onOpen(r.id, "send");
    if (r.next.kind === "follow") return focusOn(r.id);
    onOpen(r.id);
  };
  const selRows = rows.filter((r) => sel.has(r.id));
  const bulk = async (op: "void" | "delete") => {
    const list = selRows.filter((r) => (op === "void" ? r.out : r.status === "draft"));
    if (!list.length) return toast(op === "void" ? "None of these is out with a client." : "Only drafts can be deleted here.", true);
    if (!window.confirm(op === "void" ? `Void ${list.length === 1 ? "it" : `these ${list.length}`}? The ${list.length === 1 ? "link stops" : "links stop"} working for the client.` : `Delete ${list.length === 1 ? "this draft" : `these ${list.length} drafts`}? It can't be undone.`)) return;
    setBulkBusy(true);
    let done = 0;
    for (const r of list) {
      const x = await api<ProposalRec & { ok?: boolean }>({ op, id: r.id });
      if (x.error) {
        toast(x.error, true);
        break;
      }
      done++;
      if (op === "delete") onGone(r.id);
      else onPut(x);
    }
    setBulkBusy(false);
    setSel(new Set());
    if (done) toast(op === "void" ? `Voided ${done}. The ${done === 1 ? "link" : "links"} stopped working.` : `Deleted ${done}.`);
  };
  const nNeeds = count("needs");
  const nOut = count("out");
  const pricedN = rows.filter((r) => r.priced).length;
  const sentN = rows.filter((r) => r.status !== "draft").length;
  const openedN = rows.filter((r) => r.status !== "draft" && r.opened).length;
  const endSoon = rows.filter((r) => r.due).length;
  const heads: [string, string][] = first
    ? [
        ["Client", "2 examples"],
        ["Status", "Draft to signed"],
        ["Reader activity", "Starts when you send it"],
        ["Next step", "Merlin suggests it"],
        ["Seat", "From the template"],
        ["Value", "From the call"],
        ["Link ends", `${data.proposals[0]?.linkDays ?? 30} days, or yours`],
      ]
    : [
        ["Client", `${rows.filter((r) => r.signer).length} with a signer`],
        ["Status", `${nOut} out with clients`],
        ["Reader activity", sentN ? `${openedN} of ${sentN} sent were opened` : "Starts when you send one"],
        ["Next step", `${nNeeds} need you`],
        ["Seat", "From the template"],
        ["Value", `${pricedN} of ${rows.length} priced`],
        ["Link ends", endSoon ? `${endSoon} end within 10 days` : "None ending soon"],
      ];
  if (tplCol) heads.push(["Template", "And the version"]);
  const status = askedFollow
    ? nNeeds
      ? `Merlin set the view to Needs you: ${nNeeds} ${nNeeds === 1 ? "proposal" : "proposals"}. Pick another view to see the rest.`
      : "Nothing needs a follow-up yet. Once a proposal is out, Merlin lists the ones to chase here."
    : first
      ? "No proposals of your own yet. The 2 rows above are examples. Sending one moves the deal to Proposal in your pipeline. A signature moves it to Won."
      : `${rows.length} ${rows.length === 1 ? "proposal" : "proposals"} · ${nOut} out with clients · sending moves a deal to Proposal in your pipeline, signing moves it to Won`;

  /* ---------- my templates ---------- */
  const [upOpen, setUpOpen] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [gone, setGone] = useState<TemplateChoice | null>(null);
  const goneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reallyRemove = useCallback(async (t: TemplateChoice) => {
    const r = await api<{ ok: boolean }>({ op: "template_delete", id: t.id });
    if (r.error) toast(r.error, true);
  }, [toast]);
  // Removed with Undo: it goes from the list at once and from the server after a moment, unless Undo is pressed first.
  const remove = (t: TemplateChoice) => {
    if (gone) void reallyRemove(gone);
    if (goneTimer.current) clearTimeout(goneTimer.current);
    setGone(t);
    onTemplates(data.templates.filter((x) => x.id !== t.id));
    goneTimer.current = setTimeout(() => (void reallyRemove(t), setGone(null)), 8000);
  };
  const goneRef = useRef(gone);
  goneRef.current = gone;
  useEffect(
    () => () => {
      if (goneTimer.current) clearTimeout(goneTimer.current);
      if (goneRef.current) void reallyRemove(goneRef.current);
    },
    [reallyRemove],
  );
  const undo = () => {
    if (!gone) return;
    if (goneTimer.current) clearTimeout(goneTimer.current);
    onTemplates([gone, ...data.templates]);
    setGone(null);
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setUpBusy(true);
    const r = await uploadTemplate(f);
    setUpBusy(false);
    if (r.error || !r.id) return toast(r.error ?? "That file didn't read.", true);
    onTemplates([{ id: r.id, title: r.title ?? f.name, about: f.name, mine: true, open: true, sections: r.blocks?.length ?? 0 }, ...data.templates]);
    setFresh((x) => [...x, r.id!]);
    setUpOpen(false);
    toast(`Added ${r.title}.`);
  };
  const usedTimes = (id: string) => {
    const n = real.filter((p) => p.templateId === id).length;
    const s = real.filter((p) => p.templateId === id && p.status === "signed").length;
    return n ? `used ${n === 1 ? "once" : `${n} times`}${s ? `, ${s} signed` : ""}` : "not used yet";
  };

  const planLine = onTrial && plan?.trialDaysLeft != null ? `${TRIAL_NAME}, ${plan.trialDaysLeft} ${plan.trialDaysLeft === 1 ? "day" : "days"} left.` : null;

  const cards: { key: StartMode | "make"; t: string; d: string; f: string; hl?: boolean }[] = [
    ...(first || !mine.length
      ? [{ key: "make" as const, t: mine.length ? "Make another template" : "Make your first template", d: "Pick an example, set your voice, add your signature. Every proposal then starts as yours.", f: "3 steps · about 4 minutes · free", hl: !mine.length }]
      : []),
    {
      key: "call",
      t: "From a call",
      d: granola?.on ? "Pick a Granola call, paste a transcript, or say what was agreed. Merlin fills in what was said." : "Paste a transcript, or say what was agreed. Merlin fills in what was said.",
      f: granola?.connected ? "Pick one of your Granola calls" : granola?.on ? "Connect Granola, or paste a transcript" : "Paste a transcript, or say what was agreed",
    },
    { key: "template", t: "From a template", d: "Your structure and standing terms. Nothing is filled in from a call.", f: mine.length ? `${mine.length} of yours · ${LIBRARY.length} from Merlin` : `${LIBRARY.length} from Merlin. Yours show once you save one.` },
    { key: "blank", t: "Blank", d: "The usual sections, nothing filled in. For when no template fits.", f: `${BLANK_SECTIONS} sections to start from` },
  ];
  const panelOpen = !!start || !!make;

  const tile = (i: number) => ["#e3e8f7", "#e8f3ee", "#ffe7a8", "#f3e8f5", "#ddf0f7", "#fbe3d6"][i % 6];

  return (
    <div className="pz" data-first={first || undefined}>
      <PageStrip page="proposals" own={real.length}>
        {mine.length
          ? "Your first template is saved. Now start a proposal from a call, and Merlin drafts it in that structure and your words."
          : "Start a proposal from a call or a template, send it to sign, and see what the client reads. Make one template first, so every proposal opens in your structure and your words."}
      </PageStrip>

      {/* ---------- start ---------- */}
      <section className="pz-start" id="pz-start" aria-labelledby="pz-st">
        <div className="pz-start-h">
          <h2 id="pz-st">Start a proposal</h2>
          <span className="pz-sub">Merlin drafts it in your words. Nothing is sent until you send it.</span>
          {data.ai === "on" && <span className="pz-ai">{data.aiUsedUp ? "Merlin allowance used up this month" : "Drafting with Merlin is on"}</span>}
          <button type="button" className="tp-flink pz-ct" onClick={onContracts}>
            Send a contract to sign
          </button>
        </div>
        {!canBuild && closePrompt}
        <div className="pz-cards">
          {cards.map((k) => {
            const on = k.key === "make" ? !!make : start?.mode === k.key;
            return (
              <button key={k.key} type="button" className="pz-card" aria-pressed={on} data-hl={k.hl || undefined} onClick={() => pick(k.key)}>
                <span className="pz-card-i">
                  <Icon d={ICONS[k.key]} />
                </span>
                <span className="pz-card-t">
                  <strong>{k.t}</strong>
                  <span>{k.d}</span>
                  <span className="pz-card-f">{k.f}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div ref={panelRef}>
          {start && startPanel(start.mode, start.templateId)}
          {make && !start && (
            <div className="pz-panel" data-mode="make">
              <div className="pz-panel-head">
                <span className="pz-panel-t">
                  <h3 className="pz-panel-h">{make.edit ? "Edit template" : first && !mine.length ? "Make your first template" : "Make a template"}</h3>
                  <span>Three steps. The preview follows every choice.</span>
                </span>
                <button type="button" className="pz-x" aria-label="Close this panel" onClick={() => setMake(null)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <TemplateMaker
                key={`${make.edit?.id ?? "new"}-${make.ex}-${make.step}`}
                start={make}
                first={first}
                onSaved={(t) => {
                  if (make.edit) onTemplates(data.templates.map((x) => (x.id === t.id ? { ...x, title: t.title } : x)));
                  else onTemplates([t, ...data.templates]), setFresh((x) => [...x, t.id]);
                }}
                onUse={(id) => (setMake(null), onStart({ mode: "template", templateId: id }))}
                onAnother={() => setMake({ ex: 0, step: 0 })}
              />
            </div>
          )}
        </div>
        {first && onTrial && (
          <div className="pz-trial">
            <strong>
              In your {TRIAL_NAME}, {TRIAL_DAYS} days, free:
            </strong>
            {TRIAL_INCLUDES.map((t) => (
              <span key={t} className="pz-trial-i">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12l5 5 9-11" />
                </svg>
                {t}
              </span>
            ))}
            <span className="pz-note">
              After the trial, Close is ${PRICES.closeMonth} a month. Without it, the proposals and templates you made are kept and open read only.{" "}
              <button type="button" className="tp-flink" onClick={() => openPlans("proposals")}>
                See the plans
              </button>
            </span>
          </div>
        )}
      </section>
      {panelOpen && <span className="pz-sr" aria-live="polite" />}

      {/* ---------- the table and the activity beside it ---------- */}
      <div className="pz-bar">
        <div className="pz-views" role="tablist" aria-label="Views">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => (setView(v.key), setAskedFollow(false))}>
              {v.label}
              <span className="pz-n">{count(v.key)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="pz-chip pz-ask" aria-pressed={askedFollow && view === "needs"} onClick={() => (setView("needs"), setAskedFollow(true))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
          </svg>
          Ask Merlin: who needs a follow-up today?
        </button>
        <button type="button" className="btn btn-sm" aria-pressed={tplCol} onClick={() => setTplCol((x) => !x)}>
          {tplCol ? 8 : 7} of 8 columns
        </button>
        <button type="button" className={`btn btn-sm${asideOn ? " btn-pine" : ""}`} aria-pressed={asideOn} onClick={() => setAsideOn((x) => !x)}>
          Activity
        </button>
        <span className="pz-sort">Sorted by what needs you first</span>
      </div>
      {sel.size > 0 && (
        <div className="pz-bulk" role="toolbar" aria-label="Actions for selected proposals">
          <strong>{sel.size} selected</strong>
          <button type="button" className="btn btn-sm" disabled={bulkBusy} onClick={() => void bulk("void")}>
            Void
          </button>
          <button type="button" className="btn btn-sm" disabled={bulkBusy} onClick={() => void bulk("delete")}>
            Delete drafts
          </button>
          <button type="button" className="tp-flink" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      )}
      <div className="pz-work" data-aside={asideOn || undefined}>
        <div className="pz-main">
          {first && <p className="pz-exnote">These rows are examples, so you can see what a sent proposal looks like. Tap one to see its reader activity. They go when you send your first.</p>}
          <section aria-label="Your proposals" className="pz-tablewrap">
            <div role="table" aria-label="Proposals" className="pz-table" data-tpl={tplCol || undefined}>
              <div role="row" className="pz-tr pz-th">
                <span role="columnheader" className="pz-tc pz-tc-sel" />
                {heads.map(([h, fill]) => (
                  <span key={h} role="columnheader" className="pz-tc">
                    <span>{h}</span>
                    <span className="pz-fill">{fill}</span>
                  </span>
                ))}
                <span className="pz-tc pz-tc-add">
                  <button type="button" className="pz-plus" aria-label={tplCol ? "Remove the Template column" : "Add the Template column"} onClick={() => setTplCol((x) => !x)}>
                    {tplCol ? "−" : "+"}
                  </button>
                </span>
              </div>
              {examples.map((x) => {
                const r = x.value;
                return (
                  <div key={r.key} role="row" className="pz-tr" data-ex data-focus={asideOn && focusEx?.value.key === r.key ? true : undefined}>
                    <span role="cell" className="pz-tc pz-tc-sel" />
                    <span role="cell" className="pz-tc pz-co">
                      <span className="pz-ini" aria-hidden style={{ background: tile(r.key === "ex-north" ? 0 : 1) }}>
                        {initials(r.co)}
                      </span>
                      <span className="pz-co-t">
                        <strong>{r.co}</strong>
                        <span>{r.who}</span>
                        <span className="pz-tag pz-tag-ex">{x.label}</span>
                      </span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <StatusPill status={r.status} />
                      <span className="pz-s2">{r.tv}</span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <button type="button" className="pz-actbtn" aria-label={`See the reader activity for ${r.co}`} onClick={() => focusOn(r.key)}>
                        <span>{r.a1}</span>
                        <span className="pz-s2">{r.a2}</span>
                      </button>
                    </span>
                    <span role="cell" className="pz-tc">
                      <button type="button" className="pz-next" onClick={() => focusOn(r.key)}>
                        See activity
                      </button>
                      <span className="pz-s2">{r.ns}</span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <span>{r.seat}</span>
                      <span className="pz-s2">{r.days}</span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <strong>{r.val}</strong>
                      <span className="pz-s2">{r.vs}</span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <span>{r.l1}</span>
                      <span className="pz-s2">{r.l2}</span>
                    </span>
                    {tplCol && (
                      <span role="cell" className="pz-tc">
                        <span>{r.tpl}</span>
                        <span className="pz-s2">{r.tv}</span>
                      </span>
                    )}
                    <span className="pz-tc pz-tc-add" />
                  </div>
                );
              })}
              {shown.map((r, i) => {
                const on = sel.has(r.id);
                const isNew = fresh.includes(r.id) || (r.status === "draft" && Date.now() - Date.parse(real.find((p) => p.id === r.id)?.createdAt ?? "") < 10 * 60_000);
                return (
                  <div key={r.id} role="row" className="pz-tr" data-on={on || undefined} data-focus={asideOn && focusRow?.id === r.id ? true : undefined}>
                    <span role="cell" className="pz-tc pz-tc-sel">
                      <button type="button" role="checkbox" aria-checked={on} aria-label={`Select ${r.co}`} className="pz-check" onClick={() => setSel((s) => (s.has(r.id) ? new Set([...s].filter((x) => x !== r.id)) : new Set([...s, r.id])))}>
                        {on && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M5 12l5 5 9-11" />
                          </svg>
                        )}
                      </button>
                    </span>
                    <span role="cell" className="pz-tc pz-co">
                      <span className="pz-ini" aria-hidden style={{ background: tile(i) }}>
                        {initials(r.co)}
                      </span>
                      <span className="pz-co-t">
                        <button type="button" className="pz-co-go" onClick={() => onOpen(r.id)}>
                          {r.co}
                        </button>
                        <span>{r.who}</span>
                        {isNew && <span className="pz-tag pz-tag-new">New</span>}
                      </span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <StatusPill status={r.status} />
                      {r.version > 1 && <span className="pz-s2">Version {r.version}</span>}
                    </span>
                    <span role="cell" className="pz-tc">
                      <button type="button" className="pz-actbtn" aria-label={`See the reader activity for ${r.co}`} onClick={() => focusOn(r.id)}>
                        <span>{r.a1}</span>
                        <span className="pz-s2">{r.a2}</span>
                      </button>
                    </span>
                    <span role="cell" className="pz-tc">
                      <button type="button" className="pz-next" data-main={r.next.main || undefined} onClick={() => next(r)}>
                        {r.next.label}
                      </button>
                      <span className="pz-s2">{r.ns}</span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <span>{r.seat}</span>
                      <span className="pz-s2">{r.days}</span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <strong>{r.val}</strong>
                      <span className="pz-s2">{r.vs}</span>
                    </span>
                    <span role="cell" className="pz-tc">
                      <span>
                        {r.due && <span className="pz-due" aria-hidden />}
                        {r.l1}
                      </span>
                      <span className="pz-s2">{r.l2}</span>
                    </span>
                    {tplCol && (
                      <span role="cell" className="pz-tc">
                        <span>{r.tpl}</span>
                        <span className="pz-s2">{r.tv}</span>
                      </span>
                    )}
                    <span className="pz-tc pz-tc-add" />
                  </div>
                );
              })}
            </div>
          </section>
          {!first && shown.length === 0 && (
            <div className="pz-none">
              <span>Nothing in this view right now. That is good news for anything that was waiting on you.</span>
              <button type="button" className="btn btn-sm" onClick={() => (setView("all"), setAskedFollow(false))}>
                Show all proposals
              </button>
            </div>
          )}
          <div className="pz-status">
            <span role="status">{status}</span>
            <a href={c?.hrefOf("pipeline") ?? "/?p=pipeline"} onClick={(e) => c && (e.preventDefault(), c.openPage("pipeline"))}>
              Pipeline
            </a>
            <button type="button" className="tp-flink" onClick={onContracts}>
              Documents you sent to sign are in Contracts
            </button>
          </div>

          {/* ---------- my templates ---------- */}
          <section className="pz-sec" aria-labelledby="pz-mt">
            <div className="pz-sec-h">
              <h2 id="pz-mt">My templates</h2>
              <span className="pz-sub">{mine.length ? `${mine.length} ${mine.length === 1 ? "template" : "templates"}. Only you see them. Merlin drafts new proposals in their structure and your words.` : "None yet. Only you will see them. Until then, proposals start from a Merlin example."}</span>
              {canBuild && (
                <button type="button" className="btn btn-sm" aria-expanded={upOpen} onClick={() => setUpOpen((x) => !x)}>
                  Upload a past proposal or SOW
                </button>
              )}
            </div>
            {upOpen && (
              <div className="pz-up">
                <span>
                  <strong>Drop a .docx, .pdf, .md or .txt you wrote before.</strong> Merlin reads its headings and text into sections, and drafts new proposals in its structure and your words. Only you see it. The file itself is not kept.
                </span>
                <button type="button" className="btn btn-pine btn-sm" aria-busy={upBusy} disabled={upBusy} onClick={() => fileRef.current?.click()}>
                  {upBusy ? "Reading it" : "Choose a file"}
                </button>
                <input ref={fileRef} type="file" accept={TEMPLATE_ACCEPT} hidden aria-label="Choose a past proposal or SOW" onChange={(e) => (void upload(e.target.files?.[0]), (e.target.value = ""))} />
              </div>
            )}
            <div className="pz-tiles">
              {mine.map((t, i) => (
                <div key={t.id} className="pz-tile">
                  <div className="pz-thumb" aria-hidden style={{ background: tile(i + 1) }}>
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="pz-tile-b">
                    <span className="pz-tile-t">
                      <strong>{t.title}</strong>
                      {fresh.includes(t.id) && <span className="pz-tag pz-tag-new">New</span>}
                    </span>
                    <span className="pz-s2">{fromWords(t.about)}</span>
                    <span className="pz-s2">
                      {t.sections} sections · {usedTimes(t.id)}
                    </span>
                    <span className="pz-tile-acts">
                      <button type="button" className="tp-flink" onClick={() => (canBuild ? (setMake(null), onStart({ mode: "template", templateId: t.id }), scrollToPanel()) : openPlans("proposals"))}>
                        Use
                      </button>
                      <button type="button" className="tp-flink" onClick={() => openMaker({ ex: 0, step: 1, edit: { id: t.id, title: t.title } })}>
                        Edit
                      </button>
                      <button type="button" className="tp-flink" aria-label={`Remove the template ${t.title}`} onClick={() => remove(t)}>
                        Remove
                      </button>
                    </span>
                  </div>
                </div>
              ))}
              {canBuild && (
                <button type="button" className="pz-tile pz-tile-new" onClick={() => openMaker({ ex: 0, step: 0 })}>
                  <strong>{mine.length ? "New template" : "Your first template lands here"}</strong>
                  <span>{mine.length ? "Build one from a library example, with your voice and signature." : "Three steps, about 4 minutes. Pick an example, set your voice, add your signature."}</span>
                </button>
              )}
            </div>
            {gone && (
              <div className="pz-gone" role="status">
                <span>Template removed. Proposals you made from it stay.</span>
                <button type="button" className="btn btn-sm" onClick={undo}>
                  Undo
                </button>
              </div>
            )}
          </section>

          {/* ---------- the library ---------- */}
          <section className="pz-sec" aria-labelledby="pz-lib">
            <div className="pz-sec-h">
              <h2 id="pz-lib">Template library</h2>
              <span className="pz-sub">{LIBRARY.length} examples from Merlin, built from the patterns in proposals that won. Build your own from any of them.</span>
            </div>
            <div className="pz-tiles pz-lib">
              {LIBRARY.map((l, i) => (
                <div key={l.id} className="pz-libtile">
                  <span className="pz-k">{l.sections} sections</span>
                  <strong>{l.title}</strong>
                  <span className="pz-s2">{l.about}</span>
                  <button type="button" className="tp-flink" onClick={() => openMaker({ ex: i, step: 1 })}>
                    Build from this
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {asideOn && (
          <aside className="pz-aside" aria-label="Activity">
            <div className="pz-aside-h">
              <strong>Activity</strong>
              {atab === "all" && !!inbox?.unread && (
                <button type="button" className="tp-flink" onClick={() => void activity<CloseInboxView>({ op: "read" }).then(() => loadInbox())}>
                  Mark all read
                </button>
              )}
              <button type="button" className="pz-x" aria-label="Close activity" onClick={() => setAsideOn(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="pz-tabs" role="tablist" aria-label="Activity">
              <button type="button" role="tab" aria-selected={atab === "one"} onClick={() => setAtab("one")}>
                This proposal
              </button>
              <button type="button" role="tab" aria-selected={atab === "all"} onClick={() => setAtab("all")}>
                All activity
                <span className="pz-n">{inbox?.unread ? `${inbox.unread} new` : inbox?.items.length ?? 0}</span>
              </button>
            </div>
            {atab === "all" ? (
              <div className="pz-feed">
                {(inbox?.items ?? []).slice(0, 30).map((n) => (
                  <button key={n.id} type="button" className="pz-feed-i" onClick={() => (real.some((p) => p.id === n.item) ? focusOn(n.item) : undefined)}>
                    <span className="pz-feed-dot" data-new={!n.read || undefined} aria-hidden />
                    <span>
                      <span>
                        <strong>{n.head}</strong> {n.text}
                      </span>
                      <span className="pz-s2">
                        {new Date(n.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {n.sub ? ` · ${n.sub}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
                {!inbox?.items.length && <span className="pz-note">Nothing yet. When a client opens, reads, asks a question or signs, it shows here and at the bell, and comes by email. Connect Slack and it posts there too.</span>}
                <a className="pz-link" href={c?.hrefOf(c.ui2 ? "alerts" : "notifications") ?? "/?p=notifications"} onClick={(e) => c && (e.preventDefault(), c.openPage(c.ui2 ? "alerts" : "notifications"))}>
                  Choose where each alert goes: Slack, email or here
                </a>
              </div>
            ) : focusRow ? (
              <OneActivity
                key={focusRow.id}
                p={real.find((p) => p.id === focusRow.id)!}
                row={focusRow}
                act={acts[focusRow.id] ?? null}
                onAct={(v) => setActs((a) => ({ ...a, [v.id]: v }))}
                onOpen={() => onOpen(focusRow.id, focusRow.status === "client_signed" ? "send" : undefined)}
                onPreview={() => setPreview(real.find((p) => p.id === focusRow.id) ?? null)}
              />
            ) : focusEx ? (
              <div className="pz-one">
                <div className="pz-one-h">
                  <strong>{focusEx.value.co}</strong>
                  <ProposalStatus status={focusEx.value.status} />
                  <span className="pz-tag pz-tag-ex">{focusEx.label}</span>
                </div>
                <span className="pz-note">An example. After you send a proposal, this panel shows who opened it, what they read and when to follow up.</span>
                <div className="pz-stats">
                  <span>
                    <strong>{focusEx.value.key === "ex-north" ? 5 : 2}</strong>
                    <span>opens</span>
                  </span>
                  <span>
                    <strong>{focusEx.value.key === "ex-north" ? 2 : 1}</strong>
                    <span>people reading</span>
                  </span>
                  <span>
                    <strong>{focusEx.value.key === "ex-north" ? "18 min" : "11 min"}</strong>
                    <span>reading in total</span>
                  </span>
                </div>
              </div>
            ) : (
              <span className="pz-note">Pick a proposal to see who opened it and what they read.</span>
            )}
            {planLine && (
              <div className="pz-plan">
                <span>
                  {planLine} Proposals, contracts and signing stay on Close, ${PRICES.closeMonth} a month. Without it, what you made is kept, read only.
                </span>
                <button type="button" className="tp-flink" onClick={() => openPlans("proposals")}>
                  Upgrade
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
      {preview && <ClientPreview p={preview} close={data.canSend} me={data.me} onClose={() => setPreview(null)} />}
    </div>
  );
}

/** One proposal's reading, beside the table (the full panel is on the proposal, Activity.tsx). */
function OneActivity({ p, row, act, onAct, onOpen, onPreview }: { p: ProposalRec; row: Row; act: ActivityView | null; onAct: (v: ActivityView) => void; onOpen: () => void; onPreview: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const sent = p.status !== "draft";
  const s = act?.suggestion ?? null;
  const max = Math.max(1, ...(act?.sections ?? []).map((x) => x.ms));
  const live = p.status === "sent" || p.status === "viewed";
  const flip = async (key: string, on: boolean) => {
    setBusy(true);
    const r = await activity<ActivityView>({ op: "reminders", id: p.id, [key]: on });
    setBusy(false);
    if ("error" in r) return toast(r.error, true);
    onAct(r);
  };
  return (
    <div className="pz-one">
      <div className="pz-one-h">
        <strong>{row.co}</strong>
        <ProposalStatus status={p.status} />
      </div>
      <span className="pz-s2">
        {p.send ? `Sent ${new Date(p.send.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${row.who}. ${row.l1 === "No end date" ? "The link has no end date." : row.out ? `Link open until ${row.l2.replace(/^Ends /, "")}.` : ""}` : "Not sent yet."}
      </span>
      {s && (
        <div className="pz-sug">
          <span className="pz-k">{s.when}</span>
          <strong>{s.headline}</strong>
          {s.points.map((x) => (
            <span key={x}>{x}</span>
          ))}
          <span className="pz-s2">{s.why}</span>
          {s.draft && (
            <button type="button" className="tp-flink" onClick={onOpen}>
              Open the follow-up Merlin drafted
            </button>
          )}
        </div>
      )}
      {!sent && <span className="pz-note">Reading activity starts when you send it. Merlin then shows each section here, and says when to follow up.</span>}
      {sent && act && (
        <>
          <div className="pz-stats">
            <span>
              <strong>{act.stats.opens}</strong>
              <span>opens</span>
            </span>
            <span>
              <strong>{act.stats.readers}</strong>
              <span>{act.stats.readers === 1 ? "person reading" : "people reading"}</span>
            </span>
            <span>
              <strong>{minWords(act.stats.ms)}</strong>
              <span>reading in total</span>
            </span>
          </div>
          <span className="pz-k">Where they spent their time</span>
          {act.sections.filter((x) => x.ms > 0).length ? (
            act.sections
              .filter((x) => x.ms > 0)
              .slice(0, 6)
              .map((x) => (
                <div key={x.id} className="pz-barrow" data-top={x.top || undefined}>
                  <span>{x.label}</span>
                  <span className="pz-barline" aria-hidden>
                    <span style={{ width: `${Math.max(3, Math.round((x.ms / max) * 100))}%` }} />
                  </span>
                  <span>{minWords(x.ms)}</span>
                </div>
              ))
          ) : (
            <span className="pz-note">Nothing read yet. Merlin shows each section here once they open it.</span>
          )}
          {act.options.length > 0 && (
            <div className="pz-opts">
              <span className="pz-k">Options they looked at</span>
              {act.options.map((o) => (
                <span key={o.id} className="pz-chip pz-chip-ro">
                  {o.label} · {o.words}
                </span>
              ))}
            </div>
          )}
          {live && act.reminders.length > 0 && (
            <>
              <span className="pz-k">Reminders to the signer</span>
              {act.reminders
                .filter((r) => r.state !== "stopped")
                .map((r) => (
                  <label key={`${r.to}${r.key}`} className="pz-switch pz-switch-sm">
                    <input type="checkbox" role="switch" checked={r.on} disabled={busy || r.state === "sent"} onChange={(e) => void flip(r.key, e.target.checked)} />
                    <span className="pz-track" aria-hidden>
                      <span />
                    </span>
                    <span>
                      {r.label}
                      <span className="pz-s2"> · {r.state === "sent" ? "Sent" : r.on ? new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Off"}</span>
                    </span>
                  </label>
                ))}
              <span className="pz-note">Merlin nudges only while it is unsigned, and stops the moment they sign or decline.</span>
            </>
          )}
        </>
      )}
      {sent && !act && <div className="pp-skel" aria-busy="true" />}
      <div className="pz-one-acts">
        <button type="button" className="btn btn-sm btn-pine" onClick={onOpen}>
          {p.status === "client_signed" ? "Countersign" : "Open the proposal"}
        </button>
        <button type="button" className="btn btn-sm" onClick={onPreview}>
          See what the client sees
        </button>
      </div>
      <span className="pz-note">Clients are told on the proposal that you see when it is opened and which parts were read. Merlin counts with a cookie on that page, never an IP address.</span>
    </div>
  );
}
