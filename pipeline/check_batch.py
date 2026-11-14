"""Check one generated batch against the hard gates and report length cueing.  python3 -I check_batch.py rounds/round1/generated/batch-01.json"""
import json, sys
sys.path.insert(0, __import__('os').path.dirname(__file__) or '.')
from gates import check
path = sys.argv[1]
items = json.load(open(path))
wos = {w['work_order_id']: w for w in json.load(open('rounds/round1/work_orders.json'))}
hard = 0; cued = []
for it in items:
    h, _ = check(it, wos[it['work_order_id']])
    if h: hard += 1; print(it['work_order_id'], 'HARD', h)
    lens = {o['id']: len(o['text']) for o in it['options']}
    others = sorted(v for i, v in lens.items() if i != it['key'])
    if lens[it['key']] > 1.15 * others[-1]: cued.append(it['work_order_id'])
print(len(items), 'items;', hard, 'hard failures;', 'keyed option still longest by >15%:', cued or 'none')
