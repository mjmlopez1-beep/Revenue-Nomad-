"use client";

import { useEffect, useRef, useState } from "react";

/**
 * GlassHero — a full-bleed WebGL backdrop that renders the landing hero as if it
 * were seen through a pane of old reinforced privacy glass: pebbled surface,
 * embedded wire mesh, and procedurally generated foliage swaying behind it.
 *
 * Everything is a single fragment shader on a full-screen triangle (no three.js,
 * no textures, no extra dependencies). The realism comes from three things:
 *
 *   1. Depth-dependent blur — foliage layers close to the glass render crisp,
 *      far layers dissolve into soft blobs, exactly like real frosted glass.
 *   2. Depth-dependent refraction — the pebbled surface normal displaces far
 *      layers much more than near ones (parallax through the glass).
 *   3. A milky "frost veil" that thickens with depth, plus specular glints on
 *      the pebbles from a warm light in the top-right.
 *
 * Motion pauses when the tab is hidden, when the hero scrolls out of view, when
 * the visitor prefers reduced motion (one static frame is drawn), or via the
 * pause button. If WebGL is unavailable the canvas is simply left blank and the
 * CSS gradient underneath it shows through.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;    // canvas size in device pixels
uniform float uDpr;    // device pixel ratio actually rendered at
uniform float uTime;   // seconds (frozen while paused)
uniform vec2  uMouse;  // -1..1, smoothed

// ---------- noise ----------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}

// ---------- glass surface (height field in CSS-pixel space) ----------
float glassHeight(vec2 px) {
  // Broad pebbles + fine grain, like "obscure" bathroom glass.
  float pebbles = fbm(px * 0.036);
  float grain   = vnoise(px * 0.17);
  float ripple  = vnoise(px * 0.011 + vec2(3.7, 1.3));
  return pebbles * 0.72 + grain * 0.10 + ripple * 0.18;
}
vec3 glassNormal(vec2 px) {
  float e = 1.25;
  float h  = glassHeight(px);
  float hx = glassHeight(px + vec2(e, 0.0));
  float hy = glassHeight(px + vec2(0.0, e));
  // Height exaggeration controls how "bumpy" the pane reads.
  vec2 g = vec2(hx - h, hy - h) * 9.0;
  return normalize(vec3(-g, 1.0));
}

// ---------- foliage ----------
// Leaf coverage/colour for one depth layer. uv is aspect-corrected (x spans
// 0..aspect, y spans 0..1). soft is the edge blur in cell units.
vec4 leafLayer(vec2 uv, float seed, float scale, float soft, float density,
               vec3 colA, vec3 colB, float t) {
  vec2 p = uv * scale;
  vec2 i = floor(p);
  vec3 col = vec3(0.0);
  float acc = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 g = i + vec2(float(dx), float(dy));
      float h = hash21(g + seed);
      if (h > density) continue;
      float h2 = hash21(g + seed + 1.37);
      float h3 = hash21(g + seed + 2.71);
      vec2 c = g + 0.5 + (vec2(h2, h3) - 0.5) * 0.85;
      // Wind: slow sway with a per-leaf phase, plus a faint gust.
      float gust = vnoise(vec2(t * 0.25, h * 7.0)) - 0.5;
      c += vec2(sin(t * 0.55 + h * 6.2832) * 0.07 + gust * 0.12,
                cos(t * 0.40 + h * 4.1) * 0.035);
      vec2 d = p - c;
      float ang = h2 * 6.2832 + sin(t * 0.45 + h * 9.0) * 0.12;
      float ca = cos(ang), sa = sin(ang);
      d = mat2(ca, -sa, sa, ca) * d;
      // Leaf SDF: elongated ellipse pinched toward one tip.
      float tip = smoothstep(-0.5, 0.5, d.y) * 0.35;
      float r = length(d * vec2(1.0 + tip, 0.52));
      float size = 0.34 + 0.30 * h3;
      float a = 1.0 - smoothstep(size - soft, size + soft, r);
      // Mid-rib shading so near leaves read as leaves, not discs.
      float rib = 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.06, abs(d.x)));
      vec3 lc = mix(colA, colB, h) * rib;
      col += lc * a * (1.0 - acc);
      acc += a * (1.0 - acc);
    }
  }
  return vec4(col, acc);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 auv = vec2(uv.x * aspect, uv.y);
  vec2 px = frag / uDpr; // CSS pixels, so the pebble size is resolution independent
  float t = uTime;

  vec3 n = glassNormal(px);

  // Light: warm, upper right, nudged by the pointer.
  vec2 lightPos = vec2(aspect * 0.82 + uMouse.x * 0.12, 0.88 + uMouse.y * 0.08);
  float dl = distance(auv, lightPos);
  float lightFall = exp(-dl * dl * 0.9);

  // ---- far background: milky daylight + soft bokeh ----
  vec3 milk    = vec3(0.905, 0.930, 0.890);
  vec3 warm    = vec3(1.000, 0.975, 0.880);
  vec3 shade   = vec3(0.760, 0.820, 0.740);
  vec3 col = mix(shade, milk, smoothstep(0.0, 0.9, uv.y + 0.25));
  col = mix(col, warm, lightFall * 0.85);
  // Big out-of-focus light blobs drifting behind everything.
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    vec2 bp = vec2(hash21(vec2(fk, 1.0)) * aspect, hash21(vec2(fk, 2.0)));
    bp += vec2(sin(t * 0.12 + fk), cos(t * 0.09 + fk * 2.0)) * 0.06;
    float bd = distance(auv, bp);
    col += vec3(1.0, 0.98, 0.90) * exp(-bd * bd * 18.0) * 0.10;
  }

  // ---- foliage layers, back to front ----
  // Each layer: depth (1 = far), cell scale, blur, density, colours.
  // Refraction offset grows with depth; the frost veil thickens with depth.
  const int LAYERS = 5;
  float depth[5];  depth[0] = 1.00; depth[1] = 0.74; depth[2] = 0.50; depth[3] = 0.28; depth[4] = 0.10;
  float scale[5];  scale[0] = 2.0;  scale[1] = 2.9;  scale[2] = 3.8;  scale[3] = 4.6;  scale[4] = 4.4;
  float soft[5];   soft[0]  = 0.58; soft[1]  = 0.40; soft[2]  = 0.24; soft[3]  = 0.11; soft[4] = 0.035;
  float dens[5];   dens[0]  = 0.78; dens[1]  = 0.64; dens[2]  = 0.50; dens[3]  = 0.32; dens[4] = 0.17;

  for (int k = 0; k < LAYERS; k++) {
    float d = depth[k];
    // Parallax refraction: far things get thrown around more by the pebbles.
    vec2 ruv = auv + n.xy * (0.004 + 0.06 * d);
    // Darker, bluer greens far away; brighter, yellower greens up close.
    vec3 cA = mix(vec3(0.30, 0.50, 0.34), vec3(0.16, 0.36, 0.22), d);
    vec3 cB = mix(vec3(0.58, 0.76, 0.42), vec3(0.34, 0.52, 0.30), d);
    // Leaves facing the light pick up some warmth.
    float lit = exp(-distance(ruv, lightPos) * 1.4);
    cA = mix(cA, vec3(0.72, 0.80, 0.46), lit * 0.35);
    cB = mix(cB, vec3(0.86, 0.90, 0.56), lit * 0.45);
    // Foliage lives mostly in the lower / right portion, thinning toward the
    // upper-left where the headline sits.
    float mask = smoothstep(1.15, 0.35, uv.y + (1.0 - uv.x / aspect) * 0.55 * (1.0 - d * 0.5));
    mask = mix(mask, 1.0, 0.25);
    vec4 L = leafLayer(ruv, 11.0 + float(k) * 7.0, scale[k], soft[k], dens[k], cA, cB, t);
    float a = L.a * mask;
    vec3 lc = L.a > 0.0 ? L.rgb / L.a : vec3(0.0);
    // Frost veil: light scattering inside the glass washes far layers out.
    lc = mix(lc, milk, 0.10 + 0.52 * d);
    col = mix(col, lc, a);
  }

  // ---- wire mesh embedded in the pane ----
  {
    float cell = 34.0;
    vec2 mp = px + n.xy * 2.0 + vec2(vnoise(px * 0.01), vnoise(px * 0.01 + 7.0)) * 2.0;
    vec2 gp = abs(fract(mp / cell + 0.5) - 0.5) * cell;
    float line = min(gp.x, gp.y);
    float wire = 1.0 - smoothstep(0.35, 1.5, line);
    vec3 wireCol = vec3(0.24, 0.29, 0.26);
    col = mix(col, wireCol, wire * 0.30);
  }

  // ---- the glass itself: grain, sheen, specular glints ----
  float grain = vnoise(px * 0.45);
  col *= 0.98 + 0.04 * grain;
  vec3 Ldir = normalize(vec3((lightPos - auv) * vec2(1.0, 1.0), 0.9));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(Ldir + V);
  float ndl = max(dot(n, Ldir), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 36.0);
  float sheen = pow(ndl, 3.0);
  col += vec3(1.0, 0.98, 0.92) * spec * (0.06 + 0.55 * lightFall);
  col += vec3(1.0, 0.99, 0.95) * sheen * 0.07 * (0.2 + lightFall);
  // Overall milkiness of the pane and a gentle vignette.
  col = mix(col, vec3(0.94, 0.955, 0.93), 0.10);
  float vig = smoothstep(1.6, 0.4, distance(uv, vec2(0.5)) * 1.3);
  col *= 0.94 + 0.06 * vig;

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function GlassHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pausedRef = useRef(false);
  const resumeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      (canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" }) as
        | WebGLRenderingContext
        | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return; // CSS fallback underneath shows through

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("GlassHero shader error:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("GlassHero link error:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // One triangle that covers the clip-space square.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uDpr = gl.getUniformLocation(prog, "uDpr");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyReduced = () => setReducedMotion(mql.matches);
    applyReduced();
    mql.addEventListener?.("change", applyReduced);

    let dpr = 1;
    const resize = () => {
      // Cap the pixel ratio: the shader is per-pixel heavy and 1.5x is plenty.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    let running = false;
    let visible = true;
    let hidden = document.visibilityState === "hidden";
    let last = performance.now();
    let time = 0;

    const draw = () => {
      resize();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uDpr, dpr);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const shouldRun = () => visible && !hidden && !pausedRef.current && !mql.matches;

    const frame = (now: number) => {
      raf = 0;
      if (!shouldRun()) {
        running = false;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      draw();
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || !shouldRun()) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    resumeRef.current = start;

    const onVis = () => {
      hidden = document.visibilityState === "hidden";
      start();
    };
    document.addEventListener("visibilitychange", onVis);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        start();
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      // Redraw a static frame on resize even when paused / reduced motion.
      if (!running) draw();
    });
    ro.observe(canvas);

    // Always paint at least one frame so paused / reduced-motion visitors
    // still get the glass.
    draw();
    start();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      running = false;
      resumeRef.current = () => {};
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onPointer);
      mql.removeEventListener?.("change", applyReduced);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (!next) resumeRef.current();
  };

  return (
    <>
      <canvas ref={canvasRef} className="glass-canvas" aria-hidden="true" />
      {!reducedMotion && (
        <button
          type="button"
          className="glass-pause"
          onClick={togglePause}
          aria-pressed={paused}
          aria-label={paused ? "Resume background motion" : "Pause background motion"}
          title={paused ? "Resume motion" : "Pause motion"}
        >
          {paused ? "▶" : "❚❚"}
          <span>{paused ? "Play" : "Pause"}</span>
        </button>
      )}
    </>
  );
}
