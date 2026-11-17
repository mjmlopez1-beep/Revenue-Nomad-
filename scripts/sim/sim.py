"""
Merlin: agent-based Monte Carlo of the give-to-get economy.

400 fractionals log in on day 0 and are then simulated for 100 days, many times over.
Each run draws a fresh population from the calibration (survey + seed table), fresh
behaviour, and a fresh weekly scan of the open fractional market.

Economy (as implemented in lib/table.ts, with the starter changed to 25):
  start 25 credits; +1 per fact added (fills only on empty facts); max 25 earned per rolling
  24h (bonuses included); unlock = 1 credit; hidden company (active open role) = 1 credit;
  invite bonus +10 to both when the invitee adds a first fact; confirmation bonus +1 to the
  author after 2 confirms; new accounts can unlock 20 on day one, then 100 a day.

Weekly scan: every 7 days new open GTM fractional roles land in the table (company hidden,
role/posting/status locked). Roles stay open for a while, then the scan marks them closed
with a date; a company is hidden only while it has an open role.
"""
import json
import math
import random
import sys
from collections import Counter, defaultdict

DAYS = 100

# ---------------------------------------------------------------- calibration (aggregates)
# Seed table (data/intel-seed.json, Nov 2026): what is on file, locked, or missing.
SEED_ENGAGEMENTS = 578
SEED_COMPANIES = 556
SEED_LOCKED = {  # locked facts members can unlock today
    "seat_holder": 575, "role": 124, "status": 61, "end": 58, "posting": 3,
    "rate": 0, "hours": 0, "sourced": 0, "contact": 407,
}
SEED_MEMBERS_WITH_ENG = 223          # of 278 seed members, engagements on file (median 3)
SEED_ENG_PER_MEMBER = [2, 3, 3, 3, 3, 2, 3, 4, 1, 3]  # sample shape (p25 2, p50 3, p75 3)
# Empty share of each engagement field across the seed (what a member can add on their own seats).
EMPTY_SHARE = {"role": 0.79, "type": 0.79, "status": 0.89, "start": 0.89, "end": 0.90, "rate": 1.0,
               "hours": 1.0, "sourced": 1.0, "reason": 1.0, "pricing": 1.0, "rev_then": 0.92, "emp_then": 1.0}
COMPANY_GTM = ["business_model", "motion", "deal_size", "sales_cycle"]

# Survey (State of Fractional GTM 2027, n=81 answers + 41 platform rate rows): clients now.
CLIENTS = {"0": 0.04, "1": 0.30, "2": 0.25, "3": 0.21, "4+": 0.20}
SIDE_GIG = 0.14        # do fractional work alongside a full-time job
FIRST_SEARCH = 0.04    # looking for a first engagement
RAISE_RATE = 0.36      # plan to raise their rate in the next 6 months
REFERRAL_LED = 0.55    # name peer referral or a prior colleague among their last 3 clients' sources

# Market functions for scanned roles (fractional-labelled postings skew to sales and marketing).
SCAN_FN = {"Sales": 0.40, "Marketing": 0.25, "RevOps": 0.12, "Growth": 0.08, "Customer Success": 0.05,
           "Partnerships": 0.05, "Enablement": 0.03, "Other": 0.02}
# Platform member functions (seed titles + survey role categories).
MEMBER_FN = {"Sales": 0.52, "Marketing": 0.12, "RevOps": 0.15, "Growth": 0.08, "Customer Success": 0.04,
             "Partnerships": 0.04, "Enablement": 0.03, "Other": 0.02}

# ---------------------------------------------------------------- personas
# daily: chance of a visit on a given day while engaged. churn: chance a visit is their last
# (before frustration). want: unlocks wanted per visit (Poisson mean), weights by field.
# give: facts added per visit unprompted. wall_give: chance they switch to adding facts when
# out of credits. disclose: multiplier on willingness to share sensitive facts (rate, hours).
PERSONAS = {
    "Pipeline hunter": dict(
        daily=0.22, churn=0.10, want=2.5, give=1.5, wall_give=0.55, disclose=0.9, invite=0.03,
        weights={"hidden_company": 5, "role": 3, "posting": 3, "contact": 4, "seat_holder": 1.5, "rate": 1.5, "sourced": 1.2, "status": 1, "end": 0.3, "hours": 0.4},
        open_role_interest=0.35, wtp=0.16),
    "Rate benchmarker": dict(
        daily=0.10, churn=0.16, want=2.5, give=2.0, wall_give=0.6, disclose=1.2, invite=0.03,
        weights={"rate": 6, "hours": 3, "role": 1.5, "seat_holder": 1, "sourced": 1, "status": 0.6, "end": 0.6, "contact": 0.4, "hidden_company": 1, "posting": 0.4},
        open_role_interest=0.12, wtp=0.06),
    "Connector": dict(
        daily=0.12, churn=0.13, want=3.0, give=2.5, wall_give=0.65, disclose=1.0, invite=0.06,
        weights={"seat_holder": 6, "contact": 3, "role": 2, "sourced": 2, "rate": 1, "status": 0.8, "end": 0.6, "hidden_company": 1, "posting": 0.3, "hours": 0.3},
        open_role_interest=0.12, wtp=0.07),
    "Contributor": dict(
        daily=0.14, churn=0.08, want=1.5, give=6.0, wall_give=0.9, disclose=1.4, invite=0.08,
        weights={"rate": 2, "seat_holder": 2, "role": 2, "sourced": 1.5, "contact": 1, "status": 1, "end": 1, "hidden_company": 1, "posting": 0.5, "hours": 1},
        open_role_interest=0.08, wtp=0.03),
    "Lurker": dict(
        daily=0.03, churn=0.45, want=1.2, give=0.3, wall_give=0.15, disclose=0.5, invite=0.01,
        weights={"rate": 2, "hidden_company": 2, "seat_holder": 2, "role": 1.5, "contact": 1, "posting": 0.5, "status": 0.5, "end": 0.3, "hours": 0.3, "sourced": 0.5},
        open_role_interest=0.06, wtp=0.01),
}
# Base disclosure willingness per field (multiplied by the persona's `disclose`).
DISCLOSE = {"role": 0.95, "type": 0.9, "status": 0.9, "start": 0.85, "end": 0.85, "reason": 0.85, "pricing": 0.75,
            "sourced": 0.7, "hours": 0.5, "rate": 0.35, "rev_then": 0.6, "emp_then": 0.6, "company_gtm": 0.8,
            "seat_holder": 0.95, "contact": 0.3, "new_engagement": 0.6}


def pick_persona(rng, clients, side, first, raise_rate, referral):
    """Persona from survey answers, with randomness so mixes stay realistic."""
    if side and rng.random() < 0.6:
        return "Lurker"
    if first or clients in ("0", "1"):
        return "Pipeline hunter" if rng.random() < 0.7 else ("Rate benchmarker" if raise_rate else "Lurker")
    if clients == "4+":
        return "Contributor" if rng.random() < 0.45 else ("Lurker" if rng.random() < 0.5 else "Connector")
    r = rng.random()
    if raise_rate and r < 0.45:
        return "Rate benchmarker"
    if referral and r < 0.75:
        return "Connector"
    return "Lurker" if r < 0.9 else "Contributor"


def wchoice(rng, d):
    total = sum(d.values())
    x = rng.random() * total
    for k, v in d.items():
        x -= v
        if x <= 0:
            return k
    return k


def poisson(rng, lam):
    if lam <= 0:
        return 0
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


class User:
    __slots__ = ("id", "persona", "fn", "clients", "credits", "earn_log", "know", "unlocked", "active", "joined",
                 "first_wall", "walls", "stuck", "unmet", "visits", "last_visit", "invited", "referred_by",
                 "ref_paid", "added", "spent", "earned", "own_eng", "pay_intent", "frustration", "roles_seen", "visit_days")


def run(seed, cfg):
    rng = random.Random(seed)
    P = cfg
    users = []

    def make_user(uid, persona=None, on_file=None, referred_by=None, joined=0):
        u = User()
        u.id = uid
        clients = wchoice(rng, CLIENTS)
        side = rng.random() < SIDE_GIG
        first = rng.random() < FIRST_SEARCH
        raise_rate = rng.random() < RAISE_RATE
        referral = rng.random() < REFERRAL_LED
        u.persona = persona or pick_persona(rng, clients, side, first, raise_rate, referral)
        u.fn = wchoice(rng, MEMBER_FN)
        u.clients = clients
        u.credits = P["starter"]
        u.earn_log = []
        u.unlocked = Counter()
        u.active = True
        u.joined = joined
        u.first_wall = None
        u.walls = 0
        u.stuck = 0
        u.unmet = Counter()
        u.visits = 0
        u.last_visit = -1
        u.invited = 0
        u.referred_by = referred_by
        u.ref_paid = False
        u.added = Counter()
        u.spent = Counter()
        u.earned = 0
        u.pay_intent = 0.0
        u.frustration = 0
        u.roles_seen = set()
        u.visit_days = []
        # What this person knows and could add: their own seats on file (empty fields), seats not on
        # file yet (whole new engagements), the companies' GTM facts, and people they know there.
        if on_file is None:
            on_file = rng.choice(SEED_ENG_PER_MEMBER) if rng.random() < SEED_MEMBERS_WITH_ENG / 278 else 0
        new_eng = {"0": 0, "1": 1, "2": 2, "3": 2, "4+": 3}[clients] + (1 if rng.random() < 0.5 else 0)
        know = Counter()
        mult = PERSONAS[u.persona]["disclose"]
        for _ in range(on_file):
            for f, share in EMPTY_SHARE.items():
                if rng.random() < share and rng.random() < min(1, DISCLOSE[f] * mult * P.get("disclose_boost", {}).get(f, 1)):
                    know[f] += 1
            for _g in COMPANY_GTM:
                if rng.random() < DISCLOSE["company_gtm"] * mult:
                    know["company_gtm"] += 1
            if rng.random() < DISCLOSE["contact"] * mult:
                know["contact_add"] += 1
        for _ in range(new_eng):
            if rng.random() < DISCLOSE["new_engagement"] * mult:
                know["new_engagement"] += 1
        u.know = know
        u.own_eng = on_file
        return u

    for i in range(P["users"]):
        users.append(make_user(i))

    # Locked supply per field (global), grows as members add gated facts and as the scan runs.
    supply = Counter(SEED_LOCKED)
    engagements = SEED_ENGAGEMENTS
    rates_on_file = Counter()  # function -> rates (for benchmark groups)
    for fn in MEMBER_FN:
        rates_on_file[fn] += int(P.get("rate_seed", 0) * MEMBER_FN[fn])
    open_roles = []  # dicts: fn, opened, closes, closed
    role_id = 0
    for _ in range(3):  # three open roles on file today
        open_roles.append(dict(id=role_id, fn=wchoice(rng, SCAN_FN), opened=-10, closes=rng.randint(5, 40), closed=None))
        role_id += 1

    daily = defaultdict(Counter)       # day -> metric counter
    field_unlocks = Counter()
    field_adds = Counter()
    field_unmet = Counter()            # demand that hit the wall (and wasn't met by giving)
    data_gap = Counter()               # demand with nothing on file to unlock
    persona_stats = defaultdict(Counter)

    def earned_24h(u, day):
        u.earn_log = [(d, n) for d, n in u.earn_log if d > day - 1]
        return sum(n for _, n in u.earn_log)

    def earn(u, day, n):
        room = max(0, P["cap"] - earned_24h(u, day))
        got = min(n, room)
        if got:
            u.earn_log.append((day, got))
            u.credits += got
            u.earned += got
        return got

    def try_unlock(u, day, f):
        u.credits -= 1
        u.unlocked[f] += 1
        u.spent[f] += 1
        field_unlocks[f] += 1
        daily[day]["unlocks"] += 1

    def give(u, day, want_n):
        """Add facts from what they know, up to want_n. Returns facts added."""
        added = 0
        order = ["new_engagement", "role", "reason", "type", "status", "start", "end", "pricing", "company_gtm",
                 "sourced", "hours", "rate", "rev_then", "emp_then", "contact_add"]
        rng.shuffle(order)
        for f in order:
            while added < want_n and u.know[f] > 0:
                if earned_24h(u, day) >= P["cap"]:
                    return added
                u.know[f] -= 1
                if f == "new_engagement":
                    nonlocal_add_engagement(u, day)
                    added_facts = 4
                    earn(u, day, added_facts)
                    added += added_facts
                    continue
                earn(u, day, 1)
                u.added[f] += 1
                field_adds[f] += 1
                daily[day]["adds"] += 1
                added += 1
                # Gated facts a member adds become locked supply for everyone else.
                if f in ("role", "status", "end", "rate", "hours", "sourced"):
                    supply[f] += 1
                if f == "rate":
                    rates_on_file[u.fn] += 1
                if f == "contact_add":
                    supply["contact"] += 1
                # Referral bonus on the invitee's first fact.
                if u.referred_by is not None and not u.ref_paid:
                    u.ref_paid = True
                    earn(u, day, 10)
                    ref = users[u.referred_by]
                    earn(ref, day, 10)
                    daily[day]["referral_paid"] += 1
        return added

    def nonlocal_add_engagement(u, day):
        nonlocal engagements
        engagements += 1
        u.added["new_engagement"] += 1
        field_adds["new_engagement"] += 1
        daily[day]["adds"] += 4
        for f in ("role", "status"):
            supply[f] += 1
        if rng.random() < DISCLOSE["rate"] * PERSONAS[u.persona]["disclose"]:
            supply["rate"] += 1
            rates_on_file[u.fn] += 1
            field_adds["rate"] += 1
        supply["seat_holder"] += 1
        if rng.random() < DISCLOSE["sourced"]:
            supply["sourced"] += 1

    for day in range(DAYS):
        # Weekly scan: new open roles in, expired ones closed (dated).
        if day % 7 == 0 and day > 0:
            n_new = poisson(rng, P["scan_per_week"])
            for _ in range(n_new):
                life = max(7, int(rng.gammavariate(3, P["role_life"] / 3)))
                open_roles.append(dict(id=role_id, fn=wchoice(rng, SCAN_FN), opened=day, closes=day + life, closed=None))
                role_id += 1
                engagements += 1
                supply["role"] += 1
                supply["posting"] += 1
                supply["status"] += 1
            daily[day]["scan_new"] += n_new
        for r in open_roles:
            if r["closed"] is None and day >= r["closes"] and day % 7 == 0:
                r["closed"] = day
                daily[day]["scan_closed"] += 1
        open_now = [r for r in open_roles if r["closed"] is None]
        daily[day]["open_roles"] = len(open_now)

        new_users = []
        for u in users:
            if u.joined > day:
                continue
            p = PERSONAS[u.persona]
            visit = False
            if day == u.joined:
                visit = True
            elif u.active:
                # Weekly digest of new open roles in their function pulls people back.
                fresh = [r for r in open_now if r["fn"] == u.fn and r["opened"] == day - (day % 7) and r["id"] not in u.roles_seen]
                boost = 1.0 + (P["digest_boost"] if (day % 7 == 1 and fresh) else 0)
                visit = rng.random() < min(0.95, p["daily"] * boost)
            elif P["digest"] and day % 7 == 1:
                fresh = [r for r in open_now if r["fn"] == u.fn and r["opened"] >= day - 7]
                if fresh and rng.random() < P["reactivate"] * (1.5 if u.persona == "Pipeline hunter" else 0.7):
                    u.active = True
                    visit = True
            if not visit:
                continue
            u.visits += 1
            u.last_visit = day
            u.visit_days.append(day)
            daily[day]["visits"] += 1
            persona_stats[u.persona]["visits"] += 1

            # Day-one unlock limit for new accounts.
            unlock_limit = 20 if day == u.joined else 100

            # What they want this visit.
            wants = []
            # Open roles in their function they haven't looked at: the package is hidden company,
            # role, posting and the hiring contact.
            for r in open_now:
                if r["fn"] == u.fn and r["id"] not in u.roles_seen and rng.random() < p["open_role_interest"]:
                    u.roles_seen.add(r["id"])
                    wants += ["hidden_company", "role", "posting"] + (["contact"] if rng.random() < 0.5 else [])
            for _ in range(poisson(rng, p["want"])):
                f = wchoice(rng, {k: v for k, v in p["weights"].items() if k not in ("hidden_company", "posting")})
                wants.append(f)
            # Unprompted giving first for contributors, after browsing for the rest.
            if u.persona == "Contributor":
                give(u, day, poisson(rng, p["give"]))
            done = 0
            for f in wants:
                if done >= unlock_limit:
                    break
                # Is there anything left to unlock for them in this field?
                if f != "hidden_company" and supply[f] - u.unlocked[f] <= 0:
                    data_gap[f] += 1
                    continue
                if u.credits <= 0:
                    if u.first_wall is None:
                        u.first_wall = day
                        daily[day]["first_walls"] += 1
                    u.walls += 1
                    # Give to get: add facts to keep going.
                    if rng.random() < p["wall_give"]:
                        got = give(u, day, 3)
                        if got and u.credits > 0:
                            daily[day]["wall_conversions"] += 1
                    if u.credits <= 0:
                        field_unmet[f] += 1
                        u.unmet[f] += 1
                        u.stuck += 1
                        continue
                try_unlock(u, day, f)
                done += 1
            if u.persona != "Contributor":
                give(u, day, poisson(rng, p["give"]) if rng.random() < 0.6 else 0)
            # Invites.
            if rng.random() < p["invite"] * P["invite_mult"] and u.invited < 5:
                u.invited += 1
                if rng.random() < 0.3 and len(users) + len(new_users) < P["users"] * 1.5:
                    v = make_user(len(users) + len(new_users), on_file=0, referred_by=u.id, joined=day + rng.randint(1, 5))
                    new_users.append(v)
                    daily[day]["invited_joins"] += 1
            # Did the visit pay off? Stuck visits raise churn; useful ones lower it.
            churn = p["churn"] * (1.6 if u.stuck and u.credits <= 0 else 1.0) * (0.8 if done else 1.1)
            if day != u.joined or u.persona == "Lurker":
                if rng.random() < churn:
                    u.active = False
            elif rng.random() < churn * 0.6:
                u.active = False
        users.extend(new_users)
        daily[day]["active_users"] = sum(1 for u in users if u.active and u.joined <= day)

    # ---------------------------------------------------------------- results
    pop = [u for u in users]
    base = [u for u in users if u.referred_by is None]
    walled = [u for u in pop if u.first_wall is not None]
    stuck = [u for u in pop if u.stuck > 0]
    # Pay intent at the wall: stuck demand in fields that matter, by persona.
    payers_by_design = {}
    for design, spec in P["paywalls"].items():
        exp = 0.0
        for u in stuck:
            w = PERSONAS[u.persona]["wtp"]
            hit = sum(u.unmet[f] for f in spec["fields"])
            if hit == 0:
                continue
            exp += min(0.9, w * spec["appeal"] * (1 - math.exp(-hit / 4)))
        payers_by_design[design] = exp
    total_adds = sum(sum(u.added.values()) for u in pop) + sum(u.added["new_engagement"] for u in pop) * 3
    total_unlocks = sum(sum(u.spent.values()) for u in pop)
    benchmark_groups = sum(1 for fn, n in rates_on_file.items() if n >= 5)
    def retained(d):
        lo = d - 6
        return sum(1 for u in base if any(lo <= v <= d for v in u.visit_days)) / len(base)
    out = dict(
        users=len(pop), invited=len(pop) - len(base),
        adds=total_adds, unlocks=total_unlocks,
        give_get=total_adds / max(1, total_unlocks),
        earned=sum(u.earned for u in pop), spent=total_unlocks,
        walled_pct=len(walled) / len(pop), stuck_pct=len(stuck) / len(pop),
        first_wall_day=sorted(u.first_wall for u in walled)[len(walled) // 2] if walled else None,
        wall_day1_pct=sum(1 for u in walled if u.first_wall == u.joined) / len(pop),
        retained_d7=retained(7), retained_d30=retained(30), retained_d60=retained(60), retained_d99=retained(99),
        engagements=engagements, rates=sum(rates_on_file.values()) - int(P.get("rate_seed", 0)),
        benchmark_groups=benchmark_groups, open_roles_added=sum(daily[d]["scan_new"] for d in daily),
        field_unlocks=dict(field_unlocks), field_adds=dict(field_adds), field_unmet=dict(field_unmet),
        data_gap=dict(data_gap),
        payers=payers_by_design,
        persona_mix=dict(Counter(u.persona for u in base)),
        persona_walled={k: sum(1 for u in walled if u.persona == k) / max(1, sum(1 for u in pop if u.persona == k)) for k in PERSONAS},
        persona_stuck={k: sum(1 for u in stuck if u.persona == k) / max(1, sum(1 for u in pop if u.persona == k)) for k in PERSONAS},
        persona_ratio={k: (sum(sum(u.added.values()) for u in pop if u.persona == k) + 1) / (sum(sum(u.spent.values()) for u in pop if u.persona == k) + 1) for k in PERSONAS},
        dau=[daily[d]["visits"] for d in range(DAYS)],
        active=[daily[d]["active_users"] for d in range(DAYS)],
        adds_by_day=[daily[d]["adds"] for d in range(DAYS)],
        unlocks_by_day=[daily[d]["unlocks"] for d in range(DAYS)],
        first_walls_by_day=[daily[d]["first_walls"] for d in range(DAYS)],
        open_by_day=[daily[d]["open_roles"] for d in range(DAYS)],
        credits_end=sorted(u.credits for u in pop),
        persona_first_wall={k: (sorted(u.first_wall - u.joined for u in walled if u.persona == k) or [None])[len([u for u in walled if u.persona == k]) // 2] for k in PERSONAS},
        persona_unlocks={k: sum(sum(u.spent.values()) for u in pop if u.persona == k) / max(1, sum(1 for u in pop if u.persona == k)) for k in PERSONAS},
        persona_adds={k: sum(sum(u.added.values()) for u in pop if u.persona == k) / max(1, sum(1 for u in pop if u.persona == k)) for k in PERSONAS},
        stuck_open_role_users=sum(1 for u in stuck if u.unmet["hidden_company"] + u.unmet["posting"] > 0),
        stuck_heavy=sum(1 for u in stuck if sum(u.unmet.values()) >= 10),
        knowledge_left=sum(sum(u.know.values()) for u in pop),
    )
    return out


BASE = dict(
    users=400, starter=25, cap=25, scan_per_week=15, role_life=35, digest=True, digest_boost=1.5,
    reactivate=0.08, invite_mult=1.0, rate_seed=0,
    paywalls={
        "Open-role access (Pro)": dict(fields=["hidden_company", "posting", "role"], appeal=1.0),
        "Contacts and intros (Pro)": dict(fields=["contact", "seat_holder"], appeal=0.7),
        "Rate data (Pro)": dict(fields=["rate", "hours"], appeal=0.6),
        "Credit packs": dict(fields=["hidden_company", "posting", "role", "contact", "seat_holder", "rate", "hours", "sourced", "status", "end"], appeal=0.35),
    },
)

if __name__ == "__main__":
    name = sys.argv[1]
    runs = int(sys.argv[2])
    start = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    over = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
    cfg = {**BASE, **over}
    res = [run(start + i, cfg) for i in range(runs)]
    print(json.dumps(res))
