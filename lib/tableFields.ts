/**
 * Field definitions for Merlin. Shared by server and client (no Node imports).
 *
 * Three linked records: a company, the fractional engagements at that company, and
 * the people there (decision makers at the company, or people tied to one engagement:
 * who the fractional reported to, worked with, or who is hiring for the seat).
 * Each value is stored once on its own record and shows everywhere it applies.
 *
 * Free fields describe the company and the shape of the work (function, type, status, start,
 * hours per week, and the end month of a seat that is still going), so the free view is useful on
 * its own. Locked fields are the intel people trade for: the exact role, the end month of a seat
 * that ended, who held the seat (with their role, one unlock), rate, the posting, and people's
 * names, titles and contact details (a name and title are one unlock, and the contact details open
 * after it). Adding a missing fact earns 1 credit (max EARN_CAP per rolling 24 hours); unlocking a
 * locked fact someone else added costs 1.
 */
import { STANDARD_FIELDS, toStandard } from "./industryMap";
import { NEVER_NAME_REFUSED, neverAName } from "./nameWords";

export type Entity = "company" | "engagement" | "contact";
export type FieldKind = "text" | "url" | "email" | "phone" | "month" | "monthOrOngoing" | "number" | "choice";

/**
 * Revenue Nomad's standard industry list (the platform's list, its 110 active industries in its
 * own order). Every industry value on Merlin is one of these: lib/industryMap.ts maps
 * anything else (an older tag, a LinkedIn, Clay or Crunchbase industry) onto it, or leaves it
 * empty. RN_INDUSTRY_SLUGS keeps the platform's slug for each, for a sync with the platform.
 */
export const RN_INDUSTRIES = [
  "SaaS", "Education", "Fintech", "Health Care", "E-Commerce", "Marketplace", "Deep Tech / AI", "Media & Content", "Professional Services",
  "Hardware / IoT", "Enterprise Software", "Developer Tools", "Cybersecurity", "EdTech", "Climate / Clean Tech",
  "Healthcare Providers & Health Systems", "Insurance & Health Plans", "Pharma & Biotech", "Medical Devices & Diagnostics",
  "Veterinary & Animal Health", "Banking & Credit Unions", "Wealth Management & Advisory", "Private Equity & Venture Capital", "Mortgage & Lending",
  "Accounting & Tax", "Payments & Fintech Infrastructure", "Restaurants", "Catering & Institutional Food Service", "Food & Beverage CPG",
  "Food Distribution & Supply", "Hotels & Resorts", "Vacation Rentals & Short-Term Rental", "Travel & Tourism", "Theme Parks & Attractions",
  "Sports, Events & Live Entertainment", "Gaming & Casinos", "SMB Software", "Data & Analytics", "Telecommunications & Connectivity", "IT Services",
  "Marketing Teams & CMOs", "Sales Organizations & CROs", "Customer Success & Support", "Advertising & Media Agencies", "Commercial Real Estate",
  "Residential Real Estate", "Property Management", "Self-Storage", "General Contractors & Builders", "Specialty Trades & Subcontractors",
  "Home Services", "Architecture, Engineering & Design", "Aerospace & Defense", "Precision & Contract Manufacturing", "Automotive",
  "Industrial Manufacturing", "Electronics & Semiconductor", "Industrial Automation & IoT", "Packaging", "Industrial Distribution",
  "Building Materials & Supply", "General & Specialty Wholesale", "E-Commerce & D2C", "Brick & Mortar Retail", "Consumer Goods & CPG (Non-Food)",
  "Luxury & Premium Brands", "Pet Industry", "Cannabis & Hemp", "K-12 Schools & Districts", "Higher Education", "Corporate Learning & Training",
  "Childcare & Early Education", "Oil & Gas", "Utilities (Electric, Gas, Water)", "Renewable Energy & Cleantech", "Environmental Services",
  "Freight & Trucking", "Warehousing & Fulfillment", "Procurement & Supply Chain Leaders", "Maritime & Aviation Logistics",
  "Airlines & Aviation Services", "Federal Government", "State & Local Government", "Government Contractors", "Nonprofit & Associations",
  "Religious & Faith-Based", "Digital Media & Publishing", "Gaming & Interactive Entertainment", "Creator Economy & Social",
  "Research, Data & Information Services", "Law Firms & Legal Departments", "Consulting & Advisory", "Staffing & Recruiting",
  "Cleaning, Security & Facilities Services", "Auto Dealerships", "Auto Repair & Aftermarket", "Fleet & Vehicle Management",
  "Salons, Spas & Beauty Services", "Fitness & Wellness", "Personal Services", "Franchise Systems & Multi-Unit Operators",
  "Senior Living & Assisted Living", "Home Care & Aging Services", "Farming & Agribusiness", "AgTech & Food Innovation",
  "Funeral Homes & Cemeteries", "Print, Signage & Promotional Products", "Data Centers & Colocation", "Coworking & Flexible Workspace",
  "Equipment Rental & Leasing",
];
export const RN_INDUSTRY_SLUGS: Record<string, string> = {
  "SaaS": "saas",
  "Education": "education",
  "Fintech": "fintech",
  "Health Care": "healthcare",
  "E-Commerce": "ecommerce",
  "Marketplace": "marketplace",
  "Deep Tech / AI": "deeptech",
  "Media & Content": "media",
  "Professional Services": "professional_svc",
  "Hardware / IoT": "hardware",
  "Enterprise Software": "enterprise_sw",
  "Developer Tools": "developer_tools",
  "Cybersecurity": "cybersecurity",
  "EdTech": "edtech",
  "Climate / Clean Tech": "climate",
  "Healthcare Providers & Health Systems": "healthcare_providers_and_health_systems",
  "Insurance & Health Plans": "insurance_and_health_plans",
  "Pharma & Biotech": "pharma_and_biotech",
  "Medical Devices & Diagnostics": "medical_devices_and_diagnostics",
  "Veterinary & Animal Health": "veterinary_and_animal_health",
  "Banking & Credit Unions": "banking_and_credit_unions",
  "Wealth Management & Advisory": "wealth_management_and_advisory",
  "Private Equity & Venture Capital": "private_equity_and_venture_capital",
  "Mortgage & Lending": "mortgage_and_lending",
  "Accounting & Tax": "accounting_and_tax",
  "Payments & Fintech Infrastructure": "payments_and_fintech_infrastructure",
  "Restaurants": "restaurants_qsr_fast_casual_full_service",
  "Catering & Institutional Food Service": "catering_and_institutional_food_service",
  "Food & Beverage CPG": "food_and_beverage_cpg",
  "Food Distribution & Supply": "food_distribution_and_supply",
  "Hotels & Resorts": "hotels_and_resorts",
  "Vacation Rentals & Short-Term Rental": "vacation_rentals_and_short_term_rental",
  "Travel & Tourism": "travel_and_tourism",
  "Theme Parks & Attractions": "theme_parks_and_attractions",
  "Sports, Events & Live Entertainment": "sports_events_and_live_entertainment",
  "Gaming & Casinos": "gaming_and_casinos",
  "SMB Software": "smb_software",
  "Data & Analytics": "data_and_analytics",
  "Telecommunications & Connectivity": "telecommunications_and_connectivity",
  "IT Services": "it_services_and_systems_integrators",
  "Marketing Teams & CMOs": "marketing_teams_and_cmos",
  "Sales Organizations & CROs": "sales_organizations_and_cros",
  "Customer Success & Support": "customer_success_and_support",
  "Advertising & Media Agencies": "advertising_and_media_agencies",
  "Commercial Real Estate": "commercial_real_estate",
  "Residential Real Estate": "residential_real_estate",
  "Property Management": "property_management",
  "Self-Storage": "self_storage",
  "General Contractors & Builders": "general_contractors_and_builders",
  "Specialty Trades & Subcontractors": "specialty_trades_and_subcontractors",
  "Home Services": "home_services",
  "Architecture, Engineering & Design": "architecture_engineering_and_design",
  "Aerospace & Defense": "aerospace_and_defense",
  "Precision & Contract Manufacturing": "precision_and_contract_manufacturing",
  "Automotive": "automotive",
  "Industrial Manufacturing": "industrial_manufacturing",
  "Electronics & Semiconductor": "electronics_and_semiconductor",
  "Industrial Automation & IoT": "industrial_automation_and_iot",
  "Packaging": "packaging",
  "Industrial Distribution": "industrial_distribution",
  "Building Materials & Supply": "building_materials_and_supply",
  "General & Specialty Wholesale": "general_and_specialty_wholesale",
  "E-Commerce & D2C": "e_commerce_and_d2c",
  "Brick & Mortar Retail": "brick_and_mortar_retail",
  "Consumer Goods & CPG (Non-Food)": "consumer_goods_and_cpg_non_food",
  "Luxury & Premium Brands": "luxury_and_premium_brands",
  "Pet Industry": "pet_industry",
  "Cannabis & Hemp": "cannabis_and_hemp",
  "K-12 Schools & Districts": "k_12_schools_and_districts",
  "Higher Education": "higher_education",
  "Corporate Learning & Training": "corporate_learning_and_training",
  "Childcare & Early Education": "childcare_and_early_education",
  "Oil & Gas": "oil_and_gas",
  "Utilities (Electric, Gas, Water)": "utilities_electric_gas_water",
  "Renewable Energy & Cleantech": "renewable_energy_and_cleantech",
  "Environmental Services": "environmental_services",
  "Freight & Trucking": "freight_and_trucking",
  "Warehousing & Fulfillment": "warehousing_and_fulfillment",
  "Procurement & Supply Chain Leaders": "procurement_and_supply_chain_leaders",
  "Maritime & Aviation Logistics": "maritime_and_aviation_logistics",
  "Airlines & Aviation Services": "airlines_and_aviation_services",
  "Federal Government": "federal_government",
  "State & Local Government": "state_and_local_government",
  "Government Contractors": "government_contractors",
  "Nonprofit & Associations": "nonprofit_and_associations",
  "Religious & Faith-Based": "religious_and_faith_based",
  "Digital Media & Publishing": "digital_media_and_publishing",
  "Gaming & Interactive Entertainment": "gaming_and_interactive_entertainment",
  "Creator Economy & Social": "creator_economy_and_social",
  "Research, Data & Information Services": "research_data_and_information_services",
  "Law Firms & Legal Departments": "law_firms_and_legal_departments",
  "Consulting & Advisory": "consulting_and_advisory",
  "Staffing & Recruiting": "staffing_and_recruiting",
  "Cleaning, Security & Facilities Services": "cleaning_security_and_facilities_services",
  "Auto Dealerships": "auto_dealerships",
  "Auto Repair & Aftermarket": "auto_repair_and_aftermarket",
  "Fleet & Vehicle Management": "fleet_and_vehicle_management",
  "Salons, Spas & Beauty Services": "salons_spas_and_beauty_services",
  "Fitness & Wellness": "fitness_and_wellness",
  "Personal Services": "personal_services",
  "Franchise Systems & Multi-Unit Operators": "franchise_systems_and_multi_unit_operators",
  "Senior Living & Assisted Living": "senior_living_and_assisted_living",
  "Home Care & Aging Services": "home_care_and_aging_services",
  "Farming & Agribusiness": "farming_and_agribusiness",
  "AgTech & Food Innovation": "agtech_and_food_innovation",
  "Funeral Homes & Cemeteries": "funeral_homes_and_cemeteries",
  "Print, Signage & Promotional Products": "print_signage_and_promotional_products",
  "Data Centers & Colocation": "data_centers_and_colocation",
  "Coworking & Flexible Workspace": "coworking_and_flexible_workspace",
  "Equipment Rental & Leasing": "equipment_rental_and_leasing",
};
/** Revenue Nomad standard revenue stage buckets. */
export const RN_REVENUE = ["Pre-revenue", "Under $1M", "$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M+"];
/** Values stored under an older label, mapped to the current one when data loads. (Any other value of a standard list is mapped by lib/industryMap.ts.) */
export const LEGACY_VALUES: Record<string, Record<string, string>> = { revenue: { "< $1M": "Under $1M" } };
/**
 * A value of industry, employees or revenue as its standard value ("< $1M" -> "Under $1M",
 * "51-200" -> "51–200", "IT Services and IT Consulting" -> "Software & IT Services"). A value
 * nothing maps comes back as it was (callers that need a standard value use toStandard). Any
 * other field: as it was.
 */
export const currentValue = (field: string, v: string): string => (STANDARD_FIELDS.has(field) ? toStandard(field, v) ?? v : v);

/**
 * Industries picked together with one tap (the industry filter and the ideal client picker).
 * Stored as their values, never as the group's name.
 */
export const INDUSTRY_GROUPS: { label: string; values: string[] }[] = [{ label: "Software (all)", values: ["SaaS", "Enterprise Software", "SMB Software", "Developer Tools"] }];
/** Old labels that meant a whole group ("Software" before the 110 industries) open as the group. */
const GROUP_OF_OLD: Record<string, string[]> = { software: INDUSTRY_GROUPS[0].values, "software (all)": INDUSTRY_GROUPS[0].values };
/**
 * A list of picked industries as standard values: an old label becomes its standard value
 * (lib/industryMap.ts toStandard), "Software" becomes every Software industry, and one nothing
 * maps drops out. For ideal clients and saved views kept under older labels.
 */
export function standardIndustries(list: readonly unknown[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const k = String(raw ?? "").trim().toLowerCase();
    const group = Object.prototype.hasOwnProperty.call(GROUP_OF_OLD, k) ? GROUP_OF_OLD[k] : null;
    if (group) out.push(...group);
    else {
      const v = toStandard("industry", raw);
      if (v) out.push(v);
    }
  }
  return [...new Set(out)];
}
/** Picked industries for a label: the whole Software group reads "Software (all)". */
export function industryWords(list: string[]): string[] {
  let out = [...list];
  for (const g of INDUSTRY_GROUPS)
    if (g.values.every((v) => out.includes(v))) {
      const at = Math.min(...g.values.map((v) => out.indexOf(v)));
      out = out.filter((v) => !g.values.includes(v));
      out.splice(Math.min(at, out.length), 0, g.label);
    }
  return out;
}
/** Standard values of employees or revenue, ones nothing maps dropped. */
export const standardList = (field: "employees" | "revenue", list: readonly unknown[] | undefined): string[] =>
  [...new Set((list ?? []).map((x) => toStandard(field, x)).filter((x): x is string => !!x))];

/* Revenue Nomad's standard pick lists (same as the platform's buyer profile), so the data lines up. */
export const RN_DEAL_SIZES = ["Under $15K", "$15K–$50K", "$50K–$150K", "$150K+"];
export const RN_SALES_CYCLES = ["Under 5 days", "5–30 days", "30–90 days", "3–6 months", "6–12 months", "12+ months"];
export const RN_MOTIONS = ["PLG", "PLG to sales", "Inside sales", "Enterprise sales", "Channel"];
export const BUSINESS_MODELS = ["B2B", "B2C", "B2B2C"];
/**
 * Who owns the company. A free company fact (Crystal Ball reads it: lib/radar/predict.ts). Nothing
 * on file reads as Unknown, which is not a value a member adds.
 */
export const OWNERSHIP_TYPES = ["VC-backed", "Bootstrapped", "PE-backed", "Family-owned", "Public", "Non-profit"];
/** What a member can pick as a seat's "Why now" (several): what made the client move when it did. */
export const WHY_NOW = ["Fundraise", "Leader departed", "PE deal", "Founder-led sales ceiling", "Compliance/SOC 2", "Headcount growth", "Audit/finance clean-up", "AI program", "Other"];
/** Why a seat ended, once it has. */
export const END_REASONS = ["Converted to full-time", "Replaced by full-time hire", "Project done", "Budget cut", "Other"];

/** How the client found the fractional for this seat. */
export const SOURCED_VIA = ["Referral", "Investor intro", "Former colleague", "Inbound", "Platform or marketplace", "Recruiter", "Cold outreach"];
/** What the client hired the fractional to do. */
export const HIRE_REASONS = [
  "Move off founder-led sales",
  "Build the first sales motion",
  "Build the function from scratch",
  "Scale an existing team",
  "Replace a departed leader",
  "Cover while hiring full-time",
  "Fix RevOps or the GTM stack",
  "Launch a new market or product",
  "Turn around missed targets",
  "Prepare for a raise",
];
/** How the seat was paid. Rate benchmarks group by it. */
export const PRICING_MODELS = ["Monthly retainer", "Hourly", "Project fee", "Equity and cash"];
/** Revenue Nomad standard employee count buckets. */
export const RN_EMPLOYEES = ["1–10", "11–50", "51–200", "201–500", "501–1,000", "1,001+"];
/** The GTM functions. The weekly scan keeps their open roles at any seniority, and the rest only at Director and above (lib/seniority.ts). */
export const GTM_FUNCTIONS = ["Sales", "Marketing", "RevOps", "Customer Success", "Partnerships", "Growth", "Product Marketing", "Enablement", "AI GTM"];
/**
 * Every function a seat can be in (role categories): the GTM ones first, then the rest of the
 * fractional work on file. Free to see, so members can filter by function without unlocking the role.
 */
export const FUNCTIONS = [...GTM_FUNCTIONS, "Technology", "Finance", "Operations", "People", "Product", "Legal", "Executive", "Other"];
/** How a person relates to the company or to the fractional who worked there. */
export const RELATIONSHIPS = ["Decision maker", "Reported to", "Reported to me", "Worked with", "Hiring for the seat"];
export const ENGAGEMENT_TYPES = ["Fractional", "Interim", "Advisory", "Project", "Full-time"];
/** Engagement types that count as fractional work (for the fractional-friendly signal). */
export const FRACTIONAL_TYPES = ["Fractional", "Interim", "Advisory", "Project"];
/** "Closed" is an open role whose posting came down (the weekly scan sets it, with a date). */
export const STATUSES = ["Open role", "Active", "Ended", "Closed"];

/** The name the server sends for a company the member hasn't unlocked (every company, until they know it). The app draws a blurred placeholder in its place and never prints this. */
export const HIDDEN_COMPANY = "Locked company";
/**
 * Credits to unlock a company: its name, website, logo, LinkedIn and About, with the job posting and
 * posted rate of each open role there. Who held a seat there (1 credit) and its people open after it.
 */
export const COMPANY_PRICE = 2;
/** "2 credits", for copy. */
export const COMPANY_PRICE_SAY = `${COMPANY_PRICE} credits`;
/**
 * Pro and the trial open any company free, up to this many a UTC day (fair use). Companies opened
 * from Crystal Ball don't count and stay free. Past it a company is COMPANY_PRICE again until tomorrow.
 */
export const PRO_OPENS_DAILY = 15;
/**
 * The one description of the free opens, everywhere it is said (Home, Credits, the unlock toasts,
 * onboarding, the landing page): lib/table.ts proOpens is Pro, Close and the trial (hasPro), up to
 * PRO_OPENS_DAILY a UTC day, and a company opened from Crystal Ball is not counted (fromBall).
 */
export const OPENS_RULE = `On Pro, Close and the trial, any company opens free, up to ${PRO_OPENS_DAILY} a day, and your Crystal Ball companies don't count toward that.`;
/** Said at a company once today's free opens on Pro are used. */
export const PRO_OPENS_USED = `You've opened ${PRO_OPENS_DAILY} companies today. More open tomorrow, or use ${COMPANY_PRICE_SAY}.`;
/**
 * Fellow fractionals are free to see, on every plan (the owner's call): who held a seat and the
 * role they held open at no charge once the member can see the company, and Fractionals never
 * costs a credit. Contact details and the company's own people keep their price.
 */
export const PEERS_FREE = true;
/** Who held a seat, for a member who hides their name on their seats (Profile.nameHidden): every view, the connector included. */
export const NAME_HIDDEN = "A fractional (name hidden)";
/**
 * Who sees a member's name on their seats, said the same way in onboarding, Your seats, the
 * directory switch, the Questions and the Privacy page. Read from PEERS_FREE, so the words follow
 * the rule. `inDirectory`: the member's directory choice (true in, false out, null not chosen).
 */
export function seatNameWho(inDirectory: boolean | null = null): string {
  if (!PEERS_FREE) return "Other members see your name on a seat after they spend 1 credit on it.";
  if (inDirectory === true) return "Every member sees your name on your seats, free, because you're in the Fractionals directory.";
  if (inDirectory === false)
    return "Out of the directory, your name on a seat costs other members 1 credit once they can see the company.";
  return "Fellow fractionals see your name on a seat for free once they can see that company.";
}
/** What hiding your name does, in one place. */
export const NAME_HIDDEN_SAY = `Hide your name and your seats read "${NAME_HIDDEN}" to everyone, Claude included. Your seats and roles still count.`;

/*
 * Finding a company by its exact name or website (the action "find", GET /api/table?find=): it
 * shows named in that search and the record opened from it, and stays locked in the tables.
 */
/** The fewest characters a lookup by name reads. */
export const FIND_MIN = 3;
export const FIND_HINT = "Type a company's full name or website to find it.";
export const FIND_NONE = "No company with that exact name or website.";
/** The quiet note on a company found this way. */
export const FOUND_NOTE = "Found by its exact name";
/** Unlock company on a record opened from such a search. */

/** Max credits a member can earn in any rolling 24 hours: fills, invite and confirmation bonuses together. Bonuses past it are held and paid as room opens. */
export const EARN_CAP = 25;
/** Free keeps earning like every plan: up to EARN_CAP credits in any 24 hours, for as long as they are a member (no taper after the first days). */
export const FREE_EARN_RULE = `On Free you keep earning up to ${EARN_CAP} credits a day, for as long as you're a member.`;
/** Credits for inviting a fellow fractional, paid to both once the new member adds their first fact. */
export const REFERRAL_BONUS = 10;
/** Paid invites per member per 30 days. */
export const REFERRAL_LIMIT = 5;

export interface FieldDef {
  key: string;
  label: string;
  /** Shorter label for table headers. */
  short?: string;
  kind: FieldKind;
  gated: boolean;
  /** Set when the record is created; not fillable in a cell. */
  identity?: boolean;
  /** Set by the system (e.g. where a record came from); shown, never filled. */
  system?: boolean;
  options?: string[];
  /** A choice where several can be picked: stored as the picks in the list's order, joined by ", ". */
  multi?: boolean;
  placeholder?: string;
  /** One line shown in tooltips and the add form. */
  hint?: string;
  /**
   * The field inside a sentence, with its article: "the role", "a person's email". Toasts and
   * errors use it ("Added the role."). Labels stay for headers and forms.
   */
  say?: string;
}

export interface GroupDef {
  entity: Entity;
  label: string;
  fields: FieldDef[];
}

export const GROUPS: GroupDef[] = [
  {
    entity: "company",
    label: "Company",
    fields: [
      { key: "name", label: "Company", kind: "text", gated: false, identity: true },
      { key: "website", label: "Website", kind: "url", gated: false, placeholder: "acme.com", say: "the website" },
      { key: "industry", label: "Industry", kind: "choice", gated: false, options: RN_INDUSTRIES, say: "the industry" },
      { key: "employees", label: "Employees", kind: "choice", gated: false, options: RN_EMPLOYEES, say: "the employee count" },
      { key: "revenue", label: "Revenue", kind: "choice", gated: false, options: RN_REVENUE, say: "the revenue range" },
      { key: "hq", label: "HQ", kind: "text", gated: false, placeholder: "Chicago, IL", say: "the HQ" },
      { key: "linkedin", label: "LinkedIn", kind: "url", gated: false, placeholder: "linkedin.com/company/…", say: "the LinkedIn page" },
      { key: "about", label: "About", kind: "text", gated: false, system: true, say: "the About text" },
      { key: "businessModel", label: "Business model", kind: "choice", gated: false, options: BUSINESS_MODELS, say: "the business model" },
      { key: "motion", label: "Sales motion", kind: "choice", gated: false, options: RN_MOTIONS, hint: "How the company sells most of its deals.", say: "the sales motion" },
      { key: "dealSize", label: "Average deal size", short: "Deal size", kind: "choice", gated: false, options: RN_DEAL_SIZES, say: "the average deal size" },
      { key: "salesCycle", label: "Average sales cycle", short: "Sales cycle", kind: "choice", gated: false, options: RN_SALES_CYCLES, say: "the average sales cycle" },
      { key: "ownership", label: "Ownership", kind: "choice", gated: false, options: OWNERSHIP_TYPES, hint: "Who owns the company: venture investors, private equity, its founders, a family, the public markets.", say: "the ownership type" },
    ],
  },
  {
    entity: "engagement",
    label: "Fractional engagement",
    fields: [
      { key: "source", label: "Source", kind: "text", gated: false, system: true, say: "the source" },
      { key: "function", label: "Function", kind: "choice", gated: false, options: FUNCTIONS, hint: "The function this seat covers.", say: "the function" },
      // On a seat whose holder is on file, the role comes with who held it: one credit opens both (SEAT_BUNDLE).
      { key: "role", label: "Role", kind: "text", gated: true, placeholder: "Fractional VP Sales", hint: "The exact title, the way the client wrote it.", say: "the role" },
      { key: "type", label: "Type of work", short: "Type", kind: "choice", gated: false, options: ENGAGEMENT_TYPES, say: "the type of work" },
      { key: "status", label: "Status", kind: "choice", gated: false, options: STATUSES, hint: "Open role means the client is hiring for this seat now.", say: "the status" },
      {
        key: "operator",
        label: "Seat holder",
        kind: "text",
        gated: true,
        placeholder: "First and last name",
        hint: "The person's first and last name, like Jane Smith. If they've signed in to Merlin, pick them from the list.",
        say: "the seat holder",
      },
      { key: "start", label: "Start month", short: "Start", kind: "month", gated: false, hint: "The month the work started.", say: "the start month" },
      // Locked only when it is a month on a seat that ended. "Ongoing", or any end on an Active seat or an open role, is free (endFree in lib/table.ts).
      { key: "end", label: "End month", short: "End", kind: "monthOrOngoing", gated: true, hint: "The month the work ended. Pick Ongoing if it's still going.", say: "the end month" },
      { key: "reason", label: "Why they hired", short: "Why hired", kind: "choice", gated: false, options: HIRE_REASONS, hint: "What the client brought the fractional in to do.", say: "the reason they hired" },
      { key: "sourced", label: "How it was sourced", short: "Sourced via", kind: "choice", gated: true, options: SOURCED_VIA, hint: "How the client found the fractional.", say: "how the seat was sourced" },
      { key: "pricing", label: "Pricing model", short: "Pricing", kind: "choice", gated: false, options: PRICING_MODELS, say: "the pricing model" },
      {
        key: "rate",
        label: "Rate",
        kind: "text",
        gated: true,
        placeholder: "$8k/mo or $150/hr",
        hint: "What the client paid. Members spend 1 credit to see it. It never says who added it.",
        say: "the rate",
      },
      { key: "hours", label: "Hours a week", kind: "number", gated: false, placeholder: "15", hint: "The hours a week the seat takes, on average.", say: "the hours a week" },
      { key: "posting", label: "Job posting", kind: "url", gated: true, placeholder: "Link to the job posting", say: "the job posting" },
      {
        key: "revenue",
        label: "Revenue at the time",
        short: "Revenue then",
        kind: "choice",
        gated: false,
        options: RN_REVENUE,
        hint: "The client's yearly revenue when the work started.",
        say: "the revenue at the time",
      },
      {
        key: "employees",
        label: "Employees at the time",
        short: "Employees then",
        kind: "choice",
        gated: false,
        options: RN_EMPLOYEES,
        hint: "How many people the client had when the work started.",
        say: "the employee count at the time",
      },
      { key: "whyNow", label: "Why now", kind: "choice", multi: true, gated: false, options: WHY_NOW, hint: "What made the client move when it did. Pick all that fit.", say: "why now" },
      { key: "endReason", label: "Why it ended", short: "Ended because", kind: "choice", gated: false, options: END_REASONS, hint: "Once the seat has ended: what came of it.", say: "why it ended" },
    ],
  },
  {
    entity: "contact",
    label: "Person",
    fields: [
      { key: "name", label: "Name", kind: "text", gated: true, placeholder: "Jane Smith", say: "a person's name" },
      // A person's title is locked with their name: one credit opens both (PERSON_BUNDLE in lib/table.ts).
      { key: "title", label: "Title", kind: "text", gated: true, placeholder: "CEO", say: "a person's title" },
      { key: "relationship", label: "Relationship", kind: "choice", gated: false, options: RELATIONSHIPS, hint: "How this person relates to the seat or the company.", say: "a person's relationship" },
      { key: "email", label: "Email", kind: "email", gated: true, placeholder: "jane@acme.com", say: "a person's email" },
      { key: "phone", label: "Phone", kind: "phone", gated: true, placeholder: "+1 555 010 0000", say: "a person's phone number" },
      { key: "linkedin", label: "LinkedIn", kind: "url", gated: true, placeholder: "linkedin.com/in/…", say: "a person's LinkedIn" },
    ],
  },
];

/** A person's name and title: one unlock, 1 credit for both (holdsPersonPartner in lib/table.ts). The lead comes first. */
export const PERSON_BUNDLE = ["name", "title"];
/**
 * A person's contact details. Each is 1 credit, and only once the member can see who the person
 * is (their name and title): a LinkedIn address or an email often spells the name. The same goes
 * for adding them, and for adding a title, so nobody earns for facts about a person they can't see.
 */
export const PERSON_DETAILS = ["linkedin", "email", "phone"];
/**
 * Who held a seat and the role they held: one unlock, 1 credit for both, on a seat whose holder is
 * on file (holdsSeatPartner in lib/table.ts). The lead comes first, and the purchase is recorded
 * on it. A seat with nobody named keeps its role as a purchase of its own.
 */
export const SEAT_BUNDLE = ["operator", "role"];
/**
 * The role of a seat Revenue Nomad found that nobody is named on yet (source "Seat scan", no seat
 * holder). True (the owner's call, Nov 18): it is a free fact everywhere (the table, Unlock all, the
 * counts and the connector). False: it is a 1 credit fact like any past seat's role. Once a holder
 * is on file the role sells with them (SEAT_BUNDLE).
 */
export const SEAT_SCAN_ROLE_FREE = true;

export const ALL_FIELDS = GROUPS.flatMap((g) => g.fields.map((f) => ({ entity: g.entity, f, col: `${g.entity}.${f.key}` })));
/** Fields a member can fill (identity and system fields are never filled). */
export const FILLABLE = ALL_FIELDS.filter((x) => !x.f.identity && !x.f.system);

/** Where a record came from. */
export const SOURCES = ["Published engagement", "Member success story", "Demand scan", "Member added", "Clay", "Seat scan", "Firm client list", "Clutch review"] as const;
/** "Added by a member · updated Oct 2026": a record's source with its date, the same on the company page and the tables. */
export const sourceWithDate = (source: string, updatedAt: string | null | undefined): string => {
  const d = updatedAt ? new Date(updatedAt) : null;
  const when = d && Number.isFinite(d.getTime()) ? ` · updated ${d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}` : "";
  return `${SOURCE_LABEL[source] ?? source}${when}`;
};
/** Plain labels for sources in the UI. */
export const SOURCE_LABEL: Record<string, string> = {
  // Two names a member can tell apart: the seat holder published it, or another member added it.
  "Published engagement": "Published by the seat holder",
  "Member success story": "Member story",
  "Demand scan": "Job posting",
  "Member added": "Added by a member",
  Clay: "Revenue Nomad research",
  // Current fractional seats Revenue Nomad found. Nobody holds one on Merlin until its fractional claims it.
  "Seat scan": "Revenue Nomad research",
  // A client a fractional or outsourced executive firm names on its own website (case study,
  // testimonial or logo wall), scripts/add-firm-clients.mjs. The firm is never named to members.
  "Firm client list": "Named by a fractional firm",
  // A client named in a verified Clutch review of a fractional, interim or outsourced leader.
  "Clutch review": "Clutch review",
  // A leader read from the company's own team page or a press release there (lib/leaders).
  "Company website": "From the company's website",
};

/**
 * "Who introduced you" on a seat: the seat holder's own note, never a fact of the table. It is not
 * in GROUPS, so no table, export, count or connector answer ever carries it: the server keeps it
 * apart (State.seatPrivate) and sends it to the seat holder alone. Merlin uses it only as counts.
 */
export const INTRO_FIELD: FieldDef = {
  key: "introducedBy",
  label: "Who introduced you",
  short: "Introduced by",
  kind: "text",
  gated: true,
  placeholder: "A name, a firm, or how it came about",
  hint: "Only you see this. Merlin only counts it, never shows it.",
  say: "who introduced you",
};

/** By entity, then key: a view looks a field up for every cell it builds, so without making `${entity}.${key}` each time. */
const FIELD_BY_KEY = new Map<string, Map<string, FieldDef>>();
for (const [entity, f] of [...ALL_FIELDS.map((x) => [x.entity, x.f] as const), ["engagement", INTRO_FIELD] as const]) {
  let byKey = FIELD_BY_KEY.get(entity);
  if (!byKey) FIELD_BY_KEY.set(entity, (byKey = new Map()));
  byKey.set(f.key, f);
}
export const fieldDef = (entity: string, key: string): FieldDef | undefined => FIELD_BY_KEY.get(entity)?.get(key);

/**
 * Control and bidi-override characters (they can visually reverse nearby text), removed
 * from anything a member types. Line breaks and tabs become spaces first.
 */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;
export const stripInvisible = (raw: unknown) =>
  String(raw ?? "").normalize("NFC").replace(/[\t\n\r\v\f]/g, " ").replace(INVISIBLE, "");

const RATE_RE =
  /[$€£]|\d\s*k\b|\/\s*(hr|h|hour|day|wk|week|mo|month|yr|year|project)\b|\bper\b|\b(hourly|daily|weekly|monthly|annual|retainer|project|usd|eur|gbp)\b/i;

/** "VP", "SVP", "EVP" or "Vice President", then "of" or a comma or neither, before a function's name ("VP of Finance", "Vice President, Product"). */
const VP = String.raw`\b(?:[se]?vp|vice[\s-]president)\b,?\s+(?:of\s+)?`;
/**
 * Seats outside GTM, tried after the GTM rules, so "Revenue Operations" stays RevOps, "Product
 * Marketing" stays Product Marketing and "VP Sales Engineering" stays Sales. Executive keeps the
 * CEO, President, GM and Chief of Staff (tried last).
 */
const NON_GTM_RULES: [RegExp, string][] = [
  [new RegExp(String.raw`\bcfo\b|chief financial|\bcontroller\b|\bcomptroller\b|${VP}finance\b|\bhead of finance\b|\bfinance\b|\bfinancial\b|\bfp&a\b|\baccounting\b|\btreasur(?:er|y)\b`), "Finance"],
  [new RegExp(String.raw`\bcto\b|chief technology|chief technical|\bcio\b|chief information|\bciso\b|chief (?:information )?security|${VP}engineering\b|\bhead of engineering\b|\bengineering\b`), "Technology"],
  [new RegExp(String.raw`\bcoo\b|chief operating|chief operations|\bhead of operations\b|${VP}operations\b|\boperations\b`), "Operations"],
  [/\bchro\b|chief people|chief human resources|\bhead of (?:people|hr|human resources|talent)\b|\bhuman resources\b|\bhr\b|\bpeople (?:operations|ops|director|lead|leader)\b/, "People"],
  [/\bgeneral counsel\b|\bclo\b|chief legal|\bhead of legal\b|\blegal\b|\bcounsel\b/, "Legal"],
  [new RegExp(String.raw`\bcpo\b|chief product|\bhead of product\b|${VP}product\b|\bproduct (?:manager|management|lead|leader|director|owner)\b|\bdirector of product\b`), "Product"],
];

/**
 * Best-guess function from a role title ("Fractional VP Sales" -> "Sales", "Fractional CFO" ->
 * "Finance"). GTM first, then the seats outside GTM (NON_GTM_RULES), then Executive.
 */
export function functionOf(role: string | null | undefined): string | null {
  const r = ` ${String(role ?? "").toLowerCase()} `;
  if (!r.trim()) return null;
  const rules: [RegExp, string][] = [
    // AI roles first: "AI SDR" and "GTM engineer" would otherwise read as Sales.
    [
      /\bgtm engineer|go[- ]to[- ]market engineer|\bai[- ]?(native|first|led|powered)\b.*\b(gtm|go[- ]to[- ]market|sales|marketing|revenue|growth)|\bai[\s-]+(gtm|go[- ]to[- ]market|sdrs?|bdrs?|sales|revenue|rev ?ops|marketing|growth|outbound|prospecting|automation|agents?|workflows?|enablement|operations|ops)\b|\b(gtm|go[- ]to[- ]market|sales|revenue|marketing|growth|outbound) ai\b/,
      "AI GTM",
    ],
    // People seats whose title holds a GTM word ("HR Business Partner", "Talent Acquisition"): before the Partnerships and Growth rules catch them.
    [/\b(?:hr|human resources|people|talent)(?: business)? partner\b|\btalent acquisition\b/, "People"],
    [/rev ?ops|revenue operations|sales operations|sales ops|marketing operations|gtm operations|operations analyst/, "RevOps"],
    [/enablement|training/, "Enablement"],
    [/product marketing|\bpmm\b/, "Product Marketing"],
    [/partner|alliances|channel|business development|\bbd\b|\bbdr\b/, "Partnerships"],
    [/customer success|\bcs\b|account management|client success|customer experience|\bcx\b|onboarding|support|renewals/, "Customer Success"],
    [/growth|demand gen|acquisition/, "Growth"],
    [/marketing|\bcmo\b|brand|content|communications|\bpr\b/, "Marketing"],
    [/sales|\bcro\b|revenue|account executive|\bae\b|\bsdr\b|commercial|go-to-market|\bgtm\b/, "Sales"],
    ...NON_GTM_RULES,
    [/\bceo\b|chief executive|president|general manager|\bgm\b|founder|managing director|chief of staff/, "Executive"],
  ];
  for (const [re, fn] of rules) if (re.test(r)) return fn;
  return null;
}

/** Map a raw employee count to the Revenue Nomad bucket. */
export function employeesBucket(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n <= 10) return "1–10";
  if (n <= 50) return "11–50";
  if (n <= 200) return "51–200";
  if (n <= 500) return "201–500";
  if (n <= 1000) return "501–1,000";
  return "1,001+";
}

/** Normalize and validate a value for a field. Returns the clean value or an error message. */
/** A person's first and last name: two or more words of letters (with ' - . allowed), no digits or emails. */
export const PERSON_NAME_RE = /^(?=.{3,60}$)\p{L}[\p{L}'’.-]*(?: \p{L}[\p{L}'’.-]*)+$/u;

/** Half of a character pair on its own (what a cut in the middle of an emoji leaves behind). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** Text with no half characters in it, so it can always be shown, encoded and stored. */
export const wellFormed = (s: string) => s.replace(LONE_SURROGATE, "");
/** The first `max` units of a text, never ending in half a character. */
export const cut = (s: string, max: number) => wellFormed(s.slice(0, max));
/** What a member typed, tidied: invisible characters out, spaces collapsed, cut to `max` whole characters. */
export const tidy = (raw: unknown, max: number) => cut(stripInvisible(raw).trim().replace(/\s+/g, " "), max).trim();

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "3/2025", "2025-3", "Mar 2025", "March 2025" and "2025-03-15" as "2025-03". Anything else comes back as it was. */
function asMonth(v: string): string {
  const ym = (y: string, m: number) => (m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, "0")}` : v);
  let m = v.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m) return ym(m[2], Number(m[1]));
  m = v.match(/^(\d{4})[/-](\d{1,2})(?:-\d{1,2})?$/);
  if (m) return ym(m[1], Number(m[2]));
  m = v.match(/^([A-Za-z]{3,9})\.?,? (\d{4})$/);
  if (m) {
    const word = m[1].toLowerCase();
    return ym(m[2], MONTHS.findIndex((full) => word === full.slice(0, 3) || (word.length > 3 && full.startsWith(word))) + 1);
  }
  return v;
}
/** The latest moment that is "now" somewhere on Earth: members ahead of UTC are already in the next month. */
const AHEAD_MS = 14 * 60 * 60 * 1000;

/**
 * Hosts that many companies share (social profiles, site builders, job boards). A website there
 * keeps its path, and two companies are never matched by the host alone: linkedin.com/company/a
 * and linkedin.com/company/b are two companies. A subdomain counts too (sites.google.com).
 */
const SHARED_HOSTS = [
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "fb.com", "instagram.com", "threads.net", "tiktok.com", "youtube.com",
  "github.com", "gitlab.com", "medium.com", "google.com", "notion.site", "notion.so", "linktr.ee", "wellfound.com", "angel.co",
  "crunchbase.com", "about.me", "behance.net", "dribbble.com", "producthunt.com", "ycombinator.com", "glassdoor.com", "indeed.com",
  "lever.co", "greenhouse.io", "ashbyhq.com", "workable.com", "bit.ly", "wix.com", "squarespace.com", "carrd.co",
];
export const isSharedHost = (host: string) => SHARED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
/**
 * What two company websites are compared by, never shown: the host ("acme.com"), or on a shared
 * host the host and the path ("linkedin.com/company/acme"). Null when there is nothing to match
 * on (no host, or a shared host with no path).
 */
export function siteKey(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const cut = s.search(/[/?#]/);
  const host = (cut < 0 ? s : s.slice(0, cut)).toLowerCase();
  if (!/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(host)) return null;
  if (!isSharedHost(host)) return host;
  const pathPart = (cut < 0 ? "" : s.slice(cut)).split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  return pathPart ? host + pathPart : null;
}

/** Query parameters that only say where a click came from. A long link loses these first. */
const TRACKING_PARAM = /^(utm_.*|gclid|gbraid|wbraid|dclid|fbclid|msclkid|mc_[ce]id|igshid|_hs(enc|mi)|hsctatracking|trk|trkinfo|refid|trackingid|lipi|ref|ref_?src|referrer|from|src|source|tk|si|spm|campaign|medium|cmpid|sc_cid|gh_src|lever-(source|origin)|lever-source\[\]|mkt_tok|_ga|_gl|yclid|ttclid|share_id)$/i;
/** Query parameters that say which job a link is for. When a link is still too long, only these stay. */
const JOB_PARAM = /^(jk|vjk|gh_jid|currentjobid|jobid|job_?id|jid|id|posting_?id|req(uisition)?_?id|pid|position_?id|opening_?id|ashby_jid|lever_?id)$/i;
/** A query with some parameters left out (`keep` says which stay). Keeps their order and how they were written. */
function keepParams(query: string, keep: (name: string) => boolean): string {
  return query
    .split("&")
    .filter((p) => p && keep(decodeURIComponentSafe(p.split("=")[0])))
    .join("&");
}
const decodeURIComponentSafe = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
/**
 * A link over 200 characters: drop the tracking codes, then, if it is still too long, every
 * parameter that does not name the job. The path and a fragment (a hash-routed page) stay.
 */
function shortenLink(u: string): string {
  const hash = u.indexOf("#");
  const frag = hash < 0 ? "" : u.slice(hash);
  const rest = hash < 0 ? u : u.slice(0, hash);
  const q = rest.indexOf("?");
  if (q < 0) return u;
  const base = rest.slice(0, q).replace(/\/$/, "");
  const join = (query: string) => `${base}${query ? `?${query}` : ""}${frag}`;
  let out = join(keepParams(rest.slice(q + 1), (n) => !TRACKING_PARAM.test(n)));
  if (out.length > 200) out = join(keepParams(rest.slice(q + 1), (n) => JOB_PARAM.test(n)));
  return out;
}

export function cleanValue(f: FieldDef, raw: unknown): { value?: string; error?: string } {
  // The app only ever sends text (or a number for hours). Anything else is not a value.
  if (raw !== null && raw !== undefined && typeof raw !== "string" && typeof raw !== "number") return { error: "Type this in as text." };
  const whole = stripInvisible(raw).trim().replace(/\s+/g, " ");
  if (!whole) return { error: "It's still empty. Add something first." };
  if (f.kind === "url") {
    let u = wellFormed(whole).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
    // A link too long to keep whole loses its tracking codes, never the part that names the job.
    if (u.length > 200) u = shortenLink(u);
    if (u.length > 200) return { error: "That link is too long. Paste the short link." };
    if (!/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(u)) return { error: "That doesn't look like a web address. Paste the whole thing, like acme.com." };
    // The host never depends on case. A company's website is its host and nothing after it,
    // except on a host many companies share (linkedin.com/company/acme), where the path names the company.
    const slash = u.indexOf("/");
    const host = (slash < 0 ? u : u.slice(0, slash)).toLowerCase();
    if (f.key === "website") {
      const pathPart = slash < 0 ? "" : u.slice(slash).split(/[?#]/)[0].replace(/\/+$/, "");
      return { value: isSharedHost(host) && pathPart ? host + pathPart : host };
    }
    return { value: slash < 0 ? host : host + u.slice(slash) };
  }
  const v = cut(whole, 200).trim();
  if (!v) return { error: "It's still empty. Add something first." };
  switch (f.kind) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? { value: v.toLowerCase() } : { error: "That doesn't look like an email address. Check it for a typo." };
    case "phone":
      return v.replace(/\D/g, "").length >= 7 ? { value: v } : { error: "That doesn't look like a phone number. It needs at least 7 digits." };
    case "month":
    case "monthOrOngoing": {
      if (f.kind === "monthOrOngoing" && /^ongoing$/i.test(v)) return { value: "Ongoing" };
      const m = asMonth(v);
      if (!/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(m)) return { error: f.kind === "month" ? "Use a year and month, like 2025-03." : "Pick the month it ended, or Ongoing if it's still going." };
      if (Number(m.slice(0, 4)) < 1970) return { error: "That's too far back. Pick a month from 1970 on." };
      // Compared with the month that has already started somewhere on Earth, so nobody ahead of UTC is refused.
      const thisMonth = new Date(Date.now() + AHEAD_MS).toISOString().slice(0, 7);
      if (m.length === 4 ? m > thisMonth.slice(0, 4) : m > thisMonth) return { error: "That month hasn't happened yet. Pick this month or earlier." };
      return { value: m };
    }
    case "number":
      return /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 80 ? { value: v } : { error: "Use a whole number from 1 to 80." };
    case "choice": {
      // Several picks: each one on the list, kept in the list's order.
      if (f.multi) {
        const picks = v.split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
        const list = f.options ?? [];
        if (!picks.length || picks.some((x) => !list.includes(x))) return { error: "Pick from the list." };
        return { value: list.filter((o) => picks.includes(o)).join(", ") };
      }
      // Industry, employees and revenue take the closest standard value ("< $1M", "51-200", "Software Development").
      const now = STANDARD_FIELDS.has(f.key) ? toStandard(f.key, v) ?? v : v;
      return f.options?.includes(now) ? { value: now } : { error: "Pick one from the list." };
    }
    default:
      if (f.key === "rate" && !(/\d/.test(v) && RATE_RE.test(v))) return { error: "Use a rate like $8k/mo or $150/hr." };
      if (f.key === "operator" && !PERSON_NAME_RE.test(v)) return { error: "Use their first and last name, like Jane Smith." };
      // A person's name that holds a greeting or a page's words ("Welcome Read", "Meet Our Team"): lib/nameWords.ts. A seat
      // holder's name is always the member's own (lib/table.ts setValue), never refused for its words.
      if (f.key === "name" && !f.identity && neverAName(v)) return { error: NEVER_NAME_REFUSED };
      // Two letters is a title ("GM", "AE", "VP"), and so is one Han, Kana or Hangul character (営業).
      if (f.key === "role" && (v.match(/\p{L}/gu) ?? []).length < 2 && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(v))
        return { error: "Use the seat's title, like Fractional VP Sales." };
      // An HQ keeps the way it was typed, without a space before a comma ("Venice , CA" is "Venice, CA").
      if (f.key === "hq") {
        const hq = v.replace(/\s+,/g, ",").replace(/,(?=\S)/g, ", ");
        return hq.length >= 2 ? { value: hq } : { error: "That's too short. Use at least 2 characters." };
      }
      return v.length >= 2 ? { value: v } : { error: "That's too short. Use at least 2 characters." };
  }
}
