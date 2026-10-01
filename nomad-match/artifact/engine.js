/* nomad-match engine for the browser: the same matching as nomad_match/matching.py and the same
   rules fallback as nomad_match/intake.py, run on vectors precomputed with all-MiniLM-L6-v2
   (artifact/data.js, written by `python -m nomad_match.export_artifact`). */
(function () {
  const D = window.NM_DATA;
  const W = D.weights;

  // ---------- vectors ----------
  function decode(b64) {
    if (!b64) return [];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const f = new Float32Array(bytes.buffer);
    const out = [];
    for (let i = 0; i < f.length; i += D.dim) out.push(f.subarray(i, i + D.dim));
    return out;
  }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const add = (acc, v, w) => { for (let i = 0; i < acc.length; i++) acc[i] += w * v[i]; };
  const OPS = D.operators.map((o) => Object.assign({}, o, { _doc: decode(o.vec)[0], _eng: decode(o.eng_vecs), _rev: decode(o.review_vecs) }));
  const SAMPLE_VECS = D.samples.map((s) => ({ text: s.text, vec: decode(s.vec)[0] }));
  const ROLE_VECS = Object.fromEntries(Object.entries(D.roles).map(([k, v]) => [k, decode(v)[0]]));
  const TAG_VECS = Object.fromEntries(Object.entries(D.tags).map(([k, v]) => [k.toLowerCase(), { tag: k, vec: decode(v)[0] }]));

  // ---------- query vector: problem + role + mean of tags (matching.query_vector) ----------
  function queryVector(problem, brief) {
    const q = new Float32Array(D.dim);
    const desc = [];
    const sample = SAMPLE_VECS.find((s) => s.text.trim() === problem.trim());
    if (sample) { add(q, sample.vec, W.problem); desc.push(`${W.problem} x problem`); }
    if (brief && ROLE_VECS[brief.role_category]) { add(q, ROLE_VECS[brief.role_category], W.role); desc.push(`${W.role} x role (${brief.role_category})`); }
    const tags = ((brief && brief.inferred_fit_tags) || []).map((t) => TAG_VECS[t.toLowerCase()]).filter(Boolean);
    if (tags.length) {
      const mean = new Float32Array(D.dim);
      tags.forEach((t) => add(mean, t.vec, 1 / tags.length));
      add(q, mean, W.tag_mean);
      desc.push(`${W.tag_mean} x mean of ${tags.length} tag vectors (${tags.map((t) => t.tag).join(", ")})`);
    }
    const n = Math.sqrt(dot(q, q)) || 1;
    for (let i = 0; i < q.length; i++) q[i] /= n;
    let note = "";
    if (!sample) note = "Custom text: the browser can't run the embedding model, so the search uses the brief's role and tags (embedded ahead of time). The local app also embeds the problem text itself.";
    return { q, desc: desc.join(" + "), note };
  }

  // ---------- matching (matching.py) ----------
  const STOP = new Set(["and", "the", "of", "to", "a", "for", "in", "on", "with"]);
  const tokens = (s) => new Set((s.toLowerCase().match(/[a-z0-9$+]+/g) || []).filter((w) => !STOP.has(w)));
  function tagMatch(a, b) {
    a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
    if (a === b || a.includes(b) || b.includes(a)) return true;
    const ta = tokens(a), tb = tokens(b);
    if (!ta.size || !tb.size) return false;
    let inter = 0; ta.forEach((x) => { if (tb.has(x)) inter++; });
    return inter / new Set([...ta, ...tb]).size >= 0.5;
  }
  function hardFilters(op, f) {
    const r = [], av = op.availability;
    if (av.status === "booked") r.push("Booked: no hours available right now");
    if (f.min_hours && av.status !== "booked" && av.hours_per_month < f.min_hours) r.push(`Only ${av.hours_per_month} hrs/month available; you need ${f.min_hours}`);
    if (f.max_rate && op.hourly_rate > f.max_rate) r.push(`Rate $${op.hourly_rate}/hr is above your ceiling of $${f.max_rate}/hr`);
    if (f.revenue_stage && !op.revenue_stage_fit.includes(f.revenue_stage)) r.push(`Works with ${op.revenue_stage_fit.join(", ")} companies, not ${f.revenue_stage}`);
    if (f.industry && !op.industries.map((i) => i.toLowerCase()).includes(f.industry.toLowerCase())) r.push(`No ${f.industry} experience on record`);
    return r;
  }
  const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
  function why(op, eng, escore, matched) {
    const who = op.name.split(" ")[0];
    const where = lowerFirst(eng.company);
    const problem = eng.problem.replace(/\.$/, "");
    const tags = matched.length ? ` Verified for ${matched.slice(0, 2).join(", ")}.` : "";
    return escore >= W.strong_engagement
      ? `${who} has solved this kind of problem before, at ${where}: ${problem}.${tags}`
      : `Closest experience is at ${where}: ${problem}.${tags}`;
  }
  function bestReview(op, q) {
    if (!op.reviews.length) return null;
    let best = 0;
    op.reviews.forEach((r, k) => {
      const b = op.reviews[best];
      const sk = dot(op._rev[k], q), sb = dot(op._rev[best], q);
      if (r.rating > b.rating || (r.rating === b.rating && sk > sb)) best = k;
    });
    const r = op.reviews[best];
    return { quote: r.quote, rating: r.rating, would_hire_again: r.would_hire_again };
  }

  function match(problem, brief, filters) {
    const { q, desc, note } = queryVector(problem, brief);
    const raw = {}, bestEng = {};
    OPS.forEach((op) => {
      let bi = 0, bs = -Infinity;
      op._eng.forEach((v, i) => { const s = dot(v, q); if (s > bs) { bs = s; bi = i; } });
      bestEng[op.id] = [bi, bs];
      op._docScore = dot(op._doc, q);
      raw[op.id] = 0.5 * op._docScore + 0.5 * bs;
    });
    const vals = Object.values(raw), lo = Math.min(...vals), hi = Math.max(...vals);
    const briefTags = (brief && brief.inferred_fit_tags) || [];
    const results = OPS.map((op) => {
      const norm = hi > lo ? (raw[op.id] - lo) / (hi - lo) : 1;
      const verified = op.fit_tags.filter((t) => t.tier !== "self");
      const matched = briefTags.filter((bt) => verified.some((vt) => tagMatch(bt, vt.tag)));
      const coverage = briefTags.length ? matched.length / briefTags.length : 0;
      const rep = op.reputation_index / 99;
      const final = W.semantic * norm + W.reputation * rep + W.tags * coverage;
      const [ei, es] = bestEng[op.id];
      const eng = op.engagements[ei];
      const matchedOpTags = verified.filter((t) => briefTags.some((bt) => tagMatch(bt, t.tag)));
      return {
        id: op.id, name: op.name, headline: op.headline, role_category: op.role_category, location: op.location,
        hourly_rate: op.hourly_rate, availability: op.availability, reputation_index: op.reputation_index,
        review_count: op.reviews.length, filter_reasons: hardFilters(op, filters),
        scores: {
          doc_cosine: op._docScore, best_engagement_cosine: es, semantic_raw: raw[op.id], semantic_normalised: norm,
          reputation_normalised: rep, tag_coverage: coverage, final,
          formula: `0.60 x ${norm.toFixed(2)} + 0.25 x ${rep.toFixed(2)} + 0.15 x ${coverage.toFixed(2)} = ${final.toFixed(3)}`,
        },
        evidence: { engagement: eng, review: bestReview(op, q), matched_tags: matchedOpTags.map((t) => ({ tag: t.tag, tier: t.tier })) },
        why: why(op, eng, es, matchedOpTags.map((t) => t.tag)),
      };
    });
    const pass = results.filter((r) => !r.filter_reasons.length).sort((a, b) => b.scores.final - a.scores.final);
    const fail = results.filter((r) => r.filter_reasons.length).sort((a, b) => b.scores.final - a.scores.final);
    return { query_text: desc, query_note: note, top: pass.slice(0, 3), also_consider: pass.slice(3, 6), filtered_out: fail, weights: { semantic: W.semantic, reputation: W.reputation, tags: W.tags } };
  }

  // ---------- rules-based brief (intake.rules_brief) ----------
  function revenueStageFromText(text) {
    const t = text.toLowerCase();
    if (t.includes("pre-revenue") || t.includes("pre revenue")) return "Pre-revenue";
    const m = t.match(/\$?\s?(\d+(?:\.\d+)?)\s?(m|mm|million|k|thousand)\b/);
    if (m) {
      const n = parseFloat(m[1]) * (["m", "mm", "million"].includes(m[2]) ? 1 : 0.001);
      for (const [limit, stage] of [[1, "Under $1M"], [5, "$1M-$5M"], [20, "$5M-$20M"], [50, "$20M-$50M"]]) if (n < limit) return stage;
      return "$50M+";
    }
    if (t.includes("series a") || t.includes("seed")) return "$1M-$5M";
    if (t.includes("series b")) return "$5M-$20M";
    return null;
  }
  function rulesBrief(text) {
    const t = text.toLowerCase();
    const scored = D.rules.map((r) => ({ hits: r.keywords.filter((k) => t.includes(k)).length, role: r.role, tags: r.tags })).filter((x) => x.hits).sort((a, b) => b.hits - a.hits);
    let role, tags = [];
    if (scored.length) {
      role = scored[0].role;
      scored.forEach((s) => { if (s.role === role) s.tags.forEach((x) => { if (!tags.includes(x)) tags.push(x); }); });
      scored.slice(1, 2).forEach((s) => { if (s.hits >= 2) s.tags.slice(0, 2).forEach((x) => { if (!tags.includes(x)) tags.push(x); }); });
    } else { role = "Fractional VP of Sales"; tags = ["sales process design", "inbound", "outbound"]; }
    [["hubspot", "HubSpot"], ["salesforce", "Salesforce"], ["gong", "Gong"], ["apollo", "Apollo"], ["outreach", "Outreach"], ["saas", t.includes("plg") ? "PLG" : null]]
      .forEach(([kw, tag]) => { if (t.includes(kw) && tag && !tags.includes(tag)) tags.push(tag); });
    const vocab = new Set(D.tag_vocabulary.map((v) => v.toLowerCase()));
    tags = tags.filter((x) => vocab.has(x.toLowerCase())).slice(0, 8);
    const [lo, hi] = D.rate_by_role[role];
    return { role_category: role, inferred_fit_tags: tags, revenue_stage: revenueStageFromText(text) || "$5M-$20M", scope_summary: D.scope_by_role[role], suggested_hours_per_month: 40, rate_range: { min: lo, max: hi }, rationale: "Chosen by keyword rules from the description." };
  }

  // ---------- Claude intake through the page's `sample` capability (intake._claude_intake) ----------
  function intakePrompt(text, answers) {
    const remaining = Math.max(0, D.max_questions - answers.length);
    const system = D.intake_system.replace("{remaining}", String(remaining)).replace("{tags}", D.tag_vocabulary.map((t) => `- ${t}`).join("\n"));
    let convo = `Company's description of what is not working:\n${text}`;
    if (answers.length) convo += "\n\nAnswers to your follow-up questions:\n" + answers.map((a) => `Q: ${a.question}\nA: ${a.answer || "(skipped)"}`).join("\n");
    if (remaining === 0 || answers.length) convo += "\n\nDo not ask any more questions. Return the final brief with an empty follow_up_questions list.";
    const shape = `Reply with only one JSON object, no other text:
{"follow_up_questions": [string, ...], "brief": {"role_category": one of ${JSON.stringify(D.role_categories)}, "inferred_fit_tags": [string, ...], "revenue_stage": one of ${JSON.stringify(D.revenue_stages)}, "scope_summary": string, "suggested_hours_per_month": integer, "rate_range": {"min": integer, "max": integer}, "rationale": string}}`;
    return { prompt: `${system}\n\n${convo}\n\n${shape}`, remaining };
  }
  function cleanBrief(b, text) {
    const fallback = rulesBrief(text);
    if (!b || typeof b !== "object") return fallback;
    const vocab = Object.fromEntries(D.tag_vocabulary.map((t) => [t.toLowerCase(), t]));
    const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : d);
    return {
      role_category: D.role_categories.includes(b.role_category) ? b.role_category : fallback.role_category,
      inferred_fit_tags: (Array.isArray(b.inferred_fit_tags) ? b.inferred_fit_tags : []).map((t) => vocab[String(t).toLowerCase()] || String(t)).slice(0, 8),
      revenue_stage: D.revenue_stages.includes(b.revenue_stage) ? b.revenue_stage : fallback.revenue_stage,
      scope_summary: String(b.scope_summary || fallback.scope_summary),
      suggested_hours_per_month: num(b.suggested_hours_per_month, 40),
      rate_range: { min: num(b.rate_range && b.rate_range.min, fallback.rate_range.min), max: num(b.rate_range && b.rate_range.max, fallback.rate_range.max) },
      rationale: String(b.rationale || ""),
    };
  }

  let samplePromise = null;
  function getSample() {
    if (!samplePromise) samplePromise = window.claude && window.claude.use ? window.claude.use("sample").catch(() => null) : Promise.resolve(null);
    return samplePromise;
  }
  let claudeOff = null; // set once Claude is unavailable for this view

  async function intake(text, answers) {
    const sample = claudeOff ? null : await getSample();
    if (!sample) {
      return { source: "rules", questions: [], brief: rulesBrief(text + " " + answers.map((a) => a.answer || "").join(" ")), note: claudeOff || "Claude isn't available in this view, so this brief came from keyword rules. Matching still runs on the precomputed embeddings." };
    }
    const { prompt, remaining } = intakePrompt(text, answers);
    try {
      const data = await sample.json(prompt);
      const questions = (Array.isArray(data.follow_up_questions) ? data.follow_up_questions : []).map(String).filter((q) => q.trim()).slice(0, remaining);
      return { source: "claude", questions, brief: cleanBrief(data.brief, text), note: null };
    } catch (e) {
      const code = e && e.code;
      const permanent = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];
      const why = code === "not_granted" ? "Claude wasn't allowed for this page" : code === "rate_limited" ? "Claude is busy right now (rate limited); try again in a minute" : code === "invalid_json" ? "Claude's reply couldn't be read" : "Claude was unavailable";
      const msg = `${why}, so this brief came from keyword rules.`;
      if (permanent.includes(code)) claudeOff = msg;
      return { source: "rules", questions: [], brief: rulesBrief(text), note: msg };
    }
  }

  window.NM = { match, intake, getSample, data: D };
})();
