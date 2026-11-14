/**
 * Gamification for the prevocational beta (Technical Specification, "Gamification engine"):
 * event-driven XP and levels, badges defined as records, weekly goals with freezes and manual
 * streak pauses, seasonal challenges, team challenges with a minimum team size, and a progress
 * map of AMC outcome-statement coverage. Rewards engagement, coverage, honest confidence and
 * reflection. Scores feed formative feedback, never leaderboards; reflection content is never scored.
 */
import type { AnswerRow } from './metrics.js';
import { calibrationSummary } from './metrics.js';
import { CURRICULUM, OUTCOME_STATEMENTS, type OutcomeDomain } from './curriculum.js';

const firsts = (rows: AnswerRow[]) => rows.filter((r) => r.attempt_number === 1);

// ------------------------------------------------------------------ mastery (per learning area)
export const MASTERY_LEVELS = ['Not started', 'Started', 'Building', 'Developing', 'Secure', 'Strong'] as const;
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;
export const MASTERY_MIN_ANSWERS = 5;
export const STRONG_MIN_ANSWERS = 15;

/** Level from first-attempt answers in one area. Needs 5 answers to rate, 15 to call it strong. */
export function masteryLevel(n: number, accuracy: number): MasteryLevel {
  if (n === 0) return 0;
  if (n < MASTERY_MIN_ANSWERS) return 1;
  if (accuracy < 0.5) return 2;
  if (accuracy < 0.7) return 3;
  if (accuracy >= 0.85 && n >= STRONG_MIN_ANSWERS) return 5;
  return 4;
}

export interface MapTile { area: string; share: number; n: number; accuracy: number | null; level: MasteryLevel; label: string }

/** Every learning area, in blueprint order (largest share first), with this trainee's level. */
export function curriculumMap(rows: AnswerRow[]): MapTile[] {
  const by = new Map<string, { n: number; ok: number }>();
  for (const r of firsts(rows)) {
    const s = by.get(r.learning_area) ?? { n: 0, ok: 0 };
    s.n++; if (r.correct) s.ok++;
    by.set(r.learning_area, s);
  }
  return CURRICULUM.map((c) => {
    const s = by.get(c.area) ?? { n: 0, ok: 0 };
    const accuracy = s.n ? s.ok / s.n : null;
    const level = masteryLevel(s.n, accuracy ?? 0);
    return { area: c.area, share: c.share, n: s.n, accuracy, level, label: MASTERY_LEVELS[level] };
  });
}

// ------------------------------------------------------------------ outcome-statement progress map
export const COVERAGE_LEVELS = ['No evidence yet', 'Started', 'Developing', 'Well evidenced'] as const;
export type CoverageLevel = 0 | 1 | 2 | 3;

export interface OutcomeTile {
  code: string; short: string; domain: OutcomeDomain['id'];
  answered: number; correct: number; reflections: number; evidence: number; level: CoverageLevel; label: string;
}

/** Evidence = first-attempt correct answers on items tagged to the statement, plus confirmed reflection tags. */
export function coverageLevel(evidence: number): CoverageLevel {
  if (evidence <= 0) return 0;
  if (evidence <= 2) return 1;
  if (evidence <= 5) return 2;
  return 3;
}

/**
 * Coverage of the 28 outcome statements from answers (each item carries 1-3 statement codes in
 * `domains`) and from the tags the trainee confirmed on reflections. Reflection text is never read.
 */
export function outcomeMap(rows: AnswerRow[], reflectionTags: string[][] = []): OutcomeTile[] {
  const by = new Map<string, { answered: number; correct: number; reflections: number }>();
  const get = (code: string) => { const s = by.get(code) ?? { answered: 0, correct: 0, reflections: 0 }; by.set(code, s); return s; };
  for (const r of firsts(rows)) for (const code of r.domains ?? []) { const s = get(code); s.answered++; if (r.correct) s.correct++; }
  for (const tags of reflectionTags) for (const code of new Set(tags)) get(code).reflections++;
  return OUTCOME_STATEMENTS.map((o) => {
    const s = by.get(o.code) ?? { answered: 0, correct: 0, reflections: 0 };
    const evidence = s.correct + s.reflections;
    const level = coverageLevel(evidence);
    return { code: o.code, short: o.short, domain: o.domain, ...s, evidence, level, label: COVERAGE_LEVELS[level] };
  });
}

// ------------------------------------------------------------------ XP and levels
/** XP is for engagement, never for being right: every logged activity earns the same whether or not the answer was correct. */
export const XP = {
  answer: 10,            // a first attempt at a question
  repeat: 4,             // a later attempt (revision still counts, a little)
  honest: 5,             // bonus when confidence matched the result (right and sure, or wrong and unsure)
  reflection: 25,
  goalPlan: 50,
  checkin: 50,
  weekMet: 40,           // a week where the weekly goal was met
  questionSubmitted: 30,
  questionAccepted: 60,
  seasonChallenge: 100,
} as const;

export interface XpFacts {
  answers: number; repeats: number; honest: number; reflections: number; goalPlans: number; checkins: number;
  weeksMet: number; questionsSubmitted: number; questionsAccepted: number; seasonChallenges: number;
}

export function xpTotal(f: XpFacts): number {
  return f.answers * XP.answer + f.repeats * XP.repeat + f.honest * XP.honest + f.reflections * XP.reflection
    + f.goalPlans * XP.goalPlan + f.checkins * XP.checkin + f.weeksMet * XP.weekMet
    + f.questionsSubmitted * XP.questionSubmitted + f.questionsAccepted * XP.questionAccepted + f.seasonChallenges * XP.seasonChallenge;
}

/** Answer-derived XP facts: first attempts, repeats, and "honest" answers (confidence matched the result). */
export function xpFromAnswers(rows: AnswerRow[]): Pick<XpFacts, 'answers' | 'repeats' | 'honest'> {
  let answers = 0, repeats = 0, honest = 0;
  for (const r of rows) {
    if (r.attempt_number === 1) answers++; else repeats++;
    if ((r.correct && r.final_confidence >= 3) || (!r.correct && r.final_confidence <= 2)) honest++;
  }
  return { answers, repeats, honest };
}

export const MAX_LEVEL = 20;
/** XP needed to reach level n (level 1 at 0). Triangular growth: 100, 300, 600, 1000, 1500 ... */
export const levelThreshold = (level: number) => (level <= 1 ? 0 : 50 * (level - 1) * level);

export const LEVEL_TITLES: Record<number, string> = {
  1: 'Orientation', 2: 'First on call', 3: 'Ward ready', 4: 'Steady hands', 5: 'Trusted on the floor',
  6: 'Escalates well', 7: 'Team anchor', 8: 'Night-shift calm', 9: 'Resident', 10: 'Ready for the next step',
  11: 'Mentor in the making', 12: 'Safe pair of hands', 13: 'Ward leader', 14: 'Teaching others', 15: 'Consistent',
  16: 'Reflective practitioner', 17: 'Framework complete', 18: 'Role model', 19: 'Registrar ready', 20: 'FellowPilot',
};

export interface LevelState { level: number; title: string; xp: number; floor: number; next: number | null; progress: number }

export function levelFor(xp: number): LevelState {
  let level = 1;
  while (level < MAX_LEVEL && xp >= levelThreshold(level + 1)) level++;
  const floor = levelThreshold(level);
  const next = level < MAX_LEVEL ? levelThreshold(level + 1) : null;
  const progress = next === null ? 1 : (xp - floor) / (next - floor);
  return { level, title: LEVEL_TITLES[level] ?? `Level ${level}`, xp, floor, next, progress };
}

// ------------------------------------------------------------------ weekly goal, streak, pauses
export const WEEKLY_GOAL_CHOICES = [25, 50, 100, 150, 200] as const;
export const FREEZE_EVERY = 4;   // weeks of goal met to earn a freeze
export const MAX_FREEZES = 2;
export const PAUSE_REASONS = ['nights', 'leave', 'exams', 'other'] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];
export const PAUSE_LABELS: Record<PauseReason, string> = { nights: 'Rostered nights', leave: 'Leave', exams: 'Exams', other: 'Something else' };
export const MAX_PAUSE_DAYS = 60;

export type WeekStatus = 'met' | 'frozen' | 'paused' | 'missed' | 'current';
export interface WeekResult { week: string; answered: number; status: WeekStatus }
export interface StreakState { streak: number; best: number; freezes: number; metThisWeek: boolean; weeks: WeekResult[] }

const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

/** The Monday (YYYY-MM-DD) of every week that overlaps a pause. Weeks run Monday to Sunday. */
export function pausedWeeks(pauses: { starts_on: string; ends_on: string }[]): Set<string> {
  const out = new Set<string>();
  for (const p of pauses) {
    const start = Date.parse(`${p.starts_on}T00:00:00Z`);
    const dow = (new Date(start).getUTCDay() + 6) % 7;                 // 0 = Monday
    let monday = addDays(p.starts_on, -dow);
    while (monday <= p.ends_on) { out.add(monday); monday = addDays(monday, 7); }
  }
  return out;
}

/**
 * Weeks are keyed by their Monday. A week that meets the goal adds to the streak; every FREEZE_EVERY such
 * weeks earns a freeze (up to MAX_FREEZES), spent automatically on a missed week. A paused week (rostered
 * nights, leave, exams, set by the trainee) neither counts nor breaks the streak and costs no freeze.
 * The current week only adds once its goal is met and never breaks the streak while it is still going.
 */
export function weeklyStreak(answeredByWeek: Record<string, number>, goal: number, currentWeek: string, paused: Set<string> = new Set()): StreakState {
  const active = Object.keys(answeredByWeek).filter((w) => answeredByWeek[w] > 0 && w <= currentWeek).sort();
  const weeks: WeekResult[] = [];
  let streak = 0, best = 0, freezes = 0, met = 0;
  if (active.length) {
    for (let w = active[0]; w < currentWeek; w = addDays(w, 7)) {
      const n = answeredByWeek[w] ?? 0;
      if (n >= goal) {
        streak++; met++;
        if (met % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
        weeks.push({ week: w, answered: n, status: 'met' });
      } else if (paused.has(w)) {
        weeks.push({ week: w, answered: n, status: 'paused' });
      } else if (streak > 0 && freezes > 0) {
        freezes--;
        weeks.push({ week: w, answered: n, status: 'frozen' });
      } else {
        streak = 0;
        weeks.push({ week: w, answered: n, status: 'missed' });
      }
      best = Math.max(best, streak);
    }
  }
  const now = answeredByWeek[currentWeek] ?? 0;
  const metThisWeek = now >= goal;
  if (metThisWeek) { streak++; met++; if (met % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1); }
  best = Math.max(best, streak);
  weeks.push({ week: currentWeek, answered: now, status: metThisWeek ? 'met' : paused.has(currentWeek) ? 'paused' : 'current' });
  return { streak, best, freezes, metThisWeek, weeks: weeks.slice(-8) };
}

// ------------------------------------------------------------------ seasons and team challenges
export const CHALLENGE_TYPES = ['answered', 'reflections', 'areas_covered', 'area_answered'] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];
export interface Challenge { type: ChallengeType; n: number; area?: string }
export const CHALLENGE_LABELS: Record<ChallengeType, (c: Challenge) => string> = {
  answered: (c) => `Answer ${c.n} questions this season`,
  reflections: (c) => `Log ${c.n} reflections this season`,
  areas_covered: (c) => `Practise ${c.n} different learning areas this season`,
  area_answered: (c) => `Answer ${c.n} questions on ${c.area ?? 'the focus area'} this season`,
};

/** What happened inside a season's window, for one person or summed over a team. */
export interface WindowFacts { answered: number; reflections: number; areas: Set<string>; byArea: Record<string, number> }

export function windowFacts(rows: { learning_area: string; attempt_number: number }[], reflections: number): WindowFacts {
  const byArea: Record<string, number> = {};
  for (const r of rows) if (r.attempt_number === 1) byArea[r.learning_area] = (byArea[r.learning_area] ?? 0) + 1;
  return { answered: rows.filter((r) => r.attempt_number === 1).length, reflections, areas: new Set(Object.keys(byArea)), byArea };
}

export function challengeProgress(c: Challenge, f: WindowFacts, target = c.n): { current: number; target: number; done: boolean } {
  const current = c.type === 'answered' ? f.answered : c.type === 'reflections' ? f.reflections
    : c.type === 'areas_covered' ? f.areas.size : f.byArea[c.area ?? ''] ?? 0;
  return { current: Math.min(current, target), target, done: current >= target };
}

export function isChallenge(x: unknown): x is Challenge {
  const c = x as { type?: unknown; n?: unknown; area?: unknown };
  if (!c || typeof c !== 'object' || !CHALLENGE_TYPES.includes(c.type as ChallengeType)) return false;
  if (!Number.isInteger(c.n) || (c.n as number) < 1 || (c.n as number) > 10_000) return false;
  return c.type !== 'area_answered' || (typeof c.area === 'string' && c.area.length > 0);
}

/** Teams smaller than this show no aggregate, so nobody can be singled out. */
export const MIN_TEAM_SIZE = 5;

// ------------------------------------------------------------------ achievements
export type AchievementRule =
  | { type: 'answered'; n: number }
  | { type: 'areas_covered'; n: number }
  | { type: 'areas_secure'; n: number }
  | { type: 'confident_run'; n: number }
  | { type: 'calibrated'; n: number; maxBias: number }
  | { type: 'changes_helped'; n: number }
  | { type: 'misconceptions_fixed'; n: number }
  | { type: 'week_streak'; n: number }
  | { type: 'questions_submitted'; n: number }
  | { type: 'questions_accepted'; n: number }
  | { type: 'reflections'; n: number }
  | { type: 'goal_plans'; n: number }
  | { type: 'outcomes_covered'; n: number }
  | { type: 'level'; n: number }
  | { type: 'teams_joined'; n: number }
  | { type: 'season_challenges'; n: number };

export const ACHIEVEMENT_RULE_TYPES: AchievementRule['type'][] = [
  'answered', 'areas_covered', 'areas_secure', 'confident_run', 'calibrated', 'changes_helped',
  'misconceptions_fixed', 'week_streak', 'questions_submitted', 'questions_accepted',
  'reflections', 'goal_plans', 'outcomes_covered', 'level', 'teams_joined', 'season_challenges',
];

export interface AchievementDef { id: string; title: string; description: string; rule: AchievementRule; sort: number }

/** Facts achievements are judged on. Computed once per page from answers plus a few counts. */
export interface ProgressFacts {
  answered: number; areasCovered: number; areasSecure: number; bestConfidentRun: number;
  calibrationN: number; calibrationBias: number | null; changesHelped: number; misconceptionsFixed: number;
  bestWeekStreak: number; questionsSubmitted: number; questionsAccepted: number;
  reflections: number; goalPlans: number; outcomesCovered: number; level: number; teamsJoined: number; seasonChallenges: number;
}

export interface ExtraFacts {
  bestWeekStreak: number; questionsSubmitted: number; questionsAccepted: number;
  reflections?: number; goalPlans?: number; outcomesCovered?: number; level?: number; teamsJoined?: number; seasonChallenges?: number;
}

export function progressFacts(rows: AnswerRow[], extra: ExtraFacts): ProgressFacts {
  const fs = firsts(rows);
  const map = curriculumMap(rows);
  let run = 0, bestRun = 0;
  for (const r of fs) {
    if (r.final_confidence < 3) continue;          // unsure answers neither extend nor break the run
    run = r.correct ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }
  const confidentMisses = new Set(fs.filter((r) => !r.correct && r.final_confidence >= 3).map((r) => r.item_id));
  const fixed = new Set(rows.filter((r) => r.attempt_number > 1 && r.correct && confidentMisses.has(r.item_id)).map((r) => r.item_id));
  const cal = calibrationSummary(rows);
  return {
    answered: fs.length,
    areasCovered: map.filter((t) => t.n > 0).length,
    areasSecure: map.filter((t) => t.level >= 4).length,
    bestConfidentRun: bestRun,
    calibrationN: cal.n, calibrationBias: cal.bias,
    changesHelped: fs.filter((r) => r.n_changes > 0 && !r.first_correct && r.correct).length,
    misconceptionsFixed: fixed.size,
    reflections: 0, goalPlans: 0, outcomesCovered: 0, level: 1, teamsJoined: 0, seasonChallenges: 0,
    ...extra,
  };
}

export interface AchievementProgress { def: AchievementDef; current: number; target: number; done: boolean }

export function achievementProgress(def: AchievementDef, f: ProgressFacts): AchievementProgress {
  const r = def.rule;
  const count = (current: number) => ({ def, current: Math.min(current, r.n), target: r.n, done: current >= r.n });
  switch (r.type) {
    case 'answered': return count(f.answered);
    case 'areas_covered': return count(f.areasCovered);
    case 'areas_secure': return count(f.areasSecure);
    case 'confident_run': return count(f.bestConfidentRun);
    case 'changes_helped': return count(f.changesHelped);
    case 'misconceptions_fixed': return count(f.misconceptionsFixed);
    case 'week_streak': return count(f.bestWeekStreak);
    case 'questions_submitted': return count(f.questionsSubmitted);
    case 'questions_accepted': return count(f.questionsAccepted);
    case 'reflections': return count(f.reflections);
    case 'goal_plans': return count(f.goalPlans);
    case 'outcomes_covered': return count(f.outcomesCovered);
    case 'level': return count(f.level);
    case 'teams_joined': return count(f.teamsJoined);
    case 'season_challenges': return count(f.seasonChallenges);
    case 'calibrated': {
      const ok = f.calibrationN >= r.n && f.calibrationBias !== null && Math.abs(f.calibrationBias) <= r.maxBias;
      return { def, current: Math.min(f.calibrationN, r.n), target: r.n, done: ok };
    }
  }
}

/** Checks a definition loaded from the database, so a bad record can't break the page. */
export function isAchievementRule(x: unknown): x is AchievementRule {
  const r = x as { type?: unknown; n?: unknown; maxBias?: unknown };
  if (!r || typeof r !== 'object' || !ACHIEVEMENT_RULE_TYPES.includes(r.type as AchievementRule['type'])) return false;
  if (!Number.isInteger(r.n) || (r.n as number) < 1) return false;
  return r.type !== 'calibrated' || (typeof r.maxBias === 'number' && r.maxBias > 0 && r.maxBias < 1);
}

// ------------------------------------------------------------------ editing achievements (admin)
export interface RuleInfo { label: string; count: string; max: number; example: (n: number, maxBias?: number) => string }

const AREAS = CURRICULUM.length;
const OUTCOMES = OUTCOME_STATEMENTS.length;

/** Plain-language descriptions of each rule type, for the admin editor. */
export const ACHIEVEMENT_RULES: Record<AchievementRule['type'], RuleInfo> = {
  answered:             { label: 'Questions answered',                     count: 'Questions',  max: 10000, example: (n) => `Answer ${n} questions.` },
  areas_covered:        { label: 'Learning areas tried',                   count: 'Areas',      max: AREAS, example: (n) => `Answer questions in ${n} different learning areas.` },
  areas_secure:         { label: 'Learning areas at Secure or better',     count: 'Areas',      max: AREAS, example: (n) => `Reach "Secure" or better in ${n} learning areas.` },
  confident_run:        { label: 'Confident answers right in a row',       count: 'In a row',   max: 500,   example: (n) => `Get ${n} answers in a row right that you rated fairly sure or certain.` },
  calibrated:           { label: 'Well calibrated (confidence matches accuracy)', count: 'After answers', max: 10000,
    example: (n, b = 0.05) => `After ${n} answers, have your confidence within ${Math.round(b * 100)} points of your accuracy.` },
  changes_helped:       { label: 'Answers changed from wrong to right',    count: 'Changes',    max: 1000,  example: (n) => `Change ${n} answers from wrong to right.` },
  misconceptions_fixed: { label: 'Confident errors later put right',       count: 'Questions',  max: 1000,  example: (n) => `Get ${n} questions right that you previously got wrong while sure.` },
  week_streak:          { label: 'Weekly goal met, weeks running',         count: 'Weeks',      max: 104,   example: (n) => `Meet your weekly goal ${n} weeks running.` },
  questions_submitted:  { label: 'Questions written and submitted',        count: 'Questions',  max: 1000,  example: (n) => `Submit ${n} question${n === 1 ? '' : 's'} you wrote for review.` },
  questions_accepted:   { label: 'Written questions accepted',             count: 'Questions',  max: 1000,  example: (n) => `Have ${n} question${n === 1 ? '' : 's'} you wrote accepted into the bank.` },
  reflections:          { label: 'Reflections logged',                     count: 'Reflections', max: 1000, example: (n) => `Log ${n} reflection${n === 1 ? '' : 's'}.` },
  goal_plans:           { label: 'Goal plans created or revised',          count: 'Plans',      max: 20,    example: (n) => (n === 1 ? 'Create your goal plan.' : `Revise your goal plan ${n - 1} time${n === 2 ? '' : 's'}.`) },
  outcomes_covered:     { label: 'Outcome statements with evidence',       count: 'Statements', max: OUTCOMES, example: (n) => `Have evidence against ${n} of the ${OUTCOMES} outcome statements.` },
  level:                { label: 'Level reached',                          count: 'Level',      max: MAX_LEVEL, example: (n) => `Reach level ${n}.` },
  teams_joined:         { label: 'Teams joined',                           count: 'Teams',      max: 10,    example: () => 'Join a team.' },
  season_challenges:    { label: 'Season challenges completed',            count: 'Seasons',    max: 100,   example: (n) => `Complete ${n} season challenge${n === 1 ? '' : 's'}.` },
};

export interface AchievementInput { id: string; title: string; description: string; rule: AchievementRule; sort: number; active: boolean; national: boolean }

/** Checks an achievement from the admin editor. Returns field → message for anything wrong. */
export function achievementErrors(x: AchievementInput, opts: { isNew: boolean; existingIds?: string[] }): Record<string, string> {
  const e: Record<string, string> = {};
  if (opts.isNew) {
    if (!/^[a-z0-9-]{2,40}$/.test(x.id ?? '')) e.id = 'Use 2 to 40 lowercase letters, numbers or hyphens, e.g. "night-owl".';
    else if (opts.existingIds?.includes(x.id)) e.id = 'That ID is already used.';
  }
  const title = (x.title ?? '').trim(), desc = (x.description ?? '').trim();
  if (title.length < 2 || title.length > 60) e.title = 'Give it a title of 2 to 60 characters.';
  if (desc.length < 2 || desc.length > 200) e.description = 'Describe how to earn it in 2 to 200 characters.';
  const raw = x.rule as unknown as { type?: AchievementRule['type']; maxBias?: unknown } | undefined;
  if (!isAchievementRule(x.rule)) {
    if (!raw?.type || !ACHIEVEMENT_RULE_TYPES.includes(raw.type)) e.rule = 'Choose what it rewards.';
    else if (raw.type === 'calibrated' && typeof raw.maxBias !== 'number') e.maxBias = 'Set how close confidence must be to accuracy.';
    else e.n = 'Enter a whole number of at least 1.';
  } else {
    const info = ACHIEVEMENT_RULES[x.rule.type];
    if (x.rule.n > info.max) e.n = `At most ${info.max}.`;
    if (x.rule.type === 'calibrated' && (x.rule.maxBias < 0.01 || x.rule.maxBias > 0.3)) e.maxBias = 'Between 1 and 30 points.';
  }
  if (!Number.isInteger(x.sort) || x.sort < 0 || x.sort > 10000) e.sort = 'A whole number from 0 to 10000.';
  return e;
}

// ------------------------------------------------------------------ goal plan (onboarding)
export interface Goal { text: string; outcomes: string[] }
export interface GoalPlanInput { career_intent: string; strengths: string; concerns: string; learning_prefs: string; goals: Goal[]; setting_preference: string; pgy_level: number | null; img: boolean }
export const GOAL_LIMITS = { goals: 4, goalText: 200, careerIntent: 400, strengths: 1000, concerns: 1000, learningPrefs: 600 } as const;

/** Coerces an untrusted onboarding form into a goal plan. */
export function toGoalPlan(x: unknown): GoalPlanInput {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');
  const goals = (Array.isArray(o.goals) ? o.goals : []).slice(0, GOAL_LIMITS.goals).map((g) => {
    const r = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
    const outcomes = (Array.isArray(r.outcomes) ? r.outcomes : []).filter((c): c is string => typeof c === 'string' && OUTCOME_STATEMENTS.some((s) => s.code === c)).slice(0, 3);
    return { text: str(r.text, GOAL_LIMITS.goalText), outcomes: [...new Set(outcomes)] };
  }).filter((g) => g.text);
  const pgy = o.pgy_level === 1 || o.pgy_level === 2 ? o.pgy_level : null;
  return {
    career_intent: str(o.career_intent, GOAL_LIMITS.careerIntent), strengths: str(o.strengths, GOAL_LIMITS.strengths),
    concerns: str(o.concerns, GOAL_LIMITS.concerns), learning_prefs: str(o.learning_prefs, GOAL_LIMITS.learningPrefs),
    goals, setting_preference: ['rural', 'metro', 'any'].includes(o.setting_preference as string) ? (o.setting_preference as string) : 'any',
    pgy_level: pgy, img: o.img === true,
  };
}

export function goalPlanErrors(p: GoalPlanInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (p.goals.length < 1) e.goals = 'Set at least one goal for the next six months.';
  p.goals.forEach((g, i) => { if (g.text.length < 8) e[`goals.${i}`] = 'Say a little more about this goal.'; });
  if (!p.pgy_level) e.pgy_level = 'Choose PGY1 or PGY2.';
  return e;
}

/** Starting content set from the goal plan: learning areas that evidence the goals' outcome statements. */
export function recommendedAreas(goals: Goal[], limit = 4): string[] {
  const wanted = new Set(goals.flatMap((g) => g.outcomes));
  const scored = CURRICULUM.map((c) => ({ area: c.area, score: c.domains.filter((d) => wanted.has(d)).length, share: c.share }))
    .filter((c) => c.score > 0).sort((a, b) => b.score - a.score || b.share - a.share);
  return scored.slice(0, limit).map((c) => c.area);
}
