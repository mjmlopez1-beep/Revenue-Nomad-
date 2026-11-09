import Image from "next/image";
import Link from "next/link";
import * as f from "../guide/content/figures";
import Arrow from "../home/Arrow";
import ClosingBand from "../home/ClosingBand";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import PickMethod, { SectionHead, StatValue, TierMark } from "./PickMethod";
import { roles, tierFor } from "./content/shared";
import type { RolePage as Role, SectionKey } from "./content/types";
import "../home/home.css";
import "./Role.css";

/**
 * Shared template for the four role pages ("Hire a fractional leader"). Renders a RolePage content module in
 * its `order`, between the site header and footer. Artboard: "VPSalesPage" and its phone twin; the CMO and
 * RevOps boards use the same sections in their own order. Prefix rp-; tokens only (Role.css).
 *
 * Borrowed from the best fractional marketplaces (Go Fractional's hire pages, studied 2026-11-09): a seat
 * switcher and a trust line in the hero, a band of index figures under it, the leaders shown before the
 * explanation, pricing-style engagement cards with a live rate line, and a related-seats strip at the end.
 */
export default function RolePage({ page }: { page: Role }) {
  const sections: React.ReactNode[] = [];
  for (let i = 0; i < page.order.length; i++) {
    const key = page.order[i];
    // The artboard draws "What does one do" and "What does one cost" side by side in one mist band.
    if (key === "does" && page.order[i + 1] === "cost" && page.does && page.cost) {
      sections.push(<DoesAndCost key="does-cost" page={page} />);
      i += 1;
      continue;
    }
    const el = renderSection(key, page);
    if (el) sections.push(el);
  }
  return (
    <>
      <SiteHeader />
      <main id="main" className="rp-page">
        <Hero page={page} />
        <Proof page={page} />
        {sections}
        <RelatedRoles page={page} />
        <ClosingBand />
      </main>
      <SiteFooter />
    </>
  );
}

function renderSection(key: SectionKey, page: Role): React.ReactNode {
  switch (key) {
    case "triggers":
      return <Triggers key={key} page={page} />;
    case "does":
      return page.does ? <Does key={key} page={page} band /> : null;
    case "cost":
      return page.cost ? <Cost key={key} page={page} band /> : null;
    case "owns":
      return <Owns key={key} page={page} />;
    case "compare":
      return <Compare key={key} page={page} />;
    case "engagements":
      return <Engagements key={key} page={page} />;
    case "ninety":
      return <Ninety key={key} page={page} />;
    case "practice":
      return <Practice key={key} page={page} />;
    case "pick":
      return <PickMethod key={key} />;
    case "leaders":
      return <Leaders key={key} page={page} />;
    case "faq":
      return <Faq key={key} page={page} />;
    case "keepReading":
      return <KeepReading key={key} page={page} />;
  }
}

/* ---------- small parts ---------- */

function Check() {
  return (
    <span className="rp-check" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 6.5l2.2 2.2L9.5 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Plus() {
  return (
    <svg className="rp-plus" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.5v11M1.5 7h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- sections ---------- */

function Hero({ page }: { page: Role }) {
  const { hero } = page;
  return (
    <section className="rp-hero" aria-labelledby="rp-hero-h">
      <div className="rn-wrap rp-hero-inner">
        <span className="rp-hero-glow" aria-hidden="true" />
        <RoleSwitch page={page} />
        <p className="rn-eyebrow">{hero.eyebrow}</p>
        <h1 id="rp-hero-h" className="rn-h1 rp-h1">
          {hero.h1.plain} <em>{hero.h1.em}</em>
          <span className="rp-stop">.</span>
        </h1>
        <p className="rn-lede rp-lede">{hero.lede}</p>
        <div className="rp-actions">
          <Link className="rn-btn" href={hero.primary.href}>
            {hero.primary.label}
            <Arrow />
          </Link>
          <Link className="rn-btn rn-btn--ghost" href={hero.secondary.href}>
            {hero.secondary.label}
          </Link>
          <p className="rp-hero-price">
            <StatValue stat={hero.price} className="rp-hero-price-v" /> - {hero.price.l}
          </p>
        </div>
        <ul className="rp-trust" aria-label="What to expect">
          <li>No fees for companies</li>
          <li>{f.platform.availableNowShare}% of listed leaders available now</li>
          <li>First term of 3 to 6 months, then 30 days notice</li>
        </ul>
      </div>
    </section>
  );
}

/** "Which leader do you need?": the four seats as chips, the current page marked. */
function RoleSwitch({ page }: { page: Role }) {
  const here = `/${page.slug}`;
  return (
    <nav className="rp-roles" aria-label="Which leader do you need?">
      <span className="rp-roles-k">Which leader do you need?</span>
      <ul>
        {roles.map((r) => (
          <li key={r.href}>
            <Link href={r.href} prefetch={false} aria-current={r.href === here ? "page" : undefined}>
              {r.short}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The index figures behind the page: the seat's median rate, the index size, engagements under contract, the price to companies. */
function Proof({ page }: { page: Role }) {
  const cat = f.category(page.category);
  const items: { v: string; l: string }[] = [
    { v: `${cat.median}/hr`, l: `median ${page.category} rate, ${cat.n} rates` },
    { v: String(f.rates.n), l: "rates in the Rate Index, as companies pay them" },
    { v: String(f.contracts.engagements), l: "engagements under signed contract or partner terms" },
    { v: "$0", l: "fees for companies - you pay the operator's rate" },
  ];
  return (
    <section className="rp-proof" aria-label="The numbers behind this page">
      <div className="rn-wrap rp-proof-inner">
        <ul className="rp-proof-list">
          {items.map((it) => (
            <li key={it.l}>
              <b>{it.v}</b>
              <span>{it.l}</span>
            </li>
          ))}
        </ul>
        <p className="rn-small rp-proof-src">
          Revenue Nomad Rate Index and contracts, as of {f.asOf.long}. <Link href="/research/rate-index">See the Rate Index</Link>
        </p>
      </div>
    </section>
  );
}

/** The other three seats, at the end of the page. */
function RelatedRoles({ page }: { page: Role }) {
  const here = `/${page.slug}`;
  return (
    <section className="rp-section rp-related rn-band--mist" aria-labelledby="rp-related-h">
      <div className="rn-wrap">
        <SectionHead id="rp-related-h" title="Need a different seat?" intro="The same method, the same network, a different leader. Every seat is scoped to 1 to 3 days a week." />
        <ul className="rp-cards rp-cards--3 rp-related-list">
          {roles
            .filter((r) => r.href !== here)
            .map((r) => (
              <li key={r.href}>
                <Link className="rp-related-card" href={r.href} prefetch={false}>
                  <b>{r.name}</b>
                  <span>{r.line}</span>
                  <span className="rp-related-go">
                    See the page
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

function Triggers({ page }: { page: Role }) {
  const t = page.triggers;
  return (
    <section className="rp-section" aria-labelledby="rp-triggers-h">
      <div className="rn-wrap">
        <SectionHead id="rp-triggers-h" title={t.title} intro={t.intro} />
        <ul className="rp-cards rp-cards--3">
          {t.items.map((it) => (
            <li key={it.title} className="rp-card">
              <h3>{it.title}</h3>
              <p className="rn-body">{it.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DoesBody({ page }: { page: Role }) {
  const d = page.does!;
  return (
    <div>
      <h2 id="rp-does-h" className="rn-h2 rp-h2 rp-h2--sm">
        {d.title}
      </h2>
      <p className="rn-body rp-intro">{d.intro}</p>
      <ul className="rp-does">
        {d.items.map((it) => (
          <li key={it}>
            <Check />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CostBody({ page }: { page: Role }) {
  const c = page.cost!;
  return (
    <div>
      <h2 id="rp-cost-h" className="rn-h2 rp-h2 rp-h2--sm">
        {c.title}
      </h2>
      <p className="rn-body rp-intro">{c.intro}</p>
      <div className="rp-price-card">
        <p className="rp-price">
          <StatValue stat={c.price} className="rp-price-v" />
        </p>
        <p className="rn-body rp-price-note">
          {c.price.l}
          {c.more && <> {c.more}</>}
        </p>
        <Link className="rn-btn rn-btn--ghost rn-btn--sm rp-price-link" href={c.link.href}>
          {c.link.label}
          <Arrow size={13} />
        </Link>
      </div>
      <p className="rn-small rp-nofees">{c.noFees}</p>
    </div>
  );
}

function DoesAndCost({ page }: { page: Role }) {
  return (
    <section className="rp-section rn-band--mist" aria-labelledby="rp-does-h">
      <div className="rn-wrap rp-pair">
        <DoesBody page={page} />
        <CostBody page={page} />
      </div>
    </section>
  );
}

function Does({ page, band }: { page: Role; band?: boolean }) {
  return (
    <section className={band ? "rp-section rn-band--mist" : "rp-section"} aria-labelledby="rp-does-h">
      <div className="rn-wrap rp-single">
        <DoesBody page={page} />
      </div>
    </section>
  );
}

function Cost({ page, band }: { page: Role; band?: boolean }) {
  return (
    <section className={band ? "rp-section rn-band--mist" : "rp-section"} aria-labelledby="rp-cost-h">
      <div className="rn-wrap rp-single">
        <CostBody page={page} />
      </div>
    </section>
  );
}

function Owns({ page }: { page: Role }) {
  const o = page.owns;
  return (
    <section className="rp-section" aria-labelledby="rp-owns-h">
      <div className="rn-wrap rp-owns">
        <div className="rp-owns-head">
          <SectionHead id="rp-owns-h" eyebrow={o.eyebrow} title={o.title} />
          <p className="rn-body rp-intro">{o.intro}</p>
          <p className="rn-small rp-source">{o.source}</p>
        </div>
        <ol className="rp-owns-list">
          {o.items.map((it) => (
            <li key={it.n} className="rp-own">
              <div className="rp-own-head">
                <span className="rp-own-n" aria-hidden="true">
                  {it.n}
                </span>
                <div>
                  <h3>{it.title}</h3>
                  <p className="rp-own-sub">{it.sub}</p>
                </div>
              </div>
              <div className="rp-own-body">
                <p className="rn-body">{it.body}</p>
                <p className="rp-day90">
                  <span className="rp-day90-k">By day 90</span>
                  <span>{it.byDay90}</span>
                </p>
                <div className="rp-qa">
                  {it.qa.map((qa) => (
                    <div key={qa.q}>
                      <h4>{qa.q}</h4>
                      <p className="rn-body rp-qa-a">{qa.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Compare({ page }: { page: Role }) {
  const c = page.compare;
  return (
    <section className="rp-section rn-band--mist" aria-labelledby="rp-compare-h">
      <div className="rn-wrap">
        <SectionHead id="rp-compare-h" title={c.title} intro={c.intro} />
        <div className="rp-tablewrap" role="region" aria-label={c.title} tabIndex={0}>
          <table className="rp-table">
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
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {c.note && <p className="rn-small rp-source">{c.note}</p>}
      </div>
    </section>
  );
}

function Engagements({ page }: { page: Role }) {
  const e = page.engagements;
  const cat = f.category(page.category);
  return (
    <section className="rp-section" aria-labelledby="rp-engagements-h">
      <div className="rn-wrap">
        <SectionHead id="rp-engagements-h" title={e.title} />
        <ul className="rp-cards rp-cards--3">
          {e.cards.map((c) => (
            <li key={c.title} className={c.badge ? "rp-card rp-card--price is-featured" : "rp-card rp-card--price"}>
              {c.badge && <span className="rp-badge">{c.badge}</span>}
              <h3>{c.title}</h3>
              {c.price && (
                <p className="rp-card-price">
                  <StatValue stat={c.price} className="rp-card-price-v" />
                  <span className="rp-card-price-l">{c.price.l}</span>
                </p>
              )}
              <p className="rn-body">{c.body}</p>
              {c.href && (
                <Link className="rn-link rp-card-link" href={c.href}>
                  How it works
                  <Arrow size={13} />
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div className="rp-statrow">
          <ul className="rp-stats">
            {e.stats.map((s) => (
              <li key={s.l}>
                <StatValue stat={s} className="rp-stat-v" />
                <span className="rp-stat-l">{s.l}</span>
              </li>
            ))}
          </ul>
          <p className="rn-small rp-source">{e.source}</p>
        </div>
        <p className="rp-rateline">
          <span className="rp-rateline-k" aria-hidden="true" />
          {page.category} rates have a median of <b>{cat.median}/hour</b> across {cat.n} rates in the Rate Index. The price moves with days a week and scope.{" "}
          <Link className="rn-link" href="/research/rate-index">
            See the Rate Index
            <Arrow size={13} />
          </Link>
        </p>
      </div>
    </section>
  );
}

function Ninety({ page }: { page: Role }) {
  const n = page.ninety;
  return (
    <section className="rp-section rp-ninety" aria-labelledby="rp-ninety-h">
      <div className="rn-wrap">
        <SectionHead id="rp-ninety-h" eyebrow={n.eyebrow} title={n.title} intro={n.intro} light />
        <ol className="rp-steps">
          {n.steps.map((s) => (
            <li key={s.n}>
              <span className="rp-step-n" aria-hidden="true">
                {s.n}
              </span>
              <p className="rp-step-when">{s.when}</p>
              <h3>{s.title}</h3>
              <p className="rp-step-body">{s.body}</p>
              {s.note && <p className="rp-step-note">{s.note}</p>}
            </li>
          ))}
        </ol>
        <p className="rn-small rp-source rp-source--light">{n.source}</p>
      </div>
    </section>
  );
}

function Practice({ page }: { page: Role }) {
  const p = page.practice;
  return (
    <section className="rp-section" aria-labelledby="rp-practice-h">
      <div className="rn-wrap">
        <SectionHead id="rp-practice-h" title={p.title} />
        <div className="rp-practice">
          <figure className="rp-quote">
            <blockquote>
              <p>“{p.quote.text}”</p>
            </blockquote>
            <figcaption>
              {p.quote.by} - {p.quote.context}
            </figcaption>
            <Link className="rn-link rp-quote-link" href={p.caseHref}>
              {p.caseLabel}
              <Arrow size={13} />
            </Link>
          </figure>
          <div className="rp-result">
            <p className="rp-result-v">
              <StatValue stat={p.stat} className="rp-result-num" />
            </p>
            <p className="rp-result-l">
              {p.stat.l}
              {p.stat.s && <> Source: {p.stat.s}</>}
            </p>
            <Link className="rn-link rn-link--light rp-result-link" href={p.allHref}>
              All seven case studies
              <Arrow size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The canvas's illustrative portraits (480 by 480), one per sample profile, in card order. */
const samplePhotos = ["sample-erin.webp", "sample-scott.webp", "sample-lionel.webp"];

function Leaders({ page }: { page: Role }) {
  const l = page.leaders;
  return (
    <section className="rp-section rp-leaders" aria-labelledby="rp-leaders-h">
      <div className="rn-wrap">
        <SectionHead id="rp-leaders-h" title={l.title} />
        <ul className="rp-cards rp-cards--3 rp-leader-grid">
          {l.items.map((p, i) => {
            const tier = tierFor(p.tier);
            const photo = samplePhotos[i % samplePhotos.length];
            return (
              <li key={p.name} className="rp-leader">
                <div className="rp-leader-head">
                  <Image className="rp-leader-photo" src={`/home/people/${photo}`} alt="" width={480} height={480} sizes="56px" />
                  <div className="rp-leader-id">
                    <h3>{p.name}</h3>
                    <p>{p.role}</p>
                  </div>
                  <span className="rp-sample">Sample profile</span>
                </div>
                <p className="rp-leader-blurb">{p.blurb}</p>
                <ul className="rp-tags">
                  {p.tags.map((t) => (
                    <li key={t}>
                      <Check />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="rp-leader-meta">
                  <span>{p.days}</span>
                  <b>{p.price}</b>
                  <span>{p.location}</span>
                </p>
                <p className="rp-leader-score">
                  {tier && <TierMark tier={tier} score={p.score} />}
                  <span>
                    <b>
                      {p.score} {p.tier}
                    </b>{" "}
                    - {p.reviews}
                  </span>
                </p>
                <Link className="rn-btn rn-btn--sm rp-leader-cta" href="/talk">
                  Request an intro
                  <span className="rn-sr-only"> to a leader like {p.name.split(" ")[0]}</span>
                  <Arrow size={13} />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="rp-leaders-foot">
          <Link className="rn-btn rn-btn--outline-light" href={l.browse.href}>
            {l.browse.label}
            <Arrow />
          </Link>
          <p className="rp-leaders-note">{l.note}</p>
        </div>
      </div>
    </section>
  );
}

function Faq({ page }: { page: Role }) {
  const q = page.faq;
  return (
    <section className="rp-section rn-band--mist" aria-labelledby="rp-faq-h">
      <div className="rn-wrap">
        <SectionHead id="rp-faq-h" title={q.title} />
        <div className="rp-faq">
          {q.items.map((it) => (
            <details key={it.q} className="rp-faq-item">
              <summary>
                {it.q}
                <Plus />
              </summary>
              <p className="rp-faq-a">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function KeepReading({ page }: { page: Role }) {
  const k = page.keepReading;
  return (
    <section className="rp-section" aria-labelledby="rp-read-h">
      <div className="rn-wrap">
        <SectionHead id="rp-read-h" title={k.title} />
        <ul className="rp-cards rp-cards--3 rp-reads">
          {k.cards.map((c) => (
            <li key={c.href + c.title}>
              <Link className="rp-read" href={c.href}>
                <span className="rp-read-art">
                  <span className="rp-read-brand">Revenue Nomad research</span>
                  <span className="rp-read-kicker">{c.kicker}</span>
                </span>
                <span className="rp-read-body">
                  <b>{c.title}</b>
                  <span>{c.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
