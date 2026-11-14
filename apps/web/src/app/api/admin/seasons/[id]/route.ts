import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { q } from '@/lib/db';
import { toSeasonInput } from '@/lib/seasons';

export const dynamic = 'force-dynamic';

export const PUT = handle(async (req: Request, ctx: { params: { id: string } }) => {
  checkOrigin(req);
  const u = await requireApiUser('admin');
  const body = (await readJson<Record<string, unknown>>(req, 16 * 1024)) ?? {};
  const { input, errors } = toSeasonInput({ ...body, id: ctx.params.id });
  if (Object.keys(errors).length) throw Object.assign(new HttpError(400, 'Check the highlighted fields'), { errors });
  const r = await q(
    `UPDATE season SET title = $3, theme = $4, starts_on = $5, ends_on = $6, challenge = $7, team_goal = $8, focus_areas = $9, active = $10, updated_at = now()
      WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [input.id, u.tenantId, input.title, input.theme, input.starts_on, input.ends_on, JSON.stringify(input.challenge), input.team_goal, input.focus_areas, input.active]);
  if (!r.length) throw new HttpError(404, 'Season not found');
  await q(`INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, 'season_updated', $2, $3)`, [u.id, input.id, JSON.stringify(input)]);
  return json({ ok: true });
});
