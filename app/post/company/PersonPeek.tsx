"use client";

/**
 * A person on the company page, opened from their name: what Merlin holds on them, how the member
 * knows them, and their public profile link. A stand-in until the person bubble (BUILD_PLAN F7,
 * app/post/PersonBubble.tsx) takes its place: the page passes its `bubble` prop through when one
 * is given, and draws this otherwise. Only ever for a name the member can see; the lock cells stay
 * in the table, so nothing here spends.
 */
import { useEffect, useRef } from "react";
import type { EngagementRec, PersonRec } from "@/lib/tableTypes";
import { hrefFor, IconExternal, IconX } from "../../ui/shared";
import { shown, type CoInfo } from "../model";
import { useNetCompany } from "../network/useNetwork";
import { WarmthChip } from "../network/parts";
import { useEscape } from "./sections/env";

const nameKey = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export interface BubbleProps {
  i: CoInfo;
  p: PersonRec;
  e: EngagementRec | null;
  /** The name that opened it: focus goes back there when it closes. */
  anchor: HTMLElement | null;
  onClose: () => void;
  /** See the way in (the Ways in tab). */
  onWays: () => void;
  /** Their full card, below the table (confirm, report, add a detail). */
  onCard: () => void;
}

export function PersonPeek({ i, p, e, anchor, onClose, onWays, onCard }: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const net = useNetCompany(i.c.hidden ? null : i.c.id);
  const name = p.cells.name?.s === "value" ? p.cells.name.v : "";
  const title = shown(p.cells.title);
  const k = name ? (net?.people ?? []).find((x) => x.name && !x.hidden && nameKey(x.name) === nameKey(name)) : undefined;
  const close = () => {
    onClose();
    setTimeout(() => anchor?.isConnected && anchor.focus({ preventScroll: true }));
  };
  // Esc closes this before the page.
  useEscape(true, close);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [p.id]);
  const val = (f: string) => {
    const c = p.cells[f];
    if (!c || c.s === "empty") return "Not on file";
    if (c.s === "locked") return "On file, 1 credit in the table";
    return c.s === "value" ? c.v : "Not on file";
  };
  const profile = p.cells.linkedin?.s === "value" ? hrefFor("contact", "linkedin", p.cells.linkedin.v) : null;
  const tie = e ? `${shown(e.cells.function) ?? "A"} seat` : "Whole company";
  return (
    <div ref={ref} className="co-peek" role="dialog" aria-modal="false" aria-label={`About ${name}`}>
      <div className="co-peek-h">
        <span className="co-peek-ini" aria-hidden>
          {initials(name)}
        </span>
        <span className="co-peek-who">
          <strong>{name}</strong>
          <span className="co-sub">
            {title ? `${title}, ` : ""}
            {i.c.name}
          </span>
        </span>
        <button type="button" className="tp-iconbtn" aria-label="Close" onClick={close}>
          <IconX size={16} />
        </button>
      </div>
      <div className="co-peek-cols">
        <div>
          <span className="co-side-k">What Merlin holds</span>
          <dl className="co-peek-dl">
            <dt>Title</dt>
            <dd>{title ?? "Not on file"}</dd>
            <dt>Relationship</dt>
            <dd>{shown(p.cells.relationship) ?? "Not on file"} · free</dd>
            <dt>Tied to</dt>
            <dd>{tie}</dd>
            <dt>Email</dt>
            <dd>{val("email")}</dd>
            <dt>Phone</dt>
            <dd>{val("phone")}</dd>
          </dl>
        </div>
        <div>
          <span className="co-side-k">How you know them</span>
          {k ? (
            <p className="co-peek-p">
              <WarmthChip w={k.warmth} /> {k.meetings ? `${k.meetings} meetings` : "In your contacts"}
              {k.last ? `, the last on ${new Date(k.last).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}.
            </p>
          ) : (
            <p className="co-peek-p">Nobody you brought in matches {name.split(/\s+/)[0]} yet.</p>
          )}
          <span className="co-sub">Only you see this. It comes from what you brought in.</span>
        </div>
        <div>
          <span className="co-side-k">Public profile</span>
          {profile ? (
            <>
              <a className="tp-link" href={profile} target="_blank" rel="noreferrer">
                Open their public profile <IconExternal size={12} />
              </a>
              <span className="co-sub">Opens in a new tab. Merlin links to it and reads nothing from it.</span>
            </>
          ) : (
            <span className="co-sub">{p.cells.linkedin?.s === "locked" ? "The link is on file and still locked. It is 1 credit, in the Public profile column." : "Not on file."}</span>
          )}
        </div>
      </div>
      <div className="co-peek-acts">
        <button type="button" className="btn btn-sm btn-pine" onClick={onWays}>
          See the way in
        </button>
        <button type="button" className="btn btn-sm" onClick={onCard}>
          Confirm, report or add to this
        </button>
      </div>
    </div>
  );
}
