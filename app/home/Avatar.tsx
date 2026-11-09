/**
 * Initials avatar for people who have no shipped photo (the role pages' sample profiles). The homepage
 * sections render the canvas's portraits instead; decision A5 (initials until approved photos) is
 * superseded there by the owner's request for the canvas images.
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
