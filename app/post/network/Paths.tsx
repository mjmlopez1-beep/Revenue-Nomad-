"use client";

/**
 * Your network's four parts, in the order a member acts on them (model.ts says what each lists):
 *
 *   1. Warm paths into companies likely to hire you: the best person there, their warmth with its
 *      reason, why the company is a fit, and one action (Draft a note, or Open the record).
 *   2. Your clients: what the calendar shows as a seat now. Confirm it in one tap; on a seat that
 *      is already theirs, what the member may add from their own meetings (the start month, the
 *      people they work with), each one their own click. Nothing goes on Merlin without it.
 *   3. People who can introduce you: investors and other fractionals, what each can open said
 *      honestly, and Ask for an intro.
 *   4. Everyone you know: every company and person, searched and filtered, with "Not a relationship"
 *      on each (remembered across reads) and Undo on what Merlin set aside.
 *
 * Notes are the moves' note sheet (MoveNote.tsx) in the member's own voice: Merlin drafts, the
 * member sends. Everything here is the member's own; the server never sends anyone else's.
 */
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { Me } from "@/lib/tableTypes";
import type { RadarRow } from "@/lib/radar/types";
import { NOT_REL, NOT_REL_WORDS, STRENGTH_WORDS, seatConfirmFields, strengthLine, type IntroView, type NetCompanyView, type NetPersonView, type NetworkView, type NotRelWhy, type SeatGuessView, type Warmth } from "@/lib/google/types";
import { fromGoogle, type KnowPerson, type Move } from "@/lib/moves";
import type { NoteFacts } from "@/lib/moveNote";
import { clientKinds, firstOf, myWords } from "@/lib/partners";
import { CompanyLogo, IconChevron, initials, useToast } from "../../ui/shared";
import { namedFn, type CoInfo } from "../model";
import { useUi } from "../ui";
import { earnRoom } from "../NextMove";
import { WarmthChip, besideChip } from "./parts";
import { load, monthYear, netAct } from "./useNetwork";
import { pipelineAct } from "../pipelineStore";
import { usePlan } from "./usePaths";
import { IntroLine } from "./IntroWhy";
import type { IntroPlanView } from "@/lib/paths/intro";
import { NO_FILTER, SIZE_GROUPS, bestPerson, clientRows, everyone, fitWords, introWho, setWords, warmRows, type EveryoneFilter, type WarmFilter } from "./model";
import { Chip, LIKELIHOOD_TONE } from "../../ui/system";

const NoteSheet = dynamic(() => import("../MoveNote").then((m) => m.NoteSheet), { ssr: false });

/* ---------- the note ---------- */

const knowOf = (p: NetPersonView | IntroView): KnowPerson => ({
  name: p.name ?? "",
  title: p.title,
  email: p.email,
  warmth: p.warmth,
  last: "last" in p ? p.last : null,
  meetings: "meetings" in p ? p.meetings : 0,
  emails: "emails" in p ? p.emails : 0,
  dm: "dm" in p ? p.dm : false,
  google: fromGoogle(p.src),
});

/** What the note sheet needs for a warm path: a move with the person they know, and the row of what happened there (when something did). */
export function warmNote(c: NetCompanyView, p: NetPersonView): { m: Move; row: RadarRow } {
  const person = knowOf(p);
  const saw = c.odds?.saw ?? null;
  const row: RadarRow = { id: c.id, kinds: saw ? [saw.kind] : [], lines: saw ? [saw.line] : [] };
  const role = saw?.kind === "role" ? saw.line.replace(/^New open role:\s*/i, "") : null;
  const m: Move = {
    id: c.id,
    name: c.name,
    hidden: false,
    facts: [c.industry, c.employees].filter(Boolean).join(" · "),
    hiring: !!role,
    open: role ? { kind: "role", seatId: "", title: role, fn: null, since: null, posting: null } : null,
    band: c.odds && c.odds.score > 0 ? c.odds.band : null,
    why: c.odds && c.odds.score > 0 ? c.odds.why : fitWords(c) ?? "You know someone here.",
    way: { kind: "know", person },
    // Never the reply note here: it says "I applied", and the member may not have. A note to the person, about what happened there.
    do: person.dm || !person.title ? "message" : "intro",
    title: "",
    line: "",
  };
  return { m, row };
}

/**
 * The note for asking someone to introduce the member. With a specific ask (lib/paths/intro.ts: the
 * companies in the member's own list this person can introduce them to, named where the member may
 * see them), the "introAsk" template names them, and the note goes into Your pipeline under the
 * first of them. Without one, the general "ask", and the sheet says so.
 */
export function askNote(p: IntroView, me: Me, plan: IntroPlanView | null = null): { m: Move; row: RadarRow; facts: NoteFacts; plan: IntroPlanView | null } {
  const person = knowOf(p);
  const org = p.org ?? "their firm";
  const top = plan?.ask ? plan.targets.find((t) => t.name === plan.ask!.lines[0].company) ?? null : null;
  const m: Move = {
    // The pipeline entry it opens: the company the intro is for, when it is a specific one.
    id: top?.id ?? p.companyId ?? p.key,
    name: org,
    hidden: false,
    facts: "",
    hiring: false,
    open: null,
    band: null,
    why: p.opens,
    way: { kind: "know", person },
    do: "intro",
    title: "",
    line: "",
  };
  const fn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  const facts: NoteFacts = {
    kind: top ? "introAsk" : "ask",
    company: top?.name ?? org,
    to: { name: p.name, email: p.email, from: p.email ? "your own contacts" : null },
    since: null,
    saw: null,
    me: { first: firstOf(me.name), name: me.name, as: myWords(me.title, me.function), fn, clients: clientKinds(me.icp) },
    seat: null,
    role: null,
    link: null,
    via: p.kind,
    ...(top && plan?.ask ? { intro: plan.ask } : {}),
  };
  return { m, row: { id: m.id, kinds: [], lines: [] }, facts, plan };
}

/** A sheet open: the move, and for a person, their specific ask (or null: the note asks generally) and how strong the relationship is. */
type Drafting = { m: Move; row: RadarRow; facts?: NoteFacts; plan?: IntroPlanView | null; strength?: string | null } | null;

function Note({ d, me, onClose, onClaude }: { d: Drafting; me: Me; onClose: () => void; onClaude: () => void }) {
  if (!d) return null;
  // The note used, or marked sent: the company goes into Your pipeline (lib/pipeline.ts); an ask for an intro is recorded as one.
  const sent = () => {
    const p = d.m.way.kind === "know" ? d.m.way.person : null;
    const intro = d.m.do === "intro" || d.facts?.kind === "ask";
    void pipelineAct({ type: "pipeline.sent", companyId: d.m.id, from: "network", intro, ...(p ? { to: { name: p.name, role: p.title, google: p.google } } : {}) });
  };
  const first = d.m.way.kind === "know" ? firstOf(d.m.way.person.name) : "them";
  return (
    <NoteSheet
      key={d.m.id + (d.facts?.to?.name ?? "")}
      m={d.m}
      row={d.row}
      me={me}
      facts={d.facts ?? null}
      intro={d.plan !== undefined ? { plan: d.plan ?? null, first, strength: d.strength ?? null } : null}
      sentLabel="Mark as sent"
      onClose={onClose}
      onUsed={sent}
      onSent={() => (sent(), onClose())}
      onClaude={() => (onClose(), onClaude())}
    />
  );
}

/* ---------- 1. warm paths ---------- */

const BAND_WORD = { High: "High", Medium: "Medium", Low: "Low" } as const;

function WarmRow({ c, info, onNote, onOpen }: { c: NetCompanyView; info: CoInfo | undefined; onNote: (p: NetPersonView, plan: IntroPlanView | null) => void; onOpen: () => void }) {
  const p = bestPerson(c);
  const plan = usePlan(p ? `g:${p.key}` : null);
  const fit = fitWords(c);
  const likely = c.odds && c.odds.score > 0 ? c.odds : null;
  return (
    <li className="np-row" data-warm={c.id}>
      <div className="np-co">
        <CompanyLogo name={c.name} domain={info?.c.iconDomain ?? info?.domain ?? c.site} size="md" />
        <div className="np-co-t">
          <button type="button" className="np-co-name" onClick={onOpen}>
            {c.name}
          </button>
          {likely && (
            <span className="np-why">
              <Chip tone={LIKELIHOOD_TONE[likely.band]} className="rd-band">
                {BAND_WORD[likely.band]}
              </Chip>{" "}
              {likely.why}
            </span>
          )}
          {(fit || c.ball) && <span className="np-fit">{[fit, c.ball ? "In your Crystal Ball" : null].filter(Boolean).join(" · ")}</span>}
        </div>
      </div>
      {p ? (
        <div className="np-person">
          <span className="np-av" aria-hidden>
            {initials(p.name ?? "")}
          </span>
          <span className="np-p-t">
            <span className="np-p-name">
              {p.name}
              {p.title ? `, ${p.title}` : ""}
              {p.dm && <span className="nw-dm"> · Decision maker</span>}
            </span>
            <span className="np-p-why">
              <WarmthChip w={p.warmth} strength /> {besideChip(strengthLine(p), p.warmth)}
            </span>
            <IntroLine plan={plan} first={firstOf(p.name ?? "")} />
          </span>
        </div>
      ) : (
        <p className="nw-muted np-noone">Nobody named there in your contacts. {c.touch}.</p>
      )}
      <div className="np-acts">
        {p ? (
          <button type="button" className="btn btn-sm" onClick={() => onNote(p, plan)}>
            Draft a note to {firstOf(p.name ?? "")}
          </button>
        ) : null}
        <button type="button" className={`btn btn-sm${p ? " btn-ghost" : ""}`} onClick={onOpen}>
          Open the record
        </button>
      </div>
    </li>
  );
}

export function WarmPaths({ view, infos, me, openCompany, onProfile, onClaude, onEveryone }: { view: NetworkView; infos: CoInfo[]; me: Me; openCompany: (id: string) => void; onProfile: () => void; onClaude: () => void; onEveryone: () => void }) {
  const [f, setF] = useState<WarmFilter>("all");
  const [more, setMore] = useState(false);
  const [d, setD] = useState<Drafting>(null);
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  const all = warmRows(view, "all");
  const rows = warmRows(view, f);
  const shown = more ? rows : rows.slice(0, 10);
  const fn = namedFn(view.fn);
  const chips: { k: WarmFilter; label: string; n: number }[] = [
    { k: "all", label: "All", n: all.length },
    { k: "likely", label: fn ? `Likely to hire ${fn}` : "Likely to hire", n: warmRows(view, "likely").length },
    { k: "fit", label: "Fit your profile", n: warmRows(view, "fit").length },
    { k: "ball", label: "In your Crystal Ball", n: warmRows(view, "ball").length },
  ];
  const noProfile = view.companies.every((c) => c.fit === null);
  return (
    <section className="np-sec" id="nw-warm" aria-labelledby="nw-warm-h">
      <div className="np-sec-h">
        <h2 className="nw-h2" id="nw-warm-h">
          Warm paths into companies likely to hire you <span className="num np-n">{all.length}</span>
        </h2>
        <p className="nw-muted">
          Companies where you know someone that {noProfile ? "" : "fit your profile or "}are likely to hire a fractional {fn ?? "leader like you"}, scored with your Crystal Ball&apos;s
          likelihood. Best first.
        </p>
      </div>
      {all.length > 0 ? (
        <>
          <div className="np-chips" role="group" aria-label="Show">
            {chips.map((x) => (
              <button key={x.k} type="button" className={`chip rd-day${f === x.k ? " chip-on" : ""}`} aria-pressed={f === x.k} disabled={!x.n && x.k !== "all"} onClick={() => (setF(x.k), setMore(false))}>
                {x.label} <span className="num rd-day-n">{x.n}</span>
              </button>
            ))}
          </div>
          <ul className="np-list" aria-label="Warm paths, best first">
            {shown.map((c) => (
              <WarmRow key={c.id} c={c} info={byId.get(c.id)} onOpen={() => openCompany(c.id)} onNote={(p, plan) => setD({ ...warmNote(c, p), plan, strength: strengthLine(p) })} />
            ))}
          </ul>
          {rows.length > shown.length && (
            <button type="button" className="btn btn-ghost nw-more" onClick={() => setMore(true)}>
              Show all {rows.length}
            </button>
          )}
        </>
      ) : (
        <div className="np-empty" role="status">
          <p className="nw-body">
            {!fn
              ? "Tell Merlin your function and it shows which of the companies you know are likely to hire you."
              : noProfile
                ? `None of the companies you know shows a sign of hiring a fractional ${fn} yet, and you have no profile to match them against.`
                : `None of the companies you know fits your profile or shows a sign of hiring a fractional ${fn} yet. Merlin reads your calendar again every day.`}
          </p>
          <div className="nw-row nw-wrap">
            {!fn || noProfile ? (
              <button type="button" className="btn btn-sm btn-pine" onClick={onProfile}>
                {fn ? "Set your profile" : "Tell Merlin your function"}
              </button>
            ) : null}
            <button type="button" className="btn btn-sm" onClick={onEveryone}>
              See everyone you know
            </button>
          </div>
        </div>
      )}
      <Note d={d} me={me} onClose={() => setD(null)} onClaude={onClaude} />
    </section>
  );
}

/* ---------- 2. your clients ---------- */

const REL_GUESS = (p: NetPersonView) => (p.dm ? "Reported to" : "Worked with");
const RELS = ["Reported to", "Decision maker", "Worked with", "Hiring for the seat", "Reported to me"];
const relWords = (x: string) => (x === "Reported to" ? "who you report to" : x === "Reported to me" ? "who reports to you" : x.toLowerCase());

/**
 * What "Your seat"'s Add would earn for someone from the member's meetings, said before the tap:
 * a new person earns for their name, title and how they relate to the seat; someone already on
 * file there (lib/table.ts onFileAt) only for what that record is missing, and the Add confirms
 * their name. Null: nothing to add (the member added or confirmed them already, with nothing missing).
 */
export function offerOf(p: NetPersonView): { onFile: boolean; credits: number; rel: boolean } | null {
  const f = p.onFile;
  if (!f) return { onFile: false, credits: 2 + (p.title ? 1 : 0), rel: true };
  if (f.mine) return null;
  const credits = (f.empty.includes("relationship") ? 1 : 0) + (p.title && f.empty.includes("title") ? 1 : 0);
  if (f.confirmed && !credits) return null;
  return { onFile: true, credits, rel: f.empty.includes("relationship") };
}

/** The people "Your seat" offers: from the member's meetings there, not hidden, not already on the record by a name they can see, and with something to add. */
export function seatOffers(c: NetCompanyView, onRecord: Set<string>, gone: Set<string>): NetPersonView[] {
  return c.people.filter((p) => !p.hidden && !!p.name && p.meetings > 0 && !onRecord.has(p.name.toLowerCase()) && !gone.has(p.key) && !!offerOf(p)).slice(0, 3);
}

function ClientCard({ c, info, guess, me }: { c: NetCompanyView; info: CoInfo | undefined; guess: SeatGuessView | undefined; me: Me }) {
  const ui = useUi();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rels, setRels] = useState<Record<string, string>>({});
  // What the member added from this card in this visit: it leaves the list at once, so nothing can be added twice while the answers come back.
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const k = c.client!;
  const fn = namedFn(me.function);
  const room = earnRoom(ui.me);
  const plus = (n: number) => (room > 0 ? `+${Math.min(n, room)} ${Math.min(n, room) === 1 ? "credit" : "credits"}` : "no credit today");
  const seat = k.seat ? info?.engs.find((e) => e.id === k.seat) : undefined;
  const onRecord = new Set((info?.people ?? []).map(({ p }) => (p.cells.name?.s === "value" ? String(p.cells.name.v ?? "").toLowerCase() : "")).filter(Boolean));
  const offers = k.seat ? seatOffers(c, onRecord, gone) : [];
  const startEmpty = !!seat && (!seat.cells.start || seat.cells.start.s === "empty") && !gone.has("start");
  // The action's own answer brings the record as it now is; the network is read again for the next suggestions. Nothing else reloads.
  const run = async (key: string, a: Parameters<typeof ui.act>[0]) => {
    setBusy(key);
    const r = await ui.act(a, { quiet: true });
    setBusy(null);
    if (r.ok) {
      setGone((g) => new Set(g).add(key));
      toast(r.message || "Added.");
      void load(true);
    }
  };
  const confirm = () => {
    const g: SeatGuessView = guess ?? {
      id: c.id, name: c.name, site: c.site, from: k.from, to: k.to, meetings: k.meetings, months: k.months, sure: true, with: [], function: me.function, role: null, active: true, waits: false, claim: null,
    };
    // The seat Revenue Nomad already found there (g.claim) is claimed, never added again beside it.
    void run("confirm", { type: "add", company: c.name, newEngagement: true, ...(g.claim ? { engagementId: g.claim } : {}), engagementFields: seatConfirmFields({ ...g, active: true }, me.name, g.role), operatorMemberId: "me" });
  };
  return (
    <li className="np-client" data-client={c.id}>
      <div className="np-co">
        <CompanyLogo name={c.name} domain={info?.c.iconDomain ?? info?.domain ?? c.site} size="md" />
        <div className="np-co-t">
          <span className="np-co-name np-co-static">{c.name}</span>
          <span className="np-why num">
            Since {monthYear(k.from)} · {c.touch}
          </span>
        </div>
        <span className={`chip ${k.seat ? "chip-volt" : "chip-outline"} np-tag`}>{k.seat ? "Your seat" : "Looks like a client"}</span>
      </div>
      {!k.seat ? (
        <>
          <p className="nw-body np-client-p">
            Regular meetings for {k.months} months, still going. If it is a fractional seat you hold, confirm it: Merlin {guess?.claim ? "puts your name on the seat it already has there" : "adds it to Your seats"} as an active {fn ? `${fn} ` : ""}seat from {monthYear(k.from)}.
          </p>
          <div className="np-acts">
            <button type="button" className="btn btn-sm" disabled={!!busy || gone.has("confirm")} aria-busy={busy === "confirm"} onClick={confirm}>
              {busy === "confirm" ? "Adding" : "Confirm this seat"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={!!busy}
              onClick={async () => {
                setBusy("no");
                const r = await netAct("not-a-seat", { company: c.id });
                setBusy(null);
                toast(r.error ?? "Got it. It stays in your network, not in Your clients.", !!r.error);
              }}
            >
              Not a seat
            </button>
          </div>
        </>
      ) : startEmpty || offers.length ? (
        <div className="np-offers">
          <p className="nw-muted">From your meetings there. Each one goes on your seat only when you add it.</p>
          <ul>
            {startEmpty && (
              <li className="np-offer" data-offer="start">
                <span className="np-offer-who">
                  <b>Started {monthYear(k.from)}</b>
                  <span className="nw-muted">Your first meeting there</span>
                </span>
                <span className="np-offer-do">
                  <span className="sg-plus num">{plus(1)}</span>
                  <button type="button" className="btn btn-sm" disabled={!!busy} aria-busy={busy === "start"} onClick={() => void run("start", { type: "fill", entity: "engagement", id: k.seat!, field: "start", value: k.from })}>
                    Add
                  </button>
                </span>
              </li>
            )}
            {offers.map((p) => {
              const o = offerOf(p)!;
              const rel = rels[p.key] ?? REL_GUESS(p);
              return (
                <li key={p.key} className="np-offer" data-offer={p.key} data-onfile={o.onFile ? "1" : undefined}>
                  <span className="np-offer-who">
                    <b>{p.name}</b>
                    <span className="nw-muted">{[p.title, o.onFile ? "On file" : null].filter(Boolean).join(" · ") || "From your meetings"}</span>
                  </span>
                  <span className="np-offer-do">
                    {o.rel && (
                      <select className="np-sel" value={rel} aria-label={`How ${p.name} relates to your seat`} onChange={(e) => setRels((r) => ({ ...r, [p.key]: e.target.value }))}>
                        {RELS.map((x) => (
                          <option key={x} value={x}>
                            {relWords(x)}
                          </option>
                        ))}
                      </select>
                    )}
                    {o.credits > 0 ? <span className="sg-plus num">{plus(o.credits)}</span> : <span className="np-offer-none">Confirms their name</span>}
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!!busy}
                      aria-busy={busy === p.key}
                      aria-label={`${o.onFile ? "Confirm" : "Add"} ${p.name} on your seat`}
                      onClick={() => void run(p.key, { type: "addPerson", companyId: c.id, engagementId: k.seat, person: { name: p.name!, ...(p.title ? { title: p.title } : {}), relationship: rel } })}
                    >
                      {o.onFile ? "Confirm" : "Add"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="nw-muted np-client-p">Your seat here has what your meetings can add.</p>
      )}
    </li>
  );
}

export function Clients({ view, infos, me }: { view: NetworkView; infos: CoInfo[]; me: Me }) {
  const rows = clientRows(view);
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  const guesses = new Map(view.seats.map((g) => [g.id, g]));
  return (
    <section className="np-sec" id="nw-clients" aria-labelledby="nw-clients-h">
      <div className="np-sec-h">
        <h2 className="nw-h2" id="nw-clients-h">
          Your clients <span className="num np-n">{rows.length}</span>
        </h2>
        <p className="nw-muted">Seats your calendar shows now: regular meetings over months that are still going, and your own seats on Merlin.</p>
      </div>
      {rows.length ? (
        <ul className="np-list">
          {rows.map((c) => (
            <ClientCard key={c.id} c={c} info={byId.get(c.id)} guess={guesses.get(c.id)} me={me} />
          ))}
        </ul>
      ) : (
        <p className="nw-body np-empty">Your calendar shows no regular meetings with one company over the last few months, so there is no client to confirm here.</p>
      )}
    </section>
  );
}

/* ---------- 3. people who can introduce you ---------- */

/** One person who can introduce the member: how strong the relationship is, who they can introduce them to, and the ask (specific when Merlin knows who). */
function IntroRow({ p, me, strength, onDraft }: { p: IntroView; me: Me; strength: string; onDraft: (d: Drafting) => void }) {
  const plan = usePlan(`g:${p.key}`);
  const first = firstOf(p.name);
  const specific = !!plan?.ask;
  return (
    <li className="np-row np-intro" data-intro-key={p.key} data-specific={specific ? "1" : "0"}>
      <div className="np-person">
        <span className="np-av" aria-hidden>
          {initials(p.name)}
        </span>
        <span className="np-p-t">
          <span className="np-p-name">
            {p.name} <span className="chip chip-outline np-kind">{p.kind === "investor" ? "Investor" : "Fractional"}</span>
          </span>
          <span className="nw-muted">{introWho(p)}</span>
          <span className="np-p-why">
            <WarmthChip w={p.warmth} strength /> {besideChip(strength, p.warmth)}
          </span>
          {plan?.count ? <IntroLine plan={plan} first={first} /> : <span className="np-opens">{p.opens}</span>}
        </span>
      </div>
      <div className="np-acts">
        <button type="button" className="btn btn-sm" onClick={() => onDraft({ ...askNote(p, me, plan), strength })}>
          {specific ? `Ask ${first} about ${plan!.ask!.lines[0].company}` : `Ask ${first} for an intro`}
        </button>
      </div>
    </li>
  );
}

export function Introducers({ view, me, onClaude }: { view: NetworkView; me: Me; onClaude: () => void }) {
  const [d, setD] = useState<Drafting>(null);
  const [more, setMore] = useState(false);
  const rows = more ? view.intros : view.intros.slice(0, 8);
  // How strong each relationship is, from the member's own counts where Your network has them.
  const people = useMemo(() => new Map(view.companies.flatMap((c) => c.people.map((x) => [x.key, x] as const))), [view]);
  const strengthOf = (p: IntroView) => {
    const x = people.get(p.key);
    return x ? strengthLine(x) : `${p.why} · ${STRENGTH_WORDS[p.warmth]}`;
  };
  return (
    <section className="np-sec" id="nw-intros" aria-labelledby="nw-intros-h">
      <div className="np-sec-h">
        <h2 className="nw-h2" id="nw-intros-h">
          People who can introduce you <span className="num np-n">{view.intros.length}</span>
        </h2>
        <p className="nw-muted">
          Investors and other fractionals you know, by the titles in your contacts and the firms on Merlin. Merlin doesn&apos;t know who they know, or who sits on which board, so it never guesses: ask them.
        </p>
      </div>
      {rows.length ? (
        <ul className="np-list">
          {rows.map((p) => (
            <IntroRow key={p.key} p={p} me={me} strength={strengthOf(p)} onDraft={setD} />
          ))}
        </ul>
      ) : (
        <p className="nw-body np-empty">Nobody in your network reads as an investor or another fractional yet. Merlin goes by the titles on your saved contacts and the investors on Merlin.</p>
      )}
      {view.intros.length > rows.length && (
        <button type="button" className="btn btn-ghost nw-more" onClick={() => setMore(true)}>
          Show all {view.intros.length}
        </button>
      )}
      <Note d={d} me={me} onClose={() => setD(null)} onClaude={onClaude} />
    </section>
  );
}

/* ---------- 4. everyone ---------- */

function NotRel({ label, onPick, busy }: { label: string; onPick: (as: NotRelWhy) => void; busy: boolean }) {
  return (
    <label className="np-notrel">
      <span className="sr-only">{label}</span>
      <select
        className="np-sel np-sel-btn"
        value=""
        disabled={busy}
        aria-label={label}
        onChange={(e) => {
          const v = e.target.value as NotRelWhy;
          if (v) onPick(v);
        }}
      >
        <option value="">Not a relationship…</option>
        {NOT_REL.map((x) => (
          <option key={x} value={x}>
            {NOT_REL_WORDS[x]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Everyone({ view, openCompany, filter, setFilter }: { view: NetworkView; openCompany: (id: string) => void; filter: EveryoneFilter; setFilter: (f: EveryoneFilter) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  const list = everyone(view, filter);
  const people = list.companies.reduce((a, x) => a + x.people.length, 0) + list.loose.length;
  const mark = async (key: string, body: Record<string, string>, undo?: Record<string, string>) => {
    setBusy(key);
    const r = await netAct("mark", body);
    setBusy(null);
    if (r.error) return toast(r.error, true);
    toast(r.message ?? "Done.", false, undo ? { action: { label: "Undo", onClick: () => void netAct("mark", undo) } } : undefined);
  };
  const set = (p: Partial<EveryoneFilter>) => (setFilter({ ...filter, ...p }), setLimit(25));
  const W: (Warmth | "any")[] = ["any", "Hot", "Warm", "Fading", "Cold"];
  return (
    <section className="np-sec" id="nw-everyone" aria-labelledby="nw-everyone-h">
      <div className="np-sec-h">
        <h2 className="nw-h2" id="nw-everyone-h">
          Everyone you know <span className="num np-n">{people}</span>
        </h2>
        <p className="nw-muted">
          {filter.hidden
            ? "What is set aside: people selling to you, recruiters, investors (they are under People who can introduce you), and what you said is not a relationship."
            : "Every person at a company on Merlin, and the people you really know at companies that aren't on it yet. Mark anyone who isn't a relationship: Merlin remembers it on every read."}
        </p>
      </div>
      <div className="np-filters">
        <input className="input np-q" type="search" placeholder="Search a name, a company, a title" aria-label="Search everyone you know" value={filter.q} onChange={(e) => set({ q: e.target.value })} />
        <div className="np-chips" role="group" aria-label="Warmth">
          {W.map((w) => (
            <button key={w} type="button" className={`chip rd-day${filter.warmth === w ? " chip-on" : ""}`} aria-pressed={filter.warmth === w} onClick={() => set({ warmth: w })}>
              {w === "any" ? "Any warmth" : w}
            </button>
          ))}
        </div>
        <div className="np-chips" role="group" aria-label="Profile and size">
          {(["any", "fits", "no"] as const).map((x) => (
            <button key={x} type="button" className={`chip rd-day${filter.fit === x ? " chip-on" : ""}`} aria-pressed={filter.fit === x} onClick={() => set({ fit: x })}>
              {x === "any" ? "Any fit" : x === "fits" ? "Fits your profile" : "Outside your profile"}
            </button>
          ))}
          <select className="np-sel" aria-label="Company size" value={filter.size} onChange={(e) => set({ size: e.target.value })}>
            <option value="any">Any size</option>
            {SIZE_GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label} people
              </option>
            ))}
          </select>
          <button type="button" className={`chip rd-day${filter.hidden ? " chip-on" : ""}`} aria-pressed={filter.hidden} onClick={() => set({ hidden: !filter.hidden })}>
            Set aside
          </button>
        </div>
      </div>
      <ul className="np-list np-every">
        {list.companies.slice(0, limit).map(({ c, people: ps }) => (
          <li key={c.id} className="np-every-co" data-company={c.id}>
            <div className="np-co">
              <span className="nw-ini" aria-hidden>
                {initials(c.name)}
              </span>
              <div className="np-co-t">
                <button type="button" className="np-co-name" onClick={() => openCompany(c.id)}>
                  {c.name}
                </button>
                <span className="np-why">
                  {[c.industry, c.employees ? `${c.employees} people` : null].filter(Boolean).join(" · ")}
                  {c.fit ? " · fits your profile" : ""}
                </span>
              </div>
              <WarmthChip w={c.warmth} />
            </div>
            {c.set ? (
              <p className="np-set" role="note">
                <span>{setWords(c)}</span>{" "}
                <button
                  type="button"
                  className="nw-link"
                  disabled={busy === c.id}
                  onClick={() => void mark(c.id, { company: c.id, as: c.set!.by === "merlin" ? "rel" : "undo" }, { company: c.id, as: "undo" })}
                >
                  {c.set.by === "merlin" ? `Undo: it is a relationship` : "Undo"}
                </button>
              </p>
            ) : (
              <div className="np-co-acts">
                <span className="nw-muted">{c.touch}</span>
                <NotRel label={`${c.name} is not a relationship`} busy={busy === c.id} onPick={(as) => void mark(c.id, { company: c.id, as }, { company: c.id, as: "undo" })} />
              </div>
            )}
            {ps.length > 0 && (
              <ul className="np-people">
                {ps.map((p) => (
                  <li key={p.key}>
                    <span className="np-p-t">
                      <span className="np-p-name">
                        {p.name ?? p.email ?? "Someone"}
                        {p.title ? `, ${p.title}` : ""}
                        {p.seat ? ` · ${p.seat.now ? "holds" : "held"} their ${p.seat.fn && p.seat.fn !== "Other" ? `${p.seat.fn} ` : ""}seat` : ""}
                      </span>
                      <span className="np-p-why">
                        <WarmthChip w={p.warmth} /> {p.why}
                      </span>
                    </span>
                    {p.hidden ? (
                      <button type="button" className="nw-link" disabled={busy === p.key} onClick={() => void mark(p.key, { person: p.key, as: "undo" })}>
                        Undo
                      </button>
                    ) : !c.set ? (
                      <button type="button" className="nw-link np-hide" disabled={busy === p.key} onClick={() => void mark(p.key, { person: p.key, as: "other" }, { person: p.key, as: "undo" })}>
                        Not a relationship
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {list.companies.length > limit && (
        <button type="button" className="btn btn-ghost nw-more" onClick={() => setLimit((x) => x + 50)}>
          Show more companies ({list.companies.length - limit} left)
        </button>
      )}
      {list.loose.length > 0 && (
        <>
          <h3 className="np-h3">At companies not on Merlin yet</h3>
          <ul className="np-list np-people np-loose">
            {list.loose.map((p) => (
              <li key={p.key} data-person={p.key}>
                <span className="np-p-t">
                  <span className="np-p-name">
                    {p.name ?? p.email}
                    {p.title ? `, ${p.title}` : ""}
                  </span>
                  <span className="nw-muted">{p.org ?? (p.domain ? p.domain : "Personal email")}</span>
                  <span className="np-p-why">
                    <WarmthChip w={p.warmth} /> {p.why}
                  </span>
                </span>
                {p.hidden ? (
                  <button type="button" className="nw-link" disabled={busy === p.key} onClick={() => void mark(p.key, { person: p.key, as: "undo" })}>
                    Undo
                  </button>
                ) : (
                  <button type="button" className="nw-link np-hide" disabled={busy === p.key} onClick={() => void mark(p.key, { person: p.key, as: "other" }, { person: p.key, as: "undo" })}>
                    Not a relationship
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {!list.companies.length && !list.loose.length && <p className="nw-body np-empty">{filter.hidden ? "Nothing is set aside." : "Nobody matches. Clear the search or a filter."}</p>}
    </section>
  );
}

/* ---------- the four numbers ---------- */

export function TopNumbers({ n, go }: { n: { warm: number; clients: number; intros: number; people: number }; go: (id: string) => void }) {
  const items: [string, number, string, string][] = [
    ["nw-warm", n.warm, n.warm === 1 ? "warm path into a company likely to hire you" : "warm paths into companies likely to hire you", "warm"],
    ["nw-clients", n.clients, n.clients === 1 ? "client your calendar shows" : "clients your calendar shows", "clients"],
    ["nw-intros", n.intros, n.intros === 1 ? "person who can introduce you" : "people who can introduce you", "intros"],
    ["nw-everyone", n.people, n.people === 1 ? "person you know, searchable" : "people you know, searchable", "people"],
  ];
  return (
    <nav className="nw-stats np-stats" aria-label="Your network">
      {items.map(([id, v, label, k], i) => (
        <button key={id} type="button" className={`nw-stat nw-stat-b${i === 0 ? " nw-stat-pine" : ""}`} data-n={k} onClick={() => go(id)}>
          <span className="nw-stat-n num">{v}</span>
          <span className="nw-stat-l">{label}</span>
          <span className="nw-stat-go">
            See {v === 1 ? "it" : "them"} <IconChevron dir="right" size={12} />
          </span>
        </button>
      ))}
    </nav>
  );
}

export { NO_FILTER };
