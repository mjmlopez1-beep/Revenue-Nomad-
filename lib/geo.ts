/**
 * Free-text HQ ("Austin, TX", "San Francisco, California", "London, United Kingdom") read as a
 * country and a region, so members can filter by place however the HQ was typed. Shared by
 * server and client (no Node imports). The typed text stays the HQ shown; this only reads it.
 *
 *   normalizeHq("Austin, TX")              -> { country: "United States", region: "Texas" }
 *   normalizeHq("Toronto, Canada")         -> { country: "Canada", region: "Ontario" }
 *   normalizeHq("London, United Kingdom")  -> { country: "United Kingdom", region: "England" }
 *   normalizeHq("Work from Anywhere")      -> { country: null, region: null }
 *
 * How a value is read: the parts between commas, right to left. A part that names a country
 * sets the country. A later part that names a region (a US state by name or two letters, a
 * Canadian province, an Australian state, a UK nation or county, a German Land and so on) sets
 * the region, and its country when none was named. The first part is read as a city, unless it
 * is the only part. A known city fills what is still missing, when it agrees with the rest
 * ("Dublin, Ohio" stays in Ohio, "Vancouver, Washington" in Washington).
 */

export interface Geo {
  country: string | null;
  region: string | null;
}

/** Text as a lookup key: no accents, case, periods or extra spaces ("U.S." -> "us", "Zürich" -> "zurich"). */
export const geoKey = (raw: string) =>
  String(raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ş/g, "s")
    .toLowerCase()
    .replace(/[.'’®]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* ---------- countries ---------- */

/** Country -> other ways it is written (its own name is always one). */
const COUNTRY_ALIASES: Record<string, string[]> = {
  "United States": ["us", "usa", "u s a", "united states of america", "america", "the united states", "the us", "the usa", "estados unidos"],
  "United Kingdom": ["uk", "u k", "gb", "great britain", "britain", "the uk", "the united kingdom"],
  Canada: [],
  Australia: ["aus"],
  "New Zealand": ["nz"],
  Ireland: ["republic of ireland", "eire"],
  Germany: ["deutschland"],
  France: [],
  Spain: ["espana"],
  Italy: ["italia"],
  Netherlands: ["the netherlands", "holland", "nederland"],
  Belgium: ["belgique", "belgie"],
  Switzerland: ["schweiz", "suisse", "svizzera"],
  Austria: ["osterreich"],
  Sweden: ["sverige"],
  Norway: ["norge"],
  Denmark: ["danmark"],
  Finland: ["suomi"],
  Iceland: [],
  Portugal: [],
  Poland: ["polska"],
  "Czech Republic": ["czechia"],
  Romania: [],
  Hungary: [],
  Greece: [],
  Bulgaria: [],
  Croatia: [],
  Serbia: [],
  Slovakia: [],
  Slovenia: [],
  Estonia: [],
  Latvia: [],
  Lithuania: [],
  Ukraine: [],
  Luxembourg: [],
  Malta: [],
  Cyprus: [],
  Gibraltar: [],
  Monaco: [],
  Liechtenstein: [],
  "Isle of Man": [],
  Jersey: [],
  Guernsey: [],
  Turkey: ["turkiye"],
  Israel: [],
  "United Arab Emirates": ["uae", "u a e", "emirates"],
  "Saudi Arabia": ["ksa"],
  Qatar: [],
  Kuwait: [],
  Bahrain: [],
  Oman: [],
  Jordan: [],
  Lebanon: [],
  Egypt: [],
  Morocco: [],
  "South Africa": ["rsa"],
  Nigeria: [],
  Kenya: [],
  Ghana: [],
  Ethiopia: [],
  Rwanda: [],
  Uganda: [],
  Tanzania: [],
  Mauritius: [],
  India: [],
  Pakistan: [],
  Bangladesh: [],
  "Sri Lanka": [],
  Nepal: [],
  Singapore: [],
  Malaysia: [],
  Indonesia: [],
  Philippines: ["the philippines"],
  Thailand: [],
  Vietnam: ["viet nam"],
  Cambodia: [],
  Japan: [],
  "South Korea": ["korea", "republic of korea", "korea republic of"],
  China: ["prc", "peoples republic of china"],
  "Hong Kong": ["hong kong sar", "hk"],
  Taiwan: [],
  Kazakhstan: [],
  Armenia: [],
  Russia: ["russian federation"],
  Mexico: [],
  Brazil: ["brasil"],
  Argentina: [],
  Chile: [],
  Colombia: [],
  Peru: [],
  Uruguay: [],
  Paraguay: [],
  Bolivia: [],
  Ecuador: [],
  Venezuela: [],
  "Costa Rica": [],
  Panama: [],
  Guatemala: [],
  "Dominican Republic": [],
  Jamaica: [],
  Bahamas: ["the bahamas"],
  Bermuda: [],
  "Cayman Islands": [],
  "Puerto Rico": [],
};

/**
 * Countries for a filter or a pick list, the most common on Merlin first (by companies
 * with an HQ on file, November 2026), then the rest by name.
 */
export const COUNTRIES_FIRST: string[] = (() => {
  const top = [
    "United States", "United Kingdom", "Canada", "Germany", "Spain", "Ireland", "Switzerland", "India", "France", "Australia",
    "Singapore", "Romania", "Japan", "Malaysia", "Denmark", "Sweden", "Israel", "Mexico", "Netherlands", "New Zealand",
  ];
  return [...top, ...Object.keys(COUNTRY_ALIASES).filter((c) => !top.includes(c)).sort((a, b) => a.localeCompare(b))];
})();

const COUNTRY_BY_KEY = new Map<string, string>();
for (const [name, aliases] of Object.entries(COUNTRY_ALIASES)) for (const a of [name, ...aliases]) COUNTRY_BY_KEY.set(geoKey(a), name);

/* ---------- regions ---------- */

type RegionDef = [name: string, ...aliases: string[]];
const US_STATES: RegionDef[] = [
  ["Alabama", "al", "ala"], ["Alaska", "ak"], ["Arizona", "az", "ariz"], ["Arkansas", "ar", "ark"], ["California", "ca", "calif", "cal"],
  ["Colorado", "co", "colo"], ["Connecticut", "ct", "conn"], ["Delaware", "de", "del"], ["Florida", "fl", "fla"], ["Georgia", "ga"],
  ["Hawaii", "hi"], ["Idaho", "id"], ["Illinois", "il", "ill"], ["Indiana", "in", "ind"], ["Iowa", "ia"], ["Kansas", "ks", "kan"],
  ["Kentucky", "ky"], ["Louisiana", "la"], ["Maine", "me"], ["Maryland", "md"], ["Massachusetts", "ma", "mass"], ["Michigan", "mi", "mich"],
  ["Minnesota", "mn", "minn"], ["Mississippi", "ms", "miss"], ["Missouri", "mo"], ["Montana", "mt", "mont"], ["Nebraska", "ne", "neb"],
  ["Nevada", "nv", "nev"], ["New Hampshire", "nh"], ["New Jersey", "nj"], ["New Mexico", "nm"], ["New York", "ny", "nys", "new york state"],
  ["North Carolina", "nc"], ["North Dakota", "nd"], ["Ohio", "oh"], ["Oklahoma", "ok", "okla"], ["Oregon", "or", "ore"],
  ["Pennsylvania", "pa", "penn"], ["Rhode Island", "ri"], ["South Carolina", "sc"], ["South Dakota", "sd"], ["Tennessee", "tn", "tenn"],
  ["Texas", "tx", "tex"], ["Utah", "ut"], ["Vermont", "vt"], ["Virginia", "va"], ["Washington", "wa", "wash", "washington state"],
  ["West Virginia", "wv"], ["Wisconsin", "wi", "wis"], ["Wyoming", "wy"], ["District of Columbia", "dc", "d c", "washington dc", "washington d c"],
];
/** Region tables by country. Aliases are written the way geoKey writes them. */
const REGION_TABLE: Record<string, RegionDef[]> = {
  "United States": US_STATES,
  Canada: [
    ["Ontario", "on", "ont"], ["Quebec", "qc", "pq", "que"], ["British Columbia", "bc", "b c"], ["Alberta", "ab", "alta"], ["Manitoba", "mb", "man"],
    ["Saskatchewan", "sk", "sask"], ["Nova Scotia", "ns"], ["New Brunswick", "nb"], ["Newfoundland and Labrador", "nl", "nf", "newfoundland"],
    ["Prince Edward Island", "pe", "pei"], ["Yukon", "yt"], ["Northwest Territories", "nt", "nwt"], ["Nunavut", "nu"],
  ],
  Australia: [
    ["New South Wales", "nsw"], ["Victoria", "vic"], ["Queensland", "qld"], ["Western Australia", "wa"], ["South Australia", "sa"],
    ["Tasmania", "tas"], ["Australian Capital Territory", "act"], ["Northern Territory", "nt"],
  ],
  "United Kingdom": [
    ["England", "greater london", "greater manchester", "west midlands", "berkshire", "tyne and wear", "surrey", "kent", "essex", "hampshire",
      "oxfordshire", "cambridgeshire", "hertfordshire", "middlesex", "lancashire", "merseyside", "west yorkshire", "south yorkshire",
      "north yorkshire", "yorkshire", "devon", "cornwall", "somerset", "dorset", "wiltshire", "gloucestershire", "buckinghamshire",
      "bedfordshire", "northamptonshire", "leicestershire", "nottinghamshire", "derbyshire", "staffordshire", "warwickshire", "cheshire",
      "cumbria", "norfolk", "suffolk", "east sussex", "west sussex", "sussex", "lincolnshire", "worcestershire", "herefordshire", "shropshire"],
    ["Scotland"], ["Wales"], ["Northern Ireland"],
  ],
  Ireland: [["County Dublin", "co dublin", "dublin county"], ["County Cork", "co cork"], ["County Galway", "co galway"], ["County Kildare", "co kildare"], ["County Limerick", "co limerick"]],
  Germany: [
    ["Bavaria", "bayern"], ["Baden-Württemberg", "baden wurttemberg", "baden wuerttemberg"], ["Berlin"], ["Hamburg"], ["Hesse", "hessen"],
    ["North Rhine-Westphalia", "nordrhein westfalen", "north rhine westphalia", "nrw"], ["Lower Saxony", "niedersachsen"], ["Saxony", "sachsen"],
    ["Rhineland-Palatinate", "rheinland pfalz"], ["Schleswig-Holstein", "schleswig holstein"], ["Bremen"], ["Brandenburg"],
  ],
  France: [
    ["Île-de-France", "ile de france"], ["Auvergne-Rhône-Alpes", "auvergne rhone alpes", "rhone", "rhone alpes"],
    ["Provence-Alpes-Côte d'Azur", "provence alpes cote d azur", "paca"], ["Occitanie", "occitania"], ["Nouvelle-Aquitaine", "nouvelle aquitaine"],
    ["Hauts-de-France", "hauts de france"], ["Brittany", "bretagne"], ["Grand Est"], ["Pays de la Loire"],
  ],
  Spain: [
    ["Catalonia", "catalunya", "cataluna", "barcelona province"], ["Community of Madrid", "comunidad de madrid"], ["Andalusia", "andalucia"],
    ["Valencian Community", "comunidad valenciana", "comunitat valenciana", "alicante"], ["Aragon", "huesca", "zaragoza", "teruel"], ["Basque Country", "pais vasco", "euskadi"],
  ],
  Netherlands: [["North Holland", "noord holland"], ["South Holland", "zuid holland"], ["Utrecht"], ["North Brabant", "noord brabant"]],
  Switzerland: [["Zurich", "canton of zurich", "zh"], ["Geneva", "canton of geneva", "geneve"], ["Vaud"], ["Basel-Stadt", "basel stadt"], ["Schaffhausen"], ["Zug"]],
  Sweden: [["Stockholm County", "stockholms lan"], ["Skåne", "skane", "skane county"], ["Västra Götaland", "vastra gotaland"]],
  Denmark: [["Capital Region of Denmark", "capital region", "hovedstaden"], ["Region of Southern Denmark", "southern denmark", "syddanmark"], ["Central Denmark Region", "central denmark"]],
  Finland: [["Uusimaa", "southern finland"], ["Pirkanmaa"]],
  Norway: [["Oslo"], ["Viken"]],
  Romania: [["Cluj", "cluj county"], ["Bucharest"], ["Timis"], ["Iasi"]],
  India: [
    ["Maharashtra"], ["Karnataka"], ["Tamil Nadu"], ["Telangana"], ["Delhi", "nct of delhi", "new delhi"], ["Uttar Pradesh", "up"], ["Gujarat"],
    ["Haryana"], ["West Bengal"], ["Kerala"], ["Rajasthan"],
  ],
  Mexico: [["State of Mexico", "estado de mexico", "edomex"], ["Mexico City", "ciudad de mexico", "cdmx"], ["Jalisco"], ["Nuevo León", "nuevo leon"]],
  Malaysia: [["Selangor"], ["Kuala Lumpur", "wilayah persekutuan kuala lumpur"], ["Penang", "pulau pinang"], ["Johor"]],
  "South Korea": [["Gyeonggi", "gyeonggi do"], ["Seoul"]],
  Japan: [["Tokyo"], ["Kanagawa"], ["Osaka"]],
  Brazil: [["São Paulo", "sao paulo", "sp"], ["Rio de Janeiro", "rj"], ["Minas Gerais", "mg"]],
  China: [["Beijing"], ["Shanghai"], ["Guangdong"]],
  "United Arab Emirates": [["Dubai"], ["Abu Dhabi"]],
  "New Zealand": [["Auckland"], ["Wellington"], ["Canterbury"]],
};

/** Every region of a country that the reader knows, in the order above (US states A to Z, then DC). */
export const REGIONS: Record<string, string[]> = Object.fromEntries(Object.entries(REGION_TABLE).map(([c, rs]) => [c, rs.map((r) => r[0])]));

type Place = { country: string; region: string | null };
/** Region key -> the places it can be ("wa" is Washington and Western Australia). US first. */
const REGION_BY_KEY = new Map<string, Place[]>();
for (const [country, regions] of Object.entries(REGION_TABLE))
  for (const [name, ...aliases] of regions)
    for (const a of [name, ...aliases]) {
      const k = geoKey(a);
      const list = REGION_BY_KEY.get(k) ?? [];
      if (!list.some((p) => p.country === country)) list.push({ country, region: name });
      REGION_BY_KEY.set(k, list);
    }

/* ---------- cities ---------- */

/** City -> country and region. Only well-known ones: they fill what an HQ leaves out ("Toronto, Canada", "London"). */
const CITY_LIST: [country: string, region: string | null, cities: string[]][] = [
  ["United States", "New York", ["new york", "new york city", "nyc", "manhattan", "brooklyn", "queens", "bronx", "buffalo", "rochester", "white plains", "armonk", "long island city"]],
  ["United States", "California", [
    "san francisco", "sf", "los angeles", "san diego", "san jose", "palo alto", "mountain view", "menlo park", "redwood city", "oakland", "berkeley",
    "santa monica", "irvine", "sacramento", "santa clara", "sunnyvale", "cupertino", "san mateo", "pasadena", "burlingame", "emeryville", "fremont",
    "pleasanton", "walnut creek", "foster city", "south san francisco", "venice", "culver city", "newport beach", "costa mesa", "santa barbara",
    "bay area", "san francisco bay area", "sf bay area", "silicon valley", "los gatos", "campbell", "san ramon", "carlsbad", "encinitas",
  ]],
  ["United States", "Illinois", ["chicago", "naperville", "evanston", "schaumburg"]],
  ["United States", "Massachusetts", ["boston", "waltham", "somerville", "woburn"]],
  ["United States", "Texas", ["austin", "dallas", "houston", "san antonio", "fort worth", "plano", "frisco", "round rock", "irving", "the woodlands"]],
  ["United States", "Washington", ["seattle", "bellevue", "redmond", "kirkland", "tacoma", "spokane"]],
  ["United States", "Colorado", ["denver", "boulder", "colorado springs", "fort collins"]],
  ["United States", "Georgia", ["atlanta", "alpharetta", "sandy springs"]],
  ["United States", "Florida", ["miami", "tampa", "orlando", "fort lauderdale", "jacksonville", "boca raton", "st petersburg", "west palm beach"]],
  ["United States", "Arizona", ["phoenix", "scottsdale", "tempe", "chandler", "tucson"]],
  ["United States", "Pennsylvania", ["philadelphia", "pittsburgh", "conshohocken"]],
  ["United States", "Minnesota", ["minneapolis", "st paul", "saint paul", "minnetonka", "eden prairie"]],
  ["United States", "Michigan", ["detroit", "ann arbor", "grand rapids"]],
  ["United States", "Tennessee", ["nashville", "memphis", "knoxville", "chattanooga"]],
  ["United States", "North Carolina", ["charlotte", "raleigh", "durham", "chapel hill", "cary"]],
  ["United States", "Oregon", ["portland", "beaverton", "eugene"]],
  ["United States", "Utah", ["salt lake city", "lehi", "provo", "south jordan", "draper"]],
  ["United States", "Nevada", ["las vegas", "reno", "henderson"]],
  ["United States", "District of Columbia", ["washington dc", "washington d c"]],
  ["United States", "Maryland", ["baltimore", "bethesda", "rockville"]],
  ["United States", "Missouri", ["st louis", "saint louis", "kansas city"]],
  ["United States", "Ohio", ["columbus", "cleveland", "cincinnati"]],
  ["United States", "Indiana", ["indianapolis"]],
  ["United States", "Wisconsin", ["milwaukee", "madison"]],
  ["United States", "Virginia", ["arlington", "reston", "richmond", "mclean", "alexandria"]],
  ["United States", "New Jersey", ["jersey city", "newark", "hoboken", "princeton", "new brunswick"]],
  ["United States", "Connecticut", ["stamford", "hartford", "new haven", "norwalk"]],
  ["United States", "Hawaii", ["honolulu"]],
  ["United Kingdom", "England", ["london", "manchester", "birmingham", "bristol", "leeds", "liverpool", "oxford", "cambridge", "newcastle", "newcastle upon tyne", "brighton", "reading", "sheffield", "nottingham", "southampton"]],
  ["United Kingdom", "Scotland", ["edinburgh", "glasgow", "aberdeen"]],
  ["United Kingdom", "Wales", ["cardiff", "swansea"]],
  ["United Kingdom", "Northern Ireland", ["belfast"]],
  ["Ireland", "County Dublin", ["dublin", "dublin 2", "dublin 4", "ballsbridge"]],
  ["Ireland", "County Cork", ["cork"]],
  ["Ireland", "County Galway", ["galway"]],
  ["Canada", "Ontario", ["toronto", "ottawa", "waterloo", "kitchener", "mississauga", "markham", "hamilton"]],
  ["Canada", "British Columbia", ["vancouver", "burnaby", "victoria"]],
  ["Canada", "Quebec", ["montreal", "quebec city"]],
  ["Canada", "Alberta", ["calgary", "edmonton"]],
  ["Canada", "Manitoba", ["winnipeg"]],
  ["Canada", "Nova Scotia", ["halifax"]],
  ["Australia", "New South Wales", ["sydney"]],
  ["Australia", "Victoria", ["melbourne"]],
  ["Australia", "Queensland", ["brisbane", "gold coast"]],
  ["Australia", "Western Australia", ["perth"]],
  ["Australia", "South Australia", ["adelaide"]],
  ["Australia", "Australian Capital Territory", ["canberra"]],
  ["New Zealand", "Auckland", ["auckland"]],
  ["New Zealand", "Wellington", ["wellington"]],
  ["Germany", "Berlin", ["berlin"]],
  ["Germany", "Bavaria", ["munich", "munchen", "nuremberg", "nurnberg", "aschaffenburg"]],
  ["Germany", "Hamburg", ["hamburg"]],
  ["Germany", "Hesse", ["frankfurt", "frankfurt am main"]],
  ["Germany", "North Rhine-Westphalia", ["cologne", "koln", "dusseldorf", "duesseldorf"]],
  ["Germany", "Baden-Württemberg", ["stuttgart", "karlsruhe", "ludwigsburg", "heidelberg"]],
  ["France", "Île-de-France", ["paris"]],
  ["France", "Auvergne-Rhône-Alpes", ["lyon"]],
  ["France", "Provence-Alpes-Côte d'Azur", ["marseille", "nice"]],
  ["Spain", "Community of Madrid", ["madrid"]],
  ["Spain", "Catalonia", ["barcelona"]],
  ["Spain", "Valencian Community", ["valencia"]],
  ["Portugal", null, ["lisbon", "lisboa", "porto"]],
  ["Netherlands", "North Holland", ["amsterdam"]],
  ["Netherlands", "South Holland", ["rotterdam", "the hague", "den haag"]],
  ["Netherlands", "Utrecht", ["utrecht"]],
  ["Belgium", null, ["brussels", "antwerp", "ghent"]],
  ["Switzerland", "Zurich", ["zurich"]],
  ["Switzerland", "Geneva", ["geneva", "geneve"]],
  ["Switzerland", "Basel-Stadt", ["basel"]],
  ["Switzerland", "Vaud", ["lausanne"]],
  ["Austria", null, ["vienna", "wien"]],
  ["Sweden", "Stockholm County", ["stockholm"]],
  ["Sweden", "Skåne", ["malmo"]],
  ["Sweden", "Västra Götaland", ["gothenburg", "goteborg"]],
  ["Norway", "Oslo", ["oslo"]],
  ["Denmark", "Capital Region of Denmark", ["copenhagen", "kobenhavn"]],
  ["Denmark", "Region of Southern Denmark", ["odense"]],
  ["Finland", "Uusimaa", ["helsinki", "espoo"]],
  ["Iceland", null, ["reykjavik"]],
  ["Poland", null, ["warsaw", "krakow", "wroclaw"]],
  ["Czech Republic", null, ["prague", "brno"]],
  ["Hungary", null, ["budapest"]],
  ["Romania", "Bucharest", ["bucharest", "bucuresti"]],
  ["Romania", "Cluj", ["cluj napoca"]],
  ["Greece", null, ["athens"]],
  ["Turkey", null, ["istanbul", "ankara"]],
  ["Israel", null, ["tel aviv", "tel aviv yafo", "jerusalem", "haifa", "herzliya"]],
  ["United Arab Emirates", "Dubai", ["dubai"]],
  ["United Arab Emirates", "Abu Dhabi", ["abu dhabi"]],
  ["Saudi Arabia", null, ["riyadh", "jeddah"]],
  ["Qatar", null, ["doha"]],
  ["Egypt", null, ["cairo"]],
  ["South Africa", null, ["cape town", "johannesburg", "durban"]],
  ["Nigeria", null, ["lagos", "abuja"]],
  ["Kenya", null, ["nairobi"]],
  ["Ghana", null, ["accra"]],
  ["India", "Maharashtra", ["mumbai", "pune"]],
  ["India", "Karnataka", ["bangalore", "bengaluru"]],
  ["India", "Delhi", ["delhi", "new delhi"]],
  ["India", "Haryana", ["gurgaon", "gurugram"]],
  ["India", "Uttar Pradesh", ["noida"]],
  ["India", "Telangana", ["hyderabad"]],
  ["India", "Tamil Nadu", ["chennai"]],
  ["India", "Gujarat", ["ahmedabad"]],
  ["India", "West Bengal", ["kolkata"]],
  ["Pakistan", null, ["karachi", "lahore", "islamabad"]],
  ["Singapore", null, ["singapore"]],
  ["Malaysia", "Kuala Lumpur", ["kuala lumpur"]],
  ["Malaysia", "Selangor", ["shah alam", "petaling jaya"]],
  ["Indonesia", null, ["jakarta"]],
  ["Philippines", null, ["manila", "makati"]],
  ["Thailand", null, ["bangkok"]],
  ["Vietnam", null, ["ho chi minh city", "hanoi"]],
  ["Japan", "Tokyo", ["tokyo"]],
  ["Japan", "Kanagawa", ["kawasaki", "yokohama"]],
  ["Japan", "Osaka", ["osaka"]],
  ["South Korea", "Seoul", ["seoul"]],
  ["South Korea", "Gyeonggi", ["suwon", "suwon si", "seongnam"]],
  ["China", "Beijing", ["beijing"]],
  ["China", "Shanghai", ["shanghai"]],
  ["China", "Guangdong", ["shenzhen", "guangzhou"]],
  ["Hong Kong", null, ["hong kong"]],
  ["Taiwan", null, ["taipei"]],
  ["Mexico", "Mexico City", ["mexico city", "ciudad de mexico", "cdmx"]],
  ["Mexico", "Jalisco", ["guadalajara"]],
  ["Mexico", "Nuevo León", ["monterrey"]],
  ["Brazil", "São Paulo", ["sao paulo"]],
  ["Brazil", "Rio de Janeiro", ["rio de janeiro"]],
  ["Argentina", null, ["buenos aires"]],
  ["Chile", null, ["santiago"]],
  ["Colombia", null, ["bogota", "medellin"]],
  ["Peru", null, ["lima"]],
  ["Uruguay", null, ["montevideo"]],
  ["Luxembourg", null, ["luxembourg"]],
  ["Estonia", null, ["tallinn"]],
  ["Latvia", null, ["riga"]],
  ["Lithuania", null, ["vilnius"]],
  ["Ukraine", null, ["kyiv", "kiev", "lviv"]],
  ["Bulgaria", null, ["sofia"]],
  ["Croatia", null, ["zagreb"]],
  ["Serbia", null, ["belgrade"]],
  ["Slovenia", null, ["ljubljana"]],
  ["Slovakia", null, ["bratislava"]],
  ["Malta", null, ["valletta"]],
  ["Cyprus", null, ["nicosia", "limassol"]],
];
const CITY_BY_KEY = new Map<string, Place>();
for (const [country, region, cities] of CITY_LIST) for (const c of cities) if (!CITY_BY_KEY.has(geoKey(c))) CITY_BY_KEY.set(geoKey(c), { country, region });

/** HQ parts that say where nobody is: "Remote", "Worldwide", "Global". */
const NOWHERE = /^(remote|fully remote|remote first|remote first company|work from anywhere|anywhere|worldwide|global|distributed|online|virtual|n a|na|none|tbd|earth)$/;

/** A region for one part: in `country` when it is known, else the first place it can be (US first). */
function regionOf(key: string, country: string | null): Place | null {
  const list = REGION_BY_KEY.get(key);
  if (!list) return null;
  if (country) return list.find((p) => p.country === country) ?? null;
  return list[0];
}

/** A city for one part: the part, or the part before a slash ("Bay Area/Global"), or a district's city ("Sector 2, Bucharest" reads Bucharest). */
function cityOf(key: string): Place | null {
  return CITY_BY_KEY.get(key) ?? CITY_BY_KEY.get(key.split(" ").slice(0, -1).join(" ")) ?? null;
}

/**
 * The country and region an HQ names, or nulls. Never throws, whatever it is given.
 */
export function normalizeHq(hq: unknown): Geo {
  const text = typeof hq === "string" ? hq : "";
  if (!text.trim()) return { country: null, region: null };
  // "Bay Area/Global" reads as its first half; "Austin - TX" and "Austin | TX" as "Austin, TX".
  const parts = text
    .split(/,|\s[-–|]\s|\|/)
    .map((p) => geoKey(p.split("/")[0]))
    .filter((p) => p && !NOWHERE.test(p));
  if (!parts.length) return { country: null, region: null };

  let country: string | null = null;
  let countryAt = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = COUNTRY_BY_KEY.get(parts[i]);
    if (c) {
      country = c;
      countryAt = i;
      break;
    }
  }
  let region: string | null = null;
  // The first part is a city when there is more than one part ("New York, NY" is a city and a state).
  for (let i = parts.length - 1; i >= 0; i--) {
    if (i === countryAt || (i === 0 && parts.length > 1)) continue;
    let r = regionOf(parts[i], country);
    // "Perth, WA" is Western Australia, "Seattle, WA" Washington: a known city decides between places that share a code.
    const shared = !country ? REGION_BY_KEY.get(parts[i]) : undefined;
    if (shared && shared.length > 1) {
      const city = cityOf(parts[0]);
      r = (city && shared.find((p) => p.country === city.country)) || r;
    }
    if (r) {
      country ??= r.country;
      region = r.region;
      break;
    }
  }
  // "Singapore, Singapore", "London, London": the city fills the region (and the country) still missing.
  if (!region) {
    for (let i = 0; i < parts.length; i++) {
      if (i === countryAt && parts.length > 1) continue;
      const c = cityOf(parts[i]);
      if (!c) continue;
      if (country && c.country !== country) continue;
      country ??= c.country;
      region = c.region;
      break;
    }
  }
  // One part only and still nothing: a region name ("California") that the city reading passed over.
  if (!country && parts.length === 1) {
    const r = regionOf(parts[0], null);
    if (r) return { country: r.country, region: r.region };
  }
  return { country, region };
}

/** Whether an HQ is in a place a member asked for: a country, a region, or both ("Texas", "United Kingdom"). */
export function inPlace(geo: Geo, want: { country?: string | null; region?: string | null }): boolean {
  if (want.country && geo.country !== want.country) return false;
  if (want.region && geo.region !== want.region) return false;
  return !!(want.country || want.region);
}

/**
 * A place typed as a filter ("Texas", "UK", "Ontario, Canada") as a country and region, when it
 * names only a country or a region (no city). Null for anything else ("Austin, TX" is a city:
 * match it by its words instead).
 */
export function placeFilter(raw: unknown): Geo | null {
  const text = typeof raw === "string" ? raw : "";
  const parts = text.split(",").map((p) => geoKey(p)).filter(Boolean);
  if (!parts.length || parts.length > 2) return null;
  let country: string | null = null;
  let region: string | null = null;
  for (const p of [...parts].reverse()) {
    const c = COUNTRY_BY_KEY.get(p);
    if (c && !country) {
      country = c;
      continue;
    }
    const r = regionOf(p, country);
    if (r && !region) {
      country ??= r.country;
      region = r.region;
      continue;
    }
    return null;
  }
  return country || region ? { country, region } : null;
}
