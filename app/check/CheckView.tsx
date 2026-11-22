"use client";

/**
 * The page anyone uses to check a copy of a sealed PDF (app/check/page.tsx). One file at a time:
 * picked or dropped, sent to /api/check, the answer shown. Nothing is kept, here or on the server.
 */
import { useRef, useState } from "react";
import { SignLegal, SignTop } from "../sign/Sign";
import { stamp } from "../sign/doc";
import "../sign/sign.css";
import "./check.css";

type Answer = { result: "match"; sealedAt: string; signers: { name: string; at: string }[] } | { result: "changed" } | { result: "unknown" };

export function CheckView() {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const check = async (f: File | undefined | null) => {
    if (!f) return;
    setFile(f.name);
    setAnswer(null);
    setErr(null);
    if (f.size > 60 * 1024 * 1024) return setErr("That file is bigger than any PDF Merlin seals.");
    setBusy(true);
    try {
      const r = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/pdf" }, body: await f.arrayBuffer() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "That didn't go through. Try again.");
      else setAnswer(j as Answer);
    } catch {
      setErr("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="sg">
      <SignTop />
      <main className="sg-main ck-main">
        <section className="sg-card ck-card" aria-labelledby="ck-h">
          <h1 className="sg-h" id="ck-h">
            Check a copy
          </h1>
          <p className="sg-p">Drop a PDF signed with Merlin to see whether it matches what was signed. Any change to a sealed file, even one character, shows here.</p>
          <label
            className="ck-drop"
            data-over={over}
            htmlFor="ck-file"
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void check(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="ck-drop-h">{busy ? "Checking" : "Drop the PDF here"}</span>
            <span className="ck-drop-s">or choose it from your device</span>
            <input ref={input} id="ck-file" className="ck-input" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => void check(e.target.files?.[0])} />
          </label>
          <p className="sg-fine">The file is checked in memory on Merlin&#39;s server and never kept. Only a fingerprint of it (SHA-256) is compared.</p>
          {err && (
            <p className="sg-err" role="alert">
              {err}
            </p>
          )}
          {answer && (
            <div className="ck-answer" data-result={answer.result} role="status">
              {answer.result === "match" ? (
                <>
                  <span className="ck-answer-h">This copy matches what was signed</span>
                  <span className="ck-answer-p">{file ? `${file} is` : "It's"} the file Merlin sealed {stamp(answer.sealedAt)}.</span>
                  <ul className="ck-who">
                    {answer.signers.map((x, i) => (
                      <li key={i}>
                        Signed by <strong>{x.name}</strong>, {stamp(x.at)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : answer.result === "changed" ? (
                <>
                  <span className="ck-answer-h">This copy was changed after it was sealed</span>
                  <span className="ck-answer-p">It carries a Merlin seal, but the file isn&#39;t the one that was signed. Ask the person who sent it for the original, or for the signed copy&#39;s link.</span>
                </>
              ) : (
                <>
                  <span className="ck-answer-h">No sealed record matches this file</span>
                  <span className="ck-answer-p">Merlin didn&#39;t seal this exact file. It may have been changed, saved again or printed to a new PDF, or it was signed somewhere else.</span>
                </>
              )}
            </div>
          )}
        </section>
        <footer className="sg-foot">
          <p>Merlin, from Revenue Nomad, seals every PDF signed through it: a SHA-256 of the file, signed with Merlin&#39;s key and printed on its audit trail page.</p>
          <SignLegal />
        </footer>
      </main>
    </div>
  );
}
