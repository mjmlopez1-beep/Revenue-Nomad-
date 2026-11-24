/**
 * Who signs, pure (Contracts, RN_CONTRACTS2): read by the send flow in the app
 * (app/post/contracts/SendFlow.tsx, SendSheet.tsx) and by the server and the tests, so the rules
 * live in one place. No imports from the server.
 *
 *   rowsFor          the signer rows for Just me, Me and others, Just others. Default order: the
 *                    other side first, the member last (they countersign).
 *   modeOf           which of the three a list of rows is
 *   memberSignOf     a proposal's MemberSignMode from where "You" sits: last "after", first "now", absent "none"
 *   actionWord       the button: Send, Sign and send (the member signs first) or Sign now (Just me)
 *   missingSignature the signers with no Signature field yet (Next is blocked until there are none)
 *   placeForMe       "Place it for me": a Signature and a Date signed for each signer missing one
 */
import { FIELD_SIZE, type DocField } from "./types";

/** PDF only in v1: a Word or other file is refused with this, in the app and on the server. */
export const PDF_ONLY = "Merlin takes PDFs only. Save it as a PDF first: in Word or Google Docs, File, then Download or Save as, then PDF.";

export type WhoMode = "me" | "both" | "others";
export const WHO_SAY: Record<WhoMode, { label: string; sub: string }> = {
  me: { label: "Just me", sub: "Sign it yourself" },
  both: { label: "Me and others", sub: "You and the other side" },
  others: { label: "Just others", sub: "Only they sign" },
};

export interface WhoRow {
  /** The app's key for the row: a signer id once saved, else "new_..." (a reading's key keeps its fields). */
  key: string;
  name: string;
  email: string;
  title?: string;
  /** The member themselves. */
  me: boolean;
  /** Where Merlin found them ("Found in the contract", "From your pipeline"). */
  found?: string;
}

/** The rows for a mode. Me and others: theirs first, in order, then the member last. */
export function rowsFor(mode: WhoMode, me: { name: string; email: string }, others: WhoRow[]): WhoRow[] {
  const theirs = others.filter((x) => !x.me);
  const mine: WhoRow = { key: others.find((x) => x.me)?.key ?? "me", name: me.name, email: me.email.toLowerCase(), me: true };
  if (mode === "me") return [mine];
  if (mode === "others") return theirs.length ? theirs : [blankRow()];
  return [...(theirs.length ? theirs : [blankRow()]), mine];
}

let n = 0;
export const blankRow = (): WhoRow => ({ key: `new_${Date.now().toString(36)}${(n++).toString(36)}`, name: "", email: "", me: false });

export function modeOf(rows: { me?: boolean }[]): WhoMode {
  const mine = rows.some((x) => x.me);
  return !mine ? "others" : rows.length === 1 ? "me" : "both";
}

/** A proposal's own words for where the member signs (lib/proposals MemberSignMode). */
export function memberSignOf(rows: { me?: boolean }[]): "now" | "after" | "none" {
  const i = rows.findIndex((x) => x.me);
  return i < 0 ? "none" : i === 0 && rows.length > 1 ? "now" : "after";
}

/** What the send button says: what will happen when it is tapped. */
export function actionWord(rows: { me?: boolean }[], ordered: boolean): "Send" | "Sign and send" | "Sign now" {
  const m = modeOf(rows);
  if (m === "me") return "Sign now";
  if (m === "both" && (rows[0]?.me || !ordered)) return "Sign and send";
  return "Send";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/** Why the rows can't go on to the next step, or null. */
export function rowsProblem(rows: WhoRow[]): string | null {
  if (!rows.length) return "Add who signs.";
  const seen = new Set<string>();
  for (const x of rows) {
    if (x.me) continue;
    if (!x.name.trim()) return "Type each signer's name.";
    if (!EMAIL.test(x.email.trim())) return `Check ${x.name.trim().split(/\s+/)[0]}'s email.`;
    const e = x.email.trim().toLowerCase();
    if (seen.has(e)) return `${e} is on the list twice.`;
    seen.add(e);
  }
  const me = rows.find((x) => x.me);
  if (me && seen.has(me.email.toLowerCase())) return "That's your own email. Use Me and others to sign it yourself.";
  return null;
}

/** The signers with no Signature field: Next waits until every signer has one. */
export function missingSignature<S extends { id: string }>(signers: S[], fields: Pick<DocField, "signer" | "kind">[]): S[] {
  return signers.filter((x) => !fields.some((f) => f.signer === x.id && f.kind === "signature"));
}

/**
 * "Place it for me": a Signature with a Date signed under it for each signer who has none, on the
 * last page, side by side in the bottom third, in signing order. Sizes as the placer's (FIELD_SIZE).
 */
export function placeForMe(signers: { id: string }[], fields: DocField[], pages: { w: number; h: number }[], idOf: (i: number) => string): DocField[] {
  if (!pages.length) return [];
  const page = pages.length - 1;
  const pg = pages[page];
  const missing = missingSignature(signers, fields);
  const sw = Math.min(0.42, (FIELD_SIZE.signature.w * 612) / pg.w);
  const sh = Math.min(0.2, (FIELD_SIZE.signature.h * 792) / pg.h);
  const dw = Math.min(0.42, (FIELD_SIZE.date.w * 612) / pg.w);
  const dh = Math.min(0.2, (FIELD_SIZE.date.h * 792) / pg.h);
  return missing.flatMap((x, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const left = 0.08 + col * 0.46;
    const top = Math.min(0.9 - sh - dh, 0.62 + row * (sh + dh + 0.04));
    return [
      { id: idOf(i * 2), page, kind: "signature" as const, signer: x.id, required: true, x: left, y: top, w: sw, h: sh },
      { id: idOf(i * 2 + 1), page, kind: "date" as const, signer: x.id, required: true, x: left, y: top + sh + 0.012, w: dw, h: dh },
    ];
  });
}

/** "Sam signs first. Then Priya, then you." */
export function orderLine(rows: Pick<WhoRow, "me" | "name">[], ordered: boolean): string {
  const nm = (x: Pick<WhoRow, "me" | "name">, cap: boolean) => (x.me ? (cap ? "You" : "you") : x.name.trim().split(/\s+/)[0] || "They");
  if (rows.length === 1) return rows[0].me ? "Only you sign." : `Only ${nm(rows[0], false)} signs.`;
  if (!ordered) return "Everyone gets it at once.";
  const [a, ...rest] = rows;
  const tail = rest.map((x) => nm(x, false));
  return `${nm(a, true)} ${a.me ? "sign" : "signs"} first. Then ${tail.length > 1 ? `${tail.slice(0, -1).join(", ")}, then ${tail[tail.length - 1]}` : tail[0]}.`;
}
