import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs } from "./content/links";
import type { NumberKey } from "./content/numbers";
import { FigureLabel, FigureSource, FigureValue, FlagIf } from "./Figure";
import "./Outcomes.css";

type Study = {
  id: string;
  figure: NumberKey;
  company: string;
  sector: string;
  before: string;
  after: string;
  quote?: { text: string; by: string };
};

const studies: Study[] = [
  {
    id: "myhr",
    figure: "outcomeMyHr",
    company: "myHR Partner",
    sector: "Outsourced HR, 10 to 800 employees",
    before: "A growing firm with no revenue leader - no comp plan, no pricing model, no forecast.",
    after: "A sales engine built around it. Bigger deals, an AE beating quota and the largest new contract in two years.",
    quote: {
      text: "Knowledgeable, responsive, and provided transformative insights and actions to help our growing sales org.",
      by: "Eric B., Account Executive",
    },
  },
  {
    id: "growpro",
    figure: "outcomeGrowPro",
    company: "Grow Pro Agency",
    sector: "Growth agency for dance studios",
    before: "The founder was stepping out of the sales seat to run the company.",
    after: "A team that kept selling without him. The strongest June since 2021, and the company expanded the engagement by 75%.",
  },
  {
    id: "practice",
    figure: "outcomePracticePromotions",
    company: "Practice Promotions",
    sector: "Healthcare practice marketing, $9M+ revenue",
    before: "Conversion on qualified calls had halved and outbound had never worked.",
    after: "A rebuilt sales process and a new outbound team. Two SDRs hired and training, the first AE hire underway.",
    quote: {
      text: "I do feel 100% confident that Jeff was the right choice for what we needed at this stage of the game.",
      by: "Neil Trickett, PT, CEO",
    },
  },
];

/** Section 13: Outcomes. Three case-study cards with metric, before, after, quote, source and link. */
export default function Outcomes() {
  return (
    <section className="out rn-section" aria-labelledby="out-h">
      <div className="rn-wrap">
        <div className="out-head">
          <div>
            <p className="rn-eyebrow">What changed</p>
            <h2 id="out-h" className="rn-h2 out-h">
              Outcomes
            </h2>
          </div>
          <Link className="rn-link out-all" href={hrefs.caseStudies}>
            Read all seven case studies
            <Arrow size={13} />
          </Link>
        </div>

        <ul className="out-grid">
          {studies.map((s) => (
            <li key={s.id}>
              <article className="out-card" aria-labelledby={`out-${s.id}-h`}>
                <p className="out-metric">
                  <FigureValue id={s.figure} className="out-value" />
                  <span className="out-metric-l">
                    <FigureLabel id={s.figure} />
                  </span>
                </p>
                <div className="out-body">
                  <h3 id={`out-${s.id}-h`} className="out-co">
                    {s.company}
                  </h3>
                  <p className="out-sector">{s.sector}</p>
                  <dl className="out-ba">
                    <div>
                      <dt className="out-ba-k">Before</dt>
                      <dd className="out-ba-v out-ba-v--before">{s.before}</dd>
                    </div>
                    <div>
                      <dt className="out-ba-k out-ba-k--after">After</dt>
                      <dd className="out-ba-v">{s.after}</dd>
                    </div>
                  </dl>
                  <div className="out-foot">
                    {s.quote && (
                      <figure className="out-quote">
                        <blockquote>
                          <p>&ldquo;{s.quote.text}&rdquo;</p>
                        </blockquote>
                        <figcaption>{s.quote.by}</figcaption>
                      </figure>
                    )}
                    <p className="out-src">
                      <FigureSource id={s.figure} />
                    </p>
                    <Link className="rn-link out-more" href={hrefs.caseStudies}>
                      Read the case study
                      <span className="rn-sr-only">: {s.company}</span>
                      <Arrow size={13} />
                    </Link>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>

        <p className="out-close">
          <FlagIf id="wouldHireAgain">Every company that reviewed its operator said it would hire them again.</FlagIf>
        </p>
      </div>
    </section>
  );
}
