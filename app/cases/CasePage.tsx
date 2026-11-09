import Image from "next/image";
import Link from "next/link";
import { pillarLabel, pillars as allPillars } from "../check/content";
import Arrow from "../home/Arrow";
import ClosingBand from "../home/ClosingBand";
import { FigureSource, FigureValue } from "../home/Figure";
import { colorLogos, logos } from "../home/content/logos";
import ProblemMotif, { motifCaption } from "../problems/ProblemMotif";
import type { CaseStudy, Outcome } from "./content";
import "../problems/Solution.css";
import "./Cases.css";

const two = (n: number) => String(n).padStart(2, "0");

/** The company's mark: the color logo where one exists, else the monochrome marquee logo, else the name. */
export function CompanyMark({ c, height = 26, light }: { c: CaseStudy; height?: number; light?: boolean }) {
  const color = c.logo ? colorLogos[c.logo] : undefined;
  const mono = logos.find((l) => l.name === c.company && l.file);
  const pick = color ? { src: `/home/logos/${color.file}`, w: color.width, h: color.height } : mono?.file ? { src: `/home/logos/${mono.file}`, w: mono.width!, h: mono.height! } : null;
  if (!pick) return <span className={light ? "cs-mark-name cs-mark-name--light" : "cs-mark-name"}>{c.company}</span>;
  return <Image className={light && !color ? "cs-mark cs-mark--light" : "cs-mark"} src={pick.src} alt={c.company} width={pick.w} height={pick.h} style={{ height, width: "auto" }} />;
}

function Check() {
  return (
    <span className="cs-check" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 6.5l2.2 2.2L9.5 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function OutcomeText({ o }: { o: Outcome }) {
  if (typeof o === "string") return <>{o}</>;
  return (
    <>
      {o.t}
      <sup className="rn-badge" title="Shown publicly only with the client's permission. See app/cases/content.ts.">
        confirm
      </sup>
    </>
  );
}

/**
 * One case study (/case-studies/<slug>): a text-led hero with the headline figure, the at-a-glance row, the
 * situation, what we did (talent and scope), what changed on the night band with the problem's drawing, the
 * client's words, the Diagnostic pillars it touched, and where to read next. Prefix cs-; tokens only (Cases.css).
 */
export default function CasePage({ c, others }: { c: CaseStudy; others: CaseStudy[] }) {
  return (
    <main id="main" className="cs-page">
      <section className="cs-hero" aria-labelledby="cs-h">
        <div className="rn-wrap cs-hero-grid">
          <div className="cs-hero-copy">
            <p className="rn-eyebrow">Case study - {c.sector}</p>
            <h1 id="cs-h" className="rn-h1 cs-h1">
              {c.title}
              <span className="cs-stop">.</span>
            </h1>
            <p className="rn-lede cs-lede">{c.lede}</p>
            <dl className="cs-meta">
              <div>
                <dt>Company</dt>
                <dd>
                  <CompanyMark c={c} height={24} />
                </dd>
              </div>
              <div>
                <dt>Seat</dt>
                <dd>{c.seat}</dd>
              </div>
              <div>
                <dt>Engagement</dt>
                <dd>{c.engagement}</dd>
              </div>
              <div>
                <dt>The problem</dt>
                <dd>
                  <Link className="rn-link" href={c.problem.href}>
                    {c.problem.label}
                  </Link>
                </dd>
              </div>
            </dl>
          </div>
          <aside className="cs-figure" aria-label="The headline result">
            <p className="cs-figure-k">The result</p>
            {c.figure ? (
              <>
                <p className="cs-figure-v">
                  <FigureValue id={c.figure} />
                </p>
                <p className="cs-figure-l">{c.glance[0]?.l}</p>
                <p className="rn-small cs-figure-s">
                  <FigureSource id={c.figure} />
                </p>
              </>
            ) : (
              <>
                <p className="cs-figure-v">{c.status}</p>
                <p className="cs-figure-l">{c.glance[0]?.l}</p>
              </>
            )}
          </aside>
        </div>
      </section>

      <section className="cs-glance" aria-label="At a glance">
        <div className="rn-wrap">
          <ul className="cs-glance-list">
            {c.glance.map((g) => (
              <li key={g.l}>
                <b>{g.id ? <FigureValue id={g.id} /> : g.v}</b>
                <span>{g.l}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="cs-section" aria-labelledby="cs-situation-h">
        <div className="rn-wrap cs-two">
          <div>
            <p className="rn-eyebrow">The situation</p>
            <h2 id="cs-situation-h" className="rn-h2 cs-h2">
              Where it started
            </h2>
          </div>
          <div className="cs-prose">
            {c.situation.map((p) => (
              <p key={p.slice(0, 40)} className="rn-body">
                {p}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="cs-section rn-band--mist" aria-labelledby="cs-did-h">
        <div className="rn-wrap">
          <p className="rn-eyebrow">What we did</p>
          <h2 id="cs-did-h" className="rn-h2 cs-h2">
            The seat, and the work
          </h2>
          <div className="cs-did">
            <div className="cs-talent">
              <h3>Talent deployed</h3>
              <ul>
                {c.talent.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <ol className="cs-scope">
              {c.scope.map((s, i) => (
                <li key={s.slice(0, 40)}>
                  <span className="cs-scope-n" aria-hidden="true">
                    {two(i + 1)}
                  </span>
                  <p className="rn-body">{s}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="cs-section rn-band--dark cs-changed" aria-labelledby="cs-changed-h">
        <div className="rn-wrap cs-changed-grid">
          <div>
            <p className="rn-eyebrow cs-eyebrow-gold">What changed</p>
            <h2 id="cs-changed-h" className="rn-h2 cs-h2">
              What the company has now
            </h2>
            <ul className="cs-outcomes">
              {c.changed.map((o) => (
                <li key={typeof o === "string" ? o : o.t}>
                  <Check />
                  <span>
                    <OutcomeText o={o} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="rn-small cs-basis">Basis: {c.basis}</p>
          </div>
          <figure className="cs-art">
            <ProblemMotif motif={c.motif} />
            <figcaption className="cs-art-cap">
              <span className="cs-art-k">The problem, drawn</span>
              <span>{motifCaption(c.motif)}</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {c.quote && (
        <section className="cs-section" aria-labelledby="cs-quote-h">
          <div className="rn-wrap">
            <h2 id="cs-quote-h" className="rn-sr-only">
              In their words
            </h2>
            <figure className="cs-quote">
              <blockquote>
                <p>“{c.quote.text}”</p>
              </blockquote>
              <figcaption>
                <b>{c.quote.by}</b>
                <span>{c.quote.title}</span>
                <CompanyMark c={c} height={22} />
              </figcaption>
            </figure>
          </div>
        </section>
      )}

      <section className="cs-section cs-pillars-band" aria-labelledby="cs-pillars-h">
        <div className="rn-wrap">
          <div className="solp-pillars cs-pillars">
            <h2 id="cs-pillars-h" className="rn-eyebrow cs-pillars-h">
              Pillars this touched
            </h2>
            <ul className="solp-pillar-list">
              {c.pillars.map((p) => (
                <li key={p}>
                  <Link className="solp-pillar" href="/revenue-health-diagnostic">
                    <span className="solp-pillar-n" aria-hidden="true">
                      {two(allPillars.indexOf(p) + 1)}
                    </span>
                    <span className="rn-sr-only">Pillar {allPillars.indexOf(p) + 1} of 7, </span>
                    {pillarLabel[p]}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="rn-small solp-pillars-line">Of the seven pillars the Revenue Health Diagnostic scores.</p>
          </div>
        </div>
      </section>

      <section className="cs-section rn-band--mist" aria-labelledby="cs-next-h">
        <div className="rn-wrap">
          <h2 id="cs-next-h" className="rn-h2 cs-h2">
            Keep reading
          </h2>
          <ul className="cs-next">
            <li>
              <Link className="cs-next-card" href={c.problem.href}>
                <span className="cs-next-k">The problem</span>
                <b>{c.problem.label}</b>
                <span className="cs-next-go">
                  See the solution
                  <Arrow size={13} />
                </span>
              </Link>
            </li>
            <li>
              <Link className="cs-next-card" href={c.role.href}>
                <span className="cs-next-k">The seat</span>
                <b>{c.role.label}</b>
                <span className="cs-next-go">
                  What one does and costs
                  <Arrow size={13} />
                </span>
              </Link>
            </li>
            {others.slice(0, 1).map((o) => (
              <li key={o.slug}>
                <Link className="cs-next-card" href={`/case-studies/${o.slug}`}>
                  <span className="cs-next-k">Next case study</span>
                  <b>{o.company}</b>
                  <span className="cs-next-go">
                    {o.title}
                    <Arrow size={13} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="cs-all">
            <Link className="rn-link" href="/case-studies">
              All seven case studies
              <Arrow size={13} />
            </Link>
          </p>
        </div>
      </section>

      <ClosingBand />
    </main>
  );
}
