/**
 * The four "Solve a problem" pages. Copy from the artboards "Desktop - Scaling beyond founder-led sales",
 * "Pipeline beyond your network", "A forecast the board believes" and "AI that pays for itself".
 * Rate figures come from the Rate Index (data/rate-index.json); inbound-request figures from numbers.ts.
 */
import rateIndex from "@/data/rate-index.json";
import type { NumberKey } from "../home/content/numbers";
import type { Route } from "../home/content/links";

export type Stat = { id?: NumberKey; value?: string; label: string };
export type FixCard = { kicker: string; title: string; body: string; price: string; priceNote: string; cta: string; href: Route };
export type Faq = { q: string; a: string };
export type Step = { n: number; kicker: string; title: string; body: string; result?: string };

export type Solution = {
  slug: string;
  eyebrow: string;
  title: string;
  lede: string;
  signsTitle: string;
  signs: string[];
  signsNote?: string;
  stats?: { heading: string; items: Stat[]; source: string };
  why: { statement: string; reasons: { title: string; body: string }[] };
  fixIntro: string;
  fixes: [FixCard, FixCard];
  steps?: { heading: string; intro: string; items: Step[]; note: string };
  comparison?: { heading: string; intro: string; now: string; then: string; rows: { k: string; now: string; then: string }[] };
  results?: { heading: string; items: { id: NumberKey; label: string; company: string }[]; note: string };
  faqs: Faq[];
};

const cat = (name: string) => rateIndex.rates.byCategory.find((c) => c.category === name);
const monthly = (name: string) => rateIndex.engagements.monthlyByCategory.find((c) => c.category === name);
const vp = rateIndex.contracts.bySeat.find((s) => s.seat === "Sales Director or VP of Sales");
const k = (n: number) => `$${Math.round(n / 1000)}k`;
const vpPrice = vp?.monthly ? `${k(vp.monthly.min)} - ${k(vp.monthly.max)}/month` : "See the Rate Index";
const vpHours = vp?.hours ? `${vp.hours.min} to ${vp.hours.max} hours a month` : "";
const med = (name: string) => (cat(name)?.median != null ? `$${cat(name)!.median}/hr median` : "See the Rate Index");
const monthLine = (name: string) => {
  const m = monthly(name);
  return m?.medianMonthly != null && m.n >= 5 ? `$${m.medianMonthly.toLocaleString("en-US")}/month median at about ${m.medianHours} hours` : "";
};
const n = (name: string) => cat(name)?.n ?? 0;

const diagnosticCard = (body: string): FixCard => ({
  kicker: "When you are not sure where to start",
  title: "The Revenue Health Diagnostic",
  body,
  price: "Scoped to the business",
  priceNote: "30 to 60 days",
  cta: "See what the Diagnostic covers",
  href: "/engage/diagnostic",
});

export const solutions: Solution[] = [
  {
    slug: "founder-led-sales",
    eyebrow: "Solutions - founder-led to repeatable",
    title: "Scaling beyond founder-led sales",
    lede:
      "For the company where the founder or CEO still runs all of sales - seller, sales manager and sales leader at once - while running the business. The fix is a sales leader who has taken this off a founder's plate before, so the founder's time goes back to the business.",
    signsTitle: "Is this you?",
    signs: [
      "The founder is in every deal, even the ones they are not closing",
      "The founder runs the weekly pipeline meeting and coaches the reps",
      "Two to five reps wait on the founder for call prep and deal strategy",
      "Deals go dark, and the founder is the one reviving them",
      "The upsell plan for existing clients lives in the founder's head",
    ],
    signsNote: "Two or more? See the fix we place.",
    why: {
      statement: "Founder-led sales is how most good companies start. It stops scaling when the founder is the team's manager, coach and strategist all at once.",
      reasons: [
        { title: "Three jobs, one person", body: "Seller, sales manager and sales leader each need hours in the week. The founder is doing all three around running the business." },
        { title: "The motion lives in one head", body: "How to prep a call, revive a stalled deal or grow an account was never written down, so the team cannot run it alone." },
        { title: "The founder has to actually step back", body: "Operators name owners who cannot hand over authority as the way this handoff fails." },
      ],
    },
    fixIntro: "Most companies with this problem need a sales leader who has built the motion at your stage. If you are not sure what is broken, start with the Diagnostic.",
    fixes: [
      {
        kicker: "The usual answer",
        title: "A fractional VP of Sales",
        body: "They take over the pipeline meeting, rep coaching, call prep and deal strategy, write down what works and build the cadence the team runs without the founder in every deal - embedded 1 to 3 days a week.",
        price: vpPrice,
        priceNote: `from our 2026 contracts, ${vpHours}`,
        cta: "See the VP of Sales page",
        href: "/solutions/vp-sales",
      },
      diagnosticCard("A scored read of the revenue engine across seven pillars and a prioritized roadmap in 30 to 60 days - so the leader you hire works on the right problem first."),
    ],
    stats: {
      heading: "What the data says",
      items: [
        { id: "founderHandoffShare", label: "of the engagements operators described were brought in to take sales off a founder, CEO or owner" },
        { id: "founderContracts", label: "of our direct contracts name the founder handoff in the scope, almost word for word" },
        { id: "glanceResults60", label: "of engagements show a measurable result inside 60 days - usually a documented process the team follows" },
      ],
      source: "The State of Fractional GTM 2027 operator survey and Revenue Nomad signed contracts. Method on the full report.",
    },
    faqs: [
      { q: "Will the founder lose touch with deals?", a: "No. The founder moves from running every deal to a weekly pipeline review. The leader runs the cadence, coaches the reps and brings the founder in where it counts." },
      { q: "Fractional or a full-time VP of Sales?", a: "A team of two to eight reps rarely needs 40 hours a week of leadership. Start fractional, build the system, then decide whether the job is full time - with a working process in place." },
      { q: "What does it cost?", a: `${vpPrice} for a fractional VP of Sales at ${vpHours}, from our 2026 contracts. Rates by role are on the Rate Index.` },
      { q: "What if the founder cannot let go?", a: "Then the engagement will not work. Decide in writing what the leader can decide without asking, and have the founder back the change in front of the team." },
    ],
  },
  {
    slug: "pipeline",
    eyebrow: "Solutions - outbound that runs without you",
    title: "Pipeline beyond your network",
    lede:
      "For the company where pipeline still comes from people the founder knows, and the outbound you tried was more volume - more SDR activity, more automated email - and fewer meetings. The fix is a leader who narrows the target, does the research and runs plays worth answering.",
    signsTitle: "Sound familiar?",
    signs: [
      "Almost every deal traces back to a referral or the founder",
      "SDRs are measured on activity, and the activity is not turning into meetings",
      "Thousands of automated, personalized emails went out and booked almost nothing",
      "The target list is every company that could buy, not the few that should",
      "An SDR agency or AI email tool was tried, and the meetings never turned into deals",
      "Growth has flattened since the network ran out",
    ],
    signsNote: "Your buyers get the same AI-written email from dozens of vendors a week. More volume is not the fix - pressing the team for more activity only adds to the noise.",
    why: {
      statement: "Outbound from five years ago does not work anymore. Everyone has the same AI writing the same email, and more activity makes it worse.",
      reasons: [
        { title: "The inbox is flooded", body: "AI personalization and LinkedIn automation made volume free, so buyers tune it out. An open is not interest." },
        { title: "The target is too wide", body: "A list of every company that could buy spreads the team thin. Meetings come from a narrow segment you know better than anyone." },
        { title: "Activity is the wrong number", body: "Dials and sends are easy to count. Meetings with the right accounts are what move pipeline." },
      ],
    },
    fixIntro: "Most companies with this problem need one of two leaders. Tell us the symptoms and we match the seat - or read both and decide.",
    fixes: [
      {
        kicker: "The usual answer",
        title: "A fractional VP of Sales",
        body: "When the motion itself is the gap. They narrow the segment, build the research, write the plays and run the tests - then hire and coach the SDRs who execute them, embedded 1 to 3 days a week.",
        price: vpPrice,
        priceNote: `from our 2026 contracts, ${vpHours}`,
        cta: "See the VP of Sales page",
        href: "/solutions/vp-sales",
      },
      {
        kicker: "When demand is the blocker",
        title: "A fractional CMO",
        body: "When the sales motion works but there is not enough demand feeding it. They own positioning, the event and conference plan, and a pipeline number marketing can be held to.",
        price: med("Marketing"),
        priceNote: `Rate Index, n=${n("Marketing")}${monthLine("Marketing") ? `; ${monthLine("Marketing")}` : ""}`,
        cta: "See the CMO page",
        href: "/solutions/cmo",
      },
    ],
    steps: {
      heading: "Work smarter, not louder",
      intro: "The answer to a flooded inbox is not more sends. It is fewer, better-chosen accounts and a reason for each one to take the meeting.",
      items: [
        { n: 1, kicker: "Narrow", title: "Pick the segment you can win", body: "Score candidate segments on competition, ROI, how hard they are to sell into and how far the product has to stretch. Pick one, then tighten it from the first meetings." },
        { n: 2, kicker: "Research", title: "Know the account before the call", body: "About 25 accounts per market, four to seven people in each, and the signals that say now - hiring, a system change, what their own customers say." },
        { n: 3, kicker: "Plays", title: "Give them a reason to meet", body: "A dinner tied to a week in their market, a drop-in with a handwritten card, meetings booked around the conferences they already attend, local peer references." },
        { n: 4, kicker: "Test", title: "Two-week sprints", body: "One variable at a time, with decision rules set before the test starts. Measure replies and meetings, ignore opens, and kill what does not work.", result: "Connect rate from under 1% to about 5%" },
        { n: 5, kicker: "Compound", title: "Turn each call into the next meeting", body: "Every conversation becomes a soft referral to the next contact, and email becomes the follow-up written from what the rep learned.", result: "18 meetings with on-target accounts in one week" },
      ],
      note: "From a 2026 outbound rebuild for a healthcare technology company - one fractional operator, two SDRs and two AEs. Figures are meetings and pipeline, not closed revenue.",
    },
    comparison: {
      heading: "Outbound now, or outbound from five years ago?",
      intro: "The tools changed. Most outbound programs did not.",
      now: "Outbound now",
      then: "Outbound five years ago",
      rows: [
        { k: "Target", now: "One narrow segment, about 25 accounts per market", then: "Every company that could buy" },
        { k: "Message", now: "Written from research and what the rep learned on the call", then: "AI-personalized templates at volume" },
        { k: "Channel", now: "Calls, in-person visits and conferences first - email as the follow-up", then: "Email and LinkedIn sequences first" },
        { k: "Scoreboard", now: "Meetings with the right accounts, and replies", then: "Dials, sends and opens" },
        { k: "Iteration", now: "Two-week sprints with decision rules set in advance", then: "Set the sequence and wait" },
      ],
    },
    results: {
      heading: "What pipeline beyond the network looks like",
      items: [
        { id: "outcomeMyHr", label: "monthly new business bookings across an 18-month engagement at", company: "myHR Partner" },
        { id: "outcomeGrowPro", label: "June sales, year over year, in year two at", company: "Grow Pro Agency" },
        { id: "outcomeClarusPipeline", label: "pipeline generation pace, year over year, at", company: "Clarus Care" },
      ],
      note: "Each number is one real engagement, not an average - sources and basis on the case studies page.",
    },
    faqs: [
      { q: "How long until outbound produces pipeline?", a: "Count meetings, not sends, from the first two-week market sprint. In our most recent outbound rebuild the first sprint booked 7 meetings, and the cadence was steady by month two." },
      { q: "Is cold email dead?", a: "Automated email at volume is. Email still works as the follow-up, written from what a rep learned on the call - not as the opening move to a list of thousands." },
      { q: "Should we buy an SDR agency or an AI email tool?", a: "Hire the leader first. Volume tools amplify whatever strategy exists. Without a narrow segment and plays worth answering, they amplify noise." },
      { q: "What does it cost?", a: `${vpPrice} for a fractional VP of Sales from our 2026 contracts. Rates by role are on the Rate Index.` },
    ],
  },
  {
    slug: "forecast",
    eyebrow: "Solutions - CRM, data and RevOps",
    title: "A forecast the board believes",
    lede:
      "For the company where the board asks a question and the answer takes a week. The fix is a revenue operations leader who has built a forecast that holds - the data model, the definitions and the cadence.",
    signsTitle: "Sound familiar?",
    signs: [
      "The forecast misses in both directions, so nobody plans against it",
      "Commit, best case and coverage mean different things to different people",
      "Every team runs on its own numbers",
      "The CRM is a system of record nobody trusts",
      "A board question takes a week of spreadsheet work to answer",
      "A raise, a sale or diligence is coming, and the data will not survive it",
    ],
    signsNote: "Revenue systems and CRM were the most common thing buyers asked us for.",
    stats: {
      heading: "What the data says",
      items: [
        { id: "inboundRevenueSystems", label: "detailed inbound buyer requests named revenue systems and CRM as the first need" },
        { value: med("Revenue Operations"), label: `RevOps rate on the Rate Index (n=${n("Revenue Operations")})` },
        { id: "glanceResults60", label: "of engagements show a measurable result inside 60 days" },
      ],
      source: "The State of Fractional GTM 2027 - inbound requests and operator survey. Rate from the Revenue Nomad Rate Index.",
    },
    why: {
      statement: "An unreliable forecast is rarely a sales problem. It is a data model and a cadence nobody owns.",
      reasons: [
        { title: "Definitions live in heads", body: "Stages, qualification and commit mean what each rep thinks they mean - so the number moves every week." },
        { title: "Nobody owns the data model", body: "The CRM grew one field at a time. Reports disagree because the inputs do." },
        { title: "An admin is not an owner", body: "An admin closes tickets. A forecast you can defend needs someone who owns the system and the cadence." },
      ],
    },
    fixIntro: "Most companies with this problem need a revenue operations leader. If you are not sure whether the data or the motion is the gap, start with the Diagnostic.",
    fixes: [
      {
        kicker: "The usual answer",
        title: "A fractional RevOps leader",
        body: "They own the data model, the stage definitions and the inspection cadence that make the number knowable - often scoped as a project with an end.",
        price: med("Revenue Operations"),
        priceNote: `Rate Index, n=${n("Revenue Operations")}${monthLine("Revenue Operations") ? `; ${monthLine("Revenue Operations")}` : ""}`,
        cta: "See the RevOps page",
        href: "/solutions/revops",
      },
      diagnosticCard("A scored read across seven pillars, including revenue technology, insights and data foundations, with a prioritized roadmap in 30 to 60 days."),
    ],
    faqs: [
      { q: "How fast does the forecast get real?", a: "A bottoms-up forecast cadence is one of the first things an operator stands up - stages and qualification first, then a number reviewed weekly." },
      { q: "We have a CRM admin - is that enough?", a: "An admin closes tickets. A forecast you can defend needs an owner for the data model and the cadence - most teams keep the admin and add the leader." },
      { q: "Should we fix the CRM or switch?", a: "Usually fix. Most forecast problems are definitions and process, not the tool. A switch makes sense only when the data model cannot hold the way you sell." },
      { q: "What does it cost?", a: `Revenue operations leaders list ${med("Revenue Operations")} on the Rate Index${monthLine("Revenue Operations") ? `, ${monthLine("Revenue Operations")} in the engagements operators described` : ""}. Rates by role are on the Rate Index.` },
    ],
  },
  {
    slug: "ai",
    eyebrow: "Solutions - AI across your GTM",
    title: "AI that pays for itself",
    lede:
      "For the company that bought AI tools and is still waiting for the return. The fix is a leader who has put AI into a real revenue team - mapped to the work, adopted by the reps and measured in time and pipeline.",
    signsTitle: "Sound familiar?",
    signs: [
      "AI tools were bought, and almost nobody uses them",
      "Reps still build reports and research accounts by hand",
      "Pilots never made it past the pilot",
      "The board asks for an AI plan and there is no owner for it",
      "Nobody can say which AI spend pays back",
      "The CRM data is not clean enough for AI to work on",
    ],
    signsNote: "Put it into the sales process, automate the follow-up, make the team faster: that is what buyers asked us for.",
    stats: {
      heading: "What the data says",
      items: [
        { id: "aiUseShare", label: "of fractional GTM operators already use AI in delivery" },
        { id: "inboundAi", label: "detailed inbound requests named AI as a need" },
        { id: "aiDemandTrend", label: "AI GTM demand trend on a 1 to 5 scale, among AI GTM operators in our 2027 survey" },
      ],
      source: "The State of Fractional GTM 2027 - operator survey and inbound requests. Method on the full report.",
    },
    why: {
      statement: "AI in go-to-market fails the same way most tools do. It gets bought before anyone maps the work it should do.",
      reasons: [
        { title: "Tools before process", body: "Nobody mapped the revenue process to the task level, so the tool has nothing specific to replace." },
        { title: "Nobody owns adoption", body: "Demos are easy. Adoption is the whole job, and it needs an owner who measures usage, not deployment." },
        { title: "The data is not ready", body: "Scoring, routing and forecasting with AI need clean data foundations first." },
      ],
    },
    fixIntro: "Most companies with this problem need a leader who has shipped AI into a revenue team. Start with the Diagnostic if you want the opportunities mapped first.",
    fixes: [
      {
        kicker: "The usual answer",
        title: "A fractional AI GTM leader",
        body: "They map the revenue process to the task level, pick what to automate, ship it into the workflow and measure adoption - lead scoring, outbound, call insights and forecasting.",
        price: med("AI GTM"),
        priceNote: `Revenue Nomad Rate Index, n=${n("AI GTM")}${monthLine("AI GTM") ? `; ${monthLine("AI GTM")}` : ""}`,
        cta: "Talk to us",
        href: "/talk",
      },
      {
        kicker: "When you want the map first",
        title: "The Revenue Health Diagnostic",
        body: "The AI pillar maps where AI can raise seller effectiveness and GTM efficiency, with a prioritized roadmap in 30 to 60 days.",
        price: "Scoped to the business",
        priceNote: "30 to 60 days",
        cta: "See what the Diagnostic covers",
        href: "/engage/diagnostic",
      },
    ],
    faqs: [
      { q: "Do we need an AI person or an AI tool?", a: "A leader first. Tools without an owner become shelfware. The leader decides which tools earn a place in the workflow." },
      { q: "How do we measure payback?", a: "Usage, then time saved, then pipeline and win rate. If reps are not using it, nothing downstream moves." },
      { q: "What does it cost?", a: `The Rate Index puts AI GTM at ${med("AI GTM")} (n=${n("AI GTM")})${monthLine("AI GTM") ? `, ${monthLine("AI GTM")} in the engagements operators described` : ""}. Plan the month on the hours the work needs.` },
      { q: "Where does the Diagnostic fit?", a: "Its AI pillar maps where AI can create seller effectiveness and GTM efficiency, so the leader starts on the highest-return work." },
    ],
  },
];

export const solutionBySlug = (slug: string) => solutions.find((s) => s.slug === slug);
