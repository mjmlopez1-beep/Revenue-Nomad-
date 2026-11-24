"use client";

/**
 * Pick a call Granola recorded, to start a proposal from it (StartCall, step 1: "Today's call with
 * Dana, 10:00 · Granola has a 42-minute call from today with dana@cedarpine.example").
 *
 * Given a company id (or an email) when it opens, it lists the member's matching calls from the
 * last 30 days, newest first, else any recent call. It asks once when it opens: typing who signs,
 * picking a call or picking the company never asks again (the list on screen stays, and the call
 * picked stays in it). Only the member's own search asks again, for a whole email address, 400 ms
 * after the last key, never the same question twice, the older request cancelled and a late answer
 * dropped (callPick.ts callSearch). Picking one reads that call's transcript from Granola (only
 * then) and hands it to `onPick` with who was on it; Merlin keeps nothing of it. The note's title
 * shows only when the member ticks Show note titles (it is their own note).
 *
 * States: off (RN_GRANOLA: renders nothing), not connected (Connect Granola: to Granola's consent
 * page and back to this same start, with "Granola connected"; when Granola's sign-in isn't
 * available, a link to the key form in Settings and the plan it needs; and the paste fallback), no Close (the upgrade prompt), loading, calls, no matching calls
 * (search by email, or any recent call), and errors in plain words.
 *
 * Props (for StartSheet's step 1):
 *   companyId   the company's public id on Merlin (calls with anyone at its website's domain); open for the member. Read when the picker opens.
 *   email       an email to start with when there is no company (read when the picker opens, never followed while someone types)
 *   companyName for the words ("No calls with Cedar and Pine in the last 30 days")
 *   pickedId    the note id picked already, shown as chosen
 *   onPick      ({ noteId, text, attendees, when, minutes, title? }) once the transcript is read
 *   onPaste     the fallback: switch to pasting a transcript (the link shows only when given)
 *   onConnect   open Integrations at the Granola card (default: the app's own page switch)
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CallsAnswer, GranolaCall, GranolaTranscript } from "@/lib/granola/types";
import { UiCtx } from "./ui";
import { openPlans } from "./Billing";
import { useToast } from "../ui/shared";
import { fetchCalls, fetchTranscript, loadGranola, startGranola, useGranola, useGranolaNotice, type Answer } from "./granolaClient";
import { WHOLE_EMAIL, callQueryKey, callSearch, withPicked, type CallQuery, type CallSearch } from "./callPick";
import { callLine, callTitle } from "./granolaWords";
import { GRANOLA_PLAN, GRANOLA_READS, GranolaMark } from "./GranolaSection";
import "./granola.css";

export type GranolaPick = Pick<GranolaTranscript, "noteId" | "text" | "attendees" | "when" | "minutes" | "title">;

export interface GranolaCallPickerProps {
  companyId?: string | null;
  email?: string | null;
  companyName?: string;
  pickedId?: string | null;
  onPick: (p: GranolaPick) => void;
  onPaste?: () => void;
  onConnect?: () => void;
}

type By = CallQuery;
type Load = { state: "idle" } | { state: "loading" } | { state: "done" } | { state: "error"; error: string; code?: string };

export function GranolaCallPicker({ companyId, email, companyName, pickedId, onPick, onPaste, onConnect }: GranolaCallPickerProps) {
  const { status } = useGranola();
  // Inside the app the page switch; on its own, the Integrations address.
  const ui = useContext(UiCtx);
  const [titles, setTitles] = useState(false);
  // What the list is for (the words), set when the picker opens and by the member's own search only.
  const [by, setBy] = useState<By>(() => (companyId ? { company: companyId } : email ? { email } : { recent: true }));
  const [load, setLoad] = useState<Load>({ state: "idle" });
  // The last list Granola gave, kept on screen while a newer one loads.
  const [list, setList] = useState<{ a: CallsAnswer; by: By } | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [pickErr, setPickErr] = useState<string | null>(null);
  const [search, setSearch] = useState(companyId ? "" : (email ?? ""));
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const picked = useRef<GranolaCall | null>(null);
  const [going, setGoing] = useState(false);
  const toast = useToast();
  useGranolaNotice((t, bad) => toast(t, bad));
  const ready = !!status?.on && status.connected && status.canDraft;

  // One request at a time: debounced, the same question once, the older one cancelled, a late answer dropped.
  const asked = useRef(new Map<string, By>());
  const runner = useRef<CallSearch<Answer<CallsAnswer>> | null>(null);
  runner.current ??= callSearch<Answer<CallsAnswer>>({
    ask: (k, signal) => fetchCalls(asked.current.get(k) ?? { recent: true }, k.endsWith("|titles"), signal),
    onStart: () => (setLoad({ state: "loading" }), setPickErr(null)),
    onAnswer: (k, r) => {
      if (r.error !== undefined) {
        setLoad({ state: "error", error: r.error, code: r.code });
        if (r.code === "bad_key") void loadGranola(true);
        return;
      }
      setLoad({ state: "done" });
      setList({ a: r, by: asked.current.get(k) ?? { recent: true } });
    },
  });
  const ask = useCallback((b: By, t: boolean, now = true) => {
    const k = callQueryKey(b, t);
    asked.current.set(k, b);
    setBy(b);
    runner.current!.want(k, { now });
  }, []);
  // Once, when Granola is ready: not again for a new signer, a pick or a company picked later.
  useEffect(() => {
    if (!ready) return;
    ask(by, titles);
    const r = runner.current;
    return () => r?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!status || !status.on) return status ? null : <p className="gr-quiet">Looking for your Granola calls…</p>;

  const toIntegrations = () => (onConnect ? onConnect() : ui ? ui.openPage("integrations") : window.location.assign("/?p=integrations"));
  const paste = onPaste ? (
    <button type="button" className="tp-flink gr-paste" onClick={onPaste}>
      Paste a transcript instead
    </button>
  ) : null;

  if (!status.connected)
    return (
      <div className="gr-picker gr-empty" data-state="not-connected">
        <span className="gr-mark-box gr-mark-lg" aria-hidden>
          <GranolaMark />
        </span>
        <div className="gr-empty-t">
          <p className="gr-h">Start from a Granola call</p>
          {status.oauth ? (
            <p className="gr-p">Connect Granola once and your recent calls show up here. {GRANOLA_READS}</p>
          ) : (
            <p className="gr-p">Connect Granola once and your recent calls show up here. {GRANOLA_PLAN.split(".")[0]}.</p>
          )}
          <div className="gr-row">
            {status.oauth ? (
              <button type="button" className="btn btn-pine" aria-busy={going} disabled={going} onClick={() => (setGoing(true), startGranola())}>
                {going ? "Opening Granola" : "Connect Granola"}
              </button>
            ) : (
              <button type="button" className="btn" onClick={toIntegrations}>
                Connect Granola
              </button>
            )}
            {paste}
          </div>
        </div>
      </div>
    );

  if (!status.canDraft)
    return (
      <div className="gr-picker gr-close" data-plan="free" data-state="close" role="status">
        <span className="bl-tag bl-tag-lock">Close</span>
        <p>Drafting a proposal from a Granola call is on Close. Granola stays connected.</p>
        <button type="button" className="btn btn-sm" onClick={() => openPlans("proposals")}>
          See the Close plan
        </button>
      </div>
    );

  const pick = async (c: GranolaCall) => {
    if (reading) return;
    picked.current = c;
    setReading(c.noteId);
    setPickErr(null);
    const r = await fetchTranscript(c.noteId, titles);
    setReading(null);
    if (r.error !== undefined) {
      setPickErr(r.error);
      if (r.code === "bad_key") void loadGranola(true);
      return;
    }
    onPick({ noteId: r.noteId, text: r.text, attendees: r.attendees, when: r.when, minutes: r.minutes, ...(r.title ? { title: r.title } : {}) });
  };

  const wordsOf = (b: By) => (b.company ? companyName || "this company" : b.email ? b.email : "");
  const whoWords = wordsOf(by);
  const shownBy = list?.by ?? by;
  const shownWho = wordsOf(shownBy);
  const calls = list ? withPicked(list.a.calls, picked.current, pickedId) : [];
  const looking = load.state === "loading" || load.state === "idle";
  const searchForm = (
    <form
      className="gr-search"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const v = search.trim().toLowerCase();
        if (!WHOLE_EMAIL.test(v)) {
          setSearchErr("Type the whole email address, like dana@cedarpine.example.");
          searchRef.current?.focus();
          return;
        }
        setSearchErr(null);
        ask({ email: v }, titles);
      }}
    >
      <label className="in-label" htmlFor="gr-search-email">
        Search by email
      </label>
      <div className="gr-row">
        <input
          ref={searchRef}
          id="gr-search-email"
          className={`input gr-input${searchErr ? " bad" : ""}`}
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder="dana@cedarpine.example"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (searchErr) setSearchErr(null);
            // A whole address searches by itself, 400 ms after the last key; anything less waits for Search.
            const v = e.target.value.trim().toLowerCase();
            if (WHOLE_EMAIL.test(v)) ask({ email: v }, titles, false);
          }}
          aria-invalid={!!searchErr}
        />
        <button type="submit" className="btn">
          Search
        </button>
      </div>
      {searchErr && (
        <p className="in-err" role="alert">
          {searchErr}
        </p>
      )}
    </form>
  );

  return (
    <div className="gr-picker" data-state={list && load.state !== "error" ? (calls.length ? "calls" : "none") : load.state}>
      <div className="gr-top">
        <p className="gr-h">
          <span className="gr-mark-box" aria-hidden>
            <GranolaMark size={18} />
          </span>
          Your calls in Granola
        </p>
        <label className="gr-titles">
          <input type="checkbox" checked={titles} onChange={(e) => (setTitles(e.target.checked), ask(by, e.target.checked))} />
          Show note titles
        </label>
      </div>

      {looking && list && (
        <p className="gr-quiet" role="status">
          {whoWords ? `Looking for calls with ${whoWords}…` : "Looking for your recent calls…"}
        </p>
      )}
      {looking && !list ? (
        <p className="gr-quiet" role="status">
          {whoWords ? `Looking for calls with ${whoWords}…` : "Looking for your recent calls…"}
        </p>
      ) : load.state === "error" ? (
        <div className="gr-err" role="alert">
          <p>{load.error}</p>
          <div className="gr-row">
            {load.code === "bad_key" || load.code === "not_connected" ? (
              <button type="button" className="btn" onClick={toIntegrations}>
                Open Integrations
              </button>
            ) : load.code === "locked" || load.code === "no_domain" || load.code === "no_company" ? null : (
              <button type="button" className="btn" onClick={() => runner.current?.retry()}>
                Try again
              </button>
            )}
            {paste}
          </div>
          {(load.code === "locked" || load.code === "no_domain" || load.code === "no_company") && searchForm}
        </div>
      ) : !list ? null : calls.length ? (
        <>
          <ul className="gr-calls" aria-label="Calls">
            {calls.map((c) => {
              const on = pickedId === c.noteId;
              return (
                <li key={c.noteId}>
                  <button type="button" className={`gr-call${on ? " on" : ""}`} aria-pressed={on} onClick={() => void pick(c)} disabled={!!reading} aria-busy={reading === c.noteId}>
                    <span className="gr-call-h">{callTitle(c)}</span>
                    {c.title && <span className="gr-call-title">{c.title}</span>}
                    <span className="gr-call-s">{reading === c.noteId ? "Reading the transcript from Granola…" : callLine(c)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {pickErr && (
            <p className="gr-err gr-err-line" role="alert">
              {pickErr}
            </p>
          )}
          <div className="gr-row gr-more">
            {!shownBy.recent && (
              <button type="button" className="tp-flink" onClick={() => ask({ recent: true }, titles)}>
                Show any recent call
              </button>
            )}
            {paste}
          </div>
        </>
      ) : (
        <div className="gr-none">
          <p className="gr-p">
            {shownBy.recent ? `No calls in Granola in the last ${list.a.days} days.` : `No calls with ${shownWho} in Granola in the last ${list.a.days} days.`}
          </p>
          {searchForm}
          <div className="gr-row">
            {!shownBy.recent && (
              <button type="button" className="btn" onClick={() => ask({ recent: true }, titles)}>
                Pick any recent call
              </button>
            )}
            {paste}
          </div>
        </div>
      )}
      <p className="gr-note">Merlin reads a call&apos;s transcript only when you pick it, and keeps the draft, not the transcript.</p>
    </div>
  );
}
