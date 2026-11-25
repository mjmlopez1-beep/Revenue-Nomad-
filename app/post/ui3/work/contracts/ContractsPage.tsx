"use client";

/**
 * Contracts in the new design (RN_UI3; find-design/v5/work.html, Contracts). One list of everything
 * sent for signature, contracts and proposals together, on GET /api/contracts (RN_CONTRACTS2), each
 * row with one status and one visible action, and the rest in its "..." menu:
 *
 *   Awaiting you      Sign now (a proposal: countersign in Proposals)       rust: your move
 *   Awaiting <name>   Remind (at most once a day per signer)                cobalt: out with them
 *   Draft             Continue                                              gold: not sent yet
 *   Completed         Download                                              forest: done
 *   Declined, Expired, Canceled   Send again                                neutral
 *
 *   "..."   Open details, Copy their link (still asks for the emailed code), Download the signed PDF,
 *           Save as a template, Cancel (an email to each signer), Delete a draft.
 *
 * Send for signature is today's four steps (contracts/SendFlow.tsx); a contract's detail is today's
 * (contracts/DocDetail.tsx: signers, audit trail, reminders, reading activity). Free can prepare a
 * contract but not send it (canSend), said above the list. With RN_CONTRACTS2 off, today's Contracts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contracts2View, SignRow } from "@/lib/documents/contracts2";
import type { DocumentRec } from "@/lib/documents/types";
import { useToast } from "../../../../ui/shared";
import { takeOpenedWith, useApp } from "../../../shell/pages";
import { dapi } from "../../../DocBuilder";
import { SendFlow, type FlowInit } from "../../../contracts/SendFlow";
import { DocDetail, c2api, dayShort } from "../../../contracts/DocDetail";
import type { SendResult } from "../../../contracts/SendSheet";
import { onOpenContract, takeContract } from "../../../contracts/open";
import { openPlans } from "../../../Billing";
import { Band, Chips, CoMark, Empty, Failed, Gate, Skel, St, RowActs, WorkMain, useCoFinder, type MenuItem, type Tone } from "../parts";
import { WIc } from "../icons";
import "../../../contracts/contracts2.css";
import "./contracts.css";

type Filter = "all" | "you" | "others" | "done" | "drafts" | "ended";
const FILTERS: { k: Filter; label: string; has: (r: SignRow) => boolean }[] = [
  { k: "all", label: "All", has: () => true },
  { k: "you", label: "Awaiting you", has: (r) => r.status === "you" },
  { k: "others", label: "Awaiting others", has: (r) => r.status === "awaiting" },
  { k: "done", label: "Completed", has: (r) => r.status === "completed" },
  { k: "drafts", label: "Drafts", has: (r) => r.status === "draft" },
  { k: "ended", label: "Declined or expired", has: (r) => r.status === "declined" || r.status === "expired" || r.status === "canceled" },
];
const ACTION_SAY = { continue: "Continue", remind: "Remind", sign: "Sign now", download: "Download", again: "Send again" } as const;
const TONE: Record<SignRow["status"], Tone> = { you: "hot", awaiting: "co", draft: "gold", completed: "forest", declined: "", expired: "", canceled: "" };
/** The When column, in words. */
const whenOf = (r: SignRow) =>
  r.status === "draft" ? `Edited ${dayShort(r.at)}` : r.status === "completed" ? `Completed ${dayShort(r.at)}` : r.status === "you" ? `Signed ${dayShort(r.at)}, your turn` : r.status === "expired" ? `The link ended` : r.status === "awaiting" ? `Sent ${dayShort(r.sentAt ?? r.at)}` : dayShort(r.at);

type Screen = { k: "list" } | { k: "flow"; init: FlowInit } | { k: "detail"; id: string } | { k: "sent"; r: SendResult & { docId: string | null; kind: "contract" | "proposal" } };

async function loadView(): Promise<Contracts2View | { error: string } | { off: true }> {
  try {
    const r = await fetch("/api/contracts", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.on) return j;
    if (r.ok && j.on === false) return { off: true };
    return { error: j.error || "Contracts didn't load. Try again." };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

export function Ui3Contracts() {
  const c = useApp();
  const toast = useToast();
  const find = useCoFinder();
  const [view, setView] = useState<Contracts2View | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ k: "list" });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const v = await loadView();
    if ("off" in v) return setOff(true);
    if ("error" in v) return setError(v.error);
    setError(null);
    setView(v);
  }, []);
  const openDoc = useCallback(async (id: string) => {
    const r = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } }).catch(() => null);
    const d = r?.ok ? ((await r.json()) as DocumentRec) : null;
    if (!d) return setScreen({ k: "detail", id });
    setScreen(d.status === "draft" ? { k: "flow", init: { kind: "draft", doc: d } } : { k: "detail", id });
  }, []);
  useEffect(() => {
    void reload();
    const qs = new URLSearchParams(takeOpenedWith() || window.location.search);
    const want = takeContract() ?? qs.get("dc");
    if (want) void openDoc(want);
    else if (qs.get("new") === "1") setScreen({ k: "flow", init: { kind: "new" } });
    return onOpenContract((id) => (id ? void openDoc(id) : setScreen({ k: "list" })));
  }, [reload, openDoc]);
  // A screen above the list scrolls to its top.
  useEffect(() => {
    document.getElementById("tp-page")?.scrollTo?.({ top: 0 });
  }, [screen.k]);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.k === filter)!;
    const words = q.trim().toLowerCase();
    return (view?.rows ?? []).filter((r) => f.has(r) && (!words || `${r.title} ${r.with} ${r.company}`.toLowerCase().includes(words)));
  }, [view, filter, q]);

  const toList = () => (setScreen({ k: "list" }), void reload());
  const run = async <T,>(id: string, fn: () => Promise<T & { error?: string }>, ok: (x: T) => void) => {
    setBusy(id);
    const x = await fn();
    setBusy(null);
    if (x.error) return toast(x.error, true);
    ok(x);
  };
  const act = async (r: SignRow) => {
    if (r.kind === "proposal" && (r.action === "sign" || r.action === "again" || r.action === "continue")) return void (window.location.href = r.href!);
    if (r.action === "download" && r.download) return void window.open(r.download, "_blank", "noopener");
    if (r.action === "continue") return void openDoc(r.id);
    if (r.action === "remind") return run<{ message: string }>(r.id, () => c2api({ op: "remind", id: r.id }), (x) => (toast(x.message), void reload()));
    if (r.action === "sign") return run<{ link: string }>(r.id, () => dapi({ op: "mylink", id: r.id }), (x) => window.location.assign(x.link));
    if (r.action === "again") return run<DocumentRec>(r.id, () => dapi({ op: "copy", id: r.id }), (x) => setScreen({ k: "flow", init: { kind: "draft", doc: x } }));
  };
  const openRow = (r: SignRow) => (r.kind === "proposal" ? void (window.location.href = r.href!) : r.status === "draft" ? void openDoc(r.id) : setScreen({ k: "detail", id: r.id }));
  const menu = (r: SignRow): MenuItem[] => {
    const contract = r.kind === "contract";
    const live = r.status === "awaiting" || r.status === "you";
    return [
      { t: contract ? "Open details" : "Open in Proposals", icon: "eye", go: () => openRow(r) },
      ...(contract && r.status === "awaiting"
        ? [
            {
              t: "Copy their link",
              icon: "link" as const,
              go: () =>
                void run<{ link: string; name: string }>(r.id, () => c2api({ op: "link", id: r.id }), (x) => {
                  void navigator.clipboard?.writeText(x.link).catch(() => {});
                  toast(`Link copied. It still asks for the code we email ${x.name.split(" ")[0]}.`);
                }),
            },
          ]
        : []),
      ...(r.download ? [{ t: "Download the signed PDF", icon: "dl" as const, go: () => void window.open(r.download!, "_blank", "noopener") }] : []),
      ...(contract && r.status !== "draft" ? [{ t: "Save as a template", icon: "fields" as const, go: () => void run<{ name: string }>(r.id, () => dapi({ op: "save", id: r.id }), (x) => (toast(`Saved as "${x.name}" in your contracts.`), void reload())) }] : []),
      ...(contract && live
        ? [
            "-" as const,
            {
              t: "Cancel",
              icon: "x" as const,
              danger: true,
              go: () => window.confirm("Cancel it? The links stop working, and each signer gets a short email saying so.") && void run<{ message: string }>(r.id, () => c2api({ op: "cancel", id: r.id }), (x) => (toast(x.message ?? "Canceled."), void reload())),
            },
          ]
        : contract && r.status === "draft"
          ? ["-" as const, { t: "Delete draft", icon: "trash" as const, danger: true, go: () => window.confirm("Delete this draft? It can't be undone.") && void run(r.id, () => dapi({ op: "delete", id: r.id }), () => (toast("Draft deleted."), void reload())) }]
          : []),
    ];
  };

  const crumbs = screen.k === "list" ? [] : [{ label: "Contracts", href: c.hrefOf("contracts"), go: toList }];
  const title = screen.k === "flow" ? "Send for signature" : screen.k === "detail" ? "Contract" : screen.k === "sent" ? "Sent" : "Contracts";

  if (off) {
    // RN_CONTRACTS2 off: today's Contracts lives in Proposals' send flow. Say where everything is, and what the plan allows.
    const tier = c.me.plan?.tier ?? "free";
    return (
      <WorkMain group="Work" title="Contracts">
        <Band density="none" title="Contracts." sub="For now, everything you send for signature lives in Proposals: contracts and signed proposals are under Signed or closed there, with each signer, the audit trail and the signed PDF." />
        {tier === "free" && (
          <Gate title="Sending for signature is on Pro and Close" onPlans={() => openPlans("billing")}>
            You can prepare a contract now and send it after you upgrade. Merlin placing the fields and the automatic reminders are on Close.
          </Gate>
        )}
        {tier === "pro" && !c.me.plan?.canClose && <p className="w-help">Sending for signature is on your plan. Merlin placing the fields for you and the automatic reminders are on Close.</p>}
        <button type="button" className="m-btn m-btn-primary" onClick={() => c.openPage("proposals")}>
          Open Proposals
        </button>
      </WorkMain>
    );
  }

  return (
    <WorkMain group="Work" title={title} crumbs={crumbs} cls="w3-ct">
      {error && !view ? (
        <>
          <Band density="none" title="Contracts." />
          <Failed what="Contracts" error={error} retry={() => void reload()} />
        </>
      ) : !view ? (
        <>
          <Band density="none" title="Contracts." sub="Everything you send for signature, proposals too." />
          <Skel rows={5} />
        </>
      ) : screen.k === "flow" ? (
        <div className="w3-host w3-ct-flow">
          <SendFlow view={view} init={screen.init} phone={c.phone} toast={toast} onClose={toList} onSent={(r) => (setScreen({ k: "sent", r }), void reload())} />
        </div>
      ) : screen.k === "detail" ? (
        <div className="w3-host w3-ct-detail">
          <DocDetail id={screen.id} canClose={view.canClose} phone={c.phone} toast={toast} onBack={toList} onContinue={(d) => setScreen({ k: "flow", init: { kind: "draft", doc: d } })} onAgain={(d) => setScreen({ k: "flow", init: { kind: "draft", doc: d } })} />
        </div>
      ) : screen.k === "sent" ? (
        <section className="m-panel ct-sent" role="status">
          <span className="ok" aria-hidden="true">
            <WIc n="check" />
          </span>
          <h1 className="m-display m-h2">{screen.r.head}</h1>
          <p className="m-sub">{screen.r.order}</p>
          <p className="w-help">
            {screen.r.remind ? "Reminders on day 2 and day 7 until they sign. " : ""}
            {screen.r.days ? `The link works for ${screen.r.days} days.` : "The link has no end date."} You get an alert when it is opened.
          </p>
          <div className="w-row" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {screen.r.docId && (
              <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => setScreen({ k: "detail", id: (screen as { r: { docId: string } }).r.docId })}>
                Open the document
              </button>
            )}
            <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={toList}>
              Back to contracts
            </button>
          </div>
        </section>
      ) : (
        listEl()
      )}
    </WorkMain>
  );

  function listEl() {
    const v = view!;
    const yours = v.rows.filter((r) => r.status === "you").length;
    const others = v.rows.filter((r) => r.status === "awaiting").length;
    const counts = Object.fromEntries(FILTERS.map((f) => [f.k, v.rows.filter(f.has).length])) as Record<Filter, number>;
    const waits = [yours ? `${yours} waiting on you` : null, others ? `${others} waiting on ${others === 1 ? "a client" : "clients"}` : null].filter(Boolean).join(", ");
    const sub = `Everything you send for signature, proposals too.${waits ? ` ${waits[0].toUpperCase()}${waits.slice(1)}.` : ""}`;
    const send = (
      <div className="w-row" style={{ marginTop: 6 }}>
        <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={() => setScreen({ k: "flow", init: { kind: "new" } })}>
          <WIc n="send" /> Send for signature
        </button>
      </div>
    );
    return (
      <>
        <Band density="none" title="Contracts." sub={sub} extra={send} />
        {!v.canSend && (
          <Gate title="Sending for signature is on Pro and Close" onPlans={() => openPlans("billing")}>
            You can prepare a contract now and send it after you upgrade. Merlin placing the fields and the automatic reminders are on Close.
          </Gate>
        )}
        {v.canSend && !v.canClose && <p className="w-help ct3-plan">Sending for signature is on your plan. Merlin placing the fields for you and the automatic reminders are on Close.</p>}
        {!v.rows.length ? (
          <Empty
            title="Nothing sent for signature yet"
            act={
              <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={() => setScreen({ k: "flow", init: { kind: "new" } })}>
                <WIc n="send" /> Send for signature
              </button>
            }
          >
            Drop a PDF, pick who signs, place the fields and send. Merlin keeps the signed copy and its audit trail. Proposals you send show here too.
          </Empty>
        ) : (
          <>
            <div className="w-toolbar">
              <Chips items={FILTERS.map((f) => ({ k: f.k, label: f.label, n: counts[f.k] }))} on={filter} set={setFilter} cls="ct-chips" />
              <span className="w-sp" />
              <label className="w-search">
                <WIc n="search" />
                <input type="search" value={q} placeholder="Search documents" aria-label="Search documents" onChange={(e) => setQ(e.target.value)} />
              </label>
            </div>
            <div className="m-table ct-list" role="table" aria-label="Documents">
              <div className="m-thead" role="row">
                <span role="columnheader">Document</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">When</span>
                <span role="columnheader">
                  <span className="w-sr">Action</span>
                </span>
              </div>
              {rows.map((r) => {
                const i = find(null, r.company);
                const head = r.company || r.title;
                const line = [r.company ? (r.kind === "proposal" ? "Proposal" : r.title) : r.kind === "proposal" ? "Proposal" : "Contract", r.with ? `with ${r.with}` : null].filter(Boolean).join(" · ");
                return (
                  <div key={r.id} className="m-tr" role="row" tabIndex={0} onClick={() => openRow(r)} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && openRow(r)}>
                    <div className="m-co" role="cell">
                      <CoMark i={i} name={head} s={42} />
                      <div>
                        <div className="m-name">
                          <span>{head}</span>
                        </div>
                        <small>{line}</small>
                        <span className="ct-ph-st">
                          <St tone={TONE[r.status]}>{r.words}</St>
                        </span>
                      </div>
                    </div>
                    <span className="m-ph-hide" role="cell">
                      <St tone={TONE[r.status]}>{r.words}</St>
                    </span>
                    <span className="m-small m-ph-hide" role="cell">
                      {whenOf(r)}
                    </span>
                    <RowActs label={head} primary={ACTION_SAY[r.action]} kind={r.action === "sign" ? "primary" : "secondary"} busy={busy === r.id} onPrimary={() => void act(r)} items={() => menu(r)} />
                  </div>
                );
              })}
              {!rows.length && <p className="m-small" style={{ padding: 18 }}>{q ? `Nothing here for "${q}".` : "No documents here."}</p>}
            </div>
          </>
        )}
      </>
    );
  }
}
