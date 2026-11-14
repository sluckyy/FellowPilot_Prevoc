"""Confirm a trimmed batch changed only option text (and, at most, explanation wording) against the committed version.
python3 -I verify_trim.py 10"""
import json, subprocess, sys
b = sys.argv[1]
path = f'rounds/round1/generated/batch-{b}.json'
old = {i['work_order_id']: i for i in json.loads(subprocess.run(['git', 'show', f'HEAD:pipeline/{path}'], capture_output=True, text=True, check=True).stdout)}
new = {i['work_order_id']: i for i in json.load(open(path))}
assert old.keys() == new.keys(), 'work orders differ'
edited, problems = 0, []
for k, n in new.items():
    o = old[k]
    changed = [f for f in set(o) | set(n) if json.dumps(o.get(f), sort_keys=True) != json.dumps(n.get(f), sort_keys=True)]
    if changed: edited += 1
    bad = [f for f in changed if f not in ('options', 'explanations')]
    if bad: problems.append((k, bad))
    if [x['id'] for x in n['options']] != ['A', 'B', 'C', 'D'] or n['key'] != o['key']: problems.append((k, 'key or option ids'))
print(f'batch-{b}: {edited} items edited; problems: {problems or "none"}')
