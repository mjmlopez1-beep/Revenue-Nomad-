import type { Chapter } from "./types";
import * as f from "./figures";

/* Figure 3.1: every role in the Rate Index. Highest and lowest are tagged only among roles at or above the
   publication floor; smaller cuts carry their n and no tag. Ties share the tag. */
const isPublished = (c: f.CategoryCut) => c.n >= f.rates.floor && c.median != null;
const tagCategory = (c: f.CategoryCut) => {
  if (!isPublished(c)) return "";
  if (c.median === f.highestCategory.median) return " (highest)";
  if (c.median === f.lowestCategory.median) return " (lowest)";
  return "";
};
const topCategoryMedian = Math.max(...f.byCategory.map((c) => c.median ?? 0));
const salesLeadership = f.category("Sales Leadership");
const revOps = f.category("Revenue Operations");
const enablement = f.category("Sales Enablement");
const aiGtm = f.category("AI GTM");

/* Figure 3.3: engagements described in the operator survey with recorded hours and a rate. */
const hours = f.engagements.byHours;
const hoursN = hours.reduce((a, b) => a + b.n, 0);
const topHoursRate = Math.max(...hours.map((b) => b.median));
const lowHoursRate = Math.min(...hours.map((b) => b.median));
const topMonth = Math.max(...hours.map((b) => b.typicalMonth));
const tagHours = (n: number, hi: number, lo?: number) => (n === hi ? " (highest)" : lo != null && n === lo ? " (lowest)" : "");

/* Figure 3.4: median monthly spend by client revenue, every engagement described in the survey (first and second
   client), the same cut the Rate Index page shows, from $1 million up. */
const revenueBand = (band: string) => f.engagements.byRevenue.find((b) => b.band === band) ?? { band, engagements: 0, share: 0, medianMonthly: null, monthlyN: 0 };
const monthlyBands = f.engagements.byRevenue.filter((b) => b.band !== "Pre-revenue" && b.band !== "Under $1M");
const topMonthly = Math.max(...monthlyBands.map((b) => b.medianMonthly ?? 0));
const stepFrom = revenueBand("$1M - $5M");
const stepTo = revenueBand("$5M - $20M");
const stepAbove = revenueBand("$20M - $50M");

/* The sanity-check tiles: floor from the hours cut, ceiling from the index, most seats from role medians. */
const floorRate = Math.min(...hours.map((b) => b.p25));
const roleMonths = f.engagements.monthlyByCategory.filter((c) => c.n >= f.rates.floor && c.medianMonthly != null).map((c) => c.medianMonthly as number);

/* Direct contracts rolled up by seat, lightest seat first. Initial term is not in the data: the seats whose
   contracts set a specific pattern are named here; the rest follow the standard pattern described below. */
const SEAT_ORDER = ["Sales Director or VP of Sales", "Sales enablement lead", "CRO and revenue transformation", "Interim head of sales"];
const SEAT_TERM: Record<string, string> = {
  "Sales Director or VP of Sales": "3 to 4 months, then month to month",
  "CRO and revenue transformation": "3 to 6 months",
  "Interim head of sales": "3 to 5 months",
};
const seatIndex = (name: string) => (SEAT_ORDER.indexOf(name) === -1 ? SEAT_ORDER.length : SEAT_ORDER.indexOf(name));
const seats = [...f.contracts.bySeat].sort((a, b) => seatIndex(a.seat) - seatIndex(b.seat));
type Span = { min: number; max: number } | null | undefined;
const span = (r: Span, fmt: (n: number) => string) => (r == null ? "n/a" : r.min === r.max ? fmt(r.min) : `${fmt(r.min)} - ${fmt(r.max)}`);
const dirVp = f.seat("Sales Director or VP of Sales");
const cro = f.seat("CRO and revenue transformation");
const c = f.contracts;

const chapter: Chapter = {
  slug: "03-what-it-costs",
  number: "03",
  title: "What fractional GTM actually costs",
  dek: `The ${f.rates.median} center, the seat ladder, and what the signed contracts say`,
  stats: [
    { v: f.rates.median, l: "median hourly rate, all roles", tone: "forest" },
    { v: f.rates.middleHalf, l: "middle half of the market" },
    { v: f.rates.topTier.range, l: "senior operator tier" },
    { v: String(f.rates.n), l: "hourly rates in the Rate Index" },
  ],
  blocks: [
    {
      t: "lede",
      html: "Every CEO asks the same first question, usually within the first five minutes: what does this cost?",
    },
    {
      t: "p",
      html:
        "The answer most fractional leaders give is a rate. The answer you need is a monthly number, and an understanding of what moves it. Three things do: the seat you are filling, the hours you are buying, and the size of the company doing the buying. This chapter takes them in order.",
    },
    {
      t: "list",
      ordered: true,
      items: ["The seat you are filling", "The hours you are buying", "The size of the company buying"],
    },

    { t: "h2", eyebrow: "The center", text: `The market centers on ${f.rates.median} an hour`, id: "the-market-center" },
    {
      t: "p",
      html: `The Revenue Nomad Rate Index holds ${f.rates.n} hourly rates, as companies pay them - ${f.rates.surveyN} from the operator survey and ${f.rates.platformN} from Revenue Nomad platform listings. The median is ${f.rates.median} an hour. The middle half of the market runs from ${f.rates.p25} to ${f.rates.p75}. Above that sits a real tier of senior operators at ${f.rates.topTier.floor} to ${f.rates.topTier.max} an hour, ${f.rates.topTier.n} rates, mostly CRO-level sales leadership and AI GTM work for companies above $20 million. It is a smaller group, but it is not an anomaly. It is where the people who have done this several times at scale price themselves, and buyers pay it.`,
    },
    {
      t: "table",
      caption: "Figure 3.1. Median hourly rate by role",
      head: ["Role", "Median rate", "n"],
      rows: [
        ...f.byCategory.map((cat) => [cat.category, `${f.rate(cat.median)}${tagCategory(cat)}`, String(cat.n)]),
        ["<strong>All roles</strong>", `<strong>${f.rates.median}</strong>`, `<strong>${f.rates.n}</strong>`],
      ],
      firstColHeader: true,
      note: `Revenue Nomad Rate Index, ${f.rates.n} hourly rates as companies pay them, as of ${f.asOf.long}. Highest and lowest are tagged among roles with ${f.rates.floor} or more rates; smaller cuts carry their n. Bars scaled to the highest median rate (${f.rate(topCategoryMedian)}).`,
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Two things stand out",
      html: `Enablement prices above sales leadership, ${enablement.median} against ${salesLeadership.median}, on ${enablement.n} rates, and RevOps matches sales leadership at ${revOps.median}. Both surprise people until they realize how few people can build a forecast that holds or a playbook a rep will actually open.`,
    },
    {
      t: "callout",
      tone: "leaf",
      title: "AI GTM rates",
      html: `And AI GTM, the role everyone is talking about, prices at the market center, ${aiGtm.median} on ${aiGtm.n} rates, with no premium over sales leadership. The category is young, the operators are younger, and buyers do not yet know what to pay for it. That will not last.`,
    },

    { t: "h2", text: "The seat sets the rate", id: "the-seat-sets-the-rate" },
    { t: "lede", html: "The single biggest driver of price is what you are actually hiring." },
    {
      t: "p",
      html:
        "A fractional Sales Director who runs your weekly pipeline meeting and coaches two reps is a different job from a fractional CRO who owns the number, the team, the forecast and the board slide. The market prices them differently, and so do we.",
    },
    {
      t: "stats",
      items: seats.map((s) => ({
        v: `${span(s.hourly, f.usd)}/hr`,
        l: s.seat,
        s: `${span(s.hours, String)} hrs / month`,
        ...(s.seat === "CRO and revenue transformation" ? { tone: "forest" as const } : {}),
      })),
    },
    {
      t: "p",
      html: `The ladder is consistent: director- and VP-level work prices from ${f.usd(dirVp?.hourly?.min)} to ${f.usd(dirVp?.hourly?.max)} an hour at ${span(dirVp?.hours, String)} hours a month, CRO-level from ${f.usd(cro?.hourly?.min)} to ${f.usd(cro?.hourly?.max)} with more hours behind it, and the largest engagement works out to $465 an hour once you divide the monthly fee by the contracted hours. The $465 engagement is a CRO owning a 12-month roadmap for a company above $50 million, with an operator who has done it before. That is what the top of the market looks like, and it is worth it to the company paying for it.`,
    },
    {
      t: "table",
      caption: "Figure 3.2. Direct client contracts as an hourly rate",
      head: ["Seat", "Hourly rate", "Hours per month", "Contracts"],
      rows: seats.map((s) => [s.seat, span(s.hourly, f.usd), span(s.hours, String), String(s.contracts)]),
      firstColHeader: true,
      note: `Revenue Nomad direct contracts, 2024 - 2026: ${c.directDocuments} documents across ${c.directClients} clients, rolled up by seat. Hourly rate as billed to the company.`,
    },

    { t: "h2", text: "Hours move the rate too", id: "hours-move-the-rate-too" },
    { t: "lede", html: "The hourly rate eases as hours rise. The monthly number climbs with them." },
    {
      t: "p",
      html: `We took every engagement described in the operator survey with recorded hours and a rate, ${hoursN} in all, priced as companies pay them. The hourly rate eases as hours rise. The monthly number climbs with them.`,
    },
    {
      t: "table",
      caption: "Figure 3.3. Rate and monthly spend by hours per month",
      head: ["Hours per month", "Median rate", "Middle half", "Typical month", "n"],
      rows: hours.map((b) => [
        b.band,
        `${f.rate(b.median)}${tagHours(b.median, topHoursRate, lowHoursRate)}`,
        `${f.rate(b.p25)} - ${f.rate(b.p75)}`,
        `${f.usd(b.typicalMonth)}${tagHours(b.typicalMonth, topMonth)}`,
        String(b.n),
      ]),
      firstColHeader: true,
      note: `Engagements described in the operator survey with recorded hours and rate, n=${hoursN}, as companies pay them. Typical month is the median of rate times hours. Bars scaled to the highest value in each column (${f.rate(topHoursRate)} rate, ${f.usd(topMonth)} month).`,
    },
    {
      t: "p",
      html:
        `This matters for how you budget. Committing more of someone's week lowers the hourly rate a little, but senior scope does not discount much - in our own contracts, engagements of 60 hours a month or more work out to ${f.rate(f.contracts.implied60Plus?.min)} to ${f.rate(f.contracts.implied60Plus?.max)} an hour once the monthly fee is divided by the hours, a median of about ${f.rate(f.contracts.implied60Plus?.median)}. Buy the hours the job needs, not the hours that feel safe.`,
    },

    { t: "h2", text: "What companies like yours pay", id: "what-companies-like-yours-pay" },
    {
      t: "stats",
      items: [{ v: "$5M", l: `revenue at which median monthly spend steps from ${f.monthly(stepFrom.medianMonthly)} to ${f.monthly(stepTo.medianMonthly)}`, tone: "forest" }],
    },
    {
      t: "table",
      caption: "Figure 3.4. Median monthly spend by client revenue",
      head: ["Client annual revenue", "Median monthly spend", "n"],
      rows: monthlyBands.map((b) => [b.band, f.monthly(b.medianMonthly), String(b.monthlyN)]),
      firstColHeader: true,
      note: `Operator survey, n=${f.engagements.monthlyN} engagements with a stated rate and hours, first and second client; monthly spend is hours x effective rate. Bars scaled to the highest median (${f.monthly(topMonthly)}).`,
    },
    {
      t: "p",
      html: `The step from ${f.monthly(stepFrom.medianMonthly)} to ${f.monthly(stepTo.medianMonthly)} happens at the $5 million mark, the next one to ${f.monthly(stepAbove.medianMonthly)} above $20 million, and then the number flattens. A $40 million company is not paying four times what a $10 million company pays. It is paying about a third more, because the job is roughly the same size: one experienced person, two or three days a week, running or rebuilding a revenue function. Above $50 million the engagements get bigger, but they also start looking less like fractional and more like interim, which is a different product with a different price.`,
    },
    {
      t: "callout",
      tone: "leaf",
      title: "One more check on these numbers",
      html:
        "The survey asks what operators charge. The platform asks what they list. The contracts show what clients signed. Three different questions, three different populations, and they agree on the shape of the market:",
    },
    {
      t: "stats",
      items: [
        { v: `~${f.rates.median}/hr`, l: "Center" },
        { v: `~${f.rate(floorRate)}/hr`, l: "Floor", s: "junior or high-hour work" },
        { v: `~${f.rates.p90}/hr`, l: "Ceiling", s: "senior CRO-level work" },
        { v: `${f.k(Math.min(...roleMonths))} - ${f.k(Math.max(...roleMonths))}/mo`, l: "Most seats", s: "median month by role, part-time leadership" },
      ],
    },
    { t: "p", html: "<strong>When three independent sources agree, you can budget off them.</strong>" },

    { t: "h2", eyebrow: "Signed terms", text: "What the contracts say", id: "what-the-contracts-say" },
    {
      t: "stats",
      items: [
        { v: String(c.directClients), l: "direct-client engagements", s: `${c.directDocuments} signed documents`, tone: "forest" },
        { v: String(c.partnerEngagements), l: "more via a partner channel" },
      ],
    },
    {
      t: "p",
      html: `Survey data tells you what people report. Contracts tell you what people signed. Below are the terms from our ${c.directClients} direct-client engagements (${c.directDocuments} documents), plus the structural patterns from ${c.partnerEngagements} more we delivered through a partner channel.`,
    },
    {
      t: "table",
      caption: "Figure 3.5. Direct contract terms by seat",
      head: ["Seat", "Hours per month", "Monthly", "Initial term"],
      rows: seats.map((s) => [s.seat, span(s.hours, String), span(s.monthly, f.k), SEAT_TERM[s.seat] ?? "3 to 6 months, then month to month"]),
      firstColHeader: true,
      note: "Revenue Nomad direct contracts, 2024 - 2026, rolled up by seat - what companies pay. Initial term follows the standard pattern below where a seat's contracts do not set their own.",
    },
    { t: "h3", text: "The commercial terms are nearly standardized at this point" },
    {
      t: "steps",
      items: [
        {
          n: "01",
          title: "Initial term of three to six months, then month to month.",
          html: `9 of ${c.directClients}. The exceptions are a prepaid hour block and an engagement that opened with a fixed-fee 45-day assessment before the retained CRO phase began. That assessment-first structure is becoming more common at the upper end, and it is a good sign when a firm proposes it: they want to diagnose before they prescribe.`,
        },
        { n: "02", title: "Thirty days' written notice", html: "From either side, in every contract." },
        {
          n: "03",
          title: "An opt-out checkpoint inside the initial term",
          html: "At week 7, 8 or 12 depending on the deal. You are not locked in if the fit is wrong.",
        },
        {
          n: "04",
          title: "Overage billed hourly at or near the rate card",
          html: "Usually with a cap on how much can be billed without your approval (15% in the most recent one).",
        },
        { n: "05", title: "A hire-away fee", html: "$25,000 to $50,000, if you convert the leader to a full-time employee." },
      ],
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Two terms appear once each and are worth asking for",
      html:
        "<strong>A success bonus:</strong> one CRO contract pays up to $10,000 a month above the retainer if revenue beats the goal set by day 90.<br><br><strong>A no-cost replacement clause:</strong> if the fit is wrong, the firm swaps the person without a new fee.",
    },

    { t: "h2", eyebrow: "Reading the contract", text: "The thing CEOs misread", id: "the-thing-ceos-misread" },
    {
      t: "stats",
      items: [
        { v: `${f.survey.status.converted} in ${f.survey.status.n}`, l: "converted to full-time", tone: "forest" },
        { v: f.of(c.expandedHours, c.directClients), l: "expanded hours" },
      ],
    },
    {
      t: "callout",
      tone: "gold",
      title: "The hire-away fee gets read as a trap",
      html: `It is the opposite. It means the firm has already priced in the possibility that this person becomes your VP of Sales, and told you the number up front. In our survey, ${f.survey.status.converted === 1 ? "one engagement" : `${f.survey.status.converted} engagements`} in ${f.survey.status.n} converted to full-time. It happens. It is not the point.`,
    },
    {
      t: "p",
      html: `The more important pattern in the contracts is that engagements grow. ${c.expandedHours} of our ${c.directClients} direct clients expanded hours within months: 20 to 35, 30 to 40, 30 to 50, 130 to 173. None cut back. Buyers who start at 20 hours are usually testing the person, not sizing the job. Budget for the job.`,
    },
    {
      t: "stats",
      items: [
        { v: "20 to 35", l: "hrs / month" },
        { v: "30 to 40", l: "hrs / month" },
        { v: "30 to 50", l: "hrs / month" },
        { v: "130 to 173", l: "hrs / month" },
      ],
    },

    { t: "h2", text: "What bigger companies buy instead", id: "what-bigger-companies-buy-instead" },
    { t: "lede", html: "The leader stays. The specialist comes in to fix one thing and leave." },
    {
      t: "p",
      html: `The ${c.partnerEngagements} project engagements in our contract data, mostly with larger software companies, look different. Almost none of them are a retained leader. They are projects:`,
    },
    {
      t: "list",
      items: [
        "30- to 45-day GTM diagnostic at a fixed fee",
        "12-week outbound motion build",
        "Sales playbook",
        "Manager enablement program",
        "AI pilot",
      ],
    },
    {
      t: "p",
      html: `Terms of one to three months, ${c.partnerTermMedianMonths} months at the median. A readout at the end. Month-to-month renewal only if both sides confirm in writing.`,
    },
    {
      t: "callout",
      tone: "night",
      html:
        "That is the other half of the fractional market, and it is what fractional looks like once a company has a VP of Sales already. The leader stays. The specialist comes in to fix one thing and leave. <strong>If you are above $50 million and already have a revenue leader, you are probably shopping for a project, not a person, and you should price it that way.</strong>",
    },

    { t: "h2", text: "The number to budget", id: "the-number-to-budget" },
    {
      t: "stats",
      items: [
        { v: "$4,000 - $5,000 / mo", l: "Sales Director for a small team" },
        { v: `${f.monthly(stepTo.medianMonthly)} / mo`, l: "VP-level at a $5M - $20M company", tone: "forest" },
        { v: "$13,000 - $25,000 / mo", l: "CRO or company above $20M" },
      ],
    },
    {
      t: "p",
      html: "If you need a Sales Director to run the cadence for a small team, $4,000 to $5,000 is the range.",
    },
    {
      t: "p",
      html: `If you are a $5 million to $20 million company bringing in a fractional VP-level sales or marketing leader for two days a week, budget ${f.monthly(stepTo.medianMonthly)} a month and a six-month initial commitment. That is ${f.usd(Math.round((stepTo.medianMonthly ?? 0) / 100) * 100 * 6)} to find out whether this works, with an exit at week 8 to 12 if it is not.`,
    },
    {
      t: "p",
      html:
        "If what you need is a CRO who owns the number and the team, or your company is above $20 million, plan on $13,000 to $25,000 a month.",
    },
    {
      t: "p",
      html:
        "Fractional is not always cheaper. We will get to the cases where the full-time hire wins in Chapter 4. But it is always faster to find out.",
    },
  ],
};

export default chapter;
