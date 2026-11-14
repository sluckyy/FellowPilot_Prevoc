/**
 * Next-question selection for the walking skeleton. Deliberately simple and explainable:
 * unseen items first, weighted towards weak learning areas; high-confidence errors come back
 * after a delay (as a template sibling when one exists); at most 10% pretest items per set.
 * Replaced by IRT-based adaptive selection once items are calibrated.
 */
export interface SelectableItem {
  item_id: string;
  learning_area: string;
  template_id?: string | null;
  is_pretest: boolean;
  calibration_core: boolean;
}

export interface History {
  item_id: string;
  learning_area: string;
  template_id?: string | null;
  correct: boolean;
  final_confidence: number;
  answered_at: number; // ms
}

export interface SelectOptions {
  size: number;
  learningArea?: string | null;
  now?: number;
  random?: () => number;       // injectable for tests
  maxPretestShare?: number;     // default 0.1
  reviewAfterMs?: number;       // when misconceptions resurface, default 2 days
  mode?: 'mixed' | 'misconceptions';
}

export function selectSet(pool: SelectableItem[], history: History[], o: SelectOptions): SelectableItem[] {
  const rnd = o.random ?? Math.random;
  const now = o.now ?? Date.now();
  const reviewAfter = o.reviewAfterMs ?? 2 * 24 * 3600 * 1000;
  const maxPretest = Math.floor(o.size * (o.maxPretestShare ?? 0.1));
  const scoped = o.learningArea ? pool.filter((i) => i.learning_area === o.learningArea) : pool;
  const seen = new Set(history.map((h) => h.item_id));

  // Misconceptions due for review: wrong at confidence 3-4, answered long enough ago, not since put right.
  const latest = new Map<string, History>();
  for (const h of [...history].sort((a, b) => a.answered_at - b.answered_at)) latest.set(h.item_id, h);
  const due = [...latest.values()].filter((h) => !h.correct && h.final_confidence >= 3 && now - h.answered_at >= reviewAfter);
  const review: SelectableItem[] = [];
  for (const h of due) {
    const sibling = h.template_id
      ? scoped.find((i) => i.template_id === h.template_id && !seen.has(i.item_id) && !review.includes(i))
      : undefined;
    const same = scoped.find((i) => i.item_id === h.item_id);
    const pick = sibling ?? same;
    if (pick && !review.includes(pick)) review.push(pick);
  }
  if (o.mode === 'misconceptions') return shuffle(review, rnd).slice(0, o.size);

  // Weight unseen items by how weak the trainee is in their area (unknown areas count as weak).
  const areaAcc = new Map<string, { n: number; c: number }>();
  for (const h of history) {
    const a = areaAcc.get(h.learning_area) ?? { n: 0, c: 0 };
    a.n++; if (h.correct) a.c++;
    areaAcc.set(h.learning_area, a);
  }
  const weight = (i: SelectableItem) => {
    const a = areaAcc.get(i.learning_area);
    const acc = a && a.n >= 3 ? a.c / a.n : 0.5;
    return (1.5 - acc) * (i.calibration_core ? 1.3 : 1);
  };
  const unseen = scoped.filter((i) => !seen.has(i.item_id) && !review.includes(i));

  const out: SelectableItem[] = review.slice(0, Math.ceil(o.size * 0.3));
  let pretest = out.filter((i) => i.is_pretest).length;
  const candidates = [...unseen];
  while (out.length < o.size && candidates.length) {
    const eligible = candidates.filter((i) => !i.is_pretest || pretest < maxPretest);
    if (!eligible.length) break;
    const pick = weightedPick(eligible, weight, rnd);
    candidates.splice(candidates.indexOf(pick), 1);
    out.push(pick);
    if (pick.is_pretest) pretest++;
  }
  // Everything seen: fall back to the least recently answered items.
  if (out.length < o.size) {
    const byAge = [...latest.values()].sort((a, b) => a.answered_at - b.answered_at);
    for (const h of byAge) {
      const it = scoped.find((i) => i.item_id === h.item_id);
      if (it && !out.includes(it) && (!it.is_pretest || pretest < maxPretest)) {
        out.push(it); if (it.is_pretest) pretest++;
      }
      if (out.length >= o.size) break;
    }
  }
  return shuffle(out, rnd);
}

function weightedPick<T>(xs: T[], w: (x: T) => number, rnd: () => number): T {
  const total = xs.reduce((s, x) => s + w(x), 0);
  let r = rnd() * total;
  for (const x of xs) { r -= w(x); if (r <= 0) return x; }
  return xs[xs.length - 1];
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Shuffle the display order of options for one presentation (stored ids stay A-D). */
export function shuffleOptions(rnd: () => number = Math.random): ('A' | 'B' | 'C' | 'D')[] {
  return shuffle(['A', 'B', 'C', 'D'] as const as ('A' | 'B' | 'C' | 'D')[], rnd);
}
