import 'server-only';
import { q } from './db';
import type { AchievementInput, AchievementRule } from './core';

export interface AdminAchievement {
  id: string; title: string; description: string; rule: AchievementRule; sort: number; active: boolean;
  national: boolean; earned: number; updated_at: Date; updated_by_name: string | null;
}

/** National achievements plus this state's own, with how many people have earned each. */
export async function listAchievements(tenantId: string): Promise<AdminAchievement[]> {
  const rows = await q<AdminAchievement & { earned: string }>(
    `SELECT d.id, d.title, d.description, d.rule, d.sort, d.active, d.tenant_id IS NULL AS national, d.updated_at,
            p.display_name AS updated_by_name,
            (SELECT count(*) FROM achievement_earned e JOIN app_user u ON u.id = e.user_id
              WHERE e.achievement_id = d.id AND u.tenant_id = $1) AS earned
       FROM achievement_def d LEFT JOIN user_profile p ON p.user_id = d.updated_by
      WHERE d.tenant_id IS NULL OR d.tenant_id = $1
      ORDER BY d.sort, d.id`, [tenantId]);
  return rows.map((r) => ({ ...r, earned: Number(r.earned) }));
}

/** Untrusted request body → input for achievementErrors(). */
export function toAchievementInput(b: unknown): AchievementInput {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const r = (o.rule && typeof o.rule === 'object' ? o.rule : {}) as Record<string, unknown>;
  const rule = { type: String(r.type ?? ''), n: Number(r.n), ...(r.type === 'calibrated' ? { maxBias: Number(r.maxBias) } : {}) };
  return {
    id: typeof o.id === 'string' ? o.id.trim() : '',
    title: typeof o.title === 'string' ? o.title.slice(0, 200) : '',
    description: typeof o.description === 'string' ? o.description.slice(0, 500) : '',
    rule: rule as AchievementRule,
    sort: Number(o.sort),
    active: o.active !== false,
    national: o.national === true,
  };
}
