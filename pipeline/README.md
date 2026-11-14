# MCQ Coach — question generation pipeline

Implements the Question Generation Spec (500-item pilot) for the MCQ Coach project.

## Layout

| Path | What it is |
| --- | --- |
| `blueprint.py` | Learning-area allocation, presentation lists, context/cognitive/difficulty shares |
| `make_work_orders.py` | Turns the blueprint into one round of work orders |
| `prompts/gen-v0.1.md` | Generator prompt (versioned; the version is stored on every item) |
| `prompts/critic-v0.1.md` | Blind critic prompt (never sees the key) |
| `run_round.py` | Runs generator and critic through the Claude API on your own key |
| `gates.py` | Automated quality gates; writes `gated_items.json` and `gate_report.json` |
| `to_review_docs.py` | Converts gated items into review-site documents |
| `review-site/review.html` | The clinician review page (published as a claude.ai artifact) |
| `rounds/roundN/` | Work orders, generated items, critic results, gate outputs, review docs |

## Running a round

```bash
python3 make_work_orders.py --round 2 --n 100 --seed 2 --out rounds/round2/work_orders.json
python3 run_round.py generate --round-dir rounds/round2 --model <model-id>
python3 run_round.py critic   --round-dir rounds/round2 --model <model-id>
python3 gates.py --round-dir rounds/round2 --bank bank/accepted.json
python3 run_round.py generate --round-dir rounds/round2 --model <model-id> --only-failed   # one retry
python3 run_round.py critic   --round-dir rounds/round2 --model <model-id>
python3 gates.py --round-dir rounds/round2 --bank bank/accepted.json
python3 to_review_docs.py --round-dir rounds/round2 --out rounds/round2/review_docs.json
```

Then load `review_docs.json` into the review site's `items` collection.

## Review site

- Reviewers are invited from the page's Share menu by email at **Editor** level (outside-organisation
  reviewers can only save their reviews at that level). Do not also share it by public link.
- On first visit each reviewer registers their name and email; every review is stored against
  their account and that registration.
- Reviews live at `reviews/<reviewer>/items/<item_id>`. Reviewers cannot see each other's reviews;
  the owner sees all of them under "Reviewers and results" and can download a CSV.
- A "No" on the key or a "Major issue" on accuracy forces a reject.

## Round 1

Round 1 was generated in the build session (generator and blind critic run as separate agents)
using `gen-v0.1` and `critic-v0.1`; later rounds use `run_round.py`.
