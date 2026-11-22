/**
 * The look the public Privacy Policy (app/privacy) and Terms of Service (app/terms) share: the
 * claim and data pages' top bar and card (app/claim/claim.css, app/data/data.css), a line with the
 * effective date and version, a short contents list, and links to the other public pages. Phone
 * first. Not a route: app/legal has no page. Its styles are imported by each page.tsx (app/legal/styles.ts),
 * so the checks can import this file.
 */
import type { ReactNode } from "react";
import { Brand } from "../ui/shared";

/** The day both documents took effect (ISO) and how it reads. Bump the versions with any change. */
export const LEGAL_EFFECTIVE = "2026-11-22";
export const LEGAL_EFFECTIVE_WORDS = "November 22, 2026";
export const PRIVACY_VERSION = "1.2";
export const TERMS_VERSION = "1.1";

/** Where people write to Revenue Nomad: RN_SUPPORT_EMAIL, read when the page is served. Null when it isn't set. */
export function supportAddress(): string | null {
  const v = String(process.env.RN_SUPPORT_EMAIL ?? "").trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v) ? v : null;
}

/** "Write to us at support@..." or, with no address set, the way the data page says it. */
export function ContactLine({ support, subject }: { support: string | null; subject: string }) {
  return support ? (
    <>
      Write to us at <a href={`mailto:${support}?subject=${encodeURIComponent(subject)}`}>{support}</a>.
    </>
  ) : (
    <>
      Write to us from <a href="https://revenuenomad.com">revenuenomad.com</a>.
    </>
  );
}

export type Part = { id: string; title: string; body: ReactNode };

export function LegalShell({ title, version, intro, parts, other }: { title: string; version: string; intro: ReactNode; parts: Part[]; other: { href: string; label: string } }) {
  return (
    <div className="cl">
      <header className="cl-top">
        <a className="cl-brand" href="/" aria-label="Merlin, by Revenue Nomad">
          <Brand dark size={36} />
        </a>
      </header>
      <main className="cl-main df-main">
        <article className="cl-card df-card lg-card">
          <h1 className="cl-h">{title}</h1>
          <p className="lg-meta">
            Effective <time dateTime={LEGAL_EFFECTIVE}>{LEGAL_EFFECTIVE_WORDS}</time> · Version {version}
          </p>
          {intro}
          <nav className="lg-toc" aria-label="On this page">
            <ol>
              {parts.map((p) => (
                <li key={p.id}>
                  <a href={`#${p.id}`}>{p.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          {parts.map((p) => (
            <section key={p.id} className="df-sec lg-sec" id={p.id} aria-labelledby={`${p.id}-h`}>
              <h2 className="df-h" id={`${p.id}-h`}>
                {p.title}
              </h2>
              {p.body}
            </section>
          ))}
          <nav className="lg-foot" aria-label="Merlin's public pages">
            <a href={other.href}>{other.label}</a>
            <a href="/data">Where your data goes</a>
            <a href="/remove">Remove my name</a>
            <a href="/">Open Merlin</a>
          </nav>
        </article>
      </main>
    </div>
  );
}
