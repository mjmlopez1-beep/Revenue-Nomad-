"use client";

/**
 * Prepare: step 3 of sending for signature (Contracts, RN_CONTRACTS2). The document in the middle;
 * a slim left rail with who the fields are for (a colour each) and the six field types. Drag a type
 * onto the page, drag a placed field to move it, its corner to resize it; tap it to change its
 * signer, Required, or Delete. Phones: the rail is a bottom bar: tap a type, then tap the page.
 * "Place it for me" adds a Signature and a Date signed for each signer missing one
 * (lib/documents/whoSigns.ts placeForMe). Next waits until every signer has a Signature.
 *
 * The placing logic is DocBuilder.tsx's (shares of the page, sizes in points on any page size), in
 * this layout. Fields Merlin placed (an upload it read, a saved contract) arrive here already placed.
 */
import { useRef, useState } from "react";
import { FIELD_KINDS, FIELD_SAY, FIELD_SIZE, type DocField, type FieldKind } from "@/lib/documents/types";
import { missingSignature, placeForMe } from "@/lib/documents/whoSigns";
import { PdfPages } from "../../ui/PdfPages";
import "../../ui/pdf.css";
import "./contracts2.css";

export interface PrepSigner {
  id: string;
  name: string;
  me: boolean;
}

let seq = 0;
const tempId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const first = (s: string) => s.trim().split(/\s+/)[0] || s;
/** A signer's colour: the member green, the others blue, orange, purple, teal, pink in order. */
export const colourOf = (signers: PrepSigner[], id: string) => {
  const x = signers.find((y) => y.id === id);
  if (!x) return "0";
  return x.me ? "me" : String(signers.filter((y) => !y.me).indexOf(x) % 5);
};
const nameOf = (x: PrepSigner) => (x.me ? "You" : x.name);

const ICON: Record<FieldKind, string> = { signature: "✍", initials: "AB", date: "▦", name: "◉", text: "T", checkbox: "☑" };

export function Prepare({
  pdf,
  pages,
  signers,
  fields,
  onFields,
  phone,
  placedBy,
  onToast,
}: {
  pdf: string;
  pages: { w: number; h: number }[];
  signers: PrepSigner[];
  fields: DocField[];
  onFields: (f: DocField[]) => void;
  phone: boolean;
  /** The fields arrived placed: by Merlin reading the document, or from a saved template. */
  placedBy?: "merlin" | "template" | null;
  onToast: (t: string) => void;
}) {
  const [who, setWho] = useState<string>(signers[0]?.id ?? "");
  const [arm, setArm] = useState<FieldKind | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const cur = signers.find((x) => x.id === who) ? who : signers[0]?.id ?? "";
  const missing = missingSignature(signers, fields);

  const place = (kind: FieldKind, page: number, fx: number, fy: number) => {
    const s = signers.find((x) => x.id === cur);
    if (!s) return;
    const sz = FIELD_SIZE[kind];
    const pg = pages[page];
    const w = Math.min(0.9, (sz.w * 612) / pg.w);
    const h = Math.min(0.5, (sz.h * 792) / pg.h);
    const f: DocField = { id: tempId("f"), page, kind, signer: s.id, required: kind !== "checkbox", x: Math.max(0, Math.min(1 - w, fx - w / 2)), y: Math.max(0, Math.min(1 - h, fy - h / 2)), w, h };
    onFields([...fields, f]);
    setSel(f.id);
    setArm(null);
    onToast(`${FIELD_SAY[kind]} placed for ${s.me ? "you" : first(s.name)}.`);
  };

  // Moving and resizing: shares of the page, from the pointer.
  const drag = useRef<{ id: string; mode: "move" | "size"; x0: number; y0: number; f: DocField; rect: DOMRect; moved: boolean } | null>(null);
  const down = (e: React.PointerEvent, f: DocField, mode: "move" | "size") => {
    e.stopPropagation();
    const page = (e.currentTarget as HTMLElement).closest(".pdf-page") as HTMLElement | null;
    if (!page) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: f.id, mode, x0: e.clientX, y0: e.clientY, f: { ...f }, rect: page.getBoundingClientRect(), moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = (e.clientX - g.x0) / g.rect.width;
    const dy = (e.clientY - g.y0) / g.rect.height;
    if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > 3) g.moved = true;
    if (!g.moved) return;
    onFields(
      fields.map((f) => {
        if (f.id !== g.id) return f;
        if (g.mode === "move") return { ...f, x: Math.max(0, Math.min(1 - f.w, g.f.x + dx)), y: Math.max(0, Math.min(1 - f.h, g.f.y + dy)) };
        return { ...f, w: Math.max(0.02, Math.min(1 - f.x, g.f.w + dx)), h: Math.max(0.012, Math.min(1 - f.y, g.f.h + dy)) };
      }),
    );
  };
  const up = () => {
    const g = drag.current;
    drag.current = null;
    // A tap (no movement) opens its menu; a drag only moves it.
    if (g && !g.moved && g.mode === "move") setSel((s) => (s === g.id ? null : g.id));
  };
  const change = (id: string, patch: Partial<DocField>) => onFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const overlay = (page: number) => (
    <div
      className="c2-layer"
      data-arm={!!arm}
      onPointerDown={(e) => {
        if (!arm) return setSel(null);
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        place(arm, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
      onDragOver={(e) => e.dataTransfer.types.includes("text/x-field") && (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"))}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData("text/x-field") as FieldKind;
        if (!FIELD_KINDS.includes(kind)) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        place(kind, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
    >
      {fields
        .filter((f) => f.page === page)
        .map((f) => {
          const s = signers.find((x) => x.id === f.signer);
          return (
            <div
              key={f.id}
              className="c2-field"
              data-c={colourOf(signers, f.signer)}
              data-kind={f.kind}
              data-sel={sel === f.id}
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
              onPointerDown={(e) => down(e, f, "move")}
              onPointerMove={move}
              onPointerUp={up}
              role="button"
              tabIndex={0}
              aria-label={`${FIELD_SAY[f.kind]} for ${s ? nameOf(s) : "a signer"}`}
              onKeyDown={(e) => {
                if (e.key === "Delete" || e.key === "Backspace") onFields(fields.filter((x) => x.id !== f.id)), setSel(null);
                if (e.key === "Enter" || e.key === " ") setSel(f.id);
              }}
            >
              <span className="c2-field-l">{f.kind === "checkbox" ? "" : f.kind === "text" && (f.prefill || f.label) ? f.prefill || f.label : FIELD_SAY[f.kind]}</span>
              {sel === f.id && <span className="c2-handle" onPointerDown={(e) => down(e, f, "size")} onPointerMove={move} onPointerUp={up} aria-hidden />}
              {sel === f.id && (
                <div className="c2-pop" onPointerDown={(e) => e.stopPropagation()} role="toolbar" aria-label="This field">
                  <span className="c2-pop-who" role="radiogroup" aria-label="Who fills it">
                    {signers.map((x) => (
                      <button key={x.id} type="button" role="radio" aria-checked={f.signer === x.id} aria-label={nameOf(x)} title={nameOf(x)} className="c2-pop-dot" data-c={colourOf(signers, x.id)} onClick={() => change(f.id, { signer: x.id })} />
                    ))}
                  </span>
                  <label className="c2-pop-req">
                    <input type="checkbox" checked={f.required} onChange={(e) => change(f.id, { required: e.target.checked })} /> Required
                  </label>
                  {f.kind === "text" && <input className="input c2-pop-lab" placeholder="What to type" maxLength={60} value={f.label ?? ""} onChange={(e) => change(f.id, { label: e.target.value })} />}
                  <button type="button" className="c2-pop-del" onClick={() => (onFields(fields.filter((x) => x.id !== f.id)), setSel(null))}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  const kinds = (
    <div className="c2-kinds" role="group" aria-label={phone ? "Tap a field, then tap the page" : "Drag onto the page"}>
      {FIELD_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          className="c2-kind"
          data-kind={k}
          aria-pressed={arm === k}
          draggable={!phone}
          onDragStart={(e) => (e.dataTransfer.setData("text/x-field", k), (e.dataTransfer.effectAllowed = "copy"))}
          onClick={() => setArm((a) => (a === k ? null : k))}
        >
          <span className="c2-kind-i" aria-hidden>
            {ICON[k]}
          </span>
          {k === "name" ? "Name" : FIELD_SAY[k]}
        </button>
      ))}
    </div>
  );
  const whoPick = (
    <div className="c2-for" role="radiogroup" aria-label="Fields for">
      {signers.map((x) => (
        <button key={x.id} type="button" role="radio" aria-checked={cur === x.id} className="c2-for-b" data-c={colourOf(signers, x.id)} onClick={() => setWho(x.id)}>
          <span className="c2-dot" data-c={colourOf(signers, x.id)} aria-hidden />
          {nameOf(x)}
        </button>
      ))}
    </div>
  );
  const placeIt = () => {
    const add = placeForMe(signers, fields, pages, () => tempId("f"));
    if (!add.length) return;
    onFields([...fields, ...add]);
    onToast(`Placed a Signature and a Date signed for ${missing.map((x) => (x.me ? "you" : first(x.name))).join(" and ")} on the last page. Drag them where they go.`);
  };

  return (
    <div className="c2-prep" data-phone={phone}>
      {!phone && (
        <aside className="c2-rail" aria-label="Fields">
          <p className="c2-rail-h">Fields for</p>
          {whoPick}
          <p className="c2-rail-h">Drag onto the page</p>
          {kinds}
          <p className="c2-rail-h">Each signer</p>
          <ul className="c2-each">
            {signers.map((x) => {
              const n = fields.filter((f) => f.signer === x.id).length;
              const ok = !missing.includes(x);
              return (
                <li key={x.id} data-ok={ok}>
                  <span className="c2-dot" data-c={colourOf(signers, x.id)} aria-hidden />
                  {x.me ? "You" : first(x.name)}: {n} {n === 1 ? "field" : "fields"} {ok ? "✓" : "· needs a Signature"}
                </li>
              );
            })}
          </ul>
          <button type="button" className="c2-link" onClick={placeIt} disabled={!missing.length}>
            Place it for me
          </button>
        </aside>
      )}
      <div className="c2-doc">
        <p className="c2-note" role="status">
          {missing.length ? (
            <>
              <strong>{missing.map((x) => (x.me ? "You" : first(x.name))).join(" and ")} {missing.length === 1 && !missing[0].me ? "needs" : "need"} a Signature.</strong> {phone ? "Tap Signature, then tap the page." : "Drag Signature onto the page."}{" "}
              <button type="button" className="c2-link" onClick={placeIt}>
                Place it for me
              </button>
            </>
          ) : (
            <>
              <strong>{placedBy === "merlin" ? `Merlin placed ${fields.length} ${fields.length === 1 ? "field" : "fields"}. Check them.` : placedBy === "template" ? `${fields.length} ${fields.length === 1 ? "field" : "fields"} placed from your template. Check them.` : `${fields.length} ${fields.length === 1 ? "field" : "fields"} placed.`}</strong> Drag a field to move it. Tap one to change who fills it, or delete it.
            </>
          )}
        </p>
        {arm && <p className="c2-arm">Tap the page where the {FIELD_SAY[arm].toLowerCase()} goes.</p>}
        <PdfPages src={pdf} pages={pages} overlay={overlay} />
      </div>
      {phone && (
        <div className="c2-bar" aria-label="Fields">
          {whoPick}
          {kinds}
        </div>
      )}
    </div>
  );
}
