"use client";

/**
 * Unlock all (once per record, saying what it buys and asking first from 3 credits), Unlock company, and the company facts still missing.
 * Moved out of Drawer.tsx: the record drawer (phones, RN_UI2 off) and the company page (company/CompanyPage.tsx) both draw these.
 */
import { useRef, useState } from "react";
import { COMPANY_PRICE, TRIAL_OPENS_USED, fieldDef } from "@/lib/tableFields";
import { COMPANY_FILL, OPEN_ROLE_BUNDLE, cellKey, seatBundled, type CoInfo, type FactRef } from "../../model";
import { Sheet, ZeroCredits, GET_COMPANY_CREDITS, needsSpendConfirm, useUi, usePine } from "../../ui";
import { sendSignal } from "../../ProOffer";
import { plural } from "../../hooks";
import { companyLater, freeCompanyNow, proOpensUsed, unlockFreeWords } from "../../display";
import { useOpenSay } from "../../ui3/head";
import { EnvCtx, UNLOCK_COMPANY, UNLOCK_ROLE_SAY, UNLOCK_ROLE_SHORT, earnLine, listOf, openRole, pickExempt, useEnv, useEscape } from "./env";
import { AddFact } from "./Facts";

/* ---------- unlock all ---------- */

/** How Unlock all names what it buys: "2 roles, a seat holder and 3 names". */
export const NOUN: Record<string, [string, string]> = {
  "company.identity": ["company name", "company names"],
  "company.website": ["website", "websites"],
  "company.linkedin": ["LinkedIn page", "LinkedIn pages"],
  "company.about": ["About", "About texts"],
  "engagement.role": ["role", "roles"],
  "engagement.operator": ["seat holder", "seat holders"],
  // Who held a seat with the role they held: one purchase (SEAT_BUNDLE).
  "engagement.seat": ["seat holder with their role", "seat holders with their roles"],
  "engagement.end": ["end month", "end months"],
  "engagement.sourced": ["source of hire", "sources of hire"],
  "engagement.rate": ["rate", "rates"],
  "engagement.posting": ["job posting", "job postings"],
  "contact.name": ["name and title", "names and titles"],
  "contact.title": ["title", "titles"],
  "contact.email": ["email", "emails"],
  "contact.phone": ["phone number", "phone numbers"],
  "contact.linkedin": ["LinkedIn profile", "LinkedIn profiles"],
};
export interface Plan {
  items: FactRef[];
  /** Locked facts it opens. */
  facts: number;
  /** Credits it costs: each hidden company and each open role (its role, posting and rate) is one purchase. */
  cost: number;
  /** It buys the company (the free company of the day can pay for that part). */
  company: boolean;
  what: string;
}
export function planOf(i: CoInfo): Plan {
  const items = i.locked;
  const engs = new Map(i.engs.map((e) => [e.id, e]));
  let cost = 0;
  let company = false;
  const pairs = new Set<string>();
  const counts = new Map<string, number>();
  for (const t of items) {
    const seat = t.entity === "engagement" && t.field === "operator" ? engs.get(t.id) : undefined;
    // The seat holder's lock stands for their role too while both are locked (one purchase, lockedInEngagement).
    const k = seat && seatBundled(seat) && seat.cells.role?.s === "locked" ? "engagement.seat" : `${t.entity}.${t.field}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (t.entity === "company" && ["identity", "website", "linkedin", "about"].includes(t.field) && i.c.hidden) {
      if (!company) cost += COMPANY_PRICE;
      company = true;
      continue;
    }
    const e = t.entity === "engagement" ? engs.get(t.id) : undefined;
    if (e && OPEN_ROLE_BUNDLE.includes(t.field) && openRole(e)) {
      if (i.c.hidden) {
        if (!company) cost += COMPANY_PRICE;
        company = true;
        continue;
      }
      if (pairs.has(e.id)) continue;
      pairs.add(e.id);
      // A member who already sees part of the open role gets the rest at no charge.
      if (!OPEN_ROLE_BUNDLE.some((f) => f !== t.field && e.cells[f]?.s === "value")) cost++;
      continue;
    }
    cost++;
  }
  const parts = [...counts].map(([k, n]) => {
    const [one, many] = NOUN[k] ?? [k.split(".")[1], `${k.split(".")[1]}s`];
    return n === 1 ? `${/^[aeiou]/i.test(one) ? "an" : "a"} ${one}` : `${n} ${many}`;
  });
  const what = parts.length ? `${listOf(parts)}.` : "";
  return { items, facts: items.length, cost, company, what: what.charAt(0).toUpperCase() + what.slice(1) };
}

/**
 * Unlock every locked fact in the record at once: once per record, saying what it buys. From 3
 * credits up it asks first (inline on a desktop, a sheet on touch screens). Off, with the reason,
 * when the balance or today's unlock limit can't cover it.
 */
export function UnlockAll({ plan, bar }: { plan: Plan; bar?: boolean }) {
  const ui = useUi();
  const env = useEnv();
  // The new design (RN_UI3) says Open: "Open all 6".
  const say = useOpenSay();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inSheet = env.touch;
  // Esc, Cancel and a tap beside the sheet all put focus back on the button that asked.
  const cancel = () => {
    setAsk(false);
    setTimeout(() => btnRef.current?.focus({ preventScroll: true }));
  };
  useEscape(ask && !inSheet, cancel);
  useEscape(ask && inSheet, cancel, sheetRef);
  if (!plan.items.length) return null;
  const { facts } = plan;
  const left = ui.me.unlocksLeft ?? Infinity;
  // The free company of the day pays for the company: those credits aren't needed, though it still counts toward the day's unlocks.
  const cost = plan.cost - (plan.company && freeCompanyNow(ui.me) ? COMPANY_PRICE : 0);
  if (cost > ui.me.credits || plan.cost > left)
    return (
      <span className="tp-unlockall tp-unlock-short tp-small muted">
        {left === 0 && ui.me.credits > 0
          ? "Unlocks again tomorrow"
          : ui.me.credits <= 0
            ? "Earn a credit to unlock"
            : left < ui.me.credits
              ? `Unlock all takes ${plural(cost, "credit")}. You can unlock ${left} more today.`
              : `Unlock all takes ${plural(cost, "credit")}. You have ${ui.me.credits}.`}
      </span>
    );
  const go = async () => {
    setBusy(true);
    // Asked here already (ask), or too small to ask (unlockMany asks itself when it should).
    await ui.unlockMany(plan.items, { confirmed: ask, cost });
    setBusy(false);
    setAsk(false);
  };
  const price = cost ? plural(cost, "credit") : "no credit";
  const question = `Spend ${price} on ${facts === 1 ? "this fact" : `these ${facts} facts`}?`;
  const after = ui.me.credits - cost;
  const button = (
    <button
      ref={btnRef}
      type="button"
      className={`btn${bar ? " tp-ua-bar" : ""}`}
      disabled={busy}
      aria-busy={busy}
      aria-expanded={needsSpendConfirm(cost) ? ask : undefined}
      aria-label={say(busy ? "Unlocking" : `Unlock all ${facts} locked facts here for ${price}`)}
      onClick={() => (needsSpendConfirm(cost) ? setAsk(true) : go())}
    >
      {busy ? (
        say("Unlocking")
      ) : bar ? (
        <span className="tp-ua-two">
          <span>{say("Unlock all")} {facts}</span>
          <span className="tp-ua-cost num">{price}</span>
        </span>
      ) : (
        <span>
          {say("Unlock all")} {facts} · <span className="num">{price}</span>
        </span>
      )}
    </button>
  );
  if (ask && inSheet)
    return (
      <span className="tp-unlockall">
        {button}
        <Sheet
          title={say(`Unlock all ${facts} here?`)}
          onClose={cancel}
          footer={
            <div className="tp-sheet-actions">
              <button type="button" className="btn btn-lg" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-pine btn-lg tp-grow" autoFocus disabled={busy} aria-busy={busy} onClick={go}>
                {busy ? "Unlocking" : `Spend ${price}`}
              </button>
            </div>
          }
        >
          <div ref={sheetRef} className="tp-ua-sheet">
            <p className="tp-ua-q">
              {question} You&apos;ll have {plural(after, "credit")} left.
            </p>
            {plan.what && <p className="tp-ua-what">{plan.what}</p>}
          </div>
        </Sheet>
      </span>
    );
  if (ask)
    return (
      <div className="tp-ua-ask" role="group" aria-label="Unlock all">
        <p>
          <b>{question}</b> {plan.what} You&apos;ll have {plural(after, "credit")} left.
        </p>
        <span className="tp-ua-ask-acts">
          <button type="button" className="btn btn-pine" autoFocus disabled={busy} aria-busy={busy} onClick={go}>
            {busy ? "Unlocking" : `Spend ${price}`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={cancel}>
            Cancel
          </button>
        </span>
      </div>
    );
  return <span className="tp-unlockall">{button}</span>;
}


/** The company facts still missing, as add pills (the record header, and the Add flow's "facts" step). */
export function MissingFacts({ i, title = true, skip = [] }: { i: CoInfo; title?: boolean; skip?: string[] }) {
  const ui = useUi();
  const env = { exempt: pickExempt(i) };
  const fields = i.c.hidden ? [] : COMPANY_FILL.filter((f) => i.c.cells[f]?.s === "empty" && !skip.includes(f));
  if (!fields.length) return null;
  const refs = fields.map((f) => ({ entity: "company" as const, id: i.c.id, field: f }));
  const pills = (
    <EnvCtx.Provider value={{ touch: false, phone: false, contact: null, company: i.c.hidden ? "this company" : i.c.name, hidden: !!i.c.hidden, exempt: env.exempt }}>
      <div className="tp-missing-row">
        {refs.map((t) => (
          <AddFact key={t.field} t={t} label={fieldDef(t.entity, t.field)!.label} />
        ))}
      </div>
    </EnvCtx.Provider>
  );
  // Without a title it sits in the drawer header, where the summary line would be.
  if (!title) return <div className="tp-dmissing">{pills}</div>;
  return (
    <section className="tp-dsec">
      <h3 className="tp-dsec-h">Still missing</h3>
      <p className="tp-dsec-note">{earnLine(ui, env, refs)}</p>
      {pills}
    </section>
  );
}



/**
 * Unlock a locked company for COMPANY_PRICE credits: its name, website and logo, with the job
 * posting (and posted rate) of each open role there. The record's one action until it is unlocked.
 * Pine, because it spends. Short of the price it shows how to earn instead (and counts the wall).
 * The day's companies from the radar (Radar.tsx) put it on each locked row and card too.
 */
export function UnlockCompany({ id, rate, roles, bar }: { id: string; rate: boolean; roles: boolean; bar?: boolean }) {
  const ui = useUi();
  const pine = usePine();
  const ref = useRef<HTMLButtonElement>(null);
  const [zero, setZero] = useState(false);
  const busy = ui.busy.has(cellKey(id, "identity"));
  // The free company of the day (any plan): no credits needed while it is left and the day's limit has room.
  const free = freeCompanyNow(ui.me);
  // The trial's companies for today are used: it opens tomorrow (the trial never pays credits for a company).
  const trialUsed = proOpensUsed(ui.me);
  const broke = !free && !trialUsed && ui.me.credits < COMPANY_PRICE;
  // Today's unlocks are used up (a company counts as COMPANY_PRICE of them, the free one too): the button says when, and spends nothing.
  const later = companyLater(ui.me) || trialUsed;
  const label = free ? unlockFreeWords(ui.me) : UNLOCK_COMPANY;
  const included = !roles ? "Name, website and logo" : rate ? "Job posting and rate included" : "Job posting included";
  // Short of the price: "Get 2 credits" opens the ways to get them (earn one, the top-up, Pro).
  const say = useOpenSay();
  const text = say(busy ? "Unlocking" : trialUsed ? "Opens tomorrow" : later ? "Unlocks again tomorrow" : broke ? GET_COMPANY_CREDITS : label);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`btn ${pine}${bar ? " tp-uc-bar" : ""}`}
        disabled={busy || later}
        aria-busy={busy}
        aria-label={busy || later || broke ? text : say(`${free ? `Unlock company free. ${unlockFreeWords(ui.me)}` : UNLOCK_ROLE_SAY}. ${included}.`)}
        onClick={() => {
          if (free || ui.me.credits >= COMPANY_PRICE) return ui.unlock({ entity: "company", id, field: "identity" }, { onWall: () => setZero(true) });
          sendSignal("wall", "identity");
          setZero(true);
        }}
      >
        {bar && !busy && !later && !broke ? (
          // A phone's sticky bar: the price on one line, what comes with it on a small second line.
          <span className="tp-ua-two">
            <span>{say(free ? unlockFreeWords(ui.me) : UNLOCK_ROLE_SHORT)}</span>
            <span className="tp-ua-cost">{included}</span>
          </span>
        ) : (
          text
        )}
      </button>
      {/* The trial's companies for today are used: it says so, and nothing is spent. */}
      {!busy && trialUsed && <span className="tp-uc-fair tp-small muted">{TRIAL_OPENS_USED}</span>}
      {zero && ui.me.credits < COMPANY_PRICE && ref.current && <ZeroCredits anchor={ref.current} id={id} need={COMPANY_PRICE} onClose={() => setZero(false)} />}
    </>
  );
}
