import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs, type Route } from "./content/links";
import "./Solutions.css";

type Outcome = { role: string; title: string; body: string; href: Route };

/** Four outcomes, one problem page each. Copy from the content appendix, section 8. */
const outcomes: Outcome[] = [
  {
    role: "Sales leadership",
    title: "Scaling beyond founder-led sales",
    body: "A sales leader takes sales off the founder’s plate.",
    href: "/problems/founder-led-sales",
  },
  {
    role: "Pipeline",
    title: "Pipeline beyond your network",
    body: "Outbound rebuilt around fewer, better accounts.",
    href: "/problems/pipeline",
  },
  {
    role: "RevOps",
    title: "A forecast the board believes",
    body: "An operations leader makes the number knowable.",
    href: "/problems/forecast",
  },
  {
    role: "AI",
    title: "AI with an ROI",
    body: "A leader who has run one ships it with your team.",
    href: "/problems/ai",
  },
];

/**
 * "Our solutions": four outcome cards, each one link to its problem page, and the
 * Browse operator profiles pill. The artboard's card images are decorative and have no
 * shipped assets, so they are omitted (design 4.1, row 7).
 */
export default function Solutions() {
  return (
    <section className="sol rn-section" aria-labelledby="sol-h">
      <div className="rn-wrap">
        <p className="rn-eyebrow">Our solutions</p>
        <h2 id="sol-h" className="rn-h2 sol-h2">
          Increase <em>Win Rates</em> and Accelerate <em>Growth</em>
        </h2>
        <ul className="sol-grid">
          {outcomes.map((o) => (
            <li key={o.href}>
              <Link className="sol-card" href={o.href} aria-label={`${o.title} - see the solution`}>
                <span className="sol-role">{o.role}</span>
                <h3 className="sol-title">{o.title}</h3>
                <span className="sol-body">{o.body}</span>
                <span className="sol-go">
                  See the solution
                  <Arrow size={13} />
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
