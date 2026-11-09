"use client";

import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import "./InTheirWords.css";

/**
 * In their words (design 4.1 row 11). Three verified reviews, one visible at a time, advancing every
 * 9 seconds. Previous, next and pause/play buttons; the quote region is aria-live="polite" only while
 * paused or held (WAI-ARIA carousel pattern: live off during auto-rotation). Under
 * prefers-reduced-motion all three render stacked with no timer and no controls. Reviewers are
 * initials avatars (A5); no photos or company logos ship.
 */

type Review = {
  quote: string;
  name: string;
  title: string;
  company: string;
  /** The artboard prints the "Verified review - 5/5, would hire again" line on these. */
  rated: boolean;
  tone: "forest" | "night" | "leaf";
};

const REVIEWS: Review[] = [
  {
    quote: "Knowledgeable, responsive, and provided transformative insights and actions to help our growing sales org.",
    name: "Eric B.",
    title: "Account Executive",
    company: "myHR Partner",
    rated: true,
    tone: "forest",
  },
  {
    quote: "I couldn’t recommend working with Matt and his team more. I hope to work with him again on future growth projects.",
    name: "Trista Kempa",
    title: "COO",
    company: "Ferry",
    rated: true,
    tone: "night",
  },
  {
    quote:
      "Jeff has been fantastic to work with... I do feel 100% confident that Jeff was the right choice for what we needed at this stage of the game.",
    name: "Neil Trickett, PT",
    title: "CEO",
    company: "Practice Promotions",
    rated: false,
    tone: "leaf",
  },
];

const INTERVAL_MS = 9000;
const STAR = "M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.7l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z";

function ReviewCard({ review, position }: { review: Review; position: number }) {
  return (
    <figure className="itw-review">
      <div className="itw-copy">
        <span className="rn-sr-only">
          Review {position} of {REVIEWS.length}.
        </span>
        <blockquote className="itw-quote">
          <span className="itw-mark" aria-hidden="true">
            {"\u201C"}
          </span>
          {review.quote}
          <span className="itw-mark" aria-hidden="true">
            {"\u201D"}
          </span>
        </blockquote>
        <figcaption className="itw-by">
          <span className="itw-person">
            <b className="itw-name">{review.name}</b>
            <span className="itw-title">
              {review.title}, {review.company}
            </span>
          </span>
          {review.rated && (
            <span className="itw-rating">
              <span className="itw-stars" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <svg key={i} width="15" height="15" viewBox="0 0 20 20">
                    <path d={STAR} fill="currentColor" />
                  </svg>
                ))}
              </span>
              Verified review - 5/5, would hire again
            </span>
          )}
        </figcaption>
      </div>
      <div className="itw-visual" aria-hidden="true">
        <div className="itw-visual-inner">
          <Avatar name={review.name} size={340} tone={review.tone} />
        </div>
      </div>
    </figure>
  );
}

export default function InTheirWords() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [resting, setResting] = useState(false); // hovered or focused: hold the slide without changing the button

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduced || paused || resting) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % REVIEWS.length), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, reduced, resting]);

  const go = (step: number) => setIndex((i) => (i + step + REVIEWS.length) % REVIEWS.length);

  return (
    <section
      className="itw rn-section"
      aria-labelledby="itw-h"
      onMouseEnter={() => setResting(true)}
      onMouseLeave={() => setResting(false)}
      onFocus={() => setResting(true)}
      onBlur={() => setResting(false)}
    >
      <div className="rn-wrap">
        <div className="itw-top">
          <h2 id="itw-h" className="rn-eyebrow">
            In their words
          </h2>
          {!reduced && (
            <div className="itw-controls">
              <span className="itw-dots" aria-hidden="true">
                {REVIEWS.map((r, i) => (
                  <span key={r.name} className={`itw-dot${i === index ? " itw-dot--on" : ""}`} />
                ))}
              </span>
              <div className="itw-nav">
                <button type="button" className="itw-arrow" aria-label="Previous review" onClick={() => go(-1)}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M9 2.5L4.5 7 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button type="button" className="itw-arrow" aria-label="Next review" onClick={() => go(1)}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M5 2.5L9.5 7 5 11.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="itw-arrow"
                  aria-label={paused ? "Play the reviews" : "Pause the reviews"}
                  aria-pressed={paused}
                  onClick={() => setPaused((p) => !p)}
                >
                  {paused ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M4 2.5v9l7-4.5z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M4 2.5v9M10 2.5v9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {reduced ? (
          <div className="itw-stack">
            {REVIEWS.map((r, i) => (
              <ReviewCard key={r.name} review={r} position={i + 1} />
            ))}
          </div>
        ) : (
          <div className="itw-stage" aria-live={paused || resting ? "polite" : "off"} aria-atomic="true">
            <ReviewCard key={REVIEWS[index].name} review={REVIEWS[index]} position={index + 1} />
          </div>
        )}
      </div>
    </section>
  );
}
