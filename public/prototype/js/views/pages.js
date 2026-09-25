/* Company pages: About (#about), How it works (#how), Results (#results), Talk to us (#talk, #talk.<need>),
   For operators (#operators), Levels (#levels) and the 404 page (RN.views.notfound).
   Prefix: pg- for actions, inputs, submits and CSS classes. Shared helpers live on RN.pages:
     RN.pages.book()            open the "Book a call" slot picker (also data-act="pg-book")
     RN.pages.phone()           the phone number as selectable text with a copy button
     RN.pages.unlocks[tier]     what each Reputation Index tier unlocks, as one sentence (proposed; from RN.fields.risUnlocks)
   Type: page heads use .h1 on paper (.phead), sections .h2, one Newsreader italic accent per page (the H1).
   The Talk to us flow is a form, so it has no serif accent.
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

  /* ---------- Small helpers ---------- */
  const persona = () => RN.store.state.persona;
  const tiersDown = () => RN.fields.risTier.options.slice();
  const market = () => RN.data.market;
  const ym = (s) => {
    if (!s) return 'Present';
    const [y, m] = String(s).split('-');
    return new Date(+y, (+m || 1) - 1, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
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
  const studioAsMatt = (to, cls, mineLabel) => asLink('operator', to || 'studio', { mine: `${icon('chart')}${esc(mineLabel || 'Open Studio')}`, other: `${icon('chart')}See Studio as Matt` }, cls || 'btn btn-line btn-lg');

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
     (labelled proposed). o.desc adds what each tier means, o.counts the profiles at each tier in this prototype. */
  function ladder(o) {
    o = o || {};
    const counts = tierCounts();
    const me = RN.model.matt;
    const U = RN.fields.risUnlocks || {};
    const cols = ['Tier', o.desc ? 'What it means' : '', 'What it unlocks (proposed)', o.counts || o.me ? 'In this prototype' : ''].filter(Boolean);
    return `<div class="pg-ladder-wrap${o.desc ? ' has-d' : ''}${o.counts || o.me ? ' has-n' : ''}">
      <div class="pg-ladder-hd" aria-hidden="true">${cols.map((c) => `<span class="label">${esc(c)}</span>`).join('')}</div>
      <ol class="pg-ladder" aria-label="Reputation Index tiers, highest first">${tiersDown().map((t) => {
        const n = counts[t.v] || 0;
        const count = t.v === 'indexing' ? `${RN.fmt.int(n)} ${n === 1 ? 'application' : 'applications'} in review` : RN.fmt.plural(n, 'profile');
        const mine = o.me && me && me.ris.tier === t.v;
        return `<li class="pg-rung pg-rung-${esc(t.v)}">
          <div class="pg-rung-id">
            <span class="pg-seal">${RN.ui.hexSeal(t.l)}<b>${t.v === 'indexing' ? '&lt;50' : t.min}</b></span>
            <span><b class="pg-rung-name">${esc(t.l)}</b><span class="pg-rung-range">${t.v === 'indexing' ? 'Before approval' : `Score ${t.min} to ${t.max}`}</span></span>
          </div>
          ${o.desc ? `<p class="pg-rung-d">${esc(t.d)}</p>` : ''}
          <div class="pg-rung-u"><span class="label pg-rung-ul">Unlocks, proposed</span><ul>${(U[t.v] || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
          ${o.counts || o.me ? `<div class="pg-rung-meta">${o.counts ? `<span class="pg-rung-n">${esc(count)}</span>` : ''}${mine ? `<span class="pg-rung-me">${RN.ui.avatar(me, 'ava-xs')}Matt Lopez, ${esc(me.ris.score)}</span>` : ''}</div>` : ''}
        </li>`;
      }).join('')}</ol>
    </div>`;
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
    const matt = RN.model.matt;
    const R = market().report;
    const hind = R.hindsight;
    const fvf = R.fracVsFull;
    const first = R.summary.find((s) => /first/i.test(s.l)) || R.summary[4];
    const ops = RN.model.ops;
    const verified = ops.reduce((a, o) => a + o.tags.filter((t) => t.tier !== 'claimed').length, 0);
    const lib = RN.fields.fitTags.options.length;
    const cats = RN.fields.roleCategory.options.length;
    const trend = market().rateIndex.trend;
    const eng = (matt ? matt.engagements.slice() : []).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const yr = (e) => { const a = String(e.start).slice(0, 4), b = String(e.end || '').slice(0, 4); return !b || a === b ? a : `${a} to ${b}`; };

    return `
    ${hero({
      eyebrow: 'About Revenue Nomad',
      h: 'Built by operators who got tired of watching good companies <span class="serif">hire the wrong leader.</span>',
      lede: 'Revenue Nomad is the open network for fractional go-to-market leadership. Real operators, real track records, and a team behind it that still does this work for a living.',
      actions: `<a class="btn btn-lg" href="#browse">Browse operators${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#how">How it works</a>`,
    })}

    <section class="section pg-story">
      <div class="wrap pg-story-in">
        <div class="pg-story-l"><span class="eyebrow">Why we exist</span><h2 class="h2">The problem was always fit.</h2></div>
        <div class="pg-story-r">
          <p class="pg-lead">Our founder spent ten years building and fixing B2B sales organizations, first as an early team member and partner at Skaled Consulting, then as a fractional revenue leader himself. He kept seeing the same expensive mistake.</p>
          <p class="pg-p">A company would hire an impressive name and wait for the magic. Six months and a lot of cash later, nothing had changed. The leader was capable. They were wrong for that business.</p>
          <p class="pg-p">A great CRO from a $500M healthtech company will likely struggle at a $30M hospitality tech company. Deal size, sales cycle, stage and motion decide whether a fractional leader succeeds, and none of it shows up on a LinkedIn profile.</p>
          <blockquote class="pg-pull">Fractional leaders are specialists. Companies were being asked to choose them like generalists.</blockquote>
          <p class="pg-p">There was nowhere to judge fit. LinkedIn was not built for it. Freelance marketplaces skew tactical and junior. Word of mouth misses the nuance between one business and the next. So we built the place we wished had existed when we were the ones being hired.</p>
        </div>
      </div>
    </section>

    <section class="section pg-pov-sec">
      <div class="wrap">
        ${shead('Our point of view', 'Two beliefs behind every screen we build.')}
        <div class="grid g-2 pg-pov">
          <article class="pg-pov-card">
            <h3 class="h3">Fractional is a hiring strategy in its own right.</h3>
            <p class="pg-p">The best companies bring in a fractional leader on purpose: to build the process, hire the first team and hand over a machine that runs. It starts in weeks and costs a fraction of a full-time executive.</p>
            <div class="pg-pov-stats">
              <div><b class="num">${esc(fvf[0][1])}</b><span>a month for a ${esc(fvf[0][0].split(',')[0].replace(/^F/, 'f'))} at ${esc(RN.w.label('hoursPerMonth', '40'))}, vs ${esc(fvf[1][1])} for a full-time hire</span></div>
              <div><b class="num">${esc(first.v)}</b><span>of first-time clients hired a fractional leader as their first sales leadership hire</span></div>
            </div>
            <div class="row pg-pov-foot">${illus('Illustrative research')}<a class="act" href="#rates">Compare the cost${icon('arrow')}</a></div>
          </article>
          <article class="pg-pov-card">
            <h3 class="h3">Fit and proof beat fame.</h3>
            <p class="pg-p">Stage, deal size, motion and a record that clients have confirmed predict success. A famous logo on a resume predicts very little. That is why every profile leads with fit and verified proof.</p>
            <div class="pg-pov-stats">
              <div><b class="num">${esc(hind[0][2])}</b><span>of hiring companies put “${esc(hind[0][0].toLowerCase())}” in their top three</span></div>
              <div><b class="num">${esc(hind[hind.length - 1][2])}</b><span>said the same of ${esc(hind[hind.length - 1][0].toLowerCase())}</span></div>
            </div>
            <div class="row pg-pov-foot">${illus('Illustrative research')}<a class="act" href="#levels">How we verify proof${icon('arrow')}</a></div>
          </article>
        </div>
      </div>
    </section>

    <section class="section night pg-core">
      <div class="wrap">
        ${shead('What clients rate', 'Fractional work takes skills a full-time career never teaches.', 'These are the four things every client rates after an engagement. We call it CORE, and it is how the Reputation Index knows who delivers.')}
        <div class="pg-core-grid">${RN.fields.coreDims.options.map((d) => `<article class="pg-core-item">
            <span class="pg-core-l" aria-hidden="true">${esc(d.v)}</span>
            <h3 class="h4">${esc(d.l)}</h3>
            <p>${esc(CORE_COPY[d.v] || d.d)}</p>
            <p class="pg-core-q"><span>Clients answer</span>${esc(d.q)}</p>
          </article>`).join('')}</div>
        <a class="act pg-core-link" href="#levels">How CORE feeds the Reputation Index${icon('arrow')}</a>
      </div>
    </section>

    <section class="section pg-diff-sec">
      <div class="wrap">
        ${shead('How we are different', 'Three decisions most talent firms will not make.')}
        <ul class="pg-diff">
          <li><span class="pg-value-i" aria-hidden="true">${icon('eye')}</span><h3 class="h3">Open profiles</h3><div><p class="pg-p">Every profile is public. No login and no sales call before you can see who is on the bench. If we are confident in our operators, we should be willing to show them to you.</p><a class="act" href="#browse">Browse ${RN.fmt.int(ops.length)} profiles${icon('arrow')}</a></div></li>
          <li><span class="pg-value-i" aria-hidden="true">${icon('seal')}</span><h3 class="h3">Verified proof</h3><div><p class="pg-p">The Reputation Index moves on client evidence: CORE reviews, focus areas a client confirmed and engagements a client verified. Operators cannot pay for a better badge, and reviews publish without a moderation queue.</p><a class="act" href="#levels">How levels work${icon('arrow')}</a></div></li>
          <li><span class="pg-value-i" aria-hidden="true">${icon('chart')}</span><h3 class="h3">Research we publish</h3><div><p class="pg-p">We turn what the network sees into public research: the State of Fractional GTM report, the Rate Index, the GTM Framework and the Fit Tag Library of ${RN.fmt.int(lib)} focus areas. Anyone can use it, hiring or not.</p><a class="act" href="#insights">Open Insights${icon('arrow')}</a></div></li>
        </ul>
      </div>
    </section>

    <section class="section pg-founder-sec">
      <div class="wrap pg-founder">
        <div class="pg-arch pg-arch-forest"><img src="assets/brand/founder.webp" alt="Matt Lopez, founder of Revenue Nomad"></div>
        <div class="pg-founder-body">
          <span class="eyebrow">A note from our founder</span>
          <blockquote class="pg-founder-q">I still take fractional engagements myself, and my profile sits on this platform with the same scoring as everyone else.</blockquote>
          <p class="pg-p">I have been the fractional CRO walking into a team that did not ask for me. I have built the playbook, sold the first deals to prove it worked, then hired and managed the people who took it over. That is a different job from being a great closer, and it is the job most growing companies actually need done.</p>
          <p class="pg-p">When you reach out, you get me or someone on our team who has sat in your seat. We will tell you honestly if fractional is the wrong answer for you right now.</p>
          <div class="pg-sign"><b>Matt Lopez</b><span>Founder and CEO</span>${matt ? `<span class="pg-sign-ris">${RN.ui.ris(matt)}</span>` : ''}</div>
          ${eng.length ? `<div class="pg-track-wrap"><span class="label">Engagements include</span><ol class="pg-track">${eng.map((e) => `<li><span class="pg-track-y">${esc(yr(e))}</span><b>${esc(e.company)}</b><span>${esc(e.role)}</span></li>`).join('')}</ol></div>` : ''}
          <div class="row pg-founder-cta">${matt ? `<a class="act" href="#op.${esc(matt.slug)}">See Matt’s profile, same rules as everyone${icon('arrow')}</a>` : ''}<button type="button" class="act" data-act="pg-book">${icon('calendar')}Book a call with the team</button></div>
        </div>
      </div>
    </section>

    <section class="section pg-facts-sec">
      <div class="wrap pg-facts">
        <div class="pg-facts-l"><h2 class="h2">The plain facts, for anyone checking.</h2>
          <p class="small muted">Profile counts come from the live network export loaded in this prototype. Market figures come from the illustrative research mockup and are marked.</p></div>
        <div class="pg-facts-r">
          <div class="stats-row pg-facts-stats" style="--cols:4">
            <div class="stat"><span class="stat-v">${RN.fmt.int(ops.length)}</span><span class="stat-l">Operator profiles in this prototype</span>${livePill()}</div>
            <div class="stat"><span class="stat-v">${cats}</span><span class="stat-l">Go-to-market disciplines</span>${livePill('Standard field')}</div>
            <div class="stat"><span class="stat-v">${RN.fmt.int(verified)}</span><span class="stat-l">Focus areas verified by a client review</span>${livePill()}</div>
            <div class="stat"><span class="stat-v">$${esc(trend[trend.length - 1].v)}</span><span class="stat-l">Median hourly rate, ${esc(trend[trend.length - 1].l)}</span>${illus()}</div>
          </div>
          <dl class="pg-dl">
            <div><dt>Who runs it</dt><dd>Founder led by Matt Lopez, with a small team that has done this work.</dd></div>
            <div><dt>The network</dt><dd>350+ vetted operators on the live network across ${cats} go-to-market disciplines. This prototype loads ${RN.fmt.int(ops.length)} of them from the live export.</dd></div>
            <div><dt>Since</dt><dd>The open platform took ten months to build and launched in August 2026.</dd></div>
            <div><dt>Who we serve</dt><dd>B2B companies from their first sales hire to established teams going through a transformation.</dd></div>
            <div><dt>Research</dt><dd>The State of Fractional GTM ${esc(R.year)} surveys operators and hiring companies. The figures in this prototype are illustrative. ${illus()}</dd></div>
            <div><dt>Reach a person</dt><dd><div class="stack" style="--gap:10px"><span><a class="link" href="mailto:${EMAIL}">${EMAIL}</a>, or <a class="link" href="#talk">Talk to us</a> and expect a reply within one business day.</span>${PG.phone()}</div></dd></div>
          </dl>
        </div>
      </div>
    </section>

    ${band({ h: 'Now you know who we are. Tell us about you.', text: 'Four quick questions and your email, then a real reply from a person within one business day.', actions: talkActions() })}`;
  }

  /* =====================================================================
     HOW IT WORKS
     ===================================================================== */
  function howView() {
    const act = (href, label) => `<a class="act" href="#${href}">${esc(label)}${icon('arrow')}</a>`;
    const clients = [
      { t: 'Browse free', d: 'Every profile is open. Search by role, focus area, industry and company size. No login and no sales call first.', l: act('browse', 'Browse talent') },
      { t: 'Shortlist and compare', d: 'Save operators as you go, then put up to four side by side: Reputation Index, CORE ratings, verified focus areas, availability and rate.', l: act('compare', 'Open compare') },
      { t: 'Request an intro or post a project', d: 'Ask to meet one operator by name, or post a project from an Engagement Blueprint and get ranked matches who reply in their Studio. Project budgets show the all-in rate, which includes a proposed 25% platform fee.', l: act('project.new', 'Post a project') + act('blueprints', 'See Blueprints') },
      { t: 'Introduced within one business day', d: 'The operator replies within 72 hours. Once they say yes, our team confirms the fit and introduces you by email within one business day.', l: asLink('buyer', 'buyer.intros', { mine: `Track your intros${icon('arrow')}`, other: `See a client workspace${icon('arrow')}` }, 'act') },
      { t: 'Review after the engagement', d: 'When the work wraps, you rate the operator on CORE. Your review verifies the focus areas you saw and moves their Reputation Index.', l: act('levels', 'How reviews count') },
    ];
    const cred = studioRoute(/cred/i, 'studio');
    const operators = [
      { t: 'Apply', d: 'One intake with the same fields clients filter on: role, company fit, role details, availability, rate and fit tags.', l: act('join.operator', 'Apply to join') },
      { t: 'Approved and live at 50', d: 'Our team checks identity and work history within 2 business days. Approved profiles go live at Emerging, a Reputation Index of 50.', l: act('levels', 'See the levels') },
      { t: 'Studio insights from day one', d: 'See the searches you appeared in, the kinds of companies that viewed you, and where your rate sits against the Rate Index.', l: asLink('operator', studioRoute(/visib/i), { mine: `Open Studio${icon('arrow')}`, other: `See Studio as Matt${icon('arrow')}` }, 'act') },
      { t: 'Verified proof raises your Reputation Index', d: 'Ask past clients for a CORE review from Studio. Each review rated 4.0 or higher verifies the fit tags it confirms and lifts your score.', l: asLink('operator', cred, { mine: `Open review requests${icon('arrow')}`, other: `See review requests as Matt${icon('arrow')}` }, 'act') },
      { t: 'Direct deals with proof links', d: 'Send a prospect a private proof link with your reviews and engagement history, then see which sections they read. Proposed: no fee on deals you bring yourself.', l: asLink('operator', cred, { mine: `Create a proof link${icon('arrow')}`, other: `See proof links as Matt${icon('arrow')}` }, 'act') },
    ];
    const col = (key, eyebrow, h, steps, cta) => `<div class="pg-how-col pg-how-${key}">
        <div class="pg-how-hd"><span class="eyebrow">${esc(eyebrow)}</span><h2 class="h3">${h}</h2></div>
        <ol class="pg-steps">${steps.map((s, i) => `<li><span class="pg-num">${String(i + 1).padStart(2, '0')}</span><div><h3 class="h4">${esc(s.t)}</h3><p class="pg-p">${esc(s.d)}</p><div class="row pg-step-links">${s.l}</div></div></li>`).join('')}</ol>
        <div class="pg-how-cta">${cta}</div>
      </div>`;
    return `
    ${hero({
      eyebrow: 'How it works',
      h: `One network, <span class="serif">two sides that both win.</span>`,
      lede: 'Clients find proven fractional leaders without a retained search. Operators get found, build proof, and get value even in months with no intro.',
      aside: `<div class="pg-hero-stats">
        <div><b class="num">Free</b><span>To browse every profile. No login needed.</span></div>
        <div><b class="num">72 hrs</b><span>For an operator to reply to an intro request</span></div>
        <div><b class="num">1 day</b><span>From an operator’s yes to an email intro, in business days</span></div>
        <div><b class="num">2 days</b><span>To review an operator application, in business days</span></div>
      </div>`,
    })}
    <section class="section">
      <div class="wrap pg-how">
        ${col('c', 'For clients', 'Hire on fit and proof, in days.', clients, `<a class="btn btn-lg" href="#browse">Browse talent${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#talk">Talk to us</a>`)}
        ${col('o', 'For operators', 'Get found, and get value without an intro.', operators, `<a class="btn btn-lg" href="#join.operator">Apply to join${icon('arrow')}</a><a class="btn btn-line btn-lg" href="#operators">Why join</a>`)}
      </div>
    </section>
    ${band({ h: 'Rather talk it through with a person?', text: 'Four quick questions and your email, then a real reply from a person within one business day.', actions: talkActions() })}`;
  }

  /* =====================================================================
     RESULTS
     ===================================================================== */
  function allReviews() {
    try { RN.model.applyEdits(); } catch (e) { /* edits are optional */ }
    const out = [];
    RN.model.ops.forEach((op) => (op.reviews || []).forEach((r) => out.push({ op, r })));
    return out.sort((a, b) => String(b.r.date || b.r.ts || '').localeCompare(String(a.r.date || a.r.ts || '')));
  }
  const listJoin = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const reviewText = (r) => r.quote || r.text || r.experience || r.overallExperience || '';
  const reviewScore = (r) => (typeof r.overall === 'number' ? r.overall : typeof r.coreAvg === 'number' ? r.coreAvg : null);

  function resultsView() {
    const matt = RN.model.matt;
    const all = allReviews();
    const R = market().report;
    const featured = all.find((x) => x.r.reviewer === 'Trista Kempa') || all[0];
    const scored = all.map((x) => reviewScore(x.r)).filter((n) => n != null);
    const avg = scored.length ? scored.reduce((a, n) => a + n, 0) / scored.length : 0;
    const again = all.filter((x) => x.r.hireAgain === true || x.r.hireAgain === 'yes').length;
    const verified = RN.model.ops.reduce((a, o) => a + o.tags.filter((t) => t.tier !== 'claimed').length, 0);
    const reqs = RN.store.state.reviewRequests || [];
    const pick = (re) => R.summary.find((s) => re.test(s.l));
    const research = [pick(/rehire/i), pick(/engagement length/i), pick(/pipeline/i), pick(/first sales leadership/i)].filter(Boolean);

    const engCard = (e) => {
      const rv = all.find((x) => x.op.id === matt.id && String(x.r.company).toLowerCase() === String(e.company).toLowerCase());
      const req = reqs.find((q) => q.opId === matt.id && String(q.engagement || (q.reviewer && q.reviewer.company)).toLowerCase() === String(e.company).toLowerCase());
      const status = rv || e.clientVerified ? `<span class="pill pill-good">${icon('check-circle')}Client verified</span>`
        : req && req.status === 'sent' ? `<span class="pill pill-info">${icon('clock')}Review requested</span>`
          : `<span class="pill">${icon('doc')}Self-reported</span>`;
      return `<article class="card pg-eng">
        <div class="pg-eng-hd"><span class="pg-logo">${RN.ui.logo(e.logo || '', { name: e.company, h: 26 })}</span>${status}</div>
        <h3 class="h4">${esc(e.company)}</h3>
        <p class="small muted">${esc(e.role)} · ${esc(ym(e.start))} to ${esc(ym(e.end))}${e.months ? ` · ${esc(e.months)} months` : ''}</p>
        ${rv ? `<blockquote class="pg-eng-q clamp-3">“${esc(reviewText(rv.r))}”</blockquote>
          <p class="small"><b>${esc(rv.r.reviewer)}</b> <span class="muted">${esc(rv.r.role)}, ${esc(rv.r.company)}</span></p>
          <p class="pg-eng-v">${icon('seal')}${RN.fmt.plural((rv.r.tags || []).length, 'focus area')} verified by this review</p>`
        : `<p class="small muted pg-eng-empty">No client review yet. When ${esc(e.company)} reviews the engagement, the focus areas they confirm turn Verified on Matt’s profile.</p>`}
      </article>`;
    };

    const shownAbove = (x) => x === featured || (matt && x.op.id === matt.id && matt.engagements.some((e) => String(e.company).toLowerCase() === String(x.r.company).toLowerCase()));
    const wall = all.filter((x) => !shownAbove(x));
    return `
    ${hero({
      eyebrow: 'Results',
      h: `Proof, <span class="serif">in their words.</span>`,
      lede: 'Client reviews of operators on the network, written by the client and published as submitted. Where a figure comes from research instead of a review, we say so.',
      aside: `<div class="pg-hero-stats">
        <div><b class="num">${RN.fmt.int(all.length)}</b><span>Client reviews on the network, ${avg ? avg.toFixed(1) : 'no'} average overall</span></div>
        <div><b class="num">${all.length ? Math.round((again / all.length) * 100) : 0}%</b><span>Of reviewing clients would hire the operator again</span></div>
        <div><b class="num">${RN.fmt.int(verified)}</b><span>Focus areas verified by those reviews</span></div>
        <span class="pg-hero-note">${icon('check-circle')}Live network export</span>
      </div>`,
    })}

    ${featured ? `<section class="section pg-feature-sec">
      <div class="wrap pg-feature">
        <div class="pg-arch pg-arch-sage"><div class="arch-logo">${RN.ui.logo('ferryWordmark', { h: 46, name: 'Ferry' })}</div></div>
        <figure class="pg-feature-q">
          <span class="pg-qmark" aria-hidden="true">“</span>
          <blockquote>${esc(reviewText(featured.r))}</blockquote>
          <figcaption><b>${esc(featured.r.reviewer)}</b><span>${esc(featured.r.role)}, ${esc(featured.r.company)}</span></figcaption>
          <div class="pg-feature-meta">
            ${reviewScore(featured.r) ? `<span class="row-nw" style="--gap:8px">${RN.ui.stars(reviewScore(featured.r))}<b>${reviewScore(featured.r).toFixed(1)}</b></span>` : ''}
            ${featured.r.hireAgain ? `<span class="pill pill-good">${icon('check')}Would hire again</span>` : ''}
            ${featured.r.date ? `<span class="small muted">Reviewed ${esc(RN.fmt.date(featured.r.date + 'T12:00:00'))}</span>` : ''}
          </div>
          ${(featured.r.tags || []).length ? `<div class="pg-feature-tags"><span class="label">Focus areas this review verified for ${esc(featured.op.first)}</span>${RN.ui.ftags((featured.r.tags || []).map((t) => ({ t, tier: 'verified' })))}</div>` : ''}
          <a class="act" href="#op.${esc(featured.op.slug)}">Read the full review on ${esc(featured.op.first)}’s profile${icon('arrow')}</a>
        </figure>
      </div>
    </section>` : ''}

    ${matt && matt.engagements.length ? `<section class="section pg-engs-sec">
      <div class="wrap">
        ${shead('Engagement history', `${esc(matt.first)} has worked with ${esc(listJoin(matt.engagements.map((e) => e.company)))}.`, `${esc(matt.name)}’s engagements, as clients see them on his profile. A review from the client turns an engagement from self-reported to client verified.`, `<a class="act" href="#op.${esc(matt.slug)}">Open ${esc(matt.first)}’s profile${icon('arrow')}</a>`)}
        <div class="grid g-2 pg-engs">${matt.engagements.map(engCard).join('')}</div>
      </div>
    </section>` : ''}

    ${wall.length ? `<section class="section pg-wall-sec">
      <div class="wrap">
        ${shead('Client reviews', 'More from their clients.', `${RN.fmt.plural(all.length, 'client review')} on the network so far, and this page shows every one. Reviews publish without a moderation queue.`)}
        <div class="grid g-3 pg-wall">${wall.map(({ op, r }) => `<article class="card pg-rev">
            <div class="row between"><span class="row-nw" style="--gap:6px">${reviewScore(r) ? RN.ui.stars(reviewScore(r)) : ''}</span>${r.hireAgain ? `<span class="pill pill-good">${icon('check')}Would hire again</span>` : ''}</div>
            <blockquote class="pg-rev-q">“${esc(reviewText(r))}”</blockquote>
            <p class="small"><b>${esc(r.reviewer || 'Client')}</b> <span class="muted">${esc([r.role, r.company].filter(Boolean).join(', '))}</span></p>
            <a class="pg-rev-op" href="#op.${esc(op.slug)}">${RN.ui.avatar(op, 'ava-sm')}<span><b>${esc(op.name)}</b><span>Fractional ${esc(op.role)} · ${RN.fmt.plural((r.tags || []).length, 'focus area')} verified</span></span>${icon('arrow')}</a>
          </article>`).join('')}
          <article class="pg-rev pg-rev-how">
            <span class="pg-value-i">${icon('star')}</span>
            <h3 class="h4">Every client gets asked</h3>
            <p class="small">Operators request a review from Studio when an engagement ends. The client answers four CORE questions, rates the outcome and says whether they would hire again. The review publishes the day it lands.</p>
            <a class="act" href="#levels">How reviews move the Reputation Index${icon('arrow')}</a>
          </article></div>
      </div>
    </section>` : ''}

    <section class="section pg-research-sec">
      <div class="wrap">
        ${shead('What the research says', 'Proof is what gets operators rehired.', `From the State of Fractional GTM ${esc(R.year)} research mockup. Every figure in this section is illustrative.`, `${illus()}<a class="act" href="#report">Read the report${icon('arrow')}</a>`)}
        <div class="stats-row" style="--cols:${research.length}">${research.map((s) => `<div class="stat"><span class="stat-v">${esc(s.v)}</span><span class="stat-l">${esc(s.l.replace(/buyers/gi, 'clients'))}</span></div>`).join('')}</div>
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
      </div>
    </section>

    ${band({ h: 'Want an operator with a record like this?', text: 'Tell us what you need and we will put three operators in front of you, matched on the same fields they filled in at signup.', actions: talkActions() })}`;
  }

  /* =====================================================================
     TALK TO US: short auto-advancing flow on the standard picklists
     ===================================================================== */
  const STEPS = [
    { key: 'need', q: 'What do you need help with?', cols: 2, hint: 'Pick the closest. We match it to the role categories that solve it.' },
    { key: 'companyRevenue', q: 'How big is the business today?', cols: 3 },
    { key: 'companyEmployees', q: 'How many people work there?', cols: 3 },
    { key: 'startBy', q: 'When do you need them to start?', cols: 3, hint: 'We match this to each operator’s availability.' },
    { key: 'contact', q: 'Last one. Where should we reply?' },
  ];
  const TKEY = 'rn-pg-talk-v2';
  const fresh = (need) => ({ step: need ? 1 : 0, ans: need ? { need } : {}, ctx: need || null, name: '', email: '', company: '', err: '', focus: '', done: false, sugg: [], matches: 0, booked: null, sentAt: null, search: null, note: '', usedSearch: null });
  let T = (function () { try { const s = JSON.parse(window.sessionStorage.getItem(TKEY) || 'null'); if (s && s.ans) return Object.assign(fresh(), s); } catch (e) { /* ignore */ } return fresh(); })();
  function save() { try { window.sessionStorage.setItem(TKEY, JSON.stringify(T)); } catch (e) { /* in memory only */ } }
  let advTimer = null;

  const steps = () => (persona() === 'buyer' ? STEPS.filter((s) => s.key !== 'companyRevenue' && s.key !== 'companyEmployees') : STEPS);
  const needCats = (need) => (RN.fields.needCats[need] || []).slice();
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
  }
  // Short recap labels: the two question-style labels read badly in a chip; range labels stay standard
  const RECAP = { need: 'Need', startBy: 'Start' };
  function recap(o) {
    o = o || {};
    const keys = ['need', 'companyRevenue', 'companyEmployees', 'startBy'];
    const st = steps();
    return keys.filter((k) => T.ans[k]).map((k) => {
      const i = st.findIndex((s) => s.key === k);
      const label = RN.w.label(k, T.ans[k]);
      const name = RECAP[k] || RN.fields[k].label;
      if (o.text) return `${name}: ${label}`;
      return i >= 0 ? `<button type="button" class="pg-recap-chip" data-act="pg-talk-jump" data-i="${i}" title="Change this answer"><span>${esc(name)}</span>${esc(label)}</button>`
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
    const filters = {};
    if (cats.length) filters.roleCategories = cats;
    if (b.revenueRange) filters.revenueRange = [b.revenueRange];
    if (b.employeeRange) filters.employeeRange = [b.employeeRange];
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
          <div class="field"><label for="pg-co">Company <span class="opt">Optional</span></label><input class="input" id="pg-co" name="company" value="${esc(T.company)}" placeholder="Company name" autocomplete="organization"></div>
          <div class="field"><label for="pg-note">What are you looking for? <span class="opt">Optional</span></label><textarea class="textarea input" id="pg-note" name="note" maxlength="500" rows="2" placeholder="The problem, the timeline, what good looks like in 90 days.">${esc(T.note || '')}</textarea></div>
          ${T.err ? `<p class="pg-err" role="alert">${icon('info')}${esc(T.err)}</p>` : ''}
          <div class="pg-contact-foot"><button class="btn btn-leaf btn-lg" type="submit">Send to a person${icon('arrow')}</button><span class="small">A person replies within one business day. No sales sequence.</span></div>
        </form>`;
    } else {
      const d = RN.fields[s.key];
      body = `<p class="pg-q-sub">${s.hint ? `<span>${esc(s.hint)}</span>` : `<span class="label">${esc(d.label)}</span>${d.help ? `<span>${esc(d.help)}</span>` : ''}`}<span class="pg-kbd hide-m">Press 1 to ${d.options.length}</span></p>
        <div class="pg-tiles" data-cols="${s.cols || 2}">${RN.w.control(s.key, T.ans[s.key] || '', { name: s.key, id: 'pg-t-' + s.key, change: 'pg-talk-pick' })}</div>
        ${chips.length ? `<div class="pg-recap pg-recap-sm" aria-label="Your answers so far">${chips.join('')}</div>` : ''}`;
    }
    return `<section class="pg-talk night" data-step="${esc(s.key)}">
      <div class="pg-talk-in">
        <div class="pg-talk-top">
          ${T.step > 0 ? `<button type="button" class="pg-back" data-act="pg-talk-back">${icon('arrow-left')}Back</button>` : `<a class="pg-back" href="#home">${icon('x')}Close</a>`}
          <span class="step-count">Question ${T.step + 1} of ${st.length}</span>
        </div>
        ${progress(T.step, st.length)}
        ${note}${T.step === 0 ? searched : ''}
        <h1 class="h2 pg-q" tabindex="-1">${esc(s.q)}</h1>
        ${body}
        <p class="pg-talk-alt">Rather talk now? <button type="button" class="act" data-act="pg-book">${icon('calendar')}Book a call</button> or call ${PHONE}</p>
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
              : `<p class="small">30 minutes with Matt Lopez or someone on our team who has sat in your seat.</p><button type="button" class="btn btn-leaf" data-act="pg-book">Pick a time${icon('arrow')}</button>`}
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
        ${ops.length ? `<div class="grid g-3 pg-sugg">${ops.map((op) => {
          const fit = RN.model.fit(op, b);
          const order = ['expertise', 'revenue', 'employees'];
          const sig = order.map((k) => fit.signals.find((x) => x.k === k && x.state === 'match')).find(Boolean) || fit.signals.find((x) => x.state !== 'low') || fit.signals[0];
          return RN.ui.opCard(op, { why: `${fit.label}${sig ? ': ' + sig.text : ''}`, cta: 'invite', ctaAct: 'pg-intro', ctaLabel: 'Request intro' });
        }).join('')}</div>` : RN.ui.empty({ icon: 'users', title: 'No close match on the network yet', body: 'A person on our team will look for you, including operators who are not listed yet.', cta: `<button type="button" class="btn" data-act="pg-book">${icon('calendar')}Book a call</button>` })}
      </div>
    </section>`;
  }

  function talkMount(root) {
    document.removeEventListener('keydown', onTalkKey);
    document.addEventListener('keydown', onTalkKey);
    const f = T.focus && root.querySelector('#' + T.focus);
    if (f) { f.focus(); T.focus = ''; save(); return; }
    const q = root.querySelector('.pg-q');
    if (q && T.moved) { q.focus({ preventScroll: true }); T.moved = false; }
  }
  function talkUnmount() {
    document.removeEventListener('keydown', onTalkKey);
    clearTimeout(advTimer);
  }
  function onTalkKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    const tag = ((e.target && e.target.tagName) || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.querySelector('.scrim, .menu-sheet')) return;
    const chip = RN.$$('.pg-talk .pg-tiles .chip')[+e.key - 1];
    if (chip) { e.preventDefault(); chip.focus(); chip.click(); }
  }
  const onTalk = () => ['talk', 'talk-need'].includes(curView());

  RN.inputs['pg-talk-pick'] = (el) => {
    if (!el.value) return;
    T.ans[el.name] = el.value;
    T.err = '';
    save();
    clearTimeout(advTimer);
    advTimer = setTimeout(() => {
      if (!onTalk()) return;
      const st = steps();
      const i = st.findIndex((x) => x.key === el.name);
      T.step = Math.min(st.length - 1, (i >= 0 ? i : T.step) + 1);
      T.moved = true;
      if (st[T.step].key === 'contact') T.focus = T.name ? (T.email ? '' : 'pg-email') : 'pg-name';
      save();
      RN.render();
    }, 320);
  };
  RN.actions['pg-talk-back'] = () => { clearTimeout(advTimer); T.step = Math.max(0, T.step - 1); T.moved = true; save(); RN.render(); };
  RN.actions['pg-talk-jump'] = (el) => { clearTimeout(advTimer); T.step = +el.dataset.i || 0; T.moved = true; save(); RN.render(); };
  RN.actions['pg-talk-reset'] = () => { T = Object.assign(fresh(), { usedSearch: T.usedSearch }); save(); if (curView() === 'talk') RN.render(); else RN.go('talk'); };
  RN.actions['pg-talk-browse'] = () => { const s = suggest(); goBrowse({ filters: s.filters }); };

  RN.submits['pg-talk-send'] = (form, data) => {
    T.name = String(data.name || '').trim();
    T.email = String(data.email || '').trim();
    T.company = String(data.company || '').trim();
    T.note = String(data.note || '').trim();
    if (!T.name || !EMAIL_RE.test(T.email)) {
      T.err = 'Add your name and a valid work email so we can reply.';
      T.focus = !T.name ? 'pg-name' : 'pg-email';
      save(); RN.rerender(); return;
    }
    T.err = '';
    const s = suggest();
    const needLabel = RN.w.label('need', T.ans.need);
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
    RN.mail(TEAM, `Talk to us: ${needLabel}`, `${T.name} <${T.email}>${T.company ? ', ' + T.company : ''}\n${lines.join('\n')}\n\n${RN.fmt.plural(s.matches, 'operator')} on the network match these answers.${names.length ? '\nSuggested first: ' + names.join(', ') + '.' : ''}\nReply within one business day.`, 'lead');
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
    const pre = { need: T.ans.need, startBy: T.ans.startBy };
    if (T.note) pre.note = T.note;
    if (persona() !== 'buyer') Object.assign(pre, { name: T.name, email: T.email, company: T.company, revenueRange: T.ans.companyRevenue, employeeRange: T.ans.companyEmployees });
    Object.keys(pre).forEach((k) => { if (pre[k] == null || pre[k] === '') delete pre[k]; });
    RN.intro.open(op.id, pre);
  };

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
    if (T.done && T.email) return { name: T.name, email: T.email, company: T.company };
    if (persona() === 'buyer') { const b = RN.personas.buyer; return { name: b.name, email: b.email, company: b.company.name }; }
    return null;
  }
  PG.book = function () {
    const k = knownContact();
    const days = [];
    slots(6).forEach((t) => { const key = t.toDateString(); let g = days.find((x) => x.key === key); if (!g) { g = { key, list: [] }; days.push(g); } g.list.push(t); });
    RN.ui.modal({
      width: 560,
      title: 'Book a 30-minute call',
      sub: 'With Matt Lopez or someone on our team who has sat in your seat. Pick a time and we send the invite.',
      body: `<div class="stack pg-book" style="--gap:20px">
        ${k ? `<p class="note info">${icon('user')}<span>Booking as <b>${esc(k.name)}</b>, ${esc(k.email)}</span></p>`
          : `<div class="grid g-2" style="--gap:14px">${RN.w.field('fullName', '', { name: 'bk-name', id: 'pg-bk-name', label: 'Your name', compact: true })}${RN.w.field('email', '', { name: 'bk-email', id: 'pg-bk-email', compact: true })}</div>`}
        <div class="stack" style="--gap:16px">${days.map((g) => `<div class="pg-slot-day"><span class="label">${esc(g.list[0].toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
          <div class="pg-slots">${g.list.map((t) => `<button type="button" class="pg-slot" data-act="pg-slot" data-ts="${esc(t.toISOString())}">${icon('clock')}${esc(timeLabel(t))} ET</button>`).join('')}</div></div>`).join('')}</div>
        <div class="pg-book-alt"><span class="small muted">Rather call now?</span>${PG.phone()}</div>
      </div>`,
    });
  };
  RN.actions['pg-book'] = () => PG.book();
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
    const from = curView() || 'site';
    RN.mail(TEAM, `Call booked: ${label}`, `${k.name} <${k.email}>${k.company ? ', ' + k.company : ''} booked a 30-minute call from the ${from} page.${T.done ? '\n\nTalk to us answers:\n' + recap({ text: true }).join('\n') : ''}`, 'call');
    RN.mail(k.email, `Your call with Revenue Nomad: ${label}`, `Thanks, ${RN.fmt.first(k.name)}. You are booked for ${label}, 30 minutes. A calendar invite with the video link is on its way.\n\nNeed another time? Reply to this email or call ${PHONE}.`, 'call');
    RN.track('contact_submit', { kind: 'call', source: from });
    RN.ui.closeModal();
    RN.ui.toast(`Call booked for ${esc(label)}`, { icon: 'calendar' });
    if (onTalk()) RN.rerender();
  };

  /* =====================================================================
     FOR OPERATORS
     ===================================================================== */
  function studioPreview() {
    const matt = RN.model.matt;
    const a = RN.model.analytics(matt.id, { days: 30 });
    const pos = RN.model.positioning(matt.id);
    const T0 = a.totals, P = a.prev;
    const stat = (v, l, prev, extra) => `<div class="pg-sp-stat"><span class="pg-sp-l">${esc(l)}</span><b class="num">${RN.fmt.int(v)}</b>${prev ? RN.ui.delta(v, prev) : ''}${extra || ''}</div>`;
    const lo = pos.idx.p25 - (pos.idx.p75 - pos.idx.p25) * 0.6, hi = pos.idx.p75 + (pos.idx.p75 - pos.idx.p25) * 0.6;
    const at = (v) => RN.clamp(((v - lo) / (hi - lo)) * 100, 0, 100).toFixed(1);
    const viewers = a.viewers.slice(0, 3);
    return `<div class="pg-sp" aria-label="Studio preview for Matt Lopez">
      <div class="pg-sp-hd">
        <span class="row-nw" style="--gap:10px">${RN.ui.avatar(matt, 'ava-sm')}<span><b>Studio</b><span class="pg-sp-sub">${esc(matt.name)} · last 30 days</span></span></span>
        ${illus('Illustrative analytics')}
      </div>
      <div class="pg-sp-stats">
        ${stat(T0.impressions, 'Search impressions', P.impressions)}
        ${stat(T0.views, 'Profile views', P.views, `<span class="pg-sp-spark">${RN.chart.spark(a.series.views, { w: 96, h: 28, label: 'Profile views, last 30 days' })}</span>`)}
        ${stat(T0.shortlists, 'Shortlists', P.shortlists)}
        ${stat(T0.intros, 'Intro requests')}
      </div>
      <div class="pg-sp-grid">
        <div class="pg-sp-box"><span class="label">Why clients found you</span>
          <ol class="pg-sp-list">${a.queries.slice(0, 3).map((q) => `<li><span class="grow">“${esc(q.q)}”</span><span class="meter"><i style="width:${Math.round(q.share * 100 / Math.max(0.01, a.queries[0].share))}%"></i></span><b class="num">${RN.fmt.int(q.n)}</b></li>`).join('')}</ol></div>
        <div class="pg-sp-box"><span class="label">Who viewed you</span>
          <ol class="pg-sp-list">${viewers.map((v) => `<li><span class="grow">${esc(RN.w.label('industries', v.industry))} · ${esc(RN.w.label('revenueRange', v.revenueRange))} · ${esc(RN.w.label('employeeRange', v.employeeRange))} employees</span><b class="num">${RN.fmt.int(v.views + v.shortlists + v.compares)}</b></li>`).join('')}</ol>
          <p class="pg-sp-note">Company type only. Never names.</p></div>
      </div>
      <div class="pg-sp-box pg-sp-rate"><span class="label">Your rate vs the Rate Index, ${esc(RN.fields.catLabel(matt.catKey))}</span>
        <div class="pg-rate">
          <div class="pg-rate-track"><i class="pg-rate-iqr" style="left:${at(pos.idx.p25)}%;right:${(100 - at(pos.idx.p75)).toFixed(1)}%"></i><i class="pg-rate-med" style="left:${at(pos.idx.p50)}%"></i><i class="pg-rate-you" style="left:${at(pos.rate)}%"><span>You $${esc(pos.rate)}</span></i></div>
          <div class="pg-rate-ticks"><span style="left:${at(pos.idx.p25)}%">p25 $${esc(pos.idx.p25)}</span><span style="left:${at(pos.idx.p50)}%">Median $${esc(pos.idx.p50)}</span><span style="left:${at(pos.idx.p75)}%">p75 $${esc(pos.idx.p75)}</span></div>
        </div>
      </div>
    </div>`;
  }

  function whoViewedSnippet() {
    const matt = RN.model.matt;
    if (!matt) return '';
    const a = RN.model.analytics(matt.id, { days: 30 });
    const seg = a.viewers[0];
    const q = a.queries[0];
    const ind = a.mix.industry[0];
    const rows = [
      seg && `<li><b>${RN.fmt.int(seg.views + seg.shortlists + seg.compares)} visits</b> from ${esc(RN.w.label('industries', seg.industry))} companies at ${esc(RN.w.label('revenueRange', seg.revenueRange))} revenue and ${esc(RN.w.label('employeeRange', seg.employeeRange))} employees</li>`,
      q && `<li><b>${RN.fmt.int(q.n)} impressions</b> from the search “${esc(q.q)}”</li>`,
      ind && `<li><b>${esc(ind.l)}</b> is the industry that looked most</li>`,
    ].filter(Boolean);
    return `<div class="pg-snip"><div class="pg-snip-hd"><span class="eyebrow">From Matt’s Studio this month</span>${illus()}</div><ul>${rows.join('')}</ul></div>`;
  }

  function operatorsView() {
    const ops = RN.model.ops;
    const total = ops.length || 1;
    const R = market().report;
    const supply = {};
    ops.forEach((o) => { supply[o.catKey] = (supply[o.catKey] || 0) + 1; });
    const intent = {};
    R.intent.forEach((x) => { intent[x.cat] = x.v; });
    const top = RN.fields.roleCategory.options.slice().sort((a, b) => (supply[b.v] || 0) - (supply[a.v] || 0))[0];
    const topShare = Math.round(((supply[top.v] || 0) / total) * 100);
    const maxShare = Math.max(...RN.fields.roleCategory.options.map((o) => Math.max((supply[o.v] || 0) / total * 100, intent[o.v] || 0)), 1);
    const values = [
      { i: 'eye', t: 'Who viewed you and why', d: 'The type of company behind every profile view (industry, revenue range, employee range), plus the searches and filters that surfaced you. Never names, so clients keep browsing freely.', to: studioRoute(/visib/i) },
      { i: 'sliders', t: 'Positioning vs the Rate Index', d: 'Your rate against the p25, median and p75 for your role category, and the focus areas clients search for that few operators have verified.', to: studioRoute(/posit/i) },
      { i: 'globe', t: 'Search and AI visibility', d: `An indexable profile page with structured data, the Google queries that found it, and whether ${market().aiEngines.join(', ').replace(/, ([^,]*)$/, ' and $1')} mention you.`, to: studioRoute(/search|ai/i) },
      { i: 'shield', t: 'Credibility for direct deals', d: 'Private proof links that show a prospect your reviews, CORE ratings and engagement history, and tell you which sections they read. A verified badge for your site and proposals.', to: studioRoute(/cred/i) },
      { i: 'radar', t: 'Predictive prospects and fractional roles', d: 'Fractional job posts that match your tags, and companies showing signs they need you now: a raise, a sales leader leaving, a hiring spree.', to: studioRoute(/opport|prospect|job/i) },
    ];
    const samples = [
      { q: 'The Studio showed three healthcare companies had looked at my profile in one week. I asked a past client to verify two tags, and the next month I made two shortlists.', by: 'Fractional VP of Sales' },
      { q: 'I send a proof link with every proposal now. Seeing that the prospect read my reviews twice and forwarded the link changed how I ran the follow-up call.', by: 'Fractional RevOps leader' },
      { q: 'No intros in my first month, and I still opened Studio every Monday. The rate position alone was worth it: I was pricing well under the median for my category.', by: 'Fractional CMO' },
    ];
    const faq = [
      ['Does it cost anything to join?', 'No. Everything on this page is free. If we ever charge operators, it will be for tools such as more proof links or a custom domain. Rank, labels and badges will never be for sale.'],
      ['Do you take a fee on my deals?', 'Proposed: no fee on deals you bring yourself, including deals you win with a proof link. On engagements that start from a Revenue Nomad project, the proposed platform fee is 25%: the client sees an all-in rate and you see your take-home. The founder is confirming both, and we will say so plainly before anything changes.'],
      ['How long does approval take?', 'We review applications within 2 business days. Approved profiles go live at Emerging, a Reputation Index of 50, and Studio opens the same day.'],
      ['I have no reviews yet. Will clients find me?', 'Yes. Search ranks on fit first: role, focus areas, company size and industry. A complete profile ranks higher, and Studio shows which searches you appear in so you can close the gaps.'],
      ['Can I see which companies viewed me?', 'You see the type of company: industry, revenue range and employee range. Never the name. Clients browse more when they know that, which means more views for you.'],
      ['Who sees my rate?', 'Signed-in clients see it on your card and profile. It also feeds the Rate Index, anonymized, so every operator can price with real data.'],
    ];
    return `
    ${hero({
      eyebrow: 'For fractional operators',
      h: `Get value from the network <span class="serif">even in months with no intro.</span>`,
      lede: 'There are more fractional leaders than open seats, and we will not pretend otherwise. So your profile works for you every week: it shows who looked and why, where you stand on rate, and gives you proof you can take into your own deals.',
      actions: `<a class="btn btn-lg" href="#join.operator">Apply to join${icon('arrow')}</a>${studioAsMatt('studio')}`,
      foot: `<div class="pg-hero-strip">
        <div><b class="num">${RN.fmt.int(ops.length)}</b><span>Operator profiles in this prototype, from 350+ on the live network</span></div>
        <div><b class="num">${topShare}%</b><span>Of them lead ${esc(top.l)}</span></div>
        <div><b class="num">$0</b><span>To join. Proposed: no fee on deals you bring yourself</span></div>
      </div>`,
    })}

    <section class="section pg-honest-sec">
      <div class="wrap pg-honest">
        <div class="pg-honest-l">
          <span class="eyebrow">The honest part</span>
          <h2 class="h2">Supply is crowded. Proof is how you stand out.</h2>
          <p class="pg-p">${topShare}% of the ${RN.fmt.int(ops.length)} profiles in this prototype lead ${esc(top.l)}, while about ${esc(intent[top.v] || 0)}% of client hiring intent sits there (illustrative survey data). Most operators will not get an intro in a given month. That is why intros are not the only thing we give you.</p>
          <p class="pg-p">Categories where client intent runs ahead of supply are where a verified record pays off fastest.</p>
          <a class="act" href="#library">See demand vs verified supply by focus area${icon('arrow')}</a>
        </div>
        <div class="card pg-honest-r">
          <div class="card-hd"><div><h3>Where operators are vs where clients are hiring</h3><p class="sub">Share by role category</p></div></div>
          <div class="legend"><span><i style="background:var(--viz-muted)"></i>Operators in this prototype ${livePill()}</span><span><i style="background:var(--viz-1)"></i>Client hiring intent ${illus()}</span></div>
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
            <span class="pg-value-i">${icon(v.i)}</span>
            <h3 class="h4">${esc(v.t)}</h3>
            <p class="pg-p">${esc(v.d)}</p>
            ${i === 0 ? whoViewedSnippet() : ''}
            ${asLink('operator', v.to, { mine: `Open in Studio${icon('arrow')}`, other: `See it as Matt${icon('arrow')}` }, 'act')}
          </article>`).join('')}</div>
      </div>
    </section>

    <section class="section night pg-sp-sec">
      <div class="wrap pg-sp-wrap">
        <div class="pg-sp-copy">
          <span class="eyebrow">A look inside Studio</span>
          <h2 class="h2">This is Matt’s Monday in Studio.</h2>
          <p class="lede">Matt Lopez is our founder, and his profile sits on the network with the same scoring as everyone else. His profile, rate and reviews are live data. Views and searches in this prototype are illustrative.</p>
          <div class="pg-actions">${studioAsMatt('studio', 'btn btn-leaf btn-lg')}</div>
        </div>
        ${studioPreview()}
      </div>
    </section>

    <section class="section pg-ladder-sec">
      <div class="wrap">
        ${shead('Invest more, get more', 'One ladder. Every rung is earned.', 'Your label comes from your Reputation Index, and the Index moves on client evidence: reviews, verified fit tags and engagements. What each tier unlocks is proposed and not final.', `<a class="act" href="#levels">How the Reputation Index works${icon('arrow')}</a>`)}
        ${ladder({ counts: true, me: true })}
        <div class="grid g-3 pg-principles">
          <div><span class="pg-pr-i">${icon('lock')}</span><h3 class="h5">Nothing is for sale</h3><p class="small muted">No paid rank, no paid badge, no paid access to client projects. Every tier and every tool on this page is free.</p></div>
          <div><span class="pg-pr-i">${icon('handshake')}</span><h3 class="h5">Proposed: no fee on deals you bring yourself</h3><p class="small muted">Win a client with your proof link and the deal is yours. The founder is confirming this before launch.</p></div>
          <div><span class="pg-pr-i">${icon('seal')}</span><h3 class="h5">Evidence moves the score</h3><p class="small muted">Client reviews rated 4.0 or higher verify your fit tags. A complete profile adds a little. Logging in more adds nothing.</p></div>
        </div>
      </div>
    </section>

    <section class="section pg-samples-sec">
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
        <div class="pg-faq">${faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}${icon('chev-down')}</summary><p class="pg-p">${esc(a)}</p></details>`).join('')}</div>
      </div>
    </section>

    ${band({ h: 'Put your proof where clients look.', text: 'Apply in one intake with the same fields clients filter on. We review it within 2 business days.', actions: `<a class="btn btn-leaf btn-lg" href="#join.operator">Apply to join${icon('arrow')}</a>${studioAsMatt('studio')}` })}`;
  }

  /* =====================================================================
     LEVELS: Reputation Index explainer for clients and operators
     ===================================================================== */
  /* Client wording for the factor list: clients see "focus areas", not fit tags. Prefers registry clientLabel/clientD. */
  const CLIENT_FACTOR = { verification: { l: 'Focus area verification', d: 'Share of focus areas a client confirmed in a review.' } };
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
      ['lock', 'No pay-to-win', 'Nothing you can buy moves a score, a label or a place in search. The inputs are client evidence and a complete profile.'],
      ['send', 'Reviews auto-publish', 'There is no moderation queue and no hand-picking. Every review counts the day it lands, good or bad.'],
      ['users', 'One label for clients and operators', 'The label comes from the score, and the score is the same on cards, profiles, compare and in Studio.'],
      ['seal', 'Team-checked is not client-verified','Emerging means our team checked identity and work history. Verified is kept for what a client confirmed: focus areas and engagements.'],
      ['layers', 'A floor of 50', 'Every approved profile starts at 50, so a new operator with no reviews yet still shows as Emerging.'],
    ];
    // Only offer minimums that at least one profile in this prototype meets
    const risOpts = RN.fields.risMin.options.map((o) => ({ o, n: RN.model.ops.filter((op) => op.ris.score >= +o.v).length })).filter((x) => x.n > 0);
    return `
    ${hero({
      eyebrow: 'Levels and the Reputation Index',
      h: 'One score. <span class="serif">Earned, never bought.</span>',
      lede: 'The Reputation Index is a 0 to 100 score built from client evidence. Clients and operators see the same number and the same label, everywhere on Revenue Nomad.',
      actions: `<button type="button" class="btn btn-lg" data-act="pg-browse-sort" data-sort="ris">Browse by Reputation Index${icon('arrow')}</button>${studioAsMatt(studioRoute(/cred/i), 'btn btn-line btn-lg', 'See your level in Studio')}`,
    })}

    <section class="section pg-ladder-sec">
      <div class="wrap">
        ${shead('The ladder', 'Six tiers, one for every score.', `${RN.fmt.int(emerging)} of ${RN.fmt.int(total)} profiles in this prototype sit at Emerging today. That is expected on a network that started collecting client reviews this year, and it is why every review moves a profile. What each tier unlocks is proposed and not final.`)}
        ${ladder({ desc: true, counts: true, me: true })}
      </div>
    </section>

    <section class="section pg-factors-sec">
      <div class="wrap pg-factors">
        <div class="pg-factors-l">
          <span class="eyebrow">How score is calculated</span>
          <h2 class="h2">Five signals, one number.</h2>
          <div class="pg-explainer"><p>The Reputation Index blends five signals into one 0 to 100 score. Every approved profile starts at a floor of 50.</p>
            <ul>${factors.map((f) => `<li><b>${esc(factorLabel(f))}</b>: ${esc(factorDesc(f))}</li>`).join('')}</ul></div>
        </div>
        <div class="card pg-factors-r">
          <div class="card-hd"><div><h3>Weight of each signal</h3><p class="sub">Share of the score above the floor of 50</p></div><span class="pill pill-warn">Proposed weights</span></div>
          <div class="pg-meters">${factors.map((f) => `<div class="pg-mrow"><span>${esc(factorLabel(f))}</span><div class="meter"><i style="width:${Math.round((f.w / maxW) * 100)}%"></i></div><b>${Math.round((f.w || 0) * 100)}%</b></div>`).join('')}</div>
          <p class="small muted pg-factors-note">Profile completeness is the only signal an operator controls alone. Everything else needs a client.</p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap pg-curve">
        <div class="pg-curve-l">
          <span class="eyebrow">Focus area verification</span>
          <h2 class="h2">A claim becomes proof one review at a time.</h2>
          <p class="pg-p">Operators claim up to 25 focus areas (in Studio they are called fit tags). A focus area turns Verified when a client review confirms it, and its score climbs with each confirming review. Only reviews rated 4.0 or higher count. A focus area a client adds in a review joins the profile as Verified.</p>
          <div class="row pg-curve-ex">${RN.ui.ftag({ t: 'Sales Playbook', tier: 'verified' })}${RN.ui.ftag({ t: 'Board Revenue Reporting', tier: 'claimed' })}</div>
          <p class="small muted">Solid with a check is verified by a client. Dashed is claimed by the operator.</p>
          <div class="pg-curve-chart">${RN.chart.columns(curve.map((c) => ({ label: c.r === 10 ? '10+' : String(c.r), value: c.score, hi: c.r === 5 })), { w: 440, h: 200, fmt: (n) => String(n), label: 'Focus area score by number of confirming client reviews' })}<p class="tiny muted">Score by number of confirming client reviews. Expert from 5.</p></div>
        </div>
        <div class="tbl-wrap card pg-curve-tbl">
          <table class="tbl">
            <thead><tr><th>Client reviews</th><th class="r">Score</th><th>Tier</th></tr></thead>
            <tbody>${curve.map((c) => `<tr><td>${c.r === 10 ? '10 or more' : c.r === 0 ? '0, self-claimed' : c.r}</td><td class="r num">${c.score || '0'}</td><td>${tierPill(c.tier)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="section night pg-core">
      <div class="wrap">
        ${shead('CORE client reviews', 'Four questions, asked the same way every time.', 'Each client rates the operator from 1 to 5 on all four and can explain every score. The review also asks for the overall experience and whether they would hire the operator again.')}
        <div class="pg-core-grid">${RN.fields.coreDims.options.map((d) => `<article class="pg-core-item">
            <span class="pg-core-l" aria-hidden="true">${esc(d.v)}</span>
            <h3 class="h4">${esc(d.l)}</h3>
            <p>${esc(d.d)}</p>
            <p class="pg-core-q"><span>The question</span>${esc(d.q)}</p>
          </article>`).join('')}</div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${shead('The principles', 'Rules that keep the score worth trusting.')}
        <div class="pg-princ">${principles.map(([i, t, d]) => `<div class="pg-princ-item"><span class="pg-pr-i">${icon(i)}</span><div><h3 class="h5">${esc(t)}</h3><p class="small muted">${esc(d)}</p></div></div>`).join('')}</div>
      </div>
    </section>

    <section class="section-sm">
      <div class="wrap grid g-2 pg-uses">
        <div class="card">
          <span class="eyebrow">For clients</span>
          <h3 class="h3" style="margin-top:8px">Start with confirmed records</h3>
          <p class="small muted" style="margin-top:8px">Sort Browse by Reputation Index, or set a minimum. Counts are profiles in this prototype.</p>
          <div class="row pg-uses-chips"><button type="button" class="btn btn-sm" data-act="pg-browse-sort" data-sort="ris">Sort by Reputation Index</button>${risOpts.map(({ o, n }) => `<button type="button" class="chip" data-act="pg-browse-ris" data-v="${esc(o.v)}">${icon('filter')}${esc(RN.fields.risMin.label)} ${esc(o.l)} · ${RN.fmt.plural(n, 'profile')}</button>`).join('')}</div>
        </div>
        <div class="card">
          <span class="eyebrow">For operators</span>
          <h3 class="h3" style="margin-top:8px">Raise your score with client evidence</h3>
          <p class="small muted" style="margin-top:8px">Request CORE reviews from past clients and see points available for each signal in Studio.</p>
          <div class="row pg-uses-chips">${studioAsMatt(studioRoute(/cred/i), 'btn btn-sm', 'Open Credibility')}<a class="btn btn-line btn-sm" href="#join.operator">Apply to join</a></div>
        </div>
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
    const words = path.replace(/[._\-/]+/g, ' ').replace(/\b(op|browse|guide|blueprint|project|proof|studio)\b/gi, '').trim();
    const guesses = words.length > 2 ? RN.model.search({ q: words }).slice(0, 3).map((r) => r.op) : [];
    const places = [
      ['search', 'Browse talent', 'Open profiles, no login', 'browse'],
      ['briefcase', 'Post a project', 'Start from a Blueprint', 'projects'],
      ['chart', 'Insights', 'Research, rates and guides', 'insights'],
      ['users', 'For operators', 'Why join, and Studio', 'operators'],
      ['message', 'Talk to us', 'A person replies within one business day', 'talk'],
      ['home', 'Home', 'Start over', 'home'],
    ];
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
        ${guesses.length ? `<div class="pg-404-guess"><span class="label">Did you mean</span>${guesses.map((op) => `<a class="pg-rev-op" href="#op.${esc(op.slug)}">${RN.ui.avatar(op, 'ava-sm')}<span><b>${esc(op.name)}</b><span>Fractional ${esc(op.role)}</span></span>${icon('arrow')}</a>`).join('')}</div>` : ''}
        <div class="pg-404-grid">${places.map(([i, t, d, to]) => `<a class="card card-link pg-404-card" href="#${to}"><span class="pg-value-i">${icon(i)}</span><span><b>${esc(t)}</b><span>${esc(d)}</span></span>${icon('arrow')}</a>`).join('')}</div>
        <div class="pg-404-cats"><span class="label">Browse by role</span><div class="row" style="--gap:8px">${RN.fields.roleCategory.options.map((o) => `<a class="chip chip-sm" href="#browse.${esc(o.v)}">${RN.ui.catDot(o.v)}${esc(o.l)}</a>`).join('')}</div></div>
      </div>
    </section>`;
  }
  RN.submits['pg-404-search'] = (form, data) => goBrowse({ q: String(data.q || '').trim() });

  /* =====================================================================
     Register views
     ===================================================================== */
  RN.view('about', { route: 'about', nav: 'about', title: () => 'About', render: aboutView });
  RN.view('how', { route: 'how', nav: '', title: () => 'How it works', render: howView });
  RN.view('results', { route: 'results', nav: '', title: () => 'Results', render: resultsView });
  RN.view('talk', { route: 'talk', nav: '', chrome: 'over', footer: false, title: () => 'Talk to us', render: () => talkView(), mount: talkMount, unmount: talkUnmount });
  // Deep link that starts the flow with the need answered (#talk.pipeline): used by need tiles and zero-result states
  RN.view('talk-need', { route: 'talk.:need', nav: '', chrome: 'over', footer: false, samples: { need: 'pipeline' }, title: () => 'Talk to us', render: (p) => talkView(p), mount: talkMount, unmount: talkUnmount });
  RN.view('operators', { route: 'operators', nav: 'operators', title: () => 'For operators', render: operatorsView });
  RN.view('levels', { route: 'levels', nav: 'operators', title: () => 'Levels and the Reputation Index', render: levelsView });
  RN.view('notfound', { route: 'notfound', nav: '', title: () => 'Page not found', render: notFoundView });
})();
