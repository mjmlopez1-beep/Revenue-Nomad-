"use client";

/**
 * The company page's tabs and right column (Company.dc.html): the seats timeline and its table,
 * who decides here, the open roles, your notes and what happened here, the deal, the next move,
 * Add what you know here and the Close-only Closest evidence. Every cell is the table's own
 * (workbench/cells.tsx, Tables.tsx), so a lock here says its price and spends exactly as the same
 * cell does in a list: one purchase per click, and a lock another purchase opens is quiet.
 */
import { useClosest } from "../useClosest";
import { closestOf, labelWords } from "../workbench/closest";
import { useRef, useState, type ReactNode } from "react";
import type { EngagementRec, PersonRec } from "@/lib/tableTypes";
import type { KnownPersonView } from "@/lib/paths/types";
import { MOVE_STAGES, STAGE_WORDS, type MoveStage, type PipelineRec, type PipelineView } from "@/lib/pipeline";
import { COMPANY_FILL, cellKey, shown, type CoInfo, type Row } from "../model";
import { earnNote, useUi } from "../ui";
import { seatCell, personCell } from "../workbench/cells";
import { fmtMonth, IconPlus, post, timeAgo } from "../../ui/shared";
import { plural } from "../hooks";
import { useNetCompany } from "../network/useNetwork";
import { WarmthChip } from "../network/parts";
import { pipelineAct, setPipeline } from "../pipelineStore";
import { fillOf, isListedRole, isOpenRole, onFile, timelineOf, type NextMoveCard, type TabKey } from "./companyModel";
import { useCompanyNotes, type NoteRec } from "./notesStore";
import { earnable } from "./sections/env";

/* ---------- small pieces ---------- */

/** "Nov 16", with the year when it isn't this year. */
const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};

/** A table head cell: the column's name and how many rows have it on file. */
function Head({ name, fill }: { name: string; fill?: string }) {
  return (
    <span className="co-th" role="columnheader">
      <span className="co-th-n">{name}</span>
      {fill && <span className="co-th-f num">{fill}</span>}
    </span>
  );
}
function Cell({ children, opened }: { children: ReactNode; opened?: boolean }) {
  return (
    <span className={`co-td${opened ? " co-opened" : ""}`} role="cell">
      {children}
    </span>
  );
}
/** A fact that costs a credit, open for the member (they paid for it, or it is theirs to see): tinted, as the legend says. Free facts are not. */
const opened = (c: { s: string; v?: string } | undefined) => c?.s === "value";
/** A seat's end is a paid fact only as a date on a seat that ended ("Ongoing" is free). */
const endPaid = (e: EngagementRec) => e.cells.end?.s === "value" && !/^(ongoing|present|now|current)$/i.test(e.cells.end.v);

/* ---------- Seats ---------- */

/** The seats on a timeline, from the first year on file to this year (companyModel.ts timelineOf: no guessed month). */
export function Timeline({ i }: { i: CoInfo }) {
  const t = timelineOf(i, Date.now(), fmtMonth);
  if (!t.bars.length) return null;
  const label = `Timeline of seats, ${t.years[0]} to ${t.years[t.years.length - 1]}`;
  return (
    <div className="co-tl" role="img" aria-label={`${label}. ${t.bars.map((b) => `${b.label}: ${b.when}`).join(". ")}.`}>
      <div className="co-tl-row co-tl-head" aria-hidden>
        <span className="co-tl-l">Seat</span>
        <span className="co-tl-track co-tl-years">
          {t.years.map((y) => (
            <span key={y}>{y}</span>
          ))}
        </span>
      </div>
      {t.bars.map((b) => (
        <div key={b.id} className="co-tl-row" aria-hidden>
          <span className="co-tl-l">
            <strong>{b.label}</strong>
            <span>{b.when}</span>
          </span>
          <span className="co-tl-track">
            {t.years.map((y) => (
              <span key={y} className="co-tl-grid" />
            ))}
            <span className={`co-tl-bar co-tl-${b.kind}`} style={{ left: `${b.left * 100}%`, width: `${b.width * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

const SEAT_COLS: { id: string; name: string; field?: string }[] = [
  { id: "seat", name: "Seat", field: "role" },
  { id: "operator", name: "Held by", field: "operator" },
  { id: "start", name: "Start", field: "start" },
  { id: "end", name: "End", field: "end" },
  { id: "hours", name: "Hours", field: "hours" },
  { id: "rate", name: "Rate", field: "rate" },
  { id: "reason", name: "Why hired", field: "reason" },
  { id: "sourced", name: "Sourced via", field: "sourced" },
];

/** Every seat as a row: function, role and status, who held it, the dates, hours, rate, why they hired and how it was found. */
export function SeatTable({ i, onDetails, nameOf }: { i: CoInfo; onDetails: (id: string) => void; nameOf?: (p: PersonRec, e: EngagementRec) => ReactNode }) {
  const ui = useUi();
  const mine = ui.me.function;
  const engs = i.engs;
  if (!engs.length) return null;
  const rows: Row[] = engs.map((e) => ({ key: e.id, i, e }));
  return (
    <div className="co-table-wrap">
      <div className="co-table co-seats" role="table" aria-label="Fractional seats">
        <div className="co-tr co-thead" role="row">
          {SEAT_COLS.map((c) => (
            <Head key={c.id} name={c.name} fill={c.field ? fillOf(engs.map((e) => e.cells[c.field!])) : undefined} />
          ))}
        </div>
        {rows.map((r) => {
          const e = r.e!;
          const fn = shown(e.cells.function);
          const status = shown(e.cells.status);
          // Who hired or managed the seat, where their name shows: each opens the person bubble.
          const named = nameOf ? e.people.filter((p) => p.cells.name?.s === "value") : [];
          return (
            <div key={e.id} className="co-tr" role="row" data-row={e.id}>
              <Cell>
                <span className="co-seat">
                  {fn && <span className={`chip tp-fn${fn === mine ? " tp-fn-me" : ""}${isOpenRole(e) ? " tp-fn-hiring" : ""}`}>{fn}</span>}
                  <span className="co-seat-role">{seatCell("role", r, mine)}</span>
                  <span className="co-sub">
                    {isOpenRole(e) ? "Open role" : status ?? ""}
                    {e.yours ? " · your seat" : ""}
                  </span>
                  {named.length > 0 && (
                    <span className="co-seat-by">
                      <span className="co-sub">With</span>
                      {named.map((p) => (
                        <span key={p.id}>{nameOf!(p, e)}</span>
                      ))}
                    </span>
                  )}
                  <button type="button" className="tp-tbtn co-details" onClick={() => onDetails(e.id)}>
                    Details
                  </button>
                </span>
              </Cell>
              <Cell>{seatCell("operator", r, mine)}</Cell>
              <Cell>{isListedRole(e) && e.opened ? <span className="co-sub">Listed {fmtMonth(e.opened.slice(0, 7))}</span> : seatCell("start", r, mine)}</Cell>
              <Cell opened={endPaid(e) && !e.yours}>{seatCell("end", r, mine)}</Cell>
              <Cell>{seatCell("hours", r, mine)}</Cell>
              <Cell opened={opened(e.cells.rate) && !e.yours}>{seatCell("rate", r, mine)}</Cell>
              <Cell>{seatCell("reason", r, mine)}</Cell>
              <Cell opened={opened(e.cells.sourced) && !e.yours}>{seatCell("sourced", r, mine)}</Cell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- People ---------- */

const PEOPLE_COLS: { id: string; name: string; field?: string }[] = [
  { id: "name", name: "Name and title", field: "name" },
  { id: "relationship", name: "Relationship", field: "relationship" },
  { id: "email", name: "Email", field: "email" },
  { id: "phone", name: "Phone", field: "phone" },
  { id: "linkedin", name: "Public profile", field: "linkedin" },
  { id: "know", name: "How you know them" },
];

const nameKey = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

/**
 * Who decides here, one row each: the decision makers and the people who hired or managed a
 * fractional. A name and title are one purchase; email, phone and the public profile link open
 * after the name. A name the member can see opens the person bubble (`onPerson`). How you know
 * them comes from the member's own network only, and says so.
 */
export function PeopleTable({
  i,
  open,
  onPerson,
  knownOf,
}: {
  i: CoInfo;
  open: string | null;
  onPerson: (p: PersonRec, e: EngagementRec | null, el: HTMLElement) => void;
  /** How the member knows a person on file, from any source of theirs (Google, their LinkedIn file, their contacts CSV): handed in by the page. */
  knownOf?: (p: PersonRec) => KnownPersonView | null;
}) {
  const net = useNetCompany(i.c.hidden ? null : i.c.id);
  const people = i.people;
  if (!people.length) return null;
  const known = new Map((net?.people ?? []).filter((p) => p.name && !p.hidden).map((p) => [nameKey(p.name!), p]));
  return (
    <div className="co-table-wrap">
      <div className="co-table co-people" role="table" aria-label="Who decides here">
        <div className="co-tr co-thead" role="row">
          {PEOPLE_COLS.map((c) => (
            <Head key={c.id} name={c.name} fill={c.field ? fillOf(people.map(({ p }) => p.cells[c.field!])) : undefined} />
          ))}
        </div>
        {people.map(({ p, e }) => {
          const r: Row = { key: p.id, i, e, p };
          const name = p.cells.name?.s === "value" ? p.cells.name.v : null;
          const title = shown(p.cells.title);
          const k = name ? known.get(nameKey(name)) : undefined;
          // Their own sources first (each works without Google); Google's network by name otherwise.
          const mine = name && knownOf ? knownOf(p) : null;
          const tie = e ? [shown(e.cells.function), "seat"].filter(Boolean).join(" ") : "Whole company";
          return (
            <div key={p.id} className={`co-tr${open === p.id ? " co-tr-on" : ""}`} role="row" data-row={p.id}>
              <Cell opened={!!name}>
                {name ? (
                  <button type="button" className="co-name" aria-expanded={open === p.id} aria-haspopup="dialog" data-person={p.id} onClick={(ev) => onPerson(p, e, ev.currentTarget)}>
                    <strong>{name}</strong>
                    {title && <span className="co-sub">{title}</span>}
                  </button>
                ) : (
                  personCell("name", r)
                )}
              </Cell>
              <Cell>
                <span className="co-stack">
                  {personCell("relationship", r)}
                  <span className="co-sub">{tie}</span>
                </span>
              </Cell>
              <Cell opened={opened(p.cells.email)}>{personCell("email", r)}</Cell>
              <Cell opened={opened(p.cells.phone)}>{personCell("phone", r)}</Cell>
              <Cell opened={opened(p.cells.linkedin)}>{personCell("linkedin", r)}</Cell>
              <Cell>
                {mine && !mine.away ? (
                  <span className="co-stack">
                    {mine.warmth ? <WarmthChip w={mine.warmth} /> : <span className="chip">In your contacts</span>}
                    <span className="co-sub">{mine.why}</span>
                  </span>
                ) : k ? (
                  <span className="co-stack">
                    <WarmthChip w={k.warmth} />
                    <span className="co-sub">{k.meetings ? `${plural(k.meetings, "meeting")}` : "In your contacts"}</span>
                  </span>
                ) : (
                  <span className="co-sub">{!name ? "After the name" : net || knownOf ? "Not in what you brought in" : "Nothing you brought in yet"}</span>
                )}
              </Cell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Open roles ---------- */

/** The roles the scan listed here, open first: title, function and listed date free; the posting, posted rate and hours come with the company. */
export function RolesTable({ i, onTab }: { i: CoInfo; onTab: (t: TabKey) => void }) {
  const ui = useUi();
  const mine = ui.me.function;
  const roles = i.engs.filter(isListedRole).sort((a, b) => Number(isOpenRole(b)) - Number(isOpenRole(a)));
  if (!roles.length) return null;
  const cols = ["Role", "Function", "Listed", "Hours", "Posted rate", "Job posting", "Next step"];
  return (
    <div className="co-table-wrap">
      <div className="co-table co-roles" role="table" aria-label="Open roles">
        <div className="co-tr co-thead" role="row">
          {cols.map((n, k) => (
            <Head key={n} name={n} fill={k === 3 ? fillOf(roles.map((e) => e.cells.hours)) : k === 4 ? fillOf(roles.map((e) => e.cells.rate)) : k === 5 ? fillOf(roles.map((e) => e.cells.posting)) : undefined} />
          ))}
        </div>
        {roles.map((e) => {
          const r: Row = { key: e.id, i, e };
          const open = isOpenRole(e);
          const fn = shown(e.cells.function);
          return (
            <div key={e.id} className="co-tr" role="row" data-row={e.id}>
              <Cell>
                <span className="co-stack">
                  <strong className="co-role">{seatCell("role", r, mine)}</strong>
                  <span className="co-sub">{open ? "Open" : e.closed ? `Closed ${fmtMonth(e.closed.slice(0, 7))}` : "Closed"}</span>
                </span>
              </Cell>
              <Cell>{fn ? <span className={`chip tp-fn${open ? " tp-fn-hiring" : ""}${fn === mine ? " tp-fn-me" : ""}`}>{fn}</span> : null}</Cell>
              <Cell>
                <span className="co-stack">
                  <span className="num">{day(e.openedAt ?? `${e.opened ?? ""}T12:00:00Z`) || "Listed"}</span>
                  {e.openedAt || e.opened ? <span className="co-sub">{open ? `${timeAgo(e.openedAt ?? `${e.opened}T12:00:00Z`)}` : e.closedAt || e.closed ? `Came down ${day(e.closedAt ?? `${e.closed}T12:00:00Z`)}` : ""}</span> : null}
                </span>
              </Cell>
              <Cell>{seatCell("hours", r, mine)}</Cell>
              <Cell>{seatCell("rate", r, mine)}</Cell>
              <Cell>{open ? seatCell("posting", r, mine) : <span className="co-sub">No longer online</span>}</Cell>
              <Cell>
                {open ? (
                  fn && fn === mine ? (
                    <span className="co-sub">Your function</span>
                  ) : i.c.hidden ? (
                    <span className="co-sub">Open the company first</span>
                  ) : (
                    <button type="button" className="tp-tbtn" onClick={() => document.getElementById("pe-dsec-h")?.scrollIntoView({ block: "center", behavior: "smooth" })}>
                      Refer it to a peer
                    </button>
                  )
                ) : (
                  <button type="button" className="tp-tbtn" onClick={() => onTab("seats")}>
                    See the seat
                  </button>
                )}
              </Cell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Not your function": the open roles here are in another function than the member's, so the way in is a person. */
export function RolesNote({ i }: { i: CoInfo }) {
  const ui = useUi();
  const mine = ui.me.function;
  const open = i.engs.filter(isOpenRole);
  if (!open.length || !mine) return null;
  const fns = [...new Set(open.map((e) => shown(e.cells.function)).filter((x): x is string => !!x))];
  if (!fns.length || fns.includes(mine)) return null;
  return (
    <p className="co-note">
      <strong>Not your function.</strong> The open {open.length === 1 ? "role is" : "roles are"} {fns.join(" and ")} and you are {mine}. No {mine} role is posted here, so your way in is a person, not a posting.
      {!i.c.hidden && " Know a fractional who fits? Refer it to a peer, free for them."}
    </p>
  );
}

/* ---------- Notes and activity ---------- */


/** One note of the member's: its day, its words, and Change and Remove. */
function NoteRow({ n, act }: { n: NoteRec; act: ReturnType<typeof useCompanyNotes>["act"] }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.text);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editBtn = useRef<HTMLButtonElement>(null);
  const run = async (op: "edit" | "remove") => {
    setBusy(true);
    const e = await act(op, { noteId: n.id, ...(op === "edit" ? { text } : {}) });
    setBusy(false);
    setErr(e);
    if (!e) {
      setEditing(false);
      setAsk(false);
    }
  };
  const back = () => setTimeout(() => editBtn.current?.focus({ preventScroll: true }));
  if (editing)
    return (
      <div className="co-noterow">
        <span className="co-note-d num">{day(n.at)}</span>
        <div className="co-note-edit">
          <label className="sr-only" htmlFor={`co-note-${n.id}`}>
            Change this note
          </label>
          <textarea
            id={`co-note-${n.id}`}
            className="input co-note-ta"
            rows={3}
            value={text}
            autoFocus
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Esc leaves the note as it was, before it would close the page.
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setEditing(false);
                setText(n.text);
                back();
              }
            }}
          />
          {err && (
            <p className="tp-ed-err" role="alert">
              {err}
            </p>
          )}
          <span className="co-note-acts">
            <button type="button" className="btn btn-sm btn-pine" disabled={busy || !text.trim()} aria-busy={busy} onClick={() => void run("edit")}>
              {busy ? "Saving" : "Save"}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setEditing(false), setText(n.text), back())}>
              Cancel
            </button>
          </span>
        </div>
      </div>
    );
  return (
    <div className="co-noterow">
      <span className="co-note-d num">{day(n.at)}</span>
      <div className="co-note-body">
        <p className="co-note-t">{n.text}</p>
        {n.edited && <span className="co-sub">Changed {timeAgo(n.edited)}</span>}
        {ask ? (
          <span className="co-note-acts" role="group" aria-label="Remove this note?">
            <span className="co-sub">Remove this note? It can&apos;t be brought back.</span>
            <button type="button" className="btn btn-sm tp-btn-red" autoFocus disabled={busy} aria-busy={busy} onClick={() => void run("remove")}>
              {busy ? "Removing" : "Remove it"}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setAsk(false), back())}>
              Keep it
            </button>
          </span>
        ) : (
          <span className="co-note-acts">
            <button ref={editBtn} type="button" className="tp-tbtn" onClick={() => setEditing(true)}>
              Change
            </button>
            <button type="button" className="tp-tbtn" onClick={() => setAsk(true)}>
              Remove
            </button>
          </span>
        )}
        {err && !editing && (
          <p className="tp-ed-err" role="alert">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Your private notes on this company: on any company, open or locked, in your pipeline or not
 * (lib/companyNotes.ts). Only the member sees them. A first visit shows one labelled Example,
 * which is never saved or sent.
 */
export function Notes({ i, first, deal }: { i: CoInfo; first: boolean; deal: PipelineRec | null }) {
  const { notes, failed, act } = useCompanyNotes(i.c.id);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const save = async () => {
    if (!draft.trim()) return setErr("Write the note first.");
    setBusy(true);
    const e = await act("add", { text: draft });
    setBusy(false);
    setErr(e);
    if (!e) setDraft("");
  };
  const dealNotes = deal?.notes ?? [];
  const none = notes !== null && notes.length === 0 && !dealNotes.length;
  return (
    <section className="co-card" aria-labelledby="co-notes-h">
      <div className="co-card-h">
        <h2 id="co-notes-h">Your notes</h2>
        <span className="co-sub">Private. Only you see them.</span>
      </div>
      <label className="co-lbl" htmlFor="co-note-new">
        Add a note
      </label>
      <textarea
        ref={ta}
        id="co-note-new"
        className="input co-note-ta"
        rows={3}
        maxLength={2000}
        value={draft}
        placeholder="What did you learn? Who said what, what they need, when to come back."
        onChange={(e) => (setDraft(e.target.value), setErr(null))}
        onKeyDown={(e) => {
          // Esc in the note: the text stays, and focus leaves the box. Nothing typed is thrown away, and the page stays open.
          if (e.key === "Escape" && draft) {
            e.preventDefault();
            e.stopPropagation();
            ta.current?.blur();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
        }}
      />
      <div className="co-note-foot">
        <button type="button" className="btn btn-pine btn-sm" disabled={busy} aria-busy={busy} onClick={() => void save()}>
          {busy ? "Saving" : "Save note"}
        </button>
        <span className="co-sub">Nobody else reads them, not even Revenue Nomad.</span>
      </div>
      {err && (
        <p className="tp-ed-err" role="alert">
          {err}
        </p>
      )}
      {failed && notes === null && <p className="co-sub">Your notes didn&apos;t load. They are still saved.</p>}
      <div className="co-notes" aria-live="polite">
        {(notes ?? []).map((n) => (
          <NoteRow key={n.id} n={n} act={act} />
        ))}
        {dealNotes.map((n, k) => (
          <div key={`d${k}`} className="co-noterow">
            <span className="co-note-d num">{day(n.at)}</span>
            <div className="co-note-body">
              <p className="co-note-t">{n.text}</p>
              <span className="co-sub">On your pipeline card</span>
            </div>
          </div>
        ))}
        {none && first && (
          <div className="co-noterow co-example">
            <span className="co-note-d">Example</span>
            <div className="co-note-body">
              <p className="co-note-t">The CEO wants the founder out of every deal by Q2. Budget is set for one senior hire.</p>
              <span className="co-sub">An example of a note. It isn&apos;t saved.</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** What you and Merlin did here, newest first: the deal's log, the credit history at this company, and your notes. */
export function Activity({ i, deal }: { i: CoInfo; deal: PipelineRec | null }) {
  const { notes } = useCompanyNotes(i.c.id);
  const items: { at: string; t: string; s: string }[] = [];
  for (const l of deal?.log ?? []) items.push({ at: l.at, t: l.text, s: "Your pipeline" });
  for (const n of notes ?? []) items.push({ at: n.at, t: "You wrote a note.", s: "Only you see it." });
  for (const e of i.engs) {
    if (e.opened && isListedRole(e)) items.push({ at: e.openedAt ?? `${e.opened}T12:00:00Z`, t: `A fractional ${shown(e.cells.function) ?? ""} role was listed.`.replace("  ", " "), s: "From a job posting." });
    if (e.closedAt || e.closed) items.push({ at: e.closedAt ?? `${e.closed}T12:00:00Z`, t: "A job posting here came down.", s: "From the job posting." });
  }
  const sorted = items.filter((x) => !Number.isNaN(Date.parse(x.at))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  return (
    <section className="co-card" aria-labelledby="co-act-h">
      <div className="co-card-h">
        <h2 id="co-act-h">Activity</h2>
        <span className="co-sub">What you and Merlin did here, newest first.</span>
      </div>
      {sorted.length === 0 ? (
        <p className="co-sub">Nothing yet. Follow the company, add it to your pipeline or write a note, and it shows here.</p>
      ) : (
        <ol className="co-acts">
          {sorted.map((x, k) => (
            <li key={k} className="co-act">
              <span className="co-act-d num">{day(x.at)}</span>
              <span className="co-act-t">
                <span>{x.t}</span>
                <span className="co-sub">{x.s}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------- Deal ---------- */

/**
 * Where the member's deal here stands, and any stage they pick by hand (Merlin moves it too, as
 * it sees notes go out, replies and meetings). Not in the pipeline yet: picking a stage adds it.
 */
export function StagePicker({ i, deal }: { i: CoInfo; deal: PipelineRec | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [say, setSay] = useState<string | null>(null);
  const stages: MoveStage[] = MOVE_STAGES.filter((s) => s !== "notnow");
  const pick = async (s: MoveStage) => {
    if (i.c.hidden || busy) return;
    setBusy(s);
    let id = deal?.id ?? null;
    let msg = "";
    if (!id) {
      // Not in the pipeline yet: it goes in at To reach out, then to the stage picked.
      const r = await post<{ message?: string; pipeline?: PipelineView }>({ action: { type: "pipeline.add", companyIds: [i.c.id] } });
      if (r.error) {
        setBusy(null);
        return setSay(r.error);
      }
      setPipeline(r.pipeline);
      msg = r.message ?? "";
      id = r.pipeline?.entries.find((e) => e.company === i.c.id)?.id ?? null;
    }
    if (id && s !== (deal?.stage ?? "reach")) {
      const r = await pipelineAct({ type: "pipeline.move", id, stage: s });
      msg = r.message;
    }
    setBusy(null);
    setSay(msg || null);
  };
  const cur = deal?.stage ?? null;
  return (
    <div className="co-stages" role="radiogroup" aria-label="Stage in your pipeline">
      {stages.map((s) => {
        const on = cur === s;
        const past = !!cur && stages.indexOf(cur as MoveStage) > stages.indexOf(s) && cur !== "lost";
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={i.c.hidden || !!busy}
            aria-busy={busy === s}
            className={`co-stage${on ? " on" : past ? " past" : ""}${s === "lost" ? " lost" : ""}`}
            onClick={() => void pick(s)}
          >
            {STAGE_WORDS[s]}
          </button>
        );
      })}
      {say && (
        <p className="co-sub co-stages-say" role="status">
          {say}
        </p>
      )}
    </div>
  );
}

/**
 * What the deal here is worth a month and the seat pitched, as the member typed them on Pipeline
 * (PipelineEntry.value, pitch), changeable here too. A Won deal with terms shows its terms' month.
 * Never a figure of Merlin's: no value typed reads as none.
 */
export function DealWorth({ deal }: { deal: PipelineRec }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(deal.value ? String(deal.value) : "");
  const [pitch, setPitch] = useState(deal.pitch ?? "");
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState<{ t: string; bad: boolean } | null>(null);
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const won = deal.stage === "won" && deal.won;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setSay(null);
    const r = await pipelineAct({ type: "pipeline.value", id: deal.id, value: val.trim() || null, pitch: pitch.trim() || null } as never);
    setBusy(false);
    setSay({ t: r.message, bad: !r.ok });
    if (r.ok) setEdit(false);
  };
  return (
    <section className="co-card co-worth" aria-labelledby="co-worth-h">
      <div className="co-card-h">
        <h2 id="co-worth-h">What it is worth</h2>
        <span className="co-sub">
          {won ? `Won at ${money(deal.won!.monthly)} a month, from the terms.` : deal.value ? `${money(deal.value)} a month, as you typed it.` : "No value yet. Type what it is worth a month and Pipeline's totals count it."}
          {deal.pitch ? ` You pitch ${deal.pitch}.` : ""}
        </span>
      </div>
      {!edit ? (
        <button type="button" className="btn btn-sm" onClick={() => (setEdit(true), setSay(null), setVal(deal.value ? String(deal.value) : ""), setPitch(deal.pitch ?? ""))}>
          {deal.value || deal.pitch ? "Change the value or the seat" : "Add the value and the seat"}
        </button>
      ) : (
        <form
          className="co-worth-f"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="co-worth-l">
            <span>Value a month, in dollars</span>
            <input className="input" inputMode="numeric" autoComplete="off" value={val} placeholder="9000" onChange={(e) => setVal(e.target.value)} />
          </label>
          <label className="co-worth-l">
            <span>Seat you are pitching</span>
            <input className="input" autoComplete="off" maxLength={60} value={pitch} placeholder="Fractional VP Sales" onChange={(e) => setPitch(e.target.value)} />
          </label>
          <span className="co-worth-acts">
            <button type="submit" className="btn btn-sm btn-pine" disabled={busy} aria-busy={busy}>
              Save
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setEdit(false), setSay(null))}>
              Cancel
            </button>
          </span>
        </form>
      )}
      {say && (
        <p className={`co-sub co-worth-say${say.bad ? " bad" : ""}`} role={say.bad ? "alert" : "status"}>
          {say.t}
        </p>
      )}
    </section>
  );
}

/* ---------- the right column ---------- */

/** The one next step with this company (companyModel.ts nextMoveOf). */
export function NextMove({ m, onGo }: { m: NextMoveCard; onGo: (go: NonNullable<NextMoveCard["go"]>) => void }) {
  return (
    <section className="co-side-card co-next" aria-labelledby="co-next-h">
      <div className="co-side-k">
        <span>Next move</span>
        {m.due && (
          <span className="co-due">
            <span className="co-due-dot" aria-hidden /> Due today
          </span>
        )}
      </div>
      <h2 id="co-next-h">{m.title}</h2>
      <p>{m.body}</p>
      {m.steps && (
        <ol className="co-steps">
          {m.steps.map((s, k) => (
            <li key={k} className={k === 0 ? "on" : ""}>
              <span className="co-step-n" aria-hidden>
                {k + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
      {m.btn && m.go && (
        <button type="button" className="btn btn-pine co-next-go" onClick={() => onGo(m.go!)}>
          {m.btn}
        </button>
      )}
    </section>
  );
}

/** The company facts still missing here, each earning 1 credit while today's room lasts. Nothing can be added to a locked company. */
export function AddHere({ i }: { i: CoInfo }) {
  const ui = useUi();
  const c = i.c;
  const exempt = !!c.added || i.engs.some((e) => e.yours);
  if (c.hidden)
    return (
      <section className="co-side-card" aria-labelledby="co-add-h">
        <h2 id="co-add-h">Add what you know here</h2>
        <p className="co-sub">Open the company first. Nothing can be added to a locked company. After that, each fact Merlin doesn&apos;t have earns 1 credit.</p>
      </section>
    );
  const missing = COMPANY_FILL.filter((f) => c.cells[f]?.s === "empty").map((f) => ({ entity: "company" as const, id: c.id, field: f }));
  const capped = earnNote(ui.me).capped;
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  const can = earnable(ui, { exempt }, missing);
  const LABEL: Record<string, string> = { website: "Website", linkedin: "Public company page", industry: "Industry", employees: "Employees", revenue: "Revenue", hq: "HQ", ownership: "Ownership", businessModel: "Business model", motion: "Sales motion", dealSize: "Average deal size", salesCycle: "Sales cycle", about: "About" };
  return (
    <section className="co-side-card" aria-labelledby="co-add-h">
      <h2 id="co-add-h">Add what you know here</h2>
      <span className="co-sub">
        {capped
          ? `You've earned today's ${ui.me.earnCap} credits. Adding still helps, and earns again tomorrow.`
          : missing.length
            ? `${plural(missing.length, "fact")} ${missing.length === 1 ? "is" : "are"} missing here. ${can === missing.length ? "Each one earns 1 credit" : `Up to ${plural(can, "credit")} today`}, and you can earn ${room} more today.`
            : `Each fact Merlin doesn't have earns 1 credit, and you can earn ${room} more today.`}
      </span>
      <div className="co-adds">
        {missing.slice(0, 4).map((t) => (
          <button key={t.field} type="button" className="co-add" data-cell={cellKey(t.id, t.field)} onClick={(e) => ui.edit(e.currentTarget, t)}>
            <span>{LABEL[t.field] ?? t.field}</span>
            {!capped && <span className="co-earn num">+1</span>}
          </button>
        ))}
        {i.engs.some((e) => e.yours) ? null : (
          <button type="button" className="co-add" onClick={() => ui.openAdd({ companyId: c.id, mode: "engagement" })}>
            <span>A seat you held here</span>
            {!capped && <span className="co-earn num">+1 a fact</span>}
          </button>
        )}
        <button type="button" className="co-add" onClick={() => ui.openAdd({ companyId: c.id, mode: "person" })}>
          <span>Someone who decides here</span>
          {!capped && <span className="co-earn num">+1 a fact</span>}
        </button>
      </div>
      <button type="button" className="btn btn-volt co-add-go" onClick={() => ui.openAdd({ companyId: c.id })}>
        <IconPlus size={14} /> Add what you know here
      </button>
    </section>
  );
}

/**
 * Closest evidence (Evidence Bank, a Close feature): the member's own ready case most like this
 * company, with its match word and why (GET /api/evidence/closest), or the way to their first case.
 * Private: only the member sees it. Nothing on Free and Pro, where Evidence Bank's uses are not shown.
 */
export function EvidenceCard({ companyId, onOpen }: { companyId: string; onOpen: () => void }) {
  const { summary } = useClosest([companyId], true);
  const r = closestOf(companyId);
  return (
    <section className="co-side-card co-ev" aria-labelledby="co-ev-h">
      <span className="co-side-k">Closest evidence case · private</span>
      {!summary ? (
        <>
          <h2 id="co-ev-h">Closest evidence</h2>
          <p className="co-sub">Looking in your Evidence Bank.</p>
        </>
      ) : !summary.ready ? (
        <>
          <h2 id="co-ev-h">No finished case yet</h2>
          <p className="co-sub">
            {summary.drafts
              ? `${summary.drafts === 1 ? "A draft from your seats waits" : `${plural(summary.drafts, "draft")} from your seats wait`} in Evidence Bank. Finish one and Merlin shows here how close it is to this company.`
              : "Write your first case: the problem, what you did, the numbers before and after. Merlin then shows here how close it is to this company."}
          </p>
          <button type="button" className="btn btn-sm" onClick={onOpen}>
            {summary.drafts ? "Finish your first case" : "Write your first case"}
          </button>
          <span className="co-sub co-ev-step">Step 6. It fills the Proof part of every proposal.</span>
        </>
      ) : r ? (
        <>
          <h2 id="co-ev-h">{r.title || "Your closest case"}</h2>
          <span className="co-ev-match">
            <strong>{labelWords(r.label)}</strong>
            {r.same.slice(0, 3).map((w) => (
              <span key={w} className="co-ev-chip">
                {w}
              </span>
            ))}
          </span>
          {(r.outcome || r.diff.length > 0) && (
            <p className="co-sub">
              {r.outcome ? `${r.outcome}.` : ""}
              {r.diff.length ? ` ${r.diff.slice(0, 2).join(". ")}.` : ""}
            </p>
          )}
          <button type="button" className="btn btn-sm" onClick={onOpen}>
            Open the case
          </button>
        </>
      ) : (
        <>
          <h2 id="co-ev-h">No close case</h2>
          <p className="co-sub">None of your {plural(summary.ready, "ready case")} is matched to this company.</p>
          <button type="button" className="btn btn-sm" onClick={onOpen}>
            See your cases
          </button>
        </>
      )}
    </section>
  );
}

/** "N facts, M missing, K locked": the record's last line, from the counts the table has. */
export const factsLine = (i: CoInfo, lockedN: number) => `${plural(i.c.facts.known + i.c.facts.locked, "fact")}, ${i.c.facts.missing} missing${i.c.hidden ? "" : `, ${lockedN} locked`}`;

export { onFile };

