import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Arrow from "../../home/Arrow";
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

  return (
    <>
      <SiteHeader />
      <main id="main" className="gd gd-chapter">
        <div className="rn-wrap gd-chapter-grid">
          <aside className="gd-side">
            <Link className="gd-side-title" href={guide.path}>
              {guide.shortTitle}
            </Link>
            <GuideNav current={slug} unlocked={unlocked} compact />
          </aside>
          <article className="gd-article">
            <header className="gd-chead">
              <p className="rn-eyebrow">{meta.number !== "—" ? `Chapter ${meta.number}` : guide.shortTitle}</p>
              <h1 className="gd-ctitle">{meta.title}</h1>
              <p className="gd-dek">{meta.dek}</p>
              {content?.stats && <StatRow items={content.stats} />}
              {content && content.blocks.some((b) => b.t === "h2") && (
                <nav className="gd-jump" aria-label="In this chapter">
                  <span>Jump to</span>
                  {content.blocks
                    .filter((b): b is Extract<typeof b, { t: "h2" }> => b.t === "h2")
                    .map((b) => (
                      <a key={b.id ?? toId(b.text)} href={`#${b.id ?? toId(b.text)}`}>
                        {b.eyebrow ?? b.text}
                      </a>
                    ))}
                </nav>
              )}
            </header>

            {locked && <Gate returnTo={chapterHref(slug)} invalid={gate === "invalid"} />}
            {!locked && !content && (
              <p className="gd-p">This chapter is being prepared for the web. Read the others in the meantime.</p>
            )}
            {content && <GuideBlocks blocks={content.blocks} />}

            <nav className="gd-pager" aria-label="Chapter navigation">
              {prev ? (
                <Link href={chapterHref(prev.slug)} className="gd-pager-prev">
                  <span className="rn-eyebrow">Previous</span>
                  <span>{prev.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={chapterHref(next.slug)} className="gd-pager-next">
                  <span className="rn-eyebrow">Next</span>
                  <span>
                    {next.title}
                    <Arrow size={13} />
                  </span>
                </Link>
              ) : (
                <Link href={guide.path} className="gd-pager-next">
                  <span className="rn-eyebrow">Back to</span>
                  <span>Contents</span>
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
