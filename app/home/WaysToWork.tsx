import Link from "next/link";
import Arrow from "./Arrow";
import type { Route } from "./content/links";
import { facts } from "./content/numbers";
import "./WaysToWork.css";

type Model = { term: string; title: string; body: React.ReactNode; bestWhen: string; href: Route };

/** Four engagement models. Copy from the content appendix, section 9. No prices here. */
const models: Model[] = [
  {
    term: "30 to 60 days",
    title: "Revenue Health Diagnostic",
    body: (
      <>
        A scored read of all {facts.buildingBlocks} building blocks, a day-30 readout and a roadmap your CEO and CFO can
        defend to the board.
      </>
    ),
    bestWhen: "you cannot yet say what is broken.",
    href: "/engage/diagnostic",
  },
  {
    term: "1 to 3 days a week",
    title: "Monthly fractional leadership",
    body: (
      <>
        A senior leader on your team on a first term of {facts.firstTerm}, then {facts.noticePeriod} notice. Hours flex
        with the work.
      </>
    ),
    bestWhen: "you need the function run, not just advised.",
    href: "/engage/fractional",
  },
  {
    term: "For the gap",
    title: "Interim cover",
    body: "An interim head of sales in the seat within weeks, running the team and the forecast while you search.",
    bestWhen: "your leader left and the number did not.",
    href: "/engage/interim",
  },
  {
    term: "Decide at day 90",
    title: "Fractional to full time",
    body: "Hire the leader you have already seen work, with the conversion terms agreed from day one.",
    bestWhen: "you want to see the work before you commit.",
    href: "/engage/full-time",
  },
];

/**
 * "Ways to work with us": the forest band with four engagement models (design 4.1, row 8).
 * Each card: term eyebrow, title, body, a "Best when" line and a "How it works" link.
 */
export default function WaysToWork() {
  return (
    <section className="ways rn-section rn-band--forest" aria-labelledby="ways-h">
      <div className="rn-wrap">
        <p className="rn-eyebrow">Ways to work with us</p>
        <h2 id="ways-h" className="rn-h2 ways-h2">
          Start <em>where you are</em>
        </h2>
        <p className="rn-lede ways-lede">
          Four ways in, from a scored read to a leader you can hire full time. Scope, hours and rate are in writing
          before anyone starts.
        </p>
        <ul className="ways-grid">
          {models.map((m) => (
            <li key={m.href} className="ways-card">
              <span className="ways-term">{m.term}</span>
              <h3 className="ways-title">{m.title}</h3>
              <p className="ways-body">{m.body}</p>
              <p className="ways-best">
                <b>Best when</b> - {m.bestWhen}
              </p>
              <span className="ways-more">
                <Link className="ways-link" href={m.href}>
                  How it works
                  <span className="rn-sr-only">: {m.title}</span>
                  <Arrow size={13} />
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
