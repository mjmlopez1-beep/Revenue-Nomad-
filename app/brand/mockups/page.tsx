import type { Metadata } from "next";
import Link from "next/link";
import "../brand.css";
import "./mock.css";
import { MOCKUPS } from "./Shell";

export const metadata: Metadata = { title: "Merlin mockups" };

export default function MockupIndex() {
  return (
    <div className="ml mk">
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
          Five pages from the current product, redrawn with the new palette, type and
          illustrations. Structure and wording follow the live app. Names and numbers are
          examples.
        </p>
        <div className="mk-index">
          {MOCKUPS.map((m) => (
            <Link key={m.slug} href={`/brand/mockups/${m.slug}`}>
              <div className="thumb">
                <iframe src={`/brand/mockups/${m.slug}`} title={m.label} tabIndex={-1} loading="lazy" />
              </div>
              <div className="cap">
                <b>{m.label}</b>
                <p>{m.note}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
