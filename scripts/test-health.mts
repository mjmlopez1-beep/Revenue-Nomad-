/**
 * Checks of Health (lib/health.ts), the block at the top of Pilot metrics, and of the public
 * "Where Merlin's data goes" page (app/data). In process on a made-up state with known counts:
 * every number is checked exactly. No server, no network.
 *
 *   npx tsx scripts/test-health.mts      exits 1 on any failure
 *
 * Covered: the activation funnel (each step only members who did every step before it), retention
 * by signup month (week 1, 4 and 8 windows, a week counted only once it is over, an email's opening
 * pixel not a visit), facts a week split by members and scanned or imported (undone, bench rates,
 * a fact counted twice and removed values left out, 12 weeks only), the share confirmed by a second
 * member, credits earned and spent a week by source and by use, invites, trial to paid and paid now,
 * the outcomes from every member's pipeline (lib/pipeline.ts outcomeStats as rows: deals by how far
 * they got, Won and through Merlin, the month's value, follow-ups due, what the stages were seen
 * from, intros; replies and wins through Merlin said only with 20 members a group), What's working and What isn't (the numbers and group sizes in each, 20 members
 * a group or "not enough members yet", ranked by effect, at most 5), CSV for every table, the Health
 * block's markup (counts only, every table's Copy as CSV, the outcomes in counts, dollars and
 * shares, "No deals in anyone's pipeline yet"), and the
 * data page (the four questions, every outside service, no "To confirm", no LinkedIn).
 */
process.env.RN_BILLING = "1";
process.env.RN_STARTER_CREDITS = "25";

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 900)}`}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const NOW = Date.parse("2026-11-21T12:00:00.000Z"); // a Saturday: this week started Monday Nov 16
const JOIN = Date.parse("2026-09-01T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(JOIN + days * DAY).toISOString();
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `m${a + i}`);

/* ---------- the made-up state ---------- */
// 60 members joined Sep 1; m0..m29 (group A) add a fact on day 2, m30..m59 (group B) don't.
// 2 more joined Nov 18 through an invite and haven't onboarded.
const members = [
  ...range(0, 59).map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.com`, title: "Fractional CMO", token: `tok-${id}`, at: at(0) })),
  ...["n0", "n1"].map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.com`, title: "Fractional CFO", token: `tok-${id}`, at: "2026-11-18T09:00:00.000Z", referredBy: "m0" })),
];
const L = (memberId: string, delta: number, reason: string, ref: string, when: string, extra: Record<string, unknown> = {}) => ({ memberId, delta, reason, ref, at: when, ...extra });
const ledger = [
  // Group A's first facts: m0..m14 on seats, m15..m29 on companies (week of Aug 31).
  ...range(0, 29).map((id, i) => L(id, 1, "fill", i < 15 ? `e_s${i}.rate` : `c_c${i}.industry`, at(2))),
  // The same fact twice (counted once as a fact), an undone fill and a bench rate (neither a fact).
  L("m0", 0, "fill", "e_s0.rate", at(2)),
  L("m31", 1, "fill", "c_undone.industry", at(2), { undone: true }),
  L("m1", 1, "fill", "bench.r1", "2026-11-18T10:00:00.000Z"),
  // m0's three contact facts this week.
  ...["email", "phone", "linkedin"].map((f) => L("m0", 1, "fill", `p_x.${f}`, "2026-11-18T11:00:00.000Z")),
  // m0..m9 unlock a company on day 3; m40..m54 spend all 25 credits on day 3 (out of credits).
  ...range(0, 9).map((id, i) => L(id, -2, "unlock", `c_c${i}.identity`, at(3))),
  ...range(40, 54).map((id) => L(id, -25, "unlock", "e_y.posting", at(3))),
  // This week: a person, a contact detail, a seat fact, a free company (0), and the other sources.
  L("m0", -1, "unlock", "p_x.name", "2026-11-19T10:00:00.000Z"),
  L("m0", -1, "unlock", "p_x.email", "2026-11-19T10:00:00.000Z"),
  L("m0", -1, "unlock", "e_s1.operator", "2026-11-19T10:00:00.000Z"),
  L("m1", 0, "unlock", "c_c1.identity", "2026-11-19T10:00:00.000Z", { why: "free" }),
  L("n0", 5, "referral", "m0.referral", "2026-11-18T12:00:00.000Z"),
  L("m0", 40, "plan", "plan.in_1.2026-11", "2026-11-17T10:00:00.000Z"),
  L("m1", 25, "topup", "topup.cs_1", "2026-11-17T10:00:00.000Z"),
  L("m2", 3, "adjust", "starter.floor", "2026-11-17T10:00:00.000Z"),
  L("m3", 1, "refund", "c_c3.identity", "2026-11-17T10:00:00.000Z"),
  L("m4", -1, "reversal", "c_c4.industry", "2026-11-17T10:00:00.000Z"),
  // Older than 12 weeks: in no week.
  L("m5", 1, "fill", "c_old.industry", "2026-08-01T10:00:00.000Z"),
];
const values: Record<string, { value: string; by: string; at: string; status: string }> = {};
range(0, 29).forEach((id, i) => (values[i < 15 ? `e_s${i}.rate` : `c_c${i}.industry`] = { value: "x", by: id, at: at(2), status: "live" }));
["email", "phone", "linkedin"].forEach((f) => (values[`p_x.${f}`] = { value: "x", by: "m0", at: "2026-11-18T11:00:00.000Z", status: "live" }));
// Imported: three scan values and a website read this week, a removed one, an empty one.
["a", "b", "c"].forEach((k) => (values[`e_scan${k}.status`] = { value: "Open role", by: "scan", at: "2026-11-17T08:00:00.000Z", status: "live" }));
values["c_w.about"] = { value: "We make things.", by: "website", at: "2026-11-17T09:00:00.000Z", status: "live" };
values["c_gone.about"] = { value: "Gone.", by: "website", at: "2026-11-17T09:00:00.000Z", status: "removed" };
values["c_blank.about"] = { value: "", by: "scan", at: "2026-11-17T09:00:00.000Z", status: "live" };
// 9 member facts confirmed by another member; one "confirmed" only by its own author (not counted).
const verifications: Record<string, string[]> = {};
range(0, 8).forEach((_, i) => (verifications[`e_s${i}.rate`] = ["m50"]));
verifications["c_c20.industry"] = ["m20"];
// Coming back: m0..m11 in week 1, m0..m23 and m30..m35 in week 4, m0..m2 in week 8. An email open in week 4 for m59 is not a visit.
const signals = [
  ...range(0, 11).map((id) => ({ memberId: id, name: "pro_view", where: "hidden_company", at: at(8) })),
  ...[...range(0, 23), ...range(30, 35)].map((id) => ({ memberId: id, name: "wall", where: "zero_credits", at: at(30) })),
  { memberId: "m59", name: "radar_opened", where: "email", at: at(30) },
  // Crystal Ball emails in the last 30 days: 25 sent, 12 opened, 3 clicked.
  ...range(0, 24).map((id) => ({ memberId: id, name: "radar_sent", where: "email", at: "2026-11-10T13:00:00.000Z" })),
  ...range(0, 11).map((id) => ({ memberId: id, name: "radar_opened", where: "email", at: "2026-11-10T15:00:00.000Z" })),
  ...range(0, 2).map((id) => ({ memberId: id, name: "radar_clicked", where: "email", at: "2026-11-10T15:05:00.000Z" })),
];
const state = {
  members,
  ledger,
  values,
  verifications,
  signals,
  unlocks: {},
  profiles: Object.fromEntries(range(0, 59).map((id) => [id, { onboarded: true }])),
  follows: {},
  referralPaid: ["n0"],
  reportLog: [],
  held: [],
  benchRates: [],
  notMine: {},
  lockedViews: range(0, 2).map((id) => ({ memberId: id, companyId: "c_c1", day: "2026-10-28" })),
  seen: {},
  companies: [
    { id: "c_scan1", name: "Scanned One", by: "scan", at: "2026-10-06T08:00:00.000Z" },
    { id: "c_scan2", name: "Scanned Two", by: "scan", at: "2026-10-07T08:00:00.000Z" },
    { id: "c_mine", name: "Member Made", by: "m0", at: "2026-10-07T08:00:00.000Z" },
  ],
  engagements: [],
  contacts: [],
  conversations: range(0, 4).map((id, i) => ({ id: `cv${i}`, a: id, b: "m50", about: { companyId: "c_c1", engagementId: "e_s1" }, messages: [{ id: `x${i}`, by: id, at: at(4), text: "hello" }], readAt: {}, status: "open", createdAt: at(4) })),
  seatInvites: [
    { by: "m0", engagementId: "e_s1", at: at(5), claimedBy: "n9", claimedAt: at(6) },
    { by: "m1", engagementId: "e_s2", at: at(5) },
    { by: "m2", engagementId: "e_s3", at: at(5) },
  ],
  billing: {
    members: Object.fromEntries(range(0, 24).map((id, i) => [id, { trialStartedAt: "2026-09-17T00:00:00.000Z", trialEndsAt: "2026-10-01T00:00:00.000Z", ...(i < 3 ? { paidSince: "2026-10-01T00:00:00.000Z", proUntil: "2026-12-21T00:00:00.000Z" } : {}) }])),
    events: [],
    payments: [],
    ended: [],
  },
  scan: { lastRunAt: null, sources: [], roles: {} },
  digest: { lastSentAt: null, sent: 0, members: {} },
  flags: {},
};
const isMember = new Set(members.map((m) => m.id));
const entityOf = (id: string) => (id.startsWith("e_") ? "engagement" : id.startsWith("p_") ? "contact" : "company") as "company" | "engagement" | "contact";

async function main() {
  const H = await import("../lib/health");
  type State = Parameters<typeof H.healthStats>[0]["s"];
  const h = H.healthStats({
    s: state as unknown as State,
    nowMs: NOW,
    starter: 25,
    entityOf,
    isMember: (id) => isMember.has(id),
    billing: true,
    seatImports: [{ at: "2026-11-02T08:00:00.000Z", facts: 7 }, { at: "2026-06-01T08:00:00.000Z", facts: 9 }],
  });

  console.log("Activation and retention");
  check("weeks start on Monday, UTC", new Date(H.weekStart(NOW)).toISOString() === "2026-11-16T00:00:00.000Z" && new Date(H.weekStart(Date.parse("2026-11-16T00:00:00Z"))).toISOString() === "2026-11-16T00:00:00.000Z");
  check(
    "the funnel: 62 joined, 60 onboarded, 30 added a fact, 10 unlocked, 5 sent a message or invite",
    same(h.funnel, [
      { step: "Joined", n: 62 },
      { step: "Finished onboarding", n: 60 },
      { step: "Added a first fact", n: 30 },
      { step: "Made a first unlock", n: 10 },
      { step: "Sent a first message or invite", n: 5 },
    ]),
    h.funnel,
  );
  check(
    "retention by month: Sep 12 of 60 in week 1, 30 of 60 in week 4, 3 of 60 in week 8 (an email open is not a visit); Nov's weeks aren't over",
    same(h.cohorts, [
      { month: "2026-09", joined: 60, w1: { back: 12, of: 60 }, w4: { back: 30, of: 60 }, w8: { back: 3, of: 60 } },
      { month: "2026-11", joined: 2, w1: { back: 0, of: 0 }, w4: { back: 0, of: 0 }, w8: { back: 0, of: 0 } },
    ]),
    h.cohorts,
  );

  console.log("\nFacts and credits");
  check("12 weeks, Aug 31 to Nov 16", h.weeks.length === 12 && h.weeks[0].week === "2026-08-31" && h.weeks[11].week === "2026-11-16", h.weeks.map((w) => w.week));
  const memberWeeks = h.weeks.map((w) => w.member);
  const importedWeeks = h.weeks.map((w) => w.imported);
  check("member facts a week: 30 in the first, 3 this week (a fact twice, undone, a bench rate and an old one left out)", same(memberWeeks, [30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]), memberWeeks);
  check("scanned or imported: 2 scanned companies in Oct 5's week, a 7-fact seat scan in Nov 2's, 4 values this week (removed and empty left out)", same(importedWeeks, [0, 0, 0, 0, 0, 2, 0, 0, 0, 7, 0, 4]), importedWeeks);
  check("33 member facts on file, 9 confirmed by a second member (one confirmed by its own author is not)", same(h.confirmed, { facts: 33, confirmed: 9 }), h.confirmed);
  const zeroE = { seats: 0, facts: 0, invites: 0, pro: 0, topups: 0, starting: 0, refunds: 0 };
  const zeroS = { company: 0, person: 0, contact: 0, other: 0, takenBack: 0 };
  check("credits in the first week: 15 from seats, 16 from company facts (a fill later undone still earned; its reversal is taken back), 1,500 starting; 20 on companies, 375 on other facts", same(h.credits[0], { week: "2026-08-31", earned: { ...zeroE, seats: 15, facts: 16, starting: 1500 }, spent: { ...zeroS, company: 20, other: 375 } }), h.credits[0]);
  check(
    "credits this week, every source and use: a bench rate is a seat, a free unlock spends 0, the floor adjustment is starting credits",
    same(h.credits[11], { week: "2026-11-16", earned: { seats: 1, facts: 3, invites: 5, pro: 40, topups: 25, starting: 53, refunds: 1 }, spent: { company: 0, person: 1, contact: 1, other: 1, takenBack: 1 } }),
    h.credits[11],
  );
  check("and nothing in the weeks between", h.credits.slice(1, 11).every((w) => same(w.earned, zeroE) && same(w.spent, zeroS)), h.credits.slice(1, 11));

  console.log("\nInvites, plans, outcomes");
  check("invites: 3 sent, 2 joined through one, 1 bonus paid, 5 bonus credits", same(h.invites, { sent: 3, joined: 2, bonusMembers: 1, bonusCredits: 5 }), h.invites);
  check("plans: 25 trials ended, 3 paid, 3 paid now", same(h.plans, { billing: true, trialsEnded: 25, trialsPaid: 3, paidNow: 3 }), h.plans);
  const row = (rows: { label: string; n: number; unit?: string }[] | null, label: string) => rows?.find((x) => x.label === label);
  check(
    "outcomes: wired, every count 0 with nobody's pipeline, no share with nothing to divide by",
    Array.isArray(h.outcomes) && h.outcomes.length === 16 && row(h.outcomes, "Won from a signed proposal")?.n === 0 && h.outcomes.every((x) => x.n === 0) && !h.outcomes.some((x) => x.unit === "%") && row(h.outcomes, "Deals")?.n === 0,
    h.outcomes,
  );

  console.log("\nWhat's working, what isn't");
  const w = h.insights.working;
  const nw = h.insights.notWorking;
  check(
    "working, biggest effect first: the first-week fact, onboarding, Crystal Ball emails, trial to paid",
    same(
      w.map((x) => x.text),
      [
        "Members who add a fact in their first week come back in week 4 4 times as often (80% vs 20%).",
        "97% of members who joined go on to finish onboarding.",
        "Crystal Ball emails: 48% opened, 12% clicked.",
        "12% of trials turn into a paid plan.",
      ],
    ),
    w,
  );
  check(
    "each says the numbers behind it and the group sizes",
    w[0]?.detail === "24 of 30 members vs 6 of 30 who don't. Members who joined at least 5 weeks ago." && w[1]?.detail === "60 of 62 members." && w[2]?.detail === "12 opens and 3 clicks of 25 emails to 25 members, the last 30 days. Some mail apps hide opens." && w[3]?.detail === "3 of 25 trials that ended.",
    w.map((x) => x.detail),
  );
  check(
    "not working: first-week unlockers come back less, most stop before a first unlock, a quarter run out of credits",
    same(
      nw.map((x) => x.text),
      [
        "Members who unlock something in their first week come back in week 4 less often (40% vs 57%).",
        'Most members stop after "Added a first fact": 67% never get to "Made a first unlock".',
        "25% of members run out of credits in their first week, by day 3 for half of them.",
      ],
    ),
    nw,
  );
  check("with their numbers", nw[0]?.detail === "10 of 25 members vs 20 of 35 who don't. Members who joined at least 5 weeks ago." && nw[1]?.detail === "10 of 30 members did. Each step counts members who did every step before it." && nw[2]?.detail === "15 of 60 members who joined at least a week ago. Out means a balance of 0 or less.", nw.map((x) => x.detail));
  check("ranked by effect", [w, nw].every((l) => l.every((x, i) => i === 0 || l[i - 1].effect >= x.effect)), [w.map((x) => x.effect), nw.map((x) => x.effect)]);
  const wait = h.insights.waiting;
  check(
    "groups under 20 members are not compared: onboarding, Google, the connector, Slack, invites, a deal in Your pipeline, the last funnel step, invites taken up, replies, wins through Merlin",
    wait.length === 10 &&
      wait.includes("Coming back in week 4, with and without a deal in Your pipeline: not enough members yet (0 and 60, 20 needed in each).") &&
      wait.includes("Replies to what members sent: not enough members yet (0 have a deal at Sent, 20 needed).") &&
      wait.includes("Wins through Merlin: not enough members yet (0 won a deal, 20 needed).") &&
      wait[0] === "Coming back in week 4, with and without onboarding: not enough members yet (60 and 0, 20 needed in each)." &&
      wait.some((x) => x.startsWith("Coming back in week 4, with and without Google: not enough members yet (0 and 60")) &&
      wait.includes("Sent a first message or invite: not enough members yet (10 reached the step before, 20 needed).") &&
      wait.includes("Invites: not enough members yet (3 sent one, 20 needed)."),
    wait,
  );
  // More than 5 statements: only the 5 biggest stay.
  const many = { ...state, members: [...state.members], billing: state.billing };
  const h5 = H.healthStats({ s: many as unknown as State, nowMs: NOW, starter: 25, entityOf, isMember: (id) => isMember.has(id), billing: true });
  check("at most 5 of each", h5.insights.working.length <= 5 && h5.insights.notWorking.length <= 5);
  check("never a name or an email anywhere in Health", !/Name m|@example\.com|tok-/.test(JSON.stringify(h)));

  console.log("\nOutcomes from members' pipelines");
  // m0..m24 each have one deal sent from a move (a note used). m0..m20 won it (replied from Gmail, met on
  // the calendar, Won marked by the member, $5,000 a month), m0..m14 through Merlin by their own answer;
  // m0's win became a seat and came through an intro that was made; m0 asked for another one. m21..m24
  // are still at Sent with a follow-up due yesterday. m25..m59 have no pipeline.
  const won = (i: number) => i <= 20;
  const pipeline = Object.fromEntries(
    range(0, 24).map((id, i) => [
      id,
      {
        entries: [
          {
            id: `pl_${i}`,
            companyId: `c_p${i}`,
            stage: won(i) ? "won" : "sent",
            channel: "email",
            to: { role: "CEO", name: i === 1 ? "Private Person" : null, google: i === 1 },
            source: "move",
            dates: won(i) ? { sent: at(10), replied: at(12), meeting: at(14), won: at(20) } : { sent: "2026-11-17T10:00:00.000Z" },
            via: won(i) ? { sent: "note", replied: "gmail", meeting: "calendar", won: "you" } : { sent: "note" },
            due: won(i) ? null : "2026-11-20",
            follow: 0,
            lastOut: won(i) ? at(10) : "2026-11-17T10:00:00.000Z",
            seen: {},
            notes: [{ at: at(10), text: "Private note text" }],
            log: [],
            ...(won(i) ? { won: { pricing: "monthly", rate: 5000, hours: null, start: null, months: null, merlin: i < 15, at: at(20) } } : {}),
            ...(i === 0 ? { seatId: "e_won0", introId: "in_0" } : {}),
            createdAt: at(10),
            updatedAt: at(20),
          },
        ],
        intros: i === 0 ? [{ id: "in_0", companyId: "c_p0", introducer: { name: "Intro Person" }, status: "made", askedAt: at(8), madeAt: at(9) }, { id: "in_1", companyId: null, introducer: { role: "Investor" }, status: "asked", askedAt: at(9) }] : [],
      },
    ]),
  );
  const hp = H.healthStats({ s: { ...state, pipeline } as unknown as State, nowMs: NOW, starter: 25, entityOf, isMember: (id) => isMember.has(id), billing: true });
  check(
    "the rows: 25 members, 25 deals, how far they got, 21 won and 15 through Merlin, none from a signed proposal, 1 a seat, $105,000 and $75,000 a month, 4 follow-ups due",
    same(hp.outcomes?.slice(0, 13), [
      { label: "Members with a deal", n: 25 },
      { label: "Deals", n: 25 },
      { label: "Reached Sent", n: 25 },
      { label: "Reached Replied", n: 21 },
      { label: "Reached Meeting", n: 21 },
      // The 21 won deals went Sent, Replied, Meeting, Won with no proposal: none reached Proposal (outcomeStats counts a stage only when it happened).
      { label: "Reached Proposal", n: 0 },
      { label: "Won", n: 21 },
      { label: "Won through Merlin", n: 15 },
      { label: "Won from a signed proposal", n: 0 },
      { label: "Won that became a seat", n: 1 },
      { label: "Won, a month", n: 105000, unit: "$" },
      { label: "Won through Merlin, a month", n: 75000, unit: "$" },
      { label: "Follow-ups due now", n: 4 },
    ]),
    hp.outcomes,
  );
  check(
    "then the shares, what the stages were seen from, and the intros",
    same(hp.outcomes?.slice(13), [
      { label: "Sent to Replied", n: 84, unit: "%" },
      { label: "Replied to Meeting", n: 100, unit: "%" },
      { label: "Meeting to Won", n: 100, unit: "%" },
      { label: "Sent to Won", n: 84, unit: "%" },
      { label: "Stages seen from a note used or Mark as sent", n: 25 },
      { label: "Stages seen from Gmail", n: 21 },
      { label: "Stages seen from the calendar", n: 21 },
      { label: "Stages seen from the member", n: 21 },
      { label: "Intros asked", n: 2 },
      { label: "Intros made", n: 1 },
      { label: "Intros that led to a win", n: 1 },
    ]),
    hp.outcomes?.slice(13),
  );
  const pw = [...hp.insights.working, ...hp.insights.notWorking];
  const reply = pw.find((x) => x.text.includes("gets a reply"));
  const viaM = pw.find((x) => x.text.includes("came through Merlin"));
  const comeBack = pw.find((x) => x.text.startsWith("Members who have a deal in Your pipeline"));
  check("with 25 members at Sent: 84% of what members send gets a reply, working, with its numbers", hp.insights.working.includes(reply!) && reply?.text === "84% of what members send gets a reply." && reply.detail === "21 of 25 deals sent, from 25 members. Merlin moves a deal to Replied when it sees the reply.", reply);
  check("with 21 members who won: 71% came through Merlin, working", hp.insights.working.includes(viaM!) && viaM?.text === "71% of the deals members win came through Merlin." && viaM.detail === "15 of 21 won deals, from 21 members. Through Merlin is the member's own answer when they mark it Won.", viaM);
  check(
    "with 25 and 35: members with a deal come back in week 4 6 times as often (96% vs 17%)",
    comeBack?.text === "Members who have a deal in Your pipeline come back in week 4 6 times as often (96% vs 17%)." && comeBack.detail === "24 of 25 members vs 6 of 35 who don't. Members who joined at least 5 weeks ago.",
    comeBack ?? pw.map((x) => x.text),
  );
  check("none of the three is waiting any more", !hp.insights.waiting.some((x) => /Replies to|Wins through Merlin|a deal in Your pipeline/.test(x)), hp.insights.waiting);
  // 19 members who won: the wins share waits (20 needed), the reply rate (25 at Sent) still says.
  const p19 = Object.fromEntries(Object.entries(pipeline).map(([id, log], i) => [id, i < 19 || i > 20 ? log : { ...log, entries: log.entries.map((e) => ({ ...e, stage: "proposal", won: undefined, dates: { ...e.dates, won: undefined, proposal: at(18) } })) }]));
  const h19 = H.healthStats({ s: { ...state, pipeline: p19 } as unknown as State, nowMs: NOW, starter: 25, entityOf, isMember: (id) => isMember.has(id), billing: true });
  check("19 members who won: wins through Merlin waits, replies still said", h19.insights.waiting.includes("Wins through Merlin: not enough members yet (19 won a deal, 20 needed).") && [...h19.insights.working, ...h19.insights.notWorking].some((x) => x.text.includes("gets a reply")), h19.insights.waiting);
  check("never a name, a company, a note or a title from a pipeline in Health", !/Private Person|Intro Person|Private note|c_p\d|pl_\d|in_\d|CEO|Investor/.test(JSON.stringify(hp)));

  console.log("\nThe Health block and the data page");
  const React = await import("react");
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const AH = await import("../app/post/AdminHealth");
  const html = renderToStaticMarkup(React.createElement(AH.Health, { h }));
  check("it renders: What's working, What isn't, and each table", ["What&#x27;s working", "What isn&#x27;t", "Activation", "Coming back, by month joined", "Facts added, last 12 weeks", "Credits earned, last 12 weeks", "Credits spent, last 12 weeks", "Invites", "Plans", "Outcomes"].every((t) => html.includes(t)), html.slice(0, 400));
  check("every table has its Copy as CSV (5)", (html.match(/>Copy as CSV</g) ?? []).length === 5);
  check("the outcomes slot is live: its rows, and No deals in anyone's pipeline yet while there are none", html.includes("Members with a deal") && html.includes("No deals in anyone&#x27;s pipeline yet.") && !html.includes("Deal tracking not live yet."));
  const hpHtml = renderToStaticMarkup(React.createElement(AH.Health, { h: hp }));
  check("with deals: dollars a month and shares as such, and no empty note", hpHtml.includes("$105,000") && hpHtml.includes("84%") && !hpHtml.includes("No deals in anyone") && !/Private Person|Private note/.test(hpHtml));
  const notLive = renderToStaticMarkup(React.createElement(AH.Health, { h: { ...h, outcomes: null } }));
  check("a state without the pipeline at all reads Deal tracking not live yet", notLive.includes("Deal tracking not live yet."));
  check("the statements and their numbers are on it", html.includes("80% vs 20%") && html.includes("24 of 30 members vs 6 of 30"));
  check("the cohort cells say the share and the counts", html.includes("50% (30/60)") && html.includes("Sep 2026"));
  check("no name or email in the markup", !/Name m|@example\.com/.test(html));
  const csv = AH.toCsv(["Week of", "By members"], [["2026-11-16", 3], ['say "hi", ok', 1]]);
  check("CSV: a header row, a row each, fields with a comma or a quote quoted", csv === 'Week of,By members\n2026-11-16,3\n"say ""hi"", ok",1', csv);
  const off = renderToStaticMarkup(React.createElement(AH.Health, { h: { ...h, plans: { billing: false, trialsEnded: 0, trialsPaid: 0, paidNow: 0 }, outcomes: [{ label: "Deals won", n: 4 }] } }));
  check("billing off says so; outcomes show once they are wired", off.includes("Billing is off") && off.includes("Deals won") && !off.includes("Deal tracking not live yet"));

  const DF = await import("../app/data/DataFlows");
  const page = renderToStaticMarkup(React.createElement(DF.DataFlows));
  check(
    "the data page answers the four questions",
    ["When an AI model is used", "train someone&#x27;s AI model", "Who receives what", "Who can switch it off"].every((t) => page.includes(t)),
    page.slice(0, 300),
  );
  check("it says the server calls no AI model, and Google's Limited Use", page.includes("calls no AI model") && page.includes("Limited Use") && page.includes("never used to train AI models"));
  check(
    "it names every outside service",
    ["Company websites", "Job boards", "SEC EDGAR", "Google", "Resend", "Stripe", "Slack", "Backup storage", "Railway", "AI assistants"].every((t) => page.includes(t)),
  );
  check("no owner notes, no LinkedIn, no em dashes on the public page", !/To confirm|linkedin|—/i.test(page), (page.match(/.{40}(To confirm|linkedin|—).{40}/i) ?? [])[0]);
  const { readFileSync } = await import("node:fs");
  const md = readFileSync(new URL("../docs/data-flows.md", import.meta.url), "utf8");
  check("docs/data-flows.md has the same four parts and its To confirm notes", ["## 1. When an AI model is used", "## 2.", "## 3.", "## 4. Who can switch a feature off"].every((t) => md.includes(t)) && /\*\*To confirm:\*\*/.test(md));
  const landing = readFileSync(new URL("../app/landing/Landing.tsx", import.meta.url), "utf8");
  const credits = readFileSync(new URL("../app/post/Credits.tsx", import.meta.url), "utf8");
  check("the landing page's footer and Your credits link to it", landing.includes('href="/data"') && credits.includes("<DataLink />"));

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
