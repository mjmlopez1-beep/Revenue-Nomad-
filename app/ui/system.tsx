"use client";

/**
 * The system's building blocks (docs/design-system.md): the page head, the card, the callout,
 * the chip and its three scales, the stat and the empty state. Each is a thin wrapper over the
 * classes in app/globals.css, so a page that can't take a component (a server page, an email's
 * twin) can use the class instead and look the same.
 *
 * Pictures come from the Fractions kit through ./fractions/lazy: an empty box of the right size
 * until the kit is here, then the picture, so nothing moves.
 */
import type { ReactNode } from "react";
import { IconChevron } from "./shared";
import { Glyph, Spot, type SpotKind } from "./fractions/lazy";
import type { GlyphKind } from "./fractions/patterns";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** A link or a button, by what it is given: `href` is a link, `onClick` a button. */
export type Action = { label: string; href?: string; onClick?: () => void };
function Act({ a, className }: { a: Action; className: string }) {
  return a.href ? (
    <a className={className} href={a.href} onClick={a.onClick}>
      {a.label}
    </a>
  ) : (
    <button type="button" className={className} onClick={a.onClick}>
      {a.label}
    </button>
  );
}

/* ---------- the page head ---------- */

/**
 * The top of every page: the title (28/34), one lead sentence (15/24, 640px at most), the page's
 * one Fractions prop at the top right (`art`, a <Prop height={72} on="bg" />, 96px at most), and
 * its actions (`actions`, one filled button at most). `back` only on a page nested under another
 * (a record's sub-page, a step), never on a top-level page.
 */
export function PageHead({ title, lead, back, art, actions, id, className }: { title: ReactNode; lead?: ReactNode; back?: Action; art?: ReactNode; actions?: ReactNode; id?: string; className?: string }) {
  return (
    <header className={cx("page-head", className)}>
      <div className="page-head-main">
        {back ? (
          back.href ? (
            <a className="page-back" href={back.href} onClick={back.onClick}>
              <IconChevron dir="left" /> {back.label}
            </a>
          ) : (
            <button type="button" className="page-back" onClick={back.onClick}>
              <IconChevron dir="left" /> {back.label}
            </button>
          )
        ) : null}
        <h1 className="t-page" id={id}>
          {title}
        </h1>
        {lead ? <p className="page-head-lead">{lead}</p> : null}
      </div>
      {art ? <div className="page-head-art">{art}</div> : null}
      {actions ? <div className="page-head-act">{actions}</div> : null}
    </header>
  );
}

/* ---------- card and callout ---------- */

/** The one card: white, a hairline, 10px corners, 20 by 24 inside. `as` picks the element (a section, a list item). */
export function Card({ as: Tag = "div", className, children, ...rest }: { as?: "div" | "section" | "article" | "li"; className?: string; children: ReactNode } & Record<`aria-${string}`, string | undefined>) {
  return (
    <Tag className={cx("card", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** A note on a tint, no edge: mint for good news and earning, sand for everything else. */
export function Callout({ tone = "mint", className, children, role }: { tone?: "mint" | "sand"; className?: string; children: ReactNode; role?: "status" | "note" }) {
  return (
    <div className={cx("callout", tone === "sand" && "callout-sand", className)} role={role}>
      {children}
    </div>
  );
}

/* ---------- chips ---------- */

/**
 * Four tones and no more. outline: an attribute (a function, a type). pine: the strongest of a
 * scale, or selected. mint: the middle of a scale, or done. ember: solid, for an open role only,
 * once a screen (ember is never a tint).
 */
export type ChipTone = "outline" | "pine" | "mint" | "ember";
const CHIP_CLASS: Record<ChipTone, string> = { outline: "chip", pine: "chip chip-on", mint: "chip chip-volt", ember: "chip chip-ember" };
export function Chip({ tone = "outline", glyph, className, title, children }: { tone?: ChipTone; glyph?: GlyphKind; className?: string; title?: string; children: ReactNode }) {
  return (
    <span className={cx(CHIP_CLASS[tone], className)} title={title}>
      {glyph ? <Glyph name={glyph} size={14} tone="cur" bg={tone === "pine" ? "pine" : tone === "mint" ? "mints" : "white"} /> : null}
      {children}
    </span>
  );
}

/** Crystal Ball's likelihood: High pine, Medium mint, Low outline. */
export type Likelihood = "High" | "Medium" | "Low";
export const LIKELIHOOD_TONE: Record<Likelihood, ChipTone> = { High: "pine", Medium: "mint", Low: "outline" };
export function LikelihoodChip({ band, long }: { band: Likelihood; long?: boolean }) {
  return <Chip tone={LIKELIHOOD_TONE[band]}>{long ? `${band} likelihood` : band}</Chip>;
}

/** How well the member knows someone: one scale, the same spark glyph on each step. Hot pine, Warm mint, Cold outline. */
export type Warmth = "Hot" | "Warm" | "Cold";
export const WARMTH_TONE: Record<Warmth, ChipTone> = { Hot: "pine", Warm: "mint", Cold: "outline" };
export function WarmthChip({ warmth }: { warmth: Warmth }) {
  return (
    <Chip tone={WARMTH_TONE[warmth]} glyph="spark">
      {warmth}
    </Chip>
  );
}

/**
 * A proposal's or a deal's status. Done and good is pine (Signed, Won), moving is mint (Viewed),
 * everything else is an outline (Draft, Sent, Declined, Lost). Never ember: nothing here is an open role.
 */
export type Status = "Draft" | "Sent" | "Viewed" | "Signed" | "Declined" | "Won" | "Lost";
export const STATUS_TONE: Record<Status, ChipTone> = { Draft: "outline", Sent: "outline", Viewed: "mint", Signed: "pine", Declined: "outline", Won: "pine", Lost: "outline" };
export function StatusChip({ status }: { status: Status }) {
  return <Chip tone={STATUS_TONE[status]}>{status}</Chip>;
}

/* ---------- stat ---------- */

/** A number and what it counts: 32/36 in the figures face, a 13/20 label, an optional link under it. Never a filled tile. */
export function Stat({ n, label, link, className }: { n: ReactNode; label: ReactNode; link?: Action; className?: string }) {
  return (
    <div className={cx("stat", className)}>
      <span className="stat-n">{n}</span>
      <span className="stat-l">{label}</span>
      {link ? <Act a={link} className="stat-a" /> : null}
    </div>
  );
}

/* ---------- empty state ---------- */

/**
 * Nothing here yet: a Spot at 128 (its one state), a 17/24 title, 15/24 words that say what will
 * show here and how, and one pine button. `framed` (default) sits it in a card; without, it sits
 * on the page. Every empty, error, offline and expired state uses this.
 */
export function EmptyState({ spot, title, children, action, framed = true, on, ember = true, role, className }: { spot: SpotKind; title: ReactNode; children?: ReactNode; action?: Action; framed?: boolean; on?: "white" | "bg" | "mint"; ember?: boolean; role?: "status" | "alert"; className?: string }) {
  return (
    <div className={cx("empty-state", framed && "card", className)} role={role}>
      <Spot name={spot} size={128} on={on ?? (framed ? "white" : "bg")} ember={ember} />
      <h2 className="t-section">{title}</h2>
      {children ? <p>{children}</p> : null}
      {action ? <Act a={action} className="btn btn-pine" /> : null}
    </div>
  );
}
