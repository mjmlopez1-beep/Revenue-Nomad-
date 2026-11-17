/**
 * Tests for the seniority bar (lib/seniority.ts): GTM roles at any seniority, roles outside GTM
 * only at Director and above. Pure string checks, no server.
 *
 *   npx tsx scripts/test-seniority.mts
 */
import { DIRECTOR_PLUS, isDirectorPlus, isGtmFunction, isGtmRole, isGtmTitle, keepsNonGtm, seniorityOf, seniorityDrop } from "../lib/seniority";
import { FUNCTIONS, GTM_FUNCTIONS } from "../lib/tableFields";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${JSON.stringify(detail)}`}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);

console.log("\nThe owner's cases");
const cases: [string, string | null, boolean][] = [
  ["School Staffing Coordinator (Contract)", null, false],
  ["School Staffing Coordinator (Contract)", "Customer Success", false], // a GTM label from the posting's body does not make it GTM
  ["Fractional CFO", null, true],
  ["Interim Head of People", null, true],
  ["Fractional Controller", null, true],
  ["Contract Software Engineer", null, false],
  ["Fractional Account Executive", null, true],
  ["Art Director (freelance)", null, false],
  ["Art Director (freelance)", "Marketing", false],
  ["Chief of Staff (fractional)", null, true],
];
for (const [title, fn, want] of cases) eq(`${want ? "keeps" : "drops"} "${title}"${fn ? ` filed under ${fn}` : ""}`, keepsNonGtm(title, fn), want);

console.log("\nGTM roles keep every seniority");
for (const title of [
  "Fractional Account Executive", "Contract SDR", "Freelance Marketing Coordinator", "Fractional RevOps Analyst", "Interim Customer Success Manager",
  "Partnerships Associate (Contract)", "Fractional Growth Marketer", "Product Marketing Manager (Fractional)", "Sales Enablement Specialist", "GTM Engineer (Contract)",
  "Sales Engineer (Contract)", "Revenue Operations Analyst", "Director of Sales", "Brand Creative Director", "Marketing Art Director",
]) {
  check(`GTM: ${title}`, isGtmRole(title) && keepsNonGtm(title));
}
check("a title that names no function counts as GTM when a GTM function is on file", keepsNonGtm("Fractional Consultant (Contract)", "Sales"));
check("  but not with no function on file", !keepsNonGtm("Fractional Consultant (Contract)", null));
check("  and not when the title shows a level below Director", !keepsNonGtm("Coordinator (Contract)", "Sales"));
check("a title that names a function outside GTM is not GTM whatever is on file", !isGtmRole("Contract Bookkeeper", "Sales"));

console.log("\nOutside GTM: Director and above stay");
for (const title of [
  "Fractional CFO", "Fractional CTO", "Fractional COO", "Fractional CIO", "Fractional CISO", "Fractional CPO", "Fractional CHRO", "Fractional CLO", "Fractional CDO",
  "Fractional CAIO", "Interim CEO", "Chief Financial Officer (Interim)", "Chief of Staff", "Fractional General Counsel", "Fractional Controller", "Interim Financial Controller",
  "Interim President", "Managing Director (Contract)", "Fractional Executive", "VP Engineering (Fractional)", "Vice President of Operations", "SVP Finance", "EVP, People",
  "Interim Head of People", "Head of Product (Fractional)", "Director of Operations", "Senior Director, Finance", "Executive Director (Interim)",
]) {
  check(`kept: ${title}`, keepsNonGtm(title) && isDirectorPlus(title), seniorityOf(title));
}

console.log("\nOutside GTM: below Director goes");
for (const title of [
  "School Staffing Coordinator (Contract)", "Contract Software Engineer", "Freelance Data Analyst", "Contract Bookkeeper", "Freelance Accountant", "Contract Recruiter",
  "Talent Acquisition Coordinator", "Freelance UX Designer", "Contract Developer", "IT Support Specialist (Contract)", "HR Generalist (Part-time)",
  "Fractional Product Manager", "Operations Associate (Contract)", "Executive Assistant (Contract)", "Executive Assistant to the CEO", "Assistant to the CFO",
  "Associate Director of Finance", "Assistant Controller (Contract)", "Art Director (freelance)", "Creative Director (Contract)", "Contract Paralegal", "Office Manager (Part-time)",
  "Teacher (Contract)", "Fractional Consultant",
]) {
  check(`dropped: ${title}`, !keepsNonGtm(title), { gtm: isGtmRole(title), level: seniorityOf(title) });
}

console.log("\nseniorityOf");
const levels: [string, string | null][] = [
  ["Fractional CFO", "C-level"],
  ["Chief of Staff", "C-level"],
  ["Fractional General Counsel", "C-level"],
  ["Interim President", "C-level"],
  ["Fractional Executive", "C-level"],
  ["Vice President, Finance", "VP"],
  ["SVP Engineering", "VP"],
  ["Head of People", "Head"],
  ["Senior Director of Engineering", "Director"],
  ["Managing Director", "Director"],
  ["Fractional Controller", "Director"],
  ["Art Director", "Lead"],
  ["Associate Director", "Manager"],
  ["Engineering Manager", "Manager"],
  ["Staffing Coordinator", "Staff"],
  ["Executive Assistant to the CEO", "Staff"],
  ["Fractional Consultant", null],
  ["", null],
];
for (const [title, want] of levels) eq(`seniority of "${title}"`, seniorityOf(title), want);
check("Director+ is C-level, VP, Head and Director", JSON.stringify(DIRECTOR_PLUS) === JSON.stringify(["C-level", "VP", "Head", "Director"]));

console.log("\nFunctions");
check("every GTM function is GTM", GTM_FUNCTIONS.every(isGtmFunction));
check("every other function is not", FUNCTIONS.filter((f) => !GTM_FUNCTIONS.includes(f)).every((f) => !isGtmFunction(f)));
check("no function is not GTM", !isGtmFunction(null) && !isGtmFunction(""));
check("a GTM word in the title wins over a word outside GTM", isGtmTitle("Sales Engineer") && isGtmTitle("Revenue Operations Analyst") && !isGtmTitle("Operations Analyst"));
check("functionOf's loose matches are overruled", !isGtmTitle("Talent Acquisition Coordinator") && !isGtmTitle("IT Support Specialist") && !isGtmTitle("Teacher Training Coordinator"));
eq("seniorityDrop says why", [seniorityDrop("Contract Software Engineer"), seniorityDrop("Fractional CFO")], ["below-director", null]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
