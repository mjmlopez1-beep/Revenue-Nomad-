import Link from "next/link";
import { chapterHref, chapters, guide } from "./content/guide";

/** Contents list with lock state, used by the landing page and the chapter sidebar. */
export default function GuideNav({ current, unlocked, compact = false }: { current?: string; unlocked: boolean; compact?: boolean }) {
  return (
    <nav className={compact ? "gd-toc gd-toc--compact" : "gd-toc"} aria-label="Guide contents">
      <ol>
        {chapters.map((c) => {
          const locked = !c.open && !unlocked;
          return (
            <li key={c.slug} className={c.slug === current ? "is-current" : ""} aria-current={c.slug === current ? "page" : undefined}>
              <Link href={chapterHref(c.slug)}>
                <span className="gd-toc-n">{c.number}</span>
                <span className="gd-toc-t">
                  {c.title}
                  {!compact && <span className="gd-toc-d">{c.dek}</span>}
                </span>
                {locked && (
                  <span className="gd-toc-lock" aria-label="Opens with your email">
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <rect x="2" y="5" width="8" height="6" rx="1.2" fill="currentColor" />
                      <path d="M4 5V3.6a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
      {!compact && <p className="gd-note">{guide.edition}</p>}
    </nav>
  );
}
