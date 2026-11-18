/**
 * The questions members ask, with the answers the rules give today (Questions.tsx shows them on
 * the landing page and in the app's "Questions and feedback" sheet). Pure, so
 * scripts/test-prices.mts can check what they say about prices.
 */
import { EARN_CAP, REFERRAL_BONUS } from "@/lib/tableFields";
import { SCAN_ROLE_FREE } from "./prices";

/** Unlocks an account gets in its first 24 hours, then in any 24 hours after (the server's limits). */
const DAY_ONE_UNLOCKS = 25;
const DAILY_UNLOCKS = 100;

/** The questions and answers, with the starter balance the server actually gives. `scanRoleFree`: lib/tableFields SEAT_SCAN_ROLE_FREE. */
export function faqItems(starter: number, intro = false, scanRoleFree = SCAN_ROLE_FREE): [string, string][] {
  return [
    [
      "How do I reach the fractional who held a seat?",
      `Where a seat holder is on file, 1 credit shows who held the seat and the role they held. If they are a member, message them inside Merlin. If not, find them on LinkedIn${intro ? " or ask us for an intro" : ""}. Many seats we found on LinkedIn have nobody named yet, until the fractional who held one claims it.`,
    ],
    [
      "What is an Ideal Fractional Profile?",
      "Your Ideal Fractional Profile is the companies you want as clients: their industry, size, revenue and country. Set it when you join, or any time in Your profile. The table then leads with companies that fit it, and Best fit for you puts the likeliest first.",
    ],
    [
      "Which functions does it cover?",
      "Sales, marketing, RevOps, customer success, partnerships, growth, product marketing, enablement and AI GTM, plus executive, finance, technology, operations, people, product and legal seats where we have them. We check for open roles every week.",
    ],
    [
      "What does an open role cost?",
      "Its title is free. While the role is open, the company behind it is hidden. One credit shows the company and its job posting, with the posted rate and hours when the posting gave them. The people there, and who held its seats, open after the company. When the role closes, everyone sees the company again. Try it on the homepage names a few hiring companies as a sample.",
    ],
    [
      "What does a seat cost to see?",
      `Its function, type of work, status, start month, why they hired and hours a week are free. So is its end month while the seat is still going. Who held it and the role they held are one unlock, 1 credit for both. A dated end month on a seat that ended, how it was sourced and the rate are 1 credit each. ${
        scanRoleFree ? "On a seat with nobody named yet, the role is free." : "On a seat with nobody named yet, the role is 1 credit on its own."
      }`,
    ],
    [
      "What does a hiring contact cost?",
      "A person's name and title are one unlock. One credit shows both. Their LinkedIn, email and phone open after that, 1 credit each. How they relate to the seat, like Decision maker, is free.",
    ],
    [
      "How do I get alerts for new roles?",
      "Each week we email you the new open roles in your function. Save a view with the weekly email on and you also get the new roles that match it. For a post the moment a role fits you, connect Slack or any tool by webhook in Integrations.",
    ],
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
      "Your name and title show on seats you held, with the role you held there, behind one lock that costs a member 1 credit. Only you can add a seat you held, and only you add facts about it. Your email is never shown, and a fact you add never says who added it. Work a member marked anonymous on Revenue Nomad is left out.",
    ],
    [
      "What happens to a rate I share?",
      "A rate you add to a seat sits behind a lock, and a member spends 1 credit to see it. It also counts in the rate benchmarks. Or you can share a rate for the benchmarks only. Then it counts in the medians and is never shown with your name or the seat. A benchmark shows a number only once 5 people have a rate in it, or 20 where survey data is included. It never says who they are.",
    ],
    [
      "What if something is wrong?",
      "Report it. You stop seeing it right away, and so does everyone once a second member reports it, until we review it. A seat holder's report on their own seat hides it at once. A job posting that is still listed stays up for others while we check. If we remove a fact, the member who added it loses that credit and everyone who unlocked it gets theirs back.",
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
      `Invite a fractional you trust with your invite link. You each get ${REFERRAL_BONUS} credits when they add their first fact to a company or a seat. A rate shared only for the benchmarks doesn't count, and there is no bonus when you both join from the same internet connection.`,
    ],
    [
      "What does it cost?",
      `Nothing. The pilot is free and you start with ${starter} credits. If you run low, add something you know or invite a fractional you trust.`,
    ],
  ];
}
