/* RN.fields: the ONE definition of every standard field and picklist.
   Source of truth, in priority order:
     1. Live operator signup ("Operator's flow will be our source of truth", Product Feedback L207)
     2. Decisions in the Product Feedback sheet (row refs in comments)
     3. The live-data export behind the Operator Profile Explorer
   Stored values are the live values/slugs so prototype data lines up with the platform.
   Views never define options themselves: render with RN.w.field(key) and display with RN.w.label(key, v). */
(function () {
  'use strict';
  const RN = window.RN;
  const F = (RN.fields = {});
  const opts = (arr) => arr.map((x) => (Array.isArray(x) ? { v: x[0], l: x[1], d: x[2] } : typeof x === 'string' ? { v: x, l: x } : x));

  /* ---------- Role ---------- */
  F.roleCategory = {
    label: 'Role category', type: 'single',
    help: 'The discipline you lead. It sets which role details we ask for and where you appear in search.',
    options: opts([
      ['sales_leadership', 'Sales Leadership'],
      ['marketing', 'Marketing'],
      ['revenue_operations', 'Revenue Operations'],
      ['sales_enablement', 'Sales Enablement'],
      ['customer_success_growth', 'Customer Success & Growth'],
      ['ai_gtm', 'AI GTM'],
      ['partnerships', 'Partnerships'],
      ['sellers', 'Sellers'],
    ]),
  };
  // Browse filter uses the same categories; roles are OR, everything else AND (L210); up to 5 roles (L201)
  F.roleCategories = Object.assign({}, F.roleCategory, { type: 'multi', max: 5, label: 'Role category', help: 'Pick up to 5. Operators matching any selected role are shown.' });

  // Titles per category. Sellers add SDR and Account Manager (L371); CS&G drops Director CS/Growth (L372); AI GTM Architect exists (L347)
  F.rolesByCat = {
    sales_leadership: ['Chief Revenue Officer', 'VP of Sales', 'Sales Manager'],
    marketing: ['Chief Marketing Officer', 'VP of Marketing', 'Marketing Operations'],
    revenue_operations: ['VP of Revenue Operations', 'RevOps Manager', 'Sales Operations'],
    sales_enablement: ['VP of Sales Enablement', 'Director of Enablement', 'Sales Trainer'],
    customer_success_growth: ['VP of Customer Success', 'VP of Growth'],
    ai_gtm: ['AI GTM Architect', 'AI GTM Engineer'],
    partnerships: ['VP of Partnerships'],
    sellers: ['Account Executive', 'SDR', 'Account Manager'],
  };
  F.role = {
    label: 'Role', type: 'select', placeholder: 'Select your role',
    options: opts(Object.values(F.rolesByCat).flat()),
  };
  F.catColor = (cat) => ({
    sales_leadership: 'var(--cat-sales)', marketing: 'var(--cat-mkt)', revenue_operations: 'var(--cat-revops)', sales_enablement: 'var(--cat-enable)',
    customer_success_growth: 'var(--cat-cs)', ai_gtm: 'var(--cat-ai)', partnerships: 'var(--cat-partner)', sellers: 'var(--cat-sellers)',
  }[F.catKey(cat)] || 'var(--accent)');
  F.catKey = (cat) => { const o = F.roleCategory.options.find((x) => x.v === cat || x.l === cat); return o ? o.v : cat; };
  F.catLabel = (cat) => { const o = F.roleCategory.options.find((x) => x.v === cat || x.l === cat); return o ? o.l : cat; };

  /* ---------- Availability (Sheet3 #1, #4, #6, #8; L189) ---------- */
  F.availability = {
    label: 'Availability', type: 'single',
    options: opts([
      ['available_now', 'Available now'],
      ['available_2_weeks', 'Available in 2 weeks'],
      ['available_2_plus_weeks', 'Available in 2+ weeks'],
    ]),
  };
  F.startDate = { label: 'Next available start date', type: 'date' };
  // Stored codes match the live data (19 is the code for "<20", Sheet3 #4). Label "Available time" (Sheet3 #4 rename).
  F.hoursPerMonth = {
    label: 'Available time', type: 'single', unit: 'hrs / month',
    help: 'Hours per month you can give a new client.',
    options: opts([
      ['19', '<20 hrs / month'], ['20', '20 hrs / month'], ['40', '40 hrs / month'], ['60', '60 hrs / month'],
      ['80', '80 hrs / month'], ['100', '100 hrs / month'], ['160', '160 hrs / month'],
    ]),
  };
  F.hoursCode = (n) => { n = +n || 0; return n < 20 ? '19' : n < 40 ? '20' : n < 60 ? '40' : n < 80 ? '60' : n < 100 ? '80' : n < 160 ? '100' : '160'; };
  F.newClientCapacity = { label: 'New client capacity', type: 'number', min: 1, max: 10, unit: 'clients', help: 'Maximum 10 clients.' };
  // L192 order; "turnaround" removed, "fractional" and "project" added (row 23)
  F.engagementTypes = {
    label: 'Engagement type', type: 'multi',
    options: opts([
      ['advisory', 'Advisory', 'A few hours a month of senior guidance to the founder or team.'],
      ['interim', 'Interim', 'Covers a leadership seat full time while you hire.'],
      ['fractional', 'Fractional', 'Owns the function part time on an ongoing basis.'],
      ['project', 'Project', 'A scoped build with a defined outcome and end date.'],
    ]),
  };
  F.engagementType = Object.assign({}, F.engagementTypes, { type: 'single', label: 'Engagement type' });
  F.rate = { label: 'Hourly rate', type: 'money', unit: '/ hr', min: 50, step: 5, help: 'Shown on your profile and used in the Rate Index benchmark.' };
  // One range control for rate filters (L205)
  F.rateMax = { label: 'Hourly rate up to', type: 'number', min: 100, max: 400, unit: '/ hr' };
  F.term = {
    label: 'Initial term', type: 'single',
    options: opts([['1_3', '1 to 3 months'], ['3_6', '3 to 6 months'], ['6_12', '6 to 12 months'], ['12_plus', '12+ months']]),
  };

  /* ---------- Company fit (operators pick up to 3 each; companies pick one) ---------- */
  // L190: Pre-revenue, Under $1M, $1M–$5M, $5M–$20M, $20M–$50M, $50M+ ("range", never "bucket", row 11)
  F.revenueRange = {
    label: 'Revenue range', type: 'multi', max: 3,
    help: 'Company revenue ranges where you do your best work.',
    options: opts([
      ['pre_revenue', 'Pre-revenue'], ['under_1m', 'Under $1M'], ['1m_5m', '$1M–$5M'],
      ['5m_20m', '$5M–$20M'], ['20m_50m', '$20M–$50M'], ['50m_plus', '$50M+'],
    ]),
  };
  F.employeeRange = {
    label: 'Employee range', type: 'multi', max: 3,
    help: 'Company sizes where you do your best work.',
    options: opts([
      ['1_10', '1–10'], ['11_50', '11–50'], ['51_200', '51–200'], ['201_500', '201–500'], ['501_1000', '501–1,000'], ['1001_plus', '1,000+'],
    ]),
  };
  F.companyRevenue = Object.assign({}, F.revenueRange, { type: 'single', max: null, label: 'Revenue range', help: 'Your company’s annual revenue.' });
  F.companyEmployees = Object.assign({}, F.employeeRange, { type: 'single', max: null, label: 'Employee range', help: 'Your company’s headcount.' });

  // Stored values are the live strings; labels fix casing (L352: IoT, B2C...). The live masterlist has 97; this export uses 56.
  const IND = [
    ['Saas', 'SaaS'], ['Enterprise Software', 'Enterprise Software'], ['SMB Software', 'SMB Software'], ['Developer Tools', 'Developer Tools'], ['Data & Analytics', 'Data & Analytics'],
    ['Cybersecurity', 'Cybersecurity'], ['Deep Tech / AI', 'Deep Tech / AI'], ['Fintech', 'Fintech'], ['Marketplace', 'Marketplace'], ['It Services', 'IT Services'],
    ['Hardware / Iot', 'Hardware / IoT'], ['Industrial Automation & Iot', 'Industrial Automation & IoT'], ['Health Care', 'Health Care'], ['Medical Devices & Diagnostics', 'Medical Devices & Diagnostics'],
    ['Pharma & Biotech', 'Pharma & Biotech'], ['Fitness & Wellness', 'Fitness & Wellness'], ['Professional Services', 'Professional Services'], ['Consulting & Advisory', 'Consulting & Advisory'],
    ['Staffing & Recruiting', 'Staffing & Recruiting'], ['Law Firms & Legal Departments', 'Law Firms & Legal Departments'], ['Architecture, Engineering & Design', 'Architecture, Engineering & Design'],
    ['Marketing Teams & Cmos', 'Marketing Teams & CMOs'], ['Sales Organizations & Cros', 'Sales Organizations & CROs'], ['Customer Success & Support', 'Customer Success & Support'],
    ['Advertising & Media Agencies', 'Advertising & Media Agencies'], ['Media & Content', 'Media & Content'], ['Digital Media & Publishing', 'Digital Media & Publishing'],
    ['Sports, Events & Live Entertainment', 'Sports, Events & Live Entertainment'], ['Travel & Tourism', 'Travel & Tourism'], ['Banking & Credit Unions', 'Banking & Credit Unions'],
    ['Wealth Management & Advisory', 'Wealth Management & Advisory'], ['Private Equity & Venture Capital', 'Private Equity & Venture Capital'], ['Commercial Real Estate', 'Commercial Real Estate'],
    ['Property Management', 'Property Management'], ['General Contractors & Builders', 'General Contractors & Builders'], ['Home Services', 'Home Services'],
    ['Industrial Manufacturing', 'Industrial Manufacturing'], ['Precision & Contract Manufacturing', 'Precision & Contract Manufacturing'], ['Industrial Distribution', 'Industrial Distribution'],
    ['Freight & Trucking', 'Freight & Trucking'], ['Oil & Gas', 'Oil & Gas'], ['Farming & Agribusiness', 'Farming & Agribusiness'], ['Brick & Mortar Retail', 'Brick & Mortar Retail'],
    ['E Commerce', 'E-commerce'], ['E Commerce & D2c', 'E-commerce & D2C'], ['Consumer Goods & Cpg (non Food)', 'Consumer Goods & CPG (non-Food)'], ['Food & Beverage Cpg', 'Food & Beverage CPG'],
    ['Luxury & Premium Brands', 'Luxury & Premium Brands'], ['Education', 'Education'], ['Higher Education', 'Higher Education'], ['Edtech', 'EdTech'],
    ['Corporate Learning & Training', 'Corporate Learning & Training'], ['Nonprofit & Associations', 'Nonprofit & Associations'], ['State & Local Government', 'State & Local Government'],
    ['Federal Government', 'Federal Government'],
  ];
  // Operators pick up to 10 (Sheet3 #2, corrected from 7)
  F.industries = { label: 'Industries', type: 'tagsearch', max: 10, help: 'Search the industry list. Pick up to 10.', options: opts(IND) };
  F.industry = { label: 'Industry', type: 'select', placeholder: 'Select an industry', options: opts(IND) };

  /* ---------- GTM approach ---------- */
  // Row 18 (Fixed): PLG, Channel, Inside Sales, Enterprise Sales. L191 floats "Direct" as a fifth, unconfirmed.
  F.salesMotions = { label: 'GTM motion experience', type: 'multi', options: opts(['PLG', 'Channel', 'Inside Sales', 'Enterprise Sales']) };
  // Row 17: SPICE, Skaled, Other (Other opens a text field)
  F.methodologies = {
    label: 'Methodologies', type: 'multi', max: 4,
    options: opts(['MEDDPICC', 'MEDDIC', 'Challenger', 'Sandler', 'SPIN', 'Solution Selling', 'Value Selling', 'SPICE', 'Skaled', 'Other']),
  };
  // Asked of every role (Part A): Salesforce, HubSpot, Microsoft Dynamics, Pipedrive, Zoho, Close, NetSuite, Other
  F.crm = { label: 'Primary CRM', type: 'single', options: opts(['Salesforce', 'HubSpot', 'Microsoft Dynamics', 'Pipedrive', 'Zoho', 'Close', 'NetSuite', 'Other']) };

  /* ---------- Role details: bar scales with bold label + grey help (comment E397) ---------- */
  F.stackComplexity = {
    label: 'Stack complexity', type: 'optcards',
    options: [
      { v: 'lean', l: 'Lean', level: 1, d: 'Has run a 1-3 tool stack. Right fit for early teams that need a CRM done well before anything else.' },
      { v: 'standard', l: 'Standard', level: 2, d: 'Has run a 4-8 tool stack. Comfortable connecting CRM, sales engagement and reporting into one working system.' },
      { v: 'complex', l: 'Complex', level: 3, d: 'Has run a 9-15 tool stack. Experienced integrating data, routing, forecasting and enrichment across teams.' },
      { v: 'enterprise', l: 'Enterprise', level: 4, d: 'Has run a 15+ tool stack. Operates multi-system environments with data warehouse, governance and cross-functional ownership.' },
    ],
  };
  F.codeCapability = {
    label: 'Code capability', type: 'optcards',
    options: [
      { v: 'non_technical', l: 'Non-technical', level: 1, d: 'Builds with no-code tools only. Configures and orchestrates, does not write or edit code.' },
      { v: 'light_scripting', l: 'Light scripting', level: 2, d: 'Can read and edit code. Adjusts scripts, prompts and API calls but relies on others for net-new builds.' },
      { v: 'functional', l: 'Functional', level: 3, d: 'Builds working APIs and production scripts. Can ship a functioning automation end to end without an engineer.' },
      { v: 'engineering_grade', l: 'Engineering-grade', level: 4, d: 'Writes production code with version control, CI/CD and deployed services. Operates like an engineer inside a GTM team.' },
    ],
  };
  F.automationScale = {
    label: 'Automation scale', type: 'optcards',
    options: [
      { v: 'pilot', l: 'Pilot', level: 1, d: 'Under 1K records or actions per month. Proven in small tests, not yet run at team-wide volume.' },
      { v: 'production', l: 'Production', level: 2, d: '1K-100K per month. Runs live automations that a sales or marketing team depends on daily.' },
      { v: 'high_scale', l: 'High-scale', level: 3, d: '100K-1M per month. Has managed throughput where reliability, cost and error handling become the job.' },
      { v: 'enterprise', l: 'Enterprise', level: 4, d: '1M+ per month. Runs automations at a scale that requires monitoring, data infrastructure and formal ownership.' },
    ],
  };
  // Per-tool proficiency (all roles; on hold in the live build, shown here as proposed)
  F.stackProficiency = {
    label: 'Proficiency', type: 'optcards',
    options: [
      { v: 'end_user', l: 'End User', level: 1, d: 'Uses the tool daily to do their own work. Knows the workflows, not the setup.' },
      { v: 'power_user', l: 'Power User', level: 2, d: 'Builds their own reports, views and workflows. Can train others on the tool.' },
      { v: 'admin', l: 'Admin', level: 3, d: 'Owns configuration, permissions, integrations and data hygiene for the tool.' },
      { v: 'developer', l: 'Developer', level: 4, d: 'Extends the tool through its API, custom code or custom objects. Can build what the tool does not do out of the box.' },
    ],
  };
  F.techStack = {
    label: 'Tech stack', type: 'multi', optional: true,
    options: opts(['Salesforce', 'HubSpot', 'Gong', 'Outreach', 'Salesloft', 'ZoomInfo', 'Clari', 'Apollo', 'Clay', 'ChatGPT', 'PandaDoc', 'Monday.com', 'Zoho', 'Pipedrive', 'Crossbeam', 'Chorus by ZoomInfo', 'Revenue.io', 'Kixie', 'People.ai', 'Mindtickle', 'Highspot', 'Marketo', 'LeanData', 'Looker', 'Tableau', 'Close']),
  };

  // Sales Leadership
  // Two fields after the L15/L150 renames: team headcount (people) and annual quota (USD)
  F.largestTeamManaged = { label: 'Largest sales team managed', type: 'single', options: opts([['<5', 'Under 5 people'], ['5-10', '5–10 people'], ['10-25', '10–25 people'], ['25-50', '25–50 people'], ['50+', '50+ people']]) };
  F.largestTeamQuota = { label: 'Largest annual quota managed', type: 'single', options: opts([['1_5m', '$1M–$5M'], ['5_10m', '$5M–$10M'], ['10_25m', '$10M–$25M'], ['25_50m', '$25M–$50M'], ['50_100m', '$50M–$100M'], ['100m_plus', '$100M+']]) };
  F.salesCycle = { label: 'Sales cycle range', type: 'multi', max: 2, options: opts(['<5 days', '5 - 30 days', '30 - 90 days', '3 - 6 months', '6 - 12 months', '12+ months']) };
  F.avgSalesCycleDays = { label: 'Average sales cycle', type: 'number', unit: 'days', min: 1, max: 720, optional: true };
  // Marketing
  F.largestBudget = { label: 'Largest annual budget managed', type: 'money', step: 50000 };
  F.channelsRun = { label: 'Channels personally run', type: 'multi', max: 5, options: opts(['Paid Search', 'Paid Social', 'SEO', 'Content', 'ABM', 'Events', 'PR', 'Partnerships', 'Email & Lifecycle', 'Product Marketing']) };
  F.b2bShare = { label: 'B2B share of work', type: 'number', unit: '% B2B', min: 0, max: 100 };
  // RevOps / Enablement / Partnerships
  F.builtFromZero = { label: 'Built the function from zero', type: 'single', options: opts([['yes', 'Yes'], ['no', 'No']]) };
  F.largestRepCount = { label: 'Largest rep population enabled', type: 'number', unit: 'reps', min: 1 };
  F.enablementFocus = { label: 'Primary enablement focus', type: 'multi', max: 2, options: opts(['Program builder', 'Onboarding specialist', 'Skills coach', 'Content creator', 'Trainer', 'Functional leader']) };
  F.audienceSpecialty = { label: 'Audience specialty', type: 'multi', options: opts(['AE', 'SDR / BDR', 'Sales Manager / Frontline manager', 'Account Manager', 'Channel', 'Solutions']) };
  // Customer Success & Growth
  F.bestNrr = { label: 'Best NRR achieved', type: 'number', unit: '%', min: 50, max: 250 };
  F.largestArrBook = { label: 'Largest ARR book managed', type: 'money', step: 100000 };
  F.csMotion = {
    label: 'CS motion specialty', type: 'multi', max: 2,
    options: opts([['High-touch', 'High-touch', 'Named CSMs, low ratios'], ['Low-touch / scaled', 'Low-touch / scaled', '1:many, pooled'], ['Tech-touch / digital CS', 'Tech-touch / digital CS', 'Automation, in-app'], ['PLG / self-serve customer base', 'PLG / self-serve customer base']]),
  };
  // AI GTM
  F.aiSpecialization = { label: 'Primary AI specialization', type: 'single', options: opts(['Outbound / prospecting AI', 'RevOps automation', 'AI GTM builder', 'Lead and account intelligence', 'Forecasting and revenue AI', 'Copilots and assistants']) };
  // Partnerships
  F.partnershipMotion = { label: 'Primary partnership motion', type: 'single', options: opts(['Tech / ISV partnerships', 'Channel / Reseller', 'SI / Consulting partnerships', 'Agency partnerships', 'Strategic / Co-sell (cloud marketplaces)', 'Affiliate / Influencer', 'Marketplace / Platform']) };
  F.partnerRevenue = { label: 'Largest partner-attributed revenue', type: 'money', step: 100000 };
  // Sellers
  F.individualQuota = { label: 'Average individual quota', type: 'money', step: 50000 };
  F.avgDealSize = { label: 'Average deal size', type: 'money', step: 1000 };
  F.commissionOnly = { label: 'Open to commission-only', type: 'single', options: opts([['yes', 'Yes'], ['no', 'No']]) };

  // Which role-detail fields each category collects (intake step 3, profile "Operating range", compare rows)
  F.roleFields = {
    sales_leadership: ['largestTeamManaged', 'largestTeamQuota', 'salesCycle', 'salesMotions', 'methodologies'],
    marketing: ['largestBudget', 'channelsRun', 'b2bShare', 'salesMotions'],
    revenue_operations: ['crm', 'stackComplexity', 'builtFromZero', 'salesMotions'],
    sales_enablement: ['largestRepCount', 'enablementFocus', 'audienceSpecialty', 'methodologies', 'builtFromZero'],
    customer_success_growth: ['bestNrr', 'largestArrBook', 'csMotion'],
    ai_gtm: ['aiSpecialization', 'codeCapability', 'automationScale'],
    partnerships: ['partnershipMotion', 'partnerRevenue', 'builtFromZero'],
    sellers: ['individualQuota', 'avgDealSize', 'salesCycle', 'methodologies', 'commissionOnly'],
  };

  /* ---------- Identity & location ---------- */
  F.fullName = { label: 'Full name', type: 'text', placeholder: 'First and last name' };
  F.email = { label: 'Work email', type: 'email', placeholder: 'you@company.com' };
  F.linkedin = { label: 'LinkedIn URL', type: 'url', placeholder: 'https://www.linkedin.com/in/…' };
  F.headline = { label: 'Headline', type: 'text', maxlength: 110, placeholder: 'One line on the problem you solve', help: 'Shown under your name on every card and in search.' };
  F.bio = { label: 'About', type: 'textarea', maxlength: 900, placeholder: 'Who you help, what you build, and the result.', help: 'Write in first person. Name the stage and the problem.' };
  // Scope: Country -> postal code -> city picklist, timezone derived (not free text)
  F.country = { label: 'Country', type: 'select', placeholder: 'Select a country', options: opts(['United States', 'Canada', 'United Kingdom', 'Ireland', 'Australia', 'Germany', 'Netherlands', 'Singapore', 'Kenya', 'India']) };
  F.postalCode = { label: 'Postal code', type: 'text', placeholder: 'e.g. 06470', help: 'We derive your city and time zone from it, so clients can filter by region.' };
  F.city = { label: 'City', type: 'text', placeholder: 'City', help: 'Used when we cannot derive your city from the postal code.' };
  F.methodologyOther = { label: 'Other methodology', type: 'text', placeholder: 'e.g. Miller Heiman', help: 'We review new methodologies and add common ones to the list.' };
  F.usHours = { label: 'Willing to work US time zone hours?', type: 'single', options: opts([['yes', 'Yes'], ['no', 'No']]) };

  /* ---------- Fit tags (library assembled in model.js from live tags + taxonomy groups) ---------- */
  // Operators call them fit tags; clients see "Focus areas" (L131). Browse filter: up to 5, AND (Part A).
  F.fitTags = { label: 'Fit tags', clientLabel: 'Focus areas', type: 'tags', max: 25, help: 'Up to 25 self-claimed tags. Each one turns Verified when a client review confirms it.', options: [] };

  /* ---------- Reputation Index (RIS) ----------
     Three ladders conflicted (sheet L247, explorer REP_TIERS, live stored labels; comment H390).
     Decision: the explorer ladder, derived from the score everywhere (operator view == client view),
     consistent with the floor of 50 (L381). The entry tier is "Vetted", not "Verified": 78 of 100 live
     profiles sit at 50 with no client evidence, so "Verified" is kept for client-confirmed proof only
     (verified fit tags, verified engagements). */
  F.risTier = {
    label: 'Reputation Index tier', type: 'single',
    options: [
      { v: 'apex', l: 'Apex', min: 90, max: 100, d: 'The highest standing on the network. Very few operators reach it.' },
      { v: 'elite', l: 'Elite', min: 80, max: 89, d: 'A deep record of reviewed outcomes across multiple clients.' },
      { v: 'trusted', l: 'Trusted', min: 70, max: 79, d: 'Repeat engagements and consistently strong client reviews.' },
      { v: 'proven', l: 'Proven', min: 60, max: 69, d: 'Verified engagements, client reviews and published proof of work.' },
      { v: 'vetted', l: 'Vetted', min: 50, max: 59, d: 'Identity and work history checked by the Revenue Nomad team. Every approved profile starts at 50.' },
      { v: 'indexing', l: 'Indexing', min: 0, max: 49, d: 'New to the network. Shown until the profile is approved and scored.' },
    ],
  };
  // What each tier unlocks (proposal). Tiers move only on client evidence; nothing on the ladder is paid.
  F.risUnlocks = {
    indexing: ['Your profile is reviewed by the team within 2 business days', 'Studio setup checklist while you wait'],
    vetted: ['Listed and searchable in Browse', 'Studio insights: who viewed you, why you appeared, positioning, search and AI visibility', 'Fractional roles and predictive prospects in Opportunities'],
    proven: ['Proof links with section-level read tracking for your direct deals', 'Embeddable verified badge with a dated verification page'],
    trusted: ['Featured on role category pages', 'Eligible for the curated shortlists the team sends to clients'],
    elite: ['Considered for homepage curation', 'Invited to State of Fractional GTM research panels'],
    apex: ['Invited to the State of Fractional GTM advisory panel', 'First look at new Studio tools'],
  };
  F.risTierFor = (score) => (score == null ? F.risTier.options[5] : F.risTier.options.find((t) => score >= t.min) || F.risTier.options[5]);
  // Client-facing explainer factors (comment E418)
  F.risFactors = {
    label: 'How score is calculated', type: 'single',
    options: [
      { v: 'volume', l: 'Review volume', d: 'How many clients have reviewed the operator.', w: 0.3 },
      { v: 'verification', l: 'Fit tag verification', d: 'Share of fit tags confirmed by a client review.', w: 0.2 },
      { v: 'ratings', l: 'Strong ratings', d: 'Average CORE rating across reviews.', w: 0.25 },
      { v: 'complete', l: 'Complete profile', d: 'Photo, video, rate, role details, engagement history and work samples.', w: 0.15 },
      { v: 'recency', l: 'Engagement recency', d: 'How recently the operator finished a verified engagement.', w: 0.1 },
    ],
  };

  /* ---------- CORE client review (L253-L256) ---------- */
  F.coreDims = {
    label: 'CORE', type: 'single',
    options: [
      { v: 'C', l: 'Communication', q: 'Did this operator keep you informed without you having to ask?', d: 'Translates strategy to any audience and communicates proactively, so clients never have to chase.' },
      { v: 'O', l: 'Ownership', q: 'Did this operator act like a member of your team or like an outside vendor?', d: 'Treats outcomes like an equity holder, not a contractor waiting for direction.' },
      { v: 'R', l: 'Results Focus', q: 'Did this operator track progress against measurable goals and adjust their approach based on what the data was telling them?', d: 'Moves a number that was defined at the start of the engagement.' },
      { v: 'E', l: 'Expertise', q: 'Did this operator demonstrate the skills and domain knowledge required to do the job at the level you needed?', d: 'Depth in their stated specialization, not breadth.' },
    ],
  };
  F.overallExperience = { label: 'How would you describe the overall experience?', type: 'textarea', maxlength: 1200 };
  F.hireAgain = { label: 'Would you hire this operator again?', type: 'single', options: opts([['yes', 'Yes'], ['no', 'No']]) };
  // Operators only see two states (comment E486)
  F.reviewStatus = { label: 'Review status', type: 'single', options: opts([['sent', 'Sent'], ['completed', 'Completed']]) };

  /* ---------- Intro requests and projects ---------- */
  // Intro lifecycle proposed in the sheet (L471, on hold): Pending, Interested, RN Qualified, Introduced, Hired
  F.introStatus = { label: 'Status', type: 'single', options: opts([['pending', 'Pending'], ['interested', 'Interested'], ['rn_qualified', 'RN Qualified'], ['introduced', 'Introduced'], ['hired', 'Hired'], ['declined', 'Declined']]) };
  // Resolves the "ASAP / 2 Weeks / 1+ Month" vs availability conflict: the client's start timeline uses the
  // operator availability slugs, so an intro request matches availability with no translation.
  F.startBy = { label: 'When do you need them to start?', type: 'single', options: opts([['available_now', 'As soon as possible'], ['available_2_weeks', 'In 2 weeks'], ['available_2_plus_weeks', 'In 2+ weeks']]) };
  F.projectBudget = { label: 'Project budget', type: 'money', step: 1000, help: 'Total budget for a scoped project.' };
  // Client-side filter chips for Reputation Index (Part C)
  F.risMin = { label: 'Reputation Index', type: 'single', options: opts([['70', '70+'], ['80', '80+'], ['90', '90+']]) };
  // Review request (Part A L124-L134): outcomes claimed, each rated by the client
  F.outcomeRating = { label: 'Outcome', type: 'single', options: opts([['exceeded', 'Exceeded'], ['met', 'Met'], ['partially_met', 'Partially met'], ['not_achieved', 'Not achieved']]) };
  F.need = {
    label: 'What do you need?', type: 'single',
    options: opts([
      ['sales_motion', 'Build or fix the sales motion'], ['pipeline', 'Generate more pipeline'], ['team', 'Hire and ramp a team'],
      ['systems', 'Fix CRM, data and reporting'], ['ai', 'Automate GTM with AI'], ['retention', 'Improve retention and expansion'],
      ['partners', 'Build a partner channel'], ['not_sure', 'Not sure yet'],
    ]),
  };
  // Which role categories each need maps to (from the explorer's NEED_CATS)
  F.needCats = {
    sales_motion: ['sales_leadership', 'sellers'], pipeline: ['marketing', 'sellers', 'ai_gtm'], team: ['sales_leadership', 'sales_enablement'],
    systems: ['revenue_operations'], ai: ['ai_gtm'], retention: ['customer_success_growth'], partners: ['partnerships'], not_sure: [],
  };
  // Why an operator passes on an intro or project, and why a client says "Not a fit" (Projects prototype)
  F.passReason = { label: 'Reason', type: 'single', options: opts([['rate', 'Rate'], ['hours', 'Hours'], ['timing', 'Timing'], ['expertise', 'Not my expertise'], ['industry', 'Industry'], ['capacity', 'At capacity'], ['other', 'Other']]) };
  // All-in hourly budget for projects (includes the platform fee), wider than the browse filter
  F.budgetRate = { label: 'Budget per hour (all-in)', type: 'money', unit: '/ hr', min: 50, step: 5 };
  F.projectStatus = { label: 'Status', type: 'single', options: opts([['draft', 'Draft'], ['posted', 'Posted'], ['in_progress', 'In progress'], ['staffed', 'Staffed'], ['closed', 'Closed']]) };
})();
