import type { Block, Stat } from "./content/types";

/** Inline HTML from our own content modules: only <strong>, <em>, <a href>, <br> are used there. */
const Html = ({ html, className, as: Tag = "p" }: { html: string; className?: string; as?: "p" | "div" | "dd" | "span" }) => (
  <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />
);

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Stat tiles. `light` (default): the bordered tile grid on paper, figure in green when toned forest, ink otherwise.
 * `dark`: the chapter header tiles on ink. `strip`: the cover's headline figure strip with hairline dividers.
 */
export function StatRow({ items, note, variant = "light" }: { items: Stat[]; note?: string; variant?: "light" | "dark" | "strip" }) {
  return (
    <div className={`gd-statwrap gd-statwrap--${variant}`}>
      <dl className={`gd-stats gd-stats--${variant}`}>
        {items.map((s, i) => (
          <div key={i} className={`gd-stat gd-stat--${s.tone ?? "plain"}`}>
            {/* dt first for the outline; the figure is placed above its label in CSS */}
            <dt className="gd-stat-l">{s.l}</dt>
            <dd className="gd-stat-v">{s.v}</dd>
            {s.s && <dd className="gd-stat-s">{s.s}</dd>}
          </div>
        ))}
      </dl>
      {note && <p className="gd-note">{note}</p>}
    </div>
  );
}

/* ---------- tables: in-cell bars and HIGHEST / LOWEST tags ---------- */

type Cell = { value: string; tag?: string; num: number; unit: "$" | "%" | ""; bold: boolean };

/** A cell that is one figure, optionally followed by a parenthetical tag such as "(highest)" or "(directional)". */
function parseCell(html: string): Cell | null {
  const plain = html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
  const m = plain.match(/^(\$?[\d,]+(?:\.\d+)?%?)(?:\s*\(([^)]*)\))?$/);
  if (!m) return null;
  const value = m[1];
  return {
    value,
    tag: m[2],
    num: Number(value.replace(/[$,%]/g, "")),
    unit: value.startsWith("$") ? "$" : value.endsWith("%") ? "%" : "",
    bold: /<strong>/.test(html),
  };
}

/** Columns that get a bar: the note says bars are scaled, every cell is one figure, and it is money, a share, or the only value column. */
function barColumns(head: string[], rows: string[][], note?: string): Map<number, number> {
  const bars = new Map<number, number>();
  if (!note || !/bars? (are )?scaled/i.test(note)) return bars;
  for (let k = 1; k < head.length; k++) {
    if (/^n$/i.test(head[k].trim())) continue;
    const cells = rows.map((r) => parseCell(r[k] ?? ""));
    if (cells.some((c) => !c)) continue;
    const units = new Set(cells.map((c) => c!.unit));
    if (!(units.has("$") || units.has("%") || head.length === 2)) continue;
    const max = Math.max(...cells.map((c) => c!.num));
    if (max > 0) bars.set(k, max);
  }
  return bars;
}

function tagClass(tag: string) {
  if (/highest/i.test(tag)) return "gd-tag gd-tag--hi";
  if (/lowest/i.test(tag)) return "gd-tag gd-tag--lo";
  return "gd-tag gd-tag--mute";
}

function FigureCell({ html, max, total }: { html: string; max?: number; total: boolean }) {
  const c = parseCell(html);
  if (!c) return <span dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <>
      <span className={c.bold || total ? "gd-cell-v gd-cell-v--strong" : "gd-cell-v"}>{c.value}</span>
      {c.tag && <span className={tagClass(c.tag)}>{c.tag}</span>}
      {max && (
        <span className="gd-bar" aria-hidden="true">
          <span className="gd-bar-fill" style={{ width: `${Math.max(2, Math.round((c.num / max) * 100))}%` }} />
        </span>
      )}
    </>
  );
}

function Table({ b, id }: { b: Extract<Block, { t: "table" }>; id: string }) {
  const bars = barColumns(b.head, b.rows, b.note);
  const cap = b.caption?.match(/^(Figure \d+(?:\.\d+)*[a-z]?)\.?\s+(.*)$/);
  return (
    <figure className="gd-figure">
      {b.caption && (
        <figcaption className="gd-figcap" id={id}>
          {cap ? (
            <>
              <span className="gd-figlabel">{cap[1]}</span>
              <span className="gd-figtitle">{cap[2]}</span>
            </>
          ) : (
            <span className="gd-figtitle">{b.caption}</span>
          )}
        </figcaption>
      )}
      <div className="gd-tablecard">
        <div role="region" aria-labelledby={b.caption ? id : undefined} aria-label={b.caption ? undefined : "Table"} tabIndex={0} className="gd-tablescroll">
          <table className="gd-table">
            <thead>
              <tr>
                {b.head.map((h, j) => (
                  <th key={j} scope="col" className={j > 0 && !bars.has(j) && /^n$/i.test(h.trim()) ? "gd-th-n" : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => {
                const total = /<strong>/.test(r[0] ?? "");
                return (
                  <tr key={j} className={total ? "gd-row--total" : undefined}>
                    {r.map((c, k) =>
                      k === 0 && b.firstColHeader ? (
                        <th key={k} scope="row" dangerouslySetInnerHTML={{ __html: c }} />
                      ) : k === 0 ? (
                        <td key={k} dangerouslySetInnerHTML={{ __html: c }} />
                      ) : (
                        <td key={k} className={bars.has(k) ? "gd-td-bar" : /^n$/i.test(b.head[k]?.trim() ?? "") ? "gd-td-n" : undefined}>
                          <FigureCell html={c} max={bars.get(k)} total={total} />
                        </td>
                      )
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {b.note && <p className="gd-table-note">{b.note}</p>}
      </div>
    </figure>
  );
}

/* ---------- blocks ---------- */

function Quote({ text, by }: { text: string; by?: string }) {
  return (
    <blockquote className="gd-quote">
      <svg className="gd-quote-mark" width="44" height="34" viewBox="0 0 44 34" aria-hidden="true">
        <path d="M0 34V20C0 8 6 1.5 17 0l1.6 4.6C12.4 6.6 9.6 10.6 9.4 16H18v18H0Zm26 0V20C26 8 32 1.5 43 0l1 4.6C38 6.6 35.6 10.6 35.4 16H44v18H26Z" fill="currentColor" />
      </svg>
      <p>{text}</p>
      {by && <cite>{by}</cite>}
    </blockquote>
  );
}

function Callout({ b }: { b: Extract<Block, { t: "callout" }> }) {
  const tone = b.tone ?? "leaf";
  return (
    <aside className={`gd-callout gd-callout--${tone}`}>
      {b.title && (
        <p className="gd-callout-t">
          {tone === "gold" && (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 2 20h20L12 3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M12 10v4M12 17h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {b.title}
        </p>
      )}
      <Html html={b.html} as="div" className="gd-callout-b" />
    </aside>
  );
}

function Steps({ items }: { items: Extract<Block, { t: "steps" }>["items"] }) {
  return (
    <ol className="gd-steps">
      {items.map((st, j) => (
        <li key={j} className="gd-step">
          <span className="gd-step-n" aria-hidden="true">
            {st.n}
          </span>
          <h3 className="gd-step-h">{st.title}</h3>
          <Html html={st.html} className="gd-step-p" />
          {st.aside && <p className="gd-step-aside">{st.aside}</p>}
        </li>
      ))}
    </ol>
  );
}

function Qa({ items, Q }: { items: Extract<Block, { t: "qa" }>["items"]; Q: "h2" | "h3" }) {
  return (
    <dl className="gd-qa">
      {items.map((q) => (
        <div key={q.n} className="gd-qa-item">
          <dt>
            <span className="gd-qa-n">{q.n}</span>
            <span className={`gd-qa-fig gd-qa-fig--${q.tone ?? "forest"}`}>{q.figure}</span>
            <Q>{q.q}</Q>
          </dt>
          <Html html={q.html} as="dd" />
          {q.see && <dd className="gd-qa-see">See {q.see}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** One block, outside any grouping. `qLevel` is the heading level a Q&A question takes. */
function BlockView({ b, i, qLevel }: { b: Block; i: number; qLevel: "h2" | "h3" }) {
  switch (b.t) {
    case "h2":
      return (
        <div className="gd-h2wrap" id={b.id ?? slug(b.text)}>
          {b.eyebrow && <p className="gd-eyebrow">{b.eyebrow}</p>}
          <h2 className="gd-h2">{b.text}</h2>
        </div>
      );
    case "h3":
      return <h3 className="gd-h3">{b.text}</h3>;
    case "lede":
      return <Html html={b.html} className="gd-lede" />;
    case "p":
      return <Html html={b.html} className="gd-p" />;
    case "stats":
      return <StatRow items={b.items} note={b.note} />;
    case "list":
      return b.ordered ? (
        <ol className="gd-list">
          {b.items.map((it, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: it }} />
          ))}
        </ol>
      ) : (
        <ul className="gd-list">
          {b.items.map((it, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: it }} />
          ))}
        </ul>
      );
    case "steps":
      return <Steps items={b.items} />;
    case "table":
      return <Table b={b} id={`gd-fig-${i}`} />;
    case "quote":
      return <Quote text={b.text} by={b.by} />;
    case "callout":
      return <Callout b={b} />;
    case "note":
      return <p className="gd-note">{b.text}</p>;
    case "qa":
      return <Qa items={b.items} Q={qLevel} />;
  }
}

/* ---------- sections: head column, intro column, then figures at full width ---------- */

type Group = { head: Block[]; side: Block[]; intro: Block[]; rest: Block[]; start: number };

const PROSE = new Set<Block["t"]>(["p", "list", "note", "lede"]);

/**
 * Splits the block stream at each h2. In a group, the h2 and a lede right after it form the head column, a leading
 * stats block sits under the head, the leading run of prose is the intro column, and everything after runs full width.
 * The group before the first h2 (the chapter opening) is the same shape with a lede standing in for the heading.
 */
function group(blocks: Block[]): Group[] {
  const groups: Group[] = [];
  let g: Group = { head: [], side: [], intro: [], rest: [], start: 0 };
  let phase: "head" | "intro" | "rest" = "head";
  blocks.forEach((b, i) => {
    if (b.t === "h2") {
      groups.push(g);
      g = { head: [b], side: [], intro: [], rest: [], start: i };
      phase = "head";
      return;
    }
    if (phase === "head" && b.t === "lede" && g.intro.length === 0) {
      g.head.push(b);
      return;
    }
    if (phase !== "rest" && b.t === "stats" && groups.length > 0) {
      // A pair of tiles sits under the heading; a wider row joins the intro column when prose precedes it,
      // otherwise it runs full width like a figure.
      if (b.items.length <= 2 && g.side.length === 0) {
        g.side.push(b);
        phase = "intro";
        return;
      }
      if (g.intro.length > 0) {
        g.intro.push(b);
        return;
      }
    }
    if (phase !== "rest" && PROSE.has(b.t)) {
      g.intro.push(b);
      phase = "intro";
      return;
    }
    phase = "rest";
    g.rest.push(b);
  });
  groups.push(g);
  return groups.filter((x) => x.head.length || x.side.length || x.intro.length || x.rest.length);
}

export default function GuideBlocks({ blocks }: { blocks: Block[] }) {
  const groups = group(blocks);
  let seenH2 = false;
  return (
    <>
      {groups.map((g, gi) => {
        const opening = gi === 0 && g.head.every((b) => b.t !== "h2");
        if (g.head.some((b) => b.t === "h2")) seenH2 = true;
        // Questions sit one level under the nearest heading so the outline never skips a level.
        const qLevel: "h2" | "h3" = seenH2 ? "h3" : "h2";
        const render = (list: Block[], offset: number) => {
          // Two or more tinted callouts in a row share a grid, as on the boards.
          const out: React.ReactNode[] = [];
          for (let j = 0; j < list.length; ) {
            const b = list[j];
            if (b.t === "callout" && b.tone !== "night") {
              let k = j;
              while (k < list.length && list[k].t === "callout" && (list[k] as Extract<Block, { t: "callout" }>).tone !== "night") k++;
              if (k - j >= 2) {
                out.push(
                  <div key={`cg${offset + j}`} className="gd-callout-grid">
                    {list.slice(j, k).map((c, m) => (
                      <BlockView key={offset + j + m} b={c} i={g.start + offset + j + m} qLevel={qLevel} />
                    ))}
                  </div>
                );
                j = k;
                continue;
              }
            }
            out.push(<BlockView key={offset + j} b={b} i={g.start + offset + j} qLevel={qLevel} />);
            j++;
          }
          return out;
        };
        const twoCol = (g.head.length > 0 || g.side.length > 0) && (g.intro.length > 0 || g.side.length > 0);
        return (
          <div key={gi} className={`gd-sec${opening ? " gd-sec--opening" : ""}${twoCol ? " gd-sec--cols" : ""}`}>
            {(g.head.length > 0 || g.side.length > 0) && (
              <div className="gd-sec-head">
                {render(g.head, 0)}
                {render(g.side, g.head.length)}
              </div>
            )}
            {g.intro.length > 0 && <div className="gd-sec-intro">{render(g.intro, g.head.length + g.side.length)}</div>}
            {g.rest.length > 0 && <div className="gd-sec-body">{render(g.rest, g.head.length + g.side.length + g.intro.length)}</div>}
          </div>
        );
      })}
    </>
  );
}
