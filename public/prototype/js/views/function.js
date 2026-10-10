/* Function homes (#hire-fractional-sales-vp, #fractional-revops, #fractional-marketing-leadership) and the cost hub
   (#fractional-cost), built from the Site pages copy (Matt Lopez, Oct 10, 2026) in the eight-section function-page
   template: hero, who would I get, what it costs, what happens first, who like me has done this, how we vet, FAQ,
   form block. Prefix fn- for classes and actions.
   Copy is transcribed as written. A [GAP: what, owner] in the document renders as a pending chip (RN.fn.gap) and is
   never filled with a guess. Companies pay no fees (founder decision D1), so the full-time conversion answers read
   "Yes." and the Terms row defers the conversion terms to Matt; operator fees are explained only on operator pages.
   Shared with other views:
     RN.fn.logoStrip({ label, network, pending, scale, bare, className })
                                                       the nine cleared client logos as one row (files for four, wordmarks for five);
                                                       network adds the 350+ figure, pending the Goldenbird chip, scale resizes the
                                                       marks (1 = 20px cap height), bare drops the top rule and margin
     RN.fn.gap(what, owner)                            the pending chip
     RN.fn.LOGOS                                       the cleared list: [key, name, imageKey, height]
     RN.fn.pages                                       the page copy, keyed sales | revops | marketing | cost */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const FN = (RN.fn = RN.fn || {});
  const PG = RN.pages;

  const NET = () => String((RN.data.market && RN.data.market.network && RN.data.market.network.operators) || '350+');
  const NO_FEES_L = 'In fees for companies. You pay the operator’s rate, nothing more.';

  /* ---------- Pending chip: what is still missing and who owns it ---------- */
  function gapRaw(what, owner) {
    return `<span class="fn-gap" title="Owner: ${owner}">${icon('clock')}<span>Pending · ${what} (${owner})</span></span>`;
  }
  FN.gap = (what, owner) => gapRaw(esc(what), esc(owner || 'Matt'));

  /* Body copy: typographic quotes, escaped, then the inline tokens
       [[gap:what|Owner]]   pending chip
       [[link:route|text]]  a link to a route
       [[net]]              the network size from RN.data.market */
  function rich(t) {
    return esc(RN.fmt.smart(t))
      .replace(/\[\[gap:([^\]|]+)\|([^\]]+)\]\]/g, (m, what, owner) => gapRaw(what.trim(), owner.trim()))
      .replace(/\[\[link:([^\]|]+)\|([^\]]+)\]\]/g, (m, to, label) => `<a class="link" href="#${to.trim()}">${label}</a>`)
      .replace(/\[\[net\]\]/g, esc(NET()));
  }

  /* ---------- The cleared client logos ----------
     Only these nine may appear (content playbook, Oct 10, 2026). Files exist for four; the other five are wordmarks
     in the display face. Heights are set by eye so each mark reads at the same cap height. Every image is flattened
     to one ink by a filter (--fn-logo-filter in function.css), which also keeps the light-grey Skaled file visible
     on paper and turns every mark white on .night and in the dark theme. */
  FN.LOGOS = [
    ['ferry', 'Ferry', 'ferryWordmark', 21],
    ['workforce', 'Workforce Software', null, 0],
    ['skaled', 'Skaled', 'skaled', 13],
    ['claruscare', 'ClarusCare', null, 0],
    ['buildinglink', 'BuildingLink', 'buildinglink', 19],
    ['trialbee', 'Trialbee', 'trialbee', 40],
    ['csi', 'CSI Pharmacy', null, 0],
    ['angellist', 'AngelList', null, 0],
    ['lockthreat', 'LockThreat', null, 0],
  ];
  FN.logoStrip = function (o) {
    o = o || {};
    const L = RN.data.logos || {};
    const items = FN.LOGOS.map(([key, name, img, h]) => {
      const src = img && typeof L[img] === 'string' ? L[img] : (typeof L[key] === 'string' ? L[key] : '');
      const px = Math.round((h || 20) * (o.scale || 1));
      return `<li>${src ? `<img src="${src}" alt="${esc(name)}" style="--h:${px}px" loading="lazy">` : `<span class="fn-wm">${esc(name)}</span>`}</li>`;
    }).join('');
    return `<div class="fn-logos${o.bare ? ' fn-logos-bare' : ''}${o.className ? ' ' + esc(o.className) : ''}">
      <div class="fn-logos-l"><span class="label">${esc(o.label || 'Trusted by teams at')}</span>${o.pending ? FN.gap('logo files for the other five', 'Goldenbird') : ''}</div>
      <ul aria-label="Client logos">${items}${o.network ? `<li class="fn-logos-net"><b>${esc(NET())}</b><span>operators</span></li>` : ''}</ul>
    </div>`;
  };

  /* ---------- Page copy, section by section, from the Site pages document ---------- */
  const SALES = {
    fn: 'sales', name: 'hire-fractional-sales-vp', title: 'Hire a Fractional VP of Sales or CRO',
    eyebrow: 'Sales leadership', cat: 'sales_leadership', browse: 'browse.sales_leadership',
    hero: {
      h: 'Fractional sales leadership for founders who are <span class="serif">still the sales team</span>',
      sub: 'A proven VP of Sales for your $5M to $75M company, 20 to 50 hours a month',
      lede: 'You carry the number, coach reps and run the company. We match you with a dedicated fractional sales manager, director, VP of Sales or CRO who has built sales at your stage, and you meet them before you sign.',
    },
    stats: [['net', 'Operators in the network'], ['2 to 3', 'Vetted operators within 48 hours'], ['20 to 50', 'Hours a month for the seat'], ['$0', NO_FEES_L]],
    who: { lede: 'Sales leaders who have built teams at your revenue band, scored on peer reviews and logged engagements, working only as fractionals.' },
    cost: {
      lede: 'What clients paid across our 2026 engagements.',
      cols: ['Seat', 'Hours a month', 'Rate', 'Monthly'], num: [1, 2, 3],
      rows: [
        ['Sales coach', 'About 40', 'About $150 an hour', 'About $6,000'],
        ['Director or VP of Sales, teams under 5 to 8 reps', '20 to 40', '$200 to $250 an hour', '$4,000 to $10,000'],
        ['Embedded fractional CRO, ~$55M company', '50', 'About $464 an hour', '$23,200'],
        { seat: 'Sales manager', gap: ['sales manager rate and hours', 'Matt'] },
      ],
      after: [
        'You pay a monthly retainer upfront for a set block of hours. Overages are flagged before they happen. Every engagement has a contract with a 3 to 4 month initial term, then month-to-month with 30 days notice. Larger seats can start with a fixed-fee assessment, e.g. 45 days for $27,500 before the CRO retainer above.',
        'Hours have to fit the job. One client bought 20 hours a month for $3,000 and missed target every month. Full numbers are on [[link:fractional-cost|/fractional-cost]]. Market rates [[gap:2027 survey figure|Survey]].',
      ],
    },
    first: {
      rows: [
        ['Day 1', 'Discovery call', 'A written role profile'],
        ['Within 48 hours', 'Scope plus 2 to 3 vetted profiles', 'SOW draft and profiles'],
        ['Week 1 to 2', 'You meet candidates. Some clients add a short assignment, e.g. review a recorded call and answer 3 questions', 'Your pick, then the contract'],
        ['Days 1 to 30', 'Assess reps, audit the CRM, sit in on calls, fix comp and talk tracks', 'A 30/60/90-day plan and a rep-by-rep view'],
        ['Days 31 to 60', 'Document process, scripts and training, set a weekly cadence', 'A playbook your team uses'],
        ['Days 61 to 90', 'Personnel calls, pipeline reviews, hiring decisions', 'A right-sized team and a hiring brief'],
      ],
      closing: 'One named operator owns the result on a fixed weekly cadence.',
    },
    stories: [
      [['Problem', 'Close rate fell from 30 to 40% into the teens. 2 to 4 new clients a month against a goal of 10+. The founder-CEO wants to reach $15M.'],
        ['What the operator does', 'A fractional VP of Sales sits above the existing director as strategist and process builder, 40 hours a month for 3 months.'],
        ['Starting point', 'Close rate in the teens. Started Sep 2026 [[gap:90-day result|Matt]]']],
      [['Problem', '8 commission-only reps, about half not performing, no repeatable process.'],
        ['What the operator does', 'A 90-day build at 20 hours a month for $4,000. Assess reps, document the process, write scripts, train, audit the CRM, make personnel calls.'],
        ['Starting point', '8 reps, about 4 performing. Started Sep 2026 [[gap:90-day result|Matt]]']],
      [['What happened', 'Matt Lopez served as fractional GTM strategy leader from Feb 2025, signed for 4 months and retained about 18.'],
        ['Result', 'First 20 inbound leads, 2 deals that doubled the client base, first AE hired and closing within 60 days. [[gap:Ferry revenue band|Matt]] [[gap:client quote with sign-off|Matt]]']],
    ],
    vet: {
      lead: 'Every sales leader is scored on CORE.',
      core: ['They tell you what is happening before you ask.', 'They treat the number as theirs.', 'Measured by revenue and conversion.', 'Deep experience at your stage and in your kind of sale.'],
      paras: [
        'We place only dedicated fractional operators. Anyone holding a full-time job is excluded.',
        'We match seniority to the team. For a 5-rep team, a tactical director often beats a strategic VP. A great CRO from a $500M company will likely struggle at a $30M one, so we track 50+ data points on each of our [[net]] operators.',
      ],
    },
    faq: [
      ['When does a fractional VP of Sales make sense?', 'When the founder or CEO still runs sales and the revenue system is broken. The trigger is usually overload, not an empty seat.'],
      ['How does cost compare with a full-time VP of Sales?', 'Average total VP of Sales comp is about $334K, with average tenure about 19 months (Glassdoor 2026 via Stealth Agents, a secondary source). Skaled says replacing a sales leader can cost 1.5x salary. A fractional director for a small team ran $4,000 to $10,000 a month in our 2026 engagements.'],
      ['Will the operator clash with my current sales leader?', 'We set reporting lines before we source. In one engagement the fractional VP sits above an existing director as coach.'],
      ['What if the fit is wrong?', 'You can swap the operator.'],
      ['Can I hire the operator full time later?', 'Yes.'],
      ['How many hours do I need?', '20 to 40 a month is typical for teams under 5 to 8 reps.'],
    ],
    form: {
      h: 'Tell us about your sales team',
      lede: 'Answer a few questions and get a role profile plus 2 to 3 vetted operators, often within 48 hours.',
      fields: [
        ['Company type', 'Professional services, services-led software, agency, other'],
        ['Revenue band', 'Under $5M, $5M to $20M, $20M to $75M, $75M+'],
        ['Seat', 'Sales manager, director of sales, VP of Sales, CRO, not sure'],
        ['Problem in your words', 'What is not working in sales right now?'],
        ['Timing', 'This month, 1 to 3 months, exploring'],
        ['Who else decides', 'Names or roles'],
      ],
    },
  };

  const REVOPS = {
    fn: 'revops', name: 'fractional-revops', title: 'Fractional RevOps Leaders for B2B SaaS',
    eyebrow: 'RevOps', cat: 'revenue_operations', browse: 'browse.revenue_operations',
    hero: {
      h: 'Fractional RevOps for $25M to $100M SaaS teams that cannot <span class="serif">explain their own pipeline</span>',
      sub: 'A revenue architect who turns your bookings goal into pipeline math your board believes',
      lede: 'For CROs, VPs of Sales and CFOs whose forecast leans on a few large deals and whose RevOps resource reports on problems without fixing them. Start with a fixed-fee assessment or put a senior operator in seat 2 to 2.5 days a week.',
    },
    stats: [['net', 'Operators in the network'], ['2 to 3', 'Vetted operators within 48 hours'], ['2 to 2.5', 'Days a week for an embedded senior operator'], ['$0', NO_FEES_L]],
    who: { lede: 'RevOps operators who have built forecasting, pipeline coverage and CRM systems inside B2B SaaS companies, working only as fractionals.' },
    cost: {
      lede: 'What clients paid across our 2026 engagements.',
      cols: ['Engagement', 'Hours', 'Rate', 'Price'], num: [1, 2, 3],
      rows: [
        ['RevOps assessment', 'About 40 over 60 days', 'Fixed', '$6,000 to $7,500'],
        ['Follow-on execution', '40 to 80 a month', '$150 to $175 an hour', '$6,000 to $14,000 a month'],
        ['Fixed 30-day project, e.g. multi-threading and decision committee process', '30 days', 'Fixed', 'About $7,000 to $8,000'],
        ['Hands-on director', 'About 2 days a week', 'Monthly', '$12,000 to $15,000 a month'],
        ['Senior revenue architect, enterprise SaaS', 'Up to 85 a month', 'About $315 an hour', '$27,000 a month flat'],
      ],
      after: [
        'Assessments and projects are fixed fees. Ongoing work is a monthly retainer billed upfront for a set block of hours, with overages flagged before they happen. Retainers have a contract with a 3 to 4 month initial term, then month-to-month with 30 days notice.',
        'A large consultancy quoted one enterprise SaaS client about $230K for a 6-week assessment. That client chose the $27,000 a month architect. More on [[link:fractional-cost|/fractional-cost]]. Market rates [[gap:2027 survey figure|Survey]].',
      ],
    },
    first: {
      rows: [
        ['Day 1', 'Discovery call', 'A written role profile'],
        ['Within 48 hours', 'Scope plus 2 to 3 vetted profiles', 'SOW draft and profiles'],
        ['Week 1 to 2', 'You meet candidates before signing', 'Your pick, then the contract'],
        ['Days 1 to 30', 'Bridge math from bookings goal to pipeline, funnel leaks, force-ranked fixes', 'A point of view by day 14'],
        ['Days 31 to 60', 'KPI framework, pipeline coverage targets, forecast method', 'A forecast you can defend'],
        ['Days 61 to 90', 'Customer-journey redesign, handoff to internal admins', 'Visible impact around day 90'],
      ],
      closing: 'Start with the assessment instead and you get a red, yellow and green scorecard, specifications and a roadmap within 60 days. Your CRM admins run the build, or you extend the operator.',
    },
    stories: [
      [['Problem', 'Pipeline flat, meeting conversion the lowest the CEO had seen, "no decision" the leading loss reason. Nobody could show the bridge from bookings goal to pipeline.'],
        ['What the operator does', 'A fractional lead revenue architect reporting to the CFO, about 2.5 days a week at $27,000 a month, chosen over a full-time hire and a $230K consultancy assessment.'],
        ['Starting point', 'Forecast needing 3 to 4 deals of about $1M each. Starts Oct 19 2026 [[gap:day-90 result|Matt]]']],
      [['What the operator does', 'A 60-day fixed-fee reporting assessment, about 40 hours, delivering a scorecard, specs and a roadmap internal CRM admins can run.'],
        ['Starting point', '[[gap:revenue band and measured starting point|Matt]]']],
      [[null, 'At about $400M ARR, the President brought in fractional help to stand up a RevOps function from zero. Fractional works well past early stage. [[gap:what was built and a result|Matt]] [[gap:client quote with sign-off|Matt]]']],
    ],
    vet: {
      lead: 'Every RevOps operator is scored on CORE.',
      core: ['They surface the bad number early and plainly.', 'They own the forecast as well as the dashboard.', 'Judged on the decisions that change because of their work.', 'Deep in your CRM, your sales motion and your deal size.'],
      paras: [
        'We place only dedicated fractional operators. Anyone holding a full-time job is excluded.',
        'CRM admin, revenue leadership and pipeline specialist work are three different jobs. One retainer works only if one person can truly cover the combined scope, and we will tell you when it cannot.',
      ],
    },
    faq: [
      ['Do I need an assessment first?', 'If you already know the problem, go straight to an embedded operator. If you need a ranked list your team can run, the $6,000 to $7,500 assessment is the faster start.'],
      ['Who should the operator report to?', 'Whoever owns the number and the budget. In our enterprise billing engagement that is the CFO.'],
      ['Will they replace my RevOps admin?', 'No. The operator sets the system and the priorities. Your admins keep building against a roadmap.'],
      ['How fast will we see change?', 'A point of view by day 14 and visible impact around day 90.'],
      ['What if the fit is wrong?', 'You can swap the operator.'],
      ['Can we hire them full time?', 'Yes.'],
    ],
    form: {
      h: 'Tell us where your revenue system breaks',
      lede: 'Share the problem in your words and get a scope plus 2 to 3 vetted RevOps operators.',
      fields: [
        ['Company type', 'B2B SaaS, services-led software, other'],
        ['Revenue band', 'Under $25M, $25M to $100M, $100M+'],
        ['Seat', 'RevOps assessment, director of RevOps, VP RevOps or revenue architect, not sure'],
        ['Problem in your words', 'What can your team not answer about pipeline or forecast today?'],
        ['Timing', 'This month, 1 to 3 months, exploring'],
        ['Who else decides', 'e.g. CFO, CEO, board'],
      ],
    },
  };

  const MARKETING = {
    fn: 'marketing', name: 'fractional-marketing-leadership', title: 'Fractional CMO and Marketing Leaders',
    eyebrow: 'Marketing leadership', cat: 'marketing', browse: 'browse.marketing',
    hero: {
      h: 'Fractional marketing leaders who bring lead costs down and <span class="serif">hold your agencies to a number</span>',
      sub: 'A demand gen operator or fractional CMO for companies paying more for worse leads',
      lede: 'For presidents, CROs and PE operating partners whose cost per lead keeps rising and whose agencies run unchecked. We score marketing leaders on CPL, attribution and CAC rigor before you meet them.',
    },
    stats: [['net', 'Operators in the network'], ['Up to 7', 'Scored profiles within 48 hours'], ['40 to 80', 'Hours a month for a fractional CMO in our 2026 searches'], ['$0', NO_FEES_L]],
    who: { lede: 'Marketing operators across four seats, demand gen operator, head of growth, VP Marketing and fractional CMO, all working only as fractionals.', gaps: [['count of marketing operators on the bench', 'Matt']] },
    cost: {
      lede: 'What clients were quoted across our 2026 marketing searches.',
      cols: ['Seat or scope', 'Hours a month', 'Rate', 'Monthly'], num: [1, 2, 3],
      rows: [
        ['Fractional CMO, PE-backed platform', '40 to 80', '$200 to $250 an hour', '$8,000 to $20,000'],
        ['Brand and product marketing leader, launch scope', '60 to 80', '$220 to $400 an hour', '$13,200 to $32,000'],
        { seat: 'Demand gen operator', gap: ['demand gen operator rate and hours', 'Matt'] },
        { seat: 'Head of growth or VP Marketing', gap: ['head of growth and VP Marketing rate and hours', 'Matt'] },
      ],
      after: [
        'You pay a monthly retainer upfront for a set block of hours, with overages flagged before they happen. Every engagement has a contract with a 3 to 4 month initial term, then month-to-month with 30 days notice. Market rates [[gap:2027 survey figure|Survey]]. More on [[link:fractional-cost|/fractional-cost]].',
      ],
    },
    first: {
      rows: [
        ['Day 1', 'Discovery call. We agree who decides and the review date', 'A role profile with decision rights written down'],
        ['Within 48 hours', 'Candidates scored against a weighted scorecard', 'Up to 7 scored profiles'],
        ['Week 1 to 2', 'You pick 3 and hold 30 to 60 minute calls', 'Notes against the scorecard'],
        ['Week 2 to 4', 'Finalists answer a first-90-days scenario for your business', 'A written 90-day plan from each'],
        ['Days 1 to 30', 'Audit channels, agencies and aggregators, rebuild CPL and attribution reporting', 'A cost and quality view by channel'],
        ['Days 31 to 90', 'Cut or scale channels, reset agency scopes, weekly 30-minute check-in', 'Agency plans and a budget mix tied to CAC'],
      ],
    },
    storiesLede: 'We have run marketing leadership searches and have no closed marketing placement to report yet. Here is how those searches worked.',
    stories: [
      [['Problem', 'Lead cost and quality getting worse, heavy reliance on lead aggregators, loosely managed agencies, underused marketing data.'],
        ['What we did', 'Scored 7 candidates for a 40 to 80 hour a month fractional CMO seat on a weighted 7-factor scorecard.'],
        { table: [['Demand gen operator vs brand CMO', 25], ['Analytical rigor on CPL, attribution and CAC', 20], ['Agency and aggregator accountability', 15], ['Funnel fluency in the vertical', 15], ['Opinionated enough to manage brand marketers', 10], ['Sales enablement straddle, including call center', 10], ['Channel diversification instinct', 5]] },
        ['Disqualified', 'Brand-heavy CMOs, mismatched funnel backgrounds, anyone carrying 3+ engagements, and any self-reported background the public record contradicts.'],
        ['Where it stands', 'The client changed strategy before hiring. [[gap:revenue band|Matt]]']],
      [['Problem', 'Fragmented products needed one narrative before a sales kickoff.'],
        ['What we did', 'Scoped a 60 to 80 hour a month seat, candidates at $220 to $400 an hour. Brand strategy and sales enablement turned out to be different jobs, and the person who asks is not always the person who decides.'],
        ['Where it stands', '[[gap:revenue band and current status cleared for publishing|Matt]]']],
    ],
    vet: {
      lead: 'Every marketing operator is scored on CORE.',
      core: ['They report cost per lead and pipeline weekly without being asked.', 'They hold agencies to a cost and pipeline number.', 'Judged on lead cost, lead quality and pipeline.', 'They know your funnel, your channels and your vertical.'],
      paras: ['We place only dedicated fractional operators. Anyone holding a full-time job is excluded.'],
    },
    faq: [
      ['Do I need a fractional CMO or a demand gen operator?', 'If leads cost too much and agencies run unchecked, start with a demand gen operator with analytical rigor. Brand-heavy CMOs were a disqualifier in our home services search for that reason.'],
      ['Will they manage my agencies?', 'Yes, if it is in scope. Agency and aggregator accountability carries 15% of our scorecard weight.'],
      ['How many hours does a fractional CMO need?', '40 to 80 a month in our 2026 searches.'],
      ['Can they also support sales?', 'Some can. Sales enablement, including call centers, is a scored factor. Tell us whether you need brand strategy, enablement or both.'],
      ['What if the fit is wrong?', 'You can swap the operator.'],
      ['Can we hire them full time?', 'Yes.'],
    ],
    form: {
      h: 'Tell us what your marketing is costing you',
      lede: 'Describe the problem and get a scorecard plus vetted marketing operators to meet.',
      fields: [
        ['Company type', 'B2B SaaS, home or local services, professional services, PE-backed platform, other'],
        ['Revenue band', 'Under $10M, $10M to $50M, $50M to $150M, $150M+'],
        ['Seat', 'Demand gen operator, head of growth, VP Marketing, fractional CMO, not sure'],
        ['Problem in your words', 'What is happening to lead cost and quality?'],
        ['Timing', 'This month, 1 to 3 months, exploring'],
        ['Who else decides', 'e.g. CEO, PE operating partner, CRO'],
      ],
    },
  };

  const COST = {
    fn: 'cost', name: 'fractional-cost', title: 'What Fractional GTM Leaders Cost in 2026',
    eyebrow: 'Cost', browse: 'browse',
    hero: {
      h: 'What fractional sales, RevOps and marketing leaders <span class="serif">cost in 2026</span>',
      sub: 'Real rates from our 2026 engagements, by seat and by hours',
      lede: 'What clients paid or were quoted across Revenue Nomad engagements in 2026. Use it to size a budget before you talk to anyone.',
    },
    stats: [['net', 'Operators in the network'], ['$4,000', 'A month, where a director-level sales retainer starts'], ['$6,000', 'Where a RevOps assessment starts, as a fixed fee'], ['$0', NO_FEES_L]],
    rates: {
      cols: ['Seat or scope', 'Hours', 'Rate', 'Monthly or fixed'], num: [1, 2, 3],
      groups: [
        { l: 'Sales', cat: 'sales_leadership', rows: [
          ['Sales coach, ~$10M company', 'About 40 a month', 'About $150 an hour', 'About $6,000 a month'],
          ['Director or VP of Sales, teams under 5 to 8 reps', '20 to 40 a month', '$200 to $250 an hour', '$4,000 to $10,000 a month'],
          ['Revenue maturity assessment, ~$55M company', '45 days', 'Fixed', '$27,500'],
          ['Embedded fractional CRO, ~$55M company', '50 a month', 'About $464 an hour', '$23,200 a month'],
        ] },
        { l: 'RevOps', cat: 'revenue_operations', rows: [
          ['Assessment with scorecard, specs and roadmap', 'About 40 over 60 days', 'Fixed', '$6,000 to $7,500'],
          ['Follow-on execution', '40 to 80 a month', '$150 to $175 an hour', '$6,000 to $14,000 a month'],
          ['Fixed 30-day project', '30 days', 'Fixed', 'About $7,000 to $8,000'],
          ['Hands-on director', 'About 2 days a week', 'Monthly', '$12,000 to $15,000 a month'],
          ['Senior revenue architect, enterprise SaaS', 'Up to 85 a month', 'About $315 an hour', '$27,000 a month flat'],
        ] },
        { l: 'Marketing', cat: 'marketing', rows: [
          ['Fractional CMO, PE-backed platform', '40 to 80 a month', '$200 to $250 an hour', '$8,000 to $20,000 a month'],
          ['Brand and product marketing leader, launch scope', '60 to 80 a month', '$220 to $400 an hour', '$13,200 to $32,000 a month'],
        ] },
      ],
    },
    riSeats: ['Sales manager', 'Director of sales', 'VP of Sales', 'CRO', 'RevOps lead', 'Fractional CMO'],
    riCats: [['sales_leadership', 'Sales leadership'], ['revenue_operations', 'RevOps'], ['marketing', 'Marketing']],
    outside: 'For outside reference, Go Fractional puts the average fractional hourly rate at $161 as of July 23 2026, across all functions. Fractional VP of Sales arrangements are commonly cited at $8,000 to $20,000 a month (a secondary source).',
    moves: {
      items: [
        'A CRO embedded at a $55M company ran $23,200 a month. A director for a 5-rep team ran $4,000.',
        'Price follows the hour block. 20 hours a month and 50 hours a month are different jobs.',
        'Venture-backed companies accepted about $300 an hour at around $5M ARR. Bootstrapped peers at the same size paid less.',
        'CRM admin, revenue leadership and pipeline specialist work are three jobs. Asking one person to cover all three raises the rate or breaks the engagement.',
        'One founder-led client got quotes of $6,000 to $12,000 a month that were too much for their team. $4,000 for 20 hours fit.',
      ],
      closing: 'One client bought 20 hours a month for $3,000 and missed target every month. Match hours to the job.',
    },
    models: {
      cols: ['Model', 'How it works', 'When it fits', 'Example from 2026'],
      rows: [
        ['Monthly retainer', 'Set hours a month, billed upfront', 'You know the seat and the scope', 'Director of sales, 20 hours, $4,000 a month'],
        ['Fixed project', 'Defined deliverable, fixed fee', 'One problem with a clear end', '30-day RevOps project, about $7,000 to $8,000'],
        ['Assessment then retainer', 'Fixed-fee diagnosis, then the operator executes', 'You need a diagnosis before you commit', '45-day assessment at $27,500, then a CRO at $23,200 a month'],
      ],
      after: ['Assessments lead into execution. You get a scorecard and roadmap, then the option to keep the same operator to deliver it.'],
    },
    total: {
      cols: ['Seat', 'Full-time', 'Fractional, from our 2026 engagements'], blankFirst: true,
      rows: [
        ['VP of Sales', 'About $334K average total comp a year, average tenure about 19 months (secondary source)', '$48,000 to $120,000 a year for a director or VP at 20 to 40 hours a month'],
        ['CRO, ~$55M company', 'Client benchmarked up to about $800K all in', '$27,500 assessment plus 12 months at $23,200, about $306,000'],
        ['RevOps assessment, enterprise SaaS', 'Large consultancy quoted about $230K for 6 weeks', '$27,000 a month for a senior architect at about 2.5 days a week'],
        ['Replacing a sales leader', 'Can cost 1.5x salary, with 3+ months of ramp', 'Swap the operator, then 30 days notice after the initial term'],
      ],
      after: [
        'The most common mismatch we see is expecting full-time availability at a fractional rate. Fix it upfront with a set hour block and a weekly cadence.',
        'Our 2027 survey comparison of fractional and full-time cost [[gap:2027 survey figure|Survey]].',
      ],
    },
    terms: {
      cols: ['Term', 'How it works at Revenue Nomad'],
      rows: [
        ['Contract', 'Every engagement runs on a signed contract'],
        ['Billing', 'Monthly retainer billed upfront for a set number of hours'],
        ['Initial term', '3 to 4 months'],
        ['After the initial term', 'Month-to-month with 30 days notice'],
        ['Overage', 'Hours tracked and flagged before an overage happens. Small overages, e.g. up to 15%, may be agreed in the contract without extra consent'],
        ['Swap-out', 'If the fit is wrong, you can swap the operator'],
        ['Full-time conversion', 'You can hire the operator full time. The terms for that are being confirmed. [[gap:conversion terms|Matt]]'],
        ['Platform fee', 'You pay the operator’s rate. [[gap:confirm no platform or matching fee separate from the operator rate|Matt]]'],
      ],
    },
    faq: [
      ['Why do your ranges differ from other published averages?', 'Ours come from 2026 Revenue Nomad engagements in GTM leadership seats only. Broader averages include tactical and non-GTM work.'],
      ['Is hourly or monthly better?', 'Monthly. A fixed block with a weekly cadence sets clear expectations on both sides.'],
      ['Can I start small?', 'Yes. A RevOps assessment starts at $6,000 and a director-level sales retainer at $4,000 a month.'],
      ['What happens if we go over hours?', 'The operator flags it before it happens. You decide whether to extend.'],
      ['When will the 2027 Rate Index be published?', 'Results from our State of Fractional GTM survey land in early December 2026. This page updates then.'],
    ],
    form: {
      h: 'Get a budget for your seat',
      lede: 'Tell us the seat and the problem and we will price the hours it needs.',
      fields: [
        ['Function', 'Sales, RevOps, marketing, other'],
        ['Seat', 'Manager, director, VP, CRO or CMO, not sure'],
        ['Revenue band', 'Under $5M, $5M to $20M, $20M to $75M, $75M to $100M, $100M+'],
        ['Problem in your words', 'What needs to change?'],
        ['Timing', 'This month, next 1 to 3 months, exploring'],
        ['Who else decides', 'Names or roles'],
      ],
    },
  };
  FN.pages = { sales: SALES, revops: REVOPS, marketing: MARKETING, cost: COST };

  /* ---------- Pieces ---------- */
  const sec = (key, alt, inner) => `<section class="section fn-sec fn-${key}${alt ? ' fn-alt' : ''}"><div class="wrap">${inner}</div></section>`;
  const paras = (list, cls) => (list && list.length ? `<div class="fn-after${cls ? ' ' + cls : ''}">${list.map((p) => `<p class="pg-p">${rich(p)}</p>`).join('')}</div>` : '');

  /* A figure in the hero stat block: "350+" gets a unit span, "2 to 3" a quieter "to" */
  function figure(v) {
    if (v === 'net') v = NET();
    return esc(v).replace(/ to /g, '<span class="fn-to">to</span>').replace(/\+$/, '<span class="fn-u">+</span>');
  }
  function stats(d) {
    return `<dl class="fn-stats" aria-label="${esc(d.eyebrow)} at a glance">${d.stats.map(([v, l]) => `<div class="fn-stat"><dt class="fn-stat-l">${esc(l)}</dt><dd class="fn-stat-v">${figure(v)}</dd></div>`).join('')}</dl>`;
  }
  function hero(d) {
    return PG.hero({
      eyebrow: d.eyebrow,
      h: d.hero.h,
      lede: `<b class="fn-sub">${esc(d.hero.sub)}</b>${esc(RN.fmt.smart(d.hero.lede))}`,
      actions: `<button type="button" class="btn btn-lg" data-act="fn-talk">Talk to us${icon('arrow')}</button><a class="btn btn-line btn-lg" href="#${esc(d.browse)}">Browse operators</a>`,
      aside: stats(d),
    });
  }

  /* Featured operators: the page's role category, by Reputation Index, live profiles before sample ones.
     Matt picks the featured three (pending); until then the order is the same rule every list uses. */
  function featured(cat) {
    return RN.model.ops.filter((o) => o.catKey === cat && !o.hidden)
      .sort((a, b) => (a.sample ? 1 : 0) - (b.sample ? 1 : 0) || (b.ris.score || 0) - (a.ris.score || 0) || String(a.name).localeCompare(String(b.name)))
      .slice(0, 3);
  }
  function who(d) {
    const ops = featured(d.cat);
    const gaps = [['featured picks', 'Matt'], ['operator OK needed for each named operator', 'Operator']].concat(d.who.gaps || []);
    return sec('who', true, `${PG.shead('Operators', 'Who would I get', esc(RN.fmt.smart(d.who.lede)))}
      <div class="fn-feat-hd"><h3 class="h4">Featured operators</h3>${gaps.map(([w, o]) => FN.gap(w, o)).join('')}</div>
      <p class="fn-feat-note small muted">Shown by Reputation Index until the featured picks are confirmed. Every profile is open, no login needed.</p>
      ${ops.length ? `<div class="grid g-3 fn-feat">${ops.map((op) => RN.ui.opCard(op, { cta: 'profile' })).join('')}</div>` : RN.ui.empty({ icon: 'users', title: 'No operators in this category yet', body: 'Featured operators appear here once the bench has live profiles.' })}
      <div class="fn-feat-more"><a class="act" href="#${esc(d.browse)}">Browse every ${esc(RN.fields.catLabel(d.cat).toLowerCase())} operator${icon('arrow')}</a></div>`);
  }

  /* Tables. t: { cols, rows | groups, num (indexes of right-aligned columns), blankFirst, label } */
  function table(t, o) {
    o = o || {};
    const num = t.num || [];
    const n = t.cols.length;
    const th = (c, i) => `<th scope="col"${num.includes(i) ? ' class="r"' : ''}>${i === 0 && t.blankFirst ? `<span class="sr-only">${esc(c)}</span>` : esc(c)}</th>`;
    const row = (r) => {
      if (r.gap) return `<tr><th scope="row">${esc(r.seat)}</th><td colspan="${n - 1}" class="fn-td-gap">${FN.gap(r.gap[0], r.gap[1])}</td></tr>`;
      return `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${rich(c)}</th>` : `<td${num.includes(i) ? ' class="r"' : ''}>${rich(c)}</td>`)).join('')}</tr>`;
    };
    const body = t.groups
      ? t.groups.map((g) => `<tbody class="fn-grp" style="--k:${RN.fields.catColor(g.cat)}"><tr class="fn-grp-h"><th colspan="${n}" scope="rowgroup"><i aria-hidden="true"></i>${esc(g.l)}</th></tr>${g.rows.map(row).join('')}</tbody>`).join('')
      : `<tbody>${t.rows.map(row).join('')}</tbody>`;
    return `<div class="fn-tblw${o.className ? ' ' + o.className : ''}"><table class="fn-tbl${o.wide ? ' fn-tbl-wide' : ''}${o.cost ? ' fn-tbl-cost' : ''}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>
      <thead><tr>${t.cols.map(th).join('')}</tr></thead>${body}</table></div>${o.wide ? `<p class="fn-tbl-hint tiny" aria-hidden="true">${icon('arrow')}Scroll sideways for the full table</p>` : ''}`;
  }
  function cost(d) {
    return sec('cost', false, `${PG.shead('Cost', 'What it costs', esc(d.cost.lede))}
      ${table(d.cost, { wide: true, cost: true, label: 'What clients paid in 2026, by seat' })}
      ${paras(d.cost.after)}`);
  }

  /* What happens first: the When / What happens / What you receive table as a timeline */
  function first(d) {
    const cols = ['When', 'What happens', 'What you receive'];
    return sec('first', true, `${PG.shead('First 90 days', 'What happens first')}
      <div class="fn-tl-hd" aria-hidden="true">${cols.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      <ol class="fn-tl" aria-label="What happens first">${d.first.rows.map(([w, a, b]) => `<li>
        <span class="fn-tl-w">${esc(w)}</span>
        <span class="fn-tl-a" data-l="${cols[1]}">${rich(a)}</span>
        <span class="fn-tl-b" data-l="${cols[2]}">${rich(b)}</span>
      </li>`).join('')}</ol>
      ${d.first.closing ? `<p class="fn-lead">${rich(d.first.closing)}</p>` : ''}`);
  }

  /* Stories: each paragraph a card, its inline labels split out; the marketing scorecard as a weighted list */
  function scorecard(rows) {
    const max = Math.max.apply(null, rows.map((r) => r[1])) || 1;
    return `<div class="fn-score" role="table" aria-label="Weighted scorecard">
      <div class="fn-score-hd" role="row"><span class="label" role="columnheader">Factor</span><span class="label" role="columnheader">Weight</span></div>
      ${rows.map(([f, w]) => `<div class="fn-score-r" role="row"><span class="fn-score-f" role="cell">${esc(f)}</span><span class="fn-score-bar" aria-hidden="true"><i style="--w:${Math.round((w / max) * 100)}%"></i></span><b class="fn-score-w num" role="cell">${esc(w)}%</b></div>`).join('')}
    </div>`;
  }
  function story(parts) {
    return `<article class="fn-story">${parts.map((p) => {
      if (p.table) return scorecard(p.table);
      const l = p[0], t = p[1];
      return `<div class="fn-story-p">${l ? `<span class="fn-story-l">${esc(l)}</span>` : ''}<p>${rich(t)}</p></div>`;
    }).join('')}</article>`;
  }
  function stories(d) {
    const n = d.stories.length;
    return sec('proof', false, `${PG.shead('Proof', 'Who like me has done this', d.storiesLede ? esc(RN.fmt.smart(d.storiesLede)) : '')}
      <div class="grid g-${n > 2 ? 3 : 2} fn-stories">${d.stories.map(story).join('')}</div>
      ${FN.logoStrip({ network: true, pending: true })}`);
  }

  /* How we vet: the four bullets map in order to C, O, R, E */
  function vet(d) {
    const dims = RN.fields.coreDims.options;
    return sec('vet', true, `${PG.shead('Vetting', 'How we vet', esc(d.vet.lead))}
      <ul class="fn-core" aria-label="CORE, the four scores">${d.vet.core.map((t, i) => `<li>
        <span class="fn-core-l" aria-hidden="true">${esc(dims[i].v)}</span>
        <span class="fn-core-n">${esc(dims[i].l)}</span>
        <p>${rich(t)}</p>
      </li>`).join('')}</ul>
      ${paras(d.vet.paras, 'fn-vet-p')}
      <a class="act fn-vet-link" href="#levels">How CORE feeds the Reputation Index${icon('arrow')}</a>`);
  }

  function faq(d) {
    return sec('faq', false, `<div class="fn-faq-in">${PG.shead('FAQ', 'Common questions')}${PG.faq(d.faq)}</div>`);
  }

  /* Form block: the Talk to us form embedded by the Talk builder (RN.talk.embed) with this page's function,
     otherwise a finished card that shows what the form asks and leads to #talk. */
  function fallback(d) {
    return `<div class="fn-form-card">
      <div class="fn-form-card-hd"><span class="label">The form asks</span>${FN.gap('form ships Oct 30', 'Rapid Neuron')}</div>
      <ol class="fn-form-q">${d.form.fields.map(([l, p]) => `<li><b>${esc(l)}</b><span>${esc(p)}</span></li>`).join('')}</ol>
      <div class="fn-form-cta"><a class="btn btn-leaf btn-lg" href="#talk">Talk to us${icon('arrow')}</a><button type="button" class="btn btn-line btn-lg" data-act="pg-book">${icon('calendar')}Book a call</button></div>
      <p class="fn-form-fine small">Every answer goes to a person. A real reply within one business day.</p>
    </div>`;
  }
  function formBlock(d) {
    let embed = '';
    if (RN.talk && typeof RN.talk.embed === 'function') {
      try { embed = RN.talk.embed({ fn: d.fn }) || ''; } catch (e) { console.warn('RN.talk.embed failed, showing the fallback card', e); embed = ''; }
    }
    return `<section class="section night fn-sec fn-form" id="fn-form" data-fn="${esc(d.fn)}"><div class="wrap fn-form-in">
      <div class="fn-form-l">
        <span class="eyebrow">Talk to us</span>
        <h2 class="h2">${esc(d.form.h)}</h2>
        <p class="lede">${esc(RN.fmt.smart(d.form.lede))}</p>
        <p class="fn-form-alt">Rather talk now? <button type="button" class="act" data-act="pg-book">${icon('calendar')}Book a call</button></p>
      </div>
      <div class="fn-form-r${embed ? ' has-embed' : ''}">${embed || fallback(d)}</div>
    </div></section>`;
  }

  /* ---------- Cost hub pieces ---------- */
  function rates(d) {
    const ri = { cols: ['Seat', 'Median rate, typical hours and typical monthly'], rows: d.riSeats.map((s) => ({ seat: s, gap: ['2027 survey figure', 'Survey'] })) };
    const today = d.riCats.map(([k, l]) => {
      const r = RN.model.rateFor(k), m = RN.model.monthlyRange(k, null, '40');
      return `<tr style="--k:${RN.fields.catColor(k)}"><th scope="row"><i class="fn-cat" aria-hidden="true"></i>${esc(l)}</th><td class="r num">${esc(RN.fmt.usd(r.p50))}<span class="fn-per">/hr</span></td><td class="r num">${esc(m.label)}</td></tr>`;
    }).join('');
    return sec('rates', true, `${PG.shead('2026 engagements', 'Rates by seat', esc(d.hero.lede.split('. ')[0] + '.'))}
      ${table(d.rates, { wide: true, cost: true, label: 'Rates by seat, 2026 engagements' })}
      <div class="fn-ri">
        <div class="fn-ri-l">
          <div class="fn-ri-hd"><h3 class="h4">Rate Index by seat</h3>${FN.gap('2027 survey figures, six seats', 'Survey')}</div>
          ${table(ri, { label: 'Rate Index by seat' })}
        </div>
        <aside class="fn-ri-r">
          <div class="fn-ri-hd"><h3 class="h4">Rate Index today, by role category</h3>${RN.ui.illus('Illustrative figures')}</div>
          <div class="fn-tblw"><table class="fn-tbl fn-tbl-ri" aria-label="Rate Index today, by role category">
            <thead><tr><th scope="col">Role category</th><th scope="col" class="r">Median rate</th><th scope="col" class="r">A month at 40 hours</th></tr></thead>
            <tbody>${today}</tbody></table></div>
          <p class="fn-ri-note small">Interim medians from the Rate Index, per role category rather than per seat. The 2027 survey figures replace them in December.</p>
        </aside>
      </div>
      <p class="pg-p fn-outside">${rich(d.outside)}</p>`);
  }
  function moves(d) {
    return sec('moves', false, `${PG.shead('Price drivers', 'What moves the price')}
      <ul class="fn-drivers">${d.moves.items.map((t) => `<li>${rich(t)}</li>`).join('')}</ul>
      <p class="fn-lead">${rich(d.moves.closing)}</p>`);
  }
  function models(d) {
    return sec('models', true, `${PG.shead('Models', 'Engagement models')}${table(d.models, { wide: true, label: 'Engagement models' })}${paras(d.models.after)}`);
  }
  function total(d) {
    return sec('total', false, `${PG.shead('Comparison', 'Total cost against a full-time hire')}${table(d.total, { wide: true, label: 'Total cost against a full-time hire' })}${paras(d.total.after)}`);
  }
  function terms(d) {
    return sec('terms', true, `${PG.shead('Terms', 'How an engagement runs')}${table(d.terms, { label: 'Terms' })}${FN.logoStrip({ network: true, pending: true })}`);
  }

  /* ---------- Views ---------- */
  const homeView = (d) => `<div class="fn-page" data-fn="${esc(d.fn)}">${hero(d)}${who(d)}${cost(d)}${first(d)}${stories(d)}${vet(d)}${faq(d)}${formBlock(d)}</div>`;
  const costView = (d) => `<div class="fn-page fn-page-cost" data-fn="${esc(d.fn)}">${hero(d)}${rates(d)}${moves(d)}${models(d)}${total(d)}${terms(d)}${faq(d)}${formBlock(d)}</div>`;

  [SALES, REVOPS, MARKETING].forEach((d) => {
    RN.view(d.name, { route: d.name, nav: '', title: () => d.title, render: () => homeView(d) });
  });
  RN.view(COST.name, { route: COST.name, nav: '', title: () => COST.title, render: () => costView(COST) });

  /* The hero's Talk to us scrolls to this page's form block and puts focus on its first control */
  RN.actions['fn-talk'] = () => {
    const block = document.getElementById('fn-form');
    if (!block) { RN.go('talk'); return; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    block.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    const first = block.querySelector('.fn-form-r input:not([type="hidden"]), .fn-form-r textarea, .fn-form-r select, .fn-form-r button, .fn-form-r a');
    if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, reduce ? 0 : 420);
  };
})();
