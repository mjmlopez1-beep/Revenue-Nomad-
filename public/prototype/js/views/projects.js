/* Projects + Engagement Blueprints.
   Routes: #projects, #project.new, #project.new.<blueprint id | draft id>, #project.<id>, #blueprints, #blueprint.<id>

   Loop 5 (SPEC section 3): Blueprint -> brief on standard fields -> RN.model.rank (the one fit system)
   -> invites (the Studio inbox reads projects[].invited) -> operator responses (projects[].responses)
   -> client decision (request intro, shortlist, not a fit, select). Every client email goes through RN.mail,
   every client action an operator cares about goes through RN.track.

   Stored project shape (DESIGN.md) plus the extras this surface adds:
   { id, status, title, template, fields:{roleCategory, role, engagementType, hoursPerMonth, term, startBy,
     revenueRange, employeeRange, industries[], salesMotions[], tags[], rateMax, projectBudget}, brief,
     invited:[opId], picked:[opId] (draft invite picks, sent on post), inviteMeta:{opId:{source:'client'|'rn', ts}},
     suggested:[opId], suggest:bool, suggestedAt, visibility:'open'|'invite_only', client:{name,title,email,company},
     responses:[{opId, status:'interested'|'declined', note, rate, hours, ts, decision, reason, introId, closeSent}],
     createdAt, updatedAt, postedAt, staffedAt, closedAt, selectedOpId }
   response.rate is the operator's own rate. Clients always see the all-in rate (PJ.allIn). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const PJ = (RN.projects = RN.projects || {});
  const W = () => RN.w;
  const S = () => RN.store.state;
  const usd = (n) => RN.fmt.usd(n);
  const MAX_INVITES = 8;
  const START_ORDER = ['available_now', 'available_2_weeks', 'available_2_plus_weeks'];
  const LIVE = ['posted', 'in_progress'];

  /* ---------- Money: one fee, rounded once ----------
     The client pays the all-in rate: the operator's own rate divided by 0.75, rounded to the dollar.
     The operator sees the pay rate: the client's budget times 0.75, rounded down, so a pay rate always
     grosses back up to the budget or less (no "$5 over budget" at the edge). Budget checks compare the
     same rounded all-in numbers the client reads. */
  PJ.FEE = 0.25;
  PJ.allIn = (rate) => (rate ? Math.round(+rate / (1 - PJ.FEE)) : null);
  PJ.payFor = (budget) => (budget ? Math.floor(+budget * (1 - PJ.FEE)) : null);
  PJ.ALLIN_LABEL = 'All-in rate (includes the 25% Revenue Nomad fee)';
  PJ.OWN_RATE_NOTE = 'Operator profiles show the operator’s own rate. All-in rates here add the 25% Revenue Nomad fee.';
  PJ.overBudget = (rate, rateMax) => { const a = PJ.allIn(rate); return a && rateMax ? Math.max(0, a - rateMax) : 0; };
  /* Monthly and project totals round to $500, the Rate Index estimator's rule (RN.model.monthlyRange) */
  const r500 = (n) => Math.round((+n || 0) / 500) * 500;
  const allIn500 = (n) => r500(+n / (1 - PJ.FEE));

  /* ---------- Engagement Blueprints (public IP) ----------
     Each Blueprint is framed as the problem it solves (problem), keyed to the `need` picklist and a
     GTM Framework cell (area x stage), then scoped as a seat (role, hours, term) on the standard fields. */
  const PLAN_D = ['Days 1 to 30', 'Days 31 to 60', 'Days 61 to 90'];
  const BP = [
    {
      id: 'vp-sales', cat: 'sales_leadership', role: 'VP of Sales', blurb: 'Build the sales process and hire the first team.',
      problem: 'Sales still runs through the founder', need: 'sales_motion', area: 'Win deals', stage: 'qualify',
      engagementType: 'fractional', hoursPerMonth: '40', term: '6_12', startBy: 'available_2_weeks',
      when: ['The founder still closes most deals and wants out of the day-to-day pipeline.', 'You are about to hire your first two or three AEs and need someone who has ramped a team before.', 'Revenue is growing but nobody can say why deals win or stall.'],
      tags: ['Sales Process Design', 'Sales Team Hiring & Ramp', 'Sales Playbook', 'Pipeline Inspection', 'Outbound Motion Build', 'Founder-Led Sales Exit'],
      success: 'A written sales process the team follows, the first AEs hired and ramping, and a weekly forecast the CEO trusts.',
      plan: [
        { t: 'Diagnose', items: ['Review the last 20 won and lost deals with the founder', 'Map the funnel, stages and conversion rates', 'Agree on the ICP and the number for the next two quarters'] },
        { t: 'Build', items: ['Write the sales process with exit criteria for every stage', 'Open the first AE roles with a scorecard and interview loop', 'Start a weekly pipeline review'] },
        { t: 'Run', items: ['Onboard the first hires on a 30-day ramp plan', 'Hand pipeline reviews from the founder to the sales lead', 'Report a forecast within 15% of actual'] },
      ],
      outcomes: ['Win rate on qualified opportunities', 'Sales cycle length in days', 'Days to first closed deal for new AEs', 'Forecast accuracy against actual', 'Share of pipeline worked without the founder'],
      questions: ['Walk me through the last sales process you built from scratch. What changed in the numbers?', 'How have you hired and ramped a first AE? How long until they closed?', 'How would you split your hours between selling, hiring and building in month one?', 'What do you need from me as the founder in the first 30 days?'],
    },
    {
      id: 'cro', cat: 'sales_leadership', role: 'Chief Revenue Officer', blurb: 'Own the number across sales, marketing and customer success.',
      problem: 'Every team reports a different revenue number', need: 'sales_motion', area: 'Lead & plan', stage: 'commit',
      engagementType: 'fractional', hoursPerMonth: '40', term: '6_12', startBy: 'available_2_weeks',
      when: ['Sales, marketing and CS each report a different number to the board.', 'You raised a round and the plan assumes growth the current team has not delivered.', 'A sales leader left and you need someone senior to hold the number while you hire.'],
      tags: ['Revenue forecasting', 'Board Revenue Reporting', 'Pipeline Inspection', 'Sales org design', 'Annual GTM planning', 'Sales-marketing alignment'],
      success: 'One revenue plan across sales, marketing and CS, a forecast within 10%, and a board-ready GTM narrative.',
      plan: [
        { t: 'Diagnose', items: ['Audit the revenue plan, pipeline coverage and retention by segment', 'Review each GTM leader’s numbers one on one', 'Name the two biggest gaps between plan and reality'] },
        { t: 'Align', items: ['Set one pipeline definition and one forecast call', 'Rebuild the plan with sales, marketing and CS targets', 'Walk the CEO through the GTM narrative before the board sees it'] },
        { t: 'Operate', items: ['Hold the forecast within 10% for a full month', 'Fix or restructure the weakest part of the org', 'Deliver the first board revenue report'] },
      ],
      outcomes: ['Forecast accuracy within 10%', 'Pipeline coverage for next quarter', 'Net revenue retention', 'CAC payback in months', 'Plan attainment by team'],
      questions: ['Tell me about a revenue plan you owned end to end. Where did it miss?', 'How do you align sales, marketing and CS on one number?', 'What do you report to a board, and how often?', 'How would you decide whether we need a full-time CRO?'],
    },
    {
      id: 'cmo', cat: 'marketing', role: 'Chief Marketing Officer', blurb: 'Positioning, brand and a marketing plan with a budget.',
      problem: 'Prospects cannot say what you do', need: 'pipeline', area: 'Generate demand', stage: 'awareness',
      engagementType: 'fractional', hoursPerMonth: '40', term: '3_6', startBy: 'available_2_weeks',
      when: ['Prospects cannot repeat what you do after the first call.', 'You spend on marketing but cannot tie it to pipeline.', 'You are ready for a first marketing hire and want to scope the role right.'],
      tags: ['Brand positioning', 'ICP definition', 'Product Marketing', 'Demand Generation', 'Marketing function build', 'Marketing Team Hiring'],
      success: 'Sharp positioning and messaging, a 12-month marketing plan with a budget, and the first marketing hire scoped.',
      plan: [
        { t: 'Listen', items: ['Interview 8 to 10 customers and 3 lost prospects', 'Audit the website, sales deck and current spend', 'Define the ICP with sales'] },
        { t: 'Position', items: ['Write positioning and messaging and test it on live calls', 'Build the 12-month plan and budget by channel', 'Scope the first marketing hire'] },
        { t: 'Launch', items: ['Ship the new messaging on the site and in the deck', 'Start the first two programs in the plan', 'Report marketing-sourced pipeline every month'] },
      ],
      outcomes: ['Marketing-sourced pipeline per month', 'Win rate after the messaging change', 'Cost per qualified opportunity', 'Website visit to meeting conversion', 'Days to fill the first marketing hire'],
      questions: ['Walk me through a repositioning you led and what changed after it.', 'How do you decide the first marketing hire?', 'Which channel would you test first for a company our size, and why?', 'How do you report marketing results to the CEO?'],
    },
    {
      id: 'vp-revops', cat: 'revenue_operations', role: 'VP of Revenue Operations', blurb: 'A clean CRM, one forecast and reporting leaders use.',
      problem: 'Nobody trusts the CRM or the dashboards', need: 'systems', area: 'Systems & data', stage: 'qualify',
      engagementType: 'fractional', hoursPerMonth: '20', term: '3_6', startBy: 'available_now',
      when: ['Your CRM data is a mess and nobody trusts the dashboards.', 'Every leader pulls a different pipeline number.', 'You are adding tools faster than anyone can connect them.'],
      tags: ['CRM cleanup', 'RevOps Infrastructure Build', 'Revenue Reporting & Dashboards', 'Stage Definitions', 'Lead Routing', 'GTM Tech Stack Audit', 'HubSpot admin'],
      success: 'A clean CRM, one pipeline definition, dashboards leadership uses weekly, and a forecast process that runs itself.',
      plan: [
        { t: 'Audit', items: ['Audit the CRM, data quality and every tool in the stack', 'Document how a lead becomes revenue today', 'Agree on stage definitions with sales leadership'] },
        { t: 'Rebuild', items: ['Deduplicate records and fix required fields', 'Rebuild pipeline stages, routing and ownership rules', 'Build the three dashboards leadership asked for'] },
        { t: 'Hand off', items: ['Run the forecast from the CRM instead of spreadsheets', 'Retire or consolidate unused tools', 'Write the runbook so the team can maintain it'] },
      ],
      outcomes: ['Share of opportunities with every required field', 'Weekly dashboard use by leadership', 'Lead response time', 'Hours spent preparing the forecast each week', 'Tool spend removed'],
      questions: ['Which CRM rebuild are you proudest of, and what did it fix?', 'How do you run a weekly forecast call?', 'How would you decide what to fix first in our stack?', 'What do you document before you hand the system back?'],
    },
    {
      id: 'vp-marketing', cat: 'marketing', role: 'VP of Marketing', blurb: 'Demand generation and pipeline you can trace to marketing.',
      problem: 'Marketing cannot show where pipeline comes from', need: 'pipeline', area: 'Generate demand', stage: 'engage',
      engagementType: 'fractional', hoursPerMonth: '20', term: '3_6', startBy: 'available_2_weeks',
      when: ['Sales asks for more pipeline and marketing cannot show where it comes from.', 'You have one channel that works and need a second.', 'Attribution is guesswork.'],
      tags: ['Demand Generation', 'Paid Acquisition', 'Attribution Modeling', 'Marketing ROI reporting', 'Content Marketing Strategy', 'ABM Strategy'],
      success: 'Two channels producing qualified pipeline every week, clean attribution, and a quarterly plan with a budget.',
      plan: [
        { t: 'Measure', items: ['Set up attribution and one definition of a qualified lead', 'Rank current channels by cost per opportunity', 'Pick two channels to scale'] },
        { t: 'Scale', items: ['Launch the programs with a weekly test cadence', 'Build nurture for leads that are not ready yet', 'Agree the handoff to sales and response times'] },
        { t: 'Prove', items: ['Report pipeline by channel every week', 'Cut spend on anything without pipeline', 'Plan and budget the next quarter'] },
      ],
      outcomes: ['Qualified pipeline per week by channel', 'Cost per qualified opportunity', 'Lead to meeting conversion', 'Marketing-sourced share of closed revenue'],
      questions: ['Which channel did you last scale from zero, and what did an opportunity cost?', 'How do you report pipeline sourced by marketing?', 'How do you agree with sales on what counts as qualified?', 'What would you cut first from our current spend?'],
    },
    {
      id: 'vp-cs', cat: 'customer_success_growth', role: 'VP of Customer Success', blurb: 'Retention and an expansion motion with a named owner.',
      problem: 'Churn shows up at renewal time', need: 'retention', area: 'Retain & expand', stage: 'onboard',
      engagementType: 'fractional', hoursPerMonth: '20', term: '3_6', startBy: 'available_2_weeks',
      when: ['Churn is rising and you find out at renewal time.', 'Onboarding depends on which person the customer gets.', 'Expansion happens by accident, not by plan.'],
      tags: ['Customer Onboarding Program', 'Customer Health Scoring', 'Churn Reduction Program', 'NRR & Expansion Motion', 'Renewal playbook', 'CS Playbook'],
      success: 'An onboarding playbook, health scores on every account, and an expansion motion with a named owner.',
      plan: [
        { t: 'Assess', items: ['Review churned and expanded accounts from the last year', 'Segment customers by value and risk', 'Map onboarding from signature to first value'] },
        { t: 'Build', items: ['Write the onboarding playbook with a time-to-value target', 'Launch health scores on every account', 'Start the renewal process 120 days out'] },
        { t: 'Grow', items: ['Assign expansion ownership and targets', 'Run a save plan on every red account', 'Report NRR and churn reasons monthly'] },
      ],
      outcomes: ['Net revenue retention', 'Gross churn by segment', 'Days to first value for new customers', 'Expansion revenue per quarter', 'Share of accounts with a current health score'],
      questions: ['How did you last cut churn, and by how much?', 'How do you hand accounts from sales to CS?', 'How do you build a health score when the data is thin?', 'Who should own expansion here, CS or sales?'],
    },
    {
      id: 'enablement-director', cat: 'sales_enablement', role: 'Director of Enablement', blurb: 'Onboarding, training and call coaching that cut ramp time.',
      problem: 'New reps take too long to close a first deal', need: 'team', area: 'Build the team', stage: 'qualify',
      engagementType: 'project', projectHours: 60, term: '1_3', startBy: 'available_2_weeks',
      when: ['New reps take six months or more to close their first deal.', 'Every manager coaches differently, or not at all.', 'You are hiring several reps this year and need onboarding that scales.'],
      tags: ['New Hire Sales Onboarding', 'Call Coaching & Feedback', 'Sales Training Program', 'Competitive Battlecards', 'Objection Handling Framework', 'Call Scorecards'],
      success: 'A 30-day AE onboarding program, a weekly call coaching rhythm, and ramp time cut by a third.',
      plan: [
        { t: 'Diagnose', items: ['Interview top reps and new hires about what slowed them down', 'Review call recordings to find the skill gaps', 'Set the ramp baseline in days to first deal'] },
        { t: 'Build', items: ['Build the 30-day onboarding program and certification', 'Create scorecards and battlecards for the top objections', 'Train managers on the coaching rhythm'] },
        { t: 'Embed', items: ['Run the first cohort through the program', 'Score calls weekly against the scorecard', 'Hand the program to a named owner'] },
      ],
      outcomes: ['Days to first closed deal', 'Share of reps certified by day 30', 'Calls coached per manager each week', 'Win rate for reps in their first two quarters'],
      questions: ['Describe an onboarding program you built and its ramp results.', 'How do you keep managers coaching after the launch?', 'Which tools do you use for call review and certification?', 'What do you need from sales leadership to make this stick?'],
    },
    {
      id: 'ai-gtm-architect', cat: 'ai_gtm', role: 'AI GTM Architect', blurb: 'AI workflows and automation across the funnel, measured.',
      problem: 'Reps lose hours a week to research and data entry', need: 'ai', area: 'Systems & data', stage: 'engage',
      engagementType: 'project', projectHours: 80, term: '1_3', startBy: 'available_now',
      when: ['Your team tries AI tools one by one and nothing is measured.', 'Reps spend hours a week on research and data entry.', 'You want outbound and enrichment to scale without adding headcount.'],
      tags: ['GTM AI Strategy', 'GTM Workflow Automation', 'AI Sales Automation', 'AI Lead Scoring', 'Clay Workflow Build', 'CRM workflow automation'],
      success: 'Two AI workflows live in the sales and marketing motion, measured time saved, and a roadmap the team can run.',
      plan: [
        { t: 'Map', items: ['Map where reps and marketers spend time each week', 'Audit data quality and the current tool stack', 'Pick two workflows with a clear time or pipeline payoff'] },
        { t: 'Ship', items: ['Build the first workflow, such as enrichment or account research', 'Connect it to the CRM with logging and error handling', 'Train the team and record the baseline'] },
        { t: 'Scale', items: ['Ship the second workflow', 'Report time saved and pipeline impact', 'Write the roadmap and hand over ownership'] },
      ],
      outcomes: ['Hours saved per rep each week', 'Meetings booked from automated outbound', 'Data completeness on new records', 'Cost per workflow run'],
      questions: ['Which AI workflow have you put into production for a GTM team?', 'How do you measure whether an AI workflow is working?', 'How do you handle errors and bad data in automations?', 'What would you build first here, and why?'],
    },
    {
      id: 'vp-partnerships', cat: 'partnerships', role: 'VP of Partnerships', blurb: 'A partner channel that sources and closes revenue.',
      problem: 'Partner deals happen by accident', need: 'partners', area: 'Generate demand', stage: 'engage',
      engagementType: 'fractional', hoursPerMonth: '20', term: '6_12', startBy: 'available_2_plus_weeks',
      when: ['Partners send a deal now and then but nobody owns the channel.', 'Your customers already use a platform you could integrate or co-sell with.', 'Direct sales costs too much to reach part of your market.'],
      tags: ['Partner Program Build', 'Reseller Channel Build', 'Technology Partnership Build', 'Channel strategy', 'Partnership strategy'],
      success: 'A partner program with tiers and terms, the first five partners signed, and partner-sourced pipeline reported every month.',
      plan: [
        { t: 'Design', items: ['Pick the partner types that reach your ICP', 'Size the opportunity and set targets', 'Draft tiers, margins and rules of engagement'] },
        { t: 'Sign', items: ['Recruit and sign the first five partners', 'Build the enablement kit and deal registration', 'Agree how partner deals work with direct sales'] },
        { t: 'Produce', items: ['Run joint pipeline reviews with each partner', 'Close the first partner-sourced deals', 'Report partner-sourced and influenced pipeline'] },
      ],
      outcomes: ['Partner-sourced pipeline per month', 'Partners with a deal in the last quarter', 'Win rate on partner deals', 'Days from signing to first partner deal'],
      questions: ['Which partner program did you build from zero, and what did it produce in year one?', 'How do you stop channel conflict with direct sales?', 'Which partner type would you start with for us?', 'How do you decide a partner is not worth the time?'],
    },
    {
      id: 'account-executive', cat: 'sellers', role: 'Account Executive', blurb: 'An experienced closer who works your pipeline part time.',
      problem: 'More qualified pipeline than time to work it', need: 'sales_motion', area: 'Win deals', stage: 'commit',
      engagementType: 'fractional', hoursPerMonth: '60', term: '3_6', startBy: 'available_now',
      when: ['The founder has more qualified pipeline than time to work it.', 'You want to prove a new segment before hiring a full-time rep.', 'You need an experienced seller to set the bar for future hires.'],
      tags: ['Discovery Call Execution', 'Enterprise Deal Closing', 'Outbound Prospecting', 'Account Expansion Selling', 'Pipeline management', 'Opportunity Qualification'],
      success: 'Every open opportunity worked to a next step, the first deals closed, and notes that show a full-time rep what works.',
      plan: [
        { t: 'Learn', items: ['Learn the product, ICP and pricing with the founder', 'Review every open opportunity', 'Shadow three sales calls, then lead them'] },
        { t: 'Sell', items: ['Move every deal to a dated next step', 'Run outbound to fill the gaps', 'Update the CRM after every call'] },
        { t: 'Close', items: ['Close the first deals', 'Write down the talk track and top objections', 'Recommend the profile for the first full-time hire'] },
      ],
      outcomes: ['Closed revenue', 'Opportunities moved to a dated next step', 'Meetings booked from outbound', 'Win rate on qualified opportunities'],
      questions: ['What is your average deal size and cycle, and how close is it to ours?', 'How do you split time between our pipeline and new outbound?', 'How do you keep a part-time pipeline moving between your hours?', 'What would you need to close a deal in your first 60 days?'],
    },
  ];
  BP.forEach((b) => { b.title = 'Fractional ' + b.role; });
  PJ.blueprints = BP;
  PJ.blueprint = (id) => BP.find((b) => b.id === id) || null;
  /* The Blueprints that solve a `need` (RN.fields.need slug), best first: for "Start from the problem you have" and the diagnostic */
  PJ.forNeed = (need, cat) => BP.filter((b) => b.need === need).sort((a, b) => (b.cat === cat) - (a.cat === cat));

  /* Rate Index figures for a Blueprint, at the signed-in client's revenue band when there is one.
     Operator rates come from RN.model.rateFor / monthlyRange; all-in adds the 25% fee (rate / 0.75). */
  const rateIdx = (cat, rev) => RN.model.rateFor(cat, rev || null);
  const clientRev = () => (S().persona === 'buyer' ? (RN.personas.buyer.company || {}).revenueRange || null : null);
  PJ.price = function (bp, rev) {
    const project = bp.engagementType === 'project';
    const r = rateIdx(bp.cat, rev);
    const m = project ? null : RN.model.monthlyRange(bp.cat, rev || null, bp.hoursPerMonth);
    const h = project ? bp.projectHours : m.h;
    const lo = project ? r500(r.p25 * h) : m.lo, hi = project ? r500(r.p75 * h) : m.hi;
    return {
      project, h, rev: rev || null, n: r.n,
      rate: { lo: Math.round(r.p25), mid: Math.round(r.p50), hi: Math.round(r.p75) },
      rateAll: { lo: PJ.allIn(r.p25), hi: PJ.allIn(r.p75) },
      total: { lo, hi, label: `${usd(lo)} - ${usd(hi)}${project ? '' : '/mo'}` },
      totalAll: { lo: allIn500(lo), hi: allIn500(hi), label: `${usd(allIn500(lo))} - ${usd(allIn500(hi))}${project ? '' : '/mo'}` },
    };
  };
  function bpBudget(bp) {
    const r = rateIdx(bp.cat, clientRev());
    return bp.engagementType === 'project' ? Math.round((PJ.allIn(r.p50) * bp.projectHours) / 1000) * 1000 : Math.round(PJ.allIn(r.p50) / 5) * 5;
  }

  /* ---------- Normalizing and reading projects ---------- */
  const arr = (v) => (Array.isArray(v) ? v : v ? String(v).split('|').filter(Boolean) : []);
  PJ.get = (id) => (S().projects || []).find((p) => p.id === id) || null;
  PJ.fields = function (p) {
    const f = (p && p.fields) || {};
    return {
      roleCategory: f.roleCategory || '', role: f.role || '', engagementType: f.engagementType || 'fractional',
      hoursPerMonth: f.hoursPerMonth ? String(f.hoursPerMonth) : '', term: f.term || '', startBy: f.startBy || '',
      revenueRange: f.revenueRange || f.companyRevenue || '', employeeRange: f.employeeRange || f.companyEmployees || '',
      industries: arr(f.industries).slice(0, 3), salesMotions: arr(f.salesMotions), tags: arr(f.tags || f.fitTags).slice(0, 8),
      rateMax: +f.rateMax || null, projectBudget: +f.projectBudget || null,
    };
  };
  /* No operator profile lists a GTM motion yet, so a motion signal would read "low" for everyone.
     Until profiles carry it, the signal is left out of ranking (it switches on as soon as data exists). */
  const motionData = () => RN.model.ops.some((o) => (o.motions || []).length);
  function briefOf(f) {
    const b = { roleCategory: f.roleCategory, revenueRange: f.revenueRange, employeeRange: f.employeeRange, industries: f.industries, tags: f.tags };
    if (motionData() && f.salesMotions && f.salesMotions.length) b.salesMotions = f.salesMotions;
    return b;
  }
  PJ.brief = (p) => briefOf(PJ.fields(p));

  function notesFor(op, f, rate) {
    const out = [];
    const r = rate || op.rate;
    if (r) {
      const ai = PJ.allIn(r);
      if (f.engagementType !== 'project' && f.rateMax) {
        const over = PJ.overBudget(r, f.rateMax);
        out.push(over ? { state: 'low', text: `${usd(ai)}/hr all-in, ${usd(over)} over your ${usd(f.rateMax)} budget` } : { state: 'match', text: `${usd(ai)}/hr all-in, inside your budget` });
      } else out.push({ state: 'info', text: `${usd(ai)}/hr all-in` });
    } else out.push({ state: 'partial', text: 'No rate listed' });
    if (f.engagementType !== 'project' && f.hoursPerMonth) {
      const has = op.avail && op.avail.hoursCode;
      if (!has) out.push({ state: 'partial', text: 'Available time not listed' });
      else if (+has < +f.hoursPerMonth) out.push({ state: 'low', text: `Lists ${W().label('hoursPerMonth', has)}, you need ${W().label('hoursPerMonth', f.hoursPerMonth)}` });
      else out.push({ state: 'match', text: `${W().label('hoursPerMonth', has)} open` });
    }
    if (f.startBy && op.avail && START_ORDER.indexOf(op.avail.key) > START_ORDER.indexOf(f.startBy)) out.push({ state: 'low', text: `${op.avail.label}` });
    return out;
  }
  function matches(f, limit) {
    return RN.model.rank(briefOf(f), { limit: limit || 24 }).map((r) => Object.assign(r, { notes: notesFor(r.op, f) }));
  }
  PJ.matches = (p, limit) => matches(PJ.fields(p), limit);
  function counts(f) {
    if (!f.roleCategory) return { strong: 0, good: 0, total: 0 };
    const all = RN.model.rank(briefOf(f), { limit: 400 });
    return { strong: all.filter((r) => r.fit.pct >= 75).length, good: all.filter((r) => r.fit.pct >= 50 && r.fit.pct < 75).length, total: all.length };
  }
  const fitOf = (op, p) => RN.model.fit(op, PJ.brief(p));

  PJ.clientOf = function (p) {
    const me = RN.personas.buyer;
    const c = (p && p.client) || { name: me.name, title: me.title, email: me.email, company: me.company };
    return Object.assign({}, c, { company: Object.assign({}, c.company || {}) });
  };
  /* What operators see before an intro: firmographics, never the company name */
  PJ.blind = function (p) {
    const f = PJ.fields(p);
    const c = PJ.clientOf(p).company;
    const ind = c.industry || f.industries[0];
    return [`A ${ind ? W().label('industries', ind) : 'B2B'} company`, f.revenueRange && `${W().label('companyRevenue', f.revenueRange)} revenue`, f.employeeRange && `${W().label('companyEmployees', f.employeeRange)} employees`].filter(Boolean).join(' · ');
  };
  function scopeLine(f, o) {
    const project = f.engagementType === 'project';
    return [
      f.engagementType && W().label('engagementType', f.engagementType),
      project ? f.projectBudget && `${usd(f.projectBudget)} all-in` : f.hoursPerMonth && W().label('hoursPerMonth', f.hoursPerMonth),
      f.term && W().label('term', f.term),
      f.startBy && 'Start ' + W().label('startBy', f.startBy).toLowerCase(),
      o && o.budget && !project && f.rateMax && `Budget ${usd(f.rateMax)}/hr all-in`,
    ].filter(Boolean).join(' · ');
  }
  PJ.scope = (p) => scopeLine(PJ.fields(p));

  const srcOf = (p, opId) => {
    const m = (p.inviteMeta || {})[opId];
    if ((m && m.source === 'rn') || (p.suggested || []).includes(opId)) return 'rn';
    return (p.invited || []).includes(opId) ? 'client' : 'alert';
  };
  const clientInvites = (p) => (p.invited || []).filter((id) => srcOf(p, id) !== 'rn').length;
  function srcPill(p, opId) {
    const s = srcOf(p, opId);
    if (s === 'rn') return `<span class="pill pill-gold">${icon('seal')}Suggested by Revenue Nomad</span>`;
    if (s === 'client') return '<span class="pill pill-line">Invited</span>';
    return '<span class="pill pill-line">Role alert</span>';
  }

  /* Operator-facing stage (Studio reads this): Invited, Responded, Under review, Selected, Not selected */
  PJ.stage = function (p, opId) {
    const done = p.status === 'staffed' || p.status === 'closed';
    const r = (p.responses || []).find((x) => x.opId === opId);
    if (r) {
      if (r.status === 'declined') return { k: 'declined', l: 'Declined' };
      if (r.decision === 'selected') return { k: 'selected', l: 'Selected' };
      if (r.decision === 'not_a_fit' || r.decision === 'not_selected' || done) return { k: 'not_selected', l: 'Not selected' };
      if (r.decision === 'shortlisted' || r.decision === 'intro_requested') return { k: 'under_review', l: 'Under review' };
      return { k: 'responded', l: 'Responded' };
    }
    if ((p.invited || []).includes(opId)) return done ? { k: 'not_selected', l: 'Not selected' } : { k: 'invited', l: 'Invited' };
    return null;
  };

  /* One project status pill for the whole system (RN.ui.statusPill holds the colour map) */
  const statusPill = (p) => RN.ui.statusPill('project', p.status);
  PJ.statusPill = statusPill;
  /* Revenue Nomad staff are labeled wherever they are listed and kept out of editorial rankings */
  const isStaff = (op) => !!(op && (op.staff || op.isMatt));
  const staffPill = (op) => (isStaff(op) ? '<span class="pill pill-line pj-staff">Revenue Nomad founder</span>' : '');
  /* One toast at a time on this surface: clear earlier ones before a step that ends a flow */
  const clearToasts = () => { if (RN.ui.clearToasts) RN.ui.clearToasts(); else RN.$$('.toasts .toast').forEach((t) => t.remove()); };
  /* Every toast on this surface replaces the previous one, so they never stack */
  const toast = (msg, o) => { clearToasts(); RN.ui.toast(msg, o); };
  const catTag = (cat) => (cat ? `<span class="pj-cat">${RN.ui.catDot(cat)}${esc(RN.fields.catLabel(cat))}</span>` : '');
  const fitPill = (fit) => `<span class="pill ${fit.pct >= 75 ? 'pill-good' : fit.pct >= 50 ? 'pill-accent' : ''} pj-fitpill">${esc(fit.label)} · ${fit.pct}</span>`;
  const SIG_ICON = { match: 'check', partial: 'minus', low: 'x', info: 'info' };
  function sigList(fit) {
    if (!fit.signals.length) return '<p class="tiny muted">Add company and focus areas to the brief to see Match Signals.</p>';
    return `<ul class="pj-sigs">${fit.signals.map((s) => `<li class="is-${s.state}">${icon(SIG_ICON[s.state])}<span><b>${esc(s.l)}</b> ${esc(s.text)}</span></li>`).join('')}</ul>`;
  }
  const notesHtml = (notes) => (notes.length ? `<ul class="pj-notes">${notes.map((n) => `<li class="is-${n.state}">${icon(SIG_ICON[n.state] || 'info')}<span>${esc(n.text)}</span></li>`).join('')}</ul>` : '');
  const isQuiet = (p) => LIVE.includes(p.status) && p.postedAt && RN.now() - new Date(p.postedAt) >= 72 * 36e5 && !(p.responses || []).some((r) => r.status === 'interested');
  const whenLine = (p) => (p.status === 'draft' ? `Edited ${RN.fmt.ago(p.updatedAt || p.createdAt)}` : p.status === 'staffed' && p.staffedAt ? `Staffed ${RN.fmt.dateShort(p.staffedAt)}` : p.status === 'closed' && p.closedAt ? `Closed ${RN.fmt.dateShort(p.closedAt)}` : p.postedAt ? `Posted ${RN.fmt.ago(p.postedAt)}` : '');

  function update(pid, fn) {
    RN.store.update((s) => { const q = s.projects.find((x) => x.id === pid); if (q) { q.responses = q.responses || []; q.invited = q.invited || []; q.inviteMeta = q.inviteMeta || {}; fn(q, s); } }, 'projects');
  }
  const respOf = (p, opId) => (p.responses || []).find((r) => r.opId === opId);
  const pidOf = (el) => { const x = el.closest('[data-pid]'); return x ? x.dataset.pid : null; };

  /* ---------- Revenue Nomad suggestions: up to 3 within 72 hours of posting ---------- */
  const suggestDue = (p) => new Date(new Date(p.postedAt).getTime() + 48 * 36e5);
  function syncSuggestions(p, force) {
    if (!p || p.suggest === false || p.suggestedAt || !LIVE.includes(p.status) || !p.postedAt) return false;
    const due = suggestDue(p);
    if (!force && RN.now() < due) return false;
    const taken = new Set((p.invited || []).concat((p.responses || []).map((r) => r.opId), p.uninvited || []));
    const picks = PJ.matches(p, 40).filter((r) => !taken.has(r.op.id) && r.fit.pct >= 50).slice(0, 3);
    const ts = (force ? RN.now() : due).toISOString();
    update(p.id, (q) => {
      q.suggestedAt = ts;
      q.suggested = picks.map((r) => r.op.id);
      picks.forEach((r) => { q.invited.push(r.op.id); q.inviteMeta[r.op.id] = { source: 'rn', ts }; });
    });
    const f = PJ.fields(p);
    picks.forEach((r) => {
      RN.mail(r.op.name, `Revenue Nomad suggested you: ${p.title}`, `${r.op.first}, we put you forward for this project because you fit it.\n${PJ.blind(p)}\n${scopeLine(f)}${payLine(f)}\n\nIt is in your Studio inbox. Reply within 72 hours with a short note and your rate.`, 'invite');
      RN.track('project_invite', { opId: r.op.id, projectId: p.id, source: 'rn' });
    });
    if (picks.length) RN.mail(PJ.clientOf(p).email, `We suggested ${picks.length} operators for ${p.title}`, `${picks.map((r) => `${r.op.name}, Fractional ${r.op.role} (${r.fit.label.toLowerCase()})`).join('\n')}\n\nWe invited them for you. If they respond, they show in your responses labeled Suggested by Revenue Nomad.`, 'suggestion');
    return true;
  }
  const payLine = (f) => (f.engagementType === 'project' ? (f.projectBudget ? `\nProject budget to you: up to ${usd(PJ.payFor(f.projectBudget))}` : '') : f.rateMax ? `\nPays up to ${usd(PJ.payFor(f.rateMax))}/hr, or name your own rate` : '\nName your own rate');

  /* ---------- Shared bits ---------- */
  function crumbs(items) {
    return `<nav class="crumbs" aria-label="Breadcrumb">${items.map((it, i) => (i < items.length - 1 ? `<a href="#${esc(it[1])}">${esc(it[0])}</a>${icon('chev-right')}` : `<span>${esc(it[0])}</span>`)).join('')}</nav>`;
  }
  function notFound(title, cta, to) {
    return `<section class="wrap-narrow section">${RN.ui.empty({ icon: 'doc', title, body: 'It may have been deleted, or the link is out of date.', cta: `<a class="btn" href="#${esc(to)}">${esc(cta)}</a>` })}</section>`;
  }
  const bpScope = (bp) => [W().label('engagementType', bp.engagementType), bp.engagementType === 'project' ? `About ${bp.projectHours} hours` : W().label('hoursPerMonth', bp.hoursPerMonth), W().label('term', bp.term)].join(' · ');
  /* Blueprint card: the problem first, then the seat that solves it and what it costs.
     The whole card opens the Blueprint; "Post this project" starts the brief from it in one click. */
  function bpCard(bp) {
    const pr = PJ.price(bp, clientRev());
    return `<article class="card card-link pj-bp" data-go="blueprint.${esc(bp.id)}" style="--cat:${RN.fields.catColor(bp.cat)}">
      <span class="label pj-bp-cat">${esc(RN.fields.catLabel(bp.cat))}</span>
      <h3 class="h4 pj-bp-t"><a href="#blueprint.${esc(bp.id)}">${esc(bp.problem)}</a></h3>
      <p class="small pj-bp-seat">${esc(bp.title)}</p>
      <p class="small muted pj-bp-blurb">${esc(bp.blurb)}</p>
      <p class="tiny pj-bp-scope">${esc(bpScope(bp))}</p>
      <div class="pj-bp-rate"><b class="num">${esc(pr.total.label)}</b><span class="tiny muted">${pr.project ? 'Typical project, operator rate' : 'Operator rate'} · ${esc(pr.totalAll.label.replace('/mo', ''))} all-in</span></div>
      <button type="button" class="btn btn-line btn-sm pj-bp-post" data-act="go" data-to="project.new.${esc(bp.id)}">Post this project${icon('arrow')}</button>
    </article>`;
  }
  /* One "illustrative" note for any grid of Blueprint prices */
  const bpPriceNote = () => `<p class="tiny muted pj-bp-note">${RN.ui.illus('Rate Index figures are illustrative')}<span>Operator rates from the Rate Index${clientRev() ? ` for ${esc(W().label('companyRevenue', clientRev()))} revenue companies` : ''}. All-in adds the 25% Revenue Nomad fee.</span></p>`;
  function miniOp(op, right) {
    return `<div class="pj-mini">${RN.ui.avatar(op, 'ava-sm')}<div class="grow"><a class="pj-mini-n" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">${esc(op.name)}</a><span class="tiny muted">Fractional ${esc(op.role)}</span></div>${right || ''}</div>`;
  }

  /* =====================================================================
     #projects: client list, or the posting landing for everyone else
     ===================================================================== */
  let listFilter = 'all';
  const FILTERS = [
    { k: 'all', l: 'All', test: () => true },
    { k: 'draft', l: 'Drafts', test: (p) => p.status === 'draft' },
    { k: 'posted', l: 'Posted', test: (p) => p.status === 'posted' },
    { k: 'in_progress', l: 'In progress', test: (p) => p.status === 'in_progress' },
    { k: 'done', l: 'Staffed or closed', test: (p) => p.status === 'staffed' || p.status === 'closed' },
  ];

  /* ---------- RN.projects.card(p, opts): the one project card ----------
     Shared by #projects and the client workspace (buyer.js). Returns an HTML string.
     p: a stored project record (RN.store.state.projects[]).
     opts (all optional):
       primary  true   the card's action is the filled .btn; pass false for every card but one to keep one primary per area
       compact  false  one line of counts instead of the four-cell stat grid, and no 72-hour note
       brief    false  show the 90-day success line (two lines, clamped)
       hx       'h3'   heading tag for the title ('h2' | 'h3' | 'h4')
     Action: a draft gets "Finish and post"; a live project with responses gets "Review responses". */
  PJ.card = function (p, opts) {
    const o = Object.assign({ primary: true, compact: false, brief: false, hx: 'h3' }, opts && typeof opts === 'object' ? opts : {});
    const hx = /^h[2-4]$/.test(o.hx) ? o.hx : 'h3';
    const f = PJ.fields(p);
    const draft = p.status === 'draft';
    const live = LIVE.includes(p.status);
    const resp = p.responses || [];
    const interested = resp.filter((r) => r.status === 'interested');
    const intros = resp.filter((r) => r.introId || r.decision === 'intro_requested').length;
    const c = draft ? null : counts(f);
    const btn = o.primary ? 'btn btn-sm' : 'btn btn-line btn-sm';
    const act = draft ? `<button type="button" class="${btn}" data-act="pj-finish" data-id="${esc(p.id)}">Finish and post${icon('arrow')}</button>`
      : live && interested.length ? `<button type="button" class="${btn}" data-act="pj-open" data-id="${esc(p.id)}" data-t="responses">Review responses${icon('arrow')}</button>` : '';
    const faces = interested.map((r) => RN.model.byId(r.opId)).filter(Boolean).slice(0, 4);
    const stat = (v, l, hi) => `<div class="pj-cs${hi ? ' hi' : ''}"><b class="num">${esc(v)}</b><span>${esc(l)}</span></div>`;
    const line = draft ? ((p.picked || []).length ? `${RN.fmt.plural(p.picked.length, 'operator')} picked to invite` : '')
      : [`${clientInvites(p)} of ${MAX_INVITES} invited`, RN.fmt.plural(interested.length, 'response'), `${c.strong} strong matches`].join(' · ');
    return `<article class="card card-link pj-card${o.compact ? ' is-compact' : ''}" data-go="project.${esc(p.id)}">
      <div class="pj-card-top">${statusPill(p)}${catTag(f.roleCategory)}<span class="tiny muted pj-card-when">${esc(whenLine(p))}</span></div>
      <${hx} class="pj-card-t"><a href="#project.${esc(p.id)}">${esc(p.title || 'Untitled project')}</a></${hx}>
      <p class="small muted">${esc(scopeLine(f, { budget: true }) || 'Brief not started')}</p>
      ${o.brief && p.brief ? `<p class="small pj-card-brief clamp-2">${esc(p.brief)}</p>` : ''}
      ${draft || o.compact ? `<div class="row pj-card-acts">${act}${line ? `<span class="tiny muted">${esc(line)}</span>` : ''}${faces.length ? `<span class="ava-stack">${faces.map((x) => RN.ui.avatar(x, 'ava-xs')).join('')}</span>` : ''}</div>`
        : `<div class="pj-card-stats">${stat(`${clientInvites(p)} of ${MAX_INVITES}`, 'Invited')}${stat(interested.length, 'Responses')}${stat(c.strong, 'Strong matches')}${stat(intros, 'Intros requested', true)}</div>${act ? `<div class="row pj-card-acts">${act}${faces.length ? `<span class="ava-stack">${faces.map((x) => RN.ui.avatar(x, 'ava-xs')).join('')}</span>` : ''}</div>` : ''}`}
      ${!o.compact && isQuiet(p) ? `<p class="note pj-card-note">${icon('clock')}<span>No responses in 72 hours. Invite more operators from the ranked matches.</span></p>` : ''}
    </article>`;
  };
  RN.actions['pj-open'] = (el) => { tabBy[el.dataset.id] = el.dataset.t || 'matches'; RN.go('project.' + el.dataset.id); };

  function renderProjects() {
    const persona = S().persona;
    if (persona !== 'buyer') return landing(persona);
    const me = RN.personas.buyer;
    const all = S().projects || [];
    all.forEach((p) => syncSuggestions(p));
    const f = FILTERS.find((x) => x.k === listFilter) || FILTERS[0];
    const list = all.filter(f.test).slice().sort((a, b) => new Date(b.updatedAt || b.postedAt || b.createdAt) - new Date(a.updatedAt || a.postedAt || a.createdAt));
    // One primary per area: the newest actionable card owns it; the header button steps back when a card has one
    const lead = list.find((p) => p.status === 'draft' || (LIVE.includes(p.status) && (p.responses || []).some((r) => r.status === 'interested')));
    return `<section class="wrap pj-list">
      <div class="app-head pj-list-head">
        <div><span class="eyebrow">${esc(me.company.name)}</span><h1 style="margin-top:8px">Projects</h1>
        <p class="sub">Post a role, invite who fits, and compare responses ranked by the same Match Signals shown on every profile.</p></div>
        <a class="btn ${lead ? 'btn-line' : ''}" href="#project.new">${icon('plus')}Post a project</a>
      </div>
      <div class="chipset pj-filter" role="group" aria-label="Filter projects by status">
        ${FILTERS.map((x) => `<button type="button" class="chip" aria-pressed="${x.k === f.k}" data-act="pj-filter" data-f="${x.k}">${esc(x.l)} <span class="pj-n">${all.filter(x.test).length}</span></button>`).join('')}
      </div>
      <div class="stack pj-cards" style="--gap:14px">
        ${list.length ? list.map((p) => PJ.card(p, { primary: p === lead })).join('') : RN.ui.empty({ icon: 'briefcase', title: f.k === 'all' ? 'No projects yet' : `No ${f.l.toLowerCase()} projects`, body: 'Start from an Engagement Blueprint below and post in one click.', cta: '' })}
      </div>
      <section class="pj-sec">
        <div class="row between pj-sec-hd"><div><span class="eyebrow">Engagement Blueprints</span><h2 class="h3" style="margin-top:6px">Start from the problem you have</h2></div><a class="act" href="#blueprints">See all ${BP.length}${icon('arrow')}</a></div>
        <div class="grid g-4 pj-bps">${BP.slice(0, 4).map(bpCard).join('')}</div>
        ${bpPriceNote()}
      </section>
    </section>`;
  }

  function landing(persona) {
    const sample = { roleCategory: 'sales_leadership', revenueRange: '20m_50m', employeeRange: '51_200', industries: ['Health Care'], tags: BP[0].tags.slice(0, 3), engagementType: 'fractional', hoursPerMonth: '40', rateMax: 365, startBy: 'available_2_weeks' };
    // A sample ranking is editorial: Revenue Nomad staff are left out of it
    const top = matches(sample, 8).filter((r) => !isStaff(r.op)).slice(0, 3);
    const pool = RN.model.ops.filter((o) => o.catKey === 'sales_leadership').length;
    const steps = [
      ['doc', 'Post free', 'Start from a Blueprint and the brief fills itself. Every field uses the same lists operators fill in.'],
      ['target', 'Invite ranked matches', `Every operator in the role is scored on five Match Signals. The top 3 are picked for you; invite up to ${MAX_INVITES}.`],
      ['clock', 'Compare responses in 72 hours', 'Operators reply from their Studio with a note and their rate. Revenue Nomad can add up to 3 more we know fit.'],
    ];
    return `${persona === 'operator' ? `<div class="wrap" style="padding-top:20px"><div class="note info">${icon('inbox')}<span>You are signed in as an operator. When a client invites you to a project it lands in your Studio inbox. <a href="#studio.inbox">Open your inbox</a></span></div></div>` : ''}
    <section class="wrap pj-hero">
      <div class="pj-hero-grid">
        <div class="pj-hero-copy">
          <span class="eyebrow">Post a project</span>
          <h1 class="h1">Describe the seat once. <span class="serif">Get ranked operators in minutes.</span></h1>
          <p class="lede">Posting is free. We score every operator in the role against your brief, you invite the ones who fit, and their responses land on one page, ranked.</p>
          <div class="row pj-hero-cta"><a class="btn btn-lg" href="#project.new">Post a project${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#blueprints">Browse Blueprints</a></div>
          <p class="small muted">No account needed. You give company basics once.</p>
        </div>
        <div class="card pj-demo" aria-label="Sample ranked matches">
          <div class="pj-demo-hd"><span class="label">Sample brief</span><span class="pill pill-accent">${icon('target')}Ranked from live profiles</span></div>
          <h3 class="h4">Fractional VP of Sales</h3>
          <p class="small muted">${esc(scopeLine(sample))} · ${esc(W().label('industries', 'Health Care'))} · ${esc(W().label('companyRevenue', '20m_50m'))} revenue</p>
          <div class="pj-demo-list">${top.map((r, i) => `<div class="pj-demo-row"><span class="pj-rank num">${i + 1}</span>${miniOp(r.op, fitPill(r.fit))}</div>`).join('')}</div>
          <p class="tiny muted">Ranked from ${pool} Sales Leadership profiles with the same Match Signals clients see on every profile.</p>
        </div>
      </div>
    </section>
    <section class="wrap section-sm">
      <span class="eyebrow">How posting works</span>
      <ol class="grid g-3 pj-steps4">${steps.map((s, i) => `<li class="pj-step4"><span class="pj-step4-i">${icon(s[0])}</span><span class="label">Step ${i + 1}</span><h3 class="h4">${esc(s[1])}</h3><p class="small muted">${esc(s[2])}</p></li>`).join('')}</ol>
    </section>
    <section class="wrap section-sm">
      <div class="row between pj-sec-hd"><div><span class="eyebrow">Engagement Blueprints</span><h2 class="h2" style="margin-top:8px">Start from the problem you have</h2></div><a class="act" href="#blueprints">What a Blueprint includes${icon('arrow')}</a></div>
      <div class="grid g-auto pj-bps" style="--min:250px">${BP.map(bpCard).join('')}</div>
      ${bpPriceNote()}
    </section>
    <section class="wrap section-sm">
      <div class="panel-night night pj-band">
        <div><span class="eyebrow">Pricing</span><h2 class="h3" style="margin-top:8px">Posting is free. You pay only when you hire.</h2>
        <p class="small muted" style="margin-top:10px;max-width:60ch">Every amount you see on a project is the all-in rate, which includes the 25% Revenue Nomad fee. Operator profiles show the operator’s own rate.</p></div>
        <div class="row"><a class="btn btn-leaf" href="#project.new">Post a project</a><a class="btn btn-line" href="#talk">Talk to us</a></div>
      </div>
    </section>`;
  }

  /* =====================================================================
     #project.new, #project.new.<blueprint | draft> and #project.new.<draft>.<step>: 3 steps, autosaved.
     The step lives in the URL, so browser Back moves one step back and a reload keeps your place.
     A signed-in client who starts from a Blueprint lands on Review and post: the Blueprint fills the role
     and scope, the company profile fills the rest, and the top 3 ranked matches are picked to invite.
     ===================================================================== */
  const form = { id: null, bp: null, step: 1, dirtyTitle: false };
  const editing = new Set();   // posted projects opened through "Edit brief"
  const editBuf = {};          // unsaved edits to a posted brief, kept while moving between its steps
  const trail = [];            // forward step moves this session pushed to history: {id, from, to}
  let pendingErrs = null;      // errors to show once the step that has them renders
  const STEPS = ['Role and scope', 'Company and needs', 'Review and post'];
  const newRoute = (id, step) => 'project.new.' + id + (step ? '.' + step : '');
  const setHash = (route) => { try { history.replaceState(history.state, '', '#' + route); } catch (e) { /* file:// in some browsers */ } };
  /* Each form entry in browser history carries {pj: draftId, depth}: 0 for the entry the form opened on, +1 per step
     pushed after it. Posting or saving goes back that many entries, so Back from the project page leaves the form. */
  const depthOf = (id) => (history.state && history.state.pj === id ? history.state.depth || 0 : null);
  const markDepth = (id, depth) => { try { history.replaceState({ pj: id, depth }, '', location.hash); } catch (e) { /* ignore */ } };
  const leaveForm = (id, extra, fallback) => {
    const d = depthOf(id);
    if (d !== null && d + extra > 0 && history.length > d + extra) history.go(-(d + extra));
    else RN.go(fallback, { replace: true });
  };

  function defaultsFor(company) {
    return { roleCategory: '', role: '', engagementType: 'fractional', hoursPerMonth: '', term: '', startBy: '', revenueRange: company.revenueRange || '', employeeRange: company.employeeRange || '', industries: company.industry ? [company.industry] : [], salesMotions: [], tags: [], rateMax: null, projectBudget: null };
  }
  function bpFields(bp, company) {
    return Object.assign(defaultsFor(company), {
      roleCategory: bp.cat, role: bp.role, engagementType: bp.engagementType, hoursPerMonth: bp.engagementType === 'project' ? '' : bp.hoursPerMonth,
      term: bp.term, startBy: bp.startBy, tags: bp.tags.slice(0, 8),
      rateMax: bp.engagementType === 'project' ? null : bpBudget(bp), projectBudget: bp.engagementType === 'project' ? bpBudget(bp) : null,
    });
  }
  const clientNow = () => { const b = RN.personas.buyer; return { name: b.name, title: b.title, email: b.email, company: Object.assign({}, b.company) }; };
  const companyComplete = (c) => !!(c && c.name && c.industry && c.revenueRange && c.employeeRange);
  const recX = (p) => ({ f: PJ.fields(p), title: p.title || '', brief: p.brief || '', client: PJ.clientOf(p) });
  const firstGap = (p) => (validate(recX(p), 1).length ? 1 : validate(recX(p), 2).length ? 2 : 3);

  /* A Blueprint start reuses the client's untouched draft of it from the last 24 hours instead of adding a copy */
  function blueprintDraft(bp) {
    const client = clientNow();
    const now = RN.now();
    const mail = (client.email || '').toLowerCase();
    const reuse = (S().projects || []).find((p) => p.status === 'draft' && p.auto && !p.touched && p.template === bp.id
      && now - new Date(p.createdAt) < 864e5 && (PJ.clientOf(p).email || '').toLowerCase() === mail);
    if (reuse) return reuse;
    const iso = now.toISOString();
    const rec = { id: RN.uid('proj'), status: 'draft', auto: true, title: bp.title, template: bp.id, fields: bpFields(bp, client.company), brief: bp.success, client,
      visibility: 'open', suggest: true, invited: [], picked: [], inviteMeta: {}, suggested: [], responses: [], createdAt: iso, updatedAt: iso };
    RN.store.update((s) => { s.projects.unshift(rec); }, 'projects');
    return PJ.get(rec.id);
  }
  /* The top 3 ranked matches are picked to invite the first time the review step opens. The client can change them. */
  function preselect(p) {
    if (!p || p.status !== 'draft' || p.preselected) return p;
    const picks = (p.picked || []).length ? p.picked : PJ.matches(p, 3).map((r) => r.op.id);
    update(p.id, (q) => { q.preselected = true; q.picked = picks.slice(0, MAX_INVITES); });
    return PJ.get(p.id);
  }

  function notClient(to) {
    const op = S().persona === 'operator';
    return `<section class="wrap-narrow section"><div class="card pj-gate">
      <span class="eyebrow">Post a project</span>
      <h1 class="h2" style="margin-top:10px">Posting is for companies hiring.</h1>
      <p class="lede" style="margin:14px auto 0">You are signed in as ${op ? 'an operator' : 'the Revenue Nomad team'}. Switch to the client view to post, or ${op ? 'open your Studio inbox to answer project invites' : 'go back to Admin'}.</p>
      <div class="row" style="justify-content:center;margin-top:24px"><button type="button" class="btn" data-act="persona" data-p="buyer" data-to="${esc(to)}">Continue as ${esc(RN.personas.buyer.name)}</button><a class="btn btn-line" href="#${op ? 'studio.inbox' : 'admin'}">${op ? 'Open Studio inbox' : 'Back to Admin'}</a></div>
    </div></section>`;
  }

  function renderNew(params) {
    const persona = S().persona;
    const from = params && params.from;
    const want = Math.max(0, Math.min(3, parseInt(params && params.step, 10) || 0));
    if (persona === 'operator' || persona === 'admin') return notClient(from ? newRoute(from, want) : 'project.new');
    let draft = from ? PJ.get(from) : null;
    const bp = draft ? PJ.blueprint(draft.template) : from ? PJ.blueprint(from) : null;
    if (from && !draft && !bp) return notFound('That draft or Blueprint no longer exists', 'Post a project', 'project.new');
    // A posted project opens here only through "Edit brief". Browser Back after posting returns to the project page.
    if (draft && draft.status !== 'draft' && !editing.has(draft.id)) {
      const id = draft.id;
      setTimeout(() => RN.go('project.' + id, { replace: true }), 0);
      return `<section class="wrap-narrow section"><p class="muted">Opening the project page for ${esc(draft.title || 'this project')}.</p></section>`;
    }
    const signedIn = persona === 'buyer';
    let auto = false;
    if (!draft && bp && signedIn) { draft = blueprintDraft(bp); auto = true; }
    const posted = !!(draft && draft.status !== 'draft');
    let step;
    if (draft) {
      const gap = posted ? 3 : firstGap(draft);
      step = want || (auto ? 3 : draft.step || gap);
      if (!posted) step = Math.min(step, gap);
      if (auto && !companyComplete(PJ.clientOf(draft).company)) step = Math.min(step, 2);
      if (step !== want) setHash(newRoute(draft.id, step));
      if (depthOf(draft.id) === null) markDepth(draft.id, 0);
      if (!posted && step === 3) draft = preselect(draft);
    } else step = bp ? 2 : 1; // a visitor starting from a Blueprint: role and scope are already filled in
    const buf = posted ? editBuf[draft.id] : null;
    const client = buf ? buf.client : draft && draft.client ? PJ.clientOf(draft) : clientNow();
    const f = buf ? Object.assign({}, buf.f) : draft ? PJ.fields(draft) : bp ? bpFields(bp, client.company) : defaultsFor(client.company);
    if (draft && !buf) { f.revenueRange = f.revenueRange || client.company.revenueRange || ''; f.employeeRange = f.employeeRange || client.company.employeeRange || ''; }
    form.id = draft ? draft.id : null;
    form.bp = bp;
    form.step = step;
    const title = buf ? buf.title : draft ? draft.title || '' : bp ? bp.title : '';
    const brief = buf ? buf.brief : draft ? draft.brief || '' : bp ? bp.success : '';
    form.dirtyTitle = !!(title && f.role && title !== 'Fractional ' + f.role);
    const project = f.engagementType === 'project';
    const suggest = buf ? buf.suggest : draft ? draft.suggest !== false : true;
    const open = draft ? draft.visibility !== 'invite_only' : true;
    const view = draft ? Object.assign({}, draft, buf ? { title: buf.title, brief: buf.brief, fields: buf.f, client: buf.client, suggest: buf.suggest } : {}) : null;
    const bpLink = bp ? `<a href="#blueprint.${esc(bp.id)}">${esc(bp.title)} Blueprint</a>` : '';
    const fromNote = posted ? ''
      : draft && draft.copiedFrom ? `<div class="note info pj-from">${icon('copy')}<span>Copied from ${esc(draft.copiedFrom)}. Check the brief, then post.</span></div>`
      : bp && draft && draft.auto ? `<div class="note info pj-from">${icon('layers')}<span>Filled in from the ${bpLink} and your company profile. Change anything, then post.</span></div>`
      : bp && !draft ? `<div class="note info pj-from">${icon('layers')}<span>Role and scope are filled in from the ${bpLink}. Add your company basics. <a href="#project.new">Start blank</a></span></div>`
      : '';

    return `<section class="wrap pj-new" data-pj-new>
      ${crumbs([['Projects', 'projects'], [posted ? 'Edit brief' : 'Post a project', '']])}
      <div class="pj-new-grid">
        <form id="pj-form" class="pj-form" data-submit="pj-post" novalidate>
          <div class="pj-form-hd">
            <div class="row between"><span class="step-count">Step ${step} of 3 · ${esc(STEPS[step - 1])}</span><span class="tiny muted pj-saved" data-pj-saved>${draft ? (posted ? `Posted ${esc(RN.fmt.ago(draft.postedAt))}` : `Draft saved ${esc(RN.fmt.ago(draft.updatedAt || draft.createdAt))}`) : 'Saves as you go'}</span></div>
            <div class="stepper" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
            <h1 class="h2">${posted ? 'Edit the brief' : 'Post a project'}</h1>
            ${fromNote}
            ${!bp && !draft && step === 1 ? `<div class="pj-pickbp"><span class="label">Start from a Blueprint</span><div class="chipset">${BP.map((b) => `<a class="chip chip-sm" href="#project.new.${esc(b.id)}">${RN.ui.catDot(b.cat)}${esc(b.role)}</a>`).join('')}</div></div>` : ''}
          </div>

          <div class="pj-step stack" data-step="1" ${step !== 1 ? 'hidden' : ''}>
            <h2 class="h4 pj-step-t">Role and scope</h2>
            ${W().field('roleCategory', f.roleCategory, { name: 'roleCategory', help: 'The discipline this project needs. Matching starts here.' })}
            <div class="field" data-field="role" data-pj-role>${roleControl(f.roleCategory, f.role)}</div>
            <div class="field" data-field="title"><label for="pj-title">Project title</label>
              <input class="input" id="pj-title" name="title" value="${esc(title)}" maxlength="90" placeholder="Fractional VP of Sales" autocomplete="off">
              <p class="help">Operators see this first. We fill it in from the role.</p></div>
            ${W().field('engagementType', f.engagementType, { name: 'engagementType' })}
            <div class="grid g-2 pj-g">
              <div data-pj-hours ${project ? 'hidden' : ''}>${W().field('hoursPerMonth', f.hoursPerMonth, { name: 'hoursPerMonth', label: 'Available time needed', help: 'Hours per month. Operators set the same scale on their profile.' })}</div>
              <div data-pj-rate ${project ? 'hidden' : ''}>${W().field('rateMax', f.rateMax || '', { name: 'rateMax', label: 'Budget per hour, all-in', help: rateHelp(f.rateMax), placeholder: 'e.g. 350' })}</div>
              <div data-pj-budget ${project ? '' : 'hidden'}>${W().field('projectBudget', f.projectBudget || '', { name: 'projectBudget', label: 'Project budget, all-in', help: budgetHelp(f.projectBudget), placeholder: 'e.g. 18000' })}</div>
            </div>
            <div class="grid g-2 pj-g">
              ${W().field('term', f.term, { name: 'term' })}
              ${W().field('startBy', f.startBy, { name: 'startBy' })}
            </div>
            <div class="field" data-field="brief"><label for="pj-brief">What does success look like in 90 days?</label>
              <textarea class="textarea" id="pj-brief" name="brief" maxlength="900" placeholder="The result you want by day 90, in plain words. Operators read this first.">${esc(brief)}</textarea></div>
          </div>

          <div class="pj-step stack" data-step="2" ${step !== 2 ? 'hidden' : ''}>
            <h2 class="h4 pj-step-t">Company and needs</h2>
            ${signedIn ? companyCard(client, f) : visitorFields(client, f)}
            ${W().field('industries', f.industries, { name: 'industries', max: 3, help: 'Pick up to 3. Operators with experience here rank higher.' })}
            ${W().field('salesMotions', f.salesMotions, { name: 'salesMotions', help: 'The motion you run today or want to build.' })}
            ${W().field('fitTags', f.tags, { name: 'tags', max: 8, client: true, noCustom: true, cat: f.roleCategory, label: 'Focus areas the role needs', help: 'From the Fit Tag Library. Operators with these verified by a client review rank first.' })}
          </div>

          <div class="pj-step stack" data-step="3" ${step !== 3 ? 'hidden' : ''}>
            <h2 class="h4 pj-step-t">Review and post</h2>
            <div data-pj-review>${step === 3 ? reviewHtml(view) : ''}</div>
            <div class="pj-switches stack" style="--gap:14px">
              <label class="switch"><input type="checkbox" name="open" value="1" ${open ? 'checked' : ''} ${posted ? 'disabled' : ''}><i></i><span><b>Send a role alert to matching operators</b><span class="small muted">Off means invite only: just the operators you invite${suggest ? ' and our suggestions' : ''} can respond.</span></span></label>
              <label class="switch"><input type="checkbox" name="suggest" value="1" ${suggest ? 'checked' : ''}><i></i><span><b>Let Revenue Nomad suggest up to 3 operators</b><span class="small muted">We invite them within 72 hours. They show as Suggested by Revenue Nomad.</span></span></label>
            </div>
            <p class="small muted pj-fee">${icon('info')}<span>Posting is free. You pay only when you hire, at the ${esc(PJ.ALLIN_LABEL.charAt(0).toLowerCase() + PJ.ALLIN_LABEL.slice(1))}.</span></p>
          </div>

          <div class="pj-form-ft">${footHtml(step, posted)}</div>
        </form>
        <aside class="pj-rail" data-pj-rail>${railHtml(f)}</aside>
      </div>
    </section>`;
  }

  function footHtml(step, posted) {
    const back = step > 1 ? `<button type="button" class="btn btn-line" data-act="pj-step" data-to="${step - 1}">${icon('arrow-left')}Back</button>` : '';
    const leave = posted ? '<button type="button" class="act muted" data-act="pj-edit-cancel">Cancel</button>' : form.id ? '<button type="button" class="act muted" data-act="pj-discard">Discard draft</button>' : '';
    const save = posted ? '' : '<button type="button" class="btn btn-ghost" data-act="pj-save">Save draft</button>';
    const next = step < 3 ? `<button type="button" class="btn" data-act="pj-step" data-to="${step + 1}">Continue${icon('arrow')}</button>` : `<button type="submit" class="btn">${posted ? 'Save changes' : 'Post project'}${icon('arrow')}</button>`;
    return `<div class="row pj-foot-l">${back}${leave}</div><div class="row pj-foot-r">${save}${next}</div>`;
  }
  function roleControl(cat, val) {
    const roles = cat ? RN.fields.rolesByCat[cat] || [] : [];
    const lbl = RN.fields.role.label;
    if (!roles.length) return `<label>${esc(lbl)}</label><p class="help">Pick a role category first.</p><input type="hidden" name="role" value="">`;
    const v = roles.includes(val) ? val : '';
    return `<label for="f-role">${esc(lbl)}</label><div class="chipset" role="group" aria-label="${esc(lbl)}" id="f-role">${roles.map((r) => `<button type="button" class="chip" aria-pressed="${r === v}" data-act="w-chip" data-name="role" data-v="${esc(r)}" data-multi="" data-max="">${esc(r)}</button>`).join('')}<input type="hidden" name="role" value="${esc(v)}"></div>`;
  }
  const rateHelp = (v) => (v ? `Includes the 25% Revenue Nomad fee. Operators see a pay rate of up to ${usd(PJ.payFor(v))}/hr.` : 'What you pay per hour, including the 25% Revenue Nomad fee. Leave blank to see every rate.');
  const budgetHelp = (v) => (v ? `Includes the 25% Revenue Nomad fee. Operators see up to ${usd(PJ.payFor(v))} for the project.` : 'Total for the scoped project, including the 25% Revenue Nomad fee.');

  function companyCard(client, f) {
    const c = client.company;
    return `<div class="card-flat pj-co">
      <div class="pj-co-hd">${icon('building')}<div class="grow"><span class="label">Your company</span><b>${esc(c.name)}</b>
      <span class="small muted">${esc([W().label('industries', c.industry), f.revenueRange && W().label('companyRevenue', f.revenueRange) + ' revenue', f.employeeRange && W().label('companyEmployees', f.employeeRange) + ' employees'].filter(Boolean).join(' · '))}</span></div></div>
      <p class="tiny muted">From your company profile. Operators see the industry and size, not your name, until you request an intro.</p>
      <details class="pj-co-edit"><summary class="act">Change revenue or size for this project</summary>
        <div class="stack" style="--gap:18px;margin-top:14px">
          ${W().field('companyRevenue', f.revenueRange, { name: 'revenueRange', compact: true })}
          ${W().field('companyEmployees', f.employeeRange, { name: 'employeeRange', compact: true })}
        </div></details>
    </div>`;
  }
  function visitorFields(client, f) {
    const c = client.company;
    return `<fieldset class="card-flat stack pj-co" style="--gap:16px">
      <legend class="label">About your company</legend>
      <p class="small muted">Asked once. Operators see your company’s industry and size, not your name, until you request an intro. Sample client details are filled in for the prototype.</p>
      <div class="grid g-2 pj-g">${W().field('fullName', client.name, { name: 'name', compact: true })}${W().field('email', client.email, { name: 'email', compact: true })}</div>
      <div class="grid g-2 pj-g"><div class="field" data-field="company"><label for="pj-co">Company</label><input class="input" id="pj-co" name="company" value="${esc(c.name || '')}" autocomplete="organization"></div>
      ${W().field('industry', c.industry, { name: 'industry', compact: true })}</div>
      ${W().field('companyRevenue', f.revenueRange, { name: 'revenueRange', compact: true })}
      ${W().field('companyEmployees', f.employeeRange, { name: 'employeeRange', compact: true })}
    </fieldset>`;
  }

  function railHtml(f) {
    const next = `<div class="card-flat pj-next"><span class="label">What happens next</span><ol>
      <li><b>Post free.</b> The operators you picked get an invite; matching operators get a role alert.</li>
      <li><b>Responses within 72 hours,</b> each with a note, a rate and the same Match Signals.</li>
      <li><b>Request an intro</b> to the ones you like. We set up the call.</li></ol></div>`;
    if (!f.roleCategory) return `<div class="card pj-live"><span class="pj-live-l"><i class="dot dot-now"></i>Live match</span><h3 class="h4">Pick a role category</h3><p class="small muted">Then every operator in it is scored against your brief as you fill it in.</p></div>${next}`;
    const c = counts(f);
    const top = matches(f, 3);
    return `<div class="card pj-live">
      <span class="pj-live-l"><i class="dot dot-now"></i>Live match</span>
      <p class="pj-live-n"><b class="num">${c.strong}</b> strong and <b class="num">${c.good}</b> good matches</p>
      <p class="small muted">From ${RN.fmt.plural(c.total, 'operator')} in ${esc(RN.fields.catLabel(f.roleCategory))}. Strong match 75+, Good match 50+.</p>
      <div class="pj-live-top">${top.map((r) => miniOp(r.op, fitPill(r.fit))).join('') || '<p class="small muted">No operators in this category yet.</p>'}</div>
      <p class="tiny muted">${esc(PJ.OWN_RATE_NOTE)}</p>
    </div>${next}`;
  }

  /* The review step reads a project record (or a posted brief with its unsaved edits applied) */
  function reviewHtml(rec) {
    const p = rec || PJ.get(form.id);
    if (!p) return '';
    const f = PJ.fields(p);
    const c = PJ.clientOf(p).company;
    const project = f.engagementType === 'project';
    const rows1 = [
      ['Role category', RN.fields.catLabel(f.roleCategory)], [RN.fields.role.label, f.role], ['Project title', p.title],
      [RN.fields.engagementType.label, W().label('engagementType', f.engagementType)],
      project ? ['Project budget, all-in', f.projectBudget ? usd(f.projectBudget) : 'Not set'] : ['Available time needed', W().label('hoursPerMonth', f.hoursPerMonth)],
      !project && ['Budget per hour, all-in', f.rateMax ? `${usd(f.rateMax)}/hr · operators see up to ${usd(PJ.payFor(f.rateMax))}/hr` : 'Not set'],
      [RN.fields.term.label, W().label('term', f.term)], [RN.fields.startBy.label, W().label('startBy', f.startBy)],
    ].filter(Boolean);
    const rows2 = [
      ['Company', c.name || 'Your company'], [RN.fields.companyRevenue.label, W().label('companyRevenue', f.revenueRange)], [RN.fields.companyEmployees.label, W().label('companyEmployees', f.employeeRange)],
      [RN.fields.industries.label, W().labels('industries', f.industries) || 'Any'], [RN.fields.salesMotions.label, f.salesMotions.map((m) => W().label('salesMotions', m)).join(', ') || 'Any'],
    ];
    const dl = (rows) => `<dl class="pj-dl">${rows.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1] || 'Not set')}</dd></div>`).join('')}</dl>`;
    const picked = p.picked || [];
    let invite = '';
    if (p.status === 'draft') {
      const top = matches(f, 6);
      const extra = picked.filter((id) => !top.some((r) => r.op.id === id)).map(RN.model.byId).filter(Boolean).map((op) => ({ op, fit: fitOf(op, p) }));
      const rows = top.concat(extra);
      invite = `<section class="pj-rv-inv" data-pid="${esc(p.id)}">
        <div class="pj-rv-hd"><div><h3 class="h5">Invite when you post</h3><p class="small muted">${p.preselected ? `The top 3 ranked matches are picked. Change any, up to ${MAX_INVITES}.` : `Top matches right now. Pick up to ${MAX_INVITES}.`} You can invite more after posting.</p></div><span class="pill ${picked.length ? 'pill-accent' : ''}" data-pj-count>${picked.length} of ${MAX_INVITES} picked</span></div>
        <div class="stack" style="--gap:8px">${rows.map((r) => { const on = picked.includes(r.op.id); return `<div class="pj-pickrow${on ? ' is-on' : ''}">${miniOp(r.op)}<div class="pj-pick-r">${staffPill(r.op)}${fitPill(r.fit)}</div><button type="button" class="btn btn-sm ${on ? '' : 'btn-line'}" data-act="pj-pick" data-id="${esc(r.op.id)}" aria-pressed="${on}" aria-label="${esc(`${on ? 'Picked' : 'Pick'} ${r.op.name} to invite`)}">${on ? icon('check') + 'Picked' : 'Pick'}</button></div>`; }).join('') || '<p class="small muted">No operators match yet. Widen the focus areas or pick another role category.</p>'}</div>
      </section>`;
    }
    return `<div class="stack" style="--gap:18px">
      ${invite}
      <section class="card-flat pj-rv"><div class="pj-rv-hd"><h3 class="h5">Role and scope</h3><button type="button" class="act" data-act="pj-step" data-to="1" aria-label="Edit role and scope">${icon('edit')}Edit</button></div>${dl(rows1)}
        <div class="pj-rv-brief"><span class="label">What does success look like in 90 days?</span><p>${esc(p.brief || 'Not set')}</p></div></section>
      <section class="card-flat pj-rv"><div class="pj-rv-hd"><h3 class="h5">Company and needs</h3><button type="button" class="act" data-act="pj-step" data-to="2" aria-label="Edit company and needs">${icon('edit')}Edit</button></div>${dl(rows2)}
        <div class="pj-rv-brief"><span class="label">Focus areas the role needs</span>${f.tags.length ? `<div class="opc-tags">${f.tags.map((t) => `<span class="ftag claimed">${esc(t)}</span>`).join('')}</div>` : '<p class="small muted">None picked. Matching uses the role category.</p>'}</div></section>
    </div>`;
  }

  /* Read the form into a normalized record */
  function collect(formEl) {
    const d = RN.ui.formData(formEl);
    const num = (v) => { const n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : null; };
    const f = {
      roleCategory: d.roleCategory || '', role: d.role || '', engagementType: d.engagementType || '', hoursPerMonth: d.hoursPerMonth || '',
      term: d.term || '', startBy: d.startBy || '', revenueRange: d.revenueRange || '', employeeRange: d.employeeRange || '',
      industries: arr(d.industries).slice(0, 3), salesMotions: arr(d.salesMotions), tags: arr(d.tags).slice(0, 8), rateMax: num(d.rateMax), projectBudget: num(d.projectBudget),
    };
    if (f.engagementType === 'project') { f.hoursPerMonth = ''; f.rateMax = null; } else f.projectBudget = null;
    const signedIn = S().persona === 'buyer';
    const me = RN.personas.buyer;
    const client = signedIn
      ? { name: me.name, title: me.title, email: me.email, company: Object.assign({}, me.company, { revenueRange: f.revenueRange, employeeRange: f.employeeRange }) }
      : { name: (d.name || '').trim(), title: '', email: (d.email || '').trim(), company: { name: (d.company || '').trim() || 'Your company', industry: d.industry || '', revenueRange: f.revenueRange, employeeRange: f.employeeRange } };
    const hasSwitches = !!formEl.querySelector('input[name="suggest"]');
    return { f, title: (d.title || '').trim(), brief: (d.brief || '').trim(), client, open: hasSwitches ? arr(d.open).length > 0 : true, suggest: hasSwitches ? arr(d.suggest).length > 0 : true };
  }

  function ensureDraft() {
    if (form.id && PJ.get(form.id)) return PJ.get(form.id);
    const now = RN.now().toISOString();
    const rec = { id: RN.uid('proj'), status: 'draft', title: '', template: form.bp ? form.bp.id : null, fields: {}, brief: '', invited: [], picked: [], inviteMeta: {}, suggested: [], responses: [], step: form.step, createdAt: now, updatedAt: now };
    RN.store.update((s) => { s.projects.unshift(rec); }, 'projects');
    form.id = rec.id;
    setHash(newRoute(rec.id, form.step));
    markDepth(rec.id, 0);
    return rec;
  }
  function save(formEl, o) {
    const cur = form.id ? PJ.get(form.id) : null;
    if (cur && cur.status !== 'draft') return cur; // a posted brief saves on "Save changes"
    const x = collect(formEl);
    const rec = ensureDraft();
    update(rec.id, (q) => {
      q.title = x.title; q.brief = x.brief; q.fields = x.f; q.client = x.client; q.updatedAt = RN.now().toISOString();
      q.suggest = x.suggest; q.visibility = x.open ? 'open' : 'invite_only';
      if (o && o.touched) q.touched = true;
    });
    const el = formEl.querySelector('[data-pj-saved]');
    if (el) el.textContent = 'Draft saved just now';
    return PJ.get(rec.id);
  }

  function validate(x, step) {
    const f = x.f, errs = [];
    if (step === 1) {
      if (!f.roleCategory) errs.push(['roleCategory', 'Pick the role category.']);
      else if (!f.role) errs.push(['role', 'Pick the role.']);
      if (!x.title) errs.push(['title', 'Add a project title so operators know what the seat is.']);
      if (!f.engagementType) errs.push(['engagementType', 'Pick the engagement type.']);
      if (f.engagementType && f.engagementType !== 'project' && !f.hoursPerMonth) errs.push(['hoursPerMonth', 'Pick the time you need each month.']);
      if (!f.term) errs.push(['term', 'Pick the initial term.']);
      if (!f.startBy) errs.push(['startBy', 'Pick when they should start.']);
      if (x.brief.length < 20) errs.push(['brief', 'Say what success looks like in 90 days, in a sentence or two.']);
    }
    if (step === 2) {
      if (S().persona !== 'buyer') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.client.email)) errs.push(['email', 'Add your work email so we can send you responses.']);
        if (!x.client.company.name || x.client.company.name === 'Your company') errs.push(['company', 'Add your company name. Operators do not see it until you request an intro.']);
      }
      if (!f.revenueRange) errs.push(['revenueRange', 'Pick your revenue range.']);
      if (!f.employeeRange) errs.push(['employeeRange', 'Pick your employee range.']);
    }
    return errs;
  }
  function clearErrs(formEl) { RN.$$('.pj-invalid', formEl).forEach((f) => f.classList.remove('pj-invalid')); RN.$$('.field > .err', formEl).forEach((e) => e.remove()); }
  function showErrs(formEl, errs) {
    clearErrs(formEl);
    let first = null;
    errs.forEach(([name, msg]) => {
      const input = formEl.querySelector(`[name="${name}"]`);
      const field = input && input.closest('.field');
      if (!field) return;
      const det = field.closest('details'); if (det) det.open = true;
      field.classList.add('pj-invalid');
      const p = document.createElement('p'); p.className = 'err'; p.setAttribute('role', 'alert'); p.textContent = msg;
      field.appendChild(p);
      if (!first) first = field;
    });
    if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = first.querySelector('input:not([type=hidden]), select, textarea, button'); if (i) i.focus({ preventScroll: true }); }
  }

  /* Move to a step: save, then navigate so the step is in the URL. Moving back to the step this session
     came from uses history.back(), so browser history never gains a loop of the same two steps. */
  function goStep(formEl, to) {
    const cur = form.id ? PJ.get(form.id) : null;
    let id = form.id;
    if (!cur || cur.status === 'draft') { id = save(formEl).id; update(id, (q) => { q.step = to; }); }
    else editBuf[id] = collect(formEl);
    const top = trail[trail.length - 1];
    if (to < form.step && top && top.id === id && top.from === to && top.to === form.step) { trail.pop(); history.back(); return; }
    const d = depthOf(id) || 0;
    trail.push({ id, from: form.step, to });
    RN.go(newRoute(id, to));
    markDepth(id, d + 1);
  }

  RN.actions['pj-step'] = (el) => {
    const formEl = document.getElementById('pj-form');
    if (!formEl) return;
    const to = +el.dataset.to;
    if (!to || to === form.step) return;
    if (to > form.step) {
      const x = collect(formEl);
      for (let s = form.step; s < to; s++) {
        const errs = validate(x, s);
        if (errs.length) { if (s === form.step) showErrs(formEl, errs); else { pendingErrs = { step: s, errs }; goStep(formEl, s); } return; }
      }
    }
    clearErrs(formEl);
    goStep(formEl, to);
  };
  RN.actions['pj-save'] = () => {
    const formEl = document.getElementById('pj-form');
    if (!formEl) return;
    save(formEl, { touched: true });
    toast('Draft saved. It waits under Projects until you post it.', { action: { label: 'View projects', act: 'go', attrs: 'data-to="projects"' } });
  };
  RN.actions['pj-discard'] = () => {
    RN.ui.modal({ title: 'Discard this draft?', sub: 'The brief and your picks are deleted. Nothing was sent to operators.', foot: '<button class="btn btn-line" data-act="modal-close">Keep draft</button><button class="btn btn-danger" data-act="pj-discard-go">Discard draft</button>' });
  };
  RN.actions['pj-discard-go'] = () => {
    const id = form.id;
    RN.ui.closeModal();
    if (id) RN.store.update((s) => { s.projects = s.projects.filter((p) => p.id !== id); }, 'projects');
    form.id = null;
    clearToasts();
    RN.go('projects', { replace: true });
    toast('Draft discarded');
  };
  RN.actions['pj-edit-cancel'] = () => {
    const id = form.id;
    editing.delete(id); delete editBuf[id];
    leaveForm(id, 1, 'project.' + id); // back to the project page the edit started from
  };
  /* Pick or unpick an operator to invite on post. The button and the count are the feedback: no toast. */
  RN.actions['pj-pick'] = (el) => {
    const pid = pidOf(el), id = el.dataset.id;
    const p = PJ.get(pid);
    if (!p) return;
    const on = (p.picked || []).includes(id);
    if (!on && (p.picked || []).length >= MAX_INVITES) { toast(`Pick up to ${MAX_INVITES}. Remove one to add another.`, { icon: 'info' }); return; }
    update(pid, (q) => { q.picked = on ? (q.picked || []).filter((x) => x !== id) : (q.picked || []).concat(id); q.preselected = true; });
    const box = document.querySelector('[data-pj-review]');
    if (box && document.getElementById('pj-form')) {
      box.innerHTML = reviewHtml();
      const btn = box.querySelector(`[data-act="pj-pick"][data-id="${id}"]`);
      if (btn) btn.focus({ preventScroll: true });
    } else RN.rerender();
  };

  RN.submits['pj-post'] = (formEl) => {
    if (form.step < 3) { RN.actions['pj-step']({ dataset: { to: String(form.step + 1) } }); return; }
    const x = collect(formEl);
    for (const s of [1, 2]) { const errs = validate(x, s); if (errs.length) { pendingErrs = { step: s, errs }; goStep(formEl, s); return; } }
    const cur = PJ.get(form.id);
    if (cur && cur.status !== 'draft') {
      update(cur.id, (q) => { q.title = x.title; q.brief = x.brief; q.fields = x.f; q.client = x.client; q.suggest = x.suggest; q.updatedAt = RN.now().toISOString(); });
      (cur.invited || []).forEach((id) => { const op = RN.model.byId(id); if (op) RN.mail(op.name, `Updated brief: ${x.title}`, `${op.first}, the client updated the brief for a project you were invited to.\n${PJ.blind(cur)}\n${scopeLine(x.f)}\n\nSee the change in your Studio inbox.`, 'invite'); });
      editing.delete(cur.id); delete editBuf[cur.id];
      leaveForm(cur.id, 1, 'project.' + cur.id); // back to the project page the edit started from
      toast('Changes saved. Invited operators got the updated brief.');
      return;
    }
    const rec = save(formEl);
    postProject(rec.id, x);
  };

  function postProject(pid, x) {
    const visitor = S().persona !== 'buyer';
    const now = RN.now().toISOString();
    update(pid, (q) => {
      q.status = 'posted'; q.postedAt = now; q.updatedAt = now;
      q.visibility = x.open ? 'open' : 'invite_only'; q.suggest = x.suggest;
      (q.picked || []).forEach((id) => { if (!q.invited.includes(id)) { q.invited.push(id); q.inviteMeta[id] = { source: 'client', ts: now }; } });
      q.picked = [];
      delete q.step;
    });
    if (visitor) {
      // A visitor who posts becomes their own client (same as requesting an intro)
      const demo = RN.personas.buyer.email;
      if (x.client.email && x.client.email.toLowerCase() !== String(demo).toLowerCase() && RN.shell.setClient) RN.shell.setClient({ name: x.client.name, title: '', email: x.client.email, company: x.client.company });
      RN.store.set('persona', 'buyer'); RN.shell.renderHeader(); RN.shell.renderDock();
    }
    const p = PJ.get(pid);
    const f = PJ.fields(p);
    const client = PJ.clientOf(p);
    RN.track('project_post', { projectId: pid, roleCategory: f.roleCategory, tags: f.tags, filters: { roleCategories: [f.roleCategory], revenueRange: [f.revenueRange], employeeRange: [f.employeeRange], industries: f.industries }, buyer: { name: client.company.name, industry: client.company.industry, revenueRange: f.revenueRange, employeeRange: f.employeeRange } });
    (p.invited || []).forEach((id) => sendInvite(p, id, true));
    // Role alert: the best-fitting operators who were not invited hear about it once
    let alerted = 0;
    if (x.open) {
      const alerts = PJ.matches(p, 12).filter((r) => !p.invited.includes(r.op.id) && r.fit.pct >= 50).slice(0, 5);
      alerts.forEach((r) => RN.mail(r.op.name, `New fractional project: ${p.title}`, `${r.op.first}, a project was posted that fits your profile (${r.fit.label.toLowerCase()}).\n${PJ.blind(p)}\n${scopeLine(f)}${payLine(f)}\n\nRespond from your Studio and it moves into your inbox.`, 'alert'));
      alerted = alerts.length;
    }
    const c = counts(f);
    RN.mail(client.email, `Your project is live: ${p.title}`, `We ranked ${RN.fmt.plural(c.total, 'operator')} in ${RN.fields.catLabel(f.roleCategory)} against your brief: ${c.strong} strong and ${c.good} good matches.\n${p.invited.length ? `${RN.fmt.plural(p.invited.length, 'invite')} sent. ` : ''}${x.open ? `${RN.fmt.plural(alerted, 'matching operator')} got a role alert. ` : 'Invite only: just the operators you invite can respond. '}Responses land on your project page within 72 hours.${x.suggest ? '\nRevenue Nomad adds up to 3 suggested operators within 72 hours.' : ''}`, 'project_post');
    const n = p.invited.length;
    flash = { id: pid, text: `Posted and live. ${n ? `${RN.fmt.plural(n, 'invite')} sent` : 'No invites yet: invite from the ranked matches'}${x.open ? `${n ? ' and' : '.'} ${RN.fmt.plural(alerted, 'matching operator')} got a role alert` : ''}. Responses land here within 72 hours, ranked by match.` };
    tabBy[pid] = n ? 'responses' : 'matches';
    form.id = null;
    for (let i = trail.length - 1; i >= 0; i--) if (trail[i].id === pid) trail.splice(i, 1);
    clearToasts();
    // Back from the project page skips the posting form: return to the form's first entry, which redirects to the project
    leaveForm(pid, 0, 'project.' + pid);
    if (visitor) toast(`Posted. We created a client workspace for ${esc(client.company.name)}.`, { action: { label: 'Open workspace', act: 'go', attrs: 'data-to="buyer"' } });
  }

  function sendInvite(p, opId) {
    const op = RN.model.byId(opId);
    if (!op) return;
    const f = PJ.fields(p);
    const fit = fitOf(op, p);
    RN.mail(op.name, `You’re invited: ${p.title}`, `${op.first}, a client invited you to respond to their project.\n${PJ.blind(p)}\n${scopeLine(f)}${payLine(f)}\nYour fit: ${fit.label} (${fit.pct}).\n\nIt is in your Studio inbox. Reply within 72 hours with a short note and your rate.`, 'invite');
    RN.track('project_invite', { opId, projectId: p.id, source: 'client' });
  }

  function mountNew(root) {
    const formEl = root.querySelector('#pj-form');
    if (!formEl) return;
    if (pendingErrs) { const pe = pendingErrs; pendingErrs = null; if (pe.step === form.step) showErrs(formEl, pe.errs); }
    let timer = null;
    const handler = (e) => {
      const t = e.target;
      const name = t && t.name;
      if (!name) return;
      const field = t.closest('.field');
      if (field && field.classList.contains('pj-invalid')) { field.classList.remove('pj-invalid'); const er = field.querySelector('.err'); if (er) er.remove(); }
      if (name === 'roleCategory') onCategory(formEl, t.value);
      if (name === 'role') onRole(formEl, t.value);
      if (name === 'title' && e.type === 'input') form.dirtyTitle = !!t.value.trim();
      if (name === 'engagementType') onType(formEl, t.value);
      if (name === 'rateMax') { const h = formEl.querySelector('[data-pj-rate] .help'); if (h) h.textContent = rateHelp(+t.value || null); }
      if (name === 'projectBudget') { const h = formEl.querySelector('[data-pj-budget] .help'); if (h) h.textContent = budgetHelp(+t.value || null); }
      clearTimeout(timer);
      timer = setTimeout(() => {
        const cur = form.id ? PJ.get(form.id) : null;
        if (!cur || cur.status === 'draft') save(formEl, { touched: true });
        else editBuf[cur.id] = collect(formEl);
        const rail = root.querySelector('[data-pj-rail]');
        if (rail) rail.innerHTML = railHtml(collect(formEl).f);
      }, e.type === 'input' ? 350 : 60);
    };
    formEl.addEventListener('change', handler);
    formEl.addEventListener('input', handler);
  }
  function onCategory(formEl, cat) {
    const box = formEl.querySelector('[data-pj-role]');
    const curRole = (formEl.querySelector('input[name="role"]') || {}).value;
    box.innerHTML = roleControl(cat, curRole);
    const roles = RN.fields.rolesByCat[cat] || [];
    if (roles.length === 1) { const b = box.querySelector('.chip'); if (b) RN.actions['w-chip'](b); }
    const tp = formEl.querySelector('[data-tagpick="tags"]');
    if (tp) { tp.dataset.cat = cat || ''; const s = tp.querySelector('input[type=search]'); if (s && RN.inputs['w-tag-search']) RN.inputs['w-tag-search'](s); }
  }
  function onRole(formEl, role) {
    const t = formEl.querySelector('#pj-title');
    if (t && role && (!form.dirtyTitle || !t.value.trim())) { t.value = 'Fractional ' + role; form.dirtyTitle = false; }
  }
  function onType(formEl, type) {
    const project = type === 'project';
    formEl.querySelector('[data-pj-hours]').hidden = project;
    formEl.querySelector('[data-pj-rate]').hidden = project;
    formEl.querySelector('[data-pj-budget]').hidden = !project;
  }

  /* =====================================================================
     #project.<id>: Matches, Responses, Brief
     ===================================================================== */
  let flash = null;
  const tabBy = {};

  function renderProject(params) {
    const persona = S().persona;
    const p = PJ.get(params.id);
    if (persona === 'operator') {
      const me = RN.personas.operator.opId;
      const inv = p && (p.invited || []).includes(me);
      return `<section class="wrap-narrow section"><div class="card pj-gate"><span class="eyebrow">Client project</span>
        <h1 class="h2" style="margin-top:10px">${inv ? 'You were invited to this project.' : 'This page belongs to the client who posted it.'}</h1>
        ${inv ? `<p class="h5" style="margin-top:14px">${esc(p.title)}</p><p class="small muted">${esc(PJ.blind(p))} · ${esc(scopeLine(PJ.fields(p)))}</p>` : ''}
        <p class="lede" style="margin:14px auto 0">${inv ? `Your stage: ${esc(PJ.stage(p, me).l)}. Respond from your Studio inbox: interested with your rate, or a pass with a reason.` : 'Project invites and role alerts land in your Studio inbox.'}</p>
        <div class="row" style="justify-content:center;margin-top:24px"><a class="btn" href="#studio.inbox">Open Studio inbox</a><button type="button" class="btn btn-line" data-act="persona" data-p="buyer" data-to="project.${esc(params.id)}">View as the client</button></div></div></section>`;
    }
    if (persona !== 'buyer') return RN.ui.gate('buyer');
    if (!p) return notFound('That project does not exist', 'Back to projects', 'projects');
    syncSuggestions(p);
    const q = PJ.get(p.id);
    const f = PJ.fields(q);
    const draft = q.status === 'draft';
    const done = q.status === 'staffed' || q.status === 'closed';
    const resp = q.responses || [];
    const interested = resp.filter((r) => r.status === 'interested');
    const c = counts(f);
    const tab = tabBy[q.id] || (draft ? 'matches' : interested.length ? 'responses' : 'matches');
    const fl = flash && flash.id === q.id ? flash : null;
    flash = null;
    const sel = q.selectedOpId && RN.model.byId(q.selectedOpId);
    const intros = resp.filter((r) => r.introId).length;
    const stat = (v, l, sub) => `<div class="stat"><span class="stat-v">${v}</span><span class="stat-l">${esc(l)}${sub ? `<span class="faint"> · ${esc(sub)}</span>` : ''}</span></div>`;

    return `<section class="wrap pj-page" data-pid="${esc(q.id)}">
      ${crumbs([['Projects', 'projects'], [q.title || 'Untitled project', '']])}
      <header class="pj-head">
        <div class="row pj-head-pills">${statusPill(q)}${draft ? '' : `<span class="pill pill-line">${q.visibility === 'invite_only' ? icon('lock') + 'Invite only' : icon('megaphone') + 'Open to matching operators'}</span>`}${catTag(f.roleCategory)}</div>
        <h1 class="h1 pj-title">${esc(q.title || 'Untitled project')}</h1>
        <p class="pj-meta">${esc([f.role, scopeLine(f, { budget: true }), whenLine(q)].filter(Boolean).join(' · '))}</p>
        <div class="row pj-head-acts">
          ${draft ? `<button type="button" class="btn" data-act="pj-finish" data-id="${esc(q.id)}">Finish and post${icon('arrow')}</button><button type="button" class="act muted" data-act="pj-delete" data-id="${esc(q.id)}">Delete draft</button>`
            : done ? `<button type="button" class="btn btn-line" data-act="pj-duplicate" data-id="${esc(q.id)}">${icon('copy')}Post a similar project</button>`
            : `<button type="button" class="btn" data-act="pj-tab" data-t="matches">${icon('plus')}Invite operators</button><button type="button" class="btn btn-line" data-act="pj-edit" data-id="${esc(q.id)}">${icon('edit')}Edit brief</button><button type="button" class="act muted" data-act="pj-close" data-id="${esc(q.id)}">Close without hiring</button>`}
        </div>
      </header>
      ${fl ? `<div class="note info pj-flash" role="status">${icon('check-circle')}<span>${esc(fl.text)}</span></div>` : ''}
      ${q.status === 'staffed' && sel ? `<div class="note info pj-flash">${icon('handshake')}<span><b>Staffed with ${esc(sel.name)}</b> on ${esc(RN.fmt.date(q.staffedAt))}. Everyone else who responded got one close email and now shows as Not selected.</span></div>` : ''}
      ${q.status === 'closed' ? `<div class="note pj-flash">${icon('info')}<span>Closed without a hire on ${esc(RN.fmt.date(q.closedAt || RN.now()))}. Everyone who responded got one close email.</span></div>` : ''}
      ${isQuiet(q) ? `<div class="note pj-flash">${icon('clock')}<span>No responses in 72 hours. Invite a few more of the ranked matches below${q.suggest === false ? ', or turn on Revenue Nomad suggestions' : ''}.</span></div>` : ''}
      ${draft ? '' : `<div class="stats-row pj-stats" style="--cols:4">${stat(`${clientInvites(q)}<span class="pj-of">/${MAX_INVITES}</span>`, 'Invited', (q.suggested || []).length ? `+${q.suggested.length} suggested` : '')}${stat(interested.length, 'Responses', resp.length - interested.length ? `${resp.length - interested.length} declined` : '')}${stat(c.strong, 'Strong matches', `${c.good} good`)}${stat(intros, 'Intros requested')}</div>`}
      ${draft || done ? '' : suggestNote(q)}
      <div class="tabs pj-tabs" role="tablist">
        ${[['matches', 'Matches', c.strong + c.good], ['responses', 'Responses', interested.length], ['brief', 'Brief', 0]].map((t) => `<button type="button" class="tab" role="tab" aria-selected="${tab === t[0]}" data-act="pj-tab" data-t="${t[0]}">${esc(t[1])}${t[2] ? `<span class="nav-count">${t[2]}</span>` : ''}</button>`).join('')}
      </div>
      <div class="pj-tabbody">${tab === 'responses' ? responsesTab(q) : tab === 'brief' ? briefTab(q) : matchesTab(q)}</div>
    </section>`;
  }

  function suggestNote(p) {
    if (p.suggest === false) return `<div class="pj-sugg">${icon('seal')}<span>Revenue Nomad suggestions are off for this project.</span><button type="button" class="act" data-act="pj-suggest-on">Turn on suggestions</button></div>`;
    if (p.suggestedAt) {
      const ops = (p.suggested || []).map(RN.model.byId).filter(Boolean);
      return `<div class="pj-sugg on">${icon('seal')}<span><b>Suggested by Revenue Nomad</b> on ${esc(RN.fmt.dateShort(p.suggestedAt))}: ${ops.length ? ops.map((o) => esc(o.name)).join(', ') + '. We invited them for you.' : 'no one new fit well enough, so we held back.'}</span></div>`;
    }
    return `<div class="pj-sugg">${icon('seal')}<span>Revenue Nomad adds up to 3 suggested operators within 72 hours, by ${esc(RN.fmt.dateShort(suggestDue(p)))}. They show as Suggested by Revenue Nomad.</span><button type="button" class="act" data-act="pj-suggest-now">Add them now (prototype)</button></div>`;
  }

  function matchesTab(p) {
    const f = PJ.fields(p);
    const draft = p.status === 'draft';
    const done = p.status === 'staffed' || p.status === 'closed';
    const list = matches(f, 24);
    const invited = (p.invited || []).map(RN.model.byId).filter(Boolean);
    const picks = (p.picked || []).map(RN.model.byId).filter(Boolean);
    const strip = draft ? picks : invited;
    return `<div class="pj-toolbar"><p class="small muted">${draft ? `Pick up to ${MAX_INVITES} to invite. Invites go out when you post.` : `Ranked against your brief with the five Match Signals clients see on every profile. Strong match 75+, Good match 50+. Invite up to ${MAX_INVITES} in one click.`}</p>
        <span class="pill">${draft ? `${picks.length} of ${MAX_INVITES} picked` : `${clientInvites(p)} of ${MAX_INVITES} invited`}</span></div>
      ${strip.length ? `<div class="pj-invited"><span class="label">${draft ? 'Picked to invite' : 'Invited'}</span><div class="pj-invited-list">${strip.map((op) => { const s = draft ? { l: 'Picked' } : PJ.stage(p, op.id); return `<div class="pj-inv">${RN.ui.avatar(op, 'ava-xs')}<a href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">${esc(op.name)}</a><span class="pill pj-stage-${esc(s.k || 'picked')}">${esc(srcOf(p, op.id) === 'rn' && !draft ? 'Suggested · ' + s.l : s.l)}</span></div>`; }).join('')}</div></div>` : ''}
      <div class="grid g-3 pj-matches">${list.map((r) => {
        const inv = (p.invited || []).includes(r.op.id), picked = (p.picked || []).includes(r.op.id);
        const resp = respOf(p, r.op.id);
        let ctaAct = 'pj-invite', ctaLabel = 'Invite';
        if (draft) { ctaAct = 'pj-pick'; ctaLabel = picked ? 'Unpick' : 'Pick'; }
        else if (resp) { ctaAct = 'pj-see-resp'; ctaLabel = 'See response'; }
        else if (inv) { ctaAct = 'pj-uninvite'; ctaLabel = 'Uninvite'; }
        if (done && !resp) { ctaAct = 'pj-noop'; ctaLabel = inv ? 'Invited' : 'Closed'; }
        return RN.ui.opCard(r.op, { compact: true, cta: 'invite', ctaAct, ctaLabel, meta: matchMeta(p, r) });
      }).join('') || RN.ui.empty({ icon: 'users', title: 'No operators match this role category yet', body: 'Try a broader role category, or talk to us and we will source someone.', cta: '<a class="btn" href="#talk">Talk to us</a>' })}</div>
      <p class="tiny muted pj-foot-note">${icon('info')}${esc(PJ.OWN_RATE_NOTE)}</p>`;
  }
  function matchMeta(p, r) {
    const inv = (p.invited || []).includes(r.op.id), picked = (p.picked || []).includes(r.op.id);
    const tag = (inv ? srcPill(p, r.op.id) : picked ? '<span class="pill pill-accent">Picked to invite</span>' : '') + staffPill(r.op);
    return `<div class="pj-fit">
      <div class="pj-fit-hd">${fitPill(r.fit)}<span class="tiny muted">${r.fit.count} of ${r.fit.signals.length} signals</span>${tag}</div>
      ${sigList(r.fit)}${notesHtml(r.notes)}
    </div>`;
  }

  const DECISION = { shortlisted: ['Shortlisted', 'pill-accent'], intro_requested: ['Intro requested', 'pill-info'], selected: ['Selected', 'pill-good'], not_a_fit: ['Not a fit', 'pill-bad'], not_selected: ['Not selected', ''] };
  function responsesTab(p) {
    const f = PJ.fields(p);
    const resp = (p.responses || []).map((r) => ({ r, op: RN.model.byId(r.opId) })).filter((x) => x.op);
    const open = resp.filter((x) => x.r.status === 'interested' && !['not_a_fit', 'not_selected'].includes(x.r.decision));
    const closed = resp.filter((x) => !open.includes(x));
    const score = (x) => fitOf(x.op, p).pct;
    open.sort((a, b) => (b.r.decision === 'selected') - (a.r.decision === 'selected') || score(b) - score(a));
    const waiting = (p.invited || []).filter((id) => !respOf(p, id));
    const live = LIVE.includes(p.status);
    const tool = live && waiting.length ? `<div class="pj-proto"><span class="pill pill-line">${icon('bolt')}Prototype tool</span><span class="small muted">Operators reply from their Studio inbox. To see it here without switching persona, simulate a reply.</span><button type="button" class="act" data-act="pj-simulate">Simulate a reply from ${esc(RN.model.byId(waiting[0]).first)}</button></div>` : '';
    if (!resp.length) {
      const body = p.status === 'draft' ? 'Post the project and invited operators reply here within 72 hours.'
        : p.visibility === 'invite_only' ? (waiting.length ? `Your invites went out to ${RN.fmt.plural(waiting.length, 'operator')}. Replies land here within 72 hours.` : 'This project is invite only and nobody is invited yet. Invite operators from Matches.')
        : `Matching operators got a role alert${waiting.length ? ` and ${RN.fmt.plural(waiting.length, 'invite')} went out` : ''}. Replies land here within 72 hours.`;
      return `${RN.ui.empty({ icon: 'inbox', title: 'No responses yet', body, cta: `<button type="button" class="btn btn-line" data-act="pj-tab" data-t="matches">See ranked matches</button>` })}${tool}`;
    }
    return `<div class="pj-toolbar"><p class="small muted">${RN.fmt.plural(open.length, 'active response')}${closed.length ? ` · ${closed.length} closed` : ''}${waiting.length && live ? ` · ${RN.fmt.plural(waiting.length, 'invited operator')} still to reply` : ''}. Sorted by match.</p>
      <span class="small muted pj-allin">${icon('info')}${esc(PJ.ALLIN_LABEL)}</span></div>
      <div class="stack pj-resps" style="--gap:14px">${open.map((x) => respCard(p, f, x.r, x.op)).join('')}</div>
      ${closed.length ? `<h3 class="label pj-closed-h">Closed</h3><div class="stack pj-resps" style="--gap:10px">${closed.map((x) => respCard(p, f, x.r, x.op)).join('')}</div>` : ''}
      ${tool}`;
  }

  function respCard(p, f, r, op) {
    const fit = fitOf(op, p);
    const done = p.status === 'staffed' || p.status === 'closed';
    const declined = r.status === 'declined';
    const rate = r.rate || op.rate;
    const ai = PJ.allIn(rate);
    const over = f.engagementType !== 'project' && f.rateMax ? PJ.overBudget(rate, f.rateMax) : 0;
    const hrs = r.hours || op.avail.hoursCode;
    const dec = DECISION[r.decision];
    const stage = PJ.stage(p, op.id);
    let acts = '';
    if (!declined && !done && !['not_a_fit', 'not_selected', 'selected'].includes(r.decision)) {
      const intro = r.decision === 'intro_requested';
      acts = `${intro ? `<button type="button" class="btn btn-sm" data-act="pj-select" data-id="${esc(op.id)}">Select ${esc(op.first)}</button><button type="button" class="btn btn-line btn-sm" data-act="go" data-to="buyer.intros">${icon('message')}Track intro</button>`
        : `<button type="button" class="btn btn-sm" data-act="pj-intro" data-id="${esc(op.id)}">${icon('handshake')}Request intro</button><button type="button" class="btn btn-line btn-sm" data-act="pj-shortlist" data-id="${esc(op.id)}" aria-pressed="${r.decision === 'shortlisted'}">${icon('bookmark')}${r.decision === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}</button>`}
        <button type="button" class="act muted" data-act="pj-notfit" data-id="${esc(op.id)}">Not a fit</button>${intro ? '' : `<button type="button" class="act" data-act="pj-select" data-id="${esc(op.id)}">Select</button>`}`;
    }
    return `<article class="card pj-resp${declined || (dec && ['not_a_fit', 'not_selected'].includes(r.decision)) ? ' is-closed' : ''}${r.decision === 'selected' ? ' is-selected' : ''}" data-op="${esc(op.id)}">
      <div class="pj-resp-top">
        ${RN.ui.avatar(op, 'ava-md')}
        <div class="grow">
          <div class="row pj-resp-name"><a class="serif-up" href="#op.${esc(op.slug)}" data-track-view="${esc(op.id)}">${esc(op.name)}</a>${staffPill(op)}${srcPill(p, op.id)}<span class="pill ${declined ? 'pill-bad' : 'pill-good'}">${declined ? 'Declined' : 'Interested'}</span>${dec ? `<span class="pill ${dec[1]}">${esc(dec[0])}</span>` : ''}</div>
          <p class="small muted">Fractional ${esc(op.role)} · ${esc(op.ris.label)} ${esc(op.ris.score)} Reputation Index · ${esc(declined ? 'Passed' : 'Responded')} ${esc(RN.fmt.ago(r.ts || p.postedAt))}${r.simulated ? ' · Simulated' : ''}</p>
        </div>
        <div class="pj-resp-fit">${fitPill(fit)}</div>
      </div>
      ${r.note ? `<blockquote class="pj-quote">${esc(r.note)}</blockquote>` : ''}
      ${declined ? '' : `<dl class="pj-facts">
        <div class="pj-fact-wide"><dt>${esc(PJ.ALLIN_LABEL)}</dt><dd>${ai ? `<b class="num">${usd(ai)}/hr</b><span class="tiny muted">${usd(rate)}/hr operator rate</span>` : 'Rate on request'}${ai && f.engagementType !== 'project' && f.rateMax ? `<span class="${over ? 'pj-bad' : 'pj-good'}">${over ? `${usd(over)} over your ${usd(f.rateMax)} budget` : 'Inside your budget'}</span>` : ''}</dd></div>
        <div><dt>${esc(RN.fields.hoursPerMonth.label)}</dt><dd>${esc(hrs ? W().label('hoursPerMonth', hrs) : 'Not listed')}</dd></div>
        <div><dt>${esc(RN.fields.availability.label)}</dt><dd>${esc(op.avail.label)}</dd></div>
      </dl>
      <details class="pj-why"><summary>${icon('target')}Match signals · ${fit.count} of ${fit.signals.length}</summary>${sigList(fit)}${notesHtml(notesFor(op, f, rate).filter((n) => !/all-in/.test(n.text)))}</details>`}
      <div class="pj-resp-acts"><div class="row" style="--gap:10px">${acts}${r.decision === 'not_a_fit' && r.reason ? `<span class="small muted">Reason: ${esc(reasonLabel(r.reason))}</span>` : ''}${r.decision === 'selected' ? `<span class="small muted">Selected ${esc(RN.fmt.dateShort(p.staffedAt || RN.now()))}. Revenue Nomad sends the agreement next.</span>` : ''}</div>
        ${stage ? `<span class="tiny muted pj-sees">${esc(op.first)} sees: <b>${esc(stage.l)}</b></span>` : ''}</div>
    </article>`;
  }

  function briefTab(p) {
    const f = PJ.fields(p);
    const client = PJ.clientOf(p);
    const project = f.engagementType === 'project';
    const bp = PJ.blueprint(p.template);
    const rows = [
      ['roleCategory', RN.fields.catLabel(f.roleCategory)], ['role', f.role], ['engagementType', W().label('engagementType', f.engagementType)],
      project ? ['Project budget, all-in', f.projectBudget ? usd(f.projectBudget) : 'Not set'] : ['Available time needed', W().label('hoursPerMonth', f.hoursPerMonth)],
      !project && ['Budget per hour, all-in', f.rateMax ? `${usd(f.rateMax)}/hr` : 'Not set'],
      ['term', W().label('term', f.term)], ['startBy', W().label('startBy', f.startBy)],
      ['companyRevenue', W().label('companyRevenue', f.revenueRange)], ['companyEmployees', W().label('companyEmployees', f.employeeRange)],
      ['industries', W().labels('industries', f.industries) || 'Any'], ['salesMotions', f.salesMotions.map((m) => W().label('salesMotions', m)).join(', ') || 'Any'],
    ].filter(Boolean);
    const lbl = (k) => (RN.fields[k] ? RN.fields[k].label : k);
    const draft = p.status === 'draft';
    const pay = project ? (f.projectBudget ? `up to ${usd(PJ.payFor(f.projectBudget))} for the project` : 'their own project price') : f.rateMax ? `up to ${usd(PJ.payFor(f.rateMax))}/hr` : 'their own rate';
    return `<div class="pj-brief-grid">
      <article class="card pj-brief">
        <div class="card-hd"><div><h3>Brief</h3><p class="sub">Every field uses the same lists operators fill in on their profile.</p></div>
          ${p.status === 'staffed' || p.status === 'closed' ? '' : `<button type="button" class="btn btn-line btn-sm" data-act="${draft ? 'pj-finish' : 'pj-edit'}" data-id="${esc(p.id)}">${icon('edit')}Edit</button>`}</div>
        <span class="label">What does success look like in 90 days?</span>
        <p class="pj-brief-text">${esc(p.brief || 'Not written yet.')}</p>
        <dl class="pj-dl">${rows.map((r) => `<div><dt>${esc(lbl(r[0]))}</dt><dd>${esc(r[1] || 'Not set')}</dd></div>`).join('')}</dl>
        <span class="label">Focus areas the role needs</span>
        ${f.tags.length ? `<div class="opc-tags" style="margin-top:10px">${f.tags.map((t) => `<span class="ftag claimed">${esc(t)}</span>`).join('')}</div>` : '<p class="small muted" style="margin-top:8px">None picked.</p>'}
      </article>
      <aside class="stack" style="--gap:14px">
        <div class="card-flat pj-sees-card"><span class="label">What operators see</span>
          <p><b>${esc(PJ.blind(p))}</b></p>
          <p class="small muted">Your company name stays hidden until you request an intro. Operators see a pay rate of ${esc(pay)}: your budget minus the 25% Revenue Nomad fee.</p></div>
        <div class="card-flat pj-sees-card"><span class="label">Your company</span><p><b>${esc(client.company.name || 'Your company')}</b></p><p class="small muted">${esc([client.name, client.email].filter(Boolean).join(' · '))}</p></div>
        <div class="card-flat pj-sees-card"><span class="label">Settings</span>
          <p class="small">${p.visibility === 'invite_only' ? 'Invite only' : 'Open to matching operators'} · Suggestions ${p.suggest === false ? 'off' : 'on'}</p>
          ${bp ? `<p class="small">Started from the <a href="#blueprint.${esc(bp.id)}">${esc(bp.title)} Blueprint</a></p>` : ''}</div>
      </aside>
    </div>`;
  }

  /* ---------- Project page actions ---------- */
  RN.actions['pj-tab'] = (el) => { const pid = pidOf(el); if (!pid) return; tabBy[pid] = el.dataset.t; RN.rerender(); };
  RN.actions['pj-see-resp'] = (el) => { const pid = pidOf(el); tabBy[pid] = 'responses'; RN.rerender(); };
  RN.actions['pj-noop'] = () => toast('This project is closed to new invites.', { icon: 'info' });
  RN.actions['pj-filter'] = (el) => { listFilter = el.dataset.f; RN.rerender(); };
  /* Finish a draft: open it at the first step with a gap, or at Review and post when it is complete */
  RN.actions['pj-finish'] = (el) => {
    const p = PJ.get(el.dataset.id);
    if (!p) return;
    RN.go(newRoute(p.id, firstGap(p)));
  };
  RN.actions['pj-edit'] = (el) => { const id = el.dataset.id; editing.add(id); delete editBuf[id]; RN.go(newRoute(id, 1)); };
  RN.actions['pj-delete'] = (el) => {
    RN.ui.modal({ title: 'Delete this draft?', sub: 'Nothing was sent to operators.', foot: `<button class="btn btn-line" data-act="modal-close">Keep draft</button><button class="btn btn-danger" data-act="pj-delete-go" data-id="${esc(el.dataset.id)}">Delete draft</button>` });
  };
  RN.actions['pj-delete-go'] = (el) => {
    const id = el.dataset.id;
    RN.ui.closeModal();
    RN.store.update((s) => { s.projects = s.projects.filter((p) => p.id !== id); }, 'projects');
    clearToasts();
    RN.go('projects', { replace: true });
    toast('Draft deleted');
  };
  RN.actions['pj-duplicate'] = (el) => {
    const p = PJ.get(el.dataset.id);
    if (!p) return;
    const now = RN.now().toISOString();
    const rec = { id: RN.uid('proj'), status: 'draft', title: p.title, template: p.template || null, fields: JSON.parse(JSON.stringify(p.fields || {})), brief: p.brief, client: p.client, suggest: true, visibility: 'open', invited: [], picked: [], inviteMeta: {}, suggested: [], responses: [], copiedFrom: p.title, createdAt: now, updatedAt: now };
    RN.store.update((s) => { s.projects.unshift(rec); }, 'projects');
    RN.go(newRoute(rec.id, firstGap(rec))); // the page says it is a copy; no toast
  };
  RN.actions['pj-suggest-now'] = (el) => {
    const p = PJ.get(pidOf(el));
    if (!p) return;
    syncSuggestions(p, true);
    const q = PJ.get(p.id);
    RN.rerender();
    toast((q.suggested || []).length ? `Revenue Nomad invited ${RN.fmt.plural(q.suggested.length, 'suggested operator')}.` : 'No new operators fit well enough to suggest.', { icon: 'seal' });
  };
  RN.actions['pj-suggest-on'] = (el) => {
    const pid = pidOf(el);
    update(pid, (q) => { q.suggest = true; });
    RN.rerender();
    toast('Suggestions on. Revenue Nomad adds up to 3 operators within 72 hours.', { icon: 'seal' });
  };

  RN.actions['pj-invite'] = (el) => {
    const p = PJ.get(pidOf(el));
    const id = el.dataset.id;
    if (!p || !LIVE.includes(p.status)) return;
    if ((p.invited || []).includes(id)) return;
    if (clientInvites(p) >= MAX_INVITES) { toast(`You can invite up to ${MAX_INVITES} operators. Uninvite one to add another.`, { icon: 'info' }); return; }
    const now = RN.now().toISOString();
    update(p.id, (q) => { q.invited.push(id); q.inviteMeta[id] = { source: 'client', ts: now }; q.uninvited = (q.uninvited || []).filter((x) => x !== id); q.updatedAt = now; });
    sendInvite(PJ.get(p.id), id);
    const op = RN.model.byId(id);
    RN.rerender();
    toast(`Invited ${esc(op.first)}. It is in their Studio inbox with 72 hours to reply.`);
  };
  RN.actions['pj-uninvite'] = (el) => {
    const p = PJ.get(pidOf(el));
    const id = el.dataset.id;
    if (!p || respOf(p, id)) return;
    update(p.id, (q) => { q.invited = q.invited.filter((x) => x !== id); delete q.inviteMeta[id]; q.suggested = (q.suggested || []).filter((x) => x !== id); q.uninvited = (q.uninvited || []).concat(id); });
    const op = RN.model.byId(id);
    RN.rerender();
    toast(`Invite withdrawn. ${esc(op.first)} no longer sees this project in Studio.`, { icon: 'info' });
  };

  RN.actions['pj-shortlist'] = (el) => {
    const p = PJ.get(pidOf(el));
    const id = el.dataset.id;
    const r = p && respOf(p, id);
    if (!r) return;
    const on = r.decision === 'shortlisted';
    update(p.id, (q) => { respOf(q, id).decision = on ? '' : 'shortlisted'; });
    const inList = S().shortlist.includes(id);
    if (!on && !inList) { RN.store.update((s) => { s.shortlist = [id].concat(s.shortlist); }, 'shortlist'); RN.track('shortlist_add', { opId: id, source: 'project', projectId: p.id }); }
    const op = RN.model.byId(id);
    RN.rerender();
    toast(on ? `Moved ${esc(op.first)} back to review.` : `Shortlisted ${esc(op.first)}. Also saved to your workspace shortlist.`, on ? { icon: 'info' } : { action: { label: 'View shortlist', act: 'go', attrs: 'data-to="buyer.shortlist"' } });
  };

  RN.actions['pj-intro'] = (el) => {
    const p = PJ.get(pidOf(el));
    const id = el.dataset.id;
    if (!p) return;
    const op = RN.model.byId(id);
    const f = PJ.fields(p);
    const client = PJ.clientOf(p);
    const st = S();
    // Only this project's client's own open request counts as "already asked" (never another client's)
    const mail = (client.email || '').toLowerCase();
    const existing = (st.intros || []).find((i) => i.opId === id && i.status !== 'declined' && !i.withdrawn && i.buyer && (i.buyer.email || '').toLowerCase() === mail) || null;
    let introId = existing && existing.id;
    if (!existing) {
      const need = Object.keys(RN.fields.needCats).find((k) => (RN.fields.needCats[k] || []).includes(f.roleCategory)) || 'not_sure';
      const project = f.engagementType === 'project';
      const rec = {
        id: RN.uid('intro'), opId: id, status: 'pending', createdAt: RN.now().toISOString(), projectId: p.id,
        buyer: { name: client.name, title: client.title || '', email: client.email, company: client.company }, need,
        fields: { need, engagementType: f.engagementType, hoursPerMonth: project ? '' : f.hoursPerMonth, projectBudget: project ? f.projectBudget : null, startBy: f.startBy, roleCategory: f.roleCategory },
        note: `About your response to “${p.title}”. ${p.brief || ''}`.trim(), thread: [],
      };
      RN.store.update((s) => { s.intros.unshift(rec); }, 'intros');
      RN.track('intro_request', { opId: id, projectId: p.id, source: 'project', buyer: { name: client.company.name, industry: client.company.industry, revenueRange: f.revenueRange, employeeRange: f.employeeRange } });
      const sum = RN.intro && RN.intro.summary ? RN.intro.summary(rec, true) : { who: PJ.blind(p), scope: scopeLine(f) };
      RN.mail(op.name, `New intro request: ${p.title}`, `${sum.who}\n${sum.scope}\n\nThe client read your response and wants to talk. Reply within 72 hours from your Studio. You see the company and contact once you are introduced.`, 'intro');
      RN.mail(client.email, `We sent your intro request to ${op.first}`, `${op.name} has 72 hours to confirm. Our team then introduces you by email so you can book the first call.\n\nTrack it in your workspace.`, 'intro');
      introId = rec.id;
    }
    update(p.id, (q) => { const r = respOf(q, id); if (r) { r.decision = 'intro_requested'; r.introId = introId; } if (q.status === 'posted') q.status = 'in_progress'; });
    RN.rerender();
    toast(existing ? `You already asked to meet ${esc(op.first)}. Linked that request to this project.` : `Intro requested. ${esc(op.first)} has 72 hours to confirm.`, { action: { label: 'Track intro', act: 'go', attrs: 'data-to="buyer.intros"' } });
  };

  /* Not a fit: one close email, sent now. Reasons use the one registry list, RN.fields.passReason, which is also
     what operators pick when they pass, so client and operator reasons can be joined for match tuning. */
  const reasonLabel = (v) => W().label('passReason', v);
  const isReason = (v) => !!(RN.fields.passReason && RN.fields.passReason.options.some((o) => o.v === v));
  RN.actions['pj-notfit'] = (el) => {
    const pid = pidOf(el), id = el.dataset.id;
    const op = RN.model.byId(id);
    RN.ui.modal({
      title: `Not a fit: ${esc(op.name)}`,
      sub: `${esc(op.first)} gets one short close email now. The reason stays with Revenue Nomad and tunes future matches.`,
      body: `<form id="pj-nf" data-submit="pj-notfit-go" data-pid="${esc(pid)}" data-id="${esc(id)}" class="stack" style="--gap:18px" novalidate>
        ${W().field('passReason', '', { name: 'reason', id: 'pj-nf-reason', label: 'What did not fit?', help: 'Only Revenue Nomad sees this. It is the same list operators use when they pass.' })}
        <div class="field"><label for="pj-nf-note">Note for our team <span class="opt">Optional</span></label><textarea class="textarea" id="pj-nf-note" name="note" maxlength="400" style="min-height:80px" placeholder="Anything that helps us match better next time."></textarea></div>
      </form>`,
      foot: '<button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" type="submit" form="pj-nf">Send close email</button>',
    });
  };
  RN.submits['pj-notfit-go'] = (formEl, data) => {
    if (!data.reason) { toast('Pick a reason so we can match better next time.', { icon: 'info' }); return; }
    const pid = formEl.dataset.pid, id = formEl.dataset.id;
    const p = PJ.get(pid);
    const op = RN.model.byId(id);
    const r = respOf(p, id);
    const send = r && !r.closeSent;
    update(pid, (q) => { const x = respOf(q, id); x.decision = 'not_a_fit'; x.reason = data.reason; x.reasonNote = data.note || ''; x.closeSent = true; });
    if (send) closeMail(p, op);
    RN.ui.closeModal();
    RN.rerender();
    toast(`Marked not a fit. ${esc(op.first)} got one close email.`, { icon: 'info' });
  };
  function closeMail(p, op, unfilled) {
    RN.mail(op.name, `Update on ${p.title}`, `${op.first}, thank you for responding to the ${p.title} project. ${unfilled ? 'The client closed the project without filling it.' : 'The client went another direction.'} Your response stays on file and we keep matching you with new projects.`, 'close');
  }

  RN.actions['pj-select'] = (el) => {
    const pid = pidOf(el), id = el.dataset.id;
    const p = PJ.get(pid);
    const op = RN.model.byId(id);
    const others = (p.responses || []).filter((r) => r.opId !== id && r.status === 'interested' && !r.closeSent).length;
    RN.ui.modal({
      title: `Select ${esc(op.name)}?`,
      sub: esc(p.title),
      body: `<ul class="pj-checks">
        <li>${icon('check')}<span>The project is marked Staffed and closes to new responses.</span></li>
        <li>${icon('check')}<span>${esc(op.first)} gets a selected email and Revenue Nomad sends the agreement.</span></li>
        <li>${icon('check')}<span>${others ? `${RN.fmt.plural(others, 'other responder')} each get${others === 1 ? 's' : ''} one close email and move to Not selected.` : 'No other responders are waiting on a decision.'} Operators who never responded get nothing.</span></li>
      </ul><p class="small muted" style="margin-top:14px">${esc(PJ.ALLIN_LABEL)}: ${PJ.allIn(respOf(p, id).rate || op.rate) ? usd(PJ.allIn(respOf(p, id).rate || op.rate)) + '/hr' : 'set in the agreement'}.</p>`,
      foot: `<button class="btn btn-line" data-act="modal-close">Cancel</button><button class="btn" data-act="pj-select-go" data-pid="${esc(pid)}" data-id="${esc(id)}">Select ${esc(op.first)}</button>`,
    });
  };
  RN.actions['pj-select-go'] = (el) => {
    const pid = el.dataset.pid, id = el.dataset.id;
    const p = PJ.get(pid);
    const op = RN.model.byId(id);
    const client = PJ.clientOf(p);
    const now = RN.now().toISOString();
    const toClose = (p.responses || []).filter((r) => r.opId !== id && r.status === 'interested' && !r.closeSent).map((r) => r.opId);
    update(pid, (q) => {
      q.status = 'staffed'; q.staffedAt = now; q.selectedOpId = id; q.updatedAt = now;
      q.responses.forEach((r) => {
        if (r.opId === id) r.decision = 'selected';
        else if (r.status === 'interested') { if (r.decision !== 'not_a_fit') r.decision = 'not_selected'; r.closeSent = true; }
      });
    });
    RN.mail(op.name, `You were selected: ${p.title}`, `${op.first}, ${client.company.name} selected you for their ${p.title} project. Revenue Nomad sends the agreement next. Congratulations.`, 'selected');
    toClose.forEach((oid) => { const o = RN.model.byId(oid); if (o) closeMail(p, o); });
    RN.mail(client.email, `You selected ${op.name}`, `${p.title} is staffed. We sent ${op.first} the agreement and closed the project to new responses.${toClose.length ? `\n${RN.fmt.plural(toClose.length, 'other responder')} got one close email.` : ''}`, 'selected');
    RN.track('project_select', { opId: id, projectId: pid });
    RN.ui.closeModal();
    RN.rerender();
    toast(`Selected ${esc(op.first)}. ${toClose.length ? `${RN.fmt.plural(toClose.length, 'close email')} sent.` : ''}`);
  };

  RN.actions['pj-close'] = (el) => {
    const p = PJ.get(el.dataset.id);
    const n = (p.responses || []).filter((r) => r.status === 'interested' && !r.closeSent).length;
    RN.ui.modal({ title: 'Close without hiring?', sub: `${n ? `${RN.fmt.plural(n, 'responder')} each get${n === 1 ? 's' : ''} one close email.` : 'Nobody is waiting on a decision.'} The project stops taking responses.`, foot: `<button class="btn btn-line" data-act="modal-close">Keep it open</button><button class="btn btn-danger" data-act="pj-close-go" data-id="${esc(p.id)}">Close project</button>` });
  };
  RN.actions['pj-close-go'] = (el) => {
    const p = PJ.get(el.dataset.id);
    const toClose = (p.responses || []).filter((r) => r.status === 'interested' && !r.closeSent).map((r) => r.opId);
    update(p.id, (q) => { q.status = 'closed'; q.closedAt = RN.now().toISOString(); q.responses.forEach((r) => { if (r.status === 'interested' && r.decision !== 'not_a_fit') { r.decision = 'not_selected'; } if (r.status === 'interested') r.closeSent = true; }); });
    toClose.forEach((oid) => { const o = RN.model.byId(oid); if (o) closeMail(p, o, true); });
    RN.ui.closeModal();
    RN.rerender();
    toast(`Project closed.${toClose.length ? ` ${RN.fmt.plural(toClose.length, 'close email')} sent.` : ''}`, { icon: 'info' });
  };

  /* Prototype tool: an invited operator replies (normally done from the Studio inbox) */
  RN.actions['pj-simulate'] = (el) => {
    const p = PJ.get(pidOf(el));
    if (!p) return;
    const id = (p.invited || []).find((x) => !respOf(p, x));
    const op = id && RN.model.byId(id);
    if (!op) return;
    const f = PJ.fields(p);
    const top = op.tags.find((t) => t.tier !== 'claimed') || op.tags[0];
    const ind = op.industries.find((i) => f.industries.includes(i)) || op.industries[0];
    const note = `Interested. I have run ${top ? top.t : 'this work'}${ind ? ` for ${W().label('industries', ind)} companies` : ''} and can start ${op.avail.key === 'available_now' ? 'right away' : op.avail.label.replace(/^Available /, '').toLowerCase()}. Happy to share the 90-day plan I would use.`;
    PJ.respond(p.id, op.id, { status: 'interested', note, rate: op.rate || Math.round(rateIdx(op.catKey).p50), hours: op.avail.hoursCode, simulated: true });
    tabBy[p.id] = 'responses';
    RN.rerender();
    toast(`${esc(op.first)} responded (simulated).`, { icon: 'message' });
  };

  /* Operator response entry point for Studio (studio-b) and the prototype tool. Emails the client once. */
  PJ.respond = function (pid, opId, r) {
    const p = PJ.get(pid);
    const op = RN.model.byId(opId);
    if (!p || !op) return null;
    const first = !respOf(p, opId);
    update(pid, (q) => {
      let x = respOf(q, opId);
      if (!x) { x = { opId }; q.responses.push(x); }
      const declined = r.status === 'declined';
      Object.assign(x, { status: declined ? 'declined' : 'interested', note: r.note || '', reason: declined ? (isReason(r.reason) ? r.reason : r.reason ? 'other' : null) : null, rate: declined ? null : r.rate ? +r.rate : op.rate || null, hours: declined ? '' : r.hours || op.avail.hoursCode || '', ts: RN.now().toISOString() });
      if (r.simulated) x.simulated = true;
      if (!q.invited.includes(opId)) q.inviteMeta[opId] = q.inviteMeta[opId] || { source: 'alert', ts: x.ts };
    });
    if (first) {
      const client = PJ.clientOf(p);
      const q = PJ.get(pid);
      const fit = fitOf(op, q);
      RN.mail(client.email, r.status === 'declined' ? `${op.first} passed on ${p.title}` : `${op.name} responded to ${p.title}`, r.status === 'declined' ? `${op.name} can’t take this one. Your other invites are still open.` : `${fit.label} (${fit.pct}). ${PJ.ALLIN_LABEL}: ${PJ.allIn(respOf(q, opId).rate) ? usd(PJ.allIn(respOf(q, opId).rate)) + '/hr' : 'on request'}.\n“${r.note || ''}”\n\nReview it on your project page.`, 'response');
    }
    return respOf(PJ.get(pid), opId);
  };

  /* =====================================================================
     #blueprints and #blueprint.<id>
     ===================================================================== */
  let bpCat = '';
  RN.inputs['pj-bp-cat'] = (el) => { bpCat = el.value || ''; RN.rerender(); };
  RN.actions['pj-bp-all'] = () => { bpCat = ''; RN.rerender(); };

  function renderBlueprints() {
    const list = BP.filter((b) => !bpCat || b.cat === bpCat);
    return `<section class="wrap phead pj-bph">
      ${crumbs([['Post a project', 'projects'], ['Engagement Blueprints', '']])}
      <span class="eyebrow">Engagement Blueprints</span>
      <h1 class="h1">Start from the problem <span class="serif">you need solved.</span></h1>
      <p class="lede">Ten Blueprints written by the Revenue Nomad team for the engagements clients ask for most. Each one names the problem, the fractional seat that solves it, the typical scope, a 30/60/90-day plan, what it costs on the Rate Index, and the questions to ask in the first call.</p>
    </section>
    <section class="wrap">
      <div class="pj-bp-filter"><span class="label">${esc(RN.fields.roleCategory.label)}</span><div data-deselect>${W().control('roleCategory', bpCat, { name: 'bpCat', change: 'pj-bp-cat' })}</div>
        <p class="small muted">${RN.fmt.plural(list.length, 'Blueprint')}${bpCat ? ` in ${esc(RN.fields.catLabel(bpCat))} · <button type="button" class="act" data-act="pj-bp-all">Show all</button>` : ''}</p></div>
      <div class="grid g-3 pj-bps">${list.map(bpCard).join('')}</div>
      ${bpPriceNote()}
    </section>
    <section class="wrap section-sm">
      <div class="grid g-3 pj-how">
        <div><span class="pj-step4-i">${icon('layers')}</span><h3 class="h4">Built on standard fields</h3><p class="small muted">Engagement type, available time, term and focus areas use the same lists operators fill in, so a Blueprint matches profiles with no translation.</p></div>
        <div><span class="pj-step4-i">${icon('chart')}</span><h3 class="h4">Priced from the Rate Index</h3><p class="small muted">Operator rates are the p25 to p75 hourly rates operators list in each role category. All-in prices add the 25% Revenue Nomad fee. Market figures are illustrative in this prototype.</p></div>
        <div><span class="pj-step4-i">${icon('send')}</span><h3 class="h4">One click to post</h3><p class="small muted">Post this project fills the brief from the Blueprint and your company profile, with the top 3 ranked matches picked to invite. Change anything before you post.</p></div>
      </div>
    </section>`;
  }

  function renderBlueprint(params) {
    const bp = PJ.blueprint(params.id);
    if (!bp) return notFound('That Blueprint does not exist', 'See all Engagement Blueprints', 'blueprints');
    const rev = clientRev();
    const pr = PJ.price(bp, rev);
    const project = pr.project;
    const cat = RN.fields.catLabel(bp.cat);
    const stageName = (((RN.data.framework || {}).stages || []).find((s) => s.id === bp.stage) || {}).name || '';
    const related = BP.filter((b) => b.id !== bp.id && b.cat === bp.cat).concat(BP.filter((b) => b.id !== bp.id && b.cat !== bp.cat)).slice(0, 3);
    const supply = (t) => { let all = 0, ver = 0; RN.model.ops.forEach((o) => { const x = o.tags.find((y) => y.t.toLowerCase() === t.toLowerCase()); if (x) { all++; if (x.tier !== 'claimed') ver++; } }); return { all, ver }; };
    const pos = (v) => RN.clamp(((v - pr.rate.lo * 0.8) / (pr.rate.hi * 1.15 - pr.rate.lo * 0.8)) * 100, 0, 100);
    const facts = [
      [RN.fields.engagementType.label, W().label('engagementType', bp.engagementType)],
      project ? ['Typical size', `About ${bp.projectHours} hours`] : ['Available time needed', W().label('hoursPerMonth', bp.hoursPerMonth)],
      [RN.fields.term.label, W().label('term', bp.term)],
      ['Operator rate', `${usd(pr.rate.lo)} - ${usd(pr.rate.hi)}/hr`, `All-in ${usd(pr.rateAll.lo)} - ${usd(pr.rateAll.hi)}/hr`],
    ];
    // Who offers it: operators who list this Blueprint first, then the best fits who have not packaged it.
    // The fits ranking is editorial, so Revenue Nomad staff are left out of it.
    const offer = RN.model.ops.filter((o) => !o.hidden && (o.offers || []).includes(bp.id));
    const fits = RN.model.rank({ roleCategory: bp.cat, tags: bp.tags }, { limit: 12 }).filter((x) => !isStaff(x.op) && !offer.includes(x.op)).slice(0, 3);
    const me = RN.myOp();
    const mine = !!(me && (me.offers || []).includes(bp.id));
    const staffMeta = (o) => (isStaff(o) ? `<div class="pj-staff-row">${staffPill(o)}</div>` : '');
    const listLink = `<a class="act" href="#framework">${esc(bp.area)}${stageName ? ` × ${esc(stageName)}` : ''}</a>`;
    return `<section class="wrap pj-bpd-top">
      ${crumbs([['Post a project', 'projects'], ['Blueprints', 'blueprints'], [bp.role, '']])}
      <div class="panel-night night pj-bpd-hero" style="--cat:${RN.fields.catColor(bp.cat)}">
        <span class="eyebrow">Engagement Blueprint · ${esc(cat)}</span>
        <h1 class="h1">${esc(bp.problem)}</h1>
        <p class="lede">The seat that fixes it: <span class="serif">${esc(bp.title)}.</span> ${esc(bp.blurb)}</p>
        <dl class="pj-bpd-facts">${facts.map((x) => `<div><dt>${esc(x[0])}</dt><dd>${esc(x[1])}${x[2] ? `<span class="pj-bpd-sub">${esc(x[2])}</span>` : ''}</dd></div>`).join('')}</dl>
        <div class="row pj-bpd-cta"><a class="btn btn-leaf btn-lg" href="#project.new.${esc(bp.id)}">Post this project${icon('arrow')}</a><button type="button" class="btn btn-line btn-lg" data-act="pj-scroll" data-to="pj-top-ops">Operators who offer this</button></div>
      </div>
    </section>
    <section class="wrap pj-bpd">
      <div class="pj-bpd-grid">
        <div class="pj-bpd-main">
          <section class="pj-bpd-sec"><h2 class="h3">Signs you have this problem</h2><ul class="pj-checks">${bp.when.map((w) => `<li>${icon('check')}<span>${esc(w)}</span></li>`).join('')}</ul>
            <p class="small muted pj-bpd-map">${icon('grid')}<span>On the GTM Framework: ${listLink} · ${esc(RN.fields.need ? W().label('need', bp.need) : '')}</span></p></section>
          <section class="pj-bpd-sec"><h2 class="h3">What you get by day 90</h2><p class="pj-bpd-success">${esc(bp.success)}</p></section>
          <section class="pj-bpd-sec"><h2 class="h3">Typical scope</h2>
            <dl class="pj-dl">
              <div><dt>${esc(RN.fields.roleCategory.label)}</dt><dd>${esc(cat)}</dd></div>
              <div><dt>${esc(RN.fields.role.label)}</dt><dd>${esc(bp.role)}</dd></div>
              <div><dt>${esc(RN.fields.engagementType.label)}</dt><dd>${esc(W().label('engagementType', bp.engagementType))}</dd></div>
              ${project ? `<div><dt>Typical size</dt><dd>About ${bp.projectHours} hours over the term</dd></div>` : `<div><dt>Available time needed</dt><dd>${esc(W().label('hoursPerMonth', bp.hoursPerMonth))}</dd></div>`}
              <div><dt>${esc(RN.fields.term.label)}</dt><dd>${esc(W().label('term', bp.term))}</dd></div>
              <div><dt>${esc(RN.fields.startBy.label)}</dt><dd>${esc(W().label('startBy', bp.startBy))}</dd></div>
            </dl>
            <p class="small muted" style="margin-top:12px">${esc(W().opt('engagementType', bp.engagementType).d || '')}</p></section>
          <section class="pj-bpd-sec"><h2 class="h3">The 30/60/90-day plan</h2>
            <ol class="pj-plan">${bp.plan.map((ph, i) => `<li><span class="label">${PLAN_D[i]}</span><h3 class="h4">${esc(ph.t)}</h3><ul>${ph.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></li>`).join('')}</ol></section>
          <section class="pj-bpd-sec"><h2 class="h3">Focus areas to look for</h2>
            <p class="small muted">From the Fit Tag Library. Operators with these verified by a client review rank first when you post.</p>
            <ul class="pj-fas">${bp.tags.map((t) => { const s = supply(t); const info = RN.model.tagInfo(t) || {}; return `<li><span class="ftag claimed" title="${esc(info.d || '')}">${esc(t)}</span><span class="tiny muted">${s.all ? `${s.all} on the network${s.ver ? `, ${s.ver} client-verified` : ''}` : 'New in the library'}</span></li>`; }).join('')}</ul>
            <a class="act" href="#library">Open the Fit Tag Library${icon('arrow')}</a></section>
          <section class="pj-bpd-sec"><h2 class="h3">Outcomes to measure</h2><ul class="pj-list-plain">${bp.outcomes.map((o) => `<li>${icon('target')}<span>${esc(o)}</span></li>`).join('')}</ul></section>
          <section class="pj-bpd-sec"><h2 class="h3">Questions to ask in the first call</h2><ul class="pj-list-plain pj-qs">${bp.questions.map((q) => `<li>${icon('message')}<span>${esc(q)}</span></li>`).join('')}</ul></section>
        </div>
        <aside class="pj-bpd-side">
          <div class="card pj-rate">
            <div class="pj-rate-hd"><span class="label">Operator rate · Rate Index</span>${RN.ui.illus()}</div>
            <div class="pj-range" role="img" aria-label="${esc(`Operator rate p25 ${usd(pr.rate.lo)}, median ${usd(pr.rate.mid)}, p75 ${usd(pr.rate.hi)} per hour`)}"><i class="pj-range-band" style="left:${pos(pr.rate.lo).toFixed(1)}%;right:${(100 - pos(pr.rate.hi)).toFixed(1)}%"></i><i class="pj-range-mid" style="left:${pos(pr.rate.mid).toFixed(1)}%"></i></div>
            <div class="pj-range-l"><span>${usd(pr.rate.lo)}</span><b>${usd(pr.rate.mid)}/hr median</b><span>${usd(pr.rate.hi)}</span></div>
            <p class="tiny muted">Operators’ own hourly rates in ${esc(cat)}${rev ? ` for ${esc(W().label('companyRevenue', rev))} revenue companies` : ''}, p25 to p75, from ${pr.n} profiles.</p>
            <p class="small pj-allin-note">Operator rate. All-in with the 25% platform fee: <b class="num">${usd(pr.rateAll.lo)} - ${usd(pr.rateAll.hi)}/hr</b></p>
            <hr>
            <span class="label">${project ? 'Typical project' : 'Typical month'} · operator rate</span>
            <p class="pj-spend num">${esc(pr.total.label)}</p>
            <p class="small pj-allin-note">All-in with the 25% platform fee: <b class="num">${esc(pr.totalAll.label)}</b></p>
            <p class="tiny muted">${project ? `About ${pr.h} hours` : `At ${esc(W().label('hoursPerMonth', bp.hoursPerMonth))}`}, rounded to $500.</p>
            <a class="btn btn-line btn-block" href="#project.new.${esc(bp.id)}" style="margin-top:14px">Post this project</a>
            <a class="act" href="#rates" style="margin-top:8px">See the Rate Index${icon('arrow')}</a>
          </div>
        </aside>
      </div>
    </section>
    <section class="wrap section-sm pj-offer" id="pj-top-ops">
      <div class="row between pj-sec-hd"><div><span class="eyebrow">Operators who offer this</span><h2 class="h3" style="margin-top:6px">Who runs this engagement</h2></div><a class="act" href="#browse.${esc(bp.cat)}">Browse all ${esc(cat)}${icon('arrow')}</a></div>
      <div class="pj-offer-grp">
        <div class="pj-offer-hd"><h3 class="h4">Offer this Blueprint</h3><span class="pill">${offer.length}</span></div>
        <p class="small muted">They list it on their profile as a packaged engagement.</p>
        ${offer.length ? `<div class="grid g-3">${offer.map((o) => RN.ui.opCard(o, { meta: staffMeta(o) })).join('')}</div>` : '<p class="small muted pj-offer-none">No operator lists this Blueprint yet.</p>'}
        ${me ? `<div class="pj-offer-me">${mine ? `<span class="small">${icon('check-circle')}You offer this Blueprint. Clients see you in this list.</span><button type="button" class="act" data-act="pj-offer" data-id="${esc(bp.id)}">Remove it</button>`
          : `<span class="small">Do you run this engagement? Offer it as a packaged engagement and clients see you here.</span><button type="button" class="btn btn-line btn-sm" data-act="pj-offer" data-id="${esc(bp.id)}">I offer this Blueprint</button>`}</div>` : ''}
      </div>
      <div class="pj-offer-grp">
        <div class="pj-offer-hd"><h3 class="h4">Strong fits</h3><span class="pill">${fits.length}</span></div>
        <p class="small muted">Ranked on the focus areas above. They have not packaged this Blueprint. Revenue Nomad staff are not ranked here.</p>
        <div class="grid g-3">${fits.map((x) => RN.ui.opCard(x.op, { why: x.fit.signals[0] ? x.fit.signals[0].text : '' })).join('') || RN.ui.empty({ icon: 'users', title: 'No operators in this category yet', body: 'Post the project and our team will source candidates.', cta: '' })}</div>
      </div>
    </section>
    <section class="wrap section-sm">
      <div class="row between pj-sec-hd"><h2 class="h3">Related Blueprints</h2><a class="act" href="#blueprints">All Blueprints${icon('arrow')}</a></div>
      <div class="grid g-3 pj-bps">${related.map(bpCard).join('')}</div>
      ${bpPriceNote()}
    </section>`;
  }
  /* An operator lists (or removes) a Blueprint as a packaged engagement: Studio edits, same store as the Profile tab */
  RN.actions['pj-offer'] = (el) => {
    const me = RN.myOp();
    if (!me) return;
    const id = el.dataset.id;
    const on = (me.offers || []).includes(id);
    RN.store.update((s) => { s.edits = s.edits || {}; const e = (s.edits[me.id] = s.edits[me.id] || {}); const cur = (e.offers || me.offers || []).slice(); e.offers = on ? cur.filter((x) => x !== id) : cur.concat(id); }, 'edits');
    RN.model.applyEdits();
    RN.track('studio_action', { action: on ? 'offer_remove' : 'offer_add', opId: me.id, blueprint: id });
    RN.rerender();
    toast(on ? 'Removed from your offers.' : 'Added. Clients see you under Offer this Blueprint.');
  };
  RN.actions['pj-scroll'] = (el) => { const t = document.getElementById(el.dataset.to); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  /* =====================================================================
     Views
     ===================================================================== */
  RN.view('projects', { route: 'projects', nav: 'projects', title: () => (S().persona === 'buyer' ? 'Projects' : 'Post a project'), render: renderProjects });
  RN.view('project-new', { route: 'project.new', nav: 'projects', footer: false, title: () => 'Post a project', render: () => renderNew({}), mount: (root) => mountNew(root) });
  const newTitle = (p) => { const d = PJ.get(p.from); return d && d.status !== 'draft' ? 'Edit brief' : 'Post a project'; };
  RN.view('project-new-from', {
    route: 'project.new.:from', nav: 'projects', footer: false, samples: { from: 'vp-sales', extra: ['project.new.proj-seed-2'] },
    title: newTitle, render: (p) => renderNew(p), mount: (root) => mountNew(root),
  });
  RN.view('project-new-step', {
    route: 'project.new.:from.:step', nav: 'projects', footer: false, samples: { from: 'proj-seed-2', step: '2', extra: ['project.new.proj-seed-2.3'] },
    title: newTitle, render: (p) => renderNew(p), mount: (root) => mountNew(root),
  });
  RN.view('project', {
    route: 'project.:id', nav: 'projects', samples: { id: 'proj-seed-1', extra: ['project.proj-seed-2'] },
    title: (p) => { const x = PJ.get(p.id); return x ? x.title || 'Project' : 'Project'; },
    render: renderProject,
  });
  RN.view('blueprints', { route: 'blueprints', nav: 'projects', title: () => 'Engagement Blueprints', render: renderBlueprints });
  RN.view('blueprint', {
    route: 'blueprint.:id', nav: 'projects', samples: { id: 'vp-sales', extra: ['blueprint.ai-gtm-architect', 'blueprint.account-executive'] },
    title: (p) => { const b = PJ.blueprint(p.id); return b ? `${b.title} Blueprint` : 'Blueprint'; },
    render: renderBlueprint,
  });
})();
