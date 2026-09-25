/* Demo state so every surface opens in a realistic working state (first visit and after "Reset demo data").
   Company names, messages and figures here are illustrative. */
(function () {
  'use strict';
  const RN = window.RN;
  const iso = (daysAgo, h) => new Date(RN.now().getTime() - daysAgo * 864e5 - (h || 0) * 36e5).toISOString();
  const byName = (n) => RN.model.ops.find((o) => o.name === n);

  RN.seed = function () {
    const s = RN.store.state;
    const matt = RN.model.matt;
    const anne = byName('Anne Zavorskas') || RN.model.ops[1];
    const jen = byName('Jen Pulsifer') || RN.model.ops[3];
    const tim = byName('Tim Evans') || RN.model.ops[5];
    const jordan = RN.personas.buyer;
    const other = { name: 'Priya Anand', title: 'VP Operations', email: 'priya@clearpathfreight.com', company: { name: 'Clearpath Freight', industry: 'Freight & Trucking', revenueRange: '20m_50m', employeeRange: '201_500' } };
    const parcel = { name: 'Marcus Lee', title: 'Founder', email: 'marcus@parcelwise.example', company: { name: 'Parcelwise', industry: 'Saas', revenueRange: '1m_5m', employeeRange: '11_50' } };

    // The demo client's saved operators appear when you first view the system as Jordan (not as a visitor)
    s.shortlist = [];
    s.seen = Object.assign({}, s.seen, { demoShortlist: [matt.id, anne.id, jen.id] });
    s.intros = [
      { id: 'intro-seed-1', opId: matt.id, status: 'pending', createdAt: iso(0, 5), buyer: parcel, need: 'sales_motion',
        fields: { need: 'sales_motion', engagementType: 'fractional', hoursPerMonth: '40', startBy: 'available_2_weeks', roleCategory: 'sales_leadership' },
        note: 'Founder still runs every deal. We closed $1.8M ARR last year and need a repeatable motion before we hire two AEs.', thread: [] },
      { id: 'intro-seed-2', opId: matt.id, status: 'interested', createdAt: iso(3), buyer: { name: jordan.name, title: jordan.title, email: jordan.email, company: jordan.company }, need: 'team',
        fields: { need: 'team', engagementType: 'fractional', hoursPerMonth: '40', startBy: 'available_now', roleCategory: 'sales_leadership' },
        note: 'Our first sales leader left in June. We need someone to own the number, hire two reps and set up HubSpot properly.',
        thread: [{ from: 'Matt Lopez', text: 'Interested', ts: iso(2, 20) }] },
      { id: 'intro-seed-3', opId: anne.id, status: 'pending', createdAt: iso(1), buyer: { name: jordan.name, title: jordan.title, email: jordan.email, company: jordan.company }, need: 'pipeline',
        fields: { need: 'pipeline', engagementType: 'advisory', hoursPerMonth: '20', startBy: 'available_2_weeks', roleCategory: anne.catKey }, note: '', thread: [] },
      { id: 'intro-seed-4', opId: matt.id, status: 'introduced', createdAt: iso(19), buyer: other, need: 'systems',
        fields: { need: 'systems', engagementType: 'project', projectBudget: 24000, startBy: 'available_now', roleCategory: 'sales_leadership' }, note: '',
        thread: [{ from: 'Matt Lopez', text: 'Interested', ts: iso(18) }, { from: 'Revenue Nomad', text: 'RN Qualified', ts: iso(17) }, { from: 'Revenue Nomad', text: 'Introduced', ts: iso(16) }] },
    ];

    s.projects = [
      { id: 'proj-seed-1', status: 'posted', title: 'Fractional VP of Sales', template: 'vp-sales', createdAt: iso(6), postedAt: iso(5),
        fields: { roleCategory: 'sales_leadership', role: 'VP of Sales', engagementType: 'fractional', hoursPerMonth: '40', term: '6_12', startBy: 'available_2_weeks', revenueRange: '20m_50m', employeeRange: '51_200', industries: ['Health Care'], salesMotions: ['Inside Sales'], tags: ['Sales Team Hiring & Ramp', 'Sales Process Design', 'HubSpot admin'], rateMax: 400 },
        brief: 'Own the sales number while we hire a full-time leader. In 90 days: two reps hired and ramping, a written sales process, and a forecast the board trusts.',
        // Only the founder's own response is seeded; other real operators are invited but have not answered
        invited: [matt.id, anne.id, tim.id], responses: [{ opId: matt.id, status: 'interested', note: 'I have done this build at myHR Partner. Happy to walk you through the 90-day plan I used.', rate: 300, ts: iso(4) }] },
      { id: 'proj-seed-2', status: 'draft', title: 'HubSpot cleanup and pipeline reporting', template: 'vp-revops', createdAt: iso(1),
        fields: { roleCategory: 'revenue_operations', role: 'VP of Revenue Operations', engagementType: 'project', term: '1_3', startBy: 'available_now', revenueRange: '20m_50m', employeeRange: '51_200', industries: ['Health Care'], tags: ['HubSpot admin', 'CRM cleanup', 'Dashboard build'], projectBudget: 18000 },
        brief: 'Deduplicate contacts, rebuild pipeline stages and give leadership one dashboard.', invited: [], responses: [] },
    ];

    s.reviewRequests = [
      { id: 'rr-seed-1', opId: matt.id, reviewer: { name: 'Trista Kempa', email: 'trista@ferry.com', company: 'Ferry', title: 'COO' }, engagement: 'Ferry', status: 'completed', sentAt: iso(24), completedAt: iso(16) },
      { id: 'rr-seed-2', opId: matt.id, reviewer: { name: 'Eric Barbalace', email: 'eric@myhrpartner.com', company: 'myHR Partner', title: 'Account Executive' }, engagement: 'myHR Partner', status: 'completed', sentAt: iso(9), completedAt: iso(3) },
      { id: 'rr-seed-3', opId: matt.id, reviewer: { name: 'Trialbee sponsor', email: 'sponsor@trialbee.example', company: 'Trialbee', title: 'Engagement sponsor', placeholder: true }, engagement: 'Trialbee', status: 'sent', sentAt: iso(2),
        // What Matt entered when requesting the review (from his Trialbee engagement), and the claimed focus areas to verify
        details: { company: 'Trialbee', engagementType: 'fractional', start: '2022-01', end: '2023-01', revenueRange: '5m_20m', employeeRange: '51_200' },
        tags: ['Founder-Led Sales Exit', 'Discovery Call Execution', 'Revenue forecasting'] },
    ];

    s.proofLinks = [
      { id: 'proof-harbor', opId: matt.id, prospect: { company: 'Harbor Property Group', contact: 'Elena Ruiz, CEO' }, sections: ['reviews', 'core', 'engagements', 'samples', 'rate'], createdAt: iso(8),
        views: [{ ts: iso(7, 3), seconds: 214, sections: ['reviews', 'core', 'engagements'] }, { ts: iso(5, 1), seconds: 96, sections: ['samples'] }, { ts: iso(1, 2), seconds: 341, sections: ['reviews', 'core', 'engagements', 'samples', 'rate'], forwarded: true }] },
    ];

    s.pending = [
      { id: 'app-seed-1', submittedAt: iso(1), status: 'in_review', profile: { name: 'Priya Shah', email: 'priya@shahrevops.com', roleCategory: 'revenue_operations', role: 'VP of Revenue Operations', headline: 'I turn a messy HubSpot into a revenue system the board trusts.', rate: 225, availability: 'available_now', hoursPerMonth: '40', revenueRange: ['5m_20m', '20m_50m'], employeeRange: ['51_200', '201_500'], industries: ['Saas', 'Health Care', 'Fintech'], fitTags: ['HubSpot admin', 'CRM cleanup', 'Dashboard build', 'Lead routing', 'GTM Tech Stack Audit'], location: 'Austin, TX',
        crm: 'HubSpot', methodologies: [], roleDetails: { crm: 'HubSpot', stackComplexity: 'complex', builtFromZero: 'yes', salesMotions: ['Inside Sales', 'PLG'] } } },
      { id: 'app-seed-2', submittedAt: iso(2), status: 'in_review', profile: { name: 'Marcus Reed', email: 'marcus@reedgtm.com', roleCategory: 'ai_gtm', role: 'AI GTM Engineer', headline: 'Clay and n8n workflows that book meetings without adding headcount.', rate: 190, availability: 'available_2_weeks', hoursPerMonth: '60', revenueRange: ['1m_5m', '5m_20m'], employeeRange: ['11_50', '51_200'], industries: ['Saas', 'Developer Tools'], fitTags: ['Clay Workflow Build', 'Enrichment Automation', 'AI Sales Automation'], location: 'Denver, CO',
        crm: 'HubSpot', methodologies: [], roleDetails: { crm: 'HubSpot', aiSpecialization: 'Outbound / prospecting AI', codeCapability: 'functional', automationScale: 'production' } } },
    ];

    s.outbox = [
      { id: 'mail-seed-1', to: 'Matt Lopez', subject: 'You appeared in 38 searches this week', body: 'Top terms: “fractional VP of Sales”, “founder-led sales transition”, “HubSpot admin”.\nHealth Care companies viewed you most. Open Studio to see why.', kind: 'digest', ts: iso(1) },
      { id: 'mail-seed-2', to: 'Matt Lopez', subject: 'Harbor Property Group opened your proof link again', body: 'Viewed for 5 minutes and forwarded it to a colleague. Sections read: reviews, CORE, engagement history, portfolio, rate.', kind: 'proof', ts: iso(1, 2) },
    ];
  };
})();
