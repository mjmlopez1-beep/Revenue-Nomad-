/* RN router: hash routes built from dot-separated tokens (#op.matt-lopez, #studio.visibility).
   Dots keep every deep link valid as a plain URL fragment on any host.

   Register a view:
     RN.view('profile', {
       route: 'op.:slug',                 // tokens, ':name' captures
       nav: 'browse',                      // which header item is active
       chrome: 'solid' | 'over' | 'bare',  // header style: solid (default), over a dark hero, or none
       footer: true,                       // show site footer (default true)
       requires: 'buyer' | 'operator' | 'admin' | null,
       title: (params) => 'Page title',
       render: (params) => htmlString,
       mount: (root, params) => {},        // optional: wire charts, focus, observers
       unmount: () => {},                  // optional
     });

   Route aliases: a renamed route keeps its old links working. RN.canonical(path) swaps the first token through
   ALIASES and keeps the rest, so #projects -> #engagements, #project.new.vp-sales.2 -> #engagement.new.vp-sales.2
   and #project.<id> -> #engagement.<id> (founder decision D12, Sep 25, 2026: a client posts an engagement).
   RN.go() goes straight to the canonical route; an old link opened any other way is rewritten in place
   (history.replaceState), so Back never lands on the old address.
*/
(function () {
  'use strict';
  const RN = window.RN;
  const order = [];
  let current = null;

  const ALIASES = { projects: 'engagements', project: 'engagement' };
  const EXACT = { project: 'engagements', engagement: 'engagements' }; // a bare token with no id opens the list
  RN.routeAliases = ALIASES;
  RN.canonical = function (path) {
    const s = String(path == null ? '' : path).replace(/^#/, '');
    if (Object.prototype.hasOwnProperty.call(EXACT, s)) return EXACT[s];
    const parts = s.split('.');
    if (!Object.prototype.hasOwnProperty.call(ALIASES, parts[0])) return s;
    parts[0] = ALIASES[parts[0]];
    return parts.join('.');
  };

  RN.view = function (name, def) {
    def.name = name;
    def.tokens = String(def.route || name).split('.');
    RN.views[name] = def;
    const i = order.findIndex((v) => v.name === name);
    if (i >= 0) order.splice(i, 1, def); else order.push(def);
    return def;
  };

  function match(hash) {
    const parts = (hash || 'home').split('.');
    // Exact-length matches first, static tokens beat captures
    let best = null, bestScore = -1;
    for (const v of order) {
      if (v.tokens.length !== parts.length) continue;
      const params = {};
      let ok = true, score = 0;
      for (let i = 0; i < v.tokens.length; i++) {
        const t = v.tokens[i];
        if (t.startsWith(':')) params[t.slice(1)] = decodeURIComponent(parts[i]);
        else if (t === parts[i]) score += 2;
        else { ok = false; break; }
      }
      if (ok && score > bestScore) { best = { view: v, params }; bestScore = score; }
    }
    return best;
  }

  RN.currentRoute = () => current;
  RN.path = () => RN.canonical(decodeURIComponent((location.hash || '').replace(/^#/, ''))) || 'home';

  RN.go = function (path, opts) {
    const target = '#' + RN.canonical(path);
    if (location.hash === target) { RN.render(opts); return; }
    if (opts && opts.replace) { history.replaceState(null, '', target); RN.render(opts); }
    else location.hash = target;
  };

  RN.render = function (opts) {
    // An old link (alias) is rewritten to its canonical route in place, keeping history state
    const raw = (location.hash || '').replace(/^#/, '');
    const canon = RN.canonical(raw);
    if (raw && canon !== raw) { try { history.replaceState(history.state, '', '#' + canon); } catch (e) { /* file:// in some browsers: the match below still uses the canonical path */ } }
    const path = RN.path();
    let m = match(path);
    if (!m) m = { view: RN.views.notfound || RN.views.home, params: { path } };
    const { view, params } = m;
    const sameView = current && current.view === view && JSON.stringify(current.params) === JSON.stringify(params);
    if (current && current.view.unmount && !sameView) { try { current.view.unmount(); } catch (e) { console.error(e); } }
    current = { view, params, path };

    const root = document.getElementById('app');
    let html = '';
    const persona = RN.store.state.persona;
    // Housekeeping before any screen reads engagements: staffed engagements with 10 quiet days close on their own
    try { if (RN.projects && RN.projects.autoClose) RN.projects.autoClose(); } catch (e) { console.error(e); }
    try {
      if (view.requires && view.requires !== persona && !(view.requires === 'any-user' && persona !== 'visitor')) {
        html = RN.ui.gate(view.requires, view);
      } else {
        html = view.render(params) || '';
      }
    } catch (e) {
      console.error(e);
      html = `<div class="wrap section"><div class="note"><b>Something broke on this screen.</b>&nbsp;${RN.esc(e.message)}</div></div>`;
    }
    const keepScroll = sameView && opts && opts.keepScroll;
    const y = window.scrollY;
    root.innerHTML = `<main id="main" class="${keepScroll ? '' : 'view-enter'}" data-view="${view.name}">${html}</main>`;
    RN.shell.update(view);
    try { document.title = (view.title ? view.title(params) : 'Revenue Nomad') + (view.name === 'home' ? '' : ' · Revenue Nomad'); } catch (e) { document.title = 'Revenue Nomad'; }
    if (view.mount && !(view.requires && view.requires !== persona && !(view.requires === 'any-user' && persona !== 'visitor'))) {
      try { view.mount(root.firstElementChild, params); } catch (e) { console.error(e); }
    }
    if (keepScroll) window.scrollTo(0, y);
    else if (!(opts && opts.noScroll)) window.scrollTo(0, 0);
    RN.ui && RN.ui.afterRender && RN.ui.afterRender(root);
  };

  /* Re-render the current screen in place (after a state change) without jumping to top. */
  RN.rerender = function () { RN.render({ keepScroll: true }); };

  // Browser Back/Forward: close any open modal, drawer or menu before showing the new screen
  window.addEventListener('hashchange', () => {
    if (RN.ui) { RN.ui.closeStale(300); RN.ui.hideTip && RN.ui.hideTip(); }
    if (RN.shell && RN.shell.closeMenu && document.querySelector('.menu-sheet')) RN.shell.closeMenu();
    RN.render();
  });
})();
