/* RN.model.understand: reads a request written the way clients talk ("We're a $12M SaaS company, about 80 people,
   and need someone to build our sales team, ideally starting in two weeks, 2 days a week") and maps it onto the
   platform's standard fields, so search runs on the same slugs as operator signup:
     role category, industry, company revenue, employee range, availability, minimum available time,
     engagement type, hourly rate cap, plus focus-area keywords and the "what do you need" answer.
   M.understand(text)        -> {natural, facts:[{k, v, label, src}], filters, q, need}
   M.understandSearch(text, base) -> the same, plus the filters and keywords actually applied after relaxing
                                  anything that would leave zero operators ({applied:{q, filters}, dropped:[facts]}). */
(function () {
  'use strict';
  const RN = window.RN;
  const M = RN.model, F = RN.fields;

  const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, a: 1, an: 1, couple: 2, 'a couple of': 2, 'a couple': 2, 'a few': 3, few: 3, half: 0.5 };
  const num = (s) => { s = String(s || '').trim().toLowerCase().replace(/,/g, ''); return s in WORDNUM ? WORDNUM[s] : parseFloat(s); };
  const has = (t, re) => re.test(t);

  /* ---------- Role categories: how clients describe the person they want ---------- */
  const ROLE_CUES = [
    ['sales_leadership', /\b(vp|vice president|head|director|leader|chief)\s+(of\s+)?sales\b|\bsales (leader|leadership|manager|director|vp|executive leader)\b|\bcro\b|\bchief revenue officer\b|\b(build|building|build out|scale|scaling|fix|rebuild)\s+(out\s+)?(a |our |the |my )?(first\s+)?sales (team|org|organization|function|process|motion|engine)\b|\bown (the |our )?(number|quota|revenue|sales)\b|\bhire (and ramp |and manage )?(our first |the first |two |three |a few |\d+ )?(aes|reps|salespeople|sellers|account executives|sdrs|bdrs)\b|\bfounder[- ]led sales\b|\bfounders? (is |are )?(still )?(selling|doing (all )?(the )?sales|running sales|closing)\b/],
    ['marketing', /\b(cmo|chief marketing officer)\b|\b(vp|vice president|head|director|leader)\s+(of\s+)?marketing\b|\bmarketing (leader|lead|leadership|director|team|strategy|function)\b|\bdemand gen(eration)?\b|\bmarketer\b|\bpositioning\b|\bmessaging\b|\bbrand strategy\b|\bcontent (strategy|marketing)\b|\bseo\b|\bpaid (search|social|media)\b|\babm\b|\baccount[- ]based marketing\b/],
    ['revenue_operations', /\brev\s?ops\b|\brevenue operations\b|\bsales ops\b|\bsales operations\b|\bmarketing ops\b|\bgtm ops\b|\bcrm (admin|cleanup|clean[- ]up|migration|implementation|mess|hygiene)\b|\b(hubspot|salesforce|pipedrive) (admin|cleanup|clean[- ]up|implementation|migration|setup|set up)\b|\b(clean up|fix|rebuild|migrate) (our |the )?(crm|hubspot|salesforce)\b|\bforecast(ing)?\b|\b(pipeline )?reporting\b|\bdashboards?\b|\blead routing\b|\btech stack\b/],
    ['sales_enablement', /\benablement\b|\bsales training\b|\b(onboard|onboarding|ramp|ramping|train|training|coach|coaching)\s+(our |the |new )?(new )?(reps|sellers|salespeople|aes|sdrs|bdrs|sales team)\b|\bramp time\b|\bsales playbook\b|\bcall coaching\b/],
    ['customer_success_growth', /\bcustomer success\b|\b(cs|client success) (leader|team|org|function)\b|\bvp (of )?cs\b|\bchurn\b|\bretention\b|\brenewals?\b|\bnrr\b|\bnet revenue retention\b|\bexpansion (revenue|motion)\b|\bupsell(ing)?\b|\baccount management\b|\bonboarding customers\b/],
    ['ai_gtm', /\bai (gtm|sdrs?|agents?|automation|workflows?|outbound|prospecting)\b|\bclay\b|\bgtm engineer(ing)?\b|\bautomat(e|ion|ing) (our )?(outbound|prospecting|gtm|workflows|lead gen|enrichment)\b|\bn8n\b|\benrichment\b/],
    ['partnerships', /\bpartnerships?\b|\bpartner (program|channel|ecosystem|sales|revenue)\b|\bchannel (partners?|program|sales|strategy)\b|\bresellers?\b|\balliances?\b|\bco-?sell(ing)?\b|\bmarketplaces? (listing|gtm)\b/],
    ['sellers', /\b(a|an|one|fractional|part[- ]time|experienced|senior)\s+(ae|account executive|sdr|bdr|closer|seller|sales ?rep|salesperson)\b|\bsomeone to (close|sell|prospect|book meetings)\b|\bcommission[- ]only\b/],
  ];

  /* ---------- What the client needs (RN.fields.need), for the intro sheet ---------- */
  const NEED_CUES = [
    ['team', /\bhire\b.*\b(reps|aes|sellers|salespeople|sdrs|team)\b|\bbuild (out )?(a |our |the )?(sales )?team\b|\bramp\b/],
    ['sales_motion', /\bfounder[- ]led\b|\brepeatable\b|\bsales (process|motion|playbook)\b|\bfounders? (is |are )?(still )?(selling|closing)\b/],
    ['pipeline', /\bpipeline\b|\bleads?\b|\bmeetings (booked|a month)\b|\bdemand\b|\boutbound\b/],
    ['systems', /\bcrm\b|\bhubspot\b|\bsalesforce\b|\breporting\b|\bforecast(ing)?\b|\bdashboards?\b|\bdata\b/],
    ['ai', /\bai\b|\bautomat(e|ion)\b|\bclay\b/],
    ['retention', /\bchurn\b|\bretention\b|\brenewals?\b|\bexpansion\b|\bnrr\b/],
    ['partners', /\bpartner|\bchannel\b|\bresellers?\b/],
  ];

  /* ---------- Industries: registry values plus the way people say them ---------- */
  const IND_ALIASES = [
    ['Saas', /\b(b2b )?saas\b|\bsoftware[- ]as[- ]a[- ]service\b|\bsoftware (company|startup|business)\b/],
    ['Health Care', /\bhealth ?care\b|\bhealth ?tech\b|\bhospitals?\b|\bclinics?\b|\bmedical (practice|group)s?\b|\bdental\b|\bprovider groups?\b/],
    ['Medical Devices & Diagnostics', /\bmed ?tech\b|\bmedical devices?\b|\bdiagnostics\b/],
    ['Pharma & Biotech', /\bpharma(ceutical)?s?\b|\bbiotech\b|\blife sciences\b|\bclinical trials?\b/],
    ['Fintech', /\bfin ?tech\b|\bpayments? (company|startup|platform)\b|\bfinancial technology\b/],
    ['Banking & Credit Unions', /\bbank(ing|s)?\b|\bcredit unions?\b/],
    ['Wealth Management & Advisory', /\bwealth management\b|\bfinancial advisors?\b|\bria\b/],
    ['Cybersecurity', /\bcyber ?security\b|\bsecurity (software|company|startup|vendor)\b|\bcyber\b/],
    ['Deep Tech / AI', /\b(ai|artificial intelligence|deep tech|machine learning|ml) (company|startup|platform|product)\b/],
    ['E Commerce & D2c', /\be-?commerce\b|\bonline store\b|\bdtc\b|\bd2c\b|\bdirect[- ]to[- ]consumer\b|\bshopify\b/],
    ['Industrial Manufacturing', /\bmanufactur(ing|er|ers)\b|\bfactory\b|\bindustrial\b/],
    ['Industrial Distribution', /\bdistribut(or|ors|ion)\b|\bwholesale\b/],
    ['Freight & Trucking', /\blogistics\b|\bfreight\b|\btrucking\b|\b3pl\b|\bsupply chain\b|\bshipping\b/],
    ['Commercial Real Estate', /\b(commercial )?real estate\b|\bcre\b|\bproptech\b/],
    ['Property Management', /\bproperty management\b|\bproperty managers?\b/],
    ['General Contractors & Builders', /\bconstruction\b|\b(general )?contractors?\b|\bbuilders?\b/],
    ['Home Services', /\bhome services?\b|\bhvac\b|\bplumbing\b|\broofing\b/],
    ['Edtech', /\bed ?tech\b|\beducation technology\b|\blearning platform\b/],
    ['Higher Education', /\bhigher ed(ucation)?\b|\buniversit(y|ies)\b|\bcolleges?\b/],
    ['Education', /\bk-?12\b|\bschools?\b|\beducation\b/],
    ['Corporate Learning & Training', /\bcorporate (learning|training)\b|\bl&d\b/],
    ['Staffing & Recruiting', /\bstaffing\b|\brecruiting (firm|agency|company)\b|\brecruitment agency\b/],
    ['Marketplace', /\bmarketplace (company|startup|platform|business)\b|\btwo[- ]sided marketplace\b|\bmarketplace\b(?! listing)/],
    ['It Services', /\bit services\b|\bmsps?\b|\bmanaged services?\b|\bit consulting\b/],
    ['Developer Tools', /\bdev ?tools?\b|\bdeveloper (tools|platform|tooling)\b|\bapi (company|platform)\b/],
    ['Data & Analytics', /\b(data|analytics) (company|platform|startup|product)\b|\bdata infrastructure\b/],
    ['Hardware / Iot', /\bhardware\b|\biot\b|\bdevices\b|\bsensors?\b/],
    ['Advertising & Media Agencies', /\b(ad|advertising|marketing|creative|media|digital) agency\b|\bagencies\b/],
    ['Media & Content', /\bmedia (company|startup|brand)\b|\bpublish(ing|er)\b|\bcontent (company|business)\b/],
    ['Law Firms & Legal Departments', /\blaw firms?\b|\blegal (tech|department|services)\b|\blegaltech\b/],
    ['Consulting & Advisory', /\bconsulting (firm|company|business)\b|\bconsultancy\b/],
    ['Professional Services', /\bprofessional services\b|\baccounting firm\b|\bservices firm\b/],
    ['Nonprofit & Associations', /\bnon-?profits?\b|\bassociations?\b|\bfoundations?\b/],
    ['Consumer Goods & Cpg (non Food)', /\bcpg\b|\bconsumer (goods|products|brand)\b/],
    ['Food & Beverage Cpg', /\bfood (and|&) beverage\b|\bf&b\b|\bbeverage (brand|company)\b|\bfood (brand|company)\b/],
    ['Brick & Mortar Retail', /\bretail(er|ers)?\b|\bstores\b/],
    ['Oil & Gas', /\boil (and|&) gas\b|\benergy (company|services)\b/],
    ['Travel & Tourism', /\btravel\b|\bhospitality\b|\btourism\b|\bhotels?\b/],
    ['Fitness & Wellness', /\bfitness\b|\bwellness\b|\bgyms?\b/],
    ['State & Local Government', /\bgovernment\b|\bpublic sector\b|\bmunicipal\b|\bgovtech\b/],
    ['Enterprise Software', /\benterprise software\b/],
    ['SMB Software', /\bsmb software\b|\bsoftware for small businesses\b/],
    ['Farming & Agribusiness', /\bag ?tech\b|\bagricultur(e|al)\b|\bfarming\b|\bagribusiness\b/],
    ['Private Equity & Venture Capital', /\b(pe|private equity|vc|venture capital) firm\b/],
    ['Sports, Events & Live Entertainment', /\bsports\b|\bevents company\b|\blive entertainment\b|\bticketing\b/],
  ];

  /* ---------- Focus-area keywords kept as search words (soft match on operators' tags and profiles) ---------- */
  const TOPICS = [
    ['HubSpot', /\bhubspot\b/], ['Salesforce', /\bsalesforce\b|\bsfdc\b/], ['Pipedrive', /\bpipedrive\b/], ['outbound', /\boutbound\b|\bcold (email|calling|outreach)\b/],
    ['ABM', /\babm\b|\baccount[- ]based\b/], ['playbook', /\bplaybook\b/], ['founder-led', /\bfounder[- ]led\b|\bfounders? (is |are )?(still )?(selling|closing|doing (all )?(the )?sales)\b/], ['forecast', /\bforecast(ing|s)?\b/],
    ['onboarding', /\bonboarding\b/], ['Clay', /\bclay\b/], ['PLG', /\bplg\b|\bproduct[- ]led\b/], ['pricing', /\bpricing\b|\bpackaging\b/],
    ['churn', /\bchurn\b/], ['channel', /\bchannel partners?\b|\bresellers?\b/], ['MEDDPICC', /\bmeddpicc\b|\bmeddic\b/], ['compensation', /\bcomp plans?\b|\bcompensation\b|\bcommission plans?\b/],
  ];

  const REV_SLUG = (usd) => (usd < 1e6 ? 'under_1m' : usd < 5e6 ? '1m_5m' : usd < 20e6 ? '5m_20m' : usd < 50e6 ? '20m_50m' : '50m_plus');
  const EMP_SLUG = (n) => (n <= 10 ? '1_10' : n <= 50 ? '11_50' : n <= 200 ? '51_200' : n <= 500 ? '201_500' : n <= 1000 ? '501_1000' : '1001_plus');
  const HOURS_FLOOR = (h) => { const codes = [20, 40, 60, 80, 100, 160].filter((c) => c <= h + 0.5); return codes.length ? String(codes[codes.length - 1]) : null; };
  const MULT = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

  M.understand = function (text) {
    const raw = String(text || '').trim();
    const t = ' ' + raw.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ') + ' ';
    const facts = [];
    const add = (k, v, label, src) => { if (!facts.some((f) => f.k === k && JSON.stringify(f.v) === JSON.stringify(v))) facts.push({ k, v, label, src: src || '' }); };
    const words = raw.split(/\s+/).filter(Boolean);

    // Role categories (OR). A request to build or lead a team is leadership, not an individual seller.
    const cats = ROLE_CUES.filter(([, re]) => has(t, re)).map(([c]) => c);
    if (cats.length) add('roleCategories', cats.slice(0, 3), cats.slice(0, 3).map((c) => F.catLabel(c)).join(' or '));

    // Industries (OR, up to 3): registry labels first, then aliases
    const inds = [];
    F.industries.options.forEach((o) => { const l = o.l.toLowerCase(); if (l.length > 3 && t.includes(' ' + l + ' ') && !inds.includes(o.v)) inds.push(o.v); });
    IND_ALIASES.forEach(([v, re]) => { if (has(t, re) && !inds.includes(v) && F.industries.options.some((o) => o.v === v)) inds.push(v); });
    if (inds.length) add('industries', inds.slice(0, 3), inds.slice(0, 3).map((v) => RN.w.label('industries', v)).join(' or '));

    // Money, headcount and time: read each number with the words around it
    const re = /(\$)?\s?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|mm|m|mil|million|bn|b|billion)?(?![a-z0-9])/g;
    let m;
    while ((m = re.exec(t))) {
      const dollar = !!m[1];
      const n = num(m[2]) * (m[3] ? MULT[m[3]] : 1);
      const after = t.slice(re.lastIndex, re.lastIndex + 32);
      const before = t.slice(Math.max(0, m.index - 28), m.index);
      if (/^\s*%|^\s*percent/.test(after)) continue;
      if (/^\s*(\+\s*)?(employees|people|staff|person|ftes?|headcount|team members|-person|-employee|person company)\b/.test(after) || /\b(headcount|team) of\s*$/.test(before) && !/sales team of\s*$/.test(before)) {
        if (n >= 1 && n < 100000) add('employeeRange', [EMP_SLUG(n)], `${RN.w.label('employeeRange', EMP_SLUG(n))} employees`, m[0].trim() + ' ' + after.trim().split(' ')[0]);
        continue;
      }
      if (/^\s*(\/|per|an?|each)\s*(hr|hour)\b|^\s*hourly\b/.test(after) || (/\b(rate|hourly)\b[^.]{0,12}$/.test(before) && n < 1000)) {
        if (n >= 50 && n < 2000) add('rateMax', Math.round(n), `Up to $${Math.round(n)}/hr`, m[0].trim() + ' an hour');
        continue;
      }
      if (/^\s*(\/|per|a|each)\s*(mo|month)\b|^\s*monthly\b|^\s*(\/|per|a)\s*week\b/.test(after) && dollar) { add('_budgetMonth', n * (/week/.test(after.slice(0, 12)) ? 4.33 : 1), '', m[0].trim()); continue; }
      if (/^\s*(hours|hrs|hr|h)\b/.test(after)) {
        const per = /^\s*(hours|hrs|hr|h)\s*(a|per|\/|each|every)?\s*(week|wk)/.test(after) ? 4.33 : 1;
        add('_hours', Math.round(n * per), '', m[0].trim());
        continue;
      }
      if (/^\s*(days|day)\s*(a|per|\/|each)\s*(week|wk)/.test(after)) { add('_hours', Math.round(n * 8 * 4.33), '', m[0].trim() + ' days a week'); continue; }
      const revCue = /^\s*(in\s+)?(arr|revenue|run[- ]rate|in sales|top[- ]line|annual|a year|per year|\/yr|bookings|mrr)\b/.test(after) || /\b(arr|revenue|run rate|doing|at|making|sales of|revenue of|arr of)\s*(of\s*)?(about|around|roughly|~|over|under|nearly|almost)?\s*$/.test(before);
      const big = (m[3] && /m|mm|mil|million|b|bn|billion/.test(m[3])) || (dollar && n >= 1e6);
      if (revCue || big) {
        let usd = n;
        if (/^\s*mrr\b/.test(after)) usd = n * 12;
        if (usd >= 1e5) add('revenueRange', [REV_SLUG(usd)], `${RN.w.label('revenueRange', REV_SLUG(usd))} revenue`, m[0].trim());
      }
    }
    if (/\bpre[- ]?revenue\b|\bno revenue yet\b|\bpre-launch\b/.test(t)) add('revenueRange', ['pre_revenue'], 'Pre-revenue', 'pre-revenue');
    // Headcount in words ("a team of about eighty" is rare; common phrasing is handled above)

    // Time: days or hours a week in words, or common shorthands
    const dw = t.match(/\b(one|two|three|four|a couple of|a couple|couple|a few|few|half a|\d)\s+days?\s*(a|per|\/|each)\s*week\b/);
    if (dw && !facts.some((f) => f.k === '_hours')) { const d = /half/.test(dw[1]) ? 0.5 : num(dw[1]); add('_hours', Math.round(d * 8 * 4.33), '', dw[0].trim()); }
    const hw = t.match(/\b(ten|twenty|thirty|forty|a few|few)\s+hours?\s*(a|per|\/|each)\s*(week|month)\b/);
    if (hw && !facts.some((f) => f.k === '_hours')) add('_hours', Math.round(num(hw[1]) * (hw[3] === 'week' ? 4.33 : 1)), '', hw[0].trim());
    if (/\bhalf[- ]time\b/.test(t) && !facts.some((f) => f.k === '_hours')) add('_hours', 80, '', 'half-time');
    if (/\bfull[- ]time\b/.test(t) && !/\bfull[- ]time (hire|employee|role|leader|person)\b|\binstead of (a )?full[- ]time\b|\bbefore (we )?(hire|hiring) (a )?full[- ]time\b|\bnot ready (for|to hire) (a )?full[- ]time\b/.test(t) && !facts.some((f) => f.k === '_hours')) add('_hours', 160, '', 'full-time');
    const hrs = (facts.find((f) => f.k === '_hours') || {}).v;
    if (hrs) { const code = HOURS_FLOOR(hrs); if (code) add('hoursPerMonth', [code], `At least ${RN.w.label('hoursPerMonth', code)}`, (facts.find((f) => f.k === '_hours') || {}).src); }

    // A monthly budget becomes an hourly cap once hours are known (operator rate = budget x 0.75 / hours)
    const bud = (facts.find((f) => f.k === '_budgetMonth') || {}).v;
    if (bud && hrs && !facts.some((f) => f.k === 'rateMax')) {
      const cap = Math.round((bud * 0.75) / hrs / 5) * 5;
      if (cap >= 50) add('rateMax', cap, `Up to $${cap}/hr operator rate (from ${RN.fmt.usd(Math.round(bud))}/mo at ${hrs} hrs)`, '');
    }

    // Start date
    if (/\b(asap|a\.s\.a\.p|immediately|right away|right now|urgent(ly)?|this week|start now|yesterday|as soon as possible)\b/.test(t)) add('availability', ['available_now'], 'Available now', 'asap');
    else if (/\b(in|within|next) (two|2|a couple of|couple of|a couple) weeks\b|\bnext week\b|\bin a week\b|\bby (the )?(1st|first|middle|mid)\b/.test(t)) add('availability', ['available_now', 'available_2_weeks'], 'Available within 2 weeks', 'within two weeks');

    // Engagement type ("fractional" is the default everyone says, so it is not a filter)
    const eng = [];
    if (/\binterim\b/.test(t)) eng.push('interim');
    if (/\badvis(or|ory|er|ing)\b|\bsounding board\b|\bcoach (me|our ceo|the founder)\b/.test(t)) eng.push('advisory');
    if (/\b(a |one[- ]time |scoped |fixed[- ]scope )project\b|\bone[- ]off\b|\baudit\b/.test(t)) eng.push('project');
    if (eng.length) add('engagementTypes', eng, eng.map((e) => RN.w.label('engagementType', e)).join(' or '));

    // What they need (feeds the intro sheet); focus-area keywords stay as search words
    const need = (NEED_CUES.find(([, r]) => has(t, r)) || [])[0] || '';
    const topics = TOPICS.filter(([, r]) => has(t, r)).map(([w]) => w).slice(0, 2);
    if (topics.length) add('q', topics.join(' '), 'Focus: ' + topics.join(', '));

    const pub = facts.filter((f) => !f.k.startsWith('_'));
    const cues = /\b(we|we're|we are|our|i|i'm|i am|my|us|looking|need|needs|want|hire|hiring|help|someone|somebody|who can|company|startup|business|team)\b/.test(t);
    const natural = (pub.length >= 2 && words.length >= 3) || (cues && words.length >= 5) || (pub.length >= 1 && words.length >= 6);
    const filters = {};
    pub.filter((f) => f.k !== 'q').forEach((f) => { filters[f.k] = f.v; });
    return { natural, facts: pub, filters, q: (pub.find((f) => f.k === 'q') || {}).v || '', need };
  };

  /* Applies the reading to search. If the full reading leaves no operator, it drops the least important parts
     (keywords, rate, time, engagement type, start date, employees, revenue, industry) until operators match, and
     reports what it left out. Role category is never dropped. base: filters the client set by hand. */
  const DROP_ORDER = ['q', 'rateMax', 'hoursPerMonth', 'engagementTypes', 'availability', 'employeeRange', 'revenueRange', 'industries'];
  M.understandSearch = function (text, base) {
    const u = M.understand(text);
    const filters = Object.assign({}, base || {}, u.filters);
    let q = u.q;
    const dropped = [];
    const count = (qq, ff) => M.search({ q: qq, filters: ff }).length;
    const present = (k) => u.facts.some((f) => f.k === k) && !dropped.some((f) => f.k === k);
    const without = (k) => { const ff = Object.assign({}, filters); if (k !== 'q') delete ff[k]; return count(k === 'q' ? '' : q, ff); };
    // Keep as much of the request as possible: drop the least important single part that brings operators back,
    // otherwise drop the least important part and try again
    while (count(q, filters) === 0) {
      const cands = DROP_ORDER.filter(present);
      if (!cands.length) break;
      const k = cands.find((x) => without(x) > 0) || cands[0];
      if (k === 'q') q = ''; else delete filters[k];
      dropped.push(u.facts.find((f) => f.k === k));
    }
    return Object.assign(u, { applied: { q, filters }, dropped, keys: Object.keys(u.filters).filter((k) => k in filters) });
  };
})();
