import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerPoints, expectedPoints, type Confidence,
  AnswerTracker, validateClientEvent,
  calibration, calibrationSummary, changeStats, quadrants, areaStats, type AnswerRow,
  insights, selectSet, type SelectableItem, type History,
} from '../src/index.js';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('points table matches the spec and the SQL function', () => {
  assert.deepEqual(([1, 2, 3, 4] as Confidence[]).map((c) => answerPoints(true, c)), [55, 80, 95, 100]);
  assert.deepEqual(([1, 2, 3, 4] as Confidence[]).map((c) => answerPoints(false, c)), [35, 20, -5, -32]);
});

test('honest confidence earns the most expected points', () => {
  // For each true probability, the best report is the confidence level nearest to it.
  const cases: [number, Confidence][] = [[0.25, 1], [0.5, 2], [0.75, 3], [0.95, 4]];
  for (const [q, best] of cases) {
    const scores = ([1, 2, 3, 4] as Confidence[]).map((c) => expectedPoints(q, c));
    assert.equal(scores.indexOf(Math.max(...scores)) + 1, best, `q=${q}`);
  }
});

function tracker(clock: { t: number }) {
  let id = 0;
  return new AnswerTracker({
    envelope: { user_id: U(1), tenant_id: U(2), session_id: U(3), app_version: 'web 0.1.0', mode: 'learning' },
    itemId: U(10), itemVersion: 1, optionOrder: ['C', 'A', 'D', 'B'], positionInSet: 1, setId: U(4),
    isPretest: false, attemptNumber: 1, now: () => clock.t, newId: () => U(100 + ++id),
  });
}

test('tracker records selections, confidence and changes as in the worked example', () => {
  const clock = { t: 1_000_000 };
  const t = tracker(clock);
  clock.t += 41_200; t.select('C');
  clock.t += 3_700; t.setConfidence(2);
  clock.t += 18_600; t.select('A');
  t.select('A'); // repeated tap is not a change
  clock.t += 2_600; t.setConfidence(3);
  assert.equal(t.canSubmit, true);
  clock.t += 1_900; const sub = t.submit();
  assert.deepEqual(t.events.map((e) => e.event_type),
    ['item_presented', 'option_selected', 'confidence_set', 'option_selected', 'confidence_set', 'answer_submitted']);
  assert.equal(sub.payload.first_option_id, 'C');
  assert.equal(sub.payload.final_option_id, 'A');
  assert.equal(sub.payload.n_changes, 1);
  assert.equal(sub.payload.change_path, 'C>A');
  assert.equal(sub.payload.first_confidence, 2);
  assert.equal(sub.payload.final_confidence, 3);
  assert.equal(sub.payload.ms_total, 68_000);
  assert.equal('correct' in sub.payload, false, 'client never claims correctness');
  t.select('B');
  assert.equal(t.events.length, 6, 'no changes after submit');
  for (const e of t.events) assert.deepEqual(validateClientEvent(e, clock.t).errors, [], e.event_type);
});

test('tracker refuses to submit without answer and confidence', () => {
  const t = tracker({ t: 0 });
  assert.throws(() => t.submit());
  t.select('B');
  assert.throws(() => t.submit());
});

test('A to B to A counts as two changes', () => {
  const t = tracker({ t: 0 });
  t.select('A'); t.select('B'); t.select('A'); t.setConfidence(4);
  const s = t.submit();
  assert.equal(s.payload.n_changes, 2);
  assert.equal(s.payload.change_path, 'A>B>A');
});

test('validation rejects bad and server-only events', () => {
  const now = Date.parse('2026-10-24T00:00:00Z');
  const base = { event_id: U(1), session_id: U(2), app_version: 'web', mode: 'learning', client_ts: '2026-10-24T00:00:00Z' };
  assert.equal(validateClientEvent({ ...base, event_type: 'achievement_earned', payload: {} }, now).ok, false);
  assert.equal(validateClientEvent({ ...base, event_type: 'answer_submitted',
    payload: { item_id: U(9), item_version: 1, final_option_id: 'E', final_confidence: 3 } }, now).ok, false);
  assert.equal(validateClientEvent({ ...base, event_type: 'answer_submitted', client_ts: '2026-10-25T00:00:00Z',
    payload: { item_id: U(9), item_version: 1, final_option_id: 'A', final_confidence: 3 } }, now).ok, false, 'future timestamp');
  assert.equal(validateClientEvent({ ...base, event_type: 'item_presented',
    payload: { item_id: U(9), item_version: 1, option_order: ['A', 'A', 'B', 'C'] } }, now).ok, false);
  assert.equal(validateClientEvent({ ...base, event_type: 'answer_submitted',
    payload: { item_id: U(9), item_version: 1, final_option_id: 'A', final_confidence: 3 } }, now).ok, true);
  assert.equal(validateClientEvent(null).ok, false);
  assert.equal(validateClientEvent({ ...base, event_type: 'tutor_answer_rated', payload: { item_id: U(9), helpful: true, turn_index: 0 } }, now).ok, true);
  assert.equal(validateClientEvent({ ...base, event_type: 'tutor_answer_rated', payload: { item_id: U(9), helpful: 'yes', turn_index: 0 } }, now).ok, false);
});

function row(p: Partial<AnswerRow>): AnswerRow {
  return { item_id: U(1), learning_area: 'Emergency', final_option: 'A', first_option: 'A', correct: true, first_correct: true,
    final_confidence: 3, first_confidence: 3, n_changes: 0, attempt_number: 1, points: 95, ...p };
}

test('calibration and quadrants count first attempts only', () => {
  const rows = [
    row({ final_confidence: 4, correct: false, first_correct: false }),
    row({ final_confidence: 4, correct: true }),
    row({ final_confidence: 1, correct: false, first_correct: false }),
    row({ final_confidence: 4, correct: true, attempt_number: 2 }),
  ];
  const cal = calibration(rows);
  assert.equal(cal[3].n, 2);
  assert.equal(cal[3].accuracy, 0.5);
  assert.equal(cal[1].accuracy, null);
  const s = calibrationSummary(rows);
  assert.equal(s.n, 3);
  assert.ok(Math.abs(s.bias! - ((0.95 + 0.95 + 0.25) / 3 - 1 / 3)) < 1e-9);
  assert.deepEqual(quadrants(rows), { secure: 1, misconception: 1, fragile: 0, knownGap: 1 });
});

test('answer-change stats split by first confidence and reason', () => {
  const rows = [
    row({ n_changes: 1, first_correct: false, correct: true, first_confidence: 2, change_reason: 'reread_stem' }),
    row({ n_changes: 1, first_correct: false, correct: true, first_confidence: 2, change_reason: 'reread_stem' }),
    row({ n_changes: 1, first_correct: true, correct: false, first_confidence: 4, change_reason: 'gut_feeling' }),
    row({ n_changes: 2, first_correct: false, correct: false, first_confidence: 3 }),
    row({ n_changes: 0 }),
  ];
  const c = changeStats(rows);
  assert.equal(c.changed, 4);
  assert.equal(c.wrongToRight, 2);
  assert.equal(c.rightToWrong, 1);
  assert.equal(c.wrongToWrong, 1);
  assert.equal(c.netGain, 1);
  assert.deepEqual(c.byFirstConfidence, { low: { changed: 2, netGain: 2 }, high: { changed: 2, netGain: -1 } });
  assert.deepEqual(c.byReason.reread_stem, { changed: 2, netGain: 2 });
  assert.deepEqual(c.byReason.gut_feeling, { changed: 1, netGain: -1 });
});

test('insights wait for enough data, then speak plainly', () => {
  assert.match(insights([row({})])[0].text, /Answer 29 more questions/);
  const over = Array.from({ length: 40 }, (_, i) =>
    row({ item_id: U(i), final_confidence: 4, correct: i % 2 === 0, first_correct: i % 2 === 0, learning_area: i < 20 ? 'Paediatrics' : 'Emergency' }));
  const ins = insights(over);
  const cal = ins.find((x) => x.id === 'calibration')!;
  assert.match(cal.text, /45 points overconfident/);
  assert.ok(ins.some((x) => x.id === 'misconceptions'));
  const changes = Array.from({ length: 40 }, (_, i) =>
    row({ item_id: U(i), n_changes: i < 12 ? 1 : 0, first_correct: i < 12 ? i >= 9 : true, correct: i < 12 ? i < 9 : true }));
  assert.match(insights(changes).find((x) => x.id === 'changes')!.text, /gained you 6 marks/);
});

test('area stats sort weakest first', () => {
  const rows = [row({ learning_area: 'A', correct: false }), row({ learning_area: 'B' })];
  assert.equal(areaStats(rows)[0].learning_area, 'A');
});

function seeded(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 2 ** 32; return seed / 2 ** 32; }; }

test('selection: unseen first, pretest capped at 10%, no duplicates', () => {
  const pool: SelectableItem[] = Array.from({ length: 60 }, (_, i) => ({
    item_id: U(i), learning_area: ['Emergency', 'Paediatrics', 'Surgery'][i % 3], is_pretest: i % 2 === 0, calibration_core: i < 20,
  }));
  const history: History[] = [{ item_id: U(1), learning_area: 'Paediatrics', correct: true, final_confidence: 3, answered_at: 0 }];
  const set = selectSet(pool, history, { size: 20, random: seeded(7), now: 1000 });
  assert.equal(set.length, 20);
  assert.equal(new Set(set.map((s) => s.item_id)).size, 20);
  assert.ok(set.filter((s) => s.is_pretest).length <= 2);
  assert.ok(!set.some((s) => s.item_id === U(1)), 'seen item not repeated while unseen remain');
});

test('selection: misconceptions return after the delay, preferring a template sibling', () => {
  const pool: SelectableItem[] = [
    { item_id: U(1), learning_area: 'Emergency', template_id: U(90), is_pretest: false, calibration_core: true },
    { item_id: U(2), learning_area: 'Emergency', template_id: U(90), is_pretest: false, calibration_core: true },
    ...Array.from({ length: 10 }, (_, i) => ({ item_id: U(10 + i), learning_area: 'Surgery', is_pretest: false, calibration_core: false })),
  ];
  const day = 24 * 3600 * 1000;
  const h: History[] = [{ item_id: U(1), learning_area: 'Emergency', template_id: U(90), correct: false, final_confidence: 4, answered_at: 0 }];
  const early = selectSet(pool, h, { size: 5, now: day, mode: 'misconceptions', random: seeded(1) });
  assert.equal(early.length, 0, 'not due yet');
  const later = selectSet(pool, h, { size: 5, now: 3 * day, mode: 'misconceptions', random: seeded(1) });
  assert.deepEqual(later.map((x) => x.item_id), [U(2)], 'sibling variant, not the same item');
  const all = selectSet(pool, [...h, ...pool.slice(1).map((p) => ({ item_id: p.item_id, learning_area: p.learning_area, correct: true, final_confidence: 3, answered_at: 0 }))],
    { size: 3, now: 3 * day, random: seeded(2) });
  assert.ok(all.some((x) => x.item_id === U(1)), 'with siblings used up, the original item returns');
});

test('selection respects a learning-area filter', () => {
  const pool: SelectableItem[] = Array.from({ length: 30 }, (_, i) => ({
    item_id: U(i), learning_area: i < 10 ? 'Dermatology' : 'Emergency', is_pretest: false, calibration_core: false }));
  const set = selectSet(pool, [], { size: 10, learningArea: 'Dermatology', random: seeded(3) });
  assert.ok(set.every((s) => s.learning_area === 'Dermatology'));
});
