import 'server-only';
import { one, q } from './db';
import type { CurrentUser } from './auth';
import { reflectionTags } from './reflections';
import { currentSeason, completedSeasons, seasonProgress, teamSeasonProgress, type Season, type SeasonProgress } from './seasons';
import { myTeam, type Team } from './teams';
import {
  achievementProgress, curriculumMap, isAchievementRule, levelFor, outcomeMap, pausedWeeks, progressFacts, weeklyStreak,
  xpFromAnswers, xpTotal, type AchievementDef, type AchievementProgress, type AnswerRow, type LevelState, type MapTile,
  type OutcomeTile, type PauseReason, type StreakState,
} from './core';
import { APP_VERSION } from './constants';

export interface EarnedAchievement extends AchievementProgress { earnedAt: Date | null; isNew: boolean }
export interface Pause { id: string; starts_on: string; ends_on: string; reason: PauseReason }

export interface Progress {
  goal: number;
  thisWeek: number;
  streak: StreakState;
  pauses: Pause[];
  level: LevelState;
  map: MapTile[];
  outcomes: OutcomeTile[];
  reflections: number;
  plans: number;
  season: { season: Season; mine: SeasonProgress; team: (SeasonProgress & { members: number }) | null } | null;
  team: Team | null;
  achievements: EarnedAchievement[];
  /** Earned but not yet seen on the Progress page. */
  unseen: EarnedAchievement[];
  /** Closest unfinished achievement, for a nudge on the home page. */
  next: EarnedAchievement | null;
}

/** Answers per week (Monday, Adelaide time), all attempts, and the current week's key. */
async function weeks(userId: string): Promise<{ byWeek: Record<string, number>; current: string }> {
  const [rows, cur] = await Promise.all([
    q<{ wk: string; n: string }>(
      `SELECT to_char(date_trunc('week', client_ts AT TIME ZONE 'Australia/Adelaide'), 'YYYY-MM-DD') AS wk, count(*) AS n
         FROM answer WHERE user_id = $1 GROUP BY 1`, [userId]),
    one<{ wk: string }>(`SELECT to_char(date_trunc('week', now() AT TIME ZONE 'Australia/Adelaide'), 'YYYY-MM-DD') AS wk`),
  ]);
  return { byWeek: Object.fromEntries(rows.map((r) => [r.wk, Number(r.n)])), current: cur!.wk };
}

async function definitions(tenantId: string): Promise<AchievementDef[]> {
  const rows = await q<AchievementDef & { rule: unknown }>(
    `SELECT id, title, description, rule, sort FROM achievement_def
      WHERE active AND (tenant_id IS NULL OR tenant_id = $1) ORDER BY sort, id`, [tenantId]);
  return rows.filter((r) => isAchievementRule(r.rule)) as AchievementDef[];
}

export async function listPauses(userId: string): Promise<Pause[]> {
  return q<Pause>(
    `SELECT id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, reason
       FROM streak_pause WHERE user_id = $1 AND ends_on >= (now() AT TIME ZONE 'Australia/Adelaide')::date - 120 ORDER BY starts_on DESC`, [userId]);
}

/**
 * Everything the Progress page, home page and set summary need. Records newly earned achievements and
 * level-ups as a side effect, so the earned date is when the trainee first reached it (to the nearest visit).
 */
export async function loadProgress(u: CurrentUser, rows: AnswerRow[]): Promise<Progress> {
  const [{ byWeek, current }, defs, counts, earnedRows, pauses, tags, plans, team, season, seasonsDone] = await Promise.all([
    weeks(u.id),
    definitions(u.tenantId),
    one<{ submitted: string; accepted: string }>(
      `SELECT count(*) FILTER (WHERE submitted_at IS NOT NULL) AS submitted, count(*) FILTER (WHERE status = 'accepted') AS accepted
         FROM draft_item WHERE author_id = $1`, [u.id]),
    q<{ achievement_id: string; earned_at: Date; seen_at: Date | null }>(
      'SELECT achievement_id, earned_at, seen_at FROM achievement_earned WHERE user_id = $1', [u.id]),
    q<{ starts_on: string; ends_on: string }>(
      `SELECT to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on FROM streak_pause WHERE user_id = $1`, [u.id]),
    reflectionTags(u.id),
    one<{ n: string }>('SELECT count(*) AS n FROM goal_plan WHERE user_id = $1', [u.id]),
    myTeam(u.id),
    currentSeason(u.tenantId),
    completedSeasons(u.tenantId, u.id),
  ]);
  const goal = u.weeklyGoal;
  const paused = pausedWeeks(pauses);
  const streak = weeklyStreak(byWeek, goal, current, paused);
  const weeksMet = Object.entries(byWeek).filter(([w, n]) => n >= goal && (w < current || n >= goal)).length;
  const planCount = Number(plans?.n ?? 0);
  const outcomes = outcomeMap(rows, tags);
  const xp = xpTotal({
    ...xpFromAnswers(rows), reflections: tags.length, goalPlans: Math.min(planCount, 1), checkins: Math.max(0, planCount - 1), weeksMet,
    questionsSubmitted: Number(counts?.submitted ?? 0), questionsAccepted: Number(counts?.accepted ?? 0), seasonChallenges: seasonsDone,
  });
  const level = levelFor(xp);
  const facts = progressFacts(rows, {
    bestWeekStreak: streak.best, questionsSubmitted: Number(counts?.submitted ?? 0), questionsAccepted: Number(counts?.accepted ?? 0),
    reflections: tags.length, goalPlans: planCount, outcomesCovered: outcomes.filter((o) => o.evidence > 0).length,
    level: level.level, teamsJoined: team ? 1 : 0, seasonChallenges: seasonsDone,
  });
  const earned = new Map(earnedRows.map((e) => [e.achievement_id, e]));

  const fresh = defs.map((d) => achievementProgress(d, facts)).filter((p) => p.done && !earned.has(p.def.id));
  if (fresh.length) {
    const ins = await q<{ achievement_id: string; earned_at: Date }>(
      `INSERT INTO achievement_earned (user_id, achievement_id) SELECT $1::uuid, unnest($2::text[])
       ON CONFLICT DO NOTHING RETURNING achievement_id, earned_at`, [u.id, fresh.map((p) => p.def.id)]);
    for (const e of ins) earned.set(e.achievement_id, { ...e, seen_at: null });
    await q(`INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
             SELECT gen_random_uuid(), 'achievement_earned', $1, $2, gen_random_uuid(), now(), $3, 'none', jsonb_build_object('achievement_id', a)
               FROM unnest($4::text[]) a`, [u.id, u.tenantId, APP_VERSION, ins.map((e) => e.achievement_id)]).catch((e) => console.error('achievement event', e));
  }

  const achievements: EarnedAchievement[] = defs.map((d) => {
    const p = achievementProgress(d, facts);
    const e = earned.get(d.id);
    // Once earned, always earned: show it complete even if the facts later dip (e.g. calibration drifts).
    return e
      ? { ...p, current: p.target, done: true, earnedAt: new Date(e.earned_at), isNew: !e.seen_at }
      : { ...p, done: false, earnedAt: null, isNew: false };
  });
  const open = achievements.filter((a) => !a.done && a.current > 0);
  const next = open.sort((a, b) => b.current / b.target - a.current / a.target)[0]
    ?? achievements.find((a) => !a.done) ?? null;

  const seasonState = season ? {
    season, mine: await seasonProgress(season, u.id), team: team ? await teamSeasonProgress(season, team.id) : null,
  } : null;

  return {
    goal, thisWeek: byWeek[current] ?? 0, streak, pauses: await listPauses(u.id), level, map: curriculumMap(rows), outcomes,
    reflections: tags.length, plans: planCount, season: seasonState, team, achievements,
    unseen: achievements.filter((a) => a.isNew), next,
  };
}

export async function markAchievementsSeen(userId: string): Promise<void> {
  await q('UPDATE achievement_earned SET seen_at = now() WHERE user_id = $1 AND seen_at IS NULL', [userId]);
}
