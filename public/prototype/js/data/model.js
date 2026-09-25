/* RN.model: operators, search, match signals, analytics and market intelligence.
   One model feeds every surface so numbers agree everywhere (a view counted in Studio is the
   same view Admin sees; a filter in Browse uses the same slugs as an operator's profile). */
(function () {
  'use strict';
  const RN = window.RN;
  const F = RN.fields;
  const M = (RN.model = {});

  /* ---------- Fit tag library ---------- */
  F.fitTags.options = (RN.data.tagLibrary || []).map((t) => ({ v: t.v, l: t.l, c: t.c, g: t.g, d: t.d, axis: t.axis, stage: t.stage, n: t.n }));
  M.tagInfo = (name) => F.fitTags.options.find((o) => o.v.toLowerCase() === String(name).toLowerCase());
  // Tag score curve (Fit Tags System spec): 0 reviews self-claimed, 1 verifies at 50, 5+ is Expert
  const CURVE = [0, 50, 60, 70, 80, 85, 88, 91, 94, 97, 100];
  M.tagScore = (r) => CURVE[Math.min(10, Math.max(0, r | 0))];
  M.tagTier = (r) => (r <= 0 ? 'claimed' : r >= 5 ? 'expert' : 'verified');

  /* ---------- Range parsing (live span strings -> standard slugs) ---------- */
  const REV_BANDS = [['under_1m', 0, 1], ['1m_5m', 1, 5], ['5m_20m', 5, 20], ['20m_50m', 20, 50], ['50m_plus', 50, Infinity]];
  const EMP_BANDS = [['1_10', 1, 10], ['11_50', 11, 50], ['51_200', 51, 200], ['201_500', 201, 500], ['501_1000', 501, 1000], ['1001_plus', 1001, Infinity]];
  function money(s) { const m = String(s).match(/\$?([\d.]+)\s*([MK])?/i); if (!m) return null; let v = parseFloat(m[1]); if ((m[2] || '').toUpperCase() === 'K') v /= 1000; return v; }
  function revSlugs(str) {
    if (!str) return [];
    str = String(str);
    let lo = 0, hi = Infinity;
    if (/^up to/i.test(str)) hi = money(str.replace(/^up to/i, ''));
    else if (/^under \$1m to/i.test(str)) { lo = 0; hi = /\+$/.test(str) ? Infinity : money(str.split('to')[1]); }
    else if (/^under/i.test(str)) hi = money(str.replace(/^under/i, ''));
    else if (/\+$/.test(str) && !/–/.test(str)) lo = money(str);
    else { const [a, b] = str.split('–'); lo = money(a); hi = /\+/.test(b || '') ? Infinity : money(b); }
    return REV_BANDS.filter(([, a, b]) => a >= lo && b <= hi).map((x) => x[0]);
  }
  function empSlugs(str) {
    if (!str) return [];
    const clean = String(str).replace(/,/g, '');
    let lo, hi;
    if (/–/.test(clean)) { const [a, b] = clean.split('–'); lo = parseInt(a, 10); hi = /\+/.test(b) ? Infinity : parseInt(b, 10); }
    else { lo = parseInt(clean, 10); hi = /\+/.test(clean) ? Infinity : lo; }
    return EMP_BANDS.filter(([, a, b]) => a >= lo && (b <= hi || (hi === Infinity))).map((x) => x[0]).filter((k) => { const b = EMP_BANDS.find((x) => x[0] === k); return b[1] <= hi; });
  }
  M.revSlugs = revSlugs; M.empSlugs = empSlugs;

  const AVAIL = { 'Available now': 'available_now', 'Available in 2 weeks': 'available_2_weeks', 'Available in 2+ weeks': 'available_2_plus_weeks' };
  const LOGO_KEY = { ferry: 'ferry', 'myhr partner': 'myhr', trialbee: 'trialbee', buildinglink: 'buildinglink' };
  const ENG_TYPES = ['fractional', 'advisory', 'interim', 'project'];

  /* Registry keys any role-detail step can store (RN.fields.roleFields plus the all-role GTM fields) */
  M.registryRoleFields = function (rd) {
    const keys = new Set([].concat(...Object.values(F.roleFields || {}), ['crm', 'salesMotions', 'methodologies', 'techStack', 'methodologyOther']));
    const out = {};
    Object.keys(rd || {}).forEach((k) => { if (keys.has(k) && rd[k] !== '' && rd[k] != null) out[k] = rd[k]; });
    return out;
  };

  /* ---------- Normalize one live record ---------- */
  function norm(raw) {
    const p = raw.profile || {};
    const pp = p.profile || {};
    const d = p.details || {};
    const std = raw.standard || d.standard || {};
    const rd = raw.roleDetails || {};
    const native = raw.rate != null;
    const rand = RN.rng(raw.id);
    const name = raw.name;
    const hasHeadline = native && p.desc && p.desc.length > 18;
    const tags = (p.tags || []).map((t) => {
      const r = t.r || 0;
      return { t: t.t, c: F.catKey(t.c), cLabel: t.c, g: t.g && t.g !== t.c ? t.g : ((M.tagInfo(t.t) || {}).g || ''), axis: t.axis, stage: t.stage, r, tier: M.tagTier(r), score: M.tagScore(r) };
    }).sort((a, b) => b.score - a.r - (a.score - b.r) || (a.tier === 'claimed') - (b.tier === 'claimed'));
    const methods = [].concat(rd.methodologies || d.snapshot && d.snapshot.methodologies || []).flatMap((m) => String(m).split(',')).map((s) => s.trim()).filter(Boolean);
    const avail = (d.availability || {});
    const hours = avail.hoursPerMonth || std.hours || null;
    const score = Math.max(50, pp.reputationIndex || 50);
    const engagements = (d.engagements || []).map((e) => Object.assign({}, e, { logo: LOGO_KEY[String(e.company).toLowerCase()] || null }));
    const offered = ['fractional'].concat(ENG_TYPES.slice(1).filter(() => rand() > 0.55));
    const op = {
      id: raw.id,
      name,
      first: name.split(' ')[0],
      initials: raw.initials || RN.fmt.initials(name),
      role: raw.role,
      cat: raw.cat,
      catKey: F.catKey(raw.cat),
      headline: hasHeadline ? p.desc : '',
      bio: p.bio || '',
      photo: raw.photo || '',
      location: (RN.data.opLocations && RN.data.opLocations[raw.id]) || '',
      timezone: d.timezone && d.timezone !== 'Not provided' ? d.timezone : '',
      rate: raw.rate || null,
      avail: { key: AVAIL[avail.status] || 'available_now', label: avail.status || 'Available now', startDate: avail.startDate || null, hours: hours, hoursCode: hours ? F.hoursCode(hours) : null },
      engagementTypes: offered,          // illustrative: not in the live export
      newClientCapacity: native ? 1 + Math.floor(rand() * 3) : null,
      industries: std.industries || d.industries || [],
      revenueRanges: revSlugs(std.revRange),
      employeeRanges: empSlugs(std.empRange),
      crm: std.crm || '',
      methodologies: [...new Set(methods)],
      motions: [].concat((d.snapshot && d.snapshot.motions) || [], rd.motion_focus || [], rd.gtm_motion_experience || []).filter((m, i, a) => m && a.indexOf(m) === i),
      roleDetails: rd,
      // Role details keyed by the field registry (intake answers, Studio and Admin edits). Views read these first,
      // then fall back to parsing the live export's legacy snake_case keys in roleDetails.
      roleFields: M.registryRoleFields(rd),
      tags,
      reviews: p.reviews || [],
      core: p.core || null,
      ris: { score, label: F.risTierFor(score).l, tier: F.risTierFor(score).v },
      wouldHireAgain: pp.wouldHireAgain != null ? pp.wouldHireAgain : null,
      engagements,
      // Blueprints this operator offers as a packaged engagement ("Ways to work with me"); set in Studio
      offers: raw.isMatt ? ['vp-sales', 'cro'] : [],
      clients: engagements.map((e) => ({ name: e.company, logo: e.logo, verified: e.clientVerified })),
      video: raw.isMatt ? 'assets/intro-matt.mp4' : null,
      isMatt: !!raw.isMatt,
      native,
      raw,
    };
    op.slug = RN.slug(name);
    op.completeness = completeness(op);
    return op;
  }

  /* Profile strength: what an operator can add, weighted. Drives ranking boost (L366), RIS "complete profile"
     and the Studio checklist ("the more you invest, the more you get"). */
  M.checklist = function (op) {
    const verified = op.tags.filter((t) => t.tier !== 'claimed').length;
    return [
      { k: 'photo', l: 'Profile photo', done: !!op.photo, w: 6, gain: 'Cards with a photo are opened 2.3x as often' },
      { k: 'headline', l: 'Headline in your own words', done: !!op.headline, w: 8, gain: 'Your headline is the first line clients read in search' },
      { k: 'bio', l: 'About section of 400+ characters', done: (op.bio || '').length >= 400, w: 6, gain: 'Long-form bios feed Google and AI answer engines' },
      { k: 'rate', l: 'Hourly rate', done: !!op.rate, w: 6, gain: 'Clients filter by budget. No rate means you drop out of those searches' },
      { k: 'avail', l: 'Availability confirmed in the last 30 days', done: !!(op.avail.confirmedAt || op.avail.startDate) && Math.abs(RN.now() - new Date(op.avail.confirmedAt || op.avail.startDate)) / 864e5 < 30, w: 6, gain: 'Fresh availability ranks higher' },
      { k: 'ranges', l: 'Revenue and employee ranges', done: op.revenueRanges.length > 0 && op.employeeRanges.length > 0, w: 6, gain: 'Needed for Match Signals on every client visit' },
      { k: 'industries', l: '3+ industries', done: op.industries.length >= 3, w: 4, gain: 'Industry is the second most used filter' },
      { k: 'role', l: 'Role details for your category', done: Object.keys(op.roleDetails || {}).length >= 3, w: 8, gain: 'Shown in the Operating range section of your profile' },
      { k: 'tags', l: '10+ fit tags', done: op.tags.length >= 10, w: 6, gain: 'Each tag is a search term you can be found for' },
      { k: 'verified', l: '3+ client-verified fit tags', done: verified >= 3, w: 10, gain: 'Verified tags rank first on cards and in search' },
      { k: 'reviews', l: '3+ client reviews', done: op.reviews.length >= 3, w: 12, gain: 'Operators with 3+ verified reviews are rehired 2.4x as often' },
      { k: 'engagements', l: '2+ client engagements in Engagement History', done: op.engagements.length >= 2, w: 8, gain: 'Proves stage and deal-size fit, the top hiring factor' },
      { k: 'video', l: 'Intro video', done: !!op.video, w: 6, gain: 'Profiles with video hold attention 40% longer' },
      { k: 'samples', l: 'A work sample in your Portfolio', done: !!(RN.store && RN.store.state.edits[op.id] && RN.store.state.edits[op.id].samples && RN.store.state.edits[op.id].samples.length) || op.isMatt, w: 8, gain: 'Samples are downloaded and forwarded inside client teams' },
    ];
  };
  function completeness(op) {
    const list = M.checklist(op);
    const total = list.reduce((a, x) => a + x.w, 0);
    return Math.round((list.filter((x) => x.done).reduce((a, x) => a + x.w, 0) / total) * 100);
  }
  M.completeness = completeness;

  /* ---------- Collection ---------- */
  M.ops = (RN.data.rawOps || []).map(norm);
  // unique slugs
  const seen = {};
  M.ops.forEach((o) => { if (seen[o.slug]) { seen[o.slug]++; o.slug += '-' + seen[o.slug]; } else seen[o.slug] = 1; });
  const byId = new Map(M.ops.map((o) => [o.id, o]));
  const bySlug = new Map(M.ops.map((o) => [o.slug, o]));
  M.byId = (id) => byId.get(id) || null;
  M.bySlug = (slug) => bySlug.get(slug) || null;
  M.add = function (op) { M.ops.push(op); byId.set(op.id, op); bySlug.set(op.slug, op); };
  M.norm = norm;
  M.matt = M.ops.find((o) => o.isMatt);

  /* Apply Studio edits (profile changes made during the session) */
  M.applyEdits = function () {
    const edits = (RN.store && RN.store.state.edits) || {};
    Object.keys(edits).forEach((id) => {
      const op = byId.get(id); if (!op) return;
      const e = edits[id];
      ['headline', 'bio', 'rate', 'industries', 'revenueRanges', 'employeeRanges', 'crm', 'methodologies', 'motions', 'engagementTypes', 'location', 'newClientCapacity', 'role'].forEach((k) => { if (e[k] !== undefined) op[k] = e[k]; });
      if (e.roleFields) op.roleFields = Object.assign({}, op.roleFields, e.roleFields);
      if (e.catKey && e.catKey !== op.catKey) { op.catKey = e.catKey; op.cat = F.catLabel(e.catKey); }
      if (e.availConfirmedAt) op.avail = Object.assign({}, op.avail, { confirmedAt: e.availConfirmedAt });
      if (e.removeTags) op.tags = op.tags.filter((t) => t.tier !== 'claimed' || !e.removeTags.some((x) => x.toLowerCase() === t.t.toLowerCase()));
      if (e.availKey) op.avail = Object.assign({}, op.avail, { key: e.availKey, label: F.availability.options.find((o) => o.v === e.availKey).l });
      if (e.hoursCode) op.avail = Object.assign({}, op.avail, { hoursCode: e.hoursCode, hours: +e.hoursCode });
      if (e.startDate) op.avail = Object.assign({}, op.avail, { startDate: e.startDate });
      // Studio: engagement history, "ways to work with me" offers, photo and intro video
      if (e.engagements) e.engagements.forEach((x) => { if (!op.engagements.some((g) => g.id === x.id)) op.engagements.push(Object.assign({ logo: null, mine: true }, x)); });
      if (e.offers) op.offers = e.offers.slice();
      if (e.photo !== undefined) op.photo = e.photo;
      if (e.video !== undefined) op.video = e.video;
      if (e.addTags) e.addTags.forEach((t) => { if (!op.tags.some((x) => x.t.toLowerCase() === t.toLowerCase())) { const info = M.tagInfo(t) || {}; op.tags.push({ t, c: info.c || op.catKey, g: info.g || '', axis: info.axis || '', stage: info.stage || '', r: 0, tier: 'claimed', score: 0 }); } });
      op.clients = op.engagements.map((x) => ({ name: x.company, logo: x.logo, verified: !!x.clientVerified }));
      op.completeness = completeness(op);
    });
    // Reviews submitted in-session verify tags and lift the score
    ((RN.store && RN.store.state.reviews) || []).forEach((rv) => {
      const op = byId.get(rv.opId); if (!op || op.reviews.some((r) => r.id === rv.id)) return;
      op.reviews = [rv].concat(op.reviews);
      // The engagement the client confirmed joins Engagement History (or verifies the matching entry)
      if (rv.company) {
        const g = rv.engagement || {};
        const hit = op.engagements.find((x) => String(x.company).toLowerCase() === String(rv.company).toLowerCase());
        // The client's confirmed company ranges fill gaps in the matched entry (never overwrite what the operator set)
        if (hit) Object.assign(hit, { clientVerified: true }, !hit.revenueRange && g.revenueRange ? { revenueRange: g.revenueRange } : null, !hit.employeeRange && g.employeeRange ? { employeeRange: g.employeeRange } : null);
        else op.engagements.push({ id: 'eng-' + rv.id, company: rv.company, role: g.title || 'Fractional ' + op.role, start: g.start || '', end: g.ongoing ? '' : g.end || '', engagementType: g.engagementType, revenueRange: g.revenueRange, employeeRange: g.employeeRange, clientVerified: true, logo: null, fromReview: true });
        op.clients = op.engagements.map((x) => ({ name: x.company, logo: x.logo, verified: !!x.clientVerified }));
      }
      const good = (rv.coreAvg || 5) >= 4;
      (rv.tags || []).forEach((t) => {
        let tag = op.tags.find((x) => x.t.toLowerCase() === t.toLowerCase());
        if (!tag) { const info = M.tagInfo(t) || {}; tag = { t, c: info.c || op.catKey, g: info.g || '', axis: info.axis || '', stage: info.stage || '', r: 0, tier: 'claimed', score: 0 }; op.tags.push(tag); }
        if (good) { tag.r += 1; tag.tier = M.tagTier(tag.r); tag.score = M.tagScore(tag.r); }
      });
      // A 5.0 review adds the full gain, 4.0 half, 3.0 or lower nothing
      op.ris.score = Math.min(99, op.ris.score + Math.round(M.risGain('review') * RN.clamp(((rv.coreAvg || rv.overall || 5) - 3) / 2, 0, 1)));
      const t = F.risTierFor(op.ris.score); op.ris.label = t.l; op.ris.tier = t.v;
      op.completeness = completeness(op);
    });
  };

  /* Estimated Reputation Index points per action (factor weights from RN.fields.risFactors). Illustrative. */
  M.risGain = (action) => ({ review: 4, verifiedTag: 1, engagement: 2, complete: 3, recent: 2 }[action] || 1);

  /* The one Reputation Index factor breakdown (Studio overview, Credibility, Levels all read this).
     Returns {rows:[{k,l,d,w,p,txt,pts,action:{l,to}}], score, tier, next, toNext, avail, weakest} */
  const monthsSince = (ym) => { if (!ym) return null; const d = new Date(ym.length <= 7 ? ym + '-01' : ym); const n = RN.now(); return Math.max(0, (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth()); };
  M.risFactors = function (op) {
    const G = M.risGain;
    const tags = op.tags || [];
    const verified = tags.filter((x) => x.tier !== 'claimed').length;
    const claimed = tags.length - verified;
    const nRev = (op.reviews || []).length;
    const avg = op.core && op.core.overall ? op.core.overall : nRev ? op.reviews.reduce((s, r) => s + (r.overall || r.coreAvg || 0), 0) / nRev : 0;
    const lastEnd = (op.engagements || []).reduce((m, e) => { if (!e.end) return 0; const k = monthsSince(e.end); return m == null ? k : Math.min(m, k); }, null);
    const pl = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;
    const val = {
      volume: { p: Math.min(1, nRev / 5), txt: pl(nRev, 'client review'), pts: Math.max(0, 5 - nRev) * G('review'), action: { l: 'Request a review', to: 'studio.credibility' } },
      verification: { p: tags.length ? verified / tags.length : 0, txt: `${verified} of ${tags.length} fit tags verified`, pts: Math.min(8, claimed) * G('verifiedTag'), action: { l: 'Ask a client to verify tags', to: 'studio.credibility' } },
      ratings: { p: avg / 5, txt: nRev ? `${avg.toFixed(1)} average across ${pl(nRev, 'review')}` : 'No ratings yet', pts: nRev && avg >= 4.5 ? 0 : 2, action: { l: 'Request a review', to: 'studio.credibility' } },
      complete: { p: (op.completeness || 0) / 100, txt: `Profile ${op.completeness}% complete`, pts: op.completeness < 100 ? G('complete') : 0, action: { l: 'Finish your profile', to: 'studio.profile' } },
      recency: { p: lastEnd == null ? 0 : RN.clamp(1 - lastEnd / 24, 0, 1), txt: lastEnd == null ? 'No engagement logged' : lastEnd === 0 ? 'Engagement active this month' : `Last engagement ended ${pl(lastEnd, 'month')} ago`, pts: lastEnd == null || lastEnd > 0 ? G('engagement') : 0, action: { l: 'Get a recent engagement confirmed', to: 'studio.credibility' } },
    };
    const rows = F.risFactors.options.map((f) => Object.assign({ k: f.v, l: f.l, d: f.d, w: f.w, f }, val[f.v]));
    const tier = F.risTierFor(op.ris.score);
    const next = F.risTier.options.filter((x) => x.min > op.ris.score).sort((x, y) => x.min - y.min)[0];
    return { rows, score: op.ris.score, tier, next, toNext: next ? next.min - op.ris.score : 0, avail: rows.reduce((s, r) => s + r.pts, 0), weakest: rows.slice().sort((x, y) => y.pts - x.pts)[0] };
  };

  /* ---------- Search ----------
     Rules (Product Feedback): roles OR, every other filter AND; fit tags up to 5 AND; industry up to 3 OR.
     Returns [{op, score, why:[strings], matched:{tags, industries}}] */
  const SYN = {
    cro: ['chief revenue officer', 'sales leadership'], 'vp sales': ['vp of sales', 'sales leadership'], 'vp of sales': ['sales leadership'],
    'head of sales': ['vp of sales', 'sales leadership'], sales: ['sales leadership', 'sellers'], revops: ['revenue operations'], 'rev ops': ['revenue operations'],
    cmo: ['chief marketing officer', 'marketing'], marketing: ['marketing'], demand: ['demand generation', 'marketing'], abm: ['1:1 abm', 'abm strategy', 'marketing'],
    enablement: ['sales enablement'], onboarding: ['new hire sales onboarding', 'sales enablement'], cs: ['customer success & growth'], 'customer success': ['customer success & growth'],
    churn: ['churn reduction program', 'customer success & growth'], ai: ['ai gtm'], clay: ['clay workflow build', 'ai gtm'], sdr: ['sellers', 'outbound prospecting'], ae: ['account executive', 'sellers'],
    partnerships: ['partnerships', 'channel sales build'], channel: ['channel sales build', 'partnerships'], hubspot: ['hubspot admin', 'hubspot implementation'], salesforce: ['salesforce implementation', 'salesforce admin', 'crm cleanup'],
    crm: ['crm cleanup', 'revenue operations'], forecast: ['pipeline inspection', 'revenue forecasting'], pipeline: ['pipeline inspection', 'pipeline architecture'], playbook: ['sales playbook', 'sales playbook build'],
    'founder-led': ['founder-led sales exit', 'founder-led sales transition'], founder: ['founder-led sales exit', 'founder-led sales transition'], outbound: ['outbound motion build', 'outbound prospecting'],
    healthcare: ['health care'], 'health care': ['health care'], saas: ['saas'], fintech: ['fintech'], manufacturing: ['industrial manufacturing', 'precision & contract manufacturing'],
  };
  const STOP = new Set(['fractional', 'the', 'for', 'and', 'with', 'leader', 'leaders', 'expert', 'experts', 'consultant', 'consultants', 'head', 'who', 'can', 'need', 'help', 'our', 'your', 'from', 'into', 'that', 'this', 'company', 'companies', 'operator', 'operators', 'part', 'time', 'interim']);
  const synFor = (phrase) => Object.keys(SYN).filter((k) => new RegExp('(^|[^a-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])').test(phrase));
  /* Query -> groups of alternatives. An operator must match most groups (not just any single word). */
  M.parseQuery = function (q) {
    const ql = String(q || '').toLowerCase().trim();
    if (!ql) return [];
    const groups = [];
    const used = new Set();
    // multi-word synonym keys first ("vp sales", "customer success", "health care")
    synFor(ql).filter((k) => k.includes(' ') || k.includes('-')).forEach((k) => { groups.push([k].concat(SYN[k])); k.split(/[\s-]+/).forEach((w) => used.add(w)); });
    ql.split(/[^a-z0-9&+/.-]+/).filter((w) => w.length > 2 && !STOP.has(w) && !used.has(w)).forEach((w) => {
      groups.push([w].concat(SYN[w] || []));
    });
    return groups;
  };
  // Back-compat: flat list of all alternatives
  M.expand = (q) => [...new Set(M.parseQuery(q).flat())];
  M.search = function (o) {
    o = o || {};
    const f = o.filters || {};
    const groups = M.parseQuery(o.q);
    const tags = (o.tags || []).map((t) => t.toLowerCase());
    const out = [];
    for (const op of M.ops) {
      if (op.hidden) continue;
      // Filters (AND across fields)
      if (f.roleCategories && f.roleCategories.length && !f.roleCategories.includes(op.catKey)) continue;
      if (f.availability && f.availability.length && !f.availability.includes(op.avail.key)) continue;
      if (f.revenueRange && f.revenueRange.length && !f.revenueRange.some((r) => op.revenueRanges.includes(r))) continue;
      if (f.employeeRange && f.employeeRange.length && !f.employeeRange.some((r) => op.employeeRanges.includes(r))) continue;
      if (f.industries && f.industries.length && !f.industries.some((i) => op.industries.includes(i))) continue;
      if (f.engagementTypes && f.engagementTypes.length && !f.engagementTypes.some((e) => op.engagementTypes.includes(e))) continue;
      if (f.salesMotions && f.salesMotions.length && !f.salesMotions.some((m) => op.motions.includes(m))) continue;
      if (f.hoursPerMonth && f.hoursPerMonth.length && !(op.avail.hoursCode && f.hoursPerMonth.some((h) => +op.avail.hoursCode >= +h))) continue;
      // A rate filter drops operators with no rate (Studio tells operators this)
      if (f.rateMax && (!op.rate || op.rate > +f.rateMax)) continue;
      if (f.risMin && op.ris.score < +f.risMin) continue;
      const opTags = op.tags.map((t) => t.t.toLowerCase());
      if (tags.length && !tags.every((t) => opTags.includes(t))) continue;
      // Text relevance: each query group is matched by any of its alternatives; most groups must match
      let score = 0;
      const why = [];
      const matchedTags = [];
      if (groups.length) {
        const hay = { name: op.name.toLowerCase(), role: (op.role + ' ' + op.cat).toLowerCase(), head: (op.headline + ' ' + op.bio).toLowerCase() };
        // short words (cro, cmo, sdr, matt) match whole words only
        const inc = (h, t) => (t.length <= 4 ? new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(h) : h.includes(t));
        let hit = 0;
        for (const alts of groups) {
          let g = 0;
          for (const t of alts) {
            if (inc(hay.name, t)) g = Math.max(g, 40);
            if (inc(hay.role, t)) { g = Math.max(g, 18); if (!why.includes('role')) why.push('role'); }
            op.tags.forEach((x) => { const tl = x.t.toLowerCase(); if (inc(tl, t) || (t.length > 5 && t.includes(tl))) { g = Math.max(g, x.tier === 'claimed' ? 10 : 18); if (!matchedTags.includes(x.t)) matchedTags.push(x.t); } });
            const indHit = op.industries.filter((x) => inc(x.toLowerCase(), t));
            if (indHit.length) { g = Math.max(g, 12); if (!why.includes('ind:' + indHit[0])) why.push('ind:' + indHit[0]); }
            if (inc(hay.head, t)) g = Math.max(g, 6);
          }
          if (g) { hit += 1; score += g; }
        }
        const need = groups.length <= 2 ? groups.length : Math.ceil(groups.length * 0.67);
        if (hit < need) continue;
      }
      // Quality: verified proof, Reputation Index, completeness (search ranking boost)
      const verified = op.tags.filter((t) => t.tier !== 'claimed').length;
      score += op.ris.score * 0.3 + op.completeness * 0.15 + verified * 1.5 + (op.avail.key === 'available_now' ? 3 : 0);
      const reasons = [];
      if (matchedTags.length) reasons.push(`Matches ${matchedTags.slice(0, 2).map((t) => '“' + t + '”').join(' and ')}`);
      tags.forEach((t) => { const x = op.tags.find((y) => y.t.toLowerCase() === t); if (x && !matchedTags.includes(x.t)) reasons.push(`${x.tier === 'claimed' ? 'Claims' : 'Client-verified in'} ${x.t}`); });
      why.filter((w) => w.startsWith('ind:')).forEach((w) => reasons.push('Works in ' + RN.w.label('industries', w.slice(4))));
      if (!reasons.length && why.includes('role')) reasons.push(`${op.role}`);
      out.push({ op, score, why: reasons, matched: { tags: matchedTags } });
    }
    const sort = o.sort || 'best';
    out.sort((a, b) => {
      if (sort === 'ris') return b.op.ris.score - a.op.ris.score || b.score - a.score;
      if (sort === 'rate') return (a.op.rate || 9999) - (b.op.rate || 9999);
      if (sort === 'available') return (a.op.avail.key === 'available_now' ? 0 : 1) - (b.op.avail.key === 'available_now' ? 0 : 1) || b.score - a.score;
      return b.score - a.score;
    });
    return out;
  };

  /* ---------- Match signals (client <-> operator), the 5 Scope signals ----------
     brief: {roleCategory, revenueRange, employeeRange, salesMotions[], industry|industries[], need|tags[], availability, hoursPerMonth, engagementType, rateMax}
     Returns {pct, label, signals:[{k,l,state:'match'|'partial'|'low',text}]} */
  M.fit = function (op, brief) {
    brief = brief || {};
    const first = op.first;
    const sig = [];
    // Role: the discipline the client is hiring for comes first, so another discipline never reads as a strong match
    if (brief.roleCategory) {
      const same = op.catKey === brief.roleCategory;
      const adj = !same && op.tags.some((t) => t.tier !== 'claimed' && t.c === brief.roleCategory);
      sig.push({ k: 'role', l: 'Role', state: same ? 'match' : adj ? 'partial' : 'low', text: same ? `Works in ${F.catLabel(op.catKey)}` : adj ? `Client-verified ${F.catLabel(brief.roleCategory)} work, but works in ${F.catLabel(op.catKey)}` : `You need ${F.catLabel(brief.roleCategory)}; ${op.first} works in ${F.catLabel(op.catKey)}` });
    }
    const rev = brief.revenueRange;
    if (rev && (op.revenueRanges.length || op.engagements.some((e) => e.revenueBand || e.revenueRange))) {
      // Engagement history (live export revenueBand, or registry revenueRange from Studio and client reviews)
      const engaged = op.engagements.some((e) => e.revenueBand === rev || e.revenueRange === rev);
      sig.push({ k: 'revenue', l: 'Company revenue', state: engaged ? 'match' : op.revenueRanges.includes(rev) ? 'partial' : 'low', text: engaged ? `Has worked with ${RN.w.label('revenueRange', rev)} companies` : op.revenueRanges.includes(rev) ? `Targets ${RN.w.label('revenueRange', rev)} companies` : `No experience listed at ${RN.w.label('revenueRange', rev)}` });
    }
    const emp = brief.employeeRange;
    if (emp && (op.employeeRanges.length || op.engagements.some((e) => e.employeeRange))) {
      const engagedEmp = op.engagements.some((e) => e.employeeRange === emp);
      const targets = op.employeeRanges.includes(emp);
      sig.push({ k: 'employees', l: 'Employee range', state: engagedEmp || targets ? 'match' : 'low', text: engagedEmp ? `Has worked with ${RN.w.label('employeeRange', emp)} employee companies` : targets ? `Works with ${RN.w.label('employeeRange', emp)} employee companies` : `No experience listed at ${RN.w.label('employeeRange', emp)} employees` });
    }
    const motions = [].concat(brief.salesMotions || brief.motion || []).filter(Boolean);
    // Only score GTM motion when the operator has listed one (no live operator has yet)
    if (motions.length && op.motions.length) {
      const hit = motions.filter((m) => op.motions.includes(m));
      sig.push({ k: 'motion', l: 'GTM motion', state: hit.length ? 'match' : 'low', text: hit.length ? `Runs ${hit.join(' and ')}` : `Hasn't listed ${motions.join(' or ')}` });
    }
    const inds = [].concat(brief.industries || brief.industry || []).filter(Boolean);
    if (inds.length && op.industries.length) {
      const hit = inds.filter((i) => op.industries.includes(i));
      sig.push({ k: 'industry', l: 'Industry', state: hit.length ? 'match' : 'low', text: hit.length ? `Has worked in ${RN.w.labels('industries', hit)}` : `No ${RN.w.labels('industries', inds, ' or ')} experience listed` });
    }
    const needTags = [].concat(brief.tags || []);
    const needCats = brief.need ? F.needCats[brief.need] || [] : brief.roleCategory ? [brief.roleCategory] : [];
    if (needTags.length || needCats.length) {
      const verified = op.tags.filter((t) => t.tier !== 'claimed');
      const tagHits = needTags.filter((t) => op.tags.some((x) => x.t.toLowerCase() === t.toLowerCase()));
      const vHits = needTags.filter((t) => verified.some((x) => x.t.toLowerCase() === t.toLowerCase()));
      const catHit = verified.some((t) => needCats.includes(t.c)) || needCats.includes(op.catKey);
      const state = vHits.length || (catHit && verified.length) ? 'match' : tagHits.length || catHit ? 'partial' : 'low';
      sig.push({ k: 'expertise', l: 'Expertise', state, text: vHits.length ? `Client-verified in ${vHits.slice(0, 2).join(' and ')}` : tagHits.length ? `Claims ${tagHits.slice(0, 2).join(' and ')}` : catHit ? `Works in ${RN.fields.catLabel(op.catKey)}` : 'No matching expertise listed' });
    }
    const pts = sig.reduce((a, s) => a + (s.state === 'match' ? 1 : s.state === 'partial' ? 0.5 : 0), 0);
    const pct = sig.length ? Math.round((pts / sig.length) * 100) : 0;
    // Availability and budget as hard context (not signals)
    const notes = [];
    if (brief.availability && brief.availability === 'available_now' && op.avail.key !== 'available_now') notes.push(`${first} is ${op.avail.label.toLowerCase()}`);
    if (brief.rateMax && op.rate && op.rate > brief.rateMax) notes.push(`Rate above your budget`);
    return { pct, label: pct >= 75 ? 'Strong match' : pct >= 50 ? 'Good match' : 'Partial match', signals: sig, notes, count: sig.filter((s) => s.state === 'match').length };
  };
  M.rank = function (brief, o) {
    o = o || {};
    const f = { roleCategories: brief.roleCategory ? [brief.roleCategory] : [] };
    return M.search({ filters: f }).map((r) => Object.assign(r, { fit: M.fit(r.op, brief) }))
      .sort((a, b) => b.fit.pct - a.fit.pct || b.op.ris.score - a.op.ris.score || b.score - a.score)
      .slice(0, o.limit || 12);
  };

  /* ---------- Analytics (Studio + Admin) ----------
     Baseline history is deterministic per operator (illustrative) and live session events are added on top.
     Company names are never shown to operators: visits are reported by firmographic segment,
     and segments under 5 visits are grouped (Performance & Insights spec). */
  const DAY = 864e5;
  function baseline(op, days) {
    const rand = RN.rng('an-' + op.id);
    const catDemand = { sales_leadership: 1.2, revenue_operations: 1.1, marketing: 0.9, ai_gtm: 1.05, sales_enablement: 0.7, customer_success_growth: 0.75, partnerships: 0.5, sellers: 0.6 }[op.catKey] || 0.8;
    const quality = 0.45 + op.completeness / 100 + (op.ris.score - 50) / 40 + op.tags.filter((t) => t.tier !== 'claimed').length * 0.03;
    const perDay = 7 * catDemand * quality;
    const ctr = 0.035 + (op.headline ? 0.02 : 0) + (op.photo ? 0.012 : 0) + (op.video ? 0.01 : 0);
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const dow = new Date(RN.now().getTime() - i * DAY).getDay();
      const wk = dow === 0 || dow === 6 ? 0.45 : 1;
      const trend = 1 + ((days - i) / days) * 0.25;
      const imp = Math.max(0, Math.round(perDay * wk * trend * (0.6 + rand() * 0.8)));
      const views = Math.round(imp * ctr * (0.7 + rand() * 0.6) + (rand() < 0.15 ? 1 : 0));
      series.push({ imp, views });
    }
    return { series, rand, catDemand };
  }
  /* Helpers used only by M.analytics */
  const visitsOf = (s) => s.views + s.shortlists + s.compares;
  // Readable label for one browse filter value, in the registry's words ('' when the value filters nothing)
  function filterLabel(k, v) {
    const L = (f, x) => RN.w.label(f, x);
    switch (k) {
      case 'roleCategories': return F.roleCategory.label + ': ' + F.catLabel(v);
      case 'industries': return F.industry.label + ': ' + L('industries', v);
      case 'revenueRange': return 'Company revenue: ' + L('revenueRange', v);
      case 'employeeRange': return F.employeeRange.label + ': ' + L('employeeRange', v);
      case 'availability': return F.availability.label + ': ' + L('availability', v);
      case 'hoursPerMonth': return String(v) === '19' ? '' : F.hoursPerMonth.label + ': at least ' + L('hoursPerMonth', v);
      case 'engagementTypes': return F.engagementType.label + ': ' + L('engagementTypes', v);
      case 'salesMotions': return F.salesMotions.label + ': ' + L('salesMotions', v);
      case 'rateMax': return +v >= F.rateMax.max ? '' : 'Hourly rate: up to $' + Math.round(+v);
      case 'risMin': return F.risMin.label + ': ' + L('risMin', v);
      default: return '';
    }
  }
  /* Segments under 5 visits: first try one-field groups of 5+ (revenue, employee range, then industry), taking the
     biggest group each time so no visit counts twice. Whatever is left is "Other companies". */
  function groupSmall(small) {
    let pool = small.slice();
    const groups = [];
    for (;;) {
      let best = null;
      ['revenueRange', 'employeeRange', 'industry'].forEach((dim) => {
        const m = {};
        pool.forEach((s) => {
          if (!s[dim]) return;
          const g = m[s[dim]] || (m[s[dim]] = { dim, v: s[dim], views: 0, shortlists: 0, compares: 0, last: s.last });
          g.views += s.views; g.shortlists += s.shortlists; g.compares += s.compares;
          if (s.last > g.last) g.last = s.last;
        });
        Object.values(m).forEach((g) => { if (visitsOf(g) >= 5 && (!best || visitsOf(g) > visitsOf(best))) best = g; });
      });
      if (!best) break;
      groups.push(best);
      pool = pool.filter((s) => s[best.dim] !== best.v);
    }
    return { groups, other: pool.reduce((a, s) => a + visitsOf(s), 0) };
  }
  /* What the picked operator had that this one did not. Anonymized: category and tier only, never a name. */
  const AVAIL_RANK = { available_now: 0, available_2_weeks: 1, available_2_plus_weeks: 2 };
  function lostRow(op, p, industry) {
    const edge = [];
    if (industry && p.industries.includes(industry) && !op.industries.includes(industry)) edge.push('experience in ' + RN.w.label('industries', industry));
    if (p.reviews.length > op.reviews.length) edge.push('more client reviews');
    if (p.tags.filter((t) => t.tier !== 'claimed').length > op.tags.filter((t) => t.tier !== 'claimed').length) edge.push('more client-verified focus areas');
    if ((AVAIL_RANK[p.avail.key] || 0) < (AVAIL_RANK[op.avail.key] || 0)) edge.push('could start sooner');
    if (p.rate && op.rate && p.rate < op.rate * 0.9) edge.push('a lower rate');
    if (p.video && !op.video) edge.push('an intro video');
    const other = p.industries.find((i) => !op.industries.includes(i));
    if (edge.length < 2 && other && !edge.some((e) => /^experience in/.test(e))) edge.push('experience in ' + RN.w.label('industries', other));
    if (!edge.length) edge.push('a closer stage fit');
    return { who: `An operator in ${F.catLabel(p.catKey)}, ${p.ris.label} tier`, cat: p.catKey, tier: p.ris.label, edge: edge.slice(0, 3) };
  }
  /* Loop 3: a client compared this operator with others (compare_view, meta.with) and then, within 14 days, asked
     to meet, selected or shortlisted one of the others and not this operator. Released 7 days after the decision. */
  function lostFromEvents(op) {
    const all = (RN.store && RN.store.state.events) || [];
    const now = RN.now().getTime();
    const ms = (e) => new Date(e.ts).getTime();
    const client = (e) => e.persona === 'buyer' || e.persona === 'visitor';
    const who = (e) => (e.buyer && e.buyer.name) || '';
    const same = (a, b) => !who(a) || !who(b) || who(a) === who(b);
    const cmps = all.filter((e) => e.type === 'compare_view' && e.opId === op.id && client(e) && e.meta && (e.meta.with || []).length && now - ms(e) < 97 * DAY);
    const acts = all.filter((e) => client(e) && ['intro_request', 'project_select', 'shortlist_add'].includes(e.type));
    const byKey = {};
    let pending = 0, until = null;
    cmps.forEach((c) => {
      const after = acts.filter((d) => same(c, d) && ms(d) >= ms(c) - 6e4 && ms(d) - ms(c) <= 14 * DAY);
      if (after.some((d) => d.opId === op.id && d.type !== 'shortlist_add')) return;           // they chose you
      const strong = after.filter((d) => d.type !== 'shortlist_add' && c.meta.with.includes(d.opId));
      const soft = after.filter((d) => d.type === 'shortlist_add' && c.meta.with.includes(d.opId));
      const pick = strong[0] || (soft.length && !after.some((d) => d.opId === op.id) ? soft[0] : null);
      if (!pick) return;
      const key = (who(c) || 'anon') + '|' + pick.opId;
      if (byKey[key]) return;                                                                  // one decision, logged once
      const release = ms(pick) + 7 * DAY;
      if (now < release) { byKey[key] = { pending: true }; pending += 1; until = until == null ? release : Math.min(until, release); return; }
      const p = M.byId(pick.opId);
      if (!p) return;
      byKey[key] = Object.assign(lostRow(op, p, c.buyer && c.buyer.industry), { key: 'live|' + key, n: 1, picked: strong[0] ? (pick.type === 'project_select' ? 'selected' : 'requested an intro') : 'shortlisted', live: true, ts: pick.ts });
    });
    const rows = [];
    Object.values(byKey).filter((x) => !x.pending).forEach((r) => {
      // Batch: the same kind of operator picked for the same reason reads as one row with a count
      const hit = rows.find((x) => x.who === r.who && x.picked === r.picked);
      if (hit) hit.n += 1; else rows.push(r);
    });
    return { rows, pending: pending ? { n: pending, until: new Date(until).toISOString() } : null };
  }
  M.analytics = function (opId, o) {
    o = o || {};
    const days = o.days || 30;
    const op = M.byId(opId);
    if (!op) return null;
    const base = baseline(op, days * 2);
    const cur = base.series.slice(days), prev = base.series.slice(0, days);
    const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
    const rand = base.rand;
    // Live events from clients and visitors only (operator self-views and team activity are excluded)
    const ev = ((RN.store && RN.store.state.events) || []).filter((e) => e.opId === opId && (e.persona === 'buyer' || e.persona === 'visitor') && new Date(e.ts) >= new Date(RN.now().getTime() - days * DAY));
    const live = (t) => ev.filter((e) => e.type === t).length;
    const impressions = sum(cur, 'imp') + live('impression');
    const views = sum(cur, 'views') + live('profile_view');
    const shortlists = Math.round(views * 0.09) + live('shortlist_add');
    const compares = Math.round(views * 0.12) + live('compare_add') + live('compare_view');
    const since = (d0, d1) => ((RN.store && RN.store.state.intros) || []).filter((i) => i.opId === opId && new Date(i.createdAt) >= new Date(RN.now().getTime() - d0 * DAY) && new Date(i.createdAt) < new Date(RN.now().getTime() - d1 * DAY)).length;
    const intros = since(days, -1) + Math.round(views * 0.015);
    const proofViews = ((RN.store && RN.store.state.proofLinks) || []).filter((p) => p.opId === opId).reduce((a, p) => a + p.views.length, 0);
    const prevT = { impressions: sum(prev, 'imp'), views: sum(prev, 'views'), shortlists: Math.round(sum(prev, 'views') * 0.085), compares: Math.round(sum(prev, 'views') * 0.11), intros: since(days * 2, days) + Math.round(sum(prev, 'views') * 0.015) };

    // Why you appeared: queries in your category or tags, weighted (illustrative), then this session's live searches
    const Q = RN.data.market.queries;
    const opTags = op.tags.map((t) => t.t.toLowerCase());
    const qs = Q.filter((q) => q.cat === op.catKey || q.tags.some((t) => opTags.includes(t.toLowerCase())))
      .map((q) => { const hit = q.tags.filter((t) => opTags.includes(t.toLowerCase())); const n = Math.round(q.vol * (0.05 + hit.length * 0.05) * (0.6 + rand() * 0.8) * (days / 30)); return { q: q.q, tags: hit, n, clicks: Math.round(n * (0.04 + rand() * 0.06)) }; })
      .filter((q) => q.n > 0);
    // A profile view opened from a search result within 30 minutes of a live impression counts as a click on that term
    const pv = ev.filter((e) => e.type === 'profile_view');
    const usedPv = new Set();
    ev.filter((e) => e.type === 'impression' && e.q).slice().reverse().forEach((e) => {
      const key = String(e.q).trim().toLowerCase();
      let x = qs.find((q) => q.q.toLowerCase() === key);
      if (x) { x.n += 1; x.live = true; } else { x = { q: String(e.q).trim(), tags: [], n: 1, clicks: 0, live: true }; qs.push(x); }
      const gap = (v) => new Date(v.ts) - new Date(e.ts);
      const hit = pv.find((v) => !usedPv.has(v.id) && v.persona === e.persona && (v.q ? String(v.q).trim().toLowerCase() === key : ['card', 'search'].includes(v.source)) && gap(v) >= 0 && gap(v) < 30 * 6e4);
      if (hit) { usedPv.add(hit.id); x.clicks += 1; }
    });
    qs.sort((a, b) => b.n - a.n);
    const qTotal = qs.reduce((a, q) => a + q.n, 0) || 1;
    qs.forEach((q) => { q.share = q.n / qTotal; q.clicks = Math.min(q.clicks, q.n); });

    // Filters clients had on when your card showed: live impression filters, plus illustrative rows this operator
    // can actually satisfy (a filter that would have hidden them is never listed)
    const baseImp = sum(cur, 'imp');
    const fl = {};
    const addF = (k, v, n, isLive) => {
      const l = filterLabel(k, v);
      if (!l || !n) return;
      const x = fl[l] || (fl[l] = { l, k, v, n: 0, liveN: 0 });
      x.n += n;
      if (isLive) x.liveN += n;
    };
    addF('roleCategories', op.catKey, Math.round(baseImp * 0.46));
    if (op.industries[0]) addF('industries', op.industries[0], Math.round(baseImp * 0.21));
    if (op.revenueRanges.length) addF('revenueRange', op.revenueRanges[op.revenueRanges.length - 1], Math.round(baseImp * 0.17));
    if (op.avail.key === 'available_now') addF('availability', 'available_now', Math.round(baseImp * 0.14));
    else {
      const hrs = F.hoursPerMonth.options.map((x) => x.v).filter((h) => +h >= 20 && +h <= 40 && +op.avail.hoursCode >= +h).pop();
      if (hrs) addF('hoursPerMonth', hrs, Math.round(baseImp * 0.12));
    }
    const risT = F.risMin.options.map((x) => x.v).filter((v) => op.ris.score >= +v).pop();
    if (risT) addF('risMin', risT, Math.round(baseImp * 0.06));
    ev.filter((e) => e.type === 'impression' && e.filters).forEach((e) => Object.keys(e.filters).forEach((k) => [].concat(e.filters[k]).filter((v) => v !== '' && v != null).forEach((v) => addF(k, v, 1, true))));
    const filters = Object.values(fl).sort((a, b) => b.n - a.n).map((x) => Object.assign(x, { live: x.liveN > 0 }));

    // Who viewed: firmographic segments (no company names)
    const C = RN.data.market.companies;
    const segs = {};
    const add = (industry, revenueRange, employeeRange, kind, ts) => {
      const k = [industry, revenueRange, employeeRange].join('|');
      segs[k] = segs[k] || { industry, revenueRange, employeeRange, views: 0, shortlists: 0, compares: 0, last: ts };
      segs[k][kind] += 1;
      if (ts > segs[k].last) segs[k].last = ts;
    };
    const baseViews = sum(cur, 'views');
    for (let i = 0; i < baseViews; i++) {
      const pool = C.filter((c) => op.industries.includes(c.industry) || op.revenueRanges.includes(c.revenueRange));
      const c = rand() < 0.72 && pool.length ? RN.pick(rand, pool) : RN.pick(rand, C);
      const kind = rand() < 0.1 ? 'shortlists' : rand() < 0.12 ? 'compares' : 'views';
      add(c.industry, c.revenueRange, c.employeeRange, kind, new Date(RN.now().getTime() - Math.floor(rand() * days) * DAY).toISOString());
    }
    const SEG_EV = ['profile_view', 'shortlist_add', 'compare_add'];
    const segEv = ev.filter((e) => e.buyer && SEG_EV.includes(e.type));
    segEv.forEach((e) => add(e.buyer.industry, e.buyer.revenueRange, e.buyer.employeeRange, e.type === 'profile_view' ? 'views' : e.type === 'shortlist_add' ? 'shortlists' : 'compares', e.ts));
    const all = Object.values(segs).sort((a, b) => (b.views + b.shortlists * 3 + b.compares * 2) - (a.views + a.shortlists * 3 + a.compares * 2));
    // Only the exact segment of a live client in this session is exempt from the 5-visit rule (prototype demo)
    all.forEach((s) => { s.live = segEv.some((e) => e.buyer.industry === s.industry && e.buyer.revenueRange === s.revenueRange && e.buyer.employeeRange === s.employeeRange); });
    const viewers = all.filter((s) => visitsOf(s) >= 5 || s.live);
    const pooled = groupSmall(all.filter((s) => !viewers.includes(s)));

    const mix = (key, field) => {
      const m = {};
      Object.values(segs).forEach((s) => { m[s[key]] = (m[s[key]] || 0) + visitsOf(s); });
      return Object.entries(m).map(([v, n]) => ({ v, l: RN.w.label(field, v), n })).sort((a, b) => b.n - a.n);
    };

    // Compared, not chosen: this session's decisions first, then illustrative rows. Never names the other operator.
    const lostLive = lostFromEvents(op);
    const lost = lostLive.rows.slice();
    const peers = M.ops.filter((x) => x.id !== op.id && x.catKey === op.catKey).slice(0, 40);
    const target = Math.min(3, Math.max(2, Math.round(compares / 6)));
    for (let i = 0; i < 60 && lost.length < target; i++) {
      const p = RN.pick(rand, peers);
      if (!p || lost.some((l) => l.key === p.id)) continue;
      const row = lostRow(op, p, null);
      // Illustrative rows show different kinds of operators and reasons, so each one teaches something
      if (i < 40 && lost.some((l) => l.who === row.who && l.edge.join() === row.edge.join())) continue;
      lost.push(Object.assign(row, { key: p.id, n: 1 + Math.floor(rand() * 3), picked: rand() < 0.5 ? 'shortlisted' : 'requested an intro', illus: true }));
    }

    // Traffic sources
    const sources = [
      { l: 'Browse and search', n: Math.round(views * 0.44) }, { l: 'Category and role pages', n: Math.round(views * 0.16) },
      { l: 'Google search', n: Math.round(views * 0.15) }, { l: 'AI answers (ChatGPT, Perplexity)', n: Math.round(views * 0.08) },
      { l: 'Your proof links and badge', n: Math.round(views * 0.1) + proofViews }, { l: 'Homepage and Insights', n: Math.round(views * 0.07) },
    ];
    // Peer benchmark in the same role category
    const peerViews = M.ops.filter((x) => x.catKey === op.catKey).map((x) => sum(baseline(x, days).series, 'views')).sort((a, b) => a - b);
    const median = peerViews[Math.floor(peerViews.length / 2)] || 0;
    const pctile = Math.min(99, Math.round((peerViews.filter((v) => v < views).length / Math.max(1, peerViews.length)) * 100));

    const labels = cur.map((_, i) => RN.fmt.dateShort(new Date(RN.now().getTime() - (days - 1 - i) * DAY)));
    return {
      days, op,
      totals: { impressions, views, shortlists, compares, intros, proofViews, appearances: Math.round(impressions * 0.31) },
      prev: prevT,
      series: { labels, impressions: cur.map((d) => d.imp), views: cur.map((d) => d.views) },
      queries: qs.slice(0, 10).concat(qs.slice(10).filter((q) => q.live)), filters,
      // viewers: segments with 5+ visits (or this session's live segment); groups: one-field groups of 5+ built from
      // the smaller segments; otherViewers: what is left, shown only as "Other companies"
      viewers, groups: pooled.groups, otherViewers: pooled.other,
      mix: { industry: mix('industry', 'industries'), revenue: mix('revenueRange', 'revenueRange'), employees: mix('employeeRange', 'employeeRange') },
      lost, lostPending: lostLive.pending, sources,
      benchmark: { median, pctile, n: peerViews.length },
      funnel: [{ label: 'Search impressions', value: impressions }, { label: 'Profile views', value: views }, { label: 'Shortlists', value: shortlists }, { label: 'Intro requests', value: intros }],
      live: ev,
    };
  };

  /* ---------- Market intelligence ---------- */
  M.market = function () {
    const Q = RN.data.market.queries;
    const supply = {}, verified = {};
    M.ops.forEach((op) => op.tags.forEach((t) => { const k = t.t.toLowerCase(); supply[k] = (supply[k] || 0) + 1; if (t.tier !== 'claimed') verified[k] = (verified[k] || 0) + 1; }));
    const demand = {};
    Q.forEach((q) => q.tags.forEach((t) => { const k = t.toLowerCase(); demand[k] = (demand[k] || 0) + q.vol / q.tags.length; }));
    ((RN.store && RN.store.state.events) || []).filter((e) => e.type === 'search' && e.tags).forEach((e) => e.tags.forEach((t) => { const k = t.toLowerCase(); demand[k] = (demand[k] || 0) + 10; }));
    const tags = Object.keys(demand).map((k) => { const info = M.tagInfo(k) || { v: k, c: '' }; return { t: info.v || k, c: info.c, demand: Math.round(demand[k]), supply: supply[k] || 0, verified: verified[k] || 0, ratio: Math.round((demand[k] / Math.max(1, verified[k] || 0.5)) * 10) / 10 }; })
      .sort((a, b) => b.ratio - a.ratio);
    const catSupply = {};
    M.ops.forEach((op) => { catSupply[op.catKey] = (catSupply[op.catKey] || 0) + 1; });
    // Only searches that truly return no operators today count as unmet demand
    const zero = Q.filter((q) => M.search({ q: q.q }).length === 0).map((q) => ({ q: q.q, vol: q.vol, cat: q.cat, industry: q.industry }));
    ((RN.store && RN.store.state.events) || []).filter((e) => e.type === 'search' && e.results === 0 && e.q).forEach((e) => zero.unshift({ q: e.q, vol: 1, cat: '', live: true, ts: e.ts }));
    return { tags, catSupply, zero, queries: Q };
  };

  /* Positioning for one operator: rate vs Rate Index, tag opportunities, completeness */
  M.positioning = function (opId) {
    const op = M.byId(opId);
    const idx = RN.data.market.rateIndex.byCat[op.catKey] || RN.data.market.rateIndex.byCat.sales_leadership;
    const rate = op.rate;
    const pctile = rate ? Math.round(RN.clamp(((rate - idx.p25) / (idx.p75 - idx.p25)) * 50 + 25, 1, 99)) : null;
    const mk = M.market();
    const opTags = new Map(op.tags.map((t) => [t.t.toLowerCase(), t]));
    const opps = mk.tags.filter((t) => t.c === op.catKey || opTags.has(t.t.toLowerCase())).slice(0, 12).map((t) => {
      const mine = opTags.get(t.t.toLowerCase());
      const action = !mine ? 'Add this tag if it fits your work' : mine.tier === 'claimed' ? 'Ask a past client to verify it' : 'Feature it in your headline';
      return Object.assign({}, t, { have: !!mine, tier: mine ? mine.tier : null, action });
    });
    return { op, rate, idx, pctile, opps, checklist: M.checklist(op), completeness: op.completeness };
  };

  /* Rate Index maths, shared by Home, Rates, Blueprints, Browse category pages and Studio.
     hoursCode '19' (<20) counts as 15 hours. Monthly range rounds to $500 in the L58 format. */
  M.rateFor = function (cat, rev) {
    const RI = RN.data.market.rateIndex;
    const b = RI.byCat[cat] || RI.byCat.sales_leadership;
    const m = (rev && RI.byRevenue[rev]) || 1;
    return { p25: b.p25 * m, p50: b.p50 * m, p75: b.p75 * m, n: b.n, m };
  };
  M.hoursNum = (code) => (String(code) === '19' ? 15 : +code || 0);
  M.monthlyRange = function (cat, rev, hoursCode) {
    const r = M.rateFor(cat, rev), h = M.hoursNum(hoursCode);
    const r500 = (n) => Math.round(n / 500) * 500;
    return { lo: r500(r.p25 * h), mid: r500(r.p50 * h), hi: r500(r.p75 * h), h, r, label: `${RN.fmt.usd(r500(r.p25 * h))} - ${RN.fmt.usd(r500(r.p75 * h))}/mo` };
  };

  /* Taxonomy curation (Revenue Nomad Research, taxonomy v1): moves tags to the journey stage they change and
     fills missing definitions, so the profile bowtie, the Framework grid and the Library agree. */
  M.curate = function (stageMap, defOf) {
    F.fitTags.options.forEach((o) => { if (stageMap[o.v]) o.stage = stageMap[o.v]; if (!o.d && defOf) o.d = defOf(o.v) || ''; });
    M.ops.forEach((op) => op.tags.forEach((t) => { if (stageMap[t.t]) t.stage = stageMap[t.t]; }));
  };

  /* Similar operators (after an intro, on profiles, in compare suggestions) */
  M.similar = function (op, n) {
    return M.ops.filter((x) => x.id !== op.id && !x.hidden && x.catKey === op.catKey)
      .map((x) => ({ x, s: x.tags.filter((t) => op.tags.some((y) => y.t === t.t)).length * 3 + x.industries.filter((i) => op.industries.includes(i)).length + x.ris.score / 20 }))
      .sort((a, b) => b.s - a.s).slice(0, n || 3).map((r) => r.x);
  };
})();
