/* Boot. Order: store -> theme -> demo seed (first visit only) -> shell -> first render. */
(function () {
  'use strict';
  const RN = window.RN;
  RN.store.load();
  RN.shell.applyTheme();
  if (!RN.store.state.seeded && RN.seed) { RN.seed(); RN.store.state.seeded = true; RN.store.save(); }
  RN.shell.renderDock();
  RN.render();
})();
