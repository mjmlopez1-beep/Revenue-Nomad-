// Revenue Nomad fit score, reference implementation.
// Out of 100. Skills and role 35, experience 30, budget 15, hours 20.
// Screening answers are not scored yet (answersScore hook returns 0 and is not shown).
// Reproduces the numbers on the design canvas and in seed/operators.json fitSampleBriefs.

const SEAT_CATEGORIES = [
  [/rev(enue)?\s*op|revops|sales operations/i, "Revenue Operations"],
  [/enablement/i, "Sales Enablement"],
  [/customer success|\bcs\b|retention/i, "Customer Success & Growth"],
  [/marketing|cmo|demand gen/i, "Marketing"],
  [/partner/i, "Partnerships"],
  [/\bai\b/i, "AI GTM"],
  [/account executive|\bae\b|seller/i, "Sellers"],
  [/sales|cro|revenue officer/i, "Sales Leadership"],
];

// Keyword sets used for the two seeded briefs. For a new brief, pass mustHaves and the
// generic path builds keywords from them.
const PRESET_KEYWORDS = {
  "Sales Leadership": ["playbook", "sales process", "hiring", "onboarding", "coaching", "hubspot", "forecast", "pipeline", "outbound", "discovery", "meddic", "abm"],
  "Revenue Operations": ["hubspot", "crm", "forecast", "pipeline", "revops", "revenue operations", "reporting", "dashboard", "comp", "territor", "sales process", "salesforce"],
};

export function seatCategory(title) {
  for (const [re, cat] of SEAT_CATEGORIES) if (re.test(title)) return cat;
  return "Sales Leadership";
}

export function briefFromProject(p) {
  const cat = seatCategory(p.title);
  const kw = PRESET_KEYWORDS[cat] || (p.mustHaves || []).map((m) => m.toLowerCase());
  // Revenue Nomad projects pay a fixed operator rate, so anyone at or under it is inside budget.
  const rn = p.origin === "revenue_nomad";
  const rmin = rn ? 0 : (p.budgetMin ?? 0);
  const rmax = rn ? p.operatorRate : (p.budgetMax ?? 0);
  return { cat, kw, rmin, rmax, hmin: p.hoursPerMonthMin, hlabel: `${p.hoursPerMonthMin}-${p.hoursPerMonthMax}` };
}

// op needs cat, role, allTags, allIndustries, eng, rate, hrs
export function fitScore(op, brief, overrides = {}) {
  const rate = overrides.rate ?? op.rate;
  const hrs = overrides.hoursPerMonth ?? op.hrs ?? 0;
  const tags = op.allTags || [];
  const tl = tags.join(" | ").toLowerCase();
  const role = op.role || "";
  let sk, roleMatch;
  if (brief.cat === "Revenue Operations") {
    sk = op.cat === "Revenue Operations" ? 20 : (op.cat === "Sales Leadership" && /VP|Chief|Head/.test(role) ? 12 : 6);
    if (/Revenue Operations|RevOps|Sales Operations/.test(role)) sk += 5;
    roleMatch = op.cat === "Revenue Operations";
  } else if (brief.cat === "Sales Leadership") {
    sk = op.cat === "Sales Leadership" && /VP|Chief|Head|Director/.test(role) ? 22 : op.cat === "Sales Leadership" ? 14 : ["Sales Enablement", "Sellers"].includes(op.cat) ? 10 : 6;
    roleMatch = op.cat === "Sales Leadership";
  } else {
    sk = op.cat === brief.cat ? 20 : 6;
    roleMatch = op.cat === brief.cat;
  }
  const hits = brief.kw.filter((k) => tl.includes(k));
  sk = Math.min(35, sk + 2 * hits.length);

  const inds = (op.allIndustries || []).map((i) => i.toLowerCase());
  let ex = 6 + Math.min(tags.length, 25) * 0.4 + Math.min(op.eng || 0, 4) * 1.5 + (inds.includes("saas") ? 3 : 0) + (inds.includes("health care") ? 2 : 0);
  ex = Math.min(30, pyRound(ex));

  const bu = rate == null ? 8 : (rate >= brief.rmin && rate <= brief.rmax ? 15 : rate < brief.rmin ? 13 : rate <= brief.rmax * 1.2 ? 8 : 3);
  const hm = brief.hmin;
  const hr = hrs >= hm ? 20 : hrs >= hm * 0.75 ? 12 : hrs >= hm * 0.5 ? 6 : 3;

  const plus = [], minus = [];
  if (roleMatch) plus.push(`${role} matches the seat`);
  if (tl.includes("hubspot")) plus.push("HubSpot on their profile");
  else if (hits.length) plus.push(`${hits.length} skills match the brief`);
  if (inds.includes("saas")) plus.push("B2B SaaS experience");
  if (hrs >= hm) plus.push(`${hrs} hrs a month open`);
  if (rate != null && rate <= brief.rmax) plus.push(`$${rate}/hr is inside budget`);
  if (!plus.length) plus.push(tags.length ? `${tags.length} skills on profile` : "Available now");
  if (hrs < hm) minus.push(`${hrs} hrs a month open, seat needs ${brief.hlabel}`);
  if (rate == null) minus.push("No rate on profile");
  else if (rate > brief.rmax) minus.push(`$${rate}/hr is over the $${brief.rmax} budget`);
  if (!roleMatch) minus.push(`${role || op.cat} profile, not ${brief.cat === "Revenue Operations" ? "RevOps" : brief.cat === "Sales Leadership" ? "VP of Sales" : brief.cat}`);

  const parts = [sk, ex, bu, hr];
  const fit = parts.reduce((a, b) => a + b, 0);
  return { fit, parts, tier: fit >= 85 ? "strong" : fit >= 70 ? "possible" : "weak", plus: plus.slice(0, 2).join(". "), minus: minus.slice(0, 2).join(". ") };
}

// Python round() is banker's rounding. Keep it so seeded numbers match exactly.
function pyRound(x) {
  const f = Math.floor(x), d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}
