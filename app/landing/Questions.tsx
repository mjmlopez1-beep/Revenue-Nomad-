"use client";

/**
 * The questions members ask, with the answers the rules give today (faq.ts). The landing page
 * shows them under "Questions", and the app's "Questions and feedback" sheet reuses this
 * component, so the two never say different things. Styles are in questions.css (classes lp-faq
 * and lp-qa), which this file imports, so the app gets them without the rest of the landing
 * page's CSS.
 */
import "./questions.css";
import { faqItems } from "./faq";
import { mailto } from "./contact";

export { faqItems } from "./faq";

export interface QuestionsProps {
  /** Credits a new member starts with (View.stats.starter). */
  starter: number;
  /** View.contact.support. When set, a last line says where to send anything else. */
  support?: string | null;
  /** View.contact.intro is set: we make intros, so the answers can say so. */
  intro?: boolean;
}

/** The questions as a list of open-and-close rows. */
export function Questions({ starter, support, intro = false }: QuestionsProps) {
  const href = support ? mailto(support, "Merlin question") : null;
  return (
    <div className="lp-faq">
      {faqItems(starter, intro).map(([q, a]) => (
        <details key={q} className="lp-qa">
          <summary>
            <span>{q}</span>
            <span className="lp-qa-icon" aria-hidden />
          </summary>
          <p>{a}</p>
        </details>
      ))}
      {support ? (
        <p className="lp-faq-more">
          Something else? Email{" "}
          {href ? (
            <a className="mono" href={href}>
              {support}
            </a>
          ) : (
            <span className="mono">{support}</span>
          )}{" "}
          and we&apos;ll get back to you.
        </p>
      ) : null}
    </div>
  );
}

export default Questions;
