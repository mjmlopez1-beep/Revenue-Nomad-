/* Function homes (#hire-fractional-sales-vp, #fractional-revops, #fractional-marketing-leadership) and the cost hub
   (#fractional-cost), built from the Site pages copy (Matt Lopez, Oct 10, 2026) in the eight-section function-page
   template: hero, who would I get, what it costs, what happens first, companies like yours, how we vet, FAQ,
   form block. Prefix fn- for classes and actions.
   Copy is transcribed as written. A [GAP: what, owner] in the document renders as a pending chip (RN.fn.gap) and is
   never filled with a guess. Pricing (founder, Oct 11, 2026): there is no platform fee for companies, and hiring the
   operator full time carries a conversion fee of 20% of annual salary (the copy said 15 to 20%). Operator fees are
   explained only on operator pages.
   Every section has a visual drawn only from the page's own copy, RN.costs and RN.model: the monthly cost card and
   operator faces in the hero (the cost hub a monthly mix by function), rates as range bars on one scale, the 90 days
   as a Gantt, a small picture per story (marketing's first story carries its weighted scorecard) and per price driver,
   CORE as a night panel.
   Copy that is only a pending chip (a table row, a story part, a lead-in sentence) is marked data-proto, so reviewer
   mode shows it and the default view reads cleanly.
   Talk to us is the four-question flow on #talk (need, company size, start date, where to reply; the founder kept it,
   Oct 11, 2026). The hero button and the form block open it with this page's need already picked (#talk.<need>).
   Design pass (Oct 14, 2026; owner decisions on the design audit):
   - Talk to us stays the primary path here (inbound leads; larger companies prefer it): one filled Talk to us in the
     hero and one in the closing form block, nothing in between. Request intro appears only on operator cards.
   - Answer first: every hero opens with one answer sentence and the price from RN.costs (the canonical record), so the
     figures match the guides, rates, home and the report. The right column is the real monthly cost card; a row of up
     to five operator faces sits under the button (photos first, initials last, the founder never first); the nine
     cleared client logos close the hero.
   - Numbers live in tiles, tables and charts, not paragraphs: the cost terms are a 4-row list, the vetting policy is
     2 tiles. Charts are one hue (forest for the seat the page quotes, --viz-muted for the rest), no category colours.
   - Motion: charts draw once via RN.motion.draw the first time they scroll into view; nothing in the hero moves.
   - The cost hub links out: Rate Index and cost guide under each function, and three related guides.
   Shared with other views:
     RN.fn.logoStrip({ label, network, pending, scale, bare, className })
                                                       the nine cleared client logos as one row (files for three, wordmarks for six);
                                                       network adds the 350+ figure, pending the Goldenbird chip, scale resizes the
                                                       marks (1 = 20px cap height), bare drops the top rule and margin,
                                                       eager loads the image marks at once (the strip under a hero)
     RN.fn.gap(what, owner)                            the pending chip
     RN.fn.LOGOS                                       the cleared list: [key, name, imageKey, height]
     RN.fn.pages                                       the page copy, keyed sales | revops | marketing | cost */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const FN = (RN.fn = RN.fn || {});
  const PG = RN.pages;

  // Talk to us with this page's need already picked (the cost hub starts at the first question)
  const talkTo = (d) => (d.need ? 'talk.' + d.need : 'talk');
  const NET = () => String((RN.data.market && RN.data.market.network && RN.data.market.network.operators) || '350+');
  const NO_FEES_L = 'Platform fee for companies. You pay the operator’s rate.';

  /* ---------- The canonical cost record (RN.costs) ----------
     Every price this page states in a sentence, a stat or the hero card comes from here, so it matches every other
     page. A money range inside a sentence keeps no-break spaces ("$4k - $10k" never wraps). */
  const C = (key) => (RN.costs && RN.costs.get(key)) || null;
  const kk = (n) => RN.fmt.k(n);
  const nb = (s) => String(s).replace(/(\$[\d.,]+[kKM]?) - (\$)/g, '$1 - $2');
  const rng = (r) => (r ? (r.lo === r.hi ? kk(r.lo) : `${kk(r.lo)} - ${kk(r.hi)}`) : '');
  // The seat each function page quotes (VP of Sales, RevOps follow-on execution, fractional CMO)
  const leadOf = (d) => (d.cat && RN.costs ? RN.costs.forCat(d.cat) : C('hub'));
  const hoursOf = (r) => (r && r.hours ? `${r.hours.lo} to ${r.hours.hi}` : '');
  /* One answer sentence per page (about 20 words), from the record */
  const ANSWER = {
    sales: (r) => `A VP of Sales who has built sales at your stage, ${hoursOf(r)} hours a month for ${rng(r.monthly)} in our 2026 engagements.`,
    revops: (r) => `A revenue architect who turns your bookings goal into pipeline math, ${hoursOf(r)} hours a month for ${rng(r.monthly)} in our 2026 engagements.`,
    marketing: (r) => `A demand gen operator or fractional CMO, ${hoursOf(r)} hours a month, quoted at ${rng(r.monthly)} in our 2026 searches.`,
    cost: () => RN.costs.answer('hub'),
  };
  const answerOf = (d) => nb((ANSWER[d.fn] || ANSWER.cost)(leadOf(d)));
  // A hyphen is a line-break chance even between no-break spaces, so an escaped range is held together in a span
  const nw = (html) => String(html).replace(/(\$[\d.,]+[kKM]?)\u00a0-\u00a0(\$[\d.,]+[kKM]?(?:\/month|\/hr)?)/g, '<span class="fn-nw">$1\u00a0-\u00a0$2</span>');
  /* The stat strip under the hero: the price first (it replaces the network count), then the page's own figures */
  const STATS = {
    sales: (r) => [[rng(r.monthly), 'A month for a VP of Sales in our 2026 engagements'], ['2 to 3', 'Vetted operators within 48 hours'], [hoursOf(r), 'Hours a month for the seat'], ['$0', NO_FEES_L]],
    revops: (r) => [[rng(r.monthly), 'A month for follow-on RevOps execution in our 2026 engagements'], ['2 to 3', 'Vetted operators within 48 hours'], ['2 to 2.5', 'Days a week for an embedded senior operator'], ['$0', NO_FEES_L]],
    marketing: (r) => [[rng(r.monthly), 'A month quoted for a fractional CMO in our 2026 searches'], ['Up to 7', 'Scored profiles within 48 hours'], [hoursOf(r), 'Hours a month for a fractional CMO'], ['$0', NO_FEES_L]],
    cost: () => [[kk(C('vp-sales').monthly.lo) + '/month', 'Where a director-level sales retainer starts'], [kk(C('revops-assessment').fixed.lo), 'Where a RevOps assessment starts, as a fixed fee'], ['$0', NO_FEES_L]],
  };
  const statsOf = (d) => (STATS[d.fn] || STATS.cost)(leadOf(d));
  /* Short seat names for the hero cost card come from the cost record (RN.costs seat .shortLabel) */
  /* The rows the page quotes are drawn in forest; every other bar is --viz-muted (one hue, no category colours) */
  const LEAD_ROWS = ['Director or VP of Sales, teams under 5 to 8 reps', 'Follow-on execution', 'Fractional CMO, PE-backed platform'];
  /* Where each function's benchmark and cost guide live (the cost hub links them under each function) */
  const FN_LINKS = {
    sales_leadership: { rates: 'rates.sales_leadership', guide: 'fractional-vp-of-sales-cost' },
    revenue_operations: { rates: 'rates.revenue_operations', guide: 'fractional-revops-cost' },
    marketing: { rates: 'rates.marketing', guide: 'fractional-cmo-cost' },
  };
  const guideOf = (slug) => (RN.research && RN.research.guideFor ? RN.research.guideFor(slug) : null);

  /* ---------- Pending chip: what is still missing and who owns it ---------- */
  function gapRaw(what, owner) {
    return `<span class="fn-gap" title="Owner: ${owner}">${icon('clock')}<span>Pending · ${what} (${owner})</span></span>`;
  }
  FN.gap = (what, owner) => gapRaw(esc(what), esc(owner || 'Matt'));

  /* Body copy: typographic quotes, escaped, then the inline tokens
       [[gap:what|Owner]]   pending chip
       [[link:route|text]]  a link to a route
       [[url:https://…|text]]  an outside source, opened in a new tab
       **text**             a bold lead-in
       [[net]]              the network size from RN.data.market
     Shared with the guides (RN.fn.rich), which render the answer posts with the same tokens. */
  // Tokens are cut out first, so typographic quotes never touch a route or URL; text and labels get quotes and escaping
  const txt = (s) => esc(RN.fmt.smart(s)).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  function rich(t) {
    const parts = String(t == null ? '' : t).split(/(\[\[[^\]]*\]\][,.;!?)]*)/);
    return parts.map((p, i) => {
      if (!(i % 2)) return txt(p);
      const m = p.match(/^\[\[([a-z]+):?([^\]]*)\]\]([,.;!?)]*)$/);
      if (!m) return txt(p);
      const [, kind, body, punct] = m;
      const bar = body.indexOf('|');
      const a = bar < 0 ? body : body.slice(0, bar), b = bar < 0 ? '' : body.slice(bar + 1);
      let html;
      if (kind === 'gap' && b) html = gapRaw(txt(a.trim()), esc(b.trim()));
      else if (kind === 'link' && b) html = `<a class="link" href="#${esc(a.trim())}">${txt(b)}</a>`;
      else if (kind === 'url' && b && /^https:\/\/\S+$/.test(a.trim())) html = `<a class="link" href="${esc(a.trim())}" target="_blank" rel="noopener">${txt(b)}</a>`;
      else if (kind === 'net' && !body) html = esc(NET());
      else { console.warn('Unknown token', p); return txt(p.replace(/\[\[|\]\]/g, '')); }
      // Punctuation right after a chip stays on its line (a phone would otherwise wrap ", 19 meetings" onto the next line)
      if (!punct) return html;
      return kind === 'gap' ? `<span class="fn-gap-w">${html}${esc(punct)}</span>` : html + esc(punct);
    }).join('');
  }
  FN.rich = rich;

  /* ---------- The cleared client logos ----------
     Only these nine may appear (content playbook, Oct 10, 2026). Ferry, Skaled and BuildingLink render from their
     files; the other six are wordmarks in the display face (Trialbee's file is a stacked mark whose name is unreadable at strip height, so it is a
     wordmark too). Heights are set by eye so each mark reads at the same cap height. Every image is flattened
     to one ink by a filter (--fn-logo-filter in function.css), which also keeps the light-grey Skaled file visible
     on paper and turns every mark white on .night and in the dark theme. */
  FN.LOGOS = [
    ['ferry', 'Ferry', 'ferryWordmark', 21],
    ['workforce', 'Workforce Software', null, 0],
    ['skaled', 'Skaled', 'skaled', 13],
    ['claruscare', 'ClarusCare', null, 0],
    ['buildinglink', 'BuildingLink', 'buildinglink', 19],
    ['trialbee', 'Trialbee', null, 0],
    ['csi', 'CSI Pharmacy', null, 0],
    ['angellist', 'AngelList', null, 0],
    ['lockthreat', 'LockThreat', null, 0],
  ];
  FN.logoStrip = function (o) {
    o = o || {};
    const L = RN.data.logos || {};
    const items = FN.LOGOS.map(([key, name, img, h]) => {
      const src = img && typeof L[img] === 'string' ? L[img] : '';
      const px = Math.round((h || 20) * (o.scale || 1));
      return `<li>${src ? `<img src="${src}" alt="${esc(name)}" style="--h:${px}px" loading="${o.eager ? 'eager' : 'lazy'}">` : `<span class="fn-wm">${esc(name)}</span>`}</li>`;
    }).join('');
    return `<div class="fn-logos${o.bare ? ' fn-logos-bare' : ''}${o.className ? ' ' + esc(o.className) : ''}">
      <div class="fn-logos-l"><span class="label">${esc(o.label || 'Trusted by teams at')}</span>${o.pending ? FN.gap('logo files', 'Goldenbird') : ''}</div>
      <ul aria-label="Client logos">${items}${o.network ? `<li class="fn-logos-net"><b>${esc(NET())}</b><span>operators</span></li>` : ''}</ul>
    </div>`;
  };

  /* ---------- Page copy, section by section, from the Site pages document ---------- */
  const SALES = {
    fn: 'sales', name: 'hire-fractional-sales-vp', title: 'Hire a Fractional VP of Sales or CRO',
    eyebrow: 'Sales leadership', cat: 'sales_leadership', browse: 'browse.sales_leadership', need: 'sales_motion',
    hero: {
      h: 'Fractional sales leadership for founders who are <span class="serif">still the sales team</span>',
    },
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
      // The two paragraphs that sat under the table are a 4-row terms list (initial term, notice, assessment, platform
      // fee). Billing and the 20-hour client who missed target live on the cost hub, linked from here.
      terms: () => [['Initial term', '3 to 4 months', 'Then month-to-month'], ['Notice', '30 days', 'Once the initial term ends'],
        ['Assessment', kk(C('sales-assessment').fixed.lo), 'A 45-day fixed fee larger seats can start with'], ['Platform fee', '$0', 'You pay the operator’s rate']],
      note: 'Market rates[[gap:2027 survey figure|Survey]].',
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
      [{ title: 'Physical therapy marketing agency, ~$9M revenue' }, ['Problem', 'Close rate fell from 30 to 40% into the teens. 2 to 4 new clients a month against a goal of 10+. The founder-CEO wants to reach $15M.'],
        ['What the operator does', 'A fractional VP of Sales sits above the existing director as strategist and process builder, 40 hours a month for 3 months.'],
        ['Starting point', 'Close rate in the teens. Started Sep 2026[[gap:90-day result|Matt]]']],
      [{ title: 'Founder-led healthcare services company' }, ['Problem', '8 commission-only reps, about half not performing, no repeatable process.'],
        ['What the operator does', 'A 90-day build at 20 hours a month for $4,000. Assess reps, document the process, write scripts, train, audit the CRM, make personnel calls.'],
        ['Starting point', '8 reps, about 4 performing. Started Sep 2026[[gap:90-day result|Matt]]']],
      [{ title: 'Ferry, hospitality tip management platform' }, ['What happened', 'A Revenue Nomad operator served as fractional GTM strategy leader from Feb 2025, signed for 4 months and retained about 18.'],
        ['Result', 'First 20 inbound leads, 2 deals that doubled the client base, first AE hired and closing within 60 days.[[gap:Ferry revenue band|Matt]][[gap:client quote with sign-off|Matt]]']],
    ],
    // One small picture per story, drawn only from figures in that story's own copy
    viz: [
      { k: 'bars', l: 'New clients a month', rows: [['Now', 2, 4, '2 to 4'], ['Goal', 10, 10, '10+']] },
      { k: 'people', n: 8, on: 4, l: '8 reps, about 4 performing' },
      { k: 'bars', l: 'Months with Ferry', rows: [['Signed for', 4, 4, '4'], ['Retained', 18, 18, 'About 18']] },
    ],
    vet: {
      lead: 'Every sales leader is scored on CORE.',
      core: ['They tell you what is happening before you ask.', 'They treat the number as theirs.', 'Measured by revenue and conversion.', 'Deep experience at your stage and in your kind of sale.'],
      // The seniority paragraph as two tiles: the figure, then the point it makes
      tiles: [['5-rep team', 'A tactical director often beats a strategic VP. We match seniority to the team.'],
        ['50+', 'Data points tracked on each operator. A great CRO from a $500M company will likely struggle at a $30M one.']],
    },
    faq: [
      ['When does a fractional VP of Sales make sense?', 'When the founder or CEO still runs sales and the revenue system is broken. The trigger is usually overload, not an empty seat.'],
      ['How does cost compare with a full-time VP of Sales?', 'Average total VP of Sales comp is about $334K, with average tenure about 19 months (Glassdoor 2026 via Stealth Agents, a secondary source). Skaled says replacing a sales leader can cost up to 1.5x salary. A fractional director for a small team ran $4,000 to $10,000 a month in our 2026 engagements.'],
      ['Will the operator clash with my current sales leader?', 'We set reporting lines before we source. In one engagement the fractional VP sits above an existing director as coach.'],
      ['What if the fit is wrong?', 'You can swap the operator.'],
      ['Can I hire the operator full time later?', 'Yes. The conversion fee is 20% of annual salary.'],
    ],
    form: {
      h: 'Tell us about your sales team',
      lede: 'Answer a few questions and get a role profile plus 2 to 3 vetted operators, often within 48 hours.',
    },
  };

  const REVOPS = {
    fn: 'revops', name: 'fractional-revops', title: 'Fractional RevOps Leaders for B2B SaaS',
    eyebrow: 'RevOps', cat: 'revenue_operations', browse: 'browse.revenue_operations', need: 'systems',
    hero: {
      h: 'Fractional RevOps for $25M to $100M SaaS teams that cannot <span class="serif">explain their own pipeline</span>',
    },
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
      terms: () => [['Initial term', '3 to 4 months', 'Retainers, then month-to-month'], ['Notice', '30 days', 'Once the initial term ends'],
        ['Assessment', rng(C('revops-assessment').fixed), 'Fixed fee, about 40 hours over 60 days'], ['Platform fee', '$0', 'You pay the operator’s rate']],
      note: 'Market rates[[gap:2027 survey figure|Survey]].',
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
      [{ title: 'Enterprise billing software company' }, ['Problem', 'Pipeline flat, meeting conversion the lowest the CEO had seen, "no decision" the leading loss reason. Nobody could show the bridge from bookings goal to pipeline.'],
        ['What the operator does', 'A fractional lead revenue architect reporting to the CFO, about 2.5 days a week at $27,000 a month, chosen over a full-time hire and a $230K consultancy assessment.'],
        ['Starting point', 'Forecast needing 3 to 4 deals of about $1M each. Starts Oct 19 2026[[gap:day-90 result|Matt]]']],
      [{ title: 'Transactional SaaS company, 50 to 100 sellers' }, ['What the operator does', 'A 60-day fixed-fee reporting assessment, about 40 hours, delivering a scorecard, specs and a roadmap internal CRM admins can run.'],
        ['Starting point', '[[gap:revenue band and measured starting point|Matt]]']],
      [{ title: 'Workforce Software' }, [null, 'At about $400M ARR, the President brought in fractional help to stand up a RevOps function from zero. Fractional works well past early stage.[[gap:what was built and a result|Matt]][[gap:client quote with sign-off|Matt]]']],
    ],
    viz: [
      { k: 'deals', n: 4, on: 3, v: '$1M', l: 'Forecast needing 3 to 4 deals of about $1M each' },
      { k: 'big', v: '60', u: 'days', l: 'Fixed-fee reporting assessment, about 40 hours' },
      { k: 'big', v: '$400M', u: 'ARR', l: 'Fractional help to stand up a RevOps function from zero' },
    ],
    vet: {
      lead: 'Every RevOps operator is scored on CORE.',
      core: ['They surface the bad number early and plainly.', 'They own the forecast as well as the dashboard.', 'Judged on the decisions that change because of their work.', 'Deep in your CRM, your sales motion and your deal size.'],
      tiles: [['3 jobs', 'CRM admin, revenue leadership and pipeline specialist work are three different jobs.'],
        ['1 retainer', 'Works only if one person can truly cover the combined scope. We tell you when it cannot.']],
    },
    faq: [
      ['Do I need an assessment first?', 'If you already know the problem, go straight to an embedded operator. If you need a ranked list your team can run, the $6,000 to $7,500 assessment is the faster start.'],
      ['Who should the operator report to?', 'Whoever owns the number and the budget. In our enterprise billing engagement that is the CFO.'],
      ['Will they replace my RevOps admin?', 'No. The operator sets the system and the priorities. Your admins keep building against a roadmap.'],
      ['What if the fit is wrong?', 'You can swap the operator.'],
      ['Can we hire them full time?', 'Yes, with a conversion fee of 20% of annual salary.'],
    ],
    form: {
      h: 'Tell us where your revenue system breaks',
      lede: 'Share the problem in your words and get a scope plus 2 to 3 vetted RevOps operators.',
    },
  };

  const MARKETING = {
    fn: 'marketing', name: 'fractional-marketing-leadership', title: 'Fractional CMO and Marketing Leaders',
    eyebrow: 'Marketing leadership', cat: 'marketing', browse: 'browse.marketing', need: 'pipeline',
    hero: {
      h: 'Fractional marketing leaders who bring lead costs down and <span class="serif">hold your agencies to a number</span>',
    },
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
      terms: () => [['Initial term', '3 to 4 months', 'Then month-to-month'], ['Notice', '30 days', 'Once the initial term ends'],
        ['Billing', 'Monthly', 'Upfront for a set block of hours, overages flagged first'], ['Platform fee', '$0', 'You pay the operator’s rate']],
      note: 'Market rates[[gap:2027 survey figure|Survey]].',
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
      [{ title: 'PE-backed home services platform, two brands' }, ['Problem', 'Lead cost and quality getting worse, heavy reliance on lead aggregators, loosely managed agencies, underused marketing data.'],
        ['What we did', 'Scored 7 candidates for a 40 to 80 hour a month fractional CMO seat on a weighted 7-factor scorecard.'],
        { table: [['Demand gen operator vs brand CMO', 25], ['Analytical rigor on CPL, attribution and CAC', 20], ['Agency and aggregator accountability', 15], ['Funnel fluency in the vertical', 15], ['Opinionated enough to manage brand marketers', 10], ['Sales enablement straddle, including call center', 10], ['Channel diversification instinct', 5]] },
        ['Disqualified', 'Brand-heavy CMOs, mismatched funnel backgrounds, anyone carrying 3+ engagements, and any self-reported background the public record contradicts.'],
        ['Where it stands', 'The client changed strategy before hiring.[[gap:revenue band|Matt]]']],
      [{ title: 'PE-backed public-sector software company repositioning after acquisitions' }, ['Problem', 'Fragmented products needed one narrative before a sales kickoff.'],
        ['What we did', 'Scoped a 60 to 80 hour a month seat, candidates at $220 to $400 an hour. Brand strategy and sales enablement turned out to be different jobs, and the person who asks is not always the person who decides.'],
        ['Where it stands', '[[gap:revenue band and current status cleared for publishing|Matt]]']],
    ],
    // The hero carries the cost card, so the weighted scorecard (the first story's own table) is that story's picture
    viz: [
      { k: 'score' },
      { k: 'big', v: '$220 - $400/hr', u: '', l: 'Candidates for a 60 to 80 hour a month seat' },
    ],
    vet: {
      lead: 'Every marketing operator is scored on CORE.',
      core: ['They report cost per lead and pipeline weekly without being asked.', 'They hold agencies to a cost and pipeline number.', 'Judged on lead cost, lead quality and pipeline.', 'They know your funnel, your channels and your vertical.'],
      paras: ['We place only dedicated fractional operators. Anyone holding a full-time job is excluded.'],
    },
    faq: [
      ['Do I need a fractional CMO or a demand gen operator?', 'If leads cost too much and agencies run unchecked, start with a demand gen operator with analytical rigor. Brand-heavy CMOs were a disqualifier in our home services search for that reason.'],
      ['Will they manage my agencies?', 'Yes, if it is in scope. Agency and aggregator accountability carries 15% of our scorecard weight.'],
      ['Can they also support sales?', 'Some can. Sales enablement, including call centers, is a scored factor. Tell us whether you need brand strategy, enablement or both.'],
      ['What if the fit is wrong?', 'You can swap the operator.'],
      ['Can we hire them full time?', 'Yes, with a conversion fee of 20% of annual salary.'],
    ],
    form: {
      h: 'Tell us what your marketing is costing you',
      lede: 'Describe the problem and get a scorecard plus vetted marketing operators to meet.',
    },
  };

  const COST = {
    fn: 'cost', name: 'fractional-cost', title: 'What Fractional GTM Leaders Cost in 2026',
    eyebrow: 'Cost', browse: 'browse', need: '',
    hero: {
      h: 'What fractional sales, RevOps and marketing leaders <span class="serif">cost in 2026</span>',
    },
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
    moves: {
      // Each card's sentence names the driver; its picture carries the figures (ratio audit: no number twice)
      items: [
        '**Seniority.** An embedded CRO at a large company costs several times a director for a small team.',
        '**Hours.** Price follows the hour block. A light month and a heavy month are different jobs.',
        '**Funding.** Venture-backed companies accepted higher rates. Bootstrapped peers at the same size paid less.',
        '**Scope mix.** CRM admin, revenue leadership and pipeline specialist work are three jobs. Asking one person to cover all three raises the rate or breaks the engagement.',
        '**Team size.** One founder-led client got quotes that were too much for their team. A smaller block fit.',
      ],
      closing: 'One client bought 20 hours a month for $3,000 and missed target every month. Match hours to the job.',
      // One small picture per driver, from the figures in its own sentence
      viz: [
        { k: 'bars', rows: [['Director, 5-rep team', 4000, 4000, '$4k'], ['CRO, $55M company', 23200, 23200, '$23.2k']], u: 'A month' },
        { k: 'bars', rows: [['20 hours', 20, 20, '20'], ['50 hours', 50, 50, '50']], u: 'Hours a month' },
        { k: 'big', v: 'About $300/hr', u: '', l: 'Venture-backed, around $5M ARR' },
        { k: 'jobs', rows: ['CRM admin', 'Revenue leadership', 'Pipeline specialist'] },
        { k: 'bars', rows: [['Quoted', 6000, 12000, '$6k - $12k'], ['Fit, 20 hours', 4000, 4000, '$4k']], u: 'A month' },
      ],
    },
    models: {
      cols: ['Model', 'How it works', 'When it fits', 'Example from 2026'],
      rows: [
        ['Monthly retainer', 'Set hours a month, billed upfront', 'You know the seat and the scope', 'Director of sales, 20 hours, $4,000 a month'],
        ['Fixed project', 'Defined deliverable, fixed fee', 'One problem with a clear end', '30-day RevOps project, about $7,000 to $8,000'],
        ['Assessment then retainer', 'Fixed-fee diagnosis, then the operator executes', 'You need a diagnosis before you commit', '45-day assessment at $27,500, then a CRO at $23,200 a month'],
      ],
    },
    total: {
      cols: ['Seat', 'Full-time', 'Fractional, from our 2026 engagements'], blankFirst: true,
      rows: [
        ['VP of Sales', 'About $334K average total comp a year, average tenure about 19 months (secondary)', '$48,000 to $120,000 a year for a director or VP at 20 to 40 hours a month'],
        ['CRO, ~$55M company', 'Client benchmarked up to about $800K all in', '$27,500 assessment plus 12 months at $23,200, about $306,000'],
        ['RevOps assessment, enterprise SaaS', 'Large consultancy quoted about $230K for 6 weeks', '$27,000 a month for a senior architect at about 2.5 days a week'],
        ['Replacing a sales leader', 'Up to 1.5x salary, with 3+ months of ramp', 'Swap the operator, then 30 days notice after the initial term'],
      ],
      // Yearly figures from the two rows that state both sides in dollars: [full-time lo, hi], [fractional lo, hi]
      viz: [[[334000, 334000], [48000, 120000]], [[800000, 800000], [306000, 306000]], null, null],
      after: [
        'The most common mismatch we see is expecting full-time availability at a fractional rate. Fix it upfront with a set hour block and a weekly cadence.',
        'Our 2027 survey comparison of fractional and full-time cost[[gap:2027 survey figure|Survey]].',
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
        ['Full-time conversion', '20% of annual salary'],
        ['Platform fee', 'None. Companies use Revenue Nomad free and pay the operator’s rate.'],
      ],
    },
    faq: [
      ['Why do your ranges differ from other published averages?', 'Ours come from 2026 Revenue Nomad engagements in GTM leadership seats only. Broader averages include tactical and non-GTM work.'],
      ['Is hourly or monthly better?', 'Monthly. A fixed block with a weekly cadence sets clear expectations on both sides.'],
      ['What happens if we go over hours?', 'The operator flags it before it happens. You decide whether to extend.'],
    ],
    // Read next: one guide per function, each answering the question this page leaves open
    reading: ['interim-vs-fractional-vs-full-time-sales-leader', 'fractional-revops-consultant', 'fractional-cmo-vs-agency'],
    form: {
      h: 'Get a budget for your seat',
      lede: 'Tell us the seat and the problem and we will price the hours it needs.',
    },
  };
  FN.pages = { sales: SALES, revops: REVOPS, marketing: MARKETING, cost: COST };

  /* ---------- Money in tables, cards and chart labels (founder, Oct 12, 2026) ----------
     Ranges read "$2.2k - $3.4k/month" and "$220 - $340/hr", single values "$7.5k/month" and "$300/hr". Prose from the
     Site pages document keeps its wording; only figures rendered as a cell, card or label go through cellMoney. The
     charts parse the copy's own figures before this runs. */
  const kNum = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return n >= 1000 ? RN.fmt.k(n) : '$' + v; };
  const cellMoney = (t) => String(t == null ? '' : t)
    .replace(/\$(\d{1,3}(?:,\d{3})+)/g, (m, v) => kNum(v))
    .replace(/(\$[\d.]+k?)\s+to\s+(?=\$)/g, '$1\u00a7')
    .replace(/(\$[\d.]+k?)\s+a month\b/g, '$1/month')
    .replace(/(\$[\d.]+k?)\s+an hour\b/g, '$1/hr')
    .replace(/(\$[\d.]+k?)\s+a year\b/g, '$1/year');
  // The range hyphen is held as a placeholder through rich(), whose typography would turn " - " into a dash
  const M = (t) => rich(cellMoney(t)).replace(/\u00a7/g, ' - ');

  /* ---------- Pieces ---------- */
  /* Sections alternate paper and paper-2, so each is a band with --band-y inside (80px, 56px on a phone) */
  const sec = (key, alt, inner, cls, id) => `<section class="section fn-sec fn-${key}${alt ? ' fn-alt' : ''}${cls ? ' ' + cls : ''}"${id ? ` id="${esc(id)}"` : ''}><div class="wrap">${inner}</div></section>`;
  // A jump to a section on this page (a plain #id would be read as a route by the hash router)
  const jump = (id, label) => `<a class="act" href="#${esc(id)}" data-act="fn-jump">${esc(label)}${icon('arrow')}</a>`;
  RN.actions['fn-jump'] = (el) => {
    const t = document.getElementById(String(el.getAttribute('href') || '').replace(/^#/, ''));
    if (t) t.scrollIntoView({ behavior: RN.motion && RN.motion.reduced() ? 'auto' : 'smooth', block: 'start' });
  };
  /* A sentence that is a short lead-in plus pending chips ("Market rates [chip].") is a reviewer note as a whole, so
     with reviewer mode off the paragraph reads cleanly instead of ending in "Market rates ." */
  const NOTE_SENT = /^[^[\]]{0,40}?(\[\[gap:[^\]]*\]\]\s*)+[.]?$/;
  const richNotes = (p) => String(p).split(/(?<=\.)\s+(?=\S)/).map((s) => (NOTE_SENT.test(s.trim()) ? `<span data-proto>${rich(s)}</span>` : rich(s))).join(' ');
  const paras = (list, cls) => (list && list.length ? `<div class="fn-after${cls ? ' ' + cls : ''}">${list.map((p) => `<p class="pg-p"${onlyGapsP(p) ? ' data-proto' : ''}>${richNotes(p)}</p>`).join('')}</div>` : '');
  const onlyGapsP = (t) => /^[^[\]]*(\[\[gap:[^\]]*\]\][,.;]?\s*)+$/.test(String(t || '')) && !/[.!?]\s/.test(String(t).split('[[')[0]);
  // Copy that is nothing but pending chips: the whole element is a reviewer-mode note (hidden with them by default)
  const onlyGaps = (t) => /^\s*(\[\[gap:[^\]]*\]\][,.;]?\s*)+$/.test(String(t || ''));
  const catLabel = (cat) => RN.fields.catLabel(cat);

  /* ---------- Small charts, drawn from the page's own figures ---------- */
  // Dollar figures in a cell: "$4,000 to $10,000" -> { lo: 4000, hi: 10000 }; "$334K" -> 334000
  function dollars(s) {
    const n = [];
    String(s).replace(/\$(\d[\d,]*(?:\.\d+)?)\s*([KM])?/g, (m, v, u) => { n.push(parseFloat(v.replace(/,/g, '')) * (u === 'K' ? 1e3 : u === 'M' ? 1e6 : 1)); return m; });
    return n.length ? { lo: Math.min.apply(null, n), hi: Math.max.apply(null, n) } : null;
  }
  const kfmt = (v) => (v >= 1e6 ? `$${+(v / 1e6).toFixed(1)}M` : RN.fmt.k(v));
  const pct = (v, max) => +(Math.max(0, Math.min(1, v / (max || 1))) * 100).toFixed(2);

  /* Bars on one scale: rows [label, lo, hi, text]. A range draws solid to its low end and lighter to its high end. */
  function bars(rows, o) {
    o = o || {};
    const max = o.max || Math.max.apply(null, rows.map((r) => r[2])) || 1;
    return `<div class="fn-bars fn-io${o.cls ? ' ' + o.cls : ''}" role="img" aria-label="${esc((o.l ? o.l + ': ' : '') + rows.map((r) => `${r[0]} ${r[3]}`).join(', '))}">
      ${o.l ? `<span class="fn-bars-cap" aria-hidden="true">${esc(o.l)}</span>` : ''}
      ${rows.map(([l, lo, hi, t], i) => `<span class="fn-bars-r" aria-hidden="true" style="--i:${i}">
        <span class="fn-bars-l">${esc(l)}</span>
        <span class="fn-bars-t"><i class="fn-grow" data-draw="x" style="width:${pct(lo, max)}%"></i>${hi > lo ? `<i class="fn-grow fn-bars-x" data-draw="x" style="left:${pct(lo, max)}%;width:${pct(hi - lo, max)}%"></i>` : ''}</span>
        <b class="fn-bars-v">${esc(t)}</b>
      </span>`).join('')}
    </div>`;
  }

  /* Rates as a table with a range bar in the money column, every row on one scale. On a phone each row stacks into a
     small card (seat, hours and rate, then the bar), so no column is ever cut off, and a long table shows its first
     rows (o.phone per group, or per table) with "Show all N". Rows that hold only a pending chip are reviewer notes.
     One hue: the seat the page quotes (LEAD_ROWS) is forest, every other bar --viz-muted. On the cost hub each
     function's row header carries its Rate Index and cost guide links (g.links). */
  function chartTable(t, o) {
    o = o || {};
    const n = t.cols.length, mi = n - 1;
    const rows = t.groups ? [].concat.apply([], t.groups.map((g) => g.rows)) : t.rows;
    const real = rows.filter(Array.isArray).length;
    const max = Math.max.apply(null, rows.filter(Array.isArray).map((r) => (dollars(r[mi]) || { hi: 0 }).hi)) || 1;
    const step = 5000, top = Math.ceil(max / step) * step;
    // A "Monthly" column states figures without a unit; the cell reads "$4k - $10k/month", so the header says Price
    const unitless = /^monthly$/i.test(t.cols[mi]);
    let fixedAny = false, folded = 0;
    const ticks = [];
    for (let v = 0; v <= top; v += 10000) ticks.push(v);
    const axis = `<span class="fn-rc-axis" aria-hidden="true">${ticks.map((v) => `<i style="left:${pct(v, top)}%">${kfmt(v)}</i>`).join('')}</span>`;
    const row = (r, i, j) => {
      if (r.gap) return `<tr class="fn-rc-gap" data-proto><th scope="row">${esc(r.seat)}</th><td colspan="${n - 1}">${FN.gap(r.gap[0], r.gap[1])}</td></tr>`;
      const m = dollars(r[mi]);
      const fixed = /^fixed$/i.test(String(r[2]).trim());
      if (fixed) fixedAny = true;
      const lead = LEAD_ROWS.includes(r[0]);
      // On a phone a long table shows its first rows, and always the seat the page quotes
      const more = o.phone && j >= o.phone && !lead;
      if (more) folded++;
      const v = unitless && !/a month|fixed/i.test(r[mi]) ? r[mi] + ' a month' : r[mi];
      const bar = m ? `<span class="fn-rc-track" aria-hidden="true">${ticks.slice(1).map((v) => `<b style="left:${pct(v, top)}%"></b>`).join('')}<i class="fn-grow fn-rc-bar${m.lo === m.hi ? ' is-pt' : ''}${fixed ? ' is-fixed' : ''}${lead ? ' is-lead' : ''}" data-draw="x" style="left:${pct(m.lo, top)}%;width:${m.lo === m.hi ? 0 : pct(m.hi - m.lo, top)}%"></i></span>` : '';
      return `<tr class="${[more ? 'fn-x' : '', lead ? 'is-lead' : ''].filter(Boolean).join(' ')}"><th scope="row">${rich(r[0])}</th>${r.slice(1, mi).map((c, j) => `<td class="fn-rc-m"><span class="fn-rc-l" aria-hidden="true">${esc(t.cols[j + 1])}</span>${M(c)}</td>`).join('')}<td class="fn-rc-v"><span class="fn-rc-n">${M(v)}</span>${bar}</td></tr>`;
    };
    let k = 0;
    const grpRows = (list) => { let j = 0; return list.map((r) => row(r, k++, Array.isArray(r) ? j++ : -1)).join(''); };
    const grpLinks = (g) => {
      const L = g.cat && FN_LINKS[g.cat];
      if (!L) return '';
      const gd = guideOf(L.guide);
      return `<span class="fn-grp-a"><a href="#${esc(L.rates)}">${esc(catLabel(g.cat))} rates${icon('arrow')}</a><a href="#guide.${esc(L.guide)}"${gd ? ` title="${esc(gd.title)}"` : ''}>Cost guide${icon('arrow')}</a></span>`;
    };
    const body = t.groups
      ? t.groups.map((g) => `<tbody class="fn-grp"><tr class="fn-grp-h"><th colspan="${n}" scope="rowgroup"><div class="fn-grp-in"><span class="fn-grp-l">${esc(g.l)}</span>${o.links ? grpLinks(g) : ''}</div></th></tr>${grpRows(g.rows)}</tbody>`).join('')
      : `<tbody>${grpRows(t.rows)}</tbody>`;
    const head = t.cols.map((c, i) => (i === mi ? `<th scope="col" class="fn-rc-vh"><span>${esc(unitless ? 'Price' : c)}</span>${axis}</th>` : `<th scope="col">${esc(c)}</th>`)).join('');
    return `<div class="fn-rc fn-io"${folded ? ' data-fold' : ''}>
      <table class="fn-tbl fn-tbl-chart"${o.label ? ` aria-label="${esc(o.label)}"` : ''}><thead><tr>${head}</tr></thead>${body}</table>
      ${folded ? moreBtn(`Show all ${real} ${o.noun || 'rates'}`, true) : ''}
      <div class="fn-rc-foot">${o.basis ? RN.ui.figNote([o.basis]) : ''}${fixedAny ? `<p class="fn-rc-key" aria-hidden="true"><span><i></i>${esc(o.monthly || 'Monthly retainer')}</span><span><i class="is-fixed"></i>Fixed fee</span></p>` : ''}</div>
    </div>`;
  }
  const moreBtn = (label, phoneOnly) => `<button type="button" class="act fn-more${phoneOnly ? ' fn-more-m' : ''}" data-act="fn-more">${esc(label)}${icon('chev-down')}</button>`;
  // "Show all N": opens the fold the button sits in, then the button goes
  RN.actions['fn-more'] = (el) => {
    const f = el.closest('[data-fold]');
    if (f) f.classList.add('is-open');
    el.hidden = true;
  };

  /* ---------- Hero ----------
     Left (7 of 12 columns): eyebrow, H1 with the vermilion full stop, one answer sentence, Talk to us, and the faces row.
     Right (5 of 12): the real monthly cost card (the cost hub keeps its retainers-by-function card). Under both: the
     stat strip, price first, then the nine cleared client logos. Nothing in the hero animates. */
  /* A figure in the stat strip: a range gets a quieter "to" or "-" between its numbers, "/month" and "+" a small unit,
     and "Up to 7" a small "Up to" before the number */
  function figure(v) {
    if (v === 'net') v = NET();
    return esc(v)
      .replace(/^Up to /, '<span class="fn-pre">Up to </span>')
      .replace(/(\d[\d.,]*) to (?=\$?\d)/g, '$1<span class="fn-to"> to </span>')
      .replace(/(\$[\d.,]+k?) - (?=\$)/g, '$1<span class="fn-dash"> - </span>')
      .replace(/\/month$/, '<span class="fn-u">/month</span>')
      .replace(/\+$/, '<span class="fn-u">+</span>');
  }
  function kpis(d) {
    const st = statsOf(d);
    return `<dl class="fn-kpis is-${st.length}" aria-label="${esc(d.eyebrow)} at a glance">${st.map(([v, l], i) => `<div class="fn-kpi${i === 0 ? ' is-price' : ''}"><dt>${esc(l)}</dt><dd>${figure(v)}</dd></div>`).join('')}</dl>`;
  }

  /* The operators in this page's role category, in the order every list uses: live before sample, then Reputation
     Index, then name. */
  // Most profiles share a score of 50, so ties go to the fuller record: completeness, company-verified engagements,
  // focus areas and a listed rate, and only then the name
  const inCat = (cat) => RN.model.ops.filter((o) => o.catKey === cat && !o.hidden)
    .sort((a, b) => (a.sample ? 1 : 0) - (b.sample ? 1 : 0) || RN.fields.risRank(b) - RN.fields.risRank(a)
      || (b.completeness || 0) - (a.completeness || 0)
      || (b.engagements || []).filter((e) => e.clientVerified).length - (a.engagements || []).filter((e) => e.clientVerified).length
      || (b.tags || []).length - (a.tags || []).length || (b.rate ? 1 : 0) - (a.rate ? 1 : 0)
      || String(a.name).localeCompare(String(b.name)));
  // Photos first, initials last (a stable sort, so the order above holds inside each group)
  const photoFirst = (list) => list.slice().sort((a, b) => (b.photo ? 1 : 0) - (a.photo ? 1 : 0));
  // Company-voice picks never single out the founder's own listing (founder decision Oct 12, 2026); the faces row may
  // show him but never first (owner decision Oct 14, 2026: RN.model.notFirst)
  const featured = (cat) => RN.model.notFirst(photoFirst(inCat(cat).filter((o) => !o.isMatt))).slice(0, 3);

  /* The faces row under the hero button: up to five operators from the bench, the count and the way in */
  function faces(d) {
    const all = inCat(d.cat);
    const pick = RN.model.notFirst(photoFirst(all)).slice(0, 5);
    if (!pick.length) return '';
    return `<a class="fn-faces" href="#${esc(d.browse)}">
      <span class="fn-faces-row" aria-hidden="true">${pick.map((o) => RN.ui.avatar(o, 'ava-md', { decorative: true })).join('')}</span>
      <span class="fn-faces-t"><b>${esc(RN.fmt.int(all.length))} ${esc(catLabel(d.cat).toLowerCase())} operators</b><span>Every profile is open, no login needed</span></span>
      <span class="fn-faces-go" aria-hidden="true">${icon('arrow')}</span>
    </a>`;
  }

  /* Range lanes on one scale: rows { l, lo, hi, t, cls }. A range is a bar, a single figure a dot. */
  function lanes(rows, o) {
    o = o || {};
    const top = Math.ceil(Math.max.apply(null, rows.map((r) => r.hi)) / 10000) * 10000 || 10000;
    const ticks = [];
    for (let v = 0; v <= top; v += 10000) ticks.push(v);
    const marks = (segs) => segs.map((g) => `<i class="${g.lo === g.hi ? 'is-pt' : ''}${g.cls ? ' ' + g.cls : ''}" data-draw="x" style="left:${pct(g.lo, top)}%;width:${g.lo === g.hi ? 0 : pct(g.hi - g.lo, top)}%"></i>`).join('');
    return `<ul class="fn-ln">${rows.map((r) => `<li class="fn-ln-r${r.cls ? ' ' + r.cls : ''}">
        <span class="fn-ln-l">${r.lHtml || esc(r.l)}</span><b class="fn-ln-v">${esc(r.t)}</b>
        <span class="fn-ln-t" aria-hidden="true">${ticks.slice(1, -1).map((v) => `<u style="left:${pct(v, top)}%"></u>`).join('')}${marks(r.segs || [{ lo: r.lo, hi: r.hi }])}</span>
      </li>`).join('')}</ul>
      <div class="fn-ln-axis" aria-hidden="true">${ticks.map((v) => `<span style="left:${pct(v, top)}%">${kfmt(v)}</span>`).join('')}</div>`;
  }

  /* Function pages: the real monthly cost card, every seat from RN.costs on one scale; the seat the page quotes in
     forest, the others --viz-muted, and (sales) the full-time VP of Sales as a hollow mark for comparison */
  function costCard(d) {
    const lead = leadOf(d);
    const seats = RN.costs.seats(d.fn);
    const quoted = lead.paid === 'quoted';
    const rows = seats.filter((r) => r.monthly).map((r) => ({ l: r.shortLabel || r.label, lo: r.monthly.lo, hi: r.monthly.hi, t: r.text.monthly, cls: r.key === lead.key ? 'is-lead' : '' }));
    const ft = lead.fullTime;
    if (ft) rows.push({ l: `Full-time VP of Sales, ${lead.text.fullTime.replace(/^About/, 'about')}`, lo: ft.monthly, hi: ft.monthly, t: lead.text.fullTimeMonthly, cls: 'is-ft' });
    const fixed = seats.filter((r) => !r.monthly && r.fixed);
    const fx = fixed.length ? `<div class="fn-cc-fx"><span class="label">${fixed.length > 1 ? 'Fixed fees' : 'Fixed fee'}</span>${fixed.map((r) => `<span><b>${esc(r.shortLabel || r.label)}</b> ${esc(r.text.fixed.replace(/ fixed$/, '').replace(/^About/, 'about'))}</span>`).join('')}</div>` : '';
    const notes = [RN.costs.basis(lead.key)].concat(ft ? ['Full-time pay from ' + ft.src] : []);
    return `<figure class="fn-cc fn-io" aria-label="${esc((quoted ? 'Monthly rates quoted in our 2026 searches: ' : 'Monthly cost by seat in our 2026 engagements: ') + rows.map((r) => r.l + ' ' + r.t).join(', '))}">
      <figcaption class="fn-cc-hd"><span class="label">${quoted ? 'Quoted in our 2026 searches' : 'Our 2026 engagements'}</span><b>What each seat costs a month</b></figcaption>
      <div aria-hidden="true">${lanes(rows)}</div>
      ${fx}
      <div class="fn-cc-foot">${RN.ui.figNote(notes)}${jump('fn-cost', 'Every seat with hours and rates')}</div>
    </figure>`;
  }

  /* Cost hub: monthly retainers by function, each seat a segment on its function's lane, from the rates below */
  function mix(d) {
    const rows = d.rates.groups.map((g) => {
      const segs = g.rows.filter((r) => Array.isArray(r) && !/^fixed$/i.test(r[2]) && /a month/.test(r[3])).map((r) => Object.assign(dollars(r[3]) || {}, { cls: LEAD_ROWS.includes(r[0]) ? 'is-lead' : '' })).filter((x) => x.hi);
      return segs.length ? { l: g.l, segs, lo: Math.min.apply(null, segs.map((x) => x.lo)), hi: Math.max.apply(null, segs.map((x) => x.hi)) } : null;
    }).filter(Boolean).map((x) => Object.assign(x, { t: RN.fmt.moRange(x.lo, x.hi) }));
    return `<figure class="fn-cc fn-mix fn-io" aria-label="Monthly retainers by function, 2026 engagements: ${esc(rows.map((x) => x.l + ' ' + x.t).join(', '))}">
      <figcaption class="fn-cc-hd"><span class="label">Our 2026 engagements</span><b>Monthly retainers by function</b></figcaption>
      <div aria-hidden="true">${lanes(rows)}</div>
      <div class="fn-cc-foot">${RN.ui.figNote([RN.costs.basis('hub')])}${jump('fn-rates', 'Every seat, with hours and rates')}</div>
    </figure>`;
  }

  function hero(d) {
    const hub = d.fn === 'cost';
    return `<header class="wrap phead pg-head fn-hero">
      <div class="g12 fn-hero-g">
        <div class="c-7 pg-head-copy">
          <span class="eyebrow">${esc(d.eyebrow)}</span>
          <h1 class="h1">${d.hero.h}<span class="vm">.</span></h1>
          <p class="lede fn-ans">${nw(esc(answerOf(d)))}</p>
          <div class="pg-actions"><a class="btn btn-lg" href="#${esc(talkTo(d))}">Talk to us${icon('arrow')}</a>${hub ? `<a class="btn btn-line btn-lg" href="#${esc(d.browse)}">Browse operators</a>` : ''}</div>
          ${hub ? '' : faces(d)}
        </div>
        <div class="c-5 pg-head-aside">${hub ? mix(d) : costCard(d)}</div>
      </div>
      ${kpis(d)}
      ${FN.logoStrip({ eager: true, className: 'fn-hero-logos' })}
    </header>`;
  }

  /* ---------- Who would I get ----------
     Featured operators: the page's role category, by Reputation Index, live profiles before sample ones, photos first.
     Matt picks the featured three (pending); until then the order is the same rule every list uses. Each card carries
     Request intro: the one place on these pages where the visitor has picked a specific operator. */
  /* The row each page's card spec adds (Site pages, section 2): revenue bands on sales, engagement type on RevOps,
     lean on marketing (demand gen or brand, from the operator's own focus areas; both when they list both). */
  const DEMAND = /demand gen/i;
  const BRAND = /^(brand\b|founder brand|rebranding|series a\/b brand)/i;
  function cardRow(d, op) {
    let l = '', v = '';
    if (d.fn === 'sales') { l = 'Revenue bands'; v = (op.revenueRanges || []).map((x) => RN.w.label('revenueRange', x)).join(', '); }
    else if (d.fn === 'revops') { l = 'Engagement type'; v = (op.engagementTypes || []).map((x) => RN.w.label('engagementTypes', x)).join(', '); }
    else if (d.fn === 'marketing') {
      l = 'Lean';
      const t = (op.tags || []).map((x) => x.t);
      const dg = t.some((x) => DEMAND.test(x)), br = t.some((x) => BRAND.test(x));
      v = dg && br ? 'Demand gen and brand' : dg ? 'Demand gen' : br ? 'Brand' : '';
    }
    return v ? `<div class="fn-card-row"><span class="label">${esc(l)}</span><span>${esc(v)}</span></div>` : '';
  }
  // A card without a headline opens with the first sentence of the operator's own bio, so the three cards match
  const firstLine = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); const m = s.match(/^.{20,}?[.!?](?=\s|$)/); return m ? m[0] : s; };
  const withLine = (op) => (op.headline || !op.bio ? op : Object.assign({}, op, { headline: firstLine(op.bio) }));
  function who(d) {
    const ops = featured(d.cat);
    const gaps = [['featured operator picks', 'Matt'], ['operator OK needed for each named operator', 'Operator']].concat(d.who.gaps || []);
    return sec('who', true, `${PG.shead('Operators', 'Who would I get', esc(RN.fmt.smart(d.who.lede)))}
      <div class="fn-feat-hd" data-proto><h3 class="h4">Featured operators</h3>${gaps.map(([w, o]) => FN.gap(w, o)).join('')}</div>
      <p class="fn-feat-note small muted" data-proto>Shown by Reputation Index, then the fullest profile, until the featured picks are confirmed. Every profile is open, no login needed.</p>
      ${ops.length ? `<div class="grid g-3 fn-feat">${ops.map((op) => RN.ui.opCard(withLine(op), { meta: cardRow(d, op), cta: 'invite', ctaAct: 'intro-open', ctaLabel: 'Request intro' })).join('')}</div>` : RN.ui.empty({ icon: 'users', title: 'No operators in this category yet', body: 'Featured operators appear here once the bench has live profiles.' })}
      <div class="fn-feat-more"><a class="act" href="#${esc(d.browse)}">Browse every ${esc(catLabel(d.cat).toLowerCase())} operator${icon('arrow')}</a></div>
      ${vet(d)}`);
  }

  /* Plain tables (the cost hub's terms and the pending Rate Index). t: { cols, rows, num, label } */
  function table(t, o) {
    o = o || {};
    const num = t.num || [];
    const n = t.cols.length;
    const th = (c, i) => `<th scope="col"${num.includes(i) ? ' class="r"' : ''}>${esc(c)}</th>`;
    const more = (i) => (o.phone && i >= o.phone ? ' class="fn-x"' : '');
    const row = (r, i) => {
      if (r.gap) return `<tr${more(i)}><th scope="row">${esc(r.seat)}</th><td colspan="${n - 1}" class="fn-td-gap">${FN.gap(r.gap[0], r.gap[1])}</td></tr>`;
      return `<tr${more(i)}>${r.map((c, i) => (i === 0 ? `<th scope="row">${rich(c)}</th>` : `<td${num.includes(i) ? ' class="r"' : ''}>${M(c)}</td>`)).join('')}</tr>`;
    };
    const fold = o.phone && t.rows.length > o.phone;
    return `<div class="fn-tblw"${fold ? ' data-fold' : ''}><table class="fn-tbl"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>
      <thead><tr>${t.cols.map(th).join('')}</tr></thead><tbody>${t.rows.map(row).join('')}</tbody></table>
      ${fold ? moreBtn(`Show all ${t.rows.length} ${o.noun || 'rows'}`, true) : ''}</div>`;
  }
  /* The terms under a cost table: four rows (term, notice, assessment or billing, platform fee), figure over meaning */
  function termsList(rows) {
    return `<dl class="fn-trm" aria-label="Terms">${rows.map(([t, v, n]) => `<div class="fn-trm-r"><dt>${esc(t)}</dt><dd><b>${figure(v)}</b><span>${esc(n)}</span></dd></div>`).join('')}</dl>`;
  }
  function cost(d) {
    const lead = leadOf(d), L = FN_LINKS[d.cat] || {};
    return sec('cost', false, `${PG.shead('Cost', 'What it costs', esc(d.cost.lede))}
      ${chartTable(d.cost, { label: d.cost.lede.replace(/\.$/, ''), phone: 3, basis: RN.costs.basis(lead.key) })}
      ${termsList(d.cost.terms())}
      <div class="fn-links">${L.guide ? `<a class="act" href="#guide.${esc(L.guide)}">Cost guide${icon('arrow')}</a>` : ''}<a class="act" href="#fractional-cost">Every seat and term on the cost page${icon('arrow')}</a>${d.cost.note ? `<span class="small muted" data-proto>${rich(d.cost.note)}</span>` : ''}</div>
      ${contribLine({ cat: d.cat, source: 'function_' + d.fn })}`, '', 'fn-cost');
  }

  /* ---------- What happens first: the When / What happens / What you receive table as a 90-day Gantt ----------
     Two zones on one lane: matching (day 1 to the contract) and the first 90 days in the seat. A one-day step is a
     milestone; a span is a bar; what you receive sits under its bar. It is a table (ARIA rows and cells, the header
     row names the three columns), so each row keeps its words in reading order and screen readers hear the columns. */
  const MZ = 24; // the matching zone's share of the lane, in percent
  function span(w) {
    let m;
    if (/^Day 1$/i.test(w)) return { z: 'm', a: 1, b: 1 };
    if ((m = w.match(/(\d+)\s*hours/i))) return { z: 'm', a: +m[1] / 24, b: +m[1] / 24 };
    if ((m = w.match(/^Weeks? (\d+) to (\d+)/i))) return { z: 'm', a: (m[1] - 1) * 7, b: m[2] * 7 };
    if ((m = w.match(/^Days (\d+) to (\d+)/i))) return { z: 's', a: m[1] - 1, b: +m[2] };
    return null;
  }
  function gantt(d) {
    const rows = d.first.rows.map((r) => ({ r, s: span(r[0]) }));
    const md = Math.max(14, ...rows.filter((x) => x.s && x.s.z === 'm').map((x) => x.s.b));
    const pos = (z, v) => +(z === 'm' ? (v / md) * (MZ - 3) : MZ + (v / 90) * (100 - MZ)).toFixed(2);
    const grid = [[pos('m', md), ''], [pos('s', 30), ''], [pos('s', 60), ''], [pos('s', 90), '']];
    const lines = `<span class="fn-g-lines" aria-hidden="true">${grid.map(([x]) => `<u style="left:${x}%"></u>`).join('')}<u class="fn-g-split" style="left:${MZ - 1.5}%"></u></span>`;
    const axis = `<div class="fn-g-r fn-g-hd" role="row"><span class="fn-g-when" role="columnheader">When</span><span class="fn-g-what" role="columnheader">What happens</span>
      <span class="fn-g-lane fn-g-axis" role="columnheader"><span class="fn-tl-l">What you receive</span><span class="fn-g-axw" aria-hidden="true">${lines}
        <span class="fn-g-zone" style="left:0;width:${MZ - 3}%">Matching</span><span class="fn-g-zone is-seat" style="left:${MZ}%;width:${100 - MZ}%">In the seat</span>
        <i style="left:${pos('m', md)}%">Week ${md / 7}</i>${[30, 60, 90].map((v) => `<i style="left:${pos('s', v)}%">Day ${v}</i>`).join('')}
      </span></span></div>`;
    const items = rows.map(({ r, s }, i) => {
      const [w, a, b] = r;
      let mark = '', out = '';
      if (s) {
        const x0 = pos(s.z, s.a), x1 = pos(s.z, s.b), pt = s.a === s.b;
        mark = pt ? `<i class="fn-g-mile${s.z === 'm' ? ' is-m' : ''}" data-draw="fade" style="left:${x0}%"></i>`
          : `<i class="fn-grow fn-g-bar${s.z === 'm' ? ' is-m' : ''}" data-draw="x" style="left:${x0}%;width:${(x1 - x0).toFixed(2)}%"></i>`;
        // Under its bar: from the bar's start when the bar sits left of centre, else ending where the bar ends
        out = x0 < 50 ? `margin-left:${x0}%;max-width:${(100 - x0).toFixed(2)}%` : `margin-left:auto;margin-right:${(100 - x1).toFixed(2)}%;max-width:${Math.max(x1, 46).toFixed(2)}%;text-align:right;justify-content:flex-end`;
      }
      return `<div class="fn-g-r" role="row">
        <span class="fn-g-when" role="rowheader">${esc(w)}</span>
        <span class="fn-g-what" role="cell">${rich(a)}</span>
        <span class="fn-g-lane" role="cell">${lines}${mark}<span class="fn-g-out" style="${out}">${icon('check')}<span>${rich(b)}</span></span></span>
      </div>`;
    }).join('');
    return `<div class="fn-gantt fn-io" role="table" aria-label="What happens first" style="--mz:${MZ - 3}%">${axis}<div class="fn-g-rows" role="rowgroup">${items}</div></div>`;
  }
  function first(d) {
    // The closing line reads as the section's lede, so it sits under the heading instead of a block of its own
    return sec('first', true, `${PG.shead('First 90 days', 'What happens first', d.first.closing ? rich(d.first.closing) : '')}
      ${gantt(d)}`);
  }

  /* ---------- Companies like yours (was "Who like me has done this", credibility audit) ----------
     Each story opens on a small picture of its own figures; a part that is only pending chips is a reviewer note */
  /* The weighted scorecard: factor, a bar per weight (scaled to the heaviest), the weight */
  function scoreRows(rows) {
    const max = Math.max.apply(null, rows.map((r) => r[1])) || 1;
    return rows.map(([f, w]) => `<div class="fn-score-r" role="row"><span class="fn-score-f" role="cell">${esc(f)}</span><span class="fn-score-bar" aria-hidden="true"><i class="fn-grow" data-draw="x" style="width:${Math.round((w / max) * 100)}%"></i></span><b class="fn-score-w" role="cell">${esc(w)}%</b></div>`).join('');
  }
  function vignette(v, parts) {
    if (!v) return '';
    let inner = '';
    if (v.k === 'bars') inner = bars(v.rows, { l: v.l || v.u });
    else if (v.k === 'score') {
      const tbl = (parts || []).find((p) => p && p.table);
      if (!tbl) return '';
      inner = `<span class="fn-bars-cap">Weighted scorecard</span><div class="fn-score fn-io" role="table" aria-label="Weighted scorecard">${scoreRows(tbl.table)}</div>`;
    } else if (v.k === 'people' || v.k === 'deals') {
      inner = `<div class="fn-vg-dots fn-io${v.k === 'deals' ? ' is-deals' : ''}" role="img" aria-label="${esc(v.l)}">${Array.from({ length: v.n }, (_, i) => `<i class="${i < v.on ? 'on' : ''}" data-draw="fade">${v.k === 'deals' ? esc(v.v) : icon('user')}</i>`).join('')}</div><span class="fn-vg-cap">${esc(v.l)}</span>`;
    } else if (v.k === 'big') inner = `<span class="fn-vg-big"><b>${figure(v.v)}</b>${v.u ? `<span>${esc(v.u)}</span>` : ''}</span>${v.n ? `<span class="fn-vg-dots fn-io" aria-hidden="true">${Array.from({ length: v.n }, () => `<i class="on" data-draw="fade">${icon('user')}</i>`).join('')}</span>` : ''}${v.l ? `<span class="fn-vg-cap">${esc(v.l)}</span>` : ''}`;
    else if (v.k === 'jobs') inner = `<span class="fn-vg-jobs" role="img" aria-label="${esc(v.rows.join(', '))}">${v.rows.map((t) => `<i class="ftag">${esc(t)}</i>`).join('')}</span>`;
    return `<div class="fn-vg fn-vg-${v.k}">${inner}</div>`;
  }
  /* A story card. Its last visible part (the starting point or result) is the card's foot, pinned to the bottom edge
     so cards in a row end on one line */
  function story(parts, v) {
    const body = parts.filter((p) => p && !p.table);
    const shown = body.filter((p) => !p.title && !onlyGaps(p[1]));
    const foot = shown.length > 1 ? shown[shown.length - 1] : null;
    const part = (p) => {
      if (p.title) return `<h3 class="fn-story-t">${rich(p.title)}</h3>`;
      const l = p[0], t = p[1];
      return `<div class="fn-story-p${p === foot ? ' fn-story-foot' : ''}"${onlyGaps(t) ? ' data-proto' : ''}>${l ? `<span class="fn-story-l">${esc(l)}</span>` : ''}<p>${rich(t)}</p></div>`;
    };
    return `<article class="fn-story${shown.length < 2 ? ' is-short' : ''}">${vignette(v, parts)}<div class="fn-story-b">${body.map(part).join('')}</div></article>`;
  }
  // Visible parts of a story (title and reviewer-only parts aside): a pair of narrow cards needs two each to end flush
  const shownParts = (st) => st.filter((p) => p && !p.table && !p.title && !onlyGaps(p[1])).length;
  /* Three stories: the first runs full width (picture left, its parts in two columns), the other two share the next
     row with their picture on top and their foot pinned. When either of that pair has a single visible part (nothing
     to pin), or there are one or two stories, every story runs full width instead, so no card ends on a hole. */
  function stories(d) {
    const n = d.stories.length;
    const pair = n === 3 && d.stories.slice(1).every((st) => shownParts(st) > 1);
    return sec('proof', false, `${PG.shead('Proof', 'Companies like yours', d.storiesLede ? esc(RN.fmt.smart(d.storiesLede)) : '')}
      <div class="fn-stories is-${pair ? 3 : 1}">${d.stories.map((st, i) => story(st, (d.viz || [])[i])).join('')}</div>`);
  }

  /* ---------- How we vet: a night panel closing Who would I get. The four bullets map in order to C, O, R, E. ----------
     The policy line ("We place only dedicated fractional operators") repeats the section lede; the page's own second
     paragraph is two tiles (a figure, then the point it makes). Icons are monochrome tiles. */
  const CORE_IC = ['message', 'shield', 'target', 'compass'];
  function vet(d) {
    const dims = RN.fields.coreDims.options;
    const tiles = d.vet.tiles || [];
    return `<div class="panel-night fn-vetp" id="fn-vet">
      <div class="fn-vetp-hd"><span class="eyebrow">Vetting</span><h3 class="h3">How we vet</h3><p class="lede">${esc(d.vet.lead)}</p></div>
      <ul class="fn-core" aria-label="CORE, the four scores">${d.vet.core.map((t, i) => `<li style="--i:${i}">
        <span class="fn-core-ic" aria-hidden="true">${RN.ui.icoTile(CORE_IC[i] || 'check')}<b>${esc(dims[i].v)}</b></span>
        <span class="fn-core-n">${esc(dims[i].l)}</span>
        <p>${rich(t)}</p>
      </li>`).join('')}</ul>
      ${tiles.length ? `<div class="fn-vt">${tiles.map(([v, t]) => `<div class="fn-vt-c"><b>${figure(v)}</b><span>${esc(t)}</span></div>`).join('')}</div>` : ''}
      <div class="fn-vetp-foot"><a class="act fn-vet-link" href="#levels">How CORE feeds the Reputation Index${icon('arrow')}</a></div>
    </div>`;
  }

  /* FAQ: the first four, the rest behind "Show all N" */
  function faqList(items) {
    const SHOW = 4;
    if (items.length <= SHOW) return PG.faq(items);
    return `<div class="fn-faqf" data-fold>${PG.faq(items.slice(0, SHOW))}<div class="fn-fold">${PG.faq(items.slice(SHOW), { closed: true })}</div>
      ${moreBtn(`Show all ${items.length} questions`)}</div>`;
  }
  function faq(d) {
    return sec('faq', true, `<div class="fn-faq-in">${PG.shead('FAQ', 'Common questions')}${faqList(d.faq)}</div>`);
  }

  /* Form block: Talk to us is the four-question flow on #talk. The card lists its questions, with this page's need
     already picked, and opens the flow there. */
  const lcFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  function talkCard(d) {
    const starts = RN.fields.startBy.options.map((o) => o.l);
    const startList = [starts[0]].concat(starts.slice(1).map(lcFirst)).join(', ').replace(/, ([^,]*)$/, ' or $1');
    const qs = [
      ['What do you need help with?', d.need ? `${RN.w.label('need', d.need)}, picked for you` : 'Pick the closest match'],
      ['How big is the business today?', 'Revenue and headcount'],
      ['When do you need them to start?', startList],
      ['Where should we reply?', 'Your name and work email. Company and title are optional.'],
    ];
    return `<div class="fn-form-card">
      <div class="fn-form-card-hd"><span class="label">Four quick questions</span>${FN.gap('form ships Oct 30', 'Rapid Neuron')}</div>
      <ol class="fn-form-q">${qs.map(([q, a]) => `<li><b>${esc(q)}</b><span>${esc(a)}</span></li>`).join('')}</ol>
      <div class="fn-form-cta"><a class="btn btn-leaf btn-lg" href="#${esc(talkTo(d))}">Talk to us${icon('arrow')}</a><button type="button" class="btn btn-line btn-lg" data-act="pg-book">${icon('calendar')}Book a call</button></div>
      <p class="fn-form-fine small">We show you three operators right away, and a person replies within one business day.</p>
    </div>`;
  }
  // The answer posts in the Guides end on the same card (content playbook: every post ends at the form)
  FN.talkCard = talkCard;
  FN.talkTo = talkTo;
  function formBlock(d) {
    return `<section class="section night fn-sec fn-form" id="fn-form" data-fn="${esc(d.fn)}"><div class="wrap fn-form-in">
      <div class="fn-form-l">
        <span class="eyebrow">Talk to us</span>
        <h2 class="h2">${esc(d.form.h)}</h2>
        <p class="lede">${esc(RN.fmt.smart(d.form.lede))}</p>
      </div>
      <div class="fn-form-r">${talkCard(d)}</div>
    </div></section>`;
  }

  /* Under each cost table: one line inviting the number to the Rate Index (RN.contrib). 'rates' picks by side:
     companies add what they paid, operators add their rate, a visitor with no known side chooses in the flow.
     It switches to a thanks state on its own after a contribution (RN.contrib.refresh). */
  function contribLine(ctx) {
    if (!RN.contrib) return '';
    const html = RN.contrib.cta('rates', { variant: 'line', ctx });
    return html ? `<div class="fn-contrib">${html}</div>` : '';
  }

  /* ---------- Cost hub pieces ---------- */
  /* Rates by seat: the real 2026 table with a bar per seat, each function's Rate Index and cost guide under its name,
     and one line on when the survey's real results land. The Rate Index is illustrative until then, and says so. */
  function rates(d) {
    const ri = { cols: ['Seat', 'Median rate, typical hours and typical monthly'], rows: d.riSeats.map((s) => ({ seat: s, gap: ['2027 survey figure', 'Survey'] })) };
    return `<section class="section fn-sec fn-rates fn-alt" id="fn-rates"><div class="wrap">${PG.shead('2026 engagements', 'Rates by seat')}
      ${chartTable(d.rates, { label: 'Rates by seat, 2026 engagements', monthly: 'Monthly', phone: 1, noun: 'seats', links: true, basis: RN.costs.basis('hub') })}
      <div class="fn-survey">${icon('calendar')}<span>Real results from our State of Fractional GTM survey land in early December 2026. Until then the Rate Index by role is ${RN.ui.illusTag('illustrative')}.</span><a class="act" href="#rates">Open the Rate Index${icon('arrow')}</a></div>
      ${contribLine({ source: 'cost_hub' })}
      <div class="fn-ri-l" data-proto>
        <div class="fn-ri-hd"><h3 class="h4">Rate Index by seat</h3>${FN.gap('2027 survey figure', 'Survey')}</div>
        ${table(ri, { label: 'Rate Index by seat' })}
      </div>
    </div></section>`;
  }
  function moves(d) {
    const v = d.moves.viz || [];
    return sec('moves', false, `${PG.shead('Price drivers', 'What moves the price')}
      <div class="fn-drv-grid"><ol class="fn-drivers">${d.moves.items.map((t, i) => `<li><span class="fn-drv-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><p>${rich(t)}</p>${vignette(v[i])}</li>`).join('')}</ol>
      <p class="fn-lead">${rich(d.moves.closing)}</p></div>
      ${models(d)}`);
  }
  /* Engagement models: one card each */
  function models(d) {
    const c = d.models.cols;
    // Part of What moves the price: how the hours are bought is the last thing that moves it
    return `<div class="fn-models-in"><h3 class="h3 fn-models-h">Engagement models</h3>
      <div class="grid g-3 fn-models">${d.models.rows.map((r, i) => `<article class="fn-model">
        <h3 class="fn-model-t">${esc(r[0])}</h3>
        <p class="fn-model-how"><span class="sr-only">${esc(c[1])}: </span>${rich(r[1])}</p>
        <dl><div><dt>${esc(c[2])}</dt><dd>${rich(r[2])}</dd></div><div><dt>${esc(c[3])}</dt><dd>${M(r[3])}</dd></div></dl>
      </article>`).join('')}</div>
      ${paras(d.models.after)}</div>`;
  }
  /* Total cost: one card per seat, full-time against fractional, with paired bars where both sides are dollar figures */
  function total(d) {
    const c = d.total.cols, v = d.total.viz || [];
    return `<section class="section night fn-sec fn-total"><div class="wrap">${PG.shead('Comparison', 'Total cost against a full-time hire')}
      <div data-fold><div class="grid g-2 fn-vs">${d.total.rows.map((r, i) => {
        const z = v[i];
        const max = z ? Math.max(z[0][1], z[1][1]) : 1;
        const side = (k, label, text, val) => `<div class="fn-vs-s is-${k}">
          <span class="fn-vs-l">${esc(label)}</span>
          ${val ? `<span class="fn-vs-bar fn-io" aria-hidden="true"><i class="fn-grow" data-draw="x" style="width:${pct(val[0], max)}%"></i>${val[1] > val[0] ? `<i class="fn-grow fn-vs-x" data-draw="x" style="left:${pct(val[0], max)}%;width:${pct(val[1] - val[0], max)}%"></i>` : ''}</span>` : ''}
          <p>${M(text)}</p>
        </div>`;
        return `<article class="fn-vs-c${z ? ' has-bars' : ''}${i >= 2 ? ' fn-x' : ''}">
          <h3 class="fn-vs-t">${esc(r[0])}</h3>
          ${side('ft', c[1], r[1], z && z[0])}${side('fr', c[2], r[2], z && z[1])}
        </article>`;
      }).join('')}</div>${d.total.rows.length > 2 ? moreBtn(`Show all ${d.total.rows.length} comparisons`, true) : ''}</div>
      ${paras(d.total.after)}
    </div></section>`;
  }
  /* Terms and the FAQ answer the same question (how an engagement runs), so they share a section */
  function terms(d) {
    return sec('terms', true, `<div class="fn-terms-in">
      <div class="fn-terms-t">${PG.shead('Terms', 'How an engagement runs')}${table(d.terms, { label: 'Terms', phone: 4, noun: 'terms' })}</div>
      <div class="fn-terms-q">${PG.shead('FAQ', 'Common questions')}${faqList(d.faq)}</div>
    </div>`);
  }
  /* Read next: three guides, one per function, each a card that is one link */
  function reading(d) {
    const list = (d.reading || []).map(guideOf).filter(Boolean);
    if (!list.length) return '';
    const kind = (g) => (g.post && g.post.kindL) || 'Guide';
    return sec('reading', false, `${PG.shead('Guides', 'Read next', 'Each one answers a question this page leaves open.')}
      <div class="grid g-3 fn-guides">${list.map((g) => `<a class="card card-link fn-guide" href="#guide.${esc(g.slug)}">
        <span class="fn-guide-k">${esc(catLabel(g.cat))} · ${esc(kind(g))}</span>
        <b class="fn-guide-t">${esc(g.title)}</b>
        <span class="fn-guide-m">Updated ${esc(RN.fmt.date(g.updated + 'T12:00:00'))} · ${esc(g.mins)} min read${icon('arrow')}</span>
      </a>`).join('')}</div>`);
  }

  /* ---------- Views ---------- */
  const homeView = (d) => `<div class="fn-page" data-fn="${esc(d.fn)}">${hero(d)}${who(d)}${cost(d)}${first(d)}${stories(d)}${faq(d)}${formBlock(d)}</div>`;
  const costView = (d) => `<div class="fn-page fn-page-cost" data-fn="${esc(d.fn)}">${hero(d)}${rates(d)}${moves(d)}${total(d)}${terms(d)}${reading(d)}${formBlock(d)}</div>`;

  /* Motion (policy, Oct 14, 2026): each chart below the fold draws once, about 600ms, the first time it scrolls into
     view (RN.motion.draw: nothing on screen at the first scroll is ever hidden, and reduced motion or calm mode skip
     it). The hero never animates. No count-ups, no reveals on text. */
  function mount(root) {
    if (!RN.motion || !root) return;
    RN.$$('.fn-io', root).forEach((el, i) => {
      if (!el.hasAttribute('data-mo-key')) el.setAttribute('data-mo-key', 'fn-chart-' + i);
      RN.motion.draw(el);
    });
  }
  function unmount() { /* RN.motion drops its observers on every new route visit */ }

  [SALES, REVOPS, MARKETING].forEach((d) => {
    RN.view(d.name, { route: d.name, nav: '', title: () => d.title, render: () => homeView(d), mount, unmount });
  });
  RN.view(COST.name, { route: COST.name, nav: '', title: () => COST.title, render: () => costView(COST), mount, unmount });

})();
