"use client";

/**
 * Your seats, the Seats page's third tab (Seats.dc.html, "Your seats"): every seat under the
 * member's name as a row, with Merlin's guesses on top to confirm in one tap, what each seat earned,
 * where its verification stands, the ways in it opened, and the rate. A row opens in place to the
 * same one-question-at-a-time fill-in as today's page (Seats.tsx SeatCard, its "row" variant), with
 * what is on file beside it, Change and Report, and "This is not my seat".
 *
 * Merlin's guesses are only what Merlin really has (BUILD_PLAN part 6):
 *  - a seat on file whose holder's name, from public profiles, is the member's own name as written
 *    (seatsModel.ts onFileUnderName). Confirm is Verify's "This is me" (claimSeat);
 *  - with Google connected (RN_GOOGLE), a company the member met with for months (lib/google
 *    seatGuessesOf). Confirm is the existing Add with the member as the seat holder, as on today's
 *    page (network/SeatGuesses.tsx), and "Not a seat" is remembered for good.
 * Nothing is added without the member's click, and the counts are the real ones, including none.
 *
 * Under the table: add a seat (the company and the title, then Add what you know with them filled
 * in, which claims a seat Merlin already has instead of adding a second), the search of the seats
 * Merlin found at a client (onboard/FindSeats.tsx), and How verification works.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NAME_HIDDEN, seatNameWho } from "@/lib/tableFields";
import { seatConfirmFields, type SeatGuessView } from "@/lib/google/types";
import { CompanyLogo, IconCheck, IconChevron, IconLock, IconX, LockedName, useToast } from "../../ui/shared";
import { atTime, plural, store } from "../hooks";
import { earnRoom } from "../NextMove";
import { namedFn, shown, type CoInfo, type SeatInfo } from "../model";
import { FindSeatsHere, SeatRowDetail, useSeatList, waitingSeats } from "../Seats";
import { useUi } from "../ui";
import { setFindStart } from "../find/start";
import { guessLine } from "../network/SeatGuesses";
import { load as loadNetwork, monthYear, netAct, useNetwork } from "../network/useNetwork";
import { stripGone, useApp } from "../shell/pages";
import { earnedAt, onFileUnderName, stepWords, verificationOf, whenWords } from "./seatsModel";
import { SeatCaseCell, seatCasesFill, seatEvidenceOn, useSeatCases } from "../evidence/SeatEvidence";

/** A guess as a row: from the member's calendar, or a seat on file under their name. */
type Guess =
  | { kind: "cal"; id: string; g: SeatGuessView; info: CoInfo | undefined }
  | { kind: "name"; id: string; i: CoInfo; e: import("@/lib/tableTypes").EngagementRec };

const goneKey = (memberId: string) => `sp_notme_${memberId}`;
const readGone = (memberId: string): string[] => {
  try {
    const x = JSON.parse(store.get(goneKey(memberId)) ?? "[]");
    return Array.isArray(x) ? x.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const coFacts = (i: CoInfo) => [shown(i.c.cells.industry), shown(i.c.cells.revenue) ?? shown(i.c.cells.employees)].filter(Boolean).join(" · ");

function CoCell({ i, name, facts }: { i?: CoInfo; name: string; facts?: string }) {
  return (
    <span className="sp-co">
      <CompanyLogo name={name} domain={i?.c.iconDomain ?? i?.domain ?? null} hidden={i?.c.hidden} seed={i?.c.id ?? name} />
      <span className="sp-co-t">
        <strong>{i?.c.hidden ? <LockedName seed={i.c.id} /> : name}</strong>
        {facts && <span className="sp-sub">{facts}</span>}
      </span>
    </span>
  );
}

const Two = ({ t, sub, tone }: { t: ReactNode; sub?: ReactNode; tone?: "muted" | "ok" | "wait" }) => (
  <span className="sp-two">
    {tone === "ok" || tone === "wait" ? <span className={`sp-tag sp-tag-${tone}`}>{t}</span> : <span className={tone === "muted" ? "sp-muted" : undefined}>{t}</span>}
    {sub && <span className="sp-sub">{sub}</span>}
  </span>
);

export function YourSeats({ bottom }: { bottom: (status: ReactNode) => ReactNode }) {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const me = ui.me;
  const seats = c.shell.seats;
  const sl = useSeatList(seats);
  const { view: net } = useNetwork();
  const close = me.plan?.canClose ?? true;
  // Evidence Bank (Close): each seat's case, and a seat added during the visit starts its draft.
  const evOn = seatEvidenceOn(c.ui2, me.plan);
  // The first visit is read once, when the page opens: confirming a guess here moves the strip on to "Step 2 done".
  const [first] = useState(() => seats.length === 0);
  const [cur, setCur] = useState<string | null>(() => c.shell.seatFocus ?? null);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [how, setHow] = useState<boolean>(first);
  const [finding, setFinding] = useState<boolean>(c.shell.seatSearch);
  const [busy, setBusy] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>(() => readGone(me.id));
  const [calDone, setCalDone] = useState<string[]>([]);
  const [co, setCo] = useState("");
  const [role, setRole] = useState("");
  const [addErr, setAddErr] = useState(false);
  const [stripOff, setStripOff] = useState<number>(-1);
  const [msg, setMsg] = useState<string | null>(null);
  const [hideBusy, setHideBusy] = useState(false);
  // Hide my name on my seats: the same setting as Settings and today's page (PartnersSwitch.tsx).
  const flipHide = async () => {
    setHideBusy(true);
    await ui.act({ type: "settings", nameHidden: !me.nameHidden });
    setHideBusy(false);
  };

  /* ----- the guesses ----- */
  const guesses: Guess[] = useMemo(() => {
    const byId = new Map(c.infos.map((i) => [i.c.id, i]));
    const out: Guess[] = [];
    for (const x of onFileUnderName(c.infos, me)) if (!hidden.includes(x.e.id)) out.push({ kind: "name", id: x.e.id, i: x.i, e: x.e });
    for (const g of net?.seats ?? []) if (!calDone.includes(g.id)) out.push({ kind: "cal", id: `cal:${g.id}`, g, info: byId.get(g.id) });
    return out;
  }, [c.infos, me, hidden, net?.seats, calDone]);
  const waiting = useMemo(() => waitingSeats(c.infos), [c.infos]);
  const list = sl.list;
  const room = earnRoom(me);
  const seatIds = useMemo(() => list.map((s) => s.e.id), [list]);
  const cases = useSeatCases(seatIds, evOn);

  // What opens first: the seat the member came for, else the first guess on a first visit, else the first seat with something to fill in.
  const open = cur ?? (first ? guesses[0]?.id : list.find((s) => sl.leftOf(s) > 0)?.e.id) ?? null;
  useEffect(() => {
    const f = c.shell.seatFocus;
    if (!f) return;
    setCur(f);
    const t = setTimeout(() => document.getElementById(`sp-row-${f}`)?.scrollIntoView({ block: "center" }), 60);
    return () => clearTimeout(t);
  }, [c.shell.seatFocus]);
  // A seat that arrives during the visit (a confirmed guess, an Add) opens.
  const [seen] = useState(() => new Set(seats.map((s) => s.e.id)));
  useEffect(() => {
    const fresh = seats.find((s) => !seen.has(s.e.id));
    for (const s of seats) seen.add(s.e.id);
    if (fresh) setCur(fresh.e.id);
  }, [seats, seen]);
  const toggle = (id: string, at: string | null = null) => {
    setStartAt(at);
    setCur(open === id && !at ? "" : id);
  };

  const hideGuess = (id: string, name: string) => {
    const next = [...hidden, id];
    setHidden(next);
    store.set(goneKey(me.id), JSON.stringify(next));
    setMsg(`Got it. Merlin won't suggest the seat at ${name} again.`);
  };
  const confirmName = async (x: Extract<Guess, { kind: "name" }>) => {
    setBusy(x.id);
    const r = await ui.act({ type: "claimSeat", engagementId: x.e.id }, { quiet: true });
    setBusy(null);
    if (r.ok) setMsg(r.message), setCur(x.e.id);
  };
  const confirmCal = async (x: Extract<Guess, { kind: "cal" }>) => {
    const g = x.g;
    const t = (titles[x.id] ?? g.role ?? "").trim() || null;
    if (!g.function && !t) return toast("Type your title there first.", true);
    setBusy(x.id);
    // The existing Add, with the member as the seat holder: its rules, credits and limits. The seat it claims (g.claim) goes with it.
    const r = await ui.act({ type: "add", company: g.name, newEngagement: true, ...(g.claim ? { engagementId: g.claim } : {}), engagementFields: seatConfirmFields(g, me.name, t), operatorMemberId: "me" }, { quiet: true });
    setBusy(null);
    if (!r.ok) return;
    setCalDone((d) => [...d, g.id]);
    setMsg(r.message);
    if (r.id) setCur(r.id);
    void loadNetwork(true);
  };
  const notSeat = async (x: Extract<Guess, { kind: "cal" }>) => {
    setBusy(x.id);
    const r = await netAct("not-a-seat", { company: x.g.id });
    setBusy(null);
    if (r.error) return toast(r.error, true);
    setMsg(r.message ?? `Got it. Merlin won't suggest ${x.g.name} again.`);
  };

  const addSeat = () => {
    const name = co.trim();
    if (!name) return setAddErr(true);
    setAddErr(false);
    // Add what you know, at "A seat you held", with the company and the title filled in: it finds the company (or adds it by its website) and claims a seat Merlin already has there.
    c.openAdd({ mine: true, query: name, ...(role.trim() ? { seat: { role: role.trim() } } : {}) });
    setCo("");
    setRole("");
  };

  /* ----- the strip (first visit) ----- */
  const sixKeys = c.start.six.steps.map((s) => s.key);
  const stage = first && list.length ? 1 : 0;
  const stripKey = stage ? "seats-done" : "seats";
  const showStrip = first && stripOff !== stage && !stripGone(c, stripKey);
  const s0 = list[0];
  const s0Earned = s0 ? earnedAt(c.view.ledger, s0.i.c.name) : null;

  /* ----- rows ----- */
  const verN = list.filter((s) => verificationOf(s.e).ok).length;
  const earnedAll = list.reduce((n, s) => n + earnedAt(c.view.ledger, s.i.c.name).paid, 0);
  const waysAll = list.reduce((n, s) => n + s.e.people.length, 0);
  const gSum = guesses.length;
  const heads: { name: string; fill: string }[] = [
    { name: "Company", fill: `${plural(list.length, "seat")}${gSum ? `, ${plural(gSum, "guess", "guesses")}` : ""}` },
    { name: "Seat", fill: "Title and dates" },
    { name: "Verification", fill: list.length ? `${verN} of ${list.length} verified` : `${gSum} to confirm` },
    { name: "Earned", fill: `${plural(earnedAll, "credit")} so far` },
    { name: "Ways in it created", fill: plural(waysAll, "way") + " in" },
    { name: "Evidence case", fill: seatCasesFill(cases, seatIds, close) },
    { name: "Your rate", fill: "You choose who sees it" },
  ];
  const chev = (on: boolean, label: string, go: () => void) => (
    <button type="button" className="sp-exp" aria-expanded={on} aria-label={label} onClick={go}>
      <IconChevron size={16} dir={on ? "up" : "down"} />
    </button>
  );
  // A guess has no case until it is confirmed; a seat of theirs finishes its case in Evidence Bank.
  const guessCase = close ? <Two t="Starts once you confirm" sub="A draft case for the seat" tone="muted" /> : <Two t="On the Close plan" sub="Evidence Bank" tone="muted" />;
  const seatCase = (e: { id: string }, name: string) =>
    close ? <SeatCaseCell seatId={e.id} status={cases?.get(e.id)} page={c.page} openPage={c.openPage} name={name} /> : <Two t="On the Close plan" sub="Evidence Bank" tone="muted" />;

  const guessRow = (x: Guess, n: number) => {
    const on = open === x.id;
    const hero = first && n === 0 && !list.length;
    const name = x.kind === "cal" ? x.g.name : x.i.c.name;
    const i = x.kind === "cal" ? x.info : x.i;
    const facts = i ? coFacts(i) : "";
    const fn = x.kind === "cal" ? namedFn(x.g.function) : shown(x.e.cells.function);
    const looks = x.kind === "cal" ? (titles[x.id] ?? x.g.role ?? (fn ? `Fractional ${fn} seat` : "A fractional seat")) : (shown(x.e.cells.role) ?? (fn ? `${fn} seat` : "A fractional seat"));
    const when = x.kind === "cal" ? `${monthYear(x.g.from)} to ${x.g.active ? "now" : monthYear(x.g.to)}` : whenWords(x.e) ?? "Dates on file";
    const earns = x.kind === "cal" ? Object.keys(seatConfirmFields(x.g, me.name, titles[x.id] ?? x.g.role)).length : 0;
    const earnT = x.kind === "cal" ? (x.g.waits ? `+${earns} when confirmed` : room ? `+${Math.min(earns, room)} now` : "No credit today") : "0 to claim";
    const earnSub = x.kind === "cal" ? (x.g.waits ? "New to Merlin, so they wait" : "Then 1 for each answer") : "Then 1 for each fact you add";
    return (
      <tr key={x.id} id={`sp-row-${x.id}`} className={`sp-guess${on ? " on" : ""}`}>
        <td className="sp-td-exp">{chev(on, `${on ? "Hide" : "Show"} why Merlin thinks you held a seat at ${name}`, () => toggle(x.id))}</td>
        <td>
          <CoCell i={i} name={name} facts={facts} />
        </td>
        <td>
          <Two t={looks} sub={`Guess · ${when}`} />
        </td>
        <td>
          <span className="sp-acts">
            <button
              type="button"
              className={`btn btn-volt sp-confirm${hero ? " sp-hero" : ""}`}
              disabled={!!busy}
              aria-busy={busy === x.id}
              aria-label={`Confirm the seat at ${name}${earns ? `, earns ${earns} credits` : ""}`}
              onClick={() => void (x.kind === "cal" ? confirmCal(x) : confirmName(x))}
            >
              {busy === x.id ? "Saving" : x.kind === "cal" && earns ? `Confirm · +${x.g.waits ? earns : Math.min(earns, room) || earns}` : "Confirm"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void (x.kind === "cal" ? notSeat(x) : hideGuess(x.id, name))}>
              {x.kind === "cal" ? "Not a seat" : "Not me"}
            </button>
          </span>
          <span className="sp-sub">{x.kind === "cal" && !x.g.sure ? "Less sure. It may have been a project" : "Nothing is added until you confirm"}</span>
        </td>
        <td>
          <Two t={earnT} sub={earnSub} />
        </td>
        <td>
          <Two t={x.kind === "cal" ? (x.g.with.length ? plural(x.g.with.length, "person", "people") + " you met" : "None on file yet") : plural(x.e.people.length, "person", "people") + " on file"} tone="muted" />
        </td>
        <td>{guessCase}</td>
        <td>
          <Two t="Yours to share or not" tone="muted" />
        </td>
      </tr>
    );
  };
  const guessDetail = (x: Guess) => {
    const name = x.kind === "cal" ? x.g.name : x.i.c.name;
    const fn = x.kind === "cal" ? namedFn(x.g.function) : shown(x.e.cells.function);
    const why =
      x.kind === "cal"
        ? `Your calendar shows ${guessLine(x.g)}.${x.g.with.length ? ` You met mostly with ${x.g.with.map((p) => [p.name, p.title].filter(Boolean).join(", ")).join(" and ")}.` : ""}`
        : `Merlin has this seat on file with a name from public profiles that is yours as written: ${me.name}. Nobody has confirmed it yet.`;
    const does =
      x.kind === "cal"
        ? `It puts your name on a ${fn ? `${fn} ` : ""}seat at ${name}, from ${monthYear(x.g.from)}${x.g.active ? ", still active" : ` to ${monthYear(x.g.to)}`}.${x.g.claim ? " Merlin has a seat there with nobody named, so confirming claims that one and never makes a second." : ""} You can change the title, the dates or anything else after.`
        : `It claims the seat. Your name matches the one on file, so it is verified at once, and it moves to Your seats. You can change anything on it after.`;
    const earns =
      x.kind === "cal"
        ? x.g.waits
          ? `${name} is new to Merlin, so the credits wait until another member confirms a fact on the seat, or an admin checks it.`
          : `1 credit for each fact it adds, now. Up to about 12 once you answer the rest.`
        : `Claiming earns nothing by itself, and you can claim 3 seats a day. Each fact you add to it after earns 1 credit.`;
    return (
      <tr key={`${x.id}:d`} className="sp-detail-tr">
        <td colSpan={8}>
          <div className="sp-guess-d">
            <div className="sp-points">
              {[
                ["Why Merlin thinks so", why],
                ["What confirming does", does],
                ["What it earns", earns],
              ].map(([h, p]) => (
                <div key={h} className="sp-point">
                  <strong>{h}</strong>
                  <span>{p}</span>
                </div>
              ))}
            </div>
            {x.kind === "cal" && (
              <label className="sp-title">
                <span>Your title there</span>
                <input className="input" maxLength={80} value={titles[x.id] ?? x.g.role ?? ""} placeholder={fn ? `Fractional VP ${fn}` : "Fractional VP Sales"} onChange={(e) => setTitles((t) => ({ ...t, [x.id]: e.target.value }))} />
                <span className="sp-sub">Change it here before you confirm, or on the seat after.</span>
              </label>
            )}
            <p className="sp-fine">
              <IconLock size={13} />
              <span>
                Only you see this guess. Once you confirm, members see that the company hired a fractional {fn ? `${fn} ` : ""}leader and when.{" "}
                {me.nameHidden ? "Your name stays hidden." : "Fellow fractionals see your name on it free once they can see the company."}
                {x.kind === "cal" ? " Who you met, and how often, is never shown." : ""}
              </span>
            </p>
          </div>
        </td>
      </tr>
    );
  };

  const seatRow = (s: SeatInfo) => {
    const { i, e } = s;
    const on = open === e.id;
    const left = sl.leftOf(s);
    const er = earnedAt(c.view.ledger, i.c.name);
    const v = verificationOf(e, er.waiting);
    const rate = shown(e.cells.rate);
    const bench = sl.benchBySeat.get(e.id);
    const canRate = e.cells.rate?.s === "empty" && !bench;
    const name = i.c.hidden ? "this company" : i.c.name;
    return (
      <tr key={e.id} id={`sp-row-${e.id}`} className={on ? "on" : undefined}>
        <td className="sp-td-exp">{chev(on, `${on ? "Fold" : "Show"} your seat at ${name}`, () => toggle(e.id))}</td>
        <td>
          <CoCell i={i} name={i.c.name} facts={coFacts(i)} />
        </td>
        <td>
          <Two t={shown(e.cells.role) ?? (shown(e.cells.function) ? `${shown(e.cells.function)} seat` : "Title to add")} sub={whenWords(e) ?? "Dates to add"} />
        </td>
        <td>
          <Two t={v.word} sub={v.sub} tone={v.ok ? "ok" : "wait"} />
        </td>
        <td>
          <span className="sp-two">
            <span>{er.waiting && !er.paid ? `+${er.waiting} waiting` : plural(er.paid, "credit")}</span>
            <span className="sp-sub">
              {left ? `${plural(left, "answer")} left` : "Complete"}
              {left > 0 && !on && (
                <button type="button" className="sp-mini" onClick={() => toggle(e.id)}>
                  Fill in
                </button>
              )}
            </span>
          </span>
        </td>
        <td>
          {e.people.length ? (
            c.network ? (
              <Two t={<a href={c.hrefOf("warm")} onClick={(ev) => (ev.preventDefault(), c.openPage("warm"))}>{plural(e.people.length, "way")} in</a>} sub="The people on file there" />
            ) : (
              <Two t={<button type="button" className="tp-flink" onClick={() => c.openCompany(i.c.id, e.id)}>{plural(e.people.length, "way")} in</button>} sub="The people on file there" />
            )
          ) : (
            <Two t="None yet" sub={v.ok ? "Add who hired you" : "Opens when confirmed"} tone="muted" />
          )}
        </td>
        <td>{seatCase(e, name)}</td>
        <td>
          {rate ? (
            <Two t={rate} sub="On the seat. 1 credit to others" />
          ) : bench ? (
            <Two t="Benchmarks only" sub="Never shown with your name" />
          ) : canRate ? (
            <span className="sp-two">
              <span className="sp-muted">Not shared</span>
              <button type="button" className="sp-mini" aria-label={`Add what you charged at ${name}, earns 1 credit`} onClick={() => toggle(e.id, "e.rate")}>
                Add · +1
              </button>
            </span>
          ) : (
            <Two t="Not shared" tone="muted" />
          )}
        </td>
      </tr>
    );
  };

  const anyRows = guesses.length + list.length + waiting.length + sl.gone.size > 0;
  const status = msg ?? (me.earned24h ? `${me.earned24h} of ${me.earnCap} credits earned today${room ? "" : `. You can earn again ${atTime(me.earnResetsAt)}`}` : `Each new fact earns 1 credit, up to ${me.earnCap} a day.`);
  const step = stepWords(sixKeys, "seat");
  const stepN = sixKeys.indexOf("seat") + 1;

  return (
    <>
      {showStrip && (
        <section aria-label="About this page" className={`wb-strip${stage ? " wb-strip-done" : ""}`}>
          {stage === 0 ? (
            <span className="wb-strip-t">
              <strong>What this page is for.</strong> Every fractional seat Merlin has on file, and the ones you held. Confirm your own seats to earn credits, see what a seat paid, and catch the seats that just ended.
            </span>
          ) : (
            <>
              <span className="wb-strip-t">
                <strong>{stepN ? `Step ${stepN} done. ` : ""}{s0?.i.c.name ?? "Your seat"} is on your seats.</strong>{" "}
                {s0Earned && s0Earned.waiting && !s0Earned.paid ? "Its credits arrive when another member confirms a fact on it." : `It earned ${plural(s0Earned?.paid ?? 0, "credit")} so far.`} Next, bring in who you know. It turns into warm paths.
              </span>
              <button type="button" className="btn btn-pine" onClick={() => c.start.run("network")}>
                Bring in who you know
              </button>
            </>
          )}
          <button type="button" className="wb-iconbtn" aria-label="Dismiss" onClick={() => (setStripOff(stage), c.start.dismissStrip(stripKey))}>
            <IconX size={16} />
          </button>
        </section>
      )}
      <div className="wb-toolbar" role="toolbar" aria-label="Your seats">
        <span className="wb-tb wb-tb-strong sp-static">View: Your seats</span>
        <span className="wb-tb wb-tb-quiet sp-static num">{plural(list.length, "seat")} under your name</span>
        <span className="wb-tb-sp" />
        <button type="button" role="switch" aria-checked={!!me.nameHidden} className="sp-switch" disabled={hideBusy} aria-busy={hideBusy} onClick={() => void flipHide()} title={me.nameHidden ? `Other members see "${NAME_HIDDEN}" on your seats.` : `Other members see "${NAME_HIDDEN}" on your seats while it is on.`}>
          <span className="sp-track" aria-hidden>
            <span />
          </span>
          Hide my name on my seats
        </button>
      </div>
      {c.shell.seatBack && me.credits > 0 && (
        <div className="sp-note sp-note-back" role="status">
          <span>
            You have <b className="num">{plural(me.credits, "credit")}</b> now.
          </span>
          <button type="button" className="btn btn-pine btn-sm" onClick={c.shell.seatBack.go}>
            Back to {c.shell.seatBack.name}
          </button>
        </div>
      )}
      <div className={`sp-note${first ? " sp-note-first" : ""}`}>
        <span>
          {first ? (
            <>
              <strong className="sp-note-big">Add the seats you have held</strong>
              {step ? `${step}. ` : ""}
              {guesses.length
                ? `Merlin found ${plural(guesses.length, "seat")} that may be yours: ${guesses.some((g) => g.kind === "name") ? "seats on file under your name" : ""}${guesses.some((g) => g.kind === "name") && guesses.some((g) => g.kind === "cal") ? ", and " : ""}${guesses.some((g) => g.kind === "cal") ? "companies your calendar shows you met with for months" : ""}. Confirm the ones that were, in one tap. Each earns credits and opens ways in.`
                : "Merlin has no guesses for you yet. Add a seat in the row under the table, or search the seats Merlin found at a client you worked with. Each fact you add earns 1 credit."}
            </>
          ) : me.nameHidden ? (
            <>
              <strong>Your name is hidden.</strong> Other members see &quot;{NAME_HIDDEN}&quot; on your seats. Your seats and roles still count.
            </>
          ) : (
            <>
              <strong>Who sees what.</strong> {seatNameWho(me.fractionals ?? null)} How you were found, your rate and the month a past seat ended are 1 credit each.
            </>
          )}
        </span>
        {first && c.network && !net?.google && (
          <button type="button" className="tp-flink" onClick={() => c.start.run("network")}>
            Connect Google for more guesses
          </button>
        )}
      </div>
      <div className="wb-ask sp-ask">
        <button type="button" className="wb-askchip" aria-pressed={how} onClick={() => setHow(!how)}>
          How verification works
        </button>
        <button type="button" className="wb-askchip" aria-pressed={finding} onClick={() => setFinding(!finding)}>
          Search the seats Merlin found at a client
        </button>
        <button type="button" className="wb-askchip" onClick={() => (setFindStart({ kind: "lookalikes" }), c.openPage("find"))}>
          Find more like these
        </button>
      </div>
      <div className="wb-body">
        <section aria-label="Your seats" className="wb-main sp-mine">
          {anyRows ? (
            <table className="sp-table">
              <thead>
                <tr>
                  <th scope="col" className="sp-th-exp">
                    <span className="sr-only">Open</span>
                  </th>
                  {heads.map((h) => (
                    <th key={h.name} scope="col">
                      <span>{h.name}</span>
                      <span className="sp-fill">{h.fill}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guesses.map((x, n) => [guessRow(x, n), open === x.id ? guessDetail(x) : null])}
                {sl.order.current.map((id) => {
                  const note = sl.gone.get(id);
                  if (note !== undefined)
                    return (
                      <tr key={id} className="sp-gone">
                        <td colSpan={8} role="status">
                          <IconCheck size={12} /> {note || "Got it. That seat is no longer linked to you."}
                        </td>
                      </tr>
                    );
                  const s = sl.byId.get(id);
                  if (!s) return null;
                  return [
                    seatRow(s),
                    open === id ? (
                      <tr key={`${id}:d`} className="sp-detail-tr">
                        <td colSpan={8}>
                          <SeatRowDetail sl={sl} s={s} startAt={startAt} onGone={() => setCur("")} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
                {waiting.map(({ i, e }) => (
                  <tr key={e.id} className="sp-wait">
                    <td />
                    <td>
                      <CoCell i={i} name={i.c.name} facts={coFacts(i)} />
                    </td>
                    <td>
                      <Two t={shown(e.cells.role) ?? `${shown(e.cells.function) ?? "A fractional"} seat`} sub={whenWords(e) ?? undefined} />
                    </td>
                    <td>
                      <Two t="Waiting for a member" sub="You named yourself on it. It moves up once a member confirms it" tone="wait" />
                    </td>
                    <td colSpan={4}>
                      <Two t="Its locked facts open for you once it is confirmed" tone="muted" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="wb-empty-list">
              <strong>No seat is under your name yet.</strong>
              <span>Add one in the row below, or search the seats Merlin found at a client you worked with.</span>
            </div>
          )}
          <form
            className="sp-add"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              addSeat();
            }}
          >
            <span className="sp-add-plus" aria-hidden>
              +
            </span>
            <input className="input" aria-label="A client you worked with" placeholder="Add a seat: type a client you worked with" value={co} maxLength={200} onChange={(e) => (setCo(e.target.value), setAddErr(false))} aria-invalid={addErr || undefined} />
            <input className="input" aria-label="Your title there" placeholder="Your title, like Fractional VP Sales" value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} />
            <button type="submit" className="btn btn-pine">
              Add this seat
            </button>
            <span className={`sp-add-hint${addErr ? " err" : ""}`} role={addErr ? "alert" : undefined}>
              {addErr ? "Type the company first. Its name or its website." : "Each fact you add earns 1 credit, up to about 12 a seat and 25 a day. If Merlin already has a seat there with nobody named, you claim it and no second one is made."}{" "}
              <a href={c.hrefOf("agent")} onClick={(e) => (e.preventDefault(), c.openPage("agent"))}>
                Or have your agent add it
              </a>
            </span>
          </form>
          {finding && (
            <div className="sp-find">
              <FindSeatsHere infos={c.infos} autoFocus={c.shell.seatSearch} empty={false} />
            </div>
          )}
          {how && (
            <section aria-label="How verification works" className="sp-how">
              {[
                { k: "1 · You", h: "Confirm a guess or add a seat", p: "Your name goes on the seat. At a company Merlin knows, the credits are paid at once." },
                { k: "2 · Another member", h: "Someone confirms a fact on it", p: "At a company new to Merlin the credits wait for this, or for an admin check. A seat matched to work you published starts verified." },
                { k: "3 · Verified", h: "It becomes a way in", p: "The people you worked with there turn into warm paths. With Evidence Bank, it also starts a draft case for you." },
                ...(c.network
                  ? [{ k: "More guesses, no typing", h: net?.google ? "Google is connected" : "Connect Google", p: "Merlin reads who you met and how often from your calendar, then suggests seats. It never reads the text of a message.", link: { t: net?.google ? "Manage connections" : "Connect Google", go: () => c.start.run("network") } }]
                  : []),
              ].map((w) => (
                <div key={w.k} className="sp-how-card">
                  <span className="sp-how-k">{w.k}</span>
                  <strong>{w.h}</strong>
                  <span>
                    {w.p}{" "}
                    {"link" in w && w.link && (
                      <button type="button" className="tp-flink" onClick={w.link.go}>
                        {w.link.t}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </section>
          )}
        </section>
      </div>
      {bottom(
        <span className="wb-status" role="status" aria-live="polite">
          {status}
        </span>,
      )}
    </>
  );
}
