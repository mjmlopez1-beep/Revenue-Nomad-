"use client";

/**
 * The questions members ask, with the answers the rules give today. The landing page shows them
 * under "Questions", and the app's "Questions and feedback" sheet reuses this component, so the
 * two never say different things. Styles are in questions.css (classes lp-faq and lp-qa), which
 * this file imports, so the app gets them without the rest of the landing page's CSS.
 */
import "./questions.css";
import { EARN_CAP, REFERRAL_BONUS } from "@/lib/tableFields";
import { mailto } from "./contact";

/** Unlocks an account gets in its first 24 hours, then in any 24 hours after (the server's limits). */
const DAY_ONE_UNLOCKS = 25;
const DAILY_UNLOCKS = 100;

/** The questions and answers, with the starter balance the server actually gives. */
export function faqItems(starter: number): [string, string][] {
  return [
    [
      "Where does all of this come from?",
      "From fractional work members published on Revenue Nomad, member success stories, our own research into current fractional seats and a weekly check for open fractional GTM roles. Members add the rest, one fact at a time.",
    ],
    [
      "Who can add what?",
      "A seat is added by the person who held it, and only they add facts about it, like the role, the rate or the hours a week. Every member can add company facts, like the website, HQ or size, and people, like who hired for a seat.",
    ],
    [
      "What will other members see about me?",
      "Your name and title show on seats you held, behind a lock that costs a member 1 credit. Only you can add a seat you held, and only you add facts about it. Your email is never shown, and a fact you add never says who added it. Work a member marked anonymous on Revenue Nomad is left out.",
    ],
    [
      "What happens to a rate I share?",
      "A rate you add to a seat sits behind a lock, and a member spends 1 credit to see it. It also counts in the rate benchmarks. Or you can share a rate for the benchmarks only. Then it counts in the medians and is never shown with your name or the seat. A benchmark shows a number only once at least 5 different people have a rate in it, and it never says who they are.",
    ],
    [
      "What if something is wrong?",
      "Report it. It is hidden for you right away, and for everyone once a second member reports it, until we review it. A seat holder's report on their own seat hides it at once. A job posting that is still listed stays up for others while we check. If we remove a fact, the member who added it loses that credit and everyone who unlocked it gets theirs back.",
    ],
    [
      `Why can I only earn ${EARN_CAP} credits a day?`,
      `So nobody has a reason to add guesses for credits. Invite and confirmation bonuses count toward the ${EARN_CAP}. A bonus that would take you past it is held and paid when you have room.`,
    ],
    [
      "Is there a limit on unlocking?",
      `Yes. A new account can unlock ${DAY_ONE_UNLOCKS} facts in its first 24 hours and ${DAILY_UNLOCKS} a day after that.`,
    ],
    [
      "How do invites work?",
      `Invite a fractional you trust with your invite link. You each get ${REFERRAL_BONUS} credits when they add their first fact to a company or a seat. A rate shared only for the benchmarks doesn't count, and invites from the same network earn no bonus.`,
    ],
    [
      "What does it cost?",
      `Nothing. The pilot is free and you start with ${starter} credits. If you run low, add something you know or invite a fractional you trust.`,
    ],
  ];
}

export interface QuestionsProps {
  /** Credits a new member starts with (View.stats.starter). */
  starter: number;
  /** View.contact.support. When set, a last line says where to send anything else. */
  support?: string | null;
}

/** The questions as a list of open-and-close rows. */
export function Questions({ starter, support }: QuestionsProps) {
  const href = support ? mailto(support, "Trading Post question") : null;
  return (
    <div className="lp-faq">
      {faqItems(starter).map(([q, a]) => (
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
