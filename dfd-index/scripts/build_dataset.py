"""Build the DFD Index concept dataset.

Every system record is SYNTHETIC. Size, state, type and rurality are shaped on
the real sample frame (the Lookalike-Scored national list plus the OR, PA, ME
and AZ Rural Rounds lists), but names are invented and no record maps to a real
organisation. The only measured figures in the project are the Oregon statewide
aggregates in OREGON_MEASURED, which the page shows as aggregates only.

Usage:
  python3 build_dataset.py <lookalike_all_systems.csv> <out_dir>

Re-running with the same SEED and frame yields the same dataset.
"""
import csv
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path

SEED = 20261022
TARGET_RECORDS = 1800

sys.path.insert(0, str(Path(__file__).parent))
from scoring import score_record, band, WEIGHTS, BANDS  # noqa: E402

# Statewide aggregates from "Digital Front Door: Oregon Patient Access
# Benchmark 2026" (calls placed 2026-09-21). Measured, not modeled.
OREGON_MEASURED = {
    "provenance": "measured",
    "measured_at": "2026-09-21",
    "organizations": 25,
    "clinic_lines": 575,
    "calls": 634,
    "calls_reached_person": 338,
    "median_wait_s": 58,
    "mean_wait_s": 120,
    "share_answered_over_2min": 0.25,
    "share_answered_over_5min": 0.10,
    "answered_over_10min": 13,
    "longest_answered_wait_s": 1189,
    "calls_hit_20min_cap": 112,
    "lines_full_20min_queue": 38,
    "lines_hold_then_disconnect": 24,
    "lines_hold_then_nobody_available": 6,
    "lines_dialed_both_windows": 64,
}

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

# States that skew rural get extra top-up FQHC / rural records, since the
# audience is rural systems and FQHCs with 5+ locations.
RURAL_HEAVY = {"AK", "AR", "IA", "ID", "KS", "KY", "ME", "MS", "MT", "ND", "NE", "NM",
               "OK", "OR", "SD", "VT", "WV", "WY", "AL", "MO", "TN", "SC"}

NAME_A = ["Amber", "Lark", "Fern", "Copper", "Silver", "Elk", "Heron", "Juniper", "Alder",
          "Bramble", "Cinder", "Thistle", "Quail", "Sable", "Wren", "Marten", "Osprey",
          "Hazel", "Linden", "Sorrel", "Tamarack", "Kestrel", "Bitter", "Granite", "Cobalt",
          "Larch", "Russet", "Tansy", "Yarrow", "Basalt", "Saddle", "Lantern", "Harrow",
          "Teal", "Dunmore", "Ashby", "Corwin", "Halvor", "Merritt", "Pell"]
NAME_B = ["field", "brook", "ridge", "vale", "crest", "haven", "mere", "wood", "ford",
          "hollow", "bend", "run", "springs", "gate", "moor", "fall", "point", "reach"]
SUFFIX = {
    "Rural health system": ["Regional Health", "Health System", "Valley Health", "Health Partners"],
    "FQHC": ["Community Health Center", "Family Health Centers", "Community Clinics",
             "Health Collaborative"],
    "Community hospital": ["Memorial Hospital", "Community Hospital", "Medical Center"],
    "Multi-specialty group": ["Medical Group", "Physicians Group", "Clinic Network",
                              "Specialty Partners"],
}
EHRS = ["Epic", "Oracle Health", "MEDITECH", "athenaOne", "eClinicalWorks", "NextGen",
        "TruBridge", "Altera"]


def num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def load_frame(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            st = (r.get("State") or "").strip()
            if st not in STATE_NAMES:
                continue
            providers = num(r.get("Providers"))
            hospitals = num(r.get("Hospitals"))
            rhcs = num(r.get("Rural Health Clinics"))
            rural = num(r.get("Rural Presence (/2)"))
            integ = r.get("Integration Level") or ""
            rows.append({"state": st, "providers": providers, "hospitals": hospitals,
                         "rhcs": rhcs, "rural": rural, "integ": integ})
    return rows


def type_for(frame_row, rng):
    if frame_row["hospitals"] <= 1 and frame_row["providers"] < 150:
        return "Community hospital"
    if "System II " in frame_row["integ"] and rng.random() < 0.35:
        return "Multi-specialty group"
    if frame_row["rural"] >= 1:
        return "Rural health system"
    return rng.choice(["Rural health system", "Community hospital", "Multi-specialty group"])


def rurality_for(rural_score, rng):
    if rural_score >= 2:
        return "Rural"
    if rural_score >= 1:
        return "Micropolitan"
    return "Rural" if rng.random() < 0.12 else ("Micropolitan" if rng.random() < 0.3 else "Metro")


def shape_from_frame(fr, rng):
    """Turn a real frame row into a jittered size/type/rurality shape."""
    stype = type_for(fr, rng)
    loc = fr["hospitals"] + fr["rhcs"] + fr["providers"] / 28
    loc = clamp(round(loc * rng.uniform(0.75, 1.3)), 3, 150)
    prov = clamp(round(max(fr["providers"], loc * 3) * rng.uniform(0.8, 1.25)), 8, 4000)
    return stype, int(loc), int(prov), rurality_for(fr["rural"], rng)


def shape_topup(state, rng):
    """Top-up records: rural systems and FQHCs with 5+ locations."""
    stype = "FQHC" if rng.random() < 0.6 else "Rural health system"
    loc = int(clamp(round(rng.lognormvariate(math.log(9), 0.55)), 5, 60))
    prov = int(clamp(round(loc * rng.uniform(2.5, 6)), 10, 400))
    rur = "Rural" if rng.random() < 0.65 else ("Micropolitan" if rng.random() < 0.7 else "Metro")
    return stype, loc, prov, rur


def size_band(loc):
    if loc < 5:
        return "1-4"
    if loc < 10:
        return "5-9"
    if loc < 25:
        return "10-24"
    if loc < 50:
        return "25-49"
    return "50+"


def gen_metrics(stype, loc, rur, state, rng):
    """Correlated access metrics from one latent 'access maturity' factor."""
    m = rng.gauss(0, 1)
    big = math.log(loc) / math.log(150)            # 0..1
    rural = {"Rural": 1.0, "Micropolitan": 0.5, "Metro": 0.0}[rur]
    fqhc = 1.0 if stype == "FQHC" else 0.0

    # Phone. Bigger systems centralise into IVR menus; deep menus mean longer waits.
    ivr = clamp(round(0.6 + 2.6 * big - 0.5 * rural - 0.45 * m + rng.gauss(0, 0.7)), 0, 5)
    log_tth = math.log(58) + 0.32 * (ivr - 1.5) - 0.35 * m + 0.15 * fqhc + rng.gauss(0, 0.75)
    tth = int(clamp(round(math.exp(log_tth)), 1, 1200))
    if rng.random() < 0.04:                          # genuine outliers both ways
        tth = int(rng.choice([rng.uniform(1, 4), rng.uniform(600, 1200)]))
    ans = clamp(0.53 + 0.12 * m - 0.03 * (ivr - 1.5) - 0.05 * (math.log(tth) - math.log(58))
                + 0.04 * rural + rng.gauss(0, 0.10), 0.05, 1.0)
    if state == "OR":  # nudge toward the measured Oregon aggregate
        ans = clamp(ans - 0.05, 0.05, 1.0)
        tth = int(clamp(round(tth * 1.15), 1, 1200))
    abandon = clamp(0.05 + 0.04 * (math.log(tth) - math.log(58)) - 0.02 * m + rng.gauss(0, 0.03),
                    0.0, 0.45)

    # After hours.
    p_live = clamp(0.10 + 0.08 * m + 0.06 * big, 0.02, 0.4)
    p_service = clamp(0.38 + 0.10 * m - 0.05 * fqhc, 0.1, 0.7)
    p_dead = clamp(0.08 - 0.04 * m + 0.03 * fqhc, 0.01, 0.25)
    u = rng.random()
    if u < p_live:
        ah = "live"
    elif u < p_live + p_service:
        ah = "service"
    elif u < 1 - p_dead:
        ah = "voicemail"
    else:
        ah = "dead"
    urgent = ah in ("live", "service") or rng.random() < clamp(0.35 + 0.15 * m, 0.05, 0.8)
    if ah == "dead":
        urgent = False

    # Digital self-service. Rural and FQHC sites lag; size and maturity help.
    def p(base):
        return rng.random() < clamp(base, 0.02, 0.98)
    booking = p(0.28 + 0.14 * m + 0.20 * big - 0.10 * rural - 0.08 * fqhc)
    portal = p(0.82 + 0.06 * m + 0.08 * big - 0.05 * fqhc)
    forms = p(0.55 + 0.12 * m - 0.05 * rural)
    next_avail = booking and p(0.30 + 0.10 * m)
    c2c = p(0.66 + 0.10 * m - 0.05 * rural)

    # Findability and accessibility.
    num2 = p(0.74 + 0.10 * m)
    hours2 = p(0.60 + 0.12 * m - 0.06 * big)
    mobile = p(0.84 + 0.07 * m)
    wcag_v = int(clamp(round(rng.lognormvariate(math.log(9), 0.7) * math.exp(-0.25 * m)), 0, 80))

    return {
        "answer_rate": round(ans, 3),
        "time_to_human_s": tth,
        "ivr_layers": int(ivr),
        "abandon_rate": round(abandon, 3),
        "ah_outcome": ah,
        "ah_urgent_path": bool(urgent),
        "online_booking": bool(booking),
        "patient_portal": bool(portal),
        "request_forms": bool(forms),
        "next_available_visible": bool(next_avail),
        "click_to_call": bool(c2c),
        "number_within_2_clicks": bool(num2),
        "hours_within_2_clicks": bool(hours2),
        "mobile_responsive": bool(mobile),
        "wcag_violations": wcag_v,
    }


def invented_name(stype, used, rng):
    for _ in range(500):
        place = rng.choice(NAME_A) + rng.choice(NAME_B)
        name = f"{place} {rng.choice(SUFFIX[stype])}"
        if name not in used:
            used.add(name)
            return name, place
    raise RuntimeError("name space exhausted")


def build(frame_path, out_dir):
    rng = random.Random(SEED)
    frame = load_frame(frame_path)
    records, used = [], set()

    state_counts = defaultdict(int)
    for fr in frame:
        state_counts[fr["state"]] += 1

    shapes = [(fr["state"],) + shape_from_frame(fr, rng) for fr in frame]
    # Top up toward TARGET_RECORDS, weighted to rural-heavy states, and make
    # sure every state has at least 12 records so state views aren't empty.
    for st in STATE_NAMES:
        while sum(1 for s in shapes if s[0] == st) < 12:
            shapes.append((st,) + shape_topup(st, rng))
    weights = {st: (3.0 if st in RURAL_HEAVY else 1.0) * (1 + state_counts[st] ** 0.5)
               for st in STATE_NAMES}
    states, w = zip(*weights.items())
    while len(shapes) < TARGET_RECORDS:
        st = rng.choices(states, w)[0]
        shapes.append((st,) + shape_topup(st, rng))

    for i, (st, stype, loc, prov, rur) in enumerate(shapes):
        name, place = invented_name(stype, used, rng)
        rec = {
            "system_id": f"dfd-{i + 1:04d}",
            "system_name": name,
            "state": st,
            "city": place,
            "system_type": stype,
            "location_count": loc,
            "provider_count": prov,
            "size_band": size_band(loc),
            "rurality": rur,
            "ehr": rng.choice(EHRS) if rng.random() < 0.7 else None,
        }
        rec.update(gen_metrics(stype, loc, rur, st, rng))
        rec.update(score_record(rec))
        rec["provenance"] = "synthetic"
        rec["measured_at"] = None
        records.append(rec)

    rank(records)
    write(records, out_dir)
    return records


def rank(records):
    def assign(group, key):
        ordered = sorted(group, key=lambda r: (-r["dfd_score"], r["system_id"]))
        for i, r in enumerate(ordered, 1):
            r[key] = i
    assign(records, "national_rank")
    by_state, by_cohort = defaultdict(list), defaultdict(list)
    for r in records:
        by_state[r["state"]].append(r)
        r["cohort"] = f'{r["system_type"]}|{r["size_band"]}|{r["rurality"]}'
        by_cohort[r["cohort"]].append(r)
    for g in by_state.values():
        assign(g, "state_rank")
    for g in by_cohort.values():
        assign(g, "cohort_rank")
        for r in g:
            r["cohort_size"] = len(g)


def write(records, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    meta = {
        "title": "Clarus Digital Front Door Index (concept build)",
        "seed": SEED,
        "record_count": len(records),
        "notice": "All system records are synthetic, with invented names. The Oregon "
                  "block holds measured statewide aggregates only.",
        "weights": WEIGHTS,
        "bands": BANDS,
        "state_names": STATE_NAMES,
        "oregon_measured": OREGON_MEASURED,
    }
    (out / "dfd_index.json").write_text(json.dumps({"meta": meta, "systems": records}, indent=1))
    fields = list(records[0].keys())
    with open(out / "dfd_index.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(records)
    # Compact column-major form for the page.
    cols = {k: [r[k] for r in records] for k in fields}
    (out / "dfd_index.js").write_text(
        "window.DFD_DATA=" + json.dumps({"meta": meta, "cols": cols}, separators=(",", ":")) + ";\n")


if __name__ == "__main__":
    recs = build(sys.argv[1], sys.argv[2])
    print(f"{len(recs)} records written to {sys.argv[2]}")
