"use client";

/**
 * The connect moment: what Merlin found, right after a member connects Google and the first read
 * finishes. While the read runs it says which part it is on (the server's own stage, never a
 * made-up percentage or time). Then the result: "We found N companies where you know someone. W
 * are warm paths into companies likely to hire a fractional RevOps leader.", up to six of them,
 * and one next button to those W. It opens by itself once (NetworkView.first.seen), and again from
 * Your network's "What Merlin found".
 *
 * Every number is the member's own and is the length of the list it points at: N is Your network's
 * companies, W its warm paths (NetworkView.warm, scored live with Crystal Ball's likelihood, not
 * only today's day), the clients, introducers and people its other parts; the time is only printed
 * when the server measured it. A small or empty network says so plainly.
 */
import { useMemo } from "react";
import { CompanyLogo, IconCheck, IconChevron, IconLock } from "../../ui/shared";
import { Prop } from "../../ui/fractions/lazy";
import { tookWords, type NetCompanyView, type NetworkView, type SyncStage } from "@/lib/google/types";
import { namedFn, type CoInfo } from "../model";
import { plural } from "../hooks";
import { WarmthChip } from "./parts";
import { bestPerson, clientRows, warmRows } from "./model";

const STEPS: { stage: SyncStage; text: string }[] = [
  { stage: "calendar", text: "Reading who you met with, and when, from your calendar" },
  { stage: "contacts", text: "Reading names, companies and titles from your contacts" },
  { stage: "gmail", text: "Reading who you email with, from the From, To and Date lines" },
  { stage: "matching", text: "Matching them to the companies on Merlin" },
];

/** While the first read runs: the part it is on, as the server reports it. No percentage and no countdown. */
export function Mapping({ view }: { view: NetworkView }) {
  const steps = STEPS.filter((s) => (s.stage === "gmail" ? !!view.gmail : s.stage === "calendar" ? view.google?.calendar !== false : s.stage === "contacts" ? view.google?.contacts !== false : true));
  const at = steps.findIndex((s) => s.stage === view.stage);
  return (
    <div className="nf nf-mapping" role="status" aria-live="polite">
      <span className="nf-status">
        <IconCheck size={14} /> Google connected · read-only
      </span>
      <div className="nf-head">
        <div className="nf-head-t">
          <h1 className="nf-h">Mapping who you know</h1>
          <p className="nf-lead">Merlin is reading your Google account now. The result shows here as soon as it is done. You can leave this page: it keeps going.</p>
        </div>
        <Prop name="camp" height={64} className="nf-art" />
      </div>
      <ol className="nf-steps">
        {steps.map((s, k) => {
          const state = at < 0 ? "next" : k < at ? "done" : k === at ? "now" : "next";
          return (
            <li key={s.stage} className={`nf-step nf-step-${state}`} aria-current={state === "now" ? "step" : undefined}>
              <span className="nf-step-m" aria-hidden>
                {state === "done" ? <IconCheck size={12} /> : state === "now" ? <span className="nf-spin" /> : null}
              </span>
              <span>
                {s.text}
                <span className="sr-only">{state === "done" ? ", done" : state === "now" ? ", in progress" : ", not started"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="nf-fine">
        <IconLock size={12} /> Read-only. Merlin never reads a meeting title, a note or an email, and only you see the result.
      </p>
    </div>
  );
}

/** The first read didn't go through: say so, and offer it again. Nothing was found yet, so no number is shown. */
export function ReadFailed({ busy, onRetry, onStay }: { busy: boolean; onRetry: () => void; onStay: () => void }) {
  return (
    <div className="nf" role="status">
      <span className="nf-status nf-status-quiet">Google connected · read-only · not read yet</span>
      <h1 className="nf-h">We couldn&apos;t read your Google account yet</h1>
      <p className="nf-lead">Google is connected, but the first read didn&apos;t finish, so there is nothing to show. Nothing was lost. Merlin also tries again by itself once a day.</p>
      <div className="nf-cta">
        <button type="button" className="btn btn-pine btn-lg" aria-busy={busy} disabled={busy} onClick={onRetry}>
          {busy ? "Reading" : "Read it again now"}
        </button>
        <button type="button" className="nf-link" onClick={onStay}>
          Open Your network
        </button>
      </div>
    </div>
  );
}

const personLine = (c: NetCompanyView) => {
  const p = bestPerson(c);
  if (!p) return "Someone you know";
  return [p.name ?? "Someone you know", p.title].filter(Boolean).join(", ");
};

/**
 * The result: how many companies the member knows someone at, then what to do first. W is the
 * number of warm paths (NetworkView.warm, the list Your network opens on), so the button leads to
 * exactly that many rows; clients and people who can introduce them come next. A small or empty
 * network says so plainly, with the next step.
 */
export function Found({
  view,
  infos,
  fn,
  people,
  again,
  onWarm,
  onStay,
  onClients,
  onProfile,
  onAdd,
}: {
  view: NetworkView;
  infos: CoInfo[];
  /** The member's function, for "a fractional RevOps leader". */
  fn: string | null;
  /** The people Your network lists (its Everyone part): the same number it shows. */
  people: number;
  /** Opened again from Your network (not the one time after connecting). */
  again: boolean;
  /** Your network, at its warm paths. */
  onWarm: () => void;
  onStay: () => void;
  /** Your network, at Your clients. */
  onClients: () => void;
  onProfile: () => void;
  onAdd: () => void;
}) {
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  const n = view.companies.length;
  const warm = warmRows(view);
  const w = warm.length;
  const clients = clientRows(view).length;
  const intros = view.intros.length;
  const g = view.google;
  const took = !again && view.first?.ms != null ? tookWords(view.first.ms) : null;
  const who = namedFn(view.fn ?? fn);
  const leader = who ? `a fractional ${who} leader` : "a fractional leader like you";
  // The six on the page: the warm paths, best first, then the warmest relationships of the rest.
  const inWarm = new Set(warm.map((c) => c.id));
  const six = [...warm, ...view.companies.filter((c) => !inWarm.has(c.id) && !c.set && !c.client)].slice(0, 6);
  const mixed = six.some((c) => inWarm.has(c.id)) && six.some((c) => !inWarm.has(c.id));
  const aside = view.companies.filter((c) => c.set?.by === "merlin").length;

  return (
    <div className="nf nf-found">
      <span className="nf-status">
        <IconCheck size={14} /> Google connected · read-only
        {took ? ` · mapped in ${took}` : ""}
      </span>
      {n > 0 ? (
        <>
          <h1 className="nf-h" data-n={n}>
            We found <span className="num">{n}</span> {n === 1 ? "company" : "companies"} where you know someone.
          </h1>
          {w > 0 ? (
            <p className="nf-2" data-m={w}>
              <span className="num">{w}</span> {w === 1 ? "is a warm path into a company" : "are warm paths into companies"} likely to hire {leader}.
            </p>
          ) : (
            <p className="nf-2 nf-2-quiet" data-m={0}>
              {who
                ? `None of them fits your profile or shows a sign of hiring ${leader} yet. Merlin reads again every day.`
                : "Tell Merlin your function and it shows which of them are likely to hire you."}
            </p>
          )}
          <ul className="nf-six" aria-label={six.length === n ? "The companies where you know someone" : `${six.length} of the companies where you know someone`}>
            {six.map((c) => {
              const i = byId.get(c.id);
              return (
                <li key={c.id}>
                  <CompanyLogo name={c.name} domain={i?.c.iconDomain ?? i?.domain ?? c.site} size="lg" />
                  <span className="nf-six-t">
                    <span className="nf-six-n">{c.name}</span>
                    <span className="nf-six-p">
                      {personLine(c)}
                      {mixed && inWarm.has(c.id) ? " · warm path" : ""}
                    </span>
                  </span>
                  <WarmthChip w={c.warmth} />
                </li>
              );
            })}
          </ul>
          <div className="nf-cta">
            {w > 0 ? (
              <button type="button" className="btn btn-pine btn-lg" onClick={onWarm}>
                {w === 1 ? "See your warm path" : `See your ${w} warm paths`} <IconChevron dir="right" />
              </button>
            ) : (
              <button type="button" className="btn btn-pine btn-lg" onClick={who ? onStay : onProfile}>
                {who ? "Open Your network" : "Tell Merlin your function"} <IconChevron dir="right" />
              </button>
            )}
            {w > 0 || !who ? (
              <button type="button" className="nf-link" onClick={onStay}>
                Open Your network
              </button>
            ) : null}
            <span className="nf-sp" />
            <span className="nf-private">
              <IconLock size={12} /> Only you see this. {n === 1 ? "It is" : n === 2 ? "Both are" : `All ${n} are`} now named for you, free.
            </span>
          </div>
        </>
      ) : (
        <>
          <h1 className="nf-h" data-n={0}>
            We didn&apos;t find anyone at a company on Merlin yet.
          </h1>
          <p className="nf-lead">
            Merlin read the calendar and contacts of {g?.email || "your Google account"} and matched the people in them to the companies on Merlin, by work email address and company name. None matched
            {view.stats.unmatched > 0 ? `. ${plural(view.stats.unmatched, "person", "people")} you know ${view.stats.unmatched === 1 ? "is" : "are"} at companies that aren't on Merlin yet` : ""}.
          </p>
          <ul className="nf-todo">
            <li>
              <b>Add a company you&apos;ve worked with.</b> Once it is on Merlin, the people you know there show up on the next read, and what you add earns credits.
            </li>
            <li>
              <b>Is this the Google account you work from?</b> If your meetings are on another one, disconnect on Your network and connect that one.
            </li>
            <li>
              <b>Or leave it.</b> Merlin reads again once a day, and a match shows up here as soon as there is one.
            </li>
          </ul>
          <div className="nf-cta">
            <button type="button" className="btn btn-pine btn-lg" onClick={onAdd}>
              Add a company you know <IconChevron dir="right" />
            </button>
            <button type="button" className="nf-link" onClick={onStay}>
              Open Your network
            </button>
            <span className="nf-sp" />
            <span className="nf-private">
              <IconLock size={12} /> Only you see this.
            </span>
          </div>
        </>
      )}
      <div className="nf-also">
        <div>
          <span className="nf-also-n num">{clients}</span>
          <span className="nf-also-l">
            {clients === 1 ? "client your calendar shows" : "clients your calendar shows"}
            {clients > 0 && (
              <>
                .{" "}
                <button type="button" className="nf-link nf-link-sm" onClick={onClients}>
                  Confirm and fill in
                </button>
              </>
            )}
          </span>
        </div>
        <div>
          <span className="nf-also-n num">{intros}</span>
          <span className="nf-also-l">{intros === 1 ? "person who can introduce you" : "people who can introduce you"}</span>
        </div>
        <div>
          <span className="nf-also-n num">{people}</span>
          <span className="nf-also-l">{people === 1 ? "person you know, searchable" : "people you know, searchable"}</span>
        </div>
      </div>
      <ul className="nf-next" aria-label="What happens from here">
        {aside > 0 && <li>{plural(aside, "company", "companies")} set aside as selling to you, recruiting or investing, each with why. Undo on Your network</li>}
        <li>Nothing goes on Merlin unless you add it. 0 meeting titles, notes or emails read</li>
        <li>Read again once a day. Still read-only</li>
      </ul>
    </div>
  );
}
