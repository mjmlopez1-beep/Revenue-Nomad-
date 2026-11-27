import { ILLUSTRATIONS, type IllustrationId, type IllustrationTheme } from "@/lib/brand/manifest";

interface Props {
  /** Illustration id, for example "scene-terraces" or "spot-door". */
  name: IllustrationId;
  /** "dark" for green-black sections, "light" for cream sections. */
  theme?: IllustrationTheme;
  /** Scenes only: show the waypoint callouts (You, Mutual contact, Introduction). */
  labeled?: boolean;
  /** Pass an empty string when the illustration is decorative. */
  alt?: string;
  className?: string;
  priority?: boolean;
}

/** One illustration from the Merlin brand library (public/brand). */
export default function Illustration({ name, theme = "dark", labeled = false, alt, className, priority = false }: Props) {
  const meta = ILLUSTRATIONS.find((i) => i.id === name);
  if (!meta) return null;
  const file = labeled && meta.labeled ? `${name}-labeled` : name;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/${theme}/${file}.svg`}
      alt={alt ?? meta.title}
      width={meta.width}
      height={meta.height}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
