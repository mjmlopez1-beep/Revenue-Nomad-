"use client";

/**
 * The company record as a full page (Company.dc.html), in the new look on wider screens: opened
 * from Companies, Find, Crystal Ball, Home and any old /?c=<id> address. Phones, and the old look
 * (RN_UI2 off), keep the record drawer (Drawer.tsx), which draws the same sections
 * (company/sections/).
 *
 *   header      Companies / name, "3 of 64" with the previous and next (K, J), the bell, credits, Add
 *   head        the name (or "Locked company"), Hiring now, the fit, the free facts, the website and
 *               the public company page, Follow, the stage, Unlock all, and the one primary action
 *   locked      what is free, what opens with the company and what it costs (free on the trial),
 *               and one button to open it
 *   tabs        Overview, Seats, People, Ways in, Open roles, Notes and activity, Deal
 *   right       the next move, Closest evidence (Close only, Evidence Bank's case most like it), Add what you
 *               know here with what it earns
 *
 * Never a locked company's name, website, logo or people: everything here reads the record as
 * the member's table has it (CoInfo), where the server already left them out.
 *
 * Focus and Esc: the page takes focus at its title when it opens (and when J or K step to the
 * next one); Esc closes what is open inside it first (the person, a form, the spend question, a
 * note being changed), then the page, and focus goes back to the row it was opened from. The tabs
 * are a tab list: Left and Right move between them, Home and End go to the ends.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Benchmarks, EngagementRec, PersonRec } from "@/lib/tableTypes";
import type { KnownPersonView } from "@/lib/paths/types";
import { FOUND_NOTE, COMPANY_PRICE_SAY, PRO_OPENS_DAILY } from "@/lib/tableFields";
import { CompanyLogo, IconChevron, IconExternal, hrefFor, post, val } from "../../ui/shared";
import { COMPANY_GTM, fitReason, fnGap, namedFn, shown, type CoInfo, type SeatInfo } from "../model";
import { Pro, useUi } from "../ui";
import { Fit } from "../Tables";
import { plural, useMedia } from "../hooks";
import { CrystalOpen } from "../CrystalOpen";
import { RecordWays } from "../network/Ways";
import { SmartWaysIn } from "../network/SmartPaths";
import { Charge } from "../Charge";
import { PipelineBlock } from "../PipelineBlock";
import { WriteProposal } from "../WriteProposal";
import { usePipeline } from "../pipelineStore";
import { ownClick } from "../shell/Rail";
import type { Crumb } from "../shell/Header";
import { useAppMaybe } from "../shell/pages";
import { LeadsLine } from "./sections/Leads";
import { UnlockAll, UnlockCompany } from "./sections/Unlock";
import { YourWayIn, wayInSeatsOf } from "./sections/WayIn";
import {
  AboutSection, CapLine, DetailsSection, FollowButton, FunctionsSection, GtmSection, OpenPosting, PeerSection, PeopleSection, RecordEnvProvider, RecordFoot, SeatsSection, recordEnv, recordPlan, summaryLine,
} from "./sections/Record";
import { COMPANY_ROWS, type Contact } from "./sections/env";
import { AddHere, Activity, DealWorth, EvidenceCard, NextMove, Notes, PeopleTable, RolesNote, RolesTable, SeatTable, StagePicker, Timeline, factsLine } from "./parts";
import { PersonBubble, PersonNameButton, useKnownByRecord } from "../PersonBubble";
import { TAB_NAME, TABS, dealOf, filledOf, isListedRole, isOpenRole, nextMoveOf, primaryFor, stageWord, tabFor, type TabKey } from "./companyModel";
import "./company.css";

/** What the page hands the person bubble when a name in Who decides here is chosen. */
export interface BubbleProps {
  i: CoInfo;
  p: PersonRec;
  e: EngagementRec | null;
  /** The name that opened it: focus goes back there when it closes. */
  anchor: HTMLElement;
  onClose: () => void;
  /** See the way in (the Ways in tab). */
  onWays: () => void;
  /** Their full card, below the table (confirm, report, add a detail). */
  onCard: () => void;
  /** The deal's stage here ("Talking"), or null, and the Deal tab. */
  stage: string | null;
  onDeal: () => void;
}

export interface CompanyRecordProps {
  i: CoInfo;
  /** A seat or a person to open at (its tab). */
  focus: string | null;
  /** Its place in the list it was opened from ("3 of 64"), or null. */
  pos: { n: number; of: number } | null;
  onClose: () => void;
  onStep: (d: 1 | -1) => void;
  /** Opened from Crystal Ball (or Home's card) at a company it lists: a locked company opens as it does there. */
  crystal?: boolean;
  /** The breadcrumb before the company's name (Companies, or Crystal Ball, Home). */
  crumbs: Crumb[];
  /** The member's first visit to a company page (they have opened none yet): the strip and the Example note. */
  first?: boolean;
  benchmarks?: Benchmarks;
  mySeats?: SeatInfo[];
  contact?: Contact | null;
  /** The header's right side (bell, credits, Add what you know). */
  actions?: ReactNode;
  /** The person bubble (app/post/PersonBubble.tsx), handed in by CompanyPage. Without one a name opens nothing. */
  bubble?: (o: BubbleProps) => ReactNode;
  /** How the member knows a person on file (their own sources), for Who decides here. */
  knownOf?: (p: PersonRec) => KnownPersonView | null;
  /** The tab to open at, in place of the one `focus` picks. */
  startTab?: TabKey;
  /** The "what this page is for" strip is dismissed, and dismissing it. */
  stripOff?: boolean;
  onStripOff?: () => void;
}

/** The fit words for "Why it fits you": the seats on file, the gap in the member's function, and who leads it. */
function whyFits(i: CoInfo, mine: string | null): string {
  const bits = [fitReason(i).replace(/\.$/, "")];
  const fg = fnGap(i, mine);
  const fn = namedFn(mine);
  if (fg.gap && fn) bits.push(fg.led ? `a full-time ${fn} leader is on file, and no fractional ${fn} seat` : `no fractional ${fn} seat is on file, so that gap is your function`);
  else if (fn && i.fns.includes(fn)) bits.push(`they hired in your function before`);
  return `${bits.map((b) => b.replace(/^./, (x) => x.toUpperCase())).join(". ")}.`;
}

export function CompanyRecord(props: CompanyRecordProps) {
  const { i, focus, pos, onClose, onStep, crystal, crumbs, first = false, benchmarks, mySeats, contact, actions, bubble, knownOf, startTab, stripOff, onStripOff } = props;
  const ui = useUi();
  const app = useAppMaybe();
  const c = i.c;
  const coarse = useMedia("(hover: none) and (pointer: coarse)");
  const env = recordEnv(i, { touch: coarse, phone: false, contact: contact ?? ui.contact ?? null });
  const fromBall = !!crystal && (ui.me.crystal === "all" || ui.me.crystal === "one");
  const [tab, setTab] = useState<TabKey>(() => startTab ?? tabFor(i, focus));
  const [peek, setPeek] = useState<{ p: PersonRec; e: EngagementRec | null; el: HTMLElement } | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [cardOf, setCardOf] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  // Opened while locked: once it opens, the strip says what changed (Step 4). Per company (J and K step to another).
  const lockedAt = useRef({ id: c.id, locked: !!c.hidden });
  if (lockedAt.current.id !== c.id) lockedAt.current = { id: c.id, locked: !!c.hidden };
  const wasLocked = lockedAt.current.locked;
  const { view: pv } = usePipeline();
  const deal = dealOf(pv?.entries, c.id);
  const due = deal ? pv?.due.find((f) => f.id === deal.id)?.line ?? null : null;
  const { plan, posting, postedRate, hiringHere } = recordPlan(i, focus);
  const mine = ui.me.function;

  // A locked company's page opened: counted for Pilot metrics' demand (once a member, company and day; counts only).
  useEffect(() => {
    if (c.hidden && !c.found) void post({ action: { type: "lockedView", companyId: c.id } });
  }, [c.id, c.hidden, c.found]);

  // Opening a company (or stepping to the next with J or K): its tab, the top of the page, and focus on its title.
  useEffect(() => {
    setTab(tabFor(i, focus));
    setPeek(null);
    setDetails(null);
    window.scrollTo?.(0, 0);
    const h = rootRef.current?.querySelector<HTMLElement>("h1.co-name-h");
    const a = document.activeElement;
    // A field the member is typing in keeps the cursor; anything else, the new company's title.
    if (h && !a?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) h.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, focus]);

  // Opened here (Unlock company, Crystal Ball's open): the button that was pressed is gone, so focus goes to the title.
  useEffect(() => {
    if (c.hidden) return;
    const a = document.activeElement;
    if (!a || a === document.body) rootRef.current?.querySelector<HTMLElement>("h1.co-name-h")?.focus({ preventScroll: true });
  }, [c.hidden]);

  // Closed: focus goes back to the row it was opened from (Esc, the breadcrumb), unless the member put it somewhere on purpose.
  const last = useRef({ focus, id: c.id });
  last.current = { focus, id: c.id };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      const { focus: f, id } = last.current;
      // The list draws again in place of the page, sometimes a moment later (a deferred list): try for a second.
      let tries = 0;
      const back = () => {
        const a = document.activeElement;
        const kept = !!a && a !== document.body && a.isConnected && !!a.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], .tp-modal, .tp-sheet, h1");
        if (kept) return;
        const row = (f && document.querySelector<HTMLElement>(`[data-row="${CSS.escape(f)}"]`)) || document.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`);
        const el = row && row.tabIndex >= 0 ? row : opener?.isConnected && !opener.closest(".co-page") ? opener : null;
        if (el) return el.focus();
        if (++tries < 8) setTimeout(back, 120);
      };
      setTimeout(back);
    };
  }, []);

  const go = (k: TabKey) => {
    setTab(k);
    setPeek(null);
    requestAnimationFrame(() => tabRefs.current[k]?.focus({ preventScroll: true }));
  };
  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.indexOf(tab);
    const to = e.key === "ArrowRight" ? (at + 1) % TABS.length : e.key === "ArrowLeft" ? (at - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    go(TABS[to]);
  };
  const openPage = (p: Parameters<typeof ui.openPage>[0]) => ui.openPage(p);
  const prim = primaryFor(deal?.stage ?? null);
  const runGo = async (g: string) => {
    if (g === "ways") return go("ways");
    if (g === "proposals") return openPage("proposals");
    if (g === "seat") return ui.openAdd({ companyId: c.id, mode: "engagement" });
    if (g === "pipeline") return openPage("pipeline");
    if (g === "open") return rootRef.current?.querySelector<HTMLElement>(".co-gates .btn")?.focus();
    if (g === "add") return go("deal");
  };

  // The tabs' counts: seats, people, ways in, open roles, notes, and the deal's stage.
  const seatsN = i.engs.length;
  const peopleN = i.people.length;
  const rolesOpen = i.engs.filter(isOpenRole).length;
  const rolesN = i.engs.filter(isListedRole).length;
  const wayN = wayInSeatsOf(i, mine).length;
  const counts: Partial<Record<TabKey, string>> = {
    seats: seatsN ? String(seatsN) : "",
    people: peopleN ? String(peopleN) : "",
    ways: wayN ? String(wayN) : "",
    roles: rolesN ? String(rolesOpen || rolesN) : "",
    deal: deal ? stageWord(deal.stage) : "",
  };
  const freeOpen = !!ui.me.freeCompany || fromBall;
  const move = nextMoveOf(i, deal, { freeOpen, due });
  const closeOn = !ui.me.plan || ui.me.plan.tier === "close";
  const trial = ui.me.plan?.name === "trial";
  const opens = ui.me.proOpens;

  const website = val(c.cells.website);
  const linkedin = val(c.cells.linkedin);
  const site = website?.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  const line = summaryLine(i);
  const name = c.hidden ? "Locked company" : c.name;
  const stripShown = first && !stripOff;
  const opened = wasLocked && !c.hidden;

  const crumbsEl = (
    <nav aria-label="Breadcrumb" className="ws-crumbs">
      {crumbs.map((x) => (
        <span key={x.label} className="ws-crumb">
          {x.href ? (
            <a
              href={x.href}
              onClick={(e) => {
                if (!x.go || !ownClick(e)) return;
                e.preventDefault();
                x.go();
              }}
            >
              {x.label}
            </a>
          ) : (
            <span>{x.label}</span>
          )}
          <span className="ws-crumb-sep" aria-hidden>
            /
          </span>
        </span>
      ))}
      <strong className="ws-crumb-now" aria-current="page">
        {name}
      </strong>
    </nav>
  );

  const gates = c.hidden && (
    <section className="co-gates" aria-label="Open this company">
      <div className="co-gate">
        <span className="co-gate-h">
          <strong>Free, showing now</strong>
        </span>
        <ul>
          <li>Industry, size, revenue, HQ region</li>
          <li>Functions hired, and when</li>
          <li>Each seat&apos;s start, hours and why</li>
          <li>Open roles: title and date listed</li>
        </ul>
      </div>
      <div className="co-gate">
        <span className="co-gate-h">
          <strong>Opens with the company</strong>
          <span className="co-sub">{freeOpen ? `${COMPANY_PRICE_SAY} · free for you today` : COMPANY_PRICE_SAY}</span>
        </span>
        <ul>
          <li>Its name, website and logo</li>
          <li>Who held each seat, and their role</li>
          <li>Job postings, with rate and hours</li>
        </ul>
      </div>
      <div className="co-gate">
        <span className="co-gate-h">
          <strong>Still locked after that</strong>
          <span className="co-sub">1 credit each</span>
        </span>
        <ul>
          <li>A decision maker&apos;s name and title</li>
          <li>Their email, phone or profile link</li>
          <li>What a seat paid, how it was found</li>
          <li>The end date of a seat that ended</li>
        </ul>
      </div>
      <div className="co-gate-go tp-dactions">
        {fromBall ? <CrystalOpen id={c.id} name={c.shownName} /> : <UnlockCompany id={c.id} rate={postedRate} roles={hiringHere} />}
        <span className="co-sub">
          {freeOpen ? (
            <>
              <strong>{trial ? "Free on your trial." : "Free for you today."}</strong> It normally costs {COMPANY_PRICE_SAY}. Your {plural(ui.me.credits, "credit")} stay{ui.me.credits === 1 ? "s" : ""} as they are, and it stays open for you.
            </>
          ) : (
            <>It costs {COMPANY_PRICE_SAY}, once. It stays open for you, and who held each seat shows at no charge after that.</>
          )}
        </span>
      </div>
      <CapLine i={i} plan={plan} />
      <div className="pro-under">
        <Pro where="hidden_company" variant="line" />
      </div>
    </section>
  );

  const panel = (() => {
    switch (tab) {
      case "overview":
        return (
          <>
            <section className="co-card" aria-labelledby="co-fit-h">
              <h2 id="co-fit-h">Why it fits you</h2>
              <p>{whyFits(i, mine)}</p>
              <LeadsLine c={c} />
            </section>
            <FunctionsSection i={i} />
            <AboutSection i={i} />
            <div className="co-facts">
              <GtmSection i={i} head={<span className="co-th-f num"> · {filledOf(c.cells, COMPANY_GTM)}</span>} />
              <DetailsSection i={i} all head={<span className="co-th-f num"> · {filledOf(c.cells, COMPANY_ROWS)}</span>} />
            </div>
            <PeerSection i={i} crystal={crystal} />
          </>
        );
      case "seats":
        return (
          <>
            <section className="co-card" aria-labelledby="co-seats-h">
              <div className="co-card-h">
                <h2 id="co-seats-h">
                  Fractional seats <span className="num tp-cnt">{seatsN}</span>
                </h2>
                <span className="co-sub">Function, start, hours a week and why they hired are free. {c.hidden ? "Who held each seat opens with the company." : "Who held each seat is free now the company is open."}</span>
              </div>
              <Timeline i={i} />
              <SeatTable i={i} nameOf={(p, e) => <PersonNameButton i={i} p={p} e={e} className="co-seat-who" more={{ here: true, onWays: () => go("ways"), stage: deal ? stageWord(deal.stage) : null, onPipeline: () => go("deal"), onAddPipeline: () => go("deal") }} />} onDetails={(id) => (setDetails(id), requestAnimationFrame(() => document.getElementById(`tp-d-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" })))} />
              <p className="co-legend">
                <span className="co-legend-tint" aria-hidden /> A tinted cell is a fact you opened. A lock says its price. A quiet lock opens after another purchase.
              </p>
            </section>
            <details className="co-more" open={!!details || !!focus || seatsN <= 2}>
              <summary>Each seat in full: claim it, confirm it, add who held it, message them</summary>
              <SeatsSection i={i} focus={details ?? focus} title="Each seat" />
            </details>
          </>
        );
      case "people":
        return (
          <>
            <section className="co-card" aria-labelledby="co-ppl-h">
              <div className="co-card-h">
                <h2 id="co-ppl-h">
                  Who decides here <span className="num tp-cnt">{peopleN}</span>
                </h2>
                <span className="co-sub">
                  {c.hidden
                    ? `${plural(peopleN, "person is", "people are")} on file. They open after the company. Then a name and title are 1 credit together.`
                    : "A name and title are 1 credit together. Email, phone and public profile are 1 credit each, after the name. Choose a name for what Merlin holds."}
                </span>
              </div>
              {peopleN === 0 && <p className="co-sub">Nobody is on file here yet.{c.hidden ? "" : " Add someone you know and earn a credit for each fact."}</p>}
              <PeopleTable i={i} knownOf={knownOf} open={peek?.p.id ?? null} onPerson={(p, e, el) => setPeek((x) => (x?.p.id === p.id ? null : { p, e, el }))} />
              {peek &&
                bubble?.({
                  i,
                  p: peek.p,
                  e: peek.e,
                  anchor: peek.el,
                  onClose: () => setPeek(null),
                  stage: deal ? stageWord(deal.stage) : null,
                  onDeal: () => (setPeek(null), go("deal")),
                  onWays: () => go("ways"),
                  onCard: () => {
                    const id = peek.p.id;
                    setPeek(null);
                    setCardOf(id);
                    requestAnimationFrame(() => document.getElementById(`tp-d-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
                  },
                })}
              <p className="co-legend">{c.hidden ? "Nothing here can be opened or added until the company is open." : "The decision makers, and the people who hired or managed each fractional. Relationship is always free."}</p>
            </section>
            <details className="co-more" open={!!cardOf || peopleN <= 1}>
              <summary>Each person in full: confirm, report, add what you know</summary>
              <PeopleSection key={c.id} i={i} title="Each person" />
            </details>
          </>
        );
      case "ways":
        return (
          <>
            <RecordWays i={i} fallback={<SmartWaysIn i={i} />} />
            <YourWayIn i={i} seats={wayInSeatsOf(i, mine)} />
            <p className="co-legend">
              Each way in reads from you, through a person, to the company. From seats on Merlin{app?.network ? ", and what you brought in" : ""}. Only you see who you know.{" "}
              <a
                className="tp-link"
                href={app?.hrefOf("warm") ?? "/?p=warm"}
                onClick={(e) => {
                  if (!ownClick(e)) return;
                  e.preventDefault();
                  app ? app.openPage("warm") : openPage("getin");
                }}
              >
                All your warm paths
              </a>
            </p>
          </>
        );
      case "roles":
        return (
          <>
            <section className="co-card" aria-labelledby="co-roles-h">
              <div className="co-card-h">
                <h2 id="co-roles-h">Open roles{rolesN ? ` · ${rolesOpen} open${rolesN > rolesOpen ? `, ${rolesN - rolesOpen} closed` : ""}` : ""}</h2>
                <span className="co-sub">{c.hidden ? "Titles, functions and dates are free. The job posting, posted rate and hours open with the company." : "The job posting, posted rate and hours came with the company. No extra credit."}</span>
              </div>
              {rolesN === 0 ? <p className="co-sub">No fractional role is posted here now. Follow the company and Merlin tells you when one is.</p> : <RolesTable i={i} onTab={go} />}
              <RolesNote i={i} />
              {posting && (
                <p className="co-legend">
                  <OpenPosting i={i} focus={focus} />
                </p>
              )}
            </section>
            <section className="co-card co-follow-card">
              <p className="co-sub">{c.following ? "You follow this company. A new open role, a seat that ends or a new fact here reaches you by email, and by Slack once you connect it." : "Follow this company and Merlin tells you when it posts a role or a seat ends. Following is free."}</p>
              <FollowButton i={i} />
            </section>
            <PeerSection i={i} crystal={crystal} />
          </>
        );
      case "notes":
        return (
          <div className="co-two">
            <Notes i={i} first={first} deal={deal} />
            <Activity i={i} deal={deal} />
          </div>
        );
      case "deal":
        return (
          <>
            <section className="co-card" aria-labelledby="co-stage-h">
              <div className="co-card-h">
                <h2 id="co-stage-h">Stage in your pipeline</h2>
                <span className="co-sub">
                  {c.hidden
                    ? "Open the company first. Then add it to your pipeline and Merlin moves the stage as you reach out, talk and send a proposal."
                    : deal
                      ? `${deal.how ? `${deal.how}. ` : ""}Merlin moves it as it sees notes go out, replies and meetings. Wrong? Pick the right stage.`
                      : "Not in your pipeline yet. Pick a stage to add it, and Merlin moves it as you reach out, talk and send a proposal."}
                </span>
              </div>
              <StagePicker i={i} deal={deal} />
            </section>
            {!c.hidden && deal && <DealWorth deal={deal} />}
            {!c.hidden && <PipelineBlock i={i} />}
            {!c.hidden && closeOn && (
              <section className="co-card" aria-labelledby="co-prop-h">
                <div className="co-card-h">
                  <h2 id="co-prop-h">Proposal and contract</h2>
                  <span className="co-sub">After a first call, Merlin drafts the proposal from your notes, a pasted transcript or a template. You set the pricing options, sign, and send a link. Proposals for this company show on Proposals with when they were opened, any question and the signature. When it is signed, send your agreement from Contracts.</span>
                </div>
                <WriteProposal i={i} />
              </section>
            )}
            {!c.hidden && !closeOn && <WriteProposal i={i} />}
            <Charge i={i} benchmarks={benchmarks} seats={mySeats} />
          </>
        );
    }
  })();

  return (
    <RecordEnvProvider env={env}>
      <main ref={rootRef} className="tp-main tp-main-page co-page" id="tp-page" aria-label={c.hidden ? "Locked company" : c.name}>
        <header className="ws-head co-topbar">
          {crumbsEl}
          <span className="co-pos">
            {pos && <span className="num">{pos.n} of {pos.of}</span>}
            <button type="button" className="tp-iconbtn" aria-label="Previous in the list" title="Previous in the list (K)" disabled={!pos || pos.n <= 1} onClick={() => onStep(-1)}>
              <IconChevron dir="up" />
            </button>
            <button type="button" className="tp-iconbtn" aria-label="Next in the list" title="Next in the list (J)" disabled={!pos || pos.n >= pos.of} onClick={() => onStep(1)}>
              <IconChevron dir="down" />
            </button>
            <button type="button" className="tp-tbtn co-back" onClick={onClose} title="Back to the list (Esc)">
              Back
            </button>
          </span>
          {actions}
        </header>
        {stripShown && (c.hidden || opened) && (
          <section className={`ws-strip co-strip${opened ? " co-strip-done" : ""}`} aria-label="About this page">
            <span className="ws-strip-t">
              {opened ? (
                <>
                  <strong>Step 4 done. {c.name} is open.</strong> Its name, its website and who held each seat now show, and it stays open for you. Next, save a list with an alert so Merlin watches companies like this one.
                </>
              ) : (
                <>
                  <strong>What this page is for.</strong> Everything Merlin holds on one company: the seats it filled, who decides, your ways in, and your deal.
                </>
              )}
            </span>
            {opened && app && (
              <span className="ws-strip-acts">
                <button type="button" className="btn btn-sm btn-pine" onClick={() => (onClose(), setTimeout(() => app.table.askSave(), 50))}>
                  Save a list with an alert
                </button>
              </span>
            )}
            {onStripOff && (
              <button type="button" className="ws-strip-x" aria-label="Dismiss" onClick={onStripOff}>
                <span aria-hidden>×</span>
              </button>
            )}
          </section>
        )}
        <header className="co-head">
          <span className="co-logo">
            <CompanyLogo name={c.hidden ? "" : c.name} domain={c.hidden ? null : c.iconDomain ?? i.domain} hidden={c.hidden} seed={c.id} size="lg" />
          </span>
          <div className="co-head-t">
            <div className="co-head-line">
              <h1 className="co-name-h" tabIndex={-1}>
                {name}
              </h1>
              {/* "Hiring now" (ember) while a role is open, else the fit: the drawer's one chip. */}
              <Fit i={i} big hot />
            </div>
            <div className="co-head-facts">
              {line.length ? <span className="num">{line.join(" · ")}</span> : <span className="co-sub">Industry, size and HQ not on file yet</span>}
              {!c.hidden && website && (
                <a className="tp-link mono" href={hrefFor("company", "website", website)!} target="_blank" rel="noreferrer">
                  {site}
                </a>
              )}
              {!c.hidden && linkedin && (
                <a className="tp-link" href={hrefFor("company", "linkedin", linkedin)!} target="_blank" rel="noreferrer">
                  Public company page <IconExternal size={11} />
                </a>
              )}
              {c.hidden && <span className="co-sub">These facts are free. The name, website and logo open with the company.</span>}
            </div>
            {c.found && <p className="tp-found-dnote">{FOUND_NOTE}. It stays named for you once you add what you know, claim a seat or unlock something here. Otherwise it goes back to locked when you close it.</p>}
          </div>
          <div className="co-head-acts">
            <FollowButton i={i} big />
            <button type="button" className="btn co-stagebtn" onClick={() => go("deal")} aria-label={`Stage: ${stageWord(deal?.stage)}. Open the Deal tab`}>
              <span className={`co-stage-dot${deal ? ` s-${deal.stage}` : ""}`} aria-hidden />
              <span className="co-sub">Stage</span> <strong>{deal ? stageWord(deal.stage) : "Not in pipeline"}</strong>
            </button>
            {!c.hidden && <UnlockAll plan={plan} />}
            {!c.hidden &&
              (posting ? (
                <OpenPosting i={i} focus={focus} />
              ) : (
                <button type="button" className="btn btn-pine" onClick={() => void runGo(prim.go)}>
                  {prim.label}
                </button>
              ))}
          </div>
        </header>
        {gates}
        <div className="co-tabs" role="tablist" aria-label="Sections of this company" onKeyDown={onTabKey}>
          {TABS.map((k) => (
            <button
              key={k}
              ref={(el) => {
                tabRefs.current[k] = el;
              }}
              type="button"
              role="tab"
              id={`co-tab-${k}`}
              aria-selected={tab === k}
              aria-controls="co-panel"
              tabIndex={tab === k ? 0 : -1}
              className={`co-tab${tab === k ? " on" : ""}`}
              onClick={() => go(k)}
            >
              {TAB_NAME[k]}
              {counts[k] ? <span className="co-tab-n num">{counts[k]}</span> : null}
            </button>
          ))}
        </div>
        <div className="co-body">
          <div className="co-panel" id="co-panel" role="tabpanel" aria-labelledby={`co-tab-${tab}`} tabIndex={-1}>
            {panel}
          </div>
          <aside className="co-side" aria-label="Your next step with this company">
            <NextMove m={move} onGo={(g) => void runGo(g)} />
            {closeOn && <EvidenceCard companyId={i.c.id} onOpen={() => (app ? app.openPage("evidence") : openPage("proposals"))} />}
            <AddHere i={i} />
          </aside>
        </div>
        <RecordFoot i={i}>
          <span>{factsLine(i, plan.items.length)}</span>
          {opens && (
            <span>
              {trial ? "Trial" : "Pro"}: {Math.max(0, opens.of - opens.left)} of {opens.of || PRO_OPENS_DAILY} free opens used today
            </span>
          )}
          <a
            className="tp-link"
            href={app?.hrefOf("agent") ?? "/?p=integrations"}
            onClick={(e) => {
              if (!ownClick(e)) return;
              e.preventDefault();
              app ? app.openPage("agent") : openPage("integrations");
            }}
          >
            Your agent sees this record too
          </a>
        </RecordFoot>
      </main>
    </RecordEnvProvider>
  );
}

/**
 * The page as the registry mounts it (shell/pages.tsx "company"): the record TradingPost has open
 * (AppCtx.record), the breadcrumb back to where it was opened from, and the header's actions.
 */
export function CompanyPage() {
  const app = useAppMaybe();
  const r = app?.record;
  // How the member knows each person on file (their own sources only), for the bubble.
  const byRecord = useKnownByRecord();
  const first = useMemo(() => (r ? !(r.me.companiesUnlocked ?? 0) && !r.me.unlocked : false), [r?.info.c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!app || !r) return null;
  return (
    <CompanyRecord
      i={r.info}
      focus={r.focus}
      pos={r.pos}
      onClose={r.onClose}
      onStep={r.onStep}
      crystal={r.crystal}
      crumbs={r.crumbs}
      first={first}
      benchmarks={app.view.benchmarks}
      mySeats={app.shell.seats}
      contact={app.view.contact ?? null}
      actions={app.headerActions}
      stripOff={app.start.stripOff("company") || (app.me.stripsOff ?? []).includes("company")}
      onStripOff={() => app.start.dismissStrip("company")}
      knownOf={(p) => byRecord.get(p.id) ?? null}
      bubble={(o) => (
        <PersonBubble
          anchor={o.anchor}
          i={o.i}
          p={o.p}
          e={o.e}
          known={byRecord.get(o.p.id) ?? null}
          onClose={o.onClose}
          here
          onWays={o.onWays}
          onCard={o.onCard}
          stage={o.stage}
          onPipeline={o.onDeal}
          onAddPipeline={o.onDeal}
        />
      )}
    />
  );
}
