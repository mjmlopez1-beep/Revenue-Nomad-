"use client";

/**
 * One contract (Contracts, RN_CONTRACTS2): title, one status, one line of facts, the actions that
 * fit where it is (Remind, Copy link, Cancel, Download; Sign now on your turn; Download signed PDF
 * once complete; Send again once ended; Continue or Delete a draft), where each signer is, and a
 * plain audit trail, oldest first, with times. IP addresses and browsers stay in the signed PDF's
 * audit page. Reading activity (Close) is folded under the trail.
 *
 * Remind: at most once a day per signer (POST /api/contracts remind). Copy link: the current
 * signer's own link; it still asks for the code emailed to them. Cancel: the links stop and each
 * signer who had one gets a short email.
 */
import { useEffect, useState } from "react";
import type { DocEvent, DocumentRec } from "@/lib/documents/types";
import { IconChevron } from "../../ui/shared";
import { PdfPages } from "../../ui/PdfPages";
import { dapi } from "../DocBuilder";
import { saveReminders, useSendReminders } from "../SendReminders";
import { ActivityPanel } from "../Activity";
import { colourOf } from "./Prepare";
import "../../ui/pdf.css";
import "./contracts2.css";

const first = (s: string) => s.trim().split(/\s+/)[0] || s;
const names = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
export const dayShort = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

export async function c2api<T>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const r = await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." } as T & { error: string };
  }
}

/** The status as one word or two, as the list says it. */
export function statusOfDoc(d: DocumentRec): { k: string; words: string } {
  if (d.status === "signed") return { k: "completed", words: "Completed" };
  if (d.status === "declined") return { k: "declined", words: "Declined" };
  if (d.status === "void") return { k: "canceled", words: "Canceled" };
  if (d.status === "expired") return { k: "expired", words: "Expired" };
  if (d.status === "draft") return { k: "draft", words: "Draft" };
  const left = d.signers.filter((x) => x.status !== "signed");
  const turn = d.ordered ? left.slice(0, 1) : left;
  if (turn.some((x) => x.sender)) return { k: "you", words: "Awaiting you" };
  return { k: "awaiting", words: `Awaiting ${names(turn.map((x) => first(x.name)))}` };
}

/** One line of the audit trail, in plain words. */
export function trailWords(e: DocEvent, d: DocumentRec): string | null {
  const who = (email?: string) => {
    const x = d.signers.find((y) => y.email === email);
    return x ? (x.sender ? "you" : x.name) : email ?? "a signer";
  };
  const Who = (email?: string) => {
    const w = who(email);
    return w === "you" ? "You" : w;
  };
  switch (e.kind) {
    case "uploaded":
      return "Created";
    case "sent":
      return `Sent by you to ${names(d.signers.filter((x) => !x.sender).map((x) => x.name)) || "yourself"}`;
    case "notified":
      return e.note === "Signing now, in Merlin" ? "Ready for you to sign" : `Emailed to ${who(e.who)}`;
    case "viewed":
      return `Opened by ${who(e.who)}`;
    case "code_sent":
      return null;
    case "code_failed":
      return `A wrong code was typed for ${who(e.who)}`;
    case "code_verified":
      return `${Who(e.who)} confirmed ${who(e.who) === "you" ? "your" : "their"} email with a code`;
    case "signed":
      return `Signed by ${who(e.who)}`;
    case "declined":
      return `Declined by ${who(e.who)}${e.note ? `: ${e.note}` : ""}`;
    case "voided":
      return /went back to a draft/.test(e.note ?? "") ? "The email didn't go out, so it went back to a draft" : "Canceled by you";
    case "completed":
      return "Completed: everyone signed";
    case "copy_sent":
      return "The signed PDF was emailed to everyone";
    case "expired_open":
      return `Opened by ${who(e.who)} after the link ended`;
    case "reminded":
      return `Reminder sent to ${who(e.who)}`;
    case "cancel_sent":
      return "Each signer was told it was canceled";
    default:
      return null;
  }
}

export function DocDetail({ id, canClose, phone, onBack, onContinue, onAgain, toast }: { id: string; canClose: boolean; phone: boolean; onBack: () => void; onContinue: (d: DocumentRec) => void; onAgain: (d: DocumentRec) => void; toast: (t: string, err?: boolean) => void }) {
  const [d, setD] = useState<DocumentRec | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rem, setRem] = useSendReminders(id, canClose);
  const load = async () => {
    try {
      const r = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(j.error || "That contract didn't load.");
      setD(j);
    } catch {
      setErr("We couldn't reach Merlin. Check your connection and try again.");
    }
  };
  useEffect(() => {
    void load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = (
    <button type="button" className="c2-back" onClick={onBack}>
      <IconChevron dir="left" size={14} /> Contracts
    </button>
  );
  if (err) return <div className="c2-page">{back}<p className="c2-err">{err}</p></div>;
  if (!d) return <div className="c2-page" aria-busy="true">{back}<div className="c2-skel" /></div>;

  const st = statusOfDoc(d);
  const theirsTurn = (() => {
    const left = d.signers.filter((x) => x.status !== "signed");
    return (d.ordered ? left.slice(0, 1) : left).filter((x) => !x.sender);
  })();
  const live = st.k === "awaiting" || st.k === "you";
  const run = async (what: string, fn: () => Promise<{ error?: string; message?: string }>, after?: (r: { message?: string }) => void) => {
    setBusy(what);
    const r = await fn();
    setBusy(null);
    if (r.error) return toast(r.error, true);
    after?.(r);
    void load();
  };
  const remind = () => run("remind", () => c2api<{ message: string }>({ op: "remind", id }), (r) => toast(r.message ?? "Reminded."));
  const copyLink = () =>
    run("link", () => c2api<{ link: string; name: string }>({ op: "link", id }), (r) => {
      const x = r as { link: string; name: string };
      void navigator.clipboard?.writeText(x.link).catch(() => {});
      toast(`${first(x.name)}'s link copied. It still asks for the code we email ${first(x.name)}.`);
    });
  const cancel = () => window.confirm("Cancel it? The links stop working, and each signer gets a short email saying so.") && run("cancel", () => c2api<{ message: string }>({ op: "cancel", id }), (r) => toast(r.message ?? "Canceled."));
  const signNow = () => run("sign", () => dapi<{ link: string }>({ op: "mylink", id }), (r) => window.location.assign((r as { link: string }).link));
  const del = () => window.confirm("Delete this draft? It can't be undone.") && run("delete", () => dapi({ op: "delete", id }), () => (toast("Deleted."), onBack()));
  const again = () => run("again", () => dapi<DocumentRec>({ op: "copy", id }), (r) => onAgain(r as DocumentRec));
  const facts = [
    "Contract",
    d.company.name,
    d.sentAt ? `Sent ${dayShort(d.sentAt)}` : `Created ${dayShort(d.createdAt)}`,
    d.completedAt ? `Completed ${dayShort(d.completedAt)}` : live ? (d.expiresAt ? `Link ends ${dayShort(d.expiresAt)}` : "No end date") : null,
  ].filter(Boolean);
  const sig = d.signers.map((x) => ({ id: x.id, name: x.name, me: x.sender }));
  const where = (x: DocumentRec["signers"][number], i: number) => {
    if (x.status === "signed") return { cls: "ok", t: `Signed ${when(x.signedAt)}` };
    if (x.status === "declined") return { cls: "bad", t: `Declined ${when(x.declinedAt)}${x.declineReason ? `: ${x.declineReason}` : ""}` };
    if (!d.sentAt) return { cls: "", t: x.sender ? "You sign" : "Not sent yet" };
    if (x.status === "viewed") return { cls: "warn", t: `Opened ${when(x.viewedAt)}, not signed yet` };
    if (x.status === "sent") return { cls: "warn", t: x.sender ? "Your turn to sign" : `Emailed ${when(x.notifiedAt)}, not opened` };
    const before = d.signers[i - 1];
    return { cls: "", t: d.ordered && before ? `Gets it after ${before.sender ? "you" : first(before.name)}` : "Waiting" };
  };
  const remOn = rem.d2 || rem.d7 || rem.expiry;
  const trail = d.events.map((e) => ({ e, t: trailWords(e, d) })).filter((x) => x.t);

  return (
    <div className="c2-page c2-detail">
      {back}
      <div className="c2-dhead">
        <div>
          <h1 className="c2-h1">{d.title}</h1>
          <p className="c2-lead">{facts.join(" · ")}</p>
        </div>
        <span className="c2-pill" data-k={st.k}>
          {st.words}
        </span>
      </div>
      <div className="c2-dact">
        {st.k === "awaiting" && (
          <button type="button" className="btn btn-pine" disabled={!!busy} onClick={() => void remind()}>
            Remind {names(theirsTurn.map((x) => first(x.name)))}
          </button>
        )}
        {st.k === "you" && (
          <button type="button" className="btn btn-pine" disabled={!!busy} onClick={() => void signNow()}>
            Sign now
          </button>
        )}
        {st.k === "awaiting" && (
          <button type="button" className="btn" disabled={!!busy} onClick={() => void copyLink()}>
            Copy link
          </button>
        )}
        {live && (
          <button type="button" className="btn" disabled={!!busy} onClick={() => void cancel()}>
            Cancel
          </button>
        )}
        {st.k === "completed" ? (
          <a className="btn btn-pine" href={`/api/documents/file?id=${encodeURIComponent(d.id)}&final=1&download=1`}>
            Download signed PDF
          </a>
        ) : st.k !== "draft" ? (
          <a className="btn" href={`/api/documents/file?id=${encodeURIComponent(d.id)}&download=1`}>
            Download
          </a>
        ) : null}
        {(st.k === "declined" || st.k === "expired" || st.k === "canceled") && (
          <button type="button" className="btn btn-pine" disabled={!!busy} onClick={() => void again()}>
            Send again
          </button>
        )}
        {st.k === "draft" && (
          <>
            <button type="button" className="btn btn-pine" onClick={() => onContinue(d)}>
              Continue
            </button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => void del()}>
              Delete
            </button>
          </>
        )}
      </div>
      <div className="c2-dgrid">
        <section className="c2-card" aria-labelledby="c2-sg">
          <h2 className="c2-h3" id="c2-sg">
            Signers
          </h2>
          <ol className="c2-signers">
            {d.signers.map((x, i) => {
              const w = where(x, i);
              return (
                <li key={x.id}>
                  <span className="c2-ring" data-c={colourOf(sig, x.id)} data-done={x.status === "signed"} aria-hidden />
                  <span>
                    <strong>
                      {d.ordered && d.signers.length > 1 ? `${i + 1}. ` : ""}
                      {x.sender ? "You" : x.name}
                    </strong>{" "}
                    {!x.sender && <span className="c2-sub">{x.email}</span>}
                    <span className="c2-where" data-k={w.cls}>
                      {w.t}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {d.signers.length > 1 && <p className="c2-sub">{d.ordered ? "One at a time, in this order." : "Everyone got it at once."}</p>}
          {canClose && live && (
            <p className="c2-remline">
              {remOn ? "Reminders are on: day 2 if not opened, day 7 if not signed, and 2 days before the link ends." : "Reminders are off."}{" "}
              <button
                type="button"
                className="c2-link"
                onClick={async () => {
                  const v = !remOn;
                  const e = await saveReminders(id, { d2: v, d7: v, expiry: v });
                  if (e) return toast(e, true);
                  setRem({ d2: v, d7: v, expiry: v });
                }}
              >
                {remOn ? "Turn off" : "Turn on"}
              </button>
            </p>
          )}
        </section>
        <section className="c2-card" aria-labelledby="c2-at">
          <h2 className="c2-h3" id="c2-at">
            Audit trail
          </h2>
          <ol className="c2-trail">
            {trail.map(({ e, t }, i) => (
              <li key={`${e.at}${i}`}>
                <span className="c2-sub">{when(e.at)}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <p className="c2-sub">The signed PDF ends with this trail, each signer&#39;s email check, IP address and browser, and a seal anyone can check.</p>
          {canClose && d.sentAt && (
            <details className="c2-fold-box">
              <summary>Reading activity</summary>
              <ActivityPanel kind="document" id={d.id} quiet />
            </details>
          )}
        </section>
        {!phone && (
          <section className="c2-card c2-file" aria-label="The document">
            <h2 className="c2-h3">{d.fileName}</h2>
            <PdfPages src={`/api/documents/file?id=${encodeURIComponent(d.id)}${d.status === "signed" ? "&final=1" : ""}`} pages={d.pages} only={[0]} />
          </section>
        )}
      </div>
    </div>
  );
}
