import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import Arrow from "../home/Arrow";
import ClosingBand from "../home/ClosingBand";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import { GUIDE_COOKIE } from "../guide/unlock";
import { chapterHref, guide } from "../guide/content/guide";
import GuideNav from "../guide/GuideNav";
import { StatRow } from "../guide/GuideBlocks";
import "../home/home.css";
import "../guide/guide.css";

export const metadata: Metadata = {
  title: guide.title,
  description: guide.subtitle,
  alternates: { canonical: `https://revenuenomad.com${guide.path}` },
};

/** Landing page: cover, the six findings, contents (artboard "Cover, findings & contents" of the Report Redesign). */
export default async function GuideLanding() {
  const unlocked = Boolean((await cookies()).get(GUIDE_COOKIE));
  return (
    <>
      <SiteHeader />
      <main id="main" className="gd">
        <section className="gd-cover" aria-labelledby="gd-cover-h">
          <div className="rn-wrap gd-cover-grid">
            <div>
              <p className="rn-eyebrow">{guide.publisher} · First edition</p>
              <h1 id="gd-cover-h" className="gd-title">
                The Fractional GTM <em>Buyer&apos;s Guide</em> 2027<span className="gd-stop">.</span>
              </h1>
              <p className="gd-subtitle">{guide.subtitle}</p>
              <div className="gd-cover-actions">
                <Link className="rn-btn" href={chapterHref("start-here")}>
                  Start reading
                  <Arrow />
                </Link>
                <Link className="rn-link" href={chapterHref("answers")}>
                  The 14 answers
                  <Arrow size={13} />
                </Link>
              </div>
              <p className="gd-byline">
                By <b>Matt Lopez</b>, CEO, Revenue Nomad. {guide.edition}
              </p>
            </div>
            <aside className="gd-cover-side" aria-label="Sources">
              <StatRow
                items={[
                  { v: "$225", l: "Median hourly rate", s: "Rate Index, n=137" },
                  { v: "~14,000", l: "Fractional GTM leaders in the US", s: "central estimate" },
                  { v: "$2.8B", l: "Estimated US fractional GTM billings a year", s: "range $2.2B to $3.6B" },
                  { v: "172", l: "Unique operators", s: "survey, platform and waitlist" },
                ]}
              />
              <p className="gd-sources">
                <b>Sources</b> Operator survey (n=74) · Platform profiles (n=51) · Signed contracts (n=38) · Inbound requests (n=77) ·
                Rate Index (n=137)
              </p>
            </aside>
          </div>
        </section>

        <section className="gd-section rn-band--mist" aria-labelledby="gd-findings-h">
          <div className="rn-wrap">
            <p className="rn-eyebrow">By the numbers</p>
            <h2 id="gd-findings-h" className="gd-h2">
              Six findings that set the frame
            </h2>
            <p className="gd-lede">
              Drawn from 172 unique operators, 38 signed engagement contracts, 77 inbound requests and a 137-rate index of what
              companies pay.
            </p>
            <ul className="gd-findings">
              {[
                { k: "Rate", v: "$225/hr", l: "Median hourly rate for all GTM roles. Middle half $165 to $300.", s: "Rate Index, n=137" },
                { k: "Who buys", v: "62%", l: "of engagements are with $1M to $20M companies.", s: "Operator survey, n=74" },
                { k: "Speed", v: "50%", l: "produced a measurable result inside 30 days.", s: "Operator survey, n=74" },
                { k: "Retention", v: "57%", l: "of engagements extended past the initial term.", s: "Operator survey, n=74" },
                { k: "AI", v: "97%", l: "of operators use AI in delivery; 36% for most of it.", s: "Operator survey, n=74" },
                { k: "Diligence", v: "46%", l: "of clients never asked for a reference.", s: "Operator survey, n=74" },
              ].map((f) => (
                <li key={f.k} className="gd-finding">
                  <p className="rn-eyebrow">{f.k}</p>
                  <p className="gd-finding-v">{f.v}</p>
                  <p className="gd-p">{f.l}</p>
                  <p className="gd-note">{f.s}</p>
                </li>
              ))}
            </ul>
            <blockquote className="gd-quote gd-quote--wide">
              <p>CEOs are not looking for a discount. They are looking for an answer.</p>
              <cite>Matt Lopez, Start here</cite>
            </blockquote>
          </div>
        </section>

        <section className="gd-section" aria-labelledby="gd-toc-h">
          <div className="rn-wrap gd-toc-grid">
            <div>
              <p className="rn-eyebrow">Contents</p>
              <h2 id="gd-toc-h" className="gd-h2">
                Ten chapters, the answers, and the method
              </h2>
              <p className="gd-p">
                Start here, the Answers and Chapter 1 are open with no email. The full guide takes one, and stays open on your
                device.
              </p>
            </div>
            <GuideNav unlocked={unlocked} />
          </div>
        </section>

        <ClosingBand />
      </main>
      <SiteFooter />
    </>
  );
}
