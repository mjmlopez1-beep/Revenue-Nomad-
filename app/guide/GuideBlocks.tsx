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

export function StatRow({ items, note }: { items: Stat[]; note?: string }) {
  return (
    <div className="gd-statwrap">
      <dl className="gd-stats">
        {items.map((s, i) => (
          <div key={i} className={`gd-stat gd-stat--${s.tone ?? "forest"}`}>
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

export default function GuideBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h2":
            return (
              <div key={i} className="gd-h2wrap" id={b.id ?? slug(b.text)}>
                {b.eyebrow && <p className="rn-eyebrow">{b.eyebrow}</p>}
                <h2 className="gd-h2">{b.text}</h2>
              </div>
            );
          case "h3":
            return (
              <h3 key={i} className="gd-h3">
                {b.text}
              </h3>
            );
          case "lede":
            return <Html key={i} html={b.html} className="gd-lede" />;
          case "p":
            return <Html key={i} html={b.html} className="gd-p" />;
          case "stats":
            return <StatRow key={i} items={b.items} note={b.note} />;
          case "list":
            return b.ordered ? (
              <ol key={i} className="gd-list">
                {b.items.map((it, j) => (
                  <li key={j} dangerouslySetInnerHTML={{ __html: it }} />
                ))}
              </ol>
            ) : (
              <ul key={i} className="gd-list">
                {b.items.map((it, j) => (
                  <li key={j} dangerouslySetInnerHTML={{ __html: it }} />
                ))}
              </ul>
            );
          case "steps":
            return (
              <ol key={i} className="gd-steps">
                {b.items.map((st, j) => (
                  <li key={j} className="gd-step">
                    <span className="gd-step-n" aria-hidden="true">
                      {st.n}
                    </span>
                    <div className="gd-step-body">
                      <h3 className="gd-step-h">{st.title}</h3>
                      <Html html={st.html} className="gd-p" />
                    </div>
                    {st.aside && <p className="gd-step-aside">{st.aside}</p>}
                  </li>
                ))}
              </ol>
            );
          case "table":
            return (
              <figure key={i} className="gd-tablewrap">
                <div role="region" aria-label={b.caption ?? "Table"} tabIndex={0} className="gd-tablescroll">
                  <table className="gd-table">
                    {b.caption && <caption className="gd-caption">{b.caption}</caption>}
                    <thead>
                      <tr>
                        {b.head.map((h, j) => (
                          <th key={j} scope="col">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((r, j) => (
                        <tr key={j}>
                          {r.map((c, k) =>
                            k === 0 && b.firstColHeader ? (
                              <th key={k} scope="row" dangerouslySetInnerHTML={{ __html: c }} />
                            ) : (
                              <td key={k} dangerouslySetInnerHTML={{ __html: c }} />
                            )
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {b.note && <figcaption className="gd-note">{b.note}</figcaption>}
              </figure>
            );
          case "quote":
            return (
              <blockquote key={i} className="gd-quote">
                <p>{b.text}</p>
                {b.by && <cite>{b.by}</cite>}
              </blockquote>
            );
          case "callout":
            return (
              <aside key={i} className={`gd-callout gd-callout--${b.tone ?? "leaf"}`}>
                {b.title && <p className="gd-callout-t">{b.title}</p>}
                <Html html={b.html} as="div" className="gd-callout-b" />
              </aside>
            );
          case "note":
            return (
              <p key={i} className="gd-note">
                {b.text}
              </p>
            );
          case "qa": {
            // Questions sit one level under the nearest heading so the outline never skips a level.
            const Q = blocks.slice(0, i).some((x) => x.t === "h2") ? "h3" : "h2";
            return (
              <dl key={i} className="gd-qa">
                {b.items.map((q) => (
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
        }
      })}
    </>
  );
}
