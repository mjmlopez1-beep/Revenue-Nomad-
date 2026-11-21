"use client";

/**
 * The connect moment: what Merlin found, right after a member connects Google and the first read
 * finishes. While the read runs it says which part it is on (the server's own stage, never a
 * made-up percentage or time). Then the result: "We found N companies where you know someone. M of
 * them are likely to hire a fractional RevOps leader soon.", up to six of them, and one next
 * button. It opens by itself once (NetworkView.first.seen), and again from Your network's first
 * number.
 *
 * Every number is the member's own and comes from the pages it points at: N is Your network's
 * list, M is how many of those are in their Crystal Ball's day (foundNumbers), and the time is
 * only printed when the server measured it. A small or empty network says so plainly.
 */
import { useEffect, useMemo, useState } from "react";
import { CompanyLogo, IconCheck, IconChevron, IconLock } from "../../ui/shared";
import { Prop } from "../../ui/fractions/lazy";
import type { RadarView } from "@/lib/radar/types";
import { YOUR_FEATURE, yourFeature } from "@/lib/radar/types";
import { foundNumbers, tookWords, type NetCompanyView, type NetworkView, type SyncStage } from "@/lib/google/types";
import { namedFn, type CoInfo } from "../model";
import { SEAT_YIELD } from "../earnBack";
import { plural } from "../hooks";
import { WarmthChip } from "./parts";

/** Crystal Ball's latest day, read once when the result shows (the same answer its own page gets). */
function useCrystal(active: boolean): { view: RadarView | null; failed: boolean } {
  const [r, setR] = useState<{ view: RadarView | null; failed: boolean }>({ view: null, failed: false });
  useEffect(() => {
    if (!active) return;
    let live = true;
    fetch("/api/table?radar=1", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : Promise.reject(new Error(String(x.status)))))
      .then((j: RadarView) => live && setR({ view: j, failed: false }))
      .catch(() => live && setR({ view: null, failed: true }));
    return () => {
      live = false;
    };
  }, [active]);
  return r;
}

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
  const p = c.people.find((x) => x.name) ?? c.people[0];
  if (!p) return "Someone you know";
  return [p.name ?? "Someone you know", p.title].filter(Boolean).join(", ");
};

export function Found({
  view,
  infos,
  fn,
  people,
  again,
  onCrystal,
  onStart,
  onStay,
  onSeats,
  onAdd,
  crystal: crystalGiven,
}: {
  view: NetworkView;
  infos: CoInfo[];
  /** The member's function, for "a fractional RevOps leader". */
  fn: string | null;
  /** People they really meet with: the same number Your network shows. */
  people: number;
  /** Opened again from Your network (not the one time after connecting). */
  again: boolean;
  /** Crystal Ball, cut to the companies where they know someone. */
  onCrystal: () => void;
  /** Crystal Ball as it is (to start it, when they have no function yet). */
  onStart: () => void;
  onStay: () => void;
  onSeats: () => void;
  onAdd: () => void;
  /** Crystal Ball's day when the caller already has it (the checks render with it); else it is read here. */
  crystal?: RadarView;
}) {
  const fetched = useCrystal(!crystalGiven);
  const crystal = crystalGiven ? { view: crystalGiven, failed: false } : fetched;
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  const ready = !!crystal.view?.ready;
  const { n, m, ids } = foundNumbers(view.companies, crystal.view ? (ready ? crystal.view.rows : null) : null);
  const g = view.google;
  const took = !again && view.first?.ms != null ? tookWords(view.first.ms) : null;
  const who = namedFn(crystal.view?.function ?? fn);
  const leader = who ? `a fractional ${who} leader` : "a fractional leader like you";
  // The six on the page: the ones in Crystal Ball, most likely first, then the warmest of the rest.
  const byNet = new Map(view.companies.map((c) => [c.id, c]));
  const inBall = new Set(ids);
  const six = [...ids.map((id) => byNet.get(id)!).filter(Boolean), ...view.companies.filter((c) => !inBall.has(c.id))].slice(0, 6);
  // Some of the six are in Crystal Ball and some aren't: say which.
  const mixed = six.some((c) => inBall.has(c.id)) && six.some((c) => !inBall.has(c.id));
  const seats = view.seats.length;

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
          {m === null ? (
            crystal.failed ? null : crystal.view && !ready ? (
              <p className="nf-2 nf-2-quiet">Tell Merlin your function and {yourFeature} shows which of them are likely to hire next.</p>
            ) : (
              <p className="nf-2 nf-2-quiet" role="status">
                Checking them against {yourFeature}…
              </p>
            )
          ) : m > 0 ? (
            <p className="nf-2" data-m={m}>
              {n === 1 ? "It is" : m === 1 ? <><span className="num">1</span> of them is</> : <><span className="num">{m}</span> of them are</>} likely to hire {leader} soon.
            </p>
          ) : (
            <p className="nf-2 nf-2-quiet" data-m={0}>
              None of them is in {yourFeature} today. Merlin looks again every day, and a company where you know someone ranks higher when something moves there.
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
                      {mixed && inBall.has(c.id) ? ` · in ${yourFeature}` : ""}
                    </span>
                  </span>
                  <WarmthChip w={c.warmth} />
                </li>
              );
            })}
          </ul>
          {n > six.length && <p className="nf-more">And {n - six.length} more in Your network.</p>}
          <div className="nf-cta">
            {m ? (
              <button type="button" className="btn btn-pine btn-lg" onClick={onCrystal}>
                {m === 1 ? "See it" : `See the ${m}`} in {yourFeature} <IconChevron dir="right" />
              </button>
            ) : (
              <button type="button" className="btn btn-pine btn-lg" onClick={onStay}>
                Open Your network <IconChevron dir="right" />
              </button>
            )}
            {m ? (
              <button type="button" className="nf-link" onClick={onStay}>
                Open Your network
              </button>
            ) : crystal.view && !ready ? (
              <button type="button" className="nf-link" onClick={onStart}>
                Start {yourFeature}
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
          <span className="nf-also-n num">{people}</span>
          <span className="nf-also-l">{people === 1 ? "person you really meet with" : "people you really meet with"}</span>
        </div>
        {seats > 0 ? (
          <div>
            <span className="nf-also-n num">{seats}</span>
            <span className="nf-also-l">
              {seats === 1 ? "seat you might have held" : "seats you might have held"}.{" "}
              <button type="button" className="nf-link nf-link-sm" onClick={onSeats}>
                Confirm {seats === 1 ? "it" : "them"}
              </button>
              , {SEAT_YIELD}
            </span>
          </div>
        ) : (
          <div>
            <span className="nf-also-n num">{view.stats.unmatched}</span>
            <span className="nf-also-l">{view.stats.unmatched === 1 ? "person at a company" : "people at companies"} not on Merlin yet</span>
          </div>
        )}
        <div>
          <span className="nf-also-n num">0</span>
          <span className="nf-also-l">meeting titles, notes or emails read or kept</span>
        </div>
      </div>
      <ul className="nf-next" aria-label="What happens from here">
        {n > 0 && <li>{YOUR_FEATURE} ranks a company higher when you know someone there</li>}
        {n > 0 && <li>Each company&apos;s record shows who you know, warmest first</li>}
        <li>Read again once a day. Still read-only</li>
      </ul>
    </div>
  );
}
