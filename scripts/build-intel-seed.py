#!/usr/bin/env python3
"""Build the private seed for The Table (/table) from member exports.

Usage:
  python3 scripts/build-intel-seed.py <Talent_Signups.csv> <engagements.csv> [out_dir]

Writes (both git-ignored -- they contain member data, never commit them):
  <out_dir>/intel-seed.json      members, companies, member->company links
  <out_dir>/intel-member-links.csv  one private sign-in link token per member

out_dir defaults to ./data. Every link starts as "identified": it was pulled
from something the member wrote (a success story or a published engagement)
and stays unconfirmed until the member confirms it on The Table.
Re-running keeps existing member tokens so links already sent keep working.
"""
import csv, json, os, re, secrets, sys
from datetime import datetime, timezone

if len(sys.argv) < 3:
    sys.exit(__doc__)
SIGNUPS, ENGAGEMENTS = sys.argv[1], sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.getcwd(), "data")
os.makedirs(OUT, exist_ok=True)
SEED_PATH = os.path.join(OUT, "intel-seed.json")

# Words that mean "no company named" -- these stories stay unlinked.
JUNK = re.compile(
    r"^(a|an|the|my|our|one|client|clients|company|companies|confidential|"
    r"confidential client|startup|series|during|while|when|i|we|led|built|"
    r"scaled|grew|increased|developed|created|launched|helped|working|worked|"
    r"as|in|at|for|with|from|after|over|under|first|global|us|uk|leading|"
    r"stealth|undisclosed|private|fortune|multiple|several|various|n/?a|none)\b",
    re.I,
)
GENERIC = re.compile(
    r"(\b(company|firm|startup|agency|provider|business|industry|sector|vendor|client|customer)\s*$)|"
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
    if s[0].islower() and "." not in s:  # sentence fragment, not a name (allow e.g. "thimble.io")
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


old = {}
if os.path.exists(SEED_PATH):
    try:
        for m in json.load(open(SEED_PATH))["members"]:
            old[m["email"]] = m["token"]
    except Exception:
        pass

members, by_email, by_name = [], {}, {}


def add_member(first, last, email, title="", based=""):
    email = (email or "").strip().lower()
    name = f"{first.strip()} {last.strip()}".strip()
    k = email or name.lower()
    if k in by_email:
        return by_email[k]
    m = {
        "id": f"m{len(members) + 1:04d}",
        "name": name,
        "email": email,
        "title": title.strip() or "Operator",
        "based": based.strip(),
        "token": old.get(email) or secrets.token_urlsafe(12),
    }
    members.append(m)
    by_email[k] = m
    by_name[name.lower()] = m
    return m


companies, links = {}, {}


def link(member, company, rel, source, evidence, verified=False, date=None):
    k = key_for(company)
    if not k:
        return
    c = companies.setdefault(k, {"id": k, "name": company})
    lk = (member["id"], k, rel)
    if lk in links:
        if verified:
            links[lk]["verified"] = True
        return
    links[lk] = {
        "memberId": member["id"],
        "companyId": k,
        "relationship": rel,
        "source": source,
        "evidence": evidence[:280],
        "verified": verified,
        "date": date,
        "status": "identified",
    }


stories = unlinked = 0
with open(SIGNUPS, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        m = add_member(r.get("TF: First Name", ""), r.get("TF:Last Name", ""), r.get("Email", ""),
                       r.get("Title", ""), r.get("TF: Based", ""))
        when = None
        try:
            when = datetime.strptime(r["Submitted At"].split()[0], "%m/%d/%Y").strftime("%Y-%m")
        except Exception:
            pass
        for col in ("Success Story #1", "Success Story #2", "Success Story #3"):
            s = (r.get(col) or "").strip()
            if not s:
                continue
            stories += 1
            c = company_from_story(s)
            if c:
                link(m, c, "success_story", "signup", s, date=when)
            else:
                unlinked += 1

eng_total = eng_anon = 0
with open(ENGAGEMENTS, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        name = (r.get("Engagement") or "").strip()
        if not name or r.get("Published", "").lower() != "true":
            continue
        eng_total += 1
        if re.match(r"^(a|an)\s", name, re.I) or len(name.split()) > 5 or GENERIC.search(name):
            eng_anon += 1  # already anonymised by the operator -- respect that
            continue
        op = r.get("Operator", "").strip()
        m = by_name.get(op.lower())
        if not m:
            first, _, last = op.partition(" ")
            m = add_member(first, last, "")
        link(m, name, "engagement", "engagement",
             f"Published engagement: {name}",
             verified=r.get("Verification") == "buyer_corroborated",
             date=(r.get("Added") or "")[:7] or None)

used = {l["companyId"] for l in links.values()}
seed = {
    "builtAt": datetime.now(timezone.utc).isoformat(),
    "members": members,
    "companies": sorted((c for c in companies.values() if c["id"] in used), key=lambda c: c["name"].lower()),
    "links": list(links.values()),
}
json.dump(seed, open(SEED_PATH, "w"), indent=1)

with open(os.path.join(OUT, "intel-member-links.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["name", "email", "title", "companies_listed", "link_path"])
    counts = {}
    for l in links.values():
        counts[l["memberId"]] = counts.get(l["memberId"], 0) + 1
    for m in members:
        w.writerow([m["name"], m["email"], m["title"], counts.get(m["id"], 0), f"/table?k={m['token']}"])

multi = {}
for l in links.values():
    multi.setdefault(l["companyId"], set()).add(l["memberId"])
print(f"members: {len(members)}")
print(f"success stories: {stories} ({stories - unlinked} named a company, {unlinked} did not)")
print(f"engagements: {eng_total} published ({eng_anon} anonymised, skipped)")
print(f"companies: {len(seed['companies'])}  links: {len(links)}")
print(f"companies known by 2+ members: {sum(1 for v in multi.values() if len(v) > 1)}")
print(f"members with at least one company: {len({l['memberId'] for l in links.values()})}")
print(f"wrote {SEED_PATH}")
