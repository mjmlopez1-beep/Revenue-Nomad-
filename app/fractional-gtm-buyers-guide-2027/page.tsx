import type { Metadata } from "next";
import { guideFonts } from "../guide/fonts";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import rateIndex from "@/data/rate-index.json";
import Arrow from "../home/Arrow";
import ClosingBand from "../home/ClosingBand";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import { GUIDE_COOKIE } from "../guide/unlock";
import { chapterHref, guide } from "../guide/content/guide";
import GuideNav from "../guide/GuideNav";
import { StatRow } from "../guide/GuideBlocks";
import * as f from "../guide/content/figures";
import "../home/home.css";
import "../guide/guide.css";

export const metadata: Metadata = {
  title: guide.title,
  description: guide.subtitle,
  alternates: { canonical: `https://revenuenomad.com${guide.path}` },
};

/** The rate card's range bar: the middle half of the market on a scale that ends where the senior tier starts. */
const scale = rateIndex.rates.all.topTier.floor;
const pctOf = (n: number) => Math.round((n / scale) * 100);
const rangeLeft = pctOf(rateIndex.rates.all.p25);
const rangeWidth = pctOf(rateIndex.rates.all.p75) - rangeLeft;
const medianAt = pctOf(rateIndex.rates.all.median);

type Finding = { k: string; v: string; l: React.ReactNode; s: string; bar?: number; tone?: "ink" | "coral"; segments?: [number, number] };

/** Landing page: cover, the six findings, contents (artboard "Cover, findings & contents" of the Report Redesign). */
export default async function GuideLanding() {
  const unlocked = Boolean((await cookies()).get(GUIDE_COOKIE));
  const under30 = f.ttr("Under 30 days").share;
  const findings: Finding[] = [
    {
      k: "Rate",
      v: `${f.rates.median}`,
      l: "Median hourly rate for all GTM roles",
      s: `Rate Index, n=${f.rates.n}`,
      tone: "ink",
    },
    {
      k: "Who buys",
      v: f.pct(f.coreShare),
      bar: f.coreShare,
      l: (
        <>
          of engagements are with <strong>$1M to $20M</strong> companies
        </>
      ),
      s: `Operator survey, n=${f.survey.detailed}`,
    },
    {
      k: "Speed",
      v: f.pct(under30),
      bar: under30,
      l: (
        <>
          produced a measurable result <strong>inside 30 days</strong>
        </>
      ),
      s: `Operator survey, n=${f.survey.detailed}`,
    },
    {
      k: "Retention",
      v: f.pct(f.engagements.extendedShare),
      bar: f.engagements.extendedShare,
      l: (
        <>
          of engagements <strong>extended past</strong> the initial term
        </>
      ),
      s: `Operator survey, n=${f.survey.detailed}`,
    },
    {
      k: "AI",
      v: f.pct(f.survey.aiUse.share),
      segments: [f.survey.aiUse.most, f.survey.aiUse.share - f.survey.aiUse.most],
      l: (
        <>
          of operators use AI in delivery, <strong>{f.survey.aiUse.most}% for most of it</strong>
        </>
      ),
      s: `Operator survey, n=${f.survey.aiUse.n}`,
    },
    {
      k: "Diligence",
      v: f.pct(f.survey.reference.neverAsked),
      bar: f.survey.reference.neverAsked,
      tone: "coral",
      l: (
        <>
          of clients <strong>never asked for a reference</strong>
        </>
      ),
      s: `Operator survey, n=${f.survey.detailed}`,
    },
  ];

  return (
    <>
      <SiteHeader />
      <main id="main" className={`gd ${guideFonts}`}>
        <section className="gd-cover" aria-labelledby="gd-cover-h">
          <div className="rn-wrap">
            <p className="gd-cover-kicker">
              <span className="gd-pill">First edition</span>
              <span>{guide.publisher}</span>
            </p>
            <div className="gd-cover-grid">
              <h1 id="gd-cover-h" className="gd-title">
                The Fractional GTM Buyer&apos;s Guide <span className="gd-title-year">2027</span>
              </h1>
              <Image
                className="gd-cover-book"
                src="/home/buyers-guide-book.webp"
                alt="The guide as a printed book, standing beside an open copy showing the rates chapter"
                width={1200}
                height={734}
                sizes="(max-width: 900px) calc(100vw - 40px), 440px"
                priority
              />
            </div>
            <div className="gd-cover-row">
              <p className="gd-subtitle">
                {guide.subtitle.replace(/\.$/, "")}
                <span className="gd-stop">.</span>
              </p>
              <div className="gd-cover-actions">
                <div className="gd-cover-btns">
                  <Link className="gd-btn" href={chapterHref("start-here")}>
                    Start reading
                    <Arrow />
                  </Link>
                  <Link className="gd-btn gd-btn--outline" href={chapterHref("answers")}>
                    The 14 answers
                  </Link>
                </div>
                <p className="gd-byline">
                  By <b>Matt Lopez</b>, CEO, Revenue Nomad. {guide.edition}
                </p>
              </div>
            </div>
            <StatRow
              variant="strip"
              items={[
                { v: f.rates.median, l: `Median hourly rate (n=${f.rates.n})`, tone: "forest" },
                { v: "~14,000", l: "Fractional GTM leaders in the US (central estimate)" },
                { v: f.marketSpend.central, l: `Estimated US fractional GTM billings a year (range ${f.marketSpend.range})` },
                { v: f.headline.operators, l: "Unique operators across the survey, platform and waitlist" },
              ]}
            />
          </div>
        </section>

        <aside className="gd-sources" aria-label="Sources">
          <div className="rn-wrap gd-sources-in">
            <span className="gd-sources-k">Sources</span>
            <span>Operator survey (n={f.headline.survey})</span>
            <span>Platform profiles (n={f.headline.profiles})</span>
            <span>Signed contracts (n={f.headline.contracts})</span>
            <span>Inbound requests (n={f.headline.inbound})</span>
            <span>Rate Index (n={f.rates.n})</span>
            <span>Data as of {f.asOf.long}</span>
          </div>
        </aside>

        <section className="gd-section" aria-labelledby="gd-findings-h">
          <div className="rn-wrap">
            <div className="gd-sechead">
              <div>
                <p className="gd-eyebrow gd-eyebrow--forest">By the numbers</p>
                <h2 id="gd-findings-h" className="gd-h2 gd-h2--big">
                  Six findings that set the frame
                </h2>
              </div>
              <p className="gd-sechead-p">
                Drawn from {f.headline.operators} unique operators, {f.headline.contracts} signed engagement contracts, {f.headline.inbound} inbound
                requests and a {f.rates.n}-rate index of what companies pay.
              </p>
            </div>
            <ul className="gd-findings">
              {findings.map((x) => (
                <li key={x.k} className={`gd-finding${x.tone ? ` gd-finding--${x.tone}` : ""}`}>
                  <p className="gd-finding-k">{x.k}</p>
                  <p className="gd-finding-v">
                    {x.v}
                    {x.k === "Rate" && <span className="gd-finding-unit"> /hr</span>}
                  </p>
                  <div className="gd-finding-foot">
                    {x.k === "Rate" ? (
                      <>
                        <span className="gd-range" aria-hidden="true">
                          <span className="gd-range-fill" style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }} />
                          <span className="gd-range-mark" style={{ left: `${medianAt}%` }} />
                        </span>
                        <span className="gd-range-l">
                          <span>Middle half {f.rates.middleHalf}</span>
                          <span>n={f.rates.n}</span>
                        </span>
                      </>
                    ) : (
                      <span className="gd-meter" aria-hidden="true">
                        {x.segments ? (
                          <>
                            <span className="gd-meter-fill" style={{ width: `${x.segments[0]}%` }} />
                            <span className="gd-meter-fill gd-meter-fill--2" style={{ width: `${x.segments[1]}%` }} />
                          </>
                        ) : (
                          <span className="gd-meter-fill" style={{ width: `${x.bar}%` }} />
                        )}
                      </span>
                    )}
                    <p className="gd-finding-l">{x.l}</p>
                    <p className="gd-finding-s">{x.s}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="gd-quoteband" aria-label="Pull quote">
          <div className="rn-wrap">
            <blockquote className="gd-quote gd-quote--band">
              <svg className="gd-quote-mark" width="44" height="34" viewBox="0 0 44 34" aria-hidden="true">
                <path d="M0 34V20C0 8 6 1.5 17 0l1.6 4.6C12.4 6.6 9.6 10.6 9.4 16H18v18H0Zm26 0V20C26 8 32 1.5 43 0l1 4.6C38 6.6 35.6 10.6 35.4 16H44v18H26Z" fill="currentColor" />
              </svg>
              <p>CEOs are not looking for a discount. They are looking for an answer.</p>
              <cite>Matt Lopez, Start here</cite>
            </blockquote>
          </div>
        </section>

        <section className="gd-section" aria-labelledby="gd-toc-h">
          <div className="rn-wrap">
            <div className="gd-sechead">
              <div>
                <p className="gd-eyebrow gd-eyebrow--forest">Contents</p>
                <h2 id="gd-toc-h" className="gd-h2 gd-h2--big">
                  Ten chapters, the answers, and the method
                </h2>
              </div>
              <p className="gd-sechead-p">
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
