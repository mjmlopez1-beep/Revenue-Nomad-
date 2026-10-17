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
       description: (params) => 'One sentence', // optional fallback for <meta name="description"> (a string works too):
                                           // RN.seo's description (js/data/seo.js) wins, as head.json does, so an
                                           // illustrative figure in a view's copy never reaches the head. Title, canonical,
                                           // robots, Open Graph and JSON-LD come from RN.seo. RN.setDescription(text) and
                                           // RN.refreshHead() re-read the head for the current URL (a page that rewrites it).
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
  let rendered = false;

  // state-of-fractional: the address the Content Bank links to for the report (open decision, Oct 10, 2026); #report stays canonical
  const ALIASES = { projects: 'engagements', project: 'engagement', 'state-of-fractional': 'report' };
  const EXACT = { project: 'engagements', engagement: 'engagements' }; // a bare token with no id opens the list
  RN.routeAliases = ALIASES;
  RN.routeExact = EXACT; // read by tools/build-seo.js for the live home page's hash-route redirect
  // Whole-path aliases for a page renamed inside a view, registered by the view's file
  // (research.js: a guide merged into a rebuilt answer post keeps its old link)
  const PATHS = (RN.pathAliases = RN.pathAliases || {});
  RN.canonical = function (path) {
    const s = String(path == null ? '' : path).replace(/^#/, '');
    if (Object.prototype.hasOwnProperty.call(PATHS, s)) return PATHS[s];
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

  /* Per-route meta description. The site default is the one index.html ships with. */
  const descMeta = () => {
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); }
    return m;
  };
  const DEFAULT_DESC = (document.querySelector('meta[name="description"]') || { getAttribute: () => '' }).getAttribute('content') || 'Revenue Nomad is the fractional GTM network, research hub and operator studio in one system.';
  RN.defaultDescription = DEFAULT_DESC;

  /* Per-route head (js/data/seo.js, RN.seo): on every route change the router sets document.title, the meta
     description, <link rel="canonical">, <meta name="robots">, the Open Graph and Twitter title, description and URL,
     and one <script type="application/ld+json" id="rn-ld"> with that route's schema ('<' escaped). The description is
     RN.seo's for the route, then the view's own, then the site default. The graph sits at the end of <main> and is the
     page's only JSON-LD: the in-page dev previews (research.js, insights.js) are removed from the DOM, so a crawler that
     runs JavaScript reads the same graph as head.json and never an illustrative figure the head graph filtered out.
     A view that rewrites its URL in place during mount (join.js, review.js) gets the head of its new URL. */
  let seoHead = null; // the RN.seo head of the route on screen
  const headEl = (sel, make) => { let el = document.head.querySelector(sel); if (!el) { el = make(); document.head.appendChild(el); } return el; };
  const setMeta = (attr, key, val) => {
    const m = headEl(`meta[${attr}="${key}"]`, () => { const x = document.createElement('meta'); x.setAttribute(attr, key); return x; });
    if (m.getAttribute('content') !== val) m.setAttribute('content', val);
  };
  const setDescMetas = (text) => {
    const m = descMeta();
    if (m.getAttribute('content') !== text) m.setAttribute('content', text);
    setMeta('property', 'og:description', text);
    setMeta('name', 'twitter:description', text);
  };
  function applyHead(h, title) {
    if (!h) return;
    const link = headEl('link[rel="canonical"]', () => { const x = document.createElement('link'); x.setAttribute('rel', 'canonical'); return x; });
    if (link.getAttribute('href') !== h.canonical) link.setAttribute('href', h.canonical);
    setMeta('name', 'robots', h.robots);
    setMeta('property', 'og:site_name', 'Revenue Nomad');
    setMeta('property', 'og:type', h.ogType || 'website');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:url', h.canonical);
    setMeta('name', 'twitter:card', 'summary');
    setMeta('name', 'twitter:title', title);
    const main = document.getElementById('main');
    stripLd(main);
    const old = document.head.querySelector('script#rn-ld'); if (old) old.remove();
    let ld = main ? main.querySelector('script#rn-ld') : null;
    if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'rn-ld'; (main || document.head).appendChild(ld); }
    const json = RN.seo.jsonld(h);
    if (ld.textContent !== json) ld.textContent = json;
  }
  // Any other ld+json block in the page (a view's dev preview) goes: one graph per page, RN.seo's
  function stripLd(root) {
    if (!root) return;
    root.querySelectorAll('script[type="application/ld+json"]:not(#rn-ld)').forEach((x) => x.remove());
  }
  const plainText = (text) => String(text == null ? '' : text).replace(/<[^>]+>/g, '').replace(/\u2060/g, '').replace(/\s+/g, ' ').trim();
  let viewDesc = ''; // the view's own description, the fallback when RN.seo has none
  // Head for the URL now in the address bar: title, description, canonical, robots, Open Graph and JSON-LD
  function syncHead(fallback) {
    if (!RN.seo || !RN.seo.head) { setDescMetas(plainText(fallback) || DEFAULT_DESC); return; }
    try {
      seoHead = RN.seo.head(RN.path());
      if (seoHead.title) document.title = seoHead.title;
      applyHead(seoHead, document.title);
    } catch (e) { console.error(e); }
    setDescMetas((seoHead && seoHead.description) || plainText(fallback) || DEFAULT_DESC);
  }
  // A view that rewrites its own URL in place (history.replaceState) calls either of these to move the whole head
  RN.refreshHead = function () { syncHead(viewDesc); };
  RN.setDescription = function (text) { viewDesc = plainText(text) || viewDesc; syncHead(viewDesc); };

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
    // Motion: a fresh route is a new visit (scroll reveals and chart draws may play once more); a re-render is not.
    // The route change fades in 150ms (.view-enter); the first render of a visit to the site does not (.is-first).
    if (!keepScroll && RN.motion && RN.motion.newVisit) RN.motion.newVisit();
    const first = !rendered;
    rendered = true;
    root.innerHTML = `<main id="main" class="${keepScroll ? '' : 'view-enter' + (first ? ' is-first' : '')}" data-view="${view.name}">${html}</main>`;
    RN.shell.update(view);
    seoHead = null;
    if (RN.seo && RN.seo.head) { try { seoHead = RN.seo.head(path, { view, params }); } catch (e) { console.error(e); } }
    let title = seoHead && seoHead.title;
    if (!title) { try { title = (view.title ? view.title(params) : 'Revenue Nomad') + (view.name === 'home' ? '' : ' · Revenue Nomad'); } catch (e) { title = 'Revenue Nomad'; } }
    document.title = title;
    const gated = view.requires && view.requires !== persona && !(view.requires === 'any-user' && persona !== 'visitor');
    let desc = '';
    if (!gated && view.description) { try { desc = typeof view.description === 'function' ? view.description(params) : view.description; } catch (e) { console.error(e); } }
    viewDesc = plainText(desc);
    try { applyHead(seoHead, title); } catch (e) { console.error(e); }
    setDescMetas((seoHead && seoHead.description) || viewDesc || DEFAULT_DESC);
    if (view.mount && !gated) {
      try { view.mount(root.firstElementChild, params); } catch (e) { console.error(e); }
    }
    // The view moved its own URL during mount (a resumed step): the head follows the address bar
    if (RN.path() !== path) syncHead(viewDesc);
    else stripLd(root.firstElementChild);
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
