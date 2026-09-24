/* TEMP smoke-test home view: replaced by the home builder. */
(function () {
  const RN = window.RN;
  RN.view('home', {
    route: 'home', nav: '', chrome: 'solid',
    title: () => 'Revenue Nomad',
    render: () => {
      const res = RN.model.search({ q: 'hubspot' }).slice(0, 6);
      return `<section class="wrap section"><span class="eyebrow">Smoke test</span><h1 class="h1" style="margin-top:12px">Meet the operators <span class="serif">who already solved it.</span></h1>
      <div class="grid g-3" style="margin-top:32px">${res.map((r) => RN.ui.opCard(r.op, { why: r.why[0] })).join('')}</div>
      <form data-submit="x" class="card stack" style="margin-top:32px">${RN.w.field('revenueRange', ['5m_20m'])}${RN.w.field('stackComplexity', 'standard')}${RN.w.field('industries', ['Saas'])}${RN.w.field('fitTags', ['HubSpot admin'])}<button class="btn" data-act="intro-open" data-id="${RN.model.matt.id}">Request intro</button></form>
      <div class="card" style="margin-top:32px">${RN.chart.line([{ values: RN.model.analytics(RN.model.matt.id).series.views }], RN.model.analytics(RN.model.matt.id).series.labels)}</div></section>`;
    },
  });
})();
