/**
 * Initials avatar. People render as initials until approved photos exist (design decision A5).
 * Decorative: the name is always printed beside it, so the SVG is hidden from assistive tech.
 */
export default function Avatar({ name, size = 56, tone = "forest" }: { name: string; size?: number; tone?: "forest" | "leaf" | "night" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className={`rn-avatar rn-avatar--${tone}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initials}
    </span>
  );
}
