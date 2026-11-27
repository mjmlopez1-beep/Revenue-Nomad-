import type { Metadata } from "next";
import Link from "next/link";
import "../../brand.css";
import "../mock.css";
import { VERSIONS } from "./Network";

export const metadata: Metadata = { title: "My Network: ten versions" };

export default function NetworkIndex() {
  return (
    <div className="ml mk mk-color">
      <div className="mk-land" style={{ paddingBottom: 72 }}>
        <header className="mk-land-nav">
          <Link href="/brand/mockups" className="mk-wordmark">merlin<i>.</i></Link>
        </header>
        <span className="mk-eyebrow">My Network</span>
        <h1 className="mk-h2">Ten ways to bring the line architecture in</h1>
        <p className="mk-dim" style={{ fontSize: 17, marginTop: 12, maxWidth: "42em" }}>
          The same page each time. Each version puts the dark line art in a different place, from
          about a tenth of the screen to about a third.
        </p>
        <div className="mk-index">
          {VERSIONS.map((x) => (
            <Link key={x.v} href={`/brand/mockups/network/${x.v}`}>
              <div className="thumb">
                <iframe src={`/brand/mockups/network/${x.v}`} title={x.name} tabIndex={-1} loading="lazy" />
              </div>
              <div className="cap">
                <b>{x.v}. {x.name}</b> <span className="mk-dim">{x.share}</span>
                <p>{x.note}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
