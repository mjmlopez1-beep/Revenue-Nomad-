// Merlin illustration engine.
// A tiny isometric line-art renderer: every scene is authored back to front
// and faces are filled with the background colour, so later shapes hide
// earlier ones (painter's algorithm). No dependencies.

export const THEMES = {
  dark: {
    bg: "#0A1F1A",
    face: "#0A1F1A",
    top: "#0E2822",
    void: "#06140F",
    line: "#F4F1E8",
    accent: "#C9F03D",
    path: "#F2B632",
    pathShade: "#D29A1E",
    glow: "#FBEFC2",
    text: "#F4F1E8",
    muted: "#5F7A70",
  },
  light: {
    bg: "#F4F1E8",
    face: "#F4F1E8",
    top: "#FBFAF5",
    void: "#E3DFD0",
    line: "#0A1F1A",
    accent: "#3F8F2F",
    path: "#F2B632",
    pathShade: "#D29A1E",
    glow: "#FFDC7A",
    text: "#0A1F1A",
    muted: "#9AA79F",
  },
  // The adaptation: the line architecture in the current product's own tokens.
  // Pine ground, white lines, volt accents, saffron path, violet for the
  // person in between.
  pine: {
    bg: "#073F2F",
    face: "#073F2F",
    sideR: "#06382A",
    top: "#0B4A38",
    void: "#042B20",
    line: "#FFFFFF",
    accent: "#2EE59D",
    path: "#FFC12E",
    pathShade: "#E0A51F",
    glow: "#FFE39A",
    text: "#FFFFFF",
    muted: "#6FA08E",
    via: "#C08CF5",
    cloak: "#FF5A1F",
    cloakShade: "#D94410",
    transparent: true,
  },
  // Line architecture for dark panels on the ivory and forest app design.
  forest: {
    bg: "#0E3329",
    face: "#0E3329",
    sideR: "#0B2B22",
    top: "#134237",
    void: "#07211A",
    line: "#F4F1E8",
    accent: "#C9F03D",
    path: "#F2B632",
    pathShade: "#D29A1E",
    glow: "#FBEFC2",
    text: "#F4F1E8",
    muted: "#7FA091",
    via: "#C9B3EE",
    transparent: true,
  },
  // The blend: the dark line-art world with felt-green hills and the guide.
  blend: {
    bg: "#0C3128",
    face: "#0C3128",
    sideR: "#0A2921",
    top: "#124035",
    void: "#061C16",
    line: "#F4F1E8",
    accent: "#C9F03D",
    path: "#F2B632",
    pathShade: "#D29A1E",
    glow: "#FBEFC2",
    text: "#F4F1E8",
    muted: "#7FA091",
    hills: ["#0F3A2F", "#14463A", "#1F5644", "#6C7A33", "#8A9440"],
    cloak: "#D9582B",
    cloakShade: "#B4441E",
    cloak2: "#A88BD6",
    cloak2Shade: "#7955B5",
  },
  // Full palette: ivory and lilac buildings, mint ground, forest doorways.
  // Written without a background so it sits on any light surface.
  color: {
    bg: "#F4F1E9",
    face: "#FBF8F1",
    sideR: "#DDD0F0",
    top: "#E9DFF5",
    ground: "#CFE3D6",
    void: "#10392F",
    line: "#17241E",
    accent: "#7955B5",
    tree: "#2B5B4B",
    treeFill: "#BFD9C9",
    path: "#D29B43",
    pathShade: "#B65E40",
    glow: "#F3D48E",
    text: "#17241E",
    muted: "#A79FB5",
    transparent: true,
  },
};

const C = Math.cos(Math.PI / 6);
const S = 0.5;
const SPHERE = Math.SQRT2 * C; // radius of a projected unit sphere
const FLAT = Math.SQRT2 * S; // minor radius of a projected unit ground circle
const f = (n) => String(+n.toFixed(1));
const FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export class Scene {
  constructor({ id, w, h, scale = 36, origin, theme = "dark", sw = 2 }) {
    this.id = id;
    this.w = w;
    this.h = h;
    this.s = scale;
    this.o = origin || [w / 2, h / 2];
    this.t = THEMES[theme];
    this.sw = sw;
    this.out = [];
    this.defs = [];
    this.over = []; // markers and labels, always on top
    this.n = 0;
    this.bb = [Infinity, Infinity, -Infinity, -Infinity];
  }
  grow(x, y) {
    const b = this.bb;
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }

  // ---- projection ------------------------------------------------------
  P([x, y, z = 0]) {
    const px = this.o[0] + (x - y) * C * this.s;
    const py = this.o[1] + (x + y) * S * this.s - z * this.s;
    this.grow(px, py);
    return [px, py];
  }
  d(pts, close = true) {
    return (
      "M" +
      pts
        .map((p) => this.P(p))
        .map(([a, b]) => `${f(a)} ${f(b)}`)
        .join("L") +
      (close ? "Z" : "")
    );
  }
  raw(svg) {
    this.out.push(svg);
  }
  poly(pts, { fill = this.t.face, stroke = this.t.line, sw = this.sw, clip } = {}) {
    this.out.push(
      `<path d="${this.d(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${clip ? ` clip-path="url(#${clip})"` : ""}/>`
    );
  }
  line(pts, { stroke = this.t.line, sw = this.sw, dash } = {}) {
    this.out.push(
      `<path d="${this.d(pts, false)}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`
    );
  }

  // ---- solids ----------------------------------------------------------
  box(x, y, z, w, d, h, { top, side = this.t.face, stroke = this.t.line } = {}) {
    const o = { stroke };
    const t = this.t;
    if (!top) top = h <= 0.6 && t.ground ? t.ground : t.top;
    const sideR = t.sideR || side;
    this.poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], { ...o, fill: side });
    this.poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], { ...o, fill: sideR });
    this.poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], { ...o, fill: top });
  }

  // Square pyramid standing on (x, y) with side w.
  pyramid(x, y, z, w, h, { left = this.t.face, right = this.t.sideR || this.t.face } = {}) {
    const a = [x + w / 2, y + w / 2, z + h];
    this.poly([[x, y + w, z], [x + w, y + w, z], a], { fill: left });
    this.poly([[x + w, y, z], [x + w, y + w, z], a], { fill: right });
  }
  // Gabled roof over a footprint, pediment facing the viewer's left.
  gable(x, y, z, w, d, h) {
    const t = this.t;
    this.poly([[x + w, y, z], [x + w, y + d, z], [x + w / 2, y + d, z + h], [x + w / 2, y, z + h]], { fill: t.sideR || t.face });
    this.poly([[x, y + d, z], [x + w, y + d, z], [x + w / 2, y + d, z + h]], { fill: t.top });
  }
  // The crystal ball: the one filled circle, on whatever it stands on.
  ball(at, r) {
    const t = this.t;
    const [x, y] = this.P(at);
    const R = r * this.s;
    this.grow(x - R, y - 2 * R);
    this.grow(x + R, y);
    this.out.push(
      `<circle cx="${f(x)}" cy="${f(y - R)}" r="${f(R)}" fill="${t.path}" stroke="${t.line}" stroke-width="${this.sw}"/>`,
      `<path d="M${f(x - R * 0.62)} ${f(y - R * 1.1)}A${f(R * 0.64)} ${f(R * 0.64)} 0 0 1 ${f(x - R * 0.1)} ${f(y - R * 1.62)}" fill="none" stroke="${t.glow}" stroke-width="${f(this.sw * 2.2)}"/>`
    );
  }
  // The seat: a chair with a tall back.
  seat(x, y, z, u = 1) {
    this.box(x, y, z, 1.3 * u, 0.35 * u, 2.6 * u);
    this.box(x, y + 0.35 * u, z, 1.3 * u, 1.1 * u, 1.1 * u);
  }
  // Soft filled hill in screen space. It bleeds off the canvas and is not
  // counted when the scene is framed.
  hill(at, rx, ry, fill) {
    const keep = [...this.bb];
    const [px, py] = this.P(at);
    this.bb = keep;
    this.out.push(`<ellipse cx="${f(px)}" cy="${f(py + ry * 2.4)}" rx="${f(rx * 1.7)}" ry="${f(ry * 2.4)}" fill="${fill}"/>`);
  }
  // The guide: a hooded traveller with a staff. u scales the figure.
  figure(at, { u = 1, second = false, flip = false } = {}) {
    const t = this.t;
    const [x, y] = this.P(at);
    const c = second ? t.cloak2 || "#A88BD6" : t.cloak || "#D9582B";
    const cs = second ? t.cloak2Shade || "#7955B5" : t.cloakShade || "#B4441E";
    const X = (d) => f(x + d * u);
    const Y = (d) => f(y + d * u);
    this.grow(x - 40 * u, y - 112 * u);
    this.grow(x + 40 * u, y + 4 * u);
    const g =
      `<path d="M${X(-36)} ${Y(0)}Q${X(-14)} ${Y(-6)} ${X(-12)} ${Y(-34)}Q${X(-10)} ${Y(-62)} ${X(-4)} ${Y(-84)}Q${X(4)} ${Y(-70)} ${X(16)} ${Y(-64)}Q${X(25)} ${Y(-60)} ${X(25)} ${Y(-40)}L${X(27)} ${Y(0)}Q${X(-6)} ${Y(6)} ${X(-36)} ${Y(0)}Z" fill="${c}"/>` +
      `<path d="M${X(-36)} ${Y(0)}Q${X(-14)} ${Y(-6)} ${X(-12)} ${Y(-34)}Q${X(-4)} ${Y(-14)} ${X(4)} ${Y(3)}Q${X(-16)} ${Y(5)} ${X(-36)} ${Y(0)}Z" fill="${cs}"/>` +
      `<rect x="${X(3)}" y="${Y(-60)}" width="${f(18 * u)}" height="${f(26 * u)}" rx="${f(8 * u)}" fill="#F4EBDD"/>` +
      `<path d="M${X(3)} ${Y(-38)}H${X(21)}V${Y(-30)}H${X(3)}Z" fill="${c}"/>` +
      `<ellipse cx="${X(9.5)}" cy="${Y(-47)}" rx="${f(1.9 * u)}" ry="${f(3.3 * u)}" fill="#17241E"/><ellipse cx="${X(16)}" cy="${Y(-47)}" rx="${f(1.9 * u)}" ry="${f(3.3 * u)}" fill="#17241E"/>` +
      `<path d="M${X(32)} ${Y(-96)}V${Y(0)}" stroke="#EADFC8" stroke-width="${f(3.2 * u)}"/>` +
      `<rect x="${X(25)}" y="${Y(-36)}" width="${f(10 * u)}" height="${f(6 * u)}" rx="${f(2 * u)}" fill="${c}"/>` +
      `<circle cx="${X(32)}" cy="${Y(-103)}" r="${f(8.5 * u)}" fill="${t.path}"/>`;
    this.out.push(flip ? `<g transform="translate(${f(2 * x)} 0) scale(-1 1)">${g}</g>` : g);
  }

  // Arch on a visible face. face "x" = right-hand face at x=at (c runs along y),
  // face "y" = left-hand face at y=at (c runs along x). `map` overrides the
  // surface mapping (used for cylinders).
  arch({ face = "y", at = 0, c = 0, z = 0, w = 1.4, h = 2.4, depth = 0.55, lit = false, accent = true, fill, map }) {
    const t = this.t;
    const pt = map || ((u, v, off = 0) => (face === "x" ? [at - off, u, v] : [u, at - off, v]));
    const outline = (off) => {
      const r = w / 2;
      const zc = z + h - r;
      const pts = [pt(c - r, z, off), pt(c - r, zc, off)];
      const N = 14;
      for (let i = 1; i < N; i++) {
        const a = Math.PI - (i * Math.PI) / N;
        pts.push(pt(c + r * Math.cos(a), zc + r * Math.sin(a), off));
      }
      pts.push(pt(c + r, zc, off), pt(c + r, z, off));
      return pts;
    };
    const id = `${this.id}-a${this.n++}`;
    const front = this.d(outline(0));
    this.defs.push(`<clipPath id="${id}"><path d="${front}"/></clipPath>`);
    this.out.push(`<path d="${front}" fill="${fill || (lit ? t.glow : t.void)}"/>`);
    if (accent && !lit) {
      this.out.push(
        `<path d="${this.d(outline(depth), false)}" fill="none" stroke="${lit ? t.path : t.accent}" stroke-width="${this.sw}" clip-path="url(#${id})"/>`
      );
    }
    this.out.push(`<path d="${front}" fill="none" stroke="${t.line}" stroke-width="${this.sw}"/>`);
    return id;
  }

  // Row of arches along one face.
  arcade({ face, at, from, to, n, z, w, h, depth, skip = [] }) {
    const step = (to - from) / n;
    for (let i = 0; i < n; i++) {
      if (skip.includes(i)) continue;
      this.arch({ face, at, c: from + step * (i + 0.5), z, w, h, depth });
    }
  }

  // Stairs climbing into the picture. dir "-y" climbs up and to the right,
  // "-x" climbs up and to the left. (x, y) is the front-bottom corner edge.
  stairs({ x, y, z, dir = "-y", width = 2, steps = 6, rise = 0.5, run = 0.5, runner }) {
    const t = this.t;
    for (let i = steps - 1; i >= 0; i--) {
      const zt = z + (i + 1) * rise;
      const zb = z + i * rise;
      if (dir === "-y") {
        const yb = y - (i + 1) * run;
        const yf = y - i * run;
        this.box(x, yb, z, width, run, (i + 1) * rise);
        if (runner) {
          const a = x + runner.offset;
          const b = a + runner.width;
          this.poly([[a, yb, zt], [b, yb, zt], [b, yf, zt], [a, yf, zt]], { fill: t.path, stroke: t.pathShade, sw: 1 });
          this.poly([[a, yf, zb], [b, yf, zb], [b, yf, zt], [a, yf, zt]], { fill: t.pathShade, stroke: t.pathShade, sw: 1 });
        }
      } else {
        const xb = x - (i + 1) * run;
        const xf = x - i * run;
        this.box(xb, y, z, run, width, (i + 1) * rise);
        if (runner) {
          const a = y + runner.offset;
          const b = a + runner.width;
          this.poly([[xb, a, zt], [xf, a, zt], [xf, b, zt], [xb, b, zt]], { fill: t.path, stroke: t.pathShade, sw: 1 });
          this.poly([[xf, a, zb], [xf, b, zb], [xf, b, zt], [xf, a, zt]], { fill: t.pathShade, stroke: t.pathShade, sw: 1 });
        }
      }
    }
  }

  cylinder(cx, cy, z, r, h, { top, side = this.t.face } = {}) {
    const t = this.t;
    if (!top) top = h <= 0.6 && t.ground ? t.ground : t.top;
    const [bx, by] = this.P([cx, cy, z]);
    const [, ty] = this.P([cx, cy, z + h]);
    const rx = r * this.s * SPHERE;
    const ry = r * this.s * FLAT;
    this.grow(bx - rx, ty - ry);
    this.grow(bx + rx, by + ry);
    this.out.push(
      `<path d="M${f(bx - rx)} ${f(ty)}L${f(bx - rx)} ${f(by)}A${f(rx)} ${f(ry)} 0 0 0 ${f(bx + rx)} ${f(by)}L${f(bx + rx)} ${f(ty)}Z" fill="${side}" stroke="${t.line}" stroke-width="${this.sw}"/>`,
      `<ellipse cx="${f(bx)}" cy="${f(ty)}" rx="${f(rx)}" ry="${f(ry)}" fill="${top}" stroke="${t.line}" stroke-width="${this.sw}"/>`
    );
  }
  // Arch on a cylinder wall. theta in degrees, 45 faces the viewer.
  archCyl({ cx, cy, r, theta = 45, ...rest }) {
    const th = (theta * Math.PI) / 180;
    const map = (u, v, off = 0) => {
      const a = th - u / r;
      return [cx + (r - off) * Math.cos(a), cy + (r - off) * Math.sin(a), v];
    };
    return this.arch({ ...rest, c: 0, map });
  }
  dome(cx, cy, z, r, { ribs = 5 } = {}) {
    const t = this.t;
    const [px, py] = this.P([cx, cy, z]);
    const R = r * this.s * SPHERE;
    const ry = r * this.s * FLAT;
    this.grow(px - R, py - R);
    this.grow(px + R, py + ry);
    this.out.push(
      `<path d="M${f(px - R)} ${f(py)}A${f(R)} ${f(R)} 0 0 1 ${f(px + R)} ${f(py)}A${f(R)} ${f(ry)} 0 0 1 ${f(px - R)} ${f(py)}Z" fill="${t.face}" stroke="${t.line}" stroke-width="${this.sw}"/>`
    );
    for (let k = 0; k < ribs; k++) {
      const th = ((-25 + (140 * k) / (ribs - 1)) * Math.PI) / 180;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const ph = (i / 12) * (Math.PI / 2);
        pts.push([cx + r * Math.cos(ph) * Math.cos(th), cy + r * Math.cos(ph) * Math.sin(th), z + r * Math.sin(ph)]);
      }
      this.line(pts, { sw: 1.25 });
    }
  }

  // ---- path ------------------------------------------------------------
  // Flat ribbon lying on a surface. pts are [x, y] or [x, y, z].
  ribbon(pts, { z = 0, width = 1, smooth = true, clip, fill } = {}) {
    let p = pts.map((q) => [q[0], q[1], q[2] ?? z]);
    if (smooth && p.length > 2) p = catmull(p, 14);
    const L = [];
    const R = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)];
      const b = p[Math.min(p.length - 1, i + 1)];
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      let k = width / 2;
      if (!smooth && i > 0 && i < p.length - 1) {
        // miter join
        const u = norm([p[i][0] - a[0], p[i][1] - a[1]]);
        const v = norm([b[0] - p[i][0], b[1] - p[i][1]]);
        const m = norm([u[0] + v[0], u[1] + v[1]]);
        dx = m[0];
        dy = m[1];
        k /= Math.max(0.35, u[0] * m[0] + u[1] * m[1]);
      }
      const [nx, ny] = norm([-dy, dx]);
      L.push([p[i][0] + nx * k, p[i][1] + ny * k, p[i][2]]);
      R.push([p[i][0] - nx * k, p[i][1] - ny * k, p[i][2]]);
    }
    this.out.push(
      `<path d="${this.d([...L, ...R.reverse()])}" fill="${fill || this.t.path}"${clip ? ` clip-path="url(#${clip})"` : ""}/>`
    );
  }

  // ---- garden ----------------------------------------------------------
  tree(x, y, z, { h = 2.4, w = 0.42 } = {}) {
    const t = this.t;
    const [bx, by] = this.P([x, y, z]);
    const H = h * this.s;
    const W = w * this.s;
    const y0 = by - H * 0.1;
    this.grow(bx - W, by - H);
    this.grow(bx + W, by);
    this.out.push(
      `<path d="M${f(bx)} ${f(by)}V${f(y0)}" stroke="${t.tree || t.accent}" stroke-width="${this.sw}"/>`,
      `<path d="M${f(bx)} ${f(y0)}C${f(bx - W)} ${f(y0)} ${f(bx - W)} ${f(y0 - H * 0.5)} ${f(bx)} ${f(by - H)}C${f(bx + W)} ${f(y0 - H * 0.5)} ${f(bx + W)} ${f(y0)} ${f(bx)} ${f(y0)}Z" fill="${t.treeFill || t.face}" stroke="${t.tree || t.accent}" stroke-width="${this.sw}" stroke-linejoin="round"/>`
    );
  }
  shrub(x, y, z, { r = 0.5 } = {}) {
    const t = this.t;
    const [bx, by] = this.P([x, y, z]);
    const R = r * this.s;
    this.out.push(
      `<path d="M${f(bx - 1.7 * R)} ${f(by)}A${f(0.75 * R)} ${f(0.75 * R)} 0 0 1 ${f(bx - 0.7 * R)} ${f(by - 0.62 * R)}A${f(R)} ${f(R)} 0 0 1 ${f(bx + 0.85 * R)} ${f(by - 0.5 * R)}A${f(0.7 * R)} ${f(0.7 * R)} 0 0 1 ${f(bx + 1.7 * R)} ${f(by)}Z" fill="${t.treeFill || t.face}" stroke="${t.tree || t.accent}" stroke-width="${this.sw}" stroke-linejoin="round"/>`
    );
  }
  // Railing from a to b (3D points on the same level).
  rail(a, b, { h = 0.55, gap = 0.3 } = {}) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / gap));
    const up = (p) => [p[0], p[1], p[2] + h];
    let dd = "";
    for (let i = 0; i <= n; i++) {
      const p = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, a[2]];
      const [x1, y1] = this.P(p);
      const [x2, y2] = this.P(up(p));
      dd += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
    }
    this.out.push(`<path d="${dd}" fill="none" stroke="${this.t.line}" stroke-width="1"/>`);
    this.line([up(a), up(b)]);
  }
  // Concentric ground-plane rings (signal ripples) around a 3D point.
  rings(at, radii, { stroke = this.t.accent, dash = "2 7" } = {}) {
    const [px, py] = this.P(at);
    radii.forEach((r, i) => {
      this.grow(px - r * this.s * SPHERE, py - r * this.s * FLAT);
      this.grow(px + r * this.s * SPHERE, py + r * this.s * FLAT);
      this.out.push(
        `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(r * this.s * SPHERE)}" ry="${f(r * this.s * FLAT)}" fill="none" stroke="${stroke}" stroke-width="${this.sw}" stroke-linecap="round" stroke-dasharray="${i === 0 ? "none" : dash}" opacity="${f(1 - i * 0.22)}"/>`
      );
    });
  }

  // ---- waypoints and labels -------------------------------------------
  marker(at, { color = this.t.path, r = 9 } = {}) {
    const [x, y] = this.P(at);
    this.over.push(
      `<circle cx="${f(x)}" cy="${f(y)}" r="${r + 4}" fill="${this.t.bg}"/><circle cx="${f(x)}" cy="${f(y)}" r="${r - 2}" fill="${this.t.bg}" stroke="${color}" stroke-width="3.5"/>`
    );
  }
  // Callout with an elbow leader. dx/dy place the text relative to the marker.
  label(at, text, { dx = 0, dy = -70, anchor = "start", size = 22 } = {}) {
    const t = this.t;
    const [mx, my] = this.P(at);
    const lines = text.split("\n");
    const width = Math.max(...lines.map((l) => l.length)) * size * 0.56;
    const tx = mx + dx;
    const ty = my + dy;
    const x0 = anchor === "start" ? tx : tx - width;
    const x1 = x0 + width;
    const uy = ty + (lines.length - 1) * size * 1.1 + 10;
    const far = Math.abs(mx - x0) > Math.abs(mx - x1) ? x0 : x1;
    const inside = mx >= x0 && mx <= x1;
    const dir = my > uy ? -1 : 1;
    const leader = inside
      ? `M${f(x0)} ${f(uy)}H${f(x1)}M${f(mx)} ${f(uy)}V${f(my + dir * 14)}`
      : `M${f(far)} ${f(uy)}H${f(mx)}V${f(my + dir * 14)}`;
    this.grow(x0, ty - size);
    this.grow(x1, uy);
    this.labels = this.labels || [];
    this.labels.push(
      `<path d="${leader}" fill="none" stroke="${t.accent}" stroke-width="2"/>` +
        lines
          .map(
            (l, i) =>
              `<text x="${f(tx)}" y="${f(ty + i * size * 1.1)}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${t.text}" stroke="${t.bg}" stroke-width="6" paint-order="stroke">${l}</text>`
          )
          .join("")
    );
  }

  svg({ labels = true, background = true, title = "" } = {}) {
    const t = this.t;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" height="${this.h}" role="img" aria-label="${title}">`,
      title ? `<title>${title}</title>` : "",
      this.defs.length ? `<defs>${this.defs.join("")}</defs>` : "",
      background && !t.transparent ? `<rect width="${this.w}" height="${this.h}" fill="${t.bg}"/>` : "",
      `<g stroke-linejoin="round" stroke-linecap="round">`,
      ...this.out,
      ...this.over,
      labels && this.labels ? this.labels.join("") : "",
      `</g></svg>`,
    ]
      .filter(Boolean)
      .join("\n");
  }
}

function norm([x, y]) {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
function catmull(p, seg) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    for (let j = 0; j < seg; j++) {
      const u = j / seg;
      out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u)));
    }
  }
  out.push(p[p.length - 1]);
  return out;
}
