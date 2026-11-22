"use client";

/**
 * Proposals (?p=proposals, under Yours): the member's proposals and the documents they send to
 * sign, in one list with their status (Draft, Sent, Viewed, Signed, Declined, Voided), and the
 * way to make each.
 *
 * The page opens with one action, "New proposal from a call" (ProposalStart.tsx): the company,
 * the transcript or notes, a template (theirs or ours), Draft. "Send a contract to sign" opens Contracts
 * (contracts/ContractsHome.tsx): drop a PDF, Merlin places the fields, review, send. "My templates" holds the past
 * proposals the member uploaded.
 *
 * A proposal opens as the client will read it, one document: tap a section to edit its text and
 * fill its blanks in place. What winning proposals do and the risk flags fold into one line ("3
 * things to fix"). The sections' order, adding one, who signs, what to charge and the lines kept
 * from the call are in the side menu (a sheet on phones). Changes save as they are made. A change
 * after sending makes a new version (the server voids the old link), so a sent proposal opens
 * read-only until the member says to change it.
 *
 * Building is Close (ProposalsView.canBuild; the trial is Close). After the trial, without it,
 * the page lists what they made, read only, with the Close prompt (CloseBuildPrompt): New
 * proposal and My templates' upload open the plans, and their saved templates stay listed, kept
 * for when they upgrade.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { View } from "@/lib/tableTypes";
import type { DiscoveryNote, ProposalBlock, ProposalRec, ProposalsView, SignerInfo, TemplateChoice } from "@/lib/proposals/types";
import type { DocumentRec } from "@/lib/documents/types";
import { BLOCKS, DISCOVERY_TARGET, acceptInto, blanksOf, blockDef, blockFields, checklist, docFields, fieldLabel, fill, guidanceFor, makeBlock, riskFlags, templateDef } from "@/lib/proposals/library";
import { adviceFromView } from "@/lib/proposals/rates";
import { PRICES } from "@/lib/billing/rules";
import { IconCheck, IconChevron, IconPencil, IconPlus, IconX, useToast, errorText } from "../ui/shared";
import { Prop } from "../ui/fractions/art";
import { EmptyState, PageHead } from "../ui/system";
import { Problem } from "../ui/Problem";
import { Sheet } from "./ui";
import { useMedia } from "./hooks";
import { openPlans } from "./Billing";
import { DocText, dayOf } from "../sign/doc";
import type { CoInfo } from "./model";
import { startDone, startProposal, takeWantCompany } from "./WriteProposal";
import { StartSheet, TEMPLATE_ACCEPT, uploadTemplate } from "./ProposalStart";
import { AddBlock, AutoText, CallPanel, ProposalStatus, RatePanel, SendSheet, SendStatus, SignerCard, api } from "./ProposalParts";
import { DocBuilder } from "./DocBuilder";
import { ContractsHome } from "./contracts/ContractsHome";
import { ChangeItPanel, VersionsSheet } from "./ChangeIt";
import { withChange, type ChangeProposal } from "@/lib/proposals/changeShape";
import { LinkCompany } from "./ProposalLink";
import { ActivityPanel, takeItem, useOpenItem } from "./Activity";
import { fixesFor } from "./proposalFixes";
import { okToLeave as leaveOk, useLeaveGuard } from "./leaveGuard";
import { PricingEditor } from "./PricingEditor";
import { GranolaCallPicker } from "./GranolaCallPicker";
import { useGranola } from "./granolaClient";
import "../sign/sign.css";
import { TeamBlockOffer } from "./PeerSheets";
import "./proposals.css";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
/** The upgrade prompt where building is refused (lib/proposals/mine.ts CLOSE_BUILD says the same). */
export const CLOSE_BUILD_WORDS = `Building proposals in Merlin is on Close: $${PRICES.closeMonth} a month, or $${PRICES.closeYear} a year. Your proposals and saved templates are kept, and come back when you upgrade.`;

/** The Close prompt where building is refused: the plan tag, the words, See the Close plan. */
export function CloseBuildPrompt({ compact }: { compact?: boolean }) {
  return (
    <div className="pp-free" data-plan="free" data-close-build role="status">
      <span className="bl-tag bl-tag-lock">Close</span>
      <p>{compact ? CLOSE_BUILD_WORDS.split(". Your")[0] + "." : CLOSE_BUILD_WORDS}</p>
      <button type="button" className="btn btn-sm" onClick={() => openPlans("proposals")}>
        See the Close plan
      </button>
    </div>
  );
}

async function load(): Promise<ProposalsView | { error: string }> {
  try {
    const r = await fetch("/api/proposals", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: errorText(r.status, j.error, "Proposals didn't load. Try again.") };
  } catch {
    return { error: NETWORK };
  }
}

type Row = { kind: "proposal"; p: ProposalRec; at: string } | { kind: "document"; d: DocumentRec; at: string };

/** A screen above the Proposals list, as its address says it. */
type Sub = { pr?: string; dc?: string; new?: boolean; ct?: boolean };
const SUB_KEYS = ["pr", "dc", "new", "ct"] as const;
const isSub = (x: Sub) => !!(x.pr || x.dc || x.new || x.ct);
const subNow = (): Sub => {
  const q = new URLSearchParams(window.location.search);
  if (q.get("p") !== "proposals") return {};
  return { pr: q.get("pr") ?? undefined, dc: q.get("dc") ?? undefined, new: q.get("new") === "1", ct: q.get("ct") === "1" };
};
/** This address with the screen's key in place of any other's (the rest of the address stays). */
const subUrl = (x: Sub): string => {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search);
  for (const k of SUB_KEYS) q.delete(k);
  q.set("p", "proposals");
  if (x.pr) q.set("pr", x.pr);
  else if (x.dc) q.set("dc", x.dc);
  else if (x.new) q.set("new", "1");
  else if (x.ct) q.set("ct", "1");
  return `${window.location.pathname}?${q.toString()}`;
};

/* ================= the page ================= */

export function ProposalsPage({ view, infos }: { view: View; infos: CoInfo[] }) {
  const toast = useToast();
  const [data, setData] = useState<ProposalsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A proposal the address named (the connector's edit link), or the company "Write a proposal" was pressed on.
  const [openId, setOpenId] = useState<string | null>(() => takeItem("pr") ?? startProposal());
  const [openDoc, setOpenDoc] = useState<string | null>(() => takeItem("dc"));
  // The bell or Home opened one while Proposals was already open.
  useOpenItem(useCallback((x: { pr?: string; dc?: string }) => (x.pr ? (setOpenDoc(null), setOpenId(x.pr)) : (setOpenId(null), setOpenDoc(x.dc ?? null))), []));
  const [starting, setStarting] = useState<{ companyId: string | null } | null>(() => {
    const c = takeWantCompany();
    return c ? { companyId: c } : typeof window !== "undefined" && subNow().new ? { companyId: null } : null;
  });
  const [fixFirst, setFixFirst] = useState<string[]>([]);
  const [templates, setTemplates] = useState(false);
  // "Send a document to sign": Contracts (contracts/ContractsHome.tsx), and a line for the field placer when it opens from there.
  const [contract, setContract] = useState(() => typeof window !== "undefined" && subNow().ct === true);
  const [docNotice, setDocNotice] = useState<string | null>(null);
  // Granola's status (granolaClient.ts), read once a page load: the start sheet's "From Granola" shows only while it is on.
  const granola = useGranola();
  const reload = useCallback(async () => {
    const r = await load();
    if ("error" in r) setError(r.error);
    else setData(r), setError(null);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const put = useCallback((p: ProposalRec) => setData((d) => (d ? { ...d, proposals: [p, ...d.proposals.filter((x) => x.id !== p.id)] } : d)), []);
  const putDoc = useCallback((x: DocumentRec) => setData((d) => (d ? { ...d, documents: [x, ...d.documents.filter((y) => y.id !== x.id)] } : d)), []);
  const open = data?.proposals.find((p) => p.id === openId) ?? null;
  const doc = data?.documents.find((x) => x.id === openDoc) ?? null;
  useEffect(() => {
    if (data) startDone();
  }, [data]);
  // A link to a proposal or document that isn't there (deleted, or not this member's): said, and the list instead.
  useEffect(() => {
    if (!data) return;
    if (openId && !open) toast("That proposal isn't there anymore. Here are your proposals.", true), setOpenId(null);
    if (openDoc && !doc) toast("That document isn't there anymore. Here are your proposals.", true), setOpenDoc(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, openId, openDoc]);

  /*
   * Each screen here has its own address (?p=proposals&pr=<id>, &dc=<id>, &new=1 for a proposal
   * from a call, &ct=1 for Contracts), so a reload reopens it and Back returns to the list. Leaving
   * one with work not saved asks first (leaveGuard.ts).
   */
  const sub: Sub = open ? { pr: open.id } : doc ? { dc: doc.id } : starting && data?.canBuild ? { new: true } : contract ? { ct: true } : {};
  const subKey = subUrl(sub);
  const wasSub = useRef(false);
  useEffect(() => {
    if (!data) return;
    const here = `${window.location.pathname}${window.location.search}`;
    const deeper = isSub(sub);
    try {
      const st = window.history.state ?? {};
      if (subKey !== here) {
        if (deeper && !st.prSub) window.history.pushState({ ...st, prSub: true }, "", subKey);
        else if (!deeper && st.prSub) window.history.back();
        else window.history.replaceState(st, "", subKey);
      } else if (deeper && !st.prSub) {
        // Opened straight from a link or a reload: the list goes under it, so Back returns to the list.
        window.setTimeout(() => {
          try {
            const now = window.history.state ?? {};
            if (now.prSub || subUrl(subNow()) !== subKey) return;
            window.history.replaceState(now, "", subUrl({}));
            window.history.pushState({ ...now, prSub: true }, "", subKey);
          } catch {}
        }, 0);
      }
    } catch {}
    // Back on the list from a screen above it: keyboard focus on the list's heading.
    if (!deeper && wasSub.current)
      window.requestAnimationFrame(() => {
        const h = document.querySelector<HTMLElement>(".pp-page h1");
        if (h) (h.tabIndex = -1), h.focus({ preventScroll: true });
      });
    wasSub.current = deeper;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subKey, !!data]);
  // Back and Forward: the address says which screen. Leaving one with work not saved asks first, and stays when they say no.
  useEffect(() => {
    const onPop = () => {
      const want = subNow();
      if (subUrl(want) === subUrl(subRef.current)) return;
      if (!leaveOk()) {
        try {
          window.history.pushState({ ...(window.history.state ?? {}), prSub: true }, "", subUrl(subRef.current));
        } catch {}
        return;
      }
      setOpenId(want.pr ?? null);
      setOpenDoc(want.pr ? null : want.dc ?? null);
      setStarting(want.new ? { companyId: null } : null);
      setContract(!!want.ct);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const subRef = useRef(sub);
  subRef.current = sub;
  // Esc on a screen here: never while typing in a field; else one step up, to the list (asking first when there is work to lose).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !isSub(subRef.current)) return;
      e.preventDefault();
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!leaveOk()) return;
      setOpenId(null), setOpenDoc(null), setStarting(null), setContract(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);


  if (open && data)
    return (
      <Editor
        key={open.id}
        initial={open}
        data={data}
        view={view}
        toFix={fixFirst}
        onSaved={put}
        onBack={() => (setOpenId(null), setFixFirst([]))}
        onGone={(id) => (setData((d) => (d ? { ...d, proposals: d.proposals.filter((x) => x.id !== id) } : d)), setOpenId(null))}
        onOpen={(p) => (put(p), setOpenId(p.id))}
      />
    );
  if (doc && data)
    return (
      <DocBuilder
        key={doc.id}
        notice={docNotice}
        initial={doc}
        data={data}
        infos={infos}
        onSaved={putDoc}
        onBack={() => (setOpenDoc(null), setDocNotice(null))}
        onGone={(id) => (setData((d) => (d ? { ...d, documents: d.documents.filter((x) => x.id !== id) } : d)), setOpenDoc(null))}
        onOpen={(x) => (putDoc(x), setOpenDoc(x.id))}
      />
    );
  if (starting && data && data.canBuild)
    return (
      <StartSheet
        view={view}
        data={data}
        infos={infos}
        companyId={starting.companyId}
        onClose={() => setStarting(null)}
        onTemplate={(t) => setData((d) => (d ? { ...d, templates: [t, ...d.templates] } : d))}
        onMade={(p, toFix) => (put(p), setStarting(null), setFixFirst(toFix ?? []), setOpenId(p.id))}
        // From Granola (GranolaCallPicker.tsx): only while Granola is switched on for Merlin (RN_GRANOLA). Off, there is no Granola card and paste or drop works as before.
        granolaFirst={!!granola.status?.connected}
        granolaSlot={
          granola.status?.on
            ? (o) => (
                <GranolaCallPicker
                  companyId={o.companyId}
                  email={o.signerEmail}
                  companyName={o.companyName}
                  pickedId={o.pickedId}
                  onPick={(c) => o.onPick({ transcript: c.text, attendees: c.attendees.map((a) => ({ name: a.name || undefined, email: a.email || undefined })), noteId: c.noteId, when: c.when })}
                  onPaste={o.onPaste}
                />
              )
            : undefined
        }
      />
    );
  if (contract && data)
    return (
      <ContractsHome
        data={data}
        onBack={() => setContract(false)}
        onSaved={putDoc}
        onManual={(x, notice) => (putDoc(x), setDocNotice(notice ?? null), setContract(false), setOpenDoc(x.id))}
        onOpenDoc={(x) => (putDoc(x), setDocNotice(null), setContract(false), setOpenDoc(x.id))}
      />
    );

  const rows: Row[] = data
    ? [...data.proposals.map((p) => ({ kind: "proposal" as const, p, at: p.updatedAt })), ...data.documents.map((d) => ({ kind: "document" as const, d, at: d.updatedAt }))].sort((a, b) => b.at.localeCompare(a.at))
    : [];
  const mine = data?.templates.filter((t) => t.mine) ?? [];

  return (
    <div className="page-wide pp-page">
      <PageHead
        title="Proposals"
        lead="Drop in the call, pick a template, and Merlin drafts it in your words with the price and the next 90 days. Send it for signature, and your pipeline moves."
        art={<Prop name="ledger" height={72} on="bg" />}
        actions={
          <button type="button" className="btn btn-pine btn-lg pp-hero-go" onClick={() => (data && !data.canBuild ? openPlans("proposals") : setStarting({ companyId: null }))} disabled={!data}>
            <IconPlus /> New proposal from a call
          </button>
        }
      />
      <div className="pp-hero">
        <div className="pp-hero-more">
          <button type="button" className="tp-flink" disabled={!data} onClick={() => setContract(true)}>
            Send a contract to sign
          </button>
          <span aria-hidden>·</span>
          <button type="button" className="tp-flink" disabled={!data} onClick={() => setTemplates(true)}>
            My templates{mine.length ? ` (${mine.length})` : ""}
          </button>
        </div>
      </div>
      {data && !data.canBuild && <CloseBuildPrompt />}
      {/* Nothing here yet: the page says it didn't load, in plain words, with Try again. Later errors keep the list and say so above it. */}
      {error && !data && (
        <Problem title="Proposals didn't load" onRetry={() => void reload()} reload={false} on="bg">
          {error}
        </Problem>
      )}
      {error && data && (
        <p className="pp-err" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <div className="pp-skel" aria-busy="true" />}
      {data && rows.length === 0 && (
        <EmptyState spot="noMessages" title="Nothing sent yet">
          Proposals sent within 48 hours of the call win more often. Start from the call while it&#39;s fresh.
        </EmptyState>
      )}
      {rows.length > 0 && (
        <ul className="pp-list" aria-label="Proposals and documents">
          {rows.map((r) =>
            r.kind === "proposal" ? (
              <li key={r.p.id}>
                <button type="button" className="pp-row" onClick={() => setOpenId(r.p.id)}>
                  <span className="pp-row-main">
                    <span className="pp-row-t">{r.p.title}</span>
                    <span className="pp-row-s">
                      Proposal · {r.p.company.name || "No company yet"} · {r.p.send?.signer ? `${r.p.send.signer.name} · ` : ""}
                      {r.p.status === "draft" ? `Edited ${dayOf(r.p.updatedAt)}` : r.p.status === "signed" ? `Signed ${dayOf(r.p.send?.memberMode === "after" ? r.p.send?.memberSignedAt : r.p.send?.signedAt)}` : r.p.status === "client_signed" ? `Client signed ${dayOf(r.p.send?.signedAt)}` : `Sent ${dayOf(r.p.send?.sentAt)}`}
                    </span>
                  </span>
                  <ProposalStatus status={r.p.status} />
                </button>
              </li>
            ) : (
              <li key={r.d.id}>
                <button type="button" className="pp-row" onClick={() => setOpenDoc(r.d.id)}>
                  <span className="pp-row-main">
                    <span className="pp-row-t">{r.d.title}</span>
                    <span className="pp-row-s">
                      Document · {r.d.company.name || r.d.fileName}
                      {r.d.signers.length ? ` · ${r.d.signers.filter((x) => x.status === "signed").length} of ${r.d.signers.length} signed` : ""} ·{" "}
                      {r.d.status === "draft" ? `Edited ${dayOf(r.d.updatedAt)}` : r.d.status === "signed" ? `Signed ${dayOf(r.d.completedAt)}` : `Sent ${dayOf(r.d.sentAt)}`}
                    </span>
                  </span>
                  <ProposalStatus status={r.d.status} />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {templates && data && <TemplatesSheet data={data} onClose={() => setTemplates(false)} onChange={(t) => setData((d) => (d ? { ...d, templates: t } : d))} />}
    </div>
  );
}

/* ================= My templates ================= */

function TemplatesSheet({ data, onClose, onChange }: { data: ProposalsView; onClose: () => void; onChange: (t: TemplateChoice[]) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const mine = data.templates.filter((t) => t.mine);
  const add = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const r = await uploadTemplate(f);
    setBusy(false);
    if (r.error || !r.id) return toast(r.error ?? "That file didn't read.", true);
    onChange([{ id: r.id, title: r.title ?? f.name, about: f.name, mine: true, open: true, sections: r.blocks?.length ?? 0 }, ...data.templates]);
    toast(`Added ${r.title}.`);
  };
  const remove = async (t: TemplateChoice) => {
    if (!window.confirm(`Delete ${t.title}? Proposals you made from it stay.`)) return;
    const r = await api<{ ok: boolean }>({ op: "template_delete", id: t.id });
    if (r.error) return toast(r.error, true);
    onChange(data.templates.filter((x) => x.id !== t.id));
  };
  return (
    <Sheet
      title="My templates"
      onClose={onClose}
      dialog
      className="pp-start"
      footer={
        data.canBuild ? (
          <button type="button" className="btn btn-pine btn-lg pp-wide" aria-busy={busy} disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? "Reading it" : "Upload a past proposal or SOW"}
          </button>
        ) : (
          <button type="button" className="btn btn-pine btn-lg pp-wide" onClick={() => openPlans("proposals")}>
            See the Close plan
          </button>
        )
      }
    >
      <div className="pp-start-body">
        {!data.canBuild && <CloseBuildPrompt compact />}
        <p className="pp-help">A .docx, .pdf, .md or .txt you wrote before. Merlin reads its headings and text into sections, and drafts new ones in its structure and your words. Only you see it. The file itself isn&#39;t kept.</p>
        <input ref={ref} type="file" accept={TEMPLATE_ACCEPT} hidden onChange={(e) => (void add(e.target.files?.[0]), (e.target.value = ""))} />
        {mine.length === 0 ? (
          <p className="pp-muted">None yet. Merlin&#39;s own templates, from proposals that won, are always there.</p>
        ) : (
          <ul className="pp-mine">
            {mine.map((t) => (
              <li key={t.id}>
                <span>
                  <b>{t.title}</b>
                  <span className="pp-muted">
                    {t.about} · {t.sections} sections
                  </span>
                </span>
                <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Delete ${t.title}`} onClick={() => void remove(t)}>
                  <IconX size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/* ================= the editor: the document as the client reads it ================= */

type Save = "saved" | "saving" | "retrying" | "error";

/** An edit that didn't reach the server yet, kept on this device until it does (the editor saves it when the proposal opens again). */
const stashKey = (id: string) => `rn-proposal-unsaved:${id}`;
const readStash = (id: string): { rev: number; body: Record<string, unknown> } | null => {
  try {
    const j = JSON.parse(window.localStorage.getItem(stashKey(id)) ?? "null");
    return j && typeof j.rev === "number" && j.body && typeof j.body === "object" ? j : null;
  } catch {
    return null;
  }
};
const writeStash = (id: string, v: { rev: number; body: Record<string, unknown> } | null) => {
  try {
    if (v && Object.keys(v.body).length) window.localStorage.setItem(stashKey(id), JSON.stringify(v));
    else window.localStorage.removeItem(stashKey(id));
  } catch {}
};
/** The proposal as the server has it now, or null. */
async function latestOf(id: string): Promise<ProposalRec | null> {
  try {
    const r = await fetch(`/api/proposals?id=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } });
    return r.ok ? ((await r.json()) as ProposalRec) : null;
  } catch {
    return null;
  }
}
/**
 * What a change the server refused said, as text the member can copy and add again. Only what this
 * tab changed from the version it was editing (`base`) and that differs from the latest (`now`):
 * sections it never touched are left out, so copying back can't undo another tab's edit.
 */
function unsavedText(body: Record<string, unknown>, now: ProposalRec, base: ProposalRec): string {
  const out: string[] = [];
  if (typeof body.title === "string" && body.title !== now.title && body.title !== base.title) out.push(`Title: ${body.title}`);
  if (Array.isArray(body.blocks))
    for (const b of body.blocks as ProposalBlock[]) {
      const had = base.blocks.find((x) => x.id === b.id);
      if (had && had.body === b.body && had.title === b.title) continue;
      const was = now.blocks.find((x) => x.id === b.id);
      if (!was || was.body !== b.body || was.title !== b.title) out.push(`${b.title}\n${b.body}`);
    }
  if (body.fields && typeof body.fields === "object")
    for (const [k, v] of Object.entries(body.fields as Record<string, string>)) if (now.fields[k] !== v && base.fields[k] !== v && v) out.push(`${fieldLabel(k)}: ${v}`);
  return out.join("\n\n");
}

function Editor({
  initial,
  data,
  view,
  toFix,
  onSaved,
  onBack,
  onGone,
  onOpen,
}: {
  initial: ProposalRec;
  data: ProposalsView;
  view: View;
  toFix: string[];
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
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  // Change it by talking (ChangeIt.tsx): a change shown before it's accepted, the one just saved, and Compare versions.
  const [preview, setPreview] = useState<ChangeProposal | null>(null);
  const [savedChange, setSavedChange] = useState<{ version: number; previous: number; changed: number } | null>(null);
  const [compare, setCompare] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(p);
  latest.current = p;
  const pending = useRef<Record<string, unknown>>({});
  // The revision the next save is made on: a save from a tab that is behind is refused (409), never written over another tab's edit.
  const rev = useRef(initial.rev);
  const inflight = useRef(false);
  const tries = useRef(0);
  const retryAt = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Changed in another tab or window: the latest is loaded, and what didn't save is offered to copy.
  const [conflict, setConflict] = useState<{ text: string } | null>(null);
  /** A whole proposal from the server: shown, and its revision is the one the next save is made on. */
  const take = useCallback((r: ProposalRec) => {
    rev.current = r.rev;
    setP(r);
  }, []);

  const signed = p.status === "signed" || p.status === "client_signed";
  const out = p.status === "sent" || p.status === "viewed";
  // Without Close (after the trial) a proposal opens read only, with the prompt.
  const locked = !data.canBuild;
  const readOnly = signed || (out && !changing) || locked;
  const fields = useMemo(() => docFields(p), [p]);
  // With a change shown, the document reads as it would after it (the changed sections marked) and can't be edited until it's accepted or undone.
  const shown = useMemo(() => (preview ? withChange(p, preview.changes, preview.fields) : null), [p, preview]);
  const shownFields = useMemo(() => (shown ? docFields({ ...p, fields: shown.fields }) : fields), [shown, p, fields]);
  const marked = useMemo(() => new Set(preview ? [...preview.changes.map((c) => c.id), ...(shown ? shown.blocks.filter((b) => b.id.startsWith("nw")).map((b) => b.id) : [])] : []), [preview, shown]);
  const changeIt = (
    <ChangeItPanel
      p={p}
      data={data}
      readOnly={readOnly}
      preview={preview}
      saved={savedChange}
      onPreview={(c) => (void flush(), setPreview(c), setSavedChange(null))}
      onAccepted={(r, sv) => (take(r), onSaved(r), setPreview(null), setSavedChange(sv))}
    />
  );
  const checks = useMemo(() => checklist({ ...p, fields }), [p, fields]);
  const advice = useMemo(() => adviceFromView(view, p), [view, p]);
  const flags = useMemo(() => riskFlags(p, advice.suggestion?.high ?? null), [p, advice]);
  const blanks = useMemo(() => blanksOf(p.blocks, fields), [p.blocks, fields]);
  // The one line: what's missing from the patterns that won (musts first), the risk flags, and what the draft said to check.
  // The same list, counted the same way, as the draft's "Draft ready" screen (proposalFixes.ts).
  const fixes = useMemo(() => fixesFor(p, view, toFix), [p, view, toFix]);

  /**
   * Save what changed. The change stays pending until the server has it: on a dropped connection
   * (or a server that didn't answer) it is put back and tried again, sooner then later, and kept on
   * this device in case the member leaves first. Changed elsewhere since (409): the latest loads,
   * and what didn't save is offered to copy.
   */
  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current), (timer.current = null);
    if (retryAt.current) clearTimeout(retryAt.current), (retryAt.current = null);
    if (inflight.current) return;
    const body = pending.current;
    if (!Object.keys(body).length) return;
    pending.current = {};
    inflight.current = true;
    setSave("saving");
    const id = latest.current.id;
    const r = await api<ProposalRec>({ op: "update", id, rev: rev.current, ...body });
    inflight.current = false;
    if (r.error) {
      if (r.httpStatus === 409) {
        const fresh = await latestOf(id);
        if (!fresh) {
          // The latest didn't load either: keep the change and try again.
          pending.current = { ...body, ...pending.current };
          return void (setSave("retrying"), (retryAt.current = setTimeout(() => void flush(), 4000)));
        }
        const text = unsavedText(body, fresh, latest.current);
        pending.current = {};
        writeStash(id, null);
        take(fresh);
        onSaved(fresh);
        setEditing(null);
        setConflict({ text });
        return void setSave("saved");
      }
      if (r.httpStatus === 0 || r.httpStatus === 429 || (r.httpStatus ?? 0) >= 500) {
        // Not reached the server: put back (newer edits on top), kept on this device, tried again with a growing wait.
        pending.current = { ...body, ...pending.current };
        writeStash(id, { rev: rev.current, body: pending.current });
        tries.current++;
        setSave("retrying");
        retryAt.current = setTimeout(() => void flush(), Math.min(30_000, 1000 * 2 ** Math.min(tries.current, 5)));
        return;
      }
      setSave("error");
      return void toast(r.error, true);
    }
    tries.current = 0;
    rev.current = r.rev;
    writeStash(id, Object.keys(pending.current).length ? { rev: r.rev, body: pending.current } : null);
    setSave(Object.keys(pending.current).length ? "saving" : "saved");
    setP((cur) => ({ ...cur, version: r.version, status: r.status, send: r.send, history: r.history, updatedAt: r.updatedAt, rev: r.rev }));
    if (r.version !== latest.current.version) setChanging(false);
    onSaved(r);
    // Typed while that save was on its way: saved next.
    if (Object.keys(pending.current).length) void flush();
  }, [onSaved, toast, take]);
  // Leaving the editor: one last save, and what is still unsaved stays on this device for next time.
  useEffect(
    () => () => {
      const id = latest.current.id;
      if (Object.keys(pending.current).length) writeStash(id, { rev: rev.current, body: pending.current });
      void flush();
    },
    [flush],
  );
  // Back online: what waits is sent at once. Closing the tab with something unsaved: the browser asks first.
  useEffect(() => {
    const online = () => void flush();
    const leave = (e: BeforeUnloadEvent) => {
      if (previewRef.current) return void (e.preventDefault(), (e.returnValue = ""));
      if (!Object.keys(pending.current).length && !inflight.current) return;
      writeStash(latest.current.id, { rev: rev.current, body: pending.current });
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", leave);
    return () => (window.removeEventListener("online", online), window.removeEventListener("beforeunload", leave));
  }, [flush]);
  // Opened again with an edit that never reached the server (a dropped connection, a closed tab): shown, and saved now.
  useEffect(() => {
    const st = readStash(initial.id);
    if (!st || initial.status !== "draft") return void writeStash(initial.id, null);
    const keep = Object.fromEntries(Object.entries(st.body).filter(([k]) => ["title", "blocks", "fields", "notes", "signer", "signerOnCall", "pricing"].includes(k)));
    if (!Object.keys(keep).length) return;
    setP((cur) => ({ ...cur, ...(keep as Partial<ProposalRec>) }));
    rev.current = st.rev;
    pending.current = keep;
    toast("Merlin is saving the edit you made before the connection dropped.");
    void flush();
    // Once, as the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Something still unsaved, in words, before the member leaves the proposal; true to go on. */
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const okToLeave = () =>
    (!Object.keys(pending.current).length || window.confirm("Your last edit isn't saved yet. Merlin keeps it on this device and saves it when you open the proposal again. Leave now?")) &&
    // A change from Change it that wasn't accepted isn't kept: said before it goes.
    (!previewRef.current || window.confirm("The change Merlin suggested isn't saved. Leave without it?"));
  useLeaveGuard(okToLeave);
  const change = (patch: Partial<ProposalRec>, send: Record<string, unknown>) => {
    if (readOnly) return;
    setP((cur) => ({ ...cur, ...patch }));
    pending.current = { ...pending.current, ...send };
    if (save !== "retrying") setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  };
  const setBlocks = (blocks: ProposalBlock[]) => change({ blocks }, { blocks });
  const setField = (k: string, v: string) => {
    const f = { ...p.fields };
    if (v.trim()) f[k] = v;
    else delete f[k];
    change({ fields: f, sources: { ...p.sources, [k]: "manual" } }, { fields: f });
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

  const act = async (op: "void" | "duplicate" | "delete") => {
    if (op === "delete" && !window.confirm("Delete this proposal? It can't be undone.")) return;
    if (op === "void" && !window.confirm(`Void it? The link ${p.send?.signer.name ?? "they"} has stops working.`)) return;
    await flush();
    const r = await api<ProposalRec & { ok?: boolean }>({ op, id: p.id });
    if (r.error) return toast(r.error, true);
    if (op === "delete") return toast("Deleted."), onGone(p.id);
    if (op === "duplicate") return toast("A copy to work on."), onOpen(r);
    take(r), onSaved(r), toast("Voided. The link stopped working.");
  };

  const t = templateDef(p.templateId);
  const addable = BLOCKS.filter((b) => !p.blocks.some((x) => x.blockId === b.id));
  const focused = p.blocks.find((b) => b.id === editing) ?? null;

  const side = (
    <aside className="pp-side" aria-label="Sections and tools">
      {!phone && changeIt}
      <section className="pp-card pp-outline" aria-labelledby="pp-ol-h">
        <h2 className="pp-h2" id="pp-ol-h">
          Sections
        </h2>
        <ol className="pp-ol">
          {p.blocks.map((b, i) => (
            <li key={b.id} data-on={editing === b.id}>
              <button type="button" className="pp-ol-go" onClick={() => (setEditing(readOnly ? null : b.id), setMenu(false), document.getElementById(`sec-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }))}>
                {b.title}
              </button>
              {!readOnly && (
                <span className="pp-block-act">
                  <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Move ${b.title} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <IconChevron dir="up" />
                  </button>
                  <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Move ${b.title} down`} disabled={i === p.blocks.length - 1} onClick={() => move(i, i + 1)}>
                    <IconChevron dir="down" />
                  </button>
                  <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Remove ${b.title}`} onClick={() => setBlocks(p.blocks.filter((x) => x.id !== b.id))}>
                    <IconX size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
        {!readOnly && (
          <AddBlock
            addable={addable}
            onAdd={(id) => {
              const nb = makeBlock(id);
              setBlocks([...p.blocks, nb]);
              setEditing(nb.id);
              setMenu(false);
            }}
          />
        )}
      </section>
      {focused && <Guide b={focused} templateId={p.templateId} />}
      <SignerCard p={p} readOnly={readOnly} onSigner={setSigner} onOnCall={setSignerOnCall} />
      <section className="pp-card">
        <RatePanel advice={advice} fn={advice.suggestion?.fn ?? null} />
      </section>
      <CallPanel memberName={data.me.name} readOnly={readOnly} notes={p.notes} onAccept={accept} onNotes={setNotes} onOnCall={(v) => p.signerOnCall === null && setSignerOnCall(v)} />
    </aside>
  );

  return (
    <div className="page-wide pp-page pp-editing">
      <button type="button" className="page-back" onClick={() => okToLeave() && (void flush(), onBack())}>
        <IconChevron dir="left" /> All proposals
      </button>
      <header className="pp-top">
        <div className="pp-top-main">
          <textarea
            className="pp-title"
            rows={1}
            aria-label="Proposal title"
            value={p.title}
            readOnly={readOnly}
            maxLength={160}
            onChange={(e) => {
              const v = e.target.value.replace(/\s*\n\s*/g, " ");
              change({ title: v }, { title: v });
            }}
          />
          <p className="pp-top-s">
            <ProposalStatus status={p.status} />
            <span>
              {p.company.name || "No company yet"} · Version {p.version}
              {t ? ` · ${t.title.split(":")[0]}` : ""}
            </span>
            {!!p.versions?.length && (
              <button type="button" className="tp-flink" onClick={() => setCompare(true)}>
                Compare versions
              </button>
            )}
            <span className="pp-save" aria-live="polite">
              {save === "saving" ? "Saving" : save === "retrying" ? "Not saved, retrying" : save === "error" ? "Not saved" : readOnly ? "" : "Saved"}
            </span>
          </p>
        </div>
        <div className="pp-top-act">
          {phone && (
            <button type="button" className="btn" onClick={() => setMenu(true)}>
              Sections
            </button>
          )}
          {!signed && !out && !locked && (
            <button type="button" className="btn btn-pine" onClick={() => (void flush(), setSending(true))}>
              Send for signature
            </button>
          )}
          {out && (
            <button type="button" className="btn" onClick={() => act("void")}>
              Void
            </button>
          )}
          <details className="pp-more">
            <summary className="btn btn-ghost" aria-label="More">
              More
            </summary>
            <div className="pp-more-menu">
              {!locked && (
                <button type="button" onClick={() => act("duplicate")}>
                  Duplicate
                </button>
              )}
              {!signed && (
                <button type="button" onClick={() => act("delete")}>
                  Delete
                </button>
              )}
            </div>
          </details>
        </div>
      </header>

      {conflict && (
        <div className="pp-banner pp-conflict" role="alert">
          <p>
            <strong>This proposal changed in another tab or window.</strong> Merlin loaded the latest.{conflict.text ? " Your last edit didn't save. Copy it, then add it where it goes." : ""}
          </p>
          {conflict.text && (
            <>
              <textarea className="input pp-conflict-text" readOnly rows={Math.min(8, conflict.text.split("\n").length + 1)} value={conflict.text} aria-label="Your edit that didn't save" />
              <button type="button" className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(conflict.text).then(() => toast("Copied."), () => toast("Select the text and copy it.", true))}>
                Copy my edit
              </button>
            </>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConflict(null)}>
            Done
          </button>
        </div>
      )}
      {p.send && <SendStatus p={p} onChange={(r) => (take(r), onSaved(r))} />}
      {/* Who opened it, what they read, when to follow up, the reminders and the renewal (Activity.tsx, lib/close). It reloads whenever the proposal changes: a countersignature, a void. */}
      {p.send && <ActivityPanel kind="proposal" id={p.id} version={`${p.version}:${p.rev}:${p.status}`} onOpen={onOpen} />}
      {/* Not linked to a company on Merlin: the pipeline can't move when they sign, so the member picks it (ProposalLink.tsx). */}
      {!p.company.id && <LinkCompany p={p} onLinked={(r) => ((rev.current = r.rev), setP((cur) => ({ ...cur, company: r.company, rev: r.rev })), onSaved(r))} />}
      {locked && <CloseBuildPrompt />}
      {out && !changing && !locked && (
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
      {savedChange && (
        <div className="pp-banner" role="status">
          <p>
            <strong>
              {savedChange.changed} {savedChange.changed === 1 ? "change" : "changes"} saved as version {savedChange.version}.
            </strong>{" "}
            Version {savedChange.previous} is kept if you want it back.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => setCompare(true)}>
            Compare versions
          </button>
        </div>
      )}
      {/* Before it goes out only: once sent (and not being changed) there is nothing to fix before sending. */}
      {!signed && (!out || changing) && <FixLine fixes={fixes} blanks={blanks.length} />}
      {phone && changeIt}

      <div className="pp-edit">
        <article className="pp-card pp-docview sg-doc" aria-label="The proposal as the client reads it">
          {(shown?.blocks ?? p.blocks).map((b) => (
            <Section key={b.id} b={b} fields={shownFields} p={p} readOnly={readOnly || !!preview} mark={marked.has(b.id)} editing={editing === b.id} onEdit={() => setEditing(b.id)} onDone={() => setEditing(null)} onBlock={(nb) => setBlocks(p.blocks.map((x) => (x.id === b.id ? nb : x)))} onField={setField} />
          ))}
          {/* Close: options and add-ons the client picks from (PricingEditor.tsx). */}
          {(data.canBuild || p.pricing) && <PricingEditor value={p.pricing} readOnly={readOnly} onChange={(pricing) => change({ pricing }, { pricing })} />}
          {/* Peers: a team pursuing this company together can add its "Your team" section (PeerSheets.tsx). */}
          {!readOnly && <TeamBlockOffer company={p.company.id} has={p.blocks.some((b) => b.title === "Your team")} onAdd={(b) => setBlocks([...p.blocks, b])} />}
          {!readOnly && (
            <button
              type="button"
              className="pp-addsec"
              onClick={() => {
                const nb = makeBlock("custom");
                setBlocks([...p.blocks, nb]);
                setEditing(nb.id);
              }}
            >
              <IconPlus /> Add a section
            </button>
          )}
        </article>
        {!phone && side}
      </div>
      {phone && menu && (
        <Sheet title="Sections and tools" onClose={() => setMenu(false)} full className="pp-menu-sheet">
          {side}
        </Sheet>
      )}

      {compare && <VersionsSheet p={p} onClose={() => setCompare(false)} onRestored={(r) => (take(r), onSaved(r), setCompare(false), setSavedChange(null), toast(`Brought back as version ${r.version}.`))} />}
      {sending && (
        <SendSheet
          p={p}
          canSend={data.canSend}
          email={data.email}
          blanks={blanks}
          missing={checks.filter((c) => !c.ok && !c.soft).map((c) => c.label)}
          flags={flags.map((f) => f.message)}
          onClose={() => setSending(false)}
          onSent={(r, message) => (take(r), onSaved(r), setSending(false), setChanging(false), toast(message))}
        />
      )}
    </div>
  );
}

/** "3 things to fix": one line that opens into the list. */
export function FixLine({ fixes, blanks }: { fixes: string[]; blanks: number }) {
  // The blanks are one item of the list ("15 blanks left to fill."): said first, by their own count, then the rest.
  const others = fixes.length - (blanks ? 1 : 0);
  const [open, setOpen] = useState(false);
  if (!fixes.length)
    return (
      <p className="pp-fixline" data-ok="true">
        <span className="pp-mark" aria-hidden>
          <IconCheck size={12} />
        </span>
        Ready to send. It does what winning proposals do.
      </p>
    );
  return (
    <div className="pp-fixline" data-open={open}>
      <button type="button" className="pp-fix-go" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        <span className="pp-fix-n">{blanks || fixes.length}</span>
        <span>
          {blanks
            ? `${blanks === 1 ? "blank" : "blanks"} to fill${others > 0 ? `, and ${others} more ${others === 1 ? "thing" : "things"} to fix` : ""} before you send`
            : `${fixes.length === 1 ? "thing" : "things"} to fix before you send`}
        </span>
        <IconChevron dir={open ? "up" : "down"} />
      </button>
      {open && (
        <ol className="pp-fixes">
          {fixes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One section of the document: as it reads, or open to edit in place. */
function Section({
  b,
  p,
  fields,
  readOnly,
  mark = false,
  editing,
  onEdit,
  onDone,
  onBlock,
  onField,
}: {
  b: ProposalBlock;
  p: ProposalRec;
  fields: Record<string, string>;
  readOnly: boolean;
  /** Changed by a change shown before it's accepted (ChangeIt.tsx): sand, with a "Changed" tag. */
  mark?: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onBlock: (b: ProposalBlock) => void;
  onField: (k: string, v: string) => void;
}) {
  const text = fill(b.body, fields);
  if (!editing || readOnly)
    return (
      <section id={`sec-${b.id}`} className="sg-block pp-sec" data-ro={readOnly} data-changed={mark || undefined}>
        {!readOnly ? (
          <button type="button" className="pp-sec-hit" aria-label={`Edit ${b.title}`} onClick={onEdit}>
            <h2 className="sg-block-h">
              {b.title}
              <span className="pp-sec-pen" aria-hidden>
                <IconPencil size={12} /> Edit
              </span>
            </h2>
            <div className="sg-text">
              <DocText text={text} blanks label={fieldLabel} />
            </div>
          </button>
        ) : (
          <>
            <h2 className="sg-block-h">
              {b.title}
              {mark && <span className="pp-changed">Changed</span>}
            </h2>
            <div className="sg-text">
              <DocText text={text} blanks label={fieldLabel} />
            </div>
          </>
        )}
      </section>
    );
  const fl = blockFields(b).filter((f) => f.key !== "proposal.version");
  const [wording, setWording] = useState(false);
  return (
    <section id={`sec-${b.id}`} className="sg-block pp-sec pp-sec-on" aria-label={`Editing ${b.title}`}>
      <input className="pp-sec-t" aria-label="Section title" value={b.title} maxLength={120} onChange={(e) => onBlock({ ...b, title: e.target.value })} autoFocus={b.blockId === "custom"} />
      {/* The wording itself, with its {{fields}}, only when asked for: the fields below are what most edits need. */}
      {(fl.length === 0 || wording) && <AutoText className="pp-body" label={`${b.title} text`} value={b.body} readOnly={false} onChange={(v) => onBlock({ ...b, body: v })} />}
      {fl.length > 0 && (
        <div className="pp-fields">
          <p className="pp-muted pp-fields-h">
            Fill in this section.{" "}
            <button type="button" className="tp-flink" aria-expanded={wording} onClick={() => setWording((x) => !x)}>
              {wording ? "Hide the wording" : "Edit the wording"}
            </button>
          </p>
          {fl.map((f) => {
            const multi = f.type === "list" || f.type === "table" || (fields[f.key] ?? "").includes("\n");
            return (
              <label key={f.key} className="pp-field" data-empty={!fields[f.key]?.trim()}>
                <span className="pp-field-l">
                  {f.label}
                  {multi && <span className="pp-muted"> · one a line</span>}
                </span>
                {multi ? (
                  <AutoText className="pp-field-in" label={f.label} value={p.fields[f.key] ?? ""} readOnly={false} onChange={(v) => onField(f.key, v)} small />
                ) : (
                  <input className="input pp-field-in" value={p.fields[f.key] ?? ""} placeholder={fields[f.key] && !p.fields[f.key] ? fields[f.key] : ""} onChange={(e) => onField(f.key, e.target.value)} />
                )}
              </label>
            );
          })}
        </div>
      )}
      <div className="pp-sec-foot">
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  );
}

/** The template's guidance for the section open: what it's for, what good looks like, mistakes, examples. */
function Guide({ b, templateId }: { b: ProposalBlock; templateId: string | null }) {
  const def = blockDef(b.blockId);
  const g = guidanceFor(b.blockId, templateId);
  if (!def && !g) return null;
  return (
    <section className="pp-card pp-guide" aria-label={`Guidance for ${b.title}`}>
      <h2 className="pp-h2">{b.title}: what good looks like</h2>
      {def?.purpose && <p className="pp-purpose">{def.purpose}</p>}
      {g?.guidance && <p>{g.guidance}</p>}
      {def && def.goodLooksLike.length > 0 && (
        <ul className="pp-good">
          {def.goodLooksLike.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
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
    </section>
  );
}
