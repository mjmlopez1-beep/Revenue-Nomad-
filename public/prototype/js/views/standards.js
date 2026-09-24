/* Field standards: living documentation of the field registry for the product and dev team.
   Renders RN.fields directly, so it can never drift from what the prototype uses. Also lists the
   decisions taken while merging and where each open Product Feedback item is solved. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;

  const GROUPS = [
    { t: 'Role', keys: ['roleCategory', 'role'], used: 'Intake, Studio profile, Browse filter (up to 5, OR), project posting, compare, Rate Index, report cuts' },
    { t: 'Availability and engagement', keys: ['availability', 'startDate', 'hoursPerMonth', 'newClientCapacity', 'engagementTypes', 'rate', 'term', 'startBy', 'projectBudget'], used: 'Intake, profile Engage card, Browse filters, intro request, project posting, compare, Rate Index estimator' },
    { t: 'Company fit', keys: ['revenueRange', 'employeeRange', 'companyRevenue', 'companyEmployees', 'industries'], used: 'Operator intake (up to 3 ranges, 10 industries), client company profile (one each), Browse filters, intro request, project posting, match signals, Studio who-viewed segments, report cuts' },
    { t: 'GTM approach', keys: ['salesMotions', 'methodologies', 'crm', 'techStack'], used: 'Intake, profile, compare, match signals, client match preferences' },
    { t: 'Role details (bar scales use bold label + grey help, comment E397)', keys: ['stackComplexity', 'codeCapability', 'automationScale', 'stackProficiency', 'largestTeamManaged', 'largestTeamQuota', 'salesCycle', 'largestBudget', 'channelsRun', 'builtFromZero', 'largestRepCount', 'enablementFocus', 'audienceSpecialty', 'bestNrr', 'largestArrBook', 'csMotion', 'aiSpecialization', 'partnershipMotion', 'partnerRevenue', 'individualQuota', 'avgDealSize', 'commissionOnly'], used: 'Intake step for the chosen role category, profile Operating range, compare' },
    { t: 'Reputation and reviews', keys: ['risTier', 'risFactors', 'coreDims', 'overallExperience', 'hireAgain', 'reviewStatus', 'outcomeRating', 'risMin'], used: 'Profile, cards, Studio credibility, review page, Levels, Browse filter (70+, 80+, 90+)' },
    { t: 'Intros and projects', keys: ['need', 'introStatus', 'projectStatus'], used: 'Intro sheet, client workspace, Studio inbox, Admin intro lifecycle, project pages' },
    { t: 'Identity and location', keys: ['fullName', 'email', 'linkedin', 'headline', 'bio', 'country', 'postalCode', 'usHours'], used: 'Intake, Studio profile, intro sheet for visitors' },
  ];

  const DECISIONS = [
    ['Three Reputation Index ladders and different labels for operators and clients (sheet L247, explorer, live data, comment H390)', 'One ladder derived from the score everywhere: Indexing below 50 (before approval), Vetted 50–59, Proven 60–69, Trusted 70–79, Elite 80–89, Apex 90–100.'],
    ['"Verified" shown at score 50 on 78 of 100 live profiles with no client evidence', 'Entry tier is "Vetted". "Verified" is reserved for client-confirmed proof: verified fit tags and verified engagements.'],
    ['Intro start timeline ASAP / 2 Weeks / 1+ Month vs availability chips', 'The client\'s start timeline uses the availability values, so requests match availability with no translation.'],
    ['Review form Project / Retainer and LinkedIn company size bands', 'Review form uses the four engagement types and the standard employee ranges.'],
    ['Hours stored as raw numbers (legacy 5, 10, 15, 30)', 'Stored as chip codes: 19 (<20), 20, 40, 60, 80, 100, 160 hrs / month.'],
    ['Three hours presets in the Projects prototype', 'Projects use the same Available time chips as operators.'],
    ['Tool proficiency "Builder" vs "Power User"', 'Power User, as in intake and comment E397.'],
    ['Focus area filter OR vs AND', 'AND for focus areas (up to 5). OR within role categories (up to 5) and industries (up to 3). AND across filters.'],
    ['GTM motion with or without "Direct"', 'Four options: PLG, Channel, Inside Sales, Enterprise Sales. "Direct" was never confirmed.'],
    ['Three "strong fit" thresholds in the Projects prototype', 'One fit system (5 match signals): Strong match 75+, Good match 50+, everywhere.'],
    ['Who viewed your profile', 'Firmographic segments only (industry, company revenue, employee range). Segments under 5 visits are grouped. No company or person names.'],
    ['Buyer vs client wording', 'Client or company in every screen (L168). Clients see fit tags as "Focus areas" (L131).'],
    ['Platform fee in the Projects prototype (25%)', 'Kept in project flows and labelled: clients see an all-in rate, operators see take-home. Profiles show the operator\'s own rate. Confirm before launch.'],
  ];

  // Open items from the Product Feedback sheet and where this prototype shows them solved
  const SCOPE = [
    ['E397 (Sep 23)', 'Bar scales with bold label and grey help text: stack complexity, code capability, automation scale, tool proficiency', '#join.operator', 'Operator intake, role details step'],
    ['E479 (Sep 23)', 'Inline search inside the tag picker when adding more tags', '#browse', 'Browse and homepage focus area picker'],
    ['E486 (Sep 23)', 'Operators see two review states only: Sent and Completed', '#studio.credibility', 'Studio, Credibility'],
    ['E418 (Sep 23)', 'Client-facing Reputation Index explainer: "How score is calculated" with the five factors', '#levels', 'Profile rail, cards and Levels'],
    ['H390', 'Reputation Index floor of 50, one status label for operator and client, no [object Object] tile', '#op.matt-lopez', 'Profile and Studio use one derived label'],
    ['D371', 'Work samples show on profiles', '#op.matt-lopez', 'Profile Portfolio section'],
    ['D361', '$50M+ revenue option in client filters', '#browse', 'Browse filter uses the same revenue ranges as intake'],
    ['H328', 'Save the profile, then a landing page that explains review and when the profile goes live', '#join.done', 'After-submit page'],
    ['L42', 'Shortlist appearances instead of search appearances', '#studio', 'Studio overview KPIs'],
    ['L48', 'Demand signal feed, Reputation Index breakdown card, recent activity timeline', '#studio', 'Studio overview'],
    ['L44', 'Reviewer name captured when a review is requested', '#studio.credibility', 'Request a review form'],
    ['L369', 'Intro requests are blind to operators until introduced', '#studio.inbox', 'Studio inbox'],
    ['L471 (Hold)', 'Intro lifecycle: Pending, Interested, RN Qualified, Introduced, Hired', '#admin.intros', 'Admin and client workspace'],
    ['L383 (Deferred)', 'Weekly "you appeared in N searches" email', '#studio', 'Studio digest preview and Outbox'],
    ['AP-23', 'Performance and Insights for operators', '#studio.visibility', 'Who viewed you'],
    ['AP-27', 'Demand intelligence', '#admin.demand', 'Admin demand, Studio positioning'],
    ['AP-05 / AP-21', 'Normalized search terms, zero-result searches, client funnel', '#admin.demand', 'Admin demand'],
    ['AP-25', 'Client firmographics use the operator intake picklists exactly', '#buyer.company', 'Client company profile and intro sheet'],
    ['L310 (Hold)', 'Leave a Review button', '#op.matt-lopez', 'Review requests via Studio and the review page'],
    ['L1-L60 intake items', 'Revenue and employee ranges up to 3, industries up to 10, new client capacity 1–10, location from postal code', '#join.operator', 'Operator intake'],
  ];

  RN.view('standards', {
    route: 'standards', nav: '',
    title: () => 'Field standards',
    render() {
      const optList = (d) => (d.options || []).slice(0, 60).map((o) => `<span class="std-opt"><span class="mono">${esc(o.v)}</span><span>${esc(o.l)}</span></span>`).join('');
      const fieldRow = (key) => {
        const d = RN.fields[key];
        if (!d) return '';
        const limits = [d.max ? `Up to ${d.max}` : '', d.min != null && d.type === 'number' ? `Min ${d.min}` : '', d.unit ? esc(d.unit) : ''].filter(Boolean).join(' · ');
        return `<tr><td><b>${esc(d.label)}</b><div class="mono tiny faint">${esc(key)}</div></td><td class="tiny">${esc(d.type)}${limits ? `<div class="faint">${limits}</div>` : ''}</td>
          <td>${d.options && d.options.length ? `<div class="std-opts">${optList(d)}${d.options.length > 60 ? `<span class="tiny muted">+${d.options.length - 60} more</span>` : ''}</div>` : `<span class="small muted">${esc(d.help || 'Free input')}</span>`}</td></tr>`;
      };
      return `<section class="wrap phead">
        <span class="eyebrow">For the product and dev team</span>
        <h1 class="h1">Field standards</h1>
        <p class="lede">Every picklist in this prototype renders from one registry (<span class="mono">js/data/fields.js</span>). Operator intake is the source of truth; filters, projects, intros, reviews, Studio and research reuse the same values, so workflows line up without translation.</p>
        <div class="row" style="margin-top:20px"><a class="btn btn-sm" data-act="std-jump" data-to="std-fields" href="#std-fields">Fields</a><a class="btn btn-line btn-sm" href="#std-decisions" data-act="std-jump" data-to="std-decisions">Decisions to confirm</a><a class="btn btn-line btn-sm" data-act="std-jump" data-to="std-scope" href="#std-scope">Open scope shown solved</a></div>
      </section>
      <section class="wrap" id="std-fields">
        ${GROUPS.map((g) => `<div class="card std-group"><div class="card-hd"><div><h2 class="h4">${esc(g.t)}</h2><p class="sub">Used in: ${esc(g.used)}</p></div></div>
          <div class="tbl-wrap"><table class="tbl std-tbl"><thead><tr><th>Field</th><th>Type</th><th>Values (stored → shown)</th></tr></thead><tbody>${g.keys.map(fieldRow).join('')}</tbody></table></div></div>`).join('')}
        <div class="card std-group"><div class="card-hd"><div><h2 class="h4">Role details by category</h2><p class="sub">Which role-detail fields each category collects in intake and shows on the profile.</p></div></div>
          <div class="tbl-wrap"><table class="tbl"><tbody>${Object.keys(RN.fields.roleFields).map((k) => `<tr><td><b>${esc(RN.fields.catLabel(k))}</b></td><td class="small">${RN.fields.roleFields[k].map((f) => esc(RN.fields[f].label)).join(' · ')}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card std-group"><div class="card-hd"><div><h2 class="h4">Fit tag library</h2><p class="sub">${RN.fmt.int(RN.fields.fitTags.options.length)} tags in this prototype (the live taxonomy has 1,182). Up to 25 self-claimed per operator. Verified at the first client review rated 4.0+, Expert from the fifth.</p></div><a class="btn btn-line btn-sm" href="#library">Open the library</a></div></div>
      </section>
      <section class="wrap section-sm" id="std-decisions">
        <h2 class="h2">Decisions to confirm</h2>
        <p class="lede" style="margin-top:10px">Conflicts found across the prototypes, the live data and the Product Feedback sheet, and how this prototype resolves them.</p>
        <div class="tbl-wrap card" style="margin-top:24px;padding:8px 16px"><table class="tbl"><thead><tr><th>Conflict</th><th>Decision in this prototype</th></tr></thead><tbody>${DECISIONS.map((d) => `<tr><td class="small">${esc(d[0])}</td><td class="small"><b>${esc(d[1])}</b></td></tr>`).join('')}</tbody></table></div>
      </section>
      <section class="wrap section-sm" id="std-scope">
        <h2 class="h2">Open scope shown solved</h2>
        <p class="lede" style="margin-top:10px">Items that are open, on hold or reopened in the Product Feedback sheet, and where to see them working here.</p>
        <div class="tbl-wrap card" style="margin-top:24px;padding:8px 16px"><table class="tbl"><thead><tr><th>Sheet ref</th><th>Item</th><th>See it</th></tr></thead><tbody>${SCOPE.map((s) => `<tr><td class="mono small nowrap">${esc(s[0])}</td><td class="small">${esc(s[1])}</td><td class="small"><a class="link" href="${esc(s[2])}">${esc(s[3])}</a></td></tr>`).join('')}</tbody></table></div>
      </section>`;
    },
  });
  RN.actions['std-jump'] = (el) => { const t = document.getElementById(el.dataset.to); if (t) t.scrollIntoView({ behavior: 'smooth' }); };
})();
