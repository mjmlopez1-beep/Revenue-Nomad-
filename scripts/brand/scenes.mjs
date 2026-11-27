// Merlin scene and spot definitions. Every draw function paints back to front.
import { Scene, THEMES } from "./engine.mjs";

// Draw a scene twice: once to measure it, then again scaled and centred so it
// fills the canvas with even padding.
export function render(def, id, theme) {
  const { w, h, pad = 40, draw, fit = true } = def;
  let scale = 30;
  let origin = [w / 2, h / 2];
  let s;
  for (let i = 0; i < (fit ? 4 : 1); i++) {
    s = new Scene({ id, w, h, scale, origin, theme });
    draw(s);
    if (!fit) break;
    const [x0, y0, x1, y1] = s.bb;
    const k = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0));
    scale *= k;
    origin = [w / 2 - ((x0 + x1) / 2 - origin[0]) * k, h / 2 - ((y0 + y1) / 2 - origin[1]) * k];
  }
  return s;
}

const RUN = { offset: 0.5, width: 1 };

// ---------------------------------------------------------------- scenes
function terraces(s) {
  s.box(0, -12, 0, 8, 6, 6);
  s.arcade({ face: "x", at: 8, from: -12, to: -6, n: 3, z: 0.6, w: 1.2, h: 3.2 });
  s.box(1, -12, 6, 5, 3, 5);
  s.arcade({ face: "x", at: 6, from: -12, to: -9, n: 2, z: 6.8, w: 0.8, h: 2.6 });
  s.arch({ face: "y", at: -9, c: 3.5, z: 6, w: 2.2, h: 3.8, lit: true });
  s.ribbon([[3.5, -9], [3.5, -6]], { z: 6, smooth: false });
  s.tree(0.5, -6.8, 6, { h: 2.4 });
  s.tree(7.2, -8.6, 6, { h: 2.2 });
  s.rail([5, -6, 6], [8, -6, 6]);
  s.rail([0, -6, 6], [2, -6, 6]);
  s.box(0, -6, 0, 11, 7, 3);
  s.arcade({ face: "x", at: 11, from: -6, to: 1, n: 4, z: 0.4, w: 1.1, h: 2.1 });
  s.stairs({ x: 2.5, y: -3, z: 3, steps: 6, runner: RUN });
  s.ribbon([[3.5, -3], [3.6, -2], [5.2, -1.3], [6.8, -0.6], [7, 0.4], [7, 1]], { z: 3 });
  s.tree(0.7, 0.2, 3, { h: 2.2 });
  s.shrub(9.6, -3.6, 3, { r: 0.6 });
  s.tree(9.9, -0.2, 3, { h: 1.9 });
  s.rail([0, 1, 3], [5.6, 1, 3]);
  s.rail([8.4, 1, 3], [11, 1, 3]);
  s.box(-3, 1, 0, 16, 6.5, 1);
  s.arcade({ face: "y", at: 1, from: 0, to: 6, n: 4, z: 1, w: 1, h: 1.6, depth: 0.4 });
  s.stairs({ x: 6, y: 3, z: 1, steps: 4, runner: RUN });
  s.ribbon([[7, 3], [7, 3.8], [5.2, 4.6], [2.4, 4.6], [0.4, 5.6], [-1.4, 5.6]], { z: 1 });
  s.tree(-2.2, 2, 1, { h: 2.6 });
  s.shrub(10.6, 3, 1, { r: 0.6 });
  s.tree(11.9, 5.8, 1, { h: 2.2 });
  s.marker([-1.4, 5.6, 1], { color: s.t.accent });
  s.marker([5.4, -1.2, 3], { color: s.t.via || s.t.path });
  s.marker([3.5, -7.2, 6]);
  s.label([-1.4, 5.6, 1], "You", { dx: -30, dy: -80, anchor: "end" });
  s.label([5.4, -1.2, 3], "Mutual\ncontact", { dx: -30, dy: -150, anchor: "end" });
  s.label([3.5, -7.2, 6], "Introduction", { dx: -60, dy: -200, anchor: "end" });
}

function bridge(s) {
  s.box(-1, -2, -0.6, 20, 9.4, 0.6);
  // left pier
  s.box(0, -1, 0, 5, 7, 6);
  s.arcade({ face: "y", at: 6, from: 0, to: 5, n: 2, z: 0, w: 1.4, h: 3.2 });
  s.tree(0.8, 0.2, 6, { h: 2.6 });
  s.tree(2.2, -0.2, 6, { h: 2 });
  s.ribbon([[1.4, 4.8], [3, 3.5], [5, 3]], { z: 6 });
  s.shrub(3.6, 5.2, 6, { r: 0.55 });
  // span
  s.box(5, 2, 0, 7, 2, 6);
  s.arch({ face: "y", at: 4, c: 8.5, z: 0, w: 5.2, h: 4.9, depth: 2 });
  s.rail([5, 2, 6], [12, 2, 6]);
  s.ribbon([[5, 3], [12, 3]], { z: 6, smooth: false });
  s.rail([5, 4, 6], [12, 4, 6]);
  // right pier + gatehouse
  s.box(12, -1, 0, 6, 7, 6);
  s.arcade({ face: "y", at: 6, from: 12, to: 18, n: 3, z: 0, w: 1.3, h: 3.2 });
  s.arcade({ face: "x", at: 18, from: -1, to: 6, n: 3, z: 0, w: 1.4, h: 3.2 });
  s.box(13, -1, 6, 4, 2.6, 4.6);
  s.arcade({ face: "x", at: 17, from: -1, to: 1.6, n: 2, z: 6.8, w: 0.7, h: 2.4 });
  s.arch({ face: "y", at: 1.6, c: 15, z: 6, w: 2, h: 3.5, lit: true });
  s.ribbon([[12, 3], [13.6, 3.1], [14.8, 2.7], [15, 1.6]], { z: 6 });
  s.tree(13.2, 5, 6, { h: 2.4 });
  s.shrub(16.6, 4.6, 6, { r: 0.6 });
  s.marker([1.4, 4.8, 6], { color: s.t.accent });
  s.marker([8.5, 3, 6]);
  s.marker([13.8, 3.1, 6]);
  s.label([1.4, 4.8, 6], "You", { dx: -30, dy: -90, anchor: "end" });
  s.label([8.5, 3, 6], "Mutual\ncontact", { dx: -40, dy: -190, anchor: "end" });
  s.label([13.8, 3.1, 6], "Introduction", { dx: -40, dy: -300, anchor: "end" });
}

function doors(s) {
  s.box(-1, -0.4, -0.6, 18, 10.4, 0.6);
  s.box(0, 0, 0, 16, 1.6, 6.5);
  s.rail([0, 1.6, 6.5], [16, 1.6, 6.5], { h: 0.5 });
  const xs = [2, 5, 8, 11, 14];
  xs.forEach((c, i) => s.arch({ face: "y", at: 1.6, c, z: 0, w: 1.9, h: 4.2, lit: i === 3 }));
  s.arch({ face: "x", at: 16, c: 0.8, z: 0, w: 0.8, h: 3.4, depth: 0.3 });
  // routes not taken
  [[2, [5.4, 7.2]], [5, [6.4, 7.1]], [8, [8, 6]], [14, [10.2, 4.6]]].forEach(([c, from]) =>
    s.line([[from[0], from[1], 0], [c, 1.9, 0]], { stroke: s.t.muted, dash: "3 8" })
  );
  s.ribbon([[2, 8.8], [4.4, 7.5], [7, 7.2], [8.6, 5.6], [10.6, 4.3], [11, 1.6]], { z: 0 });
  s.tree(0.4, 2.6, 0, { h: 2.6 });
  s.tree(15.6, 2.6, 0, { h: 2.6 });
  s.shrub(13.6, 7.4, 0, { r: 0.7 });
  s.tree(15.4, 8.4, 0, { h: 2 });
  s.marker([2, 8.8, 0], { color: s.t.accent });
  s.marker([8, 6.3, 0]);
  s.marker([11, 2.3, 0]);
  s.label([2, 8.8, 0], "You", { dx: -30, dy: -115, anchor: "end" });
  s.label([8, 6.3, 0], "Mutual\ncontact", { dx: -260, dy: 150, anchor: "end" });
  s.label([11, 2.3, 0], "Introduction", { dx: 215, dy: 240 });
}

function summit(s) {
  s.box(-1, -1, -0.5, 14.5, 17.5, 0.5);
  s.box(0, 0, 0, 12, 12, 2);
  s.arcade({ face: "x", at: 12, from: 0, to: 12, n: 7, z: 0.2, w: 1, h: 1.5, depth: 0.4 });
  s.arcade({ face: "y", at: 12, from: 5, to: 12, n: 4, z: 0.2, w: 1, h: 1.5, depth: 0.4 });
  s.box(0, 0, 2, 9, 9, 2);
  s.arcade({ face: "x", at: 9, from: 0, to: 9, n: 5, z: 2.2, w: 1, h: 1.5, depth: 0.4 });
  s.arcade({ face: "y", at: 9, from: 5, to: 9, n: 2, z: 2.2, w: 1, h: 1.5, depth: 0.4 });
  s.box(0, 0, 4, 6, 6, 2);
  s.arcade({ face: "x", at: 6, from: 0, to: 6, n: 4, z: 4.2, w: 0.9, h: 1.5, depth: 0.4 });
  s.box(1.2, 0.6, 6, 4, 3, 3.4);
  s.arch({ face: "x", at: 5.2, c: 2.1, z: 6.6, w: 0.9, h: 2.2 });
  s.arch({ face: "y", at: 3.6, c: 3.2, z: 6, w: 1.7, h: 2.8, lit: true });
  s.ribbon([[3.2, 3.6], [3.2, 6]], { z: 6, smooth: false });
  s.stairs({ x: 2.2, y: 8, z: 4, steps: 4, runner: RUN });
  s.ribbon([[3.2, 8], [3.2, 9]], { z: 4, smooth: false });
  s.tree(7.8, 3, 4, { h: 2 });
  s.shrub(7.2, 7.6, 4, { r: 0.45 });
  s.stairs({ x: 2.2, y: 11, z: 2, steps: 4, runner: RUN });
  s.ribbon([[3.2, 11], [3.2, 12]], { z: 2, smooth: false });
  s.tree(10.8, 4, 2, { h: 2.2 });
  s.shrub(10.4, 10.4, 2, { r: 0.5 });
  s.stairs({ x: 2.2, y: 14, z: 0, steps: 4, runner: RUN });
  s.ribbon([[3.2, 14], [3.3, 14.9], [5, 15.3], [7.4, 15.2], [9.4, 15.8]], { z: 0 });
  s.tree(11.6, 13.6, 0, { h: 2.4 });
  s.shrub(0.2, 15.4, 0, { r: 0.6 });
  s.marker([9.4, 15.8, 0], { color: s.t.accent });
  s.marker([3.2, 11.5, 2]);
  s.marker([3.2, 8.5, 4]);
  s.marker([3.2, 4.8, 6]);
  s.label([9.4, 15.8, 0], "Prospect", { dx: 50, dy: 30 });
  s.label([3.2, 11.5, 2], "Outreach", { dx: -70, dy: -34, anchor: "end" });
  s.label([3.2, 8.5, 4], "Meeting", { dx: -70, dy: -34, anchor: "end" });
  s.label([3.2, 4.8, 6], "Engagement", { dx: -70, dy: -34, anchor: "end" });
}

function rotunda(s) {
  s.cylinder(0, 0, -0.5, 8.6, 0.5);
  s.tree(-5.4, -3.6, 0, { h: 2.8 });
  s.tree(-3.4, -5.6, 0, { h: 2.2 });
  s.tree(5.6, -4.2, 0, { h: 2.6 });
  s.cylinder(0, 0, 0, 5, 4.2);
  [-8, 98].forEach((theta) => s.archCyl({ cx: 0, cy: 0, r: 5, theta, z: 0, w: 1.7, h: 3.1 }));
  s.archCyl({ cx: 0, cy: 0, r: 5, theta: 45, z: 0, w: 2.3, h: 3.6, lit: true });
  s.cylinder(0, 0, 4.2, 3.6, 2.8);
  [-12, 16, 45, 74, 102].forEach((theta) => s.archCyl({ cx: 0, cy: 0, r: 3.6, theta, z: 4.7, w: 1.1, h: 1.9, depth: 0.4 }));
  s.cylinder(0, 0, 7, 3.9, 0.35);
  s.dome(0, 0, 7.35, 3.3);
  s.cylinder(0, 0, 10.5, 0.7, 0.5);
  s.ribbon([[-4.6, 5.6], [-2.2, 6.9], [0.8, 7.2], [3.6, 6.4], [4.8, 4.9], [3.6, 3.6]], { z: 0 });
  s.tree(-6.6, 2.6, 0, { h: 2.6 });
  s.shrub(-4.6, 2.2, 0, { r: 0.6 });
  s.tree(6.4, 1.2, 0, { h: 2.4 });
  s.shrub(1.4, 5.3, 0, { r: 0.5 });
  s.tree(7.2, 3.2, 0, { h: 1.9 });
  s.marker([-4.6, 5.6, 0], { color: s.t.accent });
  s.marker([2.4, 6.9, 0]);
  s.marker([3.8, 3.8, 0]);
  s.label([-4.6, 5.6, 0], "You", { dx: -45, dy: -175, anchor: "end" });
  s.label([2.4, 6.9, 0], "Mutual\ncontact", { dx: -40, dy: 105, anchor: "end" });
  s.label([3.8, 3.8, 0], "Introduction", { dx: 310, dy: 110 });
}

function beacon(s) {
  s.box(0, 0, -0.5, 14, 14, 0.5);
  const house = (x, y, w, h, n = 1) => {
    s.box(x, y, 0, w, w, h);
    s.arch({ face: "y", at: y + w, c: x + w / 2, z: 0, w: 0.9, h: Math.min(1.6, h - 0.4), depth: 0.35 });
    if (n) s.arch({ face: "x", at: x + w, c: y + w / 2, z: 0.5, w: 0.7, h: Math.min(1.3, h - 0.9), depth: 0.3 });
  };
  const top = [6.5, 6.5, 10.9];
  const targets = [];
  const signal = (p) => {
    s.line([top, p], { stroke: s.t.accent, dash: "3 8" });
    targets.push(p);
  };
  house(1.2, 4.6, 2.4, 2.4);
  signal([2.4, 5.8, 3.4]);
  house(10.2, 1.8, 2.6, 3.4);
  signal([11.5, 3.1, 4.4]);
  house(1, 9.4, 2.6, 2);
  signal([2.3, 10.7, 3]);
  s.tree(4.6, 2.2, 0, { h: 2.2 });
  s.tree(9, 5.4, 0, { h: 2 });
  // watchtower
  s.box(5, 5, 0, 3, 3, 9);
  s.arch({ face: "y", at: 8, c: 6.5, z: 0, w: 1.5, h: 2.8, lit: true });
  [3.6, 6.2].forEach((z) => {
    s.arch({ face: "y", at: 8, c: 6.5, z, w: 0.7, h: 1.5, depth: 0.3 });
    s.arch({ face: "x", at: 8, c: 6.5, z, w: 0.7, h: 1.5, depth: 0.3 });
  });
  s.box(4.6, 4.6, 9, 3.8, 3.8, 0.5);
  s.box(5.5, 5.5, 9.5, 2, 2, 1.6);
  s.arch({ face: "y", at: 7.5, c: 6.5, z: 9.6, w: 1, h: 1.3, depth: 0.3, lit: true });
  s.arch({ face: "x", at: 7.5, c: 6.5, z: 9.6, w: 1, h: 1.3, depth: 0.3, lit: true });
  s.rings([6.5, 6.5, 10.4], [2.4, 3.9, 5.4]);
  s.ribbon([[3.2, 12.8], [5.4, 13], [7.1, 11.8], [6.8, 9.8], [6.5, 8]], { z: 0 });
  house(10.4, 9, 2.4, 1.6, 0);
  s.shrub(12.4, 12.6, 0, { r: 0.6 });
  s.tree(9.4, 12.8, 0, { h: 2.2 });
  s.marker([3.2, 12.8, 0]);
  targets.forEach((p) => s.marker(p, { color: s.t.accent, r: 8 }));
  s.label([2.4, 5.8, 3.4], "Leader departed", { dx: -60, dy: -130, anchor: "end" });
  s.label([11.5, 3.1, 4.4], "New funding", { dx: 30, dy: -60 });
  s.label([2.3, 10.7, 3], "Hiring GTM", { dx: -30, dy: -60, anchor: "end" });
  s.label([3.2, 12.8, 0], "You", { dx: -40, dy: 70, anchor: "end" });
}

// One-point perspective corridor. Drawn in screen space and meant to bleed.
function arcade(s) {
  const t = s.t;
  const vx = 600;
  const vy = 470;
  const q = (k) => Math.pow(0.64, k);
  const r1 = (n) => String(+n.toFixed(1));
  const frame = (k) => {
    const A = 530 * q(k);
    const B = 400 * q(k);
    const fl = vy + 330 * q(k);
    const sp = vy - 110 * q(k);
    const half = (R) => `M${r1(vx - R)} ${r1(fl)}V${r1(sp)}A${r1(R)} ${r1(R)} 0 0 1 ${r1(vx + R)} ${r1(sp)}V${r1(fl)}`;
    s.raw(
      `<path d="${half(A)}H${r1(vx + B)}V${r1(sp)}A${r1(B)} ${r1(B)} 0 0 0 ${r1(vx - B)} ${r1(sp)}V${r1(fl)}Z" fill="${t.sideR && Math.round(k) % 2 ? t.top : t.face}" stroke="${t.line}" stroke-width="${Math.max(1, 2.4 * Math.min(1, q(k) * 1.6)).toFixed(2)}"/>`,
      `<path d="M${r1(vx - B)} ${r1(sp)}H${r1(vx - A)}M${r1(vx + B)} ${r1(sp)}H${r1(vx + A)}" stroke="${t.line}" stroke-width="1.2" fill="none"/>`
    );
  };
  const tree = (k, side) => {
    const z = q(k);
    const x = vx + side * 345 * z;
    const fl = vy + 330 * z;
    const pw = 38 * z;
    const ph = 46 * z;
    const H = 250 * z;
    const W = 30 * z;
    const y0 = fl - ph;
    s.raw(
      `<path d="M${r1(x)} ${r1(y0)}C${r1(x - W)} ${r1(y0)} ${r1(x - W)} ${r1(y0 - H * 0.55)} ${r1(x)} ${r1(y0 - H)}C${r1(x + W)} ${r1(y0 - H * 0.55)} ${r1(x + W)} ${r1(y0)} ${r1(x)} ${r1(y0)}Z" fill="${t.treeFill || t.face}" stroke="${t.tree || t.accent}" stroke-width="2"/>`,
      `<rect x="${r1(x - pw)}" y="${r1(y0)}" width="${r1(2 * pw)}" height="${r1(ph)}" fill="${t.face}" stroke="${t.line}" stroke-width="2"/>`
    );
  };
  // floor
  for (const sx of [-1, 1]) {
    for (const off of [400, 530]) {
      s.raw(`<path d="M${vx} ${vy}L${r1(vx + sx * off * 3)} ${r1(vy + 330 * 3)}" stroke="${t.line}" stroke-width="1.2" fill="none"/>`);
    }
  }
  const N = 9;
  // the door at the end
  const dw = 400 * q(N) * 2.2;
  const dh = 440 * q(N) * 2.6;
  for (let k = N; k >= 0; k--) {
    frame(k);
    if (k === N) {
      const fl = vy + 330 * q(N);
      s.raw(
        `<path d="M${r1(vx - dw)} ${r1(fl)}V${r1(fl - dh)}A${r1(dw)} ${r1(dw)} 0 0 1 ${r1(vx + dw)} ${r1(fl - dh)}V${r1(fl)}Z" fill="${t.glow}" stroke="${t.path}" stroke-width="1.5"/>`
      );
    }
    if (k >= 1 && k <= 4) {
      tree(k - 0.45, -1);
      tree(k - 0.45, 1);
    }
  }
  // winding path, far to near
  const L = [];
  const R = [];
  const centre = (k) => vx + Math.sin(k * 1.5 + 0.9) * 165 * q(k) * Math.min(1, (N - k) / 5);
  for (let k = N; k >= -1.4; k -= 0.05) {
    const z = q(k);
    const y = vy + 330 * z;
    const c = centre(k);
    L.push(`${r1(c - 68 * z)} ${r1(y)}`);
    R.push(`${r1(c + 68 * z)} ${r1(y)}`);
  }
  s.raw(`<path d="M${[...L, ...R.reverse()].join("L")}Z" fill="${t.path}"/>`);
  const mark = (k, text, dx, dy, anchor, color) => {
    const x = centre(k);
    const y = vy + 330 * q(k);
    const r = 9;
    s.over.push(
      `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r + 4}" fill="${t.bg}"/><circle cx="${r1(x)}" cy="${r1(y)}" r="${r - 2}" fill="${t.bg}" stroke="${color}" stroke-width="3.5"/>`
    );
    // reuse the label helper by faking a projected point
    const keep = s.P;
    s.P = () => [x, y];
    s.label([0, 0, 0], text, { dx, dy, anchor });
    s.P = keep;
  };
  mark(0.15, "You", -190, -50, "end", t.accent);
  mark(1.75, "Mutual\ncontact", 150, -90, "start", t.path);
  mark(4.4, "Introduction", -110, -150, "end", t.path);
}

export const SCENES = {
  terraces: { w: 1200, h: 900, draw: terraces, title: "A path climbing three terraces to a lit doorway", use: "Primary hero. The warm introduction path from you, through a mutual contact, to a new client." },
  arcade: { w: 1200, h: 900, draw: arcade, fit: false, title: "A corridor of arches leading to a lit door", use: "Sign-in and landing hero. Full-bleed, crops well at any ratio." },
  bridge: { w: 1200, h: 900, draw: bridge, title: "A bridge joining two buildings", use: "Mutual contacts and referrals. The person in the middle who connects two sides." },
  doors: { w: 1200, h: 900, draw: doors, title: "A wall of five doors with one lit", use: "Matching and ICP. Many accounts, one with a warm way in." },
  summit: { w: 1200, h: 900, draw: summit, title: "A stepped tower with a stair to the top", use: "Pipeline and progress. Stages from prospect to signed engagement." },
  rotunda: { w: 1200, h: 900, draw: rotunda, title: "A domed rotunda on a round plaza", use: "Destination and trust. About, pricing or the client side of the product." },
  beacon: { w: 1200, h: 900, draw: beacon, title: "A watchtower signalling nearby buildings", use: "Timing signals and Why Now. Funding, departures and hiring picked up across accounts." },
};

// ----------------------------------------------------------------- spots
const SPOT = { w: 640, h: 640, pad: 56 };

function sDoor(s) {
  s.box(-1, -0.6, -0.4, 7, 8.4, 0.4);
  s.box(0.4, 0, 0, 4.2, 2.4, 6);
  s.arch({ face: "x", at: 4.6, c: 1.2, z: 0.8, w: 0.9, h: 3 });
  s.arch({ face: "y", at: 2.4, c: 2.5, z: 0, w: 2.3, h: 4.2, lit: true });
  s.ribbon([[2.5, 2.4], [2.6, 3.8], [3.7, 5], [3.6, 6.4], [2.6, 7.8]], { z: 0 });
  s.tree(0.2, 3.4, 0, { h: 2.6 });
  s.shrub(5, 3.4, 0, { r: 0.5 });
  s.marker([3.1, 7.1, 0], { color: s.t.accent });
}
function sStairs(s) {
  s.box(-0.6, -0.6, -0.4, 6.4, 8.6, 0.4);
  s.box(0, 0, 0, 5, 3.6, 3);
  s.arcade({ face: "x", at: 5, from: 0, to: 3.6, n: 2, z: 0.3, w: 1, h: 2 });
  s.tree(0.8, 0.8, 3, { h: 2.4 });
  s.ribbon([[2.5, 3.6], [2.5, 2.4], [3.4, 1.6], [4.2, 1.6]], { z: 3 });
  s.stairs({ x: 1.5, y: 6.6, z: 0, steps: 6, runner: RUN });
  s.ribbon([[2.5, 6.6], [2.5, 8]], { z: 0, smooth: false });
  s.shrub(4.6, 5.6, 0, { r: 0.5 });
  s.marker([4.2, 1.6, 3]);
  s.marker([2.5, 7.5, 0], { color: s.t.accent });
}
function sBridge(s) {
  s.box(0, 0, 0, 2.6, 3, 4);
  s.tree(0.7, 0.7, 4, { h: 2.2 });
  s.box(2.6, 0.6, 0, 5, 1.8, 4);
  s.arch({ face: "y", at: 2.4, c: 5.1, z: 0, w: 3.8, h: 3.2, depth: 1.8 });
  s.rail([2.6, 0.6, 4], [7.6, 0.6, 4]);
  s.rail([2.6, 2.4, 4], [7.6, 2.4, 4]);
  s.box(7.6, 0, 0, 2.6, 3, 4);
  s.arch({ face: "x", at: 10.2, c: 1.5, z: 0, w: 1.2, h: 2.6 });
  s.ribbon([[0.9, 2.1], [2.2, 1.5], [5.1, 1.5], [8, 1.5], [9.3, 2.1]], { z: 4, width: 0.9 });
  s.tree(9.5, 0.7, 4, { h: 2 });
  s.marker([0.9, 2.1, 4], { color: s.t.accent });
  s.marker([5.1, 1.5, 4]);
  s.marker([9.3, 2.1, 4]);
}
function sBeacon(s) {
  s.box(-1.4, -1.4, -0.4, 5.8, 5.8, 0.4);
  s.tree(-0.6, 2.6, 0, { h: 2 });
  s.box(0, 0, 0, 3, 3, 7);
  s.arch({ face: "y", at: 3, c: 1.5, z: 0, w: 1.4, h: 2.6 });
  s.arch({ face: "y", at: 3, c: 1.5, z: 4, w: 0.7, h: 1.5, depth: 0.3 });
  s.arch({ face: "x", at: 3, c: 1.5, z: 4, w: 0.7, h: 1.5, depth: 0.3 });
  s.box(-0.4, -0.4, 7, 3.8, 3.8, 0.5);
  s.box(0.5, 0.5, 7.5, 2, 2, 1.6);
  s.arch({ face: "y", at: 2.5, c: 1.5, z: 7.6, w: 1, h: 1.3, depth: 0.3, lit: true });
  s.arch({ face: "x", at: 2.5, c: 1.5, z: 7.6, w: 1, h: 1.3, depth: 0.3, lit: true });
  s.rings([1.5, 1.5, 8.4], [2.3, 3.5, 4.7]);
  s.shrub(3.6, 3.4, 0, { r: 0.45 });
}
function sGarden(s) {
  s.box(0, 0, 0, 7, 7, 0.5);
  s.tree(1.2, 1.2, 0.5, { h: 3 });
  s.tree(2.6, 0.8, 0.5, { h: 2.2 });
  s.tree(5.6, 1.6, 0.5, { h: 2.6 });
  s.shrub(4.2, 2, 0.5, { r: 0.6 });
  s.ribbon([[6.4, 6.2], [5, 5.6], [4.4, 4.4], [3.2, 3.8]], { z: 0.5, width: 0.9 });
  s.shrub(1.4, 5, 0.5, { r: 0.7 });
  s.tree(0.8, 6.2, 0.5, { h: 2 });
  s.rings([3.2, 3.8, 0.5], [0.9, 1.5]);
  s.marker([3.2, 3.8, 0.5], { color: s.t.accent });
}
function sDeadEnd(s) {
  s.box(-0.6, -0.6, -0.4, 8.2, 7.6, 0.4);
  s.box(0, 0, 0, 7, 1.6, 5);
  s.rail([0, 1.6, 5], [7, 1.6, 5], { h: 0.45 });
  // a doorway that is not there
  const pts = [[2.4, 1.6, 0], [2.4, 1.6, 2.4]];
  for (let i = 1; i < 12; i++) {
    const a = Math.PI - (i * Math.PI) / 12;
    pts.push([3.5 + 1.1 * Math.cos(a), 1.6, 2.4 + 1.1 * Math.sin(a)]);
  }
  pts.push([4.6, 1.6, 2.4], [4.6, 1.6, 0]);
  s.line(pts, { stroke: s.t.muted, dash: "4 8" });
  s.ribbon([[6, 6.4], [4.6, 5.6], [3.4, 4.2], [3.5, 1.6]], { z: 0 });
  s.tree(0.5, 2.6, 0, { h: 2.4 });
  s.shrub(6.2, 2.6, 0, { r: 0.5 });
  s.marker([3.5, 2.2, 0], { color: s.t.muted });
  s.marker([6, 6.4, 0], { color: s.t.accent });
}
function sMatch(s) {
  s.box(-0.6, -0.6, -0.4, 9.2, 6.2, 0.4);
  s.box(0, 0, 0, 2.6, 2, 4.4);
  s.arch({ face: "y", at: 2, c: 1.3, z: 0, w: 1.5, h: 3, lit: true });
  s.box(5.4, 0, 0, 2.6, 2, 4.4);
  s.arch({ face: "x", at: 8, c: 1, z: 0.6, w: 0.8, h: 2.4 });
  s.arch({ face: "y", at: 2, c: 6.7, z: 0, w: 1.5, h: 3, lit: true });
  s.tree(4, 0.8, 0, { h: 2.4 });
  s.ribbon([[1.3, 2], [1.4, 3.4], [2.8, 4.4], [5.2, 4.4], [6.6, 3.4], [6.7, 2]], { z: 0, width: 0.9 });
  s.marker([4, 4.5, 0]);
}
function sPin(s) {
  s.cylinder(0, 0, 0, 3.6, 0.5);
  s.rings([0, 0, 0.5], [1.4, 2.2, 3]);
  s.tree(-2.4, -1.2, 0.5, { h: 2 });
  s.cylinder(0, 0, 0.5, 1, 2.4);
  s.archCyl({ cx: 0, cy: 0, r: 1, theta: 45, z: 0.5, w: 0.8, h: 1.6, depth: 0.3 });
  s.cylinder(0, 0, 2.9, 1.3, 0.3);
  s.tree(2.6, -0.6, 0.5, { h: 1.7 });
  s.line([[0, 0, 3.2], [0, 0, 5.2]], { stroke: s.t.accent });
  s.marker([0, 0, 5.2], { color: s.t.accent, r: 13 });
}

export const SPOTS = {
  door: { ...SPOT, draw: sDoor, title: "A path leading into a lit doorway", use: "Sign in, get started, primary call to action." },
  stairs: { ...SPOT, draw: sStairs, title: "A stair climbing to a terrace", use: "Onboarding steps and progress." },
  bridge: { ...SPOT, draw: sBridge, title: "A small bridge between two towers", use: "Mutual contact, referral or handoff." },
  beacon: { ...SPOT, draw: sBeacon, title: "A watchtower sending a signal", use: "Signals, alerts and Why Now panels." },
  garden: { ...SPOT, draw: sGarden, title: "A quiet garden with an empty waypoint", use: "Empty states: no prospects, no saved roles yet." },
  "dead-end": { ...SPOT, draw: sDeadEnd, title: "A path stopping at a wall with no door", use: "404 and error states." },
  match: { ...SPOT, draw: sMatch, title: "Two doorways joined by one path", use: "A match or a completed introduction." },
  pin: { ...SPOT, draw: sPin, title: "A waypoint marker on a round plinth", use: "Operator profile and ICP setup." },
};

// ----------------------------------------------------------------- blend
// The journey told in the line-art world: the guide walks the gold path,
// soft hills sit behind, and the destinations are places people built.
const hills = (s, list) => list.forEach(([at, rx, ry, i]) => s.hill(at, rx, ry, s.t.hills[i]));

function bSettingOut(s) {
  hills(s, [[[2, -22, 0], 520, 300, 1], [[-14, 2, 0], 420, 230, 2], [[16, -8, 0], 460, 200, 0]]);
  terraces(s);
  hills(s, [[[-6, 16, 0], 360, 110, 3]]);
  s.figure([-2.2, 5, 1], { u: 1.5 });
}

function bFork(s) {
  hills(s, [[[4, -16, 0], 560, 330, 1], [[18, -2, 0], 420, 220, 2]]);
  s.box(-1, -1, -0.6, 19, 13, 0.6);
  // the cold way: a blank wall
  s.box(0, 0, 0, 7, 1.6, 5.5);
  const pts = [[2.4, 1.6, 0], [2.4, 1.6, 2.6]];
  for (let i = 1; i < 12; i++) {
    const a = Math.PI - (i * Math.PI) / 12;
    pts.push([3.6 + 1.2 * Math.cos(a), 1.6, 2.6 + 1.2 * Math.sin(a)]);
  }
  pts.push([4.8, 1.6, 2.6], [4.8, 1.6, 0]);
  s.line(pts, { stroke: s.t.muted, dash: "4 8" });
  s.line([[8.6, 9.4, 0], [6.4, 7.4, 0], [5.2, 5, 0], [3.6, 3.6, 0], [3.6, 1.9, 0]], { stroke: s.t.muted, dash: "3 9", sw: 3 });
  // the warm way: a lit gate up a short stair
  s.box(10, 0, 0, 7, 4, 1.5);
  s.box(11, 0, 1.5, 5, 2.4, 5);
  s.arcade({ face: "x", at: 16, from: 0, to: 2.4, n: 2, z: 2.3, w: 0.7, h: 2.6 });
  s.arch({ face: "y", at: 2.4, c: 13.5, z: 1.5, w: 2.2, h: 3.8, lit: true });
  s.ribbon([[13.5, 2.4], [13.5, 4]], { z: 1.5, smooth: false });
  s.tree(10.6, 3.2, 1.5, { h: 2.2 });
  s.tree(16.4, 3.2, 1.5, { h: 2.2 });
  s.stairs({ x: 12.5, y: 5.5, z: 0, steps: 3, runner: RUN });
  s.ribbon([[13.5, 5.5], [13.4, 6.6], [11.6, 7.6], [10.2, 8.8], [9, 10]], { z: 0 });
  s.tree(0.4, 2.6, 0, { h: 2.4 });
  s.shrub(15.6, 9.4, 0, { r: 0.6 });
  s.tree(1.4, 10, 0, { h: 2 });
  s.figure([8.6, 10.4, 0], { u: 1.5 });
}

function bFellow(s) {
  hills(s, [[[0, -18, 0], 520, 300, 1], [[22, -6, 0], 420, 230, 2], [[-10, 6, 0], 380, 150, 0]]);
  bridge(s);
  s.figure([3.4, 4.6, 6], { u: 1.3 });
  s.figure([9.6, 3, 6], { u: 1.3, second: true, flip: true });
}

function bFirstStone(s) {
  hills(s, [[[2, -14, 0], 560, 300, 1], [[14, 2, 0], 420, 200, 2], [[-8, 10, 0], 380, 130, 3]]);
  s.box(-1, -1, -0.6, 13, 11, 0.6);
  // the temple that is not there yet
  const g = { stroke: s.t.muted, dash: "3 9" };
  s.line([[1, 1, 0], [1, 1, 5], [9, 1, 5], [9, 1, 0]], g);
  s.line([[1, 7, 0], [1, 7, 5], [9, 7, 5], [9, 7, 0]], g);
  s.line([[1, 1, 5], [1, 7, 5]], g);
  s.line([[9, 1, 5], [9, 7, 5]], g);
  s.line([[1, 7, 5], [5, 7, 7], [9, 7, 5]], g);
  s.line([[5, 7, 7], [5, 1, 7], [9, 1, 5]], g);
  [3, 5, 7].forEach((x) => s.line([[x, 7, 0], [x, 7, 5]], g));
  // what is there: three blocks and a tent
  s.box(1, 5.6, 0, 1.6, 1.4, 1);
  s.box(2.8, 5.6, 0, 1.6, 1.4, 1);
  s.box(1.9, 5.6, 1, 1.6, 1.4, 1);
  s.pyramid(7.2, 2.4, 0, 2.6, 2.4, { left: s.t.cloakShade, right: "#8F3618" });
  s.tree(10.6, 1, 0, { h: 2.4 });
  s.ribbon([[5.4, 8.2], [6.4, 8.8], [8.4, 9], [10, 9.6]], { z: 0 });
  s.box(5.2, 7.6, 0, 1.6, 1.4, 1);
  s.shrub(0.6, 9, 0, { r: 0.6 });
  s.figure([4.4, 8.6, 0], { u: 1.5 });
}

function bPyramids(s) {
  hills(s, [[[-2, -20, 0], 600, 320, 1], [[20, -4, 0], 460, 220, 2], [[-12, 8, 0], 400, 140, 3]]);
  s.box(-1, -1, -0.6, 20, 17, 0.6);
  s.pyramid(0.5, 0.5, 0, 5.5, 4.4);
  s.pyramid(4, 1, 0, 11, 9);
  s.pyramid(13.5, 5.5, 0, 4.5, 3.6);
  // gate at the foot of the great one
  s.box(8, 12, 0, 3, 1.6, 3);
  s.arch({ face: "y", at: 13.6, c: 9.5, z: 0, w: 1.6, h: 2.5, lit: true });
  [[5.6, 13], [12.6, 13]].forEach(([x, y]) => {
    s.box(x, y, 0, 0.7, 0.7, 4.2);
    s.pyramid(x, y, 4.2, 0.7, 0.8);
  });
  s.ribbon([[9.5, 13.6], [9.6, 14.4], [11.4, 14.8], [13.6, 14.6], [15.6, 15.2]], { z: 0 });
  s.tree(1.4, 8, 0, { h: 2.4 });
  s.tree(17.4, 12, 0, { h: 2.2 });
  s.shrub(3, 14.6, 0, { r: 0.6 });
  s.figure([15.2, 15.5, 0], { u: 1.5, flip: true });
}

function bTemple(s) {
  hills(s, [[[0, -18, 0], 560, 300, 1], [[18, -4, 0], 440, 220, 2], [[-10, 8, 0], 380, 130, 3]]);
  s.box(-2, -2, -0.6, 16, 16, 0.6);
  s.box(0, 0, 0, 10.4, 7.4, 0.6);
  s.box(0.5, 0.5, 0.6, 9.4, 6.4, 0.5);
  s.box(2.4, 2, 1.1, 5.6, 2.8, 4);
  s.arch({ face: "y", at: 4.8, c: 5.2, z: 1.1, w: 1.5, h: 3, lit: true });
  const col = (x, y) => s.cylinder(x, y, 1.1, 0.36, 4);
  [1.2, 2.8, 4.4].forEach((y) => col(9.2, y));
  [1.2, 2.8, 4.4, 6, 7.6, 9.2].forEach((x) => col(x, 6.2));
  s.box(0.6, 0.6, 5.1, 9.2, 6.2, 0.6);
  s.gable(0.6, 0.6, 5.7, 9.2, 6.2, 1.9);
  s.stairs({ x: 4.2, y: 8.6, z: 0, steps: 2, rise: 0.55, run: 0.6, runner: RUN });
  s.ribbon([[5.2, 8.6], [5.3, 9.6], [7, 10.4], [9.4, 10.6], [11.4, 11.4]], { z: 0 });
  s.tree(0.2, 9, 0, { h: 2.6 });
  s.tree(12.4, 2, 0, { h: 2.6 });
  s.shrub(2, 11.6, 0, { r: 0.6 });
  s.figure([11, 11.8, 0], { u: 1.5, flip: true });
}

function bZiggurat(s) {
  hills(s, [[[0, -16, 0], 600, 320, 1], [[22, 0, 0], 440, 220, 2], [[-10, 16, 0], 400, 130, 3]]);
  summit(s);
  s.figure([10.6, 15.6, 0], { u: 1.45, flip: true });
}

function bRotunda(s) {
  hills(s, [[[-6, -14, 0], 560, 300, 1], [[14, -6, 0], 460, 240, 2]]);
  rotunda(s);
  s.figure([-6, 4.8, 0], { u: 1.45 });
}

function bGuide(s) {
  hills(s, [[[6, -6, 0], 300, 190, 1], [[-6, 4, 0], 280, 150, 2]]);
  s.hill([0, 0, -1.2], 330, 170, s.t.hills[3]);
  s.box(-1.4, -1.4, 0, 2.8, 2.8, 0.5);
  s.figure([0, 0, 0.5], { u: 2.1 });
}

function bGuideDoor(s) {
  hills(s, [[[4, -8, 0], 320, 200, 1]]);
  sDoor(s);
  s.figure([3.2, 7.4, 0], { u: 1.55 });
}

function bBeacon(s) {
  hills(s, [[[4, -6, 0], 320, 200, 1], [[-8, 4, 0], 280, 130, 3]]);
  sBeacon(s);
  s.figure([3.6, 4.2, 0], { u: 1.1 });
}

export const BLEND = {
  "setting-out": { w: 1200, h: 900, draw: bSettingOut, kind: "scene", stage: "Starting out", title: "The guide at the foot of a terraced climb", use: "Hero. One traveller, a gold path and a lit door at the top." },
  fork: { w: 1200, h: 900, draw: bFork, kind: "scene", stage: "Choosing the road", title: "The guide between a blank wall and a lit gate", use: "The pitch. The cold way ends at a wall with no door. The warm way has steps and a light on." },
  fellow: { w: 1200, h: 900, draw: bFellow, kind: "scene", stage: "Not alone", title: "Two cloaked travellers meeting on a bridge", use: "Warm paths, fellow fractionals and introductions." },
  "first-stone": { w: 1200, h: 900, draw: bFirstStone, kind: "scene", stage: "Where it began", title: "The guide beside a tent and three blocks, with a temple outlined in dots", use: "The pairing piece for every destination." },
  pyramids: { w: 1200, h: 900, draw: bPyramids, kind: "destination", stage: "The pyramids", title: "Three pyramids with obelisks and a lit gate", use: "Destination. Scale built one block at a time." },
  temple: { w: 1200, h: 900, draw: bTemple, kind: "destination", stage: "The temple", title: "A columned temple with a lit doorway", use: "Destination. Craft and reputation that lasts." },
  ziggurat: { w: 1200, h: 900, draw: bZiggurat, kind: "destination", stage: "The stepped city", title: "A stepped tower with one stair to the top", use: "Destination and pipeline. One level, then the next." },
  rotunda: { w: 1200, h: 900, draw: bRotunda, kind: "destination", stage: "The rotunda", title: "A domed rotunda on a round plaza", use: "Destination. Something built to be visited." },
  guide: { ...SPOT, draw: bGuide, kind: "spot", stage: "", title: "The guide on a hill", use: "The character on its own: avatars, empty states, sign-in." },
  "guide-door": { ...SPOT, draw: bGuideDoor, kind: "spot", stage: "", title: "The guide on the path to a lit door", use: "Get started and unlock." },
  "guide-beacon": { ...SPOT, draw: bBeacon, kind: "spot", stage: "", title: "The guide below a signalling tower", use: "Signals and Crystal Ball." },
};

// ----------------------------------------------------------------- adapt
// Pieces for the current product: a long wall of doors for the Companies
// page, and a small doorway for pine cards.
function aCompanies(s) {
  s.box(-1, -0.4, -0.5, 30, 9.4, 0.5);
  s.box(0, 0, 0, 28, 1.6, 5.6);
  s.rail([0, 1.6, 5.6], [28, 1.6, 5.6], { h: 0.45 });
  const xs = [2, 5, 8, 11, 14, 17, 20, 23, 26];
  xs.forEach((c, i) => s.arch({ face: "y", at: 1.6, c, z: 0, w: 1.8, h: 3.8, lit: i === 5 }));
  s.arch({ face: "x", at: 28, c: 0.8, z: 0, w: 0.8, h: 3.2, depth: 0.3 });
  [[8, [9.6, 6.4]], [11, [11, 5.8]], [14, [13, 5]], [20, [15.6, 4.4]], [23, [16.2, 4]]].forEach(([c, from]) =>
    s.line([[from[0], from[1], 0], [c, 1.9, 0]], { stroke: s.t.muted, dash: "3 8" })
  );
  s.ribbon([[2, 7.6], [5, 7.2], [8.6, 6.8], [12, 5.6], [15.4, 4.6], [17, 1.6]], { z: 0 });
  s.tree(0.5, 2.6, 0, { h: 2.4 });
  s.tree(27.4, 2.6, 0, { h: 2.4 });
  s.shrub(22, 6.6, 0, { r: 0.6 });
  s.tree(25, 7.4, 0, { h: 1.9 });
  s.marker([2, 7.6, 0], { color: s.t.accent });
  s.marker([10.4, 6.3, 0], { color: s.t.via });
  s.marker([16.6, 2.6, 0]);
}
function aDoor(s) {
  s.box(0.4, 0, 0, 4.2, 2.4, 6);
  s.arch({ face: "x", at: 4.6, c: 1.2, z: 0.8, w: 0.9, h: 3 });
  s.arch({ face: "y", at: 2.4, c: 2.5, z: 0, w: 2.3, h: 4.2, lit: true });
  s.ribbon([[2.5, 2.4], [2.6, 3.8], [3.7, 5], [3.6, 6.4], [2.6, 7.8]], { z: 0 });
  s.tree(0.2, 3.4, 0, { h: 2.6 });
  s.marker([3.5, 5.6, 0], { color: s.t.via });
  s.marker([3.1, 7.1, 0], { color: s.t.accent });
}
export const ADAPT = {
  "band-companies": { w: 1100, h: 400, pad: 12, draw: aCompanies, title: "A long wall of doors with one lit and a path leading to it" },
  "card-door": { w: 360, h: 420, pad: 10, draw: aDoor, title: "A path to a lit doorway" },
};

export { THEMES };
