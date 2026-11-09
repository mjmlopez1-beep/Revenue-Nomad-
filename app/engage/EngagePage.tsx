import Link from "next/link";
import Arrow from "../home/Arrow";
import ClosingBand from "../home/ClosingBand";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import PickMethod, { StatValue } from "../solutions/PickMethod";
import { engagements, type Band, type EngageBlock, type EngagePage as Page, type EngageSection } from "./content/types";
import "../home/home.css";
import "../solutions/Role.css";
import "./Engage.css";

/**
 * Shared template for the three "How we engage" pages: Monthly fractional leadership, Interim cover and
 * Fractional to full time. Renders an EngagePage content module (hero, then sections of typed blocks) between
 * the site header and footer, closing with the house ClosingBand. Artboards: "FractionalPage", "InterimPage",
 * "FullTimePage" and their phone twins. Prefix eg-; tokens only (Engage.css). The `pick` block renders the
 * shared method section from app/solutions/PickMethod.tsx, so it has one implementation across the site.
 */
export default function EngagePage({ page }: { page: Page }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="eg-page">
        <Hero page={page} />
        {page.sections.map((s) => (
          <Section key={s.id} section={s} page={page} />
        ))}
        <ClosingBand />
      </main>
      <SiteFooter />
    </>
  );
}

/* ---------- helpers ---------- */

const bandClass: Record<Band, string> = {
  white: "",
  mist: "rn-band--mist",
  night: "eg-band--night",
  forest: "rn-band--forest",
  gold: "eg-band--gold",
};

const hasTag = (s: string) => /<[a-z][^>]*>/i.test(s);

/** Content strings may carry inline HTML (links, emphasis, a dl). Plain strings render as text. */
function Rich({ as: Tag = "p", className, html }: { as?: "p" | "div" | "td" | "th" | "span"; className?: string; html: string }) {
  if (hasTag(html)) return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return <Tag className={className}>{html}</Tag>;
}

function Check() {
  return (
    <span className="eg-check" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 6.5l2.2 2.2L9.5 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Plus() {
  return (
    <svg className="eg-plus" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.5v11M1.5 7h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- hero ---------- */

function Hero({ page }: { page: Page }) {
  const { hero } = page;
  return (
    <section className="eg-hero" aria-labelledby="eg-hero-h">
      <div className="rn-wrap eg-hero-inner">
        <span className="eg-hero-glow" aria-hidden="true" />
        <p className="rn-eyebrow">{hero.eyebrow}</p>
        <h1 id="eg-hero-h" className="rn-h1 eg-h1">
          {hero.h1.plain} <em>{hero.h1.em}</em>
          <span className="eg-stop">.</span>
        </h1>
        <p className="rn-lede eg-lede-hero">{hero.lede}</p>
        <div className="eg-actions">
          <Link className="rn-btn" href={hero.primary.href}>
            {hero.primary.label}
            <Arrow />
          </Link>
          <Link className="rn-btn rn-btn--ghost" href={hero.secondary.href}>
            {hero.secondary.label}
          </Link>
          <p className="eg-hero-stat">
            <StatValue stat={hero.stat} className="eg-hero-stat-v" /> - {hero.stat.l}
            {hero.stat.s && <> Source: {hero.stat.s}</>}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------- sections ---------- */

function Section({ section, page }: { section: EngageSection; page: Page }) {
  // A section that is only the shared method renders the method section itself, exactly as the role pages do.
  if (section.blocks.length === 1 && section.blocks[0].t === "pick") return <PickMethod />;
  const hid = `eg-${section.id}-h`;
  const band = bandClass[section.band ?? "white"];
  return (
    <section id={section.id} className={band ? `eg-section ${band}` : "eg-section"} aria-labelledby={hid}>
      <div className="rn-wrap">
        {section.eyebrow && <p className="rn-eyebrow">{section.eyebrow}</p>}
        <h2 id={hid} className={section.eyebrow ? "rn-h2 eg-h2 eg-h2--after-eyebrow" : "rn-h2 eg-h2"}>
          {section.title}
        </h2>
        {section.intro && <p className="rn-lede eg-intro">{section.intro}</p>}
        <div className="eg-blocks">
          {section.blocks.map((b, i) => (
            <Block key={i} block={b} section={section} page={page} />
          ))}
        </div>
        {section.source && <p className="rn-small eg-source">{section.source}</p>}
      </div>
    </section>
  );
}

function Block({ block, section, page }: { block: EngageBlock; section: EngageSection; page: Page }) {
  switch (block.t) {
    case "lede":
      return <Rich className="rn-lede eg-lede" html={block.html} />;
    case "p":
      return <Rich className="rn-body eg-p" html={block.html} />;
    case "list":
      return <List items={block.items} ordered={block.ordered} />;
    case "cards":
      return <Cards cols={block.cols ?? 3} items={block.items} />;
    case "steps":
      return <Steps items={block.items} />;
    case "stats":
      return <Stats items={block.items} source={block.source} />;
    case "compare":
      return <Compare columns={block.columns} rows={block.rows} note={block.note} label={section.title} />;
    case "table":
      return <Table head={block.head} rows={block.rows} note={block.note} firstColHeader={block.firstColHeader} label={section.title} />;
    case "callout":
      return <Callout title={block.title} html={block.html} tone={block.tone ?? "leaf"} />;
    case "quote":
      return <Quote block={block} />;
    case "faq":
      return <Faq items={block.items} />;
    case "pick":
      // The method inside a longer section: the role-page section, in place, with its own heading.
      return <PickMethod />;
    case "otherWays":
      return <OtherWays current={page.slug} />;
  }
}

/* ---------- blocks ---------- */

function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  if (ordered) {
    return (
      <ol className="eg-list eg-list--ordered">
        {items.map((it) => (
          <li key={it}>
            <Rich as="span" html={it} />
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="eg-list">
      {items.map((it) => (
        <li key={it}>
          <Check />
          <Rich as="span" html={it} />
        </li>
      ))}
    </ul>
  );
}

type Card = { kicker?: string; title: string; body: string; href?: string; cta?: string };

function Cards({ cols, items }: { cols: 2 | 3 | 4; items: Card[] }) {
  return (
    <ul className={`eg-cards eg-cards--${cols}`}>
      {items.map((c) => (
        <li key={c.title} className="eg-card">
          {c.kicker && <p className="eg-kicker">{c.kicker}</p>}
          <h3>{c.title}</h3>
          <Rich className="rn-body" html={c.body} />
          {c.href && (
            <Link className="rn-link eg-card-link" href={c.href}>
              {c.cta ?? "Read more"}
              <Arrow size={13} />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: { n: string; when?: string; title: string; body: string; note?: string }[] }) {
  return (
    <ol className="eg-steps" style={{ "--eg-n": items.length } as React.CSSProperties}>
      {items.map((s) => (
        <li key={s.n}>
          <span className="eg-step-n" aria-hidden="true">
            {s.n}
          </span>
          {s.when && <p className="eg-step-when">{s.when}</p>}
          <h3>{s.title}</h3>
          <Rich className="eg-step-body" html={s.body} />
          {s.note && <p className="eg-step-note">{s.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function Stats({ items, source }: { items: { v: string; l: string; s?: string }[]; source?: string }) {
  return (
    <div className="eg-statblock">
      <ul className="eg-stats" style={{ "--eg-n": items.length } as React.CSSProperties}>
        {items.map((s) => (
          <li key={s.l}>
            <StatValue stat={s} className="eg-stat-v" />
            <span className="eg-stat-l">
              {s.l}
              {s.s && <> Source: {s.s}</>}
            </span>
          </li>
        ))}
      </ul>
      {source && <p className="rn-small eg-note">{source}</p>}
    </div>
  );
}

function Compare({ columns, rows, note, label }: { columns: string[]; rows: { label: string; cells: string[] }[]; note?: string; label: string }) {
  return (
    <div>
      <div className="eg-tablewrap" role="region" aria-label={label} tabIndex={0}>
        <table className="eg-table eg-table--compare">
          <thead>
            <tr>
              <th scope="col">
                <span className="rn-sr-only">Dimension</span>
              </th>
              {columns.map((col, i) => (
                <th key={col} scope="col" className={i === 0 ? "is-first" : undefined}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {r.cells.map((cell, i) => (
                  <Rich as="td" key={i} className={i === 0 ? "is-first" : undefined} html={cell} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="rn-small eg-note">{note}</p>}
    </div>
  );
}

const PCT = /^(\d{1,3})%$/;

function Table({ head, rows, note, firstColHeader, label }: { head: string[]; rows: string[][]; note?: string; firstColHeader?: boolean; label: string }) {
  // A "share" column of percentages draws a bar beside each figure, scaled to the column's largest value.
  const shareCols = head.map((h, i) => /share/i.test(h) && rows.every((r) => PCT.test(r[i] ?? "")));
  const maxOf = (i: number) => Math.max(...rows.map((r) => Number(PCT.exec(r[i])?.[1] ?? 0)), 1);
  return (
    <div>
      <div className="eg-tablewrap" role="region" aria-label={label} tabIndex={0}>
        <table className="eg-table">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, i) => {
                  if (i === 0 && firstColHeader) return <Rich as="th" key={i} html={cell} />;
                  if (shareCols[i]) {
                    const pct = Number(PCT.exec(cell)?.[1] ?? 0);
                    return (
                      <td key={i}>
                        <span className="eg-share">
                          <span className="eg-bar" aria-hidden="true">
                            <span style={{ width: `${Math.round((pct / maxOf(i)) * 100)}%` }} />
                          </span>
                          <b>{cell}</b>
                        </span>
                      </td>
                    );
                  }
                  return <Rich as="td" key={i} html={cell} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="rn-small eg-note">{note}</p>}
    </div>
  );
}

function Callout({ title, html, tone }: { title?: string; html: string; tone: "gold" | "leaf" | "night" }) {
  return (
    <div className={`eg-callout eg-callout--${tone}`}>
      {title && <h3>{title}</h3>}
      <Rich as="div" className="eg-callout-body" html={html} />
    </div>
  );
}

function Quote({ block }: { block: Extract<EngageBlock, { t: "quote" }> }) {
  return (
    <div className={block.stat ? "eg-quotewrap eg-quotewrap--stat" : "eg-quotewrap"}>
      <figure className="eg-quote">
        <blockquote>
          <p>“{block.text}”</p>
        </blockquote>
        <figcaption>
          {block.by}
          {block.context && <> - {block.context}</>}
        </figcaption>
        {block.href && (
          <Link className="rn-link eg-quote-link" href={block.href}>
            {block.label ?? "Read the case study"}
            <Arrow size={13} />
          </Link>
        )}
      </figure>
      {block.stat && (
        <div className="eg-result">
          <p className="eg-result-v">
            <StatValue stat={block.stat} className="eg-result-num" />
          </p>
          <p className="eg-result-l">
            {block.stat.l}
            {block.stat.s && <> Source: {block.stat.s}</>}
          </p>
        </div>
      )}
    </div>
  );
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="eg-faq">
      {items.map((it) => (
        <details key={it.q} className="eg-faq-item">
          <summary>
            {it.q}
            <Plus />
          </summary>
          <Rich className="eg-faq-a" html={it.a} />
        </details>
      ))}
    </div>
  );
}

function OtherWays({ current }: { current: Page["slug"] }) {
  const others = engagements.filter((e) => e.slug !== current);
  return (
    <ul className="eg-cards eg-cards--3">
      {others.map((e) => (
        <li key={e.slug}>
          <Link className="eg-card eg-card--link" href={e.href}>
            <span className="eg-kicker">{e.kicker}</span>
            <h3>{e.name}</h3>
            <span className="rn-body">{e.body}</span>
            <span className="rn-link eg-card-link">
              Read more
              <Arrow size={13} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
