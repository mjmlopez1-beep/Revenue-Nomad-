/* Exports the text the vector search embeds: one document per operator, every focus area, every role
   category, and the word vocabulary. usage: node tools/export-search-corpus.js <out.json>
   Then: python tools/build_vectors.py <out.json> (writes js/data/vectors.js). */
const fs = require('fs');
const path = require('path');
global.window = global; global.RN = { data: {} };
const dir = path.join(__dirname, '..', 'js', 'data');
['operators.js', 'ops_sample.js', 'taxonomy.js'].forEach((f) => require(path.join(dir, f)));
const CAT = { 'Sales Leadership': 'sales_leadership', Marketing: 'marketing', 'Revenue Operations': 'revenue_operations', 'Sales Enablement': 'sales_enablement', 'Customer Success & Growth': 'customer_success_growth', 'AI GTM': 'ai_gtm', Partnerships: 'partnerships', Sellers: 'sellers' };
const CAT_TEXT = {
  sales_leadership: 'Sales leadership: owns the number, builds the sales process, hires and coaches reps, pipeline and forecast, founder-led sales.',
  marketing: 'Marketing leadership: positioning, demand generation, brand, content, campaigns and pipeline from marketing.',
  revenue_operations: 'Revenue operations: CRM, HubSpot and Salesforce, data, routing, reporting, dashboards and forecasting.',
  sales_enablement: 'Sales enablement: onboarding, ramp, playbooks, training, coaching and methodology for reps.',
  customer_success_growth: 'Customer success: retention, churn, renewals, onboarding customers, expansion and upsell.',
  ai_gtm: 'AI GTM: automation, Clay workflows, enrichment, AI SDRs and AI tools for go-to-market.',
  partnerships: 'Partnerships: channel partners, resellers, alliances, integrations and partner-sourced pipeline.',
  sellers: 'Sellers: account executives, SDRs and account managers who prospect, run deals and close.',
};
const ops = RN.data.rawOps.map((o) => {
  const p = o.profile || {}, d = p.details || {};
  const parts = [o.role + '.', p.desc || '', p.bio || '',
    'Focus areas: ' + (p.tags || []).map((t) => t.t).join('; ') + '.',
    'Industries: ' + ((d.standard || o.standard || {}).industries || []).join(', ') + '.',
    ...(d.engagements || []).map((e) => `${e.role || ''}${e.outcome ? '. ' + e.outcome : ''}${e.problem ? '. ' + e.problem : ''}`),
    ...(p.reviews || []).map((r) => r.quote || '')];
  return { id: o.id, cat: CAT[o.cat] || o.cat, text: parts.filter(Boolean).join('\n').slice(0, 4000) };
});
const tags = RN.data.tagLibrary.map((t) => ({ v: t.v, c: t.c, text: t.v + (t.d ? '. ' + t.d : '') }));
const out = process.argv[2] || 'search-corpus.json';
fs.writeFileSync(out, JSON.stringify({ ops, tags, cats: Object.entries(CAT_TEXT).map(([k, text]) => ({ k, text })) }));
console.log('ops', ops.length, 'tags', tags.length, '->', out);
