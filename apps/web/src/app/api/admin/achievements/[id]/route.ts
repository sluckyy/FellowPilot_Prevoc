import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { one, q } from '@/lib/db';
import { achievementErrors } from '@/lib/core';
import { toAchievementInput } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

/**
 * Update an achievement. The ID never changes. Changing the rule doesn't take it away from anyone who
 * already earned it. Body: { title, description, rule, sort, active, national }
 */
export const PUT = handle(async (req: Request, ctx: { params: { id: string } }) => {
  checkOrigin(req);
  const u = await requireApiUser('admin');
  const before = await one<{ id: string; tenant_id: string | null }>('SELECT id, tenant_id FROM achievement_def WHERE id = $1', [ctx.params.id]);
  // Another state's own achievements are theirs to edit.
  if (!before || (before.tenant_id && before.tenant_id !== u.tenantId)) throw new HttpError(404, 'Achievement not found');
  const x = { ...toAchievementInput(await readJson(req, 8 * 1024)), id: before.id };
  const errors = achievementErrors(x, { isNew: false });
  if (Object.keys(errors).length) return json({ error: 'Check the highlighted fields', errors }, 400);
  await q(
    `UPDATE achievement_def SET tenant_id = $2, title = $3, description = $4, rule = $5, sort = $6, active = $7,
            updated_at = now(), updated_by = $8 WHERE id = $1`,
    [x.id, x.national ? null : u.tenantId, x.title.trim(), x.description.trim(), JSON.stringify(x.rule), x.sort, x.active, u.id]);
  await q('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)',
    [u.id, 'achievement_updated', x.id, JSON.stringify(x)]);
  return json({ ok: true });
});
