/* Join: sign-up decision (#join), operator intake (#join.operator.<step>), after-submit landing (#join.done).

   Intake rules (Product Feedback Part A/B, SPEC section 4 "Join"):
   - The intake is the source of truth for every standard field (L207). Every structured answer renders
     through RN.w.field with RN.fields keys, so stored values match Browse filters, projects and Studio.
     Caps (industries, ranges, methodologies, fit tags, capacity) are read from the registry, never typed here.
   - Order: role category and title (L62) -> identity and location (LinkedIn first so the name fills in;
     Country -> Postal code -> derived city and time zone, L18/L63/L64; "Willing to work US time zone
     hours?" only outside the US, L54) -> company fit (revenue range, then GTM motion experience, L74;
     employee range; industries; primary CRM, asked of every role) -> role details (RN.fields.roleFields,
     optional and skippable in one click; methodology "Other" opens a suggestion field, L20)
     -> availability (new client capacity, L304/L505) -> fit tags (suggestions biased to the role category,
     L303) -> headline, bio ("2-3 sentences", L65), photo (L29), intro video with "Update video" (L30)
     -> review with an Edit button per section that returns here (L16, L113).
   - Each step has its own URL (#join.operator.1 ... #join.operator.7, #join.operator.review), so browser
     Back and Forward move one step. #join.operator resumes the draft at its saved step.
   - Autosaves to RN.store.state.signup on every change, so a reload keeps the step and the answers.
   - Submit saves the profile (registry keys) to RN.store.state.pending and lands on a page that explains
     the review honestly and when the profile shows in the directory (comment H328). */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const F = RN.fields;

  const TOTAL = 7;        // numbered steps; the review screen is step TOTAL + 1
  const REVIEW = TOTAL + 1;
  const OPTIONAL_STEP = 4; // role details: optional at application, skippable in one click
  const US = 'United States';
  let videoURL = null;    // object URL of a video picked this session (not persisted)
  let lastMounted = null; // last step mounted, to move focus to the new heading on step change

  /* ---------- Step copy ---------- */
  const STEPS = [
    null,
    { k: 'role', label: 'Role', title: 'What do you lead?', sub: 'Pick the discipline you lead and the highest title you have held in it. This sets where you appear in search.' },
    { k: 'you', label: 'About you', title: 'Who you are and where you work', sub: 'Clients see your city and time zone. We work both out from your postal code.' },
    { k: 'fit', label: 'Company fit', title: 'The companies you do your best work with', sub: 'Signed-in clients see Match Signals: how your revenue range, company size, GTM motion and industries line up with their company.' },
    { k: 'details', label: 'Role details', optional: true, title: 'Your operating range', sub: 'These fill the Operating range section of your profile and count toward a complete profile. Skip now and add them later in Studio.' },
    { k: 'avail', label: 'Availability', title: 'Availability and rate', sub: 'Clients filter by when you can start and how many hours you can give. You can change these any time in Studio.' },
    { k: 'tags', label: 'Fit tags', title: 'The problems you solve', sub: 'Fit tags are the specific problems you solve. Clients search and filter by them, and each tag turns Verified when a client review confirms it.' },
    { k: 'profile', label: 'Profile', title: 'How clients meet you', sub: 'Your headline and About are the first things clients read. Photo and video are optional, and you can add them later from Studio.' },
    { k: 'review', label: 'Review', title: 'Review your profile', sub: 'Check each section before you submit. Edit takes you straight to that section and back here.' },
  ];

  /* ---------- Step routes: #join.operator.1 ... #join.operator.7, #join.operator.review ---------- */
  const stepTok = (n) => (n >= REVIEW ? 'review' : String(n));
  const stepPath = (n) => 'join.operator.' + stepTok(n);
  const parseStep = (t) => (t === 'review' ? REVIEW : /^\d+$/.test(String(t)) ? RN.clamp(+t, 1, REVIEW) : 0);

  /* Role category cards: icon + one-line description (L62: "8 visual cards with icon + name + 1-line description") */
  const CAT_INFO = {
    sales_leadership: { i: 'trend-up', d: 'Own the number, build the team and the sales process.' },
    marketing: { i: 'megaphone', d: 'Build demand, brand and pipeline that sales can close.' },
    revenue_operations: { i: 'gear', d: 'Run the CRM, data, forecasting and GTM systems.' },
    sales_enablement: { i: 'book', d: 'Onboard, train and coach reps to reach quota faster.' },
    customer_success_growth: { i: 'heart', d: 'Keep customers, cut churn and grow expansion revenue.' },
    ai_gtm: { i: 'ai', d: 'Automate prospecting, routing and GTM workflows with AI.' },
    partnerships: { i: 'handshake', d: 'Build channel, technology and co-sell partner revenue.' },
    sellers: { i: 'briefcase', d: 'Carry a quota and close deals as an AE, SDR or AM.' },
  };

  /* ---------- Location: a small postal lookup for the prototype (the live build uses a postal directory) ---------- */
  const POSTAL = [
    { country: US, code: '06470', city: 'Newtown, CT', tz: 'Eastern Time (ET)' },
    { country: US, code: '10001', city: 'New York, NY', tz: 'Eastern Time (ET)' },
    { country: US, code: '02116', city: 'Boston, MA', tz: 'Eastern Time (ET)' },
    { country: US, code: '30309', city: 'Atlanta, GA', tz: 'Eastern Time (ET)' },
    { country: US, code: '60607', city: 'Chicago, IL', tz: 'Central Time (CT)' },
    { country: US, code: '78701', city: 'Austin, TX', tz: 'Central Time (CT)' },
    { country: US, code: '80202', city: 'Denver, CO', tz: 'Mountain Time (MT)' },
    { country: US, code: '94105', city: 'San Francisco, CA', tz: 'Pacific Time (PT)' },
    { country: US, code: '98101', city: 'Seattle, WA', tz: 'Pacific Time (PT)' },
    { country: 'Canada', code: 'M5V', prefix: true, city: 'Toronto, ON', tz: 'Eastern Time (ET)' },
    { country: 'United Kingdom', code: 'EC1A', prefix: true, city: 'London', tz: 'UK Time (GMT/BST)' },
    { country: 'Ireland', code: 'D02', prefix: true, city: 'Dublin', tz: 'Irish Time (GMT/IST)' },
    { country: 'Australia', code: '2000', city: 'Sydney, NSW', tz: 'Australian Eastern Time (AEST)' },
    { country: 'Germany', code: '10115', city: 'Berlin', tz: 'Central European Time (CET)' },
    { country: 'Netherlands', code: '1012', prefix: true, city: 'Amsterdam', tz: 'Central European Time (CET)' },
    { country: 'Singapore', code: '018956', city: 'Singapore', tz: 'Singapore Time (SGT)' },
    { country: 'Kenya', code: '00100', city: 'Nairobi', tz: 'East Africa Time (EAT)' },
    { country: 'India', code: '560001', city: 'Bengaluru', tz: 'India Standard Time (IST)' },
  ];
  const COUNTRY_TZ = { 'United Kingdom': 'UK Time (GMT/BST)', Ireland: 'Irish Time (GMT/IST)', Australia: 'Australian Eastern Time (AEST)', Germany: 'Central European Time (CET)', Netherlands: 'Central European Time (CET)', Singapore: 'Singapore Time (SGT)', Kenya: 'East Africa Time (EAT)', India: 'India Standard Time (IST)' };
  const normPostal = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  function locate(d) {
    const country = d.country, code = normPostal(d.postalCode);
    if (!country || !code) return { city: '', tz: '', found: false, code };
    const hit = POSTAL.find((p) => p.country === country && (code === p.code || (p.prefix && code.startsWith(p.code))));
    if (hit) return { city: hit.city, tz: hit.tz, found: true, code };
    let tz = COUNTRY_TZ[country] || '';
    if (country === US && /^\d/.test(code)) tz = ['Eastern Time (ET)', 'Eastern Time (ET)', 'Eastern Time (ET)', 'Eastern Time (ET)', 'Eastern Time (ET)', 'Central Time (CT)', 'Central Time (CT)', 'Central Time (CT)', 'Mountain Time (MT)', 'Pacific Time (PT)'][+code[0]];
    if (country === 'Canada') { const c = code[0]; tz = 'ABCE'.includes(c) ? 'Atlantic Time (AT)' : 'R'.includes(c) ? 'Central Time (CT)' : 'ST'.includes(c) ? 'Mountain Time (MT)' : 'V'.includes(c) ? 'Pacific Time (PT)' : 'Eastern Time (ET)'; }
    return { city: '', tz, found: false, code };
  }
  function place(d) {
    const loc = locate(d);
    const city = loc.found ? loc.city : String(d.city || '').trim();
    if (!city) return '';
    return d.country && d.country !== US && !city.includes(d.country) ? `${city}, ${d.country}` : city;
  }

  /* ---------- Draft (RN.store.state.signup) ---------- */
  function draft() {
    let s = RN.store.state.signup;
    if (!s || !s.data) {
      s = { step: 1, visited: 1, data: { country: US }, startedAt: RN.now().toISOString(), tried: {} };
      RN.store.state.signup = s;
      RN.store.save();
    }
    s.tried = s.tried || {};
    return s;
  }
  const hasDraft = () => { const s = RN.store.state.signup; return !!(s && s.data && Object.keys(s.data).some((k) => k !== 'country' && !empty(s.data[k]))); };
  const empty = (v) => v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');
  // GTM motion (L74) and primary CRM are asked of every role in Company fit, so the role step skips them
  // once answered. RevOps lists crm in its role fields; it is never asked twice.
  const detailKeys = (cat, d) => (F.roleFields[cat] || []).filter((k) => k !== 'salesMotions' && !(k === 'crm' && d && !empty(d.crm)));
  const detailCount = (d) => detailKeys(d.roleCategory, d).filter((k) => !empty(d[k])).length;
  const catLabel = (cat) => F.catLabel(cat);
  const maxOf = (key) => F[key].max;
  const isNum = (key) => ['number', 'money'].includes(F[key].type);

  /* LinkedIn URL -> "First Last" when the profile slug holds a name (linkedin.com/in/nina-alvarez-gtm) */
  function nameFromLinkedIn(url) {
    const m = String(url || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
    if (!m) return '';
    let slug = m[1];
    try { slug = decodeURIComponent(slug); } catch (e) { /* keep raw */ }
    const words = slug.split(/[-_.]+/).filter((w) => /^[a-z]{2,}$/i.test(w));
    if (words.length < 2) return '';
    return words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  /* ---------- Dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const mdy = (s) => { const d = parseDay(s); return d ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` : ''; }; // L52: month / day / year
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const addBiz = (d, n) => { const x = new Date(d); while (n > 0) { x.setDate(x.getDate() + 1); const g = x.getDay(); if (g !== 0 && g !== 6) n--; } return x; };
  const dayName = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const START_OFFSET = { available_now: 0, available_2_weeks: 14, available_2_plus_weeks: 30 };

  /* ---------- Validation ---------- */
  function defaultMsg(key) {
    const t = (RN.fields[key] || {}).type;
    if (t === 'multi' || t === 'tags' || t === 'tagsearch' || (t === 'optcards' && RN.fields[key].multi)) return 'Pick at least one';
    if (t === 'single' || t === 'select' || t === 'optcards') return 'Pick one';
    return 'Required';
  }
  function errorsFor(n, d) {
    const e = {};
    const need = (k, msg) => { if (empty(d[k])) e[k] = msg || defaultMsg(k); };
    const inRange = (k) => {
      const f = F[k];
      if (empty(d[k])) return;
      const v = +d[k];
      const lo = f.min != null ? f.min : 0;
      const hi = f.type === 'number' && f.max != null ? f.max : null;
      if (isNaN(v) || v < lo || (hi != null && v > hi)) e[k] = hi != null ? `Enter a number from ${RN.fmt.int(lo)} to ${RN.fmt.int(hi)}` : `Enter ${f.type === 'money' ? RN.fmt.usd(lo) : RN.fmt.int(lo)} or more`;
    };
    if (n === 1) {
      need('roleCategory', 'Pick the discipline you lead');
      if (d.roleCategory) need('role', 'Pick your highest title in this category');
    }
    if (n === 2) {
      need('fullName', 'Add your first and last name');
      if (!e.fullName && String(d.fullName).trim().split(/\s+/).length < 2) e.fullName = 'Add your first and last name';
      need('email', 'Add your work email');
      if (!e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email).trim())) e.email = 'Check the email address';
      need('linkedin', 'Add your LinkedIn profile URL');
      if (!e.linkedin && !/linkedin\.com\//i.test(d.linkedin)) e.linkedin = 'Use your LinkedIn profile URL (linkedin.com/in/…)';
      need('country', 'Pick a country');
      need('postalCode', 'Add your postal code');
      if (!e.postalCode && d.country && !locate(d).found && empty(d.city)) e.city = 'Add your city';
      if (d.country && d.country !== US) need('usHours', 'Pick yes or no');
    }
    // Registry caps (a draft saved before a cap changed can hold more than the cap allows)
    const capped = (k) => { const max = maxOf(k); if (!e[k] && max && Array.isArray(d[k]) && d[k].length > max) e[k] = `Pick up to ${max}`; };
    if (n === 3) ['revenueRange', 'salesMotions', 'employeeRange', 'industries', 'crm'].forEach((k) => { need(k); capped(k); });
    // Role details are optional at application: only check that numbers are in range and picks within caps
    if (n === OPTIONAL_STEP) detailKeys(d.roleCategory, d).forEach((k) => { if (isNum(k)) inRange(k); else capped(k); });
    if (n === 5) {
      ['availability', 'hoursPerMonth', 'engagementTypes'].forEach((k) => need(k));
      const cap = F.newClientCapacity;
      need('newClientCapacity', 'Add how many new clients you can take on');
      if (!e.newClientCapacity && !(Number.isInteger(+d.newClientCapacity) && +d.newClientCapacity >= cap.min && +d.newClientCapacity <= cap.max)) e.newClientCapacity = `Enter a whole number from ${cap.min} to ${cap.max}`;
      need('rate', 'Add your hourly rate');
      inRange('rate');
    }
    if (n === 6) {
      if ((d.fitTags || []).length < 3) e.fitTags = 'Add at least 3 fit tags. 10 or more gets you found for more searches.';
      else if ((d.fitTags || []).length > maxOf('fitTags')) e.fitTags = `Keep up to ${maxOf('fitTags')} fit tags`;
    }
    if (n === 7) {
      need('headline', 'Add a one-line headline');
      need('bio', 'Add 2 to 3 sentences about your work');
      if (!e.bio && String(d.bio).trim().length < 60) e.bio = 'Add 2 to 3 sentences (at least 60 characters)';
    }
    return e;
  }
  function showErrors(root, errs) {
    RN.$$('.field.jn-bad', root).forEach((f) => { f.classList.remove('jn-bad'); const p = f.querySelector(':scope > .err'); if (p) p.remove(); });
    Object.keys(errs).forEach((k) => {
      const f = root.querySelector(`.field[data-field="${k}"]`);
      if (!f) return;
      f.classList.add('jn-bad');
      f.insertAdjacentHTML('beforeend', `<p class="err">${icon('info')}<span>${esc(errs[k])}</span></p>`);
    });
  }
  const firstBadStep = (d) => { for (let n = 1; n <= TOTAL; n++) if (Object.keys(errorsFor(n, d)).length) return n; return 0; };

  /* ---------- Display values (review, preview card, emails) ---------- */
  function val(key, v) {
    const f = RN.fields[key];
    if (!f || empty(v)) return '';
    switch (f.type) {
      case 'money': return key === 'rate' ? RN.fmt.rate(+v) : RN.fmt.usd(+v);
      case 'number': return RN.fmt.int(+v) + (f.unit ? (f.unit[0] === '%' ? '' : ' ') + f.unit : '');
      case 'date': return mdy(v);
      case 'multi': case 'tags': case 'tagsearch': return RN.w.labels(key, [].concat(v));
      case 'optcards': return f.multi ? RN.w.labels(key, [].concat(v)) : RN.w.label(key, v);
      default: return RN.w.label(key, v);
    }
  }
  const hoursShort = (code) => (code === '19' ? '<20' : code || '');
  const fakeOp = (d) => ({
    name: d.fullName || 'Your name', initials: RN.fmt.initials(d.fullName || 'Y N'), photo: d.photo || '',
    avail: { key: d.availability, label: d.availability ? RN.w.label('availability', d.availability) : 'Availability not set', hours: hoursShort(d.hoursPerMonth) },
    ris: { score: 50, label: 'Vetted' },
  });
  function previewCard(d) {
    const op = fakeOp(d);
    const tags = (d.fitTags || []).map((t) => ({ t, tier: 'claimed' }));
    const loc = place(d);
    return `<article class="opc jn-prev" aria-label="Preview of your operator card">
      <div class="opc-top">${RN.ui.avatar(op, 'ava-md')}
        <div class="grow"><h3 class="opc-name">${esc(op.name)}</h3><div class="opc-role">${d.role ? 'Fractional ' + esc(d.role) : esc(d.roleCategory ? catLabel(d.roleCategory) : 'Your role')}</div></div>
      </div>
      <p class="opc-head clamp-2 serif-up ${d.headline ? '' : 'muted'}">${esc(d.headline || 'Your headline shows here.')}</p>
      ${tags.length ? RN.ui.ftags(tags, 3) : ''}
      <div class="opc-meta">
        <span>${RN.ui.avail(op)}</span>
        ${d.rate ? `<span>${icon('clock')}${esc(RN.fmt.rate(+d.rate))}</span>` : ''}
        ${loc ? `<span>${icon('pin')}${esc(loc)}</span>` : ''}
      </div>
      <div class="opc-foot">${RN.ui.ris(op)}<span class="pill pill-line">Preview</span></div>
    </article>`;
  }

  /* ---------- Shared intake chrome ---------- */
  function stepSummary(n, d) {
    if (n === 1) return d.role ? d.role : d.roleCategory ? catLabel(d.roleCategory) : '';
    if (n === 2) return place(d) || d.fullName || '';
    if (n === 3) return (d.revenueRange || []).length ? RN.w.labels('revenueRange', d.revenueRange) : '';
    if (n === 4) { const c = d.roleCategory ? detailCount(d) : 0; return c ? `${c} of ${detailKeys(d.roleCategory, d).length} added` : 'Optional'; }
    if (n === 5) return d.rate ? `${RN.fmt.rate(+d.rate)} · ${RN.w.label('availability', d.availability)}` : '';
    if (n === 6) return (d.fitTags || []).length ? RN.fmt.plural(d.fitTags.length, 'tag') : '';
    if (n === 7) return d.headline ? 'Headline and About added' : '';
    return '';
  }
  function rail(s) {
    const d = s.data;
    return `<aside class="jn-rail" aria-label="Application steps">
      <span class="eyebrow">Operator application</span>
      <p class="jn-rail-sub">About 8 minutes. Saved as you go.</p>
      <ol class="jn-steps">
        ${STEPS.slice(1).map((st, i) => {
          const n = i + 1;
          const on = s.step === n;
          const done = n < REVIEW && !on && n <= (s.visited || 1) && !Object.keys(errorsFor(n, d)).length;
          const can = n <= (s.visited || 1);
          const sum = can ? stepSummary(n, d) : st.optional ? 'Optional' : '';
          return `<li class="${on ? 'on' : done ? 'done' : ''}"><button type="button" data-act="join-goto" data-step="${n}" ${can ? '' : 'disabled'} ${on ? 'aria-current="step"' : ''}>
            <span class="jn-num">${done ? icon('check') : n === REVIEW ? icon('eye') : n}</span>
            <span class="jn-step-l">${esc(st.label)}${sum && n < REVIEW ? `<small>${esc(sum)}</small>` : ''}</span></button></li>`;
        }).join('')}
      </ol>
      <div class="jn-rail-foot">
        <p class="tiny muted">${icon('lock')}Your draft is saved in this browser until you submit.</p>
        <button type="button" class="act muted" data-act="join-restart">${icon('refresh')}Start over</button>
      </div>
    </aside>`;
  }
  function topBar(s) {
    const isReview = s.step === REVIEW;
    return `<div class="jn-top">
      <span class="step-count">${isReview ? 'Last step · Review' : `Step ${s.step} of ${TOTAL}${STEPS[s.step].optional ? ' · Optional' : ''}`}</span>
      <span class="jn-saved" data-jn-saved>${icon('check-circle')}<span>Draft saved</span></span>
      ${isReview ? `<button type="button" class="act muted" data-act="join-restart">${icon('refresh')}Start over</button>` : `<button type="button" class="act" data-act="join-sample">${icon('bolt')}Fill sample answers</button>`}
    </div>
    <div class="stepper" aria-hidden="true">${Array.from({ length: TOTAL }, (_, i) => `<i class="${i < Math.min(s.step, TOTAL) ? 'on' : ''}"></i>`).join('')}</div>`;
  }
  function foot(s, primary, extra) {
    const back = s.returnTo === 'review' ? '' : `<button type="button" class="btn btn-line jn-back" data-act="join-back" aria-label="Back to the previous step">${icon('arrow-left')}<span>Back</span></button>`;
    return `<div class="jn-foot">${back}<span class="grow"></span>${extra || ''}${primary}</div>`;
  }

  /* ---------- Step bodies ---------- */
  function roleSelect(d) {
    const allowed = (RN.fields.rolesByCat[d.roleCategory] || []).map(esc);
    const html = RN.w.field('role', d.role || '', { help: `Your highest title in ${catLabel(d.roleCategory || '')}.` });
    // Only titles for the chosen category (L62: "grouped and only showing relevant titles")
    return html.replace(/<option value="([^"]*)"[^>]*>[^<]*<\/option>/g, (m, v) => (v === '' || allowed.includes(v) ? m : ''));
  }
  function locBox(d) {
    const loc = locate(d);
    if (!d.country || !loc.code) return `<p class="jn-loc-hint small muted">${icon('pin')}<span>Try 80202, 10001 or 94105 to see your city and time zone fill in.</span></p>`;
    if (loc.found) return `<div class="jn-loc ok">${icon('pin')}<div><b>${esc(loc.city)}</b><span>${esc(loc.tz)}</span></div><span class="jn-loc-src">From ${esc(d.postalCode.trim().toUpperCase())}</span></div>`;
    return `<div class="jn-loc miss">${icon('info')}<div><b>We could not match ${esc(d.postalCode.trim().toUpperCase())} to a city</b><span>${loc.tz ? `Time zone: ${esc(loc.tz)}. ` : ''}Add your city below.</span></div></div>`;
  }
  function counted(key, v, opts) {
    const max = RN.fields[key].maxlength;
    return `<div class="jn-counted">${RN.w.field(key, v, opts)}<span class="jn-count" data-jn-count="${key}">${String(v || '').length} / ${max}</span></div>`;
  }
  function rateHint(d) {
    const idx = RN.data.market.rateIndex.byCat[d.roleCategory] || RN.data.market.rateIndex.byCat.sales_leadership;
    const cat = catLabel(d.roleCategory || 'sales_leadership');
    const lo = Math.round(idx.p25 * 0.6), hi = Math.round(idx.p75 * 1.35);
    const pct = (v) => RN.clamp(((v - lo) / (hi - lo)) * 100, 0, 100).toFixed(1) + '%';
    const rate = +d.rate || 0;
    const where = !rate ? '' : rate < idx.p25 ? 'below the middle half' : rate > idx.p75 ? 'above the middle half' : 'inside the middle half';
    const hrs = +d.hoursPerMonth || 0;
    const monthly = rate && hrs ? Math.round((rate * (hrs === 19 ? 15 : hrs)) / 100) * 100 : 0;
    return `<div class="jn-rate">
      <div class="jn-rate-hd"><span class="label">Rate Index · ${esc(cat)}</span>${RN.ui.illus()}</div>
      <div class="jn-rbar" role="img" aria-label="Middle half of rates ${RN.fmt.usd(idx.p25)} to ${RN.fmt.usd(idx.p75)}, median ${RN.fmt.usd(idx.p50)}">
        <i class="band" style="left:${pct(idx.p25)};right:calc(100% - ${pct(idx.p75)})"></i>
        <i class="med" style="left:${pct(idx.p50)}"></i>
        ${rate ? `<i class="you" style="left:${pct(rate)}"></i>` : ''}
      </div>
      <p class="small">Middle half <b>${RN.fmt.usd(idx.p25)} to ${RN.fmt.usd(idx.p75)}/hr</b>, median <b>${RN.fmt.usd(idx.p50)}/hr</b>.${rate ? ` Your ${esc(RN.fmt.rate(rate))} sits ${where}.` : ''}${monthly ? ` At ${esc(RN.w.label('hoursPerMonth', d.hoursPerMonth))} that is about ${RN.fmt.usd(monthly)}/mo take-home (clients pay ${esc(RN.fmt.rate(Math.round(rate / 0.75)))} all-in).` : ''}</p>
    </div>`;
  }
  function demandStrip(d) {
    if (!d.roleCategory) return '';
    const have = new Set((d.fitTags || []).map((t) => t.toLowerCase()));
    const rows = RN.model.market().tags.filter((t) => t.c === d.roleCategory && !have.has(String(t.t).toLowerCase())).sort((a, b) => b.demand - a.demand).slice(0, 6);
    if (!rows.length) return '';
    return `<div class="jn-demand">
      <div class="jn-demand-hd"><span class="label">${icon('trend-up')}In demand in ${esc(catLabel(d.roleCategory))}</span><span class="jn-demand-src"><span class="tiny muted">Client searches, last 30 days</span>${RN.ui.illus()}</span></div>
      <div class="chipset">${rows.map((t) => `<button type="button" class="chip chip-sm" data-act="join-tag-demand" data-t="${esc(t.t)}">${icon('plus')}${esc(t.t)}<span class="jn-demand-n">${RN.fmt.int(t.demand)}</span></button>`).join('')}</div>
    </div>`;
  }
  function mediaStep(d) {
    const first = RN.fmt.first(d.fullName || '') || 'you';
    const op = fakeOp(d);
    const v = d.video;
    const dur = v && v.duration ? `${Math.floor(v.duration / 60)}:${pad(v.duration % 60)}` : '';
    const photo = `<div class="jn-mcard">
      <div class="jn-mcard-hd"><b>Profile photo</b><span class="opt">Optional</span></div>
      <div class="jn-photo">
        ${RN.ui.avatar(op, 'ava-lg')}
        <div class="stack" style="--gap:10px">
          <p class="small muted">A clear, recent headshot. It shows on your card in search and on your profile.</p>
          <div class="row" style="--gap:10px">
            <label class="btn btn-line btn-sm">${icon('upload')}${d.photo ? 'Replace photo' : 'Upload photo'}<input type="file" accept="image/*" class="sr-only" data-change="join-photo"></label>
            ${d.photo ? `<button type="button" class="act muted" data-act="join-photo-remove">Remove</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;
    const frame = v
      ? `<div class="jn-vid">
          <span class="jn-vid-t">Meet ${esc(first)}</span>
          ${videoURL ? `<button type="button" class="jn-vid-play" data-act="join-video-play" aria-label="Play your intro video">${icon('play')}</button>` : `<span class="jn-vid-play is-static" aria-hidden="true">${icon('video')}</span>`}
          ${dur ? `<span class="jn-vid-dur">${dur}</span>` : ''}
        </div>
        <p class="tiny muted jn-vid-name">${icon('check-circle')}<span>${esc(v.name)}</span></p>
        <div class="row" style="--gap:10px">
          <label class="btn btn-line btn-sm">${icon('refresh')}Update video<input type="file" accept="video/*" class="sr-only" data-change="join-video"></label>
          <button type="button" class="act muted" data-act="join-video-remove">Remove</button>
        </div>`
      : `<div class="jn-vid is-empty">${icon('video')}<span>60 to 90 seconds on who you help and how</span></div>
        ${d.videoLater ? `<p class="small jn-later">${icon('clock')}<span>Noted. Studio will remind you to add it once your profile is live.</span></p>` : ''}
        <div class="row" style="--gap:10px">
          <label class="btn btn-line btn-sm">${icon('upload')}Upload video<input type="file" accept="video/*" class="sr-only" data-change="join-video"></label>
          ${d.videoLater ? '' : `<button type="button" class="act" data-act="join-video-later">Record later</button>`}
        </div>`;
    const video = `<div class="jn-mcard">
      <div class="jn-mcard-hd"><b>Intro video</b><span class="opt">Optional</span></div>
      ${frame}
      <p class="tiny muted">Shown as “Meet ${esc(first)}” on your profile, so clients hear how you work before an intro call.</p>
    </div>`;
    return `<div class="jn-media">${photo}${video}</div>`;
  }

  function stepBody(n, d) {
    const f = (k, o) => RN.w.field(k, d[k] == null ? (['multi', 'tags', 'tagsearch'].includes(F[k].type) ? [] : '') : d[k], o);
    if (n === 1) {
      const app = latestApp();
      const again = app && app.status === 'in_review' && !hasDraft();
      return `${again ? `<p class="note info jn-again">${icon('info')}<span>Your application from ${esc(RN.fmt.date(new Date(app.submittedAt)))} is in review. This starts a new one. <a class="link" href="#join.done">See its status</a></span></p>` : ''}
        ${f('roleCategory', { help: '' })}
        <div data-jn-role ${d.roleCategory ? '' : 'hidden'}>${d.roleCategory ? roleSelect(d) : ''}</div>`;
    }
    if (n === 2) {
      const loc = locate(d);
      return `${f('linkedin', { help: 'We fill in your name from it. The team uses it to check your work history.' })}
        <div class="jn-2">${f('fullName')}${f('email', { help: 'We send your review status here.' })}</div>
        <div class="jn-group">
          <div class="jn-2">${f('country', { help: '' })}${f('postalCode', { help: '' })}</div>
          <div data-jn-loc>${locBox(d)}</div>
          <div class="field" data-field="city" data-jn-city ${d.postalCode && d.country && !loc.found ? '' : 'hidden'}>
            <label for="f-city">${esc(F.city.label)}</label>
            <input class="input" id="f-city" name="city" value="${esc(d.city || '')}" placeholder="e.g. Newtown" autocomplete="address-level2">
          </div>
          <div data-jn-ush ${d.country && d.country !== US ? '' : 'hidden'}>${f('usHours', { help: '' })}</div>
        </div>
        <p class="small muted jn-help">${icon('lock')}Your postal code is never shown. Clients see your city and time zone.</p>`;
    }
    if (n === 3) return `${f('revenueRange')}
      ${f('salesMotions', { help: 'Pick every motion you have run. Clients who name a motion see it in Match Signals.' })}
      ${f('employeeRange')}
      ${f('industries')}
      ${f('crm', { help: 'The CRM you have worked in most.' })}`;
    if (n === OPTIONAL_STEP) {
      if (!d.roleCategory) return RN.ui.empty({ icon: 'user', title: 'Pick your role first', body: 'Role details depend on the discipline you lead.', cta: '<button type="button" class="btn btn-line btn-sm" data-act="join-goto" data-step="1">Go to Role</button>' });
      const methods = [].concat(d.methodologies || []);
      return `<div class="jn-cat-tag">${RN.ui.catDot(d.roleCategory)}<span>${esc(catLabel(d.roleCategory))}${d.role ? ' · ' + esc(d.role) : ''}</span></div>
        ${detailKeys(d.roleCategory, d).map((k) => k === 'methodologies'
          ? `${f(k)}<div class="field jn-other" data-field="methodologyOther" data-jn-other ${methods.includes('Other') ? '' : 'hidden'}>
              <label for="f-methodologyOther">Which other methodology? <span class="opt">Optional</span></label>
              <input class="input" id="f-methodologyOther" name="methodologyOther" value="${esc(d.methodologyOther || '')}" placeholder="e.g. Command of the Message">
              <p class="help">A suggestion for our list. It does not appear on your profile.</p></div>`
          : f(k)).join('').replace(/ <span class="opt">Optional<\/span>/g, '')}`;
    }
    if (n === 5) return `${f('availability')}
      <div class="jn-2">${f('startDate', { help: 'Filled in from your availability. Change it if you know the date.' })}${f('newClientCapacity')}</div>
      ${f('hoursPerMonth')}
      <div class="jn-eng">${f('engagementTypes', { help: '' })}
        <dl class="jn-legend">${F.engagementTypes.options.map((o) => `<div><dt>${esc(o.l)}</dt><dd>${esc(o.d || '')}</dd></div>`).join('')}</dl></div>
      <div class="jn-group">${f('rate', { help: 'Shown to signed-in clients and used in the Rate Index. Whole dollars.' })}<div data-jn-rate>${rateHint(d)}</div></div>`;
    if (n === 6) {
      const n6 = (d.fitTags || []).length;
      return `<div class="note info jn-tagnote">${icon('seal')}<div><b>How fit tags work.</b> Add up to ${maxOf('fitTags')} self-claimed tags. Clients see them as focus areas. A tag turns <b>Verified</b> when a client review rated 4.0 or higher confirms it, and verified tags rank first.</div></div>
        ${demandStrip(d)}
        ${RN.w.field('fitTags', d.fitTags || [], { cat: d.roleCategory || '', help: 'Suggestions start with your role category. Search the library, or type your own tag.' })}
        <div class="jn-tagmeter"><div class="meter"><i style="width:${Math.min(100, (n6 / 10) * 100)}%"></i></div><span class="small ${n6 >= 10 ? 'accent' : 'muted'}" data-jn-tagmsg>${n6 >= 10 ? 'Strong: 10+ tags gets you found for more searches.' : `${n6} added. 10 or more gets you found for more searches.`}</span></div>`;
    }
    if (n === 7) return `${counted('headline', d.headline)}
      ${counted('bio', d.bio, { help: '2-3 sentences describing who you help, what you build and the result. Write in first person.' })}
      ${mediaStep(d)}`;
    return '';
  }

  /* ---------- Review ---------- */
  function reviewSections(d) {
    const row = (key, label) => ({ label: label || F[key].label, v: val(key, d[key]), key });
    const loc = locate(d);
    const dk = d.roleCategory ? detailKeys(d.roleCategory, d) : [];
    const skipped = !dk.some((k) => !empty(d[k]));
    const secs = [
      { n: 1, rows: [row('roleCategory'), row('role')] },
      { n: 2, rows: [row('fullName'), row('email'), { label: F.linkedin.label, v: d.linkedin || '', wide: true }, { label: 'Location', v: place(d) }, { label: 'Time zone', v: loc.tz }].concat(d.country && d.country !== US ? [row('usHours', 'US time zone support')] : []) },
      { n: 3, rows: [row('revenueRange'), row('salesMotions'), row('employeeRange'), row('crm'), Object.assign(row('industries'), { wide: true })] },
      { n: 4, rows: !d.roleCategory ? [{ label: 'Role details', v: '', optional: true, wide: true }]
        : skipped ? [{ label: 'Role details', v: 'Skipped for now. Add them in Studio once your profile is live.', wide: true }]
          : dk.map((k) => Object.assign(row(k), { optional: true })).concat((d.methodologies || []).includes('Other') && d.methodologyOther ? [{ label: 'Suggested methodology', v: d.methodologyOther, optional: true }] : []) },
      { n: 5, rows: [row('availability'), row('startDate'), row('hoursPerMonth'), row('newClientCapacity'), row('engagementTypes'), row('rate')].map((r) => (r.key === 'startDate' ? Object.assign(r, { optional: true }) : r)) },
      { n: 6, rows: [{ label: `${F.fitTags.label} (${(d.fitTags || []).length} of ${maxOf('fitTags')})`, html: (d.fitTags || []).length ? RN.ui.ftags(d.fitTags.map((t) => ({ t, tier: 'claimed' }))) : '', wide: true }] },
      { n: 7, rows: [Object.assign(row('headline'), { wide: true }), Object.assign(row('bio'), { wide: true, prose: true }), { label: 'Profile photo', v: d.photo ? 'Added' : 'Not added yet', optional: true }, { label: 'Intro video', v: d.video ? 'Added' : d.videoLater ? 'Recording later' : 'Not added yet', optional: true }] },
    ];
    return secs.map((sec) => {
      const errs = errorsFor(sec.n, d);
      const bad = Object.keys(errs).length > 0;
      const opt = STEPS[sec.n].optional;
      const editL = opt && skipped ? 'Add' : 'Edit';
      return `<section class="jn-rev ${bad ? 'is-bad' : ''}" aria-labelledby="jn-rev-${sec.n}">
        <div class="jn-rev-hd">
          <div><span class="label">Step ${sec.n}${opt ? ' · Optional' : ''}</span><h2 class="h4" id="jn-rev-${sec.n}">${esc(STEPS[sec.n].label)}${sec.n === OPTIONAL_STEP && d.roleCategory ? ` <span class="muted jn-rev-cat">· ${esc(catLabel(d.roleCategory))}</span>` : ''}</h2></div>
          <button type="button" class="btn btn-line btn-sm" data-act="join-edit" data-step="${sec.n}" aria-label="${editL} ${esc(STEPS[sec.n].label)}">${icon(editL === 'Add' ? 'plus' : 'edit')}${editL}</button>
        </div>
        ${bad ? `<p class="jn-rev-warn">${icon('info')}<span>${esc(Object.values(errs)[0])}${Object.keys(errs).length > 1 ? ` and ${Object.keys(errs).length - 1} more` : ''}.</span></p>` : ''}
        <dl class="jn-dl">${sec.rows.map((r) => `<div class="${r.wide ? 'wide' : ''}"><dt>${esc(r.label)}</dt><dd class="${r.prose ? 'jn-prose' : ''}">${r.html ? r.html : r.v ? esc(r.v) : r.optional ? '<span class="muted">Not added</span>' : `<span class="jn-missing">${icon('info')}Missing</span>`}</dd></div>`).join('')}</dl>
      </section>`;
    }).join('');
  }
  function renderReview(s) {
    const d = s.data;
    const bad = firstBadStep(d);
    return `${topBar(s)}
      <header class="jn-head"><h1 class="h2" tabindex="-1">${esc(STEPS[REVIEW].title)}</h1><p class="lede">${esc(STEPS[REVIEW].sub)}</p></header>
      <div class="jn-rev-grid">
        <div class="jn-rev-list">${reviewSections(d)}</div>
        <aside class="jn-rev-side">
          <span class="label">Your card in search, once approved</span>
          ${previewCard(d)}
          <div class="card-flat jn-after">
            <b class="h5">After you submit</b>
            <ol>
              <li>A person on the team checks your LinkedIn and work history within 2 business days.</li>
              <li>If something needs a change, we email you what to fix. Your profile stays hidden until it is approved.</li>
              <li>Once approved, it goes live at Reputation Index 50, tier Vetted, and Studio starts tracking who views it.</li>
            </ol>
          </div>
        </aside>
      </div>
      ${foot(s, `${bad ? `<span class="small muted jn-submit-note" id="jn-submit-note">${icon('info')}Some answers are missing. Submit takes you to the first one.</span>` : ''}<button type="button" class="btn" data-act="join-submit" ${bad ? 'aria-describedby="jn-submit-note"' : ''}>${icon('send')}Submit profile</button>`)}`;
  }

  /* ---------- Operator intake view ---------- */
  /* The URL names the step (#join.operator.3). A step not reached yet falls back to the furthest one
     reached, and #join.operator resumes the saved step; mount then rewrites the URL to match. */
  function syncStep(params) {
    const s = draft();
    const asked = params && params.step != null ? parseStep(params.step) : 0;
    let n = asked || s.step || 1;
    n = RN.clamp(Math.min(n, s.visited || 1), 1, REVIEW);
    s.step = n;
    // "Save and review" only applies on the step opened from Review's Edit button
    if (s.returnTo && s.returnStep !== n) { s.returnTo = null; s.returnStep = null; }
    RN.store.save();
    return s;
  }
  function renderFlow(params) {
    const s = syncStep(params);
    const d = s.data;
    const st = STEPS[s.step];
    let main;
    if (s.step === REVIEW) main = renderReview(s);
    else {
      const title = s.step === OPTIONAL_STEP && d.roleCategory ? `Your ${catLabel(d.roleCategory)} operating range` : st.title;
      const primary = s.returnTo === 'review'
        ? `<button type="submit" class="btn">${icon('check')}Save and review</button>`
        : `<button type="submit" class="btn">${s.step === TOTAL ? 'Review profile' : 'Continue'}${icon('arrow')}</button>`;
      const skip = st.optional && d.roleCategory ? `<button type="button" class="btn btn-ghost jn-skip" data-act="join-skip">Skip this step</button>` : '';
      main = `${topBar(s)}
        <header class="jn-head">
          <div class="jn-head-k"><span class="eyebrow">${esc(st.label)}</span>${st.optional ? `<span class="pill pill-line">Optional</span>${skip ? '<button type="button" class="act jn-skip-top" data-act="join-skip">Skip this step' + icon('arrow') + '</button>' : ''}` : ''}</div>
          <h1 class="h2" tabindex="-1">${esc(title)}</h1><p class="lede">${esc(st.sub)}</p>
        </header>
        <form id="jn-form" class="jn-form" data-submit="join-next" data-change="join-save" data-input="join-save" novalidate autocomplete="on">
          ${stepBody(s.step, d)}
          ${foot(s, primary, skip)}
        </form>`;
    }
    return `<div class="wrap jn-flow">${rail(s)}<section class="jn-main ${s.step === REVIEW ? 'is-review' : ''}" data-jn-step="${s.step}">${main}</section></div>`;
  }

  function enhanceCats(root) {
    RN.$$('.field[data-field="roleCategory"] > .chipset > .chip', root).forEach((b) => {
      const info = CAT_INFO[b.dataset.v];
      if (!info || b.dataset.jnEnh) return;
      b.dataset.jnEnh = '1';
      const label = b.textContent.trim();
      b.innerHTML = `<span class="jn-cat-ico" style="--cc:${RN.fields.catColor(b.dataset.v)}">${icon(info.i)}</span><span class="jn-cat-l">${esc(label)}</span><span class="jn-cat-d">${esc(info.d)}</span><span class="jn-cat-ok" aria-hidden="true">${icon('check')}</span>`;
    });
  }

  function mountFlow(root) {
    enhanceCats(root);
    const s = RN.store.state.signup;
    // Keep the URL on the step shown (resume from #join.operator, or a step not reached yet)
    if (s && RN.path() !== stepPath(s.step)) history.replaceState(history.state, '', '#' + stepPath(s.step));
    // A new step moves focus to its heading, so keyboard and screen reader users start at the top
    if (s && lastMounted !== null && lastMounted !== s.step) { const h = root.querySelector('.jn-head h1'); if (h) h.focus({ preventScroll: true }); }
    lastMounted = s ? s.step : null;
    const form = root.querySelector('#jn-form');
    if (!form) return;
    // Enter in a tag search adds the top suggestion instead of submitting the step
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('.tagpick-search input')) return;
      e.preventDefault();
      const b = e.target.closest('[data-tagpick]').querySelector('.tagpick-list [data-act="w-tag-add"]');
      if (b) b.click();
    });
    if (s && s.tried && s.tried[s.step]) showErrors(form, errorsFor(s.step, s.data));
  }

  /* ---------- Autosave and live updates ---------- */
  let savedTimer = null;
  function flashSaved() {
    const el = RN.$('[data-jn-saved]');
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    el.querySelector('span').textContent = 'Saved just now';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { const x = RN.$('[data-jn-saved] span'); if (x) x.textContent = 'Draft saved'; }, 2400);
  }
  RN.inputs['join-save'] = (form, ev) => {
    const s = draft();
    const d = s.data;
    Object.assign(d, RN.ui.formData(form));
    const name = ev && ev.target && ev.target.name;
    if (name === 'roleCategory') {
      const roles = RN.fields.rolesByCat[d.roleCategory] || [];
      if (d.role && !roles.includes(d.role)) d.role = '';
      if (!d.role && roles.length === 1) d.role = roles[0]; // one title in the category: prefill it
      const box = form.querySelector('[data-jn-role]');
      if (box) {
        const reveal = box.hidden && d.roleCategory;
        box.innerHTML = roleSelect(d);
        box.hidden = !d.roleCategory;
        // First reveal: bring the title picker into view so the next answer is one glance away
        if (reveal) setTimeout(() => { const r = box.getBoundingClientRect(); if (r.bottom > window.innerHeight - 110) window.scrollBy({ top: r.bottom - window.innerHeight + 140, behavior: 'smooth' }); }, 60);
      }
    }
    if (name === 'fullName') s.autoName = '';
    if (name === 'linkedin') {
      const guess = nameFromLinkedIn(d.linkedin);
      if (guess && (empty(d.fullName) || d.fullName === s.autoName)) {
        d.fullName = s.autoName = guess;
        const inp = form.querySelector('[name="fullName"]');
        if (inp) inp.value = guess;
      }
    }
    if (name === 'startDate') s.touchedStart = true;
    if (name === 'availability' && !s.touchedStart && d.availability) {
      d.startDate = isoDay(addDays(RN.now(), START_OFFSET[d.availability] || 0));
      const inp = form.querySelector('[name="startDate"]');
      if (inp) inp.value = d.startDate;
    }
    if (name === 'country' || name === 'postalCode' || name === 'city') {
      const loc = locate(d);
      const lb = form.querySelector('[data-jn-loc]'); if (lb) lb.innerHTML = locBox(d);
      const cb = form.querySelector('[data-jn-city]'); if (cb) cb.hidden = !(d.postalCode && d.country && !loc.found);
      const ub = form.querySelector('[data-jn-ush]'); if (ub) ub.hidden = !(d.country && d.country !== US);
    }
    if (name === 'methodologies') { const o = form.querySelector('[data-jn-other]'); if (o) o.hidden = !(d.methodologies || []).includes('Other'); }
    if (name === 'headline' || name === 'bio') { const c = form.querySelector(`[data-jn-count="${name}"]`); if (c) c.textContent = `${String(d[name] || '').length} / ${RN.fields[name].maxlength}`; }
    if (name === 'rate' || name === 'hoursPerMonth') { const r = form.querySelector('[data-jn-rate]'); if (r) r.innerHTML = rateHint(d); }
    if (name === 'fitTags') {
      const n = (d.fitTags || []).length;
      const m = form.querySelector('.jn-tagmeter .meter > i'); if (m) m.style.width = Math.min(100, (n / 10) * 100) + '%';
      const t = form.querySelector('[data-jn-tagmsg]'); if (t) { t.textContent = n >= 10 ? 'Strong: 10+ tags gets you found for more searches.' : `${n} added. 10 or more gets you found for more searches.`; t.className = 'small ' + (n >= 10 ? 'accent' : 'muted'); }
    }
    s.updatedAt = RN.now().toISOString();
    RN.store.save();
    const railEl = RN.$('.jn-rail');
    if (railEl) railEl.outerHTML = rail(s);
    flashSaved();
    if (s.tried[s.step]) showErrors(form, errorsFor(s.step, d));
  };

  /* ---------- Navigation ----------
     Every step change pushes a history entry, so browser Back and Forward move one step. The entry
     records the step it came from, so the in-page Back button can reuse browser history. */
  function goStep(n, opts) {
    const s = draft();
    const from = s.step;
    s.step = RN.clamp(n, 1, REVIEW);
    s.visited = Math.max(s.visited || 1, s.step);
    s.returnTo = opts && opts.returnTo ? opts.returnTo : null;
    s.returnStep = s.returnTo ? s.step : null;
    RN.store.save();
    const target = '#' + stepPath(s.step);
    if (location.hash === target) { RN.render(); return; }
    if (opts && opts.replace) history.replaceState({ jnStep: s.step }, '', target);
    else history.pushState({ jnStep: s.step, jnFrom: from }, '', target);
    RN.render();
  }
  RN.submits['join-next'] = (form, data) => {
    const s = draft();
    Object.assign(s.data, data);
    const errs = errorsFor(s.step, s.data);
    if (Object.keys(errs).length) {
      s.tried[s.step] = true;
      RN.store.save();
      showErrors(form, errs);
      const first = form.querySelector('.field.jn-bad');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      RN.ui.toast(Object.keys(errs).length === 1 ? 'One answer needs a look before you continue.' : `${Object.keys(errs).length} answers need a look before you continue.`, { icon: 'info' });
      return;
    }
    goStep(s.returnTo === 'review' ? REVIEW : s.step + 1);
  };
  RN.actions['join-back'] = () => {
    const s = draft();
    if (s.step <= 1) { RN.go('join'); return; }
    const h = history.state;
    // Arrived here from the previous step: step back through browser history so Forward still works
    if (h && h.jnStep === s.step && h.jnFrom === s.step - 1) history.back();
    else goStep(s.step - 1);
  };
  // Role details are optional: skip in one click, keeping valid answers and dropping out-of-range numbers
  RN.actions['join-skip'] = () => {
    const s = draft();
    const form = RN.$('#jn-form');
    if (form) Object.assign(s.data, RN.ui.formData(form));
    Object.keys(errorsFor(OPTIONAL_STEP, s.data)).forEach((k) => { s.data[k] = isNum(k) ? '' : [].concat(s.data[k] || []).slice(0, maxOf(k)); });
    s.tried[OPTIONAL_STEP] = false;
    goStep(s.returnTo === 'review' ? REVIEW : OPTIONAL_STEP + 1);
  };
  RN.actions['join-goto'] = (el) => {
    const n = +el.dataset.step;
    const s = draft();
    if (n > (s.visited || 1)) return;
    goStep(n);
  };
  RN.actions['join-edit'] = (el) => goStep(+el.dataset.step, { returnTo: 'review' });
  RN.actions['join-start'] = () => { draft(); RN.go('join.operator'); };
  RN.actions['join-restart'] = () => {
    RN.ui.modal({
      title: 'Start over?', sub: 'This clears every answer in your draft. It cannot be undone.',
      foot: '<button type="button" class="btn btn-line" data-act="modal-close">Keep my draft</button><button type="button" class="btn btn-danger" data-act="join-restart-confirm">Clear answers</button>',
    });
  };
  RN.actions['join-restart-confirm'] = () => {
    RN.ui.closeModal();
    RN.store.set('signup', null);
    if (videoURL) { URL.revokeObjectURL(videoURL); videoURL = null; }
    goStep(1, { replace: true });
    RN.ui.toast('Draft cleared');
  };

  /* ---------- Fit tag demand chips, photo, video ---------- */
  RN.actions['join-tag-demand'] = (el) => {
    const s = draft();
    const tags = [].concat(s.data.fitTags || []);
    if (tags.length >= maxOf('fitTags')) { RN.ui.toast(`Pick up to ${maxOf('fitTags')}. Remove one to add another.`, { icon: 'info' }); return; }
    if (!tags.some((t) => t.toLowerCase() === el.dataset.t.toLowerCase())) tags.push(el.dataset.t);
    s.data.fitTags = tags;
    RN.store.save();
    RN.rerender();
    RN.ui.toast(`Added “${esc(el.dataset.t)}”`);
  };
  RN.inputs['join-photo'] = (el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { RN.ui.toast('Pick an image file (JPG or PNG).', { icon: 'info' }); return; }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Center-crop to a square and shrink so the draft stays small in storage
        const side = Math.min(img.width, img.height), out = Math.min(320, side);
        const c = document.createElement('canvas');
        c.width = c.height = out;
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
        let url;
        try { url = c.toDataURL('image/jpeg', 0.86); } catch (e) { url = r.result; }
        const s = draft();
        s.data.photo = url;
        RN.store.save();
        RN.rerender();
        RN.ui.toast('Photo added');
      };
      img.onerror = () => RN.ui.toast('That image did not load. Try a JPG or PNG.', { icon: 'info' });
      img.src = r.result;
    };
    r.readAsDataURL(file);
  };
  RN.actions['join-photo-remove'] = () => { const s = draft(); s.data.photo = ''; RN.store.save(); RN.rerender(); RN.ui.toast('Photo removed'); };
  RN.inputs['join-video'] = (el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    if (!/^video\//.test(file.type)) { RN.ui.toast('Pick a video file (MP4 or MOV).', { icon: 'info' }); return; }
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = URL.createObjectURL(file);
    const set = (dur) => {
      const s = draft();
      s.data.video = { name: file.name, duration: Math.round(isFinite(dur) ? dur : 0), size: file.size };
      s.data.videoLater = false;
      RN.store.save();
      RN.rerender();
      RN.ui.toast('Intro video added');
    };
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => set(v.duration);
    v.onerror = () => set(0);
    v.src = videoURL;
  };
  RN.actions['join-video-play'] = () => {
    if (!videoURL) return;
    const s = draft();
    RN.ui.modal({ width: 720, title: `Meet ${esc(RN.fmt.first(s.data.fullName || '') || 'you')}`, sub: 'Preview of your intro video', body: `<video class="jn-vid-player" src="${esc(videoURL)}" controls autoplay playsinline></video>` });
  };
  RN.actions['join-video-remove'] = () => {
    const s = draft();
    s.data.video = null;
    if (videoURL) { URL.revokeObjectURL(videoURL); videoURL = null; }
    RN.store.save(); RN.rerender(); RN.ui.toast('Video removed');
  };
  RN.actions['join-video-later'] = () => { const s = draft(); s.data.videoLater = true; s.data.video = null; RN.store.save(); RN.rerender(); RN.ui.toast('Noted. You can add your video from Studio.'); };

  /* ---------- Sample answers (demo) ----------
     Every key is a RN.fields.roleFields key and every value is a registry option or an in-range number
     (the explorer's ROLE_SAMPLES, mapped to the registry). crm is asked of every role in Company fit. */
  const SAMPLE_DETAILS = {
    sales_leadership: { crm: 'Salesforce', largestTeamManaged: '10-25', largestTeamQuota: '10_25m', salesCycle: ['30 - 90 days', '3 - 6 months'], methodologies: ['MEDDPICC', 'Challenger'] },
    marketing: { crm: 'HubSpot', largestBudget: '3000000', typicalTeamSize: '6', channelsRun: ['Paid Search', 'ABM', 'Content'], b2bShare: '80' },
    revenue_operations: { crm: 'Salesforce', stackComplexity: 'complex', builtFromZero: 'yes' },
    sales_enablement: { crm: 'Salesforce', largestRepCount: '120', enablementFocus: ['Function leader', 'Program builder'], audienceSpecialty: ['AE', 'SDR / BDR', 'Sales Manager / Frontline manager'], methodologies: ['MEDDPICC', 'Challenger'], builtFromZero: 'yes' },
    customer_success_growth: { crm: 'HubSpot', bestNrr: '118', bestGrr: '92', largestArrBook: '15000000', largestCsTeam: '8', largestAccountArr: '500000', csMotion: ['High-touch', 'Tech-touch / digital CS'], ownershipModel: ['Renewals owned', 'Expansion owned'] },
    ai_gtm: { crm: 'HubSpot', aiSpecialization: 'Outbound / prospecting AI', codeCapability: 'light_scripting', automationScale: 'high_scale' },
    partnerships: { crm: 'Salesforce', partnershipMotion: 'Tech / ISV partnerships', partnerRevenue: '12000000', partnerEcosystem: '50', builtFromZero: 'yes' },
    sellers: { crm: 'Salesforce', individualQuota: '1500000', avgDealSize: '75000', salesCycle: ['30 - 90 days', '3 - 6 months'], methodologies: ['MEDDPICC'], commissionOnly: 'no' },
  };
  const SAMPLE_COPY = {
    sales_leadership: ['I turn founder-led sales into a repeatable motion a hired team can run.', 'I help $5M to $50M B2B companies move from founder-led sales to a team that hits its number without the founder on every call. I have built three sales teams from the first hire and set up the forecast the board reviews each month. Clients bring me in after a missed quarter or before their first sales leader hire.'],
    marketing: ['I build B2B demand programs that hand sales qualified pipeline every week.', 'I help B2B SaaS companies between $5M and $50M build demand programs sales trusts. I have run paid, ABM and content with budgets up to $3M a year and set up the attribution that shows what works. Clients bring me in when pipeline stalls.'],
    revenue_operations: ['I rebuild messy CRMs into a revenue system the board trusts.', 'I help growing B2B companies turn a cluttered CRM into one revenue system: clean data, clear stages, routing that works and a forecast leadership believes. I have rebuilt HubSpot and Salesforce for teams from 20 to 400 people. Clients call me before a fundraise or a new sales leader.'],
    sales_enablement: ['I cut new rep ramp time with onboarding and coaching that sticks.', 'I help sales teams ramp new reps faster and keep experienced reps sharp. I have built onboarding for teams of up to 120 reps and rolled out MEDDPICC at two companies. Clients bring me in when they are hiring a sales class and ramp time costs them a quarter.'],
    customer_success_growth: ['I cut churn and turn customer success into an expansion engine.', 'I help B2B software companies keep the customers they win and grow them. I have run high-touch and digital CS teams, taken net revenue retention from 98% to 118%, and built renewal and expansion playbooks. Clients bring me in when churn shows up in the board deck.'],
    ai_gtm: ['I build AI prospecting workflows that book meetings without adding headcount.', 'I help lean GTM teams automate prospecting, enrichment and routing with Clay, n8n and LLMs. I have shipped workflows that process hundreds of thousands of records a month. Clients bring me in when outbound needs to scale and more SDRs is not the answer.'],
    partnerships: ['I launch partner programs that source and close revenue every quarter.', 'I help B2B software companies build partner programs that source and influence real pipeline. I have launched technology and channel partnerships that grew to $12M in attributed revenue. Clients bring me in when partners are signed but not selling.'],
    sellers: ['I close mid-market and enterprise deals for teams between sales hires.', 'I carry a quota for companies that need deals closed while they hire. I sell to mid-market and enterprise clients with 30 to 180 day cycles and average deals around $75K. Clients bring me in to cover an open AE seat or to prove a new segment.'],
  };
  function sampleData(cur) {
    const cat = cur.roleCategory || 'sales_leadership';
    const roles = RN.fields.rolesByCat[cat] || [];
    const role = cur.role && roles.includes(cur.role) ? cur.role : roles[1] || roles[0];
    const idx = RN.data.market.rateIndex.byCat[cat];
    const lib = RN.fields.fitTags.options.filter((o) => o.c === cat).sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 10).map((o) => o.v);
    const copy = SAMPLE_COPY[cat];
    return Object.assign({
      roleCategory: cat, role,
      fullName: 'Nina Alvarez', email: 'nina@alvarezgtm.com', linkedin: 'https://www.linkedin.com/in/nina-alvarez-gtm',
      country: US, postalCode: '80202', city: '', usHours: '',
      revenueRange: ['5m_20m', '20m_50m'], salesMotions: ['Inside Sales', 'Enterprise Sales'], employeeRange: ['51_200', '201_500'], industries: ['Saas', 'Health Care', 'Fintech'],
      availability: 'available_2_weeks', startDate: isoDay(addDays(RN.now(), 14)), hoursPerMonth: '40', newClientCapacity: '2', engagementTypes: ['fractional', 'interim'],
      rate: String(Math.round((idx ? idx.p50 - 25 : 225) / 5) * 5),
      fitTags: lib,
      headline: copy[0], bio: copy[1],
      photo: cur.photo || '', video: cur.video || null, videoLater: cur.video ? false : true,
    }, SAMPLE_DETAILS[cat] || {});
  }
  RN.actions['join-sample'] = () => {
    const s = draft();
    s.data = sampleData(s.data);
    s.visited = REVIEW;
    s.touchedStart = false;
    s.tried = {};
    RN.store.save();
    RN.rerender();
    RN.ui.toast('Sample answers filled in. Step through them, or jump to review.', { ms: 5000, action: { label: 'Jump to review', act: 'join-goto', attrs: `data-step="${REVIEW}"` } });
  };

  /* ---------- Submit ---------- */
  RN.actions['join-submit'] = () => {
    const s = draft();
    const d = s.data;
    const bad = firstBadStep(d);
    if (bad) {
      s.tried[bad] = true;
      RN.ui.toast(`Finish “${esc(STEPS[bad].label)}” to submit.`, { icon: 'info' });
      goStep(bad, { returnTo: 'review' });
      return;
    }
    const loc = locate(d);
    const cat = d.roleCategory;
    // Role details keyed by the registry: every RN.fields.roleFields[cat] key answered (GTM motion and CRM
    // included, since both are asked in Company fit), plus crm for every role. Numbers are stored as numbers.
    const stored = (k) => (isNum(k) ? +d[k] : d[k]);
    const roleDetails = {};
    (F.roleFields[cat] || []).concat(['crm']).forEach((k) => { if (!empty(d[k])) roleDetails[k] = stored(k); });
    const methodologyOther = (d.methodologies || []).includes('Other') ? String(d.methodologyOther || '').trim() : '';
    if (roleDetails.methodologies && methodologyOther) roleDetails.methodologyOther = methodologyOther;
    const id = 'app-' + RN.uid('x').slice(2).toUpperCase();
    const now = RN.now();
    const profile = {
      name: d.fullName.trim(), first: RN.fmt.first(d.fullName.trim()), email: d.email.trim(), linkedin: d.linkedin.trim(),
      roleCategory: cat, role: d.role,
      country: d.country, postalCode: d.postalCode.trim().toUpperCase(), city: loc.found ? loc.city : String(d.city || '').trim(), location: place(d), timezone: loc.tz,
      usHours: d.country !== US ? d.usHours : '',
      revenueRange: d.revenueRange, salesMotions: d.salesMotions, employeeRange: d.employeeRange, industries: d.industries, crm: d.crm,
      methodologies: roleDetails.methodologies || [],
      roleDetails, roleFields: Object.assign({}, roleDetails), methodologyOther,
      availability: d.availability, startDate: d.startDate || '', hoursPerMonth: d.hoursPerMonth, newClientCapacity: +d.newClientCapacity, engagementTypes: d.engagementTypes, rate: +d.rate,
      fitTags: d.fitTags, headline: d.headline.trim(), bio: d.bio.trim(), photo: d.photo || '', video: d.video || null, videoLater: !!d.videoLater,
    };
    const rec = { id, submittedAt: now.toISOString(), status: 'in_review', source: 'intake', profile };
    const reviewBy = addBiz(now, 2);
    RN.store.update((st) => { st.pending = [rec].concat(st.pending || []); st.signup = null; }, 'pending');
    RN.track('signup_submit', { meta: { appId: id, roleCategory: cat, role: d.role, tags: (d.fitTags || []).length, roleDetails: Object.keys(roleDetails).length, completeness: [d.photo, d.video].filter(Boolean).length } });
    // One team alert only: Admin sends "New operator application" when the pending record lands (admin.js sendAlert).
    RN.mail(profile.email, 'We received your profile',
      `Hi ${profile.first},\nThanks for applying to Revenue Nomad as a Fractional ${profile.role}. A person on the team reviews every application within 2 business days, so expect an update by ${dayName(reviewBy)}.\n\nWhat happens next:\n1. We check your LinkedIn and work history. If something needs a change, we email you what to fix.\n2. Once approved, your profile goes live in the directory at Reputation Index 50, tier Vetted. It stays hidden until then.\n3. Request reviews from 3 past clients to reach Proven.\n\nStudio shows who viewed you from the day you go live.\nReference: ${id}`, 'signup');
    if (videoURL) { URL.revokeObjectURL(videoURL); videoURL = null; }
    lastMounted = null;
    RN.go('join.done');
    RN.ui.toast('Profile submitted. Check your email for the confirmation.', { icon: 'mail' });
  };

  /* ---------- Decision page (#join) ---------- */
  function renderDecision() {
    const s = RN.store.state.signup;
    const cont = hasDraft() && s;
    const app = latestApp();
    const persona = RN.store.state.persona;
    return `<section class="wrap jn-hero">
        <span class="eyebrow">Join Revenue Nomad</span>
        <h1 class="h1">Are you hiring, or <span class="serif">are you the hire?</span></h1>
        <p class="lede">Companies never need an account to browse or post a project. Fractional operators apply once and get a profile clients can trust.</p>
      </section>
      <section class="wrap jn-paths" aria-label="Choose how you use Revenue Nomad">
        <article class="jn-path">
          <div class="jn-path-hd"><span class="jn-path-ico">${icon('building')}</span><span class="label">For companies</span></div>
          <h2 class="h2">I’m hiring</h2>
          <p class="jn-path-lede">No account needed. Open profiles with client reviews, rates and availability.</p>
          <div class="jn-links">
            <a class="jn-link" href="#browse">${icon('search')}<span><b>Browse talent</b><small>Filter by role, company size, industry and focus areas</small></span>${icon('arrow')}</a>
            <a class="jn-link" href="#project.new">${icon('briefcase')}<span><b>Post a project</b><small>Start from a scoped Blueprint and get ranked matches</small></span>${icon('arrow')}</a>
            <a class="jn-link" href="#talk">${icon('message')}<span><b>Talk to us</b><small>Tell us what you need and we suggest operators</small></span>${icon('arrow')}</a>
          </div>
          <p class="jn-hire-note">${icon('clock')}<span>Log in to see rates and Match Signals for your company. Operators answer intro requests within 72 hours.</span></p>
          <a class="btn btn-lg jn-path-cta" href="#browse">Browse talent${icon('arrow')}</a>
        </article>
        <article class="jn-path jn-path-op">
          <div class="jn-path-hd"><span class="jn-path-ico">${icon('user')}</span><span class="label">For fractional operators</span></div>
          <h2 class="h2">I’m a fractional operator</h2>
          <p class="jn-path-lede">Apply in about 8 minutes. ${TOTAL} short steps, one of them optional, saved as you go.</p>
          <ul class="jn-gets">
            <li>${icon('chart')}<span><b>Studio insights</b>Who viewed you by company size and industry, the searches you appeared in, and why a client picked someone else.</span></li>
            <li>${icon('seal')}<span><b>Reputation Index</b>A 0 to 100 score built from verified client reviews. Every approved profile starts at 50.</span></li>
            <li>${icon('link')}<span><b>Proof links</b>Send a prospect a tracked version of your profile and see which sections they read.</span></li>
          </ul>
          <p class="jn-honest">${icon('shield')}<span>The network is curated. The team checks the work history on every application within 2 business days before a profile goes live.</span></p>
          ${app && app.status === 'in_review'
            ? `<div class="jn-path-status"><span>Your application is in review</span><a class="btn btn-leaf btn-lg jn-path-cta" href="#join.done">See status${icon('arrow')}</a><button type="button" class="act" data-act="join-start">Start a new application</button></div>`
            : cont
              ? `<div class="jn-path-status"><span>Draft saved at step ${Math.min(s.step, TOTAL)} of ${TOTAL}</span><button type="button" class="btn btn-leaf btn-lg jn-path-cta" data-act="join-start">Continue application${icon('arrow')}</button></div>`
              : `<button type="button" class="btn btn-leaf btn-lg jn-path-cta" data-act="join-start">Start application${icon('arrow')}</button>`}
          <a class="jn-why" href="#operators">Why operators join${icon('arrow')}</a>
        </article>
      </section>
      <section class="wrap" aria-label="Network facts"><div class="jn-facts">
        <div><b class="num">${esc(RN.data.market.network.operators)}</b><span>vetted operators on the live network (${RN.fmt.int(RN.model.ops.length)} in this prototype)</span></div>
        <div><b class="num">${RN.fields.roleCategory.options.length}</b><span>role categories, from Sales Leadership to AI GTM</span></div>
        <div><b class="num">2</b><span>business days to review an application</span></div>
        <div><b class="num">$0</b><span>for companies to browse, shortlist and request intros</span></div>
      </div></section>
      <p class="wrap jn-login small muted">${persona === 'operator' ? `Signed in as ${esc(RN.personas.operator.name)}. Your profile is live. <a class="link" href="#studio">Open Studio</a>` : persona === 'buyer' ? `Signed in as ${esc(RN.personas.buyer.name)}. <a class="link" href="#buyer">Open your workspace</a>` : `Already on Revenue Nomad? <button type="button" class="act" data-act="login">Log in</button>`}</p>`;
  }

  /* ---------- After-submit landing (#join.done, comment H328) ---------- */
  function latestApp() {
    return (RN.store.state.pending || []).filter((p) => p.source === 'intake').sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0] || null;
  }
  function ladder() {
    const tiers = RN.fields.risTier.options.filter((t) => t.v !== 'indexing').slice().reverse();
    return `<div class="jn-ladder" role="list" aria-label="Reputation Index tiers">
      ${tiers.map((t) => `<div role="listitem" class="jn-rung ${t.v === 'vetted' ? 'here' : t.v === 'proven' ? 'next' : ''}">
        <span class="jn-rung-bar"></span><b>${esc(t.l)}</b><span>${t.min}${t.max === 100 ? '+' : '–' + t.max}</span>
        ${t.v === 'vetted' ? '<em>You start here</em>' : t.v === 'proven' ? '<em>3 reviews</em>' : ''}
      </div>`).join('')}
    </div>`;
  }
  function ladderBlock() {
    return `<div class="jn-ladder-wrap">
      <div class="jn-ladder-hd"><h3 class="h4">The Reputation Index ladder</h3>${RN.ui.tip(RN.ui.risExplainer(), 'How the Reputation Index is calculated')}</div>
      <p class="small muted">One score, the same for you and for clients. It rises with verified reviews, verified fit tags, a complete profile and recent engagements.</p>
      ${ladder()}
    </div>`;
  }
  function renderDone() {
    const app = latestApp();
    const gain = RN.model.risGain('review');
    const reached = 50 + gain * 3;
    if (!app) {
      return `<section class="night jn-done-hero"><div class="wrap">
          <span class="eyebrow">Operator applications</span>
          <h1 class="h1">What happens after <span class="serif">you apply</span></h1>
          <p class="lede">The team reviews every application within 2 business days. Approved profiles go live in the directory at Reputation Index 50, tier Vetted.</p>
          <div class="row jn-done-actions"><button type="button" class="btn btn-leaf btn-lg" data-act="join-start">${hasDraft() ? 'Continue application' : 'Start application'}${icon('arrow')}</button><a class="btn btn-line btn-lg" href="#operators">Why operators join</a></div>
        </div></section>
        <section class="wrap jn-done-body"><div class="jn-done-grid">
          <div class="jn-done-main">${timeline(null, gain, reached)}${ladderBlock()}</div>
          <aside class="jn-done-side"><div class="card jn-dash">
            <span class="jn-dash-ico">${icon('doc')}</span>
            <h3 class="h4">Apply in about 8 minutes</h3>
            <ol class="jn-steplist">${STEPS.slice(1, REVIEW).map((st) => `<li>${esc(st.label)}${st.optional ? ' <span class="muted">(optional)</span>' : ''}</li>`).join('')}</ol>
            <p class="small muted">${TOTAL} short steps, one question group each. Your draft saves as you go.</p>
            <button type="button" class="btn btn-block" data-act="join-start">${hasDraft() ? 'Continue application' : 'Start application'}${icon('arrow')}</button>
          </div></aside>
        </div></section>`;
    }
    const p = app.profile;
    const d = Object.assign({}, p, { fullName: p.name, city: p.city });
    const sub = new Date(app.submittedAt);
    const reviewBy = addBiz(sub, 2);
    const st = app.status || 'in_review';
    const statusLabel = { in_review: 'In review', approved: 'Approved, going live', live: 'Live', changes_requested: 'Changes requested', rejected: 'Not approved' }[st] || 'In review';
    const live = st === 'live';
    const missing = [!p.photo && 'photo', !p.video && 'intro video'].filter(Boolean);
    const lede = live ? 'Your profile shows in Browse and search. Studio now tracks who views it.'
      : st === 'changes_requested' ? `The team asked for a change. Check the email sent to <b>${esc(p.email)}</b> for what to fix.`
        : `A person on the team reviews every application within 2 business days. Expect an email at <b>${esc(p.email)}</b> by ${esc(dayName(reviewBy))}. Your profile stays hidden until it is approved.`;
    return `<section class="night jn-done-hero"><div class="wrap">
        <span class="jn-done-seal">${icon('check')}</span>
        <span class="eyebrow">Application received</span>
        <h1 class="h1">${live ? `You are live, ${esc(p.first)}.` : `Thanks, ${esc(p.first)}. Your profile is <span class="serif">in review.</span>`}</h1>
        <p class="lede">${lede}</p>
        <div class="jn-done-meta">
          ${RN.ui.statusPill('application', st, statusLabel)}
          <span>Submitted ${esc(RN.fmt.date(sub))}</span>
          <span>Reference <span class="mono">${esc(app.id)}</span></span>
        </div>
      </div></section>
      <section class="wrap jn-dash-wrap" aria-label="Your dashboard">
        <div class="jn-dash-banner">
          <span class="jn-dash-ico">${icon('chart')}</span>
          <div class="jn-dash-copy">
            <h2 class="h4">View your dashboard</h2>
            <p class="small">${live ? 'Studio shows who viewed you, the searches you appeared in and how your rate compares with the Rate Index.' : 'Studio is where you will see who viewed you, the searches you appeared in and how your rate compares with the Rate Index. Your own numbers start the day your profile goes live.'}</p>
            <p class="tiny muted">${icon('info')}<span>In this prototype, Studio opens as sample operator Matt Lopez, with his data.</span></p>
          </div>
          <button type="button" class="btn" data-act="persona" data-p="operator" data-to="studio">View your dashboard${icon('arrow')}</button>
        </div>
      </section>
      <section class="wrap jn-done-body">
        <div class="jn-done-grid">
          <div class="jn-done-main">
            ${timeline(app, gain, reached)}
            ${ladderBlock()}
          </div>
          <aside class="jn-done-side">
            <div class="jn-side-block">
              <span class="label">Your card in search${live ? '' : ', once approved'}</span>
              ${previewCard(d)}
              <p class="small muted jn-visible">${icon('eye')}<span>${live ? 'Visible in Browse and search now.' : 'Hidden until the team approves it. Then it shows in Browse and search the same day.'}</span></p>
            </div>
          </aside>
        </div>
        <div class="jn-prep">
          <span class="eyebrow">While you wait</span>
          <div class="jn-prep-grid">
            <article class="jn-prep-card">${icon('users')}<h3 class="h5">Line up 3 past clients</h3><p class="small muted">Reviews verify your fit tags and lift your score. Have names and work emails ready to send requests from Studio.</p><a class="act" href="#levels">How reviews raise your score${icon('arrow')}</a></article>
            <article class="jn-prep-card">${icon(missing.length ? 'video' : 'check-circle')}<h3 class="h5">${missing.length ? `Add your ${esc(missing.join(' and '))}` : 'Photo and video added'}</h3><p class="small muted">${missing.length ? 'Clients see your photo on every card and your video on your profile. Add them from Studio any time.' : 'Your profile starts with the two things clients notice first.'}</p><a class="act" href="#guides">Read the operator guides${icon('arrow')}</a></article>
            <article class="jn-prep-card">${icon('target')}<h3 class="h5">See what clients search for</h3><p class="small muted">The Fit Tag Library shows demand against verified supply for every tag, including the ${RN.fmt.int((p.fitTags || []).length)} you picked.</p><a class="act" href="#library">Open the Fit Tag Library${icon('arrow')}</a></article>
          </div>
        </div>
      </section>`;
  }
  function timeline(app, gain, reached) {
    const sub = app ? new Date(app.submittedAt) : RN.now();
    const reviewBy = addBiz(sub, 2);
    const status = app ? app.status || 'in_review' : '';
    const reviewed = ['approved', 'live'].includes(status);
    const live = status === 'live';
    const items = [
      { st: app ? 'done' : '', ic: 'send', when: app ? `Done · ${RN.fmt.dateShort(sub)}` : 'Day 0', t: app ? 'Profile submitted' : 'You submit your profile', d: 'Your answers are saved with the same fields clients filter by, so nothing needs re-entering.' },
      { st: reviewed ? 'done' : app ? 'now' : '', ic: 'shield', when: app ? (reviewed ? 'Done' : `By ${dayName(reviewBy)}`) : 'Within 2 business days', t: 'A person on the team reviews it', d: 'We check your LinkedIn and work history against your answers, and may ask for a short call. If something needs a change, we email you what to fix. Your profile stays hidden until it is approved.' },
      { st: live ? 'done' : '', ic: 'eye', when: 'Same day as approval', t: 'Your profile goes live', d: 'You appear in Browse, search and your role category page at Reputation Index 50, tier Vetted.' },
      { st: '', ic: 'star', when: 'First weeks', t: 'Request 3 client reviews to reach Proven', d: `Each completed review adds about ${gain} points and verifies the fit tags the client confirms. Three reviews take a new profile from 50 to about ${reached}, tier Proven.` },
      { st: '', ic: 'chart', when: 'From the day you go live', t: 'Studio shows who viewed you', d: 'See the company size and industry of every visitor, the searches you appeared in, and when you were compared and not chosen.' },
    ];
    return `<span class="eyebrow">What happens next</span>
      <h2 class="h3 jn-tl-title">From review to your first client review</h2>
      <ol class="jn-tl">${items.map((x) => `<li class="${x.st}"${x.st === 'now' ? ' aria-current="step"' : ''}><span class="jn-tl-dot">${icon(x.st === 'done' ? 'check' : x.ic)}</span><div><span class="label jn-tl-when">${esc(x.when)}</span><h3 class="h4">${esc(x.t)}</h3><p>${esc(x.d)}</p></div></li>`).join('')}</ol>`;
  }

  /* ---------- Views ---------- */
  RN.view('join', {
    route: 'join', nav: 'operators',
    title: () => 'Join',
    render: renderDecision,
  });
  // #join.operator resumes the draft; #join.operator.<1-7|review> is one step, so Back and Forward move by step.
  // Both share one render; CSS scopes them with [data-view^="join-operator"].
  const flowTitle = () => {
    const s = RN.store.state.signup;
    const n = s && s.step ? s.step : 1;
    return `Operator application · ${n === REVIEW ? 'Review' : `Step ${n} of ${TOTAL}`}`;
  };
  RN.view('join-operator', {
    route: 'join.operator', nav: 'operators', footer: false,
    title: flowTitle, render: renderFlow, mount: mountFlow,
  });
  RN.view('join-operator-step', {
    route: 'join.operator.:step', nav: 'operators', footer: false,
    title: flowTitle, render: renderFlow, mount: mountFlow,
    samples: { step: '1', extra: Array.from({ length: TOTAL - 1 }, (_, i) => stepPath(i + 2)).concat(stepPath(REVIEW)) },
  });
  RN.view('join-done', {
    route: 'join.done', nav: 'operators',
    title: () => 'Application received',
    render: renderDone,
  });
})();
