import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  masteryLevel, curriculumMap, weeklyStreak, progressFacts, achievementProgress, isAchievementRule,
  draftGates, canSubmit, emptyDraft, toDraft, studyGuide, CURRICULUM,
  type AnswerRow, type AchievementDef, type DraftQuestion, type GuideRow, type Confidence,
} from '../src/index.js';

let n = 0;
const row = (area: string, correct: boolean, conf: Confidence, extra: Partial<GuideRow> = {}): GuideRow => ({
  item_id: `i${++n}`, learning_area: area, final_option: correct ? 'A' : 'B', first_option: correct ? 'A' : 'B',
  correct, first_correct: correct, final_confidence: conf, n_changes: 0, attempt_number: 1, points: 0,
  presentation: 'chest pain', learning_point: `point ${n}`, references: [{ title: 'Therapeutic Guidelines', locator: 'Cardiovascular' }],
  ...extra,
});

test('mastery levels need enough answers before rating', () => {
  assert.equal(masteryLevel(0, 0), 0);
  assert.equal(masteryLevel(4, 1), 1);
  assert.equal(masteryLevel(10, 0.4), 2);
  assert.equal(masteryLevel(10, 0.6), 3);
  assert.equal(masteryLevel(10, 0.9), 4);   // high accuracy but too few answers to be "strong"
  assert.equal(masteryLevel(15, 0.9), 5);
});

test('curriculum map lists every core area, largest first, with levels', () => {
  const rows = Array.from({ length: 6 }, () => row('Deteriorating patient', true, 3));
  const map = curriculumMap(rows);
  assert.equal(map.length, CURRICULUM.length);
  assert.equal(map[0].area, 'Deteriorating patient');
  assert.equal(map[0].label, 'Secure');
  assert.equal(map.find((t) => t.area === 'Doctor wellbeing, teamwork and workload')!.level, 0);
});

test('weekly streak: freezes are earned every 4 weeks and spent on a missed week', () => {
  const weeks: Record<string, number> = {
    '2026-08-31': 100, '2026-09-07': 100, '2026-09-14': 100, '2026-09-21': 100, // 4 met: earns a freeze
    '2026-09-28': 10,                                                            // missed: freeze spent
    '2026-10-05': 120, '2026-10-12': 0,                                          // met, then missed with no freeze
    '2026-10-19': 100,
  };
  const s = weeklyStreak(weeks, 100, '2026-10-26');
  assert.deepEqual(s.weeks.map((w) => w.status), ['met', 'met', 'met', 'frozen', 'met', 'missed', 'met', 'current']);
  assert.equal(s.streak, 1);
  assert.equal(s.best, 5);
  assert.equal(s.metThisWeek, false);
  // Meeting this week's goal extends the streak; an unfinished week never breaks it.
  assert.equal(weeklyStreak({ ...weeks, '2026-10-26': 100 }, 100, '2026-10-26').streak, 2);
  assert.equal(weeklyStreak({}, 100, '2026-10-26').streak, 0);
});

test('achievement progress from facts, including calibration and fixed misconceptions', () => {
  const rows: AnswerRow[] = [
    row('Deteriorating patient', false, 4, { item_id: 'x' }),
    ...Array.from({ length: 12 }, () => row('Paediatrics', true, 3)),
    row('Deteriorating patient', true, 3, { item_id: 'x', attempt_number: 2 }),
  ];
  const f = progressFacts(rows, { bestWeekStreak: 3, questionsSubmitted: 1, questionsAccepted: 0 });
  assert.equal(f.answered, 13);
  assert.equal(f.bestConfidentRun, 12);
  assert.equal(f.misconceptionsFixed, 1);
  assert.equal(f.areasCovered, 2);
  const def = (rule: AchievementDef['rule']): AchievementDef => ({ id: 't', title: 't', description: '', rule, sort: 0 });
  assert.deepEqual(achievementProgress(def({ type: 'confident_run', n: 10 }), f), { def: def({ type: 'confident_run', n: 10 }), current: 10, target: 10, done: true });
  assert.equal(achievementProgress(def({ type: 'week_streak', n: 4 }), f).done, false);
  assert.equal(achievementProgress(def({ type: 'questions_submitted', n: 1 }), f).done, true);
  assert.equal(achievementProgress(def({ type: 'calibrated', n: 50, maxBias: 0.05 }), f).done, false);
  assert.ok(isAchievementRule({ type: 'answered', n: 10 }));
  assert.ok(!isAchievementRule({ type: 'answered', n: 0 }));
  assert.ok(!isAchievementRule({ type: 'calibrated', n: 10 }));
  assert.ok(!isAchievementRule({ type: 'made_up', n: 1 }));
});

const good = (): DraftQuestion => ({
  learning_area: 'Emergency presentations', presentation: 'anaphylaxis', context: 'ed',
  stem: 'A 24-year-old man presents to a rural emergency department 10 minutes after a bee sting with widespread urticaria, lip swelling, wheeze and a blood pressure of 80/50 mmHg. He has no other medical history and takes no regular medicines.',
  lead_in: 'What is the most appropriate first treatment?',
  options: { A: 'Intramuscular adrenaline 0.5 mg', B: 'Oral cetirizine 10 mg', C: 'Intravenous hydrocortisone 200 mg', D: 'Nebulised salbutamol 5 mg' },
  key: 'A',
  explanations: {
    A: 'Intramuscular adrenaline is first-line for anaphylaxis with hypotension.',
    B: 'Antihistamines treat skin symptoms only and do not reverse shock.',
    C: 'Corticosteroids act too slowly to treat the acute reaction.',
    D: 'Salbutamol may help wheeze but does not treat the systemic reaction.',
  },
  learning_point: 'Give IM adrenaline first in anaphylaxis.', rural_note: 'Repeat every 5 minutes while arranging retrieval.',
  references: [{ title: 'ASCIA anaphylaxis guidelines', locator: 'Acute management' }],
});

test('a well-formed draft passes the checks', () => {
  assert.deepEqual(draftGates(good()), []);
  assert.ok(canSubmit(good()));
  assert.ok(!canSubmit(emptyDraft()));
});

test('draft checks catch the usual item-writing faults', () => {
  const d = good();
  d.lead_in = 'Which of the following is NOT appropriate';
  d.options.D = 'All of the above';
  d.explanations.B = 'Unlike option A, this does not treat shock.';
  d.options.C = 'Always give intravenous hydrocortisone';
  const g = draftGates(d);
  const has = (field: string, level: string) => g.some((x) => x.field === field && x.level === level);
  assert.ok(has('lead_in', 'error'));            // no question mark
  assert.ok(has('lead_in', 'warning'));          // negative lead-in
  assert.ok(has('options.D', 'error'));          // all of the above
  assert.ok(has('explanations.B', 'error'));     // refers to an option letter
  assert.ok(has('options.C', 'warning'));        // absolute word in a distractor
});

test('untrusted draft input is coerced and capped', () => {
  const d = toDraft({ stem: 'x'.repeat(10_000), key: 'E', options: { A: 5 }, references: Array(10).fill({ title: 't' }) });
  assert.equal(d.stem.length, 4000);
  assert.equal(d.key, '');
  assert.equal(d.options.A, '');
  assert.equal(d.references.length, 4);
});

test('study guide puts open confident errors first and drops ones put right', () => {
  const rows: GuideRow[] = [
    row('Deteriorating patient', false, 4, { item_id: 'fixed' }),
    row('Deteriorating patient', true, 3, { item_id: 'fixed', attempt_number: 2 }),
    row('Paediatrics', false, 3, { item_id: 'open', presentation: 'croup', learning_point: 'Dexamethasone for croup' }),
    row('Paediatrics', false, 1), row('Paediatrics', true, 2), row('Paediatrics', false, 2),
  ];
  const g = studyGuide(rows);
  assert.equal(g.answered, 5);
  assert.deepEqual(g.misconceptions.map((a) => a.items.map((i) => i.item_id)), [['open']]);
  assert.equal(g.misconceptions[0].readings[0].title, 'Therapeutic Guidelines');
  assert.equal(g.weakest[0].learning_area, 'Paediatrics');
  assert.equal(g.fragile[0].learning_area, 'Paediatrics');
  assert.ok(g.notStarted.length > 0 && !g.notStarted.some((a) => a.area === 'Deteriorating patient'));
});

test('achievement editor validation', async () => {
  const { achievementErrors, ACHIEVEMENT_RULES } = await import('../src/index.js');
  const ok = { id: 'night-owl', title: 'Night owl', description: 'Answer 20 questions.', rule: { type: 'answered' as const, n: 20 }, sort: 5, active: true, national: false };
  assert.deepEqual(achievementErrors(ok, { isNew: true, existingIds: ['century'] }), {});
  assert.ok(achievementErrors({ ...ok, id: 'Night Owl' }, { isNew: true }).id);
  assert.ok(achievementErrors(ok, { isNew: true, existingIds: ['night-owl'] }).id);
  assert.ok(achievementErrors({ ...ok, rule: { type: 'areas_covered', n: 40 } }, { isNew: false }).n);
  assert.ok(achievementErrors({ ...ok, rule: { type: 'answered', n: 0 } }, { isNew: false }).n);
  assert.ok(achievementErrors({ ...ok, rule: { type: 'calibrated', n: 50, maxBias: 0.5 } }, { isNew: false }).maxBias);
  assert.ok(achievementErrors({ ...ok, title: '' }, { isNew: false }).title);
  assert.equal(ACHIEVEMENT_RULES.calibrated.example(50, 0.05), 'After 50 answers, have your confidence within 5 points of your accuracy.');
});

test('beta release holds back questions the automated checks raised', async () => {
  const { betaRelease, betaSql, automatedHold } = await import('../src/index.js');
  const doc = (over: Record<string, unknown>) => ({
    item_id: '00000000-0000-0000-0000-00000000000' + Object.keys(over).length, work_order_id: 'wo', version: 1,
    stem: 's', lead_in: 'q?', options: (['A', 'B', 'C', 'D'] as const).map((id) => ({ id, text: id })), key: 'A' as const,
    explanations: { A: 'a', B: 'b', C: 'c', D: 'd' }, learning_point: 'lp', learning_area: 'Emergency presentations', domains: ['1.9'],
    presentation: 'p', context: 'ed', cognitive_level: 'management', patient: {}, target_difficulty: 3,
    critic: { overall: 'pass' }, review_flags: [], uncertainty: 'none', ...over,
  });
  assert.equal(automatedHold(doc({})), null);
  assert.match(automatedHold(doc({ critic: { overall: 'concern', notes_for_reviewer: 'weak distractors' } }))!, /critic/);
  assert.match(automatedHold(doc({ blind_disagreement: true }))!, /solver/);
  assert.match(automatedHold(doc({ uncertainty: 'major' }))!, /uncertainty/i);
  const out = betaRelease([doc({}), doc({ review_flags: ['accuracy concern: x'] })]);
  assert.deepEqual(out.map((o) => o.status), ['beta', 'held']);
  const sql = betaSql(out);
  assert.match(sql, /'live'/);
  assert.match(sql, /'none'/);              // review level
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.equal((sql.match(/INSERT INTO item_version/g) ?? []).length, 1);
});

test('prevocational: XP, levels, paused weeks, outcome map, challenges and goal plans', async () => {
  const {
    xpFromAnswers, xpTotal, levelFor, levelThreshold, pausedWeeks, outcomeMap, challengeProgress, windowFacts, isChallenge,
    toGoalPlan, goalPlanErrors, recommendedAreas, OUTCOME_STATEMENTS, CURRICULUM: C,
  } = await import('../src/index.js');
  assert.equal(C.reduce((s, c) => s + c.share, 0).toFixed(3), '1.000');
  assert.equal(OUTCOME_STATEMENTS.length, 28);
  for (const c of C) for (const d of c.domains) assert.ok(OUTCOME_STATEMENTS.some((o) => o.code === d), `${c.area}: ${d}`);

  const rows: AnswerRow[] = [
    row('Deteriorating patient', true, 4, { domains: ['1.9', '1.1'] }),           // honest: right and sure
    row('Deteriorating patient', false, 1, { domains: ['1.9'] }),                 // honest: wrong and unsure
    row('Prescribing and medication safety', false, 4, { domains: ['1.8'] }),     // overconfident
    row('Prescribing and medication safety', true, 3, { item_id: 'rep', attempt_number: 2, domains: ['1.8'] }),
  ];
  const xa = xpFromAnswers(rows);
  assert.deepEqual(xa, { answers: 3, repeats: 1, honest: 3 });
  const xp = xpTotal({ ...xa, reflections: 2, goalPlans: 1, checkins: 0, weeksMet: 1, questionsSubmitted: 0, questionsAccepted: 0, seasonChallenges: 0 });
  assert.equal(xp, 30 + 4 + 15 + 50 + 50 + 40);
  assert.equal(levelThreshold(2), 100);
  assert.equal(levelThreshold(5), 1000);
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(189).level, 2);
  assert.equal(levelFor(1000).level, 5);
  assert.equal(levelFor(1000).title, 'Trusted on the floor');
  assert.equal(levelFor(1_000_000).next, null);

  // A pause from Wed 2026-09-30 to Tue 2026-10-06 covers the weeks starting Mon 28 Sep and Mon 5 Oct.
  const paused = pausedWeeks([{ starts_on: '2026-09-30', ends_on: '2026-10-06' }]);
  assert.deepEqual([...paused], ['2026-09-28', '2026-10-05']);
  const weeks: Record<string, number> = { '2026-09-14': 100, '2026-09-21': 100, '2026-09-28': 3, '2026-10-05': 0, '2026-10-12': 100 };
  const s = weeklyStreak(weeks, 100, '2026-10-19', paused);
  assert.deepEqual(s.weeks.map((w) => w.status), ['met', 'met', 'paused', 'paused', 'met', 'current']);
  assert.equal(s.streak, 3);
  assert.equal(weeklyStreak(weeks, 100, '2026-10-19').streak, 1);   // without the pause the streak broke

  const map = outcomeMap(rows, [['1.2', '1.9'], ['1.2']]);
  const o19 = map.find((t) => t.code === '1.9')!;
  assert.deepEqual({ answered: o19.answered, correct: o19.correct, reflections: o19.reflections, level: o19.level }, { answered: 2, correct: 1, reflections: 1, level: 1 });
  assert.equal(map.find((t) => t.code === '1.2')!.reflections, 2);
  assert.equal(map.filter((t) => t.evidence > 0).length, 3);        // 1.9, 1.1, 1.2 (1.8 has no correct first attempt)

  const wf = windowFacts(rows, 2);
  assert.deepEqual(challengeProgress({ type: 'answered', n: 2 }, wf), { current: 2, target: 2, done: true });
  assert.deepEqual(challengeProgress({ type: 'areas_covered', n: 5 }, wf), { current: 2, target: 5, done: false });
  assert.equal(challengeProgress({ type: 'area_answered', n: 1, area: 'Paediatrics' }, wf).current, 0);
  assert.ok(isChallenge({ type: 'reflections', n: 3 }) && !isChallenge({ type: 'area_answered', n: 3 }) && !isChallenge({ type: 'x', n: 1 }));

  const plan = toGoalPlan({ pgy_level: 1, goals: [{ text: 'Be confident escalating a deteriorating patient', outcomes: ['1.9', 'bogus', '1.9'] }, { text: '' }], setting_preference: 'rural', img: 'yes' });
  assert.deepEqual(plan.goals, [{ text: 'Be confident escalating a deteriorating patient', outcomes: ['1.9'] }]);
  assert.equal(plan.img, false);
  assert.deepEqual(goalPlanErrors(plan), {});
  assert.ok(goalPlanErrors(toGoalPlan({})).goals && goalPlanErrors(toGoalPlan({})).pgy_level);
  assert.equal(recommendedAreas(plan.goals)[0], 'Deteriorating patient');
});
