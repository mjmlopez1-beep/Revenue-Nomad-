"use client";

/**
 * The parts of a proposal's editor (Proposals.tsx) that sit beside the document: what to charge,
 * who signs, what was kept from the call (and reading more of it, in this browser), sending for
 * signature and its status with the audit trail, and the small inputs they use.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiscoveryNote, ProposalRec, SignerInfo } from "@/lib/proposals/types";
import { SENDER_DUTY } from "@/lib/proposals/types";
import { DISCOVERY_LABELS, DISCOVERY_TARGET, blanksInWords } from "@/lib/proposals/library";
import { extract, transcriptOk, type Extraction, type Suggestion } from "@/lib/proposals/extract";
import type { adviceFromView } from "@/lib/proposals/rates";
import { PRICES } from "@/lib/billing/rules";
import { IconCheck, IconPlus, IconX, useToast } from "../ui/shared";
import { Chip, STATUS_TONE, StatusChip, type Status } from "../ui/system";
import { Sheet } from "./ui";
import { openPlans } from "./Billing";
import { EVENT_SAY, dayOf, stamp } from "../sign/doc";

/** The status words proposals and documents share. */
export const STATUS: Record<ProposalRec["status"], string> = { draft: "Draft", sent: "Sent", viewed: "Viewed", signed: "Signed", declined: "Declined", void: "Voided", expired: "Expired" };
/** A proposal's or a document's status on the system's scale (Signed pine, Viewed mint, the rest outline). */
export function ProposalStatus({ status }: { status: ProposalRec["status"] }) {
  const w = STATUS[status];
  return w in STATUS_TONE ? <StatusChip status={w as Status} /> : <Chip>{w}</Chip>;
}

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const PRO_SEND = `Sending for signature is on Close: $${PRICES.closeMonth} a month, or $${PRICES.closeYear} a year.`;

export async function api<T>(body: Record<string, unknown>): Promise<T & { error?: string; upgrade?: string }> {
  try {
    const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: NETWORK } as T & { error: string };
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
  const [s, setS] = useState({ name: p.signer?.name ?? "", email: p.signer?.email ?? "", title: p.signer?.title ?? "" });
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
          <input className="input" type={k === "email" ? "email" : "text"} value={s[k]} readOnly={readOnly} autoComplete="off" onChange={(e) => setS({ ...s, [k]: e.target.value })} onBlur={() => commit()} />
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
  const [s, setS] = useState({ name: p.signer?.name ?? "", email: p.signer?.email ?? "", title: p.signer?.title ?? "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = s.name.trim() && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.email.trim()) && blanks.length === 0 && canSend && email;
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await api<{ proposal: ProposalRec; message: string }>({ op: "send", id: p.id, signer: { name: s.name.trim(), email: s.email.trim(), title: s.title.trim() }, message: note });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onSent(r.proposal, r.message);
  };
  return (
    <Sheet
      title="Send for signature"
      onClose={onClose}
      dialog
      className="pp-send"
      footer={
        canSend ? (
          <button type="button" className="btn btn-pine btn-lg pp-wide" aria-busy={busy} disabled={!ok || busy} onClick={go}>
            {busy ? "Sending" : `Send to ${s.name.trim().split(" ")[0] || "the signer"}`}
          </button>
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

export function SendStatus({ p }: { p: ProposalRec }) {
  const x = p.send!;
  const line =
    x.status === "signed"
      ? `Signed by ${x.signedName} on ${dayOf(x.signedAt)}.`
      : x.status === "declined"
        ? `${x.signer.name} declined on ${dayOf(x.declinedAt)}${x.declineReason ? `: "${x.declineReason}"` : "."}`
        : x.status === "void"
          ? `Withdrawn on ${dayOf(x.voidedAt)}. Send it again to make a new version.`
          : x.status === "expired"
            ? `The link expired on ${dayOf(x.expiresAt)}. Send it again for a new one.`
            : x.status === "viewed"
              ? `${x.signer.name} opened it on ${dayOf(x.viewedAt)}. Waiting for their signature.`
              : `Sent to ${x.signer.name} (${x.signer.email}) on ${dayOf(x.sentAt)}. The link works until ${dayOf(x.expiresAt)}.`;
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
