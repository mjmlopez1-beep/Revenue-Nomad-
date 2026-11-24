"use client";

/**
 * "Bring in who you know" (People.dc.html, Getting started step 3): the three sources side by side,
 * each with what Merlin reads and what it never does, and the one button that brings it in. The
 * People page draws it beside the table (Tools, Sources) and inline in "People I know" on a first
 * visit; it can stand anywhere else that needs the step.
 *
 * The sources are independent (the owner's decision): Google contacts and calendar (Your network,
 * lib/google, only while RN_GOOGLE is on), the member's own LinkedIn connections file and any
 * contacts CSV (lib/paths). Each alone brings in people you know and ways in; together they merge.
 *
 *   Google     the Connect button of Your network (network/Network.tsx), read-only, the same words
 *   LinkedIn   Connections.csv, read in the browser first (lib/paths/csv.ts parseConnections), then
 *              sent whole, as Your network's LinkedIn card does (network/SmartPaths.tsx)
 *   A CSV      read in the browser (readContacts): Merlin guesses the name, company, title and
 *              email columns, the member checks them and sees a preview, and only those four
 *              columns are sent (pickColumns). No other column of their file reaches Merlin.
 *
 * After a file goes in it says what Merlin found, from the member's own counts (never a guess):
 * how many people they know at companies on Merlin, the warmest three, and the next step.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAutoPick } from "./useAutoPick";
import { IconX, useToast } from "../../ui/shared";
import {
  CONTACTS_PROBLEM_WORDS, CSV_PROBLEM_WORDS, mapProblem, parseConnections, pickColumns, readContacts, type ColumnMap, type ContactField, type ContactsFile,
} from "@/lib/paths/csv";
import { EXPORT_STEPS, FILE_MAX_BYTES, namesOnlyShort, namesOnlyWords, type KnownPersonView, type LinkedInInfo, type PathsView } from "@/lib/paths/types";
import type { Warmth } from "@/lib/google/types";
import { GoogleG, GooglePolicyLink, startGoogle } from "./Network";
import { useNetwork } from "./useNetwork";
import { pathsAct, useKnown, usePaths } from "./usePaths";
import "./connectPanel.css";
import { MIN as SIX_MIN } from "../getStarted";
import { ExportPanel } from "./ExportPanel";

export type SourceKey = "google" | "linkedin" | "csv";

const n = (x: number) => x.toLocaleString("en-US");
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** What each source reads and what it never does: the words the member decides on. */
export const SOURCE_TEXT: Record<SourceKey, { name: string; sub: string; reads: string[]; never: string[]; foot: string }> = {
  google: {
    name: "Google contacts and calendar",
    sub: "Best match. Who you met, and when",
    reads: ["Names, companies and titles in your contacts", "Who you met, and when, from your calendar"],
    never: ["Read any email or message text", "Keep meeting titles or notes", "Show your contacts to anyone"],
    foot: "Read-only. Disconnect and delete everything from Your network at any time.",
  },
  linkedin: {
    name: "Your LinkedIn connections file",
    sub: "Connections.csv, from your own export",
    reads: ["Name, profile link and the date you connected", "Company and position, where the file has them"],
    never: ["Contact or message anyone in it", "Show it to another member", "Keep the file itself"],
    foot: "Delete the connections at any time. Only you see them.",
  },
  csv: {
    name: "A CSV file",
    sub: "Any list with a name and a company",
    reads: ["Only the columns you pick", "Name, company, title, email"],
    never: ["Read any other column", "Email anyone on the list", "Share it with another member"],
    foot: "You match the columns and see a preview before anything is saved.",
  },
};

const Tick = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B6B45" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Reads">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const Cross = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#28322D" strokeWidth="2.6" strokeLinecap="round" role="img" aria-label="Never">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const WARM_WORD: Record<Warmth, string> = { Hot: "Strong", Warm: "Good", Fading: "Fading", Cold: "Cold" };
/** The People page's word for how warm: Strong, Good, Fading, Cold (Google's Hot, Warm, Fading, Cold). A file alone is Cold: a saved name, never met. */
export const warmWord = (w: Warmth | null) => (w ? WARM_WORD[w] : "Cold");

/** What each source holds for this member, in a few words for the radio's second line. */
function statusOf(k: SourceKey, paths: PathsView | null, google: { on: boolean; configured: boolean; connected: boolean; read: string | null }): string | null {
  if (k === "google") {
    if (!google.on) return "Not on for Merlin yet";
    if (google.connected) return google.read ? `Connected. Read ${google.read}` : "Connected";
    return google.configured ? null : "Not set up on Merlin yet";
  }
  const info = k === "linkedin" ? paths?.linkedin : paths?.csv;
  if (!info) return null;
  if (k === "linkedin" && info.namesOnly) return `${n(info.rows)} connections, ${n(info.byLink ?? 0)} matched by profile link. Added ${fmtDay(info.at)}`;
  return `${n(info.rows)} ${k === "linkedin" ? "connections" : "contacts"}, ${n(info.matched)} at companies on Merlin. Added ${fmtDay(info.at)}`;
}

/** The first visit's "Step 3 of 6": its eyebrow and its close. */
export interface StepHead {
  n: number;
  of: number;
  onClose?: () => void;
}

export function ConnectPanel({
  step,
  start = "google",
  variant = "side",
  onSeeKnown,
  onNext,
  nextLabel = "Open your first company",
  autoPick,
  onStop,
}: {
  /** Getting started's step (the eyebrow "STEP 3 OF 6 · FREE · 2 MINUTES"), or null where it isn't a step. */
  step?: StepHead | null;
  /** The source picked first. */
  start?: SourceKey;
  /** Beside the table (narrow), or inline in the page (wider, the preview beside the columns). */
  variant?: "side" | "inline";
  /** "See the people you know": the People page's People I know. */
  onSeeKnown?: () => void;
  /** The next step's button, after a source is in. */
  onNext?: () => void;
  nextLabel?: string;
  /** A switch turned the first source on: its file picker opens at once (useAutoPick). */
  autoPick?: boolean;
  /** Nothing was picked, or the file failed: the switch goes back to off. */
  onStop?: (why?: string) => void;
}) {
  const { view: paths } = usePaths();
  const net = useNetwork();
  const known = useKnown();
  const toast = useToast();
  const g = net.view?.google ?? null;
  const google = {
    on: !net.off && !!net.view,
    configured: !!net.view?.configured,
    connected: !!g && g.status !== "reconnect",
    read: g?.syncedAt ? fmtDay(g.syncedAt) : null,
  };
  // Google off on this Merlin: start on the LinkedIn file, which needs no Google.
  const [src, setSrc] = useState<SourceKey>(start === "google" && net.off ? "linkedin" : start);
  const [added, setAdded] = useState<SourceKey | null>(null);
  const S = SOURCE_TEXT[src];

  const found = useMemo(() => (known.known?.people ?? []).filter((p) => !p.away && p.company), [known.known]);
  if (added) return <Found what={added} paths={paths} people={found} step={step} onSeeKnown={onSeeKnown} onNext={onNext} nextLabel={nextLabel} onMore={() => setAdded(null)} />;

  return (
    <div className={`cp cp-${variant}`}>
      {step && (
        <div className="cp-eyebrow">
          <span>
            Step {step.n} of {step.of} · Free · {SIX_MIN.network} minutes
          </span>
          {step.onClose && (
            <button type="button" className="cp-x" aria-label={`Close step ${step.n}`} onClick={step.onClose}>
              <IconX size={16} />
            </button>
          )}
        </div>
      )}
      <strong className="cp-title">Bring in who you know</strong>
      <span className="cp-lead">Merlin matches them to the people on file. Each one you know becomes a warm path. Only you see them.</span>
      <div className="cp-body">
        <div role="radiogroup" aria-label="Where from" className="cp-sources">
          {(["google", "linkedin", "csv"] as SourceKey[]).map((k) => {
            const on = src === k;
            const st = statusOf(k, paths, google);
            return (
              <button key={k} type="button" role="radio" aria-checked={on} className={`cp-src${on ? " on" : ""}`} onClick={() => setSrc(k)}>
                <span className="cp-dot" aria-hidden />
                <span className="cp-src-t">
                  <strong>{SOURCE_TEXT[k].name}</strong>
                  <span>{st ?? SOURCE_TEXT[k].sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="cp-reads">
          <strong>What Merlin reads</strong>
          {S.reads.map((t) => (
            <span key={t} className="cp-read">
              <Tick />
              {t}
            </span>
          ))}
          <strong>What it never does</strong>
          {S.never.map((t) => (
            <span key={t} className="cp-read">
              <Cross />
              {t}
            </span>
          ))}
        </div>
      </div>
      {src === "google" ? (
        <GoogleAct google={google} />
      ) : src === "linkedin" ? (
        <LinkedInAct paths={paths} autoPick={autoPick && src === start} onStop={src === start ? onStop : undefined} onAdded={() => (setAdded("linkedin"), toast("Your connections are in. Only you see them."))} />
      ) : (
        <CsvAct paths={paths} wide={variant === "inline"} autoPick={autoPick && src === start} onStop={src === start ? onStop : undefined} onAdded={() => setAdded("csv")} />
      )}
      <span className="cp-foot">{S.foot}</span>
    </div>
  );
}

/* ---------- Google ---------- */

function GoogleAct({ google }: { google: { on: boolean; configured: boolean; connected: boolean; read: string | null } }) {
  if (!google.on)
    return (
      <p className="cp-note" role="status">
        Google isn&apos;t on for Merlin yet. Your LinkedIn connections file or a CSV works without it.
      </p>
    );
  if (google.connected)
    return (
      <div className="cp-acts">
        <span className="cp-ok">Google is connected{google.read ? `, read ${google.read}` : ""}. Merlin reads it again once a day.</span>
        {/* Google's settings, Read again and Disconnect and delete moved from Your network to Settings / Connections. */}
        <a className="btn" href="/?p=settings&sec=conn&open=google">
          Manage in Settings
        </a>
      </div>
    );
  if (!google.configured)
    return (
      <p className="cp-note" role="status">
        Google isn&apos;t set up on Merlin yet. Your LinkedIn connections file or a CSV works without it.
      </p>
    );
  return (
    <div className="cp-acts">
      <button type="button" className="btn btn-pine cp-go" onClick={() => startGoogle()}>
        <span className="cp-g" aria-hidden>
          <GoogleG />
        </span>
        Connect Google
      </button>
      <GooglePolicyLink />
    </div>
  );
}

/* ---------- the LinkedIn file ---------- */

/** Google can be connected here: it is on for Merlin and set up. */
function useGoogleReady(): boolean {
  const net = useNetwork();
  return !net.off && !!net.view?.configured;
}

/**
 * What the LinkedIn file holds, said plainly (LinkedIn's files from December 2026 have names and
 * profile links only): after a names-only file, how many Merlin placed by profile link and where
 * more ways in come from; before any file, the short version; with an older file in, that a newer
 * one replaces it with less.
 */
export function NamesOnlyNote({ li, google }: { li: LinkedInInfo | null; google: boolean }) {
  if (li?.namesOnly)
    return (
      <p className="cp-note cp-names" role="status">
        {namesOnlyWords(li.byLink ?? 0, google)}
      </p>
    );
  if (li) return <p className="cp-note cp-names">Your file has companies and titles. LinkedIn&apos;s files from December 2026 have names and profile links only. Bring in a newer one and Merlin keeps these companies and titles for the same people.</p>;
  return <p className="cp-note cp-names">{namesOnlyShort(google)}</p>;
}

export function LinkedInAct({ paths, onAdded, autoPick, onStop }: { paths: PathsView | null; onAdded: () => void; /** Open the picker at once (a switch was turned on). */ autoPick?: boolean; /** The member closed the picker with no file, or the file failed: the switch goes back to off. */ onStop?: (why?: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const google = useGoogleReady();
  const [busy, setBusy] = useState<"read" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  // The whole export (.zip) or several of its files: read on this device, with its own consent screen (ExportPanel.tsx).
  const [whole, setWhole] = useState<File[] | null>(null);
  const li = paths?.linkedin ?? null;
  const left = paths?.importsLeft ?? 0;
  useAutoPick(file, autoPick, onStop);
  const fail = (why: string) => (setErr(why), onStop?.(why));
  const pickMany = (fs: File[]) => {
    if (fs.length > 1 || fs.some((f) => /\.zip$/i.test(f.name) || !/connections/i.test(f.name))) {
      if (file.current) file.current.value = "";
      return setWhole(fs);
    }
    void pick(fs[0]);
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (f.size > FILE_MAX_BYTES) return fail("That file is larger than LinkedIn's Connections.csv can be. Pick Connections.csv from the export.");
    setBusy("read");
    try {
      const text = await f.text();
      const r = parseConnections(text);
      if (!r.ok) return fail(CSV_PROBLEM_WORDS[r.problem]);
      const res = await pathsAct("import", text);
      if (res.error) fail(res.error);
      else onAdded();
    } catch {
      fail("That file couldn't be read. Pick Connections.csv from LinkedIn's export.");
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  };
  if (whole)
    return (
      <div className="cp-acts">
        <ExportPanel picked={whole} onClose={() => setWhole(null)} onStop={onStop} />
        <button type="button" className="tp-flink" onClick={() => setWhole(null)}>
          Back to the connections file only
        </button>
      </div>
    );
  return (
    <div className="cp-acts">
      {!li && (
        <ol className="cp-steps">
          {EXPORT_STEPS.map((s, k) => (
            <li key={k}>{s}</li>
          ))}
        </ol>
      )}
      <NamesOnlyNote li={li} google={google} />
      {err && (
        <p className="cp-err" role="alert">
          {err}
        </p>
      )}
      <input ref={file} type="file" multiple accept=".csv,text/csv,.zip,application/zip" className="cp-file" tabIndex={-1} aria-hidden onChange={(e) => pickMany([...(e.target.files ?? [])])} />
      {ask ? (
        <Confirm
          what="Merlin deletes your connections and every way in found from them. This can't be undone."
          yes="Delete them"
          busy={busy === "delete"}
          onYes={async () => {
            setBusy("delete");
            const r = await pathsAct("delete");
            setBusy(null);
            setAsk(false);
            toast(r.error ?? r.message ?? "Deleted.", !!r.error);
          }}
          onNo={() => setAsk(false)}
        />
      ) : (
        <div className="cp-row">
          <button type="button" className={`btn${li ? "" : " btn-pine"} cp-go`} disabled={!!busy || (paths ? left <= 0 : true)} aria-busy={busy === "read"} onClick={() => file.current?.click()}>
            {busy === "read" ? "Reading your connections" : li ? "Upload a newer file" : "Choose Connections.csv"}
          </button>
          {li && (
            <button type="button" className="btn cp-danger" disabled={!!busy} onClick={() => setAsk(true)}>
              Delete my connections
            </button>
          )}
        </div>
      )}
      {paths && left <= 0 && <p className="cp-note">That&apos;s 3 uploads today. Upload again tomorrow.</p>}
      <span className="cp-note">
        Have the whole export?{" "}
        <button type="button" className="tp-flink" onClick={() => setWhole([])}>
          Bring in the .zip
        </button>{" "}
        and Merlin also reads who you message and how often (never the words), your roles and who vouched for you.
      </span>
    </div>
  );
}

/* ---------- any contacts CSV ---------- */

const NONE = -1;
const colName = (h: string, k: number) => h || `Column ${k + 1}`;

/** Which column is which: Name (or first and last), Company, Title, Email, each "Not in this file" when left out. */
function ColumnSelect({ label, field, header, map, onMap }: { label: string; field: ContactField; header: string[]; map: ColumnMap; onMap: (m: ColumnMap) => void }) {
  const id = `cp-col-${field}`;
  return (
    <label className="cp-map" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={map[field] ?? NONE}
        onChange={(e) => {
          const v = Number(e.target.value);
          const next = { ...map };
          if (v === NONE) delete next[field];
          else next[field] = v;
          onMap(next);
        }}
      >
        <option value={NONE}>Not in this file</option>
        {header.map((h, k) => (
          <option key={k} value={k}>
            {colName(h, k)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CsvAct({ paths, wide, onAdded, autoPick, onStop }: { paths: PathsView | null; wide: boolean; onAdded: () => void; /** Open the picker at once (a switch was turned on). */ autoPick?: boolean; /** The member closed the picker with no file, the file failed, or they put it back: the switch goes back to off. */ onStop?: (why?: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [file, setFile] = useState<{ name: string; text: string; info: ContactsFile } | null>(null);
  // A file picked: its columns and preview come into view.
  useEffect(() => {
    if (file) box.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [file]);
  const [map, setMap] = useState<ColumnMap>({});
  const [halves, setHalves] = useState(false);
  const [busy, setBusy] = useState<"read" | "save" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const csv = paths?.csv ?? null;
  const left = paths?.importsLeft ?? 0;
  useAutoPick(input, autoPick, onStop);
  const fail = (why: string) => (setErr(why), onStop?.(why));
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (f.size > FILE_MAX_BYTES) return fail("That file is too large. Pick a CSV under 8 MB, or split it in two.");
    setBusy("read");
    try {
      const text = await f.text();
      const r = readContacts(text);
      if (!r.ok) return fail(CONTACTS_PROBLEM_WORDS[r.problem]);
      setFile({ name: f.name, text, info: r });
      setMap(r.map);
      setHalves(r.map.name === undefined && (r.map.first !== undefined || r.map.last !== undefined));
    } catch {
      fail("That file couldn't be read. Save it as a CSV and try again.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };
  const use: ColumnMap = halves ? { first: map.first, last: map.last, company: map.company, title: map.title, email: map.email } : { name: map.name, company: map.company, title: map.title, email: map.email };
  for (const k of Object.keys(use) as ContactField[]) if (use[k] === undefined) delete use[k];
  const problem = file ? mapProblem(use) : null;
  const cell = (r: string[], f: ContactField) => (use[f] !== undefined ? (r[use[f]!] ?? "") : "");
  const save = async () => {
    if (!file || problem) return;
    setErr(null);
    setBusy("save");
    // Only these four columns leave the browser.
    const res = await pathsAct("importCsv", pickColumns(file.text, file.info, use));
    setBusy(null);
    if (res.error) return fail(res.error);
    setFile(null);
    toast(res.message ?? "Added.");
    onAdded();
  };
  const input0 = <input ref={input} type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values" className="cp-file" tabIndex={-1} aria-hidden onChange={(e) => void pick(e.target.files?.[0])} />;

  if (file)
    return (
      <div ref={box} className={`cp-acts cp-csv${wide ? " cp-csv-wide" : ""}`}>
        <span className="cp-file-name">
          {file.name} · {n(file.info.rows)} {file.info.rows === 1 ? "row" : "rows"}
        </span>
        <div className="cp-maps" role="group" aria-label="Which column is which">
          {halves ? (
            <>
              <ColumnSelect label="First name" field="first" header={file.info.header} map={map} onMap={setMap} />
              <ColumnSelect label="Last name" field="last" header={file.info.header} map={map} onMap={setMap} />
            </>
          ) : (
            <ColumnSelect label="Name" field="name" header={file.info.header} map={map} onMap={setMap} />
          )}
          <button type="button" className="tp-flink cp-halves" onClick={() => setHalves(!halves)}>
            {halves ? "The name is in one column" : "The name is in two columns"}
          </button>
          <ColumnSelect label="Company" field="company" header={file.info.header} map={map} onMap={setMap} />
          <ColumnSelect label="Title" field="title" header={file.info.header} map={map} onMap={setMap} />
          <ColumnSelect label="Email" field="email" header={file.info.header} map={map} onMap={setMap} />
        </div>
        <div className="cp-preview">
          <strong>Preview: what Merlin will keep</strong>
          {file.info.sample.length ? (
            <table className="cp-ptable">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Company</th>
                  <th scope="col">Title</th>
                  <th scope="col">Email</th>
                </tr>
              </thead>
              <tbody>
                {file.info.sample.map((r, k) => (
                  <tr key={k}>
                    <td>{halves ? [cell(r, "first"), cell(r, "last")].filter(Boolean).join(" ") : cell(r, "name")}</td>
                    <td>{cell(r, "company")}</td>
                    <td>{cell(r, "title")}</td>
                    <td>{cell(r, "email")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <span className="cp-note">The file has a header and no rows.</span>
          )}
          <span className="cp-note">Every other column stays on your computer. It is never sent to Merlin.</span>
        </div>
        {problem && (
          <p className="cp-err" role="alert">
            {CONTACTS_PROBLEM_WORDS[problem]}
          </p>
        )}
        {err && (
          <p className="cp-err" role="alert">
            {err}
          </p>
        )}
        <div className="cp-row">
          <button type="button" className="btn btn-pine cp-go" disabled={!!problem || !!busy || left <= 0} aria-busy={busy === "save"} onClick={() => void save()}>
            {busy === "save" ? "Bringing them in" : `Bring in ${n(file.info.rows)} ${file.info.rows === 1 ? "person" : "people"}`}
          </button>
          <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => setFile(null)}>
            Pick another file
          </button>
        </div>
      </div>
    );

  return (
    <div className="cp-acts">
      {err && (
        <p className="cp-err" role="alert">
          {err}
        </p>
      )}
      {input0}
      {ask ? (
        <Confirm
          what="Merlin deletes your contacts file and every way in found from it. This can't be undone."
          yes="Delete it"
          busy={busy === "delete"}
          onYes={async () => {
            setBusy("delete");
            const r = await pathsAct("deleteCsv");
            setBusy(null);
            setAsk(false);
            toast(r.error ?? r.message ?? "Deleted.", !!r.error);
          }}
          onNo={() => setAsk(false)}
        />
      ) : (
        <div className="cp-row">
          <button type="button" className={`btn${csv ? "" : " btn-pine"} cp-go`} disabled={!!busy || (paths ? left <= 0 : true)} aria-busy={busy === "read"} onClick={() => input.current?.click()}>
            {busy === "read" ? "Reading the file" : csv ? "Choose a newer CSV" : "Choose a CSV"}
          </button>
          {csv && (
            <button type="button" className="btn cp-danger" disabled={!!busy} onClick={() => setAsk(true)}>
              Delete my contacts file
            </button>
          )}
        </div>
      )}
      {paths && left <= 0 && <p className="cp-note">That&apos;s 3 uploads today. Upload again tomorrow.</p>}
    </div>
  );
}

function Confirm({ what, yes, busy, onYes, onNo }: { what: string; yes: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className="cp-confirm" role="group" aria-label="Delete it?">
      <p>{what}</p>
      <div className="cp-row">
        <button type="button" className="btn cp-danger-solid" disabled={busy} aria-busy={busy} onClick={onYes}>
          {busy ? "Deleting" : yes}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onNo}>
          Keep it
        </button>
      </div>
    </div>
  );
}

/* ---------- after a source is in ---------- */

function Found({
  what,
  paths,
  people,
  step,
  onSeeKnown,
  onNext,
  nextLabel,
  onMore,
}: {
  what: SourceKey;
  paths: PathsView | null;
  people: KnownPersonView[];
  step?: StepHead | null;
  onSeeKnown?: () => void;
  onNext?: () => void;
  nextLabel: string;
  onMore: () => void;
}) {
  const info = what === "linkedin" ? paths?.linkedin : what === "csv" ? paths?.csv : null;
  const google = useGoogleReady();
  const top = [...people].sort((a, b) => (["Hot", "Warm", "Fading", "Cold"].indexOf(a.warmth ?? "Cold") - ["Hot", "Warm", "Fading", "Cold"].indexOf(b.warmth ?? "Cold"))).slice(0, 3);
  const k = people.length;
  return (
    <div className="cp cp-found" role="status">
      {step && (
        <div className="cp-eyebrow">
          <span>Step {step.n} done</span>
          {step.onClose && (
            <button type="button" className="cp-x" aria-label="Close" onClick={step.onClose}>
              <IconX size={16} />
            </button>
          )}
        </div>
      )}
      <strong className="cp-title">{k ? `Merlin found ${n(k)} ${k === 1 ? "person" : "people"} you know` : "Nobody you know is on file yet"}</strong>
      <span className="cp-lead">
        {info
          ? `It read ${n(info.rows + info.skipped)} ${info.rows + info.skipped === 1 ? "row" : "rows"} and kept only who they are${what === "linkedin" ? " and when you connected" : ""}. ${n(info.matched)} work at companies on Merlin.`
          : "Merlin keeps only who they are and when you last spoke."}{" "}
        {k ? "Each one is now a warm path." : "As Merlin learns more companies and people, matches show in People I know."}
      </span>
      {what === "linkedin" && info?.namesOnly ? <NamesOnlyNote li={info} google={google} /> : null}
      {top.length > 0 && (
        <ul className="cp-top" aria-label="The warmest people you know">
          {top.map((p) => (
            <li key={p.key}>
              <span className="cp-top-t">
                <strong>{p.name}</strong>
                <span>{p.title ?? p.why}</span>
              </span>
              <span className={`cp-warm cp-warm-${warmWord(p.warmth).toLowerCase()}`}>{warmWord(p.warmth)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="cp-row">
        {onSeeKnown && k > 0 && (
          <button type="button" className="btn btn-pine" onClick={onSeeKnown}>
            See the people you know
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onMore}>
          Add another source
        </button>
      </div>
      {onNext && (
        <span className="cp-next">
          <strong>{step ? `Next, step ${step.n + 1}.` : "Next."}</strong>{" "}
          <button type="button" className="tp-flink" onClick={onNext}>
            {nextLabel}
          </button>
          . Add more sources at any time from Tools.
        </span>
      )}
    </div>
  );
}
