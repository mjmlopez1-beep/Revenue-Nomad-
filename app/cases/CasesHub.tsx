import Image from "next/image";
import Link from "next/link";
import Arrow from "../home/Arrow";
import ClosingBand from "../home/ClosingBand";
import { FigureLabel, FigureValue } from "../home/Figure";
import ProblemMotif from "../problems/ProblemMotif";
import { CompanyMark } from "./CasePage";
import { cases, hub } from "./content";
import "../problems/Solution.css";
import "./Cases.css";

/** One card is 363px wide at 1440 (three across the 1120 wrap) and full width on phones. */
const PHOTO_SIZES = "(max-width: 900px) calc(100vw - 40px), 363px";

/**
 * The case studies hub (/case-studies): seven cards in the homepage Outcomes card's language (the figure over
 * the cover, the company, the story), then the pattern across them and the closing band. Prefix cs-.
 */
export default function CasesHub() {
  return (
    <main id="main" className="cs-page">
      <section className="cs-hero cs-hero--hub" aria-labelledby="cs-hub-h">
        <div className="rn-wrap">
          <p className="rn-eyebrow">{hub.eyebrow}</p>
          <h1 id="cs-hub-h" className="rn-h1 cs-h1">
            {hub.title.plain} <em>{hub.title.em}</em>
            <span className="cs-stop">.</span>
          </h1>
          <p className="rn-lede cs-lede">{hub.lede}</p>
        </div>
      </section>

      <section className="cs-section cs-grid-band" aria-label="The seven case studies">
        <div className="rn-wrap">
          <ul className="cs-grid">
            {cases.map((c) => (
              <li key={c.slug}>
                <article className="cs-card" aria-labelledby={`cs-card-${c.slug}`}>
                  <Link className="cs-card-link" href={`/case-studies/${c.slug}`}>
                    <p className="cs-card-metric">
                      {c.photo ? (
                        <Image className="cs-card-photo" src={`/home/cards/${c.photo}`} alt="" width={541} height={328} sizes={PHOTO_SIZES} />
                      ) : (
                        <span className="cs-card-motif" aria-hidden="true">
                          <ProblemMotif motif={c.motif} />
                        </span>
                      )}
                      <span className="cs-card-metric-text">
                        <span className="cs-card-value">{c.figure ? <FigureValue id={c.figure} /> : c.status}</span>
                        <span className="cs-card-metric-l">{c.figure ? <FigureLabel id={c.figure} /> : c.glance[0]?.l}</span>
                      </span>
                    </p>
                    <span className="cs-card-body">
                      <span className="cs-card-co">
                        <CompanyMark c={c} height={22} />
                      </span>
                      <span className="cs-card-sector">{c.sector}</span>
                      <b id={`cs-card-${c.slug}`} className="cs-card-title">
                        {c.title}
                      </b>
                      <span className="cs-card-seat">{c.seat}</span>
                      <span className="cs-card-go">
                        Read the case study
                        <Arrow size={13} />
                      </span>
                    </span>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="cs-section rn-band--forest cs-pattern" aria-labelledby="cs-pattern-h">
        <div className="rn-wrap cs-pattern-grid">
          <div>
            <p className="rn-eyebrow">Across the seven</p>
            <h2 id="cs-pattern-h" className="rn-h2 cs-h2">
              {hub.pattern.title}
            </h2>
            <p className="cs-pattern-stat">
              <FigureValue id="wouldHireAgain" className="cs-pattern-v" />
              <span>
                <FigureLabel id="wouldHireAgain" />
              </span>
            </p>
          </div>
          <ol className="cs-pattern-list">
            {hub.pattern.items.map((it, i) => (
              <li key={it.slice(0, 30)}>
                <span className="cs-pattern-n" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p>{it}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <ClosingBand />
    </main>
  );
}
