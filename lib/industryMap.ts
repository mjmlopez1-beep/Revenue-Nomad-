/**
 * Incoming industry, revenue and employee values as Revenue Nomad's standard values, exactly as
 * they are in lib/tableFields.ts (RN_INDUSTRIES, RN_REVENUE, RN_EMPLOYEES). The lists never
 * change here. Whatever arrives (LinkedIn, Clay or Crunchbase industries, a seat-scan file, an
 * older label, a member's typing, "75", "$12M", "51-200", "1001-5000", "< $1M") is mapped to
 * the closest standard value, or to null when nothing fits: an unmappable value stays empty
 * rather than inventing one. Shared by server and client (no Node imports).
 *
 * Industries: today's 110 names map to themselves; other sources' names (SOURCE_NAMES) and our
 * earlier 28 tags (FAMILIES) map to a value, the company's own words picking between close ones;
 * then keyword rules. Revenue and employees are read as numbers or ranges and put in the band
 * holding the range's middle (geometric, so "$10M-$50M" is $20M–$50M and "51-200" is 51–200).
 */
import { RN_EMPLOYEES, RN_INDUSTRIES, RN_REVENUE } from "./tableFields";

const key = (raw: unknown) =>
  String(raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* ---------- industries ---------- */

/**
 * Revenue Nomad's earlier 28 industry tags, and what each is on today's list. An earlier tag is
 * a family: the company's own words (its name and About, and the incoming industry) pick the
 * closest value in it, first rule that matches, else `def` (null: nothing is close enough, so the
 * industry stays empty). LinkedIn, Clay and Crunchbase industries are read through these too.
 */
const FAMILIES: Record<string, { def: string | null; rules: [RegExp, string][] }> = {
  Agriculture: { def: "Farming & Agribusiness", rules: [[/cannabis|hemp/, "Cannabis & Hemp"], [/agtech|ag tech|food innovation|technology|platform|software/, "AgTech & Food Innovation"]] },
  Arts: { def: "Media & Content", rules: [[/event|festival|concert|live|theater|theatre/, "Sports, Events & Live Entertainment"]] },
  Construction: {
    def: "General Contractors & Builders",
    rules: [
      [/subcontract|electrical|plumbing|roofing|hvac|concrete|painting|specialty trade|landscap/, "Specialty Trades & Subcontractors"],
      [/building materials|lumber|supply|supplies/, "Building Materials & Supply"],
      [/remodel|renovation|handyman|home services|home improvement/, "Home Services"],
      [/architect|engineering firm|civil engineering/, "Architecture, Engineering & Design"],
    ],
  },
  "Consumer Goods": {
    def: "Consumer Goods & CPG (Non-Food)",
    rules: [
      [/cannabis|cbd|hemp/, "Cannabis & Hemp"],
      [/\bpets?\b|dog|cat food/, "Pet Industry"],
      [/food|beverage|snack|drink|coffee|\btea\b|wine|beer|spirits|brewery|nutrition|dairy|bakery/, "Food & Beverage CPG"],
      [/luxury|premium|jewelry|jewellery/, "Luxury & Premium Brands"],
      [/e ?commerce|d2c|dtc|direct to consumer|online store|shopify/, "E-Commerce & D2C"],
    ],
  },
  "Corporate Services": {
    def: "Professional Services",
    rules: [
      [/staffing|recruit|talent acquisition|executive search|headhunt|hiring/, "Staffing & Recruiting"],
      [/cleaning|janitorial|security services|facilit/, "Cleaning, Security & Facilities Services"],
      [/coworking|co working|flexible workspace|shared office/, "Coworking & Flexible Workspace"],
      [/print|signage|promotional products/, "Print, Signage & Promotional Products"],
      [/training|coaching|learning|leadership development/, "Corporate Learning & Training"],
      [/consult|advis|strategy|management services/, "Consulting & Advisory"],
    ],
  },
  Design: { def: "Architecture, Engineering & Design", rules: [[/agency|branding|brand design|creative/, "Advertising & Media Agencies"]] },
  Education: {
    def: "Education",
    rules: [
      [/k ?12|school district|elementary|middle school|high school|charter school/, "K-12 Schools & Districts"],
      [/university|college|higher ed/, "Higher Education"],
      [/childcare|child care|daycare|preschool|early education|early learning/, "Childcare & Early Education"],
      [/corporate training|employee training|workforce|leadership training|upskill|professional training|coaching/, "Corporate Learning & Training"],
      [/edtech|ed tech|platform|online|\bapp\b|software|e ?learning|saas/, "EdTech"],
    ],
  },
  "Energy & Mining": {
    def: null,
    rules: [
      [/\boil\b|\bgas\b|petroleum|drilling|midstream|upstream/, "Oil & Gas"],
      [/solar|wind|renewable|clean ?tech|battery|ev charging|electric vehicle|climate|carbon|hydrogen/, "Renewable Energy & Cleantech"],
      [/utilit|electric power|power generation|water/, "Utilities (Electric, Gas, Water)"],
      [/environment|waste|recycl/, "Environmental Services"],
      [/exxon|chevron|\bshell\b|\bbp\b|petro/, "Oil & Gas"],
      [/energy|power|fusion|charging|sun|efficiency|warmte|heat|\bh2/, "Renewable Energy & Cleantech"],
    ],
  },
  Entertainment: {
    def: "Media & Content",
    rules: [
      [/casino|gambling|betting|sportsbook/, "Gaming & Casinos"],
      [/video game|\bgames?\b|gaming|esports|interactive/, "Gaming & Interactive Entertainment"],
      [/theme park|amusement|attraction/, "Theme Parks & Attractions"],
      [/sport|event|live|concert|festival|venue/, "Sports, Events & Live Entertainment"],
      [/creator|influencer|social media/, "Creator Economy & Social"],
    ],
  },
  Finance: { def: "Accounting & Tax", rules: [] },
  "Financial Services": {
    def: null,
    rules: [
      [/\bbank|credit union/, "Banking & Credit Unions"],
      [/insurance|insurtech|health plan|underwrit/, "Insurance & Health Plans"],
      [/venture capital|private equity|\bvc\b|\bpe\b firm|investment firm|capital partners|family office/, "Private Equity & Venture Capital"],
      [/wealth|asset management|financial advis|investment advis|financial planning|retirement/, "Wealth Management & Advisory"],
      [/mortgage|lending|\bloans?\b|lender/, "Mortgage & Lending"],
      [/payment|payroll|card issuing|processing|banking as a service|fintech infrastructure/, "Payments & Fintech Infrastructure"],
      [/accounting|bookkeep|\btax\b|\bcpa\b/, "Accounting & Tax"],
      [/fintech|financial technology|neobank|\bapp\b|platform|software|crypto|blockchain/, "Fintech"],
      // Names alone: "Capinext", "Jax Equity", "Angel Invest", "Bippit", "AxeFi".
      [/building society/, "Banking & Credit Unions"],
      [/equity|invest|\bcapital|angel|ventures?\b/, "Private Equity & Venture Capital"],
      [/[a-z]fi\b|\bfin|finance|\bpay|card\b|money|wallet|bitcoin|\bcoin|\bcash|\bledger/, "Fintech"],
    ],
  },
  "Hardware & Networking": {
    def: "Hardware / IoT",
    rules: [
      [/semiconductor|\bchips?\b|electronic/, "Electronics & Semiconductor"],
      [/data center|colocation/, "Data Centers & Colocation"],
      [/telecom|wireless|5g|connectivity|fiber|broadband|network/, "Telecommunications & Connectivity"],
      [/industrial|automation|robotic/, "Industrial Automation & IoT"],
    ],
  },
  "Health Care": {
    def: "Health Care",
    rules: [
      [/pharma|biotech|therapeutic|drug|life science|biopharma|clinical trial/, "Pharma & Biotech"],
      [/medical device|diagnostic|medtech|med tech|imaging/, "Medical Devices & Diagnostics"],
      [/veterinar|animal health/, "Veterinary & Animal Health"],
      [/health insurance|health plan|payer/, "Insurance & Health Plans"],
      [/senior living|assisted living/, "Senior Living & Assisted Living"],
      [/home care|home health|aging/, "Home Care & Aging Services"],
      [/hospital|clinic|medical practice|health system|physician|dental|medical group|care center|urgent care/, "Healthcare Providers & Health Systems"],
    ],
  },
  Legal: { def: "Law Firms & Legal Departments", rules: [] },
  Manufacturing: {
    def: "Industrial Manufacturing",
    rules: [
      [/aerospace|defense|defence|aviation/, "Aerospace & Defense"],
      [/automotive|vehicle|auto parts/, "Automotive"],
      [/packag/, "Packaging"],
      [/semiconductor|electronic/, "Electronics & Semiconductor"],
      [/medical device/, "Medical Devices & Diagnostics"],
      [/automation|robotic|\biot\b/, "Industrial Automation & IoT"],
      [/precision|contract manufactur|machining|\bcnc\b/, "Precision & Contract Manufacturing"],
      [/distribut/, "Industrial Distribution"],
      [/building materials/, "Building Materials & Supply"],
      [/food|beverage/, "Food & Beverage CPG"],
    ],
  },
  "Media & Communications": {
    def: "Media & Content",
    rules: [
      [/agency|advertising|marketing services|public relations|\bpr\b|creative studio|branding|media buying/, "Advertising & Media Agencies"],
      [/telecom|wireless|connectivity|broadband/, "Telecommunications & Connectivity"],
      [/creator|influencer|social media/, "Creator Economy & Social"],
      [/publish|news|magazine|digital media|journalism|podcast|newsletter/, "Digital Media & Publishing"],
    ],
  },
  Nonprofit: { def: "Nonprofit & Associations", rules: [[/church|faith|religious|ministry|christian|jewish|muslim/, "Religious & Faith-Based"]] },
  "Public Administration": {
    def: "State & Local Government",
    rules: [
      [/government contractor|govcon|government services|federal contractor/, "Government Contractors"],
      [/federal|national|department of defense|armed forces/, "Federal Government"],
    ],
  },
  "Public Safety": { def: "Cleaning, Security & Facilities Services", rules: [[/police|fire department|city of|county of|government/, "State & Local Government"]] },
  "Real Estate": {
    def: null,
    rules: [
      [/self storage/, "Self-Storage"],
      [/coworking|flexible workspace/, "Coworking & Flexible Workspace"],
      [/vacation rental|short term rental|airbnb/, "Vacation Rentals & Short-Term Rental"],
      [/property management/, "Property Management"],
      [/mortgage/, "Mortgage & Lending"],
      [/commercial|office space|industrial real estate|\bcre\b|leasing non residential/, "Commercial Real Estate"],
      [/residential|homes?\b|apartment|realtor|brokerage|real estate agent|estate agents|houses|realty|home ?search|\bsale\b/, "Residential Real Estate"],
      [/office|workspace|\bwork\b|kontor|savills|property|properties|real estate/, "Commercial Real Estate"],
    ],
  },
  "Recreation & Travel": {
    def: "Travel & Tourism",
    rules: [
      [/hotel|resort|motel/, "Hotels & Resorts"],
      [/catering|food service/, "Catering & Institutional Food Service"],
      [/restaurant|dining|cafe|bistro|\bqsr\b/, "Restaurants"],
      [/vacation rental|short term rental/, "Vacation Rentals & Short-Term Rental"],
      [/theme park|amusement|attraction/, "Theme Parks & Attractions"],
      [/casino/, "Gaming & Casinos"],
      [/\bgym\b|fitness/, "Fitness & Wellness"],
      [/event|sport|festival|concert|venue/, "Sports, Events & Live Entertainment"],
    ],
  },
  Retail: {
    def: "Brick & Mortar Retail",
    rules: [
      [/marketplace/, "Marketplace"],
      [/wholesale/, "General & Specialty Wholesale"],
      [/dealership/, "Auto Dealerships"],
      [/luxury|jewelry/, "Luxury & Premium Brands"],
      [/\bpets?\b/, "Pet Industry"],
      [/e ?commerce|online|d2c|dtc|direct to consumer|shopify|mail order/, "E-Commerce & D2C"],
    ],
  },
  SaaS: { def: "SaaS", rules: [] },
  Software: {
    def: "SaaS",
    rules: [
      [/cyber ?security|security software|threat|identity management/, "Cybersecurity"],
      [/developer|\bapis?\b|devops|\bsdk\b|open source|engineering teams/, "Developer Tools"],
      [/artificial intelligence|\bai\b|machine learning|deep tech|computer vision|\bllm/, "Deep Tech / AI"],
      [/analytics|business intelligence|data platform|data infrastructure/, "Data & Analytics"],
      [/small business|\bsmbs?\b|small and medium|local business|freelancer|solopreneur/, "SMB Software"],
      [/enterprise|\berp\b|fortune 500|large organi[sz]ations/, "Enterprise Software"],
      [/marketplace/, "Marketplace"],
      [/fintech|payments/, "Fintech"],
      [/edtech/, "EdTech"],
    ],
  },
  "Software & IT Services": {
    def: "IT Services",
    rules: [
      [/cyber ?security|computer and network security|security operations/, "Cybersecurity"],
      [/data center|colocation|hosting/, "Data Centers & Colocation"],
      [/telecom|connectivity|internet service provider|\bisp\b/, "Telecommunications & Connectivity"],
      [/managed services|\bmsp\b|it consulting|it services|systems integrat|outsourc|it support/, "IT Services"],
      [/artificial intelligence|machine learning|\bai\b/, "Deep Tech / AI"],
      [/analytics|data infrastructure|business intelligence/, "Data & Analytics"],
      [/saas|software as a service|platform|software development|\bapp\b/, "SaaS"],
    ],
  },
  "Transportation & Logistics": {
    def: "Freight & Trucking",
    rules: [
      [/airline/, "Airlines & Aviation Services"],
      [/maritime|ocean|\bport\b|shipping line|aviation|air cargo/, "Maritime & Aviation Logistics"],
      [/warehous|fulfillment|\b3pl\b/, "Warehousing & Fulfillment"],
      [/fleet|vehicle management/, "Fleet & Vehicle Management"],
      [/food distribution/, "Food Distribution & Supply"],
      [/supply chain|procurement/, "Procurement & Supply Chain Leaders"],
    ],
  },
  "Web Development Service": { def: "IT Services", rules: [[/agency|marketing|advertising|branding/, "Advertising & Media Agencies"]] },
  "Wellness & Fitness": { def: "Fitness & Wellness", rules: [[/salon|\bspa\b|beauty|nail|barber/, "Salons, Spas & Beauty Services"]] },
};
/** Every family's default, for a report (earlier tag -> today's value when nothing else is known). */
export const OLD_INDUSTRY_DEFAULTS: Record<string, string | null> = Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, f.def]));

/** Names other sources use (LinkedIn, Clay, Crunchbase), as a value on today's list or "@" and an earlier tag (a family). */
const SOURCE_NAMES: Record<string, string[]> = {
  "@Agriculture": ["Farming", "Farming, Ranching, Forestry", "Ranching", "Fisheries", "Forestry", "Agriculture, Construction, Mining Machinery Manufacturing", "Food Production"],
  "AgTech & Food Innovation": ["AgTech", "Ag Tech", "Food Tech", "FoodTech"],
  "@Arts": ["Fine Art", "Museums, Historical Sites, and Zoos", "Museums and Institutions", "Performing Arts", "Artists and Writers", "Arts and Crafts", "Photography", "Arts"],
  "@Construction": ["Construction", "Building Construction", "Civil Engineering", "Residential Building Construction", "Nonresidential Building Construction"],
  "Specialty Trades & Subcontractors": ["Specialty Trade Contractors"],
  "Building Materials & Supply": ["Building Materials", "Wholesale Building Materials"],
  "@Consumer Goods": [
    "Consumer Goods", "Consumer Services", "Personal Care Product Manufacturing", "Cosmetics", "Apparel & Fashion", "Apparel and Fashion", "Furniture",
    "Furniture and Home Furnishings Manufacturing", "Sporting Goods", "Sporting Goods Manufacturing", "Consumer Electronics", "Household Appliance Manufacturing", "Tobacco",
    "Consumer Products", "CPG", "Beauty",
  ],
  "Food & Beverage CPG": ["Food and Beverage Services", "Food & Beverages", "Food and Beverage Manufacturing", "Beverage Manufacturing", "Wine & Spirits", "Dairy", "Food and Beverage"],
  "Luxury & Premium Brands": ["Luxury Goods & Jewelry"],
  "Pet Industry": ["Pet Products", "Pet Services"],
  "Consulting & Advisory": ["Business Consulting and Services", "Management Consulting", "Strategic Management Services", "Consulting"],
  "Staffing & Recruiting": ["Staffing and Recruiting", "Executive Search", "Human Resources Services", "Human Resources", "Recruiting"],
  "Professional Services": ["Professional Services", "Outsourcing and Offshoring Consulting", "Outsourcing/Offshoring", "Business Services", "Administrative and Support Services", "Translation and Localization", "Market Research"],
  "Corporate Learning & Training": ["Professional Training and Coaching", "Training"],
  "Cleaning, Security & Facilities Services": ["Facilities Services", "Security and Investigations", "Security Guards and Patrol Services", "Janitorial Services"],
  "@Corporate Services": ["Corporate Services", "Events Services", "Business Supplies and Equipment", "Program Development", "Think Tanks"],
  "Architecture, Engineering & Design": ["Design", "Design Services", "Graphic Design", "Architecture and Planning", "Architecture & Planning", "Interior Design", "Industrial Design", "Engineering Services"],
  "@Education": ["Education", "Education Administration Programs", "Education Management", "Training"],
  EdTech: ["E-Learning Providers", "E-Learning", "Ed Tech"],
  "Higher Education": ["Higher Ed", "Universities", "Colleges"],
  "K-12 Schools & Districts": ["Primary and Secondary Education", "K-12", "K12"],
  "Oil & Gas": ["Oil and Gas", "Oil & Energy", "Oil, Gas, and Mining", "Oil and Gas Extraction"],
  "Utilities (Electric, Gas, Water)": ["Utilities", "Electric Power Generation", "Electric Power Transmission, Control, and Distribution", "Water Supply and Irrigation Systems"],
  "Renewable Energy & Cleantech": ["Renewables & Environment", "Renewable Energy", "Renewable Energy Semiconductor Manufacturing", "Solar", "Solar Electric Power Generation", "Clean Energy", "CleanTech", "Energy Storage"],
  "Climate / Clean Tech": ["Climate Tech", "Climate", "Sustainability", "Carbon Capture"],
  "Environmental Services": ["Environmental Services", "Waste Management", "Recycling", "Water Purification"],
  "@Energy & Mining": ["Energy & Mining", "Mining", "Mining & Metals", "Energy"],
  "@Entertainment": ["Entertainment", "Entertainment Providers", "Music", "Musicians", "Movies, Videos, and Sound", "Motion Pictures and Film", "Animation", "Animation and Post-production", "Media Production"],
  "Gaming & Interactive Entertainment": ["Computer Games", "Gaming", "Video Games", "Mobile Gaming Apps", "Esports"],
  "Gaming & Casinos": ["Gambling Facilities and Casinos", "Casinos", "Gambling"],
  "Sports, Events & Live Entertainment": ["Spectator Sports", "Sports", "Events", "Live Events", "Performing Arts and Spectator Sports"],
  "Accounting & Tax": ["Finance", "Accounting", "Bookkeeping", "Tax", "Accounting Services"],
  "@Financial Services": ["Financial Services", "Financial", "Capital Markets", "Investment Management", "Funds and Trusts", "Credit Intermediation"],
  "Banking & Credit Unions": ["Banking", "Credit Unions", "Retail Banking"],
  "Private Equity & Venture Capital": ["Venture Capital and Private Equity Principals", "Venture Capital & Private Equity", "Venture Capital", "Private Equity", "Investment Banking"],
  "Wealth Management & Advisory": ["Wealth Management", "Financial Advisory"],
  "Insurance & Health Plans": ["Insurance", "Insurance and Employee Benefit Funds", "InsurTech", "Insurance Carriers", "Insurance Agencies and Brokerages"],
  "Mortgage & Lending": ["Lending", "Mortgage", "Loan Brokers"],
  "Payments & Fintech Infrastructure": ["Payments", "Payment Processing"],
  Fintech: ["FinTech", "Crypto", "Cryptocurrency", "Blockchain", "Web3"],
  "@Hardware & Networking": ["Hardware & Networking", "Computer Hardware", "Computer Hardware Manufacturing", "Hardware", "Robotics"],
  "Hardware / IoT": ["IoT", "Internet of Things", "Consumer Electronics Manufacturing"],
  "Telecommunications & Connectivity": ["Computer Networking", "Computer Networking Products", "Telecommunications Equipment", "Wireless Services", "Telecommunications", "Telecommunications Carriers", "Media and Telecommunications"],
  "Electronics & Semiconductor": ["Semiconductors", "Semiconductor Manufacturing", "Electronics", "Appliances, Electrical, and Electronics Manufacturing"],
  "@Health Care": ["Health Care", "Healthcare", "Hospital & Health Care", "Hospitals and Health Care", "HealthTech", "Health Tech", "Digital Health", "Medical"],
  "Healthcare Providers & Health Systems": ["Medical Practices", "Medical Practice", "Hospitals", "Mental Health Care", "Dentists", "Physicians", "Outpatient Care Centers"],
  "Pharma & Biotech": ["Pharmaceutical Manufacturing", "Pharmaceuticals", "Biotechnology", "Biotechnology Research", "Life Sciences", "Therapeutics", "Bioinformatics"],
  "Medical Devices & Diagnostics": ["Medical Devices", "Medical Equipment Manufacturing", "Diagnostics", "MedTech"],
  "Veterinary & Animal Health": ["Veterinary Services", "Veterinary", "Animal Health"],
  "Home Care & Aging Services": ["Home Health Care Services", "Elder Care"],
  "Senior Living & Assisted Living": ["Nursing Homes and Residential Care Facilities", "Assisted Living"],
  "Law Firms & Legal Departments": ["Legal", "Law Practice", "Legal Services", "Alternative Dispute Resolution", "Law Firm"],
  "@Legal": ["LegalTech", "Legal Tech"],
  "@Manufacturing": ["Manufacturing", "Industrial", "Machinery Manufacturing", "Industrial Machinery Manufacturing", "Chemical Manufacturing", "Chemicals", "Plastics Manufacturing", "Textile Manufacturing", "Mechanical or Industrial Engineering", "Advanced Materials", "Nanotechnology"],
  Automotive: ["Motor Vehicle Manufacturing", "Automotive", "Motor Vehicle Parts Manufacturing"],
  "Aerospace & Defense": ["Aviation and Aerospace Component Manufacturing", "Aviation & Aerospace", "Defense and Space Manufacturing", "Defense & Space", "Space Research and Technology"],
  Packaging: ["Packaging and Containers Manufacturing", "Packaging and Containers"],
  "Industrial Automation & IoT": ["Industrial Automation", "Automation Machinery Manufacturing"],
  "Industrial Distribution": ["Wholesale Machinery", "Industrial Machinery Equipment Wholesale"],
  "@Media & Communications": ["Media & Communications", "Media", "Online Media", "Broadcast Media Production and Distribution", "Writing and Editing", "Content"],
  "Advertising & Media Agencies": ["Advertising Services", "Marketing and Advertising", "Marketing & Advertising", "Marketing Services", "Public Relations and Communications Services", "Public Relations", "AdTech", "Ad Tech", "Digital Marketing"],
  "Digital Media & Publishing": ["Online Audio and Video Media", "Newspaper Publishing", "Book and Periodical Publishing", "Publishing", "Internet Publishing", "Journalism", "Podcasts"],
  "Creator Economy & Social": ["Social Media", "Creator Economy", "Social Networking Platforms"],
  "Nonprofit & Associations": ["Nonprofit", "Non-profit Organizations", "Non-profit Organization Management", "Nonprofit Organization Management", "Civic and Social Organizations", "Philanthropic Fundraising Services", "Fundraising", "Philanthropy", "Professional Organizations"],
  "Religious & Faith-Based": ["Religious Institutions"],
  "@Public Administration": ["Public Administration", "Government Administration", "Public Policy", "Public Policy Offices", "Legislative Offices", "International Affairs", "Government", "GovTech"],
  "Government Contractors": ["Government Relations Services"],
  "Federal Government": ["Armed Forces"],
  "@Public Safety": ["Public Safety", "Law Enforcement", "Fire Protection", "Emergency and Relief Services"],
  "@Real Estate": ["Real Estate", "Real Estate Agents and Brokers", "PropTech"],
  "Commercial Real Estate": ["Leasing Non-residential Real Estate", "Commercial Real Estate"],
  "Residential Real Estate": ["Leasing Residential Real Estate"],
  "Property Management": ["Property Management"],
  "Equipment Rental & Leasing": ["Real Estate and Equipment Rental Services", "Equipment Rental Services"],
  "@Recreation & Travel": ["Recreation & Travel", "Leisure, Travel & Tourism", "Recreational Facilities", "Hospitality"],
  "Travel & Tourism": ["Travel Arrangements", "Travel", "Tourism"],
  "Hotels & Resorts": ["Hotels and Motels", "Hotels"],
  Restaurants: ["Restaurants", "Food & Restaurants", "Food Service"],
  "Airlines & Aviation Services": ["Airlines and Aviation", "Airlines/Aviation"],
  "@Retail": ["Retail", "Retail Apparel and Fashion", "Retail Groceries", "Retail Office Equipment", "Shopping", "Commerce and Shopping"],
  "E-Commerce & D2C": ["Online and Mail Order Retail", "Ecommerce", "Direct to Consumer", "D2C"],
  "General & Specialty Wholesale": ["Wholesale", "Wholesale Trade"],
  SaaS: ["B2B SaaS", "Software as a Service", "Software-as-a-Service", "Software as a Service (SaaS)", "Subscription Service"],
  "@Software": ["Software", "Software Development", "Computer Software", "Mobile Apps", "Apps", "Productivity Tools", "Android", "iOS"],
  "Enterprise Software": ["Enterprise Software", "Enterprise Applications"],
  "Developer Tools": ["Developer Tools", "Developer APIs", "Developer Platform", "Open Source"],
  "Deep Tech / AI": ["Artificial Intelligence", "Artificial Intelligence (AI)", "Machine Learning", "Generative AI", "Deep Tech", "Quantum Computing", "Computer Vision"],
  "Data & Analytics": ["Data and Analytics", "Data Infrastructure and Analytics", "Analytics", "Big Data", "Business Intelligence", "Data Integration", "Data Governance"],
  Cybersecurity: ["Computer and Network Security", "Computer & Network Security", "Cyber Security", "Cybersecurity", "Network Security", "Data Security Software Products", "Privacy and Security", "Identity Management", "Fraud Detection"],
  "IT Services": ["IT Services and IT Consulting", "Information Technology & Services", "Information Technology and Services", "IT Services", "IT System Custom Software Development", "IT System Operations and Maintenance", "Managed Services", "Information Technology", "Quality Assurance"],
  "Data Centers & Colocation": ["Data Centers", "Hosting", "Data Center", "Colocation", "Domain Registrar", "Cloud Computing"],
  "Research, Data & Information Services": ["Information Services", "IT System Data Services", "Research Services", "Research"],
  "@Software & IT Services": ["Software & IT Services", "Technology, Information and Internet", "Technology, Information and Media", "Internet"],
  "@Transportation & Logistics": ["Transportation & Logistics", "Transportation, Logistics, Supply Chain and Storage", "Transportation", "Logistics"],
  "Freight & Trucking": ["Freight and Package Transportation", "Truck Transportation", "Package/Freight Delivery", "Rail Transportation", "Trucking"],
  "Warehousing & Fulfillment": ["Warehousing and Storage", "Warehousing", "Fulfillment"],
  "Maritime & Aviation Logistics": ["Maritime Transportation", "Shipping", "Maritime"],
  "Procurement & Supply Chain Leaders": ["Logistics and Supply Chain", "Supply Chain", "Supply Chain Management", "Procurement"],
  "@Web Development Service": ["Web Development Service", "Web Development", "Web Design", "Website Development", "Web Design and Development"],
  "Fitness & Wellness": ["Wellness & Fitness", "Wellness and Fitness Services", "Health, Wellness & Fitness", "Health, Wellness and Fitness", "Fitness", "Wellness", "Nutrition", "Fitness and Wellness"],
  "Salons, Spas & Beauty Services": ["Beauty Salons", "Spas", "Personal Care Services"],
  "Self-Storage": ["Self Storage"],
  "Childcare & Early Education": ["Child Day Care Services", "Childcare"],
  "Cannabis & Hemp": ["Cannabis"],
  Marketplace: ["Marketplace", "Marketplaces", "Online Marketplace"],
  "Home Services": ["Home Services", "Home Improvement"],
  "Funeral Homes & Cemeteries": ["Death Care Services", "Funeral Services"],
  "Print, Signage & Promotional Products": ["Printing Services", "Printing", "Signage"],
};

/** Keywords for a name nothing above has: the first that matches names a family (an earlier tag) or a value. */
const KEYWORDS: [RegExp, string][] = [
  [/\bsaas\b|software as a service/, "SaaS"],
  [/web (design|development)/, "@Web Development Service"],
  [/health wellness|fitness|wellness/, "@Wellness & Fitness"],
  [/hospital|health ?care|medical|pharma|biotech|life science|mental health|dental|veterinary|clinical/, "@Health Care"],
  [/accounting|bookkeeping/, "Accounting & Tax"],
  [/bank|financial|insurance|capital market|investment|venture capital|private equity|credit|fintech|funds|payments|lending|wealth/, "@Financial Services"],
  [/semiconductor|electronics/, "Electronics & Semiconductor"],
  [/telecom|networking|wireless/, "Telecommunications & Connectivity"],
  [/hardware|appliances|iot/, "@Hardware & Networking"],
  [/security/, "Cybersecurity"],
  [/software|\bapps?\b|platform/, "@Software"],
  [/artificial intelligence|machine learning|\bai\b/, "Deep Tech / AI"],
  [/data|analytics/, "Data & Analytics"],
  [/it services|information technology|technology information|internet|cloud/, "@Software & IT Services"],
  [/marketplace/, "Marketplace"],
  [/e ?commerce|online and mail order/, "E-Commerce & D2C"],
  [/retail|wholesale|shopping/, "@Retail"],
  [/consumer|food|beverage|cosmetic|personal care|apparel|luxury|furniture|sporting goods|tobacco|wine|fashion/, "@Consumer Goods"],
  [/construction|building|civil engineering|contractors/, "@Construction"],
  [/real estate|leasing|property/, "@Real Estate"],
  [/manufactur|machinery|automotive|aviation|aerospace|defense|chemical|plastics|packaging|industrial|mechanical|electrical equipment|materials/, "@Manufacturing"],
  [/transport|logistics|freight|shipping|truck|warehous|maritime|airlines|railroad|delivery|supply chain/, "@Transportation & Logistics"],
  [/education|e learning|higher ed|school|training|university|tutoring/, "@Education"],
  [/advertising|marketing|public relations/, "Advertising & Media Agencies"],
  [/media|publishing|broadcast|newspaper|audio|writing|journalism|content/, "@Media & Communications"],
  [/entertainment|games|gaming|music|movies|film|animation|sports|spectator|virtual worlds/, "@Entertainment"],
  [/non ?profit|civic|philanthrop|fundraising|religious|charity/, "@Nonprofit"],
  [/\blaw\b|legal|compliance/, "Law Firms & Legal Departments"],
  [/\boil\b|\bgas\b|mining|energy|utilities|renewable|solar|electric power|carbon|climate|sustainab/, "@Energy & Mining"],
  [/hospitality|travel|leisure|hotel|recreation|restaurants|events|tourism/, "@Recreation & Travel"],
  [/staffing|recruiting/, "Staffing & Recruiting"],
  [/consulting|advisory/, "Consulting & Advisory"],
  [/human resources|outsourc|professional services|facilities|coaching/, "@Corporate Services"],
  [/design|architecture/, "@Design"],
  [/farming|agricultur|ranching|fisheries|forestry/, "@Agriculture"],
  [/government|public policy|legislative|armed forces/, "@Public Administration"],
  [/public safety|law enforcement|fire protection/, "@Public Safety"],
  [/\barts?\b|museum|performing/, "@Arts"],
];

/** Exact names (as keys) -> a value or "@family". Today's names map to themselves. Built on first use (lib/tableFields.ts imports this file). */
let industryMap: Map<string, string> | null = null;
export function industryTable(): Map<string, string> {
  if (industryMap) return industryMap;
  const m = new Map<string, string>();
  for (const tag of RN_INDUSTRIES) m.set(key(tag), tag);
  for (const [target, names] of Object.entries(SOURCE_NAMES)) {
    const tag = target.startsWith("@") ? null : target;
    if (tag && !RN_INDUSTRIES.includes(tag)) throw new Error(`industryMap: ${tag} is not in RN_INDUSTRIES`);
    if (!tag && !FAMILIES[target.slice(1)]) throw new Error(`industryMap: no family ${target}`);
    for (const n of names) if (!m.has(key(n))) m.set(key(n), target);
  }
  for (const f of Object.values(FAMILIES)) for (const [, v] of f.rules) if (!RN_INDUSTRIES.includes(v)) throw new Error(`industryMap: ${v} is not in RN_INDUSTRIES`);
  for (const f of Object.values(FAMILIES)) if (f.def && !RN_INDUSTRIES.includes(f.def)) throw new Error(`industryMap: ${f.def} is not in RN_INDUSTRIES`);
  industryMap = m;
  return m;
}

/** A target ("Fintech" or "@Financial Services") as a value, the family read through `text`. */
function resolve(target: string, text: string): string | null {
  if (!target.startsWith("@")) return target;
  const fam = FAMILIES[target.slice(1)];
  if (!fam) return null;
  for (const [re, tag] of fam.rules) if (re.test(text)) return tag;
  return fam.def;
}

/**
 * An industry as one of RN_INDUSTRIES, or null when nothing is close enough. `context` is the
 * company's own words (its name and About): they pick between close values ("pharmaceutical"
 * is Pharma & Biotech, "staffing" Staffing & Recruiting). `legacy`: the value is one of our
 * earlier tags even where today's list has the same name (Health Care, Education, SaaS), so the
 * context may refine it. A Crunchbase list ("Artificial Intelligence, Transportation") reads
 * its first name that maps.
 */
export function industryOf(raw: unknown, context = "", legacy = false): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const table = industryTable();
  // An earlier tag's own words ("Hardware & Networking", "Energy & Mining") say nothing about which value in it fits: only the company's do.
  const words = key(FAMILIES[text] ? context : `${text} ${context}`);
  const k = key(text);
  if (legacy && FAMILIES[text]) return resolve(`@${text}`, words);
  const whole = table.get(k);
  if (whole) return resolve(whole, words);
  for (const p of text.split(/[;,|/]/).map((x) => key(x)).filter(Boolean)) {
    const hit = table.get(p);
    if (hit) return resolve(hit, words);
  }
  for (const [re, target] of KEYWORDS) if (re.test(k)) return resolve(target, words);
  return null;
}

/* ---------- numbers and ranges ---------- */

const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** The numbers a text names: "51-200" -> 51 to 200, "< $1M" -> 0 to 1M, "10,001+" -> 10001 and up, "1-5M" -> 1M to 5M. */
function range(raw: string): { lo: number; hi: number } | null {
  const t = raw.trim().toLowerCase().replace(/[–—−]/g, "-").replace(/_/g, " ");
  // "1m_5m|5m_20m" (Crunchbase): every band it names, end to end.
  if (t.includes("|")) {
    const xs = t.split("|").map((p) => range(p)).filter((x): x is { lo: number; hi: number } => !!x);
    return xs.length ? { lo: Math.min(...xs.map((x) => x.lo)), hi: Math.max(...xs.map((x) => x.hi)) } : null;
  }
  const toks = [...t.matchAll(/(\d+(?:[.,]\d+)*)\s*(k|thousand|mm|mil|million|m|bn|billion|b)?(?![a-z])/g)].map((m) => ({
    n: Number(m[1].replace(/,(?=\d{3}\b)/g, "").replace(",", ".")),
    u: m[2] ? UNIT[m[2]] : 0,
  }));
  if (!toks.length || toks.some((x) => !Number.isFinite(x.n))) return null;
  // A number with no unit takes the next one's ("1-5M" is 1M to 5M).
  for (let i = toks.length - 2; i >= 0; i--) if (!toks[i].u) toks[i].u = toks[i + 1].u;
  const nums = toks.map((x) => x.n * (x.u || 1));
  if (/^(<|under|less than|below|up to)/.test(t)) return { lo: 0, hi: nums[0] };
  if (nums.length === 1 && /\+|plus|over|more than|above|>/.test(t)) return { lo: nums[0], hi: Infinity };
  return nums.length >= 2 ? { lo: Math.min(nums[0], nums[1]), hi: Math.max(nums[0], nums[1]) } : { lo: nums[0], hi: nums[0] };
}
/** The middle of a range, geometric (a band of 1 to 100 is about 10), or its one end when the other is open. */
function middle(r: { lo: number; hi: number }): number {
  if (r.hi === Infinity) return r.lo;
  if (r.lo <= 0) return r.hi / 2;
  return Math.sqrt(r.lo * r.hi);
}

/** Employees as one of RN_EMPLOYEES: "75", "51-200", "1001-5000", "11_50", "10,001+", or null. */
export function employeeBand(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (RN_EMPLOYEES.includes(text)) return text;
  if (/^(self employed|self-employed|myself|just me|solo)$/i.test(text)) return "1–10";
  if (/[$€£]/.test(text)) return null;
  const r = range(text);
  if (!r) return null;
  const n = r.hi === Infinity ? r.lo : r.lo >= 1 && r.hi >= 1 && r.lo !== r.hi ? middle(r) : r.hi;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 10) return "1–10";
  if (n <= 50) return "11–50";
  if (n <= 200) return "51–200";
  if (n <= 500) return "201–500";
  if (n <= 1000) return "501–1,000";
  return "1,001+";
}

/** Yearly revenue as one of RN_REVENUE: "$12M", "< $1M", "$1M-$5M", "0-500K", "1m_5m", "50m_plus", "Pre-revenue", or null. */
export function revenueBand(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (RN_REVENUE.includes(text)) return text;
  if (/^(pre[\s_-]?revenue|no revenue|\$?0)$/i.test(text)) return "Pre-revenue";
  // A bare number is dollars; "1m", "$5M" carry their own unit.
  const r = range(text);
  if (!r) return null;
  const n = r.hi === Infinity ? r.lo : middle(r);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return "Pre-revenue";
  if (n < 1e6) return "Under $1M";
  if (n < 5e6) return "$1M–$5M";
  if (n < 20e6) return "$5M–$20M";
  if (n < 50e6) return "$20M–$50M";
  return "$50M+";
}

/** A value of a standard list field (industry, employees, revenue) as its standard value, or null. Any other field: as it was. */
export function toStandard(field: string, raw: unknown, context = "", legacy = false): string | null {
  if (field === "industry") return industryOf(raw, context, legacy);
  if (field === "employees") return employeeBand(raw);
  if (field === "revenue") return revenueBand(raw);
  const v = String(raw ?? "").trim();
  return v || null;
}
/** The fields with a standard list. */
export const STANDARD_FIELDS = new Set(["industry", "employees", "revenue"]);
