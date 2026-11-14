import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { q } from '@/lib/db';
import { listSeasons, toSeasonInput } from '@/lib/seasons';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireApiUser('admin');
  return json({ seasons: await listSeasons(u.tenantId) });
});

/** Creates a season for this tenant (admins). */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser('admin');
  const { input, errors } = toSeasonInput(await readJson(req, 16 * 1024));
  if (Object.keys(errors).length) throw Object.assign(new HttpError(400, 'Check the highlighted fields'), { errors });
  const dup = await q('SELECT 1 FROM season WHERE id = $1', [input.id]);
  if (dup.length) throw Object.assign(new HttpError(409, 'That ID is already used'), { errors: { id: 'That ID is already used.' } });
  await q(
    `INSERT INTO season (id, tenant_id, title, theme, starts_on, ends_on, challenge, team_goal, focus_areas, active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [input.id, u.tenantId, input.title, input.theme, input.starts_on, input.ends_on, JSON.stringify(input.challenge), input.team_goal, input.focus_areas, input.active, u.id]);
  await q(`INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, 'season_created', $2, $3)`, [u.id, input.id, JSON.stringify(input)]);
  return json({ ok: true });
});
