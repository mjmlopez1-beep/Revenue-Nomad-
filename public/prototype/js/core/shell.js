/* RN.shell: global header, mobile menu, footer, compare tray, prototype dock, personas. */
(function () {
  'use strict';
  const RN = window.RN;
  const h = RN.h, esc = RN.esc, icon = RN.icon;
  const shell = (RN.shell = {});

  /* ---------- Personas (prototype sign-in) ---------- */
  RN.personas = {
    visitor: { key: 'visitor', name: 'Visitor', sub: 'Browsing, not signed in' },
    buyer: {
      key: 'buyer', name: 'Jordan Ellis', sub: 'COO, Northwind Health', first: 'Jordan', email: 'jordan@northwindhealth.com', title: 'COO',
      // Company firmographics use the same field keys and values as operator signup (see RN.fields)
      company: { name: 'Northwind Health', industry: 'Health Care', revenueRange: '20m_50m', employeeRange: '51_200', website: 'northwindhealth.com', hq: 'Boston, MA' },
    },
    operator: { key: 'operator', name: 'Matt Lopez', sub: 'Fractional VP of Sales', first: 'Matt', opId: '89623cd5-5362-4859-86f0-3f2e03f6b6ba', email: 'matt@revenuenomad.com' },
    admin: { key: 'admin', name: 'Matt Lopez', sub: 'Revenue Nomad team', first: 'Matt', email: 'matt@revenuenomad.com' },
  };
  RN.me = () => RN.personas[RN.store.state.persona];

  /* The client identity. Jordan Ellis is the demo client (seeded intros, projects, shortlist); a visitor who
     requests an intro becomes their own client, saved in seen.client. setClient(null) restores the demo. */
  const DEMO_CLIENT = JSON.parse(JSON.stringify(RN.personas.buyer));
  function applyClient(who) {
    const b = RN.personas.buyer, src = who || DEMO_CLIENT;
    b.name = src.name; b.first = String(src.name || 'Client').split(' ')[0]; b.email = src.email; b.title = src.title || '';
    b.company = Object.assign({}, DEMO_CLIENT.company, who ? { website: '', hq: '' } : {}, src.company);
    b.sub = [b.title, b.company.name].filter(Boolean).join(', ') || 'Client';
    b.demo = !who;
  }
  shell.applyClient = () => applyClient((RN.store.state.seen || {}).client || null);
  shell.setClient = function (who) {
    RN.store.update((s) => { s.seen = Object.assign({}, s.seen, { client: who || null }); delete s.seen.company; delete s.seen.companyPrefs; }, 'client');
    applyClient(who || null);
  };
  /* The demo client's saved operators appear the first time you view the system as Jordan, not for visitors */
  function enterDemoClient() {
    const st = RN.store.state;
    if (!RN.personas.buyer.demo || !(st.seen && st.seen.demoShortlist)) return;
    RN.store.update((s) => { s.shortlist = s.shortlist.concat(s.seen.demoShortlist.filter((id) => !s.shortlist.includes(id))); s.seen = Object.assign({}, s.seen); delete s.seen.demoShortlist; }, 'shortlist');
  }
  const PERSONA_HOME = { visitor: 'home', buyer: 'buyer', operator: 'studio', admin: 'admin' };
  function allowed(view, p) { return !view || !view.requires || view.requires === p || (view.requires === 'any-user' && p !== 'visitor'); }
  /* The signed-in client's match brief for RN.model.fit: company firmographics + saved match preferences */
  RN.clientBrief = function () {
    const c = RN.personas.buyer.company;
    const p = (RN.store.state.seen && RN.store.state.seen.companyPrefs) || {};
    return { revenueRange: c.revenueRange, employeeRange: c.employeeRange, industries: c.industry ? [c.industry] : [], roleCategory: p.roleCategory, salesMotions: p.salesMotions || [], engagementType: p.engagementType, need: p.need };
  };
  RN.myOp = () => (RN.store.state.persona === 'operator' ? RN.model.byId(RN.personas.operator.opId) : null);

  /* Switch persona. data-to navigates; data-stay keeps the current page (contextual log in, dock),
     moving to the persona's home only when the current page is gated for them. */
  RN.actions['persona'] = (el) => {
    const p = el.dataset.p;
    if (el.closest('.dock')) dockOpen = false;   // read before the re-render detaches the button
    RN.store.set('persona', p);
    if (p === 'buyer') enterDemoClient();
    RN.ui.closeModal();
    shell.renderHeader(); shell.renderDock();
    const cur = RN.currentRoute();
    const to = el.dataset.stay ? (allowed(cur && cur.view, p) ? '' : PERSONA_HOME[p]) : el.dataset.to;
    if (to) RN.go(to); else RN.rerender();
    RN.ui.toast(p === 'visitor' ? 'Signed out' : `Signed in as ${esc(RN.personas[p].name)} (${esc(RN.personas[p].sub)})`);
  };
  RN.actions['client-demo'] = () => {
    shell.setClient(null);
    RN.store.set('persona', 'buyer');
    enterDemoClient();
    dockOpen = false;
    shell.renderHeader(); shell.renderDock();
    RN.go('buyer');
    RN.ui.toast(`Viewing as the demo client, ${esc(RN.personas.buyer.name)}`);
  };
  // Log in from inside a page (a gate, "Log in to see rate") keeps you on that page; from the header it opens your home
  RN.actions['login'] = (el) => {
    const stay = !!(el && el.closest && el.closest('main, .modal'));
    RN.ui.modal({
      title: 'Log in to Revenue Nomad',
      sub: 'Prototype sign-in. Pick who you are to see that side of the system.',
      body: `<div class="stack" style="--gap:10px">
        ${['buyer', 'operator', 'admin'].map((k) => {
          const p = RN.personas[k];
          const d = { buyer: 'Hiring a fractional leader. Shortlist, compare, request intros, post projects.', operator: 'Fractional operator. Studio shows who viewed you, why, and how to stand out.', admin: 'Revenue Nomad team. Approve profiles and read marketplace demand.' }[k];
          const to = { buyer: 'buyer', operator: 'studio', admin: 'admin' }[k];
          return `<button type="button" class="optcard" data-act="persona" data-p="${k}" ${stay ? 'data-stay="1"' : `data-to="${to}"`}><b>${esc(p.name)} <span class="muted" style="font-weight:500">· ${esc(p.sub)}</span></b><span>${esc(d)}</span></button>`;
        }).join('')}
      </div>`,
    });
  };

  /* ---------- Header ---------- */
  const NAV = [
    { key: 'browse', label: 'Browse Talent', to: 'browse' },
    { key: 'projects', label: 'Post a Project', to: 'projects' },
    { key: 'insights', label: 'Insights', to: 'insights' },
    { key: 'operators', label: 'For Operators', to: 'operators' },
    { key: 'about', label: 'About', to: 'about' },
  ];

  shell.renderHeader = function (view) {
    view = view || (RN.currentRoute() && RN.currentRoute().view) || {};
    const st = RN.store.state;
    const p = st.persona;
    const el = document.getElementById('hdr');
    const over = view.chrome === 'over';
    el.className = 'hdr' + (over ? ' over' : '') + (over && window.scrollY > 40 ? ' stuck' : '');
    el.hidden = view.chrome === 'bare';
    let right = '';
    if (p === 'visitor') {
      right = `<button type="button" class="navlink hide-m" data-act="login" style="background:none;border:0;font-family:var(--f-display);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:inherit;height:44px">Log in</button>
        <a class="btn btn-leaf btn-sm" href="#talk">Talk to us</a>`;
    } else if (p === 'buyer') {
      const n = st.shortlist.length;
      right = `<a class="btn btn-line btn-sm hide-m" href="#buyer.shortlist">${icon('bookmark')}Shortlist${n ? `<span class="nav-count">${n}</span>` : ''}</a>
        <a class="row-nw" href="#buyer" style="--gap:8px" title="Workspace">${RN.ui.avatar({ name: RN.personas.buyer.name, initials: RN.fmt.initials(RN.personas.buyer.name) }, 'ava-sm')}<span class="hide-m" style="font-family:var(--f-display);font-weight:700;font-size:13px">Workspace</span></a>`;
    } else if (p === 'operator') {
      const me = RN.myOp();
      const unread = RN.studioB && me ? RN.studioB.inboxBadge(me) : st.intros.filter((i) => i.opId === RN.personas.operator.opId && i.status === 'pending').length + st.projects.filter((pr) => ['posted', 'in_progress'].includes(pr.status) && (pr.invited || []).includes(RN.personas.operator.opId) && !(pr.responses || []).some((r) => r.opId === RN.personas.operator.opId)).length;
      right = `<a class="btn btn-leaf btn-sm" href="#studio" aria-label="${unread ? `Studio, ${RN.fmt.plural(unread, 'item')} waiting for your reply` : 'Studio'}">${icon('chart')}<span class="hide-s">Studio</span>${unread ? `<span class="nav-count" aria-hidden="true">${unread}</span>` : ''}</a>
        <a href="#op.${esc(me ? me.slug : '')}" title="My public profile">${RN.ui.avatar(me, 'ava-sm')}</a>`;
    } else if (p === 'admin') {
      right = `<a class="btn btn-sm" href="#admin">${icon('settings')}Admin</a>`;
    }
    el.innerHTML = `<div class="wrap hdr-in">
      <a class="logo" href="#home" aria-label="Revenue Nomad home"><img src="assets/brand/mark.png" alt=""><span><b>REVENUE</b><span>NOMAD</span></span></a>
      <nav class="nav" aria-label="Main">${NAV.map((n) => `<a href="#${n.to}" class="${view.nav === n.key ? 'on' : ''}">${esc(n.label)}</a>`).join('')}</nav>
      <div class="nav-actions">${right}
        <button type="button" class="btn btn-line btn-sm btn-icon nav-burger" data-act="menu" aria-label="Open menu">${icon('menu')}</button>
      </div></div>`;
  };

  RN.actions['menu'] = () => {
    const p = RN.store.state.persona;
    const sheet = document.createElement('div');
    sheet.className = 'menu-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Menu');
    sheet.innerHTML = `<div class="row between" style="margin-bottom:24px"><span class="logo"><img src="assets/brand/mark.png" alt=""><span><b>REVENUE</b><span>NOMAD</span></span></span>
      <button class="x-btn" data-act="menu-close" aria-label="Close menu" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.3)">${icon('x')}</button></div>
      ${NAV.map((n) => `<a href="#${n.to}" data-act="menu-go" data-to="${n.to}">${esc(n.label)}${icon('arrow')}</a>`).join('')}
      ${p === 'visitor' ? `<button class="mlink" data-act="menu-login">Log in${icon('arrow')}</button><a href="#join" data-act="menu-go" data-to="join">Join as operator${icon('arrow')}</a>` : ''}
      ${p === 'buyer' ? `<a href="#buyer" data-act="menu-go" data-to="buyer">Workspace${icon('arrow')}</a>` : ''}
      ${p === 'operator' ? `<a href="#studio" data-act="menu-go" data-to="studio">Studio${icon('arrow')}</a>` : ''}
      <a class="btn btn-leaf btn-lg" style="margin-top:28px" href="#talk" data-act="menu-go" data-to="talk">Talk to us${icon('arrow')}</a>`;
    document.body.appendChild(sheet);
    document.body.style.overflow = 'hidden';
    const first = sheet.querySelector('a, button');
    if (first) setTimeout(() => first.focus(), 20);
  };
  function closeMenu() { const s = document.querySelector('.menu-sheet'); if (s) s.remove(); document.body.style.overflow = ''; const b = document.querySelector('.nav-burger'); if (b) b.focus(); }
  shell.closeMenu = closeMenu;
  RN.actions['menu-close'] = closeMenu;
  RN.actions['menu-go'] = (el) => { closeMenu(); RN.go(el.dataset.to); };
  RN.actions['menu-login'] = () => { closeMenu(); RN.actions.login(); };

  window.addEventListener('scroll', () => {
    const el = document.getElementById('hdr');
    if (el && el.classList.contains('over')) el.classList.toggle('stuck', window.scrollY > 40);
  }, { passive: true });

  /* ---------- Footer ---------- */
  shell.renderFooter = function (view) {
    const el = document.getElementById('ftr');
    el.hidden = view && view.footer === false;
    el.innerHTML = `<div class="wrap">
      <div class="ftr-grid">
        <div class="stack" style="--gap:16px">
          <a class="logo" href="#home" style="color:#fff"><img src="assets/brand/mark.png" alt=""><span><b>REVENUE</b><span>NOMAD</span></span></a>
          <p class="serif-up" style="font-size:22px;line-height:1.3;color:#fff;max-width:26ch">The home of fractional go-to-market leadership.</p>
          <p class="small" style="color:var(--night-mute);max-width:40ch">Open profiles, verified proof of work, and the market data behind every engagement.</p>
        </div>
        <div><h2 class="ftr-h">Hire</h2><a href="#browse">Browse talent</a><a href="#projects">Post a project</a><a href="#how">How it works</a><a href="#results">Results</a><a href="#talk">Talk to us</a></div>
        <div><h2 class="ftr-h">Operators</h2><a href="#operators">Why join</a><a href="#join">Join the network</a><a href="#levels">Levels and Reputation Index</a><a href="#studio">Operator Studio</a></div>
        <div><h2 class="ftr-h">Insights</h2><a href="#report">State of Fractional GTM 2027</a><a href="#rates">Rate Index</a><a href="#framework">GTM Framework</a><a href="#library">Fit Tag Library</a><a href="#guides">Guides</a></div>
        <div><h2 class="ftr-h">Company</h2><a href="#about">About us</a><a href="#results">Client stories</a><a href="#talk">Contact</a><a href="#standards">Field standards</a></div>
      </div>
      <div class="ftr-base"><span>© 2026 Revenue Nomad. Research figures in this prototype are illustrative.</span><span>Every profile is open. No login required to browse.</span></div>
    </div>`;
  };

  /* ---------- Compare tray ---------- */
  shell.renderTray = function (view) {
    let el = document.getElementById('tray');
    const ids = RN.store.state.compare;
    if (!ids.length || (view && (view.name === 'compare' || view.chrome === 'bare'))) { if (el) el.hidden = true; return; }
    const ops = ids.map(RN.model.byId).filter(Boolean);
    el.hidden = false;
    el.className = 'tray';
    el.innerHTML = `<span class="ava-stack">${ops.map((o) => RN.ui.avatar(o, 'ava-sm')).join('')}</span>
      <span class="tray-l">${ops.length} in compare</span>
      <a class="btn btn-leaf btn-sm" href="#compare">Compare${icon('arrow')}</a>
      <button class="btn btn-ghost btn-sm" data-act="compare-clear" style="color:var(--night-mute)">Clear</button>`;
  };
  RN.actions['compare-clear'] = () => { RN.store.set('compare', []); RN.rerender(); };

  /* ---------- Prototype dock ---------- */
  let dockOpen = false;
  shell.renderDock = function () {
    const el = document.getElementById('dock');
    const st = RN.store.state;
    const p = st.persona;
    const mail = st.outbox.length;
    el.className = 'dock';
    el.innerHTML = `${dockOpen ? `<div class="dock-panel" role="dialog" aria-label="Prototype controls">
        <div class="row between"><span class="eyebrow" style="color:var(--leaf)">Prototype controls</span><button class="x-btn" data-act="dock" aria-label="Close" style="width:32px;height:32px;background:transparent;color:#fff;border-color:rgba(255,255,255,.25)">${icon('x')}</button></div>
        <div class="stack" style="--gap:8px"><span class="label">View the system as</span>
          <div class="dock-persona">${['visitor', 'buyer', 'operator', 'admin'].map((k) => `<button type="button" class="${p === k ? 'on' : ''}" data-act="persona" data-p="${k}" data-stay="1" aria-pressed="${p === k}"><b>${esc(k === 'visitor' ? 'Visitor' : RN.personas[k].name)}</b><span>${esc(k === 'visitor' ? 'Logged out' : RN.personas[k].sub)}</span></button>`).join('')}</div>
          ${RN.personas.buyer.demo ? '' : `<button type="button" class="act" style="color:var(--leaf);justify-content:flex-start;padding:4px 0" data-act="client-demo">${icon('refresh')}<span>Switch client to the demo client (${esc(DEMO_CLIENT.name)})</span></button>`}</div>
        <div class="stack" style="--gap:8px"><span class="label">Walk a journey</span>
          <div class="stack" style="--gap:2px">${JOURNEYS.map((j) => `<button type="button" class="act" style="color:#fff;justify-content:flex-start;padding:6px 0" data-act="journey" data-j="${j.key}">${icon('arrow')}<span>${esc(j.label)}</span></button>`).join('')}</div></div>
        <div class="stack" style="--gap:8px"><span class="label">Clock · ${esc(RN.fmt.date(RN.now()))}</span>
          <div class="dock-row"><button class="btn btn-line btn-sm" data-act="clock" data-d="1">+1 day</button><button class="btn btn-line btn-sm" data-act="clock" data-d="7">+7 days</button><button class="btn btn-ghost btn-sm" data-act="clock" data-d="0" style="color:var(--night-mute)">Today</button></div></div>
        <div class="stack" style="--gap:8px"><span class="label">Theme</span>
          <div class="seg">${['system', 'light', 'dark'].map((t) => `<button type="button" class="${st.theme === t ? 'on' : ''}" data-act="theme" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
        <div class="dock-row"><button class="btn btn-line btn-sm" data-act="outbox">${icon('mail')}Outbox (${mail})</button><button class="btn btn-ghost btn-sm" data-act="reset-demo" style="color:#FFB4A8">Reset demo data</button></div>
        <p class="dock-note">Operators are a 100-profile sample of the live network (350+). Analytics, market figures and company names in Studio and Insights are illustrative.</p>
      </div>` : ''}
      <button type="button" class="dock-btn" data-act="dock" aria-expanded="${dockOpen}" aria-label="Prototype controls, viewing as ${esc(p === 'visitor' ? 'Visitor' : RN.personas[p].name + (p === 'admin' ? ' (admin)' : ''))}">${icon('sliders')}<i class="dock-live" aria-hidden="true"></i><span class="dock-tag">Prototype · ${esc(p === 'visitor' ? 'Visitor' : RN.personas[p].name + (p === 'admin' ? ' (admin)' : ''))}</span></button>`;
  };
  // Keep keyboard focus: open moves it to the panel's close button, close returns it to the dock button
  RN.actions['dock'] = () => {
    dockOpen = !dockOpen; shell.renderDock();
    const t = document.querySelector(dockOpen ? '.dock-panel .x-btn' : '.dock-btn');
    if (t) t.focus();
  };
  RN.actions['clock'] = (el) => {
    const d = +el.dataset.d;
    RN.store.set('clockOffsetDays', d === 0 ? 0 : (RN.store.state.clockOffsetDays || 0) + d);
    shell.renderDock(); RN.rerender();
    RN.ui.toast(`Clock set to ${RN.fmt.date(RN.now())}`, { icon: 'clock' });
  };
  RN.actions['theme'] = (el) => { RN.store.set('theme', el.dataset.t); shell.applyTheme(); shell.renderDock(); };
  RN.actions['reset-demo'] = () => {
    RN.ui.modal({
      title: 'Reset demo data?', sub: 'Clears shortlists, intro requests, projects, reviews, analytics events and the outbox for this browser.',
      foot: `<button class="btn btn-line" data-act="modal-close">Keep data</button><button class="btn btn-danger" data-act="reset-confirm">Reset</button>`,
    });
  };
  // Reset clears the stored state, then reloads so the in-memory model (reviews, edits, approvals) starts clean too
  RN.actions['reset-confirm'] = () => {
    RN.ui.closeModal();
    RN.store.reset();
    try { window.localStorage.removeItem('rn-master-prototype-v1'); } catch (e) { /* ignore */ }
    try { window.sessionStorage.clear(); } catch (e) { /* ignore */ }
    location.hash = '#home';
    location.reload();
  };
  // In-app links inside emails (#review.x, #proof.x) open the screen; the drawer closes on navigation
  const linkify = (t) => esc(t).replace(/(\S*?)#([a-z]+(?:\.[\w-]+)+)/g, (m, pre, path) => `<a href="#${path}">${pre ? 'revenuenomad.com/' : ''}#${path}</a>`);
  RN.actions['outbox'] = () => {
    const mails = RN.store.state.outbox;
    RN.ui.drawer({
      title: 'Outbox', sub: 'Emails the platform sends as you move through the flows.',
      body: mails.length ? `<div class="stack" style="--gap:12px">${mails.map((m) => `<article class="card-flat"><div class="row between small muted"><span>To ${esc(m.to)}</span><span>${esc(RN.fmt.ago(m.ts))}</span></div><h3 class="h5" style="margin-top:6px">${esc(m.subject)}</h3><p class="small muted" style="margin-top:6px;white-space:pre-line">${linkify(m.body)}</p></article>`).join('')}</div>` : RN.ui.empty({ icon: 'mail', title: 'No emails yet', body: 'Request an intro, post a project or send a review request and the emails appear here.' }),
    });
  };

  const JOURNEYS = [
    { key: 'buyer', label: 'Client: search, compare, request an intro', persona: 'buyer', to: 'browse' },
    { key: 'project', label: 'Client: post a project, get ranked responses', persona: 'buyer', to: 'project.new' },
    { key: 'studio', label: 'Operator: who viewed me and why', persona: 'operator', to: 'studio' },
    { key: 'proof', label: 'Operator: win a direct deal with a proof link', persona: 'operator', to: 'studio.credibility' },
    { key: 'join', label: 'Operator: join the network (standard intake)', persona: 'visitor', to: 'join' },
    { key: 'insights', label: 'Anyone: rates, research and the GTM framework', persona: 'visitor', to: 'insights' },
    { key: 'admin', label: 'Team: approvals and unmet demand', persona: 'admin', to: 'admin' },
  ];
  RN.actions['journey'] = (el) => {
    const j = JOURNEYS.find((x) => x.key === el.dataset.j);
    if (j.persona === 'buyer' && !RN.personas.buyer.demo) shell.setClient(null);
    RN.store.set('persona', j.persona);
    if (j.persona === 'buyer') enterDemoClient();
    dockOpen = false;
    shell.renderHeader(); shell.renderDock();
    RN.go(j.to);
  };

  /* ---------- Theme ---------- */
  shell.applyTheme = function () {
    const t = RN.store.state.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };

  /* Called by the router after each render */
  shell.update = function (view) {
    shell.renderHeader(view);
    shell.renderFooter(view);
    shell.renderTray(view);
  };

  RN.store.on((key) => {
    if (key === 'shortlist' || key === 'compare' || key === 'persona' || key === 'intros' || key === 'projects' || key === '*') {
      const cur = RN.currentRoute();
      shell.renderHeader(cur && cur.view);
      shell.renderTray(cur && cur.view);
    }
    if (key === 'outbox' || key === 'persona' || key === 'client' || key === '*') shell.renderDock();
    if (key === 'client') shell.renderHeader();
  });
})();
