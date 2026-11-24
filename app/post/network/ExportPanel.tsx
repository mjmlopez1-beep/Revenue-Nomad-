"use client";

/**
 * "Bring in your LinkedIn data export" (lib/linkedin): the member picks the export's .zip (or some
 * of its CSV files). It is read here, on their device (lib/linkedin/read.ts): only the table of
 * contents of the archive, then only the files Merlin reads (lib/linkedin/files.ts). The consent
 * screen says which files Merlin reads and which it never does, then one tick a use (all on but
 * the voice and Evidence Bank, which are opt-in). Bring it in sends only the payload of the ticked
 * uses, worked out here: never the archive, never a message's words. Only the member sees it.
 *
 * Also here, where the export's results show:
 *   ExportSeats   "These look like your seats": the member's own roles, the fractional, interim and
 *                 advisor titles first, each confirmed with the existing Add (its credits and rules)
 *                 or set aside with Not a seat. Nothing is added without the click. The set-up's
 *                 seats step and Your seats show it.
 *   FollowOffers  "Follow these on Merlin too": the companies they follow there that are on Merlin
 *                 by their exact name; a locked one described, never named. The member ticks which.
 *   ExportProof   The recommendations kept as proof (Close), in Evidence Bank, each removable.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, post, useToast, type Act } from "../../ui/shared";
import type { ActionResult } from "@/lib/tableTypes";
import { NEVER_WORDS, READS, type ExportFile } from "@/lib/linkedin/files";
import { readExport, type ExportRead } from "@/lib/linkedin/read";
import { ASK_EARLY, EXPORT_HOW, USES_ON_BY_DEFAULT, USE_KEYS, USE_WORDS, type ExportInfo, type ExportView, type SeatOfferView, type UseKey } from "@/lib/linkedin/types";
import { exportAct, loadExport, useExport } from "./useExport";
import "./linkedinExport.css";

const n = (x: number) => x.toLocaleString("en-US");
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthWords = (m: string | null) => (m ? (m.length === 7 ? `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` : m) : null);

/** What came in, in a line of counts: "Nov 23: 1,240 connections, warmth for 310 people, 6 roles to confirm". */
export function exportLine(info: ExportInfo): string {
  const c = info.counts;
  const parts = [
    c.connections ? `${n(c.connections)} connections` : "",
    c.invites ? `${n(c.invites)} invited` : "",
    c.warm ? `warmth for ${n(c.warm)} people` : "",
    c.vouch ? `${n(c.vouch)} who vouched` : "",
    c.positions ? `${n(c.positions)} roles` : "",
    c.follows ? `${n(c.follows)} companies to follow` : "",
    c.proof ? `${n(c.proof)} recommendations as proof` : "",
    c.voice ? "your voice" : "",
  ].filter(Boolean);
  return `Brought in ${fmtDay(info.at)}${parts.length ? `: ${parts.join(", ")}` : ""}.`;
}

/** Which uses have something in this export, and the count line under each. */
function usesOf(r: ExportRead, v: ExportView | null): { k: UseKey; line: string }[] {
  const p = r.preview;
  const out: { k: UseKey; line: string }[] = [];
  if (p.connections || p.invites)
    out.push({ k: "know", line: [p.connections ? `${n(p.connections)} connections${p.namesOnly ? ", names and profile links only" : ""}` : "", p.invites ? `${n(p.invites)} pending invitations` : ""].filter(Boolean).join(" and ") });
  if (p.positions) out.push({ k: "seats", line: `${n(p.positions)} roles${p.fractionalPositions ? `, ${n(p.fractionalPositions)} of them fractional, interim, advisor or consulting` : ""}` });
  if (p.warmPeople) out.push({ k: "warm", line: `${n(p.warmPeople)} people, from ${n(p.messages)} messages. The words stay on this device.` });
  if (p.vouch || p.recsReceived) out.push({ k: "vouch", line: `${n(p.vouch)} of your connections recommended or endorsed you, or you them` });
  if (p.follows) out.push({ k: "follows", line: `${n(p.follows)} companies you follow` });
  if (p.skills && v && (v.emptyProfile.function || v.emptyProfile.title)) out.push({ k: "skills", line: `${n(p.skills)} skills. Fills only what your profile leaves empty.` });
  if (p.posts >= 3) {
    const voice = r.voice(null);
    const reads = voice ? [voice.formality.charAt(0).toUpperCase() + voice.formality.slice(1), voice.length, voice.contractions ? "contractions" : "no contractions", voice.exclamations === "sometimes" ? "an exclamation mark now and then" : "no exclamation marks"].join(", ") : "";
    out.push({ k: "voice", line: voice ? `${n(p.posts)} recent posts read here. Reads as: ${reads}.${v?.hasVoice ? " Replaces the voice you saved." : ""}` : `${n(p.posts)} posts` });
  }
  if (p.recsReceived) out.push({ k: "proof", line: v?.proofAllowed ? `${n(p.recsReceived)} recommendations, by first name and company` : "Part of Close" });
  return out.sort((a, b) => USE_KEYS.indexOf(a.k) - USE_KEYS.indexOf(b.k));
}

type Stage = { s: "idle" } | { s: "reading" } | { s: "consent"; read: ExportRead; uses: Set<UseKey> } | { s: "sending" } | { s: "done"; message: string };

export function ExportPanel({ picked, onClose, compact }: { picked?: File[]; onClose?: () => void; compact?: boolean }) {
  const { view } = useExport();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ s: "idle" });
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const started = useRef(false);
  const info = view?.info ?? null;

  const read = async (files: File[]) => {
    if (!files.length) return;
    setErr(null);
    setStage({ s: "reading" });
    try {
      const r = await readExport(files);
      if (!Object.keys(r.found).length) {
        setStage({ s: "idle" });
        return setErr(r.problems[0] ?? "Merlin found none of the files it reads in that. Pick the .zip LinkedIn sent, or Connections.csv from inside it.");
      }
      const allowed = new Set(usesOf(r, view).map((x) => x.k));
      setStage({ s: "consent", read: r, uses: new Set(USES_ON_BY_DEFAULT.filter((k) => allowed.has(k))) });
    } catch {
      setStage({ s: "idle" });
      setErr("That couldn't be read on this device. Download the export again and pick the .zip.");
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  // Files picked before this opened (the connections file's button took a .zip): read them at once.
  useEffect(() => {
    if (picked?.length && !started.current) {
      started.current = true;
      void read(picked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  const send = async (r: ExportRead, uses: Set<UseKey>) => {
    setErr(null);
    setStage({ s: "sending" });
    // Only the payload of the ticked uses leaves the device, worked out above. Never a file but Connections.csv.
    const res = await exportAct({ op: "import", payload: r.payload([...uses]) });
    if (res.error) {
      setStage({ s: "consent", read: r, uses });
      return setErr(res.error);
    }
    setStage({ s: "done", message: res.message ?? "Brought in. Only you see it." });
  };

  const fileInput = (
    <input
      ref={input}
      type="file"
      multiple
      accept=".zip,application/zip,application/x-zip-compressed,.csv,text/csv"
      className="cp-file"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => void read([...(e.target.files ?? [])])}
    />
  );

  if (stage.s === "reading" || stage.s === "sending")
    return (
      <div className="lx" role="status" aria-busy>
        <strong className="lx-h">{stage.s === "reading" ? "Reading your export on this device" : "Bringing in what you ticked"}</strong>
        <span className="lx-sub">{stage.s === "reading" ? "A large messages file can take a few seconds. Nothing is sent yet." : "Only the counts and names each use needs."}</span>
      </div>
    );

  if (stage.s === "consent") {
    const r = stage.read;
    const lines = usesOf(r, view);
    const found = READS.filter((f) => r.found[f.key] !== undefined);
    const toggle = (k: UseKey) => {
      const next = new Set(stage.uses);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      setStage({ ...stage, uses: next });
    };
    const shownSkipped = r.skipped.slice(0, 14);
    return (
      <div className="lx lx-consent" aria-labelledby="lx-consent-h">
        <strong className="lx-h" id="lx-consent-h">
          Your export, read on this device
        </strong>
        <span className="lx-sub">Nothing has left this device yet. Pick what Merlin may use, then bring it in.</span>
        <div className="lx-two">
          <section className="lx-box lx-reads" aria-label="Merlin reads these files">
            <strong>Merlin reads these files</strong>
            <ul>
              {found.map((f) => (
                <li key={f.key}>
                  <IconCheck size={13} />
                  <span>
                    <b>{f.name}</b> <span className="lx-n num">{n(r.found[f.key as ExportFile] ?? 0)}</span>
                    <span className="lx-takes">{f.takes}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="lx-box lx-never" aria-label="It never reads">
            <strong>It never reads</strong>
            <p>{NEVER_WORDS.join(", ")}.</p>
            {r.skipped.length > 0 && (
              <p className="lx-files">
                <span>These {n(r.skipped.length)} files stay on this device, unopened:</span> {shownSkipped.join(", ")}
                {r.skipped.length > shownSkipped.length ? `, and ${n(r.skipped.length - shownSkipped.length)} more` : ""}.
              </p>
            )}
          </section>
        </div>
        <fieldset className="lx-uses">
          <legend>What Merlin may use</legend>
          {lines.map(({ k, line }) => {
            const locked = k === "proof" && !view?.proofAllowed;
            return (
              <label key={k} className={`lx-use${locked ? " off" : ""}`}>
                <input type="checkbox" checked={stage.uses.has(k)} disabled={locked} onChange={() => toggle(k)} />
                <span>
                  <strong>
                    {USE_WORDS[k].name}
                    {k === "voice" || k === "proof" ? <span className="lx-opt">Opt-in</span> : null}
                  </strong>
                  <span>{USE_WORDS[k].line}</span>
                  <span className="lx-count">{line}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {r.preview.namesOnly ? <p className="lx-note">{ASK_EARLY}</p> : null}
        {r.problems.length ? <p className="lx-note">{r.problems.join(" ")}</p> : null}
        {err && (
          <p className="cp-err" role="alert">
            {err}
          </p>
        )}
        <div className="cp-row">
          <button type="button" className="btn btn-pine cp-go" disabled={!stage.uses.size || (view ? view.importsLeft <= 0 : false)} onClick={() => void send(r, stage.uses)}>
            Bring in what is ticked
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => (setStage({ s: "idle" }), onClose?.())}>
            Cancel
          </button>
        </div>
        <span className="lx-foot">Only what is ticked leaves this device, as counts, names and profile links. The archive is never uploaded. Only you see it, and you can remove it at any time.</span>
      </div>
    );
  }

  return (
    <div className={`lx${compact ? " lx-compact" : ""}`}>
      {fileInput}
      {stage.s === "done" ? (
        <p className="cp-ok" role="status">
          {stage.message}
        </p>
      ) : info ? (
        <p className="lx-in" role="status">
          <IconCheck size={14} /> {exportLine(info)}
        </p>
      ) : (
        <>
          <p className="lx-note lx-early">{ASK_EARLY}</p>
          <ol className="cp-steps">
            {EXPORT_HOW.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {err && (
        <p className="cp-err" role="alert">
          {err}
        </p>
      )}
      {(stage.s === "done" || info) && view ? <FollowOffers view={view} /> : null}
      {(stage.s === "done" || info) && view?.seats.length ? (
        <p className="lx-note">
          {view.seats.length === 1 ? "1 role looks like a seat you held." : `${n(view.seats.length)} roles look like seats you held.`} Confirm them on Your seats. Nothing is added until you do.
        </p>
      ) : null}
      {asking ? (
        <div className="cp-confirm" role="group" aria-label="Remove the export?">
          <p>Remove everything your export brought in: the connections it brought, invitations, warmth, who vouched, roles and the recommendations kept as proof. Seats you confirmed, companies you followed and your voice stay. This can&apos;t be undone.</p>
          <div className="cp-row">
            <button
              type="button"
              className="btn cp-danger-solid"
              onClick={async () => {
                const r = await exportAct({ op: "remove" });
                setAsking(false);
                setStage({ s: "idle" });
                toast(r.error ?? r.message ?? "Removed.", !!r.error);
              }}
            >
              Remove it
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="cp-row">
          <button type="button" className={`btn${info ? "" : " btn-pine"} cp-go`} disabled={view ? view.importsLeft <= 0 : false} onClick={() => input.current?.click()}>
            {info ? "Bring in a newer export" : "Choose your export (.zip or CSV files)"}
          </button>
          {info && (
            <button type="button" className="btn cp-danger" onClick={() => setAsking(true)}>
              Remove
            </button>
          )}
        </div>
      )}
      {view && view.importsLeft <= 0 ? <p className="lx-note">That&apos;s 3 uploads today. Bring it in again tomorrow.</p> : null}
      <span className="lx-foot">Read on this device. Merlin never reads your messages&apos; words, logins, receipts, phone numbers or ads data, and never uploads the archive.</span>
    </div>
  );
}

/* ---------- Follow these on Merlin too ---------- */

export function FollowOffers({ view }: { view: ExportView }) {
  const toast = useToast();
  const left = view.follows.filter((f) => !f.following);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  if (!view.follows.length) return null;
  const follow = async () => {
    setBusy(true);
    let k = 0;
    for (const id of ticked) {
      // The existing follow: a locked company is followed and stays described, never named.
      const r = await post<ActionResult>({ action: { type: "follow", companyId: id, on: true } });
      if (!r.error) k++;
    }
    setBusy(false);
    setTicked(new Set());
    await loadExport(true);
    toast(k ? `Following ${k} more ${k === 1 ? "company" : "companies"}. Their alerts come as your follows do.` : "Nothing changed.");
  };
  return (
    <section className="lx-box lx-follow" aria-label="Follow these on Merlin too">
      <strong>Follow these on Merlin too</strong>
      <span className="lx-sub">Companies you follow there that are on Merlin, matched by their exact name. Locked ones show by their facts until you open them.</span>
      <ul>
        {view.follows.map((f) => (
          <li key={f.id}>
            <label>
              <input
                type="checkbox"
                checked={f.following || ticked.has(f.id)}
                disabled={f.following || busy}
                onChange={() =>
                  setTicked((t) => {
                    const x = new Set(t);
                    if (x.has(f.id)) x.delete(f.id);
                    else x.add(f.id);
                    return x;
                  })
                }
              />
              <span>
                <b>{f.name ?? "A locked company"}</b>
                <span className="lx-takes">{f.facts || "On Merlin"}</span>
              </span>
              {f.following ? <span className="lx-tag">Following</span> : null}
            </label>
          </li>
        ))}
      </ul>
      {left.length > 0 && (
        <button type="button" className="btn btn-pine btn-sm" disabled={!ticked.size || busy} aria-busy={busy} onClick={() => void follow()}>
          {busy ? "Following" : ticked.size ? `Follow the ${ticked.size} ticked` : "Tick the ones to follow"}
        </button>
      )}
    </section>
  );
}

/* ---------- These look like your seats ---------- */

const KIND_WORDS: Record<NonNullable<SeatOfferView["kind"]>, string> = { fractional: "Fractional", interim: "Interim", advisor: "Advisor", consulting: "Consulting" };
const TYPE_OF: Partial<Record<NonNullable<SeatOfferView["kind"]>, string>> = { fractional: "Fractional", interim: "Interim", advisor: "Advisory" };

/** What Confirm sends: the existing Add's seat fields, with the member as the seat holder. */
export function offerFields(o: SeatOfferView, holder: string): Record<string, string> {
  const type = o.kind ? TYPE_OF[o.kind] : undefined;
  return {
    operator: holder,
    role: o.title,
    ...(o.fn ? { function: o.fn } : {}),
    ...(type ? { type } : {}),
    ...(o.from ? { start: o.from } : {}),
    ...(o.active ? { status: "Active" } : o.to ? { end: o.to, status: "Ended" } : { status: "Ended" }),
  };
}

export function ExportSeats({ act, holder }: { act: Act; holder: string }) {
  const { view } = useExport();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ key: string; line: string; message: string }[]>([]);
  const offers = useMemo(() => view?.seats ?? [], [view]);
  if (!offers.length && !done.length) return null;
  const confirm = async (o: SeatOfferView) => {
    setBusy(o.key);
    // The existing Add, with the member as the seat holder: its rules, credits and limits. The seat it claims goes with it.
    const r = await act({ type: "add", company: o.company, newEngagement: true, ...(o.claim ? { engagementId: o.claim } : {}), engagementFields: offerFields(o, holder), operatorMemberId: "me" }, { quiet: true });
    if (r.ok) {
      await exportAct({ op: "seat", key: o.key, do: "added" });
      setDone((d) => [...d, { key: o.key, line: `${o.title} at ${o.company}`, message: r.message }]);
    }
    setBusy(null);
  };
  const no = async (o: SeatOfferView) => {
    setBusy(o.key);
    await exportAct({ op: "seat", key: o.key, do: "no" });
    setBusy(null);
  };
  return (
    <section className="lx-seats" aria-labelledby="lx-seats-h">
      <h2 className="lx-seats-h" id="lx-seats-h">
        These look like your seats
      </h2>
      <p className="lx-sub">From the roles in your LinkedIn export. Fractional, interim and advisor roles first. Confirm the ones that were seats: nothing is added until you do, and each fact it adds earns as any seat does.</p>
      {done.map((d) => (
        <article key={d.key} className="lx-seat done">
          <span className="lx-seat-t">
            <strong>{d.line}</strong>
            <span role="status">{d.message}</span>
          </span>
          <span className="lx-tag">
            <IconCheck size={12} /> Added to Your seats
          </span>
        </article>
      ))}
      {offers.map((o) => {
        const when = o.from ? `${monthWords(o.from)} to ${o.active ? "now" : (monthWords(o.to) ?? "an end")}` : o.active ? "Current" : "";
        return (
          <article key={o.key} className="lx-seat" aria-label={`${o.title} at ${o.company}`}>
            <span className="lx-seat-t">
              <strong>
                {o.title} at {o.company}
              </strong>
              <span>{[when, o.claim ? "A seat on file there may be yours: confirming claims it" : o.waits ? "Earns when the company's first seat is confirmed" : null].filter(Boolean).join(" · ")}</span>
            </span>
            {o.kind ? <span className="lx-kind">{KIND_WORDS[o.kind]}</span> : <span className="lx-kind plain">Looks full-time</span>}
            <span className="lx-seat-acts">
              <button type="button" className="btn btn-volt btn-sm" disabled={!!busy} aria-busy={busy === o.key} onClick={() => void confirm(o)}>
                <IconCheck size={13} /> {busy === o.key ? "Adding" : "Confirm this seat"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void no(o)}>
                Not a seat
              </button>
            </span>
          </article>
        );
      })}
    </section>
  );
}

/* ---------- Evidence Bank: recommendations as proof ---------- */

export function ExportProof() {
  const { view } = useExport();
  const toast = useToast();
  if (!view?.proof.length) return null;
  return (
    <section className="lx-box lx-proof" aria-label="Recommendations you received">
      <strong>Recommendations you received</strong>
      <span className="lx-sub">From your LinkedIn export, kept as proof because you ticked it. Shown by first name and company only. Only you see them here.</span>
      <ul>
        {view.proof.map((r) => (
          <li key={r.id}>
            <blockquote>{r.text}</blockquote>
            <span className="lx-proof-by">
              {r.first}
              {r.company ? `, ${r.company}` : ""}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                const x = await exportAct({ op: "proof", id: r.id });
                toast(x.error ?? x.message ?? "Removed.", !!x.error);
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
