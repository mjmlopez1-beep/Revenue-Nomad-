import type { Metadata } from "next";
import { guideFonts } from "../../guide/fonts";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import ClosingBand from "../../home/ClosingBand";
import SiteFooter from "../../home/SiteFooter";
import SiteHeader from "../../home/SiteHeader";
import { GUIDE_COOKIE } from "../../guide/unlock";
import { chapterHref, chapterMeta, chapters, guide } from "../../guide/content/guide";
import { loadChapter } from "../../guide/content";
import Gate from "../../guide/Gate";
import GuideBlocks, { StatRow, slug as toId } from "../../guide/GuideBlocks";
import GuideNav from "../../guide/GuideNav";
import "../../home/home.css";
import "../../guide/guide.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return chapters.map((c) => ({ chapter: c.slug }));
}

type Props = { params: Promise<{ chapter: string }>; searchParams: Promise<{ gate?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chapter } = await params;
  const m = chapterMeta(chapter);
  if (!m) return {};
  return {
    title: `${m.number !== "—" ? `Chapter ${m.number}: ` : ""}${m.title} | ${guide.shortTitle}`,
    description: m.dek,
    alternates: { canonical: `https://revenuenomad.com${chapterHref(m.slug)}` },
    robots: m.open ? undefined : { index: false, follow: true },
  };
}

function NextArrow() {
  return (
    <svg className="gd-next-arrow" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A chapter: dark opener with the numeral, title, dek and stat tiles, the Jump to bar, then sidebar and article (Report Redesign chapter boards). */
export default async function ChapterPage({ params, searchParams }: Props) {
  const { chapter: slug } = await params;
  const { gate } = await searchParams;
  const meta = chapterMeta(slug);
  if (!meta) notFound();
  const unlocked = Boolean((await cookies()).get(GUIDE_COOKIE));
  const idx = chapters.findIndex((c) => c.slug === slug);
  const prev = chapters[idx - 1];
  const next = chapters[idx + 1];
  const locked = !meta.open && !unlocked;
  const content = locked ? null : await loadChapter(slug);
  const numbered = meta.number !== "—";
  const jumps = content?.blocks.filter((b): b is Extract<typeof b, { t: "h2" }> => b.t === "h2") ?? [];

  return (
    <>
      <SiteHeader />
      <main id="main" className={`gd gd-chapter ${guideFonts}`}>
        <header className={`gd-chead${numbered ? "" : " gd-chead--front"}`}>
          <div className="rn-wrap">
            <div className="gd-chead-row">
              {numbered && (
                <span className="gd-cnum" aria-hidden="true">
                  {meta.number}
                </span>
              )}
              <div className="gd-chead-text">
                <p className="gd-eyebrow gd-eyebrow--leaf">{numbered ? `Chapter ${meta.number}` : guide.shortTitle}</p>
                <h1 className={`gd-ctitle${slug === "start-here" ? " gd-ctitle--serif" : ""}`}>{meta.title}</h1>
              </div>
            </div>
            <p className="gd-dek">{meta.dek}</p>
            {content?.stats && <StatRow items={content.stats} variant="dark" />}
          </div>
        </header>

        {jumps.length > 0 && (
          <nav className="gd-jump" aria-label="In this chapter">
            <div className="rn-wrap gd-jump-in">
              <span className="gd-jump-k">Jump to</span>
              {jumps.map((b) => (
                <a key={b.id ?? toId(b.text)} href={`#${b.id ?? toId(b.text)}`}>
                  {b.eyebrow ?? b.text}
                </a>
              ))}
            </div>
          </nav>
        )}

        <div className="rn-wrap gd-chapter-grid">
          <aside className="gd-side">
            <Link className="gd-side-title" href={guide.path}>
              {guide.shortTitle}
            </Link>
            <GuideNav current={slug} unlocked={unlocked} compact />
          </aside>
          <article className="gd-article">
            {locked && <Gate returnTo={chapterHref(slug)} invalid={gate === "invalid"} />}
            {!locked && !content && (
              <p className="gd-p">This chapter is being prepared for the web. Read the others in the meantime.</p>
            )}
            {content && <GuideBlocks blocks={content.blocks} />}

            <nav className="gd-pager" aria-label="Chapter navigation">
              {next ? (
                <Link href={chapterHref(next.slug)} className="gd-next">
                  <span className="gd-next-text">
                    <span className="gd-eyebrow">{next.number !== "—" ? `Next: Chapter ${next.number}` : "Next"}</span>
                    <span className="gd-next-t">{next.title}</span>
                  </span>
                  <NextArrow />
                </Link>
              ) : (
                <Link href={guide.path} className="gd-next">
                  <span className="gd-next-text">
                    <span className="gd-eyebrow">Back to</span>
                    <span className="gd-next-t">Contents</span>
                  </span>
                  <NextArrow />
                </Link>
              )}
              {prev && (
                <Link href={chapterHref(prev.slug)} className="gd-prev">
                  Previous: {prev.title}
                </Link>
              )}
            </nav>
          </article>
        </div>
        <ClosingBand />
      </main>
      <SiteFooter />
    </>
  );
}
