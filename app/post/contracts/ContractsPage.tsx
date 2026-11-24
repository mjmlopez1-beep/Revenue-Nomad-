"use client";

/**
 * Contracts (?p=contracts), laid out like Dropbox Sign's Documents screen: the title with Sign
 * documents beside it, two tabs (Your contracts, Templates), a search box and a Status filter,
 * then one plain table: Name, Status, Pending, Updated, the one action that matters (Download PDF,
 * Continue, Sign) and a ••• menu. A name opens its details on the right: who signs and where each
 * is, the activity while it is out, and the audit trail.
 *
 * Sign documents opens the four-step sender flow (SendWizard.tsx). Signing itself, the code to the
 * signer's email, the sealed PDF and its audit trail page are Merlin's existing signing.
 *
 * Opened from elsewhere at a contract (open.ts, or ?p=contracts&dc=<id>): a draft reopens in the
 * flow, anything else opens its details.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProposalsView } from "@/lib/proposals/types";
import type { DocumentRec } from "@/lib/documents/types";
import type { SavedContract } from "@/lib/documents/templates";
import { IconX, errorText, useToast } from "../../ui/shared";
import { useApp } from "../shell/pages";
import { ShellHeader } from "../shell/Header";
import { dapi } from "../DocBuilder";
import { ActivityPanel } from "../Activity";
import { stamp } from "../../sign/doc";
import { SendWizard, type WizardStart } from "./SendWizard";
import { onOpenContract, takeContract } from "./open";
import "./contractslist.css";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const short = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "-");

async function load(): Promise<ProposalsView | { error: string }> {
  try {
    const r = await fetch("/api/proposals", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: errorText(r.status, j.error, "Contracts didn't load. Try again.") };
  } catch {
    return { error: NETWORK };
  }
}
async function loadSaved(): Promise<SavedContract[]> {
  try {
    const r = await fetch("/api/documents?saved=1", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => []);
    return r.ok && Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

/* ---------- a contract's status, in Dropbox's words ---------- */

type St = "draft" | "awaiting" | "yours" | "signed" | "declined" | "expired" | "void";
const SAY: Record<St, string> = { draft: "Draft", awaiting: "Awaiting signature", yours: "Awaiting your signature", signed: "Signed", declined: "Declined", expired: "Expired", void: "Canceled" };
const FILTERS: ["all" | St, string][] = [
  ["all", "All"],
  ["yours", "Awaiting your signature"],
  ["awaiting", "Awaiting signature"],
  ["signed", "Signed"],
  ["draft", "Draft"],
  ["declined", "Declined"],
  ["expired", "Expired"],
  ["void", "Canceled"],
];
const statusOf = (d: DocumentRec): St => {
  if (d.status === "draft") return "draft";
  if (d.status === "signed") return "signed";
  if (d.status === "declined") return "declined";
  if (d.status === "expired") return "expired";
  if (d.status === "void") return "void";
  const me = d.signers.find((x) => x.sender);
  return me && (me.status === "sent" || me.status === "viewed") ? "yours" : "awaiting";
};
const live = (s: St) => s === "awaiting" || s === "yours";
const pendingOf = (d: DocumentRec) => (live(statusOf(d)) ? d.signers.filter((x) => x.status !== "signed").map((x) => (x.sender ? "You" : x.name)) : []);
const updatedOf = (d: DocumentRec) => d.completedAt ?? d.events.at(-1)?.at ?? d.updatedAt;

const EVENT_WORDS: Record<string, string> = {
  uploaded: "Uploaded",
  sent: "Sent for signature",
  notified: "Email sent",
  viewed: "Viewed",
  code_sent: "Code sent",
  code_failed: "A wrong code was typed",
  code_verified: "Email confirmed with a code",
  signed: "Signed",
  declined: "Declined",
  voided: "Canceled",
  completed: "Completed: everyone signed",
  copy_sent: "Signed PDF emailed",
  expired_open: "Opened after the link expired",
};
const SIGNER_SAY = { waiting: "Waiting for their turn", sent: "Awaiting signature", viewed: "Viewed", signed: "Signed", declined: "Declined" } as const;

export function ContractsPage() {
  const c = useApp();
  const toast = useToast();
  const [data, setData] = useState<ProposalsView | null>(null);
  const [saved, setSaved] = useState<SavedContract[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [wizard, setWizard] = useState<WizardStart | null>(null);
  const [tab, setTab] = useState<"docs" | "templates">("docs");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | St>("all");
  const [menu, setMenu] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(() => takeContract() ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("dc") : null));
  const drawer = useRef<HTMLHeadingElement>(null);

  const reload = useCallback(async () => {
    const [r, s] = await Promise.all([load(), loadSaved()]);
    if ("error" in r) setError(r.error);
    else setData(r), setError(null);
    setSaved(s);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const put = useCallback((x: DocumentRec) => setData((d) => (d ? { ...d, documents: [x, ...d.documents.filter((y) => y.id !== x.id)] } : d)), []);
  const drop = (id: string) => setData((d) => (d ? { ...d, documents: d.documents.filter((y) => y.id !== id) } : d));

  // A contract asked for from another page: a draft reopens in the flow, anything else opens its details.
  useEffect(() => onOpenContract((id) => (id ? setAsked(id) : (setWizard(null), setSel(null)))), []);
  useEffect(() => {
    if (!asked || !data) return;
    const d = data.documents.find((x) => x.id === asked);
    setAsked(null);
    if (!d) return;
    if (d.status === "draft") setWizard({ kind: "draft", doc: d });
    else setSel(d.id);
  }, [asked, data]);
  useEffect(() => {
    if (sel) drawer.current?.focus({ preventScroll: true });
  }, [sel]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest(".cl-more") && setMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const docs = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return [...data.documents]
      .sort((a, b) => Date.parse(updatedOf(b)) - Date.parse(updatedOf(a)))
      .filter((d) => filter === "all" || statusOf(d) === filter)
      .filter((d) => !t || [d.title, d.fileName, d.company.name, ...d.signers.flatMap((x) => [x.name, x.email])].some((s) => s.toLowerCase().includes(t)));
  }, [data, q, filter]);
  const tpls = useMemo(() => {
    const t = q.trim().toLowerCase();
    return saved.filter((s) => !t || s.name.toLowerCase().includes(t) || s.fileName.toLowerCase().includes(t));
  }, [saved, q]);
  const cur = data?.documents.find((x) => x.id === sel) ?? null;

  /* ----- actions ----- */
  const signNow = async (d: DocumentRec) => {
    const w = window.open("", "_blank");
    const r = await dapi<{ link: string }>({ op: "mylink", id: d.id });
    if (r.error) return w?.close(), toast(r.error, true);
    if (w) w.location.href = r.link;
    else window.location.href = r.link;
  };
  const copy = async (d: DocumentRec) => {
    const r = await dapi<DocumentRec>({ op: "copy", id: d.id });
    if (r.error) return toast(r.error, true);
    put(r);
    setSel(null);
    setWizard({ kind: "draft", doc: r });
  };
  const cancel = async (d: DocumentRec) => {
    if (!window.confirm("Cancel this signature request? Every signer's link stops working.")) return;
    const r = await dapi<DocumentRec>({ op: "void", id: d.id });
    if (r.error) return toast(r.error, true);
    put(r);
    toast("Canceled. The signing links stopped working.");
  };
  const remove = async (d: DocumentRec) => {
    if (!window.confirm(`Delete ${d.title}? It can't be undone.`)) return;
    const r = await dapi<{ ok: boolean }>({ op: "delete", id: d.id });
    if (r.error) return toast(r.error, true);
    drop(d.id);
    setSel(null);
    toast("Deleted.");
  };
  const keep = async (d: DocumentRec) => {
    const r = await dapi<{ name: string }>({ op: "save", id: d.id });
    if (r.error) return toast(r.error, true);
    toast(`Saved as a template: ${r.name}.`);
    setSaved(await loadSaved());
  };
  const useTpl = async (s: SavedContract) => {
    const r = await fetch(`/api/documents?saved=${encodeURIComponent(s.id)}`)
      .then(async (x) => (x.ok ? ((await x.json()) as { saved: SavedContract; document: DocumentRec }) : null))
      .catch(() => null);
    if (!r) return toast("That template didn't open. Try again.", true);
    setWizard({ kind: "saved", saved: r.saved, doc: r.document });
  };
  const unsave = async (s: SavedContract) => {
    if (!window.confirm(`Delete the template ${s.name}? Contracts sent from it keep their own copies.`)) return;
    const r = await dapi<{ ok: boolean }>({ op: "unsave", id: s.id });
    if (r.error) return toast(r.error, true);
    setSaved((x) => x.filter((y) => y.id !== s.id));
    toast("Template deleted.");
  };

  const header = (
    <ShellHeader
      crumbs={[{ label: "Home", href: c.hrefOf("today"), go: () => c.openPage("today") }]}
      title="Contracts"
      phone={c.phone}
      onHome={() => c.openPage("today")}
      actions={c.headerActions}
      hosts={null}
    />
  );

  if (wizard && data)
    return (
      <SendWizard
        key={wizard.kind === "new" ? "new" : wizard.doc.id}
        data={data}
        start={wizard}
        saved={saved}
        onSaved={put}
        onClose={(draft) => {
          setWizard(null);
          if (draft) toast("Saved as a draft. Continue it from the list.");
        }}
        onSent={(d, words) => {
          put(d);
          setWizard(null);
          setTab("docs");
          setFilter("all");
          toast(words);
          void loadSaved().then(setSaved);
        }}
      />
    );

  if (!data)
    return (
      <>
        {header}
        <div className="cl-page">
          {error ? (
            <>
              <p className="cl-err" role="alert">
                {error}
              </p>
              <button type="button" className="cl-btn" onClick={() => void reload()}>
                Try again
              </button>
            </>
          ) : (
            <div className="cl-skel" aria-busy="true" />
          )}
        </div>
      </>
    );

  const action = (d: DocumentRec) => {
    const s = statusOf(d);
    if (s === "signed")
      return (
        <a className="cl-btn cl-btn-line" href={`/api/documents/file?id=${encodeURIComponent(d.id)}&final=1&download=1`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12M7 10l5 5 5-5M4 19h16" />
          </svg>
          Download PDF
        </a>
      );
    if (s === "yours")
      return (
        <button type="button" className="cl-btn cl-btn-dark" onClick={() => void signNow(d)}>
          Sign
        </button>
      );
    if (s === "draft")
      return (
        <button type="button" className="cl-btn cl-btn-line" onClick={() => setWizard({ kind: "draft", doc: d })}>
          Continue
        </button>
      );
    return (
      <button type="button" className="cl-btn cl-btn-line" onClick={() => setSel(d.id)}>
        Details
      </button>
    );
  };
  const more = (d: DocumentRec) => {
    const s = statusOf(d);
    const items: [string, () => void][] = [["View details", () => setSel(d.id)]];
    if (s === "signed" && d.copyUrl) items.push(["Open signed copy page", () => window.open(d.copyUrl!, "_blank", "noopener")]);
    if (s !== "draft") items.push(["Copy and send again", () => void copy(d)]);
    if (d.fields.length && d.signers.length) items.push(["Save as template", () => void keep(d)]);
    if (live(s)) items.push(["Cancel signature request", () => void cancel(d)]);
    if (!live(s) && s !== "signed") items.push(["Delete", () => void remove(d)]);
    return (
      <span className="cl-more">
        <button type="button" className="cl-dots" aria-label={`More for ${d.title}`} aria-expanded={menu === d.id} onClick={() => setMenu(menu === d.id ? null : d.id)}>
          •••
        </button>
        {menu === d.id && (
          <span className="cl-menu" role="menu">
            {items.map(([label, fn]) => (
              <button key={label} type="button" role="menuitem" onClick={() => (setMenu(null), fn())}>
                {label}
              </button>
            ))}
          </span>
        )}
      </span>
    );
  };

  const docTable = (
    <table className="cl-table">
      <caption className="cl-sr">Your contracts</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Status</th>
          <th scope="col">Pending</th>
          <th scope="col">Updated</th>
          <th scope="col">
            <span className="cl-sr">Action</span>
          </th>
          <th scope="col">
            <span className="cl-sr">More</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => {
          const s = statusOf(d);
          const p = pendingOf(d);
          return (
            <tr key={d.id} data-on={sel === d.id}>
              <td>
                <button type="button" className="cl-name" onClick={() => setSel(d.id)}>
                  {d.title}
                </button>
              </td>
              <td>
                <span className="cl-st" data-st={s}>
                  {SAY[s]}
                </span>
              </td>
              <td className="cl-pend">{p.length ? (p.length === 1 ? p[0] : `${p[0]} +${p.length - 1}`) : "-"}</td>
              <td className="cl-date">{short(updatedOf(d))}</td>
              <td className="cl-act">{action(d)}</td>
              <td className="cl-act">{more(d)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const tplTable = (
    <table className="cl-table">
      <caption className="cl-sr">Your templates</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Signers</th>
          <th scope="col">Fields</th>
          <th scope="col">Last used</th>
          <th scope="col">
            <span className="cl-sr">Action</span>
          </th>
          <th scope="col">
            <span className="cl-sr">More</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {tpls.map((s) => (
          <tr key={s.id}>
            <td>
              <span className="cl-name cl-name-plain">{s.name}</span>
            </td>
            <td className="cl-pend">{s.roles.length + (s.meSigns ? 1 : 0)}</td>
            <td className="cl-pend">{s.fields}</td>
            <td className="cl-date">{s.lastUsedAt ? short(s.lastUsedAt) : "Never"}</td>
            <td className="cl-act">
              <button type="button" className="cl-btn cl-btn-line" disabled={!data.canBuild} onClick={() => void useTpl(s)}>
                Use template
              </button>
            </td>
            <td className="cl-act">
              <span className="cl-more">
                <button type="button" className="cl-dots" aria-label={`More for ${s.name}`} aria-expanded={menu === s.id} onClick={() => setMenu(menu === s.id ? null : s.id)}>
                  •••
                </button>
                {menu === s.id && (
                  <span className="cl-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => (setMenu(null), void unsave(s))}>
                      Delete template
                    </button>
                  </span>
                )}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const empty =
    tab === "docs" ? (
      data.documents.length === 0 ? (
        <div className="cl-empty">
          <strong>No contracts yet</strong>
          <p>Upload a PDF you wrote anywhere, add who signs, place the fields and send. You&#39;ll see each one here as it moves to signed.</p>
          <button type="button" className="cl-btn cl-btn-dark" onClick={() => setWizard({ kind: "new" })}>
            Sign documents
          </button>
        </div>
      ) : (
        <p className="cl-none">No contracts match.</p>
      )
    ) : saved.length === 0 ? (
      <div className="cl-empty">
        <strong>No templates yet</strong>
        <p>Templates are for contracts you send again and again, like an NDA or a standard agreement. On the last step of sending, check &quot;Save it as a reusable template&quot;.</p>
      </div>
    ) : (
      <p className="cl-none">No templates match.</p>
    );

  return (
    <>
      {header}
      <div className="cl-page" data-drawer={!!cur}>
        <div className="cl-main">
          <div className="cl-head">
            <h1 className="cl-h1">Contracts</h1>
            <button type="button" className="cl-btn cl-btn-dark cl-btn-lg" onClick={() => setWizard({ kind: "new" })}>
              Sign documents
            </button>
          </div>
          <div className="cl-tabsrow">
            <div className="cl-tabs" role="tablist" aria-label="Contracts and templates">
              <button type="button" role="tab" aria-selected={tab === "docs"} className="cl-tab" onClick={() => (setTab("docs"), setMenu(null))}>
                Your contracts
              </button>
              <button type="button" role="tab" aria-selected={tab === "templates"} className="cl-tab" onClick={() => (setTab("templates"), setMenu(null), setSel(null))}>
                Templates
              </button>
            </div>
            <label className="cl-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="cl-sr">Search</span>
              <input type="search" placeholder="Search by name, email, or keyword" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {tab === "docs" && data.documents.length > 0 && (
            <div className="cl-filter">
              <span>Filter by:</span>
              <label className="cl-chip" data-on={filter !== "all"}>
                <span className="cl-sr">Status</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | St)}>
                  {FILTERS.map(([k, label]) => (
                    <option key={k} value={k}>
                      {k === "all" ? "Status" : label}
                    </option>
                  ))}
                </select>
              </label>
              {filter !== "all" && (
                <button type="button" className="cl-clear" onClick={() => setFilter("all")}>
                  Clear
                </button>
              )}
            </div>
          )}
          {tab === "docs" ? (docs.length ? docTable : empty) : tpls.length ? tplTable : empty}
        </div>

        {cur && (
          <aside className="cl-drawer" aria-labelledby="cl-dr-h">
            <div className="cl-dr-top">
              <h2 id="cl-dr-h" ref={drawer} tabIndex={-1}>
                {cur.title}
              </h2>
              <button type="button" className="cl-dots" aria-label="Close details" onClick={() => setSel(null)}>
                <IconX size={16} />
              </button>
            </div>
            <span className="cl-st" data-st={statusOf(cur)}>
              {SAY[statusOf(cur)]}
            </span>
            <p className="cl-dr-meta">
              {cur.fileName} · {cur.pages.length} {cur.pages.length === 1 ? "page" : "pages"}
              {cur.sentAt ? ` · sent ${short(cur.sentAt)}` : ""}
              {cur.expiresAt && live(statusOf(cur)) ? ` · link expires ${short(cur.expiresAt)}` : ""}
            </p>
            <div className="cl-dr-act">{action(cur)}</div>

            <h3 className="cl-h3">Signers</h3>
            <ol className="cl-signers">
              {cur.signers.map((x, i) => (
                <li key={x.id}>
                  <span className="cl-n">{i + 1}</span>
                  <span>
                    <strong>
                      {x.name}
                      {x.sender ? " (you)" : ""}
                    </strong>
                    <span>{x.email}</span>
                  </span>
                  <span className="cl-sst" data-st={x.status}>
                    {cur.status === "draft" ? "Not sent" : SIGNER_SAY[x.status]}
                    {x.signedAt ? ` ${short(x.signedAt)}` : x.viewedAt && x.status === "viewed" ? ` ${short(x.viewedAt)}` : ""}
                  </span>
                </li>
              ))}
            </ol>
            {cur.signers.find((x) => x.declineReason) && <p className="cl-dr-note">Reason given: &quot;{cur.signers.find((x) => x.declineReason)!.declineReason}&quot;</p>}

            {live(statusOf(cur)) && (
              <>
                <h3 className="cl-h3">Activity</h3>
                <ActivityPanel kind="document" id={cur.id} quiet={statusOf(cur) === "yours"} />
              </>
            )}

            <h3 className="cl-h3">Audit trail</h3>
            <ol className="cl-trail">
              {cur.events
                .filter((e) => e.kind !== "code_sent")
                .map((e, i) => (
                  <li key={i}>
                    <span>
                      {EVENT_WORDS[e.kind] ?? e.kind}
                      {e.who ? ` · ${cur.signers.find((x) => x.email === e.who)?.name ?? e.who}` : ""}
                    </span>
                    <span className="cl-trail-t">{stamp(e.at)}</span>
                  </li>
                ))}
            </ol>
            {cur.finalSha256 && (
              <p className="cl-dr-note">
                Sealed by Merlin. Anyone can confirm a copy is the signed original at{" "}
                <a href="/check" target="_blank" rel="noopener">
                  /check
                </a>
                .
              </p>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
