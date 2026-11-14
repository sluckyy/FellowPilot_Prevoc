import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { deleteReflection, updateReflection } from '@/lib/reflections';

export const dynamic = 'force-dynamic';
type Ctx = { params: { id: string } };
const UUID = /^[0-9a-f-]{36}$/i;

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  checkOrigin(req);
  const u = await requireApiUser();
  if (!UUID.test(ctx.params.id)) throw new HttpError(404, 'Not found');
  const b = await readJson<{ body?: unknown; tags?: unknown }>(req, 64 * 1024);
  if (!(await updateReflection(u, ctx.params.id, b))) throw new HttpError(404, 'Reflection not found');
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  checkOrigin(req);
  const u = await requireApiUser();
  if (!UUID.test(ctx.params.id) || !(await deleteReflection(u, ctx.params.id))) throw new HttpError(404, 'Reflection not found');
  return json({ ok: true });
});
