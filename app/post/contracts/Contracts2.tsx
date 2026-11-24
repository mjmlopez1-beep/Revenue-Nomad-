"use client";

/**
 * Contracts, rebuilt the Dropbox Sign way (?p=contracts, RN_CONTRACTS2; off, ContractsPage.tsx draws
 * as before). One list of everything sent for signature, contracts and sent proposals together,
 * each with one status and one action:
 *
 *   Draft            Continue
 *   Awaiting <name>  Remind (at most once a day per signer)
 *   Awaiting you     Sign now (a proposal: countersign in Proposals)
 *   Completed        Download
 *   Declined, Expired, Canceled   Send again
 *
 * Filter chips (All, Awaiting you, Awaiting others, Completed, Drafts, Declined or expired), a
 * search, and headers that sort (the shared SortHeader, app/ui/sortable.tsx). One button: Send for
 * signature, the four steps (SendFlow.tsx). A contract opens its detail (DocDetail.tsx); a proposal
 * opens in Proposals. ?p=contracts&dc=<id> opens a contract (a draft in the flow); &new=1 the flow.
 * Phones: the rows are cards.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contracts2View, SignRow } from "@/lib/documents/contracts2";
import type { DocumentRec } from "@/lib/documents/types";
import { useToast } from "../../ui/shared";
import { SortHeader, useSort, type SortCol } from "../../ui/sortable";
import { takeOpenedWith, useApp } from "../shell/pages";
import { ShellHeader } from "../shell/Header";
import { dapi } from "../DocBuilder";
import { SendFlow, type FlowInit } from "./SendFlow";
import { DocDetail, c2api, dayShort } from "./DocDetail";
import type { SendResult } from "./SendSheet";
import { onOpenContract, takeContract } from "./open";
import "./contracts2.css";

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
const SORT: SortCol<SignRow>[] = [
  { key: "title", label: "Document", get: (r) => r.title },
  { key: "status", label: "Status", get: (r) => r.words },
  { key: "at", label: "Date", kind: "date", get: (r) => r.at },
];

type Screen = { k: "list" } | { k: "flow"; init: FlowInit } | { k: "detail"; id: string } | { k: "sent"; r: SendResult & { docId: string | null; kind: "contract" | "proposal" } };

async function loadView(): Promise<Contracts2View | { error: string }> {
  try {
    const r = await fetch("/api/contracts", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.on ? j : { error: j.error || "Contracts didn't load. Try again." };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

export function Contracts2Page() {
  const c = useApp();
  const toast = useToast();
  const [view, setView] = useState<Contracts2View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ k: "list" });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const v = await loadView();
    if ("error" in v) return setError(v.error);
    setError(null);
    setView(v);
    return v;
  }, []);

  /** Open one contract: a draft in the flow, anything else on its page. */
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

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.k === filter)!;
    const words = q.trim().toLowerCase();
    return (view?.rows ?? []).filter((r) => f.has(r) && (!words || `${r.title} ${r.with} ${r.company}`.toLowerCase().includes(words)));
  }, [view, filter, q]);
  const sorter = useSort(rows, SORT, { storageKey: "contracts2" });

  const toList = () => (setScreen({ k: "list" }), void reload());
  const act = async (r: SignRow) => {
    if (r.kind === "proposal" && (r.action === "sign" || r.action === "again" || r.action === "continue")) return void (window.location.href = r.href!);
    if (r.action === "download" && r.download) return void window.open(r.download, "_blank", "noopener");
    if (r.action === "continue") return void openDoc(r.id);
    setBusy(r.id);
    if (r.action === "remind") {
      const x = await c2api<{ message: string }>({ op: "remind", id: r.id });
      setBusy(null);
      return x.error ? toast(x.error, true) : (toast(x.message), void reload());
    }
    if (r.action === "sign") {
      const x = await dapi<{ link: string }>({ op: "mylink", id: r.id });
      setBusy(null);
      return x.error ? toast(x.error, true) : window.location.assign(x.link);
    }
    if (r.action === "again") {
      const x = await dapi<DocumentRec>({ op: "copy", id: r.id });
      setBusy(null);
      return x.error ? toast(x.error, true) : setScreen({ k: "flow", init: { kind: "draft", doc: x } });
    }
    setBusy(null);
  };
  const openRow = (r: SignRow) => (r.kind === "proposal" ? void (window.location.href = r.href!) : r.status === "draft" ? void openDoc(r.id) : setScreen({ k: "detail", id: r.id }));

  const crumb = screen.k === "flow" ? "Send for signature" : screen.k === "detail" ? "Contract" : screen.k === "sent" ? "Sent" : null;
  const header =
    screen.k === "flow" ? null : (
      <ShellHeader
        crumbs={[{ label: "Home", href: c.hrefOf("today"), go: () => c.openPage("today") }, ...(crumb ? [{ label: "Contracts", href: c.hrefOf("contracts"), go: toList }] : [])]}
        title={crumb ?? "Contracts"}
        phone={c.phone}
        onHome={() => c.openPage("today")}
        actions={c.headerActions}
        hosts={null}
      />
    );

  if (error && !view)
    return (
      <>
        {header}
        <div className="c2-page">
          <p className="c2-err" role="alert">
            {error}
          </p>
          <button type="button" className="btn" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </>
    );
  if (!view)
    return (
      <>
        {header}
        <div className="c2-page" aria-busy="true">
          <div className="c2-skel" />
        </div>
      </>
    );

  if (screen.k === "flow")
    return <SendFlow view={view} init={screen.init} phone={c.phone} toast={toast} onClose={toList} onSent={(r) => (setScreen({ k: "sent", r }), void reload())} />;
  if (screen.k === "detail")
    return (
      <>
        {header}
        <DocDetail id={screen.id} canClose={view.canClose} phone={c.phone} toast={toast} onBack={toList} onContinue={(d) => setScreen({ k: "flow", init: { kind: "draft", doc: d } })} onAgain={(d) => setScreen({ k: "flow", init: { kind: "draft", doc: d } })} />
      </>
    );
  if (screen.k === "sent") {
    const r = screen.r;
    return (
      <>
        {header}
        <div className="c2-page c2-sent" role="status">
          <span className="c2-sent-i" aria-hidden>
            ✓
          </span>
          <h1 className="c2-h1">{r.head}</h1>
          <p>{r.order}</p>
          <p className="c2-sub">
            {r.remind ? "Reminders on day 2 and day 7 until they sign. " : ""}
            {r.days ? `The link works for ${r.days} days.` : "The link has no end date."} You get an alert when it is opened.
          </p>
          <div className="c2-sent-act">
            {r.docId && (
              <button type="button" className="btn" onClick={() => setScreen({ k: "detail", id: r.docId! })}>
                Open document
              </button>
            )}
            <button type="button" className="btn btn-pine" onClick={toList}>
              Back to contracts
            </button>
          </div>
        </div>
      </>
    );
  }

  const counts = Object.fromEntries(FILTERS.map((f) => [f.k, view.rows.filter(f.has).length])) as Record<Filter, number>;
  const actBtn = (r: SignRow) => (
    <button type="button" className={`btn btn-sm${r.action === "sign" ? " btn-pine" : ""}`} disabled={busy === r.id} onClick={(e) => (e.stopPropagation(), void act(r))} aria-label={`${ACTION_SAY[r.action]}: ${r.title}`}>
      {ACTION_SAY[r.action]}
    </button>
  );
  const sub = (r: SignRow) => `${r.kind === "proposal" ? "Proposal" : "Contract"}${r.with ? ` · with ${r.with}` : ""}`;
  const pill = (r: SignRow) => (
    <span className="c2-pill" data-k={r.status}>
      {r.words}
    </span>
  );

  return (
    <>
      {header}
      <div className="c2-page c2-list">
        <div className="c2-lhead">
          <div>
            <h1 className="c2-h1">Contracts</h1>
            <p className="c2-lead">Contracts and proposals you sent for signature.</p>
          </div>
          <button type="button" className="btn btn-pine btn-lg" onClick={() => setScreen({ k: "flow", init: { kind: "new" } })}>
            Send for signature
          </button>
        </div>
        {!view.canSend && <p className="c2-notice">Sending for signature is on Pro and Close. You can prepare a contract now and send it after you upgrade.</p>}
        <div className="c2-tools">
          <div className="c2-filters" role="tablist" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.k} type="button" role="tab" aria-selected={filter === f.k} className="c2-filter" onClick={() => setFilter(f.k)}>
                {f.label} <span className="c2-count">{counts[f.k]}</span>
              </button>
            ))}
          </div>
          <input className="input c2-search" type="search" placeholder="Search by title or name" aria-label="Search contracts" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!view.rows.length ? (
          <div className="c2-empty">
            <p>
              <strong>Nothing sent for signature yet.</strong>
            </p>
            <p className="c2-sub">Drop a PDF, pick who signs, place the fields and send. Merlin keeps the signed copy and its audit trail.</p>
            <button type="button" className="btn btn-pine" onClick={() => setScreen({ k: "flow", init: { kind: "new" } })}>
              Send for signature
            </button>
          </div>
        ) : !rows.length ? (
          <p className="c2-empty c2-sub">Nothing here{q ? ` for "${q}"` : ""}.</p>
        ) : c.phone ? (
          <ul className="c2-cards">
            {sorter.rows.map((r) => (
              <li key={r.id} className="c2-cardrow" onClick={() => openRow(r)}>
                <span className="c2-docicon" aria-hidden />
                <span className="c2-cardmain">
                  <strong>{r.title}</strong>
                  <span className="c2-sub">{sub(r)}</span>
                  <span className="c2-cardmeta">
                    {pill(r)} <span className="c2-sub">{dayShort(r.at)}</span>
                  </span>
                </span>
                {actBtn(r)}
              </li>
            ))}
          </ul>
        ) : (
          <table className="c2-table">
            <thead>
              <tr>
                <SortHeader s={sorter} k="title">
                  Document
                </SortHeader>
                <SortHeader s={sorter} k="status">
                  Status
                </SortHeader>
                <SortHeader s={sorter} k="at">
                  Date
                </SortHeader>
                <th scope="col">
                  <span className="c2-sr">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorter.rows.map((r) => (
                <tr key={r.id} onClick={() => openRow(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openRow(r)}>
                  <td>
                    <span className="c2-tdoc">
                      <span className="c2-docicon" aria-hidden />
                      <span>
                        <strong>{r.title}</strong>
                        <span className="c2-sub">{sub(r)}</span>
                      </span>
                    </span>
                  </td>
                  <td>{pill(r)}</td>
                  <td className="c2-date">{dayShort(r.at)}</td>
                  <td className="c2-act">{actBtn(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
