/* Company pages: About (#about), How it works (#how), Results (#results), Talk to us (#talk, #talk.<need>),
   For operators (#operators), Levels (#levels) and the 404 page (RN.views.notfound).
   Prefix: pg- for actions, inputs, submits and CSS classes. Shared helpers live on RN.pages:
     RN.pages.book()            open the "Book a call" slot picker (also data-act="pg-book")
     RN.pages.phone()           the phone number as selectable text with a copy button
     RN.pages.unlocks[tier]     what each Reputation Index tier unlocks, as one sentence (proposed; from RN.fields.risUnlocks)
     RN.pages.hero(o), .shead(), .faq(items)   the page head, section head and FAQ list (the function homes use them)
   Type: page heads use .h1 on paper (.phead), sections .h2, one Newsreader italic accent per page (the H1).
   The Talk to us flow is a form, so it has no serif accent.
   Pricing (founder decision D1, Sep 25, 2026): company pages (#about, #how, #results, #talk) never mention a fee,
   margin or split; companies pay no fees and pay the operator's listed rate. Founder, Oct 11, 2026: there is no platform
   fee for companies, and hiring an operator full time carries a conversion fee of 20% of annual salary, stated on the
   function homes' FAQ and the cost hub's terms. Only the operator pages (#operators,
   #levels) explain the fee: a percentage of the operator's billed earnings each month (proposed: 25%).
   We are a company, not a person (founder decision, Oct 12, 2026): no founder portrait, quote, sign-off or contact.
   The About page tells the company story as "we" around the network (faces, size, cleared client logos), and the
   Studio links and previews show "a sample Studio". The founder's operator profile follows the same rules as every operator.
   #operators also carries the operator content that used to sit on Home: the Studio preview and how featuring works.
   Loops wired here: Talk to us logs a `search` (+ impressions for the suggested operators) for Admin demand
   and Studio "Why you appeared", emails the team and the client, and hands its answers to the intro sheet.
   A zero-result "Tell us what you need" in Browse (search event with meta.tellUs, or seen.talkPrefill)
   carries its query and company-size filters into the flow. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const PG = (RN.pages = RN.pages || {});

  const PHONE = '+1 203-200-0482';
  const EMAIL = 'hello@revenuenomad.com';
  const TEAM = 'Revenue Nomad team';
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const AVAIL_RANK = { available_now: 0, available_2_weeks: 1, available_2_plus_weeks: 2 };
  // Operator fee, proposed: a share of the operator's billed earnings. Shown on operator pages only (#operators).
  const FEE_PCT = Math.round(RN.model.FEE * 100);

  /* ---------- Small helpers ---------- */
  const persona = () => RN.store.state.persona;
  const tiersDown = () => RN.fields.risTier.options.slice();
  const market = () => RN.data.market;
  const illus = (txt) => RN.ui.illus(txt);
  const livePill = (txt) => `<span class="pill pill-accent">${icon('check-circle')}${esc(txt || 'Live export')}</span>`;
  const curView = () => { const c = RN.currentRoute && RN.currentRoute(); return c && c.view ? c.view.name : ''; };

  /* Studio tab keys are owned by the Studio builders; resolve by label so links survive renames. */
  function studioRoute(re, fallback) {
    const tabs = RN.studio && RN.studio.list ? RN.studio.list() : [];
    const t = tabs.find((x) => re.test(x.key) || re.test(x.label || ''));
    if (t) return t.key === 'overview' ? 'studio' : 'studio.' + t.key;
    return fallback || 'studio';
  }
  /* A link into a signed-in screen. Other personas get a one-click persona switch that lands there. */
  function asLink(p, to, labels, cls) {
    const mine = persona() === p;
    const label = mine ? labels.mine : labels.other;
    if (mine) return `<a class="${cls}" href="#${esc(to)}">${label}</a>`;
    return `<button type="button" class="${cls}" data-act="persona" data-p="${esc(p)}" data-to="${esc(to)}">${label}</button>`;
  }
  // Other personas switch to the operator persona and land in a sample operator's Studio
  const studioSample = (to, cls, mineLabel) => asLink('operator', to || 'studio', { mine: `${icon('chart')}${esc(mineLabel || 'Open Studio')}`, other: `${icon('chart')}See a sample Studio` }, cls || 'btn btn-line btn-lg');

  function goBrowse(c) {
    const crit = { q: c.q || '', tags: c.tags || [], filters: c.filters || {} };
    if (c.sort) RN.store.update((s) => { s.browse = Object.assign({}, s.browse, { sort: c.sort }); }, 'browse');
    if (RN.browse && typeof RN.browse.go === 'function') { RN.browse.go(crit); return; }
    RN.store.update((s) => { s.browse = Object.assign({}, s.browse, crit); }, 'browse');
    RN.go('browse');
  }

  /* ---------- Layout pieces ---------- */
  /* Page head on paper, like Insights and the Framework: eyebrow, .h1 (the page's one serif accent), lede, actions */
  function hero(o) {
    return `<header class="wrap phead pg-head${o.aside ? ' has-aside' : ''}">
      <div class="pg-head-copy">
        <span class="eyebrow">${esc(o.eyebrow)}</span>
        <h1 class="h1">${o.h}</h1>
        ${o.lede ? `<p class="lede">${o.lede}</p>` : ''}
        ${o.actions ? `<div class="pg-actions">${o.actions}</div>` : ''}
      </div>
      ${o.aside ? `<div class="pg-head-aside">${o.aside}</div>` : ''}
      ${o.foot || ''}
    </header>`;
  }
  function shead(eyebrow, h, lede, right) {
    return `<div class="pg-shead"><div class="pg-shead-l"><span class="eyebrow">${esc(eyebrow)}</span><h2 class="h2">${h}</h2>${lede ? `<p class="lede">${lede}</p>` : ''}</div>${right ? `<div class="pg-shead-r">${right}</div>` : ''}</div>`;
  }
  function band(o) {
    return `<section class="section pg-band night"><div class="wrap pg-band-in">
      <h2 class="h2">${o.h}</h2>
      <div class="pg-band-side"><p>${esc(o.text)}</p><div class="pg-actions">${o.actions}</div></div>
    </div></section>`;
  }
  const talkActions = () => `<a class="btn btn-leaf btn-lg" href="#talk">Talk to us${icon('arrow')}</a><button type="button" class="btn btn-line btn-lg" data-act="pg-book">${icon('calendar')}Book a call</button>`;

  PG.phone = function (o) {
    o = o || {};
    return `<div class="pg-phone${o.dark ? ' on-dark' : ''}"><span class="pg-phone-n" aria-label="Phone number">${PHONE}</span><button type="button" class="btn btn-line btn-sm" data-act="pg-copy" data-copy="${PHONE}" aria-label="Copy phone number">${icon('copy')}Copy</button></div>`;
  };

  /* ---------- Copy to clipboard (file:// safe) ---------- */
  function copyFallback(v) {
    try {
      const ta = document.createElement('textarea');
      ta.value = v; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    } catch (e) { /* the number stays selectable */ }
  }
  RN.actions['pg-copy'] = (el) => {
    const v = el.dataset.copy || '';
    const done = () => RN.ui.toast(`Copied ${esc(v)}`, { icon: 'copy' });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => { copyFallback(v); done(); });
      else { copyFallback(v); done(); }
    } catch (e) { copyFallback(v); done(); }
  };

  /* ---------- Reputation Index ladder (shared by For operators and Levels) ---------- */
  // One source for tier unlocks (RN.fields.risUnlocks), shared with Studio Credibility
  PG.unlocks = Object.fromEntries(Object.entries(RN.fields.risUnlocks).map(([k, v]) => [k, v.join('. ') + '.']));
  function tierCounts() {
    const c = {};
    RN.model.ops.forEach((o) => { c[o.ris.tier] = (c[o.ris.tier] || 0) + 1; });
    c.indexing = (RN.store.state.pending || []).length;
    return c;
  }
  /* The ladder, top rung first. Tiers and ranges from RN.fields.risTier, unlocks from RN.fields.risUnlocks
     (labelled proposed). o.desc adds what each tier means, o.counts the profiles at each tier in this prototype.
     o.me marks the signed-in operator's own tier ("You"). No operator is singled out for anyone else. */
  function ladder(o) {
    o = o || {};
    const counts = tierCounts();
    const me = RN.myOp ? RN.myOp() : null;
    const U = RN.fields.risUnlocks || {};
    const cols = ['Tier', o.desc ? 'What it means' : '', 'What it unlocks (proposed)', o.counts || o.me ? 'In this prototype' : ''].filter(Boolean);
    return `<div class="pg-ladder-wrap${o.desc ? ' has-d' : ''}${o.counts || o.me ? ' has-n' : ''}${o.rail ? ' is-rail' : ''}">
      <div class="pg-ladder-hd" aria-hidden="true">${cols.map((c) => `<span class="label">${esc(c)}</span>`).join('')}</div>
      <ol class="pg-ladder" aria-label="Reputation Index tiers, highest first">${tiersDown().map((t) => {
        const n = counts[t.v] || 0;
        const count = t.v === 'indexing' ? `${RN.fmt.int(n)} ${n === 1 ? 'application' : 'applications'} in review` : RN.fmt.plural(n, 'profile');
        const mine = o.me && me && me.ris.tier === t.v;
        return `<li class="pg-rung pg-rung-${esc(t.v)} tb-host">
          <div class="pg-rung-id">
            <span class="pg-seal">${RN.ui.tierBadge(t.v, { size: o.rail ? 64 : 48 })}</span>
            <span><b class="pg-rung-name">${esc(t.l)}</b><span class="pg-rung-range">${t.v === 'indexing' ? 'Before approval' : `Score ${t.min} to ${t.max}`}</span></span>
          </div>
          ${o.desc ? `<p class="pg-rung-d">${esc(t.d)}</p>` : ''}
          <div class="pg-rung-u"><span class="label pg-rung-ul">Unlocks, proposed</span><ul>${(U[t.v] || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
          ${o.counts || o.me ? `<div class="pg-rung-meta">${o.counts ? `<span class="pg-rung-n">${esc(count)}</span>` : ''}${mine ? `<span class="pg-rung-me">${RN.ui.avatar(me, 'ava-xs')}You, ${esc(me.ris.score)}</span>` : ''}</div>` : ''}
        </li>`;
      }).join('')}</ol>
    </div>`;
  }

  /* The ladder as badges, lowest tier first, rising left to right. o.stairs draws it as a staircase (Levels hero):
     each step's height is its score floor on the 0 to 100 Index. o.me marks the signed-in operator's own tier. */
  function badgeRow(o) {
    o = o || {};
    const counts = tierCounts();
    const me = o.me && RN.myOp ? RN.myOp() : null;
    const up = tiersDown().reverse();
    return `<ol class="pg-brow${o.stairs ? ' is-stairs' : ''}" aria-label="Reputation Index tiers, lowest first">${up.map((t, i) => {
      const n = counts[t.v] || 0;
      const mine = me && me.ris.tier === t.v;
      const h = o.stairs ? Math.max(14, t.v === 'indexing' ? 14 : t.min) : 0;
      return `<li class="pg-brow-t pg-rung-${esc(t.v)}${mine ? ' is-me' : ''}" style="--i:${i};--h:${h}%">
        <span class="pg-brow-b">${RN.ui.tierBadge(t.v, { size: o.stairs ? 64 : 56 })}</span>
        <b>${esc(t.l)}</b>
        <span class="pg-brow-r">${t.v === 'indexing' ? 'In review' : `${t.min} to ${t.max}`}</span>
        ${o.stairs ? '<i class="pg-brow-step" aria-hidden="true"></i>' : `<span class="pg-brow-n">${t.v === 'indexing' ? RN.fmt.plural(n, 'application') : RN.fmt.plural(n, 'profile')}</span>`}
        ${mine ? `<span class="pg-rung-me">${RN.ui.avatar(me, 'ava-xs')}You, ${esc(me.ris.score)}</span>` : ''}
      </li>`;
    }).join('')}</ol>`;
  }

  /* =====================================================================
     ABOUT
     ===================================================================== */
  const CORE_COPY = {
    C: 'You see them a few hours a week. The best ones tell you what is happening before you have to ask.',
    O: 'They own your number the way an early employee would, and they act before they are told.',
    R: 'Measured on revenue outcomes. A finished playbook nobody uses does not count.',
    E: 'They have solved your exact problem before, at your stage, in a business like yours.',
  };

  function aboutView() {
    const R = market().report;
    const hind = R.hindsight;
    const fvf = R.fracVsFull;
    const ops = RN.model.ops;
    const lib = RN.fields.fitTags.options.length;
    const smart = (t) => esc(RN.fmt.smart(t));
    const keep = (t) => smart(t).replace(/[^\s<>]+-[^\s<>]+/g, (w) => `<span class="nowrap">${w}</span>`);

    // Bars drawn to scale from the research figures ("$12,500" or "68%"); the highlighted row carries the point
    const num = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
    const bars = (rows, max) => { max = max || Math.max(...rows.map((r) => num(r[1]))) || 1; return `<div class="ab-bars">${rows.map(([l, v, hi]) => `<div class="ab-bar${hi ? ' is-hi' : ''}"><span class="ab-bar-l">${keep(l)}</span><span class="ab-bar-t"><i style="--w:${Math.round((num(v) / max) * 100)}%"></i></span><b class="num">${esc(v)}</b></div>`).join('')}</div>`; };
    const pct = Math.round((num(fvf[0][1]) / num(fvf[1][1])) * 100);
    const fitFirst = hind[0], brand = hind[hind.length - 1];
    const times = (num(fitFirst[2]) / num(brand[2])).toFixed(1);
    const fame = ['Big logo on the resume', 'Impressive title', 'A friend’s referral'];
    const fit = ['Same company stage', 'Same deal size', 'Same sales motion', 'Culture fit', 'Proof a company confirmed'];
    const glance = `<dl class="ab-glance" aria-label="Revenue Nomad at a glance">
        <div><dt>Fees for companies. You pay the operator’s rate.</dt><dd class="num">$0</dd></div>
        <div><dt>Typical first reply to an intro request</dt><dd class="num"><span class="u-lt">&lt;</span>2<span class="u">hrs</span></dd></div>
        <div><dt>Founded by operators who still do the work</dt><dd class="num">2023</dd></div>
      </dl>`;
    // The company leads the page: the network's faces, its size and the cleared client logos (no founder portrait)
    const live = ops.filter((o) => !o.hidden);
    const faces = live.filter((o) => o.photo).sort((a, b) => b.ris.score - a.ris.score).slice(0, 7);
    const network = `<figure class="ab-net">
        <a class="ab-net-faces" href="#browse" aria-label="Browse ${esc(RN.fmt.plural(live.length, 'open profile'))}"><span class="ava-stack">${faces.map((op) => RN.ui.avatar(op, 'ava-md ava-ring', { decorative: true })).join('')}</span></a>
        <figcaption class="ab-net-n"><b class="num">350<span class="u-plus">+</span></b><span>Operators in our network, each reviewed by our team. ${esc(RN.fmt.int(live.length))} open profiles in this prototype.</span></figcaption>
        ${RN.fn && RN.fn.logoStrip ? RN.fn.logoStrip({ bare: true, scale: 0.9, className: 'ab-net-logos' }) : ''}
      </figure>`;

    return `
    ${hero({
      eyebrow: 'About Revenue Nomad',
      h: 'Built by operators who got tired of watching good companies <span class="serif">hire the wrong person.</span>',
      lede: `The open network for fractional <span class="nowrap">go-to-market</span> leaders, matched on fit and backed by proof a company confirmed.`,
      actions: `<a class="btn btn-lg" href="#browse">Browse operators${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#how">How it works</a>`,
      aside: network,
      foot: glance,
    })}

    <section class="section ab-why">
      <div class="wrap ab-why-in">
        <div class="ab-why-l">
          <span class="eyebrow">Why we exist</span>
          <h2 class="h2">The problem was always <span class="serif">fit.</span></h2>
          <p class="ab-line">Great leaders fail in the wrong business.</p>
          <p class="ab-line">A $500M company’s CRO rarely fits a $30M one.</p>
          <p class="ab-line is-answer">So we match on fit, and show you the proof before you talk to anyone.</p>
        </div>
        <div class="ab-vs" role="img" aria-label="Hired on fame: big logo, impressive title, a referral. Six months, nothing changed. Hired on fit: same stage, same deal size, same motion, culture fit, proof a company confirmed. Results in the first quarter.">
          <div class="ab-vs-col is-fame"><span class="ab-vs-h">Hired on fame</span><ul>${fame.map((x) => `<li>${icon('x')}${esc(x)}</li>`).join('')}</ul><span class="ab-vs-out">6 months, nothing changed</span></div>
          <div class="ab-vs-col is-fit"><span class="ab-vs-h">Hired on fit</span><ul>${fit.map((x) => `<li>${icon('check')}${esc(x)}</li>`).join('')}</ul><span class="ab-vs-out">Results in the first quarter</span></div>
        </div>
      </div>
    </section>

    <section class="section ab-pov-sec">
      <div class="wrap">
        ${shead('What we believe', 'Two beliefs behind every introduction.')}
        <div class="ab-pov">
          <article class="ab-pov-card is-tint">
            <h3 class="h3">Fractional is a strategy, not a stopgap.</h3>
            <p class="ab-pov-p">Senior leadership for about ${pct}% of the monthly cost of a full-time hire, and far less risk if it is not working.</p>
            ${bars([['Fractional, per month', fvf[0][1], true], ['Full-time, per month', fvf[1][1]]])}
            <dl class="ab-cmp">
              <div class="ab-cmp-h" aria-hidden="true"><span></span><span>Fractional</span><span>Full-time</span></div>
              <div><dt>Time to start</dt><dd class="is-hi">${keep(fvf[0][2])}</dd><dd>${keep(fvf[1][2])}</dd></div>
              <div><dt>If it isn’t working</dt><dd class="is-hi">${keep(fvf[0][3])}</dd><dd>${keep(fvf[1][3])}</dd></div>
            </dl>
            <div class="ab-pov-foot">${illus('Illustrative research')}<a class="act" href="#rates">Compare the cost${icon('arrow')}</a></div>
          </article>
          <article class="ab-pov-card is-gold">
            <h3 class="h3">Fit and proof beat fame.</h3>
            <p class="ab-pov-p">Looking back on a hire, companies ranked relevant experience ${times}<span class="u-x">×</span> more often than brand-name employers.</p>
            ${bars(hind.map((h, i) => [h[0], h[2], i === 0]), 100)}
            <span class="ab-pov-k">Share of hiring companies ranking it in their top three, looking back</span>
            <div class="ab-pov-foot">${illus('Illustrative research')}<a class="act" href="#levels">How we verify proof${icon('arrow')}</a></div>
          </article>
        </div>
      </div>
    </section>

    <section class="section night pg-core">
      <div class="wrap">
        ${shead('What companies rate', 'Four scores after every engagement.', 'Only the company that hired them can give these. Together they move the Reputation Index you see on every profile.')}
        <div class="pg-core-grid ab-core">${RN.fields.coreDims.options.map((d) => `<article class="pg-core-item">
            <span class="pg-core-l" aria-hidden="true">${esc(d.v)}</span>
            <h3 class="h4">${esc(d.l)}</h3>
            <p class="ab-core-d">${smart(CORE_COPY[d.v] || '')}</p>
          </article>`).join('')}</div>
        <a class="act pg-core-link" href="#levels">How CORE feeds the Reputation Index${icon('arrow')}</a>
      </div>
    </section>

    <section class="section ab-diff-sec">
      <div class="wrap">
        ${shead('How we are different', 'Three things most talent firms won’t do.')}
        <ol class="ab-diff">
          <li>${RN.ui.icoTile('eye', { size: 'lg', cls: 'ab-diff-i' })}<h3 class="h4">Open profiles</h3><p class="ab-diff-was">A shortlist, after a sales call</p><p class="ab-diff-now">Every profile is open. No login, no sales call.</p><a class="act" href="#browse">Browse ${RN.fmt.int(ops.length)} profiles${icon('arrow')}</a></li>
          <li>${RN.ui.icoTile('seal', { size: 'lg', tone: 'gold', cls: 'ab-diff-i' })}<h3 class="h4">Verified proof</h3><p class="ab-diff-was">References the candidate picked</p><p class="ab-diff-now">Companies confirm the work. Only they can move a score.</p><a class="act" href="#levels">How levels work${icon('arrow')}</a></li>
          <li>${RN.ui.icoTile('chart', { size: 'lg', tone: 'info', cls: 'ab-diff-i' })}<h3 class="h4">Public research</h3><p class="ab-diff-was">Rates after you sign</p><p class="ab-diff-now">Rates, reports and ${RN.fmt.int(lib)} focus areas. Free to read.</p><a class="act" href="#insights">Open Insights${icon('arrow')}</a></li>
        </ol>
      </div>
    </section>

    <section class="section-sm ab-reach-sec">
      <div class="wrap ab-reach">
        <div class="ab-team">
          <span class="eyebrow">Who we are</span>
          <h2 class="h3">Operators who still do the work, scored by the same rules as everyone here.</h2>
          <div class="pg-sign">${RN.ui.teamAva('ava-md')}<span class="ab-sign-t"><b>The Revenue Nomad team</b><span>A real reply within one business day</span></span></div>
        </div>
        <div class="ab-reach-r"><a class="btn btn-lg" href="#talk">Talk to us${icon('arrow')}</a><a class="link ab-reach-mail" href="mailto:${EMAIL}">${icon('mail')}${EMAIL}</a>${PG.phone()}<button type="button" class="act" data-act="pg-book">${icon('calendar')}Book a call with the team</button></div>
      </div>
    </section>
`;
  }

  /* =====================================================================
     HOW IT WORKS
     ===================================================================== */
  // How it works tab: companies or operators. An operator sees their own side first.
  let HOWTAB = '';
  function howView() {
    const act = (href, label) => `<a class="act" href="#${href}">${esc(label)}${icon('arrow')}</a>`;
    const clients = [
      { i: 'search', t: 'Browse free', d: 'Every profile is open. Search by role, focus area, industry and company size. No login and no sales call first.', l: act('browse', 'Browse talent') },
      { i: 'compare', t: 'Shortlist and compare', d: 'Save operators as you go, then put up to four side by side: Reputation Index, CORE ratings, verified focus areas, availability and rate.', l: act('compare', 'Open compare') },
      { i: 'message', t: 'Request an intro or post an engagement', d: 'Ask to meet one operator by name, or post an engagement from a Blueprint and get ranked matches who reply in their Studio. No fees for companies: you pay the operator’s rate, nothing more.', l: act('engagement.new', 'Post an engagement') + act('blueprints', 'See Blueprints') },
      { i: 'mail', t: 'Introduced within one business day', d: 'The operator replies within 72 hours. Once they say yes, our team confirms the fit and introduces you by email within one business day.', l: asLink('buyer', 'buyer.intros', { mine: `Track your intros${icon('arrow')}`, other: `See a company workspace${icon('arrow')}` }, 'act') },
      { i: 'star', t: 'Review after the engagement', d: 'When the work wraps, you rate the operator on CORE. Your review verifies the focus areas you saw and moves their Reputation Index.', l: act('levels', 'How reviews count') },
    ];
    const cred = studioRoute(/cred/i, 'studio');
    const operators = [
      { i: 'doc', t: 'Apply', d: 'One intake with the same fields companies filter on: role, company fit, role details, availability, rate and fit tags.', l: act('join.operator', 'Apply to join') },
      { i: 'seal', t: 'Approved and live at 50', d: 'Our team checks identity and work history within 2 business days. Approved profiles go live at Emerging, a Reputation Index of 50.', l: act('levels', 'See the levels') },
      { i: 'chart', t: 'Studio insights from day one', d: 'See the searches you appeared in, the kinds of companies that viewed you, and where your rate sits against the Rate Index.', l: asLink('operator', studioRoute(/visib/i), { mine: `Open Studio${icon('arrow')}`, other: `See a sample Studio${icon('arrow')}` }, 'act') },
      { i: 'shield', t: 'Verified proof raises your Reputation Index', d: 'Ask past companies for a CORE review from Studio. Each review rated 4.0 or higher verifies the fit tags it confirms and lifts your score.', l: asLink('operator', cred, { mine: `Open review requests${icon('arrow')}`, other: `See review requests in a sample Studio${icon('arrow')}` }, 'act') },
      { i: 'link', t: 'Direct deals with proof links', d: 'Send a prospect a private proof link with your reviews and engagement history, then see which sections they read.', l: asLink('operator', cred, { mine: `Create a proof link${icon('arrow')}`, other: `See proof links in a sample Studio${icon('arrow')}` }, 'act') },
    ];
    const tab = HOWTAB || (persona() === 'operator' ? 'o' : 'c');
    // The same winding path as Home's How it works (js/views/home.js, RN.homePath draws it), five steps a side
    const path = (key, steps, cta) => `<div class="pg-how-panel" data-how="${key}" role="tabpanel" id="pg-how-${key}" aria-labelledby="pg-how-t-${key}" ${tab === key ? '' : 'hidden'}>
        <div class="hm-path" data-hm-path>
          <svg class="hm-path-svg" aria-hidden="true" focusable="false"><path class="hm-path-track" d=""/><path class="hm-path-glow" d=""/><path class="hm-path-line" d=""/><circle class="hm-path-tip" r="7" cx="-20" cy="-20"/></svg>
          <ol class="hm-psteps">${steps.map((s, i) => `<li class="hm-pstep ${i % 2 ? 'hm-pstep-r' : 'hm-pstep-l'}">
            <span class="hm-pnode" aria-hidden="true">${icon(s.i)}<b class="hm-pnode-n">${i + 1}</b></span>
            <div class="hm-pcard"><span class="hm-pcard-k">Step ${i + 1}</span><h3 class="hm-pcard-t">${esc(s.t)}</h3><p>${esc(s.d)}</p><div class="row pg-step-links">${s.l}</div></div>
          </li>`).join('')}</ol>
        </div>
        <div class="pg-how-cta">${cta}</div>
      </div>`;
    // Proof to close on: company reviews with a before-and-after figure, and the faces companies can browse today
    const proof = allReviews().filter((x) => pullStat(x.r)).slice(0, 2).map((x) => Object.assign({}, x));
    const faces = RN.model.ops.filter((o) => !o.hidden && o.photo).sort((a, b) => b.ris.score - a.ris.score).slice(0, 6);
    const live = RN.model.ops.filter((o) => !o.hidden).length;
    return `
    ${hero({
      eyebrow: 'How it works',
      h: `One network, <span class="serif">two sides that both win.</span>`,
      lede: 'Companies find proven fractional leaders without a retained search. Operators get found, build proof, and get value even in months with no intro.',
      aside: `<div class="pg-flow" aria-label="From an intro request to an introduction">
        <span class="label">From request to introduction</span>
        <ol class="pg-flow-l">
          <li>${RN.ui.icoTile('send', { round: true, cls: 'pg-flow-i' })}<div><b>You request an intro</b><span>No login to browse, $0 in fees for companies</span></div><em class="num">Day 0</em></li>
          <li>${RN.ui.icoTile('message', { round: true, cls: 'pg-flow-i' })}<div><b>The operator replies</b><span>Every request is answered within 72 hours</span></div><em class="num">&lt;2 hrs typical</em></li>
          <li>${RN.ui.icoTile('check-circle', { round: true, cls: 'pg-flow-i' })}<div><b>They say yes, we confirm the fit</b><span>A person on our team checks scope and timing</span></div><em class="num">Same day</em></li>
          <li class="is-end">${RN.ui.icoTile('mail', { round: true, tone: 'gold', cls: 'pg-flow-i' })}<div><b>Introduced by email</b><span>In business days, from the operator’s yes</span></div><em class="num">1 day</em></li>
        </ol>
      </div>`,
    })}
    <section class="section pg-how-sec">
      <div class="wrap">
        <div class="pg-how-hd">
          <div class="pg-seg" role="tablist" aria-label="Who it is for">
            <button type="button" role="tab" id="pg-how-t-c" aria-controls="pg-how-c" aria-selected="${tab === 'c'}" data-act="pg-how-tab" data-k="c">${icon('building')}For companies</button>
            <button type="button" role="tab" id="pg-how-t-o" aria-controls="pg-how-o" aria-selected="${tab === 'o'}" data-act="pg-how-tab" data-k="o">${icon('user')}For operators</button>
          </div>
          <h2 class="h2 pg-how-h" data-how-h="c" ${tab === 'c' ? '' : 'hidden'}>Hire on fit and proof, in days.</h2>
          <h2 class="h2 pg-how-h" data-how-h="o" ${tab === 'o' ? '' : 'hidden'}>Get found, and get value without an intro.</h2>
        </div>
        ${path('c', clients, `<a class="btn btn-lg" href="#browse">Browse talent${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#talk">Talk to us</a>`)}
        ${path('o', operators, `<a class="btn btn-lg" href="#join.operator">Apply to join${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#operators">Why join</a><span class="pg-how-note">${icon('clock')}Applications reviewed within 2 business days</span>`)}
      </div>
    </section>
    <section class="section pg-how-proof">
      <div class="wrap">
        ${shead('Where it leads', 'What companies wrote afterwards.', 'Figures from company reviews on the network, in the company’s own words.', `<a class="act" href="#results">All company reviews${icon('arrow')}</a>`)}
        <div class="pg-how-proof-g">
          ${proof.map((x, i) => revCard(x, i)).join('')}
          <a class="pg-faces-card" href="#browse">
            <span class="ava-stack">${faces.map((op) => RN.ui.avatar(op, 'ava-md ava-ring')).join('')}</span>
            <b>${RN.fmt.int(live)} open profiles</b>
            <span>Every one readable before you talk to anyone. No login.</span>
            <span class="pg-faces-go">Browse operators${icon('arrow')}</span>
          </a>
        </div>
      </div>
    </section>
    ${band({ h: 'Rather talk it through with a person?', text: 'Four quick questions and your email, then a real reply from a person within one business day.', actions: talkActions() })}`;
  }
  let howOffs = [];
  function howUnmount() { howOffs.forEach((f) => f()); howOffs = []; }
  function howMount(root) {
    howUnmount();
    const p = root.querySelector('.pg-how-panel:not([hidden])');
    if (p && RN.homePath) RN.homePath(p, howOffs);
  }
  RN.actions['pg-how-tab'] = (el) => {
    const k = el.dataset.k === 'o' ? 'o' : 'c';
    HOWTAB = k;
    const root = document.querySelector('main[data-view="how"]');
    if (!root) return;
    RN.$$('[data-act="pg-how-tab"]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k)));
    RN.$$('.pg-how-panel', root).forEach((x) => { x.hidden = x.dataset.how !== k; });
    RN.$$('[data-how-h]', root).forEach((x) => { x.hidden = x.dataset.howH !== k; });
    howMount(root);
  };

  /* =====================================================================
     RESULTS
     ===================================================================== */
  function allReviews() {
    try { RN.model.applyEdits(); } catch (e) { /* edits are optional */ }
    const out = [];
    RN.model.ops.forEach((op) => (op.reviews || []).forEach((r) => out.push({ op, r })));
    return out.sort((a, b) => String(b.r.date || b.r.ts || '').localeCompare(String(a.r.date || a.r.ts || '')));
  }
  const reviewText = (r) => r.quote || r.text || r.experience || r.overallExperience || '';
  const reviewScore = (r) => (typeof r.overall === 'number' ? r.overall : typeof r.coreAvg === 'number' ? r.coreAvg : null);

  /* A figure a company wrote into its own review ("Gross retention went from 84% to 92%"), lifted out as a pull stat.
     Only numeric before-and-after phrases qualify, so nothing is paraphrased. */
  const STAT_RE = /(?:^|[.!?]\s+)([A-Z][^.!?]{2,48}?)\s+went from (\d[\d.,]*%?|nothing) to (\d[\d.,]*%?)/;
  function pullStat(r) {
    const m = STAT_RE.exec(reviewText(r));
    if (!m) return null;
    return { label: m[1].trim(), from: m[2] === 'nothing' ? 'Nothing' : m[2], to: m[3] };
  }
  // Results wall state: the role filter and whether every review shows. Kept across re-renders of the visit.
  const W = { cat: 'all', all: false };
  const WALL_N = 6; // two even rows on the first screen; the rest behind Show all
  const wallN = () => { try { return window.matchMedia('(max-width: 640px)').matches ? 4 : WALL_N; } catch (e) { return WALL_N; } };
  /* The review's own rating, drawn large in the arch when there is no reviewer headshot (same treatment as Home) */
  function rateArch(x) {
    const sc = reviewScore(x.r);
    const nTags = (x.r.tags || []).length;
    return `<div class="pg-arch pg-arch-rate">
      <div class="pg-rate-in">
        ${sc != null ? `<span class="pg-rate-n num">${esc(sc.toFixed(1))}</span><span class="pg-rate-stars">${RN.ui.stars(sc)}</span><span class="pg-rate-k">Overall rating</span>` : ''}
        <ul class="pg-rate-facts">${x.r.hireAgain ? `<li>${icon('check-circle')}Would hire again</li>` : ''}${nTags ? `<li>${icon('seal')}${esc(RN.fmt.plural(nTags, 'focus area'))} verified</li>` : ''}</ul>
        <span class="pg-rate-logo">${RN.ui.logo(RN.model.reviewLogo(x.op, x.r), { h: 26, name: x.r.company || 'Company' })}</span>
      </div>
    </div>`;
  }
  const revOp = (op, r) => `<a class="pg-rev-op" href="#op.${esc(op.slug)}">${RN.ui.avatar(op, 'ava-sm')}<span class="pg-rev-op-t"><b>${esc(op.name)}</b><span>Fractional ${esc(op.role)} · ${RN.fmt.plural((r.tags || []).length, 'focus area')} verified</span></span>${icon('arrow')}</a>`;
  const revBy = (r) => `<p class="pg-rev-by"><b>${esc(r.reviewer || 'Company')}</b><span>${esc([r.role, r.company].filter(Boolean).join(', '))}</span></p>`;
  const revTop = (r) => `<div class="pg-rev-top">${reviewScore(r) ? `<span class="pg-rev-sc">${RN.ui.stars(reviewScore(r))}<b>${reviewScore(r).toFixed(1)}</b></span>` : '<span></span>'}${r.hireAgain ? `<span class="pill pill-good">${icon('check')}Would hire again</span>` : ''}</div>`;
  function revCard(x, i) {
    const { op, r } = x;
    const photo = (RN.data.reviewerPhotos || {})[r.reviewer] || '';
    const st = pullStat(r);
    const attrs = `data-cat="${esc(op.catKey)}" data-i="${i}"`;
    // A face anchors the wide cards: the reviewer's headshot when we have one, otherwise the operator's photo
    if (x.kind === 'wide') {
      const face = photo ? `<img class="pg-rev-face${/-cut\./.test(photo) ? ' is-cut' : ''}" src="${esc(photo)}" alt="${esc(r.reviewer)}" onerror="this.remove()">` : `${RN.ui.avatar(op, 'ava-xl pg-rev-ava')}`;
      return `<article class="pg-rev pg-rev-wide" ${attrs}>
        <div class="pg-rev-face-w${photo ? ' is-reviewer' : ''}">${face}</div>
        <div class="pg-rev-body">${revTop(r)}<blockquote class="pg-rev-q">${esc(RN.fmt.smart(RN.model.pullQuote(reviewText(r), 260)))}</blockquote>${revBy(r)}${revOp(op, r)}</div>
      </article>`;
    }
    if (st) {
      return `<article class="pg-rev pg-rev-stat" ${attrs}>
        <div class="pg-rev-fig"><span class="num">${esc(st.from)}</span><i aria-hidden="true">${icon('arrow')}</i><span class="num">${esc(st.to)}</span></div>
        <span class="pg-rev-fl">${esc(st.label)}</span>
        <blockquote class="pg-rev-q">“${esc(RN.fmt.smart(reviewText(r)))}”</blockquote>${revBy(r)}${revOp(op, r)}
      </article>`;
    }
    return `<article class="pg-rev" ${attrs}>${revTop(r)}<blockquote class="pg-rev-q">“${esc(RN.fmt.smart(reviewText(r)))}”</blockquote>${revBy(r)}${revOp(op, r)}</article>`;
  }

  function resultsView() {
    const all = allReviews();
    const R = market().report;
    // One neutral rule for every operator (founder decision, Sep 25, 2026): highest score, then most recent
    const featured = all.slice().sort(RN.model.reviewRank)[0];
    const scored = all.map((x) => reviewScore(x.r)).filter((n) => n != null);
    const avg = scored.length ? scored.reduce((a, n) => a + n, 0) / scored.length : 0;
    const again = all.filter((x) => x.r.hireAgain === true || x.r.hireAgain === 'yes').length;
    const verified = RN.model.ops.reduce((a, o) => a + o.tags.filter((t) => t.tier !== 'claimed').length, 0);
    const pick = (re) => R.summary.find((s) => re.test(s.l));
    const research = [pick(/rehire/i), pick(/engagement length/i), pick(/pipeline/i), pick(/first sales leadership/i)].filter(Boolean);
    // The operators behind the reviews, photos first, for the hero's face strip
    const reviewed = [...new Set(all.map((x) => x.op))].sort((a, b) => (b.photo ? 1 : 0) - (a.photo ? 1 : 0) || b.reviews.length - a.reviews.length);
    const companies = new Set(all.map((x) => x.r.company).filter(Boolean)).size;
    // Photos only in the stack (initials read badly overlapped); the rest are a count
    const faces = reviewed.filter((o) => o.photo).slice(0, 5);

    // The wall: a wide card with a face, then pull-stat cards where a company wrote a before-and-after figure
    const rest = all.filter((x) => x !== featured).map((x) => Object.assign({}, x));
    let wides = 0;
    rest.forEach((x) => { if (wides < 3 && ((RN.data.reviewerPhotos || {})[x.r.reviewer] || x.op.photo)) { x.kind = 'wide'; wides++; } });
    /* Rhythm on a 3-column grid: a wide card and one card, a row of three, then one card and the next wide card
       (so the faces alternate sides), with the pull-stat cards spread through the plain ones. */
    const W3 = rest.filter((x) => x.kind === 'wide');
    const stats = rest.filter((x) => !x.kind && pullStat(x.r));
    const plain = rest.filter((x) => !x.kind && !pullStat(x.r));
    const singles = [];
    while (stats.length || plain.length) { if (stats.length) singles.push(stats.shift()); for (let k = 0; k < 2 && plain.length; k++) singles.push(plain.shift()); }
    const wall = [];
    W3.forEach((w, k) => { if (k % 2) { wall.push(...singles.splice(0, 1), w); } else { wall.push(w, ...singles.splice(0, 1)); } wall.push(...singles.splice(0, 3)); });
    wall.push(...singles);
    const cats = RN.fields.roleCategory.options.map((o) => ({ o, n: wall.filter((x) => x.op.catKey === o.v).length })).filter((c) => c.n);
    if (W.cat !== 'all' && !cats.some((c) => c.o.v === W.cat)) W.cat = 'all';
    const ha = all.length ? Math.round((again / all.length) * 100) : 0;
    return `
    ${hero({
      eyebrow: 'Results',
      h: `Proof, <span class="serif">in their words.</span>`,
      lede: 'Company reviews of operators on the network, written by the company and published as submitted. Where a figure comes from research instead of a review, we say so.',
      aside: `<div class="pg-proof">
        <div class="pg-proof-faces">
          <span class="ava-stack">${faces.map((op) => RN.ui.avatar(op, 'ava-md ava-ring')).join('')}${reviewed.length > faces.length ? `<span class="ava ava-md ava-ring pg-proof-more">+${reviewed.length - faces.length}</span>` : ''}</span>
          <p><b>${RN.fmt.plural(reviewed.length, 'operator')}</b> reviewed by ${RN.fmt.plural(companies, 'company')}</p>
        </div>
        <div class="pg-proof-avg"><span class="pg-proof-n num">${avg ? avg.toFixed(1) : '0'}</span><span class="pg-proof-s">${avg ? RN.ui.stars(avg) : ''}<span>Average overall rating, ${RN.fmt.plural(all.length, 'company review')}</span></span></div>
        <dl class="pg-proof-row">
          <div><dt>Would hire again</dt><dd class="num">${ha}<small>%</small></dd></div>
          <div><dt>Focus areas verified</dt><dd class="num">${RN.fmt.int(verified)}</dd></div>
        </dl>
        <span class="pg-hero-note">${icon('check-circle')}Live network export</span>
      </div>`,
    })}

    ${featured ? `<section class="section pg-feature-sec">
      <div class="wrap pg-feature">
        ${(RN.data.reviewerPhotos || {})[featured.r.reviewer] ? `<div class="pg-arch pg-arch-sage pg-arch-photo"><img src="${esc(RN.data.reviewerPhotos[featured.r.reviewer])}" alt="${esc(featured.r.reviewer)}" onerror="this.closest('.pg-feature').classList.add('is-nophoto')"></div>` : ''}
        ${rateArch(featured)}
        <figure class="pg-feature-q">
          <span class="pg-qmark" aria-hidden="true">“</span>
          <blockquote>${esc(reviewText(featured.r))}</blockquote>
          <figcaption><b>${esc(featured.r.reviewer)}</b><span>${esc(featured.r.role)}, ${esc(featured.r.company)}${featured.r.date ? ` · Reviewed ${esc(RN.fmt.date(featured.r.date + 'T12:00:00'))}` : ''}</span></figcaption>
          ${(featured.r.tags || []).length ? `<div class="pg-feature-tags"><span class="label">Focus areas this review verified for ${esc(featured.op.first)}</span>${RN.ui.ftags((featured.r.tags || []).map((t) => ({ t, tier: 'verified' })))}</div>` : ''}
          <a class="act" href="#op.${esc(featured.op.slug)}">Read the full review on ${esc(featured.op.first)}’s profile${icon('arrow')}</a>
        </figure>
      </div>
    </section>` : ''}

    ${wall.length ? `<section class="section pg-wall-sec">
      <div class="wrap">
        ${shead('Company reviews', 'More from their companies.', `Every company review on the network, ${RN.fmt.int(all.length)} so far. Reviews publish without a moderation queue.`)}
        <div class="pg-wall-f" role="group" aria-label="Filter reviews by the operator’s role">
          <button type="button" class="chip${W.cat === 'all' ? ' on' : ''}" data-act="pg-wall-cat" data-cat="all" aria-pressed="${W.cat === 'all'}">All<span class="pg-wall-n">${wall.length}</span></button>
          ${cats.map(({ o, n }) => `<button type="button" class="chip${W.cat === o.v ? ' on' : ''}" data-act="pg-wall-cat" data-cat="${esc(o.v)}" aria-pressed="${W.cat === o.v}">${RN.ui.catDot(o.v)}${esc(o.l)}<span class="pg-wall-n">${n}</span></button>`).join('')}
        </div>
        <div class="pg-wall" data-pg-wall>${wall.map(revCard).join('')}
          <article class="pg-rev pg-rev-how">
            ${RN.ui.icoTile('star', { size: 'lg', tone: 'gold', cls: 'pg-value-i' })}
            <h3 class="h4">Every company gets asked</h3>
            <p class="small">Operators request a review from Studio when an engagement ends. The company answers four CORE questions, rates the outcome and says whether they would hire again. The review publishes the day it lands.</p>
            <a class="act" href="#levels">How reviews move the Reputation Index${icon('arrow')}</a>
          </article></div>
        <div class="pg-wall-more"><button type="button" class="btn btn-line" data-act="pg-wall-all" data-pg-wall-more>Show all reviews</button></div>
      </div>
    </section>` : ''}

    <section class="section pg-research-sec">
      <div class="wrap">
        ${shead('What the research says', 'Proof is what gets operators rehired.', `From the State of Fractional GTM ${esc(R.year)} research mockup. Every figure in this section is illustrative.`, `${illus()}<a class="act" href="#report">Read the report${icon('arrow')}</a>`)}
        <div class="stats-row" style="--cols:${research.length}">${research.map((s) => `<div class="stat"><span class="stat-v">${esc(s.v)}</span><span class="stat-l">${esc(s.l.replace(/buyers/gi, 'clients'))}</span></div>`).join('')}</div>
        <details class="pg-more">
          <summary>${icon('chev-down')}What hiring companies say mattered, and how engagements end</summary>
        <div class="grid g-2 pg-research">
          <div class="card">
            <div class="card-hd"><div><h3>What hiring companies say mattered, in hindsight</h3><p class="sub">Share who put each factor in their top three</p></div></div>
            <div class="pg-meters">${R.hindsight.map((h, i) => `<div class="pg-mrow"><span>${esc(h[0])}</span><div class="meter"><i style="width:${parseInt(h[2], 10)}%;${i === R.hindsight.length - 1 ? 'background:var(--viz-muted)' : ''}"></i></div><b>${esc(h[2])}</b></div>`).join('')}</div>
          </div>
          <div class="card">
            <div class="card-hd"><div><h3>How engagements end</h3><p class="sub">Share of fractional GTM engagements</p></div></div>
            <div class="pg-meters">${R.outcomes.map((o) => `<div class="pg-mrow"><span>${esc(o.l)}</span><div class="meter"><i style="width:${parseInt(o.v, 10)}%"></i></div><b>${esc(o.v)}</b></div>`).join('')}</div>
            <blockquote class="pg-survey-q">“${esc(R.quote.text)}”<span>${esc(R.quote.by)}, illustrative</span></blockquote>
          </div>
        </div>
        </details>
      </div>
    </section>

    ${band({ h: 'Want an operator with a record like this?', text: 'Tell us what you need and we will put three operators in front of you, matched on the same fields they filled in at signup.', actions: talkActions() })}`;
  }
  /* Filter and trim the wall in place (no re-render, so the page keeps its scroll position) */
  function applyWall(root) {
    const box = (root || document).querySelector('[data-pg-wall]');
    if (!box) return;
    const cards = RN.$$('.pg-rev[data-cat]', box);
    const hit = cards.filter((c) => W.cat === 'all' || c.dataset.cat === W.cat);
    // A wide card counts as two slots, so the first screen is three even rows
    let slots = 0;
    cards.forEach((c) => { c.hidden = true; });
    hit.forEach((c) => { const w = c.classList.contains('pg-rev-wide') ? 2 : 1; if (W.all || slots + w <= wallN()) { c.hidden = false; slots += w; } });
    const shown = hit.filter((c) => !c.hidden).length;
    const how = box.querySelector('.pg-rev-how');
    if (how) how.hidden = shown < hit.length;
    const more = (root || document).querySelector('[data-pg-wall-more]');
    if (more) { more.hidden = shown >= hit.length; more.textContent = `Show all ${RN.fmt.plural(hit.length, 'review')}`; }
    RN.$$('[data-act="pg-wall-cat"]', (root || document)).forEach((b) => { const on = b.dataset.cat === W.cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  RN.actions['pg-wall-cat'] = (el) => { W.cat = el.dataset.cat || 'all'; W.all = false; applyWall(); };
  RN.actions['pg-wall-all'] = () => { W.all = true; applyWall(); };

  /* =====================================================================
     TALK TO US: short auto-advancing flow on the standard picklists
     ===================================================================== */
  const STEPS = [
    { key: 'need', q: 'What do you need help with?', cols: 2, hint: 'Pick the closest. We match it to the role categories that solve it.' },
    // Company size is one screen with two chip rows: revenue, then headcount. It advances once both are picked.
    { key: 'size', q: 'How big is the business today?', rows: [{ key: 'companyRevenue', cols: 3 }, { key: 'companyEmployees', cols: 3 }] },
    { key: 'startBy', q: 'When do you need them to start?', cols: 3, hint: 'We match this to each operator’s availability.' },
    { key: 'contact', q: 'Last one. Where should we reply?' },
  ];
  // The answer keys a step sets (one for a single chip row, two for the size step)
  const stepKeys = (s) => (s.rows ? s.rows.map((r) => r.key) : [s.key]);
  const TKEY = 'rn-pg-talk-v3';
  const fresh = (need) => ({ step: need ? 1 : 0, ans: need ? { need } : {}, ctx: need || null, name: '', email: '', company: '', title: '', err: '', focus: '', done: false, sugg: [], matches: 0, booked: null, sentAt: null, search: null, note: '', usedSearch: null });
  let T = (function () { try { const s = JSON.parse(window.sessionStorage.getItem(TKEY) || 'null'); if (s && s.ans) return Object.assign(fresh(), s); } catch (e) { /* ignore */ } return fresh(); })();
  function save() { try { window.sessionStorage.setItem(TKEY, JSON.stringify(T)); } catch (e) { /* in memory only */ } }
  let advTimer = null;

  // A signed-in client's company size comes from their company profile, so they skip the size step
  const steps = () => (persona() === 'buyer' ? STEPS.filter((s) => s.key !== 'size') : STEPS);
  const needCats = (need) => (RN.fields.needCats[need] || []).slice();
  // Operators available by the start date: "as soon as possible" wants operators free now, "2 weeks" also takes
  // those free in 2 weeks, "2+ weeks" takes everyone. Same order the done screen ranks on (AVAIL_RANK).
  const availBy = (startBy) => (AVAIL_RANK[startBy] == null ? [] : Object.keys(AVAIL_RANK).filter((k) => AVAIL_RANK[k] <= AVAIL_RANK[startBy]));
  /* The Browse filters the answers stand for. One source for the live count, the done screen's
     "See all N in Browse" and the logged search, so the number the client watches is the number they get. */
  function matchFilters(ans) {
    const filters = {};
    const cats = needCats(ans.need);
    if (cats.length) filters.roleCategories = cats;
    if (ans.companyRevenue) filters.revenueRange = [ans.companyRevenue];
    if (ans.companyEmployees) filters.employeeRange = [ans.companyEmployees];
    const av = availBy(ans.startBy);
    if (av.length && av.length < Object.keys(AVAIL_RANK).length) filters.availability = av;
    return filters;
  }
  const liveCount = () => RN.model.search({ filters: matchFilters(T.ans) }).length;
  const answered = () => ['need', 'companyRevenue', 'companyEmployees', 'startBy'].some((k) => T.ans[k]);
  function liveText(n) {
    if (!answered()) return `<b class="num" data-n="${n}">${RN.fmt.int(n)}</b> ${n === 1 ? 'operator' : 'operators'} on the network`;
    return `<b class="num" data-n="${n}">${RN.fmt.int(n)}</b> ${n === 1 ? 'operator matches' : 'operators match'} so far`;
  }
  // Live match count: a result that moves as they answer, from the first question on
  function liveBadge() {
    const n = liveCount();
    return `<p class="pg-live${n ? '' : ' is-zero'}" role="status" aria-live="polite"><span class="pg-live-dot" aria-hidden="true"></span><span class="pg-live-t">${liveText(n)}</span></p>`;
  }
  let liveRaf = 0;
  function updateLive() {
    const el = RN.$('.pg-talk .pg-live');
    if (!el) return;
    const b = el.querySelector('b.num');
    const from = b ? +b.dataset.n || 0 : 0;
    const to = liveCount();
    lastLive = to;
    el.classList.toggle('is-zero', !to);
    el.querySelector('.pg-live-t').innerHTML = liveText(to);
    const nb = el.querySelector('b.num');
    cancelAnimationFrame(liveRaf);
    if (from === to) return;
    el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t0 = performance.now(), dur = 450;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      nb.textContent = RN.fmt.int(Math.round(from + (to - from) * e));
      if (p < 1) liveRaf = requestAnimationFrame(tick);
    };
    nb.textContent = RN.fmt.int(from);
    liveRaf = requestAnimationFrame(tick);
  }
  function brief() {
    return { need: T.ans.need, revenueRange: T.ans.companyRevenue, employeeRange: T.ans.companyEmployees, availability: T.ans.startBy };
  }
  function prefillPersona() {
    if (persona() !== 'buyer') return;
    const b = RN.personas.buyer;
    T.ans.companyRevenue = T.ans.companyRevenue || b.company.revenueRange;
    T.ans.companyEmployees = T.ans.companyEmployees || b.company.employeeRange;
    if (!T.name) T.name = b.name;
    if (!T.email) T.email = b.email;
    if (!T.company) T.company = b.company.name;
    if (!T.title) T.title = b.title || '';
  }
  // Short recap labels: the two question-style labels read badly in a chip; range labels stay standard
  const RECAP = { need: 'Need', startBy: 'Start' };
  function recap(o) {
    o = o || {};
    const keys = ['need', 'companyRevenue', 'companyEmployees', 'startBy'];
    const st = steps();
    return keys.filter((k) => T.ans[k]).map((k) => {
      const i = st.findIndex((s) => stepKeys(s).includes(k));
      const label = k === 'need' ? needL(T.ans[k]) : RN.w.label(k, T.ans[k]);
      const name = RECAP[k] || RN.fields[k].label;
      if (o.text) return `${name}: ${label}`;
      return i >= 0 ? `<button type="button" class="pg-recap-chip" data-act="pg-talk-jump" data-i="${i}" title="Change this answer"><span>${esc(name)}</span>${esc(label)}<i class="pg-recap-ed" aria-hidden="true">${icon('edit')}</i></button>`
        : `<span class="pg-recap-chip is-fixed" title="From your company profile"><span>${esc(name)}</span>${esc(label)}</span>`;
    });
  }

  function suggest() {
    const b = brief();
    const cats = needCats(b.need);
    let rows = cats.length ? cats.flatMap((c) => RN.model.rank(Object.assign({}, b, { roleCategory: c }), { limit: 6 })) : RN.model.rank(b, { limit: 12 });
    const seen = new Set();
    rows = rows.filter((r) => !seen.has(r.op.id) && seen.add(r.op.id));
    const want = AVAIL_RANK[b.availability] == null ? 2 : AVAIL_RANK[b.availability];
    const late = (op) => ((AVAIL_RANK[op.avail.key] || 0) > want ? 1 : 0);
    // Available by the start date first, then fit, then Reputation Index
    rows.sort((x, y) => late(x.op) - late(y.op) || y.fit.pct - x.fit.pct || y.op.ris.score - x.op.ris.score);
    const filters = matchFilters(T.ans);
    const matches = RN.model.search({ filters }).length;
    return { top: rows.slice(0, 3), matches, filters };
  }

  /* The unmet search a client just made in Browse ("Tell us what you need" on a zero-result or thin search).
     Browse hands it over in RN.store.state.seen.talkPrefill (read once, then cleared here). As a fallback, a recent
     `search` event with meta.tellUs is used once. */
  function searchContext() {
    const st = RN.store.state;
    const pre = st.seen && st.seen.talkPrefill;
    const tell = (st.events || []).slice(0, 25).find((e) => e.type === 'search' && e.meta && e.meta.tellUs);
    if (pre && (pre.q || pre.cat || (pre.tags || []).length || Object.keys(pre.filters || {}).length)) return { pre: true, id: tell ? tell.id : 'pre', q: pre.q || '', tags: pre.tags || [], filters: pre.filters || {}, cat: pre.cat || '' };
    if (!tell || !(RN.now() - new Date(tell.ts) < 30 * 60 * 1000)) return null;
    return { id: tell.id, q: tell.q || '', tags: tell.tags || [], filters: tell.filters || {} };
  }
  function applySearch(ctx) {
    const keep = T.usedSearch || [];
    T = fresh();
    T.usedSearch = keep.concat(ctx.id).slice(-10);
    if (ctx.pre) { try { delete RN.store.state.seen.talkPrefill; RN.store.save(); } catch (e) { /* read once either way */ } }
    const f = ctx.filters || {};
    const first = (v) => [].concat(v || [])[0] || '';
    const cats = [].concat(f.roleCategories || [], ctx.cat || []).filter(Boolean);
    const label = [ctx.q, ...(ctx.tags || [])].filter(Boolean).join(', ') || cats.map((c) => RN.fields.catLabel(c)).join(', ');
    T.search = { q: ctx.q || '', label: label || 'your filters' };
    T.note = label || '';
    // A signed-in client's company size comes from their company profile, not from a Browse filter
    if (persona() !== 'buyer' && first(f.revenueRange)) T.ans.companyRevenue = first(f.revenueRange);
    if (persona() !== 'buyer' && first(f.employeeRange)) T.ans.companyEmployees = first(f.employeeRange);
    if (first(f.availability)) T.ans.startBy = first(f.availability);
    if (first(f.industries)) T.industry = first(f.industries);
    // Preselect the need only when the searched role categories point to exactly one
    const needs = cats.length ? Object.keys(RN.fields.needCats).filter((n) => cats.some((c) => (RN.fields.needCats[n] || []).includes(c))) : [];
    if (needs.length === 1) T.ans.need = needs[0];
    save();
  }

  function talkView(params) {
    const need = params && params.need && RN.fields.need.options.some((o) => o.v === params.need) ? params.need : '';
    const ctx = searchContext();
    if (ctx && (ctx.pre || !(T.usedSearch || []).includes(ctx.id))) {
      applySearch(ctx);
      if (need) { T.ans.need = need; T.ctx = need; T.step = 1; save(); }
    } else if (need && T.ctx !== need) { T = Object.assign(fresh(need), { usedSearch: T.usedSearch }); save(); }
    prefillPersona();
    return T.done ? talkDone() : talkStep();
  }

  /* Flow progress: the shared step count and segmented .stepper, one segment per question */
  function progress(cur, total, done) {
    const label = done ? 'Request sent' : `Question ${cur + 1} of ${total}`;
    return `<div class="stepper pg-stepper" role="progressbar" aria-label="${esc(label)}" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${done ? total : cur + 1}">${Array.from({ length: total }, (_, i) => `<i class="${done || i <= cur ? 'on' : ''}"></i>`).join('')}</div>`;
  }

  /* Answer tiles carry a picture of the answer: Home's problem icons on the need step (same map as home.js), and a
     scale on the size step (bars that grow with revenue, dots that multiply with headcount). */
  const NEED_IC = { sales_motion: 'target', pipeline: 'trend-up', team: 'users', systems: 'layers', ai: 'ai', retention: 'refresh', partners: 'handshake', not_sure: 'message' };
  function tileGlyph(key, v) {
    if (key === 'need') { const cats = (RN.fields.needCats && RN.fields.needCats[v]) || []; return RN.ui.icoTile(NEED_IC[v] || 'target', { tone: cats.length ? RN.ui.icoTone(cats[0]) : '', cls: 'pg-t-ic' }); }
    const opts = (RN.fields[key] && RN.fields[key].options) || [];
    const k = opts.findIndex((o) => o.v === v);
    if (k < 0 || (key !== 'companyRevenue' && key !== 'companyEmployees')) return '';
    if (key === 'companyRevenue') return `<span class="pg-t-sc is-bars" aria-hidden="true">${opts.map((o, j) => `<i class="${j <= k ? 'on' : ''}" style="--j:${j}"></i>`).join('')}</span>`;
    return `<span class="pg-t-sc is-dots" aria-hidden="true">${opts.map((o, j) => `<i class="${j <= k ? 'on' : ''}"></i>`).join('')}</span>`;
  }
  // On Talk to us the catch-all need reads "Other" (founder comment, Oct 12, 2026); Home keeps its "Not sure yet" card
  const needL = (v) => (v === 'not_sure' ? 'Other' : RN.w.label('need', v));
  const decorate = (html, key) => html.replace(/(<button[^>]*data-v="([^"]*)"[^>]*>)/g, (m, open, v) => open + tileGlyph(key, v))
    .replace(/(data-v="not_sure"[^>]*>(?:(?!<\/button>)[\s\S])*?)Not sure yet/, '$1Other');
  let lastLive = null;

  function talkStep() {
    const st = steps();
    T.step = RN.clamp(T.step | 0, 0, st.length - 1);
    const s = st[T.step];
    save();
    const p = persona();
    const note = p === 'buyer' ? `<p class="pg-talk-note">${icon('check-circle')}Signed in as ${esc(RN.personas.buyer.name)}, ${esc(RN.personas.buyer.company.name)}. We filled in your company size.</p>`
      : p === 'operator' ? `<p class="pg-talk-note">${icon('info')}This form is for companies hiring. For help with your profile, open <a href="#studio">Studio</a> or call ${PHONE}.</p>` : '';
    const searched = T.search ? `<p class="pg-talk-note pg-talk-search">${icon('search')}<span>You searched “${esc(T.search.label)}”. We send it to our team with your answers, so you do not have to describe it again.</span></p>` : '';
    const chips = T.step > 0 ? recap() : [];
    let body = '';
    if (s.key === 'contact') {
      body = `<form class="pg-contact" data-submit="pg-talk-send" novalidate>
          ${chips.length ? `<div class="pg-recap" aria-label="Your answers">${chips.join('')}</div>` : ''}
          <div class="grid g-2 pg-contact-grid">
            ${RN.w.field('fullName', T.name, { name: 'name', id: 'pg-name', label: 'Your name' })}
            ${RN.w.field('email', T.email, { name: 'email', id: 'pg-email' })}
          </div>
          <div class="grid g-2 pg-contact-grid">
            <div class="field"><label for="pg-co">Company <span class="opt">Optional</span></label><input class="input" id="pg-co" name="company" value="${esc(T.company)}" placeholder="Company name" autocomplete="organization"></div>
            <div class="field"><label for="pg-title">Title <span class="opt">Optional</span></label><input class="input" id="pg-title" name="title" value="${esc(T.title || '')}" placeholder="e.g. COO" autocomplete="organization-title"></div>
          </div>
          <div class="field"><label for="pg-note">What are you looking for? <span class="opt">Optional</span></label><textarea class="textarea input" id="pg-note" name="note" maxlength="500" rows="2" placeholder="The problem, the timeline, what good looks like in 90 days.">${esc(T.note || '')}</textarea></div>
          ${T.err ? `<p class="pg-err" role="alert">${icon('info')}${esc(T.err)}</p>` : ''}
          <div class="pg-contact-foot"><button class="btn btn-leaf btn-lg" type="submit">Show my matches${icon('arrow')}</button><span class="small">We show you three operators now, and a person replies within one business day. No sales sequence, and no fees for companies.</span></div>
        </form>`;
    } else if (s.rows) {
      // Two chip rows on one screen, each with its own label; numbers 1 to N answer the first open row
      // One numbering across both rows: revenue 1 to 6, headcount 7 to 12 (onTalkKey reads two-digit keys)
      body = s.rows.map((r, ri) => {
        const d = RN.fields[r.key];
        const k0 = s.rows.slice(0, ri).reduce((a, x) => a + RN.fields[x.key].options.length, 0);
        return `<div class="pg-row" data-row="${esc(r.key)}">
          <p class="pg-q-sub pg-row-sub"><span class="label">${esc(d.label)}</span>${d.help ? `<span>${esc(d.help)}</span>` : ''}<span class="pg-kbd hide-m">Press ${k0 + 1} to ${k0 + d.options.length}</span></p>
          <div class="pg-tiles" data-cols="${r.cols || 2}" data-k0="${k0}" style="--k0:${k0}">${decorate(RN.w.control(r.key, T.ans[r.key] || '', { name: r.key, id: 'pg-t-' + r.key, change: 'pg-talk-pick' }), r.key)}</div>
        </div>`;
      }).join('');
    } else {
      const d = RN.fields[s.key];
      body = `<p class="pg-q-sub">${s.hint ? `<span>${esc(s.hint)}</span>` : `<span class="label">${esc(d.label)}</span>${d.help ? `<span>${esc(d.help)}</span>` : ''}`}<span class="pg-kbd hide-m">Press 1 to ${d.options.length}</span></p>
        <div class="pg-tiles${s.key === 'need' ? ' has-ic' : ''}" data-cols="${s.cols || 2}">${decorate(RN.w.control(s.key, T.ans[s.key] || '', { name: s.key, id: 'pg-t-' + s.key, change: 'pg-talk-pick' }), s.key)}</div>
`;
    }
    // Answers so far ride above the question, each one a button back to its step
    const crumbs = chips.length && s.key !== 'contact' ? `<div class="pg-recap pg-crumbs" aria-label="Your answers so far">${chips.join('')}</div>` : '';
    return `<section class="pg-talk night" data-step="${esc(s.key)}">
      <div class="pg-talk-in">
        <div class="pg-talk-top">
          ${T.step > 0 ? `<button type="button" class="pg-back" data-act="pg-talk-back">${icon('arrow-left')}Back</button>` : `<a class="pg-back" href="#home">${icon('x')}Close</a>`}
          <span class="step-count">Question ${T.step + 1} of ${st.length}</span>
        </div>
        ${progress(T.step, st.length)}
        ${liveBadge()}
        ${note}${T.step === 0 ? searched : ''}
        ${crumbs}
        <h1 class="h2 pg-q" tabindex="-1">${esc(s.q)}</h1>
        ${body}
        <div class="pg-talk-alt">
          ${RN.ui.teamAva('ava-md')}
          <p><b>Rather talk now?</b><span>Someone on our team who has sat in your seat. Weekdays, 9am to 6pm Eastern.</span></p>
          <div class="pg-talk-alt-a"><button type="button" class="btn btn-leaf btn-sm" data-act="pg-book">${icon('calendar')}Book a call</button><a class="pg-talk-tel" href="tel:+12032000482">${icon('message')}${PHONE}</a></div>
        </div>
      </div>
    </section>`;
  }

  function talkDone() {
    const first = RN.fmt.first(T.name) || 'thanks';
    const ops = (T.sugg || []).map((id) => RN.model.byId(id)).filter(Boolean);
    const b = brief();
    const cats = needCats(b.need);
    const unsure = !cats.length;
    const lines = recap({ text: true }).concat(T.note ? [`Looking for: ${T.note}`] : T.search ? [`Search: ${T.search.label}`] : []);
    return `<section class="pg-talk pg-talk-done night">
      <div class="pg-talk-in">
        <div class="pg-talk-top"><button type="button" class="pg-back" data-act="pg-talk-reset">${icon('refresh')}Start a new request</button><span class="step-count">Sent</span></div>
        ${progress(steps().length - 1, steps().length, true)}
        <h1 class="h2 pg-q" tabindex="-1">Got it, ${esc(first)}. A person is on it.</h1>
        <p class="lede pg-done-lede">You will hear from us at ${esc(T.email)} within one business day. Want to move faster? Book a call now, or request an intro to one of the operators below.</p>
        <div class="pg-done-grid">
          <div class="pg-done-card">
            <span class="label">${icon('calendar')}Book a call</span>
            ${T.booked ? `<p><b>${esc(T.booked.label)}</b></p><p class="small">30 minutes. The invite is on its way to ${esc(T.booked.email || T.email)}.</p><button type="button" class="act" data-act="pg-book">Change the time</button>`
              : `<p class="small">30 minutes with someone on our team who has sat in your seat.</p><button type="button" class="btn btn-leaf" data-act="pg-book">Pick a time${icon('arrow')}</button>`}
          </div>
          <div class="pg-done-card">
            <span class="label">${icon('message')}Call us</span>
            <p class="small">Weekdays, 9am to 6pm Eastern.</p>
            ${PG.phone({ dark: true })}
          </div>
          <div class="pg-done-card">
            <span class="label">${icon('doc')}Your request</span>
            <ul class="pg-done-list">${lines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
    </section>
    <section class="section-sm pg-sugg-sec">
      <div class="wrap">
        <div class="pg-shead"><div class="pg-shead-l"><span class="eyebrow">${unsure ? 'A few operators to look at while you wait' : 'Operators we would start with'}</span>
          <h2 class="h3 pg-sugg-h">${unsure ? 'Ranked on your company size and start date.' : `Matched on ${esc(RN.w.label('need', b.need).toLowerCase())}, your company size and start date.`}</h2></div>
          <div class="pg-shead-r"><button type="button" class="act" data-act="pg-talk-browse">${(T.matches || 0) === 1 ? 'See the matching operator in Browse' : `See all ${RN.fmt.plural(T.matches || 0, 'matching operator')} in Browse`}${icon('arrow')}</button></div></div>
        ${ops.length ? `<p class="pg-sugg-note">${icon('check-circle')}<span>Request intro opens with your answers filled in: ${esc(introSummary())}. Check it and send.</span></p>
        <div class="grid g-3 pg-sugg">${ops.map((op, i) => {
          const fit = RN.model.fit(op, b);
          const order = ['expertise', 'revenue', 'employees'];
          const sig = order.map((k) => fit.signals.find((x) => x.k === k && x.state === 'match')).find(Boolean) || fit.signals.find((x) => x.state !== 'low') || fit.signals[0];
          return RN.ui.opCard(op, { why: `${fit.label}${sig ? ': ' + sig.text : ''}`, cta: 'invite', ctaAct: 'pg-intro', ctaLabel: i === 0 ? `Request intro to ${op.first}` : 'Request intro' });
        }).join('')}</div>` : RN.ui.empty({ icon: 'users', title: 'No close match on the network yet', body: 'A person on our team will look for you, including operators who are not listed yet.', cta: `<button type="button" class="btn" data-act="pg-book">${icon('calendar')}Book a call</button>` })}
      </div>
    </section>`;
  }

  function talkMount(root) {
    document.removeEventListener('keydown', onTalkKey);
    document.addEventListener('keydown', onTalkKey);
    // The match count carries over between questions: count from the last number shown to this step's
    const nb = root.querySelector('.pg-live b.num');
    if (nb) {
      const to = +nb.dataset.n || 0;
      if (lastLive != null && lastLive !== to) { nb.dataset.n = String(lastLive); nb.textContent = RN.fmt.int(lastLive); updateLive(); }
      lastLive = to;
    }
    const f = T.focus && root.querySelector('#' + T.focus);
    if (f) { f.focus(); T.focus = ''; save(); return; }
    const q = root.querySelector('.pg-q');
    if (q && T.moved) { q.focus({ preventScroll: true }); T.moved = false; }
  }
  function talkUnmount() {
    document.removeEventListener('keydown', onTalkKey);
    clearTimeout(keyT); keyBuf = ''; lastLive = null;
    clearTimeout(advTimer);
    cancelAnimationFrame(liveRaf);
  }
  // Number keys pick a tile. Several rows share one numbering (1 to 6, then 7 to 12), so a 1 waits a moment for a
  // second digit when a tile 10 or above exists.
  let keyBuf = '', keyT = 0;
  function pickNum(n) {
    const chips = RN.$$('.pg-talk .pg-tiles .chip');
    const chip = chips[n - 1];
    if (chip) { chip.focus(); chip.click(); }
  }
  function onTalkKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
    const tag = ((e.target && e.target.tagName) || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.querySelector('.scrim, .menu-sheet')) return;
    const total = RN.$$('.pg-talk .pg-tiles .chip').length;
    if (!total) return;
    e.preventDefault();
    clearTimeout(keyT);
    if (keyBuf) { const n = +(keyBuf + e.key); keyBuf = ''; pickNum(n <= total ? n : +e.key); return; }
    if (e.key === '0') return;
    if (e.key === '1' && total >= 10) { keyBuf = '1'; keyT = setTimeout(() => { keyBuf = ''; pickNum(1); }, 650); return; }
    pickNum(+e.key);
  }
  const onTalk = () => ['talk', 'talk-need'].includes(curView());

  RN.inputs['pg-talk-pick'] = (el) => {
    if (!el.value) return;
    T.ans[el.name] = el.value;
    T.err = '';
    save();
    updateLive();
    clearTimeout(advTimer);
    const st0 = steps();
    const cur = st0.find((x) => stepKeys(x).includes(el.name));
    // The size step moves on only when both rows are answered
    if (cur && cur.rows && !stepKeys(cur).every((k) => T.ans[k])) return;
    advTimer = setTimeout(() => {
      if (!onTalk()) return;
      const st = steps();
      const i = st.findIndex((x) => stepKeys(x).includes(el.name));
      T.step = Math.min(st.length - 1, (i >= 0 ? i : T.step) + 1);
      T.moved = true;
      if (st[T.step].key === 'contact') T.focus = T.name ? (T.email ? '' : 'pg-email') : 'pg-name';
      save();
      RN.render();
    }, 420);
  };
  RN.actions['pg-talk-back'] = () => { clearTimeout(advTimer); T.step = Math.max(0, T.step - 1); T.moved = true; save(); RN.render(); };
  RN.actions['pg-talk-jump'] = (el) => { clearTimeout(advTimer); T.step = +el.dataset.i || 0; T.moved = true; save(); RN.render(); };
  RN.actions['pg-talk-reset'] = () => { T = Object.assign(fresh(), { usedSearch: T.usedSearch }); save(); if (curView() === 'talk') RN.render(); else RN.go('talk'); };
  RN.actions['pg-talk-browse'] = () => { const s = suggest(); goBrowse({ filters: s.filters }); };

  RN.submits['pg-talk-send'] = (form, data) => {
    T.name = String(data.name || '').trim();
    T.email = String(data.email || '').trim();
    T.company = String(data.company || '').trim();
    T.title = String(data.title || '').trim();
    T.note = String(data.note || '').trim();
    if (!T.name || !EMAIL_RE.test(T.email)) {
      T.err = 'Add your name and a valid work email so we can reply.';
      T.focus = !T.name ? 'pg-name' : 'pg-email';
      save(); RN.rerender(); return;
    }
    T.err = '';
    const s = suggest();
    const needLabel = needL(T.ans.need);
    T.sugg = s.top.map((r) => r.op.id);
    T.matches = s.matches;
    T.done = true;
    T.moved = true;
    T.sentAt = RN.now().toISOString();
    save();
    // Demand intelligence (Admin) and "Why you appeared" (Studio): same event shapes Browse logs
    RN.track('search', { q: needLabel, results: s.matches, source: 'talk', filters: s.filters, meta: { startBy: T.ans.startBy, need: T.ans.need, searched: T.search ? T.search.q : undefined } });
    s.top.forEach((r, i) => RN.track('impression', { opId: r.op.id, q: needLabel, filters: s.filters, position: i + 1, source: 'talk' }));
    RN.track('contact_submit', { kind: 'talk', need: T.ans.need, source: 'talk' });
    const lines = recap({ text: true }).concat(T.search ? [`Searched in Browse: ${T.search.label}`] : [], T.note && !(T.search && T.note === T.search.label) ? [`What they are looking for: ${T.note}`] : []);
    const names = s.top.map((r) => r.op.name);
    // Company and title are optional; the team researches whatever is blank before the call
    const who = `${[T.name, T.title].filter(Boolean).join(', ')} <${T.email}>${T.company ? ', ' + T.company : ''}`;
    const blank = [!T.company && 'company name', !T.title && 'title'].filter(Boolean);
    const todo = blank.length ? `\nTo research before the call: ${blank.join(' and ')}.` : '';
    RN.mail(TEAM, `Talk to us: ${needLabel}`, `${who}${todo}\n${lines.join('\n')}\n\n${RN.fmt.plural(s.matches, 'operator')} on the network match these answers.${names.length ? '\nSuggested first: ' + names.join(', ') + '.' : ''}\nReply within one business day.`, 'lead');
    RN.mail(T.email, `We got your request, ${RN.fmt.first(T.name)}`, `A person on our team will reply within one business day.\n\n${names.length ? 'While you wait, these are the operators we would start with: ' + names.join(', ') + '.\n' : ''}Rather talk now? Call ${PHONE} or book a call from the confirmation page.`, 'talk');
    RN.render();
    RN.ui.toast(`Sent. A person replies to ${esc(T.email)} within one business day.`, { icon: 'send' });
  };

  /* Request intro from a suggestion: open the shared intro sheet with the Talk answers prefilled.
     A visitor who sends it becomes their own client (RN.intro handles that). */
  RN.actions['pg-intro'] = (el) => {
    const op = RN.model.byId(el.dataset.id);
    if (!op) return;
    if (!RN.intro || typeof RN.intro.open !== 'function') { RN.go('op.' + op.slug); return; }
    RN.intro.open(op.id, introPrefill());
  };
  /* Talk answers as intro-sheet prefill. Same for all three suggestions; the sheet fills its own defaults for
     engagementType and hoursPerMonth (the flow does not ask them). */
  function introSummary() {
    const parts = [];
    if (T.ans.need) parts.push(needL(T.ans.need));
    const size = [T.ans.companyRevenue && RN.w.label('companyRevenue', T.ans.companyRevenue) + ' revenue', T.ans.companyEmployees && RN.w.label('companyEmployees', T.ans.companyEmployees) + ' employees'].filter(Boolean);
    if (size.length) parts.push(size.join(', '));
    if (T.ans.startBy) parts.push('start ' + RN.w.label('startBy', T.ans.startBy).toLowerCase());
    return parts.join('; ');
  }
  function introPrefill() {
    const sum = introSummary();
    const extra = T.note || (T.search ? 'Searched for: ' + T.search.label : '');
    const note = [sum ? `From Talk to us: ${sum}.` : '', extra].filter(Boolean).join(' ').slice(0, 500);
    const pre = {
      source: 'talk', need: T.ans.need, startBy: T.ans.startBy, note,
      name: T.name, email: T.email, company: T.company, title: T.title, industry: T.industry,
      revenueRange: T.ans.companyRevenue, employeeRange: T.ans.companyEmployees,
    };
    Object.keys(pre).forEach((k) => { if (pre[k] == null || pre[k] === '') delete pre[k]; });
    return pre;
  }

  /* ---------- Book a call: 6 upcoming weekday slots from the simulated clock ---------- */
  function slots(n) {
    const out = [];
    const now = RN.now();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const times = [[10, 0], [14, 30]];
    let guard = 0;
    while (out.length < n && guard++ < 30) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      times.forEach(([hh, mm]) => { if (out.length < n) out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm)); });
    }
    return out;
  }
  const timeLabel = (t) => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const slotLabel = (t) => `${t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${timeLabel(t)} ET`;
  function knownContact() {
    if (T.done && T.email) return { name: T.name, email: T.email, company: T.company, title: T.title };
    if (persona() === 'buyer') { const b = RN.personas.buyer; return { name: b.name, email: b.email, company: b.company.name, title: b.title }; }
    return null;
  }
  /* o.intro: an intro request this call is for (company workspace). The call is the fit call with our team that comes
     before the introduction; the booked time is stored on the intro (intro.rnCall) so its card shows it. */
  PG.book = function (o) {
    o = o || {};
    PG._bookFor = o.intro || null;
    const k = knownContact();
    const days = [];
    slots(6).forEach((t) => { const key = t.toDateString(); let g = days.find((x) => x.key === key); if (!g) { g = { key, list: [] }; days.push(g); } g.list.push(t); });
    RN.ui.modal({
      width: 560,
      title: o.intro ? 'Book your call with Revenue Nomad' : 'Book a 30-minute call',
      sub: o.intro ? `${esc(o.opFirst || 'The operator')} is interested. On a 30-minute call our team confirms the scope and fit with you, then introduces you both by email.` : 'With someone on our team who has sat in your seat. Pick a time and we send the invite.',
      body: `<div class="stack pg-book" style="--gap:20px">
        ${k ? `<p class="note info">${icon('user')}<span>Booking as <b>${esc(k.name)}</b>, ${esc(k.email)}</span></p>`
          : `<div class="grid g-2" style="--gap:14px">${RN.w.field('fullName', '', { name: 'bk-name', id: 'pg-bk-name', label: 'Your name', compact: true })}${RN.w.field('email', '', { name: 'bk-email', id: 'pg-bk-email', compact: true })}</div>`}
        <div class="stack" style="--gap:16px">${days.map((g) => `<div class="pg-slot-day"><span class="label">${esc(g.list[0].toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
          <div class="pg-slots">${g.list.map((t) => `<button type="button" class="pg-slot" data-act="pg-slot" data-ts="${esc(t.toISOString())}">${icon('clock')}${esc(timeLabel(t))} ET</button>`).join('')}</div></div>`).join('')}</div>
        <div class="pg-book-alt"><span class="small muted">Rather call now?</span>${PG.phone()}</div>
      </div>`,
    });
  };
  RN.actions['pg-book'] = (el) => {
    const id = el && el.dataset && el.dataset.intro;
    const i = id && (RN.store.state.intros || []).find((x) => x.id === id);
    const op = i && RN.model.byId(i.opId);
    PG.book(i ? { intro: id, opFirst: op ? op.first : '' } : {});
  };
  RN.actions['pg-slot'] = (el) => {
    const m = el.closest('.modal') || document;
    let k = knownContact();
    if (!k) {
      const n = m.querySelector('#pg-bk-name'), e = m.querySelector('#pg-bk-email');
      const name = n ? n.value.trim() : '', email = e ? e.value.trim() : '';
      if (!name || !EMAIL_RE.test(email)) {
        RN.ui.toast('Add your name and a valid work email, then pick a time.', { icon: 'info' });
        const bad = !name ? n : e;
        if (bad) bad.focus();
        return;
      }
      k = { name, email, company: '' };
    }
    const t = new Date(el.dataset.ts);
    const label = slotLabel(t);
    T.booked = { ts: el.dataset.ts, label, name: k.name, email: k.email };
    if (!T.name) T.name = k.name;
    if (!T.email) T.email = k.email;
    save();
    // The page in plain words for the team (its title), and one event source for both Talk to us routes
    const cur = RN.currentRoute && RN.currentRoute();
    const vname = curView();
    const onTalkPage = vname === 'talk' || vname === 'talk-need';
    const page = onTalkPage ? 'Talk to us' : cur && cur.view && typeof cur.view.title === 'function' ? cur.view.title(cur.params || {}) : 'site';
    const from = onTalkPage ? 'talk' : vname || 'site';
    RN.mail(TEAM, `Call booked: ${label}`, `${[k.name, k.title].filter(Boolean).join(', ')} <${k.email}>${k.company ? ', ' + k.company : ''} booked a 30-minute call from the ${page} page.${T.done ? '\n\nTalk to us answers:\n' + recap({ text: true }).join('\n') : ''}`, 'call');
    RN.mail(k.email, `Your call with Revenue Nomad: ${label}`, `Thanks, ${RN.fmt.first(k.name)}. You are booked for ${label}, 30 minutes. A calendar invite with the video link is on its way.\n\nNeed another time? Reply to this email or call ${PHONE}.`, 'call');
    RN.track('contact_submit', { kind: 'call', source: from });
    RN.ui.closeModal();
    RN.ui.toast(`Call booked for ${esc(label)}`, { icon: 'calendar' });
    const forIntro = PG._bookFor; PG._bookFor = null;
    if (forIntro) {
      RN.store.update((s) => { const i = (s.intros || []).find((x) => x.id === forIntro); if (i) { i.rnCall = { ts: el.dataset.ts, label }; (i.thread = i.thread || []).push({ from: 'Revenue Nomad', text: `Fit call booked for ${label}`, ts: RN.now().toISOString() }); } }, 'intros');
      RN.rerender();
      return;
    }
    if (onTalk()) RN.rerender();
  };

  /* =====================================================================
     FOR OPERATORS
     ===================================================================== */
  function studioPreview() {
    const sample = RN.model.matt;
    const a = RN.model.analytics(sample.id, { days: 30 });
    const pos = RN.model.positioning(sample.id);
    const T0 = a.totals, P = a.prev;
    const stat = (v, l, prev, extra) => `<div class="pg-sp-stat"><span class="pg-sp-l">${esc(l)}</span><b class="num">${RN.fmt.int(v)}</b>${prev ? RN.ui.delta(v, prev) : ''}${extra || ''}</div>`;
    const lo = pos.idx.p25 - (pos.idx.p75 - pos.idx.p25) * 0.6, hi = pos.idx.p75 + (pos.idx.p75 - pos.idx.p25) * 0.6;
    const at = (v) => RN.clamp(((v - lo) / (hi - lo)) * 100, 0, 100).toFixed(1);
    const viewers = a.viewers.slice(0, 3);
    return `<div class="pg-sp" aria-label="Studio preview for a sample operator">
      <div class="pg-sp-hd">
        <span class="row-nw" style="--gap:10px">${RN.ui.teamAva('ava-sm')}<span><b>Studio</b><span class="pg-sp-sub">Sample operator · last 30 days</span></span></span>
        ${illus('Illustrative analytics')}
      </div>
      <div class="pg-sp-stats">
        ${stat(T0.impressions, 'Search impressions', P.impressions)}
        ${stat(T0.views, 'Profile views', P.views, `<span class="pg-sp-spark">${RN.chart.spark(a.series.views, { w: 96, h: 28, label: 'Profile views, last 30 days' })}</span>`)}
        ${stat(T0.shortlists, 'Shortlists', P.shortlists)}
        ${stat(T0.intros, 'Intro requests')}
      </div>
      <div class="pg-sp-grid">
        <div class="pg-sp-box"><span class="label">Why companies found you</span>
          <ol class="pg-sp-list">${a.queries.slice(0, 3).map((q) => `<li><span class="grow">“${esc(q.q)}”</span><span class="meter"><i style="width:${Math.round(q.share * 100 / Math.max(0.01, a.queries[0].share))}%"></i></span><b class="num">${RN.fmt.int(q.n)}</b></li>`).join('')}</ol></div>
        <div class="pg-sp-box"><span class="label">Who viewed you</span>
          <ol class="pg-sp-list">${viewers.map((v) => `<li><span class="grow">${esc(RN.w.label('industries', v.industry))} · ${esc(RN.w.label('revenueRange', v.revenueRange))} · ${esc(RN.w.label('employeeRange', v.employeeRange))} employees</span><b class="num">${RN.fmt.int(v.views + v.shortlists + v.compares)}</b></li>`).join('')}</ol>
          <p class="pg-sp-note">Company type only. Never names.</p></div>
      </div>
      <div class="pg-sp-box pg-sp-rate"><span class="label">Your rate vs the Rate Index, ${esc(RN.fields.catLabel(sample.catKey))}</span>
        <div class="pg-rate">
          <div class="pg-rate-track"><i class="pg-rate-iqr" style="left:${at(pos.idx.p25)}%;right:${(100 - at(pos.idx.p75)).toFixed(1)}%"></i><i class="pg-rate-med" style="left:${at(pos.idx.p50)}%"></i><i class="pg-rate-you" style="left:${at(pos.rate)}%"><span>You $${esc(pos.rate)}</span></i></div>
          <div class="pg-rate-ticks"><span style="left:${at(pos.idx.p25)}%">p25 $${esc(pos.idx.p25)}</span><span style="left:${at(pos.idx.p50)}%">Median $${esc(pos.idx.p50)}</span><span style="left:${at(pos.idx.p75)}%">p75 $${esc(pos.idx.p75)}</span></div>
        </div>
      </div>
    </div>`;
  }

  function operatorsView() {
    const ops = RN.model.ops;
    const total = ops.length || 1;
    // Same rule as Home's Top operators carousel (home.js featured()): a live profile at Trusted (70) and above
    const featurable = ops.filter((o) => !o.hidden && o.ris && o.ris.score >= 70).length;
    const R = market().report;
    const supply = {};
    ops.forEach((o) => { supply[o.catKey] = (supply[o.catKey] || 0) + 1; });
    const intent = {};
    R.intent.forEach((x) => { intent[x.cat] = x.v; });
    const top = RN.fields.roleCategory.options.slice().sort((a, b) => (supply[b.v] || 0) - (supply[a.v] || 0))[0];
    const topShare = Math.round(((supply[top.v] || 0) / total) * 100);
    const maxShare = Math.max(...RN.fields.roleCategory.options.map((o) => Math.max((supply[o.v] || 0) / total * 100, intent[o.v] || 0)), 1);
    const values = [
      { i: 'eye', t: 'Who viewed you and why', d: 'The type of company behind every profile view (industry, revenue range, employee range), plus the searches and filters that surfaced you. Never names, so companies keep browsing freely.', to: studioRoute(/visib/i) },
      { i: 'sliders', t: 'Positioning vs the Rate Index', d: 'Your rate against the p25, median and p75 for your role category, and the focus areas companies search for that few operators have verified.', to: studioRoute(/posit/i) },
      { i: 'globe', t: 'Search and AI visibility', d: `An indexable profile page with structured data, the Google queries that found it, and whether ${market().aiEngines.join(', ').replace(/, ([^,]*)$/, ' and $1')} mention you.`, to: studioRoute(/search|ai/i) },
      { i: 'shield', t: 'Credibility for direct deals', d: 'Private proof links that show a prospect your reviews, CORE ratings and engagement history, and tell you which sections they read. A verified badge for your site and proposals.', to: studioRoute(/cred/i) },
      { i: 'radar', t: 'Predictive prospects and fractional roles', d: 'Fractional job posts that match your tags, and companies showing signs they need you now: a raise, a sales leader leaving, a hiring spree.', to: studioRoute(/opport|prospect|job/i) },
    ];
    const samples = [
      { q: 'The Studio showed three healthcare companies had looked at my profile in one week. I asked a past company to verify two tags, and the next month I made two shortlists.', by: 'Fractional VP of Sales' },
      { q: 'I send a proof link with every proposal now. Seeing that the prospect read my reviews twice and forwarded the link changed how I ran the follow-up call.', by: 'Fractional RevOps leader' },
      { q: 'No intros in my first month, and I still opened Studio every Monday. The rate position alone was worth it: I was pricing well under the median for my category.', by: 'Fractional CMO' },
    ];
    const faq = [
      ['Does it cost anything to join?', 'No. Joining, your profile, Studio and every tool on this page are free. Our only charge is a share of what you bill companies you meet here (next question). Rank, labels and badges will never be for sale.'],
      ['How does Revenue Nomad charge operators?', `Revenue Nomad charges a percentage of your billed earnings each month (proposed: ${FEE_PCT}%) on engagements with companies you meet here. Companies pay your listed rate and no fees, so the rate on your profile is the price they see. At a $200 hourly rate, you take home ${RN.fmt.usd(200 * (1 - FEE_PCT / 100))}/hr. Proposed: no fee on deals you bring yourself, including deals you win with a proof link. We are confirming both, and we will say so plainly before anything changes.`],
      ['How long does approval take?', 'We review applications within 2 business days. Approved profiles go live at Emerging, a Reputation Index of 50, and Studio opens the same day.'],
      ['I have no reviews yet. Will companies find me?', 'Yes. Search ranks on fit first: role, focus areas, company size and industry. A complete profile ranks higher, and Studio shows which searches you appear in so you can close the gaps.'],
      ['Can I see which companies viewed me?', 'You see the type of company: industry, revenue range and employee range. Never the name. Companies browse more when they know that, which means more views for you.'],
      ['Who sees my rate?', 'Signed-in companies see it on your card and profile, and it is the price they pay: nothing is added on top. It also feeds the Rate Index, anonymized, so every operator can price with real data.'],
    ];
    return `
    ${hero({
      eyebrow: 'For fractional operators',
      h: `Get value from the network <span class="serif">even in months with no intro.</span>`,
      lede: 'There are more fractional leaders than open seats, and we will not pretend otherwise. So your profile works for you every week: it shows who looked and why, where you stand on rate, and gives you proof you can take into your own deals.',
      actions: `<a class="btn btn-lg" href="#join.operator">Apply to join${icon('arrow')}</a>${studioSample('studio')}`,
      aside: `<div class="op-hero-sp">${studioPreview()}<p class="op-sp-cap">${icon('chart')}<span>A sample operator’s Studio. The profile, rate and reviews are live; views and searches are illustrative.</span></p></div>`,
    })}

    <section class="section pg-honest-sec">
      <div class="wrap pg-honest">
        <div class="pg-honest-l">
          <span class="eyebrow">The honest part</span>
          <h2 class="h2">Supply is crowded. Proof is how you stand out.</h2>
          <p class="pg-p">${topShare}% of the ${RN.fmt.int(ops.length)} profiles in this prototype lead ${esc(top.l)}, while about ${esc(intent[top.v] || 0)}% of company hiring intent sits there (illustrative survey data). Most operators will not get an intro in a given month. That is why intros are not the only thing we give you.</p>
          <p class="pg-p">Categories where company intent runs ahead of supply are where a verified record pays off fastest.</p>
          <a class="act" href="#library">See demand vs verified supply by focus area${icon('arrow')}</a>
        </div>
        <div class="card pg-honest-r">
          <div class="card-hd"><div><h3>Where operators are vs where companies are hiring</h3><p class="sub">Share by role category</p></div></div>
          <div class="legend"><span><i style="background:var(--viz-muted)"></i>Operators in this prototype ${livePill()}</span><span><i style="background:var(--viz-1)"></i>Company hiring intent ${illus()}</span></div>
          <div class="pg-sd">${RN.fields.roleCategory.options.map((o) => {
            const s = Math.round(((supply[o.v] || 0) / total) * 100);
            const d = intent[o.v];
            return `<div class="pg-sd-row"><span class="pg-sd-l">${RN.ui.catDot(o.v)}${esc(o.l)}</span>
              <div class="pg-sd-bars"><div class="pg-sd-bar is-s"><i style="width:${(s / maxShare * 100).toFixed(1)}%"></i><b>${s}%</b></div><div class="pg-sd-bar is-d">${d == null ? '<b class="pg-sd-na">Not in the survey</b>' : `<i style="width:${(d / maxShare * 100).toFixed(1)}%"></i><b>${d}%</b>`}</div></div></div>`;
          }).join('')}</div>
        </div>
      </div>
    </section>

    <section class="section pg-value-sec">
      <div class="wrap">
        ${shead('What you get even when no intro happens', 'Five things your profile does every week.', 'All of it lives in your Studio from the day you are approved.')}
        <div class="pg-values">${values.map((v, i) => `<article class="pg-value${i === 0 ? ' is-wide' : ''}">
            ${RN.ui.icoTile(v.i, { size: 'lg', night: i === 0, cls: 'pg-value-i' })}
            <h3 class="h4">${esc(v.t)}</h3>
            <p class="pg-p">${esc(v.d)}</p>
            ${asLink('operator', v.to, { mine: `Open in Studio${icon('arrow')}`, other: `See it in a sample Studio${icon('arrow')}` }, 'act')}
          </article>`).join('')}</div>
      </div>
    </section>

    <section class="section pg-ladder-sec">
      <div class="wrap">
        ${shead('Invest more, get more', 'One ladder. Every rung is earned.', 'Your label comes from your Reputation Index, and the Index moves on company evidence: reviews, verified fit tags and engagements. What each tier unlocks is on the Levels page.', `<a class="act" href="#levels">What each tier unlocks${icon('arrow')}</a>`)}
        ${badgeRow({ me: true })}
        <div class="pg-principles">
          <div>${RN.ui.icoTile('star', { tone: 'gold', cls: 'pg-pr-i' })}<h3 class="h5">How featuring works</h3><p class="small muted">Home features every operator at Trusted (Reputation Index 70+) and above, ranked by score, then a profile photo, video, company reviews and engagement history. The same rules apply to every operator, and placement is never paid.</p><p class="small pg-pr-n">${RN.fmt.plural(featurable, 'profile')} in this prototype qualify for a featured spot today.</p></div>
        </div>
      </div>
    </section>

    <section class="section pg-samples-sec" data-proto>
      <div class="wrap">
        ${shead('What operators tell us', 'The kind of week we are building for.', '', `<span class="pill pill-warn">${icon('info')}Sample quotes, not from real operators</span>`)}
        <div class="grid g-3">${samples.map((s) => `<figure class="card pg-sample">
            <span class="pill pill-warn pg-sample-tag">Sample</span>
            <blockquote>“${esc(s.q)}”</blockquote>
            <figcaption>${esc(s.by)}, sample quote</figcaption>
          </figure>`).join('')}</div>
      </div>
    </section>

    <section class="section-sm pg-faq-sec">
      <div class="wrap-narrow">
        <h2 class="h3">Questions operators ask</h2>
        <div class="pg-faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}${icon('chev-down')}</summary><p class="pg-p">${esc(a)}</p></details>`).join('')}</div>
        <div class="pg-actions pg-faq-cta"><a class="btn btn-lg" href="#join.operator">Apply to join${icon('arrow')}</a><span class="small muted">One intake with the same fields companies filter on.</span></div>
      </div>
    </section>`;
  }

  /* =====================================================================
     LEVELS: Reputation Index explainer for clients and operators
     ===================================================================== */
  /* Client wording for the factor list: clients see "focus areas", not fit tags. Prefers registry clientLabel/clientD. */
  const CLIENT_FACTOR = { verification: { l: 'Focus area verification', d: 'Share of focus areas a company confirmed in a review.' } };
  const factorLabel = (f) => f.clientLabel || (CLIENT_FACTOR[f.v] && CLIENT_FACTOR[f.v].l) || f.l;
  const factorDesc = (f) => f.clientD || (CLIENT_FACTOR[f.v] && CLIENT_FACTOR[f.v].d) || f.d;

  function levelsView() {
    const counts = tierCounts();
    const emerging = counts.emerging || 0;
    const total = RN.model.ops.length;
    const factors = RN.fields.risFactors.options;
    const maxW = Math.max(...factors.map((f) => f.w || 0), 0.01);
    const curve = [];
    for (let r = 0; r <= 10; r++) curve.push({ r, score: RN.model.tagScore(r), tier: RN.model.tagTier(r) });
    const tierName = (t) => ({ claimed: 'Self-claimed', verified: 'Verified', expert: 'Expert' }[t] || t);
    const tierPill = (t) => `<span class="pill ${t === 'expert' ? 'pill-gold' : t === 'verified' ? 'pill-good' : 'pill-line'}">${esc(tierName(t))}</span>`;
    const principles = [
      ['lock', 'No pay-to-win', 'Nothing you can buy moves a score, a label or a place in search. The inputs are company evidence and a complete profile.'],
      ['send', 'Reviews auto-publish', 'There is no moderation queue and no hand-picking. Every review counts the day it lands, good or bad.'],
      ['users', 'One label for companies and operators', 'The label comes from the score, and the score is the same on cards, profiles, compare and in Studio.'],
      ['seal', 'Team-checked is not company-verified','Emerging means our team checked identity and work history. Verified is kept for what a company confirmed: focus areas and engagements.'],
    ];
    // Only offer minimums that at least one profile in this prototype meets
    const risOpts = RN.fields.risMin.options.map((o) => ({ o, n: RN.model.ops.filter((op) => op.ris.score >= +o.v).length })).filter((x) => x.n > 0);
    return `
    ${hero({
      eyebrow: 'Levels and the Reputation Index',
      h: 'One score. <span class="serif">Earned, never bought.</span>',
      lede: 'The Reputation Index is a 0 to 100 score built from company evidence. Companies and operators see the same number and the same label, everywhere on Revenue Nomad.',
      actions: `<button type="button" class="btn btn-lg" data-act="pg-browse-sort" data-sort="ris">Browse by Reputation Index${icon('arrow')}</button>${studioSample(studioRoute(/cred/i), 'btn btn-line btn-lg', 'See your level in Studio')}`,
      aside: `<div class="lv-hero-vis"><span class="lv-vis-k">Reputation Index, 0 to 100</span>${badgeRow({ stairs: true, me: true })}</div>`,
    })}

    <section class="section pg-ladder-sec">
      <div class="wrap">
        ${shead('The ladder', 'Six tiers, one for every score.', `${RN.fmt.int(emerging)} of ${RN.fmt.int(total)} profiles in this prototype sit at Emerging today. What each tier unlocks is proposed and not final.`)}
        ${ladder({ desc: true, counts: true, me: true, rail: true })}
      </div>
    </section>

    <section class="section pg-factors-sec">
      <div class="wrap">
        ${shead('How score is calculated', 'Five signals, one number.', 'The Reputation Index blends five signals into one 0 to 100 score. Every approved profile starts at a floor of 50.')}
        <div class="pg-factors">
        <div class="card pg-factors-r">
          <div class="card-hd"><div><h3>Weight of each signal</h3><p class="sub">Share of the score above the floor of 50</p></div><span class="pill pill-warn">Proposed weights</span></div>
          <div class="pg-meters">${factors.map((f) => `<div class="pg-mrow"><span>${esc(factorLabel(f))}<small class="pg-mrow-d">${esc(factorDesc(f))}</small></span><div class="meter"><i style="width:${Math.round((f.w / maxW) * 100)}%"></i></div><b>${Math.round((f.w || 0) * 100)}%</b></div>`).join('')}</div>
          <p class="small muted pg-factors-note">Profile completeness is the only signal an operator controls alone. Everything else needs a company.</p>
        </div>
        <div class="card lv-curve">
          <div class="card-hd"><div><h3>A claim becomes proof one review at a time</h3><p class="sub">Focus area score by confirming company reviews. Each column is one more review rated 4.0 or higher.</p></div></div>
          <p class="small">Operators claim up to 25 focus areas (in Studio they are called fit tags). A focus area turns Verified when a company review confirms it, and its score climbs with each confirming review. A focus area a company adds in a review joins the profile as Verified.</p>
          <div class="pg-curve-chart" data-lv-curve>${RN.chart.columns(curve.map((c) => ({ label: c.r === 10 ? '10+' : String(c.r), value: c.score, hi: c.r === 5 })), { w: 520, h: 220, fmt: (n) => String(n), label: 'Focus area score by number of confirming company reviews' })}</div>
          <div class="row pg-curve-ex">${RN.ui.ftag({ t: 'Sales Playbook', tier: 'verified' })}${RN.ui.ftag({ t: 'Board Revenue Reporting', tier: 'claimed' })}<span class="small muted">Solid with a check is verified by a company. Dashed is claimed by the operator.</span></div>
          <div class="lv-bands" aria-label="Tier by number of confirming reviews">${['claimed', 'verified', 'expert'].map((t) => { const rows = curve.filter((c) => c.tier === t); if (!rows.length) return ''; const a = rows[0].r, z = rows[rows.length - 1].r; const txt = z === 0 ? 'No company reviews' : z === 10 ? `${a} or more reviews` : a === z ? RN.fmt.plural(a, 'review') : `${a} to ${z} reviews`; return `<span class="lv-band is-${t}">${tierPill(t)}<small>${esc(txt)}</small></span>`; }).join('')}</div>
        </div>
        </div>
      </div>
    </section>

    <section class="section night pg-core">
      <div class="wrap">
        ${shead('CORE company reviews', 'Four questions, asked the same way every time.', 'Each company rates the operator from 1 to 5 on all four and can explain every score. The review also asks for the overall experience and whether they would hire the operator again.')}
        <div class="pg-core-grid">${RN.fields.coreDims.options.map((d) => `<article class="pg-core-item">
            <span class="pg-core-l" aria-hidden="true">${esc(d.v)}</span>
            <h3 class="h4">${esc(d.l)}</h3>
            <p class="pg-core-q"><span>The question</span>${esc(d.q)}</p>
          </article>`).join('')}</div>
        <h3 class="label lv-princ-h">Rules that keep the score worth trusting</h3>
        <div class="pg-princ">${principles.map(([i, t, d], k) => `<div class="pg-princ-item"><span class="lv-princ-n">${String(k + 1).padStart(2, '0')}</span>${RN.ui.icoTile(i, { cls: 'pg-pr-i' })}<div><h3 class="h5">${esc(t)}</h3><p>${esc(d)}</p></div></div>`).join('')}</div>
      </div>
    </section>

    <section class="lv-uses">
      <div class="lv-use is-c">
        <span class="eyebrow">For companies</span>
        <h3 class="h2">Start with confirmed records.</h3>
        <p>Sort Browse by Reputation Index, or set a minimum.<span data-proto> Counts are profiles in this prototype.</span></p>
        <div class="row pg-uses-chips"><button type="button" class="btn btn-leaf" data-act="pg-browse-sort" data-sort="ris">Sort by Reputation Index${icon('arrow')}</button>${risOpts.map(({ o, n }) => `<button type="button" class="chip" data-act="pg-browse-ris" data-v="${esc(o.v)}">${icon('filter')}${esc(RN.fields.risMin.label)} ${esc(o.l)} · ${RN.fmt.plural(n, 'profile')}</button>`).join('')}</div>
      </div>
      <div class="lv-use is-o">
        <span class="eyebrow">For operators</span>
        <h3 class="h2">Raise your score with company evidence.</h3>
        <p>Request CORE reviews from past companies and see the points available for each signal in Studio.</p>
        <div class="row pg-uses-chips">${studioSample(studioRoute(/cred/i), 'btn btn-leaf', 'Open Credibility')}<a class="btn btn-line" href="#join.operator">Apply to join</a></div>
      </div>
    </section>`;
  }
  RN.actions['pg-browse-ris'] = (el) => goBrowse({ filters: { risMin: el.dataset.v } });
  RN.actions['pg-browse-sort'] = (el) => goBrowse({ sort: el.dataset.sort || 'ris' });

  /* =====================================================================
     404
     ===================================================================== */
  function notFoundView(params) {
    const path = params && params.path && params.path !== 'notfound' ? params.path : '';
    const words = path.replace(/[._\-/]+/g, ' ').replace(/\b(op|browse|guide|blueprint|project|engagement|engagements|proof|studio)\b/gi, '').trim();
    const guesses = words.length > 2 ? RN.model.search({ q: words }).slice(0, 3).map((r) => r.op) : [];
    const places = [
      ['search', 'Browse talent', 'Open profiles, no login', 'browse'],
      ['briefcase', 'Post an engagement', 'Start from a Blueprint', 'engagements'],
      ['chart', 'Insights', 'Research, rates and guides', 'insights'],
      ['users', 'For operators', 'Why join, and Studio', 'operators'],
      ['message', 'Talk to us', 'A person replies within one business day', 'talk'],
    ];
    // One real face among the links: the top-ranked live operator with a photo, same rule for every operator
    const face = RN.model.ops.filter((o) => !o.hidden && o.photo && !o.isMatt).sort((a, b) => b.ris.score - a.ris.score || b.reviews.length - a.reviews.length)[0];
    return `<section class="section pg-404">
      <div class="wrap-narrow">
        <span class="pg-404-code num" aria-hidden="true">404</span>
        <span class="eyebrow">Page not found</span>
        <h1 class="h1 pg-404-h">We could not find <span class="serif">that page.</span></h1>
        <p class="lede">${path ? `Nothing lives at <span class="mono">#${esc(path)}</span>. The link may be old, or the page moved.` : 'The link may be old, or the page moved.'} Search the network or pick a place to start.</p>
        <form class="pg-404-search" data-submit="pg-404-search" role="search">
          <div class="input-wrap grow">${icon('search')}<input class="input" type="search" name="q" value="${esc(words)}" placeholder="Search a role, focus area or industry" aria-label="Search operators"></div>
          <button class="btn" type="submit">Search</button>
        </form>
        ${guesses.length ? `<div class="pg-404-guess"><span class="label">Did you mean</span>${guesses.map((op) => `<a class="pg-rev-op" href="#op.${esc(op.slug)}">${RN.ui.avatar(op, 'ava-sm')}<span class="pg-rev-op-t"><b>${esc(op.name)}</b><span>Fractional ${esc(op.role)}</span></span>${icon('arrow')}</a>`).join('')}</div>` : ''}
        <div class="pg-404-grid">${places.map(([i, t, d, to]) => `<a class="card card-link pg-404-card" href="#${to}">${RN.ui.icoTile(i, { cls: 'pg-value-i' })}<span><b>${esc(t)}</b><span>${esc(d)}</span></span>${icon('arrow')}</a>`).join('')}
          ${face ? `<a class="card card-link pg-404-card pg-404-op" href="#op.${esc(face.slug)}">${RN.ui.avatar(face, 'ava-md')}<span><span class="pg-404-k">Maybe you were looking for</span><b>${esc(face.name)}</b><span>Fractional ${esc(face.role)} · ${esc(RN.fmt.plural(face.reviews.length, 'company review'))}</span></span>${icon('arrow')}</a>` : `<a class="card card-link pg-404-card" href="#home"><span class="pg-value-i">${icon('home')}</span><span><b>Home</b><span>Start over</span></span>${icon('arrow')}</a>`}</div>
        <div class="pg-404-cats"><span class="label">Browse by role</span><div class="row" style="--gap:8px">${RN.fields.roleCategory.options.map((o) => `<a class="chip chip-sm" href="#browse.${esc(o.v)}">${RN.ui.catDot(o.v)}${esc(o.l)}</a>`).join('')}</div></div>
      </div>
    </section>`;
  }
  RN.submits['pg-404-search'] = (form, data) => goBrowse({ q: String(data.q || '').trim() });

  /* =====================================================================
     Register views
     ===================================================================== */
  /* Shared with the function homes and the cost hub (js/views/function.js): the same page head, section head and FAQ
     list, so every company page is built from one set of pieces. */
  PG.hero = hero; PG.shead = shead;
  PG.faq = (items, o) => `<div class="pg-faq">${items.map(([q, a], i) => `<details${i === 0 && !(o && o.closed) ? ' open' : ''}><summary>${esc(q)}${icon('chev-down')}</summary><p class="pg-p">${esc(a)}</p></details>`).join('')}</div>`;
  RN.view('about', { route: 'about', nav: 'about', title: () => 'About', render: aboutView });
  RN.view('how', { route: 'how', nav: '', title: () => 'How it works', render: howView, mount: howMount, unmount: howUnmount });
  RN.view('results', { route: 'results', nav: '', title: () => 'Results', render: resultsView, mount: applyWall, unmount: () => { W.cat = 'all'; W.all = false; } });
  RN.view('talk', { route: 'talk', nav: '', chrome: 'over', footer: false, title: () => 'Talk to us', render: () => talkView(), mount: talkMount, unmount: talkUnmount });
  // Deep link that starts the flow with the need answered (#talk.pipeline): used by need tiles and zero-result states
  RN.view('talk-need', { route: 'talk.:need', nav: '', chrome: 'over', footer: false, samples: { need: 'pipeline' }, title: () => 'Talk to us', render: (p) => talkView(p), mount: talkMount, unmount: talkUnmount });
  RN.view('operators', { route: 'operators', nav: 'operators', title: () => 'For operators', render: operatorsView });
  RN.view('levels', { route: 'levels', nav: 'operators', title: () => 'Levels and the Reputation Index', render: levelsView });
  RN.view('notfound', { route: 'notfound', nav: '', title: () => 'Page not found', render: notFoundView });
})();
