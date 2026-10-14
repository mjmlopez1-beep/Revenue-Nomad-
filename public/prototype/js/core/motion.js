/* RN.motion: the shared, policy-compliant scroll motion (design pass, Oct 14, 2026). Page code calls these instead of
   writing its own IntersectionObserver, so every page follows one motion policy:

     RN.motion.reveal(root, selector, opts)   a scroll reveal for blocks below the fold, played once
     RN.motion.draw(el, opts)                 one chart draw, the first time the chart scrolls into view
     RN.motion.calm()                         true under prefers-reduced-motion or calm mode (navigator.webdriver,
                                              or html.rn-calm); ambient motion (one per page) checks this too
     RN.motion.reduced()                      true under prefers-reduced-motion only

   The rules both helpers enforce (motion policy, BRIEF.md):
   - Nothing that is on screen, or above it, when the visitor first scrolls is ever hidden. Blocks are only parked
     (.mo-wait, .mo-draw-wait) after the visitor's first wheel, touch, key or scroll, and only when they sit below
     the bottom of the viewport. A page that is never scrolled, a print and a full-page capture show everything.
   - A reveal moves at most 12px and lasts at most 300ms (--ease-out), the stagger is capped at 4 steps, and a block
     taller than 40% of the viewport is never revealed (so no more than about a third of the screen moves at once).
   - It plays once per visit to a route. A re-render (sort, filter, shortlist toggle: RN.rerender) never replays it:
     blocks are remembered by key (opts.key or the selector, plus each block's data-mo-key, id or index).
     The router starts a new visit on every fresh route render (RN.motion.newVisit).
   - It is a no-op under prefers-reduced-motion and in calm mode, and without IntersectionObserver.

   reveal(root, selector, opts)
     root      element (or document) to search; selector a CSS selector, or an array / NodeList of elements
     opts.y          rise in px, 0 to 12 (default 12); 0 is an opacity-only fade
     opts.dur        ms, up to 300 (default 300)
     opts.stagger    ms between blocks entering together, up to 80 (default 60), capped at 4 steps
     opts.key        memory key for "once" (default: the selector string)
     opts.rootMargin IntersectionObserver rootMargin (default '0px 0px 12% 0px': starts just before the block
                     enters, so it is moving as it comes on screen and never waits in view)
     opts.maxH       largest block, as a share of the viewport height, that may be revealed (default .4)
   draw(el, opts)
     el        the chart container; its parts carry data-draw: "x" (grow from the left), "y" (grow from the bottom),
               "line" (stroke draws along the path) or "fade". RN.chart bars, columns and lines add these already.
     opts.parts      selector for the parts instead of [data-draw]
     opts.dur        ms (default --dur-draw, 600); opts.stagger ms (default 40, capped at 4 steps)
     opts.key        memory key (default el.id, data-mo-key, data-ins-chart or the chart's class and index)
     opts.threshold  share of the chart in view before it draws (default .2)
   Both return nothing; calling them again for the same blocks on the same visit does nothing. */
(function () {
  'use strict';
  const RN = window.RN;
  const mo = (RN.motion = {});

  const mq = (q) => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  mo.reduced = () => mq('(prefers-reduced-motion: reduce)');
  mo.calm = () => mo.reduced() || !!(navigator && navigator.webdriver) || document.documentElement.classList.contains('rn-calm');
  mo.tokens = { dur1: 150, dur2: 200, dur3: 320, draw: 600, ease: 'cubic-bezier(.22, 1, .36, 1)', lift: -2, nudge: 3, revealMaxY: 12, revealMaxMs: 300, staggerCap: 4 };
  const EASE = 'var(--ease-out, cubic-bezier(.22, 1, .36, 1))';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, d) => (v == null || v === '' || isNaN(+v) ? d : +v);
  const canRun = () => !mo.calm() && 'IntersectionObserver' in window;

  /* ---------- Visit memory: what has played, and the observers to drop when the route changes ---------- */
  let played = new Map();     // key -> Set of block keys
  let live = new Map();       // key -> { io, off }
  const setFor = (k) => { if (!played.has(k)) played.set(k, new Set()); return played.get(k); };
  function drop(k) { const x = live.get(k); if (x) { try { x.io && x.io.disconnect(); } catch (e) { /* ignore */ } if (x.off) x.off(); live.delete(k); } }
  /* The router calls this on every fresh route render (not on RN.rerender) */
  mo.newVisit = function () { Array.from(live.keys()).forEach(drop); played = new Map(); };

  /* ---------- Arm on the visitor's first scroll ----------
     The router's own scrollTo right after mount is not a visitor scroll, so scroll events in the first 150ms after
     the call are ignored; wheel, touch and keys arm at once. */
  function onFirstScroll(fn) {
    const t0 = Date.now();
    let done = false;
    const evs = ['wheel', 'touchmove', 'keydown', 'scroll'];
    const go = (e) => {
      if (done) return;
      if (e && e.type === 'scroll' && Date.now() - t0 < 150) return;
      done = true; off(); fn();
    };
    const off = () => evs.forEach((t) => window.removeEventListener(t, go, { passive: true }));
    evs.forEach((t) => window.addEventListener(t, go, { passive: true }));
    return off;
  }
  const keyOf = (el, i) => (el.getAttribute && (el.getAttribute('data-mo-key') || el.id)) || String(i);

  /* ---------- Reveal ---------- */
  mo.reveal = function (root, selector, o) {
    o = o || {};
    if (!canRun() || selector == null) return;
    const els = typeof selector === 'string' ? Array.from((root || document).querySelectorAll(selector)) : Array.from(selector);
    if (!els.length) return;
    const y = clamp(num(o.y, 12), 0, 12), dur = clamp(num(o.dur, 300), 0, 300), step = clamp(num(o.stagger, 60), 0, 80);
    const key = 'r:' + (o.key || (typeof selector === 'string' ? selector : 'els'));
    const done = setFor(key);
    drop(key);
    // A block parked by an earlier call is shown again before it is re-registered, so nothing can stay hidden
    els.forEach((el) => { if (el.classList.contains('mo-wait')) { el.classList.remove('mo-wait'); el.style.removeProperty('--mo-y'); } });
    const items = els.map((el, i) => ({ el, k: keyOf(el, i) })).filter((x) => !done.has(x.k));
    if (!items.length) return;
    const rec = { io: null, off: null };
    live.set(key, rec);
    const show = (el, delay) => {
      el.style.transition = `opacity ${dur}ms ${EASE} ${delay}ms, transform ${dur}ms ${EASE} ${delay}ms`;
      el.classList.remove('mo-wait');
      setTimeout(() => { el.style.transition = ''; el.style.removeProperty('--mo-y'); }, dur + delay + 80);
    };
    rec.off = onFirstScroll(() => {
      rec.off = null;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const maxH = vh * clamp(num(o.maxH, 0.4), 0.1, 0.6);
      rec.io = new IntersectionObserver((ents) => {
        const ins = ents.filter((e) => e.isIntersecting).map((e) => e.target)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        ins.forEach((el, i) => { rec.io.unobserve(el); done.add(el.__moK); show(el, Math.min(i, 3) * step); });
      }, { rootMargin: o.rootMargin || '0px 0px 12% 0px', threshold: 0 });
      items.forEach(({ el, k }) => {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        // On screen, above it, or too tall to move: never hidden
        if (r.top < vh || r.height > maxH || r.height === 0) { done.add(k); return; }
        el.__moK = k;
        el.style.setProperty('--mo-y', y + 'px');
        el.classList.add('mo-wait');
        rec.io.observe(el);
      });
    });
  };

  /* ---------- Draw ---------- */
  function drawKey(el, o) {
    if (o.key) return 'd:' + o.key;
    const own = el.id || el.getAttribute('data-mo-key') || el.getAttribute('data-ins-chart') || el.getAttribute('data-chart');
    if (own) return 'd:' + own;
    // Fallback: the chart's class and its index among charts with that class
    const cls = (el.getAttribute('class') || el.tagName).trim().split(/\s+/)[0];
    let i = 0;
    try { i = Array.from(document.querySelectorAll('.' + CSS.escape(cls))).indexOf(el); } catch (e) { i = 0; }
    return 'd:' + cls + ':' + i;
  }
  mo.draw = function (el, o) {
    o = o || {};
    if (!el || !canRun()) return;
    const parts = Array.from(el.querySelectorAll(o.parts || '[data-draw]'));
    if (!parts.length) return;
    const key = drawKey(el, o);
    const done = setFor('draw');
    drop(key);
    // A chart parked by an earlier call is drawn again before it is re-registered
    el.classList.remove('mo-draw-wait');
    parts.forEach((p) => { if (p.getAttribute('data-draw') === 'line') { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; } });
    if (done.has(key)) return;
    const dur = clamp(num(o.dur, 600), 0, 600), step = clamp(num(o.stagger, 40), 0, 60);
    const rec = { io: null, off: null };
    live.set(key, rec);
    const lines = parts.filter((p) => p.getAttribute('data-draw') === 'line' && typeof p.getTotalLength === 'function' && !p.getAttribute('stroke-dasharray'));
    const play = () => {
      done.add(key);
      parts.forEach((p, i) => {
        const delay = Math.min(i, 3) * step;
        p.style.transition = `transform ${dur}ms ${EASE} ${delay}ms, opacity ${dur}ms ${EASE} ${delay}ms, stroke-dashoffset ${dur}ms ${EASE} ${delay}ms`;
      });
      el.classList.remove('mo-draw-wait');
      lines.forEach((p) => { p.style.strokeDashoffset = '0'; });
      setTimeout(() => {
        parts.forEach((p) => { p.style.transition = ''; });
        lines.forEach((p) => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; });
      }, dur + 3 * step + 80);
    };
    rec.off = onFirstScroll(() => {
      rec.off = null;
      if (!el.isConnected) return;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const r = el.getBoundingClientRect();
      if (r.top < vh || r.height === 0) { done.add(key); return; } // already drawn on screen: leave it
      el.classList.add('mo-draw-wait');
      lines.forEach((p) => { const L = Math.ceil(p.getTotalLength()); p.style.strokeDasharray = L + ' ' + L; p.style.strokeDashoffset = String(L); });
      rec.io = new IntersectionObserver((ents) => {
        if (!ents.some((e) => e.isIntersecting)) return;
        rec.io.disconnect();
        play();
      }, { threshold: clamp(num(o.threshold, 0.2), 0, 1) });
      rec.io.observe(el);
    });
  };
})();
