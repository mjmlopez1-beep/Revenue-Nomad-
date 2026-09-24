/* Boot. Order: store -> theme -> demo seed (first visit only) -> shell -> first render. */
(function () {
  'use strict';
  const RN = window.RN;
  RN.store.load();
  // Client company details saved in the workspace override the demo defaults
  try { const c = RN.store.state.seen && RN.store.state.seen.company; if (c) Object.assign(RN.personas.buyer.company, c); } catch (e) { /* ignore */ }
  RN.shell.applyTheme();
  if (!RN.store.state.seeded && RN.seed) { RN.seed(); RN.store.state.seeded = true; RN.store.save(); }
  if (RN.research && RN.research.curated) RN.model.curate(RN.research.curated, RN.research.def);
  // Operators approved in Admin during earlier sessions go live before the first render
  if (RN.admin && RN.admin.hydrate) { try { RN.admin.hydrate(); } catch (e) { console.error(e); } }
  RN.shell.renderDock();
  RN.render();
})();
