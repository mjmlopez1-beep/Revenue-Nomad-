"use client";

/**
 * The person bubble (BUILD_PLAN F7, People.dc.html): a popover on a person's name, wherever it
 * shows (the People table, the company record), with
 *
 *   What Merlin holds   the record's own cells, drawn by the table's own cells (Tables.tsx RowFact,
 *                       NameAndTitle), so every lock is the same single purchase at the same price
 *                       with the same question first: the name and title are one unlock, then the
 *                       email, phone and public profile 1 credit each. Their relationship is free.
 *   How you know them   the member's own (lib/paths knownView: Google, their LinkedIn file, their
 *                       contacts CSV, messages on Merlin): how warm, why, the last touch as a date,
 *                       where it came from, and "Not a relationship". Only the member sees it.
 *   Public profile      a link once it is open, never called a source.
 *   A member on Merlin  their Fractionals card (free on every plan).
 *   Actions             Draft a note, Open name and title, Add to pipeline, Your way in, Open the
 *                       company.
 *
 * The name rules are the server's, exactly as today (scripts/test-names.mts, test-same-person.mts):
 * the bubble shows a name only when the record's own cell holds it, so a Californian, a name
 * hidden by Remove my name, or a person at a locked company never shows here either. The member's
 * own words for someone ("You know them as ...") come only from what the member brought in
 * themselves. Never another member's network.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Cell, EngagementRec, FractionalRec, FractionalsView, PersonRec } from "@/lib/tableTypes";
import type { KnownPersonView, PathSource } from "@/lib/paths/types";
import { IconExternal, initials, useToast } from "../ui/shared";
import type { CoInfo } from "./model";
import { personCoverOf } from "./model";
import { NameAndTitle, RowFact } from "./Tables";
import { Anchored, useUi } from "./ui";
import { awayAct, useKnown } from "./network/usePaths";
import { warmWord } from "./network/ConnectPanel";
import { leadTitle, levelLine } from "./fractionalsModel";
import { useAppMaybe } from "./shell/pages";
import "./personBubble.css";

const val = (c: Cell | undefined) => (c?.s === "value" && c.v ? c.v : null);

/** The person's name and title as the member may see them (the record's own cells), or null while locked. */
export function shownPerson(p: PersonRec | null | undefined): { name: string; title: string | null } | null {
  const name = val(p?.cells.name);
  return name ? { name, title: val(p?.cells.title) } : null;
}

/** Where the member knows them from, in their own words. */
export const SRC_WORDS: Record<PathSource, string> = { google: "Google", linkedin: "your LinkedIn connections file", csv: "your contacts file", messages: "messages on Merlin" };
export const srcLine = (src: PathSource[]) => {
  const w = src.map((s) => SRC_WORDS[s]);
  return w.length ? `From ${w.length > 1 ? `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}` : w[0]}` : "";
};

/** "Nov 12" this year, "Nov 2024" before. */
export function dayWords(d: string | null | undefined, nowMs = Date.now()): string | null {
  if (!d) return null;
  const t = Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const same = new Date(t).getUTCFullYear() === new Date(nowMs).getUTCFullYear();
  return new Date(t).toLocaleDateString("en-US", same ? { month: "short", day: "numeric", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Who the member knows, by the person record on Merlin each is (KnownPersonView.record). */
export function useKnownByRecord(): Map<string, KnownPersonView> {
  const { known } = useKnown();
  return useMemo(() => {
    const m = new Map<string, KnownPersonView>();
    for (const p of known?.people ?? []) if (p.record && !m.has(p.record)) m.set(p.record, p);
    return m;
  }, [known]);
}

/* ---------- a member's Fractionals card ---------- */

let frCache: Promise<FractionalsView | null> | null = null;
const loadFractionals = () =>
  (frCache ??= fetch("/api/table?fractionals=1", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<FractionalsView>) : null))
    .catch(() => null));

function FractionalCard({ memberId, onOpen }: { memberId: string; onOpen?: () => void }) {
  const [rec, setRec] = useState<FractionalRec | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadFractionals().then((v) => live && setRec(v?.records.find((r) => r.memberId === memberId && !r.locked) ?? null));
    return () => {
      live = false;
    };
  }, [memberId]);
  if (!rec) return null;
  return (
    <div className="pb-card" aria-label="Their card on Fractionals">
      <span className="pb-card-k">A fractional on Merlin</span>
      <strong>{rec.name ?? "A fractional"}</strong>
      <span>{[leadTitle(rec), levelLine(rec)].filter(Boolean).join(" · ")}</span>
      {rec.clients?.line && <span className="pb-muted">{rec.clients.line}</span>}
      <span className="pb-muted num">
        {rec.now} {rec.now === 1 ? "seat" : "seats"} now · {rec.past} past
      </span>
      {onOpen && (
        <button type="button" className="tp-flink pb-card-go" onClick={onOpen}>
          See them on Fractionals
        </button>
      )}
    </div>
  );
}

/* ---------- the bubble ---------- */

export interface PersonBubbleProps {
  /** The name it points at (it opens under it, or above it near the foot of the screen). */
  anchor: HTMLElement;
  i: CoInfo;
  /** The record on Merlin, or null for someone the member knows who has none on file. */
  p: PersonRec | null;
  e?: EngagementRec | null;
  /** How the member knows them (their own), or null. */
  known: KnownPersonView | null;
  onClose: () => void;
  /** The deal stage with their company in the member's pipeline ("Talking"), or null. */
  stage?: string | null;
  onAddPipeline?: () => void;
  onPipeline?: () => void;
  /** Draft a note to them (only once their name shows). */
  onDraft?: () => void;
  /** Bring in who you know (step 3), when Merlin has nothing of the member's for them. */
  onConnect?: () => void;
  /** Add them (or their missing facts) to earn credits. */
  onAdd?: () => void;
  /** The list chip ("On your list Sales-led SaaS"), when they are on one. */
  chips?: string[];
  /** Your way in, where the page has its own (the company page's Ways in tab); else Warm paths. */
  onWays?: () => void;
  /** Their full card on the page (confirm, report, add a detail), where the page has one. */
  onCard?: () => void;
  /** Opened on their company's own page: no "Open the company". */
  here?: boolean;
}

function Line({ k, children, sub }: { k: string; children: ReactNode; sub?: string | null }) {
  return (
    <div className="pb-line">
      <span className="pb-k">{k}</span>
      <span className="pb-v">
        <span className="pb-v-t">{children}</span>
        {sub && <span className="pb-sub">{sub}</span>}
      </span>
    </div>
  );
}

export function PersonBubble({ anchor, i, p, e = null, known, onClose, stage, onAddPipeline, onPipeline, onDraft, onConnect, onAdd, chips = [], onWays, onCard, here = false }: PersonBubbleProps) {
  const app = useAppMaybe();
  const ui = useUi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const shown = shownPerson(p);
  const coLocked = !!i.c.hidden;
  const co = coLocked ? "a locked company" : i.c.name;
  const rel = val(p?.cells.relationship);
  const nameLocked = !!p && !shown && (p.cells.name?.s === "locked" || p.cells.title?.s === "locked");
  // Someone the member knows who has no record on file: their own words, said as theirs.
  const own = !p && known;
  const title = shown ? shown.name : own ? known.name : `${rel ?? "Someone"} at ${co}`;
  const sub = shown ? [shown.title, coLocked ? null : i.c.name].filter(Boolean).join(" · ") : own ? [known.title, coLocked ? null : i.c.name].filter(Boolean).join(" · ") : coLocked ? "Their name and title open after the company." : "Name and title are locked. 1 credit opens both.";
  const seatV = e ? val(e.cells.role) ?? (val(e.cells.function) ? `a fractional ${val(e.cells.function)} seat` : null) : null;
  const seat = seatV ? `At the company: ${seatV}.` : i.latest && !coLocked ? `At the company: ${val(i.latest.cells.role) ?? "a fractional seat on file"}.` : null;
  const t = (field: string) => ({ entity: "contact" as const, id: p!.id, field });
  const cell = (field: string, render?: (v: string) => ReactNode) =>
    p ? <RowFact t={t(field)} cell={p.cells[field]} cover={personCoverOf(i, e, p, field)} render={render} noAdd={!shown ? "Opens after the name" : null} /> : <span className="pb-muted">Not on file</span>;
  const ref = useRef<HTMLDivElement>(null);
  const known0 = known && !known.away ? known : null;
  const away = async (on: boolean) => {
    if (!known) return;
    setBusy(true);
    const r = await awayAct(known.key, on);
    setBusy(false);
    toast(r.error ?? (on ? `${known.name} is set aside. Merlin remembers it on every read.` : `${known.name} is back in People I know.`), !!r.error);
    if (!r.error && on) onClose();
  };
  const buyName = async () => {
    if (!p) return;
    const lead = (["name", "title"] as const).find((f) => p.cells[f]?.s === "locked") ?? "name";
    await ui.unlock(t(lead));
  };
  const allChips = [rel, ...chips, known?.away ? "Set aside" : null].filter((x): x is string => !!x);
  return (
    <Anchored anchor={anchor} width={520} onClose={onClose} className="pb" role="dialog" label={shown ? shown.name : own ? known.name : `A locked person at ${co}`}>
      <div ref={ref} className="pb-in">
        <div className="pb-head">
          <span className="pb-tile" aria-hidden>
            {shown ? initials(shown.name) : own ? initials(known.name) : "?"}
          </span>
          <span className="pb-who">
            <strong>{title}</strong>
            <span>{sub}</span>
            {seat && <span className="pb-muted">{seat}</span>}
          </span>
          <button type="button" className="pb-x" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {allChips.length > 0 && (
          <div className="pb-chips">
            {allChips.map((c) => (
              <span key={c} className={`pb-chip${c === "Decision maker" ? " pb-chip-dm" : ""}`}>
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="pb-sec" aria-label="How you know them">
          <Line k="How you know them" sub={known ? [known.why, srcLine(known.src)].filter(Boolean).join(" · ") : null}>
            {known ? (
              known.away ? (
                <span className="pb-muted">Set aside: not a relationship</span>
              ) : (
                <>
                  <span className={`pb-warm pb-warm-${warmWord(known.warmth).toLowerCase()}`}>{warmWord(known.warmth)}</span>
                  {!own && shown?.name !== known.name && <span className="pb-as">In your own contacts as {known.name}</span>}
                </>
              )
            ) : coLocked ? (
              // At a locked company nothing of the member's own is matched here, for any locked company alike (lib/paths/types.ts fromFile).
              <span className="pb-muted">Shows once the company is open</span>
            ) : onConnect ? (
              <button type="button" className="tp-flink" onClick={onConnect}>
                Not brought in yet. Bring in who you know
              </button>
            ) : (
              <span className="pb-muted">No one you know yet</span>
            )}
          </Line>
          <Line k="Last touch" sub={known?.lastKind ?? null}>
            {known?.last ? dayWords(known.last) : <span className="pb-muted">None yet</span>}
          </Line>
        </div>

        <div className="pb-sec" aria-label="What Merlin holds">
          {p ? (
            <>
              {nameLocked && !coLocked && (
                <Line k="Name and title">
                  <NameAndTitle i={i} e={e} p={p} />
                </Line>
              )}
              <Line k="Email">{cell("email")}</Line>
              <Line k="Phone">{cell("phone")}</Line>
              <Line k="Public profile">
                {cell("linkedin", (v) => (
                  <a className="pb-link" href={v} target="_blank" rel="noopener noreferrer">
                    Their public profile <IconExternal size={11} />
                  </a>
                ))}
              </Line>
            </>
          ) : (
            <>
              <Line k="On Merlin">
                <span className="pb-muted">Merlin holds no record of them yet.</span>
              </Line>
              {known?.email && <Line k="Email (yours)">{known.email}</Line>}
              {known?.profile && (
                <Line k="Public profile (yours)">
                  <a className="pb-link" href={known.profile} target="_blank" rel="noopener noreferrer">
                    Their public profile <IconExternal size={11} />
                  </a>
                </Line>
              )}
              {onAdd && !coLocked && (
                <button type="button" className="pb-earn" onClick={onAdd}>
                  + Add them · earn 1 credit
                </button>
              )}
            </>
          )}
        </div>

        {known?.member && <FractionalCard memberId={known.member} onOpen={app ? () => app.openPage("fractionals") : undefined} />}

        <div className="pb-acts">
          {(shown || own) && onDraft && (
            <button type="button" className="btn btn-sm btn-pine" onClick={onDraft}>
              Draft a note
            </button>
          )}
          {nameLocked && !coLocked && (
            <button type="button" className="btn btn-sm btn-pine" onClick={() => void buyName()}>
              Open name and title · 1 credit
            </button>
          )}
          {stage ? (
            onPipeline ? (
              <button type="button" className="btn btn-sm pb-stage" onClick={onPipeline}>
                In pipeline: {stage}
              </button>
            ) : (
              <span className="pb-stage">In pipeline: {stage}</span>
            )
          ) : (
            onAddPipeline &&
            !coLocked && (
              <button type="button" className="btn btn-sm" onClick={onAddPipeline}>
                Add to pipeline
              </button>
            )
          )}
          {(onWays || app) && !coLocked && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => (onClose(), onWays ? onWays() : app?.openPage("warm"))}>
              Your way in
            </button>
          )}
          {onCard && p && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => (onClose(), onCard())}>
              Confirm, report or add to this
            </button>
          )}
          {app && !coLocked && !here && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => (onClose(), app.openCompany(i.c.id))}>
              Open the company
            </button>
          )}
        </div>
        <div className="pb-foot">
          <span>Only you see how you know someone. Merlin keeps who and when, never what was said, and never sends for you.</span>
          {known0 && (
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void away(true)}>
              Not a relationship
            </button>
          )}
          {known?.away && (
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void away(false)}>
              Undo: it is a relationship
            </button>
          )}
        </div>
      </div>
    </Anchored>
  );
}

/**
 * A person's name as a button that opens their bubble: for any page that lists people (the
 * company record's people, Pipeline, Messages). The name shows only when the record's own cell
 * holds it; else what they are ("Decision maker at a locked company").
 */
export function PersonNameButton({ i, p, e = null, className = "", more }: { i: CoInfo; p: PersonRec; e?: EngagementRec | null; className?: string; more?: Pick<PersonBubbleProps, "onWays" | "onCard" | "here" | "stage" | "onPipeline" | "onAddPipeline"> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const byRecord = useKnownByRecord();
  const shown = shownPerson(p);
  const rel = val(p.cells.relationship);
  return (
    <>
      <button ref={ref} type="button" className={`pb-name ${className}`} aria-haspopup="dialog" aria-expanded={open} onClick={(ev) => (ev.stopPropagation(), setOpen(!open))}>
        <span className="pb-name-t">{shown ? shown.name : `${rel ?? "Someone"} at ${i.c.hidden ? "a locked company" : i.c.name}`}</span>
        {shown?.title && <span className="pb-name-s">{shown.title}</span>}
      </button>
      {open && ref.current && <PersonBubble anchor={ref.current} i={i} p={p} e={e} known={byRecord.get(p.id) ?? null} onClose={() => setOpen(false)} {...more} />}
    </>
  );
}
