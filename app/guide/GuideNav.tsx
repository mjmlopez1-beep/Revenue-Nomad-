import Link from "next/link";
import { chapterHref, chapters, guide } from "./content/guide";

function Lock() {
  return (
    <span className="gd-toc-lock" aria-label="Opens with your email">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="2" y="5" width="8" height="6" rx="1.2" fill="currentColor" />
        <path d="M4 5V3.6a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </span>
  );
}

/**
 * Contents with lock state (artboard "Cover, findings & contents" of the Report Redesign). Full: the two featured
 * cards for Start here and the Answers, the ten numbered chapters with sand rules, then the Methodology line.
 * Compact: the chapter sidebar.
 */
export default function GuideNav({ current, unlocked, compact = false }: { current?: string; unlocked: boolean; compact?: boolean }) {
  const isLocked = (c: (typeof chapters)[number]) => !c.open && !unlocked;
  const row = (c: (typeof chapters)[number]) => (
    <li key={c.slug} className={c.slug === current ? "is-current" : undefined}>
      <Link href={chapterHref(c.slug)} aria-current={c.slug === current ? "page" : undefined}>
        <span className="gd-toc-n">{c.number === "—" ? "" : c.number}</span>
        <span className="gd-toc-t">
          {c.title}
          {!compact && c.dek && <span className="gd-toc-d">{c.dek}</span>}
        </span>
        {isLocked(c) && <Lock />}
      </Link>
    </li>
  );

  if (compact) {
    return (
      <nav className="gd-toc gd-toc--compact" aria-label="Guide contents">
        <ol>{chapters.map(row)}</ol>
      </nav>
    );
  }

  const featured = chapters.filter((c) => c.slug === "start-here" || c.slug === "answers");
  const numbered = chapters.filter((c) => c.number !== "—");
  const appendix = chapters.filter((c) => c.number === "—" && !featured.includes(c));
  return (
    <nav className="gd-toc" aria-label="Guide contents">
      <ol className="gd-toc-featured">
        {featured.map((c, i) => (
          <li key={c.slug}>
            <Link href={chapterHref(c.slug)} className={`gd-toc-card gd-toc-card--${i === 0 ? "ink" : "forest"}`}>
              <span className="gd-toc-card-k">{c.slug === "start-here" ? "Foreword" : "Quick answers"}</span>
              <span className="gd-toc-card-t">{c.title}</span>
              <span className="gd-toc-card-d">{c.dek}</span>
              {isLocked(c) && <Lock />}
            </Link>
          </li>
        ))}
      </ol>
      <ol className="gd-toc-list">{numbered.map(row)}</ol>
      <p className="gd-toc-appendix">
        {appendix.map((c) => (
          <Link key={c.slug} href={chapterHref(c.slug)}>
            {c.title}
            {isLocked(c) && <Lock />}
          </Link>
        ))}{" "}
        (appendix). {guide.edition}
      </p>
    </nav>
  );
}
