/**
 * A proposal's text as the client reads it: each block a heading and its text, a line starting
 * "- " a bullet, a blank line a new paragraph. No hooks, so the signing page, the signed copy
 * (server-rendered) and the builder's preview draw it the same way.
 */
import type { ReactNode } from "react";

/** One block's text as paragraphs and lists. {{blanks}} show marked when `blanks` is on, by `label` ("Signer name") when given, never the key. */
export function DocText({ text, blanks = false, label }: { text: string; blanks?: boolean; label?: (key: string) => string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const mark = (s: string, k: string) =>
    blanks
      ? s.split(/(\{\{\s*[A-Za-z0-9_.]+\s*\}\})/).map((part, i) =>
          /^\{\{/.test(part) ? (
            <mark key={`${k}${i}`} className="sg-blank">
              {label ? label(part.replace(/[{}\s]/g, "")) : part.replace(/[{}\s]/g, "")}
            </mark>
          ) : (
            part
          ),
        )
      : s;
  const flushPara = () => {
    if (!para.length) return;
    const k = `p${out.length}`;
    out.push(
      <p key={k}>
        {para.map((l, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {mark(l, `${k}-${i}-`)}
          </span>
        ))}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const k = `l${out.length}`;
    out.push(
      <ul key={k}>
        {list.map((l, i) => (
          <li key={i}>{mark(l, `${k}-${i}-`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*[-•]\s+/.test(line)) {
      flushPara();
      list.push(line.replace(/^\s*[-•]\s+/, ""));
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <>{out}</>;
}

/** The whole document: its blocks, in order. */
export function DocBlocks({ blocks, blanks }: { blocks: { title: string; text: string }[]; blanks?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => (
        <section key={i} className="sg-block">
          <h2 className="sg-block-h">{b.title}</h2>
          <div className="sg-text">
            <DocText text={b.text} blanks={blanks} />
          </div>
        </section>
      ))}
    </>
  );
}

/** "November 21, 2026 at 3:04 PM UTC". */
export const stamp = (iso: string | null | undefined) =>
  iso
    ? `${new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })} at ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "UTC" })} UTC`
    : "";
export const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");

/** What each audit event says. */
export const EVENT_SAY: Record<string, string> = {
  sent: "Sent for signature",
  viewed: "Opened by the signer",
  code_sent: "Code sent to the signer's email",
  code_failed: "A wrong code was typed",
  code_verified: "Email confirmed with the code",
  signed: "Signed",
  declined: "Declined",
  voided: "Voided",
  expired_open: "Opened after the link expired",
  copy_sent: "Signed copy emailed",
};
