/* Digital Front Door Index: concept page logic.
   Every sentence below the hero is generated from the data at render time,
   so refreshing dfd_index.js refreshes the narrative. */
(function () {
  "use strict";

  const D = window.DFD_DATA;
  const META = D.meta;
  const COLS = D.cols;
  const N = COLS.system_id.length;
  const SYS = Array.from({ length: N }, (_, i) => {
    const r = {};
    for (const k in COLS) r[k] = COLS[k][i];
    return r;
  });
  const BY_ID = Object.fromEntries(SYS.map(r => [r.system_id, r]));
  const STATES = META.state_names;
  const PILLARS = [
    { key: "phone", label: "Phone Access", desc: "Answer rate, time to a live person, phone menu depth and calls that drop on hold." },
    { key: "after_hours", label: "After-Hours", desc: "What a caller reaches outside business hours, and whether an urgent path is offered." },
    { key: "digital", label: "Digital Self-Service", desc: "Online booking for new patients, portal, request forms, visible availability, tap-to-call." },
    { key: "findability", label: "Findability & Accessibility", desc: "Number and hours within two clicks, mobile layout, and a WCAG 2.1 AA signal check." },
  ];
  const AH_LABEL = { live: "Live person", service: "Answering service", voicemail: "Voicemail only", dead: "Dead line / no message" };

  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, html = "") => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.innerHTML = html; return e; };
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = (x, d = 0) => (100 * x).toFixed(d) + "%";
  const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
  const share = (rows, f) => rows.filter(f).length / (rows.length || 1);
  const fmtSec = s => s < 60 ? `${Math.round(s)} seconds` : (s < 120 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${(s / 60).toFixed(s < 600 ? 1 : 0)} minutes`);
  const fmtSecShort = s => s < 60 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)} min`;
  const bandOf = s => { for (const [l, f] of META.bands) if (s >= f) return l; return "F"; };
  const bandColor = l => css(`--band-${l.toLowerCase()}`);
  const bandChip = l => `<span class="band ${l}" style="background:${bandColor(l)}" aria-label="Grade ${l}">${l}</span>`;
  const modeled = v => `<span class="modeled-val" title="Modeled sample data">${v}</span>`;
  const pearson = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; n += a * b; dx += a * a; dy += b * b; } return n / Math.sqrt(dx * dy || 1); };
  const percentileOf = (rows, r) => share(rows, x => x.dfd_score < r.dfd_score);
  const ord = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  function tableHTML(headers, rows) {
    return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  // ---------- charts ----------
  const charts = {};
  function chartDefaults() {
    Chart.defaults.font.family = css("--font-sans");
    Chart.defaults.color = css("--chart-axis");
    Chart.defaults.borderColor = css("--chart-grid");
    Chart.defaults.animation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 400 };
  }
  function barChart(id, labels, data, opts = {}) {
    if (charts[id]) charts[id].destroy();
    const colors = opts.colors || data.map(() => css("--chart-1"));
    charts[id] = new Chart(document.getElementById(id), {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom", maxBarThickness: 46, categoryPercentage: .9, barPercentage: .92 }] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: opts.horizontal ? "y" : "x",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => (opts.tip ? opts.tip(c.raw, c.dataIndex) : c.raw) } } },
        scales: {
          x: { grid: { display: !!opts.horizontal }, title: { display: !!opts.xTitle, text: opts.xTitle }, ticks: opts.horizontal && opts.pctAxis ? { callback: v => v + "%" } : {} },
          y: { grid: { display: !opts.horizontal }, beginAtZero: true, title: { display: !!opts.yTitle, text: opts.yTitle }, ticks: !opts.horizontal && opts.pctAxis ? { callback: v => v + "%" } : {} },
        },
      },
    });
  }
  function histogram(rows, bins = 10) {
    const counts = Array(bins).fill(0);
    rows.forEach(r => counts[Math.min(bins - 1, Math.floor(r.dfd_score / (100 / bins)))]++);
    const labels = counts.map((_, i) => `${i * (100 / bins)}–${(i + 1) * (100 / bins)}`);
    return { labels, counts };
  }

  // ---------- hero ----------
  function renderHero() {
    $("#hero-n").textContent = N.toLocaleString();
    const tth = SYS.map(r => r.time_to_human_s).sort((a, b) => a - b);
    const top = quantile(tth, .1), bottom = quantile(tth, .9);
    const noBook = share(SYS, r => !r.online_booking);
    const ahBad = share(SYS, r => r.ah_outcome === "voicemail" || r.ah_outcome === "dead");
    const wcag = share(SYS, r => r.wcag_violations >= 10);
    const items = [
      [pct(noBook), `of systems make a new patient call to book a first appointment. There is no online option.`],
      [`${Math.round(bottom / top)}×`, `gap in time to reach a person: ${fmtSecShort(top)} for the fastest tenth of systems vs. ${fmtSecShort(bottom)} or more for the slowest tenth.`],
      [pct(ahBad), `of after-hours calls end in voicemail or a dead line, with no live person or answering service.`],
      [pct(wcag), `of system websites show 10 or more serious accessibility issues ahead of the May 11, 2027 HHS Section 504 deadline.`],
    ];
    $("#findings").innerHTML = items.map(([n, t]) => `<div class="finding"><div class="big">${n}</div><p>${t}</p><span class="chip modeled">modeled</span></div>`).join("");
  }

  // ---------- Oregon (measured aggregates) ----------
  function renderOregon() {
    const o = META.oregon_measured;
    const stats = [
      [pct(o.calls_reached_person / o.calls), `of ${o.calls} calls reached a live person (${o.calls_reached_person} of ${o.calls}).`],
      [`${o.median_wait_s}s`, `median wait for a person. The average was ${Math.round(o.mean_wait_s / 60)} minutes, pulled up by a long tail.`],
      [`1 in 4`, `answered calls waited more than 2 minutes. 1 in 10 waited more than 5.`],
      [`${o.calls_hit_20min_cap}`, `calls never reached anyone within our 20-minute cap. ${o.lines_hold_then_disconnect} lines put us on hold and then hung up.`],
    ];
    $("#or-stats").innerHTML = stats.map(([n, t]) => `<div class="stat"><div class="n">${n}</div><p>${t}</p></div>`).join("");
  }

  function renderPillars() {
    $("#pillars").innerHTML = PILLARS.map((p, i) => `<div class="card pillar"><div class="num">0${i + 1}</div><div class="w">${Math.round(META.weights[p.key] * 100)}% of score</div><h3>${p.label}</h3><p>${p.desc}</p></div>`).join("");
  }

  // ---------- tile map ----------
  const TILE = { AK: [0, 0], ME: [0, 11], VT: [1, 10], NH: [1, 11], WA: [2, 1], ID: [2, 2], MT: [2, 3], ND: [2, 4], MN: [2, 5], IL: [2, 6], WI: [2, 7], MI: [2, 8], NY: [2, 9], RI: [2, 10], MA: [2, 11], OR: [3, 1], NV: [3, 2], WY: [3, 3], SD: [3, 4], IA: [3, 5], IN: [3, 6], OH: [3, 7], PA: [3, 8], NJ: [3, 9], CT: [3, 10], CA: [4, 1], UT: [4, 2], CO: [4, 3], NE: [4, 4], MO: [4, 5], KY: [4, 6], WV: [4, 7], VA: [4, 8], MD: [4, 9], DE: [4, 10], AZ: [5, 2], NM: [5, 3], KS: [5, 4], AR: [5, 5], TN: [5, 6], NC: [5, 7], SC: [5, 8], OK: [6, 4], LA: [6, 5], MS: [6, 6], AL: [6, 7], GA: [6, 8], HI: [7, 0], TX: [7, 4], FL: [7, 9] };
  const SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  function stateAverages(rows) {
    const g = {};
    rows.forEach(r => (g[r.state] = g[r.state] || []).push(r.dfd_score));
    const out = {};
    for (const s in g) out[s] = { avg: mean(g[s]), n: g[s].length };
    return out;
  }
  function renderTileMap(container, rows, opts = {}) {
    const avgs = stateAverages(rows);
    const vals = Object.values(avgs).map(a => a.avg);
    const lo = Math.floor(Math.min(...vals) / 2) * 2, hi = Math.ceil(Math.max(...vals) / 2) * 2;
    const step = (hi - lo) / SEQ.length || 1;
    const colorFor = v => SEQ[Math.min(SEQ.length - 1, Math.floor((v - lo) / step))];
    container.innerHTML = "";
    const cells = Array(8 * 12).fill(null);
    for (const s in TILE) cells[TILE[s][0] * 12 + TILE[s][1]] = s;
    cells.forEach(s => {
      if (!s || !avgs[s]) { container.appendChild(el("div", { class: "tile empty", "aria-hidden": "true" })); return; }
      const v = avgs[s].avg, c = colorFor(v), dark = SEQ.indexOf(c) >= 3;
      const b = el("button", { class: "tile" + (opts.selected === s ? " sel" : ""), type: "button", title: `${STATES[s]}: average ${v.toFixed(1)} across ${avgs[s].n} systems`, "aria-label": `${STATES[s]}, average ${v.toFixed(1)}` }, `${s}<span>${Math.round(v)}</span>`);
      b.style.background = c; b.style.color = dark ? "#fff" : "#0b0b0b";
      if (opts.onPick) b.addEventListener("click", () => opts.onPick(s));
      container.appendChild(b);
    });
    if (opts.legend) opts.legend.innerHTML = "Lower " + SEQ.map((c, i) => `<span><i style="background:${c}"></i>${Math.round(lo + i * step)}</span>`).join("") + " Higher";
    if (opts.table) {
      const rowsT = Object.entries(avgs).sort((a, b) => b[1].avg - a[1].avg).map(([s, a]) => [STATES[s], a.avg.toFixed(1), a.n]);
      opts.table.innerHTML = tableHTML(["State", "Average DFD Score", "Systems"], rowsT);
    }
  }

  // ---------- ungated teasers ----------
  function renderTeasers() {
    renderTileMap($("#tilemap-teaser"), SYS, { legend: $("#map-legend"), table: $("#map-table") });

    const h = histogram(SYS);
    barChart("c-hist", h.labels, h.counts, { xTitle: "DFD Score", yTitle: "Systems", tip: v => `${v} systems` });
    const q1 = quantile(SYS.map(r => r.dfd_score), .25), q3 = quantile(SYS.map(r => r.dfd_score), .75);
    $("#hist-cap").textContent = `Half of all systems score between ${q1.toFixed(0)} and ${q3.toFixed(0)}. Only ${share(SYS, r => r.dfd_band === "A").toLocaleString(undefined, { style: "percent", maximumFractionDigits: 1 })} earn an A.`;
    $("#hist-table").innerHTML = tableHTML(["Score range", "Systems"], h.labels.map((l, i) => [l, h.counts[i]]));

    const layers = [0, 1, 2, 3, 4, 5];
    const med = layers.map(l => median(SYS.filter(r => r.ivr_layers === l).map(r => r.time_to_human_s)));
    const cnt = layers.map(l => SYS.filter(r => r.ivr_layers === l).length);
    barChart("c-ivr", layers.map(l => l === 0 ? "None" : `${l}`), med, { xTitle: "Phone menu layers before a person", yTitle: "Median seconds to a person", tip: (v, i) => `${Math.round(v)}s median (${cnt[i]} systems)` });
    $("#ivr-cap").textContent = `Each extra menu layer adds wait. Systems with ${layers[med.length - 1]} layers have a median wait about ${Math.round(med[med.length - 1] / Math.max(1, med[0]))}× that of systems that go straight to a person.`;
    $("#ivr-table").innerHTML = tableHTML(["Menu layers", "Median seconds to a person", "Systems"], layers.map((l, i) => [l, Math.round(med[i]), cnt[i]]));

    const ks = ["live", "service", "voicemail", "dead"];
    const sh = ks.map(k => +(100 * share(SYS, r => r.ah_outcome === k)).toFixed(1));
    barChart("c-ah", ks.map(k => AH_LABEL[k]), sh, { horizontal: true, pctAxis: true, tip: v => `${v}% of systems` });
    $("#ah-cap").textContent = `Only ${pct(sh[0] / 100)} of after-hours calls reach a live person. ${pct(share(SYS, r => !r.ah_urgent_path))} of systems offer no urgent path at all.`;
    $("#ah-table").innerHTML = tableHTML(["After-hours outcome", "Share of systems"], ks.map((k, i) => [AH_LABEL[k], sh[i] + "%"]));
  }

  // ---------- gate ----------
  const GATE_KEY = "dfd_gate_v1";
  const FREE = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com", "live.com", "msn.com", "protonmail.com", "proton.me", "gmx.com", "mail.com", "ymail.com", "comcast.net", "att.net", "verizon.net"];
  function gateOpen() { try { return !!localStorage.getItem(GATE_KEY); } catch (e) { return false; } }
  function initGate() {
    const f = $("#gate-form");
    f.addEventListener("submit", e => {
      e.preventDefault();
      const v = { name: f.name.value.trim(), email: f.email.value.trim(), org: f.org.value.trim(), role: f.role.value };
      const errs = {};
      if (!v.name) errs.name = "Please enter your name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.email = "Please enter a valid email address.";
      else if (FREE.includes(v.email.split("@")[1].toLowerCase())) errs.email = "Please use your work email. We send the report to organizational addresses only.";
      if (!v.org) errs.org = "Please enter your organization.";
      if (!v.role) errs.role = "Please choose a role.";
      for (const k of ["name", "email", "org", "role"]) {
        $("#e-" + k).textContent = errs[k] || "";
        f[k].setAttribute("aria-invalid", errs[k] ? "true" : "false");
      }
      const first = Object.keys(errs)[0];
      if (first) { f[first].focus(); return; }
      const [firstName, ...rest] = v.name.split(/\s+/);
      const lead = {
        // Shape matches a Salesforce web-to-lead POST.
        first_name: firstName, last_name: rest.join(" ") || "-", email: v.email, company: v.org, title: v.role,
        lead_source: "DFD Index 2026", "00N_campaign": "dfd-index-2026", submitted_at: new Date().toISOString(),
      };
      console.log("[DFD gate] web-to-lead payload", lead);
      try { localStorage.setItem(GATE_KEY, JSON.stringify(lead)); } catch (e2) { /* private mode: reveal anyway */ }
      unlock(true);
    });
  }
  function unlock(fromSubmit) {
    $("#gate").hidden = true;
    const x = $("#explorer");
    x.hidden = false;
    initExplorer();
    if (fromSubmit) { $("#x-h").setAttribute("tabindex", "-1"); $("#x-h").focus(); }
  }

  // ---------- explorer ----------
  let current = null, explorerReady = false;
  let natFilters = { type: "", size: "", rur: "" };

  function initExplorer() {
    if (explorerReady) return;
    explorerReady = true;
    initPicker();
    initTabs();
    $("#cta-btn").addEventListener("click", () => {
      let lead = null; try { lead = JSON.parse(localStorage.getItem(GATE_KEY)); } catch (e) { /* ignore */ }
      const payload = { event: "breakdown_requested", system_id: current && current.system_id, system_name: current && current.system_name, lead };
      console.log("[DFD] breakdown request", payload);
      $("#cta-msg").textContent = current ? `Thanks. We'll send the ${current.system_name} breakdown to your inbox within two business days.` : "Pick your system above first, and we'll send its breakdown.";
    });
    // Default to an Oregon system so the first view is populated.
    const or = SYS.filter(r => r.state === "OR").sort((a, b) => a.dfd_score - b.dfd_score);
    select(or[Math.floor(or.length * 0.4)] || SYS[0]);
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
      list.innerHTML = items.length ? items.map((r, i) => `<li role="option" id="opt-${i}" data-id="${r.system_id}">${esc(r.system_name)} <small>${STATES[r.state]} · ${r.system_type}</small></li>`).join("") : `<li role="option" aria-disabled="true">No matching systems</li>`;
      list.hidden = false; q.setAttribute("aria-expanded", "true"); active = -1;
    });
    q.addEventListener("keydown", e => {
      if (list.hidden) return;
      if (e.key === "ArrowDown") { active = Math.min(items.length - 1, active + 1); }
      else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); select(items[active]); close(); q.value = ""; return; }
      else if (e.key === "Escape") { close(); return; }
      else return;
      e.preventDefault(); paint();
      if (active >= 0) q.setAttribute("aria-activedescendant", "opt-" + active);
    });
    list.addEventListener("mousedown", e => { const li = e.target.closest("li[data-id]"); if (li) { e.preventDefault(); select(BY_ID[li.dataset.id]); close(); q.value = ""; } });
    q.addEventListener("blur", () => setTimeout(close, 100));
  }

  function initTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const activate = t => {
      tabs.forEach(x => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute("aria-controls")).hidden = !on; });
      renderActive();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => activate(t));
      t.addEventListener("keydown", e => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        if (e.key === "Home") j = 0;
        if (e.key === "End") j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); tabs[j].focus(); activate(tabs[j]); }
      });
    });
  }

  function select(r) {
    current = r;
    $("#picked").innerHTML = `Showing <b>${esc(r.system_name)}</b>, ${r.system_type}, ${STATES[r.state]} · ${r.location_count} locations · ${r.rurality} <span class="chip modeled">modeled</span>`;
    renderActive();
  }
  function renderActive() {
    if (!current) return;
    const t = document.querySelector('[role="tab"][aria-selected="true"]').id;
    ({ "t-sys": renderSystem, "t-state": renderState, "t-peers": renderPeers, "t-nat": renderNational })[t]();
  }

  function cohortOf(r) {
    let c = SYS.filter(x => x.cohort === r.cohort);
    let label = `${r.system_type.toLowerCase()}s with ${r.size_band} locations in ${r.rurality.toLowerCase()} areas`;
    if (c.length < 12) {
      c = SYS.filter(x => x.system_type === r.system_type && x.rurality === r.rurality);
      label = `${r.system_type.toLowerCase()}s in ${r.rurality.toLowerCase()} areas (all sizes, since the exact size cohort is small)`;
    }
    return { rows: c, label };
  }

  // Plain-language drag factors: the metrics costing this system the most
  // composite points, each compared against its cohort.
  function dragFactors(r, cohort) {
    const W = META.weights;
    const tthPts = s => s <= 1 ? 100 : Math.max(0, 100 * (1 - Math.log(s) / Math.log(1200)));
    const pctWorse = (f, higherIsBetter) => share(cohort, x => higherIsBetter ? f(x) > f(r) : f(x) < f(r));
    const F = [
      { lost: W.phone * .40 * (100 - 100 * r.answer_rate), text: () => `<b>Only ${pct(r.answer_rate)} of calls reach a person.</b> ${pct(pctWorse(x => x.answer_rate, true))} of similar systems answer more often.` },
      { lost: W.phone * .35 * (100 - tthPts(r.time_to_human_s)), text: () => `<b>Callers wait ${fmtSec(r.time_to_human_s)} to reach a person.</b> That is slower than ${pct(pctWorse(x => x.time_to_human_s, false))} of similar systems.` },
      { lost: W.phone * .15 * Math.min(100, 22 * Math.max(0, r.ivr_layers - 1)), text: () => `<b>Callers go through ${r.ivr_layers} layers of phone menus</b> before reaching anyone.` },
      { lost: W.phone * .10 * Math.min(100, 100 * r.abandon_rate / .30), text: () => `<b>${pct(r.abandon_rate)} of calls drop while on hold.</b>` },
      { lost: W.after_hours * .75 * (100 - { live: 100, service: 80, voicemail: 30, dead: 0 }[r.ah_outcome]), text: () => r.ah_outcome === "dead" ? `<b>After hours, the main line rings out with no message.</b> A patient with an urgent question has nowhere to go.` : `<b>After hours, callers reach ${AH_LABEL[r.ah_outcome].toLowerCase()}.</b> ${pct(share(cohort, x => x.ah_outcome === "live" || x.ah_outcome === "service"))} of similar systems put callers through to a person or an answering service.` },
      { lost: W.after_hours * .25 * (r.ah_urgent_path ? 0 : 100), text: () => `<b>There is no urgent path after hours.</b> Nothing tells a caller what to do if it can't wait until morning.` },
      { lost: W.digital * 35 * (r.online_booking ? 0 : 1), text: () => `<b>A new patient can't book online.</b> They have to call. ${pct(share(cohort, x => x.online_booking))} of similar systems offer online booking.` },
      { lost: W.digital * 15 * (r.next_available_visible ? 0 : 1), text: () => `<b>The website doesn't show when the next appointment is available.</b>` },
      { lost: W.digital * 15 * (r.click_to_call ? 0 : 1), text: () => `<b>On a phone, the number isn't tap-to-call.</b>` },
      { lost: W.findability * (30 * !r.number_within_2_clicks + 20 * !r.hours_within_2_clicks), text: () => `<b>The main number${r.hours_within_2_clicks ? "" : " or hours"} takes more than two clicks to find${r.number_within_2_clicks ? " (hours)" : ""}.</b>` },
      { lost: W.findability * .30 * (100 - (r.wcag_violations <= 10 ? Math.max(0, 100 - 5 * r.wcag_violations) : Math.max(0, 50 - 2.5 * (r.wcag_violations - 10)))), text: () => `<b>The website has ${r.wcag_violations} serious accessibility issues</b> under WCAG 2.1 AA. The HHS Section 504 deadline is May 11, 2027.` },
    ];
    return F.filter(f => f.lost > 1.5).sort((a, b) => b.lost - a.lost).slice(0, 3).map(f => ({ lost: f.lost, html: f.text() }));
  }

  function renderSystem() {
    const r = current, c = cohortOf(r), p = percentileOf(SYS, r);
    const ring = bandColor(r.dfd_band);
    const drag = dragFactors(r, c.rows);
    $("#p-sys").innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="score-head">
            <div class="dial" style="background:conic-gradient(${ring} ${r.dfd_score * 3.6}deg, var(--surface-2) 0)" role="img" aria-label="DFD Score ${r.dfd_score} out of 100, grade ${r.dfd_band}"><div><span><b>${Math.round(r.dfd_score)}</b><small>DFD Score</small></span></div></div>
            <div><h3 style="margin:0">${esc(r.system_name)}</h3><div class="muted">${STATES[r.state]} · ${r.system_type} · ${r.location_count} locations</div>
            <p style="margin:8px 0 0">Grade ${bandChip(r.dfd_band)} &nbsp;#${r.national_rank.toLocaleString()} of ${N.toLocaleString()} nationally · #${r.state_rank} in ${STATES[r.state]}</p></div>
          </div>
          <div class="pctl" role="img" aria-label="Scores higher than ${pct(p)} of systems nationally"><div class="track"></div><div class="mk" style="left:${(p * 100).toFixed(1)}%"></div></div>
          <div class="muted">Scores higher than <b>${pct(p)}</b> of systems nationally (${ord(Math.round(p * 100))} percentile). <span class="chip modeled">modeled</span></div>
          <h3 style="margin-top:22px">Pillar scores</h3>
          <div class="pillrow">${PILLARS.map(pl => {
            const s = r[pl.key + "_score"], b = r[pl.key + "_band"];
            return `<span>${pl.label} <small class="muted">${Math.round(META.weights[pl.key] * 100)}%</small></span><b>${modeled(Math.round(s))}</b>${bandChip(b)}<div class="bar" aria-hidden="true"><i style="width:${s}%;background:${bandColor(b)}"></i></div>`;
          }).join("")}</div>
        </div>
        <div class="card">
          <h3>What's pulling the score down</h3>
          <p class="muted">Compared with ${c.rows.length} ${c.label}.</p>
          <ol class="drag">${drag.length ? drag.map(d => `<li>${d.html}</li>`).join("") : "<li>Nothing stands out. This system does well on every measure.</li>"}</ol>
          <h3 style="margin-top:20px">Key measures</h3>
          ${tableHTML(["Measure", "This system", "Peer median"], [
            ["Calls reaching a person", pct(r.answer_rate), pct(median(c.rows.map(x => x.answer_rate)))],
            ["Time to a person", fmtSecShort(r.time_to_human_s), fmtSecShort(median(c.rows.map(x => x.time_to_human_s)))],
            ["Phone menu layers", r.ivr_layers, median(c.rows.map(x => x.ivr_layers))],
            ["After hours", AH_LABEL[r.ah_outcome], "-"],
            ["Online booking for new patients", r.online_booking ? "Yes" : "No", pct(share(c.rows, x => x.online_booking)) + " of peers"],
            ["Serious accessibility issues", r.wcag_violations, median(c.rows.map(x => x.wcag_violations))],
          ])}
        </div>
      </div>`;
  }

  let stateSort = { key: "dfd_score", dir: -1 };
  function renderState() {
    const r = current, st = r.state, rows = SYS.filter(x => x.state === st);
    const sAvg = mean(rows.map(x => x.dfd_score)), nAvg = mean(SYS.map(x => x.dfd_score));
    const pAvg = k => mean(rows.map(x => x[k + "_score"])), nP = k => mean(SYS.map(x => x[k + "_score"]));
    const gaps = PILLARS.map(p => ({ p, d: pAvg(p.key) - nP(p.key) })).sort((a, b) => a.d - b.d);
    const best = rows.reduce((a, b) => (b.dfd_score > a.dfd_score ? b : a));
    const spread = best.dfd_score - rows.reduce((a, b) => (b.dfd_score < a.dfd_score ? b : a)).dfd_score;
    const narrative = `${STATES[st]}'s ${rows.length} systems average <b>${sAvg.toFixed(1)}</b>, ${Math.abs(sAvg - nAvg).toFixed(1)} points ${sAvg >= nAvg ? "above" : "below"} the modeled national average of ${nAvg.toFixed(1)}. The state's weakest pillar relative to the nation is <b>${gaps[0].p.label}</b> (${gaps[0].d >= 0 ? "+" : ""}${gaps[0].d.toFixed(1)}). Its strongest is <b>${gaps[3].p.label}</b> (${gaps[3].d >= 0 ? "+" : ""}${gaps[3].d.toFixed(1)}). The top and bottom systems are ${spread.toFixed(0)} points apart. ${pct(share(rows, x => !x.online_booking))} of ${STATES[st]} systems have no online booking for new patients.`;
    const cols = [["state_rank", "Rank", 1], ["system_name", "System", 0], ["dfd_score", "DFD", 1], ["phone_score", "Phone", 1], ["after_hours_score", "After-hours", 1], ["digital_score", "Digital", 1], ["findability_score", "Findability", 1]];
    const sorted = [...rows].sort((a, b) => { const k = stateSort.key; return (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * stateSort.dir; });
    const rowHTML = (x, cls) => `<tr class="${cls}">${cols.map(([k, , n]) => `<td class="${n ? "num" : ""}">${k === "system_name" ? esc(x[k]) : (typeof x[k] === "number" ? (k === "state_rank" ? x[k] : x[k].toFixed(1)) : x[k])}</td>`).join("")}</tr>`;
    $("#p-state").innerHTML = `
      <div class="kv">
        <div><b>${sAvg.toFixed(1)}</b><span>${STATES[st]} average</span></div>
        <div><b>${nAvg.toFixed(1)}</b><span>National average (modeled)</span></div>
        <div><b>#${r.state_rank} of ${rows.length}</b><span>${esc(r.system_name)}</span></div>
      </div>
      <p class="narr">${narrative} <span class="chip modeled">modeled</span></p>
      <div class="table-wrap" style="margin-top:16px"><table aria-label="${STATES[st]} systems ranked">
        <thead><tr>${cols.map(([k, l, n]) => `<th scope="col" class="${n ? "num" : ""}" aria-sort="${stateSort.key === k ? (stateSort.dir > 0 ? "ascending" : "descending") : "none"}"><button data-k="${k}">${l}${stateSort.key === k ? (stateSort.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
        <tbody>${rowHTML(r, "me pinned")}${sorted.map(x => rowHTML(x, x === r ? "me" : "")).join("")}</tbody>
      </table></div>
      <p class="muted">Your system is pinned to the top and also shown in its ranked position. Select a column header to sort.</p>`;
    $("#p-state").querySelectorAll("th button").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k;
      stateSort = { key: k, dir: stateSort.key === k ? -stateSort.dir : (k === "system_name" || k === "state_rank" ? 1 : -1) };
      renderState();
      $(`#p-state th button[data-k="${k}"]`).focus();
    }));
  }

  function renderPeers() {
    const r = current, c = cohortOf(r), rows = c.rows;
    const h = histogram(rows);
    const myBin = Math.min(9, Math.floor(r.dfd_score / 10));
    const p = percentileOf(rows, r);
    const med = median(rows.map(x => x.dfd_score));
    const topQ = rows.filter(x => x.dfd_score >= quantile(rows.map(y => y.dfd_score), .75));
    $("#p-peers").innerHTML = `
      <div class="kv">
        <div><b>${rows.length}</b><span>Systems in cohort</span></div>
        <div><b>${med.toFixed(1)}</b><span>Cohort median</span></div>
        <div><b>#${[...rows].sort((a, b) => b.dfd_score - a.dfd_score).indexOf(r) + 1}</b><span>Your rank in cohort</span></div>
        <div><b>${ord(Math.round(p * 100))}</b><span>Percentile in cohort</span></div>
      </div>
      <div class="grid-2">
        <div class="card"><figure>
          <h3>Score distribution: ${esc(c.label)}</h3>
          <div class="chart-box"><canvas id="c-peer" role="img" aria-label="Histogram of cohort DFD Scores, with your system's range highlighted. A table version follows."></canvas></div>
          <figcaption><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${css("--accent")};vertical-align:-1px"></span> The range containing ${esc(r.system_name)} (${r.dfd_score.toFixed(1)})</figcaption>
          <details class="tbl"><summary>Show as table</summary>${tableHTML(["Score range", "Systems"], h.labels.map((l, i) => [l + (i === myBin ? " (your system)" : ""), h.counts[i]]))}</details>
        </figure></div>
        <div class="card">
          <h3>What the top quarter of this cohort does differently</h3>
          ${tableHTML(["Measure", "Top quarter", "Whole cohort", "You"], [
            ["Calls reaching a person", pct(mean(topQ.map(x => x.answer_rate))), pct(mean(rows.map(x => x.answer_rate))), pct(r.answer_rate)],
            ["Median time to a person", fmtSecShort(median(topQ.map(x => x.time_to_human_s))), fmtSecShort(median(rows.map(x => x.time_to_human_s))), fmtSecShort(r.time_to_human_s)],
            ["Live or service after hours", pct(share(topQ, x => x.ah_outcome === "live" || x.ah_outcome === "service")), pct(share(rows, x => x.ah_outcome === "live" || x.ah_outcome === "service")), (r.ah_outcome === "live" || r.ah_outcome === "service") ? "Yes" : "No"],
            ["Online booking", pct(share(topQ, x => x.online_booking)), pct(share(rows, x => x.online_booking)), r.online_booking ? "Yes" : "No"],
          ])}
          <p class="muted">The cohort is matched on system type, location-count band and rurality. Comparing a 7-clinic rural FQHC with a 40-site metro group tells you nothing.</p>
        </div>
      </div>`;
    const colors = h.counts.map((_, i) => i === myBin ? css("--accent") : css("--chart-1"));
    barChart("c-peer", h.labels, h.counts, { colors, xTitle: "DFD Score", yTitle: "Systems", tip: (v, i) => `${v} systems${i === myBin ? " (includes yours)" : ""}` });
  }

  function renderNational() {
    const types = [...new Set(SYS.map(r => r.system_type))].sort();
    const sizes = ["1-4", "5-9", "10-24", "25-49", "50+"];
    const rurs = ["Rural", "Micropolitan", "Metro"];
    const opt = (vals, cur, all) => `<option value="">${all}</option>` + vals.map(v => `<option ${v === cur ? "selected" : ""}>${v}</option>`).join("");
    $("#p-nat").innerHTML = `
      <div class="filters" role="group" aria-label="Filter national view">
        <div><label for="f-type">System type</label><select id="f-type">${opt(types, natFilters.type, "All types")}</select></div>
        <div><label for="f-size">Locations</label><select id="f-size">${opt(sizes, natFilters.size, "All sizes")}</select></div>
        <div><label for="f-rur">Rurality</label><select id="f-rur">${opt(rurs, natFilters.rur, "All areas")}</select></div>
      </div>
      <div id="nat-body" aria-live="polite"></div>`;
    ["type", "size", "rur"].forEach(k => $("#f-" + k).addEventListener("change", e => { natFilters[k] = e.target.value; renderNatBody(); }));
    renderNatBody();
  }

  function renderNatBody() {
    const f = natFilters;
    const rows = SYS.filter(r => (!f.type || r.system_type === f.type) && (!f.size || r.size_band === f.size) && (!f.rur || r.rurality === f.rur));
    const body = $("#nat-body");
    if (rows.length < 10) { body.innerHTML = `<p class="narr">Only ${rows.length} systems match these filters, too few to chart. Widen a filter.</p>`; return; }
    const scores = rows.map(r => r.dfd_score);
    const q1 = quantile(scores, .25), q3 = quantile(scores, .75);
    const top = rows.filter(r => r.dfd_score >= q3), bot = rows.filter(r => r.dfd_score <= q1);
    const h = histogram(rows);
    const corr = [
      { r: pearson(rows.map(x => x.ivr_layers), rows.map(x => Math.log(x.time_to_human_s))), t: "phone menu depth and time to reach a person" },
      { r: pearson(rows.map(x => Math.log(x.location_count)), rows.map(x => x.digital_score)), t: "number of locations and digital self-service" },
      { r: pearson(rows.map(x => x.digital_score), rows.map(x => x.phone_score)), t: "digital self-service and phone access" },
      { r: pearson(rows.map(x => x.ivr_layers), rows.map(x => x.answer_rate)), t: "phone menu depth and answer rate" },
    ].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const strength = r => Math.abs(r) >= .5 ? "strong" : Math.abs(r) >= .3 ? "moderate" : Math.abs(r) >= .15 ? "weak" : "no meaningful";
    const desc = f.type || f.size || f.rur ? [f.type, f.size && `${f.size} locations`, f.rur].filter(Boolean).join(", ") : "all systems";
    body.innerHTML = `
      <div class="kv">
        <div><b>${rows.length.toLocaleString()}</b><span>Systems (${esc(desc)})</span></div>
        <div><b>${median(scores).toFixed(1)}</b><span>Median DFD Score</span></div>
        <div><b>${q1.toFixed(0)}–${q3.toFixed(0)}</b><span>Middle half</span></div>
        <div><b>${fmtSecShort(median(rows.map(r => r.time_to_human_s)))}</b><span>Median time to a person</span></div>
      </div>
      <div class="grid-2">
        <div class="card"><figure>
          <h3>DFD Score distribution</h3>
          <div class="chart-box"><canvas id="c-nat" role="img" aria-label="Histogram of DFD Scores for the filtered systems. A table version follows."></canvas></div>
          <details class="tbl"><summary>Show as table</summary>${tableHTML(["Score range", "Systems"], h.labels.map((l, i) => [l, h.counts[i]]))}</details>
        </figure></div>
        <div class="card">
          <h3>Average score by state</h3>
          <div class="tilemap" id="tilemap-nat" role="img" aria-label="Tile map of average DFD Score by state for the filtered systems. A table version follows."></div>
          <div class="legend" id="nat-legend"></div>
          <details class="tbl"><summary>Show as table</summary><div id="nat-map-table"></div></details>
        </div>
        <div class="card">
          <h3>Top quarter vs. bottom quarter</h3>
          ${tableHTML(["Measure", "Top 25%", "Bottom 25%"], [
            ["Median time to a person", fmtSecShort(median(top.map(r => r.time_to_human_s))), fmtSecShort(median(bot.map(r => r.time_to_human_s)))],
            ["Calls reaching a person", pct(mean(top.map(r => r.answer_rate))), pct(mean(bot.map(r => r.answer_rate)))],
            ["Average phone menu layers", mean(top.map(r => r.ivr_layers)).toFixed(1), mean(bot.map(r => r.ivr_layers)).toFixed(1)],
            ["Live or service after hours", pct(share(top, r => r.ah_outcome === "live" || r.ah_outcome === "service")), pct(share(bot, r => r.ah_outcome === "live" || r.ah_outcome === "service"))],
            ["Online booking", pct(share(top, r => r.online_booking)), pct(share(bot, r => r.online_booking))],
            ["Median accessibility issues", median(top.map(r => r.wcag_violations)), median(bot.map(r => r.wcag_violations))],
          ])}
        </div>
        <div class="card">
          <h3>Relationships in the data</h3>
          <ul>${corr.map(c => `<li><b>${strength(c.r).replace(/^./, s => s.toUpperCase())}</b> ${c.r >= 0 ? "positive" : "negative"} link between ${c.t} (r = ${c.r.toFixed(2)}).</li>`).join("")}</ul>
          <p class="muted">Correlations are recomputed for whatever filters are applied. They describe the modeled sample and are not causal claims.</p>
        </div>
      </div>`;
    barChart("c-nat", h.labels, h.counts, { xTitle: "DFD Score", yTitle: "Systems", tip: v => `${v} systems` });
    renderTileMap($("#tilemap-nat"), rows, { legend: $("#nat-legend"), table: $("#nat-map-table"), selected: current && current.state, onPick: s => { const pick = SYS.filter(x => x.state === s).sort((a, b) => b.dfd_score - a.dfd_score)[0]; if (pick) { select(pick); document.getElementById("t-state").click(); } } });
  }

  // ---------- boot ----------
  chartDefaults();
  renderHero();
  renderOregon();
  renderPillars();
  renderTeasers();
  initGate();
  if (gateOpen()) unlock(false);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { chartDefaults(); renderTeasers(); if (explorerReady) renderActive(); });
})();
