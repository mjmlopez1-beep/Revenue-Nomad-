"use client";

/**
 * A person on the record (PersonCard: the same rows as a seat), where a leader read from the company's website came from, and the Add a person form.
 * Moved out of Drawer.tsx: the record drawer (phones, RN_UI2 off) and the company page (company/CompanyPage.tsx) both draw these.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Cell, PersonRec } from "@/lib/tableTypes";
import { RELATIONSHIPS, cleanValue, fieldDef, PERSON_BUNDLE, PERSON_DETAILS } from "@/lib/tableFields";
import { AFTER_COMPANY, AFTER_NAME, PERSON_NO_ADD, personBothLocked, personUnseen } from "../../model";
import { useUi } from "../../ui";
import { LEADERS_SOURCE, LEADERS_SOURCE_SAY, checkedWords } from "@/lib/leaders/types";
import { OWNSITE_SAY, OWNSITE_SOURCE } from "@/lib/ownsites/types";
import { likelyWords } from "@/lib/leaders/likely";
import { useEnv, useEscape } from "./env";
import { FieldList } from "./Facts";

/* ---------- people ---------- */

export const PERSON_FIELDS = ["title", "relationship", "name", "email", "linkedin", "phone"];
/** While a person's name and title are both locked they are one row ("Name and title"), at the top where the title goes. */
export const personFields = (p: PersonRec) => (personBothLocked(p.cells) ? ["name", "title", "relationship", "email", "linkedin", "phone"] : PERSON_FIELDS);
export const personRender: Record<string, (v: string) => ReactNode> = {
  title: (v) => <span className="tp-person-title">{v}</span>,
  relationship: (v) => <span className="chip tp-fn">{v}</span>,
};

/**
 * A person: the same rows as a seat. A card of its own at the company, flat inside a seat card.
 * At a locked company everything about them opens after the company. Their LinkedIn, email and
 * phone open after their name and title, and until then nothing but a relationship can be added.
 */
export function PersonCard({ p, inSeat, anchor = true }: { p: PersonRec; inSeat?: boolean; anchor?: boolean }) {
  const env = useEnv();
  const unseen = personUnseen(p.cells);
  const waits = (f: string) => (p.cells[f]?.s !== "locked" ? null : env.hidden ? AFTER_COMPANY : unseen && PERSON_DETAILS.includes(f) ? AFTER_NAME : null);
  return (
    <div className={`tp-person${inSeat ? "" : " tp-person-box"}`} id={anchor ? `tp-d-${p.id}` : undefined}>
      <FieldList
        entity="contact"
        id={p.id}
        cells={p.cells}
        fields={personFields(p)}
        render={personRender}
        pair={PERSON_BUNDLE}
        waits={waits}
        noAdd={p.source === OWNSITE_SOURCE ? personFields(p) : unseen ? PERSON_NO_ADD : []}
        labels={likelyCell(p.cells.email) ? { email: "Likely email" } : undefined}
      />
      {p.source === LEADERS_SOURCE && <SiteSource p={p} />}
      {p.source === OWNSITE_SOURCE && <p className="tp-dsec-note tp-person-src">Email: {OWNSITE_SAY}, the address they publish on their own firm&apos;s website.</p>}
    </div>
  );
}

/** A likely email (built from the pattern of the emails on file): how many it was read from, else 0. */
export const likelyCell = (c: Cell | undefined) => (c && (c.s === "locked" || c.s === "value") && c.from === "pattern" ? c.likely ?? 0 : 0);

/**
 * Where a leader read from the company's website came from, with the page (at an unlocked company)
 * and when it was read. A likely email says how it was built, before it is unlocked too.
 */
export function SiteSource({ p }: { p: PersonRec }) {
  const likely = likelyCell(p.cells.email);
  const url = p.site?.url && /^https?:\/\//i.test(p.site.url) ? p.site.url : null;
  return (
    <p className="tp-dsec-note tp-person-src">
      {url ? (
        <a className="tp-link" href={url} target="_blank" rel="noreferrer nofollow">
          {LEADERS_SOURCE_SAY}
        </a>
      ) : (
        LEADERS_SOURCE_SAY
      )}
      {p.site?.at ? `, read ${checkedWords(p.site.at)}` : ""}.{likely ? ` Email: ${likelyWords(likely)}. Not verified.` : ""}
    </p>
  );
}

export function AddPersonForm({ companyId, engagementId, onDone, initial }: { companyId: string; engagementId: string | null; onDone: () => void; initial?: Record<string, string> }) {
  const ui = useUi();
  const [v, setV] = useState<Record<string, string>>(() => ({ ...(initial ?? {}) }));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const set = (k: string) => (x: string) => (setV((o) => ({ ...o, [k]: x })), setDiscard(false));
  const filled = Object.values(v).filter((x) => x.trim()).length;
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  // The question takes focus when it shows (autoFocus does not fire on a re-render inside the form). Keep editing is the default.
  useEffect(() => {
    if (discard) keepRef.current?.focus({ preventScroll: true });
  }, [discard]);
  const keep = () => {
    setDiscard(false);
    setTimeout(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus());
  };
  // Esc closes this form before the record. With something typed it asks first, and a second Esc keeps editing.
  useEscape(true, () => {
    if (discard) keep();
    else if (filled > 0) setDiscard(true);
    else onDone();
  });
  const submit = async () => {
    if (!v.name?.trim()) return setErr("Add their name first.");
    for (const [k, x] of Object.entries(v)) {
      if (!x.trim()) continue;
      const { error } = cleanValue(fieldDef("contact", k)!, x);
      if (error) return setErr(error);
    }
    setBusy(true);
    const r = await ui.act({ type: "addPerson", companyId, engagementId, person: v });
    setBusy(false);
    if (r.ok) onDone();
  };
  const fld = (k: string) => fieldDef("contact", k)!;
  return (
    <form
      ref={formRef}
      className="tp-pform"
      aria-label="Add a person"
      // cleanValue checks each field and says what is wrong in the form's own words, not the browser's.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="tp-pform-grid">
        <label>
          <span className="tp-lbl">Name</span>
          <input className="input" autoFocus maxLength={200} autoComplete="off" placeholder={fld("name").placeholder} value={v.name ?? ""} onChange={(e) => set("name")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">Title</span>
          <input className="input" maxLength={200} autoComplete="off" placeholder={fld("title").placeholder} value={v.title ?? ""} onChange={(e) => set("title")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">Email</span>
          <input className="input mono" type="email" maxLength={200} autoComplete="off" autoCapitalize="none" placeholder={fld("email").placeholder} value={v.email ?? ""} onChange={(e) => set("email")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">LinkedIn</span>
          <input className="input mono" inputMode="url" maxLength={200} autoComplete="off" autoCapitalize="none" placeholder={fld("linkedin").placeholder} value={v.linkedin ?? ""} onChange={(e) => set("linkedin")(e.target.value)} />
        </label>
        <label>
          <span className="tp-lbl">Phone</span>
          <input className="input num" type="tel" inputMode="tel" maxLength={40} autoComplete="off" placeholder={fld("phone").placeholder} value={v.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} />
        </label>
      </div>
      <span className="tp-lbl">Relationship</span>
      <div className="tp-chips">
        {RELATIONSHIPS.map((o) => (
          <button key={o} type="button" aria-pressed={v.relationship === o} className={`chip tp-chipbtn${v.relationship === o ? " chip-on" : ""}`} onClick={() => set("relationship")(v.relationship === o ? "" : o)}>
            {o}
          </button>
        ))}
      </div>
      {err && (
        <p className="tp-ed-err" role="alert">
          {err}
        </p>
      )}
      {discard ? (
        <div className="tp-pform-foot tp-pform-discard" role="group" aria-label="Discard what you typed?">
          <span className="tp-small">Discard what you typed?</span>
          <button type="button" className="btn btn-sm tp-btn-red" onClick={onDone}>
            Discard
          </button>
          <button ref={keepRef} type="button" className="btn btn-ghost btn-sm" onClick={keep}>
            Keep editing
          </button>
        </div>
      ) : (
        <div className="tp-pform-foot">
          <button type="submit" className="btn btn-volt btn-sm" disabled={busy} aria-busy={busy}>
            {busy ? "Adding" : "Add this person"} {!busy && filled > 0 && room > 0 && <span className="num">+{Math.min(filled, room)}</span>}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (filled > 0 ? setDiscard(true) : onDone())}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}
