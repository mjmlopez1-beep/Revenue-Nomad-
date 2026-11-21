"use client";

/**
 * Smart ways in (lib/paths), everywhere they show:
 *
 *   - Your network: "Add your LinkedIn connections" (the member's own export, its 3 steps, Delete)
 *     and "Your hidden paths", the companies in their Crystal Ball and saved views where someone
 *     they know is a way in, best first.
 *   - The record: "Smart ways in", above "Your way in" (Drawer.tsx places it).
 *   - Crystal Ball: the chip "2 ways in through people you know".
 *
 * Each path is one sentence, one next action and a note in the member's own voice that they send
 * themselves. Everything here is the signed-in member's own: the server never sends anyone else's.
 */
import { useMemo, useRef, useState } from "react";
import type { CoInfo } from "../model";
import { useCopy } from "../Credits";
import { CompanyLogo, useToast } from "../../ui/shared";
import { CSV_PROBLEM_WORDS, parseConnections } from "@/lib/paths/csv";
import { EXPORT_STEPS, FILE_MAX_BYTES, waysWords, type PathView, type TargetView } from "@/lib/paths/types";
import { WarmthChip } from "./parts";
import { pathsAct, useCompanyPaths, usePathCount, usePaths } from "./usePaths";
import "./paths.css";

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const n = (x: number) => x.toLocaleString("en-US");

/* ---------- one way in ---------- */

export function PathRow({ p, compact = false }: { p: PathView; compact?: boolean }) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const mail = p.via.email ? `mailto:${encodeURIComponent(p.via.email)}?subject=${encodeURIComponent(p.note.subject)}&body=${encodeURIComponent(p.note.body)}` : null;
  return (
    <div className={`sp-path${compact ? " sp-path-c" : ""}`} data-path={p.kind}>
      <p className="sp-line">{p.line}</p>
      <p className="sp-do">
        <span className={`sp-str sp-str-${p.strength === "Strong" ? "s" : p.strength === "Good" ? "g" : "w"}`}>{p.degree === 1 ? "You know them" : "Through someone you know"}</span>
        {p.via.warmth && <WarmthChip w={p.via.warmth} />}
        <strong>{p.action}</strong>
      </p>
      <div className="sp-acts">
        <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide the note" : p.degree === 1 ? `Draft a note to ${p.via.first}` : "Draft the ask"}
        </button>
      </div>
      {open && (
        <div className="nw-note sp-note">
          <span className="nw-note-h">
            To {p.via.name} · {p.note.subject}
          </span>
          <p>{p.note.body}</p>
          <div className="nw-row nw-wrap">
            {mail && (
              <a className="btn btn-sm btn-primary" href={mail}>
                Open in your email
              </a>
            )}
            {p.via.linkedin && (
              <a className="btn btn-sm" href={p.via.linkedin} target="_blank" rel="noopener noreferrer">
                Open on LinkedIn
              </a>
            )}
            <button type="button" className="btn btn-sm" onClick={() => void copy(p.note.body, "Note copied.")}>
              Copy
            </button>
          </div>
          <span className="nw-small">Merlin never sends for you. You review it and send it yourself.</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Your network: the LinkedIn import ---------- */

export function LinkedInImport() {
  const { view } = usePaths();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"read" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  if (!view) return null;
  const li = view.linkedin;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (f.size > FILE_MAX_BYTES) return setErr("That file is larger than LinkedIn's Connections.csv can be. Pick Connections.csv from the export.");
    setBusy("read");
    try {
      const text = await f.text();
      const r = parseConnections(text);
      if (!r.ok) {
        setErr(CSV_PROBLEM_WORDS[r.problem]);
        return;
      }
      const res = await pathsAct("import", text);
      if (res.error) setErr(res.error);
      else toast(res.message ?? "Added.");
    } catch {
      setErr("That file couldn't be read. Pick Connections.csv from LinkedIn's export.");
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  };
  const input = (
    <input ref={file} type="file" accept=".csv,text/csv" className="sp-file" tabIndex={-1} aria-hidden onChange={(e) => void pick(e.target.files?.[0])} />
  );
  return (
    <section className="tp-card nw-card sp-card" id="nw-linkedin" aria-labelledby="sp-li-h">
      <div className="sp-card-h">
        <span className="sp-in" aria-hidden>
          in
        </span>
        <h2 className="tp-card-h" id="sp-li-h">
          {li ? "Your LinkedIn connections" : "Add your LinkedIn connections"}
        </h2>
      </div>
      {li ? (
        <>
          <p className="nw-body num">
            {n(li.rows)} connections · {n(li.matched)} at companies on Merlin · added {fmtDay(li.at)}
          </p>
          <p className="nw-small">Only you see them. Merlin never contacts them and never shows them to another member.</p>
        </>
      ) : (
        <>
          <p className="nw-body">
            Upload the connections file LinkedIn gives you. Merlin matches your connections with your Google contacts and the members you know, and finds the ways in that are too many
            steps away to see. Your connections stay yours: only you see them.
          </p>
          <ol className="sp-steps">
            {EXPORT_STEPS.map((s, k) => (
              <li key={k}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {err && (
        <p className="sp-err" role="alert">
          {err}
        </p>
      )}
      {input}
      {ask ? (
        <div className="nw-confirm" role="group" aria-label="Delete your LinkedIn connections?">
          <p>Merlin deletes your connections and every way in found from them. This can&apos;t be undone.</p>
          <div className="nw-row">
            <button
              type="button"
              className="btn nw-danger-solid"
              disabled={busy === "delete"}
              aria-busy={busy === "delete"}
              onClick={async () => {
                setBusy("delete");
                const r = await pathsAct("delete");
                setBusy(null);
                setAsk(false);
                toast(r.error ?? r.message ?? "Deleted.", !!r.error);
              }}
            >
              {busy === "delete" ? "Deleting" : "Delete them"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAsk(false)}>
              Keep them
            </button>
          </div>
        </div>
      ) : (
        <div className="nw-row nw-wrap sp-row">
          <button type="button" className={`btn${li ? "" : " btn-primary"}`} disabled={!!busy || view.importsLeft <= 0} aria-busy={busy === "read"} onClick={() => file.current?.click()}>
            {busy === "read" ? "Reading your connections" : li ? "Upload a newer file" : "Choose Connections.csv"}
          </button>
          {li && (
            <button type="button" className="btn nw-danger" disabled={!!busy} onClick={() => setAsk(true)}>
              Delete my LinkedIn connections
            </button>
          )}
        </div>
      )}
      {view.importsLeft <= 0 && <p className="nw-small">That&apos;s 3 uploads today. Upload again tomorrow.</p>}
      {!li && <p className="nw-small">Merlin keeps each connection&apos;s name, company, position and the day you connected. It never contacts them. Delete them any time.</p>}
    </section>
  );
}

/* ---------- Your network: Your hidden paths ---------- */

function TargetRow({ t, info, onOpen }: { t: TargetView; info: CoInfo | undefined; onOpen: () => void }) {
  const name = t.name ?? info?.c.shownName ?? null;
  const tags = [t.ball ? "In your Crystal Ball" : null, t.view ? `Saved view: ${t.view}` : null].filter(Boolean).join(" · ");
  return (
    <li className="np-row sp-target" data-target={t.id}>
      <div className="np-co">
        <CompanyLogo name={name ?? "?"} domain={name ? (info?.c.iconDomain ?? info?.domain ?? null) : null} size="md" />
        <div className="np-co-t">
          <button type="button" className="np-co-name" onClick={onOpen}>
            {name ?? "A locked company"}
          </button>
          <span className="np-fit">{[t.facts, tags].filter(Boolean).join(" · ")}</span>
        </div>
        <span className="chip chip-outline sp-count num">{t.count === 1 ? "1 way in" : `${t.count} ways in`}</span>
      </div>
      <PathRow p={t.best} />
      <div className="np-acts">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onOpen}>
          {t.count > 1 ? `See all ${t.count} on the record` : "Open the record"}
        </button>
      </div>
    </li>
  );
}

export function HiddenPaths({ infos, openCompany, google }: { infos: CoInfo[]; openCompany: (id: string) => void; google: boolean }) {
  const { view, failed } = usePaths();
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  const [more, setMore] = useState(false);
  if (!view) return failed ? <p className="nw-muted">We couldn&apos;t load your hidden paths. Refresh the page to try again.</p> : null;
  // Nothing to look through yet: the LinkedIn card below says how to start.
  if (!view.linkedin && !google) return null;
  const all = view.targets;
  const shown = more ? all : all.slice(0, 8);
  const total = Object.keys(view.counts).length;
  return (
    <section className="np-sec sp-sec" id="nw-paths" aria-labelledby="nw-paths-h">
      <div className="np-sec-h">
        <h2 className="nw-h2" id="nw-paths-h">
          Your hidden paths <span className="num np-n">{all.length}</span>
        </h2>
        <p className="nw-muted">Companies in your Crystal Ball and saved views where someone you know is a way in, even a few steps away. Best first, with what to do.</p>
      </div>
      {all.length ? (
        <>
          <ul className="np-list" aria-label="Your hidden paths, best first">
            {shown.map((t) => (
              <TargetRow key={t.id} t={t} info={byId.get(t.id)} onOpen={() => openCompany(t.id)} />
            ))}
          </ul>
          {all.length > shown.length && (
            <button type="button" className="btn btn-ghost nw-more" onClick={() => setMore(true)}>
              Show all {all.length}
            </button>
          )}
        </>
      ) : (
        <div className="np-empty" role="status">
          <p className="nw-body">
            {total
                ? `You have ways in at ${n(total)} ${total === 1 ? "company" : "companies"}, none of them in your Crystal Ball or saved views yet. A company's record shows its smart ways in whenever you have one.`
                : "No ways in yet at companies on Merlin. As Merlin learns more seats and people, new ones show here."}
          </p>
        </div>
      )}
    </section>
  );
}

/* ---------- the record ---------- */

/** "Smart ways in": the best ways into this company through people the member knows. Above "Your way in" on the record. */
export function SmartWaysIn({ i }: { i: CoInfo }) {
  const c = useCompanyPaths(i.c.id);
  const count = usePathCount(i.c.id);
  const [all, setAll] = useState(false);
  if (!c?.paths.length) return null;
  const list = all ? c.paths : c.paths.slice(0, 2);
  return (
    <section className="tp-dsec sp-way" aria-labelledby="sp-way-h">
      <h3 className="tp-dsec-h" id="sp-way-h">
        Smart ways in <span className="nw-muted sp-way-n">{waysWords(count?.n ?? c.paths.length)}</span>
      </h3>
      <div className="sp-way-list">
        {list.map((p) => (
          <PathRow key={p.key} p={p} compact />
        ))}
      </div>
      {c.paths.length > list.length && (
        <button type="button" className="nw-link sp-way-more" onClick={() => setAll(true)}>
          Show {c.paths.length - list.length} more
        </button>
      )}
      <p className="nw-small">From your own LinkedIn connections, contacts and messages. Only you see this.</p>
    </section>
  );
}

/* ---------- Crystal Ball ---------- */

/** Crystal Ball's chip: "2 ways in through people you know". Nothing without any. */
export function PathsChip({ companyId }: { companyId: string }) {
  const c = usePathCount(companyId);
  if (!c?.n) return null;
  return (
    <span className="sp-chip" data-paths={c.n} title="Open the company to see who and how">
      {waysWords(c.n)}
    </span>
  );
}

/** The companies the member has a way into (public ids), for Crystal Ball's "Where you know someone". */
export function usePathIds(): Set<string> {
  const { view } = usePaths();
  return useMemo(() => new Set(Object.keys(view?.counts ?? {})), [view]);
}
