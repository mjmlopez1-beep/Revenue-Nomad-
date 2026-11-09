#!/usr/bin/env node
// Builds data/rate-index.json (aggregates only, no names, emails or operator pay) from exports of the
// research data source, the Google Sheet "2027 State of Fractional Report" (the system of record behind
// The State of Fractional GTM 2027). Export each tab with the Google Sheets connector as JSON
// ({range, values}) and run:
//   node scripts/build-rate-index.mjs <survey.json> <platform.json> <engagements.json> [as-of YYYY-MM-DD]
// Tabs: "The State of Fractional GTM 2027 Survey" (A2:BP), "Platform Signups 2026" (A2:AL), "Engagements" (A2:Y).
import { readFileSync, writeFileSync } from "node:fs";

const [surveyPath, platformPath, engagementsPath, asOf = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!surveyPath || !platformPath || !engagementsPath) {
  console.error("usage: build-rate-index.mjs <survey.json> <platform.json> <engagements.json> [as-of]");
  process.exit(2);
}
const load = (p, width) =>
  JSON.parse(readFileSync(p, "utf8"))
    .values.filter((r) => r.some((c) => String(c ?? "").trim()))
    .map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("")]);
const survey = load(surveyPath, 70);
const platform = load(platformPath, 40);
const engagements = load(engagementsPath, 26);

const num = (v) => {
  const m = String(v ?? "").match(/-?\d[\d,]*\.?\d*/);
  return m ? Number(m[0].replace(/,/g, "")) : null;
};
const sorted = (a) => a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
const quantile = (a, q) => {
  const s = sorted(a);
  if (!s.length) return null;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round(s[lo] + (s[hi] - s[lo]) * (pos - lo));
};
const median = (a) => quantile(a, 0.5);
const stats = (a) => ({ n: sorted(a).length, p25: quantile(a, 0.25), median: median(a), p75: quantile(a, 0.75) });

// Survey columns (0-based): 2 role category, 12 region, 14 rate today, 15 rate 12 months ago, 16 plan,
// 24 client revenue, 26 hours a month, 27 effective rate, 28 initial term, 33 extended, 34 time to result,
// 37 second client revenue, 38 second client hours, 39 second client rate, 40 demand vs 12 months, 61 src.
const S = { role: 2, rate: 14, rateAgo: 15, plan: 16, rev: 24, why: 25, hours: 26, eff: 27, term: 28, extended: 33, ttr: 34, rev2: 37, hours2: 38, eff2: 39, demand: 40, ai: 42, src: 61 };
const hoursCode = (v) => {
  const m = String(v).match(/(\d+)/);
  if (!m) return null;
  const h = Number(m[1]);
  return String(v).startsWith("<") ? 15 : h; // "<20 hrs / month" is counted as 15
};

// 1. Hourly rates, one table: survey answers plus platform listings appended to the survey tab (deduped upstream).
const rateRows = survey.filter((r) => num(r[S.rate]) != null);
const surveyAnswers = rateRows.filter((r) => !String(r[S.src]).startsWith("rn_"));
const platformListings = rateRows.filter((r) => String(r[S.src]).startsWith("rn_"));
const categories = ["Sales Leadership", "Marketing", "Revenue Operations", "Sales Enablement", "Customer Success & Growth", "AI GTM", "Partnerships", "Front-line Sellers / SDR"];
const byCategory = categories.map((cat) => {
  const rows = rateRows.filter((r) => r[S.role] === cat);
  return { category: cat, ...stats(rows.map((r) => num(r[S.rate]))), surveyN: rows.filter((r) => !String(r[S.src]).startsWith("rn_")).length };
});
const allRates = stats(rateRows.map((r) => num(r[S.rate])));

// 2. Engagements described in the survey: hours x effective rate = monthly spend; first and second client.
const eng = [];
for (const r of survey) {
  for (const [rev, hrs, eff] of [[S.rev, S.hours, S.eff], [S.rev2, S.hours2, S.eff2]]) {
    const h = hoursCode(r[hrs]), e = num(r[eff]);
    if (h == null && !r[rev]) continue;
    eng.push({ role: r[S.role], revenue: r[rev], hours: h, rate: e, monthly: h != null && e != null ? h * e : null, term: r[S.term], extended: r[S.extended], ttr: r[S.ttr], first: hrs === S.hours });
  }
}
const firstClient = eng.filter((x) => x.first);

const revenueBands = ["Pre-revenue", "Under $1M", "$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M+"];
const byRevenue = revenueBands.map((band) => {
  const rows = eng.filter((x) => x.revenue === band);
  return { band: band.replace("–", " - "), engagements: rows.length, share: eng.length ? Math.round((rows.length / eng.filter((x) => x.revenue).length) * 100) : 0, medianMonthly: median(rows.map((x) => x.monthly)), monthlyN: sorted(rows.map((x) => x.monthly)).length };
});

const hoursBands = [
  { label: "Under 20", test: (h) => h < 20 },
  { label: "20 - 39", test: (h) => h >= 20 && h < 40 },
  { label: "40 - 59", test: (h) => h >= 40 && h < 60 },
  { label: "60+", test: (h) => h >= 60 },
];
const byHours = hoursBands.map((b) => {
  const rows = eng.filter((x) => x.hours != null && x.rate != null && b.test(x.hours));
  return { band: b.label, ...stats(rows.map((x) => x.rate)), typicalMonth: median(rows.map((x) => x.monthly)) };
});

const monthlyByCategory = categories.map((cat) => {
  const rows = eng.filter((x) => x.role === cat && x.monthly != null);
  return { category: cat, medianMonthly: median(rows.map((x) => x.monthly)), medianHours: median(rows.map((x) => x.hours)), n: rows.length };
});

// 3. Terms and outcomes (first client, survey answers with a term).
const termed = firstClient.filter((x) => x.term);
const termShare = ["1 to 3 months", "3 to 6 months", "6 to 12 months", "12+ months"].map((t) => ({ term: t, share: Math.round((termed.filter((x) => x.term === t).length / termed.length) * 100) }));
const extendedRows = firstClient.filter((x) => x.extended === "TRUE" || x.extended === "FALSE");
const extendedShare = Math.round((extendedRows.filter((x) => x.extended === "TRUE").length / extendedRows.length) * 100);
const ttrRows = firstClient.filter((x) => x.ttr && x.ttr !== "Not measured");
const resultInside60 = Math.round((ttrRows.filter((x) => x.ttr === "Under 30 days" || x.ttr === "30 to 60 days").length / ttrRows.length) * 100);

// 4. Movement: operators who gave both rates; plans; demand.
const both = surveyAnswers.filter((r) => num(r[S.rateAgo]) != null && num(r[S.rate]) != null).map((r) => ({ now: num(r[S.rate]), ago: num(r[S.rateAgo]) }));
const movement = {
  n: both.length,
  raised: both.filter((x) => x.now > x.ago).length,
  held: both.filter((x) => x.now === x.ago).length,
  cut: both.filter((x) => x.now < x.ago).length,
  medianChangePct: median(both.filter((x) => x.ago > 0).map((x) => ((x.now - x.ago) / x.ago) * 100)),
};
const plans = surveyAnswers.filter((r) => r[S.plan]);
const plan = { n: plans.length, raise: plans.filter((r) => r[S.plan] === "Raise your rate").length, hold: plans.filter((r) => r[S.plan] === "Keep it the same").length, lower: plans.filter((r) => r[S.plan] === "Lower it").length };
const demandRows = surveyAnswers.filter((r) => num(r[S.demand]) != null);
const demand = { n: demandRows.length, up: demandRows.filter((r) => num(r[S.demand]) >= 4).length, flat: demandRows.filter((r) => num(r[S.demand]) === 3).length, down: demandRows.filter((r) => num(r[S.demand]) <= 2).length };

// 4b. Figures the solution pages quote (survey answers only).
const aiRows = surveyAnswers.filter((r) => r[S.ai]);
const aiUse = { n: aiRows.length, share: Math.round((aiRows.filter((r) => r[S.ai] !== "None").length / aiRows.length) * 100), most: Math.round((aiRows.filter((r) => r[S.ai] === "Most").length / aiRows.length) * 100) };
const demandByCategory = categories.map((cat) => {
  const rows = surveyAnswers.filter((r) => r[S.role] === cat && num(r[S.demand]) != null);
  return { category: cat, n: rows.length, mean: rows.length ? Math.round((rows.reduce((a, r) => a + num(r[S.demand]), 0) / rows.length) * 10) / 10 : null };
});
const whyRows = surveyAnswers.filter((r) => String(r[S.why]).trim());
const founderHandoff = { n: whyRows.length, count: whyRows.filter((r) => /founder|ceo|owner/i.test(r[S.why])).length };
founderHandoff.share = whyRows.length ? Math.round((founderHandoff.count / whyRows.length) * 100) : null;

// 5. What companies paid: Revenue Nomad direct contracts only (client-billed figures; the Skaled subcontract
// book records operator pay, which is confidential and not a price companies paid). Columns: 0 book,
// 4 role title, 5 role category, 7 hourly, 8 monthly fee, 10 hours a month, 20 status.
const direct = engagements.filter((r) => r[0] === "Revenue Nomad direct");
const seatOf = (title, cat) => {
  const t = title.toLowerCase();
  if (t.includes("interim")) return "Interim head of sales";
  if (t.includes("cro") || t.includes("chief revenue") || t.includes("revenue architect") || t.includes("transformation")) return "CRO and revenue transformation";
  if (t.includes("assessment") || t.includes("diagnostic") || t.includes("maturity")) return "Revenue Health Diagnostic";
  if (cat === "Revenue Operations") return "Revenue operations leader";
  if (cat === "Marketing") return "Fractional CMO";
  if (cat === "Sales Enablement") return "Sales enablement lead";
  if (cat === "AI GTM") return "AI GTM lead";
  return "Sales Director or VP of Sales";
};
const seats = {};
for (const r of direct) {
  const seat = seatOf(r[4], r[5]);
  const s = (seats[seat] = seats[seat] || { seat, contracts: 0, hourly: [], hours: [], monthly: [] });
  s.contracts += 1;
  const h = num(r[7]), hrs = num(r[10]), m = num(r[8]);
  if (h != null && h >= 50) s.hourly.push(h);
  if (hrs != null) s.hours.push(hrs);
  if (m != null && m >= 1000) s.monthly.push(m);
}
const range = (a) => (sorted(a).length ? { min: sorted(a)[0], max: sorted(a).at(-1) } : null);
const contracts = Object.values(seats).map((s) => ({ seat: s.seat, contracts: s.contracts, hourly: range(s.hourly), hours: range(s.hours), monthly: range(s.monthly) }));
const directHourly = stats(direct.map((r) => num(r[7])).filter((h) => h != null && h >= 50));
const activeDirect = direct.filter((r) => /active/i.test(r[20])).length;

const out = {
  asOf,
  source: {
    title: "2027 State of Fractional Report (Google Sheet), the research data source behind The State of Fractional GTM 2027",
    tabs: ["The State of Fractional GTM 2027 Survey", "Platform Signups 2026", "Engagements"],
    note: "Hourly rates: operator survey answers plus Revenue Nomad platform listings appended to the survey tab (operators already in the survey are not double counted). Monthly spend, company-size and hours figures: engagements described in the operator survey (first and second client), monthly spend = hours a month x effective hourly rate. Contract ranges: Revenue Nomad direct agreements only, as billed to the company. Cuts under 10 are directional.",
  },
  rates: { all: allRates, surveyN: surveyAnswers.length, platformN: platformListings.length, byCategory, publicationFloor: 10 },
  engagements: { n: eng.length, firstClientN: firstClient.length, byRevenue, byHours, monthlyByCategory, termShare, extendedShare, resultInside60, ttrN: ttrRows.length, extendedN: extendedRows.length },
  movement: { ...movement, plan, demand },
  survey: { aiUse, demandByCategory, founderHandoff },
  contracts: { direct: direct.length, active: activeDirect, hourly: directHourly, bySeat: contracts },
};
writeFileSync(new URL("../data/rate-index.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 1));
