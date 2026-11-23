"use client";

/**
 * Contracts (?p=contracts, the new look's page under Close; Contracts.dc.html): any agreement the
 * member wrote anywhere, signed here. The page is the drop zone ("Drop your PDF here and it gets
 * started") with the saved contracts beside it, the table of contracts sent (with, status, sent,
 * opened, signed, link ends, sealed copy, next step) and a detail beside the table (signers, the
 * activity, the audit trail, the seal and Check this copy), the saved contracts as tiles, and what
 * a sealed copy is.
 *
 * Sending is the flow in ContractsHome.tsx (ContractFlow): drop, check the fields Merlin placed,
 * who signs, send. A saved contract (lib/documents/templates.ts) starts at who signs. A contract
 * opens in full in the field placer (DocBuilder.tsx) at ?p=contracts&dc=<id>.
 *
 * First visit (none of their own yet): the drop zone is the hero, two starter contracts to try
 * (made up, the link to their own email), example rows labelled Example (never sent to the server,
 * never counted), and what a sealed, checkable copy means. Phones: the rows are cards.
 *
 * No export: nothing here downloads Merlin's data. A signed contract's own copy opens on its signed
 * copy page, as both sides were emailed it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProposalsView } from "@/lib/proposals/types";
import type { DocumentRec, FieldKind } from "@/lib/documents/types";
import type { SavedContract } from "@/lib/documents/templates";
import { STARTERS } from "@/lib/documents/samples";
import { IconCheck, IconX, errorText, useToast } from "../../ui/shared";
import { useApp } from "../shell/pages";
import { ShellHeader } from "../shell/Header";
import { PageStrip } from "../shell/PageStrip";
import { openPlans } from "../Billing";
import { DocBuilder, dapi } from "../DocBuilder";
import { CloseBuildPrompt } from "../Proposals";
import { ActivityPanel } from "../Activity";
import { stamp } from "../../sign/doc";
import { ContractFlow, readUpload, starterFile, type FlowStart } from "./ContractsHome";
import { onOpenContract, takeContract } from "./open";
import "../proposals.css";
import "./contracts.css";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const STRIP = "Contracts you wrote anywhere, signed here. Drop a PDF and Merlin places the signature, name and date fields. You check who signs and send. You get an alert when it is opened, and a sealed copy when it is signed.";
const DAY = 86_400_000;
const firstOf = (s: string) => s.trim().split(/\s+/)[0] || s;
const short = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => w && !/^(and|&|of|the)$/i.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 2) || "?";
const TINTS = ["#E3E8F7", "#E8F3EE", "#FFE7A8", "#F3E8F5", "#DDF0F7", "#FBE3D6"];
const tint = (s: string) => TINTS[[...s].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TINTS.length];

async function load(): Promise<ProposalsView | { error: string }> {
  try {
    const r = await fetch("/api/proposals", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: errorText(r.status, j.error, "Contracts didn't load. Try again.") };
  } catch {
    return { error: NETWORK };
  }
}
async function loadSaved(): Promise<SavedContract[] | { error: string }> {
  try {
    const r = await fetch("/api/documents?saved=1", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return r.ok && Array.isArray(j) ? j : { error: errorText(r.status, j.error, "Saved contracts didn't load.") };
  } catch {
    return { error: NETWORK };
  }
}

/* ---------- a contract as the table reads it ---------- */

type St = "turn" | "opened" | "sent" | "signed" | "declined" | "expired" | "draft" | "void";
type Group = "you" | "wait" | "done";
const GROUP: Partial<Record<St, Group>> = { sent: "wait", opened: "wait", turn: "you", declined: "you", expired: "you", draft: "you", signed: "done" };
const CHIP: Record<St, string> = { turn: "Your turn", opened: "Opened", sent: "Sent", signed: "Signed", declined: "Declined", expired: "Link ended", draft: "Draft", void: "Voided" };
const NEXT: Record<St, string> = { turn: "Sign it now", opened: "Follow up", sent: "See activity", signed: "Open copy", declined: "See why", expired: "New link", draft: "Finish it", void: "See activity" };

interface Row {
  id: string;
  title: string;
  file: string;
  pages: number;
  co: string;
  /** The company is on Merlin (linked). */
  linked: boolean;
  who: string;
  whoTitle: string;
  st: St;
  stSub: string;
  sent: string | null;
  opened: string | null;
  openedN: number;
  signed: string | null;
  signedSub: string;
  ends: string | null;
  sealed: string | null;
  example?: boolean;
  doc?: DocumentRec;
  reason?: string | null;
  signers: { name: string; title: string | null; email: string; me: boolean; state: string }[];
  events: { t: string; at: string }[];
}

const EVENT_WORDS: Record<string, string> = {
  uploaded: "Uploaded",
  sent: "Sent for signature",
  notified: "Link emailed",
  viewed: "Opened",
  code_sent: "Code sent",
  code_failed: "A wrong code was typed",
  code_verified: "Email confirmed with a code",
  signed: "Signed",
  declined: "Declined",
  voided: "Voided",
  completed: "Complete: everyone signed",
  copy_sent: "Sealed, final PDF emailed",
  expired_open: "Opened after the link ended",
};

function rowOf(d: DocumentRec, nowMs: number): Row {
  const other = d.signers.find((x) => !x.sender) ?? d.signers[0] ?? null;
  const me = d.signers.find((x) => x.sender) ?? null;
  // The member's turn to sign: never on a starter sent to their own email (every signer is them).
  const myTurn = !!me && d.signers.some((x) => !x.sender) && (me.status === "sent" || me.status === "viewed") && (d.status === "sent" || d.status === "viewed");
  const st: St = d.status === "draft" ? "draft" : d.status === "signed" ? "signed" : d.status === "declined" ? "declined" : d.status === "void" ? "void" : d.status === "expired" ? "expired" : myTurn ? "turn" : d.status === "viewed" ? "opened" : "sent";
  const done = d.signers.filter((x) => x.status === "signed").length;
  const openedN = other ? d.events.filter((e) => e.kind === "viewed" && e.who === other.email).length : 0;
  const nameBy = (email?: string) => d.signers.find((x) => x.email === email)?.name;
  return {
    id: d.id,
    title: d.title.includes(" · ") ? d.title.split(" · ").slice(1).join(" · ") : d.title,
    file: d.fileName,
    pages: d.pages.length,
    co: d.company.name,
    linked: !!d.company.id,
    who: other ? other.name : "Nobody yet",
    whoTitle: other?.title ?? "",
    st,
    stSub:
      st === "draft"
        ? `Edited ${short(d.updatedAt)}`
        : st === "sent"
          ? "Not opened yet"
          : st === "declined"
            ? "Said why"
            : st === "expired"
              ? other?.viewedAt
                ? "Not signed"
                : "Never opened"
              : st === "void"
                ? "Links stopped"
                : `${done} of ${d.signers.length} signed`,
    sent: d.sentAt,
    opened: other?.viewedAt ?? null,
    openedN,
    signed: st === "turn" ? other?.signedAt ?? null : st === "signed" ? d.completedAt : other?.signedAt ?? null,
    signedSub: st === "turn" ? "You sign next" : "",
    ends: d.expiresAt && (st === "sent" || st === "opened" || st === "turn" || st === "expired") ? d.expiresAt : null,
    sealed: st === "signed" ? d.completedAt : null,
    doc: d,
    reason: other?.declineReason ?? null,
    signers: d.signers.map((x) => ({
      name: x.name,
      title: x.title,
      email: x.email,
      me: x.sender,
      state:
        x.status === "signed"
          ? `Signed ${short(x.signedAt)}`
          : x.status === "declined"
            ? `Declined ${short(x.declinedAt)}`
            : x.status === "viewed"
              ? `Opened ${short(x.viewedAt)}`
              : x.status === "sent"
                ? x.sender
                  ? "Your turn"
                  : `Link sent ${short(x.notifiedAt)}`
                : d.status === "draft"
                  ? "Not sent yet"
                  : "Waiting for their turn",
    })),
    events: d.events
      .filter((e) => e.kind !== "code_sent")
      .map((e) => ({ t: `${EVENT_WORDS[e.kind] ?? e.kind}${e.who && nameBy(e.who) && (e.kind === "viewed" || e.kind === "signed" || e.kind === "notified" || e.kind === "declined") ? ` · ${nameBy(e.who)}` : ""}${e.kind === "declined" && e.note ? `: ${e.note}` : ""}`, at: e.at })),
    ...(nowMs ? {} : {}),
  };
}

/**
 * The first visit's example rows: made up, labelled Example, drawn here only. They are never sent
 * to the server, never counted with the member's own and their buttons do nothing but say so.
 */
function exampleRows(nowMs: number): Row[] {
  const iso = (d: number) => new Date(nowMs + d * DAY).toISOString();
  const base = { pages: 0, linked: true, example: true, reason: null } as const;
  return [
    {
      ...base,
      id: "ex_h",
      title: "SOW, phase 2",
      file: "Halcyon SOW phase 2.pdf",
      pages: 6,
      co: "Halcyon Freight",
      who: "Rita Okafor",
      whoTitle: "VP Sales",
      st: "opened",
      stSub: "0 of 2 signed",
      sent: iso(-4),
      opened: iso(-3),
      openedN: 2,
      signed: null,
      signedSub: "",
      ends: iso(26),
      sealed: null,
      signers: [
        { name: "Rita Okafor", title: "VP Sales", email: "rita@halcyonfreight.example", me: false, state: `Opened ${short(iso(-3))}` },
        { name: "You", title: null, email: "", me: true, state: "After Rita" },
      ],
      events: [
        { t: "Uploaded", at: iso(-4) },
        { t: "Sent for signature", at: iso(-4) },
        { t: "Opened · Rita Okafor", at: iso(-3) },
      ],
    },
    {
      ...base,
      id: "ex_l",
      title: "Consulting agreement",
      file: "Larkspur consulting agreement.pdf",
      pages: 9,
      co: "Larkspur Learning",
      who: "Owen Reyes",
      whoTitle: "CEO",
      st: "turn",
      stSub: "1 of 2 signed",
      sent: iso(-6),
      opened: iso(-5),
      openedN: 3,
      signed: iso(-1),
      signedSub: "You sign next",
      ends: iso(24),
      sealed: null,
      signers: [
        { name: "Owen Reyes", title: "CEO", email: "owen@larkspurlearning.example", me: false, state: `Signed ${short(iso(-1))}` },
        { name: "You", title: null, email: "", me: true, state: "Your turn" },
      ],
      events: [
        { t: "Sent for signature", at: iso(-6) },
        { t: "Opened · Owen Reyes", at: iso(-5) },
        { t: "Email confirmed with a code", at: iso(-1) },
        { t: "Signed · Owen Reyes", at: iso(-1) },
      ],
    },
    {
      ...base,
      id: "ex_n",
      title: "Master services agreement",
      file: "Master services agreement.pdf",
      pages: 14,
      co: "Northwind Clinics",
      who: "Sam Iverson",
      whoTitle: "CEO",
      st: "signed",
      stSub: "2 of 2 signed",
      sent: iso(-13),
      opened: iso(-13),
      openedN: 4,
      signed: iso(-10),
      signedSub: "",
      ends: null,
      sealed: iso(-10),
      signers: [
        { name: "Sam Iverson", title: "CEO", email: "sam@northwindclinics.example", me: false, state: `Signed ${short(iso(-10))}` },
        { name: "You", title: null, email: "", me: true, state: `Signed ${short(iso(-10))}` },
      ],
      events: [
        { t: "Sent for signature", at: iso(-13) },
        { t: "Opened · Sam Iverson", at: iso(-13) },
        { t: "Signed · Sam Iverson", at: iso(-10) },
        { t: "Signed · you", at: iso(-10) },
        { t: "Complete: everyone signed", at: iso(-10) },
        { t: "Sealed, final PDF emailed", at: iso(-10) },
      ],
    },
  ];
}

/* ---------- the page ---------- */

type Check = { busy: boolean; answer: { result: "match"; sealedAt: string; signers: { name: string; at: string }[] } | { result: "changed" } | { result: "unknown" } | null; err: string | null };

export function ContractsPage() {
  const c = useApp();
  const toast = useToast();
  const [data, setData] = useState<ProposalsView | null>(null);
  const [saved, setSaved] = useState<SavedContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowStart | null>(null);
  const [flowStep, setFlowStep] = useState<string>("fields");
  const [open, setOpen] = useState<{ id: string; notice?: string; place?: { kind: FieldKind; email: string } } | null>(() => {
    // Asked for from another page (open.ts: Proposals, the bell, a deal on Pipeline), else the address's (&dc=).
    const asked = takeContract();
    if (asked) return { id: asked };
    return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dc") ? { id: new URLSearchParams(window.location.search).get("dc")! } : null;
  });
  const [busy, setBusy] = useState("");
  const [dropOn, setDropOn] = useState(false);
  const [dropErr, setDropErr] = useState<string | null>(null);
  const [viewKey, setViewKey] = useState<"all" | Group>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"who" | "activity" | "trail">("who");
  const [check, setCheck] = useState<Check>({ busy: false, answer: null, err: null });
  const [sealShown, setSealShown] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [nowMs] = useState(() => Date.now());
  // Read once when the page opens: what the member does here doesn't swap the first visit away under them.
  const [firstSeen, setFirstSeen] = useState<boolean | null>(null);

  const reload = useCallback(async () => {
    const [r, s] = await Promise.all([load(), loadSaved()]);
    if ("error" in r) setError(r.error);
    else setData(r), setError(null);
    if (!("error" in s)) setSaved(s);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (data && saved && firstSeen === null) setFirstSeen(data.documents.length === 0 && saved.length === 0);
  }, [data, saved, firstSeen]);
  const putDoc = useCallback((x: DocumentRec) => setData((d) => (d ? { ...d, documents: [x, ...d.documents.filter((y) => y.id !== x.id)] } : d)), []);
  const refreshSaved = useCallback(async () => {
    const s = await loadSaved();
    if (!("error" in s)) setSaved(s);
  }, []);

  // The contract open in the field placer is in the address (&dc=), so a reload reopens it and Back closes it.
  const openFull = (id: string, notice?: string, place?: { kind: FieldKind; email: string }) => {
    setOpen({ id, notice, place });
    setFlow(null);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("p", "contracts");
      u.searchParams.set("dc", id);
      window.history.pushState({ ...(window.history.state ?? {}), ctDoc: true }, "", u.pathname + u.search);
    } catch {}
  };
  const closeFull = () => {
    setOpen(null);
    try {
      if (window.history.state?.ctDoc) window.history.back();
      else {
        const u = new URL(window.location.href);
        u.searchParams.delete("dc");
        window.history.replaceState(window.history.state, "", u.pathname + u.search);
      }
    } catch {}
  };
  // Opened at a contract from another page: the address says so, so a reload reopens it.
  useEffect(() => {
    if (!open) return;
    // After the shell has written this page's own address (its effect runs after this one).
    const t = window.setTimeout(() => {
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.get("p") !== "contracts" || u.searchParams.get("dc")) return;
        u.searchParams.set("dc", open.id);
        window.history.replaceState(window.history.state, "", u.pathname + u.search);
      } catch {}
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Contracts already open and another part of the app asked for a contract (the bell): open it, or the list.
  useEffect(() => onOpenContract((id) => (id ? openFull(id) : (setFlow(null), open && closeFull()))));
  useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(window.location.search).get("dc");
      setOpen((o) => (id ? (o?.id === id ? o : { id }) : null));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** A PDF dropped or picked, or a starter: uploaded, read, then the flow. */
  const take = async (f: File | undefined, demo = false) => {
    if (!f || !data) return;
    setDropErr(null);
    if (!data.canBuild && !demo) {
      // Without Close the field placer opens, as before, with the Close prompt.
      setBusy("Uploading it");
    } else setBusy(demo ? "Making the example" : `Merlin is reading ${f.name}`);
    const r = await readUpload(f, data.canBuild, putDoc);
    setBusy("");
    if ("error" in r) return setDropErr(r.error);
    if ("manual" in r) return openFull(r.manual.id, r.notice);
    setSel(null);
    setFlow({ kind: "read", doc: r.doc, reading: r.reading, demo });
  };
  const tryStarter = async (layout: "two-column" | "nda") => {
    if (!data) return;
    if (!data.canBuild) return openPlans("proposals");
    setBusy("Making the example");
    const f = await starterFile(layout, data.me.name);
    await take(f, true);
  };
  const useSaved = async (s: SavedContract) => {
    if (!data) return;
    if (!data.canBuild) return openPlans("proposals");
    setBusy(`Opening ${s.name}`);
    const r = await fetch(`/api/documents?saved=${encodeURIComponent(s.id)}`)
      .then(async (x) => (x.ok ? ((await x.json()) as { saved: SavedContract; document: DocumentRec }) : { error: errorText(x.status, (await x.json().catch(() => ({}))).error, "That saved contract didn't open.") }))
      .catch(() => ({ error: NETWORK }));
    setBusy("");
    if ("error" in r) return toast(r.error, true);
    setSel(null);
    setFlow({ kind: "saved", saved: r.saved, doc: r.document });
  };
  const unsave = async (s: SavedContract) => {
    if (!window.confirm(`Delete the saved ${s.name}? Contracts you sent from it keep their own copies.`)) return;
    const r = await dapi<{ ok: boolean }>({ op: "unsave", id: s.id });
    if (r.error) return toast(r.error, true);
    toast(`Deleted the saved ${s.name}.`);
    void refreshSaved();
  };

  const rowsOwn = useMemo(() => (data ? data.documents.map((d) => rowOf(d, nowMs)) : []), [data, nowMs]);
  const first = !!firstSeen && rowsOwn.length === 0;
  const rows = first ? exampleRows(nowMs) : rowsOwn;
  const count = (g: "all" | Group) => rows.filter((r) => g === "all" || GROUP[r.st] === g).length;
  const shown = rows.filter((r) => viewKey === "all" || GROUP[r.st] === viewKey);
  const cur = rows.find((r) => r.id === sel) ?? null;
  const nSent = rows.filter((r) => r.sent).length;
  const live = (r: Row) => r.st === "sent" || r.st === "opened" || r.st === "turn";
  useEffect(() => setCheck({ busy: false, answer: null, err: null }), [sel]);

  /* ----- what a row's buttons do ----- */
  const example = () => toast("This is an example. Your own contracts show here once you send one.");
  const signNow = async (r: Row) => {
    const w = window.open("", "_blank");
    const res = await dapi<{ link: string }>({ op: "mylink", id: r.id });
    if (res.error) return w?.close(), toast(res.error, true);
    if (w) w.location.href = res.link;
    else window.location.href = res.link;
  };
  const copyToChange = async (r: Row) => {
    const res = await dapi<DocumentRec>({ op: "copy", id: r.id });
    if (res.error) return toast(res.error, true);
    putDoc(res);
    setSel(null);
    toast("Copied as a new draft, with its fields and signers. Change it and send it again.");
    setFlow({ kind: "draft", doc: res });
  };
  const doVoid = async (r: Row) => {
    if (!window.confirm("Void it? Every signer's link stops working.")) return;
    const res = await dapi<DocumentRec>({ op: "void", id: r.id });
    if (res.error) return toast(res.error, true);
    putDoc(res);
    toast("Voided. Every signer's link stopped working.");
  };
  const doDelete = async (r: Row) => {
    if (!window.confirm("Delete this contract? It can't be undone.")) return;
    const res = await dapi<{ ok: boolean }>({ op: "delete", id: r.id });
    if (res.error) return toast(res.error, true);
    setData((d) => (d ? { ...d, documents: d.documents.filter((x) => x.id !== r.id) } : d));
    setSel(null);
    toast("Deleted.");
  };
  const keep = async (r: Row) => {
    const res = await dapi<{ name: string }>({ op: "save", id: r.id });
    if (res.error) return toast(res.error, true);
    toast(`Saved. ${res.name} is in Saved contracts with its fields in place.`);
    void refreshSaved();
  };
  const next = (r: Row) => {
    if (r.example) return example();
    if (r.st === "turn") return void signNow(r);
    if (r.st === "signed") return void (r.doc?.copyUrl ? window.open(r.doc.copyUrl, "_blank", "noopener") : openFull(r.id));
    if (r.st === "draft" && r.doc) return r.doc.fields.length && r.doc.signers.length ? (setSel(null), setFlow({ kind: "draft", doc: r.doc })) : openFull(r.id);
    if (r.st === "expired") return void copyToChange(r);
    setSel(r.id);
    setTab(r.st === "declined" ? "trail" : "activity");
  };
  /** Check this copy: the sealed PDF, fetched as the member, checked by /api/check exactly as anyone's would be. */
  const runCheck = async (r: Row) => {
    setCheck({ busy: true, answer: null, err: null });
    try {
      const f = await fetch(`/api/documents/file?id=${encodeURIComponent(r.id)}&final=1`);
      if (!f.ok) throw new Error("file");
      const a = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/pdf" }, body: await f.arrayBuffer() });
      const j = await a.json().catch(() => ({}));
      if (!a.ok) return setCheck({ busy: false, answer: null, err: j.error || "That didn't go through. Try again." });
      setCheck({ busy: false, answer: j, err: null });
    } catch {
      setCheck({ busy: false, answer: null, err: "The check didn't go through. Try again." });
    }
  };

  /* ----- the header ----- */
  const crumbLast = open ? "Contract" : flow ? (flow.kind === "saved" ? flow.saved.name : flow.kind === "read" ? flow.reading.kind.replace(/^\w/, (x) => x.toUpperCase()) : flow.doc.title.split(" · ").pop() ?? "Contract") : null;
  const header = (
    <ShellHeader
      crumbs={[{ label: "Home", href: c.hrefOf("today"), go: () => c.openPage("today") }, ...(crumbLast ? [{ label: "Contracts", href: c.hrefOf("contracts"), go: () => (setFlow(null), open && closeFull()) }] : [])]}
      title={crumbLast ?? "Contracts"}
      phone={c.phone}
      onHome={() => c.openPage("today")}
      actions={c.headerActions}
      hosts={null}
    />
  );

  if (error && !data)
    return (
      <>
        {header}
        <div className="ct-page">
          <p className="pp-err" role="alert">
            {error}
          </p>
          <button type="button" className="btn" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </>
    );
  if (!data)
    return (
      <>
        {header}
        <div className="ct-page" aria-busy="true">
          <div className="ct-skel" />
        </div>
      </>
    );

  const full = open ? data.documents.find((x) => x.id === open.id) : null;
  if (open && full)
    return (
      <>
        {header}
        {/* The page's one heading (the field placer's title is a box to edit). */}
        <h1 className="sr-only">{full.title || "Contract"}</h1>
        <DocBuilder
          key={full.id}
          notice={open.notice ?? null}
          place={open.place ?? null}
          backLabel="All contracts"
          initial={full}
          data={data}
          infos={c.infos}
          onSaved={putDoc}
          onBack={closeFull}
          onGone={(id) => (setData((d) => (d ? { ...d, documents: d.documents.filter((x) => x.id !== id) } : d)), closeFull())}
          onOpen={(x) => (putDoc(x), openFull(x.id))}
        />
      </>
    );
  if (flow)
    return (
      <>
        {header}
        <div className="ct-page ct-page-flow" data-step={flowStep}>
          <ContractFlow
            data={data}
            start={flow}
            onSaved={putDoc}
            onManual={(d, notice, place) => (putDoc(d), openFull(d.id, notice, place))}
            onDone={(d) => (putDoc(d), setFlow(null), setViewKey("all"), setSel(d.id), setTab("activity"))}
            onHome={() => setFlow(null)}
            onKept={() => void refreshSaved()}
            onAlerts={() => c.openPage("alerts")}
            onStep={setFlowStep}
          />
        </div>
      </>
    );

  const plan = c.me.plan;
  const planPill = !plan
    ? null
    : plan.name === "trial"
      ? first
        ? `Free on your trial · ${plan.trialDaysLeft ?? 0} ${plan.trialDaysLeft === 1 ? "day" : "days"} left`
        : `Close plan · in your trial, ${plan.trialDaysLeft ?? 0} ${plan.trialDaysLeft === 1 ? "day" : "days"} left`
      : plan.tier === "close"
        ? "Close plan"
        : null;
  const savedTiles = saved ?? [];
  const quick = first ? null : savedTiles.slice(0, 3);
  const nYou = count("you");
  const nWait = count("wait");
  const nDone = count("done");

  /* ----- the drop zone ----- */
  const zone = (
    <section
      className="ct-zone"
      data-first={first}
      data-on={dropOn}
      aria-labelledby="ct-zone-h"
      aria-busy={!!busy}
      onDragOver={(e) => (e.preventDefault(), !dropOn && setDropOn(true))}
      onDragLeave={() => setDropOn(false)}
      onDrop={(e) => (e.preventDefault(), setDropOn(false), void take(e.dataTransfer.files?.[0]))}
    >
      <div className="ct-zone-top">
        <span className="ct-zone-ic" aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4" />
            <path d="M7 9l5-5 5 5" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
        </span>
        <span className="ct-zone-t">
          {busy ? (
            <span className="ct-zone-h" id="ct-zone-h" role="status">
              {busy}
              <span className="ct-zone-bar" aria-hidden>
                <span />
              </span>
            </span>
          ) : (
            <>
              <span className="ct-zone-h" id="ct-zone-h">
                Drop your PDF here and it gets started
              </span>
              <span className="ct-zone-s">A PDF, up to 15 MB. From Word or Google Docs, save it as a PDF first.</span>
            </>
          )}
        </span>
        <span className="ct-zone-go">
          <button type="button" className="btn btn-pine btn-lg" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            Choose a file
          </button>
          {!first && data.canBuild && (
            <button type="button" className="btn btn-lg" disabled={!!busy} onClick={() => void tryStarter("two-column")}>
              Try it with an example
            </button>
          )}
        </span>
      </div>
      {(first || (quick && quick.length > 0)) && (
        <div className="ct-quick">
          <span className="ct-quick-h">{first ? "No PDF to hand? Try a starter:" : "Or use a saved contract:"}</span>
          {first
            ? STARTERS.map((s) => (
                <button key={s.layout} type="button" className="ct-qbtn" disabled={!!busy} onClick={() => void tryStarter(s.layout as "two-column" | "nda")}>
                  <DocIcon />
                  <span className="ct-qbtn-t">
                    <strong>{s.name}</strong>
                    <span>Example · {s.meta.split(" · ")[0]}</span>
                  </span>
                  <span className="ct-qbtn-go">Try it</span>
                </button>
              ))
            : quick!.map((s) => (
                <button key={s.id} type="button" className="ct-qbtn" disabled={!!busy} onClick={() => void useSaved(s)}>
                  <DocIcon />
                  <span className="ct-qbtn-t">
                    <strong>{s.name}</strong>
                    <span>
                      {s.pages} {s.pages === 1 ? "page" : "pages"} · fields placed already
                    </span>
                  </span>
                  <span className="ct-qbtn-go">Use</span>
                </button>
              ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (void take(e.target.files?.[0]), (e.target.value = ""))} />
    </section>
  );

  /* ----- the detail beside the table ----- */
  const hint = (r: Row): [string, string | null, () => void] => {
    const ff = firstOf(r.who);
    switch (r.st) {
      case "turn":
        return [`${ff} signed${r.signed ? ` on ${short(r.signed)}` : ""}. Your saved signature goes on in one click on your own signing page. Then it is sealed and you both get the signed PDF.`, "Sign it now", () => void signNow(r)];
      case "opened":
        return [`${ff} opened it ${r.openedN === 1 ? "once" : `${r.openedN || 2} times`} and has not signed. A short note today is well timed.`, "See when to follow up", () => setTab("activity")];
      case "sent":
        return [`It went to ${ff}${r.sent ? ` on ${short(r.sent)}` : ""}. You get an alert the moment it is opened.`, "See its activity", () => setTab("activity")];
      case "signed":
        return ["Everyone signed. The final PDF has every answer stamped in and an audit trail page. It went to you both by email.", r.doc?.copyUrl || r.example ? "Open the signed copy" : null, () => (r.example ? example() : r.doc?.copyUrl && window.open(r.doc.copyUrl, "_blank", "noopener"))];
      case "declined":
        return [`${ff} declined${r.reason ? `: ${r.reason}` : "."} Copy it, change the terms and send it again.`, "Copy to change", () => void copyToChange(r)];
      case "expired":
        return [`The link ended on ${short(r.ends)}${r.opened ? "" : ` and ${ff} never opened it`}. A copy goes out with a new link.`, "Send a new link", () => void copyToChange(r)];
      case "draft":
        return ["Not sent yet. Check who signs, then send.", "Finish and send", () => next(r)];
      default:
        return ["You voided it, so every link stopped working. Copy it to send again.", "Copy to change", () => void copyToChange(r)];
    }
  };
  const detail = cur && (
    <aside className="ct-detail" aria-labelledby="ct-detail-h">
      <div className="ct-detail-top">
        <span className="ct-detail-t">
          <h2 id="ct-detail-h" className="ct-detail-h" tabIndex={-1}>
            {cur.title}
          </h2>
          <span className="ct-sub">
            {cur.co ? `${cur.co} · ` : ""}
            {cur.who}
            {cur.whoTitle ? `, ${cur.whoTitle}` : ""}
          </span>
          <span className="ct-sub">
            {cur.example ? "Example · " : ""}
            {cur.file}
            {cur.pages ? ` · ${cur.pages} pages` : ""}
          </span>
        </span>
        <span className="ct-chip" data-st={cur.st}>
          {CHIP[cur.st]}
        </span>
        <button type="button" className="ct-x" aria-label="Close the detail" onClick={() => (setSel(null), requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row="${cur.id}"] .ct-open`)?.focus()))}>
          <IconX size={16} />
        </button>
      </div>
      {(() => {
        const [t, label, go] = hint(cur);
        return (
          <div className="ct-hint">
            <p>{t}</p>
            {label && (
              <button type="button" className={`btn ${cur.st === "turn" ? "btn-pine" : ""}`} onClick={cur.example ? example : go}>
                {label}
              </button>
            )}
          </div>
        );
      })()}
      {cur.sealed && (
        <div className="ct-sealcard">
          <strong>Sealed {short(cur.sealed)}</strong>
          {cur.doc?.finalSha256 && (
            <span className="ct-sub">
              Fingerprint (SHA-256) <code>{cur.doc.finalSha256.slice(0, 8)}</code> and {cur.doc.finalSha256.length - 8} more characters, printed on its audit trail page.
            </span>
          )}
          {!cur.example && (
            <button type="button" className="btn ct-checkbtn" aria-busy={check.busy} disabled={check.busy} onClick={() => void runCheck(cur)}>
              {check.busy ? "Checking" : "Check this copy"}
            </button>
          )}
          {check.answer && (
            <div className="ct-checked" role="status" data-result={check.answer.result}>
              {check.answer.result === "match" ? (
                <>
                  <strong>This copy matches what was signed</strong>
                  {check.answer.signers.map((x, i) => (
                    <span key={i}>
                      Signed by {x.name}, {short(x.at)}
                    </span>
                  ))}
                  <span>Sealed by Merlin, {short(check.answer.sealedAt)}</span>
                  <span className="ct-sub">Anyone can do this check at /check with no account. The file is never kept.</span>
                </>
              ) : check.answer.result === "changed" ? (
                <strong>This copy was changed after it was sealed</strong>
              ) : (
                <strong>No sealed record matches this file</strong>
              )}
            </div>
          )}
          {check.err && (
            <p className="pp-err" role="alert">
              {check.err}
            </p>
          )}
        </div>
      )}
      <div className="ct-dtabs" role="tablist" aria-label="About this contract">
        {(
          [
            ["who", "Signers"],
            ["activity", "Activity"],
            ["trail", "Audit trail"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`ct-tab-${k}`} aria-selected={tab === k} aria-controls="ct-tabpanel" className="ct-dtab" data-on={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div id="ct-tabpanel" role="tabpanel" aria-labelledby={`ct-tab-${tab}`} className="ct-tabpanel">
        {tab === "who" && (
          <ol className="ct-dwho">
            {cur.signers.map((x, i) => (
              <li key={i}>
                <span className="ct-num" data-who={x.me ? "me" : "them"}>
                  {i + 1}
                </span>
                <span className="ct-dwho-t">
                  <strong>
                    {x.me ? "You" : x.name}
                    {x.title && !x.me ? `, ${x.title}` : ""}
                  </strong>
                  {!x.me && x.email && <span className="ct-sub">{x.email}</span>}
                </span>
                <span className="ct-dwho-s">{x.state}</span>
              </li>
            ))}
          </ol>
        )}
        {tab === "activity" &&
          (cur.example || !cur.doc ? (
            <p className="ct-sub">Once it is out, this shows when they opened it and for how long, when to follow up with a draft in your words, and the reminders until they sign.</p>
          ) : cur.st === "draft" ? (
            <p className="ct-sub">Nothing yet. Once it is sent, this shows when they open it and the reminders until they sign.</p>
          ) : (
            <ActivityPanel kind="document" id={cur.id} quiet={cur.st === "turn" || cur.st === "signed"} />
          ))}
        {tab === "trail" && (
          <>
            <ol className="ct-trail">
              {cur.events.map((e, i) => (
                <li key={i}>
                  <span>{e.t}</span>
                  <span className="ct-sub" title={stamp(e.at)}>
                    {short(e.at)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="ct-sub">Each step is kept with its time and device, and printed on the last page of the signed PDF.</p>
          </>
        )}
      </div>
      {!cur.example && cur.doc && (
        <div className="ct-secs">
          {live(cur) && (
            <button type="button" className="btn btn-sm" onClick={() => void doVoid(cur)}>
              Void
            </button>
          )}
          {cur.st !== "draft" && (
            <button type="button" className="btn btn-sm" onClick={() => void copyToChange(cur)}>
              Copy to change
            </button>
          )}
          {cur.doc.fields.length > 0 && cur.doc.signers.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => void keep(cur)}>
              Save to reuse
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => openFull(cur.id)}>
            {cur.st === "draft" ? "Open in the field placer" : "Open in full"}
          </button>
          {!live(cur) && cur.st !== "signed" && (
            <button type="button" className="btn btn-sm" onClick={() => void doDelete(cur)}>
              Delete
            </button>
          )}
        </div>
      )}
    </aside>
  );

  /* ----- the table (cards on phones) ----- */
  const cells = (r: Row): [string, string][] => [
    r.sent ? [short(r.sent), `to ${firstOf(r.who)}`] : ["Not sent", ""],
    r.opened ? [short(r.opened), r.openedN > 1 ? `${r.openedN} times` : "once"] : live(r) ? ["Not yet", "Alert is on"] : r.sent ? ["Never", ""] : ["", ""],
    r.st === "signed" ? [short(r.signed), ""] : r.st === "turn" ? [`${firstOf(r.who)}, ${short(r.signed)}`, "You sign next"] : r.st === "declined" ? ["Declined", ""] : live(r) ? ["Not yet", ""] : r.sent ? ["Not signed", ""] : ["", ""],
    live(r) ? (r.ends ? [short(r.ends), `in ${Math.max(0, Math.ceil((Date.parse(r.ends) - nowMs) / DAY))} days`] : ["No end date", ""]) : r.st === "expired" ? [short(r.ends), "ended"] : r.sent ? ["Closed", ""] : ["", ""],
  ];
  const quiet = /^(Not yet|Not sent|Not signed|Never|Closed|None)$/;
  const table = (
    <div className="ct-tablewrap">
      <table className="ct-table">
        <caption className="ct-sr">Your contracts{first ? ", examples" : ""}</caption>
        <thead>
          <tr>
            <th scope="col">
              Contract
              <span>{first ? `${rows.length} examples` : `${rows.length} in all`}</span>
            </th>
            <th scope="col">
              With
              <span>
                {rows.filter((r) => r.linked).length} of {rows.length} on Merlin
              </span>
            </th>
            <th scope="col">
              Status
              <span>{nYou} need you</span>
            </th>
            <th scope="col">
              Sent
              <span>
                {nSent} of {rows.length}
              </span>
            </th>
            <th scope="col">
              Opened
              <span>
                {rows.filter((r) => r.opened).length} of {nSent}
              </span>
            </th>
            <th scope="col">
              Signed
              <span>
                {nDone} of {nSent}
              </span>
            </th>
            <th scope="col">
              Link ends
              <span>{rows.filter(live).length} open</span>
            </th>
            <th scope="col">
              Sealed copy
              <span>{nDone} sealed</span>
            </th>
            <th scope="col">Next step</th>
          </tr>
        </thead>
        <tbody>
          {first && (
            <tr className="ct-exrow">
              <td colSpan={9}>
                <strong>Example rows.</strong> How a contract reads once it is out. Yours replace these. Open one to see its signers, activity and audit trail.
              </td>
            </tr>
          )}
          {shown.map((r) => {
            const cs = cells(r);
            return (
              <tr key={r.id} data-row={r.id} data-on={sel === r.id}>
                <td>
                  <button type="button" className="ct-open" aria-label={`Open ${r.title}${r.co ? `, ${r.co}` : ""}`} aria-expanded={sel === r.id} onClick={() => (setSel(sel === r.id ? null : r.id), setTab("who"))}>
                    <span className="ct-cell-t">
                      {r.title}
                      {r.example && <span className="ct-ex">Example</span>}
                    </span>
                    <span className="ct-cell-s">
                      {r.file}
                      {r.pages ? ` · ${r.pages} pages` : ""}
                    </span>
                  </button>
                </td>
                <td>
                  <span className="ct-with">
                    <span className="ct-tile" style={{ background: tint(r.co || r.who) }} aria-hidden>
                      {initials(r.co || r.who)}
                    </span>
                    <span>
                      <span className="ct-cell-t">{r.co || "No company"}</span>
                      <span className="ct-cell-s">
                        {r.who}
                        {r.whoTitle ? `, ${r.whoTitle}` : ""}
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="ct-chip" data-st={r.st}>
                    {CHIP[r.st]}
                  </span>
                  <span className="ct-cell-s">{r.stSub}</span>
                </td>
                {cs.map(([t, s], i) => (
                  <td key={i}>
                    <span className="ct-cell-t" data-quiet={quiet.test(t)}>
                      {t}
                    </span>
                    {s && <span className="ct-cell-s">{s}</span>}
                  </td>
                ))}
                <td>
                  {r.sealed ? (
                    <span className="ct-sealed">
                      <IconCheck size={13} /> {short(r.sealed)}
                    </span>
                  ) : (
                    <span className="ct-cell-s">{r.st === "turn" ? "After you sign" : live(r) ? "When all sign" : "None"}</span>
                  )}
                </td>
                <td>
                  <button type="button" className={`btn btn-sm ct-next${r.st === "turn" ? " btn-pine" : ""}`} onClick={() => next(r)}>
                    {NEXT[r.st]}
                  </button>
                </td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={9} className="ct-none">
                None here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  const cards = (
    <ul className="ct-cards" aria-label="Your contracts">
      {first && (
        <li className="ct-exrow">
          <strong>Example rows.</strong> How a contract reads once it is out. Yours replace these.
        </li>
      )}
      {shown.map((r) => (
        <li key={r.id} className="ct-card" data-row={r.id}>
          <button type="button" className="ct-open" aria-expanded={sel === r.id} onClick={() => (setSel(sel === r.id ? null : r.id), setTab("who"))}>
            <span className="ct-cell-t">
              {r.title}
              {r.example && <span className="ct-ex">Example</span>}
            </span>
            <span className="ct-cell-s">
              {r.co ? `${r.co} · ` : ""}
              {r.who}
            </span>
          </button>
          <span className="ct-card-row">
            <span className="ct-chip" data-st={r.st}>
              {CHIP[r.st]}
            </span>
            <span className="ct-cell-s">{r.stSub}</span>
            <button type="button" className={`btn btn-sm ct-next${r.st === "turn" ? " btn-pine" : ""}`} onClick={() => next(r)}>
              {NEXT[r.st]}
            </button>
          </span>
          {sel === r.id && detail}
        </li>
      ))}
    </ul>
  );

  /* ----- saved contracts, starters, and what a sealed copy is ----- */
  const tiles = first ? (
    <div className="ct-tiles">
      {STARTERS.map((s) => (
        <div key={s.layout} className="ct-tilecard">
          <span className="ct-tilecard-h">
            <strong>{s.name}</strong>
            <span className="ct-tag">Starter</span>
          </span>
          <span className="ct-sub">{s.meta}</span>
          <span className="ct-sub">Made-up names. The link comes to your own email.</span>
          <button type="button" className="btn" aria-label={`Try the starter ${s.name}`} disabled={!!busy} onClick={() => void tryStarter(s.layout as "two-column" | "nda")}>
            Try this one
          </button>
        </div>
      ))}
      <SaveYourOwn />
    </div>
  ) : (
    <div className="ct-tiles">
      {savedTiles.map((s) => (
        <div key={s.id} className="ct-tilecard">
          <span className="ct-tilecard-h">
            <strong>{s.name}</strong>
            <button type="button" className="ct-x" aria-label={`Delete the saved ${s.name}`} onClick={() => void unsave(s)}>
              <IconX size={14} />
            </button>
          </span>
          <span className="ct-sub">
            {s.pages} {s.pages === 1 ? "page" : "pages"} · {s.fields} {s.fields === 1 ? "field" : "fields"} placed
          </span>
          <span className="ct-sub">{s.uses ? `Sent ${s.uses} ${s.uses === 1 ? "time" : "times"}, last ${short(s.lastUsedAt)}` : `Saved ${short(s.savedAt)}, not sent yet`}</span>
          <button type="button" className="btn" aria-label={`Use the saved ${s.name}`} disabled={!!busy} onClick={() => void useSaved(s)}>
            Use it
          </button>
        </div>
      ))}
      <SaveYourOwn />
    </div>
  );
  const seal = (
    <section className="ct-seal" data-first={first} aria-labelledby="ct-seal-h">
      <h2 className="ct-h2 ct-seal-h" id="ct-seal-h">
        <ShieldIcon /> What a sealed copy is
      </h2>
      {first ? (
        <>
          <p>When everyone has signed, Merlin stamps every answer into the PDF, adds an audit trail page and seals the file: a fingerprint of that exact file, signed with Merlin&#39;s key. You both get it by email.</p>
          <p>Anyone you send it to can check it. They drop the PDF on the check page, with no account, and see whether it is the file that was signed, who signed and when.</p>
          {sealShown && (
            <ul className="ct-seal-cases">
              <li>
                <strong>It matches.</strong> The check names each signer and the time they signed.
              </li>
              <li>
                <strong>It was changed.</strong> One character is enough for the check to say so.
              </li>
              <li>
                <strong>No record.</strong> It was saved again, printed to a new PDF or signed somewhere else.
              </li>
            </ul>
          )}
          <p className="ct-sub">The seal is checked by Merlin. A PDF reader on its own does not show it.</p>
          <button type="button" className="btn" aria-expanded={sealShown} onClick={() => setSealShown((x) => !x)}>
            {sealShown ? "Hide the check" : "See what a check shows"}
          </button>
        </>
      ) : (
        <>
          <p>Every signed contract is sealed: a fingerprint of the exact file, signed with Merlin&#39;s key. Anyone can check a copy, with no account, and see who signed and when.</p>
          <a className="btn" href="/check" target="_blank" rel="noopener">
            Check a signed copy
          </a>
        </>
      )}
    </section>
  );

  return (
    <>
      {header}
      <div className="ct-page">
        <PageStrip page="contracts" own={first ? 0 : rows.length}>
          {STRIP}
        </PageStrip>
        <section className="ct-head" aria-labelledby="ct-h">
          <div className="ct-headrow">
            <h1 id="ct-h" className="ct-h1">
              Contracts
            </h1>
            <span className="ct-lead">Drop in a contract you wrote anywhere. Merlin finds where everyone signs and places the fields.</span>
            {planPill && <span className="ct-planpill">{planPill}</span>}
            <a className="ct-link" href="/check" target="_blank" rel="noopener">
              Check a copy
            </a>
          </div>
          {zone}
          {dropErr && (
            <p className="pp-err" role="alert">
              {dropErr}
            </p>
          )}
          {!data.canBuild && <CloseBuildPrompt compact />}
        </section>

        <section className="ct-list" aria-label="Your contracts">
          <div className="ct-bar">
            <div className="ct-views" role="tablist" aria-label="Views">
              {(
                [
                  ["all", "All"],
                  ["you", "Needs you"],
                  ["wait", "Waiting on them"],
                  ["done", "Signed"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={viewKey === k} className="ct-vtab" data-on={viewKey === k} onClick={() => setViewKey(k)}>
                  {label} {count(k)}
                </button>
              ))}
            </div>
            <button type="button" className="tp-flink ct-alertslink" onClick={() => c.openPage("alerts")}>
              Alerts: opened, signed, declined
            </button>
          </div>
          <div className="ct-tablebox" data-detail={!!cur && !c.phone}>
            {c.phone ? cards : table}
            {!c.phone && detail}
          </div>
          <div className="ct-status">
            <span>
              {first
                ? "None of your own yet. A contract links to its company on Merlin, so your pipeline moves when it is sent and signed."
                : `${nWait} waiting on a signer · ${nYou} need you · ${nDone} signed and sealed`}
            </span>
            <span className="ct-sub">Up to 10 signers a contract · 15 MB a file · sending never spends credits</span>
          </div>
        </section>

        <div className="ct-lower">
          <section className="ct-saved" aria-labelledby="ct-saved-h">
            <div className="ct-saved-head">
              <h2 className="ct-h2" id="ct-saved-h">
                {first ? "Starter contracts" : "Saved contracts"}
              </h2>
              <span className="ct-sub">{first ? "Two made-up contracts to try the whole flow, start to sealed copy." : "Contracts you send again and again, with their fields already placed."}</span>
            </div>
            {tiles}
          </section>
          {seal}
        </div>
      </div>
    </>
  );
}

function SaveYourOwn() {
  return (
    <div className="ct-tilecard ct-tilecard-dash">
      <strong>Save your own</strong>
      <span className="ct-sub">When you send a contract, switch on Save to reuse. Next time its fields are already placed and you only pick who it is for.</span>
    </div>
  );
}
const DocIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);
const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
