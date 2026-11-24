/**
 * Writing the "Senior operator inside the business" proposal and its agreement from a call brief
 * (lib/proposals/brief.ts). Pure: the brief and what Merlin knows (the member, the company, their
 * Evidence Bank, the rate from ONE calculation) in, the sections' text out. Every word about the
 * client comes from the brief; anything the call didn't give is left out or asked for, never made
 * up: the bridge's numbers stay "?" for the member to fill, the days a week stay a blank to set.
 *
 * Plain text in the sections' house shapes (sections.ts): "- Title: line" bullets read as cards,
 * "Days 0 to 30 · Assessment" headings with bullets and a "Deliverable:" line read as the plan's
 * phases, "Label: value" lines as the bridge's cards. The deck view (deck.ts) reads the same text.
 */
import { daysWords, deciderOf, shortRole, type CallBrief } from "./brief";
import { OPERATOR_AGREEMENT, SENIOR_OPERATOR } from "./operatorLib";

export interface OperatorCtx {
  /** The member and how they sign (their own name), their title, and their firm when they place operators. */
  me: { name: string; title: string; firm: string };
  /** The client company's name as Merlin shows it to the member. */
  company: string;
  /** The call's date in words ("September 30"), when known. */
  callDate: string | null;
  /** Evidence Bank: the proof text Merlin matched (proof.ts), and the companies the member has named in their cases. */
  proofText: string | null;
  workedWith: string[];
  /** The days a week to price (from the brief or the member), and the rate's shown math. */
  allocation: string | null;
  math: string | null;
}

const bullets = (xs: string[]) => xs.filter(Boolean).map((x) => `- ${x.replace(/^[-•]\s+/, "")}`).join("\n");
const cards = (xs: { title: string; body: string }[]) => bullets(xs.map((x) => `${x.title.replace(/[.:]\s*$/, "")}: ${x.body}`));
/** A line with any "N days a week" taken out (the card's title carries the field). */
const keepNoDays = (x: string) => x.replace(/[^.]*\b\d+(?:\.\d)?\s*days? (?:a|per) week\b[^.]*\.?\s*/gi, "").trim();
const sentence = (x: string) => (x && !/[.!?]$/.test(x) ? `${x}.` : x);

/** The client's leaders named on the call, for the org chart and the committee: "CRO", "CMO", "CFO". */
function leaders(b: CallBrief): { name: string; role: string }[] {
  const top = deciderOf(b);
  return b.people.filter((p) => p.side === "client" && p !== top && p.role).map((p) => ({ name: p.name, role: shortRole(p.role) }));
}

/** Who does the work, in the document's words: the candidate's seat, never a name before it's agreed. */
const operatorWords = (b: CallBrief, ctx: OperatorCtx) => (b.memberRole === "firm" ? `A senior operator${ctx.me.firm ? ` from ${ctx.me.firm}` : ""}` : ctx.me.name);

/** The proposal's sections, by block id: only those the brief (or Merlin's data) can fill. */
export function operatorSections(b: CallBrief, ctx: OperatorCtx): Record<string, { title: string; body: string }> {
  const out: Record<string, { title: string; body: string }> = {};
  const w = b.write;
  const top = deciderOf(b);
  const from = ctx.me.firm && b.memberRole === "firm" ? `${ctx.me.name}, ${ctx.me.firm}` : [ctx.me.name, ctx.me.title].filter(Boolean).join(", ");
  // Cover: the headline and the plan in a line, who it's for, who it's from.
  if (w.headline)
    out.cover = {
      title: "Cover",
      body: [w.headline, w.subtitle, `Prepared for ${top ? `${top.name}${top.role ? `, ${shortRole(top.role)}` : ""}` : "{{client.signerName}}"}, ${ctx.company || "{{client.companyName}}"}`, `Prepared by ${from}`].filter(Boolean).join("\n"),
    };
  // What I heard: the insights as cards, then the constraint.
  if (b.insights.length)
    out.what_we_heard = {
      title: ctx.callDate ? `What I heard on ${ctx.callDate}` : "What I heard",
      body: [cards(b.insights), b.constraint ? `The constraint: ${b.constraint.title.replace(/[.:]\s*$/, "")}. ${sentence(b.constraint.body)}` : "", "Correct anything that's wrong: the plan bends to the diagnosis."].filter(Boolean).join("\n\n"),
    };
  if (w.thesis.line) out.thesis = { title: "Thesis", body: [sentence(w.thesis.line), cards(w.thesis.supports)].filter(Boolean).join("\n\n") };
  if (w.pitfalls.length) out.pitfalls = { title: "Typical pitfalls", body: bullets(w.pitfalls.map((p) => `${p.title.replace(/[.:]\s*$/, "")}: ${sentence(p.body)}${p.showsUpAs ? ` Shows up as: ${sentence(p.showsUpAs)}` : ""}`)) };
  // The alternatives the client is weighing, each with the member's answer from the call.
  if (b.alternatives.length) out.why_fractional = { title: "Why a senior operator, not the alternatives", body: bullets(b.alternatives.map((a) => `${a.option.replace(/[.:]\s*$/, "")}: ${sentence(a.answer || a.theirView)}`)) };
  // At a glance: the cards, with the days a week as set (else a blank to set, never a guess).
  if (w.glance.length) {
    // The days a week card reads the field, so it follows what the member sets.
    const glance = w.glance.map((g) => (/\bdays? a week\b|\bdays\/week\b|\bdays per week\b/i.test(`${g.title} ${g.body}`) ? { title: "{{pricing.allocation}}, embedded", body: keepNoDays(g.body) } : g));
    out.engagement_glance = { title: "The engagement at a glance", body: cards(glance) };
  }
  // Why us: only real data: the member's matched cases and the companies they named in Evidence Bank.
  const why = [ctx.proofText ? `Work like this before:\n${ctx.proofText}` : "", ctx.workedWith.length ? `Companies ${b.memberRole === "firm" ? "we've" : "I've"} worked with: ${ctx.workedWith.join(", ")}` : ""].filter(Boolean);
  if (why.length) out.proof = { title: b.memberRole === "firm" && ctx.me.firm ? `Why ${ctx.me.firm}` : "Why me", body: why.join("\n\n") };
  // The first 90 days on a clock: the assessment to the day-30 decision, then design and deploy sprints.
  const p = w.plan;
  if (p.assess.items.length || p.design.items.length) {
    const part = (head: string, x: { items: string[]; deliverable: string }) => (x.items.length ? [head, bullets(x.items), x.deliverable ? `Deliverable: ${sentence(x.deliverable)}` : ""].filter(Boolean).join("\n") : "");
    out.phases_workstreams = {
      title: "The first 90 days",
      body: [part("Days 0 to 30 · Assessment", p.assess), p.decision ? `Day 30 · The decision\n${sentence(p.decision)}` : "", part("Days 31 to 90 · Design", p.design), part("Days 31 to 90 · Deploy, as ready", p.deploy)].filter(Boolean).join("\n\n"),
    };
  }
  if (w.day30.length) out.day30 = { title: "What you'll have by day 30", body: cards(w.day30) };
  // The math: the bridge's labels with "?" for the member to fill. Never a number Merlin made.
  if (w.math.length) out.the_math = { title: "The math: show the bridge", body: [`Today, nobody can walk the line from the goal back to the top of the funnel. We build it from your own numbers, then it becomes the scoreboard.`, w.math.map((l) => `${l.replace(/[:?]\s*$/, "")}: ?`).join("\n")].join("\n\n") };
  // Where the operator sits: the decision maker on top, the leaders beside, the operator's seat.
  if (top) {
    const ls = leaders(b);
    const reports = b.shape.reportsTo || shortRole(top.role) || top.name;
    out.org_chart = {
      title: "Where the operator sits",
      body: [`Top: ${top.name}${top.role ? `, ${shortRole(top.role)}` : ""}`, ls.length ? `Beside: ${ls.map((l) => l.role || l.name).join(", ")}` : "", `Operator: ${operatorWords(b, ctx)}, reports to ${reports}`, "A peer to the leaders, accountable for the change, outside the team being redesigned."].filter(Boolean).join("\n"),
    };
  }
  // The investment: the fee and the days it covers, the hours shown. No days said: a blank to set, never 40 hours assumed.
  out.investment = {
    title: "Investment",
    body: ["{{pricing.monthlyFee}} a month for {{pricing.allocation}}.", ctx.allocation ? "That is about {{pricing.hoursMonth}} hours a month." : "", "First term: {{term.initialMonths}} months, then month to month with {{term.noticeDays}} days' notice."].filter(Boolean).join("\n"),
  };
  if (b.questions.length) out.questions = { title: "Questions for our next meeting", body: bullets(b.questions.map(sentence)) };
  if (b.nextSteps.length) out.next_steps = { title: "Next steps", body: bullets(b.nextSteps.map((n) => `${n.when ? `${n.when}: ` : ""}${sentence(n.step)}`)) };
  return out;
}

/** The day `days` after a start date in words ("November 18, 2026"), or null when the start isn't a date. */
export function dayAfter(start: string, days: number, nowMs = Date.now()): string | null {
  const y = new Date(nowMs).getUTCFullYear();
  const t = Date.parse(/\d{4}/.test(start) ? start : `${start} ${y}`);
  if (Number.isNaN(t)) return null;
  return new Date(t + days * 86_400_000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The agreement's sections, by block id, from the same brief. */
export function agreementSections(b: CallBrief, ctx: OperatorCtx, nowMs = Date.now()): Record<string, { title: string; body: string }> {
  const out: Record<string, { title: string; body: string }> = {};
  const w = b.write;
  const top = deciderOf(b);
  const co = ctx.company || "{{client.companyName}}";
  const provider = ctx.me.firm || ctx.me.name;
  const lead = b.memberRole === "firm" ? b.operator || "{{lead.name}}" : ctx.me.name;
  out.cover = { title: "Cover", body: [`Partnership agreement`, `${provider} and ${co}`, top ? `For ${top.name}${top.role ? `, ${shortRole(top.role)}` : ""}` : ""].filter(Boolean).join("\n") };
  const purpose = b.summary ? sentence(b.summary.split(/(?<=[.!?])\s+/)[0]) : "";
  out.scope = {
    title: "Scope",
    body: [
      `${b.shape.start ? `Beginning ${b.shape.start}, ` : ""}${provider} will run a program for ${co}${w.focus[0] ? ` focused first on ${w.focus[0].replace(/\.$/, "").replace(/^\w/, (c) => c.toLowerCase())}` : ""}.`,
      purpose,
      "The program is delivered by an embedded lead inside the business, not as an outside advisory engagement.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
  out.team_rates = {
    title: "Staffing",
    body: bullets([
      `Lead operator: ${lead}. Owns the workstream end to end, runs the working sessions and owns every deliverable in this agreement.`,
      ...(b.memberRole === "firm" ? [`Executive sponsor: ${ctx.me.name}${ctx.me.title ? `, ${ctx.me.title}` : ""}. Accountable for governance and quality, and the escalation point for ${co}'s leadership.`] : []),
    ]),
  };
  if (top) {
    const ls = leaders(b);
    out.governance = { title: "Governance", body: `A steering committee governs the program, chaired by ${top.name}${top.role ? ` (${shortRole(top.role)})` : ""}${ls.length ? `, with ${ls.map((l) => l.role || l.name).join(", ")} as members` : ""}, and the lead operator${b.memberRole === "firm" ? " and the executive sponsor" : ""}. How it works is set together in the first two to three weeks.` };
    out.reporting_structure = { title: "Reporting structure", body: `The lead operator reports to ${b.shape.reportsTo || `${top.name}${top.role ? ` (${shortRole(top.role)})` : ""}`}, and sits outside the teams being redesigned.` };
  }
  out.operating_cadence = { title: "Cadence", body: bullets(["Weekly: a check-in with the sponsor and a short written update.", "Monthly: a summary of what was delivered.", "The steering committee: materials prepared by the lead operator for each meeting."]) };
  // Two phases, with the day-30 deliverable dated when the call gave a start.
  const d30 = b.shape.start ? dayAfter(b.shape.start, 30, nowMs) : null;
  const d90 = b.shape.start ? dayAfter(b.shape.start, 90, nowMs) : null;
  out.phases_workstreams = {
    title: "The plan",
    body: [
      ["Phase 1 · Embed and diagnose, days 1 to 30", bullets(w.plan.assess.items), `Deliverable: ${w.plan.assess.deliverable ? sentence(w.plan.assess.deliverable) : "A readout with findings ranked by severity and a prioritized backlog."}${d30 ? ` By ${d30}.` : " By day 30."}`].filter(Boolean).join("\n"),
      ["Phase 2 · Confirm, then execute, day 31 onward", bullets([...w.plan.design.items, ...w.plan.deploy.items]), `Deliverable: ${w.plan.deploy.deliverable ? sentence(w.plan.deploy.deliverable) : "The first fixes live and a weekly scoreboard."}${d90 ? ` By ${d90}.` : " By day 90."}`].filter(Boolean).join("\n"),
    ].join("\n\n"),
  };
  const focus = w.focus.length ? w.focus : w.priorities.map((p) => `${p.title}: ${p.body}`);
  if (focus.length) out.focus_areas = { title: "Expected areas of focus", body: `Which of these, in what order and how deep is set at the day 30 readout.\n\n${bullets(focus.map(sentence))}` };
  if (w.commitments.length) out.commitments = { title: "What we commit to deliver", body: bullets(w.commitments.map(sentence)) };
  if (w.outOfScope.length) out.out_of_scope = { title: "Outside of scope", body: bullets(w.outOfScope.map(sentence)) };
  if (b.success.length) out.success_measures = { title: "Success measures", body: `By day 90, ${co} should be able to point to:\n${bullets(b.success.map(sentence))}` };
  out.investment = {
    title: "Timeline and investment",
    body: [`Term: {{term.initialMonths}} months from the start, then month to month with {{term.noticeDays}} days' written notice.`, "Monthly fee: {{pricing.monthlyFee}} a month for {{pricing.allocation}}.", ctx.allocation ? "Allocation: about {{pricing.hoursMonth}} hours a month." : "", "Billed monthly in advance. Travel and expenses at cost when approved in advance in writing."].filter(Boolean).join("\n"),
  };
  return out;
}

export const OPERATOR_IDS = { proposal: SENIOR_OPERATOR, agreement: OPERATOR_AGREEMENT } as const;
/** Sections of the family Merlin writes from the brief (the rest come from the library's starter text and the member's data). */
export const isOperatorTemplate = (id: string | null | undefined) => id === SENIOR_OPERATOR || id === OPERATOR_AGREEMENT;
export { daysWords };
