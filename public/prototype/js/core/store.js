/* RN.store: one shared state for every flow, so actions in one surface show up in the others
   (a buyer's profile view appears in the operator's Studio, an intro request lands in both inboxes).
   Persisted per viewer in localStorage; everything works if storage is unavailable. */
(function () {
  'use strict';
  const RN = window.RN;
  const KEY = 'rn-master-prototype-v1';

  function initial() {
    return {
      v: 1,
      persona: 'visitor',          // visitor | buyer | operator | admin
      theme: 'system',             // system | light | dark
      clockOffsetDays: 0,
      browse: { q: '', tags: [], filters: {}, sort: 'best', view: 'grid' },
      shortlist: [],               // operator ids saved by the buyer
      compare: [],                 // operator ids, max 4
      intros: [],                  // intro requests (buyer -> operator)
      projects: [],                // buyer projects
      events: [],                  // analytics events (feed Studio + Admin)
      reviewRequests: [],          // operator -> past client
      reviews: [],                 // reviews submitted during this session
      proofLinks: [],              // tracked private share links for direct deals
      outbox: [],                  // emails the system would send
      signup: null,                // operator intake draft
      pending: [],                 // submitted operator profiles awaiting review
      edits: {},                   // opId -> field overrides made in Studio
      seen: {},                    // one-time hints dismissed
    };
  }

  const subs = new Set();
  let saveTimer = null;

  const store = {
    state: initial(),
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && saved.v === 1) store.state = Object.assign(initial(), saved);
        }
      } catch (e) { /* storage unavailable: run in memory */ }
      return store.state;
    },
    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try { window.localStorage.setItem(KEY, JSON.stringify(store.state)); } catch (e) { /* ignore */ }
      }, 120);
    },
    get(key) { return store.state[key]; },
    set(key, value, opts) {
      store.state[key] = value;
      store.save();
      if (!opts || !opts.silent) store.emit(key);
    },
    update(fn, key) {
      fn(store.state);
      store.save();
      store.emit(key || '*');
    },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit(key) { subs.forEach((fn) => { try { fn(key, store.state); } catch (e) { console.error(e); } }); },
    reset() {
      const keepTheme = store.state.theme;
      store.state = initial();
      store.state.theme = keepTheme;
      try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      store.save();
      store.emit('*');
    },
  };
  RN.store = store;

  /* Analytics event log. Every surface calls RN.track so Studio and Admin read one source.
     type: search | impression | profile_view | shortlist_add | shortlist_remove | compare_add | compare_view |
           intro_request | project_post | project_invite | proof_view | review_request | review_submit | signup_submit */
  RN.track = function (type, data) {
    const ev = Object.assign({ id: RN.uid('ev'), type, ts: RN.now().toISOString(), persona: store.state.persona }, data || {});
    if (store.state.persona === 'buyer' && RN.personas && !ev.buyer) ev.buyer = RN.personas.buyer.company;
    store.state.events.unshift(ev);
    if (store.state.events.length > 800) store.state.events.length = 800;
    store.save();
    store.emit('events');
    return ev;
  };

  /* Outbox: the emails the real system would send. Visible in the Prototype dock. */
  RN.mail = function (to, subject, body, kind) {
    store.state.outbox.unshift({ id: RN.uid('mail'), to, subject, body, kind: kind || 'system', ts: RN.now().toISOString() });
    store.save();
    store.emit('outbox');
  };
})();
