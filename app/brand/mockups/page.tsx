import type { Metadata } from "next";
import Link from "next/link";
import "../brand.css";
import "./mock.css";
import { MOCKUPS, THEMES } from "./Shell";

export const metadata: Metadata = { title: "Merlin mockups" };

export default function MockupIndex() {
  return (
    <div className="ml mk mk-color">
      <div className="mk-land" style={{ paddingBottom: 72 }}>
        <header className="mk-land-nav">
          <Link href="/brand" className="mk-wordmark">
            merlin<i>.</i>
          </Link>
          <nav>
            <Link href="/brand">Brand library</Link>
          </nav>
        </header>
        <span className="mk-eyebrow">Product mockups</span>
        <h1 className="mk-h2">Merlin in the new brand</h1>
        <p className="mk-dim" style={{ fontSize: 17, marginTop: 12, maxWidth: "40em" }}>
          Five pages from the current product, redrawn in two directions. Structure and wording follow the live app. Names and numbers are
          examples.
        </p>
        <section style={{ marginTop: 44 }}>
          <h2 style={{ fontSize: 26 }}>Adaptation</h2>
          <p className="mk-dim" style={{ marginTop: 6 }}>
            The current site design with about a fifth of the new direction: one pine band of line
            architecture, a saffron path, and violet for the person in between.
          </p>
          <div className="mk-index">
            <Link href="/brand/mockups/adapt/companies">
              <div className="thumb">
                <iframe src="/brand/mockups/adapt/companies" title="Companies, adapted" tabIndex={-1} loading="lazy" />
              </div>
              <div className="cap">
                <b>Companies</b>
                <p>The companies table in the current design system, adapted.</p>
              </div>
            </Link>
            <Link href="/brand/mockups/homepage">
              <div className="thumb">
                <iframe src="/brand/mockups/homepage" title="Homepage redesign" tabIndex={-1} loading="lazy" />
              </div>
              <div className="cap">
                <b>Homepage redesign</b>
                <p>The current design system with the line architecture hero and the path as the page&apos;s spine.</p>
              </div>
            </Link>
            <Link href="/brand/mockups/network">
              <div className="thumb">
                <iframe src="/brand/mockups/network/6" title="My Network" tabIndex={-1} loading="lazy" />
              </div>
              <div className="cap">
                <b>My Network, ten versions</b>
                <p>The line art in a different place each time.</p>
              </div>
            </Link>
            <Link href="/brand/mockups/reimagined/companies">
              <div className="thumb">
                <iframe src="/brand/mockups/reimagined/companies" title="Companies, reimagined" tabIndex={-1} loading="lazy" />
              </div>
              <div className="cap">
                <b>Companies, reimagined</b>
                <p>The list as the architecture: every company is a door, and the path runs to the ones you can reach.</p>
              </div>
            </Link>
          </div>
        </section>
        {THEMES.map((theme) => (
          <section key={theme} style={{ marginTop: 44 }}>
            <h2 style={{ fontSize: 26 }}>{theme === "color" ? "Color" : "Night"}</h2>
            <p className="mk-dim" style={{ marginTop: 6 }}>
              {theme === "color"
                ? "Ivory pages, a forest rail, the full palette and the landscape journey illustrations."
                : "The dark version: line-art architecture with the hooded guide walking the gold path."}
            </p>
            <div className="mk-index">
              {MOCKUPS.map((m) => (
                <Link key={m.slug} href={`/brand/mockups/${theme}/${m.slug}`}>
                  <div className="thumb">
                    <iframe src={`/brand/mockups/${theme}/${m.slug}`} title={`${m.label}, ${theme}`} tabIndex={-1} loading="lazy" />
                  </div>
                  <div className="cap">
                    <b>{m.label}</b>
                    <p>{m.note}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
