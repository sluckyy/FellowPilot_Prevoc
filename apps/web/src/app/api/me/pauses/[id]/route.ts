import { checkOrigin, handle, json, requireApiUser, HttpError } from '@/lib/http';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const DELETE = handle(async (req: Request, ctx: { params: { id: string } }) => {
  checkOrigin(req);
  const u = await requireApiUser();
  if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id)) throw new HttpError(404, 'Not found');
  const r = await q('DELETE FROM streak_pause WHERE id = $1 AND user_id = $2 RETURNING id', [ctx.params.id, u.id]);
  if (!r.length) throw new HttpError(404, 'Pause not found');
  return json({ ok: true });
});
