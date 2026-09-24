/* RN.chart: small SVG chart kit. Every chart reads theme tokens through CSS classes/vars,
   draws to one scale, and leaves room in the viewBox for its outermost labels. */
(function () {
  'use strict';
  const RN = window.RN;
  const esc = (s) => RN.esc(s);
  const C = (RN.chart = {});

  /* Sparkline with area fill and an emphasized endpoint. values: number[] */
  C.spark = function (values, o) {
    o = Object.assign({ w: 120, h: 36, stroke: 'var(--viz-1)', fill: true, dot: true }, o || {});
    const v = values && values.length ? values : [0, 0];
    const max = Math.max(...v), min = Math.min(...v, 0);
    const span = max - min || 1;
    const pad = 3;
    const x = (i) => pad + (i * (o.w - pad * 2)) / Math.max(1, v.length - 1);
    const y = (n) => o.h - pad - ((n - min) / span) * (o.h - pad * 2);
    const pts = v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`);
    const line = 'M' + pts.join(' L');
    const area = `${line} L${x(v.length - 1).toFixed(1)},${o.h - pad} L${x(0).toFixed(1)},${o.h - pad} Z`;
    const last = pts[pts.length - 1].split(',');
    return `<svg class="spark" width="${o.w}" height="${o.h}" viewBox="0 0 ${o.w} ${o.h}" role="img" aria-label="${esc(o.label || 'Trend')}">
      ${o.fill ? `<path d="${area}" fill="${o.stroke}" opacity=".12"/>` : ''}
      <path d="${line}" fill="none" stroke="${o.stroke}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>
      ${o.dot ? `<circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${o.stroke}"/>` : ''}
    </svg>`;
  };

  /* Horizontal bars. rows: [{label, value, note?, hi?}] */
  C.bars = function (rows, o) {
    o = Object.assign({ w: 640, labelW: 210, rowH: 34, barH: 18, fmt: (n) => RN.fmt.int(n), max: null }, o || {});
    const max = o.max || Math.max(...rows.map((r) => r.value), 1);
    const valW = 64;
    const track = o.w - o.labelW - valW;
    const h = rows.length * o.rowH;
    const body = rows.map((r, i) => {
      const y = i * o.rowH;
      const bw = Math.max(2, (r.value / max) * track);
      const fill = r.hi ? 'var(--viz-1)' : r.muted ? 'var(--viz-muted)' : 'var(--viz-2)';
      return `<text x="0" y="${y + o.rowH / 2 + 4}">${esc(r.label)}</text>
        <rect x="${o.labelW}" y="${y + (o.rowH - o.barH) / 2}" width="${track}" height="${o.barH}" rx="4" fill="var(--viz-grid)"/>
        <rect x="${o.labelW}" y="${y + (o.rowH - o.barH) / 2}" width="${bw.toFixed(1)}" height="${o.barH}" rx="4" fill="${fill}"/>
        <text class="v" x="${o.labelW + track + 10}" y="${y + o.rowH / 2 + 4}">${esc(o.fmt(r.value, r))}</text>`;
    }).join('');
    return `<div class="chart"><svg viewBox="0 0 ${o.w} ${h}" role="img" aria-label="${esc(o.label || 'Bar chart')}">${body}</svg></div>`;
  };

  /* Vertical columns. rows: [{label, value, hi?}] */
  C.columns = function (rows, o) {
    o = Object.assign({ w: 640, h: 220, fmt: (n) => RN.fmt.int(n), max: null }, o || {});
    const max = o.max || Math.max(...rows.map((r) => r.value), 1);
    const top = 22, bottom = 30, plotH = o.h - top - bottom;
    const slot = o.w / rows.length;
    const bw = Math.min(96, slot * 0.6);
    const body = rows.map((r, i) => {
      const cx = slot * i + slot / 2;
      const bh = Math.max(2, (r.value / max) * plotH);
      const y = top + plotH - bh;
      const fill = r.hi ? 'var(--viz-1)' : 'var(--viz-2)';
      return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="5" fill="${fill}"/>
        <text class="v" x="${cx}" y="${(y - 7).toFixed(1)}" text-anchor="middle">${esc(o.fmt(r.value, r))}</text>
        <text x="${cx}" y="${o.h - 8}" text-anchor="middle">${esc(r.label)}</text>`;
    }).join('');
    return `<div class="chart"><svg viewBox="0 0 ${o.w} ${o.h}" role="img" aria-label="${esc(o.label || 'Column chart')}"><line class="grid-l" x1="0" x2="${o.w}" y1="${top + plotH}" y2="${top + plotH}"/>${body}</svg></div>`;
  };

  /* Line/area chart over time. series: [{name, values:number[], color?, dashed?}], labels: string[] */
  C.line = function (series, labels, o) {
    o = Object.assign({ w: 640, h: 220, fmt: (n) => RN.fmt.compact(n), ticks: 4, area: true }, o || {});
    const left = 40, right = 12, top = 14, bottom = 28;
    const pw = o.w - left - right, ph = o.h - top - bottom;
    const all = series.flatMap((s) => s.values);
    const max = niceMax(Math.max(...all, 1));
    const n = Math.max(...series.map((s) => s.values.length));
    const x = (i) => left + (i * pw) / Math.max(1, n - 1);
    const y = (v) => top + ph - (v / max) * ph;
    let grid = '';
    for (let t = 0; t <= o.ticks; t++) {
      const val = (max * t) / o.ticks;
      const yy = y(val);
      grid += `<line class="grid-l" x1="${left}" x2="${o.w - right}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><text x="${left - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${esc(o.fmt(val))}</text>`;
    }
    const step = Math.ceil(labels.length / 6);
    const xl = labels.map((l, i) => (i % step === 0 || i === labels.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${o.h - 8}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
    const paths = series.map((s, si) => {
      const col = s.color || (si === 0 ? 'var(--viz-1)' : 'var(--viz-muted)');
      const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      const d = 'M' + pts.join(' L');
      const area = o.area && si === 0 ? `<path d="${d} L${x(s.values.length - 1).toFixed(1)},${top + ph} L${x(0).toFixed(1)},${top + ph} Z" fill="${col}" opacity=".1"/>` : '';
      const lp = pts[pts.length - 1].split(',');
      return `${area}<path d="${d}" fill="none" stroke="${col}" stroke-width="${si === 0 ? 2.25 : 1.75}" ${s.dashed ? 'stroke-dasharray="5 5"' : ''} stroke-linejoin="round" stroke-linecap="round"/>${si === 0 ? `<circle cx="${lp[0]}" cy="${lp[1]}" r="4" fill="${col}"/>` : ''}`;
    }).join('');
    return `<div class="chart"><svg viewBox="0 0 ${o.w} ${o.h}" role="img" aria-label="${esc(o.label || 'Trend chart')}">${grid}${xl}${paths}</svg></div>`;
  };

  /* Radar over N axes. values 0..1. compare: optional second polygon (e.g. market median) */
  C.radar = function (axes, values, o) {
    o = Object.assign({ size: 300, compare: null, labels: true }, o || {});
    const s = o.size, cx = s / 2, cy = s / 2, r = s / 2 - 54;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
    const pt = (i, v) => [cx + Math.cos(ang(i)) * r * v, cy + Math.sin(ang(i)) * r * v];
    let rings = '';
    [0.25, 0.5, 0.75, 1].forEach((k) => {
      rings += `<polygon points="${axes.map((_, i) => pt(i, k).map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="none" class="grid-l"/>`;
    });
    const spokes = axes.map((_, i) => { const p = pt(i, 1); return `<line class="grid-l" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/>`; }).join('');
    const poly = (vals, fill, stroke, op) => `<polygon points="${vals.map((v, i) => pt(i, Math.max(0.04, v)).map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
    const labels = o.labels ? axes.map((a, i) => {
      const p = pt(i, 1.2);
      const anchor = Math.abs(p[0] - cx) < 8 ? 'middle' : p[0] > cx ? 'start' : 'end';
      return `<text x="${p[0].toFixed(1)}" y="${(p[1] + 4).toFixed(1)}" text-anchor="${anchor}">${esc(a)}</text>`;
    }).join('') : '';
    return `<div class="chart"><svg viewBox="0 0 ${s} ${s}" role="img" aria-label="${esc(o.label || 'Skill radar')}">${rings}${spokes}
      ${o.compare ? poly(o.compare, 'none', 'var(--viz-muted)', 0) : ''}
      ${poly(values, 'var(--viz-1)', 'var(--viz-1)', 0.18)}${labels}</svg></div>`;
  };

  /* Distribution curve with a marker (e.g. Reputation Index percentile). */
  C.bell = function (o) {
    o = Object.assign({ w: 220, h: 84, mean: 60, sd: 12, value: 71, min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }, o || {});
    const left = 4, right = 4, top = 8, bottom = 18;
    const pw = o.w - left - right, ph = o.h - top - bottom;
    const x = (v) => left + ((v - o.min) / (o.max - o.min)) * pw;
    const pdf = (v) => Math.exp(-0.5 * Math.pow((v - o.mean) / o.sd, 2));
    const pts = [];
    for (let v = o.min; v <= o.max; v += 1) pts.push(`${x(v).toFixed(1)},${(top + ph - pdf(v) * ph).toFixed(1)}`);
    const d = 'M' + pts.join(' L');
    const vx = x(o.value);
    const under = [];
    for (let v = o.min; v <= o.value; v += 1) under.push(`${x(v).toFixed(1)},${(top + ph - pdf(v) * ph).toFixed(1)}`);
    const ud = `M${x(o.min).toFixed(1)},${top + ph} L${under.join(' L')} L${vx.toFixed(1)},${top + ph} Z`;
    const ticks = o.ticks.map((t) => `<text x="${x(t).toFixed(1)}" y="${o.h - 4}" text-anchor="middle" style="font-size:10px">${t}</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${o.w} ${o.h}" role="img" aria-label="${esc(o.label || 'Distribution')}">
      <path d="${ud}" fill="var(--viz-1)" opacity=".16"/>
      <path d="${d}" fill="none" stroke="var(--viz-1)" stroke-width="1.5"/>
      <line x1="${x(o.mean).toFixed(1)}" x2="${x(o.mean).toFixed(1)}" y1="${top}" y2="${top + ph}" stroke="var(--mute-2)" stroke-dasharray="2 3"/>
      <line x1="${vx.toFixed(1)}" x2="${vx.toFixed(1)}" y1="${top - 4}" y2="${top + ph}" stroke="var(--ink)" stroke-width="1.5"/>
      <circle cx="${vx.toFixed(1)}" cy="${top - 4}" r="3.5" fill="var(--ink)"/>
      <line class="grid-l" x1="${left}" x2="${o.w - right}" y1="${top + ph}" y2="${top + ph}"/>${ticks}</svg></div>`;
  };

  /* Ring gauge 0..100 */
  C.ring = function (value, o) {
    o = Object.assign({ size: 88, stroke: 8, max: 100, color: 'var(--viz-1)' }, o || {});
    const r = (o.size - o.stroke) / 2, c = 2 * Math.PI * r;
    const pct = RN.clamp(value / o.max, 0, 1);
    return `<svg width="${o.size}" height="${o.size}" viewBox="0 0 ${o.size} ${o.size}" role="img" aria-label="${esc(o.label || value)}">
      <circle cx="${o.size / 2}" cy="${o.size / 2}" r="${r}" fill="none" stroke="var(--viz-grid)" stroke-width="${o.stroke}"/>
      <circle cx="${o.size / 2}" cy="${o.size / 2}" r="${r}" fill="none" stroke="${o.color}" stroke-width="${o.stroke}" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${o.size / 2} ${o.size / 2})"/>
    </svg>`;
  };

  /* Funnel: steps [{label, value}] as stepped horizontal bars with conversion rates. */
  C.funnel = function (steps, o) {
    o = Object.assign({ w: 640, rowH: 46 }, o || {});
    const max = Math.max(...steps.map((s) => s.value), 1);
    const labelW = 170, valW = 120, track = o.w - labelW - valW;
    const h = steps.length * o.rowH;
    const body = steps.map((s, i) => {
      const y = i * o.rowH;
      const bw = Math.max(3, (s.value / max) * track);
      const conv = i > 0 && steps[i - 1].value ? ` · ${Math.round((s.value / steps[i - 1].value) * 100)}%` : '';
      return `<text x="0" y="${y + o.rowH / 2 + 4}">${esc(s.label)}</text>
        <rect x="${labelW}" y="${y + 8}" width="${bw.toFixed(1)}" height="${o.rowH - 16}" rx="6" fill="var(--viz-1)" opacity="${(1 - i * 0.16).toFixed(2)}"/>
        <text class="v" x="${labelW + bw + 10}" y="${y + o.rowH / 2 + 4}">${RN.fmt.int(s.value)}<tspan style="font-weight:400;fill:var(--mute)">${conv}</tspan></text>`;
    }).join('');
    return `<div class="chart"><svg viewBox="0 0 ${o.w} ${h}" role="img" aria-label="${esc(o.label || 'Funnel')}">${body}</svg></div>`;
  };

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const k = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return k * p;
  }
  C.niceMax = niceMax;
})();
