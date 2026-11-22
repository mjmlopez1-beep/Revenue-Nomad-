import type { Metadata } from "next";
import { signedCopy } from "@/lib/proposals/store";
import type { SignedCopy } from "@/lib/proposals/types";
import { SignLegal, SignTop } from "../../sign/Sign";
import { DocBlocks, EVENT_SAY, dayOf, stamp } from "../../sign/doc";
import { PrintButton } from "../Print";
import { DocCopyPage } from "../DocCopy";
import "../../sign/sign.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Signed copy · Revenue Nomad", robots: { index: false, follow: false }, openGraph: null, twitter: null };

/**
 * The signed copy, /signed/<send id>.<HMAC> (lib/proposals/store.ts copyLink): the proposal as it
 * was signed, the signature, and the audit trail with the document's SHA-256, checked against the
 * content again as the page is drawn. Server-rendered and print-friendly: Print or save as PDF
 * from the browser.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // A document to sign that everyone signed (lib/documents): its own page, with the PDF to download.
  if (/^dc_/.test(String(token ?? ""))) return <DocCopyPage token={String(token).slice(0, 120)} />;
  let c: SignedCopy | null = null;
  try {
    c = await signedCopy(String(token ?? "").slice(0, 120));
  } catch (e) {
    console.error("signed copy could not be read", e);
  }
  if (!c)
    return (
      <div className="sg">
        <SignTop />
        <main className="sg-main">
          <div className="sg-card sg-state">
            <h1 className="sg-h">This link doesn&#39;t work</h1>
            <p className="sg-p">Check that the whole link was copied, or ask the sender for the signed copy.</p>
          </div>
          <SignLegal />
        </main>
      </div>
    );
  const d = c.doc;
  const ok = c.hash === c.hashNow && c.signed.hash === c.hash;
  return (
    <div className="sg sg-copy">
      <SignTop />
      <main className="sg-main">
        <section className="sg-card sg-head">
          <p className="sg-from">Signed copy · Proposal from</p>
          <p className="sg-sender">{d.from.name}</p>
          {d.from.title && <p className="sg-sender-t">{d.from.title}</p>}
          <h1 className="sg-title">{d.title}</h1>
          <dl className="sg-meta">
            <div>
              <dt>Prepared for</dt>
              <dd>
                {d.to.name}
                {d.to.title ? `, ${d.to.title}` : ""}
                {d.company ? ` · ${d.company}` : ""}
              </dd>
            </div>
            <div>
              <dt>Signed</dt>
              <dd>
                {dayOf(c.signed.at)} · Version {d.version}
              </dd>
            </div>
          </dl>
          <div className="sg-noprint">
            <PrintButton />
          </div>
        </section>

        <article className="sg-card sg-doc" aria-label="The proposal as signed">
          <DocBlocks blocks={d.blocks} />
        </article>

        <section className="sg-card sg-signed" aria-labelledby="sg-sigh">
          <h2 className="sg-h2" id="sg-sigh">
            Signature
          </h2>
          <div className="sg-sig sg-sig-done">
            <span className="sg-sig-name">{c.signed.name}</span>
            <span className="sg-sig-line">
              {c.signed.name}
              {d.to.title ? `, ${d.to.title}` : ""} · {stamp(c.signed.at)}
            </span>
          </div>
          <dl className="sg-facts">
            <div>
              <dt>Email confirmed</dt>
              <dd>{c.signed.email}</dd>
            </div>
            <div>
              <dt>IP address</dt>
              <dd className="sg-mono">{c.signed.ip || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Browser</dt>
              <dd>{c.signed.ua || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Consent to sign electronically</dt>
              <dd>
                {c.signed.consent} <span className="sg-muted">(version {c.signed.consentVersion})</span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="sg-card sg-audit" aria-labelledby="sg-audh">
          <h2 className="sg-h2" id="sg-audh">
            Audit trail
          </h2>
          <p className={`sg-check${ok ? "" : " sg-check-bad"}`}>
            {ok ? "The document above matches the one that was signed." : "The document above does not match the fingerprint that was signed."}
          </p>
          <p className="sg-help">
            Document fingerprint (SHA-256): <span className="sg-hash">{c.hash}</span>
          </p>
          <ol className="sg-trail">
            {c.events.map((e, i) => (
              <li key={i}>
                <span className="sg-trail-at">{stamp(e.at)}</span>
                <span className="sg-trail-what">
                  {EVENT_SAY[e.kind] ?? e.kind}
                  {e.note ? `: ${e.note}` : ""}
                </span>
                {(e.ip || e.ua) && (
                  <span className="sg-trail-who">
                    {e.ip ? <span className="sg-mono">{e.ip}</span> : null}
                    {e.ip && e.ua ? " · " : ""}
                    {e.ua}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="sg-fine">Envelope {c.sendId}. Times are UTC.</p>
        </section>

        <footer className="sg-foot">
          <p>Sent by {d.from.name} with Merlin, from Revenue Nomad.</p>
          <SignLegal />
        </footer>
      </main>
    </div>
  );
}
