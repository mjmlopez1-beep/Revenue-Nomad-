/**
 * The Merlin lockup, drawn inline: the pine mark and the ink wordmark on light surfaces, all white
 * on pine. Vector, so it is sharp at every size and costs no request; the same paths make the PNGs
 * in public/brand (scripts/make-brand-art.mts), which emails and other sites use.
 *
 * `height` is the CSS height; the width follows the lockup's 811 by 240 shape. On a phone keep it
 * at least 96px wide (height 28 or more). No hooks, so it renders on the server and in the browser.
 */
import { LOGO_BOX, LOGO_MARK, LOGO_WORD } from "./logoPaths";

const PINE = "#073F2F";
const INK = "#0A1A13";

export function Logo({ height = 30, tone = "color", className, label = "Merlin by Revenue Nomad" }: { height?: number; tone?: "color" | "white"; className?: string; label?: string | null }) {
  const width = Math.round((height * LOGO_BOX.w) / LOGO_BOX.h);
  const white = tone === "white";
  return (
    <svg
      className={className ? `logo-svg ${className}` : "logo-svg"}
      viewBox={`0 0 ${LOGO_BOX.w} ${LOGO_BOX.h}`}
      width={width}
      height={height}
      style={{ width, height }}
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path fill={white ? "#FFFFFF" : PINE} fillRule="evenodd" d={LOGO_MARK} />
      <path fill={white ? "#FFFFFF" : INK} fillRule="evenodd" d={LOGO_WORD} />
    </svg>
  );
}
