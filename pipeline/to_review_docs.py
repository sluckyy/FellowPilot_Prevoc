"""Turn gated items into review-site documents (items/<item_id>).

Usage: python3 to_review_docs.py --round-dir rounds/round1 --out rounds/round1/review_docs.json
Only items with gate status 'to_review' are included.
"""
import argparse, json
from pathlib import Path
from blueprint import LEARNING_AREAS_ALL


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--round-dir", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    gated = json.loads((Path(a.round_dir) / "gated_items.json").read_text())
    docs = []
    for n, g in enumerate(sorted((g for g in gated if g["gates"]["status"] == "to_review"),
                                key=lambda g: g["item"]["work_order_id"])):
        it, gt = g["item"], g["gates"]
        c = gt.get("critic") or {}
        gen = it.get("generation", {})
        docs.append({
            "order": n + 1, "round": 1, "version": it.get("version", 1),
            "item_id": it["item_id"], "work_order_id": it["work_order_id"],
            "learning_area": it["learning_area"], "presentation": it["presentation"],
            "context": it["context"], "cognitive_level": it["cognitive_level"],
            "target_difficulty": it["target_difficulty"], "patient": it["patient"],
            "domains": it.get("domains", []),
            "secondary_areas": [s for s in it.get("secondary_areas", []) if s in LEARNING_AREAS_ALL],
            "topic_tags": [s for s in it.get("secondary_areas", []) if s not in LEARNING_AREAS_ALL],
            "stem": it["stem"], "lead_in": it["lead_in"], "options": it["options"], "key": it["key"],
            "explanations": it["explanations"], "learning_point": it["learning_point"],
            "setting_note": it.get("setting_note", it.get("rural_note", "")), "references": it.get("references", []),
            "pgy_level": it.get("pgy_level", "both"), "clinical_experiences": it.get("clinical_experiences", []),
            "setting": it.get("setting", "any"),
            "plan": it.get("plan", ""),
            "tutor_context": it.get("tutor_context", ""),
            "jurisdiction": it.get("jurisdiction", "national"),
            "uncertainty": gen.get("uncertainty", "none"), "uncertainty_note": gen.get("uncertainty_note", ""),
            "critic": {k: c.get(k) for k in ("blind_answer", "blind_confidence", "blind_reasoning", "notes_for_reviewer", "overall")} if c else None,
            "blind_disagreement": bool(c) and c.get("blind_answer") != it["key"],
            "review_flags": gt["review_flags"], "soft_flags": gt["soft"],
        })
    Path(a.out).write_text(json.dumps(docs, indent=2))
    print(len(docs), "review docs")


if __name__ == "__main__":
    main()
