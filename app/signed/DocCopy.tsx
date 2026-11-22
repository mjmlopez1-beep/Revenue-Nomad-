/**
 * A finished document's page, /signed/<document id>.<HMAC> (lib/documents/store.ts docCopyLink):
 * who signed and when, the fingerprints of the uploaded file, the signed pages and the final file,
 * the audit trail, and the final PDF to download. Server-rendered. Both sides got the link.
 */
import { docCopy } from "@/lib/documents/store";
import type { DocCopy } from "@/lib/documents/types";
import { SignLegal, SignTop } from "../sign/Sign";
import { stamp, dayOf } from "../sign/doc";
import { SealCard } from "../sign/ProposalView";
import { ActivityNotice, TrackedDownload } from "../sign/activity";

const SAY: Record<string, string> = {
  uploaded: "Uploaded",
  sent: "Sent for signature",
  notified: "Link emailed to the signer",
  viewed: "Opened by the signer",
  code_sent: "Code sent to the signer's email",
  code_failed: "A wrong code was typed",
  code_verified: "Email confirmed with the code",
  signed: "Signed",
  declined: "Declined",
  voided: "Voided",
  completed: "Complete: every signer signed",
  copy_sent: "Final PDF emailed",
  expired_open: "Opened after the link expired",
};

export async function DocCopyPage({ token }: { token: string }) {
  let c: DocCopy | null = null;
  try {
    c = await docCopy(token, process.env.RN_PUBLIC_URL);
  } catch (e) {
    console.error("document copy could not be read", e);
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
  return (
    <div className="sg sg-copy">
      <SignTop />
      <main className="sg-main">
        <section className="sg-card sg-head">
          <p className="sg-from">Signed document · from</p>
          <p className="sg-sender">{c.from.name}</p>
          {c.from.title && <p className="sg-sender-t">{c.from.title}</p>}
          <h1 className="sg-title">{c.title}</h1>
          <dl className="sg-meta">
            <div>
              <dt>Complete</dt>
              <dd>{dayOf(c.completedAt)}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{c.fileName}</dd>
            </div>
          </dl>
          <TrackedDownload token={token} className="btn btn-primary btn-lg sg-wide" href={c.download}>
            Download the signed PDF
          </TrackedDownload>
        </section>
        {c.sealed && <SealCard at={c.sealed.at} signers={c.signers.map((x) => x.name)} events={c.events.filter((e) => Date.parse(e.at) <= Date.parse(c!.sealed!.at)).length} pdf={null} check={c.sealed.check} />}
        <section className="sg-card sg-signed" aria-labelledby="dc-sg">
          <h2 className="sg-h2" id="dc-sg">
            Who signed
          </h2>
          <ol className="sg-trail">
            {c.signers.map((x) => (
              <li key={x.email}>
                <span className="sg-trail-at">{stamp(x.signedAt)}</span>
                <span className="sg-trail-what">
                  {x.name}
                  {x.title ? `, ${x.title}` : ""} ({x.email}), {x.method === "drawn" ? "drew their signature" : "typed their name"}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="sg-card sg-audit" aria-labelledby="dc-au">
          <h2 className="sg-h2" id="dc-au">
            Fingerprints and audit trail
          </h2>
          <p className="sg-help">
            The file as uploaded (SHA-256): <span className="sg-hash">{c.sha256}</span>
          </p>
          <p className="sg-help">
            The signed pages, before the audit trail page (SHA-256): <span className="sg-hash">{c.signedPagesSha256}</span>
          </p>
          <p className="sg-help">
            The final file you download (SHA-256): <span className="sg-hash">{c.finalSha256}</span>
          </p>
          <ol className="sg-trail">
            {c.events.map((e, i) => (
              <li key={i}>
                <span className="sg-trail-at">{stamp(e.at)}</span>
                <span className="sg-trail-what">
                  {SAY[e.kind] ?? e.kind}
                  {e.who ? ` (${e.who})` : ""}
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
          <p className="sg-fine">Document {c.id}. Times are UTC.</p>
        </section>
        <footer className="sg-foot">
          <p>Sent by {c.from.name} with Merlin, from Revenue Nomad.</p>
          <ActivityNotice sender={c.from.name} signed />
          <SignLegal />
        </footer>
      </main>
    </div>
  );
}
