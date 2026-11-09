import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs, type Route } from "./content/links";
import "./Resources.css";

type Card = { kicker: string; title: string; body: string; cta: string; href: Route };

const cards: Card[] = [
  {
    kicker: "Rate Index",
    title: "What fractional leaders charge",
    body: "Rates by role, as companies pay them.",
    cta: "Open the index",
    href: hrefs.rateIndex,
  },
  {
    kicker: "Case studies",
    title: "What changed when companies hired us",
    body: "Seven engagements and what changed.",
    cta: "Read the case studies",
    href: hrefs.caseStudies,
  },
  {
    kicker: "Guide",
    title: "Hiring a fractional VP of Sales",
    body: "The screen, the scope and the first 90 days.",
    cta: "Read the guide",
    href: "/guides/hiring-a-fractional-vp-of-sales",
  },
  {
    kicker: "Guide",
    title: "Where AI fits in sales",
    body: "Which sales work to hand to AI first.",
    cta: "Read the guide",
    href: "/guides/where-ai-fits-in-sales",
  },
];

/** Four resource cards and "Explore all resources" (design 4.1 row 16). Card images are omitted until assets exist. */
export default function Resources() {
  return (
    <section className="resources" aria-labelledby="resources-h">
      <div className="rn-wrap">
        <div className="resources-head">
          <div>
            <p className="rn-eyebrow">Resources</p>
            <h2 id="resources-h" className="rn-h2 resources-h">
              Guides and insights for companies prioritizing growth
            </h2>
          </div>
          <div className="resources-intro">
            <p className="rn-body resources-lede">
              Rates, results and hiring guides drawn from our own engagements and our 2026 operator survey.
            </p>
            <Link className="rn-link resources-all" href="/resources">
              Explore all resources
              <Arrow size={13} />
            </Link>
          </div>
        </div>
        <ul className="resources-grid">
          {cards.map((c) => (
            <li key={c.href}>
              <Link className="resources-card" href={c.href}>
                <span className="resources-kicker">{c.kicker}</span>
                <b className="resources-title">{c.title}</b>
                <span className="resources-body">{c.body}</span>
                <span className="resources-cta">
                  {c.cta}
                  <Arrow size={13} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
