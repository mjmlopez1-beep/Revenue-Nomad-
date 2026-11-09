import Image from "next/image";
import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs, type Route } from "./content/links";
import "./Solutions.css";

/** A card's cover photo from public/home/cards/. `position` is the artboard's object-position; `zoom` its 115% inset crop. */
type Cover = { file: string; width: number; height: number; position?: string; zoom?: boolean };

type Outcome = { role: string; title: string; body: string; href: Route; cover: Cover };

/** Four outcomes, one problem page each. Copy from the content appendix, section 8; crops from the artboard. */
const outcomes: Outcome[] = [
  {
    role: "Sales leadership",
    title: "Scaling beyond founder-led sales",
    body: "A sales leader takes sales off the founder’s plate.",
    href: "/problems/founder-led-sales",
    cover: { file: "solution-founder.webp", width: 960, height: 540 },
  },
  {
    role: "Pipeline",
    title: "Pipeline beyond your network",
    body: "Outbound rebuilt around fewer, better accounts.",
    href: "/problems/pipeline",
    cover: { file: "solution-pipeline.webp", width: 960, height: 720, position: "60% 72%" },
  },
  {
    role: "RevOps",
    title: "A forecast the board believes",
    body: "An operations leader makes the number knowable.",
    href: "/problems/forecast",
    cover: { file: "solution-forecast.webp", width: 960, height: 720, zoom: true },
  },
  {
    role: "AI",
    title: "AI with an ROI",
    body: "A leader who has run one ships it with your team.",
    href: "/problems/ai",
    cover: { file: "solution-ai.webp", width: 960, height: 540 },
  },
];

/** One card is 268px wide at 1440 (four across the 1120 wrap), half the viewport on tablets, full width on phones. */
const COVER_SIZES = "(max-width: 480px) calc(100vw - 40px), (max-width: 900px) calc(50vw - 28px), 268px";

/**
 * "Our solutions": four outcome cards, each one link to its problem page, and the
 * Browse operator profiles pill (design 4.1, row 7). Each card opens with the canvas's
 * cover photo, decorative (alt ""), cropped as the artboard crops it.
 */
export default function Solutions() {
  return (
    <section id="solutions" className="sol rn-section" aria-labelledby="sol-h">
      <div className="rn-wrap">
        <p className="rn-eyebrow">Our solutions</p>
        <h2 id="sol-h" className="rn-h2 sol-h2">
          Increase <em>Win Rates</em> and Accelerate <em>Growth</em>
        </h2>
        <ul className="sol-grid">
          {outcomes.map((o) => (
            <li key={o.href}>
              <Link className="sol-card" href={o.href} aria-label={`${o.title} - see the solution`}>
                <span className={o.cover.zoom ? "sol-cover sol-cover--zoom" : "sol-cover"}>
                  <Image
                    className="sol-img"
                    src={`/home/cards/${o.cover.file}`}
                    alt=""
                    width={o.cover.width}
                    height={o.cover.height}
                    sizes={COVER_SIZES}
                    style={o.cover.position ? { objectPosition: o.cover.position } : undefined}
                  />
                </span>
                <span className="sol-text">
                  <span className="sol-role">{o.role}</span>
                  <h3 className="sol-title">{o.title}</h3>
                  <span className="sol-body">{o.body}</span>
                  <span className="sol-go">
                    See the solution
                    <Arrow size={13} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="sol-actions">
          <Link className="rn-btn sol-browse" href={hrefs.browse}>
            Browse operator profiles
            <Arrow size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
