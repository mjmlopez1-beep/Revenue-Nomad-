/* The work (#work, #work.<problem>, #work.<id>): the deliverables operators publish, as a second, visual way into
   the marketplace alongside people. Companies come in by the deliverable they need (a comp plan, a 30/60/90 plan)
   or by the template they want to start from, then meet the operator who built it.

   Data: RN.data.work (js/data/work.js, placeholders until the portfolio export lands).
   Access: the cover, contents and outcome are public; the full document is shared after an intro.

   API (for Home and other views):
     RN.work.all()                 every sample whose operator is listed, in gallery order
     RN.work.get(id)               one sample or null
     RN.work.byProblem(key)        samples for a RN.fields.need key (sales_motion, pipeline, ...), gallery order
     RN.work.forOp(opId)           one operator's samples
     RN.work.card(s, o)            the cover card HTML (o.size: 'sm' for rows)
     RN.work.cover(s, o)           the designed cover alone
     RN.work.strip(o)              a horizontal row of 6 to 8 cover cards for Home:
                                   o = { need, limit (6 to 8, default 8), title, link (default true), source }
                                   The isMatt operator's samples never sit in the first four. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const F = () => RN.fields;
  const W = (RN.work = RN.work || {});

  const TYPES = ['Playbook', 'Comp plan', 'Dashboard', '30/60/90 plan', 'Process map', 'Template', 'Framework', 'Program'];
  const TYPE_PL = { Playbook: 'Playbooks', 'Comp plan': 'Comp plans', Dashboard: 'Dashboards', '30/60/90 plan': '30/60/90 plans', 'Process map': 'Process maps', Template: 'Templates', Framework: 'Frameworks', Program: 'Programs' };
  const TYPE_IC = { Playbook: 'book', 'Comp plan': 'trend-up', Dashboard: 'chart', '30/60/90 plan': 'calendar', 'Process map': 'layers', Template: 'doc', Framework: 'grid', Program: 'users' };
  const PROB_SHORT = { sales_motion: 'Sales motion', pipeline: 'Pipeline', team: 'Team', systems: 'Systems', ai: 'AI', retention: 'Retention', partners: 'Partners' };
  const LANDSCAPE = { Dashboard: 1, 'Process map': 1 };

  const dash = (s) => String(s == null ? '' : s).replace(/[\u2013\u2014]/g, '-');
  const needOpts = () => F().need.options.filter((o) => o.v !== 'not_sure');
  const needLabel = (k) => { const o = F().need.options.find((x) => x.v === k); return o ? o.l : k; };
  const opOf = (s) => (RN.model && RN.model.byId ? RN.model.byId(s.opId) : null);
  const fmtLen = (s) => (s.pages ? `${s.pages} ${s.unit === 'slides' ? (s.pages === 1 ? 'slide' : 'slides') : (s.pages === 1 ? 'page' : 'pages')}` : '');
  const sizeLabel = (v) => (v ? `${dash(RN.w.label('employeeRange', v))} employees` : '');
  const indLabel = (v) => (v ? RN.w.label('industry', v) : '');
  const isLand = (s) => s.unit === 'slides' || !!LANDSCAPE[s.type];

  /* ---------- Data access ---------- */
  W.all = () => (RN.data.work || []).filter((s) => { const op = opOf(s); return op && !op.hidden; });
  W.get = (id) => W.all().find((s) => s.id === id) || null;
  W.byProblem = (key) => W.all().filter((s) => !key || key === 'all' || s.problem === key);
  W.forOp = (opId) => W.all().filter((s) => s.opId === opId);
  W.types = TYPES;
  /* Keep the isMatt operator's samples out of the first n of a list (founder decision: no founder up front) */
  function demoteMatt(list, n) {
    const out = list.slice();
    const head = out.slice(0, n);
    const moved = head.filter((s) => { const op = opOf(s); return op && op.isMatt; });
    if (!moved.length) return out;
    const rest = out.filter((s) => !moved.includes(s));
    const at = Math.min(n, rest.length);
    return rest.slice(0, at).concat(moved, rest.slice(at));
  }
  W.demote = demoteMatt;

  /* ---------- The cover ----------
     A designed document cover: type and length on a top rule, the title set like a cover, a small abstract
     figure per drawing type (the profile Portfolio's visual language), a footer with the problem and a
     catalogue number. Paper texture is a CSS overlay. Portrait for documents, landscape for slides. */
  function fig(kind) {
    switch (kind) {
      case 'flow': return `<span class="wk-f wk-f-flow">${['Open', 'Discover', 'Qualify', 'Propose', 'Close'].map((x, i) => `<i class="${i === 2 ? 'hi' : ''}"><b>${x}</b></i>`).join('')}</span>`;
      case 'pyramid': return '<span class="wk-f wk-f-pyr"><i></i><i></i><i></i></span>';
      case 'gantt': return `<span class="wk-f wk-f-gantt">${[[0, 38], [16, 42], [44, 30], [58, 30], [74, 26]].map(([l, w], i) => `<i style="margin-left:${l}%;width:${w}%" class="${i === 2 ? 'hi' : ''}"></i>`).join('')}</span>`;
      case 'stages': return `<span class="wk-f wk-f-stages">${['Lead', 'Qualified', 'Discovery', 'Proposal', 'Closed'].map((x, i) => `<i class="${i === 4 ? 'hi' : ''}"><b>${x}</b></i>`).join('')}</span>`;
      case 'check': return `<span class="wk-f wk-f-check">${[1, 1, 1, 0, 0].map((d) => `<i class="${d ? 'd' : ''}"></i>`).join('')}</span>`;
      case 'curve': return '<span class="wk-f wk-f-svg"><svg viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true"><path class="g" d="M0 55.5H100M0 28H100"/><path class="d" d="M62 2V56"/><path class="l" d="M0 54L62 30L100 6"/><circle class="p" cx="62" cy="30" r="2.6"/></svg></span>';
      case 'bars': return `<span class="wk-f wk-f-bars"><span class="wk-kpis"><i></i><i></i><i></i></span><span class="wk-cols">${[38, 52, 46, 64, 58, 76, 70, 88].map((h, i) => `<i style="height:${h}%" class="${i === 7 ? 'hi' : ''}"></i>`).join('')}</span></span>`;
      case 'matrix': return '<span class="wk-f wk-f-matrix"><i></i><i class="hi"></i><i></i><i></i><b style="left:22%;top:30%"></b><b style="left:64%;top:18%" class="hi"></b><b style="left:72%;top:70%"></b><b style="left:34%;top:76%"></b></span>';
      case 'phases': return `<span class="wk-f wk-f-phases">${['30', '60', '90'].map((x, i) => `<span class="${i === 1 ? 'hi' : ''}"><b>${x}</b><i></i><i class="w7"></i><i class="w5"></i></span>`).join('')}</span>`;
      case 'nodes': return '<span class="wk-f wk-f-svg"><svg viewBox="0 0 100 56" aria-hidden="true"><path class="l" d="M12 28L40 12M12 28L40 44M40 12L70 12M40 44L70 44M70 12L90 28M70 44L90 28"/><rect class="n" x="4" y="22" width="16" height="12" rx="2"/><rect class="n" x="32" y="6" width="16" height="12" rx="2"/><rect class="n" x="32" y="38" width="16" height="12" rx="2"/><rect class="n hi" x="62" y="6" width="16" height="12" rx="2"/><rect class="n" x="62" y="38" width="16" height="12" rx="2"/><circle class="p" cx="90" cy="28" r="6"/></svg></span>';
      case 'funnel': return '<span class="wk-f wk-f-funnel"><i style="width:100%"></i><i style="width:78%"></i><i style="width:56%" class="hi"></i><i style="width:36%"></i></span>';
      default: return '';
    }
  }
  W.cover = function (s, o) {
    o = o || {};
    const op = opOf(s);
    const no = String(W.all().indexOf(s) + 1).padStart(2, '0');
    return `<span class="wk-cover tone-${esc(s.tone || 'paper')} ${isLand(s) ? 'land' : 'port'}${o.big ? ' big' : ''}" aria-hidden="true">
      <span class="wk-cv-top"><span>${esc(s.type)}</span><span>${esc(fmtLen(s))}</span></span>
      <span class="wk-cv-title">${esc(s.title)}</span>
      <span class="wk-cv-fig">${fig(s.fig)}</span>
      <span class="wk-cv-foot"><span>${esc(PROB_SHORT[s.problem] || '')}${op ? ` · ${esc(op.initials || RN.fmt.initials(op.name))}` : ''}</span><span>No. ${no}</span></span>
    </span>`;
  };

  /* ---------- The card ---------- */
  W.card = function (s, o) {
    o = o || {};
    const op = opOf(s);
    if (!op) return '';
    const href = `#work.${esc(s.id)}`;
    return `<article class="wk-card${o.size === 'sm' ? ' sm' : ''}">
      <a class="wk-card-cover" href="${href}" tabindex="-1" aria-hidden="true">${W.cover(s)}</a>
      <div class="wk-card-body">
        <span class="wk-card-type">${esc(s.type)}<span aria-hidden="true"> · </span>${esc(fmtLen(s))}</span>
        <h3 class="wk-card-t"><a href="${href}">${esc(s.title)}</a></h3>
        ${o.size === 'sm' ? '' : `<p class="wk-card-out">${esc(s.outcome)}</p>`}
        <a class="wk-by" href="#op.${esc(op.slug)}" data-view-source="work">
          ${RN.ui.avatar(op, 'ava-xs', { decorative: true })}<span class="wk-by-n">${esc(op.name)}</span>${RN.ui.cardTier(op, { pill: true, inLink: true })}
        </a>
      </div>
    </article>`;
  };

  /* ---------- Home row ---------- */
  W.strip = function (o) {
    o = o || {};
    const n = RN.clamp(+o.limit || 8, 6, 8);
    let list = W.byProblem(o.need);
    if (list.length < 6 && o.need) list = list.concat(W.all().filter((s) => !list.includes(s)));
    // One per operator first, so the row shows range, then the rest
    const seen = new Set(), first = [], rest = [];
    list.forEach((s) => { if (seen.has(s.opId)) rest.push(s); else { seen.add(s.opId); first.push(s); } });
    list = demoteMatt(first.concat(rest), 4).slice(0, n);
    const title = o.title == null ? 'See the work' : o.title;
    const link = o.need && o.need !== 'all' ? `work.${o.need}` : 'work';
    return `<div class="wk-strip" data-view-source="${esc(o.source || 'home')}">
      ${title || o.link !== false ? `<div class="wk-strip-hd">${title ? `<h3 class="label">${esc(title)}</h3>` : '<span></span>'}${o.link === false ? '' : `<a class="act" href="#${esc(link)}">See all the work${icon('arrow')}</a>`}</div>` : ''}
      <ul class="wk-strip-row" aria-label="${esc(title || 'Work samples')}">${list.map((s) => `<li>${W.card(s, { size: 'sm' })}</li>`).join('')}</ul>
    </div>`;
  };

  /* ---------- Gallery state ---------- */
  const G = { type: 'all' };

  function crumbs(items) {
    return `<nav class="crumbs" aria-label="Breadcrumb">${items.map((x, i) => `${i ? icon('chev-right') : ''}${x[1] ? `<a href="#${esc(x[1])}">${esc(x[0])}</a>` : `<span>${esc(x[0])}</span>`}`).join('')}</nav>`;
  }

  function renderGallery(need) {
    const all = W.all();
    const byNeed = W.byProblem(need);
    const list = demoteMatt(byNeed.filter((s) => G.type === 'all' || s.type === G.type), 1);
    const ops = new Set(list.map((s) => s.opId));
    const nCount = (k) => all.filter((s) => s.problem === k).length;
    const tCount = (t) => byNeed.filter((s) => s.type === t).length;
    const types = TYPES.filter((t) => all.some((s) => s.type === t));
    const needChips = [['all', 'All problems', all.length]].concat(needOpts().filter((o) => nCount(o.v)).map((o) => [o.v, o.l, nCount(o.v)]));
    const typeChips = [['all', 'All types', byNeed.length]].concat(types.map((t) => [t, TYPE_PL[t] || t, tCount(t)]));
    const cur = need || 'all';
    return `<section class="wrap phead wk-head">
        <div class="wk-head-copy">
          <span class="eyebrow">See the work</span>
          <h1 class="h1">The work behind <span class="serif">the operators</span><span class="vm">.</span></h1>
          <p class="lede">Playbooks, comp plans, dashboards and 30/60/90 plans operators have built. Start from the deliverable you need, then meet who built it.</p>
          <p class="wk-proto" data-proto>${icon('info')}<span>Placeholder covers until the portfolio export lands.</span></p>
        </div>
        <ul class="wk-head-types" aria-label="Kinds of work">${types.map((t) => `<li>${RN.ui.icoTile(TYPE_IC[t] || 'doc', { size: 'sm', soft: true, still: true })}<span>${esc(TYPE_PL[t] || t)}</span></li>`).join('')}</ul>
      </section>
      <section class="wrap wk-filters" aria-label="Filter the work">
        <div class="wk-frow">
          <span class="label" id="wk-f-need">By problem</span>
          <div class="chipset wk-chips" role="group" aria-labelledby="wk-f-need">${needChips.map(([k, l, n]) => `<button type="button" class="chip chip-sm" aria-pressed="${cur === k}" data-act="wk-need" data-v="${esc(k)}">${esc(l)}<span class="chip-n">${n}</span></button>`).join('')}</div>
        </div>
        <div class="wk-frow">
          <span class="label" id="wk-f-type">By type</span>
          <div class="chipset wk-chips" role="group" aria-labelledby="wk-f-type">${typeChips.map(([k, l, n]) => `<button type="button" class="chip chip-sm" aria-pressed="${G.type === k}" data-act="wk-type" data-v="${esc(k)}" ${n || k === G.type ? '' : 'disabled'}>${esc(l)}<span class="chip-n">${n}</span></button>`).join('')}</div>
        </div>
        <p class="wk-count small muted" aria-live="polite">${list.length ? `${RN.fmt.plural(list.length, 'work sample')} from ${RN.fmt.plural(ops.size, 'operator')}${cur !== 'all' ? ` · <b>${esc(needLabel(cur))}</b>` : ''}${G.type !== 'all' ? ` · ${esc(TYPE_PL[G.type] || G.type)}` : ''}` : 'No work samples match these filters.'}${cur !== 'all' || G.type !== 'all' ? ` <button type="button" class="act" data-act="wk-clear">Clear filters</button>` : ''}</p>
      </section>
      <section class="wrap wk-gallery-sec">
        ${list.length ? `<div class="wk-grid">${list.map((s) => W.card(s)).join('')}</div>` : RN.ui.empty({ icon: 'doc', title: 'Nothing here yet', body: 'No operator has published this kind of work for this problem. Tell us what you need and we will find who has built it.', cta: '<a class="btn btn-sm" href="#talk">Talk to us</a>' })}
        <div class="wk-band">
          <div><h2 class="h3">Need something specific built?</h2><p class="muted">Tell us the deliverable and the problem behind it. We match you with operators who have built it before.</p></div>
          <div class="row"><a class="btn" href="#talk${cur !== 'all' ? '.' + esc(cur) : ''}">Talk to us${icon('arrow')}</a><a class="btn btn-line" href="#browse">Browse operators</a></div>
        </div>
      </section>`;
  }

  /* ---------- Sample page ---------- */
  function docPage(s, op, i, locked, label) {
    const toc = s.toc && s.toc.length ? s.toc : [s.title];
    const head = toc[i % toc.length];
    return `<figure class="wk-pg${locked ? ' locked' : ''}${isLand(s) ? ' land' : ''}">
      <span class="wk-pg-sheet" aria-hidden="true">
        <span class="wk-pg-hd"><span>${esc(s.type.toUpperCase())}</span><span>${i + 2}</span></span>
        <b>${esc(head)}</b>
        ${i === 0 ? `<span class="wk-pg-fig">${fig(s.fig)}</span>` : ''}
        <i></i><i class="w8"></i><i></i><i class="w6"></i>${i ? '<i></i><i class="w8"></i><i class="w5"></i>' : ''}
      </span>
      ${locked ? `<span class="wk-pg-lock">${icon('lock')}<b>${esc(label || 'Shared after an intro')}</b></span>` : ''}
      <figcaption>${locked ? `Section ${i + 1}` : `Section ${i + 1} · ${esc(head)}`}</figcaption>
    </figure>`;
  }

  function bpFor(s) {
    const PJ = RN.projects;
    if (!PJ || !PJ.blueprints) return null;
    const list = PJ.forNeed ? PJ.forNeed(s.problem, s.role) : PJ.blueprints.filter((b) => b.need === s.problem);
    return list.find((b) => b.cat === s.role) || PJ.blueprints.find((b) => b.cat === s.role) || list[0] || null;
  }
  function bpCard(bp) {
    return `<a class="wk-bp card" href="#blueprint.${esc(bp.id)}" style="--cat:${RN.fields.catColor(bp.cat)}">
      <span class="wk-bp-hd">${RN.ui.icoTile('doc', { size: 'sm', cat: bp.cat })}<span class="label">Engagement Blueprint</span></span>
      <b class="wk-bp-t">${esc(bp.problem)}</b>
      <span class="small muted">${esc(bp.title || 'Fractional ' + bp.role)}${bp.blurb ? ` · ${esc(bp.blurb)}` : ''}</span>
      <span class="act">Open the Blueprint${icon('arrow')}</span>
    </a>`;
  }
  function row(title, list, more) {
    if (!list.length) return '';
    return `<section class="wk-more"><div class="wk-more-hd"><h2 class="h3">${esc(title)}</h2>${more || ''}</div><div class="wk-more-row">${list.map((x) => W.card(x, { size: 'sm' })).join('')}</div></section>`;
  }

  function renderSample(s) {
    const op = opOf(s);
    if (!op) return renderGallery();
    const first = op.first || RN.fmt.first(op.name);
    const toc = s.toc || [];
    const pages = Math.min(4, Math.max(3, toc.length));
    const left = Math.max(1, (s.pages || pages) - 1);
    const bp = bpFor(s);
    const mine = W.forOp(op.id).filter((x) => x.id !== s.id);
    const like = demoteMatt(W.all().filter((x) => x.id !== s.id && x.opId !== op.id && (x.problem === s.problem || x.type === s.type))
      .sort((a, b) => (b.problem === s.problem) - (a.problem === s.problem) || (b.type === s.type) - (a.type === s.type)), 1).slice(0, 4);
    const facts = [
      ['Industry', indLabel(s.industry)],
      ['Company size', sizeLabel(s.size)],
      ['Built by a', F().catLabel(s.role)],
      ['Solves', needLabel(s.problem)],
      ['Length', fmtLen(s)],
    ].filter((f) => f[1]);
    return `<section class="wrap phead wk-sp">
        ${crumbs([['The work', 'work'], [needLabel(s.problem), 'work.' + s.problem], [TYPE_PL[s.type] || s.type, '']])}
        <div class="wk-sp-grid">
          <div class="wk-sp-cover">${W.cover(s, { big: true })}</div>
          <div class="wk-sp-copy">
            <span class="eyebrow">${esc(s.type)}</span>
            <h1 class="h1 wk-sp-t">${esc(s.title)}</h1>
            <p class="lede wk-sp-out">${esc(s.outcome)}.</p>
            <dl class="wk-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
            <div class="row wk-sp-cta">
              <button type="button" class="btn" data-act="wk-hire" data-id="${esc(s.id)}">Hire who built it${icon('arrow')}</button>
              <a class="btn btn-line" href="#talk.${esc(s.problem)}" data-act="wk-adapt" data-id="${esc(s.id)}">Adapt this for us</a>
            </div>
            <a class="wk-by wk-by-lg" href="#op.${esc(op.slug)}" data-view-source="work">${RN.ui.avatar(op, 'ava-sm', { decorative: true })}<span><span class="faint small">Built by</span> <span class="wk-by-n">${esc(op.name)}</span></span>${RN.ui.cardTier(op, { pill: true, inLink: true })}</a>
          </div>
        </div>
      </section>
      <section class="wrap wk-sp-body">
        <div class="wk-sp-main">
          <section class="wk-toc-sec" aria-labelledby="wk-toc-t">
            <h2 class="h3" id="wk-toc-t">Contents</h2>
            <ol class="wk-toc">${toc.map((t, i) => `<li><span class="wk-toc-n tnum">${String(i + 1).padStart(2, '0')}</span><span>${esc(t)}</span>${i ? icon('lock', 'wk-toc-lock') : ''}</li>`).join('')}</ol>
          </section>
          <section class="wk-inside" aria-labelledby="wk-in-t">
            <h2 class="h3" id="wk-in-t">What’s inside</h2>
            <div class="wk-pages">${Array.from({ length: pages }, (_, i) => docPage(s, op, i, i > 0, i === pages - 1 && left > pages - 1 ? `${left - (pages - 2)} more ${s.unit === 'slides' ? 'slides' : 'pages'}` : '')).join('')}</div>
            <p class="wk-note">${icon('lock')}<span>Full document shared after an intro. Operators choose what they publish; client names stay private.</span></p>
          </section>
        </div>
        <aside class="wk-sp-side" aria-label="Who built it">
          <span class="label">Who built it</span>
          ${RN.ui.opCard(op, { compact: true })}
          ${bp ? `<span class="label wk-side-l">Hire for this as an engagement</span>${bpCard(bp)}` : ''}
        </aside>
      </section>
      <div class="wrap wk-sp-rows">
        ${row(`More from ${first}`, mine, `<a class="act" href="#op.${esc(op.slug)}">See ${esc(first)}’s profile${icon('arrow')}</a>`)}
        ${row('More like this', like, `<a class="act" href="#work.${esc(s.problem)}">See all for this problem${icon('arrow')}</a>`)}
      </div>`;
  }

  /* ---------- Actions ---------- */
  function goNeed(v) {
    const path = v && v !== 'all' ? 'work.' + v : 'work';
    RN.go(path, { replace: true, noScroll: true });
  }
  RN.actions['wk-need'] = (el) => { G.type = 'all'; goNeed(el.dataset.v); };
  RN.actions['wk-type'] = (el) => { G.type = el.dataset.v || 'all'; RN.rerender(); };
  RN.actions['wk-clear'] = () => { G.type = 'all'; goNeed('all'); };
  RN.actions['wk-hire'] = (el) => {
    const s = W.get(el.dataset.id);
    const op = s && opOf(s);
    if (!op) return;
    if (RN.track) RN.track('work_hire', { opId: op.id, sample: s.id });
    if (RN.intro && RN.intro.open) RN.intro.open(op.id, { need: s.problem, note: `We saw your ${s.type.toLowerCase()} “${s.title}” and want to talk about building something like it for us.` });
    else RN.go('op.' + op.slug);
  };
  RN.actions['wk-adapt'] = (el) => {
    const s = W.get(el.dataset.id);
    if (RN.track && s) RN.track('work_adapt', { opId: s.opId, sample: s.id });
    RN.go(s ? 'talk.' + s.problem : 'talk');
  };

  /* ---------- Views ---------- */
  const isNeed = (k) => needOpts().some((o) => o.v === k);
  RN.view('work', {
    route: 'work', nav: 'browse',
    title: () => 'The work',
    render: () => renderGallery(''),
  });
  RN.view('work-item', {
    route: 'work.:id', nav: 'browse',
    samples: { id: 'wk-enterprise-comp', extra: ['work.wk-pipeline-dashboard', 'work.wk-ai-research-agent', 'work.pipeline'] },
    title: (p) => { if (isNeed(p.id)) return `The work · ${needLabel(p.id)}`; const s = W.get(p.id); return s ? s.title : 'The work'; },
    render: (p) => {
      if (isNeed(p.id)) return renderGallery(p.id);
      const s = W.get(p.id);
      if (!s) return `<section class="wrap-narrow section">${RN.ui.empty({ icon: 'doc', title: 'This work sample is not available', body: 'It may have been unpublished by the operator.', cta: '<a class="btn btn-sm" href="#work">See all the work</a>' })}</section>`;
      return renderSample(s);
    },
  });
})();
