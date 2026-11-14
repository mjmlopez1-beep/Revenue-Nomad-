#!/usr/bin/env python3
"""Build the private seed for The Table (/table) from member exports.

Usage:
  python3 scripts/build-intel-seed.py <Talent_Signups.csv> <engagements.csv> [--demand scan.csv] [--out dir]

Writes (both git-ignored -- they contain member data, never commit them):
  <out_dir>/intel-seed.json         members (for sign-in), companies, engagements
  <out_dir>/intel-member-links.csv  one private sign-in link per member

Every record on The Table is a fractional engagement at a company. This seeds
one per published engagement (repeat submissions of the same company +
operator are merged), with the operator in the gated "Fractional" field.
Buyer-corroborated engagements are marked verified. Engagements the operator
already anonymised ("A PE-backed medical group") are skipped -- respect that.

--demand takes an export of the "Fractional GTM Demand Scan" sheet (columns:
Company, Company Domain, Role Title, Source Link, Location, Decision Maker,
DM Title, DM LinkedIn). Each row becomes an "Open role" engagement at that
company, with the posting link, and the decision maker as a contact
"Hiring for the seat". Placeholder notes ("not found…") are ignored.

out_dir defaults to ./data. Re-running keeps existing member tokens so links
already sent keep working.
"""
import argparse, csv, json, os, re, secrets, sys
from datetime import datetime, timezone

ap = argparse.ArgumentParser(usage=__doc__)
ap.add_argument("signups")
ap.add_argument("engagements")
ap.add_argument("out_legacy", nargs="?", help=argparse.SUPPRESS)
ap.add_argument("--demand", action="append", default=[], help="demand-scan CSV export (repeatable)")
ap.add_argument("--out", default=None)
args = ap.parse_args()
SIGNUPS, ENGAGEMENTS = args.signups, args.engagements
OUT = args.out or args.out_legacy or os.path.join(os.getcwd(), "data")
os.makedirs(OUT, exist_ok=True)
SEED_PATH = os.path.join(OUT, "intel-seed.json")

# Descriptions rather than names: "International B2B SaaS Company", "A designer-led brand".
ANONYMISED = re.compile(
    r"^(a|an)\s|\b(company|firm|startup|agency|provider|business|program)\s*$", re.I)


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


with open(SIGNUPS, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        add_member(r.get("TF: First Name", ""), r.get("TF:Last Name", ""), r.get("Email", ""), r.get("Title", ""))

companies, engagements = {}, {}
published = skipped = 0
with open(ENGAGEMENTS, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        name = re.sub(r"\s+", " ", (r.get("Engagement") or "").strip())
        if not name or r.get("Published", "").lower() != "true":
            continue
        published += 1
        if ANONYMISED.search(name) or len(name.split()) > 5:
            skipped += 1
            continue
        op = (r.get("Operator") or "").strip()
        if op.lower() not in by_name:  # engagement-only operators still get a sign-in link
            first, _, last = op.partition(" ")
            add_member(first, last, "")
        ck = key_for(name)
        companies.setdefault(ck, {"id": f"c_{ck[:40]}", "fields": {"name": name}})
        ek = f"{ck}_{key_for(op)}"
        e = engagements.setdefault(ek, {"id": f"e_{ek[:56]}", "companyId": f"c_{ck[:40]}",
                                        "fields": {"operator": op}, "verified": False})
        if r.get("Verification") == "buyer_corroborated":
            e["verified"] = True

# ---- demand scans: open fractional roles companies posted ----
contacts, demand_rows = [], 0
PLACEHOLDER = re.compile(r"not found|not returned|no decision maker|obfuscat|apollo", re.I)


def clean_cell(v):
    v = re.sub(r"\s*\(.*?\)\s*", " ", (v or "")).strip()  # drop "(last name obfuscated …)" asides
    return "" if not v or PLACEHOLDER.search(v) else v


for path in args.demand:
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            name = (r.get("Company") or "").strip()
            if not name:
                continue
            demand_rows += 1
            ck = key_for(name)
            co = companies.setdefault(ck, {"id": f"c_{ck[:40]}", "fields": {"name": name}})
            domain = (r.get("Company Domain") or "").strip().lower()
            if domain and "website" not in co["fields"]:
                co["fields"]["website"] = domain
            # The posting's location is where the role sits, not the company HQ; only take an explicit "HQ …".
            hq = re.search(r"\bHQ\s+([^)]+)", r.get("Location") or "")
            if hq and "hq" not in co["fields"]:
                co["fields"]["hq"] = hq.group(1).strip()
            role = (r.get("Role Title") or "").strip()
            ek = f"{ck}_open_{key_for(role)[:24]}"
            if ek in engagements:
                continue
            fields = {"status": "Open role"}
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
        w.writerow([m["name"], m["email"], m["title"], f"/table?k={m['token']}"])

print(f"members: {len(members)}")
print(f"engagements: {published} published, {skipped} anonymised/skipped, "
      f"{len(engagements)} records after merging repeats ({sum(e['verified'] for e in engagements.values())} buyer-verified)")
print(f"demand scan rows: {demand_rows} -> open-role records with {len(contacts)} decision-maker contacts")
print(f"companies: {len(companies)}")
print(f"wrote {SEED_PATH}")
