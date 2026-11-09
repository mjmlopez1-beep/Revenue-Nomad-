import Link from "next/link";
import Arrow from "../home/Arrow";
import ClosingBand from "../home/ClosingBand";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import { hrefs } from "../home/content/links";
import { facts, showUnverified } from "../home/content/numbers";
import { pillars } from "../check/content";
import BlocksGrid from "./BlocksGrid";
import MethodDiagram from "./MethodDiagram";
import Roadmap from "./Roadmap";
import ScoresChart from "./ScoresChart";
import { after, analyze, blockCount, compare, faq, get, governance, hero, model, roadmap, runs, start } from "./content";
import "../home/home.css";
import "./Diagnostic.css";

/**
 * The Revenue Health Diagnostic page (artboard "AssessmentPage" and its phone twin), the most visual page on the
 * site: the method diagram, the 21 blocks, the scores chart, the sample roadmap and the five-step timeline.
 * Prefix dx-; tokens only (Diagnostic.css).
 */
export default function DiagnosticPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="dx-page">
        <Hero />
        <Start />
        <Model />
        <Analyze />
        <Runs />
        <Get />
        <RoadmapSection />
        <Compare />
        <Governance />
        <After />
        <Faq />
        <ClosingBand />
      </main>
      <SiteFooter />
    </>
  );
}

/* ---------- small parts ---------- */

function SectionHead({ id, eyebrow, title, intro, light }: { id: string; eyebrow?: string; title: string; intro?: string; light?: boolean }) {
  return (
    <>
      {eyebrow && <p className="rn-eyebrow">{eyebrow}</p>}
      <h2 id={id} className={eyebrow ? "rn-h2 dx-h2 dx-h2--after-eyebrow" : "rn-h2 dx-h2"}>
        {title}
      </h2>
      {intro && <p className={light ? "rn-lede dx-intro dx-intro--light" : "rn-lede dx-intro"}>{intro}</p>}
    </>
  );
}

function Check() {
  return (
    <span className="dx-check" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 6.5l2.2 2.2L9.5 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Plus() {
  return (
    <svg className="dx-plus" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.5v11M1.5 7h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A figure with no column in the research data and no entry in numbers.ts yet (the case study's own numbers).
 * Same contract as Figure.tsx's FlagIf: data-unverified always, the "confirm" badge outside production, so
 * check-home blocks a production build until the founder confirms it or it moves into numbers.ts.
 */
function Unconfirmed({ children }: { children: React.ReactNode }) {
  return (
    <div data-unverified="" className="dx-unconfirmed">
      {children}
      {showUnverified && (
        <sup className="rn-badge" title="Not yet confirmed by the founder. Case study figures; see numbers.ts.">
          confirm
        </sup>
      )}
    </div>
  );
}

const withDays = (s: string) => s.replace("{daysPerWeek}", facts.daysPerWeek);

/* ---------- sections ---------- */

function Hero() {
  return (
    <section className="dx-hero" aria-labelledby="dx-hero-h">
      <div className="rn-wrap dx-hero-inner">
        <span className="dx-hero-glow" aria-hidden="true" />
        <p className="rn-eyebrow">{hero.eyebrow}</p>
        <h1 id="dx-hero-h" className="rn-h1 dx-h1">
          {hero.h1.plain} <em>{hero.h1.em}</em>
          <span className="dx-stop">.</span>
        </h1>
        <p className="rn-lede dx-lede">{hero.lede}</p>
        <div className="dx-actions">
          <Link className="rn-btn" href={hrefs.talk}>
            {hero.primary}
            <Arrow />
          </Link>
          <a className="rn-btn rn-btn--ghost" href="#dx-get-h">
            {hero.secondary}
          </a>
          <p className="dx-hero-scope">
            <b>
              {pillars.length} pillars · {blockCount} building blocks
            </b>{" "}
            - {hero.scopeNote}
          </p>
        </div>
        <p className="dx-hero-check">
          <Link className="rn-link dx-hero-check-link" href={hrefs.check}>
            {hero.checkFirst}
            <Arrow size={13} />
          </Link>
        </p>
      </div>
    </section>
  );
}

function Start() {
  return (
    <section className="rn-section" aria-labelledby="dx-start-h">
      <div className="rn-wrap">
        <SectionHead id="dx-start-h" title={start.title} intro={start.intro} />
        <ul className="dx-cards dx-cards--4">
          {start.cards.map((c) => (
            <li key={c.title} className="dx-card">
              <h3>{c.title}</h3>
              <p className="rn-body">{c.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Model() {
  return (
    <section className="rn-section rn-band--mist dx-model" aria-labelledby="dx-model-h">
      <div className="rn-wrap">
        <SectionHead id="dx-model-h" eyebrow={model.eyebrow} title={model.title} intro={model.intro} />
        <MethodDiagram />
        <BlocksGrid />
      </div>
    </section>
  );
}

function Analyze() {
  return (
    <section className="rn-section" aria-labelledby="dx-analyze-h">
      <div className="rn-wrap">
        <SectionHead id="dx-analyze-h" eyebrow={analyze.eyebrow} title={analyze.title} intro={analyze.intro} />
        <div className="dx-lenses">
          {analyze.lenses.map((l) => (
            <div key={l.kicker} className="dx-card dx-lens">
              <p className="dx-kicker dx-kicker--forest">{l.kicker}</p>
              <h3>{l.title}</h3>
              <ul className="dx-lens-list">
                {l.items.map((it) => (
                  <li key={it}>
                    <Check />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="dx-benchmark">
          <span className="dx-kicker dx-kicker--leaf">{analyze.benchmark.kicker}</span>
          <span>{analyze.benchmark.body}</span>
        </p>
      </div>
    </section>
  );
}

function Runs() {
  return (
    <section className="rn-section rn-band--dark dx-runs" aria-labelledby="dx-runs-h">
      <div className="rn-wrap">
        <SectionHead id="dx-runs-h" eyebrow={runs.eyebrow} title={runs.title} intro={runs.intro} light />
        <ol className="dx-steps">
          {runs.steps.map((s) => (
            <li key={s.n} className="dx-step">
              <span className="dx-step-n" aria-hidden="true">
                {s.n}
              </span>
              <p className="dx-step-when">{s.when}</p>
              <h3>{s.title}</h3>
              <p className="dx-step-body">{s.body}</p>
              {s.note && <p className="dx-step-note">{s.note}</p>}
            </li>
          ))}
        </ol>
        <p className="rn-small dx-source dx-source--light">{runs.foot}</p>
      </div>
    </section>
  );
}

function Get() {
  return (
    <section className="rn-section rn-band--mist" aria-labelledby="dx-get-h">
      <div className="rn-wrap">
        <SectionHead id="dx-get-h" eyebrow={get.eyebrow} title={get.title} />
        <div className="dx-get">
          <ScoresChart />
          <ul className="dx-cards dx-cards--2 dx-get-cards">
            {get.cards.map((c) => (
              <li key={c.title} className="dx-card">
                <h3>{c.title}</h3>
                <p className="rn-body">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function RoadmapSection() {
  return (
    <section className="rn-section" aria-labelledby="dx-roadmap-h">
      <div className="rn-wrap">
        <div className="dx-roadmap-top">
          <div>
            <SectionHead id="dx-roadmap-h" eyebrow={roadmap.eyebrow} title={roadmap.title} intro={roadmap.intro} />
          </div>
          <span className="dx-badge-illustrative dx-badge-illustrative--ink">{roadmap.badge}</span>
        </div>
        <Roadmap />
      </div>
    </section>
  );
}

function Compare() {
  const c = compare;
  return (
    <section className="rn-section rn-band--mist" aria-labelledby="dx-compare-h">
      <div className="rn-wrap">
        <SectionHead id="dx-compare-h" title={c.title} intro={c.intro} />
        <div className="dx-tablewrap" role="region" aria-label={c.title} tabIndex={0}>
          <table className="dx-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="rn-sr-only">Dimension</span>
                </th>
                {c.columns.map((col, i) => (
                  <th key={col} scope="col" className={i === 0 ? "is-first" : undefined}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {r.cells.map((cell, i) => (
                    <td key={i} className={i === 0 ? "is-first" : undefined}>
                      {withDays(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Governance() {
  return (
    <section className="rn-section" aria-labelledby="dx-gov-h">
      <div className="rn-wrap">
        <SectionHead id="dx-gov-h" eyebrow={governance.eyebrow} title={governance.title} />
        <ul className="dx-cards dx-cards--4">
          {governance.cards.map((c) => (
            <li key={c.title} className="dx-card">
              <h3>{c.title}</h3>
              <p className="rn-body">{c.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function After() {
  const a = after;
  return (
    <section className="rn-section rn-band--mist" aria-labelledby="dx-after-h">
      <div className="rn-wrap">
        <SectionHead id="dx-after-h" title={a.title} intro={a.intro} />
        <div className="dx-after">
          <ol className="dx-cards dx-cards--3 dx-options">
            {a.options.map((o) => (
              <li key={o.n} className="dx-card dx-option">
                <span className="dx-option-n" aria-hidden="true">
                  {o.n}
                </span>
                <h3>{o.title}</h3>
                <p className="rn-body">{withDays(o.body)}</p>
              </li>
            ))}
          </ol>
          <div className="dx-case">
            <p className="dx-kicker dx-kicker--leaf">{a.caseStat.kicker}</p>
            <Unconfirmed>
              <p className="dx-case-v">{a.caseStat.value}</p>
              <p className="dx-case-body">{a.caseStat.body}</p>
            </Unconfirmed>
            <Link className="rn-link rn-link--light dx-case-link" href={hrefs.caseStudies}>
              {a.caseStat.link}
              <Arrow size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="rn-section" aria-labelledby="dx-faq-h">
      <div className="rn-wrap">
        <SectionHead id="dx-faq-h" title={faq.title} />
        <div className="dx-faq">
          {faq.items.map((it) => (
            <details key={it.q} className="dx-faq-item">
              <summary>
                {it.q}
                <Plus />
              </summary>
              <p className="dx-faq-a">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
