/* Tool to Talk to us handoff (RN.handoff).
   When a visitor finishes one of our tools (the GTM diagnostic on #framework, the Rate Index estimator and the
   fractional vs full-time calculator on #rates), the tool hands what they told us and what they found to Talk to us,
   so they do not answer the same questions twice and our team gets a qualified request.

     RN.handoff.set(payload)  store it (sessionStorage, 2 hours) and track `handoff` {source}; returns the record
     RN.handoff.get()         the record, or null when none, expired or unreadable
     RN.handoff.clear()       forget it (Talk to us calls this on Remove and once the request is sent)
     RN.handoff.go(payload)   set it, then open #talk
     RN.handoff.label(src)    "From your diagnostic", "From the estimator", "From the cost calculator"
     RN.handoff.needFor(cat, area)  the RN.fields.need value a role category (and diagnostic area) points to
     RN.handoff.text(rec)     the record as plain lines for the team's email

   Payload (every field optional except source and summary; unknown keys are dropped):
     source            'diagnostic' | 'estimator' | 'calculator'
     need              RN.fields.need value (the first Talk to us question)
     companyRevenue    RN.fields.companyRevenue value (the band the tool's figures use)
     revenueChosen     false when that band is the tool's default, not one the visitor picked (Talk to us then
                       does not fill it in as their answer)
     companyEmployees  RN.fields.companyEmployees value
     roleCategory      RN.fields.roleCategory value, role  the title it recommends ("VP of Sales")
     hours             RN.fields.hoursPerMonth code ('40')
     summary           one plain sentence of what they found
     details           up to 6 labelled facts, [{ l, v }]
     illustrative      true when the figures come from the illustrative Rate Index (the summary says so too)
   No email, name or other personal data: the tools never ask for it, and anything that looks like an email address is
   stripped. The visitor types their own details in Talk to us. */
window.RN = window.RN || {};
(function () {
  'use strict';
  const RN = window.RN;
  const KEY = 'rn-handoff-v1';
  const TTL = 2 * 60 * 60 * 1000;
  const SOURCES = { diagnostic: 'From your diagnostic', estimator: 'From the estimator', calculator: 'From the cost calculator' };
  const EMAILISH = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g;
  // Wall clock for the expiry (RN.now is the simulated product clock and can be frozen in the prototype)
  const now = () => Date.now();

  const clean = (s, max) => String(s == null ? '' : s).replace(EMAILISH, '').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim().slice(0, max || 240);
  const opt = (field, v) => {
    const F = RN.fields && RN.fields[field];
    if (v == null || v === '') return undefined;
    v = String(v);
    return !F || !F.options || F.options.some((o) => o.v === v) ? v : undefined;
  };

  function read() {
    try { return JSON.parse(window.sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  const H = (RN.handoff = {
    KEY, TTL, SOURCES,
    set(p) {
      p = p || {};
      const source = SOURCES[p.source] ? p.source : 'other';
      const rec = {
        id: 'ho_' + now().toString(36) + Math.random().toString(36).slice(2, 6),
        source,
        need: opt('need', p.need),
        companyRevenue: opt('companyRevenue', p.companyRevenue),
        revenueChosen: p.revenueChosen === false ? false : undefined,
        companyEmployees: opt('companyEmployees', p.companyEmployees),
        roleCategory: opt('roleCategory', p.roleCategory),
        role: p.role ? clean(p.role, 80) : undefined,
        hours: opt('hoursPerMonth', p.hours),
        summary: clean(p.summary, 220),
        details: (Array.isArray(p.details) ? p.details : []).map((d) => ({ l: clean(d && d.l, 40), v: clean(d && d.v, 160) })).filter((d) => d.l && d.v).slice(0, 6),
        illustrative: !!p.illustrative,
        ts: now(),
        exp: now() + TTL,
      };
      Object.keys(rec).forEach((k) => { if (rec[k] === undefined) delete rec[k]; });
      try { window.sessionStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { H._mem = rec; }
      if (RN.track) RN.track('handoff', { source, meta: { need: rec.need || null, roleCategory: rec.roleCategory || null, revenueRange: rec.companyRevenue || null, hours: rec.hours || null } });
      return rec;
    },
    get() {
      const rec = read() || H._mem || null;
      if (!rec || !rec.id || !rec.summary) return null;
      if (!(rec.exp > now())) { H.clear(); return null; }
      return rec;
    },
    clear() {
      H._mem = null;
      try { window.sessionStorage.removeItem(KEY); } catch (e) { /* nothing stored */ }
    },
    go(p) {
      const rec = H.set(p);
      if (RN.go) RN.go('talk');
      return rec;
    },
    label: (src) => SOURCES[src] || 'From our tools',
    // A role category (and, from the diagnostic, the leak's area) as the Talk to us need
    needFor(cat, area) {
      if (area === 'Build the team') return 'team';
      return { sales_leadership: 'sales_motion', sellers: 'sales_motion', sales_enablement: 'team', marketing: 'pipeline', revenue_operations: 'systems', customer_success_growth: 'retention', ai_gtm: 'ai', partnerships: 'partners' }[cat] || 'not_sure';
    },
    text(rec) {
      if (!rec) return [];
      return [`${H.label(rec.source)}: ${rec.summary}${/[.?!]$/.test(rec.summary) ? '' : '.'}`].concat((rec.details || []).map((d) => `  ${d.l}: ${d.v}`));
    },
  });
  H._mem = null;
})();
