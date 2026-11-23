"use client";

import { useEffect, useRef } from "react";

/** A box to draw a signature in with a finger or a mouse. Gives a PNG, or null when empty. Also the member's own signature (app/post/MySignature.tsx). */
export function DrawPad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const any = useRef(false);
  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#0a1a13";
  }, []);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  return (
    <div className="ds-pad">
      <canvas
        ref={ref}
        className="ds-pad-c"
        aria-label="Draw your signature"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drawing.current = true;
          const g = ref.current!.getContext("2d")!;
          const [x, y] = at(e);
          g.beginPath();
          g.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const g = ref.current!.getContext("2d")!;
          const [x, y] = at(e);
          g.lineTo(x, y);
          g.stroke();
          any.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (any.current) onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <span className="ds-pad-line" aria-hidden />
      <button
        type="button"
        className="sg-link ds-pad-clear"
        onClick={() => {
          const c = ref.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          any.current = false;
          onChange(null);
        }}
      >
        Clear
      </button>
    </div>
  );
}
