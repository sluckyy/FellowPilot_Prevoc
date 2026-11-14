"""Turn a Review Desk export into reviews.json for the import workflow.

The Review Desk keeps one registration per reviewer at reviews/<reviewer> and their reviews at
reviews/<reviewer>/items/<item_id>. Given those documents saved as JSON files (one folder per
collection, as the artifact database export writes them), this writes the flat list the importer reads.

Usage:
  python3 pipeline/export_review_desk.py --desk <export folder> --out pipeline/rounds/round1/reviews.json

Most of the time it is simpler to use the desk's own "Download all reviews (CSV)" button and save the
file as pipeline/rounds/<round>/reviews.csv.
"""
import argparse, json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desk", required=True, help="folder containing reviews/<id>.json and reviews/<id>/items/*.json")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = Path(a.desk) / "reviews"
    out = []
    for reg_file in sorted(root.glob("*.json")):
        reg = json.loads(reg_file.read_text())
        reg = reg.get("data", reg)
        rid = reg_file.stem
        for f in sorted((root / rid / "items").glob("*.json")):
            r = json.loads(f.read_text())
            r = r.get("data", r)
            out.append({**r, "reviewer_id": rid, "reviewer_name": reg.get("name", ""), "reviewer_email": reg.get("email", "")})
    Path(a.out).write_text(json.dumps(out, indent=2))
    print(f"{len(out)} reviews from {len(list(root.glob('*.json')))} reviewers")


if __name__ == "__main__":
    main()
