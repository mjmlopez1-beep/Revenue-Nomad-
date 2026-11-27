// Merlin landscape illustrations: flat, geometric scenes about the solo
// fractional's journey. Everything is drawn in screen space with plain fills,
// back to front, on a transparent background.

export const INK = {
  forest: "#10392F",
  moss: "#2B5B4B",
  fern: "#6FA487",
  mint: "#CFE3D6",
  amethyst: "#7955B5",
  iris: "#A88BD6",
  lilac: "#E9DFF5",
  haze: "#D8C8EF",
  gold: "#D29B43",
  sun: "#F0BE6A",
  terra: "#B65E40",
  clay: "#E3B7A3",
  ivory: "#F4F1E9",
  paper: "#FBF8F1",
  ink: "#17241E",
  blue: "#3E6FD1",
  skin: "#E9B88E",
  stone: "#8C8FA6",
  slate: "#5B5F7A",
};
// The same scenes on a forest background (the sidebar): darker, moonlit.
export const NIGHT = {
  ...INK,
  lilac: "#3B4F6B",
  haze: "#4A3F7A",
  iris: "#8E6CC8",
  amethyst: "#6A4AA6",
  mint: "#1B4A3C",
  fern: "#2B5B4B",
  moss: "#1F4B3D",
  forest: "#0A2A22",
};

const r = (n) => String(+n.toFixed(1));

export function kit(C = INK) {
  const k = {
    C,
    hill: (cx, by, rx, fill, ry = rx) => `<path d="M${r(cx - rx)} ${r(by)}A${r(rx)} ${r(ry)} 0 0 1 ${r(cx + rx)} ${r(by)}Z" fill="${fill}"/>`,
    // Tall pointed peak with concave sides.
    peak: (cx, by, w, h, fill) =>
      `<path d="M${r(cx - w * 0.62)} ${r(by)}Q${r(cx - w * 0.2)} ${r(by - h * 0.5)} ${r(cx)} ${r(by - h)}Q${r(cx + w * 0.2)} ${r(by - h * 0.5)} ${r(cx + w * 0.62)} ${r(by)}Z" fill="${fill}"/>`,
    // Jagged cold mountain.
    crag: (cx, by, w, h, fill) =>
      `<path d="M${r(cx - w / 2)} ${r(by)}L${r(cx - w * 0.22)} ${r(by - h * 0.62)}L${r(cx - w * 0.1)} ${r(by - h * 0.5)}L${r(cx + w * 0.04)} ${r(by - h)}L${r(cx + w * 0.2)} ${r(by - h * 0.55)}L${r(cx + w * 0.3)} ${r(by - h * 0.66)}L${r(cx + w / 2)} ${r(by)}Z" fill="${fill}"/>`,
    sun: (cx, cy, rad, fill = C.sun) => `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" fill="${fill}"/>`,
    rect: (x, y, w, h, fill, rx = 0) => `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${rx}" fill="${fill}"/>`,
    pine: (x, by, h, fill = C.forest) => {
      const w = h * 0.46;
      let s = `<rect x="${r(x - h * 0.03)}" y="${r(by - h * 0.14)}" width="${r(h * 0.06)}" height="${r(h * 0.14)}" fill="${fill}"/>`;
      for (let i = 0; i < 3; i++) {
        const y0 = by - h * 0.12 - i * h * 0.26;
        const ww = w * (1 - i * 0.24);
        s += `<path d="M${r(x - ww / 2)} ${r(y0)}L${r(x)} ${r(y0 - h * 0.38)}L${r(x + ww / 2)} ${r(y0)}Z" fill="${fill}"/>`;
      }
      return s;
    },
    bush: (x, by, rad, fill = C.moss) => k.hill(x, by, rad, fill, rad * 0.8),
    spark: (x, y, s, fill = C.gold) =>
      `<path d="M${r(x)} ${r(y - s)}Q${r(x + s * 0.18)} ${r(y - s * 0.18)} ${r(x + s)} ${r(y)}Q${r(x + s * 0.18)} ${r(y + s * 0.18)} ${r(x)} ${r(y + s)}Q${r(x - s * 0.18)} ${r(y + s * 0.18)} ${r(x - s)} ${r(y)}Q${r(x - s * 0.18)} ${r(y - s * 0.18)} ${r(x)} ${r(y - s)}Z" fill="${fill}"/>`,
    cloud: (x, y, s, fill) =>
      `<path d="M${r(x - 60 * s)} ${r(y)}a${r(22 * s)} ${r(22 * s)} 0 0 1 ${r(32 * s)} ${r(-18 * s)}a${r(30 * s)} ${r(30 * s)} 0 0 1 ${r(56 * s)} ${r(-4 * s)}a${r(20 * s)} ${r(20 * s)} 0 0 1 ${r(30 * s)} ${r(22 * s)}Z" fill="${fill}"/>`,
    // Ribbon road. pts are [x, y, width]; it tapers with distance.
    road: (pts, fill = C.gold) => {
      const p = smooth(pts, 12);
      const L = [];
      const R = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)];
        const b = p[Math.min(p.length - 1, i + 1)];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l;
        const ny = dx / l;
        const w = p[i][2] / 2;
        L.push(`${r(p[i][0] + nx * w)} ${r(p[i][1] + ny * w)}`);
        R.push(`${r(p[i][0] - nx * w)} ${r(p[i][1] - ny * w)}`);
      }
      return `<path d="M${[...L, ...R.reverse()].join("L")}Z" fill="${fill}"/>`;
    },
    line: (pts, stroke, w, dash) =>
      `<path d="M${pts.map(([x, y]) => `${r(x)} ${r(y)}`).join("L")}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
    flag: (x, by, h, fill = C.gold, pole = C.ink) =>
      `<path d="M${r(x)} ${r(by)}V${r(by - h)}" stroke="${pole}" stroke-width="${r(Math.max(2, h * 0.035))}" stroke-linecap="round"/>` +
      `<path d="M${r(x)} ${r(by - h)}L${r(x + h * 0.42)} ${r(by - h * 0.86)}L${r(x)} ${r(by - h * 0.7)}Z" fill="${fill}"/>`,
    tent: (x, by, w, fill = C.amethyst, door = C.forest) =>
      `<path d="M${r(x - w / 2)} ${r(by)}L${r(x)} ${r(by - w * 0.72)}L${r(x + w / 2)} ${r(by)}Z" fill="${fill}"/>` +
      `<path d="M${r(x - w * 0.12)} ${r(by)}L${r(x)} ${r(by - w * 0.4)}L${r(x + w * 0.12)} ${r(by)}Z" fill="${door}"/>`,
    fire: (x, by, s) =>
      `<path d="M${r(x - 9 * s)} ${r(by)}L${r(x + 9 * s)} ${r(by - 4 * s)}M${r(x + 9 * s)} ${r(by)}L${r(x - 9 * s)} ${r(by - 4 * s)}" stroke="${C.ink}" stroke-width="${r(3 * s)}" stroke-linecap="round"/>` +
      `<path d="M${r(x)} ${r(by - 26 * s)}Q${r(x + 11 * s)} ${r(by - 12 * s)} ${r(x + 6 * s)} ${r(by - 3 * s)}Q${r(x)} ${r(by)} ${r(x - 6 * s)} ${r(by - 3 * s)}Q${r(x - 11 * s)} ${r(by - 12 * s)} ${r(x)} ${r(by - 26 * s)}Z" fill="${C.terra}"/>` +
      `<path d="M${r(x)} ${r(by - 15 * s)}Q${r(x + 5 * s)} ${r(by - 8 * s)} ${r(x + 3 * s)} ${r(by - 3 * s)}Q${r(x)} ${r(by - 1 * s)} ${r(x - 3 * s)} ${r(by - 3 * s)}Q${r(x - 5 * s)} ${r(by - 8 * s)} ${r(x)} ${r(by - 15 * s)}Z" fill="${C.sun}"/>`,
    // Building with an arched doorway. lit doors glow gold.
    house: (x, by, w, h, { fill = C.paper, door = C.forest, lit = false, roof, dw = 0.36, dh = 0.56 } = {}) => {
      const ww = w * dw;
      const hh = Math.min(h * dh, h - 6);
      let s = `<rect x="${r(x - w / 2)}" y="${r(by - h)}" width="${r(w)}" height="${r(h)}" fill="${fill}"/>`;
      if (roof) s += `<path d="M${r(x - w / 2 - 3)} ${r(by - h)}L${r(x)} ${r(by - h - w * 0.42)}L${r(x + w / 2 + 3)} ${r(by - h)}Z" fill="${roof}"/>`;
      s += `<path d="M${r(x - ww / 2)} ${r(by)}V${r(by - hh + ww / 2)}A${r(ww / 2)} ${r(ww / 2)} 0 0 1 ${r(x + ww / 2)} ${r(by - hh + ww / 2)}V${r(by)}Z" fill="${lit ? C.sun : door}"/>`;
      return s;
    },
    // ---- monuments: the places people built ------------------------------
    pyramid: (cx, by, w, h, fill = C.sun, shade = C.gold) =>
      `<path d="M${r(cx - w / 2)} ${r(by)}L${r(cx)} ${r(by - h)}L${r(cx + w / 2)} ${r(by)}Z" fill="${fill}"/>` +
      `<path d="M${r(cx)} ${r(by - h)}L${r(cx + w / 2)} ${r(by)}H${r(cx + w * 0.14)}Z" fill="${shade}"/>`,
    obelisk: (x, by, h, fill = C.terra) =>
      `<path d="M${r(x - h * 0.07)} ${r(by)}L${r(x - h * 0.045)} ${r(by - h * 0.88)}L${r(x)} ${r(by - h)}L${r(x + h * 0.045)} ${r(by - h * 0.88)}L${r(x + h * 0.07)} ${r(by)}Z" fill="${fill}"/>`,
    palm: (x, by, h, fill = C.moss) => {
      const tx = x + h * 0.08;
      const ty = by - h;
      let s = `<path d="M${r(x)} ${r(by)}Q${r(x - h * 0.06)} ${r(by - h * 0.5)} ${r(tx)} ${r(ty)}" fill="none" stroke="${C.ink}" stroke-width="${r(h * 0.045)}" stroke-linecap="round"/>`;
      for (const [dx, dy] of [[-0.42, 0.1], [-0.3, -0.16], [0, -0.26], [0.3, -0.16], [0.42, 0.1]]) {
        s += `<path d="M${r(tx)} ${r(ty)}Q${r(tx + dx * h * 0.6)} ${r(ty + dy * h - h * 0.12)} ${r(tx + dx * h)} ${r(ty + dy * h + h * 0.1)}Q${r(tx + dx * h * 0.5)} ${r(ty + dy * h * 0.4 + h * 0.02)} ${r(tx)} ${r(ty)}Z" fill="${fill}"/>`;
      }
      return s;
    },
    // Stepped pyramid with a stair up the front and a shrine on top.
    stepPyramid: (cx, by, w, h, steps = 5, { fill = C.stone, shade = C.slate, stair = C.paper, top = C.terra } = {}) => {
      let s = "";
      const sh = (h * 0.8) / steps;
      for (let i = 0; i < steps; i++) {
        const ww = w * (1 - (i * 0.72) / steps);
        s += `<rect x="${r(cx - ww / 2)}" y="${r(by - (i + 1) * sh)}" width="${r(ww)}" height="${r(sh + 0.5)}" fill="${i % 2 ? shade : fill}"/>`;
      }
      const tw = w * 0.2;
      s += `<path d="M${r(cx - w * 0.07)} ${r(by)}L${r(cx - w * 0.04)} ${r(by - h * 0.8)}H${r(cx + w * 0.04)}L${r(cx + w * 0.07)} ${r(by)}Z" fill="${stair}"/>`;
      s += `<rect x="${r(cx - tw / 2)}" y="${r(by - h)}" width="${r(tw)}" height="${r(h * 0.2)}" fill="${top}"/>`;
      s += `<rect x="${r(cx - tw * 0.16)}" y="${r(by - h * 0.93)}" width="${r(tw * 0.32)}" height="${r(h * 0.13)}" fill="${C.forest}"/>`;
      return s;
    },
    // Columned temple with a pediment.
    temple: (cx, by, w, h, n = 6, { fill = C.paper, shade = C.lilac, dark = C.forest } = {}) => {
      const base = h * 0.12;
      const ped = h * 0.26;
      const ent = h * 0.08;
      const colH = h - base - ped - ent;
      const iw = w * 0.9;
      let s = `<rect x="${r(cx - w / 2)}" y="${r(by - base / 2)}" width="${r(w)}" height="${r(base / 2)}" fill="${shade}"/>`;
      s += `<rect x="${r(cx - w * 0.47)}" y="${r(by - base)}" width="${r(w * 0.94)}" height="${r(base / 2 + 0.5)}" fill="${fill}"/>`;
      s += `<rect x="${r(cx - iw / 2)}" y="${r(by - base - colH)}" width="${r(iw)}" height="${r(colH)}" fill="${dark}"/>`;
      const cw = iw / (n * 1.9 - 0.9);
      for (let i = 0; i < n; i++) {
        s += `<rect x="${r(cx - iw / 2 + i * cw * 1.9)}" y="${r(by - base - colH)}" width="${r(cw)}" height="${r(colH + 0.5)}" fill="${fill}"/>`;
      }
      s += `<rect x="${r(cx - w * 0.48)}" y="${r(by - base - colH - ent)}" width="${r(w * 0.96)}" height="${r(ent + 0.5)}" fill="${shade}"/>`;
      s += `<path d="M${r(cx - w / 2)} ${r(by - base - colH - ent)}L${r(cx)} ${r(by - h)}L${r(cx + w / 2)} ${r(by - base - colH - ent)}Z" fill="${fill}"/>`;
      return s;
    },
    // Run of round arches, optionally in two tiers.
    arches: (x0, x1, by, h, n, { fill = C.clay, hole, tiers = 1 } = {}) => {
      let s = "";
      const th = h / tiers;
      for (let t = 0; t < tiers; t++) {
        const y1 = by - t * th;
        const m = n * (t + 1);
        const aw = (x1 - x0) / m;
        const rr = aw * 0.34;
        let d = `M${r(x0)} ${r(y1)}V${r(y1 - th)}H${r(x1)}V${r(y1)}`;
        for (let i = m - 1; i >= 0; i--) {
          const c = x0 + (i + 0.5) * aw;
          d += `H${r(c + rr)}V${r(y1 - th * 0.82 + rr + th * 0.1)}A${r(rr)} ${r(rr)} 0 0 0 ${r(c - rr)} ${r(y1 - th * 0.82 + rr + th * 0.1)}V${r(y1)}`;
        }
        if (hole) s += `<rect x="${r(x0)}" y="${r(y1 - th)}" width="${r(x1 - x0)}" height="${r(th)}" fill="${hole}"/>`;
        s += `<path d="${d}Z" fill="${fill}"/>`;
      }
      return s;
    },
    // Tiered tower with upswept roofs.
    pagoda: (cx, by, w, tiers = 4, { wall = C.paper, roof = C.terra, door = C.forest } = {}) => {
      let s = "";
      let y = by;
      for (let i = 0; i < tiers; i++) {
        const ww = w * (1 - i * 0.17);
        const hh = w * 0.3;
        s += `<rect x="${r(cx - ww * 0.3)}" y="${r(y - hh)}" width="${r(ww * 0.6)}" height="${r(hh)}" fill="${wall}"/>`;
        if (i === 0) s += `<rect x="${r(cx - ww * 0.07)}" y="${r(y - hh * 0.7)}" width="${r(ww * 0.14)}" height="${r(hh * 0.7)}" fill="${door}"/>`;
        y -= hh;
        const rw = ww * 0.56;
        s += `<path d="M${r(cx - rw)} ${r(y - 2)}Q${r(cx - rw * 0.7)} ${r(y)} ${r(cx - ww * 0.26)} ${r(y - hh * 0.5)}H${r(cx + ww * 0.26)}Q${r(cx + rw * 0.7)} ${r(y)} ${r(cx + rw)} ${r(y - 2)}Q${r(cx + rw * 0.6)} ${r(y + hh * 0.16)} ${r(cx)} ${r(y + hh * 0.12)}Q${r(cx - rw * 0.6)} ${r(y + hh * 0.16)} ${r(cx - rw)} ${r(y - 2)}Z" fill="${roof}"/>`;
        y -= hh * 0.5;
      }
      s += `<path d="M${r(cx)} ${r(y)}V${r(y - w * 0.22)}" stroke="${C.gold}" stroke-width="${r(w * 0.035)}" stroke-linecap="round"/>`;
      return s;
    },
    // Wall along a ridge with square watchtowers. pts are [x, y] left to right.
    wall: (pts, t, { fill = C.clay, shade = C.terra } = {}) => {
      let s = k.line(pts, fill, t);
      pts.forEach(([x, y], i) => {
        if (i % 2 === 0) {
          s += `<rect x="${r(x - t * 0.9)}" y="${r(y - t * 2.1)}" width="${r(t * 1.8)}" height="${r(t * 2.6)}" fill="${shade}"/>`;
          s += `<rect x="${r(x - t * 1.1)}" y="${r(y - t * 2.5)}" width="${r(t * 2.2)}" height="${r(t * 0.5)}" fill="${fill}"/>`;
        }
      });
      return s;
    },
    block: (x, by, w, h, fill = C.paper) => `<rect x="${r(x - w / 2)}" y="${r(by - h)}" width="${r(w)}" height="${r(h)}" fill="${fill}"/>`,
    // Dotted outline: the thing that is not built yet.
    ghost: (d, stroke = C.amethyst) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 14"/>`,
    // Two-armed signpost: gold points right (the warm way), terracotta left.
    sign: (x, by, s) =>
      `<path d="M${r(x)} ${r(by)}V${r(by - 74 * s)}" stroke="${C.ink}" stroke-width="${r(5 * s)}" stroke-linecap="round"/>` +
      `<path d="M${r(x - 4 * s)} ${r(by - 70 * s)}h${r(40 * s)}l${r(11 * s)} ${r(9 * s)}l${r(-11 * s)} ${r(9 * s)}h${r(-40 * s)}Z" fill="${C.gold}"/>` +
      `<path d="M${r(x + 4 * s)} ${r(by - 46 * s)}h${r(-34 * s)}l${r(-10 * s)} ${r(8 * s)}l${r(10 * s)} ${r(8 * s)}h${r(34 * s)}Z" fill="${C.terra}"/>`,
    // A small walker with a pack. Faces right unless flip is set.
    hiker: (x, by, s, { jacket = C.gold, pack = C.terra, hat = C.forest, flip = false, pose = "walk" } = {}) => {
      const X = (dx) => r(x + dx * s);
      const Y = (dy) => r(by + dy * s);
      let g = "";
      g += `<rect x="${X(-16)}" y="${Y(-48)}" width="${r(11 * s)}" height="${r(20 * s)}" rx="${r(4 * s)}" fill="${pack}"/>`;
      g += `<path d="M${X(-1)} ${Y(-26)}L${X(-7)} ${Y(-1)}M${X(1)} ${Y(-26)}L${X(8)} ${Y(-1)}" stroke="${C.ink}" stroke-width="${r(5 * s)}" stroke-linecap="round"/>`;
      g += `<rect x="${X(-8)}" y="${Y(-50)}" width="${r(16 * s)}" height="${r(27 * s)}" rx="${r(6 * s)}" fill="${jacket}"/>`;
      g += `<circle cx="${X(1)}" cy="${Y(-57)}" r="${r(6.5 * s)}" fill="${C.skin}"/>`;
      g += `<path d="M${X(-6.5)} ${Y(-59)}A${r(7.5 * s)} ${r(7.5 * s)} 0 0 1 ${X(8.5)} ${Y(-59)}Z" fill="${hat}"/>`;
      g += `<path d="M${X(-10)} ${Y(-59)}H${X(12)}" stroke="${hat}" stroke-width="${r(3 * s)}" stroke-linecap="round"/>`;
      if (pose === "wave") {
        g += `<path d="M${X(4)} ${Y(-44)}L${X(14)} ${Y(-60)}" stroke="${jacket}" stroke-width="${r(5 * s)}" stroke-linecap="round"/>`;
      } else if (pose === "look") {
        g += `<path d="M${X(4)} ${Y(-44)}L${X(12)} ${Y(-55)}" stroke="${jacket}" stroke-width="${r(5 * s)}" stroke-linecap="round"/>`;
        g += `<path d="M${X(9)} ${Y(-57)}L${X(22)} ${Y(-60)}" stroke="${C.ink}" stroke-width="${r(4 * s)}" stroke-linecap="round"/>`;
      } else if (pose === "sit") {
        // handled by caller placing lower; same as walk without stick
        g += `<path d="M${X(4)} ${Y(-42)}L${X(12)} ${Y(-34)}" stroke="${jacket}" stroke-width="${r(5 * s)}" stroke-linecap="round"/>`;
      } else {
        g += `<path d="M${X(15)} ${Y(-46)}L${X(17)} ${Y(0)}" stroke="${C.ink}" stroke-width="${r(2.5 * s)}" stroke-linecap="round"/>`;
        g += `<path d="M${X(4)} ${Y(-42)}L${X(15)} ${Y(-36)}" stroke="${jacket}" stroke-width="${r(5 * s)}" stroke-linecap="round"/>`;
      }
      return flip ? `<g transform="translate(${r(2 * x)} 0) scale(-1 1)">${g}</g>` : g;
    },
  };
  return k;
}

function smooth(p, seg) {
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

export function wrap(body, { w, h, crop, title = "", radius = 0 }) {
  const [x, y, cw, ch] = crop || [0, 0, w, h];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${cw} ${ch}" width="${cw}" height="${ch}" role="img" aria-label="${title}">
<title>${title}</title>
${radius ? `<defs><clipPath id="c"><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${radius}"/></clipPath></defs><g clip-path="url(#c)">` : "<g>"}
${body.join("\n")}
</g></svg>`;
}
