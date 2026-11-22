import type { Metadata } from "next";
import { signedCopy } from "@/lib/proposals/store";
import { MEMBER_CONSENT, MEMBER_CONSENT_VERSION, type SignedCopy } from "@/lib/proposals/types";
import { SignLegal, SignTop } from "../../sign/Sign";
import { EVENT_SAY, dayOf, stamp } from "../../sign/doc";
import { Parties, ProposalView, SealCard, memberState } from "../../sign/ProposalView";
import { ActivityNotice } from "../../sign/activity";
import { PrintButton } from "../Print";
import { DocCopyPage } from "../DocCopy";
import "../../sign/sign.css";
import "../../sign/clientview.css";

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
    c = await signedCopy(String(token ?? "").slice(0, 120), process.env.RN_PUBLIC_URL);
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
      <main className="sg-main cv-main">
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
          {c.signed.choice && (
            <p className="sg-p">
              Chose {c.signed.choice.summary}. Total: {c.signed.choice.total}.
            </p>
          )}
          <div className="sg-noprint">
            <PrintButton quiet={!!c.sealed} />
          </div>
        </section>

        {c.awaitingMember && (
          <section className="sg-card cv-wait" role="status">
            <span className="cv-wait-h">Signed by {c.signed.name} · waiting for {d.from.name} to countersign</span>
            <span className="cv-fine">The sealed copy comes by email to you both once they do.</span>
          </section>
        )}
        {c.sealed && <SealCard at={c.sealed.at} signers={[c.signed.name, ...(c.member ? [c.member.name] : [])]} events={c.sealed.events} pdf={c.sealed.pdf} check={c.sealed.check} track={String(token).slice(0, 120)} />}

        <ProposalView
          doc={d}
          choice={c.signed.choice ? { optionId: c.signed.choice.optionId, addOnIds: c.signed.choice.addOns.map((a) => a.id) } : null}
          sign={
            <div className="cv-accept">
              <h2 className="cv-h2">Signatures</h2>
              <Parties doc={d} client={{ state: "signed", name: c.signed.name, title: c.signer.title, at: c.signed.at }} member={{ state: memberState(c.memberMode, c.member, true), sig: c.member }} />
            </div>
          }
        />

        <section className="sg-card sg-signed" aria-labelledby="sg-sigh">
          <h2 className="sg-h2" id="sg-sigh">
            {c.member ? "Signatures" : "Signature"}
          </h2>
          <div className="sg-sig sg-sig-done">
            <span className="sg-sig-name">{c.signed.name}</span>
            <span className="sg-sig-line">
              {c.signed.name}
              {c.signer.title ? `, ${c.signer.title}` : ""} · {stamp(c.signed.at)}
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
          {c.member && (
            <>
              <div className="sg-sig sg-sig-done">
                {c.member.kind === "drawn" && c.member.img ? <img src={c.member.img} alt={`${c.member.name}'s signature`} className="cv-sigimg" /> : <span className="sg-sig-name">{c.member.typed ?? c.member.name}</span>}
                <span className="sg-sig-line">
                  {c.member.name}
                  {c.member.title ? `, ${c.member.title}` : ""} · {stamp(c.member.at)}
                </span>
              </div>
              <dl className="sg-facts">
                <div>
                  <dt>How</dt>
                  <dd>
                    {c.member.how === "saved_at_send"
                      ? "Their saved signature, applied when they sent it"
                      : c.member.how === "saved"
                        ? "Their saved signature, applied as a countersignature"
                        : c.member.how === "drawn"
                          ? "Drawn, as a countersignature"
                          : "Typed, as a countersignature"}
                    , signed in to Merlin as the sender
                  </dd>
                </div>
                <div>
                  <dt>Consent to sign electronically</dt>
                  <dd>
                    {MEMBER_CONSENT} <span className="sg-muted">(version {MEMBER_CONSENT_VERSION})</span>
                  </dd>
                </div>
              </dl>
            </>
          )}
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
          {/* Nothing is read here; only a download of the signed PDF is told to the sender (lib/close). */}
          {c.sealed && <ActivityNotice sender={d.from.name} signed />}
          <SignLegal />
        </footer>
      </main>
    </div>
  );
}
