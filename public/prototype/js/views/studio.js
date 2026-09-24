/* Operator Studio shell. Tabs are registered by studio-*.js files:
     RN.studio.tab('visibility', { label, icon, group, order, badge: (op) => n, render: (op) => html, mount: (root, op) => {} })
   Route: #studio (overview) and #studio.<tab>. The signed-in operator is RN.myOp(). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const studio = (RN.studio = RN.studio || { tabs: {} });
  studio.tab = function (key, def) { def.key = key; studio.tabs[key] = def; return def; };
  studio.list = () => Object.values(studio.tabs).sort((a, b) => (a.order || 99) - (b.order || 99));

  function side(op, cur) {
    const groups = {};
    studio.list().forEach((t) => { (groups[t.group || 'Studio'] = groups[t.group || 'Studio'] || []).push(t); });
    return `<nav class="side" aria-label="Studio">
      <div class="side-id">${RN.ui.avatar(op, 'ava-md')}<div><b>${esc(op.name)}</b><span>${esc(op.ris.label)} · ${esc(op.ris.score)} Reputation Index</span></div></div>
      ${Object.keys(groups).map((g, gi) => `${gi ? '<div class="side-sep"></div>' : ''}<span class="label side-label">${esc(g)}</span>
        ${groups[g].map((t) => { const n = t.badge ? t.badge(op) : 0; return `<a href="#studio${t.key === 'overview' ? '' : '.' + t.key}" class="${cur === t.key ? 'on' : ''}">${icon(t.icon || 'chart')}${esc(t.label)}${n ? `<span class="nav-count">${n}</span>` : ''}</a>`; }).join('')}`).join('')}
      <div class="side-sep"></div>
      <a href="#op.${esc(op.slug)}">${icon('eye')}View public profile</a>
    </nav>`;
  }

  RN.view('studio', {
    route: 'studio', nav: '', requires: 'operator', footer: false,
    title: () => 'Studio',
    render: () => render('overview'),
    mount: (root) => mountTab(root, 'overview'),
  });
  RN.view('studio-tab', {
    route: 'studio.:tab', nav: '', requires: 'operator', footer: false,
    samples: { tab: 'visibility', extra: [] },
    title: (p) => (studio.tabs[p.tab] ? studio.tabs[p.tab].label : 'Studio') + ' · Studio',
    render: (p) => render(p.tab),
    mount: (root, p) => mountTab(root, p.tab),
  });
  // every registered tab gets a smoke-test route
  setTimeout(() => { RN.views['studio-tab'].samples.extra = Object.keys(studio.tabs).filter((k) => k !== 'overview').map((k) => 'studio.' + k); }, 0);

  function render(key) {
    RN.model.applyEdits();
    const op = RN.myOp();
    const t = studio.tabs[key];
    const body = t ? t.render(op) : `<div class="empty">${icon('info')}<b>This part of Studio is being built</b></div>`;
    return `<div class="wrap shell" data-studio="${esc(key)}">${side(op, key)}<div class="studio-main" style="min-width:0">${body}</div></div>`;
  }
  function mountTab(root, key) {
    const t = studio.tabs[key];
    if (t && t.mount) t.mount(root, RN.myOp());
  }
})();
