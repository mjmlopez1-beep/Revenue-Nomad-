#!/usr/bin/env python3
"""Build the private seed for The Table from everything Revenue Nomad knows.

Usage:
  python3 scripts/build-intel-seed.py <Talent_Signups.csv> <engagements.csv>
      [--demand scan.csv ...] [--domains domains.json] [--out dir]

Writes (both git-ignored -- they contain member data, never commit them):
  <out>/intel-seed.json         members (for sign-in), companies, engagements, contacts
  <out>/intel-member-links.csv  one private sign-in link per member

Every record on The Table is an engagement at a company, tagged with where it
came from (the Source column):

  Published engagement   one per engagement published in the admin portal
                         (repeat submissions of the same company + operator
                         merge). Operator goes in the gated Fractional field;
                         buyer-corroborated ones are marked verified.
                         Engagements the operator anonymised are skipped.
  Member success story   one per company named in a member's signup success
                         story. The member goes in Fractional and their own
                         words go in Outcome (both gated). Stories that don't
                         name a company are skipped.
  Demand scan            (--demand) one "Open role" per scanned posting, with
                         the posting link, and the decision maker as a contact
                         "Hiring for the seat".

--domains takes verified company websites, {"Company name": "domain.com"}
(e.g. a Clay lookup); it only fills companies that have no website yet.

out defaults to ./data. Re-running keeps existing member tokens so links
already sent keep working, and keeps the Rate Index points (rateIndex, added by
scripts/add-rate-index.mjs) so rate benchmarks survive a rebuild.
"""
import argparse, csv, json, os, re, secrets
from datetime import datetime, timezone

ap = argparse.ArgumentParser(usage=__doc__)
ap.add_argument("signups")
ap.add_argument("engagements")
ap.add_argument("out_legacy", nargs="?", help=argparse.SUPPRESS)
ap.add_argument("--demand", action="append", default=[], help="demand-scan CSV export (repeatable)")
ap.add_argument("--domains", default=None, help='JSON {"Company name": "domain.com"} of verified websites')
ap.add_argument("--stories", default=None, help="dir of story extraction JSON files (company, role, function, type, years per story)")
ap.add_argument("--clay", action="append", default=[], help="dir of Clay enrichment JSON files (domain, firmographics, decision makers per company)")
ap.add_argument("--out", default=None)
args = ap.parse_args()
OUT = args.out or args.out_legacy or os.path.join(os.getcwd(), "data")
os.makedirs(OUT, exist_ok=True)
SEED_PATH = os.path.join(OUT, "intel-seed.json")

# ---------- company-name extraction from free-text success stories ----------

JUNK = re.compile(
    r"^(a|an|the|my|our|one|client|clients|company|companies|confidential|"
    r"confidential client|startup|series|during|while|when|i|we|led|built|"
    r"scaled|grew|increased|developed|created|launched|helped|working|worked|"
    r"as|in|at|for|with|from|after|over|under|first|global|us|uk|leading|"
    r"stealth|undisclosed|private|fortune|multiple|several|various|n/?a|none)\b",
    re.I,
)
GENERIC = re.compile(
    r"(\b(company|firm|startup|agency|provider|business|industry|sector|vendor|client|customer|program)\s*$)|"
    r"^conducted\b|^\d+\s*[mbk]\b|"
    r"^(construction|fin|retail|supported|large|mid|seed|major)\s*tech\b|"
    r"\b(company|start)\b.*\b(multi|savills)\b|\ba vc start\b|^supported\b", re.I)
VERB = re.compile(
    r"\b(architected|executed|built|led|grew|scaled|increased|developed|created|"
    r"launched|helped|managed|drove|closed|achieved|delivered|generated|hired|"
    r"implemented|designed|established|transformed|complete|responsible)\b", re.I)
SUFFIX = re.compile(r"[,\s]+(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|sa|ag|bv)\.?$", re.I)


def clean_company(raw):
    if not raw:
        return None
    s = re.sub(r"^[^\w$]+", "", raw.strip()).strip()
    s = re.sub(r"\s+", " ", s)
    s = re.split(r"\s+(?:in|since|from)\s+(?:19|20)\d\d\b|\s+\$|\s+(?:19|20)\d\d\b|\s+<>\s+", s)[0]
    s = re.sub(r"^(?:vp|svp|evp|head|director|cro|cmo|ceo|coo)\b[\w ]*?\s+(?:at\s+)?(?=[A-Z])", "", s)
    s = s.split(", ")[0]
    s = SUFFIX.sub("", s).strip(" ,.")
    if VERB.search(s) or GENERIC.search(s):
        return None
    if len(s) < 2 or len(s) > 40 or len(s.split()) > 5:
        return None
    if JUNK.match(s) or not re.search(r"[A-Za-z]", s):
        return None
    if s[0].islower() and "." not in s:  # sentence fragment, not a name (allow "thimble.io")
        return None
    return s


def company_from_story(story):
    s = story.strip()
    if not s:
        return None
    # "During my time at X," / "At X, I ..." / "While at X"
    m = re.match(r"^(?:during my time at|while at|at|with|for)\s+([A-Z0-9][\w.&' ]{1,38}?)(?:,|\s+(?:I|we|as|my|our|the|-|–)\b)", s, re.I)
    if m:
        return clean_company(m.group(1))
    # "X - did ..." / "X: did ..." / "X | ..." / "X (Series B) ..."
    m = re.match(r"^([^\-–—:|(\n]{2,45}?)\s*(?:[\-–—:|(]|\s—)", s)
    if m:
        return clean_company(m.group(1))
    return None


def key_for(name):
    k = name.lower()
    k = re.sub(r"^the\s+", "", k)
    k = re.sub(r"\.(com|io|ai|co)$", "", k)
    return re.sub(r"[^a-z0-9]+", "", k)


def clip(text, n=280):
    text = re.sub(r"\s+", " ", (text or "").strip())
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


# ---------- members ----------

old = {}
old_rate_index = None  # Rate Index points added by scripts/add-rate-index.mjs, carried over on a rebuild
if os.path.exists(SEED_PATH):
    try:
        prev = json.load(open(SEED_PATH))
        if isinstance(prev.get("rateIndex"), list) and prev["rateIndex"]:
            old_rate_index = prev["rateIndex"]
        for m in prev["members"]:
            old[m["email"] or m["name"].lower()] = m["token"]
    except Exception:
        pass

members, by_key, by_name = [], {}, {}


def add_member(first, last, email, title=""):
    email = (email or "").strip().lower()
    name = f"{first.strip()} {last.strip()}".strip()
    k = email or name.lower()
    if k in by_key:
        return by_key[k]
    m = {"id": f"m{len(members) + 1:04d}", "name": name, "email": email,
         "title": title.strip() or "Operator", "token": old.get(k) or secrets.token_urlsafe(12)}
    members.append(m)
    by_key[k] = m
    by_name[name.lower()] = m
    return m


companies, engagements, contacts = {}, {}, []

# Rows filed under a project or a street address instead of the client company. Each key
# (key_for of the Company value) maps to the real client company's name when the source row
# names one, or to None to drop the engagement. None of these rows names its client.
NOT_COMPANIES = {
    "301wosborn": None,  # an office-to-residential conversion for a broker
    "trianglegrandavenue": None,  # a creative-district plan for a group of brokers
    "greensburgkansasrebuild": None,  # a town's rebuild program
}
not_companies_dropped = 0


def client_company(name):
    """The company an engagement attaches to: the name, the client named instead of a project or address, or None (drop it)."""
    return NOT_COMPANIES.get(key_for(name), name)


def company(name):
    ck = key_for(name)
    return companies.setdefault(ck, {"id": f"c_{ck[:40]}", "fields": {"name": name}}), ck


# Register every signup first so engagement operators match their signup (not a duplicate).
with open(args.signups, encoding="utf-8-sig") as f:
    signup_rows = list(csv.DictReader(f))
for r in signup_rows:
    add_member(r.get("TF: First Name", ""), r.get("TF:Last Name", ""), r.get("Email", ""), r.get("Title", ""))

# ---------- 1. published engagements (admin portal export) ----------
# Two export shapes are understood:
#  - full export (revenue_nomad_engagements_*.csv): Company, Role Held, Engagement Type,
#    Company Revenue Band, Start/End Date, Currently Active, Outcomes, Published,
#    Company Anonymous, Verification Status. Rows without a Company are success stories
#    (handled from the signups file below).
#  - older admin list (Engagement, Operator, Verification, Published).
# Only published engagements are used, and an engagement the operator marked
# "Company Anonymous" is never shown -- nor is that operator's success story about it.

REVENUE = {"pre_revenue": "Pre-revenue", "under_1m": "Under $1M", "1m_5m": "$1M–$5M",
           "5m_20m": "$5M–$20M", "20m_50m": "$20M–$50M", "50m_plus": "$50M+"}
ENG_TYPE = {"fractional": "Fractional", "fractional_gtm": "Fractional", "interim": "Interim",
            "advisory": "Advisory", "project": "Project"}
month = lambda d: d[:7] if re.match(r"^\d{4}-\d{2}", d or "") else None

published = skipped_anon = skipped_unpub = 0
anonymous_pairs = set()  # (company key, operator name key)
with open(args.engagements, encoding="utf-8-sig") as f:
    eng_rows = list(csv.DictReader(f))
full = bool(eng_rows) and "Company Anonymous" in eng_rows[0]
# If an operator marked a company anonymous on ANY of their rows, keep the whole pair anonymous.
if full:
    for r in eng_rows:
        if (r.get("Company") or "").strip() and r.get("Company Anonymous", "").upper() == "Y":
            anonymous_pairs.add((key_for(r["Company"]), key_for(r.get("Operator") or "")))
for r in eng_rows:
    name = re.sub(r"\s+", " ", (r.get("Company") if full else r.get("Engagement")) or "").strip()
    if not name:
        continue  # full export: a success-story row
    op = (r.get("Operator") or "").strip()
    if full and (key_for(name), key_for(op)) in anonymous_pairs:
        skipped_anon += 1
        continue
    if (r.get("Published") or "").strip().lower() not in ("true", "y", "yes"):
        skipped_unpub += 1
        continue
    if re.match(r"^(a|an)\s", name, re.I) or len(name.split()) > 5 or GENERIC.search(name):
        anonymous_pairs.add((key_for(name), key_for(op)))
        skipped_anon += 1  # described rather than named: treat as anonymous
        continue
    name = client_company(name)
    if not name:
        not_companies_dropped += 1
        continue
    published += 1
    if op.lower() not in by_name:
        first, _, last = op.partition(" ")
        add_member(first, last, (r.get("Operator Email") or "") if full else "")
    co, ck = company(name)
    role = (r.get("Role Held") or "").strip() if full else ""
    ek = f"{ck}_{key_for(op)}" + (f"_{key_for(role)[:16]}" if role else "")
    e = engagements.get(ek)
    if not e:
        fields = {"source": "Published engagement", "operator": op}
        if full:
            if role:
                fields["role"] = role[:200]
            t = ENG_TYPE.get((r.get("Engagement Type") or "").strip().lower())
            if t:
                fields["type"] = t
            rev = REVENUE.get((r.get("Company Revenue Band") or "").strip())
            if rev:
                fields["revenue"] = rev
            if month(r.get("Start Date")):
                fields["start"] = month(r.get("Start Date"))
            active = (r.get("Currently Active") or "").upper() == "Y"
            if active:
                fields["end"], fields["status"] = "Ongoing", "Active"
            else:
                fields["status"] = "Ended"
                if month(r.get("End Date")):
                    fields["end"] = month(r.get("End Date"))
        e = engagements[ek] = {"id": f"e_{ek[:56]}", "companyId": co["id"], "fields": fields, "verified": False}
    if (r.get("Verification") or r.get("Verification Status")) == "buyer_corroborated":
        e["verified"] = True

# ---------- 2. member success stories (talent signups) ----------

stories = story_records = 0
extracted = {}
if args.stories:
    import glob
    for fp in sorted(glob.glob(os.path.join(args.stories, "*.json"))):
        for x in json.load(open(fp)):
            extracted[x["sid"]] = x
STORY_TYPES = {"Fractional", "Interim", "Advisory", "Project", "Full-time"}
FUNCS = {"Sales", "Marketing", "RevOps", "Customer Success", "Partnerships", "Growth", "Product Marketing", "Enablement", "Executive", "Other"}
for r in signup_rows:
    m = add_member(r.get("TF: First Name", ""), r.get("TF:Last Name", ""), r.get("Email", ""), r.get("Title", ""))
    for i, col in enumerate(("Success Story #1", "Success Story #2", "Success Story #3"), 1):
        text = (r.get(col) or "").strip()
        if not text:
            continue
        stories += 1
        sid = f"{(r.get('Email') or m['name']).strip().lower()}#{i}"
        x = extracted.get(sid) if args.stories else None
        if args.stories:
            name = SUFFIX.sub("", (x or {}).get("company") or "").strip(" ,.") or None
            if name and (len(name) > 60 or JUNK.match(name) and len(name.split()) > 1):
                name = None
        else:
            name = company_from_story(text)
        if not name:
            continue
        if (key_for(name), key_for(m["name"])) in anonymous_pairs:
            continue  # the operator kept this company anonymous on their engagement
        name = client_company(name)
        if not name:
            not_companies_dropped += 1
            continue
        co, ck = company(name)
        ek = f"{ck}_{key_for(m['name'])}"
        fields = {"source": "Member success story", "operator": m["name"]}
        if x:
            if x.get("role"):
                fields["role"] = str(x["role"])[:120]
            if x.get("function") in FUNCS:
                fields["function"] = x["function"]
            if x.get("type") in STORY_TYPES:
                fields["type"] = x["type"]
            sy, ey = x.get("startYear"), x.get("endYear")
            if isinstance(sy, int) and 1970 < sy <= datetime.now().year:
                fields["start"] = str(sy)
            if isinstance(ey, int) and 1970 < ey <= datetime.now().year and (not isinstance(sy, int) or ey >= sy):
                fields["end"] = str(ey)
                fields["status"] = "Ended" if ey < datetime.now().year else fields.get("status", "Ended")
        if ek in engagements:  # two stories about the same company: fill gaps
            for k, v in fields.items():
                engagements[ek]["fields"].setdefault(k, v)
            continue
        engagements[ek] = {"id": f"e_{ek[:56]}", "companyId": co["id"], "verified": False, "fields": fields}
        story_records += 1

# ---------- 3. demand scans (open fractional roles) ----------

PLACEHOLDER = re.compile(r"not found|not returned|no decision maker|obfuscat|apollo", re.I)


def clean_cell(v):
    v = re.sub(r"\s*\(.*?\)\s*", " ", (v or "")).strip()
    return "" if not v or PLACEHOLDER.search(v) else v


demand_rows = 0
for path in args.demand:
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            name = (r.get("Company") or "").strip()
            if not name:
                continue
            demand_rows += 1
            name = client_company(name)
            if not name:
                not_companies_dropped += 1
                continue
            co, ck = company(name)
            domain = (r.get("Company Domain") or "").strip().lower()
            if domain and "website" not in co["fields"]:
                co["fields"]["website"] = domain
            hq = re.search(r"\bHQ\s+([^)]+)", r.get("Location") or "")  # role location is not HQ
            if hq and "hq" not in co["fields"]:
                co["fields"]["hq"] = hq.group(1).strip()
            role = (r.get("Role Title") or "").strip()
            ek = f"{ck}_open_{key_for(role)[:24]}"
            if ek in engagements:
                continue
            fields = {"source": "Demand scan", "status": "Open role"}
            if role:
                fields["role"] = role[:200]
            link = (r.get("Source Link") or "").strip()
            if link:
                fields["posting"] = re.sub(r"^https?://", "", link).rstrip("/")[:200]
            engagements[ek] = {"id": f"e_{ek[:56]}", "companyId": co["id"], "fields": fields, "verified": False}
            dm = clean_cell(r.get("Decision Maker"))
            if dm:
                c = {"name": dm, "relationship": "Hiring for the seat"}
                title = clean_cell(r.get("DM Title"))
                if title:
                    c["title"] = title
                li = clean_cell(r.get("DM LinkedIn"))
                if li and "linkedin.com" in li:
                    c["linkedin"] = re.sub(r"^https?://", "", li).rstrip("/")
                contacts.append({"id": f"p_{ck[:30]}_{key_for(dm)[:20]}", "companyId": co["id"], "engagementId": f"e_{ek[:56]}", "source": "Demand scan", "fields": c})

# ---------- rule: no redundant records ----------
# A company is a single record (companies are keyed by name, so it is never listed twice).
# Under it, one engagement per person: when the same operator appears more than once at a
# company (e.g. a published engagement and their own success story), keep the record with
# the most data, fill its gaps from the others, and move their people onto it. Different
# people's engagements at the same company are kept; the table groups them under the company.
RANK = {"Published engagement": 0, "Demand scan": 1, "Member success story": 2}


def merge_same_operator():
    removed = 0
    groups = {}
    for e in engagements.values():
        op = key_for(e["fields"].get("operator") or "") or e["id"]  # no operator (open roles): never merged
        groups.setdefault((e["companyId"], op), []).append(e)
    for group in groups.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda e: (-len(e["fields"]), RANK.get(e["fields"].get("source"), 9), not e["verified"]))
        keep, drop = group[0], group[1:]
        for d in drop:
            for k, v in d["fields"].items():
                if k != "source":
                    keep["fields"].setdefault(k, v)
            keep["verified"] = keep["verified"] or d["verified"]
            for c in contacts:
                if c["engagementId"] == d["id"]:
                    c["engagementId"] = keep["id"]
            del engagements[next(k for k, v in engagements.items() if v is d)]
            removed += 1
    return removed


dupes_removed = merge_same_operator()

# ---------- 4. verified websites ----------

domains_set = 0
if args.domains:
    by_key_name = {key_for(c["fields"]["name"]): c for c in companies.values()}
    for name, domain in json.load(open(args.domains)).items():
        c = by_key_name.get(key_for(name))
        domain = re.sub(r"^https?://|^www\.|/.*$", "", (domain or "").strip().lower())
        if c and domain and "website" not in c["fields"]:
            c["fields"]["website"] = domain
            domains_set += 1


# ---------- 5. Clay enrichment (firmographics and decision makers) ----------
# Only high/medium confidence matches are used. Companies that resolve to the same domain are
# the same company: they merge into one record (no redundant companies), keeping the record
# with the most engagements; its engagements and people move with it.

CLAY_REVENUE = {"0-500K": "Under $1M", "500K-1M": "Under $1M", "1M-5M": "$1M–$5M", "5M-10M": "$5M–$20M", "10M-25M": "$5M–$20M",
                "25M-75M": "$20M–$50M"}
CLAY_SIZE = {"1": "1–10", "2-10": "1–10", "11-50": "11–50", "51-200": "51–200", "201-500": "201–500", "501-1,000": "501–1,000"}
INDUSTRY_RULES = [
    (r"health, wellness|fitness|wellness", "Wellness & Fitness"),
    (r"hospital|health ?care|medical|pharma|biotech|life science|mental health|dental|veterinary", "Health Care"),
    (r"bank|financial|insurance|capital market|investment|venture capital|credit|fintech|funds", "Financial Services"),
    (r"accounting", "Financial Services"),
    (r"computer hardware|networking|semiconductor|telecommunications equipment|electronics manufacturing|wireless|appliances", "Hardware & Networking"),
    (r"software|it services|information technology|technology, information|internet|computer and network security|data infrastructure|it system", "Software"),
    (r"retail|e-commerce|online and mail order", "Retail"),
    (r"consumer|food|beverage|cosmetic|personal care|apparel|luxury|furniture|sporting goods|tobacco|wine", "Consumer Goods"),
    (r"construction|building|civil engineering|contractors", "Construction"),
    (r"real estate|leasing", "Real Estate"),
    (r"manufactur|machinery|automotive|aviation|aerospace|defense|chemical|plastics|packaging|industrial|mechanical|electrical equipment", "Manufacturing"),
    (r"transport|logistics|freight|shipping|truck|warehous|maritime|airlines|railroad|delivery", "Transportation & Logistics"),
    (r"education|e-learning|higher ed|school|training", "Education"),
    (r"advertising|marketing|media|publishing|broadcast|newspaper|public relations|telecommunications|online audio|writing|journalism", "Media & Communications"),
    (r"entertainment|games|gaming|music|movies|film|animation|sports|spectator", "Entertainment"),
    (r"non-?profit|civic|philanthrop|fundraising|religious", "Nonprofit"),
    (r"law|legal", "Legal"),
    (r"oil|gas|mining|energy|utilities|renewable|solar|electric power", "Energy & Mining"),
    (r"hospitality|travel|leisure|hotel|recreation|restaurants|events", "Recreation & Travel"),
    (r"staffing|recruiting|human resources|outsourc|business consulting|consulting|executive search|professional services|management consulting|facilities", "Corporate Services"),
    (r"design|architecture", "Design"),
    (r"farming|agricultur|ranching|fisheries", "Agriculture"),
    (r"government|public policy|legislative|armed forces", "Public Administration"),
    (r"public safety|law enforcement|security and investigations", "Public Safety"),
    (r"arts|museums|fine art|performing", "Arts"),
]


def rn_industry(ind, desc):
    s = (ind or "").lower()
    if not s:
        return None
    for pat, tag in INDUSTRY_RULES:
        if re.search(pat, s):
            # Software, SaaS and IT services are one tag (lib/tableFields.ts RN_INDUSTRIES).
            return tag
    return None


def rn_employees(n, size):
    if isinstance(n, (int, float)) and n > 0:
        return ("1–10" if n <= 10 else "11–50" if n <= 50 else "51–200" if n <= 200 else
                "201–500" if n <= 500 else "501–1,000" if n <= 1000 else "1,001+")
    if size in CLAY_SIZE:
        return CLAY_SIZE[size]
    return "1,001+" if size else None


def rn_revenue(b):
    if not b:
        return None
    return CLAY_REVENUE.get(b, "$50M+" if re.match(r"^\d", b) else None)


def clean_url(u):
    return re.sub(r"^https?://|^www\.|/+$", "", (u or "").strip())


def similar(a, b):
    a, b = key_for(a), key_for(b)
    return bool(a and b) and (a in b or b in a)


clay_used = clay_people = merged_by_domain = 0
if args.clay:
    import glob
    clay = {}
    for fp in sorted(fp for d in args.clay for fp in glob.glob(os.path.join(d, "*.json"))):
        for x in json.load(open(fp)):
            if x.get("status") == "resolved" and x.get("confidence") in ("high", "medium") and x.get("domain"):
                clay[x["id"]] = x
                clay.setdefault("name:" + key_for(x.get("name") or ""), x)
                if x.get("confidence") == "high" and x.get("clayName"):
                    clay.setdefault("name:" + key_for(x["clayName"]), x)
    eng_count = {}
    for e in engagements.values():
        eng_count[e["companyId"]] = eng_count.get(e["companyId"], 0) + 1
    by_domain = {}
    by_key = {key_for(c["fields"]["name"]): c for c in companies.values()}
    for ck, c in list(companies.items()):
        x = clay.get(c["id"]) or clay.get("name:" + key_for(c["fields"]["name"]))
        if not x:
            continue
        domain = clean_url(x["domain"]).lower()
        # A lookup that came back with another company's site (the domain names a different
        # company on file, not this one) belongs to that company, e.g. "Lang" -> mangopay.com.
        stem = key_for(domain.split(".")[0])
        owner = by_key.get(stem)
        if stem and stem not in key_for(c["fields"]["name"]) and owner is not None and owner is not c and "_clay" not in owner:
            c = owner
        prev = c.get("_domain")
        if prev and c["id"] in [companies[k]["id"] for k in by_domain.get(prev, [])]:
            by_domain[prev] = [k for k in by_domain[prev] if companies[k] is not c]
        c["_clay"] = x
        c["_domain"] = domain
        by_domain.setdefault(domain, []).append(next(k for k, v in companies.items() if v is c))
    # same domain = same company
    for domain, keys in by_domain.items():
        if len(keys) < 2:
            continue
        keys.sort(key=lambda k: (-eng_count.get(companies[k]["id"], 0), -len(companies[k]["fields"])))
        keep = companies[keys[0]]
        for k in keys[1:]:
            d = companies.pop(k)
            for f, v in d["fields"].items():
                if f != "name":
                    keep["fields"].setdefault(f, v)
            for e in engagements.values():
                if e["companyId"] == d["id"]:
                    e["companyId"] = keep["id"]
            for p in contacts:
                if p.get("companyId") == d["id"]:
                    p["companyId"] = keep["id"]
            merged_by_domain += 1
    for c in companies.values():
        x = c.pop("_clay", None)
        domain = c.pop("_domain", None)
        if not x:
            continue
        clay_used += 1
        f = c["fields"]
        f.setdefault("website", domain)
        if x.get("confidence") == "high" and x.get("clayName") and similar(x["clayName"], f["name"]) and len(x["clayName"]) <= 50:
            f["name"] = x["clayName"].strip()
        ind = rn_industry(x.get("industry"), x.get("description"))
        if ind:
            f.setdefault("industry", ind)
        emp = rn_employees(x.get("employeeCount"), x.get("size"))
        if emp:
            f["employees"] = emp
        rev = rn_revenue(x.get("annualRevenue"))
        if rev:
            f["revenue"] = rev
        loc = (x.get("locality") or "").strip()
        country = (x.get("country") or "").strip()
        hq = loc if ("," in loc or not country) else f"{loc}, {country}" if loc else country
        if hq:
            f.setdefault("hq", hq[:80])
        if x.get("linkedin"):
            f["linkedin"] = clean_url(x["linkedin"])[:200]
        if x.get("description"):
            f["about"] = clip(x["description"], 200)
        seen = set()
        for p in (x.get("contacts") or [])[:2]:
            nm = (p.get("name") or "").strip()
            if not nm or key_for(nm) in seen:
                continue
            seen.add(key_for(nm))
            pf = {"name": nm, "relationship": "Decision maker"}
            if p.get("title"):
                pf["title"] = p["title"].strip()[:120]
            if p.get("linkedin") and "linkedin.com" in p["linkedin"]:
                pf["linkedin"] = clean_url(p["linkedin"])[:200]
            contacts.append({"id": f"p_{c['id'][2:32]}_{key_for(nm)[:20]}", "companyId": c["id"], "engagementId": None,
                             "source": "Clay", "fields": pf})
            clay_people += 1

dupes_removed += merge_same_operator()  # domain merges can bring one person's records together

seed = {
    "builtAt": datetime.now(timezone.utc).isoformat(),
    "members": members,
    "companies": sorted(companies.values(), key=lambda c: c["fields"]["name"].lower()),
    "engagements": list(engagements.values()),
    "contacts": contacts,
}
if old_rate_index:
    seed["rateIndex"] = old_rate_index
json.dump(seed, open(SEED_PATH, "w"), indent=1)

with open(os.path.join(OUT, "intel-member-links.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["name", "email", "title", "link_path"])
    for m in members:
        w.writerow([m["name"], m["email"], m["title"], f"/?k={m['token']}"])

src = {}
for e in engagements.values():
    src[e["fields"]["source"]] = src.get(e["fields"]["source"], 0) + 1
print(f"members: {len(members)}")
print(f"published engagements: {published} used; {skipped_anon} anonymous and {skipped_unpub} unpublished skipped")
print(f"success stories: {stories} ({story_records} new records; stories naming no company are skipped)")
print(f"demand scan rows: {demand_rows}")
print(f"not companies (projects and addresses, NOT_COMPANIES): {not_companies_dropped} engagements dropped")
print(f"records by source: {src}  total: {len(engagements)} ({dupes_removed} same-person duplicates merged away)")
print(f"companies: {len(companies)} ({sum('website' in c['fields'] for c in companies.values())} with a website; {domains_set} from --domains)")
print(f"contacts: {len(contacts)} ({clay_people} decision makers from Clay)")
print(f"clay: {clay_used} companies enriched; {merged_by_domain} merged as same-domain duplicates")
print(f"rate index: {len(old_rate_index or [])} points carried over" + ("" if old_rate_index else " (run scripts/add-rate-index.mjs to add them)"))
print(f"wrote {SEED_PATH}")

# Labels, places and fractional firms (lib/firmRemoval.ts): the same cleanup the app and the seat scan use.
import subprocess
subprocess.run(["node", "--import", "tsx", "scripts/clean-intel-seed.mts", "--seed", SEED_PATH], check=True)
