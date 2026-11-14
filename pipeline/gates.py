"""Automated quality gates for generated prevocational items.

Usage:
  python3 gates.py --round-dir rounds/round1 [--bank existing_items.json]

Reads  <round-dir>/work_orders.json, <round-dir>/generated/*.json, <round-dir>/retry/*.json (optional),
       <round-dir>/critic/*.json (optional)
Writes <round-dir>/gated_items.json  (items + gate results)
       <round-dir>/gate_report.json  (summary)
"""
import argparse, json, re
from collections import Counter
from pathlib import Path
from blueprint import ALLOCATION, LEARNING_AREAS_ALL, OUTCOME_CODES

CONTEXTS = {"ward", "ed", "clinic", "theatre", "after_hours", "rural", "telehealth"}
LEVELS = {"recall", "interpretation", "management", "prioritisation"}
EXPERIENCES = {"A", "B", "C", "D"}
PGY = {"PGY1", "PGY2", "both"}
SETTINGS = {"rural", "metro", "any"}
SOURCES = {"etg", "amh", "immunisation_handbook", "acsqhc", "sa_health", "mba", "amc", "anzcor", "carpa", "red_book", "other"}
REQUIRED = ["work_order_id", "item_id", "version", "stem", "lead_in", "options", "key", "explanations",
            "learning_point", "learning_area", "domains", "presentation", "context", "cognitive_level",
            "patient", "target_difficulty", "pgy_level", "clinical_experiences", "setting", "references",
            "tutor_context", "generation"]
ABSOLUTES = re.compile(r"\b(always|never|only|all|none|must)\b", re.I)
DUP_THRESHOLD = 0.45


def words(t):
    return re.findall(r"[a-z0-9]+", t.lower())


def shingles(t, k=3):
    w = words(t)
    return {" ".join(w[i:i + k]) for i in range(max(0, len(w) - k + 1))}


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def check(item, wo):
    hard, soft = [], []
    for f in REQUIRED:
        if f not in item or item[f] in (None, "", [], {}):
            hard.append(f"schema: missing {f}")
    if hard:
        return hard, soft
    opts = item["options"]
    ids = [o.get("id") for o in opts]
    if ids != ["A", "B", "C", "D"]:
        hard.append("schema: options must be A-D")
    if item["key"] not in ("A", "B", "C", "D"):
        hard.append("schema: key invalid")
    if set(item["explanations"].keys()) != {"A", "B", "C", "D"}:
        hard.append("schema: explanation per option required")
    if item["context"] not in CONTEXTS:
        hard.append("schema: context value")
    if item["cognitive_level"] not in LEVELS:
        hard.append("schema: cognitive_level value")
    if not (1 <= len(item["domains"]) <= 3) or not set(item["domains"]) <= set(OUTCOME_CODES):
        hard.append("schema: domains must be 1-3 outcome statement codes")
    if not (1 <= len(item["clinical_experiences"]) <= 2) or not set(item["clinical_experiences"]) <= EXPERIENCES:
        hard.append("schema: clinical_experiences must be 1-2 of A-D")
    if item["pgy_level"] not in PGY:
        hard.append("schema: pgy_level value")
    if item["setting"] not in SETTINGS:
        hard.append("schema: setting value")
    if item["learning_area"] not in ALLOCATION:
        hard.append("schema: learning_area")
    for s in item.get("secondary_areas", []):
        if s not in LEARNING_AREAS_ALL:
            soft.append(f"schema: unknown secondary area '{s}'")
    if not any(r.get("source") in SOURCES and r.get("title") for r in item["references"]):
        hard.append("reference: none valid")

    n = len(words(item["stem"]))
    if not 50 <= n <= 180:
        hard.append(f"format: stem {n} words (50-180)")
    if not item["lead_in"].strip().endswith("?"):
        hard.append("format: lead-in must end with ?")
    if re.search(r"\b(NOT|EXCEPT)\b", item["lead_in"]):
        hard.append("format: negative lead-in")
    if any(re.search(r"(all|none) of the above", o["text"], re.I) for o in opts):
        hard.append("format: all/none of the above")
    for field in ("learning_point", "setting_note"):
        if re.search(r"\b(option|answer)\s*\(?[A-D]\)?\b|\([A-D]\)", item.get(field, "") or ""):
            hard.append(f"format: {field} refers to an option letter")
    for k, e in item["explanations"].items():
        if re.search(r"\b(option|answer|choice)\s*\(?[A-D]\)?\b|\([A-D]\)", e):
            hard.append(f"format: explanation {k} refers to an option letter")
            break

    for f in ("learning_area", "presentation", "context", "cognitive_level", "target_difficulty", "pgy_level", "setting"):
        if item.get(f) != wo.get(f):
            hard.append(f"blueprint: {f} differs from work order")
    p, q = item.get("patient", {}), wo["patient"]
    if p.get("indigenous") != q["indigenous"] or p.get("sex") != q["sex"]:
        hard.append("blueprint: patient spec differs")

    lens = {o["id"]: len(o["text"]) for o in opts}
    key = item["key"]
    longest = max(lens, key=lens.get)
    if longest == key and lens[key] > 1.3 * sorted(lens.values())[-2]:
        soft.append("cueing: key is clearly the longest option")
    stem_w = set(words(item["stem"] + " " + item["lead_in"])) - {"the", "a", "an", "of", "to", "and", "in", "with", "for", "on", "or", "is", "at"}
    overlap = {o["id"]: len(set(words(o["text"])) & stem_w) for o in opts}
    if overlap[key] >= 3 and all(v == 0 for k, v in overlap.items() if k != key):
        soft.append("cueing: only the key repeats stem words")
    for o in opts:
        if o["id"] != key and ABSOLUTES.search(o["text"]):
            soft.append(f"cueing: absolute term in distractor {o['id']}")
    if item["generation"].get("uncertainty") == "major":
        soft.append("uncertainty: generator marked major - " + item["generation"].get("uncertainty_note", ""))
    return hard, soft


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--round-dir", required=True)
    ap.add_argument("--bank", help="JSON array of existing accepted items for duplicate checks")
    a = ap.parse_args()
    rd = Path(a.round_dir)
    wos = {w["work_order_id"]: w for w in json.loads((rd / "work_orders.json").read_text())}
    by_wo = {}
    for f in sorted((rd / "generated").glob("*.json")):
        for it in json.loads(f.read_text()):
            by_wo[it["work_order_id"]] = it
    retried = set()
    for f in sorted((rd / "retry").glob("*.json")) if (rd / "retry").exists() else []:
        for it in json.loads(f.read_text()):
            by_wo[it["work_order_id"]] = it
            retried.add(it["work_order_id"])
    items = [by_wo[k] for k in sorted(by_wo)]
    critic = {}
    for f in sorted((rd / "critic").glob("*.json")) if (rd / "critic").exists() else []:
        for c in json.loads(f.read_text()):
            critic[c["item_id"]] = c
    bank = json.loads(Path(a.bank).read_text()) if a.bank else []
    bank_sh = [(b["item_id"], shingles(b["stem"])) for b in bank]

    out, seen = [], []
    for it in items:
        wo = wos.get(it.get("work_order_id"))
        if not wo:
            continue
        hard, soft = check(it, wo)
        sh = shingles(it.get("stem", ""))
        for oid, osh in bank_sh + seen:
            j = jaccard(sh, osh)
            if j >= DUP_THRESHOLD:
                hard.append(f"duplicate: similar to {oid} (J={j:.2f})")
        seen.append((it["item_id"], sh))
        c = critic.get(it["item_id"])
        review_flags = []
        if c:
            if c.get("blind_answer") != it.get("key"):
                review_flags.append(f"blind answer {c.get('blind_answer')} differs from key {it.get('key')}: {c.get('blind_reasoning', '')}")
            if c.get("second_defensible", {}).get("flag"):
                hard.append(f"single-best: {c['second_defensible'].get('option')} defensible - {c['second_defensible'].get('why', '')}")
            if c.get("accuracy", {}).get("flag"):
                review_flags.append("accuracy concern: " + c["accuracy"].get("why", ""))
            if c.get("clarity", {}).get("flag"):
                soft.append("clarity: " + c["clarity"].get("why", ""))
            if c.get("cueing", {}).get("flag"):
                soft.append("cueing (critic): " + c["cueing"].get("why", ""))
            if c.get("level_fit", {}).get("flag"):
                review_flags.append("level fit: " + c["level_fit"].get("why", ""))
            if c.get("cultural_safety", {}).get("flag"):
                review_flags.append("cultural safety: " + c["cultural_safety"].get("why", ""))
            dp = c.get("distractor_plausibility", {})
            weak = [k for k, v in dp.items() if k != it.get("key") and v == 1]
            if weak:
                soft.append("weak distractor(s): " + ", ".join(weak))
            if c.get("overall") == "fail":
                hard.append("critic: overall fail - " + c.get("notes_for_reviewer", ""))
        status = ("unfilled" if it["work_order_id"] in retried else "regenerate") if hard else "to_review"
        out.append({"item": it, "gates": {"hard": hard, "soft": soft, "review_flags": review_flags, "critic": c, "status": status}})

    (rd / "gated_items.json").write_text(json.dumps(out, indent=2))
    st = Counter(o["gates"]["status"] for o in out)
    reasons = Counter(h.split(":")[0] for o in out for h in o["gates"]["hard"])
    report = {
        "items": len(out), "status": dict(st), "retried": sorted(retried),
        "hard_fail_reasons": dict(reasons),
        "hard_fails": {o["item"]["work_order_id"]: o["gates"]["hard"] for o in out if o["gates"]["hard"]},
        "soft_flags": dict(Counter(s.split(":")[0] for o in out for s in o["gates"]["soft"])),
        "blind_disagreements": sum(1 for o in out if any(f.startswith("blind") for f in o["gates"]["review_flags"])),
        "key_positions": dict(Counter(o["item"].get("key") for o in out)),
        "uncertainty_major": [o["item"]["work_order_id"] for o in out if o["item"].get("generation", {}).get("uncertainty") == "major"],
        "missing_work_orders": sorted(set(wos) - {o["item"]["work_order_id"] for o in out}),
    }
    (rd / "gate_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "hard_fails"}, indent=2))


if __name__ == "__main__":
    main()
