/* RN core: namespace, templating, formatting, deterministic randomness, icons.
   Classic script (no modules) so the prototype opens from file:// as well as any host. */
(function () {
  'use strict';
  const RN = (window.RN = window.RN || {});
  RN.views = RN.views || {};
  RN.actions = RN.actions || {};
  RN.inputs = RN.inputs || {};
  RN.submits = RN.submits || {};

  /* ---------- Templating ----------
     h`...` joins a template literal: arrays are joined, null/false/undefined render nothing.
     It does NOT escape. Always wrap data with RN.esc() (or use helpers that do). */
  RN.h = function (strings, ...vals) {
    let out = '';
    for (let i = 0; i < strings.length; i++) {
      out += strings[i];
      if (i < vals.length) out += RN._join(vals[i]);
    }
    return out;
  };
  RN._join = function (v) {
    if (v == null || v === false || v === true) return '';
    if (Array.isArray(v)) return v.map(RN._join).join('');
    return String(v);
  };
  RN.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  RN.attr = RN.esc;
  RN.$ = (sel, root) => (root || document).querySelector(sel);
  RN.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- Formatting ---------- */
  RN.fmt = {
    int: (n) => Math.round(n || 0).toLocaleString('en-US'),
    compact: (n) => {
      n = +n || 0;
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
      return String(Math.round(n));
    },
    usd: (n) => '$' + Math.round(n || 0).toLocaleString('en-US'),
    usdK: (n) => (n >= 1e6 ? '$' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + n),
    rate: (n) => (n ? '$' + Math.round(n) + '/hr' : 'Rate on request'),
    pct: (n, d = 0) => (n * 100).toFixed(d) + '%',
    plural: (n, one, many) => `${RN.fmt.int(n)} ${n === 1 ? one : many || one + 's'}`,
    date: (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    dateShort: (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    monthYear: (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    ago: (d) => {
      const ms = RN.now().getTime() - new Date(d).getTime();
      const m = Math.round(ms / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      const h = Math.round(m / 60);
      if (h < 24) return h + 'h ago';
      const days = Math.round(h / 24);
      if (days < 7) return days + 'd ago';
      if (days < 60) return Math.round(days / 7) + 'w ago';
      return Math.round(days / 30) + 'mo ago';
    },
    initials: (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
    first: (name) => String(name || '').split(/\s+/)[0],
  };

  /* ---------- Time: the prototype runs on a simulated clock (Prototype dock can advance it) ---------- */
  RN.BASE_NOW = new Date('2026-09-24T15:00:00');
  RN.now = function () {
    const off = (RN.store && RN.store.state && RN.store.state.clockOffsetDays) || 0;
    return new Date(RN.BASE_NOW.getTime() + off * 864e5);
  };
  RN.daysAgo = (n) => new Date(RN.now().getTime() - n * 864e5);

  /* ---------- Deterministic randomness (stable demo numbers per operator) ---------- */
  RN.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  RN.rng = function (seed) {
    let a = typeof seed === 'string' ? RN.hash(seed) : seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  RN.pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
  RN.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  RN.uid = (p) => (p || 'id') + '-' + Math.random().toString(36).slice(2, 9);
  RN.slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

  /* ---------- Icons (24px grid, 1.75 stroke, round caps) ---------- */
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
    'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    'chev-down': '<path d="m6 9 6 6 6-6"/>',
    'chev-right': '<path d="m9 6 6 6-6 6"/>',
    'chev-left': '<path d="m15 6-6 6 6 6"/>',
    'chev-up': '<path d="m6 15 6-6 6 6"/>',
    menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9"/><path d="M6.3 6.4A16.6 16.6 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.2-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5"/><path d="M12.5 16V8"/><path d="M17 16v-8.5"/>',
    'trend-up': '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    'trend-down': '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    shield: '<path d="M12 3 5 6v6c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    share: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
    // Two opposing arrows: reads as "compare", never as a pause symbol
    compare: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
    sliders: '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h4"/><path d="M12 17h8"/><circle cx="10" cy="17" r="2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
    play: '<path d="M8 5.5v13l10.5-6.5L8 5.5Z"/>',
    video: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="m15.5 10 6-3.5v11l-6-3.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6l2.5-8Z"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/>',
    building: '<rect x="4" y="3" width="11" height="18" rx="1"/><path d="M15 9h5v12h-5"/><path d="M7.5 7h4"/><path d="M7.5 11h4"/><path d="M7.5 15h4"/>',
    doc: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4"/><path d="M9 12h6"/><path d="M9 16h6"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 19a2 2 0 0 1 2-2h13v4H6a2 2 0 0 1-2-2Z"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.7-1.5"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    seal: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8L12 3Z"/>',
    message: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
    send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4 18-7Z"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5.5-5.5L5 20"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    radar: '<path d="M12 3 20.5 9.2 17.3 19H6.7L3.5 9.2 12 3Z"/><path d="M12 8l4 3-1.5 4.5h-5L8 11l4-3Z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    quote: '<path d="M9 7H5v6h4v-2c0 2-1 4-3 4"/><path d="M19 7h-4v6h4v-2c0 2-1 4-3 4"/>',
    code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 4-4 16"/>',
    sparkline: '<path d="M3 17l5-6 4 3 4-7 5 5"/>',
    hourglass: '<path d="M7 3h10"/><path d="M7 21h10"/><path d="M8 3c0 5 8 5 8 9s-8 4-8 9"/><path d="M16 3c0 5-8 5-8 9s8 4 8 9"/>',
    ai: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6v6H9z"/><path d="M9 2v3"/><path d="M15 2v3"/><path d="M9 19v3"/><path d="M15 19v3"/><path d="M2 9h3"/><path d="M2 15h3"/><path d="M19 9h3"/><path d="M19 15h3"/>',
    handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.8-3.8a3 3 0 0 0-4.2 0l-.9.9a1.4 1.4 0 0 1-2-2L10.4 7a4.4 4.4 0 0 1 5.1-.8l.5.3a3 3 0 0 0 2.1.3L21 6"/><path d="m21 5 .5 7-2 1.5"/><path d="m3 5-.5 7 6.4 6.4a1.4 1.4 0 0 0 2-2"/><path d="M3 5h7"/>',
    megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1Z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
    gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3"/><path d="M12 18.5v3"/><path d="m4.6 4.6 2.1 2.1"/><path d="m17.3 17.3 2.1 2.1"/><path d="M2.5 12h3"/><path d="M18.5 12h3"/><path d="m4.6 19.4 2.1-2.1"/><path d="m17.3 6.7 2.1-2.1"/>',
    heart: '<path d="M12 20s-7.5-4.6-9-9.5C2 7 4.3 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 2.9 0 5.2 2.5 4.2 6-1.5 4.9-9 9.5-9 9.5Z"/>',
    wave: '<path d="M2 12h2"/><path d="M6 8v8"/><path d="M10 5v14"/><path d="M14 8v8"/><path d="M18 10v4"/><path d="M22 12h-2"/>',
  };
  RN.icon = function (name, cls) {
    const d = P[name] || P.dots;
    return `<svg class="i ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  };
  RN.iconNames = Object.keys(P);
})();
