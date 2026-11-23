"use client";

/**
 * The parts of a proposal's editor (Proposals.tsx) that sit beside the document: what to charge,
 * who signs, what was kept from the call (and reading more of it, in this browser), sending for
 * signature and its status with the audit trail, and the small inputs they use.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DiscoveryNote, ProposalRec, SignerInfo } from "@/lib/proposals/types";
import { LINK_DAYS, LINK_DAYS_SAY, SENDER_DUTY, type LinkDays, type MemberSignMode } from "@/lib/proposals/types";
import { ALERT_ROWS, type Channel, type CloseAlertKind, type CloseInboxView } from "@/lib/close/types";
import { LinkDaysPick } from "./LinkDays";
import { SendReminders, saveReminders, useSendReminders } from "./SendReminders";
import { Countersign, YourSignatureChoice, useMySignature } from "./MySignature";
import { DISCOVERY_LABELS, DISCOVERY_TARGET, blanksInWords } from "@/lib/proposals/library";
import { extract, transcriptOk, type Extraction, type Suggestion } from "@/lib/proposals/extract";
import type { adviceFromView } from "@/lib/proposals/rates";
import { PRICES } from "@/lib/billing/rules";
import { IconCheck, IconPlus, IconX, useToast, errorText } from "../ui/shared";
import { Chip, STATUS_TONE, StatusChip, type Status } from "../ui/system";
import { Sheet } from "./ui";
import { openPlans } from "./Billing";
import { EVENT_SAY, dayOf, stamp } from "../sign/doc";

/** The status words proposals and documents share. */
export const STATUS: Record<ProposalRec["status"], string> = { draft: "Draft", sent: "Sent", viewed: "Viewed", client_signed: "Client signed · your turn to countersign", signed: "Signed", declined: "Declined", void: "Voided", expired: "Expired" };
/** A proposal's or a document's status on the system's scale (Signed pine, Viewed mint, the rest outline). */
export function ProposalStatus({ status }: { status: ProposalRec["status"] }) {
  const w = STATUS[status];
  return w in STATUS_TONE ? <StatusChip status={w as Status} /> : <Chip>{w}</Chip>;
}

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const PRO_SEND = `Sending for signature is on Close: $${PRICES.closeMonth} a month, or $${PRICES.closeYear} a year.`;

/** POST /api/proposals. A refusal carries `error` in words and `httpStatus` (0: the network, so it can be tried again). */
export async function api<T>(body: Record<string, unknown>): Promise<T & { error?: string; upgrade?: string; httpStatus?: number }> {
  try {
    const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: errorText(r.status, j.error, "That didn't go through. Try again."), httpStatus: r.status };
  } catch {
    return { error: NETWORK, httpStatus: 0 } as T & { error: string; httpStatus: number };
  }
}

export function AutoText({ value, onChange, readOnly, className, label, small }: { value: string; onChange: (v: string) => void; readOnly: boolean; className: string; label: string; small?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(small ? 40 : 96, el.scrollHeight + 2)}px`;
  }, [value, small]);
  return <textarea ref={ref} className={`input ${className}`} aria-label={label} value={value} readOnly={readOnly} rows={small ? 2 : 4} onChange={(e) => onChange(e.target.value)} />;
}

export function AddBlock({ addable, onAdd }: { addable: { id: string; title: string; purpose: string }[]; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pp-add">
      <button type="button" className="btn pp-wide" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        <IconPlus /> Add a block
      </button>
      {open && (
        <ul className="pp-add-list">
          {[...addable, { id: "custom", title: "Your own section", purpose: "Anything the library doesn't have." }].map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => (onAdd(b.id), setOpen(false))}>
                <b>{b.title}</b>
                <span>{b.purpose}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- rates ---------- */

export function RatePanel({ advice, fn }: { advice: ReturnType<typeof adviceFromView>; fn: string | null }) {
  const s = advice.suggestion;
  return (
    <div className="pp-rates" aria-label="Pricing">
      <h4>What to charge</h4>
      {s ? (
        <>
          <p className="pp-rate-big">
            Fractional {s.fn} leaders {s.scope === "sized" && s.band ? `at ${s.band} companies` : "at companies of every size"} were paid <b>{s.says}</b>.
          </p>
          {s.sits && <p className="pp-rate-sits">{s.sits}</p>}
          {s.own && (
            <p className="pp-muted">
              Your own rate on file: ${s.own.amount.toLocaleString("en-US")} {s.own.kind === "hourly" ? "an hour" : "a month"}. Only you see it.
            </p>
          )}
          {advice.hoursAtYourRate !== null && <p className="pp-muted">At your hourly rate, this fee covers about {advice.hoursAtYourRate} hours a month.</p>}
          {s.limited && <p className="pp-muted">Free shows the median for every size. Pro adds the range by client size.</p>}
        </>
      ) : (
        <p className="pp-muted">{fn ? "No figure for your function yet." : "Set your function in your profile to see what fractionals in it were paid."}</p>
      )}
      <h4>How to price it</h4>
      <ul className="pp-good">
        {advice.shape.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {advice.template && <p className="pp-muted">What this template&#39;s wins charged: {advice.template}</p>}
    </div>
  );
}

/* ---------- who signs ---------- */

export function SignerCard({ p, readOnly, onSigner, onOnCall }: { p: ProposalRec; readOnly: boolean; onSigner: (s: SignerInfo | null) => void; onOnCall: (v: boolean | null) => void }) {
  // Who the draft found signs (its cover's name and title, an email the call gave) fills in until they're set: anything unknown stays blank.
  const [s, setS] = useState({ name: p.signer?.name ?? p.fields["client.signerName"] ?? "", email: p.signer?.email ?? p.fields["client.signerEmail"] ?? "", title: p.signer?.title ?? p.fields["client.signerTitle"] ?? "" });
  const commit = (next = s) => {
    const ok = next.name.trim() && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(next.email.trim());
    if (ok) onSigner({ name: next.name.trim(), email: next.email.trim(), ...(next.title.trim() ? { title: next.title.trim() } : {}) });
    else if (!next.name.trim() && !next.email.trim() && p.signer) onSigner(null);
  };
  return (
    <section className="pp-card pp-signer" aria-labelledby="pp-sg-h">
      <h2 className="pp-h2" id="pp-sg-h">
        Who signs
      </h2>
      <p className="pp-help">Send it to the person who owns the budget. Proposals that went through a go-between lost more often.</p>
      {(["name", "title", "email"] as const).map((k) => (
        <label key={k} className="pp-field">
          <span className="pp-field-l">{k === "name" ? "Name" : k === "title" ? "Title" : "Email"}</span>
          <input className="input" type={k === "email" ? "email" : "text"} value={s[k]} placeholder={k === "email" && s.name && !s.email ? "Not in the call yet: type it" : undefined} readOnly={readOnly} autoComplete="off" onChange={(e) => setS({ ...s, [k]: e.target.value })} onBlur={() => commit()} />
        </label>
      ))}
      <div className="pp-oncall">
        <span>Were they on the call?</span>
        {([true, false] as const).map((v) => (
          <button key={String(v)} type="button" className={`chip${p.signerOnCall === v ? " chip-on" : ""}`} aria-pressed={p.signerOnCall === v} disabled={readOnly} onClick={() => onOnCall(p.signerOnCall === v ? null : v)}>
            {v ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- from the call ---------- */

export function CallPanel({ memberName, readOnly, notes, onAccept, onNotes, onOnCall }: { memberName: string; readOnly: boolean; notes: DiscoveryNote[]; onAccept: (s: Suggestion) => void; onNotes: (n: DiscoveryNote[]) => void; onOnCall: (v: boolean) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [ex, setEx] = useState<Extraction | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [drop, setDrop] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const read = (raw: string) => {
    const r = extract(raw, memberName);
    setEx(r);
    setDone(new Set());
    // The transcript itself isn't kept, here or anywhere: only the suggestions while they're on screen.
    setText("");
    if (r.signerOnCall !== null) onOnCall(r.signerOnCall);
    if (!r.suggestions.length) toast("Nothing to suggest from that. Try the full transcript, with who said what.", true);
  };
  const file = (f: File | undefined) => {
    if (!f) return;
    if (!transcriptOk(f.name)) return toast("That file type doesn't read here. Use .txt, .vtt, .srt or .md.", true);
    if (f.size > 2_000_000) return toast("That file is over 2 MB. Paste the part that matters.", true);
    void f.text().then(read);
  };
  const groups = useMemo(() => {
    const m = new Map<string, Suggestion[]>();
    for (const s of ex?.suggestions ?? []) m.set(s.key, [...(m.get(s.key) ?? []), s]);
    return [...m.entries()];
  }, [ex]);
  const id = (s: Suggestion) => `${s.key}|${s.text}`;
  return (
    <section className="pp-card pp-call" aria-labelledby="pp-cl-h">
      <h2 className="pp-h2" id="pp-cl-h">
        From your call
      </h2>
      {!readOnly && !ex && (
        <>
          <div
            className="pp-drop"
            data-on={drop}
            onDragOver={(e) => (e.preventDefault(), setDrop(true))}
            onDragLeave={() => setDrop(false)}
            onDrop={(e) => (e.preventDefault(), setDrop(false), file(e.dataTransfer.files?.[0]))}
          >
            <textarea className="input pp-paste" aria-label="Paste a transcript or notes" placeholder="Paste the transcript or your notes, or drop a .txt, .vtt, .srt or .md file here" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
            <div className="pp-btns">
              <button type="button" className="btn btn-sm" disabled={!text.trim()} onClick={() => read(text)}>
                Find what matters
              </button>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                Choose a file
              </button>
              <input ref={fileRef} type="file" accept=".txt,.vtt,.srt,.md,text/plain,text/vtt,text/markdown" hidden onChange={(e) => (file(e.target.files?.[0]), (e.target.value = ""))} />
            </div>
          </div>
          <p className="pp-help">Read in this browser: the transcript isn&#39;t uploaded or kept. Only the lines you use are saved with this proposal.</p>
        </>
      )}
      {ex && (
        <div className="pp-sugs">
          <p className="pp-help">
            {ex.suggestions.length} suggestions from {ex.speakers.length ? ex.speakers.join(", ") : "the call"}. The transcript isn&#39;t kept. Use what&#39;s right, in your words: a proposal gets forwarded.
          </p>
          {ex.signerOnCall === false && <p className="pp-warn">The person who signs wasn&#39;t on the call{ex.signerWhy ? `: "${ex.signerWhy}"` : "."}</p>}
          {!ex.suggestions.some((s) => s.key === "budget.signals") && <p className="pp-warn">No budget signal on the call. Ask for a range before you send.</p>}
          {groups.map(([key, list]) => (
            <div key={key} className="pp-sg">
              <h4>
                {DISCOVERY_LABELS[key] ?? key}
                {DISCOVERY_TARGET[key] === null && <span className="pp-muted"> · a note for you</span>}
              </h4>
              <ul>
                {list.map((s) => (
                  <li key={id(s)} data-done={done.has(id(s))}>
                    <p>{s.text}</p>
                    <span className="pp-sg-meta">
                      {s.speaker ?? "Unnamed"} · {s.why}
                    </span>
                    {done.has(id(s)) ? (
                      <span className="pp-sg-used">
                        <IconCheck size={12} /> Used
                      </span>
                    ) : (
                      <span className="pp-btns">
                        <button type="button" className="btn btn-sm" onClick={() => (onAccept(s), setDone(new Set(done).add(id(s))))}>
                          {DISCOVERY_TARGET[key] ? "Use" : "Keep"}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDone(new Set(done).add(id(s)))}>
                          Skip
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="tp-flink" onClick={() => setEx(null)}>
            Done with these
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <div className="pp-notes">
          <h4>Kept from your calls · only you see these</h4>
          <ul>
            {notes.map((n, i) => (
              <li key={`${n.at}${i}`}>
                <span className="pp-note-k">{DISCOVERY_LABELS[n.key] ?? n.key}</span> {n.text}
                {!readOnly && (
                  <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label="Remove this note" onClick={() => onNotes(notes.filter((_, j) => j !== i))}>
                    <IconX size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------- sending ---------- */

/**
 * What sending needs, the same in the sheet (the old look) and the editor's Send tab (the new look):
 * who signs, the note, how the member signs, how long the link works and the reminders. The
 * reminders are saved first, then it is sent.
 */
export function useSend(p: ProposalRec, o: { canSend: boolean; email: boolean; blanks: string[]; onSent: (p: ProposalRec, message: string) => void; before?: () => Promise<boolean> }) {
  const { canSend, email, blanks, onSent, before } = o;
  const [s, setS] = useState({ name: p.signer?.name ?? p.fields["client.signerName"] ?? "", email: p.signer?.email ?? p.fields["client.signerEmail"] ?? "", title: p.signer?.title ?? p.fields["client.signerTitle"] ?? "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Their own signature on it (MySignature.tsx): now, after the client's, or none.
  const [mode, setMode] = useState<MemberSignMode>(p.memberSign ?? "now");
  const [mySig, setMySig] = useMySignature();
  // No saved signature yet: start on "I'll countersign after they sign", as the server would (a picked mode stays).
  const picked = useRef(!!p.memberSignPicked);
  useEffect(() => {
    if (mySig.loaded && !mySig.sig && !picked.current && mode === "now") setMode("after");
  }, [mySig.loaded, mySig.sig, mode]);
  const [days, setDays] = useState<LinkDays>(p.linkDays ?? 30);
  // The reminders to the signer (SendReminders.tsx, lib/close): each on unless turned off here, saved just before it goes.
  const [rem, setRem] = useSendReminders(p.id, canSend);
  const emailOk = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.email.trim());
  const ok = !!s.name.trim() && emailOk && blanks.length === 0 && canSend && email && (mode !== "now" || !!mySig.sig);
  /** Why it can't go yet, in a line (the Send tab says it under the button). */
  const why = !canSend ? PRO_SEND : !email ? "Email isn't set up on Merlin yet, so a proposal can't go out for signature." : !s.name.trim() || !emailOk ? "Add the name and email of the person who signs." : blanks.length ? `${blanks.length === 1 ? "1 blank" : `${blanks.length} blanks`} to fill first: ${blanksInWords(blanks)}.` : mode === "now" && !mySig.sig ? "Save your signature, or pick another way to sign." : "";
  const go = async () => {
    setBusy(true);
    setErr(null);
    // The editor's edits still on their way are saved first, so what goes out is what is on screen (and no stale save follows the send).
    if (before && !(await before())) return setBusy(false), setErr("Your last edit isn't saved yet. Check your connection, then send again.");
    const off = await saveReminders(p.id, rem);
    if (off) return setBusy(false), setErr(off);
    const r = await api<{ proposal: ProposalRec; message: string }>({ op: "send", id: p.id, signer: { name: s.name.trim(), email: s.email.trim(), title: s.title.trim() }, message: note, memberSign: mode, linkDays: days });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onSent(r.proposal, r.message);
  };
  return { s, setS, note, setNote, busy, err, mode, setMode, picked, mySig, setMySig, days, setDays, rem, setRem, ok, why, go };
}

export function SendSheet({
  p,
  canSend,
  email,
  blanks,
  missing,
  flags,
  onClose,
  onSent,
}: {
  p: ProposalRec;
  canSend: boolean;
  email: boolean;
  blanks: string[];
  missing: string[];
  flags: string[];
  onClose: () => void;
  onSent: (p: ProposalRec, message: string) => void;
}) {
  const { s, setS, note, setNote, busy, err, mode, setMode, picked, mySig, setMySig, days, setDays, rem, setRem, ok, go } = useSend(p, { canSend, email, blanks, onSent });
  return (
    <Sheet
      title="Send for signature"
      onClose={onClose}
      dialog
      className="pp-send"
      footer={
        canSend ? (
          <>
            {/* Why it can't go yet, beside the button, when the reason is your own signature further down. */}
            {mode === "now" && mySig.loaded && !mySig.sig && <p className="pp-muted pp-send-why">Set your signature below first, or pick I&#39;ll countersign after they sign.</p>}
            <button type="button" className="btn btn-pine btn-lg pp-wide" aria-busy={busy} disabled={!ok || busy} onClick={go}>
              {busy ? "Sending" : `Send to ${s.name.trim().split(" ")[0] || "the signer"}`}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-pine btn-lg pp-wide" onClick={() => openPlans("proposals")}>
            See the Close plan: ${PRICES.closeMonth} a month
          </button>
        )
      }
    >
      <div className="pp-send-body">
        {!canSend && <p className="pp-warn">{PRO_SEND}</p>}
        {!email && canSend && <p className="pp-warn">Email isn&#39;t set up on Merlin yet, so a proposal can&#39;t go out for signature.</p>}
        <p className="pp-help">They get an email from you with a link (no account needed). They confirm their email with a code, agree to sign electronically and type their name. You both get the signed copy with its audit trail.</p>
        <p className="pp-help">{SENDER_DUTY}</p>
        {(["name", "title", "email"] as const).map((k) => (
          <label key={k} className="pp-field">
            <span className="pp-field-l">{k === "name" ? "The person who signs" : k === "title" ? "Their title" : "Their email"}</span>
            <input className="input" type={k === "email" ? "email" : "text"} value={s[k]} autoComplete="off" onChange={(e) => setS({ ...s, [k]: e.target.value })} />
          </label>
        ))}
        <label className="pp-field">
          <span className="pp-field-l">A note above the link (optional)</span>
          <textarea className="input pp-note" rows={2} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Great talking today. Here's the plan we discussed." />
        </label>
        {canSend && <LinkDaysPick value={days} onChange={setDays} />}
        {canSend && <SendReminders value={rem} onChange={setRem} noEnd={days === 0} disabled={busy} />}
        {canSend && mySig.loaded && <YourSignatureChoice mode={mode} onMode={(m) => ((picked.current = true), setMode(m))} sig={mySig.sig} onSig={setMySig} name={mySig.name} title={mySig.title} />}
        {blanks.length > 0 && (
          <p className="pp-warn">
            {blanks.length === 1 ? "1 blank" : `${blanks.length} blanks`} to fill first: {blanksInWords(blanks)}. Tap a section to fill it.
          </p>
        )}
        {missing.length > 0 && <p className="pp-help">Still missing from the checklist: {missing.join("; ")}.</p>}
        {flags.length > 0 && (
          <ul className="pp-flaglist">
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {p.status !== "draft" && <p className="pp-help">This goes out as version {p.version + 1}. Earlier links stop working.</p>}
        {err && <p className="pp-err">{err}</p>}
      </div>
    </Sheet>
  );
}

/**
 * Send, as the editor's right panel tab in the new look (ProposalEditor.dc.html): who signs (saved
 * to the proposal as it is typed), whether they were on the call, a note, the member's own
 * signature (add it now, countersign after, or none), how long the link works, the reminders until
 * they sign and where the alerts go. The button says why it can't go yet, under it.
 */
export function SendPanel({
  p,
  canSend,
  email,
  blanks,
  missing,
  flags,
  onSent,
  onSigner,
  onOnCall,
  alerts,
  before,
}: {
  p: ProposalRec;
  canSend: boolean;
  email: boolean;
  blanks: string[];
  missing: string[];
  flags: string[];
  onSent: (p: ProposalRec, message: string) => void;
  onSigner: (s: SignerInfo | null) => void;
  onOnCall: (v: boolean | null) => void;
  /** Where each alert goes (the grid), placed by the editor. */
  alerts?: ReactNode;
  /** Save the editor's pending edits before it goes; false: they didn't save (offline, or changed elsewhere). */
  before?: () => Promise<boolean>;
}) {
  const f = useSend(p, { canSend, email, blanks, onSent, before });
  const first = f.s.name.trim().split(/\s+/)[0] || "";
  const commit = () => {
    const ok = f.s.name.trim() && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(f.s.email.trim());
    if (ok) onSigner({ name: f.s.name.trim(), email: f.s.email.trim(), ...(f.s.title.trim() ? { title: f.s.title.trim() } : {}) });
  };
  const until = f.days ? new Date(Date.now() + f.days * 86_400_000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  return (
    <div className="pz-send">
      <div className="pz-send-body">
        {!canSend && <p className="pp-warn">{PRO_SEND}</p>}
        {!email && canSend && <p className="pp-warn">Email isn&#39;t set up on Merlin yet, so a proposal can&#39;t go out for signature.</p>}
        {p.status !== "draft" && <p className="pz-note">This goes out as version {p.version + 1}. Earlier links stop working.</p>}
        <strong className="pz-h">Who signs</strong>
        <span className="pz-note">Send it to the person who owns the budget. Proposals that went through a go-between lost more often.</span>
        <div className="pz-signer-f">
          {(["name", "title", "email"] as const).map((k) => (
            <label key={k} className="pz-f" data-wide={k === "email" || undefined}>
              <span>{k === "name" ? "Name" : k === "title" ? "Title" : "Email"}</span>
              <input className="input" type={k === "email" ? "email" : "text"} value={f.s[k]} autoComplete="off" placeholder={k === "email" && f.s.name && !f.s.email ? "Not in the call yet: type it" : undefined} onChange={(e) => f.setS({ ...f.s, [k]: e.target.value })} onBlur={commit} />
            </label>
          ))}
        </div>
        <span className="pz-oncall">
          Was {first || "the signer"} on the call?
          {([true, false] as const).map((v) => (
            <button key={String(v)} type="button" className="pz-chip" aria-pressed={p.signerOnCall === v} onClick={() => onOnCall(p.signerOnCall === v ? null : v)}>
              {v ? "Yes" : "No"}
            </button>
          ))}
        </span>
        <label className="pz-f">
          <span>A note above the link (optional)</span>
          <textarea className="input" rows={2} maxLength={600} value={f.note} onChange={(e) => f.setNote(e.target.value)} placeholder="Great talking today. Here is the plan we discussed." />
        </label>
        {canSend && f.mySig.loaded && <YourSignatureChoice mode={f.mode} onMode={(m) => ((f.picked.current = true), f.setMode(m))} sig={f.mySig.sig} onSig={f.setMySig} name={f.mySig.name} title={f.mySig.title} />}
        {canSend && (
          <>
            <strong className="pz-h">The link works for</strong>
            <span className="pz-chips" role="radiogroup" aria-label="How long the link works">
              {LINK_DAYS.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={f.days === d} className="pz-chip" onClick={() => f.setDays(d)}>
                  {LINK_DAYS_SAY[d]}
                </button>
              ))}
            </span>
            <span className="pz-note">{f.days ? `${first || "They"} can open and sign until ${until}.` : "No end date. The link works until it is signed, declined or voided."}</span>
            <SendReminders value={f.rem} onChange={f.setRem} noEnd={f.days === 0} disabled={f.busy} />
          </>
        )}
        {alerts}
        {missing.length > 0 && <p className="pz-note">Still missing from the checklist: {missing.join("; ")}.</p>}
        {flags.length > 0 && (
          <ul className="pp-flaglist">
            {flags.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="pz-send-foot">
        <span className="pz-note">{first || "They"} gets an email from you with a link. No account needed. They confirm their email with a code, agree to sign electronically and type their name. You both get the signed copy.</span>
        {canSend ? (
          <button type="button" className="btn btn-pine btn-lg" aria-busy={f.busy} aria-disabled={!f.ok || undefined} disabled={f.busy} onClick={() => (f.ok ? void f.go() : undefined)}>
            {f.busy ? "Sending" : `Send to ${first || "the signer"}`}
          </button>
        ) : (
          <button type="button" className="btn btn-pine btn-lg" onClick={() => openPlans("proposals")}>
            See the Close plan: ${PRICES.closeMonth} a month
          </button>
        )}
        <span className="pz-note" role="status">
          {f.err ? <span className="pp-err">{f.err}</span> : f.why || SENDER_DUTY}
        </span>
      </div>
    </div>
  );
}

/** "Tell me when": each proposal alert by email and in Slack (lib/close prefs, the same switches as Alerts). */
export function AlertGrid({ alertsHref, onAlerts }: { alertsHref?: string; onAlerts?: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<CloseInboxView | null>(null);
  useEffect(() => {
    void fetch("/api/activity", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: CloseInboxView | null) => j && setV(j))
      .catch(() => {});
  }, []);
  if (!v || !v.open) return null;
  const set = async (kind: CloseAlertKind, channel: Channel, on: boolean) => {
    setV({ ...v, prefs: { ...v.prefs, [kind]: { ...v.prefs[kind], [channel]: on } } });
    try {
      const r = await fetch("/api/activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "pref", kind, channel, on }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast(errorText(r.status, j.error, "That didn't save. Try again."), true);
      setV((x) => (x ? { ...x, prefs: j } : x));
    } catch {
      toast(NETWORK, true);
    }
  };
  const rows = ALERT_ROWS.filter((r) => r.kind !== "renewal");
  return (
    <div className="pz-alerts">
      <strong className="pz-h">Tell me when</strong>
      <div className="pz-agrid" role="table" aria-label="Alerts for your proposals">
        <span role="row" className="pz-arow pz-arow-h">
          <span role="columnheader" />
          <span role="columnheader">Email</span>
          <span role="columnheader">Slack</span>
        </span>
        {rows.map((r) => {
          const fixed = r.kind === "signed";
          return (
            <span key={r.kind} role="row" className="pz-arow">
              <span role="rowheader">{r.label}</span>
              {(["email", "slack"] as const).map((ch) => {
                const off = ch === "slack" ? !v.slack : !v.email;
                const on = ch === "email" && fixed ? true : v.prefs[r.kind][ch] && !off;
                return (
                  <span key={ch} role="cell">
                    <input type="checkbox" aria-label={`${r.label}, ${ch === "email" ? "by email" : "in Slack"}`} checked={on} disabled={off || (ch === "email" && fixed)} title={ch === "email" && fixed ? "The signed copy and a decline always come by email." : off && ch === "slack" ? "Connect Slack first." : undefined} onChange={(e) => void set(r.kind, ch, e.target.checked)} />
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>
      <span className="pz-note">
        {v.slack ? "For every proposal you send. Every alert also shows on the bell." : "Slack is not connected, so alerts come by email and the bell. Merlin posts to one channel you pick, and never reads your messages."}{" "}
        {alertsHref && (
          <a href={alertsHref} onClick={(e) => onAlerts && (e.preventDefault(), onAlerts())}>
            All alerts
          </a>
        )}
      </span>
    </div>
  );
}

export function SendStatus({ p, onChange }: { p: ProposalRec; onChange?: (r: ProposalRec) => void }) {
  const x = p.send!;
  const line =
    x.status === "client_signed"
      ? `Signed by ${x.signedName} · waiting for your signature.`
      : x.status === "signed"
      ? `Signed by ${x.signedName} on ${dayOf(x.signedAt)}${x.memberSignedAt ? `, and by you on ${dayOf(x.memberSignedAt)}` : ""}.`
      : x.status === "declined"
        ? `${x.signer.name} declined on ${dayOf(x.declinedAt)}${x.declineReason ? `: "${x.declineReason}"` : "."}`
        : x.status === "void"
          ? `Withdrawn on ${dayOf(x.voidedAt)}. Send it again to make a new version.`
          : x.status === "expired"
            ? `The link expired on ${dayOf(x.expiresAt)}. Send it again for a new one.`
            : x.status === "viewed"
              ? `${x.signer.name} opened it on ${dayOf(x.viewedAt)}. Waiting for their signature.`
              : `Sent to ${x.signer.name} (${x.signer.email}) on ${dayOf(x.sentAt)}. ${x.expiresAt ? `The link works until ${dayOf(x.expiresAt)}.` : "The link has no end date."}`;
  return (
    <section className="pp-card pp-status" data-status={x.status} aria-label="Signature status">
      <div className="pp-status-row">
        <p className="pp-status-l">{line}</p>
        {x.copyUrl && (
          <a className="btn btn-sm" href={x.copyUrl} target="_blank" rel="noreferrer">
            Open the signed copy
          </a>
        )}
      </div>
      {x.passedFrom && (
        <p className="pp-status-l">
          {x.passedFrom.name} passed it to {x.signer.name}
          {x.signer.title ? `, ${x.signer.title}` : ""}, on {dayOf(x.passedFrom.at)}. {x.signer.name.split(" ")[0]} signs it now.
        </p>
      )}
      {x.waiting === "member" && onChange && <Countersign p={p} onDone={onChange} />}
      {x.memberMode === "now" && x.memberSignedAt && x.status !== "signed" && x.status !== "client_signed" && <p className="pp-muted">You signed it as you sent it, on {dayOf(x.memberSignedAt)}.</p>}
      {x.choice && (
        <p className="pp-status-l">
          {x.signer.name.split(" ")[0]} chose {x.choice.summary}. Total: {x.choice.total}.
        </p>
      )}
      {x.sealed && (
        <div className="pp-status-row">
          <p className="pp-muted">Sealed by Merlin. Any change to the PDF breaks the seal.</p>
          <span className="pp-seal-acts">
            <a className="btn btn-sm" href={x.sealed.pdf}>
              Download the signed PDF
            </a>
            <a className="btn btn-sm" href="/check" target="_blank" rel="noreferrer">
              Check a copy
            </a>
          </span>
        </div>
      )}
      <details className="pp-trail">
        <summary>Audit trail</summary>
        <ol>
          {x.events.map((e, i) => (
            <li key={i}>
              <span className="pp-muted">{stamp(e.at)}</span> {EVENT_SAY[e.kind] ?? e.kind}
              {e.note ? `: ${e.note}` : ""}
              {e.ip ? <span className="pp-muted"> · {e.ip}</span> : null}
            </li>
          ))}
        </ol>
        <p className="pp-muted">
          Document fingerprint (SHA-256): <span className="sg-hash">{x.hash}</span>
        </p>
      </details>
    </section>
  );
}
