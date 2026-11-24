"use client";

/**
 * The deck view of a proposal (RN_PROPOSALS2): the document as 16:9 slides (lib/proposals/deck.ts),
 * and Download PDF, which prints the slides one to a landscape page through the browser's own
 * PDF (deck.css's print rules): nothing else of the page prints. A view only: edits happen in the
 * document, and the deck reads them as they are.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { deckOf, type Deck as DeckT, type DeckSlide } from "@/lib/proposals/deck";
import "./deck.css";

function Footer({ footer, n, total, eyebrow }: { footer: string; n: number; total: number; eyebrow: string }) {
  const pg = `${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  return (
    <>
      <div className="dk-top">
        <span>{eyebrow}</span>
        <span>{pg}</span>
      </div>
      <div className="dk-foot">
        <span>{footer}</span>
        <span>
          {eyebrow ? `${eyebrow.split(" / ")[0]} · ` : ""}
          {pg}
        </span>
      </div>
    </>
  );
}

function Slide({ s, n, total, footer }: { s: DeckSlide; n: number; total: number; footer: string }) {
  const dark = s.kind === "cover" || s.kind === "thesis";
  const eyebrow = s.kind === "cover" ? "" : s.eyebrow;
  return (
    <section className="dk-slide" data-kind={s.kind} data-dark={dark || undefined} aria-label={`Slide ${n} of ${total}`}>
      {s.kind !== "cover" && <Footer footer={footer} n={n} total={total} eyebrow={eyebrow} />}
      {s.kind === "cover" && (
        <div className="dk-cover">
          <div className="dk-top">
            <span className="dk-brand">{footer}</span>
          </div>
          <p className="dk-kicker">{s.eyebrow}</p>
          <h1 className="dk-h1">
            {s.title} {s.accent && <em>{s.accent}</em>}
          </h1>
          {s.sub && <p className="dk-sub">{s.sub}</p>}
          {s.stats.length > 0 && (
            <p className="dk-stats">
              {s.stats.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </p>
          )}
          <div className="dk-foot">
            <span>{s.prepared}</span>
            <span>
              01 / {String(total).padStart(2, "0")}
            </span>
          </div>
        </div>
      )}
      {s.kind === "cards" && (
        <>
          <header className="dk-head">
            <h2 className="dk-h2">{s.title}</h2>
            {s.note && <p className="dk-note">{s.note}</p>}
          </header>
          <div className="dk-cards" data-cols={s.cols}>
            {s.cards.map((c, i) => (
              <article key={i} className="dk-card" data-dark={c.dark || undefined}>
                {c.tag ? <span className="dk-tag">{c.tag}</span> : c.n && <span className="dk-n">{c.n}</span>}
                {c.title && <h3>{c.title}</h3>}
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </>
      )}
      {s.kind === "thesis" && (
        <>
          <p className="dk-thesis">{s.line}</p>
          <div className="dk-cols">
            {s.cols.map((c, i) => (
              <div key={i}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {s.kind === "rows" && (
        <>
          <header className="dk-head">
            <h2 className="dk-h2">{s.title}</h2>
            {s.note && <p className="dk-note">{s.note}</p>}
          </header>
          <ol className="dk-rows">
            {s.rows.map((r, i) => (
              <li key={i}>
                <span className="dk-rn">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{r.title}</h3>
                  {r.body && <p>{r.body}</p>}
                </div>
                {r.aside && (
                  <div className="dk-aside">
                    {s.aside && <span className="dk-tag">{s.aside}</span>}
                    <p>{r.aside}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {s.kind === "plan" && (
        <>
          <header className="dk-head">
            <h2 className="dk-h2">{s.title}</h2>
          </header>
          <div className="dk-clock" aria-hidden>
            <span className="dk-clock-a">{s.phases[0]?.head ?? "Assessment"}</span>
            <span className="dk-clock-d" />
            <span className="dk-clock-b">{s.phases.slice(1).map((p) => p.head).join("  ·  ") || "Design and deploy"}</span>
          </div>
          {s.decision && (
            <p className="dk-decision">
              <strong>Day 30 · The decision</strong> {s.decision}
            </p>
          )}
          <div className="dk-phases" data-n={s.phases.length}>
            {s.phases.map((p, i) => (
              <div key={i} className="dk-phase">
                <h3>
                  {p.when && <span>{p.when} · </span>}
                  {p.head}
                </h3>
                <ul>
                  {p.items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                {p.deliverable && (
                  <p className="dk-deliv">
                    <span className="dk-tag">Deliverable</span>
                    {p.deliverable}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {s.kind === "bridge" && (
        <>
          <header className="dk-head">
            <h2 className="dk-h2">{s.title}</h2>
            {s.lead && <p className="dk-note">{s.lead}</p>}
          </header>
          <div className="dk-bridge">
            {s.steps.map((x, i) => (
              <div key={x} className="dk-step" data-dark={i === 0 || undefined}>
                <span className="dk-tag">{x}</span>
                <strong>{i === 0 ? "$?" : "?%"}</strong>
              </div>
            ))}
          </div>
          <p className="dk-note dk-small">The numbers come from your own data in the first 30 days. Merlin never fills them in.</p>
        </>
      )}
      {s.kind === "org" && (
        <>
          <header className="dk-head">
            <h2 className="dk-h2">{s.title}</h2>
          </header>
          <div className="dk-org">
            <div className="dk-org-chart">
              <span className="dk-node" data-dark>
                {s.top}
              </span>
              <div className="dk-org-row">
                {s.beside.map((x) => (
                  <span key={x} className="dk-node">
                    {x}
                  </span>
                ))}
                <span className="dk-node" data-pine>
                  {s.operator.replace(/,\s*reports to.*$/i, "") || "Operator"}
                </span>
              </div>
            </div>
            <p className="dk-why">
              {s.operator}
              {s.why ? `. ${s.why}` : ""}
            </p>
          </div>
        </>
      )}
      {s.kind === "logos" && (
        <>
          <header className="dk-head">
            <h2 className="dk-h2">{s.title}</h2>
          </header>
          {s.names.length > 0 && (
            <div className="dk-logos">
              {s.names.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          )}
          {s.text && <p className="dk-text">{s.text}</p>}
        </>
      )}
      {s.kind === "list" && (
        <>
          <header className="dk-head">
            <h2 className="dk-h2">{s.title}</h2>
          </header>
          {s.text && <p className="dk-text">{s.text}</p>}
          {s.items.length > 0 && (
            <ul className="dk-list">
              {s.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** The slides, for the page and for printing. */
export function DeckSlides({ deck }: { deck: DeckT }) {
  return (
    <div className="dk-slides">
      {deck.slides.map((s, i) => (
        <Slide key={i} s={s} n={i + 1} total={deck.slides.length} footer={deck.footer} />
      ))}
    </div>
  );
}

export function DeckView({ blocks, fields, from, to }: { blocks: { blockId: string; title: string; body: string }[]; fields: Record<string, string>; from: string; to: string }) {
  const deck = deckOf({ blocks, fields, from, to });
  const [printing, setPrinting] = useState(false);
  const print = () => {
    setPrinting(true);
    // The slides alone, one to a page, then the browser's Save as PDF.
    window.setTimeout(() => {
      document.body.classList.add("dk-printing");
      window.print();
      document.body.classList.remove("dk-printing");
      setPrinting(false);
    }, 60);
  };
  return (
    <div className="dk" data-deck>
      <div className="dk-bar">
        <span className="p2-muted">
          {deck.slides.length} slides. A view of the document: edit it there.
        </span>
        <button type="button" className="btn btn-pine btn-sm" onClick={print}>
          Download PDF
        </button>
      </div>
      <DeckSlides deck={deck} />
      {printing && typeof document !== "undefined" && createPortal(<div className="dk-print-root"><DeckSlides deck={deck} /></div>, document.body)}
    </div>
  );
}
