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
        {THEMES.map((theme) => (
          <section key={theme} style={{ marginTop: 44 }}>
            <h2 style={{ fontSize: 26 }}>{theme === "color" ? "Color" : "Night"}</h2>
            <p className="mk-dim" style={{ marginTop: 6 }}>
              {theme === "color"
                ? "Ivory pages, a forest rail and the full palette: amethyst, lilac, gold, terracotta and moss."
                : "The dark version: near-black green with lime actions and line-art illustrations."}
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
