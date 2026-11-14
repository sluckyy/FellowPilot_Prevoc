import { checkOrigin, handle, json, readJson, requireApiUser } from '@/lib/http';
import { q } from '@/lib/db';
import { achievementErrors } from '@/lib/core';
import { listAchievements, toAchievementInput } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireApiUser('admin');
  return json({ achievements: await listAchievements(u.tenantId) });
});

/** Create an achievement. Body: { id, title, description, rule, sort, active, national } */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser('admin');
  const x = toAchievementInput(await readJson(req, 8 * 1024));
  const ids = (await q<{ id: string }>('SELECT id FROM achievement_def')).map((r) => r.id);
  const errors = achievementErrors(x, { isNew: true, existingIds: ids });
  if (Object.keys(errors).length) return json({ error: 'Check the highlighted fields', errors }, 400);
  await q(
    `INSERT INTO achievement_def (id, tenant_id, title, description, rule, sort, active, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [x.id, x.national ? null : u.tenantId, x.title.trim(), x.description.trim(), JSON.stringify(x.rule), x.sort, x.active, u.id]);
  await q('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)',
    [u.id, 'achievement_created', x.id, JSON.stringify(x)]);
  return json({ ok: true, id: x.id }, 201);
});
