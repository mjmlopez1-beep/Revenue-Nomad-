/**
 * What members say (quotes.ts). Nothing is drawn while that list is empty: no heading, no space.
 */
import { QUOTES, type Quote } from "./quotes";

export default function Quotes({ quotes = QUOTES }: { quotes?: Quote[] }) {
  if (!quotes.length) return null;
  return (
    <section className="lp-sec lp-quotes" aria-labelledby="quotes-h">
      <div className="lp-wrap">
        <div className="lp-sec-head lp-sec-head-c">
          <h2 className="lp-h2" id="quotes-h">
            What members say
          </h2>
        </div>
        <ul className="lp-quote-list">
          {quotes.map((q) => (
            <li key={`${q.name}-${q.quote.slice(0, 24)}`} className="lp-quote">
              <figure>
                <blockquote>
                  <p>{q.quote}</p>
                </blockquote>
                <figcaption>
                  <span className="lp-quote-name">{q.name}</span>
                  <span className="lp-quote-title">{q.title}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
