"use client";

/**
 * The questions members ask, with the answers the rules give today (faq.ts). The landing page
 * shows them under "Questions", and the app's "Questions and feedback" sheet reuses this
 * component, so the two never say different things. Styles are in questions.css (classes lp-faq
 * and lp-qa), which this file imports, so the app gets them without the rest of the landing
 * page's CSS.
 */
import { useState } from "react";
import "./questions.css";
import { FAQ_LEAD, faqItems } from "./faq";
import { mailto } from "./contact";

export { faqItems } from "./faq";

export interface QuestionsProps {
  /** Credits a new member starts with (View.stats.starter). */
  starter: number;
  /** View.contact.support. When set, a last line says where to send anything else. */
  support?: string | null;
  /** View.contact.intro is set: we make intros, so the answers can say so. */
  intro?: boolean;
  /**
   * The landing page's lighter list: the questions a visitor asks first (faq.ts FAQ_LEAD) lead,
   * only this many show until "Show all" is pressed, and one answer is open at a time. Left out
   * (the app's sheet), every question shows in faq.ts order.
   */
  first?: number;
}

/** The questions as a list of open-and-close rows. */
export function Questions({ starter, support, intro = false, first }: QuestionsProps) {
  const href = support ? mailto(support, "Merlin question") : null;
  const [all, setAll] = useState(false);
  const every = faqItems(starter, intro);
  const light = first !== undefined;
  const ordered = light ? [...FAQ_LEAD.flatMap((q) => every.filter(([x]) => x === q)), ...every.filter(([x]) => !FAQ_LEAD.includes(x))] : every;
  const shown = light && !all ? ordered.slice(0, first) : ordered;
  return (
    <div className="lp-faq">
      {shown.map(([q, a]) => (
        // One name for the group: opening an answer closes the one that was open.
        <details key={q} className="lp-qa" name={light ? "lp-faq" : undefined}>
          <summary>
            <span>{q}</span>
            <span className="lp-qa-icon" aria-hidden />
          </summary>
          <p>{a}</p>
        </details>
      ))}
      {light && !all && ordered.length > shown.length ? (
        <button type="button" className="lp-faq-all num" onClick={() => setAll(true)}>
          Show all {ordered.length} questions
        </button>
      ) : null}
      <p className="lp-faq-more">
        Want your name off a seat? <a href="/remove">Remove my name</a>
      </p>
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
