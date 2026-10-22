"""DFD Index scoring engine. One place for weights, band thresholds and metric math.

The page reads WEIGHTS and BANDS from the dataset meta block, so changing them
here and rebuilding changes them everywhere.
"""
import math

WEIGHTS = {"phone": 0.35, "after_hours": 0.25, "digital": 0.25, "findability": 0.15}

# Lower bound for each letter band, composite and pillars alike.
BANDS = [["A", 85], ["B", 70], ["C", 55], ["D", 40], ["F", 0]]

AH_POINTS = {"live": 100, "service": 80, "voicemail": 30, "dead": 0}


def band(score):
    for letter, floor in BANDS:
        if score >= floor:
            return letter
    return "F"


def tth_points(seconds):
    # 0 s = 100, 30 s ~ 70, 2 min ~ 46, 5 min ~ 30, 20 min = 0, on a log scale.
    if seconds <= 1:
        return 100.0
    return max(0.0, 100.0 * (1 - math.log(seconds) / math.log(1200)))


def phone_score(r):
    ivr_pts = max(0.0, 100 - 22 * max(0, r["ivr_layers"] - 1))
    abandon_pts = max(0.0, 100 * (1 - r["abandon_rate"] / 0.30))
    return (0.40 * 100 * r["answer_rate"] + 0.35 * tth_points(r["time_to_human_s"])
            + 0.15 * ivr_pts + 0.10 * abandon_pts)


def after_hours_score(r):
    return 0.75 * AH_POINTS[r["ah_outcome"]] + 0.25 * (100 if r["ah_urgent_path"] else 0)


def digital_score(r):
    return (35 * r["online_booking"] + 20 * r["patient_portal"] + 15 * r["request_forms"]
            + 15 * r["next_available_visible"] + 15 * r["click_to_call"])


def wcag_points(violations):
    # 0 serious/critical issues = 100, 10 ~ 50, 30+ = 0.
    return max(0.0, 100 - 5 * violations) if violations <= 10 else max(0.0, 50 - 2.5 * (violations - 10))


def findability_score(r):
    return (30 * r["number_within_2_clicks"] + 20 * r["hours_within_2_clicks"]
            + 20 * r["mobile_responsive"] + 0.30 * wcag_points(r["wcag_violations"]))


def score_record(r):
    pillars = {
        "phone": phone_score(r),
        "after_hours": after_hours_score(r),
        "digital": digital_score(r),
        "findability": findability_score(r),
    }
    out = {}
    for k, v in pillars.items():
        out[f"{k}_score"] = round(v, 1)
        out[f"{k}_band"] = band(v)
    composite = sum(WEIGHTS[k] * v for k, v in pillars.items())
    out["dfd_score"] = round(composite, 1)
    out["dfd_band"] = band(composite)
    return out
