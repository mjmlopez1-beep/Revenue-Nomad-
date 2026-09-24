/* Market data for the research hub, Rate Index, Studio positioning and Admin demand views.
   ILLUSTRATIVE: every figure here is invented to show shape and value (same caveat as the
   State of Fractional GTM 2027 mockup). Every cut uses the standard field slugs from fields.js,
   so a report segment, a browse filter and an operator profile all mean the same thing. */
(function () {
  'use strict';
  const RN = window.RN;
  RN.data = RN.data || {};

  RN.data.market = {
    illustrative: true,
    asOf: '2026-09-24',
    // Live network size for marketing copy. The prototype loads a 100-profile sample of the live export.
    network: { operators: '350+', sample: 100, disciplines: 8 },

    /* ---------- State of Fractional GTM 2027 ---------- */
    report: {
      title: 'The State of Fractional GTM',
      year: 2027,
      fieldwork: 'Oct to Nov 2026',
      sample: { operators: 212, companies: 96, profiles: '350+' },
      lede: 'What companies pay, how they scope the work, which roles they hire first, and what separates the operators who get rehired. Built from a survey of operators and hiring companies plus anonymized data from 350+ profiles on the Revenue Nomad network.',
      summary: [
        { v: '$240', l: 'Median hourly rate for a fractional GTM leader, up 9% year over year' },
        { v: '41%', l: 'Of engagements scoped at 20 to 39 hours a month, the most common shape' },
        { v: '6.4 mo', l: 'Median engagement length, with 48% extended past the original term' },
        { v: '2.4x', l: 'Rehire rate for operators with three or more verified client reviews vs none' },
        { v: '31%', l: 'Of first-time buyers hired a fractional leader as their first sales leadership hire' },
        { v: '67 days', l: 'Median time from start to the first measurable pipeline change' },
      ],
      triggers: [
        { l: 'First sales leader hire', v: 31 },
        { l: 'Founder stepping out of sales', v: 24 },
        { l: 'Missed plan two quarters', v: 19 },
        { l: 'Post fundraise scale up', v: 14 },
        { l: 'Leader departure, interim cover', v: 12 },
      ],
      demandIndex: [
        { l: '2023', v: 100 }, { l: '2024', v: 131 }, { l: '2025', v: 171 }, { l: '2026', v: 228 }, { l: '2027 proj', v: 292 },
      ],
      // Median hourly rate by standard role category
      rateByCat: [
        { cat: 'sales_leadership', v: 275 },
        { cat: 'marketing', v: 260 },
        { cat: 'revenue_operations', v: 235 },
        { cat: 'customer_success_growth', v: 215 },
        { cat: 'sales_enablement', v: 210 },
        { cat: 'ai_gtm', v: 250 },
        { cat: 'partnerships', v: 220 },
        { cat: 'sellers', v: 115 },
      ],
      // Median hourly rate by the client's standard revenue range
      rateByRevenue: [
        { range: 'under_1m', v: 190 },
        { range: '1m_5m', v: 225 },
        { range: '5m_20m', v: 250 },
        { range: '20m_50m', v: 280 },
        { range: '50m_plus', v: 310 },
      ],
      fracVsFull: [
        ['Fractional VP of Sales, 40 hrs a month', '$10,000', '2 to 3 weeks', '30 days notice'],
        ['Full time VP of Sales, base + OTE + benefits + equity', '$27,000+', '90 to 120 days', 'Severance plus 4 to 6 months lost'],
        ['Agency or consultancy', '$15,000+', '4 to 6 weeks', 'Contract term'],
      ],
      // Share of engagements by standard hours-per-month chip
      hours: [
        { h: 'h_under_20', v: 18 }, { h: 'h_20', v: 23 }, { h: 'h_40', v: 29 }, { h: 'h_60', v: 12 }, { h: 'h_80', v: 9 }, { h: 'h_100', v: 5 }, { h: 'h_160', v: 4 },
      ],
      term: [
        { l: '1 to 3 mo', v: 14 }, { l: '3 to 6 mo', v: 38 }, { l: '6 to 12 mo', v: 33 }, { l: '12+ mo', v: 15 },
      ],
      outcomes: [
        { v: '48%', l: 'Extended past the original term' },
        { v: '22%', l: 'Converted to a full time hire' },
        { v: '9%', l: 'Ended early, most often for fit, not performance' },
      ],
      // Hiring intent next 12 months, by standard role category
      intent: [
        { cat: 'sales_leadership', v: 34 }, { cat: 'revenue_operations', v: 22 }, { cat: 'marketing', v: 18 },
        { cat: 'sales_enablement', v: 9 }, { cat: 'customer_success_growth', v: 8 }, { cat: 'ai_gtm', v: 6 }, { cat: 'partnerships', v: 3 },
      ],
      hindsight: [
        ['Had done it at our stage and deal size', '38%', '81%'],
        ['Communication cadence in a part time seat', '21%', '69%'],
        ['Verified references from prior clients', '18%', '64%'],
        ['Industry experience', '13%', '47%'],
        ['Brand name employers on resume', '6%', '22%'],
      ],
      sources: [
        { l: 'Referral from peer', v: 44 }, { l: 'Prior colleague', v: 23 }, { l: 'Marketplace / network', v: 17 }, { l: 'LinkedIn inbound', v: 11 }, { l: 'Agency or firm', v: 5 },
      ],
      concurrent: [
        { l: '1 client', v: 22 }, { l: '2 clients', v: 39 }, { l: '3 clients', v: 27 }, { l: '4+', v: 12 },
      ],
      quote: { text: 'I did not need a closer. I needed someone to build the machine and then hand me the keys.', by: 'CEO, $5M–$20M B2B services company, survey respondent' },
      methodology: [
        'Survey fielded October 1 to November 5, 2026 to fractional GTM operators (n=212) and companies that hired one in the last 18 months (n=96). Rate and scope figures are medians of self reported data. Demand growth combines a monthly scan of public fractional GTM job posts with stated hiring intent. Profile analysis uses anonymized, aggregated data from 350+ operator profiles on the Revenue Nomad network. Minimum cell size for any reported segment is 20.',
        'Every segment in this report uses the same fields operators and companies fill in on Revenue Nomad: role category, revenue range, employee range, hours per month and industry. That is why a number here can be compared directly with any profile or brief on the platform.',
        'Revenue Nomad is a marketplace for fractional go to market leadership. It has a commercial interest in this market growing. Every figure in this report is reported as collected.',
      ],
    },

    /* ---------- Rate Index (live benchmark, quarterly) ---------- */
    rateIndex: {
      // p25 / median / p75 hourly by role category
      byCat: {
        sales_leadership: { p25: 220, p50: 275, p75: 340, n: 214 },
        marketing: { p25: 205, p50: 260, p75: 320, n: 61 },
        revenue_operations: { p25: 185, p50: 235, p75: 290, n: 48 },
        sales_enablement: { p25: 165, p50: 210, p75: 255, n: 22 },
        customer_success_growth: { p25: 170, p50: 215, p75: 265, n: 39 },
        ai_gtm: { p25: 190, p50: 250, p75: 320, n: 14 },
        partnerships: { p25: 175, p50: 220, p75: 270, n: 9 },
        sellers: { p25: 90, p50: 115, p75: 145, n: 18 },
      },
      // multiplier on the category median by client revenue range
      byRevenue: { pre_revenue: 0.72, under_1m: 0.79, '1m_5m': 0.92, '5m_20m': 1.0, '20m_50m': 1.1, '50m_plus': 1.24 },
      // quarterly all-category median
      trend: [
        { l: 'Q4 25', v: 221 }, { l: 'Q1 26', v: 226 }, { l: 'Q2 26', v: 231 }, { l: 'Q3 26', v: 240 },
      ],
    },

    /* ---------- What buyers search (drives impressions "why", demand vs supply, AEO) ---------- */
    queries: [
      { q: 'fractional VP of Sales', cat: 'sales_leadership', tags: ['Sales Process Design', 'Sales Team Hiring & Ramp'], vol: 540 },
      { q: 'founder-led sales transition', cat: 'sales_leadership', tags: ['Founder-Led Sales Exit', 'Sales Playbook'], vol: 310 },
      { q: 'first sales hire playbook', cat: 'sales_leadership', tags: ['Sales Playbook', 'Sales Team Hiring & Ramp'], vol: 280 },
      { q: 'outbound motion build', cat: 'sales_leadership', tags: ['Outbound Motion Build', 'Outbound Prospecting'], vol: 260 },
      { q: 'HubSpot admin', cat: 'revenue_operations', tags: ['HubSpot admin', 'CRM cleanup'], vol: 240 },
      { q: 'Salesforce cleanup', cat: 'revenue_operations', tags: ['CRM cleanup', 'Salesforce Implementation'], vol: 210 },
      { q: 'fractional CRO healthcare', cat: 'sales_leadership', tags: ['Board Revenue Reporting', 'Pipeline Inspection'], vol: 190, industry: 'Health Care' },
      { q: 'pipeline forecasting', cat: 'sales_leadership', tags: ['Pipeline Inspection', 'Revenue Forecasting'], vol: 180 },
      { q: 'RevOps for PLG', cat: 'revenue_operations', tags: ['RevOps Infrastructure Build', 'GTM Tech Stack Audit'], vol: 170 },
      { q: 'Clay workflow build', cat: 'ai_gtm', tags: ['Clay Workflow Build', 'Enrichment Automation'], vol: 165 },
      { q: 'AI SDR setup', cat: 'ai_gtm', tags: ['AI Sales Automation', 'AI Lead Scoring'], vol: 150 },
      { q: 'fractional CMO B2B SaaS', cat: 'marketing', tags: ['Demand Generation', 'Brand Strategy'], vol: 150 },
      { q: 'ABM program', cat: 'marketing', tags: ['1:1 ABM', 'ABM Strategy'], vol: 120 },
      { q: 'sales onboarding program', cat: 'sales_enablement', tags: ['New Hire Sales Onboarding', 'Sales Training Program'], vol: 115 },
      { q: 'churn reduction', cat: 'customer_success_growth', tags: ['Churn Reduction Program', 'Renewal Playbook'], vol: 110 },
      { q: 'MEDDPICC rollout', cat: 'sales_enablement', tags: ['MEDDIC/MEDDPICC', 'Methodology Rollout'], vol: 95 },
      { q: 'channel partner program', cat: 'partnerships', tags: ['Channel Sales Build'], vol: 80 },
      { q: 'call coaching', cat: 'sales_enablement', tags: ['Call Coaching & Feedback'], vol: 75 },
      { q: 'board revenue reporting', cat: 'sales_leadership', tags: ['Board Revenue Reporting'], vol: 70 },
      { q: 'enterprise deal closing', cat: 'sellers', tags: ['Enterprise Deal Closing', 'Account Expansion Selling'], vol: 60 },
      { q: 'expansion revenue playbook', cat: 'customer_success_growth', tags: ['Expansion Motion Design', 'Account Expansion Selling'], vol: 55 },
      { q: 'commission plan design', cat: 'revenue_operations', tags: ['Comp Plan Administration', 'Commission Calculation'], vol: 50 },
      { q: 'fractional sales leader property management', cat: 'sales_leadership', tags: ['Sales Process Design'], vol: 20, industry: 'Property Management', zero: true },
      { q: 'fractional RevOps NetSuite', cat: 'revenue_operations', tags: ['RevOps Infrastructure Build'], vol: 18, zero: true },
      { q: 'AI GTM engineer healthcare', cat: 'ai_gtm', tags: ['AI Sales Automation'], vol: 16, industry: 'Health Care', zero: true },
    ],

    /* ---------- AI answer engines (AEO) prompts we track ---------- */
    aiPrompts: [
      { p: 'Who are the best fractional VPs of Sales for B2B SaaS?', cat: 'sales_leadership' },
      { p: 'How much does a fractional VP of Sales cost?', cat: 'sales_leadership' },
      { p: 'Fractional sales leader for a healthcare company with founder-led sales', cat: 'sales_leadership', industry: 'Health Care' },
      { p: 'Should my first sales leader be fractional or full time?', cat: 'sales_leadership' },
      { p: 'Best fractional RevOps consultants for HubSpot', cat: 'revenue_operations' },
      { p: 'Fractional CMO vs marketing agency', cat: 'marketing' },
      { p: 'Who can build Clay workflows for outbound?', cat: 'ai_gtm' },
      { p: 'How to scope a fractional sales engagement', cat: 'sales_leadership' },
    ],
    aiEngines: ['ChatGPT', 'Perplexity', 'Google AI Overviews', 'Claude', 'Gemini'],

    /* ---------- Buyer companies (fictional) used for company-level "who viewed" ---------- */
    companies: [
      { name: 'Northwind Health', industry: 'Health Care', revenueRange: '20m_50m', employeeRange: '51_200', hq: 'Boston, MA' },
      { name: 'Clearpath Freight', industry: 'Freight & Trucking', revenueRange: '20m_50m', employeeRange: '201_500', hq: 'Columbus, OH' },
      { name: 'Parcel Labs', industry: 'Saas', revenueRange: '1m_5m', employeeRange: '11_50', hq: 'Austin, TX' },
      { name: 'Summit Dental Group', industry: 'Health Care', revenueRange: '5m_20m', employeeRange: '51_200', hq: 'Denver, CO' },
      { name: 'Orbit Analytics', industry: 'Data & Analytics', revenueRange: '5m_20m', employeeRange: '51_200', hq: 'New York, NY' },
      { name: 'Brightline Staffing', industry: 'Professional Services', revenueRange: '20m_50m', employeeRange: '201_500', hq: 'Charlotte, NC' },
      { name: 'Keystone Credit Union', industry: 'Banking & Credit Unions', revenueRange: '50m_plus', employeeRange: '201_500', hq: 'Harrisburg, PA' },
      { name: 'Lumen Learning Co', industry: 'Edtech', revenueRange: '1m_5m', employeeRange: '11_50', hq: 'Portland, OR' },
      { name: 'Harbor Property Group', industry: 'Property Management', revenueRange: '5m_20m', employeeRange: '51_200', hq: 'Tampa, FL' },
      { name: 'Vantage Robotics', industry: 'Industrial Automation & Iot', revenueRange: '5m_20m', employeeRange: '51_200', hq: 'Pittsburgh, PA' },
      { name: 'Fieldstone Foods', industry: 'Consumer Goods & Cpg (non Food)', revenueRange: '20m_50m', employeeRange: '201_500', hq: 'Minneapolis, MN' },
      { name: 'Quill Legal Tech', industry: 'Saas', revenueRange: '5m_20m', employeeRange: '51_200', hq: 'Chicago, IL' },
      { name: 'Cobalt Security', industry: 'Cybersecurity', revenueRange: '20m_50m', employeeRange: '201_500', hq: 'Arlington, VA' },
      { name: 'Meridian Wellness', industry: 'Fitness & Wellness', revenueRange: '1m_5m', employeeRange: '11_50', hq: 'San Diego, CA' },
      { name: 'Tidewater Logistics', industry: 'Freight & Trucking', revenueRange: '50m_plus', employeeRange: '501_1000', hq: 'Norfolk, VA' },
      { name: 'Anchor Payroll', industry: 'Saas', revenueRange: '1m_5m', employeeRange: '11_50', hq: 'Nashville, TN' },
      { name: 'Redwood Media House', industry: 'Media & Content', revenueRange: '5m_20m', employeeRange: '51_200', hq: 'Los Angeles, CA' },
      { name: 'Granite Builders Co', industry: 'General Contractors & Builders', revenueRange: '20m_50m', employeeRange: '201_500', hq: 'Salt Lake City, UT' },
      { name: 'Beacon Trials', industry: 'Pharma & Biotech', revenueRange: '5m_20m', employeeRange: '51_200', hq: 'Cambridge, MA' },
      { name: 'Pioneer Ag Supply', industry: 'Farming & Agribusiness', revenueRange: '20m_50m', employeeRange: '201_500', hq: 'Des Moines, IA' },
      { name: 'Signal Hill Software', industry: 'Enterprise Software', revenueRange: '50m_plus', employeeRange: '501_1000', hq: 'Seattle, WA' },
      { name: 'Copperline Energy', industry: 'Oil & Gas', revenueRange: '50m_plus', employeeRange: '1001_plus', hq: 'Houston, TX' },
      { name: 'Atlas Event Co', industry: 'Sports, Events & Live Entertainment', revenueRange: '5m_20m', employeeRange: '51_200', hq: 'Las Vegas, NV' },
      { name: 'Northstar University Online', industry: 'Higher Education', revenueRange: '20m_50m', employeeRange: '201_500', hq: 'Phoenix, AZ' },
    ],
  };
})();
