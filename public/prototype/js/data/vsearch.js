/* Vector search (RN.vsearch): free text -> the client's needs -> every operator force-ranked, with what fits
   and what is missing.

   The index (js/data/vectors.js, built by tools/build_vectors.py) holds all-MiniLM-L6-v2 vectors for each
   operator, each of the 1,154 focus areas, each role category and each word in the corpus.
   1. Needs: Claude (the page's `sample` capability) reads the request and picks 3-5 focus areas, each with a
      plain label. Until it answers, or when it can't, a local guess blends word matches on focus-area names
      with the request's word vectors.
   2. Each need is a focus-area vector. An operator meets a need when one of their focus areas sits close to
      it: "proven" when that focus area is client-verified, "claimed" when self-reported, "close" when only
      nearby, "missing" when nothing is.
   3. Facts from the request (company size, industry, start date, rate, role) are checks, not filters: nobody
      disappears, the gap shows instead.
   4. Match % = 50% needs met + 20% overall closeness (request vs whole profile) + 15% facts + 15% Reputation Index. */
(function () {
  'use strict';
  const RN = window.RN;
  const VS = (RN.vsearch = RN.vsearch || {});
  // The vector index (js/data/vectors.js, about 1.9 MB) is not part of the page: it loads on the first search,
  // or when the browser is idle a few seconds after load, so Home and every other page stay light.
  let V = RN.data.vectors || null;
  const DIM = 384;
  let loading = null;
  VS.isReady = () => !!(V || (V = RN.data.vectors || null));
  VS.ready = function () {
    if (VS.isReady()) return Promise.resolve(true);
    if (loading) return loading;
    // Published next to the page as JSON (fetched: the artifact host serves files but does not run extra scripts);
    // opened from disk, fetch is not allowed, so fall back to the script version
    const viaScript = () => new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'js/data/vectors.js';
      s.async = true;
      s.onload = () => { V = RN.data.vectors || null; resolve(!!V); };
      s.onerror = () => { loading = null; resolve(false); };
      document.head.appendChild(s);
    });
    loading = (location.protocol === 'file:' ? viaScript() : fetch('js/data/vectors.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { RN.data.vectors = V = d; return true; }).catch(viaScript));
    return loading;
  };
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
  window.addEventListener('load', () => setTimeout(() => idle(() => VS.ready()), 3000));
  document.addEventListener('focusin', (e) => { if (e.target && e.target.matches && e.target.matches('input[type="search"], #hm-q, #br-q')) VS.ready(); });
  const NEAR = 0.8, CLOSE = 0.62; // focus-area cosine thresholds: meets the need / is nearby
  const W = { needs: 0.5, sem: 0.2, facts: 0.15, ris: 0.15 };

  // ---------- decode int8 blobs ----------
  function unpack(b64, n) {
    const bin = atob(b64);
    const out = new Float32Array(bin.length);
    for (let i = 0; i < bin.length; i++) { const b = bin.charCodeAt(i); out[i] = (b > 127 ? b - 256 : b) / 127; }
    const rows = [];
    for (let r = 0; r < n; r++) rows.push(out.subarray(r * DIM, (r + 1) * DIM));
    return rows;
  }
  let IX = null;
  function index() {
    if (IX) return IX;
    const opRows = unpack(V.ops.v, V.ops.ids.length);
    const tagRows = unpack(V.tags.v, V.tags.names.length);
    const catRows = unpack(V.cats.v, V.cats.keys.length);
    const wordRows = unpack(V.words.v, V.words.w.length);
    IX = {
      op: new Map(V.ops.ids.map((id, i) => [id, opRows[i]])),
      tag: new Map(V.tags.names.map((n, i) => [n.toLowerCase(), { name: n, vec: tagRows[i], i }])),
      tagList: V.tags.names.map((n, i) => ({ name: n, vec: tagRows[i], words: new Set(words(n).map(stem)) })),
      cat: new Map(V.cats.keys.map((k, i) => [k, catRows[i]])),
      word: new Map(V.words.w.map((w, i) => [w, { vec: wordRows[i], idf: V.words.idf[i] }])),
      stop: new Set(V.stop),
    };
    return IX;
  }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < DIM; i++) s += a[i] * b[i]; return s; };
  function normed(parts) { // [[vec, weight], ...]
    const v = new Float32Array(DIM);
    parts.forEach(([x, w]) => { if (x) for (let i = 0; i < DIM; i++) v[i] += w * x[i]; });
    let n = 0; for (let i = 0; i < DIM; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < DIM; i++) v[i] /= n;
    return v;
  }

  // ---------- words ----------
  // How clients say it vs how focus areas are named
  const SYN = {
    ae: 'account executive', aes: 'account executives', sdr: 'sales development outbound', sdrs: 'sales development outbound', bdr: 'sales development outbound',
    cs: 'customer success', csm: 'customer success', revops: 'revenue operations', plg: 'product-led', crm: 'crm', cro: 'revenue', cmo: 'marketing',
    closer: 'closing deals', closers: 'closing deals', closing: 'closing deals', ramp: 'onboarding ramp', ramping: 'onboarding ramp',
    churn: 'churn retention', leaving: 'churn retention', renewals: 'renewal retention', upsell: 'expansion upsell', leads: 'lead inbound',
    untouched: 'follow-up response', ignored: 'follow-up response', board: 'board reporting', numbers: 'reporting forecast', trust: 'data quality',
    mess: 'cleanup', messy: 'cleanup', comp: 'compensation plan', resellers: 'reseller channel', partners: 'partner channel', founder: 'founder-led',
    playbook: 'sales playbook', pricing: 'pricing packaging', forecast: 'forecasting', pipeline: 'pipeline', demand: 'demand generation',
    brand: 'brand positioning', messaging: 'messaging positioning', hire: 'hiring', hiring: 'hiring', automate: 'automation workflow', ai: 'ai automation',
  };
  const words = (s) => (String(s).toLowerCase().match(/[a-z][a-z0-9+&'-]*/g) || []).filter((w) => w.length > 1 && !(IX && IX.stop.has(w)));
  function stem(w) {
    for (const suf of ['ings', 'ing', 'ers', 'er', 'ies', 'es', 's', 'ed']) if (w.length > suf.length + 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
    return w;
  }
  function queryWords(text) {
    const out = [];
    words(text).forEach((w) => { out.push(w); if (SYN[w]) words(SYN[w]).forEach((x) => out.push(x)); });
    return out;
  }
  function wordVector(ws) {
    const ix = index();
    const parts = ws.map((w) => ix.word.get(w) || ix.word.get(stem(w))).filter(Boolean).map((x) => [x.vec, x.idf]);
    return parts.length ? normed(parts) : null;
  }

  // ---------- needs: the local guess ----------
  // Common ways clients describe a problem -> the focus area that solves it, with a plain label
  const INTENTS = [
    [/\bfounders? (is |are )?(still )?(the only )?(selling|closing|closer|doing (all )?(the )?sales)|founder[- ]led|only closer/, 'Founder-Led Sales Transition', 'Take sales off the founder'],
    [/\binbound\b|\bleads? (are |is )?(sitting|untouched|ignored|go(ing)? cold|not followed)|follow[- ]up|speed to lead/, 'Inbound selling', 'Work inbound leads'],
    [/\buntouched|go(ing)? cold|nobody (calls|follows)|respond(ing)? (to leads|fast)|response time/, 'Speed-to-lead optimization', 'Answer leads fast'],
    [/\boutbound\b|\bcold (email|call|outreach)|prospect/, 'Outbound Motion Build', 'Build outbound'],
    [/\b(sdr|bdr)s?\b/, 'Outbound Prospecting', 'Book more meetings'],
    [/\bcomp(ensation)? plans?\b|\bcommission|\bquota/, 'Comp plan design', 'Design the comp plan'],
    [/\b(hire|hiring|recruit)\b.*\b(reps?|aes?|sellers|salespeople|sdrs|team)\b|\bbuild (out )?(a |our |the )?(first )?(sales |outbound )?team\b|first sales hire/, 'Sales Team Hiring & Ramp', 'Hire the right sellers'],
    [/\bplaybook/, 'Sales Playbook', 'Write the playbook'],
    [/\bramp(ing)?\b|\bonboard(ing)? (new )?(reps|aes|sellers|hires)|new (reps|aes|hires) (are )?(slow|struggling)/, 'New Hire Sales Onboarding', 'Get new reps selling'],
    [/\benablement|\bcoach(ing)?\b|\btraining\b/, 'Call Coaching & Feedback', 'Coach the reps'],
    [/\bmeddp?icc?\b|\bmethodology/, 'MEDDIC / MEDDPICC Implementation', 'Roll out a sales method'],
    [/\bhubspot\b/, 'HubSpot Implementation', 'Fix HubSpot'],
    [/\bsalesforce\b|\bsfdc\b/, 'Salesforce Implementation', 'Fix Salesforce'],
    [/\bcrm\b.*\b(mess|messy|broken|clean)|\b(mess|messy|broken)\b.*\bcrm\b|\bdirty data|duplicates|data (is )?(a )?mess/, 'CRM cleanup', 'Clean up the CRM'],
    [/\b(trust|believe)\b.*\b(numbers|pipeline|forecast|data)|\bforecast/, 'Forecast accuracy', 'Numbers you can trust'],
    [/\bboard\b|\binvestors?\b|\bdashboards?\b|\breporting\b/, 'Board Revenue Reporting', 'Report to the board'],
    [/\bpipeline (is )?(thin|empty|dry|weak)|not enough pipeline|need (more )?pipeline|\bdemand gen/, 'Demand Generation', 'Fill the pipeline'],
    [/\bchurn|\bcustomers? (are )?leaving|\bretention|\brenewals?/, 'Churn Reduction Program', 'Keep customers longer'],
    [/\bexpansion\b|\bupsell|\bcross[- ]sell|\bnrr\b|grow (existing )?accounts/, 'NRR & Expansion Motion', 'Grow existing customers'],
    [/\bcustomer success\b|\b(a |the )?cs\b/, 'Customer Onboarding Program', 'Set customers up to win'],
    [/\bpartners?\b|\bchannel\b|\bresellers?\b|\balliances?\b/, 'Channel Sales Build', 'Sell through partners'],
    [/\bai\b|\bautomat(e|ion)|\bclay\b|\bagents?\b/, 'AI Sales Automation', 'Automate with AI'],
    [/\bbrand\b|\bpositioning\b|\bmessaging\b|nobody knows (who )?we/, 'Brand positioning', 'Sharpen the story'],
    [/\bpricing\b|\bpackaging\b|\bdiscount/, 'Pricing Strategy', 'Fix pricing'],
    [/\bplg\b|\bproduct[- ]led|\bself[- ]serve|\bfree trial/, 'PLG → Sales Bridge', 'Add sales to self-serve'],
    [/\bsales process\b|\brepeatable\b|\bdeals? (stall|slip|stuck)|\bwin rate/, 'Sales Process Design', 'Make sales repeatable'],
    [/\babm\b|\baccount[- ]based/, '1:1 ABM', 'Target key accounts'],
    [/\bcontent\b|\bseo\b|\bthought leadership/, 'Content Marketing Strategy', 'Create content that sells'],
  ];
  VS.intentNeeds = function (text) {
    const ix = index();
    const t = String(text || '').toLowerCase();
    const out = [];
    INTENTS.forEach(([re, tag, label]) => { if (re.test(t) && ix.tag.has(tag.toLowerCase()) && !out.some((n) => n.tag === tag)) out.push({ tag, label }); });
    return out;
  };
  VS.localNeeds = function (text, k) {
    k = k || 5;
    const ix = index();
    const anchored = VS.intentNeeds(text).slice(0, k);
    if (anchored.length >= 3) return anchored;
    const u = RN.model.understand ? RN.model.understand(text) : null;
    if (!anchored.length && u && u.filters.roleCategories && words(text).length <= 5) return [];
    const ws = queryWords(text);
    const qs = new Set(ws.map(stem));
    const idf = (w) => { const x = ix.word.get(w); return x ? x.idf : 3; };
    const bow = wordVector(ws);
    const scored = ix.tagList.map((t) => {
      let hit = 0, tot = 0;
      t.words.forEach((w) => { const f = idf(w); tot += f; if (qs.has(w)) hit += f; });
      const lex = tot ? hit / tot : 0;
      const sem = bow ? Math.max(0, dot(bow, t.vec)) : 0;
      return { t, s: 0.6 * lex + 0.4 * sem };
    }).sort((a, b) => b.s - a.s);
    // Anchored intents first; then the strongest word and vector matches, skipping near-duplicates
    const picked = anchored.map((n) => ix.tag.get(n.tag.toLowerCase()));
    const extra = [];
    for (const x of scored) {
      if (x.s < 0.42 || picked.length + extra.length >= Math.min(k, anchored.length + 2)) break;
      if (picked.concat(extra.map((e) => e.t)).every((p) => dot(p.vec, x.t.vec) < 0.75)) extra.push(x);
    }
    return anchored.concat(extra.map((x) => ({ tag: x.t.name, label: x.t.name })));
  };

  // ---------- facts from the request (RN.model.understand), checked per operator ----------
  function factsFor(text) {
    const u = RN.model.understand ? RN.model.understand(text) : null;
    if (!u) return [];
    return u.facts.filter((f) => f.k !== 'q').map((f) => {
      const pass = new Set(RN.model.search({ filters: { [f.k]: f.v } }).map((r) => r.op.id));
      return { k: f.k, v: [].concat(f.v), label: f.label, pass };
    });
  }

  // ---------- rank ----------
  const PROFILE_OP = { industries: 'industries', revenueRange: 'revenueRanges', employeeRange: 'employeeRanges' };
  const PROFILE_FIELD = { industries: 'industry', revenueRange: 'revenueRange', employeeRange: 'employeeRange' };
  VS.rank = function (text, needs, opts) {
    opts = opts || {};
    const ix = index();
    needs = (needs || []).map((n) => Object.assign({}, n, { vec: (ix.tag.get(String(n.tag).toLowerCase()) || {}).vec })).filter((n) => n.vec);
    // The searcher's company (RN.fitme.profile): industry, revenue and size checked against the companies each operator
    // has worked with. What the search words say wins on a conflict, unless the searcher chose their profile instead.
    const prof = opts.profile || null;
    const conflict = [];
    let facts = factsFor(text);
    if (prof) facts = facts.filter((f) => {
      if (!PROFILE_OP[f.k] || !prof[f.k]) return true;
      if (!f.v.some((v) => prof[f.k].includes(v))) conflict.push(f.k);
      return !opts.profileWins;
    });
    const likeKeys = prof ? Object.keys(PROFILE_OP).filter((k) => prof[k] && prof[k].length && !facts.some((f) => f.k === k)) : [];
    const cats = (facts.find((f) => f.k === 'roleCategories') ? RN.model.understand(text).filters.roleCategories : []) || [];
    const q = normed([].concat(needs.map((n) => [n.vec, 1 / Math.max(1, needs.length)]), [[wordVector(queryWords(text)), 0.5]], cats.map((c) => [ix.cat.get(c), 0.3])));
    const pool = opts.pool || RN.model.ops.filter((o) => !o.hidden);
    const sem = new Map(pool.map((op) => [op.id, ix.op.get(op.id) ? dot(q, ix.op.get(op.id)) : 0]));
    const vals = [...sem.values()], lo = Math.min(...vals), hi = Math.max(...vals);
    const rows = pool.map((op) => {
      const opTags = (op.tags || []).map((t) => ({ t, v: ix.tag.get(t.t.toLowerCase()) })).filter((x) => x.v);
      const meets = needs.map((n) => {
        let best = null, bs = -1;
        opTags.forEach((x) => { const s = dot(n.vec, x.v.vec); if (s > bs) { bs = s; best = x.t; } });
        const status = bs >= NEAR ? (best.tier === 'claimed' ? 'claimed' : 'proven') : bs >= CLOSE ? 'close' : 'missing';
        return { need: n, status, sim: Math.max(0, bs), via: best ? best.t : '' };
      });
      const credit = { proven: 1, claimed: 0.7, close: 0.35, missing: 0 };
      const needScore = meets.length ? meets.reduce((s, m) => s + credit[m.status] * (0.75 + 0.25 * m.sim), 0) / meets.length : 0;
      const semN = hi > lo ? (sem.get(op.id) - lo) / (hi - lo) : 1;
      const checks = facts.map((f) => ({ k: f.k, label: f.label, ok: f.pass.has(op.id) }));
      const like = likeKeys.map((k) => ({ k, label: RN.w.label(PROFILE_FIELD[k], prof[k][0]), ok: (op[PROFILE_OP[k]] || []).some((v) => prof[k].includes(v)) }));
      const all = checks.concat(like);
      const factScore = all.length ? all.filter((c) => c.ok).length / all.length : 1;
      const ris = (op.ris && op.ris.score || 50) / 100;
      const w = meets.length ? W : { needs: 0, sem: 0.6, facts: 0.2, ris: 0.2 };
      const score = w.needs * needScore + w.sem * semN + w.facts * factScore + w.ris * ris;
      return { op, score, match: Math.round(100 * score), meets, checks, like, parts: { needs: needScore, sem: semN, facts: factScore, ris } };
    }).sort((a, b) => b.score - a.score);
    return { text, needs: needs.map(({ tag, label }) => ({ tag, label })), facts: facts.map(({ k, label }) => ({ k, label })), like: likeKeys, conflict, rows };
  };

  // ---------- Claude refines the needs (optional) ----------
  let samplePromise = null;
  VS.claude = function () {
    if (!samplePromise) samplePromise = window.claude && window.claude.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
    return samplePromise;
  };
  let claudeOff = false;
  const memo = new Map();
  VS.refined = (text) => memo.get(String(text || '').trim().toLowerCase()) || null;
  VS.refineNeeds = async function (text, signal) {
    const key = text.trim().toLowerCase();
    if (memo.has(key)) return memo.get(key);
    if (claudeOff) return null;
    const sample = await VS.claude();
    if (!sample) return null;
    const ix = index();
    const prompt = `A company is searching a marketplace of fractional go-to-market operators. Read what they wrote and pick the 3 to 5 focus areas from the list that best describe what they need. For each, write a label a 10-year-old would understand, at most 4 words (for example "Answer leads fast", "Fix the CRM", "Hire first sellers").

What they wrote: "${text.replace(/"/g, "'")}"

Focus areas (copy names exactly):
${V.tags.names.join('\n')}

Reply with only JSON: {"needs":[{"tag":"<exact focus area name>","label":"<plain label>"}]}`;
    try {
      const data = await sample.json(prompt, { modelTier: 'quick', signal, cache: { gcTime: 86400000 } });
      const needs = (data && Array.isArray(data.needs) ? data.needs : [])
        .map((n) => ({ tag: (ix.tag.get(String(n.tag || '').toLowerCase()) || {}).name, label: String(n.label || '').slice(0, 40) }))
        .filter((n) => n.tag).slice(0, 5)
        .map((n) => ({ tag: n.tag, label: n.label || n.tag }));
      const out = needs.length ? needs : null;
      memo.set(key, out);
      return out;
    } catch (e) {
      if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e.code)) claudeOff = true;
      return null;
    }
  };
})();
