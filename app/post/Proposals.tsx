"use client";

/**
 * Proposals (?p=proposals, under Yours): the member's own proposals, the builder, and sending for
 * signature (lib/proposals). The builder is a list of blocks from the library (templates.json):
 * add, remove, reorder (drag on desktop, up and down on phones), edit the text, and fill its
 * {{fields}} from the company record, the member's profile, the rate benchmarks and the call.
 * Beside each block: the template's guidance, what good looks like and common mistakes. Beside the
 * whole: the live checklist of what winning proposals do, the risk flags, what fractionals in the
 * member's function were paid at this company's size, and "From your call".
 *
 * "From your call" reads a pasted transcript or a .txt, .vtt, .srt or .md file in this browser
 * (lib/proposals/extract.ts, no model): the transcript never leaves it, and only the lines the
 * member uses are saved. Changes save as they are made. A change after sending makes a new
 * version (the server voids the old link), so a sent proposal opens read-only until the member
 * says to change it. Free writes drafts from one template; sending is Pro's (Trial has it).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { View } from "@/lib/tableTypes";
import type { DiscoveryNote, ProposalBlock, ProposalRec, ProposalsView, SignerInfo } from "@/lib/proposals/types";
import { SENDER_DUTY } from "@/lib/proposals/types";
import {
  BLOCKS,
  DISCOVERY_LABELS,
  DISCOVERY_TARGET,
  FREE_TEMPLATE,
  TEMPLATES,
  acceptInto,
  blanksOf,
  blockDef,
  blockFields,
  checklist,
  docFields,
  guidanceFor,
  makeBlock,
  rendered,
  riskFlags,
  templateDef,
} from "@/lib/proposals/library";
import { extract, transcriptOk, type Extraction, type Suggestion } from "@/lib/proposals/extract";
import { adviceFromView } from "@/lib/proposals/rates";
import { PRICES } from "@/lib/billing/rules";
import { IconCheck, IconChevron, IconPlus, IconX, useToast } from "../ui/shared";
import { Sheet } from "./ui";
import { useMedia } from "./hooks";
import { openPlans } from "./Billing";
import { DocBlocks, EVENT_SAY, dayOf, stamp } from "../sign/doc";
import type { CoInfo } from "./model";
import { startDone, startProposal, takeWantCompany } from "./WriteProposal";
import "../sign/sign.css";
import "./proposals.css";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const PRO_SEND = `Sending for signature is on Pro + Close: $${PRICES.closeMonth} a month, or $${PRICES.closeYear} a year. You can build and preview proposals on Free and Pro.`;

async function api<T>(body: Record<string, unknown>): Promise<T & { error?: string; upgrade?: string }> {
  try {
    const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}
async function load(): Promise<ProposalsView | { error: string }> {
  try {
    const r = await fetch("/api/proposals", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error || "Proposals didn't load. Try again." };
  } catch {
    return { error: NETWORK };
  }
}

const STATUS: Record<ProposalRec["status"], { say: string; cls: string }> = {
  draft: { say: "Draft", cls: "chip-outline" },
  sent: { say: "Sent", cls: "" },
  viewed: { say: "Opened", cls: "" },
  signed: { say: "Signed", cls: "chip-volt" },
  declined: { say: "Declined", cls: "pp-chip-lost" },
  void: { say: "Withdrawn", cls: "chip-outline" },
  expired: { say: "Expired", cls: "chip-outline" },
};
const SOURCE: Record<string, string> = { record: "From the record", profile: "From your profile", discovery: "From your call", claude: "From Claude", rate: "Rate benchmarks", manual: "" };

/* ================= the page ================= */

export function ProposalsPage({ view, infos, onBack }: { view: View; infos: CoInfo[]; onBack: () => void }) {
  const [data, setData] = useState<ProposalsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A proposal the address named (the connector's edit link), or the company "Write a proposal" was pressed on.
  const [openId, setOpenId] = useState<string | null>(startProposal);
  const [starting, setStarting] = useState<{ companyId: string | null } | null>(() => {
    const c = takeWantCompany();
    return c ? { companyId: c } : null;
  });
  const reload = useCallback(async () => {
    const r = await load();
    if ("error" in r) setError(r.error);
    else setData(r), setError(null);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const put = useCallback((p: ProposalRec) => setData((d) => (d ? { ...d, proposals: [p, ...d.proposals.filter((x) => x.id !== p.id)] } : d)), []);
  const open = data?.proposals.find((p) => p.id === openId) ?? null;
  useEffect(() => {
    if (data) startDone();
  }, [data]);

  if (open && data)
    return (
      <Editor
        key={open.id}
        initial={open}
        data={data}
        view={view}
        onSaved={put}
        onBack={() => setOpenId(null)}
        onGone={(id) => (setData((d) => (d ? { ...d, proposals: d.proposals.filter((x) => x.id !== id) } : d)), setOpenId(null))}
        onOpen={(p) => (put(p), setOpenId(p.id))}
      />
    );

  return (
    <div className="tp-page pp-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <div className="pp-headrow">
        <h1 className="tp-page-h">Proposals</h1>
        <button type="button" className="btn btn-primary" onClick={() => setStarting({ companyId: null })} disabled={!data}>
          <IconPlus /> New proposal
        </button>
      </div>
      <p className="pp-lead">Start from templates that won, fill them from the company record, the rate benchmarks and your call, and send for signature. When they sign, your pipeline moves.</p>
      {data && !data.canSend && (
        <div className="pp-free" data-plan="free">
          <span className="bl-tag bl-tag-lock">Pro + Close</span>
          <p>
            You can build and preview proposals from one template. {PRO_SEND.split(".")[0]}.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => openPlans("proposals")}>
            See Pro + Close
          </button>
        </div>
      )}
      {error && <p className="pp-err">{error}</p>}
      {!data && !error && <div className="pp-skel" aria-busy="true" />}
      {data && data.proposals.length === 0 && (
        <div className="pp-empty">
          <h2>No proposals yet</h2>
          <p>Pick a company and a template. Proposals sent within 48 hours of the call win more often.</p>
          <button type="button" className="btn btn-pine" onClick={() => setStarting({ companyId: null })}>
            Write your first proposal
          </button>
        </div>
      )}
      {data && data.proposals.length > 0 && (
        <ul className="pp-list">
          {data.proposals.map((p) => (
            <li key={p.id}>
              <button type="button" className="pp-row" onClick={() => setOpenId(p.id)}>
                <span className="pp-row-main">
                  <span className="pp-row-t">{p.title}</span>
                  <span className="pp-row-s">
                    {p.company.name || "No company yet"} · {p.send?.signer ? `${p.send.signer.name} · ` : ""}
                    {p.status === "draft" ? `Edited ${dayOf(p.updatedAt)}` : p.status === "signed" ? `Signed ${dayOf(p.send?.signedAt)}` : `Sent ${dayOf(p.send?.sentAt)}`}
                  </span>
                </span>
                <span className={`chip ${STATUS[p.status].cls}`}>{STATUS[p.status].say}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {starting && data && (
        <StartSheet
          data={data}
          infos={infos}
          companyId={starting.companyId}
          onClose={() => setStarting(null)}
          onMade={(p) => (put(p), setStarting(null), setOpenId(p.id))}
        />
      )}
    </div>
  );
}

/* ================= starting one ================= */

function StartSheet({ data, infos, companyId, onClose, onMade }: { data: ProposalsView; infos: CoInfo[]; companyId: string | null; onClose: () => void; onMade: (p: ProposalRec) => void }) {
  const toast = useToast();
  const known = useMemo(() => infos.filter((i) => !i.c.hidden && i.c.name).sort((a, b) => a.c.name.localeCompare(b.c.name)), [infos]);
  const preset = companyId ? infos.find((i) => i.c.id === companyId) : undefined;
  const [q, setQ] = useState(preset && !preset.c.hidden ? preset.c.name : "");
  const [pick, setPick] = useState<string | null>(companyId);
  const [tpl, setTpl] = useState<string>(FREE_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const matches = q.trim().length >= 2 && !pick ? known.filter((i) => i.c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const picked = pick ? infos.find((i) => i.c.id === pick) : undefined;
  const go = async () => {
    setBusy(true);
    const r = await api<ProposalRec>({ op: "create", templateId: tpl === "blank" ? null : tpl, companyId: pick, companyName: pick ? (picked?.c.hidden ? q : undefined) : q });
    setBusy(false);
    if (r.error) return toast(r.error, true);
    onMade(r);
  };
  return (
    <Sheet
      title="New proposal"
      onClose={onClose}
      dialog
      className="pp-start"
      footer={
        <button type="button" className="btn btn-primary btn-lg pp-wide" aria-busy={busy} disabled={busy || (!pick && !q.trim())} onClick={go}>
          {busy ? "Starting" : "Start writing"}
        </button>
      }
    >
      <div className="pp-start-body">
        <label className="pp-label" htmlFor="pp-co">
          For which company
        </label>
        <div className="pp-co">
          <input
            id="pp-co"
            className="input"
            autoComplete="off"
            placeholder="A company on Merlin, or type its name"
            value={q}
            onChange={(e) => (setQ(e.target.value), picked?.c.hidden || setPick(null))}
          />
          {picked && (
            <p className="pp-co-picked">
              <IconCheck /> {picked.c.hidden ? "A locked company on Merlin. Type its name: it stays on your proposal only." : `On Merlin: its facts fill in.`}
            </p>
          )}
          {matches.length > 0 && (
            <ul className="pp-co-list" role="listbox" aria-label="Companies on Merlin">
              {matches.map((i) => (
                <li key={i.c.id}>
                  <button type="button" role="option" aria-selected={false} onClick={() => (setPick(i.c.id), setQ(i.c.name))}>
                    <b>{i.c.name}</b>
                    <span>{[i.c.cells.industry, i.c.cells.revenue].map((c) => (c?.s === "value" ? String(c.v) : "")).filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="pp-label">Start from</p>
        <div className="pp-tpls" role="radiogroup" aria-label="Template">
          {[...TEMPLATES.map((t) => ({ id: t.id, title: t.title, best: t.bestFor, stage: t.stageBand })), { id: "blank", title: "A blank page", best: "A cover, what you heard, the recommendation, the investment, next steps and the signature.", stage: "" }].map((t) => {
            const open = t.id === "blank" || data.templatesOpen.includes(t.id);
            return (
              <button key={t.id} type="button" role="radio" aria-checked={tpl === t.id} className="pp-tpl" data-on={tpl === t.id} disabled={!open} onClick={() => setTpl(t.id)}>
                <span className="pp-tpl-t">
                  {t.title}
                  {!open && <span className="bl-tag bl-tag-lock">Pro</span>}
                </span>
                <span className="pp-tpl-b">{t.best}</span>
                {t.stage && <span className="pp-tpl-s">{t.stage}</span>}
              </button>
            );
          })}
        </div>
        {!data.canSend && <p className="pp-help">Every template, and sending for signature, are on Pro + Close: ${PRICES.closeMonth} a month.</p>}
      </div>
    </Sheet>
  );
}

/* ================= the editor ================= */

type Save = "saved" | "saving" | "error";

function Editor({
  initial,
  data,
  view,
  onSaved,
  onBack,
  onGone,
  onOpen,
}: {
  initial: ProposalRec;
  data: ProposalsView;
  view: View;
  onSaved: (p: ProposalRec) => void;
  onBack: () => void;
  onGone: (id: string) => void;
  onOpen: (p: ProposalRec) => void;
}) {
  const toast = useToast();
  const phone = useMedia("(max-width: 1023px)");
  const [p, setP] = useState(initial);
  const [save, setSave] = useState<Save>("saved");
  const [changing, setChanging] = useState(false);
  // A signed proposal opens as it reads: it can't change.
  const [preview, setPreview] = useState(initial.status === "signed");
  const [sending, setSending] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(p);
  latest.current = p;
  const pending = useRef<Record<string, unknown>>({});

  const signed = p.status === "signed";
  const out = p.status === "sent" || p.status === "viewed";
  const readOnly = signed || (out && !changing);
  const fields = useMemo(() => docFields(p), [p]);
  const checks = useMemo(() => checklist({ ...p, fields }), [p, fields]);
  const advice = useMemo(() => adviceFromView(view, p), [view, p]);
  const flags = useMemo(() => riskFlags(p, advice.suggestion?.high ?? null), [p, advice]);
  const blanks = useMemo(() => blanksOf(p.blocks, fields), [p.blocks, fields]);
  const okN = checks.filter((c) => c.ok).length;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current), (timer.current = null);
    const body = pending.current;
    if (!Object.keys(body).length) return;
    pending.current = {};
    setSave("saving");
    const r = await api<ProposalRec>({ op: "update", id: latest.current.id, ...body });
    if (r.error) return setSave("error"), toast(r.error, true);
    setSave("saved");
    // The server's copy wins for status and version (a change after sending makes a new version).
    setP((cur) => ({ ...cur, version: r.version, status: r.status, send: r.send, history: r.history, updatedAt: r.updatedAt }));
    if (r.version !== latest.current.version) setChanging(false);
    onSaved(r);
  }, [onSaved, toast]);
  useEffect(() => () => void flush(), [flush]);
  const change = (patch: Partial<ProposalRec>, send: Record<string, unknown>) => {
    if (readOnly) return;
    setP((cur) => ({ ...cur, ...patch }));
    pending.current = { ...pending.current, ...send };
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  };
  const setBlocks = (blocks: ProposalBlock[]) => change({ blocks }, { blocks });
  const setFields = (f: Record<string, string>, sources?: Record<string, string>) => change({ fields: f, ...(sources ? { sources } : {}) }, { fields: f });
  const setField = (k: string, v: string) => {
    const f = { ...p.fields };
    if (v.trim()) f[k] = v;
    else delete f[k];
    setFields(f, { ...p.sources, [k]: "manual" });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= p.blocks.length || from === to) return;
    const b = [...p.blocks];
    const [x] = b.splice(from, 1);
    b.splice(to, 0, x);
    setBlocks(b);
  };
  const accept = (s: { key: string; text: string }) => {
    const r = acceptInto(p.fields, p.notes, s.key, s.text, new Date().toISOString());
    const target = DISCOVERY_TARGET[s.key];
    change({ fields: r.fields, notes: r.notes, sources: target ? { ...p.sources, [target]: "discovery" } : p.sources }, { fields: r.fields, notes: r.notes });
  };
  const setNotes = (notes: DiscoveryNote[]) => change({ notes }, { notes });
  const setSignerOnCall = (v: boolean | null) => change({ signerOnCall: v }, { signerOnCall: v });
  const setSigner = (s: SignerInfo | null) => change({ signer: s }, { signer: s });

  // Drag and drop, desktop.
  const drag = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const dnd = (i: number) =>
    phone || readOnly
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            if (drag.current === null) return;
            e.preventDefault();
            setOver(i);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (drag.current !== null) move(drag.current, i);
            drag.current = null;
            setOver(null);
          },
        };

  const addable = BLOCKS.filter((b) => !p.blocks.some((x) => x.blockId === b.id));
  const t = templateDef(p.templateId);

  const act = async (op: "void" | "duplicate" | "delete") => {
    if (op === "delete" && !window.confirm("Delete this proposal? It can't be undone.")) return;
    if (op === "void" && !window.confirm(`Void it? The link ${p.send?.signer.name ?? "they"} has stops working.`)) return;
    await flush();
    const r = await api<ProposalRec & { ok?: boolean }>({ op, id: p.id });
    if (r.error) return toast(r.error, true);
    if (op === "delete") return toast("Deleted."), onGone(p.id);
    if (op === "duplicate") return toast("A copy to work on."), onOpen(r);
    setP(r), onSaved(r), toast("Voided. The link stopped working.");
  };

  const side = (
    <aside className="pp-side" aria-label="Checklist and helpers">
      <section className="pp-card pp-check" aria-labelledby="pp-ch-h">
        <h2 className="pp-h2" id="pp-ch-h">
          What winning proposals do <span className="pp-count">{okN} of {checks.length}</span>
        </h2>
        <ul className="pp-checks">
          {checks.map((c) => (
            <li key={c.id} data-ok={c.ok} data-soft={!!c.soft}>
              <span className="pp-mark" aria-hidden>
                {c.ok ? <IconCheck size={12} /> : c.soft ? "!" : ""}
              </span>
              <span>
                <b>{c.label}</b>
                {c.missing && <span className="pp-miss">{c.missing}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {flags.length > 0 && (
        <section className="pp-card pp-flags" aria-labelledby="pp-fl-h">
          <h2 className="pp-h2" id="pp-fl-h">
            Before you send
          </h2>
          <ul>
            {flags.map((f) => (
              <li key={f.id}>{f.message}</li>
            ))}
          </ul>
        </section>
      )}
      <SignerCard p={p} readOnly={readOnly} onSigner={setSigner} onOnCall={setSignerOnCall} />
      <CallPanel memberName={data.me.name} readOnly={readOnly} notes={p.notes} onAccept={accept} onNotes={setNotes} onOnCall={(v) => p.signerOnCall === null && setSignerOnCall(v)} />
    </aside>
  );

  return (
    <div className="tp-page pp-page pp-editing">
      <button type="button" className="tp-back" onClick={() => (void flush(), onBack())}>
        <IconChevron dir="left" /> All proposals
      </button>
      <header className="pp-top">
        <div className="pp-top-main">
          <textarea className="pp-title" rows={1} aria-label="Proposal title" value={p.title} readOnly={readOnly} maxLength={160} onChange={(e) => { const v = e.target.value.replace(/\s*\n\s*/g, " "); change({ title: v }, { title: v }); }} />
          <p className="pp-top-s">
            <span className={`chip ${STATUS[p.status].cls}`}>{STATUS[p.status].say}</span>
            <span>
              {p.company.name || "No company yet"} · Version {p.version}
              {t ? ` · ${t.title.split(":")[0]}` : ""}
            </span>
            <span className="pp-save" aria-live="polite">
              {save === "saving" ? "Saving" : save === "error" ? "Not saved" : readOnly ? "" : "Saved"}
            </span>
          </p>
        </div>
        <div className="pp-top-act">
          <button type="button" className="btn" aria-pressed={preview} onClick={() => setPreview((x) => !x)}>
            {preview ? "Edit" : "Preview"}
          </button>
          {!signed && !out && (
            <button type="button" className="btn btn-primary" onClick={() => (void flush(), setSending(true))}>
              Send for signature
            </button>
          )}
          {out && (
            <button type="button" className="btn" onClick={() => act("void")}>
              Void
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => act("duplicate")}>
            Duplicate
          </button>
          {!signed && (
            <button type="button" className="btn btn-ghost" onClick={() => act("delete")}>
              Delete
            </button>
          )}
        </div>
      </header>

      {p.send && <SendStatus p={p} />}
      {out && !changing && (
        <div className="pp-banner" role="status">
          <p>
            This version is out for signature, so it&#39;s read-only. Changing it makes version {p.version + 1}, and the link {p.send?.signer.name} has stops working.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => setChanging(true)}>
            Change it
          </button>
        </div>
      )}
      {signed && (
        <div className="pp-banner pp-banner-won" role="status">
          <p>Signed, so it&#39;s kept as it was signed. Duplicate it to start the next one, an addendum or a new term.</p>
        </div>
      )}

      <div className="pp-edit">
        {phone && (
          <details className="pp-card pp-phone-sum">
            <summary>
              <span>
                Checklist <span className="pp-count">{okN} of {checks.length}</span>
                {flags.length > 0 && <span className="pp-count pp-count-warn">{flags.length} to check</span>}
              </span>
              <IconChevron />
            </summary>
            {side}
          </details>
        )}
        <div className="pp-blocks">
          {preview ? (
            <article className="pp-card pp-preview sg-doc" aria-label="Preview">
              {blanks.length > 0 && <p className="pp-help">Blanks are marked. They need filling before it can go out.</p>}
              <DocBlocks blocks={rendered(p.blocks, fields)} blanks />
            </article>
          ) : (
            <>
              {p.blocks.map((b, i) => (
                <BlockCard
                  key={b.id}
                  b={b}
                  i={i}
                  n={p.blocks.length}
                  p={p}
                  fields={fields}
                  readOnly={readOnly}
                  phone={phone}
                  open={focus === b.id}
                  onOpen={() => setFocus((f) => (f === b.id ? null : b.id))}
                  over={over === i}
                  dnd={dnd(i)}
                  onDragStart={() => (drag.current = i)}
                  onDragEnd={() => ((drag.current = null), setOver(null))}
                  onMove={(to) => move(i, to)}
                  onRemove={() => setBlocks(p.blocks.filter((x) => x.id !== b.id))}
                  onBlock={(nb) => setBlocks(p.blocks.map((x) => (x.id === b.id ? nb : x)))}
                  onField={setField}
                  advice={b.blockId === "investment" ? advice : null}
                />
              ))}
              {!readOnly && <AddBlock addable={addable} onAdd={(id) => setBlocks([...p.blocks, makeBlock(id)])} />}
            </>
          )}
        </div>
        {!phone && side}
      </div>

      {sending && (
        <SendSheet
          p={p}
          canSend={data.canSend}
          email={data.email}
          blanks={blanks}
          missing={checks.filter((c) => !c.ok && !c.soft).map((c) => c.label)}
          flags={flags.map((f) => f.message)}
          onClose={() => setSending(false)}
          onSent={(r, message) => (setP(r), onSaved(r), setSending(false), setChanging(false), toast(message))}
        />
      )}
    </div>
  );
}

/* ---------- one block ---------- */

function BlockCard({
  b,
  i,
  n,
  p,
  fields,
  readOnly,
  phone,
  open,
  onOpen,
  over,
  dnd,
  onDragStart,
  onDragEnd,
  onMove,
  onRemove,
  onBlock,
  onField,
  advice,
}: {
  b: ProposalBlock;
  i: number;
  n: number;
  p: ProposalRec;
  fields: Record<string, string>;
  readOnly: boolean;
  phone: boolean;
  open: boolean;
  onOpen: () => void;
  over: boolean;
  dnd: Record<string, unknown>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onBlock: (b: ProposalBlock) => void;
  onField: (k: string, v: string) => void;
  advice: ReturnType<typeof adviceFromView> | null;
}) {
  const def = blockDef(b.blockId);
  const g = guidanceFor(b.blockId, p.templateId);
  // The version is the proposal's own (it counts up on each new version), not a field to type.
  const fl = blockFields(b).filter((f) => f.key !== "proposal.version");
  const required = templateDef(p.templateId)?.blocks.find((x) => x.blockId === b.blockId)?.required;
  const left = fl.filter((f) => !fields[f.key]?.trim()).length;
  const guide = (def || g) && (
    <div className="pp-guide">
      {def?.purpose && <p className="pp-purpose">{def.purpose}</p>}
      {g?.guidance && <p>{g.guidance}</p>}
      {def && def.goodLooksLike.length > 0 && (
        <>
          <h4>What good looks like</h4>
          <ul className="pp-good">
            {def.goodLooksLike.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {def && def.commonMistakes.length > 0 && (
        <>
          <h4>Common mistakes</h4>
          <ul className="pp-bad">
            {def.commonMistakes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {g && g.exampleText.length > 0 && (
        <>
          <h4>Examples</h4>
          {g.exampleText.map((x) => (
            <p key={x} className="pp-example">
              {x}
            </p>
          ))}
        </>
      )}
    </div>
  );
  return (
    <section className="pp-card pp-block" data-over={over} aria-label={b.title} {...dnd}>
      <div className="pp-block-head">
        {!phone && !readOnly && (
          <span className="pp-grip" draggable onDragStart={(e) => (e.dataTransfer.setData("text/plain", b.id), (e.dataTransfer.effectAllowed = "move"), onDragStart())} onDragEnd={onDragEnd} title="Drag to move" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />))}
            </svg>
          </span>
        )}
        <input className="pp-block-t" aria-label="Block title" value={b.title} readOnly={readOnly} maxLength={120} onChange={(e) => onBlock({ ...b, title: e.target.value })} />
        {required === false && <span className="pp-opt">Optional</span>}
        {left > 0 && <span className="pp-left">{left} to fill</span>}
        {!readOnly && (
          <span className="pp-block-act">
            <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Move ${b.title} up`} disabled={i === 0} onClick={() => onMove(i - 1)}>
              <IconChevron dir="up" />
            </button>
            <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Move ${b.title} down`} disabled={i === n - 1} onClick={() => onMove(i + 1)}>
              <IconChevron dir="down" />
            </button>
            <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Remove ${b.title}`} onClick={onRemove}>
              <IconX size={14} />
            </button>
          </span>
        )}
      </div>
      <div className="pp-block-grid">
        <div className="pp-block-main">
          <AutoText className="pp-body" label={`${b.title} text`} value={b.body} readOnly={readOnly} onChange={(v) => onBlock({ ...b, body: v })} />
          {fl.length > 0 && (
            <div className="pp-fields">
              {fl.map((f) => {
                const multi = f.type === "list" || f.type === "table" || (fields[f.key] ?? "").includes("\n");
                const src = SOURCE[p.sources[f.key] ?? ""] ?? "";
                return (
                  <label key={f.key} className="pp-field" data-empty={!fields[f.key]?.trim()}>
                    <span className="pp-field-l">
                      {f.label}
                      {src && <span className="pp-src">{src}</span>}
                      {multi && <span className="pp-muted"> · one a line</span>}
                    </span>
                    {multi ? (
                      <AutoText className="pp-field-in" label={f.label} value={p.fields[f.key] ?? ""} readOnly={readOnly} onChange={(v) => onField(f.key, v)} small />
                    ) : (
                      <input className="input pp-field-in" value={p.fields[f.key] ?? ""} placeholder={fields[f.key] && !p.fields[f.key] ? fields[f.key] : ""} readOnly={readOnly} onChange={(e) => onField(f.key, e.target.value)} />
                    )}
                  </label>
                );
              })}
            </div>
          )}
          {advice && <RatePanel advice={advice} fn={advice.suggestion?.fn ?? null} />}
        </div>
        {phone ? (
          guide && (
            <div className="pp-guide-wrap">
              <button type="button" className="tp-flink pp-guide-go" aria-expanded={open} onClick={onOpen}>
                {open ? "Hide guidance" : "What good looks like"}
              </button>
              {open && guide}
            </div>
          )
        ) : (
          guide
        )}
      </div>
    </section>
  );
}

function AutoText({ value, onChange, readOnly, className, label, small }: { value: string; onChange: (v: string) => void; readOnly: boolean; className: string; label: string; small?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(small ? 40 : 96, el.scrollHeight + 2)}px`;
  }, [value, small]);
  return <textarea ref={ref} className={`input ${className}`} aria-label={label} value={value} readOnly={readOnly} rows={small ? 2 : 4} onChange={(e) => onChange(e.target.value)} />;
}

function AddBlock({ addable, onAdd }: { addable: { id: string; title: string; purpose: string }[]; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pp-add">
      <button type="button" className="btn pp-wide" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        <IconPlus /> Add a block
      </button>
      {open && (
        <ul className="pp-add-list">
          {[...addable, { id: "custom", title: "Your own section", purpose: "Anything the library doesn't have." }].map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => (onAdd(b.id), setOpen(false))}>
                <b>{b.title}</b>
                <span>{b.purpose}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- rates ---------- */

function RatePanel({ advice, fn }: { advice: ReturnType<typeof adviceFromView>; fn: string | null }) {
  const s = advice.suggestion;
  return (
    <div className="pp-rates" aria-label="Pricing">
      <h4>What to charge</h4>
      {s ? (
        <>
          <p className="pp-rate-big">
            Fractional {s.fn} leaders {s.scope === "sized" && s.band ? `at ${s.band} companies` : "at companies of every size"} were paid <b>{s.says}</b>.
          </p>
          {s.sits && <p className="pp-rate-sits">{s.sits}</p>}
          {s.own && (
            <p className="pp-muted">
              Your own rate on file: ${s.own.amount.toLocaleString("en-US")} {s.own.kind === "hourly" ? "an hour" : "a month"}. Only you see it.
            </p>
          )}
          {advice.hoursAtYourRate !== null && <p className="pp-muted">At your hourly rate, this fee covers about {advice.hoursAtYourRate} hours a month.</p>}
          {s.limited && <p className="pp-muted">Free shows the median for every size. Pro adds the range by client size.</p>}
        </>
      ) : (
        <p className="pp-muted">{fn ? "No figure for your function yet." : "Set your function in your profile to see what fractionals in it were paid."}</p>
      )}
      <h4>How to price it</h4>
      <ul className="pp-good">
        {advice.shape.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {advice.template && <p className="pp-muted">What this template&#39;s wins charged: {advice.template}</p>}
    </div>
  );
}

/* ---------- who signs ---------- */

function SignerCard({ p, readOnly, onSigner, onOnCall }: { p: ProposalRec; readOnly: boolean; onSigner: (s: SignerInfo | null) => void; onOnCall: (v: boolean | null) => void }) {
  const [s, setS] = useState({ name: p.signer?.name ?? "", email: p.signer?.email ?? "", title: p.signer?.title ?? "" });
  const commit = (next = s) => {
    const ok = next.name.trim() && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(next.email.trim());
    if (ok) onSigner({ name: next.name.trim(), email: next.email.trim(), ...(next.title.trim() ? { title: next.title.trim() } : {}) });
    else if (!next.name.trim() && !next.email.trim() && p.signer) onSigner(null);
  };
  return (
    <section className="pp-card pp-signer" aria-labelledby="pp-sg-h">
      <h2 className="pp-h2" id="pp-sg-h">
        Who signs
      </h2>
      <p className="pp-help">Send it to the person who owns the budget. Proposals that went through a go-between lost more often.</p>
      {(["name", "title", "email"] as const).map((k) => (
        <label key={k} className="pp-field">
          <span className="pp-field-l">{k === "name" ? "Name" : k === "title" ? "Title" : "Email"}</span>
          <input className="input" type={k === "email" ? "email" : "text"} value={s[k]} readOnly={readOnly} autoComplete="off" onChange={(e) => setS({ ...s, [k]: e.target.value })} onBlur={() => commit()} />
        </label>
      ))}
      <div className="pp-oncall">
        <span>Were they on the call?</span>
        {([true, false] as const).map((v) => (
          <button key={String(v)} type="button" className={`chip${p.signerOnCall === v ? " chip-on" : ""}`} aria-pressed={p.signerOnCall === v} disabled={readOnly} onClick={() => onOnCall(p.signerOnCall === v ? null : v)}>
            {v ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- from the call ---------- */

function CallPanel({ memberName, readOnly, notes, onAccept, onNotes, onOnCall }: { memberName: string; readOnly: boolean; notes: DiscoveryNote[]; onAccept: (s: Suggestion) => void; onNotes: (n: DiscoveryNote[]) => void; onOnCall: (v: boolean) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [ex, setEx] = useState<Extraction | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [drop, setDrop] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const read = (raw: string) => {
    const r = extract(raw, memberName);
    setEx(r);
    setDone(new Set());
    // The transcript itself isn't kept, here or anywhere: only the suggestions while they're on screen.
    setText("");
    if (r.signerOnCall !== null) onOnCall(r.signerOnCall);
    if (!r.suggestions.length) toast("Nothing to suggest from that. Try the full transcript, with who said what.", true);
  };
  const file = (f: File | undefined) => {
    if (!f) return;
    if (!transcriptOk(f.name)) return toast("That file type doesn't read here. Use .txt, .vtt, .srt or .md.", true);
    if (f.size > 2_000_000) return toast("That file is over 2 MB. Paste the part that matters.", true);
    void f.text().then(read);
  };
  const groups = useMemo(() => {
    const m = new Map<string, Suggestion[]>();
    for (const s of ex?.suggestions ?? []) m.set(s.key, [...(m.get(s.key) ?? []), s]);
    return [...m.entries()];
  }, [ex]);
  const id = (s: Suggestion) => `${s.key}|${s.text}`;
  return (
    <section className="pp-card pp-call" aria-labelledby="pp-cl-h">
      <h2 className="pp-h2" id="pp-cl-h">
        From your call
      </h2>
      {!readOnly && !ex && (
        <>
          <div
            className="pp-drop"
            data-on={drop}
            onDragOver={(e) => (e.preventDefault(), setDrop(true))}
            onDragLeave={() => setDrop(false)}
            onDrop={(e) => (e.preventDefault(), setDrop(false), file(e.dataTransfer.files?.[0]))}
          >
            <textarea className="input pp-paste" aria-label="Paste a transcript or notes" placeholder="Paste the transcript or your notes, or drop a .txt, .vtt, .srt or .md file here" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
            <div className="pp-btns">
              <button type="button" className="btn btn-pine btn-sm" disabled={!text.trim()} onClick={() => read(text)}>
                Find what matters
              </button>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                Choose a file
              </button>
              <input ref={fileRef} type="file" accept=".txt,.vtt,.srt,.md,text/plain,text/vtt,text/markdown" hidden onChange={(e) => (file(e.target.files?.[0]), (e.target.value = ""))} />
            </div>
          </div>
          <p className="pp-help">Read in this browser: the transcript isn&#39;t uploaded or kept. Only the lines you use are saved with this proposal.</p>
        </>
      )}
      {ex && (
        <div className="pp-sugs">
          <p className="pp-help">
            {ex.suggestions.length} suggestions from {ex.speakers.length ? ex.speakers.join(", ") : "the call"}. The transcript isn&#39;t kept. Use what&#39;s right, in your words: a proposal gets forwarded.
          </p>
          {ex.signerOnCall === false && <p className="pp-warn">The person who signs wasn&#39;t on the call{ex.signerWhy ? `: "${ex.signerWhy}"` : "."}</p>}
          {!ex.suggestions.some((s) => s.key === "budget.signals") && <p className="pp-warn">No budget signal on the call. Ask for a range before you send.</p>}
          {groups.map(([key, list]) => (
            <div key={key} className="pp-sg">
              <h4>
                {DISCOVERY_LABELS[key] ?? key}
                {DISCOVERY_TARGET[key] === null && <span className="pp-muted"> · a note for you</span>}
              </h4>
              <ul>
                {list.map((s) => (
                  <li key={id(s)} data-done={done.has(id(s))}>
                    <p>{s.text}</p>
                    <span className="pp-sg-meta">
                      {s.speaker ?? "Unnamed"} · {s.why}
                    </span>
                    {done.has(id(s)) ? (
                      <span className="pp-sg-used">
                        <IconCheck size={12} /> Used
                      </span>
                    ) : (
                      <span className="pp-btns">
                        <button type="button" className="btn btn-sm btn-pine" onClick={() => (onAccept(s), setDone(new Set(done).add(id(s))))}>
                          {DISCOVERY_TARGET[key] ? "Use" : "Keep"}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDone(new Set(done).add(id(s)))}>
                          Skip
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="tp-flink" onClick={() => setEx(null)}>
            Done with these
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <div className="pp-notes">
          <h4>Kept from your calls · only you see these</h4>
          <ul>
            {notes.map((n, i) => (
              <li key={`${n.at}${i}`}>
                <span className="pp-note-k">{DISCOVERY_LABELS[n.key] ?? n.key}</span> {n.text}
                {!readOnly && (
                  <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label="Remove this note" onClick={() => onNotes(notes.filter((_, j) => j !== i))}>
                    <IconX size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------- sending ---------- */

function SendSheet({
  p,
  canSend,
  email,
  blanks,
  missing,
  flags,
  onClose,
  onSent,
}: {
  p: ProposalRec;
  canSend: boolean;
  email: boolean;
  blanks: string[];
  missing: string[];
  flags: string[];
  onClose: () => void;
  onSent: (p: ProposalRec, message: string) => void;
}) {
  const [s, setS] = useState({ name: p.signer?.name ?? "", email: p.signer?.email ?? "", title: p.signer?.title ?? "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = s.name.trim() && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.email.trim()) && blanks.length === 0 && canSend && email;
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await api<{ proposal: ProposalRec; message: string }>({ op: "send", id: p.id, signer: { name: s.name.trim(), email: s.email.trim(), title: s.title.trim() }, message: note });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onSent(r.proposal, r.message);
  };
  return (
    <Sheet
      title="Send for signature"
      onClose={onClose}
      dialog
      className="pp-send"
      footer={
        canSend ? (
          <button type="button" className="btn btn-primary btn-lg pp-wide" aria-busy={busy} disabled={!ok || busy} onClick={go}>
            {busy ? "Sending" : `Send to ${s.name.trim().split(" ")[0] || "the signer"}`}
          </button>
        ) : (
          <button type="button" className="btn btn-pine btn-lg pp-wide" onClick={() => openPlans("proposals")}>
            See Pro + Close: ${PRICES.closeMonth} a month
          </button>
        )
      }
    >
      <div className="pp-send-body">
        {!canSend && <p className="pp-warn">{PRO_SEND}</p>}
        {!email && canSend && <p className="pp-warn">Email isn&#39;t set up on Merlin yet, so a proposal can&#39;t go out for signature.</p>}
        <p className="pp-help">They get an email from you with a link (no account needed). They confirm their email with a code, agree to sign electronically and type their name. You both get the signed copy with its audit trail.</p>
        <p className="pp-help">{SENDER_DUTY}</p>
        {(["name", "title", "email"] as const).map((k) => (
          <label key={k} className="pp-field">
            <span className="pp-field-l">{k === "name" ? "The person who signs" : k === "title" ? "Their title" : "Their email"}</span>
            <input className="input" type={k === "email" ? "email" : "text"} value={s[k]} autoComplete="off" onChange={(e) => setS({ ...s, [k]: e.target.value })} />
          </label>
        ))}
        <label className="pp-field">
          <span className="pp-field-l">A note above the link (optional)</span>
          <textarea className="input pp-note" rows={2} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Great talking today. Here's the plan we discussed." />
        </label>
        {blanks.length > 0 && (
          <p className="pp-warn">
            {blanks.length === 1 ? "1 blank" : `${blanks.length} blanks`} to fill first: {blanks.slice(0, 4).join(", ")}
            {blanks.length > 4 ? " and more" : ""}.
          </p>
        )}
        {missing.length > 0 && <p className="pp-help">Still missing from the checklist: {missing.join("; ")}.</p>}
        {flags.length > 0 && (
          <ul className="pp-flaglist">
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {p.status !== "draft" && <p className="pp-help">This goes out as version {p.version + 1}. Earlier links stop working.</p>}
        {err && <p className="pp-err">{err}</p>}
      </div>
    </Sheet>
  );
}

function SendStatus({ p }: { p: ProposalRec }) {
  const x = p.send!;
  const line =
    x.status === "signed"
      ? `Signed by ${x.signedName} on ${dayOf(x.signedAt)}.`
      : x.status === "declined"
        ? `${x.signer.name} declined on ${dayOf(x.declinedAt)}${x.declineReason ? `: "${x.declineReason}"` : "."}`
        : x.status === "void"
          ? `Withdrawn on ${dayOf(x.voidedAt)}. Send it again to make a new version.`
          : x.status === "expired"
            ? `The link expired on ${dayOf(x.expiresAt)}. Send it again for a new one.`
            : x.status === "viewed"
              ? `${x.signer.name} opened it on ${dayOf(x.viewedAt)}. Waiting for their signature.`
              : `Sent to ${x.signer.name} (${x.signer.email}) on ${dayOf(x.sentAt)}. The link works until ${dayOf(x.expiresAt)}.`;
  return (
    <section className="pp-card pp-status" data-status={x.status} aria-label="Signature status">
      <div className="pp-status-row">
        <p className="pp-status-l">{line}</p>
        {x.copyUrl && (
          <a className="btn btn-pine btn-sm" href={x.copyUrl} target="_blank" rel="noreferrer">
            Open the signed copy
          </a>
        )}
      </div>
      <details className="pp-trail">
        <summary>Audit trail</summary>
        <ol>
          {x.events.map((e, i) => (
            <li key={i}>
              <span className="pp-muted">{stamp(e.at)}</span> {EVENT_SAY[e.kind] ?? e.kind}
              {e.note ? `: ${e.note}` : ""}
              {e.ip ? <span className="pp-muted"> · {e.ip}</span> : null}
            </li>
          ))}
        </ol>
        <p className="pp-muted">
          Document fingerprint (SHA-256): <span className="sg-hash">{x.hash}</span>
        </p>
      </details>
    </section>
  );
}
