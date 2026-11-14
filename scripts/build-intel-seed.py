#!/usr/bin/env python3
"""Build the private seed for The Table (/table) from member exports.

Usage:
  python3 scripts/build-intel-seed.py <Talent_Signups.csv> <engagements.csv> [out_dir]

Writes (both git-ignored -- they contain member data, never commit them):
  <out_dir>/intel-seed.json         members (for sign-in) + seed records
  <out_dir>/intel-member-links.csv  one private sign-in link per member

Seed records:
  - Companies: every company named in a member success story or a published
    engagement (name only -- members enrich the rest).
  - Fractional History: one row per published engagement, with the operator
    in the gated Operator field. Buyer-corroborated ones are marked verified.
Anonymised engagements ("A PE-backed medical group") are skipped.

out_dir defaults to ./data. Re-running keeps existing member tokens so links
already sent keep working.
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


companies = {}  # key -> record


def add_company(name):
    k = key_for(name)
    if k and k not in companies:
        companies[k] = {"id": f"c_{k[:40]}", "type": "company", "fields": {"name": name}}


stories = named = 0
with open(SIGNUPS, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        add_member(r.get("TF: First Name", ""), r.get("TF:Last Name", ""), r.get("Email", ""), r.get("Title", ""))
        for col in ("Success Story #1", "Success Story #2", "Success Story #3"):
            s = (r.get(col) or "").strip()
            if not s:
                continue
            stories += 1
            c = company_from_story(s)
            if c:
                named += 1
                add_company(c)

history, eng_total, eng_skipped = {}, 0, 0
with open(ENGAGEMENTS, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        name = (r.get("Engagement") or "").strip()
        if not name or r.get("Published", "").lower() != "true":
            continue
        eng_total += 1
        if re.match(r"^(a|an)\s", name, re.I) or len(name.split()) > 5 or GENERIC.search(name):
            eng_skipped += 1  # already anonymised by the operator -- respect that
            continue
        op = r.get("Operator", "").strip()
        if op.lower() not in by_name:
            first, _, last = op.partition(" ")
            add_member(first, last, "")
        add_company(name)
        hk = f"{key_for(name)}_{key_for(op)}"  # dedupe repeat submissions
        h = history.setdefault(hk, {"id": f"h_{hk[:48]}", "type": "history",
                                     "fields": {"company": name, "operator": op}, "verified": False})
        if r.get("Verification") == "buyer_corroborated":
            h["verified"] = True

records = sorted(companies.values(), key=lambda c: c["fields"]["name"].lower()) + list(history.values())
seed = {"builtAt": datetime.now(timezone.utc).isoformat(), "members": members, "records": records}
json.dump(seed, open(SEED_PATH, "w"), indent=1)

with open(os.path.join(OUT, "intel-member-links.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["name", "email", "title", "link_path"])
    for m in members:
        w.writerow([m["name"], m["email"], m["title"], f"/table?k={m['token']}"])

print(f"members: {len(members)}")
print(f"success stories: {stories} ({named} named a company)")
print(f"engagements: {eng_total} published, {eng_skipped} anonymised/skipped, {len(history)} history rows after dedupe "
      f"({sum(h['verified'] for h in history.values())} buyer-verified)")
print(f"company records: {len(companies)}")
print(f"wrote {SEED_PATH}")
