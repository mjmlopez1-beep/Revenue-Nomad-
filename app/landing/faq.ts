/**
 * The questions members ask, with the answers the rules give today (Questions.tsx shows them on
 * the landing page and in the app's "Questions and feedback" sheet). Pure, so
 * scripts/test-prices.mts can check what they say about prices.
 */
import { COMPANY_PRICE_SAY, EARN_CAP, NAME_HIDDEN_SAY, PRO_OPENS_DAILY, REFERRAL_BONUS, OPENS_RULE, seatNameWho } from "@/lib/tableFields";
import { FREE_MCP_PER_DAY, FREE_SAVED_VIEWS, PRICES, TOPUP_CREDITS, TRIAL_LABEL, WORKFLOW_PLAN } from "@/lib/billing/rules";
import { SCAN_ROLE_FREE } from "./prices";
import { FEATURE_NAME } from "@/lib/radar/types";
import { RATE_FLOOR, RATE_INDEX_FLOOR } from "@/lib/rates";

/** Unlocks an account gets in its first 24 hours, then in any 24 hours after (the server's limits). */
const DAY_ONE_UNLOCKS = 25;
const DAILY_UNLOCKS = 100;

/**
 * The questions a visitor asks before joining, in the order the landing page leads with them
 * (Questions.tsx `first`). The rest follow in the order below. A title that no longer matches a
 * question is skipped.
 */
export const FAQ_LEAD = [
  "What does it cost?",
  "Which functions does it cover?",
  "Where does all of this come from?",
  "How do I reach the fractional who held a seat?",
  "What will other members see about me?",
  "What happens to a rate I share?",
];

/**
 * Which switchable features are on (View.live, signed out): a question about one that is off is
 * left out. The app's sheet passes nothing, so it names neither.
 */
export interface FaqLive {
  workflows?: boolean;
  google?: boolean;
}

/** The questions and answers, with the starter balance the server actually gives. `scanRoleFree`: lib/tableFields SEAT_SCAN_ROLE_FREE. */
export function faqItems(starter: number, intro = false, scanRoleFree = SCAN_ROLE_FREE, live: FaqLive = {}): [string, string][] {
  const wf = WORKFLOW_PLAN;
  const known = live.google ? "your connections file, a contacts file, or Google" : "your connections file or a contacts file";
  const items: ([string, string] | null)[] = [
    [
      "How do I reach the fractional who held a seat?",
      `Where a seat holder is on file, who held the seat and the role they held are free to see once you can see the company: fellow fractionals never cost a credit. If they are a member, message them inside Merlin. If not, Invite to connect gives you a note and a link to their seat. When they claim it, a conversation opens between you, and if they're new to Merlin you both get ${REFERRAL_BONUS} credits. Many seats Revenue Nomad found have nobody named yet, until the fractional who held one claims it.`,
    ],
    [
      "Can I take my name off a seat?",
      "Yes, and you don't need an account. Open Remove my name, type your name and the company, and it comes off at once. Anyone who paid to see it gets the credit back. If we sent you a link about your seat, it has the same button.",
    ],
    [
      "What is your ideal client?",
      "Your ideal client is the companies you want as clients: their industry, size, revenue and country. Set it when you join, or any time in Settings. The table then leads with companies that fit it, and Best fit for you puts the likeliest first.",
    ],
    [
      "Which functions does it cover?",
      "Sales, marketing, RevOps, customer success, partnerships, growth, product marketing, enablement and AI GTM, plus executive, finance, technology, operations, people, product and legal seats where we have them. We check for open roles every week.",
    ],
    [
      "What does an open role cost?",
      "Its title is free, and so are the company's industry, size, revenue and region. The company's name is locked, as every company's is until you unlock it. 2 credits show the company and the job posting of each open role there, with the posted rate and hours when the posting gave them. On Pro and the trial, companies open free, up to ${PRO_OPENS_DAILY} a day. The people there open after the company, and so do who held its seats, free. The preview on the homepage names a few hiring companies as a sample.",
    ],
    [
      "What does a seat cost to see?",
      `Its function, type of work, status, start month, why they hired and hours a week are free. So is its end month while the seat is still going. Who held it and the role they held are free once you can see the company. A dated end month on a seat that ended, how it was sourced and the rate are 1 credit each. ${
        scanRoleFree ? "On a seat with nobody named yet, the role is free." : "On a seat with nobody named yet, the role is 1 credit on its own."
      }`,
    ],
    [
      "What does a hiring contact cost?",
      "A person's name and title are one unlock. One credit shows both. Their profile link, email and phone open after that, 1 credit each. How they relate to the seat, like Decision maker, is free.",
    ],
    [
      "How do alerts work?",
      `Save any search as a list and put an alert on it, or follow a company. Pick what you want to hear about: a new open role, a new fractional hire, a seat ended, a new decision maker (from the company's own website), a fact changed, or the company raised funding (as its SEC filing says). It comes by email, in Slack or in the bell. On Free, ${FREE_SAVED_VIEWS} list has an alert, by email and the bell, each morning or weekly. On Pro and Close every list can have one, as it happens, in Slack too, and a new decision maker is part of Pro. Each week we also email you the new open roles in your function.`,
    ],
    live.workflows
      ? [
          "What are workflows?",
          `Workflows are in Beta. A workflow is an alert that also takes the next step: when this happens, then do this. It can add the company to your pipeline, find your way in, remind you, open the company or who decides there, or draft a note. Before you turn one on you see what each step costs and an estimate for each run, and you can set a monthly limit. Nothing is ever sent for you: a note waits as a draft in Messages. Free has ${wf.free.flows} workflow with the free steps, Pro up to ${wf.pro.flows} with the steps that cost credits, and Close up to ${wf.close.flows}, with proposal triggers and the Evidence Bank step.`,
        ]
      : null,
    [
      "How does Merlin find a warm way in?",
      `Each company's record shows your ways in: the fractional who held the seat, the person who hired them, and anyone you know there. To see who you know, bring in ${known}. Each works on its own and is optional, and only you see the people in them. When someone you know starts as a leader at another company, Merlin can tell you.`,
    ],
    live.google
      ? [
          "What does Merlin do with my Google account?",
          "Only what you connect, and only for you. Merlin reads your calendar events without their title, description, location or attachments, and your contacts' names, email addresses, companies and titles, to find who you know at a company. If you add Gmail, only who each email was between and when, never its subject or text. What comes from Google stays on your own screens: it is never shown to another member or an admin, and never added to Merlin. Disconnect and it is deleted. Your connections file and a contacts file work without Google.",
        ]
      : null,
    [
      "What are lookalikes?",
      "More companies like your past clients. Merlin starts from the companies where you held a seat, and you can add or take off any company you can see, like a current client. It reads what they share (industry, size, revenue, region, the functions they hired fractionals for, and whether they hire again) and lists the companies that share the most, with why each one matched. Save it as a list with an alert.",
    ],
    [
      "Can I use Merlin from my own AI assistant?",
      `Yes. Agent access connects Merlin to an assistant you use, such as Claude, so it can search, read and add to Merlin as you. A switch for each kind of action says what it may do. It uses your credits at the same prices as the app, tells you the cost and asks before it spends one. There is no daily spend limit unless you set one. Free allows ${FREE_MCP_PER_DAY} requests a day, and Pro and Close have no daily cap.`,
    ],
    [
      "What is the Evidence Bank?",
      "Your past results, kept as cases. Merlin matches the ones closest to a company or a proposal, so you can show a client work like theirs. A case holds only the numbers you type. It is part of Close, and of your trial.",
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
      `Your name shows on seats you held, with the role you held there. ${seatNameWho()} ${seatNameWho(false)} ${NAME_HIDDEN_SAY} Only you can add a seat you held, and only you add facts about it. Your email is never shown, and a fact you add never says who added it. Work a member marked anonymous on Revenue Nomad is left out.`,
    ],
    [
      "What happens to a rate I share?",
      `A rate you add to a seat sits behind a lock, and a member spends 1 credit to see it. It also counts in the rate benchmarks. Or you can share a rate for the benchmarks only. Then it counts in the medians and is never shown with your name or the seat. A benchmark shows a number only once ${RATE_FLOOR} people have a rate in it, or ${RATE_INDEX_FLOOR} where survey data is included. It never says who they are.`,
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
      `Invite a fractional you trust with your invite link. You each get ${REFERRAL_BONUS} credits when they add their first fact to a company that's already on Merlin, or claim their seat through your Invite to connect link. A rate shared only for the benchmarks doesn't count, and there is no bonus when you both join from the same internet connection.`,
    ],
    [
      "What is Fractionals?",
      "A directory of fractionals, one record each: their function and level, their seats now and past, and the kind of clients they serve. It never costs a credit: members who choose to be shown are free to see and message, and someone not on Merlin yet shows by name, so you can invite them with your own link. Your profile has the switch that shows you there or keeps you out.",
    ],
    [
      "What does it cost?",
      `There's a Free plan: you start with ${starter} credits, earn 1 for each fact you add, and open one company a day from your ${FEATURE_NAME} for free, with everything on it. Other companies are ${COMPANY_PRICE_SAY}. ${OPENS_RULE} Pro is $${PRICES.month} a month or $${PRICES.year} a year. Close adds proposals drafted from your call, sent and signed, and the Evidence Bank: $${PRICES.closeMonth} a month or $${PRICES.closeYear} a year. Every new member starts with a ${TRIAL_LABEL}, no card needed, and it ends into Free on its own. A top-up is $${PRICES.topup} for ${TOPUP_CREDITS} credits, on any plan.`,
    ],
  ];
  return items.filter((x): x is [string, string] => x !== null);
}
