/**
 * The SYNTHETIC three-party call the proposal brain is checked against (scripts/test-proposals-brain.mts)
 * and the brief a model would write for it: a made-up firm (the member, Jordan Avery), a made-up
 * operator candidate (Riley Chen) and a made-up client (Halcyon Freight, CEO Morgan Ellis). No real
 * call, company or person.
 */
/* ---------- the synthetic call ---------- */
export const CALL = `Meeting Title: Halcyon Freight go-to-market and the fractional role
Date: Mar 4
Meeting participants: Jordan Avery

Transcript:
Riley Chen: Can you hear me?
Me: Hmm, how's that? No?
Riley Chen: No, I still can't hear you. Is there a number I can call you?
Me: Look in the chat. Is that you? Yes. Okay.
Riley Chen: Um,
Me: Uh, good morning. Thanks for making the time, Riley. The weather here has been lovely.
Me: So the client is Halcyon Freight. Their CEO, Morgan Ellis, took over last spring and needs to grow pipeline. New logo meetings have been flat for three quarters, and the team says buyers just won't take meetings.
Me: Morgan brought in a new CFO in March. The VP Sales and the VP Marketing have both been there five years, and they feel they've done everything they can.
Riley Chen: Do they have a bridge from next year's bookings goal back to how many meetings they need? Usually nobody can walk that line.
Me: No, nobody can show that today. And they measure an inbound funnel while most of their deals now come from named accounts.
Me: They're also packaging a smaller entry offer, a lane-audit product, so they don't lead with the big network contract.
Me: Morgan is weighing a full-time VP Revenue, or bringing in Apex Advisory, a consulting firm, instead of a fractional operator.
Me: I told Morgan a full-time hire is premature when nobody knows yet what the motion should be, and a firm brings a team and a report but not a person who owns the change.
Riley Chen: Makes sense. I'd plan a 30-day assessment that ends in a decision, then design and deploy sprints.
Me: Right, and I'd propose two and a half days a week for the operator.
Me: Their planning season closes at the end of next month, so the plan has to be defensible before the board locks it.
Me: I'm meeting Morgan on Thursday at 2pm to walk through it. Let me check my calendar for Friday too.
Riley Chen: Sounds good, talk soon.`;

/** The brief a model would write for the synthetic call (the fixture the fake AI answers with). */
export const BRIEF = {
  client_company: "Halcyon Freight",
  people: [
    { name: "Morgan Ellis", side: "client", role: "CEO, since last spring", decides: true, on_call: false },
    { name: "CFO", side: "client", role: "CFO, joined in March", decides: false, on_call: false },
    { name: "VP Sales", side: "client", role: "VP Sales, five years in", decides: false, on_call: false },
    { name: "VP Marketing", side: "client", role: "VP Marketing, five years in", decides: false, on_call: false },
    { name: "Riley Chen", side: "operator", role: "Operator candidate", decides: false, on_call: true },
  ],
  member_role: "firm",
  operator: "Riley Chen",
  summary: "Halcyon Freight's new CEO needs more pipeline. New logo meetings have been flat for three quarters. The CEO is weighing a full-time hire or a consulting firm against a fractional operator.",
  insights: [
    { title: "Pipeline creation is flat", body: "New logo meetings have been flat for three quarters, and the team says buyers won't take meetings.", evidence: "New logo meetings have been flat for three quarters" },
    { title: "The math doesn't bridge", body: "Nobody can walk the line from next year's bookings goal back to the meetings needed.", evidence: "nobody can show that today" },
    { title: "Measuring the wrong motion", body: "They measure an inbound funnel while most deals come from named accounts.", evidence: "they measure an inbound funnel" },
    { title: "Long-tenured leaders", body: "Sales and marketing leaders, five years in, feel they've done all they can.", evidence: "they feel they've done everything they can" },
    { title: "A wedge offer, ready", body: "A smaller entry offer, a lane audit, so they don't lead with the big contract. Win rate is up 47% already.", evidence: "a lane-audit product" },
    { title: "Can you hear me", body: "No, I still can't hear you.", evidence: "Can you hear me?" },
  ],
  constraint: { title: "Planning season", body: "The plan has to be defensible before the board locks it at the end of next month.", evidence: "Their planning season closes at the end of next month" },
  alternatives: [
    { option: "A full-time VP Revenue", their_view: "Hire the role full-time.", answer: "Premature when nobody knows yet what the motion should be." },
    { option: "Apex Advisory, a consulting firm", their_view: "Bring in a firm.", answer: "A team and a report, but no person who owns the change." },
  ],
  shape: { days_per_week: "2.5", hours_per_week: "", duration: "90 days", phases: ["30-day assessment ending in a decision", "design and deploy sprints"], start: "", reports_to: "" },
  success: ["A plan with a bridge the board believes", "A real baseline for meetings"],
  risks: [{ risk: "The long-tenured leaders may resist.", answer: "Bring them in early." }],
  next_steps: [{ step: "We walk through this plan together", owner: "", when: "Thursday, 2pm" }],
  questions: ["What is next year's bookings goal?", "Who should the operator report to?"],
  write: {
    headline: "A senior revenue operator inside the business",
    subtitle: "Find why pipeline is flat, redesign the motion, and own the change until it holds.",
    thesis: { line: "The current course won't change next year; a senior operator with a mandate to redesign the motion will.", supports: [{ title: "Walks in as a peer", body: "Part of the leadership team." }, { title: "Owns the change", body: "Accountable for the work and the number." }, { title: "Independent of the team", body: "Outside the teams being redesigned." }] },
    pitfalls: [{ title: "The buyer changed; the motion didn't", body: "The same plays keep running.", shows_up_as: "The same effort while meetings fall." }, { title: "Measurement lags the motion", body: "Dashboards built for an old funnel.", shows_up_as: "Healthy reports over a flat pipeline." }, { title: "Pipeline is owned by no one", body: "The seam between marketing and sales has no owner.", shows_up_as: "Analysis that changes nothing." }],
    glance: [{ title: "One senior operator", body: "Experienced at your stage." }, { title: "2.5 days a week, embedded", body: "In the meetings that matter. 2.5 days a week." }, { title: "A 30-day assessment", body: "Deep on meetings first." }, { title: "90 days, then sprints", body: "A structured start, then the roadmap." }],
    plan: { assess: { items: ["Every source of new logo meetings", "The bridge from the goal back to meetings"], deliverable: "A readout and a ranked list of fixes" }, decision: "With you and the leadership team, decide what to fix first.", design: { items: ["Measurement for the named-account motion"], deliverable: "A plan you can defend to the board" }, deploy: { items: ["Quick wins live as they're ready"], deliverable: "First fixes and a weekly scoreboard" } },
    day30: [{ title: "The bridge, rebuilt", body: "From the goal back to meetings." }, { title: "The leaks found", body: "Where meetings break." }, { title: "Findings ranked", body: "Each with a first move." }, { title: "A roadmap", body: "For the day 30 decision." }],
    priorities: [{ title: "Measurement", body: "For the motion you run." }],
    math: ["Bookings goal", "Win rate", "Opportunity conversion", "Meeting rate"],
    focus: ["Pipeline and measurement", "The wedge offer in market"],
    commitments: ["A readout at day 30", "A weekly scoreboard by day 90"],
    out_of_scope: ["Hiring the permanent team"],
  },
};
export const LEARNED = {
  title: "My operator proposal",
  sections: [
    { title: "What I heard", block_kind: "what_we_heard", purpose: "Show you listened.", body: "- {{pains}}" },
    { title: "The thesis", block_kind: "thesis", purpose: "One line on the fix.", body: "{{thesis}}" },
    { title: "Investment", block_kind: "investment", purpose: "The fee.", body: "{{pricing.monthlyFee}} a month for {{pricing.allocation}}." },
  ],
  agreement: [{ title: "Scope", block_kind: "scope", purpose: "What the program is.", body: "{{client.companyName}} retains us." }],
  voice: { tone: "Direct, plain", headings: "Short statements ending in a period", length: "Short", phrases: ["on a clock"] },
};

