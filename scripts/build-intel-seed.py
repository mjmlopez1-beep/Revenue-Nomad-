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
already sent keep working.
"""
import argparse, csv, json, os, re, secrets
from datetime import datetime, timezone

ap = argparse.ArgumentParser(usage=__doc__)
ap.add_argument("signups")
ap.add_argument("engagements")
ap.add_argument("out_legacy", nargs="?", help=argparse.SUPPRESS)
ap.add_argument("--demand", action="append", default=[], help="demand-scan CSV export (repeatable)")
ap.add_argument("--domains", default=None, help='JSON {"Company name": "domain.com"} of verified websites')
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
if os.path.exists(SEED_PATH):
    try:
        for m in json.load(open(SEED_PATH))["members"]:
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


def company(name):
    ck = key_for(name)
    return companies.setdefault(ck, {"id": f"c_{ck[:40]}", "fields": {"name": name}}), ck


# Register every signup first so engagement operators match their signup (not a duplicate).
with open(args.signups, encoding="utf-8-sig") as f:
    signup_rows = list(csv.DictReader(f))
for r in signup_rows:
    add_member(r.get("TF: First Name", ""), r.get("TF:Last Name", ""), r.get("Email", ""), r.get("Title", ""))

# ---------- 1. published engagements (admin portal export) ----------

published = skipped = 0
with open(args.engagements, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        name = re.sub(r"\s+", " ", (r.get("Engagement") or "").strip())
        if not name or r.get("Published", "").lower() != "true":
            continue
        published += 1
        if re.match(r"^(a|an)\s", name, re.I) or len(name.split()) > 5 or GENERIC.search(name):
            skipped += 1  # the operator anonymised it -- respect that
            continue
        op = (r.get("Operator") or "").strip()
        if op.lower() not in by_name:
            first, _, last = op.partition(" ")
            add_member(first, last, "")
        co, ck = company(name)
        ek = f"{ck}_{key_for(op)}"
        e = engagements.setdefault(ek, {"id": f"e_{ek[:56]}", "companyId": co["id"],
                                        "fields": {"source": "Published engagement", "operator": op}, "verified": False})
        if r.get("Verification") == "buyer_corroborated":
            e["verified"] = True

# ---------- 2. member success stories (talent signups) ----------

stories = story_records = 0
if True:
    for r in signup_rows:
        m = add_member(r.get("TF: First Name", ""), r.get("TF:Last Name", ""), r.get("Email", ""), r.get("Title", ""))
        for col in ("Success Story #1", "Success Story #2", "Success Story #3"):
            text = (r.get(col) or "").strip()
            if not text:
                continue
            stories += 1
            name = company_from_story(text)
            if not name:
                continue
            co, ck = company(name)
            ek = f"{ck}_{key_for(m['name'])}"
            if ek in engagements:  # same company + operator as a published engagement: add the context
                engagements[ek]["fields"].setdefault("outcome", clip(text))
                continue
            engagements[ek] = {"id": f"e_{ek[:56]}", "companyId": co["id"], "verified": False,
                               "fields": {"source": "Member success story", "operator": m["name"], "outcome": clip(text)}}
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
                contacts.append({"id": f"p_{ck[:30]}_{key_for(dm)[:20]}", "engagementId": f"e_{ek[:56]}", "fields": c})

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

seed = {
    "builtAt": datetime.now(timezone.utc).isoformat(),
    "members": members,
    "companies": sorted(companies.values(), key=lambda c: c["fields"]["name"].lower()),
    "engagements": list(engagements.values()),
    "contacts": contacts,
}
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
print(f"published engagements: {published} ({skipped} anonymised/skipped)")
print(f"success stories: {stories} ({story_records} new records; stories naming no company are skipped)")
print(f"demand scan rows: {demand_rows}")
print(f"records by source: {src}  total: {len(engagements)}")
print(f"companies: {len(companies)} ({sum('website' in c['fields'] for c in companies.values())} with a website; {domains_set} from --domains)")
print(f"contacts: {len(contacts)}")
print(f"wrote {SEED_PATH}")
