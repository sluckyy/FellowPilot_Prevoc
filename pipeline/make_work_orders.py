"""Create a round of work orders from the prevocational blueprint.

Usage: python3 make_work_orders.py --round 1 --n 250 --seed 1 --out rounds/round1/work_orders.json
"""
import argparse, json, math, random, uuid
from collections import Counter
from pathlib import Path
from blueprint import (ALLOCATION, PRESENTATIONS, CONTEXT_SHARE, COGNITIVE_SHARE, DIFFICULTY_SHARE, SETTING_SHARE,
                       PGY_SHARE, CONTEXT_LEAN, OUTCOME_DEFAULTS, EXPERIENCE_DEFAULTS, PRESENTATION_AGES)

# Where the case happens, grouped by context and setting so they never contradict each other.
HOSPITALS = {
    "rural": [
        "a 30-bed regional hospital in South Australia's Mid North, 2 hours by road from Adelaide, with a visiting surgeon and physician and specialist advice by phone",
        "a rural hospital on the Yorke Peninsula with a 4-bed emergency department staffed overnight by one junior doctor with the GP on call",
        "a regional hospital with a small ICU-free medical ward, on-site CT during business hours only and retrieval to Adelaide by road or air",
        "a country hospital 90 minutes from the nearest tertiary centre, where the junior doctor covers the ward and emergency department overnight",
    ],
    "metro": [
        "a tertiary hospital in Adelaide",
        "a large metropolitan teaching hospital with on-site intensive care, interventional cardiology and 24-hour imaging",
        "a metropolitan general hospital with a busy medical ward and a registrar on site overnight",
    ],
}
PLACES = {
    "ward": ["on the medical ward of", "on the surgical ward of", "on the general ward of"],
    "ed": ["in the emergency department of"],
    "clinic": ["in the outpatient clinic of", "in a general practice linked to"],
    "theatre": ["in the pre-admission clinic and theatre suite of", "in the recovery and surgical ward area of"],
    "after_hours": ["covering the wards overnight at", "on an evening cover shift at"],
    "rural": ["at"],
    "telehealth": ["on a telehealth call from"],
}


def largest_remainder(total, weights):
    s = sum(weights.values())
    raw = {k: total * v / s for k, v in weights.items()}
    out = {k: math.floor(x) for k, x in raw.items()}
    for k in sorted(raw, key=lambda k: -(raw[k] - out[k]))[: total - sum(out.values())]:
        out[k] += 1
    return out


def area_counts(n, floor):
    rest = n - floor * len(ALLOCATION)
    extra = largest_remainder(rest, ALLOCATION)
    return {k: floor + extra[k] for k in ALLOCATION}


def patient_for(area, rng, presentation=None):
    if presentation in PRESENTATION_AGES:
        age = rng.choice(PRESENTATION_AGES[presentation])
    elif area == "Paediatrics":
        age = rng.choice(["0-1", "1-4", "5-12", "13-17"])
    elif area == "Obstetrics and women's health":
        age = rng.choice(["16-24", "25-44", "25-44", "45-64"])
    elif area in ("Older people, delirium and falls", "Palliative care and goals of care"):
        age = rng.choice(["65-74", "75-84", "85+"])
    else:
        age = rng.choice(["16-24", "25-44", "25-44", "45-64", "45-64", "65-74", "75-84"])
    sex = "female" if area == "Obstetrics and women's health" else rng.choice(["female", "male"])
    return {"age_band": age, "sex": sex}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--round", type=int, required=True)
    ap.add_argument("--n", type=int, default=250)
    ap.add_argument("--floor", type=int, default=2)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    rng = random.Random(a.seed)

    counts = area_counts(a.n, a.floor)
    slots = []
    for area, c in counts.items():
        pres = PRESENTATIONS[area][:]
        rng.shuffle(pres)
        for i in range(c):
            slots.append({"learning_area": area, "presentation": pres[i % len(pres)]})

    def quota_pool(shares):
        q = largest_remainder(a.n, shares)
        pool = [k for k, v in q.items() for _ in range(v)]
        rng.shuffle(pool)
        return pool

    contexts = quota_pool(CONTEXT_SHARE)
    cognitive = quota_pool(COGNITIVE_SHARE)
    difficulty = quota_pool(DIFFICULTY_SHARE)
    settings = quota_pool(SETTING_SHARE)
    pgy = quota_pool(PGY_SHARE)

    rng.shuffle(slots)
    slots.sort(key=lambda s: 0 if s["learning_area"] in CONTEXT_LEAN else 1)
    for s in slots:
        lean = CONTEXT_LEAN.get(s["learning_area"], [])
        pick = next((c for c in contexts if c in lean), contexts[0])
        contexts.remove(pick)
        s["context"] = pick
    rng.shuffle(slots)
    for s in slots:
        s["cognitive_level"] = cognitive.pop()
        s["target_difficulty"] = difficulty.pop()
        s["setting"] = "rural" if s["context"] == "rural" else settings.pop()
        s["pgy_level"] = pgy.pop()
    # The rural context consumed settings unevenly; that is fine, the share is a target not a rule.

    # Every area gets at least one prioritisation item where the round allows.
    for area in counts:
        mine = [s for s in slots if s["learning_area"] == area]
        if not any(s["cognitive_level"] == "prioritisation" for s in mine):
            donors = [s for s in slots if s["cognitive_level"] == "prioritisation"
                      and sum(1 for t in slots if t["learning_area"] == s["learning_area"] and t["cognitive_level"] == "prioritisation") > 1]
            if donors:
                d = donors[0]
                d["cognitive_level"], mine[0]["cognitive_level"] = mine[0]["cognitive_level"], "prioritisation"

    # Patients: at least 12% Aboriginal or Torres Strait Islander, all items in that area included.
    n_indig = math.ceil(0.12 * a.n)
    atsi = [s for s in slots if s["learning_area"] == "Aboriginal and Torres Strait Islander health"]
    skip = ("Patient safety, quality and systems", "Doctor wellbeing, teamwork and workload", "Professionalism, ethics and law")
    others = [s for s in slots if s not in atsi and s["learning_area"] not in skip]
    rng.shuffle(others)
    indig = set(id(s) for s in atsi + others[: max(0, n_indig - len(atsi))])

    orders = []
    for i, s in enumerate(sorted(slots, key=lambda s: (s["learning_area"], s["presentation"]))):
        p = patient_for(s["learning_area"], rng, s["presentation"])
        p["indigenous"] = id(s) in indig
        hospital = rng.choice(HOSPITALS["rural" if s["setting"] == "rural" else "metro"] if s["setting"] != "any" else HOSPITALS["rural"] + HOSPITALS["metro"])
        place = rng.choice(PLACES[s["context"]])
        orders.append({
            "work_order_id": f"r{a.round}-{i + 1:03d}",
            "round": a.round,
            "item_id": str(uuid.UUID(int=rng.getrandbits(128))),
            "learning_area": s["learning_area"],
            "presentation": s["presentation"],
            "context": s["context"],
            "cognitive_level": s["cognitive_level"],
            "target_difficulty": s["target_difficulty"],
            "pgy_level": s["pgy_level"],
            "setting": s["setting"],
            "outcomes_hint": OUTCOME_DEFAULTS[s["learning_area"]],
            "experiences_hint": EXPERIENCE_DEFAULTS[s["learning_area"]],
            "patient": p,
            "scene": f"{place} {hospital}",
            "calibration_core": True,
        })

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(orders, indent=2))
    print("areas", len(counts), "orders", len(orders))
    for f in ("context", "cognitive_level", "target_difficulty", "setting", "pgy_level"):
        print(f, dict(Counter(o[f] for o in orders)))
    print("indigenous", sum(o["patient"]["indigenous"] for o in orders))


if __name__ == "__main__":
    main()
