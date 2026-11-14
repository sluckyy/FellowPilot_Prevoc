"""Run a generation round through the Claude API (for rounds after the pilot's first).

Requires: pip install anthropic ; ANTHROPIC_API_KEY set (or your provider's equivalent).

Usage:
  python3 run_round.py generate --round-dir rounds/round2 --model <model-id> [--prompt prompts/gen-v0.2.md]
  python3 run_round.py critic   --round-dir rounds/round2 --model <model-id> [--prompt prompts/critic-v0.1.md]
  python3 gates.py --round-dir rounds/round2 --bank bank/accepted.json

The generator and critic are separate calls; the critic never sees the key.
Items that fail hard gates can be regenerated with: run_round.py generate --only-failed
"""
import argparse, json, re, sys, time
from pathlib import Path


def client():
    try:
        import anthropic
    except ImportError:
        sys.exit("pip install anthropic")
    return anthropic.Anthropic()


def extract_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON object in response")
    return json.loads(m.group(0))


def call(c, model, system, user, temperature, max_tokens=4000, retries=2):
    for attempt in range(retries + 1):
        try:
            r = c.messages.create(model=model, max_tokens=max_tokens, temperature=temperature,
                                  system=system, messages=[{"role": "user", "content": user}])
            text = "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
            return extract_json(text), r.usage
        except Exception as e:  # noqa: BLE001 - log and retry
            if attempt == retries:
                raise
            time.sleep(2 * (attempt + 1))


def generate(a):
    c = client()
    rd = Path(a.round_dir)
    system = Path(a.prompt or "prompts/gen-v0.1.md").read_text()
    pv = re.search(r"gen-v[\d.]+", system).group(0)
    orders = json.loads((rd / "work_orders.json").read_text())
    if a.only_failed:
        gated = json.loads((rd / "gated_items.json").read_text())
        failed = {g["item"]["work_order_id"]: g["gates"]["hard"] for g in gated if g["gates"]["status"] == "regenerate"}
        orders = [o for o in orders if o["work_order_id"] in failed]
    out_dir = rd / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    batch_id = f"{rd.name}-{int(time.time())}"
    items, usage = [], {"input_tokens": 0, "output_tokens": 0}
    for o in orders:
        extra = ""
        if a.only_failed:
            extra = "\n\nA previous attempt failed these checks; avoid them:\n- " + "\n- ".join(failed[o["work_order_id"]])
        item, u = call(c, a.model, system, "WORK ORDER:\n" + json.dumps(o, indent=2) + extra, temperature=0.8)
        item.setdefault("generation", {}).update({"model": a.model, "prompt_version": pv, "batch_id": batch_id})
        items.append(item)
        usage["input_tokens"] += u.input_tokens
        usage["output_tokens"] += u.output_tokens
        print(o["work_order_id"], "ok")
    (out_dir / f"{batch_id}.json").write_text(json.dumps(items, indent=2))
    print(json.dumps(usage))


def critic(a):
    c = client()
    rd = Path(a.round_dir)
    system = Path(a.prompt or "prompts/critic-v0.1.md").read_text()
    items = [i for f in sorted((rd / "generated").glob("*.json")) for i in json.loads(f.read_text())]
    out = []
    for it in items:
        blind = {k: it[k] for k in ("item_id", "stem", "lead_in", "options", "cognitive_level", "context")}
        res, _ = call(c, a.model, system, "ITEM (key withheld):\n" + json.dumps(blind, indent=2), temperature=0.0, max_tokens=1500)
        res["item_id"] = it["item_id"]
        out.append(res)
        print(it["work_order_id"], res.get("blind_answer"), res.get("overall"))
    (rd / "critic").mkdir(exist_ok=True)
    (rd / "critic" / f"critic-{int(time.time())}.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["generate", "critic"])
    ap.add_argument("--round-dir", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--prompt")
    ap.add_argument("--only-failed", action="store_true")
    a = ap.parse_args()
    generate(a) if a.step == "generate" else critic(a)
