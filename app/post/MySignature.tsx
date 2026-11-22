"use client";

/**
 * The member's own signature (Close; lib/proposals/memberSig.ts), in four places:
 *  - MySignature: set it once (type it or draw it, the pad a document's signer uses), replace it,
 *    delete it. Settings and the send step show it.
 *  - YourSignatureChoice: in the send step, how they sign this proposal: Sign it now (their saved
 *    signature applied as it goes out), Countersign after they sign, or No signature from me.
 *  - Countersign: on the proposal once the client signed in countersign mode, one tap with a saved
 *    signature, else drawn or typed there.
 *  - CountersignDue: on Home, anything the client signed over a day ago that still waits for them.
 */
import { useEffect, useState } from "react";
import { MEMBER_CONSENT, MEMBER_SIGN_SAY, type MemberSignMode, type ProposalRec, type SignatureView } from "@/lib/proposals/types";
import { DrawPad } from "../sign/DocSign";
import { api } from "./ProposalParts";
import { dayOf } from "../sign/doc";
import "../ui/pdf.css";
import "./pricing.css";

/** The member's saved signature, with their name and title from their profile, read once. */
export function useMySignature() {
  const [st, setSt] = useState<{ sig: SignatureView | null; name: string; title: string; loaded: boolean }>({ sig: null, name: "", title: "", loaded: false });
  useEffect(() => {
    void api<{ signature: SignatureView | null; name: string; title: string }>({ op: "signature_get" }).then((r) => !r.error && setSt({ sig: r.signature, name: r.name, title: r.title, loaded: true }));
  }, []);
  return [st, (sig: SignatureView | null) => setSt((x) => ({ ...x, sig }))] as const;
}

const NAME_RE = /^\p{L}[\p{L}'’.-]*(?: +\p{L}[\p{L}'’.-]*)+$/u;
type Input = { method: "typed"; typed: string } | { method: "drawn"; png: string };

/** A signature as it reads: the drawing, or the words in the script face. */
export function SignatureShown({ sig, name }: { sig: { kind: "typed" | "drawn"; typed: string | null; img: string | null }; name?: string }) {
  return <span className="ms-shown">{sig.kind === "drawn" && sig.img ? <img src={sig.img} alt={`${name ?? "Your"} signature`} className="ms-img" /> : <span className="ms-script">{sig.typed ?? name}</span>}</span>;
}

/** Type it or draw it. Gives the signature once it's usable, else null. */
function Pad({ name, onInput }: { name: string; onInput: (i: Input | null) => void }) {
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = useState(name);
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => {
    onInput(method === "typed" ? (NAME_RE.test(typed.trim()) ? { method, typed: typed.trim() } : null) : png ? { method, png } : null);
  }, [method, typed, png]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ms-pad">
      <div className="ds-tabs" role="tablist" aria-label="How to sign">
        {(["typed", "drawn"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={method === m} className="ds-tab" data-on={method === m} onClick={() => setMethod(m)}>
            {m === "typed" ? "Type it" : "Draw it"}
          </button>
        ))}
      </div>
      {method === "typed" ? (
        <>
          <input className="input" aria-label="Your full name, as your signature" maxLength={100} value={typed} onChange={(e) => setTyped(e.target.value)} />
          <div className="sg-sig" data-empty={!typed.trim()}>
            <span className="sg-sig-name">{typed.trim() || "Your signature"}</span>
          </div>
        </>
      ) : (
        <DrawPad onChange={setPng} />
      )}
    </div>
  );
}

function Consent({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="ms-consent">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>{MEMBER_CONSENT}</span>
    </label>
  );
}

/** Set, replace or delete the saved signature. */
export function MySignature({ value, name, title, onChange }: { value: SignatureView | null; name: string; title: string; onChange: (v: SignatureView | null) => void }) {
  const [editing, setEditing] = useState(!value);
  const [input, setInput] = useState<Input | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!input) return;
    setBusy(true);
    setErr(null);
    const r = await api<{ signature: SignatureView }>({ op: "signature_set", ...input, consent: agree });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onChange(r.signature);
    setEditing(false);
    setAgree(false);
  };
  const del = async () => {
    if (!window.confirm("Delete your saved signature? Proposals already signed keep theirs.")) return;
    const r = await api<{ signature: null }>({ op: "signature_delete" });
    if (r.error) return setErr(r.error);
    onChange(null);
    setEditing(true);
  };
  return (
    <div className="ms" data-section="my-signature">
      {value && !editing ? (
        <div className="ms-have">
          <SignatureShown sig={value} name={name} />
          <span className="ms-who">
            {name}
            {title ? `, ${title}` : ""} · saved {dayOf(value.at)}
          </span>
          <span className="ms-acts">
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              Replace it
            </button>
            <button type="button" className="btn btn-sm" onClick={del}>
              Delete it
            </button>
          </span>
        </div>
      ) : (
        <div className="ms-set">
          <Pad name={name} onInput={setInput} />
          <Consent on={agree} set={setAgree} />
          {err && (
            <p className="pp-err" role="alert">
              {err}
            </p>
          )}
          <span className="ms-acts">
            <button type="button" className="btn" aria-busy={busy} disabled={!input || !agree || busy} onClick={save}>
              {busy ? "Saving" : value ? "Save the new signature" : "Save my signature"}
            </button>
            {value && (
              <button type="button" className="sg-link" onClick={() => setEditing(false)}>
                Keep the one I have
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/** In the send step: how the member signs this proposal. */
export function YourSignatureChoice({
  mode,
  onMode,
  sig,
  onSig,
  name,
  title,
}: {
  mode: MemberSignMode;
  onMode: (m: MemberSignMode) => void;
  sig: SignatureView | null;
  onSig: (v: SignatureView | null) => void;
  name: string;
  title: string;
}) {
  const say: Record<MemberSignMode, string> = {
    now: "Your saved signature, name, title and today's date go on it as it goes out. When they sign, it's done.",
    after: "They sign first. Then you countersign, in one tap, and only then is it sealed and sent to you both.",
    none: "It says prepared and sent by you, with no signature from you.",
  };
  return (
    <fieldset className="ms-choice" data-section="your-signature">
      <legend className="pp-field-l">Your signature</legend>
      {(["now", "after", "none"] as const).map((m) => (
        <label key={m} className="ms-opt" data-on={mode === m}>
          <input type="radio" name="ms-mode" checked={mode === m} onChange={() => onMode(m)} />
          <span>
            <strong>{MEMBER_SIGN_SAY[m]}</strong>
            <span className="ms-say">{say[m]}</span>
          </span>
        </label>
      ))}
      {mode === "now" && (sig ? <p className="pp-help">Signs as {name}{title ? `, ${title}` : ""}.</p> : <p className="pp-help">Set your signature once to sign as you send.</p>)}
      {mode === "now" && <MySignature value={sig} name={name} title={title} onChange={onSig} />}
    </fieldset>
  );
}

/** Countersign: the client signed, it waits for the member. One tap with a saved signature. */
export function Countersign({ p, onDone }: { p: ProposalRec; onDone: (r: ProposalRec) => void }) {
  const [{ sig, name, loaded }] = useMySignature();
  const [input, setInput] = useState<Input | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const x = p.send!;
  const first = (x.signedName ?? x.signer.name).split(" ")[0];
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await api<ProposalRec>(sig ? { op: "countersign", id: p.id, method: "saved" } : { op: "countersign", id: p.id, ...input, consent: agree, save: true });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onDone(r);
  };
  return (
    <div className="ms-counter" data-section="countersign">
      <p className="ms-counter-h">
        {first} signed. Countersign to finish.
      </p>
      <p className="pp-help">It&#39;s sealed and you both get the signed PDF as soon as you do. Merlin never countersigns for you.</p>
      {!loaded ? null : sig ? (
        <SignatureShown sig={sig} name={name} />
      ) : (
        <>
          <Pad name={name} onInput={setInput} />
          <Consent on={agree} set={setAgree} />
        </>
      )}
      {err && (
        <p className="pp-err" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-pine" aria-busy={busy} disabled={busy || !loaded || (!sig && (!input || !agree))} onClick={go}>
        {busy ? "Countersigning" : "Countersign"}
      </button>
    </div>
  );
}

/** Home: what the client signed over a day ago that still waits for the member's countersignature. */
export function CountersignDue() {
  const [due, setDue] = useState<{ id: string; title: string; signer: string; signedAt: string }[]>([]);
  useEffect(() => {
    void fetch("/api/proposals?countersign=due", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { due: [] }))
      .then((j) => setDue(Array.isArray(j.due) ? j.due : []))
      .catch(() => {});
  }, []);
  if (!due.length) return null;
  return (
    <section className="ms-due" aria-label="Waiting for your countersignature" data-section="countersign-due">
      {due.map((d) => (
        <div key={d.id} className="ms-due-row">
          <span>
            <strong>{d.signer.split(" ")[0]} signed. Countersign to finish.</strong> {d.title}, signed {dayOf(d.signedAt)}.
          </span>
          <a className="btn btn-sm" href={`/?p=proposals&pr=${encodeURIComponent(d.id)}&countersign=1`}>
            Countersign
          </a>
        </div>
      ))}
    </section>
  );
}

/** Settings: the saved signature on its own. */
export function SignatureSettings() {
  const [st, setSig] = useMySignature();
  if (!st.loaded) return null;
  return (
    <section className="tp-card ms-settings" aria-labelledby="ms-set-h">
      <h2 className="tp-card-h" id="ms-set-h">
        Your signature
      </h2>
      <p className="pp-help">Set it once to sign your proposals as you send them, or to countersign in one tap. Only you can apply it.</p>
      <MySignature value={st.sig} name={st.name} title={st.title} onChange={setSig} />
    </section>
  );
}
