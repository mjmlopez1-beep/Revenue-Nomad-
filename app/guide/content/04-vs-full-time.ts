import type { Chapter } from "./types";
import * as f from "./figures";

/* Fractional VP-level sales leader: the Chapter 3 budget (median monthly spend at a $5M - $20M company) at 40 hours a month. */
const fractionalMonthly = f.firstClientMonthly("$5M - $20M").medianMonthly ?? 0;
const fractionalAnnual = fractionalMonthly * 12;
const fractionalHourly = f.rate(fractionalAnnual / (40 * 12));
const salesMedian = f.category("Sales Leadership").median;
/* Interim head of sales, from the direct contracts, to the nearest $1,000. */
const interim = f.seat("Interim head of sales");
const thousands = (n: number | undefined) => f.usd(Math.round((n ?? 0) / 1000) * 1000);

const chapter: Chapter = {
  slug: "04-vs-full-time",
  number: "04",
  title: "Fractional vs full-time vs agency: the honest math",
  dek: "This is the chapter where most fractional firms put their thumb on the scale. We are going to try not to.",
  stats: [
    { v: "$507.5k - $577.5k", l: "year one, full-time VP of Sales" },
    { v: f.usd(fractionalAnnual), l: "a year, fractional VP at 40 hrs / month", tone: "forest" },
    { v: "2 wks vs 3 - 4 mo", l: "to day one, fractional vs full-time" },
    { v: `${salesMedian} vs $245 - $280`, l: "per hour, fractional vs full-time loaded" },
  ],
  blocks: [
    { t: "h2", text: "What a full-time VP of Sales actually costs", id: "what-a-full-time-vp-of-sales-actually-costs" },
    {
      t: "stats",
      items: [
        { v: "$207,000", l: "VP of Sales base salary", tone: "forest" },
        { v: "$350,000", l: "total cash" },
        { v: "$319,000", l: "startup CRO base" },
        { v: "~month 6", l: "first revenue impact" },
      ],
    },
    {
      t: "p",
      html:
        "Published compensation data for a US VP of Sales clusters around $207,000 in base salary and $350,000 in total cash once bonus and commission are included (<a href=\"https://builtin.com/salaries/us/vice-president-of-sales\">Built In</a>). For a CRO at a startup-sized company, average base alone runs around $319,000 (<a href=\"https://www.salary.com/research/salary/benchmark/chief-revenue-officer-salary\">Salary.com</a>). Those are averages across every industry and stage. A $10 million services business will pay less than a Series B software company. But not that much less, because the people who can do this job know what they are worth.",
    },
    { t: "h3", text: "Add the costs that do not show up in the offer letter" },
    {
      t: "steps",
      items: [
        {
          n: "1",
          title: "Benefits and payroll taxes.",
          html:
            "Plan on 20% to 30% on top of cash. That is a planning assumption, not a benchmark, and your finance lead will have your real number.",
        },
        {
          n: "2",
          title: "The search.",
          html:
            "A retained executive search runs 25% to 35% of first-year cash compensation, paid whether or not the hire works out (<a href=\"https://spmb.com/executive-search-news/much-does-ceo-cfo-search-cost/\">SPMB</a>). On a $350,000 package, that is $87,500 to $122,500.",
        },
        {
          n: "3",
          title: "The wait.",
          html:
            "A VP-level search typically takes 90 to 120 days from launch to accepted offer (<a href=\"https://www.majhigroup.com/executive-search-time-to-fill-by-role.html\">Majhi Group</a>). Then a notice period. Then a ramp.",
        },
      ],
    },
    {
      t: "p",
      html:
        "Put it together and year one of a full-time VP of Sales is a $500,000 to $575,000 commitment, with the first revenue impact arriving somewhere around month six.",
    },
    {
      t: "table",
      caption: "Figure 4.1. Year-one cost of a full-time VP of Sales",
      head: ["Cost line", "Low", "High"],
      rows: [
        ["Total cash compensation", "$350,000", "$350,000"],
        ["Benefits and payroll taxes (20 - 30%)", "$70,000", "$105,000"],
        ["Retained search fee (25 - 35%)", "$87,500", "$122,500"],
        ["<strong>Total</strong>", "<strong>$507,500</strong>", "<strong>$577,500</strong>"],
        ["Months before day one", "3 - 4", "3 - 4"],
      ],
      firstColHeader: true,
      note: "Compensation from Built In; search fee from SPMB; benefits and taxes are a planning assumption. Bars scaled to the total in each column.",
    },

    { t: "h2", text: "What a fractional VP of Sales actually costs", id: "what-a-fractional-vp-of-sales-actually-costs" },
    {
      t: "p",
      html:
        `From Chapter 3: a fractional VP-level sales leader at 40 hours a month runs about ${f.usd(fractionalMonthly)} a month, or ${f.usd(fractionalAnnual)} a year. No search fee. No benefits. Start in two weeks. First measurable result inside 60 days in nearly four out of five engagements.`,
    },
    {
      t: "stats",
      items: [
        { v: `~${f.usd(fractionalMonthly)}`, l: "Monthly", s: "at 40 hrs / month" },
        { v: "None", l: "Search fee", s: "no benefits" },
        { v: "2 weeks", l: "Start", s: "to day one" },
        { v: "< 60 days", l: "First result", s: "in nearly 4 of 5 engagements", tone: "forest" },
      ],
    },
    {
      t: "table",
      caption: "Figure 4.2. Year-one cost of full-time and fractional",
      head: ["Model", "Year-one cost"],
      rows: [
        ["Full-time, high", "$577,500"],
        ["Full-time, low", "$507,500"],
        ["Fractional, 40 hrs / mo", f.usd(fractionalAnnual)],
      ],
      firstColHeader: true,
      note: "Full-time totals from Figure 4.1; fractional from Chapter 3. Bars scaled to the highest total ($577,500).",
    },

    { t: "h2", text: "Now the honest part", id: "now-the-honest-part" },
    {
      t: "p",
      html:
        `Fractional is not meaningfully cheaper per hour. Divide the full-time number by a working year and you get roughly $245 to $280 an hour loaded. Divide the fractional number by 40 hours a month and you get ${fractionalHourly}, and the Rate Index puts fractional sales leadership at ${salesMedian}. Same neighborhood. Experienced revenue leadership costs what it costs, however you buy it.`,
    },
    {
      t: "table",
      caption: "Figure 4.3",
      head: ["Model", "Per hour"],
      rows: [
        ["Full-time, loaded high", "$280"],
        ["Full-time, loaded low", "$245"],
        ["Fractional, 40 hrs", fractionalHourly],
        ["Rate Index, sales", salesMedian],
      ],
      firstColHeader: true,
      note: "Bars scaled to the highest value ($280).",
    },
    {
      t: "stats",
      items: [
        { v: "40 hrs", l: "fractional", tone: "forest" },
        { v: "160 hrs", l: "full-time" },
      ],
    },
    {
      t: "p",
      html:
        `<strong>Fractional is cheaper because you buy fewer hours.</strong> The ${f.usd(fractionalAnnual)} buys you a quarter of a leader.`,
    },
    {
      t: "callout",
      tone: "gold",
      title: "Where it goes wrong",
      html:
        `If your business genuinely needs a full-time revenue leader, 160 hours a month of someone in the building, fractional will not get you there, and pretending otherwise is how engagements fail. In our survey, 3% of fractional engagements run at 160 hours. Those are interim roles with a different price (Chapter 3 shows ${thousands(interim?.monthly.min)} to ${thousands(interim?.monthly.max)} a month), and at that point you are paying full-time money for someone who will leave.`,
    },
    {
      t: "quote",
      text:
        "So the real question is not \"which is cheaper.\" It is \"how many hours of senior revenue leadership does this business need right now, and how sure am I about what kind.\"",
    },

    { t: "h2", eyebrow: "Figure 4.4", text: "The decision", id: "the-decision" },
    { t: "h3", text: "Fractional wins when" },
    {
      t: "stats",
      items: [
        { v: f.usd(fractionalAnnual), l: "a year at 40 hrs / mo", tone: "forest" },
        { v: "2 weeks", l: "to start", tone: "forest" },
      ],
    },
    {
      t: "list",
      items: [
        "You need the leadership, not the headcount. A team of two to eight reps does not need 40 hours a week of management. It needs 10 hours of the right management.",
        "You do not yet know what you need. The 30- to 45-day diagnostic that opens most engagements (Chapter 9) tells you what the permanent role should look like before you post it. Several of our clients used a fractional leader to define the job and then hire for it.",
        "Speed matters more than permanence. Two weeks versus four months.",
        "You have been burned. If the last full-time hire did not work, a fractional engagement is a cheaper way to find out whether the problem was the person or the role.",
      ],
    },
    { t: "h3", text: "Full-time wins when" },
    {
      t: "stats",
      items: [
        { v: "$507.5k - $577.5k", l: "year one" },
        { v: "3 - 4 months", l: "before day one" },
      ],
    },
    {
      t: "list",
      items: [
        "The job is genuinely 40 hours a week. A team of 15 or more reps, multiple segments, a board that wants one throat to choke.",
        "You need someone whose equity upside is tied to yours. Fractional leaders are paid in cash. If the role needs someone who will take below-market cash for a big equity bet, that is a full-time hire.",
        "Culture is the product. Some companies, particularly founder-led ones with a strong identity, need a leader who is fully inside. A part-timer, however good, is always a little bit outside.",
        "You already know exactly what you need and have a strong candidate. Do not use fractional as a delay tactic when the right person is in front of you.",
      ],
    },
    { t: "h3", text: "An agency or project firm wins when" },
    {
      t: "stats",
      items: [
        { v: "1 - 3 months", l: "typical term" },
        { v: "Fixed scope", l: "readout at the end" },
      ],
    },
    {
      t: "list",
      items: [
        `The problem is a deliverable, not a leader. A playbook. An outbound sequence library. A CRM migration. An enablement program for a team that already has a good boss. The ${f.contracts.partnerEngagements} project engagements in our contract data are almost all this shape: one to three months, fixed scope, a readout at the end.`,
        "You have a revenue leader and they need hands. Specialists under a leader works. Specialists instead of a leader, as the operators warned in Chapter 9, mostly does not.",
      ],
    },
    {
      t: "note",
      text: `Cost and timing figures from this chapter and Chapter 3. Project terms from the ${f.contracts.partnerEngagements} project engagements in Revenue Nomad contract data.`,
    },

    {
      t: "h2",
      eyebrow: "Fractional first, then decide",
      text: "The hybrid most companies actually land on",
      id: "the-hybrid-most-companies-actually-land-on",
    },
    {
      t: "p",
      html:
        "The cleanest pattern in our contracts is not fractional instead of full-time. It is fractional first, then decide. A 90-day engagement to diagnose and rebuild, then one of four outcomes:",
    },
    {
      t: "stats",
      items: [
        { v: f.pct(f.engagements.extendedShare), l: "Extend", s: "of engagements do.", tone: "forest" },
        { v: f.of(f.contracts.expandedHours, f.contracts.directClients), l: "Expand", s: "of our direct clients did." },
        { v: `${f.survey.status.converted} in ${f.survey.status.n}`, l: "Convert", s: "Convert the fractional leader to full-time, with the fee for that written into the contract." },
        { v: "A permanent leader", l: "Hire", s: "Hire a permanent leader into a role that now has a working system under it." },
      ],
    },
    {
      t: "p",
      html:
        "Every one of those outcomes is better than a four-month search that ends in a bad hire. That is the real economic argument for fractional. Not that it is cheaper. That it is reversible.",
    },

    { t: "h2", eyebrow: "Tool", text: "The Leadership Model Decision Tree", id: "the-leadership-model-decision-tree" },
    {
      t: "steps",
      items: [
        {
          n: "01",
          title: "Do you know, specifically, what is broken in your revenue function?",
          html:
            "<strong>No:</strong> Start with a fractional diagnostic (30 - 45 days). Then return to this question.<br><strong>Yes:</strong> Continue.",
        },
        {
          n: "02",
          title: "Is the fix a deliverable or an ongoing job?",
          html: "<strong>Deliverable:</strong> Project firm or specialist.<br><strong>Ongoing job:</strong> Continue.",
        },
        {
          n: "03",
          title: "How many hours a week does the job actually need?",
          html:
            "<strong>Under 20:</strong> Fractional.<br><strong>20 to 35:</strong> Fractional, heavy allocation, or interim.<br><strong>35+ sustained:</strong> Full-time (or interim while you search).",
        },
        {
          n: "04",
          title: "Do you have a strong full-time candidate in hand today?",
          html:
            "<strong>Yes:</strong> Hire them. Consider a fractional leader for 90 days to build the system they inherit.<br><strong>No:</strong> Fractional now. Revisit in 90 days with a working system and a clearer job description.",
        },
      ],
    },
  ],
};

export default chapter;
