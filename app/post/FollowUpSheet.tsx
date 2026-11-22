"use client";

/**
 * The drafted follow-up (lib/pipelineNote.ts): a short note for where the deal is, in the member's
 * voice. Merlin drafts, the member sends: Open in Gmail (a compose link, To left empty), another
 * mail app, or Copy. Using any of them, or Mark as sent, counts the follow-up in their pipeline
 * (the "pipeline.followed" action), and the next nudge comes 3 business days later.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Me } from "@/lib/tableTypes";
import type { FollowUpRec, PipelineRec } from "@/lib/pipeline";
import { draftFollowUp } from "@/lib/pipelineNote";
import { gmailLink, mailtoLink } from "@/lib/moveNote";
import { firstOf } from "@/lib/partners";
import { IconExternal, useToast } from "../ui/shared";
import { copyText } from "./hooks";
import { Sheet } from "./ui";
import { pipelineAct } from "./pipelineStore";
import "./movenote.css";

export function FollowUpSheet({ f, rec, me, onClose }: { f: FollowUpRec | null; rec: PipelineRec; me: Me; onClose: () => void }) {
  const toast = useToast();
  const company = rec.name ?? "the company";
  const fn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  const draft = useMemo(
    () =>
      draftFollowUp(
        { to: rec.to.name, company, stage: rec.stage, channel: rec.channel, days: f?.days ?? 0, follow: rec.follow, me: { first: firstOf(me.name), name: me.name, fn } },
        me.voice ?? null,
      ),
    [rec, f, me, company, fn],
  );
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [done, setDone] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [body]);
  const used = async (close: boolean) => {
    if (!done) {
      setDone(true);
      const r = await pipelineAct({ type: "pipeline.followed", id: rec.id });
      if (close || !r.ok) toast(r.message, !r.ok);
    }
    if (close) onClose();
  };
  const copy = async () => {
    const ok = await copyText(body);
    toast(ok ? "Follow-up copied. Paste it where you wrote to them." : "That didn't copy. Select the note and copy it yourself.", !ok);
    if (ok) void used(false);
  };
  return (
    <Sheet
      title={`A follow-up to ${rec.to.name ? firstOf(rec.to.name) : rec.to.label}`}
      onClose={onClose}
      dialog
      className="mn-sheet"
      footer={
        <div className="mn-foot">
          <div className="mn-acts">
            <a className="btn btn-pine mn-go" href={gmailLink(null, subject, body)} target="_blank" rel="noreferrer" onClick={() => void used(false)}>
              <IconExternal size={14} /> Open in Gmail
            </a>
            <button type="button" className="btn mn-go" onClick={() => void copy()}>
              Copy
            </button>
            <a className="mn-other" href={mailtoLink(null, subject, body)} onClick={() => void used(false)}>
              Another mail app
            </a>
          </div>
          <div className="mn-last">
            <p className="mn-promise">
              <span>
                <b>Merlin drafts, you send.</b> Merlin never sends for you.
              </span>
            </p>
            <button type="button" className={`btn${done ? " btn-pine" : ""} mn-done`} onClick={() => void used(true)}>
              Mark as sent
            </button>
          </div>
        </div>
      }
    >
      <div className="mn">
        <div className="mn-why">
          <p className="mn-now">
            <b>{company}.</b> {f ? f.line : rec.next ?? ""}
          </p>
        </div>
        <div className="mn-fields">
          <div className="mn-field">
            <label className="mn-k" htmlFor="fu-subject">
              Subject
            </label>
            <input id="fu-subject" className="mn-subject" value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <label className="sr-only" htmlFor="fu-body">
            Your follow-up
          </label>
          <textarea ref={box} id="fu-body" className="mn-body" value={body} rows={6} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}
