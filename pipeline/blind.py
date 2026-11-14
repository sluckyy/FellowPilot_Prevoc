"""Strip everything that reveals the answer, so a critic can answer blind.  python3 blind.py rounds/round1/generated/batch-09.json rounds/round1/blind/batch-09.json"""
import json, sys
from pathlib import Path
KEEP = ["item_id", "work_order_id", "stem", "lead_in", "options", "learning_area", "presentation", "context",
        "cognitive_level", "target_difficulty", "pgy_level", "setting", "patient", "clinical_experiences", "domains"]
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
items = json.load(src.open())
dst.parent.mkdir(parents=True, exist_ok=True)
json.dump([{k: it[k] for k in KEEP if k in it} for it in items], dst.open("w"), indent=1)
print(len(items), "blinded ->", dst)
