#!/usr/bin/env node
/**
 * A made-up member seed for test servers (CI, scripts/test-ci.sh): every company, person,
 * member, email and token below is invented. Companies are "... Qaco<N>" on qaco<N>.example,
 * people end in "qa", addresses are @example.com or .example. Nothing is read from the real
 * seed, and this never needs RN_INTEL_SEED_KEY.
 *
 *   node scripts/make-test-seed.mjs <out.json>
 *
 * Start a server with RN_INTEL_SEED=<out.json> and give the suites SEED_FILE=<out.json>: the
 * checks that sign in as a seed member (a seat holder, a voucher, the Rate Index) then run on it.
 * Ported from the QA harness's seed (companies, seats, open roles, people, members), with more
 * members so the suites that each sign in as a different seed member have enough of them.
 */
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/make-test-seed.mjs <out.json>");
  process.exit(2);
}

const DAY = 86_400_000;
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();
const monthAgo = (n) => {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

const A = ["Quill", "Bramble", "Larkspur", "Copperleaf", "Driftwood", "Saltmarsh", "Juniper", "Ironbark", "Tidewater", "Foxglove", "Hollowell", "Marigold", "Pinecrest", "Wrenfield", "Stonebridge", "Ashgrove"];
const B = ["Analytics", "Health", "Robotics", "Logistics", "Labs", "Software", "Freight", "Payments", "Kitchens", "Energy", "Learning", "Security"];
const FIRST = ["Avery", "Blake", "Cameron", "Dana", "Emerson", "Finley", "Harper", "Jules", "Kendall", "Logan", "Morgan", "Parker", "Quinn", "Reese", "Sawyer", "Tatum"];
const LAST = ["Ashbyqa", "Brookqa", "Callowayqa", "Dunmoreqa", "Elleryqa", "Fairbanksqa", "Garlandqa", "Hollisqa", "Ingramqa", "Jessupqa", "Kingsleyqa", "Lowellqa", "Merrimanqa", "Northcottqa", "Oakesqa", "Pembertonqa"];
const IND = ["SaaS", "Fintech", "Health Care", "Industrial Manufacturing", "IT Services", "Education", "Cybersecurity", "Data & Analytics", "E-Commerce", "Automotive", "Packaging", "Restaurants"];
const SIZE = ["11–50", "51–200", "201–500"];
const HQ = ["Austin, TX", "Denver, CO", "San Diego, CA", "Chicago, IL", "Boston, MA", "Los Angeles, California", "Seattle, WA", "Atlanta, GA", "Toronto, Canada", "Boise, ID", "London, United Kingdom", "Berlin, Germany", "Sydney, Australia", "Portland, OR"];
const FNS = ["Marketing", "Sales", "Finance", "RevOps"];
/** A company contact's made-up name (never a member's: members' last names come from MEMBER_LAST). */
const person = (k) => `${FIRST[k % FIRST.length]} ${LAST[(k * 7) % LAST.length]}`;

/*
 * Members: 100, each with a unique two-word name. The first 12 hold a seat below (fields.operator
 * is their name); the suites sign in as many of the others (test-server.mjs seedClient takes the
 * 41st from the end, test-integration.mjs seedMember the 31st past the middle).
 */
const MEMBER_FIRST = ["Nell", "Mira", "Frieda", "Enid", "Edie", "Lana", "Tess", "Paul", "Cleo", "Zed", "Zia", "Tia", "Rae", "Otto", "Sela", "Cory", "Nora", "Ivo", "Juno", "Kit"];
const MEMBER_LAST = ["Seatqa", "Memberqa", "Voucherqa", "Peerqa", "Guestqa"];
const members = Array.from({ length: 100 }, (_, i) => {
  const name = `${MEMBER_FIRST[i % MEMBER_FIRST.length]} ${MEMBER_LAST[Math.floor(i / MEMBER_FIRST.length)]}`;
  const id = `mem_qa${String(i).padStart(2, "0")}`;
  return { id, name, email: `${id.slice(4)}.member@example.com`, title: `Fractional ${["VP Sales", "CMO", "CFO", "Head of RevOps"][i % 4]}`, token: `tok-ci-${id.slice(4)}-${(i * 7919 + 104729).toString(36)}0000` };
});
const HOLDERS = 12;

const N = 96;
const companies = Array.from({ length: N }, (_, k) => ({
  id: `c_qa${String(k).padStart(2, "0")}`,
  fields: {
    name: `${A[k % A.length]} ${B[(k * 5) % B.length]} Qaco${k}`,
    website: `qaco${k}.example`,
    // Every sixth company has only its name and site on file, every third no HQ (members add them), every fourth an About text.
    ...(k % 6 === 5 ? {} : { industry: IND[k % IND.length], employees: SIZE[k % SIZE.length], revenue: "$5M–$20M" }),
    ...(k % 3 === 1 || k % 6 === 5 ? {} : { hq: HQ[k % HQ.length] }),
    ...(k % 4 === 0 ? { about: `A made-up company for tests. It sells ${IND[k % IND.length]} tools to mid-sized teams.` } : {}),
    linkedin: `https://www.linkedin.com/company/qaco${k}`,
  },
}));
const engagements = [];
const contacts = [];
companies.forEach((c, k) => {
  const fn = FNS[k % FNS.length];
  const ended = k % 2 === 0;
  // An older seat, ended or still going. The first HOLDERS companies' seats are held by a member.
  // The next one names a member from public profiles only, with no function: unverified, so not
  // theirs until they claim it. The suites sort holders with no function last, and test-rules.mjs
  // takes the last for its "This isn't me" checks, which it then skips: their refund check expects
  // the holder's name to cost a credit, and a fellow fractional's name is free to see now.
  const operator = k <= HOLDERS ? members[k].name : k % 3 !== 2 ? person(k) : undefined;
  const fromProfile = k === HOLDERS;
  engagements.push({
    id: `e_qa${k}_a`,
    companyId: c.id,
    verified: false,
    ...(fromProfile ? { holderFrom: "public profile", holderKey: "p_0000000000000000qa12" } : {}),
    fields: {
      // Where it came from, as on the real table: the seat scan, Revenue Nomad's published engagements, members' stories.
      source: ["Seat scan", "Seat scan", "Published engagement", "Member success story"][k % 4],
      ...(operator ? { operator } : {}),
      role: `Fractional ${fn} Lead`,
      ...(fromProfile ? {} : { function: fn }),
      type: "Fractional",
      start: monthAgo(6 + (k % 12)),
      ...(ended ? { status: "Ended", end: monthAgo(2), rate: "$12k/mo", hours: "20" } : { status: "Active", end: "Ongoing" }),
    },
  });
  // A second, more recent seat at every fourth company.
  if (k % 4 === 2)
    engagements.push({
      id: `e_qa${k}_mkt`,
      companyId: c.id,
      verified: false,
      fields: { source: "Seat scan", ...(k % 8 === 2 ? { operator: person(k + 3) } : {}), role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" },
    });
  // A seat with nothing but where it came from: no role, no function (members fill them in).
  if (k % 7 === 3) engagements.push({ id: `e_qa${k}_bare`, companyId: c.id, verified: false, fields: { source: "Published engagement", type: "Fractional", start: monthAgo(3) } });
  // Open roles, in every function. None in Sales at the first 24 companies: the landing page's example
  // record picks one of them, and test-preview.mjs expects the Sales roles it names to be the newest.
  const roleFn = k < 24 ? 1 + ((k / 3) % 3) : k % 4;
  if (k % 3 === 0)
    engagements.push({
      id: `e_qa${k}_open`,
      companyId: c.id,
      verified: false,
      fields: {
        source: "Demand scan",
        role: `Fractional ${["VP Sales", "CMO", "CFO", "Head of RevOps"][roleFn]}`,
        function: ["Sales", "Marketing", "Finance", "RevOps"][roleFn],
        status: "Open role",
        posting: `https://qaco${k}.example/jobs/open`,
        ...(k % 6 === 0 ? { rate: "$10k/mo", hours: "15" } : {}),
      },
    });
  contacts.push({
    id: `p_qa${k}`,
    engagementId: `e_qa${k}_a`,
    fields: { name: person(k + 21), title: "CEO", relationship: "Hiring for the seat", email: `ceo@qaco${k}.example`, phone: "+1 555 0100", linkedin: `https://www.linkedin.com/in/qa-ceo-${k}` },
  });
  if (k % 5 === 0) contacts.push({ id: `p_qa${k}_b`, companyId: c.id, fields: { name: person(k + 40), title: "VP Operations", relationship: "Decision maker" } });
});

const seed = {
  builtAt: ago(30 * DAY),
  members,
  companies,
  engagements,
  contacts,
  rateIndex: Array.from({ length: 60 }, (_, i) => ({ fn: FNS[i % 4], hourly: 150 + ((i * 13) % 120), hours: 40 + (i % 5) * 10, revenue: i % 2 ? "$5M–$20M" : "$1M–$5M" })),
};
writeFileSync(out, JSON.stringify(seed));
console.log(`made-up seed: ${members.length} members, ${companies.length} companies, ${engagements.length} seats and roles, ${contacts.length} people -> ${out}`);
