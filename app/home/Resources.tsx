import Image from "next/image";
import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs, type Route } from "./content/links";
import "./Resources.css";

/** A card's cover photo from public/home/cards/. `position` is the artboard's object-position; `zoom` its 115% inset crop. */
type Cover = { file: string; width: number; height: number; position?: string; zoom?: boolean };

type Card = { kicker: string; title: string; body: string; cta: string; href: Route; cover: Cover };

const cards: Card[] = [
  {
    kicker: "Rate Index",
    title: "What fractional leaders charge",
    body: "Rates by role, as companies pay them.",
    cta: "Open the index",
    href: hrefs.rateIndex,
    cover: { file: "resource-rates.webp", width: 960, height: 720 },
  },
  {
    kicker: "Case studies",
    title: "What changed when companies hired us",
    body: "Seven engagements and what changed.",
    cta: "Read the case studies",
    href: hrefs.caseStudies,
    cover: { file: "resource-cases.webp", width: 960, height: 540, zoom: true },
  },
  {
    kicker: "Guide",
    title: "Hiring a fractional VP of Sales",
    body: "The screen, the scope and the first 90 days.",
    cta: "Read the guide",
    href: "/guides/hiring-a-fractional-vp-of-sales",
    cover: { file: "resource-guide-vp.webp", width: 504, height: 508, position: "50% 22%" },
  },
  {
    kicker: "Guide",
    title: "Where AI fits in sales",
    body: "Which sales work to hand to AI first.",
    cta: "Read the guide",
    href: "/guides/where-ai-fits-in-sales",
    cover: { file: "resource-guide-ai.webp", width: 960, height: 720 },
  },
];

/** One card is 268px wide at 1440 (four across the 1120 wrap), half the viewport on tablets, full width on phones. */
const COVER_SIZES = "(max-width: 480px) calc(100vw - 40px), (max-width: 900px) calc(50vw - 28px), 268px";

/**
 * Four resource cards and "Explore all resources" (design 4.1 row 16). Each card opens with the
 * canvas's cover image, decorative (alt ""), cropped as the artboard crops it.
 */
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
                <span className={c.cover.zoom ? "resources-cover resources-cover--zoom" : "resources-cover"}>
                  <Image
                    className="resources-img"
                    src={`/home/cards/${c.cover.file}`}
                    alt=""
                    width={c.cover.width}
                    height={c.cover.height}
                    sizes={COVER_SIZES}
                    style={c.cover.position ? { objectPosition: c.cover.position } : undefined}
                  />
                </span>
                <span className="resources-text">
                  <span className="resources-kicker">{c.kicker}</span>
                  <b className="resources-title">{c.title}</b>
                  <span className="resources-body">{c.body}</span>
                  <span className="resources-cta">
                    {c.cta}
                    <Arrow size={13} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
