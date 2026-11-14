# FellowPilot Prevocational — question generation pipeline

Adapted from MCQ Coach's pipeline for the prevocational track: 250 items in round 1 across 20 junior-doctor learning areas, tagged to the AMC outcome statements.

## Layout

| Path | What it is |
| --- | --- |
| `blueprint.py` | Learning-area allocation, presentation lists, outcome-statement and clinical-experience defaults, context/cognitive/difficulty/setting/PGY shares |
| `make_work_orders.py` | Turns the blueprint into one round of work orders |
| `prompts/gen-prevoc-v0.1.md` | Generator prompt (versioned; the version is stored on every item). `gen-v0.*` are MCQ Coach's |
| `prompts/critic-prevoc-v0.1.md` | Blind critic prompt (never sees the key); adds level-fit and cultural-safety checks |
| `run_round.py` | Runs generator and critic through the Claude API on your own key (round 1 used in-session agents instead) |
| `gates.py` | Automated quality gates; writes `gated_items.json` and `gate_report.json` |
| `to_review_docs.py` | Converts gated items into review-site documents |
| `review-site/review.html` | The clinician review page (published as a claude.ai artifact) |
| `release_round.sh` | Gates, review docs, then the beta release as a migration plus the browser-test fixture |
| `rounds/roundN/` | Work orders (and `batches/` for agents), generated items, critic results, gate outputs, review docs |

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

Round 1 (250 items) was generated in the build session: ten generator agents, one per `batches/batch-NN.json`,
then ten blind critic agents, using `gen-prevoc-v0.1` and `critic-prevoc-v0.1`. `release_round.sh 1 008` then
wrote `db/migrations/008_round1_beta_items.sql`. Later rounds can use `run_round.py` with an API key.
