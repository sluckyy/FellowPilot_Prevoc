import 'server-only';
import { one, q, tx } from './db';
import { APP_VERSION } from './constants';
import { recommendedAreas, type Goal, type GoalPlanInput } from './core';
import type { CurrentUser } from './auth';

export interface GoalPlan {
  version: number; career_intent: string; strengths: string; concerns: string; learning_prefs: string;
  goals: Goal[]; checkin_due: string; created_at: Date;
}

export async function currentPlan(userId: string): Promise<GoalPlan | null> {
  return one<GoalPlan>(
    `SELECT version, career_intent, strengths, concerns, learning_prefs, goals, to_char(checkin_due, 'YYYY-MM-DD') AS checkin_due, created_at
       FROM goal_plan WHERE user_id = $1 ORDER BY version DESC LIMIT 1`, [userId]);
}

export async function planCount(userId: string): Promise<number> {
  const r = await one<{ n: string }>('SELECT count(*) AS n FROM goal_plan WHERE user_id = $1', [userId]);
  return Number(r?.n ?? 0);
}

/** Saves a new plan version (first = onboarding, later = six-month check-in) and the trainee's preferences. */
export async function savePlan(u: CurrentUser, p: GoalPlanInput): Promise<{ version: number; recommended: string[]; checkinDue: string }> {
  return tx(async (c) => {
    const prev = await c.query<{ v: number }>('SELECT coalesce(max(version), 0) AS v FROM goal_plan WHERE user_id = $1', [u.id]);
    const version = Number(prev.rows[0].v) + 1;
    const r = await c.query<{ due: string }>(
      `INSERT INTO goal_plan (user_id, version, career_intent, strengths, concerns, learning_prefs, goals, checkin_due)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (now() AT TIME ZONE 'Australia/Adelaide')::date + interval '6 months')
       RETURNING to_char(checkin_due, 'YYYY-MM-DD') AS due`,
      [u.id, version, p.career_intent, p.strengths, p.concerns, p.learning_prefs, JSON.stringify(p.goals)]);
    await c.query('UPDATE app_user SET pgy_level = $2, setting_preference = $3, img = $4 WHERE id = $1', [u.id, p.pgy_level, p.setting_preference, p.img]);
    await c.query(
      `INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
       VALUES (gen_random_uuid(), $5, $1, $2, gen_random_uuid(), now(), $3, 'none', $4)`,
      [u.id, u.tenantId, APP_VERSION, JSON.stringify({ version, goals: p.goals.length, outcomes: p.goals.flatMap((g) => g.outcomes) }),
        version === 1 ? 'goal_plan_created' : 'checkin_completed']);
    return { version, recommended: recommendedAreas(p.goals), checkinDue: r.rows[0].due };
  });
}
