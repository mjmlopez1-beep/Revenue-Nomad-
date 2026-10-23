/* Digital Front Door Index: report page logic.
   Every number and sentence on the page is computed from the dataset at
   render time, so replacing dfd_index.js with measured data rewrites the
   report without touching this file. */
(function () {
  "use strict";

  // ---------- data ----------
  const D = window.DFD_DATA, META = D.meta, COLS = D.cols, GEO = window.US_STATES;
  const N = COLS.system_id.length;
  const SYS = Array.from({ length: N }, (_, i) => { const r = {}; for (const k in COLS) r[k] = COLS[k][i]; return r; });
  const BY_ID = Object.fromEntries(SYS.map(r => [r.system_id, r]));
  const STATES = META.state_names;
  const ST_CODES = Object.keys(STATES).filter(s => GEO.paths[s]);
  const BY_STATE = {}; SYS.forEach(r => (BY_STATE[r.state] = BY_STATE[r.state] || []).push(r));
  const MEASURED_STATES = { OR: META.oregon_measured };
  const PILLARS = [
    { key: "phone", label: "Phone access", short: "Phone", items: ["Share of calls that reach a person", "Time to reach a person", "Phone menu layers", "Calls dropped or held to the cap"] },
    { key: "after_hours", label: "After hours", short: "After hours", items: ["Who answers after 6 p.m.", "Whether an urgent path is offered"] },
    { key: "digital", label: "Digital self-service", short: "Digital", items: ["Online booking for new patients", "Patient portal", "Request forms", "Next available appointment shown", "Tap-to-call on a phone"] },
    { key: "findability", label: "Findability and accessibility", short: "Findability", items: ["Number within two clicks", "Hours within two clicks", "Works on a phone", "Accessibility scan"] },
  ];
  const AH = { live: "Live person", service: "Answering service", voicemail: "Voicemail only", dead: "No answer or message" };
  const AH_KEYS = ["live", "service", "voicemail", "dead"];
  const TYPES = ["Rural health system", "Community health center", "Community hospital", "Multi-specialty group"];
  const RURS = ["Rural", "Micropolitan", "Metro"];
  const SIZES = ["1-4", "5-9", "10-24", "25-49", "50+"];
  const SIZE_LABEL = { "1-4": "1–4 locations", "5-9": "5–9 locations", "10-24": "10–24 locations", "25-49": "25–49 locations", "50+": "50+ locations" };
  const CAP = 1200;

  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = (x, d = 0) => x == null || isNaN(x) ? "–" : (100 * x).toFixed(d) + "%";
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
  const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
  const share = (rows, f) => rows.length ? rows.filter(f).length / rows.length : NaN;
  const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const fmtInt = n => Math.round(n).toLocaleString();
  const fmtWait = s => s == null || isNaN(s) ? "–" : s >= CAP ? "No call answered" : s < 60 ? `${Math.round(s)} sec` : s < 600 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} sec` : `${Math.round(s / 60)} min`;
  const fmtWaitShort = s => s == null || isNaN(s) ? "–" : s >= CAP ? "none" : s < 60 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)} min`;
  const ord = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const bandOf = s => { for (const [l, f] of META.bands) if (s >= f) return l; return "F"; };
  const bandColor = l => css(`--band-${l.toLowerCase()}`);
  const bandChip = (l, lg) => `<span class="band ${l}${lg ? " lg" : ""}" style="background:${bandColor(l)}" aria-label="Grade ${l}">${l}</span>`;
  const MODELED = `<span class="chip modeled">modeled</span>`;
  const MEASURED = `<span class="chip measured">measured</span>`;
  const pearson = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; n += a * b; dx += a * a; dy += b * b; } return n / Math.sqrt(dx * dy || 1); };
  const answered = r => r.calls_reached > 0;
  const pooledAnswer = rows => sum(rows, "calls_reached") / (sum(rows, "calls_placed") || 1);
  const typicalWait = rows => median(rows.filter(answered).map(r => r.time_to_human_s));
  const isGood = o => o === "live" || o === "service";
  const smallNote = n => n < 20 ? ` <span class="muted">(small sample: ${n} systems)</span>` : "";

  function table(headers, rows, opts = {}) {
    const th = headers.map((h, i) => `<th scope="col" class="${opts.num && opts.num.includes(i) ? "n" : ""}">${h}</th>`).join("");
    const tr = rows.map(r => `<tr>${r.map((c, i) => `<td class="${opts.num && opts.num.includes(i) ? "n" : ""}">${c}</td>`).join("")}</tr>`).join("");
    return `<div class="table-wrap${opts.scroll ? " scroll" : ""}"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  }

  // ---------- group statistics ----------
  function stats(rows) {
    return {
      n: rows.length,
      score: mean(rows.map(r => r.dfd_score)),
      phone: mean(rows.map(r => r.phone_score)),
      after_hours: mean(rows.map(r => r.after_hours_score)),
      digital: mean(rows.map(r => r.digital_score)),
      findability: mean(rows.map(r => r.findability_score)),
      answer: pooledAnswer(rows),
      wait: typicalWait(rows),
      booking: share(rows, r => r.online_booking),
      ahGood: share(rows, r => isGood(r.ah_outcome)),
      calls: sum(rows, "calls_placed"),
      lines: sum(rows, "lines_tested"),
    };
  }
  const NAT = stats(SYS);
  const STATE_STATS = Object.fromEntries(ST_CODES.map(s => [s, stats(BY_STATE[s] || [])]));
  const STATE_RANK = Object.fromEntries([...ST_CODES].sort((a, b) => STATE_STATS[b].score - STATE_STATS[a].score).map((s, i) => [s, i + 1]));

  // ---------- charts ----------
  const charts = {};
  function chartDefaults() {
    Chart.defaults.font.family = css("--font-sans");
    Chart.defaults.font.size = 12;
    Chart.defaults.color = css("--chart-axis");
    Chart.defaults.borderColor = css("--chart-grid");
    Chart.defaults.animation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 450 };
    Chart.defaults.plugins.tooltip.backgroundColor = css("--navy");
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
  }
  function draw(id, cfg) {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(el, cfg);
  }
  const pctAxis = { ticks: { callback: v => v + "%" }, beginAtZero: true, max: 100 };
  function bars(id, labels, data, o = {}) {
    draw(id, {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: o.colors || css("--chart-1"), borderRadius: 4, borderSkipped: false, maxBarThickness: o.thick || 44, barPercentage: .82, categoryPercentage: .9 }] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: o.horizontal ? "y" : "x",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => o.tip ? o.tip(c.raw, c.dataIndex) : String(c.raw) } } },
        scales: o.horizontal
          ? { x: Object.assign({ grid: { color: css("--chart-grid") } }, o.pct ? pctAxis : { beginAtZero: true }, o.xTitle ? { title: { display: true, text: o.xTitle } } : {}), y: { grid: { display: false } } }
          : { x: { grid: { display: false }, title: { display: !!o.xTitle, text: o.xTitle } }, y: Object.assign({ grid: { color: css("--chart-grid") }, title: { display: !!o.yTitle, text: o.yTitle } }, o.pct ? pctAxis : { beginAtZero: true }) },
      },
    });
  }
  function histogram(rows, bins = 10) {
    const counts = Array(bins).fill(0);
    rows.forEach(r => counts[Math.min(bins - 1, Math.floor(r.dfd_score / (100 / bins)))]++);
    return { labels: counts.map((_, i) => `${i * 10}–${i * 10 + 10}`), counts };
  }
  function histChart(id, rows, mark) {
    const h = histogram(rows);
    const bin = mark ? Math.min(9, Math.floor(mark.dfd_score / 10)) : -1;
    const colors = h.counts.map((_, i) => i === bin ? css("--accent") : css("--chart-1"));
    bars(id, h.labels, h.counts, { colors, xTitle: "Digital Front Door score", yTitle: "Health systems", tip: (v, i) => `${v} systems${i === bin ? " (includes this system)" : ""}` });
    return h;
  }

  // ---------- cover ----------
  function renderCover() {
    const facts = [
      [fmtInt(N), "health systems"],
      ["50", "states"],
      [fmtInt(NAT.calls), "calls placed"],
      [fmtInt(NAT.lines), "clinic lines"],
      ["Oct 2026", "published"],
    ];
    $("#cover-facts").innerHTML = facts.map(([b, s]) => `<span><b>${b}</b>${s}</span>`).join("");
    const waits = SYS.filter(answered).map(r => r.time_to_human_s);
    const fast = quantile(waits, .1), slow = quantile(waits, .9);
    const am = pooled(SYS, "answer_rate_morning"), pm = pooled(SYS, "answer_rate_afternoon");
    const items = [
      [pct(NAT.answer), `of calls to clinic lines reached a live person. The rest rang out, went to voicemail, dropped or held past 20 minutes.`],
      [`${Math.round(slow / Math.max(1, fast))}×`, `gap in wait time between the fastest tenth of systems (${fmtWaitShort(fast)}) and the slowest tenth (${fmtWaitShort(slow)}).`],
      [`${Math.round((am - pm) * 100)} pts`, `lower answer rate in the early afternoon than mid-morning, on the same clinic lines.`],
      [pct(1 - NAT.booking), `of systems require a new patient to call to book a first appointment.`],
      [pct(share(SYS, r => r.wcag_violations >= 10)), `of websites show 10 or more serious accessibility issues ahead of the May 11, 2027 federal deadline.`],
    ];
    $("#findings").innerHTML = items.map(([n, t]) => `<li class="finding"><div class="big">${n}</div><p>${t}</p></li>`).join("");
  }
  // Call-weighted answer rate for one window.
  function pooled(rows, key) {
    let num = 0, den = 0;
    rows.forEach(r => { if (r[key] != null) { const w = r.lines_tested; num += r[key] * w; den += w; } });
    return den ? num / den : NaN;
  }

  // ---------- map ----------
  const MAP_METRICS = [
    { key: "score", label: "Overall score", get: s => s.score, fmt: v => v.toFixed(1), up: true },
    { key: "phone", label: "Phone access", get: s => s.phone, fmt: v => v.toFixed(1), up: true },
    { key: "after_hours", label: "After hours", get: s => s.after_hours, fmt: v => v.toFixed(1), up: true },
    { key: "digital", label: "Digital self-service", get: s => s.digital, fmt: v => v.toFixed(1), up: true },
    { key: "findability", label: "Findability", get: s => s.findability, fmt: v => v.toFixed(1), up: true },
    { key: "answer", label: "Calls answered", get: s => s.answer, fmt: v => pct(v), up: true },
    { key: "wait", label: "Wait for a person", get: s => s.wait, fmt: v => fmtWaitShort(v), up: false },
    { key: "booking", label: "Online booking", get: s => s.booking, fmt: v => pct(v), up: true },
  ];
  const SEQ = ["#dbe6fb", "#b7cdf6", "#8fb0ef", "#6a93e6", "#4677d6", "#2b5bbf", "#1a4196", "#0d2a6b"];
  let mapMetric = MAP_METRICS[0], selState = "OR";

  function buildMap(svg, onPick, onHover) {
    svg.setAttribute("viewBox", GEO.viewBox);
    const NS = "http://www.w3.org/2000/svg";
    const tiny = new Set(["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "HI"]);
    const paths = {}, labels = {};
    ST_CODES.forEach(s => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", GEO.paths[s]);
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.dataset.state = s;
      p.addEventListener("click", () => onPick(s));
      p.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(s); } });
      if (onHover) {
        p.addEventListener("mousemove", e => onHover(s, e));
        p.addEventListener("mouseleave", () => onHover(null));
        p.addEventListener("focus", () => onHover(s, null, p));
        p.addEventListener("blur", () => onHover(null));
      }
      svg.appendChild(p); paths[s] = p;
    });
    ST_CODES.forEach(s => {
      if (tiny.has(s) || !GEO.labels[s]) return;
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", GEO.labels[s][0]); t.setAttribute("y", GEO.labels[s][1] + 4);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("aria-hidden", "true");
      t.textContent = s; svg.appendChild(t); labels[s] = t;
    });
    return {
      color(values, metric, sel) {
        const vals = Object.values(values).filter(v => !isNaN(v));
        const lo = Math.min(...vals), hi = Math.max(...vals);
        const step = (hi - lo) / SEQ.length || 1;
        const idx = v => { let i = Math.min(SEQ.length - 1, Math.floor((v - lo) / step)); return metric.up ? i : SEQ.length - 1 - i; };
        ST_CODES.forEach(s => {
          const v = values[s], p = paths[s];
          if (v == null || isNaN(v)) { p.style.fill = css("--surface-2"); p.setAttribute("aria-label", `${STATES[s]}: no systems in this view`); if (labels[s]) labels[s].style.fill = css("--ink-muted"); return; }
          const i = idx(v);
          p.style.fill = SEQ[i];
          p.classList.toggle("sel", s === sel);
          p.setAttribute("aria-label", `${STATES[s]}, ${metric.label} ${metric.fmt(v)}`);
          if (labels[s]) labels[s].style.fill = i >= 4 ? "#fff" : "#071d49";
        });
        return { lo, hi, step };
      },
    };
  }

  let mainMap;
  function initMap() {
    const sw = $("#metric-switch");
    sw.innerHTML = MAP_METRICS.map((m, i) => `<button type="button" aria-pressed="${i === 0}" data-k="${m.key}">${m.label}</button>`).join("");
    sw.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      mapMetric = MAP_METRICS.find(m => m.key === b.dataset.k);
      sw.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
      colorMain();
    });
    const tip = $("#map-tip"), card = $(".map-card");
    mainMap = buildMap($("#us-map"), pickState, (s, e, el) => {
      if (!s) { tip.hidden = true; return; }
      const st = STATE_STATS[s], rect = card.getBoundingClientRect();
      let x, y;
      if (e) { x = e.clientX - rect.left; y = e.clientY - rect.top; }
      else { const b = el.getBoundingClientRect(); x = b.left + b.width / 2 - rect.left; y = b.top + b.height / 2 - rect.top; }
      tip.innerHTML = `<b>${STATES[s]}</b><div class="row"><span>Overall score</span><span>${st.score.toFixed(1)} (${bandOf(st.score)})</span></div>`
        + (mapMetric.key !== "score" ? `<div class="row"><span>${mapMetric.label}</span><span>${mapMetric.fmt(mapMetric.get(st))}</span></div>` : "")
        + `<div class="row"><span>Rank among states</span><span>${STATE_RANK[s]} of 50</span></div><div class="row"><span>Systems measured</span><span>${st.n}</span></div>`
        + (MEASURED_STATES[s] ? `<div class="row"><span>Field test</span><span>measured</span></div>` : "");
      tip.style.left = Math.max(100, Math.min(rect.width - 100, x)) + "px";
      tip.style.top = Math.max(110, y) + "px";
      tip.hidden = false;
    });
    const small = $("#small-states");
    ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "HI"].forEach(s => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = s; b.setAttribute("aria-label", STATES[s]);
      b.addEventListener("click", () => pickState(s)); small.appendChild(b);
    });
    const sel = $("#state-select");
    sel.innerHTML = [...ST_CODES].sort((a, b) => STATES[a].localeCompare(STATES[b])).map(s => `<option value="${s}">${STATES[s]}</option>`).join("");
    sel.addEventListener("change", () => pickState(sel.value));
    colorMain();
    renderStatePanel();
    renderStateTable();
  }
  function colorMain() {
    const vals = Object.fromEntries(ST_CODES.map(s => [s, mapMetric.get(STATE_STATS[s])]));
    const sc = mainMap.color(vals, mapMetric, selState);
    legend($("#map-legend"), sc, mapMetric);
  }
  function legend(el, sc, metric) {
    const ramp = SEQ.map(c => `<i style="background:${c}"></i>`).join("");
    const lo = metric.fmt(metric.up ? sc.lo : sc.hi), hi = metric.fmt(metric.up ? sc.hi : sc.lo);
    el.innerHTML = `<span>${metric.label}:</span><span class="num">${lo}</span><span class="ramp" aria-hidden="true">${ramp}</span><span class="num">${hi}</span><span>Darker is better</span> ${MODELED}`;
  }
  function pickState(s) {
    selState = s;
    $("#state-select").value = s;
    colorMain();
    renderStatePanel();
    if (window.matchMedia("(max-width: 960px)").matches) $("#state-panel").scrollIntoView({ block: "start" });
  }

  function gradeBar(rows) {
    const g = ["A", "B", "C", "D", "F"].map(l => [l, rows.filter(r => r.dfd_band === l).length]);
    return `<div class="gradebar" role="img" aria-label="Grades: ${g.map(([l, n]) => `${n} ${l}`).join(", ")}">${g.filter(([, n]) => n).map(([l, n]) => `<span class="${l}" style="flex:${n};background:${bandColor(l)}" title="${n} systems graded ${l}">${n / rows.length > .06 ? l : ""}</span>`).join("")}</div>`;
  }
  function cmpRows(st) {
    return `<div class="cmp-rows">${PILLARS.map(p => `<div class="cmp-row"><span>${p.label}</span><b class="num">${st[p.key].toFixed(1)} <span class="muted" style="font-weight:400">vs ${NAT[p.key].toFixed(1)}</span></b><div class="track" aria-hidden="true"><i style="width:${st[p.key]}%"></i><u style="left:${NAT[p.key]}%"></u></div></div>`).join("")}</div><p class="muted" style="margin:-4px 0 0">Bars show the state average. The dark tick marks the national average.</p>`;
  }
  function stateNarrative(s) {
    const st = STATE_STATS[s], rows = BY_STATE[s];
    const gaps = PILLARS.map(p => ({ p, d: st[p.key] - NAT[p.key] })).sort((a, b) => b.d - a.d);
    const best = gaps[0], worst = gaps[gaps.length - 1];
    const spread = Math.max(...rows.map(r => r.dfd_score)) - Math.min(...rows.map(r => r.dfd_score));
    const dir = Math.abs(st.score - NAT.score) < 1.5 ? "close to the national average" : st.score > NAT.score ? `${(st.score - NAT.score).toFixed(1)} points above the national average` : `${(NAT.score - st.score).toFixed(1)} points below the national average`;
    return `${STATES[s]}'s ${rows.length} measured systems average ${st.score.toFixed(1)}, ${dir}. The state compares best on <b>${best.p.label.toLowerCase()}</b> (${best.d >= 0 ? "+" : ""}${best.d.toFixed(1)}) and least well on <b>${worst.p.label.toLowerCase()}</b> (${worst.d >= 0 ? "+" : ""}${worst.d.toFixed(1)}). The highest and lowest systems in the state are ${spread.toFixed(0)} points apart, so where a patient lives within ${STATES[s]} matters as much as the state itself.`;
  }
  function renderStatePanel() {
    const s = selState, st = STATE_STATS[s], rows = BY_STATE[s];
    const top = [...rows].sort((a, b) => b.dfd_score - a.dfd_score).slice(0, 3);
    const m = MEASURED_STATES[s];
    $("#state-panel").innerHTML = `
      <div class="head"><div><p class="eyebrow" style="margin:0 0 4px">State profile</p><h3>${STATES[s]}</h3></div>${m ? MEASURED : MODELED}</div>
      <div class="bigscore"><b>${st.score.toFixed(1)}</b>${bandChip(bandOf(st.score))}<span class="muted">Rank ${STATE_RANK[s]} of 50</span></div>
      <div class="muted">${st.n} health systems · ${fmtInt(st.calls)} calls to ${fmtInt(st.lines)} clinic lines${smallNote(st.n)}</div>
      ${cmpRows(st)}
      <div class="kv">
        <div><b>${pct(st.answer)}</b><span>Calls reaching a person (U.S. ${pct(NAT.answer)})</span></div>
        <div><b>${fmtWaitShort(st.wait)}</b><span>Typical wait (U.S. ${fmtWaitShort(NAT.wait)})</span></div>
        <div><b>${pct(st.ahGood)}</b><span>Reach a person or service after hours</span></div>
        <div><b>${pct(st.booking)}</b><span>Offer online booking</span></div>
      </div>
      <div class="muted" style="margin-top:6px">Grades of ${STATES[s]} systems</div>${gradeBar(rows)}
      ${m ? `<p class="narr"><b>Measured field test:</b> ${m.calls_reached_person} of ${m.calls} calls (${pct(m.calls_reached_person / m.calls)}) reached a person on ${new Date(m.measured_at + "T12:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}, with a median wait of ${m.median_wait_s} seconds across ${m.clinic_lines} clinic lines.</p>` : ""}
      <p class="narr">${stateNarrative(s)}</p>
      <h4 style="margin:16px 0 6px">Highest-scoring systems</h4>
      ${table(["System", "Score"], top.map(r => [esc(r.system_name), `${r.dfd_score.toFixed(1)} ${bandChip(r.dfd_band)}`]), { num: [1] })}
      <p style="margin:14px 0 0"><a href="${gateIsOpen() ? "#explorer" : "#gate"}" id="panel-full">See every ${STATES[s]} system in the full state report</a></p>`;
    $("#panel-full").addEventListener("click", e => {
      if (!gateIsOpen()) return;
      e.preventDefault();
      const pick = [...rows].sort((a, b) => b.dfd_score - a.dfd_score)[Math.floor(rows.length / 2)];
      select(pick); activateTab("t-state"); $("#explorer").scrollIntoView();
    });
  }

  let stSort = { key: "rank", dir: 1 };
  function renderStateTable() {
    const cols = [
      ["rank", "Rank", s => STATE_RANK[s], v => v],
      ["name", "State", s => STATES[s], v => v],
      ["score", "Score", s => STATE_STATS[s].score, (v, s) => `<span class="inbar"><i style="width:${v}%"></i></span>${v.toFixed(1)} ${bandChip(bandOf(v))}`],
      ["n", "Systems", s => STATE_STATS[s].n, v => v],
      ["answer", "Calls answered", s => STATE_STATS[s].answer, v => pct(v)],
      ["wait", "Typical wait", s => STATE_STATS[s].wait, v => fmtWaitShort(v)],
      ["ah", "After hours", s => STATE_STATS[s].ahGood, v => pct(v)],
      ["booking", "Online booking", s => STATE_STATS[s].booking, v => pct(v)],
    ];
    const c = cols.find(x => x[0] === stSort.key);
    const order = [...ST_CODES].sort((a, b) => { const x = c[2](a), y = c[2](b); return (x > y ? 1 : x < y ? -1 : 0) * stSort.dir; });
    $("#state-table").innerHTML = `<div class="table-wrap scroll"><table aria-label="State rankings"><thead><tr>${cols.map(([k, l], i) => `<th scope="col" class="${i > 1 ? "n" : ""}" aria-sort="${stSort.key === k ? (stSort.dir > 0 ? "ascending" : "descending") : "none"}"><button data-k="${k}">${l}${stSort.key === k ? (stSort.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead><tbody>${order.map(s => `<tr data-state="${s}" tabindex="0">${cols.map(([k, , g, f], i) => `<td class="${i > 1 ? "n" : ""}">${f(g(s), s)}${k === "name" && MEASURED_STATES[s] ? " " + MEASURED : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    $("#state-table").querySelectorAll("th button").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k; stSort = { key: k, dir: stSort.key === k ? -stSort.dir : (k === "rank" || k === "name" || k === "wait" ? 1 : -1) };
      renderStateTable(); $(`#state-table th button[data-k="${k}"]`).focus();
    }));
    $("#state-table").querySelectorAll("tr[data-state]").forEach(tr => {
      const go = () => { pickState(tr.dataset.state); $("#map").scrollIntoView(); };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    });
  }

  // ---------- chapters ----------
  const WAIT_BANDS = [["Under 30 sec", 0, 30], ["30–60 sec", 30, 60], ["1–2 min", 60, 120], ["2–5 min", 120, 300], ["5+ min", 300, CAP], ["No call answered", CAP, Infinity]];
  function renderPhone() {
    const missed = sum(SYS, "calls_placed") - sum(SYS, "calls_reached");
    const held = sum(SYS, "calls_full_hold"), dropped = sum(SYS, "calls_dropped_on_hold");
    const neverLines = sum(SYS, "lines_never_answered");
    $("#phone-lede").innerHTML = `We placed ${fmtInt(NAT.calls)} calls to ${fmtInt(NAT.lines)} published clinic lines. ${pct(NAT.answer)} reached a person. When someone did answer, the typical system's median wait was ${fmtWait(NAT.wait)}, but the spread between systems is wide, and it widens again after lunch.`;
    $("#phone-strip").innerHTML = [
      [fmtInt(NAT.calls), "calls placed"], [pct(NAT.answer), "reached a live person"], [fmtWaitShort(NAT.wait), "typical median wait"],
      [fmtInt(held), "calls held the full 20 minutes"], [pct(neverLines / NAT.lines), "of lines never answered either call"],
    ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");

    const wb = WAIT_BANDS.map(([l, lo, hi]) => share(SYS, r => { const w = answered(r) ? r.time_to_human_s : CAP; return w >= lo && w < hi; }));
    bars("c-wait", WAIT_BANDS.map(b => b[0]), wb.map(v => +(v * 100).toFixed(1)), { pct: true, colors: WAIT_BANDS.map((_, i) => i < 2 ? css("--band-a") : i < 3 ? css("--band-b") : i < 4 ? css("--band-c") : css("--band-f")), tip: v => `${v}% of systems` });
    $("#wait-cap").innerHTML = `<b>${pct(wb[0] + wb[1])}</b> of systems get callers to a person within a minute on a typical call. <b>${pct(wb[4] + wb[5])}</b> keep the typical caller waiting five minutes or more, or never answered.`;
    $("#wait-table").innerHTML = table(["Typical wait", "Share of systems"], WAIT_BANDS.map((b, i) => [b[0], pct(wb[i], 1)]), { num: [1] });

    const groups = [["All systems", SYS], ...TYPES.map(t => [t, SYS.filter(r => r.system_type === t)])];
    const am = groups.map(([, g]) => +(100 * pooled(g, "answer_rate_morning")).toFixed(1));
    const pm = groups.map(([, g]) => +(100 * pooled(g, "answer_rate_afternoon")).toFixed(1));
    draw("c-ampm", {
      type: "bar",
      data: { labels: groups.map(g => g[0].replace(" system", "").replace("Community health center", "Health center")), datasets: [
        { label: "Mid-morning", data: am, backgroundColor: css("--chart-1"), borderRadius: 4, maxBarThickness: 30 },
        { label: "Early afternoon", data: pm, backgroundColor: css("--accent"), borderRadius: 4, maxBarThickness: 30 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw}% answered` } } }, scales: { x: { grid: { display: false } }, y: Object.assign({ grid: { color: css("--chart-grid") } }, pctAxis) } },
    });
    const gapIdx = am.map((v, i) => v - pm[i]);
    const widest = gapIdx.indexOf(Math.max(...gapIdx.slice(1)));
    $("#ampm-cap").innerHTML = `Across all systems, <b>${am[0]}%</b> of mid-morning calls reached a person against <b>${pm[0]}%</b> in the early afternoon. The gap is widest at ${groups[widest][0].toLowerCase()}s (${gapIdx[widest].toFixed(0)} points).`;
    $("#ampm-table").innerHTML = table(["Systems", "Mid-morning", "Early afternoon"], groups.map((g, i) => [g[0], am[i] + "%", pm[i] + "%"]), { num: [1, 2] });

    const layers = [0, 1, 2, 3, 4, 5];
    const med = layers.map(l => median(SYS.filter(r => r.ivr_layers === l && answered(r)).map(r => r.time_to_human_s)));
    const cnt = layers.map(l => SYS.filter(r => r.ivr_layers === l).length);
    bars("c-ivr", layers.map(l => l === 0 ? "None" : String(l)), med.map(v => Math.round(v)), { xTitle: "Menu layers before a person", yTitle: "Median seconds", tip: (v, i) => `${v} sec median (${cnt[i]} systems)` });
    $("#ivr-cap").innerHTML = `Systems that put callers straight through have a median wait of <b>${fmtWait(med[0])}</b>. With ${layers.length - 1} menu layers it is <b>${fmtWait(med[med.length - 1])}</b>.`;
    $("#ivr-table").innerHTML = table(["Menu layers", "Median wait", "Systems"], layers.map((l, i) => [l, fmtWait(med[i]), cnt[i]]), { num: [1, 2] });

    const other = missed - held - dropped;
    const mk = [["Rang out or went to voicemail", other], ["Held, then disconnected", dropped], ["Held the full 20 minutes", held]];
    bars("c-miss", mk.map(m => m[0]), mk.map(m => +(100 * m[1] / missed).toFixed(1)), { horizontal: true, pct: true, colors: [css("--band-c"), css("--band-d"), css("--band-f")], tip: (v, i) => `${v}% (${fmtInt(mk[i][1])} calls)` });
    $("#miss-cap").innerHTML = `Of ${fmtInt(missed)} calls that did not reach anyone, <b>${pct((held + dropped) / missed)}</b> held the caller first, then dropped the call or kept them waiting for the full 20 minutes.`;
    $("#miss-table").innerHTML = table(["Outcome", "Calls", "Share"], mk.map(m => [m[0], fmtInt(m[1]), pct(m[1] / missed, 1)]), { num: [1, 2] });
  }

  function renderAfterHours() {
    const good = share(SYS, r => isGood(r.ah_outcome)), urgent = share(SYS, r => r.ah_urgent_path), dead = share(SYS, r => r.ah_outcome === "dead");
    $("#ah-lede").innerHTML = `Patients do not stop needing care at 5 p.m. We placed one call to each system's main line after 6 p.m. local time. ${pct(good)} of calls reached a live person or an answering service. ${pct(dead)} rang out with no answer and no message.`;
    $("#ah-strip").innerHTML = [[pct(share(SYS, r => r.ah_outcome === "live")), "reached a live person"], [pct(share(SYS, r => r.ah_outcome === "service")), "reached an answering service"], [pct(share(SYS, r => r.ah_outcome === "voicemail")), "voicemail only"], [pct(urgent), "offer an urgent path"]].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
    const groups = [["All systems", SYS], ...TYPES.map(t => [t, SYS.filter(r => r.system_type === t)])];
    const colors = [css("--band-a"), css("--band-b"), css("--band-c"), css("--band-f")];
    draw("c-ah", {
      type: "bar",
      data: { labels: groups.map(g => g[0]), datasets: AH_KEYS.map((k, i) => ({ label: AH[k], data: groups.map(([, g]) => +(100 * share(g, r => r.ah_outcome === k)).toFixed(1)), backgroundColor: colors[i], borderColor: css("--surface"), borderWidth: { right: 2 }, borderSkipped: false, maxBarThickness: 34 })) },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw}%` } } }, scales: { x: Object.assign({ stacked: true, grid: { color: css("--chart-grid") } }, pctAxis), y: { stacked: true, grid: { display: false } } } },
    });
    const byType = TYPES.map(t => [t, share(SYS.filter(r => r.system_type === t), r => isGood(r.ah_outcome))]).sort((a, b) => b[1] - a[1]);
    $("#ah-cap").innerHTML = `${byType[0][0]}s are most likely to put a caller through to a person or service after hours (<b>${pct(byType[0][1])}</b>). ${byType[byType.length - 1][0]}s are least likely (<b>${pct(byType[byType.length - 1][1])}</b>).`;
    $("#ah-table").innerHTML = table(["Systems", ...AH_KEYS.map(k => AH[k])], groups.map(([l, g]) => [l, ...AH_KEYS.map(k => pct(share(g, r => r.ah_outcome === k), 1))]), { num: [1, 2, 3, 4] });
    const ur = RURS.map(z => share(SYS.filter(r => r.rurality === z), r => r.ah_urgent_path));
    bars("c-urgent", ["All systems", ...RURS], [urgent, ...ur].map(v => +(100 * v).toFixed(1)), { pct: true, colors: [css("--chart-1"), css("--band-b"), css("--band-b"), css("--band-b")], tip: v => `${v}% offer an urgent path` });
    $("#urgent-cap").innerHTML = `<b>${pct(1 - urgent)}</b> of systems give an after-hours caller no direction for something that can't wait until morning, such as a nurse line, an on-call provider or emergency guidance.`;
    $("#urgent-table").innerHTML = table(["Setting", "Offer an urgent path"], [["All systems", pct(urgent, 1)], ...RURS.map((z, i) => [z, pct(ur[i], 1)])], { num: [1] });
  }

  function renderDigital() {
    const feats = [["Patient portal", "patient_portal"], ["Tap-to-call on a phone", "click_to_call"], ["Appointment request form", "request_forms"], ["Online booking for new patients", "online_booking"], ["Next available time shown", "next_available_visible"]];
    const v = feats.map(([, k]) => share(SYS, r => r[k]));
    $("#dg-lede").innerHTML = `Nearly every system has a patient portal, but a portal serves existing patients. For someone new, the question is whether they can book without calling. ${pct(NAT.booking)} of systems let them. ${pct(share(SYS, r => r.next_available_visible))} show when the next appointment is open.`;
    bars("c-feat", feats.map(f => f[0]), v.map(x => +(100 * x).toFixed(1)), { horizontal: true, pct: true, tip: x => `${x}% of systems` });
    $("#feat-cap").innerHTML = `The gap between having a portal (<b>${pct(v[0])}</b>) and offering online booking to new patients (<b>${pct(v[3])}</b>) is the largest in the digital chapter.`;
    $("#feat-table").innerHTML = table(["Capability", "Share of systems"], feats.map((f, i) => [f[0], pct(v[i], 1)]), { num: [1] });
    const bs = SIZES.map(z => share(SYS.filter(r => r.size_band === z), r => r.online_booking));
    const bn = SIZES.map(z => SYS.filter(r => r.size_band === z).length);
    bars("c-book", SIZES.map(z => SIZE_LABEL[z].replace(" locations", "")), bs.map(x => +(100 * x).toFixed(1)), { pct: true, xTitle: "Number of locations", tip: (x, i) => `${x}% of ${bn[i]} systems` });
    $("#book-cap").innerHTML = `Online booking rises with size, from <b>${pct(bs[0])}</b> of systems with 1–4 locations to <b>${pct(bs[bs.length - 1])}</b> of those with 50 or more.`;
    $("#book-table").innerHTML = table(["Locations", "Offer online booking", "Systems"], SIZES.map((z, i) => [SIZE_LABEL[z], pct(bs[i], 1), bn[i]]), { num: [1, 2] });
  }

  function renderFindability() {
    const checks = [["Works well on a phone", "mobile_responsive"], ["Main number within two clicks", "number_within_2_clicks"], ["Hours within two clicks", "hours_within_2_clicks"]];
    const v = checks.map(([, k]) => share(SYS, r => r[k]));
    const bins = [["None", 0, 0], ["1–5", 1, 5], ["6–10", 6, 10], ["11–20", 11, 20], ["21–30", 21, 30], ["31+", 31, 999]];
    const bv = bins.map(([, lo, hi]) => share(SYS, r => r.wcag_violations >= lo && r.wcag_violations <= hi));
    $("#fd-lede").innerHTML = `Before a patient can call, they need the number and the hours. ${pct(share(SYS, r => r.number_within_2_clicks && r.hours_within_2_clicks))} of system websites put both within two clicks of the home page. Under a federal rule (Section 504 of the Rehabilitation Act), health system websites must meet the web accessibility standard by May 11, 2027.`;
    bars("c-find", checks.map(c => c[0]), v.map(x => +(100 * x).toFixed(1)), { horizontal: true, pct: true, tip: x => `${x}% pass` });
    $("#find-cap").innerHTML = `Hours are the item patients most often can't find: <b>${pct(1 - v[2])}</b> of websites bury them more than two clicks deep.`;
    $("#find-table").innerHTML = table(["Check", "Share passing"], checks.map((c, i) => [c[0], pct(v[i], 1)]), { num: [1] });
    bars("c-wcag", bins.map(b => b[0]), bv.map(x => +(100 * x).toFixed(1)), { pct: true, xTitle: "Serious issues found", colors: bins.map((_, i) => i === 0 ? css("--band-a") : i < 3 ? css("--band-c") : css("--band-f")), tip: x => `${x}% of websites` });
    $("#wcag-cap").innerHTML = `Only <b>${pct(bv[0])}</b> of websites showed no serious issues. The median website had <b>${median(SYS.map(r => r.wcag_violations))}</b>.`;
    $("#wcag-table").innerHTML = table(["Serious issues", "Share of websites"], bins.map((b, i) => [b[0], pct(bv[i], 1)]), { num: [1] });
  }

  function quartileRows(rows) {
    const sc = rows.map(r => r.dfd_score), q1 = quantile(sc, .25), q3 = quantile(sc, .75);
    const top = rows.filter(r => r.dfd_score >= q3), bot = rows.filter(r => r.dfd_score <= q1);
    return { top, bot, rows: [
      ["Calls reaching a person", pct(pooledAnswer(top)), pct(pooledAnswer(bot))],
      ["Typical wait for a person", fmtWaitShort(typicalWait(top)), fmtWaitShort(typicalWait(bot))],
      ["Afternoon answer rate", pct(pooled(top, "answer_rate_afternoon")), pct(pooled(bot, "answer_rate_afternoon"))],
      ["Average phone menu layers", mean(top.map(r => r.ivr_layers)).toFixed(1), mean(bot.map(r => r.ivr_layers)).toFixed(1)],
      ["Person or service after hours", pct(share(top, r => isGood(r.ah_outcome))), pct(share(bot, r => isGood(r.ah_outcome)))],
      ["Online booking for new patients", pct(share(top, r => r.online_booking)), pct(share(bot, r => r.online_booking))],
      ["Median accessibility issues", median(top.map(r => r.wcag_violations)), median(bot.map(r => r.wcag_violations))],
    ] };
  }
  function renderLeaders() {
    const q = quartileRows(SYS);
    $("#quart-table").innerHTML = table(["Measure", "Top 25%", "Bottom 25%"], q.rows, { num: [1, 2] });
    const groups = [...TYPES.map(t => [t, SYS.filter(r => r.system_type === t)]), ...RURS.map(z => [z + " setting", SYS.filter(r => r.rurality === z)])];
    const iqr = groups.map(([, g]) => [quantile(g.map(r => r.dfd_score), .25), quantile(g.map(r => r.dfd_score), .75)]);
    const med = groups.map(([, g]) => median(g.map(r => r.dfd_score)));
    draw("c-type", {
      type: "bar",
      data: { labels: groups.map(g => g[0]), datasets: [
        { type: "line", label: "Median", data: med, showLine: false, pointRadius: 7, pointHoverRadius: 8, pointStyle: "rectRot", backgroundColor: css("--accent"), borderColor: css("--surface"), borderWidth: 2 },
        { label: "Middle half of systems", data: iqr, backgroundColor: groups.map((_, i) => i < TYPES.length ? css("--chart-1") : css("--band-b")), borderRadius: 4, borderSkipped: false, barPercentage: .55 },
      ] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: { label: c => Array.isArray(c.raw) ? `Middle half: ${c.raw[0].toFixed(0)}–${c.raw[1].toFixed(0)}` : `Median: ${c.raw.toFixed(1)}` } } }, scales: { x: { min: Math.max(0, Math.floor(Math.min(...iqr.map(v => v[0])) / 10) * 10 - 10), max: Math.min(100, Math.ceil(Math.max(...iqr.map(v => v[1])) / 10) * 10 + 10), grid: { color: css("--chart-grid") }, title: { display: true, text: "Digital Front Door score" } }, y: { grid: { display: false } } } },
    });
    const sortedT = TYPES.map((t, i) => [t, med[i]]).sort((a, b) => b[1] - a[1]);
    $("#type-cap").innerHTML = `The ranges overlap heavily. Type and setting explain far less than what an individual system does: the middle half of every group spans roughly 20 points or more.`;
    $("#type-table").innerHTML = table(["Group", "Median", "Middle half", "Systems"], groups.map((g, i) => [g[0], med[i].toFixed(1), `${iqr[i][0].toFixed(0)}–${iqr[i][1].toFixed(0)}`, g[1].length]), { num: [1, 2, 3] });
    const r = pearson(SYS.map(x => Math.log(x.location_count)), SYS.map(x => x.dfd_score));
    $("#ld-lede").innerHTML = `Size barely predicts the score (correlation ${r.toFixed(2)}). What separates the top quarter is operational: they answer more calls, keep menus short, hold up in the afternoon, and give new patients a way to book online. The median ${sortedT[0][0].toLowerCase()} scores ${sortedT[0][1].toFixed(0)}, against ${sortedT[sortedT.length - 1][1].toFixed(0)} for the median ${sortedT[sortedT.length - 1][0].toLowerCase()}.`;
  }

  function renderMethod() {
    $("#pillars").innerHTML = PILLARS.map((p, i) => `<div class="card pillar"><div class="no">0${i + 1}</div><h3>${p.label}</h3><div class="w">${Math.round(META.weights[p.key] * 100)}% of the score</div><div class="weight" aria-hidden="true"><i style="width:${META.weights[p.key] * 100 / .35}%"></i></div><ul>${p.items.map(x => `<li>${x}</li>`).join("")}</ul></div>`).join("");
    const g = META.bands.map(([l, f], i) => [bandChip(l), i === 0 ? `${f}–100` : `${f}–${META.bands[i - 1][1] - 1}`, `${pct(share(SYS, r => r.dfd_band === l), 1)}`]);
    $("#grade-key").innerHTML = table(["Grade", "Score range", "Share of systems"], g, { num: [2] });
  }

  function renderOregon() {
    const o = META.oregon_measured;
    $("#or-stats").innerHTML = [
      [pct(o.calls_reached_person / o.calls), `of ${o.calls} calls reached a live person (${o.calls_reached_person} of ${o.calls}).`],
      [`${o.median_wait_s} sec`, `median wait for a person. The average was ${Math.round(o.mean_wait_s / 60)} minutes, pulled up by a long tail.`],
      ["1 in 4", "answered calls waited more than 2 minutes. 1 in 10 waited more than 5."],
      [String(o.calls_hit_20min_cap), `calls never reached anyone within 20 minutes. ${o.lines_hold_then_disconnect} lines put us on hold and then hung up.`],
    ].map(([n, t]) => `<div class="or-stat"><div class="n">${n}</div><p>${t}</p></div>`).join("");
  }

  // ---------- gate ----------
  const GATE_KEY = "dfd_gate_v1";
  const FREE = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com", "live.com", "msn.com", "protonmail.com", "proton.me", "gmx.com", "mail.com", "ymail.com", "comcast.net", "att.net", "verizon.net"];
  function gateIsOpen() { try { return !!localStorage.getItem(GATE_KEY); } catch (e) { return !$("#explorer").hidden; } }
  function initGate() {
    const f = $("#gate-form");
    f.addEventListener("submit", e => {
      e.preventDefault();
      const v = { name: f.name.value.trim(), email: f.email.value.trim(), org: f.org.value.trim(), state: f.state.value, role: f.role.value };
      const errs = {};
      if (!v.name) errs.name = "Please enter your name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.email = "Please enter a valid email address.";
      else if (FREE.includes(v.email.split("@")[1].toLowerCase())) errs.email = "Please use your work email. We send the report to organizational addresses only.";
      if (!v.org) errs.org = "Please enter your organization.";
      if (!v.state) errs.state = "Please choose your state.";
      if (!v.role) errs.role = "Please choose a role.";
      for (const k of ["name", "email", "org", "state", "role"]) { $("#e-" + k).textContent = errs[k] || ""; f[k].setAttribute("aria-invalid", errs[k] ? "true" : "false"); }
      const first = Object.keys(errs)[0];
      if (first) { f[first].focus(); return; }
      const [firstName, ...rest] = v.name.split(/\s+/);
      const lead = { first_name: firstName, last_name: rest.join(" ") || "-", email: v.email, company: v.org, state: v.state, title: v.role, lead_source: "Digital Front Door Index 2026", campaign: "digital-front-door-index-2026", submitted_at: new Date().toISOString() };
      console.log("[Index gate] web-to-lead payload", lead);
      try { localStorage.setItem(GATE_KEY, JSON.stringify(lead)); } catch (e2) { /* private mode: reveal anyway */ }
      unlock(true, lead);
    });
  }
  function initStateSelect(el) {
    el.innerHTML = `<option value="">Choose a state</option>` + [...ST_CODES].sort((a, b) => STATES[a].localeCompare(STATES[b])).map(s => `<option value="${s}">${STATES[s]}</option>`).join("");
  }
  function storedLead() { try { return JSON.parse(localStorage.getItem(GATE_KEY)); } catch (e) { return null; } }
  function unlock(fromSubmit, lead) {
    $("#gate").hidden = true;
    $("#explorer").hidden = false;
    initExplorer(lead || storedLead());
    renderStatePanel();
    if (fromSubmit) $("#x-h").focus();
  }

  // ---------- explorer ----------
  let current = null, ready = false, natF = { type: "", size: "", rur: "" }, natMap = null, exampleFor = null;

  // Match a visitor to their system: website domain first, then a unique
  // organization-name match (preferring their state). Ambiguous names return
  // the candidates so the visitor can choose.
  const STOP = new Set(["the", "of", "and", "inc", "llc", "health", "healthcare", "system", "systems", "medical", "center", "centers", "hospital", "clinic", "clinics", "group", "regional", "community", "family", "care", "partners", "network"]);
  const norm = t => String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !STOP.has(w)).join(" ");
  function matchSystem(lead) {
    if (!lead) return null;
    const dom = String(lead.email || "").split("@")[1]?.toLowerCase().replace(/^www\./, "") || "";
    const byDomain = SYS.find(r => r.website && (dom === r.website || dom.endsWith("." + r.website)));
    if (byDomain) return { r: byDomain, how: "your email domain" };
    const o = norm(lead.company);
    if (o.length < 4) return null;
    const cands = SYS.filter(r => { const n = norm(r.system_name); return n && (n === o || n.startsWith(o + " ") || o.startsWith(n + " ") || n === o.split(" ")[0]); });
    const inState = cands.filter(r => r.state === lead.state);
    const pool = inState.length ? inState : cands;
    if (pool.length === 1) return { r: pool[0], how: "your organization's name" };
    if (pool.length > 1) return { cands: pool.slice(0, 5) };
    return null;
  }
  function note(html) {
    let el = $("#match-note");
    if (!el) { el = document.createElement("div"); el.id = "match-note"; el.className = "match-note"; el.setAttribute("aria-live", "polite"); $(".picker").after(el); }
    el.innerHTML = html; el.hidden = !html;
  }
  function initExplorer(lead) {
    if (ready) return; ready = true;
    initPicker(); initTabs(); initRequest(lead);
    $("#cta-btn").addEventListener("click", () => {
      if (exampleFor) { $("#cta-msg").innerHTML = `This is an example report. <a href="#request" class="req-open">Request a benchmark</a> to get line-by-line results for ${esc(exampleFor.name)}.`; return; }
      console.log("[Index] line-level results requested", { system_id: current.system_id, system_name: current.system_name, lead: storedLead() });
      $("#cta-msg").textContent = `Thanks. The line-by-line results for ${current.system_name} will arrive by email within two business days.`;
    });
    const m = matchSystem(lead);
    if (m && m.r) {
      select(m.r);
      note(`We matched you to <b>${esc(m.r.system_name)}</b> using ${m.how}. Not right? Search for your system above, or <a href="#request" class="req-open">request a benchmark</a>.`);
      return;
    }
    // No match: open the visitor's state with an example report, and put the
    // benchmark request in front of them.
    const st = lead && BY_STATE[lead.state] ? lead.state : selState;
    const pool = BY_STATE[st].slice().sort((a, b) => a.dfd_score - b.dfd_score);
    exampleFor = lead ? { name: lead.company || "your system", state: st } : null;
    select(pool[Math.floor(pool.length / 2)]);
    if (lead) {
      showRequest(false);
      const choices = m && m.cands ? ` Is one of these yours? ${m.cands.map(r => `<button type="button" class="linkbtn" data-id="${r.system_id}">${esc(r.system_name)} (${r.state})</button>`).join(" ")}` : "";
      note(`<b>${esc(lead.company)}</b> isn't in the index yet. Below is ${STATES[st]}'s state report and an example system report, and the form above requests a benchmark for your system.${choices}`);
      document.querySelectorAll("#match-note .linkbtn").forEach(b => b.addEventListener("click", () => { exampleFor = null; select(BY_ID[b.dataset.id]); note(`Showing <b>${esc(BY_ID[b.dataset.id].system_name)}</b>.`); $("#request").hidden = true; }));
      activateTab("t-state");
    }
  }
  function initRequest(lead) {
    const opts = `<option value="">Choose a state</option>` + [...ST_CODES].sort((a, b) => STATES[a].localeCompare(STATES[b])).map(s => `<option value="${s}">${STATES[s]}</option>`).join("");
    $("#r-state").innerHTML = opts;
    if (lead) { $("#r-name").value = lead.company || ""; $("#r-state").value = lead.state || ""; const d = String(lead.email || "").split("@")[1]; if (d) $("#r-site").value = d; }
    document.addEventListener("click", e => { const a = e.target.closest(".req-open"); if (a) { e.preventDefault(); showRequest(true); } });
    const f = $("#req-form");
    f.addEventListener("submit", e => {
      e.preventDefault();
      const v = { sysname: f.sysname.value.trim(), site: f.site.value.trim(), state: f.state.value, locs: f.locs.value };
      const errs = {};
      if (!v.sysname) errs.sysname = ["r-name", "Please enter the system's name."];
      if (!/^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(v.site.replace(/^https?:\/\//, ""))) errs.site = ["r-site", "Please enter the system's website, for example example.org."];
      if (!v.state) errs.state = ["r-state", "Please choose a state."];
      if (!v.locs) errs.locs = ["r-locs", "Please choose the number of locations."];
      [["sysname", "r-name"], ["site", "r-site"], ["state", "r-state"], ["locs", "r-locs"]].forEach(([k, id]) => { $("#e-" + id).textContent = errs[k] ? errs[k][1] : ""; $("#" + id).setAttribute("aria-invalid", errs[k] ? "true" : "false"); });
      const first = Object.values(errs)[0];
      if (first) { $("#" + first[0]).focus(); return; }
      const req = { event: "benchmark_request", system_name: v.sysname, website: v.site, state: v.state, locations: v.locs, requested_by: storedLead(), requested_at: new Date().toISOString() };
      console.log("[Index] benchmark request", req);
      const who = req.requested_by && req.requested_by.email;
      $("#req-msg").textContent = `Request received for ${v.sysname}. We'll email the report${who ? " to " + who : ""} when the measurement is complete.`;
      f.querySelector("button[type=submit]").disabled = true;
    });
  }
  function showRequest(focus) {
    const card = $("#request");
    card.hidden = false;
    const q = $("#sys-q").value.trim();
    if (q && !$("#r-name").value) $("#r-name").value = q;
    if (focus) { card.scrollIntoView({ block: "start" }); $("#r-name").focus(); }
  }
  function initPicker() {
    const q = $("#sys-q"), list = $("#sys-list");
    let items = [], active = -1;
    const close = () => { list.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); active = -1; };
    const paint = () => [...list.children].forEach((li, i) => li.setAttribute("aria-selected", i === active ? "true" : "false"));
    q.addEventListener("input", () => {
      const t = q.value.trim().toLowerCase();
      if (t.length < 2) { close(); return; }
      items = SYS.filter(r => r.system_name.toLowerCase().includes(t) || STATES[r.state].toLowerCase().startsWith(t) || r.state.toLowerCase() === t).slice(0, 12);
      list.innerHTML = items.length ? items.map((r, i) => `<li role="option" id="opt-${i}" data-id="${r.system_id}">${esc(r.system_name)} <small>${STATES[r.state]} · ${r.system_type}</small></li>`).join("") : `<li role="option" id="opt-req" data-req="1">No matching systems. <b>Request a benchmark for “${esc(q.value.trim())}”</b></li>`;
      list.hidden = false; q.setAttribute("aria-expanded", "true"); active = -1;
    });
    q.addEventListener("keydown", e => {
      if (list.hidden) return;
      if (e.key === "ArrowDown") active = Math.min(items.length - 1, active + 1);
      else if (e.key === "ArrowUp") active = Math.max(0, active - 1);
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); userPick(items[active]); close(); q.value = ""; return; }
      else if (e.key === "Enter" && !items.length) { e.preventDefault(); close(); showRequest(true); return; }
      else if (e.key === "Escape") { close(); return; }
      else return;
      e.preventDefault(); paint(); if (active >= 0) q.setAttribute("aria-activedescendant", "opt-" + active);
    });
    list.addEventListener("mousedown", e => {
      const li = e.target.closest("li[data-id], li[data-req]"); if (!li) return;
      e.preventDefault(); close();
      if (li.dataset.req) { showRequest(true); return; }
      userPick(BY_ID[li.dataset.id]); q.value = "";
    });
    q.addEventListener("blur", () => setTimeout(close, 120));
  }
  function initTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => activateTab(t.id));
      t.addEventListener("keydown", e => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        if (e.key === "Home") j = 0; if (e.key === "End") j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); tabs[j].focus(); activateTab(tabs[j].id); }
      });
    });
  }
  function activateTab(id) {
    document.querySelectorAll('[role="tab"]').forEach(x => { const on = x.id === id; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute("aria-controls")).hidden = !on; });
    renderActive();
  }
  function userPick(r) { exampleFor = null; note(""); select(r); }
  function select(r) {
    current = r;
    $("#picked").innerHTML = exampleFor
      ? `Example report: <b>${esc(r.system_name)}</b>, a typical ${STATES[r.state]} ${r.system_type.toLowerCase()}. Search above to open any other system.`
      : `Showing <b>${esc(r.system_name)}</b> · ${r.system_type} · ${STATES[r.state]} · ${r.location_count} locations · ${r.rurality} ${MODELED}`;
    renderActive();
  }
  function renderActive() {
    if (!current) return;
    const t = document.querySelector('[role="tab"][aria-selected="true"]').id;
    ({ "t-sys": renderSystem, "t-state": renderStateReport, "t-peers": renderPeers, "t-nat": renderNational })[t]();
  }

  // Peer group: same type, size band and setting; widened step by step until it holds 20+ systems.
  function cohortOf(r) {
    const ladder = [
      [x => x.system_type === r.system_type && x.size_band === r.size_band && x.rurality === r.rurality, `${r.system_type.toLowerCase()}s with ${SIZE_LABEL[r.size_band]} in ${r.rurality.toLowerCase()} areas`],
      [x => x.system_type === r.system_type && x.rurality === r.rurality, `${r.system_type.toLowerCase()}s in ${r.rurality.toLowerCase()} areas, all sizes`],
      [x => x.system_type === r.system_type && x.size_band === r.size_band, `${r.system_type.toLowerCase()}s with ${SIZE_LABEL[r.size_band]}, all settings`],
      [x => x.system_type === r.system_type, `all ${r.system_type.toLowerCase()}s`],
    ];
    for (const [f, label] of ladder) { const rows = SYS.filter(f); if (rows.length >= 20) return { rows, label }; }
    return { rows: SYS, label: "all systems" };
  }

  // Metric catalogue for system comparisons. better(x) returns a number where higher is better.
  const AH_PTS = { live: 100, service: 80, voicemail: 30, dead: 0 };
  const M = [
    { k: "answer", p: "phone", label: "Calls reaching a person", val: r => pct(r.answer_rate), better: r => r.answer_rate, lost: r => META.weights.phone * .40 * (100 - 100 * r.answer_rate), good: r => `<b>${pct(r.answer_rate)} of calls reach a person</b>, more than {p} of similar systems.`, bad: r => `<b>${pct(r.answer_rate)} of calls reach a person.</b> {p} of similar systems answer more often.` },
    { k: "wait", p: "phone", label: "Typical wait for a person", val: r => answered(r) ? fmtWaitShort(r.time_to_human_s) : "No answer", better: r => -(answered(r) ? r.time_to_human_s : CAP), lost: r => META.weights.phone * .35 * (100 - (r.time_to_human_s <= 1 ? 100 : Math.max(0, 100 * (1 - Math.log(answered(r) ? r.time_to_human_s : CAP) / Math.log(CAP))))), good: r => `<b>Callers reach a person in ${fmtWait(r.time_to_human_s)}</b>, faster than {p} of similar systems.`, bad: r => answered(r) ? `<b>Callers wait ${fmtWait(r.time_to_human_s)} for a person.</b> That is slower than {p} of similar systems.` : `<b>No test call reached a person.</b>` },
    { k: "ivr", p: "phone", label: "Phone menu layers", val: r => String(r.ivr_layers), better: r => -r.ivr_layers, lost: r => META.weights.phone * .15 * Math.min(100, 22 * Math.max(0, r.ivr_layers - 1)), good: r => `<b>${r.ivr_layers <= 1 ? "Callers go almost straight to a person" : `Only ${r.ivr_layers} menu layers`}</b>, fewer than {p} of similar systems.`, bad: r => `<b>Callers go through ${r.ivr_layers} layers of phone menus</b> before reaching anyone.` },
    { k: "abandon", p: "phone", label: "Calls dropped or held to the cap", val: r => pct(r.abandon_rate), better: r => -r.abandon_rate, lost: r => META.weights.phone * .10 * Math.min(100, 100 * r.abandon_rate / .30), good: r => `<b>Few calls drop while on hold</b> (${pct(r.abandon_rate)}), better than {p} of similar systems.`, bad: r => `<b>${pct(r.abandon_rate)} of calls were dropped on hold or held for the full 20 minutes.</b>` },
    { k: "pm", p: "phone", label: "Afternoon answer rate", val: r => pct(r.answer_rate_afternoon), better: r => r.answer_rate_afternoon ?? 0, lost: () => 0, good: r => `<b>Holds up in the afternoon:</b> ${pct(r.answer_rate_afternoon)} of early-afternoon calls answered, above {p} of similar systems.`, bad: () => "" },
    { k: "ah", p: "after_hours", label: "After-hours call", val: r => AH[r.ah_outcome], better: r => AH_PTS[r.ah_outcome], lost: r => META.weights.after_hours * .75 * (100 - AH_PTS[r.ah_outcome]), good: r => `<b>After hours, callers reach ${AH[r.ah_outcome].toLowerCase()}.</b>`, bad: r => r.ah_outcome === "dead" ? `<b>After hours, the main line rings out with no message.</b>` : `<b>After hours, callers reach voicemail only.</b> {g} of similar systems put callers through to a person or service.`, g: rows => share(rows, x => isGood(x.ah_outcome)) },
    { k: "urgent", p: "after_hours", bool: "ah_urgent_path", label: "Urgent path offered", lost: r => META.weights.after_hours * .25 * (r.ah_urgent_path ? 0 : 100), good: () => `<b>Offers an urgent path after hours</b>, which {g} of similar systems do.`, bad: () => `<b>No urgent path after hours.</b> Nothing tells a caller what to do if it can't wait.` },
    { k: "booking", p: "digital", bool: "online_booking", label: "Online booking for new patients", lost: r => META.weights.digital * 35 * !r.online_booking, good: () => `<b>New patients can book online</b>, which only {g} of similar systems offer.`, bad: () => `<b>A new patient can't book online.</b> {g} of similar systems offer it.` },
    { k: "portal", p: "digital", bool: "patient_portal", label: "Patient portal", lost: r => META.weights.digital * 20 * !r.patient_portal, good: () => `<b>Patient portal linked from the site.</b>`, bad: () => `<b>No patient portal linked from the website.</b>` },
    { k: "forms", p: "digital", bool: "request_forms", label: "Appointment request form", lost: r => META.weights.digital * 15 * !r.request_forms, good: () => `<b>Appointment request form available.</b>`, bad: () => `<b>No appointment request form.</b>` },
    { k: "next", p: "digital", bool: "next_available_visible", label: "Next available time shown", lost: r => META.weights.digital * 15 * !r.next_available_visible, good: () => `<b>Shows the next available appointment</b>, which only {g} of similar systems do.`, bad: () => `<b>The website doesn't show when the next appointment is open.</b>` },
    { k: "c2c", p: "digital", bool: "click_to_call", label: "Tap-to-call on a phone", lost: r => META.weights.digital * 15 * !r.click_to_call, good: () => `<b>Tap-to-call works on a phone.</b>`, bad: () => `<b>On a phone, the number isn't tap-to-call.</b>` },
    { k: "num2", p: "findability", bool: "number_within_2_clicks", label: "Number within two clicks", lost: r => META.weights.findability * 30 * !r.number_within_2_clicks, good: () => `<b>The main number is within two clicks.</b>`, bad: () => `<b>The main number takes more than two clicks to find.</b>` },
    { k: "hours2", p: "findability", bool: "hours_within_2_clicks", label: "Hours within two clicks", lost: r => META.weights.findability * 20 * !r.hours_within_2_clicks, good: () => `<b>Hours are within two clicks.</b>`, bad: () => `<b>Hours take more than two clicks to find.</b>` },
    { k: "mobile", p: "findability", bool: "mobile_responsive", label: "Works on a phone", lost: r => META.weights.findability * 20 * !r.mobile_responsive, good: () => `<b>The website works well on a phone.</b>`, bad: () => `<b>The website doesn't fit a phone screen.</b>` },
    { k: "wcag", p: "findability", label: "Serious accessibility issues", val: r => String(r.wcag_violations), better: r => -r.wcag_violations, lost: r => META.weights.findability * .30 * (100 - (r.wcag_violations <= 10 ? Math.max(0, 100 - 5 * r.wcag_violations) : Math.max(0, 50 - 2.5 * (r.wcag_violations - 10)))), good: r => `<b>Only ${r.wcag_violations} serious accessibility issues</b>, fewer than {p} of similar systems.`, bad: r => `<b>${r.wcag_violations} serious accessibility issues</b> on the home page and location finder.` },
  ];
  const pctBetter = (m, r, rows) => share(rows, x => m.better(r) > m.better(x));
  const pctWorse = (m, r, rows) => share(rows, x => m.better(x) > m.better(r));
  function fill(t, m, r, rows) {
    return t.replace("{p}", pct(m.bool ? 0 : (t.includes("more often") || t.includes("slower") ? pctWorse(m, r, rows) : pctBetter(m, r, rows)))).replace("{g}", pct(m.bool ? share(rows, x => x[m.bool]) : m.g ? m.g(rows) : 0));
  }
  function strengthsAndWork(r, rows) {
    const strengths = [];
    M.forEach(m => {
      if (m.bool) { const s = share(rows, x => x[m.bool]); if (r[m.bool] && s < .5) strengths.push({ score: 1 - s, html: fill(m.good(r), m, r, rows) }); }
      else { const b = pctBetter(m, r, rows); if (b >= .6 && !(m.k === "wait" && !answered(r))) strengths.push({ score: b, html: fill(m.good(r), m, r, rows) }); }
    });
    strengths.sort((a, b) => b.score - a.score);
    if (!strengths.length) {
      const best = M.filter(m => !m.bool).map(m => ({ m, b: pctBetter(m, r, rows) })).sort((a, b) => b.b - a.b)[0];
      strengths.push({ html: `Strongest measure relative to peers: <b>${best.m.label.toLowerCase()}</b> (${best.m.val(r)}), ahead of ${pct(best.b)} of similar systems.` });
    }
    const work = M.map(m => ({ m, lost: m.lost(r) })).filter(x => x.lost > 1.2 && x.m.bad(r)).sort((a, b) => b.lost - a.lost).slice(0, 3).map(x => ({ html: fill(x.m.bad(r), x.m, r, rows), pts: x.lost }));
    if (!work.length) work.push({ html: "No single measure costs this system more than a point. Its score is limited only by small gaps spread across several measures." });
    return { strengths: strengths.slice(0, 3), work };
  }

  function renderSystem() {
    const r = current, c = cohortOf(r), rows = c.rows, st = BY_STATE[r.state];
    const natP = share(SYS, x => x.dfd_score < r.dfd_score), natMed = median(SYS.map(x => x.dfd_score));
    const peerRank = [...rows].sort((a, b) => b.dfd_score - a.dfd_score).indexOf(r) + 1;
    const sw = strengthsAndWork(r, rows);
    const ring = bandColor(r.dfd_band);
    const pillarCard = p => {
      const s = r[p.key + "_score"], b = r[p.key + "_band"], pm = median(rows.map(x => x[p.key + "_score"]));
      const ms = M.filter(m => m.p === p.key);
      return `<div class="card"><div class="pc-head"><h4>${p.label} <span class="muted" style="font-weight:400">${Math.round(META.weights[p.key] * 100)}% of score</span></h4><span class="s num">${Math.round(s)} ${bandChip(b)}</span></div>
        <div class="muted" style="margin-bottom:6px">Peer median ${pm.toFixed(0)} · national median ${median(SYS.map(x => x[p.key + "_score"])).toFixed(0)}</div>
        ${ms.map(m => {
          if (m.bool) { const sh = share(rows, x => x[m.bool]); return `<div class="mrow"><span>${m.label}</span><span class="muted">${pct(sh)} of peers</span><span class="v"><span class="yn${r[m.bool] ? "" : " no"}">${r[m.bool] ? "Yes" : "No"}</span></span></div>`; }
          const b2 = pctBetter(m, r, rows);
          return `<div class="mrow"><span>${m.label}</span><div class="dot" role="img" aria-label="Better than ${pct(b2)} of peers"><u style="left:50%"></u><i style="left:${(b2 * 100).toFixed(0)}%"></i></div><span class="v">${m.val(r)}</span></div>`;
        }).join("")}
        <div class="muted" style="margin-top:8px;font-size:12.5px">Dots show position among peers: right is better, the tick is the peer median.</div></div>`;
    };
    $("#p-sys").innerHTML = `
      <div class="card">
        <div class="report-head">
          <div class="dial" style="background:conic-gradient(${ring} ${r.dfd_score * 3.6}deg, var(--surface-2) 0)" role="img" aria-label="Score ${r.dfd_score} of 100, grade ${r.dfd_band}"><div><span><b>${Math.round(r.dfd_score)}</b><small>Score</small></span></div></div>
          <div><p class="eyebrow" style="margin:0 0 4px">${exampleFor ? "Example system report" : "System report"} · 2026</p><h3>${esc(r.system_name)}</h3>
            <div class="muted">${r.system_type} · ${STATES[r.state]} · ${r.location_count} locations · ${fmtInt(r.provider_count)} providers · ${r.rurality}</div>
            <p style="margin:10px 0 0">Grade ${bandChip(r.dfd_band)} ${MODELED}</p></div>
          <div class="ranks"><div><b>${fmtInt(r.national_rank)}</b><span>of ${fmtInt(N)} in U.S.</span></div><div><b>${r.state_rank}</b><span>of ${st.length} in ${STATES[r.state]}</span></div><div><b>${peerRank}</b><span>of ${rows.length} peers</span></div></div>
        </div>
        <div class="pctl" role="img" aria-label="Scores higher than ${pct(natP)} of systems nationally">
          <div class="track"></div>
          <div class="mk med" style="left:${(share(SYS, x => x.dfd_score < natMed) * 100).toFixed(1)}%"></div><span class="lab med" style="left:${(share(SYS, x => x.dfd_score < natMed) * 100).toFixed(1)}%">U.S. median ${natMed.toFixed(0)}</span>
          <div class="mk" style="left:${(natP * 100).toFixed(1)}%"></div><span class="lab" style="left:${Math.min(92, Math.max(8, natP * 100)).toFixed(1)}%">This system</span>
        </div>
        <p class="muted" style="margin:12px 0 0">Scores higher than <b>${pct(natP)}</b> of health systems nationally (${ord(Math.max(1, Math.round(natP * 100)))} percentile).</p>
      </div>

      <div class="so section-gap">
        <div class="card"><div class="tag good">Strengths</div><ul>${sw.strengths.map(x => `<li>${x.html}</li>`).join("")}</ul></div>
        <div class="card"><div class="tag work">Largest opportunities</div><ul>${sw.work.map(x => `<li>${x.html}${x.pts ? ` <span class="muted">About ${x.pts.toFixed(1)} points of score.</span>` : ""}</li>`).join("")}</ul></div>
      </div>
      <p class="muted" style="margin:8px 0 0">Compared with ${rows.length} peers: ${esc(c.label)}.</p>

      <div class="pillar-cards section-gap">${PILLARS.map(pillarCard).join("")}</div>

      <div class="grid-2 section-gap">
        <div class="card"><h3>Phone test detail</h3><p class="muted">Every test call to this system's published clinic lines.</p>
          <div class="kv calllog">
            <div><b>${r.lines_tested}</b><span>clinic lines called</span></div>
            <div><b>${r.calls_placed}</b><span>calls placed</span></div>
            <div><b>${r.calls_reached}</b><span>reached a person</span></div>
            <div><b>${fmtWaitShort(r.time_to_human_s)}</b><span>median wait</span></div>
            <div><b>${answered(r) ? fmtWaitShort(r.wait_p90_s) : "–"}</b><span>wait for slowest tenth</span></div>
            <div><b>${r.longest_wait_s ? fmtWaitShort(r.longest_wait_s) : "–"}</b><span>longest wait answered</span></div>
            <div><b>${r.calls_full_hold}</b><span>held the full 20 minutes</span></div>
            <div><b>${r.calls_dropped_on_hold}</b><span>held, then dropped</span></div>
            <div><b>${r.lines_never_answered}</b><span>lines never answered</span></div>
          </div>
          <div class="ampm">
            <span>Mid-morning</span><div class="t"><i style="width:${(r.answer_rate_morning ?? 0) * 100}%;background:var(--chart-1)"></i></div><b class="num">${pct(r.answer_rate_morning)}</b>
            <span>Early afternoon</span><div class="t"><i style="width:${(r.answer_rate_afternoon ?? 0) * 100}%;background:var(--accent)"></i></div><b class="num">${pct(r.answer_rate_afternoon)}</b>
          </div>
          <p class="muted" style="margin:10px 0 0">${systemAmPmNote(r)}</p>
        </div>
        <div class="card"><figure><h3>Where this system sits among peers</h3><p class="muted">${esc(c.label.charAt(0).toUpperCase() + c.label.slice(1))}.</p>
          <div class="chart-box short"><canvas id="c-sys-peer" role="img" aria-label="Peer score distribution with this system's range highlighted. A table version follows."></canvas></div>
          <figcaption><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--accent);vertical-align:-1px"></span> Range containing this system (${r.dfd_score.toFixed(1)}). Peer median ${median(rows.map(x => x.dfd_score)).toFixed(1)}.</figcaption>
          <details class="tbl"><summary>Show as table</summary><div id="sys-peer-table"></div></details></figure>
        </div>
      </div>
      <p class="footnote">Phone results come from ${r.calls_placed} calls to ${r.lines_tested} published clinic lines, one mid-morning and one early-afternoon call per line, plus one call to the main line after 6 p.m. Website results come from the home page and location finder. In this concept build every figure for this system is modeled sample data.</p>`;
    const h = histChart("c-sys-peer", rows, r);
    $("#sys-peer-table").innerHTML = table(["Score range", "Peers"], h.labels.map((l, i) => [l, h.counts[i]]), { num: [1] });
  }
  function systemAmPmNote(r) {
    if (r.answer_rate_morning == null || r.answer_rate_afternoon == null) return "Some lines were reached in only one window.";
    const d = (r.answer_rate_morning - r.answer_rate_afternoon) * 100;
    if (Math.abs(d) < 5) return "Answer rates hold steady between morning and afternoon.";
    return d > 0 ? `Afternoon answer rate is ${d.toFixed(0)} points lower than mid-morning on the same lines.` : `Afternoon answer rate is ${(-d).toFixed(0)} points higher than mid-morning.`;
  }

  let stateSort = { key: "dfd_score", dir: -1 };
  function renderStateReport() {
    const r = current, s = r.state, rows = BY_STATE[s], st = STATE_STATS[s];
    const cols = [["state_rank", "Rank", 1], ["system_name", "System", 0], ["system_type", "Type", 0], ["dfd_score", "Score", 1], ["phone_score", "Phone", 1], ["after_hours_score", "After hours", 1], ["digital_score", "Digital", 1], ["findability_score", "Findability", 1]];
    const sorted = [...rows].sort((a, b) => { const k = stateSort.key; return (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * stateSort.dir; });
    const cell = (x, k) => k === "system_name" ? esc(x[k]) : k === "dfd_score" ? `${x[k].toFixed(1)} ${bandChip(x.dfd_band)}` : typeof x[k] === "number" && k !== "state_rank" ? x[k].toFixed(0) : x[k];
    const row = (x, cls) => `<tr class="${cls}">${cols.map(([k, , n]) => `<td class="${n ? "n" : ""}">${cell(x, k)}</td>`).join("")}</tr>`;
    $("#p-state").innerHTML = `
      <div class="card">
        <div class="report-head">
          <div class="dial" style="background:conic-gradient(${bandColor(bandOf(st.score))} ${st.score * 3.6}deg, var(--surface-2) 0)" role="img" aria-label="State average ${st.score.toFixed(1)}"><div><span><b>${st.score.toFixed(0)}</b><small>State avg.</small></span></div></div>
          <div><p class="eyebrow" style="margin:0 0 4px">State report · 2026</p><h3>${STATES[s]}</h3><div class="muted">${st.n} health systems · ${fmtInt(st.calls)} calls to ${fmtInt(st.lines)} clinic lines${smallNote(st.n)}</div><p style="margin:10px 0 0">Grade ${bandChip(bandOf(st.score))} ${MEASURED_STATES[s] ? MEASURED + " field test" : ""} ${MODELED}</p></div>
          <div class="ranks"><div><b>${STATE_RANK[s]}</b><span>of 50 states</span></div><div><b>${pct(st.answer)}</b><span>calls answered</span></div><div><b>${fmtWaitShort(st.wait)}</b><span>typical wait</span></div></div>
        </div>
      </div>
      <div class="grid-2 section-gap">
        <div class="card"><figure><h3>${STATES[s]} against the nation</h3><p class="muted">Average pillar scores.</p>
          <div class="chart-box short"><canvas id="c-st-pillars" role="img" aria-label="State and national pillar averages. A table version follows."></canvas></div>
          <details class="tbl"><summary>Show as table</summary>${table(["Pillar", STATES[s], "United States"], PILLARS.map(p => [p.label, st[p.key].toFixed(1), NAT[p.key].toFixed(1)]), { num: [1, 2] })}</details></figure></div>
        <div class="card"><h3>At a glance</h3>
          <div class="kv">
            <div><b>${pct(st.answer)}</b><span>Calls reaching a person (U.S. ${pct(NAT.answer)})</span></div>
            <div><b>${fmtWaitShort(st.wait)}</b><span>Typical wait (U.S. ${fmtWaitShort(NAT.wait)})</span></div>
            <div><b>${pct(st.ahGood)}</b><span>Person or service after hours (U.S. ${pct(NAT.ahGood)})</span></div>
            <div><b>${pct(st.booking)}</b><span>Online booking (U.S. ${pct(NAT.booking)})</span></div>
          </div>
          <div class="muted">Grades of ${STATES[s]} systems</div>${gradeBar(rows)}
          <p class="narr">${stateNarrative(s)}</p></div>
      </div>
      <div class="card section-gap"><figure><h3>Score distribution in ${STATES[s]}</h3>
        <div class="chart-box short"><canvas id="c-st-hist" role="img" aria-label="Distribution of scores in the state with the selected system's range highlighted."></canvas></div>
        <figcaption><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--accent);vertical-align:-1px"></span> Range containing ${esc(r.system_name)}.</figcaption></figure></div>
      <h3 class="section-gap">Every ${STATES[s]} system</h3>
      <div class="table-wrap scroll"><table aria-label="${STATES[s]} systems ranked">
        <thead><tr>${cols.map(([k, l, n]) => `<th scope="col" class="${n ? "n" : ""}" aria-sort="${stateSort.key === k ? (stateSort.dir > 0 ? "ascending" : "descending") : "none"}"><button data-k="${k}">${l}${stateSort.key === k ? (stateSort.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
        <tbody>${row(r, "me pinned")}${sorted.map(x => row(x, x === r ? "me" : "")).join("")}</tbody></table></div>
      <p class="muted">The selected system is pinned to the top and highlighted in its ranked position.</p>`;
    draw("c-st-pillars", {
      type: "bar",
      data: { labels: PILLARS.map(p => p.short), datasets: [{ label: STATES[s], data: PILLARS.map(p => +st[p.key].toFixed(1)), backgroundColor: css("--chart-1"), borderRadius: 4, maxBarThickness: 34 }, { label: "United States", data: PILLARS.map(p => +NAT[p.key].toFixed(1)), backgroundColor: css("--band-c"), borderRadius: 4, maxBarThickness: 34 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12 } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100, grid: { color: css("--chart-grid") } } } },
    });
    histChart("c-st-hist", rows, r);
    $("#p-state").querySelectorAll("th button").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k; stateSort = { key: k, dir: stateSort.key === k ? -stateSort.dir : (["system_name", "state_rank", "system_type"].includes(k) ? 1 : -1) };
      renderStateReport(); $(`#p-state th button[data-k="${k}"]`).focus();
    }));
  }

  function renderPeers() {
    const r = current, c = cohortOf(r), rows = c.rows;
    const sorted = [...rows].sort((a, b) => b.dfd_score - a.dfd_score);
    const rank = sorted.indexOf(r) + 1, p = share(rows, x => x.dfd_score < r.dfd_score);
    const q = quartileRows(rows);
    const list = sorted.slice(0, 10);
    if (!list.includes(r)) list.push(r);
    $("#p-peers").innerHTML = `
      <div class="card"><p class="eyebrow" style="margin:0 0 4px">Peer group report · 2026</p><h3 style="font-size:24px;margin:0">${esc(c.label.charAt(0).toUpperCase() + c.label.slice(1))}</h3>
        <p class="muted" style="margin:6px 0 0">Peers are matched on type of system, number of locations and setting, then widened step by step until the group holds at least 20 systems. A 7-clinic rural health center is compared with other small rural centers, not a 40-site metro group.</p>
        <div class="kv" style="margin-top:14px">
          <div><b>${rows.length}</b><span>systems in the group</span></div>
          <div><b>${median(rows.map(x => x.dfd_score)).toFixed(1)}</b><span>group median score</span></div>
          <div><b>${rank} of ${rows.length}</b><span>${esc(r.system_name)}</span></div>
          <div><b>${ord(Math.max(1, Math.round(p * 100)))}</b><span>percentile in group</span></div>
          <div><b>${new Set(rows.map(x => x.state)).size}</b><span>states represented</span></div>
        </div></div>
      <div class="grid-2 section-gap">
        <div class="card"><figure><h3>Score distribution</h3>
          <div class="chart-box"><canvas id="c-peer" role="img" aria-label="Peer group distribution with this system's range highlighted. A table version follows."></canvas></div>
          <figcaption><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--accent);vertical-align:-1px"></span> Range containing ${esc(r.system_name)} (${r.dfd_score.toFixed(1)}).</figcaption>
          <details class="tbl"><summary>Show as table</summary><div id="peer-table"></div></details></figure></div>
        <div class="card"><h3>What the top quarter of this group does differently</h3><p class="muted">Top and bottom 25% of the group by score.</p>
          ${table(["Measure", "Top 25%", "Bottom 25%"], q.rows, { num: [1, 2] })}</div>
      </div>
      <h3 class="section-gap">Highest-scoring peers</h3>
      ${table(["Rank", "System", "State", "Locations", "Score"], list.map(x => [sorted.indexOf(x) + 1, esc(x.system_name) + (x === r ? " (selected)" : ""), STATES[x.state], x.location_count, `${x.dfd_score.toFixed(1)} ${bandChip(x.dfd_band)}`]), { num: [0, 3, 4] })}`;
    const h = histChart("c-peer", rows, r);
    $("#peer-table").innerHTML = table(["Score range", "Systems"], h.labels.map((l, i) => [l, h.counts[i]]), { num: [1] });
  }

  function renderNational() {
    const opts = (vals, key, field, all, label) => {
      const others = SYS.filter(x => (key !== "type" && natF.type ? x.system_type === natF.type : true) && (key !== "size" && natF.size ? x.size_band === natF.size : true) && (key !== "rur" && natF.rur ? x.rurality === natF.rur : true));
      return `<option value="">${all} (${others.length})</option>` + vals.map(v => { const n = others.filter(x => x[field] === v).length; return `<option value="${v}" ${v === natF[key] ? "selected" : ""} ${n < 10 ? "disabled" : ""}>${label ? label(v) : v} (${n})</option>`; }).join("");
    };
    $("#p-nat").innerHTML = `
      <div class="filters" role="group" aria-label="Filter the national view">
        <div><label for="f-type">Type of system</label><select id="f-type">${opts(TYPES, "type", "system_type", "All types")}</select></div>
        <div><label for="f-size">Locations</label><select id="f-size">${opts(SIZES, "size", "size_band", "All sizes", v => SIZE_LABEL[v])}</select></div>
        <div><label for="f-rur">Setting</label><select id="f-rur">${opts(RURS, "rur", "rurality", "All settings")}</select></div>
      </div>
      <p class="muted" style="margin-top:-6px">Numbers in brackets show how many systems each choice leaves. Choices that would leave fewer than 10 systems are unavailable.</p>
      <div id="nat-body" aria-live="polite"></div>`;
    ["type", "size", "rur"].forEach(k => $("#f-" + k).addEventListener("change", e => { natF[k] = e.target.value; renderNational(); $("#f-" + k).focus(); }));
    const rows = SYS.filter(r => (!natF.type || r.system_type === natF.type) && (!natF.size || r.size_band === natF.size) && (!natF.rur || r.rurality === natF.rur));
    const sc = rows.map(r => r.dfd_score), q = quartileRows(rows);
    const desc = [natF.type, natF.size && SIZE_LABEL[natF.size], natF.rur].filter(Boolean).join(" · ") || "All systems";
    const corr = [
      { r: pearson(rows.map(x => x.ivr_layers), rows.map(x => Math.log(answered(x) ? x.time_to_human_s : CAP))), t: "phone menu depth and wait for a person" },
      { r: pearson(rows.map(x => x.ivr_layers), rows.map(x => x.answer_rate)), t: "phone menu depth and answer rate" },
      { r: pearson(rows.map(x => Math.log(x.location_count)), rows.map(x => x.digital_score)), t: "number of locations and digital self-service" },
      { r: pearson(rows.map(x => x.digital_score), rows.map(x => x.phone_score)), t: "digital self-service and phone access" },
    ].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const strength = v => Math.abs(v) >= .5 ? "Strong" : Math.abs(v) >= .3 ? "Moderate" : Math.abs(v) >= .15 ? "Weak" : "No meaningful";
    const states = new Set(rows.map(r => r.state)).size;
    $("#nat-body").innerHTML = `
      <div class="stat-strip">
        <div><b>${fmtInt(rows.length)}</b><span>${esc(desc)}</span></div>
        <div><b>${median(sc).toFixed(1)}</b><span>median score</span></div>
        <div><b>${quantile(sc, .25).toFixed(0)}–${quantile(sc, .75).toFixed(0)}</b><span>middle half of systems</span></div>
        <div><b>${pct(pooledAnswer(rows))}</b><span>calls reaching a person</span></div>
        <div><b>${fmtWaitShort(typicalWait(rows))}</b><span>typical wait</span></div>
      </div>
      <div class="grid-2">
        <div class="card"><figure><h3>Score distribution</h3>
          <div class="chart-box"><canvas id="c-nat" role="img" aria-label="Distribution of scores for the filtered systems. A table version follows."></canvas></div>
          <details class="tbl"><summary>Show as table</summary><div id="nat-hist-table"></div></details></figure></div>
        <div class="card"><h3>Average score by state</h3><p class="muted">${states} states have systems in this view. Grey states have none.</p>
          <svg class="us-map" id="nat-map" role="group" aria-label="Map of average score by state for the filtered systems"></svg>
          <div class="map-legend" id="nat-legend"></div></div>
        <div class="card"><h3>Top quarter vs. bottom quarter</h3>${table(["Measure", "Top 25%", "Bottom 25%"], q.rows, { num: [1, 2] })}</div>
        <div class="card"><h3>Relationships in the data</h3>
          <ul style="padding-left:18px;margin:8px 0">${corr.map(c => `<li style="margin-bottom:8px"><b>${strength(c.r)}</b> ${Math.abs(c.r) < .15 ? "link" : c.r >= 0 ? "positive link" : "negative link"} between ${c.t} (r = ${c.r.toFixed(2)}).</li>`).join("")}</ul>
          <p class="muted">Correlations are recomputed for the filters above. They describe the systems in view, not causes.</p></div>
      </div>`;
    const h = histChart("c-nat", rows);
    $("#nat-hist-table").innerHTML = table(["Score range", "Systems"], h.labels.map((l, i) => [l, h.counts[i]]), { num: [1] });
    const by = {}; rows.forEach(x => (by[x.state] = by[x.state] || []).push(x.dfd_score));
    const vals = Object.fromEntries(ST_CODES.map(s => [s, by[s] ? mean(by[s]) : NaN]));
    natMap = buildMap($("#nat-map"), s => { const pick = (BY_STATE[s] || []).filter(x => rows.includes(x)).sort((a, b) => b.dfd_score - a.dfd_score)[0]; if (pick) { select(pick); activateTab("t-state"); } });
    const scale = natMap.color(vals, MAP_METRICS[0], current && current.state);
    legend($("#nat-legend"), scale, MAP_METRICS[0]);
  }

  // ---------- boot ----------
  function renderAll() {
    chartDefaults();
    renderCover(); renderPhone(); renderOregon(); renderAfterHours(); renderDigital(); renderFindability(); renderLeaders(); renderMethod();
    if (mainMap) { colorMain(); renderStatePanel(); }
  }
  renderAll();
  initMap();
  initGate();
  initStateSelect($("#g-state"));
  if (gateIsOpen()) unlock(false);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { renderAll(); if (ready) renderActive(); });
})();
