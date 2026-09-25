/* Demo state so every surface opens in a realistic working state (first visit and after "Reset demo data").
   Company names, messages and figures here are illustrative. */
/* Reviewers' own headshots, shown with their quote on Home (founder request, Sep 25, 2026). A missing file falls back to the company logo. */
window.RN = window.RN || {}; RN.data = RN.data || {};
RN.data.reviewerPhotos = { 'Eric Barbalace': 'assets/brand/reviewer-eric-barbalace.jpg', 'Trista Kempa': 'assets/brand/reviewer-trista-kempa.jpg' };
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
        fields: { roleCategory: 'sales_leadership', role: 'VP of Sales', engagementType: 'fractional', hoursPerMonth: '40', term: '6_12', startBy: 'available_2_weeks', revenueRange: '20m_50m', employeeRange: '51_200', industries: ['Health Care'], salesMotions: ['Inside Sales'], tags: ['Sales Team Hiring & Ramp', 'Sales Process Design', 'HubSpot admin'], rateMax: 300 },
        brief: 'Own the sales number while we hire a full-time leader. In 90 days: two reps hired and ramping, a written sales process, and a forecast the board trusts.',
        // Only the demo operator's (Matt's) response is seeded; other real operators are invited but have not answered
        invited: [matt.id, anne.id, tim.id], responses: [{ opId: matt.id, status: 'interested', note: 'I have done this build at myHR Partner. Happy to walk you through the 90-day plan I used.', rate: 300, ts: iso(4) }] },
      { id: 'proj-seed-2', status: 'draft', title: 'HubSpot cleanup and pipeline reporting', template: 'vp-revops', createdAt: iso(1),
        fields: { roleCategory: 'revenue_operations', role: 'VP of Revenue Operations', engagementType: 'project', term: '1_3', startBy: 'available_now', revenueRange: '20m_50m', employeeRange: '51_200', industries: ['Health Care'], tags: ['HubSpot admin', 'CRM cleanup', 'Dashboard build'], projectBudget: 18000 },
        brief: 'Deduplicate contacts, rebuild pipeline stages and give leadership one dashboard.', invited: [], responses: [] },
    ];

    // No seeded hires: real operators never get invented hires. Hires are made in the demo (workspace Team tab, an
    // engagement's Select, or Admin marking an intro hired) and land in s.hires through RN.hire.
    s.hires = [];

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

/* Sample scenario (Prototype dock: "Client: returning client with a team (sample)").
   The demo client with a history: three hires (one active, two ended), engagements in four states and intros in
   flight, so the workspace shows a mixed account (S3). Real operators from RN.model.ops, every record marked
   sample: true, dates relative to the dock clock. The client's own records are set aside in seen.sampleStash while
   the sample is on; RN.sample.clear() removes the sample and brings them back. Applying twice replaces the sample.
   A review request made from a sample hire or intro is marked sample too (buyer.js bw-review-start). A review
   submitted on it changed a real operator's profile in memory (RN.model), so removing one reloads the page.
   The default seed above stays as it is: no invented hires. */
(function () {
  'use strict';
  const RN = window.RN;
  const KEYS = ['intros', 'projects', 'hires', 'reviewRequests'];
  const S = () => RN.store.state;
  const lc = (x) => String(x == null ? '' : x).toLowerCase().trim();
  const isClient = (email) => !!email && lc(email) === lc(RN.personas.buyer.email);
  const MINE = {
    intros: (i) => i.buyer && isClient(i.buyer.email),
    projects: (p) => { const e = (p.client && p.client.email) || p.owner || (p.buyer && p.buyer.email); return e ? isClient(e) : !!RN.personas.buyer.demo; },
    hires: (h) => h.client && isClient(h.client.email),
    reviewRequests: (r) => r.reviewer && isClient(r.reviewer.email),
  };
  const active = () => KEYS.some((k) => (S()[k] || []).some((x) => x && x.sample));
  // Reviews (and review drafts) that came from a sample review request. Returns how many reviews were removed.
  function dropSampleReviews(s) {
    const ids = new Set((s.reviewRequests || []).filter((r) => r && r.sample).map((r) => r.id));
    if (!ids.size) return 0;
    const n = (s.reviews || []).length;
    s.reviews = (s.reviews || []).filter((r) => !(r && ids.has(r.requestId)));
    if (s.seen.reviewDrafts) { s.seen.reviewDrafts = Object.assign({}, s.seen.reviewDrafts); ids.forEach((id) => delete s.seen.reviewDrafts[id]); }
    return n - s.reviews.length;
  }
  // The operator profiles in memory still carry the removed review: save now and reload once the route has settled
  function reloadSoon() {
    setTimeout(() => { if (RN.store.flush) RN.store.flush(); window.location.reload(); }, 0);
    return 'reload';
  }

  function build() {
    const H = RN.hire;
    const now = RN.now();
    const iso = (daysAgo, h) => new Date(now.getTime() - daysAgo * 864e5 - (h || 0) * 36e5).toISOString();
    const day = (daysAgo) => H.addDays(H.today(), -daysAgo);
    const at = (d, hour) => new Date(`${d}T${String(hour || 17).padStart(2, '0')}:00:00`).toISOString();
    const used = new Set([RN.model.matt && RN.model.matt.id]);
    // A real operator by name, or the first unused one in the role category
    const pick = (names, cat) => {
      const op = names.map((n) => RN.model.ops.find((o) => o.name === n)).find((o) => o && !used.has(o.id))
        || RN.model.ops.find((o) => o.catKey === cat && !o.hidden && !used.has(o.id));
      if (op) used.add(op.id);
      return op;
    };
    const sales = pick(['Mike Hanauer', 'Rob Luedke'], 'sales_leadership');
    const mkt = pick(['Toni Larson', 'Brendan McGinnis'], 'marketing');
    const revops = pick(['Jose Robledo', 'Jessica Allison'], 'revenue_operations');
    const cs = pick(['Tom Fell'], 'customer_success_growth');
    const ae = pick(['Christian Grandy'], 'sellers');
    const r1 = pick(['Randi MacColl'], 'marketing'), r2 = pick(['Laura McAliley'], 'marketing'), r3 = pick(['Anne Zavorskas'], 'marketing');
    const ai = [pick(['Nicolas Thatcher'], 'ai_gtm'), pick(['Jacob Fenton'], 'revenue_operations'), pick(['Katherine Daumer'], 'sales_leadership')].filter(Boolean);
    const rv = [pick(['Jessica Allison'], 'revenue_operations'), pick(['Adam Renico'], 'revenue_operations')].filter(Boolean);
    if (!sales || !mkt || !revops) return null;
    const b = RN.personas.buyer;
    const client = { name: b.name, title: b.title, email: b.email, company: Object.assign({}, b.company) };
    const hc = { email: b.email, company: b.company.name, name: b.name };
    const co = b.company;
    const firm = { revenueRange: co.revenueRange || '', employeeRange: co.employeeRange || '', industries: co.industry ? [co.industry] : [] };
    const thread = (op, t) => [{ from: op.name, text: 'Interested', ts: t[0] }, { from: 'Revenue Nomad', text: 'RN Qualified', ts: t[1] }, { from: 'Revenue Nomad', text: 'Introduced', ts: t[2] }].concat(t[3] ? [{ from: b.name, text: 'Hired', ts: t[3] }] : []);
    const bp = (id) => (RN.projects && RN.projects.blueprint && RN.projects.blueprint(id)) || { tags: [] };

    // Hires. Sales leadership: started 158 days ago on a six-month term. Marketing: ended 28 days ago, early.
    // Revenue operations: a three-month project that ended 147 days ago.
    const sStart = day(158), mEnd = day(28), mStart = H.addDays(mEnd, -165), rStart = day(236);
    const hires = [
      { id: 'hire-sample-sales', sample: true, opId: sales.id, client: hc, source: 'intro', sourceId: 'intro-sample-sales',
        terms: { engagementType: 'fractional', rate: 250, hoursPerMonth: '40', startDate: sStart, term: '3_6', endDate: H.endFor(sStart, '3_6'), projectBudget: null, notes: 'Owns the number while we hire a full-time leader. Weekly pipeline review with the CEO.' },
        status: 'active', createdAt: iso(165), endedAt: null, extensions: [], checkins: [] },
      { id: 'hire-sample-mkt', sample: true, opId: mkt.id, client: hc, source: 'intro', sourceId: 'intro-sample-mkt',
        terms: { engagementType: 'fractional', rate: 220, hoursPerMonth: '40', startDate: mStart, term: '3_6', endDate: H.endFor(mStart, '3_6'), projectBudget: null, notes: '' },
        status: 'ended', createdAt: iso(200), endedAt: at(mEnd), endNote: 'Paused while we reset the marketing budget for Q4.', extensions: [], checkins: [{ ts: iso(120), note: 'Can we review the channel plan before the board meeting?' }] },
      { id: 'hire-sample-revops', sample: true, opId: revops.id, client: hc, source: 'engagement', sourceId: 'proj-sample-revops',
        terms: { engagementType: 'project', rate: null, hoursPerMonth: '', startDate: rStart, term: '1_3', endDate: H.endFor(rStart, '1_3'), projectBudget: 18000, notes: 'HubSpot cleanup, new pipeline stages and three leadership dashboards.' },
        status: 'ended', createdAt: iso(239), endedAt: at(H.endFor(rStart, '1_3')), extensions: [], checkins: [] },
    ];
    const rEnd = hires[2].endedAt;

    const projects = [
      { id: 'proj-sample-mkt', sample: true, status: 'posted', title: 'Fractional VP of Marketing', template: 'vp-marketing', client, createdAt: iso(4), updatedAt: iso(3), postedAt: iso(3),
        fields: Object.assign({ roleCategory: 'marketing', role: 'VP of Marketing', engagementType: 'fractional', hoursPerMonth: '40', term: '3_6', startBy: 'available_2_weeks', salesMotions: [], tags: bp('vp-marketing').tags.slice(0, 6), rateMax: 275, projectBudget: null }, firm),
        brief: 'Rebuild demand generation after a pause: two channels producing qualified pipeline every week, and attribution the board trusts.',
        visibility: 'open', suggest: true, suggestedAt: iso(1), suggested: [], picked: [],
        invited: [r1, r2, r3].filter(Boolean).map((o) => o.id), inviteMeta: {},
        responses: [[r1, 2, 0, 'I rebuilt demand gen at two health care software companies. Happy to share the channel plan I would start from.'], [r2, 1, 4, 'This is the engagement I run most often. I would start with attribution and one definition of a qualified lead.'], [r3, 0, 20, 'I can start in two weeks and have run this exact reset after a paused budget.']]
          .filter((x) => x[0]).map(([op, d, h, note]) => ({ opId: op.id, status: 'interested', note, rate: op.rate || null, hours: op.avail.hoursCode || '40', ts: iso(d, h) })) },
      { id: 'proj-sample-clay', sample: true, status: 'posted', title: 'Clay workflows for outbound research', template: 'ai-gtm-architect', client, createdAt: iso(1, 3), updatedAt: iso(1), postedAt: iso(1),
        fields: Object.assign({ roleCategory: 'ai_gtm', role: 'AI GTM Engineer', engagementType: 'project', hoursPerMonth: '', term: '1_3', startBy: 'available_now', salesMotions: [], tags: bp('ai-gtm-architect').tags.slice(0, 5), rateMax: null, projectBudget: 12000 }, firm),
        brief: 'Two Clay workflows live: account research and enrichment into HubSpot, with time saved reported.',
        visibility: 'open', suggest: true, suggested: [], picked: [], invited: ai.map((o) => o.id), inviteMeta: {}, responses: [] },
      { id: 'proj-sample-draft', sample: true, status: 'draft', title: 'Fractional Director of Enablement', template: 'enablement-director', client, createdAt: iso(6), updatedAt: iso(6),
        fields: Object.assign({ roleCategory: 'sales_enablement', role: 'Director of Enablement', engagementType: 'project', hoursPerMonth: '', term: '1_3', startBy: 'available_2_weeks', salesMotions: [], tags: bp('enablement-director').tags.slice(0, 5), rateMax: null, projectBudget: 15000 }, firm),
        brief: 'A 30-day onboarding program for the two reps we are hiring this quarter.', visibility: 'open', suggest: true, suggested: [], picked: [], invited: [], inviteMeta: {}, responses: [] },
      { id: 'proj-sample-revops', sample: true, status: 'closed', title: 'HubSpot rebuild and pipeline reporting', template: 'vp-revops', client, createdAt: iso(250), updatedAt: rEnd, postedAt: iso(248), staffedAt: iso(240), closedAt: rEnd, selectedOpId: revops.id,
        fields: Object.assign({ roleCategory: 'revenue_operations', role: 'RevOps Manager', engagementType: 'project', hoursPerMonth: '', term: '1_3', startBy: 'available_now', salesMotions: [], tags: bp('vp-revops').tags.slice(0, 6), rateMax: null, projectBudget: 18000 }, firm),
        brief: 'Deduplicate contacts, rebuild pipeline stages and give leadership one dashboard.', visibility: 'open', suggest: false, suggested: [], picked: [],
        invited: [revops].concat(rv).map((o) => o.id), inviteMeta: {},
        responses: [{ opId: revops.id, status: 'interested', note: 'I have rebuilt HubSpot for three companies your size.', rate: revops.rate || null, hours: '', ts: iso(246), decision: 'selected', closeSent: true }] },
    ];

    const intros = [
      { id: 'intro-sample-sales', sample: true, opId: sales.id, status: 'hired', createdAt: iso(185), buyer: client, need: 'team', hiredAt: iso(165), hireId: 'hire-sample-sales',
        fields: { need: 'team', engagementType: 'fractional', hoursPerMonth: '40', startBy: 'available_now', roleCategory: sales.catKey }, note: 'Our first sales leader left. We need someone to own the number and hire two reps.', thread: thread(sales, [iso(184), iso(183), iso(182), iso(165)]) },
      { id: 'intro-sample-mkt', sample: true, opId: mkt.id, status: 'hired', createdAt: iso(215), buyer: client, need: 'pipeline', hiredAt: iso(200), hireId: 'hire-sample-mkt',
        fields: { need: 'pipeline', engagementType: 'fractional', hoursPerMonth: '40', startBy: 'available_2_weeks', roleCategory: mkt.catKey }, note: '', thread: thread(mkt, [iso(214), iso(213), iso(212), iso(200)]) },
    ];
    if (cs) intros.push({ id: 'intro-sample-cs', sample: true, opId: cs.id, status: 'introduced', createdAt: iso(4), buyer: client, need: 'retention',
      fields: { need: 'retention', engagementType: 'advisory', hoursPerMonth: '20', startBy: 'available_2_weeks', roleCategory: cs.catKey }, note: 'Renewals are coming up and we find out about churn too late.', thread: thread(cs, [iso(3), iso(2), iso(1)]) });
    if (ae) intros.push({ id: 'intro-sample-ae', sample: true, opId: ae.id, status: 'pending', createdAt: iso(0, 32), buyer: client, need: 'sales_motion',
      fields: { need: 'sales_motion', engagementType: 'fractional', hoursPerMonth: '60', startBy: 'available_now', roleCategory: ae.catKey }, note: '', thread: [] });

    const reviewRequests = [
      { id: 'rr-sample-revops', sample: true, opId: revops.id, reviewer: { name: b.name, email: b.email, company: co.name, title: b.title || '' }, engagement: co.name, status: 'completed', sentAt: iso(146), completedAt: iso(140), source: 'client', hireId: 'hire-sample-revops' },
    ];
    return { hires, projects, intros, reviewRequests };
  }

  function apply() {
    const recs = build();
    if (!recs) return false;
    let dropped = 0;
    RN.store.update((s) => {
      s.seen = Object.assign({}, s.seen);
      dropped = dropSampleReviews(s);   // applying again replaces the sample, reviews of it included
      const first = !s.seen.sampleStash;
      const stash = s.seen.sampleStash || { checkin: s.seen.checkin || null };
      KEYS.forEach((k) => {
        const list = (s[k] || []).filter((x) => x && !x.sample);
        if (first) stash[k] = list.filter(MINE[k]);
        s[k] = recs[k].concat(first ? list.filter((x) => !MINE[k](x)) : list);
      });
      s.seen.sampleStash = stash;
      delete s.seen.checkin;
      const vw = Object.assign({}, s.seen.engagementsViewed);
      recs.projects.forEach((p) => delete vw[p.id]);
      s.seen.engagementsViewed = vw;
      // Admin alerts treat sample records as already seen (no team emails for them)
      const al = s.seen.admAlerted;
      if (al) { recs.intros.forEach((i) => { if (!al.intros.includes(i.id)) al.intros.push(i.id); }); recs.reviewRequests.forEach((r) => { if (!al.reviews.includes(r.id)) al.reviews.push(r.id); }); }
    }, 'hires');
    if (dropped) reloadSoon();
    return true;
  }
  /* Returns 'reload' when a review of the sample was removed (the page reloads), else true */
  function clear() {
    let dropped = 0;
    RN.store.update((s) => {
      s.seen = Object.assign({}, s.seen);
      dropped = dropSampleReviews(s);
      const stash = s.seen.sampleStash || {};
      KEYS.forEach((k) => {
        const keep = (s[k] || []).filter((x) => x && !x.sample);
        const ids = new Set(keep.map((x) => x.id));
        s[k] = (stash[k] || []).filter((x) => !ids.has(x.id)).concat(keep);
      });
      if (stash.checkin) s.seen.checkin = stash.checkin; else delete s.seen.checkin;
      delete s.seen.sampleStash;
    }, 'hires');
    return dropped ? reloadSoon() : true;
  }
  RN.sample = { apply, clear, active };
})();
